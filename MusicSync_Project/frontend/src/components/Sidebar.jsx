import React, { useState, useEffect, useMemo } from 'react';
import { decodeHTMLEntities } from '../SyncEngine';
import { Search, X, LogOut, Users } from 'lucide-react'; // 🔥 LogOut & Users icons add panniyachu

const Sidebar = ({ searchTerm, setSearchTerm, songs = [], currentSong, sendSyncAction, activeUsers = [], onLogout }) => {
    const [debouncedTerm, setDebouncedTerm] = useState("");
    const [visibleCount, setVisibleCount] = useState(40);

    // 🎨 Profile Colors Logic
    const getUserColor = (name) => {
        const colors = {
            lavanya: '#2ecd2e', vijay: '#2ecd2e', nivedha: '#2ecd2e',
            saran: '#2ecd2e', srikanth: '#2ecd2e', karthi: '#2ecd2e'
        };
        return colors[name.toLowerCase()] || '#00d2ff';
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedTerm(searchTerm);
            setVisibleCount(40);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const filteredSongs = useMemo(() => {
        if (!songs || !Array.isArray(songs)) return [];
        if (!debouncedTerm) return songs;

        return songs.filter(song =>
            (song.title && song.title.toLowerCase().includes(debouncedTerm.toLowerCase())) ||
            (song.artist && song.artist.toLowerCase().includes(debouncedTerm.toLowerCase()))
        );
    }, [debouncedTerm, songs]);

    const handleScroll = (e) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        if (scrollHeight - scrollTop <= clientHeight + 50) {
            setVisibleCount(prev => prev + 40);
        }
    };

    return (
        <div className="sidebar-content">
            <h2 className="sidebar-title">Music Sync</h2>

            {/* 🟢 NEW: ACTIVE USERS SECTION */}
            <div className="sidebar-main-scroll">
            <div className="active-users-wrapper">
                <div className="section-header">
                    <Users size={16} /> <span>Online Friends ({activeUsers.length})</span>
                </div>
                <div className="active-user-list">
                    {activeUsers.length > 0 ? activeUsers.map(user => (
                        <div key={user} className="user-pill" style={{ borderColor: getUserColor(user) }}>
                            <span className="user-dot" style={{ backgroundColor: getUserColor(user) }}></span>
                            {user}
                        </div>
                    )) : <div className="no-users">Only you are here</div>}
                </div>
            </div>

            <div className="search-wrapper">
                <Search size={18} className="search-icon" />
                <input
                    className="sidebar-search-bar"
                    placeholder="Search 2500+ songs..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                    <button className="clear-btn" onClick={() => setSearchTerm("")}><X size={16} /></button>
                )}
            </div>

            <div className="song-scroll-container" onScroll={handleScroll}>
                {filteredSongs.length > 0 ? (
                    filteredSongs.slice(0, visibleCount).map((song) => (
                        <div
                            key={song.id}
                            className={`sidebar-song-item ${currentSong?.id === song.id ? 'active-blue' : ''}`}
                            onClick={() => sendSyncAction("PLAY", song.id, 0)}
                        >
                            <div className="song-details">
                                <strong className="song-name">{decodeHTMLEntities(song.title)}</strong>
                                <p className="artist-name">{song.artist}</p>
                            </div>
                            {currentSong?.id === song.id && <div className="playing-indicator">Now Playing</div>}
                        </div>
                    ))
                ) : (
                    <div className="no-songs-found">No songs found...</div>
                )}
            </div>
            </div>

            <div className="sidebar-footer">
                <button className="logout-button" onClick={onLogout}>
                    <LogOut size={18} /> Exit Session
                </button>
            </div>
        </div>
    );
};

export default Sidebar;