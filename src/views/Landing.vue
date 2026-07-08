<template>
  <div class="landing-wrapper">
    <div class="bg-blobs">
      <div class="blob shape-1"></div>
      <div class="blob shape-2"></div>
      <div class="blob shape-3"></div>
    </div>

    <div class="scroll-container">
      
      <section class="hero-section">
        <div class="hero-glass-card">
          <div class="logo-badge">YaBuy</div>
          <h1 class="hero-title">
            亞洲大學專屬<br />
            <span class="highlight-text">二手安全交易網</span>
          </h1>
          <p class="hero-subtitle">
            告別詐騙與危險面交。我們以系統剛性機制築起人身安全防線，為亞大師生打造零私訊、零風險的封閉式校園高信任圈。
          </p>
          
          <div class="action-area">
            <button class="cta-login-btn" @click="handleLogin" :disabled="isLoggingIn">
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" class="g-icon" />
              <span>{{ isLoggingIn ? '安全認證中...' : '使用 Google 帳號開始交易' }}</span>
            </button>
            <p class="security-hint">🔒 限亞洲大學學籍信箱登入</p>
          </div>
        </div>
      </section>

      <section class="features-section">
        <h2 class="section-heading">重塑校園交易的四大防護</h2>
        <div class="feature-grid">
          
          <div class="feature-card">
            <div class="f-icon">💬 ➔ 🛑</div>
            <h3>去私訊化結構提案</h3>
            <p>全面移除自由聊天室，改以狀態機表單進行時間與地點協商，從源頭抹除社交工程詐騙與跟蹤騷擾的空間。</p>
          </div>

          <div class="feature-card">
            <div class="f-icon">🛡️</div>
            <h3>時地雙重安全熔斷</h3>
            <p>地點僅限校內公開安全熱點，並強制攔截 18:00 至次日 06:00 的夜間面交預約，以剛性機制保障實體安全。</p>
          </div>

          <div class="feature-card">
            <div class="f-icon">📱</div>
            <h3>現場 QR 雙重驗證</h3>
            <p>面交抵達現場時，需透過買家掃描賣家專屬動態 QR Code 確認身分後，方可解鎖最終報價與成交按鈕。</p>
          </div>

          <div class="feature-card">
            <div class="f-icon">📚</div>
            <h3>系所教科書智慧配對</h3>
            <p>首創對齊校園課表的「學院 ➔ 科系 ➔ 科目」三層檢索架構，一鍵精準媒合指定原文書與共筆資料。</p>
          </div>

        </div>
      </section>

      <section class="pwa-section">
        <div class="pwa-content">
          <h2 class="section-heading left-align">把 YaBuy 裝進手機裡</h2>
          <p class="pwa-desc">
            免去繁瑣的 App Store 下載！透過漸進式網頁應用程式 (PWA) 技術，只需兩步驟即可將 YaBuy 加入手機主畫面，享受原生 App 般的極致流暢體驗。
          </p>
          <ul class="pwa-steps">
            <li><span class="step-icon">🍎</span> <b>iOS 用戶：</b> 點擊 Safari 下方「分享」按鈕 ➔ 選擇「加入主畫面」。</li>
            <li><span class="step-icon">🤖</span> <b>Android 用戶：</b> 點擊 Chrome 右上角「⋮」 ➔ 選擇「加到主畫面」。</li>
          </ul>
        </div>
        
        <div class="pwa-visual">
          <div class="phone-mockup">
            <div class="video-container">
              <div class="video-placeholder">
                <span class="play-btn">▶</span>
                <p>播放 PWA 安裝教學</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer class="landing-footer">
        <p>&copy; 2026 YaBuy Team @ Asia University. All rights reserved.</p>
      </footer>

    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { auth, googleProvider, db } from '@/firebase';
import { signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';

// 觸發進入 App 主程式的事件
const emit = defineEmits(['enter-app']);

const isLoggingIn = ref(false);

const handleLogin = async () => {
  isLoggingIn.value = true;
  try {
    // 💡 提示 Google 優先過濾亞洲大學網域
    googleProvider.setCustomParameters({ hd: 'live.asia.edu.tw' });

    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    // 🛡️ 核心防護：嚴格檢查信箱網域
    const validDomains = ['@asia.edu.tw', '@live.asia.edu.tw']; 
    const isValidEmail = validDomains.some(domain => user.email.endsWith(domain));

    if (!isValidEmail) {
      // 發現非亞大信箱，強制登出並阻擋
      await signOut(auth);
      alert(`🛑 安全攔截：\n您目前使用的信箱為 ${user.email}\n本系統為封閉式信任圈，僅限使用「亞洲大學」配發之學籍信箱登入！`);
      isLoggingIn.value = false;
      return; 
    }

    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      await setDoc(userRef, {
        id: user.uid,
        displayName: user.displayName || '校園用戶',
        email: user.email,
        photoURL: user.photoURL || '',
        status: 'active',
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp()
      });
      console.log("✅ 亞大新使用者資料已建檔！");
    } else {
      await updateDoc(userRef, { lastLogin: serverTimestamp() });
      console.log("✅ 亞大既有使用者登入更新！");
    }

    // 登入成功後，發送事件給父組件
    emit('enter-app', user);

  } catch (error) {
    console.error("登入出錯:", error.message);
    if (error.code !== 'auth/popup-closed-by-user') {
      alert("登入失敗，請確認網路或允許彈出視窗。");
    }
  } finally {
    isLoggingIn.value = false;
  }
};
</script>

<style scoped>
/* ── 基礎排版與背景 ── */
.landing-wrapper {
  position: absolute; inset: 0;
  background-color: #f8faf5; /* 底色 */
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.scroll-container {
  position: relative;
  width: 100%; height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  z-index: 10;
  scroll-behavior: smooth;
}

/* ── 動態流體背景 (Fluid Blobs) ── */
.bg-blobs { position: absolute; inset: 0; overflow: hidden; z-index: 0; pointer-events: none; filter: blur(60px); opacity: 0.6; }
.blob { position: absolute; border-radius: 50%; background: #acc6b1; animation: float 10s infinite ease-in-out alternate; }
.shape-1 { width: 400px; height: 400px; top: -10%; left: -10%; animation-delay: 0s; }
.shape-2 { width: 300px; height: 300px; top: 40%; right: -5%; background: #d1d9c6; animation-delay: -3s; }
.shape-3 { width: 500px; height: 500px; bottom: -20%; left: 20%; animation-delay: -6s; opacity: 0.4; }

@keyframes float {
  0% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(30px, -50px) scale(1.1); }
  66% { transform: translate(-20px, 20px) scale(0.9); }
  100% { transform: translate(0, 0) scale(1); }
}

/* ── 1. Hero 視覺區 ── */
.hero-section {
  min-height: 100vh;
  display: flex; justify-content: center; align-items: center;
  padding: 20px;
}
.hero-glass-card {
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  padding: 50px 30px;
  border-radius: 40px;
  text-align: center;
  max-width: 600px;
  box-shadow: 0 20px 40px rgba(0,0,0,0.05);
  animation: fade-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes fade-up {
  from { opacity: 0; transform: translateY(30px); }
  to { opacity: 1; transform: translateY(0); }
}

.logo-badge {
  display: inline-block;
  background: #333; color: #fff;
  font-weight: 900; font-size: 14px; letter-spacing: 1px;
  padding: 6px 16px; border-radius: 999px;
  margin-bottom: 24px;
}
.hero-title {
  font-size: 36px; font-weight: 900; color: #1a1a1a;
  line-height: 1.3; margin: 0 0 20px;
}
.highlight-text {
  color: #acc6b1;
  text-shadow: 0 2px 10px rgba(172, 198, 177, 0.4);
}
.hero-subtitle {
  font-size: 15px; color: #666; line-height: 1.6;
  margin: 0 auto 40px; font-weight: 500;
}

/* 登入按鈕 */
.action-area { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.cta-login-btn {
  display: flex; align-items: center; justify-content: center; gap: 12px;
  width: 100%; max-width: 320px; height: 56px;
  background: #1a1a1a; color: #fff;
  border: none; border-radius: 18px;
  font-size: 16px; font-weight: 800;
  cursor: pointer; transition: 0.3s;
  box-shadow: 0 10px 25px rgba(0,0,0,0.15);
}
.cta-login-btn:hover { background: #333; transform: translateY(-2px); box-shadow: 0 15px 30px rgba(0,0,0,0.2); }
.cta-login-btn:active { transform: translateY(1px); }
.cta-login-btn:disabled { background: #999; cursor: not-allowed; transform: none; }
.g-icon { width: 20px; height: 20px; background: #fff; border-radius: 50%; padding: 2px; }
.security-hint { font-size: 12px; color: #888; font-weight: 600; }


/* ── 2. 功能特色區 (Features) ── */
.features-section {
  padding: 80px 24px;
  max-width: 1000px; margin: 0 auto;
}
.section-heading {
  text-align: center; font-size: 28px; font-weight: 900; color: #333;
  margin-bottom: 40px;
}
.section-heading.left-align { text-align: left; margin-bottom: 20px; }

.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 24px;
}
.feature-card {
  background: #fff;
  padding: 30px 24px;
  border-radius: 28px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.03);
  transition: 0.3s;
  border: 1px solid transparent;
}
.feature-card:hover {
  transform: translateY(-5px);
  border-color: #acc6b1;
  box-shadow: 0 15px 40px rgba(172, 198, 177, 0.15);
}
.f-icon { font-size: 32px; margin-bottom: 16px; display: inline-block; background: #f0f4ec; padding: 12px; border-radius: 20px; }
.feature-card h3 { font-size: 18px; font-weight: 850; color: #1a1a1a; margin: 0 0 12px; }
.feature-card p { font-size: 14px; color: #666; line-height: 1.6; margin: 0; }


/* ── 3. PWA 導覽區 ── */
.pwa-section {
  padding: 80px 24px;
  max-width: 1000px; margin: 0 auto;
  display: flex; flex-wrap: wrap; align-items: center; gap: 60px;
}
.pwa-content { flex: 1; min-width: 300px; }
.pwa-desc { font-size: 16px; color: #555; line-height: 1.7; margin-bottom: 30px; }
.pwa-steps { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 16px; }
.pwa-steps li { background: #fff; padding: 16px; border-radius: 16px; font-size: 14px; color: #333; box-shadow: 0 5px 15px rgba(0,0,0,0.03); display: flex; align-items: center; gap: 12px; border-left: 4px solid #acc6b1;}
.step-icon { font-size: 20px; }

.pwa-visual {
  flex: 1; min-width: 300px;
  display: flex; justify-content: center;
}

/* 手機 Mockup 設計 */
.phone-mockup {
  width: 280px; height: 580px;
  border: 12px solid #333;
  border-radius: 40px;
  background: #111;
  position: relative;
  box-shadow: 0 25px 50px rgba(0,0,0,0.2);
  overflow: hidden;
}
/* 瀏海 */
.phone-mockup::before {
  content: ''; position: absolute; top: 0; left: 50%; transform: translateX(-50%);
  width: 120px; height: 25px; background: #333;
  border-radius: 0 0 15px 15px; z-index: 10;
}

.video-container { width: 100%; height: 100%; background: #f8faf5; position: relative; }
.pwa-video { width: 100%; height: 100%; object-fit: cover; }
.video-placeholder {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; justify-content: center; align-items: center;
  background: linear-gradient(135deg, #acc6b1 0%, #d1d9c6 100%);
  color: #fff; font-weight: 800; font-size: 14px; gap: 12px;
}
.play-btn {
  width: 50px; height: 50px; background: rgba(255,255,255,0.3); border-radius: 50%;
  display: flex; justify-content: center; align-items: center; font-size: 20px;
  padding-left: 4px; backdrop-filter: blur(5px);
}

/* ── Footer ── */
.landing-footer {
  text-align: center; padding: 40px 20px; color: #999; font-size: 13px; font-weight: 600;
}

/* 手機版適配 */
@media (max-width: 768px) {
  .hero-title { font-size: 28px; }
  .hero-glass-card { padding: 40px 20px; border-radius: 30px; }
  .pwa-section { gap: 40px; }
  .phone-mockup { width: 240px; height: 500px; }
}
</style>