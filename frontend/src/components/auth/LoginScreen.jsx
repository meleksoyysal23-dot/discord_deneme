import { useState } from 'react';
import { login, register } from '../../services/api';

const AVATAR_EMOJIS = ['🎮', '🎯', '🎨', '🎵', '🎬', '📚', '🚀', '⭐', '🔥', '💎', '🌟', '🎪', '🎭', '🎲', '🎸', '🎺', '🎻', '🥁', '🎤', '🎧'];

export function LoginScreen({ onLoginSuccess }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [identifier, setIdentifier] = useState(''); // email veya username
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('🎮');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let result;
      if (mode === 'login') {
        // Backend identifier destekliyor (email veya username)
        result = await login({ identifier, password });
      } else {
        // Register'da backend username bekliyor, identifier'ı username olarak kullan
        result = await register({ username: identifier, password, displayName: displayName || undefined, avatar: selectedAvatar });
      }

      // Token'ı localStorage'a kaydet (session persistence)
      localStorage.setItem('voicecan-token', result.token);
      
      // Başarılı giriş
      if (onLoginSuccess) {
        onLoginSuccess(result.user);
      }
    } catch (err) {
      setError(err.message || 'Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#313338] flex items-start justify-center p-4 overflow-y-auto py-8">
      <div className="w-full max-w-md bg-[#1e1f22] rounded-lg shadow-2xl p-8 my-8 mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">VoiceCan</h1>
          <p className="text-[#949ba4] text-sm">
            {mode === 'login' ? 'Hesabına giriş yap' : 'Yeni hesap oluştur'}
          </p>
        </div>

        {mode === 'register' && (
          <div className="mb-6 p-4 bg-indigo-950/30 border border-indigo-500/50 rounded-lg">
            <h3 className="text-sm font-bold text-indigo-300 mb-3 flex items-center gap-2">
              <span className="text-lg">✨</span>
              YENİLİKLER (v2.1.0)
            </h3>
            <ul className="space-y-2 text-xs text-gray-300">
              <li className="flex items-start gap-2">
                <span className="text-base">🎙️</span>
                <span>Gelişmiş Ses, Kamera &amp; Go Live (Ekran Paylaşımı) Sistemi aktif edildi!</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-base">👑</span>
                <span>Yeni Kurucu (Süper Admin) ve otomatik giriş desteği.</span>
              </li>
            </ul>
            <div className="mt-4 pt-3 border-t border-indigo-500/30">
              <button
                type="button"
                onClick={() => {
                  if (window.electronAPI && window.electronAPI.openExternal) {
                    window.electronAPI.openExternal('https://github.com/meleksoyysal23-dot/discord_deneme/releases');
                  } else {
                    window.open('https://github.com/meleksoyysal23-dot/discord_deneme/releases', '_blank');
                  }
                }}
                className="w-full py-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white text-xs font-bold rounded-md transition-all flex items-center justify-center gap-2"
              >
                <span>🚀</span>
                <span>Sürümü Güncelle / Yeni Sürümü İndir</span>
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#b5bac1] uppercase mb-2">
              E-posta veya Kullanıcı Adı <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="test1@test.com veya kullanici_adi"
              className="w-full px-3 py-2 bg-[#1e1f22] border border-[#1e1f22] rounded-md text-white text-sm focus:outline-none focus:border-[#5865f2] transition-colors"
              required
              disabled={loading}
            />
          </div>

          {mode === 'register' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-[#b5bac1] uppercase mb-2">
                  Görünen Ad (Opsiyonel)
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Görünen adınız"
                  className="w-full px-3 py-2 bg-[#1e1f22] border border-[#1e1f22] rounded-md text-white text-sm focus:outline-none focus:border-[#5865f2] transition-colors"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#b5bac1] uppercase mb-2">
                  Avatar Seç
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {AVATAR_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setSelectedAvatar(emoji)}
                      disabled={loading}
                      className={`w-full aspect-square flex items-center justify-center text-2xl rounded-md transition-all ${
                        selectedAvatar === emoji
                          ? 'bg-[#5865f2] ring-2 ring-[#5865f2] scale-110'
                          : 'bg-[#2b2d31] hover:bg-[#35373c]'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#b5bac1] uppercase mb-2">
              Şifre <span className="text-red-400">*</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 bg-[#1e1f22] border border-[#1e1f22] rounded-md text-white text-sm focus:outline-none focus:border-[#5865f2] transition-colors"
              required
              disabled={loading}
            />
          </div>

          {error && (
            <div className="px-3 py-2 bg-red-900/50 border border-red-700 rounded-md text-red-300 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors"
          >
            {loading ? 'Yükleniyor...' : mode === 'login' ? 'Giriş Yap' : 'Kayıt Ol'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <span className="text-[#949ba4] text-sm">
            {mode === 'login' ? 'Hesabın yok mu? ' : 'Zaten hesabın var mı? '}
          </span>
          <button
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError('');
            }}
            className="text-[#00a8fc] hover:underline text-sm font-medium"
            disabled={loading}
          >
            {mode === 'login' ? 'Kayıt Ol' : 'Giriş Yap'}
          </button>
        </div>
      </div>
    </div>
  );
}
