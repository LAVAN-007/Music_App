import { useCallback, useEffect, useRef, useState } from 'react';
import { serverNow } from '../lib/clock';
import { useLatest } from './useLatest';

const HARD_SEEK_ON_CHANGE = 0.25; // seconds of error tolerated right after a command
const HARD_SEEK_WHILE_PLAYING = 0.7; // beyond this, nudging the speed would take too long
const NUDGE_THRESHOLD = 0.04;
const NUDGE_GAIN = 0.5; // fraction of the drift corrected per second
const MAX_NUDGE = 0.1;
const MAX_SEEK_LEAD = 1.5;

/**
 * Keeps an <audio> element locked to the room's playback state.
 *
 * Small drift is corrected by playing slightly faster or slower, in proportion to the error
 * (at most 10%, for a few seconds); large drift by seeking.
 * New songs and seeks are announced slightly before playback resumes, so listeners buffer and begin together.
 * A seek stalls playback while the browser buffers, so we measure how long seeks take on this
 * connection and aim that far ahead.
 */
export function usePlayer(audioRef, state, song, send) {
  const [blocked, setBlocked] = useState(false); // browser refused to autoplay
  const [failedId, setFailedId] = useState(null); // id of a song that could not be loaded
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const stateRef = useLatest(state);
  const sendRef = useLatest(send);
  const endedVersion = useRef(-1);
  const seekLead = useRef(0);
  const seekStarted = useRef(0);
  const lastHardSeek = useRef(0);
  const startTimer = useRef(0);
  const reconcileRef = useRef(null);

  const reportEnded = useCallback(() => {
    const s = stateRef.current;
    if (!s || endedVersion.current === s.version) return;
    if (sendRef.current({ type: 'ENDED', songId: s.songId, version: s.version })) endedVersion.current = s.version;
  }, [stateRef, sendRef]);

  const reconcile = useCallback((justChanged) => {
    const audio = audioRef.current;
    const s = stateRef.current;
    if (!audio || !s || !audio.currentSrc || audio.readyState < 1) return;

    const target = s.playing ? s.position + (serverNow() - s.updatedAt) / 1000 : s.position;
    if (s.playing && Number.isFinite(audio.duration) && target >= audio.duration - 0.15) {
      reportEnded(); // we joined (or woke up) after this track should have finished
      return;
    }

    clearTimeout(startTimer.current);
    const wait = s.updatedAt - serverNow();
    if (s.playing && wait > 0) {
      // Playback is scheduled a moment from now (new song or seek): buffer at the start point, then begin on time.
      if (!audio.paused) audio.pause();
      audio.playbackRate = 1;
      if (Math.abs(audio.currentTime - s.position) > 0.05 && !audio.seeking) audio.currentTime = s.position;
      startTimer.current = setTimeout(() => reconcileRef.current?.(true), wait);
      return;
    }

    const drift = audio.currentTime - target;
    const now = performance.now();
    if (!s.playing) {
      if (!audio.paused) audio.pause();
      audio.playbackRate = 1;
      if (Math.abs(drift) > 0.05 && !audio.seeking) audio.currentTime = target;
      return;
    }

    const limit = justChanged ? HARD_SEEK_ON_CHANGE : HARD_SEEK_WHILE_PLAYING;
    const canSeekAgain = justChanged || now - lastHardSeek.current > 4000;
    if (Math.abs(drift) > limit && !audio.seeking && canSeekAgain) {
      lastHardSeek.current = now;
      seekStarted.current = audio.paused ? 0 : now;
      audio.playbackRate = 1;
      audio.currentTime = Math.max(0, target + (audio.paused ? 0 : seekLead.current));
    } else if (Math.abs(drift) > NUDGE_THRESHOLD) {
      audio.playbackRate = 1 - Math.max(-MAX_NUDGE, Math.min(MAX_NUDGE, drift * NUDGE_GAIN));
    } else {
      audio.playbackRate = 1;
    }

    if (audio.paused) {
      audio.play().then(() => setBlocked(false)).catch((e) => {
        if (e.name === 'NotAllowedError') setBlocked(true);
      });
    }
  }, [audioRef, stateRef, reportEnded]);

  useEffect(() => {
    reconcileRef.current = reconcile;
    return () => clearTimeout(startTimer.current);
  }, [reconcile]);

  // Load the room's current song.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (song) {
      audio.src = song.url;
      audio.load();
    } else {
      audio.removeAttribute('src');
      audio.load();
    }
  }, [audioRef, song?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply every state change immediately, then keep correcting drift.
  useEffect(() => {
    reconcile(true);
  }, [reconcile, state?.version, state?.songId]);

  useEffect(() => {
    const timer = setInterval(() => reconcile(false), 1000);
    const onVisible = () => { if (!document.hidden) reconcile(true); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [reconcile]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    const onMeta = () => { setDuration(audio.duration || 0); reconcile(true); };
    const onCanPlay = () => reconcile(false);
    const onTime = () => setTime(audio.currentTime);
    const onPlaying = () => {
      setBlocked(false);
      if (seekStarted.current) {
        const cost = (performance.now() - seekStarted.current) / 1000;
        seekLead.current = Math.min(MAX_SEEK_LEAD, seekLead.current * 0.5 + cost * 0.5);
        seekStarted.current = 0;
      }
    };
    const onError = () => { if (audio.currentSrc) setFailedId(stateRef.current?.songId ?? null); };
    const onEmptied = () => { setTime(0); setDuration(0); };
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('seeked', onTime);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('ended', reportEnded);
    audio.addEventListener('error', onError);
    audio.addEventListener('emptied', onEmptied);
    return () => {
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('seeked', onTime);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('ended', reportEnded);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('emptied', onEmptied);
    };
  }, [audioRef, stateRef, reconcile, reportEnded]);

  /** Call from a click/tap to satisfy the browser's autoplay policy. */
  const unblock = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.play().then(() => { setBlocked(false); reconcile(true); }).catch(() => {});
  }, [audioRef, reconcile]);

  return { blocked, failed: !!song && failedId === song.id, time, duration, unblock };
}
