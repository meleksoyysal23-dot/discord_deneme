/**
 * User ID Utility
 * Anonim kullanıcı ID'si üret ve sessionStorage'da sakla
 * Her sekme farklı kullanıcı olur (gerçek çoklu-kullanıcı testi için)
 */

const STORAGE_KEY = 'vibe-voice-user-id';

/**
 * Mevcut kullanıcı ID'sini döndür veya yeni bir tane oluştur
 * sessionStorage kullanılır: her sekme farklı userId alır
 * @returns {string} Kullanıcı ID'si
 */
export function getOrCreateUserId() {
  let userId = sessionStorage.getItem(STORAGE_KEY);

  if (!userId) {
    userId = 'user-' + crypto.randomUUID().replace(/-/g, '').substring(0, 8);
    sessionStorage.setItem(STORAGE_KEY, userId);
  }

  return userId;
}
