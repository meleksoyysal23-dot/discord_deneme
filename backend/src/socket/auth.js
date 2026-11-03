/**
 * Socket.io Authentication Middleware
 * JWT verification for WebSocket connections
 */

import { verifyToken } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';
import { logger } from '../utils/logger.js';

/**
 * Socket.io authentication middleware
 * Verifies JWT token from socket handshake
 * @param {import('socket.io').Socket} socket
 * @param {function} next
 */
export async function socketAuth(socket, next) {
  try {
    const token = socket.handshake.auth.token;

    if (!token) {
      logger.warn(`Socket connection rejected: no token provided (${socket.id})`);
      return next(new Error('Authentication token required'));
    }

    // Verify JWT token
    const decoded = await verifyToken(token);

    if (!decoded || !decoded.userId) {
      logger.warn(`Socket connection rejected: invalid token payload (${socket.id})`);
      return next(new Error('Invalid authentication token'));
    }

    // Fetch user from database
    const user = await prisma.user.findUnique({
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
}

/**
 * Broadcast user status change to friends
 * @param {import('socket.io').Server} io
 * @param {string} userId
 * @param {string} status
 * @param {string|null} customStatus
 */
export async function broadcastStatusChange(io, userId, status, customStatus) {
  try {
    // Find all friends of this user
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { userId: userId, status: 'ACCEPTED' },
          { friendId: userId, status: 'ACCEPTED' },
        ],
      },
      select: {
        userId: true,
        friendId: true,
      },
    });

    // Get friend user IDs (exclude current user)
    const friendIds = friendships.map((f) =>
      f.userId === userId ? f.friendId : f.userId
    );

    if (friendIds.length === 0) {
      return;
    }

    // Find all connected sockets for these friends
    const connectedSockets = await io.fetchSockets();
    const friendSockets = connectedSockets.filter((socket) =>
      friendIds.includes(socket.userId)
    );

    // Broadcast status change to each friend
    const statusData = {
      userId,
      status,
      customStatus,
      timestamp: new Date().toISOString(),
    };

    friendSockets.forEach((socket) => {
      socket.emit('friend:status:change', statusData);
    });

    logger.info(
      `Status broadcast: ${userId} -> ${friendSockets.length} friends (status: ${status})`
    );
  } catch (error) {
    logger.error('Status broadcast error:', error.message);
  }
}

/**
 * Broadcast friend request notification
 * @param {import('socket.io').Server} io
 * @param {string} toUserId
 * @param {object} fromUser
 * @param {string} requestId
 */
export async function broadcastFriendRequest(io, toUserId, fromUser, requestId) {
  try {
    // Find connected sockets for the target user
    const connectedSockets = await io.fetchSockets();
    const targetSockets = connectedSockets.filter(
      (socket) => socket.userId === toUserId
    );

    if (targetSockets.length === 0) {
      logger.debug(`Friend request notification skipped: user ${toUserId} not connected`);
      return;
    }

    const notificationData = {
      requestId,
      from: {
        id: fromUser.id,
        username: fromUser.username,
        discriminator: fromUser.discriminator,
        displayName: fromUser.displayName,
        avatar: fromUser.avatar,
      },
      timestamp: new Date().toISOString(),
    };

    targetSockets.forEach((socket) => {
      socket.emit('friend:request:incoming', notificationData);
    });

    logger.info(
      `Friend request notification sent: ${fromUser.username}#${fromUser.discriminator} -> ${toUserId} (${targetSockets.length} sockets)`
    );
  } catch (error) {
    logger.error('Friend request broadcast error:', error.message);
  }
}
