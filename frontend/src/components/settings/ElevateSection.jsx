import { useState } from 'react';
import { elevate } from '../../services/api';

export function ElevateSection({ user, onElevateSuccess }) {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('idle'); // idle, loading, success, error
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;

    setStatus('loading');
    setMessage('');

    try {
      const data = await elevate(code);
      if (data.success) {
        setStatus('success');
        setMessage('🎉 Super Admin yetkisi kazanıldı!');
        if (onElevateSuccess) onElevateSuccess();
        setCode('');
      } else {
        setStatus('error');
        setMessage(data.error || 'Geçersiz kurucu kodu');
      }
    } catch (error) {
      setStatus('error');
      setMessage(error.message || 'Bağlantı hatası');
    }
  };

  if (user?.superAdmin) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-white">Super Admin Durumu</h3>
        <div className="flex items-center gap-2 px-3 py-2 bg-green-900/50 border border-green-700 rounded-lg">
          <span className="text-green-400 text-lg">👑</span>
          <span className="text-green-300 text-sm font-medium">Super Admin Aktif</span>
        </div>
        <p className="text-xs text-gray-400">Tüm sunucuları görebilir ve yönetebilirsin.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-white">Kurucu Kodu</h3>
      <p className="text-xs text-gray-400">Super Admin yetkisi için kurucu kodunu gir</p>
      
      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Kurucu kodunu gir..."
          className="w-full px-3 py-2 bg-[#1e1f22] border border-gray-700 rounded-md text-white text-sm focus:outline-none focus:border-[#5865f2]"
          disabled={status === 'loading'}
        />
        
        <button
          type="submit"
          disabled={status === 'loading' || !code.trim()}
          className="w-full px-4 py-2 bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
        >
          {status === 'loading' ? 'Kontrol ediliyor...' : 'Yetki Al'}
        </button>
      </form>

      {message && (
        <div className={`text-xs px-3 py-2 rounded-md ${
          status === 'success' ? 'bg-green-900/50 text-green-300' :
          status === 'error' ? 'bg-red-900/50 text-red-300' :
          'bg-gray-800 text-gray-300'
        }`}>
          {message}
        </div>
      )}
    </div>
  );
}
