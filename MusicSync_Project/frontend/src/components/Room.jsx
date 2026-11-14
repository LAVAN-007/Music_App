import { useCallback, useEffect, useRef, useState } from 'react';
import { useRoom } from '../hooks/useRoom';
import { useSolo } from '../hooks/useSolo';
import { playMessageSound } from '../lib/sound';
import FriendsPanel from './FriendsPanel';
import { usePlayer } from '../hooks/usePlayer';
import { useLatest } from '../hooks/useLatest';
import { formatTime } from '../lib/util';
import { serverNow } from '../lib/clock';
import { Avatar, Brand, Icon } from './ui';
import Library from './Library';
import NowPlaying from './NowPlaying';
import QueuePanel from './QueuePanel';
import ChatPanel from './ChatPanel';
import InviteDialog from './InviteDialog';

const VOLUME_KEY = 'musicsync.volume';
const MUTED_KEY = 'musicsync.muted';
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
    case 'SHUFFLE': return `${who} turned shuffle ${s.shuffle ? 'on' : 'off'}`;
    default: return '';
  }
}

/** A shared room: playback state comes from the server and everyone in the room hears the same thing. */
export function RoomScreen({ code, seed, onGone, onUnauthorized, ...rest }) {
  const events = useRef({}); // the player below says what to do with chat and activity
  const subscribe = useCallback((handlers) => {
    events.current = handlers;
    return () => { events.current = {}; };
  }, []);
  const room = useRoom(code, {
    onGone,
    onUnauthorized,
    onChat: (message) => events.current.onChat?.(message),
    onActivity: (event) => events.current.onActivity?.(event),
  });

  // Started from the solo player: carry on with the song that was playing there.
  const seeded = useRef(!seed);
  const { status, send } = room;
  useEffect(() => {
    if (seeded.current || status !== 'connected') return;
    seeded.current = true;
    send({ type: 'SELECT', songId: seed.songId });
    if (seed.position > 2) send({ type: 'SEEK', position: seed.position });
    if (!seed.playing) send({ type: 'PAUSE' });
  }, [status, send, seed]);

  return <Player room={room} code={code} subscribe={subscribe} {...rest} />;
}

/** Listening on your own: no room, no server state. */
export function SoloScreen({ library, carryRef, ...rest }) {
  const solo = useSolo(library);
  const stateRef = useLatest(solo.touched ? solo.state : null); // nothing to carry over until something was played
  useEffect(() => {
    // Lets "Start a room" pick up what is playing here.
    carryRef.current = () => {
      const s = stateRef.current;
      if (!s) return null;
      const position = s.playing ? s.position + Math.max(0, serverNow() - s.updatedAt) / 1000 : s.position;
      return { songId: s.songId, position, playing: s.playing };
    };
    return () => { carryRef.current = null; };
  }, [carryRef, stateRef]);
  return <Player room={solo} solo library={library} {...rest} />;
}

function Player({ room, solo = false, code, subscribe, user, library, playlists, friends, toast,
  onLeave, onTogether, onJoinFriend, onSignOut }) {
  const audioRef = useRef(null);
  const [view, setView] = useState('player'); // which panel a phone shows: player | library | side
  const [sideTab, setSideTab] = useState('queue'); // queue | chat | friends
  const [inviteOpen, setInviteOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [activity, setActivity] = useState('');
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE).matches);
  const [volume, setVolume] = useState(() => {
    const saved = parseFloat(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(saved) ? Math.min(1, Math.max(0, saved)) : 0.8;
  });
  // Muting is personal: it silences this device only and is never sent to the room.
  const [muted, setMuted] = useState(() => localStorage.getItem(MUTED_KEY) === '1');

  const chatVisible = sideTab === 'chat' && (!isMobile || view === 'side');
  const chatVisibleRef = useLatest(chatVisible);
  const byIdRef = useLatest(library.byId);

  useEffect(() => {
    if (!subscribe) return undefined;
    return subscribe({
      onChat: (message) => {
        if (message.system) {
          if (message.username !== user) toast(message.text);
        } else if (message.username !== user) {
          playMessageSound();
          if (!chatVisibleRef.current) setUnread(n => n + 1);
        }
      },
      onActivity: (event) => {
        const text = describe(event, user, byIdRef.current);
        if (text) setActivity(text);
      },
    });
  }, [subscribe, user, toast, chatVisibleRef, byIdRef]);

  const { state, send } = room;
  const song = state ? library.byId.get(state.songId) : null;
  const player = usePlayer(audioRef, state, song, send, solo || room.listeners <= 1, muted);

  // Warm up the song that plays next (queue head, else the next one in the library) so it starts on time.
  // With shuffle on and an empty queue nobody knows the next song yet, so there is nothing to warm up.
  const following = state?.shuffle ? null : (song ? (library.byId.has(song.id + 1) ? song.id + 1 : library.songs[0]?.id) : null);
  const nextId = state?.queue[0] ?? following;
  const nextUrl = nextId != null && nextId !== song?.id ? library.byId.get(nextId)?.url : null;
  useEffect(() => {
    if (!nextUrl) return undefined;
    const warm = new Audio();
    warm.preload = 'metadata';
    warm.src = nextUrl;
    return () => { warm.removeAttribute('src'); warm.load(); };
  }, [nextUrl]);
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
  useEffect(() => {
    try { localStorage.setItem(MUTED_KEY, muted ? '1' : '0'); } catch { /* ignore */ }
  }, [muted]);

  /** Sends a command, telling the user when we're offline instead of silently dropping it. */
  const act = useCallback((command) => {
    const ok = send(command);
    if (!ok) toast('Reconnecting… try again in a moment', 'error');
    return ok;
  }, [send, toast]);

  // The listener who clicks hears the result at once; the server's answer follows and takes over.
  const playerRef = useLatest(player);
  const toggle = useCallback(() => {
    const p = playerRef.current;
    if (p.interrupted) { p.resume(); return; } // pressing play after a call means "carry on", not "pause the room"
    if (p.playing) {
      const audio = audioRef.current;
      const position = audio && audio.readyState >= 1 && !audio.muted ? audio.currentTime : undefined;
      if (act({ type: 'PAUSE', position })) p.pause();
    } else if (act({ type: 'PLAY' })) {
      p.play();
    }
  }, [act, playerRef]);
  const next = useCallback(() => act({ type: 'NEXT' }), [act]);
  const prev = useCallback(() => act({ type: 'PREV' }), [act]);

  /** @param context ids of the list the song was picked from (a playlist or category); solo playback continues through it */
  const playSong = (s, context) => {
    if (!act(solo && context ? { type: 'SELECT', songId: s.id, context } : { type: 'SELECT', songId: s.id })) return;
    player.prepare(s);
    if (isMobile) setView('player');
  };
  /** Plays a whole list: on your own it becomes what plays next; in a room the rest is queued for everyone. */
  const playAll = (songs) => {
    if (songs.length === 0) return;
    playSong(songs[0], songs.map(x => x.id));
    if (!solo) for (const x of songs.slice(1, 100)) send({ type: 'QUEUE_ADD', songId: x.id });
  };
  const shuffled = (songs) => {
    const list = [...songs];
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };
  /** Shuffle play of a list. On your own, shuffle stays on for that list; in a room it is queued in random order. */
  const shuffleAll = (songs) => {
    if (songs.length === 0) return;
    const order = shuffled(songs);
    if (solo) {
      send({ type: 'SHUFFLE', index: 1 });
      playSong(order[0], songs.map(x => x.id));
    } else {
      playAll(order);
    }
  };
  const toggleShuffle = () => act({ type: 'SHUFFLE', index: state?.shuffle ? 0 : 1 });
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
      album: solo ? 'MusicSync' : `MusicSync room ${code}`,
      artwork: song.thumbnail ? [{ src: song.thumbnail, sizes: '500x500' }] : [],
    });
    const handlers = { play: toggle, pause: toggle, nexttrack: next, previoustrack: prev };
    for (const [name, handler] of Object.entries(handlers)) {
      try { navigator.mediaSession.setActionHandler(name, handler); } catch { /* unsupported action */ }
    }
  }, [song, code, solo, toggle, next, prev]);

  useEffect(() => {
    document.title = song ? `${song.title} · MusicSync` : 'MusicSync — listen together';
    return () => { document.title = 'MusicSync — listen together'; };
  }, [song]);

  const others = room.users.filter(name => name !== user);
  const requests = friends.incoming.length;
  const showTab = (tab) => { setSideTab(tab); if (tab === 'chat') setUnread(0); };
  const openSide = (tab) => { showTab(tab); setView('side'); };

  return (
    <div className="room" data-view={view}>
      <div className="ambient" aria-hidden="true">
        <span className="ambient-grid" />
        <span className="orbit-ring a"><i /></span>
        <span className="orbit-ring b"><i /></span>
      </div>
      <header className="topbar">
        <Brand compact />
        {solo ? (
          <div className="topbar-right">
            <button className="btn btn-primary btn-small" onClick={onTogether}>
              <Icon name="people" size={16} /><span>Listen together</span>
            </button>
            <span className="me" title={`Signed in as ${user}`}><Avatar name={user} size={28} /><span className="hide-mobile">{user}</span></span>
            <button className="btn btn-ghost btn-small" onClick={onSignOut} title="Sign out">
              <Icon name="logout" size={16} /><span className="hide-mobile">Sign out</span>
            </button>
          </div>
        ) : (
          <>
            <button className="room-pill" onClick={() => setInviteOpen(true)} title="Invite friends">
              <span className="room-pill-label">Room</span>
              <span className="room-pill-code">{code}</span>
              <Icon name="copy" size={14} />
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
          </>
        )}
      </header>

      {!online && (
        <div className="conn-banner" role="status">
          {room.status === 'connecting' ? 'Connecting to the room…' : 'Connection lost. Reconnecting…'}
        </div>
      )}

      <aside className="panel panel-library">
        <Library library={library} playlists={playlists} currentId={state?.songId} playing={player.playing}
          onPlay={playSong} onPlayAll={playAll} onShuffleAll={shuffleAll} onQueue={queueSong} toast={toast} />
      </aside>

      <main className="panel panel-stage">
        <NowPlaying song={song} state={state} player={player} libraryLoading={library.songs.length === 0}
          others={others} solo={solo} activity={activity} volume={volume} onVolume={setVolume}
          muted={muted} onMute={() => setMuted(m => !m)} shuffle={!!state?.shuffle} onShuffle={toggleShuffle}
          onToggle={toggle} onNext={next} onPrev={prev}
          onSeek={(position) => { if (act({ type: 'SEEK', position })) player.seek(position); }}
          onInvite={solo ? onTogether : () => setInviteOpen(true)} />
      </main>

      <aside className="panel panel-side">
        <div className={`tabs ${solo ? '' : 'three'}`} role="tablist">
          <button role="tab" aria-selected={sideTab === 'queue'} className={sideTab === 'queue' ? 'active' : ''}
            onClick={() => showTab('queue')}>
            Queue{state?.queue.length ? <span className="count">{state.queue.length}</span> : null}
          </button>
          {!solo && (
            <button role="tab" aria-selected={sideTab === 'chat'} className={sideTab === 'chat' ? 'active' : ''}
              onClick={() => showTab('chat')}>
              Chat{unread > 0 && !chatVisible ? <span className="count hot">{unread}</span> : null}
            </button>
          )}
          <button role="tab" aria-selected={sideTab === 'friends'} className={sideTab === 'friends' ? 'active' : ''}
            onClick={() => showTab('friends')}>
            Friends{requests > 0 ? <span className="count hot">{requests}</span> : null}
          </button>
        </div>
        {sideTab === 'friends' ? (
          <FriendsPanel friends={friends} currentRoom={code} onJoin={onJoinFriend} toast={toast} />
        ) : sideTab === 'chat' && !solo ? (
          <ChatPanel messages={room.messages} me={user} disabled={!online}
            onSend={(text) => act({ type: 'CHAT', text })} />
        ) : (
          <QueuePanel queue={state?.queue || []} current={song} byId={library.byId} solo={solo}
            onPlay={(index) => act({ type: 'QUEUE_PLAY', index })}
            onRemove={(index) => act({ type: 'QUEUE_REMOVE', index })}
            onClear={() => act({ type: 'QUEUE_CLEAR' })} />
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
        {!solo && (
          <button className={view === 'side' && sideTab === 'chat' ? 'active' : ''} onClick={() => openSide('chat')}>
            <Icon name="chat" size={22} /><span>Chat</span>
            {unread > 0 && !chatVisible && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
          </button>
        )}
        <button className={view === 'side' && sideTab === 'friends' ? 'active' : ''} onClick={() => openSide('friends')}>
          <Icon name="people" size={22} /><span>Friends</span>
          {requests > 0 && <span className="badge">{requests > 9 ? '9+' : requests}</span>}
        </button>
      </nav>

      <audio ref={audioRef} preload="auto" />
      {inviteOpen && !solo && <InviteDialog code={code} users={room.users} me={user} onClose={() => setInviteOpen(false)} />}
    </div>
  );
}
