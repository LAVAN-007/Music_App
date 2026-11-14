import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

const POLL_MS = 8000;
const EMPTY = { friends: [], incoming: [], outgoing: [], invites: [] };

/**
 * Friends, friend requests and where friends are listening. Refreshed regularly, which also
 * tells the server this user is online.
 *
 * @param onRequest called with the username when a new friend request arrives
 * @param onInvite called with { from, room } when a friend invites this user to their room
 */
export function useFriends(enabled, onUnauthorized, onRequest, onInvite) {
  const [data, setData] = useState(EMPTY);
  const known = useRef(null); // incoming requests already seen
  const onRequestRef = useRef(onRequest);
  const onInviteRef = useRef(onInvite);
  const knownInvites = useRef(null);
  useEffect(() => { onRequestRef.current = onRequest; onInviteRef.current = onInvite; });

  const load = useCallback(async () => {
    try {
      const next = await api('/friends');
      if (known.current) {
        for (const name of next.incoming) if (!known.current.has(name)) onRequestRef.current?.(name);
      }
      known.current = new Set(next.incoming);
      const keys = (next.invites || []).map(i => `${i.from}|${i.room}|${i.at}`);
      if (knownInvites.current) {
        (next.invites || []).forEach((invite, i) => { if (!knownInvites.current.has(keys[i])) onInviteRef.current?.(invite); });
      }
      knownInvites.current = new Set(keys);
      setData({ ...EMPTY, ...next });
    } catch (e) {
      if (e.status === 401) onUnauthorized();
    }
  }, [onUnauthorized]);

  useEffect(() => {
    if (!enabled) { known.current = null; knownInvites.current = null; return undefined; }
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
  const invite = useCallback(async (username, room) => {
    try {
      return await api('/friends/invite', { method: 'POST', body: { username, room } });
    } catch (e) {
      if (e.status === 401) onUnauthorized();
      throw e;
    }
  }, [onUnauthorized]);
  const dismissInvite = useCallback((username) => act('/friends/invite/dismiss', username).catch(() => {}), [act]);
  const search = useCallback((q) => api(`/friends/search?q=${encodeURIComponent(q)}`), []);

  return { ...data, add, accept, remove, invite, dismissInvite, search, reload: load };
}
