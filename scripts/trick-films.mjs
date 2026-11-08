// Records the car's tricks (Spin it, Make it dance, Light show) and a full turn of it, for the phones that show the filmed car
// instead of drawing it live (public/media/hero/trick-*.mp4 and turn-*.bin, played by heroTricks in src/pages/home.js). The same
// scene, lights and timelines the live car runs (PLAY in src/pages/home.js). Each trick starts on the hero pose, the loop's first
// frame (scripts/hero-loop.mjs), and ends LEAD seconds into the loop's own camera sway, so the page hands over to the loop at that
// moment (TRICK_LEAD in home.js) with the camera still moving: no fade, no pause, no jump. The turn starts and ends on the hero pose.
//
//   vite build --mode dbg --outDir dist-dbg, serve it on PORT, then:
//   PLAYWRIGHT=<path to playwright-core> OUT=<a work folder> PORT=4178 node scripts/trick-films.mjs portrait|landscape
//
// Every frame is one sharp render, never a blend of two (see scripts/film.mjs). Then, in the work folder, for spin, dance and
// lights (HEVC at 60 frames a second; H.264 at 30 for older phones, every second frame, which keeps it at level 4.1):
//   ffmpeg -framerate 60 -i portrait/spin/%04d.jpg -vf "scale=720:1560:flags=lanczos,format=yuv420p" -c:v libx265 -preset slow -crf 26 -tag:v hvc1 -x265-params "log-level=error:level-idc=41:keyint=120:aq-mode=3" -movflags +faststart -an trick-spin-portrait-hevc.mp4
//   ffmpeg -framerate 60 -i portrait/spin/%04d.jpg -vf "select=not(mod(n,2)),setpts=N/30/TB,scale=720:1560:flags=lanczos,format=yuv420p" -r 30 -c:v libx264 -preset veryslow -crf 24 -profile:v high -level 4.1 -refs 4 -g 60 -x264-params aq-mode=3 -movflags +faststart -an trick-spin-portrait.mp4
// and the turn: TURN pictures round a full circle, made smaller and packed into one file, which the page draws straight from
// memory as a finger turns the car (seeking a film to each angle lagged behind the finger on a weak phone). 540 wide is as sharp
// as the loop film itself:
//   ffmpeg -i portrait/turn/%04d.jpg -vf scale=540:1170:flags=lanczos -q:v 5 portrait/turn-small/%04d.jpg
//   node scripts/turn-pack.mjs portrait/turn-small turn-portrait.bin
// (landscape: scale=1280:720 for the films, 960:540 for the turn). node scripts/check-media.mjs before copying them to
// public/media/hero/, and one up the VERSION in public/sw.js, which keeps these files under the same names.
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT + '/index.mjs').href);

const kind = process.argv[2] || 'portrait';
const [W, H] = kind === 'portrait' ? [420, 910] : [960, 540]; // the shapes of the intro films and the loop
const OUT = `${process.env.OUT}/${kind}`, PORT = process.env.PORT || 4178, FPS = 60, SCALE = 2, TURN = 120;
// after each trick's own timeline, a little longer while the smoke and dust settle and everything is back at rest. Over the last
// LEAD seconds of that the camera already starts the loop's sway (SWAY, the same as scripts/hero-loop.mjs), so the page hands
// over to the loop LEAD seconds into it (TRICK_LEAD in src/pages/home.js) on the very same frame, still moving: no stop, no jump
const TAIL = { spin: 2, dance: 1, lights: 1 }, LEAD = 0.8, LOOP = 12;
const SWAY = (tau, hero) => { const a = (2 * Math.PI * tau) / LOOP; return { az: hero.az + (0.3 * Math.sin(a) * (1 - Math.cos(a))) / 2, el: hero.el + 0.025 * (1 - Math.cos(a)) }; };

const b = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: W, height: H } })).newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
await p.addInitScript(([dpr, dt]) => { window.__capture = { dpr, dt, go: false }; localStorage.setItem('v8:notice', '1'); }, [SCALE, 1 / FPS]);
await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.gate.is-ready', { timeout: 90000 });
await p.evaluate(() => { window.__hold = 0; });
await p.click('[data-ignite]', { force: true });
await p.waitForFunction(() => !!window.__tl && !!window.__play, null, { timeout: 20000 });
// the intro through to its end, so the scene stands exactly as the loop starts
const end = await p.evaluate(() => window.__tl.duration());
for (let t = 0; t <= end + 1; t += 0.25) await p.evaluate((x) => { const c = window.__capture; window.__hold = x; c.go = true; window.__gsap.ticker.tick(); c.go = false; }, t);
await p.waitForTimeout(500);
// the soft flash of the high beams after the intro (see scripts/hero-loop.mjs) stopped, so "at rest" really is at rest
await p.evaluate(() => { window.__gsap.killTweensOf(window.__s); window.__s.high = 0; });
// the scene's numbers at rest (only the numbers: the object also carries things the page hangs on it)
const hero = await p.evaluate(() => Object.fromEntries(Object.entries(window.__s).filter(([, v]) => typeof v === 'number' || typeof v === 'boolean')));
console.log(kind, 'canvas', await p.evaluate(() => { const c = document.querySelector('.hero-canvas'); return [c.width, c.height]; }));

const frame = (n, dir) => p.evaluate(() => {
  const c = window.__capture; c.go = true; window.__gsap.ticker.tick(); c.go = false;
  return document.querySelector('.hero-canvas').toDataURL('image/jpeg', 0.95).slice(23);
}).then((data) => writeFileSync(`${dir}/${String(n).padStart(4, '0')}.jpg`, Buffer.from(data, 'base64')));

for (const name of ['spin', 'dance', 'lights']) {
  const dir = `${OUT}/${name}`;
  mkdirSync(dir, { recursive: true });
  const len = await p.evaluate(({ name, hero }) => {
    Object.assign(window.__s, hero);
    const tl = window.__play[name]();
    tl.pause(0);
    window.__trick = tl;
    return tl.duration();
  }, { name, hero });
  const frames = Math.round((len + TAIL[name]) * FPS), started = Date.now();
  for (let n = 0; n <= frames; n++) {
    const t = n / FPS, tau = t - len - (TAIL[name] - LEAD);
    await p.evaluate(({ t, len, hero, sway }) => {
      if (t <= len) window.__trick.time(t);
      else Object.assign(window.__s, hero, sway); // at rest again (a full spin ends where it began), and then easing into the loop's sway
    }, { t, len, hero, sway: tau > 0 ? SWAY(tau, hero) : {} });
    await frame(n, dir);
  }
  console.log(`${name}: ${frames + 1} frames (${len.toFixed(2)} s and ${TAIL[name]} s settling), ${((Date.now() - started) / (frames + 1)).toFixed(0)} ms a frame`);
}

// the turn: the car turned by hand, a full circle in TURN even steps, everything else at rest
const dir = `${OUT}/turn`;
mkdirSync(dir, { recursive: true });
await p.evaluate((hero) => Object.assign(window.__s, hero), hero);
for (let n = 0; n < TURN; n++) {
  await p.evaluate(({ n, TURN }) => { window.__capture.turn = (2 * Math.PI * n) / TURN; }, { n, TURN });
  await frame(n, dir);
}
await p.evaluate(() => { delete window.__capture.turn; });
console.log(`turn: ${TURN} frames`, errs.length ? errs : 'no errors');
await b.close();
