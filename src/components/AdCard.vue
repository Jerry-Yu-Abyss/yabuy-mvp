<template>
  <div class="ad-card">
    <div class="ad-carousel">
      <div
        class="ad-slides"
        :style="{ transform: `translateX(-${activeSlide * 100}%)` }"
      >
        <div v-for="(img, i) in ad.images" :key="i" class="ad-slide">
          <img :src="img" class="ad-img" />
        </div>
        <div v-if="!ad.images || ad.images.length === 0" class="ad-slide">
          <div class="ad-img-placeholder">📢</div>
        </div>
      </div>

      <span class="ad-flag">廣告</span>

      <div v-if="ad.images && ad.images.length > 1" class="ad-dots">
        <span
          v-for="(img, i) in ad.images" :key="i"
          class="ad-dot" :class="{ active: i === activeSlide }"
        ></span>
      </div>
    </div>

    <div class="ad-bottom-info">
      <div class="ad-info-main">
        <h3 class="ad-name">{{ ad.title || '合作推廣' }}</h3>
        <p class="ad-desc">{{ ad.description || '' }}</p>

        <button class="ad-cta-btn" type="button" @click.stop="handleGo">
          <span>前往看看</span>
          <IconSend class="ad-cta-icon" />
        </button>
      </div>

      <!-- 廣告不是商品，沒有「喜愛」的意義，跟商品卡不同：只給 1 顆置中的略過鈕，
           位置跟商品卡的 action-row 對齊，滑動手勢也共用同一套，但語意上只有「略過」 -->
      <div class="action-row">
        <div class="vote-btn skip" @click.stop="$emit('skip')">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import IconSend from '@/assets/icons/send.svg?component';

const props = defineProps({
  ad: { type: Object, required: true },
  active: { type: Boolean, default: true } // 只有目前顯示在最上層的卡片才需要跑輪播計時器
});
defineEmits(['skip']);

const activeSlide = ref(0);
let timer = null;

const startCarousel = () => {
  stopCarousel();
  const count = props.ad?.images?.length || 0;
  if (count <= 1) return;
  timer = setInterval(() => {
    activeSlide.value = (activeSlide.value + 1) % count;
  }, 3000);
};
const stopCarousel = () => { if (timer) { clearInterval(timer); timer = null; } };

// 卡片堆疊裡同時掛著好幾張卡（含被壓在下面的），只讓「目前最上層」的那張跑計時器，
// 省資源，也避免使用者看不到的卡片在背景默默切換。
watch(() => props.active, (isActive) => { isActive ? startCarousel() : stopCarousel(); }, { immediate: true });
onMounted(() => { if (props.active) startCarousel(); });
onUnmounted(stopCarousel);

const handleGo = () => {
  if (!props.ad?.linkUrl) return;
  window.open(props.ad.linkUrl, '_blank', 'noopener,noreferrer');
};
</script>

<style scoped>
/* 跟商品卡共用同一個 .unified-card 外框（尺寸/圓角/陰影），內容區塊風格刻意做出差異：
   商品卡是白底＋淡色資訊區，廣告卡用深色資訊區＋左側色條，一眼就能跟商品區分開。 */
.ad-card {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  border-radius: inherit;
  overflow: hidden;
}

.ad-carousel { flex: 6; width: 100%; position: relative; overflow: hidden; background: #1f2a22; }
.ad-slides { display: flex; width: 100%; height: 100%; transition: transform 0.5s ease; }
.ad-slide { flex: 0 0 100%; width: 100%; height: 100%; }
.ad-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ad-img-placeholder {
  width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
  font-size: 48px; color: #6b8a72; background: #1f2a22;
}

.ad-flag {
  position: absolute; top: 20px; left: 20px; z-index: 5;
  background: #f2d98c; color: #5c4700;
  padding: 4px 12px; border-radius: 999px;
  font-size: 11px; font-weight: 900; letter-spacing: 1px;
}

.ad-dots {
  position: absolute; bottom: 14px; left: 0; right: 0;
  display: flex; justify-content: center; gap: 6px; z-index: 5;
}
.ad-dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,0.4); transition: 0.25s; }
.ad-dot.active { background: #fff; width: 16px; border-radius: 4px; }

.ad-bottom-info {
  flex: 4; width: 100%;
  padding: 20px 24px; box-sizing: border-box;
  background: #2f4a3a;
  display: flex; flex-direction: column; justify-content: space-between;
  overflow: hidden;
}
.ad-info-main { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.ad-name {
  font-size: 19px; font-weight: 850; color: #fff; margin: 0;
  line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ad-desc {
  font-size: 13.5px; margin: 0; color: #d8ecd9; line-height: 1.5;
  display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3;
  -webkit-box-orient: vertical; text-overflow: ellipsis; overflow: hidden;
}

.ad-cta-btn {
  margin-top: 14px; align-self: flex-start;
  display: flex; align-items: center; gap: 8px;
  background: #f2d98c; color: #5c4700;
  border: none; border-radius: 999px;
  padding: 11px 20px; font-size: 14px; font-weight: 800;
  cursor: pointer;
}
.ad-cta-icon { width: 16px; height: 16px; }

/* 略過鈕：跟 Home.vue 商品卡的 .action-row 垂直位置對齊，但廣告只有 1 顆置中按鈕
   （不是「喜愛/不喜愛」二選一，單純略過），用中性灰色跟商品卡的紅/綠做出區隔。 */
.action-row { display: flex; justify-content: center; padding-bottom: 5px; flex-shrink: 0; }
.vote-btn.skip {
  width: 54px; height: 54px; border-radius: 50%;
  display: flex; justify-content: center; align-items: center;
  box-shadow: 0 4px 15px rgba(0,0,0,0.2); transition: 0.2s; color: #fff;
  background: rgba(255,255,255,0.18);
}
</style>
