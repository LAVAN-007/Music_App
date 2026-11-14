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
const MIN_SEEK_LEAD = 0.5; // a jump to audio that is not downloaded yet aims at least this far ahead...
const MAX_SEEK_LEAD = 4; // ...and at most this far, depending on how slow the connection has been
const HARD_SEEK_UNBUFFERED = 8; // playing fine but this far behind: jump even though it means buffering
const STALLED_SEEK_COOLDOWN = 4000;
const AFTER_STALL_MS = 15000; // just after a buffering gap, a quick jump back into step beats a slow drift

/** True when at least a second of audio from `time` (or everything up to the end) is already downloaded. */
function isBuffered(audio, time) {
  const need = Number.isFinite(audio.duration) ? Math.min(time + 1, audio.duration - 0.05) : time + 1;
  for (let i = 0; i < audio.buffered.length; i++) {
    if (time >= audio.buffered.start(i) - 0.05 && need <= audio.buffered.end(i)) return true;
  }
  return false;
}

/**
 * Keeps an <audio> element locked to the room's playback state.
 *
 * Drift is corrected by playing very slightly faster or slower at one steady speed until the
 * error is gone; playback is only interrupted (a seek) for errors of several seconds.
 * A listener who is alone in the room has nobody to match, so their music is left untouched.
 * New songs and seeks are announced slightly before playback resumes, so listeners buffer and begin together.
 * A listener whose own network falls behind never affects the others. Their catch-up is one clean
 * step: a jump is instant when the audio there is already downloaded; otherwise we jump a little
 * ahead of the room (by how long this connection has needed to buffer), wait there in silence and
 * rejoin exactly when the room arrives.
 *
 * The listener who presses play, pause or a song gets the effect at once (`play`, `pause`,
 * `prepare`) instead of after a round trip to the server; the server's answer then takes over.
 */
const OPTIMISTIC_MS = 2500; // how long a local action stands in for the server's answer

/** Identifies the playback part of a room state; queue edits leave it unchanged. */
const playbackKey = (s) => (s ? `${s.songId}|${s.position}|${s.playing}|${s.updatedAt}` : '');

export function usePlayer(audioRef, state, song, send, alone = false) {
  const [blocked, setBlocked] = useState(false); // browser refused to autoplay
  const [failedId, setFailedId] = useState(null); // id of a song that could not be loaded
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffering, setBuffering] = useState(false); // waiting for the network mid-song
  const [optimistic, setOptimistic] = useState(null); // { playing, key }: what this listener just asked for

  const stateRef = useLatest(state);
  const songRef = useLatest(song);
  const pending = useRef(null); // { key, until }: hands off the audio until the server answers
  const pendingTimer = useRef(0);
  const loadedUrl = useRef(null);
  const sendRef = useLatest(send);
  const endedVersion = useRef(-1);
  const seekLead = useRef(MIN_SEEK_LEAD);
  const lastStall = useRef(-AFTER_STALL_MS);
  const rejoinAt = useRef(0); // while set: paused ahead of the room, buffering until the room gets there
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
      if (pending.current.key === playbackKey(s) && performance.now() < pending.current.until) return;
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
    if (justChanged || !s.playing) rejoinAt.current = 0;
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

    if (rejoinAt.current) {
      const remaining = rejoinAt.current - now;
      if (remaining > 0 && audio.paused) {
        startTimer.current = setTimeout(() => reconcileRef.current?.(false), remaining);
        return;
      }
      rejoinAt.current = 0;
    }

    if (leftAlone) {
      // Nobody to stay in step with: let the music run, whatever the network did to it.
      correction.current = 0;
      if (audio.playbackRate !== 1) audio.playbackRate = 1;
      return;
    }

    const error = Math.abs(drift);
    const limit = fromSilence || audio.paused ? HARD_SEEK_FROM_SILENCE
      : justChanged || now - lastStall.current < AFTER_STALL_MS ? HARD_SEEK_ON_CHANGE : HARD_SEEK_WHILE_PLAYING;
    const sinceSeek = now - lastHardSeek.current;
    const stalled = !audio.paused && audio.readyState < 3; // silent already: out of downloaded audio
    const ready = isBuffered(audio, target); // a jump there is instant, so it may follow sooner
    const canSeekAgain = justChanged || audio.paused || sinceSeek > HARD_SEEK_COOLDOWN
      || ((stalled || ready) && sinceSeek > STALLED_SEEK_COOLDOWN);
    // Never trade music that is playing for a buffering pause unless we are hopelessly far behind.
    const worthIt = ready || audio.paused || stalled || error > HARD_SEEK_UNBUFFERED;
    if (error > limit && !audio.seeking && canSeekAgain && worthIt) {
      lastHardSeek.current = now;
      correction.current = 0;
      audio.playbackRate = 1;
      if (ready || audio.paused) {
        seekStarted.current = 0;
        audio.currentTime = Math.max(0, target);
      } else {
        // Not downloaded yet: go a little ahead of the room, buffer there, and rejoin when it arrives.
        const lead = seekLead.current;
        seekStarted.current = now;
        rejoinAt.current = now + lead * 1000;
        audio.pause();
        audio.currentTime = Math.max(0, target + lead);
        startTimer.current = setTimeout(() => reconcileRef.current?.(false), lead * 1000);
        return;
      }
    } else {
      // Pick one speed and hold it until the gap is closed, instead of changing speed every tick.
      if (correction.current && (error < CORRECT_UNTIL || Math.sign(drift) !== Math.sign(correction.current))) {
        correction.current = 0;
      }
      const amount = Math.max(MIN_CORRECTION, Math.min(MAX_CORRECTION, error / CORRECT_SECONDS));
      // Keep the chosen speed, unless the gap has grown well beyond what it can close.
      if ((!correction.current && error > CORRECT_ABOVE) || (correction.current && amount > Math.abs(correction.current) + 0.015)) {
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
    const key = playbackKey(stateRef.current);
    pending.current = { key, until: performance.now() + OPTIMISTIC_MS };
    setOptimistic({ playing, key });
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
  // Queue edits also raise the version, but they are not a reason to touch the audio.
  useEffect(() => {
    reconcile(true);
  }, [reconcile, state?.songId, state?.position, state?.playing, state?.updatedAt]);

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
    const onCanPlay = () => { setBuffering(false); reconcile(false); };
    const onTime = () => setTime(audio.currentTime);
    const onPlaying = () => { setBlocked(false); setBuffering(false); };
    const onWaiting = () => { lastStall.current = performance.now(); setBuffering(true); };
    const onSeeked = () => {
      setTime(audio.currentTime);
      if (seekStarted.current) {
        // How long this connection needed to fetch audio at a new position; the next such jump aims that far ahead.
        const cost = (performance.now() - seekStarted.current) / 1000;
        seekLead.current = Math.max(MIN_SEEK_LEAD, Math.min(MAX_SEEK_LEAD, seekLead.current * 0.4 + cost * 1.25 * 0.6));
        seekStarted.current = 0;
      }
    };
    const onError = () => { if (audio.currentSrc) setFailedId(stateRef.current?.songId ?? null); };
    const onEmptied = () => { setTime(0); setDuration(0); setBuffering(false); };
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('seeked', onSeeked);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('ended', reportEnded);
    audio.addEventListener('error', onError);
    audio.addEventListener('emptied', onEmptied);
    return () => {
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('seeked', onSeeked);
      audio.removeEventListener('waiting', onWaiting);
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

  const playing = optimistic && optimistic.key === playbackKey(state) ? optimistic.playing : !!state?.playing;
  return { blocked, failed: !!song && failedId === song.id, buffering: buffering && playing && !blocked, time, duration, playing, unblock, play, pause, seek, prepare };
}
