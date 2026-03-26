import { useEffect, useState, useRef } from 'react';
import { setupWebSocket } from './SyncEngine';
import Sidebar from './components/Sidebar';
import PlayerControls from './components/PlayerControls';
import './App.css';

const LAPTOP_IP = window.location.hostname;
const VALID_USERS = ["vijay", "lavanya"];

function App() {
  const [appState, setAppState] = useState('home'); // home | modal | waiting | player
  const [username, setUsername] = useState('');
  const [secretInput, setSecretInput] = useState('');
  const [secretError, setSecretError] = useState('');
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [allSongs, setAllSongs] = useState([]);
  const [currentSong, setCurrentSong] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [status, setStatus] = useState('Connecting...');

  const stompClient = useRef(null);
  const audioRef = useRef(null);
  const lastSentTime = useRef(0);
  const allSongsRef = useRef([]);
  const currentSongRef = useRef(null);
  const usernameRef = useRef('');
  const messageHandlerRef = useRef(null); // always points to latest handler
  const pendingSyncRef = useRef(null);    // stores STATE data until player mounts

  useEffect(() => { allSongsRef.current = allSongs; }, [allSongs]);
  useEffect(() => { currentSongRef.current = currentSong; }, [currentSong]);
  useEffect(() => { usernameRef.current = username; }, [username]);

  // Apply pending sync once the player mounts (audioRef becomes available)
  useEffect(() => {
    if (appState !== 'player' || !pendingSyncRef.current) return;
    const { songId, timestamp, playing } = pendingSyncRef.current;
    pendingSyncRef.current = null;
    const songs = allSongsRef.current;
    if (!songs.length) return;
    const song = songs.find(s => String(s.id) === String(songId)) || songs[0];
    setCurrentSong(song);
    requestAnimationFrame(() => {
      if (!audioRef.current) return;
      audioRef.current.src = song.url;
      audioRef.current.load();
      audioRef.current.oncanplay = () => {
        audioRef.current.currentTime = timestamp;
        if (playing) audioRef.current.play().catch(() => { });
        audioRef.current.oncanplay = null;
      };
    });
  }, [appState]);

  // --- SEND SYNC ACTION ---
  const sendSyncAction = (action, songId = null, timestamp = null) => {
    const now = Date.now();
    if (now - lastSentTime.current < 400 && action !== 'PAUSE') return;
    if (stompClient.current?.connected) {
      lastSentTime.current = now;
      stompClient.current.publish({
        destination: '/app/sync',
        body: JSON.stringify({
          action,
          timestamp: timestamp !== null ? timestamp : (audioRef.current?.currentTime || 0),
          songId: songId || currentSongRef.current?.id || 0,
          username: usernameRef.current,
          playing: !audioRef.current?.paused
        }),
      });
    }
  };

  // --- AUDIO SYNC HELPER ---
  const syncAudio = (song, timestamp, shouldPlay) => {
    if (!audioRef.current || !song) return;
    const isSame = currentSongRef.current && String(currentSongRef.current.id) === String(song.id);
    if (!isSame) {
      setCurrentSong(song);
      audioRef.current.src = song.url;
      audioRef.current.load();
      audioRef.current.oncanplay = () => {
        audioRef.current.currentTime = timestamp;
        if (shouldPlay) audioRef.current.play().catch(() => { });
        audioRef.current.oncanplay = null;
      };
    } else {
      if (Math.abs(audioRef.current.currentTime - timestamp) > 0.5) {
        audioRef.current.currentTime = timestamp;
      }
      shouldPlay ? audioRef.current.play().catch(() => { }) : audioRef.current.pause();
    }
  };

  // --- HANDLE INCOMING WS MESSAGES ---
  const handleIncomingMessage = (data) => {
    const songs = allSongsRef.current;

    if (data.action === 'PRESENCE') {
      const users = data.connectedUsers || [];
      setConnectedUsers(users);
      
      // Only transition to player if everybody is here
      // NEVER transition back to waiting room automatically if we were already in the player
      // This prevents the music from stopping when one person refreshes
      setAppState(prev => {
        if (users.length === 2 && prev !== 'player') return 'player';
        return prev;
      });
      return;
    }

    if (data.action === 'STATE') {
      const users = data.connectedUsers || [];
      setConnectedUsers(users);
      
      // If we are already in player, sync directly
      if (appState === 'player' && audioRef.current) {
        const song = songs.find(s => String(s.id) === String(data.songId));
        if (song) syncAudio(song, data.timestamp, data.playing);
      } else {
        // Store for when we transition to player
        pendingSyncRef.current = { songId: data.songId, timestamp: data.timestamp, playing: data.playing };
        if (users.length === 2) setAppState('player');
      }
      return;
    }

    // PLAY / PAUSE / etc
    if (!audioRef.current) return;
    const song = songs.find(s => String(s.id) === String(data.songId));
    if (song) syncAudio(song, data.timestamp, data.action === 'PLAY');
  };
  messageHandlerRef.current = handleIncomingMessage; // keep ref always up to date

  // --- CONNECT TO BACKEND ---
  const doConnect = (user) => {
    fetch(`/api/songs`)
      .then(res => res.json())
      .then(data => {
        const unique = Array.from(new Map(data.map(s => [s.id, s])).values());
        setAllSongs(unique);
        allSongsRef.current = unique;

        const client = setupWebSocket(
          () => {
            setStatus(`Connected`);
            client.publish({
              destination: '/app/sync',
              body: JSON.stringify({ action: 'JOIN', username: user, songId: 0, timestamp: 0, playing: false }),
            });
          },
          (msg) => messageHandlerRef.current(msg) // stable wrapper — always calls latest handler
        );
        stompClient.current = client;
      })
      .catch(() => setStatus('Offline — cannot reach server'));
  };

  useEffect(() => {
    const savedUser = sessionStorage.getItem('musicSyncUser');
    if (savedUser) {
      setUsername(savedUser);
      usernameRef.current = savedUser;
      setAppState('waiting');
      doConnect(savedUser);
    }
    return () => stompClient.current?.deactivate();
  }, []);

  // --- SYNC PUSH ---
  // When a partner joins while we are already playing, we push our state 
  // to ensure WE are the source of truth for the newcomer.
  useEffect(() => {
    if (appState === 'player' && connectedUsers.length === 2 && audioRef.current && !audioRef.current.paused) {
      // Small delay to ensure newcomer is connected
      setTimeout(() => {
        if (audioRef.current) {
          sendSyncAction('PLAY', currentSongRef.current?.id, audioRef.current.currentTime);
        }
      }, 1000);
    }
  }, [connectedUsers.length]);

  // --- JOIN HANDLER ---
  const handleJoin = () => {
    const key = secretInput.trim().toLowerCase();
    if (!VALID_USERS.includes(key)) {
      setSecretError('Invalid key. Only Vijay or Lavanya can join.');
      return;
    }
    const displayName = key.charAt(0).toUpperCase() + key.slice(1);
    setUsername(displayName);
    usernameRef.current = displayName;
    sessionStorage.setItem('musicSyncUser', displayName);
    setAppState('waiting');
    doConnect(displayName);
  };

  // --- NAVIGATION ---
  const playNext = () => {
    const songs = allSongsRef.current;
    const idx = songs.findIndex(s => s.id === currentSongRef.current?.id);
    const next = songs[(idx + 1) % songs.length];
    sendSyncAction('PLAY', next.id, 0);
  };

  const playPrev = () => {
    const songs = allSongsRef.current;
    const idx = songs.findIndex(s => s.id === currentSongRef.current?.id);
    const prev = songs[(idx - 1 + songs.length) % songs.length];
    sendSyncAction('PLAY', prev.id, 0);
  };

  const handleLogout = () => {
    stompClient.current?.deactivate();
    sessionStorage.removeItem('musicSyncUser');
    setAppState('home');
    setUsername('');
    setConnectedUsers([]);
  };

  const filteredSongs = allSongs.filter(s => {
    const t = (s.title || '').toLowerCase();
    const a = (s.artist || '').toLowerCase();
    const q = searchTerm.toLowerCase();
    return t.includes(q) || a.includes(q);
  });

  const lowerConnected = connectedUsers.map(u => u.toLowerCase());

  // ===== HOME =====
  if (appState === 'home') {
    return (
      <div className="home-screen">
        <div className="blobs-container">
          <div className="blob blob-1"></div>
          <div className="blob blob-2"></div>
        </div>
        <div className="glass-panel main-home">
          <div className="logo-pulse">🎵</div>
          <h1 className="home-title">Music Sync</h1>
          <p className="home-subtitle">Experience music together, beautifully synced in real-time.</p>
          <button className="premium-btn cta-btn" onClick={() => setAppState('modal')}>
            Let's Hear Together
          </button>
        </div>
      </div>
    );
  }

  // ===== MODAL =====
  if (appState === 'modal') {
    return (
      <div className="home-screen">
        <div className="blobs-container">
          <div className="blob blob-1"></div>
          <div className="blob blob-2"></div>
        </div>
        <div className="glass-panel modal-card">
          <div className="modal-icon">🔐</div>
          <h2>Authentication Required</h2>
          <p className="modal-hint">Enter your secret name key to enter</p>
          <div className="input-group">
            <input
              type="text"
              className="glass-input"
              placeholder="Enter Secret Key"
              value={secretInput}
              onChange={e => { setSecretInput(e.target.value); setSecretError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              autoFocus
            />
          </div>
          {secretError && <p className="modal-error">{secretError}</p>}
          <div className="modal-actions">
            <button className="btn-ghost" onClick={() => { setAppState('home'); setSecretInput(''); setSecretError(''); }}>
              Return
            </button>
            <button className="premium-btn join-btn" onClick={handleJoin}>
              Enter Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== WAITING =====
  if (appState === 'waiting') {
    const me = username.toLowerCase();
    const vijayOnline = me === 'vijay' || lowerConnected.includes('vijay');
    const lavanyaOnline = me === 'lavanya' || lowerConnected.includes('lavanya');
    return (
      <div className="home-screen">
        <div className="blobs-container">
          <div className="blob blob-1 animation-slow"></div>
          <div className="blob blob-2 animation-slow"></div>
        </div>
        <div className="glass-panel waiting-panel">
          <div className="logo-pulse small">🎧</div>
          <h2 className="waiting-title">Room Lobby</h2>
          <p className="waiting-subtitle">
            {connectedUsers.length === 2 ? "Both in! Launching..." : "Waiting for other member to join..."}
          </p>

          <div className="user-avatars-row">
            <div className={`avatar-container ${vijayOnline ? 'online' : 'offline'}`}>
              <div className="avatar">V</div>
              <span className="avatar-name">Vijay</span>
              {vijayOnline && <div className="status-badge green"></div>}
            </div>

            <div className="connector-line">
              <div className="sliding-dot"></div>
            </div>

            <div className={`avatar-container ${lavanyaOnline ? 'online' : 'offline'}`}>
              <div className="avatar">L</div>
              <span className="avatar-name">Lavanya</span>
              {lavanyaOnline && <div className="status-badge green"></div>}
            </div>
          </div>

          <p className="conn-status-text">{status}</p>
          
          <div className="waiting-actions">
            <button className="btn-ghost" onClick={handleLogout}>
              Cancel Collaboration
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== PLAYER =====
  return (
    <div className="music-app">
      <Sidebar
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        filteredSongs={filteredSongs}
        currentSong={currentSong}
        sendSyncAction={sendSyncAction}
        handleLogout={handleLogout}
      />
      <div className="main-content">
        {currentSong ? (
          <PlayerControls
            audioRef={audioRef}
            currentSong={currentSong}
            playNext={playNext}
            playPrev={playPrev}
            sendSyncAction={sendSyncAction}
            status={status}
            username={username}
            connectedUsers={connectedUsers}
          />
        ) : (
          <div className="loading">Loading songs...</div>
        )}
      </div>
    </div>
  );
}

export default App;
