import { useCallback, useEffect, useRef, useState } from 'react';
import { api, hasSession, setSession, signOut as endSession } from './lib/api';
import { cleanRoomCode, ROOM_CODE_LENGTH } from './lib/util';
import { playMessageSound } from './lib/sound';
import { useLibrary } from './hooks/useLibrary';
import { usePlaylists } from './hooks/usePlaylists';
import { useFriends } from './hooks/useFriends';
import AuthScreen from './components/AuthScreen';
import { RoomScreen, SoloScreen } from './components/Room';
import TogetherDialog from './components/TogetherDialog';
import { Avatar, Brand } from './components/ui';

const codeFromUrl = () => {
  const code = cleanRoomCode(new URLSearchParams(window.location.search).get('room'));
  return code.length === ROOM_CODE_LENGTH ? code : '';
};

const setUrlRoom = (code) => {
  window.history.replaceState(null, '', code ? `/?room=${code}` : '/');
};

export default function App() {
  const [phase, setPhase] = useState(() => (hasSession() ? 'boot' : 'auth')); // boot | auth | home
  const [bootError, setBootError] = useState('');
  const [user, setUser] = useState('');
  const [roomCode, setRoomCode] = useState(''); // empty: listening on your own
  const [seed, setSeed] = useState(null); // what was playing when a room was started, to carry over
  const [invite, setInvite] = useState(codeFromUrl); // room to enter once signed in
  const [togetherOpen, setTogetherOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const toastId = useRef(0);

  const toast = useCallback((text, kind = 'info') => {
    const id = ++toastId.current;
    setToasts(list => [...list.slice(-2), { id, text, kind }]);
    setTimeout(() => setToasts(list => list.filter(t => t.id !== id)), 3500);
  }, []);

  const signedOut = useCallback((message) => {
    setSession(null);
    setUser('');
    setRoomCode('');
    setTogetherOpen(false);
    setPhase('auth');
    if (message) toast(message, 'error');
  }, [toast]);
  const onUnauthorized = useCallback(() => signedOut('Your session expired. Please sign in again.'), [signedOut]);

  const home = phase === 'home';
  const library = useLibrary(home, onUnauthorized);
  const playlists = usePlaylists(home, onUnauthorized, (shared) => {
    toast(`${shared.from} shared the playlist "${shared.name}" with you`);
    playMessageSound();
  });
  const friends = useFriends(home, onUnauthorized, (name) => {
    toast(`${name} sent you a friend request`);
    playMessageSound();
  }, () => playMessageSound());

  /** Enters a room after confirming it exists. Throws ApiError for the caller to display. */
  const enterRoom = useCallback(async (code, carry = null) => {
    const info = await api(`/rooms/${code}`);
    setSeed(carry);
    setRoomCode(info.code);
    setUrlRoom(info.code);
    setInvite('');
    setTogetherOpen(false);
    setPhase('home');
  }, []);

  /** Lands a signed-in user in the invited room if there is one, otherwise in their own player. */
  const land = useCallback(async (code) => {
    if (code) {
      try {
        await enterRoom(code);
        return;
      } catch (e) {
        if (e.status === 401) { onUnauthorized(); return; }
        toast(e.status === 404 ? 'That room has ended. Start a new one!' : e.message, 'error');
        setInvite('');
        setUrlRoom('');
      }
    }
    setPhase('home');
  }, [enterRoom, onUnauthorized, toast]);

  const boot = useCallback(async () => {
    if (!hasSession()) return; // signed out: the auth screen is already showing
    try {
      const me = await api('/auth/me');
      setUser(me.username);
      await land(codeFromUrl());
    } catch (e) {
      if (e.status === 401) { setSession(null); setPhase('auth'); }
      else setBootError(e.message);
    }
  }, [land]);

  // Runs once on load; state is only set after the session check resolves.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { boot(); }, []);

  const onSignedIn = async (login) => {
    setSession(login);
    setUser(login.username);
    await land(invite);
  };

  /** @param carry { songId, position, playing } of the solo player, so the room continues the same song */
  const createRoom = async (carry) => {
    const info = await api('/rooms', { method: 'POST' });
    await enterRoom(info.code, carry);
  };

  const leaveRoom = useCallback(() => {
    setRoomCode('');
    setSeed(null);
    setUrlRoom('');
  }, []);

  const roomGone = useCallback(() => {
    leaveRoom();
    toast('That room has ended.', 'error');
  }, [leaveRoom, toast]);

  const joinFriend = useCallback(async (code) => {
    try {
      await enterRoom(code);
    } catch (e) {
      if (e.status === 401) onUnauthorized();
      else toast(e.status === 404 ? 'That room has ended.' : e.message, 'error');
    }
  }, [enterRoom, onUnauthorized, toast]);

  /** Invites a friend to listen. From the solo player this first starts a room with the current song. */
  const inviteFriend = async (name) => {
    try {
      let code = roomCode;
      if (!code) {
        const info = await api('/rooms', { method: 'POST' });
        code = info.code;
        await enterRoom(code, carryRef.current?.());
      }
      await friends.invite(name, code);
      toast(`Invited ${name} to listen with you`);
    } catch (e) {
      if (e.status === 401) onUnauthorized();
      else toast(e.message, 'error');
    }
  };

  const acceptInvite = (invite) => {
    friends.dismissInvite(invite.from);
    joinFriend(invite.room);
  };

  const signOut = async () => {
    await endSession();
    setUrlRoom('');
    signedOut();
  };

  const carryRef = useRef(null); // filled by the solo player: () => what is playing now

  // The newest invitation to a room other than the one this user is already in.
  const pendingInvite = friends.invites.find(invite => invite.room !== roomCode);

  let screen;
  if (phase === 'boot') {
    screen = (
      <div className="center-screen">
        <div className="boot">
          <Brand />
          {bootError ? (
            <>
              <p className="error" role="alert">{bootError}</p>
              <button className="btn btn-secondary" onClick={() => { setBootError(''); boot(); }}>Try again</button>
            </>
          ) : <span className="loadbar" role="status" aria-label="Loading" />}
        </div>
      </div>
    );
  } else if (phase === 'auth') {
    screen = <AuthScreen inviteCode={invite} onSignedIn={onSignedIn} />;
  } else {
    const shared = { user, library, playlists, friends, toast, onJoinFriend: joinFriend, onInviteFriend: inviteFriend, onSignOut: signOut };
    screen = roomCode ? (
      <RoomScreen key={roomCode} code={roomCode} seed={seed} {...shared}
        onLeave={leaveRoom} onGone={roomGone} onUnauthorized={onUnauthorized} />
    ) : (
      <SoloScreen key="solo" {...shared} carryRef={carryRef} onTogether={() => setTogetherOpen(true)} />
    );
  }

  return (
    <>
      {screen}
      {togetherOpen && home && (
        <TogetherDialog onCreate={() => createRoom(carryRef.current?.())} onJoin={enterRoom}
          onClose={() => setTogetherOpen(false)} />
      )}
      {home && pendingInvite && (
        <div className="invite-card" role="alertdialog" aria-label={`${pendingInvite.from} invited you to listen together`}>
          <Avatar name={pendingInvite.from} size={40} />
          <div className="invite-card-text">
            <strong>{pendingInvite.from}</strong>
            <span>invited you to listen together</span>
          </div>
          <button className="btn btn-primary btn-small" onClick={() => acceptInvite(pendingInvite)}>Join</button>
          <button className="btn btn-ghost btn-small" onClick={() => friends.dismissInvite(pendingInvite.from)}>Not now</button>
        </div>
      )}
      <div className="toasts" aria-live="polite">
        {toasts.map(t => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
      </div>
    </>
  );
}
