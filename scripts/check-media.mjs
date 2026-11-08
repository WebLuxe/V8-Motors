// Every video on the site has to play on a phone, not only on the computer it was tested on. Phones decode video on a chip, and
// many of those chips stop at 1920 x 1088 (turned either way) and at level 4.1: past either limit the film doesn't play at all,
// while every computer plays it without a hitch, so a test on a computer never notices. This reads every .mp4 under a folder
// (public/media by default) and fails if one is over, or can't start playing until it has downloaded completely.
//   node scripts/check-media.mjs [folder]          (scripts/deploy.mjs runs it, and stops the publish if it fails)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.argv[2] || 'public/media';
const LONG = 1920, SHORT = 1088, LEVEL = 4.1;

// the boxes an mp4 is made of, between two offsets
const boxes = (b, from, to) => {
  const out = [];
  for (let o = from; o + 8 <= to; ) {
    let size = b.readUInt32BE(o), head = 8;
    if (size === 1) { size = Number(b.readBigUInt64BE(o + 8)); head = 16; } else if (size === 0) size = to - o;
    if (size < head) break;
    out.push({ type: b.toString('latin1', o + 4, o + 8), start: o + head, end: o + size });
    o += size;
  }
  return out;
};
const inside = (b, box, ...path) => path.reduce((bx, t) => bx && boxes(b, bx.start, bx.end).find((c) => c.type === t), box);

function read(file) {
  const b = readFileSync(file), top = boxes(b, 0, b.length), order = top.map((x) => x.type);
  const moov = top.find((x) => x.type === 'moov');
  const out = { streaming: order.indexOf('moov') >= 0 && order.indexOf('moov') < order.indexOf('mdat') };
  for (const trak of moov ? boxes(b, moov.start, moov.end).filter((x) => x.type === 'trak') : []) {
    const tkhd = inside(b, trak, 'tkhd');
    const w = tkhd ? b.readUInt32BE(tkhd.end - 8) / 65536 : 0, h = tkhd ? b.readUInt32BE(tkhd.end - 4) / 65536 : 0;
    if (!w || !h) continue; // the sound
    const stsd = inside(b, trak, 'mdia', 'minf', 'stbl', 'stsd');
    const entry = stsd && boxes(b, stsd.start + 8, stsd.end)[0]; // after the version and the count
    // a video sample entry has 78 bytes of its own before the boxes inside it
    const config = entry && boxes(b, entry.start + 78, entry.end).find((x) => x.type === 'avcC' || x.type === 'hvcC');
    Object.assign(out, {
      w, h, codec: entry?.type,
      level: !config ? null : config.type === 'avcC' ? b[config.start + 3] / 10 : b[config.start + 12] / 30,
    });
  }
  return out;
}

const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
let bad = 0;
for (const file of walk(root).filter((p) => p.toLowerCase().endsWith('.mp4'))) {
  const m = read(file), problems = [];
  if (!m.w) problems.push('no video found in it');
  else {
    if (Math.max(m.w, m.h) > LONG || Math.min(m.w, m.h) > SHORT) problems.push(`${m.w} x ${m.h} is bigger than many phones can play (at most ${LONG} x ${SHORT}, either way up)`);
    if (m.level == null) problems.push(`its level can't be read (${m.codec})`);
    else if (m.level > LEVEL + 1e-6) problems.push(`level ${m.level} is above ${LEVEL}, which many phones refuse (x264: -level 4.1 -refs 4; x265: level-idc=41 or lower)`);
  }
  if (!m.streaming) problems.push('it only starts once it has downloaded completely (encode with -movflags +faststart)');
  const name = relative(root, file).replaceAll('\\', '/');
  if (problems.length) { bad++; console.log(`  NOT OK  ${name}: ${problems.join('; ')}`); }
  else console.log(`  ok      ${name}  ${m.w} x ${m.h}, ${m.codec} level ${m.level}`);
}
if (bad) { console.error(`\n${bad} video${bad === 1 ? '' : 's'} would not play on many phones. Fix ${bad === 1 ? 'it' : 'them'} before publishing.`); process.exit(1); }
