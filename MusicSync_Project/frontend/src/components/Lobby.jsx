import { useState } from 'react';
import { ROOM_CODE_LENGTH, cleanRoomCode } from '../lib/util';
import { Avatar, Brand, Icon, Spinner } from './ui';

export default function Lobby({ user, onCreate, onJoin, onSignOut }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(''); // '' | 'create' | 'join'
  const [error, setError] = useState('');

  const run = async (kind, action) => {
    if (busy) return;
    setBusy(kind);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e.message);
      setBusy('');
    }
  };

  const join = (e) => {
    e.preventDefault();
    if (code.length !== ROOM_CODE_LENGTH) { setError(`Room codes are ${ROOM_CODE_LENGTH} characters`); return; }
    run('join', () => onJoin(code));
  };

  return (
    <div className="lobby">
      <div className="glow glow-a" /><div className="glow glow-b" />
      <header className="lobby-bar">
        <Brand />
        <div className="lobby-user">
          <Avatar name={user} size={30} />
          <span className="lobby-username">{user}</span>
          <button className="btn btn-ghost btn-small" onClick={onSignOut}>
            <Icon name="logout" size={16} /> Sign out
          </button>
        </div>
      </header>

      <main className="lobby-main">
        <span className="eyebrow"><i className="dot" />Signed in and ready</span>
        <h1>Hi {user}, ready to <span className="hl">listen</span>?</h1>
        <p className="muted lobby-sub">Rooms keep everyone on the same song, at the same second.</p>

        <div className="lobby-cards">
          <section className="card lobby-card">
            <span className="card-icon"><Icon name="music" size={22} /></span>
            <h2>Start a room</h2>
            <p className="muted">You'll get a code and a link to share. Anyone in the room can pick songs.</p>
            <button className="btn btn-primary btn-block" onClick={() => run('create', onCreate)} disabled={!!busy}>
              {busy === 'create' ? <Spinner /> : 'Start a room'}
            </button>
          </section>

          <section className="card lobby-card alt">
            <span className="card-icon alt"><Icon name="userAdd" size={22} /></span>
            <h2>Join a room</h2>
            <p className="muted">Enter the 6-character code a friend shared, or paste their invite link.</p>
            <form onSubmit={join} className="join-form">
              <input className="input code-input" aria-label="Room code" placeholder="ABC234" inputMode="text"
                autoCapitalize="characters" autoComplete="off" spellCheck={false}
                value={code} onChange={e => { setCode(cleanRoomCode(e.target.value)); setError(''); }} />
              <button className="btn btn-secondary" type="submit" disabled={!!busy || code.length !== ROOM_CODE_LENGTH}>
                {busy === 'join' ? <Spinner /> : 'Join'}
              </button>
            </form>
          </section>
        </div>
        {error && <p className="error lobby-error" role="alert">{error}</p>}

        <ol className="steps">
          <li><b>1</b><div><strong>Start a room</strong><span>You get a 6-character code and an invite link.</span></div></li>
          <li><b>2</b><div><strong>Share it</strong><span>Friends sign in and land straight in your room.</span></div></li>
          <li><b>3</b><div><strong>Press play</strong><span>Everyone hears the same second of the same song.</span></div></li>
        </ol>
      </main>
    </div>
  );
}
