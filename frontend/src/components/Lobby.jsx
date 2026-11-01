import { useState, useEffect } from 'react';
import { ConnectionStatus } from './ConnectionStatus';
import { getUsername, setUsername } from '../utils/username';

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
  const [roomIdInput, setRoomIdInput] = useState('');
  const [localUsername, setLocalUsername] = useState(username || '');

  // Mount'ta sessionStorage'dan oku
  useEffect(() => {
    const storedUsername = getUsername();
    if (storedUsername) {
      setLocalUsername(storedUsername);
      onUsernameChange(storedUsername);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUsernameChange = (e) => {
    const value = e.target.value;
    setLocalUsername(value);
    const saved = setUsername(value);
    onUsernameChange(saved);
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (roomIdInput.trim()) {
      onJoinRoom(roomIdInput.trim());
      setRoomIdInput('');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo/Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full mb-4 shadow-lg shadow-blue-500/50">
            <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">Vibe-Voice</h1>
          <p className="text-slate-400">Sesli sohbet, artık daha kolay</p>
        </div>

        {/* Connection Status */}
        <div className="mb-6 p-4 bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">Bağlantı Durumu</span>
            <ConnectionStatus isConnected={isConnected} connectionError={connectionError} />
          </div>
        </div>

        {/* Username Input */}
        <div className="mb-6">
          <label className="block text-sm text-slate-400 mb-2">
            Takma Adın (opsiyonel)
          </label>
          <input
            type="text"
            value={localUsername}
            onChange={handleUsernameChange}
            placeholder="İsmini gir..."
            maxLength={20}
            className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
          <p className="text-xs text-slate-500 mt-1">
            Boş bırakırsan otomatik bir isim verilecek
          </p>
        </div>

        {/* Create Room Button */}
        <button
          onClick={onCreateRoom}
          disabled={!isConnected}
          className="w-full mb-4 px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-slate-600 disabled:to-slate-700 disabled:cursor-not-allowed text-white font-semibold rounded-xl shadow-lg shadow-blue-600/50 transition-all hover:scale-105 active:scale-95"
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
        <div className="p-6 bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700">
          <h2 className="text-lg font-semibold text-white mb-4">Oda ID ile Katıl</h2>
          <form onSubmit={handleJoinRoom} className="space-y-3">
            <input
              type="text"
              value={roomIdInput}
              onChange={(e) => setRoomIdInput(e.target.value)}
              placeholder="Oda ID'sini girin..."
              disabled={!isConnected}
              className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={!isConnected || !roomIdInput.trim()}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
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
          <p className="text-xs text-slate-500">
            Oda oluştur veya arkadaşlarının gönderdiği oda ID'si ile katıl
          </p>
        </div>
      </div>
    </div>
  );
}
