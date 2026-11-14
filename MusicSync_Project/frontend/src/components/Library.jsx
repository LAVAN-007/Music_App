import { useMemo, useState } from 'react';
import { categoryColor, categoryOf, groupCategories } from '../lib/categories';
import { formatTime, thumb } from '../lib/util';
import { Artwork, CategoryTag, Icon, Spinner } from './ui';

const PAGE = 60;

export default function Library({ library, currentId, playing, onPlay, onQueue }) {
  const [query, setQuery] = useState('');
  const [view, setView] = useState('browse'); // browse | all
  const [category, setCategory] = useState(null); // the category that is open, if any
  const [limit, setLimit] = useState(PAGE);

  const q = query.trim().toLowerCase();
  const groups = useMemo(() => groupCategories(library.songs), [library.songs]);
  const tiles = useMemo(() => groups.flatMap(g => g.items), [groups]);
  const open = !q && category ? tiles.find(t => t.name === category) : null;
  const browsing = !q && !open && view === 'browse' && tiles.length > 1;

  const results = useMemo(() => {
    if (q) return library.songs.filter(s => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q));
    if (open) return library.songs.filter(s => categoryOf(s) === open.name);
    return library.songs;
  }, [library.songs, q, open]);

  const matchingTiles = q ? tiles.filter(t => t.name.toLowerCase().includes(q)).slice(0, 4) : [];
  const currentCategory = currentId ? categoryOf(library.byId.get(currentId)) : null;

  // Changing what's listed starts again from the first page.
  const changeQuery = (value) => { setQuery(value); setLimit(PAGE); };
  const openCategory = (name) => { setCategory(name); setQuery(''); setLimit(PAGE); };
  const changeView = (value) => { setView(value); setLimit(PAGE); };

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

      {!q && !open && tiles.length > 1 && (
        <div className="tabs lib-tabs" role="tablist" aria-label="Library view">
          <button role="tab" aria-selected={view === 'browse'} className={view === 'browse' ? 'active' : ''}
            onClick={() => changeView('browse')}>Categories</button>
          <button role="tab" aria-selected={view === 'all'} className={view === 'all' ? 'active' : ''}
            onClick={() => changeView('all')}>All songs</button>
        </div>
      )}

      {open && (
        <div className="cat-head" style={{ '--c': open.color }}>
          <button className="icon-btn" onClick={() => setCategory(null)} aria-label="Back to categories">
            <Icon name="back" size={20} />
          </button>
          <div className="cat-head-text">
            <h3>{open.name}</h3>
            <span>{open.count.toLocaleString()} songs{open.note ? ` · ${open.note}` : ''}</span>
          </div>
          {results.length > 0 && (
            <button className="cat-play" onClick={() => onPlay(results[0])} aria-label={`Play ${open.name}`}>
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
          {results.slice(0, limit).map(song => {
            const active = song.id === currentId;
            return (
              <li key={song.id} className={`song-row ${active ? 'active' : ''}`}>
                <button className="song-main" onClick={() => onPlay(song)} title={`Play ${song.title}`}>
                  <span className="song-art">
                    <Artwork src={thumb(song.thumbnail)} />
                    {active ? <span className={`eq ${playing ? 'on' : ''}`}><i /><i /><i /></span>
                      : <span className="song-play"><Icon name="play" size={22} /></span>}
                  </span>
                  <span className="song-text">
                    <span className="song-title">{song.title}</span>
                    <span className="song-sub">
                      {!open && <CategoryTag name={categoryOf(song)} color={categoryColor(categoryOf(song))} />}
                      <span className="song-artist">{song.artist || 'Unknown artist'}</span>
                    </span>
                  </span>
                  {song.duration > 0 && <span className="song-time">{formatTime(song.duration)}</span>}
                </button>
                <button className="icon-btn" onClick={() => onQueue(song)} aria-label={`Add ${song.title} to queue`}
                  title="Add to queue">
                  <Icon name="plus" size={18} />
                </button>
              </li>
            );
          })}
          {results.length > limit && (
            <li className="more">
              <button className="btn btn-ghost btn-small" onClick={() => setLimit(l => l + PAGE)}>
                Show more ({(results.length - limit).toLocaleString()} left)
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
