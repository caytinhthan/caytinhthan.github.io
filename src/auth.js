// auth.js - Vanilla JS authentication helpers
(function() {
  window.AuthHelpers = {
    currentUser: null,
    
    // Initialize auth state listener
    initAuthListener: function() {
      if (!window._firebase) {
        console.error('Firebase not initialized');
        return;
      }
      
      window._firebase.onAuthStateChanged(async (user) => {
        this.currentUser = user;
        
        if (user) {
          console.log('✅ User authenticated:', user.email);
          
          // QUAN TRỌNG: Kiểm tra user có tồn tại trong DB không
          const userExists = await this.checkUserExistsInDB(user.uid);
          
          if (!userExists) {
            console.log('❌ User not found in database, signing out...');
            // User không có trong DB -> Sign out và báo lỗi
            await this.signOut();
            alert('Tài khoản chưa được đăng ký trong hệ thống. Vui lòng đăng ký trước khi đăng nhập.');
            return;
          }
          
          console.log('✅ User verified in database');
          // Update user profile và online status
          await this.updateUserProfile(user);
          this.updateAuthUI(user);
          this.setUserOnlineStatus(user.uid, true);
          this.setupOnlineStatusHandler(user.uid);
          
          // QUAN TRỌNG: Redirect về trang chủ nếu đang ở trang login/register
          const currentPage = window.location.pathname;
          if (currentPage.includes('login.html') || currentPage.includes('register.html')) {
            console.log('🔄 Redirecting from auth page to index.html');
            window.location.href = 'index.html';
          }
        } else {
          console.log('❌ User not authenticated');
          this.updateAuthUI(null);
        }
      });
    },
    
    // Update UI based on auth state
    updateAuthUI: function(user) {
      const authSection = document.getElementById('authSection');
      const userSection = document.getElementById('userSection');
      const userDisplayName = document.getElementById('userDisplayName');
      
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
    
    // Check if user exists in database
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
        return false;
      }
    },

    // Create or update user profile (CHỈ cho ĐĂNG KÝ)
    createUserProfile: async function(user) {
      try {
        console.log('➕ Creating NEW user profile for:', user.email);
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
        console.log('✅ User profile created successfully');
        return userData;
      } catch (error) {
        console.error('💥 Error creating user profile:', error);
        throw error;
      }
    },

    // Update user profile (CHỈ cho ĐĂNG NHẬP)
    updateUserProfile: async function(user) {
      try {
        console.log('🔄 Updating existing user profile for:', user.email);
        const userRef = window._firebase.ref(`users/${user.uid}`);
        const updates = {
          lastActive: Date.now(),
          isOnline: true,
          displayName: user.displayName || user.email.split('@')[0],
          photoURL: user.photoURL || null
        };
        
        await userRef.update(updates);
        console.log('✅ User profile updated successfully');
        return updates;
      } catch (error) {
        console.error('💥 Error updating user profile:', error);
        throw error;
      }
    },
    
    // Google sign in (CHỈ cho ĐĂNG NHẬP)
    signInWithGoogle: async function() {
      try {
        console.log('🚀 Starting Google LOGIN...');
        const provider = new window._firebase.GoogleAuthProvider();
        provider.addScope('profile');
        provider.addScope('email');
        
        // Configure for better UX
        provider.setCustomParameters({
          prompt: 'select_account'
        });
        
        console.log('🔄 Initiating redirect for LOGIN...');
        // Always use redirect for GitHub Pages - more reliable
        await window._firebase.signInWithRedirect(provider);
        console.log('✅ Redirect initiated successfully');
        // Will handle result in redirect result check
        return null;
      } catch (error) {
        console.error('💥 Google sign in error:', error);
        throw new Error('Lỗi đăng nhập Google: ' + (error.message || 'Không xác định'));
      }
    },

    // Google sign up (CHỈ cho ĐĂNG KÝ)
    signUpWithGoogle: async function() {
      try {
        console.log('🚀 Starting Google REGISTRATION...');
        const provider = new window._firebase.GoogleAuthProvider();
        provider.addScope('profile');
        provider.addScope('email');
        
        // Configure for better UX
        provider.setCustomParameters({
          prompt: 'select_account'
        });
        
        console.log('🔄 Initiating redirect for REGISTRATION...');
        // Always use redirect for GitHub Pages - more reliable
        await window._firebase.signInWithRedirect(provider);
        console.log('✅ Redirect initiated successfully');
        // Will handle result in redirect result check
        return null;
      } catch (error) {
        console.error('💥 Google sign up error:', error);
        throw new Error('Lỗi đăng ký Google: ' + (error.message || 'Không xác định'));
      }
    },

    // Check for redirect result (PHÂN BIỆT ĐĂNG NHẬP VÀ ĐĂNG KÝ)
    checkRedirectResult: async function(isRegistration = false) {
      try {
        console.log('🔍 Checking redirect result...', isRegistration ? '(REGISTRATION)' : '(LOGIN)');
        const result = await window._firebase.getRedirectResult();
        if (result && result.user) {
          console.log('✅ Redirect result found:', result.user.email);
          console.log('📝 User info:', {
            uid: result.user.uid,
            email: result.user.email,
            displayName: result.user.displayName,
            photoURL: result.user.photoURL
          });
          
          if (isRegistration) {
            // ĐĂNG KÝ: Tạo user mới trong DB
            console.log('➕ Creating new user in database...');
            await this.createUserProfile(result.user);
            console.log('✅ User registered successfully');
          } else {
            // ĐĂNG NHẬP: Kiểm tra user có tồn tại không (sẽ được handle bởi onAuthStateChanged)
            console.log('🔍 Login detected, will check user existence in onAuthStateChanged');
          }
          
          return result.user;
        } else {
          console.log('❌ No redirect result');
          return null;
        }
      } catch (error) {
        console.error('💥 Redirect result error:', error);
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
    
    // Email/password sign up (CHỈ cho ĐĂNG KÝ)
    signUpWithEmail: async function(email, password, displayName) {
      try {
        console.log('📝 Email registration for:', email);
        const result = await window._firebase.createUserWithEmailAndPassword(email, password);
        
        // Update display name
        if (displayName && result.user) {
          await result.user.updateProfile({ displayName: displayName });
        }
        
        // Tạo user profile trong DB
        console.log('➕ Creating user profile in database...');
        await this.createUserProfile(result.user);
        console.log('✅ User registered successfully');
        
        return result.user;
      } catch (error) {
        console.error('💥 Email registration error:', error);
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