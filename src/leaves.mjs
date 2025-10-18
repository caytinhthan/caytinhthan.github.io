// leaves.mjs - Leaf management with withered/healthy states and comfort system
import { db, ref, set, remove, onValue, push, update } from './firebase-init.mjs';
import { getCurrentUser } from './auth.mjs';
import { getUserRole, ROLES } from './roles.mjs';

// Leaf types and states
export const LEAF_TYPES = {
  HEALTHY: 'healthy',
  WITHERED: 'withered'
};

export const LEAF_STATES = {
  ACTIVE: 'active',
  RECOVERED: 'recovered'
};

/**
 * Create a new leaf
 * @param {Object} leafData - Leaf data
 * @returns {Promise<string>} Leaf ID
 */
export async function createLeaf(leafData) {
  const user = getCurrentUser();
  if (!user) throw new Error('Authentication required');
  
  const leaf = {
    id: crypto.randomUUID?.() || Date.now().toString(),
    message: leafData.message || '',
    author: leafData.author || 'Ẩn danh',
    ownerId: user.uid,
    type: leafData.type || LEAF_TYPES.HEALTHY,
    state: LEAF_STATES.ACTIVE,
    shape: leafData.shape || 'oval',
    palette: leafData.palette || 0,
    scale: leafData.scale || 1,
    rotation: leafData.rotation || 0,
    position: leafData.position || { x: 0, y: 0 },
    category: leafData.category || 'other',  // money|love|study|work|relation|other|dry|transition
    shapeIndex: Number.isFinite(leafData.shapeIndex) ? leafData.shapeIndex : 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isAnonymous: leafData.isAnonymous || false,
    comfortCount: 0
  };
  
  const leafRef = ref(db, `leaves/${leaf.id}`);
  await set(leafRef, leaf);
  
  return leaf.id;
}

/**
 * Update leaf data
 * @param {string} leafId - Leaf ID
 * @param {Object} updates - Updates to apply
 * @returns {Promise<boolean>} Success status
 */
export async function updateLeaf(leafId, updates) {
  try {
    const user = getCurrentUser();
    if (!user) throw new Error('Authentication required');
    
    // Check if user owns the leaf or is admin
    const leaf = await getLeaf(leafId);
    if (!leaf) throw new Error('Leaf not found');
    
    const userRole = await getUserRole(user.uid);
    const canEdit = leaf.ownerId === user.uid || userRole === ROLES.ADMIN;
    
    if (!canEdit) throw new Error('Permission denied');
    
    const leafRef = ref(db, `leaves/${leafId}`);
    await update(leafRef, {
      ...updates,
      updatedAt: Date.now()
    });
    
    return true;
  } catch (error) {
    console.error('Error updating leaf:', error);
    return false;
  }
}

/**
 * Delete a leaf
 * @param {string} leafId - Leaf ID
 * @returns {Promise<boolean>} Success status
 */
export async function deleteLeaf(leafId) {
  try {
    const user = getCurrentUser();
    if (!user) throw new Error('Authentication required');
    
    // Check permissions
    const leaf = await getLeaf(leafId);
    if (!leaf) throw new Error('Leaf not found');
    
    const userRole = await getUserRole(user.uid);
    const canDelete = leaf.ownerId === user.uid || userRole === ROLES.ADMIN;
    
    if (!canDelete) throw new Error('Permission denied');
    
    const leafRef = ref(db, `leaves/${leafId}`);
    await remove(leafRef);
    
    return true;
  } catch (error) {
    console.error('Error deleting leaf:', error);
    return false;
  }
}

/**
 * Get a single leaf
 * @param {string} leafId - Leaf ID
 * @returns {Promise<Object|null>} Leaf data
 */
export function getLeaf(leafId) {
  return new Promise((resolve) => {
    const leafRef = ref(db, `leaves/${leafId}`);
    onValue(leafRef, (snapshot) => {
      resolve(snapshot.val());
    }, { onlyOnce: true });
  });
}

/**
 * Get all leaves
 * @returns {Promise<Array>} Array of leaves
 */
export function getAllLeaves() {
  return new Promise((resolve) => {
    const leavesRef = ref(db, 'leaves');
    onValue(leavesRef, (snapshot) => {
      const leaves = [];
      const data = snapshot.val();
      
      if (data) {
        Object.entries(data).forEach(([id, leaf]) => {
          leaves.push({ ...leaf, id });
        });
      }
      
      resolve(leaves);
    }, { onlyOnce: true });
  });
}

/**
 * Subscribe to leaves changes
 * @param {Function} callback - Callback function
 * @returns {Function} Unsubscribe function
 */
export function subscribeToLeaves(callback) {
  const leavesRef = ref(db, 'leaves');
  return onValue(leavesRef, (snapshot) => {
    const leaves = [];
    const data = snapshot.val();
    
    if (data) {
      Object.entries(data).forEach(([id, leaf]) => {
        leaves.push({ ...leaf, id });
      });
    }
    
    callback(leaves);
  });
}

/**
 * Add comfort message to a leaf
 * @param {string} leafId - Leaf ID
 * @param {string} message - Comfort message
 * @returns {Promise<string>} Comfort ID
 */
export async function addComfort(leafId, message) {
  const user = getCurrentUser();
  if (!user) throw new Error('Authentication required');
  
  const comfortId = crypto.randomUUID?.() || Date.now().toString();
  const comfort = {
    id: comfortId,
    message,
    authorId: user.uid,
    authorName: user.displayName || 'Ẩn danh',
    createdAt: Date.now()
  };
  
  const comfortRef = ref(db, `leaves/${leafId}/comforts/${comfortId}`);
  await set(comfortRef, comfort);
  
  // Update comfort count
  const leaf = await getLeaf(leafId);
  if (leaf) {
    const comfortCount = Object.keys(leaf.comforts || {}).length;
    await update(ref(db, `leaves/${leafId}`), {
      comfortCount,
      updatedAt: Date.now()
    });
  }
  
  return comfortId;
}

/**
 * Get comforts for a leaf
 * @param {string} leafId - Leaf ID
 * @returns {Promise<Array>} Array of comforts
 */
export function getLeafComforts(leafId) {
  return new Promise((resolve) => {
    const comfortsRef = ref(db, `leaves/${leafId}/comforts`);
    onValue(comfortsRef, (snapshot) => {
      const comforts = [];
      const data = snapshot.val();
      
      if (data) {
        Object.entries(data).forEach(([id, comfort]) => {
          comforts.push({ ...comfort, id });
        });
      }
      
      resolve(comforts.sort((a, b) => a.createdAt - b.createdAt));
    }, { onlyOnce: true });
  });
}

/**
 * Mark leaf as recovered (owner only)
 * @param {string} leafId - Leaf ID
 * @returns {Promise<boolean>} Success status
 */
export async function markLeafAsRecovered(leafId) {
  try {
    const user = getCurrentUser();
    if (!user) throw new Error('Authentication required');
    
    const leaf = await getLeaf(leafId);
    if (!leaf) throw new Error('Leaf not found');
    
    // Only owner can mark as recovered
    if (leaf.ownerId !== user.uid) {
      throw new Error('Permission denied');
    }
    
    if (leaf.type !== LEAF_TYPES.WITHERED) {
      throw new Error('Only withered leaves can be recovered');
    }
    
    await update(ref(db, `leaves/${leafId}`), {
      state: LEAF_STATES.RECOVERED,
      type: LEAF_TYPES.HEALTHY,
      recoveredAt: Date.now(),
      updatedAt: Date.now()
    });
    
    return true;
  } catch (error) {
    console.error('Error marking leaf as recovered:', error);
    return false;
  }
}

/**
 * Get withered leaves that need comfort
 * @returns {Promise<Array>} Array of withered leaves
 */
export function getWitheredLeaves() {
  return new Promise((resolve) => {
    const leavesRef = ref(db, 'leaves');
    onValue(leavesRef, (snapshot) => {
      const witheredLeaves = [];
      const data = snapshot.val();
      
      if (data) {
        Object.entries(data).forEach(([id, leaf]) => {
          if (leaf.type === LEAF_TYPES.WITHERED && leaf.state === LEAF_STATES.ACTIVE) {
            witheredLeaves.push({ ...leaf, id });
          }
        });
      }
      
      // Sort by creation date (oldest first)
      witheredLeaves.sort((a, b) => a.createdAt - b.createdAt);
      resolve(witheredLeaves);
    }, { onlyOnce: true });
  });
}

/**
 * Get user's leaves
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of user's leaves
 */
export function getUserLeaves(userId) {
  return new Promise((resolve) => {
    const leavesRef = ref(db, 'leaves');
    onValue(leavesRef, (snapshot) => {
      const userLeaves = [];
      const data = snapshot.val();
      
      if (data) {
        Object.entries(data).forEach(([id, leaf]) => {
          if (leaf.ownerId === userId) {
            userLeaves.push({ ...leaf, id });
          }
        });
      }
      
      // Sort by creation date (newest first)
      userLeaves.sort((a, b) => b.createdAt - a.createdAt);
      resolve(userLeaves);
    }, { onlyOnce: true });
  });
}

/**
 * Get statistics
 * @returns {Promise<Object>} Statistics object
 */
export async function getLeafStatistics() {
  const leaves = await getAllLeaves();
  
  const stats = {
    total: leaves.length,
    healthy: leaves.filter(l => l.type === LEAF_TYPES.HEALTHY).length,
    withered: leaves.filter(l => l.type === LEAF_TYPES.WITHERED && l.state === LEAF_STATES.ACTIVE).length,
    recovered: leaves.filter(l => l.state === LEAF_STATES.RECOVERED).length,
    totalComforts: leaves.reduce((sum, l) => sum + (l.comfortCount || 0), 0),
    recentLeaves: leaves.filter(l => Date.now() - l.createdAt < 7 * 24 * 60 * 60 * 1000).length // Last 7 days
  };
  
  return stats;
}

console.log('🌿 Leaves module loaded');