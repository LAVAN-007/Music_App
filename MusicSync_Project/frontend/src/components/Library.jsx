import { useEffect, useMemo, useRef, useState } from 'react';
import { categoryColor, categoryOf, groupCategories } from '../lib/categories';
import { formatTime, thumb } from '../lib/util';
import { Artwork, CategoryTag, Icon, Spinner } from './ui';

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

/** Pick which of your playlists a song belongs to, or start a new one with it. */
function SaveDialog({ song, playlists, onClose, toast }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async (work) => {
    if (busy) return;
    setBusy(true);
    try { await work(); } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };
  const toggle = (list) => run(async () => {
    const existing = list.songs.find(s => s.url === song.url);
    if (existing) await playlists.removeSong(list.id, existing.itemId);
    else await playlists.addSong(list.id, song);
  });
  const create = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    run(async () => {
      const made = await playlists.create(name.trim());
      await playlists.addSong(made.id, song);
      setName('');
      toast(`Added to ${made.name}`);
    });
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="card dialog" role="dialog" aria-modal="true" aria-labelledby="save-title" onClick={e => e.stopPropagation()}>
        <div className="dialog-head">
          <h2 id="save-title">Add to playlist</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close" ref={closeRef}><Icon name="close" /></button>
        </div>
        <p className="muted save-song">{song.title}</p>

        {playlists.lists.length > 0 && (
          <ul className="save-list">
            {playlists.lists.map(list => {
              const inside = list.songs.some(s => s.url === song.url);
              return (
                <li key={list.id}>
                  <button className={`save-item ${inside ? 'on' : ''}`} onClick={() => toggle(list)} disabled={busy}
                    aria-pressed={inside}>
                    <span className="save-check"><Icon name={inside ? 'check' : 'plus'} size={16} /></span>
                    <span className="save-name">{list.name}</span>
                    <span className="muted small">{list.songs.length} songs</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <form className="join-form" onSubmit={create}>
          <input className="input" placeholder="New playlist name" aria-label="New playlist name" maxLength={60}
            value={name} onChange={e => setName(e.target.value)} />
          <button className="btn btn-secondary" type="submit" disabled={busy || !name.trim()}>Create</button>
        </form>
      </div>
    </div>
  );
}

export default function Library({ library, playlists, currentId, playing, onPlay, onPlayAll, onShuffleAll, onQueue, toast }) {
  const [query, setQuery] = useState('');
  const [view, setView] = useState('browse'); // browse | all | playlists
  const [category, setCategory] = useState(null); // the category that is open, if any
  const [listId, setListId] = useState(null); // the playlist that is open, if any
  const [limit, setLimit] = useState(PAGE);
  const [saving, setSaving] = useState(null); // song being added to a playlist
  const [newName, setNewName] = useState('');

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
            onClick={() => changeView('playlists')}>Playlists</button>
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
        <div className="cat-head" style={{ '--c': '#2864e8' }}>
          <button className="icon-btn" onClick={() => setListId(null)} aria-label="Back to playlists">
            <Icon name="back" size={20} />
          </button>
          <div className="cat-head-text">
            <h3>{openList.name}</h3>
            <span>{openList.songs.length} {openList.songs.length === 1 ? 'song' : 'songs'} · Your playlist</span>
          </div>
          <button className="icon-btn" onClick={() => deleteList(openList)} aria-label={`Delete playlist ${openList.name}`}
            title="Delete playlist">
            <Icon name="trash" size={18} />
          </button>
          {playable.length > 1 && (
            <button className="icon-btn" onClick={() => onShuffleAll(playable)} aria-label={`Shuffle ${openList.name}`} title="Shuffle play">
              <Icon name="shuffle" size={20} />
            </button>
          )}
          {playable.length > 0 && (
            <button className="cat-play" onClick={() => onPlayAll(playable)} aria-label={`Play ${openList.name}`}>
              <Icon name="play" size={22} />
            </button>
          )}
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
                        <span className="song-artist">{list.songs.length} {list.songs.length === 1 ? 'song' : 'songs'}</span>
                      </span>
                      <Icon name="next" size={18} />
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
    </div>
  );
}
