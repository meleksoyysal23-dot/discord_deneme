import { useState, useMemo, useEffect, useRef } from 'react';
import UpdateSection from './settings/UpdateSection';
import { ThemeSection } from './settings/ThemeSection';
import { ElevateSection } from './settings/ElevateSection';
import { updateProfile } from '../services/api';

const AVATAR_EMOJIS = ['🎮', '🎯', '🎨', '🎵', '🎬', '📚', '🚀', '⭐', '🔥', '💎', '🌟', '🎪', '🎭', '🎲', '🎸', '🎺', '🎻', '🥁', '🎤', '🎧'];

/**
 * DiscordLayout Component
 * Discord benzeri 3-sütun + rail layout. Gerçek sunucu/kanal verisiyle çalışır;
 * veri sağlanmazsa güvenli (mock olmayan) fallback ile render eder.
 */

// Fallback veri — API/yerel veri yoksa gösterilir. Mock isim içermez.
const FALLBACK_SERVERS = [{ id: '__fallback__', name: 'Sunucum', icon: null }];
const FALLBACK_CHANNELS = [
  { id: 'fb-general', name: 'genel', type: 'TEXT', parentId: null, position: 0 },
  { id: 'fb-voice', name: 'Genel Ses', type: 'VOICE', parentId: null, position: 1 },
];

export function DiscordLayout(props) {
  const {
    children,
    username,
    avatarEmoji,
    roomId,
    servers,
    activeServerId,
    onSelectServer,
    channels,
    activeChannelId,
    onSelectChannel,
    isOwner = false,
    onCreateChannel,
    onDeleteChannel,
    onMoveChannel,
    onCreateServer,
    isMuted,
    onToggleMute,
    isDeafened,
    onToggleDeafen,
    participants,
    discriminator,
    localVolume,
    user,
    onLogout,
    onUserUpdate,
    enumerateDevices,
    switchAudioDevice,
  } = props;

  const [collapsedCategories, setCollapsedCategories] = useState(new Set());
  const [serverMenuOpen, setServerMenuOpen] = useState(false);
  const serverMenuRef = useRef(null);

  // Audio device states
  const [audioDevices, setAudioDevices] = useState({ audioInputs: [], audioOutputs: [] });
  const [selectedMicDevice, setSelectedMicDevice] = useState('');
  const [selectedSpeakerDevice, setSelectedSpeakerDevice] = useState('');

  // Modal states
  const [showCreateServerModal, setShowCreateServerModal] = useState(false);
  const [newServerName, setNewServerName] = useState('');
  const [showCreateChannelModal, setShowCreateChannelModal] = useState(false);
  const [newChannelType, setNewChannelType] = useState('TEXT');
  const [newChannelName, setNewChannelName] = useState('');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState('profile');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');

  const toggleCategory = (catId) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  // Sunucu menüsü dışına tıklanınca kapat
  useEffect(() => {
    if (!serverMenuOpen) return;
    const handleClickOutside = (e) => {
      if (serverMenuRef.current && !serverMenuRef.current.contains(e.target)) {
        setServerMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [serverMenuOpen]);

  // Cihazları yükle
  useEffect(() => {
    if (enumerateDevices) {
      enumerateDevices().then(setAudioDevices);
    }
  }, [enumerateDevices]);

  const userInitial = (avatarEmoji || username?.[0] || 'U').toUpperCase?.() || 'U';
  const displayName = username || 'Kullanıcı';
  const userDiscriminator = discriminator || '0001';

  const serverList = Array.isArray(servers) && servers.length > 0 ? servers : FALLBACK_SERVERS;
  const channelList = Array.isArray(channels) && channels.length > 0 ? channels : FALLBACK_CHANNELS;

  const activeServer =
    serverList.find((s) => s.id === activeServerId) || serverList[0];
  const serverName = activeServer?.name || 'Sunucu';

  // Kanalları parentId'e göre grupla (kategori aç/kapa)
  const groupedChannels = useMemo(() => {
    const groups = new Map();
    const parentNames = new Map();

    // Önce parent isimlerini topla
    for (const ch of channelList) {
      if (ch.parentId) {
        const parent = channelList.find((p) => p.id === ch.parentId);
        if (parent) parentNames.set(ch.parentId, parent.name);
      }
    }

    // Kanalları gruplara dağıt (CATEGORY tipi kendisi render edilmez)
    for (const ch of channelList) {
      if (ch.type === 'CATEGORY') continue;
      const key = ch.parentId || '__root__';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(ch);
    }

    // Her grubu position'a göre sırala
    for (const arr of groups.values()) {
      arr.sort((a, b) => (a.position || 0) - (b.position || 0));
    }

    // Root grubu en üstte, diğerleri ilk çocuk position'una göre
    const result = [];
    if (groups.has('__root__')) {
      result.push({
        id: '__root__',
        name: 'Kanallar',
        channels: groups.get('__root__'),
      });
      groups.delete('__root__');
    }
    const remaining = Array.from(groups.entries()).sort((a, b) => {
      const ap = a[1][0]?.position || 0;
      const bp = b[1][0]?.position || 0;
      return ap - bp;
    });
    for (const [id, chs] of remaining) {
      result.push({
        id,
        name: parentNames.get(id) || 'Kategori',
        channels: chs,
      });
    }
    return result;
  }, [channelList]);

  // Ses kanalı katılımcı sayısı (yalnızca mevcut roomId için)
  const participantCountByChannel = useMemo(() => {
    const map = {};
    if (roomId && Array.isArray(participants)) {
      map[roomId] = participants.length;
    }
    return map;
  }, [roomId, participants]);

  const handleServerClick = (serverId) => {
    if (onSelectServer && serverId !== activeServerId) {
      onSelectServer(serverId);
    }
  };

  const handleChannelClick = (channel) => {
    if (onSelectChannel) onSelectChannel(channel);
  };

  const handleCreateChannel = (type) => {
    setServerMenuOpen(false);
    setNewChannelType(type);
    setNewChannelName('');
    setShowCreateChannelModal(true);
  };

  const handleAddServer = () => {
    setNewServerName('');
    setShowCreateServerModal(true);
  };

  // Initialize profile edit fields when settings modal opens
  useEffect(() => {
    if (showSettingsModal) {
      setEditDisplayName(user?.displayName || username || '');
      setEditAvatar(user?.avatar || avatarEmoji || '🎮');
      setProfileError('');
    }
  }, [showSettingsModal, user, username, avatarEmoji]);

  const handleSaveProfile = async () => {
    setProfileSaving(true);
    setProfileError('');
    try {
      const result = await updateProfile({
        displayName: editDisplayName.trim() || undefined,
        avatar: editAvatar,
      });
      if (result?.user && onUserUpdate) {
        onUserUpdate(result.user);
      }
      // Close modal after success
      setShowSettingsModal(false);
    } catch (err) {
      setProfileError(err.message || 'Profil güncelleme başarısız');
    } finally {
      setProfileSaving(false);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ backgroundImage: 'var(--theme-gradient)' }}>
      {/* ============ Server Rail ============ */}
      <aside className="w-[72px] flex flex-col items-center py-3 flex-shrink-0 overflow-y-auto bg-black/20 backdrop-blur-sm">
        {serverList.map((server) => {
          const isActive = server.id === activeServer?.id;
          const initial = (server.name || 'S')[0]?.toUpperCase() || 'S';
          return (
            <div key={server.id} className="relative mb-2">
              {isActive && (
                <span
                  className="absolute top-1/2 -translate-y-1/2 w-1 h-10 rounded-r bg-white -left-1"
                  aria-hidden
                />
              )}
              <button
                onClick={() => handleServerClick(server.id)}
                className={`w-12 h-12 flex items-center justify-center text-white font-semibold transition-all overflow-hidden ${
                  isActive
                    ? 'rounded-2xl bg-[#5865f2]'
                    : 'rounded-full bg-[#313338] hover:rounded-2xl hover:bg-[#5865f2]'
                }`}
                title={server.name}
                aria-label={server.name}
                aria-current={isActive ? 'true' : undefined}
              >
                {server.icon ? (
                  <img
                    src={server.icon}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-base">{initial}</span>
                )}
              </button>
            </div>
          );
        })}

        {/* Ayırıcı */}
        <div className="w-8 h-0.5 my-1 rounded bg-[#35373c]" />

        {/* Sunucu ekle */}
        <button
          onClick={handleAddServer}
          className="w-12 h-12 rounded-full flex items-center justify-center text-green-500 bg-[#313338] hover:rounded-2xl hover:bg-green-600 hover:text-white transition-all"
          title="Sunucu ekle"
          aria-label="Sunucu ekle"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
          </svg>
        </button>
      </aside>

      {/* ============ Channel Sidebar ============ */}
      <aside className="w-60 flex flex-col flex-shrink-0 overflow-hidden bg-black/20 backdrop-blur-sm">
        {/* Sunucu başlığı */}
        <div className="h-12 flex items-center gap-3 px-4 border-b border-[#1f2023] flex-shrink-0">
          <img 
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="VoiceCan" 
            className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <h2 className="text-white font-semibold truncate text-[15px] flex-1 min-w-0">
            {serverName}
          </h2>
          {isOwner ? (
            <div className="relative" ref={serverMenuRef}>
              <button
                onClick={() => setServerMenuOpen((v) => !v)}
                className="text-gray-400 hover:text-white transition-colors"
                aria-label="Sunucu seçenekleri"
                aria-haspopup="menu"
                aria-expanded={serverMenuOpen}
                title="Sunucu seçenekleri"
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
                </svg>
              </button>

              {serverMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-1 w-52 py-1 rounded-md bg-[#111214] border border-[#1f2023] shadow-xl z-50"
                >
                  <button
                    role="menuitem"
                    onClick={() => handleCreateChannel('TEXT')}
                    className="w-full text-left px-3 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white transition-colors"
                  >
                    # Metin Kanalı Oluştur
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => handleCreateChannel('VOICE')}
                    className="w-full text-left px-3 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white transition-colors"
                  >
                    🔊 Ses Kanalı Oluştur
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Kanal listesi */}
        <div className="flex-1 min-h-0 overflow-y-auto px-2 py-3">
          {groupedChannels.length === 0 && (
            <div className="px-2 py-4 text-center text-sm text-[#949ba4]">
              Kanal bulunamadı
            </div>
          )}
          {groupedChannels.map((group) => {
            const isCollapsed = collapsedCategories.has(group.id);
            const textChannels = group.channels.filter(
              (c) =>
                c.type === 'TEXT' ||
                c.type === 'ANNOUNCEMENT' ||
                c.type === 'FORUM' ||
                c.type === 'MEDIA'
            );
            const voiceChannels = group.channels.filter(
              (c) => c.type === 'VOICE' || c.type === 'STAGE'
            );
            return (
              <div key={group.id} className="mb-3">
                <button
                  onClick={() => toggleCategory(group.id)}
                  className="flex items-center w-full px-1 py-1 text-xs font-semibold uppercase tracking-wide text-[#949ba4] hover:text-white transition-colors"
                  aria-expanded={!isCollapsed}
                >
                  <span
                    className="mr-1 inline-block text-[10px] leading-none"
                    aria-hidden
                  >
                    {isCollapsed ? '▸' : '▾'}
                  </span>
                  <span className="truncate">{group.name}</span>
                </button>
                {!isCollapsed && (
                  <div className="mt-0.5 space-y-0.5">
                    {textChannels.map((ch, idx) => (
                      <ChannelRow
                        key={ch.id}
                        channel={ch}
                        kind="text"
                        isActive={ch.id === activeChannelId}
                        onClick={() => handleChannelClick(ch)}
                        canManage={isOwner}
                        onDelete={() => onDeleteChannel && onDeleteChannel(ch)}
                        onMove={(dir) => onMoveChannel && onMoveChannel(ch, dir)}
                        isFirst={idx === 0}
                        isLast={idx === textChannels.length - 1}
                      />
                    ))}
                    {voiceChannels.map((ch, idx) => {
                      const count = participantCountByChannel[ch.id] || 0;
                      return (
                        <ChannelRow
                          key={ch.id}
                          channel={ch}
                          kind="voice"
                          isActive={ch.id === activeChannelId}
                          onClick={() => handleChannelClick(ch)}
                          participantCount={count}
                          canManage={isOwner}
                          onDelete={() => onDeleteChannel && onDeleteChannel(ch)}
                          onMove={(dir) => onMoveChannel && onMoveChannel(ch, dir)}
                          isFirst={idx === 0}
                          isLast={idx === voiceChannels.length - 1}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ============ Kullanıcı alanı ============ */}
        <div className="flex items-center gap-1 px-2 py-2 flex-shrink-0 bg-black/40 backdrop-blur-sm">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
            style={{ background: 'var(--theme-gradient, #5865f2)' }}
          >
            {userInitial}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white text-sm font-medium truncate min-w-0">
              {user?.superAdmin && <span className="mr-1" title="Super Admin">👑</span>}
              {displayName} <span className="text-[#949ba4] font-normal">#{userDiscriminator}</span>
            </div>
          </div>
          <button
            onClick={onToggleMute}
            className={`w-7 h-7 rounded flex items-center justify-center transition-colors flex-shrink-0 ${
              isMuted
                ? 'text-red-400 bg-red-500/15'
                : 'text-gray-300 hover:text-white hover:bg-[#35373c]'
            }`}
            aria-label={isMuted ? 'Mikrofonu aç' : 'Mikrofonu kapat'}
            title={isMuted ? 'Mikrofonu aç' : 'Mikrofonu kapat'}
          >
            {isMuted ? (
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.701.705L4.857 13.36A1 1 0 004 12.646V7.354a1 1 0 00-.857-.64L1.701 3.372A1 1 0 013.383 2.076L6 4.686V4a4 4 0 018 0v.686l2.617-2.61A1 1 0 0118.383 3.372L15 6.757V12.646a1 1 0 01-.857.994l-3.442 3.34A1 1 0 019 16V4a1 1 0 01.383-.924z"
                  clipRule="evenodd"
                />
                <path d="M10 18a3 3 0 003-3h-6a3 3 0 003 3z" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </button>
          <button
            onClick={onToggleDeafen}
            className={`w-7 h-7 rounded flex items-center justify-center transition-colors flex-shrink-0 ${
              isDeafened
                ? 'text-red-400 bg-red-500/15'
                : 'text-gray-300 hover:text-white hover:bg-[#35373c]'
            }`}
            aria-label={isDeafened ? 'Kulaklığı aç' : 'Kulaklığı kapat'}
            title={isDeafened ? 'Kulaklığı aç' : 'Kulaklığı kapat'}
          >
            {isDeafened ? (
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6z" />
                <path d="M6 16a2 2 0 002 2h4a2 2 0 002-2v-1H6v1z" />
                <path
                  fillRule="evenodd"
                  d="M3.707 2.293a1 1 0 011.414 0L18 15.172a1 1 0 01-1.414 1.414L3.707 3.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6z" />
                <path d="M6 16a2 2 0 002 2h4a2 2 0 002-2v-1H6v1z" />
              </svg>
            )}
          </button>
          <button
            onClick={() => setShowSettingsModal(true)}
            className="w-7 h-7 rounded flex items-center justify-center text-gray-300 hover:text-white hover:bg-[#35373c] transition-colors flex-shrink-0"
            aria-label="Ayarlar"
            title="Ayarlar"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </aside>

      {/* ============ Ana içerik ============ */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden bg-transparent">
        {children}
      </main>

      {/* ============ Sunucu Oluştur Modal ============ */}
      {showCreateServerModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70" onClick={() => setShowCreateServerModal(false)}>
          <div className="bg-black/60 backdrop-blur-md rounded-lg p-6 w-96 shadow-2xl border border-white/10" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white text-xl font-bold mb-4">Sunucu Oluştur</h3>
            <input
              type="text"
              value={newServerName}
              onChange={(e) => setNewServerName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newServerName.trim()) {
                  onCreateServer?.(newServerName.trim());
                  setShowCreateServerModal(false);
                }
              }}
              placeholder="Sunucu adı"
              maxLength={40}
              autoFocus
              className="w-full bg-black/40 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5865f2] mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCreateServerModal(false)}
                className="px-4 py-2 rounded text-sm text-white hover:bg-[#404249] transition-colors"
              >
                İptal
              </button>
              <button
                onClick={() => {
                  if (newServerName.trim()) {
                    onCreateServer?.(newServerName.trim());
                    setShowCreateServerModal(false);
                  }
                }}
                disabled={!newServerName.trim()}
                className="px-4 py-2 rounded text-sm bg-[#5865f2] text-white hover:bg-[#4752c4] disabled:opacity-50 transition-colors"
              >
                Oluştur
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ Kanal Oluştur Modal ============ */}
      {showCreateChannelModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70" onClick={() => setShowCreateChannelModal(false)}>
          <div className="bg-black/60 backdrop-blur-md rounded-lg p-6 w-96 shadow-2xl border border-white/10" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white text-xl font-bold mb-4">
              {newChannelType === 'VOICE' ? 'Ses' : 'Metin'} Kanalı Oluştur
            </h3>
            <input
              type="text"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newChannelName.trim()) {
                  onCreateChannel?.(newChannelType, newChannelName.trim());
                  setShowCreateChannelModal(false);
                }
              }}
              placeholder="Kanal adı"
              maxLength={40}
              autoFocus
              className="w-full bg-black/40 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5865f2] mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCreateChannelModal(false)}
                className="px-4 py-2 rounded text-sm text-white hover:bg-[#404249] transition-colors"
              >
                İptal
              </button>
              <button
                onClick={() => {
                  if (newChannelName.trim()) {
                    onCreateChannel?.(newChannelType, newChannelName.trim());
                    setShowCreateChannelModal(false);
                  }
                }}
                disabled={!newChannelName.trim()}
                className="px-4 py-2 rounded text-sm bg-[#5865f2] text-white hover:bg-[#4752c4] disabled:opacity-50 transition-colors"
              >
                Oluştur
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ Ayarlar Modal ============ */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70" onClick={() => setShowSettingsModal(false)}>
          <div
            className="bg-black/60 backdrop-blur-md rounded-lg p-6 w-[500px] max-h-[80vh] overflow-y-auto shadow-2xl border border-white/10"
            style={{ borderTop: '3px solid var(--theme-gradient, #5865f2)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3
                className="text-xl font-bold"
                style={{ backgroundImage: 'var(--theme-gradient, linear-gradient(135deg, #5865f2 0%, #4752c4 100%))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}
              >
                Ayarlar
              </h3>
              <button onClick={() => setShowSettingsModal(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6 border-b border-[#1f2023]">
              <button
                onClick={() => setActiveSettingsTab('profile')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeSettingsTab === 'profile'
                    ? 'text-white border-b-2 border-[#5865f2]'
                    : 'text-[#949ba4] hover:text-white'
                }`}
              >
                Profil Düzenleme
              </button>
              <button
                onClick={() => setActiveSettingsTab('theme')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeSettingsTab === 'theme'
                    ? 'text-white border-b-2 border-[#5865f2]'
                    : 'text-[#949ba4] hover:text-white'
                }`}
              >
                Tema
              </button>
              <button
                onClick={() => setActiveSettingsTab('audio')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeSettingsTab === 'audio'
                    ? 'text-white border-b-2 border-[#5865f2]'
                    : 'text-[#949ba4] hover:text-white'
                }`}
              >
                Ses
              </button>
            </div>

            {/* Profile Tab */}
            {activeSettingsTab === 'profile' && (
              <div className="space-y-4">
                {/* Current Profile Preview */}
                <div className="bg-black/40 backdrop-blur-sm rounded p-3 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-[#5865f2] flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
                    {userInitial}
                  </div>
                  <div className="min-w-0">
                    <div className="text-white font-medium truncate">{displayName}</div>
                    <div className="text-[#949ba4] text-sm">#{userDiscriminator}</div>
                  </div>
                </div>

                {/* Avatar Selection */}
                <div>
                  <label className="block text-xs font-semibold text-[#b5bac1] uppercase mb-2">
                    Avatar Seç
                  </label>
                  <div className="grid grid-cols-5 gap-2">
                    {AVATAR_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setEditAvatar(emoji)}
                        disabled={profileSaving}
                        className={`w-full aspect-square flex items-center justify-center text-2xl rounded-md transition-all ${
                          editAvatar === emoji
                            ? 'bg-[#5865f2] ring-2 ring-[#5865f2] scale-110'
                            : 'bg-[#2b2d31] hover:bg-[#35373c]'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Display Name Input */}
                <div>
                  <label className="block text-xs font-semibold text-[#b5bac1] uppercase mb-2">
                    Görünen Ad
                  </label>
                  <input
                    type="text"
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    placeholder="Görünen adınız"
                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-md text-white text-sm focus:outline-none focus:border-[#5865f2] transition-colors"
                    disabled={profileSaving}
                  />
                </div>

                {profileError && (
                  <div className="px-3 py-2 bg-red-900/50 border border-red-700 rounded-md text-red-300 text-sm">
                    {profileError}
                  </div>
                )}

                {/* Save Button */}
                <button
                  onClick={handleSaveProfile}
                  disabled={profileSaving}
                  className="w-full py-2.5 bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors"
                >
                  {profileSaving ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </div>
            )}

            {/* Theme Tab */}
            {activeSettingsTab === 'theme' && (
              <div className="space-y-6">
                <ThemeSection
                  currentTheme={localStorage.getItem('voicecan-theme') || 'default'}
                  onThemeChange={(themeId) => console.log('Tema değişti:', themeId)}
                />

                {/* Kurucu Kodu / Super Admin */}
                <ElevateSection
                  user={user}
                  onElevateSuccess={() => {
                    if (user && onUserUpdate) {
                      const updatedUser = { ...user, superAdmin: true };
                      onUserUpdate(updatedUser);
                    }
                  }}
                />
              </div>
            )}

            {/* Audio Tab */}
            {activeSettingsTab === 'audio' && (
              <div className="space-y-3">
                <div className="bg-black/40 backdrop-blur-sm rounded p-3">
                  <label className="text-[#949ba4] text-xs block mb-1">Giriş Cihazı</label>
                  <select
                    value={selectedMicDevice}
                    onChange={(e) => {
                      setSelectedMicDevice(e.target.value);
                      if (switchAudioDevice) switchAudioDevice('audioinput', e.target.value);
                    }}
                    className="w-full bg-black/40 text-white text-sm rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#5865f2]"
                  >
                    <option value="">Varsayılan Mikrofon</option>
                    {audioDevices.audioInputs.map(dev => (
                      <option key={dev.deviceId} value={dev.deviceId}>{dev.label}</option>
                    ))}
                  </select>
                </div>
                <div className="bg-black/40 backdrop-blur-sm rounded p-3">
                  <label className="text-[#949ba4] text-xs block mb-1">Çıkış Cihazı</label>
                  <select
                    value={selectedSpeakerDevice}
                    onChange={(e) => {
                      setSelectedSpeakerDevice(e.target.value);
                      if (switchAudioDevice) switchAudioDevice('audiooutput', e.target.value);
                    }}
                    className="w-full bg-black/40 text-white text-sm rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#5865f2]"
                  >
                    <option value="">Varsayılan Hoparlör</option>
                    {audioDevices.audioOutputs.map(dev => (
                      <option key={dev.deviceId} value={dev.deviceId}>{dev.label}</option>
                    ))}
                  </select>
                </div>
                <div className="bg-black/40 backdrop-blur-sm rounded p-3">
                  <label className="text-[#949ba4] text-xs block mb-2">Ses Seviyesi Testi</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-[#313338] rounded-full overflow-hidden">
                      <div className="h-full bg-[#5865f2] rounded-full transition-all" style={{ width: `${(localVolume || 0) * 100}%` }} />
                    </div>
                    <span className="text-white text-xs w-10 text-right">{Math.round((localVolume || 0) * 100)}%</span>
                  </div>
                  <p className="text-[#949ba4] text-[10px] mt-1">Konuşarak test et</p>
                </div>
              </div>
            )}

            {/* Güncelleme */}
            <div className="mb-4">
              <h4 className="text-white font-semibold mb-3 text-sm uppercase tracking-wide">Güncelleme</h4>
              <UpdateSection />
            </div>

            {/* Çıkış Yap */}
            <button
              onClick={onLogout}
              className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-md transition-colors"
            >
              Çıkış Yap
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Tek bir kanal satırı (metin veya ses).
 * Silme ve yukarı/aşağı taşıma butonları hover'da görünür ve yalnızca yönetici (owner) için render edilir.
 */
function ChannelRow({
  channel,
  kind,
  isActive,
  onClick,
  participantCount = 0,
  canManage = false,
  onDelete,
  onMove,
  isFirst = false,
  isLast = false,
}) {
  return (
    <div className="group relative flex items-center">
      <button
        onClick={onClick}
        className={`flex items-center w-full px-2 py-1.5 rounded text-sm transition-colors ${
          isActive
            ? 'text-white'
            : 'text-[#949ba4] hover:bg-[#35373c] hover:text-white'
        } ${canManage ? 'pr-20' : ''}`}
        style={isActive ? { background: 'rgba(255, 255, 255, 0.1)' } : undefined}
        aria-current={isActive ? 'page' : undefined}
      >
        <span
          className={`mr-1.5 flex-shrink-0 ${
            isActive ? 'text-white' : 'text-[#949ba4]'
          }`}
          aria-hidden
        >
          {kind === 'text' ? '#' : '🔊'}
        </span>
        <span className="truncate flex-1 text-left">{channel.name}</span>
        {kind === 'voice' && participantCount > 0 && (
          <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-[#35373c] text-[#949ba4] flex-shrink-0">
            {participantCount}
          </span>
        )}
      </button>

      {canManage && (
        <div className="absolute right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          {!isFirst && onMove && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMove('up');
              }}
              className="w-5 h-5 rounded flex items-center justify-center text-[#949ba4] hover:text-white hover:bg-[#1e1f22] transition-colors"
              aria-label={`${channel.name} kanalını yukarı taşı`}
              title="Yukarı taşı"
            >
              <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
              </svg>
            </button>
          )}
          {!isLast && onMove && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMove('down');
              }}
              className="w-5 h-5 rounded flex items-center justify-center text-[#949ba4] hover:text-white hover:bg-[#1e1f22] transition-colors"
              aria-label={`${channel.name} kanalını aşağı taşı`}
              title="Aşağı taşı"
            >
              <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="w-5 h-5 rounded flex items-center justify-center text-[#949ba4] hover:text-red-400 hover:bg-[#1e1f22] transition-colors"
              aria-label={`${channel.name} kanalını sil`}
              title="Kanalı sil"
            >
              <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 112 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
