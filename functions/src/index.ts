// functions/src/index.ts
// 管理員 Custom Claim 設定。創辦人可把任何人設為/取消管理員；其他現有管理員亦可。
// firebase-functions v2 + TypeScript

import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

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
          admin.firestore.FieldValue.serverTimestamp(),
        lastLogin: lastSignInTime ?
          admin.firestore.Timestamp.fromDate(new Date(lastSignInTime)) :
          admin.firestore.FieldValue.serverTimestamp(),
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
