import { useMemo, useState } from 'react';
import { categoryColor, categoryOf, groupCategories } from '../lib/categories';
import { formatTime, thumb } from '../lib/util';
import { Artwork, Avatar, CategoryTag, Icon, Modal, Spinner } from './ui';

const PAGE = 60;

function SongRow({ song, active, playing, tag, disabled, onPlay, children }) {
  return (
    <li className={`song-row ${active ? 'active' : ''} ${disabled ? 'gone' : ''}`}>
      <button className="song-main" onClick={onPlay} disabled={disabled}
        title={disabled ? 'No longer in the library' : `Play ${song.title}`}>
        <span className="song-art">
          <Artwork src={thumb(song.thumbnail)} />
          {active ? <span className={`eq ${playing ? 'on' : ''}`}><i /><i /><i /></span>
            : !disabled && <span className="song-play"><Icon name="play" size={22} /></span>}
        </span>
        <span className="song-text">
          <span className="song-title">{song.title}</span>
          <span className="song-sub">
            {tag && <CategoryTag name={categoryOf(song)} color={categoryColor(categoryOf(song))} />}
            <span className="song-artist">{disabled ? 'No longer in the library' : song.artist || 'Unknown artist'}</span>
          </span>
        </span>
        {song.duration > 0 && <span className="song-time">{formatTime(song.duration)}</span>}
      </button>
      {children}
    </li>
  );
}

const songCount = (n) => `${n} ${n === 1 ? 'song' : 'songs'}`;

/** Tick the playlists a song should be in, or start a new one with it. */
function SaveDialog({ song, playlists, onClose, toast }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(null); // id of the playlist being changed, or 'new'

  const run = async (key, work) => {
    if (busy !== null) return;
    setBusy(key);
    try { await work(); } catch (e) { toast(e.message, 'error'); }
    setBusy(null);
  };
  const toggle = (list) => run(list.id, async () => {
    const existing = list.songs.find(s => s.url === song.url);
    if (existing) {
      await playlists.removeSong(list.id, existing.itemId);
      toast(`Removed from ${list.name}`);
    } else {
      await playlists.addSong(list.id, song);
      toast(`Added to ${list.name}`);
    }
  });
  const create = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    run('new', async () => {
      const made = await playlists.create(name.trim());
      await playlists.addSong(made.id, song);
      setName('');
      toast(`Added to ${made.name}`);
    });
  };

  return (
    <Modal title="Add to playlist" onClose={onClose}>
      <div className="save-song">
        <span className="song-art"><Artwork src={thumb(song.thumbnail)} /></span>
        <span className="song-text">
          <span className="song-title">{song.title}</span>
          <span className="song-artist">{song.artist || 'Unknown artist'}</span>
        </span>
      </div>

      {playlists.lists.length === 0 ? (
        <p className="muted small">You have no playlists yet. Name one below and this song goes straight into it.</p>
      ) : (
        <ul className="save-list">
          {playlists.lists.map(list => {
            const inside = list.songs.some(s => s.url === song.url);
            return (
              <li key={list.id}>
                <button className={`save-item ${inside ? 'on' : ''}`} onClick={() => toggle(list)} disabled={busy !== null}
                  role="checkbox" aria-checked={inside} aria-label={`${list.name}, ${songCount(list.songs.length)}`}>
                  <span className="save-check">{busy === list.id ? <Spinner /> : inside && <Icon name="check" size={16} />}</span>
                  <span className="save-name">{list.name}</span>
                  <span className="save-count">{inside ? 'Added' : songCount(list.songs.length)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <form className="join-form" onSubmit={create}>
        <input className="input" placeholder="New playlist name" aria-label="New playlist name" maxLength={60}
          value={name} onChange={e => setName(e.target.value)} />
        <button className="btn btn-secondary" type="submit" disabled={busy !== null || !name.trim()}>
          {busy === 'new' ? <Spinner /> : 'Create'}
        </button>
      </form>
      <button className="btn btn-primary btn-block" onClick={onClose}>Done</button>
    </Modal>
  );
}

/** Choose which friends get a copy of a playlist. */
function ShareDialog({ list, friends, playlists, onClose, toast }) {
  const [sent, setSent] = useState(() => new Set());
  const [busy, setBusy] = useState('');
  const send = async (name) => {
    if (busy) return;
    setBusy(name);
    try {
      await playlists.share(list.id, name);
      setSent(prev => new Set(prev).add(name));
      toast(`Shared "${list.name}" with ${name}`);
    } catch (e) {
      toast(e.message, 'error');
    }
    setBusy('');
  };
  return (
    <Modal title="Share playlist" onClose={onClose}>
      <p className="muted">Friends you pick get their own copy of <strong>{list.name}</strong> ({songCount(list.songs.length)}) once they accept. Changes you make later stay yours.</p>
      {friends.length === 0 ? (
        <p className="muted small">You have no friends added yet. Add people in the Friends tab, then share from here.</p>
      ) : (
        <ul className="people share-people">
          {friends.map(f => (
            <li key={f.username}>
              <Avatar name={f.username} size={34} />
              <span className="people-name">{f.username}<small>{f.online ? 'Online' : 'Offline'}</small></span>
              <button className="btn btn-secondary btn-small" onClick={() => send(f.username)}
                disabled={busy === f.username || sent.has(f.username)}>
                {sent.has(f.username) ? 'Shared' : busy === f.username ? <Spinner /> : 'Share'}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button className="btn btn-primary btn-block" onClick={onClose}>Done</button>
    </Modal>
  );
}

export default function Library({ library, playlists, friends = [], currentId, playing, onPlay, onPlayAll, onShuffleAll, onQueue, toast }) {
  const [query, setQuery] = useState('');
  const [view, setView] = useState('browse'); // browse | all | playlists
  const [category, setCategory] = useState(null); // the category that is open, if any
  const [listId, setListId] = useState(null); // the playlist that is open, if any
  const [limit, setLimit] = useState(PAGE);
  const [saving, setSaving] = useState(null); // song being added to a playlist
  const [newName, setNewName] = useState('');
  const [sharing, setSharing] = useState(false); // share dialog for the open playlist
  const [busyShare, setBusyShare] = useState(null);

  const q = query.trim().toLowerCase();
  const groups = useMemo(() => groupCategories(library.songs), [library.songs]);
  const tiles = useMemo(() => groups.flatMap(g => g.items), [groups]);
  const openCat = !q && view !== 'playlists' && category ? tiles.find(t => t.name === category) : null;
  const openList = !q && view === 'playlists' && listId != null ? playlists.lists.find(p => p.id === listId) : null;
  const browsing = !q && !openCat && view === 'browse' && tiles.length > 1;
  const listing = !q && view === 'playlists' && !openList;

  // A saved song is matched to today's library by id; one the library dropped is shown but can't be played.
  const listSongs = useMemo(() => (openList ? openList.songs.map(item => {
    const live = item.id != null ? library.byId.get(item.id) : null;
    return live ? { song: live, itemId: item.itemId } : { song: item, itemId: item.itemId, gone: true };
  }) : []), [openList, library.byId]);

  const results = useMemo(() => {
    if (q) return library.songs.filter(s => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q));
    if (openCat) return library.songs.filter(s => categoryOf(s) === openCat.name);
    return library.songs;
  }, [library.songs, q, openCat]);

  const matchingTiles = q ? tiles.filter(t => t.name.toLowerCase().includes(q)).slice(0, 4) : [];
  const currentCategory = currentId ? categoryOf(library.byId.get(currentId)) : null;
  const playable = listSongs.filter(x => !x.gone).map(x => x.song);

  // Changing what's listed starts again from the first page.
  const changeQuery = (value) => { setQuery(value); setLimit(PAGE); };
  const openCategory = (name) => { setCategory(name); setView(v => (v === 'playlists' ? 'browse' : v)); setQuery(''); setLimit(PAGE); };
  const changeView = (value) => { setView(value); setLimit(PAGE); };

  const guard = async (work) => {
    try { await work(); } catch (e) { toast(e.message, 'error'); }
  };
  const createList = (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    guard(async () => { const made = await playlists.create(name); setNewName(''); setListId(made.id); });
  };
  const renameList = (list) => {
    const name = window.prompt('Rename playlist', list.name);
    if (name === null || !name.trim() || name.trim() === list.name) return;
    guard(() => playlists.rename(list.id, name.trim()));
  };
  const acceptShared = (share) => {
    if (busyShare) return;
    setBusyShare(share.shareId);
    guard(async () => {
      const made = await playlists.acceptShared(share.shareId);
      toast(`"${made.name}" is now in your playlists`);
      setListId(made.id);
    }).finally(() => setBusyShare(null));
  };
  const deleteList = (list) => {
    if (!window.confirm(`Delete the playlist "${list.name}"? This can't be undone.`)) return;
    guard(async () => { await playlists.remove(list.id); setListId(null); toast(`Deleted ${list.name}`); });
  };

  const actions = (song) => (
    <>
      <button className="icon-btn" onClick={() => setSaving(song)} aria-label={`Add ${song.title} to a playlist`}
        title="Add to playlist">
        <Icon name="playlistAdd" size={18} />
      </button>
      <button className="icon-btn" onClick={() => onQueue(song)} aria-label={`Add ${song.title} to queue`}
        title="Add to queue">
        <Icon name="plus" size={18} />
      </button>
    </>
  );

  return (
    <div className="library">
      <div className="panel-head">
        <h2>Library</h2>
        <span className="muted small">
          {library.loading && library.songs.length > 0 ? 'Loading more… ' : ''}{library.songs.length.toLocaleString()} songs
        </span>
      </div>

      <div className="search">
        <Icon name="search" size={18} />
        <input type="search" placeholder="Search songs or artists" aria-label="Search songs or artists"
          value={query} onChange={e => changeQuery(e.target.value)} />
        {query && (
          <button className="icon-btn small" onClick={() => changeQuery('')} aria-label="Clear search">
            <Icon name="close" size={16} />
          </button>
        )}
      </div>

      {!q && !openCat && !openList && (
        <div className="tabs three lib-tabs" role="tablist" aria-label="Library view">
          <button role="tab" aria-selected={view === 'browse'} className={view === 'browse' ? 'active' : ''}
            onClick={() => changeView('browse')}>Categories</button>
          <button role="tab" aria-selected={view === 'all'} className={view === 'all' ? 'active' : ''}
            onClick={() => changeView('all')}>All songs</button>
          <button role="tab" aria-selected={view === 'playlists'} className={view === 'playlists' ? 'active' : ''}
            onClick={() => changeView('playlists')}>
            Playlists{playlists.shared.length > 0 ? <span className="count hot">{playlists.shared.length}</span> : null}
          </button>
        </div>
      )}

      {openCat && (
        <div className="cat-head" style={{ '--c': openCat.color }}>
          <button className="icon-btn" onClick={() => setCategory(null)} aria-label="Back to categories">
            <Icon name="back" size={20} />
          </button>
          <div className="cat-head-text">
            <h3>{openCat.name}</h3>
            <span>{openCat.count.toLocaleString()} songs{openCat.note ? ` · ${openCat.note}` : ''}</span>
          </div>
          {results.length > 1 && (
            <button className="icon-btn" onClick={() => onShuffleAll(results)} aria-label={`Shuffle ${openCat.name}`} title="Shuffle play">
              <Icon name="shuffle" size={20} />
            </button>
          )}
          {results.length > 0 && (
            <button className="cat-play" onClick={() => onPlay(results[0], results.map(s => s.id))} aria-label={`Play ${openCat.name}`}>
              <Icon name="play" size={22} />
            </button>
          )}
        </div>
      )}

      {openList && (
        <div className="list-head">
          <div className="list-head-top">
            <button className="icon-btn" onClick={() => setListId(null)} aria-label="Back to playlists">
              <Icon name="back" size={20} />
            </button>
            <div className="cat-head-text">
              <h3 title={openList.name}>{openList.name}</h3>
              <span>{songCount(openList.songs.length)} · Your playlist</span>
            </div>
            {playable.length > 0 && (
              <button className="cat-play" onClick={() => onPlayAll(playable)} aria-label={`Play ${openList.name}`}>
                <Icon name="play" size={22} />
              </button>
            )}
          </div>
          <div className="list-head-actions">
            <button className="btn btn-secondary btn-small" onClick={() => onShuffleAll(playable)} disabled={playable.length < 2}
              aria-label={`Shuffle ${openList.name}`}>
              <Icon name="shuffle" size={16} /> Shuffle
            </button>
            <button className="btn btn-secondary btn-small" onClick={() => setSharing(true)} aria-label={`Share ${openList.name}`}>
              <Icon name="share" size={16} /> Share
            </button>
            <button className="icon-btn small" onClick={() => renameList(openList)} aria-label={`Rename ${openList.name}`} title="Rename">
              <Icon name="edit" size={16} />
            </button>
            <button className="icon-btn small" onClick={() => deleteList(openList)} aria-label={`Delete playlist ${openList.name}`}
              title="Delete playlist">
              <Icon name="trash" size={16} />
            </button>
          </div>
        </div>
      )}

      {matchingTiles.length > 0 && (
        <div className="chips" aria-label="Matching categories">
          {matchingTiles.map(t => (
            <button key={t.name} className="chip chip-cat" style={{ '--c': t.color }} onClick={() => openCategory(t.name)}>
              <i />{t.name}
            </button>
          ))}
        </div>
      )}

      {browsing ? (
        <div className="browse">
          {groups.map(group => (
            <section key={group.title} className="browse-group">
              <h3>{group.title}</h3>
              <div className="tiles">
                {group.items.map(t => (
                  <button key={t.name} className={`tile ${t.name === currentCategory ? 'current' : ''}`}
                    style={{ '--c': t.color }} onClick={() => openCategory(t.name)}
                    aria-label={`${t.name}, ${t.count} songs`}>
                    <span className="tile-name">{t.name}</span>
                    <span className="tile-count">
                      {t.name === currentCategory
                        ? <><span className={`eq-mini ${playing ? 'on' : ''}`}><i /><i /><i /></span>Playing</>
                        : `${t.count} songs`}
                    </span>
                    {t.cover && <img className="tile-art" src={thumb(t.cover)} alt="" loading="lazy" />}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : listing ? (
        <div className="browse">
          <form className="join-form new-list" onSubmit={createList}>
            <input className="input" placeholder="New playlist name" aria-label="New playlist name" maxLength={60}
              value={newName} onChange={e => setNewName(e.target.value)} />
            <button className="btn btn-primary" type="submit" disabled={!newName.trim()}>Create</button>
          </form>
          {playlists.shared.length > 0 && (
            <section className="shared">
              <h3 className="section-label">Shared with you · {playlists.shared.length}</h3>
              {playlists.shared.map(share => (
                <div key={share.shareId} className="shared-card">
                  <span className="list-cover">
                    {share.cover ? <img src={thumb(share.cover)} alt="" loading="lazy" /> : <Icon name="music" size={22} />}
                  </span>
                  <span className="song-text">
                    <span className="song-title">{share.name}</span>
                    <span className="song-artist">From {share.from} · {songCount(share.count)}</span>
                  </span>
                  <button className="btn btn-primary btn-small" onClick={() => acceptShared(share)} disabled={busyShare === share.shareId}
                    aria-label={`Add ${share.name} from ${share.from} to my playlists`}>Add</button>
                  <button className="icon-btn small" onClick={() => guard(() => playlists.declineShared(share.shareId))}
                    aria-label={`Dismiss ${share.name} from ${share.from}`} title="Dismiss">
                    <Icon name="close" size={16} />
                  </button>
                </div>
              ))}
            </section>
          )}
          {playlists.lists.length > 0 && <h3 className="section-label">Your playlists · {playlists.lists.length}</h3>}
          {playlists.loading ? <div className="empty"><Spinner /></div>
            : playlists.lists.length === 0 ? (
              <div className="empty">
                <Icon name="library" size={30} />
                <p>No playlists yet</p>
                <p className="muted small">Name one above, or tap the playlist button on any song. Your playlists are saved to your account and stay until you delete them.</p>
              </div>
            ) : (
              <ul className="lists">
                {playlists.lists.map(list => (
                  <li key={list.id}>
                    <button className="list-card" onClick={() => { setListId(list.id); setLimit(PAGE); }}>
                      <span className="list-cover">
                        {list.songs[0]?.thumbnail ? <img src={thumb(list.songs[0].thumbnail)} alt="" loading="lazy" />
                          : <Icon name="music" size={22} />}
                      </span>
                      <span className="song-text">
                        <span className="song-title">{list.name}</span>
                        <span className="song-artist">{songCount(list.songs.length)}</span>
                      </span>
                      <Icon name="chevron" size={20} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
        </div>
      ) : openList ? (
        <ul className="song-list">
          {listSongs.length === 0 && (
            <li className="empty">
              <Icon name="playlistAdd" size={30} />
              <p>This playlist is empty</p>
              <p className="muted small">Find a song and tap its playlist button to add it here.</p>
            </li>
          )}
          {listSongs.slice(0, limit).map(({ song, itemId, gone }) => (
            <SongRow key={itemId} song={song} tag disabled={gone} active={!gone && song.id === currentId} playing={playing}
              onPlay={() => onPlay(song, playable.map(s => s.id))}>
              {!gone && (
                <button className="icon-btn" onClick={() => onQueue(song)} aria-label={`Add ${song.title} to queue`}
                  title="Add to queue">
                  <Icon name="plus" size={18} />
                </button>
              )}
              <button className="icon-btn" aria-label={`Remove ${song.title} from ${openList.name}`} title="Remove from playlist"
                onClick={() => guard(() => playlists.removeSong(openList.id, itemId))}>
                <Icon name="close" size={18} />
              </button>
            </SongRow>
          ))}
        </ul>
      ) : (
        <ul className="song-list">
          {library.songs.length === 0 && (
            <li className="empty">
              {library.error ? <p>{library.error}</p> : <><Spinner /><p>Loading the library…</p></>}
            </li>
          )}
          {library.songs.length > 0 && results.length === 0 && (
            <li className="empty"><p>No songs match "{query.trim()}"</p></li>
          )}
          {results.slice(0, limit).map(song => (
            <SongRow key={song.id} song={song} tag={!openCat} active={song.id === currentId} playing={playing}
              onPlay={() => onPlay(song, openCat ? results.map(s => s.id) : undefined)}>
              {actions(song)}
            </SongRow>
          ))}
          {results.length > limit && (
            <li className="more">
              <button className="btn btn-ghost btn-small" onClick={() => setLimit(l => l + PAGE)}>
                Show more ({(results.length - limit).toLocaleString()} left)
              </button>
            </li>
          )}
        </ul>
      )}

      {saving && <SaveDialog song={saving} playlists={playlists} toast={toast} onClose={() => setSaving(null)} />}
      {sharing && openList && (
        <ShareDialog list={openList} friends={friends} playlists={playlists} toast={toast} onClose={() => setSharing(false)} />
      )}
    </div>
  );
}
