import { useState, useMemo, useEffect } from 'react';
import { UserAvatar } from './UserAvatar';
import { ControlBar } from './ControlBar';
import { ShareModal } from './ShareModal';
import { ConnectionStatus } from './ConnectionStatus';
import { ChatPanel } from './ChatPanel';
import { useChat } from '../hooks/useChat';

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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
      {/* Header */}
      <div className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700 p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">Vibe-Voice</h1>
                <p className="text-xs text-slate-400">Oda: {roomId}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-sm text-slate-400">
              <span className="font-medium text-white">{users.length}</span>/4 kullanıcı
            </div>
            <ConnectionStatus isConnected={isConnected} connectionError={connectionError} />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-4xl w-full flex gap-4">
          {/* Sol: Kullanıcı Grid + Kontrol */}
          <div className="flex-1">
            {/* Users Grid */}
            <div className="grid grid-cols-2 gap-6 md:gap-8 mb-8">
              {enrichedUsers.map((user) => (
                <UserAvatar
                  key={user.userId}
                  user={user}
                  volume={user.volume}
                  isLocalUser={user.isLocalUser}
                  username={user.isLocalUser ? username : undefined}
                />
              ))}

              {/* Empty slots */}
              {Array.from({ length: Math.max(0, 4 - users.length) }).map((_, index) => (
                <div
                  key={`empty-${index}`}
                  className="flex flex-col items-center gap-2"
                >
                  <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-slate-800 border-2 border-dashed border-slate-700 flex items-center justify-center">
                    <svg
                      className="w-8 h-8 text-slate-600"
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
                  <p className="text-sm text-slate-600">Boş</p>
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
            />
          </div>

          {/* Sağ: ChatPanel (açık/kapalı) */}
          {isChatOpen && (
            <div className="w-80 flex-shrink-0">
              <ChatPanel
                isOpen={isChatOpen}
                messages={messages}
                onSendMessage={sendMessage}
                localUserId={localUserId}
                usernames={usernames}
                messagesEndRef={messagesEndRef}
                onClose={closeChat}
              />
            </div>
          )}
        </div>
      </div>

      {/* Share Modal */}
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={handleCloseShareModal}
        shareLink={shareLink}
      />
    </div>
  );
}
