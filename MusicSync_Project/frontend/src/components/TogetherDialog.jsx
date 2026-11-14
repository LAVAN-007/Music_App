import { useEffect, useRef, useState } from 'react';
import { ROOM_CODE_LENGTH, cleanRoomCode } from '../lib/util';
import { Icon, Spinner } from './ui';

/** Start a room or join one with a code. */
export default function TogetherDialog({ onCreate, onJoin, onClose }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(''); // '' | 'create' | 'join'
  const [error, setError] = useState('');
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
    <div className="overlay" onClick={onClose}>
      <div className="card dialog" role="dialog" aria-modal="true" aria-labelledby="together-title" onClick={e => e.stopPropagation()}>
        <div className="dialog-head">
          <h2 id="together-title">Listen together</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close" ref={closeRef}><Icon name="close" /></button>
        </div>
        <p className="muted">A room keeps everyone on the same song, at the same second. Whatever you're playing now comes with you.</p>

        <button className="btn btn-primary btn-block" onClick={() => run('create', onCreate)} disabled={!!busy}>
          {busy === 'create' ? <Spinner /> : <><Icon name="music" size={18} /> Start a room</>}
        </button>

        <div className="or"><span>or join a friend's room</span></div>

        <form onSubmit={join} className="join-form">
          <input className="input code-input" aria-label="Room code" placeholder="ABC234" inputMode="text"
            autoCapitalize="characters" autoComplete="off" spellCheck={false}
            value={code} onChange={e => { setCode(cleanRoomCode(e.target.value)); setError(''); }} />
          <button className="btn btn-secondary" type="submit" disabled={!!busy || code.length !== ROOM_CODE_LENGTH}>
            {busy === 'join' ? <Spinner /> : 'Join'}
          </button>
        </form>
        <p className="muted small">Enter the 6-character code, or paste an invite link.</p>
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
