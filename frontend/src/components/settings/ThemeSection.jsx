import { useState, useEffect } from 'react';

const THEMES = [
  {
    id: 'default',
    name: 'Varsayılan',
    gradient: 'linear-gradient(135deg, #5865f2 0%, #4752c4 100%)',
    preview: 'bg-[#5865f2]',
  },
  {
    id: 'nitro-pink',
    name: 'Nitro Pembe',
    gradient: 'linear-gradient(135deg, #ff6b9d 0%, #c44dff 100%)',
    preview: 'bg-gradient-to-r from-pink-500 to-purple-500',
  },
  {
    id: 'ocean',
    name: 'Okyanus',
    gradient: 'linear-gradient(135deg, #00d2ff 0%, #3a7bd5 100%)',
    preview: 'bg-gradient-to-r from-cyan-400 to-blue-600',
  },
  {
    id: 'sunset',
    name: 'Gün Batımı',
    gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    preview: 'bg-gradient-to-r from-pink-300 to-red-500',
  },
  {
    id: 'forest',
    name: 'Orman',
    gradient: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
    preview: 'bg-gradient-to-r from-emerald-600 to-green-400',
  },
  {
    id: 'midnight',
    name: 'Gece Yarısı',
    gradient: 'linear-gradient(135deg, #232526 0%, #414345 100%)',
    preview: 'bg-gradient-to-r from-gray-800 to-gray-600',
  },
];

export function ThemeSection({ currentTheme, onThemeChange }) {
  const [selectedTheme, setSelectedTheme] = useState(currentTheme || 'default');

  useEffect(() => {
    const theme = THEMES.find(t => t.id === selectedTheme);
    if (theme) {
      document.documentElement.style.setProperty('--theme-gradient', theme.gradient);
    }
  }, [selectedTheme]);

  const handleSelect = (themeId) => {
    setSelectedTheme(themeId);
    localStorage.setItem('voicecan-theme', themeId);
    if (onThemeChange) onThemeChange(themeId);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-white">Tema</h3>
      <p className="text-xs text-gray-400">Arayüz renklerini kişiselleştir</p>
      
      <div className="grid grid-cols-2 gap-3">
        {THEMES.map((theme) => (
          <button
            key={theme.id}
            onClick={() => handleSelect(theme.id)}
            className={`relative p-3 rounded-lg border-2 transition-all ${
              selectedTheme === theme.id
                ? 'border-white shadow-lg scale-105'
                : 'border-transparent hover:border-gray-600'
            }`}
          >
            <div className={`h-12 rounded-md mb-2 ${theme.preview}`} />
            <span className="text-xs text-gray-300">{theme.name}</span>
            {selectedTheme === theme.id && (
              <div className="absolute top-2 right-2 w-4 h-4 bg-white rounded-full flex items-center justify-center">
                <svg className="w-3 h-3 text-black" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
