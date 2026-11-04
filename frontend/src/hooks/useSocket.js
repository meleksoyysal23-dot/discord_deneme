import { useState, useEffect } from 'react';
import { connectSocket, disconnectSocket } from '../services/socket';

/**
 * Socket.IO bağlantısını yöneten React hook
 */
export function useSocket(user = null) {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!user) return;

    // Token'ı localStorage'dan oku (user objesinde token field'ı yok!)
    const token = localStorage.getItem('voicecan-token');
    if (!token) {
      console.error('[useSocket] No token found in localStorage');
      return;
    }

    // Socket bağlantısı oluştur
    const s = connectSocket(token);
    setSocket(s);

    // Connection events
    s.on('connect', () => {
      setIsConnected(true);
      console.log('[useSocket] Connected:', s.id);
    });

    s.on('disconnect', (reason) => {
      setIsConnected(false);
      console.log('[useSocket] Disconnected:', reason);
    });

    s.on('connect_error', (error) => {
      console.error('[useSocket] Connection error:', error.message);
      setError(error.message);
    });

    return () => {
      disconnectSocket();
    };
  }, [user]);

  return { socket, isConnected, error };
}

/**
 * Socket bağlantı durumunu kontrol et
 */
export function useSocketStatus() {
  const [status, setStatus] = useState('disconnected');
  const socket = null; // Bu fonksiyon kullanılmıyor

  useEffect(() => {
    if (!socket) {
      setStatus('disconnected');
      return;
    }

    const checkStatus = () => {
      setStatus(socket.connected ? 'connected' : 'connecting');
    };

    checkStatus();
    const interval = setInterval(checkStatus, 1000);
    return () => clearInterval(interval);
  }, [socket]);

  return { status };
}