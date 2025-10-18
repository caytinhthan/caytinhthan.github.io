// ui.mjs - Common UI components and utilities
import { getCurrentUser, logout } from './auth.mjs';
import { getUserRole, ROLES } from './roles.mjs';
import { openChat } from './chat.mjs';
import { escapeHtml, sanitizeDisplayName } from './security.mjs';

/**
 * Create header/navigation component
 * @param {Object} options - Configuration options
 * @returns {HTMLElement} Header element
 */
export function createHeader(options = {}) {
  const {
    showAuthButtons = true,
    showSettings = true,
    showChatButton = true,
    className = 'app-header'
  } = options;
  
  const header = document.createElement('div');
  header.className = className;
  
  header.innerHTML = `
    <div class="header-content">
      <div class="header-left">
        <a href="index.html" class="logo">
          <span class="logo-icon">🌱</span>
          <span class="logo-text">Cây Tình Thần</span>
        </a>
      </div>
      
      <div class="header-right" id="headerRight">
        ${showAuthButtons ? `
          <div class="auth-section" id="authSection">
            <button class="header-btn login-btn" onclick="window.location.href='login.html'">
              Đăng nhập
            </button>
            <button class="header-btn register-btn" onclick="window.location.href='register.html'">
              Đăng ký
            </button>
          </div>
          
          <div class="user-section" id="userSection" style="display: none;">
            <div class="user-greeting">
              <span>Xin chào, </span>
              <span id="userDisplayName"></span>
            </div>
            
            <div class="user-menu">
              ${showSettings ? `
                <button class="header-btn settings-btn" id="settingsBtn">
                  <span>⚙️</span>
                  <span>Cài đặt</span>
                </button>
              ` : ''}
              
              <div class="user-dropdown">
                <button class="user-avatar" id="userAvatarBtn">
                  <span id="userAvatarText">U</span>
                </button>
                
                <div class="dropdown-menu" id="userDropdown">
                  <a href="#" class="dropdown-item" id="profileLink">
                    <span>👤</span>
                    <span>Hồ sơ</span>
                  </a>
                  <a href="#" class="dropdown-item" id="myLeavesLink">
                    <span>🌿</span>
                    <span>Lá của tôi</span>
                  </a>
                  <div class="dropdown-divider"></div>
                  <a href="admin.html" class="dropdown-item" id="adminLink" style="display: none;">
                    <span>🛠️</span>
                    <span>Quản trị</span>
                  </a>
                  <div class="dropdown-divider admin-divider" style="display: none;"></div>
                  <button class="dropdown-item logout-item" id="logoutBtn">
                    <span>🚪</span>
                    <span>Đăng xuất</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
  
  // Initialize header functionality
  if (showAuthButtons) {
    initializeHeader(header);
  }
  
  return header;
}

/**
 * Position dropdown menu to stay within viewport bounds
 * @param {HTMLElement} trigger - The trigger element
 * @param {HTMLElement} menu - The dropdown menu element
 */
function positionDropdown(trigger, menu) {
  if (!trigger || !menu) return;
  
  menu.style.left = '';
  menu.style.right = '0';
  menu.style.top = 'calc(100% + 8px)';
  
  const m = menu.getBoundingClientRect();
  const pad = 8;
  
  if (m.right > innerWidth - pad) {
    menu.style.right = `${m.right - (innerWidth - pad)}px`;
  }
  
  if (m.bottom > innerHeight - pad) {
    menu.style.top = `${-(m.height + 8)}px`;
  }
}

/**
 * Initialize header functionality
 * @param {HTMLElement} header - Header element
 */
async function initializeHeader(header) {
  const authSection = header.querySelector('#authSection');
  const userSection = header.querySelector('#userSection');
  const userDisplayName = header.querySelector('#userDisplayName');
  const userAvatarText = header.querySelector('#userAvatarText');
  const userAvatarBtn = header.querySelector('#userAvatarBtn');
  const userDropdown = header.querySelector('#userDropdown');
  const logoutBtn = header.querySelector('#logoutBtn');
  const adminLink = header.querySelector('#adminLink');
  const adminDivider = header.querySelector('.admin-divider');
  const settingsBtn = header.querySelector('#settingsBtn');
  
  // Check current user
  const user = getCurrentUser();
  
  if (user) {
    // Show user section
    authSection.style.display = 'none';
    userSection.style.display = 'flex';
    
    // Set user info
    const displayName = user.displayName || user.email.split('@')[0];
    userDisplayName.textContent = displayName;
    userAvatarText.textContent = displayName.charAt(0).toUpperCase();
    
    // Check user role for admin access
    const userRole = await getUserRole(user.uid);
    if (userRole === ROLES.ADMIN || userRole === ROLES.COUNSELOR) {
      adminLink.style.display = 'flex';
      adminDivider.style.display = 'block';
    }
  } else {
    // Show auth buttons
    authSection.style.display = 'flex';
    userSection.style.display = 'none';
  }
  
  // Dropdown toggle
  userAvatarBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    userDropdown.classList.toggle('show');
    if (userDropdown.classList.contains('show')) {
      positionDropdown(userAvatarBtn, userDropdown);
    }
  });
  
  // Close dropdown when clicking outside
  document.addEventListener('click', () => {
    userDropdown?.classList.remove('show');
  });
  
  // Reposition dropdown on window resize
  addEventListener('resize', () => {
    if (userDropdown?.classList.contains('show')) {
      positionDropdown(userAvatarBtn, userDropdown);
    }
  });
  
  // Logout handler
  logoutBtn?.addEventListener('click', async () => {
    try {
      await logout();
      window.location.reload();
    } catch (error) {
      showToast('Đăng xuất thất bại', 'error');
    }
  });
  
  // Settings handler
  settingsBtn?.addEventListener('click', () => {
    showSettingsModal();
  });
}

/**
 * Create floating chat button
 * @returns {HTMLElement} Chat button element
 */
export function createChatButton() {
  const chatButton = document.createElement('div');
  chatButton.className = 'floating-chat-btn';
  chatButton.id = 'floatingChatBtn';
  
  chatButton.innerHTML = `
    <button class="chat-btn" id="chatBtn">
      <span class="chat-icon">💬</span>
      <span class="chat-text">Tư vấn</span>
      <span class="chat-badge" id="chatBadge" style="display: none;">!</span>
    </button>
  `;
  
  // Initialize chat functionality
  const chatBtn = chatButton.querySelector('#chatBtn');
  chatBtn.addEventListener('click', () => {
    openChat();
  });
  
  return chatButton;
}

/**
 * Set theme and sync with scene
 * @param {string} t - Theme: 'light' or 'dark'
 */
export function setTheme(t) {
  document.documentElement.classList.toggle('theme-day', t === 'light');
  document.documentElement.classList.toggle('theme-night', t === 'dark');
  localStorage.setItem('theme', t);
  window.dispatchEvent(new CustomEvent('theme-change', { detail: { theme: t } }));
}

/**
 * Show toast notification
 * @param {string} message - Message to show
 * @param {string} type - Type: 'success', 'error', 'warning', 'info'
 * @param {number} duration - Duration in ms
 */
export function showToast(message, type = 'info', duration = 3000) {
  // Remove existing toasts
  document.querySelectorAll('.toast').forEach(toast => toast.remove());
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icons = {
    success: '✅',
    error: '❌', 
    warning: '⚠️',
    info: 'ℹ️'
  };
  
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <span class="toast-message">${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">×</button>
  `;
  
  document.body.appendChild(toast);
  
  // Auto remove
  setTimeout(() => {
    toast.remove();
  }, duration);
}

/**
 * Show loading overlay
 * @param {boolean} show - Show or hide
 * @param {string} message - Loading message
 */
export function showLoading(show, message = 'Đang tải...') {
  let loader = document.getElementById('globalLoader');
  
  if (show) {
    if (!loader) {
      loader = document.createElement('div');
      loader.id = 'globalLoader';
      loader.className = 'global-loader';
      loader.innerHTML = `
        <div class="loader-content">
          <div class="loader-spinner"></div>
          <div class="loader-text">${message}</div>
        </div>
      `;
      document.body.appendChild(loader);
    }
    loader.style.display = 'flex';
  } else {
    if (loader) {
      loader.style.display = 'none';
    }
  }
}

/**
 * Show confirmation dialog
 * @param {string} message - Confirmation message
 * @param {string} confirmText - Confirm button text
 * @param {string} cancelText - Cancel button text
 * @returns {Promise<boolean>} User confirmation
 */
export function showConfirm(message, confirmText = 'Xác nhận', cancelText = 'Hủy') {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'confirm-modal';
    modal.innerHTML = `
      <div class="confirm-dialog">
        <div class="confirm-message">${message}</div>
        <div class="confirm-actions">
          <button class="confirm-btn cancel-btn">${cancelText}</button>
          <button class="confirm-btn confirm-btn-primary">${confirmText}</button>
        </div>
      </div>
    `;
    
    const cancelBtn = modal.querySelector('.cancel-btn');
    const confirmBtn = modal.querySelector('.confirm-btn-primary');
    
    cancelBtn.addEventListener('click', () => {
      modal.remove();
      resolve(false);
    });
    
    confirmBtn.addEventListener('click', () => {
      modal.remove();
      resolve(true);
    });
    
    // Close on outside click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
        resolve(false);
      }
    });
    
    document.body.appendChild(modal);
  });
}

/**
 * Open settings modal
 */
function showSettingsModal() {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="sheet settings-sheet">
      <button class="x" onclick="this.closest('.modal').remove()">✕</button>
      <h3>⚙️ Cài đặt</h3>
      
      <div class="settings-content">
        <div class="setting-group">
          <h4>Giao diện</h4>
          <label class="setting-item">
            <span>Chế độ tối</span>
            <input type="checkbox" id="darkModeToggle">
          </label>
          <label class="setting-item">
            <span>Ngôn ngữ</span>
            <select id="languageSelect">
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>
        
        <div class="setting-group">
          <h4>Thông báo</h4>
          <label class="setting-item">
            <span>Thông báo lá mới</span>
            <input type="checkbox" id="newLeafNotification" checked>
          </label>
          <label class="setting-item">
            <span>Thông báo an ủi</span>
            <input type="checkbox" id="comfortNotification" checked>
          </label>
        </div>
        
        <div class="setting-group">
          <h4>Quyền riêng tư</h4>
          <label class="setting-item">
            <span>Hiển thị tên thật</span>
            <input type="checkbox" id="showRealName" checked>
          </label>
          <label class="setting-item">
            <span>Cho phép nhận tin nhắn</span>
            <input type="checkbox" id="allowMessages" checked>
          </label>
        </div>
      </div>
      
      <div class="settings-actions">
        <button class="btn secondary" onclick="this.closest('.modal').remove()">
          Hủy
        </button>
        <button class="btn primary" id="saveSettingsBtn">
          Lưu cài đặt
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Load current settings
  loadUserSettings(modal);
  
  // Save settings handler
  const saveBtn = modal.querySelector('#saveSettingsBtn');
  saveBtn.addEventListener('click', () => {
    saveUserSettings(modal);
    modal.remove();
    showToast('Cài đặt đã được lưu', 'success');
  });
}

/**
 * Load user settings
 * @param {HTMLElement} modal - Settings modal
 */
function loadUserSettings(modal) {
  // Load from localStorage or user profile
  const settings = JSON.parse(localStorage.getItem('userSettings') || '{}');
  
  const darkModeToggle = modal.querySelector('#darkModeToggle');
  const languageSelect = modal.querySelector('#languageSelect');
  const newLeafNotification = modal.querySelector('#newLeafNotification');
  const comfortNotification = modal.querySelector('#comfortNotification');
  const showRealName = modal.querySelector('#showRealName');
  const allowMessages = modal.querySelector('#allowMessages');
  
  darkModeToggle.checked = settings.darkMode || false;
  languageSelect.value = settings.language || 'vi';
  newLeafNotification.checked = settings.newLeafNotification !== false;
  comfortNotification.checked = settings.comfortNotification !== false;
  showRealName.checked = settings.showRealName !== false;
  allowMessages.checked = settings.allowMessages !== false;
}

/**
 * Save user settings
 * @param {HTMLElement} modal - Settings modal
 */
function saveUserSettings(modal) {
  const settings = {
    darkMode: modal.querySelector('#darkModeToggle').checked,
    language: modal.querySelector('#languageSelect').value,
    newLeafNotification: modal.querySelector('#newLeafNotification').checked,
    comfortNotification: modal.querySelector('#comfortNotification').checked,
    showRealName: modal.querySelector('#showRealName').checked,
    allowMessages: modal.querySelector('#allowMessages').checked
  };
  
  localStorage.setItem('userSettings', JSON.stringify(settings));
  
  // Apply dark mode
  if (settings.darkMode) {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

/**
 * Open chat window
 */
function openChatWindow() {
  const user = getCurrentUser();
  if (!user) {
    showToast('Vui lòng đăng nhập để sử dụng tính năng chat', 'warning');
    return;
  }
  
  // Import and open chat module
  import('./chat.mjs').then(({ openChat }) => {
    openChat();
  }).catch(error => {
    console.error('Error loading chat module:', error);
    showToast('Không thể mở chat, vui lòng thử lại', 'error');
  });
}

/**
 * Initialize common UI components
 */
export function initializeUI() {
  // Add header if not exists
  if (!document.querySelector('.app-header')) {
    const header = createHeader();
    document.body.insertBefore(header, document.body.firstChild);
  }
  
  // Add floating chat button
  if (!document.querySelector('.floating-chat-btn')) {
    const chatButton = createChatButton();
    document.body.appendChild(chatButton);
  }
  
  // Load user settings
  const settings = JSON.parse(localStorage.getItem('userSettings') || '{}');
  if (settings.darkMode) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  
  console.log('🎨 UI components initialized');
}

console.log('🎨 UI module loaded');