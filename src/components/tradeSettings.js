// tradeSettings.js
// 平台層級的交易設定，目前只有一項：交易時段限制（06:00–18:00）要不要強制。
//
// 為什麼要有這個開關：那條限制是「安全時段」的產品規則，但驗證逾期、推遲、
// 面交流程時常常需要在晚上造資料，被時段限制擋住就只能改程式碼再部署一次。
// 開關做成 Firestore 的一份文件，管理端可以即時切換，不必動到程式碼。
//
// 單一事實來源：TradeModal.vue（發起交易）與 CannedChat.vue（推遲提議）都走
// 這裡的 isTradeHourAllowed()，避免兩邊各寫一份 hour >= 6 而改了一邊漏一邊。
//
// ⚠️ 這條限制從來就只有前端在擋（firestore.rules 沒有、也算不出時段——
// orders.time 是不含時區的字串）。所以這個開關關掉的是「前端會不會擋」，
// 不是「規則層放不放行」。

import { ref } from 'vue';
import { db } from '@/firebase';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';

export const SAFE_HOUR_START = 6;
export const SAFE_HOUR_END = 18;
export const SETTINGS_DOC = 'trade';

// 預設 true，而且所有失敗路徑都回到 true：讀不到設定（還沒登入、規則擋掉、
// 文件不存在、監聽斷線）時一律當作「限制生效」。失敗方向要保守——寧可擋住
// 一筆合法交易讓人回報，也不要靜默把整條安全時段規則放掉。
export const enforceSafeHours = ref(true);

let unsubscribe = null;

/**
 * 訂閱設定。重複呼叫只會建立一個監聽器，所以哪個畫面先用到就在哪裡呼叫，
 * 不需要集中在 App.vue 管理生命週期。
 */
export const subscribeTradeSettings = () => {
  if (unsubscribe) return unsubscribe;
  unsubscribe = onSnapshot(
    doc(db, 'settings', SETTINGS_DOC),
    (snap) => {
      // 只有明確存成 false 才算關閉；欄位缺漏一律當作限制生效
      enforceSafeHours.value = snap.exists()
        ? snap.data().enforceSafeHours !== false
        : true;
    },
    (err) => {
      console.error('[tradeSettings] 讀取設定失敗，維持限制開啟：', err.code, err.message);
      enforceSafeHours.value = true;
    }
  );
  return unsubscribe;
};

/** 這個小時是否落在安全時段內（不看開關，純粹判斷時段） */
export const isWithinSafeHours = (hour) =>
  hour >= SAFE_HOUR_START && hour < SAFE_HOUR_END;

/** 這個小時目前能不能用來交易（開關關掉時一律放行） */
export const isTradeHourAllowed = (hour) =>
  !enforceSafeHours.value || isWithinSafeHours(hour);

/** 管理端切換。規則層限定只有管理員寫得動 settings。 */
export const setEnforceSafeHours = (on, uid) =>
  setDoc(
    doc(db, 'settings', SETTINGS_DOC),
    {
      enforceSafeHours: !!on,
      updatedAt: serverTimestamp(),
      updatedBy: uid || null
    },
    { merge: true }
  );
