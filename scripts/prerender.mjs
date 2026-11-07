// Generates one real HTML page per car (cars/<id>.html), plus sitemap.xml, robots.txt and llms.txt.
// Runs automatically before `npm run dev` and `npm run build`.
import { mkdirSync, writeFileSync, readdirSync, rmSync, existsSync, statSync } from 'node:fs';
import sharp from 'sharp';
import { CARS, DEALER, rs, km, carName } from '../src/data.js';
import { SITE, headHTML, carPageHTML, carJsonLd, breadcrumbJsonLd } from '../src/lib/templates.js';

export function shell({ head, page, body, script, P = '', bodyClass = '' }) {
  return `<!doctype html>
<html lang="en-MU">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  ${head}
  <link rel="preload" href="/src/fonts/archivo-latin.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="preload" href="/src/fonts/bodoni-moda-latin-500-italic.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="preconnect" href="https://v8.farhaan.info" />
  <script type="module" src="/src/pages/${script}.js" blocking="render"></script>
</head>
<body class="${bodyClass}">
  <a href="#main" class="skip-link">Skip to content</a>
  <!--@nav:${page}-->
  <main id="main">${body}</main>
  <!--@footer-->
  <!--@tabbar:${page}-->
</body>
</html>
`;
}

// ---------------------------------------------------------------- share pictures
// WhatsApp and Facebook show a 1200 x 630 picture with a shared link, so every car gets its own: its first photo, cropped to fit,
// with a small V8 Motors badge in the corner. Made once per car and kept until its photo changes (public/images/share/<id>.jpg)
const SHARE = 'public/images/share';
mkdirSync(SHARE, { recursive: true });
const keep = new Set(CARS.map((c) => `${c.id}.jpg`));
for (const f of readdirSync(SHARE)) if (!keep.has(f)) rmSync(`${SHARE}/${f}`); // cars that have been sold
const mark = await sharp('public/images/brand/v8-mark.png').resize({ height: 46 }).png().toBuffer();
const markW = (await sharp(mark).metadata()).width;
const badge = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></linearGradient></defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <rect x="28" y="544" width="${markW + 178}" height="60" rx="30" fill="#101114" fill-opacity=".62" stroke="#fff" stroke-opacity=".35"/>
  <text x="${58 + markW}" y="582" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="700" fill="#fff" letter-spacing=".5">V8 Motors</text>
</svg>`);
let made = 0;
for (const c of CARS) {
  const src = ['1280', '960'].map((w) => `public/images/cars/${c.id}/0-${w}.webp`).find(existsSync);
  const out = `${SHARE}/${c.id}.jpg`;
  if (!src || (existsSync(out) && statSync(out).mtimeMs > statSync(src).mtimeMs)) continue;
  await sharp(src).resize(1200, 630, { fit: 'cover', position: 'attention' })
    .composite([{ input: badge }, { input: mark, left: 46, top: 551 }])
    .jpeg({ quality: 78, mozjpeg: true, progressive: true }).toFile(out);
  made++;
}
console.log(`share pictures: ${made} made, ${CARS.length - made} already there`);

// ---------------------------------------------------------------- car pages
const dir = 'cars';
if (existsSync(dir)) for (const f of readdirSync(dir)) rmSync(`${dir}/${f}`);
mkdirSync(dir, { recursive: true });

for (const c of CARS) {
  const name = carName(c);
  const head = headHTML({
    title: `${name} for sale, ${rs(c.price)} | V8 Motors Mauritius`,
    desc: `${name}, ${c.trim}, ${c.gearbox.toLowerCase()}${c.km != null ? `, ${km(c.km)}` : ''}. ${rs(c.price)} at V8 Motors, 59B Royal Road, Coromandel. Part-exchange and leasing available.`,
    path: `cars/${c.id}.html`,
    image: existsSync(`${SHARE}/${c.id}.jpg`) ? `${SITE}images/share/${c.id}.jpg` : c.images[0],
    jsonld: [carJsonLd(c), breadcrumbJsonLd([['Home', ''], ['Catalogue', 'inventory.html'], [name, `cars/${c.id}.html`]])],
    P: '../',
  });
  writeFileSync(`${dir}/${c.id}.html`, shell({ head, page: 'inventory', body: carPageHTML(c, '../'), script: 'car', P: '../', bodyClass: 'page-car page-fit' }));
}

// ---------------------------------------------------------------- sitemap / robots / llms
const today = new Date().toISOString().slice(0, 10);
const staticPages = ['', 'inventory.html', 'sell.html', 'finance.html', 'contact.html', 'compare.html', 'privacy.html', 'terms.html'];
const urls = [
  ...staticPages.map((p) => ({ loc: SITE + p, pri: p === '' ? '1.0' : p === 'inventory.html' ? '0.9' : '0.6' })),
  ...CARS.map((c) => ({ loc: `${SITE}cars/${c.id}.html`, pri: '0.8' })),
];
mkdirSync('public', { recursive: true });
writeFileSync('public/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><priority>${u.pri}</priority></url>`).join('\n')}
</urlset>
`);
writeFileSync('public/robots.txt', `User-agent: *
Allow: /

Sitemap: ${SITE}sitemap.xml
`);
writeFileSync('public/llms.txt', `# V8 Motors

> Used car dealer at 59B Royal Road, Coromandel, Mauritius. Buy, sell or exchange a car; leasing through Rogers Capital. Prices are in Mauritian rupees.

- Phone: ${DEALER.phones.map(([t]) => t).join(', ')}
- WhatsApp: https://wa.me/${DEALER.whatsapp}
- Email: ${DEALER.email}
- Opening hours: Monday to Friday 9:00 to 17:00, Saturday 9:00 to 16:00, closed Sunday

## Pages

- [Catalogue](${SITE}inventory.html): every car in stock, filterable by body, price, year, fuel and gearbox
- [Sell](${SITE}sell.html): rough guide price and an offer for your car, or put it towards one of ours
- [Leasing](${SITE}finance.html): monthly payment calculator; leasing is arranged through Rogers Capital
- [Visit us](${SITE}contact.html): address, opening hours and how to reach us
- [Privacy policy](${SITE}privacy.html)
- [Terms of sale](${SITE}terms.html)

## Cars in stock

${CARS.map((c) => `- [${carName(c)}](${SITE}cars/${c.id}.html): ${rs(c.price)}, ${c.trim}, ${c.gearbox}${c.km != null ? `, ${km(c.km)}` : ''}`).join('\n')}
`);

console.log(`Prerendered ${CARS.length} car pages, sitemap (${urls.length} URLs), robots.txt, llms.txt`);
