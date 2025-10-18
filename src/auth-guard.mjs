// auth-guard.mjs - Authentication and authorization guard
import { auth, db, ref, onValue } from './firebase-init.mjs';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { isValidRedirectUrl } from './security.mjs';

let currentUser = null;
let userRole = 'user';

// Protected pages that require login
const PROTECTED_PAGES = [
  'profile.html',
  'admin.html'
];

// Admin-only pages
const ADMIN_PAGES = [
  'admin.html'
];

// Initialize auth guard
export function initAuthGuard() {
  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    
    if (user) {
      // Get user role from database
      const userRef = ref(db, `users/${user.uid}`);
      onValue(userRef, (snapshot) => {
        const userData = snapshot.val();
        userRole = userData?.role || 'user';
        updateUIBasedOnAuth();
        checkPageAccess();
      });
    } else {
      userRole = 'user';
      updateUIBasedOnAuth();
      checkPageAccess();
    }
  });
}

// Check if current page requires authentication
function checkPageAccess() {
  const currentPage = window.location.pathname.split('/').pop();
  
  // Check if page requires login
  if (PROTECTED_PAGES.includes(currentPage) && !currentUser) {
    redirectToLogin();
    return;
  }
  
  // Check if page requires admin role
  if (ADMIN_PAGES.includes(currentPage) && userRole !== 'admin') {
    redirectToUnauthorized();
    return;
  }
}

// Update UI based on authentication state
function updateUIBasedOnAuth() {
  const authSection = document.getElementById('authSection');
  const userSection = document.getElementById('userSection');
  const userDisplayName = document.getElementById('userDisplayName');
  
  // Check if we're on a page with header elements
  const hasHeaderElements = authSection && userSection;
  
  if (hasHeaderElements) {
    if (currentUser) {
      // Hide login/register buttons, show user info
      authSection.style.display = 'none';
      userSection.style.display = 'flex';
      
      if (userDisplayName) {
        const displayName = currentUser.displayName || currentUser.email?.split('@')[0] || 'User';
        userDisplayName.textContent = displayName;
      }
      
      // Add admin badge if admin
      if (userRole === 'admin') {
        addAdminBadge();
      }
    } else {
      // Show login/register buttons, hide user info
      authSection.style.display = 'flex';
      userSection.style.display = 'none';
    }
  }
  
  // Force UI refresh
  setTimeout(() => {
    const event = new Event('auth-state-updated');
    window.dispatchEvent(event);
  }, 100);
}

// Add admin badge to UI
function addAdminBadge() {
  const userGreeting = document.querySelector('.user-greeting');
  if (userGreeting && !userGreeting.querySelector('.admin-badge')) {
    const badge = document.createElement('span');
    badge.className = 'admin-badge';
    badge.textContent = 'ADMIN';
    badge.style.cssText = `
      background: linear-gradient(135deg, #ef4444, #dc2626);
      color: white;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 10px;
      font-weight: 600;
      margin-left: 8px;
    `;
    userGreeting.appendChild(badge);
  }
}

// Redirect functions
function redirectToLogin() {
  if (window.location.pathname !== '/login.html') {
    sessionStorage.setItem('redirectAfterLogin', window.location.href);
    window.location.href = 'login.html';
  }
}

function redirectToUnauthorized() {
  alert('Bạn không có quyền truy cập trang này!');
  window.location.href = 'index.html';
}

// Redirect after successful login - SECURE VERSION
export function redirectAfterLogin() {
  const redirectUrl = sessionStorage.getItem('redirectAfterLogin');
  sessionStorage.removeItem('redirectAfterLogin');
  
  // Validate redirect URL to prevent open redirect attacks
  if (redirectUrl && isValidRedirectUrl(redirectUrl)) {
    window.location.href = redirectUrl;
  } else {
    // If URL is invalid or missing, redirect to safe default
    window.location.href = 'index.html';
  }
}

// Check if user is authenticated
export function isAuthenticated() {
  return !!currentUser;
}

// Check if user is admin
export function isAdmin() {
  return userRole === 'admin';
}

// Get current user
export function getCurrentUser() {
  return currentUser;
}

// Get user role
export function getUserRole() {
  return userRole;
}