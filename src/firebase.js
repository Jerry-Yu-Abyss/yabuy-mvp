import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
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