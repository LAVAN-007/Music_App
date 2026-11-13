import { useCallback, useEffect, useRef, useState } from 'react';
import { useRoom } from '../hooks/useRoom';
import { usePlayer } from '../hooks/usePlayer';
import { useLatest } from '../hooks/useLatest';
import { formatTime } from '../lib/util';
import { Avatar, Brand, Icon } from './ui';
import Library from './Library';
import NowPlaying from './NowPlaying';
import QueuePanel from './QueuePanel';
import ChatPanel from './ChatPanel';
import InviteDialog from './InviteDialog';

const VOLUME_KEY = 'musicsync.volume';
const MOBILE = '(max-width: 900px)';

function describe(event, me, byId) {
  const who = event.by === me ? 'You' : event.by;
  const title = (id) => byId.get(id)?.title || 'a song';
  const s = event.state;
  switch (event.action) {
    case 'PLAY': return `${who} pressed play`;
    case 'PAUSE': return `${who} paused`;
    case 'SEEK': return `${who} jumped to ${formatTime(s.position)}`;
    case 'SELECT': return `${who} played ${title(s.songId)}`;
    case 'NEXT': return `${who} skipped to ${title(s.songId)}`;
    case 'PREV': return `${who} went back`;
    case 'QUEUE_ADD': return `${who} queued ${title(s.queue[s.queue.length - 1])}`;
    case 'QUEUE_PLAY': return `${who} played ${title(s.songId)} from the queue`;
    case 'QUEUE_REMOVE': return `${who} removed a song from the queue`;
    case 'QUEUE_CLEAR': return `${who} cleared the queue`;
    default: return '';
  }
}

export default function Room({ code, user, library, onLeave, onGone, onUnauthorized, toast }) {
  const audioRef = useRef(null);
  const [view, setView] = useState('player'); // which panel a phone shows: player | library | side
  const [sideTab, setSideTab] = useState('queue'); // queue | chat
  const [inviteOpen, setInviteOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [activity, setActivity] = useState('');
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE).matches);
  const [volume, setVolume] = useState(() => {
    const saved = parseFloat(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(saved) ? Math.min(1, Math.max(0, saved)) : 0.8;
  });

  const chatVisible = sideTab === 'chat' && (!isMobile || view === 'side');
  const chatVisibleRef = useLatest(chatVisible);
  const byIdRef = useLatest(library.byId);

  const room = useRoom(code, {
    onGone,
    onUnauthorized,
    onChat: (message) => {
      if (message.system) {
        if (message.username !== user) toast(message.text);
      } else if (message.username !== user && !chatVisibleRef.current) {
        setUnread(n => n + 1);
      }
    },
    onActivity: (event) => {
      const text = describe(event, user, byIdRef.current);
      if (text) setActivity(text);
    },
  });
  const { state, send } = room;
  const song = state ? library.byId.get(state.songId) : null;
  const player = usePlayer(audioRef, state, song, send);
  const online = room.status === 'connected';

  useEffect(() => {
    const mq = window.matchMedia(MOBILE);
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
    try { localStorage.setItem(VOLUME_KEY, String(volume)); } catch { /* ignore */ }
  }, [volume]);

  /** Sends a command, telling the user when we're offline instead of silently dropping it. */
  const act = useCallback((command) => {
    const ok = send(command);
    if (!ok) toast('Reconnecting… try again in a moment', 'error');
    return ok;
  }, [send, toast]);

  const playingRef = useLatest(!!state?.playing);
  const toggle = useCallback(() => {
    // Any tap also counts as the user gesture browsers need before audio may start.
    if (!playingRef.current) audioRef.current?.play().catch(() => {});
    act({ type: playingRef.current ? 'PAUSE' : 'PLAY' });
  }, [act, playingRef]);
  const next = useCallback(() => act({ type: 'NEXT' }), [act]);
  const prev = useCallback(() => act({ type: 'PREV' }), [act]);

  const playSong = (s) => {
    audioRef.current?.play().catch(() => {});
    if (act({ type: 'SELECT', songId: s.id }) && isMobile) setView('player');
  };
  const queueSong = (s) => { if (act({ type: 'QUEUE_ADD', songId: s.id })) toast(`Added "${s.title}" to the queue`); };

  // Space toggles playback unless the user is typing or focused on a control.
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== 'Space' || e.repeat || inviteOpen) return;
      if (e.target.closest?.('input, textarea, button, [role="dialog"]')) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, inviteOpen]);

  // Lock-screen / headset controls.
  useEffect(() => {
    if (!('mediaSession' in navigator) || !song) return;
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: song.title,
      artist: song.artist,
      album: `MusicSync room ${code}`,
      artwork: song.thumbnail ? [{ src: song.thumbnail, sizes: '500x500' }] : [],
    });
    const handlers = { play: toggle, pause: toggle, nexttrack: next, previoustrack: prev };
    for (const [name, handler] of Object.entries(handlers)) {
      try { navigator.mediaSession.setActionHandler(name, handler); } catch { /* unsupported action */ }
    }
  }, [song, code, toggle, next, prev]);

  useEffect(() => {
    document.title = song ? `${song.title} · MusicSync` : 'MusicSync — listen together';
    return () => { document.title = 'MusicSync — listen together'; };
  }, [song]);

  const others = room.users.filter(name => name !== user);
  const showTab = (tab) => { setSideTab(tab); if (tab === 'chat') setUnread(0); };
  const openSide = (tab) => { showTab(tab); setView('side'); };

  return (
    <div className="room" data-view={view}>
      <header className="topbar">
        <Brand compact />
        <button className="room-pill" onClick={() => setInviteOpen(true)} title="Invite friends">
          <span className="room-pill-label">Room</span>
          <span className="room-pill-code">{code}</span>
        </button>
        <div className="topbar-right">
          <button className="avatars" onClick={() => setInviteOpen(true)} aria-label={`${room.users.length} in this room`}>
            {room.users.slice(0, 4).map(name => <Avatar key={name} name={name} size={28} />)}
            {room.users.length > 4 && <span className="avatar more">+{room.users.length - 4}</span>}
          </button>
          <button className="btn btn-primary btn-small" onClick={() => setInviteOpen(true)}>
            <Icon name="userAdd" size={16} /><span className="hide-mobile">Invite</span>
          </button>
          <button className="btn btn-ghost btn-small" onClick={onLeave} title="Leave room">
            <Icon name="logout" size={16} /><span className="hide-mobile">Leave</span>
          </button>
        </div>
      </header>

      {!online && (
        <div className="conn-banner" role="status">
          {room.status === 'connecting' ? 'Connecting to the room…' : 'Connection lost. Reconnecting…'}
        </div>
      )}

      <aside className="panel panel-library">
        <Library library={library} currentId={state?.songId} playing={!!state?.playing}
          onPlay={playSong} onQueue={queueSong} />
      </aside>

      <main className="panel panel-stage">
        <NowPlaying song={song} state={state} player={player} libraryLoading={library.songs.length === 0}
          others={others} activity={activity} volume={volume} onVolume={setVolume}
          onToggle={toggle} onNext={next} onPrev={prev}
          onSeek={(position) => act({ type: 'SEEK', position })}
          onInvite={() => setInviteOpen(true)} />
      </main>

      <aside className="panel panel-side">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={sideTab === 'queue'} className={sideTab === 'queue' ? 'active' : ''}
            onClick={() => showTab('queue')}>
            Queue{state?.queue.length ? <span className="count">{state.queue.length}</span> : null}
          </button>
          <button role="tab" aria-selected={sideTab === 'chat'} className={sideTab === 'chat' ? 'active' : ''}
            onClick={() => showTab('chat')}>
            Chat{unread > 0 && !chatVisible ? <span className="count hot">{unread}</span> : null}
          </button>
        </div>
        {sideTab === 'queue' ? (
          <QueuePanel queue={state?.queue || []} current={song} byId={library.byId}
            onPlay={(index) => act({ type: 'QUEUE_PLAY', index })}
            onRemove={(index) => act({ type: 'QUEUE_REMOVE', index })}
            onClear={() => act({ type: 'QUEUE_CLEAR' })} />
        ) : (
          <ChatPanel messages={room.messages} me={user} disabled={!online}
            onSend={(text) => act({ type: 'CHAT', text })} />
        )}
      </aside>

      <nav className="tabbar" aria-label="Sections">
        <button className={view === 'player' ? 'active' : ''} onClick={() => setView('player')}>
          <Icon name="music" size={22} /><span>Player</span>
        </button>
        <button className={view === 'library' ? 'active' : ''} onClick={() => setView('library')}>
          <Icon name="library" size={22} /><span>Library</span>
        </button>
        <button className={view === 'side' && sideTab === 'queue' ? 'active' : ''} onClick={() => openSide('queue')}>
          <Icon name="queue" size={22} /><span>Queue</span>
        </button>
        <button className={view === 'side' && sideTab === 'chat' ? 'active' : ''} onClick={() => openSide('chat')}>
          <Icon name="chat" size={22} /><span>Chat</span>
          {unread > 0 && !chatVisible && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
        </button>
      </nav>

      <audio ref={audioRef} preload="auto" />
      {inviteOpen && <InviteDialog code={code} users={room.users} me={user} onClose={() => setInviteOpen(false)} />}
    </div>
  );
}
