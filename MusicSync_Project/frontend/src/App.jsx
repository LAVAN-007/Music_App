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
    const [accessKey, setAccessKey] = useState("");
    const [error, setError] = useState("");
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [activeUsers, setActiveUsers] = useState([]);

    const stompClient = useRef(null);
    const audioRef = useRef(null);
    const lastSentTime = useRef(0);

    // --- 🔑 AUTHORIZATION LOGIC ---
    const handleLogin = () => {
        if (!accessKey) {
            setError("Please enter your Key!");
            return;
        }

        fetch(`/api/validate-access?key=${accessKey}`)
            .then(res => res.json())
            .then(data => {
                if (data.status === "SUCCESS") {
                    setUsername(data.username);
                    setIsLoggedIn(true);
                    setError("");
                } else {
                    setError(data.message);
                }
            })
            .catch(() => setError("Invalid Key or Connection Error"));
    };

    // --- 🔑 LOGOUT LOGIC ---
    const handleLogout = () => {
        if (stompClient.current?.connected) {
            const leavePayload = {
                action: "LEAVE",
                username,
                timestamp: 0,
                songId: currentSong?.id || "1"
            };
            stompClient.current.publish({
                destination: '/app/sync',
                body: JSON.stringify(leavePayload)
            });
        }
        setIsLoggedIn(false);
        setUsername("");
        setAccessKey("");
        setError("");
        if (stompClient.current) {
            stompClient.current.deactivate();
        }
    };

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

    // --- 2. SYNC HANDLER ---
    const handleIncomingSync = useCallback((data, freshSongsList) => {
        if (!audioRef.current) return;

        if (data.action === "JOIN") {
            setActiveUsers(prev => [...new Set([...prev, data.username])]);
            return;
        }

        if (data.action === "LEAVE") {
            setActiveUsers(prev => prev.filter(user => user !== data.username));
            return;
        }

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
                if (Math.abs(audioRef.current.currentTime - data.timestamp) > 1.5) {
                    audioRef.current.currentTime = data.timestamp;
                }
                if (data.action === "PLAY" && audioRef.current.paused) {
                    audioRef.current.play().catch(e => console.log("Play error:", e));
                } else if (data.action === "PAUSE" && !audioRef.current.paused) {
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
                setAllSongs(finalSongs);

                // Fetch initial active users
                fetch(`/api/active-users`).then(r => r.json()).then(users => setActiveUsers(users));

                return fetch(`/api/current-state`)
                    .then(res => res.json())
                    .then(data => {
                        const { state, serverTime, lastUpdateAt } = data;
                        const drift = (serverTime - lastUpdateAt) / 1000;
                        const accurateTime = state.timestamp + (state.action === "PLAY" ? drift : 0);
                        const activeSong = finalSongs.find(s => String(s.id) === String(state.songId)) || finalSongs[0];

                        setCurrentSong(activeSong);
                        if (audioRef.current) {
                            audioRef.current.src = activeSong.url;
                            audioRef.current.currentTime = accurateTime;
                            if (state.action === "PLAY") {
                                audioRef.current.play().catch(() => setStatus("Click anywhere to Sync!"));
                            }
                        }

                        // WebSocket connection logic
                        stompClient.current = setupWebSocket(
                            username,
                            () => {
                                setStatus(`Synced as ${username}`);
                                // ✅ CORRECTED: Semicolon removed, logic contained in braces
                                const joinMessage = {
                                    action: "JOIN",
                                    username: username,
                                    timestamp: audioRef.current?.currentTime || 0,
                                    songId: currentSong?.id || "1"
                                };
                                stompClient.current.publish({
                                    destination: '/app/sync',
                                    body: JSON.stringify(joinMessage)
                                });
                            },
                            (msg) => handleIncomingSync(msg, finalSongs)
                        );
                    });
            })
            .catch(() => setStatus("Offline"));

        return () => stompClient.current?.deactivate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoggedIn, username]);

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
                    <h1 className="blue-glow">Music Sync</h1>
                    <p>Enter your secret key to join</p>
                    <input
                        type="text"
                        className="login-input"
                        value={accessKey}
                        onChange={(e) => setAccessKey(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                    />
                    {error && <div className="error-msg">{error}</div>}
                    <button className="login-button" onClick={handleLogin}>Join Session</button>
                </div>
            </div>
        );
    }

    return (
        <div className="music-app">
            <audio ref={audioRef} onEnded={playNext} />
            <button className="menu-btn" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
                {isSidebarOpen ? <X size={30} /> : <Menu size={30} />}
            </button>
            <div className={`sidebar-overlay ${isSidebarOpen ? 'open' : ''}`}>
                <Sidebar
                    activeUsers={activeUsers}
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    songs={allSongs}
                    currentSong={currentSong}
                    sendSyncAction={(action, id) => {
                        sendSyncAction(action, id, 0);
                        setIsSidebarOpen(false);
                    }}
                    onLogout={handleLogout}
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