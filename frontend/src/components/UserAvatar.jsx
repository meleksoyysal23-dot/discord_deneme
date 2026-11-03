import React, { useMemo } from 'react';
import { getDisplayName, getInitial } from '../utils/username';

// Avatar listesi (Lobby.jsx ile aynı)
const AVATARS = [
  { id: 1, emoji: '🦊' },
  { id: 2, emoji: '🐺' },
  { id: 3, emoji: '🦁' },
  { id: 4, emoji: '🐯' },
  { id: 5, emoji: '🐻' },
  { id: 6, emoji: '🐼' },
  { id: 7, emoji: '🐨' },
  { id: 8, emoji: '🐸' },
  { id: 9, emoji: '🦄' },
  { id: 10, emoji: '🐲' },
  { id: 11, emoji: '🦋' },
  { id: 12, emoji: '🌸' },
  { id: 13, emoji: '⭐' },
  { id: 14, emoji: '🌙' },
  { id: 15, emoji: '🔥' },
  { id: 16, emoji: '💎' },
  { id: 17, emoji: '🎮' },
  { id: 18, emoji: '🎵' },
  { id: 19, emoji: '🚀' },
  { id: 20, emoji: '💀' },
];

/**
 * UserAvatar Component
 * Kullanıcı avatarı ve konuşma göstergesi
 * @param {object} props
 * @param {object} props.user - Kullanıcı bilgisi { userId, isMuted, gender, avatar }
 * @param {number} props.volume - Ses seviyesi (0-1)
 * @param {boolean} props.isLocalUser - Yerel kullanıcı mı?
 * @param {string} props.username - Kullanıcı adı (opsiyonel)
 * @param {boolean} props.isSpeaking - Aktif olarak konuşuyor mu?
 */
export const UserAvatar = React.memo(function UserAvatar({ user, volume = 0, isLocalUser = false, username, isSpeaking = false }) {
  const { userId, isMuted, gender, avatar } = user;

  // Görüntülenecek isim
  const displayName = useMemo(() => {
    return getDisplayName(userId, username);
  }, [userId, username]);

  // İsim baş harfi (fallback için)
  const initial = useMemo(() => {
    return getInitial(username, userId);
  }, [username, userId]);

  // Avatar emoji
  const avatarEmoji = useMemo(() => {
    if (avatar) {
      const avatarData = AVATARS.find((a) => a.id === avatar);
      return avatarData ? avatarData.emoji : null;
    }
    return null;
  }, [avatar]);

  // Glow efekti için hesaplamalar
  const glowIntensity = useMemo(() => {
    // Ses seviyesine göre glow intensity (0-1 arası)
    return Math.min(volume * 10, 1);
  }, [volume]);

  const glowColor = useMemo(() => {
    return `rgba(59, 130, 246, ${glowIntensity})`;
  }, [glowIntensity]);

  const boxShadow = useMemo(() => {
    if (glowIntensity === 0) return 'none';
    return `0 0 ${20 * glowIntensity}px ${10 * glowIntensity}px ${glowColor}`;
  }, [glowIntensity, glowColor]);

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Avatar container */}
      <div className="relative">
        {/* Speaking ring (yeşil halka - aktif konuşan kişi) */}
        <div
          className={`w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center transition-all duration-150 ${
            isSpeaking
              ? 'ring-4 ring-green-500 ring-offset-2 ring-offset-gray-900 animate-pulse'
              : ''
          }`}
        >
          {/* Avatar circle */}
          <div
            className="w-full h-full rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-2xl md:text-3xl font-bold transition-all duration-150"
            style={{ boxShadow }}
          >
            {avatarEmoji || initial}
          </div>
        </div>

        {/* Gender badge */}
        {gender && (
          <div className={`absolute -bottom-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm border-2 border-slate-800 ${
            gender === 'male' ? 'bg-blue-600' : 'bg-pink-600'
          }`}>
            {gender === 'male' ? '♂' : '♀'}
          </div>
        )}

        {/* Mute indicator */}
        {isMuted && (
          <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-red-600 rounded-full flex items-center justify-center border-2 border-slate-800">
            <svg
              className="w-4 h-4 text-white"
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.701.705L4.857 13.36A1 1 0 004 12.646V7.354a1 1 0 00-.857-.64L1.701 3.372A1 1 0 013.383 2.076L6 4.686V4a4 4 0 018 0v.686l2.617-2.61A1 1 0 0118.383 3.372L15 6.757V12.646a1 1 0 01-.857.994l-3.442 3.34A1 1 0 019 16V4a1 1 0 01.383-.924z"
                clipRule="evenodd"
              />
              <path d="M10 18a3 3 0 003-3h-6a3 3 0 003 3z" />
            </svg>
          </div>
        )}

        {/* Local user indicator */}
        {isLocalUser && (
          <div className="absolute -top-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center border-2 border-slate-800">
            <svg
              className="w-3 h-3 text-white"
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Username */}
      <div className="text-center">
        <p className="text-sm text-white font-medium truncate max-w-[120px]">
          {displayName}
        </p>
        {isLocalUser && (
          <p className="text-xs text-slate-400">(Sen)</p>
        )}
      </div>
    </div>
  );
});
