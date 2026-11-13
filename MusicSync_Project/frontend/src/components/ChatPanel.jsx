import { useEffect, useRef, useState } from 'react';
import { Avatar, Icon } from './ui';

const timeOf = (at) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export default function ChatPanel({ messages, me, onSend, disabled }) {
  const [text, setText] = useState('');
  const listRef = useRef(null);
  const stick = useRef(true); // only auto-scroll if the reader is already at the bottom

  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const el = listRef.current;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  const submit = (e) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    stick.current = true;
    if (onSend(value)) setText('');
  };

  return (
    <div className="chat">
      <div className="chat-list" ref={listRef} onScroll={onScroll}>
        {messages.length === 0 && (
          <div className="empty">
            <Icon name="chat" size={30} />
            <p>No messages yet</p>
            <p className="muted small">Say hi while the music plays.</p>
          </div>
        )}
        {messages.map((m, i) => {
          if (m.system) return <p key={m.id} className="chat-notice">{m.text}</p>;
          const mine = m.username === me;
          const prev = messages[i - 1];
          const grouped = prev && !prev.system && prev.username === m.username && m.at - prev.at < 120000;
          return (
            <div key={m.id} className={`msg ${mine ? 'mine' : ''} ${grouped ? 'grouped' : ''}`}>
              {!mine && <span className="msg-avatar">{!grouped && <Avatar name={m.username} size={26} />}</span>}
              <div className="msg-body">
                {!mine && !grouped && <span className="msg-name">{m.username}</span>}
                <span className="bubble" title={timeOf(m.at)}>{m.text}</span>
                {!grouped && <span className="msg-time">{timeOf(m.at)}</span>}
              </div>
            </div>
          );
        })}
      </div>
      <form className="chat-form" onSubmit={submit}>
        <input className="input" placeholder={disabled ? 'Reconnecting…' : 'Message the room'} aria-label="Message"
          maxLength={500} value={text} onChange={e => setText(e.target.value)} disabled={disabled} />
        <button className="btn btn-primary btn-icon" type="submit" disabled={disabled || !text.trim()} aria-label="Send">
          <Icon name="send" size={18} />
        </button>
      </form>
    </div>
  );
}
