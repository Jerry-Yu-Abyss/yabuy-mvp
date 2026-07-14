<template>
  <div class="cam-page">
    <div class="upload-card">

      <div class="img-zone upload-trigger" :class="{ 'error-border': qualityError }" @click="triggerFile">
        <input type="file" ref="fileInput" hidden @change="onFileChange" accept="image/*" />
        <img v-if="uploadPreview" :src="uploadPreview" class="full-img" />
        <div v-else class="upload-guide">
          <IconCamera class="guide-icon" />
          <span class="guide-title">上傳商品圖片</span>
          <span v-if="qualityError" class="guide-err">{{ qualityError }}</span>
          <span v-else class="guide-sub">點擊選擇，自動壓縮以節省空間</span>
        </div>
        <div v-if="isCompressing" class="compressing-mask"><span>圖片處理中...</span></div>
      </div>

      <div class="form-area" @touchstart.stop @touchmove.stop>
        <div class="input-pill"><input v-model="form.name" placeholder="商品名稱" /></div>
        <div class="input-pill"><input v-model.number="form.price" type="number" placeholder="價格 (Price)" /></div>

        <div class="book-toggle-row" @click="toggleBookMode">
          <span class="toggle-label">這是一本參考書嗎？</span>
          <div class="toggle-switch" :class="{ active: form.isBook }"></div>
        </div>

        <div v-if="form.isBook" class="category-display" @click="openBookPicker">
          <span v-if="form.dept">{{ form.college }} > {{ form.dept }}{{ form.subject ? ' > ' + form.subject : '' }}</span>
          <span v-else class="placeholder">點擊選擇學科分類...</span>
        </div>

        <div v-else class="normal-category-container">
          <div class="sub-label">商品分類</div>
          <div class="pill-scroll">
            <div
              v-for="cat in productCategories"
              :key="cat"
              class="pill"
              :class="{ active: form.category === cat }"
              @click="form.category = cat"
            >{{ cat }}</div>
          </div>
        </div>

        <div class="input-pill textarea-pill">
          <textarea v-model="form.desc" placeholder="介紹一下你的商品吧！"></textarea>
        </div>

        <button
          class="submit-btn"
          :disabled="isUploading || !compressedBlob || !form.name.trim() || !form.price || form.price <= 0 || (form.isBook ? !form.dept : !form.category)"
          @click="firebaseUpload"
        >
          {{ isUploading ? '正在發布...' : '確認上傳' }}
        </button>
      </div>

    </div>

    <div v-if="showBookPicker" class="picker-overlay" @touchmove.stop>
      <div class="picker-window">
        <div class="picker-header">
          <h3>選擇學科分類</h3>
          <button class="close-icon" @click="showBookPicker = false">✕</button>
        </div>
        <div class="picker-body">
          <div class="picker-label">學院</div>
          <div class="pill-row">
            <div v-for="c in subjectData" :key="c.college" class="pill" :class="{ active: tempCollege === c.college }" @click="selectTempCollege(c)">{{ c.college }}</div>
          </div>
          <div class="picker-label" v-if="tempCollege">科系</div>
          <div class="pill-row">
            <div v-for="d in tempDepts" :key="d.name" class="pill" :class="{ active: tempDept === d.name }" @click="selectTempDept(d)">{{ d.name }}</div>
          </div>
          <div class="picker-label" v-if="tempDept && tempSubjects.length > 0">科目</div>
          <div class="pill-row" v-if="tempSubjects.length > 0">
            <div v-for="s in tempSubjects" :key="s" class="pill" :class="{ active: tempSubject === s }" @click="tempSubject = s">{{ s }}</div>
          </div>
        </div>
        <button class="confirm-btn" :disabled="!tempDept || (tempSubjects.length > 0 && !tempSubject)" @click="confirmCategory">確認選擇</button>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue';
import IconCamera from '@/assets/icons/camera.svg?component';
import { subjectData } from './Subject.js';
import { productCategories } from './Categories.js';

import { auth, db, storage } from '@/firebase';
import { ref as sRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

const emit = defineEmits(['upload-success']);

const fileInput = ref(null);
const uploadPreview = ref(null);
const compressedBlob = ref(null);
const qualityError = ref('');
const isCompressing = ref(false);
const isUploading = ref(false);

const form = reactive({
  name: '',
  price: '',
  desc: '',
  isBook: false,
  college: '',
  dept: '',
  subject: '',
  category: '' 
});

const showBookPicker = ref(false);
const tempCollege = ref('');
const tempDept = ref('');
const tempSubject = ref('');

const tempDepts = computed(() => {
  const c = subjectData.find(item => item.college === tempCollege.value);
  return c ? c.departments : [];
});

const tempSubjects = computed(() => {
  const d = tempDepts.value.find(item => item.name === tempDept.value);
  return d ? (d.subjects || []) : [];
});

const requireLogin = () => {
  if (!auth.currentUser) {
    alert("🔒 系統提示：\n請先前往右下角「會員」頁面登入，才能發布商品喔！");
    return false;
  }
  return true;
};

const selectTempCollege = (c) => {
  tempCollege.value = c.college; tempDept.value = ''; tempSubject.value = '';
};

const selectTempDept = (d) => {
  tempDept.value = d.name; tempSubject.value = '';
};

const toggleBookMode = () => {
  if (!requireLogin()) return;
  form.isBook = !form.isBook;
  if (form.isBook && !form.dept) showBookPicker.value = true;
};

const confirmCategory = () => {
  form.college = tempCollege.value;
  form.dept = tempDept.value;
  form.subject = tempSubject.value;
  showBookPicker.value = false;
};

// 開啟選擇器時帶入目前已選的學院/系所/科目
const openBookPicker = () => {
  tempCollege.value = form.college || '';
  tempDept.value = form.dept || '';
  tempSubject.value = form.subject || '';
  showBookPicker.value = true;
};

const triggerFile = () => {
  if (!requireLogin()) return;
  fileInput.value.click();
};

const onFileChange = (e) => {
  const file = e.target.files[0];
  qualityError.value = ''; uploadPreview.value = null; compressedBlob.value = null;
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { qualityError.value = '檔案過大 (上限 10MB)'; return; }
  
  isCompressing.value = true;
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = (ev) => {
    const img = new Image();
    img.src = ev.target.result;
    img.onload = () => {
      compressImage(img, (blob, dataUrl) => {
        compressedBlob.value = blob;
        uploadPreview.value = dataUrl;
        isCompressing.value = false;
      });
    };
    img.onerror = () => {
      isCompressing.value = false;
      qualityError.value = '圖片格式無法解析，請換一張';
    };
  };
  reader.onerror = () => {
    isCompressing.value = false;
    qualityError.value = '檔案讀取失敗，請重試';
  };
};

const compressImage = (img, callback) => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const maxWidth = 1024;
  let width = img.width;
  let height = img.height;

  if (width > maxWidth) {
    height = (maxWidth / width) * height;
    width = maxWidth;
  }

  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(img, 0, 0, width, height);
  
  canvas.toBlob((blob) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = () => callback(blob, reader.result);
  }, 'image/jpeg', 0.7);
};

const firebaseUpload = async () => {
  if (!requireLogin()) return;
  const user = auth.currentUser;

  if (!form.name.trim()) { alert('請填寫商品名稱'); return; }
  if (!form.price || form.price <= 0) { alert('請填寫有效的價格（需大於 0）'); return; }
  if (!compressedBlob.value) { alert('請先上傳商品圖片'); return; }

  isUploading.value = true;

  try {
    const fileName = `products/${Date.now()}-${user.uid}.jpg`;
    const storageRef = sRef(storage, fileName);
    
    const uploadResult = await uploadBytes(storageRef, compressedBlob.value);
    const downloadURL = await getDownloadURL(uploadResult.ref);

    await addDoc(collection(db, "products"), {
      ...form, 
      category: form.isBook ? '教科書' : form.category, 
      url: downloadURL,
      sellerId: user.uid,
      sellerName: user.displayName,
      createdAt: serverTimestamp(),
      status: 'active',
      color: '#acc6b1' 
    });

    alert(`✅ 商品已成功發布！\n\n⚠️ 系統提醒：\n若上傳違反本平台規定之商品 (如色情、暴力、藥物、個資)，\n將依規定刪除商品並禁用帳號。`);
  
    resetForm();
    emit('upload-success'); 

  } catch (error) {
    console.error("[Cam] 上傳失敗:", error);
    alert("發布失敗，請檢查網路或 Firebase 權限設定。");
  } finally {
    isUploading.value = false;
  }
};

const resetForm = () => {
  form.name = ''; form.price = ''; form.desc = '';
  form.isBook = false; form.college = ''; form.dept = ''; form.subject = ''; 
  form.category = ''; 
  uploadPreview.value = null; compressedBlob.value = null;
};
</script>

<style scoped>
.cam-page {
  width: 100%; height: 100%;
  display: flex; justify-content: center; align-items: center;
  padding: 14px; box-sizing: border-box; overflow-y: auto;
  background: #f6f8f4;
}
.upload-card {
  width: 100%; max-width: 400px;
  background: #fff; border-radius: 32px;
  display: flex; flex-direction: column; overflow: hidden;
  box-shadow: 0 20px 48px rgba(47, 74, 58, 0.16), 0 6px 16px rgba(47, 74, 58, 0.10);
  border: 1px solid rgba(255, 255, 255, 0.7);
}
.img-zone {
  flex-shrink: 0; height: 200px;
  background: #eef3ec; position: relative;
  display: flex; justify-content: center; align-items: center;
  cursor: pointer; overflow: hidden;
}
.img-zone.error-border { outline: 2px dashed #e74c3c; outline-offset: -4px; }
.full-img { width: 100%; height: 100%; object-fit: cover; }
.upload-guide { display: flex; flex-direction: column; align-items: center; gap: 6px; color: #8e8e93; }
.guide-icon { width: 44px; height: 44px; }
.guide-title { font-size: 15px; font-weight: 800; color: #555; }
.guide-sub { font-size: 12px; color: #aaa; }
.guide-err { font-size: 12px; color: #e74c3c; font-weight: 700; }
.compressing-mask {
  position: absolute; inset: 0;
  background: rgba(0,0,0,0.4); color: #fff;
  display: flex; align-items: center; justify-content: center; font-size: 14px;
}
.form-area {
  padding: 16px 18px 20px; display: flex; flex-direction: column; gap: 10px;
  background: #fff;
}
.input-pill { background: #f1f0ee; border-radius: 14px; padding: 12px 16px; }
.input-pill input, .input-pill textarea { border: none; background: transparent; width: 100%; outline: none; font-size: 15px; }
.textarea-pill { border-radius: 14px; min-height: 72px; }
.textarea-pill textarea { resize: none; height: 100%; }
.book-toggle-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 4px; cursor: pointer; }
.toggle-label { font-size: 14px; color: #555; font-weight: 700; }
.toggle-switch { width: 44px; height: 24px; background: #ddd; border-radius: 12px; position: relative; transition: 0.3s; flex-shrink: 0; }
.toggle-switch::after { content: ''; position: absolute; left: 2px; top: 2px; width: 20px; height: 20px; background: #fff; border-radius: 50%; transition: 0.3s; }
.toggle-switch.active { background: #acc6b1; }
.toggle-switch.active::after { left: 22px; }
.category-display { background: #fff8e1; border: 1.5px dashed #f3d18e; border-radius: 12px; padding: 12px 14px; font-size: 13px; color: #856404; text-align: center; cursor: pointer; font-weight: 700; }
.category-display .placeholder { color: #c8a44a; }
.normal-category-container { display: flex; flex-direction: column; gap: 8px; }
.sub-label { font-size: 12px; font-weight: 800; color: #999; padding-left: 4px; }
.pill-scroll {
  display: flex; flex-direction: row; gap: 8px;
  overflow-x: auto; -webkit-overflow-scrolling: touch;
  padding: 2px 2px 6px;
  scrollbar-width: none;
  touch-action: pan-x;             
  overscroll-behavior-x: contain;
}
.pill-scroll::-webkit-scrollbar { display: none; }
.pill {
  flex-shrink: 0; 
  padding: 8px 16px; background: #f1f0ee; border-radius: 999px;
  font-size: 13px; font-weight: 700; color: #555; cursor: pointer;
  transition: 0.15s; white-space: nowrap;
}
.pill.active { background: #333; color: #fff; }
.pill:active { transform: scale(0.95); }
.submit-btn { width: 100%; height: 50px; background: #333; color: #fff; border-radius: 999px; border: none; font-weight: 800; font-size: 16px; cursor: pointer; transition: 0.2s; margin-top: 4px; flex-shrink: 0; }
.submit-btn:disabled { background: #ccc; cursor: default; }
.submit-btn:not(:disabled):active { transform: scale(0.97); }
.picker-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: flex-end; justify-content: center; }
.picker-window { width: 100%; max-width: 500px; max-height: 70vh; background: #fff; border-radius: 28px 28px 0 0; padding: 20px 20px 36px; display: flex; flex-direction: column; gap: 16px; box-shadow: 0 -10px 30px rgba(0,0,0,0.2); }
.picker-header { display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }
.picker-header h3 { margin: 0; font-size: 17px; font-weight: 850; }
.close-icon { background: none; border: none; font-size: 20px; color: #999; cursor: pointer; }
.picker-body { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; display: flex; flex-direction: column; gap: 12px; }
.picker-label { font-size: 11px; color: #999; font-weight: 800; text-transform: uppercase; }
.pill-row { display: flex; flex-wrap: wrap; gap: 8px; }
.confirm-btn { flex-shrink: 0; height: 50px; background: #acc6b1; color: #fff; border: none; border-radius: 999px; font-weight: 800; font-size: 16px; cursor: pointer; transition: 0.2s; }
.confirm-btn:disabled { background: #e0e0e0; color: #bbb; }
</style>