# V8 Motors

Showroom and stock website for V8 Motors, a used car dealer at 59B Royal Road, Coromandel, Mauritius.
Vite, Tailwind CSS v4, GSAP and Lenis, no framework: about 60 KB of JavaScript (gzipped) shared by every page. The home page also loads three.js and the 3D Range Rover, on their own, so no other page pays for them.

**The idea:** a brushed-steel showroom. It opens on the Range Rover's start button on silver, the engine fires and the car flashes its lights at you, and from there the site is the car, a search with four coloured panels, and Saturday's countdown with the footer. Everything else stands on the page as liquid glass, and every so often a single car races past behind it.

Live site: https://webluxe.github.io/V8-Motors/

```
npm install
npm run dev       # http://localhost:5173
npm run sync      # pull the latest stock from the V8 Motors stock API (also runs before dev and build)
npm run build     # static site in dist/
npm run deploy    # build + publish dist/ to the gh-pages branch (GitHub Pages)
```

## Real stock

The cars come from the dealership's own stock API, the same one behind v8motors.mu/catalogue.html
(`https://v8.farhaan.info/api/cars`). `scripts/sync-inventory.mjs` runs before every dev start and build:

- fetches every car marked for sale, tidies the names (`NISSAN NP 300` becomes `Nissan NP300`, `Range Rover` becomes `Land Rover Range Rover`) and fixes vans and MPVs filed as "Other";
- saves a snapshot to `src/inventory.json` (committed, so a build still works if the API is down);
- makes WebP copies of every photo in `public/images/cars/<car>/`, one folder per car (not committed; re-created on the next sync, and a sold car's folder is removed). Full-size photos load from the dealer's photo server on each car page.

So to publish new stock: add it in the dealership's admin as usual, then run `npm run deploy`.

Only what the dealer publishes is shown. There are no invented inspection scores, warranties, horsepower, owner counts or reviews. Mileage shows where the dealer has entered it, and "Ask us" where they haven't.

## Design

Silver steel and liquid glass, with the red of the dealership's logo for the one main action on a screen, so the cars are the colourful thing on every page. `src/site.css` is the base, `src/flagship.css` builds on it, and `src/glass.css`, loaded last, is the design every page shares: the same heading, the same panel and the same footer.

- **Colours:** steel greys for the page, dark type (`#121317`), the logo's red (`#e0262f`) for buttons and the Saturday screen, and four soft tints on the home page's panels.
- **Type:** Archivo (self-hosted, variable width and weight), wide and tight for headlines, with one accent word per headline in Bodoni Moda italic: "Sell *your car*". Nothing on the site is smaller than 11 px.
- **Rhythm:** one vertical gap between chapters on every page (`--sec`), one gap from heading to content (`--head-gap`), one spacing scale for everything else.
- **Numbers:** the catalogue's car count rolls like an odometer (`src/lib/odo.js`).
- **The background:** polished silver with slow moving light, drawn by the same program as the glass. Every 6 to 14 seconds a group of one to four cars races across behind the page.
- **Layout:** on a PC the home page is three screens locked to the mouse wheel; Sell, Leasing, Visit us and the car pages fit one window, footer included; the catalogue's filters are always fully on screen. Each is checked from 1366x633 to 2560x1305.
- **Glass:** `src/lib/glass.js` is one canvas behind the page and one small graphics-card program that paints the steel, the racing cars and every glass panel in a single pass, so the glass really bends what is behind it. About 1 ms a frame. Touch screens and modest machines get a plain readable panel instead.

### Saved cars (`inventory.html?saved=1`)

Hearts save a car on this device. The Saved only switch in the catalogue shows them, and sends the whole list to the dealer's WhatsApp in one tap, already written.

### Car cards

Every car card is a pane of liquid glass with the photo set into it. The default in the catalogue is one row per car: photo, name, price, specs, a heart and a labelled Compare button. Pointing at a card leans it slightly and a soft light follows the mouse.

### Car pages

Everything sits on one screen: the photos on the left, reaching exactly as far down as the column beside them, and on the right the name, the price, the monthly figure and every spec on glass tiles, then WhatsApp, Call, Save, Compare and Share. Under them, one slim panel works out the monthly payment.

The dealer's photo server takes about two seconds per photo, so the gallery never waits on it. `scripts/sync-inventory.mjs` keeps a 1280 px copy of every photo with the site. A car page fetches them all once it has settled, and a switch shows the thumbnail instantly if the big copy hasn't arrived yet. Full screen shows our copy at once and swaps in the dealer's full-size original when it arrives.

### Navigation

- **Phones:** nothing fixed at the bottom of the screen. Three lines at the top right open the menu, which drops from the top (never a full-screen popup) with every page, the live open/closed status and one-tap Call, WhatsApp, Email and Directions. Drag it up, tap outside or press Escape to close. The home page plays a filmed loop of the Range Rover instead of drawing it live, so it is smooth on every phone.
- **Wide screens:** one underline glides under whichever menu link you point at, and back to the current page.
- **Page changes:** the curtain, in every browser: red and silver layers sweep in from both sides, meet on the logo and the name of the page (or the car), and open on the next page.
- **Footer:** every page closes on the same one: the pages, the address and email, all four phone numbers, and the small print. On the home page the Saturday red fades into it.

### Home page

- **The car:** the first screen is only the car, with Spin it, Make it dance and Light show at the bottom. Drag to turn it.
- **Search and what you get:** the search over four tinted panels. Pointing at one opens it and closes the last; a tap does the same on a touch screen.
- **Saturday deals:** a live countdown (Mauritius time), sharing the last screen with the footer.
- **Mouse lock:** one flick of the wheel moves exactly one screen, and so do the arrow keys, Page Up and Page Down. Touch screens scroll as usual.

### Home page

- **Hero:** "Drive *smarter.*", where the accent word rolls over every few seconds like an odometer drum, one plain sentence, one primary action, and a readout of real numbers (cars in stock, the lowest price, open or closed right now).
- **The drive:** the hero stays on screen for a long stretch of scrolling, one unbroken shot with your thumb on the throttle. With a mouse or trackpad it runs in stops: one flick of the wheel plays the next part and the page holds until it lands. The car pulls off, the camera slides round to its side, it runs flat out along the hall with the wheels turning at the right speed for the road, the camera comes round the bonnet to dead ahead, and the camera keeps easing in while the showroom dissolves into the page and "Just in" fades up through it, with no cut and no flash. Short landscape screens and reduced motion skip it.
- **Just in:** the newest cars on a rail you swipe.
- **Shapes:** body-type tiles whose little cars drive in, wheels turning, as they scroll into view.
- **Saturday deals:** a live countdown (Mauritius time), sharing the last screen with the footer.

### Mobile performance

- Smooth (Lenis) scrolling only runs with a mouse or trackpad; phones use their own touch scrolling.
- Every looping animation moves only by transform and opacity, so none of them repaints the page; nothing animates off screen (the rotating word, countdown and background pause when they can't be seen).
- Text pages don't download the stock list: the dealer's details live in their own small module (`src/dealer.js`).
- Fonts are self-hosted and preloaded with metric-matched fallbacks; images carry their sizes and load lazily. Measured layout shift while loading is zero on every page tested.
- With reduced motion turned on there is no intro, no drifting or rolling, and nothing waits to be revealed.

## Pages

| Page | What it does |
| --- | --- |
| `index.html` | Intro, the car with its three tricks, search and the four panels, Saturday deals with countdown |
| `inventory.html` | The catalogue: every car, with filters (body, price and year ranges, fuel, gearbox, saved only) in a bottom sheet on phones, chips, sort, list or grid, filters kept in the URL, compare tray |
| `cars/<id>.html` | One real page per car (generated at build): the dealer's photos with full screen and zoom, every spec, WhatsApp and Call, monthly payment |
| `compare.html` | Up to three cars side by side, best value per row marked |
| `sell.html` | Sell or exchange: three steps with a live rough guide price |
| `finance.html` | Leasing calculator (leasing is through Rogers Capital) with the cost split |
| `contact.html` | Map, opening hours, all four phone numbers, WhatsApp and email |
| `privacy.html`, `terms.html` | Privacy policy and terms |
| `404.html` | Not-found page |

### Forms

The sell form validates on the page, then opens WhatsApp to V8 Motors with the message already written. The visitor presses send in their own app. Nothing is stored on a server.

## Folders

```
*.html                 the pages (they stay at the top so the web addresses stay short)
src/                   code and styles: pages/ (one file per page), lib/ (shared), fonts/, inventory.json, dealer.js
scripts/               build tools: stock sync, car pages, deploy, the intro film and the car loop
public/                copied to the site as it is
  images/brand/        the V8 Motors logo
  images/gate/         the engine start button
  images/hero/         the still photo of the Range Rover
  images/cars/<car>/   each car's photos (made by the stock sync)
  images/share/        the picture each car shows when its link is shared
  media/intro/         the intro film for phones and the engine sound
  media/hero/          the filmed loop of the car that phones and tablets play
  models/              the 3D car, engine, bay and sign, and the showroom textures (computers only)
  sw.js, icons, site.webmanifest
```

## How it is built

- `src/dealer.js`: dealer details (address, phones, hours, leasing partner, example rate). `src/data.js`: the stock from `src/inventory.json`, plus helpers.
- `src/lib/templates.js`: HTML templates shared by the build and the browser (nav and its menu button, menu sheet, footer, cards, car pages, meta tags, structured data).
- `src/lib/layout.js`: what every page shares (transitions, nav underline, menu sheet, scrolling, toasts, forms). `src/lib/glass.js`: the steel, the racing cars and the liquid glass, in one pass. `src/lib/shapes.js`: the 2D car drawings. `src/lib/fx.js`: reveals, count-ups, the rev bar, photo swipes. `src/lib/odo.js`: the odometer numbers. `src/lib/hours.js`: opening hours and the Saturday countdown.
- `vite.config.js`: a small plugin fills `<!--@...-->` placeholders, so every page ships complete HTML.
- `scripts/prerender.mjs`: writes `cars/*.html`, `public/sitemap.xml`, `public/robots.txt` and `public/llms.txt` (generated, not committed).
- `scripts/film.mjs`: renders the phone intro film. `scripts/hero-loop.mjs`: renders the looping car video phones and tablets play instead of the live 3D car.
- `src/site.css`: the base styles. `src/flagship.css`: the current design layer, loaded after it. `src/pages/*.js`: behaviour for each page.

## Still needs the dealer

- **WhatsApp number:** the forms send to 5259 0327, the first number on the dealer's site. Change `whatsapp` in `src/dealer.js` (and `DEALER_WA` in `src/lib/layout.js`) if WhatsApp is on another number.
- **Leasing rate:** the 7.5% in the calculators is an example only and is labelled as one. Set `financeRate` in `src/dealer.js` to a typical Rogers Capital rate.
- **Body types:** a few cars are filed under an unexpected body type in the dealer's admin (the Kia Sportage as a hatchback, for example); the site shows what the admin says.
- **Legal text:** `privacy.html` and `terms.html` are plain, honest starting points. Have them checked.
- **Analytics:** none installed.
- **Custom domain:** add it in the repository's Pages settings and update `SITE` in `src/lib/templates.js`.

## Credits

- **Stock photos and logo:** V8 Motors.
- **Intro engine:** adapted from [V8 Hot Rod Engine by ShotaB](https://sketchfab.com/models/f20acef709b847eb98839b89c5ef916c), CC BY 4.0. Changes: exhausts shortened, reduced for the web, split into parts.
- **Home page 3D car:** adapted from [Range Rover Sport Hybrid PHEV 2023 by victor-arrais](https://sketchfab.com/models/b477326cf8b041c9b1a89b1c4f4e7bdf), CC BY 4.0. Changes: reduced for the web, roof fins removed, recoloured, red bow and number plates added.
- **Home page hall and carbon texture:** modelled and rendered in Blender for this site, with [Concrete](https://polyhaven.com/a/concrete) and [Hangar Concrete Floor](https://polyhaven.com/a/hangar_concrete_floor) from Poly Haven (CC0).
- **Fonts:** Archivo and Bodoni Moda, both under the SIL Open Font License.
- **Engine sound,** built from CC0 (public domain) recordings on Freesound:
  - [S63 AMG V8 engine revs](https://freesound.org/people/marcelweiss/sounds/505321/) by marcelweiss;
  - the starter crank and start-up from [Aston Martin Rapide start](https://freesound.org/people/Paul368/sounds/320096/) by Paul368.
