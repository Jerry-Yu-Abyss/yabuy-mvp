// ================= 🌟 YaBuy 共用「登入驗證狀態」模組 =================
// 目的：把「使用者是否通過驗證」的判定收斂成單一份邏輯，供全站共用──
//   1) Landing.vue / User.vue 的 upsertUserDoc()：建檔時就寫入 verify（不可遺漏）。
//   2) App.vue / 各頁守門：以 reload() 拿到的最新狀態回寫 Firestore。
//   3) TradeModal.vue 與各頁 handleTradeRequest：發起交易前的即時守門。
//
// verify 三態（對應需求 {google, email, no yet}，no yet 正規化為 not_yet）：
//   'google'   → 已完成信箱驗證，且帳號含 Google 登入方式
//   'email'    → 已完成信箱驗證（電子郵件密碼登入）
//   'not_yet'  → 尚未完成信箱驗證（不論是否曾綁定 Google）

import { sendEmailVerification } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/firebase';

export const VERIFY_GOOGLE = 'google';
export const VERIFY_EMAIL = 'email';
export const VERIFY_NOT_YET = 'not_yet';

// 提示文案：action 依呼叫端而異（發起交易 / 發布商品），避免上架流程顯示「發起交易」。
// sent=true  → 這次真的寄了新信
// sent=false → 冷卻中刻意不寄，提醒收「最新一封」，避免使用者點到已失效的舊連結
export const verifyBlockMsg = (action, sent) =>
  sent
    ? `📩 請先驗證您的電子郵件，才能${action}。已為您寄送驗證信。`
    : `📩 請先完成信箱驗證才能${action}。驗證信已寄出，請至信箱點擊「最新一封」的連結。`;

// 帳號是否「曾綁定 / 使用過」Google（providerData 內含 google.com）
const isGoogleUser = (fbUser) =>
  !!fbUser?.providerData?.some((p) => p.providerId === 'google.com');

// 由 Firebase user 物件推導 verify 狀態。
// 核心：以 emailVerified 為準；不可因曾綁定 Google 就跳過未驗證的信箱。
export const resolveVerifyStatus = (fbUser) => {
  if (!fbUser) return VERIFY_NOT_YET;
  if (!fbUser.emailVerified) return VERIFY_NOT_YET;
  if (isGoogleUser(fbUser)) return VERIFY_GOOGLE;
  return VERIFY_EMAIL;
};

// 某個 verify 狀態是否算「已通過驗證」（可發起交易 / 上架）
export const isVerified = (status) =>
  status === VERIFY_GOOGLE || status === VERIFY_EMAIL;

// ── 回寫 Firestore users.verify（單一寫入點）──
// 防降級：onAuthStateChanged 拿到的 user 來自 IndexedDB 快取，使用者若在別的
// 分頁 / 手機完成驗證，此處 emailVerified 可能仍是 false。若直接覆寫，會把正確的
// 'email' 打回 'not_yet'。因此只允許「未驗證 → 已驗證」方向的更新。
export const syncVerifyStatus = async (fbUser, status) => {
  if (!fbUser?.uid) return;
  try {
    const userRef = doc(db, 'users', fbUser.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) return;                 // 建檔交給 upsertUserDoc，不在這裡補
    const current = snap.data().verify;
    if (current === status) return;             // 無變化就不浪費一次寫入
    if (isVerified(current) && !isVerified(status)) return;  // 阻擋降級
    await updateDoc(userRef, { verify: status });
  } catch (e) {
    /* 離線 / 權限問題不影響主流程 */
  }
};

// ── 交易 / 上架前的即時守門 ──
// reload() 拉最新 emailVerified；剛點完驗證信的使用者不會被誤擋。
// reload 成功才回寫 Firestore —— 失敗時的狀態不可信，不拿來寫資料庫。
//
// 🌟 效能修正：reload() 是打 Firebase Auth 伺服器的真實網路請求，網路差的時候
// 可能要好幾秒。emailVerified 只會從 false 變 true，不會反過來（已驗證的帳號
// 不可能又變回未驗證），所以 reload() 唯一有意義的場景是「使用者剛在別的分頁
// 點完驗證信連結，這裡的本機快取還是 false，要去問伺服器最新狀態」。
// 已經是 true 的話，重新問一次伺服器只是白白浪費一次網路往返——這支函式被
// 每次發起交易／上架前的即時守門呼叫（TradeModal/Cam.vue 的 blockUnverifiedForTrade），
// 使用者已驗證後，每按一次「發送」都要多等一次這個不必要的網路請求，
// 就是回報「按鈕變遲緩」的根本原因。
export const ensureVerified = async (fbUser, { sync = true } = {}) => {
  if (!fbUser) return { ok: false, status: VERIFY_NOT_YET };

  if (fbUser.emailVerified) {
    return { ok: isVerified(resolveVerifyStatus(fbUser)), status: resolveVerifyStatus(fbUser) };
  }

  let reloaded = false;
  try {
    await fbUser.reload();
    reloaded = true;
  } catch (e) {
    /* reload 失敗：沿用目前 emailVerified 判定，不擋死流程 */
  }
  const status = resolveVerifyStatus(fbUser);
  if (sync && reloaded) await syncVerifyStatus(fbUser, status);
  return { ok: isVerified(status), status };
};

// ── 重寄驗證信（含節流）──
// 為什麼要節流：Firebase 每寄出一封驗證信，就會讓前一封的連結失效。使用者若連點
// 幾次交易，信箱會收到多封信、而只有最後一封有效，點到舊的就出現
// 「連結已過期或已被使用」。60 秒內不重複寄送，並改提示「請收最新一封」。
const RESEND_COOLDOWN_MS = 60_000;
const resendKey = (uid) => `yabuy:verifyMailAt:${uid}`;

const readLastSentAt = (uid) => {
  try {
    return Number(localStorage.getItem(resendKey(uid))) || 0;
  } catch (e) {
    return 0;   // 無痕模式等存取失敗時，視同沒寄過
  }
};
const writeLastSentAt = (uid, ts) => {
  try { localStorage.setItem(resendKey(uid), String(ts)); } catch (e) { /* 忽略 */ }
};

// 回傳 { sent, waitMs }：sent=false 且 waitMs>0 表示仍在冷卻，本次刻意不寄。
export const sendVerificationThrottled = async (fbUser) => {
  if (!fbUser) return { sent: false, waitMs: 0 };
  const now = Date.now();
  const elapsed = now - readLastSentAt(fbUser.uid);
  if (elapsed < RESEND_COOLDOWN_MS) {
    return { sent: false, waitMs: RESEND_COOLDOWN_MS - elapsed };
  }
  try {
    await sendEmailVerification(fbUser);
    writeLastSentAt(fbUser.uid, now);
    return { sent: true, waitMs: 0 };
  } catch (e) {
    return { sent: false, waitMs: 0, error: e };   // 寄送失敗不影響提示
  }
};

// 共用攔截：回傳 true 表示可繼續；false 表示已提示並（可選）視冷卻狀況重寄驗證信。
export const blockUnverifiedForTrade = async (
  fbUser, toastFn, { resend = true, action = '發起交易' } = {}
) => {
  const { ok } = await ensureVerified(fbUser);
  if (ok) return true;
  const { sent } = resend
    ? await sendVerificationThrottled(fbUser)
    : { sent: false };
  toastFn?.(verifyBlockMsg(action, sent));
  return false;
};
