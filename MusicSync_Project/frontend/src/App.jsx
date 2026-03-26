import React, { useEffect, useState, useRef, useCallback } from 'react';
import { setupWebSocket } from './SyncEngine';
import Sidebar from './components/Sidebar';
import PlayerControls from './components/PlayerControls';
import './App.css';

function App() {
  const [allSongs, setAllSongs] = useState([]);
  const [currentSong, setCurrentSong] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [status, setStatus] = useState("Connecting...");
  const [username, setUsername] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const stompClient = useRef(null);
  const audioRef = useRef(null);
  const lastSentTime = useRef(0);

  const LAPTOP_IP = "192.168.43.148";

  // --- 1. SEND ACTION ---
  const sendSyncAction = useCallback((action, songId = null, timestamp = null) => {
    const now = Date.now();
    if (now - lastSentTime.current < 400 && action !== "PAUSE") return;
    if (stompClient.current?.connected) {
      lastSentTime.current = now;
      const payload = {
        action,
        timestamp: timestamp !== null ? timestamp : (audioRef.current?.currentTime || 0),
        songId: songId || currentSong?.id,
        username
      };
      stompClient.current.publish({ destination: '/app/sync', body: JSON.stringify(payload) });
    }
  }, [currentSong, username]);

  // --- 2. SYNC HANDLER (The "Full Data" Version) ---
  const handleIncomingSync = useCallback((data, freshSongsList) => {
    if (!audioRef.current) return;

    // Use the freshSongsList passed from useEffect to avoid "Empty List" bugs
    const listToUse = freshSongsList || allSongs;
    const incoming = listToUse.find(s => String(s.id) === String(data.songId));

    if (incoming) {
      const isDifferent = !currentSong || String(currentSong.id) !== String(incoming.id);
      if (isDifferent) {
        setCurrentSong(incoming);
        audioRef.current.src = incoming.url;
        audioRef.current.load();
        audioRef.current.oncanplay = () => {
          audioRef.current.currentTime = data.timestamp;
          if (data.action === "PLAY") audioRef.current.play().catch(() => {});
          audioRef.current.oncanplay = null;
        };
      } else {
        if (Math.abs(audioRef.current.currentTime - data.timestamp) > 1.2) {
          audioRef.current.currentTime = data.timestamp;
        }
        data.action === "PLAY" ? audioRef.current.play().catch(() => {}) : audioRef.current.pause();
      }
    }
  }, [allSongs, currentSong]);

  // --- 3. DATA FETCH & WEBSOCKET ---
  useEffect(() => {
    if (!isLoggedIn) return;

    fetch(`http://${LAPTOP_IP}:8080/api/songs`)
        .then(res => res.json())
        .then(data => {
          const uniqueSongs = Array.from(new Map(data.map(s => [s.id, s])).values());
          setAllSongs(uniqueSongs); // Save to state
          setCurrentSong(prev => prev || uniqueSongs[0]);

          // Connect WebSocket and pass the data directly to the handler
          const client = setupWebSocket(
              LAPTOP_IP,
              () => setStatus(`Synced as ${username}`),
              (msg) => handleIncomingSync(msg, uniqueSongs) // Pass the actual list here
          );
          stompClient.current = client;
        })
        .catch(() => setStatus("Offline"));

    return () => stompClient.current?.deactivate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, LAPTOP_IP]);

  // --- 4. NAVIGATION ---
  const playNext = () => {
    const idx = allSongs.findIndex(s => s.id === currentSong?.id);
    const next = allSongs[(idx + 1) % allSongs.length];
    sendSyncAction("PLAY", next.id, 0);
  };

  const playPrev = () => {
    const idx = allSongs.findIndex(s => s.id === currentSong?.id);
    const prev = allSongs[(idx - 1 + allSongs.length) % allSongs.length];
    sendSyncAction("PLAY", prev.id, 0);
  };

  // --- 5. SEARCH LOGIC (FIXED) ---
  const filteredSongs = allSongs.filter(s => {
    const title = (s.title || "").toLowerCase();
    const artist = (s.artist || "").toLowerCase();
    const target = searchTerm.toLowerCase();
    return title.includes(target) || artist.includes(target);
  });

  if (!isLoggedIn) {
    return (
        <div className="login-screen">
          <div className="login-card">
            <h1>🎵 Tamil Sync</h1>
            <input type="text" placeholder="Name..." className="login-input" onChange={(e) => setUsername(e.target.value)} />
            <button className="login-button" onClick={() => username && setIsLoggedIn(true)}>Join</button>
          </div>
        </div>
    );
  }

  return (
      <div className="music-app">
        <Sidebar
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            filteredSongs={filteredSongs}
            currentSong={currentSong}
            sendSyncAction={sendSyncAction}
        />
        <div className="main-content">
          {currentSong ? (
              <PlayerControls audioRef={audioRef} currentSong={currentSong} playNext={playNext} playPrev={playPrev} sendSyncAction={sendSyncAction} status={status} />
          ) : <div className="loading">Loading...</div>}
        </div>
      </div>
  );
}

export default App;