const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  // Invoke-based update API (Promise döndürür)
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // FAZ 19.3: Ekran paylaşımı için desktopCapturer köprüsü
  // types: ['window', 'screen'] — thumbnailSize: { width, height }
  getDesktopSources: (types, thumbnailSize) =>
    ipcRenderer.invoke('get-desktop-sources', { types, thumbnailSize }),

  // Event listener'lar — her biri unsubscribe fonksiyonu döndürür
  onUpdateStatus: (callback) => {
    const listener = (event, status, info) => callback(status, info);
    ipcRenderer.on('update-status', listener);
    return () => ipcRenderer.removeListener('update-status', listener);
  },
  onUpdateProgress: (callback) => {
    const listener = (event, p) => callback(p);
    ipcRenderer.on('update-progress', listener);
    return () => ipcRenderer.removeListener('update-progress', listener);
  },
  onUpdateError: (callback) => {
    const listener = (event, msg) => callback(msg);
    ipcRenderer.on('update-error', listener);
    return () => ipcRenderer.removeListener('update-error', listener);
  },

  // Deep link listener — Electron main process'ten gelen davet linklerini dinle
  onDeepLink: (callback) => {
    const listener = (event, url) => callback(url);
    ipcRenderer.on('deep-link', listener);
    return () => ipcRenderer.removeListener('deep-link', listener);
  },
});
