/**
 * Vibe-Voice Signaling Server
 * WebRTC P2P sesli iletişim için sinyalleşme sunucusu
 * Socket.io üzerinden SDP/ICE değiş tokuşu sağlar
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { config } from './src/config/config.js';
import { logger } from './src/utils/logger.js';
import {
  HEALTH_CHECK_PATH,
  ROOMS_LIST_PATH,
  ROOM_DETAIL_PATH,
  CONFIG_PATH,
  JSON_BODY_LIMIT,
  RATE_LIMIT_HEALTH_WINDOW_MS,
  RATE_LIMIT_HEALTH_MAX,
  RATE_LIMIT_ROOMS_WINDOW_MS,
  RATE_LIMIT_ROOMS_MAX,
  ROOM_ID_PATTERN,
  ROOM_ID_MAX_LENGTH,
  ICE_SERVERS,
} from './src/constants.js';
import { getAllRooms, getRoom, getUsersInRoom } from './src/socket/roomManager.js';
import { registerSocketHandlers } from './src/socket/handlers.js';

// __dirname ES modules için
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Express uygulaması
const app = express();

// Trust proxy (rate limiter arkasında doğru IP için)
app.set('trust proxy', 1);

// CORS middleware
// Electron app'lerinden gelen isteklere izin ver (file://, app:// protokolleri)
const corsOptions = {
  origin: (origin, callback) => {
    // Wildcard yapılandırıldıysa tüm originlere izin ver
    if (config.corsOrigin === '*') {
      return callback(null, true);
    }
    
    // Origin yoksa (server-to-server, Postman, Electron file://) izin ver
    if (!origin) {
      return callback(null, true);
    }
    
    // file:// veya app:// protokolleri (Electron)
    if (origin.startsWith('file://') || origin.startsWith('app://')) {
      return callback(null, true);
    }
    
    // Array ise kontrol et
    if (Array.isArray(config.corsOrigin)) {
      if (config.corsOrigin.includes(origin)) {
        return callback(null, true);
      }
    } else {
      // String ise direkt karşılaştır
      if (config.corsOrigin === origin) {
        return callback(null, true);
      }
    }
    
    // İzin verilmeyen origin
    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST'],
  credentials: true,
};

app.use(cors(corsOptions));

// JSON body parser - güvenlik için boyut sınırı
app.use(express.json({ limit: JSON_BODY_LIMIT }));

// URL-encoded body parser - aynı sınır
app.use(express.urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));

// Rate limiter - health check
const healthLimiter = rateLimit({
  windowMs: RATE_LIMIT_HEALTH_WINDOW_MS,
  max: RATE_LIMIT_HEALTH_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests to health endpoint, please try again later.',
  },
});

// Rate limiter - rooms endpoint
const roomsLimiter = rateLimit({
  windowMs: RATE_LIMIT_ROOMS_WINDOW_MS,
  max: RATE_LIMIT_ROOMS_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests to rooms endpoint, please try again later.',
  },
});

// Statik dosyalar için public klasörü (ileride kullanılacak)
app.use('/public', express.static(join(__dirname, 'public')));

// HTTP server (Express + Socket.io aynı portta)
const httpServer = createServer(app);

// Socket.io server instance
const io = new Server(httpServer, {
  cors: corsOptions,
  maxHttpBufferSize: 1e5, // 100KB - sinyal mesajları için yeterli
});

// ============================================================
// REST API ENDPOINTS
// ============================================================

/**
 * Health check endpoint
 * Sunucunun çalışıp çalışmadığını kontrol eder
 */
app.get(HEALTH_CHECK_PATH, healthLimiter, (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * WebRTC configuration endpoint
 * Client'lara ICE/STUN server yapılandırmasını sağlar
 */
app.get(CONFIG_PATH, healthLimiter, (req, res) => {
  res.status(200).json({
    iceServers: ICE_SERVERS,
  });
});

/**
 * Aktif odaları listele
 */
app.get(ROOMS_LIST_PATH, roomsLimiter, (req, res) => {
  const activeRooms = getAllRooms();
  res.status(200).json({
    rooms: activeRooms,
  });
});

/**
 * Belirli bir odanın detaylarını getir
 * Response'da socketId gizlenir (güvenlik), sadece userId döndürülür
 */
app.get(ROOM_DETAIL_PATH, roomsLimiter, (req, res) => {
  const { id: roomId } = req.params;

  // Room ID validation - boş veya string değilse reddet
  if (!roomId || typeof roomId !== 'string') {
    logger.warn(`Room detail request with invalid room ID: ${JSON.stringify(roomId)}`);
    return res.status(400).json({
      error: 'Invalid room ID',
    });
  }

  // Room ID uzunluk kontrolü
  if (roomId.length > ROOM_ID_MAX_LENGTH) {
    logger.warn(`Room detail request with too long room ID (length: ${roomId.length})`);
    return res.status(400).json({
      error: 'Invalid room ID',
      message: `Room ID must be at most ${ROOM_ID_MAX_LENGTH} characters`,
    });
  }

  // Room ID pattern kontrolü (sadece alfanumerik, tire, alt çizgi)
  if (!ROOM_ID_PATTERN.test(roomId)) {
    logger.warn(`Room detail request with invalid room ID format: ${roomId}`);
    return res.status(400).json({
      error: 'Invalid room ID',
      message: 'Room ID can only contain letters, numbers, hyphens and underscores',
    });
  }

  const room = getRoom(roomId);

  if (!room) {
    logger.info(`Room detail requested for non-existent room: ${roomId}`);
    return res.status(404).json({
      error: 'Room not found',
      message: `Room ${roomId} does not exist`,
    });
  }

  const users = getUsersInRoom(roomId);

  logger.info(`Room detail returned for: ${roomId} (${users.length} users)`);

  res.status(200).json({
    roomId: room.roomId,
    userCount: users.length,
    maxSize: config.maxRoomSize,
    users: users.map((u) => ({
      userId: u.userId,
      gender: u.gender,
      avatar: u.avatar,
      lastSeen: u.lastSeen,
      isOnline: u.isOnline,
    })), // socketId gizli (güvenlik)
    createdAt: room.createdAt,
  });
});

// ============================================================
// SOCKET.IO CONNECTION HANDLER
// ============================================================

io.on('connection', (socket) => {
  logger.info(`User connected: ${socket.id}`);

  // Tüm event handler'ları register et
  registerSocketHandlers(socket, io);
});

// ============================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
});

// ============================================================
// SERVER START
// ============================================================

httpServer.listen(config.port, config.host, () => {
  logger.success(`🚀 Vibe-Voice signaling server running on port ${config.port}`);
  logger.info(`Health check: http://${config.host}:${config.port}${HEALTH_CHECK_PATH}`);
  logger.info(`Config:       http://${config.host}:${config.port}${CONFIG_PATH}`);
  logger.info(`Rooms list:   http://${config.host}:${config.port}${ROOMS_LIST_PATH}`);
});

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

function gracefulShutdown(signal) {
  logger.warn(`Received ${signal}. Shutting down gracefully...`);

  // Tüm socket bağlantılarını kapat
  io.close(() => {
    logger.info('Socket.io connections closed.');

    // HTTP server'ı kapat
    httpServer.close(() => {
      logger.success('HTTP server closed. Goodbye!');
      process.exit(0);
    });
  });

  // 5 saniye içinde kapanmazsa zorla kapat
  setTimeout(() => {
    logger.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 5000);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Yakalanmamış hataları logla
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});
