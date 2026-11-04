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
  METRICS_PATH,
  JSON_BODY_LIMIT,
  RATE_LIMIT_HEALTH_WINDOW_MS,
  RATE_LIMIT_HEALTH_MAX,
  RATE_LIMIT_ROOMS_WINDOW_MS,
  RATE_LIMIT_ROOMS_MAX,
  RATE_LIMIT_METRICS_WINDOW_MS,
  RATE_LIMIT_METRICS_MAX,
  ROOM_ID_PATTERN,
  ROOM_ID_MAX_LENGTH,
  ICE_SERVERS,
  SOCKET_PING_TIMEOUT,
  SOCKET_PING_INTERVAL,
  SOCKET_INACTIVE_THRESHOLD,
  SOCKET_INACTIVE_CHECK_INTERVAL,
  SOCKET_MAX_CONNECTION_TIME,
  MAX_CONNECTIONS,
  METRICS_LOG_INTERVAL,
} from './src/constants.js';
import { getAllRooms, getRoom, getUsersInRoom } from './src/socket/roomManager.js';
import { registerSocketHandlers } from './src/socket/handlers.js';
import { getRateLimitMapSize } from './src/utils/rateLimiter.js';
import authRoutes from './src/routes/auth.js';
import friendsRoutes from './src/routes/friends.js';
import serverRoutes from './src/routes/servers.js';
import channelRoutes from './src/routes/channels.js';
import inviteRoutes from './src/routes/invites.js';
import messageRoutes from './src/routes/messages.js';
import conversationRoutes from './src/routes/conversations.js';
import emojiRoutes from './src/routes/emojis.js';
import soundboardRoutes from './src/routes/soundboard.js';
import roleRoutes from './src/routes/roles.js';
import moderationRoutes from './src/routes/moderation.js';
import automodRoutes from './src/routes/automod.js';
import auditLogRoutes from './src/routes/audit-log.js';
import webhookRoutes from './src/routes/webhooks.js';
import notificationRoutes from './src/routes/notifications.js';
import settingsRoutes from './src/routes/settings.js';
import discoverRoutes from './src/routes/discover.js';
import voiceRoutes from './src/routes/voice.js';
import { socketAuth, broadcastStatusChange } from './src/socket/auth.js';
import { registerTypingHandlers } from './src/socket/typing.js';
import { registerSoundboardHandlers } from './src/socket/soundboard.js';

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
    
    // file://, app:// veya voicecan-app:// protokolleri (Electron)
    if (origin.startsWith('file://') || origin.startsWith('app://') || origin.startsWith('voicecan-app://')) {
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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  credentials: false, // Wildcard origin ile credentials:true kullanılamaz (CORS spec)
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

// Uploads klasörü - mesaj ekleri için statik dosya sunumu
app.use('/uploads', express.static(join(__dirname, 'uploads')));

// HTTP server (Express + Socket.io aynı portta)
const httpServer = createServer(app);

// ============================================================
// PERFORMANCE METRICS (FAZ 1 - Görev 1.4)
// ============================================================

const metrics = {
  totalConnections: 0,
  activeConnections: 0,
  peakConnections: 0,
  rejectedConnections: 0,
  totalEvents: 0,
  totalErrors: 0,
  startTime: Date.now(),
};

// Socket.io server instance
const io = new Server(httpServer, {
  cors: corsOptions,
  maxHttpBufferSize: 1e5, // 100KB - sinyal mesajları için yeterli
  pingTimeout: SOCKET_PING_TIMEOUT,
  pingInterval: SOCKET_PING_INTERVAL,
  transports: ['websocket', 'polling'],
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
// METRICS ENDPOINT (FAZ 1 - Görev 1.4)
// ============================================================

// Rate limiter - metrics endpoint
const metricsLimiter = rateLimit({
  windowMs: RATE_LIMIT_METRICS_WINDOW_MS,
  max: RATE_LIMIT_METRICS_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests to metrics endpoint, please try again later.',
  },
});

/**
 * Performance metrics endpoint
 * Sunucu performansı ve bağlantı istatistikleri
 */
app.get(METRICS_PATH, metricsLimiter, (req, res) => {
  const uptime = Date.now() - metrics.startTime;
  const uptimeMinutes = Math.floor(uptime / 1000 / 60);
  const uptimeHours = Math.floor(uptimeMinutes / 60);
  
  res.status(200).json({
    status: 'ok',
    uptime: {
      ms: uptime,
      formatted: `${uptimeHours}h ${uptimeMinutes % 60}m`,
    },
    connections: {
      active: metrics.activeConnections,
      total: metrics.totalConnections,
      peak: metrics.peakConnections,
      max: MAX_CONNECTIONS,
      rejected: metrics.rejectedConnections,
    },
    events: {
      total: metrics.totalEvents,
      perMinute: uptimeMinutes > 0 ? Math.round(metrics.totalEvents / uptimeMinutes) : 0,
    },
    errors: {
      total: metrics.totalErrors,
    },
    rateLimiter: {
      trackedEntries: getRateLimitMapSize(),
    },
    rooms: {
      active: getAllRooms().length,
    },
  });
});

// ============================================================
// API ROUTES (FAZ 2 - Authentication, Friends, Blocks)
// ============================================================

// Authentication routes
// Rate limiters auth.js içinde apply ediliyor (endpoint bazında)
app.use('/api/auth', authRoutes);

// Friends & Blocks routes
app.use('/api/friends', friendsRoutes);

// Webhook routes (FAZ 7 - Webhooks) - MUST BE FIRST among /api routes for public endpoint
app.use('/api', webhookRoutes);

// Voice routes (FAZ 15.1 - LiveKit Token API) - public endpoint, must be before auth-guarded /api routers
app.use('/api/voice', voiceRoutes);

// Server management routes (FAZ 3)
app.use('/api/servers', serverRoutes);

// Channel management routes (FAZ 3)
app.use('/api', channelRoutes);

// Invite system routes (FAZ 3)
app.use('/api', inviteRoutes);

// Message routes (FAZ 4 - Gelişmiş Mesajlaşma)
app.use('/api', messageRoutes);

// Conversation routes (FAZ 5 - DM & Group DM)
app.use('/api', conversationRoutes);

// Emoji routes (FAZ 5 - Custom Emoji)
app.use('/api', emojiRoutes);

// Soundboard routes (FAZ 5 - Soundboard)
app.use('/api', soundboardRoutes);

// Role management routes (FAZ 6 - Roller & İzinler)
app.use('/api', roleRoutes);

// Moderation routes (FAZ 6 - Ban, Kick, Timeout)
app.use('/api', moderationRoutes);

// AutoMod routes (FAZ 6 - Otomatik Moderasyon)
app.use('/api', automodRoutes);

// Audit Log routes (FAZ 6 - Denetim Kayıtları)
app.use('/api', auditLogRoutes);

// Notification routes (FAZ 7 - Bildirimler)
app.use('/api/notifications', notificationRoutes);

// Settings routes (FAZ 7 - Kullanıcı Ayarları)
app.use('/api/users', settingsRoutes);

// Discover routes (FAZ 7 - Keşfet)
app.use('/api/discover', discoverRoutes);

// Share io instance with routes (for socket broadcasts from HTTP handlers)
app.set('io', io);

logger.info('API routes mounted: /api/auth, /api/friends, /api/servers, /api/channels, /api/invites, /api/messages, /api/conversations, /api/emojis, /api/soundboard, /api/roles, /api/moderation, /api/automod, /api/audit-log, /api/webhooks, /api/notifications, /api/users, /api/discover, /api/voice');

// ============================================================
// SOCKET.IO AUTHENTICATION MIDDLEWARE (FAZ 2)
// ============================================================

// Strict authentication - rejects connections without valid token
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      logger.warn(`Socket connection rejected: no token provided (${socket.id})`);
      return next(new Error('Authentication token required'));
    }

    // Verify JWT token
    const { verifyToken } = await import('./src/middleware/auth.js');
    const decoded = await verifyToken(token);

    if (!decoded || !decoded.userId) {
      logger.warn(`Socket connection rejected: invalid token payload (${socket.id})`);
      return next(new Error('Invalid authentication token'));
    }

    // Fetch user from database
    const user = await (await import('./src/lib/prisma.js')).default.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        username: true,
        discriminator: true,
        displayName: true,
        status: true,
      },
    });

    if (!user) {
      logger.warn(`Socket connection rejected: user not found (${decoded.userId})`);
      return next(new Error('User not found'));
    }

    // Attach user to socket
    socket.user = user;
    socket.userId = user.id;

    logger.info(`Socket authenticated: ${user.username}#${user.discriminator} (${socket.id})`);

    next();
  } catch (error) {
    logger.error(`Socket auth error (${socket.id}):`, error.message);
    return next(new Error('Authentication failed'));
  }
});

// ============================================================
// SOCKET.IO CONNECTION HANDLER
// ============================================================

io.on('connection', (socket) => {
  // Graceful degradation - max connection kontrolü
  if (metrics.activeConnections >= MAX_CONNECTIONS) {
    metrics.rejectedConnections++;
    logger.warn(
      `Max connections reached (${MAX_CONNECTIONS}), rejecting ${socket.id}`
    );
    socket.emit('error', { 
      message: 'Server is at capacity, please try again later' 
    });
    socket.disconnect(true);
    return;
  }
  
  // Metrics güncelle
  metrics.totalConnections++;
  metrics.activeConnections++;
  if (metrics.activeConnections > metrics.peakConnections) {
    metrics.peakConnections = metrics.activeConnections;
  }
  
  logger.info(`User connected: ${socket.id} (active: ${metrics.activeConnections})`);
  
  // Heartbeat tracking - son aktivite zamanını kaydet
  socket.data.lastActivity = Date.now();
  socket.data.connectedAt = Date.now();
  
  // Her event'te activity güncelle
  socket.onAny(() => {
    socket.data.lastActivity = Date.now();
    metrics.totalEvents++;
  });
  
  // Connection timeout - 24 saat sonra otomatik disconnect
  const connectionTimeoutId = setTimeout(() => {
    logger.info(`Disconnecting socket after 24h max connection time: ${socket.id}`);
    socket.disconnect(true);
  }, SOCKET_MAX_CONNECTION_TIME);
  
  // Tüm event handler'ları register et
  registerSocketHandlers(socket, io);

  // Typing indicator handlers (FAZ 4)
  registerTypingHandlers(socket, io);

  // Soundboard handlers (FAZ 5)
  registerSoundboardHandlers(socket, io);

  // User-specific room (for targeted notifications like @mentions)
  socket.join(socket.userId);
  
  // ============================================================
  // STATUS CHANGE HANDLER (FAZ 2)
  // ============================================================
  
  // Handle user status change via socket
  socket.on('user:status:change', async (data) => {
    try {
      if (!socket.userId) {
        logger.warn(`Status change rejected for ${socket.id}: not authenticated`);
        return;
      }

      const { status, customStatus } = data || {};
      const validStatuses = ['ONLINE', 'IDLE', 'DND', 'INVISIBLE'];

      // Validate status
      if (status && !validStatuses.includes(status)) {
        logger.warn(`Invalid status change for ${socket.userId}: ${status}`);
        return;
      }

      // Validate customStatus length
      if (customStatus && typeof customStatus === 'string' && customStatus.length > 128) {
        logger.warn(`Custom status too long for ${socket.userId}: ${customStatus.length} chars`);
        return;
      }

      // Update user status in database
      const prisma = (await import('./src/lib/prisma.js')).default;
      const updateData = {};
      if (status) updateData.status = status;
      if (customStatus !== undefined) updateData.customStatus = customStatus;

      if (Object.keys(updateData).length > 0) {
        await prisma.user.update({
          where: { id: socket.userId },
          data: updateData,
        });

        // Broadcast to friends
        await broadcastStatusChange(io, socket.userId, status, customStatus);

        logger.info(`Status updated for ${socket.userId}: ${status || 'unchanged'}, custom: ${customStatus || 'none'}`);
      }
    } catch (error) {
      logger.error(`Status change error for ${socket.id}:`, error.message);
    }
  });
  
  // Disconnect handler - metrics güncelle
  socket.on('disconnect', () => {
    metrics.activeConnections--;
    clearTimeout(connectionTimeoutId);
    logger.info(`User disconnected: ${socket.id} (active: ${metrics.activeConnections})`);
  });
  
  // Socket error handler - metrics güncelle
  socket.on('error', (error) => {
    metrics.totalErrors++;
    logger.error(`Socket error for ${socket.id}:`, error.message);
  });
});

// Heartbeat checker - inactive connection'ları temizle
const heartbeatChecker = setInterval(() => {
  const now = Date.now();
  let inactiveCount = 0;
  
  io.sockets.sockets.forEach((socket) => {
    if (socket.data.lastActivity) {
      const inactiveTime = now - socket.data.lastActivity;
      if (inactiveTime > SOCKET_INACTIVE_THRESHOLD) {
        logger.warn(
          `Disconnecting inactive socket: ${socket.id} (inactive for ${Math.floor(inactiveTime / 1000)}s)`
        );
        socket.disconnect(true);
        inactiveCount++;
      }
    }
  });
  
  if (inactiveCount > 0) {
    logger.info(`Heartbeat check: disconnected ${inactiveCount} inactive sockets`);
  }
}, SOCKET_INACTIVE_CHECK_INTERVAL);

// Metrics logger - her METRICS_LOG_INTERVAL'da metrics logla
const metricsLogger = setInterval(() => {
  logger.info(
    `Metrics: ${metrics.activeConnections} active connections, ` +
    `${metrics.totalEvents} total events, ${metrics.totalErrors} errors, ` +
    `${getRateLimitMapSize()} rate limit entries`
  );
}, METRICS_LOG_INTERVAL);

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

// Global error handler (FAZ 2 Security - production'da generic message)
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err.message);
  
  const isDev = config.nodeEnv === 'development';
  
  res.status(err.status || 500).json({
    error: isDev ? err.message : 'Internal Server Error',
    ...(isDev && { stack: err.stack }),
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
  logger.info(`Metrics:      http://${config.host}:${config.port}${METRICS_PATH}`);
  logger.info(`Max connections: ${MAX_CONNECTIONS}`);
  logger.info(`Ping interval: ${SOCKET_PING_INTERVAL}ms, timeout: ${SOCKET_PING_TIMEOUT}ms`);
});

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

function gracefulShutdown(signal) {
  logger.warn(`Received ${signal}. Shutting down gracefully...`);

  // Periyodik timer'ları temizle
  clearInterval(heartbeatChecker);
  clearInterval(metricsLogger);

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
