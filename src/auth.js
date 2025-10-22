// auth.js - Vanilla JS authentication helpers
(function() {
  // Helper để log persistently - SMART LIMIT để tránh lag
  function persistLog(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${type.toUpperCase()}: ${message}`;
    console.log(logEntry);
    
    try {
      const MAX_LOGS = 500; // Giữ 500 logs gần nhất (đủ để debug, không quá nhiều)
      
      // Save to localStorage với auto-cleanup
      const logs = JSON.parse(localStorage.getItem('auth_debug_logs') || '[]');
      logs.push(logEntry);
      
      // Nếu vượt quá giới hạn, chỉ giữ logs mới nhất
      if (logs.length > MAX_LOGS) {
        const keepLogs = logs.slice(-MAX_LOGS); // Giữ 500 logs cuối
        localStorage.setItem('auth_debug_logs', JSON.stringify(keepLogs));
        console.warn(`🧹 Auto-cleanup: Removed ${logs.length - MAX_LOGS} old logs`);
      } else {
        localStorage.setItem('auth_debug_logs', JSON.stringify(logs));
      }
    } catch (error) {
      // Nếu localStorage đầy (QuotaExceededError), xóa hết và bắt đầu lại
      if (error.name === 'QuotaExceededError') {
        console.warn('⚠️ localStorage full! Clearing all logs...');
        localStorage.removeItem('auth_debug_logs');
        // Thử lưu lại log hiện tại
        try {
          localStorage.setItem('auth_debug_logs', JSON.stringify([logEntry]));
        } catch (e) {
          console.error('❌ Cannot save log even after cleanup:', e);
        }
      } else {
        console.error('❌ Failed to persist log:', error);
      }
    }
  }
  
  window.AuthHelpers = {
    currentUser: null,
    lastProcessedUid: null, // Track last processed UID to prevent duplicates
    isProcessingAuth: false, // Prevent concurrent auth processing
    
    // EARLY AUTH CHECK - Gọi NGAY khi page load để giảm FOUC
    earlyAuthCheck: function() {
      // Đọc cached user từ Firebase persistence
      // Firebase lưu auth state vào IndexedDB/localStorage
      const cachedAuthKey = Object.keys(localStorage).find(key => 
        key.startsWith('firebase:authUser:')
      );
      
      if (cachedAuthKey) {
        try {
          const cachedUser = JSON.parse(localStorage.getItem(cachedAuthKey));
          if (cachedUser && cachedUser.email) {
            persistLog('✅ Found cached user, updating UI early', 'info');
            // Update UI ngay lập tức với cached data
            const authLoading = document.getElementById('authLoading');
            const userSection = document.getElementById('userSection');
            const userDisplayName = document.getElementById('userDisplayName');
            
            if (authLoading) authLoading.style.display = 'none';
            if (userSection) userSection.style.display = 'block';
            if (userDisplayName) {
              userDisplayName.textContent = cachedUser.displayName || cachedUser.email.split('@')[0];
            }
            return true;
          }
        } catch (e) {
          persistLog(`⚠️ Failed to parse cached user: ${e.message}`, 'info');
        }
      }
      return false;
    },
    
    // Initialize auth state listener - THÊM DEBOUNCE
    initAuthListener: function() {
      if (!window._firebase) {
        persistLog('Firebase not initialized', 'error');
        return;
      }
      
      // Handle redirect result first (for mobile OAuth)
      window._firebase.getRedirectResult()
        .then(async (result) => {
          if (result && result.user) {
            persistLog(`✅ Redirect result: ${result.user.email}`, 'success');
            
            // Check if this was a registration flow
            const authFlow = sessionStorage.getItem('auth_flow');
            sessionStorage.removeItem('auth_flow');
            
            if (authFlow === 'register') {
              persistLog('📝 Creating profile for new registration', 'info');
              await this.createUserProfile(result.user);
            }
          }
        })
        .catch((error) => {
          persistLog(`⚠️ Redirect result error: ${error.message}`, 'error');
        });
      
      window._firebase.onAuthStateChanged(async (user) => {
        // PREVENT DUPLICATE PROCESSING
        if (this.isProcessingAuth) {
          persistLog('⏳ Already processing auth, skipping...', 'info');
          return;
        }
        
        // SKIP if same user already processed
        if (user && this.lastProcessedUid === user.uid) {
          persistLog(`✅ User ${user.email} already processed, skipping`, 'info');
          this.currentUser = user;
          this.updateAuthUI(user);
          return;
        }
        
        this.isProcessingAuth = true;
        this.currentUser = user;
        
        if (user) {
          persistLog(`✅ User authenticated: ${user.email}`, 'success');
          
          // Check và update user profile MỘT LẦN
          try {
            const userRef = window._firebase.ref(`users/${user.uid}`);
            
            // DÙNG .once() THAY VÌ .on() để tránh loop vô tận!
            const snapshot = await userRef.once('value');
            
            if (!snapshot.exists()) {
              persistLog('Creating new user profile in DB', 'info');
              await this.createUserProfile(user);
            } else {
              persistLog('Updating existing user profile', 'info');
              await this.updateUserProfile(user);
            }
            
            this.lastProcessedUid = user.uid; // Mark as processed
            this.updateAuthUI(user);
            this.setUserOnlineStatus(user.uid, true);
            this.setupOnlineStatusHandler(user.uid);
            
            // Redirect về trang chủ nếu đang ở trang login/register
            const currentPage = window.location.pathname;
            if (currentPage.includes('login.html') || currentPage.includes('register.html')) {
              persistLog('🔄 Redirecting to index.html', 'info');
              setTimeout(() => {
                window.location.href = 'index.html';
              }, 500); // Delay nhỏ để đảm bảo DB write hoàn tất
            }
          } catch (error) {
            persistLog(`Error in auth flow: ${error.message}`, 'error');
          }
        } else {
          persistLog('❌ User not authenticated', 'info');
          this.lastProcessedUid = null;
          this.updateAuthUI(null);
        }
        
        this.isProcessingAuth = false;
      });
    },
    
    // Update UI based on auth state - TỐI ƯU HÓA
    updateAuthUI: function(user) {
      const authSection = document.getElementById('authSection');
      const authLoading = document.getElementById('authLoading');
      const userSection = document.getElementById('userSection');
      const userDisplayName = document.getElementById('userDisplayName');
      
      // Ẩn loading state
      if (authLoading) authLoading.style.display = 'none';
      
      if (user) {
        // User logged in
        if (authSection) authSection.style.display = 'none';
        if (userSection) userSection.style.display = 'block';
        if (userDisplayName) {
          userDisplayName.textContent = user.displayName || user.email.split('@')[0];
        }
      } else {
        // User logged out
        if (authSection) authSection.style.display = 'flex';
        if (userSection) userSection.style.display = 'none';
      }
    },
    
    // Check if user exists in database - DÙNG .once() thay vì .on()
    checkUserExistsInDB: async function(uid) {
      try {
        console.log('🔍 Checking if user exists in DB:', uid);
        const userRef = window._firebase.ref(`users/${uid}`);
        const snapshot = await userRef.once('value');
        const exists = snapshot.exists();
        console.log('📊 User exists in DB:', exists);
        return exists;
      } catch (error) {
        console.error('💥 Error checking user in DB:', error);
        return false; // Default to false on error
      }
    },

    // Create or update user profile (CHỈ cho ĐĂNG KÝ) - THÊM LOGS
    createUserProfile: async function(user) {
      try {
        persistLog(`➕ Creating NEW user profile for: ${user.email}`, 'info');
        const userRef = window._firebase.ref(`users/${user.uid}`);
        const userData = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || user.email.split('@')[0],
          photoURL: user.photoURL || null,
          role: 'user',
          createdAt: Date.now(),
          lastActive: Date.now(),
          isOnline: true
        };
        
        await userRef.set(userData);
        persistLog('✅ User profile created successfully', 'success');
        return userData;
      } catch (error) {
        persistLog(`💥 Error creating user profile: ${error.message}`, 'error');
        throw error;
      }
    },

    // Update user profile (CHỈ cho ĐĂNG NHẬP) - THÊM LOGS
    updateUserProfile: async function(user) {
      try {
        persistLog(`🔄 Updating existing user profile for: ${user.email}`, 'info');
        const userRef = window._firebase.ref(`users/${user.uid}`);
        const updates = {
          lastActive: Date.now(),
          isOnline: true,
          displayName: user.displayName || user.email.split('@')[0],
          photoURL: user.photoURL || null
        };
        
        await userRef.update(updates);
        
        // Track visit for analytics
        await this.trackUserVisit(user.uid);
        
        persistLog('✅ User profile updated successfully', 'success');
        return updates;
      } catch (error) {
        persistLog(`💥 Error updating user profile: ${error.message}`, 'error');
        throw error;
      }
    },
    
    // Track user visit for analytics (prevent duplicates)
    trackUserVisit: async function(uid) {
      try {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const visitKey = `${uid}_${today}`;
        
        // Check if already tracked today
        const existingVisit = await window._firebase.ref(`analytics/visits/${visitKey}`).once('value');
        
        if (!existingVisit.exists()) {
          await window._firebase.ref(`analytics/visits/${visitKey}`).set({
            uid: uid,
            timestamp: Date.now(),
            date: today
          });
          persistLog(`📊 User visit tracked: ${visitKey}`, 'info');
        } else {
          persistLog(`📊 Visit already tracked today for: ${uid}`, 'info');
        }
      } catch (error) {
        persistLog(`⚠️ Error tracking visit: ${error.message}`, 'error');
      }
    },
    
    // Detect if mobile device
    isMobileDevice: function() {
      return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
             window.innerWidth <= 768;
    },

    // Google sign in (CHỈ cho ĐĂNG NHẬP) - THÊM ERROR HANDLING
    signInWithGoogle: async function() {
      try {
        persistLog('🚀 Starting Google LOGIN...', 'info');
        const provider = new window._firebase.GoogleAuthProvider();
        provider.addScope('profile');
        provider.addScope('email');
        
        // Configure for better UX
        provider.setCustomParameters({
          prompt: 'select_account'
        });
        
        // Mobile devices: use redirect immediately
        if (this.isMobileDevice()) {
          persistLog('� Mobile detected, using redirect...', 'info');
          await window._firebase.signInWithRedirect(provider);
          return null; // Will complete after redirect
        }
        
        // Desktop: try popup first
        persistLog('🖥️ Desktop detected, trying popup first...', 'info');
        try {
          const result = await window._firebase.signInWithPopup(provider);
          persistLog(`✅ Popup login successful: ${result.user.email}`, 'success');
          return result.user;
        } catch (popupError) {
          persistLog(`⚠️ Popup failed: ${popupError.code}, trying redirect...`, 'info');
          
          // Fallback to redirect if popup blocked
          if (popupError.code === 'auth/popup-blocked' || 
              popupError.code === 'auth/popup-closed-by-user' ||
              popupError.code === 'auth/cancelled-popup-request') {
            persistLog('🔄 Initiating redirect for LOGIN...', 'info');
            await window._firebase.signInWithRedirect(provider);
            return null;
          } else {
            throw popupError;
          }
        }
      } catch (error) {
        persistLog(`💥 Google sign in error: ${error.code} - ${error.message}`, 'error');
        throw new Error('Lỗi đăng nhập Google: ' + (error.message || 'Không xác định'));
      }
    },

    // Google sign up (CHỈ cho ĐĂNG KÝ) - THÊM ERROR HANDLING
    signUpWithGoogle: async function() {
      try {
        persistLog('🚀 Starting Google REGISTRATION...', 'info');
        
        const provider = new window._firebase.GoogleAuthProvider();
        provider.addScope('profile');
        provider.addScope('email');
        
        // Configure for better UX
        provider.setCustomParameters({
          prompt: 'select_account'
        });
        
        // Mobile devices: use redirect immediately
        if (this.isMobileDevice()) {
          persistLog('� Mobile detected, using redirect for registration...', 'info');
          // Mark this as registration flow
          sessionStorage.setItem('auth_flow', 'register');
          await window._firebase.signInWithRedirect(provider);
          return null; // Will complete after redirect
        }
        
        // Desktop: try popup first
        persistLog('🖥️ Desktop detected, trying popup first...', 'info');
        try {
          const result = await window._firebase.signInWithPopup(provider);
          persistLog(`✅ Popup registration successful: ${result.user.email}`, 'success');
          
          // Create user profile in DB
          await this.createUserProfile(result.user);
          
          return result.user;
        } catch (popupError) {
          persistLog(`⚠️ Popup failed: ${popupError.code}, trying redirect...`, 'info');
          
          // Fallback to redirect if popup blocked
          if (popupError.code === 'auth/popup-blocked' || 
              popupError.code === 'auth/popup-closed-by-user' ||
              popupError.code === 'auth/cancelled-popup-request') {
            persistLog('🔄 Initiating redirect for REGISTRATION...', 'info');
            sessionStorage.setItem('auth_flow', 'register');
            await window._firebase.signInWithRedirect(provider);
            return null;
          } else {
            throw popupError;
          }
        }
      } catch (error) {
        persistLog(`💥 Google sign up error: ${error.code} - ${error.message}`, 'error');
        throw new Error('Lỗi đăng ký Google: ' + (error.message || 'Không xác định'));
      }
    },

    // Check for redirect result (ĐĂNG NHẬP HOẶC ĐĂNG KÝ) - SỬA LẠI VỚI ERROR HANDLING
    checkRedirectResult: async function(isRegistration = false) {
      try {
        persistLog(`🔍 Checking redirect result... ${isRegistration ? '(REGISTRATION)' : '(LOGIN)'}`, 'info');
        const result = await window._firebase.getRedirectResult();
        
        if (result && result.user) {
          persistLog(`✅ Redirect result found: ${result.user.email}`, 'success');
          persistLog(`📝 User info: uid=${result.user.uid}, email=${result.user.email}`, 'info');
          
          // Nếu là registration, tạo user profile
          if (isRegistration) {
            persistLog('➕ Creating user profile for new registration...', 'info');
            await this.createUserProfile(result.user);
          }
          
          return result.user;
        } else {
          persistLog('❌ No redirect result', 'info');
          return null;
        }
      } catch (error) {
        persistLog(`💥 Redirect result error: ${error.code} - ${error.message}`, 'error');
        
        // Show error to user
        if (error.code === 'auth/unauthorized-domain') {
          alert('Lỗi: Domain chưa được ủy quyền. Vui lòng thêm domain vào Firebase Console.');
        } else if (error.code === 'auth/operation-not-allowed') {
          alert('Lỗi: Google sign-in chưa được bật trong Firebase Console.');
        } else {
          alert('Lỗi đăng nhập: ' + error.message);
        }
        
        return null;
      }
    },
    
    // Email/password sign in (CHỈ cho ĐĂNG NHẬP)
    signInWithEmail: async function(email, password) {
      try {
        console.log('🔐 Email login for:', email);
        const result = await window._firebase.signInWithEmailAndPassword(email, password);
        // onAuthStateChanged sẽ kiểm tra user có tồn tại trong DB không
        return result.user;
      } catch (error) {
        console.error('💥 Email login error:', error);
        throw error;
      }
    },
    
    // Email/password sign up (CHỈ cho ĐĂNG KÝ) - SỬA LẠI
    signUpWithEmail: async function(email, password, displayName) {
      try {
        persistLog(`📝 Email registration for: ${email}`, 'info');
        
        const result = await window._firebase.createUserWithEmailAndPassword(email, password);
        
        // Update display name
        if (displayName && result.user) {
          await result.user.updateProfile({ displayName: displayName });
        }
        
        // Tạo user profile trong DB
        persistLog('➕ Creating user profile in database...', 'info');
        await this.createUserProfile(result.user);
        persistLog('✅ User registered successfully', 'success');
        
        return result.user;
      } catch (error) {
        persistLog(`💥 Email registration error: ${error.message}`, 'error');
        throw error;
      }
    },
    
    // Sign out
    signOut: async function() {
      try {
        // Set user offline before signing out
        if (this.currentUser) {
          await this.setUserOnlineStatus(this.currentUser.uid, false);
        }
        await window._firebase.signOut();
      } catch (error) {
        throw error;
      }
    },
    
    // Set user online status
    setUserOnlineStatus: function(uid, isOnline) {
      try {
        const userRef = window._firebase.ref(`users/${uid}`);
        return userRef.update({
          isOnline: isOnline,
          lastActive: Date.now()
        });
      } catch (error) {
        // Silent fail
      }
    },
    
    // Setup online status handler
    setupOnlineStatusHandler: function(uid) {
      // Set offline when page unloads
      window.addEventListener('beforeunload', () => {
        this.setUserOnlineStatus(uid, false);
      });
      
      // Handle visibility change
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.setUserOnlineStatus(uid, false);
        } else {
          this.setUserOnlineStatus(uid, true);
        }
      });
      
      // Heartbeat to keep online status
      setInterval(() => {
        if (this.currentUser && this.currentUser.uid === uid) {
          this.setUserOnlineStatus(uid, true);
        }
      }, 30000); // Every 30 seconds
    },
    
    // Show loading state on button
    showLoading: function(button, isLoading) {
      if (!button) return;
      
      if (isLoading) {
        if (!button.dataset.originalText) {
          button.dataset.originalText = button.textContent;
        }
        button.textContent = 'Đang xử lý...';
        button.disabled = true;
      } else {
        if (button.dataset.originalText) {
          button.textContent = button.dataset.originalText;
        }
        button.disabled = false;
      }
    }
  };
  
  // Initialize when Firebase is ready
  window.addEventListener('firebase-ready', () => {
    window.AuthHelpers.initAuthListener();
  });
})();