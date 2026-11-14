// Estimates the difference between this device's clock and the server's, so every
// listener computes the same playback position from the same room state.
//
// One measurement is only as good as its round trip: on a slow or jittery connection it can be
// off by half a second, which is heard as one listener playing behind the other. So we keep
// measuring in the background and always trust the quickest round trip seen recently.
const WINDOW_MS = 5 * 60 * 1000; // how long a measurement stays usable
const SAMPLE_TIMEOUT_MS = 6000;
const FAST_SAMPLES = 25; // right after joining: measure often...
const FAST_INTERVAL_MS = 700;
const SLOW_INTERVAL_MS = 20000; // ...then keep an eye on it

let offset = 0;
let samples = []; // { rtt, offset, at }

export const serverNow = () => Date.now() + offset;

async function sample() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SAMPLE_TIMEOUT_MS);
  try {
    const started = performance.now();
    const sentAt = Date.now();
    const res = await fetch('/api/time', { cache: 'no-store', signal: controller.signal });
    const { now } = await res.json();
    const rtt = performance.now() - started;
    samples.push({ rtt, offset: now - (sentAt + rtt / 2), at: started });
  } catch { /* keep the previous estimate */ } finally {
    clearTimeout(timeout);
  }
  const oldest = performance.now() - WINDOW_MS;
  samples = samples.filter(s => s.at >= oldest).slice(-60);
  // The sample with the shortest round trip has the least uncertainty.
  const best = samples.reduce((a, b) => (b.rtt < a.rtt ? b : a), samples[0]);
  if (best) offset = best.offset;
}

/** Takes up to `count` measurements, stopping early once `budgetMs` has passed. */
export async function syncClock(count = 5, budgetMs = Infinity) {
  const deadline = performance.now() + budgetMs;
  for (let i = 0; i < count && performance.now() < deadline; i++) await sample();
}

/** Keeps refining the estimate until the returned function is called. */
export function keepClockSynced() {
  let stopped = false;
  let timer = 0;
  let taken = 0;
  const tick = async () => {
    if (stopped) return;
    if (navigator.onLine !== false) { await sample(); taken++; }
    if (!stopped) timer = setTimeout(tick, taken < FAST_SAMPLES ? FAST_INTERVAL_MS : SLOW_INTERVAL_MS);
  };
  timer = setTimeout(tick, FAST_INTERVAL_MS);
  return () => { stopped = true; clearTimeout(timer); };
}
