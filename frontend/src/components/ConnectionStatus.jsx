import React, { useState } from 'react';

/**
 * ConnectionStatus Component
 * Socket bağlantı durumunu gösteren bileşen
 * @param {object} props
 * @param {boolean} props.isConnected - Bağlantı durumu
 * @param {string|null} props.connectionError - Bağlantı hatası
 */
export const ConnectionStatus = React.memo(function ConnectionStatus({ isConnected, connectionError }) {
  const [showTooltip, setShowTooltip] = useState(false);

  const statusText = isConnected ? 'Bağlı' : 'Bağlı Değil';
  const statusColor = isConnected ? 'bg-green-500' : 'bg-red-500';
  const tooltipText = connectionError || (isConnected ? 'Sunucuya bağlı' : 'Sunucuya bağlanılıyor...');

  return (
    <div
      className="relative inline-flex items-center gap-2"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className={`w-2.5 h-2.5 rounded-full ${statusColor} ${isConnected ? 'animate-pulse' : ''}`} />
      <span className="text-sm text-slate-400">{statusText}</span>

      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-700 text-white text-xs rounded-lg whitespace-nowrap z-50">
          {tooltipText}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-700" />
        </div>
      )}
    </div>
  );
});
