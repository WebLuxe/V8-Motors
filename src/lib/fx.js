/**
 * Small touches that work the same on phones and computers. Every animation here moves
 * only by transform and opacity, so none of it repaints the page.
 *
 * - rise: the one entrance on the site. Headings, panels and cards rise a little and fade up, as a page opens and as they scroll into view
 * - rev bar: a thin line under the menu bar fills like a rev counter as you scroll, red near the end
 * - swipe: on phones, swipe sideways across a car's photo to flick through all its pictures
 * - count-up: numbers marked data-countup count up when they come into view
 */
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/** Card photos fade in once they've arrived (a soft sweep plays over the empty frame until then). */
export function photosArrive() {
  const mark = (img) => img.closest('.car-media')?.classList.add('is-loaded');
  document.querySelectorAll('.car-media img').forEach((img) => { if (img.complete && img.naturalWidth) mark(img); });
  document.addEventListener('load', (e) => { if (e.target.matches?.('.car-media img')) mark(e.target); }, true);
  document.addEventListener('error', (e) => { if (e.target.matches?.('.car-media img')) mark(e.target); }, true);
}

export function initFx() {
  revBar();
  swipePhotos();
  if (reduced) return;
  queueMicrotask(arrivals); // after the page's own script has finished building its content
  countUp();
}

/* ------------------------------------------------------------------ the entrance
   Everything that arrives arrives the same way, in the browser's own animation engine. Nothing is hidden beforehand and nothing
   stays on the element afterwards, so without JS the page simply shows, and it can't fight a hover, the catalogue's sorting or the layout.
   The glass follows by itself: the canvas behind the page reads each panel's place and opacity every frame. It reads the panel's own
   opacity only, so a glass panel has to be listed here itself, never just its parent. */
const ARRIVE = [
  '.page-head > *, .inv-filters, .inv-toolbar, .mini-grid > li, .wizard, .estimate, .finance-intro, .calc, .map-card, .contact-side, .cmp-car, .prose, .notfound > *', // inner pages
  '.gallery, .summary > :not(.specs, .summary-tools), .spec, .tool, .fin-mini-box', // a car
  '.grid-cars > .car', // catalogue rows
  '.finder, .acc-item, .sellband-copy, .countdown-label, .countdown-units > span', // the screens of the home page
].join();
const CURTAIN = 550; // ms until the curtain has parted far enough to see through (the same moment as curtainOpen in layout.js)
const GLIDE = 'cubic-bezier(.16, 1, .3, 1)';
// the Back button brings you back to something you have already seen, so it stays still
const still = reduced || performance.getEntriesByType('navigation')[0]?.type === 'back_forward';
const seen = new WeakSet(); // each thing arrives once
let calmUntil = 0;

/** Bring these in, one after another. The stagger stops growing after a few, so a long list never keeps anyone waiting. */
export function rise(els, { delay = 0, gap = 35, y = 16, duration = 520 } = {}) {
  let i = 0;
  for (const el of els) {
    if (seen.has(el)) continue;
    seen.add(el);
    if (still) continue;
    el.animate([{ opacity: 0, translate: `0 ${y}px` }, {}], { id: 'rise', duration, delay: delay + Math.min(i++, 6) * gap, easing: GLIDE, fill: 'backwards' });
  }
}

/** The home page's lock calls this as the wheel sets off for a screen: its content lands just as the screen does. */
export const arrive = (screen, delay) => rise($$(ARRIVE, screen), { delay, gap: 90, duration: 640 });

/** The catalogue is about to sort or filter with its own animation: anything still arriving ends now, and the cards that sort
    into view don't get a second entrance on top. Cards that scroll into view after it go back to easing in. */
export function calm(root) {
  calmUntil = performance.now() + 900;
  root.getAnimations({ subtree: true }).forEach((a) => { if (a.id === 'rise') a.finish(); });
}

function arrivals() {
  const els = $$(ARRIVE).filter((el) => getComputedStyle(el).position !== 'fixed'); // on a phone the filters are a drawer waiting off screen, not part of the page
  const curtain = document.documentElement.classList.contains('curtain-in');
  // on browsers that show the page before its script has run, what is already on show is left alone: it must not vanish to come back
  const shown = !curtain && performance.getEntriesByName('first-contentful-paint').length > 0;
  const first = els.filter((el) => { const r = el.getBoundingClientRect(); return r.height && r.top < innerHeight && r.bottom > 0; });
  rise(shown ? [] : first, { delay: curtain ? CURTAIN : 40 });
  first.forEach((el) => seen.add(el));
  // the rest fade up as they come into view, but not on a touch screen: a flick brings several in at once, and each waited its
  // turn unseen, so cards and panels vanished mid-flick and came back one by one
  if (still || matchMedia('(hover: none)').matches || !('IntersectionObserver' in window)) return;
  // the moment the first pixel shows, so nothing is ever seen before it fades up
  const io = new IntersectionObserver((entries) => {
    const now = entries.filter((e) => e.isIntersecting).map((e) => e.target);
    now.forEach((el) => io.unobserve(el));
    if (performance.now() < calmUntil) now.forEach((el) => seen.add(el));
    else rise(now, { gap: 70 });
  });
  els.filter((el) => !seen.has(el)).forEach((el) => io.observe(el));
}

/* ------------------------------------------------------------------ rev bar */
function revBar() {
  const nav = document.querySelector('[data-nav]');
  if (!nav) return;
  const bar = document.createElement('span');
  bar.className = 'revbar';
  bar.setAttribute('aria-hidden', 'true');
  nav.appendChild(bar);
  let queued = false;
  const update = () => {
    queued = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    const p = max > 0 ? Math.min(1, scrollY / max) : 0;
    bar.style.transform = `scaleX(${p})`;
    bar.classList.toggle('is-red', p > 0.85);
  };
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener('resize', update, { passive: true });
  update();
}

/* ------------------------------------------------------------------ swipe through a card's photos (touch) */
function swipePhotos() {
  let start = null;
  addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    // the card's title link is stretched over the whole card, so find the photo from the card
    const media = e.target.closest?.('.car')?.querySelector('[data-scrub]') || e.target.closest?.('[data-scrub]');
    if (!media || media.dataset.scrub.split('|').length < 2) return;
    const r = media.getBoundingClientRect();
    if (e.clientY < r.top || e.clientY > r.bottom) return;
    start = { media, x: e.clientX, y: e.clientY, done: false };
  }, { passive: true });
  addEventListener('pointermove', (e) => {
    if (!start || start.done || e.pointerType !== 'touch') return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (Math.abs(dx) < 28 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
    start.done = true;
    step(start.media, dx < 0 ? 1 : -1);
    // the swipe was for the photos, not the link underneath
    const swallow = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
    addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => removeEventListener('click', swallow, { capture: true }), 350);
    setTimeout(() => { start = null; }, 400);
  }, { passive: true });
  addEventListener('pointerup', () => { if (start && !start.done) start = null; }, { passive: true });
  addEventListener('pointercancel', () => { start = null; }, { passive: true });
}
function step(media, dir) {
  const list = media.dataset.scrub.split('|');
  const img = media.querySelector('img');
  if (!media._orig) media._orig = { src: img.src, srcset: img.srcset };
  const i = ((media._sw ?? 0) + dir + list.length) % list.length;
  media._sw = i;
  const next = i === 0 ? media._orig.src : list[i];
  const pre = new Image();
  pre.src = next;
  const show = () => {
    img.srcset = i === 0 ? media._orig.srcset : '';
    img.src = next;
    if (!reduced) img.animate([{ opacity: 0.4, transform: `translateX(${dir * 18}px)` }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.16,1,.3,1)' });
  };
  pre.decode ? pre.decode().then(show, show) : show();
  media.querySelectorAll('.car-ticks i').forEach((t, k) => t.classList.toggle('is-on', k === i));
  media.classList.add('is-scrubbing');
  navigator.vibrate?.(6);
}

/* ------------------------------------------------------------------ count-up numbers */
function countUp() {
  const els = $$('[data-countup]');
  if (!els.length || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const el = e.target, to = parseInt(el.textContent.replace(/\D/g, ''), 10);
      if (!to) continue;
      const t0 = performance.now(), dur = 1100 + Math.min(900, to * 4);
      const tick = (now) => {
        const p = Math.min(1, (now - t0) / dur);
        el.textContent = Math.round(to * (1 - Math.pow(1 - p, 4))).toLocaleString('en-US');
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  });
  els.forEach((el) => io.observe(el));
}
