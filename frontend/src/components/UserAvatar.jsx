import React, { useMemo } from 'react';
import { getDisplayName, getInitial } from '../utils/username';

/**
 * UserAvatar Component
 * Kullanıcı avatarı ve konuşma göstergesi
 * @param {object} props
 * @param {object} props.user - Kullanıcı bilgisi { userId, isMuted }
 * @param {number} props.volume - Ses seviyesi (0-1)
 * @param {boolean} props.isLocalUser - Yerel kullanıcı mı?
 * @param {string} props.username - Kullanıcı adı (opsiyonel)
 */
export const UserAvatar = React.memo(function UserAvatar({ user, volume = 0, isLocalUser = false, username }) {
  const { userId, isMuted } = user;

  // Görüntülenecek isim
  const displayName = useMemo(() => {
    return getDisplayName(userId, username);
  }, [userId, username]);

  // İsim baş harfi
  const initial = useMemo(() => {
    return getInitial(username, userId);
  }, [username, userId]);

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
        {/* Avatar circle */}
        <div
          className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-2xl md:text-3xl font-bold transition-all duration-150"
          style={{ boxShadow }}
        >
          {initial}
        </div>

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
