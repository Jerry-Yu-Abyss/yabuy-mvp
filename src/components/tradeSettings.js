// tradeSettings.js
// 平台層級的交易設定，目前有兩項開關：
//   enforceSafeHours 交易時段限制（06:00–18:00）要不要強制
//   simpleTradeMode  簡易交易模式：面交流程要不要省略掉可以省的關卡
//
// 為什麼要有這些開關：它們都是產品層的安全規則，但驗證逾期、推遲、面交流程
// 時常常需要在晚上造資料、或在沒有實體 QR 的環境把面交跑到底，被規則擋住就
// 只能改程式碼再部署一次。開關做成 Firestore 的一份文件，管理端可以即時切換，
// 不必動到程式碼——被省略掉的關卡程式碼完整保留，只是可以繞過。
//
// 為什麼是「簡易交易模式」而不是「掃碼開關」：面交流程還有其他可以再簡化的
// 關卡（金額兩段確認、雙方各按一次安全交易）。做成一個總開關，之後要再省一
// 站時是在這個開關底下多加一條，管理端不會長成一排彼此有交互作用的開關。
// 目前這個開關管的只有一件事：**跳過「掃描交易點 QR」那一站**。
//
// 單一事實來源：TradeModal.vue（發起交易）與 CannedChat.vue（推遲提議）都走
// 這裡的 isTradeHourAllowed()，避免兩邊各寫一份 hour >= 6 而改了一邊漏一邊。
//
// ⚠️ 時段這條限制從來就只有前端在擋（firestore.rules 沒有、也算不出時段——
// orders.time 是不含時區的字串）。所以那個開關關掉的是「前端會不會擋」，
// 不是「規則層放不放行」。

import { ref, computed } from 'vue';
import { db } from '@/firebase';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';

export const SAFE_HOUR_START = 6;
export const SAFE_HOUR_END = 18;
export const SETTINGS_DOC = 'trade';

// 兩個開關的預設值刻意不同方向，因為失敗的代價不一樣：
//
// enforceSafeHours 預設 true（限制生效）——所有失敗路徑都回到 true。讀不到設
// 定（還沒登入、規則擋掉、文件不存在、監聽斷線）時寧可擋住一筆合法交易讓人
// 回報，也不要靜默把整條安全時段規則放掉。
//
// simpleTradeMode 預設 true（簡易流程）——掃碼那一站擋不住詐騙，它只是「有沒
// 有到現場」的佐證；但沒貼 QR 的交易點、讀不到設定的裝置，卻會被它整條面交
// 流程卡死，連金額確認與互評都走不到。這裡的失敗方向是「讓交易走得完」。
// 要恢復掃碼是管理端一鍵的事，見 Admin.vue 的「簡易交易模式」卡片。
export const SIMPLE_MODE_DEFAULT = true;

export const enforceSafeHours = ref(true);
export const simpleTradeMode = ref(SIMPLE_MODE_DEFAULT);

// 面交流程要不要經過掃碼那一站。Deal.vue／DealTimeline.vue 讀的是這個衍生值，
// 不是直接讀 simpleTradeMode——之後簡易模式若再多省一站，那些檔案不必跟著改。
export const enforceQrScan = computed(() => !simpleTradeMode.value);

let unsubscribe = null;

/**
 * settings/trade 讀出 simpleTradeMode。
 * 這輪之前的管理端寫的是 enforceQrScan（相反極性），線上文件很可能只有舊欄位，
 * 所以新欄位缺漏時退回讀舊欄位——已經明確把掃碼「重新開啟」過的站台，不會因為
 * 這次改版被預設值悄悄關回去。兩個都沒有才用預設值。
 */
const readSimpleMode = (d) => {
  if (typeof d.simpleTradeMode === 'boolean') return d.simpleTradeMode;
  if (typeof d.enforceQrScan === 'boolean') return d.enforceQrScan === false;
  return SIMPLE_MODE_DEFAULT;
};

/**
 * 訂閱設定。重複呼叫只會建立一個監聽器，所以哪個畫面先用到就在哪裡呼叫，
 * 不需要集中在 App.vue 管理生命週期。
 */
export const subscribeTradeSettings = () => {
  if (unsubscribe) return unsubscribe;
  unsubscribe = onSnapshot(
    doc(db, 'settings', SETTINGS_DOC),
    (snap) => {
      const d = snap.exists() ? snap.data() : {};
      // 只有明確存成 false 才算關閉時段限制；欄位缺漏一律當作限制生效
      enforceSafeHours.value = d.enforceSafeHours !== false;
      simpleTradeMode.value = readSimpleMode(d);
    },
    (err) => {
      console.error('[tradeSettings] 讀取設定失敗，回到預設值：', err.code, err.message);
      enforceSafeHours.value = true;
      simpleTradeMode.value = SIMPLE_MODE_DEFAULT;
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
const writeSetting = (fields, uid) =>
  setDoc(
    doc(db, 'settings', SETTINGS_DOC),
    {
      ...fields,
      updatedAt: serverTimestamp(),
      updatedBy: uid || null
    },
    { merge: true }
  );

export const setEnforceSafeHours = (on, uid) =>
  writeSetting({ enforceSafeHours: !!on }, uid);

// 舊欄位一起寫，兩個欄位不會互相矛盾——萬一要回滾這版程式碼，線上文件仍然是
// 舊版讀得懂的狀態。
export const setSimpleTradeMode = (on, uid) =>
  writeSetting({ simpleTradeMode: !!on, enforceQrScan: !on }, uid);
