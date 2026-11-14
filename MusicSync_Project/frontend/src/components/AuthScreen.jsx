import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Bars, Brand, Icon, Spinner } from './ui';

const USERNAME = /^[A-Za-z0-9][A-Za-z0-9 _.-]{1,18}[A-Za-z0-9]$/;
const MIN_PASSWORD = 6;

/** 0 (too short) to 4 (strong): length first, then variety. */
function strength(password) {
  if (password.length < MIN_PASSWORD) return 0;
  let kinds = 0;
  for (const re of [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/]) if (re.test(password)) kinds++;
  let score = 1;
  if (password.length >= 8 && kinds >= 2) score = 2;
  if (password.length >= 10 && kinds >= 3) score = 3;
  if (password.length >= 12 && kinds >= 3) score = 4;
  return score;
}
const STRENGTH_LABEL = ['Too short', 'Okay', 'Good', 'Strong', 'Very strong'];

export default function AuthScreen({ inviteCode, onSignedIn }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(null); // { name, available, reason }: the server's word on a username
  const isRegister = mode === 'register';

  const name = username.trim().replace(/\s+/g, ' ');
  const nameValid = USERNAME.test(name);
  const score = strength(password);

  // While signing up, ask the server whether the name is free as soon as it looks valid.
  useEffect(() => {
    if (!isRegister || !nameValid) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await api(`/auth/available?username=${encodeURIComponent(name)}`);
        if (!cancelled) setChecked({ name, ...result });
      } catch { /* the form still works; the server checks again on submit */ }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [isRegister, nameValid, name]);

  const verdict = checked?.name === name ? checked : null;
  let nameHint = null;
  if (isRegister && name) {
    if (!nameValid) nameHint = { kind: 'bad', text: '3–20 characters: letters, numbers, spaces, . _ or -' };
    else if (!verdict) nameHint = { kind: 'wait', text: 'Checking…' };
    else if (verdict.available) nameHint = { kind: 'good', text: `${name} is available` };
    else nameHint = { kind: 'bad', text: verdict.reason };
  }
  const canSubmit = isRegister ? nameValid && score > 0 && verdict?.available !== false : !!name && !!password;

  const switchMode = (next) => { setMode(next); setError(''); };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!name || !password) { setError('Enter a username and password'); return; }
    if (isRegister && !nameValid) { setError('Pick a username with 3–20 letters, numbers, spaces, . _ or -'); return; }
    if (isRegister && score === 0) { setError(`Use at least ${MIN_PASSWORD} characters for the password`); return; }
    setBusy(true);
    setError('');
    try {
      const data = await api(isRegister ? '/auth/register' : '/auth/login', {
        method: 'POST',
        body: { username: name, password },
      });
      await onSignedIn(data);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const onKey = (e) => setCapsLock(!!e.getModifierState?.('CapsLock'));

  return (
    <div className="auth">
      <div className="glow glow-a" /><div className="glow glow-b" />
      <section className="auth-hero">
        <Brand />
        <h1 className="auth-title">Your music, <span className="hl">alone or perfectly in sync.</span></h1>
        <p className="auth-lead">Play anything on your own, keep your playlists forever, and start a room when you want friends to hear the same beat at the same second.</p>
        <ul className="auth-points">
          <li><Icon name="check" size={16} />Listen straight away, no room needed</li>
          <li><Icon name="check" size={16} />Build playlists that stay with your account</li>
          <li><Icon name="check" size={16} />Add friends and join them in one tap</li>
        </ul>
        <Bars />
      </section>

      <main className="card auth-card">
        <h2>{isRegister ? 'Create your account' : 'Welcome back'}</h2>
        <p className="muted">{isRegister ? 'It takes a few seconds. No email needed.' : 'Sign in to pick up where you left off.'}</p>

        {inviteCode && (
          <div className="invite-banner">
            <Icon name="userAdd" size={18} />
            <span>You're invited to room <strong>{inviteCode}</strong>. Sign in to join.</span>
          </div>
        )}

        <div className="segmented" role="tablist">
          <button type="button" role="tab" aria-selected={!isRegister} className={!isRegister ? 'active' : ''}
            onClick={() => switchMode('login')}>Sign in</button>
          <button type="button" role="tab" aria-selected={isRegister} className={isRegister ? 'active' : ''}
            onClick={() => switchMode('register')}>Create account</button>
        </div>

        <form onSubmit={submit} noValidate>
          <label className="field">
            <span>Username</span>
            <input className={`input ${nameHint?.kind === 'bad' ? 'invalid' : ''}`} name="username" autoComplete="username"
              autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus maxLength={20}
              aria-describedby="name-hint" aria-invalid={nameHint?.kind === 'bad' || undefined}
              value={username} onChange={e => { setUsername(e.target.value); setError(''); }} />
            {nameHint && (
              <span id="name-hint" className={`field-note ${nameHint.kind}`} role="status">
                {nameHint.kind === 'good' && <Icon name="check" size={14} />}{nameHint.text}
              </span>
            )}
          </label>
          <label className="field">
            <span>Password</span>
            <span className="input-wrap">
              <input className="input" name="password" type={showPassword ? 'text' : 'password'}
                autoComplete={isRegister ? 'new-password' : 'current-password'} aria-describedby="password-hint"
                value={password} onChange={e => { setPassword(e.target.value); setError(''); }}
                onKeyDown={onKey} onKeyUp={onKey} onBlur={() => setCapsLock(false)} />
              <button type="button" className="input-action" onClick={() => setShowPassword(s => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>
                <Icon name={showPassword ? 'eyeOff' : 'eye'} size={18} />
              </button>
            </span>
            {isRegister && password && (
              <span id="password-hint" className="strength" data-score={score} role="status">
                <span className="strength-bar"><i /><i /><i /><i /></span>
                <span>{score === 0 ? `At least ${MIN_PASSWORD} characters` : STRENGTH_LABEL[score]}</span>
              </span>
            )}
            {capsLock && !showPassword && <span className="field-note warn">Caps Lock is on</span>}
          </label>
          {isRegister && !password && <p className="hint">At least {MIN_PASSWORD} characters. Longer with numbers or symbols is stronger.</p>}
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn btn-primary btn-block" type="submit" disabled={busy || !canSubmit}>
            {busy ? <Spinner /> : isRegister ? 'Create account' : 'Sign in'}
          </button>
          <p className="muted small auth-foot">
            {isRegister ? 'Already have an account? ' : 'New here? '}
            <button type="button" className="text-link" onClick={() => switchMode(isRegister ? 'login' : 'register')}>
              {isRegister ? 'Sign in' : 'Create an account'}
            </button>
            {' · '}You stay signed in on this device until you sign out.
          </p>
        </form>
      </main>
    </div>
  );
}
