import { useState, useEffect, useCallback } from 'react';

/**
 * ScreenShareModal Component (FAZ 19.4)
 * Discord tarzı ekran/pencere seçim modalı.
 * Electron desktopCapturer köprüsü üzerinden kaynakları listeler.
 *
 * @param {object} props
 * @param {boolean} props.isOpen - Modal açık mı?
 * @param {function} props.onClose - Kapatma callback'i
 * @param {function} props.onSelect - Kaynak seçildiğinde: ({ sourceId, sourceName, withSystemAudio }) => void
 */
export default function ScreenShareModal({ isOpen, onClose, onSelect }) {
  const [activeTab, setActiveTab] = useState('windows'); // 'windows' | 'screens'
  const [sources, setSources] = useState([]);
  const [selectedSource, setSelectedSource] = useState(null);
  const [withSystemAudio, setWithSystemAudio] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Kaynakları yükle
  const loadSources = useCallback(async () => {
    if (!isOpen) return;

    setLoading(true);
    setError(null);
    setSelectedSource(null);

    try {
      const types = activeTab === 'windows' ? ['window'] : ['screen'];
      const thumbnailSize = { width: 320, height: 180 };

      // Electron ortamında değilse boş dön
      if (!window.electronAPI?.getDesktopSources) {
        setSources([]);
        setLoading(false);
        return;
      }

      const result = await window.electronAPI.getDesktopSources(types, thumbnailSize);

      // Sonuç array değilse veya boşsa
      if (!Array.isArray(result)) {
        setSources([]);
      } else {
        setSources(result);
      }
    } catch (err) {
      console.error('Desktop sources load error:', err);
      setError('Kaynaklar yüklenemedi');
      setSources([]);
    } finally {
      setLoading(false);
    }
  }, [isOpen, activeTab]);

  // Modal açıldığında veya sekme değiştiğinde kaynakları yükle
  useEffect(() => {
    if (isOpen) {
      loadSources();
    }
  }, [isOpen, activeTab, loadSources]);

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

  // Modal kapandığında state'i sıfırla
  useEffect(() => {
    if (!isOpen) {
      setSources([]);
      setSelectedSource(null);
      setWithSystemAudio(false);
      setError(null);
      setActiveTab('windows');
    }
  }, [isOpen]);

  // Kaynak seçimi
  const handleSelectSource = (source) => {
    setSelectedSource(source);
  };

  // Paylaş butonuna tıklama
  const handleShare = () => {
    if (!selectedSource) return;

    onSelect({
      sourceId: selectedSource.id,
      sourceName: selectedSource.name,
      withSystemAudio: activeTab === 'screens' ? withSystemAudio : false,
    });
  };

  // Modal kapalıysa render etme
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fadeIn"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
      onClick={onClose}
    >
      <div
        className="bg-[#313338] rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="screen-share-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1f2023] flex-shrink-0">
          <h2
            id="screen-share-title"
            className="text-white text-xl font-bold"
          >
            Ekran Paylaş
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#b9bbbe] hover:text-white hover:bg-[#404249] transition-colors"
            aria-label="Kapat"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.4 4L12 10.4L5.6 4L4 5.6L10.4 12L4 18.4L5.6 20L12 13.6L18.4 20L20 18.4L13.6 12L20 5.6L18.4 4Z" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-6 px-6 pt-4 border-b border-[#1f2023] flex-shrink-0">
          <button
            onClick={() => setActiveTab('windows')}
            className={`pb-3 px-1 text-sm font-medium transition-colors relative ${
              activeTab === 'windows'
                ? 'text-white'
                : 'text-[#b9bbbe] hover:text-[#dcddde]'
            }`}
          >
            Pencereler
            {activeTab === 'windows' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#5865f2] rounded-t" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('screens')}
            className={`pb-3 px-1 text-sm font-medium transition-colors relative ${
              activeTab === 'screens'
                ? 'text-white'
                : 'text-[#b9bbbe] hover:text-[#dcddde]'
            }`}
          >
            Tüm Ekran
            {activeTab === 'screens' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#5865f2] rounded-t" />
            )}
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          {/* Loading State */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-[#5865f2] border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-[#b9bbbe] text-sm">Kaynaklar yükleniyor...</p>
            </div>
          )}

          {/* Error State */}
          {!loading && error && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-3">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="#ed4245">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                </svg>
              </div>
              <p className="text-[#dcddde] text-sm mb-3">{error}</p>
              <button
                onClick={loadSources}
                className="px-4 py-1.5 bg-[#5865f2] hover:bg-[#4752c4] text-white text-sm font-medium rounded transition-colors"
              >
                Tekrar Dene
              </button>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && sources.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-12 h-12 rounded-full bg-[#404249] flex items-center justify-center mb-3">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="#b9bbbe">
                  <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM5 15l3.5-4.5 2.5 3.01L14.5 9l4.5 6H5z" />
                </svg>
              </div>
              <p className="text-[#dcddde] text-sm mb-3">
                Paylaşılacak kaynak bulunamadı
              </p>
              <button
                onClick={loadSources}
                className="px-4 py-1.5 bg-[#5865f2] hover:bg-[#4752c4] text-white text-sm font-medium rounded transition-colors"
              >
                Tekrar Dene
              </button>
            </div>
          )}

          {/* Sources Grid */}
          {!loading && !error && sources.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {sources.map((source) => {
                const isSelected = selectedSource?.id === source.id;
                return (
                  <button
                    key={source.id}
                    onClick={() => handleSelectSource(source)}
                    className={`group relative rounded-md overflow-hidden transition-all duration-150 ${
                      isSelected
                        ? 'ring-2 ring-[#5865f2] scale-[1.02]'
                        : 'hover:scale-[1.03] hover:ring-2 hover:ring-[#5865f2]/50'
                    }`}
                    aria-pressed={isSelected}
                    aria-label={source.name}
                  >
                    {/* Thumbnail */}
                    <div className="aspect-video bg-[#1e1f22] relative overflow-hidden">
                      {source.thumbnail ? (
                        <img
                          src={source.thumbnail}
                          alt={source.name}
                          className="w-full h-full object-cover"
                          draggable={false}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#949ba4]">
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z" />
                          </svg>
                        </div>
                      )}

                      {/* Selected checkmark */}
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#5865f2] flex items-center justify-center shadow-lg">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Name */}
                    <div className="px-2 py-2 bg-[#2b2d31]">
                      <p className="text-[#dcddde] text-xs font-medium truncate text-center">
                        {source.name}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#1f2023] flex-shrink-0">
          {/* System audio toggle - only for screens */}
          {activeTab === 'screens' && (
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[#dcddde] text-sm font-medium">
                  Sistem sesiyle paylaş
                </p>
                <p className="text-[#949ba4] text-xs mt-0.5">
                  Bilgisayarındaki sesleri de paylaş
                </p>
              </div>
              <button
                onClick={() => setWithSystemAudio(!withSystemAudio)}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  withSystemAudio ? 'bg-[#5865f2]' : 'bg-[#404249]'
                }`}
                role="switch"
                aria-checked={withSystemAudio}
                aria-label="Sistem sesiyle paylaş"
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    withSystemAudio ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-[#dcddde] text-sm font-medium hover:text-white transition-colors"
            >
              İptal
            </button>
            <button
              onClick={handleShare}
              disabled={!selectedSource || loading}
              className="px-6 py-2 bg-[#5865f2] hover:bg-[#4752c4] disabled:bg-[#404249] disabled:text-[#949ba4] disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors"
            >
              Paylaş
            </button>
          </div>
        </div>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.15s ease-out;
        }
        .animate-scaleIn {
          animation: scaleIn 0.15s ease-out;
        }
      `}</style>
    </div>
  );
}
