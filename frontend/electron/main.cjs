const { app, BrowserWindow, session, ipcMain, desktopCapturer } = require('electron');
const path = require('path');
const { Menu } = require('electron');
const { autoUpdater } = require('electron-updater');

// ============ Deep Linking — voicecan:// Protocol ============
// Protocol registration (app ready'den ÖNCE yapılmalı)
const PROTOCOL_SCHEME = 'voicecan';

// Windows: Registry'ye protocol kaydet
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL_SCHEME, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);
}

// Deep link state — app açılırken gelen link'i saklamak için
let deepLinkUrl = null;

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
      sandbox: true,
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

  mainWindow.setTitle('VoiceCan');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();

    // macOS: App açılırken deep link gelmişse gönder
    if (deepLinkUrl) {
      console.log('[Deep Link] Sending deferred deep link:', deepLinkUrl);
      mainWindow.webContents.send('deep-link', deepLinkUrl);
      deepLinkUrl = null;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Hata mesajını sınıflandır: 404/No published → not-available, diğerleri → error
function classifyUpdateError(err) {
  const errMsg = (err && err.message) || String(err);
  const benign =
    errMsg.includes('No published versions') ||
    errMsg.includes('404') ||
    errMsg.includes('not found') ||
    errMsg.includes('ENOENT');
  return { benign, errMsg };
}

// Dialog açmayan, sadece event gönderen güncelleme kontrolü
async function runUpdateCheck() {
  const currentVersion = app.getVersion();

  // Dev-mode koruması: paketlenmemiş uygulamada güncelleme kontrolü yapılamaz
  if (!app.isPackaged) {
    const info = {
      status: 'not-available',
      version: currentVersion,
      currentVersion,
      message: 'Geliştirme modunda güncelleme kontrolü yapılamaz',
    };
    mainWindow?.webContents.send('update-status', 'not-available', info);
    return info;
  }

  try {
    mainWindow?.webContents.send('update-status', 'checking');
    const result = await autoUpdater.checkForUpdates();
    const version = result && result.updateInfo && result.updateInfo.version;

    if (version && version !== currentVersion) {
      const info = { status: 'available', version, currentVersion };
      mainWindow?.webContents.send('update-status', 'available', info);
      return info;
    }

    const info = {
      status: 'not-available',
      version: currentVersion,
      currentVersion,
    };
    mainWindow?.webContents.send('update-status', 'not-available', info);
    return info;
  } catch (error) {
    const { benign, errMsg } = classifyUpdateError(error);
    if (benign) {
      console.log('[Updater] No releases found, treating as up-to-date');
      const info = {
        status: 'not-available',
        version: currentVersion,
        currentVersion,
      };
      mainWindow?.webContents.send('update-status', 'not-available', info);
      return info;
    }
    console.error('[Updater] Check failed:', errMsg);
    const info = {
      status: 'error',
      message:
        'Güncelleme kontrol edilemedi. Lütfen internet bağlantınızı kontrol edip tekrar deneyin.',
    };
    mainWindow?.webContents.send('update-status', 'error', info);
    return info;
  }
}

// ============ Deep Linking — Single Instance Lock + Event Handlers ============
// Windows/Linux: İkinci instance açılmaya çalışıldığında deep link'i yakala
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    console.log('[Deep Link] second-instance:', commandLine);

    // Windows'ta deep link command line argument olarak gelir
    const deepLink = commandLine.find((arg) => arg.startsWith(`${PROTOCOL_SCHEME}://`));

    if (deepLink && mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      mainWindow.webContents.send('deep-link', deepLink);
    }
  });
}

// macOS: Deep link yakalama (app kapalıyken veya açıkken)
app.on('open-url', (event, url) => {
  event.preventDefault();
  console.log('[Deep Link] open-url:', url);

  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    mainWindow.webContents.send('deep-link', url);
  } else {
    // App henüz açılmamış — URL'yi sakla, ready-to-show'da gönder
    deepLinkUrl = url;
  }
});

app.whenReady().then(() => {
  app.setName('VoiceCan');

  console.log('[Updater] App version:', app.getVersion());
  console.log('[Updater] Packaged:', app.isPackaged);

  // Disable menu bar (app ready olmalı)
  Menu.setApplicationMenu(null);

  // Yalnızca sesli sohbet için mikrofon/kamera iznine izin ver
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    // Uygulama yalnızca sesli sohbet için mikrofon/kamera ister.
    if (permission === 'media') {
      callback(true);
      return;
    }
    callback(false);
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return permission === 'media';
  });

  createWindow();

  // IPC handle'ları — invoke tabanlı, Promise döndürür
  ipcMain.handle('check-for-updates', async () => {
    return await runUpdateCheck();
  });

  ipcMain.handle('download-update', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (error) {
      const { errMsg } = classifyUpdateError(error);
      console.error('[Updater] Download failed:', errMsg);
      mainWindow?.webContents.send('update-status', 'error', {
        message: 'Güncelleme indirilemedi. Lütfen tekrar deneyin.',
      });
      return { ok: false };
    }
  });

  ipcMain.handle('quit-and-install', async () => {
    autoUpdater.quitAndInstall();
  });

  ipcMain.handle('get-app-version', () => app.getVersion());

  // FAZ 19.3: desktopCapturer IPC köprüsü (ekran paylaşımı için)
  // Güvenlik: sadece 'window' ve 'screen' types — web/chrome sekmeleri YASAK
  // Thumbnail: 320x180 (performans), max 20 kaynak (DoS koruması)
  ipcMain.handle('get-desktop-sources', async (event, payload) => {
    try {
      const { types, thumbnailSize } = payload || {};

      // Input validation: types sadece izin verilen değerleri içerebilir
      const allowedTypes = ['window', 'screen'];
      const requestedTypes = Array.isArray(types) ? types : ['window', 'screen'];
      const safeTypes = requestedTypes.filter((t) => allowedTypes.includes(t));

      if (safeTypes.length === 0) {
        console.warn('[desktopCapturer] No valid types requested, defaulting to window+screen');
        safeTypes.push('window', 'screen');
      }

      // Thumbnail boyutu: performans için 320x180 varsayılan, max 640x360
      const safeSize = {
        width: Math.min(Math.max(Number(thumbnailSize?.width) || 320, 80), 640),
        height: Math.min(Math.max(Number(thumbnailSize?.height) || 180, 45), 360),
      };

      const sources = await desktopCapturer.getSources({
        types: safeTypes,
        thumbnailSize: safeSize,
      });

      // DoS koruması: max 20 kaynak
      const limited = sources.slice(0, 20);

      return limited.map((source) => ({
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail.toDataURL(), // base64 PNG
        display_id: source.display_id || null,
      }));
    } catch (error) {
      console.error('[desktopCapturer] Error:', error);
      // Graceful fallback: boş liste döndür, frontend crash etmesin
      return [];
    }
  });

  // Auto-updater yapılandırması
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // Başlangıç güncelleme kontrolü (3 saniye sonra)
  setTimeout(() => {
    runUpdateCheck();
  }, 3000);

  // autoUpdater event listener'ları
  autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] Checking for update...');
    mainWindow?.webContents.send('update-status', 'checking');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] Update available:', info && info.version);
    mainWindow?.webContents.send('update-status', 'available', {
      version: info && info.version,
      currentVersion: app.getVersion(),
    });
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[Updater] No updates available');
    mainWindow?.webContents.send('update-status', 'not-available', {
      version: app.getVersion(),
      currentVersion: app.getVersion(),
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    console.log(`[Updater] Download progress: ${progress && progress.percent}%`);
    mainWindow?.webContents.send('update-progress', {
      percent: progress && progress.percent,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[Updater] Update downloaded');
    mainWindow?.webContents.send('update-status', 'downloaded', {
      version: info && info.version,
    });
  });

  autoUpdater.on('error', (err) => {
    const { benign, errMsg } = classifyUpdateError(err);
    if (benign) {
      console.log('[Updater] No releases found (event), treating as up-to-date');
      mainWindow?.webContents.send('update-status', 'not-available', {
        version: app.getVersion(),
        currentVersion: app.getVersion(),
      });
      return;
    }
    console.error('[Updater] Error:', errMsg);
    mainWindow?.webContents.send('update-status', 'error', {
      message: 'Güncelleme sırasında bir hata oluştu.',
    });
  });
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
