// Renders the intro into public/media/intro/film.mp4 for phones, from the same 3D scene the site draws live.
//
//   vite build --mode dbg --outDir dist-dbg, serve it on PORT, then:
//   PLAYWRIGHT=<path to playwright-core> OUT=<a work folder> PORT=4178 node scripts/film.mjs 4.5 12.9
//
// The film starts at CUT in src/pages/home.js (4.5 s, just before the first flash of the high beams).
//
// Each frame is drawn at several times the final size and many more times a second than the film runs, and neighbouring
// frames are blended, so the picture has the clean edges and real motion blur no phone could draw live. The clock is stepped by
// hand, so it doesn't matter how long a frame takes. The site's dark bars, logo and buttons stay HTML, on top of the video.
//
// Then, in the work folder (the same filter for both, and the sound is the recording from CUT, plus the second rev at 9.4 s of the
// whole film, so 4.9 s into this one):
//   ffmpeg -i engine.mp3 -i engine.mp3 -filter_complex "[0:a]atrim=start=4.5,asetpts=PTS-STARTPTS[a];[1:a]atrim=start=5.2,asetpts=PTS-STARTPTS,adelay=4900:all=1[b];[a][b]amix=inputs=2:normalize=0:duration=longest,volume=0.8,afade=t=in:d=0.08,afade=t=out:st=8.7:d=1,atrim=0:9.75[o]" -map "[o]" -ar 44100 -ac 2 -c:a aac -b:a 96k audio.m4a
//   VF="tmix=frames=2:weights=1 1,select=not(mod(n\,4)),setpts=N/30/TB,scale=720:1560:flags=lanczos,format=yuv420p,tpad=stop_mode=clone:stop_duration=1.35"
//   ffmpeg -start_number 540 -framerate 120 -i frames/%05d.jpg -i audio.m4a -vf "$VF" -c:v libx264 -preset veryslow -crf 26 -profile:v high -level 4.0 -g 120 -keyint_min 30 -x264-params aq-mode=3:aq-strength=1.0 -r 30 -c:a copy -shortest -movflags +faststart film.mp4
//   ffmpeg -start_number 540 -framerate 120 -i frames/%05d.jpg -i audio.m4a -vf "$VF" -c:v libx265 -preset slow -crf 28 -tag:v hvc1 -x265-params "log-level=error:level-idc=40:keyint=120:min-keyint=30:aq-mode=3" -r 30 -c:a copy -shortest -movflags +faststart film-hevc.mp4
// Keep the phone film at 720 x 1560 or smaller and at level 4.0: many Android phones can't decode a picture taller than 1920 in
// hardware, or a level above what they list, and then the film stutters or never starts. 720 x 1560 is the same shape as the
// FILMS.tall numbers in src/pages/home.js, so the logo still lands in the right place. Around 2 MB plays through on mobile data.
// The wide film (W=960 H=540): the same, with scale=1600:900.
// Copy both to public/media/intro/. If the logo's place changes, this script prints the new FILM.mark for src/pages/home.js.
// Anything that changes the intro (the car, the bay, the timeline in home.js) needs the film rendered again.
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT + '/index.mjs').href);

const OUT = process.env.OUT, PORT = process.env.PORT || 4178, FPS = 120, SCALE = +(process.env.SCALE || 4);
// the shape of the film: upright for phones (540 x 900, the default) or wide for computers and tablets (W=960 H=540)
const W = +(process.env.W || 540), H = +(process.env.H || 900);
const from = +(process.argv[2] || 0), to = +(process.argv[3] || 12.9);
mkdirSync(`${OUT}/frames`, { recursive: true });

const b = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: W, height: H } })).newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
await p.addInitScript(([dpr, dt]) => { window.__capture = { dpr, dt, go: false }; }, [SCALE, 1 / FPS]);
await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.gate.is-ready', { timeout: 90000 });
await p.evaluate(() => { window.__hold = 0; });
await p.click('[data-ignite]', { force: true });
await p.waitForFunction(() => !!window.__tl, null, { timeout: 20000 });
await p.waitForTimeout(800);
console.log('film length', await p.evaluate(() => window.__tl.duration()), 'canvas', await p.evaluate(() => { const c = document.querySelector('.hero-canvas'); return [c.width, c.height]; }));

const started = Date.now(), first = Math.round(from * FPS), last = Math.round(to * FPS);
let mark = null;
for (let n = first; n <= last; n++) {
  const name = `${OUT}/frames/${String(n).padStart(5, '0')}.jpg`;
  const data = await p.evaluate((t) => {
    const c = window.__capture;
    window.__hold = t;
    c.go = false; window.__gsap.ticker.tick(); // move the film to this moment
    c.go = true; window.__gsap.ticker.tick();  // and draw it
    c.go = false;
    return document.querySelector('.hero-canvas').toDataURL('image/jpeg', 0.97).slice(23);
  }, n / FPS);
  writeFileSync(name, Buffer.from(data, 'base64'));
  if (!mark && n / FPS > 11.7) {
    mark = await p.evaluate(() => { const r = document.querySelector('.intro-badge'); const w = parseFloat(r.style.width), l = parseFloat(r.style.left), t = parseFloat(r.style.top); return { x: l + w / 2, y: t + (w * 343) / 728, w }; });
    console.log('mark', JSON.stringify(mark));
  }
  if (n % 60 === 0) console.log(`${n}/${last}, ${(((Date.now() - started) / (n - first + 1))).toFixed(0)} ms a frame`);
}
console.log('done in', ((Date.now() - started) / 1000).toFixed(0), 's', errs.length ? errs : 'no errors');
await b.close();
