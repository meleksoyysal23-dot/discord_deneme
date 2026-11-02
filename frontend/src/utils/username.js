/**
 * Username Utility
 * Kullanıcı adı, gender ve avatar yönetimi - sessionStorage'da saklanır
 * Her sekme farklı kullanıcı bilgileri alabilir
 */

const STORAGE_KEY = 'vibe-voice-username';
const STORAGE_KEY_GENDER = 'vibe-voice-gender';
const STORAGE_KEY_AVATAR = 'vibe-voice-avatar';

/**
 * Mevcut kullanıcı adını döndür
 * @returns {string} Kullanıcı adı (boş olabilir)
 */
export function getUsername() {
  return sessionStorage.getItem(STORAGE_KEY) || '';
}

/**
 * Kullanıcı adını kaydet
 * @param {string} name - Kullanıcı adı
 * @returns {string} Kaydedilen isim (trimlenmiş, max 20 karakter)
 */
export function setUsername(name) {
  const trimmed = (name || '').trim().substring(0, 20);
  if (trimmed) {
    sessionStorage.setItem(STORAGE_KEY, trimmed);
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
  return sessionStorage.getItem(STORAGE_KEY_GENDER) || null;
}

/**
 * Gender bilgisini kaydet
 * @param {string} gender - 'male' | 'female' | null
 */
export function setGender(gender) {
  if (gender === 'male' || gender === 'female') {
    sessionStorage.setItem(STORAGE_KEY_GENDER, gender);
  } else {
    sessionStorage.removeItem(STORAGE_KEY_GENDER);
  }
}

/**
 * Avatar ID'sini döndür
 * @returns {number|null} 1-20 arası avatar ID veya null
 */
export function getAvatar() {
  const avatar = sessionStorage.getItem(STORAGE_KEY_AVATAR);
  return avatar ? parseInt(avatar, 10) : null;
}

/**
 * Avatar ID'sini kaydet
 * @param {number} avatarId - 1-20 arası avatar ID
 */
export function setAvatar(avatarId) {
  if (avatarId && avatarId >= 1 && avatarId <= 20) {
    sessionStorage.setItem(STORAGE_KEY_AVATAR, avatarId.toString());
  } else {
    sessionStorage.removeItem(STORAGE_KEY_AVATAR);
  }
}