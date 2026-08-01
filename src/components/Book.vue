<template>
  <div class="book-page-container" @touchmove.stop>
    <div class="filter-section">
      <div class="filter-row horizontal-scroll">
        <div 
          class="filter-pill" 
          :class="{ active: selectedCollege === '全部' }"
          @click="resetToAll"
        >
          全部
        </div>
        
        <div 
          v-for="c in subjectData" :key="c.college" 
          class="filter-pill" :class="{ active: selectedCollege === c.college }"
          @click="selectCollege(c)"
        >
          {{ c.college }}
        </div>
      </div>

      <Transition name="fade-slide">
        <div v-if="selectedCollege !== '全部'" class="sub-filter-group">
          <div class="filter-row horizontal-scroll" v-if="currentDepartments.length">
            <div 
              v-for="d in currentDepartments" :key="d.name" 
              class="filter-pill dept-pill" :class="{ active: selectedDept === d.name }"
              @click="selectDept(d)"
            >
              {{ d.name }}
            </div>
          </div>

          <div class="filter-row horizontal-scroll" v-if="currentSubjects.length">
            <div 
              v-for="s in currentSubjects" :key="s" 
              class="filter-pill sub-pill" :class="{ active: selectedSubject === s }"
              @click="selectedSubject = s"
            >
              {{ s }}
            </div>
          </div>
        </div>
      </Transition>
    </div>

    <div class="book-grid-container">
      <div v-if="loading" class="loading-state">
        <div class="mini-radar"></div>
        <p>正在搜尋亞大教科書...</p>
      </div>

      <div v-else-if="filteredBooks.length > 0" class="product-grid">
        <div 
          v-for="book in filteredBooks" 
          :key="book.id" 
          class="book-item" 
          @click="openTrade(book)"
        >
          <div class="book-cover-box" :style="{ backgroundColor: book.color || '#f1f0ee' }">
            <div v-if="isOwnProduct(book.sellerId)" class="own-product-tag">
              我的商品
            </div>

            <div class="tag">{{ book.subject || book.dept || '教科書' }}</div>
            <img :src="book.url" class="book-img" v-if="book.url" />
            <div v-else class="book-placeholder">📚</div>
            
            <div v-if="isNewProduct(book.createdAt)" class="new-dot">NEW</div>
          </div>
          <div class="book-info">
            <div class="book-price">${{ book.price }}</div>
            <div class="book-title">{{ book.name }}</div>
            <div class="seller-label">👤 {{ isOwnProduct(book.sellerId) ? '我 (賣家)' : (book.sellerName || '校園賣家') }}</div>
          </div>
        </div>
      </div>

      <div v-else class="empty-state">
        <div class="empty-icon">📖</div>
        <p>目前此分類下沒有二手書<br><span>換個科目看看，或自己上傳一本吧！</span></p>
      </div>
      
      <div class="bottom-spacer"></div>
    </div>

    <TradeModal 
      v-if="selectedProduct" 
      :product="selectedProduct" 
      @close="selectedProduct = null"
      @submit="handleTradeRequest"
    />

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { db, auth } from '@/firebase';
import { collection, query, where, onSnapshot, orderBy, addDoc, serverTimestamp } from 'firebase/firestore';
import { subjectData } from './Subject.js'; 
import TradeModal from './TradeModal.vue';
import { blockUnverifiedForTrade } from './verify.js';

// --- 狀態管理 ---
const books = ref([]);
const loading = ref(true);
const selectedProduct = ref(null);
let unsubscribe = null;

const selectedCollege = ref('全部');
const selectedDept = ref('');
const selectedSubject = ref('');

// --- 核心過濾邏輯 ---
const syncTextbooks = () => {
  loading.value = true;
  const q = query(
    collection(db, "products"),
    where("category", "==", "教科書"),
    where("status", "==", "active"),
    orderBy("createdAt", "desc")
  );

  unsubscribe = onSnapshot(q, (snapshot) => {
    books.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    loading.value = false;
  }, (err) => {
    console.error("[Book] 獲取失敗:", err);
    loading.value = false;
  });
};

const isOwnProduct = (sellerId) => {
  return auth.currentUser && auth.currentUser.uid === sellerId;
};

// --- 計算屬性 ---
const currentDepartments = computed(() => {
  if (selectedCollege.value === '全部') return [];
  const college = subjectData.find(c => c.college === selectedCollege.value);
  return college ? college.departments : [];
});

const currentSubjects = computed(() => {
  if (selectedCollege.value === '全部') return [];
  const dept = currentDepartments.value.find(d => d.name === selectedDept.value);
  return dept?.subjects || [];
});

// ✅ 修復：過濾邏輯支援「沒有科目的科系」
const filteredBooks = computed(() => {
  if (selectedCollege.value === '全部') return books.value;
  return books.value.filter(book => {
    const matchCollege = book.college === selectedCollege.value;
    const matchDept = book.dept === selectedDept.value;
    const matchSubject = currentSubjects.value.length === 0 || book.subject === selectedSubject.value;
    return matchCollege && matchDept && matchSubject;
  });
});

const isNewProduct = (createdAt) => {
  if (!createdAt) return false;
  return (new Date() - createdAt.toDate()) / (1000 * 60 * 60) < 24;
};

const resetToAll = () => {
  selectedCollege.value = '全部';
  selectedDept.value = '';
  selectedSubject.value = '';
};

const selectCollege = (c) => {
  selectedCollege.value = c.college;
  selectedDept.value = c.departments[0]?.name || '';
  selectedSubject.value = c.departments[0]?.subjects?.[0] || '';
};

const selectDept = (d) => {
  selectedDept.value = d.name;
  selectedSubject.value = d.subjects?.[0] || '';
};

const openTrade = async (product) => { 
  if (!auth.currentUser) {
    alert("🔒 系統提示：\n請先前往右下角「會員」頁面登入，才能與賣家進行交易喔！");
    return;
  }
  if (!(await blockUnverifiedForTrade(auth.currentUser, (msg) => alert(msg)))) return;
  selectedProduct.value = product; 
};

const handleTradeRequest = async (tradeInfo) => {
  const user = auth.currentUser;
  if (!user) return;
  if (!(await blockUnverifiedForTrade(user, (msg) => alert(msg)))) return;
  try {
    await addDoc(collection(db, "orders"), {
      ...tradeInfo,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } catch (e) {
    console.error("[Book] 訂單寫入失敗:", e);
    alert("發送失敗，請稍後再試。");
  }
};

onMounted(syncTextbooks);
onUnmounted(() => unsubscribe?.());
</script>

<style scoped>
/* 繼承原本樣式並新增標籤樣式 */
.book-page-container {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; background-color: #f8faf5;
}

.own-product-tag {
  position: absolute; top: 10px; left: 10px;
  background: rgba(51, 51, 51, 0.9);
  backdrop-filter: blur(4px);
  color: #fff;
  font-size: 10px;
  font-weight: 850;
  padding: 4px 10px;
  border-radius: 8px;
  z-index: 20;
  box-shadow: 0 4px 10px rgba(0,0,0,0.2);
}

.filter-section {
  flex-shrink: 0; 
  background-color: rgba(248, 250, 245, 0.8);
  backdrop-filter: blur(10px); 
  padding: 15px 0;
  display: flex; 
  flex-direction: column; 
  gap: 12px; 
  border-bottom: 1px solid rgba(0,0,0,0.03); 
  z-index: 10;
  touch-action: pan-x;
  overscroll-behavior-x: contain;
}

.sub-filter-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.horizontal-scroll { 
  display: flex; 
  overflow-x: auto; 
  /* 🌟 修復：將原本的 padding 移除，改用 gap 和虛擬元素撐開空間，避免截斷 */
  padding: 5px 0; 
  gap: 10px; 
  scrollbar-width: none; 
  touch-action: pan-x;
  overscroll-behavior-x: contain;
}
.horizontal-scroll::-webkit-scrollbar { display: none; }

/* 🌟 修復：在頭尾加上虛擬元素，確保放大時不會被邊界切斷 */
.horizontal-scroll::before,
.horizontal-scroll::after {
  content: '';
  flex-shrink: 0;
  width: 10px; /* 相當於原本的 padding 大小 */
}
.filter-pill {
  flex-shrink: 0; 
  padding: 8px 20px; 
  background: #fff;
  border-radius: 999px; 
  font-size: 13px; 
  font-weight: 800; 
  color: #777; 
  transition: 0.2s cubic-bezier(0.25, 1, 0.5, 1); 
  border: 3px solid #eee; 
  cursor: pointer;
}
.filter-pill.active { 
  background: #333; 
  color: #fff; 
  border-color: #333; 
  transform: scale(1.05); 
}

/* --- 商品網格與狀態區 --- */
.book-grid-container { flex-grow: 1; overflow-y: auto; padding: 20px 16px; }
.product-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px; }
.book-item { background: #fff; border-radius: 24px; overflow: hidden; box-shadow: 0 6px 20px rgba(0,0,0,0.04); cursor: pointer; }

.book-cover-box {
  width: 100%; aspect-ratio: 3/4; background: #f1f0ee;
  position: relative; display: flex; justify-content: center; align-items: center;
}
.book-img { width: 100%; height: 100%; object-fit: cover; }

.tag {
  position: absolute; bottom: 10px; right: 10px; background: rgba(0,0,0,0.6); 
  backdrop-filter: blur(4px); color: #fff; font-size: 9px; font-weight: 800;
  padding: 3px 10px; border-radius: 6px;
}

.book-info { padding: 14px; }
.book-price { font-size: 18px; font-weight: 900; color: #333; }
.book-title {
  font-size: 13px; font-weight: 600; color: #555; margin-top: 4px;
  display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2;
  -webkit-box-orient: vertical; overflow: hidden; height: 2.8em; line-height: 1.4;
}
.seller-label { font-size: 10px; color: #aaa; margin-top: 8px; font-weight: 800; }

.new-dot {
  position: absolute; top: 10px; right: 10px;
  background: #cf847d; color: #fff;
  font-size: 9px; font-weight: 900; letter-spacing: 0.5px;
  padding: 3px 8px; border-radius: 6px;
  z-index: 10;
}

.bottom-spacer { height: 80px; }

.loading-state { text-align: center; color: #acc6b1; font-weight: 800; margin-top: 40px; }
.mini-radar { width: 40px; height: 40px; border: 3px solid #acc6b1; border-radius: 50%; margin: 0 auto 10px; animation: radar 1.5s ease-out infinite; }
@keyframes radar { 0% { transform: scale(0.5); opacity: 1; } 100% { transform: scale(1.5); opacity: 0; } }

.empty-state { text-align: center; margin-top: 60px; color: #777; font-weight: 800; line-height: 1.6; }
.empty-icon { font-size: 40px; margin-bottom: 15px; }
.empty-state span { font-size: 12px; font-weight: 600; color: #aaa; }

.fade-slide-enter-active, .fade-slide-leave-active { transition: all 0.3s ease; }
.fade-slide-enter-from, .fade-slide-leave-to { opacity: 0; transform: translateY(-10px); }
</style>