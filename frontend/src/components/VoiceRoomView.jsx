import { useState, useMemo, useRef, useEffect } from 'react';
import { UserAvatar } from './UserAvatar';
import { ControlBar } from './ControlBar';
import { ShareModal } from './ShareModal';
import { ConnectionStatus } from './ConnectionStatus';

/**
 * VoiceRoomView Component
 * Ses kanalının ana içerik görünümü (DiscordLayout sarmalayıcısı yok).
 * Room.jsx'ten çıkarılan içerik; artık App tek bir DiscordLayout render eder.
 *
 * @param {object} props
 * @param {Array} props.users - Kullanıcı listesi (useRoom'dan)
 * @param {string} props.localUserId - Yerel kullanıcı ID'si
 * @param {string} props.username - Yerel kullanıcı adı
 * @param {Array} props.participants - LiveKit katılımcı listesi
 * @param {Array<string>} props.activeSpeakers - Aktif konuşan kullanıcı ID'leri
 * @param {number} props.localVolume - Yerel ses seviyesi
 * @param {boolean} props.isMuted - Mikrofon susturulmuş mu?
 * @param {boolean} props.isDeafened - Kulaklık susturulmuş mu?
 * @param {boolean} props.isConnected - Socket + LiveKit bağlantı durumu
 * @param {string|null} props.connectionError - Bağlantı hatası
 * @param {function} props.onToggleMute - Mute toggle
 * @param {function} props.onToggleDeafen - Deafen toggle
 * @param {function} props.onLeave - Odadan ayrıl
 * @param {string} props.shareLink - Paylaşılacak link
 * @param {number} props.masterVolume - Ana ses seviyesi (0-1)
 * @param {function} props.onMasterVolumeChange - Ana ses seviyesi değişim
 * @param {function} props.onPeerVolumeChange - Kullanıcı ses seviyesi değişim
 * @param {object} props.userVolumes - Kullanıcı ses seviyeleri { userId: volume }
 * @param {boolean} props.isScreenSharing - Ekran paylaşımı aktif mi?
 * @param {boolean} props.isCameraEnabled - Kamera aktif mi?
 * @param {function} props.onOpenScreenShare - Ekran paylaşım modalını aç
 * @param {function} props.onStopScreenShare - Ekran paylaşımını durdur
 * @param {function} props.onToggleCamera - Kamerayı aç/kapat
 * @param {MediaStream|null} props.screenShareStream - Ekran paylaşımı video stream'i
 * @param {Object} props.cameraStreams - Kamera stream'leri { userId: MediaStream }
 */
export function VoiceRoomView({
  users,
  localUserId,
  username,
  participants = [],
  activeSpeakers = [],
  localVolume,
  isMuted,
  isDeafened,
  isConnected,
  connectionError,
  onToggleMute,
  onToggleDeafen,
  onLeave,
  shareLink,
  masterVolume = 1,
  onMasterVolumeChange,
  onPeerVolumeChange,
  userVolumes = {},
  isScreenSharing = false,
  isCameraEnabled = false,
  onOpenScreenShare,
  onStopScreenShare,
  onToggleCamera,
  screenShareStream = null, // Ekran paylaşımı video stream'i
  cameraStreams = {}, // Kamera stream'leri { userId: MediaStream }
  onCreateInvite, // Davet kodu oluştur handler
}) {
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isScreenShareFullscreen, setIsScreenShareFullscreen] = useState(false);
  const screenShareVideoRef = useRef(null);
  const cameraVideoRefs = useRef({});

  // Ekran paylaşımı tam ekran toggle
  const handleScreenShareClick = () => {
    if (!screenShareVideoRef.current) return;

    if (!document.fullscreenElement) {
      // Tam ekrana gir
      screenShareVideoRef.current.requestFullscreen().then(() => {
        setIsScreenShareFullscreen(true);
      }).catch(err => {
        console.error('Fullscreen error:', err);
      });
    } else {
      // Tam ekrandan çık
      document.exitFullscreen().then(() => {
        setIsScreenShareFullscreen(false);
      }).catch(err => {
        console.error('Exit fullscreen error:', err);
      });
    }
  };

  // Fullscreen değişimlerini dinle (ESC ile çıkış durumunda state güncelle)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsScreenShareFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Kullanıcı bilgilerini zenginleştir (volume, mute durumu, speaking durumu)
  // LiveKit participants array'inden konuşma durumunu al
  const enrichedUsers = useMemo(() => {
    return users.map((user) => {
      const isLocalUser = user.userId === localUserId;
      let volume = 0;
      let isSpeaking = false;

      if (isLocalUser) {
        volume = localVolume;
        // Local kullanıcı speaking bilgisini activeSpeakers'dan al
        isSpeaking = activeSpeakers.includes(user.userId);
      } else {
        // Remote kullanıcı - participants array'inde ara
        const participant = participants.find((p) => p.userId === user.userId);
        if (participant) {
          isSpeaking = participant.isSpeaking || activeSpeakers.includes(user.userId);
        } else {
          isSpeaking = activeSpeakers.includes(user.userId);
        }
      }

      const userIsMuted = isLocalUser ? isMuted : false;
      return { ...user, isLocalUser, volume, isMuted: userIsMuted, isSpeaking };
    });
  }, [users, localUserId, participants, activeSpeakers, localVolume, isMuted]);

  const handleShareClick = () => setIsShareModalOpen(true);
  const handleCloseShareModal = () => setIsShareModalOpen(false);

  // Ekran paylaşımı video element'e bağla
  useEffect(() => {
    if (screenShareVideoRef.current && screenShareStream) {
      screenShareVideoRef.current.srcObject = screenShareStream;
    } else if (screenShareVideoRef.current && !screenShareStream) {
      screenShareVideoRef.current.srcObject = null;
    }
  }, [screenShareStream]);

  // Kamera video element'lerini bağla
  useEffect(() => {
    Object.entries(cameraStreams).forEach(([userId, stream]) => {
      const videoEl = cameraVideoRefs.current[userId];
      if (videoEl && stream) {
        videoEl.srcObject = stream;
      } else if (videoEl && !stream) {
        videoEl.srcObject = null;
      }
    });
  }, [cameraStreams]);

  return (
    <>
      <div className="flex-1 flex flex-col min-h-0 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        {/* Header */}
        <div className="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700 p-4 flex-shrink-0">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="text-gray-400 text-sm">
                <span className="font-medium text-white">{users.length}</span>/4 kullanıcı
              </div>
            </div>
            <div className="flex items-center gap-2">
              {onCreateInvite && (
                <button
                  onClick={onCreateInvite}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-md transition-colors flex items-center gap-1.5"
                  title="Davet kodu oluştur"
                >
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6z" />
                  </svg>
                  Davet Et
                </button>
              )}
              <ConnectionStatus isConnected={isConnected} connectionError={connectionError} />
            </div>
          </div>
        </div>

        {/* Main Content - Discord Style Grid */}
        <div className="flex-1 flex flex-col min-h-0 p-4 md:p-6">
          <div className="flex-1 flex flex-col min-h-0">
            {/* Ekran Paylaşımı + Kamera Grid */}
            {isScreenSharing ? (
              /* Ekran Paylaşımı Aktif - Büyük Ekran + Küçük Kameralar */
              <div className="flex-1 flex flex-col min-h-0 gap-4">
                {/* Büyük Ekran Paylaşımı */}
                <div 
                  className="flex-1 relative bg-black rounded-lg overflow-hidden min-h-0 cursor-pointer group"
                  onClick={handleScreenShareClick}
                  title={isScreenShareFullscreen ? "Tam ekrandan çıkmak için tıkla" : "Tam ekran için tıkla"}
                >
                  <video
                    ref={screenShareVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-contain"
                  />
                  {/* "720P 30 FPS YAYINDA" Etiketi */}
                  <div className="absolute top-4 left-4 bg-green-600 text-white px-3 py-1.5 rounded-md text-sm font-semibold flex items-center gap-2 shadow-lg">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                    720P 30 FPS YAYINDA
                  </div>
                  {/* Tam Ekran İkonu (hover'da görünür) */}
                  <div className="absolute top-4 right-4 bg-black/70 text-white p-2 rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
                    {isScreenShareFullscreen ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                      </svg>
                    )}
                  </div>
                </div>

                {/* Küçük Kamera Grid'leri (Sağ Alt) */}
                {isCameraEnabled && (
                  <div className="absolute bottom-24 right-6 grid grid-cols-2 gap-2 max-w-[320px]">
                    {enrichedUsers.filter(u => u.isLocalUser || cameraStreams[u.userId]).slice(0, 4).map((user) => (
                      <div key={user.userId} className="relative aspect-video bg-gray-800 rounded-lg overflow-hidden border-2 border-gray-700 shadow-lg">
                        <video
                          ref={el => cameraVideoRefs.current[user.userId] = el}
                          autoPlay
                          playsInline
                          muted={user.isLocalUser}
                          className="w-full h-full object-cover"
                        />
                        {/* İsim Etiketi */}
                        <div className="absolute bottom-1 left-1 bg-black/70 text-white px-2 py-0.5 rounded text-xs font-medium">
                          {user.isLocalUser ? username : user.username}
                          {user.isLocalUser && ' (Sen)'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : isCameraEnabled ? (
              /* Sadece Kamera Aktif - Eşit Boyutlu Grid */
              <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-4 auto-rows-fr">
                {enrichedUsers.filter(u => u.isLocalUser || cameraStreams[u.userId]).map((user) => (
                  <div key={user.userId} className="relative aspect-video bg-gray-800 rounded-lg overflow-hidden border-2 border-gray-700">
                    <video
                      ref={el => cameraVideoRefs.current[user.userId] = el}
                      autoPlay
                      playsInline
                      muted={user.isLocalUser}
                      className="w-full h-full object-cover"
                    />
                    {/* İsim Etiketi */}
                    <div className="absolute bottom-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-sm font-medium">
                      {user.isLocalUser ? username : user.username}
                      {user.isLocalUser && ' (Sen)'}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Hiç Yayın Yok - Avatar Grid + Empty State */
              <div className="flex-1 flex flex-col items-center justify-center min-h-0">
                <div className="max-w-4xl w-full">
                  {/* Users Grid */}
                  <div className="grid grid-cols-2 gap-6 md:gap-8 mb-8">
                    {enrichedUsers.map((user) => (
                      <div key={user.userId} className="flex flex-col items-center gap-2">
                        <UserAvatar
                          user={user}
                          volume={user.volume}
                          isLocalUser={user.isLocalUser}
                          username={user.isLocalUser ? username : undefined}
                          isSpeaking={user.isSpeaking}
                        />

                        {!user.isLocalUser && user.lastSeen && (
                          <div className="text-xs text-slate-400 text-center">
                            {user.isOnline ? '🟢 Çevrimiçi' : `Son görülme: ${formatLastSeen(user.lastSeen)}`}
                          </div>
                        )}

                        {!user.isLocalUser && (
                          <div className="w-full max-w-[120px] px-2">
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.01"
                              value={userVolumes[user.userId] ?? 1}
                              onChange={(e) => {
                                const volume = parseFloat(e.target.value);
                                if (onPeerVolumeChange) {
                                  onPeerVolumeChange(user.userId, volume);
                                }
                              }}
                              className="w-full h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                              aria-label={`${user.username || user.userId} ses seviyesi`}
                              title="Kullanıcı ses seviyesi"
                            />
                            <div className="text-xs text-slate-400 text-center mt-1">
                              {Math.round((userVolumes[user.userId] ?? 1) * 100)}%
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {Array.from({ length: Math.max(0, 4 - users.length) }).map((_, index) => (
                      <div key={`empty-${index}`} className="flex flex-col items-center gap-2">
                        <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-gray-800 border-2 border-dashed border-gray-700 flex items-center justify-center">
                          <svg className="w-8 h-8 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </div>
                        <p className="text-sm text-gray-600">Boş</p>
                      </div>
                    ))}
                  </div>

                  {/* Empty State Message */}
                  <div className="text-center py-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-800 mb-4">
                      <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <p className="text-gray-400 text-lg font-medium mb-2">Henüz yayın yok</p>
                    <p className="text-gray-500 text-sm">Kamera veya ekran paylaşımını başlatın</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Control Bar - Sabit Alt */}
          <div className="flex-shrink-0 mt-4">
            <div className="max-w-4xl mx-auto">
              <ControlBar
                isMuted={isMuted}
                isDeafened={isDeafened}
                onToggleMute={onToggleMute}
                onToggleDeafen={onToggleDeafen}
                onLeave={onLeave}
                onShareLink={handleShareClick}
                masterVolume={masterVolume}
                onMasterVolumeChange={onMasterVolumeChange}
                isScreenSharing={isScreenSharing}
                isCameraEnabled={isCameraEnabled}
                onOpenScreenShare={onOpenScreenShare}
                onStopScreenShare={onStopScreenShare}
                onToggleCamera={onToggleCamera}
              />
            </div>
          </div>
        </div>
      </div>

      <ShareModal
        isOpen={isShareModalOpen}
        onClose={handleCloseShareModal}
        shareLink={shareLink}
      />
    </>
  );
}

/**
 * Son görülme zamanını formatla
 */
function formatLastSeen(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 60) return 'Az önce';
  if (minutes < 60) return `${minutes} dakika önce`;
  if (hours < 24) return `${hours} saat önce`;
  return new Date(timestamp).toLocaleDateString('tr-TR');
}

export default VoiceRoomView;
