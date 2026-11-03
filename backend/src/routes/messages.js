/**
 * Message Routes (FAZ 4)
 * Gelişmiş mesajlaşma sistemi:
 * - Mesaj oluşturma, düzenleme, silme
 * - Reactions (emoji tepkileri)
 * - Pin mesajlar
 * - Reply (yanıt) desteği
 * - File attachments
 * - @mention parsing + socket notification
 * - Slowmode kontrolü
 */

import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { logger } from '../utils/logger.js';
import { authenticateToken } from '../middleware/auth.js';
import { PERMISSIONS, hasPermission, isOwner } from '../utils/permissions.js';
import { uploadAttachment, handleUploadError } from '../middleware/upload.js';
import {
  validateMessageContent,
  sanitizeContent,
  parseMentions,
  validateEmoji,
} from '../utils/markdown.js';
import { checkAutoMod, applyAutoModAction } from '../utils/automod.js';

const router = Router();

// Tüm route'lar JWT authentication gerektirir
router.use(authenticateToken);

/**
 * Helper: Get member with roles for a server
 */
async function getMemberWithRoles(serverId, userId) {
  return prisma.serverMember.findFirst({
    where: { serverId, userId },
    include: {
      roles: {
        include: { role: true },
      },
    },
  });
}

/**
 * Helper: Check if user can manage messages (admin-level)
 * Owner, ADMINISTRATOR, or MANAGE_CHANNELS (Discord benzeri: MANAGE_MESSAGES yerine)
 */
function canManageMessages(server, member) {
  if (isOwner(server, member.userId)) return true;
  const roles = member.roles.map((ur) => ur.role);
  return (
    hasPermission(roles, PERMISSIONS.ADMINISTRATOR) ||
    hasPermission(roles, PERMISSIONS.MANAGE_CHANNELS)
  );
}

/**
 * Helper: Check if user can send messages in channel
 */
function canSendMessages(server, member) {
  if (isOwner(server, member.userId)) return true;
  const roles = member.roles.map((ur) => ur.role);
  return hasPermission(roles, PERMISSIONS.SEND_MESSAGES);
}

/**
 * Helper: Format message for API response
 */
function formatMessage(msg) {
  return {
    id: msg.id,
    content: msg.content,
    userId: msg.userId,
    channelId: msg.channelId,
    createdAt: msg.createdAt,
    editedAt: msg.editedAt,
    pinned: msg.pinned,
    author: msg.user
      ? {
          id: msg.user.id,
          username: msg.user.username,
          discriminator: msg.user.discriminator,
          displayName: msg.user.displayName,
          avatar: msg.user.avatar,
        }
      : null,
    attachments: (msg.attachments || []).map((a) => ({
      id: a.id,
      url: a.url,
      filename: a.filename,
      size: a.size,
      mimetype: a.mimetype,
    })),
    replyTo: msg.replyTo
      ? {
          id: msg.replyTo.id,
          content: msg.replyTo.content,
          userId: msg.replyTo.userId,
          author: msg.replyTo.user
            ? {
                id: msg.replyTo.user.id,
                username: msg.replyTo.user.username,
                discriminator: msg.replyTo.user.discriminator,
                displayName: msg.replyTo.user.displayName,
                avatar: msg.replyTo.user.avatar,
              }
            : null,
        }
      : null,
  };
}

/**
 * Helper: Get io instance from app
 */
function getIO(req) {
  return req.app.get('io');
}

/**
 * Helper: Notify mentioned users via socket
 */
async function notifyMentions(content, message, author, io) {
  try {
    const mentions = parseMentions(content);
    if (mentions.length === 0) return;

    for (const { username, discriminator } of mentions) {
      // Find user by username AND discriminator (both are unique)
      const mentionedUser = await prisma.user.findFirst({
        where: { username, discriminator },
        select: { id: true, username: true, discriminator: true, avatar: true, displayName: true },
      });

      if (mentionedUser && mentionedUser.id !== author.id) {
        // Emit mention notification to the mentioned user's socket
        io.to(mentionedUser.id).emit('message:mention', {
          messageId: message.id,
          channelId: message.channelId,
          mentionedBy: {
            id: author.id,
            username: author.username,
            discriminator: author.discriminator,
            displayName: author.displayName,
            avatar: author.avatar,
          },
          content: message.content.substring(0, 100),
          createdAt: message.createdAt,
        });

        logger.info(
          `Mention: ${author.username}#${author.discriminator} mentioned ${mentionedUser.username}#${mentionedUser.discriminator} in message ${message.id}`
        );
      }
    }
  } catch (error) {
    // Mention notification failure should not break message creation
    logger.error('Mention notification error:', error.message);
  }
}

/**
 * POST /api/channels/:id/messages
 * Yeni mesaj oluştur
 * - Content validation (1-2000 karakter)
 * - Slowmode kontrolü
 * - Reply desteği (replyTo)
 * - File attachments (multipart/form-data, max 5 dosya, 10MB each)
 * - @mention parsing + socket notification
 * - Socket broadcast
 */
router.post('/channels/:id/messages', uploadAttachment, handleUploadError, async (req, res) => {
  try {
    const { id: channelId } = req.params;
    const { content, replyTo } = req.body || {};

    // Kanalı bul (server ile birlikte)
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      include: {
        server: true,
      },
    });

    if (!channel) {
      return res.status(404).json({
        success: false,
        error: 'Channel not found',
      });
    }

    // TEXT/ANNOUNCEMENT/FORUM kanallarına mesaj atılabilir
    if (!['TEXT', 'ANNOUNCEMENT', 'FORUM'].includes(channel.type)) {
      return res.status(400).json({
        success: false,
        error: `Cannot send messages to ${channel.type} channel`,
      });
    }

    // Member kontrolü
    const member = await getMemberWithRoles(channel.serverId, req.user.id);
    if (!member) {
      return res.status(403).json({
        success: false,
        error: 'You are not a member of this server',
      });
    }

    // SEND_MESSAGES permission kontrolü
    if (!canSendMessages(channel.server, member)) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to send messages in this channel',
      });
    }

    // Content validation
    const files = req.files || [];
    const contentCheck = validateMessageContent(content);

    // En az biri gerekli: content veya attachment
    if (!contentCheck.valid && files.length === 0) {
      return res.status(400).json({
        success: false,
        error: contentCheck.error || 'Message must have content or attachments',
      });
    }

    // Content varsa validate et (attachments ile birlikte de olabilir)
    let sanitizedContent = '';
    if (contentCheck.valid) {
      sanitizedContent = sanitizeContent(contentCheck.value);
    } else if (files.length > 0) {
      // Sadece attachment var, content boş olabilir
      sanitizedContent = '';
    } else {
      return res.status(400).json({
        success: false,
        error: contentCheck.error,
      });
    }

    // Reply validation
    let replyToId = null;
    if (replyTo) {
      const parentMessage = await prisma.message.findFirst({
        where: { id: replyTo, channelId },
      });
      if (!parentMessage) {
        return res.status(400).json({
          success: false,
          error: 'Reply target message not found in this channel',
        });
      }
      replyToId = parentMessage.id;
    }

    // ============================================================
    // AUTOMOD KONTROLÜ (FAZ 6)
    // ============================================================
    if (sanitizedContent) {
      const automodResult = await checkAutoMod(channel.serverId, req.user.id, sanitizedContent);
      
      if (automodResult.blocked) {
        logger.warn(
          `AutoMod BLOCKED message from ${req.user.id} in server ${channel.serverId}: ` +
          `rule ${automodResult.rule?.type}`
        );
        return res.status(403).json({
          success: false,
          error: 'Message blocked by AutoMod',
          ruleType: automodResult.rule?.type,
        });
      }
      
      // Apply non-blocking actions (TIMEOUT, BAN, FLAG)
      if (automodResult.action && automodResult.action !== 'BLOCK') {
        await applyAutoModAction(channel.serverId, req.user.id, automodResult.action, automodResult.rule);
      }
    }

    // ============================================================
    // SLOWMODE KONTROLÜ
    // ============================================================
    if (channel.slowmode > 0) {
      // Admin/MANAGE_CHANNELS yetkisi olanlar exempt
      if (!canManageMessages(channel.server, member)) {
        const lastMessage = await prisma.message.findFirst({
          where: {
            channelId,
            userId: req.user.id,
          },
          orderBy: { createdAt: 'desc' },
        });

        if (lastMessage) {
          const timeSinceLastMessage = Date.now() - lastMessage.createdAt.getTime();
          const slowmodeMs = channel.slowmode * 1000;

          if (timeSinceLastMessage < slowmodeMs) {
            const waitSeconds = Math.ceil((slowmodeMs - timeSinceLastMessage) / 1000);
            return res.status(429).json({
              success: false,
              error: `Slowmode active. Please wait ${waitSeconds} seconds.`,
              retryAfter: waitSeconds,
            });
          }
        }
      }
    }

    // ============================================================
    // MESAJ OLUŞTUR
    // ============================================================
    const message = await prisma.message.create({
      data: {
        channelId,
        userId: req.user.id,
        content: sanitizedContent,
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

    // Reply oluştur (eğer varsa)
    if (replyToId) {
      await prisma.messageReply.create({
        data: {
          messageId: message.id,
          parentMessageId: replyToId,
        },
      });
    }

    // Attachments oluştur (eğer varsa)
    let attachments = [];
    if (files.length > 0) {
      const attachmentData = files.map((file) => ({
        messageId: message.id,
        url: `/uploads/${file.filename}`,
        filename: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
      }));

      attachments = await Promise.all(
        attachmentData.map((a) => prisma.attachment.create({ data: a }))
      );
    }

    // Reply bilgisi ile birlikte response için tekrar fetch
    const fullMessage = await prisma.message.findUnique({
      where: { id: message.id },
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
        attachments: true,
        replies: {
          include: {
            parent: {
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
        },
      },
    });

    const replyInfo = fullMessage.replies && fullMessage.replies[0]
      ? {
          id: fullMessage.replies[0].parent.id,
          content: fullMessage.replies[0].parent.content,
          userId: fullMessage.replies[0].parent.userId,
          author: fullMessage.replies[0].parent.user
            ? {
                id: fullMessage.replies[0].parent.user.id,
                username: fullMessage.replies[0].parent.user.username,
                discriminator: fullMessage.replies[0].parent.user.discriminator,
                displayName: fullMessage.replies[0].parent.user.displayName,
                avatar: fullMessage.replies[0].parent.user.avatar,
              }
            : null,
        }
      : null;

    const responseMessage = {
      ...formatMessage(fullMessage),
      attachments: attachments.length > 0
        ? attachments.map((a) => ({
            id: a.id,
            url: a.url,
            filename: a.filename,
            size: a.size,
            mimetype: a.mimetype,
          }))
        : fullMessage.attachments.map((a) => ({
            id: a.id,
            url: a.url,
            filename: a.filename,
            size: a.size,
            mimetype: a.mimetype,
          })),
      replyTo: replyInfo,
    };

    logger.info(
      `Message created: ${message.id} in channel ${channelId} by ${req.user.username}#${req.user.discriminator}` +
        (files.length > 0 ? ` with ${files.length} attachment(s)` : '')
    );

    // ============================================================
    // SOCKET BROADCAST
    // ============================================================
    const io = getIO(req);
    if (io) {
      io.to(channelId).emit('message:create', responseMessage);

      // @mention notification
      if (sanitizedContent) {
        await notifyMentions(sanitizedContent, message, req.user, io);
      }
    }

    return res.status(201).json({
      success: true,
      message: responseMessage,
    });
  } catch (error) {
    logger.error('Create message error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to create message',
    });
  }
});

/**
 * PUT /api/messages/:id
 * Mesaj düzenle (sadece yazar)
 * - editedAt timestamp set
 * - Socket broadcast
 */
router.put('/messages/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body || {};

    // Mesajı bul
    const message = await prisma.message.findUnique({
      where: { id },
      include: {
        channel: {
          include: { server: true },
        },
      },
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found',
      });
    }

    // Author kontrolü
    if (message.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'You can only edit your own messages',
      });
    }

    // Content validation
    const contentCheck = validateMessageContent(content);
    if (!contentCheck.valid) {
      return res.status(400).json({
        success: false,
        error: contentCheck.error,
      });
    }

    const sanitizedContent = sanitizeContent(contentCheck.value);

    // Mesajı güncelle
    const updatedMessage = await prisma.message.update({
      where: { id },
      data: {
        content: sanitizedContent,
        editedAt: new Date(),
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
        attachments: true,
      },
    });

    logger.info(`Message edited: ${id} by ${req.user.username}#${req.user.discriminator}`);

    // Socket broadcast
    const io = getIO(req);
    if (io) {
      io.to(message.channelId).emit('message:update', formatMessage(updatedMessage));
    }

    return res.status(200).json({
      success: true,
      message: formatMessage(updatedMessage),
    });
  } catch (error) {
    logger.error('Edit message error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to edit message',
    });
  }
});

/**
 * DELETE /api/messages/:id
 * Mesaj sil (yazar veya admin)
 * - Attachments da silinir (fiziksel dosyalar da)
 * - Socket broadcast
 */
router.delete('/messages/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Mesajı bul
    const message = await prisma.message.findUnique({
      where: { id },
      include: {
        channel: {
          include: { server: true },
        },
        attachments: true,
      },
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found',
      });
    }

    // Yetki kontrolü: author veya admin
    const isAuthor = message.userId === req.user.id;
    let isAdmin = false;

    if (!isAuthor) {
      const member = await getMemberWithRoles(message.channel.serverId, req.user.id);
      if (member) {
        isAdmin = canManageMessages(message.channel.server, member);
      }
    }

    if (!isAuthor && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to delete this message',
      });
    }

    // Fiziksel dosyaları sil (opsiyonel - hata olursa logla, devam et)
    // Not: fs import'u dynamic, production'da CDN kullanımı önerilir
    if (message.attachments.length > 0) {
      try {
        const fs = await import('fs');
        const path = await import('path');
        const { fileURLToPath } = await import('url');
        const __filename = fileURLToPath(import.meta.url);
        const { dirname } = path;
        const __dirname = dirname(__filename);
        const uploadsDir = path.default.join(__dirname, '..', '..', 'uploads');

        for (const attachment of message.attachments) {
          const filePath = path.default.join(uploadsDir, path.default.basename(attachment.url));
          try {
            if (fs.default.existsSync(filePath)) {
              fs.default.unlinkSync(filePath);
            }
          } catch (fileError) {
            logger.warn(`Failed to delete file ${filePath}:`, fileError.message);
          }
        }
      } catch (fsError) {
        logger.warn('File cleanup error:', fsError.message);
      }
    }

    const channelId = message.channelId;
    const messageId = message.id;

    // Mesajı sil (cascade ile attachments ve replies da silinir)
    await prisma.message.delete({
      where: { id },
    });

    logger.info(
      `Message deleted: ${messageId} from channel ${channelId} by ${req.user.username}#${req.user.discriminator}` +
        (isAdmin && !isAuthor ? ' (admin action)' : '')
    );

    // Socket broadcast
    const io = getIO(req);
    if (io) {
      io.to(channelId).emit('message:delete', {
        messageId,
        channelId,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Message deleted',
    });
  } catch (error) {
    logger.error('Delete message error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete message',
    });
  }
});

/**
 * POST /api/messages/:id/reactions
 * Mesaja reaction ekle
 * - Unique constraint (user + message + emoji)
 * - Socket broadcast
 */
router.post('/messages/:id/reactions', async (req, res) => {
  try {
    const { id: messageId } = req.params;
    const { emoji } = req.body || {};

    // Emoji validation
    const emojiCheck = validateEmoji(emoji);
    if (!emojiCheck.valid) {
      return res.status(400).json({
        success: false,
        error: emojiCheck.error,
      });
    }

    // Mesajı bul (channel ve server ile)
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        channel: {
          include: { server: true },
        },
      },
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found',
      });
    }

    // Member kontrolü
    const member = await getMemberWithRoles(message.channel.serverId, req.user.id);
    if (!member) {
      return res.status(403).json({
        success: false,
        error: 'You are not a member of this server',
      });
    }

    // Reaction oluştur (unique constraint: messageId + userId + emoji)
    let reaction;
    try {
      reaction = await prisma.reaction.create({
        data: {
          messageId,
          userId: req.user.id,
          emoji: emojiCheck.value,
        },
      });
    } catch (prismaError) {
      // P2002 = unique constraint violation
      if (prismaError.code === 'P2002') {
        return res.status(409).json({
          success: false,
          error: 'You have already reacted with this emoji',
        });
      }
      throw prismaError;
    }

    logger.info(
      `Reaction added: ${emojiCheck.value} on message ${messageId} by ${req.user.username}#${req.user.discriminator}`
    );

    // Socket broadcast
    const io = getIO(req);
    if (io) {
      io.to(message.channelId).emit('reaction:add', {
        messageId,
        channelId: message.channelId,
        userId: req.user.id,
        username: req.user.username,
        discriminator: req.user.discriminator,
        emoji: emojiCheck.value,
      });
    }

    return res.status(201).json({
      success: true,
      reaction: {
        id: reaction.id,
        messageId: reaction.messageId,
        userId: reaction.userId,
        emoji: reaction.emoji,
        createdAt: reaction.createdAt,
      },
    });
  } catch (error) {
    logger.error('Add reaction error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to add reaction',
    });
  }
});

/**
 * DELETE /api/messages/:id/reactions/:emoji
 * Kendi reaction'ını kaldır
 * URL-encoded emoji desteklenir
 */
router.delete('/messages/:id/reactions/:emoji', async (req, res) => {
  try {
    const { id: messageId, emoji } = req.params;
    const decodedEmoji = decodeURIComponent(emoji);

    // Mesajı bul
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        channel: true,
      },
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found',
      });
    }

    // Reaction'ı bul (kullanıcının kendi reaction'ı)
    const reaction = await prisma.reaction.findFirst({
      where: {
        messageId,
        userId: req.user.id,
        emoji: decodedEmoji,
      },
    });

    if (!reaction) {
      return res.status(404).json({
        success: false,
        error: 'Reaction not found',
      });
    }

    // Reaction'ı sil
    await prisma.reaction.delete({
      where: { id: reaction.id },
    });

    logger.info(
      `Reaction removed: ${decodedEmoji} from message ${messageId} by ${req.user.username}#${req.user.discriminator}`
    );

    // Socket broadcast
    const io = getIO(req);
    if (io) {
      io.to(message.channelId).emit('reaction:remove', {
        messageId,
        channelId: message.channelId,
        userId: req.user.id,
        emoji: decodedEmoji,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Reaction removed',
    });
  } catch (error) {
    logger.error('Remove reaction error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to remove reaction',
    });
  }
});

/**
 * GET /api/messages/:id/reactions
 * Mesajın reaction'larını emoji bazında gruplanmış olarak getir
 * Response: [{ emoji, count, users: [{id, username, discriminator}] }]
 */
router.get('/messages/:id/reactions', async (req, res) => {
  try {
    const { id: messageId } = req.params;

    // Mesajı bul (server ile)
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        channel: true,
      },
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found',
      });
    }

    // Member kontrolü
    const member = await getMemberWithRoles(message.channel.serverId, req.user.id);
    if (!member) {
      return res.status(403).json({
        success: false,
        error: 'You are not a member of this server',
      });
    }

    // Reaction'ları user bilgisi ile birlikte getir
    const reactions = await prisma.reaction.findMany({
      where: { messageId },
      include: {
        message: {
          select: { channelId: true },
        },
      },
    });

    // User bilgilerini ayrıca çek (Reaction modelinde user relation yok)
    const userIds = [...new Set(reactions.map((r) => r.userId))];
    const users = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            username: true,
            discriminator: true,
            displayName: true,
            avatar: true,
          },
        })
      : [];

    const userMap = new Map(users.map((u) => [u.id, u]));

    // Emoji bazında grupla
    const grouped = new Map();
    for (const reaction of reactions) {
      if (!grouped.has(reaction.emoji)) {
        grouped.set(reaction.emoji, {
          emoji: reaction.emoji,
          count: 0,
          users: [],
        });
      }
      const group = grouped.get(reaction.emoji);
      group.count++;
      const user = userMap.get(reaction.userId);
      if (user) {
        group.users.push({
          id: user.id,
          username: user.username,
          discriminator: user.discriminator,
          displayName: user.displayName,
          avatar: user.avatar,
        });
      }
    }

    return res.status(200).json({
      reactions: Array.from(grouped.values()),
    });
  } catch (error) {
    logger.error('Get reactions error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch reactions',
    });
  }
});

/**
 * PUT /api/messages/:id/pin
 * Mesajı pin'le (admin only)
 */
router.put('/messages/:id/pin', async (req, res) => {
  try {
    const { id } = req.params;

    // Mesajı bul
    const message = await prisma.message.findUnique({
      where: { id },
      include: {
        channel: {
          include: { server: true },
        },
        user: {
          select: {
            id: true,
            username: true,
            discriminator: true,
            displayName: true,
            avatar: true,
          },
        },
        attachments: true,
      },
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found',
      });
    }

    // Member kontrolü
    const member = await getMemberWithRoles(message.channel.serverId, req.user.id);
    if (!member) {
      return res.status(403).json({
        success: false,
        error: 'You are not a member of this server',
      });
    }

    // Admin yetkisi kontrolü
    if (!canManageMessages(message.channel.server, member)) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to pin messages',
      });
    }

    // Zaten pin'li ise
    if (message.pinned) {
      return res.status(400).json({
        success: false,
        error: 'Message is already pinned',
      });
    }

    // Pin'le
    const updatedMessage = await prisma.message.update({
      where: { id },
      data: { pinned: true },
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
        attachments: true,
      },
    });

    logger.info(
      `Message pinned: ${id} by ${req.user.username}#${req.user.discriminator}`
    );

    // Socket broadcast
    const io = getIO(req);
    if (io) {
      io.to(message.channelId).emit('message:pin', {
        messageId: id,
        channelId: message.channelId,
        pinned: true,
        pinnedBy: {
          id: req.user.id,
          username: req.user.username,
          discriminator: req.user.discriminator,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: formatMessage(updatedMessage),
    });
  } catch (error) {
    logger.error('Pin message error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to pin message',
    });
  }
});

/**
 * DELETE /api/messages/:id/pin
 * Mesajın pin'ini kaldır (admin only)
 */
router.delete('/messages/:id/pin', async (req, res) => {
  try {
    const { id } = req.params;

    // Mesajı bul
    const message = await prisma.message.findUnique({
      where: { id },
      include: {
        channel: {
          include: { server: true },
        },
      },
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found',
      });
    }

    // Member kontrolü
    const member = await getMemberWithRoles(message.channel.serverId, req.user.id);
    if (!member) {
      return res.status(403).json({
        success: false,
        error: 'You are not a member of this server',
      });
    }

    // Admin yetkisi kontrolü
    if (!canManageMessages(message.channel.server, member)) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to unpin messages',
      });
    }

    // Zaten pin'li değilse
    if (!message.pinned) {
      return res.status(400).json({
        success: false,
        error: 'Message is not pinned',
      });
    }

    // Pin'i kaldır
    await prisma.message.update({
      where: { id },
      data: { pinned: false },
    });

    logger.info(
      `Message unpinned: ${id} by ${req.user.username}#${req.user.discriminator}`
    );

    // Socket broadcast
    const io = getIO(req);
    if (io) {
      io.to(message.channelId).emit('message:pin', {
        messageId: id,
        channelId: message.channelId,
        pinned: false,
        pinnedBy: {
          id: req.user.id,
          username: req.user.username,
          discriminator: req.user.discriminator,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Message unpinned',
    });
  } catch (error) {
    logger.error('Unpin message error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to unpin message',
    });
  }
});

/**
 * GET /api/channels/:id/pins
 * Kanalın pin'li mesajlarını listele (member only)
 */
router.get('/channels/:id/pins', async (req, res) => {
  try {
    const { id: channelId } = req.params;

    // Kanalı bul
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
    });

    if (!channel) {
      return res.status(404).json({
        success: false,
        error: 'Channel not found',
      });
    }

    // Member kontrolü
    const member = await getMemberWithRoles(channel.serverId, req.user.id);
    if (!member) {
      return res.status(403).json({
        success: false,
        error: 'You are not a member of this server',
      });
    }

    // Pinned mesajları getir
    const pinnedMessages = await prisma.message.findMany({
      where: {
        channelId,
        pinned: true,
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
        attachments: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50, // Max 50 pinned message
    });

    const formatted = pinnedMessages.map((msg) => formatMessage(msg));

    return res.status(200).json({
      success: true,
      messages: formatted,
    });
  } catch (error) {
    logger.error('Get pins error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch pinned messages',
    });
  }
});

export default router;
