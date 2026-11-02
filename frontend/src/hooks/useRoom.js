/**
 * useRoom Hook
 * Oda oluşturma, katılma, ayrılma ve kullanıcı listesi yönetimi
 */

import { useState, useEffect, useCallback } from 'react';
import { getGender, getAvatar } from '../utils/username';

/**
 * Oda yönetimi hook'u
 * @param {import('socket.io-client').Socket|null} socket - Socket.io instance
 * @param {string} localUserId - Yerel kullanıcının ID'si
 * @returns {object} Oda state'i ve kontrol fonksiyonları
 */
export function useRoom(socket, localUserId) {
  const [currentRoom, setCurrentRoom] = useState(null);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);

  /**
   * Room ID üret (12 karakter alfanumerik)
   * @returns {string}
   */
  const generateRoomId = useCallback(() => {
    return crypto.randomUUID().replace(/-/g, '').substring(0, 12);
  }, []);

  /**
   * Odaya katıl
   * @param {string} roomId
   */
  const joinRoom = useCallback(
    (roomId) => {
      if (!socket || !localUserId || !roomId) {
        setError('Socket, userId veya roomId eksik');
        return;
      }

      // Profil bilgilerini al
      const gender = getGender();
      const avatar = getAvatar();

      socket.emit('join-room', { 
        roomId, 
        userId: localUserId,
        gender,  // 'male' | 'female' | null
        avatar,  // 1-20 arası sayı | null
      }, (response) => {
        if (response.success) {
          setCurrentRoom(roomId);
          setUsers(response.users || []);
          setError(null);

          // URL'i güncelle (link paylaşma için)
          const url = new URL(window.location.href);
          url.searchParams.set('room', roomId);
          window.history.pushState({}, '', url);
        } else {
          setError(response.error || 'Odaya katılma başarısız');
        }
      });
    },
    [socket, localUserId]
  );

  /**
   * Oda oluştur ve katıl
   * @returns {string} Oluşturulan room ID
   */
  const createRoom = useCallback(() => {
    const roomId = generateRoomId();
    joinRoom(roomId);
    return roomId;
  }, [generateRoomId, joinRoom]);

  /**
   * Odadan ayrıl
   */
  const leaveRoom = useCallback(() => {
    if (!socket || !currentRoom) return;

    socket.emit('leave-room', {}, (response) => {
      if (response.success) {
        setCurrentRoom(null);
        setUsers([]);

        // URL'den room parametresini kaldır
        const url = new URL(window.location.href);
        url.searchParams.delete('room');
        window.history.pushState({}, '', url);
      }
    });
  }, [socket, currentRoom]);

  // Socket event listener'ları
  useEffect(() => {
    if (!socket) return;

    const handleRoomUsers = ({ roomId, users: roomUsers }) => {
      if (roomId === currentRoom) {
        setUsers(roomUsers);
      }
    };

    const handleUserJoined = ({ roomId, users: roomUsers }) => {
      if (roomId === currentRoom) {
        setUsers(roomUsers);
      }
    };

    const handleUserLeft = ({ roomId, users: roomUsers }) => {
      if (roomId === currentRoom) {
        setUsers(roomUsers);
      }
    };

    socket.on('room-users', handleRoomUsers);
    socket.on('user-joined', handleUserJoined);
    socket.on('user-left', handleUserLeft);

    return () => {
      socket.off('room-users', handleRoomUsers);
      socket.off('user-joined', handleUserJoined);
      socket.off('user-left', handleUserLeft);
    };
  }, [socket, currentRoom]);

  // URL'den roomId'yi oku (link ile katılma)
  useEffect(() => {
    const url = new URL(window.location.href);
    const roomId = url.searchParams.get('room');

    if (roomId && socket && localUserId && !currentRoom) {
      joinRoom(roomId);
    }
  }, [socket, localUserId, currentRoom, joinRoom]);

  /**
   * Paylaşılabilir link oluştur
   * @returns {string|null}
   */
  const getShareableLink = useCallback(() => {
    if (!currentRoom) return null;
    return `${window.location.origin}?room=${currentRoom}`;
  }, [currentRoom]);

  return {
    currentRoom,
    users,
    error,
    createRoom,
    joinRoom,
    leaveRoom,
    getShareableLink,
    generateRoomId,
  };
}
