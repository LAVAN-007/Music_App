import { useEffect, useRef, useState } from 'react';
import { copyText, inviteLink } from '../lib/util';
import { Avatar, Icon } from './ui';

export default function InviteDialog({ code, users, me, onClose }) {
  const [copied, setCopied] = useState('');
  const closeRef = useRef(null);
  const link = inviteLink(code);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copy = async (what, text) => {
    if (await copyText(text)) {
      setCopied(what);
      setTimeout(() => setCopied(c => (c === what ? '' : c)), 1800);
    }
  };

  const share = () => {
    navigator.share({ title: 'MusicSync', text: `Listen with me on MusicSync — room ${code}`, url: link }).catch(() => {});
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="card dialog" role="dialog" aria-modal="true" aria-labelledby="invite-title" onClick={e => e.stopPropagation()}>
        <div className="dialog-head">
          <h2 id="invite-title">Invite friends</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close" ref={closeRef}><Icon name="close" /></button>
        </div>
        <p className="muted">Share the code or the link. Friends sign in and land straight in this room.</p>

        <button className="code-display" onClick={() => copy('code', code)} title="Copy code">
          <span className="code-chars">{code}</span>
          <span className="code-hint"><Icon name={copied === 'code' ? 'check' : 'copy'} size={15} />
            {copied === 'code' ? 'Copied' : 'Copy code'}</span>
        </button>

        <div className="link-row">
          <input className="input" readOnly value={link} aria-label="Invite link" onFocus={e => e.target.select()} />
          <button className="btn btn-primary" onClick={() => copy('link', link)}>
            <Icon name={copied === 'link' ? 'check' : 'copy'} size={16} /> {copied === 'link' ? 'Copied' : 'Copy link'}
          </button>
        </div>
        {typeof navigator.share === 'function' && (
          <button className="btn btn-secondary btn-block" onClick={share}><Icon name="share" size={16} /> Share…</button>
        )}

        <h3 className="section-label">In this room · {users.length}</h3>
        <ul className="people">
          {users.map(name => (
            <li key={name}><Avatar name={name} size={30} /><span>{name}{name === me ? ' (you)' : ''}</span></li>
          ))}
        </ul>
      </div>
    </div>
  );
}
