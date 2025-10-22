// firebase-init.js - Vanilla JS version
(function() {
  // Import Firebase from CDN
  const firebaseConfig = {
    apiKey: "AIzaSyBfr8tUEMT0jZpBe6Pl5NIOZlni2MWrYsM",
    authDomain: "caytinhthan.github.io",
    databaseURL: "https://caytinhthan-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "caytinhthan",
    storageBucket: "caytinhthan.firebasestorage.app",
    messagingSenderId: "381361662805",
    appId: "1:381361662805:web:07d1fe119151cb95f75ddc",
    measurementId: "G-BHMHT2QGXN"
  };

  // Load Firebase scripts dynamically
  function loadFirebaseScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // Initialize Firebase
  async function initFirebase() {
    try {
      // Load Firebase scripts in order
      await loadFirebaseScript('https://www.gstatic.com/firebasejs/12.3.0/firebase-app-compat.js');
      await loadFirebaseScript('https://www.gstatic.com/firebasejs/12.3.0/firebase-database-compat.js');
      await loadFirebaseScript('https://www.gstatic.com/firebasejs/12.3.0/firebase-auth-compat.js');
      
      // Initialize Firebase app
      const app = firebase.initializeApp(firebaseConfig);
      const db = firebase.database();
      const auth = firebase.auth();
      
      // Set auth persistence to LOCAL để giữ phiên đăng nhập
      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      
      // Store in global scope for script.js
      window._firebase = {
        app: app,
        db: db,
        auth: auth,
        database: firebase.database,
        ref: firebase.database().ref.bind(firebase.database()),
        set: function(ref, value) { return ref.set(value); },
        push: function(ref, value) { return ref.push(value); },
        update: function(ref, updates) { return ref.update(updates); },
        remove: function(ref) { return ref.remove(); },
        onValue: function(ref, callback) { return ref.on('value', callback); },
        off: function(ref, callback) { return ref.off('value', callback); },
        signInWithEmailAndPassword: auth.signInWithEmailAndPassword.bind(auth),
        createUserWithEmailAndPassword: auth.createUserWithEmailAndPassword.bind(auth),
        signOut: auth.signOut.bind(auth),
        onAuthStateChanged: auth.onAuthStateChanged.bind(auth),
        GoogleAuthProvider: firebase.auth.GoogleAuthProvider,
        signInWithPopup: auth.signInWithPopup.bind(auth),
        signInWithRedirect: auth.signInWithRedirect.bind(auth),
        getRedirectResult: auth.getRedirectResult.bind(auth)
      };
      
      // Dispatch ready event
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('firebase-ready'));
      }, 100);
      
    } catch (error) {
      console.error('❌ Firebase initialization failed:', error);
    }
  }

  // Start initialization when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFirebase);
  } else {
    initFirebase();
  }
})();