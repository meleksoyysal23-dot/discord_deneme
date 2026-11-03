/**
 * Webhook Routes - FAZ 7
 * Webhook management and public webhook execution
 * 
 * POST /api/servers/:id/webhooks - Create webhook (MANAGE_WEBHOOKS)
 * GET /api/servers/:id/webhooks - List webhooks (MANAGE_WEBHOOKS)
 * DELETE /api/webhooks/:id - Delete webhook (MANAGE_WEBHOOKS)
 * POST /api/webhooks/:webhookId/:token - Execute webhook (NO AUTH, public)
 */

import { Router } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import prisma from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { PERMISSIONS, hasPermission } from '../utils/permissions.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * Rate limiter for public webhook endpoint
 * Prevents DoS attacks on unauthenticated endpoint
 */
const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 100, // IP başına 100 istek
  message: { success: false, error: 'Too many webhook requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Helper: Check MANAGE_WEBHOOKS permission
 */
async function canManageWebhooks(serverId, userId) {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { ownerId: true }
  });
  
  if (!server) return { can: false, reason: 'Server not found' };
  if (server.ownerId === userId) return { can: true };
  
  const member = await prisma.serverMember.findUnique({
    where: { serverId_userId: { serverId, userId } },
    include: { roles: { include: { role: true } } }
  });
  
  if (!member) return { can: false, reason: 'Not a member' };
  
  const roles = member.roles.map(ur => ur.role);
  if (hasPermission(roles, PERMISSIONS.MANAGE_WEBHOOKS)) {
    return { can: true };
  }
  
  return { can: false, reason: 'Insufficient permissions' };
}

/**
 * Helper: Validate webhook name
 */
function validateWebhookName(name) {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Webhook name is required' };
  }
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 100) {
    return { valid: false, error: 'Webhook name must be 1-100 characters' };
  }
  return { valid: true, value: trimmed };
}

/**
 * Helper: Validate URL (for avatar/avatarUrl)
 */
function validateUrl(url, fieldName = 'URL') {
  if (url === null || url === undefined) {
    return { valid: true, value: null };
  }
  if (typeof url !== 'string') {
    return { valid: false, error: `${fieldName} must be a string` };
  }
  if (url.length > 500) {
    return { valid: false, error: `${fieldName} must be at most 500 characters` };
  }
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: `${fieldName} must be http or https` };
    }
    return { valid: true, value: url };
  } catch {
    return { valid: false, error: `${fieldName} must be a valid URL` };
  }
}

/**
 * POST /api/servers/:id/webhooks
 * Create a new webhook
 */
router.post('/servers/:id/webhooks', authenticateToken, async (req, res) => {
  try {
    const serverId = req.params.id;
    const userId = req.user.id;
    const { name, channelId, avatar } = req.body || {};

    // Validate name
    const nameCheck = validateWebhookName(name);
    if (!nameCheck.valid) {
      return res.status(400).json({ success: false, error: nameCheck.error });
    }

    // Validate channelId
    if (!channelId || typeof channelId !== 'string') {
      return res.status(400).json({ success: false, error: 'channelId is required' });
    }

    // Validate avatar URL
    const avatarCheck = validateUrl(avatar, 'avatar');
    if (!avatarCheck.valid) {
      return res.status(400).json({ success: false, error: avatarCheck.error });
    }

    // Check permissions
    const permCheck = await canManageWebhooks(serverId, userId);
    if (!permCheck.can) {
      return res.status(403).json({ success: false, error: permCheck.reason });
    }

    // Verify channel belongs to server and is TEXT type
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { id: true, serverId: true, type: true }
    });

    if (!channel) {
      return res.status(404).json({ success: false, error: 'Channel not found' });
    }

    if (channel.serverId !== serverId) {
      return res.status(400).json({ success: false, error: 'Channel does not belong to this server' });
    }

    if (channel.type !== 'TEXT') {
      return res.status(400).json({ success: false, error: 'Webhooks can only be created for text channels' });
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');

    // Create webhook
    const webhook = await prisma.webhook.create({
      data: {
        name: nameCheck.value,
        token,
        channelId,
        serverId,
        avatar: avatarCheck.value
      }
    });

    // Build webhook URL
    const protocol = req.protocol;
    const host = req.get('host');
    const webhookUrl = `${protocol}://${host}/api/webhooks/${webhook.id}/${token}`;

    logger.info(`Webhook created: ${webhook.name} (${webhook.id}) in server ${serverId} by ${userId}`);

    res.status(201).json({
      success: true,
      webhook: {
        id: webhook.id,
        name: webhook.name,
        token: webhook.token,
        channelId: webhook.channelId,
        avatar: webhook.avatar,
        url: webhookUrl,
        createdAt: webhook.createdAt
      }
    });
  } catch (error) {
    logger.error('Create webhook error:', error);
    res.status(500).json({ success: false, error: 'Failed to create webhook' });
  }
});

/**
 * GET /api/servers/:id/webhooks
 * List all webhooks for a server
 */
router.get('/servers/:id/webhooks', authenticateToken, async (req, res) => {
  try {
    const serverId = req.params.id;
    const userId = req.user.id;

    // Check permissions
    const permCheck = await canManageWebhooks(serverId, userId);
    if (!permCheck.can) {
      return res.status(403).json({ success: false, error: permCheck.reason });
    }

    const webhooks = await prisma.webhook.findMany({
      where: { serverId },
      include: {
        channel: {
          select: { id: true, name: true, type: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Build webhook URLs
    const protocol = req.protocol;
    const host = req.get('host');

    const formattedWebhooks = webhooks.map(wh => ({
      id: wh.id,
      name: wh.name,
      token: wh.token,
      channelId: wh.channelId,
      avatar: wh.avatar,
      channel: wh.channel,
      url: `${protocol}://${host}/api/webhooks/${wh.id}/${wh.token}`,
      createdAt: wh.createdAt
    }));

    res.json({ success: true, webhooks: formattedWebhooks });
  } catch (error) {
    logger.error('Get webhooks error:', error);
    res.status(500).json({ success: false, error: 'Failed to get webhooks' });
  }
});

/**
 * DELETE /api/webhooks/:id
 * Delete a webhook
 */
router.delete('/webhooks/:id', authenticateToken, async (req, res) => {
  try {
    const webhookId = req.params.id;
    const userId = req.user.id;

    // Get webhook
    const webhook = await prisma.webhook.findUnique({
      where: { id: webhookId },
      select: { id: true, serverId: true, name: true }
    });

    if (!webhook) {
      return res.status(404).json({ success: false, error: 'Webhook not found' });
    }

    // Check permissions
    const permCheck = await canManageWebhooks(webhook.serverId, userId);
    if (!permCheck.can) {
      return res.status(403).json({ success: false, error: permCheck.reason });
    }

    // Delete webhook
    await prisma.webhook.delete({ where: { id: webhookId } });

    logger.info(`Webhook deleted: ${webhook.name} (${webhookId}) by ${userId}`);

    res.json({ success: true, message: 'Webhook deleted' });
  } catch (error) {
    logger.error('Delete webhook error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete webhook' });
  }
});

/**
 * POST /api/webhooks/:webhookId/:token
 * Execute a webhook (NO AUTH - public endpoint)
 * Creates a message in the webhook's channel
 */
router.post('/webhooks/:webhookId/:token', webhookLimiter, async (req, res) => {
  try {
    const { webhookId, token } = req.params;
    const { content, username, avatarUrl } = req.body || {};

    // Validate content
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ success: false, error: 'content is required and must be a string' });
    }

    if (content.length < 1 || content.length > 2000) {
      return res.status(400).json({ success: false, error: 'content must be 1-2000 characters' });
    }

    // Validate username (optional)
    if (username !== undefined) {
      if (typeof username !== 'string' || username.length > 80) {
        return res.status(400).json({ success: false, error: 'username must be a string up to 80 characters' });
      }
    }

    // Validate avatarUrl (optional)
    const avatarCheck = validateUrl(avatarUrl, 'avatarUrl');
    if (!avatarCheck.valid) {
      return res.status(400).json({ success: false, error: avatarCheck.error });
    }

    // Find webhook with matching token
    const webhook = await prisma.webhook.findUnique({
      where: { id: webhookId },
      include: {
        channel: { select: { id: true, name: true, serverId: true } }
      }
    });

    if (!webhook) {
      return res.status(404).json({ success: false, error: 'Webhook not found' });
    }

    if (webhook.token !== token) {
      // Don't reveal whether webhook exists or token is wrong
      return res.status(404).json({ success: false, error: 'Webhook not found' });
    }

    // Create a "webhook message" - use server owner as author but store webhook metadata
    const server = await prisma.server.findUnique({
      where: { id: webhook.serverId },
      select: { ownerId: true }
    });

    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    // Determine display name and avatar
    const displayName = username || webhook.name;
    const displayAvatar = avatarCheck.value || webhook.avatar;

    // Create the message with webhook metadata
    const message = await prisma.message.create({
      data: {
        channelId: webhook.channelId,
        userId: server.ownerId,
        content: content.trim(),
        webhookId: webhook.id,
        webhookName: displayName,
        webhookAvatar: displayAvatar
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            discriminator: true,
            displayName: true,
            avatar: true
          }
        }
      }
    });

    // Format response with webhook overrides
    const responseMessage = {
      id: message.id,
      channelId: message.channelId,
      content: message.content,
      createdAt: message.createdAt,
      webhook: true,
      webhookId: webhook.id,
      webhookName: displayName,
      username: displayName,
      avatarUrl: displayAvatar,
      author: {
        id: message.user.id,
        username: displayName,
        discriminator: '0000',
        displayName: displayName,
        avatar: displayAvatar
      }
    };

    logger.info(`Webhook executed: ${webhook.name} (${webhookId}) in channel ${webhook.channelId}`);

    // Emit socket event to channel room (best-effort)
    try {
      const app = req.app;
      const io = app.get('io');
      if (io) {
        io.to(`channel:${webhook.channelId}`).emit('message:new', responseMessage);
      }
    } catch (e) {
      // Socket broadcast is best-effort
    }

    res.status(200).json({ success: true, message: responseMessage });
  } catch (error) {
    logger.error('Execute webhook error:', error);
    res.status(500).json({ success: false, error: 'Failed to execute webhook' });
  }
});

export default router;
