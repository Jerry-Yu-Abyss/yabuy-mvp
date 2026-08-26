<template>
  <div class="modern-modal-overlay" @click.self="$emit('close')" @touchmove.stop>
    
    <div class="modern-sheet" v-if="product">
      <div class="sheet-handle"></div>

      <header class="sheet-header">
        <div class="header-text">
          <h3>預約校園交易</h3>
          <p class="subtitle">請填寫預計的會面資訊</p>
        </div>
        <button class="close-circle" @click="$emit('close')">✕</button>
      </header>

      <div class="product-glass-card">
        <div class="p-details">
          <span class="p-name">{{ product.name }}</span>
          <span class="p-price">${{ product.price }}</span>
        </div>
        <div class="p-tag">待預約</div>
      </div>

      <div class="sheet-body">
        <section class="input-section">
          <label class="section-label">約定交易時間</label>
          <div class="custom-input-box" :class="{ 'error-state': tradeInfo.time && !isTimeValid }">
            <span class="input-icon">🕒</span>
            <input type="datetime-local" v-model="tradeInfo.time" />
          </div>
          <Transition name="slide-fade">
            <p v-if="tradeInfo.time && !isTimeValid" class="warning-text">
              ⚠️ 安全提醒：僅限 06:00 - 18:00 間交易
            </p>
            <p v-else-if="!enforceSafeHours" class="warning-text test-mode">
              🧪 測試模式：管理員已暫時關閉 06:00 - 18:00 的時段限制
            </p>
          </Transition>
        </section>

        <section class="input-section">
          <label class="section-label">選擇交易地點</label>
          <div class="location-flex">
            <button 
              v-for="loc in locations" :key="loc" 
              class="location-chip" 
              :class="{ active: tradeInfo.location === loc }"
              @click="tradeInfo.location = loc"
            >
              {{ loc }}
            </button>
          </div>
        </section>
      </div>

      <footer class="sheet-footer">
        <button
          class="confirm-action-btn"
          :disabled="isSending || showSuccess || !tradeInfo.time || !tradeInfo.location || !isTimeValid"
          @click="handleSend"
        >
          {{ isSending ? '傳送中...' : (isTimeValid ? '發送預約請求' : '時間不符合規範') }}
        </button>
      </footer>
    </div>
  </div>

  <SendSuccessAnimation
    :visible="showSuccess"
    @done="showSuccess = false; $emit('close')"
  />
</template>

<script setup>
import { reactive, computed, ref, onMounted, onUnmounted } from 'vue';
import { auth, db } from '@/firebase';
import { toast } from './toast.js';
import { isAnyModalOpen, registerModalOpen, registerModalClose } from './modalState.js';
import { blockUnverifiedForTrade } from './verify.js';
import { enforceSafeHours, isTradeHourAllowed, subscribeTradeSettings } from './tradeSettings.js';
import { collection, addDoc, doc, getDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import SendSuccessAnimation from './SendSuccessAnimation.vue';

// 彈窗掛載＝正在開啟，卸載＝已關閉。App.vue 讀共享計數器來收起底部選單，
// 不需要每個開啟本元件的父頁面各自 emit 通知。
onMounted(() => { registerModalOpen(); subscribeTradeSettings(); });
onUnmounted(() => { registerModalClose(); });

const props = defineProps(['product']);
const emit = defineEmits(['close', 'submit']);

const showSuccess = ref(false);
const isSending = ref(false);   // 送出中：擋住重複點擊，同時讓按鈕顯示「傳送中...」

const locations = ['圖書館', '美術館', '築夢學院宿舍', '管理學院', '鳥籠', '感恩學院宿舍'];

// 逾期爽約閘門：30 天內被記滿 3 次的人不能再發起新交易，週期過完自動恢復。
// 次數由 Cloud Function onOrderExpired 寫入，firestore.rules 的
// notExpireBanned() 也會擋一次——這裡只是為了給出人看得懂的理由，
// 少了這段使用者只會拿到一句無來由的 permission-denied。
const EXPIRE_LIMIT = 3;
const EXPIRE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

// 兩種紀錄分開計數、各自 3 次，踩到任一條都擋。回傳擋下的理由，null 表示放行。
const OFFENCES = [
  { count: 'expireCount', start: 'expirePeriodStart', label: '面交爽約' },
  { count: 'noReplyCount', start: 'noReplyPeriodStart', label: '未回應交易請求' }
];

const expireBanReason = async (uid) => {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const data = snap.exists() ? snap.data() : {};
    for (const o of OFFENCES) {
      const startMs = data[o.start]?.toMillis?.() ?? null;
      if (startMs === null || (Date.now() - startMs) > EXPIRE_PERIOD_MS) continue;
      if ((data[o.count] || 0) >= EXPIRE_LIMIT) return o.label;
    }
    return null;
  } catch (e) {
    // 讀不到就放行：規則層還會再擋一次，不該因為一次讀取失敗就讓人不能交易
    console.error('[TradeModal] 讀取逾期紀錄失敗，暫以未達上限處理：', e.code, e.message);
    return null;
  }
};

const tradeInfo = reactive({
  time: '',
  location: ''
});

// ✅ 邏輯檢查：禁止 18:00 後至 06:00 前的交易。
// 判斷本身移到 tradeSettings.js，因為管理端可以整條關掉（測試用），而且
// CannedChat 的推遲提議要走同一條規則——兩邊各寫一份就會改了一邊漏一邊。
const isTimeValid = computed(() => {
  if (!tradeInfo.time) return true;
  return isTradeHourAllowed(new Date(tradeInfo.time).getHours());
});

const handleSend = async () => {
  // 🌟 防連點：網路慢的時候使用者常常會連按好幾下「發送」，
  // 這支函式一次會寫 audit_logs + orders 兩筆文件，重複觸發會產生重複訂單。
  // isSending 擋「請求還在飛」的期間，showSuccess 擋「已送出成功、正在播動畫」的期間。
  if (isSending.value || showSuccess.value) return;
  isSending.value = true;
  try {
    await sendTradeRequest();
  } finally {
    isSending.value = false;
  }
};

const sendTradeRequest = async () => {
  const user = auth.currentUser;
  const p = props.product;

  if (!user || !user.uid) {
    toast("🛑 安全防護：檢測到異常越權操作，請重新登入！");
    return;
  }

  // ✅ 商業邏輯防護：禁止購買自己上架的商品
  // （開發測試「自己買自己」時，可暫時把這段註解掉）
  if (user.uid === p.sellerId) {
    toast("❌ 您不能預約購買自己上架的商品！");
    return;
  }

  // ✅ 信任防護：發起交易前要求 emailVerified（與 Firestore users.verify 同源判定）
  if (!(await blockUnverifiedForTrade(user, toast))) return;

  if (!isTimeValid.value) {
    toast("⚠️ 安全提醒：非規定的面交時間（06:00 - 18:00），預約已被系統攔截。");
    return;
  }

  const banReason = await expireBanReason(user.uid);
  if (banReason) {
    toast(`🚫 你在 30 天內已有 ${EXPIRE_LIMIT} 次${banReason}紀錄，暫時無法發起新交易。`);
    return;
  }

  try {
    const formattedTime = tradeInfo.time.replace('T', ' ');

    await addDoc(collection(db, "audit_logs"), {
      category: 'trade',
      level: 'normal',
      title: '🤝 新校園面交預約成立',
      content: `買家 ${user.displayName || '同學'} 成功對商品「${p.name}」發起面交請求。約定地點：${tradeInfo.location}。`,
      buyerId: user.uid,
      sellerId: p.sellerId || 'UNKNOWN',
      productId: p.id || '',
      createdAt: serverTimestamp() 
    });

    emit('submit', {
      buyerId:      user.uid,
      buyerName:    user.displayName || '買家',
      sellerId:     p.sellerId || '',
      sellerName:   p.sellerName || '賣家',
      productId:    p.id || '',
      productName:  p.name || '',
      productPrice: p.price || 0,
      productImage: p.url || '',
      location:     tradeInfo.location,
      originalTime: formattedTime, 
      time:         formattedTime, 
      status:       'pending',
      negotiationStep: 0,
      lastActionBy: null,
    });

    // 💡 快速下架外掛：如果你希望「買家一按下發送預約，商品就直接從首頁下架」
    // 可以解除下方這行的註解：
    // await deleteDoc(doc(db, "products", p.id));

    console.log("🚀 [YaBuy 溯源追蹤] 交易日誌與訂單請求同步發送成功！");
    showSuccess.value = true;

  } catch (error) {
    console.error("❌ 寫入交易追蹤日誌時失敗:", error.message);
    toast("❌ 系統錯誤：面交預約發送失敗，請稍後再試。");
  }
};
</script>

<style scoped>
/* 保持所有樣式不變，確保版面完美 */
.modern-modal-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(8px); z-index: 10000; display: flex; justify-content: center; align-items: flex-end; }
.modern-sheet { width: 100%; max-width: 500px; background: #ffffff; border-radius: 32px 32px 0 0; padding: 20px 24px 40px; display: flex; flex-direction: column; gap: 24px; box-shadow: 0 -10px 40px rgba(0,0,0,0.1); animation: sheetUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes sheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
.sheet-handle { width: 40px; height: 5px; background: #e0e0e0; border-radius: 10px; margin: 0 auto; }
.sheet-header { display: flex; justify-content: space-between; align-items: flex-start; }
.sheet-header h3 { font-size: 20px; font-weight: 850; color: #1a1a1a; margin: 0; }
.subtitle { font-size: 13px; color: #8e8e93; margin: 4px 0 0; }
.close-circle { width: 32px; height: 32px; border-radius: 50%; border: none; background: #f2f2f7; color: #8e8e93; font-size: 14px; cursor: pointer; }
.product-glass-card { background: rgba(172, 198, 177, 0.15); padding: 16px; border-radius: 20px; display: flex; justify-content: space-between; align-items: center; border: 1px solid rgba(172, 198, 177, 0.2); }
.p-details { display: flex; flex-direction: column; gap: 4px; }
.p-name { font-weight: 750; color: #2c3e50; font-size: 15px; }
.p-price { font-weight: 900; color: #333; font-size: 18px; }
.p-tag { font-size: 10px; font-weight: 800; background: #333; color: #fff; padding: 4px 10px; border-radius: 8px; }
.section-label { font-size: 12px; font-weight: 800; color: #999; text-transform: uppercase; margin-bottom: 8px; display: block; }
.custom-input-box { background: #f5f5f7; padding: 14px 16px; border-radius: 16px; display: flex; align-items: center; gap: 12px; border: 2px solid transparent; transition: 0.3s; }
.custom-input-box.error-state { border-color: #cf847d; background: #fff5f4; }
.custom-input-box input { border: none; background: transparent; flex: 1; font-size: 16px; font-weight: 600; outline: none; color: #333; }
.warning-text { font-size: 12px; color: #cf847d; font-weight: 700; margin: 8px 0 0 4px; }
.location-flex { display: flex; flex-wrap: wrap; gap: 8px; }
.location-chip { padding: 10px 18px; background: #f5f5f7; border-radius: 14px; border: none; font-size: 13px; font-weight: 700; color: #666; transition: 0.2s; cursor: pointer; }
.location-chip.active { background: #333; color: #fff; transform: scale(1.05); }
.confirm-action-btn { width: 100%; height: 56px; background: #333; color: #fff; border: none; border-radius: 18px; font-size: 16px; font-weight: 850; cursor: pointer; transition: 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
.confirm-action-btn:disabled { background: #e0e0e0; color: #a1a1a1; cursor: not-allowed; }
.confirm-action-btn:not(:disabled):active { transform: scale(0.97); }
.slide-fade-enter-active, .slide-fade-leave-active { transition: all 0.3s ease; }
.slide-fade-enter-from, .slide-fade-leave-to { opacity: 0; transform: translateY(-10px); }
.warning-text.test-mode { color: #b26a00; }
</style>