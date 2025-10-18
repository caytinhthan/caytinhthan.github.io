// roles.mjs - Role management system
import { db, ref, onValue, set } from './firebase-init.mjs';
import { getCurrentUser } from './auth.mjs';

// Role constants
export const ROLES = {
  USER: 'user',
  COUNSELOR: 'counselor', 
  ADMIN: 'admin'
};

// Role hierarchy (higher number = more permissions)
const ROLE_HIERARCHY = {
  [ROLES.USER]: 1,
  [ROLES.COUNSELOR]: 2,
  [ROLES.ADMIN]: 3
};

// Cache for user roles
const roleCache = new Map();

/**
 * Get user role from database
 * @param {string} userId - User ID
 * @returns {Promise<string>} User role
 */
export async function getUserRole(userId) {
  if (!userId) return ROLES.USER;
  
  // Check cache first
  if (roleCache.has(userId)) {
    return roleCache.get(userId);
  }
  
  return new Promise((resolve) => {
    const userRef = ref(db, `users/${userId}/role`);
    onValue(userRef, (snapshot) => {
      const role = snapshot.val() || ROLES.USER;
      roleCache.set(userId, role);
      resolve(role);
    }, { onlyOnce: true });
  });
}

/**
 * Set user role (admin only)
 * @param {string} userId - User ID
 * @param {string} role - New role
 * @returns {Promise<boolean>} Success status
 */
export async function setUserRole(userId, role) {
  try {
    const currentUser = getCurrentUser();
    if (!currentUser) throw new Error('Not authenticated');
    
    // Check if current user is admin
    const currentUserRole = await getUserRole(currentUser.uid);
    if (currentUserRole !== ROLES.ADMIN) {
      throw new Error('Permission denied');
    }
    
    // Validate role
    if (!Object.values(ROLES).includes(role)) {
      throw new Error('Invalid role');
    }
    
    const userRef = ref(db, `users/${userId}/role`);
    await set(userRef, role);
    
    // Update cache
    roleCache.set(userId, role);
    
    console.log(`Role updated: ${userId} -> ${role}`);
    return true;
  } catch (error) {
    console.error('Error setting user role:', error);
    return false;
  }
}

/**
 * Check if user has specific role or higher
 * @param {string} userId - User ID
 * @param {string} requiredRole - Required role
 * @returns {Promise<boolean>} Has permission
 */
export async function hasRole(userId, requiredRole) {
  if (!userId) return false;
  
  const userRole = await getUserRole(userId);
  const userLevel = ROLE_HIERARCHY[userRole] || 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
  
  return userLevel >= requiredLevel;
}

/**
 * Check if current user is admin
 * @returns {Promise<boolean>} Is admin
 */
export async function isAdmin() {
  const currentUser = getCurrentUser();
  if (!currentUser) return false;
  
  return await hasRole(currentUser.uid, ROLES.ADMIN);
}

/**
 * Check if current user is counselor or admin
 * @returns {Promise<boolean>} Is counselor or admin
 */
export async function isCounselor() {
  const currentUser = getCurrentUser();
  if (!currentUser) return false;
  
  return await hasRole(currentUser.uid, ROLES.COUNSELOR);
}

/**
 * Get all users with their roles (admin/counselor only)
 * @returns {Promise<Array>} Array of users with roles
 */
export async function getAllUsersWithRoles() {
  const currentUser = getCurrentUser();
  if (!currentUser) throw new Error('Not authenticated');
  
  const canView = await hasRole(currentUser.uid, ROLES.COUNSELOR);
  if (!canView) throw new Error('Permission denied');
  
  return new Promise((resolve) => {
    const usersRef = ref(db, 'users');
    onValue(usersRef, (snapshot) => {
      const users = [];
      const data = snapshot.val();
      
      if (data) {
        Object.entries(data).forEach(([uid, userData]) => {
          users.push({
            uid,
            ...userData,
            role: userData.role || ROLES.USER
          });
        });
      }
      
      resolve(users);
    }, { onlyOnce: true });
  });
}

/**
 * Initialize role permissions for UI
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Permission object
 */
export async function initializePermissions(userId) {
  if (!userId) {
    return {
      canEdit: false,
      canDelete: false,
      canModerate: false,
      canAdmin: false,
      role: ROLES.USER
    };
  }
  
  const role = await getUserRole(userId);
  
  return {
    canEdit: true, // All users can edit their own content
    canDelete: role === ROLES.ADMIN,
    canModerate: await hasRole(userId, ROLES.COUNSELOR),
    canAdmin: role === ROLES.ADMIN,
    role
  };
}

/**
 * Subscribe to role changes
 * @param {string} userId - User ID
 * @param {Function} callback - Callback function
 * @returns {Function} Unsubscribe function
 */
export function subscribeToRoleChanges(userId, callback) {
  if (!userId) return () => {};
  
  const userRef = ref(db, `users/${userId}/role`);
  return onValue(userRef, (snapshot) => {
    const role = snapshot.val() || ROLES.USER;
    roleCache.set(userId, role);
    callback(role);
  });
}

/**
 * Middleware to check permissions before actions
 * @param {string} requiredRole - Required role
 * @returns {Function} Middleware function
 */
export function requireRole(requiredRole) {
  return async function(next, ...args) {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      throw new Error('Authentication required');
    }
    
    const hasPermission = await hasRole(currentUser.uid, requiredRole);
    if (!hasPermission) {
      throw new Error('Insufficient permissions');
    }
    
    return next(...args);
  };
}

// Admin functions
export const adminRequired = requireRole(ROLES.ADMIN);
export const counselorRequired = requireRole(ROLES.COUNSELOR);

// Clear role cache when user changes
export function clearRoleCache() {
  roleCache.clear();
}

