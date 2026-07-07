<template>
  <div class="ob-overlay">
    <div class="ob-card">
      <button v-if="index < slides.length - 1" class="ob-skip" @click="finish">略過</button>

      <div class="ob-body">
        <div class="ob-emoji">{{ slides[index].emoji }}</div>
        <h2 class="ob-title">{{ slides[index].title }}</h2>
        <p class="ob-desc">{{ slides[index].desc }}</p>
      </div>

      <div class="ob-dots">
        <span
          v-for="(s, i) in slides"
          :key="i"
          class="ob-dot"
          :class="{ active: i === index }"
          @click="index = i"
        ></span>
      </div>

      <button class="ob-next" @click="next">
        {{ index < slides.length - 1 ? '下一步' : '開始使用 🎉' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const emit = defineEmits(['done']);

const slides = [
  {
    emoji: '🛍️',
    title: '歡迎來到 YaBuy',
    desc: '亞大校園專屬的二手交易平台。把閒置的物品和教科書，輕鬆變成現金，也找到便宜好物。'
  },
  {
    emoji: '🤝',
    title: '校園面交，安心交易',
    desc: '看到喜歡的就送出預約，和對方約校園見面。見面時用 QR Code 互相驗證身分，一手交錢一手交貨（不經線上付款）。'
  },
  {
    emoji: '🛡️',
    title: '幾個小提醒',
    desc: '建議白天在校園公共場所碰面、當面確認商品狀況再付款。每筆交易都會留下紀錄，讓交易更有保障。'
  }
];

const index = ref(0);

const next = () => {
  if (index.value < slides.length - 1) index.value++;
  else finish();
};

const finish = () => {
  try { localStorage.setItem('yabuy_onboarded', '1'); } catch (e) { /* 隱私模式可能不可用，略過 */ }
  emit('done');
};
</script>

<style scoped>
.ob-overlay {
  position: fixed; inset: 0; z-index: 90000;
  background: linear-gradient(160deg, #d1d9c6 0%, #aec5b3 100%);
  display: flex; align-items: center; justify-content: center; padding: 28px;
}
.ob-card {
  position: relative;
  width: 100%; max-width: 360px;
  background: #fff; border-radius: 28px;
  padding: 28px 24px 24px;
  box-shadow: 0 20px 50px rgba(0,0,0,0.2);
  display: flex; flex-direction: column;
}
.ob-skip {
  position: absolute; top: 16px; right: 18px;
  background: none; border: none; cursor: pointer;
  font-size: 13px; font-weight: 700; color: #aaa;
}
.ob-body { text-align: center; padding: 24px 4px 8px; min-height: 230px; display: flex; flex-direction: column; justify-content: center; }
.ob-emoji { font-size: 60px; margin-bottom: 18px; }
.ob-title { font-size: 21px; font-weight: 900; color: #2c3e50; margin: 0 0 12px; }
.ob-desc { font-size: 14px; color: #666; line-height: 1.7; margin: 0; }

.ob-dots { display: flex; justify-content: center; gap: 8px; margin: 20px 0; }
.ob-dot { width: 8px; height: 8px; border-radius: 50%; background: #dde2d6; cursor: pointer; transition: 0.25s; }
.ob-dot.active { width: 22px; border-radius: 4px; background: #5a9461; }

.ob-next { height: 52px; background: #333; color: #fff; border: none; border-radius: 16px; font-size: 16px; font-weight: 800; cursor: pointer; transition: 0.2s; }
.ob-next:active { transform: scale(0.97); }
</style>