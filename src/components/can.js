// can.js
// 罐頭訊息：交易時間前雙方的即時協調用語。只給預設短語，不開放自由輸入，
// 避免面交協調管道被拿來做騷擾或私下議價（那些場景已有既有的「更改提案」流程）。

import { db } from '@/firebase';
import { collection, addDoc, doc, query, where, orderBy, onSnapshot, serverTimestamp, writeBatch } from 'firebase/firestore';

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

export const sendCannedMessage = (orderId, senderId, text) =>
  addDoc(collection(db, 'messages'), {
    orderId,
    senderId,
    text,
    createdAt: serverTimestamp()
  });

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
