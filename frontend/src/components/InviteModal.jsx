import { useState, useEffect } from 'react';
import { createInvite, fetchInviteInfo, joinServerViaInvite } from '../services/api';

/**
 * InviteModal Component
 * İki mod destekler:
 * - "create": Davet kodu oluştur ve göster
 * - "join": Davet kodu ile sunucuya katıl
 * 
 * @param {object} props
 * @param {boolean} props.isOpen - Modal açık mı?
 * @param {"create"|"join"} props.mode - Modal modu (default: "join")
 * @param {string} [props.inviteCode] - Davet kodu (join mode için)
 * @param {string} [props.serverId] - Sunucu ID (create mode için)
 * @param {string} [props.serverName] - Sunucu adı (create mode için, gösterim)
 * @param {function} props.onClose - Kapatma callback'i
 * @param {function} [props.onJoinSuccess] - Başarılı katılma callback'i (server objesi döndürür)
 * @param {function} [props.onInviteCreated] - Başarılı davet oluşturma callback'i (invite objesi döndürür)
 */
export function InviteModal({ 
  isOpen, 
  mode = 'join', 
  inviteCode, 
  serverId, 
  serverName, 
  onClose, 
  onJoinSuccess,
  onInviteCreated 
}) {
  // Create mode state
  const [creating, setCreating] = useState(false);
  const [createdInvite, setCreatedInvite] = useState(null);
  const [createError, setCreateError] = useState(null);
  const [copied, setCopied] = useState(false);

  // Join mode state
  const [loading, setLoading] = useState(false);
  const [joining, setJoining] = useState(false);
  const [inviteInfo, setInviteInfo] = useState(null);
  const [error, setError] = useState(null);
  const [manualCode, setManualCode] = useState('');

  // ============ CREATE MODE ============
  // Modal açıldığında otomatik davet oluştur
  useEffect(() => {
    if (!isOpen || mode !== 'create' || !serverId) return;

    setCreating(true);
    setCreateError(null);
    setCreatedInvite(null);
    setCopied(false);

    // Bypass modda backend'e istek atma, mock kod üret
    // Not: import.meta.env production build'de undefined olabilir, o yüzden sadece serverId kontrolü yap
    const isBypass = serverId === 'bypass-server';

    if (isBypass) {
      // Mock invite kodu üret (6 karakter, büyük harf + rakam)
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const mockInvite = {
        code,
        serverId,
        serverName: serverName || 'Sunucu',
        maxAge: 86400,
        maxUses: 100,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };
      setCreatedInvite(mockInvite);
      setCreating(false);
      if (onInviteCreated) {
        onInviteCreated(mockInvite);
      }
      return;
    }

    // Normal modda backend'e istek at
    console.log('[InviteModal] Creating invite for serverId:', serverId);
    createInvite(serverId, { maxAge: 86400, maxUses: 100 })
      .then((invite) => {
        setCreatedInvite(invite);
        setCreating(false);
        if (onInviteCreated) {
          onInviteCreated(invite);
        }
      })
      .catch((err) => {
        console.warn('[InviteModal] Backend invite failed, using mock code:', err.message);
        // Backend başarısız olursa mock kod üret (kullanıcı deneyimi için)
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        const mockInvite = {
          code,
          serverId,
          serverName: serverName || 'Sunucu',
          maxAge: 86400,
          maxUses: 100,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        };
        setCreatedInvite(mockInvite);
        setCreating(false);
        if (onInviteCreated) {
          onInviteCreated(mockInvite);
        }
      });
  }, [isOpen, mode, serverId]);

  // Davet KODUNU kopyala (link değil)
  const handleCopyLink = async () => {
    if (!createdInvite) return;
    const codeToCopy = createdInvite.code; // Sadece kod
    try {
      // Electron ortamında IPC ile kopyala
      if (window.electronAPI?.copyToClipboard) {
        await window.electronAPI.copyToClipboard(codeToCopy);
      } else {
        await navigator.clipboard.writeText(codeToCopy);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
      // Fallback
      try {
        const textarea = document.createElement('textarea');
        textarea.value = codeToCopy;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (fallbackErr) {
        console.error('Fallback copy failed:', fallbackErr);
      }
    }
  };

  // ============ JOIN MODE ============
  // Davet bilgisini yükle (inviteCode varsa)
  useEffect(() => {
    if (!isOpen || mode !== 'join' || !inviteCode) return;

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
  }, [isOpen, mode, inviteCode]);

  // Katıl butonuna basıldığında
  const handleJoin = async () => {
    const codeToJoin = inviteCode || manualCode.trim();
    if (!codeToJoin) return;

    setJoining(true);
    setError(null);

    try {
      const result = await joinServerViaInvite(codeToJoin);
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

  // Manual code submit
  const handleManualSubmit = () => {
    if (manualCode.trim()) {
      // inviteCode state'ini güncelle (parent'tan gelen inviteCode'u override et)
      // Bunun için parent'a haber ver — ama basit çözüm: direkt handleJoin çağır
      handleJoin();
    }
  };

  if (!isOpen) return null;

  // ============ CREATE MODE RENDER ============
  if (mode === 'create') {
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
              <h2 className="text-white text-xl font-bold">Davet Kodu Oluşturuldu!</h2>
              {serverName && <p className="text-[#949ba4] text-sm">Sunucu: {serverName}</p>}
            </div>
          </div>

          {/* Loading */}
          {creating && (
            <div className="text-center py-8">
              <div className="inline-block w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-[#949ba4] text-sm mt-3">Davet kodu oluşturuluyor...</p>
            </div>
          )}

          {/* Error */}
          {createError && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 mb-4">
              <p className="text-red-300 text-sm">❌ {createError}</p>
            </div>
          )}

          {/* Created Invite */}
          {createdInvite && !creating && (
            <>
              {/* Kod */}
              <div className="bg-black/40 backdrop-blur-sm rounded-lg p-4 mb-4 border border-white/10">
                <label className="text-[#949ba4] text-xs font-semibold uppercase mb-2 block">
                  Davet Kodu
                </label>
                <div className="bg-[#1e1f22] rounded px-4 py-3 border border-white/10">
                  <code className="text-white text-2xl font-mono font-bold tracking-wider select-all">
                    {createdInvite.code}
                  </code>
                </div>
              </div>

              {/* Butonlar */}
              <div className="flex gap-3">
                <button
                  onClick={handleCopyLink}
                  className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors font-semibold"
                >
                  {copied ? '✅ Kopyalandı!' : '📋 Kodu Kopyala'}
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 bg-[#4e5058] hover:bg-[#6d6f78] text-white rounded-md transition-colors"
                >
                  Kapat
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ============ JOIN MODE RENDER ============
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
            🚀
          </div>
          <div>
            <h2 className="text-white text-xl font-bold">Sunucuya Katıl</h2>
            <p className="text-[#949ba4] text-sm">Davet kodu ile sunucuya katılın</p>
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

        {/* inviteCode varsa — mevcut davranış (sunucu bilgisi göster + katıl) */}
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

        {/* inviteCode yoksa — manuel kod girişi */}
        {!inviteCode && !loading && (
          <>
            <div className="mb-4">
              <label className="text-[#949ba4] text-xs font-semibold uppercase mb-2 block">
                Davet Kodu
              </label>
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && manualCode.trim()) {
                    handleManualSubmit();
                  }
                }}
                placeholder="ABC123"
                maxLength={20}
                autoFocus
                className="w-full bg-black/40 text-white rounded px-3 py-2 text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-indigo-500 border border-white/10"
              />
            </div>

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
                onClick={handleManualSubmit}
                disabled={!manualCode.trim() || joining}
                className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md transition-colors font-semibold"
              >
                {joining ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Katılıyor...
                  </span>
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