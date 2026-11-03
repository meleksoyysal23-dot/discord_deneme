/**
 * Audit Log Routes - FAZ 6
 * View moderation and server action logs
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
 * Helper: Check if user has VIEW_AUDIT_LOG permission
 */
async function canViewAuditLog(serverId, userId) {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { ownerId: true }
  });

  if (!server) return { can: false, reason: 'Server not found' };
  if (server.ownerId === userId) return { can: true, server };

  const member = await getMemberWithRoles(serverId, userId);
  if (!member) return { can: false, reason: 'Not a member' };

  const roles = member.roles.map(ur => ur.role);
  
  // Administrator or VIEW_AUDIT_LOG permission
  if (hasPermission(roles, PERMISSIONS.VIEW_AUDIT_LOG) || hasPermission(roles, PERMISSIONS.ADMINISTRATOR)) {
    return { can: true, server };
  }

  return { can: false, reason: 'Insufficient permissions' };
}

/**
 * GET /api/servers/:id/audit-log
 * Get audit logs for a server
 * Query params: action, userId, limit, offset
 */
router.get('/servers/:id/audit-log', authenticateToken, async (req, res) => {
  try {
    const serverId = req.params.id;
    const userId = req.user.id;
    const { action, userId: targetUserId, limit = 50, offset = 0 } = req.query;

    // Check permissions
    const permCheck = await canViewAuditLog(serverId, userId);
    if (!permCheck.can) {
      return res.status(403).json({
        success: false,
        error: permCheck.reason
      });
    }

    // Validate limit
    const maxLimit = Math.min(parseInt(limit) || 50, 100);
    const skip = parseInt(offset) || 0;

    // Build where clause
    const where = { serverId };
    
    if (action) {
      where.action = action;
    }
    
    if (targetUserId) {
      where.targetId = targetUserId;
    }

    // Get logs
    const logs = await prisma.auditLog.findMany({
      where,
      include: {
        moderator: {
          select: {
            id: true,
            username: true,
            discriminator: true,
            avatar: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: maxLimit,
      skip
    });

    // Get total count
    const total = await prisma.auditLog.count({ where });

    // Format logs
    const formattedLogs = logs.map(log => ({
      id: log.id,
      action: log.action,
      target: log.targetId ? {
        id: log.targetId,
        type: log.targetType
      } : null,
      moderator: log.moderator,
      reason: log.reason,
      metadata: log.metadata ? JSON.parse(log.metadata) : null,
      createdAt: log.createdAt
    }));

    res.json({
      success: true,
      logs: formattedLogs,
      pagination: {
        total,
        limit: maxLimit,
        offset: skip,
        hasMore: skip + maxLimit < total
      }
    });
  } catch (error) {
    logger.error('Get audit log error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get audit logs'
    });
  }
});

export default router;
