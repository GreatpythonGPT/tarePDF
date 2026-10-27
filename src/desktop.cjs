const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
// An explicit launch-time profile is used by integration tests and portable workflows.
if (process.env.TARE_STUDIO_PROFILE) app.setPath('userData', path.resolve(process.env.TARE_STUDIO_PROFILE));
let window, projectPath = null, dirty = false, closing = false, draftSaved = false;
let dirtySerial = 0;
let draftQueue = Promise.resolve();
const indexPath = path.join(__dirname, '../app/index.html');
const allowedURL = pathToFileURL(indexPath).href;
const MAX_BYTES = 350 * 1024 * 1024;
const draftPath = () => path.join(app.getPath('userData'), 'studio-v2-draft.json');
function verify(event) {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== allowedURL) throw new Error('不允许的请求来源');
}
function checkJSON(json) {
  if (typeof json !== 'string' || Buffer.byteLength(json) > MAX_BYTES) throw new Error('作品文件超过 350 MB，请分成多个作品保存');
  const doc = JSON.parse(json);
  if (doc?.version !== 2 || !Array.isArray(doc.pages)) throw new Error('无效的作品文件');
}
async function atomicWrite(filePath, data) {
  const temporary = `${filePath}.${process.pid}.tmp`;
  try { await fs.writeFile(temporary, data); await fs.rename(temporary, filePath); }
  catch (error) { await fs.unlink(temporary).catch(() => {}); throw error; }
}
function handle(channel, handler) { ipcMain.handle(channel, async (event, ...args) => { verify(event); return handler(...args); }); }
handle('project:open', async () => {
  const result = await dialog.showOpenDialog(window, { title: '打开可编辑作品', properties: ['openFile'], filters: [{ name: 'Tare Studio 作品', extensions: ['tare'] }] });
  if (result.canceled) return null;
  const filePath = result.filePaths[0];
  if ((await fs.stat(filePath)).size > MAX_BYTES) throw new Error('作品文件过大');
  const json = await fs.readFile(filePath, 'utf8'); checkJSON(json);
  projectPath = null;
  return { json, name: path.basename(filePath) };
});
handle('project:save', async (json, saveAs) => {
  checkJSON(json);
  let target = projectPath;
  if (!target || saveAs) {
    const name = JSON.parse(json).name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 100) || '我的作品';
    const result = await dialog.showSaveDialog(window, { title: '保存可编辑作品', defaultPath: `${name}.tare`, filters: [{ name: 'Tare Studio 作品', extensions: ['tare'] }] });
    if (result.canceled) return { canceled: true };
    target = result.filePath.endsWith('.tare') ? result.filePath : `${result.filePath}.tare`;
  }
  await atomicWrite(target, json); projectPath = target;
  return { canceled: false, name: path.basename(target) };
});
handle('export:save', async (bytes, format, name) => {
  if (!['pdf', 'png'].includes(format) || !(bytes instanceof Uint8Array) || bytes.byteLength > MAX_BYTES) throw new Error('无效的导出文件');
  const data = Buffer.from(bytes);
  if (format === 'pdf' ? data.subarray(0, 5).toString() !== '%PDF-' : data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('导出文件格式错误');
  const safeName = String(name || '我的作品').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 100);
  const result = await dialog.showSaveDialog(window, { title: `导出 ${format.toUpperCase()}`, defaultPath: `${safeName}.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] });
  if (result.canceled) return { canceled: true };
  const target = result.filePath.toLowerCase().endsWith(`.${format}`) ? result.filePath : `${result.filePath}.${format}`;
  await atomicWrite(target, data); return { canceled: false, name: path.basename(target) };
});
handle('draft:load', async () => {
  try { if ((await fs.stat(draftPath())).size > MAX_BYTES) return null; return await fs.readFile(draftPath(), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
});
handle('draft:save', json => {
  checkJSON(json); draftSaved = false; const serial = dirtySerial;
  const next = draftQueue.then(async () => { await fs.mkdir(path.dirname(draftPath()), { recursive: true }); await atomicWrite(draftPath(), json); draftSaved = serial === dirtySerial; });
  draftQueue = next.catch(() => {}); return next;
});
handle('project:new', () => { projectPath = null; });
ipcMain.on('document:dirty', (event, value) => { try { verify(event); } catch { return; } dirty = value === true; if (dirty) { dirtySerial++; draftSaved = false; } });
function createWindow() {
  window = new BrowserWindow({ width: 1500, height: 960, minWidth: 1120, minHeight: 720, backgroundColor: '#f2f3ef', title: 'Tare Studio · 图片编排', icon: path.join(__dirname, '../assets/icon.png'), show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } });
  Menu.setApplicationMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (url !== allowedURL) event.preventDefault(); });
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.loadFile(indexPath);
  window.once('ready-to-show', () => window.show());
  window.on('close', event => {
    if (!dirty || closing) return;
    event.preventDefault();
    dialog.showMessageBox(window, { type: 'question', title: '关闭作品', message: '作品还有未保存的修改', detail: draftSaved ? '已保存自动恢复副本，下次打开可继续编辑。建议使用“保存作品”保存独立文件。' : '请先保存作品，以免丢失刚刚进行的修改。', buttons: ['继续编辑', '关闭窗口'], defaultId: 0, cancelId: 0 }).then(({ response }) => { if (response === 1) { closing = true; window.close(); } });
  });
  if (process.argv.includes('--dev')) window.webContents.openDevTools({ mode: 'detach' });
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) { closing = false; createWindow(); } });
