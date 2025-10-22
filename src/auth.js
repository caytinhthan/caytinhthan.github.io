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
      
      window._firebase.onAuthStateChanged((user) => {
        this.currentUser = user;
        this.updateAuthUI(user);
        
        if (user) {
          this.createUserProfile(user);
          // Set user online status
          this.setUserOnlineStatus(user.uid, true);
          
          // Handle page visibility for online status
          this.setupOnlineStatusHandler(user.uid);
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
    
    // Create or update user profile
    createUserProfile: async function(user) {
      try {
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
        
        // Check if user exists first
        userRef.once('value', (snapshot) => {
          const existingUser = snapshot.val();
          if (existingUser) {
            // Update existing user
            userRef.update({
              lastActive: Date.now(),
              isOnline: true,
              displayName: userData.displayName,
              photoURL: userData.photoURL
            });
          } else {
            // Create new user
            userRef.set(userData);
          }
        });
        
      } catch (error) {
        console.error('Error creating user profile:', error);
      }
    },
    
    // Google sign in
    signInWithGoogle: async function() {
      try {
        const provider = new window._firebase.GoogleAuthProvider();
        provider.addScope('profile');
        provider.addScope('email');
        
        // Configure for better UX
        provider.setCustomParameters({
          prompt: 'select_account'
        });
        
        // Always use redirect for GitHub Pages - more reliable
        await window._firebase.signInWithRedirect(provider);
        // Will handle result in redirect result check
        return null;
      } catch (error) {
        throw new Error('Lỗi đăng nhập Google: ' + (error.message || 'Không xác định'));
      }
    },

    // Check for redirect result
    checkRedirectResult: async function() {
      try {
        const result = await window._firebase.getRedirectResult();
        return result.user;
      } catch (error) {
        return null;
      }
    },
    
    // Email/password sign in
    signInWithEmail: async function(email, password) {
      try {
        const result = await window._firebase.signInWithEmailAndPassword(email, password);
        return result.user;
      } catch (error) {
        throw error;
      }
    },
    
    // Email/password sign up
    signUpWithEmail: async function(email, password, displayName) {
      try {
        const result = await window._firebase.createUserWithEmailAndPassword(email, password);
        
        // Update display name
        if (displayName && result.user) {
          await result.user.updateProfile({ displayName: displayName });
        }
        
        return result.user;
      } catch (error) {
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