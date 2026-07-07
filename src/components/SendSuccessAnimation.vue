<template>
  <Teleport to="body">
    <Transition name="overlay-fade">
      <div v-if="visible" class="overlay" @click.stop>
        
        <!-- 背景漣漪 -->
        <div class="ripple" :class="{ 'ripple-expand': phase >= 2 }"></div>

        <!-- 紙飛機階段 -->
        <Transition name="plane-fly">
          <div v-if="phase === 1" class="plane-wrapper">
            <svg class="plane-svg" viewBox="0 0 64 64" fill="none">
              <!-- 紙飛機本體 -->
              <path d="M4 32 L60 8 L44 56 L30 38 Z" fill="white" opacity="0.95"/>
              <path d="M30 38 L44 56 L36 42 Z" fill="white" opacity="0.6"/>
              <path d="M4 32 L30 38 L60 8" stroke="white" stroke-width="1" opacity="0.4" fill="none"/>
              <!-- 飛行軌跡線 -->
              <path class="trail" d="M4 32 Q2 33 0 34" stroke="white" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
            </svg>
            <!-- 尾跡粒子 -->
            <div class="trail-particle p1"></div>
            <div class="trail-particle p2"></div>
            <div class="trail-particle p3"></div>
          </div>
        </Transition>

        <!-- 爆炸粒子 -->
        <div v-if="phase >= 2" class="burst-container">
          <div v-for="i in 12" :key="i" class="burst-dot" :style="getBurstStyle(i)"></div>
        </div>

        <!-- 勾勾階段 -->
        <Transition name="check-pop">
          <div v-if="phase >= 2" class="check-wrapper">
            <svg class="check-svg" viewBox="0 0 64 64" fill="none">
              <circle class="check-circle" cx="32" cy="32" r="28" 
                stroke="white" stroke-width="3" 
                stroke-dasharray="176" :stroke-dashoffset="circleOffset"/>
              <polyline class="check-mark" points="18,33 27,43 46,22" 
                stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"
                stroke-dasharray="40" :stroke-dashoffset="checkOffset"/>
            </svg>
          </div>
        </Transition>

        <!-- 文字提示 -->
        <Transition name="text-rise">
          <div v-if="phase >= 2" class="success-text">
            <p class="main-text">訊息已送出！</p>
            <p class="sub-text">賣家將盡快與你聯繫</p>
          </div>
        </Transition>

      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch, onUnmounted } from 'vue';

const props = defineProps({
  visible: { type: Boolean, default: false }
});

const emit = defineEmits(['done']);

// 動畫階段： 0=隱藏, 1=飛機飛行, 2=勾勾出現
const phase = ref(0);
const circleOffset = ref(176);
const checkOffset = ref(40);

let timers = [];

const clearTimers = () => timers.forEach(clearTimeout);

const runAnimation = () => {
  clearTimers();
  phase.value = 1;
  circleOffset.value = 176;
  checkOffset.value = 40;

  // 飛機飛行 600ms 後切換到勾勾
  timers.push(setTimeout(() => {
    phase.value = 2;
    // 圓圈描邊動畫
    setTimeout(() => { circleOffset.value = 0; }, 50);
    // 勾勾描邊動畫
    setTimeout(() => { checkOffset.value = 0; }, 300);
  }, 700));

  // 2.2 秒後自動關閉
  timers.push(setTimeout(() => {
    emit('done');
  }, 2500));
};

watch(() => props.visible, (val) => {
  if (val) runAnimation();
  else { clearTimers(); phase.value = 0; }
});

onUnmounted(clearTimers);

// 爆炸粒子樣式
const getBurstStyle = (i) => {
  const angle = (i - 1) * 30;
  const distance = 55 + Math.random() * 25;
  const size = 5 + Math.floor(Math.random() * 5);
  const colors = ['#fff', '#a2b2f7', '#acc6b1', '#f3d18e', '#d17a74'];
  return {
    '--angle': `${angle}deg`,
    '--dist': `${distance}px`,
    width: `${size}px`,
    height: `${size}px`,
    background: colors[i % colors.length],
    animationDelay: `${(i % 4) * 40}ms`,
  };
};
</script>

<style scoped>
/* ── 遮罩 ── */
.overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(30, 35, 28, 0.82);
  backdrop-filter: blur(6px);
  display: flex; flex-direction: column;
  justify-content: center; align-items: center;
  gap: 28px;
}

/* ── 背景漣漪 ── */
.ripple {
  position: absolute;
  width: 80px; height: 80px;
  border-radius: 50%;
  background: rgba(162, 178, 247, 0.15);
  transform: scale(1);
  transition: none;
}
.ripple-expand {
  animation: rippleOut 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
}
@keyframes rippleOut {
  to { transform: scale(10); opacity: 0; }
}

/* ── 紙飛機 ── */
.plane-wrapper {
  position: relative;
  display: flex; align-items: center; justify-content: center;
  animation: planeFly 0.7s cubic-bezier(0.25, 0.1, 0.25, 1) forwards;
}
@keyframes planeFly {
  0%   { transform: translateX(-80px) translateY(20px) rotate(-10deg) scale(0.7); opacity: 0; }
  30%  { opacity: 1; }
  70%  { transform: translateX(10px) translateY(-8px) rotate(5deg) scale(1.1); }
  100% { transform: translateX(120px) translateY(-40px) rotate(15deg) scale(0.5); opacity: 0; }
}

.plane-svg { width: 72px; height: 72px; filter: drop-shadow(0 0 12px rgba(162,178,247,0.8)); }

/* 尾跡粒子 */
.trail-particle {
  position: absolute;
  width: 6px; height: 6px;
  border-radius: 50%;
  background: rgba(162, 178, 247, 0.8);
  animation: trailFade 0.5s ease-out infinite;
}
.p1 { left: -10px; top: 50%; animation-delay: 0ms; }
.p2 { left: -22px; top: 45%; animation-delay: 80ms; width: 4px; height: 4px; }
.p3 { left: -16px; top: 55%; animation-delay: 150ms; width: 5px; height: 5px; }
@keyframes trailFade {
  0%   { opacity: 0.9; transform: scale(1); }
  100% { opacity: 0; transform: scale(0.2) translateX(-8px); }
}

/* ── 爆炸粒子 ── */
.burst-container {
  position: absolute;
  pointer-events: none;
}
.burst-dot {
  position: absolute;
  border-radius: 50%;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  animation: burstFly 0.55s cubic-bezier(0.215, 0.61, 0.355, 1) forwards;
}
@keyframes burstFly {
  0%   { transform: translate(-50%, -50%) scale(1); opacity: 1; }
  100% {
    transform: translate(
      calc(-50% + cos(var(--angle)) * var(--dist)),
      calc(-50% + sin(var(--angle)) * var(--dist))
    ) scale(0);
    opacity: 0;
  }
}

/* ── 勾勾 ── */
.check-wrapper {
  position: relative;
  animation: checkPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
@keyframes checkPop {
  0%   { transform: scale(0.4); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

.check-svg { width: 90px; height: 90px; filter: drop-shadow(0 0 16px rgba(172, 198, 177, 0.7)); }

.check-circle {
  stroke: #acc6b1;
  transition: stroke-dashoffset 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  transform-origin: center;
  transform: rotate(-90deg);
}

.check-mark {
  stroke: white;
  transition: stroke-dashoffset 0.4s cubic-bezier(0.4, 0, 0.2, 1) 0.2s;
}

/* ── 文字 ── */
.success-text { text-align: center; }
.main-text {
  font-size: 20px; font-weight: 800;
  color: white; letter-spacing: 0.04em;
  margin: 0 0 6px;
}
.sub-text {
  font-size: 14px; color: rgba(255,255,255,0.55);
  margin: 0; letter-spacing: 0.02em;
}

/* ── Transitions ── */
.overlay-fade-enter-active { transition: opacity 0.25s ease; }
.overlay-fade-leave-active { transition: opacity 0.35s ease; }
.overlay-fade-enter-from,
.overlay-fade-leave-to   { opacity: 0; }

.plane-fly-leave-active { transition: opacity 0.2s; }
.plane-fly-leave-to     { opacity: 0; }

.check-pop-enter-active { transition: all 0s; } /* handled by keyframe */

.text-rise-enter-active { transition: all 0.4s cubic-bezier(0.34, 1.3, 0.64, 1) 0.3s; }
.text-rise-enter-from   { opacity: 0; transform: translateY(12px); }
</style>