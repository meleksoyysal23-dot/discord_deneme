import { useState, useMemo } from 'react';
import { getDisplayName } from '../utils/username';

/**
 * ChatPanel Component
 * Kick tarzı mesaj listesi — mesaj gruplama, kendi mesajlarında sağ hizalama,
 * sistem mesajları için soluk stil, boş durum ve gönder butonu.
 *
 * @param {object} props
 * @param {boolean} props.isOpen - Panel açık mı?
 * @param {Array} props.messages - Mesaj listesi
 * @param {function} props.onSendMessage - Mesaj gönderme fonksiyonu
 * @param {string} props.localUserId - Yerel kullanıcı ID'si
 * @param {Map} props.usernames - Kullanıcı isimleri (userId -> username)
 * @param {object} props.messagesEndRef - Auto-scroll için ref
 */

// Aynı kullanıcıdan arka arkaya gelen mesajlar bu pencere içindeyse gruplanır
const GROUP_WINDOW_MS = 5 * 60 * 1000;

const isSystemMessage = (msg) =>
  msg?.type === 'system' || msg?.isSystem === true;

const getTimestampMs = (ts) => {
  if (ts == null) return 0;
  if (typeof ts === 'number') return ts;
  const t = new Date(ts).getTime();
  return Number.isFinite(t) ? t : 0;
};

export function ChatPanel({
  isOpen,
  messages,
  onSendMessage,
  localUserId,
  usernames,
  messagesEndRef,
}) {
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    const trimmed = inputValue.trim();
    if (trimmed && onSendMessage) {
      onSendMessage(trimmed);
      setInputValue('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getSenderName = (senderId) => {
    if (senderId === localUserId) return 'Sen';
    const u = usernames?.get?.(senderId);
    return getDisplayName(senderId, u);
  };

  const getSenderInitial = (senderId) => {
    const name = getSenderName(senderId);
    return name?.[0]?.toUpperCase() || 'U';
  };

  // Mesajları grupla: aynı kullanıcı, 5 dakika içinde → avatar/isim gizle
  const groupedMessages = useMemo(() => {
    return messages.map((msg, idx) => {
      const prev = idx > 0 ? messages[idx - 1] : null;
      const system = isSystemMessage(msg);
      const own = msg.from === localUserId;
      let grouped = false;
      if (!system && prev && !isSystemMessage(prev) && prev.from === msg.from) {
        const dt = Math.abs(
          getTimestampMs(msg.timestamp) - getTimestampMs(prev.timestamp)
        );
        if (dt < GROUP_WINDOW_MS) grouped = true;
      }
      return { msg, system, own, grouped, idx };
    });
  }, [messages, localUserId]);

  if (!isOpen) return null;

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* Mesajlar */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4">
            <div className="w-16 h-16 rounded-full bg-[#35373c] flex items-center justify-center mb-3 text-3xl">
              💬
            </div>
            <p className="text-white font-medium mb-1">Henüz mesaj yok</p>
            <p className="text-[#949ba4] text-sm">
              Bu kanala gönderilen ilk mesaj sen olsun.
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {groupedMessages.map(({ msg, system, own, grouped, idx }) => {
              const key =
                msg.id ||
                `${msg.from}-${getTimestampMs(msg.timestamp)}-${idx}`;

              // Sistem mesajı
              if (system) {
                return (
                  <div key={key} className="flex justify-center py-1.5">
                    <span className="text-xs text-[#949ba4] italic px-2 py-0.5 rounded bg-[#35373c]/50">
                      {msg.message}
                    </span>
                  </div>
                );
              }

              // Kendi mesajım — sağda, accent bubble
              if (own) {
                return (
                  <div
                    key={key}
                    className={`flex justify-end ${
                      grouped ? 'mt-0.5' : 'mt-3'
                    }`}
                  >
                    <div className="max-w-[85%] flex flex-col items-end">
                      {!grouped && (
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs text-[#949ba4]">
                            {formatTime(msg.timestamp)}
                          </span>
                          <span className="text-sm font-medium text-white">
                            Sen
                          </span>
                        </div>
                      )}
                      <div className="px-3 py-1.5 rounded-2xl rounded-tr-sm bg-[#5865f2] text-white text-sm break-words whitespace-pre-wrap">
                        {msg.message}
                      </div>
                    </div>
                  </div>
                );
              }

              // Diğer kullanıcı — solda, avatar + isim
              return (
                <div
                  key={key}
                  className={`flex items-start ${
                    grouped ? 'mt-0.5 pl-10' : 'mt-3'
                  }`}
                >
                  {!grouped ? (
                    <div className="w-8 h-8 rounded-full bg-[#5865f2] flex items-center justify-center text-white text-sm font-bold mr-3 flex-shrink-0 mt-0.5">
                      {getSenderInitial(msg.from)}
                    </div>
                  ) : (
                    <span className="w-8 flex-shrink-0 text-[10px] text-[#949ba4] text-center leading-8 opacity-0 hover:opacity-100 transition-opacity">
                      {formatTime(msg.timestamp)}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    {!grouped && (
                      <div className="flex items-baseline gap-2 mb-0.5">
                        <span className="text-white font-medium text-sm">
                          {getSenderName(msg.from)}
                        </span>
                        <span className="text-[#949ba4] text-xs">
                          {formatTime(msg.timestamp)}
                        </span>
                      </div>
                    )}
                    <div className="text-[#dbdee1] text-sm break-words whitespace-pre-wrap">
                      {msg.message}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="px-4 pb-4 pt-2 flex-shrink-0">
        <div className="flex items-center gap-2 bg-[#383a40] rounded-lg px-3 py-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Mesajınızı yazın..."
            maxLength={500}
            className="flex-1 bg-transparent text-white text-sm focus:outline-none placeholder-[#949ba4]"
          />
          <button
            type="submit"
            disabled={!inputValue.trim()}
            className="text-[#5865f2] hover:text-[#4752c4] disabled:text-[#949ba4] disabled:opacity-40 transition-colors flex-shrink-0"
            aria-label="Mesaj gönder"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
              <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
