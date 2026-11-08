// Keeps the site's files close to the visitor. Pages always ask the network first, so a new version shows up straight away and an
// old copy only serves when there is no connection. Files with a fingerprint in their name never change once
// published, so they come straight from here. Stock photos, models and the intro show at once and refresh quietly behind the scenes.
// one up whenever a file kept here changes under the same name (the models, media/hero's films): the old copies are cleared then
const VERSION = 'v8motors-3';
const ONLY_OURS = /^v8motors-/; // this address is shared with other sites, so only ever clear our own caches
const cache = () => caches.open(VERSION);

addEventListener('install', () => self.skipWaiting());
addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((all) => Promise.all(all.filter((k) => ONLY_OURS.test(k) || k === 'v8-1').filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// pages are kept without their ?query part, so links with tracking bits do not pile up copies
const keep = async (req, res) => {
  if (res.ok && res.type === 'basic' && res.status === 200) { const u = new URL(req.url); u.search = ''; (await cache()).put(req.mode === 'navigate' ? u.href : req, res.clone()); }
  return res;
};

addEventListener('fetch', (e) => {
  const { request: req } = e;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || req.headers.has('range')) return; // video asks for byte ranges: leave those to the browser
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req, { cache: 'no-cache' }).then((res) => keep(req, res)).catch(async () => (await caches.match(req, { ignoreSearch: true })) || (url.pathname.includes('/cars/') ? null : await caches.match(new URL('./', location.href).href)) || Response.error()));
    return;
  }
  if (/\/(assets|models|images\/gate|images\/brand|media\/hero)\//.test(url.pathname) || /\.woff2$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => keep(req, res))));
    return;
  }
  if (/\/images\/cars\//.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => {
      const fresh = fetch(req).then((res) => keep(req, res)).catch(() => hit);
      if (hit) e.waitUntil(fresh);
      return hit || fresh;
    }));
  }
});
