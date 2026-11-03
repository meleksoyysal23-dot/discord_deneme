import { useState, useEffect, useMemo, useRef } from 'react';
import { useSocket } from './hooks/useSocket';
import { useRoom } from './hooks/useRoom';
import { useLiveKit } from './hooks/useLiveKit';
import { getOrCreateUserId } from './utils/userId';
import { loadProfile } from './utils/profile';
import { getAvatarEmoji } from './utils/username';
import {
  loadWorkspace,
  createChannel,
  deleteChannel,
  moveChannel,
  createServer,
  setActiveServer,
  getChannels,
  getOwnerId,
} from './utils/workspace';
import { loadMessages, appendMessage } from './utils/localChat';
import { ProfileSetup } from './components/ProfileSetup';
import { DiscordLayout } from './components/DiscordLayout';
import { VoiceRoomView } from './components/VoiceRoomView';
import { TextChannelView } from './components/TextChannelView';
import { WelcomeView } from './components/WelcomeView';
import { LoginScreen } from './components/auth/LoginScreen';
import { fetchMe } from './services/api';
import ScreenShareModal from './components/ScreenShareModal';
import { InviteModal } from './components/InviteModal';

/**
 * JWT token'ın süresinin dolup dolmadığını client-side kontrol et.
 * Token'ın payload kısmını (base64) decode edip exp claim'ini karşılaştırır.
 * @param {string} token - JWT token
 * @returns {boolean} - true ise token süresi dolmuş veya geçersiz
 */
function isTokenExpired(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true; // Geçersiz JWT formatı

    const payload = JSON.parse(atob(parts[1]));
    const now = Math.floor(Date.now() / 1000);

    // exp claim'i yoksa veya geçmişse → expired
    return !payload.exp || payload.exp < now;
  } catch {
    // Decode hatası → token geçersiz
    return true;
  }
}

function App() {
  const [localUserId] = useState(() => getOrCreateUserId());
  const [profile, setProfile] = useState(() => loadProfile());

  // Auth state
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // ============ DEV BYPASS ============
  const isDevBypass = import.meta.env.VITE_SKIP_AUTH === 'true';

  // Bypass modunda sahte user + profile inject et
  useEffect(() => {
    if (isDevBypass) {
      // URL'den klon parametresini kontrol et
      const urlParams = new URLSearchParams(window.location.search);
      const isKlon = urlParams.get('klon') === '1';
      
      if (isKlon) {
        console.warn('[DEV BYPASS] Klon modu aktif, misafir kullanıcı yükleniyor...');
        setUser({
          id: 'test-guest',
          username: 'misafir',
          displayName: 'Test Misafiri',
          discriminator: '0002',
          superAdmin: false,
          avatar: '👤',
          status: 'ONLINE',
        });
        setAuthLoading(false);
        
        // Profile da yoksa sahte profile oluştur
        if (!profile) {
          // Doğru localStorage key'lerini kullanarak profile oluştur
          const guestProfile = {
            username: 'misafir',
            discriminator: '0002',
            avatar: 1, // 🦊 (emoji değil, ID)
            gender: 'male',
          };
          
          // Doğru key'lere kaydet (loadProfile() bunları okuyor)
          localStorage.setItem('vibe-voice-username', 'misafir');
          localStorage.setItem('vibe-voice-gender', 'male');
          localStorage.setItem('vibe-voice-avatar', '1');
          localStorage.setItem('vibe-voice-discriminator', '0002');
          
          setProfile(guestProfile);
        }
      } else {
        console.warn('[DEV BYPASS] Auth atlanıyor, sahte CEO kullanıcı yükleniyor...');
        setUser({
          id: 'dev-ceo',
          username: 'CEO',
          displayName: 'CEO',
          discriminator: '0001',
          superAdmin: true,
          avatar: '🎮',
          status: 'ONLINE',
        });
        setAuthLoading(false);
        
        // Profile da yoksa sahte profile oluştur
        if (!profile) {
          const devProfile = {
            username: 'CEO',
            discriminator: '0001',
            avatar: 17, // 🎮 (emoji değil, ID)
            gender: 'male',
          };
          
          // Doğru key'lere kaydet (loadProfile() bunları okuyor)
          localStorage.setItem('vibe-voice-username', 'CEO');
          localStorage.setItem('vibe-voice-gender', 'male');
          localStorage.setItem('vibe-voice-avatar', '17');
          localStorage.setItem('vibe-voice-discriminator', '0001');
          
          setProfile(devProfile);
        }
      }
    }
  }, [isDevBypass, profile]);

  const { socket, isConnected, connectionError } = useSocket();
  const {
    currentRoom,
    users,
    error: roomError,
    joinRoom,
    leaveRoom,
    getShareableLink,
  } = useRoom(socket, localUserId);

  // ============ DEV BYPASS: Ayrı currentRoom state ============
  // Bypass modunda socket null olduğu için useRoom hook'u currentRoom'u güncelleyemiyor.
  // Bu yüzden bypass modda ayrı bir state kullanıyoruz.
  const [bypassCurrentRoom, setBypassCurrentRoom] = useState(null);

  // Derived state: bypass modda bypassCurrentRoom, normal modda currentRoom
  const effectiveCurrentRoom = isDevBypass ? bypassCurrentRoom : currentRoom;

  const {
    isConnected: lkConnected,
    isMuted,
    isDeafened,
    participants: lkParticipants,
    activeSpeakers,
    localVolume,
    error: lkError,
    userVolumes,
    masterVolume,
    isScreenSharing,
    isCameraEnabled,
    screenShareStream,
    cameraStreams,
    connect: lkConnect,
    disconnect: lkDisconnect,
    toggleMute,
    toggleDeafen,
    setPeerVolume,
    setAllVolumes,
    enumerateDevices,
    switchAudioDevice,
    startScreenShare,
    stopScreenShare,
    toggleCamera,
    stopCamera,
  } = useLiveKit(localUserId, effectiveCurrentRoom, profile?.username);

  // ============ DEV BYPASS: users prop seçimi ============
  // Bypass modda useRoom hook'u boş users array döndürür (socket yok).
  // VoiceRoomView grid'i users prop'undan render eder, bu yüzden bypass modda
  // useLiveKit'tan gelen lkParticipants'ı users olarak kullanıyoruz.
  // Normal modda orijinal socket tabanlı users array'i kullanılır.

  // Auth kontrolü — uygulama açıldığında token varsa /me çağır
  // DEV BYPASS modunda bu kontrol tamamen atlanır (backend'e hiç gidilmez)
  useEffect(() => {
    if (isDevBypass) {
      console.warn('[DEV BYPASS] Orijinal auth kontrolü atlandı.');
      return;
    }

    const checkAuth = async () => {
      const token = localStorage.getItem('voicecan-token');
      if (!token) {
        setAuthLoading(false);
        return;
      }

      // Client-side expiration kontrolü (gereksiz backend çağrılarını önler)
      if (isTokenExpired(token)) {
        console.warn('Token süresi dolmuş, temizleniyor...');
        localStorage.removeItem('voicecan-token');
        setAuthLoading(false);
        return;
      }

      try {
        const data = await fetchMe();
        setUser(data.user);
      } catch (err) {
        console.error('Auth check failed:', err);
        setAuthError(err.message);
        // Token geçersizse temizle
        localStorage.removeItem('voicecan-token');
      } finally {
        setAuthLoading(false);
      }
    };

    checkAuth();
  }, [isDevBypass]);

  // Invite modal state (must be defined before useEffects that use it)
  const [pendingInvite, setPendingInvite] = useState(null);
  const [showInviteModal, setShowInviteModal] = useState(false);

  // ============ Tema init (soğuk başlangıçta CSS değişkenini uygula) ============
  // ThemeSection mount olmadan önce bile --theme-gradient değişkeni mevcut olsun;
  // böylece uygulama yenilendiğinde kullanıcı teması kaybolmaz.
  useEffect(() => {
    const THEMES = {
      'default': 'linear-gradient(135deg, #5865f2 0%, #4752c4 100%)',
      'nitro-pink': 'linear-gradient(135deg, #ff6b9d 0%, #c44dff 100%)',
      'ocean': 'linear-gradient(135deg, #00d2ff 0%, #3a7bd5 100%)',
      'sunset': 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      'forest': 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
      'midnight': 'linear-gradient(135deg, #232526 0%, #414345 100%)',
    };

    const savedTheme = localStorage.getItem('voicecan-theme') || 'default';
    const gradient = THEMES[savedTheme] || THEMES['default'];
    document.documentElement.style.setProperty('--theme-gradient', gradient);
  }, []);

  // ============ URL'den davet kodu oku (?invite=CODE) ============
  useEffect(() => {
    if (!user) return; // Kullanıcı giriş yapmış olmalı
    
    const params = new URLSearchParams(window.location.search);
    const inviteCode = params.get('invite');
    
    if (inviteCode) {
      console.log('[Invite] Davet kodu algılandı:', inviteCode);
      setPendingInvite(inviteCode);
      setShowInviteModal(true);
      
      // URL'den parametreyi temizle
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [user]);

  // ============ Electron deep link listener (voicecan://invite/CODE) ============
  useEffect(() => {
    if (!user || !window.electronAPI?.onDeepLink) return;
    
    const unsubscribe = window.electronAPI.onDeepLink((url) => {
      console.log('[Invite] Deep link algılandı:', url);
      
      // voicecan://invite/CODE → CODE çıkar
      const match = url.match(/voicecan:\/\/invite\/([A-Za-z0-9]+)/);
      if (match && match[1]) {
        const inviteCode = match[1];
        console.log('[Invite] Davet kodu:', inviteCode);
        setPendingInvite(inviteCode);
        setShowInviteModal(true);
      }
    });
    
    return unsubscribe;
  }, [user]);

  // Login başarılı olduğunda çağrılır
  const handleLoginSuccess = (userData) => {
    setUser(userData);
    setAuthError(null);
  };

  // Logout
  const handleLogout = () => {
    localStorage.removeItem('voicecan-token');
    setUser(null);
    // Sayfayı yenile (basit çözüm)
    window.location.reload();
  };

  // ============ Workspace state ============
  const [ownerId] = useState(() => getOwnerId());
  const [workspace, setWorkspace] = useState(() =>
    loadWorkspace(profile, localUserId, ownerId)
  );
  const [activeServerId, setActiveServerId] = useState(
    () => workspace.activeServerId || workspace.servers[0]?.id
  );
  const [activeChannelId, setActiveChannelId] = useState(null);

  // Local text channel messages
  const [localMessages, setLocalMessages] = useState([]);
  const localMessagesEndRef = useRef(null);

  // Screen share modal state
  const [isScreenShareModalOpen, setIsScreenShareModalOpen] = useState(false);

  // ============ Derived state ============
  const activeServer = workspace.servers.find((s) => s.id === activeServerId);
  const isOwner = activeServer?.ownerId === ownerId;
  const channels = useMemo(
    () => getChannels(activeServerId),
    // workspace referansı her mutasyonda değişiyor; kanal listesini tazelemek için
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspace, activeServerId]
  );
  const activeChannel = channels.find((c) => c.id === activeChannelId);

  // Auto-select first channel when server changes or channels load
  useEffect(() => {
    if (channels.length > 0 && !activeChannelId) {
      setActiveChannelId(channels[0].id);
    }
  }, [activeServerId, channels, activeChannelId]);

  // Reload local messages when text channel changes
  useEffect(() => {
    if (activeChannel?.type === 'TEXT') {
      setLocalMessages(loadMessages(activeChannel.id));
    } else {
      setLocalMessages([]);
    }
  }, [activeChannel?.id, activeChannel?.type]);

  // Auto-scroll local messages
  useEffect(() => {
    if (localMessagesEndRef.current && !effectiveCurrentRoom) {
      localMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [localMessages, effectiveCurrentRoom]);

  // LiveKit'e bağlan when joining voice
  useEffect(() => {
    if (isDevBypass) {
      // BYPASS MODU: Socket koşulu olmadan doğrudan bağlan
      if (bypassCurrentRoom) {
        console.warn('[DEV BYPASS] LiveKit bağlantısı başlatılıyor (socket bypass)');
        lkConnect().catch((err) => {
          console.error('[DEV BYPASS] LiveKit bağlantı hatası:', err);
        });
      } else {
        lkDisconnect();
      }
    } else {
      // NORMAL MOD: Orijinal mantık
      if (currentRoom && socket && isConnected) {
        lkConnect().catch((err) => {
          console.error('LiveKit bağlantı hatası:', err);
        });
      } else if (!currentRoom) {
        lkDisconnect();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDevBypass, bypassCurrentRoom, currentRoom, socket, isConnected]);

  // Sync activeChannelId with effectiveCurrentRoom
  useEffect(() => {
    if (effectiveCurrentRoom && channels.some((c) => c.id === effectiveCurrentRoom)) {
      setActiveChannelId(effectiveCurrentRoom);
    }
  }, [effectiveCurrentRoom, channels]);

  // ============ Handlers ============
  const handleSelectServer = (serverId) => {
    setActiveServerId(serverId);
    setActiveServer(serverId);
    setActiveChannelId(null);
  };

  const handleSelectChannel = (channel) => {
    setActiveChannelId(channel.id);
    if (channel.type === 'VOICE' || channel.type === 'STAGE') {
      if (effectiveCurrentRoom !== channel.id) {
        if (isDevBypass) {
          // BYPASS MODU: Socket olmadan doğrudan currentRoom state'ini güncelle
          console.warn('[DEV BYPASS] Ses kanalına doğrudan katılma (socket bypass)');
          setBypassCurrentRoom(channel.id);
        } else {
          joinRoom(channel.id);
        }
      }
    } else {
      // TEXT kanala geçildiğinde ses odasından ayrıl
      if (effectiveCurrentRoom) {
        if (isDevBypass) {
          console.warn('[DEV BYPASS] Ses kanalından ayrılma (TEXT kanala geçiş)');
          setBypassCurrentRoom(null);
        } else {
          leaveRoom();
        }
      }
    }
  };

  const handleCreateChannel = (type, name) => {
    if (!isOwner) return;
    if (!name || !name.trim()) return;
    const updated = createChannel(activeServerId, {
      name: name.trim(),
      type,
    });
    setWorkspace({ ...updated });
    const newChannels = getChannels(activeServerId);
    if (newChannels.length > 0) {
      setActiveChannelId(newChannels[newChannels.length - 1].id);
    }
  };

  const handleDeleteChannel = (channel) => {
    if (!isOwner) return;
    if (
      !window.confirm(
        `"${channel.name}" kanalını silmek istediğinize emin misiniz?`
      )
    )
      return;
    const updated = deleteChannel(activeServerId, channel.id);
    setWorkspace({ ...updated });
    if (activeChannelId === channel.id) {
      setActiveChannelId(null);
      if (channel.type === 'VOICE' || channel.type === 'STAGE') {
        if (effectiveCurrentRoom === channel.id) {
          if (isDevBypass) {
            setBypassCurrentRoom(null);
          } else {
            leaveRoom();
          }
        }
      }
    }
  };

  const handleCreateServer = (name) => {
    const updated = createServer(name, ownerId);
    setWorkspace({ ...updated });
    setActiveServerId(updated.activeServerId);
    setActiveChannelId(null);
  };

  const handleMoveChannel = (channel, direction) => {
    if (!isOwner) return;
    const updated = moveChannel(activeServerId, channel.id, direction);
    setWorkspace({ ...updated });
  };

  // Screen share handlers
  const handleOpenScreenShareModal = () => {
    setIsScreenShareModalOpen(true);
  };

  const handleCloseScreenShareModal = () => {
    setIsScreenShareModalOpen(false);
  };

  const handleScreenShareSelect = async ({ sourceId, withSystemAudio }) => {
    try {
      await startScreenShare(sourceId, withSystemAudio);
      setIsScreenShareModalOpen(false);
    } catch (error) {
      console.error('Screen share failed:', error);
      // TODO: Show error toast to user
    }
  };

  const handleStopScreenShare = async () => {
    try {
      await stopScreenShare();
    } catch (error) {
      console.error('Stop screen share failed:', error);
    }
  };

  const handleToggleCamera = async () => {
    try {
      await toggleCamera();
    } catch (error) {
      console.error('Toggle camera failed:', error);
    }
  };

  // ============ Auth gate ============
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#313338] flex items-center justify-center">
        <div className="text-white text-lg">Yükleniyor...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  // ============ Profile gate ============
  if (!profile) {
    return <ProfileSetup onComplete={setProfile} />;
  }

  const avatarEmoji = getAvatarEmoji(profile.avatar);
  const shareLink = getShareableLink() || '';

  // Determine main content
  let mainContent;
  if (effectiveCurrentRoom) {
    mainContent = (
      <VoiceRoomView
        users={isDevBypass ? lkParticipants : users}
        localUserId={localUserId}
        username={profile.username}
        participants={lkParticipants}
        activeSpeakers={activeSpeakers}
        localVolume={localVolume}
        isMuted={isMuted}
        isDeafened={isDeafened}
        isConnected={isDevBypass ? lkConnected : (isConnected && lkConnected)}
        connectionError={connectionError || lkError}
        onToggleMute={toggleMute}
        onToggleDeafen={toggleDeafen}
        onLeave={() => {
          // Ekran paylaşımı varsa durdur
          if (isScreenSharing) {
            stopScreenShare();
          }
          // Kamera açıksa kapat
          if (isCameraEnabled) {
            stopCamera();
          }
          lkDisconnect();
          
          if (isDevBypass) {
            setBypassCurrentRoom(null);
          } else {
            leaveRoom();
          }
        }}
        shareLink={shareLink}
        masterVolume={masterVolume}
        onMasterVolumeChange={setAllVolumes}
        onPeerVolumeChange={setPeerVolume}
        userVolumes={userVolumes}
        isScreenSharing={isScreenSharing}
        isCameraEnabled={isCameraEnabled}
        onOpenScreenShare={handleOpenScreenShareModal}
        onStopScreenShare={handleStopScreenShare}
        onToggleCamera={handleToggleCamera}
        screenShareStream={screenShareStream}
        cameraStreams={cameraStreams}
      />
    );
  } else if (activeChannel?.type === 'TEXT') {
    mainContent = (
      <TextChannelView
        key={activeChannel.id}
        channel={activeChannel}
        localUserId={localUserId}
        username={profile.username}
        messages={localMessages}
        onSendMessage={(text) => {
          const msg = {
            id: `m-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            from: localUserId,
            username: profile?.username || 'Anonim',
            message: text.trim().substring(0, 500),
            timestamp: Date.now(),
          };
          const updated = appendMessage(activeChannel.id, msg);
          setLocalMessages(updated);
        }}
      />
    );
  } else {
    const isVoiceSelected =
      activeChannel?.type === 'VOICE' || activeChannel?.type === 'STAGE';
    const notice =
      isVoiceSelected && roomError
        ? 'Ses kanalına katılınamadı. Sunucu bağlantısı kurulamadı.'
        : null;
    mainContent = (
      <WelcomeView channel={activeChannel} notice={notice} />
    );
  }

  return (
    <>
      <DiscordLayout
        username={profile.username}
        avatarEmoji={avatarEmoji}
        discriminator={profile.discriminator}
        roomId={effectiveCurrentRoom}
        localVolume={localVolume}
        onOpenSettings={() => {}}
        servers={workspace.servers}
        activeServerId={activeServerId}
        onSelectServer={handleSelectServer}
        channels={channels}
        activeChannelId={activeChannelId}
        onSelectChannel={handleSelectChannel}
        isOwner={isOwner}
        onCreateChannel={handleCreateChannel}
        onDeleteChannel={handleDeleteChannel}
        onMoveChannel={handleMoveChannel}
        onCreateServer={handleCreateServer}
        isMuted={isMuted}
        onToggleMute={toggleMute}
        isDeafened={isDeafened}
        onToggleDeafen={toggleDeafen}
        participants={users}
        user={user}
        onLogout={handleLogout}
        onUserUpdate={setUser}
        enumerateDevices={enumerateDevices}
        switchAudioDevice={switchAudioDevice}
      >
        {mainContent}
      </DiscordLayout>

      {/* Screen Share Modal */}
      <ScreenShareModal
        isOpen={isScreenShareModalOpen}
        onClose={handleCloseScreenShareModal}
        onSelect={handleScreenShareSelect}
      />

      {/* Invite Modal */}
      <InviteModal
        isOpen={showInviteModal}
        inviteCode={pendingInvite}
        onClose={() => {
          setShowInviteModal(false);
          setPendingInvite(null);
        }}
        onJoinSuccess={(server) => {
          console.log('[Invite] Sunucuya katıldı:', server);
          // Workspace'i yenile (sunucu listesini güncelle)
          // Şimdilik basit: sayfa yenileme
          window.location.reload();
        }}
      />
    </>
  );
}

export default App;
