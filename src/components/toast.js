// toast.js — 全站共用的 Toast 提示與確認對話框（取代 window.alert / window.confirm）
import { reactive } from 'vue';

export const toastState = reactive({
  items: [],     // 浮動提示
  confirm: null  // 目前的確認對話框（null 表示無）
});

let _id = 0;

function dismiss(id) {
  const i = toastState.items.findIndex(t => t.id === id);
  if (i !== -1) toastState.items.splice(i, 1);
}

function push(type, message, duration) {
  const id = ++_id;
  toastState.items.push({ id, type, message: String(message) });
  const ms = duration ?? (type === 'error' || type === 'warning' ? 3400 : 2600);
  setTimeout(() => dismiss(id), ms);
  return id;
}

// 依訊息開頭的 emoji / 關鍵字自動判斷類型，讓舊的 alert("✅...") 直接換成 toast("✅...") 即可
function classify(m) {
  const s = String(m);
  if (s.startsWith('✅')) return 'success';
  if (s.startsWith('❌') || s.startsWith('🚨')) return 'error';
  if (/(失敗|錯誤|不符|無效|過大|不可逆|無法)/.test(s)) return 'error';
  if (s.startsWith('⚠️') || /(請先|請填|請選|請輸入)/.test(s)) return 'warning';
  return 'info';
}

// 主要用法：toast("✅ 上架成功")，型別自動判斷；也可指定 toast.success(...) 等
export function toast(message, duration) {
  return push(classify(message), message, duration);
}
toast.success = (m, d) => push('success', m, d);
toast.error   = (m, d) => push('error', m, d);
toast.warning = (m, d) => push('warning', m, d);
toast.info    = (m, d) => push('info', m, d);
toast.dismiss = dismiss;

// 確認對話框：回傳 Promise<boolean>。用法：if (!(await confirmDialog('確定嗎？'))) return;
export function confirmDialog(options) {
  const opts = typeof options === 'string' ? { message: options } : (options || {});
  return new Promise((resolve) => {
    toastState.confirm = {
      title: opts.title || '請確認',
      message: opts.message || '',
      confirmText: opts.confirmText || '確定',
      cancelText: opts.cancelText || '取消',
      danger: opts.danger ?? true,
      resolve
    };
  });
}

export function answerConfirm(value) {
  if (toastState.confirm) {
    const r = toastState.confirm.resolve;
    toastState.confirm = null;
    r(value);
  }
}