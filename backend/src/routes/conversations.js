/**
 * Conversation Routes (FAZ 5)
 * Direct Message (DM) ve Group DM sistemi:
 * - DM oluşturma/getirme
 * - Group DM oluşturma
 * - Member yönetimi (ekleme/çıkarma)
 * - Conversation mesajlaşma
 * - Socket.io entegrasyonu
 */

import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { logger } from '../utils/logger.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Tüm route'lar JWT authentication gerektirir
router.use(authenticateToken);

/**
 * Helper: Format conversation for API response
 */
function formatConversation(conv) {
  return {
    id: conv.id,
    type: conv.type,
    name: conv.name,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    members: (conv.members || []).map((m) => ({
      id: m.id,
      userId: m.userId,
      joinedAt: m.joinedAt,
      user: m.user
        ? {
            id: m.user.id,
            username: m.user.username,
            discriminator: m.user.discriminator,
            displayName: m.user.displayName,
            avatar: m.user.avatar,
          }
        : null,
    })),
    lastMessage: conv.messages && conv.messages[0]
      ? {
          id: conv.messages[0].id,
          content: conv.messages[0].content,
          userId: conv.messages[0].userId,
          createdAt: conv.messages[0].createdAt,
          author: conv.messages[0].user
            ? {
                id: conv.messages[0].user.id,
                username: conv.messages[0].user.username,
                discriminator: conv.messages[0].user.discriminator,
                displayName: conv.messages[0].user.displayName,
                avatar: conv.messages[0].user.avatar,
              }
            : null,
        }
      : null,
  };
}

/**
 * POST /api/conversations/dm
 * DM conversation oluştur veya mevcut olanı getir
 * - Block kontrolü
 * - Mevcut DM varsa onu döndür
 * - Yoksa yeni oluştur
 */
router.post('/conversations/dm', async (req, res) => {
  try {
    const { userId } = req.body;
    const currentUserId = req.user.id;

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    if (userId === currentUserId) {
      return res.status(400).json({ success: false, error: 'Cannot create DM with yourself' });
    }

    // Target user var mı?
    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Block kontrolü
    const block = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: currentUserId, blockedId: userId },
          { blockerId: userId, blockedId: currentUserId },
        ],
      },
    });
    if (block) {
      return res.status(403).json({ success: false, error: 'Cannot create conversation with blocked user' });
    }

    // Mevcut DM conversation var mı?
    // Güvenli sorgu: currentUserId'yi içeren tüm DM'leri getir, client-side'da filtrele
    const existingDMs = await prisma.conversation.findMany({
      where: {
        type: 'DM',
        members: {
          some: { userId: currentUserId }
        }
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                discriminator: true,
                displayName: true,
                avatar: true,
              },
            },
          },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                discriminator: true,
                displayName: true,
                avatar: true,
              },
            },
          },
        },
      },
    });

    // Client-side: tam olarak 2 üyeli VE her iki kullanıcıyı da içeren conversation'ı bul
    const existingConversation = existingDMs.find(conv => {
      if (conv.members.length !== 2) return false;
      const memberIds = conv.members.map(m => m.userId);
      return memberIds.includes(currentUserId) && memberIds.includes(userId);
    });

    if (existingConversation) {
      return res.json({ success: true, conversation: formatConversation(existingConversation) });
    }

    // Yeni DM conversation oluştur
    const conversation = await prisma.conversation.create({
      data: {
        type: 'DM',
        members: {
          create: [{ userId: currentUserId }, { userId }],
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                discriminator: true,
                displayName: true,
                avatar: true,
              },
            },
          },
        },
      },
    });

    // Socket.io broadcast
    const io = req.app.get('io');
    if (io) {
      io.to(currentUserId).emit('conversation:added', formatConversation(conversation));
      io.to(userId).emit('conversation:added', formatConversation(conversation));
    }

    logger.info(`DM conversation created: ${conversation.id} between ${currentUserId} and ${userId}`);

    res.status(201).json({ success: true, conversation: formatConversation(conversation) });
  } catch (error) {
    logger.error('Error creating DM conversation:', error);
    res.status(500).json({ success: false, error: 'Failed to create conversation' });
  }
});

/**
 * GET /api/conversations
 * Kullanıcının tüm conversation'larını listele (DM + Group DM)
 */
router.get('/conversations', async (req, res) => {
  try {
    const userId = req.user.id;

    const conversations = await prisma.conversation.findMany({
      where: {
        members: { some: { userId } },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                discriminator: true,
                displayName: true,
                avatar: true,
              },
            },
          },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                discriminator: true,
                displayName: true,
                avatar: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({
      success: true,
      conversations: conversations.map(formatConversation),
    });
  } catch (error) {
    logger.error('Error fetching conversations:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch conversations' });
  }
});

/**
 * POST /api/conversations/group
 * Group DM conversation oluştur
 * - 2-10 kullanıcı (sender dahil değil)
 * - Name zorunlu (1-100 karakter)
 */
router.post('/conversations/group', async (req, res) => {
  try {
    const { name, userIds } = req.body;
    const currentUserId = req.user.id;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }
    if (name.length > 100) {
      return res.status(400).json({ success: false, error: 'Name must be 100 characters or less' });
    }

    if (!Array.isArray(userIds) || userIds.length < 2 || userIds.length > 10) {
      return res.status(400).json({ success: false, error: 'userIds must be an array of 2-10 users' });
    }

    if (userIds.includes(currentUserId)) {
      return res.status(400).json({ success: false, error: 'Cannot include yourself in userIds' });
    }

    // Tüm kullanıcılar var mı?
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
    });
    if (users.length !== userIds.length) {
      return res.status(400).json({ success: false, error: 'Some users not found' });
    }

    // Group DM oluştur (sender + userIds)
    const allUserIds = [currentUserId, ...userIds];
    const conversation = await prisma.conversation.create({
      data: {
        type: 'GROUP_DM',
        name: name.trim(),
        members: {
          create: allUserIds.map((uid) => ({ userId: uid })),
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                discriminator: true,
                displayName: true,
                avatar: true,
              },
            },
          },
        },
      },
    });

    // Socket.io broadcast
    const io = req.app.get('io');
    if (io) {
      allUserIds.forEach((uid) => {
        io.to(uid).emit('conversation:added', formatConversation(conversation));
      });
    }

    logger.info(`Group DM created: ${conversation.id} by ${currentUserId} with ${userIds.length} users`);

    res.status(201).json({ success: true, conversation: formatConversation(conversation) });
  } catch (error) {
    logger.error('Error creating group conversation:', error);
    res.status(500).json({ success: false, error: 'Failed to create group conversation' });
  }
});

/**
 * POST /api/conversations/:id/members
 * Group DM'e member ekle
 */
router.post('/conversations/:id/members', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    const currentUserId = req.user.id;

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { members: true },
    });
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }
    if (conversation.type !== 'GROUP_DM') {
      return res.status(400).json({ success: false, error: 'Can only add members to group conversations' });
    }

    // Member kontrolü
    const isMember = conversation.members.some((m) => m.userId === currentUserId);
    if (!isMember) {
      return res.status(403).json({ success: false, error: 'Not a member of this conversation' });
    }

    // Zaten member mı?
    const existingMember = conversation.members.find((m) => m.userId === userId);
    if (existingMember) {
      return res.status(400).json({ success: false, error: 'User is already a member' });
    }

    // Target user var mı?
    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const member = await prisma.conversationMember.create({
      data: { conversationId: id, userId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            discriminator: true,
            displayName: true,
            avatar: true,
          },
        },
      },
    });

    // Socket.io broadcast
    const io = req.app.get('io');
    if (io) {
      const updatedConv = {
        ...conversation,
        members: [...conversation.members, member],
      };
      io.to(id).emit('conversation:update', formatConversation(updatedConv));
      io.to(userId).emit('conversation:added', formatConversation(updatedConv));
    }

    logger.info(`Member ${userId} added to conversation ${id}`);

    res.status(201).json({ success: true, member });
  } catch (error) {
    logger.error('Error adding member:', error);
    res.status(500).json({ success: false, error: 'Failed to add member' });
  }
});

/**
 * DELETE /api/conversations/:id/members/:userId
 * Group DM'den member çıkar (kendi kendini veya başkasını)
 */
router.delete('/conversations/:id/members/:userId', async (req, res) => {
  try {
    const { id, userId } = req.params;
    const currentUserId = req.user.id;

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { members: true },
    });
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }
    if (conversation.type !== 'GROUP_DM') {
      return res.status(400).json({ success: false, error: 'Can only remove members from group conversations' });
    }

    // Member kontrolü
    const isMember = conversation.members.some((m) => m.userId === currentUserId);
    if (!isMember) {
      return res.status(403).json({ success: false, error: 'Not a member of this conversation' });
    }

    // Kendini mi çıkarıyor?
    const targetUserId = userId === 'me' ? currentUserId : userId;

    const member = conversation.members.find((m) => m.userId === targetUserId);
    if (!member) {
      return res.status(404).json({ success: false, error: 'Member not found' });
    }

    await prisma.conversationMember.delete({ where: { id: member.id } });

    // Socket.io broadcast
    const io = req.app.get('io');
    if (io) {
      const updatedMembers = conversation.members.filter((m) => m.userId !== targetUserId);
      const updatedConv = { ...conversation, members: updatedMembers };
      io.to(id).emit('conversation:update', formatConversation(updatedConv));
      io.to(targetUserId).emit('conversation:removed', { conversationId: id });
    }

    logger.info(`Member ${targetUserId} removed from conversation ${id}`);

    res.json({ success: true, message: 'Member removed' });
  } catch (error) {
    logger.error('Error removing member:', error);
    res.status(500).json({ success: false, error: 'Failed to remove member' });
  }
});

/**
 * PUT /api/conversations/:id
 * Group DM'in ismini değiştir
 */
router.put('/conversations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const currentUserId = req.user.id;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }
    if (name.length > 100) {
      return res.status(400).json({ success: false, error: 'Name must be 100 characters or less' });
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { members: true },
    });
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }
    if (conversation.type !== 'GROUP_DM') {
      return res.status(400).json({ success: false, error: 'Can only rename group conversations' });
    }

    const isMember = conversation.members.some((m) => m.userId === currentUserId);
    if (!isMember) {
      return res.status(403).json({ success: false, error: 'Not a member of this conversation' });
    }

    const updated = await prisma.conversation.update({
      where: { id },
      data: { name: name.trim(), updatedAt: new Date() },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                discriminator: true,
                displayName: true,
                avatar: true,
              },
            },
          },
        },
      },
    });

    // Socket.io broadcast
    const io = req.app.get('io');
    if (io) {
      io.to(id).emit('conversation:update', formatConversation(updated));
    }

    logger.info(`Conversation ${id} renamed to "${name.trim()}"`);

    res.json({ success: true, conversation: formatConversation(updated) });
  } catch (error) {
    logger.error('Error updating conversation:', error);
    res.status(500).json({ success: false, error: 'Failed to update conversation' });
  }
});

/**
 * POST /api/conversations/:id/messages
 * Conversation'a mesaj gönder
 */
router.post('/conversations/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    const { content, replyTo } = req.body;
    const userId = req.user.id;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Content is required' });
    }
    if (content.length > 2000) {
      return res.status(400).json({ success: false, error: 'Content must be 2000 characters or less' });
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { members: true },
    });
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const isMember = conversation.members.some((m) => m.userId === userId);
    if (!isMember) {
      return res.status(403).json({ success: false, error: 'Not a member of this conversation' });
    }

    if (replyTo) {
      const replyMessage = await prisma.message.findFirst({
        where: { id: replyTo, conversationId: id },
      });
      if (!replyMessage) {
        return res.status(400).json({ success: false, error: 'Invalid replyTo message' });
      }
    }

    const message = await prisma.message.create({
      data: {
        content: content.trim(),
        conversationId: id,
        userId,
        replyToId: replyTo || null,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            discriminator: true,
            displayName: true,
            avatar: true,
          },
        },
      },
    });

    // Conversation updatedAt güncelle
    await prisma.conversation.update({
      where: { id },
      data: { updatedAt: new Date() },
    });

    // Socket.io broadcast
    const io = req.app.get('io');
    if (io) {
      io.to(id).emit('conversation:message:new', {
        id: message.id,
        content: message.content,
        userId: message.userId,
        conversationId: message.conversationId,
        createdAt: message.createdAt,
        replyToId: message.replyToId,
        author: {
          id: message.user.id,
          username: message.user.username,
          discriminator: message.user.discriminator,
          displayName: message.user.displayName,
          avatar: message.user.avatar,
        },
      });
    }

    logger.info(`Message created in conversation ${id} by ${userId}`);

    res.status(201).json({
      success: true,
      message: {
        id: message.id,
        content: message.content,
        userId: message.userId,
        conversationId: message.conversationId,
        createdAt: message.createdAt,
        replyToId: message.replyToId,
        author: {
          id: message.user.id,
          username: message.user.username,
          discriminator: message.user.discriminator,
          displayName: message.user.displayName,
          avatar: message.user.avatar,
        },
      },
    });
  } catch (error) {
    logger.error('Error creating conversation message:', error);
    res.status(500).json({ success: false, error: 'Failed to create message' });
  }
});

/**
 * GET /api/conversations/:id/messages
 * Conversation mesajlarını getir (pagination)
 */
router.get('/conversations/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = '50', before } = req.query;
    const userId = req.user.id;

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { members: true },
    });
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const isMember = conversation.members.some((m) => m.userId === userId);
    if (!isMember) {
      return res.status(403).json({ success: false, error: 'Not a member of this conversation' });
    }

    const limitNum = Math.min(parseInt(limit) || 50, 100);

    const where = { conversationId: id };
    if (before) {
      const beforeMessage = await prisma.message.findUnique({ where: { id: before } });
      if (beforeMessage) {
        where.createdAt = { lt: beforeMessage.createdAt };
      }
    }

    const messages = await prisma.message.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            discriminator: true,
            displayName: true,
            avatar: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limitNum,
    });

    res.json({
      success: true,
      messages: messages.reverse().map((msg) => ({
        id: msg.id,
        content: msg.content,
        userId: msg.userId,
        conversationId: msg.conversationId,
        createdAt: msg.createdAt,
        replyToId: msg.replyToId,
        author: {
          id: msg.user.id,
          username: msg.user.username,
          discriminator: msg.user.discriminator,
          displayName: msg.user.displayName,
          avatar: msg.user.avatar,
        },
      })),
    });
  } catch (error) {
    logger.error('Error fetching conversation messages:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch messages' });
  }
});

export default router;