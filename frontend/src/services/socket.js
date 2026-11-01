/**
 * Socket.io Client Service
 * Singleton pattern ile Socket.io bağlantısını yönetir
 */

import { io } from 'socket.io-client';

let socket = null;

/**
 * Mevcut socket instance'ını döndür
 * @returns {import('socket.io-client').Socket|null}
 */
export function getSocket() {
  return socket;
}

/**
 * Socket.io bağlantısı oluştur
 * Zaten bağlıysa mevcut instance'ı döndür
 * @returns {import('socket.io-client').Socket}
 */
export function connectSocket() {
  if (socket && socket.connected) {
    return socket;
  }

  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

  socket = io(backendUrl, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
    autoConnect: true,
  });

  socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
  });

  return socket;
}

/**
 * Socket bağlantısını kapat
 */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
