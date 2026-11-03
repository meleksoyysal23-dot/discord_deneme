/**
 * Voice Routes (FAZ 15.1 - LiveKit Token API)
 * LiveKit SFU için kısa ömürlü room token üretimi.
 *
 * Endpoint:
 *   GET /api/voice/token?room=<room_id>&participant=<participant_id>
 *
 * Response:
 *   { token: <jwt>, url: <livekit_ws_url> }
 *
 * Token 10 dakika geçerlidir ve roomJoin + publish + subscribe izinleri içerir.
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { AccessToken } from 'livekit-server-sdk';
import { logger } from '../utils/logger.js';

const router = Router();

// Token endpoint rate limiter - 30 dakikada 60 istek (IP başına)
// Token üretimi ucuz değil, abuse'a karşı korunur.
const tokenLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many token requests, please try again later' },
});

// Validasyon sabitleri
const ROOM_ID_MAX_LENGTH = 128;
const PARTICIPANT_ID_MAX_LENGTH = 128;
const ROOM_ID_PATTERN = /^[a-zA-Z0-9_\-.]+$/;
const PARTICIPANT_ID_PATTERN = /^[a-zA-Z0-9_\-.]+$/;

/**
 * GET /token
 * Query: room, participant
 */
router.get('/token', tokenLimiter, async (req, res) => {
  try {
    const { room, participant } = req.query;

    // Parametre varlık kontrolü
    if (!room || !participant) {
      return res.status(400).json({
        error: 'room ve participant parametreleri gerekli',
      });
    }

    // Array kontrolü (?room=a&room=b gibi çoklu değerler)
    if (Array.isArray(room) || Array.isArray(participant)) {
      return res.status(400).json({
        error: 'room ve participant tek bir değer olmalı',
      });
    }

    // Tip kontrolü
    if (typeof room !== 'string' || typeof participant !== 'string') {
      return res.status(400).json({
        error: 'room ve participant string olmalı',
      });
    }

    // Boş değer kontrolü
    if (room.length === 0 || participant.length === 0) {
      return res.status(400).json({
        error: 'room ve participant boş olamaz',
      });
    }

    // Uzunluk kontrolü
    if (room.length > ROOM_ID_MAX_LENGTH) {
      return res.status(400).json({
        error: `room değeri en fazla ${ROOM_ID_MAX_LENGTH} karakter olabilir`,
      });
    }

    if (participant.length > PARTICIPANT_ID_MAX_LENGTH) {
      return res.status(400).json({
        error: `participant değeri en fazla ${PARTICIPANT_ID_MAX_LENGTH} karakter olabilir`,
      });
    }

    // Pattern validasyonu (injection/abuse koruması)
    if (!ROOM_ID_PATTERN.test(room)) {
      return res.status(400).json({
        error: 'room değeri yalnızca harf, rakam, tire, nokta ve alt çizgi içerebilir',
      });
    }

    if (!PARTICIPANT_ID_PATTERN.test(participant)) {
      return res.status(400).json({
        error: 'participant değeri yalnızca harf, rakam, tire, nokta ve alt çizgi içerebilir',
      });
    }

    // LiveKit yapılandırması kontrolü
    const livekitUrl = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!livekitUrl || !apiKey || !apiSecret) {
      // Hassas bilgi loglanmaz — sadece eksik olduğu belirtilir
      logger.error('LiveKit configuration missing (one or more of LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)');
      return res.status(500).json({ error: 'LiveKit yapılandırması eksik' });
    }

    // AccessToken üretimi (SDK v2.x — toJwt() async)
    const token = new AccessToken(apiKey, apiSecret, {
      identity: participant,
      ttl: '10m',
    });

    token.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });

    const jwt = await token.toJwt();

    logger.info(`LiveKit token issued: room=${room}, participant=${participant}`);

    res.json({
      token: jwt,
      url: livekitUrl,
    });
  } catch (error) {
    // Hata mesajı loglanır, kullanıcıya generic mesaj dönülür
    logger.error('Token generation error:', error.message);
    res.status(500).json({ error: 'Token oluşturulamadı' });
  }
});

export default router;
