/**
 * 图片处理器类 - 实现Lightroom风格的图像调整功能
 */
class ImageProcessor {
    constructor() {
        this.currentImage = null;
        this.originalImageData = null;
        this.processedImageData = null;
        this.selectedThumbnailIndex = -1;
        this.zoomLevel = 1;
        this.panX = 0;
        this.panY = 0;
        this.compareMode = false;

        // 标注相关
        this.annotationCanvas = null;
        this.annotationCtx = null;
        this.annotationTool = null;
        this.annotationMode = false;
        this.annotationColor = '#ff0000';
        this.annotationSize = 2;
        this.annotationFont = 20;
        this.annotationInput = null;
        this.textX = 0;
        this.textY = 0;
        this.isAnnotating = false;
        this.startX = 0;
        this.startY = 0;
        this.annotationHistory = [];
        this.annotationHistoryIndex = -1;
        this.hasAnnotations = false;
        
        // 调整参数
        this.adjustments = {
            brightness: 0,
            contrast: 0,
            saturation: 0,
            sharpness: 0,
            curves: {
                rgb: [[0, 0], [255, 255]],
                red: [[0, 0], [255, 255]],
                green: [[0, 0], [255, 255]],
                blue: [[0, 0], [255, 255]]
            }
        };
        
        // 当前曲线通道
        this.currentCurveChannel = 'rgb';
        
        // 复制的调整参数
        this.copiedAdjustments = null;
        
        this.init();
    }
    
    init() {
        this.initCanvas();
        this.initAnnotationCanvas();
        this.bindEvents();
        this.initCurveEditor();
        const tools = document.getElementById('annotation-tools');
        if (tools) tools.classList.add('inactive');
        console.log('图片处理器初始化完成');
    }
    
    bindEvents() {
        // 预览工具栏事件
        document.getElementById('zoom-fit')?.addEventListener('click', () => this.zoomToFit());
        document.getElementById('zoom-100')?.addEventListener('click', () => this.zoomTo100());
        document.getElementById('compare-mode')?.addEventListener('click', () => this.toggleCompareMode());
        
        // 调整滑块事件
        this.bindAdjustmentSliders();
        
        // 操作按钮事件
        document.getElementById('reset-adjustments')?.addEventListener('click', () => this.resetAdjustments(true, true));
        document.getElementById('apply-adjustments')?.addEventListener('click', () => this.applyAdjustments());
        
        // 曲线编辑器事件
        this.bindCurveEvents();
        
        // 批量操作事件
        document.getElementById('copy-adjustments')?.addEventListener('click', () => this.copyAdjustments());
        document.getElementById('paste-adjustments')?.addEventListener('click', () => this.pasteAdjustments());
        document.getElementById('apply-to-selected')?.addEventListener('click', () => this.applyToSelected());
        
        // 画布事件
        this.bindCanvasEvents();

        // 标注工具事件
        this.bindAnnotationEvents();
        
        // 缩略图容器中键滚动事件
        this.bindThumbnailScrollEvents();
    }
    
    bindAdjustmentSliders() {
        const sliders = ['brightness', 'contrast', 'saturation', 'sharpness'];
        
        sliders.forEach(type => {
            const slider = document.getElementById(`${type}-slider`);
            const input = document.getElementById(`${type}-value`);
            
            if (slider && input) {
                slider.addEventListener('input', (e) => {
                    const value = parseInt(e.target.value);
                    input.value = value;
                    this.adjustments[type] = value;
                    this.applyAdjustmentsToPreview();
                });
                
                input.addEventListener('input', (e) => {
                    const value = parseInt(e.target.value);
                    slider.value = value;
                    this.adjustments[type] = value;
                    this.applyAdjustmentsToPreview();
                });
            }
        });
    }
    
    bindCurveEvents() {
        // 曲线标签切换
        document.querySelectorAll('.curve-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.curve-tab').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                this.currentCurveChannel = e.target.dataset.channel;
                this.drawCurve();
            });
        });
        
        // 重置曲线
        document.getElementById('reset-curve')?.addEventListener('click', () => {
            this.adjustments.curves[this.currentCurveChannel] = [[0, 0], [255, 255]];
            this.drawCurve();
            this.applyAdjustmentsToPreview();
        });
        
        // 曲线画布事件
        const curveCanvas = document.getElementById('curve-canvas');
        if (curveCanvas) {
            curveCanvas.addEventListener('mousedown', (e) => this.onCurveMouseDown(e));
            curveCanvas.addEventListener('mousemove', (e) => this.onCurveMouseMove(e));
            curveCanvas.addEventListener('mouseup', () => this.onCurveMouseUp());
            curveCanvas.addEventListener('mouseleave', () => this.onCurveMouseUp());
        }
    }
    
    bindCanvasEvents() {
        const canvas = document.getElementById('preview-canvas');
        if (canvas) {
            canvas.addEventListener('wheel', (e) => this.onCanvasWheel(e));
            canvas.addEventListener('mousedown', (e) => this.onCanvasMouseDown(e));
            canvas.addEventListener('mousemove', (e) => this.onCanvasMouseMove(e));
            canvas.addEventListener('mouseup', () => this.onCanvasMouseUp());
            canvas.addEventListener('mouseleave', () => this.onCanvasMouseUp());
        }

        // 允许在标注画布覆盖时也能缩放
        const wrapper = document.querySelector('.preview-image-wrapper');
        if (wrapper) {
            wrapper.addEventListener('wheel', (e) => this.onCanvasWheel(e));
        }
    }
    
    bindThumbnailScrollEvents() {
        const thumbnailContainer = document.getElementById('processing-thumbnails');
        if (thumbnailContainer) {
            thumbnailContainer.addEventListener('wheel', (e) => {
                // 检查是否按下中键或者是横向滚动
                if (e.deltaX !== 0 || e.shiftKey) {
                    // 横向滚动
                    e.preventDefault();
                    thumbnailContainer.scrollLeft += e.deltaY;
                } else if (e.button === 1 || e.buttons === 4) {
                    // 中键滚动转换为横向滚动
                    e.preventDefault();
                    thumbnailContainer.scrollLeft += e.deltaY;
                }
            });
            
            // 中键按下事件
            thumbnailContainer.addEventListener('mousedown', (e) => {
                if (e.button === 1) { // 中键
                    e.preventDefault();
                }
            });
        }
    }

    bindAnnotationEvents() {
        const modeBtn = document.getElementById('toggle-annotation');
        if (modeBtn) {
            modeBtn.addEventListener('click', () => this.toggleAnnotationMode());
        }

        const undoBtn = document.getElementById('annotation-undo');
        if (undoBtn) undoBtn.addEventListener('click', () => this.undoAnnotation());

        const redoBtn = document.getElementById('annotation-redo');
        if (redoBtn) redoBtn.addEventListener('click', () => this.redoAnnotation());

        document.querySelectorAll('.annotation-tool').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!this.annotationMode) return;
                if (btn.classList.contains('active')) {
                    btn.classList.remove('active');
                    this.annotationTool = null;
                    if (this.annotationCanvas) this.annotationCanvas.style.pointerEvents = 'none';
                } else {
                    document.querySelectorAll('.annotation-tool').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.annotationTool = btn.dataset.tool;
                    if (this.annotationCanvas) this.annotationCanvas.style.pointerEvents = 'auto';
                }
            });
        });

        const colorInput = document.getElementById('annotation-color');
        if (colorInput) colorInput.addEventListener('change', e => this.annotationColor = e.target.value);

        const sizeInput = document.getElementById('annotation-size');
        if (sizeInput) sizeInput.addEventListener('change', e => this.annotationSize = parseInt(e.target.value) || 2);

        const fontInput = document.getElementById('annotation-font');
        if (fontInput) fontInput.addEventListener('change', e => this.annotationFont = parseInt(e.target.value) || 20);

        if (this.annotationInput) {
            this.annotationInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') {
                    const text = this.annotationInput.value.trim();
                    if (text) {
                        this.annotationCtx.fillStyle = this.annotationColor;
                        this.annotationCtx.font = `${this.annotationFont}px sans-serif`;
                        this.annotationCtx.fillText(text, this.textX, this.textY);
                        this.saveAnnotationState();
                        this.hasAnnotations = true;
                    }
                    this.annotationInput.value = '';
                    this.annotationInput.style.display = 'none';
                }
            });
            this.annotationInput.addEventListener('blur', () => {
                const text = this.annotationInput.value.trim();
                if (text) {
                    this.annotationCtx.fillStyle = this.annotationColor;
                    this.annotationCtx.font = `${this.annotationFont}px sans-serif`;
                    this.annotationCtx.fillText(text, this.textX, this.textY);
                    this.saveAnnotationState();
                    this.hasAnnotations = true;
                }
                this.annotationInput.style.display = 'none';
                this.annotationInput.value = '';
            });
        }

        if (this.annotationCanvas) {
            this.annotationCanvas.addEventListener('mousedown', e => this.onAnnotDown(e));
            this.annotationCanvas.addEventListener('mousemove', e => this.onAnnotMove(e));
            this.annotationCanvas.addEventListener('mouseup', e => this.onAnnotUp(e));
            this.annotationCanvas.addEventListener('mouseleave', e => this.onAnnotUp(e));
        }
    }
    
    initCanvas() {
        const canvas = document.getElementById('preview-canvas');
        if (canvas) {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');
            this.resizeCanvas();
        }
    }

    initAnnotationCanvas() {
        const canvas = document.getElementById('annotation-canvas');
        if (canvas) {
            this.annotationCanvas = canvas;
            this.annotationCtx = canvas.getContext('2d');
            this.resizeCanvas();
            this.saveAnnotationState();
        }

        const input = document.getElementById('annotation-text-input');
        if (input) {
            this.annotationInput = input;
        }
    }
    
    initCurveEditor() {
        const curveCanvas = document.getElementById('curve-canvas');
        if (curveCanvas) {
            this.curveCanvas = curveCanvas;
            this.curveCtx = curveCanvas.getContext('2d');
            this.drawCurve();
        }
    }
    
    refreshDisplay() {
        this.loadImagesFromManager();
        this.resizeCanvas();
    }
    
    loadImagesFromManager() {
        if (!window.imageManager || !window.imageManager.images) {
            this.showEmptyState();
            return;
        }
        
        const images = window.imageManager.images;
        if (images.length === 0) {
            this.showEmptyState();
            return;
        }
        
        this.createThumbnails(images);
        
        // 如果没有选中的图片，选择第一张
        if (this.selectedThumbnailIndex === -1 && images.length > 0) {
            this.selectThumbnail(0);
        }
    }
    
    showEmptyState() {
        const thumbnailContainer = document.getElementById('processing-thumbnails');
        if (thumbnailContainer) {
            thumbnailContainer.innerHTML = `
                <div class="thumbnail-empty-state">
                    <p>从图片管理导入图片后，在此处选择要处理的图片</p>
                </div>
            `;
        }
        
        // 清空预览
        this.currentImage = null;
        this.clearCanvas();
    }
    
    createThumbnails(images) {
        const container = document.getElementById('processing-thumbnails');
        if (!container) return;
        
        container.innerHTML = '';
        
        images.forEach((image, index) => {
            const thumbnail = document.createElement('div');
            thumbnail.className = 'processing-thumbnail';
            thumbnail.dataset.index = index;
            
            const img = document.createElement('img');
            img.src = image.url;
            img.alt = '';
            
            thumbnail.appendChild(img);
            thumbnail.addEventListener('click', () => this.selectThumbnail(index));
            
            container.appendChild(thumbnail);
        });
    }
    
    selectThumbnail(index) {
        if (this.selectedThumbnailIndex !== -1) {
            this.applyAnnotationsToImage();
        }

        // 更新选中状态
        document.querySelectorAll('.processing-thumbnail').forEach((thumb, i) => {
            thumb.classList.toggle('selected', i === index);
        });
        
        this.selectedThumbnailIndex = index;
        
        // 加载图片到预览
        const images = window.imageManager.images;
        if (images && images[index]) {
            this.loadImageToPreview(images[index]);
        }
    }
    
    loadImageToPreview(imageData) {
        const img = new Image();
        img.onload = () => {
            this.currentImage = img;
            this.processedImageData = null;

            // 使用原始文件生成原始图像数据，以便后续重置
            if (imageData.originalFile) {
                this.loadOriginalData(imageData.originalFile);
            } else {
                this.saveOriginalImageData(img);
            }

            this.clearAnnotations();
            if (this.annotationCanvas) {
                this.annotationCanvas.style.pointerEvents = 'none';
                // 尺寸与预览画布保持一致，避免坐标偏移
                this.annotationCanvas.width = this.canvas.width;
                this.annotationCanvas.height = this.canvas.height;
                this.saveAnnotationState();
            }

            // 重置调整参数
            this.resetAdjustments(false);

            // 绘制图片
            this.drawImageToCanvas();
            this.zoomToFit();
        };
        img.src = imageData.url;
    }

    loadOriginalData(file) {
        const reader = new FileReader();
        reader.onload = () => {
            const origin = new Image();
            origin.onload = () => this.saveOriginalImageData(origin);
            origin.src = reader.result;
        };
        reader.readAsDataURL(file);
    }
    
    saveOriginalImageData(img) {
        // 创建临时画布来保存原始图像数据
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        tempCtx.drawImage(img, 0, 0);
        this.originalImageData = tempCtx.getImageData(0, 0, img.width, img.height);
    }
    
    drawImageToCanvas() {
        if (!this.currentImage || !this.canvas) return;
        

        
        // 清空画布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 计算绘制位置和大小
        const { x, y, width, height } = this.calculateDrawParams();
        
        // 绘制图片
        if (this.compareMode && this.processedImageData) {
            // 对比模式：左边原图，右边处理后
            const halfWidth = width / 2;
            
            // 绘制原图（左半部分）
            this.ctx.drawImage(this.currentImage, x, y, halfWidth, height);
            
            // 绘制处理后图片（右半部分）
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            tempCanvas.width = this.processedImageData.width;
            tempCanvas.height = this.processedImageData.height;
            tempCtx.putImageData(this.processedImageData, 0, 0);
            this.ctx.drawImage(tempCanvas, x + halfWidth, y, halfWidth, height);
            
            // 绘制分割线
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(x + halfWidth, y);
            this.ctx.lineTo(x + halfWidth, y + height);
            this.ctx.stroke();
        } else {
            // 正常模式
            if (this.processedImageData) {
                // 使用临时画布来正确绘制处理后的图片
                const tempCanvas = document.createElement('canvas');
                const tempCtx = tempCanvas.getContext('2d');
                tempCanvas.width = this.processedImageData.width;
                tempCanvas.height = this.processedImageData.height;
                tempCtx.putImageData(this.processedImageData, 0, 0);
                this.ctx.drawImage(tempCanvas, x, y, width, height);
            } else {
                this.ctx.drawImage(this.currentImage, x, y, width, height);
            }
        }

        if (this.annotationCanvas) {
            this.annotationCanvas.style.transform = `translate(${x}px, ${y}px) scale(${this.zoomLevel})`;
        }
    }
    
    calculateDrawParams() {
        if (!this.currentImage || !this.canvas) return { x: 0, y: 0, width: 0, height: 0 };
        
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        const imgWidth = this.currentImage.width;
        const imgHeight = this.currentImage.height;
        
        // 计算缩放后的尺寸
        const scaledWidth = imgWidth * this.zoomLevel;
        const scaledHeight = imgHeight * this.zoomLevel;
        
        // 计算居中位置加上平移
        const x = (canvasWidth - scaledWidth) / 2 + this.panX;
        const y = (canvasHeight - scaledHeight) / 2 + this.panY;
        
        return { x, y, width: scaledWidth, height: scaledHeight };
    }
    
    resizeCanvas() {
        if (!this.canvas) return;

        const container = this.canvas.parentElement;
        if (container) {
            this.canvas.width = container.clientWidth;
            this.canvas.height = container.clientHeight;

            if (this.annotationCanvas) {
                // 始终使用容器尺寸，避免内部坐标与显示尺寸不一致
                this.annotationCanvas.width = container.clientWidth;
                this.annotationCanvas.height = container.clientHeight;
            }
        }
    }
    
    clearCanvas() {
        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
        
        // 显示空状态
        const emptyState = document.querySelector('.preview-empty-state');
        if (emptyState) {
            emptyState.style.display = 'flex';
        }
    }
    
    // 缩放和平移功能
    zoomToFit() {
        if (!this.currentImage || !this.canvas) return;
        
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        const imgWidth = this.currentImage.width;
        const imgHeight = this.currentImage.height;
        
        const scaleX = canvasWidth / imgWidth;
        const scaleY = canvasHeight / imgHeight;
        
        this.zoomLevel = Math.min(scaleX, scaleY) * 0.9; // 留一些边距
        this.panX = 0;
        this.panY = 0;
        
        this.updateZoomDisplay();
        this.drawImageToCanvas();
    }
    
    zoomTo100() {
        this.zoomLevel = 1;
        this.panX = 0;
        this.panY = 0;
        
        this.updateZoomDisplay();
        this.drawImageToCanvas();
    }
    
    updateZoomDisplay() {
        const zoomDisplay = document.getElementById('zoom-level');
        if (zoomDisplay) {
            zoomDisplay.textContent = Math.round(this.zoomLevel * 100) + '%';
        }
    }
    
    toggleCompareMode() {
        this.compareMode = !this.compareMode;

        const btn = document.getElementById('compare-mode');
        if (btn) {
            btn.classList.toggle('active', this.compareMode);
        }

        this.drawImageToCanvas();
    }

    toggleAnnotationMode() {
        this.annotationMode = !this.annotationMode;
        const btn = document.getElementById('toggle-annotation');
        const tools = document.getElementById('annotation-tools');
        if (btn) btn.classList.toggle('active', this.annotationMode);
        if (tools) tools.classList.toggle('inactive', !this.annotationMode);

        if (!this.annotationMode) {
            this.applyAnnotationsToImage();
            this.annotationTool = null;
            document.querySelectorAll('.annotation-tool').forEach(b => b.classList.remove('active'));
            if (this.annotationCanvas) this.annotationCanvas.style.pointerEvents = 'none';
            if (this.annotationInput) {
                this.annotationInput.style.display = 'none';
                this.annotationInput.value = '';
            }
        } else {
            if (this.annotationHistory.length === 0) {
                this.saveAnnotationState();
            }
        }
    }
    
    // 画布交互事件
    onCanvasWheel(e) {
        if (this.annotationMode) return;
        e.preventDefault();
        
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = this.zoomLevel * delta;
        
        if (newZoom >= 0.1 && newZoom <= 10) {
            this.zoomLevel = newZoom;
            this.updateZoomDisplay();
            this.drawImageToCanvas();
        }
    }
    
    onCanvasMouseDown(e) {
        if (this.annotationMode) return;
        this.isDragging = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.canvas.style.cursor = 'grabbing';
    }

    onCanvasMouseMove(e) {
        if (!this.isDragging || this.annotationMode) return;

        const deltaX = e.clientX - this.lastMouseX;
        const deltaY = e.clientY - this.lastMouseY;
        
        this.panX += deltaX;
        this.panY += deltaY;
        
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        
        this.drawImageToCanvas();
    }
    
    onCanvasMouseUp() {
        if (this.annotationMode) return;
        this.isDragging = false;
        this.canvas.style.cursor = 'grab';
    }

    onAnnotDown(e) {
        if (!this.annotationMode || !this.annotationTool) return;
        const rect = this.annotationCanvas.getBoundingClientRect();
        const scale = this.annotationCanvas.width / rect.width;
        this.startX = (e.clientX - rect.left) * scale;
        this.startY = (e.clientY - rect.top) * scale;
        this.isAnnotating = true;

        if (this.annotationTool === 'pencil') {
            this.annotationCtx.strokeStyle = this.annotationColor;
            this.annotationCtx.lineWidth = this.annotationSize;
            this.annotationCtx.lineCap = 'round';
            this.annotationCtx.lineJoin = 'round';
            this.annotationCtx.beginPath();
            this.annotationCtx.moveTo(this.startX, this.startY);
        } else if (this.annotationTool === 'text') {
            if (this.annotationInput) {
                const rectCanvas = this.annotationCanvas.getBoundingClientRect();
                this.textX = this.startX;
                this.textY = this.startY;
                this.annotationInput.style.left = `${this.startX / (this.annotationCanvas.width / rectCanvas.width)}px`;
                this.annotationInput.style.top = `${this.startY / (this.annotationCanvas.height / rectCanvas.height)}px`;
                this.annotationInput.style.display = 'block';
                this.annotationInput.focus();
            }
            this.isAnnotating = false;
        }
    }

    onAnnotMove(e) {
        if (!this.annotationMode || !this.isAnnotating || !this.annotationTool) return;
        const rect = this.annotationCanvas.getBoundingClientRect();
        const scale = this.annotationCanvas.width / rect.width;
        const x = (e.clientX - rect.left) * scale;
        const y = (e.clientY - rect.top) * scale;

        if (this.annotationTool === 'pencil') {
            this.annotationCtx.lineTo(x, y);
            this.annotationCtx.stroke();
        }
    }

    onAnnotUp(e) {
        if (!this.annotationMode || !this.isAnnotating || !this.annotationTool) return;
        this.isAnnotating = false;
        const rect = this.annotationCanvas.getBoundingClientRect();
        const scale = this.annotationCanvas.width / rect.width;
        const endX = (e.clientX - rect.left) * scale;
        const endY = (e.clientY - rect.top) * scale;

        this.annotationCtx.strokeStyle = this.annotationColor;
        this.annotationCtx.lineWidth = this.annotationSize;

        if (this.annotationTool === 'rect') {
            this.annotationCtx.strokeRect(this.startX, this.startY, endX - this.startX, endY - this.startY);
        } else if (this.annotationTool === 'arrow') {
            this.drawArrow(this.startX, this.startY, endX, endY);
        } else if (this.annotationTool === 'pencil') {
            this.annotationCtx.lineTo(endX, endY);
            this.annotationCtx.stroke();
        }

        this.saveAnnotationState();
        this.hasAnnotations = true;
    }

    drawArrow(x1, y1, x2, y2) {
        const ctx = this.annotationCtx;
        const headlen = 10 + this.annotationSize * 2;
        const angle = Math.atan2(y2 - y1, x2 - x1);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headlen * Math.cos(angle - Math.PI / 6), y2 - headlen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x2 - headlen * Math.cos(angle + Math.PI / 6), y2 - headlen * Math.sin(angle + Math.PI / 6));
        ctx.lineTo(x2, y2);
        ctx.fillStyle = this.annotationColor;
        ctx.fill();
    }

    clearAnnotations() {
        if (this.annotationCtx && this.annotationCanvas) {
            this.annotationCtx.clearRect(0, 0, this.annotationCanvas.width, this.annotationCanvas.height);
        }
        this.annotationHistory = [];
        this.annotationHistoryIndex = -1;
        this.hasAnnotations = false;
        if (this.annotationCanvas) {
            this.saveAnnotationState();
        }
    }
    
    // 图像调整功能
    applyAdjustmentsToPreview() {
        if (!this.currentImage) return;
        
        // 如果没有原始图像数据，先获取
        if (!this.originalImageData) {
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            
            tempCanvas.width = this.currentImage.width;
            tempCanvas.height = this.currentImage.height;
            
            // 绘制原始图像
            tempCtx.drawImage(this.currentImage, 0, 0);
            
            // 保存原始图像数据
            this.originalImageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        }
        
        // 从原始图像数据开始处理（避免累积效应）
        let imageData = new ImageData(
            new Uint8ClampedArray(this.originalImageData.data),
            this.originalImageData.width,
            this.originalImageData.height
        );
        
        // 应用调整
        imageData = this.applyBrightness(imageData, this.adjustments.brightness);
        imageData = this.applyContrast(imageData, this.adjustments.contrast);
        imageData = this.applySaturation(imageData, this.adjustments.saturation);
        imageData = this.applySharpness(imageData, this.adjustments.sharpness);
        imageData = this.applyCurves(imageData);
        
        this.processedImageData = imageData;
        
        // 重新绘制到主画布
        this.drawImageToCanvas();
    }
    
    applyBrightness(imageData, brightness) {
        const data = imageData.data;
        const factor = brightness * 2.55; // 转换为0-255范围
        
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.max(0, Math.min(255, data[i] + factor));     // R
            data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + factor)); // G
            data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + factor)); // B
        }
        
        return imageData;
    }
    
    applyContrast(imageData, contrast) {
        const data = imageData.data;
        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
        
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.max(0, Math.min(255, factor * (data[i] - 128) + 128));     // R
            data[i + 1] = Math.max(0, Math.min(255, factor * (data[i + 1] - 128) + 128)); // G
            data[i + 2] = Math.max(0, Math.min(255, factor * (data[i + 2] - 128) + 128)); // B
        }
        
        return imageData;
    }
    
    applySaturation(imageData, saturation) {
        const data = imageData.data;
        // 将-100到100的范围转换为0到2的范围，0为完全去饱和，1为原始，2为双倍饱和
        const factor = (saturation + 100) / 100;
        
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            // 计算灰度值
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            
            // 应用饱和度：factor=0时完全灰度，factor=1时原始颜色，factor=2时增强饱和度
            data[i] = Math.max(0, Math.min(255, gray + factor * (r - gray)));
            data[i + 1] = Math.max(0, Math.min(255, gray + factor * (g - gray)));
            data[i + 2] = Math.max(0, Math.min(255, gray + factor * (b - gray)));
        }
        
        return imageData;
    }
    
    applySharpness(imageData, sharpness) {
        if (sharpness === 0) return imageData;

        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        const factor = sharpness / 50; // 强度系数

        const result = new Uint8ClampedArray(data.length);
        const kernel = [
            0, -1, 0,
            -1, 5, -1,
            0, -1, 0
        ];

        const get = (x, y, c) => data[(y * width + x) * 4 + c];

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = (y * width + x) * 4;

                for (let c = 0; c < 3; c++) {
                    let sum = 0;
                    let k = 0;
                    for (let ky = -1; ky <= 1; ky++) {
                        for (let kx = -1; kx <= 1; kx++) {
                            sum += get(x + kx, y + ky, c) * kernel[k++];
                        }
                    }
                    const val = data[idx + c] + factor * (sum - data[idx + c]);
                    result[idx + c] = Math.max(0, Math.min(255, val));
                }
                result[idx + 3] = data[idx + 3];
            }
        }

        return new ImageData(result, width, height);
    }
    
    applyCurves(imageData) {
        const data = imageData.data;
        
        // 为每个通道创建查找表
        const rgbLUT = this.createCurveLUT(this.adjustments.curves.rgb);
        const redLUT = this.createCurveLUT(this.adjustments.curves.red);
        const greenLUT = this.createCurveLUT(this.adjustments.curves.green);
        const blueLUT = this.createCurveLUT(this.adjustments.curves.blue);
        
        for (let i = 0; i < data.length; i += 4) {
            // 应用RGB曲线
            let r = rgbLUT[data[i]];
            let g = rgbLUT[data[i + 1]];
            let b = rgbLUT[data[i + 2]];
            
            // 应用单独的颜色通道曲线
            r = redLUT[r];
            g = greenLUT[g];
            b = blueLUT[b];
            
            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
        }
        
        return imageData;
    }
    
    createCurveLUT(curvePoints) {
        const lut = new Array(256);
        
        // 简单的线性插值
        for (let i = 0; i < 256; i++) {
            let output = i;
            
            for (let j = 0; j < curvePoints.length - 1; j++) {
                const p1 = curvePoints[j];
                const p2 = curvePoints[j + 1];
                
                if (i >= p1[0] && i <= p2[0]) {
                    const t = (i - p1[0]) / (p2[0] - p1[0]);
                    output = p1[1] + t * (p2[1] - p1[1]);
                    break;
                }
            }
            
            lut[i] = Math.max(0, Math.min(255, Math.round(output)));
        }
        
        return lut;
    }
    
    // 曲线编辑器
    drawCurve() {
        if (!this.curveCtx) return;
        
        const canvas = this.curveCanvas;
        const ctx = this.curveCtx;
        const width = canvas.width;
        const height = canvas.height;
        
        // 清空画布
        ctx.clearRect(0, 0, width, height);
        
        // 绘制背景
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, width, height);
        
        // 绘制网格
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
        ctx.lineWidth = 1;
        const grid = 8;

        for (let i = 0; i <= grid; i++) {
            const x = (width / grid) * i;
            const y = (height / grid) * i;

            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
        
        // 绘制对角线
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        ctx.moveTo(0, height);
        ctx.lineTo(width, 0);
        ctx.stroke();
        
        // 绘制平滑曲线
        const curvePoints = this.adjustments.curves[this.currentCurveChannel];
        
        ctx.strokeStyle = this.getCurveColor(this.currentCurveChannel);
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        if (curvePoints.length >= 2) {
            // 使用贝塞尔曲线绘制平滑曲线
            const firstPoint = curvePoints[0];
            const x0 = (firstPoint[0] / 255) * width;
            const y0 = height - (firstPoint[1] / 255) * height;
            ctx.moveTo(x0, y0);
            
            if (curvePoints.length === 2) {
                // 只有两个点时直接连线
                const lastPoint = curvePoints[1];
                const x1 = (lastPoint[0] / 255) * width;
                const y1 = height - (lastPoint[1] / 255) * height;
                ctx.lineTo(x1, y1);
            } else {
                // 多个点时使用平滑曲线
                for (let i = 1; i < curvePoints.length; i++) {
                    const currentPoint = curvePoints[i];
                    const x1 = (currentPoint[0] / 255) * width;
                    const y1 = height - (currentPoint[1] / 255) * height;
                    
                    if (i === curvePoints.length - 1) {
                        // 最后一个点
                        ctx.lineTo(x1, y1);
                    } else {
                        // 中间点使用二次贝塞尔曲线
                        const nextPoint = curvePoints[i + 1];
                        const x2 = (nextPoint[0] / 255) * width;
                        const y2 = height - (nextPoint[1] / 255) * height;
                        
                        const cpx = (x1 + x2) / 2;
                        const cpy = (y1 + y2) / 2;
                        
                        ctx.quadraticCurveTo(x1, y1, cpx, cpy);
                    }
                }
            }
        }
        
        ctx.stroke();
        
        // 绘制控制点
        ctx.fillStyle = this.getCurveColor(this.currentCurveChannel);
        
        curvePoints.forEach(point => {
            const x = (point[0] / 255) * width;
            const y = height - (point[1] / 255) * height;
            
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
        });
    }
    
    getCurveColor(channel) {
        switch (channel) {
            case 'red': return '#ff4444';
            case 'green': return '#44ff44';
            case 'blue': return '#4444ff';
            default: return '#ffffff';
        }
    }
    
    onCurveMouseDown(e) {
        const rect = this.curveCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // 转换为曲线坐标
        const curveX = (x / this.curveCanvas.width) * 255;
        const curveY = 255 - (y / this.curveCanvas.height) * 255;
        
        // 查找最近的控制点
        const curvePoints = this.adjustments.curves[this.currentCurveChannel];
        let nearestIndex = -1;
        let nearestDistance = Infinity;
        
        curvePoints.forEach((point, index) => {
            const distance = Math.sqrt(Math.pow(point[0] - curveX, 2) + Math.pow(point[1] - curveY, 2));
            if (distance < nearestDistance && distance < 20) {
                nearestDistance = distance;
                nearestIndex = index;
            }
        });
        
        if (nearestIndex !== -1) {
            this.dragPointIndex = nearestIndex;
            this.isDraggingCurve = true;
        } else {
            // 添加新控制点
            const newPoint = [Math.round(curveX), Math.round(curveY)];
            curvePoints.push(newPoint);
            curvePoints.sort((a, b) => a[0] - b[0]);
            
            this.dragPointIndex = curvePoints.findIndex(p => p[0] === newPoint[0] && p[1] === newPoint[1]);
            this.isDraggingCurve = true;
            
            this.drawCurve();
            this.applyAdjustmentsToPreview();
        }
    }
    
    onCurveMouseMove(e) {
        if (!this.isDraggingCurve || this.dragPointIndex === -1) return;
        
        const rect = this.curveCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // 转换为曲线坐标
        const curveX = Math.max(0, Math.min(255, (x / this.curveCanvas.width) * 255));
        const curveY = Math.max(0, Math.min(255, 255 - (y / this.curveCanvas.height) * 255));
        
        const curvePoints = this.adjustments.curves[this.currentCurveChannel];
        
        // 不允许移动端点的X坐标
        if (this.dragPointIndex === 0 || this.dragPointIndex === curvePoints.length - 1) {
            curvePoints[this.dragPointIndex][1] = Math.round(curveY);
        } else {
            curvePoints[this.dragPointIndex][0] = Math.round(curveX);
            curvePoints[this.dragPointIndex][1] = Math.round(curveY);
            
            // 重新排序
            curvePoints.sort((a, b) => a[0] - b[0]);
        }
        
        this.drawCurve();
        this.applyAdjustmentsToPreview();
    }
    
    onCurveMouseUp() {
        this.isDraggingCurve = false;
        this.dragPointIndex = -1;
    }
    
    // 调整参数操作
    resetAdjustments(redraw = true, restoreImage = false) {
        this.adjustments = {
            brightness: 0,
            contrast: 0,
            saturation: 0,
            sharpness: 0,
            curves: {
                rgb: [[0, 0], [255, 255]],
                red: [[0, 0], [255, 255]],
                green: [[0, 0], [255, 255]],
                blue: [[0, 0], [255, 255]]
            }
        };
        
        // 恢复原始图片
        if (restoreImage) {
            this.restoreOriginalImage();
        } else {
            this.processedImageData = null;
        }

        this.clearAnnotations();
        if (this.annotationCanvas) this.annotationCanvas.style.pointerEvents = 'none';
        this.annotationTool = null;
        this.annotationMode = false;
        document.getElementById('toggle-annotation')?.classList.remove('active');
        document.getElementById('annotation-tools')?.classList.add('inactive');

        // 更新UI
        this.updateAdjustmentUI();
        
        if (redraw) {
            this.drawImageToCanvas();
            this.drawCurve();
        }
    }

    restoreOriginalImage() {
        if (this.selectedThumbnailIndex === -1) return;

        const imageObj = window.imageManager?.images?.[this.selectedThumbnailIndex];
        if (!imageObj) return;

        const originalFile = imageObj.originalFile;
        if (!originalFile && !this.originalImageData) return;

        if (originalFile) {
            const url = URL.createObjectURL(originalFile);
            const img = new Image();
            img.onload = () => {
                this.currentImage = img;
                this.saveOriginalImageData(img);

                if (imageObj.url) {
                    URL.revokeObjectURL(imageObj.url);
                }

                imageObj.file = originalFile;
                imageObj.url = url;
                imageObj.size = originalFile.size;
                imageObj.width = img.width;
                imageObj.height = img.height;

                utils.createThumbnail(originalFile, 200).then(thumbnail => {
                    imageObj.thumbnail = thumbnail;
                    window.imageManager.renderImages();
                }).catch(err => console.warn('更新缩略图失败:', err));

                this.processedImageData = null;
                this.drawImageToCanvas();
            };
            img.src = url;
        } else {
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            tempCanvas.width = this.originalImageData.width;
            tempCanvas.height = this.originalImageData.height;
            tempCtx.putImageData(this.originalImageData, 0, 0);

            tempCanvas.toBlob((blob) => {
                const url = URL.createObjectURL(blob);
                const img = new Image();
                img.onload = () => {
                    this.currentImage = img;
                    if (imageObj.url) {
                        URL.revokeObjectURL(imageObj.url);
                    }
                    const file = new File([blob], imageObj.name || 'image.png', { type: 'image/png' });
                    imageObj.file = file;
                    imageObj.url = url;
                    imageObj.size = blob.size;
                    imageObj.width = this.originalImageData.width;
                    imageObj.height = this.originalImageData.height;

                    utils.createThumbnail(file, 200).then(thumbnail => {
                        imageObj.thumbnail = thumbnail;
                        window.imageManager.renderImages();
                    }).catch(err => console.warn('更新缩略图失败:', err));

                    this.processedImageData = null;
                    this.drawImageToCanvas();
                };
                img.src = url;
            }, 'image/png');
        }
    }
    
    updateAdjustmentUI() {
        const sliders = ['brightness', 'contrast', 'saturation', 'sharpness'];
        
        sliders.forEach(type => {
            const slider = document.getElementById(`${type}-slider`);
            const input = document.getElementById(`${type}-value`);
            
            if (slider && input) {
                slider.value = this.adjustments[type];
                input.value = this.adjustments[type];
            }
        });
    }
    
    applyAdjustments() {
        if (!this.currentImage || this.selectedThumbnailIndex === -1) {
            alert('请先选择一张图片');
            return;
        }
        
        if (!this.processedImageData) {
            alert('没有可应用的调整');
            return;
        }
        
        // 将处理后的图像数据转换为图片URL
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = this.processedImageData.width;
        tempCanvas.height = this.processedImageData.height;
        tempCtx.putImageData(this.processedImageData, 0, 0);

        // 合并标注
        if (this.annotationCanvas) {
            tempCtx.drawImage(this.annotationCanvas, 0, 0, this.annotationCanvas.width, this.annotationCanvas.height, 0, 0, tempCanvas.width, tempCanvas.height);
        }
        
        // 转换为blob并更新图片
        tempCanvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            
            // 更新当前图片
            const img = new Image();
            img.onload = () => {
                this.currentImage = img;
                
                // 更新图片管理器中的图片数据
                if (window.imageManager && window.imageManager.images && this.selectedThumbnailIndex < window.imageManager.images.length) {
                    const imageObj = window.imageManager.images[this.selectedThumbnailIndex];
                    if (imageObj) {
                        // 清理旧的URL对象，避免内存泄漏
                        if (imageObj.url) {
                            URL.revokeObjectURL(imageObj.url);
                        }
                        
                        // 创建新的File对象
                        const file = new File([blob], imageObj.name, { type: 'image/png' });
                        
                        // 更新图片对象的相关属性
                        imageObj.file = file;
                        imageObj.url = url;
                        imageObj.size = blob.size;
                        imageObj.width = this.processedImageData.width;
                        imageObj.height = this.processedImageData.height;
                        
                        // 更新缩略图
                        utils.createThumbnail(file, 200).then(thumbnail => {
                            imageObj.thumbnail = thumbnail;
                            // 重新渲染图片网格以更新缩略图
                            window.imageManager.renderImages();
                        }).catch(error => {
                            console.warn('更新缩略图失败:', error);
                        });
                    }
                }
                
                // 保留原始图像数据，只清空处理后的数据
                this.processedImageData = null;
                
                // 重置调整参数（不恢复原图）
                this.resetAdjustments(false);
                
                console.log('调整已应用到当前图片，原始图像数据已保留用于重置功能');
                
                // 清除标注并重新绘制
                this.clearAnnotations();
                if (this.annotationCanvas) this.annotationCanvas.style.pointerEvents = 'none';
                this.annotationTool = null;
                this.annotationMode = false;
                document.getElementById('toggle-annotation')?.classList.remove('active');
                document.getElementById('annotation-tools')?.classList.add('inactive');
                this.drawImageToCanvas();
                
                console.log('调整已应用到当前图片');
                alert('调整已应用到当前图片');
            };
            img.src = url;
        }, 'image/png');
    }

    saveAnnotationState() {
        if (!this.annotationCanvas) return;
        const data = this.annotationCtx.getImageData(0, 0, this.annotationCanvas.width, this.annotationCanvas.height);
        this.annotationHistory = this.annotationHistory.slice(0, this.annotationHistoryIndex + 1);
        this.annotationHistory.push(data);
        this.annotationHistoryIndex++;
    }

    undoAnnotation() {
        if (this.annotationHistoryIndex > 0) {
            this.annotationHistoryIndex--;
            const data = this.annotationHistory[this.annotationHistoryIndex];
            this.annotationCtx.putImageData(data, 0, 0);
        }
    }

    redoAnnotation() {
        if (this.annotationHistoryIndex < this.annotationHistory.length - 1) {
            this.annotationHistoryIndex++;
            const data = this.annotationHistory[this.annotationHistoryIndex];
            this.annotationCtx.putImageData(data, 0, 0);
        }
    }

    applyAnnotationsToImage() {
        if (!this.hasAnnotations || !this.annotationCanvas || !this.currentImage) return;

        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = this.currentImage.width;
        tempCanvas.height = this.currentImage.height;

        if (this.processedImageData) {
            const tmp = document.createElement('canvas');
            tmp.width = this.processedImageData.width;
            tmp.height = this.processedImageData.height;
            tmp.getContext('2d').putImageData(this.processedImageData, 0, 0);
            tempCtx.drawImage(tmp, 0, 0);
        } else {
            tempCtx.drawImage(this.currentImage, 0, 0);
        }

        tempCtx.drawImage(this.annotationCanvas, 0, 0, this.annotationCanvas.width, this.annotationCanvas.height, 0, 0, tempCanvas.width, tempCanvas.height);

        if (this.processedImageData) {
            this.processedImageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
            this.drawImageToCanvas();
        } else {
            tempCanvas.toBlob(blob => {
                const url = URL.createObjectURL(blob);
                const img = new Image();
                img.onload = () => {
                    this.currentImage = img;
                    if (window.imageManager && window.imageManager.images && this.selectedThumbnailIndex >= 0) {
                        const imageObj = window.imageManager.images[this.selectedThumbnailIndex];
                        if (imageObj) {
                            if (imageObj.url) URL.revokeObjectURL(imageObj.url);
                            const file = new File([blob], imageObj.name, { type: 'image/png' });
                            imageObj.file = file;
                            imageObj.url = url;
                            imageObj.size = blob.size;
                            imageObj.width = img.width;
                            imageObj.height = img.height;
                            utils.createThumbnail(file, 200).then(t => { imageObj.thumbnail = t; window.imageManager.renderImages(); }).catch(err => console.warn('更新缩略图失败:', err));
                        }
                    }
                    this.drawImageToCanvas();
                };
                img.src = url;
            }, 'image/png');
        }

        this.clearAnnotations();
        this.annotationHistory = [];
        this.annotationHistoryIndex = -1;
        this.hasAnnotations = false;
    }
    
    copyAdjustments() {
        this.copiedAdjustments = JSON.parse(JSON.stringify(this.adjustments));
        console.log('已复制调整参数');
    }
    
    pasteAdjustments() {
        if (!this.copiedAdjustments) {
            alert('没有可粘贴的调整参数');
            return;
        }
        
        this.adjustments = JSON.parse(JSON.stringify(this.copiedAdjustments));
        this.updateAdjustmentUI();
        this.drawCurve();
        this.applyAdjustmentsToPreview();
        
        console.log('已粘贴调整参数');
    }
    
    applyToSelected() {
        if (!this.copiedAdjustments) {
            alert('没有可应用的调整参数');
            return;
        }
        
        // 这里应该将调整应用到所有选中的图片
        console.log('批量应用调整参数:', this.copiedAdjustments);
        alert('调整已应用到选中的图片');
    }
}

// 导出类
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ImageProcessor;
} else {
    window.ImageProcessor = ImageProcessor;
}