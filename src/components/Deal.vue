<template>
  <div class="deal-overlay" @touchmove.stop>

    <DealTimeline v-if="step !== 'done'" :step="step" />

    <div v-if="step === 'safe-wait'" class="deal-screen safe-wait-screen">
      <div class="screen-header" :class="{ 'no-timeline': false }">
        <button class="back-pill" @click="handleBack">← 返回</button>
        <h2 class="screen-title">安全交易確認</h2>
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

      <div class="waiting-other" v-if="myReady && !otherReady">
        <span class="dot-pulse"></span>
        等待對方按下安全交易...
      </div>

      <div class="arrive-action" v-if="!myReady">
        <button class="btn-ready active" @click="setReady">🔒 按下安全交易</button>
      </div>
    </div>

    <div v-if="step === 'scan'" class="deal-screen scan-screen">
      <div class="screen-header">
        <button class="back-pill" @click="handleBack">← 返回</button>
        <h2 class="screen-title">掃描交易點 QR</h2>
        <div></div>
      </div>

      <template v-if="!myScanned">
        <div class="scan-hero">
          <p class="scan-label">請掃描「{{ liveOrder.location }}」現場張貼的交易點 QR</p>
          <div class="scan-box" :class="{ scanning: isScanning }">
            <video ref="scanVideo" class="scan-video" playsinline></video>
            <div class="scan-frame">
              <div class="corner tl"></div><div class="corner tr"></div>
              <div class="corner bl"></div><div class="corner br"></div>
              <div class="scan-line" v-if="isScanning"></div>
            </div>
          </div>

          <div v-if="!isScanning" class="scan-actions">
            <button class="btn-scan" @click="startScan">開啟相機掃描</button>
            <p class="manual-hint">或手動輸入交易點代碼</p>
            <div class="manual-row">
              <input v-model="manualCode" class="manual-input" placeholder="輸入交易點代碼" />
              <button class="btn-manual-confirm" @click="confirmManual">確認</button>
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="scan-done-badge">
          ✅ 已確認位於「{{ nameForLocationCode(liveOrder.actualLocationCode) }}」
        </div>
        <div class="waiting-other">
          <span class="dot-pulse"></span>
          等待對方掃描...
        </div>
      </template>

      <p class="safety-note">📷 系統將記錄實際交易時間與地點，若後續有糾紛將以該地點監視器錄影保障同學安全。</p>
    </div>

    <div v-if="step === 'price'" class="deal-screen price-screen">
      <div class="screen-header">
        <button class="back-pill" @click="handleBack">← 返回</button>
        <h2 class="screen-title">輸入成交價格</h2>
        <div></div>
      </div>

      <template v-if="role === 'sell'">
        <!-- 賣家在買家送出金額前，只需等待 -->
        <div class="waiting-other price-wait">
          <span class="dot-pulse"></span>
          等待買家輸入成交金額...
        </div>
      </template>

      <template v-else-if="priceSubmitted">
        <!-- 已送出：金額寫入後 step 仍停在 'price'，改顯示等待狀態而非可再送出的表單 -->
        <div class="price-hero">
          <div class="price-context">
            <span class="price-context-label">已送出金額</span>
            <span class="price-context-val">${{ liveOrder.finalPrice }}</span>
          </div>
        </div>
        <div class="waiting-other">
          <span class="dot-pulse"></span>
          等待賣家確認金額...
        </div>
      </template>

      <template v-else>
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
      </template>
    </div>

    <div v-if="step === 'seller-confirm-price'" class="deal-screen seller-price-screen">
      <div class="screen-header">
        <button class="back-pill" @click="handleBack">← 返回</button>
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
      </div>

      <div class="done-actual-box">
        <div class="done-actual-row"><span>📍 實際地點</span><span>{{ actualLocationName }}</span></div>
        <div class="done-actual-row"><span>⏰ 實際時間</span><span>{{ actualTimeText }}</span></div>
        <div class="done-actual-row price"><span>💰 實際金額</span><span>${{ liveOrder.finalPrice }}</span></div>
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
import { ref, computed, onMounted, onUnmounted } from 'vue';
import jsQR from 'jsqr';       // 掃描 QR（純 JS，iOS 也支援）：npm install jsqr
import { db, auth } from '@/firebase';
import { doc, onSnapshot, updateDoc, serverTimestamp, addDoc, collection, increment } from 'firebase/firestore';
import { codeForLocationName, nameForLocationCode } from './TradePoints.js';
import DealTimeline from './DealTimeline.vue';

const props = defineProps({
  order: { type: Object, required: true },
  role:  { type: String, required: true }
});
const emit = defineEmits(['close']);

const step            = ref('safe-wait');
const isScanning      = ref(false);
const manualCode      = ref('');
const finalPrice      = ref(null);
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

const scanVideo      = ref(null);
let   scanStream     = null;
let   unsubOrder     = null;

// 🔍 [偵錯] 統一 log 工具：買賣雙方各自的裝置會標示自己的角色，方便在 DevTools 比對。
const DEBUG = { enabled: true };
const ROLE_LABEL = props.role === 'buy' ? '買家' : props.role === 'sell' ? '賣家' : `未知(${props.role})`;
const log = (...args) => { if (DEBUG.enabled) console.log(`%c[Deal:${ROLE_LABEL}]`, 'color:#2e7d32;font-weight:bold;', ...args); };
const warn = (...args) => { if (DEBUG.enabled) console.warn(`[Deal:${ROLE_LABEL}]`, ...args); };
const peek = (o) => ({
  status: o.status, finalPrice: o.finalPrice,
  buyerReady: o.buyerReady, sellerReady: o.sellerReady,
  buyerScannedAt: !!o.buyerScannedAt, sellerScannedAt: !!o.sellerScannedAt,
  step: step.value
});

// ✅ 響應式狀態：用於即時同步 Firestore 資料
const liveOrder = ref({ ...props.order });

const myReady    = computed(() => (props.role === 'buy' ? !!liveOrder.value.buyerReady : !!liveOrder.value.sellerReady));
const otherReady = computed(() => (props.role === 'buy' ? !!liveOrder.value.sellerReady : !!liveOrder.value.buyerReady));

const myScanned    = computed(() => (props.role === 'buy' ? !!liveOrder.value.buyerScannedAt : !!liveOrder.value.sellerScannedAt));
const otherScanned = computed(() => (props.role === 'buy' ? !!liveOrder.value.sellerScannedAt : !!liveOrder.value.buyerScannedAt));

// 買家已送出金額、等待賣家確認（以 Firestore 快照為準，不看本地送出狀態）
const priceSubmitted = computed(() => Number(liveOrder.value.finalPrice) > 0);

// 交易點掃描應比對的代碼：由訂單的 location 名稱查表得出
const expectedCode = computed(() => codeForLocationName(liveOrder.value.location));

const actualLocationName = computed(() =>
  nameForLocationCode(liveOrder.value.actualLocationCode) || liveOrder.value.location
);
const actualTimeText = computed(() => {
  const b = liveOrder.value.buyerScannedAt?.toDate?.();
  const s = liveOrder.value.sellerScannedAt?.toDate?.();
  const latest = [b, s].filter(Boolean).sort((a, c) => c - a)[0];
  if (!latest) return '—';
  return `${latest.getMonth() + 1}/${latest.getDate()} ${latest.getHours().toString().padStart(2, '0')}:${latest.getMinutes().toString().padStart(2, '0')}`;
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
    liveOrder.value = { id: snap.id, ...snap.data() };
    log('📡 收到最新快照 →', peek(liveOrder.value));
    syncStep();
  }, (err) => {
    // ⚠️ onSnapshot 的「錯誤」回呼：權限不足、規則擋住時會走這裡（很常見的卡關原因！）
    warn('🔥 onSnapshot 監聽失敗（請檢查 Firestore 規則 / 網路）：', err.code, err.message);
  });
});

onUnmounted(() => {
  log('🧹 Deal 卸載，解除監聽');
  unsubOrder?.();
  stopScan();
});

// 分支順序＝流程由後往前，且只依 Firestore 狀態推導，不依賴目前的 step，
// 這樣關掉 Deal 再重開時一定會回到正確的當前步驟，不會退回已完成的步驟。
const syncStep = () => {
  const o = liveOrder.value;

  if (o.status === 'completed') { log('  ✅ 分支[completed] → step=done'); step.value = 'done'; return; }

  // 對方在面交進行中按了取消 → 立刻收掉畫面並告知，
  // 否則我方會停在原步驟完全沒反應，不知道交易已經沒了。
  if (o.status === 'rejected' || o.status === 'failed') {
    log('  🚫 分支[交易已取消] → 關閉畫面', { status: o.status, lastActionBy: o.lastActionBy });
    stopScan();
    alert('這筆交易已被取消。');
    emit('close');
    return;
  }

  const bothScanned = !!o.buyerScannedAt && !!o.sellerScannedAt;
  if (bothScanned) {
    if (props.role === 'sell' && o.finalPrice) {
      log('  💰 分支[已掃碼, 金額已送出] → step=seller-confirm-price');
      step.value = 'seller-confirm-price';
    } else {
      log('  💰 分支[已掃碼] → step=price');
      step.value = 'price';
    }
    return;
  }

  if (o.buyerReady && o.sellerReady) {
    log('  📷 分支[雙方已按安全交易] → step=scan');
    step.value = 'scan';
    return;
  }

  log('  🔒 分支[等待安全交易] → step=safe-wait');
  step.value = 'safe-wait';
};

const setReady = async () => {
  const field = props.role === 'buy' ? 'buyerReady' : 'sellerReady';
  log(`👉 點擊「按下安全交易」→ 準備寫入 ${field}=true`);
  try {
    await updateDoc(doc(db, "orders", props.order.id), { [field]: true, updatedAt: serverTimestamp() });
    log(`✅ ${field}=true 已成功寫入 Firestore`);
  } catch (e) {
    warn(`🔥 寫入 ${field} 失敗（多半是 Firestore 規則或網路）：`, e.code, e.message);
    alert('安全交易確認送出失敗，請檢查網路後重試。');
  }
};

const recordScan = async () => {
  const field = props.role === 'buy' ? 'buyerScannedAt' : 'sellerScannedAt';
  log(`👉 掃描成功 → 準備寫入 ${field}=serverTimestamp()，地點代碼=${expectedCode.value}`);
  try {
    await updateDoc(doc(db, "orders", props.order.id), {
      [field]: serverTimestamp(),
      actualLocationCode: expectedCode.value,
      updatedAt: serverTimestamp()
    });
    log(`✅ ${field} 已成功寫入 Firestore`);
  } catch (e) {
    warn(`🔥 寫入 ${field} 失敗：`, e.code, e.message);
    alert('掃描確認送出失敗，請重試。');
  }
};

const confirmManual = () => {
  const code = manualCode.value.trim().toUpperCase();
  log('🔑 手動輸入交易點代碼比對：', { 輸入: code, 應為: expectedCode.value });
  if (!expectedCode.value) {
    warn('  ⚠️ 此訂單的地點不在交易點清單內：', liveOrder.value.location);
    alert('此訂單的地點不在交易點清單內，請聯繫平台管理員。');
    return;
  }
  if (code === expectedCode.value) {
    log('  ✅ 代碼正確');
    recordScan();
  } else {
    warn('  ❌ 代碼不符');
    alert('交易點代碼不符，請確認您在正確的地點。');
  }
};

const startScan = async () => {
  log('📷 嘗試開啟相機掃描');
  // 相機僅在安全環境(HTTPS 或 localhost)可用；用區網 IP + http 測試會失敗
  if (!navigator.mediaDevices?.getUserMedia) {
    warn('  🔥 此環境無法使用相機（需 HTTPS）');
    alert('無法開啟相機：請改用 HTTPS 網址（已部署的網站），或改用下方手動輸入交易點代碼。');
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
    if (e.name === 'NotAllowedError') alert('相機權限被拒絕，請到瀏覽器設定允許相機，或改用手動輸入交易點代碼。');
    else alert('相機啟動失敗，請改用下方手動輸入交易點代碼。');
  }
};

const stopScan = () => {
  if (scanStream) { scanStream.getTracks().forEach(t => t.stop()); scanStream = null; }
  isScanning.value = false;
};

// 返回信箱。進度都存在 Firestore，退出不會遺失，重新進來會回到同一步驟；
// 使用者也需要能退出去信箱按「取消交易」（交易進行中仍允許取消）。
const handleBack = () => {
  stopScan();   // 確實釋放相機，否則鏡頭燈會一直亮著
  emit('close');
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
        const scanned = code.data.trim().toUpperCase();
        log('  🔍 偵測到 QR：', scanned, '｜預期：', expectedCode.value);
        if (expectedCode.value && scanned === expectedCode.value) {
          log('  ✅ QR 比對成功');
          stopScan();
          recordScan();
          return;
        }
      }
    }
    requestAnimationFrame(loop);
  };
  loop();
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
  } finally {
    // 成功路徑也必須解除 loading：寫入成功後 step 仍停在 'price'
    // （syncStep 沒有對應分支），漏掉這行會讓送出鍵永遠轉圈圈。
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

/* ── 頂部 header（時間線已佔掉安全區留白，這裡不用再留） ── */
.screen-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 0 24px;
}
.back-pill {
  background: #fff; border: 1px solid #e0e0e0;
  padding: 7px 16px; border-radius: 999px;
  font-size: 13px; font-weight: 700; color: #555;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}
.screen-title { font-size: 20px; font-weight: 900; color: #1a1a1a; letter-spacing: -0.5px; }

/* ── 掃描（買賣雙方共用同一套 UI） ── */
.scan-hero { display: flex; flex-direction: column; align-items: center; gap: 16px; margin-top: 12px; }
.scan-label { font-size: 15px; font-weight: 700; color: #555; text-align: center; }
.scan-box {
  width: 240px; height: 240px; border-radius: 24px; overflow: hidden;
  position: relative; background: #111;
  box-shadow: 0 8px 32px rgba(0,0,0,0.15);
  transition: box-shadow 0.3s;
}
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

.scan-done-badge {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 16px 20px; border-radius: 14px; margin-top: 12px;
  font-size: 14px; font-weight: 800; background: #e8f5e9; color: #2e7d32;
}
.safety-note {
  margin-top: auto; padding-top: 20px;
  font-size: 12px; color: #999; line-height: 1.6; text-align: center;
}

/* ── 就緒 / 等待 徽章 ── */
.dot-pulse {
  width: 10px; height: 10px; border-radius: 50%;
  background: #f57c00;
  animation: pulse 1.2s ease-in-out infinite;
  flex-shrink: 0;
}
@keyframes pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.7); } }

/* ── 安全交易按鈕 ── */
.arrive-action { margin-top: auto; padding-top: 24px; }
.btn-ready {
  width: 100%; height: 52px; border: none; border-radius: 16px;
  font-size: 16px; font-weight: 900; cursor: pointer; transition: 0.25s;
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
  margin-top: 12px;
}
.price-wait { margin: auto; }

/* ── 成交確認按鈕（賣家確認金額用） ── */
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

/* ── 完成畫面 ── */
.done-screen { align-items: center; justify-content: center; gap: 20px; padding-top: 24px; }
.done-animation { display: flex; flex-direction: column; align-items: center; gap: 16px; }
.done-circle {
  width: 92px; height: 92px; border-radius: 50%;
  background: linear-gradient(135deg, #43a047, #2e7d32);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 12px 40px rgba(67,160,71,0.4);
  animation: pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes pop { 0% { transform: scale(0); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
.done-check { font-size: 48px; color: #fff; }
.done-title { font-size: 24px; font-weight: 900; color: #1a1a1a; }

.done-actual-box {
  width: 100%; background: #fff; border-radius: 18px; padding: 16px 18px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.06);
  display: flex; flex-direction: column; gap: 10px;
}
.done-actual-row { display: flex; justify-content: space-between; font-size: 13px; font-weight: 700; color: #666; }
.done-actual-row.price { border-top: 1px solid #f0f0f0; padding-top: 10px; color: #1a1a1a; font-size: 15px; font-weight: 900; }

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
