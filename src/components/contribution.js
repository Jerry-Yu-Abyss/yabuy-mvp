// contribution.js
// 貢獻度等級的單一事實來源。Contribution.vue（完整頁面）與 User.vue（個人頁徽章）
// 都需要算「同一個人現在是幾級」，抽成共用模組，避免兩處各自硬寫一份門檻，
// 未來調整等級門檻時只會有一個地方要改，不會有兩個畫面顯示不同等級的風險。

// 等級門檻（買賣總和 → 等級）。需求給的是 {1:1, 5:2, 10:3, 30:4, 50:5}：
// key 是達到該等級所需的交易總數，value 是等級。以「大於等於門檻」判定。
export const TIERS = [
  { level: 1, min: 1,  title: '循環新芽', sub: '你完成了第一次交易，讓一件物品有了新的主人。' },
  { level: 2, min: 5,  title: '循環常客', sub: '交易已成習慣，你正在把二手變成日常選項。' },
  { level: 3, min: 10, title: '循環推手', sub: '十件物品因你而延續，影響力開始擴散。' },
  { level: 4, min: 30, title: '循環達人', sub: '三十件的累積，是校園裡少見的長期投入。' },
  { level: 5, min: 50, title: '循環典範', sub: '你已是校園循環的中流砥柱，帶動整個社群。' }
];

export const TIER_ZERO = {
  level: 0,
  title: '準備啟程',
  sub: '完成第一筆交易，就能點亮你的第一個等級。'
};

// total（已完成交易的賣出數 + 買入數）→ 等級（0~5）
export const levelForTotal = (total) => {
  let lv = 0;
  for (const t of TIERS) if (total >= t.min) lv = t.level;
  return lv;
};

export const tierForLevel = (level) => TIERS.find((t) => t.level === level) || TIER_ZERO;
