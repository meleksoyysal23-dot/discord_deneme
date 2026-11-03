/**
 * Invite System Routes
 * Davet linki oluşturma, listeleme, silme ve davet ile katılma
 * 
 * POST /api/servers/:id/invites - Davet oluştur (member with MANAGE_INVITES)
 * GET /api/servers/:id/invites - Davetleri listele (owner/admin only)
 * GET /api/invites/:code - Davet bilgisi al (authenticated)
 * DELETE /api/invites/:code - Davet sil (creator or owner)
 * POST /api/invites/:code/join - Davet ile sunucuya katıl
 */

import { Router } from 'express';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { logger } from '../utils/logger.js';
import { authenticateToken } from '../middleware/auth.js';
import { PERMISSIONS, hasPermission, isOwner } from '../utils/permissions.js';

const router = Router();

// Tüm route'lar JWT authentication gerektirir
router.use(authenticateToken);

/**
 * Generate random invite code (8 karakter alphanumeric)
 * @returns {string}
 */
function generateInviteCode() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

/**
 * Helper: Get member with roles for a server
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
 * Check if member can manage invites
 */
function canManageInvites(server, member) {
  if (isOwner(server, member.userId)) return true;
  const roles = member.roles.map((ur) => ur.role);
  return hasPermission(roles, PERMISSIONS.MANAGE_INVITES) ||
         hasPermission(roles, PERMISSIONS.ADMINISTRATOR);
}

/**
 * POST /api/servers/:id/invites
 * Davet linki oluştur (member with MANAGE_INVITES permission)
 */
router.post('/servers/:id/invites', async (req, res) => {
  try {
    const { id: serverId } = req.params;
    const { maxAge, maxUses } = req.body || {};

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
    if (!canManageInvites(server, member)) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to create invites',
      });
    }

    // Validate maxAge
    let maxAgeValue = null;
    if (maxAge !== undefined && maxAge !== null) {
      if (typeof maxAge !== 'number' || !Number.isInteger(maxAge) || maxAge < 0) {
        return res.status(400).json({
          success: false,
          error: 'maxAge must be a non-negative integer (seconds) or null',
        });
      }
      if (maxAge > 604800) { // 7 gün
        return res.status(400).json({
          success: false,
          error: 'maxAge must be at most 604800 seconds (7 days)',
        });
      }
      maxAgeValue = maxAge > 0 ? maxAge : null;
    }

    // Validate maxUses
    let maxUsesValue = null;
    if (maxUses !== undefined && maxUses !== null) {
      if (typeof maxUses !== 'number' || !Number.isInteger(maxUses) || maxUses < 0) {
        return res.status(400).json({
          success: false,
          error: 'maxUses must be a non-negative integer or null',
        });
      }
      if (maxUses > 1000) {
        return res.status(400).json({
          success: false,
          error: 'maxUses must be at most 1000',
        });
      }
      maxUsesValue = maxUses > 0 ? maxUses : null;
    }

    // Calculate expiresAt
    let expiresAt = null;
    if (maxAgeValue) {
      expiresAt = new Date(Date.now() + maxAgeValue * 1000);
    }

    // Generate unique invite code (retry if collision)
    let code;
    let attempts = 0;
    const maxAttempts = 5;
    
    do {
      code = generateInviteCode();
      const existing = await prisma.invite.findUnique({ where: { code } });
      if (!existing) break;
      attempts++;
    } while (attempts < maxAttempts);

    if (attempts >= maxAttempts) {
      return res.status(500).json({
        success: false,
        error: 'Failed to generate unique invite code, please try again',
      });
    }

    // Create invite
    const invite = await prisma.invite.create({
      data: {
        serverId,
        code,
        creatorId: req.user.id,
        maxAge: maxAgeValue,
        maxUses: maxUsesValue,
        uses: 0,
        expiresAt,
      },
    });

    logger.info(`Invite created: ${code} for server ${serverId} by ${req.user.username}#${req.user.discriminator}`);

    return res.status(201).json({
      success: true,
      invite: {
        code: invite.code,
        url: `https://vibe-voice.app/invite/${invite.code}`,
        serverId: invite.serverId,
        serverName: server.name,
        expiresAt: invite.expiresAt,
        maxUses: invite.maxUses,
        uses: invite.uses,
        createdAt: invite.createdAt,
      },
    });
  } catch (error) {
    logger.error('Create invite error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to create invite',
    });
  }
});

/**
 * GET /api/servers/:id/invites
 * Sunucu davetlerini listele (owner/admin only)
 */
router.get('/servers/:id/invites', async (req, res) => {
  try {
    const { id: serverId } = req.params;

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

    // Owner veya MANAGE_INVITES yetkisi gerekli
    if (!canManageInvites(server, member)) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to view invites',
      });
    }

    // Davetleri getir
    const invites = await prisma.invite.findMany({
      where: { serverId },
      orderBy: { createdAt: 'desc' },
    });

    const formattedInvites = invites.map((inv) => ({
      code: inv.code,
      url: `https://vibe-voice.app/invite/${inv.code}`,
      creatorId: inv.creatorId,
      expiresAt: inv.expiresAt,
      maxAge: inv.maxAge,
      maxUses: inv.maxUses,
      uses: inv.uses,
      createdAt: inv.createdAt,
    }));

    return res.status(200).json({
      success: true,
      invites: formattedInvites,
    });
  } catch (error) {
    logger.error('Get invites error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch invites',
    });
  }
});

/**
 * GET /api/invites/:code
 * Davet bilgisi al (authenticated)
 * Modal'da sunucu adı, icon, description gösterimi için
 */
router.get('/invites/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const userId = req.user.id;

    // Daveti bul (sunucu bilgisiyle birlikte)
    const invite = await prisma.invite.findUnique({
      where: { code },
      include: {
        server: {
          select: {
            id: true,
            name: true,
            icon: true,
            description: true,
            members: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
    });

    if (!invite) {
      return res.status(404).json({
        success: false,
        error: 'Davet kodu bulunamadı',
      });
    }

    // Süresi dolmuş mu kontrol et
    if (invite.expiresAt && new Date() > invite.expiresAt) {
      return res.status(410).json({
        success: false,
        error: 'Bu davetin süresi dolmuş',
      });
    }

    // Maksimum kullanım sayısına ulaşılmış mı kontrol et
    if (invite.maxUses !== null && invite.uses >= invite.maxUses) {
      return res.status(410).json({
        success: false,
        error: 'Bu davet maksimum kullanım sayısına ulaşmış',
      });
    }

    // Kullanıcı zaten üye mi?
    const isAlreadyMember = invite.server.members.some((m) => m.userId === userId);

    return res.status(200).json({
      success: true,
      invite: {
        code: invite.code,
        server: {
          id: invite.server.id,
          name: invite.server.name,
          icon: invite.server.icon,
          description: invite.server.description,
          memberCount: invite.server.members.length,
        },
        expiresAt: invite.expiresAt,
        maxUses: invite.maxUses,
        uses: invite.uses,
        isAlreadyMember,
      },
    });
  } catch (error) {
    logger.error('Get invite info error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Sunucu hatası',
    });
  }
});

/**
 * DELETE /api/invites/:code
 * Davet sil (creator or server owner)
 */
router.delete('/invites/:code', async (req, res) => {
  try {
    const { code } = req.params;

    // Daveti bul
    const invite = await prisma.invite.findUnique({
      where: { code },
      include: { server: true },
    });

    if (!invite) {
      return res.status(404).json({
        success: false,
        error: 'Invite not found',
      });
    }

    // Creator veya server owner kontrolü
    const isCreator = invite.creatorId === req.user.id;
    const isServerOwner = invite.server.ownerId === req.user.id;

    if (!isCreator && !isServerOwner) {
      return res.status(403).json({
        success: false,
        error: 'You can only delete invites you created or for servers you own',
      });
    }

    // Daveti sil
    await prisma.invite.delete({
      where: { code },
    });

    logger.info(`Invite deleted: ${code} by ${req.user.username}#${req.user.discriminator}`);

    return res.status(200).json({
      success: true,
      message: 'Invite deleted successfully',
    });
  } catch (error) {
    logger.error('Delete invite error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete invite',
    });
  }
});

/**
 * POST /api/invites/:code/join
 * Davet kodu ile sunucuya katıl
 */
router.post('/invites/:code/join', async (req, res) => {
  try {
    const { code } = req.params;

    // Daveti bul
    const invite = await prisma.invite.findUnique({
      where: { code },
      include: {
        server: {
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
        },
      },
    });

    if (!invite) {
      return res.status(404).json({
        success: false,
        error: 'Invite not found',
      });
    }

    // Süre kontrolü (expired?)
    if (invite.expiresAt && new Date() > invite.expiresAt) {
      return res.status(410).json({
        success: false,
        error: 'This invite has expired',
      });
    }

    // Kullanım sayısı kontrolü
    if (invite.maxUses !== null && invite.uses >= invite.maxUses) {
      return res.status(410).json({
        success: false,
        error: 'This invite has reached its maximum uses',
      });
    }

    // Zaten member mı kontrol et
    const existingMember = await prisma.serverMember.findFirst({
      where: {
        serverId: invite.serverId,
        userId: req.user.id,
      },
    });

    if (existingMember) {
      return res.status(409).json({
        success: false,
        error: 'You are already a member of this server',
      });
    }

    // Transaction: Member ekle + Invite uses artır + @everyone role ata
    const result = await prisma.$transaction(async (tx) => {
      // Member ekle
      const member = await tx.serverMember.create({
        data: {
          serverId: invite.serverId,
          userId: req.user.id,
        },
      });

      // @everyone rolünü bul ve ata
      const everyoneRole = await tx.role.findFirst({
        where: {
          serverId: invite.serverId,
          name: '@everyone',
        },
      });

      if (everyoneRole) {
        await tx.userRole.create({
          data: {
            memberId: member.id,
            roleId: everyoneRole.id,
          },
        });
      }

      // Invite uses artır
      await tx.invite.update({
        where: { code },
        data: { uses: { increment: 1 } },
      });

      return member;
    });

    logger.info(`User joined server via invite: ${req.user.username}#${req.user.discriminator} joined "${invite.server.name}" via ${code}`);

    // Format server response (reuse formatServerDetail logic)
    const server = invite.server;
    const serverResponse = {
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
      memberCount: server.members.length + 1, // +1 for the new member
    };

    return res.status(200).json({
      success: true,
      server: serverResponse,
    });
  } catch (error) {
    logger.error('Join via invite error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to join server',
    });
  }
});

export default router;
