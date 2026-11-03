/**
 * User Settings Routes - FAZ 7
 * User preferences and developer mode
 * 
 * GET /api/users/me/settings - Get user settings
 * PUT /api/users/me/settings - Update user settings
 * GET /api/users/me/developer - Get developer mode status
 * PUT /api/users/me/developer - Update developer mode
 */

import { Router } from 'express';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import { safeJsonParse } from '../utils/safeJsonParse.js';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * Helper: Get or create user settings
 */
async function getOrCreateSettings(userId) {
  let settings = await prisma.userSettings.findUnique({
    where: { userId }
  });

  if (!settings) {
    // Create default settings
    settings = await prisma.userSettings.create({
      data: {
        userId,
        theme: 'DARK',
        language: 'tr',
        fontSize: 'MEDIUM',
        notifications: JSON.stringify({ desktop: true, sound: true, mentions: true }),
        privacy: JSON.stringify({ showOnlineStatus: true, allowFriendRequests: true, allowDMsFromStrangers: false }),
        audio: JSON.stringify({ inputVolume: 100, outputVolume: 100, noiseSuppression: true, echoCancellation: true }),
        developerMode: false
      }
    });
  }

  return settings;
}

/**
 * Helper: Validate theme
 */
function validateTheme(theme) {
  const validThemes = ['DARK', 'LIGHT'];
  if (!validThemes.includes(theme)) {
    return { valid: false, error: 'Theme must be DARK or LIGHT' };
  }
  return { valid: true };
}

/**
 * Helper: Validate language
 */
function validateLanguage(language) {
  const validLanguages = ['tr', 'en'];
  if (!validLanguages.includes(language)) {
    return { valid: false, error: 'Language must be tr or en' };
  }
  return { valid: true };
}

/**
 * Helper: Validate font size
 */
function validateFontSize(fontSize) {
  const validSizes = ['SMALL', 'MEDIUM', 'LARGE'];
  if (!validSizes.includes(fontSize)) {
    return { valid: false, error: 'Font size must be SMALL, MEDIUM, or LARGE' };
  }
  return { valid: true };
}

/**
 * Helper: Validate notifications settings
 */
function validateNotifications(notifications) {
  if (typeof notifications !== 'object' || notifications === null) {
    return { valid: false, error: 'Notifications must be an object' };
  }

  const valid = {};
  const allowedKeys = ['desktop', 'sound', 'mentions'];

  for (const key of allowedKeys) {
    if (key in notifications) {
      if (typeof notifications[key] !== 'boolean') {
        return { valid: false, error: `${key} must be a boolean` };
      }
      valid[key] = notifications[key];
    }
  }

  return { valid: true, value: valid };
}

/**
 * Helper: Validate privacy settings
 */
function validatePrivacy(privacy) {
  if (typeof privacy !== 'object' || privacy === null) {
    return { valid: false, error: 'Privacy must be an object' };
  }

  const valid = {};
  const allowedKeys = ['showOnlineStatus', 'allowFriendRequests', 'allowDMsFromStrangers'];

  for (const key of allowedKeys) {
    if (key in privacy) {
      if (typeof privacy[key] !== 'boolean') {
        return { valid: false, error: `${key} must be a boolean` };
      }
      valid[key] = privacy[key];
    }
  }

  return { valid: true, value: valid };
}

/**
 * Helper: Validate audio settings
 */
function validateAudio(audio) {
  if (typeof audio !== 'object' || audio === null) {
    return { valid: false, error: 'Audio must be an object' };
  }

  const valid = {};
  const booleanKeys = ['noiseSuppression', 'echoCancellation'];
  const numberKeys = ['inputVolume', 'outputVolume'];
  const stringKeys = ['inputDevice', 'outputDevice'];

  // Validate boolean fields
  for (const key of booleanKeys) {
    if (key in audio) {
      if (typeof audio[key] !== 'boolean') {
        return { valid: false, error: `${key} must be a boolean` };
      }
      valid[key] = audio[key];
    }
  }

  // Validate number fields (0-100)
  for (const key of numberKeys) {
    if (key in audio) {
      const val = parseInt(audio[key]);
      if (isNaN(val) || val < 0 || val > 100) {
        return { valid: false, error: `${key} must be a number between 0 and 100` };
      }
      valid[key] = val;
    }
  }

  // Validate string fields
  for (const key of stringKeys) {
    if (key in audio) {
      if (typeof audio[key] !== 'string' || audio[key].length > 200) {
        return { valid: false, error: `${key} must be a string up to 200 characters` };
      }
      valid[key] = audio[key];
    }
  }

  return { valid: true, value: valid };
}

/**
 * GET /api/users/me/settings
 * Get user settings
 */
router.get('/me/settings', async (req, res) => {
  try {
    const userId = req.user.id;

    const settings = await getOrCreateSettings(userId);

    res.json({
      success: true,
      settings: {
        theme: settings.theme,
        language: settings.language,
        fontSize: settings.fontSize,
        notifications: safeJsonParse(settings.notifications) || { desktop: true, sound: true, mentions: true },
        privacy: safeJsonParse(settings.privacy) || { showOnlineStatus: true, allowFriendRequests: true, allowDMsFromStrangers: false },
        audio: safeJsonParse(settings.audio) || { inputVolume: 100, outputVolume: 100, noiseSuppression: true, echoCancellation: true },
        developerMode: settings.developerMode,
        clientId: settings.clientId
      }
    });
  } catch (error) {
    logger.error('Get settings error:', error);
    res.status(500).json({ success: false, error: 'Failed to get settings' });
  }
});

/**
 * PUT /api/users/me/settings
 * Update user settings (partial update)
 */
router.put('/me/settings', async (req, res) => {
  try {
    const userId = req.user.id;
    const updates = req.body || {};

    // Get or create settings
    const settings = await getOrCreateSettings(userId);

    const updateData = {};

    // Validate and update theme
    if (updates.theme !== undefined) {
      const themeCheck = validateTheme(updates.theme);
      if (!themeCheck.valid) {
        return res.status(400).json({ success: false, error: themeCheck.error });
      }
      updateData.theme = updates.theme;
    }

    // Validate and update language
    if (updates.language !== undefined) {
      const langCheck = validateLanguage(updates.language);
      if (!langCheck.valid) {
        return res.status(400).json({ success: false, error: langCheck.error });
      }
      updateData.language = updates.language;
    }

    // Validate and update fontSize
    if (updates.fontSize !== undefined) {
      const sizeCheck = validateFontSize(updates.fontSize);
      if (!sizeCheck.valid) {
        return res.status(400).json({ success: false, error: sizeCheck.error });
      }
      updateData.fontSize = updates.fontSize;
    }

    // Validate and update notifications
    if (updates.notifications !== undefined) {
      const notifCheck = validateNotifications(updates.notifications);
      if (!notifCheck.valid) {
        return res.status(400).json({ success: false, error: notifCheck.error });
      }
      // Merge with existing
      const existing = safeJsonParse(settings.notifications) || { desktop: true, sound: true, mentions: true };
      updateData.notifications = JSON.stringify({ ...existing, ...notifCheck.value });
    }

    // Validate and update privacy
    if (updates.privacy !== undefined) {
      const privCheck = validatePrivacy(updates.privacy);
      if (!privCheck.valid) {
        return res.status(400).json({ success: false, error: privCheck.error });
      }
      // Merge with existing
      const existing = safeJsonParse(settings.privacy) || { showOnlineStatus: true, allowFriendRequests: true, allowDMsFromStrangers: false };
      updateData.privacy = JSON.stringify({ ...existing, ...privCheck.value });
    }

    // Validate and update audio
    if (updates.audio !== undefined) {
      const audioCheck = validateAudio(updates.audio);
      if (!audioCheck.valid) {
        return res.status(400).json({ success: false, error: audioCheck.error });
      }
      // Merge with existing
      const existing = safeJsonParse(settings.audio) || { inputVolume: 100, outputVolume: 100, noiseSuppression: true, echoCancellation: true };
      updateData.audio = JSON.stringify({ ...existing, ...audioCheck.value });
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }

    // Update settings
    const updated = await prisma.userSettings.update({
      where: { userId },
      data: updateData
    });

    logger.info(`Settings updated for ${userId}: ${Object.keys(updateData).join(', ')}`);

    res.json({
      success: true,
      settings: {
        theme: updated.theme,
        language: updated.language,
        fontSize: updated.fontSize,
        notifications: safeJsonParse(updated.notifications) || { desktop: true, sound: true, mentions: true },
        privacy: safeJsonParse(updated.privacy) || { showOnlineStatus: true, allowFriendRequests: true, allowDMsFromStrangers: false },
        audio: safeJsonParse(updated.audio) || { inputVolume: 100, outputVolume: 100, noiseSuppression: true, echoCancellation: true },
        developerMode: updated.developerMode,
        clientId: updated.clientId
      }
    });
  } catch (error) {
    logger.error('Update settings error:', error);
    res.status(500).json({ success: false, error: 'Failed to update settings' });
  }
});

/**
 * GET /api/users/me/developer
 * Get developer mode status
 */
router.get('/me/developer', async (req, res) => {
  try {
    const userId = req.user.id;

    const settings = await getOrCreateSettings(userId);

    res.json({
      success: true,
      developerMode: settings.developerMode,
      clientId: settings.clientId
    });
  } catch (error) {
    logger.error('Get developer mode error:', error);
    res.status(500).json({ success: false, error: 'Failed to get developer mode' });
  }
});

/**
 * PUT /api/users/me/developer
 * Update developer mode
 */
router.put('/me/developer', async (req, res) => {
  try {
    const userId = req.user.id;
    const { developerMode } = req.body || {};

    if (typeof developerMode !== 'boolean') {
      return res.status(400).json({ success: false, error: 'developerMode must be a boolean' });
    }

    const settings = await getOrCreateSettings(userId);

    const updateData = { developerMode };

    // Generate clientId if enabling developer mode and doesn't have one
    if (developerMode && !settings.clientId) {
      updateData.clientId = crypto.randomUUID();
    }

    // Update settings
    const updated = await prisma.userSettings.update({
      where: { userId },
      data: updateData
    });

    logger.info(`Developer mode ${developerMode ? 'enabled' : 'disabled'} for ${userId}`);

    res.json({
      success: true,
      developerMode: updated.developerMode,
      clientId: updated.clientId
    });
  } catch (error) {
    logger.error('Update developer mode error:', error);
    res.status(500).json({ success: false, error: 'Failed to update developer mode' });
  }
});

export default router;
