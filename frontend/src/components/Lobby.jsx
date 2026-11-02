import { useState, useEffect } from 'react';
import { ConnectionStatus } from './ConnectionStatus';
import { DiscordLayout } from './DiscordLayout';
import { getUsername, setUsername, getGender, setGender, getAvatar, setAvatar } from '../utils/username';
import UpdateStatus from './UpdateStatus';

// Avatar listesi (20 emoji avatar)
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
 * Lobby Component
 * Oda oluşturma/katılma ekranı
 * @param {object} props
 * @param {boolean} props.isConnected - Socket bağlantı durumu
 * @param {string|null} props.connectionError - Bağlantı hatası
 * @param {function} props.onCreateRoom - Oda oluşturma fonksiyonu
 * @param {function} props.onJoinRoom - Odaya katılma fonksiyonu
 * @param {string|null} props.error - Hata mesajı
 * @param {string} props.username - Kullanıcı adı
 * @param {function} props.onUsernameChange - Kullanıcı adı değişim fonksiyonu
 */
export function Lobby({ isConnected, connectionError, onCreateRoom, onJoinRoom, error, username, onUsernameChange }) {
  const [step, setStep] = useState('profile'); // 'profile' | 'room'
  const [roomIdInput, setRoomIdInput] = useState('');
  const [localUsername, setLocalUsername] = useState(username || '');
  const [gender, setGenderState] = useState(null); // 'male' | 'female' | null
  const [avatar, setAvatarState] = useState(null); // 1-20 arası

  // Mount'ta sessionStorage'dan oku
  useEffect(() => {
    const storedUsername = getUsername();
    const storedGender = getGender();
    const storedAvatar = getAvatar();

    if (storedUsername) {
      setLocalUsername(storedUsername);
      onUsernameChange(storedUsername);
    }
    if (storedGender) {
      setGenderState(storedGender);
    }
    if (storedAvatar) {
      setAvatarState(storedAvatar);
    }

    // Eğer tüm bilgiler tamamlanmışsa direkt room adımına geç
    if (storedUsername && storedGender && storedAvatar) {
      setStep('room');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUsernameChange = (e) => {
    const value = e.target.value;
    setLocalUsername(value);
    const saved = setUsername(value);
    onUsernameChange(saved);
  };

  const handleGenderChange = (newGender) => {
    setGenderState(newGender);
    setGender(newGender);
  };

  const handleAvatarChange = (avatarId) => {
    setAvatarState(avatarId);
    setAvatar(avatarId);
  };

  const isProfileComplete = localUsername.trim() && gender && avatar;

  const handleProfileComplete = () => {
    if (isProfileComplete) {
      setStep('room');
    }
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (roomIdInput.trim()) {
      onJoinRoom(roomIdInput.trim());
      setRoomIdInput('');
    }
  };

  // Profil Seçimi Ekranı
  if (step === 'profile') {
    return (
      <DiscordLayout
        username={localUsername}
        chatPanel={
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center mb-4">
              <span className="text-3xl">👤</span>
            </div>
            <p className="text-gray-400 text-sm">Profilini oluştur</p>
          </div>
        }
      >
        <div className="flex-1 flex items-center justify-center p-4 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
          <div className="max-w-2xl w-full">
            {/* Logo/Title */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-full mb-4 shadow-lg shadow-indigo-500/50">
                <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <h1 className="text-4xl font-bold text-white mb-2">Profilini Oluştur</h1>
              <p className="text-gray-400">Sesli sohbete başlamadan önce profilini tamamla</p>
            </div>

            {/* Connection Status */}
            <div className="mb-6 p-4 bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Bağlantı Durumu</span>
                <ConnectionStatus isConnected={isConnected} connectionError={connectionError} />
              </div>
            </div>

            {/* Update Status */}
            <div className="mb-6">
              <UpdateStatus />
            </div>

            {/* Kullanıcı Adı */}
            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-2">
                Kullanıcı Adı
              </label>
              <input
                type="text"
                value={localUsername}
                onChange={handleUsernameChange}
                maxLength={20}
                placeholder="Kullanıcı adınız"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Cinsiyet Seçimi */}
            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-2">
                Cinsiyet
              </label>
              <div className="flex space-x-3">
                <button
                  onClick={() => handleGenderChange('male')}
                  className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
                    gender === 'male'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  ♂ Erkek
                </button>
                <button
                  onClick={() => handleGenderChange('female')}
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

            {/* Avatar Seçimi */}
            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-2">
                Avatar Seç
              </label>
              <div className="grid grid-cols-5 gap-3">
                {AVATARS.map((av) => (
                  <button
                    key={av.id}
                    onClick={() => handleAvatarChange(av.id)}
                    className={`aspect-square rounded-lg text-3xl flex items-center justify-center transition-all ${
                      avatar === av.id
                        ? 'bg-indigo-600 ring-2 ring-indigo-400 scale-110'
                        : 'bg-gray-800 hover:bg-gray-700'
                    }`}
                    title={av.name}
                  >
                    {av.emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Devam Butonu */}
            <button
              onClick={handleProfileComplete}
              disabled={!isProfileComplete}
              className={`w-full py-4 rounded-lg font-medium transition-colors ${
                isProfileComplete
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              Devam Et →
            </button>
          </div>
        </div>
      </DiscordLayout>
    );
  }

  // Oda Oluştur/Katıl Ekranı
  return (
    <DiscordLayout
      username={localUsername}
      chatPanel={
        <div className="flex flex-col items-center justify-center h-full p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center mb-4">
            <span className="text-3xl">💬</span>
          </div>
          <p className="text-gray-400 text-sm">Bir odaya katılarak sohbete başla</p>
        </div>
      }
    >
      <div className="flex-1 flex items-center justify-center p-4 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        <div className="max-w-md w-full">
          {/* Logo/Title */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-full mb-4 shadow-lg shadow-indigo-500/50">
              <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <h1 className="text-4xl font-bold text-white mb-2">Vibe-Voice</h1>
            <p className="text-gray-400">Sesli sohbet, artık daha kolay</p>
          </div>

          {/* Profil Özeti */}
          <div className="mb-6 p-4 bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700 flex items-center">
            <div className="text-3xl mr-3">
              {AVATARS.find((a) => a.id === avatar)?.emoji}
            </div>
            <div className="flex-1">
              <div className="text-white font-medium">{localUsername}</div>
              <div className="text-gray-400 text-sm">
                {gender === 'male' ? '♂ Erkek' : '♀ Kadın'}
              </div>
            </div>
            <button
              onClick={() => setStep('profile')}
              className="text-indigo-400 hover:text-indigo-300 text-sm"
            >
              Düzenle
            </button>
          </div>

          {/* Connection Status */}
          <div className="mb-6 p-4 bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Bağlantı Durumu</span>
              <ConnectionStatus isConnected={isConnected} connectionError={connectionError} />
            </div>
          </div>

          {/* Update Status */}
          <div className="mb-6">
            <UpdateStatus />
          </div>

          {/* Create Room Button */}
          <button
            onClick={onCreateRoom}
            disabled={!isConnected}
            className="w-full mb-4 px-6 py-4 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-xl shadow-lg shadow-indigo-600/50 transition-all hover:scale-105 active:scale-95"
          >
            <div className="flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                  clipRule="evenodd"
                />
              </svg>
              <span>Yeni Oda Oluştur</span>
            </div>
          </button>

          {/* Join Room Form */}
          <div className="p-6 bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700">
            <h2 className="text-lg font-semibold text-white mb-4">Oda ID ile Katıl</h2>
            <form onSubmit={handleJoinRoom} className="space-y-3">
              <input
                type="text"
                value={roomIdInput}
                onChange={(e) => setRoomIdInput(e.target.value)}
                placeholder="Oda ID'sini girin..."
                disabled={!isConnected}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                type="submit"
                disabled={!isConnected || !roomIdInput.trim()}
                className="w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
              >
                Odaya Katıl
              </button>
            </form>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mt-4 p-4 bg-red-900/50 border border-red-700 rounded-xl">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Info */}
          <div className="mt-6 text-center">
            <p className="text-xs text-gray-500">
              Oda oluştur veya arkadaşlarının gönderdiği oda ID'si ile katıl
            </p>
          </div>
        </div>
      </div>
    </DiscordLayout>
  );
}
