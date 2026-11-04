import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Room, RoomEvent, Track, LocalVideoTrack, LocalAudioTrack } from 'livekit-client';

/**
 * useLiveKit Hook
 * LiveKit SFU tabanlı sesli sohbet yönetimi
 *
 * @param {string} localUserId - Yerel kullanıcı ID'si
 * @param {string} roomId - Oda ID'si (kanal ID)
 * @param {string} username - Kullanıcı adı
 * @returns {object} LiveKit state ve kontrol fonksiyonları
 */
export function useLiveKit(localUserId, roomId, username) {
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [activeSpeakers, setActiveSpeakers] = useState([]);
  const [localVolume, setLocalVolume] = useState(0);
  const [error, setError] = useState(null);
  
  // Screen sharing and camera state
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);

  // Per-user ve master volume state'leri (eski WebRTC ile uyumluluk)
  const [userVolumes, setUserVolumes] = useState({}); // { userId: volume (0-1) }
  const [masterVolume, setMasterVolume] = useState(1); // Global volume (0-1)

  const roomRef = useRef(null);
  const audioElementsRef = useRef(new Map()); // participantIdentity -> HTMLAudioElement
  const activeSpeakersRef = useRef([]);
  const userVolumesRef = useRef({});
  const masterVolumeRef = useRef(1);
  const isDeafenedRef = useRef(false);
  const screenShareTrackRef = useRef(null);
  const screenShareAudioTrackRef = useRef(null);
  const screenShareStreamRef = useRef(null);
  const stopScreenShareRef = useRef(null);
  
  // BYPASS MODU: Gerçek mikrofon kontrolü için MediaStream referansı
  const localStreamRef = useRef(null);

  // Ref'leri güncel tut (stale closure önleme)
  useEffect(() => {
    userVolumesRef.current = userVolumes;
  }, [userVolumes]);

  useEffect(() => {
    masterVolumeRef.current = masterVolume;
  }, [masterVolume]);

  useEffect(() => {
    isDeafenedRef.current = isDeafened;
  }, [isDeafened]);

  useEffect(() => {
    activeSpeakersRef.current = activeSpeakers;
  }, [activeSpeakers]);

  // Remote participant için audio element kaldır
  const removeAudioElement = useCallback((identity) => {
    const audio = audioElementsRef.current.get(identity);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
      audioElementsRef.current.delete(identity);
    }
  }, []);

  // Remote participant için audio element oluştur
  const createAudioElement = useCallback((identity, track) => {
    // Mevcut varsa kaldır
    removeAudioElement(identity);

    const audio = track.attach();
    audio.autoplay = true;
    audio.muted = false;

    // Kullanıcıya özel volume uygula
    const userVolume = userVolumesRef.current[identity] ?? 1;
    audio.volume = Math.max(0, Math.min(1, userVolume * masterVolumeRef.current));

    // Deafened durumunu uygula
    if (isDeafenedRef.current) {
      audio.muted = true;
    }

    audioElementsRef.current.set(identity, audio);
    console.log('[LiveKit] Audio element created for:', identity);
  }, [removeAudioElement]);

  // Katılımcı listesini güncelle
  const updateParticipants = useCallback((room, localId, uname) => {
    if (!room) return;

    const currentSpeakers = activeSpeakersRef.current;

    const parts = Array.from(room.remoteParticipants.values()).map((p) => ({
      userId: p.identity,
      username: p.identity,
      isSpeaking: currentSpeakers.includes(p.identity),
      isLocal: false,
    }));

    // Local kullanıcıyı ekle
    if (room.localParticipant) {
      parts.unshift({
        userId: localId,
        username: uname || localId,
        isLocal: true,
        isSpeaking: currentSpeakers.includes(room.localParticipant.identity),
      });
    }

    setParticipants(parts);
  }, []);

  // Odaya bağlan
  const connect = useCallback(async () => {
    if (!roomId || !localUserId) return;

    // Zaten bağlıysa tekrar bağlanma
    if (roomRef.current && isConnected) {
      console.log('[LiveKit] Already connected to room:', roomId);
      return;
    }

    try {
      setError(null);

      // BYPASS MODU: LiveKit bağlantısını atla ama gerçek mikrofon erişimi al
      if (import.meta.env.VITE_SKIP_AUTH === 'true') {
        console.warn('[DEV BYPASS] LiveKit bağlantısı atlanıyor, gerçek mikrofon erişimi alınıyor');

        // Sahte isConnected = true set et (UI'ın "Bağlı" göstermesi için)
        setIsConnected(true);

        // Gerçek mikrofon erişimi al
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          localStreamRef.current = stream;
          console.log('[DEV BYPASS] Gerçek mikrofon erişimi alındı');
        } catch (micErr) {
          console.error('[DEV BYPASS] Mikrofon erişimi başarısız:', micErr);
          setError('Mikrofon erişimi başarısız: ' + micErr.message);
        }

        // Sahte participants listesi oluştur (sadece local user)
        setParticipants([{
          userId: localUserId,
          username: username || localUserId,
          isLocal: true,
          isSpeaking: false,
          isMuted: false,
        }]);

        console.warn('[DEV BYPASS] Sahte bağlantı modu aktif (gerçek mikrofon var)');
        return; // LiveKit Room oluşturma, token alma, room.connect() — HİÇBİRİ YAPILMIYOR
      }

      // NORMAL MOD: Backend'den token al
      let token, url;
      const backendUrl =
        import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const tokenUrl = `${backendUrl}/api/voice/token?room=${encodeURIComponent(
        roomId
      )}&participant=${encodeURIComponent(username || localUserId)}`;

      console.log('[LiveKit] Fetching token from:', tokenUrl);

      const res = await fetch(tokenUrl);
      console.log('[LiveKit] Token response status:', res.status);

      if (!res.ok) {
        const errorText = await res.text();
        console.error('[LiveKit] Token fetch failed:', res.status, errorText);
        throw new Error(`Token alınamadı (HTTP ${res.status}): ${errorText}`);
      }

      const data = await res.json();
      token = data.token;
      url = data.url;
      console.log('[LiveKit] Token received:', token ? 'yes' : 'no', 'URL:', url);

      if (!token || !url) {
        throw new Error('Token veya URL eksik');
      }

      // LiveKit Room oluştur
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      roomRef.current = room;

      // Event listener'lar
      room.on(RoomEvent.Connected, () => {
        setIsConnected(true);
        console.log('[LiveKit] Connected to room:', roomId);
        updateParticipants(room, localUserId, username);
      });

      room.on(RoomEvent.Disconnected, (reason) => {
        setIsConnected(false);
        setParticipants([]);
        setActiveSpeakers([]);
        console.log('[LiveKit] Disconnected from room:', roomId, 'reason:', reason);

        // Tüm audio element'leri temizle
        for (const [identity] of audioElementsRef.current) {
          removeAudioElement(identity);
        }
      });

      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (track.kind === 'audio') {
          createAudioElement(participant.identity, track);
          console.log('[LiveKit] Remote audio subscribed:', participant.identity);
        } else if (track.kind === 'video') {
          // Video track subscribe olduğunda participants'ı güncelle (camera streams için)
          updateParticipants(room, localUserId, username);
          console.log('[LiveKit] Remote video subscribed:', participant.identity, track.source);
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        if (track.kind === 'audio') {
          removeAudioElement(participant.identity);
          console.log('[LiveKit] Remote audio unsubscribed:', participant.identity);
        } else if (track.kind === 'video') {
          // Video track unsubscribe olduğunda participants'ı güncelle
          updateParticipants(room, localUserId, username);
          console.log('[LiveKit] Remote video unsubscribed:', participant.identity, track.source);
        }
      });

      room.on(RoomEvent.TrackMuted, () => {
        updateParticipants(room, localUserId, username);
      });

      room.on(RoomEvent.TrackUnmuted, () => {
        updateParticipants(room, localUserId, username);
      });

      room.on(RoomEvent.ParticipantConnected, (participant) => {
        console.log('[LiveKit] Participant connected:', participant.identity);
        updateParticipants(room, localUserId, username);
      });

      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        removeAudioElement(participant.identity);
        console.log('[LiveKit] Participant disconnected:', participant.identity);
        updateParticipants(room, localUserId, username);
      });

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        const speakerIds = speakers.map((s) => s.identity);
        setActiveSpeakers(speakerIds);
        updateParticipants(room, localUserId, username);
      });

      room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        if (!room.canPlaybackAudio) {
          console.warn('[LiveKit] Audio playback blocked, starting audio');
          room.startAudio().catch((err) => {
            console.warn('[LiveKit] startAudio failed:', err);
          });
        }
      });

      // Odaya bağlan
      console.log('[LiveKit] Connecting to:', url);
      console.log('[LiveKit] Token:', token ? 'present (' + token.length + ' chars)' : 'missing');
      await room.connect(url, token);
      console.log('[LiveKit] Connected successfully');

      // Mikrofonu başlat (AEC, NS, AGC varsayılan ayarlarla)
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
        console.log('[LiveKit] Microphone enabled');
      } catch (micErr) {
        console.error('[LiveKit] Microphone enable failed:', micErr);
        setError('Mikrofon erişimi başarısız: ' + micErr.message);
      }

      updateParticipants(room, localUserId, username);
    } catch (err) {
      const errorMsg = err?.message || err?.toString() || 'Unknown error';
      const errorName = err?.name || 'Unknown';
      console.error('[LiveKit] Connection failed:', errorName, '-', errorMsg);
      console.error('[LiveKit] Error details:', err);
      console.error('[LiveKit] Error stack:', err?.stack);
      setError(`Bağlantı hatası: ${errorMsg}`);
      setIsConnected(false);
      roomRef.current = null;
    }
  }, [roomId, localUserId, username, isConnected, createAudioElement, removeAudioElement, updateParticipants]);

  // Odadan ayrıl
  const disconnect = useCallback(async () => {
    // BYPASS MODU: State'leri sıfırla + gerçek mikrofonu kapat
    if (import.meta.env.VITE_SKIP_AUTH === 'true') {
      console.warn('[DEV BYPASS] Sahte bağlantı kesiliyor, gerçek mikrofon kapatılıyor');
      
      // Gerçek mikrofon track'lerini durdur
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          track.stop();
          console.log('[DEV BYPASS] Mikrofon track durduruldu');
        });
        localStreamRef.current = null;
      }
      
      setIsConnected(false);
      setIsMuted(false);
      setIsDeafened(false);
      setParticipants([]);
      setActiveSpeakers([]);
      return;
    }

    // 1. Önce ekran paylaşımı track'lerini durdur
    if (screenShareStreamRef.current) {
      screenShareStreamRef.current.getTracks().forEach(track => track.stop());
      screenShareStreamRef.current = null;
    }

    // 2. Room'u disconnect et
    if (roomRef.current) {
      try {
        await roomRef.current.disconnect();
      } catch (err) {
        console.warn('[LiveKit] Disconnect error:', err);
      }
      roomRef.current = null;
    }

    // 3. Tüm audio element'leri temizle
    for (const [identity] of audioElementsRef.current) {
      removeAudioElement(identity);
    }

    // 4. State'leri sıfırla
    setIsConnected(false);
    setIsScreenSharing(false);
    setIsCameraEnabled(false);
    setParticipants([]);
    setActiveSpeakers([]);
    setLocalVolume(0);
  }, [removeAudioElement]);

  // Mute/Unmute
  const toggleMute = useCallback(async () => {
    const newMuted = !isMuted;

    // BYPASS MODU: Gerçek mikrofonu kontrol et
    if (import.meta.env.VITE_SKIP_AUTH === 'true') {
      if (localStreamRef.current) {
        const audioTrack = localStreamRef.current.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = !newMuted;
          console.log('[DEV BYPASS] Gerçek mikrofon', newMuted ? 'susturuldu' : 'açıldı');
        }
      }
      setIsMuted(newMuted);
      
      // Participants listesini güncelle (local user'ın mute durumu)
      setParticipants(prev => prev.map(p => 
        p.isLocal ? { ...p, isMuted: newMuted } : p
      ));
      
      return;
    }

    if (!roomRef.current) {
      console.warn('[LiveKit] Cannot toggle mute: not in a room');
      return;
    }
    try {
      await roomRef.current.localParticipant.setMicrophoneEnabled(!newMuted);
      setIsMuted(newMuted);
      console.log('[LiveKit] Microphone', newMuted ? 'muted' : 'unmuted');
    } catch (err) {
      console.error('[LiveKit] toggleMute error:', err);
    }
  }, [isMuted]);

  // Deafen/Undeafen (tüm remote sesleri kapat/aç)
  const toggleDeafen = useCallback(() => {
    const newDeafened = !isDeafened;
    setIsDeafened(newDeafened);

    // BYPASS MODU: Sadece state güncelle (bypass modda remote ses yok)
    if (import.meta.env.VITE_SKIP_AUTH === 'true') {
      console.warn('[DEV BYPASS] Deafen', newDeafened ? 'aktif' : 'devre dışı', '(remote ses yok)');
      return;
    }

    // Tüm remote audio element'leri güncelle
    for (const [, audio] of audioElementsRef.current) {
      audio.muted = newDeafened;
    }
  }, [isDeafened]);

  // Belirli bir participant'ın ses seviyesini ayarla
  const setPeerVolume = useCallback((userId, volume) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));

    // State'i güncelle
    setUserVolumes((prev) => ({ ...prev, [userId]: clampedVolume }));

    // Audio element'in ses seviyesini ayarla
    const audio = audioElementsRef.current.get(userId);
    if (audio) {
      audio.volume = clampedVolume * masterVolumeRef.current;
    }
  }, []);

  // Tüm kullanıcıların ses seviyesini ayarla (master volume)
  const setAllVolumes = useCallback((volume) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    setMasterVolume(clampedVolume);

    // Tüm audio element'leri güncelle
    for (const [identity, audio] of audioElementsRef.current) {
      const userVolume = userVolumesRef.current[identity] ?? 1;
      audio.volume = userVolume * clampedVolume;
    }
  }, []);

  // Local audio level tracking (volume meter için)
  // LiveKit ActiveSpeakersChanged event'inden speaking bilgisini alıyoruz;
  // burada local user'ın speaking durumuna göre basit bir volume gösteriyoruz.
  useEffect(() => {
    if (!isConnected) return;

    const interval = setInterval(() => {
      const room = roomRef.current;
      if (!room || !room.localParticipant) return;
      const isSpeaking = activeSpeakersRef.current.includes(
        room.localParticipant.identity
      );
      setLocalVolume(isSpeaking ? 0.5 : 0);
    }, 100);

    return () => {
      clearInterval(interval);
    };
  }, [isConnected]);



  // Mevcut ses cihazlarını listele
  const enumerateDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
      
      return {
        audioInputs: audioInputs.map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Mikrofon ${i + 1}`,
          kind: 'audioinput',
        })),
        audioOutputs: audioOutputs.map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Hoparlör ${i + 1}`,
          kind: 'audiooutput',
        })),
      };
    } catch (error) {
      console.error('enumerateDevices error:', error);
      return { audioInputs: [], audioOutputs: [] };
    }
  }, []);

  // Ses cihazını değiştir
  const switchAudioDevice = useCallback(async (kind, deviceId) => {
    if (!roomRef.current) {
      console.warn('Room not connected');
      return false;
    }

    try {
      await roomRef.current.switchActiveDevice(kind, deviceId);
      console.log(`Switched ${kind} to ${deviceId}`);
      return true;
    } catch (error) {
      console.error(`switchActiveDevice error (${kind}):`, error);
      return false;
    }
  }, []);

  // ============ Ekran Paylaşımı (Screen Share) ============
  
  /**
   * Ekran paylaşımını başlat
   * @param {string} sourceId - Electron desktopCapturer kaynak ID'si
   * @param {boolean} withSystemAudio - Sistem sesi de paylaşılacak mı?
   */
  const startScreenShare = useCallback(async (sourceId, withSystemAudio = false) => {
    // BYPASS MODU: Gerçek LiveKit bağlantısı yok, sahte ekran paylaşımı
    if (import.meta.env.VITE_SKIP_AUTH === 'true') {
      console.warn('[DEV BYPASS] Ekran paylaşımı bypass modda sahte olarak başlatılıyor');
      setIsScreenSharing(true);
      // Sahte stream ref'leri (UI'ın "yayında" göstermesi için)
      screenShareStreamRef.current = new MediaStream();
      return;
    }

    if (!roomRef.current) {
      console.error('[LiveKit] Room not connected');
      throw new Error('Odaya bağlı değilsiniz');
    }

    if (isScreenSharing) {
      console.warn('[LiveKit] Already screen sharing');
      return;
    }

    try {
      console.log('[LiveKit] Starting screen share:', { sourceId, withSystemAudio });

      // Video constraints (Electron desktopCapturer)
      const videoConstraints = {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          minWidth: 1280,
          maxWidth: 1920,
          minHeight: 720,
          maxHeight: 1080,
          maxFrameRate: 30,
        },
      };

      // Audio constraints (sistem sesi - sadece ekran için)
      const audioConstraints = withSystemAudio ? {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
        },
      } : false;

      // MediaStream al
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: audioConstraints,
      });

      screenShareStreamRef.current = stream;

      // Video track oluştur ve publish et
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) {
        throw new Error('Video track alınamadı');
      }

      const localVideoTrack = new LocalVideoTrack(videoTrack, {
        name: 'screen-share',
        source: Track.Source.ScreenShare,
      });

      await roomRef.current.localParticipant.publishTrack(localVideoTrack, {
        name: 'screen-share',
        source: Track.Source.ScreenShare,
        simulcast: true,
        videoEncoding: {
          maxBitrate: 2_500_000, // 2.5 Mbps
          maxFramerate: 30,
        },
      });

      screenShareTrackRef.current = localVideoTrack;
      setIsScreenSharing(true);

      console.log('[LiveKit] Screen share video track published');

      // Sistem sesi varsa audio track'i de publish et
      if (withSystemAudio && stream.getAudioTracks().length > 0) {
        const audioTrack = stream.getAudioTracks()[0];
        const localAudioTrack = new LocalAudioTrack(audioTrack, {
          name: 'screen-share-audio',
          source: Track.Source.ScreenShareAudio,
        });

        await roomRef.current.localParticipant.publishTrack(localAudioTrack, {
          name: 'screen-share-audio',
          source: Track.Source.ScreenShareAudio,
        });

        screenShareAudioTrackRef.current = localAudioTrack;

        console.log('[LiveKit] Screen share audio track published');
      }

      // Track sonlandığında otomatik cleanup (ref üzerinden çağır - circular dependency önleme)
      videoTrack.onended = () => {
        console.log('[LiveKit] Screen share track ended');
        if (stopScreenShareRef.current) {
          stopScreenShareRef.current();
        }
      };

    } catch (error) {
      console.error('[LiveKit] Screen share failed:', error);
      
      // Cleanup on failure
      if (screenShareStreamRef.current) {
        screenShareStreamRef.current.getTracks().forEach(track => track.stop());
        screenShareStreamRef.current = null;
      }
      
      throw error;
    }
  }, [isScreenSharing]);

  /**
   * Ekran paylaşımını durdur
   */
  const stopScreenShare = useCallback(async () => {
    // BYPASS MODU: Sahte ekran paylaşımını durdur
    if (import.meta.env.VITE_SKIP_AUTH === 'true') {
      console.warn('[DEV BYPASS] Ekran paylaşımı bypass modda sahte olarak durduruluyor');
      if (screenShareStreamRef.current) {
        screenShareStreamRef.current.getTracks().forEach(track => track.stop());
        screenShareStreamRef.current = null;
      }
      setIsScreenSharing(false);
      return;
    }

    if (!roomRef.current) {
      console.warn('[LiveKit] Room not connected');
      return;
    }

    try {
      console.log('[LiveKit] Stopping screen share');

      // Video track'i unpublish et
      if (screenShareTrackRef.current) {
        await roomRef.current.localParticipant.unpublishTrack(screenShareTrackRef.current);
        screenShareTrackRef.current.stop();
        screenShareTrackRef.current = null;
      }

      // Audio track'i unpublish et
      if (screenShareAudioTrackRef.current) {
        await roomRef.current.localParticipant.unpublishTrack(screenShareAudioTrackRef.current);
        screenShareAudioTrackRef.current.stop();
        screenShareAudioTrackRef.current = null;
      }

      // Stream'i temizle
      if (screenShareStreamRef.current) {
        screenShareStreamRef.current.getTracks().forEach(track => track.stop());
        screenShareStreamRef.current = null;
      }

      setIsScreenSharing(false);
      console.log('[LiveKit] Screen share stopped');

    } catch (error) {
      console.error('[LiveKit] Stop screen share failed:', error);
    }
  }, []);

  // stopScreenShare ref'ini güncel tut (circular dependency önleme)
  useEffect(() => {
    stopScreenShareRef.current = stopScreenShare;
  }, [stopScreenShare]);

  // ============ Kamera Yayını (Camera) ============

  /**
   * Kamerayı aç
   */
  const startCamera = useCallback(async () => {
    if (!roomRef.current) {
      console.error('[LiveKit] Room not connected');
      throw new Error('Odaya bağlı değilsiniz');
    }

    if (isCameraEnabled) {
      console.warn('[LiveKit] Camera already enabled');
      return;
    }

    try {
      console.log('[LiveKit] Starting camera');

      await roomRef.current.localParticipant.setCameraEnabled(true, {
        simulcast: true,
        videoEncoding: {
          maxBitrate: 1_000_000, // 1 Mbps
          maxFramerate: 15,
        },
      });

      setIsCameraEnabled(true);
      console.log('[LiveKit] Camera enabled');

    } catch (error) {
      console.error('[LiveKit] Start camera failed:', error);
      throw error;
    }
  }, [isCameraEnabled]);

  /**
   * Kamerayı kapat
   */
  const stopCamera = useCallback(async () => {
    if (!roomRef.current) {
      console.warn('[LiveKit] Room not connected');
      return;
    }

    if (!isCameraEnabled) {
      console.warn('[LiveKit] Camera already disabled');
      return;
    }

    try {
      console.log('[LiveKit] Stopping camera');

      await roomRef.current.localParticipant.setCameraEnabled(false);
      setIsCameraEnabled(false);
      console.log('[LiveKit] Camera disabled');

    } catch (error) {
      console.error('[LiveKit] Stop camera failed:', error);
    }
  }, [isCameraEnabled]);

  /**
   * Kamerayı aç/kapat (toggle)
   */
  const toggleCamera = useCallback(async () => {
    if (isCameraEnabled) {
      await stopCamera();
    } else {
      await startCamera();
    }
  }, [isCameraEnabled, startCamera, stopCamera]);

  // Cleanup on unmount - ekran paylaşımını da temizle
  useEffect(() => {
    const room = roomRef.current;
    const audioElements = audioElementsRef.current;
    return () => {
      if (room) {
        room.disconnect();
      }
      // Tüm audio element'leri temizle
      for (const [identity] of audioElements) {
        removeAudioElement(identity);
      }
      // Ekran paylaşımını temizle
      if (screenShareStreamRef.current) {
        screenShareStreamRef.current.getTracks().forEach(track => track.stop());
        screenShareStreamRef.current = null;
      }
    };
  }, [removeAudioElement]);

  // ============ Screen Share Stream & Camera Streams (FAZ 19.6) ============
  
  // Ekran paylaşımı stream'i (ref'ten al, isScreenSharing değiştiğinde güncellenir)
  const screenShareStream = screenShareStreamRef.current;

  // Kamera stream'leri (identity → MediaStream map)
  const cameraStreams = useMemo(() => {
    const streams = {};
    if (!roomRef.current) return streams;

    // Local camera stream
    const localPub = roomRef.current.localParticipant.getTrackPublication(Track.Source.Camera);
    if (localPub?.track?.mediaStream) {
      streams[localUserId] = localPub.track.mediaStream;
    }

    // Remote camera streams
    roomRef.current.remoteParticipants.forEach((participant) => {
      const pub = participant.getTrackPublication(Track.Source.Camera);
      if (pub?.track?.mediaStream) {
        streams[participant.identity] = pub.track.mediaStream;
      }
    });

    return streams;
  }, [localUserId, participants, isCameraEnabled]);

  return {
    // State
    isConnected,
    isMuted,
    isDeafened,
    participants,
    activeSpeakers,
    localVolume,
    error,
    userVolumes,
    masterVolume,
    isScreenSharing,
    isCameraEnabled,

    // Screen share & camera streams (FAZ 19.6)
    screenShareStream,
    cameraStreams,

    // Actions
    connect,
    disconnect,
    toggleMute,
    toggleDeafen,
    setPeerVolume,
    setAllVolumes,
    enumerateDevices,
    switchAudioDevice,
    
    // Screen sharing
    startScreenShare,
    stopScreenShare,
    
    // Camera
    startCamera,
    stopCamera,
    toggleCamera,
  };
}
