const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');

// 创建配置存储
const store = new Store();

let mainWindow;

function createWindow() {
  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../assets/icon.png'),
    show: false,
    titleBarStyle: 'default'
  });

  // 加载应用的 index.html
  console.log('正在加载 index.html...');
  console.log('preload 路径:', path.join(__dirname, 'preload.js'));
  
  // 监听预加载脚本错误
  mainWindow.webContents.on('preload-error', (event, preloadPath, error) => {
    console.error('预加载脚本错误:', preloadPath, error);
  });
  
  // 监听页面加载完成
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('页面加载完成');
    // 检查预加载脚本是否正确执行
    mainWindow.webContents.executeJavaScript('console.log("检查 electronAPI:", typeof window.electronAPI);');
  });
  
  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  // 窗口准备好后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 当窗口被关闭时，这个事件会被触发
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 开发时打开开发者工具
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

// 这段程序将会在 Electron 结束初始化和创建浏览器窗口的时候调用
app.whenReady().then(createWindow);

// 当全部窗口关闭时退出
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC 处理程序

// 打开文件选择对话框
ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: '图片文件',
        extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp']
      }
    ]
  });
  return result;
});

// 选择水印文件
ipcMain.handle('select-watermark', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      {
        name: 'PNG 图片',
        extensions: ['png']
      }
    ]
  });
  return result;
});

// 保存PDF文件对话框
ipcMain.handle('save-pdf-dialog', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [
      {
        name: 'PDF 文件',
        extensions: ['pdf']
      }
    ],
    defaultPath: `渲染图集_${new Date().toISOString().slice(0, 10)}.pdf`
  });
  return result;
});

// 保存PDF文件
ipcMain.handle('save-pdf', async (event, { filePath, pdfBytes }) => {
  try {
    // 将Uint8Array转换为Buffer
    const buffer = Buffer.from(pdfBytes);
    fs.writeFileSync(filePath, buffer);
    return { success: true, filePath };
  } catch (error) {
    console.error('保存PDF失败:', error);
    return { success: false, error: error.message };
  }
});

// 打开PDF文件
ipcMain.handle('open-pdf', async (event, filePath) => {
  try {
    const { shell } = require('electron');
    await shell.openPath(filePath);
    return { success: true };
  } catch (error) {
    console.error('打开PDF失败:', error);
    return { success: false, error: error.message };
  }
});

// 读取文件
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const data = fs.readFileSync(filePath);
    return data;
  } catch (error) {
    throw error;
  }
});

// 写入文件
ipcMain.handle('write-file', async (event, filePath, data) => {
  try {
    fs.writeFileSync(filePath, data);
    return true;
  } catch (error) {
    throw error;
  }
});

// 存储配置
ipcMain.handle('store-set', (event, key, value) => {
  store.set(key, value);
});

// 获取配置
ipcMain.handle('store-get', (event, key, defaultValue) => {
  return store.get(key, defaultValue);
});

// 删除配置
ipcMain.handle('store-delete', (event, key) => {
  store.delete(key);
});

// 获取所有配置
ipcMain.handle('store-get-all', () => {
  return store.store;
});

// 设置菜单
const template = [
  {
    label: '文件',
    submenu: [
      {
        label: '导入图片',
        accelerator: 'CmdOrCtrl+I',
        click: () => {
          mainWindow.webContents.send('menu-import-images');
        }
      },
      {
        label: '导出PDF',
        accelerator: 'CmdOrCtrl+E',
        click: () => {
          mainWindow.webContents.send('menu-export-pdf');
        }
      },
      { type: 'separator' },
      {
        label: '退出',
        accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
        click: () => {
          app.quit();
        }
      }
    ]
  },
  {
    label: '编辑',
    submenu: [
      {
        label: '全选',
        accelerator: 'CmdOrCtrl+A',
        click: () => {
          mainWindow.webContents.send('menu-select-all');
        }
      },
      {
        label: '清空选择',
        accelerator: 'CmdOrCtrl+D',
        click: () => {
          mainWindow.webContents.send('menu-clear-selection');
        }
      }
    ]
  },
  {
    label: '视图',
    submenu: [
      {
        label: '重新加载',
        accelerator: 'CmdOrCtrl+R',
        click: () => {
          mainWindow.reload();
        }
      },
      {
        label: '开发者工具',
        accelerator: 'F12',
        click: () => {
          mainWindow.webContents.toggleDevTools();
        }
      }
    ]
  }
];

const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);

// 获取系统字体列表
ipcMain.handle('get-system-fonts', async () => {
  try {
    // 返回常用的中文和英文字体
    return [
      'Microsoft YaHei',
      'SimHei',
      'SimSun',
      'KaiTi',
      'Arial',
      'Times New Roman',
      'Helvetica',
      'Georgia',
      'Verdana'
    ];
  } catch (error) {
    console.error('获取系统字体失败:', error);
    return ['Microsoft YaHei', 'Arial'];
  }
});

// 获取自定义字体列表
ipcMain.handle('get-custom-fonts', async () => {
  try {
    // 获取正确的字体文件夹路径
    let fontsDir;
    if (app.isPackaged) {
      // 打包后的应用
      fontsDir = path.join(process.resourcesPath, 'fonts');
    } else {
      // 开发环境
      fontsDir = path.join(__dirname, '..', 'fonts');
    }
    
    console.log('字体文件夹路径:', fontsDir);
    
    // 检查fonts文件夹是否存在
    if (!fs.existsSync(fontsDir)) {
      console.log('字体文件夹不存在，尝试备用路径');
      // 尝试备用路径
      fontsDir = path.join(__dirname, '../fonts');
      if (!fs.existsSync(fontsDir)) {
        console.log('备用字体文件夹也不存在');
        return [];
      }
    }
    
    // 读取fonts文件夹中的字体文件
    const files = fs.readdirSync(fontsDir);
    console.log('找到的文件:', files);
    
    const fontFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ext === '.ttf' || ext === '.otf' || ext === '.ttc';
    });
    
    console.log('字体文件:', fontFiles);
    
    // 处理字体文件，特别处理微软雅黑
    const uniqueFonts = [];
    const processedNames = new Set();
    
    fontFiles.forEach(file => {
      let baseName = path.basename(file, path.extname(file));
      let displayName = baseName;
      
      // 特殊处理微软雅黑字体文件
      if (baseName === 'msyh') {
        displayName = 'Microsoft YaHei';
      } else if (baseName === 'msyhbd') {
        displayName = 'Microsoft YaHei Bold';
      } else if (baseName === 'msyhl') {
        displayName = 'Microsoft YaHei Light';
      }
      
      // 移除_0后缀
      if (baseName.endsWith('_0')) {
        baseName = baseName.slice(0, -2);
      }
      
      if (!processedNames.has(displayName)) {
        processedNames.add(displayName);
        uniqueFonts.push({
          name: displayName,
          filename: file,
          path: path.join(fontsDir, file),
          baseName: baseName
        });
      }
    });
    
    console.log('处理后的字体列表:', uniqueFonts);
    return uniqueFonts;
  } catch (error) {
    console.error('获取自定义字体失败:', error);
    return [];
  }
});

// 处理获取字体文件数据请求
ipcMain.handle('get-font-data', async (event, fontPath) => {
  try {
    console.log('读取字体文件:', fontPath);
    
    // 检查文件是否存在
    if (!fs.existsSync(fontPath)) {
      console.error('字体文件不存在:', fontPath);
      return null;
    }
    
    // 读取字体文件并转换为base64
    const fontBuffer = fs.readFileSync(fontPath);
    const base64Data = fontBuffer.toString('base64');
    
    console.log(`字体文件 ${path.basename(fontPath)} 读取成功，大小: ${fontBuffer.length} 字节`);
    return base64Data;
  } catch (error) {
    console.error('读取字体文件失败:', error);
    return null;
  }
});

// 监听预加载脚本完成事件
ipcMain.on('preload-ready', () => {
  console.log('预加载脚本执行完成');
});