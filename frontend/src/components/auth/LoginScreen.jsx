import { useState, useEffect } from 'react';
import { login } from '../../services/api';

const AVATAR_EMOJIS = ['🎮', '🎯', '🎨', '🎵', '🎬', '📚', '🚀', '⭐', '🔥', '💎', '🌟', '🎪', '🎭', '🎲', '🎸', '🎺', '🎻', '🥁', '🎤', '🎧'];

export function LoginScreen({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('🎮');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [updateStatus, setUpdateStatus] = useState('idle');
  const [updateProgress, setUpdateProgress] = useState(0);

  useEffect(() => {
    if (!window.electronAPI?.onUpdateStatus) return;
    const unsub1 = window.electronAPI.onUpdateStatus((status) => setUpdateStatus(status));
    const unsub2 = window.electronAPI.onUpdateProgress((p) => {
      if (p && typeof p.percent === 'number') setUpdateProgress(Math.round(p.percent));
    });
    return () => { unsub1(); unsub2(); };
  }, []);

  const handleUpdateClick = async () => {
    if (!window.electronAPI?.checkForUpdates) {
      window.open('https://github.com/meleksoyysal23-dot/discord_deneme/releases', '_blank');
      return;
    }
    if (updateStatus === 'downloaded') {
      await window.electronAPI.quitAndInstall();
      return;
    }
    if (updateStatus === 'idle' || updateStatus === 'not-available' || updateStatus === 'error') {
      try {
        const result = await window.electronAPI.checkForUpdates();
        if (result?.status === 'available') {
          await window.electronAPI.downloadUpdate();
        }
      } catch (err) {
        setUpdateStatus('error');
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Backend artık şifresiz - sadece username gönder
      const result = await login({ username, password: '' }); // password boş string (backend ignore edecek)

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
          <p className="text-[#949ba4] text-sm">İsmini yaz ve sohbete katıl</p>
        </div>

        <div className="mb-6 flex justify-end">
          <button
            type="button"
            onClick={handleUpdateClick}
            disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
            className={`px-3 py-1.5 text-white text-xs font-bold rounded-md transition-all flex items-center gap-1.5 shadow-lg disabled:opacity-60 disabled:cursor-not-allowed ${
              updateStatus === 'downloaded' ? 'bg-gradient-to-r from-green-500 to-emerald-500 animate-pulse hover:from-green-600 hover:to-emerald-600' :
              updateStatus === 'not-available' ? 'bg-gradient-to-r from-gray-500 to-gray-600 cursor-default' :
              updateStatus === 'error' ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700' :
              'bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600'
            }`}
          >
            {updateStatus === 'checking' && <><span className="animate-spin">⏳</span><span>Araniyor...</span></>}
            {updateStatus === 'not-available' && <><span>✓</span><span>Guncel</span></>}
            {updateStatus === 'available' && <><span>🚀</span><span>Yeni surum hazirlaniyor...</span></>}
            {updateStatus === 'downloading' && <><span className="animate-pulse">⬇️</span><span>Indiriliyor %{updateProgress}</span></>}
            {updateStatus === 'downloaded' && <><span>✅</span><span>Kur ve Yeniden Baslat</span></>}
            {updateStatus === 'error' && <><span>⚠️</span><span>Tekrar Dene</span></>}
            {updateStatus === 'idle' && <><span>🚀</span><span>Surumu Guncelle</span></>}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#b5bac1] uppercase mb-2">
              Kullanıcı Adı <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="kullanici_adi"
              className="w-full px-3 py-2 bg-[#1e1f22] border border-[#1e1f22] rounded-md text-white text-sm focus:outline-none focus:border-[#5865f2] transition-colors"
              required
              disabled={loading}
              minLength={3}
              maxLength={20}
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
            {loading ? 'Yükleniyor...' : 'Giriş Yap'}
          </button>
        </form>
      </div>
    </div>
  );
}
