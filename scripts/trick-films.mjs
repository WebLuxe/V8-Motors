// Records the car's tricks (Spin it, Make it dance, Light show) and a full turn of it, for the phones that show the filmed car
// instead of drawing it live (public/media/hero/trick-*.mp4 and turn-*.mp4, played by heroTricks in src/pages/home.js). The same
// scene, lights and timelines the live car runs (PLAY in src/pages/home.js), each from the hero pose and back to it, so it cuts in
// from the filmed loop (scripts/hero-loop.mjs) and back out to its first frame without a jump.
//
//   vite build --mode dbg --outDir dist-dbg, serve it on PORT, then:
//   PLAYWRIGHT=<path to playwright-core> OUT=<a work folder> PORT=4178 node scripts/trick-films.mjs portrait|landscape
//
// Every frame is one sharp render, never a blend of two (see scripts/film.mjs). Then, in the work folder, for spin, dance and
// lights (HEVC at 60 frames a second; H.264 at 30 for older phones, every second frame, which keeps it at level 4.1):
//   ffmpeg -framerate 60 -i portrait/spin/%04d.jpg -vf "scale=720:1560:flags=lanczos,format=yuv420p" -c:v libx265 -preset slow -crf 26 -tag:v hvc1 -x265-params "log-level=error:level-idc=41:keyint=120:aq-mode=3" -movflags +faststart -an trick-spin-portrait-hevc.mp4
//   ffmpeg -framerate 60 -i portrait/spin/%04d.jpg -vf "select=not(mod(n\,2)),setpts=N/30/TB,scale=720:1560:flags=lanczos,format=yuv420p" -r 30 -c:v libx264 -preset veryslow -crf 24 -profile:v high -level 4.1 -refs 4 -g 60 -movflags +faststart -an trick-spin-portrait.mp4
// and the turn: TURN frames round a full circle, every one a keyframe, so a finger can go straight to any angle. H.264 only: an
// HEVC film of nothing but keyframes comes out in a profile (4, the range extensions) that phones don't play at all:
//   ffmpeg -framerate 30 -i portrait/turn/%04d.jpg -vf "scale=720:1560:flags=lanczos,format=yuv420p" -c:v libx264 -preset veryslow -crf 26 -profile:v high -level 4.1 -g 1 -x264-params aq-mode=3 -movflags +faststart -an turn-portrait.mp4
// (landscape: scale=1280:720). node scripts/check-media.mjs before copying them to public/media/hero/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT + '/index.mjs').href);

const kind = process.argv[2] || 'portrait';
const [W, H] = kind === 'portrait' ? [420, 910] : [960, 540]; // the shapes of the intro films and the loop
const OUT = `${process.env.OUT}/${kind}`, PORT = process.env.PORT || 4178, FPS = 60, SCALE = 2, TURN = 120;
// after each trick's own timeline, a little longer while the smoke and dust settle and everything is back at rest
const TAIL = { spin: 2, dance: 0.6, lights: 0.6 };

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
    await p.evaluate(({ t, len, hero }) => {
      if (t <= len) window.__trick.time(t);
      else Object.assign(window.__s, hero); // at rest again: a full spin ends where it began
    }, { t: n / FPS, len, hero });
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
