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
              <span
                class="status-badge"
                :class="isExpired(order) ? 'expired' : order.status"
              >{{ isExpired(order) ? statusText('expired') : statusText(order.status) }}</span>
              <div class="meta-right">
                <span class="time-stamp">{{ formatTime(order.createdAt) }}</span>
                <button
                  v-if="canCancel(order)"
                  type="button"
                  class="card-cancel-btn"
                  title="取消請求"
                  :disabled="isOrderBusy(order.id)"
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
              <!-- 約定時間過了卻還沒談成：原本的婉拒／接受／改提案都沒有意義了，
                   整組換成逾期關閉，免得使用者對著一個過期的時段按「接受」 -->
              <div
                v-if="isExpired(order) && order.status !== 'accepted'"
                class="accepted-success-col"
              >
                <div class="accepted-success-row">
                  <div class="success-text">⏰ 這筆請求已逾期</div>
                </div>
                <button
                  class="btn-expire-close"
                  :disabled="isOrderBusy(order.id)"
                  @click="expireOrder(order)"
                >⏰ 逾期關閉</button>
                <p class="safe-trade-hint">
                  約定時間（{{ order.time }}）已過 30 分鐘，
                  {{ order.status === 'pending' ? '這筆請求一直沒有得到回應' : '協商到一半就沒有下文了' }}。
                  關閉不佔用你的取消額度；還想交易的話，回商品頁重新發起就好。
                </p>
              </div>

              <template v-if="activeTab === 'sell' && !isExpired(order)">
                <div v-if="order.status === 'pending'" class="btn-group">
                  <button class="btn-secondary" :disabled="isOrderBusy(order.id)" @click="rejectOrder(order)">婉拒</button>
                  <button class="btn-outline" :disabled="isOrderBusy(order.id)" @click="startNegotiate(order)">更改提案</button>
                  <button class="btn-primary" :disabled="isOrderBusy(order.id)" @click="acceptOrder(order)">接受</button>
                </div>

                <div v-if="order.status === 'negotiating' && order.lastActionBy === 'buyer'" class="btn-group-column">
                  <div class="info-bubble buyer-offer">買家提出了新提案，請確認</div>
                  <div class="btn-group">
                    <button class="btn-secondary" :disabled="isOrderBusy(order.id)" @click="rejectOrder(order)">婉拒</button>
                    <button class="btn-primary" :disabled="isOrderBusy(order.id)" @click="acceptOrder(order)">接受方案</button>
                  </div>
                </div>

                <div v-if="order.status === 'negotiating' && order.lastActionBy === 'seller'" class="btn-group-column">
                  <div class="info-bubble waiting">⏳ 已送出新方案，等待買家回覆</div>
                </div>
              </template>

              <template v-if="activeTab === 'buy' && !isExpired(order)">
                <div v-if="order.status === 'negotiating' && order.lastActionBy === 'seller'" class="btn-group-column">
                  <div class="info-bubble seller-offer">賣家提議了新時間地點</div>
                  <div class="btn-group">
                    <button class="btn-outline" :disabled="isOrderBusy(order.id)" @click="startNegotiate(order)">再改一次</button>
                    <button class="btn-primary" :disabled="isOrderBusy(order.id)" @click="acceptOrder(order)">接受方案</button>
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

              <div v-if="order.status === 'accepted'" class="accepted-success-col">
                <div class="accepted-success-row">
                  <div class="success-text">{{ isExpired(order) ? '⏰ 這筆預約已逾期' : '🎉 預約成功！' }}</div>
                  <button class="chat-trigger-btn" type="button" @click.stop="chatOrderId = order.id">💬 傳訊息</button>
                </div>

                <!-- 逾期：不再放人進場，只剩結案或用訊息協調新時間 -->
                <template v-if="isExpired(order)">
                  <button
                    class="btn-expire-close"
                    :disabled="isOrderBusy(order.id)"
                    @click="expireOrder(order)"
                  >⏰ 逾期關閉</button>
                  <p class="safe-trade-hint">
                    約定時間（{{ order.time }}）已過 30 分鐘，雙方都沒有開始安全交易。
                    關閉不佔用你的取消額度，爽約會記在沒出現的一方；
                    還想交易的話，可用💬傳訊息請對方同意推遲時間。
                  </p>
                </template>

                <template v-else>
                  <button
                    class="btn-deal-trigger"
                    :class="{ locked: !canStartSafeTrade(order) }"
                    :disabled="!canStartSafeTrade(order)"
                    @click="goToSafeTrade(order)"
                  >
                    {{ safeTradeBtnLabel(order) }}
                  </button>
                  <p v-if="!canStartSafeTrade(order)" class="safe-trade-hint">
                    🔒 約定時間前 10 分鐘（{{ safeTradeOpenText(order) }}）才會開放
                  </p>
                </template>
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
    <CannedChat v-if="chatOrder" :order="chatOrder" :role="activeTab" @close="chatOrderId = null" />
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import DealPage from './Deal.vue';
import CannedChat from './CannedChat.vue';
import { auth, db } from '@/firebase';
import { collection, query, where, onSnapshot, orderBy, updateDoc, getDoc, doc, serverTimestamp, increment } from 'firebase/firestore';
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

// 🌟 防連點：網路慢的時候使用者會連按好幾下，同一筆訂單被重複送出。
// 影響最大的是取消——cancelCount 用 increment(1) 累加，連按兩下會一次扣掉兩次額度。
// 記在獨立的 Set 而不是掛在 order 物件上，因為 toOrder() 每次 onSnapshot 都會重建
// 物件，掛在上面的旗標會在寫入完成前就被洗掉。
const busyOrderIds = ref(new Set());
const isOrderBusy = (id) => busyOrderIds.value.has(id);

// 同一筆訂單同時間只跑一個寫入動作；重複點擊在寫入完成前會被直接忽略
const runOrderAction = async (orderId, action) => {
  if (busyOrderIds.value.has(orderId)) return;
  busyOrderIds.value = new Set(busyOrderIds.value).add(orderId);
  try {
    await action();
  } finally {
    const next = new Set(busyOrderIds.value);
    next.delete(orderId);
    busyOrderIds.value = next;
  }
};

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

const acceptOrder = (order) => runOrderAction(order.id, async () => {
  console.log('%c[Mailbox]', 'color:#1976d2;font-weight:bold;', '👉 接受訂單 →', { orderId: order.id, 目前status: order.status });
  try {
    await updateDoc(doc(db, "orders", order.id), { status: 'accepted', updatedAt: serverTimestamp() });
    console.log('%c[Mailbox]', 'color:#1976d2;font-weight:bold;', '✅ 訂單已設為 accepted');
    alert("✅ 預約成立！");
  } catch (e) { console.warn('[Mailbox] 🔥 接受訂單失敗：', e.code, e.message); alert("操作失敗"); }
});

const rejectOrder = (order) => runOrderAction(order.id, async () => {
  if (confirm("確定取消預約？")) {
    await updateDoc(doc(db, "orders", order.id), { status: 'rejected', updatedAt: serverTimestamp() });
  }
});

// 取消交易：沿用 rejectOrder 同一套 'rejected' 狀態 —— statusText 已把它顯示為
// 「已取消」，買家取消、賣家婉拒本來就是同一種結果，沒必要另開一個狀態值。
//
// 顯示條件：
//   買家 → pending / negotiating / accepted 都可取消
//   賣家 → 只在 accepted 顯示；pending / negotiating 時賣家已有專用的「婉拒」按鈕，
//          再放一顆 ✕ 會是同功能的重複入口。
// accepted 涵蓋「交易時間前的等待期」與「交易時間中的面交流程」，兩個時段都能取消。
const canCancel = (order) => {
  // 逾期的訂單改走「逾期關閉」（另一組額度），這裡就不再出現取消。
  // 否則同一張卡片會有兩顆結果一樣、扣的額度卻不同的按鈕。
  if (isExpired(order)) return false;
  if (order.status === 'accepted') return true;
  return activeTab.value === 'buy' && (order.status === 'pending' || order.status === 'negotiating');
};

// 取消次數限制：30 天最多 3 次，記在 users/{uid}.cancelCount。
// 額度是「買 + 賣」共用同一份：不論這次是以買家還是賣家身分取消，都扣同一個
// 計數器（因為計數器掛在使用者身上，不分角色），跨期自動歸零。
// 這裡只做前端判斷與寫入，沒有安全規則強制，使用者理論上能繞過
//（見 docs/wiki/新交易流程規格.md 的風險 1）。
const CANCEL_LIMIT = 3;
const CANCEL_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

const cancelOrder = (order) => runOrderAction(order.id, async () => {
  const user = auth.currentUser;
  if (!user) return;
  const asBuyer = activeTab.value === 'buy';

  let remaining = CANCEL_LIMIT;
  let periodExpired = true;
  try {
    const userSnap = await getDoc(doc(db, 'users', user.uid));
    const data = userSnap.exists() ? userSnap.data() : {};
    const periodStartMs = data.cancelPeriodStart?.toMillis?.() ?? null;
    periodExpired = !periodStartMs || (Date.now() - periodStartMs) > CANCEL_PERIOD_MS;
    remaining = CANCEL_LIMIT - (periodExpired ? 0 : (data.cancelCount || 0));
  } catch (e) {
    console.error('[Mailbox] 讀取取消額度失敗，暫以尚有額度處理：', e.code, e.message);
  }

  if (remaining <= 0) {
    alert(`取消次數已達上限（30 天內 ${CANCEL_LIMIT} 次，買家與賣家身分共用額度），暫時無法取消，請直接與對方協調或聯繫平台管理員。`);
    return;
  }

  // 說明清楚後續、以及這次取消會扣掉的額度，減少猶豫也讓限制有感
  const afterNote = asBuyer
    ? '取消後這筆交易會關閉，但您隨時可以回到商品頁重新發起。'
    : '取消後這筆交易會關閉，商品仍保留在您的賣場。';
  if (!confirm(
    `確定要取消「${order.productName}」的交易嗎？\n\n${afterNote}\n\n` +
    `取消後剩餘額度：${remaining - 1} / ${CANCEL_LIMIT} 次（30 天內，買賣共用）。`
  )) return;

  try {
    await updateDoc(doc(db, "orders", order.id), {
      status: 'rejected',
      lastActionBy: asBuyer ? 'buyer' : 'seller',
      updatedAt: serverTimestamp()
    });
    // 跨期要歸零重算，不能用 increment（沒有基準值可加）；未跨期才用原子遞增
    if (periodExpired) {
      await updateDoc(doc(db, 'users', user.uid), {
        cancelCount: 1,
        cancelPeriodStart: serverTimestamp()
      });
    } else {
      await updateDoc(doc(db, 'users', user.uid), { cancelCount: increment(1) });
    }
  } catch (e) {
    console.error('[Mailbox] 取消請求失敗：', e.code, e.message);
    alert("取消失敗，請重試。");
  }
});

const statusText = (s) => ({ pending: '等待中', negotiating: '協商中', accepted: '預約成立', rejected: '已取消', failed: '交易失敗', expired: '⏰ 已逾期', completed: '✅ 已完成' }[s] || s);
const formatTime = (ts) => { if (!ts) return ''; const d = ts.toDate(); return `${d.getMonth()+1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`; };
const selectedDeal = ref(null);

// 聊天室要即時看到 buyerDelayUsed / sellerDelayUsed 與最新的 time（對方同意
// 推遲後畫面要跟著變），所以不能存訂單物件的快照——toOrder() 每次 onSnapshot
// 都會重建物件，存下來的參照會永遠停在打開聊天室的那一刻。改存 id，用
// computed 每次從最新清單裡取。買賣兩份清單都找，同一支帳號自導自演的
// 合成訂單也能正確命中。
const chatOrderId = ref(null);
const chatOrder = computed(() =>
  chatOrderId.value
    ? [...buyOrders.value, ...sellOrders.value].find((o) => o.id === chatOrderId.value) || null
    : null
);

// ── 安全交易時間閘門：約定時間前 10 分鐘才開放 ──
// order.time 是不含時區的 "YYYY-MM-DD HH:mm" 字串，用裝置本地時區解析（沿用
// startNegotiate 既有的 replace(' ','T') 慣例，跟這支檔案其他地方一致）。
const SAFE_TRADE_WINDOW_MS = 10 * 60 * 1000;

// 用 ref + 計時器讓「還剩幾分鐘開放」是響應式的，不會像純 Date.now() 的
// computed 那樣時間到了畫面也不會自己更新（同一類 bug 本次已在 Deal.vue 修過三次）。
const nowTick = ref(Date.now());
let nowTimer = null;

const appointmentMillis = (order) => {
  if (!order.time) return null;
  const d = new Date(order.time.replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d.getTime();
};

const canStartSafeTrade = (order) => {
  const t = appointmentMillis(order);
  if (t == null) return false;
  // 原本只有下界（提前 10 分鐘開放），約定時間過了三天按鈕照樣是開的。
  // 現在加上界：逾期之後就不再放人進場，改走逾期關閉或推遲協調。
  if (isExpired(order)) return false;
  return nowTick.value >= t - SAFE_TRADE_WINDOW_MS;
};

// ── 逾期關閉 ──
// 約定時間過後 30 分鐘，雙方仍沒有「都按下安全交易」，這筆預約就算破局。
// 只決定「何時算逾期」。「誰要被記一次」「記幾次就擋」都在伺服器端
// （functions 的 onOrderExpired 與 firestore.rules 的 notExpireBanned）。
const EXPIRE_GRACE_MS = 30 * 60 * 1000;

// 「雙方都按過安全交易」＝面交已經開始。之後掃碼、議價、互評都可能拖過
// 30 分鐘，不能因為時間到就把進行中的交易判成逾期。
// 只有一方按下不算開始——那正是「對方放鳥」的情境，準時到場的人要能用
// 逾期關閉結案，而不是被迫去扣自己的取消額度。
const dealStarted = (order) => !!order.buyerReady && !!order.sellerReady;

// 逾期的共同判準是「約定的那個時段過完了，這筆交易卻還沒走到該走的地方」，
// 只是「該走到哪」隨狀態不同：
//   accepted            雙方談成了卻沒都到場（都到場就是面交已開始，不算逾期）
//   pending/negotiating 根本沒談成——賣家沒回、或協商到一半沒人接話
const isExpired = (order) => {
  const t = appointmentMillis(order);
  if (t == null || nowTick.value < t + EXPIRE_GRACE_MS) return false;
  if (order.status === 'accepted') return !dealStarted(order);
  return order.status === 'pending' || order.status === 'negotiating';
};

// 逾期關閉不再扣按下的人——放鳥的是對方，卻要準時到場的人吐一次額度並不合理。
// 改由 Cloud Function onOrderExpired 監聽 status 轉成 expired，把紀錄記在該回應
// 卻沒回應的那一方身上（前端寫不了別人的 users 文件，只能放伺服器端）。
// 這裡因此只寫訂單，不碰任何額度。
const expireOrder = (order) => runOrderAction(order.id, async () => {
  let reason;
  let blame;
  if (order.status === 'accepted') {
    const iShowedUp = activeTab.value === 'buy' ? !!order.buyerReady : !!order.sellerReady;
    reason = '雙方都沒有開始安全交易';
    blame = '沒出現的一方會被記一次爽約。' + (iShowedUp
      ? '你已按過安全交易，這次不會記在你身上。'
      : '雙方都沒有按下安全交易，兩邊都會各記一次。');
  } else {
    reason = order.status === 'pending' ? '賣家一直沒有回應' : '協商到一半沒有人回應';
    blame = '沒回應的一方會被記一次未回應紀錄（與爽約分開計算）。' +
      '訂單成立不滿 12 小時的話不會記給任何人。';
  }

  if (!confirm(
    `「${order.productName}」的約定時間已過 30 分鐘，${reason}。

` +
    `確定要以逾期結案嗎？結案後這筆交易會關閉，商品仍保留在賣場。

` +
    `${blame}（30 天內滿 3 次就無法再發起新交易。）`
  )) return;

  try {
    await updateDoc(doc(db, 'orders', order.id), {
      status: 'expired',
      lastActionBy: activeTab.value === 'buy' ? 'buyer' : 'seller',
      updatedAt: serverTimestamp()
    });
  } catch (e) {
    console.error('[Mailbox] 逾期關閉失敗：', e.code, e.message);
    alert('關閉失敗，請重試。');
  }
});

const safeTradeOpenText = (order) => {
  const t = appointmentMillis(order);
  if (t == null) return '';
  const open = new Date(t - SAFE_TRADE_WINDOW_MS);
  return `${open.getMonth() + 1}/${open.getDate()} ${open.getHours().toString().padStart(2, '0')}:${open.getMinutes().toString().padStart(2, '0')}`;
};

const myReadyField = () => (activeTab.value === 'buy' ? 'buyerReady' : 'sellerReady');
const iAmSafeReady = (order) => !!order[myReadyField()];
const safeTradeBtnLabel = (order) => {
  if (iAmSafeReady(order)) return '🔒 查看安全交易進度';
  if (canStartSafeTrade(order)) return '🔒 安全交易';
  return '⏳ 尚未到開放時間';
};

const goToSafeTrade = async (order) => {
  if (!canStartSafeTrade(order)) return;
  if (!iAmSafeReady(order)) {
    try {
      await updateDoc(doc(db, 'orders', order.id), { [myReadyField()]: true, updatedAt: serverTimestamp() });
    } catch (e) {
      console.error('[Mailbox] 按下安全交易失敗：', e.code, e.message);
      alert('操作失敗，請重試。');
      return;
    }
  }
  selectedDeal.value = order;
};

onMounted(() => {
  onAuthStateChanged(auth, (user) => { if (user) initMailboxSync(); });
  nowTimer = setInterval(() => { nowTick.value = Date.now(); }, 15000);
});
onUnmounted(() => {
  unsubscribeBuy?.();
  unsubscribeSell?.();
  unsubscribeSystem?.(); // 清除廣播監聽
  clearInterval(nowTimer);
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
.status-badge.expired { background: #fbe9e7; color: #c1440e; }
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
/* 送出中：讓被擋掉的重複點擊有視覺回饋，不然按鈕看起來跟可按時一模一樣 */
.btn-primary:disabled, .btn-outline:disabled, .btn-secondary:disabled, .card-cancel-btn:disabled {
  opacity: 0.5; cursor: not-allowed;
}

.negotiate-panel { margin-top: 10px; padding: 16px; background: #fff; border: 1.5px solid #eee; border-radius: 24px; display: flex; flex-direction: column; gap: 12px; }
.panel-header { font-size: 12px; font-weight: 850; color: #aaa; text-transform: uppercase; }
.location-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.loc-chip { padding: 8px 14px; background: #f5f5f5; border-radius: 10px; border: none; font-size: 11px; font-weight: 700; color: #666; cursor: pointer; }
.loc-chip.active { background: #333; color: #fff; }
.time-input-modern { padding: 12px; border-radius: 12px; border: 1px solid #ddd; font-size: 14px; }
.panel-btns { display: flex; justify-content: space-between; align-items: center; }
.btn-text { background: none; border: none; color: #999; font-weight: 700; cursor: pointer; }
.btn-confirm { background: #1976d2; color: #fff; border: none; padding: 10px 20px; border-radius: 12px; font-weight: 800; cursor: pointer; }

.accepted-success-col { display: flex; flex-direction: column; gap: 10px; }
.accepted-success-row { display: flex; justify-content: space-between; align-items: center; background: #e8f5e9; padding: 12px 16px; border-radius: 18px; }
.accepted-success-col:has(.btn-expire-close) .accepted-success-row { background: #fbe9e7; }
.accepted-success-col:has(.btn-expire-close) .success-text { color: #c1440e; }
.accepted-success-col:has(.btn-expire-close) .chat-trigger-btn { color: #c1440e; border-color: #ffccbc; }
.success-text { color: #2e7d32; font-weight: 850; font-size: 14px; }
.chat-trigger-btn { background: #fff; color: #2e7d32; border: 1.5px solid #a5d6a7; padding: 7px 12px; border-radius: 10px; font-weight: 800; font-size: 12px; cursor: pointer; }

.btn-deal-trigger { width: 100%; height: 46px; background: #2e7d32; color: #fff; border: none; border-radius: 14px; font-weight: 850; font-size: 14px; cursor: pointer; }
.btn-deal-trigger.locked { background: #e0e0e0; color: #999; cursor: not-allowed; }
.btn-expire-close { width: 100%; height: 46px; background: #fff; color: #c1440e; border: 1.5px solid #ffccbc; border-radius: 14px; font-weight: 850; font-size: 14px; cursor: pointer; }
.btn-expire-close:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-expire-close:not(:disabled):active { background: #fff3ef; }
.safe-trade-hint { margin: -4px 0 0; font-size: 11px; color: #999; font-weight: 700; text-align: center; }

.price-summary { margin-top: 10px; font-size: 13px; font-weight: 800; color: #666; text-align: right; }
.price-val { font-size: 18px; color: #2e7d32; margin-left: 6px; }

.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding-top: 100px; color: #bbb; }
.empty-art { font-size: 60px; margin-bottom: 20px; opacity: 0.3; }

.slide-up-enter-active, .slide-up-leave-active { transition: all 0.3s ease; }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translateY(20px); }
</style>