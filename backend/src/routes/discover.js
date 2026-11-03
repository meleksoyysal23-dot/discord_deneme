/**
 * Discover Routes - FAZ 7
 * Server discovery and categories
 * 
 * GET /api/discover/servers - Browse public servers
 * GET /api/discover/categories - Get server categories
 */

import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import { safeJsonParse } from '../utils/safeJsonParse.js';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * GET /api/discover/servers
 * Browse public servers
 * Query params: ?category=gaming&search=minecraft&limit=50&offset=0
 */
router.get('/servers', async (req, res) => {
  try {
    const { category, search, limit: limitStr, offset: offsetStr } = req.query;
    
    const limit = Math.min(parseInt(limitStr) || 50, 100);
    const offset = parseInt(offsetStr) || 0;

    // Build where clause
    const where = {
      isPublic: true
    };

    // Filter by category
    if (category) {
      where.category = category;
    }

    // Search by name or description
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } }
      ];
    }

    // Get servers
    const servers = await prisma.server.findMany({
      where,
      select: {
        id: true,
        name: true,
        icon: true,
        description: true,
        category: true,
        tags: true,
        _count: {
          select: { members: true }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: limit,
      skip: offset
    });

    // Get total count
    const total = await prisma.server.count({ where });

    // Format servers
    const formattedServers = servers.map(s => ({
      id: s.id,
      name: s.name,
      icon: s.icon,
      description: s.description,
      memberCount: s._count.members,
      category: s.category,
      tags: safeJsonParse(s.tags) || []
    }));

    res.json({
      success: true,
      servers: formattedServers,
      pagination: {
        total,
        limit,
        offset
      }
    });
  } catch (error) {
    logger.error('Get discover servers error:', error);
    res.status(500).json({ success: false, error: 'Failed to get servers' });
  }
});

/**
 * GET /api/discover/categories
 * Get server categories
 */
router.get('/categories', async (req, res) => {
  try {
    const categories = await prisma.serverCategory.findMany({
      orderBy: { serverCount: 'desc' }
    });

    res.json({
      success: true,
      categories: categories.map(c => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        serverCount: c.serverCount
      }))
    });
  } catch (error) {
    logger.error('Get categories error:', error);
    res.status(500).json({ success: false, error: 'Failed to get categories' });
  }
});

export default router;
