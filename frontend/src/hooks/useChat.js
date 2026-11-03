/**
 * useChat Hook
 * Chat mesajları state yönetimi ve socket event handler'ları
 */

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Chat hook'u
 * @param {import('socket.io-client').Socket|null} socket - Socket.io instance
 * @param {string|null} roomId - Oda ID'si
 * @param {string|null} userId - Yerel kullanıcı ID'si
 * @param {string} username - Yerel kullanıcı adı
 * @param {boolean} [isOpen] - Panel açık mı? Verilirse controlled çalışır;
 *   okunmamış sayacı bu değere göre artar (App tek layout render ettiği için).
 * @returns {object} Chat state ve fonksiyonları
 */
export function useChat(socket, roomId, userId, username, isOpen) {
  const [messages, setMessages] = useState([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef(null);

  // Controlled açık durumu (opsiyonel, geriye uyumlu)
  const controlledOpen = typeof isOpen === 'boolean';
  const openState = controlledOpen ? isOpen : isChatOpen;
  const openStateRef = useRef(openState);

  useEffect(() => {
    openStateRef.current = openState;
    // Panel açıldığında okunmamış sayacı sıfırla
    if (openState) setUnreadCount(0);
  }, [openState]);

  // Socket event listener - gelen mesajları dinle
  useEffect(() => {
    if (!socket || !roomId) return;

    const handleChatMessage = (data) => {
      const { from, message, timestamp } = data;

      setMessages((prev) => [
        ...prev,
        {
          from,
          message,
          timestamp,
          isLocal: from === userId,
        },
      ]);

      // Chat kapalıysa ve mesaj yerel değilse, okunmamış sayacı artır
      if (!openStateRef.current && from !== userId) {
        setUnreadCount((prev) => prev + 1);
      }
    };

    socket.on('chat-message', handleChatMessage);

    return () => {
      socket.off('chat-message', handleChatMessage);
    };
  }, [socket, roomId, userId]);

  // Mesaj gönder
  const sendMessage = useCallback(
    (text) => {
      if (!socket || !roomId || !userId || !text || !text.trim()) return;

      const trimmed = text.trim().substring(0, 500);

      // Backend'e gönder (acknowledgement callback ile)
      socket.emit(
        'chat-message',
        {
          roomId,
          userId,
          username: username || '',
          message: trimmed,
        },
        (response) => {
          if (response && response.success) {
            // Kendi mesajını ekle (backend broadcast etmez sender'a)
            setMessages((prev) => [
              ...prev,
              {
                from: userId,
                message: trimmed,
                timestamp: Date.now(),
                isLocal: true,
              },
            ]);
          } else {
            console.error('Chat message failed:', response?.error);
          }
        }
      );
    },
    [socket, roomId, userId, username]
  );

  // Oda değiştiğinde mesajları temizle
  useEffect(() => {
    setMessages([]);
    setUnreadCount(0);
  }, [roomId]);

  // Auto-scroll - yeni mesaj geldiğinde en alta kaydır
  useEffect(() => {
    if (messagesEndRef.current && openState) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, openState]);

  // Chat'i aç/kapat
  const toggleChat = useCallback(() => {
    setIsChatOpen((prev) => {
      const next = !prev;
      // Chat açıldığında okunmamış sayacı sıfırla
      if (next) {
        setUnreadCount(0);
      }
      return next;
    });
  }, []);

  const closeChat = useCallback(() => {
    setIsChatOpen(false);
  }, []);

  return {
    messages,
    isChatOpen,
    unreadCount,
    sendMessage,
    toggleChat,
    closeChat,
    messagesEndRef,
  };
}
