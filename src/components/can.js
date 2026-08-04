// can.js
// 罐頭訊息：交易時間前雙方的即時協調用語。只給預設短語，不開放自由輸入，
// 避免面交協調管道被拿來做騷擾或私下議價（那些場景已有既有的「更改提案」流程）。

import { db } from '@/firebase';
import { collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';

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
