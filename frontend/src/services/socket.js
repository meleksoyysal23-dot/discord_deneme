import { io } from 'socket.io-client';

// Backend URL — Environment variable veya fallback
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://discord-deneme-klyz.onrender.com';

// Singleton socket instance
let socket = null;

// Socket bağlantı ayarları
const SOCKET_CONFIG = {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 10, // 5'ten 10'a artırıldı
  timeout: 20000, // Bağlantı timeout süresi (ms)
  forceNew: true,
};

/**
 * Socket bağlantısı oluştur
 */
export function connectSocket(token = null) {
  if (socket && socket.connected) {
    return socket;
  }

  socket = io(BACKEND_URL, {
    ...SOCKET_CONFIG,
    auth: token ? { token } : {},
  });

  // Event listener'lar
  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket.id);
  });

  socket.on('disconnect', (reason) => {
    socket = null;
    console.log('[Socket] Disconnected:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('[Socket] Connection error:', error.message, error.type);
  });

  return socket;
}

/**
 * Socket bağlantısını yok et
 */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket() {
  return socket;
}

export default {
  connectSocket,
  disconnectSocket,
  getSocket,
};
