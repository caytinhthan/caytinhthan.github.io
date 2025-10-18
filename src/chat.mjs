// chat.mjs - Real-time chat system for counseling
import { db, ref, set, remove, onValue, push, update } from './firebase-init.mjs';
import { getCurrentUser } from './auth.mjs';
import { getUserRole, ROLES } from './roles.mjs';
import { showToast } from './ui.mjs';

// Chat states
export const CHAT_STATES = {
  WAITING: 'waiting',
  ACTIVE: 'active', 
  CLOSED: 'closed'
};

let currentChatRoom = null;
let chatWindow = null;
let messageSubscription = null;

/**
 * Request chat with counselor
 * @param {string} message - Initial message
 * @returns {Promise<string>} Chat room ID
 */
export async function requestChat(message = '') {
  const user = getCurrentUser();
  if (!user) throw new Error('Authentication required');
  
  // Check if user already has an active chat
  const activeChat = await getUserActiveChat(user.uid);
  if (activeChat) {
    openChatWindow(activeChat.id);
    return activeChat.id;
  }
  
  const chatId = crypto.randomUUID?.() || Date.now().toString();
  const chatData = {
    id: chatId,
    userId: user.uid,
    userName: user.displayName || user.email.split('@')[0],
    counselorId: null,
    counselorName: null,
    state: CHAT_STATES.WAITING,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    initialMessage: message
  };
  
  const chatRef = ref(db, `chats/${chatId}`);
  await set(chatRef, chatData);
  
  // Add initial message if provided
  if (message.trim()) {
    await sendMessage(chatId, message);
  }
  
  showToast('Yêu cầu tư vấn đã được gửi. Vui lòng chờ tư vấn viên phản hồi.', 'info');
  return chatId;
}

/**
 * Accept chat request (counselor only)
 * @param {string} chatId - Chat ID
 * @returns {Promise<boolean>} Success status
 */
export async function acceptChat(chatId) {
  try {
    const user = getCurrentUser();
    if (!user) throw new Error('Authentication required');
    
    const userRole = await getUserRole(user.uid);
    if (userRole !== ROLES.COUNSELOR && userRole !== ROLES.ADMIN) {
      throw new Error('Permission denied');
    }
    
    const chatRef = ref(db, `chats/${chatId}`);
    await update(chatRef, {
      counselorId: user.uid,
      counselorName: user.displayName || user.email.split('@')[0],
      state: CHAT_STATES.ACTIVE,
      acceptedAt: Date.now(),
      updatedAt: Date.now()
    });
    
    return true;
  } catch (error) {
    console.error('Error accepting chat:', error);
    return false;
  }
}

/**
 * Send message in chat
 * @param {string} chatId - Chat ID
 * @param {string} content - Message content
 * @returns {Promise<string>} Message ID
 */
export async function sendMessage(chatId, content) {
  const user = getCurrentUser();
  if (!user) throw new Error('Authentication required');
  
  const messageData = {
    chatId,
    content: content.trim(),
    senderId: user.uid,
    senderName: user.displayName || user.email.split('@')[0],
    timestamp: Date.now(),
    read: false
  };
  
  const messagesRef = ref(db, `chats/${chatId}/messages`);
  const messageRef = await push(messagesRef, messageData);
  
  // Update chat timestamp
  await update(ref(db, `chats/${chatId}`), {
    updatedAt: Date.now(),
    lastMessage: content.substring(0, 100)
  });
  
  return messageRef.key;
}

/**
 * Get chat messages
 * @param {string} chatId - Chat ID
 * @returns {Promise<Array>} Array of messages
 */
export function getChatMessages(chatId) {
  return new Promise((resolve) => {
    const messagesRef = ref(db, `chats/${chatId}/messages`);
    onValue(messagesRef, (snapshot) => {
      const messages = [];
      const data = snapshot.val();
      
      if (data) {
        Object.entries(data).forEach(([id, message]) => {
          messages.push({ ...message, id });
        });
      }
      
      // Sort by timestamp
      messages.sort((a, b) => a.timestamp - b.timestamp);
      resolve(messages);
    }, { onlyOnce: true });
  });
}

/**
 * Subscribe to chat messages
 * @param {string} chatId - Chat ID
 * @param {Function} callback - Callback function
 * @returns {Function} Unsubscribe function
 */
export function subscribeToChatMessages(chatId, callback) {
  const messagesRef = ref(db, `chats/${chatId}/messages`);
  return onValue(messagesRef, (snapshot) => {
    const messages = [];
    const data = snapshot.val();
    
    if (data) {
      Object.entries(data).forEach(([id, message]) => {
        messages.push({ ...message, id });
      });
    }
    
    messages.sort((a, b) => a.timestamp - b.timestamp);
    callback(messages);
  });
}

/**
 * Close chat
 * @param {string} chatId - Chat ID
 * @returns {Promise<boolean>} Success status
 */
export async function closeChat(chatId) {
  try {
    const user = getCurrentUser();
    if (!user) throw new Error('Authentication required');
    
    const chat = await getChat(chatId);
    if (!chat) throw new Error('Chat not found');
    
    // Check permissions
    const userRole = await getUserRole(user.uid);
    const canClose = chat.userId === user.uid || 
                     chat.counselorId === user.uid || 
                     userRole === ROLES.ADMIN;
    
    if (!canClose) throw new Error('Permission denied');
    
    await update(ref(db, `chats/${chatId}`), {
      state: CHAT_STATES.CLOSED,
      closedAt: Date.now(),
      closedBy: user.uid,
      updatedAt: Date.now()
    });
    
    return true;
  } catch (error) {
    console.error('Error closing chat:', error);
    return false;
  }
}

/**
 * Get chat data
 * @param {string} chatId - Chat ID
 * @returns {Promise<Object|null>} Chat data
 */
export function getChat(chatId) {
  return new Promise((resolve) => {
    const chatRef = ref(db, `chats/${chatId}`);
    onValue(chatRef, (snapshot) => {
      resolve(snapshot.val());
    }, { onlyOnce: true });
  });
}

/**
 * Get user's active chat
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} Active chat
 */
export function getUserActiveChat(userId) {
  return new Promise((resolve) => {
    const chatsRef = ref(db, 'chats');
    onValue(chatsRef, (snapshot) => {
      const data = snapshot.val();
      let activeChat = null;
      
      if (data) {
        Object.entries(data).forEach(([id, chat]) => {
          if ((chat.userId === userId || chat.counselorId === userId) && 
              chat.state !== CHAT_STATES.CLOSED) {
            activeChat = { ...chat, id };
          }
        });
      }
      
      resolve(activeChat);
    }, { onlyOnce: true });
  });
}

/**
 * Get waiting chats (counselor/admin only)
 * @returns {Promise<Array>} Array of waiting chats
 */
export function getWaitingChats() {
  return new Promise((resolve) => {
    const chatsRef = ref(db, 'chats');
    onValue(chatsRef, (snapshot) => {
      const waitingChats = [];
      const data = snapshot.val();
      
      if (data) {
        Object.entries(data).forEach(([id, chat]) => {
          if (chat.state === CHAT_STATES.WAITING) {
            waitingChats.push({ ...chat, id });
          }
        });
      }
      
      // Sort by creation time (oldest first)
      waitingChats.sort((a, b) => a.createdAt - b.createdAt);
      resolve(waitingChats);
    }, { onlyOnce: true });
  });
}

/**
 * Open chat window
 * @param {string} chatId - Chat ID (optional)
 */
export async function openChat(chatId = null) {
  const user = getCurrentUser();
  if (!user) {
    showToast('Vui lòng đăng nhập để sử dụng tính năng chat', 'warning');
    return;
  }
  
  // If no chatId, create new chat request
  if (!chatId) {
    try {
      chatId = await requestChat();
    } catch (error) {
      showToast('Không thể tạo yêu cầu tư vấn', 'error');
      return;
    }
  }
  
  openChatWindow(chatId);
}

/**
 * Open chat window UI
 * @param {string} chatId - Chat ID
 */
function openChatWindow(chatId) {
  // Close existing chat window
  if (chatWindow) {
    chatWindow.remove();
  }
  
  // Unsubscribe from previous chat
  if (messageSubscription) {
    messageSubscription();
  }
  
  currentChatRoom = chatId;
  
  // Create chat window
  chatWindow = document.createElement('div');
  chatWindow.className = 'chat-window';
  chatWindow.innerHTML = `
    <div class="chat-header">
      <div class="chat-title">
        <span class="chat-icon">💬</span>
        <span class="chat-title-text">Tư vấn tâm lý</span>
      </div>
      <div class="chat-actions">
        <button class="chat-minimize" id="chatMinimize">−</button>
        <button class="chat-close" id="chatClose">×</button>
      </div>
    </div>
    
    <div class="chat-body">
      <div class="chat-status" id="chatStatus">
        Đang kết nối...
      </div>
      
      <div class="chat-messages" id="chatMessages">
        <!-- Messages will be loaded here -->
      </div>
      
      <div class="chat-input-area">
        <div class="chat-input-container">
          <textarea 
            id="chatInput" 
            placeholder="Nhập tin nhắn..."
            rows="1"
          ></textarea>
          <button class="chat-send" id="chatSend">
            <span>📤</span>
          </button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(chatWindow);
  
  // Initialize chat window
  initializeChatWindow(chatId);
}

/**
 * Initialize chat window functionality
 * @param {string} chatId - Chat ID
 */
async function initializeChatWindow(chatId) {
  const chatMessages = document.getElementById('chatMessages');
  const chatInput = document.getElementById('chatInput');
  const chatSend = document.getElementById('chatSend');
  const chatStatus = document.getElementById('chatStatus');
  const chatClose = document.getElementById('chatClose');
  const chatMinimize = document.getElementById('chatMinimize');
  
  // Load chat data
  const chat = await getChat(chatId);
  if (!chat) {
    showToast('Không tìm thấy cuộc trò chuyện', 'error');
    chatWindow.remove();
    return;
  }
  
  // Update status
  updateChatStatus(chat, chatStatus);
  
  // Subscribe to messages
  messageSubscription = subscribeToChatMessages(chatId, (messages) => {
    renderMessages(messages, chatMessages);
  });
  
  // Send message handler
  const sendMessage = async () => {
    const content = chatInput.value.trim();
    if (!content) return;
    
    try {
      await sendMessage(chatId, content);
      chatInput.value = '';
      chatInput.style.height = 'auto';
    } catch (error) {
      showToast('Không thể gửi tin nhắn', 'error');
    }
  };
  
  chatSend.addEventListener('click', sendMessage);
  
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  
  // Auto-resize textarea
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
  });
  
  // Close chat window
  chatClose.addEventListener('click', () => {
    if (messageSubscription) {
      messageSubscription();
    }
    chatWindow.remove();
    currentChatRoom = null;
  });
  
  // Minimize chat window
  chatMinimize.addEventListener('click', () => {
    chatWindow.classList.toggle('minimized');
  });
  
  // Focus input
  chatInput.focus();
}

/**
 * Update chat status display
 * @param {Object} chat - Chat data
 * @param {HTMLElement} statusElement - Status element
 */
function updateChatStatus(chat, statusElement) {
  let statusText = '';
  let statusClass = '';
  
  switch (chat.state) {
    case CHAT_STATES.WAITING:
      statusText = 'Đang chờ tư vấn viên...';
      statusClass = 'waiting';
      break;
    case CHAT_STATES.ACTIVE:
      statusText = `Đang trò chuyện với ${chat.counselorName}`;
      statusClass = 'active';
      break;
    case CHAT_STATES.CLOSED:
      statusText = 'Cuộc trò chuyện đã kết thúc';
      statusClass = 'closed';
      break;
  }
  
  statusElement.textContent = statusText;
  statusElement.className = `chat-status ${statusClass}`;
}

/**
 * Render messages in chat window
 * @param {Array} messages - Array of messages
 * @param {HTMLElement} container - Messages container
 */
function renderMessages(messages, container) {
  const user = getCurrentUser();
  container.innerHTML = '';
  
  messages.forEach(message => {
    const messageEl = document.createElement('div');
    messageEl.className = `chat-message ${message.senderId === user.uid ? 'own' : 'other'}`;
    
    const time = new Date(message.timestamp).toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit'
    });
    
    messageEl.innerHTML = `
      <div class="message-content">${escapeHtml(message.content)}</div>
      <div class="message-meta">
        <span class="message-sender">${escapeHtml(message.senderName)}</span>
        <span class="message-time">${time}</span>
      </div>
    `;
    
    container.appendChild(messageEl);
  });
  
  // Scroll to bottom
  container.scrollTop = container.scrollHeight;
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

console.log('💬 Chat module loaded');