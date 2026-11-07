// Renders the looping video of the Range Rover that phones and tablets show instead of drawing the 3D car live
// (public/media/hero/loop-*.mp4). Same scene, same lights as the live car: the camera sways slowly round it and back.
//
//   vite build --mode dbg --outDir dist-dbg, serve it on PORT, then:
//   PLAYWRIGHT=<path to playwright-core> OUT=<a work folder> PORT=4178 node scripts/hero-loop.mjs portrait|landscape
//
// The clock is stepped by hand (see scripts/film.mjs), so every frame is sharp whatever the machine. The loop is LOOP seconds;
// one more second is rendered so the end can be cross-faded into the start and the seam never shows. Then, in the work folder:
//   ffmpeg -framerate 30 -i portrait/%04d.jpg -filter_complex "[0]split[a][b];[a]trim=1:13,setpts=PTS-STARTPTS[body];[b]trim=0:1,setpts=PTS-STARTPTS[head];[body][head]xfade=transition=fade:duration=1:offset=11,scale=720:1560:flags=lanczos,format=yuv420p" -c:v libx264 -preset veryslow -crf 27 -profile:v high -g 60 -movflags +faststart -an loop-portrait.mp4
// (landscape: scale=1280:720). Copy them to public/media/hero/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT + '/index.mjs').href);

const kind = process.argv[2] || 'portrait';
const [W, H] = kind === 'portrait' ? [420, 910] : [960, 540]; // the shape of a phone (19.5:9) and of a computer (16:9), the same as the intro films
const OUT = `${process.env.OUT}/${kind}`, PORT = process.env.PORT || 4178, FPS = 30, LOOP = 12, SCALE = 2;
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: W, height: H } })).newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
await p.addInitScript(([dpr, dt]) => { window.__capture = { dpr, dt, go: false }; localStorage.setItem('v8:notice', '1'); }, [SCALE, 1 / FPS]);
await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.gate.is-ready', { timeout: 90000 });
await p.evaluate(() => { window.__hold = 0; });
await p.click('[data-ignite]', { force: true });
await p.waitForFunction(() => !!window.__tl, null, { timeout: 20000 });
// play the intro through to its end, so the scene stands exactly as the live car does after it
const end = await p.evaluate(() => window.__tl.duration());
for (let t = 0; t <= end + 1; t += 0.25) await p.evaluate((x) => { const c = window.__capture; window.__hold = x; c.go = true; window.__gsap.ticker.tick(); c.go = false; }, t);
await p.waitForTimeout(500);
const hero = await p.evaluate(() => ({ az: window.__s.az, el: window.__s.el }));
console.log(kind, 'canvas', await p.evaluate(() => { const c = document.querySelector('.hero-canvas'); return [c.width, c.height]; }), 'hero pose', hero);

const frames = (LOOP + 1) * FPS, started = Date.now();
for (let n = 0; n < frames; n++) {
  const data = await p.evaluate(({ n, FPS, LOOP, hero }) => {
    const c = window.__capture, s = window.__s, a = (2 * Math.PI * n) / (FPS * LOOP);
    s.az = hero.az + 0.2 * Math.sin(a); // round to one side, back, round to the other
    s.el = hero.el + 0.025 * (1 - Math.cos(a)); // and up a touch as it goes
    c.go = true; window.__gsap.ticker.tick(); c.go = false;
    return document.querySelector('.hero-canvas').toDataURL('image/jpeg', 0.95).slice(23);
  }, { n, FPS, LOOP, hero });
  writeFileSync(`${OUT}/${String(n).padStart(4, '0')}.jpg`, Buffer.from(data, 'base64'));
  if (n % 60 === 0) console.log(`${n}/${frames}, ${((Date.now() - started) / (n + 1)).toFixed(0)} ms a frame`);
}
console.log('done in', ((Date.now() - started) / 1000).toFixed(0), 's', errs.length ? errs : 'no errors');
await b.close();
