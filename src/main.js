'use strict';
const { app, BrowserWindow, ipcMain, dialog, Menu, protocol, session, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { WorkspaceStore, createPdfService, validateSender } = require('./services');
const APP_URL = 'tare://app/index.html';
protocol.registerSchemesAsPrivileged([{ scheme: 'tare', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
let window, store, pdf, status = { hasImages: false, busy: false };
let allowClose = false, closePrompt = false, rendererReady = false, pendingFlush;

const resources = new Map([
  ['/index.html', ['renderer/index.html', 'text/html; charset=utf-8']],
  ['/styles/main.css', ['renderer/styles/main.css', 'text/css; charset=utf-8']],
  ['/scripts/app.js', ['renderer/scripts/app.js', 'text/javascript; charset=utf-8']],
  ['/scripts/document.js', ['renderer/scripts/document.js', 'text/javascript; charset=utf-8']],
  ['/shared/model.js', ['shared/model.js', 'text/javascript; charset=utf-8']],
  ['/vendor/pdf-lib.min.js', ['renderer/vendor/pdf-lib.min.js', 'text/javascript; charset=utf-8']]
]);
async function serve(request) {
  const url = new URL(request.url);
  const resource = url.hostname === 'app' && request.method === 'GET' && !url.search ? resources.get(url.pathname) : null;
  if (!resource) return new Response('Not found', { status: 404 });
  try {
    return new Response(await fs.readFile(path.join(__dirname, resource[0])), {
      headers: { 'Content-Type': resource[1], 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' }
    });
  } catch {
    return new Response('Application resource unavailable. Run npm run prepare.', { status: 500 });
  }
}
function handle(channel, callback) {
  ipcMain.handle(channel, (event, ...args) => {
    validateSender(event, window?.webContents, APP_URL);
    return callback(...args);
  });
}
function createWindow() {
  allowClose = false; rendererReady = false;
  status = { hasImages: false, busy: false };
  window = new BrowserWindow({ width: 1440, height: 940, minWidth: 960, minHeight: 680,
    title: 'tarePDF', backgroundColor: '#f6f7f9', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true,
      nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: false }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.webContents.on('preload-error', (_event, _filename, error) => dialog.showErrorBox('启动失败', error.message));
  window.once('ready-to-show', () => window.show());
  window.on('close', event => {
    if (allowClose) return;
    event.preventDefault();
    if (closePrompt) return;
    closePrompt = true;
    (async () => {
      if (pdf.saving) {
        await dialog.showMessageBox(window, { type: 'info', message: '请完成当前保存操作后再关闭窗口。' });
        return;
      }
      if (status.hasImages || status.busy) {
        const result = await dialog.showMessageBox(window, { type: 'question', buttons: ['继续工作', '关闭'], defaultId: 0, cancelId: 0,
          message: status.busy ? '正在处理文稿，确认中止并关闭？' : '确认关闭当前文稿？',
          detail: '设置会保留。当前图片列表和排序不会自动恢复，磁盘上的原图不会被修改。' });
        if (result.response !== 1) return;
      }
      try {
        if (rendererReady && !store.readOnly) await new Promise((resolve, reject) => {
          const token = randomUUID();
          const timer = setTimeout(() => { pendingFlush = null; reject(new Error('设置保存确认超时')); }, 8000);
          pendingFlush = { token, finish: error => { clearTimeout(timer); pendingFlush = null; error ? reject(new Error(error)) : resolve(); } };
          window.webContents.send('window:flush', token);
        });
        await store.tail;
      } catch (error) {
        const result = await dialog.showMessageBox(window, { type: 'warning', buttons: ['返回处理', '仍然关闭'], defaultId: 0, cancelId: 0,
          message: '最新设置未能保存', detail: error.message });
        if (result.response !== 1) return;
      }
      allowClose = true; window.close();
    })().catch(error => dialog.showErrorBox('关闭失败', error.message)).finally(() => { closePrompt = false; });
  });
  window.on('closed', () => { window = null; });
  window.loadURL(APP_URL).catch(error => dialog.showErrorBox('启动失败', error.message));
  if (process.argv.includes('--dev')) window.webContents.openDevTools({ mode: 'detach' });
}
app.whenReady().then(() => {
  store = new WorkspaceStore(app.getPath('userData'));
  pdf = createPdfService({
    choosePath: defaultPath => dialog.showSaveDialog(window, { title: '保存演示 PDF', defaultPath,
      filters: [{ name: 'PDF 文稿', extensions: ['pdf'] }], properties: ['showOverwriteConfirmation'] }),
    openPath: filename => shell.openPath(filename)
  });
  protocol.handle('tare', serve);
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*', 'file://*/*'] },
    (_details, callback) => callback({ cancel: true }));
  handle('workspace:load', () => store.load());
  handle('workspace:save', value => store.save(value));
  handle('pdf:save', (bytes, name) => pdf.save(bytes, name));
  handle('pdf:open', id => pdf.open(id));
  handle('window:status', value => {
    if (!value || typeof value.hasImages !== 'boolean' || typeof value.busy !== 'boolean') throw new Error('窗口状态无效');
    rendererReady = true; status = { hasImages: value.hasImages, busy: value.busy };
  });
  handle('window:flushed', (token, error) => {
    if (pendingFlush?.token !== token || typeof error !== 'string' || error.length > 500) throw new Error('关闭确认无效');
    pendingFlush.finish(error);
  });
  const send = command => { if (window && !window.isDestroyed()) window.webContents.send('menu:command', command); };
  const fileMenu = { label: '文件', submenu: [
    { label: '导入图片', accelerator: 'CmdOrCtrl+I', click: () => send('import') },
    { label: '预览文稿', accelerator: 'CmdOrCtrl+P', click: () => send('preview') },
    { label: '导出 PDF', accelerator: 'CmdOrCtrl+E', click: () => send('export') },
    { type: 'separator' }, { role: 'close', label: '关闭窗口' }
  ] };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []), fileMenu,
    { label: '视图', submenu: [{ role: 'togglefullscreen', label: '全屏' },
      ...(process.argv.includes('--dev') ? [{ role: 'toggleDevTools', label: '开发者工具' }] : [])] }
  ]));
  createWindow();
}).catch(error => { dialog.showErrorBox('tarePDF 启动失败', error.message); app.quit(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0 && store) createWindow(); });
