#!/usr/bin/env node
/**
 * ┌────────────────────────────────────────────────────────────────┐
 * │ YaBuy 回歸測試 ②：【功能標準】—— 驗證系統該有的行為是否正常      │
 * └────────────────────────────────────────────────────────────────┘
 *
 * 定位：與 scripts/check-known-bugs.mjs（事故驅動）互補。
 *   ① 事故驅動：舊 bug 有沒有復發？（窄而深）
 *   ② 功能標準：系統該有的功能正不正常？（廣而完整）← 本檔案
 *
 * 涵蓋四個面向：
 *   A 基礎元件互動 / B 操作邏輯 / C 交易邏輯 / D 資料庫互動
 *
 * 每個案例都有明確的「期待結果」。腳本會：
 *   1. 自動執行所有「不需登入就能驗」的案例
 *   2. 讀取 scripts/functional-results.json 取得人工驗證的紀錄
 *   3. 列出完整 Check List 與進度，明確指出「下一步該做什麼」
 *
 * 執行：
 *   npm run check:func                      # 跑全部自動項目（含打網路）+ 顯示進度
 *   npm run check:func -- --local           # 只跑不需網路的自動項目（給 check:code／commit 前用）
 *   npm run check:func -- --list            # 只列 Check List，不執行
 *   npm run check:func -- --pass C-03 "備註" # 記錄某項人工驗證通過
 *   npm run check:func -- --fail C-03 "原因" # 記錄某項人工驗證失敗
 *   npm run check:func -- --reset C-03      # 清除某項紀錄
 *
 * 對應說明文件：docs/wiki/回歸測試-功能標準.md
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RESULTS_PATH = join(ROOT, 'scripts', 'functional-results.json');
const PROJECT_ID = 'yabuy-2026a';
const FS_DOCS =
  `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const FN_BASE = `https://us-central1-${PROJECT_ID}.cloudfunctions.net`;

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/* ════════════════════════════════════════════════════════════════
   執行者類型：決定「誰能跑這個案例」，也決定工作流順序
   ════════════════════════════════════════════════════════════════ */
const RUNNER = {
  AUTO: 'auto', //   腳本自動驗，不需要人
  ANON: 'anon', //   瀏覽器操作，不需登入（模型可自行完成）
  AUTH: 'auth', //   瀏覽器操作，需使用者先登入（模型在登入後可完成）
  DUO: 'duo', //     需要買賣雙方兩個帳號（需人類協調）
  EYE: 'eye', //     只能靠人眼判斷（視覺/體感）
};
const RUNNER_LABEL = {
  auto: '自動',
  anon: '免登入',
  auth: '需登入',
  duo: '需雙帳號',
  eye: '需人眼',
};

/* ════════════════════════════════════════════════════════════════
   Check List 定義（單一事實來源）
   每個案例：id / 標題 / 期待結果 / 執行者 / (auto 則附檢查函式)
   ════════════════════════════════════════════════════════════════ */
const CASES = [
  /* ───── A. 基礎元件互動 ───── */
  {
    id: 'A-01',
    area: 'A. 基礎元件互動',
    title: '未登入首次進站顯示 Landing 介紹頁',
    expect: '看到「好物，值得在校園多走一輪」與 Google 登入按鈕，不會直接進主畫面',
    runner: RUNNER.ANON,
  },
  {
    id: 'A-02',
    area: 'A. 基礎元件互動',
    title: 'Landing 頁公開統計顯示真實數字',
    expect: 'getPublicStats 匿名回傳 totalUsers 與 circulatedItems 兩個非負整數',
    runner: RUNNER.AUTO,
    network: true, // 打正式站 Cloud Function，--local 時跳過
    fn: async () => {
      const res = await fetch(`${FN_BASE}/getPublicStats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: {} }),
      });
      if (!res.ok) return [false, `HTTP ${res.status}（未登入訪客會看不到統計）`];
      const j = await res.json();
      const r = j.result || {};
      const okShape =
        Number.isInteger(r.totalUsers) &&
        Number.isInteger(r.circulatedItems) &&
        r.totalUsers >= 0 &&
        r.circulatedItems >= 0;
      return okShape
        ? [true, `totalUsers=${r.totalUsers}, circulatedItems=${r.circulatedItems}`]
        : [false, `回傳格式不符：${JSON.stringify(r)}`];
    },
  },
  {
    id: 'A-03',
    area: 'A. 基礎元件互動',
    title: '底部 5 個分頁可切換',
    expect: '首頁／搜尋／賣東西／教科書／我的 各自渲染對應畫面，指示器跟著移動',
    runner: RUNNER.AUTH,
  },
  {
    id: 'A-04',
    area: 'A. 基礎元件互動',
    title: '頂部導覽（選單／地圖／信箱）可開啟',
    expect: '三個入口都能進到對應畫面；信箱有未讀時顯示紅點數字',
    runner: RUNNER.AUTH,
  },
  {
    id: 'A-05',
    area: 'A. 基礎元件互動',
    title: '彈窗開啟時底部 dock 自動收起',
    expect: '開啟交易/編輯彈窗時底部選單消失，關閉後恢復（modalState.js 計數器）',
    runner: RUNNER.AUTH,
  },
  {
    id: 'A-06',
    area: 'A. 基礎元件互動',
    title: '搜尋框輸入文字自動切到搜尋分頁',
    expect: '輸入即切到 funnel 分頁；清空後回到原本分頁',
    runner: RUNNER.AUTH,
  },
  {
    id: 'A-07',
    area: 'A. 基礎元件互動',
    title: '地圖頁交易點卡片與全版面瀏覽',
    expect: '6 個交易點可水平滑動；點擊開啟全版面瀏覽並跳到該點；不顯示交易點代碼',
    runner: RUNNER.AUTH,
  },

  /* ───── B. 操作邏輯 ───── */
  {
    id: 'B-01',
    area: 'B. 操作邏輯',
    title: '首頁右滑／按讚 → 加入收藏',
    expect: 'favorites 新增一筆（userId=本人），該商品從卡片堆消失，收藏頁看得到',
    runner: RUNNER.AUTH,
  },
  {
    id: 'B-02',
    area: 'B. 操作邏輯',
    title: '首頁左滑／不喜歡 → 不再出現',
    expect: 'id 寫入 localStorage YaBuy_SeenIds，重新整理後該商品不再出現在卡片堆',
    runner: RUNNER.AUTH,
  },
  {
    id: 'B-03',
    area: 'B. 操作邏輯',
    title: '「重新探索商品」清除已看紀錄',
    expect: 'seenIds 清空，先前左滑掉的商品重新回到卡片堆',
    runner: RUNNER.AUTH,
  },
  {
    id: 'B-04',
    area: 'B. 操作邏輯',
    title: '廣告卡依節奏插入且可滑掉',
    expect: '每 10 個商品出現 1 則；滑掉後不再出現；多則廣告時順序不固定；商品不足時廣告仍出現在最底部',
    runner: RUNNER.AUTH,
  },
  {
    id: 'B-05',
    area: 'B. 操作邏輯',
    title: '上架表單必填驗證',
    expect: '缺圖片／名稱／價格／分類任一項時「確認上傳」為 disabled；未選分類有提示文字',
    runner: RUNNER.AUTH,
  },
  {
    id: 'B-06',
    area: 'B. 操作邏輯',
    title: '上架成功後商品正確落地',
    expect: 'products 新增一筆且 status=active、sellerId=本人、url 指向 Storage；出現在「我的賣場」與首頁',
    runner: RUNNER.AUTH,
  },
  {
    id: 'B-07',
    area: 'B. 操作邏輯',
    title: '教科書分類三層篩選',
    expect: '學院→系所→科目逐層篩選正確；不顯示賣家名字；「我的商品」徽章正常',
    runner: RUNNER.AUTH,
  },
  {
    id: 'B-08',
    area: 'B. 操作邏輯',
    title: '搜尋關鍵字與分類篩選',
    expect: '搜尋結果只含符合關鍵字的上架中商品；分類 chip 可疊加篩選',
    runner: RUNNER.AUTH,
  },
  {
    id: 'B-09',
    area: 'B. 操作邏輯',
    title: '收藏頁可移除收藏',
    expect: '確認後 favorites 該筆刪除，列表即時更新',
    runner: RUNNER.AUTH,
  },
  {
    id: 'B-10',
    area: 'B. 操作邏輯',
    title: '個人資料編輯（名稱／頭像／學院）',
    expect: 'Auth profile 與 users 文件同步更新；頭像存到 Storage avatars/{uid}.jpg',
    runner: RUNNER.AUTH,
  },
  {
    id: 'B-11',
    area: 'B. 操作邏輯',
    title: '未驗證信箱被擋在交易／上架之外',
    expect: '顯示提示並寄出驗證信（60 秒節流）；已驗證帳號不受影響且反應即時',
    runner: RUNNER.DUO,
  },

  /* ───── C. 交易邏輯 ───── */
  {
    id: 'C-01',
    area: 'C. 交易邏輯',
    title: '交易時段限制 06:00–18:00',
    expect: '選 18:00 後或 06:00 前的時間，按鈕顯示「時間不符合規範」且無法送出',
    runner: RUNNER.AUTH,
  },
  {
    id: 'C-02',
    area: 'C. 交易邏輯',
    title: '不能購買自己上架的商品',
    expect: '送出時被擋，提示「不能預約購買自己上架的商品」',
    runner: RUNNER.AUTH,
  },
  {
    id: 'C-03',
    area: 'C. 交易邏輯',
    title: '發起交易 → 訂單成立',
    expect: 'orders 新增一筆 status=pending、buyerId=本人；買賣雙方信箱各自看得到；audit_logs 同時寫入一筆',
    runner: RUNNER.DUO,
  },
  {
    id: 'C-04',
    area: 'C. 交易邏輯',
    title: '賣家婉拒 → 交易關閉',
    expect: 'status=rejected，雙方信箱狀態顯示「已取消」',
    runner: RUNNER.DUO,
  },
  {
    id: 'C-05',
    area: 'C. 交易邏輯',
    title: '賣家更改提案（限 1 次）',
    expect: '第 1 次成功 status=negotiating、negotiationStep=1；第 2 次被擋並提示「賣家僅限改期一次」',
    runner: RUNNER.DUO,
  },
  {
    id: 'C-06',
    area: 'C. 交易邏輯',
    title: '買家更改提案（限 2 次）',
    expect: 'negotiationStep 累加；達 2 次後被擋並提示',
    runner: RUNNER.DUO,
  },
  {
    id: 'C-07',
    area: 'C. 交易邏輯',
    title: '接受提案 → 預約成立',
    expect: 'status=accepted，雙方看到「預約成立」與安全交易入口',
    runner: RUNNER.DUO,
  },
  {
    id: 'C-08',
    area: 'C. 交易邏輯',
    title: '安全交易在約定時間前 10 分鐘才開放',
    expect: '未到時間按鈕為 disabled 並顯示開放時間；到點後自動變為可按',
    runner: RUNNER.DUO,
  },
  {
    id: 'C-09',
    area: 'C. 交易邏輯',
    title: '雙方按下安全交易 → 進入掃碼',
    expect: '任一方先按顯示「等待對方」；雙方都按後 step 進入 scan',
    runner: RUNNER.DUO,
  },
  {
    id: 'C-10',
    area: 'C. 交易邏輯',
    title: '交易點代碼錯誤時被擋',
    expect: '輸入非該地點代碼提示「代碼不符」，不寫入 scannedAt',
    runner: RUNNER.DUO,
  },
  {
    id: 'C-11',
    area: 'C. 交易邏輯',
    title: '雙方掃碼後買家輸入金額（上限 $10,000）',
    expect: '超過 10000 或 ≤0 無法送出；送出後 finalPrice 寫入，賣家端切到確認畫面',
    runner: RUNNER.DUO,
  },
  {
    id: 'C-12',
    area: 'C. 交易邏輯',
    title: '賣家確認成交 → 商品自動下架',
    expect: 'orders.status=completed；products.status=sold 且寫入 soldAt；商品從首頁消失',
    runner: RUNNER.DUO,
  },
  {
    id: 'C-13',
    area: 'C. 交易邏輯',
    title: '交易後互評累加評分',
    expect: 'reviews 新增一筆；被評者 users.ratingSum/ratingCount 以 increment 累加；評論文字不外流給對方',
    runner: RUNNER.DUO,
  },
  {
    id: 'C-14',
    area: 'C. 交易邏輯',
    title: '取消配額 30 天內 3 次',
    expect: '每次取消 cancelCount+1；達 3 次後顯示上限提示且無法再取消；連點不會一次扣兩次',
    runner: RUNNER.DUO,
  },
  {
    id: 'C-15',
    area: 'C. 交易邏輯',
    title: '罐頭訊息只有當事人可讀寫',
    expect: '買賣雙方看得到彼此訊息；第三方帳號讀取該 orderId 的 messages 被規則拒絕',
    runner: RUNNER.DUO,
  },
  {
    id: 'C-16',
    area: 'C. 交易邏輯',
    title: '逾期 30 分鐘後改走逾期關閉',
    expect:
      '約定時間過 30 分鐘且雙方未都按安全交易 → 徽章變「⏰ 已逾期」、安全交易按鈕消失、' +
      '出現「逾期關閉」且取消 ✕ 不再顯示；按下後 status=expired，按的人不扣任何額度，' +
      '爽約記在「沒按安全交易」的一方（onOrderExpired 寫 expireCount，兩邊都沒按時各記一次）；' +
      '滿 3 次的人發起新交易會被擋；雙方都已按過安全交易的訂單不會被判逾期',
    runner: RUNNER.DUO,
  },
  {
    id: 'C-17',
    area: 'C. 交易邏輯',
    title: '推遲面交時間（買賣各 1 次）',
    expect:
      '聊天室送出「希望推遲至 X 點」→ 對方看到卡片可同意／婉拒；同意後 orders.time 立即更新、' +
      '雙方卡片同步；同一角色第 2 次入口變「推遲次數已用完」；逾期訂單經同意推遲後會重新可交易',
    runner: RUNNER.DUO,
  },

  /* ───── D. 資料庫互動 ───── */
  {
    id: 'D-01',
    area: 'D. 資料庫互動',
    title: '所有複合查詢都有對應索引',
    expect: '原始碼中每個 where+orderBy 組合，都能在 firestore.indexes.json 找到相符索引',
    runner: RUNNER.AUTO,
    fn: async () => checkIndexCoverage(),
  },
  {
    id: 'D-02',
    area: 'D. 資料庫互動',
    title: '公開複合查詢實際可執行',
    expect: '首頁／教科書用的 products 查詢直接打 REST 能回 200（證明索引真的已部署，不只是宣告）',
    runner: RUNNER.AUTO,
    network: true, // 打正式站 Firestore REST，--local 時跳過
    // ⚠️ 這裡的查詢條件必須與前端**完全一致（含 where 的數量）**。
    //    少送一個 where 就變成另一組索引需求，測出來的 400 是假警報。
    fn: async () => {
      const queries = [
        // Home.vue / Funnel.vue：where(status) + orderBy(createdAt)
        ['首頁/搜尋', [['status', 'active']], 'createdAt'],
        // Book.vue：where(category) + where(status) + orderBy(createdAt)
        ['教科書', [['category', '教科書'], ['status', 'active']], 'createdAt'],
      ];
      const errs = [];
      for (const [label, filters, order] of queries) {
        const fieldFilters = filters.map(([field, value]) => ({
          fieldFilter: {
            field: { fieldPath: field },
            op: 'EQUAL',
            value: { stringValue: value },
          },
        }));
        const body = {
          structuredQuery: {
            from: [{ collectionId: 'products' }],
            where:
              fieldFilters.length === 1
                ? fieldFilters[0]
                : { compositeFilter: { op: 'AND', filters: fieldFilters } },
            orderBy: [{ field: { fieldPath: order }, direction: 'DESCENDING' }],
            limit: 1,
          },
        };
        const res = await fetch(`${FS_DOCS}:runQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const t = await res.text();
          errs.push(
            `${label} → HTTP ${res.status}` +
              (/index/i.test(t) ? '（缺索引，需 firebase deploy --only firestore:indexes）' : '')
          );
        }
      }
      return errs.length
        ? [false, errs.join('; ')]
        : [true, `${queries.length} 個實際查詢皆可執行`];
    },
  },
  {
    id: 'D-03',
    area: 'D. 資料庫互動',
    title: '業務規則常數與規格一致',
    expect: '交易時段 6–18 時、安全交易前置 10 分鐘、取消 3 次/30 天、金額上限 10000',
    runner: RUNNER.AUTO,
    fn: async () => checkBusinessConstants(),
  },
  {
    id: 'D-04',
    area: 'D. 資料庫互動',
    title: '訂單欄位完整性',
    expect: '新訂單具備 buyerId/sellerId/productId/location/time/status/negotiationStep/createdAt',
    runner: RUNNER.DUO,
  },
  {
    id: 'D-05',
    area: 'D. 資料庫互動',
    title: '即時監聽跨裝置同步',
    expect: '一方變更訂單狀態，另一方畫面在不重新整理的情況下自動更新',
    runner: RUNNER.DUO,
  },
  {
    id: 'D-06',
    area: 'D. 資料庫互動',
    title: 'Auth 與 Firestore users 數量一致',
    expect: '管理後台「補齊缺失用戶資料」試跑結果為 0 筆缺失',
    runner: RUNNER.AUTH,
  },
  {
    id: 'D-07',
    area: 'D. 資料庫互動',
    title: '管理端資料與實際資料庫一致',
    expect: '商品巡邏的「上架中／已售出」數量，與 Firestore 實際 status 統計相符',
    runner: RUNNER.AUTH,
  },
];

/* ════════════════════════════════════════════════════════════════
   自動檢查的實作
   ════════════════════════════════════════════════════════════════ */

/** 遞迴列出 src 下的 .vue / .js */
function srcFiles(dir = join(ROOT, 'src'), out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) srcFiles(p, out);
    else if (/\.(vue|js)$/.test(name)) out.push(p);
  }
  return out;
}

/** 從 query( 起始位置做括號配對，取出完整呼叫文字 */
function balanced(src, from) {
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') {
      depth--;
      if (depth === 0) return src.slice(from, i + 1);
    }
  }
  return src.slice(from);
}

/**
 * D-01：靜態比對「原始碼實際發出的複合查詢」與「firestore.indexes.json 宣告的索引」。
 * 少一個索引，該查詢只會在使用者實際觸發時才在 console 噴錯，很容易漏掉。
 */
function checkIndexCoverage() {
  const declared = JSON.parse(read('firestore.indexes.json')).indexes.map((i) => ({
    col: i.collectionGroup,
    fields: i.fields.map((f) => f.fieldPath),
  }));

  const needed = [];
  for (const file of srcFiles()) {
    const src = readFileSync(file, 'utf8');
    let idx = 0;
    while ((idx = src.indexOf('query(', idx)) !== -1) {
      const call = balanced(src, idx);
      idx += 6;
      const colM = call.match(/collection\(\s*db\s*,\s*["'](\w+)["']/);
      if (!colM) continue;
      const wheres = [...call.matchAll(/where\(\s*["']([\w.]+)["']/g)].map((m) => m[1]);
      const orders = [...call.matchAll(/orderBy\(\s*["']([\w.]+)["']/g)].map((m) => m[1]);
      // 需要複合索引的條件：有等值過濾 + 有排序，且不是「同一個欄位」的單純組合
      const trivial = wheres.length === 1 && orders.length === 1 && wheres[0] === orders[0];
      if (wheres.length && orders.length && !trivial) {
        needed.push({
          col: colM[1],
          wheres,
          orders,
          where: file.replace(ROOT, '').replace(/\\/g, '/'),
        });
      }
    }
  }

  const missing = [];
  for (const q of needed) {
    const hit = declared.some((d) => {
      if (d.col !== q.col) return false;
      if (d.fields.length !== q.wheres.length + q.orders.length) return false;
      const eqPart = d.fields.slice(0, q.wheres.length);
      const ordPart = d.fields.slice(q.wheres.length);
      const eqOk = q.wheres.every((w) => eqPart.includes(w));
      const ordOk = q.orders.every((o, i) => ordPart[i] === o);
      return eqOk && ordOk;
    });
    if (!hit) {
      missing.push(
        `${q.col}(${q.wheres.join('+')} → ${q.orders.join(',')}) @${q.where}`
      );
    }
  }

  return missing.length
    ? [
        false,
        `缺少索引：${missing.join(' / ')}。這些查詢會在使用者觸發時才失敗，` +
          '請補進 firestore.indexes.json 並 firebase deploy --only firestore:indexes',
      ]
    : [true, `${needed.length} 個複合查詢皆有對應索引`];
}

/** D-03：業務常數必須與規格一致，被誤改會直接影響交易規則 */
function checkBusinessConstants() {
  const checks = [
    ['交易時段下限 06:00', 'src/components/TradeModal.vue', /hour >= 6/],
    ['交易時段上限 18:00', 'src/components/TradeModal.vue', /hour < 18/],
    ['安全交易前置 10 分鐘', 'src/components/Mailbox.vue', /SAFE_TRADE_WINDOW_MS = 10 \* 60 \* 1000/],
    ['取消上限 3 次', 'src/components/Mailbox.vue', /CANCEL_LIMIT = 3/],
    ['取消週期 30 天', 'src/components/Mailbox.vue', /CANCEL_PERIOD_MS = 30 \* 24 \* 60 \* 60 \* 1000/],
    ['成交金額上限 10000', 'src/components/Deal.vue', /MAX_PRICE = 10000/],
    ['賣家改期上限 1 次', 'src/components/Mailbox.vue', /'sell' && step >= 1/],
    ['買家改期上限 2 次', 'src/components/Mailbox.vue', /'buy' && step >= 2/],
    ['逾期寬限 30 分鐘', 'src/components/Mailbox.vue', /EXPIRE_GRACE_MS = 30 \* 60 \* 1000/],
    ['爽約上限 3 次（規則層）', 'firestore.rules', /expireCount', 0\) >= 3/],
    ['爽約上限 3 次（前端提示）', 'src/components/TradeModal.vue', /EXPIRE_LIMIT = 3/],
    ['爽約週期 30 天（規則層）', 'firestore.rules', /duration\.value\(30, 'd'\)/],
    ['爽約週期 30 天（Function）', 'functions/src/index.ts', /EXPIRE_PERIOD_MS = 30 \* 24 \* 60 \* 60 \* 1000/],
    ['推遲上限 24 小時', 'src/components/CannedChat.vue', /MAX_DELAY_MS = 24 \* 60 \* 60 \* 1000/],
  ];
  const bad = [];
  for (const [label, file, re] of checks) {
    if (!re.test(read(file))) bad.push(`${label}（${file}）`);
  }
  return bad.length
    ? [false, `常數與規格不符或已被改動：${bad.join('、')}`]
    : [true, `${checks.length} 項業務常數皆符合規格`];
}

/* ════════════════════════════════════════════════════════════════
   結果紀錄
   ════════════════════════════════════════════════════════════════ */
const loadResults = () =>
  existsSync(RESULTS_PATH) ? JSON.parse(readFileSync(RESULTS_PATH, 'utf8')) : {};
const saveResults = (r) =>
  writeFileSync(RESULTS_PATH, JSON.stringify(r, null, 2) + '\n', 'utf8');

function recordResult(id, status, note) {
  if (!CASES.some((c) => c.id === id)) {
    console.error(`找不到案例 ${id}`);
    process.exit(1);
  }
  const r = loadResults();
  if (status === 'reset') delete r[id];
  else r[id] = { status, note: note || '', date: new Date().toISOString().slice(0, 10) };
  saveResults(r);
  console.log(
    status === 'reset' ? `已清除 ${id} 的紀錄` : `已記錄 ${id} = ${status}${note ? `（${note}）` : ''}`
  );
}

/* ════════════════════════════════════════════════════════════════
   主流程
   ════════════════════════════════════════════════════════════════ */
const argv = process.argv.slice(2);
const flag = (n) => argv.indexOf(n);

for (const [f, s] of [['--pass', 'pass'], ['--fail', 'fail'], ['--reset', 'reset']]) {
  const i = flag(f);
  if (i !== -1) {
    recordResult(argv[i + 1], s, argv[i + 2]);
    process.exit(0);
  }
}
const LIST_ONLY = argv.includes('--list');
const LOCAL_ONLY = argv.includes('--local');

const C = {
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`,
  d: (s) => `\x1b[2m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
};

(async () => {
  console.log(
    C.b('\nYaBuy 回歸測試 ②：功能標準（系統該有的行為是否正常）') +
      (LOCAL_ONLY ? C.d('（--local：只跑不打網路的自動項目）') : '')
  );

  const manual = loadResults();
  const status = {}; // id → {mark, note}

  for (const c of CASES) {
    if (c.runner === RUNNER.AUTO && c.network && LOCAL_ONLY) {
      status[c.id] = { mark: 'skipped', note: '--local：跳過（需打網路，改用 npm run check:prod）' };
    } else if (c.runner === RUNNER.AUTO && !LIST_ONLY) {
      try {
        const [okAuto, detail] = await c.fn();
        status[c.id] = okAuto
          ? { mark: 'auto-pass', note: detail }
          : { mark: 'auto-fail', note: detail };
      } catch (e) {
        status[c.id] = { mark: 'auto-fail', note: `執行錯誤：${e.message}` };
      }
    } else if (manual[c.id]) {
      status[c.id] = {
        mark: manual[c.id].status === 'pass' ? 'man-pass' : 'man-fail',
        note: `${manual[c.id].date}${manual[c.id].note ? ' · ' + manual[c.id].note : ''}`,
      };
    } else {
      status[c.id] = { mark: 'todo', note: '' };
    }
  }

  const BADGE = {
    'auto-pass': C.g('[自動 ✓]'),
    'auto-fail': C.r('[自動 ✗]'),
    'man-pass': C.g('[人工 ✓]'),
    'man-fail': C.r('[人工 ✗]'),
    todo: C.y('[ 待測 ]'),
    skipped: C.d('[ 跳過 ]'),
  };

  let lastArea = '';
  for (const c of CASES) {
    if (c.area !== lastArea) {
      console.log(C.b(`\n${c.area}`));
      lastArea = c.area;
    }
    const s = status[c.id];
    const tag = s.mark === 'todo' ? C.d(` ${RUNNER_LABEL[c.runner]}`) : '';
    console.log(`  ${BADGE[s.mark]} ${c.id}  ${c.title}${tag}`);
    if (s.note) console.log(C.d(`            ${s.note}`));
    if (s.mark === 'todo') console.log(C.d(`            期待：${c.expect}`));
  }

  /* ── 進度總結 ──
     skipped（--local 跳過的網路案例）不算「待測」也不算「完成」，
     單獨列出，避免和真正需要人工驗證的項目混在一起、稀釋進度意義。 */
  const all = CASES.length;
  const done = CASES.filter((c) =>
    ['auto-pass', 'man-pass'].includes(status[c.id].mark)
  ).length;
  const failed = CASES.filter((c) =>
    ['auto-fail', 'man-fail'].includes(status[c.id].mark)
  ).length;
  const skipped = CASES.filter((c) => status[c.id].mark === 'skipped').length;
  const todo = CASES.filter((c) => status[c.id].mark === 'todo').length;
  const pct = Math.round((done / all) * 100);
  const bar = '█'.repeat(Math.round(pct / 5)).padEnd(20, '░');

  console.log(C.b('\n─────────────────────────────────────────────'));
  console.log(C.b(`進度  ${bar}  ${done}/${all} (${pct}%)`));
  console.log(
    `      ${C.g(`通過 ${done}`)} · ${failed ? C.r(`失敗 ${failed}`) : `失敗 ${failed}`} · ${C.y(`待測 ${todo}`)}` +
      (skipped ? ` · ${C.d(`跳過 ${skipped}`)}` : '')
  );

  if (failed) {
    console.log(C.r('\n⚠ 失敗項目（必須先修好）：'));
    CASES.filter((c) => ['auto-fail', 'man-fail'].includes(status[c.id].mark)).forEach((c) =>
      console.log(`   ${c.id} ${c.title}\n     → ${status[c.id].note}`)
    );
  }

  /* ── 下一步：依「誰能做」分組，讓工作流一目了然 ── */
  const pending = CASES.filter((c) => status[c.id].mark === 'todo');
  if (pending.length) {
    console.log(C.b('\n下一步該做什麼：'));
    for (const [runner, label, hint] of [
      [RUNNER.ANON, '免登入即可驗（模型可自行完成）', ''],
      [RUNNER.AUTH, '需使用者先登入，之後模型可自行完成', '請先在瀏覽器登入任一帳號'],
      [RUNNER.DUO, '需買賣雙方兩個帳號，需人類協調', '建議準備兩個測試帳號並排操作'],
      [RUNNER.EYE, '只能人眼判斷', ''],
    ]) {
      const g = pending.filter((c) => c.runner === runner);
      if (!g.length) continue;
      console.log(`\n  ${C.b(label)}${hint ? C.d(`（${hint}）`) : ''}  共 ${g.length} 項`);
      g.forEach((c) => console.log(`    ${c.id}  ${c.title}`));
    }
    console.log(
      C.d('\n  驗完一項就記錄：npm run check:func -- --pass <ID> "備註"')
    );
  }

  console.log('');
  process.exit(failed ? 1 : 0);
})();
