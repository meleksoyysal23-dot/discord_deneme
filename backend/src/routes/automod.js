/**
 * AutoMod Routes - FAZ 6
 * Automated moderation rules management
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
 * Helper: Check if user has MANAGE_SERVER permission (for automod)
 */
async function canManageAutoMod(serverId, userId) {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { ownerId: true }
  });

  if (!server) return { can: false, reason: 'Server not found' };
  if (server.ownerId === userId) return { can: true, server };

  const member = await getMemberWithRoles(serverId, userId);
  if (!member) return { can: false, reason: 'Not a member' };

  const roles = member.roles.map(ur => ur.role);
  if (hasPermission(roles, PERMISSIONS.MANAGE_SERVER)) {
    return { can: true, server };
  }

  return { can: false, reason: 'Insufficient permissions' };
}

/**
 * GET /api/servers/:id/automod
 * Get automod configuration
 */
router.get('/servers/:id/automod', authenticateToken, async (req, res) => {
  try {
    const serverId = req.params.id;
    const userId = req.user.id;

    // Check permissions
    const permCheck = await canManageAutoMod(serverId, userId);
    if (!permCheck.can) {
      return res.status(403).json({
        success: false,
        error: permCheck.reason
      });
    }

    // Get or create automod config
    let automod = await prisma.autoMod.findUnique({
      where: { serverId }
    });

    if (!automod) {
      // Create default config
      automod = await prisma.autoMod.create({
        data: {
          serverId,
          enabled: false,
          rules: '[]'
        }
      });
    }

    // Parse rules JSON
    let rules = [];
    try {
      rules = JSON.parse(automod.rules);
    } catch {
      rules = [];
    }

    res.json({
      success: true,
      automod: {
        enabled: automod.enabled,
        rules
      }
    });
  } catch (error) {
    logger.error('Get automod error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get automod configuration'
    });
  }
});

/**
 * PUT /api/servers/:id/automod
 * Update automod configuration
 */
router.put('/servers/:id/automod', authenticateToken, async (req, res) => {
  try {
    const serverId = req.params.id;
    const userId = req.user.id;
    const { enabled, rules } = req.body;

    // Check permissions
    const permCheck = await canManageAutoMod(serverId, userId);
    if (!permCheck.can) {
      return res.status(403).json({
        success: false,
        error: permCheck.reason
      });
    }

    // Validate rules
    if (rules !== undefined) {
      if (!Array.isArray(rules)) {
        return res.status(400).json({
          success: false,
          error: 'Rules must be an array'
        });
      }

      // Validate each rule
      const validTypes = ['KEYWORD', 'MENTION_SPAM', 'LINK_FILTER', 'CAPS_SPAM'];
      const validActions = ['BLOCK', 'FLAG', 'TIMEOUT', 'BAN'];

      for (const rule of rules) {
        if (!rule.type || !validTypes.includes(rule.type)) {
          return res.status(400).json({
            success: false,
            error: `Invalid rule type. Must be one of: ${validTypes.join(', ')}`
          });
        }

        if (!rule.action || !validActions.includes(rule.action)) {
          return res.status(400).json({
            success: false,
            error: `Invalid rule action. Must be one of: ${validActions.join(', ')}`
          });
        }

        if (!rule.config || typeof rule.config !== 'object') {
          return res.status(400).json({
            success: false,
            error: 'Rule config must be an object'
          });
        }
      }
    }

    // Build update data
    const updateData = {};
    if (enabled !== undefined) updateData.enabled = enabled;
    if (rules !== undefined) updateData.rules = JSON.stringify(rules);

    // Upsert automod config
    const automod = await prisma.autoMod.upsert({
      where: { serverId },
      create: {
        serverId,
        enabled: enabled ?? false,
        rules: rules ? JSON.stringify(rules) : '[]'
      },
      update: updateData
    });

    // Parse rules for response
    let parsedRules = [];
    try {
      parsedRules = JSON.parse(automod.rules);
    } catch {
      parsedRules = [];
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        serverId,
        action: 'AUTOMOD_UPDATE',
        targetId: serverId,
        targetType: 'SERVER',
        moderatorId: userId,
        reason: `AutoMod ${enabled ? 'enabled' : 'disabled'}, ${parsedRules.length} rules configured`
      }
    });

    logger.info(`AutoMod updated for server ${serverId} by ${userId}`);

    res.json({
      success: true,
      automod: {
        enabled: automod.enabled,
        rules: parsedRules
      }
    });
  } catch (error) {
    logger.error('Update automod error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update automod configuration'
    });
  }
});

export default router;
