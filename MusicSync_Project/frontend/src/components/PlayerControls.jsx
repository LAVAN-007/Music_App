import React, { useState, useEffect, useRef } from 'react';
import { decodeHTMLEntities } from '../SyncEngine';

const PlayerControls = ({ audioRef, currentSong, playNext, playPrev, sendSyncAction, status, username, connectedUsers }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    
    const otherUser = username.toLowerCase() === 'vijay' ? 'Lavanya' : 'Vijay';
    const isPartnerOnline = connectedUsers.map(u => u.toLowerCase()).includes(otherUser.toLowerCase());

    // Update local state when audio plays/pauses or time updates
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handlePlay = () => setIsPlaying(true);
        const handlePause = () => setIsPlaying(false);
        const handleTimeUpdate = () => {
            if (!isDragging) {
                setProgress(audio.currentTime);
            }
        };
        const handleLoadedMetadata = () => {
            setDuration(audio.duration);
        };

        audio.addEventListener('play', handlePlay);
        audio.addEventListener('pause', handlePause);
        audio.addEventListener('timeupdate', handleTimeUpdate);
        audio.addEventListener('loadedmetadata', handleLoadedMetadata);

        // Initial state set
        setIsPlaying(!audio.paused);
        setProgress(audio.currentTime || 0);
        setDuration(audio.duration || 0);

        return () => {
            audio.removeEventListener('play', handlePlay);
            audio.removeEventListener('pause', handlePause);
            audio.removeEventListener('timeupdate', handleTimeUpdate);
            audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
        };
    }, [audioRef, isDragging, currentSong]);

    const togglePlayPause = () => {
        if (isPlaying) {
            sendSyncAction("PAUSE");
        } else {
            sendSyncAction("PLAY");
        }
    };

    const handleSeekChange = (e) => {
        const value = parseFloat(e.target.value);
        setProgress(value);
    };

    const handleSeekEnd = (e) => {
        setIsDragging(false);
        const value = parseFloat(e.target.value);
        // Send a PLAY event with the new timestamp to sync everybody
        sendSyncAction("PLAY", currentSong.id, value);
    };

    const formatTime = (time) => {
        if (isNaN(time)) return "0:00";
        const m = Math.floor(time / 60);
        const s = Math.floor(time % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    if (!currentSong) return null;

    return (
        <div className="main-player glass-panel">
            <div className="player-card">
                <div className="partner-status">
                    <span className={`status-dot ${isPartnerOnline ? 'online' : 'offline'}`}></span>
                    <span className="status-text">
                        {isPartnerOnline ? `${otherUser} connected` : `Waiting for ${otherUser}...`}
                    </span>
                </div>
                <div className="art-container">
                    <img src={currentSong.thumbnail} alt="Poster" className={`album-art ${isPlaying ? 'spinning' : ''}`} />
                </div>
                <div className="song-info text-center">
                    <h1 className="song-title">{decodeHTMLEntities(currentSong.title)}</h1>
                    <h3 className="song-artist">{currentSong.artist}</h3>
                </div>

                <audio
                    ref={audioRef}
                    src={currentSong.url}
                    onEnded={playNext}
                    className="hidden-audio"
                    style={{ display: 'none' }}
                />

                <div className="progress-container">
                    <span className="time">{formatTime(progress)}</span>
                    <input
                        type="range"
                        min="0"
                        max={duration || 100}
                        value={progress}
                        onChange={handleSeekChange}
                        onMouseDown={() => setIsDragging(true)}
                        onTouchStart={() => setIsDragging(true)}
                        onMouseUp={handleSeekEnd}
                        onTouchEnd={handleSeekEnd}
                        className="progress-slider"
                    />
                    <span className="time">{formatTime(duration)}</span>
                </div>

                <div className="controls center-flex">
                    <button className="control-btn" onClick={playPrev}>
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
                    </button>
                    <button className="control-btn play-btn highlight-btn" onClick={togglePlayPause}>
                        {isPlaying ? (
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                        ) : (
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                        )}
                    </button>
                    <button className="control-btn" onClick={playNext}>
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
                    </button>
                    <a href={currentSong.url} download={currentSong.title} className="control-btn download-btn" title="Download Song">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2v9.67z"/></svg>
                    </a>
                </div>
                <div className="status-tag pulse-tag">{status}</div>
            </div>
        </div>
    );
};

export default PlayerControls;