<template>
  <div class="mailbox-page-root" @touchmove.stop>
    <header class="mailbox-header">
      <div class="header-top">
        <button class="back-btn-circle" @click="$emit('back-home')">✕</button>
        <h1 class="header-title">交易信箱</h1>
        <div class="placeholder"></div>
      </div>

      <div class="tab-switcher-container">
        <div class="tab-switcher">
          <div class="tab-item" :class="{ active: activeTab === 'buy' }" @click="activeTab = 'buy'">買入請求</div>
          <div class="tab-item" :class="{ active: activeTab === 'sell' }" @click="activeTab = 'sell'">收到訂單</div>
          <div class="tab-indicator" :style="indicatorStyle"></div>
        </div>
      </div>
    </header>

    <div class="message-list-area">
      <div v-if="loading" class="state-hint">
        <div class="loader-dots"><span>.</span><span>.</span><span>.</span></div>
        <p>同步亞大交易資料...</p>
      </div>

      <div v-else>
        <div v-if="systemMessages.length > 0" class="msg-center" :class="{ open: msgOpen }">
          <button
            type="button"
            class="msg-center-head"
            :class="{ 'no-toggle': !hasMoreMsgs }"
            @click="hasMoreMsgs && (msgOpen = !msgOpen)"
          >
            <span class="msg-center-title">📨 校園訊息</span>
            <span class="msg-center-count">{{ systemMessages.length }}</span>
            <span v-if="hasMoreMsgs" class="msg-center-chevron">
              {{ msgOpen ? '收合' : '查看全部' }} ▾
            </span>
          </button>

          <!-- 收起時也看得到的最新一則 -->
          <div class="msg-list">
            <div class="msg-item" :class="{ 'is-warning': latestMsg.type === 'warning' }">
              <div class="msg-icon">
                <span v-if="latestMsg.type === 'warning'">🚨</span>
                <span v-else>📢</span>
              </div>
              <div class="msg-content">
                <div class="msg-meta">
                  <span class="msg-sender">{{ latestMsg.sender || 'YaBuy 系統公告' }}</span>
                  <span class="msg-time">{{ formatTime(latestMsg.createdAt) }}</span>
                </div>
                <h3 class="msg-title">{{ latestMsg.title }}</h3>
                <p class="msg-desc">{{ latestMsg.content }}</p>
              </div>
            </div>
          </div>

          <!-- 其餘較舊訊息：一起收合，grid 0fr→1fr 平滑展開 -->
          <div class="msg-collapse" v-if="hasMoreMsgs">
            <div class="msg-collapse-inner">
              <div class="msg-list rest">
                <div
                  v-for="msg in restMsgs"
                  :key="msg.id"
                  class="msg-item"
                  :class="{ 'is-warning': msg.type === 'warning' }"
                >
                  <div class="msg-icon">
                    <span v-if="msg.type === 'warning'">🚨</span>
                    <span v-else>📢</span>
                  </div>
                  <div class="msg-content">
                    <div class="msg-meta">
                      <span class="msg-sender">{{ msg.sender || 'YaBuy 系統公告' }}</span>
                      <span class="msg-time">{{ formatTime(msg.createdAt) }}</span>
                    </div>
                    <h3 class="msg-title">{{ msg.title }}</h3>
                    <p class="msg-desc">{{ msg.content }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="filteredOrders.length > 0" class="order-cards-stack">
          <div v-for="order in filteredOrders" :key="order.id" class="order-card-modern">

            <div class="card-meta">
              <span class="status-badge" :class="order.status">{{ statusText(order.status) }}</span>
              <div class="meta-right">
                <span class="time-stamp">{{ formatTime(order.createdAt) }}</span>
                <button
                  v-if="canCancel(order)"
                  type="button"
                  class="card-cancel-btn"
                  title="取消請求"
                  @click.stop="cancelOrder(order)"
                >✕</button>
              </div>
            </div>
            
            <div class="card-main">
              <div class="prod-info-row">
                <div class="prod-thumb">
                  <img v-if="order.productImage" :src="order.productImage" />
                  <span v-else>📦</span>
                </div>
                <div class="prod-text">
                  <h3 class="prod-name">{{ order.productName }}</h3>
                  <span class="prod-price">${{ order.productPrice }}</span>
                </div>
              </div>

              <div class="details-box">
                <div class="detail-line">
                  <span class="icon">👤</span>
                  <span class="val">{{ activeTab === 'buy' ? '賣家：' + order.sellerName : '買家：' + order.buyerName }}</span>
                </div>
                <div class="detail-line" :class="{ 'negotiating-highlight': order.status === 'negotiating' }">
                  <span class="icon">📍</span>
                  <span class="val">{{ order.location || '校內面交' }}</span>
                </div>
                <div class="detail-line" :class="{ 'negotiating-highlight': order.status === 'negotiating' }">
                  <span class="icon">⏰</span>
                  <span class="val">{{ order.time }}</span>
                </div>
              </div>
            </div>

            <div class="card-actions">
              <template v-if="activeTab === 'sell'">
                <div v-if="order.status === 'pending'" class="btn-group">
                  <button class="btn-secondary" @click="rejectOrder(order)">婉拒</button>
                  <button class="btn-outline" @click="startNegotiate(order)">更改提案</button>
                  <button class="btn-primary" @click="acceptOrder(order)">接受</button>
                </div>

                <div v-if="order.status === 'negotiating' && order.lastActionBy === 'buyer'" class="btn-group-column">
                  <div class="info-bubble buyer-offer">買家提出了新提案，請確認</div>
                  <div class="btn-group">
                    <button class="btn-secondary" @click="rejectOrder(order)">婉拒</button>
                    <button class="btn-primary" @click="acceptOrder(order)">接受方案</button>
                  </div>
                </div>

                <div v-if="order.status === 'negotiating' && order.lastActionBy === 'seller'" class="btn-group-column">
                  <div class="info-bubble waiting">⏳ 已送出新方案，等待買家回覆</div>
                </div>
              </template>

              <template v-if="activeTab === 'buy'">
                <div v-if="order.status === 'negotiating' && order.lastActionBy === 'seller'" class="btn-group-column">
                  <div class="info-bubble seller-offer">賣家提議了新時間地點</div>
                  <div class="btn-group">
                    <button class="btn-outline" @click="startNegotiate(order)">再改一次</button>
                    <button class="btn-primary" @click="acceptOrder(order)">接受方案</button>
                  </div>
                </div>

                <div v-if="order.status === 'negotiating' && order.lastActionBy === 'buyer'" class="btn-group-column">
                  <div class="info-bubble waiting">⏳ 已送出新提案，等待賣家回覆</div>
                </div>
              </template>

              <Transition name="slide-up">
                <div v-if="order.isEditing" class="negotiate-panel">
                  <div class="panel-header">提出新交易方案</div>
                  <div class="location-chips">
                    <button 
                      v-for="loc in locations" :key="loc" 
                      class="loc-chip" 
                      :class="{ active: order.editLocation === loc }"
                      @click="order.editLocation = loc"
                    >
                      {{ loc }}
                    </button>
                  </div>
                  <input type="datetime-local" v-model="order.editTime" class="time-input-modern" />
                  <div class="panel-btns">
                    <button class="btn-text" @click="order.isEditing = false" :disabled="order.isSubmitting">取消</button>
                    <button 
                      class="btn-confirm" 
                      :class="{ 'is-loading': order.isSubmitting }"
                      @click="submitNegotiate(order)" 
                      :disabled="order.isSubmitting || !order.editLocation || !order.editTime"
                    >
                      {{ order.isSubmitting ? '傳送中...' : '送出新提案' }}
                    </button>
                  </div>
                </div>
              </Transition>

              <div v-if="order.status === 'accepted'" class="accepted-success-row">
                <div class="success-text">🎉 預約成功！</div>
                <button class="btn-deal-trigger" @click="goToDeal(order)">🚶 我抵達了</button>
              </div>

              <div v-if="order.status === 'completed'" class="price-summary">
                成交金額：<span class="price-val">${{ order.finalPrice }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="filteredOrders.length === 0" class="empty-state">
          <div class="empty-art">📩</div>
          <h3>沒有相關的交易訂單</h3>
        </div>
      </div>
    </div>
  </div>

  <Teleport to="body">
    <DealPage v-if="selectedDeal" :order="selectedDeal" :role="activeTab" @close="selectedDeal = null" />
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import DealPage from './Deal.vue';
import { auth, db } from '@/firebase'; 
import { collection, query, where, onSnapshot, orderBy, updateDoc, doc, serverTimestamp } from 'firebase/firestore'; 
import { onAuthStateChanged } from 'firebase/auth'; 

const emit = defineEmits(['back-home']);
const locations = ['圖書館', '美術館', '築夢學院宿舍', '管理學院', '鳥籠', '感恩學院宿舍']; 

const activeTab = ref('buy');
const loading = ref(true);
const buyOrders = ref([]);
const sellOrders = ref([]);

// 🌟 新增：存放全校廣播的陣列
const systemMessages = ref([]);

// 📨 訊息區收合：收起時仍顯示「最新一則」，其餘較舊的才收合。
//    systemMessages 由 qSystem 以 createdAt desc 排序，[0] 即最新。
const msgOpen = ref(false);
const latestMsg   = computed(() => systemMessages.value[0] || {});
const restMsgs    = computed(() => systemMessages.value.slice(1));
const hasMoreMsgs = computed(() => restMsgs.value.length > 0);

let unsubscribeBuy = null;
let unsubscribeSell = null;
let unsubscribeSystem = null; // 🌟 新增：廣播的監聽器

const initMailboxSync = () => {
  const user = auth.currentUser;
  if (!user) return;
  loading.value = true;

  const toOrder = (d, existingList) => {
    const existing = existingList.find(o => o.id === d.id);
    const data = d.data();
    
    const shouldStillEdit = existing?.isEditing && data.status === 'negotiating';

    return {
      id: d.id,
      ...data,
      isEditing:    shouldStillEdit ?? false,
      editTime:     existing?.editTime     ?? '',
      editLocation: existing?.editLocation ?? '',
      isSubmitting: false 
    };
  };

  // 1. 抓取買入訂單
  const qBuy = query(collection(db, "orders"), where("buyerId", "==", user.uid), orderBy("createdAt", "desc"));
  unsubscribeBuy = onSnapshot(qBuy, (snap) => {
    buyOrders.value = snap.docs.map(d => toOrder(d, buyOrders.value));
    loading.value = false;
  }, (err) => {
    console.error("[Mailbox] 買入訂單監聽失敗（檢查 orders 的 buyerId+createdAt 索引）：", err.code, err.message);
    loading.value = false;
  });

  // 2. 抓取賣出訂單
  const qSell = query(collection(db, "orders"), where("sellerId", "==", user.uid), orderBy("createdAt", "desc"));
  unsubscribeSell = onSnapshot(qSell, (snap) => {
    sellOrders.value = snap.docs.map(d => toOrder(d, sellOrders.value));
    loading.value = false;
  }, (err) => {
    console.error("[Mailbox] 賣出訂單監聽失敗（檢查 orders 的 sellerId+createdAt 索引）：", err.code, err.message);
    loading.value = false;
  });

  // 🌟 3. 新增：獨立抓取全校系統廣播 (target === 'ALL')
  // ✅ 替換為這一行 (使用 'in' 陣列查詢)：
const qSystem = query(
  collection(db, "notifications"), 
  where("target", "in", ["ALL", user.uid]), 
  orderBy("createdAt", "desc")
);
  unsubscribeSystem = onSnapshot(qSystem, (snap) => {
    systemMessages.value = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }, (err) => {
    console.error("[Mailbox] 系統公告監聽失敗（檢查 notifications 的 target+createdAt 索引）：", err.code, err.message);
  });
};

const filteredOrders = computed(() => activeTab.value === 'buy' ? buyOrders.value : sellOrders.value);
const indicatorStyle = computed(() => ({ transform: activeTab.value === 'buy' ? 'translateX(0)' : 'translateX(100%)' }));

const startNegotiate = (order) => {
  order.editTime = order.time ? order.time.replace(' ', 'T') : '';
  order.editLocation = order.location || '圖書館';
  order.isEditing = true;
};

const submitNegotiate = async (order) => {
  const step = order.negotiationStep || 0;
  if (activeTab.value === 'sell' && step >= 1) return alert("賣家僅限改期一次。");
  if (activeTab.value === 'buy' && step >= 2) return alert("買家僅限改期一次。");

  order.isSubmitting = true; 
  try {
    await updateDoc(doc(db, "orders", order.id), {
      time: order.editTime.replace('T', ' '),
      location: order.editLocation,
      status: 'negotiating',
      negotiationStep: step + 1,
      lastActionBy: activeTab.value === 'buy' ? 'buyer' : 'seller',
      updatedAt: serverTimestamp()
    });
    
    order.isSubmitting = false;
    order.isEditing = false;
  } catch (e) {
    alert("發送失敗，請重試。");
    order.isSubmitting = false;
  }
};

const acceptOrder = async (order) => {
  console.log('%c[Mailbox]', 'color:#1976d2;font-weight:bold;', '👉 接受訂單 →', { orderId: order.id, 目前status: order.status });
  try {
    await updateDoc(doc(db, "orders", order.id), { status: 'accepted', updatedAt: serverTimestamp() });
    console.log('%c[Mailbox]', 'color:#1976d2;font-weight:bold;', '✅ 訂單已設為 accepted');
    alert("✅ 預約成立！");
  } catch (e) { console.warn('[Mailbox] 🔥 接受訂單失敗：', e.code, e.message); alert("操作失敗"); }
};

const rejectOrder = async (order) => {
  if (confirm("確定取消預約？")) {
    await updateDoc(doc(db, "orders", order.id), { status: 'rejected', updatedAt: serverTimestamp() });
  }
};

// 買家自行取消尚未成立的請求（pending / negotiating）。
// 沿用 rejectOrder 同一套 'rejected' 狀態 —— statusText 已把它顯示為「已取消」，
// 買家取消、賣家婉拒本來就是同一種結果，沒必要另開一個狀態值。
const canCancel = (order) =>
  activeTab.value === 'buy' && (order.status === 'pending' || order.status === 'negotiating');

const cancelOrder = async (order) => {
  if (!confirm(`確定要取消「${order.productName}」的交易請求嗎？`)) return;
  try {
    await updateDoc(doc(db, "orders", order.id), {
      status: 'rejected',
      lastActionBy: 'buyer',
      updatedAt: serverTimestamp()
    });
  } catch (e) {
    console.error('[Mailbox] 取消請求失敗：', e.code, e.message);
    alert("取消失敗，請重試。");
  }
};

const statusText = (s) => ({ pending: '等待中', negotiating: '協商中', accepted: '預約成立', rejected: '已取消', failed: '交易失敗', completed: '✅ 已完成' }[s] || s);
const formatTime = (ts) => { if (!ts) return ''; const d = ts.toDate(); return `${d.getMonth()+1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`; };
const selectedDeal = ref(null);
const goToDeal = (order) => {
  console.log('%c[Mailbox]', 'color:#1976d2;font-weight:bold;', '🚶 點擊「我抵達了」→ 開啟 Deal', {
    orderId: order.id,
    role: activeTab.value,
    status: order.status,
    productId: order.productId,
    buyerReady: order.buyerReady,
    sellerReady: order.sellerReady
  });
  selectedDeal.value = order;
};

onMounted(() => { onAuthStateChanged(auth, (user) => { if (user) initMailboxSync(); }); });
onUnmounted(() => { 
  unsubscribeBuy?.(); 
  unsubscribeSell?.(); 
  unsubscribeSystem?.(); // 清除廣播監聽
});
</script>

<style scoped>
/* 📨 整個訊息區一鍵收合 */
.msg-center {
  margin-bottom: 24px;
  background: #fff;
  border-radius: 18px;
  box-shadow: 0 4px 15px rgba(0,0,0,0.04);
  overflow: hidden;
}
.msg-center-head {
  width: 100%; border: none; background: transparent; cursor: pointer;
  display: flex; align-items: center; gap: 8px;
  padding: 16px;
}
.msg-center-title { font-size: 14px; font-weight: 850; color: #333; }
.msg-center-count {
  font-size: 11px; font-weight: 800; color: #fff; background: #333;
  min-width: 18px; height: 18px; padding: 0 6px; border-radius: 9px;
  display: inline-flex; align-items: center; justify-content: center;
}
.msg-center-head.no-toggle { cursor: default; }
.msg-center-chevron {
  margin-left: auto; flex-shrink: 0;
  font-size: 12px; font-weight: 800; color: #888;
  background: #f0f2f5; padding: 4px 10px; border-radius: 10px;
}

/* 整份清單收合：grid 0fr→1fr，不需固定高度即可平滑動畫 */
.msg-collapse {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.3s ease;
}
.msg-center.open .msg-collapse { grid-template-rows: 1fr; }
.msg-collapse-inner { overflow: hidden; }

.msg-list {
  display: flex; flex-direction: column; gap: 10px;
  padding: 0 12px 14px;
}

/* 單則訊息卡 */
.msg-item {
  display: flex; gap: 12px;
  background: #f9fafb;
  border-radius: 14px;
  padding: 14px;
  border-left: 4px solid #1a1a1a;
}
.msg-item.is-warning { border-left-color: #d32f2f; background: #fff7f7; }
.msg-icon { font-size: 18px; flex-shrink: 0; }
.msg-content { flex: 1; min-width: 0; }
.msg-meta { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.msg-sender { font-size: 11px; font-weight: 850; color: #444; }
.is-warning .msg-sender { color: #d32f2f; }
.msg-time { font-size: 11px; color: #aaa; font-weight: 600; }
.msg-title { font-size: 15px; font-weight: 850; color: #1a1a1a; margin: 0 0 6px; }
.msg-desc {
  font-size: 13px; color: #555; line-height: 1.6; margin: 0;
  white-space: pre-wrap; /* 保留公告裡的換行 */
}

/* 以下為你原本的樣式，完全保留不變 */
.mailbox-page-root { position: absolute; inset: 0; background-color: #f6f8f5; display: flex; flex-direction: column; }
.mailbox-header { background: rgba(246, 248, 245, 0.9); backdrop-filter: blur(10px); padding-bottom: 12px; }
.header-top { display: flex; align-items: center; justify-content: space-between; padding: calc(env(safe-area-inset-top, 44px) + 10px) 20px 10px; }
.back-btn-circle { width: 32px; height: 32px; border-radius: 50%; background: #fff; border: 1px solid #eee; display: flex; align-items: center; justify-content: center; font-size: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
.header-title { font-size: 20px; font-weight: 850; color: #1a1a1a; }

.tab-switcher { margin: 0 20px; background: rgba(0,0,0,0.04); height: 44px; border-radius: 22px; display: flex; padding: 4px; position: relative; }
.tab-item { flex: 1; z-index: 2; display: flex; justify-content: center; align-items: center; font-size: 14px; font-weight: 750; color: #888; }
.tab-item.active { color: #fff; }
.tab-indicator { position: absolute; width: calc(50% - 4px); height: calc(100% - 8px); background: #333; border-radius: 20px; transition: 0.3s cubic-bezier(0.16, 1, 0.3, 1); }

.message-list-area { flex: 1; overflow-y: auto; padding: 16px 20px 120px; }
.order-cards-stack { display: flex; flex-direction: column; }
.order-card-modern { background: #fff; border-radius: 30px; padding: 20px; margin-bottom: 20px; box-shadow: 0 4px 25px rgba(0,0,0,0.03); display: flex; flex-direction: column; gap: 16px; }

.meta-right { display: flex; align-items: center; gap: 10px; }
.card-cancel-btn {
  width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0;
  background: #f5f5f5; border: none; color: #999;
  font-size: 11px; font-weight: 800; line-height: 1;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
}
.card-cancel-btn:active { background: #ececec; color: #666; }

.card-meta { display: flex; justify-content: space-between; align-items: center; }
.status-badge { padding: 5px 12px; border-radius: 10px; font-size: 11px; font-weight: 800; }
.status-badge.pending { background: #fff8e1; color: #f57c00; }
.status-badge.negotiating { background: #e3f2fd; color: #1976d2; }
.status-badge.accepted { background: #e8f5e9; color: #2e7d32; }
.time-stamp { font-size: 11px; color: #bbb; font-weight: 600; }

.prod-info-row { display: flex; gap: 14px; align-items: center; }
.prod-thumb { width: 54px; height: 54px; border-radius: 16px; background: #f0f0f0; display: flex; align-items: center; justify-content: center; font-size: 24px; }
.prod-thumb img { width: 100%; height: 100%; object-fit: cover; border-radius: 16px; }
.prod-name { font-size: 16px; font-weight: 850; color: #2c3e50; margin: 0; }
.prod-price { font-size: 18px; font-weight: 900; color: #333; }

.details-box { background: #f9fafb; border-radius: 20px; padding: 14px; display: flex; flex-direction: column; gap: 8px; }
.detail-line { display: flex; gap: 10px; font-size: 13px; font-weight: 600; color: #666; }
.negotiating-highlight .val { color: #1976d2; font-weight: 850; text-decoration: underline; }

.btn-group-column { display: flex; flex-direction: column; gap: 12px; }
.info-bubble { padding: 12px; border-radius: 16px; font-size: 13px; font-weight: 700; text-align: center; }
.info-bubble.buyer-offer, .info-bubble.seller-offer { background: #fff7e6; color: #f57c00; border: 1px solid #ffd591; }
.info-bubble.waiting { background: #f0f5ff; color: #2f54eb; border: 1px solid #adc6ff; }

.btn-group { display: flex; gap: 10px; }
.btn-primary { flex: 2; height: 44px; background: #333; color: #fff; border-radius: 14px; border: none; font-weight: 800; }
.btn-outline { flex: 1; height: 44px; background: #fff; border: 1.5px solid #333; color: #333; border-radius: 14px; font-weight: 800; }
.btn-secondary { flex: 1; height: 44px; background: #f5f5f5; color: #999; border-radius: 14px; border: none; font-weight: 800; }

.negotiate-panel { margin-top: 10px; padding: 16px; background: #fff; border: 1.5px solid #eee; border-radius: 24px; display: flex; flex-direction: column; gap: 12px; }
.panel-header { font-size: 12px; font-weight: 850; color: #aaa; text-transform: uppercase; }
.location-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.loc-chip { padding: 8px 14px; background: #f5f5f5; border-radius: 10px; border: none; font-size: 11px; font-weight: 700; color: #666; cursor: pointer; }
.loc-chip.active { background: #333; color: #fff; }
.time-input-modern { padding: 12px; border-radius: 12px; border: 1px solid #ddd; font-size: 14px; }
.panel-btns { display: flex; justify-content: space-between; align-items: center; }
.btn-text { background: none; border: none; color: #999; font-weight: 700; cursor: pointer; }
.btn-confirm { background: #1976d2; color: #fff; border: none; padding: 10px 20px; border-radius: 12px; font-weight: 800; cursor: pointer; }

.accepted-success-row { display: flex; justify-content: space-between; align-items: center; background: #e8f5e9; padding: 12px 16px; border-radius: 18px; }
.success-text { color: #2e7d32; font-weight: 850; font-size: 14px; }
.btn-deal-trigger { background: #2e7d32; color: #fff; border: none; padding: 8px 14px; border-radius: 10px; font-weight: 800; font-size: 12px; cursor: pointer; }

.price-summary { margin-top: 10px; font-size: 13px; font-weight: 800; color: #666; text-align: right; }
.price-val { font-size: 18px; color: #2e7d32; margin-left: 6px; }

.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding-top: 100px; color: #bbb; }
.empty-art { font-size: 60px; margin-bottom: 20px; opacity: 0.3; }

.slide-up-enter-active, .slide-up-leave-active { transition: all 0.3s ease; }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translateY(20px); }
</style>