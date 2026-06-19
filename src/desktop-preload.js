const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('goodcopyDesktop', {
  getContent: (token) => ipcRenderer.invoke('desktop:content', token),
  startDrag: () => ipcRenderer.invoke('desktop:drag-start'),
  moveTo: (x, y) => ipcRenderer.send('desktop:drag-move', { x, y })
});
