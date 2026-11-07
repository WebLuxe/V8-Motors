import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initLayout, reduced, $, $$, toast, P } from '../lib/layout.js';
import { wireCardActions } from '../lib/card.js';
import { store } from '../lib/store.js';
import { byId, rs, monthly, carName, large } from '../data.js';
import { VIDEOS } from '../videos.js';

initLayout();
wireCardActions();

// The page is pre-rendered; this script only adds behaviour.
const c = byId($('[data-car]')?.dataset.car);
if (c) {
  setupGallery();
  setupVideo();
  setupFinance();
  setupShare();
  setupStage();
}

/* ---------------------------------------------------------------- gallery + lightbox */
function setupGallery() {
  let i = 0;
  const img = $('[data-gal-img]');
  const lb = $('[data-lightbox]');
  const lbImg = $('[data-lb-img]');
  const n = c.images.length;
  // Every photo is fetched ahead of time, and a switch shows the small copy straight away if the big one isn't in yet,
  // so a tap always answers instantly.
  const big = (k) => large(c, k, P);
  const small = (k) => `${P}${c.thumbs[k]}`;
  const ready = new Map();
  const fetchPhoto = (k) => {
    if (!ready.has(k)) {
      const im = new Image();
      im.src = big(k);
      ready.set(k, { im, done: false, wait: (im.decode ? im.decode() : Promise.resolve()).catch(() => {}).then(() => { ready.get(k).done = true; }) });
    }
    return ready.get(k);
  };
  let ask = 0;
  const show = (k, dir = 1) => {
    i = (k + n) % n;
    const at = i, mine = ++ask;
    const p = fetchPhoto(at);
    img.srcset = '';
    img.src = p.done ? big(at) : small(at);
    if (!p.done) p.wait.then(() => { if (mine === ask) img.src = big(at); });
    const mirror = $('[data-gal-reflect]');
    if (mirror) mirror.src = small(at);
    if (!reduced) img.animate([{ opacity: 0.55, transform: `translateX(${dir * 14}px)` }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.16, 1, .3, 1)' });
    fetchPhoto((at + 1) % n);
    fetchPhoto((at - 1 + n) % n);
    img.alt = `${carName(c)}, photo ${i + 1} of ${n}`;
    if (lb.open) { showLightbox(); lbImg.alt = img.alt; }
    $('[data-gal-count]').textContent = `${i + 1} / ${n}`;
    $('[data-lb-count]').textContent = `${i + 1} / ${n}`;
    $$('[data-gal-thumb]').forEach((b) => b.setAttribute('aria-current', String(+b.dataset.galThumb === i)));
  };
  // in full screen: our copy at once, then the dealer's full-size original when it arrives
  const showLightbox = () => {
    const at = i;
    lbImg.src = big(at);
    lbImg.classList.remove('is-zoomed');
    const full = new Image();
    full.src = c.images[at];
    (full.decode ? full.decode() : Promise.resolve()).then(() => { if (lb.open && at === i) lbImg.src = c.images[at]; }).catch(() => {});
  };
  // the rest of the photos, once the page has settled
  (window.requestIdleCallback || setTimeout)(() => { for (let k = 0; k < n; k++) fetchPhoto(k); }, { timeout: 1500 });
  $('[data-gal-prev]')?.addEventListener('click', () => show(i - 1, -1));
  $('[data-gal-next]')?.addEventListener('click', () => show(i + 1, 1));
  $$('[data-gal-thumb]').forEach((b) => {
    b.addEventListener('click', () => show(+b.dataset.galThumb, +b.dataset.galThumb > i ? 1 : -1));
    b.addEventListener('pointerenter', () => fetchPhoto(+b.dataset.galThumb), { passive: true });
  });

  const openLb = () => {
    showLightbox();
    lbImg.alt = img.alt;
    $('[data-lb-count]').textContent = `${i + 1} / ${n}`;
    lb.showModal();
  };
  // swipe between photos; a tap opens full screen
  let sx = null;
  const main = $('.gallery-main');
  main.addEventListener('pointerdown', (e) => (sx = e.button === 0 ? e.clientX : null)); // only the main button counts, not a right-click to save
  main.addEventListener('pointercancel', () => (sx = null));
  main.addEventListener('pointerleave', () => (sx = null));
  main.addEventListener('pointerup', (e) => {
    if (sx === null || e.target.closest('button')) { sx = null; return; }
    const dx = e.clientX - sx; sx = null;
    if (Math.abs(dx) > 50 && n > 1) show(i + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    else if (Math.abs(dx) < 8) openLb();
  });
  $$('[data-gal-open]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); openLb(); }));
  $('[data-lb-close]').addEventListener('click', () => lb.close());
  $('[data-lb-prev]')?.addEventListener('click', () => show(i - 1, -1));
  $('[data-lb-next]')?.addEventListener('click', () => show(i + 1, 1));
  lb.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') show(i - 1, -1); if (e.key === 'ArrowRight') show(i + 1, 1); });
  lb.addEventListener('click', (e) => { if (e.target === lb) lb.close(); });
  const origin = (e) => { const r = lbImg.getBoundingClientRect(); lbImg.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`; };
  lbImg.addEventListener('click', (e) => { origin(e); lbImg.classList.toggle('is-zoomed'); });
  lbImg.addEventListener('pointermove', (e) => lbImg.classList.contains('is-zoomed') && origin(e));
}

/* ---------------------------------------------------------------- the video: TikTok first, YouTube as the fallback.
   Only a car with a video has the button and the player, so most pages stop at the first line here. The player only loads when
   opened, and closing it removes it, which stops the sound. See src/videos.js. */
function setupVideo() {
  const box = $('[data-video-box]');
  if (!box) return;
  const frame = $('[data-video-frame]', box), swap = $('[data-video-swap]', box);
  const clip = VIDEOS[c.id] || {};
  const tiktok = clip.tiktok && `https://www.tiktok.com/player/v1/${clip.tiktok}?autoplay=1&rel=0&description=0&music_info=0`;
  const youtube = clip.youtube && `https://www.youtube-nocookie.com/embed/${clip.youtube}?autoplay=1&rel=0&playsinline=1`;
  const play = (src) => {
    $('iframe', frame)?.remove();
    const f = document.createElement('iframe');
    f.src = src;
    f.title = `Video of the ${carName(c)}`;
    f.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
    f.allowFullscreen = true;
    frame.append(f);
  };
  swap.addEventListener('click', () => { swap.hidden = true; play(youtube); });
  $$('[data-video-open]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    swap.hidden = !(tiktok && youtube);
    play(tiktok || youtube);
    box.showModal();
  }));
  $('[data-video-close]', box).addEventListener('click', () => box.close());
  box.addEventListener('click', (e) => { if (e.target === box) box.close(); });
  // Escape would go to the video frame once it has focus, so listen for it on the page
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && box.open) box.close(); });
  box.addEventListener('close', () => $('iframe', frame)?.remove());
}

/* ---------------------------------------------------------------- the bay: the photo leans towards your pointer */
function setupStage() {
  const slab = $('[data-gal-tilt]');
  if (!slab || reduced || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const ry = gsap.quickTo(slab, 'rotationY', { duration: 0.7, ease: 'power3.out' });
  const rx = gsap.quickTo(slab, 'rotationX', { duration: 0.7, ease: 'power3.out' });
  gsap.set(slab, { transformPerspective: 1800 });
  addEventListener('pointermove', (e) => {
    if (scrollY > innerHeight) return;
    ry((e.clientX / innerWidth - 0.5) * 3);
    rx((0.5 - e.clientY / innerHeight) * 2);
  }, { passive: true });
}

/* ---------------------------------------------------------------- monthly payment */
function setupFinance() {
  const dep = $('[data-mini-dep]'), term = $('[data-mini-term]');
  const out = $('[data-mini-out]');
  const o = { v: monthly(c.price) };
  const upd = () => {
    [dep, term].forEach((x) => x.style.setProperty('--p', ((x.value - x.min) / (x.max - x.min)) * 100 + '%'));
    $('[data-mini-dep-out]').textContent = `${dep.value}%, ${rs((c.price * dep.value) / 100)}`;
    $('[data-mini-term-out]').textContent = `${term.value / 12} year${term.value > 12 ? 's' : ''}`;
    gsap.to(o, { v: monthly(c.price, +dep.value, +term.value), duration: reduced ? 0 : 0.5, ease: 'expo.out', onUpdate: () => (out.innerHTML = `${rs(o.v)}<span> a month</span>`) });
  };
  [dep, term].forEach((x) => x.addEventListener('input', upd));
  upd();
}

/* ---------------------------------------------------------------- share */
function setupShare() {
  $('[data-share]').addEventListener('click', async () => {
    const data = { title: `${carName(c)} at V8 Motors`, text: `${carName(c)}, ${rs(c.price)} at V8 Motors`, url: location.href };
    if (navigator.share) { try { await navigator.share(data); } catch { /* cancelled */ } return; }
    try { await navigator.clipboard.writeText(location.href); toast('Link copied. Paste it anywhere to share this car.'); }
    catch { toast('Copy the address bar to share this car.'); }
  });
}
