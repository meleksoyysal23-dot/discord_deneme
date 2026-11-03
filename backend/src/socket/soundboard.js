/**
 * Soundboard Socket Handlers (FAZ 5)
 * Soundboard play event handler
 */

import prisma from '../lib/prisma.js';
import { logger } from '../utils/logger.js';

/**
 * Register soundboard socket event handlers
 * @param {import('socket.io').Socket} socket - Socket instance
 * @param {import('socket.io').Server} io - Socket.io server instance
 */
export function registerSoundboardHandlers(socket, io) {
  /**
   * soundboard:play event
   * Voice channel'da sound çal
   */
  socket.on('soundboard:play', async (data) => {
    try {
      if (!socket.userId) {
        logger.warn(`soundboard:play rejected for ${socket.id}: not authenticated`);
        return;
      }

      const { soundId, channelId } = data || {};

      if (!soundId || typeof soundId !== 'string') {
        logger.warn(`soundboard:play rejected for ${socket.userId}: invalid soundId`);
        return;
      }

      if (!channelId || typeof channelId !== 'string') {
        logger.warn(`soundboard:play rejected for ${socket.userId}: invalid channelId`);
        return;
      }

      // Sound var mı?
      const sound = await prisma.sound.findUnique({
        where: { id: soundId },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              discriminator: true,
            },
          },
        },
      });
      if (!sound) {
        logger.warn(`soundboard:play rejected for ${socket.userId}: sound ${soundId} not found`);
        return;
      }

      // Channel var mı?
      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        select: { id: true, serverId: true, type: true },
      });
      if (!channel) {
        logger.warn(`soundboard:play rejected for ${socket.userId}: channel ${channelId} not found`);
        return;
      }

      // Voice channel olmalı
      if (channel.type !== 'VOICE') {
        logger.warn(`soundboard:play rejected for ${socket.userId}: channel ${channelId} is not voice`);
        return;
      }

      // Membership kontrolü
      const member = await prisma.serverMember.findFirst({
        where: { serverId: channel.serverId, userId: socket.userId },
      });
      if (!member) {
        logger.warn(`soundboard:play rejected for ${socket.userId}: not a member of server`);
        return;
      }

      // Broadcast to channel
      io.to(channelId).emit('soundboard:play', {
        soundId: sound.id,
        name: sound.name,
        url: sound.url,
        playedBy: {
          id: socket.user.id,
          username: socket.user.username,
          discriminator: socket.user.discriminator,
        },
      });

      logger.info(`Soundboard: ${sound.name} played in channel ${channelId} by ${socket.userId}`);
    } catch (error) {
      logger.error(`soundboard:play error for ${socket.id}:`, error.message);
    }
  });
}