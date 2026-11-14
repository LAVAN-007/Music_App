import { useCallback, useMemo, useRef, useState } from 'react';
import { serverNow } from '../lib/clock';
import { useLatest } from './useLatest';

const livePosition = (s, now) => (s.playing ? s.position + Math.max(0, now - s.updatedAt) / 1000 : s.position);

/**
 * Listening on your own: the same playback state and commands as a room, applied on this device
 * instead of a server, so the player and the rest of the UI work unchanged.
 *
 * A `SELECT` may carry `context` (a list of song ids, e.g. a playlist): playback then continues
 * through that list instead of the whole library.
 */
export function useSolo(library) {
  const [local, setState] = useState(null); // null until the listener does something
  const libraryRef = useLatest(library);
  const context = useRef(null);

  // Start with the first song loaded and paused, like a fresh room.
  const firstId = library.songs[0]?.id;
  const initial = useMemo(() => (firstId == null ? null
    : { songId: firstId, position: 0, playing: false, updatedAt: serverNow(), version: 1, queue: [] }), [firstId]);
  const initialRef = useLatest(initial);
  const state = local ?? initial;

  const send = useCallback((cmd) => {
    if (cmd.type === 'SELECT') context.current = Array.isArray(cmd.context) && cmd.context.length > 1 ? cmd.context : null;
    setState((current) => {
      const prev = current ?? initialRef.current;
      if (!prev) return current;
      const { byId, songs } = libraryRef.current;
      const now = serverNow();
      const start = (songId) => ({ ...prev, songId, position: 0, playing: true, updatedAt: now, version: prev.version + 1 });
      const neighbour = (step) => {
        const list = context.current?.includes(prev.songId) ? context.current : songs.map(s => s.id);
        if (list.length === 0) return null;
        const at = list.indexOf(prev.songId);
        return list[(at + step + list.length) % list.length];
      };
      const advance = () => {
        if (prev.queue.length > 0) return { ...start(prev.queue[0]), queue: prev.queue.slice(1) };
        const next = neighbour(1);
        return next == null ? prev : start(next);
      };
      const editQueue = (queue) => ({ ...prev, queue, version: prev.version + 1 });
      const valid = (index) => Number.isInteger(index) && index >= 0 && index < prev.queue.length;

      switch (cmd.type) {
        case 'PLAY':
          return { ...prev, position: livePosition(prev, now), playing: true, updatedAt: now, version: prev.version + 1 };
        case 'PAUSE':
          return { ...prev, position: cmd.position ?? livePosition(prev, now), playing: false, updatedAt: now, version: prev.version + 1 };
        case 'SEEK':
          return cmd.position == null ? prev
            : { ...prev, position: Math.max(0, cmd.position), updatedAt: now, version: prev.version + 1 };
        case 'SELECT': return byId.has(cmd.songId) ? start(cmd.songId) : prev;
        case 'NEXT': return advance();
        case 'ENDED': return cmd.songId === prev.songId && cmd.version === prev.version ? advance() : prev;
        case 'PREV': {
          if (livePosition(prev, now) > 3) return start(prev.songId);
          const before = neighbour(-1);
          return before == null ? prev : start(before);
        }
        case 'QUEUE_ADD': return byId.has(cmd.songId) && prev.queue.length < 200 ? editQueue([...prev.queue, cmd.songId]) : prev;
        case 'QUEUE_REMOVE': return valid(cmd.index) ? editQueue(prev.queue.filter((_, i) => i !== cmd.index)) : prev;
        case 'QUEUE_PLAY':
          return valid(cmd.index) ? { ...start(prev.queue[cmd.index]), queue: prev.queue.filter((_, i) => i !== cmd.index) } : prev;
        case 'QUEUE_CLEAR': return prev.queue.length ? editQueue([]) : prev;
        default: return prev;
      }
    });
    return true;
  }, [libraryRef, initialRef]);

  return { status: 'connected', state, touched: local !== null, users: [], listeners: 1, messages: [], send };
}
