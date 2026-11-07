// The dealership and its stock. Cars come from the V8 Motors stock API via scripts/sync-inventory.mjs,
// which runs before every dev start and build and saves a snapshot to src/inventory.json.
import INVENTORY from './inventory.json' with { type: 'json' };

export { DEALER } from './dealer.js';
import { DEALER } from './dealer.js';

export const BODY_TYPES = ['Hatchback', 'Sedan', 'SUV', 'MPV', 'Pickup', 'Van'];
export const FUELS = ['Petrol', 'Diesel', 'Hybrid', 'Electric'];

const DAY = 864e5;
const syncedAt = Date.parse(INVENTORY.syncedAt);

export const CARS = INVENTORY.cars.map((c) => ({
  ...c,
  images: c.photos, // full size, from the dealership's own photo server
  // a plain one-line description for cards: "1.3 L petrol, blue hatchback"
  trim: [c.engine && `${c.engine} ${c.fuel.toLowerCase()}`, [c.colour && c.colour.toLowerCase(), c.body === 'SUV' || c.body === 'MPV' ? c.body : c.body.toLowerCase()].filter(Boolean).join(' ')].filter(Boolean).join(', '),
  status: c.deal ? 'Saturday deal' : syncedAt - Date.parse(c.added) < 14 * DAY ? 'Just arrived' : 'In stock',
}));

export const SYNCED_AT = INVENTORY.syncedAt;
export const byId = (id) => CARS.find((c) => c.id === id);
export const carName = (c) => `${c.year} ${c.make} ${c.model}`;
export const rs = (n) => 'Rs ' + Math.round(n).toLocaleString('en-US');
export const km = (n) => (n == null ? 'Ask us' : n.toLocaleString('en-US') + ' km');

/** Local thumbnail of photo `i` (480 px wide; the first photo also has a 960 px version). */
/** The gallery's copy of photo `i`, 1280 px wide, hosted with the site. */
export const large = (c, i = 0, P = '') => `${P}images/cars/${c.id}/${i}-1280.webp`;

export const thumb = (c, i = 0, w = 480, P = '') => `${P}images/cars/${c.id}/${i}-${i === 0 ? w : 480}.webp`;

/** The dearest car a monthly figure pays for, on the same example terms as monthly(). */
export function priceForMonthly(m, depositPct = 20, months = 60, rate = DEALER.financeRate) {
  const r = rate / 100 / 12;
  return (m * (1 - Math.pow(1 + r, -months))) / r / (1 - depositPct / 100);
}

export function monthly(price, depositPct = 20, months = 60, rate = DEALER.financeRate) {
  const principal = price * (1 - depositPct / 100);
  const r = rate / 100 / 12;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}
