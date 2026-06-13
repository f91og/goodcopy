const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('goodcopy', {
  listEntries: () => ipcRenderer.invoke('entries:list'),
  updateEntry: (entry) => ipcRenderer.invoke('entries:update', entry),
  deleteEntry: (id) => ipcRenderer.invoke('entries:delete', id),
  clearUntaggedEntries: () => ipcRenderer.invoke('entries:clear-untagged'),
  pasteEntry: (entry) => ipcRenderer.invoke('entries:paste', entry),
  copyEntry: (id) => ipcRenderer.invoke('entries:copy', id),
  getStorageUsage: () => ipcRenderer.invoke('storage:usage'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings),
  getAiStatus: (provider) => ipcRenderer.invoke('ai:status', provider),
  loginAi: (provider) => ipcRenderer.invoke('ai:login', provider),
  testAi: (provider) => ipcRenderer.invoke('ai:test', provider),
  getAccessibilityStatus: () => ipcRenderer.invoke('permissions:accessibility-status'),
  requestAccessibility: () => ipcRenderer.invoke('permissions:request-accessibility'),
  hideWindow: () => ipcRenderer.invoke('window:hide'),
  quitApp: () => ipcRenderer.invoke('app:quit'),
  onEntriesChanged: (callback) => {
    ipcRenderer.on('entries-changed', (_event, entries) => callback(entries));
  },
  onPanelOpened: (callback) => {
    ipcRenderer.on('panel-opened', callback);
  }
});
