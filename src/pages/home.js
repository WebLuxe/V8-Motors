import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initLayout, reduced, $, $$, curtainOpen, stash } from '../lib/layout.js';
import { wireCardActions } from '../lib/card.js';
import { arrive } from '../lib/fx.js';
import { saturdayDeals } from '../lib/hours.js';
import { DARK, HERO } from '../lib/rover-shots.js';
import { markSlow, gpuInfo } from '../lib/device.js';

const ENGINE = new URL('media/intro/engine.mp3', document.baseURI).href;
const NAVS = ['[data-nav]', '.tabbar'];
const GAIN = 0.8; // playback level (the recording itself is mastered quietly)
/* The intro opens on the first flash of the high beams: everything before it in the film below is skipped, the sound with it.
   Its numbers stay in the time of the whole film, so CUT is the only thing that says where it starts. */
const CUT = 4.5;
/* Every device that doesn't draw the 3D car live watches the intro as a film: phones, tablets, touch-screen laptops, and computers
   without a graphics chip or that have struggled before. Nothing can be touched while it runs, so nothing is lost, and they all get
   the same sharp picture with the sound, never a black screen. Both films were rendered from this same scene by scripts/film.mjs,
   from CUT to the end, so they finish on the car's hero pose, where the filmed loop of the car (below) takes over.
   Upright for an upright screen, wide for the rest. mark: where the logo forms in the picture. */
const FILMS = {
  tall: { src: 'media/intro/film.mp4', small: 'media/intro/film-hevc.mp4', w: 420, h: 910, mark: { x: 210.5, y: 372.9, w: 263 } },
  wide: { src: 'media/intro/film-wide.mp4', small: 'media/intro/film-wide-hevc.mp4', w: 960, h: 540, mark: { x: 480, y: 195.1, w: 240 } },
};
const FILM = innerHeight > innerWidth ? FILMS.tall : FILMS.wide;

/* The same devices don't draw the car live afterwards either: they play a short filmed loop of it (scripts/hero-loop.mjs), about
   1 MB, which every device plays smoothly and which costs far less to download than the 3D car. */
const LOOP = (k, hevc) => `media/hero/loop-${k}${hevc ? '-hevc' : ''}.mp4`;
/** This computer's graphics chip and its tier (src/lib/gpu.js), as the page's first script found them (index.html). It already
    weighed everything the live car needs: a mouse or trackpad, a real graphics chip that can draw it smoothly, and no struggles
    remembered (src/lib/device.js). */
const gpu = gpuInfo();

const media = $('[data-hero-media]');
const canvas = $('[data-hero-canvas]');
const dark = $('[data-hero-dark]');

const { lenis } = initLayout({ home: true });
wireCardActions();
startCountdown();
initAccordion();

const playIntro = document.documentElement.classList.contains('play-intro');
if (playIntro) {
  // a refresh always lands at the top of the home page, wherever you were
  const top = () => { scrollTo(0, 0); lenis?.scrollTo(0, { immediate: true, force: true }); };
  top();
  addEventListener('load', () => { if (document.documentElement.classList.contains('play-intro')) top(); }, { once: true }); // not once the intro is over and you have moved on
  lenis?.stop();
}

/* ================================================================== the car
   The Range Rover is drawn live by src/lib/rover3d.js, which brings three.js with it, so it is loaded on its own and
   never holds up the page. Everything here animates one object of numbers, `s`; that file draws what they say.
   With reduced motion, data saver, no WebGL or a failed download, the still of the same car stays on screen. */
const s = { ...(playIntro ? DARK : HERO) };
if (import.meta.env.MODE === 'dbg') { window.__s = s; window.__gsap = gsap; }
const capture = import.meta.env.MODE === 'dbg' && !!window.__capture; // rendering the films themselves: always the live car
const moving3d = !reduced && !navigator.connection?.saveData; // reduced motion and data saver keep the still photo
// the live 3D car: a computer whose graphics chip can draw it smoothly (above). Everything else plays the films of it
const live3d = moving3d && (capture || gpu.live);
const useFilm = playIntro && moving3d && !live3d;
const useLoop = moving3d && !live3d;
const wantStage = live3d;
let stage = null, tooSlow = false, modelDone = 0, onModel = () => {};
// the film is fetched first: it has to play without a pause, and the filmed loop of the car isn't needed until it ends
let filmFetched = () => {};
const filmFirst = useFilm ? new Promise((done) => { filmFetched = done; setTimeout(done, 20000); }) : null;
const stageReady = !wantStage ? Promise.resolve(null) : Promise.resolve(filmFirst).then(() => import('../lib/rover3d.js'))
  .then(({ createStage }) => createStage({
    canvas, s, input: $('.hero'), tier: gpu.tier, forced: !!gpu.forced,
    onProgress: (v) => { modelDone = v * 0.9; onModel(modelDone); }, // the last tenth is getting it ready to draw
    withEngine: playIntro && !useFilm,
    onTap: () => flashLights(0),
    onSign: signBlink,
    onTooSlow: () => { // this machine can't run the car: the filmed car takes over (the photo until it plays), and that is remembered
      stage = null;
      tooSlow = true;
      moving?.kill();
      markSlow(1);
      document.documentElement.classList.remove('has-3d');
      $('[data-hero-moves]')?.setAttribute('hidden', '');
      $('[data-hero-hint]')?.setAttribute('hidden', '');
      if (!useLoop && !reduced) heroLoop();
    },
  }))
  .then((st) => {
    stage = st;
    modelDone = 1;
    onModel(1);
    gsap.ticker.add(() => st.draw());
    return st;
  })
  .catch((e) => { console.warn('3D car unavailable, showing the still', e); document.documentElement.classList.remove('has-3d'); modelDone = 1; onModel(1); return null; });
if (!wantStage) { modelDone = 1; document.documentElement.classList.remove('has-3d'); }
// the loop comes in once the film (if there is one) has arrived, so the two never fight over a slow connection
const loop = useLoop ? Promise.resolve(filmFirst).then(() => heroLoop({ hold: useFilm })) : Promise.resolve(null);

/** The filmed car: upright or sideways to suit the screen, in the smaller format where the device plays it. It fades in over the
    still photo once it is really playing, and rests while it is scrolled out of sight. Held (not playing) while the intro film
    runs on top of it, so the device never decodes two films at once: release() starts it, from its first frame, the hero pose the
    film ends on, and shows it at once so the film can fade straight into it. */
function heroLoop({ hold = false } = {}) {
  let held = hold;
  const v = document.createElement('video');
  v.className = 'hero-loop';
  v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto'; v.disablePictureInPicture = true;
  for (const a of ['muted', 'playsinline', 'loop']) v.setAttribute(a, '');
  v.setAttribute('aria-hidden', 'true');
  const hevc = v.canPlayType('video/mp4; codecs="hvc1.1.6.L120.B0"') === 'probably';
  const pick = () => {
    const src = new URL(LOOP(innerHeight > innerWidth ? 'portrait' : 'landscape', hevc), document.baseURI).href;
    if (v.src !== src) { v.src = src; if (!held) v.play().catch(() => {}); }
  };
  v.addEventListener('playing', () => v.classList.add('is-on'), { once: true });
  v.addEventListener('error', () => { if (hevc && v.src.includes('-hevc')) v.src = v.src.replace('-hevc', ''); }); // said it could, couldn't
  canvas.after(v);
  pick();
  matchMedia('(orientation: portrait)').addEventListener('change', pick);
  let seen = true;
  new IntersectionObserver(([e]) => { seen = e.isIntersecting; if (seen && !held) v.play().catch(() => {}); else v.pause(); }).observe(media);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && seen && !held) v.play().catch(() => {}); });
  v.release = () => {
    if (!held) return;
    held = false;
    v.style.transition = 'none';
    v.classList.add('is-on');
    v.currentTime = 0;
    v.play().catch(() => {});
  };
  return v;
}

setupFinder();
keepPlace();
runIntro().then(async () => {
  document.documentElement.classList.remove('play-intro');
  lenis?.start();
  if (!heroStarted) { await curtainOpen; heroIn(); }
  flashLights();
  showMoves();
  watchHero();
  lockSections();
  ScrollTrigger.refresh();
});

/* ================================================================== back to where you were
   People open a car, go back, and open the next one, so the Back button has to return them to the same spot. */
function keepPlace() {
  const KEY = 'v8:home-at', next = $('.start');
  const top = () => next.getBoundingClientRect().top + scrollY;
  // noted as you go: a page on its way out can no longer be measured reliably
  let at = -1e6;
  addEventListener('scroll', () => { at = scrollY - top(); }, { passive: true });
  addEventListener('pagehide', () => {
    if (at > -innerHeight * 0.25) stash(() => sessionStorage.setItem(KEY, Math.round(Math.max(0, at))));
    else stash(() => sessionStorage.removeItem(KEY));
  });
  if (!document.documentElement.classList.contains('returning')) return;
  const y = top() + (+stash(() => sessionStorage.getItem(KEY)) || 0);
  if (lenis) { lenis.resize(); lenis.scrollTo(y, { immediate: true, force: true }); } else scrollTo({ top: y, behavior: 'instant' });
  document.documentElement.classList.add('returned');
}

/* ================================================================== intro
   Browsers only allow sound after a tap, so the intro opens on the car's start button, on the silver page.
   Pressing it plays a real, healthy V8 (public/media/intro/engine.mp3: a starter crank, then a V8 catching,
   idling smoothly and revving, CC0 recordings from Freesound). The picture runs on the audio clock, and the
   body's roll and the camera shake follow the recording's loudness frame by frame. It starts at CUT; what comes before that
   in the timeline only sets the scene up:
     4.7s  first rev: one flash of the high beams, the camera pushes in
     5.9s  big rev: the hall's lights run towards you, the car launches, tyres smoking
     7.0s  it brakes right in front of you, nose down, and the camera swings out
     6.3s  the V8 Motors badge comes up in the light
     7.2s  last rev: a shine runs across the badge, then it flies up into the menu bar */


/** Fetch and decode the engine recording while the visitor looks at the start button. It is read as a
    stream, so the loader can show how much has arrived. */
function prepareSound(onProgress = () => {}) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { onProgress(1); return null; }
  const ctx = new AC(); // starts suspended until the tap
  const buffer = fetch(ENGINE).then(async (r) => {
    const total = +r.headers.get('content-length') || 0;
    if (!r.body?.getReader || !total) { const b = await r.arrayBuffer(); onProgress(1); return b; }
    const reader = r.body.getReader(), chunks = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); got += value.length;
      onProgress(Math.min(0.99, got / total));
    }
    const out = new Uint8Array(got);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    onProgress(1);
    return out.buffer;
  }).then((b) => new Promise((ok, bad) => ctx.decodeAudioData(b, ok, bad))).catch(() => { onProgress(1); return null; });
  return { ctx, buffer };
}

/* ------------------------------------------------------------------ the loader
   The start screen is the button and nothing else. While the scene loads, its ring fills with real progress (the 3D car
   and the V8, the fonts and the engine recording, which is streamed). When everything is ready the lettering lights up
   and rings of red light roll out from the button. Pressing it early is fine: the intro waits for the car. */

function startLoader(gate) {
  // weights: what you'd wait longest for weighs most
  // a film plays as it arrives, so the button only waits until it can play right through
  const parts = useFilm ? { fonts: [0, 0.1], audio: [0, 0.9] } : { model: [0, 0.7], fonts: [0, 0.05], audio: [0, 0.25] };
  let target = 0, shown = 0, raf = 0, ready = false;
  const set = (k, v) => { if (!parts[k]) return; parts[k][0] = Math.max(parts[k][0], Math.min(1, v)); target = Object.values(parts).reduce((a, [x, w]) => a + x * w, 0); };
  set('model', modelDone);
  onModel = (v) => set('model', v);
  (document.fonts?.ready || Promise.resolve()).then(() => set('fonts', 1));


  const finish = () => {
    if (ready) return;
    ready = true;
    cancelAnimationFrame(raf);
    gate.style.setProperty('--load', '1');
    gate.classList.add('is-ready');
  };
  const note = $('[data-gate-note]', gate);
  const tick = () => {
    shown += (target - shown) * (reduced ? 1 : 0.1);
    if (target > 0.999 && shown > 0.995) shown = 1;
    gate.style.setProperty('--load', shown.toFixed(3));
    // pressed before everything has arrived: say so, honestly, and how far along it is
    if (note && gate.classList.contains('is-waiting')) note.textContent = `Warming up · ${Math.round(shown * 100)}%`;
    if (shown >= 1) return finish();
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  setTimeout(finish, 25000); // never keep anyone waiting on a slow connection
  return { audio: (v) => set('audio', v), stop: () => cancelAnimationFrame(raf) };
}

/** Loudness of the recording, 60 values a second, 0 (idle) to 1 (the biggest rev). */
function envelope(buffer) {
  if (!buffer) return null;
  const d = buffer.getChannelData(0), hop = Math.round(buffer.sampleRate / 60), out = new Float32Array(Math.ceil(d.length / hop));
  for (let i = 0; i < out.length; i++) {
    let s = 0; const a = i * hop, b = Math.min(d.length, a + hop * 2);
    for (let j = a; j < b; j++) s += d[j] * d[j];
    const db = 10 * Math.log10(s / Math.max(1, b - a) + 1e-12);
    out[i] = Math.min(1, Math.max(0, (db + 30) / 19)); // -30 dBFS (idle) .. -11 dBFS (peak)
  }
  return out;
}

/** Fetch the phone film while the visitor looks at the start button, which lights up once it can play right through without
    stopping. iPhones fetch little or nothing before the tap, so there is nothing to wait for on those. */
function prepareFilm(onProgress = () => {}) {
  const v = document.createElement('video');
  const file = (name) => new URL(name, document.baseURI).href;
  v.className = 'hero-film';
  v.src = file(v.canPlayType('video/mp4; codecs="hvc1.1.6.L120.B0"') === 'probably' ? FILM.small : FILM.src); // the smaller file, where the phone can play it
  v.playsInline = true;
  v.muted = true;
  v.preload = 'auto';
  v.disablePictureInPicture = true;
  v.setAttribute('playsinline', '');
  v.setAttribute('aria-hidden', 'true');
  dark.before(v);
  // ready means the rest will arrive before it is needed, judged by how fast it has been arriving so far
  const began = performance.now();
  const report = () => {
    if (!v.duration || !v.buffered.length) return;
    const have = v.buffered.end(v.buffered.length - 1), rate = have / Math.max(0.2, (performance.now() - began) / 1000);
    onProgress(have > 1.5 && (v.duration - have) / rate < v.duration * 0.8 ? 1 : Math.min(0.97, have / v.duration));
    if (have >= v.duration - 0.5) filmFetched();
  };
  const paused = () => { onProgress(1); filmFetched(); }; // the browser has taken all it means to before the tap
  v.addEventListener('progress', report);
  v.addEventListener('suspend', paused);
  v.addEventListener('error', () => {
    if (v.src !== file(FILM.src)) { v.src = file(FILM.src); v.load(); } // it said it could: fall back to the one every phone plays
    else paused();
  });
  if (/iPhone|iPod/.test(navigator.userAgent)) onProgress(1);
  v.load();
  return v;
}

function waitForChoice(gate, film) {
  return new Promise((resolve) => {
    let done = false;
    const pick = (v) => () => { if (done) return; done = true; removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') pick('skip')(); };
    const startFilm = () => { if (film) { film.muted = false; film.play().catch(() => { film.muted = true; film.play().catch(() => { film.failed = true; }); }); } };
    const button = $('[data-ignite]', gate);
    // the button answers the moment a finger or the mouse goes down, before the click has even finished
    button.addEventListener('pointerdown', () => gate.classList.add('is-pressed'));
    button.addEventListener('pointercancel', () => { if (!done) gate.classList.remove('is-pressed'); });
    button.addEventListener('click', () => {
      performance.mark('v8:press'); // for timing the press: see how long until the first frame of the intro
      gate.classList.add('is-pressed');
      if (!done && matchMedia('(pointer: coarse)').matches) navigator.vibrate?.(14); // a short buzz, like a real start button, where the phone can
      // sound and picture have to be started by the tap itself
      if (!done) startFilm();
      pick('sound')();
    });
    addEventListener('keydown', onKey);
    button.focus({ preventScroll: true });
    // pressed while this code was still on its way (the page keeps that press for us): carry on from it now
    if (window.__v8press) { performance.mark('v8:press', { startTime: window.__v8press }); startFilm(); pick('sound')(); }
  });
}


async function runIntro() {
  if (!playIntro) return;
  const gate = $('[data-gate]'), bars = $$('[data-bars] > span'), badge = $('[data-badge]');
  const controls = $('[data-intro-controls]');
  const loader = startLoader(gate);
  const film = useFilm ? prepareFilm(loader.audio) : null;
  const audio = film ? null : prepareSound(loader.audio);
  const phone = innerWidth < 700;

  gsap.set(badge, { opacity: 0 });
  gsap.from(gate.children, { opacity: 0, y: 16, duration: 0.9, stagger: 0.1, ease: 'expo.out', delay: 0.2 });

  // everything the intro needs, gathered while the button is on screen (the car, the recording, the fonts), so that a press
  // has nothing left to do but start. The film doesn't wait for the car: it plays as it arrives
  let allSet = false;
  const needs = Promise.all([
    audio ? Promise.race([audio.buffer, new Promise((r) => setTimeout(r, 10000))]) : null,
    film ? null : Promise.race([stageReady, new Promise((r) => setTimeout(r, 25000))]),
    document.fonts?.ready,
  ]).then(([buffer]) => { allSet = true; return { buffer, env: envelope(buffer) }; });

  const choice = await waitForChoice(gate, film);
  // resume audio inside the tap itself (iOS and Safari require it)
  if (choice === 'sound' && audio) audio.ctx.resume();

  if (choice === 'skip') {
    loader.stop();
    // the browser's own animations keep time even on a struggling device, where the page's clock slows right down
    await gate.animate([{ opacity: 1, scale: 1 }, { opacity: 0, scale: 0.96 }], { duration: 300, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {});
    gate.remove();
    audio?.ctx.close();
    film?.remove();
    filmFetched();
    loop.then((v) => v?.release()); // skipped before the film: the filmed car straight away
    if (stage) gsap.set(dark, { opacity: 0 });
    stageReady.then((st) => { st?.dropEngine(); st?.dropBay(); }); // skipped: neither will be seen
    await gsap.timeline()
      .to(s, { ...HERO, duration: 1.1, ease: 'expo.inOut' }, 0)
      .to(dark, { opacity: 0, duration: 0.9, ease: 'power2.inOut' }, 0)
      .to(bars, { scaleY: 0, duration: 0.8, ease: 'expo.inOut' }, 0)
      .to(NAVS, { opacity: 1, duration: 0.6 }, 0.4)
      .add(heroIn, 0.45);
    finishIntro();
    return;
  }

  // pressed early: the button stays lit and its ring shows how much is left, and the film starts the moment it's all here
  if (!allSet) gate.classList.add('is-waiting');
  const { buffer, env } = await needs;
  loader.stop();
  // the button gives way to the film as it begins, rather than the film waiting for the button to go
  // (the browser's own animation, as above: on a struggling device the button must still be gone in under half a second)
  gate.animate([{ opacity: 1, scale: 1 }, { opacity: 0, scale: 1.03 }], { duration: 450, easing: 'cubic-bezier(.2, .8, .2, 1)', fill: 'forwards' }).finished.then(() => gate.remove(), () => gate.remove());
  const withSound = choice === 'sound' && (buffer || film);
  if (withSound) dispatchEvent(new Event('v8:sound-on'));
  if (!withSound) audio?.ctx.close();
  const full = stage || film; // the whole film, in 3D or as a video
  if (!full) {
    // nothing to show it with after all (the 3D car failed to start): never a black screen with only the sound. The page comes up
    // at once, with the filmed car where it can play
    audio?.ctx.close();
    if (!useLoop && moving3d) heroLoop();
    await gsap.timeline()
      .to(dark, { opacity: 0, duration: 0.9, ease: 'power2.inOut' }, 0)
      .to(bars, { scaleY: 0, duration: 0.8, ease: 'expo.inOut' }, 0)
      .to(NAVS, { opacity: 1, duration: 0.6 }, 0.4)
      .add(heroIn, 0.45);
    finishIntro();
    return;
  }
  gsap.set(dark, { opacity: 0 }); // the scene is its own darkness
  if (film) { s.off = true; gsap.set(bars, { display: 'none' }); } // the 3D car rests until the film hands over to it, and the film fills the screen from its first frame

  // where the badge sits: in the sky above the car, then it flies into the menu bar
  const placeBadge = () => {
    const portrait = innerHeight > innerWidth * 1.25;
    const size = portrait ? Math.min(innerWidth * 0.34, 150) : gsap.utils.clamp(130, 230, innerWidth * 0.14);
    const cy = portrait ? innerHeight * 0.13 : innerHeight * 0.2;
    gsap.set(badge, { width: size, left: innerWidth / 2 - size / 2, top: cy - size * 0.47 });
  };
  placeBadge();

  // ---- the film. Numbers are metres and radians
  const tl = gsap.timeline({ paused: true });
  if (import.meta.env.MODE === 'dbg') window.__tl = tl;
  const Z = DARK.carZ, tall = innerWidth / innerHeight < 0.8, near = (m) => (tall ? m * 1.55 : m); // a tall screen needs more room
  const flash = (at, power) => tl.to(s, { keyframes: [{ high: power, duration: 0.09, ease: 'sine.out' }, { high: 0, duration: 0.85, ease: 'sine.inOut' }] }, at);

  // the shots: close-ups cut together like a car film, each one a slow slide, while the engine settles into its idle.
  // shot(az, el, dist, what it looks at, roll, lens)
  const shot = (az, el, dist, tx, ty, tz, roll, lens) => ({ az, el, near: dist, tx, ty, tz, roll, lens });
  const take = (at, duration, from, to, ease = 'none') => { tl.set(s, from, at).to(s, { ...to, duration, ease }, at); };
  const CUTS = { wheel: 1.62, tail: 2.42, nose: 3.22, out: 3.62 };

  // crank (0.3 to 0.85s): the blade slowly wakes with the starter
  tl.to(s, { drl: 0.12, sweep: 0.62, duration: 0.55, ease: 'sine.inOut' }, 0.3)
    .to(s, { keyframes: [{ jolt: 0.12, duration: 0.2, ease: 'sine.out' }, { jolt: 0, duration: 0.35, ease: 'sine.inOut' }] }, 0.3)
    // 0.9s: it catches. The LEDs ignite, the body kicks and settles on its springs
    .to(s, { keyframes: [{ jolt: 1, duration: 0.08, ease: 'power2.out' }, { jolt: 0, duration: 1.1, ease: 'elastic.out(1, 0.32)' }] }, 0.88)
    .set(s, { drl: 1.35, pod: 1.3 }, 0.9)
    .to(s, { sweep: 1.05, duration: 0.85, ease: 'sine.inOut' }, 0.9)
    .to(s, { drl: 1, pod: 0.6, duration: 0.7, ease: 'sine.inOut' }, 1.75)
    .to(s, { beam: 0.7, dust: 1, duration: 1.2, ease: 'sine.inOut' }, 0.95)
    .to(s, { env: 0.07, key: 0.05, duration: 0.35, ease: 'sine.inOut' }, 0.95)
    // the tail lamps fire on camera
    .set(s, { red: 1.5 }, CUTS.tail + 0.1)
    .to(s, { sweepR: 1.1, duration: 0.5, ease: 'sine.inOut' }, CUTS.tail + 0.1)
    .to(s, { red: 0.8, duration: 0.8, ease: 'sine.inOut' }, CUTS.tail + 0.65)
    .to(s, { env: 0.2, key: 0.18, duration: 0.5, ease: 'sine.inOut' }, CUTS.wheel - 0.3)
    .to(s, { env: 0.06, key: 0.03, beam: 1, duration: 0.8, ease: 'sine.inOut' }, 3.9);
  // the headlamp, drifting along its blade as the pods light
  take(0, CUTS.wheel, DARK, { az: 0.74, el: 0.03, near: near(1.2), tx: 0.6, ty: 1, tz: Z + 2.2, roll: -0.015, lens: 28 }, 'sine.out');
  // down at the front wheel, looking along the flank
  take(CUTS.wheel, CUTS.tail - CUTS.wheel, shot(0.66, 0.01, near(2.5), 0.86, 0.52, Z + 1.0, 0.03, 26), { near: near(2.05), tz: Z + 0.72, ty: 0.48 });
  // behind it, as the tail lamps come on
  take(CUTS.tail, CUTS.nose - CUTS.tail, shot(2.58, 0.05, near(3.1), 0.42, 1.04, Z - 2.1, 0.02, 30), { az: 2.74, near: near(2.7), tx: 0.2 });
  // the lettering across the nose, then straight back down the hall in one long pull, arriving on the first rev
  take(CUTS.nose, CUTS.out - CUTS.nose, shot(0, 0.2, near(2.5), 0, 1.02, Z + 2.25, 0, 28), { near: near(2.3) });
  tl.to(s, { el: 0.012, near: near(11.5), ty: 0.92, tz: Z, lens: 26, duration: 4.64 - CUTS.out, ease: 'power2.inOut' }, CUTS.out);
  // 4.7s: first rev. One flash of the high beams, and the far end of the hall stirs
  flash(4.66, 0.9);
  tl.to(s, { keyframes: [{ hall: 0.16, duration: 0.3, ease: 'sine.out' }, { hall: 0.05, duration: 0.7, ease: 'sine.inOut' }] }, 4.68)
    .to(s, { near: near(10.8), duration: 1, ease: 'sine.out' }, 4.66)
    .to(s, { keyframes: [{ jolt: 0.7, duration: 0.1, ease: 'sine.out' }, { jolt: 0, duration: 0.7, ease: 'elastic.out(1, 0.4)' }] }, 4.66);
  // 5.9s: the big rev. The lights run down the hall towards you and the car launches, squatting, tyres smoking
  flash(5.86, 1);
  tl.to(s, { hall: 1, duration: 1.15, ease: 'power1.inOut' }, 5.86)
    .to(s, { env: 1, key: 1, duration: 1.3, ease: 'power2.in' }, 5.9)
    .to(s, { beam: 1, duration: 0.3 }, 5.86)
    .to(s, { carZ: 0, duration: 1.6, ease: 'power2.inOut' }, 5.92)
    .to(s, { dive: -1, duration: 0.5, ease: 'sine.out' }, 5.92)
    .to(s, { smoke: 1, duration: 2, ease: 'none' }, 5.95)
    .to(s, { lens: 38, duration: 1.3, ease: 'sine.inOut' }, 5.92)
    .to(bars, { scaleY: 0, duration: 1, ease: 'expo.inOut' }, 6)
    .to(dark, { opacity: 0, duration: 2, ease: 'power2.inOut' }, 6.15) // only still there when the 3D car isn't
    // it brakes right in front of you: the nose dips as it slows, and rocks back as it stops
    .to(s, { keyframes: [{ dive: 1.3, duration: 0.5, ease: 'sine.inOut' }, { dive: 0, duration: 1.1, ease: 'back.out(2.2)' }] }, 6.86);

  // 7.8s: facing you, it pops its bonnet. The V8 rises out of the bay, comes apart in the air, and the pieces fly together
  // into the logo, which goes up into the menu bar. Without the 3D car, the badge simply comes up in the light
  const E = 7.8, hero = full ? E + 4.75 : 7.2, gone = full ? E + 5.1 : 7.95;
  // where the logo forms: in the live scene, or in the film, which is cropped to fill the screen
  const markAt = () => {
    if (!film) return stage?.markOnScreen();
    const box = media.getBoundingClientRect(), k = Math.max(box.width / FILM.w, box.height / FILM.h);
    return { x: box.left + box.width / 2 + (FILM.mark.x - FILM.w / 2) * k, y: box.top + box.height / 2 + (FILM.mark.y - FILM.h / 2) * k, w: FILM.mark.w * k };
  };
  if (full) {
    tl.to(s, { near: tall ? near(6.4) : 6.9, el: 0.13, ty: 1.62, tz: 1, lens: 30, duration: 1.6, ease: 'sine.inOut' }, E - 0.55)
      .to(s, { keyframes: [{ bonnet: 0.05, duration: 0.09, ease: 'power2.out' }, { bonnet: 0.035, duration: 0.14, ease: 'sine.in' }] }, E)
      .to(s, { keyframes: [{ jolt: 0.4, duration: 0.06, ease: 'power2.out' }, { jolt: 0, duration: 0.5, ease: 'sine.out' }] }, E)
      .to(s, { bonnet: 1, duration: 0.8, ease: 'power2.inOut' }, E + 0.28)
      .to(s, { bayGlow: 1, duration: 0.8, ease: 'sine.in' }, E + 0.3)
      .to(s, { hall: 0.62, beam: 0.3, duration: 0.8, ease: 'sine.inOut' }, E + 0.4)
      .to(s, { eRise: 1, duration: 1, ease: 'power2.inOut' }, E + 1.05) // only once the bonnet is fully up
      .to(s, { keyframes: [{ dive: -0.7, duration: 0.25, ease: 'power2.out' }, { dive: 0, duration: 0.9, ease: 'elastic.out(1, 0.4)' }] }, E + 1.05)
      .to(s, { bayGlow: 0.5, duration: 1, ease: 'sine.inOut' }, E + 1.1)
      // it revs up there, and shakes itself to pieces
      .to(s, { eShake: 1, duration: 0.4, ease: 'power2.in' }, E + 1.85);
    flash(E + 2.25, 0.9);
    tl.to(s, { eBurst: 1, duration: 1.05, ease: 'none' }, E + 2.25)
      .to(s, { hall: 0.4, bayGlow: 0, duration: 0.8, ease: 'sine.inOut' }, E + 2.3)
      .to(s, { eForm: 1, duration: 1.15, ease: 'none' }, E + 2.95)
      // the moment the pieces land the badge is there in their place, in a flash of light
      .add(() => { const m = markAt(); if (m) gsap.set(badge, { width: m.w, left: m.x - m.w / 2, top: m.y - (m.w * 343) / 728 }); }, E + 3.8)
      .fromTo(badge, { opacity: 0, scale: 1.12 }, { opacity: 1, scale: 1, duration: 0.3, ease: 'power2.out' }, E + 3.98);
    flash(E + 4, 1);
    // the bonnet drops and the hall comes back up
    tl.to(s, { bonnet: 0, duration: 0.5, ease: 'power2.in' }, E + 4.15)
      .to(s, { keyframes: [{ jolt: 1, dive: 0.7, duration: 0.07, ease: 'power2.out' }, { jolt: 0, dive: 0, duration: 0.8, ease: 'elastic.out(1, 0.38)' }] }, E + 4.65)
      .to(s, { hall: 1, duration: 0.7, ease: 'sine.inOut' }, E + 4.2)
      .add(() => stage?.dropEngine(), E + 4.4);
  } else {
    tl.fromTo(badge, { opacity: 0, scale: 1.35 }, { opacity: 1, scale: 1, duration: 0.9, ease: 'expo.out' }, 6.3);
  }
  // and the camera swings out to the hero
  tl.to(s, { frame: 1, az: HERO.az, el: HERO.el, tx: HERO.tx, ty: HERO.ty, tz: HERO.tz, duration: 1.65, ease: 'sine.inOut' }, hero)
    .to(s, { beam: HERO.beam, red: HERO.red, drl: HERO.drl, pod: HERO.pod, dust: HERO.dust, duration: 1.5, ease: 'power2.inOut' }, hero + 0.1)
    // a last pulse on the badge and of the lights
    .to(badge, { keyframes: [{ scale: 1.08, duration: 0.08 }, { scale: 1, duration: 0.6, ease: 'power2.out' }] }, hero + 0.02)
    .to(s, { keyframes: [{ high: 0.6, duration: 0.1, ease: 'sine.out' }, { high: 0, duration: 0.7, ease: 'sine.inOut' }] }, hero + 0.02)
    .add(heroIn, gone - 0.15)
    .add(() => flyBadge(), gone)
    .to(NAVS, { opacity: 1, duration: 0.8, ease: 'power2.out' }, gone + 0.15)
    .to({}, { duration: 0.01 }, gone + 0.95);
  // on a phone the dock comes up where Sound and Skip are, so they leave first
  if (innerWidth < 900) tl.to(controls, { opacity: 0, duration: 0.25 }, gone - 0.1);

  // the badge flies to the logo in the menu bar and hands over to it
  function flyBadge() {
    const target = $('.nav .wordmark-mark').getBoundingClientRect();
    const r = badge.getBoundingClientRect();
    gsap.to(badge, {
      x: target.left + target.width / 2 - (r.left + r.width / 2), y: target.top + target.height / 2 - (r.top + r.height / 2),
      scale: target.width / r.width, duration: 0.9, ease: 'expo.inOut',
      onComplete: () => gsap.to(badge, { opacity: 0, duration: 0.25 }),
    });
  }

  // the body rocks and the camera trembles with the recording's loudness
  const REV_AT = E + 1.6, REV_FROM = 5.2;
  const react = (t) => {
    if (!env || t < 0.85 || t > 12.2) { s.rev = 0; return; }
    const at = stage && t > REV_AT ? t - REV_AT + REV_FROM : t; // the second rev, for the engine in the air
    const fadeOut = t > 11 ? Math.max(0, 1 - (t - 11) / 1.1) : t > 7.5 && t < REV_AT ? Math.max(0.15, 1 - (t - 7.5) / 1.1) : 1;
    s.rev = env[Math.min(env.length - 1, Math.floor(at * 60))] * fadeOut * (phone ? 0.8 : 1);
  };

  // controls while it plays: sound off, skip
  controls.hidden = false;
  gsap.from(controls, { opacity: 0, duration: 0.6, delay: 0.4 });
  let skipped = false, vol = null;
  $('[data-mute]', controls).hidden = !withSound;
  $('[data-mute]', controls).addEventListener('click', (e) => {
    if (!vol && !film) return;
    const off = e.currentTarget.getAttribute('aria-pressed') !== 'true';
    e.currentTarget.setAttribute('aria-pressed', String(off));
    e.currentTarget.textContent = off ? 'Sound on' : 'Sound off';
    if (film) film.muted = off;
    else vol.gain.setTargetAtTime(off ? 0 : GAIN, audio.ctx.currentTime, 0.08);
  });
  const skipNow = () => { skipped = true; };
  $('[data-intro-skip]', controls).addEventListener('click', skipNow);
  const onKey = (e) => { if (e.key === 'Escape') skipNow(); };
  addEventListener('keydown', onKey);

  // the film fades away to the live car, once the car is there to hand over to
  let handed = false;
  const handOver = () => {
    if (handed || !film) return;
    handed = true;
    stageReady.then(() => {
      s.off = false;
      stage?.draw(true);
      // the filmed loop starts where the film ends, on the car's hero pose
      if (useLoop) loop.then((v) => v?.release());
      gsap.to(film, { opacity: 0, duration: useLoop ? 0.6 : 0.36, ease: 'sine.inOut' }); // it plays on unseen: it is the clock and the sound
    });
  };
  const carryOn = () => { if (!document.hidden && film && !film.ended && film.paused && !handed) film.play().catch(() => {}); };
  if (film) document.addEventListener('visibilitychange', carryOn);
  const tapped = performance.now();

  tl.time(CUT);
  await new Promise((resolve) => {
    let t0 = film ? 0 : performance.now() / 1000;
    if (withSound && !film) {
      const { ctx } = audio;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      vol = ctx.createGain();
      src.connect(vol).connect(ctx.destination);
      t0 = ctx.currentTime + 0.05;
      // it joins a recording already running, so it comes up quickly rather than clicking on
      vol.gain.setValueAtTime(0, t0);
      vol.gain.linearRampToValueAtTime(GAIN, t0 + 0.08);
      src.start(t0, CUT);
      // the engine revs again up in the air, then the clock keeps running after the recording has ended
      if (stage) {
        const again = ctx.createBufferSource();
        again.buffer = buffer;
        again.connect(vol);
        again.start(t0 + REV_AT - CUT, REV_FROM);
      }
    }
    const now = () => (film ? film.currentTime : withSound ? audio.ctx.currentTime : performance.now() / 1000);
    const tick = () => {
      // a film that can't start (blocked, or a connection too slow to begin) is not worth waiting for
      if (film && (film.failed || film.error || (film.currentTime < 0.05 && performance.now() - tapped > 7000))) skipped = true;
      if (skipped) {
        gsap.ticker.remove(tick);
        if (film) { film.pause(); handOver(); }
        if (vol) vol.gain.setTargetAtTime(0, audio.ctx.currentTime, 0.15);
        react(99);
        gsap.to(tl, { time: tl.duration(), duration: 1.1, ease: 'power2.inOut', onComplete: resolve });
        return;
      }
      // the picture follows the audio clock: if a frame drops, it catches up instead of drifting
      let t = Math.max(0, now() - t0) + CUT;
      if (import.meta.env.MODE === 'dbg' && window.__hold !== undefined) t = window.__hold;
      if (film && (film.ended || t >= tl.duration() - 0.04)) t = tl.duration();
      if (film && t >= tl.duration() - 0.3) handOver(); // the filmed loop takes over at the very end, on the hero pose
      tl.time(Math.min(t, tl.duration()));
      if (!performance.getEntriesByName('v8:intro').length) performance.mark('v8:intro');
      react(t);
      if (t >= tl.duration()) { gsap.ticker.remove(tick); resolve(); }
    };
    gsap.ticker.add(tick);
  });
  removeEventListener('keydown', onKey);
  document.removeEventListener('visibilitychange', carryOn);
  film?.pause();
  stageReady.then(() => film?.remove()); // not before the car has taken over, however late it arrives
  gsap.to(controls, { opacity: 0, duration: 0.3, onComplete: () => controls.remove() });
  if (withSound && !film) audio.ctx.close().catch(() => {});
  stage?.dropEngine();
  stage?.dropBay();
  finishIntro();
}

function finishIntro() {
  Object.assign(s, HERO);
  gsap.set(NAVS, { clearProps: 'opacity' }); // never touch the nav's transform: it slides via CSS
  $('[data-badge]')?.remove();
  $('[data-bars]')?.remove();
  $('[data-intro-controls]')?.remove();
  dispatchEvent(new Event('v8:intro-done'));
}

/* ================================================================== the Range Rover flashes its lights at you
   Once the home page is showing (after the intro, or on arriving from another page) the car gives a soft flash
   of its high beams. Tap the car and it does it again. */
let flashing = false;
async function flashLights(delay = 0.7) {
  if (reduced) return;
  await stageReady;
  if (!stage || flashing || moving || scrollY > 40 || document.documentElement.classList.contains('play-intro')) return;
  flashing = true;
  gsap.to(s, {
    delay, onComplete: () => { flashing = false; },
    keyframes: [{ high: 0.85, duration: 0.16, ease: 'sine.out' }, { high: 0, duration: 0.9, ease: 'sine.inOut' }],
  });
}

/* ================================================================== the car's party tricks
   Each one is a timeline on the same numbers the intro uses. Scrolling away settles the car straight back. */
const PLAY = {
  spin() {
    const tl = gsap.timeline();
    Object.assign(s, { skid: 0, spin: 0 });
    tl.to(s, { rev: 1, lock: 0.62, dive: -1, pull: 0.2, duration: 0.3, ease: 'power2.out' }, 0)
      .to(s, { burn: 1, duration: 0.3, ease: 'power1.in' }, 0.12)
      .set(s, { skid: 1 }, 0.3)
      .to(s, { spin: Math.PI * 2, duration: 2.3, ease: 'power2.inOut' }, 0.25)
      .to(s, { lean: 1, dive: 0, duration: 0.5, ease: 'sine.out' }, 0.5)
      .to(s, { high: 0.7, duration: 0.12, ease: 'none' }, 1.3)
      .to(s, { high: 0, duration: 0.5, ease: 'sine.in' }, 1.42)
      .to(s, { burn: 0, rev: 0, lock: 0, lean: 0, duration: 0.55, ease: 'sine.inOut' }, 2.0)
      .to(s, { dive: 1, duration: 0.2, ease: 'power2.out' }, 2.4)
      .to(s, { dive: 0, pull: 0, duration: 0.6, ease: 'sine.inOut' }, 2.6);
    // light chases along the sign while the car goes round
    tl.to(s, { waveAmp: 2.2, duration: 0.2, ease: 'none' }, 0.3)
      .fromTo(s, { wave: -0.2 }, { wave: 1.2, duration: 0.6, repeat: 2, ease: 'none' }, 0.3)
      .to(s, { waveAmp: 0, duration: 0.25, ease: 'none' }, 2.05);
    return tl;
  },
  dance() {
    const tl = gsap.timeline();
    const beat = 0.34;
    const steps = [{ nod: -1, hop: 0.07 }, { nod: 1, hop: 0.07 }, { nod: 0, lean: 1, hop: 0.05 }, { nod: 0, lean: -1, hop: 0.05 }, { nod: -1, lean: 0, hop: 0.09 }, { nod: 1, hop: 0.09 }];
    steps.forEach((step, i) => {
      tl.to(s, { ...step, duration: beat * 0.72, ease: 'power3.out' }, i * beat)
        .to(s, { high: i % 2 ? 0 : 0.65, red: i % 2 ? 1 : 0.2, signRed: i % 2 ? -0.9 : 0.7, signWhite: i % 2 ? 0.7 : -0.9, duration: 0.05, ease: 'none' }, i * beat); // V8 and MOTORS trade places on the beat
    });
    const up = steps.length * beat;
    tl.to(s, { nod: 0, lean: 0, hop: -0.1, high: 0, red: 0.55, signRed: 0, signWhite: 0, duration: 0.26, ease: 'power2.inOut' }, up)
      .to(s, { signFlash: 1, duration: 0.07, ease: 'none' }, up + 0.9)
      .to(s, { signFlash: 0, duration: 0.6, ease: 'sine.in' }, up + 0.97)
      .to(s, { air: 0.62, hop: 0.05, pull: 0.1, rev: 1, duration: 0.34, ease: 'power2.out' }, up + 0.26)
      .to(s, { air: 0, duration: 0.3, ease: 'power2.in' }, up + 0.6)
      .to(s, { hop: -0.09, dive: 1, jolt: 1, rev: 0, duration: 0.08, ease: 'power2.out' }, up + 0.9)
      .to(s, { hop: 0, dive: 0, jolt: 0, pull: 0, duration: 0.9, ease: 'elastic.out(1, 0.4)' }, up + 0.98);
    return tl;
  },
  lights() {
    const tl = gsap.timeline();
    tl.to(s, { hall: 0.1, key: 0.35, drl: 0, pod: 0, red: 0, beam: 0, duration: 0.45, ease: 'sine.inOut' }, 0)
      .set(s, { sweep: 0.3, sweepR: 0.2 }, 0.45)
      .to(s, { drl: 1.4, pod: 1, red: 1, duration: 0.05 }, 0.55)
      .to(s, { sweep: 2, sweepR: 2, duration: 0.8, ease: 'power2.out' }, 0.55);
    // alone in the dark hall, the sign answers the car: light runs along it, then it strobes with the high beams
    tl.set(s, { sign: 1, waveAmp: 2.6, signWhite: -0.8, signRed: -0.8 }, 0.6)
      .fromTo(s, { wave: -0.2 }, { wave: 1.2, duration: 0.75, ease: 'sine.inOut' }, 0.6)
      .to(s, { signWhite: 0, signRed: 0, waveAmp: 0, duration: 0.3, ease: 'none' }, 1.15);
    [1.45, 1.65, 1.85, 2.05].forEach((at, i) => {
      tl.to(s, { high: 1, red: i % 2 ? 0.2 : 1, signFlash: 1, signRed: i % 2 ? -0.9 : 0.4, signWhite: i % 2 ? 0.4 : -0.9, duration: 0.05, ease: 'none' }, at).to(s, { high: 0, red: i % 2 ? 1 : 0.2, signFlash: 0, duration: 0.13, ease: 'sine.in' }, at + 0.05);
    });
    tl.set(s, { signRed: 0, signWhite: 0 }, 2.25).to(s, { sign: 0, duration: 0.6, ease: 'none' }, 2.95);
    tl.to(s, { beam: 1, high: 0.5, duration: 0.2, ease: 'power2.out' }, 2.3)
      .to(s, { hall: 1, key: 1, beam: 0.3, high: 0, drl: 1, pod: 0.3, red: 0.55, duration: 0.9, ease: 'sine.inOut' }, 2.55);
    return tl;
  },
};
let moving = null, stopStunt = () => {}, signBusy = false;
async function stunt(name) {
  if (reduced) return;
  await stageReady;
  if (!stage || moving || scrollY > 40 || document.documentElement.classList.contains('play-intro')) return;
  const rest = { rev: 0, lock: 0, burn: 0, dive: 0, nod: 0, lean: 0, hop: 0, air: 0, pull: 0, jolt: 0, high: 0, red: 0.55, hall: 1, key: 1, drl: 1, pod: 0.3, beam: 0.3, sweep: 2, sweepR: 2, sign: 0, signRed: 0, signWhite: 0, signFlash: 0, waveAmp: 0 };
  const end = () => { moving = null; removeEventListener('scroll', bail); };
  const bail = () => {
    if (scrollY < 60) return;
    moving?.kill();
    end();
    gsap.to(s, { ...rest, spin: Math.round(s.spin / (Math.PI * 2)) * Math.PI * 2, skid: 0, duration: 0.3, ease: 'sine.out', onComplete: () => { s.spin = 0; } });
  };
  addEventListener('scroll', bail, { passive: true });
  stopStunt = () => { moving?.kill(); end(); };
  moving = PLAY[name]();
  moving.eventCallback('onComplete', () => {
    end();
    if (name === 'spin') { s.spin = 0; s.turnDone = 1; gsap.fromTo(s, { skid: 1 }, { skid: 0, duration: 7, ease: 'sine.in' }); }
  });
}

/* ================================================================== the search in the hero
   Make narrows the models, model narrows the years, and the button always says how many cars it will show. It is a real
   link to the inventory with the filters in the address, so the page transition and the back button work as usual. */
function setupFinder() {
  const box = $('[data-finder]');
  if (!box) return;
  const cars = JSON.parse($('[data-finder-data]', box).textContent);
  const [make, model, year] = ['make', 'model', 'year'].map((n) => $(`[name="${n}"]`, box));
  const go = $('[data-finder-go]', box), label = $('[data-finder-label]', box);
  const fill = (sel, values, head) => {
    const keep = sel.value;
    sel.replaceChildren(new Option(head, ''), ...values.map((v) => new Option(v, v)));
    sel.value = values.map(String).includes(keep) ? keep : '';
  };
  const update = () => {
    fill(make, [...new Set(cars.map((c) => c[0]))].sort(), 'Choose make');
    const byMake = cars.filter((c) => !make.value || c[0] === make.value);
    fill(model, [...new Set(byMake.map((c) => c[1]))].sort(), 'Choose model');
    const byModel = byMake.filter((c) => !model.value || c[1] === model.value);
    fill(year, [...new Set(byModel.map((c) => c[2]))].sort((a, b) => b - a), 'Choose year');
    const hits = byModel.filter((c) => !year.value || String(c[2]) === year.value).length;
    const q = new URLSearchParams();
    if (make.value) q.set('make', make.value);
    if (model.value) q.set('q', model.value);
    if (year.value) q.set('year', `${year.value}-${year.value}`);
    go.href = q.size ? `inventory.html?${q}` : 'inventory.html';
    label.textContent = `Search ${hits} car${hits === 1 ? '' : 's'}`;
  };
  box.addEventListener('change', update);
  $('[data-finder-reset]', box).addEventListener('click', () => {
    make.value = model.value = year.value = '';
    update();
  });
  update();
}

/** Click the wall sign: it blinks at you, light runs along it, and the car flashes back. */
function signBlink() {
  if (moving || signBusy) return;
  signBusy = true;
  const tl = gsap.timeline({ onComplete: () => { signBusy = false; } });
  [0, 0.13, 0.26].forEach((at) => {
    tl.to(s, { sign: 0, signWhite: -1, signRed: -1, duration: 0.03, ease: 'none' }, at).to(s, { signWhite: 0, signRed: 0, signFlash: 0.8, duration: 0.03, ease: 'none' }, at + 0.07);
  });
  tl.to(s, { signFlash: 0, duration: 0.5, ease: 'sine.in' }, 0.34)
    .set(s, { waveAmp: 2.4 }, 0.42)
    .fromTo(s, { wave: -0.2 }, { wave: 1.2, duration: 0.7, ease: 'sine.inOut' }, 0.42)
    .to(s, { waveAmp: 0, duration: 0.2, ease: 'none' }, 1);
  flashLights(0.5);
}

function showMoves() {
  const box = $('[data-hero-moves]');
  if (!box) return;
  stageReady.then((st) => {
    if (!st || tooSlow) return;
    box.hidden = false;
    gsap.from(box.children, { opacity: 0, y: 10, duration: 0.7, delay: 1.6, stagger: 0.08, ease: 'expo.out', clearProps: 'opacity,transform' });
    box.addEventListener('click', (e) => { const b = e.target.closest('[data-move]'); if (b) stunt(b.dataset.move); });
    // the tricks only work at the top of the page, so the buttons leave as soon as the drive starts
    const away = () => box.classList.toggle('is-away', scrollY > 30);
    addEventListener('scroll', away, { passive: true });
    away();
  });
}

/* ================================================================== the hero is only the car */
let heroStarted = false;
function heroIn() {
  heroStarted = true;
  gsap.to('.hero-shade', { opacity: 1, duration: reduced ? 0 : 1.2, ease: 'power2.out' });
}

/** The 3D scene only draws while it can be seen. With the hero filling the screen, nothing behind it needs drawing either. */
function watchHero() {
  const hero = $('.hero'), root = document.documentElement;
  new IntersectionObserver(([e]) => { s.off = !e.isIntersecting; }).observe(hero);
  const covered = () => root.classList.toggle('hero-cover', scrollY < 2);
  addEventListener('scroll', covered, { passive: true });
  covered();
}

/* ================================================================== mouse lock
   With a mouse the home page is a stack of screens, and one flick of the wheel moves exactly one of them: nothing is ever left
   half way. The arrow keys, Page Up, Page Down and the space bar do the same. Touch screens scroll as usual. The menu bar stays
   until the last screen, Saturday, which fills the window. */
function lockSections() {
  if (!lenis) return;
  const root = document.documentElement, nav = $('[data-nav]'), screens = $$('.hero, .start, .finale'), last = screens.length - 1;
  root.classList.add('locked');
  const stops = () => { const end = root.scrollHeight - innerHeight; return screens.map((el) => Math.min(end, el.offsetTop)); };
  const nearest = () => { const list = stops(); return list.reduce((best, y, i) => (Math.abs(y - scrollY) < Math.abs(list[best] - scrollY) ? i : best), 0); };
  let at = nearest(), busy = false, lastWheel = 0, doneAt = 0, safety = 0, idle = 0;
  nav?.classList.toggle('is-hidden', at === last); // Back can land you straight on the last screen
  const go = (i) => {
    i = Math.max(0, Math.min(last, i));
    if (i === at || busy) return;
    busy = true;
    at = i;
    nav?.classList.toggle('is-hidden', i === last);
    clearTimeout(safety);
    safety = setTimeout(() => { busy = false; }, 1600); // never stuck, whatever happens to the tab meanwhile
    arrive(screens[i], 380); // hidden from this moment, and landing with the screen
    lenis.scrollTo(stops()[i], {
      duration: 1, lock: true, force: true,
      easing: (t) => (1 - Math.cos(Math.PI * t)) / 2,
      onComplete: () => { busy = false; clearTimeout(safety); doneAt = performance.now(); },
    });
  };
  addEventListener('wheel', (e) => {
    if (e.ctrlKey || !e.deltaY) return;
    e.preventDefault();
    e.stopPropagation();
    const now = performance.now(), gap = now - lastWheel;
    lastWheel = now;
    if (busy || (gap < 140 && now - doneAt < 350)) return; // the tail of the same flick
    go(at + Math.sign(e.deltaY));
  }, { passive: false, capture: true });
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey || e.target.closest?.('input, select, textarea')) return;
    const typing = e.target.closest?.('a, button');
    const step = { ArrowDown: 1, PageDown: 1, ArrowUp: -1, PageUp: -1 }[e.key] ?? (e.key === ' ' && !typing ? (e.shiftKey ? -1 : 1) : 0);
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? last : null;
    if (!step && to === null) return;
    e.preventDefault();
    go(to ?? at + step);
  });
  // if the page ends up somewhere else (Tab, Find, a jump from another page), the screen counted is the one you are on
  addEventListener('scroll', () => {
    clearTimeout(idle);
    idle = setTimeout(() => {
      if (busy) return;
      const n = nearest();
      if (n !== at) { at = n; nav?.classList.toggle('is-hidden', n === last); }
    }, 200);
  }, { passive: true });
  // a resized window keeps you on the screen you were on (after the page has measured itself again)
  addEventListener('resize', () => { lenis.resize?.(); requestAnimationFrame(() => lenis.scrollTo(stops()[at], { immediate: true, force: true })); }, { passive: true });
}

/* ================================================================== what you get: pointing at a panel opens it, a tap does on a touch screen */
function initAccordion() {
  const box = $('[data-acc]');
  if (!box) return;
  const items = $$('.acc-item', box);
  const open = (item) => {
    if (item.classList.contains('is-open')) return;
    items.forEach((x) => {
      const on = x === item;
      x.classList.toggle('is-open', on);
      $('.acc-btn', x).setAttribute('aria-expanded', String(on));
    });
  };
  let waiting = 0;
  items.forEach((item) => {
    // a moment's pause, so a mouse crossing the row doesn't flick each one open on its way past
    item.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'mouse') return; clearTimeout(waiting); waiting = setTimeout(() => open(item), 70); });
    item.addEventListener('pointerleave', () => clearTimeout(waiting));
    $('.acc-btn', item).addEventListener('click', () => open(item));
    $('.acc-btn', item).addEventListener('focus', () => open(item));
  });
}

/* ================================================================== Saturday countdown
   Counts down to the next Saturday opening, or, while the deals are on, to closing time. Every second it reads the real
   clock again, so it can't drift, and it never stops: a timer that has to be noticed to run is a timer that looks broken. */
function startCountdown() {
  const box = $('[data-countdown]');
  if (!box) return;
  const label = $('[data-cd-label]', box);
  const set = (k, v) => { $(`[data-cd="${k}"]`, box).textContent = v; };
  const pad = (n) => String(n).padStart(2, '0');
  const tick = () => {
    const { on, ms } = saturdayDeals();
    const left = Math.max(0, Math.floor(ms / 1000)), d = Math.floor(left / 86400), h = Math.floor((left % 86400) / 3600);
    box.classList.toggle('is-on', on);
    label.textContent = on ? 'Saturday deals are on now. They end in' : 'The next Saturday deals start in';
    set('d', d);
    set('h', pad(h));
    set('m', pad(Math.floor((left % 3600) / 60)));
    set('s', pad(left % 60));
    $('[data-cd-word="d"]', box).textContent = d === 1 ? 'day' : 'days';
    $('[data-cd-word="h"]', box).textContent = h === 1 ? 'hour' : 'hours';
  };
  tick();
  // on the second, every second
  const next = () => setTimeout(() => { tick(); next(); }, 1000 - (Date.now() % 1000) + 5);
  next();
}
