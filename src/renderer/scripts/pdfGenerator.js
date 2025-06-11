// PDF生成器 - 使用PDF-lib库
class PDFGenerator {
  constructor() {
    this.PDFLib = null;
    this.init();
  }
  
  async init() {
    // 动态加载PDF-lib库
    if (typeof window.PDFLib === 'undefined') {
      await this.loadPDFLib();
    }
    this.PDFLib = window.PDFLib;
    
    // 绑定导出按钮事件
    this.bindExportEvents();
  }
  
  bindExportEvents() {
    const generatePdfBtn = document.getElementById('export-pdf-btn');
    const previewPdfBtn = document.getElementById('preview-pdf-btn');
    
    if (generatePdfBtn) {
      generatePdfBtn.addEventListener('click', () => this.generatePDF());
    }
    
    if (previewPdfBtn) {
      previewPdfBtn.addEventListener('click', () => this.previewPDF());
    }
    
    // 菜单事件
    window.electronAPI?.on?.('menu-export-pdf', () => this.generatePDF());
  }
  
  async loadPDFLib() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';
      script.onload = () => {
        window.PDFLib = window.PDFLib || window.PDFDocument;
        resolve();
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  
  async generatePDF() {
    try {
      // 防止重复调用
      if (this.isGenerating) {
        return;
      }
      this.isGenerating = true;
      
      // 获取所有图片
      const allImages = window.imageManager.getAllImages();
      
      if (allImages.length === 0) {
        utils.showToast('没有图片可以导出', 'warning');
        this.isGenerating = false;
        return;
      }
      
      const settings = window.settingsManager.getSettings();
      
      // 验证设置
      if (!settings.outputWidth || settings.outputWidth <= 0) {
        utils.showToast('请设置有效的输出宽度', 'warning');
        this.isGenerating = false;
        return;
      }
      
      utils.showLoading('正在生成PDF...');
      
      // 确保PDF-lib已加载
      if (!this.PDFLib) {
        await this.loadPDFLib();
        this.PDFLib = window.PDFLib;
      }
      
      // 创建PDF文档
      const pdfDoc = await this.PDFLib.PDFDocument.create();
      
      // 添加标题页
      if (settings.title && settings.title.text) {
        utils.updateLoadingText('正在添加标题页...');
        await this.addTitlePage(pdfDoc, settings);
      }
      
      // 处理图片
      for (let i = 0; i < allImages.length; i++) {
        const image = allImages[i];
        utils.updateLoadingText(`正在处理图片 ${i + 1}/${allImages.length}...`);
        await this.addImagePage(pdfDoc, image, settings);
        
        // 添加分隔页（如果启用且不是最后一张图片）
        if (settings.separator && settings.separator.enabled && i < allImages.length - 1) {
          utils.updateLoadingText(`正在添加分隔页...`);
          await this.addSeparatorPage(pdfDoc, settings);
        }
        
        const progress = Math.round(((i + 1) / allImages.length) * 100);
        utils.updateLoadingText(`正在处理图片 ${i + 1}/${allImages.length} (${progress}%)`);
      }
      
      // 保存PDF
      utils.updateLoadingText('正在保存PDF...');
      const pdfBytes = await pdfDoc.save();
      await this.savePDFBytes(pdfBytes);
      
      utils.hideLoading();
      utils.showToast('PDF生成成功！', 'success');
      
    } catch (error) {
      utils.hideLoading();
      console.error('PDF生成失败:', error);
      utils.showToast('PDF生成失败: ' + error.message, 'error');
    } finally {
      this.isGenerating = false;
    }
  }
  
  async addTitlePage(pdfDoc, settings) {
    try {
      // 计算页面尺寸
      const pageWidth = settings.outputWidth;
      const pageHeight = 500; // 标题页固定高度
      
      // 添加页面
      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      
      // 设置背景色
      const backgroundColor = this.hexToRgb(settings.title.backgroundColor);
      page.drawRectangle({
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
        color: this.PDFLib.rgb(backgroundColor.r / 255, backgroundColor.g / 255, backgroundColor.b / 255)
      });
      
      // 检查文本是否包含中文字符
      const hasChinese = /[\u4e00-\u9fff]/.test(settings.title.text);
      
      if (!hasChinese) {
        // 只有英文时才绘制文本
        const font = await pdfDoc.embedFont(this.PDFLib.StandardFonts.Helvetica);
        
        // 绘制标题文本
        const textColor = this.hexToRgb(settings.title.color);
        const lines = settings.title.text.split('\n');
        const fontSize = settings.title.fontSize;
        const lineHeight = fontSize * 1.2;
        
        const totalTextHeight = lines.length * lineHeight;
        const startY = pageHeight - (pageHeight - totalTextHeight) / 2;
        
        lines.forEach((line, index) => {
          const textWidth = font.widthOfTextAtSize(line, fontSize);
          const x = (pageWidth - textWidth) / 2;
          const y = startY - (index * lineHeight);
          
          page.drawText(line, {
            x: x,
            y: y,
            size: fontSize,
            font: font,
            color: this.PDFLib.rgb(textColor.r / 255, textColor.g / 255, textColor.b / 255)
          });
        });
      } else {
        // 包含中文时，使用Canvas绘制文本并转换为图片
        await this.addChineseTextAsImage(pdfDoc, page, settings, pageWidth, pageHeight);
      }
      
    } catch (error) {
      throw new Error('添加标题页失败: ' + error.message);
    }
  }
  
  async addImagePage(pdfDoc, image, settings) {
    try {
      // 获取图片数据
      const imageData = await this.getImageData(image);
      
      // 创建图片对象
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imageData;
      });
      
      // 计算缩放后的尺寸，保持宽高比
      const targetWidth = settings.outputWidth;
      const aspectRatio = img.height / img.width;
      const targetHeight = Math.round(targetWidth * aspectRatio);
      
      // 处理图片到canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      
      // 绘制图片
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      
      // 添加水印A（仅当图片启用了该水印时）
      if (settings.watermarkA && settings.watermarkA.path && image.watermarks?.imageA) {
        await this.addWatermarkToCanvas(ctx, settings.watermarkA, targetWidth, targetHeight);
      }
      
      // 添加水印B（仅当图片启用了该水印时）
      if (settings.watermarkB && settings.watermarkB.path && image.watermarks?.imageB) {
        await this.addWatermarkToCanvas(ctx, settings.watermarkB, targetWidth, targetHeight);
      }
      
      // 添加文本水印A（仅当图片启用了该水印时）
      if (settings.watermarkTextA && settings.watermarkTextA.text && image.watermarks?.textA) {
        this.addTextWatermarkToCanvas(ctx, settings.watermarkTextA, targetWidth, targetHeight);
      }
      
      // 添加文本水印B（仅当图片启用了该水印时）
      if (settings.watermarkTextB && settings.watermarkTextB.text && image.watermarks?.textB) {
        this.addTextWatermarkToCanvas(ctx, settings.watermarkTextB, targetWidth, targetHeight);
      }
      
      // 将canvas转换为图片数据
      const canvasImageData = canvas.toDataURL('image/jpeg', 0.95);
      const imageBytes = this.dataURLToUint8Array(canvasImageData);
      
      // 嵌入图片到PDF
      const pdfImage = await pdfDoc.embedJpg(imageBytes);
      
      // 添加页面
      const page = pdfDoc.addPage([targetWidth, targetHeight]);
      
      // 绘制图片
      page.drawImage(pdfImage, {
        x: 0,
        y: 0,
        width: targetWidth,
        height: targetHeight
      });
      
    } catch (error) {
      throw new Error('添加图片页面失败: ' + error.message);
    }
  }
  
  async getImageData(image) {
    if (image.file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(image.file);
      });
    } else {
      return image.thumbnail;
    }
  }
  
  async addWatermarkToCanvas(ctx, watermarkSettings, canvasWidth, canvasHeight) {
    try {
      // 读取水印文件
      if (!window.electronAPI || !window.electronAPI.invoke) {
        throw new Error('electronAPI 未初始化');
      }
      
      const watermarkData = await window.electronAPI.invoke('read-file', watermarkSettings.path);
      const blob = new Blob([watermarkData]);
      const watermarkUrl = URL.createObjectURL(blob);
      
      // 创建水印图片
      const watermarkImg = new Image();
      await new Promise((resolve, reject) => {
        watermarkImg.onload = resolve;
        watermarkImg.onerror = reject;
        watermarkImg.src = watermarkUrl;
      });
      
      // 计算水印尺寸
      const watermarkWidth = watermarkImg.width * watermarkSettings.scale;
      const watermarkHeight = watermarkImg.height * watermarkSettings.scale;
      
      // 计算水印位置
      let x, y;
      
      switch (watermarkSettings.position) {
        case 'top-left':
          x = watermarkSettings.marginX;
          y = watermarkSettings.marginY;
          break;
        case 'top-right':
          x = canvasWidth - watermarkWidth - watermarkSettings.marginX;
          y = watermarkSettings.marginY;
          break;
        case 'bottom-left':
          x = watermarkSettings.marginX;
          y = canvasHeight - watermarkHeight - watermarkSettings.marginY;
          break;
        case 'bottom-right':
          x = canvasWidth - watermarkWidth - watermarkSettings.marginX;
          y = canvasHeight - watermarkHeight - watermarkSettings.marginY;
          break;
        case 'center':
        default:
          x = (canvasWidth - watermarkWidth) / 2;
          y = (canvasHeight - watermarkHeight) / 2;
          break;
      }
      
      // 设置透明度
      ctx.globalAlpha = watermarkSettings.opacity || 1.0;
      
      // 绘制水印
      ctx.drawImage(watermarkImg, x, y, watermarkWidth, watermarkHeight);
      
      // 恢复透明度
      ctx.globalAlpha = 1.0;
      
      // 清理URL
      URL.revokeObjectURL(watermarkUrl);
      
    } catch (error) {
      console.warn('添加水印失败:', error);
    }
  }
  
  addTextWatermarkToCanvas(ctx, watermarkSettings, canvasWidth, canvasHeight) {
    try {
      // 保存当前状态
      ctx.save();
      
      // 设置字体样式（移除粗体和斜体）
      const fontSize = watermarkSettings.fontSize || 24;
      const fontFamily = watermarkSettings.fontFamily || 'Microsoft YaHei';
      ctx.font = `${fontSize}px ${fontFamily}`;
      
      // 设置文字颜色和透明度
      const opacity = watermarkSettings.opacity || 0.8;
      ctx.globalAlpha = opacity;
      ctx.fillStyle = watermarkSettings.color || '#000000';
      
      // 设置文字对齐
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      
      // 测量文字尺寸
      const textMetrics = ctx.measureText(watermarkSettings.text);
      const textWidth = textMetrics.width;
      const textHeight = fontSize; // 近似高度
      
      // 计算文字位置
      let x, y;
      
      switch (watermarkSettings.position) {
        case 'top-left':
          x = watermarkSettings.marginX;
          y = watermarkSettings.marginY;
          break;
        case 'top-right':
          x = canvasWidth - textWidth - watermarkSettings.marginX;
          y = watermarkSettings.marginY;
          break;
        case 'bottom-left':
          x = watermarkSettings.marginX;
          y = canvasHeight - textHeight - watermarkSettings.marginY;
          break;
        case 'bottom-right':
        default:
          x = canvasWidth - textWidth - watermarkSettings.marginX;
          y = canvasHeight - textHeight - watermarkSettings.marginY;
          break;
        case 'center':
          x = (canvasWidth - textWidth) / 2;
          y = (canvasHeight - textHeight) / 2;
          break;
      }
      
      // 绘制阴影（如果阴影透明度大于0）
      const shadowOpacity = watermarkSettings.shadowOpacity || 0;
      if (shadowOpacity > 0) {
        const shadowOffset = fontSize * 0.05; // 阴影偏移为字体大小的5%
        const shadowBlur = fontSize * 0.1; // 阴影模糊为字体大小的10%
        
        ctx.save();
        ctx.globalAlpha = shadowOpacity;
        ctx.shadowColor = '#000000';
        ctx.shadowOffsetX = shadowOffset;
        ctx.shadowOffsetY = shadowOffset;
        ctx.shadowBlur = shadowBlur;
        ctx.fillStyle = '#000000';
        ctx.fillText(watermarkSettings.text, x, y);
        ctx.restore();
      }
      
      // 绘制背景（如果设置了背景色）
      if (watermarkSettings.backgroundColor && watermarkSettings.backgroundColor !== 'transparent') {
        const padding = 4;
        ctx.fillStyle = watermarkSettings.backgroundColor;
        ctx.fillRect(x - padding, y - padding, textWidth + padding * 2, textHeight + padding * 2);
        ctx.fillStyle = watermarkSettings.color || '#000000';
      }
      
      // 绘制文字
      ctx.globalAlpha = opacity;
      ctx.fillStyle = watermarkSettings.color || '#000000';
      ctx.fillText(watermarkSettings.text, x, y);
      
      // 恢复状态
      ctx.restore();
      
    } catch (error) {
      console.warn('添加文本水印失败:', error);
    }
  }

  dataURLToUint8Array(dataURL) {
    const base64 = dataURL.split(',')[1];
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }
  
  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  }
  
  async savePDFBytes(pdfBytes) {
    try {
      if (!window.electronAPI || !window.electronAPI.invoke) {
        // 浏览器环境，直接下载
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `images_${new Date().getTime()}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        // Electron环境，使用文件对话框
        const dialogResult = await window.electronAPI.invoke('save-pdf-dialog');
        
        if (dialogResult.canceled) {
          return;
        }
        
        const result = await window.electronAPI.invoke('save-pdf', {
          filePath: dialogResult.filePath,
          pdfBytes: Array.from(pdfBytes)
        });
        
        if (result.success) {
          utils.showToast(`PDF已保存到: ${result.filePath}`, 'success');
          // 自动打开PDF文件
          try {
            await window.electronAPI.invoke('open-pdf', result.filePath);
          } catch (openError) {
            console.warn('自动打开PDF失败:', openError);
          }
        } else {
          throw new Error(result.error || '保存失败');
        }
      }
    } catch (error) {
      throw new Error('保存PDF失败: ' + error.message);
    }
  }
  
  async previewPDF() {
    try {
      // 防止重复调用
      if (this.isGenerating) {
        return;
      }
      this.isGenerating = true;
      
      const allImages = window.imageManager.getAllImages();
      
      if (allImages.length === 0) {
        utils.showToast('没有图片可以预览', 'warning');
        this.isGenerating = false;
        return;
      }
      
      const settings = window.settingsManager.getSettings();
      
      utils.showLoading('正在生成预览...');
      
      // 确保PDF-lib已加载
      if (!this.PDFLib) {
        await this.loadPDFLib();
        this.PDFLib = window.PDFLib;
      }
      
      // 创建PDF文档
      const pdfDoc = await this.PDFLib.PDFDocument.create();
      
      // 添加标题页
      if (settings.title && settings.title.text) {
        await this.addTitlePage(pdfDoc, settings);
      }
      
      // 只处理前3张图片用于预览
      const previewImages = allImages.slice(0, 3);
      
      for (let i = 0; i < previewImages.length; i++) {
        const image = previewImages[i];
        utils.updateLoadingText(`正在生成预览 ${i + 1}/${previewImages.length}...`);
        await this.addImagePage(pdfDoc, image, settings);
      }
      
      // 生成PDF字节
      const pdfBytes = await pdfDoc.save();
      
      // 创建预览URL
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      // 打开预览窗口
      const previewWindow = window.open(url, '_blank');
      if (!previewWindow) {
        utils.showToast('请允许弹出窗口以查看预览', 'warning');
      }
      
      utils.hideLoading();
      
      // 清理URL（延迟清理，确保预览窗口能够加载）
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 5000);
      
    } catch (error) {
      utils.hideLoading();
      console.error('预览生成失败:', error);
      utils.showToast('预览生成失败: ' + error.message, 'error');
    } finally {
      this.isGenerating = false;
    }
  }

  // 处理中文文本：使用Canvas绘制并转换为图片
  async addChineseTextAsImage(pdfDoc, page, settings, pageWidth, pageHeight) {
    try {
      // 创建Canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // 设置Canvas尺寸（使用更高的分辨率以提高清晰度）
      const scale = 2;
      canvas.width = pageWidth * scale;
      canvas.height = pageHeight * scale;
      ctx.scale(scale, scale);
      
      // 设置背景色（透明）
      ctx.clearRect(0, 0, pageWidth, pageHeight);
      
      // 获取字体设置
      const fontSize = settings.title.fontSize;
      let fontFamily = settings.title.fontFamily || 'Microsoft YaHei';
      
      console.log('PDF生成使用的字体:', fontFamily);
      
      // 检查字体是否已加载
      const loadedFonts = Array.from(document.fonts.values()).map(font => font.family);
      console.log('已加载的字体:', loadedFonts);
      
      // 构建字体回退列表
      let fontFallback;
      if (loadedFonts.includes(fontFamily)) {
        // 如果自定义字体已加载，优先使用
        fontFallback = `"${fontFamily}", "Microsoft YaHei", "SimHei", "黑体", sans-serif`;
      } else {
        // 使用系统默认字体
        fontFallback = '"Microsoft YaHei", "SimHei", "黑体", sans-serif';
      }
      
      // 设置文本样式
      ctx.font = `${fontSize}px ${fontFallback}`;
      console.log('Canvas字体设置:', ctx.font);
      ctx.fillStyle = settings.title.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // 启用抗锯齿
      ctx.textRenderingOptimization = 'optimizeQuality';
      ctx.imageSmoothingEnabled = true;
      
      // 绘制文本
      const lines = settings.title.text.split('\n');
      const lineHeight = fontSize * 1.2;
      const totalTextHeight = lines.length * lineHeight;
      const startY = (pageHeight - totalTextHeight) / 2 + fontSize / 2;
      
      lines.forEach((line, index) => {
        const y = startY + (index * lineHeight);
        ctx.fillText(line, pageWidth / 2, y);
      });
      
      // 转换为图片数据（使用更高质量）
      const imageData = canvas.toDataURL('image/png', 1.0);
      const imageBytes = this.dataURLToUint8Array(imageData);
      
      // 嵌入图片到PDF
      const image = await pdfDoc.embedPng(imageBytes);
      
      // 绘制图片到页面
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight
      });
      
    } catch (error) {
      console.error('中文文本绘制失败:', error);
      // 如果失败，至少保留背景色
    }
  }

  // 添加分隔页
  async addSeparatorPage(pdfDoc, settings) {
    try {
      // 计算页面尺寸
      const pageWidth = settings.outputWidth;
      const pageHeight = settings.separator.height;
      
      // 添加白色分隔页
      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      
      // 绘制白色背景
      page.drawRectangle({
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
        color: this.PDFLib.rgb(1, 1, 1) // 白色
      });
      
    } catch (error) {
      throw new Error('添加分隔页失败: ' + error.message);
    }
  }
}

// 导出PDF生成器实例
window.pdfGenerator = new PDFGenerator();