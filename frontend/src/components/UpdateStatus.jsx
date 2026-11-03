import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * UpdateStatus Component
 * Electron auto-updater durumunu gösterir. Idle dahil her zaman küçük bir
 * "kontrol et" butonu görünür; tıklanınca kontrol başlar ve modal açılır.
 * Web ortamında (window.electronAPI yok) hiç render edilmez.
 *
 * IPC kontratı:
 * - checkForUpdates(): Promise<{status:'available'|'not-available'|'error', version?, message?}>
 * - downloadUpdate(): Promise<{ok:boolean}>
 * - quitAndInstall(): Promise<void>
 * - onUpdateStatus(cb): status ∈ checking|available|not-available|downloading|downloaded|error, info
 * - onUpdateProgress(cb): {percent}
 */
export default function UpdateStatus() {
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [newVersion, setNewVersion] = useState('');
  const [currentVersion, setCurrentVersion] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const mountedRef = useRef(true);

  const api =
    typeof window !== 'undefined' && window.electronAPI ? window.electronAPI : null;

  // Durum ve ilerleme dinleyicileri
  useEffect(() => {
    if (!api) return undefined;
    mountedRef.current = true;

    const unsubStatus =
      typeof api.onUpdateStatus === 'function'
        ? api.onUpdateStatus((nextStatus, info) => {
            if (!mountedRef.current) return;
            setStatus(nextStatus);
            if (info?.version) {
              if (nextStatus === 'not-available' || nextStatus === 'checking') {
                setCurrentVersion(info.version);
              } else {
                setNewVersion(info.version);
              }
            }
            if (nextStatus === 'downloading' || nextStatus === 'downloaded') {
              setIsBusy(true);
            }
            if (nextStatus === 'not-available' || nextStatus === 'error' || nextStatus === 'downloaded') {
              setIsBusy(false);
            }
          })
        : null;

    const unsubProgress =
      typeof api.onUpdateProgress === 'function'
        ? api.onUpdateProgress((progressObj) => {
            if (!mountedRef.current) return;
            const percent = Number(progressObj?.percent) || 0;
            setProgress(percent);
            if (percent > 0) setStatus('downloading');
          })
        : null;

    // Eski kontrat uyumluluğu: ayrı hata kanalı varsa 'error' durumuna çevir
    const unsubError =
      typeof api.onUpdateError === 'function'
        ? api.onUpdateError(() => {
            if (!mountedRef.current) return;
            setStatus('error');
            setIsBusy(false);
          })
        : null;

    return () => {
      mountedRef.current = false;
      if (typeof unsubStatus === 'function') unsubStatus();
      if (typeof unsubProgress === 'function') unsubProgress();
      if (typeof unsubError === 'function') unsubError();
    };
  }, [api]);

  const handleOpenAndCheck = useCallback(async () => {
    setIsModalOpen(true);
    setStatus('checking');
    setIsBusy(true);
    setProgress(0);

    try {
      if (typeof api?.checkForUpdates === 'function') {
        const result = await api.checkForUpdates();
        if (!mountedRef.current) return;
        if (result && typeof result === 'object' && result.status) {
          setStatus(result.status === 'error' ? 'error' : result.status);
          if (result.version) {
            if (result.status === 'not-available') setCurrentVersion(result.version);
            else setNewVersion(result.version);
          }
          setIsBusy(result.status === 'downloading');
        }
      }
    } catch {
      if (mountedRef.current) {
        setStatus('error');
        setIsBusy(false);
      }
    }
  }, [api]);

  const handleDownload = useCallback(async () => {
    setIsBusy(true);
    setStatus('downloading');
    try {
      if (typeof api?.downloadUpdate === 'function') {
        const res = await api.downloadUpdate();
        if (res && res.ok === false) {
          if (mountedRef.current) {
            setStatus('error');
            setIsBusy(false);
          }
        }
      }
    } catch {
      if (mountedRef.current) {
        setStatus('error');
        setIsBusy(false);
      }
    }
  }, [api]);

  const handleRestart = useCallback(() => {
    if (typeof api?.quitAndInstall === 'function') {
      api.quitAndInstall();
    }
  }, [api]);

  // Electron değilse hiç gösterme
  if (!api) return null;

  return (
    <>
      {/* Her zaman görünen küçük kontrol butonu */}
      <button
        onClick={handleOpenAndCheck}
        className="w-8 h-8 rounded flex items-center justify-center text-gray-300 hover:text-white hover:bg-[#35373c] transition-colors relative"
        aria-label="Güncellemeleri kontrol et"
        title="Güncellemeleri kontrol et"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={status === 'checking' ? 'animate-spin' : ''}
        >
          <path
            fillRule="evenodd"
            d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
            clipRule="evenodd"
          />
        </svg>
        {status === 'available' && (
          <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-yellow-400" aria-hidden />
        )}
        {status === 'downloaded' && (
          <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-green-500" aria-hidden />
        )}
      </button>

      {/* Güncelleme modalı */}
      {isModalOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Güncellemeler"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold text-lg">Güncellemeler</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-white transition-colors"
                aria-label="Kapat"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {(status === 'idle' || status === 'checking') && (
                <div className="flex items-center gap-3 text-blue-400 py-2">
                  <div className="animate-spin w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full" />
                  <span>Güncellemeler denetleniyor...</span>
                </div>
              )}

              {status === 'not-available' && (
                <div className="text-center py-4">
                  <div className="text-4xl mb-3">✅</div>
                  <p className="text-green-400 font-medium mb-1">Uygulamanız güncel</p>
                  {currentVersion && (
                    <p className="text-gray-400 text-sm">Sürüm: v{currentVersion}</p>
                  )}
                </div>
              )}

              {status === 'available' && (
                <div className="text-center py-4">
                  <div className="text-4xl mb-3">🎉</div>
                  <p className="text-white font-medium mb-1">Yeni sürüm bulundu!</p>
                  {newVersion && (
                    <p className="text-indigo-400 text-sm mb-4">Sürüm: v{newVersion}</p>
                  )}
                  <button
                    onClick={handleDownload}
                    disabled={isBusy}
                    className="w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium rounded-lg transition-colors"
                  >
                    İndir
                  </button>
                </div>
              )}

              {status === 'downloading' && (
                <div className="py-4">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-blue-400">⬇️ Yeni sürüm indiriliyor</span>
                    <span className="text-white font-medium">%{Math.round(progress)}</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2.5">
                    <div
                      className="bg-blue-500 h-2.5 rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                    />
                  </div>
                  {newVersion && (
                    <p className="text-gray-400 text-xs mt-2">Sürüm: v{newVersion}</p>
                  )}
                </div>
              )}

              {status === 'downloaded' && (
                <div className="text-center py-4">
                  <div className="text-4xl mb-3">✨</div>
                  <p className="text-green-400 font-medium mb-1">Yeni sürüm hazır!</p>
                  {newVersion && (
                    <p className="text-gray-400 text-sm mb-4">Sürüm: v{newVersion}</p>
                  )}
                  <p className="text-gray-400 text-sm mb-4">
                    Uygulamayı yeniden başlatarak kurabilirsiniz.
                  </p>
                  <button
                    onClick={handleRestart}
                    className="w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
                  >
                    Yeniden Başlat
                  </button>
                </div>
              )}

              {status === 'error' && (
                <div className="text-center py-4">
                  <div className="text-4xl mb-3">⚠️</div>
                  <p className="text-red-400 font-medium mb-1">Güncelleme kontrol edilemedi</p>
                  <p className="text-gray-400 text-sm">Lütfen tekrar deneyin.</p>
                </div>
              )}
            </div>

            {(status === 'not-available' || status === 'error') && (
              <div className="mt-4 pt-4 border-t border-gray-700">
                <button
                  onClick={handleOpenAndCheck}
                  disabled={isBusy}
                  className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
                >
                  Tekrar Kontrol Et
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}