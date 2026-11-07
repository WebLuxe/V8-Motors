/**
 * Liquid glass for the few things that float over photos: the menu bar once the page scrolls under it, and the small buttons
 * on top of car photos (the photo count, Save, the gallery arrows).
 *
 * The big glass panels are painted behind the page by src/lib/glass.js, so they can only bend the steel. These sit in front of
 * real photos, so here the browser itself does the bending: each one looks through an SVG filter that blurs what is behind it a
 * little and pulls it inwards near the rim, the way a thick, rounded edge of glass does. The filter needs a map of that rim made
 * for the exact size of the thing, so maps are drawn here, once per size, and shared.
 *
 * Only Chromium browsers (Chrome, Edge) can look through an SVG filter like this, and only a PC with a mouse is asked to.
 * Everyone else keeps the frosted look from src/glass.css, which needs nothing from here.
 */
import { modest, slowLevel } from './device.js';

const NS = 'http://www.w3.org/2000/svg';
// what each kind of glass looks like: corner radius (px, or 'pill' for half the height), how deep the rim is (px),
// how far the rim pulls what is behind it (px), and how much the middle is frosted (px of blur)
const KINDS = {
  bar: { sel: '.nav', r: 0, rim: 16, pull: 22, frost: 3 },
  chip: { sel: '.car-photos, .gal-arrow, .gal-expand, .gal-video, .car-tools .save', r: 'pill', rim: 10, pull: 14, frost: 2.5 },
};

let svg = null;
const made = new Map(); // one filter per kind and size
const sign = (v) => (v < 0 ? -1 : 1);

/** The rim map: red says how far to look left or right, green up or down, 128 is "straight through". */
function rimMap(w, h, r, rim) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
  const hw = w / 2, hh = h / 2;
  r = Math.min(r, hw, hh);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - hw, py = y + 0.5 - hh;
      const qx = Math.abs(px) - (hw - r), qy = Math.abs(py) - (hh - r);
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0), out = Math.hypot(ox, oy);
      const depth = r - out - Math.min(Math.max(qx, qy), 0); // how far inside the edge this point is
      let dx = 0, dy = 0;
      if (depth >= 0 && depth < rim) {
        // which way is out from here
        let nx, ny;
        if (qx > 0 && qy > 0 && out > 0) { nx = (ox / out) * sign(px); ny = (oy / out) * sign(py); } else if (qx > qy) { nx = sign(px); ny = 0; } else { nx = 0; ny = sign(py); }
        const t = 1 - depth / rim, m = t * t * (3 - 2 * t); // strongest right at the edge, fading smoothly to nothing
        dx = -nx * m; dy = -ny * m; // look inwards: the edge shows what is just inside it, stretched, like a lens
      }
      const i = (y * w + x) * 4;
      d[i] = 128 + dx * 127; d[i + 1] = 128 + dy * 127; d[i + 2] = 128; d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

function filterFor(kind, w, h) {
  // the bar is one of a kind and changes size with the window, so it keeps one filter and redraws it; the small ones share by size
  const k = KINDS[kind], key = kind === 'bar' ? kind : `${kind}${w}x${h}`;
  if (made.get(key)?.size === `${w}x${h}`) return made.get(key).url;
  const id = made.get(key)?.id || `lens-${made.size}`;
  const r = k.r === 'pill' ? h / 2 : k.r;
  const f = made.get(key)?.f || document.createElementNS(NS, 'filter');
  f.id = id;
  for (const [a, v] of Object.entries({ x: 0, y: 0, width: w, height: h, filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' })) f.setAttribute(a, v);
  f.innerHTML = `<feGaussianBlur in="SourceGraphic" stdDeviation="${k.frost}" edgeMode="duplicate" result="soft"/>
    <feImage href="${rimMap(w, h, r, k.rim)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="map"/>
    <feDisplacementMap in="soft" in2="map" scale="${k.pull * 2}" xChannelSelector="R" yChannelSelector="G"/>
    <feColorMatrix type="saturate" values="1.45"/>`;
  if (!f.isConnected) svg.append(f);
  const url = `url(#${id})`;
  made.set(key, { id, f, url, size: `${w}x${h}` });
  return url;
}

export function initLens() {
  const chromium = navigator.userAgentData?.brands?.some((b) => b.brand === 'Chromium');
  if (!chromium || modest || slowLevel >= 2 || !matchMedia('(hover: hover) and (pointer: fine)').matches) return; // a struggling machine (src/lib/device.js) keeps the plain look
  svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  document.body.append(svg);
  document.documentElement.classList.add('lens');

  // every one is fitted to its size, now and whenever that changes
  let later = 0;
  const fit = (el) => {
    const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
    if (w >= 2 && h >= 2) el.style.setProperty('--lens', filterFor(el.dataset.lens, w, h));
  };
  const sized = new ResizeObserver((all) => {
    for (const { target: el } of all) {
      // while a window is being dragged wider, the bar's map is drawn once it settles, not on every step
      if (el.dataset.lens === 'bar' && el.style.getPropertyValue('--lens')) { clearTimeout(later); later = setTimeout(() => fit(el), 160); } else fit(el);
    }
  });
  const watch = (root) => {
    for (const [kind, k] of Object.entries(KINDS)) {
      const els = [...(root.matches?.(k.sel) ? [root] : []), ...root.querySelectorAll(k.sel)];
      for (const el of els) if (!el.dataset.lens) { el.dataset.lens = kind; sized.observe(el); }
    }
  };
  watch(document.body);
  // cards come and go as the catalogue is filtered
  new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach((n) => n.nodeType === 1 && watch(n)))).observe(document.body, { childList: true, subtree: true });
}
