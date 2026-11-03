/**
 * Friends & Blocks Routes
 * Arkadaşlık ve engelleme sistemi
 * 
 * POST /api/friends/request - Arkadaşlık isteği gönder
 * GET /api/friends - Arkadaşları ve bekleyen istekleri listele
 * PUT /api/friends/request/:id/accept - İsteği kabul et
 * PUT /api/friends/request/:id/reject - İsteği reddet
 * DELETE /api/friends/:id - Arkadaşlığı sonlandır
 * 
 * POST /api/blocks - Kullanıcı engelle
 * DELETE /api/blocks/:userId - Engeli kaldır
 * GET /api/blocks - Engellenen kullanıcıları listele
 */

import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { logger } from '../utils/logger.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Tüm route'lar JWT authentication gerektirir
router.use(authenticateToken);

/**
 * Parse username#discriminator format
 * @param {string} input - "username#1234" formatında string
 * @returns {{ username: string, discriminator: string } | null}
 */
function parseUsernameDiscriminator(input) {
  if (!input || typeof input !== 'string') return null;
  
  const trimmed = input.trim();
  if (!trimmed.includes('#')) return null;
  
  const parts = trimmed.split('#');
  if (parts.length !== 2) return null;
  
  const username = parts[0].trim();
  const discriminator = parts[1].trim();
  
  // Discriminator 4 haneli sayı olmalı
  if (!/^\d{4}$/.test(discriminator)) return null;
  
  return { username, discriminator };
}

/**
 * Sanitize user object for friend response
 */
function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    discriminator: user.discriminator,
    displayName: user.displayName,
    avatar: user.avatar,
    status: user.status,
    customStatus: user.customStatus,
  };
}

/**
 * POST /api/friends/request
 * Arkadaşlık isteği gönder
 */
router.post('/request', async (req, res) => {
  try {
    const { username } = req.body || {};

    if (!username || typeof username !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Username is required (format: username#1234)',
      });
    }

    // Parse username#discriminator
    const parsed = parseUsernameDiscriminator(username);
    if (!parsed) {
      return res.status(400).json({
        success: false,
        error: 'Invalid username format. Use username#1234',
      });
    }

    // Kendine istek gönderemez
    if (parsed.username === req.user.username && parsed.discriminator === req.user.discriminator) {
      return res.status(400).json({
        success: false,
        error: 'You cannot send a friend request to yourself',
      });
    }

    // Hedef kullanıcıyı bul
    const targetUser = await prisma.user.findFirst({
      where: {
        username: parsed.username,
        discriminator: parsed.discriminator,
      },
    });

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Engelleme kontrolü
    const blockExists = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: req.user.id, blockedId: targetUser.id },
          { blockerId: targetUser.id, blockedId: req.user.id },
        ],
      },
    });

    if (blockExists) {
      return res.status(403).json({
        success: false,
        error: 'Cannot send friend request to this user',
      });
    }

    // Zaten arkadaş mı kontrol et
    const existingFriendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userId: req.user.id, friendId: targetUser.id, status: 'ACCEPTED' },
          { userId: targetUser.id, friendId: req.user.id, status: 'ACCEPTED' },
        ],
      },
    });

    if (existingFriendship) {
      return res.status(409).json({
        success: false,
        error: 'You are already friends with this user',
      });
    }

    // Zaten bekleyen istek var mı kontrol et
    const existingRequest = await prisma.friendRequest.findFirst({
      where: {
        OR: [
          { fromUserId: req.user.id, toUserId: targetUser.id, status: 'PENDING' },
          { fromUserId: targetUser.id, toUserId: req.user.id, status: 'PENDING' },
        ],
      },
    });

    if (existingRequest) {
      return res.status(409).json({
        success: false,
        error: 'A friend request already exists between you and this user',
      });
    }

    // Arkadaşlık isteği oluştur
    const friendRequest = await prisma.friendRequest.create({
      data: {
        fromUserId: req.user.id,
        toUserId: targetUser.id,
        status: 'PENDING',
      },
    });

    logger.info(`Friend request sent: ${req.user.username}#${req.user.discriminator} -> ${targetUser.username}#${targetUser.discriminator}`);

    return res.status(201).json({
      success: true,
      requestId: friendRequest.id,
    });
  } catch (error) {
    logger.error('Send friend request error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to send friend request',
    });
  }
});

/**
 * GET /api/friends
 * Arkadaşları ve bekleyen istekleri listele
 */
router.get('/', async (req, res) => {
  try {
    // Kabul edilmiş arkadaşlıkları getir
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { userId: req.user.id, status: 'ACCEPTED' },
          { friendId: req.user.id, status: 'ACCEPTED' },
        ],
      },
      include: {
        user: true,
        friend: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Bekleyen gelen istekleri getir (kullanıcıya gönderilen)
    const incomingRequests = await prisma.friendRequest.findMany({
      where: {
        toUserId: req.user.id,
        status: 'PENDING',
      },
      include: {
        fromUser: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Bekleyen giden istekleri getir (kullanıcının gönderdiği)
    const outgoingRequests = await prisma.friendRequest.findMany({
      where: {
        fromUserId: req.user.id,
        status: 'PENDING',
      },
      include: {
        toUser: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Arkadaşları formatla
    const friends = friendships.map((friendship) => {
      const friendUser = friendship.userId === req.user.id ? friendship.friend : friendship.user;
      return {
        id: friendship.id,
        user: sanitizeUser(friendUser),
        status: friendship.status,
        since: friendship.createdAt,
      };
    });

    // Gelen istekleri formatla
    const pendingIncoming = incomingRequests.map((request) => ({
      id: request.id,
      from: sanitizeUser(request.fromUser),
      status: request.status,
      createdAt: request.createdAt,
    }));

    // Giden istekleri formatla
    const pendingOutgoing = outgoingRequests.map((request) => ({
      id: request.id,
      to: sanitizeUser(request.toUser),
      status: request.status,
      createdAt: request.createdAt,
    }));

    return res.status(200).json({
      success: true,
      friends,
      pendingRequests: {
        incoming: pendingIncoming,
        outgoing: pendingOutgoing,
      },
    });
  } catch (error) {
    logger.error('Get friends error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch friends',
    });
  }
});

/**
 * PUT /api/friends/request/:id/accept
 * Arkadaşlık isteğini kabul et
 */
router.put('/request/:id/accept', async (req, res) => {
  try {
    const { id } = req.params;

    // İsteği bul
    const friendRequest = await prisma.friendRequest.findUnique({
      where: { id },
    });

    if (!friendRequest) {
      return res.status(404).json({
        success: false,
        error: 'Friend request not found',
      });
    }

    // İstek bu kullanıcıya mı gönderilmiş kontrol et
    if (friendRequest.toUserId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'You can only accept requests sent to you',
      });
    }

    // İstek zaten işlenmiş mi kontrol et
    if (friendRequest.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        error: 'This friend request has already been processed',
      });
    }

    // Transaction ile arkadaşlık oluştur ve isteği güncelle
    await prisma.$transaction(async (tx) => {
      // Arkadaşlık kaydı oluştur (bidirectional)
      await tx.friendship.create({
        data: {
          userId: friendRequest.fromUserId,
          friendId: friendRequest.toUserId,
          status: 'ACCEPTED',
        },
      });

      // İsteği ACCEPTED olarak işaretle
      await tx.friendRequest.update({
        where: { id },
        data: { status: 'ACCEPTED' },
      });
    });

    logger.info(`Friend request accepted: ${req.user.username}#${req.user.discriminator} accepted request ${id}`);

    return res.status(200).json({
      success: true,
      message: 'Friend request accepted',
    });
  } catch (error) {
    logger.error('Accept friend request error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to accept friend request',
    });
  }
});

/**
 * PUT /api/friends/request/:id/reject
 * Arkadaşlık isteğini reddet
 */
router.put('/request/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;

    // İsteği bul
    const friendRequest = await prisma.friendRequest.findUnique({
      where: { id },
    });

    if (!friendRequest) {
      return res.status(404).json({
        success: false,
        error: 'Friend request not found',
      });
    }

    // İstek bu kullanıcıya mı gönderilmiş kontrol et
    if (friendRequest.toUserId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'You can only reject requests sent to you',
      });
    }

    // İstek zaten işlenmiş mi kontrol et
    if (friendRequest.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        error: 'This friend request has already been processed',
      });
    }

    // İsteği REJECTED olarak işaretle
    await prisma.friendRequest.update({
      where: { id },
      data: { status: 'REJECTED' },
    });

    logger.info(`Friend request rejected: ${req.user.username}#${req.user.discriminator} rejected request ${id}`);

    return res.status(200).json({
      success: true,
      message: 'Friend request rejected',
    });
  } catch (error) {
    logger.error('Reject friend request error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to reject friend request',
    });
  }
});

/**
 * DELETE /api/friends/:id
 * Arkadaşlığı sonlandır
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Arkadaşlığı bul
    const friendship = await prisma.friendship.findUnique({
      where: { id },
    });

    if (!friendship) {
      return res.status(404).json({
        success: false,
        error: 'Friendship not found',
      });
    }

    // Bu arkadaşlık bu kullanıcıya ait mi kontrol et
    if (friendship.userId !== req.user.id && friendship.friendId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'You can only delete your own friendships',
      });
    }

    // Arkadaşlığı sil
    await prisma.friendship.delete({
      where: { id },
    });

    logger.info(`Friendship deleted: ${req.user.username}#${req.user.discriminator} removed friendship ${id}`);

    return res.status(200).json({
      success: true,
      message: 'Friendship removed',
    });
  } catch (error) {
    logger.error('Delete friendship error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete friendship',
    });
  }
});

/**
 * POST /api/blocks
 * Kullanıcı engelle
 */
router.post('/blocks', async (req, res) => {
  try {
    const { userId } = req.body || {};

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'userId is required',
      });
    }

    // Kendini engelleyemez
    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        error: 'You cannot block yourself',
      });
    }

    // Hedef kullanıcı var mı kontrol et
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Zaten engellenmiş mi kontrol et
    const existingBlock = await prisma.block.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId: req.user.id,
          blockedId: userId,
        },
      },
    });

    if (existingBlock) {
      return res.status(409).json({
        success: false,
        error: 'User is already blocked',
      });
    }

    // Transaction ile engelle ve varsa arkadaşlığı sil
    await prisma.$transaction(async (tx) => {
      // Block kaydı oluştur
      await tx.block.create({
        data: {
          blockerId: req.user.id,
          blockedId: userId,
        },
      });

      // Varsa arkadaşlığı sil
      await tx.friendship.deleteMany({
        where: {
          OR: [
            { userId: req.user.id, friendId: userId },
            { userId: userId, friendId: req.user.id },
          ],
        },
      });

      // Varsa bekleyen istekleri sil
      await tx.friendRequest.deleteMany({
        where: {
          OR: [
            { fromUserId: req.user.id, toUserId: userId },
            { fromUserId: userId, toUserId: req.user.id },
          ],
          status: 'PENDING',
        },
      });
    });

    logger.info(`User blocked: ${req.user.username}#${req.user.discriminator} blocked ${targetUser.username}#${targetUser.discriminator}`);

    return res.status(201).json({
      success: true,
      message: 'User blocked successfully',
    });
  } catch (error) {
    logger.error('Block user error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to block user',
    });
  }
});

/**
 * DELETE /api/blocks/:userId
 * Engeli kaldır
 */
router.delete('/blocks/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Engeli bul
    const block = await prisma.block.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId: req.user.id,
          blockedId: userId,
        },
      },
    });

    if (!block) {
      return res.status(404).json({
        success: false,
        error: 'Block not found',
      });
    }

    // Engeli sil
    await prisma.block.delete({
      where: {
        blockerId_blockedId: {
          blockerId: req.user.id,
          blockedId: userId,
        },
      },
    });

    logger.info(`User unblocked: ${req.user.username}#${req.user.discriminator} unblocked ${userId}`);

    return res.status(200).json({
      success: true,
      message: 'User unblocked successfully',
    });
  } catch (error) {
    logger.error('Unblock user error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to unblock user',
    });
  }
});

/**
 * GET /api/blocks
 * Engellenen kullanıcıları listele
 */
router.get('/blocks', async (req, res) => {
  try {
    const blocks = await prisma.block.findMany({
      where: {
        blockerId: req.user.id,
      },
      include: {
        blocked: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const blockedUsers = blocks.map((block) => ({
      id: block.id,
      user: sanitizeUser(block.blocked),
      blockedAt: block.createdAt,
    }));

    return res.status(200).json({
      success: true,
      blockedUsers,
    });
  } catch (error) {
    logger.error('Get blocks error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch blocked users',
    });
  }
});

export default router;
