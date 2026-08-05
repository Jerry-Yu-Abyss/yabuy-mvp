<template>
  <div class="reset-overlay">
    <div class="reset-card">
      <div class="reset-logo">
        <div class="logo-box"><span class="logo-y">Y</span></div>
        <span class="logo-name">YaBuy</span>
      </div>

      <!-- 驗證中 -->
      <template v-if="phase === 'checking'">
        <div class="state-hint">
          <div class="loader-dots"><span>.</span><span>.</span><span>.</span></div>
          <p>正在驗證連結...</p>
        </div>
      </template>

      <!-- 連結無效／過期 -->
      <template v-else-if="phase === 'invalid'">
        <div class="reset-icon fail">✕</div>
        <h2 class="reset-title">連結已失效</h2>
        <p class="reset-desc">{{ errorMsg }}</p>
        <p class="reset-desc small">請回到「查看登入狀態」重新申請更改密碼。</p>
        <button class="reset-btn" @click="backToApp">返回 YaBuy</button>
      </template>

      <!-- 驗證成功，輸入新密碼 -->
      <template v-else-if="phase === 'form'">
        <div class="reset-icon ok">✓</div>
        <h2 class="reset-title">設定新密碼</h2>
        <p class="reset-desc">帳號：{{ targetEmail }}</p>

        <form class="reset-form" @submit.prevent="handleSubmit">
          <input
            v-model="newPassword" type="password" autocomplete="new-password"
            class="reset-input" placeholder="新密碼（至少 6 碼）" minlength="6" required
          />
          <input
            v-model="confirmPassword" type="password" autocomplete="new-password"
            class="reset-input" placeholder="確認新密碼" minlength="6" required
          />
          <p v-if="formError" class="reset-error">{{ formError }}</p>
          <button type="submit" class="reset-btn" :disabled="submitting">
            {{ submitting ? '處理中…' : '確認更改密碼' }}
          </button>
        </form>
      </template>

      <!-- 完成 -->
      <template v-else-if="phase === 'done'">
        <div class="reset-icon ok">✓</div>
        <h2 class="reset-title">密碼已更新</h2>
        <p class="reset-desc">請用新密碼重新登入。</p>
        <button class="reset-btn" @click="backToApp">返回 YaBuy 登入</button>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { auth } from '@/firebase';
import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth';

const props = defineProps({ code: { type: String, required: true } });
const emit = defineEmits(['done']);

const phase = ref('checking'); // 'checking' | 'invalid' | 'form' | 'done'
const errorMsg = ref('');
const targetEmail = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const formError = ref('');
const submitting = ref(false);

const CODE_ERROR_MSG = {
  'auth/expired-action-code': '這個連結已經過期了，通常是因為又重新申請了一次更改密碼（新連結會讓舊的失效）。',
  'auth/invalid-action-code': '這個連結無效或已經被使用過了。',
  'auth/user-disabled': '此帳號已被停用。',
  'auth/user-not-found': '找不到對應的帳號。'
};

onMounted(async () => {
  try {
    // 驗證連結是否有效，同時拿到這個連結對應的信箱（不代表已完成更改，只是驗證通過）
    targetEmail.value = await verifyPasswordResetCode(auth, props.code);
    phase.value = 'form';
  } catch (e) {
    console.error('[ResetPasswordScreen] 驗證連結失敗：', e.code, e.message);
    errorMsg.value = CODE_ERROR_MSG[e.code] || '連結驗證失敗，請重新申請一次。';
    phase.value = 'invalid';
  }
});

const handleSubmit = async () => {
  formError.value = '';
  if (newPassword.value !== confirmPassword.value) {
    formError.value = '兩次輸入的密碼不一致，請重新確認。';
    return;
  }
  if (newPassword.value.length < 6) {
    formError.value = '密碼至少需要 6 碼。';
    return;
  }
  submitting.value = true;
  try {
    await confirmPasswordReset(auth, props.code, newPassword.value);
    phase.value = 'done';
  } catch (e) {
    console.error('[ResetPasswordScreen] 更改密碼失敗：', e.code, e.message);
    formError.value = CODE_ERROR_MSG[e.code] || '更改失敗，請重新申請連結後再試一次。';
  } finally {
    submitting.value = false;
  }
};

// 清掉網址上的 mode/oobCode 參數，回到一般的 App 畫面（是否已登入由 App.vue 既有邏輯決定）
const backToApp = () => emit('done');
</script>

<style scoped>
.reset-overlay {
  position: fixed; inset: 0; z-index: 100000;
  background: linear-gradient(160deg, #d1d9c6 0%, #aec5b3 100%);
  display: flex; align-items: center; justify-content: center; padding: 24px;
  font-family: 'Noto Sans TC', system-ui, sans-serif;
}
.reset-card {
  width: 100%; max-width: 380px;
  background: #fff; border-radius: 28px; padding: 36px 28px 30px;
  box-shadow: 0 24px 60px rgba(47, 74, 58, 0.25);
  display: flex; flex-direction: column; align-items: center; text-align: center;
}

.reset-logo { display: flex; align-items: center; gap: 8px; margin-bottom: 24px; }
.logo-box { width: 30px; height: 30px; border-radius: 8px; background: #2f4a3a; color: #fff; display: grid; place-items: center; font-weight: 800; font-family: 'LXGW WenKai TC', serif; }
.logo-name { font-size: 17px; font-weight: 800; color: #2f4a3a; }

.state-hint { padding: 30px 0; color: #8a958d; font-size: 13px; }
.loader-dots span { display: inline-block; font-size: 26px; font-weight: 900; color: #acc6b1; animation: blink 1.2s infinite; }
.loader-dots span:nth-child(2) { animation-delay: 0.2s; }
.loader-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes blink { 0%, 80%, 100% { opacity: 0.25; } 40% { opacity: 1; } }

.reset-icon {
  width: 56px; height: 56px; border-radius: 50%;
  display: grid; place-items: center; font-size: 26px; font-weight: 900; color: #fff;
  margin-bottom: 14px;
}
.reset-icon.ok { background: linear-gradient(135deg, #43a047, #2e7d32); }
.reset-icon.fail { background: linear-gradient(135deg, #e57373, #c62828); }

.reset-title { font-size: 19px; font-weight: 800; color: #2f4a3a; margin: 0 0 8px; }
.reset-desc { font-size: 13px; color: #7f8c8d; line-height: 1.7; margin: 0 0 4px; }
.reset-desc.small { font-size: 12px; }

.reset-form { width: 100%; display: flex; flex-direction: column; gap: 11px; margin-top: 18px; }
.reset-input {
  width: 100%; height: 50px; padding: 0 16px; box-sizing: border-box;
  border: 1.5px solid #e4e9e2; border-radius: 14px; background: #fff;
  font-size: 14px; color: #2f4a3a; outline: none; transition: 0.2s;
}
.reset-input:focus { border-color: #acc6b1; }
.reset-error { margin: 2px 0 0; font-size: 13px; font-weight: 700; color: #b3423a; }

.reset-btn {
  width: 100%; height: 52px; margin-top: 16px;
  background: #2f4a3a; color: #fff; border: none; border-radius: 16px;
  font-size: 15px; font-weight: 800; cursor: pointer; transition: 0.2s;
}
.reset-btn:hover { background: #3d5f4a; }
.reset-btn:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
