import { useState, useEffect, lazy, Suspense } from 'react';
import { useSocket } from './hooks/useSocket';
import { useRoom } from './hooks/useRoom';
import { useWebRTC } from './hooks/useWebRTC';
import { getOrCreateUserId } from './utils/userId';
import { getUsername } from './utils/username';

// Lazy load components for code splitting
const Lobby = lazy(() => import('./components/Lobby').then(module => ({ default: module.Lobby })));
const Room = lazy(() => import('./components/Room').then(module => ({ default: module.Room })));

function App() {
  const [localUserId] = useState(() => getOrCreateUserId());
  const [username, setUsername] = useState(() => getUsername());
  const { socket, isConnected, connectionError } = useSocket();
  const {
    currentRoom,
    users,
    error: roomError,
    createRoom,
    joinRoom,
    leaveRoom,
    getShareableLink,
  } = useRoom(socket, localUserId);

  const {
    peers,
    localVolume,
    isMuted,
    isDeafened,
    userVolumes,
    masterVolume,
    initializeMedia,
    toggleMute,
    toggleDeafen,
    setPeerVolume,
    setAllVolumes,
  } = useWebRTC(localUserId, currentRoom, socket);

  // Oda seçildiğinde mikrofon izni iste
  useEffect(() => {
    if (currentRoom && socket && isConnected) {
      initializeMedia().catch((err) => {
        console.error('Mikrofon erişimi başarısız:', err);
      });
    }
  }, [currentRoom, socket, isConnected, initializeMedia]);

  // Lobby ekranı (oda yok)
  if (!currentRoom) {
    return (
      <Suspense fallback={<div className="flex items-center justify-center min-h-screen bg-slate-900 text-white">Loading...</div>}>
        <Lobby
          isConnected={isConnected}
          connectionError={connectionError}
          onCreateRoom={createRoom}
          onJoinRoom={joinRoom}
          error={roomError}
          username={username}
          onUsernameChange={setUsername}
        />
      </Suspense>
    );
  }

  // Room ekranı (oda var)
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen bg-slate-900 text-white">Loading...</div>}>
      <Room
        roomId={currentRoom}
        users={users}
        localUserId={localUserId}
        username={username}
        peers={peers}
        localVolume={localVolume}
        isMuted={isMuted}
        isDeafened={isDeafened}
        isConnected={isConnected}
        connectionError={connectionError}
        onToggleMute={toggleMute}
        onToggleDeafen={toggleDeafen}
        onLeave={leaveRoom}
        onShareLink={() => {}}
        shareLink={getShareableLink() || ''}
        socket={socket}
        masterVolume={masterVolume}
        onMasterVolumeChange={setAllVolumes}
        onPeerVolumeChange={setPeerVolume}
        userVolumes={userVolumes}
      />
    </Suspense>
  );
}

export default App;
