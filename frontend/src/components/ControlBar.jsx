import React, { useState } from 'react';

/**
 * ControlBar Component
 * Mikrofon, kulaklık, kamera, ekran paylaşımı ve diğer kontrol butonları
 * @param {object} props
 * @param {boolean} props.isMuted - Mikrofon susturulmuş mu?
 * @param {boolean} props.isDeafened - Kulaklık susturulmuş mu?
 * @param {function} props.onToggleMute - Mute toggle fonksiyonu
 * @param {function} props.onToggleDeafen - Deafen toggle fonksiyonu
 * @param {function} props.onLeave - Odadan ayrılma fonksiyonu
 * @param {function} props.onShareLink - Link paylaşma fonksiyonu
 * @param {number} props.masterVolume - Ana ses seviyesi (0-1)
 * @param {function} props.onMasterVolumeChange - Ana ses seviyesi değişim fonksiyonu
 * @param {boolean} props.isScreenSharing - Ekran paylaşımı aktif mi?
 * @param {boolean} props.isCameraEnabled - Kamera aktif mi?
 * @param {function} props.onOpenScreenShare - Ekran paylaşım modalını aç
 * @param {function} props.onStopScreenShare - Ekran paylaşımını durdur
 * @param {function} props.onToggleCamera - Kamerayı aç/kapat
 */
export const ControlBar = React.memo(function ControlBar({
  isMuted,
  isDeafened,
  onToggleMute,
  onToggleDeafen,
  onLeave,
  onShareLink,
  masterVolume = 1,
  onMasterVolumeChange,
  isScreenSharing = false,
  isCameraEnabled = false,
  onOpenScreenShare,
  onStopScreenShare,
  onToggleCamera,
}) {
  const [showVolumeControl, setShowVolumeControl] = useState(false);

  const handleVolumeChange = (e) => {
    const volume = parseFloat(e.target.value);
    if (onMasterVolumeChange) {
      onMasterVolumeChange(volume);
    }
  };
  return (
    <div className="flex items-center justify-center gap-4 p-4 bg-slate-800 rounded-xl">
      {/* Mute Button */}
      <button
        onClick={onToggleMute}
        className={`w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 ${
          isMuted
            ? 'bg-red-600 hover:bg-red-700 shadow-lg shadow-red-600/50'
            : 'bg-slate-700 hover:bg-slate-600'
        }`}
        aria-label={isMuted ? 'Mikrofonu aç' : 'Mikrofonu kapat'}
        title={isMuted ? 'Mikrofonu aç' : 'Mikrofonu kapat'}
      >
        {isMuted ? (
          <svg className="w-6 h-6 md:w-7 md:h-7 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.701.705L4.857 13.36A1 1 0 004 12.646V7.354a1 1 0 00-.857-.64L1.701 3.372A1 1 0 013.383 2.076L6 4.686V4a4 4 0 018 0v.686l2.617-2.61A1 1 0 0118.383 3.372L15 6.757V12.646a1 1 0 01-.857.994l-3.442 3.34A1 1 0 019 16V4a1 1 0 01.383-.924z"
              clipRule="evenodd"
            />
            <path d="M10 18a3 3 0 003-3h-6a3 3 0 003 3z" />
          </svg>
        ) : (
          <svg className="w-6 h-6 md:w-7 md:h-7 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </button>

      {/* Deafen Button */}
      <button
        onClick={onToggleDeafen}
        className={`w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 ${
          isDeafened
            ? 'bg-red-600 hover:bg-red-700 shadow-lg shadow-red-600/50'
            : 'bg-slate-700 hover:bg-slate-600'
        }`}
        aria-label={isDeafened ? 'Kulaklığı aç' : 'Kulaklığı kapat'}
        title={isDeafened ? 'Kulaklığı aç' : 'Kulaklığı kapat'}
      >
        {isDeafened ? (
          <svg className="w-6 h-6 md:w-7 md:h-7 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6z" />
            <path d="M6 16a2 2 0 002 2h4a2 2 0 002-2v-1H6v1z" />
            <path fillRule="evenodd" d="M3.707 2.293a1 1 0 011.414 0L18 15.172a1 1 0 01-1.414 1.414L3.707 3.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg className="w-6 h-6 md:w-7 md:h-7 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6z" />
            <path d="M6 16a2 2 0 002 2h4a2 2 0 002-2v-1H6v1z" />
          </svg>
        )}
      </button>

      {/* Volume Control Button */}
      <div className="relative">
        <button
          onClick={() => setShowVolumeControl(!showVolumeControl)}
          className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-slate-700 hover:bg-slate-600 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
          aria-label="Ses seviyesi"
          title="Ses seviyesi"
        >
          <svg className="w-6 h-6 md:w-7 md:h-7 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.701.705L4.857 13.36A1 1 0 004 12.646V7.354a1 1 0 00-.857-.64L1.701 3.372A1 1 0 013.383 2.076L6 4.686V4a4 4 0 018 0v.686l2.617-2.61A1 1 0 0118.383 3.372L15 6.757V12.646a1 1 0 01-.857.994l-3.442 3.34A1 1 0 019 16V4a1 1 0 01.383-.924z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {/* Volume Slider Popup */}
        {showVolumeControl && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-slate-800 rounded-lg p-3 shadow-xl border border-slate-700 min-w-[200px]">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-slate-400" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.701.705L4.857 13.36A1 1 0 004 12.646V7.354a1 1 0 00-.857-.64L1.701 3.372A1 1 0 013.383 2.076L6 4.686V4a4 4 0 018 0v.686l2.617-2.61A1 1 0 0118.383 3.372L15 6.757V12.646a1 1 0 01-.857.994l-3.442 3.34A1 1 0 019 16V4a1 1 0 01.383-.924z"
                  clipRule="evenodd"
                />
              </svg>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={masterVolume}
                onChange={handleVolumeChange}
                className="flex-1 h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                aria-label="Ana ses seviyesi"
              />
              <span className="text-xs text-slate-300 w-10 text-right">
                {Math.round(masterVolume * 100)}%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Camera Button */}
      {onToggleCamera && (
        <button
          onClick={onToggleCamera}
          className={`w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 ${
            isCameraEnabled
              ? 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/50'
              : 'bg-slate-700 hover:bg-slate-600'
          }`}
          aria-label={isCameraEnabled ? 'Kamerayı kapat' : 'Kamerayı aç'}
          title={isCameraEnabled ? 'Kamerayı kapat' : 'Kamerayı aç'}
        >
          {isCameraEnabled ? (
            <svg className="w-6 h-6 md:w-7 md:h-7 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6zm12.553 1.106A1 1 0 0014 8v4a1 1 0 001.553.832l3-2a1 1 0 000-1.664l-3-2z" />
            </svg>
          ) : (
            <svg className="w-6 h-6 md:w-7 md:h-7 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M13.644 16.644a.75.75 0 01-1.06 0L2.22 6.28a.75.75 0 011.06-1.06l10.364 10.364a.75.75 0 010 1.06zM14 8v4a1 1 0 001.553.832l3-2a1 1 0 000-1.664l-3-2A1 1 0 0014 8zM2 6a2 2 0 012-2h6a2 2 0 012 2v.364l-2 2V6H4v8h6v-.364l2 2V16a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
            </svg>
          )}
        </button>
      )}

      {/* Screen Share Button */}
      {onOpenScreenShare && onStopScreenShare && (
        <button
          onClick={isScreenSharing ? onStopScreenShare : onOpenScreenShare}
          className={`w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 ${
            isScreenSharing
              ? 'bg-green-600 hover:bg-green-700 shadow-lg shadow-green-600/50'
              : 'bg-slate-700 hover:bg-slate-600'
          }`}
          aria-label={isScreenSharing ? 'Ekran paylaşımını durdur' : 'Ekran paylaş'}
          title={isScreenSharing ? 'Ekran paylaşımını durdur' : 'Ekran paylaş'}
        >
          {isScreenSharing ? (
            <svg className="w-6 h-6 md:w-7 md:h-7 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1zm7.707 3.293a1 1 0 010 1.414L9.414 9H17a1 1 0 110 2H9.414l1.293 1.293a1 1 0 01-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg className="w-6 h-6 md:w-7 md:h-7 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zm2 0v8h12V6H4z" />
              <path d="M10 9a1 1 0 011 1v2a1 1 0 11-2 0v-2a1 1 0 011-1z" />
            </svg>
          )}
        </button>
      )}

      {/* Share Link Button */}
      <button
        onClick={onShareLink}
        className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-blue-600 hover:bg-blue-700 flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-lg shadow-blue-600/50"
        aria-label="Linki paylaş"
        title="Linki paylaş"
      >
        <svg className="w-6 h-6 md:w-7 md:h-7 text-white" fill="currentColor" viewBox="0 0 20 20">
          <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" />
        </svg>
      </button>

      {/* Leave Button */}
      <button
        onClick={onLeave}
        className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-lg shadow-red-600/50"
        aria-label="Odadan ayrıl"
        title="Odadan ayrıl"
      >
        <svg className="w-6 h-6 md:w-7 md:h-7 text-white" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  );
});
