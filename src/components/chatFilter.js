// chatFilter.js
// 自由私訊的內容偵測：單一事實來源。
//
// 這個檔案存在的理由：CannedChat.vue 從「只能點固定短語」改成「可以自由打字」
// 之後，原本靠「輸入面積為零」換來的安全就沒了。私下要到 LINE／IG 之後，交易
// 會離開平台——面交驗證、爽約記次、檢舉、評價全部失效，而那正是這個系統唯一
// 的保護。所以聯絡資訊不是「不禮貌」，是會直接掏空平台安全模型的行為。
//
// ⚠️ 分層：這裡擋的是「使用者體驗層」，繞過前端直接打 REST 一樣寫得進去。
// 真正的閘門在 firestore.rules 的 chatTextOk()。兩層的關係必須是
// **規則層擋的 ⊆ 這裡擋的**——反過來的話，使用者會送出一則前端放行、規則層
// 回 403 的訊息，畫面只能顯示「送出失敗」而說不出原因。下面 rulesWouldBlock()
// 就是規則層那幾條的鏡像，改動時兩邊要一起改。
//
// 為什麼偵測要做正規化：直接比對 "line" 只擋得住老實人。實際會看到的是
// "l i n e"、"賴"、"０９１２..."、"09 12 34 56 78"，以及最麻煩的「一則傳一個
// 字」。前幾種靠正規化，最後一種靠跨訊息視窗（inspectMessage 的 myRecent
// 參數）——單獨看每一則都無辜，串起來才是一支電話號碼。

export const MAX_MESSAGE_LEN = 200;
export const MAX_REPORT_DETAIL_LEN = 500;

// 跨訊息視窗：同一個人最近這麼多則／這麼長時間內的訊息會被串起來一起驗。
// 12 則 × 10 分鐘足以覆蓋「一則一個字」拼出 10 碼手機的節奏，又不會把
// 半小時前的正常對話拖進來一起誤判。
const WINDOW_COUNT = 12;
const WINDOW_MS = 10 * 60 * 1000;

/* ────────────────────────────────────────────────────────────────
   正規化
   ──────────────────────────────────────────────────────────────── */

// 全形英數與全形標點還原成半形；全形空格當一般空格
const toHalfWidth = (s) =>
  String(s || '')
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ');

// 中文數字只在「連續 5 個以上」時才還原成阿拉伯數字。
// 不能無條件換：「一下」「二手」「第三個」在正常對話裡到處都是，一律換掉會
// 讓數字偵測整個失準；但「零九一二三四五六七八」這種只可能是電話。
const CJK_DIGIT = {
  零: '0', 〇: '0', 一: '1', 壹: '1', 二: '2', 貳: '2', 兩: '2', 三: '3', 參: '3',
  四: '4', 肆: '4', 五: '5', 伍: '5', 六: '6', 陸: '6', 七: '7', 柒: '7',
  八: '8', 捌: '8', 九: '9', 玖: '9'
};
const CJK_DIGIT_RUN = /[零〇一壹二貳兩三參四肆五伍六陸七柒八捌九玖]{5,}/g;
const foldCjkDigits = (s) =>
  s.replace(CJK_DIGIT_RUN, (run) => run.replace(/./g, (c) => CJK_DIGIT[c] || c));

// 比對用的緊縮字串：只留下英數與中日韓文字，其餘（空白、標點、emoji、換行、
// 注音）全部丟掉。"l i n e" / "l.i.n.e" / "ｌ－ｉ－ｎ－ｅ" 都會變成 "line"。
export const compactify = (text) =>
  foldCjkDigits(toHalfWidth(text))
    .toLowerCase()
    .replace(/[^0-9a-z㐀-鿿]/g, '');

/* ────────────────────────────────────────────────────────────────
   規則層鏡像（必須與 firestore.rules 的 chatTextOk() 保持一致）
   ──────────────────────────────────────────────────────────────── */

// 8 個數字，彼此之間最多隔 2 個非數字。這一條直接打在**原文**上，不做正規化，
// 因為 firestore.rules 沒有正規化的手段，只認得原文長什麼樣子。
// 副作用：「2026-09-09 14:30」這種完整日期也會被擋（剛好 8 個數字、間隔 1）。
// 這是刻意接受的——推遲時間有專用的結構化卡片，不需要在聊天裡打完整日期，
// 而「8 個數字擠在一起」本來就是電話號碼的形狀。
const RAW_DIGIT_RUN = /[0-9](?:[^0-9]{0,2}[0-9]){7}/;

// 規則層認得的關鍵字（原文小寫，未正規化）。故意比下面的完整清單短——
// 規則層只是後盾，寫太多長 regex 會拖慢每一次寫入的判定。
const RULES_KEYWORDS =
  /(instagram|facebook|messenger|wechat|weixin|telegram|whatsapp|discord|kakao|snapchat|gmail|http|www\.|微信|賴|加我|私訊|電話|手機|帳號)/;
const RULES_SHORT_TOKENS = /(^|[^a-z])(line|ig|fb|tg|dc|qq|id)([^a-z]|$)/;

// 單一個英數字元的訊息。「逐字傳送」的最小單位就是這個，擋掉它，把繞過的
// 成本推高到「至少兩個字元一則」——那正好落進跨訊息視窗裡。
const SINGLE_ALNUM = /^[0-9a-z]$/i;

/** 規則層會不會擋下這則訊息（前端用來提前給出理由，而不是吃 403） */
const rulesWouldBlock = (raw) => {
  const half = toHalfWidth(raw);
  const low = half.toLowerCase();
  if (SINGLE_ALNUM.test(half.trim())) {
    return '單獨一個英文字母或數字不會送出（那是逐字傳聯絡資訊的常見手法）。';
  }
  if (RAW_DIGIT_RUN.test(half)) {
    return '訊息裡有連續 8 個以上的數字，看起來像電話號碼。';
  }
  if (RULES_KEYWORDS.test(low) || RULES_SHORT_TOKENS.test(low)) {
    return '訊息含社群帳號或聯絡方式的字眼。';
  }
  return null;
};

/* ────────────────────────────────────────────────────────────────
   完整偵測（正規化之後才比對）
   ──────────────────────────────────────────────────────────────── */

// 明確到不會誤判的字眼，直接當子字串比對
const CONTACT_KEYWORDS = [
  'instagram', 'insta', 'facebook', 'messenger', 'wechat', 'weixin',
  'telegram', 'whatsapp', 'discord', 'kakao', 'snapchat', 'twitter', 'threads',
  'gmail', 'hotmail', 'yahoo', 'outlook', 'http', 'www', 'tme',
  '微信', '賴', '加賴', '電話', '手機', '號碼', '私訊', '私聊', '加我', '密我',
  '帳號', '聯絡方式', '連絡方式', '加好友', '好友', '通訊軟體', '掃我', '掃碼加'
];

// 太短、會誤傷正常字詞的 token（line 在 online／deadline 裡，ig 在 big／might
// 裡），要求前後不是英文字母才算命中。緊縮字串裡的中文字元也算「非英文字母」，
// 所以「加我line」照樣抓得到。
const CONTACT_TOKENS = /(^|[^a-z])(line|ig|fb|tg|dc|qq|id|snap|kik)(?![a-z])/;

// 常見騷擾用語。清單刻意保守：只放單獨出現就幾乎不可能是正常交易對話的詞。
// 「色」（顏色）、「裸」（裸機）、「幹」（幹嘛）這種在二手交易情境裡有正當
// 用法的單字一律不收，只收帶上下文的組合。
const HARASSMENT_KEYWORDS = [
  '約砲', '約炮', '打炮', '一夜情', '援交', '包養', '賣淫', '性交易',
  '色情', '色狼', '好色', '裸照', '裸體', '想上你', '想上妳', '性感照',
  '幹你', '幹妳', '幹您', '操你', '操妳', '你媽', '妳媽', '婊子', '賤人',
  '賤貨', '智障', '白痴', '白癡', '廢物', '醜八怪', '去死', '死全家', '神經病',
  'fuck', 'bitch', 'slut', 'dick', 'nude'
];

// 數字的替身。只收形狀真的很像的，e／a／t 這種太常見的字母不收——
// 收了會讓 "please"（p-l-e-a-s-e）被讀成一串數字。
const DIGIT_LOOKALIKE = new Set(['o', 'l', 'i', 'z', 's', 'b', 'g', 'q']);

/**
 * 緊縮字串裡有沒有「電話號碼形狀」的片段。
 * 判準是連續 8 個以上的「數字或數字替身」，其中真數字至少 5 個——
 * 純字母的英文單字湊不出這個比例，"09l2345678" 這種混淆卻躲不掉。
 */
const hasNumberRun = (compact) => {
  let run = 0;
  let digits = 0;
  for (const c of compact) {
    const isDigit = c >= '0' && c <= '9';
    if (isDigit || DIGIT_LOOKALIKE.has(c)) {
      run++;
      if (isDigit) digits++;
      if (run >= 8 && digits >= 5) return true;
    } else {
      run = 0;
      digits = 0;
    }
  }
  return false;
};

/** 對「已正規化的緊縮字串」跑所有內容比對，回傳理由或 null */
const scanCompact = (compact) => {
  if (!compact) return null;
  if (HARASSMENT_KEYWORDS.some((k) => compact.includes(k))) {
    return '訊息含不當或冒犯性用語。';
  }
  if (CONTACT_KEYWORDS.some((k) => compact.includes(k)) || CONTACT_TOKENS.test(compact)) {
    return '訊息含社群帳號或聯絡方式的字眼。';
  }
  if (hasNumberRun(compact)) {
    return '訊息裡有像電話號碼或帳號的數字串。';
  }
  return null;
};

/** createdAt 可能是 Firestore Timestamp、Date、數字，或還沒回填的 null */
const toMillis = (v) => {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v?.toMillis === 'function') return v.toMillis();
  if (v instanceof Date) return v.getTime();
  return null;
};

/**
 * 檢查一則即將送出的訊息。
 *
 * @param {string} text      使用者輸入的原文
 * @param {Array}  myRecent  我自己最近送出的訊息（{ text, createdAt }，createdAt
 *                           可為 Firestore Timestamp、Date 或毫秒；缺漏就當作在
 *                           視窗內，寧可多驗一次也不要漏掉逐字傳送）
 * @returns {{ ok: boolean, reason: string|null, scope: 'single'|'window'|null }}
 */
export const inspectMessage = (text, myRecent = []) => {
  const raw = String(text ?? '');
  const trimmed = raw.trim();

  if (!trimmed) return { ok: false, reason: '訊息不能是空白。', scope: 'single' };
  if (trimmed.length > MAX_MESSAGE_LEN) {
    return {
      ok: false,
      reason: `訊息最長 ${MAX_MESSAGE_LEN} 字，目前 ${trimmed.length} 字。`,
      scope: 'single'
    };
  }

  // 規則層鏡像先跑：它擋得下的，這裡一定要先擋，否則使用者會吃到 403
  const mirrored = rulesWouldBlock(trimmed);
  if (mirrored) return { ok: false, reason: mirrored, scope: 'single' };

  const single = scanCompact(compactify(trimmed));
  if (single) return { ok: false, reason: single, scope: 'single' };

  // 跨訊息：把最近的自言自語串起來再驗一次。單看「09」「12」「34」都無辜，
  // 串成「091234...」就現形了。
  const cutoff = Date.now() - WINDOW_MS;
  const recent = myRecent
    .slice(-WINDOW_COUNT)
    .filter((m) => {
      const ms = toMillis(m?.createdAt);
      return ms === null || ms >= cutoff;
    })
    .map((m) => m?.text || '');

  if (scanCompact(compactify(recent.join('') + trimmed))) {
    return {
      ok: false,
      reason: '把你剛剛幾則訊息連起來會拼出聯絡資訊，這則不會送出。',
      scope: 'window'
    };
  }

  return { ok: true, reason: null, scope: null };
};

/** 檢舉理由選項，Admin.vue 顯示時直接用這裡的字串 */
export const REPORT_REASONS = [
  '要求私下聯絡／離開平台交易',
  '騷擾、辱罵或不當言論',
  '詐騙或可疑行為',
  '商品與描述不符',
  '其他'
];
