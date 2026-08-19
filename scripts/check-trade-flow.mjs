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
