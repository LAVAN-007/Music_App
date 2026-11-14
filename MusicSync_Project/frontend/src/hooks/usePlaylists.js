import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

/** The signed-in user's playlists, stored on the server. Actions throw ApiError for the caller to show. */
export function usePlaylists(enabled, onUnauthorized) {
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);

  const guard = useCallback(async (work) => {
    try {
      return await work();
    } catch (e) {
      if (e.status === 401) onUnauthorized();
      throw e;
    }
  }, [onUnauthorized]);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    guard(() => api('/playlists'))
      .then(data => { if (!cancelled) setLists(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [enabled, guard]);

  const create = useCallback(async (name) => {
    const made = await guard(() => api('/playlists', { method: 'POST', body: { name } }));
    setLists(all => [...all, made]);
    return made;
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

  return { lists, loading, create, remove, addSong, removeSong };
}
