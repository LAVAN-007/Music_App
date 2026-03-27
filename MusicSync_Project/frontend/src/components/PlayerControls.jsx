import React, { useState, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import { decodeHTMLEntities } from '../SyncEngine';

const PlayerControls = ({ audioRef, currentSong, playNext, playPrev, sendSyncAction, status }) => {
    // 1. Add a state to track playing status
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);

    // 2. Sync the state with the actual audio element
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const updateStatus = () => {
            // Strict state check
            setCurrentTime(audio.currentTime);
            setDuration(audio.duration || 0);
            setIsPlaying(!audio.paused);
        };

        // Standard audio events
        audio.addEventListener('play', updateStatus);
        audio.addEventListener('pause', updateStatus);
        audio.addEventListener('timeupdate', updateStatus);
        updateStatus();// 🔥 Continuous sync check

        return () => {
            audio.removeEventListener('play', updateStatus);
            audio.removeEventListener('pause', updateStatus);
            audio.removeEventListener('timeupdate', updateStatus);
        };
    }, [audioRef, currentSong]);
    const formatTime = (secs) => {
        if (!secs || isNaN(secs)) return "0:00";
        const minutes = Math.floor(secs / 60);
        const seconds = Math.floor(secs % 60);
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };
    const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;// Re-run if song changes

    return (
        <div className="player-controls">
            <div className="album-art-container">
                <img
                    src={currentSong?.poster || "https://via.placeholder.com/150"}
                    alt="poster"
                    className="player-poster"
                />
            </div>

            <h2 className="blue-glow">{decodeHTMLEntities(currentSong?.title)}</h2>
            <p style={{color: '#b3b3b3'}}>{currentSong?.artist}</p>

            <div className="progress-container">
                <span className="time-text">{formatTime(currentTime)}</span>
                <div className="progress-bar-base">
                    <div
                        className="progress-bar-fill"
                        style={{ width: `${progressPercent}%` }} // Dynamic width strictly update
                    ></div>
                </div>
                <span className="time-text">{formatTime(duration)}</span>
            </div>

            <div className="button-group">
                <button className="icon-btn" onClick={playPrev}>
                    <SkipBack size={30} fill="white" />
                </button>

                {/* 3. Use the isPlaying state here instead of the ref directly */}
                <button className="play-pause-btn" onClick={() => {
                    const nextAction = isPlaying ? "PAUSE" : "PLAY";
                    console.log("Sending Sync:", nextAction);
                    setIsPlaying(!isPlaying);// Debugging
                    sendSyncAction(nextAction);
                }}>
                    {/* UI Toggle based purely on isPlaying internal state */}
                    {isPlaying ? <Pause size={40}  fill="#fff" /> :
                        <Play size={40} fill="#fff" />}
                </button>

                <button className="icon-btn" onClick={playNext}>
                    <SkipForward size={30} fill="white" />
                </button>
            </div>

            <p className={`status-text ${status.includes("Synced") ? "status-blue" : ""}`}>{status}</p>
        </div>
    );
};

export default PlayerControls;