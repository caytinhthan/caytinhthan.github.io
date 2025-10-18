/**
 * Security utilities for XSS prevention and input sanitization
 */

/**
 * Escape HTML to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
export function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Sanitize HTML content by allowing only safe tags
 * @param {string} html - HTML content to sanitize
 * @returns {string} Sanitized HTML
 */
export function sanitizeHtml(html) {
  if (typeof html !== 'string') return '';
  
  // Create a temporary element
  const temp = document.createElement('div');
  temp.innerHTML = html;
  
  // Remove all script tags and event handlers
  const scripts = temp.querySelectorAll('script');
  scripts.forEach(script => script.remove());
  
  // Remove dangerous attributes
  const allElements = temp.querySelectorAll('*');
  allElements.forEach(el => {
    // Remove dangerous attributes
    const dangerousAttrs = ['onclick', 'onload', 'onerror', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit', 'javascript:', 'vbscript:', 'data:', 'about:'];
    
    for (let i = el.attributes.length - 1; i >= 0; i--) {
      const attr = el.attributes[i];
      const name = attr.name.toLowerCase();
      const value = attr.value.toLowerCase();
      
      // Remove event handlers
      if (name.startsWith('on')) {
        el.removeAttribute(name);
        continue;
      }
      
      // Remove dangerous protocols
      if (dangerousAttrs.some(dangerous => value.includes(dangerous))) {
        el.removeAttribute(name);
      }
    }
  });
  
  return temp.innerHTML;
}

/**
 * Validate URL to prevent open redirect attacks
 * @param {string} url - URL to validate
 * @returns {boolean} True if URL is safe
 */
export function isValidRedirectUrl(url) {
  if (!url || typeof url !== 'string') return false;
  
  try {
    // Allow only relative URLs or same-origin URLs
    if (url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) {
      // Check for dangerous patterns in relative URLs
      const dangerous = ['javascript:', 'data:', 'vbscript:', 'file:', 'about:'];
      return !dangerous.some(pattern => url.toLowerCase().includes(pattern));
    }
    
    // For absolute URLs, check if same origin
    const urlObj = new URL(url, window.location.origin);
    return urlObj.origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Validate and sanitize user input for leaf messages
 * @param {string} text - Input text to validate
 * @returns {string} Sanitized text
 */
export function sanitizeLeafMessage(text) {
  if (!text || typeof text !== 'string') return '';
  
  // Remove HTML tags completely for leaf messages
  const temp = document.createElement('div');
  temp.innerHTML = text;
  let cleanText = temp.textContent || temp.innerText || '';
  
  // Limit length
  cleanText = cleanText.trim().substring(0, 500);
  
  // Remove potentially dangerous characters
  cleanText = cleanText.replace(/[<>"\\/]/g, '');
  
  return cleanText;
}

/**
 * Validate user display name
 * @param {string} name - Display name to validate
 * @returns {string} Sanitized display name
 */
export function sanitizeDisplayName(name) {
  if (!name || typeof name !== 'string') return '';
  
  // Remove HTML tags
  const temp = document.createElement('div');
  temp.innerHTML = name;
  let cleanName = temp.textContent || temp.innerText || '';
  
  // Limit length and remove special characters
  cleanName = cleanName.trim().substring(0, 50);
  cleanName = cleanName.replace(/[<>"\\/]/g, '');
  
  return cleanName;
}

/**
 * Create safe HTML for SVG content (controlled environment)
 * @param {Object} params - SVG parameters
 * @returns {string} Safe SVG HTML
 */
export function createSafeSvgHtml(params) {
  const { d, fill, stroke, strokeWidth = 1.6, veinPath, veinStroke, rotation = 0, scale = 1 } = params;
  
  // Validate numeric values
  const safeRotation = isFinite(rotation) ? Math.max(-360, Math.min(360, rotation)) : 0;
  const safeScale = isFinite(scale) ? Math.max(0.1, Math.min(3, scale)) : 1;
  const safeStrokeWidth = isFinite(strokeWidth) ? Math.max(0.1, Math.min(10, strokeWidth)) : 1.6;
  
  // Validate colors (must be hex or named colors)
  const colorRegex = /^(#[0-9a-fA-F]{3,6}|[a-zA-Z]+)$/;
  const safeFill = colorRegex.test(fill) ? fill : '#10b981';
  const safeStroke = colorRegex.test(stroke) ? stroke : '#059669';
  const safeVeinStroke = colorRegex.test(veinStroke) ? veinStroke : '#047857';
  
  // Only allow specific SVG path commands for security
  const pathRegex = /^[MLHVCSQTAZmlhvcsqtaz0-9\s,.-]+$/;
  const safeD = pathRegex.test(d) ? d : 'M0,0';
  const safeVeinPath = pathRegex.test(veinPath) ? veinPath : '';
  
  return `
    <svg viewBox="-40 -40 80 80" xmlns="http://www.w3.org/2000/svg">
      <g transform="rotate(${safeRotation}) scale(${safeScale})">
        <path d="${safeD}" fill="${safeFill}" stroke="${safeStroke}" stroke-width="${safeStrokeWidth}" vector-effect="non-scaling-stroke"></path>
        ${safeVeinPath ? `<path d="${safeVeinPath}" fill="none" stroke="${safeVeinStroke}" stroke-width="1" vector-effect="non-scaling-stroke"></path>` : ''}
      </g>
    </svg>`;
}

/**
 * Rate limiting for preventing spam attacks
 */
class RateLimiter {
  constructor(maxRequests = 10, timeWindow = 60000) { // 10 requests per minute
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindow;
    this.requests = new Map();
  }
  
  isAllowed(identifier) {
    const now = Date.now();
    const userRequests = this.requests.get(identifier) || [];
    
    // Remove old requests outside time window
    const validRequests = userRequests.filter(time => now - time < this.timeWindow);
    
    if (validRequests.length >= this.maxRequests) {
      return false;
    }
    
    // Add current request
    validRequests.push(now);
    this.requests.set(identifier, validRequests);
    
    return true;
  }
}

export const leafMessageLimiter = new RateLimiter(5, 60000); // 5 messages per minute
export const authLimiter = new RateLimiter(3, 300000); // 3 auth attempts per 5 minutes