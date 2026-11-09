const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktopUpdates', {
  check: () => ipcRenderer.invoke('updates:check'),
});
