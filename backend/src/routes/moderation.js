/**
 * Moderation Routes - FAZ 6
 * Ban, kick, timeout management for servers
 */

import express from 'express';
import prisma from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { PERMISSIONS, hasPermission } from '../utils/permissions.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

/**
 * Helper: Get member with roles
 */
async function getMemberWithRoles(serverId, userId) {
  const member = await prisma.serverMember.findUnique({
    where: { serverId_userId: { serverId, userId } },
    include: {
      roles: {
        include: { role: true }
      }
    }
  });
  return member;
}

/**
 * Helper: Check if user has a specific permission in server
 */
async function checkPermission(serverId, userId, requiredPermission) {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { ownerId: true }
  });

  if (!server) return { can: false, reason: 'Server not found', server: null };
  if (server.ownerId === userId) return { can: true, server };

  const member = await getMemberWithRoles(serverId, userId);
  if (!member) return { can: false, reason: 'Not a member', server };

  const roles = member.roles.map(ur => ur.role);
  if (hasPermission(roles, requiredPermission)) {
    return { can: true, server };
  }

  return { can: false, reason: 'Insufficient permissions', server };
}

/**
 * Helper: Check hierarchy - cannot moderate someone with higher/equal role
 */
async function canModerateUser(serverId, moderatorId, targetUserId) {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { ownerId: true }
  });

  if (!server) return { can: false, reason: 'Server not found' };
  
  // Owner can moderate anyone
  if (server.ownerId === moderatorId) {
    // Cannot moderate the owner
    if (server.ownerId === targetUserId) {
      return { can: false, reason: 'Cannot moderate the server owner' };
    }
    return { can: true };
  }

  // Cannot moderate the owner
  if (server.ownerId === targetUserId) {
    return { can: false, reason: 'Cannot moderate the server owner' };
  }

  // Get moderator's highest role position
  const modMember = await getMemberWithRoles(serverId, moderatorId);
  const targetMember = await getMemberWithRoles(serverId, targetUserId);

  if (!modMember) return { can: false, reason: 'Moderator not a member' };
  if (!targetMember) return { can: false, reason: 'Target not a member' };

  const modHighestPosition = modMember.roles.length > 0
    ? Math.max(...modMember.roles.map(ur => ur.role.position))
    : 0;
  
  const targetHighestPosition = targetMember.roles.length > 0
    ? Math.max(...targetMember.roles.map(ur => ur.role.position))
    : 0;

  // Moderator must have strictly higher role position
  if (modHighestPosition <= targetHighestPosition) {
    return { can: false, reason: 'Your role must be higher than the target\'s role' };
  }

  return { can: true };
}

/**
 * POST /api/servers/:id/bans
 * Ban a user from the server
 */
router.post('/servers/:id/bans', authenticateToken, async (req, res) => {
  try {
    const serverId = req.params.id;
    const moderatorId = req.user.id;
    const { userId, reason, deleteMessageDays } = req.body;

    // Validate userId
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    // Validate reason length
    if (reason && typeof reason === 'string' && reason.length > 500) {
      return res.status(400).json({
        success: false,
        error: 'Reason must be at most 500 characters'
      });
    }

    // Validate deleteMessageDays
    const delDays = typeof deleteMessageDays === 'number' ? deleteMessageDays : 0;
    if (delDays < 0 || delDays > 7) {
      return res.status(400).json({
        success: false,
        error: 'deleteMessageDays must be between 0 and 7'
      });
    }

    // Check BAN_MEMBERS permission
    const permCheck = await checkPermission(serverId, moderatorId, PERMISSIONS.BAN_MEMBERS);
    if (!permCheck.can) {
      return res.status(403).json({
        success: false,
        error: permCheck.reason
      });
    }

    // Check hierarchy
    const hierCheck = await canModerateUser(serverId, moderatorId, userId);
    if (!hierCheck.can) {
      return res.status(403).json({
        success: false,
        error: hierCheck.reason
      });
    }

    // Check if target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, discriminator: true }
    });

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check if user is a member
    const member = await prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId, userId } }
    });

    if (!member) {
      return res.status(404).json({
        success: false,
        error: 'User is not a member of this server'
      });
    }

    // Check if already banned
    const existingBan = await prisma.ban.findUnique({
      where: { serverId_userId: { serverId, userId } }
    });

    if (existingBan) {
      return res.status(400).json({
        success: false,
        error: 'User is already banned'
      });
    }

    // Get channels in this server (needed for message deletion)
    let channelIds = [];
    if (delDays > 0) {
      const channels = await prisma.channel.findMany({
        where: { serverId },
        select: { id: true }
      });
      channelIds = channels.map(c => c.id);
    }

    // Execute all write operations in a single transaction for atomicity
    const ban = await prisma.$transaction(async (tx) => {
      // Step 1: Delete messages if requested
      if (delDays > 0 && channelIds.length > 0) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - delDays);

        await tx.message.deleteMany({
          where: {
            userId,
            channelId: { in: channelIds },
            createdAt: { gte: cutoffDate }
          }
        });
      }

      // Step 2: Remove member (cascade removes roles)
      await tx.serverMember.delete({
        where: { serverId_userId: { serverId, userId } }
      });

      // Step 3: Create ban
      const newBan = await tx.ban.create({
        data: {
          serverId,
          userId,
          reason: reason || null,
          bannedById: moderatorId
        },
        include: {
          user: {
            select: { id: true, username: true, discriminator: true, avatar: true }
          },
          bannedBy: {
            select: { id: true, username: true, discriminator: true }
          }
        }
      });

      // Step 4: Audit log
      await tx.auditLog.create({
        data: {
          serverId,
          action: 'BAN',
          targetId: userId,
          targetType: 'USER',
          moderatorId,
          reason: reason || null,
          metadata: JSON.stringify({ deleteMessageDays: delDays })
        }
      });

      return newBan;
    });

    logger.info(`User ${userId} banned from server ${serverId} by ${moderatorId}`);

    res.status(201).json({
      success: true,
      ban
    });
  } catch (error) {
    logger.error('Ban user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to ban user'
    });
  }
});

/**
 * GET /api/servers/:id/bans
 * Get all bans for a server
 */
router.get('/servers/:id/bans', authenticateToken, async (req, res) => {
  try {
    const serverId = req.params.id;
    const moderatorId = req.user.id;

    // Check BAN_MEMBERS permission
    const permCheck = await checkPermission(serverId, moderatorId, PERMISSIONS.BAN_MEMBERS);
    if (!permCheck.can) {
      return res.status(403).json({
        success: false,
        error: permCheck.reason
      });
    }

    const bans = await prisma.ban.findMany({
      where: { serverId },
      include: {
        user: {
          select: { id: true, username: true, discriminator: true, avatar: true }
        },
        bannedBy: {
          select: { id: true, username: true, discriminator: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      bans
    });
  } catch (error) {
    logger.error('Get bans error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get bans'
    });
  }
});

/**
 * DELETE /api/servers/:id/bans/:userId
 * Unban a user
 */
router.delete('/servers/:id/bans/:userId', authenticateToken, async (req, res) => {
  try {
    const { id: serverId, userId } = req.params;
    const moderatorId = req.user.id;

    // Check BAN_MEMBERS permission
    const permCheck = await checkPermission(serverId, moderatorId, PERMISSIONS.BAN_MEMBERS);
    if (!permCheck.can) {
      return res.status(403).json({
        success: false,
        error: permCheck.reason
      });
    }

    // Find ban
    const ban = await prisma.ban.findUnique({
      where: { serverId_userId: { serverId, userId } }
    });

    if (!ban) {
      return res.status(404).json({
        success: false,
        error: 'Ban not found'
      });
    }

    // Delete ban
    await prisma.ban.delete({
      where: { id: ban.id }
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        serverId,
        action: 'UNBAN',
        targetId: userId,
        targetType: 'USER',
        moderatorId,
        reason: 'Ban removed'
      }
    });

    logger.info(`User ${userId} unbanned from server ${serverId} by ${moderatorId}`);

    res.json({
      success: true,
      message: 'Ban removed'
    });
  } catch (error) {
    logger.error('Unban user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to unban user'
    });
  }
});

/**
 * POST /api/servers/:id/kicks
 * Kick a user from the server
 */
router.post('/servers/:id/kicks', authenticateToken, async (req, res) => {
  try {
    const serverId = req.params.id;
    const moderatorId = req.user.id;
    const { userId, reason } = req.body;

    // Validate userId
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    // Validate reason
    if (reason && typeof reason === 'string' && reason.length > 500) {
      return res.status(400).json({
        success: false,
        error: 'Reason must be at most 500 characters'
      });
    }

    // Check KICK_MEMBERS permission
    const permCheck = await checkPermission(serverId, moderatorId, PERMISSIONS.KICK_MEMBERS);
    if (!permCheck.can) {
      return res.status(403).json({
        success: false,
        error: permCheck.reason
      });
    }

    // Check hierarchy
    const hierCheck = await canModerateUser(serverId, moderatorId, userId);
    if (!hierCheck.can) {
      return res.status(403).json({
        success: false,
        error: hierCheck.reason
      });
    }

    // Check if user is a member
    const member = await prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId, userId } }
    });

    if (!member) {
      return res.status(404).json({
        success: false,
        error: 'User is not a member of this server'
      });
    }

    // Execute kick and audit log in a single transaction for atomicity
    await prisma.$transaction(async (tx) => {
      // Step 1: Remove member (cascade removes roles)
      await tx.serverMember.delete({
        where: { serverId_userId: { serverId, userId } }
      });

      // Step 2: Audit log
      await tx.auditLog.create({
        data: {
          serverId,
          action: 'KICK',
          targetId: userId,
          targetType: 'USER',
          moderatorId,
          reason: reason || null
        }
      });
    });

    logger.info(`User ${userId} kicked from server ${serverId} by ${moderatorId}`);

    res.json({
      success: true,
      message: 'User kicked'
    });
  } catch (error) {
    logger.error('Kick user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to kick user'
    });
  }
});

/**
 * POST /api/servers/:id/timeouts
 * Timeout a user (mute temporarily)
 */
router.post('/servers/:id/timeouts', authenticateToken, async (req, res) => {
  try {
    const serverId = req.params.id;
    const moderatorId = req.user.id;
    const { userId, duration, reason } = req.body;

    // Validate userId
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    // Validate duration (max 28 days = 2419200 seconds)
    if (!duration || typeof duration !== 'number' || duration <= 0 || duration > 2419200) {
      return res.status(400).json({
        success: false,
        error: 'Duration must be between 1 and 2419200 seconds (28 days)'
      });
    }

    // Validate reason
    if (reason && typeof reason === 'string' && reason.length > 500) {
      return res.status(400).json({
        success: false,
        error: 'Reason must be at most 500 characters'
      });
    }

    // Check MODERATE_MEMBERS permission
    const permCheck = await checkPermission(serverId, moderatorId, PERMISSIONS.MODERATE_MEMBERS);
    if (!permCheck.can) {
      return res.status(403).json({
        success: false,
        error: permCheck.reason
      });
    }

    // Check hierarchy
    const hierCheck = await canModerateUser(serverId, moderatorId, userId);
    if (!hierCheck.can) {
      return res.status(403).json({
        success: false,
        error: hierCheck.reason
      });
    }

    // Check if user is a member
    const member = await prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId, userId } }
    });

    if (!member) {
      return res.status(404).json({
        success: false,
        error: 'User is not a member of this server'
      });
    }

    // Calculate expiration
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + duration);

    // Upsert timeout (replace any existing)
    const timeout = await prisma.timeout.upsert({
      where: { serverId_userId: { serverId, userId } },
      create: {
        serverId,
        userId,
        expiresAt,
        reason: reason || null
      },
      update: {
        expiresAt,
        reason: reason || null
      },
      include: {
        user: {
          select: { id: true, username: true, discriminator: true, avatar: true }
        }
      }
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        serverId,
        action: 'TIMEOUT',
        targetId: userId,
        targetType: 'USER',
        moderatorId,
        reason: reason || null,
        metadata: JSON.stringify({ duration, expiresAt: expiresAt.toISOString() })
      }
    });

    logger.info(`User ${userId} timed out in server ${serverId} by ${moderatorId} for ${duration}s`);

    res.json({
      success: true,
      timeout
    });
  } catch (error) {
    logger.error('Timeout user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to timeout user'
    });
  }
});

/**
 * DELETE /api/servers/:id/timeouts/:userId
 * Remove timeout from a user
 */
router.delete('/servers/:id/timeouts/:userId', authenticateToken, async (req, res) => {
  try {
    const { id: serverId, userId } = req.params;
    const moderatorId = req.user.id;

    // Check MODERATE_MEMBERS permission
    const permCheck = await checkPermission(serverId, moderatorId, PERMISSIONS.MODERATE_MEMBERS);
    if (!permCheck.can) {
      return res.status(403).json({
        success: false,
        error: permCheck.reason
      });
    }

    // Find timeout
    const timeout = await prisma.timeout.findUnique({
      where: { serverId_userId: { serverId, userId } }
    });

    if (!timeout) {
      return res.status(404).json({
        success: false,
        error: 'Timeout not found'
      });
    }

    // Delete timeout
    await prisma.timeout.delete({
      where: { id: timeout.id }
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        serverId,
        action: 'TIMEOUT_REMOVE',
        targetId: userId,
        targetType: 'USER',
        moderatorId,
        reason: 'Timeout removed'
      }
    });

    logger.info(`Timeout removed for user ${userId} in server ${serverId} by ${moderatorId}`);

    res.json({
      success: true,
      message: 'Timeout removed'
    });
  } catch (error) {
    logger.error('Remove timeout error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove timeout'
    });
  }
});

export default router;
