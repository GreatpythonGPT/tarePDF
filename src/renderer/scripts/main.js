// 主渲染进程脚本

// 全局状态管理
const AppState = {
  currentTab: 'images',
  isInitialized: false,
  isDragging: false,
  dragData: null
};

// 应用初始化
class App {
  constructor() {
    this.init();
  }
  
  async init() {
    try {
      // 等待DOM加载完成
      if (document.readyState === 'loading') {
        await new Promise(resolve => {
          document.addEventListener('DOMContentLoaded', resolve);
        });
      }
      
      // 检查 electronAPI 是否可用
      console.log('检查 electronAPI 可用性:');
      console.log('window.electronAPI:', window.electronAPI);
      console.log('window.electronAPI.invoke:', window.electronAPI?.invoke);
      
      if (!window.electronAPI) {
        throw new Error('electronAPI 未暴露到渲染进程');
      }
      
      if (!window.electronAPI.invoke) {
        throw new Error('electronAPI.invoke 方法不存在');
      }
      
      console.log('electronAPI 检查通过');
      
      // 初始化各个模块
      await this.initializeModules();
      
      // 绑定事件
      this.bindEvents();
      
      // 设置初始状态
      this.setInitialState();

      // 初始匹配缩略图高度
      this.updateThumbnailHeight();
      
      // 标记为已初始化
      AppState.isInitialized = true;
      
      console.log('应用初始化完成');
      
    } catch (error) {
      console.error('应用初始化失败:', error);
      utils.showToast('应用初始化失败: ' + error.message, 'error');
    }
  }
  
  async initializeModules() {
    try {
      // 初始化工具模块
      window.utils = new Utils();
      
      // 初始化图片管理器
      this.imageManager = new ImageManager();
      window.imageManager = this.imageManager;
      
      // 初始化设置管理器
      this.settingsManager = new SettingsManager();
      window.settingsManager = this.settingsManager;
      
      // 初始化PDF生成器
      this.pdfGenerator = new PDFGenerator();
      window.pdfGenerator = this.pdfGenerator;
      
      console.log('所有模块初始化完成');
    } catch (error) {
      console.error('模块初始化失败:', error);
    }
  }
  
  initImageProcessor() {
    try {
      // 动态加载图片处理器
      if (typeof ImageProcessor !== 'undefined') {
        this.imageProcessor = new ImageProcessor();
        window.imageProcessor = this.imageProcessor;
        console.log('图片处理器初始化完成');
      } else {
        console.warn('ImageProcessor类未找到，将在需要时加载');
      }
    } catch (error) {
      console.error('图片处理器初始化失败:', error);
    }
  }
  
  bindEvents() {
    // 侧边栏导航
    this.bindNavigationEvents();
    
    // 工具栏按钮
    this.bindToolbarEvents();
    
    // 导出按钮
    this.bindExportEvents();
    
    // 全局键盘快捷键
    this.bindKeyboardShortcuts();
    
    // 窗口事件
    this.bindWindowEvents();
    
    // 拖拽事件
    this.bindDragEvents();
    
    // 快捷操作按钮
    this.bindQuickActionEvents();
  }
  
  bindNavigationEvents() {
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const tabId = item.dataset.tab;
        this.switchTab(tabId);
      });
    });
  }
  
  bindToolbarEvents() {
    // 工具栏事件由各自的模块管理，避免重复绑定
    // imageManager.js 负责图片管理工具栏
    // settingsManager.js 负责设置相关按钮
  }
  
  bindExportEvents() {
    // 导出事件由 pdfGenerator.js 负责，避免重复绑定
  }
  
  bindKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl+A - 全选
      if (e.ctrlKey && e.key === 'a' && AppState.currentTab === 'images') {
        e.preventDefault();
        window.imageManager.selectAll();
      }
      
      // Delete - 删除选中
      if (e.key === 'Delete' && AppState.currentTab === 'images') {
        window.imageManager.deleteSelected();
      }
      
      // Ctrl+D - 清空选择
      if (e.ctrlKey && e.key === 'd' && AppState.currentTab === 'images') {
        e.preventDefault();
        window.imageManager.clearSelection();
      }
      
      // Ctrl+I - 导入图片 (由菜单处理)
      // 移除重复的键盘事件绑定，避免与菜单事件冲突
      
      // Ctrl+E - 导出PDF (由菜单处理，避免重复)
      // Ctrl+P - 预览PDF (由菜单处理，避免重复)
      
      // Tab切换
      if (e.ctrlKey && e.key >= '1' && e.key <= '2') {
        e.preventDefault();
        const tabIndex = parseInt(e.key) - 1;
        const tabs = ['images', 'settings'];
        if (tabs[tabIndex]) {
          this.switchTab(tabs[tabIndex]);
        }
      }
      
      // Escape - 取消当前操作
      if (e.key === 'Escape') {
        this.cancelCurrentOperation();
      }
    });
  }
  
  bindWindowEvents() {
    // 窗口大小改变
    window.addEventListener('resize', utils.debounce(() => {
      this.handleWindowResize();
    }, 250));
    
    // 防止默认拖拽行为
    document.addEventListener('dragover', (e) => {
      e.preventDefault();
    });
    
    document.addEventListener('drop', (e) => {
      e.preventDefault();
      
      // 检查是否是图片排序拖拽（通过检查拖拽数据类型）
      const draggedImageId = e.dataTransfer.getData('text/plain');
      
      // 如果有拖拽的图片ID，说明是图片排序，不处理文件导入
      if (draggedImageId) {
        return;
      }
      
      // 如果是文件拖拽到窗口
      if (e.dataTransfer.files.length > 0) {
        const files = Array.from(e.dataTransfer.files);
        const imageFiles = files.filter(file => file.type.startsWith('image/'));
        
        if (imageFiles.length > 0) {
          window.imageManager.addFiles(imageFiles);
        }
      }
    });
    
    // 窗口失去焦点时保存状态
    window.addEventListener('blur', () => {
      this.saveAppState();
    });
    
    // 窗口关闭前保存状态
    window.addEventListener('beforeunload', () => {
      this.saveAppState();
    });
  }
  
  bindDragEvents() {
    // 全局拖拽状态管理
    document.addEventListener('dragstart', (e) => {
      AppState.isDragging = true;
    });
    
    document.addEventListener('dragend', (e) => {
      AppState.isDragging = false;
      AppState.dragData = null;
    });
  }
  
  bindQuickActionEvents() {
    // 生成PDF按钮
    const generatePdfBtn = document.getElementById('quick-generate-pdf');
    if (generatePdfBtn) {
      generatePdfBtn.addEventListener('click', () => {
        this.generatePDF();
      });
    }
  }
  
  async generatePDF() {
    try {
      // 检查是否有图片
      if (!window.imageManager || !window.imageManager.images || window.imageManager.images.length === 0) {
        utils.showToast('请先添加图片', 'warning');
        return;
      }

      await window.pdfGenerator.generatePDF();

    } catch (error) {
      console.error('生成PDF失败:', error);
      utils.showToast('生成PDF失败: ' + error.message, 'error');
    }
  }
  
  switchTab(tabName) {
    // 隐藏所有标签页内容
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.style.display = 'none';
    });
    
    // 移除所有导航项的激活状态
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // 显示目标标签页
    const targetTab = document.getElementById(`${tabName}-tab`);
    if (targetTab) {
        targetTab.style.display = 'block';
    }
    
    // 激活对应的导航项
    const targetNav = document.querySelector(`[data-tab="${tabName}"]`);
    if (targetNav) {
        targetNav.classList.add('active');
    }
    
    // 执行标签页切换后的操作
    this.onTabSwitch(tabName);
  }
  
  onTabSwitch(tabName) {
        // 更新当前标签页状态
        AppState.currentTab = tabName;
        
        switch(tabName) {
            case 'images':
                // 刷新图片显示
                if (this.imageManager) {
                    this.imageManager.refreshDisplay();
                }
                break;
            case 'settings':
                // 刷新设置显示
                if (this.settingsManager) {
                    this.settingsManager.refreshDisplay();
                }
                break;
            case 'processing':
                // 初始化图片处理页面
                if (this.imageProcessor) {
                    this.imageProcessor.refreshDisplay();
                } else {
                    this.initImageProcessor();
                }
                break;
        }
    }
  
  setInitialState() {
    // 设置默认标签页
    this.switchTab('images');
    
    // 加载保存的应用状态
    this.loadAppState();
    
    // 更新状态栏
    this.updateStatusBar();
    
    // 显示欢迎信息
    utils.showToast('欢迎使用多细胞设计PDF工具', 'info');
  }
  
  updateStatusBar() {
    const statusBar = document.querySelector('.status-bar');
    if (!statusBar) return;
    
    const imageCount = window.imageManager.getImageCount();
    const selectedCount = window.imageManager.getSelectedCount();
    
    let statusText = '';
    
    if (AppState.currentTab === 'images') {
      statusText = `共 ${imageCount} 张图片`;
      if (selectedCount > 0) {
        statusText += ` | 已选择 ${selectedCount} 张`;
      }
    } else if (AppState.currentTab === 'settings') {
      const pdfInfo = window.pdfGenerator.getPDFInfo();
      statusText = `预计生成 ${pdfInfo.totalPages} 页PDF`;
      if (pdfInfo.estimatedSize) {
        statusText += ` | 预计大小 ${pdfInfo.estimatedSize}`;
      }
    }
    
    statusBar.textContent = statusText;
  }

  updateThumbnailHeight() {
    const footer = document.querySelector('.sidebar-footer');
    const strip = document.querySelector('.thumbnail-strip');
    if (footer && strip) {
      const h = footer.offsetHeight;
      strip.style.setProperty('--thumbnail-height', `${h}px`);
    }
  }
  
  handleWindowResize() {
    // 重新计算布局
    if (AppState.currentTab === 'images') {
      window.imageManager.recalculateLayout();
    }

    if (this.imageProcessor) {
      this.imageProcessor.resizeCanvas();
    }

    this.updateThumbnailHeight();

    // 更新状态栏
    this.updateStatusBar();
  }
  
  cancelCurrentOperation() {
    // 取消拖拽操作
    if (AppState.isDragging) {
      window.imageManager.cancelDrag();
    }
    
    // 清除选择框
    window.imageManager.clearSelectionBox();
    
    // 隐藏上下文菜单
    const contextMenu = document.querySelector('.context-menu');
    if (contextMenu) {
      contextMenu.style.display = 'none';
    }
    
    // 隐藏加载状态
    utils.hideLoading();
  }
  
  saveAppState() {
    try {
      const state = {
        currentTab: AppState.currentTab,
        timestamp: Date.now()
      };
      
      localStorage.setItem('app-state', JSON.stringify(state));
    } catch (error) {
      console.warn('保存应用状态失败:', error);
    }
  }
  
  loadAppState() {
    try {
      const stateStr = localStorage.getItem('app-state');
      if (stateStr) {
        const state = JSON.parse(stateStr);
        
        // 检查状态是否过期（24小时）
        if (Date.now() - state.timestamp < 24 * 60 * 60 * 1000) {
          if (state.currentTab) {
            this.switchTab(state.currentTab);
          }
        }
      }
    } catch (error) {
      console.warn('加载应用状态失败:', error);
    }
  }
  
  // 获取应用信息
  getAppInfo() {
    return {
      version: '1.0.0',
      currentTab: AppState.currentTab,
      isInitialized: AppState.isInitialized,
      imageCount: window.imageManager.getImageCount(),
      selectedCount: window.imageManager.getSelectedCount(),
      settings: window.settingsManager.getSettings()
    };
  }
  
  // 重置应用
  async resetApp() {
    try {
      const confirmed = await this.showConfirmDialog('确定要重置应用吗？这将清除所有图片和设置。');
      if (!confirmed) return;
      
      // 清除图片
      window.imageManager.clearAll();
      
      // 重置设置
      window.settingsManager.resetSettings();
      
      // 切换到图片管理页
      this.switchTab('image-management');
      
      // 清除本地存储
      localStorage.removeItem('app-state');
      
      utils.showToast('应用已重置', 'success');
      
    } catch (error) {
      utils.showToast('重置应用失败: ' + error.message, 'error');
    }
  }
  
  // 显示确认对话框
  showConfirmDialog(message) {
    return new Promise((resolve) => {
      const result = confirm(message);
      resolve(result);
    });
  }
  
  // 显示关于对话框
  showAboutDialog() {
    const appInfo = this.getAppInfo();
    const message = `
多细胞设计PDF工具 v${appInfo.version}

专为设计师打造的渲染图PDF生成工具

功能特性：
• 一致宽度自适应浏览
• 多选拖拽快速排序
• 自定义水印和标题页
• 批量导出PDF

当前状态：
• 图片数量：${appInfo.imageCount}
• 已选择：${appInfo.selectedCount}
• 当前页面：${appInfo.currentTab === 'image-management' ? '图片管理' : '参数设置'}
    `;
    
    alert(message);
  }
}

// 错误处理
window.addEventListener('error', (e) => {
  console.error('全局错误:', e.error);
  utils.showToast('发生错误: ' + e.error.message, 'error');
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('未处理的Promise拒绝:', e.reason);
  utils.showToast('操作失败: ' + e.reason, 'error');
});

// 创建全局应用实例
window.app = new App();

// 导出应用状态供调试使用
window.AppState = AppState;

// 开发模式下的调试功能
if (window.process && window.process.env.NODE_ENV === 'development') {
  window.debug = {
    getAppInfo: () => window.app.getAppInfo(),
    resetApp: () => window.app.resetApp(),
    showAbout: () => window.app.showAboutDialog(),
    switchTab: (tabId) => window.app.switchTab(tabId),
    saveState: () => window.app.saveAppState(),
    loadState: () => window.app.loadAppState()
  };
  
  console.log('调试功能已启用，使用 window.debug 访问调试方法');
}