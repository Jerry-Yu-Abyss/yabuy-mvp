// ================= 🌟 YaBuy 註冊信箱防呆模組 =================
// 為什麼需要：Firebase 只驗信箱「格式」不驗「存在」。使用者把網域打錯照樣註冊
// 成功，驗證信寄向一個不存在的位址，帳號就此卡死 —— 永遠驗不過、不能交易、
// 不能上架，而全站目前沒有任何改信箱或刪帳號的自救路徑。
//
// 還有一層不明顯的連帶風險：寄信管道 Resend 底層跑在 Amazon SES 上
//（SPF 是 include:amazonses.com）。SES 對硬退信率很敏感，打錯的信箱累積多了會
// 拖垮 yabuy-tw.com 的寄件信譽，最後連正常使用者的驗證信都開始進垃圾郵件匣。
// 所以防呆要做在註冊前，不能等信寄出去才發現。
//
// 本模組只做「提示」不做「限制」：不在清單裡的網域一律照常放行。
// 要不要限制成校內信箱是產品決策，不由這裡決定。

// 比對基準：台灣校園常見的信箱網域（含亞大兩個校內網域）。
const KNOWN_DOMAINS = [
  'gmail.com',
  'yahoo.com.tw', 'yahoo.com',
  'hotmail.com', 'outlook.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com',
  'pchome.com.tw', 'seed.net.tw',
  'asia.edu.tw', 'live.asia.edu.tw',
];

// Damerau-Levenshtein（含相鄰字元交換）編輯距離。
// 為什麼不用單純的 Levenshtein：最常見的手滑是「打顛倒」——gmial.com、hotmial.com，
// 純 Levenshtein 會把一次交換算成 2 步，跟真的差兩個字母混在一起無法區分。
const editDistance = (a, b) => {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,          // 刪除
        d[i][j - 1] + 1,          // 插入
        d[i - 1][j - 1] + cost    // 取代
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);   // 相鄰交換
      }
    }
  }
  return d[m][n];
};

// 疑似打錯時回傳「建議的完整信箱」，沒有可疑之處回傳空字串。
// 回傳完整信箱而不是只回網域，是為了讓呼叫端可以一鍵直接帶入輸入框。
export const suggestEmailDomain = (email) => {
  const raw = String(email || '').trim().toLowerCase();
  const at = raw.lastIndexOf('@');
  if (at <= 0 || at === raw.length - 1) return '';   // 還沒打完，不要急著挑毛病

  const local = raw.slice(0, at);
  const domain = raw.slice(at + 1);
  if (KNOWN_DOMAINS.includes(domain)) return '';     // 本來就是常見網域，別誤報

  // 註：mail.com / ymail.com 這種「離 gmail.com 只差一步的真實網域」會被誤報。
  // 刻意不把它們加進 KNOWN_DOMAINS —— 加了就等於放掉「少打一個 g」這個常見手滑。
  // 誤報只是多一行可以無視的提示，漏報卻會讓使用者的帳號永久卡死，兩者不對等。

  // 短網域放寬到 1 步就好：字串越短，距離 2 已經是完全不同的網域了。
  const limit = domain.length < 7 ? 1 : 2;

  let best = '';
  let bestDist = Infinity;
  for (const known of KNOWN_DOMAINS) {
    const dist = editDistance(domain, known);
    if (dist < bestDist) { bestDist = dist; best = known; }
  }
  return bestDist <= limit ? `${local}@${best}` : '';
};

// 註冊時的信箱二次確認。大小寫不敏感 —— 網域本來就不分大小寫，
// 使用者第二次打成 Gmail.com 就被擋下來只會讓人莫名其妙。
export const emailsMatch = (a, b) =>
  String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
