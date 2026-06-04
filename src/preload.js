const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('goodcopy', {
  listEntries: () => ipcRenderer.invoke('entries:list'),
  updateEntry: (entry) => ipcRenderer.invoke('entries:update', entry),
  deleteEntry: (id) => ipcRenderer.invoke('entries:delete', id),
  pasteEntry: (id) => ipcRenderer.invoke('entries:paste', id),
  copyEntry: (id) => ipcRenderer.invoke('entries:copy', id),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings),
  hideWindow: () => ipcRenderer.invoke('window:hide'),
  quitApp: () => ipcRenderer.invoke('app:quit'),
  onEntriesChanged: (callback) => {
    ipcRenderer.on('entries-changed', (_event, entries) => callback(entries));
  },
  onPanelOpened: (callback) => {
    ipcRenderer.on('panel-opened', callback);
  }
});
