<template>
  <div class="funnel-fullscreen-scroll" @touchmove.stop>
    
    <div class="inner-content">
      <h1 class="page-title">{{ searchQuery ? '搜尋結果' : '商品總覽' }}</h1>

      <div class="category-filter-bar horizontal-scroll">
        <div 
          v-for="cat in categories" 
          :key="cat" 
          class="filter-pill" 
          :class="{ active: selectedCategory === cat }"
          @click="selectedCategory = cat"
        >
          {{ cat }}
        </div>
      </div>
      
      <div class="product-grid" v-if="filteredProducts.length > 0">
        <div 
          v-for="item in filteredProducts" 
          :key="item.id" 
          class="grid-item" 
          @click="openTrade(item)"
        >
          <div class="item-img-box" :style="{ backgroundColor: item.color }">
            <div v-if="isOwnProduct(item.sellerId)" class="own-product-tag">
              我的商品
            </div>
            
            <img v-if="item.url" :src="item.url" class="item-img" />
          </div>
          <div class="item-info">
            <div class="item-price">${{ item.price }}</div>
            <div class="item-name">{{ item.name }}</div>
            <div class="item-cat-tag">{{ item.category }}</div>
          </div>
        </div>
      </div>

      <div v-else class="search-empty">
        <div class="empty-icon">🔍</div>
        <p v-if="searchQuery">找不到「{{ searchQuery }}」相關商品</p>
        <p v-else>目前此分類下沒有商品</p>
        <button class="clear-hint-btn" @click="resetFilters">重置篩選</button>
      </div>
      
      <div class="scroll-bottom-spacer"></div>
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
import { db, auth } from '@/firebase'; //
import { toast } from './toast.js';
import { collection, query, where, onSnapshot, orderBy, addDoc, serverTimestamp } from 'firebase/firestore';
import TradeModal from './TradeModal.vue';
import { filterCategories } from './Categories.js';

const props = defineProps({
  searchQuery: { type: String, default: '' }
});

const emit = defineEmits(['clear-search']);

// --- 狀態管理 ---
const products = ref([]);
const selectedProduct = ref(null);
const selectedCategory = ref('全部'); // ✅ 預設為全部
const categories = filterCategories; // ✅ 改用全站共用分類（含「全部」），避免各頁不一致
let unsubscribe = null;

const isOwnProduct = (sellerId) => {
  return auth.currentUser && auth.currentUser.uid === sellerId;
};

// --- 資料監聽 ---
onMounted(() => {
  try {
    // ✅ 修正：只抓 status === 'active' 的商品。
    //    原本沒這條件，已售出 / 被下架（status: 'sold' / 其他）的商品仍會出現在搜尋結果。
    //    這組 (status + createdAt) 複合索引與 Home / Book 相同，若那兩頁正常即已存在。
    const q = query(
      collection(db, "products"),
      where("status", "==", "active"),
      orderBy("createdAt", "desc")
    );
    unsubscribe = onSnapshot(q, (snapshot) => {
      const cloudData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      products.value = cloudData;
    }, (error) => {
      console.error("[Funnel] Firestore 監聽錯誤：", error);
    });
  } catch (err) {
    console.error("[Funnel] 啟動連線失敗：", err);
  }
});

onUnmounted(() => {
  if (unsubscribe) unsubscribe();
});

// --- ✅ 核心過濾邏輯 ---
const filteredProducts = computed(() => {
  let list = products.value;

  // 1. 強制過濾掉「教科書/參考書」
  list = list.filter(item => item.category !== '教科書');

  // 2. 根據選取的分類篩選
  if (selectedCategory.value !== '全部') {
    list = list.filter(item => item.category === selectedCategory.value);
  }

  // 3. 根據搜尋文字篩選
  const queryText = props.searchQuery.toLowerCase().trim();
  if (queryText) {
    // ✅ 修正：對缺少 name 的商品防呆，避免 undefined.toLowerCase() 讓整頁崩潰
    list = list.filter(item => (item.name || '').toLowerCase().includes(queryText));
  }

  return list;
});

const resetFilters = () => {
  selectedCategory.value = '全部';
  emit('clear-search');
};

// 🌟 修改：點擊商品前先檢查登入狀態
const openTrade = (product) => { 
  if (!auth.currentUser) {
    toast("🔒 系統提示：\n請先前往右下角「會員」頁面登入，才能與賣家進行交易喔！");
    return;
  }
  selectedProduct.value = product; 
};

const handleTradeRequest = async (tradeInfo) => {
  const user = auth.currentUser;
  if (!user) return;
  try {
    await addDoc(collection(db, "orders"), {
      ...tradeInfo,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } catch (e) {
    console.error("[Funnel] 訂單寫入失敗:", e);
    toast("發送失敗，請稍後再試。");
  }
};
</script>

<style scoped>
.funnel-fullscreen-scroll {
  position: absolute; top: 0; left: 0; right: 0; bottom: 0;
  width: 100%; height: 100%; overflow-y: auto;
  background-color: #d1d9c6;
}
.inner-content { padding: 20px 16px; }
.page-title { font-size: 26px; font-weight: 800; color: #333; margin: 0 0 16px 2px; }

/* ✅ 分類篩選列樣式 */
.category-filter-bar {
  display: flex; gap: 8px; margin-bottom: 20px;
  padding: 4px 2px;
}
.horizontal-scroll { overflow-x: auto; scrollbar-width: none; }
.horizontal-scroll::-webkit-scrollbar { display: none; }

.filter-pill {
  flex-shrink: 0; padding: 8px 16px; background: rgba(255, 255, 255, 0.6);
  border-radius: 999px; font-size: 13px; font-weight: 700; color: #5a6350;
  transition: 0.2s; border: 1px solid rgba(255, 255, 255, 0.3);
}
.filter-pill.active { background: #333; color: #fff; border-color: #333; transform: scale(1.05); }

/* 商品網格 */
.product-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.grid-item { background: #ffffff; border-radius: 20px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 5px 15px rgba(0,0,0,0.05); transition: transform 0.2s; position: relative; }
.grid-item:active { transform: scale(0.96); }

.own-product-tag {
  position: absolute; top: 8px; left: 8px;
  background: rgba(51, 51, 51, 0.9); backdrop-filter: blur(4px);
  color: #fff; font-size: 10px; font-weight: 800; padding: 4px 10px; border-radius: 8px; z-index: 5;
}

.item-img-box { width: 100%; aspect-ratio: 1 / 1; background-color: #f1f0ee; overflow: hidden; position: relative; }
.item-img { width: 100%; height: 100%; object-fit: cover; }

.item-info { padding: 12px; flex-shrink: 0; }
.item-price { font-size: 17px; font-weight: 900; color: #333; }
.item-name { 
  font-size: 12px; color: #666; margin-top: 5px; 
  display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2;-webkit-box-orient: vertical; overflow: hidden; 
  line-height: 1.4; height: 2.8em; 
}
.item-cat-tag {
  display: inline-block; margin-top: 8px; font-size: 9px; 
  background: #f1f0ee; color: #999; padding: 2px 8px; border-radius: 6px; font-weight: 800;
}

.search-empty { text-align: center; padding: 60px 20px; color: #5a6350; }
.empty-icon { font-size: 48px; margin-bottom: 16px; opacity: 0.5; }
.clear-hint-btn { background: #333; color: #fff; border: none; padding: 8px 20px; border-radius: 999px; font-weight: 700; margin-top: 15px; }
.scroll-bottom-spacer { height: 40px; }
</style>