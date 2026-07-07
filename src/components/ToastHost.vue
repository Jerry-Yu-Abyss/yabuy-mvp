<template>
  <!-- 浮動提示堆疊 -->
  <div class="toast-host">
    <TransitionGroup name="toast">
      <div
        v-for="t in toastState.items"
        :key="t.id"
        class="toast-item"
        :class="t.type"
        @click="toastState.items.splice(toastState.items.indexOf(t), 1)"
      >
        <span class="toast-ic">{{ icon(t.type) }}</span>
        <span class="toast-msg">{{ stripLead(t.message) }}</span>
      </div>
    </TransitionGroup>
  </div>

  <!-- 確認對話框 -->
  <Transition name="confirm-fade">
    <div v-if="toastState.confirm" class="confirm-overlay" @click.self="answerConfirm(false)">
      <div class="confirm-box">
        <h3 class="confirm-title">{{ toastState.confirm.title }}</h3>
        <p class="confirm-msg">{{ toastState.confirm.message }}</p>
        <div class="confirm-actions">
          <button class="cf-btn cancel" @click="answerConfirm(false)">{{ toastState.confirm.cancelText }}</button>
          <button class="cf-btn ok" :class="{ danger: toastState.confirm.danger }" @click="answerConfirm(true)">
            {{ toastState.confirm.confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { toastState, answerConfirm } from './toast.js';

const icon = (type) => ({ success: '✅', error: '⛔', warning: '⚠️', info: 'ℹ️' }[type] || 'ℹ️');
// 訊息開頭若已有 emoji，畫面用自己的圖示就好，避免重複
const stripLead = (m) => String(m).replace(/^(\s*[✅❌🚨⚠️ℹ️])\s*/, '');
</script>

<style scoped>
/* ===== 浮動提示 ===== */
.toast-host {
  position: fixed; top: 0; left: 0; right: 0; z-index: 99999;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 54px 16px 0; pointer-events: none;
}
.toast-item {
  pointer-events: auto; cursor: pointer;
  max-width: 360px; width: fit-content;
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px; border-radius: 14px;
  background: #2c3e50; color: #fff;
  box-shadow: 0 8px 24px rgba(0,0,0,0.18);
  font-size: 14px; font-weight: 700; line-height: 1.4;
}
.toast-item.success { background: #3d7a45; }
.toast-item.error   { background: #d32f2f; }
.toast-item.warning { background: #e67e22; }
.toast-item.info    { background: #2c3e50; }
.toast-ic { font-size: 15px; flex-shrink: 0; }
.toast-msg { word-break: break-word; }

.toast-enter-active, .toast-leave-active { transition: all 0.3s ease; }
.toast-enter-from { opacity: 0; transform: translateY(-16px); }
.toast-leave-to   { opacity: 0; transform: translateY(-10px); }

/* ===== 確認對話框 ===== */
.confirm-overlay {
  position: fixed; inset: 0; z-index: 100000;
  background: rgba(0,0,0,0.55); backdrop-filter: blur(3px);
  display: flex; align-items: center; justify-content: center; padding: 24px;
}
.confirm-box {
  background: #fff; width: 100%; max-width: 320px;
  border-radius: 22px; padding: 24px 22px 18px;
  box-shadow: 0 20px 50px rgba(0,0,0,0.25);
}
.confirm-title { margin: 0 0 10px; font-size: 17px; font-weight: 900; color: #2c3e50; }
.confirm-msg { margin: 0 0 20px; font-size: 14px; color: #666; line-height: 1.6; white-space: pre-wrap; }
.confirm-actions { display: flex; gap: 10px; }
.cf-btn { flex: 1; padding: 12px; border-radius: 12px; font-size: 14px; font-weight: 800; cursor: pointer; border: none; transition: 0.15s; }
.cf-btn:active { transform: scale(0.97); }
.cf-btn.cancel { background: #f1f0ee; color: #555; }
.cf-btn.ok { background: #2c3e50; color: #fff; }
.cf-btn.ok.danger { background: #d32f2f; }

.confirm-fade-enter-active, .confirm-fade-leave-active { transition: opacity 0.2s ease; }
.confirm-fade-enter-from, .confirm-fade-leave-to { opacity: 0; }
</style>