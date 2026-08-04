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
        <div
          v-for="m in messages"
          :key="m.id"
          class="chat-bubble-row"
          :class="{ mine: m.senderId === myUid }"
        >
          <span class="chat-bubble">{{ m.text }}</span>
        </div>
      </div>

      <div class="canned-grid">
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
import { CANNED_MESSAGES, subscribeOrderMessages, sendCannedMessage } from './can.js';

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

const scrollToBottom = () => {
  nextTick(() => { if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight; });
};

onMounted(() => {
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
</style>
