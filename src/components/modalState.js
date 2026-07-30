// modalState.js
// 共享的「目前有全螢幕彈窗開著嗎」狀態。
// 用途：讓 App.vue 在有彈窗（如 TradeModal）開啟時，自動收起底部選單，
// 不需要每個開啟彈窗的子頁面（Home/Heart/User...）各自手動通知父層。
import { ref } from 'vue';

export const isTradeModalOpen = ref(false);
