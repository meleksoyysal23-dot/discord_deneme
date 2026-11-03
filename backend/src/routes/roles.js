/**
 * Role Management Routes - FAZ 6
 * CRUD operations for server roles and role assignments
 */

import express from 'express';
import prisma from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { PERMISSIONS, hasPermission, isOwner, toBigInt, toString } from '../utils/permissions.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

/**
 * Helper: Get member with roles for a server
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
 * Helper: Check if user can manage roles (owner or MANAGE_ROLES permission)
 */
async function canManageRoles(serverId, userId) {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { ownerId: true }
  });
  
  if (!server) return { can: false, reason: 'Server not found' };
  if (server.ownerId === userId) return { can: true, server };
  
  const member = await getMemberWithRoles(serverId, userId);
  if (!member) return { can: false, reason: 'Not a member' };
  
  const roles = member.roles.map(ur => ur.role);
  if (hasPermission(roles, PERMISSIONS.MANAGE_ROLES)) {
    return { can: true, server };
  }
  
  return { can: false, reason: 'Insufficient permissions' };
}

/**
 * POST /api/servers/:id/roles
 * Create a new role
 */
router.post('/servers/:id/roles', authenticateToken, async (req, res) => {
  try {
    const serverId = req.params.id;
    const userId = req.user.id;
    const { name, color, permissions, position, hoist, mentionable } = req.body;

    // Validate name
    if (!name || typeof name !== 'string' || name.length < 1 || name.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Role name must be between 1 and 100 characters'
      });
    }

    // Check permissions
    const permCheck = await canManageRoles(serverId, userId);
    if (!permCheck.can) {
      return res.status(403).json({
        success: false,
        error: permCheck.reason
      });
    }

    // Validate color format
    const validColor = color && /^#[0-9A-F]{6}$/i.test(color) ? color : '#99AAB5';

    // Validate permissions
    let permValue = '0';
    if (permissions !== undefined) {
      try {
        const permBigInt = toBigInt(permissions.toString());
        permValue = toString(permBigInt);
      } catch {
        return res.status(400).json({
          success: false,
          error: 'Invalid permissions value'
        });
      }
    }

    // Create role
    const role = await prisma.role.create({
      data: {
        serverId,
        name,
        color: validColor,
        permissions: permValue,
        position: position || 0,
        hoist: hoist || false,
        mentionable: mentionable || false
      }
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        serverId,
        action: 'ROLE_CREATE',
        targetId: role.id,
        targetType: 'ROLE',
        moderatorId: userId,
        reason: `Created role: ${name}`
      }
    });

    logger.info(`Role created in server ${serverId} by ${userId}: ${role.name}`);

    res.status(201).json({
      success: true,
      role
    });
  } catch (error) {
    logger.error('Create role error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create role'
    });
  }
});

/**
 * GET /api/servers/:id/roles
 * Get all roles for a server
 */
router.get('/servers/:id/roles', authenticateToken, async (req, res) => {
  try {
    const serverId = req.params.id;
    const userId = req.user.id;

    // Check if user is a member
    const member = await prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId, userId } }
    });

    if (!member) {
      return res.status(403).json({
        success: false,
        error: 'Not a member of this server'
      });
    }

    const roles = await prisma.role.findMany({
      where: { serverId },
      orderBy: { position: 'desc' }
    });

    res.json({
      success: true,
      roles
    });
  } catch (error) {
    logger.error('Get roles error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get roles'
    });
  }
});

/**
 * PUT /api/roles/:id
 * Update a role
 */
router.put('/roles/:id', authenticateToken, async (req, res) => {
  try {
    const roleId = req.params.id;
    const userId = req.user.id;
    const { name, color, permissions, position, hoist, mentionable } = req.body;

    // Get role
    const role = await prisma.role.findUnique({
      where: { id: roleId },
      include: { server: true }
    });

    if (!role) {
      return res.status(404).json({
        success: false,
        error: 'Role not found'
      });
    }

    // Check permissions
    const permCheck = await canManageRoles(role.serverId, userId);
    if (!permCheck.can) {
      return res.status(403).json({
        success: false,
        error: permCheck.reason
      });
    }

    // Build update data
    const updateData = {};
    
    if (name !== undefined) {
      if (typeof name !== 'string' || name.length < 1 || name.length > 100) {
        return res.status(400).json({
          success: false,
          error: 'Role name must be between 1 and 100 characters'
        });
      }
      updateData.name = name;
    }

    if (color !== undefined) {
      if (!/^#[0-9A-F]{6}$/i.test(color)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid color format (use #RRGGBB)'
        });
      }
      updateData.color = color;
    }

    if (permissions !== undefined) {
      try {
        const permBigInt = toBigInt(permissions.toString());
        updateData.permissions = toString(permBigInt);
      } catch {
        return res.status(400).json({
          success: false,
          error: 'Invalid permissions value'
        });
      }
    }

    if (position !== undefined) updateData.position = position;
    if (hoist !== undefined) updateData.hoist = hoist;
    if (mentionable !== undefined) updateData.mentionable = mentionable;

    // Update role
    const updatedRole = await prisma.role.update({
      where: { id: roleId },
      data: updateData
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        serverId: role.serverId,
        action: 'ROLE_UPDATE',
        targetId: roleId,
        targetType: 'ROLE',
        moderatorId: userId,
        reason: `Updated role: ${updatedRole.name}`
      }
    });

    logger.info(`Role updated: ${roleId} by ${userId}`);

    res.json({
      success: true,
      role: updatedRole
    });
  } catch (error) {
    logger.error('Update role error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update role'
    });
  }
});

/**
 * DELETE /api/roles/:id
 * Delete a role
 */
router.delete('/roles/:id', authenticateToken, async (req, res) => {
  try {
    const roleId = req.params.id;
    const userId = req.user.id;

    // Get role
    const role = await prisma.role.findUnique({
      where: { id: roleId },
      include: { server: true }
    });

    if (!role) {
      return res.status(404).json({
        success: false,
        error: 'Role not found'
      });
    }

    // Cannot delete @everyone role (position 0 is reserved)
    if (role.name === '@everyone' || role.position === 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete @everyone role'
      });
    }

    // Check permissions
    const permCheck = await canManageRoles(role.serverId, userId);
    if (!permCheck.can) {
      return res.status(403).json({
        success: false,
        error: permCheck.reason
      });
    }

    // Delete role (cascade will delete user_roles)
    await prisma.role.delete({
      where: { id: roleId }
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        serverId: role.serverId,
        action: 'ROLE_DELETE',
        targetId: roleId,
        targetType: 'ROLE',
        moderatorId: userId,
        reason: `Deleted role: ${role.name}`
      }
    });

    logger.info(`Role deleted: ${roleId} by ${userId}`);

    res.json({
      success: true,
      message: 'Role deleted'
    });
  } catch (error) {
    logger.error('Delete role error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete role'
    });
  }
});

/**
 * POST /api/servers/:id/members/:userId/roles/:roleId
 * Assign a role to a member
 */
router.post('/servers/:id/members/:userId/roles/:roleId', authenticateToken, async (req, res) => {
  try {
    const { id: serverId, userId: targetUserId, roleId } = req.params;
    const moderatorId = req.user.id;

    // Check permissions
    const permCheck = await canManageRoles(serverId, moderatorId);
    if (!permCheck.can) {
      return res.status(403).json({
        success: false,
        error: permCheck.reason
      });
    }

    // Get member
    const member = await prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId, userId: targetUserId } }
    });

    if (!member) {
      return res.status(404).json({
        success: false,
        error: 'Member not found'
      });
    }

    // Get role
    const role = await prisma.role.findUnique({
      where: { id: roleId }
    });

    if (!role || role.serverId !== serverId) {
      return res.status(404).json({
        success: false,
        error: 'Role not found'
      });
    }

    // Check if already has role
    const existing = await prisma.userRole.findUnique({
      where: { memberId_roleId: { memberId: member.id, roleId } }
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Member already has this role'
      });
    }

    // Assign role
    await prisma.userRole.create({
      data: {
        memberId: member.id,
        roleId
      }
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        serverId,
        action: 'ROLE_ASSIGN',
        targetId: targetUserId,
        targetType: 'USER',
        moderatorId,
        reason: `Assigned role ${role.name} to user`,
        metadata: JSON.stringify({ roleId, roleName: role.name })
      }
    });

    logger.info(`Role ${roleId} assigned to user ${targetUserId} in server ${serverId}`);

    res.json({
      success: true,
      message: 'Role assigned'
    });
  } catch (error) {
    logger.error('Assign role error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to assign role'
    });
  }
});

/**
 * DELETE /api/servers/:id/members/:userId/roles/:roleId
 * Remove a role from a member
 */
router.delete('/servers/:id/members/:userId/roles/:roleId', authenticateToken, async (req, res) => {
  try {
    const { id: serverId, userId: targetUserId, roleId } = req.params;
    const moderatorId = req.user.id;

    // Check permissions
    const permCheck = await canManageRoles(serverId, moderatorId);
    if (!permCheck.can) {
      return res.status(403).json({
        success: false,
        error: permCheck.reason
      });
    }

    // Get member
    const member = await prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId, userId: targetUserId } }
    });

    if (!member) {
      return res.status(404).json({
        success: false,
        error: 'Member not found'
      });
    }

    // Get role
    const role = await prisma.role.findUnique({
      where: { id: roleId }
    });

    if (!role || role.serverId !== serverId) {
      return res.status(404).json({
        success: false,
        error: 'Role not found'
      });
    }

    // Remove role
    const userRole = await prisma.userRole.findUnique({
      where: { memberId_roleId: { memberId: member.id, roleId } }
    });

    if (!userRole) {
      return res.status(400).json({
        success: false,
        error: 'Member does not have this role'
      });
    }

    await prisma.userRole.delete({
      where: { id: userRole.id }
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        serverId,
        action: 'ROLE_REMOVE',
        targetId: targetUserId,
        targetType: 'USER',
        moderatorId,
        reason: `Removed role ${role.name} from user`,
        metadata: JSON.stringify({ roleId, roleName: role.name })
      }
    });

    logger.info(`Role ${roleId} removed from user ${targetUserId} in server ${serverId}`);

    res.json({
      success: true,
      message: 'Role removed'
    });
  } catch (error) {
    logger.error('Remove role error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove role'
    });
  }
});

export default router;
