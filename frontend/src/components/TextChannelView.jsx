import { useState, useEffect, useRef, useMemo } from 'react';
import { loadMessages, appendMessage } from '../utils/localChat';

/**
 * TextChannelView Component
 * Metin kanalı için büyük sohbet görünümü.
 * Mesajlar localStorage'da kanal başına saklanır (socket entegrasyonu yok).
 * 
 * App'te key={channel.id} ile kullanılır; kanal değişince remount olur.
 * Mesajlar controlled verilebilir (App sağ ChatPanel ile aynı state'i paylaşır);
 * verilmezse localStorage'dan yüklenip yerel state'te tutulur.
 *
 * @param {object} props
 * @param {object} props.channel - Kanal objesi {id, name, type}
 * @param {string} props.localUserId - Yerel kullanıcı ID
 * @param {string} props.username - Yerel kullanıcı adı
 * @param {Array} [props.messages] - Controlled mesaj listesi (App'ten)
 * @param {function} [props.onSendMessage] - Controlled gönderim (App'ten)
 */
export function TextChannelView({
  channel,
  localUserId,
  username,
  messages: controlledMessages,
  onSendMessage,
}) {
  const [internalMessages, setInternalMessages] = useState(() =>
    loadMessages(channel?.id)
  );
  const isControlled = Array.isArray(controlledMessages);
  const messages = isControlled ? controlledMessages : internalMessages;
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);

  // Yeni mesaj geldiğinde otomatik scroll
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed || !channel?.id) return;

    if (isControlled) {
      // App state'ini günceller; mesajın kalıcılığı App tarafından sağlanır
      if (onSendMessage) onSendMessage(trimmed);
    } else {
      const msg = {
        id: `m-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        from: localUserId,
        username: username || 'Anonim',
        message: trimmed.substring(0, 500),
        timestamp: Date.now(),
      };
      const updated = appendMessage(channel.id, msg);
      setInternalMessages(updated);
    }
    setInputValue('');
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

  const channelName = channel?.name || 'kanal';

  // Aynı kullanıcıdan arka arkaya gelen mesajları grupla (5 dk içinde)
  const groupedMessages = useMemo(() => {
    return messages.map((msg, idx) => {
      const prev = idx > 0 ? messages[idx - 1] : null;
      const own = msg.from === localUserId;
      let grouped = false;
      if (prev && prev.from === msg.from) {
        const dt = Math.abs((msg.timestamp || 0) - (prev.timestamp || 0));
        if (dt < 5 * 60 * 1000) grouped = true;
      }
      return { msg, own, grouped, idx };
    });
  }, [messages, localUserId]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-transparent">
      {/* Header */}
      <div className="h-12 flex items-center px-4 border-b border-[#1f2023] flex-shrink-0">
        <span className="text-[#949ba4] mr-1.5" aria-hidden>#</span>
        <h2 className="text-white font-semibold text-[15px] truncate">{channelName}</h2>
      </div>

      {/* Mesajlar */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 py-3 min-h-0"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 py-12">
            <div className="w-16 h-16 rounded-full bg-[#35373c] flex items-center justify-center mb-3 text-3xl">
              #
            </div>
            <p className="text-white font-medium mb-1">#{channelName} kanalına hoş geldin</p>
            <p className="text-[#949ba4] text-sm max-w-sm">
              Bu kanalın başlangıç noktası. İlk mesajı sen gönder.
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {groupedMessages.map(({ msg, own, grouped, idx }) => {
              const key = msg.id || `${msg.from}-${msg.timestamp}-${idx}`;
              const senderName = own ? 'Sen' : (msg.username || 'Anonim');
              const initial = senderName.charAt(0).toUpperCase();

              if (own) {
                return (
                  <div
                    key={key}
                    className={`flex justify-end ${grouped ? 'mt-0.5' : 'mt-3'}`}
                  >
                    <div className="max-w-[85%] flex flex-col items-end">
                      {!grouped && (
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs text-[#949ba4]">
                            {formatTime(msg.timestamp)}
                          </span>
                          <span className="text-sm font-medium text-white">Sen</span>
                        </div>
                      )}
                      <div className="px-3 py-1.5 rounded-2xl rounded-tr-sm bg-[#5865f2] text-white text-sm break-words whitespace-pre-wrap">
                        {msg.message}
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={key}
                  className={`flex items-start ${grouped ? 'mt-0.5 pl-10' : 'mt-3'}`}
                >
                  {!grouped ? (
                    <div className="w-8 h-8 rounded-full bg-[#5865f2] flex items-center justify-center text-white text-sm font-bold mr-3 flex-shrink-0 mt-0.5">
                      {initial}
                    </div>
                  ) : (
                    <span className="w-8 flex-shrink-0 text-[10px] text-[#949ba4] text-center leading-8 opacity-0 hover:opacity-100 transition-opacity">
                      {formatTime(msg.timestamp)}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    {!grouped && (
                      <div className="flex items-baseline gap-2 mb-0.5">
                        <span className="text-white font-medium text-sm">{senderName}</span>
                        <span className="text-[#949ba4] text-xs">{formatTime(msg.timestamp)}</span>
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
            placeholder={`#${channelName} kanalına mesaj gönder`}
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

export default TextChannelView;
