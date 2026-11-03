/**
 * Username Utility
 * Kullanıcı adı, gender ve avatar yönetimi - localStorage'da kalıcı saklanır
 * (userId hâlâ sessionStorage'da: her sekme farklı kullanıcı olabilir)
 */

const STORAGE_KEY = 'vibe-voice-username';
const STORAGE_KEY_GENDER = 'vibe-voice-gender';
const STORAGE_KEY_AVATAR = 'vibe-voice-avatar';

/**
 * Mevcut kullanıcı adını döndür
 * @returns {string} Kullanıcı adı (boş olabilir)
 */
export function getUsername() {
  return localStorage.getItem(STORAGE_KEY) || '';
}

/**
 * Kullanıcı adını kaydet
 * @param {string} name - Kullanıcı adı
 * @returns {string} Kaydedilen isim (trimlenmiş, max 20 karakter)
 */
export function setUsername(name) {
  const trimmed = (name || '').trim().substring(0, 20);
  if (trimmed) {
    localStorage.setItem(STORAGE_KEY, trimmed);
  }
  return trimmed;
}

/**
 * Görüntülenecek ismi döndür
 * @param {string} userId - Kullanıcı ID'si
 * @param {string} username - Kullanıcı adı (opsiyonel)
 * @returns {string} Görüntülenecek isim
 */
export function getDisplayName(userId, username) {
  if (username && username.trim()) {
    return username.trim();
  }
  // Fallback: userId'den türet (user-abc12345 → "abc1")
  return userId.replace('user-', '').substring(0, 4);
}

/**
 * İsim baş harfini döndür
 * @param {string} username - Kullanıcı adı
 * @param {string} userId - Kullanıcı ID'si
 * @returns {string} Baş harf (büyük harf)
 */
export function getInitial(username, userId) {
  const name = getDisplayName(userId, username);
  return name.charAt(0).toUpperCase();
}

/**
 * Gender bilgisini döndür
 * @returns {string|null} 'male' | 'female' | null
 */
export function getGender() {
  return localStorage.getItem(STORAGE_KEY_GENDER) || null;
}

/**
 * Gender bilgisini kaydet
 * @param {string} gender - 'male' | 'female' | null
 */
export function setGender(gender) {
  if (gender === 'male' || gender === 'female') {
    localStorage.setItem(STORAGE_KEY_GENDER, gender);
  } else {
    localStorage.removeItem(STORAGE_KEY_GENDER);
  }
}

/**
 * Avatar ID'sini döndür
 * @returns {number|null} 1-20 arası avatar ID veya null
 */
export function getAvatar() {
  const avatar = localStorage.getItem(STORAGE_KEY_AVATAR);
  return avatar ? parseInt(avatar, 10) : null;
}

/**
 * Avatar ID'sini kaydet
 * @param {number} avatarId - 1-20 arası avatar ID
 */
export function setAvatar(avatarId) {
  if (avatarId && avatarId >= 1 && avatarId <= 20) {
    localStorage.setItem(STORAGE_KEY_AVATAR, avatarId.toString());
  } else {
    localStorage.removeItem(STORAGE_KEY_AVATAR);
  }
}

/**
 * Avatar ID'sinden emoji döndür
 * @param {number|null} avatarId
 * @returns {string|null}
 */
const AVATAR_EMOJIS = {
  1: '🦊',
  2: '🐺',
  3: '🦁',
  4: '🐯',
  5: '🐻',
  6: '🐼',
  7: '🐨',
  8: '🐸',
  9: '🦄',
  10: '🐲',
  11: '🦋',
  12: '🌸',
  13: '⭐',
  14: '🌙',
  15: '🔥',
  16: '💎',
  17: '🎮',
  18: '🎵',
  19: '🚀',
  20: '💀',
};

export function getAvatarEmoji(avatarId) {
  return AVATAR_EMOJIS[avatarId] || null;
}