/**
 * Room Manager
 * In-memory oda yönetimi
 * Her oda: { roomId, users: Map<userId, { socketId, userId, joinedAt }>, createdAt }
 */

import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';

// In-memory room store
// Key: roomId (string)
// Value: { roomId, users: Map<userId, { socketId, userId, joinedAt }>, createdAt }
const rooms = new Map();

/**
 * Yeni oda oluştur
 * @param {string} roomId
 * @returns {object} Oda objesi
 */
export function createRoom(roomId) {
  if (rooms.has(roomId)) {
    return rooms.get(roomId);
  }

  const room = {
    roomId,
    users: new Map(),
    createdAt: Date.now(),
  };

  rooms.set(roomId, room);
  logger.info(`Room created: ${roomId}`);
  return room;
}

/**
 * Odaya kullanıcı ekle
 * @param {string} roomId
 * @param {string} userId
 * @param {string} socketId
 * @returns {{ success: boolean, error?: string, room?: object }}
 */
export function joinRoom(roomId, userId, socketId) {
  let room = rooms.get(roomId);

  if (!room) {
    room = createRoom(roomId);
  }

  if (room.users.size >= config.maxRoomSize) {
    return {
      success: false,
      error: `Room is full (max ${config.maxRoomSize} users)`,
    };
  }

  // Aynı userId ile zaten varsa eski socket mapping'i güncelle
  if (room.users.has(userId)) {
    const existing = room.users.get(userId);
    logger.warn(
      `User ${userId} re-joining room ${roomId}, old socket ${existing.socketId} -> new ${socketId}`
    );
  }

  room.users.set(userId, {
    socketId,
    userId,
    joinedAt: Date.now(),
  });

  logger.info(
    `User ${userId} joined room ${roomId} (${room.users.size}/${config.maxRoomSize})`
  );

  return { success: true, room };
}

/**
 * Kullanıcıyı odadan çıkar
 * @param {string} roomId
 * @param {string} userId
 * @returns {{ success: boolean, roomEmpty: boolean, room?: object }}
 */
export function leaveRoom(roomId, userId) {
  const room = rooms.get(roomId);
  if (!room) {
    return { success: false, roomEmpty: false };
  }

  room.users.delete(userId);
  logger.info(
    `User ${userId} left room ${roomId} (${room.users.size}/${config.maxRoomSize})`
  );

  const roomEmpty = room.users.size === 0;

  if (roomEmpty) {
    deleteRoom(roomId);
  }

  return { success: true, roomEmpty, room };
}

/**
 * Odası sil
 * @param {string} roomId
 */
export function deleteRoom(roomId) {
  const existed = rooms.delete(roomId);
  if (existed) {
    logger.info(`Room deleted: ${roomId}`);
  }
  return existed;
}

/**
 * Oda bilgisi al
 * @param {string} roomId
 * @returns {object|undefined}
 */
export function getRoom(roomId) {
  return rooms.get(roomId);
}

/**
 * Odadaki kullanıcı listesini al
 * @param {string} roomId
 * @returns {Array<{ userId: string, socketId: string }>}
 */
export function getUsersInRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return [];

  return Array.from(room.users.values()).map((u) => ({
    userId: u.userId,
    socketId: u.socketId,
  }));
}

/**
 * Oda dolu mu kontrol et
 * @param {string} roomId
 * @returns {boolean}
 */
export function isRoomFull(roomId) {
  const room = rooms.get(roomId);
  if (!room) return false;
  return room.users.size >= config.maxRoomSize;
}

/**
 * Oda var mı kontrol et
 * @param {string} roomId
 * @returns {boolean}
 */
export function roomExists(roomId) {
  return rooms.has(roomId);
}

/**
 * Socket ID'den kullanıcıyı bul (disconnect için)
 * @param {string} socketId
 * @returns {{ roomId: string, userId: string }|null}
 */
export function findUserBySocketId(socketId) {
  for (const [roomId, room] of rooms.entries()) {
    for (const [userId, user] of room.users.entries()) {
      if (user.socketId === socketId) {
        return { roomId, userId };
      }
    }
  }
  return null;
}

/**
 * Tüm odaları getir (REST endpoint için)
 * @returns {Array}
 */
export function getAllRooms() {
  return Array.from(rooms.values()).map((room) => ({
    id: room.roomId,
    userCount: room.users.size,
    maxSize: config.maxRoomSize,
    createdAt: room.createdAt,
  }));
}

/**
 * Aktif oda sayısını getir
 * @returns {number}
 */
export function getRoomCount() {
  return rooms.size;
}
