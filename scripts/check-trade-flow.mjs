#!/usr/bin/env node
/**
 * ┌────────────────────────────────────────────────────────────────┐
 * │ YaBuy 回歸測試 ③：【交易流程 × 安全規則】—— 需 Firebase Emulator │
 * └────────────────────────────────────────────────────────────────┘
 *
 * 定位：補上 ①事故驅動 / ②功能標準 都驗不到的一塊——
 *   需要「兩個以上真實登入身分」才能驗證的行為。
 *
 * 為什麼非要 emulator 不可：
 *   正式站上不可能為了測試去建假帳號、寫假訂單、再把商品標成已售出；
 *   更不可能拿第三個帳號去試「能不能偷看別人的訂單」。這些在
 *   docs/wiki/回歸測試-功能標準.md 裡全部標成「需雙帳號」，長期無人執行。
 *
 * 一律使用真實 idToken 操作，不用 Admin SDK——Admin SDK 會繞過 rules，
 * 那樣就只驗到「資料寫得進去」，驗不到「規則有沒有擋住不該做的事」。
 *
 * 執行：
 *   npm run emu          # 另開一個終端機先啟動 emulator
 *   npm run check:trade
 *
 * 退出碼：0 = 全過；1 = 有失敗；2 = emulator 沒開
 *   --skip-if-down 會把「emulator 沒開」改成退出 0。check:code 用這個旗標，
 *   否則沒裝 Java／沒開 emulator 的機器會被 commit 閘門(E1)擋死所有 commit。
 *   手動執行時不帶旗標，才能明確看出「沒驗到」而不是「驗過了」。
 */

import {
  emulatorUp,
  resetEmulator,
  createUser,
  setDoc,
  updateDoc,
  getDoc,
  listDocs,
} from './emulator-helpers.mjs';

const C = {
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`,
  d: (s) => `\x1b[2m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
};

let pass = 0;
let fail = 0;
const failures = [];
const notes = [];

const ok = (name, detail = '') => {
  pass++;
  console.log(`  ${C.g('PASS')}  ${name}${detail ? `  ${C.d(detail)}` : ''}`);
};
const bad = (name, detail) => {
  fail++;
  failures.push(`${name} — ${detail}`);
  console.log(`  ${C.r('FAIL')}  ${name}\n        → ${detail}`);
};
const note = (msg) => {
  notes.push(msg);
  console.log(`  ${C.y('註記')}  ${msg}`);
};
const section = (t) => console.log(`\n${C.b(t)}`);

/** 斷言某個操作應該被規則拒絕 */
const expectDenied = (label, res, why) => {
  if (res.status === 403) ok(label, '(403 被規則拒絕)');
  else if (res.ok) bad(label, `竟然被允許（HTTP ${res.status}）。${why}`);
  else bad(label, `期望 403，實際 HTTP ${res.status}。${why}`);
};

/** 斷言某個操作應該被允許 */
const expectAllowed = (label, res, why) => {
  res.ok ? ok(label) : bad(label, `期望允許，實際 HTTP ${res.status}。${why}`);
};

const eq = (label, actual, expected) =>
  actual === expected
    ? ok(label, `(${JSON.stringify(actual)})`)
    : bad(label, `期望 ${JSON.stringify(expected)}，實際 ${JSON.stringify(actual)}`);

/* ════════════════════════════════════════════════════════════════ */

(async () => {
  console.log(C.b('\nYaBuy 回歸測試 ③：交易流程 × 安全規則（Firebase Emulator）'));

  const SKIP_IF_DOWN = process.argv.includes('--skip-if-down');

  if (!(await emulatorUp())) {
    console.log(
      C.y('\n⏭  Emulator 未啟動，略過交易流程與規則檢查。') +
        C.d('\n   要執行請另開終端機跑：npm run emu') +
        C.d('\n   （需要 JDK；沒有 Java 時 Firestore emulator 起不來）\n')
    );
    process.exit(SKIP_IF_DOWN ? 0 : 2);
  }

  await resetEmulator();

  // 三個身分：買家、賣家，以及一個與這筆交易完全無關的第三者
  const seller = await createUser('seller@test.au.edu.tw');
  const buyer = await createUser('buyer@test.au.edu.tw');
  const third = await createUser('stranger@test.au.edu.tw');
  console.log(
    C.d(`\n  已建立三個測試身分：seller / buyer / stranger（每次執行都重新產生）`)
  );

  /* ─────────────────────────────────────────────────────────────
     1. 商品上架
     ───────────────────────────────────────────────────────────── */
  section('1. 商品上架（products 規則）');

  const PID = 'prod-test-1';
  expectAllowed(
    '賣家上架自己的商品',
    await setDoc(
      `products/${PID}`,
      {
        name: '資料結構與演算法',
        price: 350,
        sellerId: seller.uid,
        sellerName: '賣家',
        status: 'active',
        url: 'http://example/x.jpg',
        createdAt: new Date(),
      },
      seller.token
    ),
    'rules 允許 sellerId === auth.uid 的建立'
  );

  expectDenied(
    '冒名替他人上架商品',
    await setDoc(
      'products/prod-fake',
      { name: '冒名商品', price: 1, sellerId: seller.uid, status: 'active' },
      buyer.token
    ),
    'rules products.create 要求 sellerId === auth.uid，否則任何人都能掛別人的名字賣東西'
  );

  expectDenied(
    '第三者竄改別人的商品',
    await updateDoc(`products/${PID}`, { price: 1 }, third.token),
    'rules products.update 限擁有者或管理員'
  );

  /* ─────────────────────────────────────────────────────────────
     2. 交易狀態機（對照 docs/wiki/交易生命週期.md）
     ───────────────────────────────────────────────────────────── */
  section('2. 交易狀態機資料契約');

  const OID = 'order-test-1';
  const orderBase = {
    buyerId: buyer.uid,
    buyerName: '買家',
    sellerId: seller.uid,
    sellerName: '賣家',
    productId: PID,
    productName: '資料結構與演算法',
    productPrice: 350,
    location: '圖書館前',
    time: '2026-08-20 14:00',
    originalTime: '2026-08-20 14:00',
    status: 'pending',
    negotiationStep: 0,
    lastActionBy: 'buyer',
    buyerReady: false,
    sellerReady: false,
    createdAt: new Date(),
  };

  expectAllowed(
    'C-03 買家發起交易 → pending',
    await setDoc(`orders/${OID}`, orderBase, buyer.token),
    'rules orders.create 要求 buyerId === auth.uid'
  );

  expectDenied(
    '冒名以他人身分發起交易',
    await setDoc(
      'orders/order-fake',
      { ...orderBase, buyerId: seller.uid },
      buyer.token
    ),
    'rules orders.create 要求 buyerId === auth.uid，否則可偽造他人訂單'
  );

  expectDenied(
    '指定一個沒賣這件商品的人當賣家',
    await setDoc(
      'orders/order-hijack',
      { ...orderBase, sellerId: third.uid },
      buyer.token
    ),
    'orders.create 的 sellerOwnsProduct 要求 sellerId 就是該商品的擁有者。若通過，就能隨手抓路人 uid 大量建單（塞爆對方信箱），再一路改成 completed 灌爆全站統計'
  );

  expectDenied(
    '建單時直接夾帶成交價',
    await setDoc(
      'orders/order-price',
      { ...orderBase, finalPrice: 9999 },
      buyer.token
    ),
    'orders.create 不接受 finalPrice：成交價只能在 accepted 階段由買家填'
  );

  expectDenied(
    '建單時直接指定非 pending 的狀態',
    await setDoc(
      'orders/order-jump',
      { ...orderBase, status: 'completed' },
      buyer.token
    ),
    'orders.create 限 status === pending，否則可以直接生出一筆「已完成」訂單'
  );

  // 賣家改提案 → negotiating
  await updateDoc(
    `orders/${OID}`,
    { status: 'negotiating', negotiationStep: 1, lastActionBy: 'seller', time: '2026-08-20 16:00' },
    seller.token
  );
  let o = await getDoc(`orders/${OID}`, seller.token);
  eq('C-05 賣家改提案 → status', o.data.status, 'negotiating');
  eq('C-05 negotiationStep 累加', o.data.negotiationStep, 1);

  // 買家接受 → accepted
  await updateDoc(`orders/${OID}`, { status: 'accepted', lastActionBy: 'buyer' }, buyer.token);
  o = await getDoc(`orders/${OID}`, buyer.token);
  eq('C-07 買家接受 → accepted', o.data.status, 'accepted');

  // 面交：雙方就緒
  await updateDoc(`orders/${OID}`, { buyerReady: true }, buyer.token);
  await updateDoc(`orders/${OID}`, { sellerReady: true }, seller.token);
  o = await getDoc(`orders/${OID}`, buyer.token);
  eq('C-09 買家就緒', o.data.buyerReady, true);
  eq('C-09 賣家就緒', o.data.sellerReady, true);

  // 成交價：只有買家能填，且不得超過 MAX_PRICE（Deal.vue = 10000）
  expectDenied(
    'C-11 買家不可寫超過上限的成交價',
    await updateDoc(`orders/${OID}`, { finalPrice: 999999 }, buyer.token),
    'orders.update 的 finalPriceOk 有上限；只在前端擋的話，繞過就能把排行榜的「循環利用金額」灌到失真'
  );
  expectDenied(
    'C-11 賣家不可代替買家填成交價',
    await updateDoc(`orders/${OID}`, { finalPrice: 1 }, seller.token),
    'orders.update 的 finalPriceOk 規定成交價只有買家能填（Deal.vue 的 price 步驟）'
  );

  // 成交：買家出價 → 賣家確認 → 商品下架（兩步，對照 Deal.vue 的實際流程）
  await updateDoc(`orders/${OID}`, { finalPrice: 300 }, buyer.token);

  expectDenied(
    '買家不可單方面把訂單改成 completed',
    await updateDoc(`orders/${OID}`, { status: 'completed' }, buyer.token),
    'orders.update 的 statusFlowOk 規定 completed 只有賣家能按。若通過，配合「隨便指定路人當賣家」就能一個人灌爆 getRankingStats／getPublicStats'
  );

  await updateDoc(`orders/${OID}`, { status: 'completed' }, seller.token);
  await updateDoc(`products/${PID}`, { status: 'sold', soldAt: new Date() }, seller.token);

  o = await getDoc(`orders/${OID}`, seller.token);
  eq('C-11 finalPrice 寫入', o.data.finalPrice, 300);
  eq('C-12 訂單 → completed', o.data.status, 'completed');

  expectDenied(
    'completed 是終止態，不可被改回 accepted',
    await updateDoc(`orders/${OID}`, { status: 'accepted' }, buyer.token),
    'orders.update 的 statusFlowOk 只允許 next == prev 離開終止態，否則成交紀錄可被反覆翻案'
  );

  const p = await getDoc(`products/${PID}`, seller.token);
  eq('C-12 商品 → sold', p.data.status, 'sold');
  p.data.soldAt
    ? ok('C-12 商品有 soldAt 時間戳', `(${p.data.soldAt})`)
    : bad('C-12 商品缺少 soldAt', 'status=sold 與 soldAt 必須同時寫入，否則我的賣場查不到成交明細');

  /* ─────────────────────────────────────────────────────────────
     3. 第三者隔離 —— 這一節在正式站上從來沒被驗證過
     ───────────────────────────────────────────────────────────── */
  section('3. 第三者隔離（登入但無關的使用者）');

  expectDenied(
    '第三者讀取別人的訂單',
    await getDoc(`orders/${OID}`, third.token),
    'orders.read 限買家/賣家/管理員。若通過，別人的面交時間地點價格全都外洩'
  );

  expectDenied(
    '第三者竄改別人的訂單',
    await updateDoc(`orders/${OID}`, { status: 'rejected' }, third.token),
    'orders.update 限當事人，否則任何人都能把別人的交易改掉'
  );

  const listed = await listDocs('orders', third.token);
  listed.docs.length === 0
    ? ok('第三者無法列出訂單清單', `(HTTP ${listed.status}，撈到 0 筆)`)
    : bad('第三者撈得到訂單', `撈到 ${listed.docs.length} 筆，應為 0`);

  // 罐頭訊息：rules 用 isOrderParty() 回頭查 orders
  await setDoc(
    'messages/msg-1',
    { orderId: OID, senderId: buyer.uid, text: '我快到了', createdAt: new Date() },
    buyer.token
  );
  expectAllowed(
    'C-15 當事人可讀該訂單訊息',
    await getDoc('messages/msg-1', seller.token),
    'messages.read 用 isOrderParty() 判定'
  );
  expectDenied(
    'C-15 第三者讀不到該訂單訊息',
    await getDoc('messages/msg-1', third.token),
    'messages.read 的 isOrderParty() 必須擋住非當事人'
  );
  expectDenied(
    'C-15 第三者無法冒名發訊息',
    await setDoc(
      'messages/msg-fake',
      { orderId: OID, senderId: buyer.uid, text: '假訊息', createdAt: new Date() },
      third.token
    ),
    'messages.create 要求 senderId === auth.uid 且為當事人'
  );

  /* ─────────────────────────────────────────────────────────────
     4. 評價與個資
     ───────────────────────────────────────────────────────────── */
  section('4. 評價與個資（reviews / users）');

  await setDoc(`users/${seller.uid}`, { id: seller.uid, email: seller.email, ratingSum: 0, ratingCount: 0 }, seller.token);

  // 評價文件 id 固定為 `${orderId}_${raterId}`：唯一性由 rules 直接驗 id 組成，
  // 一筆訂單每人只能評一次，不靠前端自律（Deal.vue 已改用 setDoc 帶這個 id）。
  const REV = `${OID}_${buyer.uid}`;
  const reviewBase = {
    orderId: OID, raterId: buyer.uid, ratedId: seller.uid,
    ratedRole: 'seller', stars: 5, comment: '很好', createdAt: new Date(),
  };

  expectDenied(
    '評價文件 id 不符 `${orderId}_${raterId}` 規格',
    await setDoc('reviews/rev-1', reviewBase, buyer.token),
    'reviews.create 驗 id 組成；隨機 id 會讓同一筆訂單能重複刷評價'
  );

  expectDenied(
    '星等超出 1..5',
    await setDoc(`reviews/${REV}`, { ...reviewBase, stars: 99999 }, buyer.token),
    'reviews.create 限 1..5 的整數，否則一次就能把對方評分灌到天上'
  );

  expectDenied(
    '對沒跟自己交易過的人留評價',
    await setDoc(
      `reviews/${OID}_${third.uid}`,
      { ...reviewBase, raterId: third.uid, ratedId: seller.uid },
      third.token
    ),
    'reviews.create 的 ratingPairOk 要求評分雙方就是該筆 completed 訂單的買賣方'
  );

  expectAllowed(
    'C-13 買家可對賣家留評價',
    await setDoc(`reviews/${REV}`, reviewBase, buyer.token),
    'reviews.create：completed 訂單的當事人、id 合規、星等合法'
  );

  expectDenied(
    'C-13 同一筆訂單不可重複評價',
    await setDoc(`reviews/${REV}`, { ...reviewBase, stars: 1 }, buyer.token),
    'id 已存在 → 這次是 update，而 reviews.update 一律 false'
  );

  expectDenied(
    '冒他人之名留評價',
    await setDoc(
      `reviews/${OID}_${seller.uid}`,
      { orderId: OID, raterId: seller.uid, ratedId: buyer.uid, stars: 1, createdAt: new Date() },
      third.token
    ),
    'reviews.create 要求 raterId === auth.uid'
  );

  expectDenied(
    'C-13 評論文字不外流（非管理員讀不到 reviews）',
    await getDoc(`reviews/${REV}`, seller.token),
    'reviews.read 限管理員；被評價者自己也不該讀到評論內文'
  );

  // ⚠️ 這兩條原本是 expectAllowed（規則有一條「只動 ratingSum/ratingCount 就放行」
  // 的分支）。那等於任何登入者都能把任意 uid 的評分設成任意值——自己刷滿分、
  // 把別人刷成 0 分，完全不需要交易過。該分支已移除，改由 Cloud Function
  // onReviewCreated 用 Admin SDK 累加，前端一律不可寫這兩個欄位。
  expectDenied(
    '不可直接竄改他人的評分彙總',
    await updateDoc(`users/${seller.uid}`, { ratingSum: 9999, ratingCount: 1 }, buyer.token),
    'users.update 已禁止前端寫 ratingSum/ratingCount，唯一來源是 reviews → onReviewCreated'
  );

  expectDenied(
    '不可自行把自己的評分刷成滿分',
    await updateDoc(`users/${seller.uid}`, { ratingSum: 9999, ratingCount: 1 }, seller.token),
    'users.update 第 (1) 條的 hasAny 已把 ratingSum/ratingCount 一起列入禁改清單'
  );

  expectDenied(
    '不可藉評分更新順便改他人其他欄位',
    await updateDoc(`users/${seller.uid}`, { ratingSum: 5, email: 'hacked@evil.com' }, buyer.token),
    'users.update 對非本人只剩管理員改 status 一條路'
  );

  expectDenied(
    '不可自行把自己設為管理員',
    await updateDoc(`users/${seller.uid}`, { isAdmin: true }, seller.token),
    'users.update 第 (1) 條禁止本人竄改 isAdmin/isFounder'
  );

  /* ─────────────────────────────────────────────────────────────
     5. 稽核紀錄
     ───────────────────────────────────────────────────────────── */
  section('5. 稽核紀錄（audit_logs）');

  expectAllowed(
    '一般使用者可寫入稽核紀錄',
    await setDoc(
      'audit_logs/log-1',
      { category: 'trade', level: 'normal', title: '發起交易', buyerId: buyer.uid, sellerId: seller.uid, createdAt: new Date() },
      buyer.token
    ),
    'TradeModal.vue 送出交易時會寫一筆'
  );

  expectDenied(
    '非管理員讀不到稽核紀錄',
    await getDoc('audit_logs/log-1', buyer.token),
    'audit_logs.read 限管理員'
  );

  expectDenied(
    '已寫入的稽核紀錄不可竄改',
    await updateDoc('audit_logs/log-1', { title: '竄改' }, buyer.token),
    'audit_logs.update 一律 false，維持唯讀性質'
  );

  /* ─────────────────────────────────────────────────────────────
     6. 改期次數上限與訂單完整性（規則層，不是只靠前端）
     這一節原本是「記錄現況」的註記——當時 negotiationStep 可被改成任意值、
     自買自賣也擋不住。規則收緊後升級成真正的斷言，防止退化。
     ───────────────────────────────────────────────────────────── */
  section('6. 改期次數上限與訂單完整性（規則層）');

  expectDenied(
    'C-02 不能建立自買自賣的訂單',
    await setDoc(
      'orders/order-self',
      { ...orderBase, buyerId: seller.uid, sellerId: seller.uid },
      seller.token
    ),
    'orders.create 需 buyerId != sellerId，否則可自買自賣污染排行榜與貢獻度統計'
  );

  // 另開一筆乾淨訂單來驗改期次數（前面那筆已經 completed）
  const NID = 'order-nego';
  await setDoc(`orders/${NID}`, orderBase, buyer.token);

  expectDenied(
    'negotiationStep 不可跳號',
    await updateDoc(`orders/${NID}`, { negotiationStep: 99 }, seller.token),
    '規則只接受「不變」或「剛好 +1」，跳號等於無限改期'
  );

  expectAllowed(
    'C-05 賣家第 1 次改期（0 → 1）',
    await updateDoc(
      `orders/${NID}`,
      { status: 'negotiating', negotiationStep: 1, lastActionBy: 'seller' },
      seller.token
    ),
    '賣家上限 1 次，第 1 次應允許'
  );

  expectDenied(
    'C-05 賣家第 2 次改期被擋（1 → 2）',
    await updateDoc(`orders/${NID}`, { negotiationStep: 2, lastActionBy: 'seller' }, seller.token),
    '賣家上限 1 次，規則層必須擋住第 2 次'
  );

  expectAllowed(
    'C-06 買家可改期至上限（1 → 2）',
    await updateDoc(`orders/${NID}`, { negotiationStep: 2, lastActionBy: 'buyer' }, buyer.token),
    '買家上限 2 次'
  );

  expectDenied(
    'C-06 買家第 3 次改期被擋（2 → 3）',
    await updateDoc(`orders/${NID}`, { negotiationStep: 3, lastActionBy: 'buyer' }, buyer.token),
    '買家上限 2 次，規則層必須擋住第 3 次'
  );

  expectAllowed(
    '不動 negotiationStep 的更新不受影響',
    await updateDoc(`orders/${NID}`, { status: 'accepted', buyerReady: true }, buyer.token),
    '接受/婉拒/就緒/成交都不該被改期規則誤擋'
  );

  expectDenied(
    '當事人不可竄改 sellerId 挾持訂單',
    await updateDoc(`orders/${NID}`, { sellerId: buyer.uid }, buyer.token),
    'orders.update 需維持 buyerId/sellerId/productId 不變，否則可把別人談好的交易據為己有'
  );

  /* ─────────────────────────────────────────────────────────────
     7. 逾期關閉與推遲面交時間（規則層）
     ───────────────────────────────────────────────────────────── */
  section('7. 逾期關閉與推遲面交時間（規則層）');

  // 逾期的「過 30 分鐘」判定在 Mailbox.vue，規則層算不出來——orders.time 是
  // 不含時區的字串。所以這裡驗的不是「時間到了沒」，而是「終點合不合法」：
  // 只有 accepted 能走到 expired，而 expired 之後誰也改不動。
  const XID = 'order-expire-1';
  await setDoc(`orders/${XID}`, orderBase, buyer.token);

  // pending / negotiating 也能逾期——「約定時間過了都沒人回應」跟「談成了沒
  // 出現」是兩種不同的破局，但都該有出口。記在哪個計數器由 Function 決定。
  expectAllowed(
    '未獲回應的 pending 可以逾期關閉',
    await updateDoc(`orders/${XID}`, { status: 'expired' }, buyer.token),
    'statusFlowOk 允許 pending → expired，否則賣家不理會的請求會永遠掛在信箱'
  );

  expectDenied(
    'expired 之後不能被改回 pending',
    await updateDoc(`orders/${XID}`, { status: 'pending' }, buyer.token),
    'expired 是終止態，只剩 next == prev 會過'
  );

  const XID2 = 'order-expire-2';
  await setDoc(`orders/${XID2}`, orderBase, buyer.token);
  await updateDoc(`orders/${XID2}`, { status: 'accepted' }, seller.token);

  expectAllowed(
    '逾期關閉：accepted → expired',
    await updateDoc(`orders/${XID2}`, { status: 'expired', lastActionBy: 'buyer' }, buyer.token),
    '約定時間過 30 分鐘、雙方都沒開始安全交易時，任一方都要能結案'
  );

  expectDenied(
    'expired 是終止態，不可被改回 accepted',
    await updateDoc(`orders/${XID2}`, { status: 'accepted' }, buyer.token),
    'statusFlowOk 對終止態只允許 next == prev，否則逾期結案可被反覆翻案'
  );

  // 推遲額度：買賣各 1 次，旗標只能 false → true，且只有本人能立自己那一支
  const DID = 'order-delay-1';
  await setDoc(`orders/${DID}`, orderBase, buyer.token);
  await updateDoc(`orders/${DID}`, { status: 'accepted' }, seller.token);

  expectDenied(
    '賣家不可代替買家立 buyerDelayUsed',
    await updateDoc(`orders/${DID}`, { buyerDelayUsed: true }, seller.token),
    'delayUsedOk 規定只有本人能用掉自己的額度，否則對方能把你的推遲次數消耗掉'
  );

  expectAllowed(
    '買家用掉自己的推遲額度（false → true）',
    await updateDoc(`orders/${DID}`, { buyerDelayUsed: true }, buyer.token),
    '買家 1 次額度，第 1 次應允許'
  );

  expectDenied(
    '買家不可把自己的推遲額度歸零（true → false）',
    await updateDoc(`orders/${DID}`, { buyerDelayUsed: false }, buyer.token),
    'delayUsedOk 只接受 false → true。能歸零就等於無限推遲，可以把約定時間一路往後推、繞過逾期關閉'
  );

  expectAllowed(
    '賣家的額度與買家各自獨立',
    await updateDoc(`orders/${DID}`, { sellerDelayUsed: true }, seller.token),
    '買家用掉額度不該影響賣家'
  );

  // 推遲請求本身是一則 messages 文件，回覆＝把 requestStatus 從 pending 改掉
  const MID = 'msg-delay-1';
  expectAllowed(
    '買家發出推遲請求（messages.create）',
    await setDoc(
      `messages/${MID}`,
      {
        orderId: DID,
        senderId: buyer.uid,
        text: '⏰ 希望推遲至 2026-08-20 16:30 面交，可以嗎？',
        kind: 'delay',
        proposedTime: '2026-08-20 16:30',
        requestStatus: 'pending',
        createdAt: new Date(),
      },
      buyer.token
    ),
    'messages.create 要求 senderId === auth.uid 且是訂單當事人'
  );

  expectDenied(
    '發送者不可自己同意自己的推遲請求',
    await updateDoc(`messages/${MID}`, { requestStatus: 'accepted' }, buyer.token),
    'messages.update 要求 senderId != auth.uid。若能自問自答，推遲就變成單方面改時間'
  );

  expectDenied(
    '無關第三者不可回覆推遲請求',
    await updateDoc(`messages/${MID}`, { requestStatus: 'declined' }, third.token),
    'messages.update 走 isOrderParty()，路人不該能左右別人的面交時間'
  );

  expectDenied(
    '回覆時不可順手改掉提議時間',
    await updateDoc(
      `messages/${MID}`,
      { requestStatus: 'accepted', proposedTime: '2026-08-20 09:00' },
      seller.token
    ),
    'messages.update 限 hasOnly([requestStatus])，否則同意紀錄會跟實際改成的時間對不上'
  );

  expectAllowed(
    '收件者同意推遲（pending → accepted）',
    await updateDoc(`messages/${MID}`, { requestStatus: 'accepted' }, seller.token),
    '對方要能回覆，否則推遲請求永遠沒有結果'
  );

  expectAllowed(
    '同意後由回覆者改寫約定時間',
    await updateDoc(`orders/${DID}`, { time: '2026-08-20 16:30' }, seller.token),
    '同意的當下要真的把 orders.time 改掉（前端與 requestStatus 同一個 writeBatch）'
  );

  expectDenied(
    '已回覆的推遲請求不可翻案',
    await updateDoc(`messages/${MID}`, { requestStatus: 'declined' }, seller.token),
    'messages.update 要求起點是 pending，否則同意過的請求可被改回婉拒'
  );

  const dm = await getDoc(`orders/${DID}`, buyer.token);
  eq('推遲同意後約定時間已更新', dm.data.time, '2026-08-20 16:30');

  /* ─────────────────────────────────────────────────────────────
     8. 記次與發起交易閘門（規則層）
     ───────────────────────────────────────────────────────────── */
  section('8. 記次與發起交易閘門（規則層）');

  // 記次本身是 Cloud Function onOrderExpired 用 Admin SDK 寫的，emulator 這層
  // 跑不到 functions，所以這節驗的是「記次寫進去之後，規則擋不擋得住」——
  // 也就是這道閘門唯一能被繞過的兩個地方：自己改次數、以及硬送建單請求。
  // 用 emulator 的 owner token 模擬 Admin SDK 的寫入（繞過規則）。
  const OWNER = 'owner';

  // 先用 owner（emulator 的規則繞過令牌）模擬 Cloud Function 的寫入，
  // 讓 users 文件確實存在——否則下面的竄改會變成 create 而非 update，
  // 驗到的就不是我們想驗的那條規則。
  await setDoc(
    `users/${buyer.uid}`,
    { id: buyer.uid, email: buyer.email, expireCount: 1, expirePeriodStart: new Date() },
    OWNER
  );

  expectDenied(
    '使用者不可自行竄改 expireCount',
    await updateDoc(`users/${buyer.uid}`, { expireCount: 0 }, buyer.token),
    'users.update 已把 expireCount / expirePeriodStart 列入不可竄改；能改回 0 的話，爽約閘門形同虛設'
  );

  expectDenied(
    '使用者不可自行竄改 expirePeriodStart',
    await updateDoc(`users/${buyer.uid}`, { expirePeriodStart: new Date() }, buyer.token),
    '把週期起點往後撥等同於把次數歸零'
  );

  expectDenied(
    '使用者不可自行竄改 noReplyCount',
    await updateDoc(`users/${buyer.uid}`, { noReplyCount: 0 }, buyer.token),
    '未回應計數與爽約計數一樣只有 Cloud Function 寫得動'
  );

  expectDenied(
    '使用者不可自行竄改 cancelCount',
    await updateDoc(`users/${buyer.uid}`, { cancelCount: 0 }, buyer.token),
    '取消計數自從變成發起交易的閘門之一，就不能再讓前端自己寫——能改回 0 就繞過閘門'
  );

  expectDenied(
    '使用者不可自行竄改 cancelPeriodStart',
    await updateDoc(`users/${buyer.uid}`, { cancelPeriodStart: new Date() }, buyer.token),
    '同 expirePeriodStart：把週期起點往後撥等同於把次數歸零'
  );

  expectDenied(
    '沒有 users 文件的人不可自建一份乾淨的紀錄',
    await setDoc(
      `users/${third.uid}`,
      { id: third.uid, expireCount: 0, expirePeriodStart: new Date() },
      third.token
    ),
    'users.create 若不限制欄位，「先刪不掉就先建一份」就能憑空清掉爽約紀錄'
  );

  // 未達上限：照常可以發起交易
  await setDoc(
    `users/${buyer.uid}`,
    { expireCount: 2, expirePeriodStart: new Date() },
    OWNER
  );
  expectAllowed(
    '爽約 2 次（未達上限）仍可發起交易',
    await setDoc('orders/order-strike-ok', orderBase, buyer.token),
    'notTradeBanned 的門檻是 3 次，2 次不該被擋'
  );

  // 達上限：建單被規則擋下
  await setDoc(
    `users/${buyer.uid}`,
    { expireCount: 3, expirePeriodStart: new Date() },
    OWNER
  );
  expectDenied(
    '爽約滿 3 次後不可發起新交易',
    await setDoc('orders/order-strike-ban', orderBase, buyer.token),
    'orders.create 的 notTradeBanned()。只擋前端的話，繞過 TradeModal 直接打 REST 就能繼續建單'
  );

  // 未回應是另一組額度：爽約歸零之後，光靠未回應也要能擋住
  await setDoc(
    `users/${buyer.uid}`,
    { expireCount: 0, expirePeriodStart: new Date(), noReplyCount: 3, noReplyPeriodStart: new Date() },
    OWNER
  );
  expectDenied(
    '未回應滿 3 次後同樣不可發起新交易',
    await setDoc('orders/order-noreply-ban', orderBase, buyer.token),
    'notTradeBanned 要同時看三組計數，只看 expireCount 的話未回應那條形同虛設'
  );

  // 主動取消是第三組額度：前兩組歸零之後，光靠取消也要能擋住
  await setDoc(
    `users/${buyer.uid}`,
    {
      expireCount: 0, expirePeriodStart: new Date(),
      noReplyCount: 0, noReplyPeriodStart: new Date(),
      cancelCount: 3, cancelPeriodStart: new Date(),
    },
    OWNER
  );
  expectDenied(
    '主動取消滿 3 次後不可發起新交易',
    await setDoc('orders/order-cancel-ban', orderBase, buyer.token),
    'notTradeBanned 的第三條。取消額度原本只擋「還能不能再取消」，現在同時擋發起新交易'
  );

  expectAllowed(
    '兩組計數各自獨立：未回應 2 次不受爽約 2 次影響',
    await (async () => {
      await setDoc(
        `users/${buyer.uid}`,
        { expireCount: 2, expirePeriodStart: new Date(), noReplyCount: 2, noReplyPeriodStart: new Date() },
        OWNER
      );
      return setDoc('orders/order-strike-split', orderBase, buyer.token);
    })(),
    '兩組各給 3 次容忍，2 + 2 不該被加總成 4 而擋下'
  );

  // 週期過完自動恢復：把起算點撥到 31 天前
  await setDoc(
    `users/${buyer.uid}`,
    { expireCount: 3, expirePeriodStart: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) },
    OWNER
  );
  expectAllowed(
    '30 天週期過完後自動恢復，不需人工解鎖',
    await setDoc('orders/order-strike-reset', orderBase, buyer.token),
    'notTradeBanned 用 request.time 與 expirePeriodStart + duration.value(30, d) 比較'
  );

  // 沒有 users 文件的舊帳號不該被誤擋（backfillUserDocs 的存在證明確實有這種人）
  expectAllowed(
    '沒有 users 文件的帳號不會被閘門誤擋',
    await setDoc('orders/order-strike-nodoc', { ...orderBase, buyerId: third.uid }, third.token),
    'notTradeBanned 在 users 文件不存在時用 2000-01-01 當預設起點，條件必定為 false'
  );

  // 轉成 rejected 時 lastActionBy 必須誠實標成操作者本人：onOrderCancelled 靠它
  // 決定要把取消記給誰，也靠它分辨「賣家婉拒一筆還沒談成的請求」不記次。
  // order-strike-split 是上面「兩組計數各自獨立」那項由買家建的，還停在 pending。
  expectDenied(
    '取消時不可把 lastActionBy 寫成對方',
    await updateDoc(
      'orders/order-strike-split',
      { status: 'rejected', lastActionBy: 'seller' },
      buyer.token
    ),
    'orders.update 的 cancelActorOk()。記次的依據能造假的話，取消額度等於沒有——' +
    '取消的人把自己標成對方，額度就記到無辜的人頭上'
  );

  expectAllowed(
    '取消時標上自己就放行',
    await updateDoc(
      'orders/order-strike-split',
      { status: 'rejected', lastActionBy: 'buyer' },
      buyer.token
    ),
    'cancelActorOk 只要求誠實標示，不擋取消本身'
  );

  /* ─────────────────────────────────────────────────────────────
     9. 記次 Cloud Function（onOrderExpired／onOrderCancelled）
     ───────────────────────────────────────────────────────────── */
  section('9. 記次 Cloud Function（onOrderExpired／onOrderCancelled）');

  // 這節需要 functions emulator（npm run emu:fn）。只跑 npm run emu 的話
  // trigger 根本不會被觸發，這裡會註記略過而不是假裝驗過。
  const functionsUp = await fetch('http://127.0.0.1:5001/')
    .then(() => true)
    .catch(() => false);

  if (!functionsUp) {
    note(
      'functions emulator 未啟動（port 5001），略過 onOrderExpired 的記次驗證。' +
      '要驗請改用 npm run emu:fn'
    );
  } else await (async () => {
    const OWNER2 = 'owner';
    const readCount = async (uid) => {
      const r = await getDoc(`users/${uid}`, OWNER2);
      return r.data?.expireCount ?? null;
    };

    // 這一節用自己的一組帳號與商品，不共用前面幾節的 buyer / seller。
    //
    // 原因：第 7 節把訂單改成過 expired，那些 trigger 是非同步的，可能在這裡
    // 把計數歸零之後才落地，於是「準時到場的買家不被記次」偶爾會讀到 1。
    // 先前是靠 sleep 等它們排空——那只是把競態的窗口調小，跑得慢一點就又中。
    // 換成專屬帳號之後，前面幾節的 trigger 在結構上就碰不到這裡的計數器。
    const fnSeller = await createUser('fn-seller@test.au.edu.tw');
    const fnBuyer = await createUser('fn-buyer@test.au.edu.tw');
    const FN_PID = 'prod-fn-expire';
    await setDoc(
      `products/${FN_PID}`,
      { name: '記次測試用商品', price: 100, sellerId: fnSeller.uid, status: 'active', createdAt: new Date() },
      fnSeller.token
    );

    const fnOrderBase = {
      ...orderBase,
      buyerId: fnBuyer.uid,
      sellerId: fnSeller.uid,
      productId: FN_PID,
      buyerReady: false,
      sellerReady: false,
    };

    // 買家準時到（按過安全交易），賣家放鳥 → 只有賣家該被記一次
    const FID = 'order-fn-expire';
    await setDoc(`orders/${FID}`, fnOrderBase, fnBuyer.token);
    await updateDoc(`orders/${FID}`, { status: 'accepted' }, fnSeller.token);
    await updateDoc(`orders/${FID}`, { buyerReady: true }, fnBuyer.token);
    await updateDoc(`orders/${FID}`, { status: 'expired' }, fnBuyer.token);

    // trigger 是非同步的，輪詢等它落地。這一筆是本節的第一次觸發，會踩到
    // functions emulator 的冷啟動（實測整整超過 15 秒），所以等得比後面幾筆久——
    // 等不夠久的話整節會被當成「trigger 沒跑」而跳過，看起來像沒驗但其實是誤判。
    let sellerCount = null;
    for (let i = 0; i < 80; i++) {
      sellerCount = await readCount(fnSeller.uid);
      if (sellerCount === 1) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    // 賣家的數字到位之後再多等一拍：若 trigger 真的誤記了買家，那筆寫入
    // 跟賣家那筆是同一個 Promise.all，不會晚太多，但也不保證同時落地。
    await new Promise((r) => setTimeout(r, 1500));

    // 「port 5001 有回應」不等於「trigger 有註冊」。functions emulator 可能起
    // 得來卻沒載入任何定義（載入逾時會印 Failed to load function definition），
    // 或是同時有第二份 emulator 佔著埠。那種情況下這一節每一項都會失敗，看起來
    // 像 7 個獨立的邏輯錯誤，實際上是同一個環境問題。
    // 用第一個情境當金絲雀：它沒動靜就代表 trigger 根本沒跑，此時只留一則明確
    // 的註記並略過本節，而不是拋出一串互相重複、指不到根因的失敗。
    if (sellerCount !== 1) {
      note(
        'functions emulator 有回應（port 5001），但 onOrderExpired 完全沒有觸發，' +
        '本節略過未驗。多半是 function 定義載入失敗或有多份 emulator 同時在跑——' +
        '請看 npm run emu:fn 的輸出是否有 "Failed to load function definition" ' +
        '或 "running multiple instances"，清乾淨後重跑。'
      );
      return;
    }

    eq('放鳥的賣家被記一次爽約', sellerCount, 1);
    eq('準時到場的買家不被記次', await readCount(fnBuyer.uid), null);

    // 雙方都沒出現 → 判不出是誰放的鳥，誰都不記
    const FID2 = 'order-fn-expire-both';
    await setDoc(`orders/${FID2}`, fnOrderBase, fnBuyer.token);
    await updateDoc(`orders/${FID2}`, { status: 'accepted' }, fnSeller.token);
    await updateDoc(`orders/${FID2}`, { status: 'expired' }, fnSeller.token);

    // 這裡沒有「等到某個數字」可以輪詢——要驗的正是「什麼都沒發生」，只能給
    // trigger 一段足夠落地的時間再讀。上一個情境已經證明 trigger 是活的。
    await new Promise((r) => setTimeout(r, 4000));

    eq('雙方都沒出現時買家不被記次', await readCount(fnBuyer.uid), null);
    eq('雙方都沒出現時賣家的計數也不動', await readCount(fnSeller.uid), 1);

    /* ── 未回應（pending / negotiating 逾期）記在另一組計數 ── */
    const readNoReply = async (uid) => {
      const r = await getDoc(`users/${uid}`, OWNER2);
      return r.data?.noReplyCount ?? null;
    };

    // createdAt 造在 13 小時前，越過 NO_REPLY_MIN_AGE_MS 的 12 小時下限
    const oldCreated = new Date(Date.now() - 13 * 60 * 60 * 1000);

    // pending 沒人回 → 記賣家，不記買家
    const RID = 'order-noreply-pending';
    await setDoc(`orders/${RID}`, { ...fnOrderBase, createdAt: oldCreated }, fnBuyer.token);
    await updateDoc(`orders/${RID}`, { status: 'expired' }, fnBuyer.token);

    let sellerNoReply = null;
    for (let i = 0; i < 30; i++) {
      sellerNoReply = await readNoReply(fnSeller.uid);
      if (sellerNoReply === 1) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    await new Promise((r) => setTimeout(r, 1500));

    eq('pending 逾期 → 記賣家未回應', sellerNoReply, 1);
    eq('pending 逾期 → 不記發起的買家', await readNoReply(fnBuyer.uid), null);
    eq('未回應不會汙染爽約計數', await readCount(fnSeller.uid), 1);

    // negotiating：最後動作者是賣家 → 沒回的是買家
    const RID2 = 'order-noreply-nego';
    await setDoc(`orders/${RID2}`, { ...fnOrderBase, createdAt: oldCreated }, fnBuyer.token);
    await updateDoc(
      `orders/${RID2}`,
      { status: 'negotiating', negotiationStep: 1, lastActionBy: 'seller' },
      fnSeller.token
    );
    await updateDoc(`orders/${RID2}`, { status: 'expired' }, fnSeller.token);

    let buyerNoReply = null;
    for (let i = 0; i < 30; i++) {
      buyerNoReply = await readNoReply(fnBuyer.uid);
      if (buyerNoReply === 1) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    eq('negotiating 逾期 → 記「不是最後動作者」的那一方', buyerNoReply, 1);

    // 12 小時下限：剛送出就逾期的訂單，誰也不記
    // （否則買家把面交時間填在半小時後，連送三筆再自己關掉，就能刷爆賣家）
    const RID3 = 'order-noreply-fresh';
    await setDoc(`orders/${RID3}`, { ...fnOrderBase, createdAt: new Date() }, fnBuyer.token);
    await updateDoc(`orders/${RID3}`, { status: 'expired' }, fnBuyer.token);
    await new Promise((r) => setTimeout(r, 3000));

    eq('訂單成立不滿 12 小時就逾期 → 不記給任何人', await readNoReply(fnSeller.uid), 1);

    /* ── 主動取消記次（onOrderCancelled） ── */
    const readCancel = async (uid) => {
      const r = await getDoc(`users/${uid}`, OWNER2);
      return r.data?.cancelCount ?? null;
    };

    // 買家取消一筆已經談成的交易 → 記買家
    const CID = 'order-cancel-buyer';
    await setDoc(`orders/${CID}`, fnOrderBase, fnBuyer.token);
    await updateDoc(`orders/${CID}`, { status: 'accepted' }, fnSeller.token);
    await updateDoc(
      `orders/${CID}`,
      { status: 'rejected', lastActionBy: 'buyer' },
      fnBuyer.token
    );

    let buyerCancel = null;
    for (let i = 0; i < 30; i++) {
      buyerCancel = await readCancel(fnBuyer.uid);
      if (buyerCancel === 1) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    await new Promise((r) => setTimeout(r, 1500));

    eq('買家取消談成的交易 → 記買家一次', buyerCancel, 1);
    eq('被取消的另一方不被記次', await readCancel(fnSeller.uid), null);

    // 賣家婉拒一筆還沒談成的請求 → 那不是取消，誰都不記
    const CID2 = 'order-cancel-decline';
    await setDoc(`orders/${CID2}`, fnOrderBase, fnBuyer.token);
    await updateDoc(
      `orders/${CID2}`,
      { status: 'rejected', lastActionBy: 'seller' },
      fnSeller.token
    );
    await new Promise((r) => setTimeout(r, 4000));

    eq('賣家婉拒 pending 請求 → 不記次', await readCancel(fnSeller.uid), null);
    eq('婉拒也不會反過來記到買家頭上', await readCancel(fnBuyer.uid), 1);

    // 賣家取消一筆已經談成的交易 → 這才算取消，記賣家
    const CID3 = 'order-cancel-seller';
    await setDoc(`orders/${CID3}`, fnOrderBase, fnBuyer.token);
    await updateDoc(`orders/${CID3}`, { status: 'accepted' }, fnSeller.token);
    await updateDoc(
      `orders/${CID3}`,
      { status: 'rejected', lastActionBy: 'seller' },
      fnSeller.token
    );

    let sellerCancel = null;
    for (let i = 0; i < 30; i++) {
      sellerCancel = await readCancel(fnSeller.uid);
      if (sellerCancel === 1) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    eq('賣家取消談成的交易 → 記賣家一次', sellerCancel, 1);

    // 維護期間的取消不計次：那不是使用者決定不交易，是系統把他推出去的。
    // 訂單要先在正常狀態下建好——維護一開起來就建不了新訂單了。
    const CID4 = 'order-cancel-maintenance';
    await setDoc(`orders/${CID4}`, fnOrderBase, fnBuyer.token);
    await setDoc(
      'settings/trade',
      { enforceSafeHours: true, maintenance: true, updatedAt: new Date() },
      OWNER2
    );
    await updateDoc(
      `orders/${CID4}`,
      { status: 'rejected', lastActionBy: 'buyer' },
      fnBuyer.token
    );
    // 一樣沒有數字可以等——要驗的是「沒有增加」，只能給 trigger 時間落地再讀
    await new Promise((r) => setTimeout(r, 4000));
    eq('維護期間的取消不計入額度', await readCancel(fnBuyer.uid), 1);

    await setDoc(
      'settings/trade',
      { enforceSafeHours: true, maintenance: false, updatedAt: new Date() },
      OWNER2
    );

    // ── onOrderClosed：訂單結束時排定清除對話 ──────────────────────
    // 規則層那兩項驗的是「當事人不能自己寫 chatPurgeAt / chatPurged」，
    // 驗不到「觸發器真的會寫」。少了這一條，onOrderClosed 整支從沒被載入過
    // 也不會有人發現——而它正是「交易結束 24 小時後刪除對話」這個承諾的機制。
    const PID = 'order-purge-schedule';
    await setDoc(`orders/${PID}`, fnOrderBase, fnBuyer.token);
    await updateDoc(`orders/${PID}`, { status: 'accepted' }, fnSeller.token);
    const closedAtMs = Date.now();
    await updateDoc(
      `orders/${PID}`,
      { status: 'rejected', lastActionBy: 'buyer' },
      fnBuyer.token
    );

    let purgeDoc = null;
    for (let i = 0; i < 30; i++) {
      const r = await getDoc(`orders/${PID}`, fnBuyer.token);
      if (r.data?.chatPurgeAt) { purgeDoc = r.data; break; }
      await new Promise((r2) => setTimeout(r2, 500));
    }

    if (!purgeDoc) {
      bad(
        '訂單結束時 onOrderClosed 會排定清除對話',
        'chatPurgeAt 一直沒有被寫入。觸發器沒跑到，或它沒認得 rejected 這個終止態'
      );
    } else {
      eq('結束的訂單被標記為尚未清除', purgeDoc.chatPurged, false);
      const gapH = (new Date(purgeDoc.chatPurgeAt).getTime() - closedAtMs) / 3600000;
      gapH > 23 && gapH < 25
        ? ok('清除時間排在 24 小時後', `(+${gapH.toFixed(1)}h)`)
        : bad(
            '清除時間不是 24 小時後',
            `實際排在 +${gapH.toFixed(1)} 小時。檢舉窗口靠這個間隔撐著，太短會讓事後檢舉拿不到對話`
          );
    }
  })();

  /* ─────────────────────────────────────────────────────────────
     10. 平台設定（settings/trade）
     ───────────────────────────────────────────────────────────── */
  section('10. 平台設定（settings/trade）');

  // 交易時段限制的開關。一般人必須讀得到（TradeModal 靠它決定驗不驗），
  // 但只有管理員能改——否則任何人都能自己把安全時段規則關掉。
  await setDoc(
    'settings/trade',
    { enforceSafeHours: true, updatedAt: new Date() },
    'owner'
  );

  const setRead = await getDoc('settings/trade', buyer.token);
  setRead.ok
    ? ok('一般使用者讀得到交易設定', `(enforceSafeHours=${setRead.data.enforceSafeHours})`)
    : bad('一般使用者讀不到交易設定', `HTTP ${setRead.status}。讀不到就會退回「限制生效」，管理員關掉也沒人受惠`);

  expectDenied(
    '一般使用者不可自行關閉時段限制',
    await updateDoc('settings/trade', { enforceSafeHours: false }, buyer.token),
    'settings 的寫入限管理員。若任何人都能改，這條安全時段規則等於不存在'
  );

  expectDenied(
    '第三者同樣不可寫入平台設定',
    await setDoc('settings/trade', { enforceSafeHours: false }, third.token),
    '同上，create／覆寫也要一起擋'
  );

  /* ─────────────────────────────────────────────────────────────
     11. 交易功能維護中（緊急煞車）
     ───────────────────────────────────────────────────────────── */
  section('11. 交易功能維護中（緊急煞車）');

  // 這一節放最後，因為維護模式一開起來，前面那些「正常情況下該放行」的
  // 寫入全都會被擋——順序顛倒的話會誤判成一堆邏輯錯誤。
  //
  // 管理員不受維護限制那條沒辦法在這裡驗：isAdmin() 看的是 custom claims，
  // 這個 harness 沒有帶 claims 的身分。規則的結構本身保證了它——
  // orders.update 的 isAdmin() 分支在 maintenanceAllows() 之前就 or 掉了。

  // 維護開起來之後就建不了新訂單，所以要驗的訂單先在正常狀態下備好
  const MAINT_A = 'order-maint-freeze';
  const MAINT_B = 'order-maint-exit';
  await setDoc(`orders/${MAINT_A}`, orderBase, buyer.token);
  await setDoc(`orders/${MAINT_B}`, orderBase, buyer.token);

  expectDenied(
    '一般使用者不可自行開啟維護模式',
    await updateDoc('settings/trade', { maintenance: true }, buyer.token),
    '這是全站煞車，寫入權限必須跟其他平台設定一樣鎖在管理員'
  );

  // 用 owner（emulator 的規則繞過令牌）模擬管理端按下「緊急叫停」
  await setDoc(
    'settings/trade',
    { enforceSafeHours: true, maintenance: true, updatedAt: new Date() },
    'owner'
  );

  expectDenied(
    '維護中不可發起新交易',
    await setDoc('orders/order-maint-new', orderBase, buyer.token),
    'orders.create 的 inMaintenance()。只擋前端的煞車，繞過 TradeModal 直接打 REST 就沒了'
  );

  expectDenied(
    '維護中不可接受訂單',
    await updateDoc(`orders/${MAINT_A}`, { status: 'accepted' }, seller.token),
    'maintenanceAllows() 只放行 rejected，其他狀態變更一律擋'
  );

  expectDenied(
    '維護中不可提出新提案',
    await updateDoc(
      `orders/${MAINT_A}`,
      { status: 'negotiating', negotiationStep: 1, lastActionBy: 'seller' },
      seller.token
    ),
    '協商也是在推進交易狀態'
  );

  expectDenied(
    '維護中不可按下安全交易',
    await updateDoc(`orders/${MAINT_A}`, { buyerReady: true }, buyer.token),
    '面交流程整條要停住，否則出錯的地方會繼續被踩'
  );

  expectDenied(
    '維護中不可逾期關閉',
    await updateDoc(`orders/${MAINT_A}`, { status: 'expired' }, buyer.token),
    'expired 一樣是狀態變更；要結案請走取消那條出口'
  );

  expectAllowed(
    '維護中仍可取消（唯一的出口）',
    await updateDoc(
      `orders/${MAINT_B}`,
      { status: 'rejected', lastActionBy: 'buyer' },
      buyer.token
    ),
    '卡在一半、人可能已經在路上的使用者要能自己結案，否則只能乾等維護結束'
  );

  // 互評：拿一筆 owner 直接造好的 completed 訂單來試
  const MAINT_C = 'order-maint-review';
  await setDoc(
    `orders/${MAINT_C}`,
    { ...orderBase, status: 'completed', finalPrice: 100 },
    'owner'
  );
  expectDenied(
    '維護中不可互評',
    await setDoc(
      `reviews/${MAINT_C}_${buyer.uid}`,
      { orderId: MAINT_C, raterId: buyer.uid, ratedId: seller.uid, stars: 5, createdAt: new Date() },
      buyer.token
    ),
    '互評會觸發 onReviewCreated 去改 users 的評分彙總，維護期間資料不該再變動'
  );

  // 恢復營運：煞車放不掉的話，它本身就是另一種故障
  await setDoc(
    'settings/trade',
    { enforceSafeHours: true, maintenance: false, updatedAt: new Date() },
    'owner'
  );
  expectAllowed(
    '關閉維護後立刻恢復發起交易',
    await setDoc('orders/order-maint-after', orderBase, buyer.token),
    'inMaintenance() 讀的是即時的 settings/trade，不需要重新部署規則'
  );

  /* ─────────────────────────────────────────────────────────────
     12. 自由私訊的內容過濾與檢舉（規則層）
     ─────────────────────────────────────────────────────────────
     私訊從「六句固定短語」改成自由輸入之後，chatFilter.js 的偵測全都在前端，
     繞過前端直接打 REST 一行都不會跑。這一節驗的就是「繞過前端之後還剩下
     什麼」——也就是 firestore.rules 的 chatTextOk()。 */
  section('12. 自由私訊的內容過濾與檢舉（規則層）');

  const CID = 'order-chat-1';
  await setDoc(`orders/${CID}`, orderBase, buyer.token);
  await updateDoc(`orders/${CID}`, { status: 'accepted' }, seller.token);

  const msg = (id, fields, token = buyer.token) =>
    setDoc(`messages/${id}`, {
      orderId: CID,
      senderId: buyer.uid,
      createdAt: new Date(),
      ...fields,
    }, token);

  expectAllowed(
    '一般訊息送得出去',
    await msg('chat-ok-1', { text: '我在圖書館一樓等你' }),
    'chatTextOk 不該擋住正常對話'
  );

  expectAllowed(
    '單一個中文字送得出去',
    await msg('chat-ok-2', { text: '好' }),
    '擋的是單一英數字元（逐字傳送的最小單位），中文單字沒有那個用途'
  );

  expectDenied(
    '含 LINE 的訊息被擋（繞過前端也擋得住）',
    await msg('chat-line', { text: '加我line abc' }),
    'chatTextOk 的短 token 比對，前端的 chatFilter.js 只是體驗層'
  );

  expectDenied(
    '含 instagram 的訊息被擋',
    await msg('chat-ig', { text: 'my instagram is yabuy' }),
    'chatTextOk 的長字串比對'
  );

  expectDenied(
    '手機號碼被擋',
    await msg('chat-phone', { text: '0912345678' }),
    '8 個數字擠在一起就是電話號碼的形狀'
  );

  expectDenied(
    '用空格分隔的手機號碼一樣被擋',
    await msg('chat-phone2', { text: '09 12 34 56 78' }),
    'regex 允許數字之間夾最多 2 個非數字，分隔符躲不掉'
  );

  expectDenied(
    '單一個英文字母被擋',
    await msg('chat-single', { text: 'a' }),
    '逐字傳送聯絡資訊的最小單位，擋掉它才逼得出「兩字元一則」的節奏'
  );

  expectDenied(
    '超長訊息被擋（200 字上限）',
    await msg('chat-long', { text: '嗨'.repeat(201) }),
    '原本 text 連型別都沒驗，可以塞 1MB 字串進來'
  );

  expectDenied(
    '夾帶白名單外的欄位被擋',
    await msg('chat-extra', { text: '你好', contact: '0912345678' }),
    'create 原本沒有欄位白名單，聯絡資訊改放在別的欄位就完全繞過過濾'
  );

  // 這一條是整節最關鍵的：推遲請求是唯一豁免內容過濾的訊息，如果 kind:'delay'
  // 可以配任意 text，那它就是一個現成的後門——把聯絡資訊寫進 text 就送出去了。
  expectDenied(
    'kind=delay 不能拿來當夾帶聯絡資訊的後門',
    await msg('chat-fakedelay', {
      text: '加我line abc123',
      kind: 'delay',
      proposedTime: '2026-08-20 16:30',
      requestStatus: 'pending',
    }),
    'delayMsgOk 要求 text 一字不差等於由 proposedTime 組出來的那句話'
  );

  expectDenied(
    '推遲請求的 proposedTime 格式不符時被擋',
    await msg('chat-baddelay', {
      text: '⏰ 希望推遲至 明天下午 面交，可以嗎？',
      kind: 'delay',
      proposedTime: '明天下午',
      requestStatus: 'pending',
    }),
    'proposedTime 必須是 YYYY-MM-DD HH:mm，否則 orders.time 會被寫進垃圾'
  );

  note(
    '管理員讀 messages（檢舉查證用）沒有被驗到：emulator helper 沒有辦法產生帶 ' +
      'admin custom claim 的 idToken。規則已寫在 messages.read 的 isAdmin() 分支。'
  );

  // ── 前端不可竄改對話清除排程 ──
  expectDenied(
    '當事人不可自己寫 chatPurgeAt',
    await updateDoc(`orders/${CID}`, { chatPurgeAt: new Date(Date.now() + 9e11) }, buyer.token),
    'chatPurgeFieldsKept：能寫的話就能把清除時間推到天邊，對話永遠不會被刪'
  );

  expectDenied(
    '當事人不可自己把 chatPurged 設成 true',
    await updateDoc(`orders/${CID}`, { chatPurged: true }, seller.token),
    'chatPurgeFieldsKept：設成 true 會讓排程跳過這筆，同樣清不掉'
  );

  // ── 檢舉 ──
  const reportBase = {
    orderId: CID,
    reporterId: buyer.uid,
    reportedId: seller.uid,
    reason: '騷擾、辱罵或不當言論',
    detail: '對方一直要我加他的通訊軟體',
    snapshot: [{ senderId: seller.uid, text: '加我好友', createdAt: Date.now() }],
    status: 'open',
    createdAt: new Date(),
  };

  expectAllowed(
    '當事人可以檢舉對方',
    await setDoc('reports/rep-1', reportBase, buyer.token),
    '過濾器認不出來的騷擾，只剩這條通道'
  );

  expectDenied(
    '第三者不能對別人的訂單提出檢舉',
    await setDoc('reports/rep-third', { ...reportBase, reporterId: third.uid }, third.token),
    'reports.create 用 isOrderParty() 判定，否則誰都能對任何人送檢舉'
  );

  expectDenied(
    '不能冒用別人的身分送檢舉',
    await setDoc('reports/rep-spoof', reportBase, seller.token),
    'reporterId 必須等於 auth.uid，否則可以偽造「對方檢舉了自己」'
  );

  expectDenied(
    '不能檢舉自己',
    await setDoc('reports/rep-self', { ...reportBase, reportedId: buyer.uid }, buyer.token),
    'reportedId != auth.uid'
  );

  expectDenied(
    '被檢舉人讀不到檢舉內容',
    await getDoc('reports/rep-1', seller.token),
    'reports.read 只給檢舉人本人與管理員——被檢舉人看得到的話會直接引發報復'
  );

  expectAllowed(
    '檢舉人讀得到自己送出的檢舉',
    await getDoc('reports/rep-1', buyer.token),
    '不然使用者不知道有沒有送成功、處理到哪'
  );

  expectDenied(
    '檢舉人不能自己把檢舉標記成已處置',
    await updateDoc('reports/rep-1', { status: 'actioned' }, buyer.token),
    'reports.update 限 isAdmin()，狀態是管理員的判斷不是當事人的'
  );

  /* ─────────────────────────────────────────────────────────────
     13. 書本徵求：金流方向反轉（規則層）
     ─────────────────────────────────────────────────────────────
     這一節驗的是「錢的方向」。徵求模式下 buyerId 是發起者但收錢、
     sellerId 是貼文主人但付錢——這與一般交易完全相反，而規則層是唯一
     擋得住繞過前端的地方。漏掉這裡，付錯錢不會有任何檢查變紅。 */
  section('13. 書本徵求：金流方向反轉（規則層）');

  // 貼文主人是 seller（付錢方），應徵並發起訂單的是 buyer（收錢方）
  await setDoc('book_requests/req-1', {
    requesterId: seller.uid,
    requesterName: '徵求方',
    bookName: '離散數學',
    college: '資訊電機學院',
    dept: '資訊工程學系',
    wantPrice: 300,
    url: 'https://example.com/x.jpg',
    status: 'open',
    createdAt: new Date(),
  }, seller.token);

  expectDenied(
    '不能冒用別人的身分發布徵求',
    await setDoc('book_requests/req-spoof', {
      requesterId: seller.uid, requesterName: '冒名', bookName: '線性代數',
      college: '資訊電機學院', dept: '資訊工程學系', wantPrice: 200,
      status: 'open', createdAt: new Date(),
    }, buyer.token),
    'requesterId 必須等於登入者本人'
  );

  expectDenied(
    '願付金額不能超過成交價上限',
    await setDoc('book_requests/req-rich', {
      requesterId: buyer.uid, requesterName: '買家', bookName: '天價書',
      college: '資訊電機學院', dept: '資訊工程學系', wantPrice: 99999,
      status: 'open', createdAt: new Date(),
    }, buyer.token),
    '貼文寫得出來、面交時卻被 finalPriceOk 擋掉的話，人已經到現場了才發現'
  );

  expectDenied(
    '應徵者不能關掉別人的徵求貼文',
    await updateDoc('book_requests/req-1', { status: 'closed' }, buyer.token),
    '不然可以把競爭對手的徵求關掉，讓別人應徵不到'
  );

  const wantedOrder = {
    buyerId: buyer.uid, buyerName: '提供方',
    sellerId: seller.uid, sellerName: '徵求方',
    productId: '', productName: '離散數學', productPrice: 300,
    location: '圖書館前', time: '2026-08-20 14:00',
    originalTime: '2026-08-20 14:00',
    status: 'pending', negotiationStep: 0,
    mode: 'wanted', requestId: 'req-1',
    createdAt: new Date(),
  };

  expectAllowed(
    '有書的人可以應徵徵求貼文',
    await setDoc('orders/order-wanted-1', wantedOrder, buyer.token),
    '徵求訂單沒有 productId，改用 requestId 回頭驗 book_requests'
  );

  expectDenied(
    '不能拿別人的徵求貼文把路人填成付錢方',
    await setDoc('orders/order-wanted-bad', {
      ...wantedOrder, sellerId: third.uid, requestId: 'req-1',
    }, buyer.token),
    'wantedRequestOk() 要求貼文的 requesterId 必須等於訂單的 sellerId'
  );

  expectDenied(
    '徵求訂單不可以同時帶 productId',
    await setDoc('orders/order-wanted-both', {
      ...wantedOrder, productId: PID,
    }, buyer.token),
    '兩條路只能走一條，否則可以繞過 sellerOwnsProduct'
  );

  await updateDoc('orders/order-wanted-1', { status: 'accepted' }, seller.token);

  expectDenied(
    'mode 不可事後竄改',
    await updateDoc('orders/order-wanted-1', { mode: '' }, seller.token),
    '改得動的話，付錢的一方翻一下就變成收錢的一方，還能自己確認自己的交易'
  );

  // ── 金額：付錢的是徵求方（seller），不是發起訂單的 buyer ──
  expectDenied(
    '徵求模式下收錢方不能填金額',
    await updateDoc('orders/order-wanted-1', { finalPrice: 300 }, buyer.token),
    '一般交易是 buyer 填，徵求模式相反——finalPriceOk 要問 payerUid()'
  );

  expectAllowed(
    '徵求模式下付錢方（貼文主人）才能填金額',
    await updateDoc('orders/order-wanted-1', { finalPrice: 300 }, seller.token),
    'payerUid() 在 mode==wanted 時回傳 sellerId'
  );

  // ── 成交：按下確認的是收錢方（buyer） ──
  expectDenied(
    '徵求模式下付錢方不能自己按成交',
    await updateDoc('orders/order-wanted-1', { status: 'completed' }, seller.token),
    '不然徵求方可以單方面把交易標成完成，對方連書都還沒拿到'
  );

  expectAllowed(
    '徵求模式下收錢方才能按成交',
    await updateDoc('orders/order-wanted-1', { status: 'completed' }, buyer.token),
    'statusFlowOk 的 completed 分支要問 receiverUid()'
  );

  // ── 一般交易的方向沒有被這次改動弄反 ──
  const DIRID = 'order-normal-direction';
  await setDoc(`orders/${DIRID}`, orderBase, buyer.token);
  await updateDoc(`orders/${DIRID}`, { status: 'accepted' }, seller.token);

  expectDenied(
    '一般交易：賣家不能填金額（方向沒被弄反）',
    await updateDoc(`orders/${DIRID}`, { finalPrice: 350 }, seller.token),
    '這條是回歸檢查——徵求功能不該把一般交易的金流方向改掉'
  );
  expectAllowed(
    '一般交易：買家填金額仍然可以',
    await updateDoc(`orders/${DIRID}`, { finalPrice: 350 }, buyer.token),
    '同上'
  );
  expectDenied(
    '一般交易：買家不能自己按成交',
    await updateDoc(`orders/${DIRID}`, { status: 'completed' }, buyer.token),
    '同上'
  );

  /* ── 總結 ──────────────────────────────────────────────────── */
  console.log(C.b('\n─────────────────────────────────────────────'));
  console.log(C.b(`結果  通過 ${pass} 項，失敗 ${fail} 項`));

  if (notes.length) {
    console.log(
      C.y(`\n${notes.length} 項註記（不是失敗，是「規則層沒有防護、只靠前端」的紀錄）：`)
    );
    notes.forEach((n, i) => console.log(C.d(`  ${i + 1}. ${n}`)));
  }

  if (fail) {
    console.log(C.r('\n失敗項目：'));
    failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
    process.exit(1);
  }
  console.log(C.g('\n全數通過。'));
})().catch((e) => {
  console.error(C.r(`\n執行錯誤：${e.message}`));
  console.error(C.d('若是連線錯誤，請確認 npm run emu 正在執行。'));
  process.exit(1);
});
