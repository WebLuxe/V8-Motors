import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initLayout, reduced, $, $$, scrollToEl, syncStoreUI } from '../lib/layout.js';
import { calm } from '../lib/fx.js';
import { wireCardActions } from '../lib/card.js';
import { store } from '../lib/store.js';
import { CARS, BODY_TYPES, FUELS, DEALER, byId, rs, thumb, carName } from '../data.js';
import { odo } from '../lib/odo.js';
// words from the address bar are only ever shown as text
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

gsap.registerPlugin(Flip);
initLayout();

const PAGE = 12;
const grid = $('[data-grid]');
const form = $('[data-filters]');
const RANGES = {};
let shown = PAGE;

// A make can't be picked on this page any more, but the home page search and a car page's trail still link here with one
let wantMakes = [];

// dual range sliders
$$('[data-range]').forEach((wrap) => {
  const key = wrap.dataset.range;
  const vals = CARS.map((c) => (key === 'price' ? c.price : c.year));
  wrap.dataset.min = key === 'price' ? Math.floor(Math.min(...vals) / 50000) * 50000 : Math.min(...vals);
  wrap.dataset.max = key === 'price' ? Math.ceil(Math.max(...vals) / 50000) * 50000 : Math.max(...vals);
  const lo = $('[data-lo]', wrap), hi = $('[data-hi]', wrap);
  [lo, hi].forEach((i) => { i.min = wrap.dataset.min; i.max = wrap.dataset.max; i.step = wrap.dataset.step; });
  lo.value = wrap.dataset.min; hi.value = wrap.dataset.max;
  const fill = $('.range2-fill', wrap);
  const out = $(`[data-range-out="${key}"]`);
  const fmt = key === 'price' ? (v) => rs(v) : (v) => v;
  const paint = () => {
    const min = +wrap.dataset.min, max = +wrap.dataset.max;
    if (+lo.value > +hi.value) [lo.value, hi.value] = [hi.value, lo.value];
    const a = ((lo.value - min) / (max - min)) * 100, b = ((hi.value - min) / (max - min)) * 100;
    fill.style.left = a + '%'; fill.style.right = 100 - b + '%';
    out.textContent = `${fmt(+lo.value)} to ${fmt(+hi.value)}`;
  };
  RANGES[key] = {
    get: () => [+lo.value, +hi.value],
    set: (a, b) => { lo.value = a ?? wrap.dataset.min; hi.value = b ?? wrap.dataset.max; paint(); },
    isDefault: () => lo.value === wrap.dataset.min && hi.value === wrap.dataset.max,
    paint,
  };
  // the thumb nearest the pointer comes to the top so both stay grabbable
  wrap.addEventListener('pointerdown', (e) => {
    const r = wrap.getBoundingClientRect();
    const p = (e.clientX - r.left) / r.width;
    const min = +wrap.dataset.min, max = +wrap.dataset.max;
    const pl = (lo.value - min) / (max - min), ph = (hi.value - min) / (max - min);
    lo.style.zIndex = Math.abs(p - pl) < Math.abs(p - ph) ? 3 : 1;
  });
  paint();
});


// ---------------------------------------------------------------- state <-> URL
function readState() {
  const fd = new FormData(form);
  return {
    q: (fd.get('q') || '').trim(),
    body: fd.getAll('body'), make: wantMakes, fuel: fd.getAll('fuel'), gearbox: fd.getAll('gearbox'),
    price: RANGES.price.get(), year: RANGES.year.get(),
    saved: form.saved.checked,
    sort: $('[data-sort]').value, view: grid.dataset.view,
  };
}
function writeUrl(s) {
  const p = new URLSearchParams();
  if (s.q) p.set('q', s.q);
  ['body', 'make', 'fuel', 'gearbox'].forEach((k) => s[k].length && p.set(k, s[k].join(',')));
  if (!RANGES.price.isDefault()) p.set('price', s.price.join('-'));
  if (!RANGES.year.isDefault()) p.set('year', s.year.join('-'));
  if (s.saved) p.set('saved', '1');
  if (s.sort !== 'new') p.set('sort', s.sort);
  if (s.view !== 'list') p.set('view', s.view);
  history.replaceState(null, '', p.toString() ? `?${p}` : location.pathname);
}
function applyUrl() {
  const p = new URLSearchParams(location.search);
  form.q.value = p.get('q') || '';
  wantMakes = (p.get('make') || '').split(',').filter(Boolean);
  ['body', 'fuel', 'gearbox'].forEach((k) => {
    const v = (p.get(k) || '').split(',').filter(Boolean);
    $$(`[name="${k}"]`, form).forEach((i) => (i.checked = v.includes(i.value)));
  });
  const pr = (p.get('price') || '').split('-').map(Number);
  // ?max= comes from the home page search (works without JavaScript too)
  RANGES.price.set(pr[0] || undefined, pr[1] || +p.get('max') || undefined);
  const yr = (p.get('year') || '').split('-').map(Number);
  RANGES.year.set(yr[0] || undefined, yr[1] || undefined);
  form.saved.checked = p.get('saved') === '1';
  $('[data-sort]').value = SORTS[p.get('sort')] ? p.get('sort') : 'new'; // an unknown sort or view in the address falls back to the usual one
  setView(p.get('view') === 'grid' ? 'grid' : 'list', false);
}

// ---------------------------------------------------------------- filtering
function matches(c, s, skip) {
  const q = s.q.toLowerCase();
  return (skip === 'body' || !s.body.length || s.body.includes(c.body)) &&
    (skip === 'make' || !s.make.length || s.make.includes(c.make)) &&
    (skip === 'fuel' || !s.fuel.length || s.fuel.includes(c.fuel)) &&
    (!s.gearbox.length || s.gearbox.includes(c.gearbox)) &&
    c.price >= s.price[0] && c.price <= s.price[1] &&
    c.year >= s.year[0] && c.year <= s.year[1] &&
    (!s.saved || store.isSaved(c.id)) &&
    (!q || `${c.make} ${c.model} ${c.trim} ${c.year} ${c.body} ${c.gearbox}`.toLowerCase().includes(q));
}
const SORTS = {
  new: (a, b) => b.added.localeCompare(a.added),
  'price-asc': (a, b) => a.price - b.price,
  'price-desc': (a, b) => b.price - a.price,
  year: (a, b) => b.year - a.year || b.added.localeCompare(a.added),
  'year-asc': (a, b) => a.year - b.year || b.added.localeCompare(a.added),
};

// Cards are already in the HTML; we only move and hide them.
const cards = new Map($$('.car', grid).map((li) => [li.dataset.id, li]));

function updateFacetCounts(s) {
  BODY_TYPES.filter((t) => $(`[data-n-body="${t}"]`)).forEach((t) => { const n = CARS.filter((c) => c.body === t && matches(c, s, 'body')).length; const el = $(`[data-n-body="${t}"]`); el.textContent = n; el.closest('.body-opt').classList.toggle('is-zero', !n); });
  FUELS.filter((f) => $(`[data-n-fuel="${f}"]`)).forEach((f) => { $(`[data-n-fuel="${f}"]`).textContent = CARS.filter((c) => c.fuel === f && matches(c, s, 'fuel')).length; });
}

function renderChips(s) {
  const chips = [];
  if (s.q) chips.push(['q', '', `“${s.q}”`]);
  ['body', 'make', 'fuel', 'gearbox'].forEach((k) => s[k].forEach((v) => chips.push([k, v, v])));
  if (!RANGES.price.isDefault()) chips.push(['price', '', `${rs(s.price[0])} to ${rs(s.price[1])}`]);
  if (!RANGES.year.isDefault()) chips.push(['year', '', `${s.year[0]} to ${s.year[1]}`]);
  if (s.saved) chips.push(['saved', '', 'Saved']);
  $('[data-chips]').innerHTML = chips.map(([k, v, label]) =>
    `<button type="button" class="chip" data-chip="${k}" data-chip-v="${esc(v)}" aria-label="Remove filter: ${esc(label)}">${esc(label)}<span aria-hidden="true"></span></button>`).join('') +
    (chips.length > 1 ? '<button type="button" class="link chip-clear" data-reset>Clear all</button>' : '');
  const n = $('[data-active-n]');
  n.hidden = !chips.length; n.textContent = chips.length;
}

/** The cars you saved, as one message to the dealer: nothing to retype, and they see what you like. */
function renderGarage(s) {
  const box = $('[data-garage]');
  const cars = store.saved().map(byId).filter(Boolean);
  box.hidden = !s.saved;
  if (!s.saved) return;
  $('[data-garage-sub]').textContent = cars.length
    ? `${cars.length} ${cars.length === 1 ? 'car' : 'cars'} saved on this device. Send the list and we'll tell you what's still here, and when you can drive ${cars.length === 1 ? 'it' : 'them'}.`
    : 'Nothing saved yet. Tap the heart on any car and it shows up here.';
  const send = $('[data-garage-send]');
  send.hidden = !cars.length;
  const lines = cars.map((c) => `- ${carName(c)}, ${rs(c.price)}`).join('\n');
  send.href = `https://wa.me/${DEALER.whatsapp}?text=${encodeURIComponent(`Hi V8 Motors, these are the cars I saved:\n${lines}\nAre they still available, and when can I come and see them?`)}`;
}

let flipTl = null;
function render({ animate = true, keepShown = false } = {}) {
  const s = readState();
  writeUrl(s);
  if (!keepShown) shown = PAGE;
  const list = CARS.filter((c) => matches(c, s)).sort(SORTS[s.sort]);
  const visible = list.slice(0, shown);
  if (animate) calm(grid);
  // only the cards on show are measured: a hidden card has no place, so Flip used to fly it in from the top corner
  flipTl?.progress(1).kill(); flipTl = null;
  const before = new Set([...cards].filter(([, li]) => !li.hidden).map(([id]) => id));
  const flip = animate && !reduced ? Flip.getState([...cards.values()].filter((li) => !li.hidden)) : null;
  const vis = new Set(visible.map((c) => c.id));
  visible.forEach((c) => grid.appendChild(cards.get(c.id)));
  cards.forEach((li, id) => (li.hidden = !vis.has(id)));

  if (reduced) $('[data-count]').textContent = list.length; else odo($('[data-count]'), list.length);
  renderGarage(s);
  $('[data-count-word]').textContent = list.length === 1 ? 'car' : 'cars';
  $('[data-count-btn]').textContent = list.length;
  $('[data-empty]').hidden = list.length > 0;
  $('[data-more-wrap]').hidden = list.length <= PAGE;
  $('[data-more]').hidden = shown >= list.length;
  $('[data-showing]').textContent = `Showing ${Math.min(shown, list.length)} of ${list.length}`;
  $('[data-more-bar]').style.transform = `scaleX(${Math.min(1, shown / list.length)})`;
  renderChips(s);
  updateFacetCounts(s);

  // what was searched for, in words, for the empty state's heading and the WhatsApp message it offers
  const asked = $$('.chip', $('[data-chips]')).map((c) => c.textContent.trim()).join(', ');
  $('[data-empty-title]').textContent = asked ? `Nothing matches ${asked} right now.` : 'Nothing matches that right now.';
  const wa = encodeURIComponent(`Hi V8 Motors, I'm looking for a car: ${asked || 'nothing in stock matches my search yet'}. Please tell me when one arrives.`);
  $('[data-wa-alert]').href = `https://wa.me/${DEALER.whatsapp}?text=${wa}`;

  if (flip) {
    // cards that stay slide to their new place; cards that come in fade up where they will sit; cards that go simply go
    const stay = visible.filter((c) => before.has(c.id)).map((c) => cards.get(c.id));
    const fresh = visible.filter((c) => !before.has(c.id)).map((c) => cards.get(c.id))
      .filter((li) => { const r = li.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; });
    flipTl = Flip.from(flip, { targets: stay, duration: 0.55, ease: 'expo.out', absolute: false, onComplete: () => ScrollTrigger.refresh() });
    if (fresh.length) gsap.fromTo(fresh, { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.55, ease: 'expo.out', stagger: 0.03, overwrite: true, clearProps: 'opacity,transform' });
  } else ScrollTrigger.refresh();
}

let t;
form.addEventListener('input', (e) => {
  if (e.target.closest('[data-range]')) RANGES[e.target.closest('[data-range]').dataset.range].paint();
  clearTimeout(t);
  t = setTimeout(() => render(), e.target.type === 'search' || e.target.type === 'range' ? 180 : 0);
});
$('[data-sort]').addEventListener('change', () => render());
$('[data-more]').addEventListener('click', () => { shown += PAGE; render({ keepShown: true }); });

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-reset]')) {
    form.reset();
    wantMakes = [];
    Object.values(RANGES).forEach((r) => r.set());
    render();
    return;
  }
  const chip = e.target.closest('[data-chip]');
  if (chip) {
    const k = chip.dataset.chip, v = chip.dataset.chipV;
    if (k === 'q') form.q.value = '';
    else if (k === 'make') wantMakes = wantMakes.filter((m) => m !== v);
    else if (k === 'price' || k === 'year') RANGES[k].set();
    else if (k === 'saved') form[k].checked = false;
    else $(`[name="${k}"][value="${CSS.escape(v)}"]`, form).checked = false;
    render();
  }
});

// ---------------------------------------------------------------- view toggle
function setView(v, animate = true) {
  if (animate) calm(grid);
  const flip = animate && !reduced ? Flip.getState($$('.car:not([hidden]), .car:not([hidden]) .car-media, .car:not([hidden]) .car-info', grid)) : null;
  grid.dataset.view = v;
  $$('.view-toggle [data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
  if (flip) Flip.from(flip, { duration: 0.7, ease: 'expo.inOut', nested: true, absolute: false, onComplete: () => ScrollTrigger.refresh() });
}
$$('.view-toggle [data-view]').forEach((b) => b.addEventListener('click', () => { setView(b.dataset.view); writeUrl(readState()); }));

// ---------------------------------------------------------------- mobile filter drawer
const panel = $('[data-filter-panel]');
const scrim = $('[data-scrim]');
function openFilters(on) {
  // closing with the keyboard focus inside it hands the focus back to the button that opened it
  if (!on && panel.classList.contains('is-open') && panel.contains(document.activeElement)) $('[data-open-filters]').focus({ preventScroll: true });
  panel.classList.toggle('is-open', on);
  scrim.hidden = !on;
  document.body.classList.toggle('no-scroll', on);
  if (on) $('input', panel)?.focus({ preventScroll: true });
}
$('[data-open-filters]').addEventListener('click', () => openFilters(true));
$$('[data-close-filters]').forEach((b) => b.addEventListener('click', () => { openFilters(false); if (b.classList.contains('inv-filters-apply')) scrollToEl($('#results')); }));
scrim.addEventListener('click', () => openFilters(false));
document.addEventListener('keydown', (e) => e.key === 'Escape' && panel.classList.contains('is-open') && openFilters(false));

// ---------------------------------------------------------------- compare tray
function renderTray() {
  const ids = store.compare();
  const tray = $('[data-tray]');
  const was = !tray.hidden;
  tray.hidden = ids.length === 0;
  $('[data-tray-n]').textContent = ids.length;
  $('[data-tray-cars]').innerHTML = ids.map((id) => {
    const c = byId(id);
    return c ? `<li><img src="${thumb(c)}" width="48" height="34" alt="" /><span>${c.make} ${c.model}</span>
      <button type="button" data-compare="${id}" aria-pressed="true" aria-label="Remove the ${c.make} ${c.model} from compare">×</button></li>` : '';
  }).join('') + Array.from({ length: 3 - ids.length }, () => '<li class="tray-empty"><span>Add a car</span></li>').join('');
  const go = $('[data-tray-go]');
  go.href = `compare.html?ids=${ids.join(',')}`;
  go.textContent = ids.length > 1 ? `Compare ${ids.length} cars` : 'Add one more';
  go.classList.toggle('is-disabled', ids.length < 2);
  if (!was && !tray.hidden && !reduced) gsap.fromTo(tray, { yPercent: 120 }, { yPercent: 0, duration: 0.7, ease: 'expo.out' });
}
$('[data-tray-clear]').addEventListener('click', () => { store.setCompare([]); syncStoreUI(); });
$('[data-tray-go]').addEventListener('click', (e) => { if (store.compare().length < 2) e.preventDefault(); });
window.addEventListener('store:change', () => { renderTray(); if (form.saved.checked) render({ keepShown: true }); });
wireCardActions();
renderTray();

// ---------------------------------------------------------------- go
applyUrl();
render({ animate: false });
// the native form submit (Enter in the search box) is handled live instead
form.addEventListener('submit', (e) => { e.preventDefault(); openFilters(false); });
