// 设置管理器
class SettingsManager {
  constructor() {
    this.settings = {
      outputWidth: 1080,
      watermark: {
        path: '',
        position: 'top-left',
        marginX: 20,
        marginY: 20,
        scale: 0.75
      },
      watermarkA: {
        path: '',
        position: 'top-left',
        marginX: 20,
        marginY: 20,
        scale: 0.75
      },
      watermarkB: {
        path: '',
        position: 'top-left',
        marginX: 20,
        marginY: 20,
        scale: 0.75
      },
      watermarkTextA: {
        text: '',
        fontSize: 24,
        fontFamily: 'Microsoft YaHei',
        color: '#000000',
        backgroundColor: 'transparent',
        opacity: 0.8,
        position: 'bottom-right',
        marginX: 20,
        marginY: 20,
        shadowOpacity: 0.3
      },
      watermarkTextB: {
        text: '',
        fontSize: 24,
        fontFamily: 'Microsoft YaHei',
        color: '#000000',
        backgroundColor: 'transparent',
        opacity: 0.8,
        position: 'top-right',
        marginX: 20,
        marginY: 20,
        shadowOpacity: 0.3
      },
      title: {
        text: '',
        fontSize: 48,
        fontFamily: 'Microsoft YaHei',
        color: '#000000',
        backgroundColor: '#ffffff'
      },
      separator: {
        enabled: false,
        height: 100
      }
    };
    
    this.configs = new Map();
    this.isInitialized = false;
    this.eventsbound = false;
    this.init();
  }
  
  async init() {
    if (this.isInitialized) {
      return;
    }
    
    await this.loadSettings();
    await this.loadConfigs();
    await this.initFontSelector();
    this.bindEvents();
    this.updateUI();
    this.isInitialized = true;
  }
  
  bindEvents() {
    if (this.eventsbound) {
      return;
    }
    
    // 输出宽度 - 滑块和输入框双向绑定
    const outputWidth = document.getElementById('output-width');
    const outputWidthSlider = document.getElementById('output-width-slider');
    const outputWidthValue = document.getElementById('output-width-value');
    
    // 滑块变化时更新输入框和显示值
    outputWidthSlider.addEventListener('input', (e) => {
      const value = parseInt(e.target.value);
      outputWidth.value = value;
      outputWidthValue.textContent = value;
      this.settings.outputWidth = value;
      this.saveSettings();
    });
    
    // 输入框变化时更新滑块和显示值
    outputWidth.addEventListener('input', utils.debounce((e) => {
      const value = parseInt(e.target.value) || 1080;
      outputWidthSlider.value = value;
      outputWidthValue.textContent = value;
      this.settings.outputWidth = value;
      this.saveSettings();
    }, 300));
    
    // 输出宽度预设按钮
    document.querySelectorAll('.preset-item').forEach(button => {
      button.addEventListener('click', (e) => {
        const value = parseInt(e.target.textContent);
        if (value && value > 0) {
          outputWidth.value = value;
          outputWidthSlider.value = value;
          outputWidthValue.textContent = value;
          this.settings.outputWidth = value;
          this.saveSettings();
          
          // 更新按钮状态
          document.querySelectorAll('.preset-item').forEach(btn => btn.classList.remove('active'));
          e.target.classList.add('active');
        }
      });
    });
    
    // 水印文件选择 - A组
    document.getElementById('select-watermark-btn-a').addEventListener('click', () => this.selectWatermark('a'));
    document.getElementById('clear-watermark-btn-a').addEventListener('click', () => this.clearWatermark('a'));
    
    // 水印文件选择 - B组
    document.getElementById('select-watermark-btn-b').addEventListener('click', () => this.selectWatermark('b'));
    document.getElementById('clear-watermark-btn-b').addEventListener('click', () => this.clearWatermark('b'));
    
    this.eventsbound = true;
    
    // 水印位置 - A组
    document.querySelectorAll('input[name="watermark-position-a"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.settings.watermarkA.position = e.target.value;
        this.saveSettings();
      });
    });
    
    // 水印位置 - B组
    document.querySelectorAll('input[name="watermark-position-b"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.settings.watermarkB.position = e.target.value;
        this.saveSettings();
      });
    });
    
    // 水印边距 - A组
    const marginXA = document.getElementById('watermark-margin-x-a');
    const marginYA = document.getElementById('watermark-margin-y-a');
    
    marginXA.addEventListener('input', utils.debounce((e) => {
      this.settings.watermarkA.marginX = parseInt(e.target.value) || 0;
      this.saveSettings();
    }, 300));
    
    marginYA.addEventListener('input', utils.debounce((e) => {
      this.settings.watermarkA.marginY = parseInt(e.target.value) || 0;
      this.saveSettings();
    }, 300));
    
    // 水印边距 - B组
    const marginXB = document.getElementById('watermark-margin-x-b');
    const marginYB = document.getElementById('watermark-margin-y-b');
    
    marginXB.addEventListener('input', utils.debounce((e) => {
      this.settings.watermarkB.marginX = parseInt(e.target.value) || 0;
      this.saveSettings();
    }, 300));
    
    marginYB.addEventListener('input', utils.debounce((e) => {
      this.settings.watermarkB.marginY = parseInt(e.target.value) || 0;
      this.saveSettings();
    }, 300));
    
    // 水印缩放 - A组
    document.querySelectorAll('input[name="watermark-scale-a"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.settings.watermarkA.scale = parseFloat(e.target.value);
        this.saveSettings();
      });
    });
    
    // 水印缩放 - B组
    document.querySelectorAll('input[name="watermark-scale-b"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.settings.watermarkB.scale = parseFloat(e.target.value);
        this.saveSettings();
      });
    });
    
    // 标题设置
    const titleText = document.getElementById('title-text');
    const titleFontSize = document.getElementById('title-font-size');
    const titleFontFamily = document.getElementById('title-font-family');
    const titleColor = document.getElementById('title-color');
    const titleBgColor = document.getElementById('title-bg-color');
    
    titleText.addEventListener('input', utils.debounce((e) => {
      this.settings.title.text = e.target.value;
      this.saveSettings();
    }, 300));
    
    titleFontSize.addEventListener('input', utils.debounce((e) => {
      this.settings.title.fontSize = parseInt(e.target.value) || 48;
      this.saveSettings();
    }, 300));
    
    titleFontFamily.addEventListener('change', (e) => {
      this.settings.title.fontFamily = e.target.value;
      this.saveSettings();
    });
    
    titleColor.addEventListener('change', (e) => {
      this.settings.title.color = e.target.value;
      this.saveSettings();
    });
    
    titleBgColor.addEventListener('change', (e) => {
      this.settings.title.backgroundColor = e.target.value;
      this.saveSettings();
    });
    
    // 分隔页设置
    const separatorEnabled = document.getElementById('separator-enabled');
    const separatorHeight = document.getElementById('separator-height');
    const separatorHeightValue = document.getElementById('separator-height-value');
    
    separatorEnabled.addEventListener('change', (e) => {
      this.settings.separator.enabled = e.target.checked;
      this.saveSettings();
    });
    
    // 分隔页高度 - 滑块和输入框双向绑定
    separatorHeight.addEventListener('input', (e) => {
      const value = parseInt(e.target.value);
      separatorHeightValue.value = value;
      this.settings.separator.height = value;
      this.saveSettings();
    });
    
    separatorHeightValue.addEventListener('input', utils.debounce((e) => {
      const value = Math.max(50, Math.min(300, parseInt(e.target.value) || 100));
      separatorHeight.value = value;
      separatorHeightValue.value = value;
      this.settings.separator.height = value;
      this.saveSettings();
    }, 300));
    
    // 水印文本C设置
    const watermarkTextAContent = document.getElementById('watermark-text-a-content');
    const watermarkTextAFontSize = document.getElementById('watermark-text-a-font-size');
    const watermarkTextAFontFamily = document.getElementById('watermark-text-a-font-family');
    const watermarkTextAColor = document.getElementById('watermark-text-a-color');
    const watermarkTextAOpacity = document.getElementById('watermark-text-a-opacity');
    const watermarkTextAOpacityValue = document.getElementById('watermark-text-a-opacity-value');
    const watermarkTextAMarginX = document.getElementById('watermark-text-a-margin-x');
    const watermarkTextAMarginY = document.getElementById('watermark-text-a-margin-y');
    const watermarkTextAShadowOpacity = document.getElementById('watermark-text-a-shadow-opacity');
    const watermarkTextAShadowOpacityValue = document.getElementById('watermark-text-a-shadow-opacity-value');

    // 水印文本C内容
    watermarkTextAContent.addEventListener('input', utils.debounce((e) => {
      this.settings.watermarkTextA.text = e.target.value;
      this.saveSettings();
    }, 300));

    // 水印文本C字体大小
    watermarkTextAFontSize.addEventListener('input', utils.debounce((e) => {
      this.settings.watermarkTextA.fontSize = parseInt(e.target.value) || 24;
      this.saveSettings();
    }, 300));

    // 水印文本C字体
    watermarkTextAFontFamily.addEventListener('change', (e) => {
      this.settings.watermarkTextA.fontFamily = e.target.value;
      this.saveSettings();
    });

    // 水印文本C颜色
    watermarkTextAColor.addEventListener('change', (e) => {
      this.settings.watermarkTextA.color = e.target.value;
      this.saveSettings();
    });

    // 水印文本C透明度
    watermarkTextAOpacity.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      watermarkTextAOpacityValue.textContent = Math.round(value * 100) + '%';
      this.settings.watermarkTextA.opacity = value;
      this.saveSettings();
    });

    // 水印文本C位置
    document.querySelectorAll('input[name="watermark-text-a-position"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.settings.watermarkTextA.position = e.target.value;
        this.saveSettings();
      });
    });

    // 水印文本C边距
    watermarkTextAMarginX.addEventListener('input', utils.debounce((e) => {
      this.settings.watermarkTextA.marginX = parseInt(e.target.value) || 0;
      this.saveSettings();
    }, 300));

    watermarkTextAMarginY.addEventListener('input', utils.debounce((e) => {
      this.settings.watermarkTextA.marginY = parseInt(e.target.value) || 0;
      this.saveSettings();
    }, 300));

    // 水印文本C阴影透明度
    watermarkTextAShadowOpacity.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      watermarkTextAShadowOpacityValue.textContent = Math.round(value * 100) + '%';
      this.settings.watermarkTextA.shadowOpacity = value;
      this.saveSettings();
    });

    // 水印文本D设置
    const watermarkTextBContent = document.getElementById('watermark-text-b-content');
    const watermarkTextBFontSize = document.getElementById('watermark-text-b-font-size');
    const watermarkTextBFontFamily = document.getElementById('watermark-text-b-font-family');
    const watermarkTextBColor = document.getElementById('watermark-text-b-color');
    const watermarkTextBOpacity = document.getElementById('watermark-text-b-opacity');
    const watermarkTextBOpacityValue = document.getElementById('watermark-text-b-opacity-value');
    const watermarkTextBMarginX = document.getElementById('watermark-text-b-margin-x');
    const watermarkTextBMarginY = document.getElementById('watermark-text-b-margin-y');
    const watermarkTextBShadowOpacity = document.getElementById('watermark-text-b-shadow-opacity');
    const watermarkTextBShadowOpacityValue = document.getElementById('watermark-text-b-shadow-opacity-value');

    // 水印文本D内容
    watermarkTextBContent.addEventListener('input', utils.debounce((e) => {
      this.settings.watermarkTextB.text = e.target.value;
      this.saveSettings();
    }, 300));

    // 水印文本D字体大小
    watermarkTextBFontSize.addEventListener('input', utils.debounce((e) => {
      this.settings.watermarkTextB.fontSize = parseInt(e.target.value) || 24;
      this.saveSettings();
    }, 300));

    // 水印文本D字体
    watermarkTextBFontFamily.addEventListener('change', (e) => {
      this.settings.watermarkTextB.fontFamily = e.target.value;
      this.saveSettings();
    });

    // 水印文本D颜色
    watermarkTextBColor.addEventListener('change', (e) => {
      this.settings.watermarkTextB.color = e.target.value;
      this.saveSettings();
    });

    // 水印文本D透明度
    watermarkTextBOpacity.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      watermarkTextBOpacityValue.textContent = Math.round(value * 100) + '%';
      this.settings.watermarkTextB.opacity = value;
      this.saveSettings();
    });

    // 水印文本D位置
    document.querySelectorAll('input[name="watermark-text-b-position"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.settings.watermarkTextB.position = e.target.value;
        this.saveSettings();
      });
    });

    // 水印文本D边距
    watermarkTextBMarginX.addEventListener('input', utils.debounce((e) => {
      this.settings.watermarkTextB.marginX = parseInt(e.target.value) || 0;
      this.saveSettings();
    }, 300));

    watermarkTextBMarginY.addEventListener('input', utils.debounce((e) => {
      this.settings.watermarkTextB.marginY = parseInt(e.target.value) || 0;
      this.saveSettings();
    }, 300));

    // 水印文本D阴影透明度
    watermarkTextBShadowOpacity.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      watermarkTextBShadowOpacityValue.textContent = Math.round(value * 100) + '%';
      this.settings.watermarkTextB.shadowOpacity = value;
      this.saveSettings();
    });

    // 配置管理
    document.getElementById('save-config-btn').addEventListener('click', () => this.saveConfig());
  }
  
  async selectWatermark(group = 'a') {
    try {
      if (!window.electronAPI || !window.electronAPI.invoke) {
        throw new Error('electronAPI 未初始化');
      }
      const result = await window.electronAPI.invoke('select-watermark');
      if (result.canceled || !result.filePaths.length) return;
      
      const filePath = result.filePaths[0];
      
      // 验证文件是否为PNG
      if (!window.electronAPI || !window.electronAPI.invoke) {
          throw new Error('electronAPI 未初始化');
        }
        const fileData = await window.electronAPI.invoke('read-file', filePath);
      const blob = new Blob([fileData]);
      const file = new File([blob], filePath.split('\\').pop(), { type: 'image/png' });
      
      if (!utils.isPngFile(file)) {
        utils.showToast('请选择PNG格式的图片文件', 'error');
        return;
      }
      
      if (group === 'a') {
        this.settings.watermarkA.path = filePath;
      } else {
        this.settings.watermarkB.path = filePath;
      }
      this.saveSettings();
      this.updateWatermarkUI(group);
      
      utils.showToast(`水印${group.toUpperCase()}文件设置成功`, 'success');
    } catch (error) {
      utils.showToast('选择水印文件失败: ' + error.message, 'error');
    }
  }
  
  clearWatermark(group = 'a') {
    if (group === 'a') {
      this.settings.watermarkA.path = '';
    } else {
      this.settings.watermarkB.path = '';
    }
    this.saveSettings();
    this.updateWatermarkUI(group);
    utils.showToast(`已清除水印${group.toUpperCase()}设置`, 'info');
  }
  
  updateWatermarkUI(group = 'a') {
    const pathInput = document.getElementById(`watermark-path-${group}`);
    const clearBtn = document.getElementById(`clear-watermark-btn-${group}`);
    
    const watermarkPath = group === 'a' ? this.settings.watermarkA.path : this.settings.watermarkB.path;
    
    if (pathInput) {
      pathInput.value = watermarkPath ? watermarkPath.split('\\').pop() : '';
    }
    
    if (clearBtn) {
      clearBtn.style.display = watermarkPath ? 'block' : 'none';
    }
  }
  
  updateUI() {
    // 输出宽度 - 同步滑块、输入框和显示值
    const outputWidth = document.getElementById('output-width');
    const outputWidthSlider = document.getElementById('output-width-slider');
    const outputWidthValue = document.getElementById('output-width-value');
    
    if (outputWidth) outputWidth.value = this.settings.outputWidth;
    if (outputWidthSlider) outputWidthSlider.value = this.settings.outputWidth;
    if (outputWidthValue) outputWidthValue.textContent = this.settings.outputWidth;
    
    // 更新预设按钮状态
    document.querySelectorAll('.preset-item').forEach(button => {
      button.classList.remove('active');
      if (parseInt(button.textContent) === this.settings.outputWidth) {
        button.classList.add('active');
      }
    });
    
    // 水印设置 - A组
    this.updateWatermarkUI('a');
    
    // 水印位置 - A组
    const positionRadioA = document.querySelector(`input[name="watermark-position-a"][value="${this.settings.watermarkA.position}"]`);
    if (positionRadioA) positionRadioA.checked = true;
    
    // 水印边距 - A组
    const marginXA = document.getElementById('watermark-margin-x-a');
    const marginYA = document.getElementById('watermark-margin-y-a');
    if (marginXA) marginXA.value = this.settings.watermarkA.marginX;
    if (marginYA) marginYA.value = this.settings.watermarkA.marginY;
    
    // 水印缩放 - A组
    const scaleRadioA = document.querySelector(`input[name="watermark-scale-a"][value="${this.settings.watermarkA.scale}"]`);
    if (scaleRadioA) scaleRadioA.checked = true;
    
    // 水印设置 - B组
    this.updateWatermarkUI('b');
    
    // 水印位置 - B组
    const positionRadioB = document.querySelector(`input[name="watermark-position-b"][value="${this.settings.watermarkB.position}"]`);
    if (positionRadioB) positionRadioB.checked = true;
    
    // 水印边距 - B组
    const marginXB = document.getElementById('watermark-margin-x-b');
    const marginYB = document.getElementById('watermark-margin-y-b');
    if (marginXB) marginXB.value = this.settings.watermarkB.marginX;
    if (marginYB) marginYB.value = this.settings.watermarkB.marginY;
    
    // 水印缩放 - B组
    const scaleRadioB = document.querySelector(`input[name="watermark-scale-b"][value="${this.settings.watermarkB.scale}"]`);
    if (scaleRadioB) scaleRadioB.checked = true;
    
    // 标题设置
    document.getElementById('title-text').value = this.settings.title.text;
    document.getElementById('title-font-size').value = this.settings.title.fontSize;
    document.getElementById('title-font-family').value = this.settings.title.fontFamily;
    document.getElementById('title-color').value = this.settings.title.color;
    document.getElementById('title-bg-color').value = this.settings.title.backgroundColor;
    
    // 分隔页设置
    const separatorEnabled = document.getElementById('separator-enabled');
    const separatorHeight = document.getElementById('separator-height');
    const separatorHeightValue = document.getElementById('separator-height-value');
    
    if (separatorEnabled) separatorEnabled.checked = this.settings.separator.enabled;
    if (separatorHeight) separatorHeight.value = this.settings.separator.height;
    if (separatorHeightValue) separatorHeightValue.value = this.settings.separator.height;
    
    // 水印文本A设置
    const watermarkTextAContent = document.getElementById('watermark-text-a-content');
    const watermarkTextAFontSize = document.getElementById('watermark-text-a-font-size');
    const watermarkTextAFontFamily = document.getElementById('watermark-text-a-font-family');
    const watermarkTextAColor = document.getElementById('watermark-text-a-color');
    const watermarkTextAOpacity = document.getElementById('watermark-text-a-opacity');
    const watermarkTextAOpacityValue = document.getElementById('watermark-text-a-opacity-value');
    const watermarkTextAMarginX = document.getElementById('watermark-text-a-margin-x');
    const watermarkTextAMarginY = document.getElementById('watermark-text-a-margin-y');
    const watermarkTextAShadowOpacity = document.getElementById('watermark-text-a-shadow-opacity');
    const watermarkTextAShadowOpacityValue = document.getElementById('watermark-text-a-shadow-opacity-value');
    
    if (watermarkTextAContent) watermarkTextAContent.value = this.settings.watermarkTextA.text;
    if (watermarkTextAFontSize) watermarkTextAFontSize.value = this.settings.watermarkTextA.fontSize;
    if (watermarkTextAFontFamily) watermarkTextAFontFamily.value = this.settings.watermarkTextA.fontFamily;
    if (watermarkTextAColor) watermarkTextAColor.value = this.settings.watermarkTextA.color;
    if (watermarkTextAOpacity) {
      watermarkTextAOpacity.value = this.settings.watermarkTextA.opacity;
      if (watermarkTextAOpacityValue) {
        watermarkTextAOpacityValue.textContent = Math.round(this.settings.watermarkTextA.opacity * 100) + '%';
      }
    }
    if (watermarkTextAMarginX) watermarkTextAMarginX.value = this.settings.watermarkTextA.marginX;
    if (watermarkTextAMarginY) watermarkTextAMarginY.value = this.settings.watermarkTextA.marginY;
    if (watermarkTextAShadowOpacity) {
      watermarkTextAShadowOpacity.value = this.settings.watermarkTextA.shadowOpacity;
      if (watermarkTextAShadowOpacityValue) {
        watermarkTextAShadowOpacityValue.textContent = Math.round(this.settings.watermarkTextA.shadowOpacity * 100) + '%';
      }
    }
    
    // 水印文本A位置
    const textAPositionRadio = document.querySelector(`input[name="watermark-text-a-position"][value="${this.settings.watermarkTextA.position}"]`);
    if (textAPositionRadio) textAPositionRadio.checked = true;
    
    // 水印文本B设置
    const watermarkTextBContent = document.getElementById('watermark-text-b-content');
    const watermarkTextBFontSize = document.getElementById('watermark-text-b-font-size');
    const watermarkTextBFontFamily = document.getElementById('watermark-text-b-font-family');
    const watermarkTextBColor = document.getElementById('watermark-text-b-color');
    const watermarkTextBOpacity = document.getElementById('watermark-text-b-opacity');
    const watermarkTextBOpacityValue = document.getElementById('watermark-text-b-opacity-value');
    const watermarkTextBMarginX = document.getElementById('watermark-text-b-margin-x');
    const watermarkTextBMarginY = document.getElementById('watermark-text-b-margin-y');
    const watermarkTextBShadowOpacity = document.getElementById('watermark-text-b-shadow-opacity');
    const watermarkTextBShadowOpacityValue = document.getElementById('watermark-text-b-shadow-opacity-value');
    
    if (watermarkTextBContent) watermarkTextBContent.value = this.settings.watermarkTextB.text;
    if (watermarkTextBFontSize) watermarkTextBFontSize.value = this.settings.watermarkTextB.fontSize;
    if (watermarkTextBFontFamily) watermarkTextBFontFamily.value = this.settings.watermarkTextB.fontFamily;
    if (watermarkTextBColor) watermarkTextBColor.value = this.settings.watermarkTextB.color;
    if (watermarkTextBOpacity) {
      watermarkTextBOpacity.value = this.settings.watermarkTextB.opacity;
      if (watermarkTextBOpacityValue) {
        watermarkTextBOpacityValue.textContent = Math.round(this.settings.watermarkTextB.opacity * 100) + '%';
      }
    }
    if (watermarkTextBMarginX) watermarkTextBMarginX.value = this.settings.watermarkTextB.marginX;
    if (watermarkTextBMarginY) watermarkTextBMarginY.value = this.settings.watermarkTextB.marginY;
    if (watermarkTextBShadowOpacity) {
      watermarkTextBShadowOpacity.value = this.settings.watermarkTextB.shadowOpacity;
      if (watermarkTextBShadowOpacityValue) {
        watermarkTextBShadowOpacityValue.textContent = Math.round(this.settings.watermarkTextB.shadowOpacity * 100) + '%';
      }
    }
    
    // 水印文本B位置
    const textBPositionRadio = document.querySelector(`input[name="watermark-text-b-position"][value="${this.settings.watermarkTextB.position}"]`);
    if (textBPositionRadio) textBPositionRadio.checked = true;
    
    // 更新配置列表
    this.updateConfigList();
  }
  
  async saveConfig() {
    const nameInput = document.getElementById('config-name');
    const name = nameInput.value.trim();
    
    if (!utils.isValidConfigName(name)) {
      utils.showToast('请输入有效的配置名称（1-50个字符）', 'warning');
      return;
    }
    
    // 检查是否已存在
    if (this.configs.has(name)) {
      if (!confirm(`配置"${name}"已存在，是否覆盖？`)) {
        return;
      }
    }
    
    // 保存配置
    const config = {
      id: utils.generateId(),
      name: name,
      settings: utils.deepClone(this.settings),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    this.configs.set(name, config);
    await this.saveConfigs();
    
    nameInput.value = '';
    this.updateConfigList();
    
    utils.showToast(`配置"${name}"保存成功`, 'success');
  }
  
  async loadConfig(name) {
    const config = this.configs.get(name);
    if (!config) {
      utils.showToast('配置不存在', 'error');
      return;
    }
    
    this.settings = utils.deepClone(config.settings);
    await this.saveSettings();
    this.updateUI();
    
    utils.showToast(`已加载配置"${name}"`, 'success');
  }
  
  async deleteConfig(name) {
    if (!this.configs.has(name)) {
      utils.showToast('配置不存在', 'error');
      return;
    }
    
    if (!confirm(`确定要删除配置"${name}"吗？`)) {
      return;
    }
    
    this.configs.delete(name);
    await this.saveConfigs();
    this.updateConfigList();
    
    utils.showToast(`配置"${name}"已删除`, 'success');
  }
  
  updateConfigList() {
    const container = document.getElementById('config-list');
    
    if (this.configs.size === 0) {
      container.innerHTML = `
        <div class="empty-config">
          <p>暂无保存的配置</p>
        </div>
      `;
      return;
    }
    
    const configsArray = Array.from(this.configs.values())
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    
    container.innerHTML = configsArray.map(config => `
      <div class="config-item" data-name="${config.name}">
        <div class="config-info">
          <div class="config-name">${config.name}</div>
          <div class="config-date">${utils.formatDate(new Date(config.updatedAt), 'MM-DD HH:mm')}</div>
        </div>
        <div class="config-actions">
          <button class="btn btn-primary" data-action="load">加载</button>
          <button class="btn btn-danger" data-action="delete">删除</button>
        </div>
      </div>
    `).join('');
    
    // 绑定配置项事件
    container.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      const configItem = e.target.closest('.config-item');
      const name = configItem?.dataset.name;
      
      if (!name) return;
      
      switch (action) {
        case 'load':
          this.loadConfig(name);
          break;
        case 'delete':
          this.deleteConfig(name);
          break;
      }
    });
  }
  
  async saveSettings() {
    try {
      if (!window.electronAPI || !window.electronAPI.invoke) {
        throw new Error('electronAPI 未初始化');
      }
      await window.electronAPI.invoke('store-set', 'settings', this.settings);
    } catch (error) {
      console.error('保存设置失败:', error);
    }
  }
  
  async loadSettings() {
    try {
      if (!window.electronAPI || !window.electronAPI.invoke) {
        throw new Error('electronAPI 未初始化');
      }
      const saved = await window.electronAPI.invoke('store-get', 'settings', this.settings);
      this.settings = { ...this.settings, ...saved };
    } catch (error) {
      console.error('加载设置失败:', error);
    }
  }
  
  async saveConfigs() {
    try {
      const configsObj = Object.fromEntries(this.configs);
      if (!window.electronAPI || !window.electronAPI.invoke) {
        throw new Error('electronAPI 未初始化');
      }
      await window.electronAPI.invoke('store-set', 'configs', configsObj);
    } catch (error) {
      console.error('保存配置失败:', error);
    }
  }
  
  async loadConfigs() {
    try {
      if (!window.electronAPI || !window.electronAPI.invoke) {
        throw new Error('electronAPI 未初始化');
      }
      const saved = await window.electronAPI.invoke('store-get', 'configs', {});
      this.configs = new Map(Object.entries(saved));
    } catch (error) {
      console.error('加载配置失败:', error);
    }
  }
  
  // 获取当前设置
  getSettings() {
    return utils.deepClone(this.settings);
  }
  
  // 验证设置
  validateSettings() {
    const errors = [];
    
    // 验证输出宽度
    if (this.settings.outputWidth < 100 || this.settings.outputWidth > 5000) {
      errors.push('输出宽度必须在100-5000px之间');
    }
    
    // 验证水印边距
    if (this.settings.watermark.marginX < 0 || this.settings.watermark.marginX > 500) {
      errors.push('水印水平边距必须在0-500px之间');
    }
    
    if (this.settings.watermark.marginY < 0 || this.settings.watermark.marginY > 500) {
      errors.push('水印垂直边距必须在0-500px之间');
    }
    
    // 验证标题字体大小
    if (this.settings.title.fontSize < 12 || this.settings.title.fontSize > 200) {
      errors.push('标题字体大小必须在12-200px之间');
    }
    
    return errors;
  }
  
  // 重置设置
  resetSettings() {
    this.settings = {
      outputWidth: 1080,
      watermark: {
        path: '',
        position: 'top-left',
        marginX: 20,
        marginY: 20,
        scale: 0.75
      },
      watermarkA: {
        path: '',
        position: 'top-left',
        marginX: 20,
        marginY: 20,
        scale: 0.75
      },
      watermarkB: {
        path: '',
        position: 'top-left',
        marginX: 20,
        marginY: 20,
        scale: 0.75
      },
      watermarkTextA: {
        text: '',
        fontSize: 24,
        fontFamily: 'Microsoft YaHei',
        color: '#000000',
        backgroundColor: 'transparent',
        opacity: 0.8,
        position: 'bottom-right',
        marginX: 20,
        marginY: 20,
        shadowOpacity: 0.3
      },
      watermarkTextB: {
        text: '',
        fontSize: 24,
        fontFamily: 'Microsoft YaHei',
        color: '#000000',
        backgroundColor: 'transparent',
        opacity: 0.8,
        position: 'top-right',
        marginX: 20,
        marginY: 20,
        shadowOpacity: 0.3
      },
      title: {
        text: '',
        fontSize: 48,
        fontFamily: 'Microsoft YaHei',
        color: '#000000',
        backgroundColor: '#ffffff'
      },
      separator: {
        enabled: false,
        height: 100
      }
    };
    
    this.saveSettings();
    this.updateUI();
    
    utils.showToast('设置已重置为默认值', 'info');
  }
  
  // 导出设置
  async exportSettings() {
    try {
      const data = {
        settings: this.settings,
        configs: Object.fromEntries(this.configs),
        exportedAt: new Date().toISOString(),
        version: '1.0.0'
      };
      
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `tare-pdf-settings-${utils.formatDate(new Date(), 'YYYY-MM-DD')}.json`;
      a.click();
      
      URL.revokeObjectURL(url);
      
      utils.showToast('设置导出成功', 'success');
    } catch (error) {
      utils.showToast('导出设置失败: ' + error.message, 'error');
    }
  }
  
  // 导入设置
  async importSettings(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (!data.settings || !data.configs) {
        throw new Error('无效的设置文件格式');
      }
      
      // 导入设置
      this.settings = { ...this.settings, ...data.settings };
      
      // 导入配置
      const importedConfigs = new Map(Object.entries(data.configs));
      for (const [name, config] of importedConfigs) {
        this.configs.set(name, config);
      }
      
      await this.saveSettings();
      await this.saveConfigs();
      this.updateUI();
      
      utils.showToast('设置导入成功', 'success');
    } catch (error) {
      utils.showToast('导入设置失败: ' + error.message, 'error');
    }
  }
  
  // 获取字体列表
  async getAvailableFonts() {
    try {
      // 基础字体列表
      const systemFonts = [
        'Microsoft YaHei',
        'SimHei',
        'SimSun',
        'KaiTi',
        'Arial',
        'Times New Roman'
      ];
      
      // 获取自定义字体
      let customFonts = [];
      if (window.electronAPI && window.electronAPI.invoke) {
        try {
          const customFontList = await window.electronAPI.invoke('get-custom-fonts');
          if (customFontList && customFontList.length > 0) {
            customFonts = customFontList.map(font => font.name);
            console.log('获取到的自定义字体:', customFonts);
          }
        } catch (error) {
          console.warn('获取自定义字体列表失败:', error);
        }
      }
      
      // 合并字体列表，去重
      const allFonts = [...new Set([...customFonts, ...systemFonts])];
      
      console.log('最终字体列表:', allFonts);
      return allFonts;
    } catch (error) {
      console.error('获取字体列表失败:', error);
      // 返回默认字体列表
      return ['Microsoft YaHei', 'SimHei', 'Arial'];
    }
  }
  
  // 初始化字体下拉列表
  async initFontSelector() {
    const fontSelect = document.getElementById('title-font-family');
    if (!fontSelect) return;
    
    try {
      // 先加载自定义字体
      await this.loadCustomFonts();
      
      const fonts = await this.getAvailableFonts();
      
      // 清空现有选项
      fontSelect.innerHTML = '';
      
      // 添加字体选项
      fonts.forEach(font => {
        const option = document.createElement('option');
        option.value = font;
        option.textContent = this.getFontDisplayName(font);
        fontSelect.appendChild(option);
      });
      
      // 设置当前选中的字体
      fontSelect.value = this.settings.title.fontFamily;
    } catch (error) {
      console.error('初始化字体选择器失败:', error);
    }
  }
  
  // 加载自定义字体
  async loadCustomFonts() {
    try {
      console.log('开始加载自定义字体...');
      
      if (!window.electronAPI || !window.electronAPI.invoke) {
        console.log('electronAPI 未初始化，跳过自定义字体加载');
        return;
      }
      
      // 获取自定义字体列表
      const customFonts = await window.electronAPI.invoke('get-custom-fonts');
      console.log('获取到的自定义字体:', customFonts);
      
      if (!customFonts || customFonts.length === 0) {
        console.log('没有找到自定义字体文件');
        return;
      }
      
      // 加载每个字体文件
      for (const font of customFonts) {
        try {
          console.log(`正在加载字体: ${font.name} (${font.filename})`);
          
          // 获取字体文件数据
          const fontData = await window.electronAPI.invoke('get-font-data', font.path);
          
          if (fontData) {
            // 创建字体面
            const fontFace = new FontFace(font.name, `url(data:font/truetype;base64,${fontData})`);
            
            // 加载字体
            await fontFace.load();
            
            // 添加到文档字体集合
            document.fonts.add(fontFace);
            
            console.log(`字体 ${font.name} 加载成功`);
          } else {
            console.warn(`无法读取字体文件: ${font.filename}`);
          }
        } catch (fontError) {
          console.error(`加载字体 ${font.name} 失败:`, fontError);
        }
      }
      
      console.log('自定义字体加载完成');
      
    } catch (error) {
      console.error('字体初始化失败:', error);
    }
  }
  
  // 获取字体显示名称
  getFontDisplayName(fontName) {
    const displayNames = {
      'Microsoft YaHei': '微软雅黑',
      'SimHei': '黑体',
      'SimSun': '宋体',
      'KaiTi': '楷体',
      'Arial': 'Arial',
      'Times New Roman': 'Times New Roman',
      'Helvetica': 'Helvetica',
      'Georgia': 'Georgia',
      'Verdana': 'Verdana'
    };
    
    return displayNames[fontName] || fontName;
  }
  
  // 预览标题页
  async previewTitlePage() {
    if (!this.settings.title.text.trim()) {
      utils.showToast('请先输入标题内容', 'warning');
      return;
    }
    
    try {
      const canvas = await this.createTitlePageCanvas();
      const dataUrl = canvas.toDataURL('image/png');
      
      // 在新窗口中显示预览
      const previewWindow = window.open('', '_blank', 'width=800,height=600');
      previewWindow.document.write(`
        <html>
          <head><title>标题页预览</title></head>
          <body style="margin:0;padding:20px;background:#f0f0f0;display:flex;justify-content:center;align-items:center;min-height:100vh;">
            <img src="${dataUrl}" style="max-width:100%;max-height:100%;border:1px solid #ccc;box-shadow:0 4px 8px rgba(0,0,0,0.1);">
          </body>
        </html>
      `);
    } catch (error) {
      utils.showToast('预览标题页失败: ' + error.message, 'error');
    }
  }
  
  // 创建标题页Canvas
  async createTitlePageCanvas() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // 设置画布尺寸
    canvas.width = this.settings.outputWidth;
    canvas.height = 350;
    
    // 填充背景
    ctx.fillStyle = this.settings.title.backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 设置字体
    ctx.fillStyle = this.settings.title.color;
    ctx.font = `${this.settings.title.fontSize}px "${this.settings.title.fontFamily}"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // 绘制文本（支持换行）
    const lines = this.settings.title.text.split('\n');
    const lineHeight = this.settings.title.fontSize * 1.2;
    const totalHeight = lines.length * lineHeight;
    const startY = (canvas.height - totalHeight) / 2 + lineHeight / 2;
    
    lines.forEach((line, index) => {
      const y = startY + index * lineHeight;
      ctx.fillText(line, canvas.width / 2, y);
    });
    
    return canvas;
  }
  
  // 刷新显示
  refreshDisplay() {
    this.updateUI();
  }
}

// 创建全局设置管理器实例
window.settingsManager = new SettingsManager();