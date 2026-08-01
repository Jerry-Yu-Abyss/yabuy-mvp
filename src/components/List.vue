<template>
  <!-- 從左側滑入、覆蓋整個 App 容器的功能選單 -->
  <aside class="list-panel">
    <div class="panel-safe-top"></div>

    <header class="panel-head">
      <button
        v-if="view === 'profile'"
        class="back-btn"
        type="button"
        aria-label="返回選單"
        @click="view = 'menu'"
      >‹</button>
      <h2 class="panel-title">{{ view === 'profile' ? '更改個人資料' : '功能選單' }}</h2>
      <button class="close-btn" type="button" aria-label="關閉" @click="$emit('close')">✕</button>
    </header>

    <div class="panel-body">
      <!-- ── 選單 ── -->
      <template v-if="view === 'menu'">
        <section v-for="group in menuGroups" :key="group.title" class="menu-group">
          <p class="group-title">{{ group.title }}</p>

          <ul class="menu-list">
            <li v-for="item in group.items" :key="item.key">
              <button
                class="menu-item"
                type="button"
                :disabled="!item.ready"
                @click="item.ready && onItemClick(item.key)"
              >
                <span class="item-icon">{{ item.icon }}</span>
                <span class="item-text">
                  <span class="item-label">{{ item.label }}</span>
                  <span v-if="item.desc" class="item-desc">{{ item.desc }}</span>
                </span>
                <span v-if="item.ready" class="item-arrow">›</span>
                <span v-else class="item-soon">待新增</span>
              </button>
            </li>
          </ul>
        </section>

        <p class="panel-foot">其他功能陸續新增中…</p>
      </template>

      <!-- ── 更改個人資料 ── -->
      <template v-else-if="view === 'profile'">
        <div class="avatar-edit-row">
          <button class="avatar-pick" type="button" aria-label="更換大頭貼" @click="fileInput?.click()">
            <img :src="avatarPreview" class="avatar-preview" />
            <span class="avatar-pick-badge">📷</span>
          </button>
          <input
            ref="fileInput" type="file" accept="image/*"
            class="hidden-file-input" @change="onFileChange"
          />
        </div>
        <p v-if="fileError" class="field-error">{{ fileError }}</p>

        <section class="field-group">
          <label class="field-label" for="profile-name-input">名字</label>
          <div class="field-box">
            <input
              id="profile-name-input" type="text" v-model.trim="nameInput"
              placeholder="您的暱稱" maxlength="20"
            />
          </div>
        </section>

        <button class="save-btn" type="button" :disabled="!canSave || saving" @click="handleSave">
          {{ saving ? '儲存中…' : '儲存變更' }}
        </button>
      </template>
    </div>
  </aside>
</template>

<script setup>
import { ref, computed } from 'vue';
import { auth, db, storage } from '@/firebase';
import { updateProfile } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { ref as sRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { toast } from './toast.js';

const emit = defineEmits(['close', 'saved']);

const DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23d1d9c6'/%3E%3Ccircle cx='50' cy='40' r='17' fill='%23ffffff'/%3E%3Cpath d='M22 84c0-16 12-27 28-27s28 11 28 27z' fill='%23ffffff'/%3E%3C/svg%3E";

// ready: false 的項目僅先佔位，點擊不動作（避免給出假的可用功能）
const menuGroups = [
  {
    title: '帳號',
    items: [
      { key: 'profile', icon: '👤', label: '更改個人資料', desc: '名字、頭像', ready: true }
    ]
  }
];

const view = ref('menu');   // 'menu' | 'profile'

const nameInput = ref('');
const fileInput = ref(null);
const avatarPreview = ref(DEFAULT_AVATAR);
const compressedBlob = ref(null);
const fileError = ref('');
const saving = ref(false);

const onItemClick = (key) => {
  if (key !== 'profile') return;
  const fbUser = auth.currentUser;
  if (!fbUser) {
    toast('🔒 請先登入才能更改個人資料。');
    return;
  }
  nameInput.value = fbUser.displayName || '';
  avatarPreview.value = fbUser.photoURL || DEFAULT_AVATAR;
  compressedBlob.value = null;
  fileError.value = '';
  view.value = 'profile';
};

const canSave = computed(() => nameInput.value.trim().length > 0);

// 選取圖片 → 讀檔 → 置中裁切成正方形 → 壓縮（沿用 Cam.vue 上架圖片的處理方式）
const onFileChange = (e) => {
  const file = e.target.files[0];
  fileError.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) { fileError.value = '請選擇圖片檔'; return; }
  if (file.size > 10 * 1024 * 1024) { fileError.value = '檔案過大（上限 10MB）'; return; }

  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = (ev) => {
    const img = new Image();
    img.src = ev.target.result;
    img.onload = () => compressAvatar(img, (blob, dataUrl) => {
      compressedBlob.value = blob;
      avatarPreview.value = dataUrl;
    });
    img.onerror = () => { fileError.value = '圖片格式無法解析，請換一張'; };
  };
  reader.onerror = () => { fileError.value = '檔案讀取失敗，請重試'; };
};

const compressAvatar = (img, callback) => {
  const size = 1080;   // 約 1080P，頭像仍置中裁切成正方形
  const minSide = Math.min(img.width, img.height);
  const sx = (img.width - minSide) / 2;
  const sy = (img.height - minSide) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
  canvas.toBlob((blob) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = () => callback(blob, reader.result);
  }, 'image/jpeg', 0.85);
};

const handleSave = async () => {
  const fbUser = auth.currentUser;
  if (!fbUser || !canSave.value) return;
  saving.value = true;
  try {
    let photoURL = fbUser.photoURL || '';
    if (compressedBlob.value) {
      // 固定路徑（非帶時間戳）：換頭貼直接覆蓋舊檔，不在 Storage 留下垃圾檔案
      const storageRef = sRef(storage, `avatars/${fbUser.uid}.jpg`);
      const uploadResult = await uploadBytes(storageRef, compressedBlob.value);
      photoURL = await getDownloadURL(uploadResult.ref);
    }
    const displayName = nameInput.value.trim();

    // 兩邊都要寫：Auth profile 是即時 UI 顯示的來源（User.vue 讀 props.user），
    // Firestore users 文件是其他頁面（如賣家名稱、評價）查詢時的紀錄來源。
    await updateProfile(fbUser, { displayName, photoURL });
    await updateDoc(doc(db, 'users', fbUser.uid), { displayName, photoURL });

    toast('✅ 個人資料已更新');
    emit('saved');
    emit('close');
  } catch (error) {
    console.error('[List] 更新個人資料失敗:', error);
    toast('❌ 更新失敗，請稍後再試。');
  } finally {
    saving.value = false;
  }
};
</script>

<style scoped>
/* ── 從左滑入的過場（類別由 App.vue 的 <Transition name="slide-panel"> 掛上）── */
.slide-panel-enter-active,
.slide-panel-leave-active {
  transition: transform 0.28s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.slide-panel-enter-from,
.slide-panel-leave-to {
  transform: translateX(-100%);
}

/* 蓋滿整個 App 容器（.native-app-container 已是 position: relative） */
.list-panel {
  position: absolute;
  inset: 0;
  z-index: 60;
  display: flex;
  flex-direction: column;
  background: #f6f8f4;
  transform: translateX(0);   /* 明確的靜止狀態，過場結束後有基準可回歸 */
  will-change: transform;
}

/* 瀏海安全區：與 App.vue 的 .safe-area-spacer 同一套處理 */
.panel-safe-top {
  height: env(safe-area-inset-top, 48px);
  flex-shrink: 0;
  background: #d1d9c6;
}

.panel-head {
  flex-shrink: 0;
  height: 56px;
  padding: 0 16px;
  background: #d1d9c6;
  display: flex;
  align-items: center;
  gap: 8px;
}

.back-btn {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.55);
  color: #2f4a3a;
  font-size: 20px;
  font-weight: 800;
  line-height: 1;
  cursor: pointer;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.back-btn:active { background: rgba(255, 255, 255, 0.9); }

.panel-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: #2f4a3a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.close-btn {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.55);
  color: #2f4a3a;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.close-btn:active { background: rgba(255, 255, 255, 0.9); }

.panel-body {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-y: contain;
  padding: 18px 16px calc(env(safe-area-inset-bottom, 0px) + 28px);
}

.menu-group + .menu-group { margin-top: 22px; }

.group-title {
  margin: 0 0 8px 4px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 1px;
  color: #7f8c8d;
}

.menu-list {
  margin: 0;
  padding: 0;
  list-style: none;
  background: #fff;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 2px 10px rgba(47, 74, 58, 0.06);
}

.menu-list li + li { border-top: 1px solid #eef1ec; }

.menu-item {
  width: 100%;
  padding: 15px 16px;
  border: none;
  background: none;
  display: flex;
  align-items: center;
  gap: 13px;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
}
.menu-item:active:not(:disabled) { background: #f4f7f2; }
.menu-item:disabled { cursor: default; opacity: 0.55; }

.item-icon { font-size: 20px; flex-shrink: 0; }

.item-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.item-label { font-size: 15px; font-weight: 700; color: #2f4a3a; }
.item-desc { font-size: 12px; color: #8a958d; }

.item-arrow { font-size: 20px; color: #b9c3ba; flex-shrink: 0; }

.item-soon {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  color: #8a958d;
  background: #eef1ec;
  padding: 3px 9px;
  border-radius: 999px;
}

.panel-foot {
  margin: 22px 0 0;
  text-align: center;
  font-size: 12px;
  color: #a8b2a9;
}

/* ── 更改個人資料表單 ── */
.avatar-edit-row {
  display: flex;
  justify-content: center;
  padding: 8px 0 20px;
}

.avatar-pick {
  position: relative;
  width: 96px;
  height: 96px;
  border: none;
  border-radius: 50%;
  padding: 0;
  cursor: pointer;
  background: none;
}

.avatar-preview {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  object-fit: cover;
  display: block;
  background: #e4e9e2;
  box-shadow: 0 2px 10px rgba(47, 74, 58, 0.12);
}

.avatar-pick-badge {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: #2f4a3a;
  display: grid;
  place-items: center;
  font-size: 14px;
  border: 2px solid #f6f8f4;
}

.hidden-file-input { display: none; }

.field-error {
  margin: -12px 0 16px;
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  color: #b3423a;
}

.field-group { margin-bottom: 20px; }

.field-label {
  display: block;
  font-size: 12px;
  font-weight: 800;
  color: #999;
  text-transform: uppercase;
  margin-bottom: 8px;
}

.field-box {
  background: #fff;
  border-radius: 16px;
  padding: 4px 16px;
  box-shadow: 0 2px 10px rgba(47, 74, 58, 0.06);
}
.field-box input {
  width: 100%;
  height: 48px;
  border: none;
  background: transparent;
  outline: none;
  font-size: 16px;
  font-weight: 600;
  color: #2f4a3a;
  box-sizing: border-box;
}

.save-btn {
  width: 100%;
  height: 52px;
  border: none;
  border-radius: 16px;
  background: #2f4a3a;
  color: #fff;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
}
.save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.save-btn:not(:disabled):active { transform: scale(0.98); }
</style>
