import React, { useEffect, useState, useRef, useCallback } from 'react';
import { setupWebSocket } from './SyncEngine';
import Sidebar from './components/Sidebar';
import PlayerControls from './components/PlayerControls';
import { Menu, X } from 'lucide-react';
import './App.css';

function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [allSongs, setAllSongs] = useState([]);
  const [currentSong, setCurrentSong] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [status, setStatus] = useState("Connecting...");
  const [username, setUsername] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const stompClient = useRef(null);
  const audioRef = useRef(null);
  const lastSentTime = useRef(0);


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
        username,
          duration: audioRef.current?.duration || 0
      };
      stompClient.current.publish({ destination: '/app/sync', body: JSON.stringify(payload) });
    }
  }, [currentSong, username]);

  // --- 2. SYNC HANDLER (The "Full Data" Version) ---
  const handleIncomingSync = useCallback((data, freshSongsList) => {
    console.log("In Handler - Data:", data);
    if (!audioRef.current) return;

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
          if (data.action === "PLAY") {
            audioRef.current.play().catch(e => console.log("Play blocked:", e));
          }
          audioRef.current.oncanplay = null;
        };
      } else {
        const isCurrentlyPlaying = !audioRef.current.paused;
        if (Math.abs(audioRef.current.currentTime - data.timestamp) > 1.5) {
          audioRef.current.currentTime = data.timestamp;
        }

        if (data.action === "PLAY" && !isCurrentlyPlaying) {
          audioRef.current.play().catch(e => console.log("Play error:", e));
        }
        else if (data.action === "PAUSE" && isCurrentlyPlaying) {
          audioRef.current.pause();
        }
      }
    }
  }, [allSongs, currentSong]);

  // --- 3. DATA FETCH & WEBSOCKET ---
  useEffect(() => {
    if (!isLoggedIn) return;

    fetch(`/api/songs`)
        .then(res => res.json())
        .then(data => {
            const uniqueSongs = Array.from(new Map(data.map(s => [s.id, s])).values());
            const finalSongs = uniqueSongs.map(song => ({
                ...song,
                poster: song.poster || song['thumbnail'] || "https://via.placeholder.com/150"
            }));
            setAllSongs(finalSongs); // Save to state
            setCurrentSong(finalSongs[0]);

          // Connect WebSocket and pass the data directly to the handler
          const client = setupWebSocket(
              username,
              () => setStatus(`Synced as ${username}`),
              (msg) => {
                handleIncomingSync(msg, finalSongs);
              }
          );
          stompClient.current = client;
        })
        .catch(() => setStatus("Offline"));

    return () => stompClient.current?.deactivate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, username]);

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

  if (!isLoggedIn) {
    return (
        <div className="login-screen">
          <div className="login-card">
            <h1>Music Sync</h1>
            <input type="text" placeholder="Name..." className="login-input"
                   onChange={(e) => setUsername(e.target.value)}
                   onKeyDown={(e) => e.key === 'Enter' && username && setIsLoggedIn(true)}/>
            <button className="login-button" onClick={() => username && setIsLoggedIn(true)}>Join</button>
          </div>
        </div>
    );
  }

  return (
      <div className="music-app">
        {/* Hamburger Icon */}
        <audio ref={audioRef}
               onEnded={playNext}/>
        <button className="menu-btn" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
          {isSidebarOpen ? <X size={30} /> : <Menu size={30} />}
        </button>
        <div className={`sidebar-overlay ${isSidebarOpen ? 'open' : ''}`}>
            <Sidebar
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                songs={allSongs}
                currentSong={currentSong}
                sendSyncAction={(action, id) => {
                    sendSyncAction(action, id, 0);
                    setIsSidebarOpen(false);
                }}
            />
        </div>
        <div className="main-content">
          {currentSong ? (
              <PlayerControls audioRef={audioRef} currentSong={currentSong} playNext={playNext} playPrev={playPrev} sendSyncAction={sendSyncAction} status={status} />
          ) : <div className="loading blue-glow">Loading Songs...</div>}
        </div>
      </div>
  );
}

export default App;