import { useState, useMemo, useEffect } from 'react';
import { UserAvatar } from './UserAvatar';
import { ControlBar } from './ControlBar';
import { ShareModal } from './ShareModal';
import { ConnectionStatus } from './ConnectionStatus';
import { ChatPanel } from './ChatPanel';
import { DiscordLayout } from './DiscordLayout';
import { useChat } from '../hooks/useChat';
import UpdateStatus from './UpdateStatus';

/**
 * Son görülme zamanını formatla
 * @param {number} timestamp - Unix timestamp
 * @returns {string} Formatlanmış zaman
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

/**
 * Room Component
 * Ana oda ekranı - kullanıcı listesi ve kontroller
 * @param {object} props
 * @param {string} props.roomId - Oda ID'si
 * @param {Array} props.users - Kullanıcı listesi
 * @param {string} props.localUserId - Yerel kullanıcı ID'si
 * @param {string} props.username - Yerel kullanıcının adı
 * @param {Map} props.peers - WebRTC peer bilgileri
 * @param {number} props.localVolume - Yerel ses seviyesi
 * @param {boolean} props.isMuted - Mikrofon susturulmuş mu?
 * @param {boolean} props.isDeafened - Kulaklık susturulmuş mu?
 * @param {boolean} props.isConnected - Socket bağlantı durumu
 * @param {string|null} props.connectionError - Bağlantı hatası
 * @param {function} props.onToggleMute - Mute toggle fonksiyonu
 * @param {function} props.onToggleDeafen - Deafen toggle fonksiyonu
 * @param {function} props.onLeave - Odadan ayrılma fonksiyonu
 * @param {function} props.onShareLink - Link paylaşma fonksiyonu
 * @param {string} props.shareLink - Paylaşılacak link
 * @param {import('socket.io-client').Socket|null} props.socket - Socket.io instance
 * @param {number} props.masterVolume - Ana ses seviyesi (0-1)
 * @param {function} props.onMasterVolumeChange - Ana ses seviyesi değişim fonksiyonu
 * @param {function} props.onPeerVolumeChange - Kullanıcı ses seviyesi değişim fonksiyonu
 * @param {object} props.userVolumes - Kullanıcı ses seviyeleri { userId: volume }
 */
export function Room({
  roomId,
  users,
  localUserId,
  username,
  peers,
  localVolume,
  isMuted,
  isDeafened,
  isConnected,
  connectionError,
  onToggleMute,
  onToggleDeafen,
  onLeave,
  onShareLink,
  shareLink,
  socket,
  masterVolume = 1,
  onMasterVolumeChange,
  onPeerVolumeChange,
  userVolumes = {},
}) {
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  // Kullanıcı isimlerini Map olarak oluştur (userId -> username)
  const usernames = useMemo(() => {
    const map = new Map();
    users.forEach((user) => {
      if (user.username) {
        map.set(user.userId, user.username);
      }
    });
    return map;
  }, [users]);

  // Chat hook
  const {
    messages,
    isChatOpen,
    unreadCount,
    sendMessage,
    toggleChat,
    closeChat,
    messagesEndRef,
  } = useChat(socket, roomId, localUserId, username);

  // Kullanıcı bilgilerini zenginleştir (volume, mute durumu)
  const enrichedUsers = useMemo(() => {
    return users.map((user) => {
      const isLocalUser = user.userId === localUserId;
      
      // Volume bilgisi
      let volume = 0;
      if (isLocalUser) {
        volume = localVolume;
      } else {
        const peer = peers.get(user.userId);
        if (peer) {
          volume = peer.volume || 0;
        }
      }

      // Mute durumu (sadece local user için biliyoruz)
      const userIsMuted = isLocalUser ? isMuted : false;

      return {
        ...user,
        isLocalUser,
        volume,
        isMuted: userIsMuted,
      };
    });
  }, [users, localUserId, peers, localVolume, isMuted]);

  const handleShareClick = () => {
    setIsShareModalOpen(true);
  };

  const handleCloseShareModal = () => {
    setIsShareModalOpen(false);
  };

  return (
    <DiscordLayout
      username={username}
      roomId={roomId}
      chatOpen={isChatOpen}
      onToggleChat={toggleChat}
      chatPanel={
        <ChatPanel
          isOpen={isChatOpen}
          messages={messages}
          onSendMessage={sendMessage}
          localUserId={localUserId}
          usernames={usernames}
          messagesEndRef={messagesEndRef}
          onClose={closeChat}
        />
      }
    >
      {/* Sesli Kanal Grid */}
      <div className="flex-1 flex flex-col bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        {/* Header */}
        <div className="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700 p-4">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="text-gray-400 text-sm">
                <span className="font-medium text-white">{users.length}</span>/4 kullanıcı
              </div>
            </div>
            <ConnectionStatus isConnected={isConnected} connectionError={connectionError} />
          </div>
        </div>

        {/* Update Status */}
        <div className="px-4 pt-4">
          <div className="max-w-4xl mx-auto">
            <UpdateStatus />
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
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
                  />

                  {/* Son Görülme (sadece remote kullanıcılar için) */}
                  {!user.isLocalUser && user.lastSeen && (
                    <div className="text-xs text-slate-400 text-center">
                      {user.isOnline ? '🟢 Çevrimiçi' : `Son görülme: ${formatLastSeen(user.lastSeen)}`}
                    </div>
                  )}
                  
                  {/* Per-user volume slider (sadece remote kullanıcılar için) */}
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

              {/* Empty slots */}
              {Array.from({ length: Math.max(0, 4 - users.length) }).map((_, index) => (
                <div
                  key={`empty-${index}`}
                  className="flex flex-col items-center gap-2"
                >
                  <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-gray-800 border-2 border-dashed border-gray-700 flex items-center justify-center">
                    <svg
                      className="w-8 h-8 text-gray-600"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
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

            {/* Control Bar */}
            <ControlBar
              isMuted={isMuted}
              isDeafened={isDeafened}
              onToggleMute={onToggleMute}
              onToggleDeafen={onToggleDeafen}
              onLeave={onLeave}
              onShareLink={handleShareClick}
              onToggleChat={toggleChat}
              isChatOpen={isChatOpen}
              unreadCount={unreadCount}
              masterVolume={masterVolume}
              onMasterVolumeChange={onMasterVolumeChange}
            />
          </div>
        </div>
      </div>

      {/* Share Modal */}
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={handleCloseShareModal}
        shareLink={shareLink}
      />
    </DiscordLayout>
  );
}
