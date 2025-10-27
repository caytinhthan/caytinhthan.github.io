// auth-guard.js - Vanilla JS Authentication Guard
(function() {
  console.log('🔥🔥🔥 AUTH-GUARD.JS LOADED!');
  
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
        //console.warn(`🧹 Auto-cleanup: Removed ${logs.length - MAX_LOGS} old logs`);
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
  
  window.AuthGuard = {
    currentUser: null,
    userRole: 'user',
    roleLoaded: false, // Track if role has been loaded
    isCheckingAccess: false, // Prevent multiple simultaneous checks
    
    // Protected pages that require login
    PROTECTED_PAGES: [
      'profile.html',
      'admin.html'
    ],
    
    // Admin-only pages
    ADMIN_PAGES: [
      'admin.html'
    ],
    
    // Initialize auth guard
    init: function() {
      if (!window._firebase) {
        persistLog('Firebase not initialized for AuthGuard', 'error');
        return;
      }
      
      persistLog('🚀 AuthGuard initialized', 'info');
      
      // Listen for auth state changes
      window._firebase.onAuthStateChanged(async (user) => {
        persistLog(`🔔 Auth state changed: ${user ? user.email : 'logged out'}`, 'info');
        
        // Prevent multiple simultaneous checks
        if (this.isCheckingAccess) {
          persistLog('⏳ Already checking access, skipping...', 'info');
          return;
        }
        
        this.isCheckingAccess = true;
        this.currentUser = user;
        
        if (user) {
          persistLog(`👤 User logged in: ${user.email}`, 'success');
          
          // CHỈ LOAD ROLE NẾU CHƯA LOAD HOẶC USER KHÁC
          if (!this.roleLoaded || this.lastUid !== user.uid) {
            persistLog(`🔄 Loading role for new/changed user`, 'info');
            try {
              await this.getUserRole(user.uid);
              this.roleLoaded = true;
              this.lastUid = user.uid;
              persistLog(`✅ Role loaded successfully: ${this.userRole}`, 'success');
            } catch (error) {
              persistLog(`❌ Failed to load role: ${error.message}`, 'error');
              this.userRole = 'user';
              this.roleLoaded = true; // Mark as loaded even if failed
            }
          } else {
            persistLog(`✅ Role already loaded: ${this.userRole}`, 'success');
          }
        } else {
          persistLog('👤 No user logged in', 'info');
          this.userRole = 'user';
          this.roleLoaded = false;
          this.lastUid = null;
        }
        
        // CHỈ check access SAU KHI role đã load xong
        this.checkPageAccess();
        this.isCheckingAccess = false;
      });
    },
    
    // Get user role from database - DÙNG PERSIST LOG & PROMISE WRAPPER
    getUserRole: function(uid) {
      return new Promise((resolve, reject) => {
        persistLog(`🔍 Loading user role from DB for uid: ${uid}`, 'info');
        const userRef = window._firebase.ref(`users/${uid}`);
        
        // TĂNG TIMEOUT lên 10s và RETRY nếu fail
        const timeout = setTimeout(() => {
          persistLog('⚠️ Timeout loading user role (10s), RETRYING...', 'error');
          
          // RETRY 1 lần nữa
          userRef.once('value')
            .then((snapshot) => {
              const userData = snapshot.val();
              
              if (!userData) {
                persistLog('⚠️ No user data found in DB even after retry!', 'error');
                this.userRole = 'user';
                resolve('user');
                return;
              }
              
              this.userRole = userData.role || 'user';
              persistLog(`🔑 User role loaded (retry): ${this.userRole}`, 'success');
              this.updateUIBasedOnRole();
              resolve(this.userRole);
            })
            .catch((error) => {
              persistLog(`💥 Retry also failed: ${error.message}`, 'error');
              this.userRole = 'user';
              resolve('user');
            });
        }, 10000);
        
        // DÙNG .once() thay vì .on() để tránh multiple calls
        userRef.once('value')
          .then((snapshot) => {
            clearTimeout(timeout);
            const userData = snapshot.val();
            
            persistLog(`📦 User data from DB: ${JSON.stringify(userData)}`, 'info');
            
            if (!userData) {
              persistLog('⚠️ No user data found in DB!', 'error');
              this.userRole = 'user';
              resolve('user');
              return;
            }
            
            this.userRole = userData.role || 'user';
            persistLog(`🔑 User role loaded: ${this.userRole}`, 'success');
            
            this.updateUIBasedOnRole();
            resolve(this.userRole);
          })
          .catch((error) => {
            clearTimeout(timeout);
            persistLog(`💥 Error loading user role: ${error.message}`, 'error');
            this.userRole = 'user';
            reject(error);
          });
      });
    },
    
    // Check if current page requires authentication - DÙNG PERSIST LOG
    checkPageAccess: function() {
      const currentPage = window.location.pathname.split('/').pop() || 'index.html';
      
      persistLog(`🔐 Checking page access for: ${currentPage}`, 'info');
      persistLog(`👤 Current user: ${this.currentUser?.email || 'None'}`, 'info');
      persistLog(`🎭 Current role: ${this.userRole}`, 'info');
      
      // Check if page requires login
      if (this.PROTECTED_PAGES.includes(currentPage)) {
        persistLog('🔒 Page requires login', 'info');
        if (!this.currentUser) {
          persistLog('❌ Not logged in, redirecting to login', 'error');
          this.redirectToLogin();
          return;
        }
        persistLog('✅ User is logged in', 'success');
      }
      
      // Check if page requires admin role
      if (this.ADMIN_PAGES.includes(currentPage)) {
        persistLog('👑 Page requires admin role', 'info');
        if (!this.currentUser) {
          persistLog('❌ Not logged in, redirecting to login', 'error');
          this.redirectToLogin();
          return;
        }
        
        persistLog(`🎭 Checking admin access. User role: ${this.userRole}`, 'info');
        
        if (this.userRole !== 'admin') {
          persistLog(`❌ ACCESS DENIED! Role is: ${this.userRole} but need: admin`, 'error');
          persistLog(`📊 Full user info: ${JSON.stringify({
            email: this.currentUser.email,
            uid: this.currentUser.uid,
            role: this.userRole
          })}`, 'error');
          this.redirectToHome();
          return;
        } else {
          persistLog('✅ ACCESS GRANTED! User is admin', 'success');
        }
      }
      
      persistLog('✅ Page access check complete', 'success');
    },
    
    // Update UI based on user role - DÙNG PERSIST LOG
    updateUIBasedOnRole: function() {
      persistLog('🎨 Updating UI based on role...', 'info');
      
      // Hide/show admin elements
      const adminElements = document.querySelectorAll('.admin-only');
      persistLog(`📋 Found ${adminElements.length} admin-only elements`, 'info');
      
      adminElements.forEach(el => {
        if (this.userRole === 'admin') {
          // For setting-item elements, use flex display
          if (el.classList.contains('setting-item')) {
            el.style.display = 'flex';
          } else {
            el.style.display = '';
          }
        } else {
          el.style.display = 'none';
        }
      });
      
      if (this.userRole === 'admin') {
        persistLog('👑 Admin UI elements displayed', 'success');
      } else {
        persistLog(`🚫 Admin UI elements hidden (role: ${this.userRole})`, 'info');
      }
      
      // Update role badges
      const roleBadges = document.querySelectorAll('.role-badge');
      roleBadges.forEach(badge => {
        if (this.userRole === 'admin') {
          badge.textContent = 'Admin';
          badge.className = 'role-badge admin';
        } else {
          badge.textContent = 'User';
          badge.className = 'role-badge user';
        }
      });
      
      if (roleBadges.length > 0) {
        persistLog(`🏷️ Updated ${roleBadges.length} role badges`, 'success');
      }
    },
    
    // Redirect to login page - DÙNG PERSIST LOG
    redirectToLogin: function() {
      const currentUrl = encodeURIComponent(window.location.href);
      const loginUrl = `login.html?redirect=${currentUrl}`;
      
      persistLog(`🔄 Redirecting to login: ${loginUrl}`, 'info');
      
      // Show beautiful loading screen
      document.body.innerHTML = `
        <div class="auth-redirect-overlay">
          <div class="auth-redirect-content">
            <div class="auth-redirect-icon">
              <div class="lock-animation">
                <div class="lock-body">🔐</div>
                <div class="lock-glow"></div>
              </div>
            </div>
            <h2 class="auth-redirect-title">Chưa đăng nhập</h2>
            <p class="auth-redirect-message">Đang chuyển hướng tới trang đăng nhập...</p>
            <div class="auth-redirect-progress">
              <div class="progress-bar">
                <div class="progress-fill"></div>
              </div>
            </div>
          </div>
          
          <style>
            .auth-redirect-overlay {
              position: fixed;
              top: 0;
              left: 0;
              width: 100vw;
              height: 100vh;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              display: flex;
              align-items: center;
              justify-content: center;
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              z-index: 9999;
              animation: fadeIn 0.5s ease-out;
            }
            
            .auth-redirect-content {
              text-align: center;
              background: rgba(255, 255, 255, 0.95);
              backdrop-filter: blur(20px);
              border-radius: 24px;
              padding: 48px 40px;
              box-shadow: 0 32px 64px rgba(0, 0, 0, 0.3);
              border: 1px solid rgba(255, 255, 255, 0.2);
              max-width: 400px;
              width: 90%;
              animation: slideUp 0.6s ease-out;
            }
            
            .auth-redirect-icon {
              margin-bottom: 24px;
              position: relative;
            }
            
            .lock-animation {
              position: relative;
              display: inline-block;
            }
            
            .lock-body {
              font-size: 64px;
              animation: bounce 2s ease-in-out infinite;
              filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.2));
            }
            
            .lock-glow {
              position: absolute;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              width: 80px;
              height: 80px;
              background: radial-gradient(circle, rgba(102, 126, 234, 0.3), transparent);
              border-radius: 50%;
              animation: pulse 2s ease-in-out infinite;
            }
            
            .auth-redirect-title {
              font-size: 28px;
              font-weight: 700;
              color: #1e293b;
              margin: 0 0 12px 0;
              background: linear-gradient(135deg, #667eea, #764ba2);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              background-clip: text;
            }
            
            .auth-redirect-message {
              font-size: 16px;
              color: #64748b;
              margin: 0 0 32px 0;
              line-height: 1.5;
            }
            
            .auth-redirect-progress {
              margin-top: 24px;
            }
            
            .progress-bar {
              width: 100%;
              height: 4px;
              background: #e5e7eb;
              border-radius: 2px;
              overflow: hidden;
            }
            
            .progress-fill {
              height: 100%;
              background: linear-gradient(90deg, #667eea, #764ba2);
              border-radius: 2px;
              animation: progressFill 1.5s ease-out forwards;
            }
            
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            
            @keyframes slideUp {
              from {
                opacity: 0;
                transform: translateY(30px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
            
            @keyframes bounce {
              0%, 20%, 50%, 80%, 100% {
                transform: translateY(0);
              }
              40% {
                transform: translateY(-8px);
              }
              60% {
                transform: translateY(-4px);
              }
            }
            
            @keyframes pulse {
              0%, 100% {
                opacity: 0.5;
                transform: translate(-50%, -50%) scale(1);
              }
              50% {
                opacity: 0.8;
                transform: translate(-50%, -50%) scale(1.1);
              }
            }
            
            @keyframes progressFill {
              from {
                width: 0%;
              }
              to {
                width: 100%;
              }
            }
            
            @media (max-width: 768px) {
              .auth-redirect-content {
                padding: 32px 24px;
                margin: 20px;
              }
              
              .auth-redirect-title {
                font-size: 24px;
              }
              
              .lock-body {
                font-size: 48px;
              }
              
              .lock-glow {
                width: 60px;
                height: 60px;
              }
            }
          </style>
        </div>
      `;
      
      persistLog('⏱️ Setting timeout for redirect...', 'info');
      setTimeout(() => {
        persistLog('🚀 Executing redirect now', 'info');
        window.location.href = loginUrl;
      }, 1800);
    },
    
    // Redirect to home page - DÙNG PERSIST LOG
    redirectToHome: function() {
      persistLog('🔄 Redirecting to home: /index.html', 'error');
      
      // Show beautiful access denied screen
      document.body.innerHTML = `
        <div class="auth-redirect-overlay">
          <div class="auth-redirect-content">
            <div class="auth-redirect-icon">
              <div class="error-animation">
                <div class="error-body">🚫</div>
                <div class="error-glow"></div>
              </div>
            </div>
            <h2 class="auth-redirect-title error">Không có quyền truy cập</h2>
            <p class="auth-redirect-message">Bạn không có quyền truy cập trang này.<br>Đang chuyển hướng về trang chủ...</p>
            <div class="auth-redirect-progress">
              <div class="progress-bar">
                <div class="progress-fill error"></div>
              </div>
            </div>
          </div>
          
          <style>
            .auth-redirect-overlay {
              position: fixed;
              top: 0;
              left: 0;
              width: 100vw;
              height: 100vh;
              background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
              display: flex;
              align-items: center;
              justify-content: center;
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              z-index: 9999;
              animation: fadeIn 0.5s ease-out;
            }
            
            .auth-redirect-content {
              text-align: center;
              background: rgba(255, 255, 255, 0.95);
              backdrop-filter: blur(20px);
              border-radius: 24px;
              padding: 48px 40px;
              box-shadow: 0 32px 64px rgba(0, 0, 0, 0.3);
              border: 1px solid rgba(255, 255, 255, 0.2);
              max-width: 400px;
              width: 90%;
              animation: slideUp 0.6s ease-out;
            }
            
            .auth-redirect-icon {
              margin-bottom: 24px;
              position: relative;
            }
            
            .error-animation {
              position: relative;
              display: inline-block;
            }
            
            .error-body {
              font-size: 64px;
              animation: shake 1.5s ease-in-out infinite;
              filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.2));
            }
            
            .error-glow {
              position: absolute;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              width: 80px;
              height: 80px;
              background: radial-gradient(circle, rgba(239, 68, 68, 0.3), transparent);
              border-radius: 50%;
              animation: pulse 2s ease-in-out infinite;
            }
            
            .auth-redirect-title.error {
              background: linear-gradient(135deg, #ef4444, #dc2626);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              background-clip: text;
            }
            
            .progress-fill.error {
              background: linear-gradient(90deg, #ef4444, #dc2626);
            }
            
            .auth-redirect-title {
              font-size: 28px;
              font-weight: 700;
              color: #1e293b;
              margin: 0 0 12px 0;
            }
            
            .auth-redirect-message {
              font-size: 16px;
              color: #64748b;
              margin: 0 0 32px 0;
              line-height: 1.5;
            }
            
            .auth-redirect-progress {
              margin-top: 24px;
            }
            
            .progress-bar {
              width: 100%;
              height: 4px;
              background: #e5e7eb;
              border-radius: 2px;
              overflow: hidden;
            }
            
            .progress-fill {
              height: 100%;
              border-radius: 2px;
              animation: progressFill 2s ease-out forwards;
            }
            
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            
            @keyframes slideUp {
              from {
                opacity: 0;
                transform: translateY(30px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
            
            @keyframes shake {
              0%, 100% { transform: translateX(0); }
              25% { transform: translateX(-2px); }
              75% { transform: translateX(2px); }
            }
            
            @keyframes pulse {
              0%, 100% {
                opacity: 0.5;
                transform: translate(-50%, -50%) scale(1);
              }
              50% {
                opacity: 0.8;
                transform: translate(-50%, -50%) scale(1.1);
              }
            }
            
            @keyframes progressFill {
              from {
                width: 0%;
              }
              to {
                width: 100%;
              }
            }
            
            @media (max-width: 768px) {
              .auth-redirect-content {
                padding: 32px 24px;
                margin: 20px;
              }
              
              .auth-redirect-title {
                font-size: 24px;
              }
              
              .error-body {
                font-size: 48px;
              }
              
              .error-glow {
                width: 60px;
                height: 60px;
              }
            }
          </style>
        </div>
      `;
      
      persistLog('⏱️ Setting timeout for redirect to home...', 'info');
      setTimeout(() => {
        persistLog('🚀 Executing redirect to home now', 'error');
        window.location.href = 'index.html';
      }, 2500);
    },
    
    // Check if user is logged in - DÙNG PERSIST LOG
    isLoggedIn: function() {
      const loggedIn = !!this.currentUser;
      persistLog(`🔍 isLoggedIn check: ${loggedIn}`, 'info');
      return loggedIn;
    },
    
    // Check if user is admin - DÙNG PERSIST LOG
    isAdmin: function() {
      const isAdmin = this.userRole === 'admin';
      persistLog(`🔍 isAdmin check: ${isAdmin} (role: ${this.userRole})`, 'info');
      return isAdmin;
    },
    
    // Require login (can be called from other scripts) - DÙNG PERSIST LOG
    requireLogin: function() {
      persistLog('🔐 requireLogin called', 'info');
      if (!this.isLoggedIn()) {
        persistLog('❌ Not logged in, redirecting...', 'error');
        this.redirectToLogin();
        return false;
      }
      persistLog('✅ User logged in', 'success');
      return true;
    },
    
    // Require admin (can be called from other scripts) - DÙNG PERSIST LOG
    requireAdmin: function() {
      persistLog('👑 requireAdmin called', 'info');
      if (!this.isLoggedIn()) {
        persistLog('❌ Not logged in, redirecting...', 'error');
        this.redirectToLogin();
        return false;
      }
      
      if (!this.isAdmin()) {
        persistLog(`❌ Not admin (role: ${this.userRole}), redirecting...`, 'error');
        this.redirectToHome();
        return false;
      }
      
      persistLog('✅ User is admin', 'success');
      return true;
    }
  };
  
  console.log('✅ AuthGuard object created:', window.AuthGuard);
  
  // Auto-initialize when Firebase is ready - DÙNG PERSIST LOG
  window.addEventListener('firebase-ready', () => {
    console.log('🔥🔥🔥 FIREBASE-READY EVENT RECEIVED!');
    persistLog('Firebase ready event received, initializing AuthGuard...', 'info');
    window.AuthGuard.init();
  });
  
  // Also try immediate initialization if Firebase is already available - DÙNG PERSIST LOG
  if (window._firebase) {
    console.log('🔥🔥🔥 FIREBASE ALREADY AVAILABLE, INIT NOW! 🔥🔥🔥');
    persistLog('🔥 Firebase already available, initializing AuthGuard immediately...', 'info');
    window.AuthGuard.init();
  } else {
    console.log('⏳ Waiting for Firebase to be ready...');
  }
})();