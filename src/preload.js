const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('goodcopy', {
  listEntries: (options) => ipcRenderer.invoke('entries:list', options),
  listTags: () => ipcRenderer.invoke('entries:tags'),
  updateEntry: (entry) => ipcRenderer.invoke('entries:update', entry),
  deleteEntry: (id) => ipcRenderer.invoke('entries:delete', id),
  pasteEntry: (entry) => ipcRenderer.invoke('entries:paste', entry),
  copyEntry: (id) => ipcRenderer.invoke('entries:copy', id),
  pinEntryToDesktop: (entry) => ipcRenderer.invoke('desktop:pin', entry),
  getStorageUsage: () => ipcRenderer.invoke('storage:usage'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings),
  notifyInternalCopy: (text) => ipcRenderer.send('clipboard:internal-copy', text),
  getGithubStatus: () => ipcRenderer.invoke('github:status'),
  loginGithub: () => ipcRenderer.invoke('github:login'),
  getAiStatus: (provider) => ipcRenderer.invoke('ai:status', provider),
  loginAi: (provider) => ipcRenderer.invoke('ai:login', provider),
  testAi: (provider) => ipcRenderer.invoke('ai:test', provider),
  getAccessibilityStatus: () => ipcRenderer.invoke('permissions:accessibility-status'),
  requestAccessibility: () => ipcRenderer.invoke('permissions:request-accessibility'),
  hideWindow: () => ipcRenderer.invoke('window:hide'),
  quitApp: () => ipcRenderer.invoke('app:quit'),
  onEntriesChanged: (callback) => {
    ipcRenderer.on('entries-changed', (_event, change) => callback(change));
  },
  onPanelOpened: (callback) => {
    ipcRenderer.on('panel-opened', callback);
  }
});
