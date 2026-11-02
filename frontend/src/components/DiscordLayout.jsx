import { useState } from 'react';

/**
 * DiscordLayout Component
 * Discord/Kick hibrit arayüz layout bileşeni
 * @param {object} props
 * @param {React.ReactNode} props.children - Ana içerik
 * @param {React.ReactNode} props.chatPanel - Chat panel içeriği
 * @param {string} props.username - Kullanıcı adı
 * @param {string} props.roomId - Mevcut oda ID (opsiyonel)
 */
export function DiscordLayout({ children, chatPanel, username, roomId, chatOpen: controlledChatOpen, onToggleChat }) {
  const [internalChatOpen, setInternalChatOpen] = useState(true);
  const chatOpen = controlledChatOpen !== undefined ? controlledChatOpen : internalChatOpen;

  const handleToggleChat = () => {
    if (onToggleChat) {
      onToggleChat();
    } else {
      setInternalChatOpen(!internalChatOpen);
    }
  };

  const userInitial = username?.[0]?.toUpperCase() || 'U';
  const displayName = username || 'Kullanıcı';

  return (
    <div className="flex h-screen bg-gray-900 overflow-hidden">
      {/* Sol Sidebar - Discord Tarzı */}
      <aside className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col flex-shrink-0">
        {/* Sunucu Başlığı */}
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-white font-bold text-lg">Weebers EMPIRE</h2>
          {roomId && (
            <p className="text-gray-400 text-xs mt-1">Oda: {roomId}</p>
          )}
        </div>

        {/* Kanal Listesi */}
        <div className="flex-1 overflow-y-auto p-2">
          {/* Metin Kanalları */}
          <div className="mb-4">
            <h3 className="text-gray-400 text-xs font-semibold uppercase px-2 mb-2">
              Metin Kanalları
            </h3>
            <div className="space-y-1">
              <div className="flex items-center px-2 py-1.5 text-gray-300 hover:bg-gray-700 rounded cursor-pointer transition-colors">
                <span className="text-gray-500 mr-2">#</span>
                <span className="text-sm">general</span>
              </div>
              <div className="flex items-center px-2 py-1.5 text-gray-300 hover:bg-gray-700 rounded cursor-pointer transition-colors">
                <span className="text-gray-500 mr-2">#</span>
                <span className="text-sm">pancake</span>
              </div>
              <div className="flex items-center px-2 py-1.5 text-gray-300 hover:bg-gray-700 rounded cursor-pointer transition-colors">
                <span className="text-gray-500 mr-2">#</span>
                <span className="text-sm">backroom</span>
              </div>
            </div>
          </div>

          {/* Ses Kanalları */}
          <div>
            <h3 className="text-gray-400 text-xs font-semibold uppercase px-2 mb-2">
              Ses Kanalları
            </h3>
            <div className="space-y-1">
              <div className="flex items-center px-2 py-1.5 text-gray-300 hover:bg-gray-700 rounded cursor-pointer transition-colors">
                <span className="text-gray-500 mr-2">🔊</span>
                <span className="text-sm">Genel Ses</span>
              </div>
              <div className="flex items-center px-2 py-1.5 text-gray-300 hover:bg-gray-700 rounded cursor-pointer transition-colors">
                <span className="text-gray-500 mr-2">🔊</span>
                <span className="text-sm">Oyun Odası</span>
              </div>
            </div>
          </div>
        </div>

        {/* Kullanıcı Bilgisi */}
        <div className="p-3 bg-gray-850 border-t border-gray-700" style={{ backgroundColor: '#1f2937' }}>
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold text-sm">
              {userInitial}
            </div>
            <div className="ml-3">
              <div className="text-white text-sm font-medium">{displayName}</div>
              <div className="text-gray-400 text-xs">#1234</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Orta Alan - Ana İçerik */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>

      {/* Sağ Chat Panel - Kick Tarzı */}
      {chatOpen && (
        <aside className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col flex-shrink-0">
          <div className="p-4 border-b border-gray-700 flex justify-between items-center">
            <h3 className="text-white font-semibold">💬 Sohbet</h3>
            <button
              onClick={handleToggleChat}
              className="text-gray-400 hover:text-white transition-colors"
              aria-label="Sohbeti kapat"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            {chatPanel}
          </div>
        </aside>
      )}

      {/* Chat Toggle Butonu */}
      {!chatOpen && (
        <button
          onClick={handleToggleChat}
          className="fixed right-4 top-1/2 transform -translate-y-1/2 bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-l-lg shadow-lg transition-colors z-50"
          aria-label="Sohbeti aç"
        >
          💬
        </button>
      )}
    </div>
  );
}
