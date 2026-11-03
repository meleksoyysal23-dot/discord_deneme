import { useState } from 'react';
import { saveProfile } from '../utils/profile';

// Avatar listesi (20 emoji avatar) — Lobby ile aynı
const AVATARS = [
  { id: 1, emoji: '🦊', name: 'Tilki' },
  { id: 2, emoji: '🐺', name: 'Kurt' },
  { id: 3, emoji: '🦁', name: 'Aslan' },
  { id: 4, emoji: '🐯', name: 'Kaplan' },
  { id: 5, emoji: '🐻', name: 'Ayı' },
  { id: 6, emoji: '🐼', name: 'Panda' },
  { id: 7, emoji: '🐨', name: 'Koala' },
  { id: 8, emoji: '🐸', name: 'Kurbağa' },
  { id: 9, emoji: '🦄', name: 'Unicorn' },
  { id: 10, emoji: '🐲', name: 'Ejderha' },
  { id: 11, emoji: '🦋', name: 'Kelebek' },
  { id: 12, emoji: '🌸', name: 'Çiçek' },
  { id: 13, emoji: '⭐', name: 'Yıldız' },
  { id: 14, emoji: '🌙', name: 'Ay' },
  { id: 15, emoji: '🔥', name: 'Ateş' },
  { id: 16, emoji: '💎', name: 'Elmas' },
  { id: 17, emoji: '🎮', name: 'Oyuncu' },
  { id: 18, emoji: '🎵', name: 'Müzik' },
  { id: 19, emoji: '🚀', name: 'Roket' },
  { id: 20, emoji: '💀', name: 'Kafatası' },
];

/**
 * ProfileSetup Component
 * İlk açılışta tam ekran profil oluşturma ekranı.
 * Kullanıcı adı + cinsiyet + avatar seçilmeden "Devam Et" pasiftir.
 *
 * @param {object} props
 * @param {function} props.onComplete - (profile) => void
 */
export function ProfileSetup({ onComplete }) {
  const [username, setUsernameState] = useState('');
  const [gender, setGenderState] = useState(null); // 'male' | 'female' | null
  const [avatar, setAvatarState] = useState(null); // 1-20

  const isComplete = username.trim().length > 0 && gender && avatar;

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!isComplete) return;
    const profile = saveProfile({ username, gender, avatar });
    if (onComplete) onComplete(profile);
  };

  return (
    <div className="h-screen w-screen overflow-y-auto bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <div className="min-h-full flex items-center justify-center p-4 py-10">
        <div className="max-w-2xl w-full">
          {/* Logo / Başlık */}
          <div className="text-center mb-8">
            <img src="/logo.png" alt="VoiceCan" className="w-20 h-20 rounded-2xl mx-auto mb-4 shadow-lg object-cover" />
            <h1 className="text-4xl font-bold text-white mb-2">VoiceCan</h1>
            <p className="text-gray-400">Sesli sohbete başlamadan önce profilini tamamla</p>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Kullanıcı Adı */}
            <div className="mb-6">
              <label htmlFor="profile-username" className="block text-sm text-gray-400 mb-2">
                Kullanıcı Adı
              </label>
              <input
                id="profile-username"
                type="text"
                value={username}
                onChange={(e) => setUsernameState(e.target.value)}
                maxLength={20}
                placeholder="Kullanıcı adınız"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Cinsiyet */}
            <div className="mb-6">
              <span className="block text-sm text-gray-400 mb-2">Cinsiyet</span>
              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => setGenderState('male')}
                  aria-pressed={gender === 'male'}
                  className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
                    gender === 'male'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  ♂ Erkek
                </button>
                <button
                  type="button"
                  onClick={() => setGenderState('female')}
                  aria-pressed={gender === 'female'}
                  className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
                    gender === 'female'
                      ? 'bg-pink-600 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  ♀ Kadın
                </button>
              </div>
            </div>

            {/* Avatar */}
            <div className="mb-6">
              <span className="block text-sm text-gray-400 mb-2">Avatar Seç</span>
              <div className="grid grid-cols-5 gap-3">
                {AVATARS.map((av) => (
                  <button
                    key={av.id}
                    type="button"
                    onClick={() => setAvatarState(av.id)}
                    aria-pressed={avatar === av.id}
                    className={`aspect-square rounded-lg text-3xl flex items-center justify-center transition-all ${
                      avatar === av.id
                        ? 'bg-indigo-600 ring-2 ring-indigo-400 scale-110'
                        : 'bg-gray-800 hover:bg-gray-700'
                    }`}
                    title={av.name}
                    aria-label={av.name}
                  >
                    {av.emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Devam Et */}
            <button
              type="submit"
              disabled={!isComplete}
              className={`w-full py-4 rounded-lg font-medium transition-colors ${
                isComplete
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              Devam Et →
            </button>
          </form>
          <div className="text-center mt-6 text-xs text-gray-500">
            VoiceCan — Geliştirici: Mehmetcan Bayatlı
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProfileSetup;