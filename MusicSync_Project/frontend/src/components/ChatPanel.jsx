import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { prepareImage } from '../lib/image';
import { Avatar, Icon, Spinner } from './ui';

const timeOf = (at) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const mediaUrl = (id) => `/api/media/${id}`;

/** The quoted message shown above a reply and above the input while replying. */
function Quote({ username, text, image, me }) {
  return (
    <>
      <span className="quote-name">{username === me ? 'You' : username}</span>
      <span className="quote-text">{image && <Icon name="image" size={14} />}{text || (image ? 'Photo' : '')}</span>
    </>
  );
}

/**
 * Room chat. A message can answer another one (tap the reply arrow, or double-click the message)
 * and can carry a picture (the picture button, or paste one into the message box).
 *
 * @param onSend ({ text, replyTo, image }) => boolean: false if it could not be sent
 */
export default function ChatPanel({ code, messages, me, onSend, disabled, toast }) {
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null); // the message being answered
  const [photo, setPhoto] = useState(null); // { blob, url }: picture waiting to be sent
  const [sending, setSending] = useState(false);
  const [viewer, setViewer] = useState(null); // picture opened full size
  const [flash, setFlash] = useState(null); // id of the message just jumped to
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const stick = useRef(true); // only auto-scroll if the reader is already at the bottom
  const photoUrl = photo?.url;

  const toBottom = () => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  };
  useEffect(toBottom, [messages, replyTo, photoUrl]);
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);
  useEffect(() => {
    if (!viewer) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setViewer(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewer]);

  const onScroll = () => {
    const el = listRef.current;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  const reply = (message) => { setReplyTo(message); inputRef.current?.focus(); };

  const jumpTo = (id) => {
    const el = listRef.current?.querySelector(`[data-id="${id}"]`);
    if (!el) { toast?.('That message is no longer in the chat'); return; }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setFlash(id);
    setTimeout(() => setFlash(f => (f === id ? null : f)), 1400);
  };

  const attach = async (file) => {
    if (!file) return;
    try {
      const blob = await prepareImage(file);
      setPhoto({ blob, url: URL.createObjectURL(blob) });
      inputRef.current?.focus();
    } catch (e) {
      toast?.(e.message, 'error');
    }
  };
  const onPaste = (e) => {
    const file = [...(e.clipboardData?.files || [])].find(f => f.type.startsWith('image/'));
    if (file) { e.preventDefault(); attach(file); }
  };

  const submit = async (e) => {
    e.preventDefault();
    const value = text.trim();
    if ((!value && !photo) || sending) return;
    stick.current = true;
    let image;
    if (photo) {
      setSending(true);
      try {
        image = (await api(`/rooms/${code}/images`, { method: 'POST', raw: photo.blob })).id;
      } catch (err) {
        toast?.(err.message, 'error');
        setSending(false);
        return;
      }
      setSending(false);
    }
    if (onSend({ text: value, replyTo: replyTo?.id, image })) {
      setText('');
      setReplyTo(null);
      setPhoto(null);
    }
  };

  return (
    <div className="chat">
      <div className="chat-list" ref={listRef} onScroll={onScroll}>
        {messages.length === 0 && (
          <div className="empty">
            <Icon name="chat" size={30} />
            <p>No messages yet</p>
            <p className="muted small">Say hi while the music plays. You can reply to a message and send pictures.</p>
          </div>
        )}
        {messages.map((m, i) => {
          if (m.system) return <p key={m.id} className="chat-notice">{m.text}</p>;
          const mine = m.username === me;
          const prev = messages[i - 1];
          const grouped = prev && !prev.system && prev.username === m.username && m.at - prev.at < 120000 && !m.reply;
          return (
            <div key={m.id} data-id={m.id}
              className={`msg ${mine ? 'mine' : ''} ${grouped ? 'grouped' : ''} ${flash === m.id ? 'flash' : ''}`}>
              {!mine && <span className="msg-avatar">{!grouped && <Avatar name={m.username} size={26} />}</span>}
              <div className="msg-body">
                {!mine && !grouped && <span className="msg-name">{m.username}</span>}
                <div className="msg-line">
                  <div className={`bubble ${m.image ? 'has-image' : ''}`} title={timeOf(m.at)} onDoubleClick={() => reply(m)}>
                    {m.reply && (
                      <button type="button" className="quote" onClick={() => jumpTo(m.reply.id)}
                        aria-label={`In reply to ${m.reply.username}: ${m.reply.text || 'Photo'}`}>
                        <Quote {...m.reply} me={me} />
                      </button>
                    )}
                    {m.image && (
                      <button type="button" className="msg-image" onClick={() => setViewer(mediaUrl(m.image))}
                        aria-label={`Open the picture from ${m.username}`}>
                        <img src={mediaUrl(m.image)} alt={`Sent by ${m.username}`} loading="lazy" onLoad={toBottom} />
                      </button>
                    )}
                    {m.text && <span className="msg-text">{m.text}</span>}
                  </div>
                  <button type="button" className="msg-reply" onClick={() => reply(m)} aria-label={`Reply to ${m.username}`}
                    title="Reply">
                    <Icon name="reply" size={16} />
                  </button>
                </div>
                {!grouped && <span className="msg-time">{timeOf(m.at)}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {(replyTo || photo) && (
        <div className="compose-extra">
          {replyTo && (
            <div className="compose-reply">
              <Icon name="reply" size={16} />
              <div className="quote static"><Quote username={replyTo.username} text={replyTo.text} image={!!replyTo.image} me={me} /></div>
              <button type="button" className="icon-btn small" onClick={() => setReplyTo(null)} aria-label="Cancel reply">
                <Icon name="close" size={16} />
              </button>
            </div>
          )}
          {photo && (
            <div className="compose-photo">
              <img src={photo.url} alt="Picture to send" />
              <span className="muted small">{sending ? 'Sending…' : `Picture ready · ${Math.max(1, Math.round(photo.blob.size / 1024))} KB`}</span>
              <button type="button" className="icon-btn small" onClick={() => setPhoto(null)} disabled={sending} aria-label="Remove picture">
                <Icon name="close" size={16} />
              </button>
            </div>
          )}
        </div>
      )}

      <form className="chat-form" onSubmit={submit}>
        <input ref={fileRef} type="file" accept="image/*" hidden
          onChange={e => { attach(e.target.files?.[0]); e.target.value = ''; }} />
        <button type="button" className="icon-btn" onClick={() => fileRef.current?.click()} disabled={disabled || sending}
          aria-label="Send a picture" title="Send a picture">
          <Icon name="image" size={20} />
        </button>
        <input className="input" ref={inputRef} aria-label="Message" maxLength={500} value={text} disabled={disabled}
          placeholder={disabled ? 'Reconnecting…' : photo ? 'Add a caption' : replyTo ? 'Write a reply' : 'Message the room'}
          onChange={e => setText(e.target.value)} onPaste={onPaste}
          onKeyDown={e => { if (e.key === 'Escape' && replyTo) setReplyTo(null); }} />
        <button className="btn btn-primary btn-icon" type="submit" disabled={disabled || sending || (!text.trim() && !photo)}
          aria-label="Send">
          {sending ? <Spinner /> : <Icon name="send" size={18} />}
        </button>
      </form>

      {viewer && (
        <div className="overlay viewer" onClick={() => setViewer(null)} role="dialog" aria-modal="true" aria-label="Picture">
          <img src={viewer} alt="" onClick={e => e.stopPropagation()} />
          <button className="icon-btn viewer-close" onClick={() => setViewer(null)} aria-label="Close picture"><Icon name="close" /></button>
        </div>
      )}
    </div>
  );
}
