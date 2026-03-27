import { useState, useMemo } from 'react';
import { decodeHTMLEntities } from '../SyncEngine';

const Sidebar = ({ searchTerm, setSearchTerm, filteredSongs, allSongs, currentSong, sendSyncAction, handleLogout, onClose }) => {
    const [openCategories, setOpenCategories] = useState({});

    const toggleCategory = (cat) => {
        setOpenCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
    };

    // Group songs by category (use allSongs when searching, filteredSongs otherwise)
    const grouped = useMemo(() => {
        const songs = searchTerm ? filteredSongs : allSongs || filteredSongs;
        const map = {};
        (songs || []).forEach(song => {
            const cat = song.category || 'Other';
            if (!map[cat]) map[cat] = [];
            map[cat].push(song);
        });
        return map;
    }, [searchTerm, filteredSongs, allSongs]);

    const categories = Object.keys(grouped);

    return (
        <div className="sidebar">
            <div className="sidebar-header">
                <div className="sidebar-header-row">
                    <h2>🎵 Music Sync</h2>
                    {onClose && (
                        <button className="drawer-close-btn" onClick={onClose}>✕</button>
                    )}
                </div>
            </div>

            <div className="search-container">
                <input
                    className="search-bar"
                    placeholder="Search songs..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                    <button className="clear-search" onClick={() => setSearchTerm("")}>✕</button>
                )}
            </div>

            <div className="song-list">
                {categories.length === 0 ? (
                    <p className="no-results">No songs found...</p>
                ) : (
                    categories.map(cat => {
                        const isOpen = searchTerm ? true : !!openCategories[cat];
                        const songs = grouped[cat];
                        return (
                            <div key={cat} className="category-group">
                                <button
                                    className="category-header"
                                    onClick={() => toggleCategory(cat)}
                                >
                                    <span className="category-name">{cat}</span>
                                    <span className="category-meta">
                                        <span className="category-count">{songs.length}</span>
                                        <svg
                                            className={`category-chevron ${isOpen ? 'open' : ''}`}
                                            viewBox="0 0 24 24" fill="currentColor" width="14" height="14"
                                        >
                                            <path d="M7 10l5 5 5-5z"/>
                                        </svg>
                                    </span>
                                </button>
                                {isOpen && (
                                    <div className="category-songs">
                                        {songs.map(song => (
                                            <div
                                                key={song.id}
                                                className={`song-item ${currentSong?.id === song.id ? 'active' : ''}`}
                                                onClick={() => sendSyncAction("PLAY", song.id, 0)}
                                            >
                                                <strong>{decodeHTMLEntities(song.title)}</strong>
                                                <p>{song.artist}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })
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
