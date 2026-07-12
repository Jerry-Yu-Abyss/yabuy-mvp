<template>
  <div class="landing" ref="rootEl">

    <!-- 動態流體背景 -->
    <div class="blobs" aria-hidden="true">
      <div class="blob b1"></div>
      <div class="blob b2"></div>
      <div class="blob b3"></div>
      <div class="blob b4"></div>
    </div>

    <!-- 導覽列（毛玻璃） -->
    <header class="nav glass">
      <div class="nav-logo">
        <span class="logo-mark">Ya</span>Buy
      </div>
      <button class="nav-login" @click="handleGoogleLogin" :disabled="loggingIn">
        <template v-if="loggingIn">登入中…</template>
        <template v-else>
          <span class="login-long">使用 Google 登入</span>
          <span class="login-short">登入</span>
        </template>
      </button>
    </header>

    <!-- Hero -->
    <section class="hero" @mousemove="onParallax" @mouseleave="resetParallax">
      <div class="hero-text">
        <p class="eyebrow">亞洲大學 · 校園二手循環平台</p>
        <h1 class="headline">好物，值得<br />在校園<span class="hl">多走一輪</span>。</h1>
        <p class="sub">
          拍照上架、當面交易、雙方確認 ——
          YaBuy 讓亞大人安心買賣二手，每一筆交易都被好好對待。
        </p>
        <div class="cta-row">
          <button class="cta-main" @click="handleGoogleLogin" :disabled="loggingIn">
            <svg class="g-icon" viewBox="0 0 24 24" width="18" height="18"><path fill="#fff" d="M21.35 11.1H12v2.9h5.35c-.5 2.5-2.6 3.9-5.35 3.9a6 6 0 1 1 0-12c1.5 0 2.9.55 4 1.45l2.15-2.15A9 9 0 1 0 12 21c5.2 0 8.7-3.65 8.7-8.8 0-.4-.05-.75-.35-1.1z"/></svg>
            {{ loggingIn ? '登入中…' : 'Google 登入，開始逛' }}
          </button>
          <a class="cta-sub" href="#pwa">如何安裝到手機 ↓</a>
        </div>
        <p v-if="loginError" class="login-error">{{ loginError }}</p>
      </div>

      <!-- 簽名元素：漂浮玻璃商品卡（視差微動） -->
      <div class="hero-cards" aria-hidden="true">
        <div class="p-card glass depth-1" :style="layer(18)">
          <div class="p-thumb t-book">📗</div>
          <div class="p-info"><strong>微積分（三版）</strong><span>$250 · 資工系</span></div>
          <div class="p-tag">教科書</div>
        </div>
        <div class="p-card glass depth-2" :style="layer(34)">
          <div class="p-thumb t-lamp">💡</div>
          <div class="p-info"><strong>宿舍檯燈</strong><span>$120 · 近全新</span></div>
          <div class="p-tag sold">已循環</div>
        </div>
        <div class="p-card glass depth-3" :style="layer(52)">
          <div class="p-thumb t-bike">🚲</div>
          <div class="p-info"><strong>通勤腳踏車</strong><span>$900 · 面交</span></div>
          <div class="p-tag">生活</div>
        </div>
      </div>
    </section>

    <!-- 理念 -->
    <section class="section reveal">
      <p class="sec-eyebrow">我們相信</p>
      <h2 class="sec-title">二手不是將就，是聰明的選擇</h2>
      <div class="idea-grid">
        <div class="idea-card glass">
          <div class="idea-icon">🤝</div>
          <h3>安心交易</h3>
          <p>雙方確認成交、金額互相核對、交易紀錄留存 —— 流程被設計來保護買賣雙方。</p>
        </div>
        <div class="idea-card glass">
          <div class="idea-icon">🌱</div>
          <h3>循環永續</h3>
          <p>每一件被接手的物品，都是少一件被丟棄的浪費。讓資源在校園裡持續流動。</p>
        </div>
        <div class="idea-card glass">
          <div class="idea-icon">🏫</div>
          <h3>校園限定</h3>
          <p>同校同學、走路可到的面交距離。教科書照學院系所分類，找書快狠準。</p>
        </div>
      </div>
    </section>

    <!-- 功能內容 -->
    <section class="section reveal">
      <p class="sec-eyebrow">你可以在 YaBuy</p>
      <h2 class="sec-title">從上架到成交，一條龍搞定</h2>
      <div class="feat-list">
        <div class="feat glass"><span class="f-no">拍</span><div><h4>30 秒上架</h4><p>拍張照、填價格，商品立刻出現在全校面前。</p></div></div>
        <div class="feat glass"><span class="f-no">找</span><div><h4>教科書精準配對</h4><p>照學院、系所分類瀏覽，開學找書不再大海撈針。</p></div></div>
        <div class="feat glass"><span class="f-no">約</span><div><h4>面交時間地點協調</h4><p>雙方確認時間與地點，交易當天即時掌握彼此狀態。</p></div></div>
        <div class="feat glass"><span class="f-no">評</span><div><h4>交易後互評</h4><p>成交後互相評價，讓認真的賣家與買家被看見。</p></div></div>
      </div>
    </section>

    <!-- PWA 設置短片 -->
    <section class="section reveal" id="pwa">
      <p class="sec-eyebrow">像 App 一樣使用</p>
      <h2 class="sec-title">30 秒，把 YaBuy 裝進手機</h2>
      <p class="sec-desc">YaBuy 是 PWA 網頁應用 —— 不用上架商店、不佔空間，加入主畫面後就像原生 App 一樣開啟。</p>

      <div class="pwa-wrap">
        <div class="video-frame glass">
          <video controls playsinline preload="metadata" poster="">
            <source src="/PWAdemo.mp4" type="video/mp4" />
            你的瀏覽器不支援影片播放。
          </video>
        </div>
        <div class="pwa-steps">
          <div class="step glass">
            <h4>📱 iPhone（Safari）</h4>
            <ol>
              <li>點底部「分享」按鈕</li>
              <li>選「加入主畫面」</li>
              <li>完成！主畫面出現 YaBuy</li>
            </ol>
          </div>
          <div class="step glass">
            <h4>🤖 Android（Chrome）</h4>
            <ol>
              <li>點右上「⋮」選單</li>
              <li>選「安裝應用程式」</li>
              <li>完成！像 App 一樣開啟</li>
            </ol>
          </div>
        </div>
      </div>
    </section>

    <!-- 尾段 CTA -->
    <section class="final-cta reveal">
      <h2>下一個好物，<br class="br-m" />可能正在等你。</h2>
      <button class="cta-main big" @click="handleGoogleLogin" :disabled="loggingIn">
        {{ loggingIn ? '登入中…' : '用 Google 登入 YaBuy' }}
      </button>
    </section>

    <footer class="foot">
      YaBuy · 亞洲大學校園二手循環平台
    </footer>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '@/firebase';

const emit = defineEmits(['login-success']);

/* ── Google 登入 ── */
const loggingIn = ref(false);
const loginError = ref('');
const handleGoogleLogin = async () => {
  loginError.value = '';
  loggingIn.value = true;
  try {
    await signInWithPopup(auth, googleProvider);
    emit('login-success');           // 交給 App.vue 收掉 Landing、進入主畫面
  } catch (e) {
    if (e.code !== 'auth/popup-closed-by-user') {
      loginError.value = '登入沒有成功，請再試一次。';
    }
  } finally {
    loggingIn.value = false;
  }
};

/* ── 視差微動（僅桌機滑鼠；手機改為橫滑卡片） ── */
const px = ref(0);
const py = ref(0);
const isTouch = ref(false);
let raf = null;
const onParallax = (e) => {
  if (isTouch.value || raf) return;
  raf = requestAnimationFrame(() => {
    const { innerWidth: w, innerHeight: h } = window;
    px.value = (e.clientX / w - 0.5) * 2;   // -1 ~ 1
    py.value = (e.clientY / h - 0.5) * 2;
    raf = null;
  });
};
const resetParallax = () => { px.value = 0; py.value = 0; };
const layer = (depth) => (isTouch.value ? {} : {
  transform: `translate3d(${(-px.value * depth).toFixed(1)}px, ${(-py.value * depth).toFixed(1)}px, 0)`
});

/* ── 進場顯示（IntersectionObserver） ── */
const rootEl = ref(null);
let io = null;
onMounted(() => {
  // 觸控裝置停用滑鼠視差（改用可橫滑的卡片流）
  isTouch.value = window.matchMedia('(hover: none)').matches;

  io = new IntersectionObserver(
    (entries) => entries.forEach(en => en.isIntersecting && en.target.classList.add('in')),
    { threshold: 0.15 }
  );
  rootEl.value?.querySelectorAll('.reveal').forEach(el => io.observe(el));
});
onUnmounted(() => { io?.disconnect(); if (raf) cancelAnimationFrame(raf); });
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=LXGW+WenKai+TC&family=Noto+Sans+TC:wght@400;500;700;900&display=swap');

/* ── tokens ── */
.landing {
  --green: #acc6b1;        /* 亞大綠：靈魂主色 */
  --ink:   #2f4a3a;        /* 深苔綠：標題墨色 */
  --paper: #f6f8f4;        /* 紙感米白 */
  --sprout:#d8ecd9;        /* 嫩芽綠 blob */
  --honey: #f2d98c;        /* 蜜黃：舊物的溫度 */
  --glass: rgba(255,255,255,.55);

  position: relative;
  height: 100vh;                   /* 舊瀏覽器 fallback */
  height: 100dvh;                  /* 固定高度 → Landing 自己成為捲動容器 */
  width: 100%;
  overflow-x: hidden;
  overflow-y: auto;                /* 內容在 Landing 內部捲動，不受外層 overflow:hidden 影響 */
  -webkit-overflow-scrolling: touch;  /* iOS 慣性捲動 */
  overscroll-behavior-y: contain;
  background: var(--paper);
  color: var(--ink);
  font-family: 'Noto Sans TC', system-ui, sans-serif;
}

/* ── 流體 blob 背景 ── */
.blobs {
  position: fixed; inset: 0;
  z-index: 0; pointer-events: none;
  filter: blur(60px);
}
.blob { position: absolute; border-radius: 46% 54% 60% 40% / 50% 42% 58% 50%; opacity: .75; }
.b1 { width: 46vmax; height: 46vmax; top: -14vmax; left: -12vmax; background: var(--green);  animation: drift1 26s ease-in-out infinite alternate; }
.b2 { width: 34vmax; height: 34vmax; top: 30vh; right: -14vmax;  background: var(--sprout); animation: drift2 22s ease-in-out infinite alternate; }
.b3 { width: 26vmax; height: 26vmax; bottom: -10vmax; left: 8vw;  background: var(--honey); opacity:.45; animation: drift3 30s ease-in-out infinite alternate; }
.b4 { width: 30vmax; height: 30vmax; bottom: 20vh; right: 22vw;  background: var(--green); opacity:.35; animation: drift1 34s ease-in-out infinite alternate-reverse; }
@keyframes drift1 { from { transform: translate(0,0) rotate(0deg); border-radius:46% 54% 60% 40%/50% 42% 58% 50%; } to { transform: translate(6vmax,4vmax) rotate(24deg); border-radius:58% 42% 44% 56%/42% 58% 46% 54%; } }
@keyframes drift2 { from { transform: translate(0,0) scale(1); }  to { transform: translate(-5vmax,6vmax) scale(1.12); } }
@keyframes drift3 { from { transform: translate(0,0); border-radius:50% 50% 40% 60%/55% 45% 55% 45%; } to { transform: translate(4vmax,-5vmax); border-radius:40% 60% 55% 45%/45% 55% 42% 58%; } }

/* ── 毛玻璃 ── */
.glass {
  background: var(--glass);
  backdrop-filter: blur(16px) saturate(1.2);
  -webkit-backdrop-filter: blur(16px) saturate(1.2);
  border: 1px solid rgba(255,255,255,.6);
  box-shadow: 0 8px 30px rgba(47,74,58,.08);
}

/* ── 導覽列 ── */
.nav {
  position: fixed; top: 14px; left: 50%; transform: translateX(-50%);
  width: min(920px, calc(100% - 28px));
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 18px; border-radius: 999px; z-index: 20;
}
.nav-logo { font-family: 'LXGW WenKai TC', serif; font-size: 22px; font-weight: 700; letter-spacing: .5px; }
.logo-mark { color: #fff; background: var(--ink); border-radius: 10px; padding: 2px 8px; margin-right: 4px; }
.nav-login {
  background: var(--ink); color: #fff; border: none; border-radius: 999px;
  padding: 10px 18px; font-size: 14px; font-weight: 700; cursor: pointer; transition: .2s;
}
.nav-login:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(47,74,58,.25); }
.nav-login:disabled { opacity: .6; }
.nav-login .login-short { display: none; }

/* ── Hero ── */
.hero {
  position: relative; z-index: 1;
  display: grid; grid-template-columns: 1.1fr .9fr; gap: 30px; align-items: center;
  max-width: 1020px; margin: 0 auto; padding: 150px 24px 90px;
}
.eyebrow { font-size: 13px; font-weight: 700; letter-spacing: 2px; color: var(--ink); opacity: .65; margin: 0 0 14px; }
.headline {
  font-family: 'LXGW WenKai TC', serif;
  font-size: clamp(38px, 6vw, 62px); line-height: 1.22; margin: 0 0 18px; font-weight: 700;
}
.hl { position: relative; white-space: nowrap; }
.hl::after {
  content: ''; position: absolute; left: -2%; right: -2%; bottom: 6%;
  height: .38em; background: var(--green); opacity: .55; z-index: -1; border-radius: 4px;
}
.sub { font-size: 16px; line-height: 1.9; max-width: 420px; opacity: .85; margin: 0 0 28px; }
.cta-row { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
.cta-main {
  display: inline-flex; align-items: center; gap: 10px;
  background: var(--ink); color: #fff; border: none; border-radius: 16px;
  padding: 15px 26px; font-size: 15px; font-weight: 800; cursor: pointer; transition: .2s;
}
.cta-main:hover { transform: translateY(-2px); box-shadow: 0 10px 26px rgba(47,74,58,.28); }
.cta-main:disabled { opacity: .6; }
.cta-main.big { font-size: 17px; padding: 18px 34px; }
.cta-sub { font-size: 14px; font-weight: 700; color: var(--ink); opacity: .7; text-decoration: none; }
.cta-sub:hover { opacity: 1; }
.login-error { margin-top: 14px; font-size: 13px; font-weight: 700; color: #b3423a; }

/* 漂浮商品卡（簽名元素） */
.hero-cards { position: relative; height: 380px; }
.p-card {
  position: absolute; display: flex; align-items: center; gap: 12px;
  border-radius: 18px; padding: 14px 16px; width: 240px;
  transition: transform .25s ease-out;
  will-change: transform;
}
.depth-1 { top: 6%;  left: 4%;  animation: float 7s ease-in-out infinite; }
.depth-2 { top: 40%; right: 0;  animation: float 8.5s ease-in-out infinite reverse; }
.depth-3 { bottom: 2%; left: 14%; animation: float 9.5s ease-in-out infinite; }
@keyframes float { 0%,100% { margin-top: 0; } 50% { margin-top: -12px; } }
.p-thumb {
  width: 46px; height: 46px; border-radius: 12px; display: grid; place-items: center;
  font-size: 22px; flex-shrink: 0;
}
.t-book { background: var(--sprout); }
.t-lamp { background: var(--honey); }
.t-bike { background: var(--green); }
.p-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.p-info strong { font-size: 14px; }
.p-info span { font-size: 12px; opacity: .65; }
.p-tag {
  margin-left: auto; font-size: 11px; font-weight: 800; color: var(--ink);
  background: rgba(172,198,177,.4); padding: 3px 9px; border-radius: 999px; flex-shrink: 0;
}
.p-tag.sold { background: var(--honey); }

/* ── 區塊共用 ── */
.section { position: relative; z-index: 1; max-width: 960px; margin: 0 auto; padding: 70px 24px; }
.sec-eyebrow { font-size: 13px; font-weight: 800; letter-spacing: 2px; opacity: .6; margin: 0 0 8px; }
.sec-title { font-family: 'LXGW WenKai TC', serif; font-size: clamp(26px, 4vw, 36px); margin: 0 0 30px; font-weight: 700; }
.sec-desc { margin: -18px 0 30px; font-size: 15px; line-height: 1.8; opacity: .8; max-width: 560px; }

/* 理念卡 */
.idea-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
.idea-card { border-radius: 22px; padding: 26px 22px; }
.idea-icon { font-size: 30px; margin-bottom: 12px; }
.idea-card h3 { margin: 0 0 8px; font-size: 18px; }
.idea-card p { margin: 0; font-size: 14px; line-height: 1.8; opacity: .8; }

/* 功能列表 */
.feat-list { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.feat { display: flex; gap: 14px; border-radius: 18px; padding: 18px; align-items: flex-start; }
.f-no {
  font-family: 'LXGW WenKai TC', serif; font-size: 20px; font-weight: 700; color: var(--ink);
  background: var(--green); width: 42px; height: 42px; border-radius: 12px;
  display: grid; place-items: center; flex-shrink: 0;
}
.feat h4 { margin: 2px 0 4px; font-size: 15px; }
.feat p { margin: 0; font-size: 13px; line-height: 1.7; opacity: .75; }

/* PWA 區 */
.pwa-wrap { display: grid; grid-template-columns: 1.2fr .8fr; gap: 20px; align-items: start; }
.video-frame { border-radius: 22px; padding: 10px; }
.video-frame video { width: 100%; border-radius: 14px; display: block; background: #dfe8df; aspect-ratio: 16/9; }
.pwa-steps { display: flex; flex-direction: column; gap: 14px; }
.step { border-radius: 18px; padding: 16px 18px; }
.step h4 { margin: 0 0 8px; font-size: 15px; }
.step ol { margin: 0; padding-left: 20px; font-size: 13px; line-height: 2; opacity: .85; }

/* 尾段 CTA */
.final-cta { position: relative; z-index: 1; text-align: center; padding: 80px 24px 60px; }
.final-cta h2 { font-family: 'LXGW WenKai TC', serif; font-size: clamp(28px, 5vw, 44px); margin: 0 0 26px; }
.br-m { display: none; }

.foot { position: relative; z-index: 1; text-align: center; font-size: 12px; opacity: .5; padding: 20px 0 34px; }

/* 進場動畫 */
.reveal { opacity: 0; transform: translateY(26px); transition: opacity .7s ease, transform .7s ease; }
.reveal.in { opacity: 1; transform: none; }

/* ── RWD：平板 ── */
@media (max-width: 820px) {
  .hero { grid-template-columns: 1fr; padding-top: 120px; text-align: left; }
  .hero-cards { height: 300px; margin-top: 6px; }
  .idea-grid { grid-template-columns: 1fr; }
  .feat-list { grid-template-columns: 1fr; }
  .pwa-wrap { grid-template-columns: 1fr; }
  .br-m { display: inline; }
}

/* ── RWD：手機（≤560px）── */
@media (max-width: 560px) {
  /* 導覽列：logo 縮小、按鈕改短文案 */
  .nav { top: 10px; width: calc(100% - 20px); padding: 8px 10px 8px 14px; }
  .nav-logo { font-size: 18px; }
  .logo-mark { padding: 2px 6px; margin-right: 2px; }
  .nav-login { padding: 9px 14px; font-size: 13px; }
  .nav-login .login-long { display: none; }
  .nav-login .login-short { display: inline; }

  /* Hero：上下留白收斂、字級縮小 */
  .hero { padding: 104px 18px 56px; gap: 22px; }
  .eyebrow { font-size: 11px; letter-spacing: 1.4px; margin-bottom: 10px; }
  .headline { font-size: clamp(30px, 9vw, 40px); line-height: 1.28; }
  .sub { font-size: 15px; line-height: 1.85; margin-bottom: 22px; }

  /* CTA：主鈕滿版好按，次要連結置中 */
  .cta-row { flex-direction: column; align-items: stretch; gap: 12px; }
  .cta-main { width: 100%; justify-content: center; padding: 16px 20px; }
  .cta-sub { text-align: center; padding: 4px 0; }

  /* 商品卡：從絕對定位改成可橫滑的卡片流（手機沒有滑鼠視差） */
  .hero-cards {
    height: auto; display: flex; gap: 12px;
    overflow-x: auto; padding: 4px 2px 10px;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
    touch-action: pan-x;
    overscroll-behavior-x: contain;
  }
  .hero-cards::-webkit-scrollbar { display: none; }
  .p-card {
    position: static; width: 232px; flex-shrink: 0;
    scroll-snap-align: start;
    animation: none;              /* 手機不做浮動，改為靜態卡片 */
  }

  /* 區塊：內距收斂 */
  .section { padding: 52px 18px; }
  .sec-title { font-size: clamp(23px, 6.4vw, 30px); margin-bottom: 24px; }
  .sec-desc { font-size: 14px; margin: -12px 0 24px; }

  .idea-card { padding: 22px 18px; border-radius: 18px; }
  .idea-icon { font-size: 26px; }
  .idea-card h3 { font-size: 17px; }

  .feat { padding: 15px; gap: 12px; }
  .f-no { width: 38px; height: 38px; font-size: 18px; }

  .step ol { line-height: 1.95; }

  .final-cta { padding: 60px 18px 48px; }
  .final-cta h2 { font-size: clamp(25px, 7.4vw, 34px); }
  .cta-main.big { width: 100%; font-size: 16px; padding: 17px 24px; }

  /* blob 在小螢幕降低模糊半徑，避免手機 GPU 吃力 */
  .blobs { filter: blur(44px); }
}

/* 超窄螢幕（≤360px）微調 */
@media (max-width: 360px) {
  .headline { font-size: 27px; }
  .p-card { width: 210px; }
  .nav-logo { font-size: 17px; }
}

/* 動態減量（無障礙） */
@media (prefers-reduced-motion: reduce) {
  .blob, .p-card, .reveal { animation: none !important; transition: none !important; }
  .reveal { opacity: 1; transform: none; }
}
</style>