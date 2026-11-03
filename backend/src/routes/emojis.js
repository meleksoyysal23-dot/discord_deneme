/**
 * Emoji Routes (FAZ 5)
 * Custom emoji sistemi:
 * - Emoji listeleme
 * - Emoji upload (image, max 256KB)
 * - Emoji silme
 * - Server bazlı emoji yönetimi
 */

import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { logger } from '../utils/logger.js';
import { authenticateToken } from '../middleware/auth.js';
import { PERMISSIONS, hasPermission } from '../utils/permissions.js';
import multer from 'multer';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const UPLOAD_DIR = join(__dirname, '..', '..', 'uploads', 'emojis');

// Upload dizinini oluştur (yoksa)
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 256 * 1024 }, // 256KB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG, JPEG, and GIF are allowed'));
    }
  },
});

const router = Router();

// Tüm route'lar JWT authentication gerektirir
router.use(authenticateToken);

/**
 * GET /api/emojis
 * Tüm emoji'leri listele (opsiyonel serverId filtresi)
 */
router.get('/emojis', async (req, res) => {
  try {
    const { serverId } = req.query;

    const where = {};
    if (serverId) {
      where.serverId = serverId;
    }

    const emojis = await prisma.emoji.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            discriminator: true,
          },
        },
        server: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      emojis: emojis.map((e) => ({
        id: e.id,
        name: e.name,
        url: e.url,
        animated: e.animated,
        serverId: e.serverId,
        userId: e.userId,
        createdAt: e.createdAt,
        user: e.user
          ? {
              id: e.user.id,
              username: e.user.username,
              discriminator: e.user.discriminator,
            }
          : null,
        server: e.server
          ? {
              id: e.server.id,
              name: e.server.name,
            }
          : null,
      })),
    });
  } catch (error) {
    logger.error('Error fetching emojis:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch emojis' });
  }
});

/**
 * POST /api/emojis
 * Yeni emoji oluştur
 * - Name: 2-32 karakter, alfanumerik + underscore
 * - Image: max 256KB, PNG/JPEG/GIF
 * - Server bazlı veya global
 */
router.post('/emojis', upload.single('image'), async (req, res) => {
  try {
    const { name, serverId } = req.body;
    const userId = req.user.id;

    if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 32) {
      return res.status(400).json({ success: false, error: 'Name must be 2-32 characters' });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
      return res.status(400).json({ success: false, error: 'Name must be alphanumeric + underscore' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Image file is required' });
    }

    // Server varsa kontrol et
    if (serverId) {
      const server = await prisma.server.findUnique({
        where: { id: serverId },
        include: { members: true },
      });
      if (!server) {
        // Dosyayı sil
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ success: false, error: 'Server not found' });
      }

      const isMember = server.members.some((m) => m.userId === userId);
      if (!isMember) {
        fs.unlinkSync(req.file.path);
        return res.status(403).json({ success: false, error: 'Not a member of this server' });
      }

      // Emoji limiti kontrolü (max 50 per server)
      const emojiCount = await prisma.emoji.count({ where: { serverId } });
      if (emojiCount >= 50) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ success: false, error: 'Server emoji limit reached (max 50)' });
      }

      // İsim eşsizliği kontrolü (server scope) - SQLite'da composite unique yok, manuel kontrol
      const existing = await prisma.emoji.findFirst({
        where: { name: name.trim(), serverId },
      });
      if (existing) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ success: false, error: 'Emoji name already exists in this server' });
      }
    } else {
      // Global emoji - isim eşsizliği kontrolü
      const existing = await prisma.emoji.findFirst({
        where: { name: name.trim(), serverId: null },
      });
      if (existing) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ success: false, error: 'Emoji name already exists' });
      }
    }

    const emoji = await prisma.emoji.create({
      data: {
        name: name.trim(),
        url: `/uploads/emojis/${req.file.filename}`,
        animated: req.file.mimetype === 'image/gif',
        serverId: serverId || null,
        userId,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            discriminator: true,
          },
        },
      },
    });

    logger.info(`Emoji created: ${emoji.id} (${emoji.name}) by ${userId}`);

    res.status(201).json({
      success: true,
      emoji: {
        id: emoji.id,
        name: emoji.name,
        url: emoji.url,
        animated: emoji.animated,
        serverId: emoji.serverId,
        userId: emoji.userId,
        createdAt: emoji.createdAt,
        user: {
          id: emoji.user.id,
          username: emoji.user.username,
          discriminator: emoji.user.discriminator,
        },
      },
    });
  } catch (error) {
    logger.error('Error creating emoji:', error);
    // Dosyayı sil (hata durumunda)
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        // ignore
      }
    }
    res.status(500).json({ success: false, error: 'Failed to create emoji' });
  }
});

/**
 * DELETE /api/emojis/:id
 * Emoji sil (uploader veya admin)
 */
router.delete('/emojis/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const emoji = await prisma.emoji.findUnique({
      where: { id },
      include: {
        server: {
          include: { members: true },
        },
      },
    });
    if (!emoji) {
      return res.status(404).json({ success: false, error: 'Emoji not found' });
    }

    // Uploader veya admin kontrolü
    const isUploader = emoji.userId === userId;
    let isAdmin = false;
    if (!isUploader && emoji.server) {
      // Owner her zaman silebilir
      if (emoji.server.ownerId === userId) {
        isAdmin = true;
      } else {
        const member = emoji.server.members.find((m) => m.userId === userId);
        if (member) {
          // Role permission check
          const memberWithRoles = await prisma.serverMember.findFirst({
            where: { id: member.id },
            include: { roles: { include: { role: true } } }
          });
          if (memberWithRoles) {
            const roles = memberWithRoles.roles.map(ur => ur.role);
            isAdmin = hasPermission(roles, PERMISSIONS.ADMINISTRATOR) || 
                      hasPermission(roles, PERMISSIONS.MANAGE_EMOJIS);
          }
        }
      }
    }

    if (!isUploader && !isAdmin) {
      return res.status(403).json({ success: false, error: 'No permission to delete this emoji' });
    }

    // Fiziksel dosyayı sil
    try {
      const filePath = join(__dirname, '..', '..', emoji.url);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (fileError) {
      logger.warn('Failed to delete emoji file:', fileError.message);
    }

    await prisma.emoji.delete({ where: { id } });

    logger.info(`Emoji deleted: ${id} by ${userId}`);

    res.json({ success: true, message: 'Emoji deleted' });
  } catch (error) {
    logger.error('Error deleting emoji:', error);
    res.status(500).json({ success: false, error: 'Failed to delete emoji' });
  }
});

export default router;