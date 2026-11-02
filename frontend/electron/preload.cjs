const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  // Güncelleme API'leri
  onUpdateStatus: (callback) => {
    const listener = (event, status, info) => callback(status, info);
    ipcRenderer.on('update-status', listener);
    return () => ipcRenderer.removeListener('update-status', listener);
  },
  onUpdateProgress: (callback) => {
    const listener = (event, progress) => callback(progress);
    ipcRenderer.on('update-progress', listener);
    return () => ipcRenderer.removeListener('update-progress', listener);
  },
  onUpdateError: (callback) => {
    const listener = (event, error) => callback(error);
    ipcRenderer.on('update-error', listener);
    return () => ipcRenderer.removeListener('update-error', listener);
  },
  checkForUpdates: () => {
    ipcRenderer.send('check-for-updates');
  },
});
