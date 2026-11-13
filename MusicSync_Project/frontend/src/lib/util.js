export const ROOM_CODE_LENGTH = 6;
const CODE_CHARS = /[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g;

/** Accepts a typed code or a pasted invite link and returns just the code characters. */
export function cleanRoomCode(input) {
  let text = String(input || '');
  const fromLink = text.match(/[?&]room=([A-Za-z0-9]+)/);
  if (fromLink) text = fromLink[1];
  return text.toUpperCase().replace(CODE_CHARS, '').slice(0, ROOM_CODE_LENGTH);
}

export const inviteLink = (code) => `${window.location.origin}/?room=${code}`;

export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export function avatarColor(name) {
  let hash = 2166136261;
  for (const ch of String(name)) hash = Math.imul(hash ^ ch.codePointAt(0), 16777619);
  return `hsl(${(hash >>> 0) % 360} 55% 46%)`;
}

export const initials = (name) => String(name || '?').trim().slice(0, 1).toUpperCase();

export const thumb = (url) => (url ? url.replace('500x500', '150x150') : '');

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API needs HTTPS; fall back for plain-HTTP LAN addresses.
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    el.remove();
    return ok;
  }
}
