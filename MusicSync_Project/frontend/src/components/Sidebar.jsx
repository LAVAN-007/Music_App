import React from 'react';
import { decodeHTMLEntities } from '../SyncEngine'; // 👈 Neenga sonna andha crucial import
import { Search, X } from 'lucide-react'; // Icons for search bar

const Sidebar = ({ searchTerm, setSearchTerm, filteredSongs, currentSong, sendSyncAction }) => {
    return (
        <div className="sidebar-content">
            <h2 className="sidebar-title">🎵 Tamil Sync</h2>

            {/* Modern Search Container */}
            <div className="search-wrapper">
                <Search size={18} className="search-icon" />
                <input
                    className="sidebar-search-bar"
                    placeholder="Search songs..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                    <button
                        className="clear-btn"
                        onClick={() => setSearchTerm("")}
                    >
                        <X size={16} />
                    </button>
                )}
            </div>

            {/* Song List with Scroll */}
            <div className="song-scroll-container">
                {filteredSongs.length > 0 ? (
                    filteredSongs.map((song) => (
                        <div
                            key={song.id}
                            className={`sidebar-song-item ${currentSong?.id === song.id ? 'active-blue' : ''}`}
                            onClick={() => sendSyncAction("PLAY", song.id, 0)}
                        >
                            <div className="song-details">
                                {/* Using the decode function here */}
                                <strong className="song-name">
                                    {decodeHTMLEntities(song.title)}
                                </strong>
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
    );
};

export default Sidebar;