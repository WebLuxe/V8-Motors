import '../site.css';
import '../flagship.css';
import '../glass.css';
import '../motion.css';
import '../phone.css';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { store } from './store.js';
import { initFx, photosArrive } from './fx.js';
import { initGlass } from './glass.js';
import { initLens } from './lens.js';
import { renderStatus } from './hours.js';

gsap.registerPlugin(ScrollTrigger);
document.documentElement.classList.add('js');
window.__v8 = true; // tells the safety net in <head> that the page script is running

export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
/** Relative prefix back to the site root ('' on root pages, '../' inside /cars/). */
// (the not-found page has a <base> tag that already points at the root, so it needs no prefix)
export const P = location.pathname.includes('/cars/') && !document.querySelector('base') ? '../' : '';
export let lenis = null;
/** Storage can be switched off (blocked site data), and then even reading it throws: that counts as empty, and the page carries on. */
export const stash = (fn) => { try { return fn(); } catch { return null; } };

/* ------------------------------------------------------------------ saved / compare state */
export function syncStoreUI() {
  const saved = store.saved(), cmp = store.compare();
  $$('[data-saved-count]').forEach((n) => (n.textContent = saved.length));
  $$('[data-compare-count]').forEach((n) => (n.textContent = cmp.length));
  $$('[data-saved-link]').forEach((n) => { n.classList.toggle('is-on', saved.length > 0); n.setAttribute('aria-label', `${saved.length} saved car${saved.length === 1 ? '' : 's'}`); });
  $$('[data-compare-link]').forEach((n) => { n.classList.toggle('is-on', cmp.length > 0); n.setAttribute('aria-label', `${cmp.length} car${cmp.length === 1 ? '' : 's'} to compare`); });
  $$('[data-save]').forEach((b) => b.setAttribute('aria-pressed', String(saved.includes(b.dataset.save))));
  $$('[data-compare]').forEach((b) => b.setAttribute('aria-pressed', String(cmp.includes(b.dataset.compare))));
}
export function bump(sel) {
  $$(sel).forEach((b) => { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); });
}

/* ------------------------------------------------------------------ toast (small, never covers the page) */
let toastTimer;
export function toast(msg, action) {
  let t = $('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
  }
  t.innerHTML = `<span>${msg}</span>${action ? `<a href="${action.href}">${action.label}</a>` : ''}`;
  t.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-on'), 3600);
}

/* ------------------------------------------------------------------ privacy notice
   The site only uses localStorage for saved cars and this notice, and no tracking, so this
   is a notice rather than a consent wall. It sits in a corner and never blocks the page. */
function privacyNotice() {
  if (stash(() => localStorage.getItem('v8:notice'))) return;
  const n = document.createElement('div');
  n.className = 'notice';
  n.setAttribute('role', 'region');
  n.setAttribute('aria-label', 'Privacy notice');
  n.innerHTML = `<p>No tracking here. Your saved cars stay on this device. <a href="${P}privacy.html">Privacy policy</a></p>
    <button type="button" class="btn btn-line btn-sm">OK</button>`;
  let timer = 0;
  const close = () => {
    clearTimeout(timer);
    stash(() => localStorage.setItem('v8:notice', '1'));
    n.classList.remove('is-on');
    setTimeout(() => n.remove(), 500);
  };
  const show = () => {
    document.body.appendChild(n);
    requestAnimationFrame(() => n.classList.add('is-on'));
    timer = setTimeout(close, 12000); // it only informs, so it doesn't wait around
  };
  $('button', n).addEventListener('click', close);
  // on the home page it would sit on the main button, so it waits until the visitor has scrolled past the hero
  if (!document.querySelector('.hero')) { show(); return; }
  const past = () => {
    if (scrollY < innerHeight * 1.5) return;
    removeEventListener('scroll', past);
    show();
  };
  addEventListener('scroll', past, { passive: true });
}

const html = document.documentElement;
/* ------------------------------------------------------------------ page transitions: curtains
   Leaving: three layers per side (amber edge, panel, ink) sweep in and meet in the middle,
   showing the logo and where you're going. The next page paints with the curtain already
   closed (a class set in <head> before first paint), then the layers open outwards. */
export const viaCurtain = html.classList.contains('curtain-in');
const ROUTES = {
  'index.html': 'Home', 'inventory.html': 'Catalogue', 'sell.html': 'Sell', 'finance.html': 'Leasing',
  'contact.html': 'Visit us', 'compare.html': 'Compare', 'privacy.html': 'Privacy policy', 'terms.html': 'Terms of sale',
};
const fileOf = (url) => new URL(url, location.href).pathname.split('/').pop() || 'index.html';

let resolveOpen;
/** Resolves once the arrival curtain has opened (immediately if there wasn't one). */
export const curtainOpen = new Promise((r) => (resolveOpen = r));

function initCurtain() {
  const c = $('[data-curtain]');
  const label = $('[data-curtain-label]');
  if (!c) { resolveOpen(); return; }
  const L = $$('.curtain-side--l .cl', c), R = $$('.curtain-side--r .cl', c);
  const mid = $('.curtain-mid', c);

  // arriving: open
  if (viaCurtain) {
    label.textContent = stash(() => sessionStorage.getItem('v8:curtain')) || '';
    stash(() => sessionStorage.removeItem('v8:curtain'));
    gsap.timeline({ onComplete: () => { html.classList.remove('curtain-in'); gsap.set([...L, ...R, mid], { clearProps: 'all' }); resolveOpen(); } })
      .to(mid, { opacity: 0, y: -14, duration: 0.2, ease: 'power2.in' }, 0)
      .to([...L].reverse(), { xPercent: -101, duration: 0.7, ease: 'expo.inOut', stagger: 0.05 }, 0.08)
      .to([...R].reverse(), { xPercent: 101, duration: 0.7, ease: 'expo.inOut', stagger: 0.05 }, 0.08);
    setTimeout(resolveOpen, 420); // let the page start its own entrance while the curtain is still opening
  } else {
    stash(() => sessionStorage.removeItem('v8:curtain'));
    resolveOpen();
  }
  if (reduced) return;

  // warm up the next page as soon as a link is hovered or touched
  const warmed = new Set();
  const warm = (e) => {
    const a = e.target.closest?.('a[href]');
    if (!a || !isInternal(a, e)) return;
    const href = new URL(a.href, location.href).href.split('#')[0];
    if (warmed.has(href)) return;
    warmed.add(href);
    const l = document.createElement('link');
    l.rel = 'prefetch'; l.href = href;
    document.head.appendChild(l);
  };
  addEventListener('pointerover', warm, { passive: true });
  addEventListener('touchstart', warm, { passive: true });

  // leaving: close, then go. Where the browser can change pages smoothly by itself (see initMorph), it does that instead
  let leaving = false;
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || leaving || !isInternal(a, e)) return;
    e.preventDefault();
    leaving = true;
    const url = new URL(a.href, location.href);
    const file = fileOf(url);
    const name = url.pathname.includes('/cars/')
      ? (a.closest('.car')?.querySelector('.car-title')?.textContent || a.textContent || '').trim()
      : ROUTES[file] || 'V8 Motors';
    label.textContent = name;
    c.classList.add('is-active');
    gsap.timeline({ onComplete: () => { stash(() => sessionStorage.setItem('v8:curtain', name)); location.assign(url.href); } })
      .fromTo(L, { xPercent: -101 }, { xPercent: 0, duration: 0.48, ease: 'power3.inOut', stagger: 0.055 }, 0)
      .fromTo(R, { xPercent: 101 }, { xPercent: 0, duration: 0.48, ease: 'power3.inOut', stagger: 0.055 }, 0)
      .fromTo(mid, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' }, 0.4);
  });
  // coming back via the back button restores the old page from cache: make sure it's open
  addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    leaving = false;
    c.classList.remove('is-active');
    html.classList.remove('curtain-in');
    gsap.set([...L, ...R, mid], { clearProps: 'all' });
  });
}

/* ---------------------------------------------------------------- smooth page changes
   In browsers that can carry a page change through themselves (Chrome and Edge, with cross-document View Transitions), a car's
   photo grows from its card into the car page's big photo, and shrinks back into its card on Back. Everything else cross-fades
   softly. Only the one photo is named, at the last moment before the page changes, so nothing else is caught up in it.
   Other browsers, and anyone who asks for less motion, keep the curtain above (or a plain page change). */
const morphs = !reduced && 'onpagereveal' in window && CSS.supports?.('view-transition-name: a');
const PHOTO = 'car-photo';
const isCarPage = (url) => !!url && /\/cars\/[^/]+\.html$/.test(new URL(url, location.href).pathname);
// the card photo of the car at that address, on this page: the one on screen, as a car can have a card in more than one list
const cardPhoto = (url) => {
  const want = new URL(url, location.href).pathname;
  let best = null, bestScore = 0;
  for (const a of document.querySelectorAll('.car a.car-media[href]')) {
    if (new URL(a.href).pathname !== want) continue;
    const r = a.getBoundingClientRect();
    const score = r.width * r.height > 0 ? 1 + (r.bottom > 0 && r.top < innerHeight ? 1 : 0) : 0;
    if (score > bestScore) { best = a.querySelector('img'); bestScore = score; }
  }
  return best;
};
function initMorph() {
  // the curtain and the browser's own page change must never both run: the browser's lifts the menu bar and a car photo above
  // the closed curtain and fades two curtains into each other. When the curtain carried the change, the browser's is skipped
  addEventListener('pageswap', (e) => { if (document.querySelector('[data-curtain].is-active')) e.viewTransition?.skipTransition(); });
  addEventListener('pagereveal', (e) => { if (html.classList.contains('curtain-in')) e.viewTransition?.skipTransition(); });
  if (!morphs) return;
  // a catalogue card off screen skips drawing (content-visibility), and on a fresh page so does every card for the first frame,
  // which is the one the browser photographs: the named card is drawn regardless, until the change is over
  const name = (el) => { if (el) { el.style.viewTransitionName = PHOTO; el.closest('.car')?.style.setProperty('content-visibility', 'visible'); } return el; };
  const clear = () => {
    document.querySelectorAll('img[style*="view-transition-name"]').forEach((el) => { el.style.viewTransitionName = ''; });
    document.querySelectorAll('.car[style*="content-visibility"]').forEach((el) => el.style.removeProperty('content-visibility'));
  };
  // leaving: name the photo that is about to grow (or shrink back)
  addEventListener('pageswap', (e) => {
    clear();
    const to = e.activation?.entry?.url;
    if (!e.viewTransition || !to) return;
    if (isCarPage(location.href) && !isCarPage(to)) name($('[data-gal-img]'));
    else if (isCarPage(to)) name(cardPhoto(to));
  });
  // arriving: name the photo it grows into, then let go of the name once it has
  addEventListener('pagereveal', (e) => {
    clear();
    const from = navigation?.activation?.from?.url;
    if (!e.viewTransition || !from) return;
    const el = isCarPage(location.href) ? (isCarPage(from) ? null : $('[data-gal-img]')) : cardPhoto(from);
    if (!name(el)) return;
    e.viewTransition.finished.finally(clear);
  });
}

function isInternal(a, e) {
  if (e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  if (a.target === '_blank' || a.hasAttribute('download')) return false;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin) return false;
  if (!/(\.html|\/)$/.test(url.pathname)) return false;
  if (url.pathname === location.pathname && url.search === location.search) return false; // same page or #hash
  return true;
}

/** Kept for card links; the curtain handles the transition. */
export function nameForTransition() {}

/* ------------------------------------------------------------------ menu bar underline, dock pill
   One underline under the desktop links glides to whichever link you point at and back to the current
   page; on phones a pill sits behind the current tab. Both carry a view-transition name, so on a page
   change they glide from the old position to the new one. */
function placeUnder(el, target) {
  if (!target) { el.style.opacity = '0'; return; }
  const box = el.parentElement.getBoundingClientRect(), r = target.getBoundingClientRect();
  el.style.opacity = '1';
  el.style.transform = `translateX(${r.left - box.left}px)`;
  el.style.width = `${r.width}px`;
}
function initNavInk() {
  const links = $('[data-nav-links]'), ink = $('[data-nav-ink]');
  if (!links || !ink) return;
  const home = () => placeUnder(ink, $('a[aria-current]', links));
  home();
  requestAnimationFrame(() => ink.classList.add('is-ready'));
  $$('a', links).forEach((a) => {
    a.addEventListener('pointerenter', () => placeUnder(ink, a));
    a.addEventListener('focus', () => placeUnder(ink, a));
  });
  links.addEventListener('pointerleave', home);
  links.addEventListener('focusout', () => setTimeout(() => { if (!links.contains(document.activeElement)) home(); }));
  addEventListener('resize', home, { passive: true });
  document.fonts?.ready.then(home);
}
function initDock() {
  const bar = $('[data-tabbar]'), pill = $('[data-tab-pill]');
  if (!bar || !pill) return;
  const place = () => {
    const cur = $('.tab[aria-current]', bar);
    if (!cur) { pill.style.opacity = '0'; return; }
    pill.style.opacity = '1';
    pill.style.transform = `translateX(${cur.offsetLeft + (cur.offsetWidth - pill.offsetWidth) / 2}px)`;
  };
  place();
  requestAnimationFrame(() => bar.classList.add('is-ready'));
  addEventListener('resize', place, { passive: true });
  // the pill moves as soon as a tab is tapped, so a page the Back button restores from memory still shows the tab you left for
  const own = $('.tab[aria-current]', bar);
  addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    $$('.tab[aria-current]', bar).forEach((x) => x.removeAttribute('aria-current'));
    own?.setAttribute('aria-current', 'page');
    place();
  });
  document.fonts?.ready.then(place);
  // tapping a tab: the pill glides to it straight away, while the curtain closes over the page
  bar.addEventListener('click', (e) => {
    const t = e.target.closest('a.tab[href]');
    if (!t || t.classList.contains('tab--call') || t.hasAttribute('aria-current')) return;
    $$('.tab[aria-current]', bar).forEach((x) => x.removeAttribute('aria-current'));
    t.setAttribute('aria-current', 'page');
    place();
  });
  // a tiny haptic tick under the thumb (Android)
  bar.addEventListener('pointerdown', (e) => { if (e.target.closest('.tab') && e.pointerType === 'touch') navigator.vibrate?.(6); }, { passive: true });
}

/* ------------------------------------------------------------------ menu: a bottom sheet
   Opens from the dock's Menu button. It slides up over a dimmed page (never full screen), follows your
   finger if you drag it down, and closes on a flick down, a tap outside, the close button or Escape. */
function initMenu() {
  const sheet = $('[data-menu]'), scrim = $('[data-menu-scrim]'), openBtn = $('[data-menu-open]');
  if (!sheet || !scrim || !openBtn) return;
  let open = false, lastFocus = null, hideTimer = 0;
  const show = (v) => { sheet.hidden = !v; scrim.hidden = !v; };
  const set = (on) => {
    if (on === open) return;
    open = on;
    openBtn.setAttribute('aria-expanded', String(on));
    clearTimeout(hideTimer);
    if (on) {
      lastFocus = document.activeElement;
      show(true);
      sheet.style.transform = '';
      requestAnimationFrame(() => requestAnimationFrame(() => { sheet.classList.add('is-open'); scrim.classList.add('is-open'); }));
      lenis?.stop();
      html.classList.add('sheet-open');
      setTimeout(() => $('.sheet-close', sheet)?.focus({ preventScroll: true }), 60);
      navigator.vibrate?.(8);
    } else {
      sheet.classList.remove('is-open');
      scrim.classList.remove('is-open');
      sheet.style.transform = '';
      html.classList.remove('sheet-open');
      lenis?.start();
      hideTimer = setTimeout(() => show(false), reduced ? 0 : 420);
      lastFocus?.focus?.({ preventScroll: true });
    }
  };
  openBtn.addEventListener('click', () => set(!open));
  scrim.addEventListener('click', () => set(false));
  $('[data-menu-close]', sheet).addEventListener('click', () => set(false));
  addEventListener('keydown', (e) => { if (open && e.key === 'Escape') set(false); });
  // keep focus inside while open
  sheet.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const f = $$('a[href], button:not([disabled])', sheet), first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  // drag down to close: the sheet follows the finger whenever it's scrolled to the top and the finger
  // moves down (touch events, so the browser's own scrolling doesn't swallow the gesture)
  let y0 = null, dy = 0, t0 = 0, dragging = false;
  sheet.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    y0 = e.touches[0].clientY; dy = 0; t0 = performance.now(); dragging = false;
  }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    const d = e.touches[0].clientY - y0;
    if (!dragging && (d < 6 || sheet.scrollTop > 0)) { if (d < 0 || sheet.scrollTop > 0) y0 = null; return; }
    dragging = true;
    e.preventDefault();
    dy = Math.max(0, d);
    sheet.classList.add('is-dragging');
    sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: false });
  const end = () => {
    if (y0 == null && !dragging) return;
    const v = dy / Math.max(1, performance.now() - t0);
    sheet.classList.remove('is-dragging');
    y0 = null;
    if (dragging && (dy > sheet.offsetHeight * 0.28 || (dy > 30 && v > 0.6))) set(false);
    else sheet.style.transform = '';
    dragging = false;
  };
  sheet.addEventListener('touchend', end);
  sheet.addEventListener('touchcancel', end);
  // a link to the page you're already on just closes the sheet
  sheet.addEventListener('click', (e) => { const a = e.target.closest('a[aria-current]'); if (a) { e.preventDefault(); set(false); } });
  addEventListener('pageshow', () => set(false));
}

/* ------------------------------------------------------------------ scrolling */
// Smooth wheel scrolling is for mouse and trackpad only. On phones and tablets the browser's own touch
// scrolling is smoother than anything script can do, and skipping Lenis keeps the main thread quiet.
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
function initScroll() {
  if (!reduced && finePointer) {
    lenis = new Lenis({ lerp: 0.12, wheelMultiplier: 0.9 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(500, 33); // off for ordinary frames so scrolling stays exact, but after a gap (a hidden tab) time resumes instead of leaping
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || a.getAttribute('href') === '#') return;
    const t = document.querySelector(a.getAttribute('href'));
    if (!t) return;
    e.preventDefault();
    scrollToEl(t);
  });
  const nav = $('[data-nav]');
  ScrollTrigger.create({
    start: 0, end: 'max',
    onUpdate: (s) => {
      const y = s.scroll();
      nav?.classList.toggle('is-scrolled', y > 8);

    },
    // a page that opens part way down (a link to a section, a Back) has the bar it would have had if you'd scrolled there
    onRefresh: (s) => nav?.classList.toggle('is-scrolled', s.scroll() > 8),
  });
}
export function scrollToEl(el, offset = -88) {
  if (lenis) lenis.scrollTo(el, { offset, duration: 1.2 });
  else el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
}

/* ------------------------------------------------------------------ forms: spam protection + validation */
/** Honeypot field + minimum fill time. True when the submission looks automated. */
export function looksLikeSpam(form) {
  const hp = form.querySelector('input[name="website"]');
  const started = +form.dataset.started || 0;
  return !!(hp && hp.value) || (started > 0 && Date.now() - started < 2500);
}
export function armForm(form) { if (form) form.dataset.started = Date.now(); }

/** Shows a message under each invalid field. Returns the first invalid field, or null. */
export function validateFields(fields) {
  let first = null;
  for (const [input, message] of fields) {
    const wrap = input.closest('.input');
    let msg = wrap?.querySelector('.input-error');
    input.setAttribute('aria-invalid', String(!!message));
    if (message) {
      if (!msg && wrap) {
        msg = document.createElement('span');
        msg.className = 'input-error';
        msg.id = `err-${input.name}-${Math.random().toString(36).slice(2, 7)}`;
        wrap.appendChild(msg);
      }
      if (msg) { msg.textContent = message; input.setAttribute('aria-describedby', msg.id); }
      first ??= input;
    } else if (msg) {
      msg.remove();
      input.removeAttribute('aria-describedby');
    }
  }
  first?.focus();
  return first;
}
export const phoneOk = (v) => v.replace(/\D/g, '').length >= 7;

/* ------------------------------------------------------------------ repeat visits: public/sw.js keeps the site's files close, so a
   second visit starts almost at once and a new version still shows up straight away. Not on a local test server. */
function keepFiles() {
  if (!('serviceWorker' in navigator) || !location.hostname.endsWith('github.io')) return;
  addEventListener('load', () => navigator.serviceWorker.register(new URL(P + 'sw.js', document.querySelector('base') ? document.baseURI : location.href).href).catch(() => {}), { once: true });
}

/* ------------------------------------------------------------------ boot */
export function initLayout({ home = false, immersive = false } = {}) {
  keepFiles();
  if ('scrollRestoration' in history) history.scrollRestoration = home ? 'manual' : 'auto';
  initCurtain();
  initMorph();
  initLens();
  photosArrive();
  initNavInk();
  initDock();
  initMenu();
  $$('[data-open-status]').forEach(renderStatus);
  initScroll();
  syncStoreUI();
  window.addEventListener('store:change', syncStoreUI);
  // on the home page the notice waits until the intro is over, so it never covers the start button
  if (home && html.classList.contains('play-intro')) addEventListener('v8:intro-done', () => setTimeout(privacyNotice, 2500), { once: true });
  else if (!immersive) setTimeout(privacyNotice, home ? 2500 : 900);
  $$('form').forEach(armForm);
  wirePhotoScrub();
  if (!immersive) initGlass();
  // on the home page, the effects (reveals, count-ups) start once the intro has handed over
  if (home && html.classList.contains('play-intro')) addEventListener('v8:intro-done', () => initFx(), { once: true });
  else initFx();
  return { lenis };
}

/**
 * Forms reach the dealership through WhatsApp (or email): the message is written for the visitor,
 * they press send in their own app. Nothing is stored on a server.
 */
export function sendMessage(text, via = 'wa') {
  const href = via === 'email'
    ? `mailto:${DEALER_EMAIL}?subject=${encodeURIComponent('Enquiry from the V8 Motors website')}&body=${encodeURIComponent(text)}`
    : `https://wa.me/${DEALER_WA}?text=${encodeURIComponent(text)}`;
  if (via === 'email') location.href = href;
  else window.open(href, '_blank', 'noopener');
  return href;
}
const DEALER_WA = '23052590327';
const DEALER_EMAIL = 'veightmotorsv8@gmail.com';

/** Cards: move across the photo to flick through the car's pictures (mouse and pen only).
    The whole card is one big link laid over the photo, so this works from the card and the photo's position. */
export function wirePhotoScrub(root = document) {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const reset = (media) => {
    if (!media?._orig) return;
    const img = media.querySelector('img');
    img.src = media._orig.src; img.srcset = media._orig.srcset;
    media._i = -1;
    media.classList.remove('is-scrubbing');
  };
  let current = null;
  root.addEventListener('pointermove', (e) => {
    const media = e.target.closest?.('.car')?.querySelector('[data-scrub]');
    if (current && current !== media) { reset(current); current = null; }
    if (!media) return;
    const r = media.getBoundingClientRect();
    if (e.clientY > r.bottom || e.clientY < r.top) { reset(media); return; }
    const list = media.dataset.scrub.split('|');
    if (list.length < 2) return;
    current = media;
    const i = Math.min(list.length - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * list.length)));
    if (media._i === i) return;
    media._i = i;
    const img = media.querySelector('img');
    if (!media._orig) {
      media._orig = { src: img.src, srcset: img.srcset };
      media._pre = list.slice(1).map((u) => Object.assign(new Image(), { src: u })); // warm the rest
    }
    img.srcset = '';
    img.src = i === 0 ? media._orig.src : list[i];
    media.querySelectorAll('.car-ticks i').forEach((t, k) => t.classList.toggle('is-on', k === i));
    media.classList.add('is-scrubbing');
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { reset(current); current = null; });
}
