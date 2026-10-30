const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kiosk', {
  onKeyDown: (handler) => ipcRenderer.on('key-down', (_event, code) => handler(code)),
  onKeyUp: (handler) => ipcRenderer.on('key-up', (_event, code) => handler(code)),
});
