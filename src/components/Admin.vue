<template>
  <div class="admin-page-root" @touchmove.stop>
    <header class="admin-header">
      <div class="header-top">
        <button class="back-btn-pill" @click="$emit('back')">
          <span class="arrow">←</span> 返回會員頁
        </button>
        <h1 class="header-title">🛡️ 管理控制台</h1>
        <div class="placeholder"></div>
      </div>

      <div class="tab-switcher-container">
        <div class="tab-switcher">
          <div class="tab-item" :class="{ active: currentTab === 'patrol' }" @click="switchTab('patrol')">商品巡邏</div>
          <div class="tab-item" :class="{ active: currentTab === 'users' }" @click="switchTab('users')">用戶管理</div>
          <div class="tab-item" :class="{ active: currentTab === 'audit' }" @click="switchTab('audit')">安全與交易日誌</div>
          <div class="tab-item" :class="{ active: currentTab === 'broadcast' }" @click="switchTab('broadcast')">系統公告</div>
          <div class="tab-item" :class="{ active: currentTab === 'ads' }" @click="switchTab('ads')">廣告管理</div>
          <div class="tab-item" :class="{ active: currentTab === 'indicate' }" @click="switchTab('indicate')">📊 指標</div>
        </div>
      </div>
    </header>

    <div class="admin-content-area">
      
      <!-- 1. 商品巡邏 -->
      <template v-if="currentTab === 'patrol'">
        <!-- 🌟 上架中／已售出統計，一眼看出全站商品狀態，不用自己數列表 -->
        <div v-if="!loadingProducts && allProducts.length > 0" class="patrol-stats-row">
          <div class="patrol-stat-box">
            <span class="patrol-stat-num">{{ activeProductCount }}</span>
            <span class="patrol-stat-label">✅ 上架中</span>
          </div>
          <div class="patrol-stat-box">
            <span class="patrol-stat-num">{{ soldProductCount }}</span>
            <span class="patrol-stat-label">💰 已售出</span>
          </div>
        </div>

        <div v-if="loadingProducts" class="state-hint">
          <div class="loader-dots"><span>.</span><span>.</span><span>.</span></div>
          <p>載入全站商品資料中...</p>
        </div>

        <div v-else-if="allProducts.length > 0" class="admin-product-list">
          <!-- 🌟 已售出的商品排到最後面，優先讓管理員看到還在上架、比較需要巡邏的商品 -->
          <div v-for="item in sortedPatrolProducts" :key="item.id" class="admin-item-card">
            <div class="item-img-box">
              <img v-if="item.url" :src="item.url" class="item-img" />
              <div v-else class="item-placeholder">📦</div>
            </div>
            
            <div class="item-details">
              <h3 class="item-name">{{ item.name }}</h3>
              <div class="item-meta">
                <span class="meta-tag price">${{ item.price }}</span>
                <span class="meta-tag category">{{ item.category || '未分類' }}</span>
                <!-- 🌟 巡邏列表原本不分上架中/已售出，肉眼看不出來，補一個徽章 -->
                <span class="status-badge" :class="item.status === 'sold' ? 'sold' : 'active'">
                  {{ item.status === 'sold' ? '💰 已售出' : '✅ 上架中' }}
                </span>
              </div>
              <div class="seller-info">
                <span>賣家 UID: </span>
                <span class="uid-text">{{ item.sellerId?.substring(0, 8) || '未知' }}</span>
              </div>
            </div>

            <div class="item-actions">
              <button class="btn-force-delete" @click="openDeleteModal(item)">
                強制下架
              </button>
            </div>
          </div>
        </div>

        <div v-else class="state-hint empty">
          <div class="empty-icon">✨</div>
          <p>目前全站沒有任何商品</p>
        </div>
      </template>

      <!-- 2. 用戶管理 -->
      <template v-if="currentTab === 'users'">
        <div class="admin-claim-box">
          <div class="claim-text">
            <strong>🔑 管理員權限</strong>
            <span>{{ claimStatus }}</span>
          </div>
          <button class="btn-claim" :disabled="claimLoading" @click="confirmMyAdmin">
            {{ claimLoading ? '處理中...' : '確認我的管理員權限' }}
          </button>
        </div>

        <!-- 🌟 補齊缺失用戶資料：只有創辦人看得到（此操作會大量寫入 users） -->
        <div v-if="isFounder" class="admin-claim-box backfill-box">
          <div class="claim-text">
            <strong>🩹 補齊缺失用戶資料</strong>
            <span>{{ backfillStatus }}</span>
          </div>
          <button class="btn-claim" :disabled="backfillLoading" @click="runBackfill">
            {{ backfillLoading ? '處理中...' : '檢查並補齊' }}
          </button>
        </div>

        <!-- 🧪 交易時段限制開關：測試逾期／推遲時常需要在晚上造資料 -->
        <div v-if="isFounder" class="admin-claim-box settings-box" :class="{ 'is-off': !enforceSafeHours }">
          <div class="claim-text">
            <strong>🕒 交易時段限制（06:00 - 18:00）</strong>
            <span>{{ enforceSafeHours ? '✅ 生效中：非時段內無法發起交易' : '🧪 已關閉：任何時間都能發起交易' }}</span>
          </div>
          <button
            class="btn-claim"
            :class="{ 'btn-danger-toggle': enforceSafeHours }"
            :disabled="hoursToggleLoading"
            @click="toggleSafeHours"
          >
            {{ hoursToggleLoading ? '處理中...' : (enforceSafeHours ? '暫時關閉' : '重新開啟') }}
          </button>
        </div>

        <div v-if="loadingUsers" class="state-hint">
          <div class="loader-dots"><span>.</span><span>.</span><span>.</span></div>
          <p>載入使用者名單中...</p>
        </div>

        <div v-else-if="allUsers.length > 0" class="admin-user-list">
          <div v-for="u in allUsers" :key="u.id" class="admin-item-card user-card" :class="{ 'is-banned': u.status === 'banned' }">
            <div class="item-img-box avatar-box">
              <img :src="u.photoURL || 'https://via.placeholder.com/150'" class="item-img" />
            </div>
            
            <div class="item-details">
              <h3 class="item-name">{{ u.displayName || '未設定名稱' }}<span v-if="u.isFounder || (u.id === myUid && isFounder)" class="founder-chip">👑 創辦人</span><span v-else-if="u.isAdmin" class="admin-chip">管理員</span></h3>
              <div class="seller-info">
                <span>UID: </span><span class="uid-text">{{ u.id.substring(0, 8) }}</span>
              </div>
              <div class="status-badge" :class="u.status === 'banned' ? 'banned' : 'active'">
                {{ u.status === 'banned' ? '🛑 已停權 (黑名單)' : '✅ 正常啟用' }}
              </div>
            </div>

            <div class="item-actions-col">
              <button class="btn-outline-small" @click="openUserModal(u)">查閱紀錄</button>
              <button v-if="u.id !== myUid && isFounder && !u.isFounder" class="btn-admin-toggle" :class="{ active: u.isAdmin }" @click="toggleAdmin(u)">
                {{ u.isAdmin ? '取消管理員' : '設為管理員' }}
              </button>
              <button v-if="!u.isFounder" class="btn-force-delete" @click="toggleBlacklist(u)">
                {{ u.status === 'banned' ? '解除限制' : '拉黑停權' }}
              </button>
              <button v-if="!u.isFounder" class="btn-force-purge" @click="purgeUserData(u)">
                清除商品
              </button>
            </div>
          </div>
        </div>

        <div v-else class="state-hint empty">
          <div class="empty-icon">👥</div>
          <p>目前資料庫中沒有使用者紀錄</p>
        </div>
      </template>

      <!-- 3. 安全與交易日誌 -->
      <template v-if="currentTab === 'audit'">
        <div class="audit-panel-header">
          <div class="panel-desc-group">
            <h3>🛡️ 資安威脅預警與交易追蹤面板</h3>
            <p>實時流式（Streaming）呈現系統日誌，自動捕捉並高亮標示資安風險事件。</p>
          </div>
          <div class="audit-filter-bar">
            <button v-for="f in ['all', 'security', 'trade', 'admin']" :key="f" 
                    class="filter-chip" :class="{ active: auditFilter === f }" @click="auditFilter = f">
              {{ f === 'all' ? '全部日誌' : f === 'security' ? '🚨 資安威脅' : f === 'trade' ? '🤝 交易追蹤' : '⚙️ 管理操作' }}
            </button>
          </div>
        </div>

        <div v-if="loadingLogs" class="state-hint">
          <div class="loader-dots"><span>.</span><span>.</span><span>.</span></div>
          <p>即時串流安全日誌中...</p>
        </div>

        <div v-else-if="filteredLogs.length > 0" class="audit-stream-timeline">
          <div v-for="log in filteredLogs" :key="log.id" class="audit-log-card" 
               :class="{ 'is-risk': log.level === 'high_risk' || log.category === 'security' }">
            <div class="log-side-indicator"></div>
            <div class="log-main-body">
              <div class="log-top-meta">
                <span class="log-badge" :class="log.category">
                  {{ log.category === 'security' ? '🚨 資安威脅' : log.category === 'trade' ? '🤝 交易追蹤' : '⚙️ 審查操作' }}
                </span>
                <span class="log-timestamp">{{ formatFullTime(log.createdAt) }}</span>
              </div>
              <h4 class="log-title-text">{{ log.title }}</h4>
              <p class="log-content-p">{{ log.content }}</p>
              
              <div class="trace-routing-box" v-if="log.operatorId || log.sellerId || log.buyerId">
                <div class="trace-node" v-if="log.operatorId">
                  <span class="node-label">操作管理員:</span>
                  <code class="node-code admin">{{ log.operatorId.substring(0, 8) }}</code>
                </div>
                <div class="trace-chain" v-if="log.buyerId && log.sellerId">
                  <span class="node-label">交易溯源鏈:</span>
                  <code class="node-code buyer">買家:{{ log.buyerId.substring(0, 5) }}</code>
                  <span class="chain-arrow">➔</span>
                  <code class="node-code seller">賣家:{{ log.sellerId.substring(0, 5) }}</code>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="state-hint empty">
          <div class="empty-icon">📝</div>
          <p>暫無符合篩選條件的追蹤日誌</p>
        </div>
      </template>

      <!-- 4. 系統公告 -->
      <template v-if="currentTab === 'broadcast'">
        <div class="broadcast-container">
          <div class="broadcast-header-info">
            <h3>📢 發布全校通知</h3>
            <p>此訊息將會發送至所有 YaBuy 使用者的信箱中。</p>
          </div>

          <form @submit.prevent="sendBroadcast" class="broadcast-form">
            <div class="form-group">
              <label>公告層級</label>
              <div class="type-selector">
                <label class="type-radio" :class="{ active: broadcastForm.type === 'info' }">
                  <input type="radio" v-model="broadcastForm.type" value="info" />
                  <span>💡 一般資訊</span>
                </label>
                <label class="type-radio urgent" :class="{ active: broadcastForm.type === 'warning' }">
                  <input type="radio" v-model="broadcastForm.type" value="warning" />
                  <span>🚨 緊急/警告</span>
                </label>
              </div>
            </div>

            <div class="form-group">
              <label>主旨標題</label>
              <input v-model="broadcastForm.title" type="text" placeholder="例如：系統維護通知..." required class="admin-input" />
            </div>

            <div class="form-group">
              <label>詳細內容</label>
              <textarea v-model="broadcastForm.content" placeholder="請輸入廣播內容..." rows="3" required class="admin-textarea"></textarea>
            </div>

            <button type="submit" class="btn-submit-broadcast" :disabled="isSending">
              {{ isSending ? '發送中...' : '🚀 立即發送全校廣播' }}
            </button>
          </form>
        </div>

        <div class="history-broadcast-container">
          <div class="history-header">
            <h3>📋 歷史公告管理</h3>
            <span class="badge-count">{{ allBroadcasts.length }} 則</span>
          </div>

          <div v-if="loadingBroadcasts" class="state-hint-small">載入中...</div>
          
          <div v-else-if="allBroadcasts.length > 0" class="history-list">
            <div v-for="msg in allBroadcasts" :key="msg.id" class="history-card" :class="{ 'is-warning': msg.type === 'warning' }">
              <div class="h-icon">{{ msg.type === 'warning' ? '🚨' : '📢' }}</div>
              <div class="h-content">
                <div class="h-top-row">
                  <h4 class="h-title">{{ msg.title }}</h4>
                  <span class="h-time">{{ formatTime(msg.createdAt) }}</span>
                </div>
                <p class="h-desc">{{ msg.content }}</p>
              </div>
              <button class="btn-delete-broadcast" @click="deleteBroadcast(msg.id, msg.title)" title="刪除此公告">
                回收
              </button>
            </div>
          </div>
          
          <div v-else class="state-hint-small empty">目前沒有任何發布中的公告。</div>
        </div>
      </template>

      <!-- 5. 廣告管理 -->
      <template v-if="currentTab === 'ads'">
        <div class="broadcast-container">
          <div class="broadcast-header-info">
            <h3>📢 {{ editingAdId ? '編輯廣告' : '新增廣告' }}</h3>
            <p>廣告會依上下架期限，自動穿插在首頁的商品卡片堆疊中（每 10 件商品出現 1 次；若同時有多則廣告上架，出現順序會自動洗牌輪替）。</p>
          </div>

          <form @submit.prevent="saveAd" class="broadcast-form">
            <div class="form-group">
              <label>輪播圖片（最多 3 張，至少上傳 1 張）</label>
              <div class="ad-image-slots">
                <div v-for="(slot, i) in adImageSlots" :key="i" class="ad-image-slot" @click="triggerAdFile(i)">
                  <img v-if="slot.preview || slot.existingUrl" :src="slot.preview || slot.existingUrl" class="ad-slot-preview" />
                  <div v-else class="ad-slot-empty">＋</div>
                  <input type="file" accept="image/*" :ref="el => (adFileInputs[i] = el)" class="ad-file-input" @change="onAdImageChange(i, $event)" />
                </div>
              </div>
            </div>

            <div class="form-group">
              <label>宣傳名稱</label>
              <input v-model="adForm.title" type="text" placeholder="例如：校園書局開學優惠..." required class="admin-input" />
            </div>

            <div class="form-group">
              <label>宣傳細項</label>
              <textarea v-model="adForm.description" placeholder="請輸入廣告詳細內容..." rows="3" class="admin-textarea"></textarea>
            </div>

            <div class="form-group">
              <label>連結傳送按鈕網址</label>
              <input v-model="adForm.linkUrl" type="url" placeholder="https://..." class="admin-input" />
            </div>

            <div class="form-group">
              <label>上架期限</label>
              <div class="date-range-row">
                <input v-model="adForm.startDate" type="date" required class="admin-input" />
                <span class="date-range-sep">～</span>
                <input v-model="adForm.endDate" type="date" required class="admin-input" />
              </div>
            </div>

            <div class="ad-form-actions">
              <button v-if="editingAdId" type="button" class="btn-cancel-edit" @click="resetAdForm">取消編輯</button>
              <button type="submit" class="btn-submit-broadcast" :disabled="isSavingAd">
                {{ isSavingAd ? '處理中...' : (editingAdId ? '💾 儲存變更' : '🚀 建立廣告') }}
              </button>
            </div>
          </form>
        </div>

        <div class="history-broadcast-container">
          <div class="history-header">
            <h3>📋 廣告清單</h3>
            <span class="badge-count">{{ allAds.length }} 則</span>
          </div>

          <div v-if="loadingAds" class="state-hint-small">載入中...</div>

          <div v-else-if="allAds.length > 0" class="admin-product-list">
            <div v-for="ad in allAds" :key="ad.id" class="admin-item-card">
              <div class="item-img-box">
                <img v-if="ad.images && ad.images[0]" :src="ad.images[0]" class="item-img" />
                <div v-else class="item-placeholder">📢</div>
              </div>

              <div class="item-details">
                <h3 class="item-name">{{ ad.title }}</h3>
                <div class="item-meta">
                  <span class="meta-tag" :class="'ad-status-' + getAdStatus(ad).cls">{{ getAdStatus(ad).label }}</span>
                </div>
                <div class="seller-info">
                  <span>{{ formatDateShort(ad.startDate) }} ～ {{ formatDateShort(ad.endDate) }}</span>
                </div>
              </div>

              <div class="item-actions-col">
                <button class="btn-outline-small" @click="editAd(ad)">編輯</button>
                <button class="btn-force-delete" @click="deleteAd(ad)">刪除</button>
              </div>
            </div>
          </div>

          <div v-else class="state-hint-small empty">目前沒有任何廣告。</div>
        </div>
      </template>

      <!-- 6. 營運指標 -->
      <template v-if="currentTab === 'indicate'">
        <Indicate />
      </template>

    </div>

    <!-- 彈窗群組 -->
    <Transition name="fade">
      <div v-if="showUserModal" class="admin-modal-overlay" @click.self="showUserModal = false">
        <div class="admin-modal large-modal">
          <div class="modal-header">
            <h3>👤 用戶紀錄：{{ targetUser?.displayName }}</h3>
            <button class="close-btn" @click="showUserModal = false">✕</button>
          </div>
          <div class="modal-body scrollable-body">
            <div v-if="loadingUserDetails" class="state-hint-small">正在調閱資料庫...</div>
            <template v-else>
              <div class="detail-section">
                <div class="section-title-row">
                  <h4>📦 他的上架商品</h4>
                  <span class="badge-count">{{ targetUserProducts.length }}</span>
                </div>
                <div class="mini-record-list">
                  <div v-for="p in targetUserProducts" :key="p.id" class="record-item">
                    <span class="r-name">{{ p.name }}</span>
                    <span class="r-price">${{ p.price }}</span>
                  </div>
                  <div v-if="targetUserProducts.length === 0" class="empty-record">目前沒有上架任何商品</div>
                </div>
              </div>
              <div class="detail-section">
                <div class="section-title-row">
                  <h4>💰 他的銷售紀錄</h4>
                  <span class="badge-count">{{ targetUserOrders.length }}</span>
                </div>
                <div class="mini-record-list">
                  <div v-for="o in targetUserOrders" :key="o.id" class="record-item sold-item">
                    <div class="r-info-col">
                      <span class="r-name">{{ o.productName || '未命名商品' }}</span>
                      <span class="r-buyer">買家: {{ o.buyerName || '未知' }}</span>
                    </div>
                    <span class="r-price">${{ o.price }}</span>
                  </div>
                  <div v-if="targetUserOrders.length === 0" class="empty-record">目前尚未賣出任何商品</div>
                </div>
              </div>

              <div class="detail-section">
                <div class="section-title-row">
                  <h4>⭐ 收到的評價</h4>
                  <span class="badge-count">{{ targetUserReviews.length }}</span>
                </div>
                <p class="review-note">以下文字僅管理端可見，不會公開給任何用戶。</p>
                <div class="mini-record-list">
                  <div v-for="r in targetUserReviews" :key="r.id" class="review-item">
                    <div class="review-top">
                      <span class="review-stars">{{ '★'.repeat(r.stars) }}<span class="review-stars-empty">{{ '★'.repeat(5 - r.stars) }}</span></span>
                      <span class="review-role">{{ r.ratedRole === 'seller' ? '作為賣家' : '作為買家' }}</span>
                    </div>
                    <p class="review-comment" v-if="r.comment">{{ r.comment }}</p>
                    <p class="review-comment empty" v-else>（未留文字）</p>
                  </div>
                  <div v-if="targetUserReviews.length === 0" class="empty-record">尚未收到任何評價</div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="fade">
      <div v-if="showDeleteModal" class="admin-modal-overlay" @click.self="showDeleteModal = false">
        <div class="admin-modal">
          <div class="modal-header">
            <h3>🚨 強制下架商品</h3>
            <button class="close-btn" @click="showDeleteModal = false">✕</button>
          </div>
          <div class="modal-body">
            <div class="target-info">
              <span class="badge">下架目標</span>
              <strong>{{ productToDelete?.name }}</strong>
            </div>
            <div class="form-group">
              <label>請輸入下架理由 (將私訊傳送給賣家)</label>
              <textarea v-model="deleteReason" placeholder="例如：含有違規內容、圖片不符、重複上架..." rows="4" class="admin-textarea" autofocus></textarea>
            </div>
          </div>
          <div class="modal-actions">
            <button class="btn-cancel" @click="showDeleteModal = false" :disabled="isDeleting">取消</button>
            <button class="btn-danger" @click="confirmDelete" :disabled="isDeleting || !deleteReason.trim()">
              {{ isDeleting ? '處理中...' : '確認下架並發送通知' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, computed } from 'vue';
import { db, auth, functions, storage } from '@/firebase';
import { httpsCallable } from 'firebase/functions';
import { toast, confirmDialog } from './toast.js';
import { collection, query, where, onSnapshot, orderBy, deleteDoc, doc, addDoc, serverTimestamp, getDocs, updateDoc } from 'firebase/firestore';
import { ref as sRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import Indicate from './Indicate.vue';
import { enforceSafeHours, setEnforceSafeHours, subscribeTradeSettings } from './tradeSettings.js';

const emit = defineEmits(['back']);
const currentTab = ref('patrol');

const switchTab = (tabName) => {
  console.log(`👉 [YaBuy 偵錯] 用戶點擊分頁標籤，切換至: 【${tabName}】`);
  currentTab.value = tabName;
};

// ================= 🌟 0. 安全與交易日誌（日誌核心） =================
const loadingLogs = ref(true);
const auditFilter = ref('all');
const allAuditLogs = ref([]);
let unsubscribeAuditLogs = null;

const fetchAuditLogs = () => {
  console.log("🛰️ [YaBuy 偵錯] 啟動隨選即時監聽：正在嘗試與 Firestore 'audit_logs' 集合建立連線...");
  loadingLogs.value = true;
  const q = query(collection(db, "audit_logs"), orderBy("createdAt", "desc"));
  unsubscribeAuditLogs = onSnapshot(q, (snapshot) => {
    console.log(`📥 [YaBuy 偵錯] 雲端資料庫回傳成功！目前日誌總筆數: ${snapshot.docs.length} 筆`);
    allAuditLogs.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    loadingLogs.value = false;
  }, (error) => {
    console.error("❌ [YaBuy 偵錯] 無法讀取 'audit_logs' 集合。詳細錯誤:", error);
    loadingLogs.value = false;
  });
};

const filteredLogs = computed(() => {
  return allAuditLogs.value.filter(log => auditFilter.value === 'all' || log.category === auditFilter.value);
});

// 精準日誌寫入器
const writeAuditLog = async (category, title, content, extraFields = {}) => {
  try {
    await addDoc(collection(db, "audit_logs"), {
      category,
      title,
      content,
      operatorId: auth.currentUser?.uid || 'SYSTEM',
      createdAt: serverTimestamp(),
      ...extraFields
    });
  } catch (err) {
    console.error("無法寫入稽核日誌:", err);
  }
};

// ================= 1. 商品巡邏邏輯 =================
const loadingProducts = ref(true);
const allProducts = ref([]);
let unsubscribeProducts = null;

const fetchAllProducts = () => {
  loadingProducts.value = true;
  const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
  unsubscribeProducts = onSnapshot(q, (snapshot) => {
    allProducts.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    loadingProducts.value = false;
  }, (err) => {
    console.error("[Admin] 商品監聽失敗（規則/索引）：", err.code, err.message);
    loadingProducts.value = false;
  });
};

// 🌟 上架中／已售出統計
const activeProductCount = computed(() => allProducts.value.filter(p => p.status !== 'sold').length);
const soldProductCount = computed(() => allProducts.value.filter(p => p.status === 'sold').length);

// 🌟 已售出排到最後面；查詢本身已經是 createdAt desc，這裡只做穩定的分組搬移，
// 不重新排序群組內部順序，所以「上架中」跟「已售出」各自仍維持新到舊。
const sortedPatrolProducts = computed(() => {
  const active = allProducts.value.filter(p => p.status !== 'sold');
  const sold = allProducts.value.filter(p => p.status === 'sold');
  return [...active, ...sold];
});

const showDeleteModal = ref(false);
const productToDelete = ref(null);
const deleteReason = ref('');
const isDeleting = ref(false);

const openDeleteModal = (item) => { productToDelete.value = item; deleteReason.value = ''; showDeleteModal.value = true; };

const confirmDelete = async () => {
  if (!deleteReason.value.trim()) return;
  isDeleting.value = true;
  try {
    await deleteDoc(doc(db, "products", productToDelete.value.id));
    await addDoc(collection(db, "notifications"), {
      type: 'warning',
      title: `商品下架通知：${productToDelete.value.name}`,
      content: `您的商品「${productToDelete.value.name}」已被系統管理員強制下架。\n📌 下架原因：${deleteReason.value}`,
      target: productToDelete.value.sellerId, 
      sender: 'YaBuy 管理團隊',
      createdAt: serverTimestamp()
    });
    
    await writeAuditLog('admin', '強制商品下架', `管理員強制下架了商品「${productToDelete.value.name}」。原因：${deleteReason.value}`, { sellerId: productToDelete.value.sellerId, productId: productToDelete.value.id });
    toast("✅ 商品已成功下架！");
    showDeleteModal.value = false;
  } catch (error) { toast("❌ 操作失敗：" + error.message); } 
  finally { isDeleting.value = false; productToDelete.value = null; }
};

// ================= 2. 使用者管理邏輯 =================
const loadingUsers = ref(true);
const allUsers = ref([]);
let unsubscribeUsers = null;

const fetchAllUsers = () => {
  loadingUsers.value = true;
  const q = query(collection(db, "users"));
  unsubscribeUsers = onSnapshot(q, (snapshot) => {
    allUsers.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    loadingUsers.value = false;
  }, (err) => {
    console.error("[Admin] 用戶監聽失敗（規則）：", err.code, err.message);
    loadingUsers.value = false;
  });
};

// 拉黑停權處理
const toggleBlacklist = async (user) => {
  // 不可拉黑創辦人（前端防線；真正的保護建議再加 Firestore 規則）
  if (user.isFounder) { toast.error('❌ 無法停權創辦人帳號'); return; }
  console.log("🖱️ [YaBuy 偵錯] 點擊拉黑停權，選定對象:", user.displayName);
  const isCurrentlyBanned = user.status === 'banned';
  const actionText = isCurrentlyBanned ? '解除黑名單' : '加入黑名單並停權';
  if (!(await confirmDialog(`確定要將 ${user.displayName || '此用戶'} ${actionText} 嗎？`))) return;

  try {
    await updateDoc(doc(db, "users", user.id), { status: isCurrentlyBanned ? 'active' : 'banned' });
    await writeAuditLog('admin', isCurrentlyBanned ? '用戶解除限制' : '用戶停權限制 (拉黑)', `管理員將用戶「${user.displayName || '校園用戶'}」(UID: ${user.id}) 狀態變更為 ${isCurrentlyBanned ? '正常啟用' : '已停權'}。`, { targetUserId: user.id });
    toast(`✅ 已成功將該用戶${actionText}！`);
  } catch (error) { toast("❌ 操作失敗：" + error.message); }
};

// 一鍵清除商品
const purgeUserData = async (user) => {
  const userName = user.displayName || '此用戶';
  if (!(await confirmDialog(`⚠️ 警告：確定要清除「${userName}」的所有上架商品嗎？\n這將會瞬間刪除他正在架上的所有商品。\n(帳號本身會保留，方便您後續控制停權狀態)\n\n注意：商品刪除後不可逆！`))) return;
  try {
    const qProducts = query(collection(db, "products"), where("sellerId", "==", user.id));
    const snapProducts = await getDocs(qProducts);
    const deletePromises = snapProducts.docs.map(productDoc => deleteDoc(doc(db, "products", productDoc.id)));
    await Promise.all(deletePromises);

    await writeAuditLog('admin', '用戶資料大量強制清除', `管理員一鍵清空了用戶「${userName}」在架上的所有二手商品 (共 ${snapProducts.docs.length} 件)。`, { targetUserId: user.id });
    toast(`✅ 已成功清除該用戶的 ${snapProducts.docs.length} 件商品！`);
  } catch (error) { toast("❌ 清除失敗：" + error.message); }
};

// 查閱紀錄詳細彈窗
const showUserModal = ref(false);
const targetUser = ref(null);
const targetUserProducts = ref([]);

// 🔑 管理員權限（Custom Claim）
const claimLoading = ref(false);
const claimStatus = ref('尚未確認');
const myUid = computed(() => auth.currentUser?.uid || null);
const isFounder = ref(false);

const refreshClaimStatus = async () => {
  try {
    const r = await auth.currentUser.getIdTokenResult(true);
    isFounder.value = r.claims.founder === true;
    claimStatus.value = r.claims.admin === true ? '✅ 已是管理員（admin claim 已生效）' : '⚠️ 尚未取得 admin 權限';
  } catch (e) {
    claimStatus.value = '無法讀取權限狀態';
  }
};

const confirmMyAdmin = async () => {
  if (!auth.currentUser) { toast.error('請先登入'); return; }
  claimLoading.value = true;
  try {
    const fn = httpsCallable(functions, 'addAdminRole');
    const res = await fn();                       // 後端只會把「創辦人本人」設成 admin
    await auth.currentUser.getIdToken(true);       // 強制刷新 token 帶上新 claim
    await refreshClaimStatus();
    toast.success('✅ ' + (res.data?.message || '管理員權限已確認'));
  } catch (e) {
    console.error('[Admin] 確認管理員權限失敗：', e.code, e.message);
    if (e.code === 'functions/permission-denied') {
      toast.error('❌ 此帳號不是創辦人，無法取得管理員權限');
    } else {
      toast.error('❌ 操作失敗：' + (e.message || '請稍後再試'));
    }
  } finally {
    claimLoading.value = false;
  }
};

// 🩹 補齊缺失的 users 文件（Auth 有、Firestore 沒有的孤兒帳號）
// 先試跑列出缺哪些人，使用者確認後才真的寫入，避免誤觸就大量寫資料庫。
const backfillLoading = ref(false);
const backfillStatus = ref('尚未檢查');

const runBackfill = async () => {
  backfillLoading.value = true;
  try {
    const fn = httpsCallable(functions, 'backfillUserDocs');

    // 第一階段：試跑（dryRun 預設 true），只統計不寫入
    const preview = await fn({ dryRun: true });
    const { authTotal, existingTotal, missingTotal, missing } = preview.data || {};

    if (!missingTotal) {
      backfillStatus.value = `✅ 已一致：Auth ${authTotal} 人，Firestore ${existingTotal} 筆`;
      toast.success('✅ 兩邊數量已經一致，沒有需要補齊的資料。');
      return;
    }

    const names = (missing || []).map(m => m.email || m.uid).join('\n');
    const ok = await confirmDialog(
      `Auth 共 ${authTotal} 人，其中 ${missingTotal} 人缺少 Firestore 資料：\n\n` +
      `${names}\n\n確定要補建這 ${missingTotal} 筆資料嗎？`
    );
    if (!ok) {
      backfillStatus.value = `⚠️ 有 ${missingTotal} 筆缺失（已取消補齊）`;
      return;
    }

    // 第二階段：真的寫入
    const res = await fn({ dryRun: false });
    const done = res.data?.missingTotal ?? 0;
    backfillStatus.value = `✅ 已補齊 ${done} 筆，Auth 共 ${res.data?.authTotal} 人`;
    await writeAuditLog('admin', '補齊缺失用戶資料',
      `創辦人補建了 ${done} 筆缺少 Firestore 文件的帳號資料。`);
    toast.success(`✅ 已補齊 ${done} 筆使用者資料！`);
  } catch (e) {
    console.error('[Admin] 補齊用戶資料失敗：', e.code, e.message);
    backfillStatus.value = '❌ 執行失敗';
    if (e.code === 'functions/permission-denied') {
      toast.error('❌ 只有創辦人可以執行資料補齊');
    } else if (e.code === 'functions/not-found') {
      toast.error('❌ 找不到 backfillUserDocs，請先部署 Cloud Functions');
    } else {
      toast.error('❌ 執行失敗：' + (e.message || '請稍後再試'));
    }
  } finally {
    backfillLoading.value = false;
  }
};

// 設為 / 取消其他用戶的管理員（創辦人或現有管理員可用）
// ================= 🌟 交易時段限制開關 =================
// 這條限制一直都只有前端在擋（firestore.rules 算不出時段——orders.time 是
// 不含時區的字串），所以關掉的是「前端會不會擋」。因為它會即時影響所有使用
// 者，切換一律寫入稽核紀錄，事後查得到是誰在什麼時候關的。
const hoursToggleLoading = ref(false);

const toggleSafeHours = async () => {
  const turningOff = enforceSafeHours.value;
  const ok = await confirmDialog(
    turningOff
      ? '確定要暫時關閉 06:00 - 18:00 的交易時段限制嗎？\n\n關閉期間「所有使用者」都能在任何時間發起交易，' +
        '交易彈窗會顯示測試模式提示。測試完請記得重新開啟。'
      : '確定要重新開啟 06:00 - 18:00 的交易時段限制嗎？'
  );
  if (!ok) return;

  hoursToggleLoading.value = true;
  try {
    await setEnforceSafeHours(!turningOff, auth.currentUser?.uid);
    await writeAuditLog(
      'security',
      turningOff ? '🧪 交易時段限制已關閉' : '🔒 交易時段限制已重新開啟',
      turningOff
        ? '管理員暫時關閉 06:00 - 18:00 的交易時段限制，關閉期間所有使用者可在任何時間發起交易。'
        : '管理員重新開啟 06:00 - 18:00 的交易時段限制。',
      { level: turningOff ? 'warning' : 'normal' }
    );
    toast.success(turningOff ? '🧪 已關閉時段限制' : '🔒 已重新開啟時段限制');
  } catch (e) {
    console.error('[Admin] 切換交易時段限制失敗：', e.code, e.message);
    toast('❌ 切換失敗，請重試。');
  } finally {
    hoursToggleLoading.value = false;
  }
};

const toggleAdmin = async (u) => {
  if (!isFounder.value) { toast.error('❌ 只有創辦人可以新增或取消管理員'); return; }
  if (u.id === myUid.value) { toast.error('❌ 無法變更自己的管理員權限'); return; }
  if (!u.email) { toast.error('❌ 此用戶沒有 email，無法設定'); return; }
  const makeAdmin = !u.isAdmin;
  const who = u.displayName || u.email;
  const ok = await confirmDialog(
    makeAdmin ? `確定要將「${who}」設為管理員嗎？` : `確定要取消「${who}」的管理員權限嗎？`
  );
  if (!ok) return;
  try {
    const fn = httpsCallable(functions, 'addAdminRole');
    const res = await fn({ email: u.email, makeAdmin });
    toast.success('✅ ' + (res.data?.message || '已更新'));
    // 用戶列表用 onSnapshot 監聽，function 寫入 isAdmin 後會自動刷新顯示
  } catch (e) {
    console.error('[Admin] 設定管理員失敗：', e.code, e.message);
    if (e.code === 'functions/permission-denied') toast.error('❌ ' + (e.message || '沒有權限'));
    else if (e.code === 'functions/not-found') toast.error('❌ 找不到此用戶，對方需先登入過 App');
    else toast.error('❌ 操作失敗：' + (e.message || '請稍後再試'));
  }
};
const targetUserOrders = ref([]);
const targetUserReviews = ref([]);
const loadingUserDetails = ref(false);

const openUserModal = async (user) => {
  targetUser.value = user; showUserModal.value = true; loadingUserDetails.value = true;
  targetUserProducts.value = []; targetUserOrders.value = []; targetUserReviews.value = [];
  try {
    try {
      const snapProducts = await getDocs(query(collection(db, "products"), where("sellerId", "==", user.id)));
      targetUserProducts.value = snapProducts.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) { console.error("🔴 讀取 products 失敗：", e.code, e.message); }

    try {
      const snapOrders = await getDocs(query(collection(db, "orders"), where("sellerId", "==", user.id)));
      targetUserOrders.value = snapOrders.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) { console.error("🔴 讀取 orders 失敗：", e.code, e.message); }

    try {
      const snapReviews = await getDocs(query(collection(db, "reviews"), where("ratedId", "==", user.id)));
      targetUserReviews.value = snapReviews.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    } catch (e) { console.error("🔴 讀取 reviews 失敗（檢查 admin claim / 規則）：", e.code, e.message); }
  } finally { loadingUserDetails.value = false; }
};

// ================= 3. 系統公告廣播邏輯 =================
const isSending = ref(false);
const broadcastForm = ref({ type: 'info', title: '', content: '' });
const loadingBroadcasts = ref(true);
const allBroadcasts = ref([]);
let unsubscribeBroadcasts = null;

const fetchAllBroadcasts = () => {
  loadingBroadcasts.value = true;
  const q = query(collection(db, "notifications"), where("target", "==", "ALL"), orderBy("createdAt", "desc"));
  unsubscribeBroadcasts = onSnapshot(q, (snapshot) => {
    allBroadcasts.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    loadingBroadcasts.value = false;
  }, (err) => {
    console.error("[Admin] 公告監聽失敗（檢查 notifications 的 target+createdAt 索引）：", err.code, err.message);
    loadingBroadcasts.value = false;
  });
};

const sendBroadcast = async () => {
  if (!(await confirmDialog(`確定要向全校發布此篇公告嗎？`))) return;
  isSending.value = true;
  try {
    await addDoc(collection(db, "notifications"), {
      type: broadcastForm.value.type, title: broadcastForm.value.title, content: broadcastForm.value.content,
      target: 'ALL', sender: 'YaBuy 管理團隊', createdAt: serverTimestamp()
    });
    await writeAuditLog('admin', '發布全校公告', `管理員全站廣播：「${broadcastForm.value.title}」`);
    toast("✅ 全校廣播發送成功！");
    broadcastForm.value = { type: 'info', title: '', content: '' };
  } catch (error) { toast("❌ 發送失敗：" + error.message); } 
  finally { isSending.value = false; }
};

const deleteBroadcast = async (id, title) => {
  if (!(await confirmDialog(`確定要收回公告「${title}」嗎？\n這將會把它從全校所有人的信箱中刪除！`))) return;
  try { 
    await deleteDoc(doc(db, "notifications", id)); 
    await writeAuditLog('admin', '收回全校公告', `管理員回收了全校公告：「${title}」`);
  } catch (error) { toast("❌ 刪除失敗：" + error.message); }
};

// ================= 4. 廣告管理邏輯 =================
const loadingAds = ref(true);
const allAds = ref([]);
let unsubscribeAdsList = null;

const fetchAllAds = () => {
  loadingAds.value = true;
  const q = query(collection(db, "ads"), orderBy("createdAt", "desc"));
  unsubscribeAdsList = onSnapshot(q, (snapshot) => {
    allAds.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    loadingAds.value = false;
  }, (err) => {
    console.error("[Admin] 廣告監聽失敗（規則/索引）：", err.code, err.message);
    loadingAds.value = false;
  });
};

const blankAdForm = () => ({ title: '', description: '', linkUrl: '', startDate: '', endDate: '' });
const adForm = ref(blankAdForm());
const editingAdId = ref(null);
const isSavingAd = ref(false);
// 3 個輪播圖片欄位：existingUrl 是編輯時原本就有的網址，blob 是使用者這次新選的檔案（優先使用）
const adImageSlots = reactive([
  { preview: null, blob: null, existingUrl: '' },
  { preview: null, blob: null, existingUrl: '' },
  { preview: null, blob: null, existingUrl: '' }
]);
// 純粹拿來觸發隱藏 <input type="file"> 的 click()，不需要響應式
const adFileInputs = [];
const triggerAdFile = (i) => { adFileInputs[i]?.click(); };

// 跟 Cam.vue 上傳商品圖同一套壓縮邏輯：限寬 1024px、轉 jpeg 0.7 品質
const compressAdImage = (img, callback) => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const maxWidth = 1024;
  let width = img.width, height = img.height;
  if (width > maxWidth) { height = (maxWidth / width) * height; width = maxWidth; }
  canvas.width = width; canvas.height = height;
  ctx.drawImage(img, 0, 0, width, height);
  canvas.toBlob((blob) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = () => callback(blob, reader.result);
  }, 'image/jpeg', 0.7);
};

const onAdImageChange = (i, e) => {
  const file = e.target.files[0];
  e.target.value = ''; // 讓使用者重選同一張檔案時也能觸發 change
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { toast.error('❌ 圖片過大（上限 10MB）'); return; }
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = (ev) => {
    const img = new Image();
    img.src = ev.target.result;
    img.onload = () => {
      compressAdImage(img, (blob, dataUrl) => {
        adImageSlots[i].blob = blob;
        adImageSlots[i].preview = dataUrl;
      });
    };
    img.onerror = () => toast.error('❌ 圖片格式無法解析，請換一張');
  };
};

const tsToDateInputStr = (ts) => {
  if (!ts?.toDate) return '';
  const d = ts.toDate();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const formatDateShort = (ts) => {
  if (!ts?.toDate) return '未設定';
  const d = ts.toDate();
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

// 廣告狀態徽章：未開始 / 上架中 / 已下架（純前端依日期即時判斷，不額外存 status 欄位）
const getAdStatus = (ad) => {
  const now = new Date();
  const start = ad.startDate?.toDate ? ad.startDate.toDate() : null;
  const end = ad.endDate?.toDate ? ad.endDate.toDate() : null;
  if (start && now < start) return { label: '⏳ 未開始', cls: 'upcoming' };
  if (end && now > end) return { label: '⛔ 已下架', cls: 'expired' };
  return { label: '✅ 上架中', cls: 'active' };
};

const resetAdForm = () => {
  editingAdId.value = null;
  adForm.value = blankAdForm();
  adImageSlots.forEach(s => { s.preview = null; s.blob = null; s.existingUrl = ''; });
};

const editAd = (ad) => {
  editingAdId.value = ad.id;
  adForm.value = {
    title: ad.title || '',
    description: ad.description || '',
    linkUrl: ad.linkUrl || '',
    startDate: tsToDateInputStr(ad.startDate),
    endDate: tsToDateInputStr(ad.endDate)
  };
  const imgs = ad.images || [];
  adImageSlots.forEach((s, i) => { s.existingUrl = imgs[i] || ''; s.preview = null; s.blob = null; });
  document.querySelector('.admin-content-area')?.scrollTo({ top: 0, behavior: 'smooth' });
};

const saveAd = async () => {
  if (!adForm.value.startDate || !adForm.value.endDate) { toast.error('❌ 請設定上下架期限'); return; }
  if (new Date(adForm.value.startDate) > new Date(adForm.value.endDate)) { toast.error('❌ 上架日期不能晚於下架日期'); return; }

  const filledSlots = adImageSlots.filter(s => s.blob || s.existingUrl);
  if (filledSlots.length === 0) { toast.error('❌ 請至少上傳 1 張輪播圖片'); return; }

  isSavingAd.value = true;
  try {
    // 只上傳「這次新選的」圖片，沒換過的欄位沿用原本網址
    const images = [];
    for (let i = 0; i < adImageSlots.length; i++) {
      const slot = adImageSlots[i];
      if (slot.blob) {
        const fileName = `ads/${Date.now()}-${i}.jpg`;
        const storageRef = sRef(storage, fileName);
        const uploadResult = await uploadBytes(storageRef, slot.blob);
        images.push(await getDownloadURL(uploadResult.ref));
      } else if (slot.existingUrl) {
        images.push(slot.existingUrl);
      }
    }

    const payload = {
      title: adForm.value.title.trim(),
      description: adForm.value.description.trim(),
      linkUrl: adForm.value.linkUrl.trim(),
      images,
      startDate: new Date(`${adForm.value.startDate}T00:00:00`),
      endDate: new Date(`${adForm.value.endDate}T23:59:59`)
    };

    if (editingAdId.value) {
      await updateDoc(doc(db, "ads", editingAdId.value), payload);
      await writeAuditLog('admin', '編輯廣告', `管理員編輯了廣告「${payload.title}」。`, { adId: editingAdId.value });
      toast.success('✅ 廣告已更新！');
    } else {
      const docRef = await addDoc(collection(db, "ads"), { ...payload, createdAt: serverTimestamp() });
      await writeAuditLog('admin', '新增廣告', `管理員建立了新廣告「${payload.title}」。`, { adId: docRef.id });
      toast.success('✅ 廣告已建立！');
    }
    resetAdForm();
  } catch (error) {
    console.error('[Admin] 儲存廣告失敗：', error);
    toast.error('❌ 儲存失敗：' + error.message);
  } finally {
    isSavingAd.value = false;
  }
};

const deleteAd = async (ad) => {
  if (!(await confirmDialog(`確定要刪除廣告「${ad.title}」嗎？此動作無法復原。`))) return;
  try {
    await deleteDoc(doc(db, "ads", ad.id));
    await writeAuditLog('admin', '刪除廣告', `管理員刪除了廣告「${ad.title}」。`, { adId: ad.id });
    toast.success('✅ 廣告已刪除！');
    if (editingAdId.value === ad.id) resetAdForm();
  } catch (error) { toast.error('❌ 刪除失敗：' + error.message); }
};

const formatTime = (ts) => { if (!ts) return ''; const d = ts.toDate(); return `${d.getMonth()+1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`; };
const formatFullTime = (ts) => { if (!ts) return '同步中...'; const d = ts.toDate(); return `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`; };

onMounted(() => {
  fetchAllProducts();
  fetchAllUsers();
  fetchAllBroadcasts();
  fetchAuditLogs();
  fetchAllAds();
  refreshClaimStatus();
  subscribeTradeSettings();
});

onUnmounted(() => {
  if (unsubscribeProducts) unsubscribeProducts();
  if (unsubscribeUsers) unsubscribeUsers();
  if (unsubscribeBroadcasts) unsubscribeBroadcasts();
  if (unsubscribeAuditLogs) unsubscribeAuditLogs();
  if (unsubscribeAdsList) unsubscribeAdsList();
});
</script>

<style scoped>
/* ==================== 基礎佈局樣式 ==================== */
.admin-page-root { position: absolute; inset: 0; background-color: #f4f6f8; display: flex; flex-direction: column; z-index: 200; font-family: -apple-system, sans-serif; }
.admin-header { background: #1a1a1a; color: #fff; padding-bottom: 14px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); }
.header-top { display: flex; align-items: center; justify-content: space-between; padding: calc(env(safe-area-inset-top, 44px) + 6px) 20px 12px; }
.back-btn-pill { background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 7px 14px; border-radius: 20px; font-size: 13px; font-weight: 700; cursor: pointer; transition: 0.2s; }
.back-btn-pill:active { background: rgba(255,255,255,0.3); }
.header-title { font-size: 19px; font-weight: 900; letter-spacing: 1px; }

.tab-switcher { margin: 0 16px; background: rgba(255,255,255,0.08); height: 44px; border-radius: 14px; display: flex; padding: 4px; gap: 2px; }
.tab-item { flex: 1; display: flex; justify-content: center; align-items: center; font-size: 10px; font-weight: 800; color: #aaa; border-radius: 10px; cursor: pointer; transition: 0.2s; white-space: nowrap; padding: 0 2px; text-align: center; }
.tab-item.active { background: #333; color: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }

.admin-content-area { flex: 1; overflow-y: auto; padding: 16px 16px 100px; }
/* 指標分頁：Indicate 自帶 padding，外層不重複加 */
.admin-content-area :deep(.indicate-page) { padding-top: 4px; background: transparent; }

/* ==================== 商品巡邏：上架中／已售出統計 ==================== */
.patrol-stats-row { display: flex; gap: 12px; margin-bottom: 16px; }
.patrol-stat-box { flex: 1; background: #fff; border-radius: 16px; padding: 16px; display: flex; flex-direction: column; align-items: center; gap: 4px; box-shadow: 0 4px 14px rgba(0,0,0,0.04); }
.patrol-stat-num { font-size: 26px; font-weight: 900; color: #2c3e50; }
.patrol-stat-label { font-size: 12px; font-weight: 800; color: #888; }

/* ==================== 共通卡片與按鈕樣式 ==================== */
.admin-item-card { background: #fff; border-radius: 18px; padding: 14px; margin-bottom: 12px; display: flex; gap: 14px; align-items: center; box-shadow: 0 4px 14px rgba(0,0,0,0.04); border-left: 4px solid #333; }
.item-img-box { width: 68px; height: 68px; border-radius: 12px; overflow: hidden; background: #eee; flex-shrink: 0; }
.item-img { width: 100%; height: 100%; object-fit: cover; }
.item-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 24px; }
.item-details { flex: 1; min-width: 0; }
.item-name { font-size: 14px; font-weight: 800; color: #333; margin: 0 0 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.item-meta { display: flex; gap: 6px; margin-bottom: 6px; align-items: center; }
/* .status-badge 原本設計是獨立一行（用戶列表），這裡跟 .meta-tag 同一橫排，蓋掉它的 margin-top 避免對不齊 */
.item-meta .status-badge { margin-top: 0; }
.meta-tag { padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 800; }
.meta-tag.price { background: #e8f5e9; color: #2e7d32; }
.meta-tag.category { background: #f5f5f5; color: #666; }
.seller-info { font-size: 11px; color: #999; font-weight: 600; }
.uid-text { font-family: monospace; color: #e65100; background: #fff3e0; padding: 2px 5px; border-radius: 4px; font-size: 11px; }

.btn-force-delete { background: #ffebee; color: #d32f2f; border: 1px solid #ffcdd2; padding: 10px 14px; border-radius: 10px; font-size: 11px; font-weight: 900; cursor: pointer; transition: 0.2s; white-space: nowrap; width: 100%; }
.btn-force-delete:active { background: #d32f2f; color: #fff; }
.btn-force-purge { background: #2c3e50; color: #fff; border: none; padding: 10px 14px; border-radius: 10px; font-size: 11px; font-weight: 900; cursor: pointer; transition: 0.2s; white-space: nowrap; width: 100%; box-shadow: 0 2px 5px rgba(0,0,0,0.2); }
.btn-force-purge:active { background: #1a252f; transform: scale(0.98); }

.user-card.is-banned { border-left-color: #d32f2f; background: #fffcfc; opacity: 0.8; }
.avatar-box { border-radius: 50%; border: 2px solid #eee; }
.status-badge { display: inline-block; margin-top: 6px; padding: 3px 8px; border-radius: 6px; font-size: 10px; font-weight: 800; }
.status-badge.active { background: #e8f5e9; color: #2e7d32; }
.status-badge.banned { background: #ffebee; color: #d32f2f; }
.status-badge.sold { background: #fff3e0; color: #ef6c00; }
.item-actions-col { display: flex; flex-direction: column; gap: 8px; }
.btn-outline-small { background: #fff; color: #333; border: 1px solid #ccc; padding: 10px 14px; border-radius: 10px; font-size: 11px; font-weight: 800; cursor: pointer; white-space: nowrap; }

/* ==================== 日誌面板樣式 ==================== */
.audit-panel-header { background: #fff; border-radius: 20px; padding: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.03); margin-bottom: 16px; }
.panel-desc-group h3 { margin: 0 0 4px; font-size: 16px; font-weight: 900; color: #222; }
.panel-desc-group p { margin: 0 0 16px; font-size: 12px; color: #777; line-height: 1.5; }
.audit-filter-bar { display: flex; flex-wrap: wrap; gap: 8px; }
.filter-chip { border: none; background: #f1f0ee; padding: 8px 14px; border-radius: 10px; font-size: 11px; font-weight: 800; color: #555; cursor: pointer; transition: 0.2s; }
.filter-chip.active { background: #333; color: #fff; }

.audit-stream-timeline { display: flex; flex-direction: column; gap: 12px; }
.audit-log-card { background: #fff; border-radius: 16px; padding: 16px; display: flex; gap: 14px; box-shadow: 0 2px 10px rgba(0,0,0,0.02); border-left: 5px solid #2e7d32; position: relative; transition: 0.3s; }
.audit-log-card.is-risk { border-left-color: #d32f2f; background: #fff5f5; animation: pulse-border 2s infinite; }
@keyframes pulse-border {
  0% { box-shadow: 0 4px 15px rgba(211, 47, 47, 0.08); }
  50% { box-shadow: 0 4px 20px rgba(211, 47, 47, 0.2); }
  100% { box-shadow: 0 4px 15px rgba(211, 47, 47, 0.08); }
}

.log-main-body { flex: 1; min-width: 0; }
.log-top-meta { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.log-badge { font-size: 10px; font-weight: 900; padding: 3px 8px; border-radius: 6px; text-transform: uppercase; }
.log-badge.security { background: #ffebee; color: #c62828; }
.log-badge.trade { background: #e3f2fd; color: #1565c0; }
.log-badge.admin { background: #f5f5f5; color: #424242; }
.log-timestamp { font-size: 10px; color: #aaa; font-family: monospace; }
.log-title-text { margin: 0 0 6px; font-size: 14px; font-weight: 850; color: #2c3e50; }
.is-risk .log-title-text { color: #c62828; }
.log-content-p { margin: 0 0 10px; font-size: 12px; color: #666; line-height: 1.5; word-break: break-all; }

.trace-routing-box { background: #f8faf5; padding: 8px 12px; border-radius: 10px; border: 1px solid rgba(0,0,0,0.03); display: flex; flex-direction: column; gap: 6px; }
.is-risk .trace-routing-box { background: rgba(211, 47, 47, 0.03); }
.trace-node, .trace-chain { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; color: #555; }
.node-label { color: #888; font-weight: 600; }
.node-code { font-family: monospace; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 800; }
.node-code.admin { background: #e0e0e0; color: #333; }
.node-code.buyer { background: #e3f2fd; color: #1565c0; }
.node-code.seller { background: #fff3e0; color: #ef6c00; }
.chain-arrow { color: #aaa; font-weight: bold; }

/* ==================== 廣播與歷史公告 ==================== */
.broadcast-container { background: #fff; border-radius: 20px; padding: 24px 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); margin-bottom: 24px; }
.broadcast-header-info h3 { margin: 0 0 8px; color: #1a1a1a; font-size: 18px; font-weight: 900; }
.broadcast-header-info p { margin: 0 0 20px; color: #666; font-size: 13px; line-height: 1.5; }
.form-group { margin-bottom: 20px; }
.form-group label { display: block; font-size: 13px; font-weight: 800; color: #444; margin-bottom: 8px; }
.type-selector { display: flex; gap: 10px; }
.type-radio { flex: 1; border: 2px solid #eee; border-radius: 12px; padding: 12px; text-align: center; font-size: 14px; font-weight: 800; color: #888; cursor: pointer; transition: 0.2s; position: relative; }
.type-radio input { position: absolute; opacity: 0; }
.type-radio.active { border-color: #333; color: #333; background: #f9f9f9; }
.type-radio.urgent.active { border-color: #d32f2f; color: #d32f2f; background: #ffebee; }
.admin-input, .admin-textarea { width: 100%; padding: 14px; background: #f5f6f8; border: 1px solid #eaeaea; border-radius: 12px; font-size: 15px; outline: none; box-sizing: border-box; }
.admin-textarea { resize: none; font-family: inherit; }
.btn-submit-broadcast { width: 100%; padding: 16px; background: #1a1a1a; color: #fff; border: none; border-radius: 14px; font-size: 16px; font-weight: 900; cursor: pointer; margin-top: 10px; }

.history-broadcast-container { background: transparent; }
.history-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; padding: 0 4px; }
.history-header h3 { margin: 0; font-size: 15px; font-weight: 800; color: #555; }
.badge-count { background: #ddd; color: #555; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 800; }
.history-card { background: #fff; border-radius: 16px; padding: 16px; display: flex; gap: 12px; align-items: center; margin-bottom: 10px; border-left: 4px solid #1a1a1a; }
.history-card.is-warning { border-left-color: #d32f2f; background: #fffcfc; }
.h-icon { width: 36px; height: 36px; background: #f0f2f5; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
.is-warning .h-icon { background: #ffebee; }
.h-content { flex: 1; min-width: 0; }
.h-top-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px; }
.h-title { margin: 0; font-size: 14px; font-weight: 800; color: #333; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.h-time { font-size: 10px; color: #aaa; margin-left: 8px; }
.h-desc { margin: 0; font-size: 12px; color: #777; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.btn-delete-broadcast { background: #f5f5f5; border: 1px solid #eee; padding: 8px 12px; border-radius: 10px; font-size: 11px; font-weight: 800; cursor: pointer; }

/* ==================== 狀態與 Modal 彈窗樣式 ==================== */
.state-hint { text-align: center; padding: 40px; font-size: 14px; color: #999; font-weight: 700; }
.state-hint.empty { background: rgba(0,0,0,0.02); border-radius: 24px; border: 2px dashed #ddd; padding: 60px 20px; }
.state-hint-small { text-align: center; padding: 20px; font-size: 13px; color: #999; font-weight: 700; }
.state-hint-small.empty { background: rgba(0,0,0,0.03); border-radius: 16px; border: 1px dashed #ccc; }
.loader-dots span { animation: blink 1.4s infinite both; font-size: 30px; }
.loader-dots span:nth-child(2) { animation-delay: .2s; }
.loader-dots span:nth-child(3) { animation-delay: .4s; }
@keyframes blink { 0% { opacity: .2; } 20% { opacity: 1; } 100% { opacity: .2; } }

.admin-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); display: flex; justify-content: center; align-items: center; z-index: 999; padding: 20px; }
.admin-modal { background: #fff; width: 100%; max-width: 340px; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.2); }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 20px 15px; border-bottom: 1px solid #f0f0f0; }
.modal-header h3 { margin: 0; font-size: 18px; font-weight: 900; color: #d32f2f; }
.close-btn { background: none; border: none; font-size: 18px; color: #999; cursor: pointer; }
.modal-body { padding: 20px; }
.target-info { background: #f9f9f9; padding: 12px; border-radius: 12px; margin-bottom: 20px; font-size: 14px; border: 1px solid #eee; }
.target-info .badge { background: #333; color: #fff; font-size: 11px; padding: 3px 6px; border-radius: 6px; margin-right: 8px; font-weight: 700; }
.modal-actions { display: flex; gap: 12px; padding: 15px 20px 20px; background: #fafafa; }
.btn-cancel { flex: 1; padding: 12px; background: #fff; border: 1px solid #ddd; border-radius: 12px; font-weight: 700; cursor: pointer; }
.btn-danger { flex: 2; padding: 12px; background: #d32f2f; color: #fff; border: none; border-radius: 12px; font-weight: 800; cursor: pointer; }

.large-modal { max-width: 360px; max-height: 80vh; display: flex; flex-direction: column; }
.large-modal .modal-header h3 { color: #333; }
.scrollable-body { flex: 1; overflow-y: auto; padding: 0; background: #f9f9f9; }
.detail-section { padding: 16px 20px; border-bottom: 1px solid #eee; background: #fff; }
.section-title-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.detail-section h4 { margin: 0; font-size: 14px; font-weight: 800; color: #444; }
.mini-record-list { display: flex; flex-direction: column; gap: 8px; }
.record-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: #f5f6f8; border-radius: 10px; font-size: 13px; font-weight: 600; color: #333; }
.sold-item { align-items: flex-start; }
.r-info-col { display: flex; flex-direction: column; gap: 4px; }
.r-buyer { font-size: 10px; color: #888; }
.r-price { color: #2e7d32; font-weight: 800; }
.empty-record { font-size: 12px; color: #aaa; text-align: center; padding: 10px; background: #fafafa; border-radius: 8px; border: 1px dashed #ddd; }
.review-note { font-size: 11px; color: #b9650f; background: #fdf3e3; padding: 6px 10px; border-radius: 8px; margin: 0 0 8px; }
.admin-claim-box { display: flex; align-items: center; justify-content: space-between; gap: 12px; background: #fff; border: 1.5px solid #eef0eb; border-radius: 14px; padding: 14px 16px; margin-bottom: 14px; }
.claim-text { display: flex; flex-direction: column; gap: 3px; }
.claim-text strong { font-size: 14px; color: #2c3e50; }
.claim-text span { font-size: 12px; color: #888; }
.btn-claim { flex-shrink: 0; background: #333; color: #fff; border: none; border-radius: 12px; padding: 10px 16px; font-size: 13px; font-weight: 800; cursor: pointer; }
.btn-claim:disabled { background: #ccc; }
.btn-danger-toggle { background: #c1440e; }
.settings-box.is-off { background: #fff3ef; border-color: #ffccbc; }
.backfill-box { border-color: #ffe0b2; background: #fffdf8; }
.admin-chip { display: inline-block; margin-left: 8px; font-size: 10px; font-weight: 800; color: #fff; background: #5a9461; padding: 2px 8px; border-radius: 8px; vertical-align: middle; }
.founder-chip { display: inline-block; margin-left: 8px; font-size: 10px; font-weight: 800; color: #7a5b00; background: linear-gradient(135deg, #ffe082, #ffca28); padding: 2px 8px; border-radius: 8px; vertical-align: middle; box-shadow: 0 1px 3px rgba(214,167,0,0.4); }
.btn-admin-toggle { background: #eef1f6; color: #3a4a63; border: none; border-radius: 8px; padding: 7px 10px; font-size: 12px; font-weight: 800; cursor: pointer; transition: 0.15s; }
.btn-admin-toggle.active { background: #5a9461; color: #fff; }
.btn-admin-toggle:active { transform: scale(0.96); }
.review-item { background: #fafafa; border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; }
.review-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.review-stars { font-size: 14px; color: #f5b301; letter-spacing: 1px; }
.review-stars-empty { color: #e0e0e0; }
.review-role { font-size: 11px; color: #999; font-weight: 700; }
.review-comment { font-size: 13px; color: #444; line-height: 1.5; margin: 0; white-space: pre-wrap; word-break: break-word; }
.review-comment.empty { color: #bbb; font-style: italic; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* ==================== 廣告管理 ==================== */
.ad-image-slots { display: flex; gap: 10px; }
.ad-image-slot { position: relative; flex: 1; aspect-ratio: 1; border-radius: 12px; border: 2px dashed #ddd; background: #f5f6f8; display: flex; align-items: center; justify-content: center; overflow: hidden; cursor: pointer; }
.ad-slot-preview { width: 100%; height: 100%; object-fit: cover; }
.ad-slot-empty { font-size: 26px; color: #bbb; font-weight: 300; }
.ad-file-input { display: none; }
.date-range-row { display: flex; align-items: center; gap: 8px; }
.date-range-row .admin-input { flex: 1; }
.date-range-sep { color: #999; font-weight: 700; }
.ad-form-actions { display: flex; gap: 10px; margin-top: 10px; }
.ad-form-actions .btn-submit-broadcast { margin-top: 0; }
.btn-cancel-edit { flex: 1; background: #fff; color: #666; border: 1px solid #ddd; border-radius: 14px; font-size: 14px; font-weight: 800; cursor: pointer; }
.meta-tag.ad-status-active { background: #e8f5e9; color: #2e7d32; }
.meta-tag.ad-status-upcoming { background: #fff8e1; color: #f57f17; }
.meta-tag.ad-status-expired { background: #f5f5f5; color: #999; }
</style>