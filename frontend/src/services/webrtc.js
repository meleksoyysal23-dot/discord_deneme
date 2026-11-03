// ⚠️ DEPRECATED: FAZ 15'te LiveKit'e geçildi. Bu dosya geriye dönük uyumluluk için saklanıyor.
// Yeni kod: src/hooks/useLiveKit.js
// Bu servis artık kullanılmıyor.

/**
 * WebRTC Service
 * Peer-to-peer sesli iletişim için WebRTC bağlantı yönetimi
 * Mesh topolojisi: Her kullanıcı diğer her kullanıcıyla ayrı RTCPeerConnection kurar
 * Opus codec: 48kHz, mono, yüksek kalite düşük latency
 */

// Backend URL - environment variable'dan al
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// Fallback ICE servers - backend erişilemezse kullanılır.
// Yalnızca public STUN sunucuları içerir; TURN credential'ları bundle'da
// bulunmaz, backend /api/config üzerinden sağlanır.
const FALLBACK_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
];

/**
 * Backend'den ICE servers konfigürasyonunu çek
 * Başarısız olursa fallback STUN sunucularını döndür
 * @returns {Promise<Array>} ICE servers array
 */
async function getIceServers() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/config`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const config = await response.json();
    
    if (config.iceServers && Array.isArray(config.iceServers)) {
      // Credential loglamadan, yalnızca geliştirme sırasında host bilgisi.
      if (import.meta.env.DEV) {
        const hosts = new Set();
        for (const s of config.iceServers) {
          const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
          for (const u of urls) {
            if (typeof u !== 'string') continue;
            const noScheme = u.replace(/^(stun|stuns|turn|turns):/i, '');
            const hostPart = noScheme.split('?')[0].split('/')[0];
            const host = hostPart.includes('@')
              ? hostPart.split('@').pop()
              : hostPart;
            hosts.add(host.replace(/:\d+$/, '') || 'unknown');
          }
        }
        console.log(
          `[WebRTC] ICE servers fetched from backend: ${config.iceServers.length} server(s)`,
          [...hosts]
        );
      }
      return config.iceServers;
    }
    
    console.warn('Backend response missing iceServers, using fallback');
    return FALLBACK_ICE_SERVERS;
  } catch (error) {
    console.warn('Failed to fetch ICE servers from backend, using fallback:', error.message);
    return FALLBACK_ICE_SERVERS;
  }
}

// Ses yakalama konfigürasyonu - Opus codec için optimize
const AUDIO_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  sampleRate: 48000,
  channelCount: 1,
  echoCancellationType: 'system',
};

// Analayser FFT boyutu
const ANALYSER_FFT_SIZE = 256;

// Minimum ses eşiği (0-1 arası) - gürültü filtresi
const VOLUME_NOISE_FLOOR = 0.01;

export class WebRTCService {
  /**
   * @param {string} localUserId - Yerel kullanıcının ID'si
   * @param {string} roomId - Oda ID'si
   * @param {import('socket.io-client').Socket} socket - Socket.io instance
   */
  constructor(localUserId, roomId, socket) {
    if (!localUserId) throw new Error('WebRTCService: localUserId is required');
    if (!roomId) throw new Error('WebRTCService: roomId is required');
    if (!socket) throw new Error('WebRTCService: socket is required');

    this.localUserId = localUserId;
    this.roomId = roomId;
    this.socket = socket;

    // Media streams
    this.localStream = null;

    // Peer connections: Map<peerUserId, RTCPeerConnection>
    this.peerConnections = new Map();

    // Remote streams: Map<peerUserId, MediaStream>
    this.remoteStreams = new Map();

    // Audio analysis
    this.audioContext = null;
    this.localAnalyser = null;
    this.localAnalyserSource = null;
    this.remoteAnalysers = new Map(); // peerUserId -> { analyser, source, animFrameId }

    // Volume monitoring
    this._volumeMonitorId = null;
    this._isDestroyed = false;

    // Callbacks
    this.onVolumeUpdate = null;     // (userId, volume) => void
    this.onPeerStream = null;       // (userId, stream) => void
    this.onPeerConnected = null;    // (userId) => void
    this.onPeerDisconnected = null; // (userId) => void
    this.onError = null;            // (error, context) => void

    // State
    this._isInitialized = false;
    
    // ICE servers - lazy initialization
    this._iceServersPromise = null;

    // Remote description set edilmeden gelen ICE candidate'lar burada bekletilir
    // Map<peerUserId, RTCIceCandidateInit[]>
    this._pendingCandidates = new Map();

    // Aynı anda offer üretmeyi engellemek için (glare / çift offer koruması)
    this._makingOffer = new Set();

    // Karşı taraftan offer alınan peer'lar (fallback initiator kontrolü için)
    this._remoteOfferReceived = new Set();

    // Eşzamanlı initializeMedia çağrılarını birleştirmek için
    this._initializingPromise = null;
  }

  /**
   * ICE servers'ı al (cached)
   * @returns {Promise<Array>} ICE servers array
   * @private
   */
  async _getIceServers() {
    if (!this._iceServersPromise) {
      this._iceServersPromise = getIceServers();
    }
    return this._iceServersPromise;
  }

  /**
   * Mikrofon erişimi al ve local stream'i başlat
   * @returns {Promise<MediaStream>}
   */
  async initializeMedia() {
    if (this._isDestroyed) {
      throw new Error('WebRTCService: service has been destroyed');
    }

    if (this._isInitialized && this.localStream) {
      return this.localStream;
    }

    // Eşzamanlı çağrıları birleştir.
    // App.jsx effect'i ve createPeerConnection aynı anda çağırabiliyor;
    // iki ayrı getUserMedia çağrısı iki AudioContext ve çakışan track'ler üretiyordu.
    if (this._initializingPromise) {
      console.log('[WebRTC] initializeMedia already in progress, reusing existing promise');
      return this._initializingPromise;
    }

    this._initializingPromise = this._initializeMediaInternal();

    try {
      return await this._initializingPromise;
    } finally {
      this._initializingPromise = null;
    }
  }

  /**
   * initializeMedia'nın gerçek işi (eşzamanlılık koruması olmadan)
   * @returns {Promise<MediaStream>}
   * @private
   */
  async _initializeMediaInternal() {
    if (this._isDestroyed) {
      throw new Error('WebRTCService: service has been destroyed');
    }

    if (this._isInitialized && this.localStream) {
      return this.localStream;
    }

    // Tarayıcı desteği kontrolü
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const error = new Error('Tarayıcınız mikrofon erişimini desteklemiyor');
      this._reportError(error, 'initializeMedia');
      throw error;
    }

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: AUDIO_CONSTRAINTS,
        video: false,
      });

      // AudioContext oluştur (tek instance, tüm analizler için)
      this._createAudioContext();

      // Local ses seviyesi algılayıcıyı kur
      this._setupLocalAnalyser();

      this._isInitialized = true;
      return this.localStream;
    } catch (error) {
      let userMessage;
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        userMessage = 'Mikrofon izni reddedildi. Lütfen tarayıcı ayarlarından mikrofon iznini verin.';
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        userMessage = 'Mikrofon bulunamadı. Lütfen bir mikrofon bağlayın.';
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        userMessage = 'Mikrofona erişilemiyor. Başka bir uygulama kullanıyor olabilir.';
      } else if (error.name === 'OverconstrainedError') {
        userMessage = 'Mikrofon istenen ayarları desteklemiyor.';
        // Daha basit constraints ile tekrar dene
        return this._initializeMediaFallback();
      } else {
        userMessage = `Mikrofon erişimi başarısız: ${error.message}`;
      }

      const wrappedError = new Error(userMessage);
      wrappedError.originalError = error;
      this._reportError(wrappedError, 'initializeMedia');
      throw wrappedError;
    }
  }

  /**
   * Fallback mikrofon erişimi - daha basit constraints ile
   * @returns {Promise<MediaStream>}
   * @private
   */
  async _initializeMediaFallback() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      this._createAudioContext();
      this._setupLocalAnalyser();
      this._isInitialized = true;
      return this.localStream;
    } catch (error) {
      this._reportError(error, 'initializeMediaFallback');
      throw error;
    }
  }

  /**
   * Tek bir AudioContext oluştur (tüm analizler için paylaşılır)
   * @private
   */
  _createAudioContext() {
    if (this.audioContext) return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error('Tarayıcınız AudioContext API\'sini desteklemiyor');
    }

    this.audioContext = new AudioContextClass({
      sampleRate: 48000,
    });
  }

  /**
   * Local stream için ses seviyesi algılayıcı kur
   * @private
   */
  _setupLocalAnalyser() {
    if (!this.localStream || !this.audioContext) return;

    // AudioContext'i resume et (autoplay policy)
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch((resumeErr) => {
        console.warn('AudioContext resume failed:', resumeErr);
      });
    }

    this.localAnalyser = this.audioContext.createAnalyser();
    this.localAnalyser.fftSize = ANALYSER_FFT_SIZE;
    this.localAnalyser.smoothingTimeConstant = 0.3;
    this.localAnalyser.minDecibels = -90;
    this.localAnalyser.maxDecibels = -10;

    this.localAnalyserSource = this.audioContext.createMediaStreamSource(this.localStream);
    this.localAnalyserSource.connect(this.localAnalyser);

    // Ses seviyesi izlemeyi başlat
    this._startVolumeMonitoring();
  }

  /**
   * Remote peer için ses seviyesi algılayıcı kur
   * @param {string} peerUserId
   * @param {MediaStream} remoteStream
   * @private
   */
  _setupRemoteAnalyser(peerUserId, remoteStream) {
    if (!this.audioContext || !remoteStream) return;

    // AudioContext'i resume et
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch((resumeErr) => {
        console.warn('AudioContext resume failed:', resumeErr);
      });
    }

    // Mevcut varsa temizle
    this._cleanupRemoteAnalyser(peerUserId);

    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = ANALYSER_FFT_SIZE;
    analyser.smoothingTimeConstant = 0.3;
    analyser.minDecibels = -90;
    analyser.maxDecibels = -10;

    const source = this.audioContext.createMediaStreamSource(remoteStream);
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const checkVolume = () => {
      if (this._isDestroyed) return;
      if (!this.remoteAnalysers.has(peerUserId)) return;

      analyser.getByteFrequencyData(dataArray);
      const volume = this._calculateVolume(dataArray);

      if (this.onVolumeUpdate) {
        this.onVolumeUpdate(peerUserId, volume);
      }

      const entry = this.remoteAnalysers.get(peerUserId);
      if (entry) {
        entry.animFrameId = requestAnimationFrame(checkVolume);
      }
    };

    const animFrameId = requestAnimationFrame(checkVolume);

    this.remoteAnalysers.set(peerUserId, {
      analyser,
      source,
      animFrameId,
    });
  }

  /**
   * Remote peer için ses algılayıcıyı temizle
   * @param {string} peerUserId
   * @private
   */
  _cleanupRemoteAnalyser(peerUserId) {
    const entry = this.remoteAnalysers.get(peerUserId);
    if (!entry) return;

    if (entry.animFrameId) {
      cancelAnimationFrame(entry.animFrameId);
    }

    try {
      entry.source.disconnect();
      entry.analyser.disconnect();
    } catch {
      // Sessizce yut - cleanup sırasında hata olabilir
    }

    this.remoteAnalysers.delete(peerUserId);
  }

  /**
   * Local ses seviyesi izlemeyi başlat
   * @private
   */
  _startVolumeMonitoring() {
    if (this._volumeMonitorId) return;
    if (!this.localAnalyser) return;

    const dataArray = new Uint8Array(this.localAnalyser.frequencyBinCount);

    const checkVolume = () => {
      if (this._isDestroyed) return;
      if (!this.localAnalyser) return;

      this.localAnalyser.getByteFrequencyData(dataArray);
      const volume = this._calculateVolume(dataArray);

      if (this.onVolumeUpdate) {
        this.onVolumeUpdate(this.localUserId, volume);
      }

      this._volumeMonitorId = requestAnimationFrame(checkVolume);
    };

    this._volumeMonitorId = requestAnimationFrame(checkVolume);
  }

  /**
   * Frequency data'dan ses seviyesi hesapla (0-1 arası normalize)
   * @param {Uint8Array} dataArray
   * @returns {number} 0-1 arası ses seviyesi
   * @private
   */
  _calculateVolume(dataArray) {
    if (!dataArray || dataArray.length === 0) return 0;

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }

    const average = sum / dataArray.length / 255;

    // Gürültü eşiğinin altındaysa 0 döndür
    if (average < VOLUME_NOISE_FLOOR) return 0;

    // 0-1 arası clamp
    return Math.min(1, Math.max(0, average));
  }

  /**
   * Yeni bir peer için RTCPeerConnection oluştur
   * @param {string} peerUserId
   * @returns {Promise<RTCPeerConnection>}
   */
  async createPeerConnection(peerUserId) {
    if (this._isDestroyed) {
      throw new Error('WebRTCService: service has been destroyed');
    }

    if (!peerUserId) {
      throw new Error('WebRTCService: peerUserId is required');
    }

    console.log(`[WebRTC] Creating peer connection for ${peerUserId}`);

    // Zaten varsa kapat ve yeniden oluştur
    if (this.peerConnections.has(peerUserId)) {
      console.log(`[WebRTC] Closing existing peer connection for ${peerUserId}`);
      this.closePeerConnection(peerUserId);
    }

    // KRİTİK FIX: Media başlatılmamışsa önce başlat.
    // Bu, offer/answer gönderilmeden önce local audio track'lerin mevcut olmasını garanti eder.
    // Önceki bug: user-joined/room-users event'leri initializeMedia() bitmeden offer tetikliyordu,
    // bu yüzden offer recvonly oluyordu ve karşı taraf bizi duyamıyordu.
    if (!this.localStream) {
      console.log(`[WebRTC] Media not initialized yet, initializing before peer connection for ${peerUserId}`);
      try {
        await this.initializeMedia();
      } catch (error) {
        console.error(`[WebRTC] Failed to initialize media before peer ${peerUserId}:`, error.message);
        throw error;
      }
    }

    // Dinamik ICE servers al
    const iceServers = await this._getIceServers();
    const rtcConfiguration = {
      iceServers: iceServers,
      iceCandidatePoolSize: 10,
    };

    const peerConnection = new RTCPeerConnection(rtcConfiguration);

    // Local stream track'lerini ekle
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, this.localStream);
      });
    }

    // ICE candidate handler
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('signal-ice-candidate', {
          targetUserId: peerUserId,
          candidate: event.candidate,
        });
      }
    };

    // ICE candidate hata handler
    peerConnection.onicecandidateerror = (event) => {
      console.warn(`ICE candidate error for peer ${peerUserId}:`, event.errorText);
    };

    // Remote stream handler
    peerConnection.ontrack = (event) => {
      // Daha güvenli stream handling - bazı tarayıcılarda streams[0] undefined olabilir
      let remoteStream = event.streams && event.streams[0];
      
      // Eğer stream yoksa ama track varsa, yeni bir MediaStream oluştur
      if (!remoteStream && event.track) {
        remoteStream = new MediaStream();
        remoteStream.addTrack(event.track);
      }
      
      if (!remoteStream) {
        console.warn(`ontrack: no stream or track for peer ${peerUserId}`);
        return;
      }

      // Mevcut stream varsa üzerine ekle, yoksa yeni oluştur
      const existingStream = this.remoteStreams.get(peerUserId);
      if (existingStream && event.track) {
        // Mevcut stream'e yeni track ekle (audio + video olabilir)
        if (!existingStream.getTracks().some(t => t.id === event.track.id)) {
          existingStream.addTrack(event.track);
        }
      } else {
        this.remoteStreams.set(peerUserId, remoteStream);
      }

      const finalStream = this.remoteStreams.get(peerUserId);

      if (this.onPeerStream) {
        this.onPeerStream(peerUserId, finalStream);
      }

      // Remote peer için ses seviyesi algılama kur
      this._setupRemoteAnalyser(peerUserId, finalStream);
    };

    // Connection state change handler
    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;

      switch (state) {
        case 'connected':
          if (this.onPeerConnected) {
            this.onPeerConnected(peerUserId);
          }
          break;

        case 'disconnected':
          // Geçici olabilir, biraz bekle
          break;

        case 'failed':
          console.warn(`Peer connection failed for ${peerUserId}`);
          if (this.onPeerDisconnected) {
            this.onPeerDisconnected(peerUserId);
          }
          this.closePeerConnection(peerUserId);
          break;

        case 'closed':
          if (this.onPeerDisconnected) {
            this.onPeerDisconnected(peerUserId);
          }
          break;
      }
    };

    // ICE connection state change - auto-restart mekanizması
    peerConnection.oniceconnectionstatechange = () => {
      const iceState = peerConnection.iceConnectionState;
      console.log(`ICE connection state for ${peerUserId}:`, iceState);

      if (iceState === 'failed' || iceState === 'disconnected') {
        console.warn(`ICE connection ${iceState} for ${peerUserId}, attempting restart...`);
        // 1 saniye bekle, sonra ICE restart dene
        setTimeout(() => {
          if (this.peerConnections.has(peerUserId)) {
            this.restartIce(peerUserId);
          }
        }, 1000);
      }
    };

    // Connection state monitoring
    peerConnection.addEventListener('connectionstatechange', () => {
      const connState = peerConnection.connectionState;
      console.log(`Connection state for ${peerUserId}:`, connState);

      if (connState === 'failed') {
        console.error(`Connection failed for ${peerUserId}, removing peer...`);
        if (this.onPeerDisconnected) {
          this.onPeerDisconnected(peerUserId);
        }
        this.closePeerConnection(peerUserId);
      }
    });

    // Negotiation needed (renegotiation için)
    peerConnection.onnegotiationneeded = async () => {
      // KRİTİK FIX: Sadece deterministik initiator offer üretir.
      // Önceki bug: her iki taraf da addTrack sonrası negotiationneeded tetikleyip
      // offer gönderiyordu -> glare -> setRemoteDescription hataları -> ses akmıyordu.
      if (!this._isInitiator(peerUserId)) {
        console.log(`[WebRTC] onnegotiationneeded ignored for ${peerUserId} (we are not initiator)`);
        return;
      }

      if (this._makingOffer.has(peerUserId)) {
        console.log(`[WebRTC] onnegotiationneeded ignored for ${peerUserId} (offer already in progress)`);
        return;
      }

      try {
        // Mevcut offer/answer işlemi bitene kadar bekle
        if (peerConnection.signalingState !== 'stable') {
          return;
        }

        this._makingOffer.add(peerUserId);

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        // Tüm ICE candidate'lar toplanana kadar bekle (Full ICE)
        await this._waitForIceGathering(peerConnection, 5000);

        if (peerConnection.signalingState !== 'have-local-offer') {
          console.log(`[WebRTC] negotiationneeded offer aborted for ${peerUserId} (state=${peerConnection.signalingState})`);
          return;
        }

        this.socket.emit('signal-offer', {
          targetUserId: peerUserId,
          offer: peerConnection.localDescription,
        });
      } catch (error) {
        console.error(`[WebRTC] Negotiation error for peer ${peerUserId}:`, error);
        this._reportError(error, 'onnegotiationneeded');
      } finally {
        this._makingOffer.delete(peerUserId);
      }
    };

    this.peerConnections.set(peerUserId, peerConnection);
    return peerConnection;
  }

  /**
   * ICE gathering'ın tamamlanmasını bekle (Full ICE için)
   * @param {RTCPeerConnection} peerConnection
   * @param {number} timeout - Maksimum bekleme süresi (ms)
   * @returns {Promise<void>}
   * @private
   */
  _waitForIceGathering(peerConnection, timeout = 5000) {
    return new Promise((resolve) => {
      // Zaten tamamlanmışsa hemen dön
      if (peerConnection.iceGatheringState === 'complete') {
        resolve();
        return;
      }

      let resolved = false;
      const done = () => {
        if (resolved) return;
        resolved = true;
        peerConnection.removeEventListener('icegatheringstatechange', checkState);
        resolve();
      };

      const checkState = () => {
        if (peerConnection.iceGatheringState === 'complete') {
          done();
        }
      };

      peerConnection.addEventListener('icegatheringstatechange', checkState);

      // Timeout ile güvenli fallback - 5 saniye sonra devam et
      setTimeout(done, timeout);
    });
  }

  /**
   * Offer oluştur ve gönder (caller tarafı)
   * Full ICE gathering: Tüm ICE candidate'lar toplanana kadar bekler
   * @param {string} peerUserId
   * @returns {Promise<RTCSessionDescriptionInit>}
   */
  async createOffer(peerUserId) {
    if (this._isDestroyed) return null;

    // Aynı anda birden fazla offer üretimini engelle (glare koruması)
    if (this._makingOffer.has(peerUserId)) {
      console.log(`[WebRTC] Already making offer for ${peerUserId}, skipping duplicate`);
      return null;
    }
    this._makingOffer.add(peerUserId);

    try {
      console.log(`[WebRTC] Creating offer for peer ${peerUserId}`);
      const peerConnection = await this.createPeerConnection(peerUserId);

      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });

      // Glare sırasında rollback olmuş olabilir - offer'ı yalnızca stable state'te uygula
      if (peerConnection.signalingState !== 'stable') {
        console.log(`[WebRTC] Aborting offer for ${peerUserId}, signalingState=${peerConnection.signalingState}`);
        return null;
      }

      await peerConnection.setLocalDescription(offer);
      console.log(`[WebRTC] Local description set (offer) for ${peerUserId}, waiting for ICE gathering`);

      // Tüm ICE candidate'lar toplanana kadar bekle (Full ICE)
      await this._waitForIceGathering(peerConnection, 5000);

      // Bu arada bir answer/rollback uygulanmışsa offer'ı gönderme
      if (peerConnection.signalingState !== 'have-local-offer') {
        console.log(`[WebRTC] Offer for ${peerUserId} superseded (state=${peerConnection.signalingState}), not sending`);
        return null;
      }

      // localDescription artık tüm ICE candidate'ları içeriyor
      console.log(`[WebRTC] Sending offer to ${peerUserId} (${peerConnection.localDescription.sdp.length} bytes)`);
      this.socket.emit('signal-offer', {
        targetUserId: peerUserId,
        offer: peerConnection.localDescription,
      });

      return peerConnection.localDescription;
    } catch (error) {
      console.error(`[WebRTC] Create offer failed for peer ${peerUserId}:`, error);
      this._reportError(error, 'createOffer');
      throw error;
    } finally {
      this._makingOffer.delete(peerUserId);
    }
  }

  /**
   * ICE restart mekanizması - bağlantı koptuğunda otomatik yeniden bağlanma
   * Full ICE gathering: Tüm ICE candidate'lar toplanana kadar bekler
   * @param {string} peerUserId
   */
  async restartIce(peerUserId) {
    const peerConnection = this.peerConnections.get(peerUserId);
    if (!peerConnection) {
      console.warn(`restartIce: no peer connection for ${peerUserId}`);
      return;
    }

    try {
      console.log(`Restarting ICE for peer: ${peerUserId}`);

      // ICE restart ile yeni offer oluştur
      const offer = await peerConnection.createOffer({ iceRestart: true });
      await peerConnection.setLocalDescription(offer);

      // Tüm ICE candidate'lar toplanana kadar bekle (Full ICE)
      await this._waitForIceGathering(peerConnection, 5000);

      // Offer'ı signaling server'a gönder (tüm ICE candidate'lar dahil)
      this.socket.emit('signal-offer', {
        targetUserId: peerUserId,
        offer: peerConnection.localDescription,
        roomId: this.roomId,
      });

      console.log(`ICE restart initiated for peer: ${peerUserId}`);
    } catch (error) {
      console.error(`ICE restart failed for peer ${peerUserId}:`, error);
      this._reportError(error, 'restartIce');
    }
  }

  /**
   * Answer oluştur ve gönder (callee tarafı)
   * Full ICE gathering: Tüm ICE candidate'lar toplanana kadar bekler
   * @param {string} peerUserId
   * @param {RTCSessionDescriptionInit} offer
   * @returns {Promise<RTCSessionDescriptionInit>}
   */
  async createAnswer(peerUserId, offer) {
    if (this._isDestroyed) return null;

    // Karşı taraftan offer alındığını işaretle
    this._remoteOfferReceived.add(peerUserId);

    try {
      let peerConnection = this.peerConnections.get(peerUserId);

      if (!peerConnection) {
        peerConnection = await this.createPeerConnection(peerUserId);
      }

      // --------------------------------------------------------
      // GLARE (çift offer) handling
      // İki taraf aynı anda offer gönderdiyse:
      //  - polite peer (userId büyük): kendi offer'ını rollback eder, gelen offer'ı kabul eder
      //  - impolite peer (userId küçük): gelen offer'ı yok sayar, kendi offer'ı kazanır
      // Bu, önceki sürümdeki "her iki taraf da offer gönderir" yarışını çözer.
      // --------------------------------------------------------
      const offerCollision =
        peerConnection.signalingState !== 'stable' ||
        this._makingOffer.has(peerUserId);

      if (offerCollision) {
        if (!this._isPolite(peerUserId)) {
          console.log(`[WebRTC] Glare for ${peerUserId}: impolite peer ignores incoming offer (state=${peerConnection.signalingState})`);
          return null;
        }

        console.log(`[WebRTC] Glare for ${peerUserId}: polite peer rolls back local offer`);
        try {
          await peerConnection.setLocalDescription({ type: 'rollback' });
        } catch (rollbackError) {
          console.warn(`[WebRTC] Rollback failed for ${peerUserId}:`, rollbackError.message);
        }
      }

      // Remote description'ı ayarla (offer)
      console.log(`[WebRTC] Setting remote description (offer) for ${peerUserId}`);
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

      // Remote description hazır -> bekleyen ICE candidate'ları flush et
      await this._flushPendingCandidates(peerUserId, peerConnection);

      // Answer oluştur
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      // Tüm ICE candidate'lar toplanana kadar bekle (Full ICE)
      await this._waitForIceGathering(peerConnection, 5000);

      console.log(`[WebRTC] Sending answer to ${peerUserId} (${peerConnection.localDescription.sdp.length} bytes)`);
      // Answer'ı signaling server'a gönder (tüm ICE candidate'lar dahil)
      this.socket.emit('signal-answer', {
        targetUserId: peerUserId,
        answer: peerConnection.localDescription,
      });

      return peerConnection.localDescription;
    } catch (error) {
      console.error(`[WebRTC] Create answer failed for peer ${peerUserId}:`, error);
      this._reportError(error, 'createAnswer');
      throw error;
    }
  }

  /**
   * Remote answer'ı peer connection'a ekle
   * @param {string} peerUserId
   * @param {RTCSessionDescriptionInit} answer
   */
  async setRemoteDescription(peerUserId, answer) {
    if (this._isDestroyed) return;

    const peerConnection = this.peerConnections.get(peerUserId);
    if (!peerConnection) {
      console.warn(`[WebRTC] setRemoteDescription: no peer connection for ${peerUserId}`);
      return;
    }

    try {
      console.log(`[WebRTC] Setting remote description (answer) for ${peerUserId}`);
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      
      // Remote description set edildikten sonra bekleyen ICE candidate'ları flush et
      await this._flushPendingCandidates(peerUserId, peerConnection);
    } catch (error) {
      console.error(`[WebRTC] setRemoteDescription failed for peer ${peerUserId}:`, error);
      this._reportError(error, 'setRemoteDescription');
    }
  }

  /**
   * ICE candidate ekle
   * Remote description henüz set edilmemişse candidate'ı queue'la.
   * Bu, trickle ICE race condition'ını önler.
   * @param {string} peerUserId
   * @param {RTCIceCandidateInit} candidate
   */
  async addIceCandidate(peerUserId, candidate) {
    if (this._isDestroyed) return;

    const peerConnection = this.peerConnections.get(peerUserId);
    if (!peerConnection) {
      // PC yoksa candidate'ı queue'la, PC oluşturulduğunda flush edilir
      console.log(`[WebRTC] No PC for ${peerUserId}, queueing ICE candidate`);
      if (!this._pendingCandidates.has(peerUserId)) {
        this._pendingCandidates.set(peerUserId, []);
      }
      this._pendingCandidates.get(peerUserId).push(candidate);
      return;
    }

    // Remote description henüz set edilmemişse queue'la
    if (!peerConnection.remoteDescription) {
      console.log(`[WebRTC] Remote description not set for ${peerUserId}, queueing ICE candidate`);
      if (!this._pendingCandidates.has(peerUserId)) {
        this._pendingCandidates.set(peerUserId, []);
      }
      this._pendingCandidates.get(peerUserId).push(candidate);
      return;
    }

    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      console.log(`[WebRTC] Added ICE candidate for ${peerUserId}`);
    } catch (error) {
      // ICE candidate hataları genellikle önemsizdir
      console.warn(`[WebRTC] addIceCandidate warning for peer ${peerUserId}:`, error.message);
    }
  }

  /**
   * Bekleyen ICE candidate'ları peer connection'a ekle
   * setRemoteDescription çağrıldıktan sonra çağrılmalı
   * @param {string} peerUserId
   * @param {RTCPeerConnection} peerConnection
   * @private
   */
  async _flushPendingCandidates(peerUserId, peerConnection) {
    const pending = this._pendingCandidates.get(peerUserId);
    if (!pending || pending.length === 0) return;

    this._pendingCandidates.delete(peerUserId);
    console.log(`[WebRTC] Flushing ${pending.length} pending ICE candidate(s) for ${peerUserId}`);

    for (const candidate of pending) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.warn(`[WebRTC] Pending addIceCandidate failed for ${peerUserId}:`, error.message);
      }
    }
  }

  /**
   * Polite peer kontrolü (glare handling için)
   * userId string karşılaştırması ile deterministik
   * @param {string} peerUserId
   * @returns {boolean}
   * @private
   */
  _isPolite(peerUserId) {
    return String(this.localUserId) > String(peerUserId);
  }

  /**
   * Deterministik initiator kontrolü
   * userId'si küçük (string karşılaştırma) olan taraf offer üretir.
   * Böylece iki tarafın da aynı anda offer göndermesi engellenir.
   * @param {string} peerUserId
   * @returns {boolean}
   * @private
   */
  _isInitiator(peerUserId) {
    return String(this.localUserId) < String(peerUserId);
  }

  /**
   * Mikrofonu sustur/aç
   * @returns {boolean} Mikrofon aktif mi?
   */
  toggleMute() {
    if (!this.localStream) return false;

    const audioTrack = this.localStream.getAudioTracks()[0];
    if (!audioTrack) return false;

    audioTrack.enabled = !audioTrack.enabled;
    return audioTrack.enabled;
  }

  /**
   * Mikrofon durumunu al
   * @returns {boolean} true = aktif, false = muted
   */
  isMuted() {
    if (!this.localStream) return true;

    const audioTrack = this.localStream.getAudioTracks()[0];
    if (!audioTrack) return true;

    return !audioTrack.enabled;
  }

  /**
   * Tek bir peer bağlantısını kapat
   * @param {string} peerUserId
   */
  closePeerConnection(peerUserId) {
    const peerConnection = this.peerConnections.get(peerUserId);

    if (peerConnection) {
      // Tüm track'leri kaldır
      peerConnection.getSenders().forEach((sender) => {
        try {
          peerConnection.removeTrack(sender);
        } catch {
          // Sessizce yut
        }
      });

      peerConnection.close();
      this.peerConnections.delete(peerUserId);
    }

    // Remote stream'i temizle
    this.remoteStreams.delete(peerUserId);

    // Remote analyser'ı temizle
    this._cleanupRemoteAnalyser(peerUserId);

    // Peer'e ait signaling state'lerini temizle (memory leak önleme)
    this._pendingCandidates.delete(peerUserId);
    this._makingOffer.delete(peerUserId);
    this._remoteOfferReceived.delete(peerUserId);

    console.log(`[WebRTC] Peer connection closed for ${peerUserId}`);
  }

  /**
   * Tüm bağlantıları kapat ve kaynakları serbest bırak
   */
  destroy() {
    this._isDestroyed = true;

    // Volume monitoring'i durdur
    if (this._volumeMonitorId) {
      cancelAnimationFrame(this._volumeMonitorId);
      this._volumeMonitorId = null;
    }

    // Tüm peer connection'ları kapat
    for (const [peerUserId] of this.peerConnections) {
      this.closePeerConnection(peerUserId);
    }
    this.peerConnections.clear();
    this.remoteStreams.clear();

    // Tüm remote analyser'ları temizle
    for (const [peerUserId] of this.remoteAnalysers) {
      this._cleanupRemoteAnalyser(peerUserId);
    }
    this.remoteAnalysers.clear();

    // Local stream'i durdur
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    // Local analyser'ı temizle
    if (this.localAnalyserSource) {
      try {
        this.localAnalyserSource.disconnect();
      } catch {
        // Sessizce yut
      }
      this.localAnalyserSource = null;
    }
    this.localAnalyser = null;

    // AudioContext'i kapat
    if (this.audioContext) {
      this.audioContext.close().catch(() => {
        // Sessizce yut
      });
      this.audioContext = null;
    }

    // Callback'leri temizle
    this.onVolumeUpdate = null;
    this.onPeerStream = null;
    this.onPeerConnected = null;
    this.onPeerDisconnected = null;
    this.onError = null;

    // ICE servers cache'ini temizle
    this._iceServersPromise = null;

    this._isInitialized = false;
  }

  /**
   * Hata raporla
   * @param {Error} error
   * @param {string} context
   * @private
   */
  _reportError(error, context) {
    console.error(`WebRTCService error [${context}]:`, error.message);
    if (this.onError) {
      this.onError(error, context);
    }
  }

  /**
   * Aktif peer connection sayısını al
   * @returns {number}
   */
  getPeerCount() {
    return this.peerConnections.size;
  }

  /**
   * Bağlı peer'ların listesini al
   * @returns {string[]}
   */
  getConnectedPeers() {
    const connected = [];
    for (const [peerUserId, pc] of this.peerConnections) {
      if (pc.connectionState === 'connected') {
        connected.push(peerUserId);
      }
    }
    return connected;
  }

  /**
   * Tüm peer bağlantılarının durumunu al
   * @returns {Array<{peerUserId: string, state: string, iceState: string}>}
   */
  getPeerStates() {
    const states = [];
    for (const [peerUserId, pc] of this.peerConnections) {
      states.push({
        peerUserId,
        state: pc.connectionState,
        iceState: pc.iceConnectionState,
      });
    }
    return states;
  }
}
