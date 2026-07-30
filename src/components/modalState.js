// modalState.js
// 共享的「目前有幾個全螢幕彈窗開著」計數器。
// 只要計數 > 0，App.vue 就會自動收起底部選單、釋放操作空間。
//
// 用法：
//   - 若彈窗是獨立元件、以 v-if 掛載/卸載（如 TradeModal），
//     在該元件的 onMounted 呼叫 registerModalOpen()、onUnmounted 呼叫 registerModalClose()。
//   - 若彈窗是頁面內部的 ref 切換（如 User.vue 的 isEditing），
//     用 watch 監看該 ref，true 時呼叫 registerModalOpen()、false 時呼叫 registerModalClose()。
//
// 用計數器而非單一布林值，是因為可能同時有多個彈窗來源（不同頁面各自的彈窗），
// 用計數可以避免其中一個關閉時，誤把另一個仍開著的彈窗狀態一起蓋掉。
import { ref, computed } from 'vue';

const openModalCount = ref(0);

export const isAnyModalOpen = computed(() => openModalCount.value > 0);

export const registerModalOpen = () => {
  openModalCount.value++;
};

export const registerModalClose = () => {
  openModalCount.value = Math.max(0, openModalCount.value - 1);
};
