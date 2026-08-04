// TradePoints.js
// 校園交易點清單：每個地點對應一組固定代碼，實體 QR 貼在該地點、內容即此代碼。
// 名稱需與 TradeModal.vue / Mailbox.vue 的 locations 陣列完全一致，
// 否則訂單的 location 字串會對不到代碼，導致掃描永遠失敗。

export const TRADE_POINTS = [
  { code: 'LIB01',   name: '圖書館' },
  { code: 'ART01',   name: '美術館' },
  { code: 'DREAM01', name: '築夢學院宿舍' },
  { code: 'MGT01',   name: '管理學院' },
  { code: 'CAGE01',  name: '鳥籠' },
  { code: 'GRACE01', name: '感恩學院宿舍' }
];

export const codeForLocationName = (name) =>
  TRADE_POINTS.find((p) => p.name === name)?.code || null;

export const nameForLocationCode = (code) =>
  TRADE_POINTS.find((p) => p.code === code)?.name || code || '';
