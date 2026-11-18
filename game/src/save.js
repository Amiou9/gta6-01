// NEON HARBOR — save/load via localStorage: cash, mission progress,
// best wanted level, and settings.
const KEY = 'neonharbor.save.v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (typeof s !== 'object' || s === null) return null;
    return {
      cash: typeof s.cash === 'number' ? s.cash : 250,
      missionsCompleted: typeof s.missionsCompleted === 'number' ? s.missionsCompleted : 0,
      bestWanted: typeof s.bestWanted === 'number' ? s.bestWanted : 0,
      muted: !!s.muted,
      savedAt: s.savedAt || 0,
    };
  } catch { return null; }
}

export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...data, savedAt: Date.now() }));
    return true;
  } catch { return false; }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
