import React from 'react';
import { decodeHTMLEntities } from '../SyncEngine';

const Sidebar = ({ searchTerm, setSearchTerm, filteredSongs, currentSong, sendSyncAction }) => {
    return (
        <div className="sidebar">
            <h2>🎵 Tamil Sync</h2>

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
        </div>
    );
};

export default Sidebar;