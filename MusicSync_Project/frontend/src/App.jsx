import { useCallback, useEffect, useRef, useState } from 'react';
import { api, getToken, setToken } from './lib/api';
import { cleanRoomCode, ROOM_CODE_LENGTH } from './lib/util';
import { useLibrary } from './hooks/useLibrary';
import AuthScreen from './components/AuthScreen';
import Lobby from './components/Lobby';
import Room from './components/Room';
import { Brand, Spinner } from './components/ui';

const codeFromUrl = () => {
  const code = cleanRoomCode(new URLSearchParams(window.location.search).get('room'));
  return code.length === ROOM_CODE_LENGTH ? code : '';
};

const setUrlRoom = (code) => {
  window.history.replaceState(null, '', code ? `/?room=${code}` : '/');
};

export default function App() {
  const [phase, setPhase] = useState(() => (getToken() ? 'boot' : 'auth')); // boot | auth | lobby | room
  const [bootError, setBootError] = useState('');
  const [user, setUser] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [invite, setInvite] = useState(codeFromUrl); // room to enter once signed in
  const [toasts, setToasts] = useState([]);
  const toastId = useRef(0);

  const toast = useCallback((text, kind = 'info') => {
    const id = ++toastId.current;
    setToasts(list => [...list.slice(-2), { id, text, kind }]);
    setTimeout(() => setToasts(list => list.filter(t => t.id !== id)), 3500);
  }, []);

  const signedOut = useCallback((message) => {
    setToken(null);
    setUser('');
    setRoomCode('');
    setPhase('auth');
    if (message) toast(message, 'error');
  }, [toast]);
  const onUnauthorized = useCallback(() => signedOut('Your session expired. Please sign in again.'), [signedOut]);

  const library = useLibrary(phase === 'lobby' || phase === 'room', onUnauthorized);

  /** Enters a room after confirming it exists. Throws ApiError for the caller to display. */
  const enterRoom = useCallback(async (code) => {
    const info = await api(`/rooms/${code}`);
    setRoomCode(info.code);
    setUrlRoom(info.code);
    setInvite('');
    setPhase('room');
  }, []);

  /** Lands a signed-in user in the invited room if there is one, otherwise the lobby. */
  const land = useCallback(async (code) => {
    if (code) {
      try {
        await enterRoom(code);
        return;
      } catch (e) {
        if (e.status === 401) { onUnauthorized(); return; }
        toast(e.status === 404 ? "That room has ended. Start a new one!" : e.message, 'error');
        setInvite('');
        setUrlRoom('');
      }
    }
    setPhase('lobby');
  }, [enterRoom, onUnauthorized, toast]);

  const boot = useCallback(async () => {
    if (!getToken()) return; // signed out: the auth screen is already showing
    try {
      const me = await api('/auth/me');
      setUser(me.username);
      await land(codeFromUrl());
    } catch (e) {
      if (e.status === 401) { setToken(null); setPhase('auth'); }
      else setBootError(e.message);
    }
  }, [land]);

  // Runs once on load; state is only set after the session check resolves.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { boot(); }, []);

  const onSignedIn = async ({ token, username }) => {
    setToken(token);
    setUser(username);
    await land(invite);
  };

  const createRoom = async () => {
    const info = await api('/rooms', { method: 'POST' });
    await enterRoom(info.code);
  };

  const leaveRoom = useCallback(() => {
    setRoomCode('');
    setUrlRoom('');
    setPhase('lobby');
  }, []);

  const roomGone = useCallback(() => {
    leaveRoom();
    toast('That room has ended.', 'error');
  }, [leaveRoom, toast]);

  const signOut = async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* the token is dropped locally either way */ }
    setUrlRoom('');
    signedOut();
  };

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
          ) : <Spinner />}
        </div>
      </div>
    );
  } else if (phase === 'auth') {
    screen = <AuthScreen inviteCode={invite} onSignedIn={onSignedIn} />;
  } else if (phase === 'lobby') {
    screen = <Lobby user={user} onCreate={createRoom} onJoin={enterRoom} onSignOut={signOut} />;
  } else {
    screen = (
      <Room key={roomCode} code={roomCode} user={user} library={library} toast={toast}
        onLeave={leaveRoom} onGone={roomGone} onUnauthorized={onUnauthorized} />
    );
  }

  return (
    <>
      {screen}
      <div className="toasts" aria-live="polite">
        {toasts.map(t => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
      </div>
    </>
  );
}
