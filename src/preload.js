'use strict';
const { contextBridge, ipcRenderer } = require('electron');
// No generic invoke, file path reads, arbitrary writes, event objects or Node APIs.
contextBridge.exposeInMainWorld('tareAPI', Object.freeze({
  loadWorkspace: () => ipcRenderer.invoke('workspace:load'),
  saveWorkspace: workspace => ipcRenderer.invoke('workspace:save', workspace),
  savePdf: (bytes, name) => ipcRenderer.invoke('pdf:save', bytes, name),
  openSavedPdf: id => ipcRenderer.invoke('pdf:open', id),
  setStatus: status => ipcRenderer.invoke('window:status', status),
  onBeforeClose: callback => {
    const listener = (_event, token) => {
      Promise.resolve().then(callback).then(
        () => ipcRenderer.invoke('window:flushed', token, ''),
        error => ipcRenderer.invoke('window:flushed', token, String(error.message).slice(0, 500))
      ).catch(() => {});
    };
    ipcRenderer.on('window:flush', listener);
    return () => ipcRenderer.removeListener('window:flush', listener);
  },
  onMenu: callback => {
    const listener = (_event, command) => {
      if (['import', 'export', 'preview'].includes(command)) callback(command);
    };
    ipcRenderer.on('menu:command', listener);
    return () => ipcRenderer.removeListener('menu:command', listener);
  }
}));
