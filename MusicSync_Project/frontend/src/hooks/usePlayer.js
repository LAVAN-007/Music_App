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
const TAIL_SECONDS = 3; // a listener this close to the end is allowed to finish the song
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

export function usePlayer(audioRef, state, song, send, alone = false, muted = false) {
  const [blocked, setBlocked] = useState(false); // browser refused to autoplay
  const [failedId, setFailedId] = useState(null); // id of a song that could not be loaded
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffering, setBuffering] = useState(false); // waiting for the network mid-song
  const [interrupted, setInterrupted] = useState(false); // the phone took the speaker (a call, another app)
  const [optimistic, setOptimistic] = useState(null); // { playing, key }: what this listener just asked for

  const stateRef = useLatest(state);
  const songRef = useLatest(song);
  const pending = useRef(null); // { key, until }: hands off the audio until the server answers
  const pendingTimer = useRef(0);
  const loadedUrl = useRef(null);
  const sendRef = useLatest(send);
  const endedVersion = useRef(-1);
  const endedAt = useRef(0);
  const seekLead = useRef(MIN_SEEK_LEAD);
  const quickLead = useRef(0.08); // how long a jump within downloaded audio takes on this device
  const quickSeek = useRef(false);
  const lastStall = useRef(-AFTER_STALL_MS);
  const rejoinAt = useRef(0); // while set: paused ahead of the room, buffering until the room gets there
  const seekStarted = useRef(0);
  const lastHardSeek = useRef(-HARD_SEEK_COOLDOWN);
  const correction = useRef(0); // signed speed change in progress, 0 when none
  const aloneRef = useLatest(alone);
  const mutedRef = useLatest(muted); // this listener's own mute; nobody else is affected
  const startTimer = useRef(0);
  const ourPause = useRef(false); // the next 'pause' event is one we asked for
  const interruptedRef = useRef(false);
  const pausedForInterruption = useRef(false); // we paused playback itself (nobody else was listening)
  const playRef = useRef(null);

  const pauseOurselves = useCallback((audio) => {
    if (audio.paused) return;
    ourPause.current = true;
    audio.pause();
  }, []);
  const reconcileRef = useRef(null);

  // The server only moves on once the room's own clock reaches the end of the track, so a listener
  // whose clock is off cannot cut the song short for the others. Until it does, keep reporting.
  const reportEnded = useCallback(() => {
    const s = stateRef.current;
    const now = performance.now();
    if (!s || (endedVersion.current === s.version && now - endedAt.current < 400)) return;
    const duration = audioRef.current?.duration;
    const command = { type: 'ENDED', songId: s.songId, version: s.version };
    if (Number.isFinite(duration)) command.position = duration;
    if (sendRef.current(command)) { endedVersion.current = s.version; endedAt.current = now; }
  }, [audioRef, stateRef, sendRef]);

  const reconcile = useCallback((justChanged, fromSilence = false) => {
    const audio = audioRef.current;
    const s = stateRef.current;
    if (!audio || !s) return;
    if (pending.current) {
      if (pending.current.key === playbackKey(s) && performance.now() < pending.current.until) return;
      pending.current = null;
    }
    audio.muted = mutedRef.current;
    const target = s.playing ? s.position + (serverNow() - s.updatedAt) / 1000 : s.position;
    const measured = Number.isFinite(audio.duration);
    const length = measured ? audio.duration : (songRef.current?.duration || 0) + 1; // the library's figure is rounded
    const roomAtEnd = s.playing && length > 1 && target >= length - 0.15;

    if (!audio.currentSrc || audio.readyState < 1 || interruptedRef.current) {
      // Not playing this track at all (still loading, or a call has the speaker): don't make the others wait.
      if (roomAtEnd) reportEnded();
      return;
    }

    const leftAlone = aloneRef.current && !justChanged && !audio.paused;
    if (roomAtEnd && !leftAlone) {
      const remaining = audio.duration - audio.currentTime;
      if (audio.paused || audio.ended || remaining > TAIL_SECONDS) {
        reportEnded(); // we joined (or woke up) after this track should have finished
        return;
      }
      // A little behind the room and still hearing the last moments: let them play out untouched.
      // The room waits for this listener's own end-of-track report before moving on.
      return;
    }

    if (s.playing && audio.ended && !justChanged) {
      reportEnded(); // finished here before the room got to the end: wait for it rather than replay the tail
      return;
    }

    clearTimeout(startTimer.current);
    if (justChanged || !s.playing) rejoinAt.current = 0;
    const wait = s.updatedAt - serverNow();
    if (s.playing && wait > 0) {
      // Playback is scheduled a moment from now (new song or seek): buffer at the start point, then begin on time.
      pauseOurselves(audio);
      audio.playbackRate = 1;
      if (Math.abs(audio.currentTime - s.position) > 0.05 && !audio.seeking) audio.currentTime = s.position;
      startTimer.current = setTimeout(() => reconcileRef.current?.(true), wait);
      return;
    }

    const drift = audio.currentTime - target;
    const now = performance.now();
    if (!s.playing) {
      pauseOurselves(audio);
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
        // Even a jump inside downloaded audio takes the browser a moment while the room moves on;
        // aim that little bit ahead so the listener lands on the beat instead of just behind it.
        const lead = audio.paused ? 0 : quickLead.current;
        seekStarted.current = audio.paused ? 0 : now;
        quickSeek.current = true;
        audio.currentTime = Math.max(0, target + lead);
      } else {
        // Not downloaded yet: go a little ahead of the room, buffer there, and rejoin when it arrives.
        const lead = seekLead.current;
        seekStarted.current = now;
        quickSeek.current = false;
        rejoinAt.current = now + lead * 1000;
        pauseOurselves(audio);
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
  }, [audioRef, stateRef, songRef, aloneRef, mutedRef, reportEnded, pauseOurselves]);

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
    interruptedRef.current = false;
    pausedForInterruption.current = false;
    setInterrupted(false);
    hold(true);
    audio.muted = mutedRef.current;
    audio.playbackRate = 1;
    audio.play().then(() => setBlocked(false)).catch(() => {});
  }, [audioRef, hold, mutedRef]);

  /** Call after sending PAUSE: stops this listener immediately. */
  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    hold(false);
    clearTimeout(startTimer.current);
    pauseOurselves(audio);
  }, [audioRef, hold, pauseOurselves]);

  /** Call after sending SEEK: jumps this listener immediately and buffers there until playback resumes. */
  const seek = useCallback((position) => {
    const audio = audioRef.current;
    const s = stateRef.current;
    if (!audio || !s || audio.readyState < 1) return;
    hold(s.playing);
    clearTimeout(startTimer.current);
    pauseOurselves(audio);
    audio.currentTime = position;
  }, [audioRef, stateRef, hold, pauseOurselves]);

  /**
   * Call from a click, after sending SELECT: starts buffering the chosen song right away.
   * It plays muted until the server schedules the real start, which also satisfies autoplay rules.
   */
  const prepare = useCallback((next) => {
    const audio = audioRef.current;
    if (!audio || !next?.url) return;
    interruptedRef.current = false;
    pausedForInterruption.current = false;
    setInterrupted(false);
    hold(true);
    clearTimeout(startTimer.current);
    audio.muted = true;
    load(next.url);
    audio.play().then(() => setBlocked(false)).catch(() => {});
  }, [audioRef, hold, load]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio && !pending.current) audio.muted = muted; // while a song is being prepared it stays silent anyway
  }, [audioRef, muted]);

  useEffect(() => { playRef.current = play; }, [play]);

  /**
   * The phone took the speaker away (an incoming call, another app starting to play): the browser
   * pauses us. We stop trying to play, and carry on by ourselves once the speaker is free again.
   * Someone listening alone is paused where they were; in company the room plays on and this
   * listener rejoins it at the live position.
   */
  const resume = useCallback(() => {
    if (!interruptedRef.current) return;
    interruptedRef.current = false;
    setInterrupted(false);
    if (pausedForInterruption.current) {
      pausedForInterruption.current = false;
      if (!stateRef.current?.playing) {
        if (sendRef.current({ type: 'PLAY' })) playRef.current?.();
        return;
      }
    }
    reconcileRef.current?.(true, true);
  }, [stateRef, sendRef]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    const onPause = () => {
      if (ourPause.current) { ourPause.current = false; return; }
      const s = stateRef.current;
      const atEnd = audio.ended || (Number.isFinite(audio.duration) && audio.currentTime >= audio.duration - 0.5);
      const reloading = audio.readyState === 0; // the song is being swapped, not interrupted
      if (!s?.playing || atEnd || reloading || pending.current || interruptedRef.current) return;
      interruptedRef.current = true;
      setInterrupted(true);
      if (aloneRef.current) {
        // Nobody else is listening: hold the song here instead of letting it run on unheard.
        pausedForInterruption.current = sendRef.current({ type: 'PAUSE', position: audio.currentTime });
      }
    };
    const onPlay = () => resume(); // the browser handed the speaker back and resumed us
    const onReturn = () => { if (!document.hidden) resume(); };
    const session = navigator.audioSession; // Safari: reports interruptions directly
    const onSession = () => { if (session.state === 'active') resume(); };
    audio.addEventListener('pause', onPause);
    audio.addEventListener('play', onPlay);
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);
    window.addEventListener('pageshow', onReturn);
    session?.addEventListener?.('statechange', onSession);
    return () => {
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('play', onPlay);
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
      window.removeEventListener('pageshow', onReturn);
      session?.removeEventListener?.('statechange', onSession);
    };
  }, [audioRef, stateRef, sendRef, aloneRef, resume]);

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
        if (quickSeek.current) quickLead.current = Math.min(0.35, quickLead.current * 0.5 + cost * 0.5);
        else seekLead.current = Math.max(MIN_SEEK_LEAD, Math.min(MAX_SEEK_LEAD, seekLead.current * 0.4 + cost * 1.25 * 0.6));
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
    interruptedRef.current = false;
    audio.play().then(() => { setBlocked(false); setInterrupted(false); reconcile(true, true); }).catch(() => {});
  }, [audioRef, reconcile]);

  const playing = optimistic && optimistic.key === playbackKey(state) ? optimistic.playing : !!state?.playing;
  return { blocked, interrupted, resume, failed: !!song && failedId === song.id, buffering: buffering && playing && !blocked && !interrupted, time, duration, playing, unblock, play, pause, seek, prepare };
}
