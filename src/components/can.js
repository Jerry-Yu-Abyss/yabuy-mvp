// can.js
// 面交前的私訊：交易時間前雙方的即時協調管道。
//
// 這裡原本只給六句固定短語、不開放自由輸入，用「輸入面積為零」換安全。現在改
// 成自由輸入，那份安全要用別的東西補回來，分成三層：
//   1. chatFilter.js  ——  偵測聯絡資訊與騷擾用語（含拆字、全形、逐字傳送）
//   2. firestore.rules 的 chatTextOk() —— 同一批判斷的粗版，繞過前端也擋得住
//   3. reports        ——  過濾器認不出來的，讓收訊的人自己檢舉
// 另外訂單結束 24 小時後 Cloud Function 會清光這串對話（purgeClosedOrderMessages）。
//
// 下面的 CANNED_MESSAGES 留著，但性質變了：從「唯一能送的東西」變成「常用短語
// 快捷鍵」，點一下直接送出，省得每次都要打字。

import { db } from '@/firebase';
import { collection, addDoc, doc, query, where, orderBy, onSnapshot, serverTimestamp, writeBatch } from 'firebase/firestore';
import { inspectMessage } from './chatFilter.js';

export const CANNED_MESSAGES = [
  '我到了，你在哪裡？',
  '我快到了，請稍等一下',
  '不好意思，我會晚 5-10 分鐘',
  '好的，沒問題',
  '可以麻煩再確認一次地點嗎？',
  '謝謝，辛苦了'
];

// 即時訂閱某筆訂單的訊息串，依時間正序排列
export const subscribeOrderMessages = (orderId, callback, onError) => {
  const q = query(
    collection(db, 'messages'),
    where('orderId', '==', orderId),
    orderBy('createdAt', 'asc')
  );
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      console.error('[can.js] 訊息監聽失敗（檢查 messages 的 orderId+createdAt 索引）：', err.code, err.message);
      onError?.(err);
    }
  );
};

/**
 * 送出一則訊息。過濾在這裡再跑一次，不是只在 UI 跑——UI 的即時提示是為了讓
 * 使用者邊打邊知道會不會被擋，但送出這條路徑不能依賴「畫面有沒有先擋住」。
 * 兩邊都叫同一個 inspectMessage()，不會出現「輸入框說可以、送出卻被擋」。
 *
 * @param {Array} myRecent 我自己最近送出的訊息，交給跨訊息偵測用（逐字傳送）
 * @throws {Error} 被擋下時丟出，message 就是給使用者看的理由
 */
export const sendChatMessage = (orderId, senderId, text, myRecent = []) => {
  const verdict = inspectMessage(text, myRecent);
  if (!verdict.ok) {
    const err = new Error(verdict.reason);
    err.code = 'chat/blocked';
    throw err;
  }
  return addDoc(collection(db, 'messages'), {
    orderId,
    senderId,
    text: String(text).trim(),
    createdAt: serverTimestamp()
  });
};

/* ────────────────────────────────────────────────────────────────
   推遲面交時間的請求
   ────────────────────────────────────────────────────────────────
   跟一般罐頭訊息的差別：這是一則「帶著提議時間、等對方回覆」的結構化訊息，
   同意後會直接改寫 orders.time。多出來的欄位：
     kind: 'delay'          一般訊息沒有這個欄位，用來分辨要不要渲染成卡片
     proposedTime           與 orders.time 同格式的 "YYYY-MM-DD HH:mm"
     requestStatus          'pending' | 'accepted' | 'declined'
   額度是買賣各 1 次，記在 orders.buyerDelayUsed / sellerDelayUsed，
   firestore.rules 的 delayUsedOk() 會強制，不是只靠前端。 */

export const DELAY_LABEL = '⏰ 希望推遲面交時間';

// 訊息與額度旗標一定要一起成立：分成兩次寫，任一次失敗都會留下爛狀態
// （請求發出去了但額度沒扣＝可無限發；額度扣了但訊息沒發＝白白浪費一次）。
// writeBatch 是原子的，規則擋掉其中一筆時整批都不會生效。
export const sendDelayRequest = (orderId, senderId, role, proposedTime) => {
  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'messages')), {
    orderId,
    senderId,
    text: `⏰ 希望推遲至 ${proposedTime} 面交，可以嗎？`,
    kind: 'delay',
    proposedTime,
    requestStatus: 'pending',
    createdAt: serverTimestamp()
  });
  batch.update(doc(db, 'orders', orderId), {
    [role === 'buy' ? 'buyerDelayUsed' : 'sellerDelayUsed']: true,
    updatedAt: serverTimestamp()
  });
  return batch.commit();
};

// 同理：同意的當下要同時「標記這則請求已同意」與「真的改掉約定時間」。
// 只做前者＝對方以為改好了其實沒改；只做後者＝卡片永遠停在等待回覆。
export const acceptDelayRequest = (orderId, messageId, proposedTime) => {
  const batch = writeBatch(db);
  batch.update(doc(db, 'messages', messageId), { requestStatus: 'accepted' });
  batch.update(doc(db, 'orders', orderId), {
    time: proposedTime,
    updatedAt: serverTimestamp()
  });
  return batch.commit();
};

export const declineDelayRequest = (messageId) =>
  writeBatch(db).update(doc(db, 'messages', messageId), { requestStatus: 'declined' }).commit();

/* ────────────────────────────────────────────────────────────────
   檢舉
   ────────────────────────────────────────────────────────────────
   過濾器只攔得住有固定形狀的東西（電話號碼、平台名稱）。換句話說的騷擾、
   施壓殺價、恐嚇，只有收訊的人自己認得出來——沒有這條通道的話，使用者唯一的
   自救手段是取消交易，而取消會扣自己的額度，等於被騷擾還要自己付代價。

   snapshot 是「當下這串對話」的副本。它存在的理由是 messages 會在訂單結束
   24 小時後被清光，屆時管理員手上會什麼都不剩。它是檢舉人片面提供的，管理端
   顯示時要當成「檢舉人的說法」；清除之前的查證仍然要看真正的 messages
   （firestore.rules 已開放管理員讀取）。 */

const SNAPSHOT_MAX = 100;

// Firestore Timestamp 不能直接塞進陣列元素裡再送出去（serverTimestamp 不行，
// Timestamp 物件則會讓 rules 的 list 大小判斷變複雜），統一轉成毫秒數字。
const snapshotTime = (v) => {
  if (typeof v?.toMillis === 'function') return v.toMillis();
  if (v instanceof Date) return v.getTime();
  return typeof v === 'number' ? v : null;
};

export const createReport = ({ orderId, reporterId, reportedId, reason, detail, messages }) =>
  addDoc(collection(db, 'reports'), {
    orderId,
    reporterId,
    reportedId,
    reason,
    detail: String(detail || '').trim(),
    snapshot: (messages || []).slice(-SNAPSHOT_MAX).map((m) => ({
      senderId: m.senderId || '',
      text: String(m.text || ''),
      createdAt: snapshotTime(m.createdAt)
    })),
    status: 'open',
    createdAt: serverTimestamp()
  });
