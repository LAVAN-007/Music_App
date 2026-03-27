import React, { useState, useEffect, useRef } from 'react';
import { decodeHTMLEntities } from '../SyncEngine';

const PlayerControls = ({ audioRef, currentSong, playNext, playPrev, sendSyncAction, status, username, connectedUsers }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [isMuted, setIsMuted] = useState(false);

    const toggleMute = () => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.muted = !audio.muted;
        setIsMuted(audio.muted);
    };
    
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
                    <button className={`control-btn mute-btn${isMuted ? ' muted' : ''}`} onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'}>
                        {isMuted ? (
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
                        ) : (
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
                        )}
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