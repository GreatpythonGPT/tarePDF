const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('studio', Object.freeze({
  openProject: () => ipcRenderer.invoke('project:open'),
  saveProject: (json, saveAs = false) => ipcRenderer.invoke('project:save', json, saveAs),
  saveExport: (bytes, format, name) => ipcRenderer.invoke('export:save', bytes, format, name),
  loadDraft: () => ipcRenderer.invoke('draft:load'),
  saveDraft: json => ipcRenderer.invoke('draft:save', json),
  newProject: () => ipcRenderer.invoke('project:new'),
  setDirty: dirty => ipcRenderer.send('document:dirty', !!dirty)
}));
