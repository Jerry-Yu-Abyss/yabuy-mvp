// tradeRoles.js
// 訂單裡「誰付錢、誰收錢」的單一事實來源。
//
// 為什麼需要這個檔案：一般交易與書本徵求的金流方向是相反的。
//
//   一般上架（mode 沒有或 'listing'）
//     buyerId  = 發起訂單的人 = 付錢     → 填金額
//     sellerId = 商品擁有者   = 收錢     → 確認成交
//
//   書本徵求（mode === 'wanted'）
//     buyerId  = 有書的人（發起訂單）= 收錢 → 確認成交
//     sellerId = 徵求方（貼文的人）  = 付錢 → 填金額
//
// 為什麼徵求模式下發起訂單的人反而是 buyerId：firestore.rules 的 orders.create
// 綁死了 `buyerId == request.auth.uid`，也就是「發起者一定是 buyerId」。要讓有書
// 的人能主動應徵，他就只能坐在 buyerId 這個位子上。所以 buyerId 在徵求模式下
// 代表的是「發起者」而不是「付錢的人」——這兩件事在一般模式下剛好重合，才會被
// 混為一談。
//
// ⚠️ 這個檔案存在的唯一理由是「不要讓判斷散出去」。任何地方要問「這個人能不能
// 填金額 / 能不能按成交 / 對方該叫什麼」，一律呼叫這裡，不要自己寫
// `role === 'buy'`——那種寫法在徵求模式下就是把錢的方向弄反，而且漏改一處不會有
// 任何測試變紅，只會有人付錯錢。
//
// firestore.rules 有一份對應的實作（payerUid() / receiverUid()），兩邊要同步。

/** 這筆訂單是不是書本徵求 */
export const isWantedOrder = (order) => order?.mode === 'wanted';

/** 付錢的那一方的 uid */
export const payerUid = (order) =>
  isWantedOrder(order) ? order?.sellerId : order?.buyerId;

/** 收錢的那一方的 uid */
export const receiverUid = (order) =>
  isWantedOrder(order) ? order?.buyerId : order?.sellerId;

/**
 * 付錢方在信箱裡的分頁代號（'buy' | 'sell'）。
 * Mailbox 與 Deal 用 role 字串在跑，這裡把它翻譯成金流角色。
 */
export const payerRole = (order) => (isWantedOrder(order) ? 'sell' : 'buy');

/** 收錢方的分頁代號 */
export const receiverRole = (order) => (isWantedOrder(order) ? 'buy' : 'sell');

/** 我（以這個 role 進入畫面）是不是付錢的那一方 → 要填金額 */
export const isPayer = (order, role) => role === payerRole(order);

/** 我是不是收錢的那一方 → 要確認成交 */
export const isReceiver = (order, role) => role === receiverRole(order);

/**
 * 對方該怎麼稱呼。
 * 一般交易沿用「買家／賣家」；徵求模式下那兩個詞會讓人以為錢的方向相反，
 * 所以改用「徵求方／提供方」——徵求方出錢求書，提供方拿出書收錢。
 */
export const counterpartLabel = (order, myRole) => {
  if (isWantedOrder(order)) {
    return myRole === 'buy' ? '徵求方' : '提供方';
  }
  return myRole === 'buy' ? '賣家' : '買家';
};

/** 我自己這一方該怎麼稱呼 */
export const selfLabel = (order, myRole) => {
  if (isWantedOrder(order)) {
    return myRole === 'buy' ? '提供方' : '徵求方';
  }
  return myRole === 'buy' ? '買家' : '賣家';
};

/**
 * 這筆訂單在信箱卡片上的模式標籤，沒有就回 null（一般交易不需要多一個標籤）。
 */
export const modeBadge = (order) => (isWantedOrder(order) ? '📖 書本徵求' : null);
