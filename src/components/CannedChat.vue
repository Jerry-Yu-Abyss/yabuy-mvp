<template>
  <div class="chat-overlay" @click.self="$emit('close')" @touchmove.stop>
    <div class="chat-sheet">
      <div class="sheet-handle"></div>

      <header class="chat-header">
        <div>
          <h3>與{{ otherName }}協調面交</h3>
          <p class="chat-sub">{{ order.productName }}</p>
        </div>
        <button class="close-circle" @click="$emit('close')">✕</button>
      </header>

      <div ref="listEl" class="chat-list">
        <p v-if="loading" class="chat-empty">載入中...</p>
        <p v-else-if="messages.length === 0" class="chat-empty">還沒有訊息，點下面的短語開始協調吧</p>
        <template v-for="m in messages" :key="m.id">
          <!-- 推遲請求：帶著提議時間、等對方回覆，所以是卡片不是泡泡 -->
          <div v-if="m.kind === 'delay'" class="chat-bubble-row" :class="{ mine: m.senderId === myUid }">
            <div class="delay-card" :class="m.requestStatus">
              <div class="delay-card-title">⏰ 推遲面交時間</div>
              <div class="delay-card-time">{{ m.proposedTime }}</div>

              <div v-if="m.requestStatus === 'accepted'" class="delay-card-result ok">✅ 已同意，約定時間已更新</div>
              <div v-else-if="m.requestStatus === 'declined'" class="delay-card-result no">✕ 已婉拒，維持原時間</div>
              <div v-else-if="m.senderId === myUid" class="delay-card-result wait">⏳ 等待對方回覆</div>
              <div v-else class="delay-card-btns">
                <button class="delay-btn-no" :disabled="sending" @click="respondDelay(m, false)">婉拒</button>
                <button class="delay-btn-yes" :disabled="sending" @click="respondDelay(m, true)">同意推遲</button>
              </div>
            </div>
          </div>

          <div v-else class="chat-bubble-row" :class="{ mine: m.senderId === myUid }">
            <span class="chat-bubble">{{ m.text }}</span>
          </div>
        </template>
      </div>

      <Transition name="delay-slide">
        <div v-if="showDelayPanel" class="delay-panel">
          <div class="delay-panel-head">
            <span>希望推遲至幾點面交？</span>
            <button class="delay-panel-close" @click="showDelayPanel = false">✕</button>
          </div>
          <input type="datetime-local" v-model="proposedRaw" class="delay-time-input" />
          <p class="delay-panel-hint">
            <span v-if="delayError" class="err">{{ delayError }}</span>
            <span v-else>目前約定：{{ order.time }}　·　對方同意後才會生效</span>
          </p>
          <button class="delay-submit" :disabled="!!delayError || sending" @click="submitDelay">
            {{ sending ? '送出中...' : '送出推遲請求' }}
          </button>
        </div>
      </Transition>

      <div class="canned-grid">
        <button
          class="canned-chip delay-chip"
          :disabled="sending || myDelayUsed || order.status !== 'accepted'"
          :title="myDelayUsed ? '推遲請求買賣雙方各限 1 次，你已經用過了' : ''"
          @click="toggleDelayPanel"
        >{{ myDelayUsed ? '⏰ 推遲次數已用完' : DELAY_LABEL }}</button>
        <button
          v-for="msg in CANNED_MESSAGES"
          :key="msg"
          class="canned-chip"
          :disabled="sending"
          @click="handleSend(msg)"
        >{{ msg }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { auth } from '@/firebase';
import { toast } from './toast.js';
import { isTradeHourAllowed, isWithinSafeHours, subscribeTradeSettings } from './tradeSettings.js';
import {
  CANNED_MESSAGES,
  DELAY_LABEL,
  subscribeOrderMessages,
  sendCannedMessage,
  sendDelayRequest,
  acceptDelayRequest,
  declineDelayRequest
} from './can.js';

const props = defineProps({
  order: { type: Object, required: true },
  role: { type: String, required: true } // 'buy' | 'sell'
});
const emit = defineEmits(['close']);

const myUid = auth.currentUser?.uid;
const otherName = computed(() =>
  props.role === 'buy' ? (props.order.sellerName || '賣家') : (props.order.buyerName || '買家')
);

const messages = ref([]);
const loading = ref(true);
const sending = ref(false);
const listEl = ref(null);
let unsub = null;

/* ── 推遲面交時間 ──────────────────────────────────────────────
   額度買賣各 1 次，記在 orders.buyerDelayUsed / sellerDelayUsed，
   firestore.rules 的 delayUsedOk() 會強制（不是只靠這裡的 disabled）。
   order 是 Mailbox 用 computed 從 onSnapshot 清單即時取的，所以對方一同意，
   這裡的 order.time 與旗標都會自己更新。 */
const MAX_DELAY_MS = 24 * 60 * 60 * 1000; // 最多推遲到 24 小時內，不讓訂單被推到天邊
const showDelayPanel = ref(false);
const proposedRaw = ref('');

const myDelayUsed = computed(() =>
  props.role === 'buy' ? !!props.order.buyerDelayUsed : !!props.order.sellerDelayUsed
);

// orders.time 是不含時區的 "YYYY-MM-DD HH:mm"，沿用 Mailbox.vue 的解析慣例
const appointmentMs = () => {
  if (!props.order.time) return null;
  const d = new Date(props.order.time.replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d.getTime();
};

const toInputValue = (ms) => {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// 預設值從「原約定時間」與「現在」取較晚者再加 30 分鐘：逾期的訂單如果拿
// 原時間當基準，開起來會是一個已經過去的時間，使用者還得自己往後撥。
// 再把結果夾進 06:00–18:00：晚上 8 點開面板時「現在 +30 分」一定違規，
// 使用者會看到一個開場就報錯的預設值。落在時段外就順延到隔天上午 9 點。
const defaultProposal = () => {
  const base = Math.max(appointmentMs() ?? Date.now(), Date.now());
  const d = new Date(base + 30 * 60 * 1000);
  // 限制關掉時就不必挪——挪了反而讓測試者拿不到「現在 +30 分」這種時間
  if (isWithinSafeHours(d.getHours()) || !isTradeHourAllowed(d.getHours())) {
    return toInputValue(d.getTime());
  }
  if (d.getHours() >= 18) {
    d.setDate(d.getDate() + 1);
  }
  d.setHours(9, 0, 0, 0);
  return toInputValue(d.getTime());
};

const toggleDelayPanel = () => {
  if (myDelayUsed.value) return;
  showDelayPanel.value = !showDelayPanel.value;
  if (showDelayPanel.value && !proposedRaw.value) proposedRaw.value = defaultProposal();
};

const delayError = computed(() => {
  if (!proposedRaw.value) return '請選擇新的面交時間';
  const t = new Date(proposedRaw.value).getTime();
  if (isNaN(t)) return '時間格式不正確';
  if (t <= Date.now()) return '新時間必須晚於現在';
  if (t > Date.now() + MAX_DELAY_MS) return '最多只能推遲到 24 小時內';
  const cur = appointmentMs();
  if (cur != null && t <= cur) return '推遲的時間要比原本的約定時間晚';
  const h = new Date(t).getHours();
  // 與 TradeModal.vue 同一條規則，管理員關掉時段限制時這裡也跟著放行
  if (!isTradeHourAllowed(h)) return '面交時間限 06:00–18:00';
  return null;
});

const submitDelay = async () => {
  if (delayError.value || sending.value || !myUid) return;
  sending.value = true;
  try {
    // 存回 orders.time 用的格式，跟 Mailbox 的改提案一致（T → 空格）
    const proposedTime = proposedRaw.value.slice(0, 16).replace('T', ' ');
    await sendDelayRequest(props.order.id, myUid, props.role, proposedTime);
    showDelayPanel.value = false;
  } catch (e) {
    console.error('[CannedChat] 送出推遲請求失敗：', e.code, e.message);
    toast('❌ 推遲請求送出失敗，請重試。');
  } finally {
    sending.value = false;
  }
};

const respondDelay = async (m, accept) => {
  if (sending.value) return;
  sending.value = true;
  try {
    if (accept) await acceptDelayRequest(props.order.id, m.id, m.proposedTime);
    else await declineDelayRequest(m.id);
  } catch (e) {
    console.error('[CannedChat] 回覆推遲請求失敗：', e.code, e.message);
    toast('❌ 回覆失敗，請重試。');
  } finally {
    sending.value = false;
  }
};

const scrollToBottom = () => {
  nextTick(() => { if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight; });
};

onMounted(() => {
  subscribeTradeSettings();
  unsub = subscribeOrderMessages(
    props.order.id,
    (list) => { messages.value = list; loading.value = false; scrollToBottom(); },
    () => { loading.value = false; }
  );
});
onUnmounted(() => unsub?.());

const handleSend = async (text) => {
  if (!myUid || sending.value) return;
  sending.value = true;
  try {
    await sendCannedMessage(props.order.id, myUid, text);
  } catch (e) {
    console.error('[CannedChat] 送出訊息失敗：', e.code, e.message);
    toast('❌ 訊息送出失敗，請重試。');
  } finally {
    sending.value = false;
  }
};
</script>

<style scoped>
.chat-overlay {
  position: fixed; inset: 0; z-index: 10001;
  background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(8px);
  display: flex; justify-content: center; align-items: flex-end;
}
.chat-sheet {
  width: 100%; max-width: 500px; height: min(72vh, 620px);
  background: #f6f8f4; border-radius: 32px 32px 0 0;
  padding: 14px 20px 20px; box-sizing: border-box;
  display: flex; flex-direction: column; gap: 14px;
  box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.15);
}
.sheet-handle { width: 40px; height: 5px; background: #d8ded6; border-radius: 10px; margin: 0 auto; flex-shrink: 0; }

.chat-header { display: flex; justify-content: space-between; align-items: flex-start; flex-shrink: 0; }
.chat-header h3 { margin: 0; font-size: 16px; font-weight: 850; color: #2f4a3a; }
.chat-sub { margin: 4px 0 0; font-size: 12px; color: #8a958d; }
.close-circle { width: 30px; height: 30px; border-radius: 50%; border: none; background: rgba(0,0,0,0.06); color: #666; font-size: 13px; cursor: pointer; flex-shrink: 0; }

.chat-list {
  flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch;
  display: flex; flex-direction: column; gap: 8px;
  padding: 4px 2px;
}
.chat-empty { margin: auto; font-size: 13px; color: #a8b2a9; text-align: center; }

.chat-bubble-row { display: flex; }
.chat-bubble-row.mine { justify-content: flex-end; }
.chat-bubble {
  max-width: 78%; padding: 10px 14px; border-radius: 16px;
  font-size: 14px; font-weight: 600; line-height: 1.5;
  background: #fff; color: #2f4a3a;
  box-shadow: 0 1px 4px rgba(47, 74, 58, 0.06);
}
.chat-bubble-row.mine .chat-bubble { background: #2f4a3a; color: #fff; }

.canned-grid {
  flex-shrink: 0;
  display: flex; flex-wrap: wrap; gap: 8px;
  padding-top: 6px; border-top: 1px solid #e4e9e2;
}
.canned-chip {
  padding: 9px 14px; border-radius: 999px; border: 1.5px solid #d8ecd9;
  background: #fff; color: #3d5f4a; font-size: 12.5px; font-weight: 700;
  cursor: pointer;
}
.canned-chip:disabled { opacity: 0.5; cursor: not-allowed; }
.canned-chip:not(:disabled):active { background: #e8f2e9; }

/* 推遲入口跟一般短語不同性質（會改動訂單），用橘色區隔並獨占一行 */
.delay-chip { width: 100%; border-color: #ffd8b0; color: #b26a00; background: #fffaf3; }
.delay-chip:not(:disabled):active { background: #fff0dd; }

/* ── 推遲面板 ── */
.delay-panel {
  flex-shrink: 0; display: flex; flex-direction: column; gap: 8px;
  background: #fffaf3; border: 1.5px solid #ffd8b0; border-radius: 18px;
  padding: 14px;
}
.delay-panel-head { display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 850; color: #b26a00; }
.delay-panel-close { border: none; background: transparent; color: #b26a00; font-size: 13px; cursor: pointer; padding: 0 2px; }
.delay-time-input {
  width: 100%; box-sizing: border-box; padding: 10px 12px;
  border: 1.5px solid #ffd8b0; border-radius: 12px;
  font-size: 14px; font-weight: 700; color: #3d3a35; background: #fff;
}
.delay-panel-hint { margin: 0; font-size: 11px; font-weight: 700; color: #a08a70; }
.delay-panel-hint .err { color: #c1440e; }
.delay-submit {
  height: 42px; border: none; border-radius: 12px;
  background: #b26a00; color: #fff; font-size: 13.5px; font-weight: 850; cursor: pointer;
}
.delay-submit:disabled { background: #e0d6c8; color: #fff; cursor: not-allowed; }

.delay-slide-enter-active, .delay-slide-leave-active { transition: opacity 0.18s ease, transform 0.18s ease; }
.delay-slide-enter-from, .delay-slide-leave-to { opacity: 0; transform: translateY(8px); }

/* ── 訊息串裡的推遲請求卡片 ── */
.delay-card {
  max-width: 82%; padding: 12px 14px; border-radius: 16px;
  background: #fffaf3; border: 1.5px solid #ffd8b0;
  display: flex; flex-direction: column; gap: 6px;
  box-shadow: 0 1px 4px rgba(47, 74, 58, 0.06);
}
.delay-card.declined { opacity: 0.65; }
.delay-card-title { font-size: 11.5px; font-weight: 850; color: #b26a00; }
.delay-card-time { font-size: 15px; font-weight: 850; color: #3d3a35; }
.delay-card-result { font-size: 11.5px; font-weight: 800; }
.delay-card-result.ok { color: #2e7d32; }
.delay-card-result.no { color: #c1440e; }
.delay-card-result.wait { color: #a08a70; }
.delay-card-btns { display: flex; gap: 8px; margin-top: 2px; }
.delay-card-btns button { flex: 1; height: 34px; border-radius: 10px; font-size: 12.5px; font-weight: 850; cursor: pointer; }
.delay-btn-no { border: 1.5px solid #e4d9c9; background: #fff; color: #8a7a66; }
.delay-btn-yes { border: none; background: #b26a00; color: #fff; }
.delay-card-btns button:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
