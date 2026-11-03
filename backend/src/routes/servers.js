/**
 * Server Management Routes
 * Sunucu oluşturma, listeleme, düzenleme, silme ve transfer
 * 
 * POST /api/servers - Yeni sunucu oluştur
 * GET /api/servers - Kullanıcının sunucularını listele
 * GET /api/servers/:id - Sunucu detayları (kanallar + üyeler)
 * PUT /api/servers/:id - Sunucu güncelle (owner only)
 * DELETE /api/servers/:id - Sunucu sil (owner only)
 * POST /api/servers/:id/transfer - Ownership transfer (owner only)
 */

import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { logger } from '../utils/logger.js';
import { authenticateToken } from '../middleware/auth.js';
import { DEFAULT_PERMISSIONS, toString as permToString } from '../utils/permissions.js';

const router = Router();

// Tüm route'lar JWT authentication gerektirir
router.use(authenticateToken);

/**
 * Validate server name
 * @param {string} name
 * @returns {{ valid: boolean, error?: string, value?: string }}
 */
function validateServerName(name) {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Server name is required and must be a string' };
  }
  const trimmed = name.trim();
  if (trimmed.length < 3) {
    return { valid: false, error: 'Server name must be at least 3 characters' };
  }
  if (trimmed.length > 50) {
    return { valid: false, error: 'Server name must be at most 50 characters' };
  }
  return { valid: true, value: trimmed };
}

/**
 * Validate server description
 * @param {string} description
 * @returns {{ valid: boolean, error?: string, value?: string }}
 */
function validateDescription(description) {
  if (description === null || description === undefined) {
    return { valid: true, value: null };
  }
  if (typeof description !== 'string') {
    return { valid: false, error: 'Description must be a string' };
  }
  const trimmed = description.trim();
  if (trimmed.length > 500) {
    return { valid: false, error: 'Description must be at most 500 characters' };
  }
  return { valid: true, value: trimmed || null };
}

/**
 * Validate icon (URL or emoji)
 * @param {string} icon
 * @returns {{ valid: boolean, error?: string, value?: string }}
 */
function validateIcon(icon) {
  if (icon === null || icon === undefined) {
    return { valid: true, value: null };
  }
  if (typeof icon !== 'string') {
    return { valid: false, error: 'Icon must be a string (URL or emoji)' };
  }
  if (icon.length > 500) {
    return { valid: false, error: 'Icon must be at most 500 characters' };
  }
  return { valid: true, value: icon };
}

/**
 * POST /api/servers
 * Yeni sunucu oluştur
 * Otomatik olarak:
 *  - Owner'ı member olarak ekler
 *  - Varsayılan kanallar oluşturur (general TEXT, Voice Chat VOICE)
 *  - Varsayılan @everyone rolü oluşturur
 */
router.post('/', async (req, res) => {
  try {
    const { name, icon, description } = req.body || {};

    // Validate inputs
    const nameCheck = validateServerName(name);
    if (!nameCheck.valid) {
      return res.status(400).json({ success: false, error: nameCheck.error });
    }

    const iconCheck = validateIcon(icon);
    if (!iconCheck.valid) {
      return res.status(400).json({ success: false, error: iconCheck.error });
    }

    const descCheck = validateDescription(description);
    if (!descCheck.valid) {
      return res.status(400).json({ success: false, error: descCheck.error });
    }

    // Transaction: Server + Member + Channels + Role
    const result = await prisma.$transaction(async (tx) => {
      // 1. Sunucu oluştur
      const server = await tx.server.create({
        data: {
          name: nameCheck.value,
          icon: iconCheck.value,
          description: descCheck.value,
          ownerId: req.user.id,
        },
      });

      // 2. Owner'ı member olarak ekle
      const member = await tx.serverMember.create({
        data: {
          serverId: server.id,
          userId: req.user.id,
        },
      });

      // 3. Varsayılan @everyone rolü oluştur
      const everyoneRole = await tx.role.create({
        data: {
          serverId: server.id,
          name: '@everyone',
          color: '#99AAB5',
          permissions: permToString(DEFAULT_PERMISSIONS),
          position: 0,
          hoist: false,
          mentionable: false,
        },
      });

      // 4. Role'ü owner'a ata
      await tx.userRole.create({
        data: {
          memberId: member.id,
          roleId: everyoneRole.id,
        },
      });

      // 5. Varsayılan kanallar oluştur
      const textChannel = await tx.channel.create({
        data: {
          serverId: server.id,
          name: 'general',
          type: 'TEXT',
          topic: 'General discussion',
          position: 0,
        },
      });

      const voiceChannel = await tx.channel.create({
        data: {
          serverId: server.id,
          name: 'Voice Chat',
          type: 'VOICE',
          topic: null,
          position: 1,
        },
      });

      return { server, member, everyoneRole, textChannel, voiceChannel };
    });

    logger.info(`Server created: "${result.server.name}" (${result.server.id}) by ${req.user.username}#${req.user.discriminator}`);

    // Fetch full server data for response
    const fullServer = await prisma.server.findUnique({
      where: { id: result.server.id },
      include: {
        channels: { orderBy: { position: 'asc' } },
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                discriminator: true,
                displayName: true,
                avatar: true,
                status: true,
              },
            },
            roles: {
              include: { role: true },
            },
          },
        },
        roles: { orderBy: { position: 'desc' } },
        owner: {
          select: {
            id: true,
            username: true,
            discriminator: true,
          },
        },
      },
    });

    return res.status(201).json({
      success: true,
      server: formatServerDetail(fullServer),
    });
  } catch (error) {
    logger.error('Create server error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to create server',
    });
  }
});

/**
 * GET /api/servers
 * Kullanıcının üye olduğu sunucuları listele
 */
router.get('/', async (req, res) => {
  try {
    // Super admin ise TÜM sunucuları döndür
    if (req.user.superAdmin) {
      const allServers = await prisma.server.findMany({
        select: {
          id: true,
          name: true,
          icon: true,
          createdAt: true,
          _count: {
            select: { members: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      const servers = allServers.map((s) => ({
        id: s.id,
        name: s.name,
        icon: s.icon,
        memberCount: s._count.members,
        joinedAt: s.createdAt,
        createdAt: s.createdAt,
      }));

      return res.status(200).json({ success: true, servers, superAdmin: true });
    }

    // Normal kullanıcı: sadece üye olduğu sunucular
    const memberships = await prisma.serverMember.findMany({
      where: { userId: req.user.id },
      include: {
        server: {
          select: {
            id: true,
            name: true,
            icon: true,
            createdAt: true,
            _count: {
              select: { members: true },
            },
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    const servers = memberships.map((m) => ({
      id: m.server.id,
      name: m.server.name,
      icon: m.server.icon,
      memberCount: m.server._count.members,
      joinedAt: m.joinedAt,
      createdAt: m.server.createdAt,
    }));

    return res.status(200).json({
      success: true,
      servers,
    });
  } catch (error) {
    logger.error('Get servers error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch servers',
    });
  }
});

/**
 * GET /api/servers/:id
 * Sunucu detayları (kanallar + üyeler + roller)
 * Sadece member'lar erişebilir
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Sunucuyu bul
    const server = await prisma.server.findUnique({
      where: { id },
      include: {
        channels: { orderBy: { position: 'asc' } },
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                discriminator: true,
                displayName: true,
                avatar: true,
                status: true,
              },
            },
            roles: {
              include: { role: true },
            },
          },
        },
        roles: { orderBy: { position: 'desc' } },
        owner: {
          select: {
            id: true,
            username: true,
            discriminator: true,
          },
        },
      },
    });

    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found',
      });
    }

    // Member kontrolü (super_admin bypass)
    const isMember = server.members.some((m) => m.userId === req.user.id);
    if (!isMember && !req.user.superAdmin) {
      return res.status(403).json({
        success: false,
        error: 'You are not a member of this server',
      });
    }

    return res.status(200).json({
      success: true,
      server: formatServerDetail(server),
    });
  } catch (error) {
    logger.error('Get server detail error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch server',
    });
  }
});

/**
 * PUT /api/servers/:id
 * Sunucu güncelle (owner only)
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, icon, description } = req.body || {};

    // Sunucuyu bul
    const server = await prisma.server.findUnique({
      where: { id },
    });

    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found',
      });
    }

    // Owner kontrolü
    if (server.ownerId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Only the server owner can update the server',
      });
    }

    // Build update data
    const updateData = {};

    if (name !== undefined) {
      const nameCheck = validateServerName(name);
      if (!nameCheck.valid) {
        return res.status(400).json({ success: false, error: nameCheck.error });
      }
      updateData.name = nameCheck.value;
    }

    if (icon !== undefined) {
      const iconCheck = validateIcon(icon);
      if (!iconCheck.valid) {
        return res.status(400).json({ success: false, error: iconCheck.error });
      }
      updateData.icon = iconCheck.value;
    }

    if (description !== undefined) {
      const descCheck = validateDescription(description);
      if (!descCheck.valid) {
        return res.status(400).json({ success: false, error: descCheck.error });
      }
      updateData.description = descCheck.value;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update',
      });
    }

    // Update server
    const updatedServer = await prisma.server.update({
      where: { id },
      data: updateData,
      include: {
        channels: { orderBy: { position: 'asc' } },
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                discriminator: true,
                displayName: true,
                avatar: true,
                status: true,
              },
            },
            roles: {
              include: { role: true },
            },
          },
        },
        roles: { orderBy: { position: 'desc' } },
        owner: {
          select: {
            id: true,
            username: true,
            discriminator: true,
          },
        },
      },
    });

    logger.info(`Server updated: "${updatedServer.name}" (${id}) by ${req.user.username}#${req.user.discriminator}`);

    return res.status(200).json({
      success: true,
      server: formatServerDetail(updatedServer),
    });
  } catch (error) {
    logger.error('Update server error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to update server',
    });
  }
});

/**
 * DELETE /api/servers/:id
 * Sunucu sil (owner only)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Sunucuyu bul
    const server = await prisma.server.findUnique({
      where: { id },
    });

    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found',
      });
    }

    // Owner kontrolü
    if (server.ownerId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Only the server owner can delete the server',
      });
    }

    // Sunucuyu sil (cascade ile tüm member, channel, role, invite silinir)
    await prisma.server.delete({
      where: { id },
    });

    logger.info(`Server deleted: "${server.name}" (${id}) by ${req.user.username}#${req.user.discriminator}`);

    return res.status(200).json({
      success: true,
      message: 'Server deleted successfully',
    });
  } catch (error) {
    logger.error('Delete server error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete server',
    });
  }
});

/**
 * POST /api/servers/:id/transfer
 * Ownership transfer (owner only)
 * Yeni owner mevcut member olmalı
 */
router.post('/:id/transfer', async (req, res) => {
  try {
    const { id } = req.params;
    const { newOwnerId } = req.body || {};

    if (!newOwnerId || typeof newOwnerId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'newOwnerId is required',
      });
    }

    // Kendine transfer edemez
    if (newOwnerId === req.user.id) {
      return res.status(400).json({
        success: false,
        error: 'You cannot transfer ownership to yourself',
      });
    }

    // Sunucuyu bul
    const server = await prisma.server.findUnique({
      where: { id },
    });

    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found',
      });
    }

    // Owner kontrolü
    if (server.ownerId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Only the server owner can transfer ownership',
      });
    }

    // Yeni owner member mı kontrol et
    const newOwnerMember = await prisma.serverMember.findFirst({
      where: {
        serverId: id,
        userId: newOwnerId,
      },
    });

    if (!newOwnerMember) {
      return res.status(400).json({
        success: false,
        error: 'New owner must be a member of the server',
      });
    }

    // Transfer et
    await prisma.server.update({
      where: { id },
      data: { ownerId: newOwnerId },
    });

    logger.info(`Server ownership transferred: "${server.name}" (${id}) from ${req.user.username} to user ${newOwnerId}`);

    return res.status(200).json({
      success: true,
      message: 'Server ownership transferred successfully',
    });
  } catch (error) {
    logger.error('Transfer server error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to transfer server ownership',
    });
  }
});

/**
 * Format server detail for API response
 */
function formatServerDetail(server) {
  return {
    id: server.id,
    name: server.name,
    icon: server.icon,
    description: server.description,
    ownerId: server.ownerId,
    createdAt: server.createdAt,
    owner: server.owner
      ? {
          id: server.owner.id,
          username: server.owner.username,
          discriminator: server.owner.discriminator,
        }
      : null,
    channels: server.channels.map((ch) => ({
      id: ch.id,
      name: ch.name,
      type: ch.type,
      topic: ch.topic,
      nsfw: ch.nsfw,
      slowmode: ch.slowmode,
      position: ch.position,
      parentId: ch.parentId,
    })),
    members: server.members.map((m) => ({
      id: m.id,
      userId: m.userId,
      username: m.user.username,
      discriminator: m.user.discriminator,
      displayName: m.user.displayName,
      avatar: m.user.avatar,
      status: m.user.status,
      joinedAt: m.joinedAt,
      nickname: m.nickname,
      roles: m.roles.map((ur) => ({
        id: ur.role.id,
        name: ur.role.name,
        color: ur.role.color,
        position: ur.role.position,
      })),
    })),
    roles: server.roles.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      permissions: r.permissions,
      position: r.position,
      hoist: r.hoist,
      mentionable: r.mentionable,
    })),
    memberCount: server.members.length,
  };
}

export default router;
