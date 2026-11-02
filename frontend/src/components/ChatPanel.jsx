/**
 * ChatPanel Component
 * Kick tarzı mesaj listesi ve input alanı
 */

import { useState } from 'react';
import { getDisplayName } from '../utils/username';

/**
 * Chat paneli bileşeni - Kick tarzı
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

  const getSenderInitial = (senderId) => {
    const name = getSenderName(senderId);
    return name?.[0]?.toUpperCase() || 'U';
  };

  if (!isOpen) return null;

  return (
    <div className="flex flex-col h-full bg-gray-800">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-8">
            Henüz mesaj yok. İlk mesajı gönder!
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} className="flex items-start">
              <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-sm font-bold mr-3 flex-shrink-0">
                {getSenderInitial(msg.from)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline">
                  <span className="text-white font-medium text-sm">
                    {getSenderName(msg.from)}
                  </span>
                  <span className="text-gray-500 text-xs ml-2">
                    {formatTime(msg.timestamp)}
                  </span>
                </div>
                <div className="text-gray-300 text-sm mt-0.5 break-words">
                  {msg.message}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-700">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Mesajınızı yazın..."
          maxLength={500}
          className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500"
        />
      </form>
    </div>
  );
}
