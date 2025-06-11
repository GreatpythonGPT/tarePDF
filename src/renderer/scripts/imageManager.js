// 图片管理器
class ImageManager {
  constructor() {
    this.images = [];
    this.selectedImages = new Set();
    this.draggedImages = new Set();
    this.isDragging = false;
    this.isSelecting = false;
    this.selectionStart = null;
    this.isImporting = false;
    
    this.init();
  }
  
  init() {
    this.bindEvents();
    this.updateStatus();
    this.updateWatermarkControlButtons();
  }
  
  bindEvents() {
    // 导入按钮
    document.getElementById('import-btn').addEventListener('click', (e) => {
      e.preventDefault();
      this.importImages();
    });
    
    // 批量操作按钮
    document.getElementById('select-all-btn').addEventListener('click', () => this.selectAll());
    document.getElementById('clear-selection-btn').addEventListener('click', () => this.clearSelection());
    document.getElementById('delete-selected-btn').addEventListener('click', () => this.deleteSelected());
    
    // 图片网格容器事件
    const grid = document.getElementById('images-grid');
    grid.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    grid.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    grid.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    grid.addEventListener('dragover', (e) => this.handleDragOver(e));
    grid.addEventListener('drop', (e) => this.handleDrop(e));
    
    // 键盘事件
    document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    
    // 剪贴板粘贴事件
    document.addEventListener('paste', (e) => this.handlePaste(e));
    
    // 菜单事件
    window.electronAPI?.on?.('menu-import-images', () => this.importImages());
    window.electronAPI?.on?.('menu-select-all', () => this.selectAll());
    window.electronAPI?.on?.('menu-clear-selection', () => this.clearSelection());
    
    // 水印控制按钮事件
    this.bindWatermarkControlEvents();
  }
  
  async handlePaste(e) {
    // 检查是否在图片管理模块中
    const currentTab = document.querySelector('.tab-content.active');
    if (!currentTab || currentTab.id !== 'images-tab') {
      return;
    }
    
    const clipboardItems = e.clipboardData.items;
    const imageFiles = [];
    
    // 遍历剪贴板项目，查找图片
    for (let i = 0; i < clipboardItems.length; i++) {
      const item = clipboardItems[i];
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (file) {
          imageFiles.push(file);
        }
      }
    }
    
    if (imageFiles.length === 0) {
      return;
    }
    
    e.preventDefault();
    
    try {
      utils.showLoading('正在从剪贴板导入图片...');
      
      let successCount = 0;
      for (const file of imageFiles) {
        try {
          await this.addFileObject(file);
          successCount++;
        } catch (error) {
          console.warn(`导入剪贴板图片失败:`, error);
        }
      }
      
      this.renderImages();
      this.updateStatus();
      
      utils.hideLoading();
      if (successCount > 0) {
        utils.showToast(`成功从剪贴板导入 ${successCount} 张图片`, 'success');
      } else {
        utils.showToast('剪贴板中没有有效的图片', 'warning');
      }
    } catch (error) {
      utils.hideLoading();
      utils.showToast('从剪贴板导入图片失败: ' + error.message, 'error');
    }
  }
  
  async importImages() {
    // 防重复调用
    if (this.isImporting) {
      return;
    }
    this.isImporting = true;
    
    try {
      if (!window.electronAPI || !window.electronAPI.invoke) {
        throw new Error('electronAPI 未初始化');
      }
      const result = await window.electronAPI.invoke('open-file-dialog');
      if (result.canceled || !result.filePaths.length) {
        this.isImporting = false;
        return;
      }
      
      utils.showLoading('正在导入图片...');
      
      for (const filePath of result.filePaths) {
        await this.addImage(filePath);
      }
      
      this.renderImages();
      this.updateStatus();
      
      utils.hideLoading();
      utils.showToast(`成功导入 ${result.filePaths.length} 张图片`, 'success');
    } catch (error) {
      utils.hideLoading();
      utils.showToast('导入图片失败: ' + error.message, 'error');
    } finally {
      this.isImporting = false;
    }
  }
  
  // 添加多个文件（用于拖拽）
  async addFiles(files) {
    try {
      utils.showLoading('正在导入图片...');
      
      let successCount = 0;
      for (const file of files) {
        try {
          await this.addFileObject(file);
          successCount++;
        } catch (error) {
          console.warn(`导入文件 ${file.name} 失败:`, error);
        }
      }
      
      this.renderImages();
      this.updateStatus();
      
      utils.hideLoading();
      if (successCount > 0) {
        utils.showToast(`成功导入 ${successCount} 张图片`, 'success');
      }
    } catch (error) {
      utils.hideLoading();
      utils.showToast('导入图片失败: ' + error.message, 'error');
    }
  }

  async addFileObject(file) {
    try {
      // 检查是否为图片
      if (!utils.isImageFile(file)) {
        throw new Error('不支持的文件格式');
      }
      
      // 获取图片尺寸
      const dimensions = await utils.getImageDimensions(file);
      
      // 创建缩略图
      const thumbnail = await utils.createThumbnail(file, 200);
      
      // 创建图片对象
      const image = {
        id: utils.generateId(),
        name: file.name,
        path: file.path || file.name,
        size: file.size,
        width: dimensions.width,
        height: dimensions.height,
        thumbnail: thumbnail,
        file: file,
        url: URL.createObjectURL(file),
        watermarks: {
          imageA: true,
          imageB: true,
          textA: true,
          textB: true
        }
      };
      
      this.images.push(image);
    } catch (error) {
      throw new Error(`处理文件 ${file.name} 失败: ${error.message}`);
    }
  }

  async addImage(filePath) {
    try {
      // 读取文件
      if (!window.electronAPI || !window.electronAPI.invoke) {
          throw new Error('electronAPI 未初始化');
        }
        const fileData = await window.electronAPI.invoke('read-file', filePath);
      const blob = new Blob([fileData]);
      const file = new File([blob], filePath.split('\\').pop(), { type: this.getMimeType(filePath) });
      
      // 检查是否为图片
      if (!utils.isImageFile(file)) {
        throw new Error('不支持的文件格式');
      }
      
      // 获取图片尺寸
      const dimensions = await utils.getImageDimensions(file);
      
      // 创建缩略图
      const thumbnail = await utils.createThumbnail(file, 200);
      
      // 创建图片对象
      const image = {
        id: utils.generateId(),
        name: file.name,
        path: filePath,
        size: file.size,
        width: dimensions.width,
        height: dimensions.height,
        thumbnail: thumbnail,
        file: file,
        url: URL.createObjectURL(file),
        watermarks: {
          imageA: true,
          imageB: true,
          textA: true,
          textB: true
        }
      };
      
      this.images.push(image);
      return image;
    } catch (error) {
      throw new Error(`处理图片 ${filePath} 失败: ${error.message}`);
    }
  }
  
  getMimeType(filePath) {
    const ext = utils.getFileExtension(filePath);
    const mimeTypes = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'bmp': 'image/bmp',
      'webp': 'image/webp'
    };
    return mimeTypes[ext] || 'image/jpeg';
  }
  
  renderImages() {
    const grid = document.getElementById('images-grid');
    
    if (this.images.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
            <rect x="8" y="12" width="48" height="36" rx="4" stroke="#D1D5DB" stroke-width="2" fill="none"/>
            <circle cx="20" cy="24" r="3" fill="#D1D5DB"/>
            <path d="M8 40l8-8 6 6 12-12 18 18v4a4 4 0 01-4 4H12a4 4 0 01-4-4v-8z" fill="#E5E7EB"/>
          </svg>
          <p>点击"导入图片"开始添加图片</p>
        </div>
      `;
      return;
    }
    
    grid.innerHTML = this.images.map((image, index) => `
      <div class="image-card" data-id="${image.id}" data-index="${index}" draggable="true">
        <div class="image-checkbox ${this.selectedImages.has(image.id) ? 'checked' : ''}"></div>
        <button class="image-delete">×</button>
        <div class="image-content">
          <div class="image-preview">
            <img src="${image.thumbnail}" alt="${image.name}" loading="lazy">
          </div>
          <div class="image-info">
            <div class="image-name" title="${image.name}">${image.name}</div>
            <div class="image-size">${image.width}×${image.height} • ${utils.formatFileSize(image.size)}</div>
            <div class="watermark-badges">
              ${image.watermarks?.imageA ? '<span class="watermark-badge watermark-badge-red active" title="图片水印A">A</span>' : ''}
              ${image.watermarks?.imageB ? '<span class="watermark-badge watermark-badge-yellow active" title="图片水印B">B</span>' : ''}
              ${image.watermarks?.textA ? '<span class="watermark-badge watermark-badge-blue active" title="文本水印C">C</span>' : ''}
              ${image.watermarks?.textB ? '<span class="watermark-badge watermark-badge-green active" title="文本水印D">D</span>' : ''}
            </div>
          </div>
        </div>
      </div>
    `).join('');
    
    // 绑定图片卡片事件
    this.bindImageEvents();
    
    // 更新水印控制按钮状态
    this.updateWatermarkControlButtons();
  }
  
  bindImageEvents() {
    const cards = document.querySelectorAll('.image-card');
    
    cards.forEach(card => {
      const id = card.dataset.id;
      const checkbox = card.querySelector('.image-checkbox');
      const deleteBtn = card.querySelector('.image-delete');
      
      // 点击选择
      card.addEventListener('click', (e) => {
        if (e.target === deleteBtn) return;
        this.toggleSelection(id, e.ctrlKey || e.metaKey, e.shiftKey);
      });
      
      // 复选框点击
      checkbox.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleSelection(id);
      });
      
      // 删除按钮
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteImage(id);
      });
      
      // 拖拽事件
      card.addEventListener('dragstart', (e) => this.handleDragStart(e, id));
      card.addEventListener('dragend', (e) => this.handleDragEnd(e));
      
      // 右键菜单
      card.addEventListener('contextmenu', (e) => this.showContextMenu(e, id));
      
      // 水印角标仅作为状态显示，不响应点击事件
    });
  }
  
  toggleSelection(id, multiSelect = false, rangeSelect = false) {
    const card = document.querySelector(`[data-id="${id}"]`);
    const checkbox = card.querySelector('.image-checkbox');
    
    if (rangeSelect && this.selectedImages.size > 0) {
      // 范围选择
      this.selectRange(id);
    } else if (multiSelect) {
      // 多选
      if (this.selectedImages.has(id)) {
        this.selectedImages.delete(id);
        card.classList.remove('selected');
        checkbox.classList.remove('checked');
      } else {
        this.selectedImages.add(id);
        card.classList.add('selected');
        checkbox.classList.add('checked');
      }
    } else {
      // 单选 - 支持取消选择
      if (this.selectedImages.has(id) && this.selectedImages.size === 1) {
        // 如果只选中了这一个图片，则取消选择
        this.selectedImages.delete(id);
        card.classList.remove('selected');
        checkbox.classList.remove('checked');
      } else {
        // 否则清空其他选择，选中当前图片
        this.clearSelection();
        this.selectedImages.add(id);
        card.classList.add('selected');
        checkbox.classList.add('checked');
      }
    }
    
    this.updateStatus();
  }
  
  selectRange(endId) {
    const startId = Array.from(this.selectedImages)[0];
    const startIndex = this.images.findIndex(img => img.id === startId);
    const endIndex = this.images.findIndex(img => img.id === endId);
    
    const minIndex = Math.min(startIndex, endIndex);
    const maxIndex = Math.max(startIndex, endIndex);
    
    for (let i = minIndex; i <= maxIndex; i++) {
      const image = this.images[i];
      this.selectedImages.add(image.id);
      const card = document.querySelector(`[data-id="${image.id}"]`);
      const checkbox = card.querySelector('.image-checkbox');
      card.classList.add('selected');
      checkbox.classList.add('checked');
    }
  }
  
  selectAll() {
    this.selectedImages.clear();
    this.images.forEach(image => {
      this.selectedImages.add(image.id);
    });
    this.updateSelectionUI();
    this.updateStatus();
    this.updateWatermarkControlButtons();
    utils.showToast(`已选择 ${this.images.length} 张图片`, 'info');
  }
  
  clearSelection() {
    this.selectedImages.clear();
    this.updateSelectionUI();
    this.updateStatus();
    this.updateWatermarkControlButtons();
  }
  
  updateSelectionUI() {
    const cards = document.querySelectorAll('.image-card');
    cards.forEach(card => {
      const id = card.dataset.id;
      const checkbox = card.querySelector('.image-checkbox');
      
      if (this.selectedImages.has(id)) {
        card.classList.add('selected');
        checkbox.classList.add('checked');
      } else {
        card.classList.remove('selected');
        checkbox.classList.remove('checked');
      }
    });
  }
  
  deleteSelected() {
    if (this.selectedImages.size === 0) {
      utils.showToast('请先选择要删除的图片', 'warning');
      return;
    }
    
    const count = this.selectedImages.size;
    
    // 清理选中图片的URL对象，避免内存泄漏
    this.images.forEach(image => {
      if (this.selectedImages.has(image.id) && image.url) {
        URL.revokeObjectURL(image.url);
      }
    });
    
    // 删除选中的图片
    this.images = this.images.filter(image => !this.selectedImages.has(image.id));
    this.selectedImages.clear();
    
    this.renderImages();
    this.updateStatus();
    
    utils.showToast(`已删除 ${count} 张图片`, 'success');
  }
  
  deleteImage(id) {
    const index = this.images.findIndex(image => image.id === id);
    if (index === -1) return;
    
    const image = this.images[index];
    // 清理URL对象，避免内存泄漏
    if (image.url) {
      URL.revokeObjectURL(image.url);
    }
    this.images.splice(index, 1);
    this.selectedImages.delete(id);
    
    this.renderImages();
    this.updateStatus();
    
    utils.showToast(`已删除图片: ${image.name}`, 'success');
  }
  
  // 拖拽相关方法
  handleDragStart(e, id) {
    this.isDragging = true;
    
    // 如果拖拽的图片未被选中，则选中它
    if (!this.selectedImages.has(id)) {
      this.clearSelection();
      this.toggleSelection(id);
    }
    
    // 设置拖拽数据
    this.draggedImages = new Set(this.selectedImages);
    
    // 设置拖拽效果
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    
    // 添加拖拽样式
    this.draggedImages.forEach(dragId => {
      const card = document.querySelector(`[data-id="${dragId}"]`);
      card.classList.add('dragging');
    });
  }
  
  handleDragEnd(e) {
    this.isDragging = false;
    
    // 移除拖拽样式
    document.querySelectorAll('.image-card.dragging').forEach(card => {
      card.classList.remove('dragging');
    });
    
    // 隐藏拖拽指示器
    this.hideDropIndicator();
    
    this.draggedImages.clear();
  }
  
  handleDragOver(e) {
    if (!this.isDragging) return;
    
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    // 显示拖拽指示器
    this.showDropIndicator(e);
  }
  
  handleDrop(e) {
    if (!this.isDragging) return;
    
    e.preventDefault();
    
    // 使用存储的目标索引
    if (this.dropTargetIndex !== undefined) {
      this.moveImages(this.dropTargetIndex);
    }
    
    this.hideDropIndicator();
    this.dropTargetIndex = undefined;
  }
  
  moveImages(targetIndex) {
    const draggedIds = Array.from(this.draggedImages);
    const draggedImages = this.images.filter(img => draggedIds.includes(img.id));
    
    if (draggedImages.length === 0) return;
    
    // 获取拖拽图片的原始索引
    const draggedIndices = draggedImages.map(img => this.images.indexOf(img)).sort((a, b) => a - b);
    const minDraggedIndex = draggedIndices[0];
    const maxDraggedIndex = draggedIndices[draggedIndices.length - 1];
    
    // 验证目标索引
    targetIndex = Math.max(0, Math.min(targetIndex, this.images.length));
    
    // 如果目标位置就在拖拽范围内且是连续选择，不需要移动
    if (draggedIndices.length === maxDraggedIndex - minDraggedIndex + 1 && 
        targetIndex >= minDraggedIndex && targetIndex <= maxDraggedIndex + 1) {
      return;
    }
    
    // 重新构建图片数组
    const newImages = [];
    let insertIndex = 0;
    
    // 遍历原始数组，在正确位置插入拖拽的图片
    for (let i = 0; i <= this.images.length; i++) {
      // 如果到达目标位置，插入拖拽的图片
      if (i === targetIndex) {
        newImages.push(...draggedImages);
      }
      
      // 添加非拖拽的图片
      if (i < this.images.length && !draggedIds.includes(this.images[i].id)) {
        newImages.push(this.images[i]);
      }
    }
    
    // 更新图片数组并重新渲染
    this.images = newImages;
    this.renderImages();
    
    utils.showToast(`已移动 ${draggedImages.length} 张图片`, 'success');
    
    // 保持选中状态
    this.selectedImages.clear();
    draggedImages.forEach(img => this.selectedImages.add(img.id));
    this.updateSelectionUI();
  }
  
  showDropIndicator(e) {
    const indicator = document.getElementById('drop-indicator');
    const grid = document.getElementById('images-grid');
    const cards = grid.querySelectorAll('.image-card:not(.dragging)');
    
    if (cards.length === 0) {
      indicator.classList.remove('show');
      this.dropTargetIndex = 0;
      return;
    }
    
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    const gridRect = grid.getBoundingClientRect();
    
    let targetIndex = 0;
    let indicatorX = gridRect.left;
    let indicatorY = gridRect.top;
    let indicatorHeight = 100;
    
    // 计算网格布局参数
    const gridStyle = window.getComputedStyle(grid);
    const gap = parseInt(gridStyle.gap) || 16;
    const columns = parseInt(gridStyle.gridTemplateColumns.split(' ').length) || 4;
    
    // 遍历所有卡片，找到最合适的插入位置
    let bestCard = null;
    let bestDistance = Infinity;
    let bestPosition = 'after';
    
    cards.forEach((card, index) => {
      const rect = card.getBoundingClientRect();
      const cardCenterX = rect.left + rect.width / 2;
      const cardCenterY = rect.top + rect.height / 2;
      
      // 计算鼠标到卡片中心的距离
      const distance = Math.sqrt(
        Math.pow(mouseX - cardCenterX, 2) + 
        Math.pow(mouseY - cardCenterY, 2)
      );
      
      if (distance < bestDistance) {
        bestDistance = distance;
        bestCard = card;
        // 获取卡片在原始数组中的真实索引
        const cardId = card.dataset.id;
        targetIndex = this.images.findIndex(img => img.id === cardId);
        
        // 更精确的位置判断
        const relativeX = mouseX - rect.left;
        const relativeY = mouseY - rect.top;
        
        // 如果鼠标在卡片左半部分，插入到前面
        if (relativeX < rect.width * 0.5) {
          bestPosition = 'before';
        } else {
          bestPosition = 'after';
        }
      }
    });
    
    if (bestCard) {
      const rect = bestCard.getBoundingClientRect();
      indicatorHeight = rect.height;
      indicatorY = rect.top;
      
      if (bestPosition === 'before') {
        indicatorX = rect.left - gap / 2 - 2;
        this.dropTargetIndex = targetIndex;
      } else {
        indicatorX = rect.right + gap / 2 - 2;
        this.dropTargetIndex = targetIndex + 1;
      }
      
      // 确保指示器在可见区域内
      indicatorX = Math.max(gridRect.left - 10, Math.min(indicatorX, gridRect.right + 10));
      
      indicator.style.left = indicatorX + 'px';
      indicator.style.top = indicatorY + 'px';
      indicator.style.height = indicatorHeight + 'px';
      indicator.classList.add('show');
    } else {
      // 如果没有找到合适的卡片，插入到末尾
      this.dropTargetIndex = this.images.length;
      indicator.classList.remove('show');
    }
  }
  
  hideDropIndicator() {
    const indicator = document.getElementById('drop-indicator');
    indicator.classList.remove('show');
  }
  
  // 框选功能
  handleMouseDown(e) {
    if (e.target.closest('.image-card') || e.button !== 0) return;
    
    this.isSelecting = true;
    this.selectionStart = { x: e.clientX, y: e.clientY };
    
    // 如果没有按住Ctrl，清空当前选择
    if (!e.ctrlKey && !e.metaKey) {
      this.clearSelection();
    }
    
    e.preventDefault();
  }
  
  handleMouseMove(e) {
    if (!this.isSelecting) return;
    
    // 更新选择框
    this.updateSelectionBox(e);
    
    // 检查哪些图片在选择框内
    this.updateSelectionFromBox();
  }
  
  handleMouseUp(e) {
    if (!this.isSelecting) return;
    
    this.isSelecting = false;
    this.hideSelectionBox();
    this.updateStatus();
  }
  
  updateSelectionBox(e) {
    if (!this.selectionStart) return;
    
    const grid = document.getElementById('images-grid');
    const gridRect = grid.getBoundingClientRect();
    
    const startX = this.selectionStart.x - gridRect.left;
    const startY = this.selectionStart.y - gridRect.top;
    const currentX = e.clientX - gridRect.left;
    const currentY = e.clientY - gridRect.top;
    
    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    
    let selectionBox = document.querySelector('.selection-box');
    if (!selectionBox) {
      selectionBox = document.createElement('div');
      selectionBox.className = 'selection-box';
      grid.appendChild(selectionBox);
    }
    
    selectionBox.style.left = left + 'px';
    selectionBox.style.top = top + 'px';
    selectionBox.style.width = width + 'px';
    selectionBox.style.height = height + 'px';
    selectionBox.classList.add('active');
  }
  
  updateSelectionFromBox() {
    const selectionBox = document.querySelector('.selection-box');
    if (!selectionBox) return;
    
    const boxRect = selectionBox.getBoundingClientRect();
    const cards = document.querySelectorAll('.image-card');
    
    cards.forEach(card => {
      const cardRect = card.getBoundingClientRect();
      const id = card.dataset.id;
      
      // 检查卡片是否与选择框相交
      const intersects = !(cardRect.right < boxRect.left || 
                          cardRect.left > boxRect.right || 
                          cardRect.bottom < boxRect.top || 
                          cardRect.top > boxRect.bottom);
      
      if (intersects) {
        this.selectedImages.add(id);
      }
    });
    
    this.updateSelectionUI();
  }
  
  hideSelectionBox() {
    const selectionBox = document.querySelector('.selection-box');
    if (selectionBox) {
      selectionBox.remove();
    }
  }
  
  // 右键菜单
  showContextMenu(e, id) {
    e.preventDefault();
    
    // 如果右键的图片未被选中，则选中它
    if (!this.selectedImages.has(id)) {
      this.clearSelection();
      this.toggleSelection(id);
    }
    
    const menu = this.createContextMenu();
    document.body.appendChild(menu);
    
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.classList.add('show');
    
    // 点击其他地方关闭菜单
    const closeMenu = (event) => {
      if (!menu.contains(event.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
    }, 0);
  }
  
  createContextMenu() {
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    
    const selectedCount = this.selectedImages.size;
    
    menu.innerHTML = `
      <div class="context-menu-item" data-action="select-all">
        <span>全选</span>
      </div>
      <div class="context-menu-item" data-action="clear-selection">
        <span>清空选择</span>
      </div>
      <div class="context-menu-separator"></div>
      <div class="context-menu-item danger" data-action="delete">
        <span>删除选中 (${selectedCount})</span>
      </div>
    `;
    
    // 绑定菜单项事件
    menu.addEventListener('click', (e) => {
      const action = e.target.closest('.context-menu-item')?.dataset.action;
      
      switch (action) {
        case 'select-all':
          this.selectAll();
          break;
        case 'clear-selection':
          this.clearSelection();
          break;
        case 'delete':
          this.deleteSelected();
          break;
      }
      
      menu.remove();
    });
    
    return menu;
  }
  
  // 键盘事件处理
  handleKeyDown(e) {
    // 只在图片管理页面处理键盘事件
    if (!document.getElementById('images-tab').classList.contains('active')) return;
    
    switch (e.key) {
      case 'Delete':
      case 'Backspace':
        if (this.selectedImages.size > 0) {
          this.deleteSelected();
        }
        break;
      case 'a':
      case 'A':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.selectAll();
        }
        break;
      case 'Escape':
        this.clearSelection();
        break;
    }
  }
  
  updateStatus() {
    const totalCount = document.getElementById('total-count');
    const selectedCount = document.getElementById('selected-count');
    
    totalCount.textContent = this.images.length;
    selectedCount.textContent = this.selectedImages.size;
    
    // 添加更新动画
    totalCount.classList.add('updating');
    selectedCount.classList.add('updating');
    
    setTimeout(() => {
      totalCount.classList.remove('updating');
      selectedCount.classList.remove('updating');
    }, 400);
  }
  
  // 获取选中的图片
  getSelectedImages() {
    return this.images.filter(image => this.selectedImages.has(image.id));
  }
  
  // 获取所有图片
  getAllImages() {
    return [...this.images];
  }
  
  // 获取图片数量
  getImageCount() {
    return this.images.length;
  }
  
  // 获取选中图片数量
  getSelectedCount() {
    return this.selectedImages.size;
  }
  
  // 清空所有图片
  clear() {
    // 清理所有图片的URL对象，避免内存泄漏
    this.images.forEach(image => {
      if (image.url) {
        URL.revokeObjectURL(image.url);
      }
    });
    
    this.images = [];
    this.selectedImages.clear();
    this.renderImages();
    this.updateStatus();
  }
  
  // 刷新显示
  refreshDisplay() {
    this.renderImages();
    this.updateStatus();
  }
  
  // 绑定水印控制按钮事件
  bindWatermarkControlEvents() {
    const controlA = document.getElementById('watermark-control-a');
    const controlB = document.getElementById('watermark-control-b');
    const controlC = document.getElementById('watermark-control-c');
    const controlD = document.getElementById('watermark-control-d');
    
    // 移除可能存在的旧事件监听器，防止重复绑定
    if (controlA) {
      controlA.replaceWith(controlA.cloneNode(true));
      const newControlA = document.getElementById('watermark-control-a');
      newControlA.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleWatermarkBatch('imageA');
      });
    }
    if (controlB) {
      controlB.replaceWith(controlB.cloneNode(true));
      const newControlB = document.getElementById('watermark-control-b');
      newControlB.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleWatermarkBatch('imageB');
      });
    }
    if (controlC) {
      controlC.replaceWith(controlC.cloneNode(true));
      const newControlC = document.getElementById('watermark-control-c');
      newControlC.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleWatermarkBatch('textA');
      });
    }
    if (controlD) {
      controlD.replaceWith(controlD.cloneNode(true));
      const newControlD = document.getElementById('watermark-control-d');
      newControlD.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleWatermarkBatch('textB');
      });
    }
  }
  
  // 批量切换水印状态
  toggleWatermarkBatch(watermarkType) {
    // 获取当前选中的图片，如果没有选中则操作所有图片
    const targetImages = this.selectedImages.size > 0 
      ? Array.from(this.selectedImages).map(id => this.images.find(img => img.id === id)).filter(Boolean)
      : this.images;
    
    if (targetImages.length === 0) {
      utils.showToast('没有可操作的图片', 'warning');
      return;
    }
    
    // 智能切换逻辑：如果部分有该水印，则全部添加；如果全部都有，则全部移除
    const hasWatermark = targetImages.filter(img => img.watermarks[watermarkType]);
    const shouldEnable = hasWatermark.length < targetImages.length;
    
    // 应用操作
    targetImages.forEach(image => {
      image.watermarks[watermarkType] = shouldEnable;
    });
    
    // 更新按钮状态
    this.updateWatermarkControlButtons();
    
    // 重新渲染图片网格
    this.renderImages();
    
    // 显示提示
    const watermarkNames = {
      imageA: '图片水印A',
      imageB: '图片水印B', 
      textA: '文本水印C',
      textB: '文本水印D'
    };
    
    const status = shouldEnable ? '启用' : '禁用';
    const scope = this.selectedImages.size > 0 ? `选中的${targetImages.length}张图片` : `全部${targetImages.length}张图片`;
    utils.showToast(`${scope}的${watermarkNames[watermarkType]} ${status}`);
  }
  
  // 更新水印控制按钮状态
  updateWatermarkControlButtons() {
    const targetImages = this.selectedImages.size > 0 
      ? Array.from(this.selectedImages).map(id => this.images.find(img => img.id === id)).filter(Boolean)
      : this.images;
    
    const watermarkTypes = ['imageA', 'imageB', 'textA', 'textB'];
    const controlIds = ['watermark-control-a', 'watermark-control-b', 'watermark-control-c', 'watermark-control-d'];
    
    watermarkTypes.forEach((type, index) => {
      const control = document.getElementById(controlIds[index]);
      if (!control) return;
      
      // 按钮始终显示
      control.style.display = 'flex';
      
      if (targetImages.length === 0) {
        // 没有图片时移除active状态
        control.classList.remove('active');
        return;
      }
      
      const hasWatermark = targetImages.filter(img => img.watermarks[type]);
      const allHave = hasWatermark.length === targetImages.length;
      
      // 根据是否所有目标图片都启用了该水印来设置active状态
      if (allHave) {
        control.classList.add('active');
      } else {
        control.classList.remove('active');
      }
    });
  }

  // 重新计算布局
  recalculateLayout() {
    // 重新渲染图片网格以适应新的窗口大小
    this.renderImages();
    this.updateStatus();
  }
}

// 创建全局图片管理器实例
window.imageManager = new ImageManager();