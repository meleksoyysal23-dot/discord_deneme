/**
 * Soundboard Routes (FAZ 5)
 * Soundboard sistemi:
 * - Sound listeleme
 * - Sound upload (audio, max 5MB)
 * - Sound silme
 */

import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { logger } from '../utils/logger.js';
import { authenticateToken } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const UPLOAD_DIR = join(__dirname, '..', '..', 'uploads', 'sounds');

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
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only MP3, WAV, and OGG are allowed'));
    }
  },
});

const router = Router();

// Tüm route'lar JWT authentication gerektirir
router.use(authenticateToken);

/**
 * GET /api/soundboard
 * Tüm sound'ları listele
 */
router.get('/soundboard', async (req, res) => {
  try {
    const sounds = await prisma.sound.findMany({
      include: {
        user: {
          select: {
            id: true,
            username: true,
            discriminator: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      sounds: sounds.map((s) => ({
        id: s.id,
        name: s.name,
        url: s.url,
        userId: s.userId,
        createdAt: s.createdAt,
        user: {
          id: s.user.id,
          username: s.user.username,
          discriminator: s.user.discriminator,
        },
      })),
    });
  } catch (error) {
    logger.error('Error fetching sounds:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch sounds' });
  }
});

/**
 * POST /api/soundboard
 * Yeni sound oluştur
 * - Name: 2-32 karakter
 * - Audio: max 5MB, MP3/WAV/OGG
 */
router.post('/soundboard', upload.single('audio'), async (req, res) => {
  try {
    const { name } = req.body;
    const userId = req.user.id;

    if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 32) {
      return res.status(400).json({ success: false, error: 'Name must be 2-32 characters' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Audio file is required' });
    }

    const sound = await prisma.sound.create({
      data: {
        name: name.trim(),
        url: `/uploads/sounds/${req.file.filename}`,
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

    logger.info(`Sound created: ${sound.id} (${sound.name}) by ${userId}`);

    res.status(201).json({
      success: true,
      sound: {
        id: sound.id,
        name: sound.name,
        url: sound.url,
        userId: sound.userId,
        createdAt: sound.createdAt,
        user: {
          id: sound.user.id,
          username: sound.user.username,
          discriminator: sound.user.discriminator,
        },
      },
    });
  } catch (error) {
    logger.error('Error creating sound:', error);
    // Dosyayı sil (hata durumunda)
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        // ignore
      }
    }
    res.status(500).json({ success: false, error: 'Failed to create sound' });
  }
});

/**
 * DELETE /api/soundboard/:id
 * Sound sil (sadece uploader)
 */
router.delete('/soundboard/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const sound = await prisma.sound.findUnique({ where: { id } });
    if (!sound) {
      return res.status(404).json({ success: false, error: 'Sound not found' });
    }

    if (sound.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Can only delete your own sounds' });
    }

    // Fiziksel dosyayı sil
    try {
      const filePath = join(__dirname, '..', '..', sound.url);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (fileError) {
      logger.warn('Failed to delete sound file:', fileError.message);
    }

    await prisma.sound.delete({ where: { id } });

    logger.info(`Sound deleted: ${id} by ${userId}`);

    res.json({ success: true, message: 'Sound deleted' });
  } catch (error) {
    logger.error('Error deleting sound:', error);
    res.status(500).json({ success: false, error: 'Failed to delete sound' });
  }
});

export default router;