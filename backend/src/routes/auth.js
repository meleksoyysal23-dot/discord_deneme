/**
 * Authentication Routes
 * POST /api/auth/register - Kullanıcı kaydı
 * POST /api/auth/login - Kullanıcı girişi
 * GET /api/auth/me - Mevcut kullanıcı bilgisi
 * PUT /api/auth/me - Profil güncelleme
 */

import { Router } from 'express';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import prisma from '../lib/prisma.js';
import { logger } from '../utils/logger.js';
import { generateDiscriminator, isValidDiscriminator } from '../utils/discriminator.js';
import { authenticateToken, generateToken } from '../middleware/auth.js';

const router = Router();

// Rate limiters (endpoint bazında)
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 10, // 15 dakikada 10 kayıt
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many registration attempts, please try again later' },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 15 dakikada 5 login
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many login attempts, please try again later' },
});

const elevateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 5, // IP başına 5 deneme
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many elevate attempts, please try again after 15 minutes',
  },
});

// Valid user status values
const VALID_STATUSES = ['ONLINE', 'IDLE', 'DND', 'INVISIBLE'];

// Validation helpers
function validateUsername(username) {
  if (!username || typeof username !== 'string') {
    return { valid: false, error: 'Username is required and must be a string' };
  }
  const trimmed = username.trim();
  if (trimmed.length < 3) {
    return { valid: false, error: 'Username must be at least 3 characters' };
  }
  if (trimmed.length > 20) {
    return { valid: false, error: 'Username must be at most 20 characters' };
  }
  // Alphanumeric + underscore only
  if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
    return { valid: false, error: 'Username can only contain letters, numbers, and underscores' };
  }
  return { valid: true, value: trimmed };
}

function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Password is required and must be a string' };
  }
  if (password.length < 6) {
    return { valid: false, error: 'Password must be at least 6 characters' };
  }
  if (password.length > 128) {
    return { valid: false, error: 'Password must be at most 128 characters' };
  }
  return { valid: true, value: password };
}

function validateDisplayName(displayName) {
  if (displayName === null || displayName === undefined) {
    return { valid: true, value: null };
  }
  if (typeof displayName !== 'string') {
    return { valid: false, error: 'Display name must be a string' };
  }
  const trimmed = displayName.trim();
  if (trimmed.length > 32) {
    return { valid: false, error: 'Display name must be at most 32 characters' };
  }
  return { valid: true, value: trimmed || null };
}

function validateStatus(status) {
  if (!status) {
    return { valid: true, value: null };
  }
  if (typeof status !== 'string') {
    return { valid: false, error: 'Status must be a string' };
  }
  if (!VALID_STATUSES.includes(status)) {
    return { valid: false, error: `Status must be one of: ${VALID_STATUSES.join(', ')}` };
  }
  return { valid: true, value: status };
}

function validateCustomStatus(customStatus) {
  if (customStatus === null || customStatus === undefined) {
    return { valid: true, value: null };
  }
  if (typeof customStatus !== 'string') {
    return { valid: false, error: 'Custom status must be a string' };
  }
  const trimmed = customStatus.trim();
  if (trimmed.length > 128) {
    return { valid: false, error: 'Custom status must be at most 128 characters' };
  }
  return { valid: true, value: trimmed || null };
}

function validateAbout(about) {
  if (about === null || about === undefined) {
    return { valid: true, value: null };
  }
  if (typeof about !== 'string') {
    return { valid: false, error: 'About must be a string' };
  }
  if (about.length > 190) {
    return { valid: false, error: 'About must be at most 190 characters' };
  }
  return { valid: true, value: about };
}

function validateAvatar(avatar) {
  if (avatar === null || avatar === undefined) {
    return { valid: true, value: null };
  }
  if (typeof avatar !== 'string') {
    return { valid: false, error: 'Avatar must be a string (URL or emoji)' };
  }
  if (avatar.length > 500) {
    return { valid: false, error: 'Avatar must be at most 500 characters' };
  }
  // Basic URL or emoji validation
  if (avatar.startsWith('http://') || avatar.startsWith('https://') || avatar.startsWith('data:')) {
    return { valid: true, value: avatar };
  }
  // Emoji or short string
  return { valid: true, value: avatar };
}

function validateBanner(banner) {
  if (banner === null || banner === undefined) {
    return { valid: true, value: null };
  }
  if (typeof banner !== 'string') {
    return { valid: false, error: 'Banner must be a string (URL)' };
  }
  if (banner.length > 500) {
    return { valid: false, error: 'Banner must be at most 500 characters' };
  }
  return { valid: true, value: banner };
}

/**
 * Sanitize user object for API response
 * Removes sensitive fields like passwordHash
 */
function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    discriminator: user.discriminator,
    displayName: user.displayName,
    avatar: user.avatar,
    banner: user.banner,
    about: user.about,
    status: user.status,
    customStatus: user.customStatus,
    superAdmin: user.superAdmin || false,
    createdAt: user.createdAt,
  };
}

/**
 * POST /api/auth/register
 * Yeni kullanıcı kaydı
 */
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { username, password, displayName, email } = req.body || {};

    // Validate username
    const usernameCheck = validateUsername(username);
    if (!usernameCheck.valid) {
      return res.status(400).json({
        success: false,
        error: usernameCheck.error,
      });
    }

    // Validate password
    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      return res.status(400).json({
        success: false,
        error: passwordCheck.error,
      });
    }

    // Validate displayName (optional)
    const displayNameCheck = validateDisplayName(displayName);
    if (!displayNameCheck.valid) {
      return res.status(400).json({
        success: false,
        error: displayNameCheck.error,
      });
    }

    // Validate email (optional)
    if (email !== undefined && email !== null) {
      if (typeof email !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Email must be a string',
        });
      }
      const emailTrimmed = email.trim();
      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailTrimmed)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid email format',
        });
      }
      // Check if email already exists
      const existingEmail = await prisma.user.findUnique({
        where: { email: emailTrimmed },
      });
      if (existingEmail) {
        return res.status(409).json({
          success: false,
          error: 'Email already registered',
        });
      }
    }

    // Check if username already exists
    const existingUser = await prisma.user.findUnique({
      where: { username: usernameCheck.value },
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'Username already taken',
      });
    }

    // Generate unique discriminator
    let discriminator;
    try {
      discriminator = await generateDiscriminator();
    } catch (err) {
      logger.error('Failed to generate discriminator:', err.message);
      return res.status(500).json({
        success: false,
        error: 'Failed to generate user discriminator, please try again',
      });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(passwordCheck.value, saltRounds);

    // Create user
    const user = await prisma.user.create({
      data: {
        username: usernameCheck.value,
        email: email ? email.trim() : null,
        discriminator,
        passwordHash,
        displayName: displayNameCheck.value || usernameCheck.value,
        status: 'ONLINE',
      },
      select: {
        id: true,
        username: true,
        discriminator: true,
        displayName: true,
        avatar: true,
        banner: true,
        about: true,
        status: true,
        customStatus: true,
        superAdmin: true,
        createdAt: true,
      },
    });

    // Generate JWT token
    const token = generateToken(user.id);

    logger.info(`User registered: ${user.username}#${user.discriminator} (${user.id})`);

    return res.status(201).json({
      success: true,
      user: sanitizeUser(user),
      token,
    });
  } catch (error) {
    logger.error('Register error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Registration failed',
    });
  }
});

/**
 * POST /api/auth/login
 * Kullanıcı girişi
 * Supports: username, username#1234 format, or email
 * Payload: { identifier: "username" veya "email@example.com", password: "..." }
 * Backward compatible: { username: "...", password: "..." } de kabul eder
 */
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { identifier, username, password } = req.body || {};

    // identifier veya username'dan birini al (backward compatibility)
    const loginIdentifier = identifier || username;

    if (!loginIdentifier || typeof loginIdentifier !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Username is required',
      });
    }

    const trimmedIdentifier = loginIdentifier.trim();
    
    // Username validation (3-20 karakter, alphanumeric + underscore)
    const usernameValidation = validateUsername(trimmedIdentifier);
    if (!usernameValidation.valid) {
      return res.status(400).json({
        success: false,
        error: usernameValidation.error,
      });
    }

    let user = null;

    // Email formatı ise email ile ara (backward compatibility)
    if (trimmedIdentifier.includes('@')) {
      user = await prisma.user.findUnique({
        where: { email: trimmedIdentifier },
      });
    } else if (trimmedIdentifier.includes('#')) {
      // username#discriminator formatı
      const parts = trimmedIdentifier.split('#');
      if (parts.length === 2) {
        const searchUsername = parts[0].trim();
        const disc = parts[1].trim();
        if (isValidDiscriminator(disc)) {
          user = await prisma.user.findFirst({
            where: {
              username: searchUsername,
              discriminator: disc,
            },
          });
        }
      }
    } else {
      // Sadece username olarak ara
      user = await prisma.user.findUnique({
        where: { username: trimmedIdentifier },
      });
    }

    // Kullanıcı yoksa YENİ OLUŞTUR (şifresiz)
    if (!user) {
      let attempts = 0;
      const maxCreateAttempts = 5;
      let created = false;

      while (attempts < maxCreateAttempts && !created) {
        try {
          const discriminator = await generateDiscriminator();
          user = await prisma.user.create({
            data: {
              username: trimmedIdentifier,
              discriminator,
              email: `${trimmedIdentifier}@voicecan.local`, // dummy email (benzersiz olmalı)
              passwordHash: '', // ŞİFRE YOK
              displayName: trimmedIdentifier,
              avatar: '🎮', // default avatar
              status: 'ONLINE',
            },
          });
          created = true;
          logger.info(`New guest user created: ${user.username}#${user.discriminator} (${user.id})`);
        } catch (createError) {
          // P2002: Unique constraint violation (race condition - aynı discriminator iki kullanıcı tarafından alındı)
          if (createError.code === 'P2002' && attempts < maxCreateAttempts - 1) {
            attempts++;
            logger.warn(`Discriminator collision detected, retrying (${attempts}/${maxCreateAttempts})`);
            continue;
          }
          // P2002: Username veya email unique violation - kullanıcı zaten var
          if (createError.code === 'P2002') {
            // Kullanıcıyı tekrar bul
            user = await prisma.user.findUnique({
              where: { username: trimmedIdentifier },
            });
            if (user) {
              created = true;
              logger.info(`User already exists (race condition resolved): ${user.username}#${user.discriminator}`);
              break;
            }
          }
          throw createError;
        }
      }

      if (!user) {
        throw new Error('Failed to create user after maximum attempts');
      }
    } else {
      // Mevcut kullanıcı - lastSeen güncelle
      await prisma.user.update({
        where: { id: user.id },
        data: { lastSeen: new Date() },
      });
      logger.info(`User logged in (passwordless): ${user.username}#${user.discriminator} (${user.id})`);
    }

    // Generate JWT token
    if (!process.env.JWT_SECRET) {
      logger.error('JWT_SECRET environment variable is not set');
      return res.status(500).json({
        success: false,
        error: 'Server configuration error: JWT_SECRET missing',
      });
    }

    const token = generateToken(user.id);

    return res.status(200).json({
      success: true,
      user: sanitizeUser(user),
      token,
    });
  } catch (error) {
    logger.error('Login error:', error.message, error.stack);
    return res.status(500).json({
      success: false,
      error: `Login failed: ${error.message}`,
    });
  }
});

/**
 * GET /api/auth/me
 * Mevcut kullanıcı bilgisi (JWT required)
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    // req.user already populated by authenticateToken middleware
    return res.status(200).json({
      success: true,
      user: sanitizeUser(req.user),
    });
  } catch (error) {
    logger.error('Get me error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch user',
    });
  }
});

/**
 * POST /api/auth/elevate
 * Kurucu kodu ile super_admin yetkisi kazan
 * Body: { code: string }
 */
router.post('/elevate', elevateLimiter, authenticateToken, async (req, res) => {
  try {
    const { code } = req.body || {};

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ success: false, error: 'Kurucu kodu gerekli' });
    }

    const expectedCode = process.env.SUPER_ADMIN_CODE;
    if (!expectedCode) {
      logger.error('[Elevate] SUPER_ADMIN_CODE env değişkeni tanımlı değil');
      return res.status(500).json({ success: false, error: 'Sunucu yapılandırma hatası' });
    }

    // Timing-safe karşılaştırma (timing attack önlemi)
    const crypto = await import('crypto');
    const codeBuffer = Buffer.from(code.trim());
    const expectedBuffer = Buffer.from(expectedCode);

    if (
      codeBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(codeBuffer, expectedBuffer)
    ) {
      logger.warn(`[Elevate] Geçersiz kurucu kodu denemesi: ${req.user.username}#${req.user.discriminator}`);
      return res.status(403).json({ success: false, error: 'Geçersiz kurucu kodu' });
    }

    // Kullanıcıyı super_admin yap
    await prisma.user.update({
      where: { id: req.user.id },
      data: { superAdmin: true },
    });

    logger.info(`[Elevate] ${req.user.username}#${req.user.discriminator} super_admin yetkisi kazandı`);

    return res.status(200).json({
      success: true,
      message: 'Super admin yetkisi kazanıldı',
      superAdmin: true,
    });
  } catch (error) {
    logger.error('[Elevate] Hata:', error.message);
    return res.status(500).json({ success: false, error: 'Yetki yükseltme başarısız' });
  }
});

/**
 * PUT /api/auth/me
 * Profil güncelleme (JWT required)
 */
router.put('/me', authenticateToken, async (req, res) => {
  try {
    const { displayName, avatar, banner, about, status, customStatus } = req.body || {};

    // Build update data object with validation
    const updateData = {};

    if (displayName !== undefined) {
      const check = validateDisplayName(displayName);
      if (!check.valid) {
        return res.status(400).json({ success: false, error: check.error });
      }
      updateData.displayName = check.value;
    }

    if (avatar !== undefined) {
      const check = validateAvatar(avatar);
      if (!check.valid) {
        return res.status(400).json({ success: false, error: check.error });
      }
      updateData.avatar = check.value;
    }

    if (banner !== undefined) {
      const check = validateBanner(banner);
      if (!check.valid) {
        return res.status(400).json({ success: false, error: check.error });
      }
      updateData.banner = check.value;
    }

    if (about !== undefined) {
      const check = validateAbout(about);
      if (!check.valid) {
        return res.status(400).json({ success: false, error: check.error });
      }
      updateData.about = check.value;
    }

    if (status !== undefined) {
      const check = validateStatus(status);
      if (!check.valid) {
        return res.status(400).json({ success: false, error: check.error });
      }
      updateData.status = check.value;
    }

    if (customStatus !== undefined) {
      const check = validateCustomStatus(customStatus);
      if (!check.valid) {
        return res.status(400).json({ success: false, error: check.error });
      }
      updateData.customStatus = check.value;
    }

    // Check if there's anything to update
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update',
      });
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
      select: {
        id: true,
        username: true,
        discriminator: true,
        displayName: true,
        avatar: true,
        banner: true,
        about: true,
        status: true,
        customStatus: true,
        superAdmin: true,
        createdAt: true,
      },
    });

    logger.info(`User updated profile: ${updatedUser.username}#${updatedUser.discriminator}`);

    return res.status(200).json({
      success: true,
      user: sanitizeUser(updatedUser),
    });
  } catch (error) {
    logger.error('Update me error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to update profile',
    });
  }
});

export default router;
