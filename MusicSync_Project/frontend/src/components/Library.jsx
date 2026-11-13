import { useMemo, useState } from 'react';
import { formatTime, thumb } from '../lib/util';
import { Artwork, Icon, Spinner } from './ui';

const PAGE = 60;

export default function Library({ library, currentId, playing, onPlay, onQueue }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [limit, setLimit] = useState(PAGE);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (q) return library.songs.filter(s => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q));
    if (category === 'All') return library.songs;
    return library.songs.filter(s => (s.category || 'Other') === category);
  }, [library.songs, q, category]);

  // Changing what's listed starts again from the first page.
  const changeQuery = (value) => { setQuery(value); setLimit(PAGE); };
  const changeCategory = (value) => { setCategory(value); setLimit(PAGE); };

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

      {!q && library.categories.length > 1 && (
        <div className="chips" role="tablist" aria-label="Categories">
          {['All', ...library.categories].map(c => (
            <button key={c} role="tab" aria-selected={c === category}
              className={`chip ${c === category ? 'active' : ''}`} onClick={() => changeCategory(c)}>{c}</button>
          ))}
        </div>
      )}

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
                  {active && <span className={`eq ${playing ? 'on' : ''}`}><i /><i /><i /></span>}
                </span>
                <span className="song-text">
                  <span className="song-title">{song.title}</span>
                  <span className="song-artist">{song.artist || 'Unknown artist'}</span>
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
    </div>
  );
}
