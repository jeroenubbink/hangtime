// localStorage wrapper that never throws (private mode, blocked storage, quota).
const PREFIX = 'hangtime.';

export function load(key, fallback) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v == null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}

export function save(key, value) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch { return false; }
}

export function remove(key) {
  try { localStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
}
