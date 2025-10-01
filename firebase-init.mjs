// firebase-init.mjs
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getDatabase, ref, set, remove, onValue } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";

export const firebaseConfig = {
  apiKey: "AIzaSyBfr8tUEMT0jZpBe6Pl5NIOZlni2MWrYsM",
  authDomain: "caytinhthan.firebaseapp.com",
  databaseURL: "https://caytinhthan-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "caytinhthan",
  storageBucket: "caytinhthan.firebasestorage.app",
  messagingSenderId: "381361662805",
  appId: "1:381361662805:web:07d1fe119151cb95f75ddc",
  measurementId: "G-BHMHT2QGXN"
};

const app = initializeApp(firebaseConfig);

// Ép region
export const db = getDatabase(app, firebaseConfig.databaseURL);

// Export các functions cần thiết
export { ref, set, remove, onValue };

// Tương thích với script.js hiện tại (chưa chuyển module)
window._firebase = { db, ref, set, remove, onValue };
window.dispatchEvent(new Event("firebase-ready"));