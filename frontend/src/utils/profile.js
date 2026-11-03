/**
 * Profile Utility
 * Kullanıcı profili yönetimi - localStorage'da kalıcı saklama
 */

const USERNAME_KEY = 'vibe-voice-username';
const GENDER_KEY = 'vibe-voice-gender';
const AVATAR_KEY = 'vibe-voice-avatar';
const DISCRIMINATOR_KEY = 'vibe-voice-discriminator';

/**
 * Profili localStorage'dan yükle
 * @returns {object|null} {username, gender, avatar, discriminator} veya null
 */
export function loadProfile() {
  const username = localStorage.getItem(USERNAME_KEY);
  const gender = localStorage.getItem(GENDER_KEY);
  const avatar = localStorage.getItem(AVATAR_KEY);
  
  if (!username || !gender || !avatar) return null;
  
  const avatarId = parseInt(avatar, 10);
  if (!avatarId || avatarId < 1 || avatarId > 20) return null;
  if (gender !== 'male' && gender !== 'female') return null;
  
  let discriminator = localStorage.getItem(DISCRIMINATOR_KEY);
  if (!discriminator) {
    discriminator = String(Math.floor(1000 + Math.random() * 9000));
    localStorage.setItem(DISCRIMINATOR_KEY, discriminator);
  }
  
  return { username, gender, avatar: avatarId, discriminator };
}

/**
 * Profili localStorage'a kaydet
 * @param {object} profile - {username, gender, avatar}
 * @returns {object} Kaydedilen profil {username, gender, avatar, discriminator}
 */
export function saveProfile({ username, gender, avatar }) {
  if (username) {
    localStorage.setItem(USERNAME_KEY, username.trim().substring(0, 20));
  }
  if (gender === 'male' || gender === 'female') {
    localStorage.setItem(GENDER_KEY, gender);
  }
  if (avatar && avatar >= 1 && avatar <= 20) {
    localStorage.setItem(AVATAR_KEY, String(avatar));
  }
  
  let discriminator = localStorage.getItem(DISCRIMINATOR_KEY);
  if (!discriminator) {
    discriminator = String(Math.floor(1000 + Math.random() * 9000));
    localStorage.setItem(DISCRIMINATOR_KEY, discriminator);
  }
  
  return {
    username: localStorage.getItem(USERNAME_KEY),
    gender: localStorage.getItem(GENDER_KEY),
    avatar: parseInt(localStorage.getItem(AVATAR_KEY), 10),
    discriminator,
  };
}
