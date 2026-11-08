// Packs the pictures of the car's full turn (scripts/trick-films.mjs renders them) into one file the home page draws from
// (heroTricks in src/pages/home.js): a little-endian uint32 count, then count + 1 uint32 offsets into the data that follows
// (picture i is data[offset i .. offset i+1]), then the JPEGs back to back.
//   node scripts/turn-pack.mjs <folder of JPEGs, in name order> <out .bin>
// Make the JPEGs smaller than the film first (they are drawn over the loop, cover-fitted like it, so any size of the same shape
// lines up), e.g. ffmpeg -i turn/%04d.jpg -vf scale=540:1170:flags=lanczos -q:v 5 small/%04d.jpg (landscape: 960:540)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [dir, out] = process.argv.slice(2);
const files = readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f)).sort();
const pictures = files.map((f) => readFileSync(join(dir, f)));
const head = Buffer.alloc(4 + 4 * (pictures.length + 1));
head.writeUInt32LE(pictures.length, 0);
let at = 0;
pictures.forEach((p, i) => { head.writeUInt32LE(at, 4 + 4 * i); at += p.length; });
head.writeUInt32LE(at, 4 + 4 * pictures.length);
writeFileSync(out, Buffer.concat([head, ...pictures]));
console.log(`${out}: ${pictures.length} pictures, ${(at / 1024 / 1024).toFixed(2)} MB`);
