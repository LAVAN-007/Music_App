import React from 'react';
import { decodeHTMLEntities } from '../SyncEngine';

const PlayerControls = ({ audioRef, currentSong, playNext, playPrev, sendSyncAction, status }) => {
    if (!currentSong) return null;

    return (
        <div className="main-player">
            <div className="player-card">
                <img src={currentSong.thumbnail} alt="Poster" />
                <h1>{decodeHTMLEntities(currentSong.title)}</h1>
                <h3>{currentSong.artist}</h3>

                <audio
                    ref={audioRef}
                    src={currentSong.url}
                    controls
                    onEnded={playNext}
                    className="audio-element"
                />

                <div className="controls">
                    <button onClick={playPrev}>Prev</button>
                    <button onClick={() => sendSyncAction("PLAY")}>Play</button>
                    <button onClick={() => sendSyncAction("PAUSE")}>Stop</button>
                    <button onClick={playNext}>Next</button>
                </div>
                <p className="status-tag">{status}</p>
            </div>
        </div>
    );
};

export default PlayerControls;