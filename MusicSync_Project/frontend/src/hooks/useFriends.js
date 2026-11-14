import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

const POLL_MS = 15000;
const EMPTY = { friends: [], incoming: [], outgoing: [] };

/**
 * Friends, friend requests and where friends are listening. Refreshed regularly, which also
 * tells the server this user is online.
 *
 * @param onRequest called with the username when a new friend request arrives
 */
export function useFriends(enabled, onUnauthorized, onRequest) {
  const [data, setData] = useState(EMPTY);
  const known = useRef(null); // incoming requests already seen
  const onRequestRef = useRef(onRequest);
  useEffect(() => { onRequestRef.current = onRequest; });

  const load = useCallback(async () => {
    try {
      const next = await api('/friends');
      if (known.current) {
        for (const name of next.incoming) if (!known.current.has(name)) onRequestRef.current?.(name);
      }
      known.current = new Set(next.incoming);
      setData(next);
    } catch (e) {
      if (e.status === 401) onUnauthorized();
    }
  }, [onUnauthorized]);

  useEffect(() => {
    if (!enabled) { known.current = null; return undefined; }
    const first = setTimeout(load, 0);
    const timer = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    const onVisible = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearTimeout(first); clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [enabled, load]);

  const act = useCallback(async (path, username) => {
    try {
      const result = await api(path, { method: 'POST', body: { username } });
      await load();
      return result;
    } catch (e) {
      if (e.status === 401) onUnauthorized();
      throw e;
    }
  }, [load, onUnauthorized]);

  const add = useCallback((username) => act('/friends', username), [act]);
  const accept = useCallback((username) => act('/friends/accept', username), [act]);
  const remove = useCallback((username) => act('/friends/remove', username), [act]);
  const search = useCallback((q) => api(`/friends/search?q=${encodeURIComponent(q)}`), []);

  return { ...data, add, accept, remove, search, reload: load };
}
