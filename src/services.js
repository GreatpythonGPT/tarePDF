'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const Model = require('./shared/model');

// Replacement is atomic: failure must leave the previous destination intact.
async function atomicWrite(destination, bytes, io = fs) {
  const temporary = path.join(path.dirname(destination), `.${path.basename(destination)}.${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await io.open(temporary, 'wx', 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = null;
    await io.rename(temporary, destination);
  } finally {
    if (handle) await handle.close().catch(() => {});
    await io.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') console.warn('Temporary file cleanup:', error.message); });
  }
}
function validatePdf(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 8 || bytes.byteLength > Model.LIMITS.pdfBytes) throw new Error('PDF 数据无效或超过 256 MB，请降低宽度或分批导出');
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('文件内容不是 PDF');
  return buffer;
}
function validateSender(event, contents, expectedURL) {
  if (!contents || contents.isDestroyed() || event.sender !== contents ||
      event.senderFrame !== contents.mainFrame || event.senderFrame.url !== expectedURL) {
    throw new Error('拒绝未授权的窗口请求');
  }
}
class WorkspaceStore {
  constructor(directory) {
    this.directory = directory;
    this.filename = path.join(directory, 'workspace-v2.json');
    this.tail = Promise.resolve();
    this.readOnly = false;
  }
  async readJson(filename) {
    const stat = await fs.stat(filename);
    if (stat.size > Model.LIMITS.workspaceChars) throw new Error('配置文件超过 32 MB');
    return JSON.parse(await fs.readFile(filename, 'utf8'));
  }
  async load() {
    let warning = '', workspace;
    try {
      const raw = await this.readJson(this.filename);
      if (raw.version !== 2) {
        this.readOnly = true;
        throw new Error('配置版本不兼容。为保护原文件，本次不自动保存设置。');
      }
      workspace = Model.normalizeWorkspace(raw, true);
    } catch (error) {
      if (this.readOnly) return { workspace: Model.normalizeWorkspace({}), warning: error.message, readOnly: true };
      if (error.code !== 'ENOENT') {
        // Never overwrite a damaged file until a verbatim backup succeeds.
        try {
          await fs.copyFile(this.filename, `${this.filename}.backup-${Date.now()}`);
          warning = '旧配置损坏，已保留备份并恢复默认设置。';
        } catch {
          this.readOnly = true;
          return { workspace: Model.normalizeWorkspace({}), warning: '配置无法读取或备份。本次设置不会保存，原文件未改动。', readOnly: true };
        }
      } else {
        try {
          workspace = Model.migrateLegacy(await this.readJson(path.join(this.directory, 'config.json')));
          warning = '已迁移旧版设置和命名配置。旧版图片水印请重新选择一次，原配置文件未改动。';
        } catch (legacyError) {
          if (legacyError.code !== 'ENOENT') warning = '旧版配置无法迁移，原文件已保留；本次使用默认设置。';
        }
      }
    }
    return { workspace: workspace || Model.normalizeWorkspace({}), warning, readOnly: false };
  }
  save(input) {
    if (this.readOnly) return Promise.reject(new Error('为保护现有配置，本次禁止覆盖；请先处理配置读取提示'));
    // Normalize and freeze the serialized snapshot before enqueueing the write.
    const text = JSON.stringify(Model.normalizeWorkspace(input, true));
    if (Buffer.byteLength(text) > Model.LIMITS.workspaceChars) throw new Error('配置总大小超过 32 MB，请减少图片水印或命名配置');
    const operation = this.tail.catch(() => {}).then(async () => {
      await fs.mkdir(this.directory, { recursive: true });
      await atomicWrite(this.filename, text);
      return { status: 'saved' };
    });
    this.tail = operation;
    return operation;
  }
}
function createPdfService({ choosePath, openPath, write = atomicWrite }) {
  const savedFiles = new Map();
  let saving = false;
  return {
    get saving() { return saving; },
    async save(bytes, suggestedName) {
      if (saving) throw new Error('已有保存操作正在进行');
      const data = validatePdf(bytes);
      saving = true;
      try {
        const result = await choosePath(Model.safeFilename(suggestedName));
        if (result.canceled || !result.filePath) return { status: 'cancelled' };
        let destination = result.filePath;
        if (!path.extname(destination)) destination += '.pdf';
        if (path.extname(destination).toLowerCase() !== '.pdf') throw new Error('请选择 .pdf 文件名');
        await write(destination, data);
        const id = randomUUID();
        savedFiles.set(id, destination);
        while (savedFiles.size > 20) savedFiles.delete(savedFiles.keys().next().value);
        return { status: 'saved', id, filePath: destination, name: path.basename(destination), bytes: data.length };
      } finally { saving = false; }
    },
    async open(id) {
      if (typeof id !== 'string' || !savedFiles.has(id)) throw new Error('只能打开本次已成功保存的 PDF');
      const error = await openPath(savedFiles.get(id));
      if (error) throw new Error(`PDF 已保存，但系统无法打开：${error}`);
      return { status: 'opened' };
    }
  };
}
module.exports = { atomicWrite, validatePdf, validateSender, WorkspaceStore, createPdfService };
