<template>
  <div class="indicate-page">
    <!-- 頂部標題 -->
    <div class="indicate-header">
      <div>
        <h1 class="page-title">📊 營運指標儀表板</h1>
        <p class="page-sub">YaBuy 核心健康度監控</p>
      </div>
      <button class="refresh-btn" :disabled="loading" @click="loadMetrics">
        {{ loading ? '計算中…' : '↻ 重新整理' }}
      </button>
    </div>

    <!-- 總覽小卡 -->
    <div class="overview-row">
      <div class="ov-chip"><span class="ov-num">{{ stats.users }}</span><span class="ov-label">用戶</span></div>
      <div class="ov-chip"><span class="ov-num">{{ stats.products }}</span><span class="ov-label">商品</span></div>
      <div class="ov-chip"><span class="ov-num">{{ stats.orders }}</span><span class="ov-label">訂單</span></div>
      <div class="ov-chip"><span class="ov-num">{{ stats.completed }}</span><span class="ov-label">已成交</span></div>
    </div>

    <p v-if="lastUpdated" class="updated-at">資料更新於 {{ lastUpdated }}</p>
    <p v-if="errorMsg" class="error-box">⚠️ {{ errorMsg }}</p>

    <!-- 指標卡片 -->
    <div class="metric-list">
      <div v-for="m in metrics" :key="m.key" class="metric-card" :class="m.status">
        <div class="metric-top">
          <span class="metric-icon">{{ m.icon }}</span>
          <span class="metric-name">{{ m.title }}</span>
          <span class="status-pill" :class="m.status">{{ statusLabel(m.status) }}</span>
        </div>

        <div class="metric-value-row">
          <span class="metric-value">{{ m.display }}</span>
          <span v-if="m.approx" class="approx-tag">近似值</span>
        </div>

        <div class="metric-bar-track" v-if="m.progress !== null">
          <div class="metric-bar-fill" :class="m.status" :style="{ width: m.progress + '%' }"></div>
        </div>

        <div class="metric-foot">
          <span class="metric-target">目標：{{ m.target }}</span>
        </div>
        <p class="metric-note">{{ m.note }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { db } from '@/firebase';
import { collection, getDocs } from 'firebase/firestore';

const loading = ref(true);
const errorMsg = ref('');
const lastUpdated = ref('');
const stats = ref({ users: 0, products: 0, orders: 0, completed: 0 });
const metrics = ref([]);

const DAY = 86400000;

// Firestore Timestamp / Date / 數字 都轉成毫秒
const toMillis = (ts) => {
  if (!ts) return null;
  if (typeof ts === 'number') return ts;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts.seconds != null) return ts.seconds * 1000;
  if (ts instanceof Date) return ts.getTime();
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d.getTime();
};

const statusLabel = (s) => ({
  pass: '✅ 達標',
  fail: '⚠️ 未達標',
  nodata: '— 資料不足',
  todo: '🔧 待建置'
}[s] || s);

const loadMetrics = async () => {
  loading.value = true;
  errorMsg.value = '';
  try {
    const [pSnap, oSnap, uSnap] = await Promise.all([
      getDocs(collection(db, 'products')),
      getDocs(collection(db, 'orders')),
      getDocs(collection(db, 'users'))
    ]);
    const products = pSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const orders   = oSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const users    = uSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const now = Date.now();

    const completedOrders = orders.filter(o => o.status === 'completed');
    const failedOrders    = orders.filter(o => o.status === 'failed');

    stats.value = {
      users: users.length,
      products: products.length,
      orders: orders.length,
      completed: completedOrders.length
    };

    // ── 指標 1：交易完成率 ── completed / 全部訂單
    const completionRate = orders.length ? (completedOrders.length / orders.length) * 100 : null;

    // ── 指標 2：第 7 天留存率（近似）──
    // 沒有登入埋點，用「註冊滿 7 天的用戶中，註冊 7 天後仍有上架/交易行為的比例」近似
    const lastActivity = {};
    const mark = (uid, ms) => { if (uid && ms && (!lastActivity[uid] || ms > lastActivity[uid])) lastActivity[uid] = ms; };
    products.forEach(p => mark(p.sellerId, toMillis(p.createdAt)));
    orders.forEach(o => { const t = toMillis(o.updatedAt) || toMillis(o.createdAt); mark(o.buyerId, t); mark(o.sellerId, t); });
    const eligible = users.filter(u => { const c = toMillis(u.createdAt); return c && (now - c) >= 7 * DAY; });
    const retained = eligible.filter(u => { const c = toMillis(u.createdAt); const la = lastActivity[u.id]; return la && (la - c) >= 7 * DAY; });
    const retentionRate = eligible.length ? (retained.length / eligible.length) * 100 : null;

    // ── 指標 3：商品平均在架時間（已售）── soldAt - createdAt
    const sellDays = products
      .filter(p => p.status === 'sold')
      .map(p => { const c = toMillis(p.createdAt), s = toMillis(p.soldAt); return (c && s && s >= c) ? (s - c) / DAY : null; })
      .filter(v => v != null);
    const avgSellDays = sellDays.length ? (sellDays.reduce((a, b) => a + b, 0) / sellDays.length) : null;

    // ── 指標 4：交易糾紛率 ── 尚無申訴機制，先以「交易失敗率」當相關替代
    const failRate = orders.length ? (failedOrders.length / orders.length) * 100 : null;

    // ── 指標 5：NPS ── 尚未收集問卷

    metrics.value = [
      {
        key: 'completion',
        icon: '🤝',
        title: '交易完成率',
        target: '> 60%',
        ...buildHigherBetter(completionRate, 60, '%', orders.length === 0)
      },
      {
        key: 'retention',
        icon: '🔁',
        title: '第 7 天留存率',
        target: '> 30%',
        approx: true,
        ...buildHigherBetter(retentionRate, 30, '%', eligible.length === 0),
        note: eligible.length === 0
          ? '尚無註冊滿 7 天的用戶，無法計算。'
          : `近似值：${retained.length}/${eligible.length} 位註冊滿 7 天的用戶仍有後續行為。精準留存需加入 lastActiveAt 登入埋點。`
      },
      {
        key: 'selltime',
        icon: '⏱️',
        title: '商品平均在架時間',
        target: '< 7 天',
        ...buildLowerBetter(avgSellDays, 7, ' 天', sellDays.length === 0),
        note: sellDays.length === 0
          ? '尚無含 soldAt 的已售商品（成交自動下架後才會記錄）。'
          : `根據 ${sellDays.length} 件已售商品的上架到售出時間計算。`
      },
      {
        key: 'dispute',
        icon: '🛡️',
        title: '交易糾紛率',
        target: '< 2%',
        status: 'todo',
        display: failRate != null ? `失敗率 ${failRate.toFixed(1)}%` : '—',
        progress: null,
        note: '尚未建立申訴機制，無法計算真正糾紛率。上方為「交易失敗率」(status=failed) 當相關替代。建議新增 disputes 集合或訂單 disputed 狀態。'
      },
      {
        key: 'nps',
        icon: '⭐',
        title: 'NPS 淨推薦值',
        target: '> 50',
        status: 'todo',
        display: '—',
        progress: null,
        note: '需另外收集 0–10 推薦評分問卷。建議成交後彈出評分並寫入 feedback 集合，再以 (推薦者%−批評者%) 計算。'
      }
    ];

    lastUpdated.value = new Date().toLocaleString('zh-TW', { hour12: false });
  } catch (e) {
    console.error('[Indicate] 指標計算失敗：', e);
    errorMsg.value = '讀取資料失敗，請確認 Firestore 規則允許讀取 products / orders / users。';
  } finally {
    loading.value = false;
  }
};

// 越高越好（完成率、留存率）
function buildHigherBetter(value, targetNum, unit, noData) {
  if (noData || value == null) return { status: 'nodata', display: '—', progress: null, note: '資料不足，無法計算。' };
  return {
    status: value >= targetNum ? 'pass' : 'fail',
    display: value.toFixed(1) + unit,
    progress: Math.min(100, (value / targetNum) * 100),
    note: ''
  };
}

// 越低越好（在架時間）
function buildLowerBetter(value, targetNum, unit, noData) {
  if (noData || value == null) return { status: 'nodata', display: '—', progress: null, note: '資料不足，無法計算。' };
  return {
    status: value <= targetNum ? 'pass' : 'fail',
    display: value.toFixed(1) + unit,
    // 進度條：越接近 0 越滿，超過目標則接近滿格示警
    progress: Math.min(100, (value / targetNum) * 100),
    note: ''
  };
}

onMounted(loadMetrics);
</script>

<style scoped>
.indicate-page { min-height: 100%; background: linear-gradient(180deg, #d1d9c6 0%, #f8faf5 140px); padding: 20px 18px 100px; }

.indicate-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 18px; }
.page-title { font-size: 22px; font-weight: 900; color: #2c3e50; margin: 0; }
.page-sub { font-size: 12px; color: #7a8a6f; font-weight: 600; margin: 4px 0 0; }
.refresh-btn { flex-shrink: 0; background: #333; color: #fff; border: none; border-radius: 14px; padding: 10px 14px; font-size: 13px; font-weight: 800; cursor: pointer; transition: 0.2s; }
.refresh-btn:disabled { opacity: 0.5; }
.refresh-btn:active { transform: scale(0.95); }

.overview-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 10px; }
.ov-chip { background: rgba(255,255,255,0.7); border-radius: 14px; padding: 10px 4px; display: flex; flex-direction: column; align-items: center; gap: 2px; }
.ov-num { font-size: 18px; font-weight: 900; color: #2c3e50; }
.ov-label { font-size: 10px; font-weight: 700; color: #888; }

.updated-at { font-size: 11px; color: #aaa; margin: 4px 2px 14px; }
.error-box { background: #fff1f0; color: #c0392b; font-size: 13px; font-weight: 600; padding: 12px 14px; border-radius: 12px; margin: 0 0 14px; }

.metric-list { display: flex; flex-direction: column; gap: 12px; }
.metric-card { background: #fff; border-radius: 18px; padding: 16px; box-shadow: 0 4px 16px rgba(0,0,0,0.05); border-left: 5px solid #ccc; }
.metric-card.pass { border-left-color: #5a9461; }
.metric-card.fail { border-left-color: #e67e22; }
.metric-card.nodata { border-left-color: #bbb; }
.metric-card.todo { border-left-color: #7f8fa6; }

.metric-top { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.metric-icon { font-size: 18px; }
.metric-name { font-size: 15px; font-weight: 850; color: #2c3e50; flex: 1; }
.status-pill { font-size: 11px; font-weight: 800; padding: 4px 9px; border-radius: 8px; white-space: nowrap; }
.status-pill.pass { background: rgba(90,148,97,0.15); color: #3d7a45; }
.status-pill.fail { background: #fdebd0; color: #b9650f; }
.status-pill.nodata { background: #eee; color: #888; }
.status-pill.todo { background: #eef1f6; color: #5b6b86; }

.metric-value-row { display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px; }
.metric-value { font-size: 28px; font-weight: 900; color: #2c3e50; line-height: 1; }
.approx-tag { font-size: 10px; font-weight: 800; color: #b9650f; background: #fdebd0; padding: 2px 7px; border-radius: 6px; }

.metric-bar-track { height: 7px; background: #f0f1ee; border-radius: 4px; overflow: hidden; margin-bottom: 10px; }
.metric-bar-fill { height: 100%; border-radius: 4px; transition: width 0.5s ease; }
.metric-bar-fill.pass { background: #5a9461; }
.metric-bar-fill.fail { background: #e67e22; }

.metric-foot { display: flex; justify-content: flex-end; }
.metric-target { font-size: 12px; font-weight: 700; color: #999; }
.metric-note { font-size: 12px; color: #777; line-height: 1.5; margin: 8px 0 0; }
</style>