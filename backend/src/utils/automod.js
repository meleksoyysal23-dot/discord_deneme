/**
 * AutoMod Checker - FAZ 6
 * Checks messages against automod rules
 */

import prisma from '../lib/prisma.js';
import { logger } from './logger.js';

/**
 * Check a message against automod rules
 * @param {string} serverId - Server ID
 * @param {string} userId - User ID who sent the message
 * @param {string} content - Message content
 * @returns {Promise<{blocked: boolean, action: string|null, rule: object|null}>}
 */
export async function checkAutoMod(serverId, userId, content) {
  try {
    // Get automod config for server
    const automod = await prisma.autoMod.findUnique({
      where: { serverId }
    });

    // No automod or disabled
    if (!automod || !automod.enabled) {
      return { blocked: false, action: null, rule: null };
    }

    // Parse rules
    let rules = [];
    try {
      rules = JSON.parse(automod.rules);
    } catch {
      return { blocked: false, action: null, rule: null };
    }

    if (!rules || rules.length === 0) {
      return { blocked: false, action: null, rule: null };
    }

    // Check each rule
    for (const rule of rules) {
      const violated = checkRule(rule, content);
      
      if (violated) {
        logger.info(`AutoMod rule violated: ${rule.type} by user ${userId} in server ${serverId}`);
        
        // Log the violation - use server owner as moderator (system has no user)
        const server = await prisma.server.findUnique({
          where: { id: serverId },
          select: { ownerId: true }
        });
        
        if (server) {
          await prisma.auditLog.create({
            data: {
              serverId,
              action: 'AUTOMOD_VIOLATION',
              targetId: userId,
              targetType: 'USER',
              moderatorId: server.ownerId,
              reason: `AutoMod ${rule.type} violation`,
              metadata: JSON.stringify({
                ruleType: rule.type,
                ruleAction: rule.action,
                content: content.substring(0, 200)
              })
            }
          });
        }

        return {
          blocked: rule.action === 'BLOCK',
          action: rule.action,
          rule
        };
      }
    }

    return { blocked: false, action: null, rule: null };
  } catch (error) {
    logger.error('AutoMod check error:', error);
    // Don't block messages on automod error
    return { blocked: false, action: null, rule: null };
  }
}

/**
 * Check a single rule against content
 * @param {object} rule - Rule object
 * @param {string} content - Message content
 * @returns {boolean} - True if rule is violated
 */
function checkRule(rule, content) {
  switch (rule.type) {
    case 'KEYWORD':
      return checkKeywordRule(rule, content);
    case 'MENTION_SPAM':
      return checkMentionSpamRule(rule, content);
    case 'LINK_FILTER':
      return checkLinkFilterRule(rule, content);
    case 'CAPS_SPAM':
      return checkCapsSpamRule(rule, content);
    default:
      return false;
  }
}

/**
 * KEYWORD rule: Block messages containing forbidden words
 */
function checkKeywordRule(rule, content) {
  const keywords = rule.config?.keywords || [];
  if (!Array.isArray(keywords) || keywords.length === 0) return false;

  const lowerContent = content.toLowerCase();
  
  for (const keyword of keywords) {
    if (typeof keyword === 'string' && lowerContent.includes(keyword.toLowerCase())) {
      return true;
    }
  }
  
  return false;
}

/**
 * MENTION_SPAM rule: Block messages with too many mentions
 */
function checkMentionSpamRule(rule, content) {
  const maxMentions = rule.config?.maxMentions || 5;
  
  // Count @mentions (simple pattern: @username or <@userId>)
  const mentionPattern = /@\w+|<@!?(\d+)>/g;
  const mentions = content.match(mentionPattern) || [];
  
  return mentions.length > maxMentions;
}

/**
 * LINK_FILTER rule: Block messages with non-allowed links
 */
function checkLinkFilterRule(rule, content) {
  const allowedDomains = rule.config?.allowedDomains || [];
  
  // Extract URLs from content
  const urlPattern = /https?:\/\/([^\s\/]+)/gi;
  const matches = [...content.matchAll(urlPattern)];
  
  if (matches.length === 0) return false;
  
  // If no allowed domains specified, allow all
  if (!Array.isArray(allowedDomains) || allowedDomains.length === 0) {
    return false;
  }
  
  // Check if all domains are allowed
  for (const match of matches) {
    const domain = match[1].toLowerCase();
    const isAllowed = allowedDomains.some(allowed => 
      domain === allowed.toLowerCase() || 
      domain.endsWith('.' + allowed.toLowerCase())
    );
    
    if (!isAllowed) {
      return true; // Found a non-allowed link
    }
  }
  
  return false;
}

/**
 * CAPS_SPAM rule: Block messages with too many uppercase letters
 */
function checkCapsSpamRule(rule, content) {
  const maxPercentage = rule.config?.maxPercentage || 70;
  const minLength = rule.config?.minLength || 10;
  
  // Skip short messages
  if (content.length < minLength) return false;
  
  // Count uppercase letters
  const uppercaseCount = (content.match(/[A-Z]/g) || []).length;
  const totalLetters = (content.match(/[A-Za-z]/g) || []).length;
  
  if (totalLetters === 0) return false;
  
  const percentage = (uppercaseCount / totalLetters) * 100;
  
  return percentage > maxPercentage;
}

/**
 * Apply automod action (timeout, ban, etc.)
 * @param {string} serverId - Server ID
 * @param {string} userId - User ID
 * @param {string} action - Action to take
 * @param {object} rule - Rule that was violated
 */
export async function applyAutoModAction(serverId, userId, action, rule) {
  try {
    switch (action) {
      case 'BLOCK':
        // Message is already blocked, nothing more to do
        break;
        
      case 'FLAG':
        // Just logged in audit, nothing more to do
        break;
        
      case 'TIMEOUT':
        // Timeout user for configured duration (default 60 seconds)
        const timeoutDuration = rule.config?.timeoutDuration || 60;
        const expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + timeoutDuration);
        
        await prisma.timeout.upsert({
          where: { serverId_userId: { serverId, userId } },
          create: {
            serverId,
            userId,
            expiresAt,
            reason: `AutoMod: ${rule.type} violation`
          },
          update: {
            expiresAt,
            reason: `AutoMod: ${rule.type} violation`
          }
        });
        
        logger.info(`AutoMod: User ${userId} timed out for ${timeoutDuration}s in server ${serverId}`);
        break;
        
      case 'BAN':
        // Remove member and create ban
        try {
          await prisma.serverMember.delete({
            where: { serverId_userId: { serverId, userId } }
          });
        } catch {
          // Member might not exist
        }
        
        await prisma.ban.upsert({
          where: { serverId_userId: { serverId, userId } },
          create: {
            serverId,
            userId,
            reason: `AutoMod: ${rule.type} violation`,
            bannedById: userId // System ban
          },
          update: {
            reason: `AutoMod: ${rule.type} violation`
          }
        });
        
        logger.info(`AutoMod: User ${userId} banned from server ${serverId}`);
        break;
    }
  } catch (error) {
    logger.error('AutoMod apply action error:', error);
  }
}
