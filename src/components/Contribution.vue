<template>
  <div class="contrib-root">
    <div v-if="loading" class="state-hint">
      <div class="loader-dots"><span>.</span><span>.</span><span>.</span></div>
      <p>統計您的循環貢獻…</p>
    </div>

    <p v-else-if="errorMsg" class="error-box">⚠️ {{ errorMsg }}</p>

    <template v-else>
      <!-- ── 主視覺：色塊拼接 × 液態玻璃 × 大字幕 ── -->
      <section class="hero-mosaic">
        <!-- 平台色彩色塊拼接：每塊對應一個等級，已達成的滿色、未達成的淡化，
             等級本身就是這面拼貼的進度條，不另外做一條進度列 -->
        <div class="mosaic-grid" aria-hidden="true">
          <div
            v-for="n in 5" :key="n"
            class="mosaic-tile"
            :class="[`t${n}`, { reached: n <= level, current: n === level }]"
          ></div>
        </div>

        <!-- 液態玻璃面板疊在色塊上，大字幕主體 -->
        <div class="hero-glass">
          <p class="hero-eyebrow">個人貢獻度</p>
          <div class="hero-level">
            <span class="lv-mark">Lv.</span>
            <span class="lv-num">{{ level }}</span>
          </div>
          <p class="hero-title">{{ tier.title }}</p>
          <p class="hero-sub">{{ tier.sub }}</p>
        </div>
      </section>

      <!-- ── 目前進度 ── -->
      <section class="stat-strip glass">
        <div class="stat-item">
          <strong>{{ total }}</strong>
          <span>累計循環</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <strong>{{ soldCount }}</strong>
          <span>賣出</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <strong>{{ boughtCount }}</strong>
          <span>買入</span>
        </div>
      </section>

      <!-- 下一級進度：已滿級就改成肯定句，不要留一條永遠滿格的空進度條 -->
      <section class="next-card glass">
        <template v-if="nextThreshold">
          <div class="next-head">
            <span class="next-label">距離 Lv.{{ level + 1 }} {{ nextTier.title }}</span>
            <span class="next-remain">還差 {{ nextThreshold - total }} 件</span>
          </div>
          <div class="next-track">
            <div class="next-fill" :style="{ width: nextPct + '%' }"></div>
          </div>
          <p class="next-foot">{{ total }} / {{ nextThreshold }} 件</p>
        </template>
        <template v-else>
          <p class="maxed">🌳 您已達到最高等級，是校園循環的中流砥柱。</p>
        </template>
      </section>

      <!-- ── 永續價值說明 ── -->
      <section class="value-card glass">
        <h3 class="value-title">您的每一次交易，都在延長物品的生命</h3>
        <p class="value-p">
          一件被接手的二手物品，代表少一次新品製造、少一份包裝運輸，
          也少一件被丟進垃圾車的資源。<strong>循環不是將就，是把價值留在校園裡。</strong>
        </p>

        <div class="value-metrics">
          <div class="vm-item">
            <span class="vm-num">{{ total }}</span>
            <span class="vm-label">件物品<br>被延續使用</span>
          </div>
          <div class="vm-item">
            <span class="vm-num">{{ total * 2 }}</span>
            <span class="vm-label">人次<br>參與這場循環</span>
          </div>
        </div>

        <p class="value-note">
          每筆交易都由買賣雙方共同完成，因此參與人次以雙方計算。
        </p>
      </section>

      <!-- ── 等級階梯 ── -->
      <section class="ladder-card glass">
        <h3 class="value-title">等級階梯</h3>
        <ul class="ladder">
          <li
            v-for="t in TIERS" :key="t.level"
            class="ladder-row"
            :class="{ reached: total >= t.min, current: t.level === level }"
          >
            <span class="ld-dot" :class="`t${t.level}`"></span>
            <span class="ld-lv">Lv.{{ t.level }}</span>
            <span class="ld-title">{{ t.title }}</span>
            <span class="ld-req">{{ t.min }} 件起</span>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { db, auth } from '@/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

/**
 * 等級門檻（買賣總和 → 等級）。
 * 需求給的是 {1:1, 5:2, 10:3, 30:4, 50:5}：key 是達到該等級所需的交易總數，
 * value 是等級。以「大於等於門檻」判定，未滿 1 件則為尚未開始的 Lv.0。
 */
const TIERS = [
  { level: 1, min: 1,  title: '循環新芽', sub: '你完成了第一次交易，讓一件物品有了新的主人。' },
  { level: 2, min: 5,  title: '循環常客', sub: '交易已成習慣，你正在把二手變成日常選項。' },
  { level: 3, min: 10, title: '循環推手', sub: '十件物品因你而延續，影響力開始擴散。' },
  { level: 4, min: 30, title: '循環達人', sub: '三十件的累積，是校園裡少見的長期投入。' },
  { level: 5, min: 50, title: '循環典範', sub: '你已是校園循環的中流砥柱，帶動整個社群。' }
];
const TIER_ZERO = {
  level: 0,
  title: '準備啟程',
  sub: '完成第一筆交易，就能點亮你的第一個等級。'
};

const loading = ref(true);
const errorMsg = ref('');
const soldCount = ref(0);
const boughtCount = ref(0);

const total = computed(() => soldCount.value + boughtCount.value);

const level = computed(() => {
  let lv = 0;
  for (const t of TIERS) if (total.value >= t.min) lv = t.level;
  return lv;
});
const tier = computed(() => TIERS.find((t) => t.level === level.value) || TIER_ZERO);
const nextTier = computed(() => TIERS.find((t) => t.level === level.value + 1) || null);
const nextThreshold = computed(() => nextTier.value?.min ?? null);
const nextPct = computed(() => {
  if (!nextThreshold.value) return 100;
  return Math.min(100, Math.round((total.value / nextThreshold.value) * 100));
});

/**
 * 只統計「自己」的已完成交易。
 * firestore.rules 已把 orders 收緊成只有 buyerId/sellerId 本人可讀，
 * 因此這兩個查詢都是讀自己的資料，不需要 Cloud Function 也不會被規則擋。
 * sellerId+createdAt / buyerId+createdAt 索引都已存在，status 用前端過濾。
 */
const load = async () => {
  const user = auth.currentUser;
  if (!user) {
    errorMsg.value = '請先登入才能查看個人貢獻度。';
    loading.value = false;
    return;
  }
  try {
    const [sSnap, bSnap] = await Promise.all([
      getDocs(query(collection(db, 'orders'), where('sellerId', '==', user.uid))),
      getDocs(query(collection(db, 'orders'), where('buyerId', '==', user.uid)))
    ]);
    const done = (snap) => snap.docs.filter((d) => d.data().status === 'completed').length;
    soldCount.value = done(sSnap);
    boughtCount.value = done(bSnap);
  } catch (e) {
    console.error('[Contribution] 讀取交易紀錄失敗：', e.code, e.message);
    errorMsg.value = '讀取失敗，請確認網路連線後再試。';
  } finally {
    loading.value = false;
  }
};

onMounted(load);
</script>

<style scoped>
.contrib-root {
  --green: #acc6b1;
  --ink: #2f4a3a;
  --sprout: #d8ecd9;
  --honey: #f2d98c;
  --glass: rgba(255, 255, 255, 0.55);
  display: flex; flex-direction: column; gap: 14px;
  color: var(--ink);
}

/* 液態玻璃：與 Landing.vue 的 .glass 同一套配方 */
.glass {
  background: var(--glass);
  backdrop-filter: blur(16px) saturate(1.2);
  -webkit-backdrop-filter: blur(16px) saturate(1.2);
  border: 1px solid rgba(255, 255, 255, 0.6);
  box-shadow: 0 8px 30px rgba(47, 74, 58, 0.08);
}

/* ── 主視覺 ── */
.hero-mosaic { position: relative; border-radius: 24px; overflow: hidden; min-height: 232px; }

/* 色塊拼接：五塊斜向排列，用平台色階由淺到深，代表五個等級 */
.mosaic-grid {
  position: absolute; inset: 0;
  display: grid; grid-template-columns: repeat(5, 1fr);
}
.mosaic-tile { transition: opacity 0.5s ease, transform 0.5s ease; opacity: 0.22; }
.mosaic-tile.t1 { background: var(--sprout); }
.mosaic-tile.t2 { background: var(--green); }
.mosaic-tile.t3 { background: #8fb397; }
.mosaic-tile.t4 { background: #5d8468; }
.mosaic-tile.t5 { background: var(--ink); }
.mosaic-tile.reached { opacity: 1; }
/* 目前等級那一塊微微上浮，讓視線落點明確 */
.mosaic-tile.current { transform: scaleY(1.06); }

.hero-glass {
  position: relative; z-index: 1; margin: 14px;
  border-radius: 18px; padding: 20px 18px;
  background: rgba(255, 255, 255, 0.62);
  backdrop-filter: blur(18px) saturate(1.25);
  -webkit-backdrop-filter: blur(18px) saturate(1.25);
  border: 1px solid rgba(255, 255, 255, 0.7);
  box-shadow: 0 8px 30px rgba(47, 74, 58, 0.1);
  text-align: center;
}
.hero-eyebrow { margin: 0 0 6px; font-size: 11px; font-weight: 800; letter-spacing: 2px; opacity: 0.6; }

/* 大字幕：等級數字本身就是主視覺 */
.hero-level { display: flex; align-items: baseline; justify-content: center; gap: 4px; }
.lv-mark { font-size: 20px; font-weight: 800; opacity: 0.55; }
.lv-num {
  font-size: clamp(60px, 22vw, 88px); font-weight: 900; line-height: 0.95;
  letter-spacing: -3px; color: var(--ink);
}
.hero-title { margin: 6px 0 4px; font-size: 20px; font-weight: 900; letter-spacing: 1px; }
.hero-sub { margin: 0; font-size: 12.5px; line-height: 1.7; opacity: 0.75; }

/* ── 統計條 ── */
.stat-strip { display: flex; align-items: center; border-radius: 18px; padding: 14px 10px; }
.stat-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px; }
.stat-item strong { font-size: 22px; font-weight: 900; line-height: 1; }
.stat-item span { font-size: 11px; font-weight: 700; opacity: 0.6; }
.stat-divider { width: 1px; align-self: stretch; background: rgba(47, 74, 58, 0.12); }

/* ── 下一級 ── */
.next-card { border-radius: 18px; padding: 16px 18px; }
.next-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
.next-label { font-size: 13px; font-weight: 800; }
.next-remain { font-size: 12px; font-weight: 800; color: #5d8468; }
.next-track { height: 8px; border-radius: 999px; background: rgba(47, 74, 58, 0.1); overflow: hidden; }
.next-fill {
  height: 100%; border-radius: 999px;
  background: linear-gradient(90deg, var(--green), var(--ink));
  transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}
.next-foot { margin: 8px 0 0; font-size: 11px; font-weight: 700; opacity: 0.55; text-align: right; }
.maxed { margin: 0; font-size: 13.5px; font-weight: 800; line-height: 1.7; text-align: center; }

/* ── 永續價值 ── */
.value-card, .ladder-card { border-radius: 18px; padding: 18px; }
.value-title { margin: 0 0 10px; font-size: 15px; font-weight: 900; line-height: 1.5; }
.value-p { margin: 0; font-size: 13px; line-height: 1.9; opacity: 0.82; }
.value-p strong { font-weight: 900; opacity: 1; }

.value-metrics { display: flex; gap: 10px; margin: 16px 0 10px; }
.vm-item {
  flex: 1; border-radius: 14px; padding: 14px 8px; text-align: center;
  background: rgba(172, 198, 177, 0.22);
  display: flex; flex-direction: column; align-items: center; gap: 5px;
}
.vm-num { font-size: 26px; font-weight: 900; line-height: 1; }
.vm-label { font-size: 10.5px; font-weight: 700; line-height: 1.5; opacity: 0.7; }
.value-note { margin: 0; font-size: 11px; line-height: 1.6; opacity: 0.5; }

/* ── 等級階梯 ── */
.ladder { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.ladder-row {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 8px; border-radius: 10px;
  font-size: 12.5px; opacity: 0.42; transition: 0.25s;
}
.ladder-row.reached { opacity: 1; }
.ladder-row.current { background: rgba(172, 198, 177, 0.28); }
.ld-dot { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
.ld-dot.t1 { background: var(--sprout); }
.ld-dot.t2 { background: var(--green); }
.ld-dot.t3 { background: #8fb397; }
.ld-dot.t4 { background: #5d8468; }
.ld-dot.t5 { background: var(--ink); }
.ld-lv { font-weight: 900; width: 38px; flex-shrink: 0; }
.ld-title { font-weight: 800; flex: 1; }
.ld-req { font-size: 11px; font-weight: 700; opacity: 0.6; flex-shrink: 0; }

/* ── 狀態 ── */
.state-hint { text-align: center; padding: 60px 0; color: #8a958d; font-size: 13px; }
.loader-dots span {
  display: inline-block; font-size: 26px; font-weight: 900; color: var(--green);
  animation: blink 1.2s infinite;
}
.loader-dots span:nth-child(2) { animation-delay: 0.2s; }
.loader-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes blink { 0%, 80%, 100% { opacity: 0.25; } 40% { opacity: 1; } }
.error-box {
  background: #fdecea; color: #b3423a; border-radius: 14px;
  padding: 14px 16px; font-size: 13px; font-weight: 700; text-align: center;
}
</style>
