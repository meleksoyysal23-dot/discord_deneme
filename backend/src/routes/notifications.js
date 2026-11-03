/**
 * Notification Routes - FAZ 7
 * User notification management
 * 
 * GET /api/notifications - Get user notifications
 * PUT /api/notifications/:id/read - Mark notification as read
 * PUT /api/notifications/read-all - Mark all notifications as read
 */

import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import { safeJsonParse } from '../utils/safeJsonParse.js';

const router = Router();

/**
 * Valid notification types
 */
const VALID_NOTIFICATION_TYPES = ['MENTION', 'FRIEND_REQUEST', 'SERVER_INVITE', 'WEBHOOK'];

// All routes require authentication
router.use(authenticateToken);

/**
 * GET /api/notifications
 * Get user notifications
 * Query params: ?limit=50&offset=0&unreadOnly=false
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;
    const unreadOnly = req.query.unreadOnly === 'true';

    // Build where clause
    const where = { userId };
    if (unreadOnly) {
      where.read = false;
    }

    // Get notifications
    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    });

    // Get total count
    const total = await prisma.notification.count({ where });

    // Format notifications
    const formattedNotifications = notifications.map(n => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      read: n.read,
      createdAt: n.createdAt,
      metadata: safeJsonParse(n.metadata)
    }));

    res.json({
      success: true,
      notifications: formattedNotifications,
      pagination: {
        total,
        limit,
        offset
      }
    });
  } catch (error) {
    logger.error('Get notifications error:', error);
    res.status(500).json({ success: false, error: 'Failed to get notifications' });
  }
});

/**
 * PUT /api/notifications/:id/read
 * Mark a notification as read
 */
router.put('/:id/read', async (req, res) => {
  try {
    const notificationId = req.params.id;
    const userId = req.user.id;

    // Find notification
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId }
    });

    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    // Verify ownership
    if (notification.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Update notification
    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: { read: true }
    });

    logger.info(`Notification marked as read: ${notificationId} by ${userId}`);

    res.json({
      success: true,
      notification: {
        id: updated.id,
        type: updated.type,
        title: updated.title,
        message: updated.message,
        read: updated.read,
        createdAt: updated.createdAt,
        metadata: safeJsonParse(updated.metadata)
      }
    });
  } catch (error) {
    logger.error('Mark notification read error:', error);
    res.status(500).json({ success: false, error: 'Failed to mark notification as read' });
  }
});

/**
 * PUT /api/notifications/read-all
 * Mark all notifications as read
 */
router.put('/read-all', async (req, res) => {
  try {
    const userId = req.user.id;

    // Update all unread notifications
    const result = await prisma.notification.updateMany({
      where: {
        userId,
        read: false
      },
      data: { read: true }
    });

    logger.info(`All notifications marked as read for ${userId}: ${result.count} updated`);

    res.json({
      success: true,
      message: 'All notifications marked as read',
      count: result.count
    });
  } catch (error) {
    logger.error('Mark all notifications read error:', error);
    res.status(500).json({ success: false, error: 'Failed to mark all notifications as read' });
  }
});

/**
 * Helper function: Create notification
 * Used by other routes to create notifications
 */
export async function createNotification(userId, type, title, message, metadata = null, io = null) {
  try {
    // Validate notification type
    if (!VALID_NOTIFICATION_TYPES.includes(type)) {
      logger.error(`Invalid notification type: ${type}`);
      return null;
    }

    const notification = await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        metadata: metadata ? JSON.stringify(metadata) : null
      }
    });

    const formattedNotification = {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      read: notification.read,
      createdAt: notification.createdAt,
      metadata: safeJsonParse(notification.metadata)
    };

    // Emit socket event if io is provided
    if (io) {
      io.to(userId).emit('notification:new', formattedNotification);
    }

    logger.info(`Notification created for ${userId}: ${type} - ${title}`);

    return formattedNotification;
  } catch (error) {
    logger.error('Create notification error:', error);
    return null;
  }
}

export default router;
