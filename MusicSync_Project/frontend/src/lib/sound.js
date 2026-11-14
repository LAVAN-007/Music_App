// Small notification sounds, synthesised so there is nothing to download.
let context = null;

const unlock = () => {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!context && Ctx) context = new Ctx();
    if (context?.state === 'suspended') context.resume();
  } catch { /* no Web Audio: stay silent */ }
};

// Browsers only allow sound after the user has interacted with the page.
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
}

function tone(frequency, start, length, volume) {
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(context.destination);
  osc.start(start);
  osc.stop(start + length + 0.02);
}

/** A soft two-note chime: a new chat message or friend request arrived. */
export function playMessageSound() {
  if (!context || context.state !== 'running') return false;
  const now = context.currentTime;
  tone(880, now, 0.16, 0.12);
  tone(1318.5, now + 0.09, 0.22, 0.1);
  return true;
}
