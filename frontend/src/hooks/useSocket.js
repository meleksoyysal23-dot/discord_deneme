/**
 * useSocket Hook
 * Socket.io bağlantısını yöneten React hook
 */

import { useState, useEffect, useRef } from 'react';
import { connectSocket, disconnectSocket } from '../services/socket';

/**
 * Socket bağlantısı kur ve durumu takip et
 * @returns {{ socket: import('socket.io-client').Socket|null, isConnected: boolean, connectionError: string|null }}
 */
export function useSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = connectSocket();
    socketRef.current = socket;

    const handleConnect = () => {
      setIsConnected(true);
      setConnectionError(null);
    };

    const handleDisconnect = (reason) => {
      setIsConnected(false);
      if (reason === 'io server disconnect') {
        // Server tarafından kapatıldı, reconnect dene
        socket.connect();
      }
    };

    const handleError = (error) => {
      setConnectionError(error.message);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleError);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleError);
      disconnectSocket();
    };
  }, []);

  return {
    socket: socketRef.current,
    isConnected,
    connectionError,
  };
}
