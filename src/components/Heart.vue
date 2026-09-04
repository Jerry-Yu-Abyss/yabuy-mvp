<template>
  <div class="heart-page-wrapper" @touchmove.stop>
    <div class="bg-decoration"></div>

    <header class="glass-header">
      <div class="header-inner">
        <button class="icon-circle-btn" @click="$emit('back-home')" title="返回">
          <span class="icon">✕</span>
        </button>
        <div class="title-group">
          <h2 class="main-title">喜愛清單</h2>
          <span class="sub-count" v-if="favoriteItems.length > 0">{{ favoriteItems.length }} 件心動商品</span>
        </div>
      </div>
    </header>

    <div class="heart-content-area">
      <div v-if="favoriteItems.length === 0" class="empty-hero">
        <div class="hero-icon-box">
          <span class="hero-emoji">❤️</span>
        </div>
        <h3>收藏您的第一份驚喜</h3>
        <p>在校園市集中遇見心動的商品時，點擊愛心將它保存下來。</p>
        <button class="primary-action-btn" @click="$emit('back-home')">開始探索</button>
      </div>

      <div v-else class="grid-layout">
        <TransitionGroup name="list-stagger">
          <div 
            v-for="item in favoriteItems" 
            :key="item.id" 
            class="premium-card"
            @click="openTrade(item)"
          >
            <div class="card-visual">
              <img v-if="item.url" :src="item.url" class="product-img" loading="lazy" />
              <div v-else class="color-placeholder" :style="{ background: item.color || '#f1f0ee' }"></div>
              
              <button class="blur-remove-btn" @click.stop="handleRemoveFavorite(item.id)" title="移除收藏">
                <span class="x-mark">✕</span>
              </button>

              <div class="glass-price-tag">
                <span class="currency">$</span>
                <span class="price-val">{{ item.price }}</span>
              </div>
            </div>
            
            <div class="card-details">
              <h3 class="product-title">{{ item.name }}</h3>
              <div class="seller-line">
                <span class="dot"></span> {{ item.sellerName || '校園賣家' }}
              </div>
            </div>
          </div>
        </TransitionGroup>
      </div>
      
      <div class="bottom-safe-area"></div>
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
import { ref, onMounted, onUnmounted } from 'vue';
import { db, auth } from '@/firebase'; 
import { toast } from './toast.js';
import { blockUnverifiedForTrade } from './verify.js';
import { onAuthStateChanged } from 'firebase/auth'; // ✅ 新增導入
import { collection, query, where, onSnapshot, orderBy, deleteDoc, doc, addDoc, serverTimestamp } from 'firebase/firestore';
import TradeModal from './TradeModal.vue';

defineEmits(['back-home']);

const favoriteItems = ref([]);
const selectedProduct = ref(null);
let unsubscribe = null;

// ✅ 核心修正：接收 user 物件作為參數
const startSyncFavorites = (user) => {
  // 如果已經有監聽器，先關閉舊的
  if (unsubscribe) unsubscribe();

  console.log(`[Heart] 開始同步用戶 ${user.uid} 的收藏清單...`);
  const q = query(
    collection(db, "favorites"),
    where("userId", "==", user.uid),
    orderBy("createdAt", "desc")
  );

  unsubscribe = onSnapshot(q, (snapshot) => {
    favoriteItems.value = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  }, (err) => {
    console.error("[Heart] 監聽失敗：", err);
  });
};

const handleRemoveFavorite = async (favId) => {
  try {
    await deleteDoc(doc(db, "favorites", favId));
  } catch (error) {
    console.error("[Heart] 移除失敗:", error);
  }
};

const openTrade = async (fav) => {
  // ✅ 修正重點：fav.id 是「收藏文件」的 id，不是商品 id。
  //    必須改用 fav.productId 當商品 id，TradeModal 才能正確帶出
  //    productId（成交後自動下架要用）與比對賣家身分。
  if (!fav.productId) {
    // 早期建立、且尚未補上 productId 的舊收藏，無法正確交易
    toast('此收藏資料較舊、缺少商品資訊，請移除後到首頁重新收藏一次。');
    return;
  }
  if (!(await blockUnverifiedForTrade(auth.currentUser, toast))) return;
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
  const user = auth.currentUser;
  if (!user) return;
  if (!(await blockUnverifiedForTrade(user, toast))) return;
  try {
    await addDoc(collection(db, "orders"), {
      ...tradeInfo,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } catch (e) {
    console.error("[Heart] 訂單寫入失敗:", e);
    toast("發送失敗，請稍後再試。");
  }
};

// ✅ 在 Mounted 時啟動 Auth 狀態監聽
onMounted(() => {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      startSyncFavorites(user);
    } else {
      favoriteItems.value = [];
      if (unsubscribe) unsubscribe();
    }
  });
});

onUnmounted(() => {
  if (unsubscribe) unsubscribe();
});
</script>

<style scoped>
/* 樣式保持與原設計一致，並包含 line-clamp 修正 */
.heart-page-wrapper {
  position: absolute; inset: 0;
  background-color: #fcfdfa;
  display: flex; flex-direction: column;
  overflow: hidden;
}

.bg-decoration {
  position: absolute; top: -10%; right: -10%;
  width: 300px; height: 300px;
  background: radial-gradient(circle, rgba(172, 198, 177, 0.2) 0%, rgba(255,255,255,0) 70%);
  filter: blur(40px); z-index: 0;
}

.glass-header {
  position: sticky; top: 0; z-index: 100;
  padding: calc(env(safe-area-inset-top, 0px) + 12px) 24px 20px;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(0, 0, 0, 0.03);
}
.header-inner { display: flex; align-items: center; gap: 20px; }
.icon-circle-btn {
  width: 44px; height: 44px; border-radius: 50%; border: none;
  background: #fff; box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  display: flex; justify-content: center; align-items: center; cursor: pointer;
}
.main-title { font-size: 26px; font-weight: 850; color: #1a1a1a; margin: 0; letter-spacing: -1px; }
.sub-count { font-size: 12px; color: #8e8e93; font-weight: 600; }

.heart-content-area { flex: 1; overflow-y: auto; padding: 24px; position: relative; z-index: 1; }
.grid-layout { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }

.premium-card {
  background: #fff; border-radius: 28px; overflow: hidden;
  box-shadow: 0 10px 30px rgba(0,0,0,0.04);
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  cursor: pointer;
}
.premium-card:active { transform: scale(0.96); }

.card-visual { position: relative; width: 100%; aspect-ratio: 1/1; }
.product-img { width: 100%; height: 100%; object-fit: cover; }

.blur-remove-btn {
  position: absolute; top: 12px; right: 12px;
  width: 32px; height: 32px; border-radius: 12px; border: none;
  background: rgba(255, 255, 255, 0.4); backdrop-filter: blur(10px);
  color: #333; display: flex; justify-content: center; align-items: center; cursor: pointer;
  z-index: 5;
}

.glass-price-tag {
  position: absolute; bottom: 12px; left: 12px;
  padding: 6px 12px; border-radius: 14px;
  background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(8px);
  color: #fff; display: flex; align-items: baseline; gap: 2px;
}
.currency { font-size: 10px; font-weight: 700; opacity: 0.8; }
.price-val { font-size: 16px; font-weight: 900; }

.card-details { padding: 15px; }
.product-title {
  font-size: 14px; font-weight: 700; color: #2c3e50;
  margin: 0; display: -webkit-box; -webkit-line-clamp: 1;
  /* ✅ 修正警告：加入標準屬性 */
  line-clamp: 1; 
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.seller-line { font-size: 11px; color: #95a5a6; margin-top: 6px; display: flex; align-items: center; gap: 5px; }
.dot { width: 4px; height: 4px; border-radius: 50%; background: #acc6b1; }

.empty-hero { padding-top: 80px; text-align: center; }
.hero-icon-box {
  width: 100px; height: 100px; background: #fff; border-radius: 35px;
  margin: 0 auto 24px; display: flex; justify-content: center; align-items: center;
  box-shadow: 0 20px 40px rgba(172, 198, 177, 0.2);
}
.hero-emoji { font-size: 40px; }
.empty-hero h3 { font-size: 20px; font-weight: 850; color: #1a1a1a; }
.empty-hero p { font-size: 14px; color: #8e8e93; max-width: 240px; margin: 12px auto 30px; line-height: 1.6; }
.primary-action-btn {
  background: #333; color: #fff; border: none; padding: 16px 40px;
  border-radius: 20px; font-size: 15px; font-weight: 800; cursor: pointer;
}

.list-stagger-enter-active, .list-stagger-leave-active { transition: all 0.5s ease; }
.list-stagger-enter-from { opacity: 0; transform: translateY(30px); }
.list-stagger-leave-to { opacity: 0; transform: scale(0.5); }
.list-stagger-move { transition: transform 0.4s ease; }

.bottom-safe-area { height: 80px; }
</style>