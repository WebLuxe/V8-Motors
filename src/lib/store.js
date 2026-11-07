// Tiny store for the cars you like (kept on this device) and the cars you are comparing (kept only while you browse).
//
// Liked cars stay in localStorage until you remove them. The compare list lives in sessionStorage, so it lasts while you go from
// page to page, and is forgotten when you refresh, when you close the page, or after an hour without touching it.
const KEYS = { saved: 'v8:saved', compare: 'v8:compare' };
const COMPARE_LIFE = 60 * 60 * 1000; // an hour

const parse = (v) => { try { const x = JSON.parse(v); return x; } catch { return null; } };
const list = (x) => (Array.isArray(x) ? x : []); // anything but a list (an old or broken entry) counts as empty
const local = {
  read: (k) => { try { return list(parse(localStorage.getItem(k))); } catch { return []; } },
  write: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window or full storage: carry on without saving */ } },
};
const session = {
  read: (k) => {
    try {
      const x = parse(sessionStorage.getItem(k));
      if (!x || !Array.isArray(x.ids) || Date.now() - (x.at || 0) > COMPARE_LIFE) return [];
      return x.ids;
    } catch { return []; }
  },
  write: (k, ids) => { try { sessionStorage.setItem(k, JSON.stringify({ ids, at: Date.now() })); } catch { /* as above */ } },
};

// a refresh starts the comparing afresh; and what older versions of the site kept for ever is cleared once
try {
  if (performance.getEntriesByType('navigation')[0]?.type === 'reload') sessionStorage.removeItem(KEYS.compare);
  localStorage.removeItem('v8:compare');
  localStorage.removeItem('v8:recent');
} catch { /* storage switched off */ }

export const COMPARE_MAX = 3;

function emit() { window.dispatchEvent(new CustomEvent('store:change')); }

export const store = {
  saved: () => local.read(KEYS.saved),
  isSaved: (id) => local.read(KEYS.saved).includes(id),
  toggleSaved(id) {
    const s = local.read(KEYS.saved);
    const on = !s.includes(id);
    local.write(KEYS.saved, on ? [...s, id] : s.filter((x) => x !== id));
    emit();
    return on;
  },

  compare: () => session.read(KEYS.compare),
  inCompare: (id) => session.read(KEYS.compare).includes(id),
  /** returns 'added' | 'removed' | 'full' */
  toggleCompare(id) {
    const c = session.read(KEYS.compare);
    if (c.includes(id)) { session.write(KEYS.compare, c.filter((x) => x !== id)); emit(); return 'removed'; }
    if (c.length >= COMPARE_MAX) return 'full';
    session.write(KEYS.compare, [...c, id]); emit(); return 'added';
  },
  setCompare(ids) { session.write(KEYS.compare, [...new Set(ids)].slice(0, COMPARE_MAX)); emit(); },
};

// Keep other tabs' liked cars in step (the compare list belongs to one tab, so it has nothing to share).
window.addEventListener('storage', (e) => { if (e.key === KEYS.saved) emit(); });
