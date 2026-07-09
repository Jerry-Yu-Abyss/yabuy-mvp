<template>
  <ToastHost />

  <!-- 服務介紹頁 -->
  <Landing v-if="showLanding" @login-success="dismissLanding" />

  <!-- 【修復1】移除了 @touchmove.prevent，釋放原生的滑動事件 -->
  <div v-else class="native-app-container">

    <Onboarding v-if="showOnboarding" @done="showOnboarding = false" />

    <header 
      class="header-section" 
      v-show="activeTab !== 'map' && activeTab !== 'mailbox' && activeTab !== 'heart' && activeTab !== 'admin'"
    >
      <div class="safe-area-spacer"></div>
      
      <nav class="top-nav-bar" v-show="!['user', 'camera'].includes(activeTab)">
        <button class="icon-btn" @click="activeTab = 'map'">
          <IconMap />
        </button>

        <div class="search-container">
          <div class="search-pill">
            <IconSearch class="search-icon"/>
            <input 
              id="global-search-input"
              name="search"
              type="text" 
              placeholder="搜尋商品..." 
              class="search-input" 
              v-model="searchQuery" 
              @touchstart.stop 
            />
            <button v-if="searchQuery" class="clear-search-btn" @click="searchQuery = ''">✕</button>
          </div>
        </div>
        
        <button class="icon-btn" @click="activeTab = 'heart'">
          <IconHeart :class="{ 'active-heart': activeTab === 'heart' }" />
        </button>
        
        <button class="icon-btn mailbox-btn" @click="activeTab = 'mailbox'">
          <IconMailbox />
          <span v-if="actionableCount > 0" class="nav-badge">{{ actionableCount > 9 ? '9+' : actionableCount }}</span>
        </button>
      </nav>
    </header>

    <!-- 主內容區塊 -->
    <main class="main-stage">
      <keep-alive>
        <Home v-if="activeTab === 'radar'" />
        <Funnel v-else-if="activeTab === 'funnel'" :search-query="searchQuery" @clear-search="searchQuery = ''" />
        <Cam v-else-if="activeTab === 'camera'" @upload-success="activeTab = 'radar'" />
        <Book v-else-if="activeTab === 'book'" :search-query="searchQuery" @clear-search="searchQuery = ''" />
        <User v-else-if="activeTab === 'user'" :user="currentUser" @enter-admin="activeTab = 'admin'" />
        <Heart v-else-if="activeTab === 'heart'" @back-home="activeTab = 'radar'"/>
        <Mailbox v-else-if="activeTab === 'mailbox'" @back-home="activeTab = 'radar'" />
        <MapPage v-else-if="activeTab === 'map'" @back-home="activeTab = 'radar'" />
        <AdminPage v-else-if="activeTab === 'admin'" @back="activeTab = 'user'" />
      </keep-alive>
    </main>

    <footer 
      class="footer-section" 
      v-show="activeTab !== 'map' && activeTab !== 'admin'"
    >
      <div class="bottom-pill-menu">
        <div 
          v-for="t in navTabs" 
          :key="t.id" 
          class="nav-tab" 
          @click="activeTab = t.id" 
          :class="{ active: activeTab === t.id }"
        >
          <component :is="t.icon" />
          <span class="nav-label">{{ t.label }}</span>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, computed } from 'vue'; 
import { auth, db } from './firebase';
import { toast } from './components/toast.js';
import ToastHost from './components/ToastHost.vue';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';

// 匯入子組件
import Home from './components/Home.vue';
import Funnel from './components/Funnel.vue';
import Cam from './components/Cam.vue';
import Book from './components/Book.vue';
import User from './components/User.vue';
import Heart from './components/Heart.vue';
import MapPage from './components/MapPage.vue';
import Mailbox from './components/Mailbox.vue';
import AdminPage from './components/Admin.vue';
import Onboarding from './components/Onboarding.vue';
import Landing from './components/Landing.vue';

// 匯入圖標
import IconMap from '@/assets/icons/map.svg?component';
import IconSearch from '@/assets/icons/search.svg?component';
import IconHeart from '@/assets/icons/heart.svg?component';
import IconMailbox from '@/assets/icons/mailbox.svg?component';
import IconRadar from '@/assets/icons/radar.svg?component';
import IconFunnel from '@/assets/icons/funnel.svg?component';
import IconCamera from '@/assets/icons/camera.svg?component';
import IconBook from '@/assets/icons/book.svg?component';
import IconUser from '@/assets/icons/user.svg?component';

const activeTab = ref('radar');
const searchQuery = ref(''); 
const currentUser = ref(null); 

const showOnboarding = ref(false);
try { showOnboarding.value = localStorage.getItem('yabuy_onboarded') !== '1'; } catch (e) { showOnboarding.value = true; }

const showLanding = ref(false);
try { showLanding.value = localStorage.getItem('yabuy_landing_seen') !== '1'; } catch (e) { showLanding.value = true; }

const dismissLanding = () => {
  showLanding.value = false;
  try { localStorage.setItem('yabuy_landing_seen', '1'); } catch (e) { /* ignore */ }
};

const pendingAsSeller = ref(0);
const acceptedAsBuyer = ref(0);
const unreadMessages  = ref(0);
const actionableCount = computed(() => pendingAsSeller.value + acceptedAsBuyer.value + unreadMessages.value);
let unsubSell = null, unsubBuy = null, unsubMsg = null;

let lastSeenMs = 0;
try { lastSeenMs = Number(localStorage.getItem('yabuy_mailbox_seen') || 0); } catch (e) { lastSeenMs = 0; }
const toMs = (ts) => ts?.toMillis ? ts.toMillis() : (ts?.seconds ? ts.seconds * 1000 : 0);

const bindBadgeListeners = (uid) => {
  unsubSell?.(); unsubBuy?.(); unsubMsg?.();
  unsubSell = onSnapshot(query(collection(db, 'orders'), where('sellerId', '==', uid)), (s) => {
    pendingAsSeller.value = s.docs.filter(d => d.data().status === 'pending').length;
  }, () => {});
  unsubBuy = onSnapshot(query(collection(db, 'orders'), where('buyerId', '==', uid)), (s) => {
    acceptedAsBuyer.value = s.docs.filter(d => d.data().status === 'accepted').length;
  }, () => {});
  unsubMsg = onSnapshot(query(collection(db, 'notifications'), where('target', 'in', ['ALL', uid])), (s) => {
    unreadMessages.value = s.docs.filter(d => toMs(d.data().createdAt) > lastSeenMs).length;
  }, () => {});
};

const clearBadgeListeners = () => {
  unsubSell?.(); unsubBuy?.(); unsubMsg?.();
  unsubSell = unsubBuy = unsubMsg = null;
  pendingAsSeller.value = 0; acceptedAsBuyer.value = 0; unreadMessages.value = 0;
};

const markMailboxSeen = () => {
  lastSeenMs = Date.now();
  try { localStorage.setItem('yabuy_mailbox_seen', String(lastSeenMs)); } catch (e) { /* ignore */ }
  unreadMessages.value = 0;
};

onMounted(() => {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists() && userSnap.data().status === 'banned') {
          toast.error('🚨 系統通知：\n\n您的帳號已被管理員停權，無法繼續使用 YaBuy 服務。\n如有疑慮請聯繫校園管理團隊。');
          await signOut(auth);
          currentUser.value = null;
          activeTab.value = 'user'; 
          return; 
        }
      } catch (error) {
        console.error("權限檢查失敗:", error);
      }

      currentUser.value = user;
      bindBadgeListeners(user.uid);
      if (showLanding.value) dismissLanding();
    } else {
      currentUser.value = null;
      clearBadgeListeners();
    }
  });
});

let tabBeforeSearch = null;
watch(searchQuery, (newVal) => {
  const hasText = newVal.trim().length > 0;
  if (hasText) {
    if (activeTab.value !== 'funnel' && activeTab.value !== 'book') {
      tabBeforeSearch = activeTab.value;
      activeTab.value = 'funnel';
    }
  } else {
    if (activeTab.value === 'funnel' && tabBeforeSearch) {
      activeTab.value = tabBeforeSearch;
    }
    tabBeforeSearch = null;
  }
});

watch(activeTab, (tab) => {
  if (tab === 'mailbox') markMailboxSeen();
});

const navTabs = [
  { id: 'radar',  icon: IconRadar,  label: '首頁' },
  { id: 'funnel', icon: IconFunnel, label: '搜尋' },
  { id: 'camera', icon: IconCamera, label: '賣東西' },
  { id: 'book',   icon: IconBook,   label: '教科書' },
  { id: 'user',   icon: IconUser,   label: '我的' }
];
</script>

<style>
/* ==================== 
   全域樣式 
   ==================== */
html, body, #app {
  width: 100%; height: 100%; margin: 0; padding: 0;
  overflow: hidden; /* 保留這行：避免整個網頁本體可以被拉動 */
  overscroll-behavior-y: none; /* 【修復2】使用現代 CSS 取代 JS 的捲動阻擋，防止橡皮筋效應 */
  background-color: #d1d9c6; /* 桌機版會顯示的外圍背景色 */
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  -webkit-tap-highlight-color: transparent;
}
</style>

<style scoped>
/* ==================== 
   佈局與響應式設計 (RWD) 
   ==================== */
.native-app-container {
  /* 【響應式升級】不再寫死 100vw，而是限制最大寬度以適應桌機與平板 */
  width: 100%; 
  max-width: 500px; 
  margin: 0 auto; 
  height: 100dvh;
  
  display: flex; flex-direction: column;
  overflow: hidden; 
  
  /* 【致命修復3】移除了原本的 touch-action: none; (這行是導致手機完全無法滑動的元兇) */
  user-select: none;
  
  background-color: #f6f8f4; /* 為 App 主體加上底色，與桌機大背景做出區隔 */
  box-shadow: 0 0 40px rgba(0, 0, 0, 0.15); /* 桌機與平板上會呈現如實體手機般的陰影立體感 */
}

/* 頂部安全區推擠 */
.header-section { flex-shrink: 0; background-color: #d1d9c6; }
.safe-area-spacer { height: env(safe-area-inset-top, 48px); width: 100%; }

.top-nav-bar { 
  height: 56px; display: flex; align-items: center; 
  padding: 0 16px; gap: 12px; 
}

.search-container { flex: 1; min-width: 0; }

.search-pill { 
  width: 100%; height: 38px; background: #f9f9f6; 
  border-radius: 999px; display: flex; align-items: center; 
  padding: 0 14px; box-sizing: border-box; 
}

.search-icon { width: 20px; height: 20px; color: #333; margin-right: 8px; flex-shrink: 0; }
.search-input { 
  border: none; background: transparent; flex: 1; 
  min-width: 0; outline: none; font-size: 16px; color: #333; 
}

.clear-search-btn { 
  background: none; border: none; font-size: 14px; 
  color: #999; cursor: pointer; padding: 0 5px; font-weight: 800; 
}

.icon-btn { 
  background: none; border: none; cursor: pointer; 
  padding: 0; display: flex; align-items: center; justify-content: center; flex-shrink: 0; 
}
.icon-btn svg { width: 28px; height: 28px; color: #000; }

/* 信箱未讀紅點 */
.mailbox-btn { position: relative; }
.nav-badge {
  position: absolute; top: -4px; right: -6px; z-index: 5; pointer-events: none;
  min-width: 17px; height: 17px; padding: 0 4px;
  background: #e53935; color: #fff;
  font-size: 10px; font-weight: 800; line-height: 17px; text-align: center;
  border-radius: 9px; border: 2px solid #fff; box-sizing: content-box;
}

.active-heart { color: #cf847d !important; filter: drop-shadow(0 0 5px rgba(207, 132, 125, 0.4)); }

/* ==================== 
   主要滑動區塊修復 
   ==================== */
.main-stage { 
  flex-grow: 1; 
  position: relative; 
  
  /* 【致命修復4】原本的 overflow: hidden 會鎖死內容。改為 auto，並開啟 iOS 的順暢慣性滑動 */
  overflow-y: auto; 
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch; 
}

/* ==================== 
   底部導覽列 
   ==================== */
.footer-section { 
  flex-shrink: 0; 
  padding: 5px 16px env(safe-area-inset-bottom, 15px); 
  background-color: #f6f8f4;
}

.bottom-pill-menu { 
  width: 100%; height: 68px; background: #fff; border-radius: 28px; 
  display: flex; justify-content: space-around; align-items: center; 
  box-shadow: 0 4px 20px rgba(0,0,0,0.06); 
}
.nav-tab { 
  cursor: pointer; display: flex; flex-direction: column; 
  align-items: center; justify-content: center; gap: 3px; flex: 1; height: 100%; 
}
.nav-tab svg { width: 23px; height: 23px; color: #9a9a9a; transition: 0.2s; }
.nav-label { font-size: 10px; font-weight: 700; color: #9a9a9a; transition: 0.2s; }
.nav-tab.active svg { color: #1a1a1a; transform: scale(1.1); }
.nav-tab.active .nav-label { color: #1a1a1a; }
</style>