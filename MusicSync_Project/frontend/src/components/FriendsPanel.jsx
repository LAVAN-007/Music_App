import { useEffect, useState } from 'react';
import { Avatar, Icon, Spinner } from './ui';

/** Friends list, friend requests and a search to add people by username. */
export default function FriendsPanel({ friends, currentRoom, onJoin, toast }) {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState(null); // null: not searched
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState('');
  const q = query.trim();
  const { search } = friends;

  useEffect(() => {
    if (q.length < 2) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const result = await search(q);
        if (!cancelled) setFound(result);
      } catch { if (!cancelled) setFound([]); }
      if (!cancelled) setSearching(false);
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [q, search]);

  const run = async (name, action, done) => {
    if (busy) return;
    setBusy(name);
    try {
      const result = await action(name);
      if (done) toast(done(result));
      if (q.length >= 2) setFound(await search(q));
    } catch (e) {
      toast(e.message, 'error');
    }
    setBusy('');
  };
  const add = (name) => run(name, friends.add,
    (r) => (r.status === 'friend' ? `You and ${name} are now friends` : `Friend request sent to ${name}`));
  const accept = (name) => run(name, friends.accept, () => `You and ${name} are now friends`);
  const remove = (name) => run(name, friends.remove);

  const showResults = q.length >= 2;
  return (
    <div className="friends">
      <div className="search">
        <Icon name="search" size={18} />
        <input type="search" placeholder="Find people by username" aria-label="Find people by username"
          value={query} onChange={e => setQuery(e.target.value)} maxLength={20} />
        {query && (
          <button className="icon-btn small" onClick={() => setQuery('')} aria-label="Clear search">
            <Icon name="close" size={16} />
          </button>
        )}
      </div>

      <div className="friends-list">
        {showResults ? (
          <>
            <h3 className="section-label">People</h3>
            {found === null || (searching && found.length === 0) ? <div className="empty"><Spinner /></div>
              : found.length === 0 ? <p className="muted small friends-note">Nobody found for "{q}".</p>
              : found.map(p => (
                <div key={p.username} className="person">
                  <Avatar name={p.username} size={36} />
                  <span className="person-text"><strong>{p.username}</strong>
                    <span>{p.relation === 'friend' ? 'Already your friend' : p.relation === 'outgoing' ? 'Request sent'
                      : p.relation === 'incoming' ? 'Wants to be your friend' : 'On MusicSync'}</span></span>
                  {p.relation === 'none' && (
                    <button className="btn btn-primary btn-small" disabled={busy === p.username} onClick={() => add(p.username)}>
                      <Icon name="userAdd" size={15} /> Add
                    </button>
                  )}
                  {p.relation === 'incoming' && (
                    <button className="btn btn-primary btn-small" disabled={busy === p.username} onClick={() => accept(p.username)}>Accept</button>
                  )}
                  {p.relation === 'outgoing' && (
                    <button className="btn btn-ghost btn-small" disabled={busy === p.username} onClick={() => remove(p.username)}>Cancel</button>
                  )}
                </div>
              ))}
          </>
        ) : (
          <>
            {friends.incoming.length > 0 && (
              <>
                <h3 className="section-label">Friend requests · {friends.incoming.length}</h3>
                {friends.incoming.map(name => (
                  <div key={name} className="person">
                    <Avatar name={name} size={36} />
                    <span className="person-text"><strong>{name}</strong><span>Wants to be your friend</span></span>
                    <button className="btn btn-primary btn-small" disabled={busy === name} onClick={() => accept(name)}>Accept</button>
                    <button className="icon-btn small" disabled={busy === name} onClick={() => remove(name)} aria-label={`Decline ${name}`}>
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                ))}
              </>
            )}

            <h3 className="section-label">Friends{friends.friends.length > 0 ? ` · ${friends.friends.length}` : ''}</h3>
            {friends.friends.length === 0 ? (
              <div className="empty">
                <Icon name="people" size={30} />
                <p>No friends yet</p>
                <p className="muted small">Search for a username above to send a friend request. You'll see when friends are listening and can join them in one tap.</p>
              </div>
            ) : friends.friends.map(f => (
              <div key={f.username} className="person">
                <span className={`person-avatar ${f.online ? 'online' : ''}`}><Avatar name={f.username} size={36} /></span>
                <span className="person-text"><strong>{f.username}</strong>
                  <span>{f.room ? (f.room === currentRoom ? 'In this room with you' : 'Listening in a room') : f.online ? 'Online' : 'Offline'}</span></span>
                {f.room && f.room !== currentRoom && (
                  <button className="btn btn-primary btn-small" onClick={() => onJoin(f.room)}>Join</button>
                )}
                <button className="icon-btn small" disabled={busy === f.username} onClick={() => remove(f.username)}
                  aria-label={`Remove ${f.username} from friends`} title="Remove friend">
                  <Icon name="close" size={16} />
                </button>
              </div>
            ))}

            {friends.outgoing.length > 0 && (
              <>
                <h3 className="section-label">Sent requests</h3>
                {friends.outgoing.map(name => (
                  <div key={name} className="person">
                    <Avatar name={name} size={36} />
                    <span className="person-text"><strong>{name}</strong><span>Waiting for them to accept</span></span>
                    <button className="btn btn-ghost btn-small" disabled={busy === name} onClick={() => remove(name)}>Cancel</button>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
