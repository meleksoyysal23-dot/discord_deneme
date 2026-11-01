import { useState, useEffect } from 'react';

/**
 * ShareModal Component
 * Oda linkini paylaşmak için modal
 * @param {object} props
 * @param {boolean} props.isOpen - Modal açık mı?
 * @param {function} props.onClose - Kapatma fonksiyonu
 * @param {string} props.shareLink - Paylaşılacak link
 */
export function ShareModal({ isOpen, onClose, shareLink }) {
  const [copied, setCopied] = useState(false);

  // ESC tuşu ile kapatma
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Link kopyalama
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Link kopyalama başarısız:', error);
      // Fallback: input'u seç
      const input = document.getElementById('share-link-input');
      if (input) {
        input.select();
      }
    }
  };

  // Modal kapalıysa render etme
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-xl p-6 max-w-md w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Oda Linkini Paylaş</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-700 hover:bg-slate-600 flex items-center justify-center transition-colors"
            aria-label="Kapat"
          >
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Description */}
        <p className="text-slate-400 text-sm mb-4">
          Bu linki arkadaşlarınla paylaşarak onları odaya davet edebilirsin.
        </p>

        {/* Link Input */}
        <div className="flex gap-2 mb-4">
          <input
            id="share-link-input"
            type="text"
            value={shareLink}
            readOnly
            className="flex-1 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            onClick={(e) => e.target.select()}
          />
          <button
            onClick={handleCopy}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              copied
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {copied ? '✓ Kopyalandı' : 'Kopyala'}
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium transition-colors"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
