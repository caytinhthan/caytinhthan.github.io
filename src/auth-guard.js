// auth-guard.js - Vanilla JS Authentication Guard
(function() {
  window.AuthGuard = {
    currentUser: null,
    userRole: 'user',
    
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
        console.error('Firebase not initialized for AuthGuard');
        return;
      }
      
      // Listen for auth state changes
      window._firebase.onAuthStateChanged((user) => {
        this.currentUser = user;
        
        if (user) {
          this.getUserRole(user.uid);
        } else {
          this.userRole = 'user';
        }
        
        this.checkPageAccess();
      });
    },
    
    // Get user role from database
    getUserRole: function(uid) {
      const userRef = window._firebase.ref(`users/${uid}`);
      userRef.once('value', (snapshot) => {
        const userData = snapshot.val();
        this.userRole = userData?.role || 'user';
        this.updateUIBasedOnRole();
      });
    },
    
    // Check if current page requires authentication
    checkPageAccess: function() {
      const currentPage = window.location.pathname.split('/').pop() || 'index.html';
      
      // Check if page requires login
      if (this.PROTECTED_PAGES.includes(currentPage)) {
        if (!this.currentUser) {
          this.redirectToLogin();
          return;
        }
      }
      
      // Check if page requires admin role
      if (this.ADMIN_PAGES.includes(currentPage)) {
        if (!this.currentUser) {
          this.redirectToLogin();
          return;
        }
        
        if (this.userRole !== 'admin') {
          this.redirectToHome();
          return;
        }
      }
    },
    
    // Update UI based on user role
    updateUIBasedOnRole: function() {
      // Hide/show admin elements
      const adminElements = document.querySelectorAll('.admin-only');
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
    },
    
    // Redirect to login page
    redirectToLogin: function() {
      const currentUrl = encodeURIComponent(window.location.href);
      const loginUrl = `login.html?redirect=${currentUrl}`;
      
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
      
      setTimeout(() => {
        window.location.href = loginUrl;
      }, 1800);
    },
    
    // Redirect to home page
    redirectToHome: function() {
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
      
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 2500);
    },
    
    // Check if user is logged in
    isLoggedIn: function() {
      return !!this.currentUser;
    },
    
    // Check if user is admin
    isAdmin: function() {
      return this.userRole === 'admin';
    },
    
    // Require login (can be called from other scripts)
    requireLogin: function() {
      if (!this.isLoggedIn()) {
        this.redirectToLogin();
        return false;
      }
      return true;
    },
    
    // Require admin (can be called from other scripts)
    requireAdmin: function() {
      if (!this.isLoggedIn()) {
        this.redirectToLogin();
        return false;
      }
      
      if (!this.isAdmin()) {
        this.redirectToHome();
        return false;
      }
      
      return true;
    }
  };
  
  // Auto-initialize when Firebase is ready
  window.addEventListener('firebase-ready', () => {
    window.AuthGuard.init();
  });
  
  // Also try immediate initialization if Firebase is already available
  if (window._firebase) {
    window.AuthGuard.init();
  }
})();