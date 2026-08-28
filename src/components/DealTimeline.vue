<template>
  <div class="dt-row">
    <template v-for="(s, i) in stages" :key="s.key">
      <div class="dt-step" :class="{ done: i < activeIndex, active: i === activeIndex }">
        <span class="dt-dot">{{ i < activeIndex ? '✓' : i + 1 }}</span>
        <span class="dt-label">{{ s.label }}</span>
      </div>
      <div v-if="i < stages.length - 1" class="dt-line" :class="{ done: i < activeIndex }"></div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { enforceQrScan } from './tradeSettings.js';

const props = defineProps({ step: { type: String, required: true } });

// 管理員關掉掃碼驗證時，流程真的少一站，時間軸就不該再畫出一個永遠走不到的
// 圓點——使用者會以為自己漏了一步。
const stages = computed(() => [
  { key: 'safe',  label: '安全交易' },
  ...(enforceQrScan.value ? [{ key: 'scan', label: '掃碼確認' }] : []),
  { key: 'price', label: '確認金額' },
  { key: 'done',  label: '完成' }
]);

const activeIndex = computed(() => {
  // 'seller-confirm-price' 跟 'price' 是同一個「確認金額」階段的一體兩面
  const key = { 'safe-wait': 'safe', scan: 'scan', price: 'price', 'seller-confirm-price': 'price', done: 'done' }[props.step];
  const i = stages.value.findIndex((s) => s.key === key);
  return i < 0 ? 0 : i;
});
</script>

<style scoped>
.dt-row {
  display: flex; align-items: center;
  padding: calc(env(safe-area-inset-top, 44px) + 14px) 20px 10px;
  flex-shrink: 0;
}
.dt-step { display: flex; flex-direction: column; align-items: center; gap: 5px; flex-shrink: 0; }
.dt-dot {
  width: 24px; height: 24px; border-radius: 50%;
  display: grid; place-items: center;
  font-size: 11px; font-weight: 800;
  background: #e8e8e8; color: #999;
  transition: 0.25s;
}
.dt-step.active .dt-dot { background: #1a1a1a; color: #fff; }
.dt-step.done .dt-dot { background: #43a047; color: #fff; }
.dt-label { font-size: 10px; font-weight: 700; color: #aaa; white-space: nowrap; }
.dt-step.active .dt-label { color: #1a1a1a; }
.dt-step.done .dt-label { color: #43a047; }
.dt-line { flex: 1; height: 2px; background: #e8e8e8; margin: 0 4px 16px; transition: 0.25s; }
.dt-line.done { background: #43a047; }
</style>
