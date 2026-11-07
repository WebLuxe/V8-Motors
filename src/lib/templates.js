// Pure HTML templates (no DOM access). Used at build time to pre-render pages,
// and in the browser where content has to be redrawn.
import { CARS, DEALER, BODY_TYPES, rs, km, monthly, carName, thumb, large } from '../data.js';
import { SHAPES } from './shapes.js';
import { fmtTime } from './hours.js';
import { VIDEOS } from '../videos.js';

export const SITE = 'https://webluxe.github.io/V8-Motors/';
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const carUrl = (c, P = '') => `${P}cars/${c.id}.html`;

/* ------------------------------------------------------------------ icons */
const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" aria-hidden="true" ${extra}>${d}</svg>`;
export const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
  heart: svg('<path d="M12 20.5s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 2.8c0 5.5-7.5 10.1-7.5 10.1Z"/>'),
  scales: svg('<path d="M4 7h16M7 7l-3 7a3 3 0 0 0 6 0L7 7Zm10 0-3 7a3 3 0 0 0 6 0l-3-7ZM12 4v16M8 20h8"/>'),
  share: svg('<path d="M12 3v12M7 8l5-5 5 5M5 13v6h14v-6"/>'),
  arrowL: svg('<path d="M15 5l-7 7 7 7"/>'),
  arrowR: svg('<path d="M9 5l7 7-7 7"/>'),
  expand: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  phone: svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/>'),
  chat: svg('<path d="M4 5h16v11H9l-5 4V5Z"/>'),
  car: svg('<path d="M3 15v-3l2-5h14l2 5v3M3 15h18v3h-3v-2H6v2H3v-3Z"/><circle cx="7.5" cy="13" r="1"/><circle cx="16.5" cy="13" r="1"/>'),
  tag: svg('<path d="M3 12V4h8l10 10-8 8L3 12Z"/><circle cx="7.5" cy="8.5" r="1.3"/>'),
  coin: svg('<circle cx="12" cy="12" r="8.5"/><path d="M9.5 9.2c.4-1 1.4-1.6 2.6-1.6 1.6 0 2.6.9 2.6 2 0 2.7-5.2 1.6-5.2 4.4 0 1.1 1 2 2.6 2 1.2 0 2.2-.6 2.6-1.6M12 6v1.6M12 16v2"/>'),
  pin: svg('<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>'),
  gauge: svg('<path d="M4 16a8 8 0 1 1 16 0M12 16l4-5"/>'),
  engine: svg('<path d="M4 10h3l2-3h6v3h3v3h2v-3M4 10v6h3l2 2h7v-5M4 13H2"/>'),
  bolt: svg('<path d="M13 3 5 14h6l-1 7 8-11h-6l1-7Z"/>'),
  gear: svg('<path d="M6 4v16M12 4v16M18 4v8M6 12h12"/>'),
  fuel: svg('<path d="M5 20V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15M3 20h13M14 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3M8 8h3"/>'),
  seat: svg('<path d="M7 3h4l1 9H8L7 3ZM8 12l-1 4h10M17 16v4M7 16v4"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  shield: svg('<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>'),
  palette: svg('<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2 0-1.5-1-2 0-3s3 0 4-1 3-2 3-4a8 8 0 0 0-9-8Z"/><circle cx="7.5" cy="11" r="1"/><circle cx="11" cy="7" r="1"/><circle cx="16" cy="8.5" r="1"/>'),
  wheel: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/><path d="M12 4v5.5M4.5 14.5l5-1.5M19.5 14.5l-5-1.5"/>'),
  menu: svg('<path d="M4 7h16M4 12h16M4 17h10"/>'),
  reel: svg('<rect x="6" y="3.5" width="12" height="17" rx="2.5"/><path d="m10.5 9.5 4 2.5-4 2.5v-5Z"/>'),
  mail: svg('<path d="M3.5 6h17v12h-17zM4 6.5l8 6.5 8-6.5"/>'),
  route: svg('<path d="M6 19a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM18 10a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM8.5 16.5h7a3 3 0 0 0 0-6h-7a3 3 0 0 1 0-6H15"/>'),
  whatsapp: svg('<path d="M4.5 19.5l1.1-3.6A8 8 0 1 1 8.3 18.6l-3.8.9Z"/><path d="M9.2 8.6c.3-.6.6-.6.9-.6h.5c.2 0 .4 0 .6.5l.7 1.6c.1.2.1.4 0 .6l-.5.6c-.1.2-.2.4 0 .6.6 1 1.4 1.8 2.4 2.3.2.1.4.1.6-.1l.6-.7c.2-.2.4-.2.6-.1l1.6.8c.2.1.4.2.4.4 0 .3 0 1-.5 1.5-.5.5-1.6.9-2.6.6a9 9 0 0 1-5.1-4.5c-.6-1.3-.4-2.3.2-3.1Z"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  calendar: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  door: svg('<path d="M5 20V8l6-4h8v16H5ZM5 12h14M15 15h2"/>'),
};

/* ------------------------------------------------------------------ brand mark: the dealership's own V8 logo */
export const markSVG = (cls = 'mark', P = '') => `<img class="${cls}" src="${P}brand/v8-mark-sm.png" width="182" height="172" alt="" decoding="async">`;

/* ------------------------------------------------------------------ body shapes */
// Painted as cartoons by src/glass.css: flat paint and an ink outline.
export const shapeSvg = (type) => {
  const c = SHAPES[type] || SHAPES.Sedan;
  const wheels = c.w.map(([x, y, r, rim, spokes]) => `<g class="wheel"><circle class="s-tyre" cx="${x}" cy="${y}" r="${r}"/><circle class="s-hub" cx="${x}" cy="${y}" r="${rim}"/><path class="s-spokes" d="${spokes}"/><circle class="s-ring" cx="${x}" cy="${y}" r="${rim}"/></g>`).join('');
  return `<svg viewBox="0 0 240 96" aria-hidden="true" class="shape">
    <ellipse class="s-floor" cx="${(c.w[0][0] + c.w[1][0]) / 2}" cy="92.5" rx="${(c.w[1][0] - c.w[0][0]) / 2 + 34}" ry="2.8"/>
    <path class="s-body" d="${c.b}"/><path class="s-glass" d="${c.g}"/><path class="s-line" d="${c.s}"/><path class="s-gap" d="${c.l}"/>${c.r ? `<path class="s-rail" d="${c.r}"/>` : ''}<path class="s-handle" d="${c.d}"/>
    <path class="s-rim" d="${c.u}"/><path class="s-head" d="${c.h}"/><path class="s-tail" d="${c.t}"/>${wheels}</svg>`;
};

/* ------------------------------------------------------------------ images */
export function photo(src, { alt, srcset = '', sizes = '', eager = false, cls = '', w = 960, h = 634, attrs = '' }) {
  return `<img src="${src}"${srcset ? ` srcset="${srcset}" sizes="${sizes}"` : ''} width="${w}" height="${h}" alt="${esc(alt)}"
    ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" ${cls ? `class="${cls}"` : ''} ${attrs}>`;
}

const statusClass = (s) => (s === 'Just arrived' ? ' car-status--new' : s === 'Saturday deal' ? ' car-status--deal' : s === 'Reserved' ? ' car-status--reserved' : '');
const statusBadge = (c, extra = '') => (c.status === 'In stock' ? '' : `<span class="car-status${extra}${statusClass(c.status)}">${c.status}</span>`);

/* ------------------------------------------------------------------ car card */
// how a salesperson would say it: "2019 silver hatchback", "1.2 L petrol, manual"
const soft = (w) => (w === w.toUpperCase() ? w : w.toLowerCase());
const carLine = (c) => [c.year, c.colour && soft(c.colour), c.body && soft(c.body)].filter(Boolean).join(' ');
const specLine = (c) => [[c.engine, soft(c.fuel)].filter(Boolean).join(' '), soft(c.gearbox), c.km != null ? km(c.km) : ''].filter(Boolean).join(', ');

export function carCard(c, P = '', { eager = false, sizes = '(min-width: 1000px) 30vw, (min-width: 640px) 45vw, 92vw' } = {}) {
  const n = c.thumbs.length;
  return `<li class="car" data-id="${c.id}" data-flip-id="${c.id}">
    <a href="${carUrl(c, P)}" class="car-media" tabindex="-1" aria-hidden="true" data-scrub="${c.thumbs.map((t) => P + t).join('|')}">
      ${photo(thumb(c, 0, 960, P), { alt: '', eager, sizes, srcset: `${thumb(c, 0, 480, P)} 480w, ${thumb(c, 0, 960, P)} 960w`, attrs: 'data-car-img' })}
      ${statusBadge(c)}
      ${n > 1 ? `<span class="car-ticks" aria-hidden="true">${'<i></i>'.repeat(n)}</span><span class="car-photos tabular-nums">${n} photos</span>` : ''}
    </a>
    <div class="car-tools">
      <button type="button" class="save" data-save="${c.id}" aria-pressed="false" aria-label="Save the ${esc(carName(c))}">${ICON.heart}</button>
    </div>
    <div class="car-info">
      <div class="car-tag">
        <p class="car-price car-plate${c.status === 'Saturday deal' ? ' car-plate--deal' : ''} tabular-nums">${rs(c.price)}</p>
      </div>
      <h3 class="car-title"><a href="${carUrl(c, P)}" data-car-link>${esc(c.make)} ${esc(c.model)}</a></h3>
      <p class="car-kicker tabular-nums">${esc(carLine(c))}</p>
      <div class="car-foot">
        <div class="car-lines">
          <p class="car-line tabular-nums">${esc(specLine(c))}</p>
          <p class="car-monthly tabular-nums">or about ${rs(monthly(c.price))} a month</p>
        </div>
        <button type="button" class="car-compare" data-compare="${c.id}" aria-pressed="false" aria-label="Compare the ${esc(carName(c))}">${ICON.scales}<span>Compare</span></button>
      </div>
    </div>
  </li>`;
}

/* ------------------------------------------------------------------ chrome */
export const NAV_PAGES = [
  { key: 'home', href: './', label: 'Home' },
  { key: 'inventory', href: 'inventory.html', label: 'Catalogue' },
  { key: 'sell', href: 'sell.html', label: 'Sell' },
  { key: 'finance', href: 'finance.html', label: 'Leasing' },
  { key: 'contact', href: 'contact.html', label: 'Visit us' },
  { key: 'compare', href: 'compare.html', label: 'Compare' },
];

/** Page-change curtain: three layers per side sweep in, meet in the middle, then open on the next page. */
export function curtainHTML(P = '') {
  const side = (k) => `<div class="curtain-side curtain-side--${k}"><span class="cl cl-1"></span><span class="cl cl-2"></span><span class="cl cl-3"></span></div>`;
  return `<div class="curtain" data-curtain aria-hidden="true">${side('l')}${side('r')}
    <div class="curtain-mid">${markSVG('mark curtain-mark', P)}<span class="curtain-label" data-curtain-label></span></div></div>`;
}

export function navHTML(page, P = '') {
  return `${curtainHTML(P)}
  <header class="nav" data-nav>
    <a href="${P}./" class="wordmark" aria-label="V8 Motors, home">${markSVG('mark wordmark-mark', P)}<span>V8 Motors</span></a>
    <nav aria-label="Main" class="nav-links" data-nav-links>
      ${NAV_PAGES.map((p) => `<a href="${P}${p.href}"${p.key === page ? ' aria-current="page"' : ''}>${p.label}</a>`).join('')}
      <span class="nav-ink" data-nav-ink aria-hidden="true"></span>
    </nav>
  </header>`;
}

const MAPS_DIR = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(DEALER.mapsQuery)}`;
const WA = (text = 'Hello V8 Motors, ') => `https://wa.me/${DEALER.whatsapp}?text=${encodeURIComponent(text)}`;

/** Bottom dock on phones: the main actions sit where the thumb is. A pill glides to the current tab
    (and between pages, with the page transition); Menu opens a bottom sheet with everything else. */
export function mobileBarHTML(page, P = '') {
  const tab = (key, href, icon, label) => `<a href="${href}" class="tab"${key === page ? ' aria-current="page"' : ''}>${icon}<span>${label}</span></a>`;
  return `<nav class="tabbar" aria-label="Quick links" data-tabbar>
    <span class="tab-pill" data-tab-pill aria-hidden="true"></span>
    ${tab('home', `${P}./`, markSVG('mark tab-mark', P), 'Home')}
    ${tab('inventory', `${P}inventory.html`, ICON.car, 'Catalogue')}
    <a href="${DEALER.phoneHref}" class="tab tab--call">${ICON.phone}<span>Call</span></a>
    <button type="button" class="tab" data-menu-open aria-haspopup="dialog" aria-expanded="false" aria-controls="menu-sheet"${['sell', 'finance', 'contact', 'compare'].includes(page) ? ' aria-current="page"' : ''}>${ICON.menu}<span>Menu</span></button>
  </nav>
  ${menuSheetHTML(page, P)}`;
}

/** The menu as a bottom sheet (never a full-screen takeover): every page, the quickest ways to reach
    the showroom, and whether it's open right now. Drag it down, tap outside or press Escape to close. */
export function menuSheetHTML(page, P = '') {
  const link = (key, href, icon, label, meta) => `<a href="${href}" class="sheet-link"${key === page ? ' aria-current="page"' : ''}>${icon}<span><strong>${label}</strong>${meta ? `<small>${meta}</small>` : ''}</span></a>`;
  return `<div class="sheet-scrim" data-menu-scrim hidden></div>
  <div class="sheet" id="menu-sheet" role="dialog" aria-modal="true" aria-labelledby="menu-title" data-menu hidden>
    <div class="sheet-grab" data-menu-grab aria-hidden="true"><span></span></div>
    <div class="sheet-head">
      <p class="sheet-title" id="menu-title">V8 <em>Motors</em></p>
      <button type="button" class="sheet-close" data-menu-close aria-label="Close the menu">${ICON.close}</button>
    </div>
    <p class="sheet-status open-status" data-open-status></p>
    <nav class="sheet-links" aria-label="All pages">
      ${link('home', `${P}./`, markSVG('mark', P), 'Home', '')}
      ${link('inventory', `${P}inventory.html`, ICON.car, 'Catalogue', `${CARS.length} in stock`)}
      ${link('sell', `${P}sell.html`, ICON.tag, 'Sell', 'A guide price in 3 steps')}
      ${link('finance', `${P}finance.html`, ICON.coin, 'Leasing', `With ${DEALER.leasing}`)}
      ${link('contact', `${P}contact.html`, ICON.pin, 'Visit us', `${DEALER.street}, ${DEALER.locality}`)}
      ${link('compare', `${P}compare.html`, ICON.scales, 'Compare', 'Up to three cars')}
      ${link('saved', `${P}inventory.html?saved=1`, ICON.heart, 'Saved', '<span data-saved-count>0</span> saved')}
    </nav>
    <div class="sheet-ways">
      <a href="${DEALER.phoneHref}" class="way-btn">${ICON.phone}<span>Call</span></a>
      <a href="${WA()}" class="way-btn" rel="noopener">${ICON.whatsapp}<span>WhatsApp</span></a>
      <a href="mailto:${DEALER.email}" class="way-btn">${ICON.mail}<span>Email</span></a>
      <a href="${MAPS_DIR}" class="way-btn" rel="noopener">${ICON.route}<span>Directions</span></a>
    </div>
  </div>`;
}

export function footerHTML(P = '') {
  const pages = NAV_PAGES;
  return `<footer class="footer">
    <div class="wrap">
      <div class="footer-grid">
        <a href="${P}./" class="wordmark wordmark--lg" aria-label="V8 Motors, home">${markSVG('mark wordmark-mark', P)}<span>V8 Motors</span></a>
        <nav class="footer-pages" aria-label="Footer">${pages.map((p) => `<a href="${P}${p.href}">${p.label}</a>`).join('')}</nav>
        <div class="footer-where">
          <address>${DEALER.street}<br>${DEALER.locality}, Mauritius</address>
          <a href="mailto:${DEALER.email}">${DEALER.email}</a>
        </div>
        <p class="footer-phones">${DEALER.phones.map(([t, h]) => `<a href="${h}" class="tabular-nums">${t}</a>`).join('')}</p>
      </div>
      <div class="footer-row">
        <p>© ${new Date().getFullYear()} ${DEALER.legalName}. Leasing subject to approval by ${DEALER.leasing}.</p>
        <p class="footer-built">Website built by <a href="https://webluxe.github.io/WebLuxe/" rel="noopener">WebLuxe</a></p>
        <p class="footer-legal"><a href="${P}privacy.html">Privacy policy</a><a href="${P}terms.html">Terms of sale</a></p>
      </div>
      <p class="footer-credits">Stock photos by V8 Motors. 3D car from <a href="https://sketchfab.com/models/b477326cf8b041c9b1a89b1c4f4e7bdf" rel="noopener">Range Rover Sport Hybrid PHEV 2023 by victor-arrais</a>, engine from <a href="https://sketchfab.com/models/f20acef709b847eb98839b89c5ef916c" rel="noopener">V8 Hot Rod Engine by ShotaB</a>, both adapted, <a href="https://creativecommons.org/licenses/by/4.0/" rel="noopener">CC BY 4.0</a>. Engine sound from CC0 recordings by marcelweiss and Paul368 on Freesound.</p>
    </div>
  </footer>`;
}

/* ------------------------------------------------------------------ head / SEO */
export function headHTML({ title, desc, path, image, jsonld = [], P = '' }) {
  const url = SITE + path;
  const img = image || `${SITE}og.jpg`;
  return `<script>(function(){try{var n=performance.getEntriesByType('navigation')[0],f=location.pathname.split('/').pop();if(n&&n.type==='reload'&&f&&f!=='index.html'){sessionStorage.setItem('v8:restart','1');location.replace('${P}./')}}catch(e){}})();(function(d){try{if(sessionStorage.getItem('v8:curtain')&&!matchMedia('(prefers-reduced-motion: reduce)').matches)d.classList.add('curtain-in');addEventListener('pagereveal',function(e){if(e.viewTransition&&d.classList.contains('curtain-in'))e.viewTransition.skipTransition()});
    /* if the page script never runs (offline, blocked), don't leave the intro or hidden content in the way */
    setTimeout(function(){if(!window.__v8){d.classList.remove('play-intro','js');}},9000);}catch(e){}})(document.documentElement)</script>
  <script type="speculationrules">{"prefetch":[{"where":{"and":[{"selector_matches":"a[href]"},{"not":{"selector_matches":"[rel~=noopener],[href^='tel:'],[href^='mailto:'],[href*='://']"}}]},"eagerness":"moderate"}]}</script>
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}" />
  <link rel="canonical" href="${url}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="V8 Motors" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${img}" />${img.includes('/share/') ? `
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${esc(title.split(' for sale')[0])}" />` : ''}
  <meta property="og:locale" content="en_MU" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(desc)}" />
  <meta name="twitter:image" content="${img}" />
  <meta name="theme-color" content="#e6e9ed" />
  <link rel="icon" href="${P}favicon.svg" type="image/svg+xml" />
  <link rel="icon" href="${P}favicon-32.png" sizes="32x32" type="image/png" />
  <link rel="apple-touch-icon" href="${P}apple-touch-icon.png" />
  <link rel="manifest" href="${P}site.webmanifest" />
  ${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n  ')}`;
}

export function dealerJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'AutoDealer',
    '@id': `${SITE}#dealer`,
    name: 'V8 Motors',
    url: SITE,
    logo: `${SITE}brand/v8-mark.png`,
    image: `${SITE}og.jpg`,
    telephone: '+230' + DEALER.phone.replace(/\s/g, ''),
    email: DEALER.email,
    priceRange: `${rs(Math.min(...CARS.map((c) => c.price)))} to ${rs(Math.max(...CARS.map((c) => c.price)))}`,
    address: { '@type': 'PostalAddress', streetAddress: DEALER.street, addressLocality: DEALER.locality, addressCountry: 'MU' },
    areaServed: 'Mauritius',
    openingHoursSpecification: DEALER.hours.map((h, d) => h && {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d],
      opens: h[0], closes: h[1],
    }).filter(Boolean),
  };
}

export function breadcrumbJsonLd(items) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + path })),
  };
}

export function carJsonLd(c) {
  return {
    '@context': 'https://schema.org',
    '@type': ['Product', 'Car'],
    name: carName(c),
    brand: { '@type': 'Brand', name: c.make },
    model: c.model,
    vehicleModelDate: String(c.year),
    ...(c.km != null && { mileageFromOdometer: { '@type': 'QuantitativeValue', value: c.km, unitCode: 'KMT' } }),
    fuelType: c.fuel,
    vehicleTransmission: c.gearbox,
    bodyType: c.body,
    ...(c.colour && { color: c.colour }),
    ...(c.engineCc && { vehicleEngine: { '@type': 'EngineSpecification', engineDisplacement: { '@type': 'QuantitativeValue', value: c.engineCc, unitCode: 'CMQ' } } }),
    ...(c.seats && { seatingCapacity: c.seats }),
    ...(c.description && { description: c.description }),
    itemCondition: 'https://schema.org/UsedCondition',
    image: c.images,
    url: `${SITE}cars/${c.id}.html`,
    offers: {
      '@type': 'Offer', price: c.price, priceCurrency: 'MUR',
      availability: 'https://schema.org/InStock',
      seller: { '@type': 'AutoDealer', '@id': `${SITE}#dealer`, name: 'V8 Motors', url: SITE, telephone: '+230' + DEALER.phone.replace(/\s/g, ''), address: { '@type': 'PostalAddress', streetAddress: DEALER.street, addressLocality: DEALER.locality, addressCountry: 'MU' } },
    },
  };
}

/* ------------------------------------------------------------------ car page */
export function honeypot() {
  return `<div class="hp" aria-hidden="true"><label>Leave this field empty<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>`;
}

export function carPageHTML(c, P = '../') {
  const name = carName(c);
  const n = c.images.length;
  const video = VIDEOS[c.id]?.tiktok || VIDEOS[c.id]?.youtube; // the Video button and its player are only there for a car with a video
  const waText = encodeURIComponent(`Hi V8 Motors, I'm interested in the ${name} (${rs(c.price)}). Is it still available to view?`);
  // every figure we hold on the car
  const specs = [
    [ICON.calendar, 'Year', c.year],
    [ICON.gauge, 'Mileage', c.km != null ? km(c.km) : 'Ask us'],
    c.engine && [ICON.engine, 'Engine', c.engineCc ? `${c.engine}, ${c.engineCc.toLocaleString('en-US')} cc` : c.engine],
    [ICON.gear, 'Gearbox', c.gearbox],
    [ICON.fuel, 'Fuel', c.fuel],
    [ICON.car, 'Body', c.body],
    c.colour && [ICON.palette, 'Colour', c.colour],
    c.seats && [ICON.seat, 'Seats', c.seats],
    c.doors && [ICON.door, 'Doors', c.doors],
  ].filter(Boolean);
  return `
  <div class="wrap car-page" data-car="${c.id}">
    <nav class="crumbs" aria-label="Breadcrumb">
      <a href="${P}./">Home</a><span aria-hidden="true">/</span><a href="${P}inventory.html">Catalogue</a><span aria-hidden="true">/</span>
      <a href="${P}inventory.html?make=${encodeURIComponent(c.make)}">${c.make}</a><span aria-hidden="true">/</span><span aria-current="page">${esc(c.model)}</span>
    </nav>

    <div class="car-top">
      <div class="gallery" data-gallery>
        <div class="gallery-main" data-gal-tilt>
          ${photo(large(c, 0, P), { alt: `${name}${c.colour ? ` in ${c.colour.toLowerCase()}` : ''}, photo 1 of ${n}`, eager: true, w: 1591, h: 1200, attrs: `data-gal-img style="background-image:url(${P}${c.thumbs[0]});view-transition-name:car-hero"` })}
          ${statusBadge(c, ' car-status--lg')}
          ${n > 1 ? `
          <button type="button" class="gal-arrow gal-prev" data-gal-prev aria-label="Previous photo">${ICON.arrowL}</button>
          <button type="button" class="gal-arrow gal-next" data-gal-next aria-label="Next photo">${ICON.arrowR}</button>` : ''}
          ${video ? `<button type="button" class="gal-video" data-video-open>${ICON.play}<span>Video</span></button>` : ''}
          <button type="button" class="gal-expand" data-gal-open aria-label="Open photos full screen">${ICON.expand}<span class="tabular-nums" data-gal-count>1 / ${n}</span></button>
        </div>
        ${n > 1 ? `<div class="gallery-thumbs" style="--n:${Math.min(n, 6)}">${c.thumbs.slice(0, 6).map((src, i) =>
          `<button type="button" data-gal-thumb="${i}" aria-current="${i === 0}" aria-label="Show photo ${i + 1}"><img src="${P}${src}" width="480" height="317" alt="" loading="lazy">${i === 5 && n > 6 ? `<span class="gal-more" data-gal-open aria-label="Show all ${n} photos">+${n - 5}</span>` : ''}</button>`).join('')}</div>` : ''}
      </div>

      <aside class="summary" data-summary>
        <h1 class="summary-title">${esc(c.make)} <em>${esc(c.model)}</em></h1>
        <p class="summary-kicker tabular-nums">${esc(carLine(c))}</p>
        <div class="summary-price">
          <p class="summary-amount car-plate${c.status === 'Saturday deal' ? ' car-plate--deal' : ''} tabular-nums" data-price>${rs(c.price)}</p>
          <p class="summary-monthly tabular-nums">or about <strong>${rs(monthly(c.price))}</strong> a month on lease, 20% down over 5 years</p>
        </div>
        <dl class="specs" aria-label="Specifications">${specs.map(([icon, k, v]) => `<div class="spec">${icon}<dt>${k}</dt><dd class="tabular-nums">${esc(v)}</dd></div>`).join('')}</dl>
        <div class="summary-contact">
          <a class="btn btn-primary" href="https://wa.me/${DEALER.whatsapp}?text=${waText}" rel="noopener">${ICON.chat}WhatsApp</a>
          <a class="btn btn-line" href="${DEALER.phoneHref}">${ICON.phone}Call</a>
        </div>
        <div class="summary-tools">
          <button type="button" class="tool" data-save="${c.id}" aria-pressed="false">${ICON.heart}<span>Save</span></button>
          <button type="button" class="tool" data-compare="${c.id}" aria-pressed="false">${ICON.scales}<span>Compare</span></button>
          <button type="button" class="tool" data-share>${ICON.share}<span>Share</span></button>
        </div>
      </aside>
    </div>

    <section class="car-section fin-mini" aria-labelledby="fin-h">
      <div class="fin-mini-box">
        <div>
          <h2 class="fin-mini-title" id="fin-h">Your monthly <em>payment</em></h2>
          <p class="fin-mini-note">An example at ${DEALER.financeRate}% a year. ${DEALER.leasing} confirms the real figure. <a href="${P}finance.html?id=${c.id}" class="link">Full calculator</a></p>
        </div>
        <label class="slider"><span class="slider-top"><span>Deposit</span><output class="tabular-nums" data-mini-dep-out>20%, ${rs(c.price * 0.2)}</output></span>
          <input type="range" min="10" max="60" step="5" value="20" data-mini-dep></label>
        <label class="slider"><span class="slider-top"><span>Term</span><output class="tabular-nums" data-mini-term-out>5 years</output></span>
          <input type="range" min="12" max="84" step="12" value="60" data-mini-term></label>
        <p class="fin-mini-figure tabular-nums" aria-live="polite" data-mini-out>${rs(monthly(c.price))}<span> a month</span></p>
      </div>
    </section>
  </div>

  <div class="buybar" data-buybar>
    <div class="buybar-text"><p class="buybar-name">${esc(c.make)} ${esc(c.model)}</p><p class="buybar-price tabular-nums">${rs(c.price)}</p></div>
    <a href="${DEALER.phoneHref}" class="btn btn-line buybar-icon" aria-label="Call V8 Motors">${ICON.phone}</a>
    <a href="https://wa.me/${DEALER.whatsapp}?text=${waText}" class="btn btn-primary" rel="noopener">WhatsApp</a>
  </div>

  <dialog class="lightbox" data-lightbox aria-label="Photos of the ${esc(name)}">
    <img alt="" data-lb-img>
    <p class="lb-count tabular-nums" data-lb-count></p>
    ${video ? `<button type="button" class="lb-video" data-video-open>${ICON.play}<span>Video</span></button>` : ''}
    <button type="button" class="lb-close" data-lb-close aria-label="Close photos">${ICON.close}</button>
    ${n > 1 ? `<button type="button" class="lb-arrow lb-prev" data-lb-prev aria-label="Previous photo">${ICON.arrowL}</button>
    <button type="button" class="lb-arrow lb-next" data-lb-next aria-label="Next photo">${ICON.arrowR}</button>` : ''}
  </dialog>${video ? `
  <dialog class="video-box" data-video-box aria-label="Video of the ${esc(name)}">
    <div class="video-frame" data-video-frame style="--poster:url('${large(c, 0, P)}')"></div>
    <button type="button" class="video-swap" data-video-swap hidden>Not playing? Watch on YouTube</button>
    <button type="button" class="lb-close" data-video-close aria-label="Close the video">${ICON.close}</button>
  </dialog>` : ''}`;
}

/* ------------------------------------------------------------------ home: what you get. One panel open at a time */
const PROMISES = [
  { tone: 'red', car: 'SUV', title: 'Buy, sell or exchange', text: `Bring your old car, drive away with a new one. Buy, sell or exchange, with leasing through ${DEALER.leasing}.`, href: 'sell.html', cta: 'Sell your car' },
  { tone: 'blue', car: 'Sedan', title: 'Leasing available', text: `Drive now, pay monthly with ${DEALER.leasing}.`, href: 'finance.html', cta: 'Work out a payment' },
  { tone: 'yellow', car: 'Hatchback', title: 'All cars checked', text: 'Clean, reliable and road-ready.', href: 'inventory.html', cta: 'See the catalogue' },
  { tone: 'green', car: 'Pickup', title: 'New stock every week', text: 'Come visit or contact us to see what’s new.', href: 'contact.html', cta: 'Visit us' },
];
export function promisesHTML(P = '') {
  return PROMISES.map((p, i) => `<section class="acc-item acc-item--${p.tone}${i ? '' : ' is-open'}">
    <h3 class="acc-h"><button type="button" class="acc-btn" id="acc-b${i}" aria-controls="acc-p${i}" aria-expanded="${!i}"><i class="acc-dot" aria-hidden="true"></i><span class="acc-name">${p.title}</span></button></h3>
    <div class="acc-panel" id="acc-p${i}" role="region" aria-labelledby="acc-b${i}"><div class="acc-inner">
      <div class="acc-text"><p class="acc-title" aria-hidden="true">${p.title}</p><p class="acc-sub">${p.text}</p><a class="acc-link" href="${P}${p.href}">${p.cta}</a></div>
      ${shapeSvg(p.car)}
    </div></div>
  </section>`).join('');
}

/* ------------------------------------------------------------------ Visit us */
export function hoursHTML() {
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const same = (a, b) => String(DEALER.hours[a]) === String(DEALER.hours[b]);
  const rows = [];
  for (const d of [1, 2, 3, 4, 5, 6, 0]) {
    const last = rows[rows.length - 1];
    if (last && same(last.to, d)) last.to = d; else rows.push({ from: d, to: d });
  }
  return rows.map(({ from, to }) => {
    const h = DEALER.hours[from];
    return `<tr><th scope="row">${from === to ? DAYS[from] : `${DAYS[from]} to ${DAYS[to]}`}</th><td class="${h ? '' : 'closed'} tabular-nums">${h ? `${fmtTime(h[0])} to ${fmtTime(h[1])}` : 'Closed'}</td></tr>`;
  }).join('');
}
export function reachHTML() {
  return `<div class="reach-row reach-row--phones"><span class="reach-k">Call</span><p class="reach-phones">${DEALER.phones.map(([t, h]) => `<a href="${h}" class="tabular-nums">${t}</a>`).join('')}</p></div>
    <div class="reach-row"><span class="reach-k">WhatsApp</span><a class="tabular-nums" href="https://wa.me/${DEALER.whatsapp}" rel="noopener">${DEALER.phone}</a></div>
    <div class="reach-row"><span class="reach-k">Email</span><a href="mailto:${DEALER.email}">${DEALER.email}</a></div>`;
}

export function inventoryGridHTML(P = '') {
  return [...CARS].sort((a, b) => b.added.localeCompare(a.added)).map((c, i) => carCard(c, P, { eager: i < 3 })).join('');
}

/* ------------------------------------------------------------------ inventory filter options */
export function filterOptionsHTML(kind) {
  if (kind === 'body') return BODY_TYPES.filter((t) => CARS.some((c) => c.body === t)).map((t) => `<label class="body-opt"><input type="checkbox" name="body" value="${t}">
    <span>${shapeSvg(t)}<span class="body-opt-name">${t}</span><span class="body-opt-n tabular-nums" data-n-body="${t}">${CARS.filter((c) => c.body === t).length}</span></span></label>`).join('');
  if (kind === 'fuel') return ['Petrol', 'Diesel', 'Hybrid', 'Electric'].filter((f) => CARS.some((c) => c.fuel === f)).map((f) => `<label class="pill"><input type="checkbox" name="fuel" value="${f}"><span>${f} <span class="pill-n tabular-nums" data-n-fuel="${f}">${CARS.filter((c) => c.fuel === f).length}</span></span></label>`).join('');
  return '';
}
