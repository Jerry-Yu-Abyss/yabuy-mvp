<template>
  <div class="map-fullscreen-container">

    <button class="back-btn" @click="$emit('back-home')">
      <span class="back-arrow">←</span> 返回
    </button>

    <div class="map-box">
      <img src="@/assets/map/AU-Map-01.jpg" alt="AU Map" class="map-img" />
    </div>

    <!-- 交易點小卡：可水平滑動瀏覽，點下去會開全版面大圖（跟首頁商品卡一樣尺寸） -->
    <div class="points-strip">
      <div class="points-scroll">
        <div
          v-for="(p, i) in TRADE_POINTS" :key="p.code"
          class="point-card" @click="openViewer(i)"
        >
          <div class="point-name">{{ p.name }}</div>
          <div class="point-img-box">
            <img
              v-if="pointImages[p.code]"
              :src="pointImages[p.code]"
              :alt="p.name"
              class="point-img"
            />
            <div v-else class="point-img-placeholder">📍</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 全版面地點瀏覽：跟首頁商品卡（.unified-card）同一套尺寸/樣式，橫向滑動切換 -->
    <Transition name="fade">
      <div v-if="viewerOpen" class="point-viewer-overlay" @click.self="viewerOpen = false">
        <button class="viewer-close-btn" @click="viewerOpen = false">✕</button>

        <div class="viewer-scroll" ref="viewerScrollEl" @scroll="onViewerScroll">
          <div v-for="p in TRADE_POINTS" :key="p.code" class="viewer-slide">
            <div class="unified-card">
              <div class="card-top-img">
                <img
                  v-if="pointImages[p.code]"
                  :src="pointImages[p.code]"
                  :alt="p.name"
                  class="full-img"
                />
                <div v-else class="img-placeholder">📍</div>
              </div>
              <div class="card-bottom-info">
                <!-- 🌟 不能顯示交易點代碼：代碼是實體 QR 貼在現場才看得到的，
                     顯示在這裡等於讓人不用親自到場就能完成掃碼驗證，會被拿來內線交易。 -->
                <h3 class="card-name">{{ p.name }}</h3>
                <p class="desc-txt">掃描交易點的 QRcode，讓系統幫你紀錄交易資訊，保障雙方權益。</p>
              </div>
            </div>
          </div>
        </div>

        <div class="viewer-dots">
          <span
            v-for="(p, i) in TRADE_POINTS" :key="p.code"
            class="viewer-dot" :class="{ active: i === viewerActiveIndex }"
          ></span>
        </div>
      </div>
    </Transition>

  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue';
import { TRADE_POINTS } from './TradePoints.js';

defineEmits(['back-home']);

// 交易點照片：檔名對應 TradePoints.js 裡的 code（例如 LIB01.jpg），用 glob 動態載入，
// 之後在 assets/map 底下新增/替換圖片不用改這裡的程式碼。
const mapImageModules = import.meta.glob('../assets/map/*.jpg', { eager: true, import: 'default' });
const pointImages = {};
Object.entries(mapImageModules).forEach(([path, url]) => {
  const code = path.match(/([^/]+)\.jpg$/i)?.[1];
  if (code) pointImages[code] = url;
});

// 🌟 全版面地點瀏覽：點小卡開啟，直接跳到被點的那張，橫向滑動可切換其他地點
const viewerOpen = ref(false);
const viewerScrollEl = ref(null);
const viewerActiveIndex = ref(0);

const openViewer = async (index) => {
  viewerActiveIndex.value = index;
  viewerOpen.value = true;
  await nextTick();
  const el = viewerScrollEl.value;
  if (el) el.scrollTo({ left: el.clientWidth * index, behavior: 'auto' });
};

const onViewerScroll = () => {
  const el = viewerScrollEl.value;
  if (!el || !el.clientWidth) return;
  viewerActiveIndex.value = Math.round(el.scrollLeft / el.clientWidth);
};
</script>

<style scoped>
/* 容器自動填滿已被放大的主舞台 */
.map-fullscreen-container {
  width: 100%;
  height: 100%;
  background-color: #111; /* 深色背景看地圖更有質感 */
  display: flex;
  flex-direction: column;
  position: relative;
}

/* 懸浮返回按鈕 */
.back-btn {
  position: absolute;
  /* 使用 safe-area 確保不會被瀏海擋住 */
  top: max(env(safe-area-inset-top), 20px);
  left: 20px;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.3);
  padding: 8px 18px;
  border-radius: 999px;
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
  z-index: 10;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  cursor: pointer;
}

.back-btn:active {
  background: rgba(255, 255, 255, 0.3);
}

.back-arrow {
  font-size: 20px;
  line-height: 1;
  padding-bottom: 2px;
}

/* 地圖展示區 */
.map-box {
  flex-grow: 1;
  width: 100%;
  min-height: 0; /* 讓 flex 子項目在空間不足時能正確收縮，而不是把下方卡片擠出畫面 */
  display: flex;
  justify-content: center;
  align-items: center;
}

/* 確保地圖等比例縮放且不出格 */
.map-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* 交易點小卡：水平捲動區 */
.points-strip {
  flex-shrink: 0;
  width: 100%;
  padding: 14px 0 max(env(safe-area-inset-bottom), 14px);
  background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.06));
  border-top: 1px solid rgba(255,255,255,0.1);
}

.points-scroll {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding: 0 16px;
  scroll-snap-type: x proximity;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.points-scroll::-webkit-scrollbar { display: none; }

.point-card {
  flex: 0 0 auto;
  width: 108px;
  scroll-snap-align: start;
  display: flex;
  flex-direction: column;
  gap: 6px;
  cursor: pointer;
}
.point-card:active { transform: scale(0.96); }

.point-name {
  font-size: 12px;
  font-weight: 800;
  color: #fff;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.point-img-box {
  width: 108px;
  height: 108px;
  border-radius: 16px;
  overflow: hidden;
  background: rgba(255,255,255,0.08);
  border: 1.5px solid rgba(255,255,255,0.15);
  box-shadow: 0 4px 14px rgba(0,0,0,0.3);
}

.point-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.point-img-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
}

/* ==================== 全版面地點瀏覽（跟首頁商品卡同尺寸） ==================== */
.point-viewer-overlay {
  position: fixed;
  inset: 0;
  z-index: 500;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  align-items: center;
}

.viewer-close-btn {
  position: absolute;
  top: max(env(safe-area-inset-top), 20px);
  right: 20px;
  z-index: 10;
  width: 38px; height: 38px;
  border-radius: 50%;
  background: rgba(255,255,255,0.15);
  border: 1px solid rgba(255,255,255,0.3);
  color: #fff;
  font-size: 16px;
  cursor: pointer;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
.viewer-close-btn:active { background: rgba(255,255,255,0.3); }

.viewer-scroll {
  width: 100%;
  height: 100%;
  display: flex;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.viewer-scroll::-webkit-scrollbar { display: none; }

.viewer-slide {
  flex: 0 0 100%;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  scroll-snap-align: center;
}

/* 跟 Home.vue 的 .unified-card 尺寸/樣式一致（scoped style 不能跨元件共用，這裡照抄一份） */
.unified-card {
  width: 88%;
  height: 85%;
  max-width: 400px;
  background: #fff;
  border-radius: 40px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
}

.card-top-img {
  flex: 6;
  width: 100%;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  background: #f1f0ee;
}
.full-img { width: 100%; height: 100%; object-fit: cover; }
.img-placeholder { font-size: 48px; }

.card-bottom-info {
  flex: 4;
  width: 100%;
  padding: 20px 24px;
  background: #fff;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
}
.card-name { font-size: 22px; font-weight: 850; color: #1a1a1a; margin: 0; }
.desc-txt { font-size: 14px; margin: 0; color: #666; }

.viewer-dots {
  position: absolute;
  bottom: max(env(safe-area-inset-bottom), 20px);
  left: 0; right: 0;
  display: flex; justify-content: center; gap: 6px;
  z-index: 10;
}
.viewer-dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,0.35); transition: 0.25s; }
.viewer-dot.active { background: #fff; width: 18px; border-radius: 4px; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.25s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
