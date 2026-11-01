/**
 * Uygulama konfigürasyonu
 * Tüm environment değişkenleri bu dosya üzerinden okunur ve validate edilir
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  DEFAULT_PORT,
  DEFAULT_HOST,
  DEFAULT_CORS_ORIGIN,
  MAX_ROOM_SIZE as DEFAULT_MAX_ROOM_SIZE,
} from '../constants.js';
import { logger } from '../utils/logger.js';

// .env dosyasını yükle
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '..', '..', '.env');
dotenv.config({ path: envPath });

function parsePort(value) {
  const port = parseInt(value, 10);
  if (Number.isNaN(port) || port < 1 || port > 65535) {
    logger.error(`Invalid PORT value: ${value}. Must be between 1 and 65535.`);
    process.exit(1);
  }
  return port;
}

function parseMaxRoomSize(value) {
  const size = parseInt(value, 10);
  if (Number.isNaN(size) || size < 2 || size > 50) {
    logger.error(`Invalid MAX_ROOM_SIZE value: ${value}. Must be between 2 and 50.`);
    process.exit(1);
  }
  return size;
}

/**
 * CORS origin'i parse et
 * - "*" ise tüm originlere izin ver (Electron production için)
 * - Virgülle ayrılmış ise array olarak döndür
 * - Tek origin ise string olarak döndür
 */
function parseCorsOrigin(value) {
  const origin = value || DEFAULT_CORS_ORIGIN;
  
  // Wildcard - tüm originlere izin ver
  if (origin === '*') {
    return '*';
  }
  
  // Virgülle ayrılmış birden fazla origin
  if (origin.includes(',')) {
    return origin.split(',').map((o) => o.trim()).filter((o) => o.length > 0);
  }
  
  // Tek origin
  return origin;
}

export const config = {
  port: parsePort(process.env.PORT || DEFAULT_PORT),
  host: process.env.HOST || DEFAULT_HOST,
  corsOrigin: parseCorsOrigin(process.env.CORS_ORIGIN),
  maxRoomSize: parseMaxRoomSize(process.env.MAX_ROOM_SIZE || DEFAULT_MAX_ROOM_SIZE),
  nodeEnv: process.env.NODE_ENV || 'development',
};

// Başlangıçta konfigürasyonu logla (hassas bilgi yok)
logger.info('Configuration loaded:', {
  port: config.port,
  host: config.host,
  corsOrigin: config.corsOrigin,
  maxRoomSize: config.maxRoomSize,
  nodeEnv: config.nodeEnv,
});

export default config;
