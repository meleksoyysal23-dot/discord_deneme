/**
 * Channel Management Routes
 * Kanal oluşturma, düzenleme, silme ve mesaj listeleme
 * 
 * POST /api/servers/:id/channels - Yeni kanal oluştur (admin only)
 * PUT /api/channels/:id - Kanal güncelle (admin only)
 * DELETE /api/channels/:id - Kanal sil (admin only)
 * GET /api/channels/:id/messages - Kanal mesajlarını listele (member only)
 */

import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { logger } from '../utils/logger.js';
import { authenticateToken } from '../middleware/auth.js';
import { PERMISSIONS, hasPermission, isOwner } from '../utils/permissions.js';

const router = Router();

// Tüm route'lar JWT authentication gerektirir
router.use(authenticateToken);

// Valid channel types
const VALID_CHANNEL_TYPES = ['TEXT', 'VOICE', 'ANNOUNCEMENT', 'STAGE', 'FORUM', 'MEDIA'];

/**
 * Validate channel name
 * 1-50 karakter, lowercase, spaces → dashes
 * @param {string} name
 * @returns {{ valid: boolean, error?: string, value?: string }}
 */
function validateChannelName(name) {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Channel name is required and must be a string' };
  }
  let trimmed = name.trim().toLowerCase();
  if (trimmed.length < 1) {
    return { valid: false, error: 'Channel name must be at least 1 character' };
  }
  if (trimmed.length > 50) {
    return { valid: false, error: 'Channel name must be at most 50 characters' };
  }
  // Spaces → dashes
  trimmed = trimmed.replace(/\s+/g, '-');
  // Only allow alphanumeric, dashes, underscores
  if (!/^[a-z0-9_-]+$/.test(trimmed)) {
    return { valid: false, error: 'Channel name can only contain letters, numbers, hyphens, and underscores' };
  }
  return { valid: true, value: trimmed };
}

/**
 * Validate channel topic
 * @param {string} topic
 * @returns {{ valid: boolean, error?: string, value?: string }}
 */
function validateTopic(topic) {
  if (topic === null || topic === undefined) {
    return { valid: true, value: null };
  }
  if (typeof topic !== 'string') {
    return { valid: false, error: 'Topic must be a string' };
  }
  const trimmed = topic.trim();
  if (trimmed.length > 200) {
    return { valid: false, error: 'Topic must be at most 200 characters' };
  }
  return { valid: true, value: trimmed || null };
}

/**
 * Helper: Get member with roles for a server
 * @param {string} serverId
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
async function getMemberWithRoles(serverId, userId) {
  return prisma.serverMember.findFirst({
    where: { serverId, userId },
    include: {
      roles: {
        include: { role: true },
      },
    },
  });
}

/**
 * Helper: Check if user has admin-level permission for channels
 * Owner has all permissions, otherwise check MANAGE_CHANNELS or ADMINISTRATOR
 */
function canManageChannels(server, member) {
  if (isOwner(server, member.userId)) return true;
  const roles = member.roles.map((ur) => ur.role);
  return hasPermission(roles, PERMISSIONS.MANAGE_CHANNELS) ||
         hasPermission(roles, PERMISSIONS.ADMINISTRATOR);
}

/**
 * POST /api/servers/:id/channels
 * Yeni kanal oluştur (admin only)
 */
router.post('/servers/:id/channels', async (req, res) => {
  try {
    const { id: serverId } = req.params;
    const { name, type, topic, nsfw, slowmode, parentId } = req.body || {};

    // Sunucuyu bul
    const server = await prisma.server.findUnique({
      where: { id: serverId },
    });

    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found',
      });
    }

    // Member kontrolü
    const member = await getMemberWithRoles(serverId, req.user.id);
    if (!member) {
      return res.status(403).json({
        success: false,
        error: 'You are not a member of this server',
      });
    }

    // Permission kontrolü
    if (!canManageChannels(server, member)) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to manage channels',
      });
    }

    // Validate name
    const nameCheck = validateChannelName(name);
    if (!nameCheck.valid) {
      return res.status(400).json({ success: false, error: nameCheck.error });
    }

    // Validate type
    const channelType = type || 'TEXT';
    if (!VALID_CHANNEL_TYPES.includes(channelType)) {
      return res.status(400).json({
        success: false,
        error: `Channel type must be one of: ${VALID_CHANNEL_TYPES.join(', ')}`,
      });
    }

    // Validate topic
    const topicCheck = validateTopic(topic);
    if (!topicCheck.valid) {
      return res.status(400).json({ success: false, error: topicCheck.error });
    }

    // Validate nsfw
    const nsfwValue = typeof nsfw === 'boolean' ? nsfw : false;

    // Validate slowmode
    let slowmodeValue = 0;
    if (slowmode !== undefined && slowmode !== null) {
      if (typeof slowmode !== 'number' || !Number.isInteger(slowmode) || slowmode < 0) {
        return res.status(400).json({
          success: false,
          error: 'Slowmode must be a non-negative integer (seconds)',
        });
      }
      if (slowmode > 21600) {
        return res.status(400).json({
          success: false,
          error: 'Slowmode must be at most 21600 seconds (6 hours)',
        });
      }
      slowmodeValue = slowmode;
    }

    // Validate parentId (kategori)
    let parentIdValue = null;
    if (parentId) {
      const parentChannel = await prisma.channel.findFirst({
        where: { id: parentId, serverId },
      });
      if (!parentChannel) {
        return res.status(400).json({
          success: false,
          error: 'Parent channel not found in this server',
        });
      }
      parentIdValue = parentId;
    }

    // Get next position
    const lastChannel = await prisma.channel.findFirst({
      where: { serverId },
      orderBy: { position: 'desc' },
    });
    const nextPosition = lastChannel ? lastChannel.position + 1 : 0;

    // Create channel
    const channel = await prisma.channel.create({
      data: {
        serverId,
        name: nameCheck.value,
        type: channelType,
        topic: topicCheck.value,
        nsfw: nsfwValue,
        slowmode: slowmodeValue,
        position: nextPosition,
        parentId: parentIdValue,
      },
    });

    logger.info(`Channel created: "${channel.name}" (${channel.type}) in server ${serverId} by ${req.user.username}#${req.user.discriminator}`);

    return res.status(201).json({
      success: true,
      channel: {
        id: channel.id,
        name: channel.name,
        type: channel.type,
        topic: channel.topic,
        nsfw: channel.nsfw,
        slowmode: channel.slowmode,
        position: channel.position,
        parentId: channel.parentId,
        serverId: channel.serverId,
      },
    });
  } catch (error) {
    logger.error('Create channel error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to create channel',
    });
  }
});

/**
 * PUT /api/channels/:id
 * Kanal güncelle (admin only)
 */
router.put('/channels/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, topic, nsfw, slowmode, position } = req.body || {};

    // Kanalı bul
    const channel = await prisma.channel.findUnique({
      where: { id },
      include: { server: true },
    });

    if (!channel) {
      return res.status(404).json({
        success: false,
        error: 'Channel not found',
      });
    }

    // Member kontrolü
    const member = await getMemberWithRoles(channel.serverId, req.user.id);
    if (!member) {
      return res.status(403).json({
        success: false,
        error: 'You are not a member of this server',
      });
    }

    // Permission kontrolü
    if (!canManageChannels(channel.server, member)) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to manage channels',
      });
    }

    // Build update data
    const updateData = {};

    if (name !== undefined) {
      const nameCheck = validateChannelName(name);
      if (!nameCheck.valid) {
        return res.status(400).json({ success: false, error: nameCheck.error });
      }
      updateData.name = nameCheck.value;
    }

    if (topic !== undefined) {
      const topicCheck = validateTopic(topic);
      if (!topicCheck.valid) {
        return res.status(400).json({ success: false, error: topicCheck.error });
      }
      updateData.topic = topicCheck.value;
    }

    if (nsfw !== undefined) {
      if (typeof nsfw !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: 'nsfw must be a boolean',
        });
      }
      updateData.nsfw = nsfw;
    }

    if (slowmode !== undefined) {
      if (typeof slowmode !== 'number' || !Number.isInteger(slowmode) || slowmode < 0) {
        return res.status(400).json({
          success: false,
          error: 'Slowmode must be a non-negative integer (seconds)',
        });
      }
      if (slowmode > 21600) {
        return res.status(400).json({
          success: false,
          error: 'Slowmode must be at most 21600 seconds (6 hours)',
        });
      }
      updateData.slowmode = slowmode;
    }

    if (position !== undefined) {
      if (typeof position !== 'number' || !Number.isInteger(position) || position < 0) {
        return res.status(400).json({
          success: false,
          error: 'Position must be a non-negative integer',
        });
      }
      updateData.position = position;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update',
      });
    }

    // Update channel
    const updatedChannel = await prisma.channel.update({
      where: { id },
      data: updateData,
    });

    logger.info(`Channel updated: "${updatedChannel.name}" (${id}) by ${req.user.username}#${req.user.discriminator}`);

    return res.status(200).json({
      success: true,
      channel: {
        id: updatedChannel.id,
        name: updatedChannel.name,
        type: updatedChannel.type,
        topic: updatedChannel.topic,
        nsfw: updatedChannel.nsfw,
        slowmode: updatedChannel.slowmode,
        position: updatedChannel.position,
        parentId: updatedChannel.parentId,
        serverId: updatedChannel.serverId,
      },
    });
  } catch (error) {
    logger.error('Update channel error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to update channel',
    });
  }
});

/**
 * DELETE /api/channels/:id
 * Kanal sil (admin only)
 */
router.delete('/channels/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Kanalı bul
    const channel = await prisma.channel.findUnique({
      where: { id },
      include: { server: true },
    });

    if (!channel) {
      return res.status(404).json({
        success: false,
        error: 'Channel not found',
      });
    }

    // Member kontrolü
    const member = await getMemberWithRoles(channel.serverId, req.user.id);
    if (!member) {
      return res.status(403).json({
        success: false,
        error: 'You are not a member of this server',
      });
    }

    // Permission kontrolü
    if (!canManageChannels(channel.server, member)) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to manage channels',
      });
    }

    // Kanalı sil (cascade ile mesajlar da silinir)
    await prisma.channel.delete({
      where: { id },
    });

    logger.info(`Channel deleted: "${channel.name}" (${id}) by ${req.user.username}#${req.user.discriminator}`);

    return res.status(200).json({
      success: true,
      message: 'Channel deleted successfully',
    });
  } catch (error) {
    logger.error('Delete channel error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete channel',
    });
  }
});

/**
 * GET /api/channels/:id/messages
 * Kanal mesajlarını listele (member only, pagination destekli)
 * Query params: ?limit=50&before=messageId
 */
router.get('/channels/:id/messages', async (req, res) => {
  try {
    const { id: channelId } = req.params;
    const { limit, before } = req.query;

    // Kanalı bul
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
    });

    if (!channel) {
      return res.status(404).json({
        success: false,
        error: 'Channel not found',
      });
    }

    // Member kontrolü
    const member = await getMemberWithRoles(channel.serverId, req.user.id);
    if (!member) {
      return res.status(403).json({
        success: false,
        error: 'You are not a member of this server',
      });
    }

    // Parse limit
    let messageLimit = 50;
    if (limit) {
      const parsed = parseInt(limit, 10);
      if (isNaN(parsed) || parsed < 1) {
        return res.status(400).json({
          success: false,
          error: 'Limit must be a positive integer',
        });
      }
      messageLimit = Math.min(parsed, 100); // Max 100 mesaj
    }

    // Build where clause
    const where = { channelId };
    if (before) {
      // before messageId - ondan önceki mesajları getir
      const beforeMsg = await prisma.message.findUnique({
        where: { id: before },
        select: { createdAt: true },
      });
      if (beforeMsg) {
        where.createdAt = { lt: beforeMsg.createdAt };
      }
    }

    // Mesajları getir
    const messages = await prisma.message.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            discriminator: true,
            avatar: true,
            displayName: true,
          },
        },
        attachments: true,
        reactions: {
          include: {
            // Reaction modelinde user relation yok, sadece userId var
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: messageLimit,
    });

    // Reverse et (en eski → en yeni)
    const formattedMessages = messages.reverse().map((msg) => ({
      id: msg.id,
      content: msg.content,
      userId: msg.userId,
      createdAt: msg.createdAt,
      editedAt: msg.editedAt,
      pinned: msg.pinned,
      author: {
        id: msg.user.id,
        username: msg.user.username,
        discriminator: msg.user.discriminator,
        avatar: msg.user.avatar,
        displayName: msg.user.displayName,
      },
      attachments: msg.attachments.map((a) => ({
        id: a.id,
        url: a.url,
        filename: a.filename,
        size: a.size,
        mimetype: a.mimetype,
      })),
    }));

    return res.status(200).json({
      success: true,
      messages: formattedMessages,
    });
  } catch (error) {
    logger.error('Get messages error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch messages',
    });
  }
});

export default router;
