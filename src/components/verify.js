// ================= 🌟 YaBuy 共用「登入驗證狀態」模組 =================
// 目的：把「使用者是否通過驗證」的判定收斂成單一份邏輯，供兩處共用──
//   1) User.vue 的 upsertUserDoc()：把 verify 狀態寫進 Firestore users 文件（紀錄用）。
//   2) TradeModal.vue 的 handleSend()：發起交易前的即時守門（放行 / 攔截）。
// 兩處引用同一份判定，未來就不會出現「Firestore 說已驗證、交易卻擋下」這種邏輯分岔。
//
// verify 三態（對應需求 {google, email, no yet}，no yet 正規化為 not_yet）：
//   'google'   → 使用 Google 登入，視同已驗證
//   'email'    → 使用電子郵件登入且已完成信箱驗證
//   'not_yet'  → 使用電子郵件登入但尚未驗證信箱

export const VERIFY_GOOGLE = 'google';
export const VERIFY_EMAIL = 'email';
export const VERIFY_NOT_YET = 'not_yet';

// 是否以 Google 登入（providerData 內含 google.com；同時綁定多個登入方式時也算數）
const isGoogleUser = (fbUser) =>
  !!fbUser?.providerData?.some((p) => p.providerId === 'google.com');

// 由 Firebase user 物件推導 verify 狀態。
// 純函式、不觸發任何網路請求，讀取的是傳入物件「當下」的 emailVerified。
export const resolveVerifyStatus = (fbUser) => {
  if (!fbUser) return VERIFY_NOT_YET;
  if (isGoogleUser(fbUser)) return VERIFY_GOOGLE;
  return fbUser.emailVerified ? VERIFY_EMAIL : VERIFY_NOT_YET;
};

// 某個 verify 狀態是否算「已通過驗證」（可發起交易 / 上架）
export const isVerified = (status) =>
  status === VERIFY_GOOGLE || status === VERIFY_EMAIL;

// ── 交易 / 上架前的即時守門 ──
// 為什麼要 reload()：使用者點驗證信通常在另一分頁或手機完成，當前 session 的
// emailVerified 不會自動更新。先 reload() 拉最新狀態再判定，剛驗證完的人就不會被誤擋。
// 回傳 { ok, status }；未通過時由呼叫端決定要顯示什麼提示 / 是否重寄驗證信。
export const ensureVerified = async (fbUser) => {
  if (!fbUser) return { ok: false, status: VERIFY_NOT_YET };
  // Google 用戶本來就視同已驗證，免去一次 reload
  if (isGoogleUser(fbUser)) return { ok: true, status: VERIFY_GOOGLE };
  try {
    await fbUser.reload(); // 失敗（例如離線）就退回用現有狀態判定，不擋死流程
  } catch (e) {
    /* reload 失敗：沿用目前 emailVerified 判定 */
  }
  const status = resolveVerifyStatus(fbUser);
  return { ok: isVerified(status), status };
};
