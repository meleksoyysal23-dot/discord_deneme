/**
 * WebRTC Service
 * Peer-to-peer sesli iletişim için WebRTC bağlantı yönetimi
 * Mesh topolojisi: Her kullanıcı diğer her kullanıcıyla ayrı RTCPeerConnection kurar
 * Opus codec: 48kHz, mono, yüksek kalite düşük latency
 */

// Backend URL - environment variable'dan al
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// Fallback ICE servers - backend erişilemezse kullanılır
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
      console.log('ICE servers fetched from backend:', config.iceServers);
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

    // Zaten varsa kapat ve yeniden oluştur
    if (this.peerConnections.has(peerUserId)) {
      this.closePeerConnection(peerUserId);
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
      const remoteStream = event.streams[0];
      if (!remoteStream) return;

      this.remoteStreams.set(peerUserId, remoteStream);

      if (this.onPeerStream) {
        this.onPeerStream(peerUserId, remoteStream);
      }

      // Remote peer için ses seviyesi algılama kur
      this._setupRemoteAnalyser(peerUserId, remoteStream);
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
      try {
        // Mevcut offer/answer işlemi bitene kadar bekle
        if (peerConnection.signalingState !== 'stable') {
          return;
        }

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        this.socket.emit('signal-offer', {
          targetUserId: peerUserId,
          offer: peerConnection.localDescription,
        });
      } catch (error) {
        console.error(`Negotiation error for peer ${peerUserId}:`, error);
        this._reportError(error, 'onnegotiationneeded');
      }
    };

    this.peerConnections.set(peerUserId, peerConnection);
    return peerConnection;
  }

  /**
   * Offer oluştur ve gönder (caller tarafı)
   * @param {string} peerUserId
   * @returns {Promise<RTCSessionDescriptionInit>}
   */
  async createOffer(peerUserId) {
    if (this._isDestroyed) return null;

    try {
      const peerConnection = await this.createPeerConnection(peerUserId);

      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });

      await peerConnection.setLocalDescription(offer);

      this.socket.emit('signal-offer', {
        targetUserId: peerUserId,
        offer,
      });

      return offer;
    } catch (error) {
      console.error(`Create offer failed for peer ${peerUserId}:`, error);
      this._reportError(error, 'createOffer');
      throw error;
    }
  }

  /**
   * ICE restart mekanizması - bağlantı koptuğunda otomatik yeniden bağlanma
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

      // Offer'ı signaling server'a gönder
      this.socket.emit('signal-offer', {
        targetUserId: peerUserId,
        offer: offer,
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
   * @param {string} peerUserId
   * @param {RTCSessionDescriptionInit} offer
   * @returns {Promise<RTCSessionDescriptionInit>}
   */
  async createAnswer(peerUserId, offer) {
    if (this._isDestroyed) return null;

    try {
      let peerConnection = this.peerConnections.get(peerUserId);

      if (!peerConnection) {
        peerConnection = await this.createPeerConnection(peerUserId);
      }

      // Remote description'ı ayarla (offer)
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

      // Answer oluştur
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      // Answer'ı signaling server'a gönder
      this.socket.emit('signal-answer', {
        targetUserId: peerUserId,
        answer,
      });

      return answer;
    } catch (error) {
      console.error(`Create answer failed for peer ${peerUserId}:`, error);
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
      console.warn(`setRemoteDescription: no peer connection for ${peerUserId}`);
      return;
    }

    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
      console.error(`setRemoteDescription failed for peer ${peerUserId}:`, error);
      this._reportError(error, 'setRemoteDescription');
    }
  }

  /**
   * ICE candidate ekle
   * @param {string} peerUserId
   * @param {RTCIceCandidateInit} candidate
   */
  async addIceCandidate(peerUserId, candidate) {
    if (this._isDestroyed) return;

    const peerConnection = this.peerConnections.get(peerUserId);
    if (!peerConnection) {
      console.warn(`addIceCandidate: no peer connection for ${peerUserId}`);
      return;
    }

    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      // ICE candidate hataları genellikle önemsizdir, sessizce yut
      console.warn(`addIceCandidate warning for peer ${peerUserId}:`, error.message);
    }
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
