import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";   // 🌟 新增

const firebaseConfig = {
  apiKey: "AIzaSyAZq0VCRpgSiIwJE0YF1iY00jVK3HU6MyY",
  authDomain: "yabuy-2026a.firebaseapp.com",
  projectId: "yabuy-2026a",
  storageBucket: "yabuy-2026a.firebasestorage.app",
  messagingSenderId: "863705872385",
  appId: "1:863705872385:web:2c0dd5c9eb07d6f5566800",
  measurementId: "G-2VZ6Q7WHK4"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);   // 🌟 新增（預設 us-central1）

// ── 本機 Firebase Emulator ───────────────────────────────────────────
// 只有在 dev 模式且明確設定 VITE_USE_EMULATOR=1 時才連本機 emulator。
//
// 用 import.meta.env.DEV 當外層守衛是刻意的：Vite 在正式建置時會把它靜態
// 替換成 false，整個區塊連同 connect*Emulator 都會被 tree-shake 掉，
// 所以「正式站誤連 emulator」在建置階段就不可能發生，不是靠執行期判斷。
//
// 用法：VITE_USE_EMULATOR=1 npm run dev（需先另開 npm run emu）
if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATOR === "1") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  console.info(
    "[YaBuy] 已連線本機 Emulator（Auth :9099 / Firestore :8080）—— 這裡的資料與正式站無關"
  );
}