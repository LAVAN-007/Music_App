import { useCallback, useEffect, useRef, useState } from 'react';
import { serverNow } from '../lib/clock';
import { useLatest } from './useLatest';

// Seamless playback comes first: the music is never interrupted to fix an error that a slight,
// steady change of speed can absorb.
const HARD_SEEK_ON_CHANGE = 0.6; // seconds of error tolerated right after a command or a reload
const HARD_SEEK_WHILE_PLAYING = 2.5; // mid-song, only an error this large is worth an audible jump
const HARD_SEEK_FROM_SILENCE = 0.1; // nothing is audible yet, so a jump costs nothing
const HARD_SEEK_COOLDOWN = 10000;
const CORRECT_ABOVE = 0.045; // start adjusting the speed beyond this error...
const CORRECT_UNTIL = 0.015; // ...and stop once it is this small
const CORRECT_SECONDS = 6; // aim to close the gap in about this long
const MIN_CORRECTION = 0.02;
const MAX_CORRECTION = 0.06; // speed change stays small enough not to be heard
const MAX_SEEK_LEAD = 1.5;

/**
 * Keeps an <audio> element locked to the room's playback state.
 *
 * Drift is corrected by playing very slightly faster or slower at one steady speed until the
 * error is gone; playback is only interrupted (a seek) for errors of several seconds.
 * A listener who is alone in the room has nobody to match, so their music is left untouched.
 * New songs and seeks are announced slightly before playback resumes, so listeners buffer and begin together.
 * A seek stalls playback while the browser buffers, so we measure how long seeks take on this
 * connection and aim that far ahead.
 *
 * The listener who presses play, pause or a song gets the effect at once (`play`, `pause`,
 * `prepare`) instead of after a round trip to the server; the server's answer then takes over.
 */
const OPTIMISTIC_MS = 2500; // how long a local action stands in for the server's answer

export function usePlayer(audioRef, state, song, send, alone = false) {
  const [blocked, setBlocked] = useState(false); // browser refused to autoplay
  const [failedId, setFailedId] = useState(null); // id of a song that could not be loaded
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [optimistic, setOptimistic] = useState(null); // { playing, version }: what this listener just asked for

  const stateRef = useLatest(state);
  const songRef = useLatest(song);
  const pending = useRef(null); // { version, until }: hands off the audio until the server answers
  const pendingTimer = useRef(0);
  const loadedUrl = useRef(null);
  const sendRef = useLatest(send);
  const endedVersion = useRef(-1);
  const seekLead = useRef(0);
  const seekStarted = useRef(0);
  const lastHardSeek = useRef(-HARD_SEEK_COOLDOWN);
  const correction = useRef(0); // signed speed change in progress, 0 when none
  const aloneRef = useLatest(alone);
  const startTimer = useRef(0);
  const reconcileRef = useRef(null);

  const reportEnded = useCallback(() => {
    const s = stateRef.current;
    if (!s || endedVersion.current === s.version) return;
    if (sendRef.current({ type: 'ENDED', songId: s.songId, version: s.version })) endedVersion.current = s.version;
  }, [stateRef, sendRef]);

  const reconcile = useCallback((justChanged, fromSilence = false) => {
    const audio = audioRef.current;
    const s = stateRef.current;
    if (!audio || !s) return;
    if (pending.current) {
      if (pending.current.version === s.version && performance.now() < pending.current.until) return;
      pending.current = null;
    }
    audio.muted = false;
    if (!audio.currentSrc || audio.readyState < 1) return;

    const target = s.playing ? s.position + (serverNow() - s.updatedAt) / 1000 : s.position;
    const leftAlone = aloneRef.current && !justChanged && !audio.paused;
    if (s.playing && !leftAlone && Number.isFinite(audio.duration) && target >= audio.duration - 0.15) {
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
      correction.current = 0;
      if (Math.abs(drift) > 0.05 && !audio.seeking) audio.currentTime = target;
      return;
    }

    if (leftAlone) {
      // Nobody to stay in step with: let the music run, whatever the network did to it.
      correction.current = 0;
      if (audio.playbackRate !== 1) audio.playbackRate = 1;
      return;
    }

    const error = Math.abs(drift);
    const limit = fromSilence || audio.paused ? HARD_SEEK_FROM_SILENCE
      : justChanged ? HARD_SEEK_ON_CHANGE : HARD_SEEK_WHILE_PLAYING;
    const canSeekAgain = justChanged || audio.paused || now - lastHardSeek.current > HARD_SEEK_COOLDOWN;
    if (error > limit && !audio.seeking && canSeekAgain) {
      lastHardSeek.current = now;
      seekStarted.current = audio.paused ? 0 : now;
      correction.current = 0;
      audio.playbackRate = 1;
      audio.currentTime = Math.max(0, target + (audio.paused ? 0 : seekLead.current));
    } else {
      // Pick one speed and hold it until the gap is closed, instead of changing speed every tick.
      if (correction.current && (error < CORRECT_UNTIL || Math.sign(drift) !== Math.sign(correction.current))) {
        correction.current = 0;
      }
      if (!correction.current && error > CORRECT_ABOVE) {
        const amount = Math.max(MIN_CORRECTION, Math.min(MAX_CORRECTION, error / CORRECT_SECONDS));
        correction.current = Math.sign(drift) * amount;
      }
      const rate = 1 - correction.current;
      if (audio.playbackRate !== rate) audio.playbackRate = rate;
    }

    if (audio.paused) {
      audio.play().then(() => setBlocked(false)).catch((e) => {
        if (e.name === 'NotAllowedError') setBlocked(true);
      });
    }
  }, [audioRef, stateRef, aloneRef, reportEnded]);

  useEffect(() => {
    reconcileRef.current = reconcile;
    return () => clearTimeout(startTimer.current);
  }, [reconcile]);

  const load = useCallback((url) => {
    const audio = audioRef.current;
    if (!audio || loadedUrl.current === (url || null)) return;
    loadedUrl.current = url || null;
    if (url) audio.src = url;
    else audio.removeAttribute('src');
    audio.load();
  }, [audioRef]);

  // Load the room's current song (a no-op if `prepare` already did).
  useEffect(() => {
    load(song?.url);
  }, [load, song?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Lets a local action stand until the server's next state, or gives up after a moment. */
  const hold = useCallback((playing) => {
    const version = stateRef.current?.version ?? -1;
    pending.current = { version, until: performance.now() + OPTIMISTIC_MS };
    setOptimistic({ playing, version });
    clearTimeout(pendingTimer.current);
    pendingTimer.current = setTimeout(() => {
      // No answer (command lost or refused): fall back to what the room is really doing.
      pending.current = null;
      setOptimistic(null);
      load(songRef.current?.url);
      reconcileRef.current?.(true);
    }, OPTIMISTIC_MS);
  }, [stateRef, songRef, load]);

  useEffect(() => () => clearTimeout(pendingTimer.current), []);

  /** Call from a click, after sending PLAY: starts this listener immediately. */
  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    hold(true);
    audio.muted = false;
    audio.playbackRate = 1;
    audio.play().then(() => setBlocked(false)).catch(() => {});
  }, [audioRef, hold]);

  /** Call after sending PAUSE: stops this listener immediately. */
  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    hold(false);
    clearTimeout(startTimer.current);
    audio.pause();
  }, [audioRef, hold]);

  /** Call after sending SEEK: jumps this listener immediately and buffers there until playback resumes. */
  const seek = useCallback((position) => {
    const audio = audioRef.current;
    const s = stateRef.current;
    if (!audio || !s || audio.readyState < 1) return;
    hold(s.playing);
    clearTimeout(startTimer.current);
    if (!audio.paused) audio.pause();
    audio.currentTime = position;
  }, [audioRef, stateRef, hold]);

  /**
   * Call from a click, after sending SELECT: starts buffering the chosen song right away.
   * It plays muted until the server schedules the real start, which also satisfies autoplay rules.
   */
  const prepare = useCallback((next) => {
    const audio = audioRef.current;
    if (!audio || !next?.url) return;
    hold(true);
    clearTimeout(startTimer.current);
    audio.muted = true;
    load(next.url);
    audio.play().then(() => setBlocked(false)).catch(() => {});
  }, [audioRef, hold, load]);

  // Apply every state change immediately, then keep correcting drift.
  useEffect(() => {
    reconcile(true);
  }, [reconcile, state?.version, state?.songId]);

  useEffect(() => {
    const timer = setInterval(() => reconcile(false), 250);
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
    audio.play().then(() => { setBlocked(false); reconcile(true, true); }).catch(() => {});
  }, [audioRef, reconcile]);

  const playing = optimistic && optimistic.version === state?.version ? optimistic.playing : !!state?.playing;
  return { blocked, failed: !!song && failedId === song.id, time, duration, playing, unblock, play, pause, seek, prepare };
}
