<template>
  <div class="req-wrap">
    <!-- 發布徵求刻意不受維護開關影響：貼一則徵求不是交易，規則層也不擋。
         會被維護擋住的是「我有這本書」，那條走 orders.create。 -->
    <button v-if="!composing" class="req-new-btn" @click="openCompose">
      ＋ 我要徵求一本書
    </button>
    <p v-if="tradeMaintenance" class="req-maint-note">
      🚧 交易功能維護中：現在仍可發布徵求，但要等維護結束才有人能應徵。
    </p>

    <Transition name="req-slide">
      <form v-if="composing" class="req-form" @submit.prevent="submitRequest">
        <div class="req-form-head">
          <span>徵求一本書</span>
          <button type="button" class="req-x" @click="composing = false">✕</button>
        </div>

        <label class="req-photo" :class="{ filled: !!previewUrl }">
          <input type="file" accept="image/*" @change="pickPhoto" hidden />
          <img v-if="previewUrl" :src="previewUrl" class="req-photo-img" alt="" />
          <template v-else>
            <span class="req-photo-icon">📷</span>
            <span class="req-photo-text">上傳書本照片</span>
            <span class="req-photo-hint">封面或書名頁都可以</span>
          </template>
        </label>

        <input v-model="bookName" class="req-input" maxlength="60" placeholder="書名（必填）" />

        <div class="req-row">
          <select v-model="college" class="req-input req-select">
            <option value="">選擇學院</option>
            <option v-for="c in subjectData" :key="c.college" :value="c.college">{{ c.college }}</option>
          </select>
          <select v-model="dept" class="req-input req-select" :disabled="!college">
            <option value="">選擇系所</option>
            <option v-for="d in deptOptions" :key="d.name" :value="d.name">{{ d.name }}</option>
          </select>
        </div>

        <div class="req-price-row">
          <span class="req-price-label">願付金額</span>
          <span class="req-price-sign">$</span>
          <input v-model.number="wantPrice" type="number" min="1" :max="MAX_PRICE" class="req-price-input" placeholder="0" />
        </div>
        <p class="req-price-hint">
          這是給提供方參考的數字，實際金額仍在面交當下由你輸入、對方確認。
        </p>

        <p v-if="formError" class="req-err">⚠️ {{ formError }}</p>
        <button class="req-submit" :disabled="!!formError || submitting">
          {{ submitting ? '發布中...' : '發布徵求' }}
        </button>
      </form>
    </Transition>

    <!-- 徵求列表 -->
    <div v-if="loading" class="req-loading">
      <div class="mini-radar"></div>
      <p>正在載入徵求中的書...</p>
    </div>

    <div v-else-if="visible.length === 0" class="req-empty">
      <div class="req-empty-icon">🔍</div>
      <p>這個分類目前沒有人在徵求<br><span>換個系所看看，或發布你自己的徵求</span></p>
    </div>

    <div v-else class="req-list">
      <article v-for="r in visible" :key="r.id" class="req-card">
        <div class="req-card-photo">
          <img v-if="r.url" :src="r.url" alt="" />
          <span v-else>📚</span>
        </div>

        <div class="req-card-body">
          <div class="req-card-top">
            <h3 class="req-card-name">{{ r.bookName }}</h3>
            <span class="req-card-price">${{ r.wantPrice }}</span>
          </div>
          <p class="req-card-meta">{{ r.college }} · {{ r.dept }}</p>

          <button
            v-if="isMine(r)"
            class="req-card-btn mine"
            :disabled="closing === r.id"
            @click="closeRequest(r)"
          >{{ closing === r.id ? '關閉中...' : '結束徵求' }}</button>

          <button
            v-else
            class="req-card-btn"
            :disabled="tradeMaintenance"
            @click="offerBook(r)"
          >{{ tradeMaintenance ? '🚧 維護中' : '我有這本書' }}</button>
        </div>
      </article>
    </div>

    <div class="req-spacer"></div>

    <!-- 應徵走的是一般的面交預約流程，只是把徵求貼文包成 product 的形狀 -->
    <TradeModal
      v-if="offering"
      :product="offering"
      @close="offering = null"
      @submit="submitOrder"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { auth, db, storage } from '@/firebase';
import {
  collection, query, where, orderBy, onSnapshot,
  addDoc, updateDoc, doc, serverTimestamp
} from 'firebase/firestore';
import { ref as sRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { subjectData } from './Subject.js';
import TradeModal from './TradeModal.vue';
import { toast } from './toast.js';
import { blockUnverifiedForTrade } from './verify.js';
import { tradeMaintenance, subscribeTradeSettings } from './tradeSettings.js';

const props = defineProps({
  college: { type: String, default: '全部' },
  dept: { type: String, default: '' }
});

// 與 Deal.vue 的 MAX_PRICE、firestore.rules 的成交價上限一致。
// 這裡放寬的話，貼文寫得出來的價格會在面交輸入金額時才被規則擋掉。
const MAX_PRICE = 10000;

const requests = ref([]);
const loading = ref(true);
let unsub = null;

/* ── 列表 ───────────────────────────────────────────────── */
// 只讀 open 的貼文。成交後 onOrderClosed 會把它關掉，關掉的就不該再被應徵。
const subscribe = () => {
  const q = query(
    collection(db, 'book_requests'),
    where('status', '==', 'open'),
    orderBy('createdAt', 'desc')
  );
  unsub = onSnapshot(
    q,
    (snap) => {
      requests.value = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      loading.value = false;
    },
    (err) => {
      console.error('[BookRequests] 讀取失敗（檢查 status+createdAt 索引）：', err.code, err.message);
      loading.value = false;
    }
  );
};

// 篩選跟著上層的學院／系所走，讓兩個模式的篩選列共用同一組狀態
const visible = computed(() => {
  if (props.college === '全部') return requests.value;
  return requests.value.filter(
    (r) => r.college === props.college && (!props.dept || r.dept === props.dept)
  );
});

const isMine = (r) => auth.currentUser?.uid === r.requesterId;

/* ── 發布徵求 ───────────────────────────────────────────── */
const composing = ref(false);
const bookName = ref('');
const college = ref('');
const dept = ref('');
const wantPrice = ref(null);
const photoFile = ref(null);
const previewUrl = ref('');
const submitting = ref(false);

const deptOptions = computed(
  () => subjectData.find((c) => c.college === college.value)?.departments || []
);

const openCompose = async () => {
  if (!auth.currentUser) {
    alert('🔒 請先前往右下角「會員」頁面登入，才能發布徵求。');
    return;
  }
  if (!(await blockUnverifiedForTrade(auth.currentUser, (msg) => alert(msg), { action: '發布徵求' }))) return;
  composing.value = true;
  if (!college.value && props.college !== '全部') {
    college.value = props.college;
    dept.value = props.dept || '';
  }
};

const pickPhoto = (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  photoFile.value = f;
  previewUrl.value = URL.createObjectURL(f);
};

const formError = computed(() => {
  if (!bookName.value.trim()) return '請填書名';
  if (!college.value) return '請選擇學院';
  if (!dept.value) return '請選擇系所';
  if (!wantPrice.value || wantPrice.value <= 0) return '請填願付金額';
  if (wantPrice.value > MAX_PRICE) return `願付金額不可超過 $${MAX_PRICE}`;
  if (!photoFile.value) return '請上傳書本照片';
  return null;
});

const resetForm = () => {
  bookName.value = '';
  wantPrice.value = null;
  photoFile.value = null;
  previewUrl.value = '';
  composing.value = false;
};

const submitRequest = async () => {
  const user = auth.currentUser;
  if (!user || formError.value || submitting.value) return;
  submitting.value = true;
  try {
    // 沿用商品上架的 Storage 路徑慣例：products/{timestamp}-{uid}.jpg
    const path = `products/${Date.now()}-${user.uid}.jpg`;
    // 明確帶上 contentType：storage.rules 要求 image/*，而少數瀏覽器給出的
    // File.type 是空字串，那會變成 application/octet-stream 而被規則擋下。
    // 其他三處上傳都經過 canvas.toBlob(…, 'image/jpeg') 所以沒有這個問題。
    const snap = await uploadBytes(sRef(storage, path), photoFile.value, {
      contentType: photoFile.value.type || 'image/jpeg'
    });
    const url = await getDownloadURL(snap.ref);

    // 刻意不存 requesterName。book_requests 任何登入者都讀得到，只把姓名從
    // 畫面上拿掉、資料卻還留著的話，用 devtools 一樣撈得出全校誰在徵求什麼書。
    // 需要查身分時管理員可以用 requesterId 反查 users，這條路不受影響。
    // 與 CannedChat.vue 同一個原則：面交前不把姓名攤在陌生人面前。
    await addDoc(collection(db, 'book_requests'), {
      requesterId: user.uid,
      bookName: bookName.value.trim(),
      college: college.value,
      dept: dept.value,
      wantPrice: wantPrice.value,
      url,
      status: 'open',
      createdAt: serverTimestamp()
    });
    toast('✅ 徵求已發布，有書的同學就能看到了。');
    resetForm();
  } catch (e) {
    console.error('[BookRequests] 發布失敗：', e.code, e.message);
    // permission-denied 的可能原因就那幾種，直接列出來比「請稍後再試」有用：
    // 再試一百次也不會補上少填的欄位。
    if (e.code === 'permission-denied') {
      toast('❌ 發布被拒絕：請確認願付金額是數字、學院與系所都已選擇。');
    } else {
      toast('❌ 發布失敗，請稍後再試。');
    }
  } finally {
    submitting.value = false;
  }
};

const closing = ref(null);
const closeRequest = async (r) => {
  if (!confirm(`確定結束「${r.bookName}」的徵求嗎？結束後其他人就看不到了。`)) return;
  closing.value = r.id;
  try {
    await updateDoc(doc(db, 'book_requests', r.id), {
      status: 'closed',
      closedAt: serverTimestamp()
    });
  } catch (e) {
    console.error('[BookRequests] 關閉失敗：', e.code, e.message);
    toast('❌ 關閉失敗，請重試。');
  } finally {
    closing.value = null;
  }
};

/* ── 應徵：我有這本書 ───────────────────────────────────── */
// TradeModal 吃的是 product 的形狀，所以把徵求貼文包成那個形狀再交給它。
// sellerId 放徵求方——他是付錢的一方，firestore.rules 的 payerUid() 會依
// mode==='wanted' 認出這件事（見 src/components/tradeRoles.js）。
const offering = ref(null);

const offerBook = async (r) => {
  const user = auth.currentUser;
  if (!user) {
    alert('🔒 請先前往右下角「會員」頁面登入，才能應徵。');
    return;
  }
  if (!(await blockUnverifiedForTrade(user, (msg) => alert(msg)))) return;
  offering.value = {
    id: '',
    name: r.bookName,
    price: r.wantPrice,
    url: r.url,
    sellerId: r.requesterId,
    sellerName: '徵求方',
    __requestId: r.id
  };
};

const submitOrder = async (tradeInfo) => {
  const user = auth.currentUser;
  if (!user) return;
  try {
    await addDoc(collection(db, 'orders'), {
      ...tradeInfo,
      mode: 'wanted',
      requestId: offering.value?.__requestId || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    toast('✅ 已送出應徵，等徵求方回覆。');
  } catch (e) {
    console.error('[BookRequests] 應徵訂單寫入失敗：', e.code, e.message);
    toast('❌ 送出失敗，請稍後再試。');
  }
};

onMounted(() => {
  subscribeTradeSettings();
  subscribe();
});
onUnmounted(() => unsub?.());
</script>

<style scoped>
.req-wrap { display: flex; flex-direction: column; gap: 14px; padding: 4px 2px; }

.req-new-btn {
  flex-shrink: 0; height: 46px; border-radius: 14px;
  border: 1.5px dashed #b9d4bf; background: #f4faf5;
  color: #2f4a3a; font-size: 14px; font-weight: 850; cursor: pointer;
}
.req-new-btn:active { background: #e8f2e9; }
.req-maint-note {
  margin: -6px 0 0; padding: 8px 12px; border-radius: 10px;
  background: #fffaf3; border: 1px solid #ffd8b0;
  font-size: 11.5px; font-weight: 700; color: #b26a00; line-height: 1.6;
}

/* ── 表單 ── */
.req-form {
  display: flex; flex-direction: column; gap: 10px;
  background: #fff; border: 1.5px solid #dde7de; border-radius: 18px; padding: 16px;
}
.req-form-head { display: flex; justify-content: space-between; align-items: center; font-size: 14px; font-weight: 850; color: #2f4a3a; }
.req-x { border: none; background: transparent; font-size: 14px; color: #8a958d; cursor: pointer; }

.req-photo {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
  height: 130px; border-radius: 14px; border: 1.5px dashed #cfdccf;
  background: #fafcfa; cursor: pointer; overflow: hidden;
}
.req-photo.filled { border-style: solid; padding: 0; }
.req-photo-img { width: 100%; height: 100%; object-fit: cover; }
.req-photo-icon { font-size: 24px; }
.req-photo-text { font-size: 13px; font-weight: 800; color: #3d5f4a; }
.req-photo-hint { font-size: 11px; color: #9aa79c; }

.req-input {
  height: 42px; box-sizing: border-box; padding: 0 12px;
  border: 1.5px solid #dde7de; border-radius: 12px;
  font-size: 14px; font-weight: 600; color: #2f4a3a; background: #fff;
}
.req-select { appearance: none; background-image: none; }
.req-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

.req-price-row {
  display: flex; align-items: center; gap: 6px;
  border: 1.5px solid #dde7de; border-radius: 12px; padding: 0 12px; height: 42px;
}
.req-price-label { font-size: 12.5px; font-weight: 800; color: #8a958d; }
.req-price-sign { font-size: 15px; font-weight: 850; color: #2f4a3a; }
.req-price-input {
  flex: 1; min-width: 0; border: none; outline: none; background: transparent;
  font-size: 15px; font-weight: 850; color: #2f4a3a;
}
.req-price-hint { margin: 0; font-size: 11px; color: #9aa79c; line-height: 1.5; }
.req-err { margin: 0; font-size: 12px; font-weight: 700; color: #c1440e; }

.req-submit {
  height: 44px; border: none; border-radius: 12px;
  background: #2f4a3a; color: #fff; font-size: 14px; font-weight: 850; cursor: pointer;
}
.req-submit:disabled { background: #cdd6cf; cursor: not-allowed; }

.req-slide-enter-active, .req-slide-leave-active { transition: opacity .18s ease, transform .18s ease; }
.req-slide-enter-from, .req-slide-leave-to { opacity: 0; transform: translateY(-6px); }

/* ── 列表 ── */
.req-list { display: flex; flex-direction: column; gap: 10px; }
.req-card {
  display: grid; grid-template-columns: 92px 1fr; gap: 12px;
  background: #fff; border: 1px solid #e4ebe4; border-radius: 16px;
  padding: 12px; box-shadow: 0 1px 4px rgba(47,74,58,.05);
}
.req-card-photo {
  width: 92px; height: 112px; border-radius: 11px; overflow: hidden;
  background: #f1f5f1; display: flex; align-items: center; justify-content: center; font-size: 30px;
}
.req-card-photo img { width: 100%; height: 100%; object-fit: cover; }

.req-card-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.req-card-top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.req-card-name {
  margin: 0; font-size: 14.5px; font-weight: 850; color: #2f4a3a;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.req-card-price { font-size: 15px; font-weight: 850; color: #b26a00; flex-shrink: 0; }
.req-card-meta { margin: 0; font-size: 11.5px; color: #8a958d; }

.req-card-btn {
  margin-top: auto; height: 36px; border: none; border-radius: 10px;
  background: #2f4a3a; color: #fff; font-size: 13px; font-weight: 850; cursor: pointer;
}
.req-card-btn.mine { background: #fff; color: #8a7a66; border: 1.5px solid #e4d9c9; }
.req-card-btn:disabled { background: #cdd6cf; color: #fff; cursor: not-allowed; }

/* ── 狀態 ── */
.req-loading, .req-empty {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  padding: 48px 20px; text-align: center; color: #8a958d; font-size: 13px;
}
.req-empty-icon { font-size: 34px; }
.req-empty span { font-size: 12px; color: #a8b2a9; }
.mini-radar {
  width: 26px; height: 26px; border-radius: 50%;
  border: 2.5px solid #e0e8e0; border-top-color: #2f4a3a;
  animation: req-spin .8s linear infinite;
}
@keyframes req-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .mini-radar { animation: none; } }

.req-spacer { height: 90px; flex-shrink: 0; }
</style>
