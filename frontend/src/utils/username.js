/**
 * Username Utility
 * Kullanıcı adı yönetimi - sessionStorage'da saklanır
 * Her sekme farklı kullanıcı adı alabilir
 */

const STORAGE_KEY = 'vibe-voice-username';

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