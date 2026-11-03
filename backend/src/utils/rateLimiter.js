/**
 * Socket-Level Rate Limiter
 * WebRTC signaling event'leri için event bazlı rate limiting
 * Spam ve abuse önleme
 */

import { logger } from './logger.js';
import {
  RATE_LIMIT_CLEANUP_INTERVAL,
} from '../constants.js';

// Rate limit tracking map
// Key: `${socketId}:${event}`
// Value: { count: number, resetTime: number }
const rateLimitMap = new Map();

/**
 * Socket-level rate limit kontrolü
 * @param {string} socketId - Socket ID
 * @param {string} event - Event adı
 * @param {number} maxRequests - Window içinde max istek sayısı
 * @param {number} windowMs - Time window (milisaniye)
 * @returns {boolean} - true: izin ver, false: rate limit aşıldı
 */
export function checkRateLimit(socketId, event, maxRequests, windowMs) {
  const now = Date.now();
  const key = `${socketId}:${event}`;
  
  let data = rateLimitMap.get(key);
  
  // İlk istek veya window süresi dolduysa reset
  if (!data || now > data.resetTime) {
    data = { count: 0, resetTime: now + windowMs };
    rateLimitMap.set(key, data);
  }
  
  data.count++;
  
  if (data.count > maxRequests) {
    logger.warn(
      `Rate limit exceeded for socket ${socketId} on event '${event}': ` +
      `${data.count}/${maxRequests} in ${windowMs}ms`
    );
    return false;
  }
  
  return true;
}

/**
 * Rate limit map'i temizle (expired entries)
 * Her RATE_LIMIT_CLEANUP_INTERVAL'da bir çağrılmalı
 */
export function cleanupRateLimitMap() {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, data] of rateLimitMap.entries()) {
    if (now > data.resetTime) {
      rateLimitMap.delete(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    logger.debug(`Cleaned ${cleaned} expired rate limit entries`);
  }
}

/**
 * Rate limit map boyutunu al (monitoring için)
 * @returns {number}
 */
export function getRateLimitMapSize() {
  return rateLimitMap.size;
}

// Periyodik temizlik başlat
setInterval(() => {
  cleanupRateLimitMap();
}, RATE_LIMIT_CLEANUP_INTERVAL);

logger.info('Socket rate limiter initialized');
