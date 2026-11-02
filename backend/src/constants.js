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

// WebRTC ICE/STUN servers - Google public STUN servers
export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
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
