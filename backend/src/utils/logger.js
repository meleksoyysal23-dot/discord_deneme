/**
 * Basit renkli console log wrapper
 * Her log satırında timestamp ve seviye bilgisi içerir
 */

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function getTimestamp() {
  return new Date().toISOString();
}

function formatMessage(level, color, message, ...args) {
  const timestamp = getTimestamp();
  const levelTag = `${color}[${level}]${COLORS.reset}`;
  const timeTag = `${COLORS.gray}${timestamp}${COLORS.reset}`;
  return `${timeTag} ${levelTag} ${message}`;
}

export const logger = {
  info(message, ...args) {
    console.log(formatMessage('INFO', COLORS.cyan, message), ...args);
  },

  success(message, ...args) {
    console.log(formatMessage('OK', COLORS.green, message), ...args);
  },

  warn(message, ...args) {
    console.warn(formatMessage('WARN', COLORS.yellow, message), ...args);
  },

  error(message, ...args) {
    console.error(formatMessage('ERROR', COLORS.red, message), ...args);
  },

  debug(message, ...args) {
    console.debug(formatMessage('DEBUG', COLORS.magenta, message), ...args);
  },
};

export default logger;
