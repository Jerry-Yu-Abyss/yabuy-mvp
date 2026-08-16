/**
 * Firebase Emulator 共用工具
 *
 * 設計原則：**所有操作都帶真實使用者的 idToken**，不用 Admin SDK。
 * Admin SDK 會繞過 firestore.rules（見 docs/wiki/回歸測試-已知事故.md 第 12 條），
 * 那樣就只驗到「資料寫得進去」，驗不到「規則有沒有擋住不該做的事」——
 * 而後者才是這層測試最大的價值：正式站上永遠不敢拿真帳號去試。
 *
 * 不新增任何 npm 依賴，沿用既有檢查腳本的 fetch + REST 風格。
 */

export const PROJECT = 'yabuy-2026a';
export const FS_HOST = 'http://127.0.0.1:8080';
export const AUTH_HOST = 'http://127.0.0.1:9099';

const FS_BASE = `${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;

/* ── emulator 是否在跑 ───────────────────────────────────────────── */

/** 兩個 emulator 都通才算就緒。給 check:code 判斷該執行還是 skip。 */
export async function emulatorUp() {
  try {
    const [fs, auth] = await Promise.all([
      fetch(`${FS_HOST}/`).then((r) => r.status).catch(() => 0),
      fetch(`${AUTH_HOST}/`).then((r) => r.status).catch(() => 0),
    ]);
    return fs !== 0 && auth !== 0;
  } catch {
    return false;
  }
}

/** 清空 Firestore 與 Auth，讓每次執行都從乾淨狀態開始（可重複執行） */
export async function resetEmulator() {
  await fetch(
    `${FS_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,
    { method: 'DELETE' }
  );
  await fetch(`${AUTH_HOST}/emulator/v1/projects/${PROJECT}/accounts`, {
    method: 'DELETE',
  });
}

/* ── Auth ────────────────────────────────────────────────────────── */

/**
 * 在 Auth emulator 建一個帳號並取得 idToken。
 * emulator 不驗 apiKey，隨便給一個字串即可。
 */
export async function createUser(email, password = 'test1234') {
  const res = await fetch(
    `${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  const j = await res.json();
  if (!res.ok) throw new Error(`建立帳號失敗 ${email}: ${JSON.stringify(j)}`);
  return { uid: j.localId, token: j.idToken, email };
}

/* ── Firestore 值編碼 ────────────────────────────────────────────── */

/** JS 值 → Firestore REST 的 typed value */
function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  switch (typeof v) {
    case 'string':
      return { stringValue: v };
    case 'boolean':
      return { booleanValue: v };
    case 'number':
      return Number.isInteger(v)
        ? { integerValue: String(v) }
        : { doubleValue: v };
    case 'object':
      if (Array.isArray(v)) {
        return { arrayValue: { values: v.map(toValue) } };
      }
      return { mapValue: { fields: toFields(v) } };
    default:
      throw new Error(`不支援的型別: ${typeof v}`);
  }
}

/** Firestore REST typed value → JS 值 */
function fromValue(v) {
  if (!v || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
  return v;
}

export function toFields(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = toValue(v);
  return out;
}

export function fromFields(fields = {}) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = fromValue(v);
  return out;
}

/* ── Firestore 操作（一律帶 token，受 rules 約束）────────────────── */

const authHeaders = (token) => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

/**
 * 建立／覆寫文件。
 * @returns {{ok:boolean, status:number, data:object|null}}
 */
export async function setDoc(path, obj, token) {
  const res = await fetch(`${FS_BASE}/${path}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({ fields: toFields(obj) }),
  });
  const j = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data: j?.fields ? fromFields(j.fields) : null };
}

/**
 * 局部更新。必須帶 updateMask，否則 Firestore 會把未列出的欄位清掉。
 */
export async function updateDoc(path, obj, token) {
  const mask = Object.keys(obj)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join('&');
  const res = await fetch(`${FS_BASE}/${path}?${mask}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({ fields: toFields(obj) }),
  });
  const j = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data: j?.fields ? fromFields(j.fields) : null };
}

/** 讀取單一文件。status 會保留下來，方便斷言 403。 */
export async function getDoc(path, token) {
  const res = await fetch(`${FS_BASE}/${path}`, { headers: authHeaders(token) });
  const j = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data: j?.fields ? fromFields(j.fields) : null };
}

/** 列出 collection（用來驗第三方是否撈得到整包資料） */
export async function listDocs(collection, token) {
  const res = await fetch(`${FS_BASE}/${collection}?pageSize=50`, {
    headers: authHeaders(token),
  });
  const j = await res.json().catch(() => null);
  return {
    ok: res.ok,
    status: res.status,
    docs: (j?.documents || []).map((d) => ({
      id: d.name.split('/').pop(),
      ...fromFields(d.fields),
    })),
  };
}
