// Pulls the live V8 Motors stock from the dealership's API, tidies the data, and makes small card
// thumbnails of each car's first photo (the full photos are loaded from the API host on car pages).
// Runs before dev and build. If the API can't be reached, the last saved snapshot is used.
//
//   node scripts/sync-inventory.mjs
import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import sharp from 'sharp';

const API = 'https://v8.farhaan.info/api';
const PHOTO_HOST = 'https://v8.farhaan.info';
const OUT = 'src/inventory.json';
const THUMBS = 'public/images/cars'; // one folder per car: <car id>/<photo number>-<width>.webp

const MAKES = { BMW: 'BMW', 'LAND ROVER': 'Land Rover', RANGE: 'Land Rover', SKODA: 'Skoda', KIA: 'Kia' };
const MODELS = {
  '328I': '328i', '520DSE': '520d SE', ECOSPORT: 'EcoSport', CRV: 'CR-V', I10: 'i10', I20: 'i20', 'AD VAN': 'AD Van',
  'NP 300': 'NP300', NP300: 'NP300', CAPTURE: 'Captur', XL6: 'XL6', H100: 'H100', ROVER: 'Range Rover', 3: '3',
};
const BODY = { HATCHBACK: 'Hatchback', SEDAN: 'Sedan', SALOON: 'Sedan', SUV: 'SUV', PICKUP: 'Pickup', VAN: 'Van', MPV: 'MPV' };
// the API files a few vehicles under OTHER; place them properly
const BODY_BY_MODEL = { 'AD Van': 'Van', H100: 'Van', Triber: 'MPV', XL6: 'MPV' };

const title = (s) => String(s || '').toLowerCase().replace(/(^|[\s-])([a-z])/g, (m, a, b) => a + b.toUpperCase()).trim();
const make = (m) => MAKES[String(m).toUpperCase()] || title(m);
const model = (m) => MODELS[String(m).toUpperCase()] ?? title(m);
const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function fetchStock() {
  const res = await fetch(`${API}/cars?page=1&pageSize=200&status=FOR_SALE`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`API answered ${res.status}`);
  const data = await res.json();
  return data.items.filter((c) => !c.deleted && c.status === 'FOR_SALE');
}

function normalise(c) {
  const mk = make(c.make), md = model(c.model);
  const photos = [...(c.photos || [])].sort((a, b) => a.sortOrder - b.sortOrder).map((p) => PHOTO_HOST + p.url);
  const body = BODY_BY_MODEL[md] || BODY[String(c.type).toUpperCase()] || 'Other';
  const colour = c.colour ? title(c.colour) : null;
  return {
    id: `${slugify(`${c.year} ${mk} ${md}`)}-${c.id}`,
    apiId: c.id,
    make: mk,
    model: md,
    year: c.year,
    price: Number(c.priceMur) || 0,
    km: c.mileage ?? null,
    fuel: title(c.fuelType),
    gearbox: title(c.transmission),
    body,
    engineCc: c.engineCc || null,
    engine: c.engineCc ? `${(c.engineCc / 1000).toFixed(1)} L` : null,
    colour,
    seats: c.seats || null,
    doors: c.doors || null,
    description: (c.description || '').trim() || null,
    options: [c.options, c.otherInfo].filter(Boolean).join('\n').trim() || null,
    deal: !!c.isDeal,
    added: c.createdAt,
    photos,
  };
}

// Card and gallery-strip thumbnails for every photo (480 px wide), a 960 px version of the first photo for big
// cards, and a 1280 px copy of every photo for the car page gallery: the dealer's photo server takes about two
// seconds per photo, so the gallery never loads from it directly. Existing files are kept, so later syncs only fetch new cars.
async function thumbs(cars) {
  mkdirSync(THUMBS, { recursive: true });
  const keep = new Set();
  const jobs = [];
  for (const c of cars) {
    mkdirSync(`${THUMBS}/${c.id}`, { recursive: true });
    c.thumbs = c.photos.map((url, i) => {
      const name = `${c.id}/${i}`;
      const sizes = i === 0 ? [480, 960, 1280] : [480, 1280];
      sizes.forEach((w) => keep.add(`${name}-${w}.webp`));
      if (!sizes.every((w) => existsSync(`${THUMBS}/${name}-${w}.webp`))) jobs.push({ url, name, sizes });
      return `images/cars/${name}-480.webp`;
    });
  }
  // a few downloads at a time
  const worker = async () => {
    for (let job; (job = jobs.shift()); ) {
      const res = await fetch(job.url, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`photo ${job.url} answered ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      for (const w of job.sizes) {
        const out = sharp(buf).rotate();
        if (w === 1280) await out.resize({ width: w, withoutEnlargement: true }).webp({ quality: 74 }).toFile(`${THUMBS}/${job.name}-${w}.webp`);
        else await out.resize({ width: w, height: Math.round(w * 0.66), fit: 'cover', position: 'attention' })
          .webp({ quality: w > 500 ? 70 : 66 }).toFile(`${THUMBS}/${job.name}-${w}.webp`);
      }
      process.stdout.write('.');
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  // a sold car loses its folder, and photos a car no longer has lose their files
  for (const dir of readdirSync(THUMBS)) {
    const all = readdirSync(`${THUMBS}/${dir}`), gone = all.filter((f) => !keep.has(`${dir}/${f}`));
    if (gone.length === all.length) rmSync(`${THUMBS}/${dir}`, { recursive: true });
    else for (const f of gone) rmSync(`${THUMBS}/${dir}/${f}`);
  }
}

try {
  const raw = await fetchStock();
  const cars = raw.map(normalise).filter((c) => c.photos.length && c.price > 0);
  await thumbs(cars);
  writeFileSync(OUT, JSON.stringify({ syncedAt: new Date().toISOString(), source: `${API}/cars`, cars }, null, 1));
  console.log(`\nSynced ${cars.length} cars from the V8 Motors API`);
} catch (err) {
  if (existsSync(OUT)) {
    const { cars, syncedAt } = JSON.parse(readFileSync(OUT, 'utf8'));
    console.warn(`Couldn't reach the stock API (${err.message}). Using the snapshot from ${syncedAt} (${cars.length} cars).`);
  } else {
    console.error(`Couldn't reach the stock API (${err.message}) and there is no saved snapshot.`);
    process.exit(1);
  }
}
