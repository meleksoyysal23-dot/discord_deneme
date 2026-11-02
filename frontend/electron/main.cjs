const { app, BrowserWindow, session, dialog, ipcMain } = require('electron');
const path = require('path');
const { Menu } = require('electron');
const { autoUpdater } = require('electron-updater');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#0f172a', // slate-900
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // Microphone permissions
      sandbox: false,
    },
    show: false,
  });

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Disable menu bar (app ready olmalı)
  Menu.setApplicationMenu(null);

  // Auto-grant microphone permissions (app ready olmalı)
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media' || permission === 'microphone' || permission === 'camera') {
      callback(true);
    } else {
      callback(false);
    }
  });

  createWindow();

  // Auto-updater yapılandırması
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // Güncelleme kontrolü (3 saniye sonra)
  setTimeout(() => {
    checkForUpdates();
  }, 3000);

  // autoUpdater event listener'ları
  autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] Checking for update...');
    if (mainWindow) mainWindow.webContents.send('update-status', 'checking');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] Update available:', info.version);
    if (mainWindow) mainWindow.webContents.send('update-status', 'available', info);
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[Updater] No updates available');
    if (mainWindow) mainWindow.webContents.send('update-status', 'not-available', info);
  });

  autoUpdater.on('download-progress', (progress) => {
    console.log(`[Updater] Download progress: ${progress.percent}%`);
    if (mainWindow) mainWindow.webContents.send('update-progress', progress);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[Updater] Update downloaded');
    if (mainWindow) mainWindow.webContents.send('update-status', 'downloaded', info);

    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Güncelleme Hazır',
      message: 'Yeni sürüm indirildi ve kurulmaya hazır!',
      detail: 'Uygulama şimdi yeniden başlatılacak.',
      buttons: ['Şimdi Yeniden Başlat', 'Daha Sonra'],
      defaultId: 0,
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  autoUpdater.on('error', (error) => {
    console.error('[Updater] Error:', error);
    if (mainWindow) mainWindow.webContents.send('update-error', error.message);
  });
});

async function checkForUpdates() {
  try {
    console.log('[Updater] Checking for updates...');
    const updateCheckResult = await autoUpdater.checkForUpdates();

    if (updateCheckResult && updateCheckResult.updateInfo) {
      const updateInfo = updateCheckResult.updateInfo;
      console.log('[Updater] Update available:', updateInfo.version);

      const response = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Güncelleme Mevcut',
        message: `Vibe-Voice ${updateInfo.version} sürümü mevcut!`,
        detail: 'Şimdi indirmek ve kurmak ister misiniz?',
        buttons: ['Şimdi İndir', 'Daha Sonra'],
        defaultId: 0,
        cancelId: 1,
      });

      if (response.response === 0) {
        await autoUpdater.downloadUpdate();
      }
    }
  } catch (error) {
    console.error('[Updater] Check failed:', error);
  }
}

ipcMain.on('check-for-updates', () => {
  checkForUpdates();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
