<template>
  <div class="user-page-container" @touchmove.stop>
    <template v-if="user">
      <section class="profile-section">
        <div class="header-actions">
          <button v-if="isAdmin" class="admin-top-btn" @click="$emit('enter-admin')" title="進入管理後台">
            ⚙️ 管理後台
          </button>
          <button class="icon-btn logout" @click="handleLogout" title="登出">
            <span class="btn-text">登出</span>
          </button>
        </div>
        
        <div class="profile-main">
          <div class="avatar-container">
            <img :src="user.photoURL || DEFAULT_AVATAR" class="avatar-img" />
            <button class="edit-badge" type="button" title="更換大頭貼" aria-label="更換大頭貼">
              <span class="edit-icon">📷</span>
            </button>
          </div>
          <div class="profile-info">
            <h2 class="nickname">{{ user.displayName || '校園用戶' }}</h2>
            <div class="rating-row" v-if="myRating.count > 0">
              <span class="rating-stars">{{ '★'.repeat(Math.round(myRating.avg)) }}<span class="rating-empty">{{ '★'.repeat(5 - Math.round(myRating.avg)) }}</span></span>
              <span class="rating-text">{{ myRating.avg.toFixed(1) }}（{{ myRating.count }} 則評價）</span>
            </div>
            <div class="rating-row none" v-else>
              <span class="rating-text">尚無交易評價</span>
            </div>
            <div class="uid-tag">
              <span class="label">UID</span>
              <span class="value">{{ user.uid.substring(0, 8) }}</span>
            </div>
          </div>
        </div>
      </section>

      <nav class="history-tabs-container">
        <div class="history-tabs">
          <div class="tab-item" :class="{ active: currentTab === 'fav' }" @click="currentTab = 'fav'">
            喜愛
          </div>
          <div class="tab-item" :class="{ active: currentTab === 'bought' }" @click="currentTab = 'bought'">
            已買商品
          </div>
          <div class="tab-item" :class="{ active: currentTab === 'sold' }" @click="currentTab = 'sold'">
            我的賣場
          </div>
          <div class="tab-indicator" :style="indicatorStyle"></div>
        </div>
      </nav>

      <div class="items-scroll-area">
        <div v-if="displayItems.length > 0" class="user-product-grid">
          <div v-for="item in displayItems" :key="item.id" class="modern-card">
            <div class="card-media">
              <img v-if="item.url" :src="item.url" class="card-img" />
              <div v-else class="color-placeholder" :style="{ background: item.color || '#f1f0ee' }"></div>
              
              <div class="status-overlay" :class="overlayClass(item)">
                {{ overlayText(item) }}
              </div>
            </div>

            <div class="card-content">
              <h3 class="product-title">{{ item.name }}</h3>
              <span class="category-tag" v-if="item.category">{{ item.category }}</span>
              <div class="price-row">
                <span class="currency">$</span>
                <span class="amount">{{ item.price }}</span>
              </div>

              <div class="card-mgmt-bar" v-if="currentTab === 'sold'">
                <button class="mgmt-bar-btn edit-btn" @click.stop="openEdit(item)">
                  <span>編輯項目</span>
                </button>
                <button class="mgmt-bar-btn delete-btn" @click.stop="deleteProduct(item.id, item.name)">
                  <span>下架</span>
                </button>
              </div>

              <div class="card-mgmt-bar" v-else-if="currentTab === 'fav'">
                <button class="mgmt-bar-btn trade-btn" @click.stop="openTrade(item)">
                  <span>發起交易</span>
                </button>
                <button class="mgmt-bar-btn unfav-btn" @click.stop="removeFavorite(item)">
                  <span>移除</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="modern-empty">
          <div class="empty-visual"><div class="empty-box">📦</div></div>
          <h3 class="empty-title">{{ currentTab === 'fav' ? '還沒有收藏' : '這裡空空的...' }}</h3>
          <p class="empty-desc">{{ currentTab === 'fav' ? '在首頁看到心動的商品，點愛心收藏起來吧！' : '開始您的校園交易之旅吧！' }}</p>
        </div>
        <div class="bottom-spacer"></div>
      </div>
    </template>

    <template v-else>
      <div class="login-modern-wrapper">
        <div class="login-bg-deco">
          <div class="circle c1"></div>
          <div class="circle c2"></div>
        </div>
        
        <div class="login-card-v2">
          <div class="brand-area">
            <div class="logo-box">
              <span class="logo-y">Y</span>
            </div>
            <h1 class="brand-h1">YaBuy</h1>
            <p class="brand-p">亞洲大學專屬校園二手平台</p>
          </div>

          <div class="action-area">
            <button id="google-signin-btn" name="google-signin" class="google-signin-btn" @click="handleLogin">
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" class="g-svg" width="16" height="16"/>
              <span>使用 Google 帳號登入</span>
            </button>
            <p class="auth-hint">安全加密登入，保護您的校園帳號</p>
          </div>
        </div>

        <div class="login-footer">
          <p>&copy; 2026 YaBuy Team @ Asia University</p>
        </div>
      </div>
    </template>

    <Transition name="sheet-up">
      <div v-if="isEditing" class="modern-sheet-overlay" @click.self="isEditing = false">
        <div class="modern-sheet enhanced">
          <div class="sheet-handle"></div> <header class="modal-header">
            <div class="title-group">
              <h3>編輯商品</h3>
              <span class="sub-title">修改您的校園上架資訊</span>
            </div>
            <button class="close-modal-btn" @click="isEditing = false">✕</button>
          </header>
          
          <div class="modal-body-scroll">
            <section class="form-section">
              <div class="section-label">基本資訊</div>
              <div class="input-card">
                <div class="input-row">
                  <span class="input-icon">🏷️</span>
                  <input v-model="editForm.name" placeholder="商品名稱" class="ghost-input" @touchstart.stop />
                </div>
                <div class="divider"></div>
                <div class="input-row">
                  <span class="input-icon">💰</span>
                  <input v-model.number="editForm.price" type="number" placeholder="預售價格" class="ghost-input" @touchstart.stop />
                </div>
              </div>
            </section>

            <section class="form-section">
              <div class="section-label">分類設定</div>
              <div class="category-card">
                <div class="mode-bar-modern" :class="{ 'is-book': editForm.isBook }" @click="toggleBookMode">
                  <div class="mode-info">
                    <span class="mode-title">{{ editForm.isBook ? '📖 教科書模式' : '📦 一般商品模式' }}</span>
                    <span class="mode-desc">切換以使用亞大系所精準配對</span>
                  </div>
                  <div class="mini-toggle-v2" :class="{ active: editForm.isBook }"></div>
                </div>
                <div class="category-selection-area">
                  <Transition name="fade" mode="out-in">
                    <div v-if="editForm.isBook" class="book-path-box" @click.stop="openBookPicker">
                      <span v-if="editForm.dept">{{ editForm.college }} / {{ editForm.dept }}{{ editForm.subject ? ' / ' + editForm.subject : '' }}</span>
                      <span v-else class="placeholder">📍 點擊配對校內學科...</span>
                    </div>
                    <div v-else class="pill-grid-modern">
                      <div v-for="cat in productCategories" :key="cat" 
                           class="modern-pill" :class="{ active: editForm.category === cat }" @click="editForm.category = cat">{{ cat }}</div>
                    </div>
                  </Transition>
                </div>
              </div>
            </section>

            <section class="form-section">
              <div class="section-label">詳細說明</div>
              <div class="textarea-card">
                <textarea v-model="editForm.desc" placeholder="補充商品細節..." rows="3" @touchstart.stop></textarea>
              </div>
            </section>
          </div>

          <footer class="modal-footer-modern">
            <button class="btn-cancel-v2" @click="isEditing = false">取消修改</button>
            <button class="btn-glossy" :disabled="editForm.isBook && !editForm.dept" @click="handleUpdate">儲存修改</button>
          </footer>
        </div>
      </div>
    </Transition>

    <Teleport to="body">
      <Transition name="picker-up">
        <div v-if="showBookPicker" class="picker-overlay-fixed" @click.self="showBookPicker = false">
          <div class="picker-window-modern">
            <div class="sheet-handle"></div>
            <header class="picker-header"><h3>校內學科配對</h3><button @click="showBookPicker = false">✕</button></header>
            <div class="picker-scroll-content">
              <div class="p-group">
                <label>1. 選擇學院</label>
                <div class="chip-flex">
                  <div v-for="c in subjectData" :key="c.college" class="mini-chip" :class="{ active: tempCollege === c.college }" @click="selectTempCollege(c)">{{ c.college }}</div>
                </div>
              </div>
              <div v-if="tempCollege" class="p-group">
                <label>2. 選擇系所</label>
                <div class="chip-flex">
                  <div v-for="d in tempDepts" :key="d.name" class="mini-chip" :class="{ active: tempDept === d.name }" @click="selectTempDept(d)">{{ d.name }}</div>
                </div>
              </div>
              <div v-if="tempDept && tempSubjects.length > 0" class="p-group">
                <label>3. 選擇科目</label>
                <div class="chip-flex">
                  <div v-for="s in tempSubjects" :key="s" class="mini-chip" :class="{ active: tempSubject === s }" @click="tempSubject = s">{{ s }}</div>
                </div>
              </div>
            </div>
            <button class="p-confirm-btn-modern" :disabled="!tempDept || (tempSubjects.length > 0 && !tempSubject)" @click="confirmCategory">確認選擇</button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <TradeModal
      v-if="selectedProduct"
      :product="selectedProduct"
      @close="selectedProduct = null"
      @submit="handleTradeRequest"
    />
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted, watch } from 'vue'; 
import { auth, googleProvider, db } from '@/firebase'; 
import { toast, confirmDialog } from './toast.js';

const DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23d1d9c6'/%3E%3Ccircle cx='50' cy='40' r='17' fill='%23ffffff'/%3E%3Cpath d='M22 84c0-16 12-27 28-27s28 11 28 27z' fill='%23ffffff'/%3E%3C/svg%3E";
import { signInWithPopup, signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot, orderBy, deleteDoc, doc, updateDoc, getDoc, getDocs, setDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { subjectData } from './Subject.js'; 
import { productCategories } from './Categories.js';
import TradeModal from './TradeModal.vue';

const props = defineProps({ user: Object });
const emit = defineEmits(['enter-admin']);

const isAdmin = ref(false); 
const currentTab = ref('sold'); 
const mySoldItems = ref([]);   
const myBoughtItems = ref([]); 
const myFavorites = ref([]);
let unsubscribeSold = null;
let unsubscribeBought = null;
let unsubscribeFav = null;

// 交易彈窗（沿用 Heart.vue 的 TradeModal 流程）
const selectedProduct = ref(null);

const isEditing = ref(false);
const editForm = ref({ id: '', name: '', price: '', desc: '', isBook: false, category: '', college: '', dept: '', subject: '' });

const checkAdminStatus = async () => {
  if (!props.user || !auth.currentUser) {
    isAdmin.value = false;
    return;
  }
  try {
    const tokenResult = await auth.currentUser.getIdTokenResult(true);
    isAdmin.value = tokenResult.claims.admin === true;
  } catch (err) {
    console.error("權限檢查失敗", err);
    isAdmin.value = false;
  }
};

const handleLogin = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const loggedInUser = result.user;

    const userRef = doc(db, 'users', loggedInUser.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      await setDoc(userRef, {
        id: loggedInUser.uid,
        displayName: loggedInUser.displayName || '校園用戶',
        email: loggedInUser.email,
        photoURL: loggedInUser.photoURL || '',
        status: 'active', 
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp()
      });
      console.log("✅ 新使用者資料已成功寫入資料庫！");
    } else {
      await updateDoc(userRef, {
        lastLogin: serverTimestamp(),
        photoURL: loggedInUser.photoURL 
      });
      console.log("✅ 既有使用者，已更新登入時間！");
    }

  } catch (error) {
    console.error("登入出錯:", error.message);
    if (error.code === 'auth/popup-blocked') {
      toast("請允許瀏覽器彈出視窗以完成 Google 登入。");
    }
  }
};

const handleLogout = () => signOut(auth);

const fetchMyRecords = () => {
  if (unsubscribeSold) unsubscribeSold();
  if (unsubscribeBought) unsubscribeBought();
  if (unsubscribeFav) unsubscribeFav();
  if (!props.user) return;

  // 喜愛清單（與 Heart.vue 同一份 favorites 資料）
  const qFav = query(collection(db, "favorites"), where("userId", "==", props.user.uid), orderBy("createdAt", "desc"));
  unsubscribeFav = onSnapshot(qFav, (s) => {
    myFavorites.value = s.docs.map(d => ({ id: d.id, ...d.data() }));
  }, (err) => { console.error("[User] 讀取收藏失敗（檢查索引/規則）：", err); });

  const qSold = query(collection(db, "products"), where("sellerId", "==", props.user.uid), orderBy("createdAt", "desc"));
  unsubscribeSold = onSnapshot(qSold, (s) => {
    mySoldItems.value = s.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.status === 'sold' ? 1 : 0) - (b.status === 'sold' ? 1 : 0));
  }, (err) => { console.error("[User] 讀取賣場失敗（檢查索引/規則）：", err); });

  const qBought = query(collection(db, "orders"), where("buyerId", "==", props.user.uid), orderBy("createdAt", "desc"));
  unsubscribeBought = onSnapshot(qBought, (s) => {
    myBoughtItems.value = s.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(o => o.status === 'completed')
      .map(o => ({
        id:       o.id,
        name:     o.productName || '已購商品',
        url:      o.productImage || '',
        price:    o.finalPrice ?? o.productPrice ?? 0,
        category: '已成交',
        color:    '#acc6b1'
      }));
  }, (err) => { console.error("[User] 讀取購買紀錄失敗（檢查索引/規則）：", err); });
};

const myRating = ref({ avg: 0, count: 0 });
const fetchMyRating = async () => {
  if (!props.user?.uid) return;
  try {
    const snap = await getDoc(doc(db, 'users', props.user.uid));
    const d = snap.exists() ? snap.data() : {};
    const count = Number(d.ratingCount) || 0;
    const sum = Number(d.ratingSum) || 0;
    myRating.value = count > 0 ? { avg: sum / count, count } : { avg: 0, count: 0 };
  } catch (e) {
    console.error('[User] 讀取評價失敗：', e);
    myRating.value = { avg: 0, count: 0 };
  }
};

watch(() => props.user, (newVal) => { 
  if (newVal && newVal.uid) {
    checkAdminStatus();
    fetchMyRecords(); 
    fetchMyRating();
  } else {
    isAdmin.value = false;
    mySoldItems.value = [];
    myBoughtItems.value = [];
    myFavorites.value = [];
    selectedProduct.value = null;
    myRating.value = { avg: 0, count: 0 };
  }
}, { immediate: true });

const openEdit = (item) => {
  editForm.value = { id: item.id, name: item.name, price: item.price, desc: item.desc || '', isBook: item.isBook || false, category: item.category || '', college: item.college || '', dept: item.dept || '', subject: item.subject || '' };
  isEditing.value = true;
};

const handleUpdate = async () => {
  try {
    const updateData = { 
      name: editForm.value.name, 
      price: Number(editForm.value.price), 
      desc: editForm.value.desc, 
      isBook: Boolean(editForm.value.isBook), 
      category: editForm.value.isBook ? '教科書' : (editForm.value.category || '未分類'), 
      college: editForm.value.college || '', 
      dept: editForm.value.dept || '', 
      subject: editForm.value.subject || '' 
    };
    await updateDoc(doc(db, "products", editForm.value.id), updateData);
    toast("✅ 雲端同步成功！");
    isEditing.value = false;
  } catch (err) { toast(`❌ 更新失敗：${err.message}`); }
};

const deleteProduct = async (id, name) => { if (await confirmDialog(`確定下架 ${name}？`)) await deleteDoc(doc(db, "products", id)); };

const showBookPicker = ref(false);
const tempCollege = ref('');
const tempDept = ref('');
const tempSubject = ref('');
const tempDepts = computed(() => { if (!tempCollege.value) return []; const c = subjectData.find(item => item.college === tempCollege.value); return c ? (c.departments || []) : []; });
// ✅ 修復：處理 departments 內無 subjects 陣列的情況
const tempSubjects = computed(() => { if (!tempDept.value) return []; const d = tempDepts.value.find(item => item.name === tempDept.value); return d ? (d.subjects || []) : []; });
const selectTempCollege = (c) => { tempCollege.value = c.college; tempDept.value = ''; tempSubject.value = ''; };
const selectTempDept = (d) => { tempDept.value = d.name; tempSubject.value = ''; };
const confirmCategory = () => { editForm.value.college = tempCollege.value; editForm.value.dept = tempDept.value; editForm.value.subject = tempSubject.value; showBookPicker.value = false; };
const openBookPicker = () => {
  tempCollege.value = editForm.value.college || '';
  tempDept.value = editForm.value.dept || '';
  tempSubject.value = editForm.value.subject || '';
  showBookPicker.value = true;
};
const toggleBookMode = () => { editForm.value.isBook = !editForm.value.isBook; editForm.value.category = editForm.value.isBook ? '教科書' : ''; if (editForm.value.isBook && !editForm.value.dept) showBookPicker.value = true; };

onUnmounted(() => { unsubscribeSold?.(); unsubscribeBought?.(); unsubscribeFav?.(); });

const displayItems = computed(() => {
  if (currentTab.value === 'fav')  return myFavorites.value;
  if (currentTab.value === 'sold') return mySoldItems.value;
  return myBoughtItems.value;
});

// 三格滑桿：喜愛(0) / 已買商品(1) / 我的賣場(2)
const TAB_ORDER = ['fav', 'bought', 'sold'];
const indicatorStyle = computed(() => ({
  transform: `translateX(${TAB_ORDER.indexOf(currentTab.value) * 100}%)`
}));

const overlayClass = (item) => {
  if (currentTab.value === 'fav')    return 'fav';
  if (currentTab.value === 'bought') return 'bought';
  return item.status === 'sold' ? 'sold' : 'active';
};
const overlayText = (item) => {
  if (currentTab.value === 'fav')    return '收藏中';
  if (currentTab.value === 'bought') return '已入庫';
  return item.status === 'sold' ? '已售出' : '販售中';
};

// ── 收藏卡：發起交易（沿用 Heart.vue 的守門與欄位對應） ──
const openTrade = (fav) => {
  if (!fav.productId) {
    toast('此收藏資料較舊、缺少商品資訊，請移除後到首頁重新收藏一次。');
    return;
  }
  selectedProduct.value = {
    id:         fav.productId,
    name:       fav.name,
    price:      fav.price,
    url:        fav.url || '',
    color:      fav.color || '#acc6b1',
    sellerId:   fav.sellerId || '',
    sellerName: fav.sellerName || '校園賣家'
  };
};

const handleTradeRequest = async (tradeInfo) => {
  if (!auth.currentUser) return;
  try {
    await addDoc(collection(db, "orders"), {
      ...tradeInfo,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } catch (e) {
    console.error("[User] 訂單寫入失敗:", e);
    toast("發送失敗，請稍後再試。");
  }
};

const removeFavorite = async (fav) => {
  const ok = await confirmDialog(`確定要將「${fav.name}」從喜愛清單移除嗎？`);
  if (!ok) return;
  try {
    await deleteDoc(doc(db, "favorites", fav.id));
    toast("已從喜愛清單移除。");
  } catch (e) {
    console.error("[User] 移除收藏失敗:", e);
    toast("移除失敗，請稍後再試。");
  }
};
</script>

<style scoped>
/* 基礎樣式保持不變 */
.user-page-container { position: absolute; inset: 0; display: flex; flex-direction: column; background-color: #f8faf5; overflow: hidden; font-family: -apple-system, sans-serif; }
.profile-section { padding: 16px 24px 14px; background: linear-gradient(180deg, #d1d9c6 0%, #f8faf5 100%); display: flex; flex-direction: column; gap: 14px; flex-shrink: 0; }

.header-actions { display: flex; justify-content: flex-end; align-items: center; gap: 12px; }
.admin-top-btn { background: #333; color: #fff; padding: 8px 16px; border-radius: 20px; font-size: 13px; font-weight: 700; border: none; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.1); transition: 0.2s; }
.admin-top-btn:active { transform: scale(0.95); }
.logout { background: rgba(255,255,255,0.6); padding: 8px 16px; border-radius: 20px; font-size: 13px; font-weight: 600; color: #555; border: 1px solid rgba(0,0,0,0.05); cursor: pointer; transition: 0.2s; }
.logout:active { background: rgba(255,255,255,0.9); }

.profile-main { display: flex; align-items: center; gap: 16px; }
.avatar-container { position: relative; flex-shrink: 0; }
.avatar-img { width: 72px; height: 72px; border-radius: 24px; object-fit: cover; border: 4px solid #fff; box-shadow: 0 10px 20px rgba(0,0,0,0.08); display: block; }
.edit-badge { position: absolute; bottom: -6px; right: -6px; width: 30px; height: 30px; border-radius: 50%; background: #333; border: 3px solid #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; box-shadow: 0 4px 10px rgba(0,0,0,0.2); transition: 0.2s; }
.edit-badge:active { transform: scale(0.9); }
.edit-icon { font-size: 14px; line-height: 1; }

.profile-info { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.nickname { font-size: 22px; font-weight: 850; color: #2c3e50; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uid-tag { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; background: rgba(0,0,0,0.05); padding: 4px 10px 4px 4px; border-radius: 10px; }
.rating-row { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; }
.rating-row.none .rating-text { color: #bbb; }
.rating-stars { font-size: 14px; color: #f5b301; letter-spacing: 1px; }
.rating-empty { color: #e0e0e0; }
.rating-text { font-size: 12px; font-weight: 700; color: #888; }
.uid-tag .label { font-size: 10px; font-weight: 800; color: #fff; background: #7a8a6f; padding: 2px 7px; border-radius: 7px; letter-spacing: 0.5px; }
.uid-tag .value { font-size: 12px; font-weight: 700; color: #555; letter-spacing: 0.5px; }


.history-tabs-container { padding: 0 24px; flex-shrink: 0; }
.history-tabs { position: relative; background: rgba(0,0,0,0.04); height: 48px; border-radius: 16px; display: flex; padding: 4px; }
.tab-item { flex: 1; z-index: 2; display: flex; justify-content: center; align-items: center; font-size: 13px; font-weight: 700; color: #7f8c8d; cursor: pointer; white-space: nowrap; transition: color 0.2s; }
.tab-item.active { color: #fff; }
.tab-indicator { position: absolute; top: 4px; left: 4px; width: calc(33.333% - 2.667px); height: calc(100% - 8px); background: #333; border-radius: 12px; transition: 0.3s cubic-bezier(0.4, 0, 0.2, 1); }

.items-scroll-area { flex: 1; overflow-y: auto; padding: 20px 20px 140px; }
.user-product-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px 14px; }
.modern-card { background: #fff; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06); display: flex; flex-direction: column; }
.card-media { position: relative; aspect-ratio: 1/1; overflow: hidden; background: #f3f3f3; }
.card-img { width: 100%; height: 100%; object-fit: cover; }
.color-placeholder { width: 100%; height: 100%; }
.status-overlay { position: absolute; top: 10px; left: 10px; padding: 4px 10px; border-radius: 8px; font-size: 10px; font-weight: 800; backdrop-filter: blur(6px); }
.status-overlay.bought { background: rgba(90,148,97,0.15); color: #3d7a45; }
.status-overlay.active { background: rgba(90,148,97,0.15); color: #3d7a45; }
.status-overlay.sold { background: rgba(0,0,0,0.55); color: #fff; }
.status-overlay.fav { background: rgba(231,76,60,0.14); color: #c0392b; }

.card-content { padding: 14px 14px 16px; display: flex; flex-direction: column; gap: 8px; flex: 1; }
.product-title { font-size: 14px; font-weight: 800; color: #2c3e50; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.category-tag { align-self: flex-start; font-size: 11px; font-weight: 700; color: #7a8a6f; background: #eef2e9; padding: 3px 10px; border-radius: 8px; }
.price-row { display: flex; align-items: baseline; gap: 2px; margin-top: auto; padding-top: 4px; }
.currency { font-size: 13px; font-weight: 800; color: #333; }
.amount { font-size: 21px; font-weight: 900; color: #333; line-height: 1; }

.card-mgmt-bar { display: flex; gap: 8px; margin-top: 14px; padding-top: 12px; border-top: 1px solid #eef0eb; }
.mgmt-bar-btn { flex: 1; height: 34px; border-radius: 10px; border: none; font-size: 11px; font-weight: 800; cursor: pointer; transition: 0.2s; }
.edit-btn { background: #f1f0ee; color: #666; }
.delete-btn { background: #fff1f0; color: #e74c3c; }

/* 喜愛卡片：發起交易 / 移除收藏 */
.trade-btn { flex: 1.6; background: #2f4a3a; color: #fff; }
.trade-btn:hover { background: #3d5f4a; }
.unfav-btn { background: #f1f0ee; color: #888; }
.unfav-btn:hover { background: #e8e6e3; }
.mgmt-bar-btn:active { transform: scale(0.96); }

.login-modern-wrapper { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; align-items: center; background: #f8faf5; padding: 30px; }
.login-bg-deco { position: absolute; width: 100%; height: 100%; overflow: hidden; z-index: 1; }
.circle { position: absolute; border-radius: 50%; filter: blur(60px); }
.c1 { width: 250px; height: 250px; background: rgba(172, 198, 177, 0.4); top: -50px; right: -50px; }
.c2 { width: 300px; height: 300px; background: rgba(162, 178, 247, 0.2); bottom: -100px; left: -100px; }
.login-card-v2 { width: 100%; max-width: 360px; background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(20px); border-radius: 40px; padding: 40px 30px; text-align: center; z-index: 10; box-shadow: 0 20px 50px rgba(0,0,0,0.05); }
.logo-box { width: 70px; height: 70px; background: #333; border-radius: 22px; margin: 0 auto 20px; display: flex; justify-content: center; align-items: center; }
.logo-y { color: #fff; font-size: 32px; font-weight: 900; }
.google-signin-btn { width: 100%; height: 56px; background: #fff; border: 1px solid #ddd; border-radius: 18px; display: flex; justify-content: center; align-items: center; gap: 12px; font-weight: 700; cursor: pointer; transition: 0.2s; }
.google-signin-btn:active { background: #f9f9f9; transform: scale(0.98); }

.modern-sheet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  display: flex;
  justify-content: center;
  align-items: flex-end; 
  z-index: 2000;
  overflow: hidden; 
}

.modern-sheet.enhanced {
  background: #fcfcfd;
  width: 100%;
  max-width: 500px; 
  max-height: 90vh; 
  border-radius: 30px 30px 0 0; 
  display: flex;
  flex-direction: column;
  box-shadow: 0 -10px 40px rgba(0,0,0,0.15);
  animation: sheet-slide-in 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes sheet-slide-in {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

.sheet-handle {
  width: 40px;
  height: 5px;
  background: #ddd;
  border-radius: 3px;
  margin: 12px auto 0;
  flex-shrink: 0;
}

.modal-header {
  padding: 16px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(0,0,0,0.03);
  flex-shrink: 0;
}
.title-group h3 { font-size: 18px; font-weight: 850; color: #333; margin: 0; }
.title-group .sub-title { font-size: 12px; color: #999; font-weight: 600; }
.close-modal-btn { background: none; border: none; font-size: 20px; color: #999; cursor: pointer; padding: 4px; }

.modal-body-scroll {
  flex: 1; 
  overflow-y: auto; 
  padding: 20px 24px 30px; 
  -webkit-overflow-scrolling: touch; 
}

.form-section { margin-bottom: 20px; }
.section-label { font-size: 12px; font-weight: 800; color: #aaa; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; margin-left: 8px; }

.input-card, .category-card, .textarea-card {
  background: #fff;
  border-radius: 20px;
  border: 1px solid rgba(0,0,0,0.04);
  overflow: hidden;
  box-shadow: 0 4px 15px rgba(0,0,0,0.02);
}
.input-row { display: flex; align-items: center; padding: 16px; gap: 12px; }
.input-icon { font-size: 18px; }
.ghost-input { flex: 1; border: none; outline: none; font-size: 15px; font-weight: 600; color: #333; background: transparent; width: 100%; }
.divider { height: 1px; background: rgba(0,0,0,0.04); margin: 0 16px; }

.mode-bar-modern {
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f9f9fb;
  transition: 0.3s;
  cursor: pointer;
}
.mode-bar-modern.is-book { background: #fff8e1; }
.mode-title { display: block; font-size: 14px; font-weight: 700; color: #333; }
.mode-desc { display: block; font-size: 11px; color: #999; font-weight: 600; margin-top: 2px; }

.mini-toggle-v2 { width: 40px; height: 22px; background: #ddd; border-radius: 20px; position: relative; transition: 0.4s; flex-shrink: 0; }
.mini-toggle-v2.active { background: #acc6b1; }
.mini-toggle-v2::after { content: ''; position: absolute; left: 3px; top: 3px; width: 16px; height: 16px; background: #fff; border-radius: 50%; transition: 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
.mini-toggle-v2.active::after { left: 21px; }

.category-selection-area { padding: 16px; border-top: 1px solid rgba(0,0,0,0.03); }
.book-path-box { background: #fff; border: 1px dashed #e6c17a; border-radius: 12px; padding: 12px; font-size: 13px; color: #c69c4f; font-weight: 700; text-align: center; cursor: pointer; }
.book-path-box .placeholder { color: #e6c17a; opacity: 0.8; }
.pill-grid-modern { display: flex; flex-wrap: wrap; gap: 8px; }
.modern-pill { padding: 8px 16px; background: #f1f0ee; border-radius: 12px; font-size: 12px; font-weight: 700; color: #666; cursor: pointer; border: 1px solid transparent; }
.modern-pill.active { background: #333; color: #fff; border-color: #333; }

.textarea-card textarea { width: 100%; padding: 16px; border: none; outline: none; font-size: 14px; font-weight: 600; color: #333; font-family: inherit; resize: none; box-sizing: border-box; display: block; }

.modal-footer-modern {
  padding: 12px 24px 20px; 
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  border-top: 1px solid rgba(0,0,0,0.03);
  background: #fcfcfd;
  flex-shrink: 0;
  padding-bottom: calc(12px + env(safe-area-inset-bottom)); 
}
.btn-text, .btn-cancel-v2 { padding: 12px 20px; background: none; border: none; font-size: 14px; font-weight: 700; color: #666; cursor: pointer; border-radius: 12px; }
.btn-cancel-v2 { background: #f1f0ee; color: #555; }
.btn-glossy { padding: 12px 28px; background: #333; color: #fff; border: none; border-radius: 16px; font-weight: 850; font-size: 14px; cursor: pointer; transition: 0.2s; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
.btn-glossy:disabled { background: #ddd; color: #aaa; box-shadow: none; cursor: not-allowed; }

.sheet-up-enter-active, .sheet-up-leave-active { transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
.sheet-up-enter-active .modern-sheet, .sheet-up-leave-active .modern-sheet { transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1); }

.sheet-up-enter-from { background: rgba(0,0,0,0); }
.sheet-up-enter-from .modern-sheet { transform: translateY(100%); }

.sheet-up-leave-to { background: rgba(0,0,0,0); }
.sheet-up-leave-to .modern-sheet { transform: translateY(100%); }

.picker-window-modern { max-height: 85vh;  }

/* 學科選擇器（補上遺失的樣式，z-index 高於編輯視窗 2000） */
.picker-overlay-fixed {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(6px);
  display: flex;
  justify-content: center;
  align-items: flex-end;
  z-index: 3000;
}
.picker-window-modern {
  width: 100%;
  max-width: 500px;
  max-height: 85vh;
  background: #fff;
  border-radius: 24px 24px 0 0;
  padding: 12px 20px 24px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 -8px 30px rgba(0,0,0,0.15);
  animation: pickerSlideUp 0.28s ease;
}
@keyframes pickerSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
.picker-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.picker-header h3 { font-size: 17px; font-weight: 800; color: #2c3e50; margin: 0; }
.picker-header button { background: none; border: none; font-size: 18px; color: #999; cursor: pointer; padding: 4px 8px; }
.picker-scroll-content { overflow-y: auto; flex: 1; padding: 4px 0; }
.p-group { margin-bottom: 18px; }
.p-group label { display: block; font-size: 13px; font-weight: 700; color: #888; margin-bottom: 8px; }
.chip-flex { display: flex; flex-wrap: wrap; gap: 8px; }
.mini-chip { padding: 8px 14px; background: #f2f4f2; border-radius: 20px; font-size: 13px; font-weight: 700; color: #555; cursor: pointer; transition: 0.15s; }
.mini-chip.active { background: #5a9461; color: #fff; }
.p-confirm-btn-modern { margin-top: 12px; width: 100%; padding: 14px; background: #333; color: #fff; border: none; border-radius: 16px; font-size: 15px; font-weight: 800; cursor: pointer; }
.p-confirm-btn-modern:disabled { background: #ccc; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.bottom-spacer { height: 100px; }
</style>