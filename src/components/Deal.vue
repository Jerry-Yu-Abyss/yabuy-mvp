<template>
  <div class="deal-overlay" @touchmove.stop>

    <div v-if="step === 'verify'" class="deal-screen verify-screen">
      <div class="screen-header">
        <button class="back-pill" @click="$emit('close')">← 返回</button>
        <h2 class="screen-title">確認見面</h2>
        <div></div>
      </div>

      <template v-if="role === 'sell'">
        <div class="qr-hero">
          <p class="qr-label">請讓買家掃描此 QR</p>
          <div class="qr-wrapper">
            <canvas ref="qrCanvas" class="qr-canvas"></canvas>
          </div>
          <p class="qr-sub">識別碼：{{ liveOrder.id.slice(0, 8).toUpperCase() }}</p>
        </div>
        <div class="waiting-badge" v-if="!sellerReady">
          <span class="dot-pulse"></span> 等待買家掃描...
        </div>
        <div class="ready-badge" v-else>✅ 身份已確認，等待買家確認就緒</div>
      </template>

      <template v-if="role === 'buy'">
        <div class="scan-hero">
          <p class="scan-label">請掃描賣家的 QR Code</p>
          <div class="scan-box" :class="{ scanning: isScanning, success: scanSuccess }">
            <video ref="scanVideo" class="scan-video" playsinline></video>
            <div class="scan-frame">
              <div class="corner tl"></div><div class="corner tr"></div>
              <div class="corner bl"></div><div class="corner br"></div>
              <div class="scan-line" v-if="isScanning && !scanSuccess"></div>
            </div>
            <div class="scan-success-overlay" v-if="scanSuccess">
              <span class="check-big">✓</span>
            </div>
          </div>

          <div v-if="!isScanning && !scanSuccess" class="scan-actions">
            <button class="btn-scan" @click="startScan">開啟相機掃描</button>
            <p class="manual-hint">或手動輸入識別碼</p>
            <div class="manual-row">
              <input v-model="manualCode" class="manual-input" placeholder="輸入 8 碼識別碼" maxlength="8" />
              <button class="btn-manual-confirm" @click="confirmManual">確認</button>
            </div>
          </div>
          <div v-if="scanSuccess" class="ready-badge buyer-ready">✅ 賣家身份確認，按下就緒</div>
        </div>
      </template>

      <div class="arrive-action" v-if="role === 'buy'">
        <button 
          class="btn-ready"
          :class="{ active: scanSuccess }"
          :disabled="!scanSuccess || buyerReady"
          @click="setReady"
        >
          {{ buyerReady ? '✅ 已就緒' : '確認就緒' }}
        </button>
      </div>
      <div class="arrive-action" v-if="role === 'sell'">
        <button
          class="btn-ready seller"
          :disabled="sellerReady"
          @click="setReady"
        >
          {{ sellerReady ? '✅ 已就緒' : '我已就位' }}
        </button>
      </div>
    </div>

    <div v-if="step === 'confirm'" class="deal-screen confirm-screen">
      <div class="screen-header">
        <div></div>
        <h2 class="screen-title">確認成交？</h2>
        <div></div>
      </div>

      <div class="order-summary">
        <div class="summary-img-wrap">
          <img v-if="liveOrder.productImage" :src="liveOrder.productImage" class="summary-img" />
          <div v-else class="summary-img-placeholder">📦</div>
        </div>
        <h3 class="summary-name">{{ liveOrder.productName }}</h3>
        <div class="summary-rows">
          <div class="summary-row"><span>📍</span><span>{{ liveOrder.location }}</span></div>
          <div class="summary-row"><span>⏰</span><span>{{ liveOrder.time }}</span></div>
          <div class="summary-row price-row"><span>💰 預定價格</span><span class="price-tag">${{ liveOrder.productPrice }}</span></div>
        </div>
      </div>

      <div class="waiting-other" v-if="waitingForOther">
        <span class="dot-pulse"></span>
        等待對方確認中...
      </div>

      <div class="confirm-actions" v-else>
        <button class="btn-deal reject" @click="handleDeal(false)">❌ 不成交</button>
        <button class="btn-deal accept" @click="handleDeal(true)">🤝 願意成交</button>
      </div>
    </div>

    <div v-if="step === 'price'" class="deal-screen price-screen">
      <div class="screen-header">
        <div></div>
        <h2 class="screen-title">輸入成交價格</h2>
        <div></div>
      </div>

      <div class="price-hero">
        <div class="price-context">
          <span class="price-context-label">預定價格</span>
          <span class="price-context-val">${{ liveOrder.productPrice }}</span>
        </div>
        <p class="price-desc">請輸入本次實際議定的成交金額（上限 $10,000）</p>
        <div class="price-input-wrap">
          <span class="currency-sign">$</span>
          <input 
            v-model.number="finalPrice" 
            type="number" 
            class="price-input" 
            placeholder="0"
            min="0"
            max="10000"
            @input="capPrice"
          />
        </div>
        <p v-if="finalPrice > 10000" class="price-warn">⚠️ 金額不可超過 $10,000</p>
      </div>

      <button 
        class="btn-submit-price"
        :disabled="!finalPrice || finalPrice <= 0 || finalPrice > 10000 || submittingPrice"
        @click="submitPrice"
      >
        <span v-if="submittingPrice" class="spinner"></span>
        <span v-else>送出金額給賣家確認</span>
      </button>
    </div>

    <div v-if="step === 'seller-confirm-price'" class="deal-screen seller-price-screen">
      <div class="screen-header">
        <div></div>
        <h2 class="screen-title">確認成交金額</h2>
        <div></div>
      </div>

      <div class="seller-price-hero">
        <p class="seller-price-label">買家提出的成交金額</p>
        <div class="seller-price-display">${{ liveOrder.finalPrice }}</div>
        <p class="seller-price-sub">預定價格：${{ liveOrder.productPrice }}</p>
      </div>

      <div class="confirm-actions">
        <button class="btn-deal reject" @click="sellerConfirmPrice(false)">拒絕</button>
        <button class="btn-deal accept" @click="sellerConfirmPrice(true)">確認成交 ✅</button>
      </div>
    </div>

    <div v-if="step === 'done'" class="deal-screen done-screen">
      <div class="done-animation">
        <div class="done-circle">
          <span class="done-check">✓</span>
        </div>
        <h2 class="done-title">交易完成！</h2>
        <p class="done-price">成交金額 ${{ liveOrder.finalPrice }}</p>
      </div>

      <!-- 交易評價 -->
      <div class="rate-box" v-if="!ratingDone">
        <p class="rate-title">為這次交易的{{ role === 'buy' ? '賣家' : '買家' }}評分</p>
        <div class="rate-stars">
          <span
            v-for="n in 5"
            :key="n"
            class="rate-star"
            :class="{ on: n <= ratingStars }"
            @click="ratingStars = n"
          >★</span>
        </div>
        <textarea
          v-model="ratingComment"
          class="rate-comment"
          rows="3"
          maxlength="300"
          placeholder="想對平台反映什麼嗎？（選填）"
        ></textarea>
        <p class="rate-privacy">🔒 文字內容僅提供給平台管理方審閱，不會公開、也不會透露給對方。個人頁只會顯示星等平均。</p>
        <button class="btn-rate" :disabled="ratingStars === 0 || ratingSubmitting" @click="submitRating">
          {{ ratingSubmitting ? '送出中...' : '送出評價' }}
        </button>
      </div>
      <p v-else class="rate-thanks">⭐ 感謝你的評價！</p>

      <button class="btn-done" @click="$emit('close')">返回信箱</button>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import QRCode from 'qrcode';   // 產生 QR：npm install qrcode
import jsQR from 'jsqr';       // 掃描 QR（純 JS，iOS 也支援）：npm install jsqr
import { db, auth } from '@/firebase'; //
import { doc, onSnapshot, updateDoc, serverTimestamp, addDoc, collection, getDocs, query, where, increment } from 'firebase/firestore'; //

const props = defineProps({
  order: { type: Object, required: true },
  role:  { type: String, required: true } 
});
const emit = defineEmits(['close']);

const step           = ref('verify');
const isScanning     = ref(false);
const scanSuccess    = ref(false);
const manualCode     = ref('');
const finalPrice     = ref(null);
const submittingPrice = ref(false);

// 交易評價
const ratingStars = ref(0);
const ratingComment = ref('');
const ratingSubmitting = ref(false);
const ratingDone = ref(false);

const submitRating = async () => {
  if (ratingStars.value === 0) return;
  const me = auth.currentUser;
  if (!me) return;
  // 買家評賣家、賣家評買家
  const ratedId = props.role === 'buy' ? liveOrder.value.sellerId : liveOrder.value.buyerId;
  if (!ratedId) { alert('缺少對方資訊，無法評價'); ratingDone.value = true; return; }
  ratingSubmitting.value = true;
  try {
    // 1) 完整評價（含文字）寫入 reviews —— 只有管理端可讀，文字不會外流給對方
    await addDoc(collection(db, 'reviews'), {
      orderId: props.order.id,
      raterId: me.uid,
      ratedId: ratedId,
      ratedRole: props.role === 'buy' ? 'seller' : 'buyer',
      stars: ratingStars.value,
      comment: ratingComment.value.trim(),
      createdAt: serverTimestamp()
    });
    // 2) 只把「星等彙總」更新到對方用戶文件 —— 前台個人頁只讀得到平均數字，讀不到文字
    await updateDoc(doc(db, 'users', ratedId), {
      ratingSum: increment(ratingStars.value),
      ratingCount: increment(1)
    });
    ratingDone.value = true;
  } catch (e) {
    warn('🔥 評價送出失敗：', e.code, e.message);
    alert('評價送出失敗，請稍後再試。');
  } finally {
    ratingSubmitting.value = false;
  }
};
const qrCanvas       = ref(null);
const scanVideo      = ref(null);
let   scanStream     = null;
let   unsubOrder     = null;

// 🔍 [偵錯] 統一 log 工具：買賣雙方各自的裝置會標示自己的角色，方便在 DevTools 比對。
//    要關閉偵錯時，把下面 enabled 改成 false 即可。
const DEBUG = { enabled: true };
const ROLE_LABEL = props.role === 'buy' ? '買家' : props.role === 'sell' ? '賣家' : `未知(${props.role})`;
const log = (...args) => { if (DEBUG.enabled) console.log(`%c[Deal:${ROLE_LABEL}]`, 'color:#2e7d32;font-weight:bold;', ...args); };
const warn = (...args) => { if (DEBUG.enabled) console.warn(`[Deal:${ROLE_LABEL}]`, ...args); };
// 把訂單關鍵欄位濃縮成一行，方便觀察每次快照的變化
const peek = (o) => ({
  status: o.status, finalPrice: o.finalPrice,
  buyerReady: o.buyerReady, sellerReady: o.sellerReady,
  buyerDeal: o.buyerDeal, sellerDeal: o.sellerDeal,
  step: step.value
});

// ✅ 響應式狀態：用於即時同步 Firestore 資料
const liveOrder = ref({ ...props.order });

const buyerReady  = computed(() => liveOrder.value.buyerReady  === true);
const sellerReady = computed(() => liveOrder.value.sellerReady === true);
const buyerDeal   = computed(() => liveOrder.value.buyerDeal);
const sellerDeal  = computed(() => liveOrder.value.sellerDeal);
const waitingForOther = computed(() => {
  if (props.role === 'buy')  return liveOrder.value.buyerDeal  === true && liveOrder.value.sellerDeal  === undefined;
  if (props.role === 'sell') return liveOrder.value.sellerDeal === true && liveOrder.value.buyerDeal   === undefined;
  return false;
});

// ✅ 核心同步邏輯
onMounted(() => {
  log('🚀 Deal 掛載', { orderId: props.order?.id, role: props.role });
  if (!props.order?.id) {
    warn('❌ props.order.id 不存在，無法建立即時監聽！傳進來的 order =', props.order);
    return;
  }
  log('📦 初始 order 狀態：', peek(liveOrder.value));

  unsubOrder = onSnapshot(doc(db, "orders", props.order.id), (snap) => {
    if (!snap.exists()) {
      warn('⚠️ 快照回傳：訂單文件不存在（可能已被刪除）。docId =', props.order.id);
      return;
    }
    // 將最新快照更新到響應式變數中
    liveOrder.value = { id: snap.id, ...snap.data() };
    log('📡 收到最新快照 →', peek(liveOrder.value));
    syncStep();
  }, (err) => {
    // ⚠️ onSnapshot 的「錯誤」回呼：權限不足、規則擋住時會走這裡（很常見的卡關原因！）
    warn('🔥 onSnapshot 監聽失敗（請檢查 Firestore 規則 / 網路）：', err.code, err.message);
  });

  if (props.role === 'sell') {
    nextTick(() => drawQR());
  }
});

onUnmounted(() => {
  log('🧹 Deal 卸載，解除監聽');
  unsubOrder?.();
  stopScan();
});

const syncStep = () => {
  const o = liveOrder.value;
  log('🔄 syncStep 判斷中 →', peek(o));

  if (o.status === 'completed') { log('  ✅ 分支[completed] → step=done'); step.value = 'done'; return; }
  if (o.buyerDeal === false || o.sellerDeal === false) {
    log('  ❌ 分支[有人不成交] → 設為 failed 並關閉', { buyerDeal: o.buyerDeal, sellerDeal: o.sellerDeal });
    updateDoc(doc(db, "orders", props.order.id), { status: 'failed', updatedAt: serverTimestamp() });
    emit('close');
    return;
  }
  if (o.buyerReady && o.sellerReady && step.value === 'verify') {
    log('  🤝 分支[雙方就緒] → step=confirm（開始交易）');
    step.value = 'confirm';
    return;
  }
  if (o.buyerDeal === true && o.sellerDeal === true) {
    if (props.role === 'buy' && !o.finalPrice) { log('  💰 分支[雙方同意, 買家輸入價格] → step=price'); step.value = 'price'; return; }
    if (props.role === 'sell' && o.finalPrice) { log('  💰 分支[雙方同意, 賣家確認價格] → step=seller-confirm-price'); step.value = 'seller-confirm-price'; return; }
  }

  // ⚠️ 沒有任何分支命中：畫面會「停在原地不更新」。
  //    對照下面數值，常見原因：
  //    1) buyerReady / sellerReady 只有一邊是 true（對方的「就緒」沒寫進 Firestore）。
  //    2) step 已不是 'verify'，但雙方就緒條件才剛成立（verify→confirm 只在 step==='verify' 時觸發）。
  //    3) 雙方都同意了，但 finalPrice 還沒送出（賣家會卡住，要等買家送價）。
  warn('🟡 syncStep 沒有命中任何分支 → 畫面維持 step =', step.value, '｜目前狀態：', peek(o));
};

const drawQR = async () => {
  await nextTick();
  if (!qrCanvas.value) { warn('⚠️ qrCanvas 尚未渲染'); return; }
  if (!props.order?.id) { warn('⚠️ 沒有 order.id，無法產生 QR'); return; }
  log('🖼️ 產生 QR，內容（=訂單ID）：', props.order.id);
  try {
    await QRCode.toCanvas(qrCanvas.value, props.order.id, {
      width: 200, margin: 1, errorCorrectionLevel: 'H',
      color: { dark: '#1a1a1a', light: '#ffffff' }
    });
    log('✅ QR 產生成功');
  } catch (e) {
    warn('🔥 QR 產生失敗：', e.message);
  }
};

const confirmManual = () => {
  const code = manualCode.value.trim().toUpperCase();
  const expected = props.order.id.slice(0, 8).toUpperCase();
  log('🔑 手動輸入識別碼比對：', { 輸入: code, 應為: expected });
  if (code === expected) { log('  ✅ 識別碼正確，scanSuccess=true'); scanSuccess.value = true; }
  else { warn('  ❌ 識別碼不符'); alert('識別碼不符！'); }
};

const startScan = async () => {
  log('📷 嘗試開啟相機掃描');
  // 相機僅在安全環境(HTTPS 或 localhost)可用；用區網 IP + http 測試會失敗
  if (!navigator.mediaDevices?.getUserMedia) {
    warn('  🔥 此環境無法使用相機（需 HTTPS）');
    alert('無法開啟相機：請改用 HTTPS 網址（已部署的網站），或改用下方手動輸入識別碼。');
    return;
  }
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    scanVideo.value.srcObject = scanStream;
    scanVideo.value.setAttribute('playsinline', 'true'); // iOS 必須，否則會全螢幕播放
    await scanVideo.value.play();
    isScanning.value = true;
    log('  ✅ 相機已開啟，開始偵測 QR');
    detectQR();
  } catch (e) {
    warn('  🔥 相機啟動失敗：', e.name, e.message);
    if (e.name === 'NotAllowedError') alert('相機權限被拒絕，請到瀏覽器設定允許相機，或改用手動輸入識別碼。');
    else alert('相機啟動失敗，請改用下方手動輸入識別碼。');
  }
};

const stopScan = () => {
  if (scanStream) { scanStream.getTracks().forEach(t => t.stop()); scanStream = null; }
  isScanning.value = false;
};

const detectQR = async () => {
  // 用 jsQR 解碼影格，不依賴 iOS 不支援的 BarcodeDetector
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const loop = () => {
    if (!isScanning.value) return;
    const v = scanVideo.value;
    if (v && v.readyState === v.HAVE_ENOUGH_DATA && v.videoWidth) {
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      if (code) {
        log('  🔍 偵測到 QR：', code.data, '｜預期：', props.order.id);
        if (code.data === props.order.id) {
          log('  ✅ QR 比對成功，scanSuccess=true');
          scanSuccess.value = true;
          stopScan();
          return;
        }
      }
    }
    requestAnimationFrame(loop);
  };
  loop();
};

const setReady = async () => {
  const field = props.role === 'buy' ? 'buyerReady' : 'sellerReady';
  log(`👉 點擊「就緒/我已就位」→ 準備寫入 ${field}=true`);
  try {
    await updateDoc(doc(db, "orders", props.order.id), { [field]: true, updatedAt: serverTimestamp() });
    log(`✅ ${field}=true 已成功寫入 Firestore`);
  } catch (e) {
    warn(`🔥 寫入 ${field} 失敗（多半是 Firestore 規則或網路）：`, e.code, e.message);
    alert('就緒狀態送出失敗，請檢查網路後重試。');
  }
};

const handleDeal = async (agree) => {
  const field = props.role === 'buy' ? 'buyerDeal' : 'sellerDeal';
  log(`👉 點擊「${agree ? '願意成交' : '不成交'}」→ 準備寫入 ${field}=${agree}`);
  try {
    await updateDoc(doc(db, "orders", props.order.id), { [field]: agree, updatedAt: serverTimestamp() });
    log(`✅ ${field}=${agree} 已成功寫入`);
  } catch (e) {
    warn(`🔥 寫入 ${field} 失敗：`, e.code, e.message);
    alert('成交意願送出失敗，請重試。');
  }
};

const MAX_PRICE = 10000;
// 即時限制：輸入超過上限就拉回，避免 UI 出現超大數字
const capPrice = () => {
  if (typeof finalPrice.value === 'number' && finalPrice.value > MAX_PRICE) {
    finalPrice.value = MAX_PRICE;
  }
};

const submitPrice = async () => {
  log('👉 買家送出成交價格：', finalPrice.value);
  if (!finalPrice.value || finalPrice.value <= 0) { warn('  ⛔ 價格無效，已擋下'); return; }
  if (finalPrice.value > MAX_PRICE) { warn('  ⛔ 價格超過上限，已擋下'); alert('成交金額不可超過 $10,000'); return; }
  submittingPrice.value = true;
  try {
    await updateDoc(doc(db, "orders", props.order.id), {
      finalPrice: finalPrice.value,
      updatedAt: serverTimestamp()
    });
    log('✅ finalPrice 已寫入，等待賣家確認');
  } catch (e) {
    warn('🔥 送出價格失敗：', e.code, e.message);
    alert('送出失敗');
    submittingPrice.value = false;
  }
};

const sellerConfirmPrice = async (agree) => {
  log(`👉 賣家對成交價 ${liveOrder.value.finalPrice} 的決定：${agree ? '確認成交' : '拒絕'}`);
  if (agree) {
    await updateDoc(doc(db, "orders", props.order.id), {
      status: 'completed',
      updatedAt: serverTimestamp()
    });
    log('✅ 訂單已標記 completed');

    // ✅ 交易完成 → 自動下架商品
    // 首頁查詢條件為 where("status","==","active")，
    // 因此只要把該商品狀態改成 'sold'，就會立刻從推薦卡片消失，
    // 同時保留紀錄（會員頁仍可看到「已售出」）。
    // 這段只會由「賣家」端執行（seller-confirm-price 畫面僅 role==='sell' 才出現），
    // 賣家是商品擁有者，Firestore 規則才會允許更新，不會重複觸發。
    const pid = liveOrder.value.productId;
    if (pid) {
      try {
        await updateDoc(doc(db, "products", pid), {
          status: 'sold',
          soldAt: serverTimestamp()
        });
        log('✅ 商品已自動下架（status=sold），productId =', pid);
      } catch (e) {
        warn("⚠️ 商品自動下架失敗（不影響交易完成）:", e.code, e.message);
      }
    } else {
      warn("⚠️ 此訂單缺少 productId，無法自動下架，請檢查下單流程。");
    }
  } else {
    await updateDoc(doc(db, "orders", props.order.id), {
      finalPrice: null,
      updatedAt: serverTimestamp()
    });
    if (props.role === 'sell') step.value = 'confirm';
  }
};
</script>

<style scoped>
/* ── 全螢幕 overlay ── */
.deal-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: #f4f7f2;
  display: flex; flex-direction: column;
  font-family: 'Helvetica Neue', sans-serif;
}

.deal-screen {
  flex: 1; display: flex; flex-direction: column;
  padding: 0 24px 40px;
  overflow-y: auto;
}

/* ── 頂部 header ── */
.screen-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 52px 0 24px;
}
.back-pill {
  background: #fff; border: 1px solid #e0e0e0;
  padding: 7px 16px; border-radius: 999px;
  font-size: 13px; font-weight: 700; color: #555;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}
.screen-title { font-size: 20px; font-weight: 900; color: #1a1a1a; letter-spacing: -0.5px; }

/* ── QR 賣家 ── */
.qr-hero { display: flex; flex-direction: column; align-items: center; gap: 16px; margin-top: 12px; }
.qr-label { font-size: 15px; font-weight: 700; color: #555; }
.qr-wrapper {
  width: 220px; height: 220px;
  background: #fff; border-radius: 24px;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 8px 32px rgba(0,0,0,0.10);
  padding: 10px;
}
.qr-canvas { width: 200px; height: 200px; }
.qr-sub { font-size: 12px; font-weight: 800; color: #bbb; letter-spacing: 2px; }

/* ── 掃描 買家 ── */
.scan-hero { display: flex; flex-direction: column; align-items: center; gap: 16px; margin-top: 12px; }
.scan-label { font-size: 15px; font-weight: 700; color: #555; }
.scan-box {
  width: 240px; height: 240px; border-radius: 24px; overflow: hidden;
  position: relative; background: #111;
  box-shadow: 0 8px 32px rgba(0,0,0,0.15);
  transition: box-shadow 0.3s;
}
.scan-box.success { box-shadow: 0 0 0 4px #43a047, 0 8px 32px rgba(67,160,71,0.3); }
.scan-video { width: 100%; height: 100%; object-fit: cover; }
.scan-frame { position: absolute; inset: 0; pointer-events: none; }
.corner {
  position: absolute; width: 24px; height: 24px;
  border-color: #fff; border-style: solid; border-width: 0;
}
.corner.tl { top: 16px; left: 16px; border-top-width: 3px; border-left-width: 3px; border-radius: 4px 0 0 0; }
.corner.tr { top: 16px; right: 16px; border-top-width: 3px; border-right-width: 3px; border-radius: 0 4px 0 0; }
.corner.bl { bottom: 16px; left: 16px; border-bottom-width: 3px; border-left-width: 3px; border-radius: 0 0 0 4px; }
.corner.br { bottom: 16px; right: 16px; border-bottom-width: 3px; border-right-width: 3px; border-radius: 0 0 4px 0; }
.scan-line {
  position: absolute; left: 20px; right: 20px; height: 2px;
  background: linear-gradient(90deg, transparent, #43a047, transparent);
  animation: scan 2s linear infinite;
}
@keyframes scan {
  0%   { top: 20px; opacity: 1; }
  90%  { top: 210px; opacity: 1; }
  100% { top: 210px; opacity: 0; }
}
.scan-success-overlay {
  position: absolute; inset: 0;
  background: rgba(67,160,71,0.85);
  display: flex; align-items: center; justify-content: center;
}
.check-big { font-size: 72px; color: #fff; }

.scan-actions { display: flex; flex-direction: column; align-items: center; gap: 10px; width: 100%; }
.btn-scan {
  width: 100%; height: 46px; background: #1a1a1a; color: #fff;
  border: none; border-radius: 14px; font-size: 15px; font-weight: 800;
}
.manual-hint { font-size: 12px; color: #aaa; font-weight: 600; }
.manual-row { display: flex; gap: 8px; width: 100%; }
.manual-input {
  flex: 1; padding: 10px 14px; border: 1.5px solid #ddd;
  border-radius: 12px; font-size: 15px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 2px; outline: none;
}
.btn-manual-confirm {
  padding: 0 18px; background: #333; color: #fff;
  border: none; border-radius: 12px; font-weight: 800; font-size: 14px;
}

/* ── 等待 / 就緒 徽章 ── */
.waiting-badge, .ready-badge {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 20px; border-radius: 14px;
  font-size: 14px; font-weight: 700; margin-top: 8px;
}
.waiting-badge { background: #fff8e1; color: #f57c00; }
.ready-badge { background: #e8f5e9; color: #2e7d32; justify-content: center; }
.buyer-ready { margin-top: 12px; }

.dot-pulse {
  width: 10px; height: 10px; border-radius: 50%;
  background: #f57c00;
  animation: pulse 1.2s ease-in-out infinite;
}
@keyframes pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.7); } }

/* ── 就緒按鈕 ── */
.arrive-action { margin-top: auto; padding-top: 24px; }
.btn-ready {
  width: 100%; height: 52px; border: none; border-radius: 16px;
  font-size: 16px; font-weight: 900; cursor: pointer;
  background: #e0e0e0; color: #aaa; transition: 0.25s;
}
.btn-ready.active, .btn-ready.seller {
  background: #1a1a1a; color: #fff;
}
.btn-ready:disabled { opacity: 0.6; cursor: not-allowed; }

/* ── 訂單摘要卡 ── */
.order-summary {
  background: #fff; border-radius: 24px;
  padding: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.06);
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  margin-bottom: 24px;
}
.summary-img-wrap { width: 100px; height: 100px; border-radius: 16px; overflow: hidden; }
.summary-img { width: 100%; height: 100%; object-fit: cover; }
.summary-img-placeholder { width: 100%; height: 100%; background: #f5f5f5; display: flex; align-items: center; justify-content: center; font-size: 40px; }
.summary-name { font-size: 18px; font-weight: 900; color: #1a1a1a; }
.summary-rows { width: 100%; display: flex; flex-direction: column; gap: 8px; }
.summary-row { display: flex; justify-content: space-between; font-size: 14px; font-weight: 600; color: #555; }
.price-row { border-top: 1px solid #f0f0f0; padding-top: 10px; margin-top: 4px; }
.price-tag { font-size: 18px; font-weight: 900; color: #1a1a1a; }

.waiting-other {
  display: flex; align-items: center; justify-content: center; gap: 12px;
  padding: 16px; background: #fff8e1; border-radius: 14px;
  font-size: 14px; font-weight: 700; color: #f57c00;
}

/* ── 成交確認按鈕 ── */
.confirm-actions { display: flex; gap: 14px; margin-top: auto; }
.btn-deal {
  flex: 1; height: 52px; border: none; border-radius: 16px;
  font-size: 15px; font-weight: 900; cursor: pointer; transition: 0.2s;
}
.btn-deal.accept { background: #1a1a1a; color: #fff; }
.btn-deal.reject { background: #f5f5f5; color: #999; }
.btn-deal:active { transform: scale(0.97); }

/* ── 買家輸入價格 ── */
.price-hero {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 20px;
}
.price-context {
  display: flex; flex-direction: column; align-items: center;
  background: #f5f5f5; border-radius: 16px; padding: 12px 28px;
}
.price-context-label { font-size: 12px; font-weight: 700; color: #aaa; }
.price-context-val { font-size: 20px; font-weight: 900; color: #555; }
.price-desc { font-size: 14px; font-weight: 600; color: #888; }
.price-input-wrap {
  display: flex; align-items: center; gap: 8px;
  background: #fff; border: 2px solid #1a1a1a; border-radius: 20px;
  padding: 12px 20px; width: 100%; box-sizing: border-box; max-width: 100%; overflow: hidden;
}
.currency-sign { font-size: 28px; font-weight: 900; color: #1a1a1a; flex-shrink: 0; }
.price-input {
  flex: 1; min-width: 0; width: 100%;
  font-size: clamp(22px, 7vw, 36px); font-weight: 900; border: none; outline: none;
  color: #1a1a1a; background: transparent; text-align: center;
}
.price-input::placeholder { color: #ddd; }
.price-warn { font-size: 13px; font-weight: 700; color: #d32f2f; margin: 0; }

/* 交易評價 */
.rate-box { display: flex; flex-direction: column; align-items: center; gap: 12px; margin-top: 4px; }
.rate-title { font-size: 14px; font-weight: 700; color: #555; margin: 0; }
.rate-stars { display: flex; gap: 8px; }
.rate-star { font-size: 34px; color: #e0e0e0; cursor: pointer; transition: 0.15s; }
.rate-star.on { color: #f5b301; transform: scale(1.05); }
.rate-comment { width: 100%; box-sizing: border-box; border: 1.5px solid #e0e0e0; border-radius: 12px; padding: 10px 12px; font-size: 14px; resize: none; outline: none; font-family: inherit; }
.rate-comment:focus { border-color: #acc6b1; }
.rate-privacy { font-size: 11px; color: #999; line-height: 1.5; margin: 0; text-align: center; }
.btn-rate { background: #333; color: #fff; border: none; border-radius: 14px; padding: 12px 28px; font-size: 14px; font-weight: 800; cursor: pointer; }
.btn-rate:disabled { background: #ccc; }
.rate-thanks { font-size: 15px; font-weight: 800; color: #3d7a45; margin-top: 4px; }

.btn-submit-price {
  width: 100%; height: 52px; background: #1a1a1a; color: #fff;
  border: none; border-radius: 16px; font-size: 16px; font-weight: 900;
  cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; gap: 10px;
}
.btn-submit-price:disabled { background: #ccc; cursor: not-allowed; }

/* ── 賣家確認成交價 ── */
.seller-price-screen { align-items: center; }
.seller-price-hero {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 16px;
}
.seller-price-label { font-size: 14px; font-weight: 700; color: #888; }
.seller-price-display {
  font-size: clamp(34px, 13vw, 56px); font-weight: 900; color: #1a1a1a;
  max-width: 100%; overflow-wrap: anywhere; text-align: center; line-height: 1.1;
}
.seller-price-sub { font-size: 13px; color: #bbb; font-weight: 600; }
.seller-price-screen .confirm-actions { width: 100%; }

/* ── 完成動畫 ── */
.done-screen { align-items: center; justify-content: center; gap: 24px; }
.done-animation { display: flex; flex-direction: column; align-items: center; gap: 20px; }
.done-circle {
  width: 100px; height: 100px; border-radius: 50%;
  background: linear-gradient(135deg, #43a047, #2e7d32);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 12px 40px rgba(67,160,71,0.4);
  animation: pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes pop { 0% { transform: scale(0); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
.done-check { font-size: 52px; color: #fff; }
.done-title { font-size: 28px; font-weight: 900; color: #1a1a1a; }
.done-price { font-size: 18px; font-weight: 700; color: #43a047; }
.btn-done {
  width: 100%; height: 52px; background: #1a1a1a; color: #fff;
  border: none; border-radius: 16px; font-size: 16px; font-weight: 900;
}

/* ── Spinner ── */
.spinner {
  width: 18px; height: 18px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.4);
  border-top-color: #fff;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>