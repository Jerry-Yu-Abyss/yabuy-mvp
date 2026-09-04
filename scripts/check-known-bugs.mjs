#!/usr/bin/env node
/**
 * ┌────────────────────────────────────────────────────────────────┐
 * │ YaBuy 回歸測試 ①：【事故驅動】—— 防止「已修好的 bug」復發        │
 * └────────────────────────────────────────────────────────────────┘
 *
 * ⚠️ 定位：本檔案的每一條檢查都**回溯自這個專案真實發生過的事故**，
 *    不是通用最佳實踐、也不是完整的功能測試。它只回答一個問題：
 *      「以前壞過的地方，這次有沒有又壞了？」
 *
 *    要驗證「系統該有的功能是否正常」請跑另一支：
 *      scripts/check-functional.mjs（通用功能標準，見 docs/wiki/回歸測試-功能標準.md）
 *
 * 執行：
 *   npm run check:bugs            # 原始碼 + 正式站，全部都跑
 *   npm run check:bugs -- --local # 只跑原始碼檢查，不打網路（給 check:code／commit 前用）
 *   npm run check:bugs -- --prod  # 只打正式站，跳過原始碼檢查（給 check:prod／部署後用）
 *
 * 退出碼：0 = 全數通過；1 = 有項目失敗（非 0 就代表這次改動造成回歸）。
 *
 * 新增檢查前請先確認它擋得住某個**實際踩過的坑**，否則只會製造雜訊。
 * 對應說明文件：docs/wiki/回歸測試-已知事故.md
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT_ID = 'yabuy-2026a';
const SITE = 'https://yabuy-2026a.web.app';
const FS_BASE =
  `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const LOCAL_ONLY = process.argv.includes('--local');
const PROD_ONLY = process.argv.includes('--prod');

let pass = 0;
let fail = 0;
const failures = [];

const ok = (name, detail = '') => {
  pass++;
  console.log(`  \x1b[32mPASS\x1b[0m  ${name}${detail ? `  ${detail}` : ''}`);
};
const bad = (name, detail) => {
  fail++;
  failures.push(`${name} — ${detail}`);
  console.log(`  \x1b[31mFAIL\x1b[0m  ${name}\n        → ${detail}`);
};
const section = (title) => console.log(`\n\x1b[1m${title}\x1b[0m`);

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/* ────────────────────────────────────────────────────────────────
   2. Firestore 安全規則：未登入的人能讀到什麼
   事故背景：規則原本大多只寫 `if request.auth != null`，任何登入者都能
   讀寫別人的訂單/收藏/面交訊息；users 更是連登入都不用就能整批撈 email。
   這組檢查不需要任何憑證就能跑，是最容易回歸也最容易驗證的一層。
   ──────────────────────────────────────────────────────────────── */
const RULE_EXPECTATIONS = [
  // [collection, 期望的匿名讀取狀態碼, 為什麼]
  ['users', 403, 'email 等個資，登入才能讀'],
  ['orders', 403, '交易明細，只有買賣雙方/管理員'],
  ['favorites', 403, '收藏清單，只有本人'],
  ['messages', 403, '面交對話，只有該訂單當事人'],
  ['audit_logs', 403, '稽核紀錄，只有管理員'],
  ['reviews', 403, '評價內文，只有管理員'],
  ['notifications', 403, '站內通知，登入才能讀'],
  ['products', 200, '商品要能被未登入訪客瀏覽（首頁/搜尋）'],
  ['ads', 200, '廣告要能在未登入首頁顯示'],
];

async function checkRules() {
  section('2. Firestore 安全規則（以未登入身分實測）');
  for (const [col, expected, why] of RULE_EXPECTATIONS) {
    try {
      const res = await fetch(`${FS_BASE}/${col}?pageSize=1`);
      if (res.status === expected) {
        ok(`${col} → ${res.status}`, `(${why})`);
      } else {
        bad(
          `${col} 匿名讀取狀態碼不符`,
          `期望 ${expected}、實際 ${res.status}。${why}。` +
            (res.status === 200
              ? ' 這代表資料正在對外公開，請檢查 firestore.rules。'
              : ' 正常功能可能被擋住，請檢查 firestore.rules。')
        );
      }
    } catch (e) {
      bad(`${col} 匿名讀取請求失敗`, e.message);
    }
  }
}

/* ────────────────────────────────────────────────────────────────
   3. 商品資料完整性
   事故背景：曾比對「管理端巡邏 vs 用戶上架 vs 實際資料庫」是否一致。
   products 是公開可讀的，所以這層不需登入就能驗。
   ──────────────────────────────────────────────────────────────── */
const parseFields = (fields = {}) => {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    if ('stringValue' in v) out[k] = v.stringValue;
    else if ('integerValue' in v) out[k] = Number(v.integerValue);
    else if ('doubleValue' in v) out[k] = v.doubleValue;
    else if ('booleanValue' in v) out[k] = v.booleanValue;
    else if ('timestampValue' in v) out[k] = v.timestampValue;
    else if ('nullValue' in v) out[k] = null;
    else out[k] = v;
  }
  return out;
};

async function checkProductData() {
  section('3. 商品資料完整性（products 公開可讀）');
  let docs;
  try {
    const res = await fetch(`${FS_BASE}/products?pageSize=300`);
    if (!res.ok) {
      bad('讀取 products 失敗', `HTTP ${res.status}`);
      return;
    }
    docs = (await res.json()).documents || [];
  } catch (e) {
    bad('讀取 products 失敗', e.message);
    return;
  }

  const items = docs.map((d) => ({
    id: d.name.split('/').pop(),
    ...parseFields(d.fields),
  }));
  ok('取得商品資料', `共 ${items.length} 筆`);

  // Cam.vue 上架時一定會寫入的欄位，缺任何一個代表寫入路徑被改壞
  const REQUIRED = ['name', 'price', 'url', 'sellerId', 'status', 'createdAt'];
  const missing = [];
  for (const p of items) {
    for (const f of REQUIRED) {
      if (p[f] === undefined || p[f] === '') missing.push(`${p.id}.${f}`);
    }
  }
  missing.length
    ? bad('商品缺少必要欄位', missing.slice(0, 8).join(', '))
    : ok('所有商品都具備必要欄位', `(${REQUIRED.join('/')})`);

  // status 只能是這兩種；出現第三種代表有人繞過既有流程寫入
  const badStatus = items.filter((p) => !['active', 'sold'].includes(p.status));
  badStatus.length
    ? bad('出現未預期的 status 值', badStatus.map((p) => `${p.id}=${p.status}`).join(', '))
    : ok('status 值域正確', "(只有 active / sold)");

  // Cam.vue: category: form.isBook ? '教科書' : form.category
  const bookMismatch = items.filter((p) => p.isBook && p.category !== '教科書');
  bookMismatch.length
    ? bad('isBook 與 category 不一致', bookMismatch.map((p) => p.id).join(', '))
    : ok('isBook=true 的商品 category 一律為「教科書」');

  // 價格必須 > 0（Cam.vue 有擋，但要確認資料庫沒有髒資料）
  const badPrice = items.filter((p) => !(Number(p.price) > 0));
  badPrice.length
    ? bad('出現非正數價格', badPrice.map((p) => `${p.id}=${p.price}`).join(', '))
    : ok('所有商品價格皆為正數');

  // Deal.vue 成交時 status 與 soldAt 是同一次寫入，不該只有其中一個
  const soldNoTime = items.filter((p) => p.status === 'sold' && !p.soldAt);
  soldNoTime.length
    ? bad('已售出商品缺少 soldAt', soldNoTime.map((p) => p.id).join(', '))
    : ok('已售出商品都有 soldAt 時間戳');
}

/* ────────────────────────────────────────────────────────────────
   4. 部署產物
   事故背景：index.html 曾長期停在 <title>Vite</title>；PWA 圖示因為
   來源圖自帶圓角導致 iOS 二次套用圓角；SVGO 把 viewBox 拿掉造成圖示裁切。
   ──────────────────────────────────────────────────────────────── */
async function checkDeployedAssets() {
  section('4. 部署產物（線上實際內容）');

  let html;
  try {
    const res = await fetch(`${SITE}/?cb=regression-${Date.now()}`);
    html = await res.text();
  } catch (e) {
    bad('取得線上 index.html 失敗', e.message);
    return;
  }

  html.includes('<title>Vite</title>')
    ? bad('index.html 標題仍是預設值', '應改為 YaBuy 相關標題')
    : ok('index.html 標題非預設 Vite');

  html.includes('rel="apple-touch-icon"')
    ? ok('index.html 含 apple-touch-icon', '(iOS 加入主畫面只認這個標籤)')
    : bad('index.html 缺少 apple-touch-icon', 'iOS 加到主畫面會拿不到圖示');

  html.includes('rel="manifest"')
    ? ok('index.html 含 manifest 連結')
    : bad('index.html 缺少 manifest 連結', 'Android/桌面無法安裝為 PWA');

  for (const [path, why] of [
    ['/manifest.webmanifest', 'PWA manifest'],
    ['/apple-touch-icon.png', 'iOS 主畫面圖示'],
    ['/icons/icon-180.png', 'iOS 實際使用尺寸'],
    ['/icons/icon-512.png', 'Android/桌面大圖'],
  ]) {
    try {
      const res = await fetch(SITE + path);
      res.ok ? ok(`${path} 可取得`, `(${why})`) : bad(`${path} 取不到`, `HTTP ${res.status}`);
    } catch (e) {
      bad(`${path} 請求失敗`, e.message);
    }
  }

  // SVGO 的 removeViewBox 會讓 icon 被 CSS 縮放時裁切
  const bundleMatch = html.match(/\/assets\/index-[\w-]+\.js/);
  if (!bundleMatch) {
    bad('找不到主 bundle 路徑', '無法檢查 viewBox');
    return;
  }
  try {
    const js = await (await fetch(SITE + bundleMatch[0])).text();
    const count = (js.match(/viewBox/g) || []).length;
    count > 0
      ? ok('bundle 內保留 viewBox', `共 ${count} 處（SVGO removeViewBox 未回歸）`)
      : bad(
          'bundle 內找不到 viewBox',
          'SVGO 的 removeViewBox 又被啟用了，icon 被 CSS 縮放時會裁切。' +
            '檢查 vite.config.js 的 svgLoader svgoConfig'
        );
  } catch (e) {
    bad('下載 bundle 失敗', e.message);
  }
}

/* ────────────────────────────────────────────────────────────────
   1. 原始碼不變式
   這幾條都是「改壞了不會噴錯、但線上會出事」的類型，靜態檢查最划算。
   ──────────────────────────────────────────────────────────────── */

/**
 * 移除註解，避免把註解裡的字誤判成程式碼。
 * （踩過：Cam.vue 的防連點註解裡寫了「第一個 await 之前」，
 *   直接 indexOf('await') 會抓到註解，把已修好的程式碼誤報成有 bug。）
 */
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** 粗略取出某個 const 函式的內容（到下一個頂層 }; 或 }); 為止），已去除註解 */
function extractFn(src, name) {
  const start = src.indexOf(`const ${name} = `);
  if (start === -1) return null;
  const rest = src.slice(start);
  const end = rest.search(/\n\}\);|\n\};/);
  return stripComments(end === -1 ? rest : rest.slice(0, end));
}

// 每個會寫入 Firestore 的按鈕進入點，都必須在「第一個 await 之前」就鎖定，
// 否則網路慢時使用者連點會產生重複寫入（Cam.vue 就是這樣中招的）。
const GUARDS = [
  { file: 'src/components/TradeModal.vue', fn: 'handleSend', flag: 'isSending' },
  { file: 'src/components/Cam.vue', fn: 'firebaseUpload', flag: 'isUploading' },
  { file: 'src/components/Mailbox.vue', fn: 'acceptOrder', wrapper: 'runOrderAction' },
  { file: 'src/components/Mailbox.vue', fn: 'rejectOrder', wrapper: 'runOrderAction' },
  { file: 'src/components/Mailbox.vue', fn: 'cancelOrder', wrapper: 'runOrderAction' },
  { file: 'src/components/Deal.vue', fn: 'setReady', wrapper: 'runOnce' },
  { file: 'src/components/Deal.vue', fn: 'recordScan', wrapper: 'runOnce' },
  { file: 'src/components/Deal.vue', fn: 'sellerConfirmPrice', wrapper: 'runOnce' },
];

function checkSourceInvariants() {
  section('1. 原始碼不變式（防連點／登入寫入／效能）');

  // 1-1 防連點
  for (const g of GUARDS) {
    if (!existsSync(join(ROOT, g.file))) {
      bad(`${g.file} 不存在`, '檔案被移動或刪除，請更新此檢查清單');
      continue;
    }
    const src = read(g.file);
    const body = extractFn(src, g.fn);
    if (!body) {
      bad(`找不到 ${g.fn}`, `${g.file}：函式被改名或刪除，請同步更新此清單`);
      continue;
    }
    if (g.wrapper) {
      body.includes(g.wrapper)
        ? ok(`${g.fn} 有防連點保護`, `(${g.wrapper} 包裹)`)
        : bad(`${g.fn} 失去防連點保護`, `${g.file}：應以 ${g.wrapper} 包裹`);
      continue;
    }
    const iFlagSet = body.indexOf(`${g.flag}.value = true`);
    const iAwait = body.indexOf('await');
    if (iFlagSet === -1) {
      bad(`${g.fn} 沒有設定 ${g.flag}`, `${g.file}：防連點旗標消失`);
    } else if (iAwait !== -1 && iFlagSet > iAwait) {
      bad(
        `${g.fn} 的旗標設定在 await 之後`,
        `${g.file}：這中間的空窗期按鈕仍可按，連點會重複寫入。` +
          '旗標必須在第一個 await 之前同步設定'
      );
    } else {
      ok(`${g.fn} 有防連點保護`, `(${g.flag} 在第一個 await 前設定)`);
    }
  }

  // 1-2 兩條 Google 登入路徑都必須建立 users 文件
  // 事故：Landing.vue 的 Google 登入漏了 upsertUserDoc，2026-07-09 起
  // 所有經 Landing 用 Google 註冊的人都沒有 Firestore 文件。
  for (const file of ['src/components/Landing.vue', 'src/components/User.vue']) {
    const src = read(file);
    const i = src.indexOf('signInWithPopup(auth');
    if (i === -1) {
      bad(`${file} 找不到 Google 登入`, '登入方式被改寫，請更新此檢查');
      continue;
    }
    // 從 signInWithPopup 往後看 400 字內是否有呼叫 upsertUserDoc
    src.slice(i, i + 400).includes('upsertUserDoc(')
      ? ok(`${file} 的 Google 登入有建立 users 文件`)
      : bad(
          `${file} 的 Google 登入未呼叫 upsertUserDoc`,
          '首次用 Google 登入的帳號會只存在於 Auth、Firestore 沒有資料'
        );
  }

  // 1-3 已驗證帳號不該每次點擊都打一次 reload()
  // 事故：交易按鈕「感覺遲緩」的根因。
  const verifySrc = read('src/components/verify.js');
  /emailVerified\)\s*\{[\s\S]{0,200}?return/.test(verifySrc)
    ? ok('ensureVerified 對已驗證帳號短路', '(不再每次點擊都打網路)')
    : bad(
        'ensureVerified 失去短路判斷',
        '已驗證帳號每次發起交易/上架都會多一次 reload() 網路往返，按鈕會變遲緩'
      );

  // 1-4 SVGO 設定
  const viteCfg = read('vite.config.js');
  /removeViewBox:\s*false/.test(viteCfg)
    ? ok('vite.config.js 保留 SVG viewBox')
    : bad(
        'vite.config.js 未關閉 removeViewBox',
        'SVGO 會拿掉 viewBox，icon 被 CSS 縮放時會裁切'
      );

  // 1-5b 廣告插槽不該在同一次 recompute 裡重複塞同一則廣告
  // 事故：商品清單夠長、一次出現不只一個「每 10 個」觸發點時，若只有 1 則
  // 有效廣告，pickNextAd() 沒有排除「這次已經用過」的廣告，會把同一則廣告
  // 塞進兩個不同插槽——使用者滑一下就撞見同一則廣告第二次，感覺像卡片壞掉。
  const homeSrc = read('src/components/Home.vue');
  const pickNextAdBody = extractFn(homeSrc, 'pickNextAd');
  if (!pickNextAdBody) {
    bad('找不到 pickNextAd', 'src/components/Home.vue：函式被改名或刪除，請同步更新此清單');
  } else if (!/excludeThisPass/.test(pickNextAdBody)) {
    bad(
      'pickNextAd 失去同一次 recompute 的排除邏輯',
      '只有 1 則有效廣告、商品清單又夠長時，同一則廣告會被塞進兩個插槽（重複出現）'
    );
  } else if (!/pickNextAd\(\s*usedAdIds\s*\)/.test(homeSrc)) {
    bad(
      'pickNextAd 呼叫端沒有傳入 usedAdIds',
      '函式支援排除參數，但呼叫時沒帶，等於沒修好'
    );
  } else {
    ok('廣告插槽不會在同一次 recompute 裡重複塞同一則廣告');
  }

  // 1-5 推遲面交時間的預設值必須直接問 isTradeHourAllowed
  //
  // 事故：接上「交易時段限制」開關時，CannedChat 的 defaultProposal 寫成
  //   isWithinSafeHours(h) || !isTradeHourAllowed(h)
  // 兩個方向都是反的——限制開啟時碰到 22:00 原樣回傳（面板一開就報錯），
  // 限制關閉時碰到 22:00 又硬挪到隔天 09:00（等於開關對推遲請求沒作用）。
  // isTradeHourAllowed() 本身就把開關算進去了，任何「先自己判斷時段、再看
  // 開關」的寫法都會再犯同一個錯。
  const chatSrc = read('src/components/CannedChat.vue');
  const proposalBody = extractFn(chatSrc, 'defaultProposal');
  if (!proposalBody) {
    bad('找不到 defaultProposal', 'src/components/CannedChat.vue：函式被改名或刪除，請同步更新此檢查');
  } else if (/!\s*isTradeHourAllowed/.test(proposalBody)) {
    bad(
      '推遲預設值又出現反向的時段判斷',
      'defaultProposal 不該用 !isTradeHourAllowed()：那條分支在限制開啟時會把不合法的時間原樣送出，' +
        '在限制關閉時又會硬挪時間，等於開關沒接上。直接用 isTradeHourAllowed() 判斷「要不要挪」即可'
    );
  } else if (!proposalBody.includes('isTradeHourAllowed')) {
    bad(
      '推遲預設值沒有跟時段開關連動',
      'defaultProposal 必須經過 isTradeHourAllowed()，否則管理端關掉時段限制時推遲請求仍會被挪走'
    );
  } else {
    ok('推遲面交時間的預設值有跟時段開關連動');
  }

  // 1-6 規則檔不該退回「登入就行」
  const rules = read('firestore.rules');
  const LOOSE = [
    ['orders', /match \/orders\/\{[^}]+\} \{\s*\n\s*allow read, write: if request\.auth != null;/],
    ['favorites', /match \/favorites\/\{[^}]+\} \{\s*\n\s*allow read, write: if request\.auth != null;/],
    ['messages', /match \/messages\/\{[^}]+\} \{\s*\n\s*allow read, write: if request\.auth != null;/],
  ];
  for (const [col, re] of LOOSE) {
    re.test(rules)
      ? bad(
          `${col} 規則退回「登入就行」`,
          '任何登入者都能讀寫別人的資料，請改回本人/當事人判斷'
        )
      : ok(`${col} 規則未退回寬鬆版本`);
  }
}

/* ──────────────────────────────────────────────────────────────── */
(async () => {
  console.log(
    '\x1b[1mYaBuy 回歸測試 ①：事故驅動（防止已知 bug 復發）\x1b[0m' +
      (LOCAL_ONLY ? '（僅原始碼）' : PROD_ONLY ? '（僅正式站）' : '')
  );

  if (!PROD_ONLY) {
    checkSourceInvariants();
  } else {
    console.log('\n（--prod：跳過原始碼檢查，只驗正式站現況）');
  }

  if (!LOCAL_ONLY) {
    await checkRules();
    await checkProductData();
    await checkDeployedAssets();
  } else {
    console.log('\n（--local：略過所有網路檢查）');
  }

  console.log(
    `\n\x1b[1m結果\x1b[0m  通過 ${pass} 項，失敗 ${fail} 項`
  );
  if (fail) {
    console.log('\n\x1b[31m失敗項目：\x1b[0m');
    failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
    console.log(
      '\n這些是這個專案真的出過的事故，不是通用規則。修好之前不要宣告完成。'
    );
    process.exit(1);
  }
  console.log('\n\x1b[32m全數通過。\x1b[0m');
})();
