import { thumb } from '../lib/util';
import { Artwork, Icon } from './ui';

export default function QueuePanel({ queue, current, byId, onPlay, onRemove, onClear }) {
  return (
    <div className="queue">
      {current && (
        <>
          <h3 className="section-label">Now playing</h3>
          <div className="song-row static active">
            <span className="song-main">
              <span className="song-art"><Artwork src={thumb(current.thumbnail)} /></span>
              <span className="song-text">
                <span className="song-title">{current.title}</span>
                <span className="song-artist">{current.artist}</span>
              </span>
            </span>
          </div>
        </>
      )}

      <div className="section-row">
        <h3 className="section-label">Up next{queue.length > 0 ? ` · ${queue.length}` : ''}</h3>
        {queue.length > 0 && <button className="link-btn" onClick={onClear}>Clear</button>}
      </div>

      {queue.length === 0 ? (
        <div className="empty">
          <Icon name="queue" size={30} />
          <p>The queue is empty</p>
          <p className="muted small">Tap + on any song to line it up. When the queue runs out, the room keeps playing through the library.</p>
        </div>
      ) : (
        <ul className="song-list flush">
          {queue.map((id, index) => {
            const song = byId.get(id);
            if (!song) return null;
            return (
              <li key={`${id}-${index}`} className="song-row">
                <button className="song-main" onClick={() => onPlay(index)} title={`Play ${song.title} now`}>
                  <span className="queue-index">{index + 1}</span>
                  <span className="song-art"><Artwork src={thumb(song.thumbnail)} /></span>
                  <span className="song-text">
                    <span className="song-title">{song.title}</span>
                    <span className="song-artist">{song.artist}</span>
                  </span>
                </button>
                <button className="icon-btn" onClick={() => onRemove(index)} aria-label={`Remove ${song.title} from queue`}>
                  <Icon name="close" size={18} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
