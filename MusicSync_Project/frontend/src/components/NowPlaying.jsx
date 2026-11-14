import { useEffect, useRef, useState } from 'react';
import { formatTime } from '../lib/util';
import { categoryColor } from '../lib/categories';
import { Artwork, CategoryTag, Icon, Spinner } from './ui';

export default function NowPlaying({ song, state, player, libraryLoading, others, solo, activity, muted, onMute, shuffle, onShuffle,
  onToggle, onNext, onPrev, onSeek, onInvite }) {
  const [dragValue, setDragValue] = useState(null); // where the thumb is while this listener is moving it
  const [held, setHeld] = useState(null); // the position just chosen, shown until the audio gets there
  const active = useRef(false); // a pointer or key is down on the slider
  const dragRef = useRef(null);
  const lastCommit = useRef(0);
  const heldTimer = useRef(0);
  useEffect(() => () => clearTimeout(heldTimer.current), []);

  const duration = player.duration || song?.duration || 0;
  const time = held !== null && Math.abs(player.time - held) > 1.5 ? held : player.time;
  const shown = dragValue ?? Math.min(time, duration || time);
  const percent = duration ? Math.min(100, (shown / duration) * 100) : 0;

  const seekTo = (value) => {
    lastCommit.current = performance.now();
    setHeld(value);
    clearTimeout(heldTimer.current);
    heldTimer.current = setTimeout(() => setHeld(null), 2000);
    onSeek(value);
  };
  const begin = () => { active.current = true; };
  // The thumb only belongs to this listener while they are touching it; afterwards it follows the song again.
  const commit = () => {
    if (!active.current) return;
    active.current = false;
    const value = dragRef.current;
    dragRef.current = null;
    setDragValue(null);
    if (value !== null) seekTo(value);
  };
  const onChange = (e) => {
    const value = parseFloat(e.target.value);
    if (active.current) { dragRef.current = value; setDragValue(value); }
    // A change with nothing held down (assistive tech) seeks at once. Browsers also fire a stray
    // change right after a drag ends; that one must not move the thumb or the song.
    else if (performance.now() - lastCommit.current > 500) seekTo(value);
  };

  if (!song) {
    return (
      <div className="stage-empty">
        {libraryLoading || !state ? <><Spinner /><p className="muted">Getting things ready…</p></>
          : <><Icon name="music" size={40} /><p className="muted">Pick a song from the library to start.</p></>}
      </div>
    );
  }

  const playing = player.playing;
  return (
    <div className="now">
      <div className="now-people">
        {others.length > 0 ? (
          <span className="pill live"><i className="dot" />Listening with {others.slice(0, 2).join(', ')}
            {others.length > 2 ? ` +${others.length - 2}` : ''}</span>
        ) : (
          <button className="pill pill-action" onClick={onInvite}>
            <Icon name={solo ? 'people' : 'userAdd'} size={15} />
            {solo ? 'Listening on your own · Invite friends' : "You're the only one here — invite friends"}
          </button>
        )}
      </div>

      <div className="now-art-wrap">
        {song.thumbnail && <img className="now-glow" src={song.thumbnail} alt="" aria-hidden="true" />}
        <Artwork src={song.thumbnail} className={`now-art ${playing ? 'playing' : ''}`} />
        {player.interrupted && !player.blocked && (
          <button className="tap-overlay" onClick={player.resume}>
            <span className="tap-circle"><Icon name="play" size={34} /></span>
            <span>Paused for a call or another app</span>
            <span className="tap-note">Resumes by itself · tap to resume now</span>
          </button>
        )}
        {player.blocked && playing && (
          <button className="tap-overlay" onClick={player.unblock}>
            <span className="tap-circle"><Icon name="play" size={34} /></span>
            <span>Tap to start listening</span>
          </button>
        )}
      </div>

      <div className="now-meta">
        <h1 className="now-title" title={song.title}>{song.title}</h1>
        <p className="now-artist">{song.artist || 'Unknown artist'}</p>
        {song.category && (
          <p className="now-tag"><CategoryTag name={song.category} color={categoryColor(song.category)} /></p>
        )}
        <p className="now-activity" aria-live="polite">
          {player.failed ? "This track couldn't be loaded. Try skipping to the next one."
            : player.interrupted ? 'Paused while something else uses your speaker — it resumes by itself'
            : muted ? 'Muted on your device only — everyone else still hears the music'
            : player.buffering ? 'Slow connection — catching up with the room…' : activity || ' '}
        </p>
      </div>

      <div className="seek">
        <span className="seek-time">{formatTime(shown)}</span>
        <input type="range" className="range" aria-label="Seek" min={0} max={duration || 1} step={0.1}
          value={shown} disabled={!duration} style={{ '--fill': `${percent}%` }}
          onChange={onChange} onPointerDown={begin} onKeyDown={begin}
          onPointerUp={commit} onPointerCancel={commit} onLostPointerCapture={commit} onKeyUp={commit} onBlur={commit} />
        <span className="seek-time end">{formatTime(duration)}</span>
      </div>

      <div className="controls">
        <button className={`icon-btn shuffle-btn ${shuffle ? 'on' : ''}`} onClick={onShuffle} aria-pressed={shuffle}
          aria-label={shuffle ? 'Turn shuffle off' : 'Shuffle'} title={shuffle ? 'Shuffle is on' : 'Shuffle'}>
          <Icon name="shuffle" size={22} />
        </button>
        <button className="icon-btn large" onClick={onPrev} aria-label="Previous"><Icon name="prev" size={28} /></button>
        <button className="play-btn" onClick={onToggle} aria-label={playing ? 'Pause' : 'Play'}>
          <Icon name={playing ? 'pause' : 'play'} size={32} />
        </button>
        <button className="icon-btn large" onClick={onNext} aria-label="Next"><Icon name="next" size={28} /></button>
        <button className={`icon-btn mute-btn ${muted ? 'on' : ''}`} onClick={onMute} aria-pressed={muted}
          aria-label={muted ? 'Unmute' : 'Mute for me'} title={muted ? 'Unmute' : 'Mute for me only'}>
          <Icon name={muted ? 'mute' : 'volume'} size={22} />
        </button>
      </div>

    </div>
  );
}
