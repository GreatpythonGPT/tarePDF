// 工具函数库

/**
 * 显示 Toast 通知
 * @param {string} message - 消息内容
 * @param {string} type - 类型: success, error, warning, info
 * @param {number} duration - 显示时长(毫秒)
 */
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const iconMap = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };
  
  const titleMap = {
    success: '成功',
    error: '错误',
    warning: '警告',
    info: '提示'
  };
  
  toast.innerHTML = `
    <div class="toast-icon">${iconMap[type]}</div>
    <div class="toast-content">
      <div class="toast-title">${titleMap[type]}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close">×</button>
  `;
  
  container.appendChild(toast);
  
  // 显示动画
  setTimeout(() => toast.classList.add('show'), 10);
  
  // 关闭按钮事件
  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', () => hideToast(toast));
  
  // 自动隐藏
  if (duration > 0) {
    setTimeout(() => hideToast(toast), duration);
  }
  
  return toast;
}

/**
 * 隐藏 Toast 通知
 * @param {HTMLElement} toast - Toast 元素
 */
function hideToast(toast) {
  toast.classList.add('hide');
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 300);
}

/**
 * 显示加载遮罩
 * @param {string} text - 加载文本
 */
function showLoading(text = '处理中...') {
  const overlay = document.getElementById('loading-overlay');
  const loadingText = document.getElementById('loading-text');
  loadingText.textContent = text;
  overlay.classList.add('show');
}

/**
 * 隐藏加载遮罩
 */
function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  overlay.classList.remove('show');
}

/**
 * 更新加载文本
 * @param {string} text - 新的加载文本
 */
function updateLoadingText(text) {
  const loadingText = document.getElementById('loading-text');
  if (loadingText) {
    loadingText.textContent = text;
  }
}

/**
 * 格式化文件大小
 * @param {number} bytes - 字节数
 * @returns {string} 格式化后的大小
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 获取图片尺寸信息
 * @param {File} file - 图片文件
 * @returns {Promise<{width: number, height: number}>}
 */
function getImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/**
 * 创建图片缩略图
 * @param {File} file - 图片文件
 * @param {number} maxSize - 最大尺寸
 * @returns {Promise<string>} Base64 数据URL
 */
function createThumbnail(file, maxSize = 200) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // 计算缩放比例
      const scale = Math.min(maxSize / img.width, maxSize / img.height);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      
      // 绘制缩略图
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/**
 * 防抖函数
 * @param {Function} func - 要防抖的函数
 * @param {number} wait - 等待时间
 * @returns {Function} 防抖后的函数
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * 节流函数
 * @param {Function} func - 要节流的函数
 * @param {number} limit - 时间限制
 * @returns {Function} 节流后的函数
 */
function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * 生成唯一ID
 * @returns {string} 唯一ID
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * 深拷贝对象
 * @param {any} obj - 要拷贝的对象
 * @returns {any} 拷贝后的对象
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  if (typeof obj === 'object') {
    const clonedObj = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = deepClone(obj[key]);
      }
    }
    return clonedObj;
  }
}

/**
 * 检查文件类型是否为图片
 * @param {File} file - 文件对象
 * @returns {boolean} 是否为图片
 */
function isImageFile(file) {
  const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp', 'image/webp'];
  return imageTypes.includes(file.type);
}

/**
 * 检查文件类型是否为PNG
 * @param {File} file - 文件对象
 * @returns {boolean} 是否为PNG
 */
function isPngFile(file) {
  return file.type === 'image/png';
}

/**
 * 获取文件扩展名
 * @param {string} filename - 文件名
 * @returns {string} 扩展名
 */
function getFileExtension(filename) {
  return filename.split('.').pop().toLowerCase();
}

/**
 * 格式化日期
 * @param {Date} date - 日期对象
 * @param {string} format - 格式字符串
 * @returns {string} 格式化后的日期
 */
function formatDate(date, format = 'YYYY-MM-DD HH:mm:ss') {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
}

/**
 * 计算两点之间的距离
 * @param {number} x1 - 点1的x坐标
 * @param {number} y1 - 点1的y坐标
 * @param {number} x2 - 点2的x坐标
 * @param {number} y2 - 点2的y坐标
 * @returns {number} 距离
 */
function getDistance(x1, y1, x2, y2) {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

/**
 * 检查点是否在矩形内
 * @param {number} x - 点的x坐标
 * @param {number} y - 点的y坐标
 * @param {DOMRect} rect - 矩形区域
 * @returns {boolean} 是否在矩形内
 */
function isPointInRect(x, y, rect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/**
 * 获取元素相对于页面的位置
 * @param {HTMLElement} element - DOM元素
 * @returns {DOMRect} 位置信息
 */
function getElementPosition(element) {
  return element.getBoundingClientRect();
}

/**
 * 平滑滚动到指定元素
 * @param {HTMLElement} element - 目标元素
 * @param {string} behavior - 滚动行为
 */
function scrollToElement(element, behavior = 'smooth') {
  element.scrollIntoView({ behavior, block: 'center' });
}

/**
 * 复制文本到剪贴板
 * @param {string} text - 要复制的文本
 * @returns {Promise<boolean>} 是否成功
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    // 降级方案
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textArea);
    return success;
  }
}

/**
 * 等待指定时间
 * @param {number} ms - 毫秒数
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 验证配置名称
 * @param {string} name - 配置名称
 * @returns {boolean} 是否有效
 */
function isValidConfigName(name) {
  return name && name.trim().length > 0 && name.trim().length <= 50;
}

/**
 * 安全的JSON解析
 * @param {string} jsonString - JSON字符串
 * @param {any} defaultValue - 默认值
 * @returns {any} 解析结果
 */
function safeJsonParse(jsonString, defaultValue = null) {
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    return defaultValue;
  }
}

/**
 * 安全的JSON字符串化
 * @param {any} obj - 要序列化的对象
 * @param {string} defaultValue - 默认值
 * @returns {string} JSON字符串
 */
function safeJsonStringify(obj, defaultValue = '{}') {
  try {
    return JSON.stringify(obj);
  } catch (e) {
    return defaultValue;
  }
}

// 导出所有工具函数
window.utils = {
  showToast,
  hideToast,
  showLoading,
  hideLoading,
  updateLoadingText,
  formatFileSize,
  getImageDimensions,
  createThumbnail,
  debounce,
  throttle,
  generateId,
  deepClone,
  isImageFile,
  isPngFile,
  getFileExtension,
  formatDate,
  getDistance,
  isPointInRect,
  getElementPosition,
  scrollToElement,
  copyToClipboard,
  sleep,
  isValidConfigName,
  safeJsonParse,
  safeJsonStringify
};