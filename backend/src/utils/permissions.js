/**
 * Permission System
 * Bitfield-based permission system for server roles
 * Uses BigInt for 64-bit permission flags
 */

/**
 * Permission flags as BigInt bitfield
 */
export const PERMISSIONS = {
  ADMINISTRATOR:       1n << 0n,   // 1 - Tüm yetkiler
  MANAGE_SERVER:       1n << 1n,   // 2 - Sunucu yönetimi
  MANAGE_CHANNELS:     1n << 2n,   // 4 - Kanal yönetimi
  MANAGE_ROLES:        1n << 3n,   // 8 - Rol yönetimi
  MANAGE_INVITES:      1n << 4n,   // 16 - Davet yönetimi
  KICK_MEMBERS:        1n << 5n,   // 32 - Üye atma
  BAN_MEMBERS:         1n << 6n,   // 64 - Üye yasaklama
  SEND_MESSAGES:       1n << 7n,   // 128 - Mesaj gönderme
  CONNECT:             1n << 8n,   // 256 - Ses kanalına bağlanma
  SPEAK:               1n << 9n,   // 512 - Konuşma
  MODERATE_MEMBERS:    1n << 10n,  // 1024 - Üyeleri zaman aşımına alma
  MANAGE_MESSAGES:     1n << 11n,  // 2048 - Mesaj silme/yönetme
  VIEW_AUDIT_LOG:      1n << 12n,  // 4096 - Audit log görme
  MANAGE_EMOJIS:       1n << 13n,  // 8192 - Emoji yönetimi
  MANAGE_WEBHOOKS:     1n << 14n,  // 16384 - Webhook yönetimi
};

/**
 * Default permissions for @everyone role
 * SEND_MESSAGES + CONNECT + SPEAK
 */
export const DEFAULT_PERMISSIONS =
  PERMISSIONS.SEND_MESSAGES |
  PERMISSIONS.CONNECT |
  PERMISSIONS.SPEAK;

/**
 * All permissions (for Administrator)
 */
export const ALL_PERMISSIONS = Object.values(PERMISSIONS).reduce(
  (acc, perm) => acc | perm,
  0n
);

/**
 * Convert permission string from DB to BigInt
 * @param {string} permString - Permission bitfield as string
 * @returns {bigint}
 */
export function toBigInt(permString) {
  try {
    return BigInt(permString || '0');
  } catch {
    return 0n;
  }
}

/**
 * Convert BigInt permission to string for DB storage
 * @param {bigint} perm - Permission bitfield
 * @returns {string}
 */
export function toString(perm) {
  return perm.toString();
}

/**
 * Check if a set of roles has a specific permission
 * @param {Array<{permissions: string}>} memberRoles - Array of role objects with permissions field
 * @param {bigint} requiredPermission - Required permission flag
 * @returns {boolean}
 */
export function hasPermission(memberRoles, requiredPermission) {
  if (!memberRoles || memberRoles.length === 0) {
    return false;
  }

  const totalPermissions = memberRoles.reduce((acc, role) => {
    return acc | toBigInt(role.permissions);
  }, 0n);

  // Administrator tüm yetkilere sahiptir
  if ((totalPermissions & PERMISSIONS.ADMINISTRATOR) !== 0n) {
    return true;
  }

  return (totalPermissions & requiredPermission) !== 0n;
}

/**
 * Check if member is server owner
 * @param {object} server - Server object with ownerId
 * @param {string} userId - User ID to check
 * @returns {boolean}
 */
export function isOwner(server, userId) {
  return server.ownerId === userId;
}

/**
 * Check if member has ADMINISTRATOR permission
 * @param {Array<{permissions: string}>} memberRoles
 * @returns {boolean}
 */
export function isAdministrator(memberRoles) {
  return hasPermission(memberRoles, PERMISSIONS.ADMINISTRATOR);
}

/**
 * Get human-readable permission names from bitfield
 * @param {bigint} permissions - Permission bitfield
 * @returns {string[]}
 */
export function getPermissionNames(permissions) {
  const names = [];
  const permBigInt = typeof permissions === 'bigint' ? permissions : toBigInt(permissions);

  for (const [name, flag] of Object.entries(PERMISSIONS)) {
    if ((permBigInt & flag) !== 0n) {
      names.push(name);
    }
  }

  return names;
}

/**
 * Create permission bitfield from array of permission names
 * @param {string[]} permissionNames - Array of permission name strings
 * @returns {bigint}
 */
export function fromNames(permissionNames) {
  if (!Array.isArray(permissionNames)) return 0n;

  return permissionNames.reduce((acc, name) => {
    if (PERMISSIONS[name]) {
      return acc | PERMISSIONS[name];
    }
    return acc;
  }, 0n);
}
