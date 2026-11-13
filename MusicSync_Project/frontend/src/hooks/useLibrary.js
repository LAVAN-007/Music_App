import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';

/** Loads the song library, polling while the server is still building it. */
export function useLibrary(enabled, onUnauthorized) {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let timer;
    const load = async () => {
      try {
        const data = await api('/songs');
        if (cancelled) return;
        setSongs(prev => (prev.length === data.songs.length ? prev : data.songs));
        setLoading(data.loading);
        setError('');
        if (data.loading) timer = setTimeout(load, 2500);
      } catch (e) {
        if (cancelled) return;
        if (e.status === 401) { onUnauthorized(); return; }
        setError(e.message);
        timer = setTimeout(load, 4000);
      }
    };
    load();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = useMemo(() => new Map(songs.map(s => [s.id, s])), [songs]);
  const categories = useMemo(() => [...new Set(songs.map(s => s.category || 'Other'))], [songs]);

  return { songs, byId, categories, loading, error };
}
