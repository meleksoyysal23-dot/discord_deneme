import { useState, useEffect } from 'react';
import { fetchInviteInfo, joinServerViaInvite } from '../services/api';

/**
 * InviteModal Component
 * Davet linki ile sunucuya katılma modal'ı
 * 
 * @param {object} props
 * @param {boolean} props.isOpen - Modal açık mı?
 * @param {string} props.inviteCode - Davet kodu
 * @param {function} props.onClose - Kapatma callback'i
 * @param {function} props.onJoinSuccess - Başarılı katılma callback'i (server objesi döndürür)
 */
export function InviteModal({ isOpen, inviteCode, onClose, onJoinSuccess }) {
  const [loading, setLoading] = useState(false);
  const [joining, setJoining] = useState(false);
  const [inviteInfo, setInviteInfo] = useState(null);
  const [error, setError] = useState(null);

  // Davet bilgisini yükle
  useEffect(() => {
    if (!isOpen || !inviteCode) return;

    setLoading(true);
    setError(null);
    setInviteInfo(null);

    fetchInviteInfo(inviteCode)
      .then((info) => {
        setInviteInfo(info);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [isOpen, inviteCode]);

  // Katıl butonuna basıldığında
  const handleJoin = async () => {
    if (!inviteCode) return;

    setJoining(true);
    setError(null);

    try {
      const result = await joinServerViaInvite(inviteCode);
      setJoining(false);
      
      // Başarılı — modal'ı kapat ve callback çağır
      onClose();
      if (onJoinSuccess) {
        onJoinSuccess(result.server || inviteInfo?.server);
      }
    } catch (err) {
      setError(err.message);
      setJoining(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        className="bg-black/60 backdrop-blur-md rounded-lg p-6 w-[450px] shadow-2xl border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center text-white text-2xl">
            🎉
          </div>
          <div>
            <h2 className="text-white text-xl font-bold">Davet Edildiniz!</h2>
            <p className="text-[#949ba4] text-sm">Bir sunucuya katılmak üzeresiniz</p>
          </div>
        </div>

        {/* Content */}
        {loading && (
          <div className="text-center py-8">
            <div className="inline-block w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-[#949ba4] text-sm mt-3">Davet bilgisi yükleniyor...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 mb-4">
            <p className="text-red-300 text-sm">❌ {error}</p>
          </div>
        )}

        {inviteInfo && !loading && (
          <>
            {/* Sunucu Bilgisi */}
            <div className="bg-black/40 backdrop-blur-sm rounded-lg p-4 mb-4 border border-white/10">
              <div className="flex items-center gap-3 mb-3">
                {inviteInfo.server?.icon ? (
                  <img src={inviteInfo.server.icon} alt={inviteInfo.server.name} className="w-16 h-16 rounded-full" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-indigo-600 flex items-center justify-center text-white text-2xl font-bold">
                    {inviteInfo.server?.name?.[0]?.toUpperCase() || 'S'}
                  </div>
                )}
                <div className="flex-1">
                  <h3 className="text-white text-lg font-bold">{inviteInfo.server?.name || 'Sunucu'}</h3>
                  {inviteInfo.server?.description && (
                    <p className="text-[#949ba4] text-sm line-clamp-2">{inviteInfo.server.description}</p>
                  )}
                </div>
              </div>
              
              {/* İstatistikler */}
              <div className="flex gap-4 text-xs text-[#949ba4]">
                <div className="flex items-center gap-1">
                  <span className="text-green-500">●</span>
                  <span>{inviteInfo.server?.memberCount || 0} üye</span>
                </div>
                <div className="flex items-center gap-1">
                  <span>🎟️</span>
                  <span>Davet kodu: {inviteInfo.code || inviteCode}</span>
                </div>
              </div>
            </div>

            {/* Zaten Üye Uyarısı */}
            {inviteInfo.isAlreadyMember && (
              <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-3 mb-4">
                <p className="text-yellow-300 text-sm">⚠️ Zaten bu sunucunun üyesisiniz.</p>
              </div>
            )}

            {/* Butonlar */}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-[#4e5058] hover:bg-[#6d6f78] text-white rounded-md transition-colors"
                disabled={joining}
              >
                İptal
              </button>
              <button
                onClick={handleJoin}
                className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors font-semibold"
                disabled={joining || inviteInfo.isAlreadyMember}
              >
                {joining ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Katılıyor...
                  </span>
                ) : inviteInfo.isAlreadyMember ? (
                  'Zaten Üyesin'
                ) : (
                  '🚀 Katıl'
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default InviteModal;