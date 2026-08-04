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

const props = defineProps({ step: { type: String, required: true } });

const stages = [
  { key: 'safe',  label: '安全交易' },
  { key: 'scan',  label: '掃碼確認' },
  { key: 'price', label: '確認金額' },
  { key: 'done',  label: '完成' }
];

// 'seller-confirm-price' 跟 'price' 是同一個「確認金額」階段的一體兩面（買家輸入／賣家確認）
const STEP_TO_INDEX = {
  'safe-wait': 0,
  'scan': 1,
  'price': 2,
  'seller-confirm-price': 2,
  'done': 3
};

const activeIndex = computed(() => STEP_TO_INDEX[props.step] ?? 0);
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
