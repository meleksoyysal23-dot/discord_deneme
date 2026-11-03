/**
 * Vibe-Voice sabitleri (constants)
 * Uygulama genelinde kullanılan varsayılan değerler ve sınır tanımları
 */

export const MAX_ROOM_SIZE = 4;
export const DEFAULT_PORT = 3001;
export const DEFAULT_HOST = '0.0.0.0';
export const DEFAULT_CORS_ORIGIN = '*';
export const HEALTH_CHECK_PATH = '/api/health';
export const CONFIG_PATH = '/api/config';
export const ROOMS_LIST_PATH = '/api/rooms';
export const ROOM_DETAIL_PATH = '/api/rooms/:id';

// WebRTC ICE/STUN/TURN servers
export const ICE_SERVERS = [
  // Google public STUN servers
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  
  // TURN servers - NAT traversal için kritik
  // Metered.ca ücretsiz public TURN servers
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  }
];

// Room ID validation
export const ROOM_ID_MAX_LENGTH = 50;
export const ROOM_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

// User ID validation
export const USER_ID_MAX_LENGTH = 50;
export const USER_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

// Body size limits
export const JSON_BODY_LIMIT = '10kb';

// Rate limiting
export const RATE_LIMIT_HEALTH_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const RATE_LIMIT_HEALTH_MAX = 100;
export const RATE_LIMIT_ROOMS_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const RATE_LIMIT_ROOMS_MAX = 50;

// Chat message limits
export const CHAT_MESSAGE_MAX_LENGTH = 500;
export const CHAT_RATE_LIMIT = 10; // 10 saniyede max 10 mesaj
export const CHAT_RATE_WINDOW = 10000; // 10 saniye

// User profile
export const GENDER_OPTIONS = ['male', 'female', null];
export const AVATAR_ID_MIN = 1;
export const AVATAR_ID_MAX = 20;

// ============================================================
// SOCKET.IO OPTIMIZATION CONSTANTS (FAZ 1 - Görev 1.4)
// ============================================================

// Heartbeat & Connection Health
export const SOCKET_PING_TIMEOUT = 60000; // 60 saniye - client cevap süresi
export const SOCKET_PING_INTERVAL = 25000; // 25 saniye - ping aralığı
export const SOCKET_INACTIVE_THRESHOLD = 120000; // 2 dakika - inactive disconnect
export const SOCKET_INACTIVE_CHECK_INTERVAL = 60000; // 1 dakika - kontrol aralığı

// Connection Timeout
export const SOCKET_MAX_CONNECTION_TIME = 24 * 60 * 60 * 1000; // 24 saat

// Socket-level Rate Limiting (WebRTC signaling)
export const SIGNAL_OFFER_RATE_LIMIT = 5; // 10 saniyede max 5 offer
export const SIGNAL_OFFER_RATE_WINDOW = 10000; // 10 saniye
export const SIGNAL_ANSWER_RATE_LIMIT = 5; // 10 saniyede max 5 answer
export const SIGNAL_ANSWER_RATE_WINDOW = 10000; // 10 saniye
export const SIGNAL_ICE_RATE_LIMIT = 50; // 10 saniyede max 50 ICE candidate
export const SIGNAL_ICE_RATE_WINDOW = 10000; // 10 saniye
export const SIGNAL_JOIN_RATE_LIMIT = 3; // 10 saniyede max 3 join
export const SIGNAL_JOIN_RATE_WINDOW = 10000; // 10 saniye

// Rate limit map cleanup interval
export const RATE_LIMIT_CLEANUP_INTERVAL = 300000; // 5 dakika

// SDP / ICE Candidate validation limits
export const SDP_MAX_LENGTH = 10000; // 10KB max SDP
export const ICE_CANDIDATE_MAX_LENGTH = 1000; // 1KB max ICE candidate
export const SDP_VALID_TYPES = ['offer', 'answer', 'pranswer', 'rollback'];

// Graceful Degradation
export const MAX_CONNECTIONS = 1000; // Max eşzamanlı socket bağlantısı

// Metrics
export const METRICS_LOG_INTERVAL = 300000; // 5 dakika - metrics loglama
export const METRICS_PATH = '/api/metrics';

// Metrics rate limiting
export const RATE_LIMIT_METRICS_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const RATE_LIMIT_METRICS_MAX = 60; // 15 dakikada max 60 istek
