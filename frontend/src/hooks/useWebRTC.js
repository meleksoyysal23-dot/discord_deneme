import { useState, useEffect, useRef, useCallback } from 'react';
import { WebRTCService } from '../services/webrtc';

/**
 * useWebRTC Hook
 * WebRTC peer-to-peer ses bağlantısı yönetimi için React hook
 *
 * @param {string} localUserId - Yerel kullanıcının ID'si
 * @param {string} roomId - Oda ID'si
 * @param {import('socket.io-client').Socket} socket - Socket.io instance
 * @returns {object} WebRTC state ve kontrol fonksiyonları
 */
export function useWebRTC(localUserId, roomId, socket) {
  // Peer bilgileri: Map<peerUserId, { stream, volume, isConnected }>
  const [peers, setPeers] = useState(new Map());
  const [localVolume, setLocalVolume] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [mediaError, setMediaError] = useState(null);

  const webrtcRef = useRef(null);
  const audioElementsRef = useRef(new Map()); // peerUserId -> HTMLAudioElement
  const socketRef = useRef(socket);
  const localUserIdRef = useRef(localUserId);
  const roomIdRef = useRef(roomId);
  const isDeafenedRef = useRef(isDeafened);

  // Ref'leri güncel tut
  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  useEffect(() => {
    localUserIdRef.current = localUserId;
  }, [localUserId]);

  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  useEffect(() => {
    isDeafenedRef.current = isDeafened;
  }, [isDeafened]);

  // --------------------------------------------------------
  // Audio element yönetimi (useEffect'ten önce tanımlanmalı)
  // --------------------------------------------------------

  /**
   * Remote peer için audio element'i kaldır
   * @param {string} userId
   */
  const removeAudioElement = useCallback((userId) => {
    const audio = audioElementsRef.current.get(userId);
    if (audio) {
      audio.srcObject = null;
      audio.pause();
      audio.remove();
      audioElementsRef.current.delete(userId);
    }
  }, []);

  /**
   * Remote peer için audio element oluştur ve oynat
   * @param {string} userId
   * @param {MediaStream} stream
   */
  const createAudioElement = useCallback((userId, stream) => {
    // Mevcut varsa kaldır
    removeAudioElement(userId);

    const audio = new Audio();
    audio.srcObject = stream;
    audio.autoplay = true;
    audio.muted = false; // Deafened durumu ayrıca yönetilecek

    // Ses bittiğinde yeniden başlatmayı engelle
    audio.onended = () => {
      console.warn(`Audio stream ended for peer ${userId}`);
    };

    // Hata durumunda logla
    audio.onerror = (e) => {
      console.error(`Audio error for peer ${userId}:`, e);
    };

    // Oynatmayı dene
    const playPromise = audio.play();
    if (playPromise) {
      playPromise.catch((error) => {
        // Autoplay policy hatası olabilir, sessizce yut
        if (error.name !== 'AbortError') {
          console.warn(`Audio play failed for peer ${userId}:`, error.message);
        }
      });
    }

    audioElementsRef.current.set(userId, audio);

    // Deafened durumunu uygula
    if (isDeafenedRef.current) {
      audio.muted = true;
    }
  }, [removeAudioElement]);

  // WebRTC servisini başlat ve socket event listener'ları kur
  useEffect(() => {
    if (!socket || !localUserId || !roomId) return;

    const webrtc = new WebRTCService(localUserId, roomId, socket);
    webrtcRef.current = webrtc;

    // Cleanup'ta kullanmak için audio element referansını local değişkene kopyala
    const audioElements = audioElementsRef.current;

    // --------------------------------------------------------
    // Callback'leri ayarla
    // --------------------------------------------------------

    webrtc.onVolumeUpdate = (userId, volume) => {
      if (userId === localUserIdRef.current) {
        setLocalVolume(volume);
      } else {
        setPeers((prev) => {
          const existing = prev.get(userId);
          if (!existing) return prev;

          const newPeers = new Map(prev);
          newPeers.set(userId, { ...existing, volume });
          return newPeers;
        });
      }
    };

    webrtc.onPeerStream = (userId, stream) => {
      setPeers((prev) => {
        const newPeers = new Map(prev);
        const existing = newPeers.get(userId) || { volume: 0, isConnected: false };
        newPeers.set(userId, { ...existing, stream });
        return newPeers;
      });

      // Remote stream için audio element oluştur
      createAudioElement(userId, stream);
    };

    webrtc.onPeerConnected = (userId) => {
      setPeers((prev) => {
        const newPeers = new Map(prev);
        const existing = newPeers.get(userId) || { volume: 0, stream: null };
        newPeers.set(userId, { ...existing, isConnected: true });
        return newPeers;
      });
    };

    webrtc.onPeerDisconnected = (userId) => {
      // Audio element'i kaldır
      removeAudioElement(userId);

      setPeers((prev) => {
        const newPeers = new Map(prev);
        newPeers.delete(userId);
        return newPeers;
      });
    };

    webrtc.onError = (error, context) => {
      console.error(`WebRTC error [${context}]:`, error.message);
    };

    // --------------------------------------------------------
    // Socket event listener'ları
    // --------------------------------------------------------

    const handleSignalOffer = async ({ from, offer }) => {
      if (!from || !offer) return;
      if (from === localUserIdRef.current) return;

      try {
        await webrtc.createAnswer(from, offer);
      } catch (error) {
        console.error('Failed to create answer:', error);
      }
    };

    const handleSignalAnswer = async ({ from, answer }) => {
      if (!from || !answer) return;
      if (from === localUserIdRef.current) return;

      try {
        await webrtc.setRemoteDescription(from, answer);
      } catch (error) {
        console.error('Failed to set remote description:', error);
      }
    };

    const handleSignalIceCandidate = async ({ from, candidate }) => {
      if (!from || !candidate) return;
      if (from === localUserIdRef.current) return;

      try {
        await webrtc.addIceCandidate(from, candidate);
      } catch (error) {
        // ICE candidate hataları genellikle önemsiz
        console.warn('Failed to add ICE candidate:', error.message);
      }
    };

    // Yeni kullanıcı odaya katıldığında - mevcut kullanıcılar offer gönderir
    const handleUserJoined = async ({ userId }) => {
      if (!userId || userId === localUserIdRef.current) return;

      // Yeni katılan kullanıcıya offer gönder
      try {
        await webrtc.createOffer(userId);
      } catch (error) {
        console.error('Failed to create offer for new user:', error);
      }
    };

    // Kullanıcı ayrıldığında peer connection'ı kapat
    const handleUserLeft = ({ userId }) => {
      if (!userId || userId === localUserIdRef.current) return;

      webrtc.closePeerConnection(userId);
      removeAudioElement(userId);

      setPeers((prev) => {
        const newPeers = new Map(prev);
        newPeers.delete(userId);
        return newPeers;
      });
    };

    // Oda kullanıcı listesi güncellendiğinde - mevcut peer'larla bağlantı kur
    const handleRoomUsers = async ({ users }) => {
      if (!Array.isArray(users)) return;

      for (const user of users) {
        if (user.userId === localUserIdRef.current) continue;
        if (webrtc.peerConnections.has(user.userId)) continue;

        try {
          await webrtc.createOffer(user.userId);
        } catch (error) {
          console.error(`Failed to create offer for ${user.userId}:`, error);
        }
      }
    };

    // Socket event listener'ları register et
    socket.on('signal-offer', handleSignalOffer);
    socket.on('signal-answer', handleSignalAnswer);
    socket.on('signal-ice-candidate', handleSignalIceCandidate);
    socket.on('user-joined', handleUserJoined);
    socket.on('user-left', handleUserLeft);
    socket.on('room-users', handleRoomUsers);

    // Cleanup
    return () => {
      webrtc.destroy();
      webrtcRef.current = null;

      // Tüm audio element'leri kaldır (local kopya üzerinden)
      for (const [userId] of audioElements) {
        removeAudioElement(userId);
      }

      // Socket listener'ları kaldır
      socket.off('signal-offer', handleSignalOffer);
      socket.off('signal-answer', handleSignalAnswer);
      socket.off('signal-ice-candidate', handleSignalIceCandidate);
      socket.off('user-joined', handleUserJoined);
      socket.off('user-left', handleUserLeft);
      socket.off('room-users', handleRoomUsers);

      setPeers(new Map());
      setLocalVolume(0);
      setIsInitialized(false);
      setMediaError(null);
    };
  }, [socket, localUserId, roomId, createAudioElement, removeAudioElement]);

  // --------------------------------------------------------
  // Public API fonksiyonları
  // --------------------------------------------------------

  /**
   * Mikrofon erişimi başlat
   * @returns {Promise<boolean>} Başarılı mı?
   */
  const initializeMedia = useCallback(async () => {
    if (!webrtcRef.current) return false;

    try {
      setMediaError(null);
      await webrtcRef.current.initializeMedia();
      setIsInitialized(true);
      return true;
    } catch (error) {
      console.error('Media initialization failed:', error);
      setMediaError(error.message);
      setIsInitialized(false);
      return false;
    }
  }, []);

  /**
   * Mikrofonu sustur/aç
   */
  const toggleMute = useCallback(() => {
    if (!webrtcRef.current) return;

    const isEnabled = webrtcRef.current.toggleMute();
    setIsMuted(!isEnabled);
  }, []);

  /**
   * Kulaklığı kapat/aç (tüm remote audio'ları mute/unmute)
   */
  const toggleDeafen = useCallback(() => {
    setIsDeafened((prev) => {
      const newDeafened = !prev;

      // Tüm audio element'leri güncelle
      for (const [, audio] of audioElementsRef.current) {
        audio.muted = newDeafened;
      }

      return newDeafened;
    });
  }, []);

  /**
   * Belirli bir peer'ın sesini kapat/aç
   * @param {string} userId
   * @param {boolean} muted
   */
  const setPeerMuted = useCallback((userId, muted) => {
    const audio = audioElementsRef.current.get(userId);
    if (audio) {
      audio.muted = muted;
    }
  }, []);

  /**
   * Belirli bir peer'ın ses seviyesini ayarla
   * @param {string} userId
   * @param {number} volume 0-1 arası
   */
  const setPeerVolume = useCallback((userId, volume) => {
    const audio = audioElementsRef.current.get(userId);
    if (audio) {
      audio.volume = Math.max(0, Math.min(1, volume));
    }
  }, []);

  return {
    // State
    peers,
    localVolume,
    isMuted,
    isDeafened,
    isInitialized,
    mediaError,

    // Actions
    initializeMedia,
    toggleMute,
    toggleDeafen,
    setPeerMuted,
    setPeerVolume,
  };
}
