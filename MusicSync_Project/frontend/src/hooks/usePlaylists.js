import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

const POLL_MS = 15000;

/**
 * The signed-in user's playlists, stored on the server, and the playlists friends have shared
 * with them. Actions throw ApiError for the caller to show.
 *
 * @param onShared called with { from, name } when a friend shares a playlist
 */
export function usePlaylists(enabled, onUnauthorized, onShared) {
  const [lists, setLists] = useState([]);
  const [shared, setShared] = useState([]);
  const [loading, setLoading] = useState(true);
  const known = useRef(null); // shares already seen
  const onSharedRef = useRef(onShared);
  useEffect(() => { onSharedRef.current = onShared; });

  const guard = useCallback(async (work) => {
    try {
      return await work();
    } catch (e) {
      if (e.status === 401) onUnauthorized();
      throw e;
    }
  }, [onUnauthorized]);

  const loadShared = useCallback(async () => {
    try {
      const next = await guard(() => api('/playlists/shared'));
      if (known.current) for (const s of next) if (!known.current.has(s.shareId)) onSharedRef.current?.(s);
      known.current = new Set(next.map(s => s.shareId));
      setShared(next);
    } catch { /* try again on the next round */ }
  }, [guard]);

  useEffect(() => {
    if (!enabled) { known.current = null; return undefined; }
    let cancelled = false;
    guard(() => api('/playlists'))
      .then(data => { if (!cancelled) setLists(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    const first = setTimeout(loadShared, 0);
    const timer = setInterval(() => { if (!document.hidden) loadShared(); }, POLL_MS);
    return () => { cancelled = true; clearTimeout(first); clearInterval(timer); };
  }, [enabled, guard, loadShared]);

  const create = useCallback(async (name) => {
    const made = await guard(() => api('/playlists', { method: 'POST', body: { name } }));
    setLists(all => [...all, made]);
    return made;
  }, [guard]);

  const rename = useCallback(async (id, name) => {
    const result = await guard(() => api(`/playlists/${id}`, { method: 'PUT', body: { name } }));
    setLists(all => all.map(p => (p.id === id ? { ...p, name: result.name } : p)));
  }, [guard]);

  const remove = useCallback(async (id) => {
    await guard(() => api(`/playlists/${id}`, { method: 'DELETE' }));
    setLists(all => all.filter(p => p.id !== id));
  }, [guard]);

  const addSong = useCallback(async (id, song) => {
    const item = await guard(() => api(`/playlists/${id}/songs`, { method: 'POST', body: { songId: song.id } }));
    setLists(all => all.map(p => (p.id === id ? { ...p, songs: [...p.songs, item] } : p)));
  }, [guard]);

  const removeSong = useCallback(async (id, itemId) => {
    await guard(() => api(`/playlists/${id}/songs/${itemId}`, { method: 'DELETE' }));
    setLists(all => all.map(p => (p.id === id ? { ...p, songs: p.songs.filter(s => s.itemId !== itemId) } : p)));
  }, [guard]);

  /** Offers a playlist to a friend; they get their own copy when they accept. */
  const share = useCallback((id, username) =>
    guard(() => api(`/playlists/${id}/share`, { method: 'POST', body: { username } })), [guard]);

  const acceptShared = useCallback(async (shareId) => {
    const made = await guard(() => api(`/playlists/shared/${shareId}/accept`, { method: 'POST' }));
    setLists(all => [...all, made]);
    setShared(all => all.filter(s => s.shareId !== shareId));
    return made;
  }, [guard]);

  const declineShared = useCallback(async (shareId) => {
    setShared(all => all.filter(s => s.shareId !== shareId));
    await guard(() => api(`/playlists/shared/${shareId}`, { method: 'DELETE' }));
  }, [guard]);

  return { lists, shared, loading, create, rename, remove, addSong, removeSong, share, acceptShared, declineShared };
}
