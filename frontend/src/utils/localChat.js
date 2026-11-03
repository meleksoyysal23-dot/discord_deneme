/**
 * Local Chat Utility
 * Metin kanalları için yerel mesaj saklama - localStorage
 */

const KEY_PREFIX = 'vibe-voice-chat-';

function key(channelId) {
  return KEY_PREFIX + channelId;
}

/**
 * Kanal mesajlarını yükle
 * @param {string} channelId - Kanal ID
 * @returns {Array} Mesaj listesi
 */
export function loadMessages(channelId) {
  if (!channelId) return [];
  try {
    const raw = localStorage.getItem(key(channelId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('Chat load failed:', e);
    return [];
  }
}

/**
 * Mesaj ekle ve kaydet
 * @param {string} channelId - Kanal ID
 * @param {object} msg - Mesaj objesi {from, username, message, timestamp}
 * @returns {Array} Güncellenmiş mesaj listesi
 */
export function appendMessage(channelId, msg) {
  if (!channelId || !msg) return [];
  const messages = loadMessages(channelId);
  messages.push(msg);
  
  // Son 500 mesajı sakla
  const trimmed = messages.slice(-500);
  localStorage.setItem(key(channelId), JSON.stringify(trimmed));
  return trimmed;
}
