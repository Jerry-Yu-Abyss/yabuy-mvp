<template>
  <div 
    class="home-root"
    @touchstart="onPullStart"
    @touchmove="onPullMove"
    @touchend="onPullEnd"
  >
    <div 
      class="pull-down-loader" 
      :style="{ height: pullDistance + 'px', opacity: Math.min(pullDistance / 80, 1) }"
    >
      <div class="loader-icon" :class="{ 'spinning': isRefreshing }">
        {{ isRefreshing ? '⏳' : '↓' }}
      </div>
      <p>{{ isRefreshing ? '正在同步最新商品...' : '繼續下拉以刷新' }}</p>
    </div>

    <div class="view-container" :style="contentStyle">
      
      <div v-if="loading" class="loading-stage">
        <div class="radar-pulse"></div>
        <p>正在搜尋校園周邊商品...</p>
      </div>

      <div
        v-for="(item, index) in cardStack"
        :key="item.id"
        class="card-wrapper"
        :style="getCardStyle(index)"
        @touchstart="handleTouchStart"
        @touchmove="handleTouchMove"
        @touchend="handleTouchEnd"
      >
        <!-- 廣告卡：風格刻意跟商品卡不同（見 AdCard.vue），沿用同一套滑動手勢；
             廣告沒有「喜愛」的意義，一律走略過（不會加入收藏），方向固定往左滑出 -->
        <div v-if="item.type === 'ad'" class="unified-card">
          <AdCard
            :ad="item" :active="index === 0"
            @skip="swipeCard('dislike')"
          />
        </div>

        <div v-else class="unified-card">
          <div class="card-top-img" :style="{ backgroundColor: item.color || '#f1f0ee' }">
            <img v-if="item.url" :src="item.url" class="full-img" />
            <div v-else class="img-placeholder">Product Image</div>

            <div v-if="isNewProduct(item.createdAt)" class="new-arrival-tag">
              <span class="pulse-dot"></span> NEW
            </div>

            <div v-if="item.category" class="category-tag">{{ item.category }}</div>
          </div>

          <div class="card-bottom-info">
            <div class="info-main">
              <h3 class="card-name">{{ item.name || '未命名商品' }}</h3>
              <div class="price-row">
                <span class="price-txt">${{ item.price }}</span>
                <button class="send-btn" @click.stop="openTrade(item)">
                  <IconSend class="send-icon" />
                </button>
              </div>

              <p class="desc-txt">{{ item.desc || '這名賣家很懶，什麼都沒寫...' }}</p>
            </div>

            <div class="action-row">
              <div class="vote-btn dislike" @click.stop="swipeCard('dislike')">
                <IconThumbsDown />
              </div>
              <div class="vote-btn like" @click.stop="swipeCard('like')">
                <IconThumbsUp />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="cardStack.length === 0 && !loading" class="empty-hint">
        <div class="empty-icon">☕</div>
        <p>目前沒有更多推薦商品<br>稍後再回來看看吧！</p>
        
        <button class="reset-seen-btn" @click="resetSeen">
          ↺ 重新探索商品
        </button>
      </div>

      <TradeModal 
        v-if="selectedProduct" 
        :product="selectedProduct" 
        @close="selectedProduct = null"
        @submit="handleTradeRequest"
      />
    </div>

  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { db, auth } from '@/firebase'; 
import { toast } from './toast.js';
import { blockUnverifiedForTrade } from './verify.js';
import { onAuthStateChanged } from 'firebase/auth'; 
import { collection, query, where, onSnapshot, orderBy, addDoc, serverTimestamp } from 'firebase/firestore';
import IconSend from '@/assets/icons/send.svg?component';
import IconThumbsUp from '@/assets/icons/thumbs-up.svg?component';
import IconThumbsDown from '@/assets/icons/thumbs-down.svg?component';
import TradeModal from './TradeModal.vue';
import AdCard from './AdCard.vue';

// --- 狀態管理 ---
const selectedProduct = ref(null);
const loading = ref(true);
const cardStack = ref([]); 
const touch = reactive({ x: 0, startX: 0, isMoving: false });

let unsubscribeProducts = null;
let unsubscribeFavorites = null;
let unsubscribeAds = null;
let rawProducts = [];
const favoriteIds = new Set();
let animatingId = null;

// ================= 🌟 LocalStorage 持久化管理 =================
const getInitialSeenIds = () => {
  try {
    const saved = localStorage.getItem('YaBuy_SeenIds');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  } catch (e) {
    return new Set();
  }
};
// 將已看過的商品永久記在瀏覽器
const seenIds = getInitialSeenIds();

// ================= 🌟 廣告投放 =================
// 規則：每滑過 10 個「真實商品」就穿插 1 則廣告；若同時有多則廣告上架，
// 用洗牌過的順序輪流選，避免每次都固定同一個順序。
const AD_INTERVAL = 10;
let rawAds = [];          // 從 Firestore ads 集合抓到的所有廣告（含未上架/已下架）
let shuffledAdPool = [];  // 目前有效（在上下架期限內）廣告，洗牌過一次
let adRotationIndex = 0;  // 輪到第幾則廣告（用餘數循環，讓多則廣告輪流出現）

// 🌟 使用者這個 session 已經略過的廣告（存廣告的 Firestore 文件 id，不是插槽合成的 id）。
// 重要：updateCardStack 每滑一張卡就會整個重算一次，若沒有這層排除，剛被滑掉的廣告
// 因為「累計商品數」「還沒滿 10 個商品」的節奏或保底邏輯都沒變，下一次重算會用一模一樣的
// 條件把同一則廣告原封不動地排回同一個位置 —— 使用者會看到「怎麼滑都滑不掉」。
// 只在當前分頁存活期間有效（不寫 localStorage），下次重新整理廣告就會恢復輪播。
const dismissedAdIds = new Set();

// 累計已滑過的「真實商品」數量（廣告本身不計入），用來決定下一則廣告要插在哪裡。
// 注意：一定要用這種「持續累加」的計數器，不能用「目前剩餘清單的第幾筆」來算——
// 因為 cardStack 每滑一張就會用 updateCardStack() 整個重算一次，若用相對位置，
// 每次重算都會把節奏歸零，永遠湊不滿 10 個。
const getInitialSwipedCount = () => {
  try { return Number(localStorage.getItem('YaBuy_AdSwipedCount')) || 0; } catch (e) { return 0; }
};
const swipedProductCount = ref(getInitialSwipedCount());

const isAdActive = (ad, now = new Date()) => {
  const start = ad.startDate?.toDate ? ad.startDate.toDate() : (ad.startDate ? new Date(ad.startDate) : null);
  const end = ad.endDate?.toDate ? ad.endDate.toDate() : (ad.endDate ? new Date(ad.endDate) : null);
  if (start && now < start) return false;
  if (end && now > end) return false;
  return true;
};

const shuffleArray = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ads 資料一有變動（新增/修改/刪除/期限切換）就重新洗牌一次，重置輪替起點
const rebuildAdPool = () => {
  shuffledAdPool = shuffleArray(rawAds.filter(a => isAdActive(a)));
  adRotationIndex = 0;
};

const pickNextAd = () => {
  if (shuffledAdPool.length === 0) return null;
  // 最多繞完整個池子一輪；全部都被使用者略過的話就不硬塞
  for (let tries = 0; tries < shuffledAdPool.length; tries++) {
    const ad = shuffledAdPool[adRotationIndex % shuffledAdPool.length];
    adRotationIndex++;
    if (!dismissedAdIds.has(ad.id)) return ad;
  }
  return null;
};

const requireLogin = () => {
  if (!auth.currentUser) {
    toast("🔒 系統提示：\n請先前往右下角「會員」頁面登入，才能與商品進行互動喔！");
    return false;
  }
  return true;
};

// ================= 🌟 下拉刷新邏輯 =================
const pullDistance = ref(0);
const isRefreshing = ref(false);
let startY = 0;
let startX = 0;
let isPulling = false;

const onPullStart = (e) => {
  startY = e.touches[0].pageY;
  startX = e.touches[0].pageX;
  isPulling = false;
};

const onPullMove = (e) => {
  if (isRefreshing.value || touch.isMoving) return;
  const diffY = e.touches[0].pageY - startY;
  const diffX = Math.abs(e.touches[0].pageX - startX);

  if (diffY > 0 && diffY > diffX) {
    isPulling = true;
    pullDistance.value = Math.pow(diffY, 0.85); 
  }
};

const onPullEnd = async () => {
  if (!isPulling) return;
  if (pullDistance.value > 80) { 
    isRefreshing.value = true;
    pullDistance.value = 60; 
    initDataSync(auth.currentUser); 
    setTimeout(() => { isRefreshing.value = false; pullDistance.value = 0; }, 800);
  } else {
    pullDistance.value = 0;
  }
  isPulling = false;
};

const contentStyle = computed(() => ({
  transform: `translateY(${pullDistance.value}px)`,
  transition: pullDistance.value === 0 || pullDistance.value === 60 ? 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)' : 'none'
}));

// ================= 🌟 核心過濾與重置 =================
const updateCardStack = (user) => {
  const validProducts = rawProducts.filter(p => {
    const isOwn = user ? p.sellerId === user.uid : false;
    const isFav = favoriteIds.has(p.id);
    const isSeen = seenIds.has(p.id);
    // 嚴格規定：不能是自己的、不能被收藏過、不能看過，才會發放到畫面上
    return !isOwn && !isFav && !isSeen;
  }).map(p => ({ ...p, type: 'product' }));

  // 🌟 按累計滑過商品數，每滿 10 個就在後面插 1 則廣告（見上方 swipedProductCount 註解）
  const withAds = [];
  const usedAdIds = new Set(); // 這次 recompute 裡，哪些廣告已經透過「每 10 個」節奏排進去了
  validProducts.forEach((p, i) => {
    withAds.push(p);
    const globalCount = swipedProductCount.value + i + 1;
    if (globalCount % AD_INTERVAL === 0) {
      const ad = pickNextAd();
      // 同一則廣告可能因為輪替被排到好幾個插槽，id 要帶上插槽序號才不會跟 :key 衝突；
      // adDocId 保留原本的 Firestore 文件 id，滑掉時要用這個去記錄「已略過」
      if (ad) { withAds.push({ ...ad, adDocId: ad.id, id: `ad-${ad.id}-${globalCount}`, type: 'ad' }); usedAdIds.add(ad.id); }
    }
  });

  // 🌟 保底邏輯：商品數不夠湊到下一個 10 的倍數時（例如上架中的商品總數很少、
  // 或已經滑到只剩幾張），上面的節奏迴圈永遠不會觸發，廣告就會完全沒機會出現。
  // 這裡把「目前有效但這次沒被排到、也還沒被使用者略過」的廣告，一定補插在整疊卡片的
  // 最底部，確保只要廣告還在上架期限內，使用者遲早會滑到它。
  rawAds.filter(a => isAdActive(a) && !dismissedAdIds.has(a.id)).forEach(ad => {
    if (!usedAdIds.has(ad.id)) withAds.push({ ...ad, adDocId: ad.id, id: `ad-bottom-${ad.id}`, type: 'ad' });
  });

  if (animatingId) {
    const animatingCard = cardStack.value.find(c => c.id === animatingId);
    if (animatingCard) {
      cardStack.value = [animatingCard, ...withAds.filter(p => p.id !== animatingId)];
      return;
    }
  }

  cardStack.value = withAds;
};

// 🌟 全新重置按鈕邏輯：一鍵清除快取並瞬間補回卡片
const resetSeen = () => {
  console.log("🔄 [YaBuy] 準備重置，清除紀錄數量:", seenIds.size);
  seenIds.clear();
  localStorage.removeItem('YaBuy_SeenIds');
  
  // 瞬間重算，不需重新從 Firebase 抓資料
  updateCardStack(auth.currentUser);
  
  if (cardStack.value.length === 0) {
    toast("⚠️ 系統提示：沒有更多卡片了！\n因為您左滑的商品已全部重置，剩下的可能都是您自己的商品，或是已被您『加入喜愛清單』的商品！");
  } else {
    console.log("✅ [YaBuy] 重置成功，補回卡片:", cardStack.value.length, "張");
  }
};

const initDataSync = (user) => {
  if (unsubscribeProducts) unsubscribeProducts();
  if (unsubscribeFavorites) unsubscribeFavorites();
  if (!isRefreshing.value) loading.value = true; 

  const qProd = query(collection(db, "products"), where("status", "==", "active"), orderBy("createdAt", "desc"));
  unsubscribeProducts = onSnapshot(qProd, (snapshot) => {
    rawProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    updateCardStack(user);
    loading.value = false;
  }, (err) => {
    console.error("[Home] 商品監聽失敗：", err.code, err.message);
    loading.value = false;
  });

  if (user) {
    const qFav = query(collection(db, "favorites"), where("userId", "==", user.uid));
    unsubscribeFavorites = onSnapshot(qFav, (snapshot) => {
      favoriteIds.clear();
      snapshot.docs.forEach(doc => { favoriteIds.add(doc.data().productId); });
      updateCardStack(user);
    }, (err) => {
      console.error("[Home] 收藏監聽失敗：", err.code, err.message);
    });
  }
};

const isNewProduct = (createdAt) => {
  if (!createdAt) return false;
  return (new Date() - createdAt.toDate()) / (1000 * 60 * 60) < 24;
};

const addToFavorites = async (product) => {
  const user = auth.currentUser;
  if (!user) return;
  try {
    await addDoc(collection(db, "favorites"), {
      userId: user.uid,
      productId: product.id,            
      name: product.name,
      price: product.price,
      url: product.url || '',
      color: product.color || '#acc6b1',
      sellerId: product.sellerId || '',
      sellerName: product.sellerName || '校園賣家',
      createdAt: serverTimestamp()
    });
  } catch (e) { console.error('[Home] 加入收藏失敗：', e); }
};

const swipeCard = (dir) => {
  if (!requireLogin()) return;

  const currentItem = cardStack.value[0];
  if (!currentItem) return;
  animatingId = currentItem.id;

  // 🌟 廣告卡：不算收藏、不佔用 seenIds（廣告是每次重算即時插入的，不是來自 rawProducts），
  // 純粹滑掉即可，節奏計數器也不會被廣告影響（只算真實商品）。
  if (currentItem.type === 'ad') {
    // 🌟 記住這則廣告已經被略過，updateCardStack 重算時才不會把它原封不動排回同一個位置
    // （否則節奏／保底條件都沒變，馬上就會被排回來，使用者會覺得「滑不掉」）
    if (currentItem.adDocId) dismissedAdIds.add(currentItem.adDocId);
    touch.x = dir === 'like' ? 1000 : -1000;
    setTimeout(() => {
      if (cardStack.value.length > 0 && cardStack.value[0].id === animatingId) cardStack.value.shift();
      animatingId = null; touch.x = 0;
      updateCardStack(auth.currentUser);
    }, 300);
    return;
  }

  // 🌟 將滑過的卡片永久寫入 LocalStorage
  seenIds.add(currentItem.id);
  localStorage.setItem('YaBuy_SeenIds', JSON.stringify([...seenIds]));

  // 🌟 廣告節奏計數器：只有真實商品才累加、持久化
  swipedProductCount.value++;
  try { localStorage.setItem('YaBuy_AdSwipedCount', String(swipedProductCount.value)); } catch (e) { /* 忽略儲存失敗 */ }

  if (dir === 'like') addToFavorites(currentItem);
  touch.x = dir === 'like' ? 1000 : -1000;

  setTimeout(() => {
    if (cardStack.value.length > 0 && cardStack.value[0].id === animatingId) cardStack.value.shift();
    animatingId = null; touch.x = 0;
    updateCardStack(auth.currentUser);
  }, 300);
};

// 🌟 廣告不需要登入即可讀（跟商品一樣公開），所以獨立於 auth 狀態抓取，
// 一進首頁就開始監聽；新增/修改/下架都會即時反映在卡片堆疊裡。
const fetchAds = () => {
  const qAds = query(collection(db, "ads"), orderBy("createdAt", "desc"));
  unsubscribeAds = onSnapshot(qAds, (snapshot) => {
    rawAds = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    rebuildAdPool();
    updateCardStack(auth.currentUser);
  }, (err) => {
    console.error("[Home] 廣告監聽失敗：", err.code, err.message);
  });
};

onMounted(() => {
  onAuthStateChanged(auth, initDataSync);
  fetchAds();
});
onUnmounted(() => { unsubscribeProducts?.(); unsubscribeFavorites?.(); unsubscribeAds?.(); });

const openTrade = async (item) => { 
  if (!requireLogin()) return;
  if (!(await blockUnverifiedForTrade(auth.currentUser, toast))) return;
  selectedProduct.value = item; 
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
    console.error("[Home] 訂單寫入失敗:", e);
    toast("發送失敗，請稍後再試。");
  }
};

const handleTouchStart = (e) => { 
  if (!requireLogin()) return; 
  touch.startX = e.touches[0].clientX; 
  touch.isMoving = true; 
};

const handleTouchMove = (e) => {
  if (!touch.isMoving) return;
  if (e.cancelable) e.preventDefault();
  touch.x = e.touches[0].clientX - touch.startX;
};

const handleTouchEnd = () => {
  touch.isMoving = false;
  if (Math.abs(touch.x) > 100) swipeCard(touch.x > 0 ? 'like' : 'dislike');
  else touch.x = 0;
};

const getCardStyle = (index) => {
  if (index !== 0) return { transform: `scale(${1 - index * 0.05}) translateY(${index * 15}px)`, opacity: 1 - index * 0.2, zIndex: 10 - index };
  return { transform: `translateX(${touch.x}px) rotate(${touch.x / 18}deg)`, transition: touch.isMoving ? 'none' : 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)', zIndex: 100 };
};
</script>

<style scoped>
.home-root { 
  width: 100%; 
  height: 100%; 
  position: relative; 
  background: #f8faf5; 
  overscroll-behavior-y: contain; 
}

.pull-down-loader {
  position: absolute;
  top: 0; 
  width: 100%;
  display: flex; 
  flex-direction: column;
  align-items: center; 
  justify-content: center;
  overflow: hidden;
  color: #acc6b1;
  font-size: 13px; 
  font-weight: 800;
  z-index: 0;
}
.loader-icon {
  font-size: 24px;
  margin-bottom: 4px;
  transition: transform 0.2s;
}
.spinning {
  animation: rotate 1s linear infinite;
}
@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.view-container { 
  width: 100%; 
  height: 100%; 
  display: flex; 
  justify-content: center; 
  align-items: center; 
  position: relative; 
  overflow: hidden; 
  z-index: 1; 
}

.card-wrapper { position: absolute; width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; will-change: transform; }

.unified-card { 
  width: 88%; 
  height: 85%; 
  max-width: 400px; 
  background: #fff; 
  border-radius: 40px; 
  display: flex; 
  flex-direction: column; 
  overflow: hidden; 
  box-shadow: 0 10px 40px rgba(0,0,0,0.1); 
}

.card-top-img { 
  flex: 6; 
  width: 100%;
  position: relative; 
  display: flex; 
  justify-content: center; 
  align-items: center; 
  overflow: hidden;
}
.full-img { width: 100%; height: 100%; object-fit: cover; }

.card-bottom-info { 
  flex: 4; 
  width: 100%;
  padding: 20px 24px; 
  background: #fff; 
  box-sizing: border-box;
  display: flex; 
  flex-direction: column; 
  justify-content: space-between; 
  overflow: hidden;
}

.info-main {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.price-row { display: flex; justify-content: space-between; align-items: center; }
.price-txt { font-size: 28px; font-weight: 900; color: #333; }

.card-name {
  font-size: 19px; font-weight: 850; color: #1a1a1a; margin: 0;
  line-height: 1.3;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.desc-txt { 
  font-size: 14px; margin: 0; color: #666; 
  line-height: 1.4; 
  display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2;
  -webkit-box-orient: vertical; text-overflow: ellipsis;
  overflow: hidden;
}

.new-arrival-tag {
  position: absolute; top: 20px; right: 20px;
  background: rgba(255, 255, 255, 0.9); backdrop-filter: blur(4px);
  padding: 4px 10px; border-radius: 8px; font-size: 10px; font-weight: 900; color: #cf847d;
  display: flex; align-items: center; gap: 4px; box-shadow: 0 4px 10px rgba(0,0,0,0.1);
  z-index: 10;
}
.pulse-dot { width: 6px; height: 6px; background: #cf847d; border-radius: 50%; animation: pulse-animation 1.5s infinite; }
@keyframes pulse-animation {
  0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(207, 132, 125, 0.7); }
  70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(207, 132, 125, 0); }
  100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(207, 132, 125, 0); }
}

.category-tag { 
  position: absolute; top: 20px; left: 20px; 
  background: rgba(255,255,255,0.9); padding: 4px 12px; 
  border-radius: 12px; font-size: 10px; font-weight: 800; color: #333; 
}

.action-row { display: flex; justify-content: space-around; padding-bottom: 5px; }
.vote-btn { 
  width: 54px; height: 54px; border-radius: 50%; 
  display: flex; justify-content: center; align-items: center; 
  box-shadow: 0 4px 15px rgba(0,0,0,0.1); transition: 0.2s; color: #fff; 
}
.vote-btn.like { background: #acc6b1; }
.vote-btn.dislike { background: #cf847d; }
.send-btn { background: #f1f0ee; border: none; width: 44px; height: 44px; border-radius: 50%; display: flex; justify-content: center; align-items: center; cursor: pointer; }
.send-icon { width: 22px; height: 22px; color: #a2b2f7; }

.loading-stage { text-align: center; color: #acc6b1; }
.radar-pulse { width: 60px; height: 60px; border: 4px solid #acc6b1; border-radius: 50%; margin: 0 auto 20px; animation: radar 1.5s ease-out infinite; }
@keyframes radar { 0% { transform: scale(0.5); opacity: 1; } 100% { transform: scale(1.5); opacity: 0; } }

.empty-hint { text-align: center; color: #5a6350; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.empty-icon { font-size: 40px; margin-bottom: 8px; }

/* 🌟 新增的重置按鈕樣式 */
.reset-seen-btn {
  margin-top: 16px;
  background: #acc6b1;
  color: #fff;
  border: none;
  padding: 12px 24px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  transition: 0.2s;
  box-shadow: 0 4px 10px rgba(172, 198, 177, 0.4);
}
.reset-seen-btn:active {
  transform: scale(0.95);
}
</style>