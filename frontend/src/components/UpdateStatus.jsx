import { useState, useEffect } from 'react';

/**
 * UpdateStatus Component
 * Electron auto-updater durumunu gösterir
 * Web ortamında gizlenir, sadece Electron'da görünür
 */
export default function UpdateStatus() {
  const [status, setStatus] = useState('idle'); // idle, checking, available, downloading, downloaded, error
  const [progress, setProgress] = useState(0);
  const [version, setVersion] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!window.electronAPI) return;

    const unsubStatus = window.electronAPI.onUpdateStatus((status, info) => {
      console.log('[UpdateStatus] Status:', status, info);
      setStatus(status);
      if (info?.version) setVersion(info.version);
    });

    const unsubProgress = window.electronAPI.onUpdateProgress((progressObj) => {
      console.log('[UpdateStatus] Progress:', progressObj.percent);
      setProgress(progressObj.percent);
    });

    const unsubError = window.electronAPI.onUpdateError((errorMsg) => {
      console.error('[UpdateStatus] Error:', errorMsg);
      setError(errorMsg);
      setStatus('error');
    });

    // Cleanup function - component unmount olduğunda listener'ları kaldır
    return () => {
      if (typeof unsubStatus === 'function') unsubStatus();
      if (typeof unsubProgress === 'function') unsubProgress();
      if (typeof unsubError === 'function') unsubError();
    };
  }, []);

  const handleCheckForUpdates = () => {
    if (window.electronAPI) {
      window.electronAPI.checkForUpdates();
    }
  };

  // Electron ortamında değilse hiçbir şey gösterme
  if (!window.electronAPI) {
    return null;
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-semibold text-sm">Güncellemeler</h3>
        <button
          onClick={handleCheckForUpdates}
          disabled={status === 'checking' || status === 'downloading'}
          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 text-white text-xs rounded transition-colors"
        >
          {status === 'checking' ? 'Kontrol Ediliyor...' : 'Kontrol Et'}
        </button>
      </div>

      {/* Durum Mesajları */}
      {status === 'idle' && (
        <div className="text-gray-400 text-xs">
          Güncellemeleri kontrol etmek için butona tıklayın
        </div>
      )}

      {status === 'checking' && (
        <div className="flex items-center text-blue-400 text-xs">
          <span className="animate-pulse mr-2">🔍</span>
          Güncellemeler kontrol ediliyor...
        </div>
      )}

      {status === 'available' && version && (
        <div className="text-green-400 text-xs">
          ✅ Yeni sürüm mevcut: <span className="font-bold">v{version}</span>
          <div className="text-gray-400 mt-1">İndirme başladı...</div>
        </div>
      )}

      {status === 'not-available' && (
        <div className="text-gray-400 text-xs">
          ✅ En son sürümü kullanıyorsunuz
        </div>
      )}

      {status === 'downloading' && (
        <div>
          <div className="flex items-center justify-between text-xs text-blue-400 mb-2">
            <span>⬇️ İndiriliyor...</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      )}

      {status === 'downloaded' && (
        <div className="text-green-400 text-xs">
          ✅ Güncelleme indirildi!
          <div className="text-gray-400 mt-1">
            Uygulamayı yeniden başlatarak kurabilirsiniz
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="text-red-400 text-xs">
          ❌ Güncelleme hatası: {error || 'Bilinmeyen hata'}
        </div>
      )}
    </div>
  );
}
