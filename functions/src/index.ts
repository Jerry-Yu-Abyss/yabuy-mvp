// functions/src/index.ts
// 管理員 Custom Claim 設定。創辦人可把任何人設為/取消管理員；其他現有管理員亦可。
// firebase-functions v2 + TypeScript

import {onCall, HttpsError} from "firebase-functions/v2/https";
import {
  onDocumentCreated,
  onDocumentUpdated,
} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";

admin.initializeApp();

// 創辦人 email：永遠擁有最高權限，可授權他人
const FOUNDER_EMAIL = "reso950211zxc@gmail.com";

export const addAdminRole = onCall(async (request) => {
  const caller = request.auth;
  if (!caller) {
    throw new HttpsError("unauthenticated", "請先登入再操作。");
  }

  const callerEmail = (caller.token.email as string) || "";
  const callerIsFounder = callerEmail === FOUNDER_EMAIL;
  // 呼叫者必須是創辦人，或本身已是管理員（管理員僅能確認自己，見下方）
  const callerIsAdmin = callerIsFounder || caller.token.admin === true;
  if (!callerIsAdmin) {
    throw new HttpsError("permission-denied", "只有管理員可以執行此操作。");
  }

  const data = (request.data || {}) as { email?: string; makeAdmin?: boolean };
  const targetEmail = data.email;
  const makeAdmin = data.makeAdmin !== false; // 預設 true；傳 false 則取消管理員

  // 沒帶 email → 把「自己」設為管理員（給創辦人第一次 bootstrap / 確認權限用）
  if (!targetEmail) {
    // 只有創辦人能透過此通道取得 admin；一般人即使呼叫也不會被設為管理員
    if (!callerIsFounder) {
      throw new HttpsError("permission-denied", "只有創辦人能取得管理員權限。");
    }
    await admin.auth().setCustomUserClaims(caller.uid, {
      admin: true,
      founder: true,
    });
    await admin.firestore().collection("users").doc(caller.uid)
      .set({isAdmin: true, isFounder: true}, {merge: true});
    return {message: "歡迎回來，創辦人！最高權限已確認。", uid: caller.uid, admin: true};
  }

  // 新增/取消「他人」的管理員權限 → 僅限創辦人
  if (!callerIsFounder) {
    throw new HttpsError("permission-denied", "只有創辦人可以新增或取消管理員。");
  }

  // 安全保護：不可取消創辦人的權限
  if (targetEmail === FOUNDER_EMAIL && makeAdmin === false) {
    throw new HttpsError("permission-denied", "不可取消創辦人的管理員權限。");
  }

  // 把指定 email 的使用者設為/取消管理員
  const targetUser = await admin.auth().getUserByEmail(targetEmail);
  await admin.auth().setCustomUserClaims(targetUser.uid, {admin: makeAdmin});
  // 鏡像一份 isAdmin 到 Firestore 用戶文件（僅供後台列表顯示，安全仍以 claim 為準）
  await admin.firestore().collection("users").doc(targetUser.uid)
    .set({isAdmin: makeAdmin}, {merge: true});

  return {
    message: makeAdmin ?
      `已將 ${targetEmail} 設為管理員。` :
      `已取消 ${targetEmail} 的管理員權限。`,
    uid: targetUser.uid,
    admin: makeAdmin,
  };
});

// ── 補齊缺失的 users 文件 ──
// 背景：Landing.vue 的 Google 登入曾漏呼叫 upsertUserDoc（2026-07-09 Landing
// 上線起到修復為止），期間用 Google 註冊的帳號只存在於 Firebase Auth，
// Firestore 的 users collection 沒有對應文件。前端修好後，這些人只要再登入
// 一次就會自動補建檔，但「從此不再回來」的使用者會永久缺資料，導致 Auth 與
// Firestore 兩邊數量對不上。這支函式把那些孤兒帳號一次補齊。
//
// 只補「不存在」的文件，已存在的一律不動，所以重複執行是安全的。

// 與前端 verify.js 的 resolveVerifyStatus 同一套判定，避免兩邊標準不一致：
// emailVerified 為 false 一律 not_yet（不因綁過 Google 就跳過）
const resolveVerifyStatus = (user: admin.auth.UserRecord): string => {
  if (!user.emailVerified) return "not_yet";
  const isGoogle = user.providerData
    .some((p) => p.providerId === "google.com");
  return isGoogle ? "google" : "email";
};

export const backfillUserDocs = onCall(async (request) => {
  const caller = request.auth;
  if (!caller) {
    throw new HttpsError("unauthenticated", "請先登入再操作。");
  }
  // 這支會大量寫入 users collection，限創辦人本人執行
  const callerEmail = (caller.token.email as string) || "";
  if (callerEmail !== FOUNDER_EMAIL) {
    throw new HttpsError("permission-denied", "只有創辦人可以執行資料補齊。");
  }

  const data = (request.data || {}) as { dryRun?: boolean };
  // 預設為試跑：先看看會補哪些人，確認無誤再帶 dryRun:false 真的寫入
  const dryRun = data.dryRun !== false;

  const db = admin.firestore();
  const created: { uid: string; email: string }[] = [];
  let authTotal = 0;
  let existingTotal = 0;

  // listUsers 一次最多 1000 筆，用 pageToken 逐頁掃完
  let pageToken: string | undefined = undefined;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    authTotal += page.users.length;

    for (const user of page.users) {
      const ref = db.collection("users").doc(user.uid);
      const snap = await ref.get();
      if (snap.exists) {
        existingTotal++;
        continue;
      }

      created.push({uid: user.uid, email: user.email || ""});
      if (dryRun) continue;

      // createdAt/lastLogin 用 Auth 記錄的真實時間，不要用「現在」，
      // 否則補建的帳號看起來像今天才註冊，統計與排序都會失真
      const creationTime = user.metadata.creationTime;
      const lastSignInTime = user.metadata.lastSignInTime;

      await ref.set({
        id: user.uid,
        displayName: user.displayName ||
          user.email?.split("@")[0] || "校園用戶",
        email: user.email || "",
        photoURL: user.photoURL || "",
        status: "active",
        verify: resolveVerifyStatus(user),
        createdAt: creationTime ?
          admin.firestore.Timestamp.fromDate(new Date(creationTime)) :
          FieldValue.serverTimestamp(),
        lastLogin: lastSignInTime ?
          admin.firestore.Timestamp.fromDate(new Date(lastSignInTime)) :
          FieldValue.serverTimestamp(),
        backfilled: true, // 標記為補建，方便日後追查來源
      });
    }

    pageToken = page.pageToken;
  } while (pageToken);

  return {
    dryRun,
    authTotal,
    existingTotal,
    missingTotal: created.length,
    missing: created,
    message: dryRun ?
      `試跑：Auth 共 ${authTotal} 人，其中 ${created.length} 人缺少 ` +
        "Firestore 資料（本次未寫入）。" :
      `已補齊 ${created.length} 筆使用者資料，Auth 共 ${authTotal} 人。`,
  };
});

// ── 排行榜統計（跨用戶聚合，改走後端）──
// 背景：firestore.rules 把 orders 收緊成只有買家/賣家/管理員能讀，原本
// Ranking.vue 直接在前端 getDocs(collection(db,'orders')) 撈全站訂單、
// 在瀏覽器裡即時運算聚合值——這代表任何登入者都能在 devtools 看到全站
// 「已完成」訂單的原始欄位（buyerId/sellerId/finalPrice）。排行榜只需要
// 聚合後的數字，不需要原始訂單資料，因此改成這支 Cloud Function 用
// Admin SDK 在伺服器端算好聚合值才回傳，front end 拿不到任何一筆原始訂單。
//
// 學院清單需與 src/components/Subject.js 的 subjectData 保持同步（那邊才是
// 真正的來源，這裡只是聚合用，兩邊分開維護，改動學院清單記得兩邊都要改）。
const RANKING_COLLEGES = [
  "醫學暨健康學院",
  "資訊電機學院",
  "管理暨社會科學學院",
  "創意設計學院",
  "護理學院",
];

const toMillis = (ts: admin.firestore.Timestamp | undefined): number | null => {
  if (!ts) return null;
  return ts.toMillis();
};

export const getRankingStats = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "請先登入再操作。");
  }

  const db = admin.firestore();
  const [ordersSnap, usersSnap, productsSnap] = await Promise.all([
    db.collection("orders").get(),
    db.collection("users").get(),
    db.collection("products").get(),
  ]);

  const orders = ordersSnap.docs.map((d) => d.data());
  const users: Array<{id: string} & admin.firestore.DocumentData> =
    usersSnap.docs.map((d) => ({id: d.id, ...d.data()}));
  const products = productsSnap.docs.map((d) => d.data());

  const overview = {
    activeProducts: products.filter((p) => p.status === "active").length,
    totalUsers: users.length,
  };

  const userCollege: Record<string, string> = {};
  const userName: Record<string, string> = {};
  users.forEach((u) => {
    userCollege[u.id] = (u.college as string) || "";
    userName[u.id] = (u.displayName as string) || "匿名同學";
  });

  // ── 各學院註冊人數（即時現況）──
  const collegeUserCount: Record<string, number> = {};
  RANKING_COLLEGES.forEach((c) => {
    collegeUserCount[c] = 0;
  });
  let usersNoCollege = 0;
  users.forEach((u) => {
    const college = u.college as string | undefined;
    if (college && collegeUserCount[college] != null) {
      collegeUserCount[college]++;
    } else {
      usersNoCollege++;
    }
  });

  const completed = orders.filter((o) => o.status === "completed");

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    .getTime();
  const thisMonth = completed.filter((o) => {
    const t = toMillis(o.updatedAt) ?? toMillis(o.createdAt);
    return t != null && t >= monthStart && t < monthEnd;
  });

  // ── 院所交易排行（雙方都算一次；雙方皆無學院則計入 unattributed）──
  const collegeOrderCount: Record<string, number> = {};
  RANKING_COLLEGES.forEach((c) => {
    collegeOrderCount[c] = 0;
  });
  let unattributed = 0;
  thisMonth.forEach((o) => {
    const bc = userCollege[o.buyerId as string];
    const sc = userCollege[o.sellerId as string];
    if (bc && collegeOrderCount[bc] != null) collegeOrderCount[bc]++;
    if (sc && collegeOrderCount[sc] != null) collegeOrderCount[sc]++;
    if (!bc && !sc) unattributed++;
  });

  // ── 本月買賣數量前 10 ──
  const tally: Record<string, number> = {};
  const bump = (uid?: string) => {
    if (!uid) return;
    tally[uid] = (tally[uid] || 0) + 1;
  };
  thisMonth.forEach((o) => {
    bump(o.buyerId as string);
    bump(o.sellerId as string);
  });
  const topUsers = Object.entries(tally)
    .map(([uid, total]) => ({uid, total, name: userName[uid] || "已離開的用戶"}))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  // ── 循環利用累計（不限本月）──
  const amount = completed.reduce(
    (sum, o) => sum + (Number(o.finalPrice) || Number(o.productPrice) || 0),
    0
  );
  const participants = new Set<string>();
  completed.forEach((o) => {
    if (o.buyerId) participants.add(o.buyerId as string);
    if (o.sellerId) participants.add(o.sellerId as string);
  });

  return {
    overview,
    collegeUserCount,
    usersNoCollege,
    collegeOrderCount,
    unattributed,
    topUsers,
    cumulative: {
      items: completed.length,
      amount,
      participants: participants.size,
      avg: completed.length ? Math.round(amount / completed.length) : 0,
    },
  };
});

// ── 尚未登入也看得到的公開統計（Landing.vue 用）──
// 安全設計：故意不用 request.auth 判斷、也不接受呼叫者傳入任何參數——
// 這支函式無論誰呼叫，能拿到的東西永遠固定是「兩個整數」，不可能被拿來
// 挖出任何一筆使用者或訂單的原始資料。用 Firestore 的 count() 聚合查詢，
// 伺服器端甚至不會把任何一份文件內容載進函式的記憶體，只回傳筆數。
export const getPublicStats = onCall(async () => {
  const db = admin.firestore();
  const [usersCount, completedOrdersCount] = await Promise.all([
    db.collection("users").count().get(),
    db.collection("orders").where("status", "==", "completed").count().get(),
  ]);

  return {
    totalUsers: usersCount.data().count,
    circulatedItems: completedOrdersCount.data().count,
  };
});

// ── 評分彙總（reviews → users.ratingSum / ratingCount）──
// 背景：原本 Deal.vue 直接對「被評價者」的 users 文件寫
// ratingSum: increment(n)，而 firestore.rules 有一條「只要這次更新
// hasOnly(['ratingSum','ratingCount']) 就放行」的分支——沒有限制對象、
// 沒有限制數值、也沒有要求真的發生過交易。任何登入者打開 devtools 就能
// 把自己刷成滿分，或把別人的評分設成 0，前端的 increment() 只是自律。
//
// 現在前端一律不可寫這兩個欄位（規則已移除該分支），改由這支 trigger 用
// Admin SDK 累加。「有沒有資格評分」的把關全部集中在 reviews 的建立條件：
// 必須是該筆 completed 訂單的當事人、評的是對面那個人、一筆訂單只能評一次
// （文件 id 固定為 `${orderId}_${raterId}`）、星等必須是 1..5 的整數。
export const onReviewCreated = onDocumentCreated(
  "reviews/{reviewId}",
  async (event) => {
    const review = event.data?.data();
    if (!review) return;

    const ratedId = review.ratedId as string | undefined;
    const stars = Number(review.stars);

    // 規則已經擋過一次；這裡再擋一次，因為 Admin SDK 的寫入不經過規則，
    // 日後若有腳本補資料，不該讓髒資料直接汙染彙總值。
    if (!ratedId || !Number.isInteger(stars) || stars < 1 || stars > 5) {
      console.warn("略過無效評價", event.params.reviewId, {ratedId, stars});
      return;
    }

    await admin.firestore().collection("users").doc(ratedId).set({
      ratingSum: FieldValue.increment(stars),
      ratingCount: FieldValue.increment(1),
    }, {merge: true});
  }
);

// ── 逾期紀錄 ──────────────────────────────────────────────────────
// 訂單被判逾期關閉時，記一次給「該回應卻沒回應的那一方」。
//
// 為什麼非得放伺服器端：前端寫不了別人的 users 文件（規則只允許本人改自己
// 的），而這裡要扣的正是對方的次數。連帶地，四個計數欄位都被列進 users 的
// update／create 不可竄改清單——只有這支 trigger 用 Admin SDK 寫得動，否則
// 被記次的人只要把數字改回 0 就能繞過發起交易的閘門。
//
// 分成兩組計數，因為兩件事的嚴重性不同，各給 3 次容忍：
//   expireCount  約好了卻沒出現。判準是沒按下安全交易（buyerReady /
//                sellerReady）。兩邊都沒按時誰都不記——見下面 onOrderExpired
//                裡的說明。
//   noReplyCount 收到請求後從頭到尾沒回應。pending 是賣家沒回；
//                negotiating 是「不是最後動作者」的那一方沒回。
// 第三組 cancelCount（主動取消）在 onOrderCancelled，週期與門檻共用同一套。
const OFFENCE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

// 三組計數都是同一套「30 天內累加、跨期歸零重算」，共用這支。
// 用交易而不是單純 increment：跨週期要歸零，得先讀到現值才知道該歸零還是
// 累加，讀寫之間必須是原子的。
const bumpOffence = (
  uid: string,
  field: "expireCount" | "noReplyCount" | "cancelCount",
  periodField:
    | "expirePeriodStart"
    | "noReplyPeriodStart"
    | "cancelPeriodStart",
) => {
  const db = admin.firestore();
  return db.runTransaction(async (tx) => {
    const ref = db.collection("users").doc(uid);
    const snap = await tx.get(ref);
    const data = snap.data() || {};
    const startMs = data[periodField]?.toMillis?.() ?? null;
    const periodOver =
      startMs === null || Date.now() - startMs > OFFENCE_PERIOD_MS;

    tx.set(ref, periodOver ? {
      [field]: 1,
      [periodField]: FieldValue.serverTimestamp(),
    } : {
      [field]: FieldValue.increment(1),
    }, {merge: true});
  });
};

// 未回應要記次，訂單至少得存在這麼久——買家可以把面交時間填在半小時後，
// 賣家根本來不及看到就逾期了。沒有這道下限，惡意買家連送三筆「馬上就要」
// 的請求再自己關掉，就能把一個賣家刷到禁止發起交易。
// 「沒出現」不設這道門檻：那是雙方都同意過時間之後的失約，與前置時間無關。
const NO_REPLY_MIN_AGE_MS = 12 * 60 * 60 * 1000;

export const onOrderExpired = onDocumentUpdated(
  "orders/{orderId}",
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    // 只在「這一次更新把它變成 expired」時記次，避免同一筆訂單重複計算
    if (before.status === "expired" || after.status !== "expired") return;

    const buyerId = typeof after.buyerId === "string" ? after.buyerId : null;
    const sellerId = typeof after.sellerId === "string" ? after.sellerId : null;

    // 記在哪個欄位、記給誰，取決於「逾期前它停在哪一個狀態」
    let field: "expireCount" | "noReplyCount";
    let periodField: "expirePeriodStart" | "noReplyPeriodStart";
    const offenders: string[] = [];

    if (before.status === "accepted") {
      field = "expireCount";
      periodField = "expirePeriodStart";
      const buyerNoShow = after.buyerReady !== true;
      const sellerNoShow = after.sellerReady !== true;

      // 兩邊都沒按下安全交易時誰都不記。按鈕在約定時間前 10 分鐘就開放、人在
      // 家裡也按得下去，所以「有按」本來就不是到場的鐵證；但「兩邊都沒按」連
      // 一點紀錄差異都沒有，唯一能確定的是這場面交沒發生，確定不了是誰放的鳥。
      // 兩邊各記一次等於把責任平均攤給準時到場卻沒按按鈕的那個人。
      if (buyerNoShow && sellerNoShow) {
        console.log("雙方都沒按安全交易，不記爽約", event.params.orderId);
        return;
      }

      if (buyerNoShow && buyerId) offenders.push(buyerId);
      if (sellerNoShow && sellerId) offenders.push(sellerId);
    } else if (before.status === "pending" || before.status === "negotiating") {
      field = "noReplyCount";
      periodField = "noReplyPeriodStart";

      const createdMs = after.createdAt?.toMillis?.() ?? null;
      if (createdMs !== null && Date.now() - createdMs < NO_REPLY_MIN_AGE_MS) {
        console.log("訂單存在不滿 12 小時，不記未回應", event.params.orderId);
        return;
      }

      if (before.status === "pending") {
        // 買家發起、賣家從未回應
        if (sellerId) offenders.push(sellerId);
      } else {
        // 協商中：最後動作者已經表態了，沒回的是另一邊
        const waitingOn = after.lastActionBy === "buyer" ? sellerId : buyerId;
        if (waitingOn) offenders.push(waitingOn);
      }
    } else {
      return;
    }

    if (offenders.length === 0) return;

    await Promise.all(offenders.map((uid) =>
      bumpOffence(uid, field, periodField)
    ));

    console.log("逾期記次", event.params.orderId, field, offenders);
  }
);

// ── 取消計次 ──────────────────────────────────────────────────────
// 主動取消交易的人記一次 cancelCount。
//
// 這個計數原本是 Mailbox.vue 自己寫進 users/{uid} 的。那時它只用來擋「還能不
// 能再取消」，前端說了算還過得去；現在它同時擋「能不能發起新交易」，前端寫的
// 數字就不能信了——任何人改自己的 users 文件把它歸零就繞過閘門。所以搬來這裡
// 用 Admin SDK 寫，users 規則把 cancelCount / cancelPeriodStart 一併列入本人
// 不可竄改的清單。
//
// 賣家婉拒不算：pending / negotiating 時賣家按「婉拒」與買家按「取消」都落到
// rejected，但婉拒是賣家對一筆還沒談成的請求說不，本來就沒扣過額度。
// 誰動的手看 lastActionBy，firestore.rules 的 cancelActorOk() 保證轉成
// rejected 時它一定等於操作者本人，否則寫不進去。
export const onOrderCancelled = onDocumentUpdated(
  "orders/{orderId}",
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    if (before.status === "rejected" || after.status !== "rejected") return;

    const actor = after.lastActionBy;
    if (actor !== "buyer" && actor !== "seller") return;

    // 還沒談成的請求被賣家婉拒——不是取消，不記次
    if (before.status !== "accepted" && actor === "seller") return;

    const uid = actor === "buyer" ? after.buyerId : after.sellerId;
    if (typeof uid !== "string" || !uid) return;

    // 交易功能維護中的取消不計次：那不是使用者「決定不交易」，是系統把他推
    // 出去的。維護期間取消是唯一還開著的出口（firestore.rules 的
    // maintenanceAllows()），額度用完的人也得走得掉，前端因此一併拿掉額度檢查。
    const settings = await admin.firestore()
      .collection("settings").doc("trade").get();
    if (settings.data()?.maintenance === true) {
      console.log("維護中的取消不記次", event.params.orderId);
      return;
    }

    await bumpOffence(uid, "cancelCount", "cancelPeriodStart");
    console.log("取消記次", event.params.orderId, actor, uid);
  }
);

// ── 商品完全刪除（管理端商品巡邏）────────────────────────────────
// 巡邏刪掉一件不合適的商品時，原本只刪 products 那一份文件，商品在系統其他
// 地方留下的分身都還在：別人的喜愛清單、雙方信箱裡的訂單、「已買入」與「已賣出」
// 的成交紀錄，都是各自獨立的文件，不會因為 products 少一份而跟著消失。使用者
// 看到的就是一張點不進去的鬼卡片，管理員以為刪乾淨了其實沒有。
//
// 為什麼非得放伺服器端：這些文件的規則本來就不讓管理員動——favorites 只有本人
// 讀得到、也只有本人刪得掉（管理員連列都列不出來），orders 更是誰都不能刪
// （delete: if false）。要讓管理端刪得動，要嘛把規則放寬成「管理員可以刪任何人
// 的收藏與訂單」再靠前端自律只在巡邏時用，要嘛集中在這支帶 Admin SDK 的
// callable。選後者：權限只存在於這一支函式裡，範圍是「這個 productId 的相關
// 文件」，沒有第二種用法。
//
// 稽核紀錄（audit_logs）刻意不刪：那是這次刪除本身的證據，刪掉就查不到是誰在
// 什麼時候、用什麼理由刪的。
export const purgeProduct = onCall(async (request) => {
  const caller = request.auth;
  if (!caller) {
    throw new HttpsError("unauthenticated", "請先登入再操作。");
  }
  const callerIsFounder = (caller.token.email as string) === FOUNDER_EMAIL;
  if (!(callerIsFounder || caller.token.admin === true)) {
    throw new HttpsError("permission-denied", "只有管理員可以刪除商品。");
  }

  const data = (request.data || {}) as { productId?: string; reason?: string };
  const productId = typeof data.productId === "string" ? data.productId : "";
  if (!productId) {
    throw new HttpsError("invalid-argument", "缺少 productId。");
  }

  const db = admin.firestore();
  const productRef = db.collection("products").doc(productId);
  const productSnap = await productRef.get();
  const product = productSnap.data() || {};
  const productName = (product.name as string) || "商品";

  const [favSnap, orderSnap] = await Promise.all([
    db.collection("favorites").where("productId", "==", productId).get(),
    db.collection("orders").where("productId", "==", productId).get(),
  ]);

  // 訊息與評價掛在訂單上，不是掛在商品上，所以要先知道有哪些訂單才查得到。
  // 「in」查詢一次最多 30 個值，訂單多的商品要分批問。
  const orderIds = orderSnap.docs.map((d) => d.id);
  const chunks: string[][] = [];
  for (let i = 0; i < orderIds.length; i += 30) {
    chunks.push(orderIds.slice(i, i + 30));
  }
  const linked = await Promise.all(chunks.flatMap((ids) => [
    db.collection("messages").where("orderId", "in", ids).get(),
    db.collection("reviews").where("orderId", "in", ids).get(),
  ]));

  const writer = db.bulkWriter();

  // BulkWriter 預設會吞掉最後失敗的那幾筆，而「以為刪乾淨了、其實沒有」正是
  // 這支函式要解決的問題。重試三次仍失敗就記下來，最後整批回報成錯誤。
  const failures: string[] = [];
  writer.onWriteError((err) => {
    if (err.failedAttempts < 3) return true;
    failures.push(err.documentRef.path);
    return false;
  });

  let linkedCount = 0;
  linked.forEach((snap) => snap.docs.forEach((d) => {
    linkedCount++;
    writer.delete(d.ref);
  }));
  favSnap.docs.forEach((d) => writer.delete(d.ref));
  orderSnap.docs.forEach((d) => writer.delete(d.ref));
  writer.delete(productRef);

  // 還沒走完的交易被連帶刪掉時要告訴買家一聲。約好的面交突然從信箱消失、
  // 人卻還準備赴約，比商品被下架本身更難處理。已完成／已取消的就不再打擾。
  const LIVE = ["pending", "negotiating", "accepted"];
  const affectedBuyers = new Set<string>();
  orderSnap.docs.forEach((d) => {
    const o = d.data();
    if (LIVE.includes(o.status) && typeof o.buyerId === "string" && o.buyerId) {
      affectedBuyers.add(o.buyerId);
    }
  });
  const reason = typeof data.reason === "string" ? data.reason.trim() : "";
  affectedBuyers.forEach((uid) => {
    writer.create(db.collection("notifications").doc(), {
      type: "warning",
      title: `交易已取消：${productName}`,
      content: `您預約的商品「${productName}」已被管理員移除，這筆交易已同時取消。` +
        (reason ? `\n📌 移除原因：${reason}` : "") +
        "\n這次取消不會計入您的取消額度，也不會留下爽約紀錄。",
      target: uid,
      sender: "YaBuy 管理團隊",
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  await writer.close();

  if (failures.length) {
    console.error("商品刪除有殘留", productId, failures);
    const sample = failures.slice(0, 3).join("、");
    throw new HttpsError(
      "internal",
      `有 ${failures.length} 份關聯資料沒刪成功（${sample}），請重試一次。`,
    );
  }

  const result = {
    productName,
    sellerId: (product.sellerId as string) || "",
    favorites: favSnap.size,
    orders: orderSnap.size,
    linked: linkedCount,
    notifiedBuyers: affectedBuyers.size,
  };
  console.log("商品完全刪除", productId, result);
  return result;
});
