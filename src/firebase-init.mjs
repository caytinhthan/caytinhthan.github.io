// firebase-init.mjs
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getDatabase, ref, set, remove, onValue, push, update } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app-check.js";

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

// Initialize App Check (optional - for production security)
if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider('6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI'), // Test key
      isTokenAutoRefreshEnabled: true
    });
  } catch (error) {
    console.warn('App Check initialization failed:', error);
  }
}

export const db = getDatabase(app);
export const auth = getAuth(app);

// Development emulator setup (optional)
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  // Uncomment these lines if you want to use Firebase emulators
  // connectAuthEmulator(auth, 'http://localhost:9099');
  // connectDatabaseEmulator(db, 'localhost', 9000);
}

// Export Firebase functions
export { 
  ref, set, remove, onValue, push, update,
  // Auth functions will be imported separately in auth.mjs
};

// Legacy compatibility for existing script.js
window._firebase = { 
  db, ref, set, remove, onValue, push, update,
  auth // Add auth for legacy compatibility
};

// Notify that Firebase is ready
window.dispatchEvent(new Event("firebase-ready"));

console.log('Firebase initialized');