// auth.mjs - Authentication helpers
import { auth, db, ref, set, onValue } from './firebase-init.mjs';
import { get } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";

// Google provider setup
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('profile');
googleProvider.addScope('email');

// Current user state
let currentUser = null;

// Auth state listener
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (user) {
    await createUserProfile(user);
  }
});

// Create or update user profile in database
async function createUserProfile(user) {
  try {
    const userRef = ref(db, `users/${user.uid}`);
    const userData = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || user.email.split('@')[0],
      photoURL: user.photoURL || null,
      role: 'user', // Default role
      createdAt: Date.now(),
      lastActive: Date.now(),
      isOnline: true
    };
    
    // Check if user already exists to preserve role using get() instead of onValue
    const snapshot = await get(userRef);
    const existingUser = snapshot.val();
    
    if (existingUser) {
      // Preserve existing role and creation date
      userData.role = existingUser.role || 'user';
      userData.createdAt = existingUser.createdAt || Date.now();
    }
    
    await set(userRef, userData);
    
  } catch (error) {
    // Silent error - no console.log for production
  }
}

// Sign in with email and password
export async function loginWithEmail(email, password) {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return result.user;
  } catch (error) {
    throw new Error(getErrorMessage(error.code));
  }
}

// Register with email and password
export async function registerWithEmail(email, password, displayName) {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    
    // Update profile with display name
    if (displayName) {
      await updateProfile(result.user, { displayName });
    }
    
    return result.user;
  } catch (error) {
    throw new Error(getErrorMessage(error.code));
  }
}

// Sign in with Google
export async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    if (error.code === 'auth/popup-closed-by-user') {
      throw new Error('Đăng nhập bị hủy');
    } else if (error.code === 'auth/popup-blocked') {
      throw new Error('Popup bị chặn. Vui lòng cho phép popup và thử lại');
    } else if (error.code === 'auth/unauthorized-domain') {
      throw new Error('Lỗi cấu hình domain. Vui lòng thêm localhost vào Firebase Console > Authentication > Settings > Authorized domains');
    } else if (error.code === 'auth/configuration-not-found') {
      throw new Error('Google OAuth chưa được cấu hình trong Firebase Console');
    }
    
    throw new Error(getErrorMessage(error.code));
  }
}

// Sign out
export async function logout() {
  try {
    // Update user offline status first (if possible)
    if (currentUser && db) {
      try {
        const userRef = ref(db, `users/${currentUser.uid}`);
        await set(userRef, {
          ...currentUser,
          isOnline: false,
          lastActive: Date.now()
        });
      } catch (dbError) {
        // Continue with logout even if database update fails
        console.warn('Could not update user offline status:', dbError.message);
      }
    }
    
    // Always attempt to sign out from Firebase Auth
    await signOut(auth);
    
    // Clear local session data after successful signOut
    currentUser = null;
    
    // Dispatch auth state change event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('auth-state-updated', {
        detail: { user: null }
      }));
    }
    
  } catch (error) {
    // Even if Firebase signOut fails, clear local session
    currentUser = null;
    
    // Dispatch auth state change event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('auth-state-updated', {
        detail: { user: null }
      }));
    }
    
    // Don't throw error, just log it and continue with logout
    console.warn('Firebase signOut failed, but local session cleared:', error.message);
  }
}

// Check current auth state
export function checkAuth() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

// Get current user
export function getCurrentUser() {
  return currentUser;
}

// Error message mapping
function getErrorMessage(errorCode) {
  const errorMessages = {
    'auth/user-not-found': 'Email không tồn tại',
    'auth/wrong-password': 'Mật khẩu không đúng',
    'auth/email-already-in-use': 'Email đã được sử dụng',
    'auth/weak-password': 'Mật khẩu quá yếu (tối thiểu 6 ký tự)',
    'auth/invalid-email': 'Email không hợp lệ',
    'auth/user-disabled': 'Tài khoản đã bị khóa',
    'auth/too-many-requests': 'Quá nhiều yêu cầu, thử lại sau',
    'auth/network-request-failed': 'Lỗi kết nối mạng',
    'auth/popup-blocked': 'Popup bị chặn, vui lòng cho phép popup',
    'auth/cancelled-popup-request': 'Đăng nhập bị hủy',
    'auth/popup-closed-by-user': 'Đăng nhập bị hủy',
    'auth/unauthorized-domain': 'Domain chưa được cấu hình cho Google login',
    'auth/invalid-api-key': 'API key không hợp lệ',
    'auth/app-not-authorized': 'App chưa được ủy quyền',
    'auth/internal-error': 'Lỗi hệ thống Firebase. Thử tải lại trang'
  };
  
  return errorMessages[errorCode] || `Lỗi: ${errorCode}. Vui lòng thử lại`;
}

// UI Helper functions
export function showError(message) {
  const errorElement = document.getElementById('errorMessage');
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    
    // Auto hide after 5 seconds
    setTimeout(() => {
      errorElement.style.display = 'none';
    }, 5000);
  }
}

export function showSuccess(message) {
  const successElement = document.getElementById('successMessage');
  if (successElement) {
    successElement.textContent = message;
    successElement.style.display = 'block';
    
    // Auto hide after 3 seconds
    setTimeout(() => {
      successElement.style.display = 'none';
    }, 3000);
  }
}

export function showLoading(isLoading) {
  const form = document.querySelector('form');
  const buttons = document.querySelectorAll('button');
  
  if (isLoading) {
    form?.classList.add('loading');
    buttons.forEach(btn => {
      btn.disabled = true;
      if (btn.textContent.includes('Đăng')) {
        btn.textContent = 'Đang xử lý...';
      }
    });
  } else {
    form?.classList.remove('loading');
    buttons.forEach(btn => {
      btn.disabled = false;
    });
    
    // Reset button text
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    
    if (loginBtn) loginBtn.textContent = 'Đăng nhập';
    if (registerBtn) registerBtn.textContent = 'Tạo tài khoản';
  }
}

