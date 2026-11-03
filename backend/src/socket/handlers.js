/**
 * Socket.io Event Handlers
 * WebRTC sinyalleşme ve oda yönetimi event'leri
 */

import { logger } from '../utils/logger.js';
import {
  ROOM_ID_MAX_LENGTH,
  ROOM_ID_PATTERN,
  USER_ID_MAX_LENGTH,
  USER_ID_PATTERN,
  CHAT_MESSAGE_MAX_LENGTH,
  CHAT_RATE_LIMIT,
  CHAT_RATE_WINDOW,
  SIGNAL_OFFER_RATE_LIMIT,
  SIGNAL_OFFER_RATE_WINDOW,
  SIGNAL_ANSWER_RATE_LIMIT,
  SIGNAL_ANSWER_RATE_WINDOW,
  SIGNAL_ICE_RATE_LIMIT,
  SIGNAL_ICE_RATE_WINDOW,
  SIGNAL_JOIN_RATE_LIMIT,
  SIGNAL_JOIN_RATE_WINDOW,
} from '../constants.js';
import {
  joinRoom,
  leaveRoom,
  getUsersInRoom,
  updateUserLastSeen,
} from './roomManager.js';
import {
  GENDER_OPTIONS,
  AVATAR_ID_MIN,
  AVATAR_ID_MAX,
} from '../constants.js';
import { checkRateLimit } from '../utils/rateLimiter.js';
import {
  validateSDP,
  validateIceCandidate,
} from '../utils/validation.js';

/**
 * Room ID validation
 * @param {string} roomId
 * @returns {{ valid: boolean, error?: string }}
 */
function validateRoomId(roomId) {
  if (!roomId || typeof roomId !== 'string') {
    return { valid: false, error: 'roomId is required and must be a string' };
  }
  const trimmed = roomId.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'roomId cannot be empty' };
  }
  if (trimmed.length > ROOM_ID_MAX_LENGTH) {
    return {
      valid: false,
      error: `roomId exceeds maximum length of ${ROOM_ID_MAX_LENGTH}`,
    };
  }
  if (!ROOM_ID_PATTERN.test(trimmed)) {
    return {
      valid: false,
      error: 'roomId contains invalid characters (only alphanumeric, dash, underscore allowed)',
    };
  }
  return { valid: true, value: trimmed };
}

/**
 * User ID validation
 * @param {string} userId
 * @returns {{ valid: boolean, error?: string }}
 */
function validateUserId(userId) {
  if (!userId || typeof userId !== 'string') {
    return { valid: false, error: 'userId is required and must be a string' };
  }
  const trimmed = userId.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'userId cannot be empty' };
  }
  if (trimmed.length > USER_ID_MAX_LENGTH) {
    return {
      valid: false,
      error: `userId exceeds maximum length of ${USER_ID_MAX_LENGTH}`,
    };
  }
  if (!USER_ID_PATTERN.test(trimmed)) {
    return {
      valid: false,
      error: 'userId contains invalid characters (only alphanumeric, dash, underscore allowed)',
    };
  }
  return { valid: true, value: trimmed };
}

/**
 * Bir odaya userJoined / userLeft / roomUsers broadcast et
 */
function broadcastRoomUsers(io, roomId) {
  const users = getUsersInRoom(roomId);
  // socketId'yi gizle (güvenlik), sadece profil bilgilerini gönder
  const safeUsers = users.map((u) => ({
    userId: u.userId,
    gender: u.gender,
    avatar: u.avatar,
    lastSeen: u.lastSeen,
    isOnline: u.isOnline,
  }));
  io.to(roomId).emit('room-users', { roomId, users: safeUsers });
}

/**
 * Gender validation
 * @param {*} gender
 * @returns {{ valid: boolean, error?: string, value?: string|null }}
 */
function validateGender(gender) {
  if (gender === null || gender === undefined) {
    return { valid: true, value: null };
  }
  if (typeof gender !== 'string') {
    return { valid: false, error: 'gender must be a string or null' };
  }
  if (!GENDER_OPTIONS.includes(gender)) {
    return { valid: false, error: 'gender must be "male", "female", or null' };
  }
  return { valid: true, value: gender };
}

/**
 * Avatar ID validation
 * @param {*} avatar
 * @returns {{ valid: boolean, error?: string, value?: number|null }}
 */
function validateAvatar(avatar) {
  if (avatar === null || avatar === undefined) {
    return { valid: true, value: null };
  }
  if (typeof avatar !== 'number' || !Number.isInteger(avatar)) {
    return { valid: false, error: 'avatar must be an integer or null' };
  }
  if (avatar < AVATAR_ID_MIN || avatar > AVATAR_ID_MAX) {
    return { valid: false, error: `avatar must be between ${AVATAR_ID_MIN} and ${AVATAR_ID_MAX}` };
  }
  return { valid: true, value: avatar };
}

/**
 * Chat mesajı işle ve broadcast et
 * @param {import('socket.io').Socket} socket
 * @param {import('socket.io').Server} io
 * @param {object} data
 * @param {function} callback
 */
function handleChatMessage(socket, io, data, callback) {
  const cb = typeof callback === 'function' ? callback : () => {};

  try {
    // Socket oda ve user kontrolü
    if (!socket.data.roomId || !socket.data.userId) {
      logger.warn(`chat-message from ${socket.id} rejected: not in a room`);
      return cb({ success: false, error: 'Not in a room' });
    }

    const { roomId: roomRaw, userId: userRaw, message } = data || {};

    // Room ID validation
    const roomCheck = validateRoomId(roomRaw);
    if (!roomCheck.valid) {
      logger.warn(`chat-message rejected for ${socket.id}: ${roomCheck.error}`);
      return cb({ success: false, error: roomCheck.error });
    }

    // User ID validation
    const userCheck = validateUserId(userRaw);
    if (!userCheck.valid) {
      logger.warn(`chat-message rejected for ${socket.id}: ${userCheck.error}`);
      return cb({ success: false, error: userCheck.error });
    }

    // Message validation
    if (!message || typeof message !== 'string') {
      logger.warn(`chat-message rejected for ${socket.id}: message is required and must be a string`);
      return cb({ success: false, error: 'message is required and must be a string' });
    }

    const trimmedMessage = message.trim();
    if (trimmedMessage.length === 0) {
      logger.warn(`chat-message rejected for ${socket.id}: message cannot be empty`);
      return cb({ success: false, error: 'message cannot be empty' });
    }

    if (trimmedMessage.length > CHAT_MESSAGE_MAX_LENGTH) {
      logger.warn(
        `chat-message rejected for ${socket.id}: message exceeds maximum length of ${CHAT_MESSAGE_MAX_LENGTH}`
      );
      return cb({
        success: false,
        error: `message exceeds maximum length of ${CHAT_MESSAGE_MAX_LENGTH}`,
      });
    }

    // Rate limiting kontrolü
    const now = Date.now();
    if (!socket.data.chatRateLimit) {
      socket.data.chatRateLimit = [];
    }

    // Eski timestamp'leri temizle (CHAT_RATE_WINDOW dışındakiler)
    socket.data.chatRateLimit = socket.data.chatRateLimit.filter(
      (timestamp) => now - timestamp < CHAT_RATE_WINDOW
    );

    // Limit kontrolü
    if (socket.data.chatRateLimit.length >= CHAT_RATE_LIMIT) {
      logger.warn(
        `chat-message rate limit exceeded for ${socket.id}: ${socket.data.chatRateLimit.length} messages in ${CHAT_RATE_WINDOW}ms`
      );
      return cb({
        success: false,
        error: `Rate limit exceeded. Maximum ${CHAT_RATE_LIMIT} messages per ${CHAT_RATE_WINDOW / 1000} seconds`,
      });
    }

    // Mesajı rate limit array'e ekle
    socket.data.chatRateLimit.push(now);

    const roomId = roomCheck.value;
    const userId = userCheck.value;

    // Socket'in doğru odada olduğunu doğrula
    if (socket.data.roomId !== roomId) {
      logger.warn(
        `chat-message rejected for ${socket.id}: roomId mismatch (socket in ${socket.data.roomId}, requested ${roomId})`
      );
      return cb({ success: false, error: 'Room ID mismatch' });
    }

    // Socket'in doğru user olduğunu doğrula
    if (socket.data.userId !== userId) {
      logger.warn(
        `chat-message rejected for ${socket.id}: userId mismatch (socket has ${socket.data.userId}, requested ${userId})`
      );
      return cb({ success: false, error: 'User ID mismatch' });
    }

    // Last seen güncelle
    updateUserLastSeen(userId);

    // Broadcast to room (sender hariç)
    const timestamp = Date.now();
    socket.to(roomId).emit('chat-message', {
      from: userId,
      message: trimmedMessage,
      timestamp,
    });

    logger.info(
      `Chat message from ${userId} in room ${roomId}: ${trimmedMessage.substring(0, 50)}${trimmedMessage.length > 50 ? '...' : ''}`
    );

    cb({ success: true });
  } catch (err) {
    logger.error(`chat-message handler error for ${socket.id}:`, err.message);
    cb({ success: false, error: 'Internal server error' });
  }
}

/**
 * Socket bağlantısına tüm handler'ları register et
 * @param {import('socket.io').Socket} socket
 * @param {import('socket.io').Server} io
 */
export function registerSocketHandlers(socket, io) {
  // Socket başına hangi oda/user'da olduğunu tut
  socket.data = { roomId: null, userId: null };

  // --------------------------------------------------------
  // join-room
  // --------------------------------------------------------
  socket.on('join-room', (payload, callback) => {
    try {
      const cb = typeof callback === 'function' ? callback : () => {};

      // Rate limiting kontrolü (join-room için)
      if (!checkRateLimit(socket.id, 'join-room', SIGNAL_JOIN_RATE_LIMIT, SIGNAL_JOIN_RATE_WINDOW)) {
        logger.warn(`join-room rate limit exceeded for ${socket.id}`);
        return cb({ success: false, error: 'Rate limit exceeded for join-room, please slow down' });
      }

      const { roomId: roomRaw, userId: userRaw, gender, avatar } = payload || {};

      const roomCheck = validateRoomId(roomRaw);
      if (!roomCheck.valid) {
        logger.warn(`join-room rejected for ${socket.id}: ${roomCheck.error}`);
        return cb({ success: false, error: roomCheck.error });
      }

      const userCheck = validateUserId(userRaw);
      if (!userCheck.valid) {
        logger.warn(`join-room rejected for ${socket.id}: ${userCheck.error}`);
        return cb({ success: false, error: userCheck.error });
      }

      const genderCheck = validateGender(gender);
      if (!genderCheck.valid) {
        logger.warn(`join-room rejected for ${socket.id}: ${genderCheck.error}`);
        return cb({ success: false, error: genderCheck.error });
      }

      const avatarCheck = validateAvatar(avatar);
      if (!avatarCheck.valid) {
        logger.warn(`join-room rejected for ${socket.id}: ${avatarCheck.error}`);
        return cb({ success: false, error: avatarCheck.error });
      }

      const roomId = roomCheck.value;
      const userId = userCheck.value;

      // Eğer bu socket zaten başka bir odadaysa önce oradan çıkar
      if (socket.data.roomId && socket.data.roomId !== roomId) {
        handleLeaveRoom(socket, io, { silent: true });
      }

      const result = joinRoom(roomId, userId, socket.id, {
        gender: genderCheck.value,
        avatar: avatarCheck.value,
      });
      if (!result.success) {
        logger.warn(
          `join-room failed for user ${userId} in room ${roomId}: ${result.error}`
        );
        return cb({ success: false, error: result.error });
      }

      // Socket.io room'a join
      socket.join(roomId);

      // Socket data güncelle
      socket.data.roomId = roomId;
      socket.data.userId = userId;

      const users = getUsersInRoom(roomId);

      logger.info(
        `User ${userId} joined room ${roomId} (socket ${socket.id}, total: ${users.length})`
      );

      // Odaya kullanıcı listesini broadcast et
      broadcastRoomUsers(io, roomId);

      // Yeni katılana özel user-joined event (diğerleri zaten room-users aldı)
      const safeUsers = users.map((u) => ({
        userId: u.userId,
        gender: u.gender,
        avatar: u.avatar,
        lastSeen: u.lastSeen,
        isOnline: u.isOnline,
      }));
      socket.to(roomId).emit('user-joined', {
        roomId,
        userId,
        users: safeUsers,
      });

      cb({ success: true, roomId, users: safeUsers });
    } catch (err) {
      logger.error(`join-room handler error for ${socket.id}:`, err.message);
      const cb = typeof callback === 'function' ? callback : () => {};
      cb({ success: false, error: 'Internal server error' });
    }
  });

  // --------------------------------------------------------
  // leave-room
  // --------------------------------------------------------
  socket.on('leave-room', (payload, callback) => {
    try {
      const cb = typeof callback === 'function' ? callback : () => {};
      handleLeaveRoom(socket, io, { silent: false });
      cb({ success: true });
    } catch (err) {
      logger.error(`leave-room handler error for ${socket.id}:`, err.message);
      const cb = typeof callback === 'function' ? callback : () => {};
      cb({ success: false, error: 'Internal server error' });
    }
  });

  // --------------------------------------------------------
  // signal-offer
  // --------------------------------------------------------
  socket.on('signal-offer', (payload) => {
    try {
      // Rate limiting kontrolü
      if (!checkRateLimit(socket.id, 'signal-offer', SIGNAL_OFFER_RATE_LIMIT, SIGNAL_OFFER_RATE_WINDOW)) {
        socket.emit('error', { message: 'Rate limit exceeded for signal-offer, please slow down' });
        return;
      }

      const { targetUserId, offer } = payload || {};

      if (!socket.data.userId || !socket.data.roomId) {
        logger.warn(`signal-offer from ${socket.id} rejected: not in a room`);
        return;
      }

      const targetCheck = validateUserId(targetUserId);
      if (!targetCheck.valid) {
        logger.warn(
          `signal-offer rejected for ${socket.id}: ${targetCheck.error}`
        );
        socket.emit('error', { message: targetCheck.error });
        return;
      }

      // SDP validation
      const sdpCheck = validateSDP(offer);
      if (!sdpCheck.valid) {
        logger.warn(`signal-offer rejected for ${socket.id}: ${sdpCheck.error}`);
        socket.emit('error', { message: sdpCheck.error });
        return;
      }

      // Target user'ın socket ID'sini bul
      const targetSocket = findSocketByUserId(io, socket.data.roomId, targetCheck.value);
      if (!targetSocket) {
        logger.warn(
          `signal-offer: target user ${targetCheck.value} not found in room ${socket.data.roomId}`
        );
        return;
      }

      targetSocket.emit('signal-offer', {
        from: socket.data.userId,
        offer,
      });

      logger.info(
        `[WebRTC] signal-offer relayed: ${socket.data.userId} -> ${targetCheck.value} (SDP type: ${offer.type}, ${offer.sdp.length} bytes)`
      );
    } catch (err) {
      logger.error(`signal-offer handler error for ${socket.id}:`, err.message);
    }
  });

  // --------------------------------------------------------
  // signal-answer
  // --------------------------------------------------------
  socket.on('signal-answer', (payload) => {
    try {
      // Rate limiting kontrolü
      if (!checkRateLimit(socket.id, 'signal-answer', SIGNAL_ANSWER_RATE_LIMIT, SIGNAL_ANSWER_RATE_WINDOW)) {
        socket.emit('error', { message: 'Rate limit exceeded for signal-answer, please slow down' });
        return;
      }

      const { targetUserId, answer } = payload || {};

      if (!socket.data.userId || !socket.data.roomId) {
        logger.warn(`signal-answer from ${socket.id} rejected: not in a room`);
        return;
      }

      const targetCheck = validateUserId(targetUserId);
      if (!targetCheck.valid) {
        logger.warn(
          `signal-answer rejected for ${socket.id}: ${targetCheck.error}`
        );
        socket.emit('error', { message: targetCheck.error });
        return;
      }

      // SDP validation
      const sdpCheck = validateSDP(answer);
      if (!sdpCheck.valid) {
        logger.warn(`signal-answer rejected for ${socket.id}: ${sdpCheck.error}`);
        socket.emit('error', { message: sdpCheck.error });
        return;
      }

      const targetSocket = findSocketByUserId(io, socket.data.roomId, targetCheck.value);
      if (!targetSocket) {
        logger.warn(
          `signal-answer: target user ${targetCheck.value} not found in room ${socket.data.roomId}`
        );
        return;
      }

      targetSocket.emit('signal-answer', {
        from: socket.data.userId,
        answer,
      });

      logger.debug(
        `signal-answer relayed: ${socket.data.userId} -> ${targetCheck.value}`
      );
    } catch (err) {
      logger.error(`signal-answer handler error for ${socket.id}:`, err.message);
    }
  });

  // --------------------------------------------------------
  // signal-ice-candidate
  // --------------------------------------------------------
  socket.on('signal-ice-candidate', (payload) => {
    try {
      // Rate limiting kontrolü (ICE candidates daha yüksek limit)
      if (!checkRateLimit(socket.id, 'signal-ice-candidate', SIGNAL_ICE_RATE_LIMIT, SIGNAL_ICE_RATE_WINDOW)) {
        socket.emit('error', { message: 'Rate limit exceeded for signal-ice-candidate, please slow down' });
        return;
      }

      const { targetUserId, candidate } = payload || {};

      if (!socket.data.userId || !socket.data.roomId) {
        logger.warn(`signal-ice-candidate from ${socket.id} rejected: not in a room`);
        return;
      }

      const targetCheck = validateUserId(targetUserId);
      if (!targetCheck.valid) {
        logger.warn(
          `signal-ice-candidate rejected for ${socket.id}: ${targetCheck.error}`
        );
        socket.emit('error', { message: targetCheck.error });
        return;
      }

      // ICE candidate validation
      const iceCheck = validateIceCandidate(candidate);
      if (!iceCheck.valid) {
        logger.warn(`signal-ice-candidate rejected for ${socket.id}: ${iceCheck.error}`);
        socket.emit('error', { message: iceCheck.error });
        return;
      }

      const targetSocket = findSocketByUserId(io, socket.data.roomId, targetCheck.value);
      if (!targetSocket) {
        logger.warn(
          `signal-ice-candidate: target user ${targetCheck.value} not found in room ${socket.data.roomId}`
        );
        return;
      }

      targetSocket.emit('signal-ice-candidate', {
        from: socket.data.userId,
        candidate,
      });

      logger.debug(
        `signal-ice-candidate relayed: ${socket.data.userId} -> ${targetCheck.value}`
      );
    } catch (err) {
      logger.error(`signal-ice-candidate handler error for ${socket.id}:`, err.message);
    }
  });

  // --------------------------------------------------------
  // chat-message
  // --------------------------------------------------------
  socket.on('chat-message', (data, callback) => {
    handleChatMessage(socket, io, data, callback);
  });

  // --------------------------------------------------------
  // disconnect
  // --------------------------------------------------------
  socket.on('disconnect', (reason) => {
    logger.info(`User disconnected: ${socket.id} - Reason: ${reason}`);
    handleLeaveRoom(socket, io, { silent: false });
  });

  // --------------------------------------------------------
  // error
  // --------------------------------------------------------
  socket.on('error', (error) => {
    logger.error(`Socket error for ${socket.id}:`, error.message);
  });
}

/**
 * Socket'i odadan çıkar (internal helper)
 * @param {import('socket.io').Socket} socket
 * @param {import('socket.io').Server} io
 * @param {{ silent?: boolean }} options
 */
function handleLeaveRoom(socket, io, options = {}) {
  const { roomId, userId } = socket.data;
  if (!roomId || !userId) return;

  const result = leaveRoom(roomId, userId);
  if (!result.success) return;

  // Socket.io room'dan leave
  socket.leave(roomId);

  if (!options.silent) {
    logger.info(`User ${userId} left room ${roomId} (socket ${socket.id})`);
  }

  // Oda hala varsa kalanlara broadcast et
  if (!result.roomEmpty) {
    broadcastRoomUsers(io, roomId);
    const users = getUsersInRoom(roomId);
    const safeUsers = users.map((u) => ({
      userId: u.userId,
      gender: u.gender,
      avatar: u.avatar,
      lastSeen: u.lastSeen,
      isOnline: u.isOnline,
    }));
    io.to(roomId).emit('user-left', {
      roomId,
      userId,
      users: safeUsers,
    });
  }

  // Socket data temizle
  socket.data.roomId = null;
  socket.data.userId = null;
}

/**
 * Aynı oda içindeki userId'ye ait socket'i bul
 * @param {import('socket.io').Server} io
 * @param {string} roomId
 * @param {string} userId
 * @returns {import('socket.io').Socket|null}
 */
function findSocketByUserId(io, roomId, userId) {
  const user = findUserBySocketIdForRoom(roomId, userId);
  if (!user) return null;
  return io.sockets.sockets.get(user.socketId) || null;
}

/**
 * Belirli odadaki userId'yi bul
 * @param {string} roomId
 * @param {string} userId
 * @returns {{ socketId: string, userId: string }|null}
 */
function findUserBySocketIdForRoom(roomId, userId) {
  // findUserBySocketId yerine doğrudan room users'tan ara
  const users = getUsersInRoom(roomId);
  return users.find((u) => u.userId === userId) || null;
}
