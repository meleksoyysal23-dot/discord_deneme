/**
 * Typing Indicator Socket Handler (FAZ 4)
 * Handles typing:start and typing:stop events
 * Broadcasts typing state to channel members
 */

import prisma from '../lib/prisma.js';
import { logger } from '../utils/logger.js';

/**
 * Register typing indicator handlers for a socket
 * @param {import('socket.io').Socket} socket
 * @param {import('socket.io').Server} io
 */
export function registerTypingHandlers(socket, io) {
  /**
   * typing:start - User started typing in a channel
   * Payload: { channelId: string }
   */
  socket.on('typing:start', async (data) => {
    try {
      if (!socket.userId) {
        logger.warn(`typing:start rejected for ${socket.id}: not authenticated`);
        return;
      }

      const { channelId } = data || {};

      if (!channelId || typeof channelId !== 'string') {
        logger.warn(`typing:start rejected for ${socket.userId}: invalid channelId`);
        return;
      }

      // Verify channel exists and user is a member of the server
      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        select: { id: true, serverId: true, type: true },
      });

      if (!channel) {
        logger.warn(`typing:start rejected for ${socket.userId}: channel ${channelId} not found`);
        return;
      }

      // Only text-like channels support typing indicators
      if (channel.type !== 'TEXT' && channel.type !== 'ANNOUNCEMENT' && channel.type !== 'FORUM') {
        return;
      }

      // Verify membership
      const member = await prisma.serverMember.findFirst({
        where: {
          serverId: channel.serverId,
          userId: socket.userId,
        },
      });

      if (!member) {
        logger.warn(`typing:start rejected for ${socket.userId}: not a member of server ${channel.serverId}`);
        return;
      }

      // Join the channel room if not already joined
      socket.join(channelId);

      // Broadcast to other channel members
      socket.to(channelId).emit('typing:update', {
        channelId,
        userId: socket.userId,
        username: socket.user.username,
        discriminator: socket.user.discriminator,
        displayName: socket.user.displayName,
        avatar: socket.user.avatar,
        isTyping: true,
      });
    } catch (error) {
      logger.error(`typing:start error for ${socket.id}:`, error.message);
    }
  });

  /**
   * typing:stop - User stopped typing in a channel
   * Payload: { channelId: string }
   */
  socket.on('typing:stop', async (data) => {
    try {
      if (!socket.userId) return;

      const { channelId } = data || {};

      if (!channelId || typeof channelId !== 'string') return;

      // Broadcast stop event (no need to re-verify membership - low risk)
      socket.to(channelId).emit('typing:update', {
        channelId,
        userId: socket.userId,
        username: socket.user.username,
        discriminator: socket.user.discriminator,
        isTyping: false,
      });
    } catch (error) {
      logger.error(`typing:stop error for ${socket.id}:`, error.message);
    }
  });

  /**
   * channel:join - User joins a channel room (for receiving broadcasts)
   * Payload: { channelId: string }
   */
  socket.on('channel:join', async (data) => {
    try {
      if (!socket.userId) return;

      const { channelId } = data || {};
      if (!channelId || typeof channelId !== 'string') return;

      // Verify membership before joining room
      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        select: { serverId: true },
      });

      if (!channel) return;

      const member = await prisma.serverMember.findFirst({
        where: {
          serverId: channel.serverId,
          userId: socket.userId,
        },
      });

      if (!member) return;

      socket.join(channelId);
      logger.info(`Socket ${socket.id} (${socket.user.username}) joined channel room ${channelId}`);
    } catch (error) {
      logger.error(`channel:join error for ${socket.id}:`, error.message);
    }
  });

  /**
   * channel:leave - User leaves a channel room
   * Payload: { channelId: string }
   */
  socket.on('channel:leave', (data) => {
    try {
      const { channelId } = data || {};
      if (!channelId) return;

      socket.leave(channelId);
    } catch (error) {
      logger.error(`channel:leave error for ${socket.id}:`, error.message);
    }
  });
}
