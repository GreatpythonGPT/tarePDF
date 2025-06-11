// 预加载脚本
console.log('预加载脚本开始执行...');
const { contextBridge, ipcRenderer } = require('electron');

console.log('正在暴露 electronAPI...');

// 暴露给渲染进程的API
contextBridge.exposeInMainWorld('electronAPI', {
  // 文件操作
  invoke: (channel, ...args) => {
    const validChannels = [
      'open-file-dialog',
      'select-watermark',
      'save-pdf-dialog',
      'save-pdf',
      'open-pdf',
      'read-file',
      'write-file',
      'store-set',
      'store-get',
      'store-delete',
      'store-get-all',
      'get-app-path',
      'get-system-fonts',
      'get-custom-fonts',
      'get-font-data',
      'get-settings',
      'save-settings',
      'export-settings',
      'import-settings',
      'get-file-info',
      'get-image-dimensions'
    ];
    
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    
    return Promise.reject(new Error(`不允许调用 ${channel}`));
  },
  
  // 监听主进程事件
  on: (channel, callback) => {
    const validChannels = [
      'app-ready',
      'settings-updated',
      'export-progress',
      'export-complete',
      'export-error',
      'menu-import-images',
      'menu-export-pdf',
      'menu-select-all',
      'menu-clear-selection'
    ];
    
    if (validChannels.includes(channel)) {
      const subscription = (event, ...args) => callback(...args);
      ipcRenderer.on(channel, subscription);
      
      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    }
  },
  
  // 发送事件到主进程
  send: (channel, ...args) => {
    const validChannels = [
      'app-ready',
      'export-pdf',
      'cancel-export',
      'log-event'
    ];
    
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, ...args);
    }
  },
  
  // 获取应用信息
  getAppInfo: () => {
    return {
      platform: process.platform,
      arch: process.arch,
      version: process.env.APP_VERSION || '1.0.0',
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      chromeVersion: process.versions.chrome
    };
  },
  
  // 获取系统临时目录
  getTempPath: () => {
    return ipcRenderer.invoke('get-temp-path');
  },
  
  // 获取应用数据目录
  getAppDataPath: () => {
    return ipcRenderer.invoke('get-app-data-path');
  },
  
  // 获取用户主目录
  getUserHomePath: () => {
    return ipcRenderer.invoke('get-user-home-path');
  }
});

// 暴露Node.js的path模块的部分功能
contextBridge.exposeInMainWorld('pathAPI', {
  basename: (filepath, ext) => path.basename(filepath, ext),
  dirname: (filepath) => path.dirname(filepath),
  extname: (filepath) => path.extname(filepath),
  join: (...paths) => path.join(...paths),
  parse: (filepath) => path.parse(filepath)
});

// 暴露一些安全的Node.js功能
contextBridge.exposeInMainWorld('nodeAPI', {
  // 检查文件是否存在
  fileExists: (filepath) => {
    try {
      return fs.existsSync(filepath);
    } catch (error) {
      console.error('检查文件存在失败:', error);
      return false;
    }
  },
  
  // 获取文件大小
  getFileSize: (filepath) => {
    try {
      const stats = fs.statSync(filepath);
      return stats.size;
    } catch (error) {
      console.error('获取文件大小失败:', error);
      return 0;
    }
  },
  
  // 获取文件修改时间
  getFileModifiedTime: (filepath) => {
    try {
      const stats = fs.statSync(filepath);
      return stats.mtime.getTime();
    } catch (error) {
      console.error('获取文件修改时间失败:', error);
      return 0;
    }
  }
});

// 暴露进程信息
contextBridge.exposeInMainWorld('process', {
  platform: process.platform,
  arch: process.arch,
  env: {
    NODE_ENV: process.env.NODE_ENV
  }
});

// 初始化完成
console.log('electronAPI 已成功暴露到 window 对象');
console.log('预加载脚本已执行');

// 通知主进程预加载完成
ipcRenderer.send('preload-ready');