import React from 'react';
import { decodeHTMLEntities } from '../SyncEngine';

const Sidebar = ({ searchTerm, setSearchTerm, filteredSongs, currentSong, sendSyncAction, handleLogout }) => {
    return (
        <div className="sidebar">
            <div className="sidebar-header">
                <h2>🎵 Music Sync</h2>
            </div>

            <div className="search-container">
                <input
                    className="search-bar"
                    placeholder="Search songs..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                {/* The Clear Button (X) */}
                {searchTerm && (
                    <button
                        className="clear-search"
                        onClick={() => setSearchTerm("")}
                    >
                        ✕
                    </button>
                )}
            </div>

            <div className="song-list">
                {filteredSongs.length > 0 ? (
                    filteredSongs.map((song) => (
                        <div
                            key={song.id}
                            className={`song-item ${currentSong?.id === song.id ? 'active' : ''}`}
                            onClick={() => sendSyncAction("PLAY", song.id, 0)}
                        >
                            <strong>{decodeHTMLEntities(song.title)}</strong>
                            <p>{song.artist}</p>
                        </div>
                    ))
                ) : (
                    <p className="no-results">No songs found...</p>
                )}
            </div>

            <div className="sidebar-footer">
                <button className="cancel-collab-btn" onClick={handleLogout}>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg>
                    Cancel Collab
                </button>
            </div>
        </div>
    );
};

export default Sidebar;