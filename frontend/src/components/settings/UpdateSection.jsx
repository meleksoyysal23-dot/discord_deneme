import { useState, useEffect } from 'react';

/**
 * Güncelleme durumu için state machine bileşeni.
 * Settings modalı içinde inline çalışır, kendi sonuçlarını gösterir.
 */
export default function UpdateSection() {
  const [status, setStatus] = useState('idle'); // idle | checking | not-available | available | downloading | downloaded | error
  const [currentVersion, setCurrentVersion] = useState(null);
  const [newVersion, setNewVersion] = useState(null);
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    // Web ortamında Electron API yoksa erken dön
    if (!window.electronAPI) {
      return;
    }

    // Mevcut sürümü al
    if (window.electronAPI.getAppVersion) {
      window.electronAPI.getAppVersion().then((version) => {
        setCurrentVersion(version);
      });
    }

    // Event listener'ları abone ol
    const unsubStatus = window.electronAPI.onUpdateStatus((newStatus, info) => {
      setStatus(newStatus);
      if (info) {
        if (info.version) setNewVersion(info.version);
        if (info.message) setErrorMessage(info.message);
      }
    });

    const unsubProgress = window.electronAPI.onUpdateProgress((p) => {
      if (p && typeof p.percent === 'number') {
        setProgress(p.percent);
      }
    });

    // Cleanup: unsubscribe
    return () => {
      if (unsubStatus) unsubStatus();
      if (unsubProgress) unsubProgress();
    };
  }, []);

  const handleCheck = async () => {
    setStatus('checking');
    setErrorMessage('');
    try {
      const result = await window.electronAPI.checkForUpdates();
      if (result) {
        setStatus(result.status);
        if (result.version) setNewVersion(result.version);
        if (result.currentVersion) setCurrentVersion(result.currentVersion);
        if (result.message) setErrorMessage(result.message);
      }
    } catch (err) {
      setStatus('error');
      setErrorMessage(err.message || 'Güncelleme kontrolü başarısız');
    }
  };

  const handleDownload = async () => {
    setStatus('downloading');
    setProgress(0);
    try {
      const result = await window.electronAPI.downloadUpdate();
      if (!result || !result.ok) {
        setStatus('error');
        setErrorMessage('İndirme başarısız');
      }
    } catch (err) {
      setStatus('error');
      setErrorMessage(err.message || 'İndirme başarısız');
    }
  };

  const handleInstall = () => {
    window.electronAPI.quitAndInstall();
  };

  // Web ortamı (Electron yok)
  if (!window.electronAPI) {
    return (
      <div className="bg-[#313338] rounded p-4 text-center">
        <p className="text-[#949ba4] text-sm">
          Güncelleme yalnızca masaüstü uygulamasında kullanılabilir
        </p>
      </div>
    );
  }

  // Idle veya ilk durum
  if (status === 'idle') {
    return (
      <div className="bg-[#313338] rounded p-4">
        {currentVersion && (
          <p className="text-[#949ba4] text-xs mb-3">
            Mevcut sürüm: v{currentVersion}
          </p>
        )}
        <button
          onClick={handleCheck}
          className="w-full px-4 py-2 rounded text-sm bg-[#5865f2] text-white hover:bg-[#4752c4] transition-colors"
        >
          Güncellemeleri Kontrol Et
        </button>
      </div>
    );
  }

  // Kontrol ediliyor
  if (status === 'checking') {
    return (
      <div className="bg-[#313338] rounded p-4">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-[#5865f2] border-t-transparent"></div>
          <span className="text-[#949ba4] text-sm">Güncellemeler denetleniyor...</span>
        </div>
      </div>
    );
  }

  // Güncelleme yok
  if (status === 'not-available') {
    return (
      <div className="bg-[#313338] rounded p-4">
        <p className="text-green-400 text-sm mb-2">
          ✓ Uygulamanız güncel{currentVersion ? ` (v${currentVersion})` : ''}
        </p>
        <button
          onClick={handleCheck}
          className="w-full px-4 py-2 rounded text-sm bg-[#5865f2] text-white hover:bg-[#4752c4] transition-colors"
        >
          Tekrar Kontrol Et
        </button>
      </div>
    );
  }

  // İndiriliyor
  if (status === 'downloading') {
    return (
      <div className="bg-[#313338] rounded p-4">
        <p className="text-[#949ba4] text-sm mb-2">
          Yeni sürüm indiriliyor{newVersion ? ` (v${newVersion})` : ''}...
        </p>
        <div className="w-full h-2 bg-[#1e1f22] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#5865f2] rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
        <p className="text-[#949ba4] text-xs mt-1 text-right">{Math.round(progress)}%</p>
      </div>
    );
  }

  // İndirildi, kurulmaya hazır
  if (status === 'downloaded') {
    return (
      <div className="bg-[#313338] rounded p-4">
        <p className="text-green-400 text-sm mb-2">
          ✓ Yeni sürüm hazır{newVersion ? ` (v${newVersion})` : ''}
        </p>
        <p className="text-[#949ba4] text-xs mb-3">
          Yeniden başlatın ve kurulumu tamamlayın
        </p>
        <button
          onClick={handleInstall}
          className="w-full px-4 py-2 rounded text-sm bg-[#5865f2] text-white hover:bg-[#4752c4] transition-colors"
        >
          Yeniden Başlat ve Kur
        </button>
      </div>
    );
  }

  // Güncelleme mevcut, indirilmemiş
  if (status === 'available') {
    return (
      <div className="bg-[#313338] rounded p-4">
        <p className="text-[#949ba4] text-sm mb-2">
          Yeni sürüm bulundu{newVersion ? `: v${newVersion}` : ''}
        </p>
        {currentVersion && (
          <p className="text-[#949ba4] text-xs mb-3">
            Mevcut: v{currentVersion}
          </p>
        )}
        <button
          onClick={handleDownload}
          className="w-full px-4 py-2 rounded text-sm bg-[#5865f2] text-white hover:bg-[#4752c4] transition-colors"
        >
          İndir
        </button>
      </div>
    );
  }

  // Hata
  if (status === 'error') {
    return (
      <div className="bg-[#313338] rounded p-4">
        <p className="text-red-400 text-sm mb-2">
          ✗ {errorMessage || 'Güncelleme kontrolü başarısız'}
        </p>
        <button
          onClick={handleCheck}
          className="w-full px-4 py-2 rounded text-sm bg-[#5865f2] text-white hover:bg-[#4752c4] transition-colors"
        >
          Tekrar Dene
        </button>
      </div>
    );
  }

  return null;
}
