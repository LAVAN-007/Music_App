import { useState } from 'react';
import { api } from '../lib/api';
import { Brand, Icon, Spinner } from './ui';

export default function AuthScreen({ inviteCode, onSignedIn }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isRegister = mode === 'register';

  const switchMode = (next) => { setMode(next); setError(''); };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!username.trim() || !password) { setError('Enter a username and password'); return; }
    setBusy(true);
    setError('');
    try {
      const data = await api(isRegister ? '/auth/register' : '/auth/login', {
        method: 'POST',
        body: { username: username.trim(), password },
      });
      onSignedIn(data);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="center-screen">
      <div className="glow glow-a" /><div className="glow glow-b" />
      <main className="card auth-card">
        <Brand />
        <h1 className="auth-title">Listen together, perfectly in sync.</h1>
        <p className="muted">Start a room, share the code, and everyone hears the same beat.</p>

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
            <input className="input" name="username" autoComplete="username" autoCapitalize="none" autoFocus
              maxLength={20} value={username} onChange={e => { setUsername(e.target.value); setError(''); }} />
          </label>
          <label className="field">
            <span>Password</span>
            <span className="input-wrap">
              <input className="input" name="password" type={showPassword ? 'text' : 'password'}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                value={password} onChange={e => { setPassword(e.target.value); setError(''); }} />
              <button type="button" className="input-action" onClick={() => setShowPassword(s => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>
                <Icon name="eye" size={18} />
              </button>
            </span>
          </label>
          {isRegister && <p className="hint">3–20 characters for the username, at least 6 for the password.</p>}
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            {busy ? <Spinner /> : isRegister ? 'Create account' : 'Sign in'}
          </button>
        </form>
      </main>
    </div>
  );
}
