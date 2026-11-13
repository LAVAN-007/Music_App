// Estimates the difference between this device's clock and the server's, so every
// listener computes the same playback position from the same room state.
let offset = 0;
let bestRtt = Infinity;

export const serverNow = () => Date.now() + offset;

export async function syncClock(samples = 5) {
  for (let i = 0; i < samples; i++) {
    try {
      const started = performance.now();
      const sentAt = Date.now();
      const res = await fetch('/api/time', { cache: 'no-store' });
      const { now } = await res.json();
      const rtt = performance.now() - started;
      // The sample with the shortest round trip has the least uncertainty.
      if (rtt < bestRtt) {
        bestRtt = rtt;
        offset = now - (sentAt + rtt / 2);
      }
    } catch { /* keep the previous estimate */ }
  }
  // Let a later sync replace this estimate even if the network got slower.
  bestRtt = Math.max(bestRtt, 30) * 1.5;
}
