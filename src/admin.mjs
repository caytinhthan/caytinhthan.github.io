// admin.mjs - Admin dashboard functionality
import { getAllUsersWithRoles, setUserRole, ROLES } from './roles.mjs';
import { getLeafStatistics, getWitheredLeaves } from './leaves.mjs';
import { getWaitingChats, acceptChat } from './chat.mjs';
import { showToast, showConfirm } from './ui.mjs';
import { escapeHtml, sanitizeDisplayName } from './security.mjs';

/**
 * Load dashboard statistics
 */
export async function loadDashboard() {
  try {
    // Load leaf statistics
    const leafStats = await getLeafStatistics();
    
    document.getElementById('totalLeaves').textContent = leafStats.total;
    document.getElementById('witheredLeaves').textContent = leafStats.withered;
    
    // Load user statistics
    const users = await getAllUsersWithRoles();
    const activeUsers = users.filter(user => 
      user.isOnline || (Date.now() - user.lastActive < 24 * 60 * 60 * 1000)
    ).length;
    
    document.getElementById('activeUsers').textContent = activeUsers;
    
    // Load pending chats
    const waitingChats = await getWaitingChats();
    document.getElementById('pendingChats').textContent = waitingChats.length;
    
    // Load recent users
    loadRecentUsers(users.slice(0, 5));
    
    // Load chat queue
    loadChatQueue(waitingChats.slice(0, 5));
    
  } catch (error) {
    console.error('Error loading dashboard:', error);
    showToast('Không thể tải dữ liệu dashboard', 'error');
  }
}

/**
 * Load users section
 */
export async function loadUsers() {
  try {
    const users = await getAllUsersWithRoles();
    renderUserList(users);
  } catch (error) {
    console.error('Error loading users:', error);
    showToast('Không thể tải danh sách người dùng', 'error');
  }
}

/**
 * Load chat queue section
 */
export async function loadChatQueue() {
  try {
    const waitingChats = await getWaitingChats();
    renderChatQueue(waitingChats);
  } catch (error) {
    console.error('Error loading chat queue:', error);
    showToast('Không thể tải hàng đợi chat', 'error');
  }
}

/**
 * Load recent users in dashboard
 * @param {Array} users - Array of users
 */
function loadRecentUsers(users) {
  const userList = document.getElementById('userList');
  
  if (users.length === 0) {
    userList.innerHTML = `
      <div class="empty-state">
        <span class="empty-state-icon">👥</span>
        <p>Không có người dùng nào</p>
      </div>
    `;
    return;
  }
  
  userList.innerHTML = users.map(user => `
    <div class="user-item">
      <div class="user-item-avatar">
        ${(user.displayName || user.email).charAt(0).toUpperCase()}
      </div>
      <div class="user-item-info">
        <p class="user-item-name">${escapeHtml(user.displayName || user.email)}</p>
        <p class="user-item-role">${getRoleDisplayName(user.role)}</p>
      </div>
      <div class="user-item-actions">
        <button class="user-action-btn" onclick="viewUserProfile('${user.uid}')">
          Xem
        </button>
      </div>
    </div>
  `).join('');
}

/**
 * Render full user list
 * @param {Array} users - Array of users
 */
function renderUserList(users) {
  const userList = document.getElementById('userList');
  
  if (users.length === 0) {
    userList.innerHTML = `
      <div class="empty-state">
        <span class="empty-state-icon">👥</span>
        <p>Không có người dùng nào</p>
      </div>
    `;
    return;
  }
  
  userList.innerHTML = users.map(user => `
    <div class="user-item">
      <div class="user-item-avatar">
        ${(user.displayName || user.email).charAt(0).toUpperCase()}
      </div>
      <div class="user-item-info">
        <p class="user-item-name">${escapeHtml(user.displayName || user.email)}</p>
        <p class="user-item-role">${getRoleDisplayName(user.role)}</p>
        <p class="user-item-meta">
          ${user.isOnline ? '🟢 Online' : '⚫ Offline'} • 
          Tham gia ${formatDate(user.createdAt)}
        </p>
      </div>
      <div class="user-item-actions">
        <select class="user-role-select" data-user-id="${user.uid}" data-current-role="${user.role}">
          <option value="${ROLES.USER}" ${user.role === ROLES.USER ? 'selected' : ''}>
            Người dùng
          </option>
          <option value="${ROLES.COUNSELOR}" ${user.role === ROLES.COUNSELOR ? 'selected' : ''}>
            Tư vấn viên
          </option>
          <option value="${ROLES.ADMIN}" ${user.role === ROLES.ADMIN ? 'selected' : ''}>
            Quản trị viên
          </option>
        </select>
        <button class="user-action-btn save-role" data-user-id="${user.uid}" style="display: none;">
          Lưu
        </button>
      </div>
    </div>
  `).join('');
  
  // Add event listeners for role changes
  userList.querySelectorAll('.user-role-select').forEach(select => {
    select.addEventListener('change', (e) => {
      const userId = e.target.dataset.userId;
      const currentRole = e.target.dataset.currentRole;
      const newRole = e.target.value;
      
      if (newRole !== currentRole) {
        const saveBtn = userList.querySelector(`[data-user-id="${userId}"].save-role`);
        saveBtn.style.display = 'inline-block';
      }
    });
  });
  
  // Add event listeners for save buttons
  userList.querySelectorAll('.save-role').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const userId = e.target.dataset.userId;
      const select = userList.querySelector(`select[data-user-id="${userId}"]`);
      const newRole = select.value;
      
      const confirmed = await showConfirm(
        `Bạn có chắc muốn thay đổi quyền của người dùng này thành "${getRoleDisplayName(newRole)}"?`,
        'Xác nhận',
        'Hủy'
      );
      
      if (confirmed) {
        const success = await setUserRole(userId, newRole);
        if (success) {
          showToast('Cập nhật quyền thành công', 'success');
          select.dataset.currentRole = newRole;
          e.target.style.display = 'none';
        } else {
          showToast('Không thể cập nhật quyền', 'error');
          select.value = select.dataset.currentRole; // Reset
        }
      } else {
        select.value = select.dataset.currentRole; // Reset
        e.target.style.display = 'none';
      }
    });
  });
}

/**
 * Render chat queue
 * @param {Array} chats - Array of waiting chats
 */
function renderChatQueue(chats) {
  const chatQueue = document.getElementById('chatQueue');
  
  if (chats.length === 0) {
    chatQueue.innerHTML = `
      <div class="empty-state">
        <span class="empty-state-icon">💬</span>
        <p>Không có chat nào đang chờ</p>
      </div>
    `;
    return;
  }
  
  chatQueue.innerHTML = chats.map(chat => `
    <div class="chat-item">
      <div class="chat-info">
        <p class="chat-user">${escapeHtml(chat.userName)}</p>
        <p class="chat-time">Chờ từ ${formatTime(chat.createdAt)}</p>
        ${chat.initialMessage ? `<p class="chat-preview">"${escapeHtml(chat.initialMessage.substring(0, 100))}..."</p>` : ''}
      </div>
      <div class="chat-actions">
        <button class="chat-btn" onclick="acceptChatRequest('${chat.id}')">
          Nhận
        </button>
        <button class="chat-btn decline" onclick="declineChatRequest('${chat.id}')">
          Từ chối
        </button>
      </div>
    </div>
  `).join('');
}

/**
 * Accept chat request
 * @param {string} chatId - Chat ID
 */
window.acceptChatRequest = async function(chatId) {
  try {
    const success = await acceptChat(chatId);
    if (success) {
      showToast('Đã nhận yêu cầu chat', 'success');
      // Open chat window
      const { openChat } = await import('./chat.mjs');
      openChat(chatId);
      // Refresh chat queue
      loadChatQueue();
    } else {
      showToast('Không thể nhận yêu cầu chat', 'error');
    }
  } catch (error) {
    console.error('Error accepting chat:', error);
    showToast('Có lỗi xảy ra', 'error');
  }
};

/**
 * Decline chat request
 * @param {string} chatId - Chat ID
 */
window.declineChatRequest = async function(chatId) {
  const confirmed = await showConfirm(
    'Bạn có chắc muốn từ chối yêu cầu chat này?',
    'Từ chối',
    'Hủy'
  );
  
  if (confirmed) {
    try {
      const { closeChat } = await import('./chat.mjs');
      const success = await closeChat(chatId);
      if (success) {
        showToast('Đã từ chối yêu cầu chat', 'info');
        loadChatQueue();
      } else {
        showToast('Không thể từ chối yêu cầu chat', 'error');
      }
    } catch (error) {
      console.error('Error declining chat:', error);
      showToast('Có lỗi xảy ra', 'error');
    }
  }
};

/**
 * View user profile
 * @param {string} userId - User ID
 */
window.viewUserProfile = function(userId) {
  // TODO: Implement user profile modal
  showToast('Tính năng đang phát triển', 'info');
};

/**
 * Get role display name
 * @param {string} role - Role
 * @returns {string} Display name
 */
function getRoleDisplayName(role) {
  const roleNames = {
    [ROLES.USER]: 'Người dùng',
    [ROLES.COUNSELOR]: 'Tư vấn viên',
    [ROLES.ADMIN]: 'Quản trị viên'
  };
  
  return roleNames[role] || 'Không xác định';
}

/**
 * Format date
 * @param {number} timestamp - Timestamp
 * @returns {string} Formatted date
 */
function formatDate(timestamp) {
  return new Date(timestamp).toLocaleDateString('vi-VN');
}

/**
 * Format time ago
 * @param {number} timestamp - Timestamp
 * @returns {string} Time ago string
 */
function formatTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (minutes < 1) return 'vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  if (hours < 24) return `${hours} giờ trước`;
  return `${days} ngày trước`;
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}