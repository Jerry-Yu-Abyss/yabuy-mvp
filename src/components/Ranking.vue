<template>
  <div class="ranking-root">
    <div v-if="loading" class="state-hint">
      <div class="loader-dots"><span>.</span><span>.</span><span>.</span></div>
      <p>統計本月交易資料…</p>
    </div>

    <p v-else-if="errorMsg" class="error-box">⚠️ {{ errorMsg }}</p>

    <template v-else>
      <!-- 站台總覽（即時現況，非時間區間統計） -->
      <div class="overview-row">
        <div class="ov-chip">
          <span class="ov-num">{{ overview.activeProducts }}</span>
          <span class="ov-label">已上架商品</span>
        </div>
        <div class="ov-chip">
          <span class="ov-num">{{ overview.totalUsers }}</span>
          <span class="ov-label">註冊用戶</span>
        </div>
      </div>

      <p class="scope-hint">統計區間：{{ monthLabel }}（依成交時間）</p>

      <!-- ① 院所交易排行榜（直方圖） -->
      <section class="rank-card">
        <header class="card-head">
          <h3 class="card-title">本月院所交易排行</h3>
          <span class="card-sub">已完成交易件數</span>
        </header>

        <div v-if="collegeRank.some(c => c.count > 0)" class="histogram">
          <div v-for="c in collegeRank" :key="c.college" class="hist-col">
            <span class="hist-value">{{ c.count }}</span>
            <div class="hist-bar-track">
              <div
                class="hist-bar"
                :class="{ top: c.count > 0 && c.count === maxCollegeCount }"
                :style="{ height: barHeight(c.count, maxCollegeCount) }"
              ></div>
            </div>
            <span class="hist-label" :title="c.college">{{ c.short }}</span>
          </div>
        </div>
        <p v-else class="empty-note">本月尚無可歸類的已完成交易。</p>

        <p v-if="unattributed > 0" class="foot-note">
          另有 {{ unattributed }} 筆本月成交因買賣雙方皆未設定學院，無法歸類。
        </p>
      </section>

      <!-- ② 本月買賣數量前 10 使用者（水平條圖） -->
      <section class="rank-card">
        <header class="card-head">
          <h3 class="card-title">本月交易王 TOP 10</h3>
          <span class="card-sub">買 + 賣 完成件數</span>
        </header>

        <div v-if="topUsers.length > 0" class="hbar-list">
          <div v-for="(u, i) in topUsers" :key="u.uid" class="hbar-row">
            <span class="hbar-rank" :class="rankClass(i)">{{ i + 1 }}</span>
            <span class="hbar-name" :title="u.name">{{ u.name }}</span>
            <div class="hbar-track">
              <div class="hbar-fill" :style="{ width: barWidth(u.total, maxUserTotal) }"></div>
            </div>
            <span class="hbar-value">{{ u.total }}</span>
          </div>
        </div>
        <p v-else class="empty-note">本月尚無完成交易的使用者。</p>
      </section>

      <!-- ③ 已完成循環利用累計 -->
      <section class="rank-card">
        <header class="card-head">
          <h3 class="card-title">循環利用累計</h3>
          <span class="card-sub">全站歷史總計</span>
        </header>

        <div class="stat-grid">
          <div class="stat-cell">
            <span class="stat-num">{{ cumulative.items }}</span>
            <span class="stat-label">件商品被接手</span>
          </div>
          <div class="stat-cell">
            <span class="stat-num">${{ cumulative.amount.toLocaleString() }}</span>
            <span class="stat-label">循環總金額</span>
          </div>
          <div class="stat-cell">
            <span class="stat-num">{{ cumulative.participants }}</span>
            <span class="stat-label">位同學參與</span>
          </div>
          <div class="stat-cell">
            <span class="stat-num">${{ cumulative.avg.toLocaleString() }}</span>
            <span class="stat-label">平均成交金額</span>
          </div>
        </div>

        <p class="foot-note">每一件被接手的物品，都是少一件被丟棄的浪費。</p>
      </section>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { db } from '@/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { subjectData } from './Subject.js';

// 學院清單與 List.vue 個人資料表單同源，確保兩邊選項一致
const colleges = subjectData
  .map((c) => c.college)
  .filter((name) => !name.startsWith('校定必修'));

// 直方圖橫向空間有限（面板寬度 ~330px 要塞 5 根），長學院名一定爆版，
// 因此軸標籤用縮寫，完整名稱放 title 供長按/hover 查看。
const SHORT_NAME = {
  '醫學暨健康學院': '醫健',
  '資訊電機學院': '資電',
  '管理暨社會科學學院': '管社',
  '創意設計學院': '創設',
  '護理學院': '護理'
};

const loading = ref(true);
const errorMsg = ref('');
const collegeRank = ref([]);
const topUsers = ref([]);
const unattributed = ref(0);
const cumulative = ref({ items: 0, amount: 0, participants: 0, avg: 0 });
const overview = ref({ activeProducts: 0, totalUsers: 0 });

const now = new Date();
const monthLabel = `${now.getFullYear()} 年 ${now.getMonth() + 1} 月`;

const maxCollegeCount = computed(() =>
  Math.max(0, ...collegeRank.value.map((c) => c.count))
);
const maxUserTotal = computed(() =>
  Math.max(0, ...topUsers.value.map((u) => u.total))
);

// 高度/寬度都保留最小可見值，讓「有資料但數量很少」不會看起來像沒有資料
const barHeight = (v, max) => (!max || !v ? '2px' : `${Math.max(4, (v / max) * 100)}%`);
const barWidth = (v, max) => (!max || !v ? '2px' : `${Math.max(4, (v / max) * 100)}%`);
const rankClass = (i) => (i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '');

const toMillis = (ts) => {
  if (!ts) return null;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts.seconds != null) return ts.seconds * 1000;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d.getTime();
};

const loadRanking = async () => {
  loading.value = true;
  errorMsg.value = '';
  try {
    const [oSnap, uSnap, pSnap] = await Promise.all([
      getDocs(collection(db, 'orders')),
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'products'))
    ]);
    const orders = oSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const users = uSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const products = pSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // 站台總覽：即時現況，跟下面「本月／歷史交易」統計不同維度，分開算
    overview.value = {
      activeProducts: products.filter((p) => p.status === 'active').length,
      totalUsers: users.length
    };

    const userCollege = {};
    const userName = {};
    users.forEach((u) => {
      userCollege[u.id] = u.college || '';
      userName[u.id] = u.displayName || '匿名同學';
    });

    const completed = orders.filter((o) => o.status === 'completed');

    // 成交時間用 updatedAt（狀態改為 completed 那次寫入），舊資料缺漏時退回 createdAt
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
    const thisMonth = completed.filter((o) => {
      const t = toMillis(o.updatedAt) ?? toMillis(o.createdAt);
      return t != null && t >= monthStart && t < monthEnd;
    });

    // ── ① 院所排行 ──
    // 一筆成交同時計入買方與賣方所屬學院（雙方都參與了這次循環）。
    // 雙方都沒設學院的訂單無法歸類，另外計數並在畫面上據實說明。
    const collegeCount = {};
    colleges.forEach((c) => { collegeCount[c] = 0; });
    let noCollege = 0;
    thisMonth.forEach((o) => {
      const bc = userCollege[o.buyerId];
      const sc = userCollege[o.sellerId];
      if (bc && collegeCount[bc] != null) collegeCount[bc]++;
      if (sc && collegeCount[sc] != null) collegeCount[sc]++;
      if (!bc && !sc) noCollege++;
    });
    unattributed.value = noCollege;
    collegeRank.value = colleges
      .map((c) => ({ college: c, short: SHORT_NAME[c] || c, count: collegeCount[c] }))
      .sort((a, b) => b.count - a.count);

    // ── ② 本月買賣數量前 10 ──
    const tally = {};
    const bump = (uid) => {
      if (!uid) return;
      tally[uid] = (tally[uid] || 0) + 1;
    };
    thisMonth.forEach((o) => { bump(o.buyerId); bump(o.sellerId); });
    topUsers.value = Object.entries(tally)
      .map(([uid, total]) => ({ uid, total, name: userName[uid] || '已離開的用戶' }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // ── ③ 循環利用累計（不限本月）──
    const amount = completed.reduce(
      (sum, o) => sum + (Number(o.finalPrice) || Number(o.productPrice) || 0),
      0
    );
    const participants = new Set();
    completed.forEach((o) => {
      if (o.buyerId) participants.add(o.buyerId);
      if (o.sellerId) participants.add(o.sellerId);
    });
    cumulative.value = {
      items: completed.length,
      amount,
      participants: participants.size,
      avg: completed.length ? Math.round(amount / completed.length) : 0
    };
  } catch (e) {
    console.error('[Ranking] 排行榜統計失敗：', e);
    errorMsg.value = '讀取資料失敗，請確認網路連線後再試。';
  } finally {
    loading.value = false;
  }
};

onMounted(loadRanking);
</script>

<style scoped>
.ranking-root { display: flex; flex-direction: column; gap: 16px; }

.state-hint { text-align: center; padding: 60px 0; color: #8a958d; font-size: 13px; }
.loader-dots span {
  display: inline-block; font-size: 26px; font-weight: 900; color: #acc6b1;
  animation: blink 1.2s infinite;
}
.loader-dots span:nth-child(2) { animation-delay: 0.2s; }
.loader-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes blink { 0%, 80%, 100% { opacity: 0.25; } 40% { opacity: 1; } }

.error-box {
  background: #fff5f4; color: #b3423a; border: 1px solid #f0c8c4;
  border-radius: 14px; padding: 14px; font-size: 13px; font-weight: 700;
}

.overview-row { display: flex; gap: 10px; }
.ov-chip {
  flex: 1; background: #fff; border-radius: 16px; padding: 14px 12px;
  box-shadow: 0 2px 10px rgba(47, 74, 58, 0.06);
  display: flex; flex-direction: column; align-items: center; gap: 4px;
}
.ov-num { font-size: 22px; font-weight: 900; color: #2f4a3a; line-height: 1.1; }
.ov-label { font-size: 11px; color: #7f8c8d; font-weight: 700; }

.scope-hint { margin: 0 0 2px 4px; font-size: 12px; color: #8a958d; font-weight: 700; }

.rank-card {
  background: #fff;
  border-radius: 18px;
  padding: 18px 16px;
  box-shadow: 0 2px 10px rgba(47, 74, 58, 0.06);
}

.card-head { margin-bottom: 16px; }
.card-title { margin: 0; font-size: 15px; font-weight: 850; color: #2f4a3a; }
.card-sub { font-size: 11px; color: #a8b2a9; font-weight: 700; }

.empty-note {
  margin: 0; padding: 22px 0; text-align: center;
  font-size: 13px; color: #a8b2a9;
}

.foot-note {
  margin: 14px 0 0; font-size: 11px; color: #a8b2a9;
  line-height: 1.6; text-align: center;
}

/* ── ① 直方圖 ── */
.histogram {
  display: flex; align-items: flex-end; justify-content: space-between;
  gap: 8px; height: 170px;
}
.hist-col { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; height: 100%; }
.hist-value { font-size: 13px; font-weight: 900; color: #2f4a3a; margin-bottom: 4px; flex-shrink: 0; }
.hist-bar-track { flex: 1; width: 100%; display: flex; align-items: flex-end; }
.hist-bar {
  width: 100%; border-radius: 8px 8px 3px 3px;
  background: linear-gradient(180deg, #acc6b1, #7ba384);
  transition: height 0.5s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.hist-bar.top { background: linear-gradient(180deg, #5a9461, #2f4a3a); }
.hist-label {
  margin-top: 8px; font-size: 11px; font-weight: 800; color: #6b7a6f;
  flex-shrink: 0; white-space: nowrap;
}

/* ── ② 水平條圖 ── */
.hbar-list { display: flex; flex-direction: column; gap: 11px; }
.hbar-row { display: flex; align-items: center; gap: 9px; }

.hbar-rank {
  width: 21px; height: 21px; flex-shrink: 0; border-radius: 50%;
  display: grid; place-items: center;
  font-size: 11px; font-weight: 900; color: #8a958d; background: #eef1ec;
}
.hbar-rank.gold   { background: #f2d98c; color: #6b5417; }
.hbar-rank.silver { background: #dfe4e2; color: #5c6663; }
.hbar-rank.bronze { background: #e8cdb5; color: #6f4f33; }

.hbar-name {
  width: 68px; flex-shrink: 0; font-size: 12px; font-weight: 700; color: #2f4a3a;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.hbar-track { flex: 1; min-width: 0; height: 15px; background: #f2f5f1; border-radius: 8px; overflow: hidden; }
.hbar-fill {
  height: 100%; border-radius: 8px;
  background: linear-gradient(90deg, #acc6b1, #5a9461);
  transition: width 0.5s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.hbar-value { width: 20px; flex-shrink: 0; text-align: right; font-size: 12px; font-weight: 900; color: #2f4a3a; }

/* ── ③ 累計數據 ── */
.stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.stat-cell {
  background: #f4f7f2; border-radius: 14px; padding: 15px 12px;
  display: flex; flex-direction: column; align-items: center; gap: 5px;
}
.stat-num { font-size: 21px; font-weight: 900; color: #2f4a3a; line-height: 1.1; }
.stat-label { font-size: 11px; color: #7f8c8d; font-weight: 700; text-align: center; }
</style>
