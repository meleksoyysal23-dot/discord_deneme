/**
 * ChatPanel Component
 * Mesaj listesi ve input alanı
 */

import { useState } from 'react';
import { getDisplayName } from '../utils/username';

/**
 * Chat paneli bileşeni
 * @param {object} props
 * @param {boolean} props.isOpen - Panel açık mı?
 * @param {Array} props.messages - Mesaj listesi
 * @param {function} props.onSendMessage - Mesaj gönderme fonksiyonu
 * @param {string} props.localUserId - Yerel kullanıcı ID'si
 * @param {Map} props.usernames - Kullanıcı isimleri (userId -> username)
 * @param {object} props.messagesEndRef - Auto-scroll için ref
 * @param {function} props.onClose - Panel kapatma fonksiyonu
 */
export function ChatPanel({
  isOpen,
  messages,
  onSendMessage,
  localUserId,
  usernames,
  messagesEndRef,
  onClose,
}) {
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputValue.trim()) {
      onSendMessage(inputValue);
      setInputValue('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getSenderName = (senderId) => {
    if (senderId === localUserId) {
      return 'Sen';
    }
    const username = usernames?.get?.(senderId);
    return getDisplayName(senderId, username);
  };

  if (!isOpen) return null;

  return (
    <div className="flex flex-col h-full bg-slate-800 rounded-lg border border-slate-700">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
        <h3 className="text-sm font-semibold text-white">💬 Sohbet</h3>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white transition-colors"
          aria-label="Sohbeti kapat"
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-slate-500 text-sm py-8">
            Henüz mesaj yok. İlk mesajı gönder!
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex flex-col ${
                msg.isLocal ? 'items-end' : 'items-start'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-slate-400">
                  {getSenderName(msg.from)}
                </span>
                <span className="text-xs text-slate-500">
                  {formatTime(msg.timestamp)}
                </span>
              </div>
              <div
                className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                  msg.isLocal
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-100'
                }`}
              >
                {msg.message}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-slate-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Mesaj yaz..."
            maxLength={500}
            className="flex-1 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={!inputValue.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg text-white text-sm font-medium transition-colors"
          >
            Gönder
          </button>
        </div>
      </form>
    </div>
  );
}
