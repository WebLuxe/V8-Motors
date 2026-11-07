/**
 * The page behind everything, and the liquid glass that stands on it, drawn in one go by the graphics card.
 *
 * There is one canvas, fixed behind the page, and one small program that paints every point of it: the brushed steel, the cars
 * racing past, and every glass panel. Because the glass is painted with the steel and the cars, not on top of them, it can really
 * bend them: through the rim of a panel you see the lines curve and a passing car stretch, and through the middle you see it
 * frosted. The panels themselves stay ordinary parts of the page. All this file needs from them is where they are, read fresh on
 * every frame right after the page has scrolled, so the glass never trails behind.
 *
 * Touch screens, modest machines and browsers without WebGL 2 never start it: html stays without the class "engine" and
 * src/glass.css gives them a plain readable panel on still steel. If the graphics card goes away it falls back to the same.
 */
import gsap from 'gsap';
import { modest } from './device.js';
import { SHAPES } from './shapes.js';

// The compare tray is not here, nor the note on the map: they float over photos and words, and this canvas is behind those
// The panels you read from (forms, the estimate, the leasing calculator, opening hours, the specs) are near-solid instead, so the
// words on them read perfectly, and where the browser makes the menu bar's glass itself (src/lib/lens.js) it is not drawn here
const PANELS = '.car, .finder, .inv-filters, .garage, .tool, .cmp-scroll, .compare .empty, .nav:not(.lens .nav)';
const MAX = 24; // the most panels drawn at once, more than a window ever shows
const TILE = 32; // the window is cut into squares this big (px), and each knows which panels touch it, so most of it asks about none
const PIXELS = 2.6e6, SHARPEST = 1.25; // never more than this many pixels, and never finer than this on a sharp screen
const IDLE = 30; // ms between frames when only the steel is drifting, about 30 a second
const RACERS = ['Coupe', 'Sedan']; // the low, long ones: the tall shapes looked silly flat out
// each shape comes in these paints, and every car that crosses picks one of the eight at random: body top to bottom, then windows
const PAINTS = [
  ['#ffffff', '#e4e7eb', '#a8aeb7', '#46525f'], // white
  ['#f0473a', '#c3141d', '#5e0a0f', '#5a6878'], // red
  ['#454c58', '#262a32', '#101216', '#7f92a8'], // black
  ['#4d7ec4', '#1f4a8c', '#0c1f45', '#7f92a8'], // blue
];
// seconds: until the first group, between groups, and to cross the window. top and low: how far down the window the cars stay,
// below every page's heading and above its footer. tilt: how steep a car's path is, in degrees
const RACE = { first: [2.5, 6], gap: [6, 14], crossing: 1.55, top: 0.3, low: 0.71, tilt: [1.5, 6] };
const html = document.documentElement;
const rand = (a, b) => a + Math.random() * (b - a);

const VERTEX = `#version 300 es
void main() { vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2. - 1., 0., 1.); }`;

const FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uView;           // the window, in page pixels
uniform float uScale;         // canvas pixels to one page pixel
uniform float uTime, uScroll;
uniform vec3 uLight;          // the soft light under the mouse: where, and how much
uniform vec3 uTilt;           // the mouse as a tilt of the whole sheet (-.5 to .5 each way), and how fast it is moving
uniform vec2 uSun;            // which way the light falls on the rims, a little different as the mouse moves
uniform vec4 uRect[${MAX}];   // panels: centre x, y, half width, half height
uniform vec4 uInfo[${MAX}];   // corner radius, width of the lens rim, roundness of that rim, how much of the panel is showing
uniform vec3 uCar[4];         // cars: x, y, width
uniform vec2 uWay[4];         // and which way each one points
uniform vec4 uCell[4];        // which picture on the sheet, and how sharp a copy of it to use
uniform int uCars;
uniform highp sampler2D uTiles;
uniform sampler2D uBrush, uSheet;
out vec4 frag;

// ---- the steel. Broad light and dark bands across polished metal, drifting very slowly. It is all smooth, so it can be asked for
// anywhere for the same small price, and the frosted version needs nothing extra
float bands(vec2 p) {
  vec2 v = vec2(p.x, p.y + uScroll) / uView.y + uTilt.xy * vec2(1.1, .75); // moving the mouse tilts the metal, so the bands slide
  // and the sheet dents a little round the pointer, more while it moves fast, like a thumb pressed into foil
  vec2 m = (p - uLight.xy) / uView.y;
  v -= m * uLight.z * (.32 + .8 * uTilt.z) * exp(-dot(m, m) * 7.);
  float a = v.x * .94 + v.y * .58;
  float w = sin(v.y * 1.7 - v.x * .6 + uTime * .043) * .34;
  float wide = sin(a * 3.4 + w * 2.2 + uTime * .051);
  float mid = sin(a * 8.3 - w * 3.1 - uTime * .083 + 1.7);
  float s = .5 + .33 * wide + .14 * mid; // stays inside 0 to 1, so the light never sits in flat shelves
  // a slow bright reflection wandering across it
  float g = a - 1.6 - 1.4 * sin(uTime * .037) + uTilt.x * 2.4 + uTilt.y * 1.1;
  return clamp(s + .2 * exp(-g * g * 14.), 0., 1.);
}
vec3 silver(vec2 p) {
  float s = bands(p);
  // one long roll from light to dark, with no flat stretches
  vec3 c = mix(vec3(.72, .745, .78), vec3(.94, .947, .958), smoothstep(-.1, 1.1, s));
  vec2 m = (p - uLight.xy) / 460.;
  c += uLight.z * (.13 + .08 * uTilt.z) * exp(-dot(m, m));
  vec2 e = p / uView - .5;
  return c * (1. - .08 * dot(e, e));
}
// the very fine lines. Sampled from a sheet of real noise, because rows of random streaks are what makes metal look brushed
float brushed(vec2 q, float blur) {
  vec2 uv = vec2(q.x / 2048., (q.y + uScroll * .35) / 512.);
  return textureLod(uBrush, uv, blur).r - .5 + (textureLod(uBrush, uv * vec2(.5, .45) + .37, blur).r - .5) * .25;
}

// ---- the cars. One picture per car, or a softer copy of it through the frosted part of a panel, and the streak they leave
vec4 cars(vec2 q, float frost) {
  vec4 sum = vec4(0.);
  for (int i = 0; i < uCars; i++) {
    vec3 a = uCar[i];
    // measured from the car itself: x along the way it is pointing, y towards its wheels. The picture and the streak are both
    // drawn from these, so the nose always points where it is going and the streak always runs straight out behind
    vec2 o = q - a.xy, w = uWay[i];
    vec2 d = vec2(dot(o, w), dot(o, vec2(-w.y, w.x)) * sign(w.x));
    float W = a.z, reach = W * (.14 + frost * .14);
    if (abs(d.y) > W * .46 + reach || d.x > W * .62 + reach || d.x < -W * 3.7) continue;
    float s = (-d.x - W * .3) / (W * 3.);
    if (s > -.06 && s < 1.) {
      float y = (d.y - W * .075) / (W * (.05 + frost * .07));
      float k = .46 * exp(-y * y) * pow(1. - clamp(s, 0., 1.), 1.6) * smoothstep(-.06, .03, s);
      vec3 c = mix(vec3(.16, .175, .2), vec3(1., .1, .0), .85 * pow(clamp(s * 5., 0., 1.), .9) * (1. - clamp((s - .2) * 3.2, 0., 1.)));
      sum += vec4(c * k, k) * (1. - sum.a);
    }
    vec2 uv = d / vec2(W, W * .5) + .5;
    if (min(uv.x, uv.y) > 0. && max(uv.x, uv.y) < 1.) {
      vec4 t = textureLod(uSheet, (uv + uCell[i].xy) * vec2(.25, .5), uCell[i].z + frost * 3.1);
      sum = t + sum * (1. - t.a);
    }
  }
  return sum;
}
// the cars laid over whatever steel is there. Glass takes the edge off them, so words on it stay readable
vec3 over(vec3 c, vec2 q, float frost) {
  if (uCars > 0) { vec4 k = cars(q, frost) * (1. - .42 * frost); c = c * (1. - k.a) + k.rgb; }
  return c;
}
vec3 scene(vec2 q, float frost) { return over(silver(q), q, frost); }
vec3 bare(vec2 p) { return scene(p, 0.) * (1. + brushed(p, 0.) * .04); }

// ---- the glass. Think of a clear slab with a narrow rounded edge: flat in the middle, curving away all round. Where it curves the
// light bends, so what you see there comes from further in, more and more towards the very edge, and the lines behind visibly bow.
// Through the flat middle the steel shows almost as it is, only a little softer and cooler. Colours bend by slightly different
// amounts on the curve, which is the faint fringe. The corners curve the most, so they stay the clearest
vec3 glass(vec2 p, int id, float d) {
  vec4 box = uRect[id], info = uInfo[id];
  float bezel = info.y, R = info.z;
  vec2 rel = p - box.xy;
  // distance in from the panel's own outline, so the curve runs smoothly past each corner without a crease
  vec2 k = abs(rel) - (box.zw - R), kp = max(k, 0.);
  float len = length(kp), edge = len + min(max(k.x, k.y), 0.) - R;
  vec2 n = sign(rel) * (len > .01 ? kp / len : (k.x > k.y ? vec2(1., 0.) : vec2(0., 1.)));
  float u = clamp(1. + edge / bezel, 0., 1.), u2 = u * u;
  float corner = smoothstep(0., .5, min(kp.x, kp.y) / max(R, 1.)); // 1 right in a corner, 0 along a straight side
  vec3 c;
  vec2 q = p;
  if (u > 0.) {
    // steep near the rim, like a real rounded edge: the outer part shows what lies further in, squeezed and turned over
    float push = bezel * 1.1 * u2 * sqrt(u);
    // the second half bows the page towards the middle of the panel, so lines running along a panel still curve at its ends
    q = p - n * push - rel / box.zw * bezel * .8 * u2;
    vec2 f = n * u * (.5 + push * .1);
    c = vec3(silver(q + f).r, silver(q).g, silver(q - f).b);
  } else c = silver(p);
  // the fine lines show through, a touch softer than on the bare steel, so the bending can be seen without them getting loud
  c *= 1. + brushed(q, .4 + u * 1.2) * .08;
  // only the steel bends. A car passing under the rim moves just a little and goes soft, so it stays whole instead of breaking up
  c = over(c, mix(p, q, .15), .35 + .4 * u);

  // a light frost and the faintest cool tint: enough for dark words to read, less on the rim and least of all in the corners
  c = mix(c, vec3(.935, .95, .972), .15 * (1. - .55 * u) * (1. - .5 * corner));
  c *= vec3(.986, .993, 1.006);

  // light gathered just inside the lit edge, fading round the curve
  float a = dot(n, uSun), lit = max(a, 0.), back = max(-a, 0.);
  c += vec3(.96, .98, 1.) * (.03 + .09 * lit * lit) * u2 * u2;
  // one crisp bright rim, about a pixel wide: brightest where the light falls at top left, fainter round the curve and opposite
  float inset = -d, e = (inset - .7) / .5;
  c = mix(c, vec3(1.), exp(-e * e) * clamp(.45 + .55 * lit * lit + .3 * back * back * back, 0., .97));
  return c;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uView.y * uScale - gl_FragCoord.y) / uScale;
  vec4 t = texelFetch(uTiles, ivec2(p) / ${TILE}, 0);
  int hit = -1;
  float sd = 9e3;
  for (int i = 0; i < 4; i++) {
    int id = int(t[i] * 255. + .5) - 1;
    if (id < 0) break;
    vec4 b = uRect[id];
    float r = uInfo[id].x;
    vec2 q = abs(p - b.xy) - b.zw + r;
    float d = length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r;
    if (d < .7) { hit = id; sd = d; } // later panels lie on top
  }
  vec3 c;
  if (hit < 0) c = bare(p);
  else {
    float a = smoothstep(.7, -.7, sd) * uInfo[hit].w;
    c = glass(p, hit, sd);
    if (a < .998) c = mix(bare(p), c, a);
  }
  // a whisper of noise, so the long soft gradients never show steps
  c += (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715)))) - .5) / 255.;
  frag = vec4(c, 1.);
}`;

/* ------------------------------------------------------------------ pictures, made once */

/** The sheet of cars: each drawing in every paint, leaning forward a touch, four across and two down. With its smaller copies this is also the blur. */
function carSheet() {
  const sheet = document.createElement('canvas');
  sheet.width = 2048; sheet.height = 512;
  const g = sheet.getContext('2d');
  RACERS.forEach((type, i) => PAINTS.forEach(([top, mid, low, glass], k) => {
    const c = SHAPES[type], n = i * PAINTS.length + k;
    g.save();
    g.translate((n % 4) * 512 + 16, (n >> 2) * 256 + 32);
    g.scale(2, 2);
    g.translate(120, 48); g.transform(1, 0, -0.12, 1, 0, 0); g.translate(-120, -48);
    const paint = g.createLinearGradient(0, 16, 0, 84);
    paint.addColorStop(0, top); paint.addColorStop(0.45, mid); paint.addColorStop(1, low);
    g.fillStyle = paint; g.fill(new Path2D(c.b));
    g.fillStyle = glass; g.fill(new Path2D(c.g));
    g.fillStyle = '#fff'; g.fill(new Path2D(c.h));
    g.fillStyle = '#ff1a00'; g.fill(new Path2D(c.t));
    for (const [x, y, tyre, hub] of c.w) {
      g.fillStyle = '#0d0f12'; g.beginPath(); g.arc(x, y, tyre, 0, 7); g.fill();
      g.fillStyle = '#7d8795'; g.beginPath(); g.arc(x, y, hub * 0.72, 0, 7); g.fill();
    }
    g.restore();
  }));
  return sheet;
}

/** The brushing: every row of pixels its own random streak, a little stronger here and weaker there, and tiled seamlessly. */
function brushSheet() {
  const S = 512, data = new Uint8Array(S * S), swell = new Float32Array(S);
  for (let x = 0; x < S; x++) swell[x] = 0.5 + 0.28 * Math.sin((x / S) * 6.283 * 2 + 1) + 0.22 * Math.sin((x / S) * 6.283 * 5 + 4);
  for (let y = 0; y < S; y++) {
    const level = Math.random() - 0.5, from = Math.floor(Math.random() * S), fine = 0.35 + Math.random() * 0.65;
    for (let x = 0; x < S; x++) data[y * S + x] = 128 + 180 * level * (1 - fine + fine * swell[(x + from) % S]) * 0.7;
  }
  return data;
}

/* ------------------------------------------------------------------ the engine */
let engineDone;
/** Resolves once the steel has been built and drawn once, or straight away when it won't run. The arrival curtain waits for it,
    because building it keeps the graphics card busy for a moment, and the curtain would stutter if it were opening then. */
export const engineReady = new Promise((r) => (engineDone = r));
export function initGlass() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (modest || !matchMedia('(hover: hover) and (pointer: fine)').matches) { engineDone(); return; }
  const canvas = document.createElement('canvas');
  canvas.className = 'steel';
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, failIfMajorPerformanceCaveat: true, powerPreference: 'high-performance' });
  if (!gl) { engineDone(); return; }
  document.body.prepend(canvas);

  let program = null, u = {}, tilesTex = null, parallel = null;
  let ready = false, stopped = false, quality = 1, force = true;
  let W = 0, H = 0, gw = 0, gh = 0, tiles = new Uint8Array(0);

  /* ---- start, and start again if the graphics card comes back */
  const shader = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const texture = (unit, wrap, min) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, min);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, min === gl.NEAREST ? gl.NEAREST : gl.LINEAR);
    return t;
  };
  const build = () => {
    parallel = gl.getExtension('KHR_parallel_shader_compile'); // on most cards the shader builds in the background while the page goes on
    program = gl.createProgram();
    const vs = shader(gl.VERTEX_SHADER, VERTEX), fs = shader(gl.FRAGMENT_SHADER, FRAGMENT);
    gl.attachShader(program, vs); gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.bindVertexArray(gl.createVertexArray());

    tilesTex = texture(0, gl.CLAMP_TO_EDGE, gl.NEAREST);
    texture(1, gl.REPEAT, gl.LINEAR_MIPMAP_LINEAR);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 512, 512, 0, gl.RED, gl.UNSIGNED_BYTE, brushSheet());
    gl.generateMipmap(gl.TEXTURE_2D);
    texture(2, gl.CLAMP_TO_EDGE, gl.LINEAR_MIPMAP_LINEAR);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, carSheet());
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.activeTexture(gl.TEXTURE0);
  };
  const finish = () => {
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn(gl.getProgramInfoLog(program));
      giveUp();
      return;
    }
    gl.useProgram(program);
    for (const k of ['uView', 'uScale', 'uTime', 'uScroll', 'uLight', 'uTilt', 'uSun', 'uRect', 'uInfo', 'uCar', 'uWay', 'uCell', 'uCars', 'uTiles', 'uBrush', 'uSheet']) u[k] = gl.getUniformLocation(program, k);
    gl.uniform1i(u.uTiles, 0); gl.uniform1i(u.uBrush, 1); gl.uniform1i(u.uSheet, 2);
    ready = true;
    size();
    scan();
    html.classList.add('engine');
    requestAnimationFrame(() => engineDone());
  };
  const giveUp = () => {
    ready = false;
    engineDone();
    html.classList.remove('engine');
    gsap.ticker.remove(tick);
    watch.disconnect(); added.disconnect(); fits.disconnect();
    canvas.remove();
    try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* already gone */ } // hand the graphics memory back
  };
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); ready = false; program = null; html.classList.remove('engine'); });
  canvas.addEventListener('webglcontextrestored', () => { build(); });

  /* ---- size. Sharp screens are drawn sharper, up to a limit, and the squares follow the window */
  const size = () => {
    W = canvas.clientWidth; H = canvas.clientHeight;
    if (!W || !H || !ready) return;
    const scale = Math.min(devicePixelRatio || 1, SHARPEST, Math.sqrt(PIXELS / (W * H))) * quality;
    canvas.width = Math.round(W * scale); canvas.height = Math.round(H * scale);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(u.uView, W, H);
    gl.uniform1f(u.uScale, canvas.width / W);
    gw = Math.ceil(W / TILE) + 1; gh = Math.ceil(H / TILE) + 1;
    tiles = new Uint8Array(gw * gh * 4);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tilesTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gw, gh, 0, gl.RGBA, gl.UNSIGNED_BYTE, tiles);
    count = -1;
    frame(true);
  };
  const fits = new ResizeObserver(size);
  fits.observe(canvas);

  /* ---- which panels are near the window, including any that turn up later */
  let every = [], near = new Set(), list = [];
  const rebuild = () => {
    list = every.filter((el) => near.has(el));
    const n = list.findIndex((el) => el.matches('.nav'));
    if (n >= 0) list.push(...list.splice(n, 1)); // the menu bar lies over everything else
  };
  const watch = new IntersectionObserver((seen) => {
    for (const e of seen) { if (e.isIntersecting) near.add(e.target); else near.delete(e.target); }
    rebuild();
  }, { rootMargin: '240px 0px' });
  const scan = () => {
    const now = [...document.querySelectorAll(PANELS)], fresh = new Set(now), known = new Set(every);
    for (const el of every) if (!fresh.has(el)) { watch.unobserve(el); near.delete(el); }
    for (const el of now) if (!known.has(el)) watch.observe(el);
    every = now;
    rebuild();
  };
  let again = false;
  const added = new MutationObserver((changes) => {
    for (const c of changes) if ([...c.addedNodes, ...c.removedNodes].some((n) => n.nodeType === 1)) { again = true; return; }
  });
  added.observe(document.body, { childList: true, subtree: true });

  /* ---- where they are, this very frame */
  const rects = new Float32Array(MAX * 4), infos = new Float32Array(MAX * 4), was = new Float32Array(MAX * 8);
  let count = -1;
  const home = document.body.classList.contains('page-home');
  const read = () => {
    let n = 0;
    for (const el of list) {
      if (n === MAX) break;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.bottom < 0 || r.top > H) continue;
      const style = getComputedStyle(el), bar = el.classList.contains('nav');
      if (style.visibility === 'hidden') continue;
      if (bar && home && !el.classList.contains('is-scrolled')) continue; // over the 3D car the menu bar is only its words
      const i = n * 4;
      if (bar) { // the bar runs off three sides of the window, so only its lower edge shows
        rects[i] = r.left + r.width / 2; rects[i + 1] = r.top + r.height / 2 - 60; rects[i + 2] = r.width / 2 + 90; rects[i + 3] = r.height / 2 + 60;
        infos[i] = 0; infos[i + 1] = 10; infos[i + 2] = 10; // a thin rim, so the bar is one clean tone infos[i + 3] = +style.opacity;
      } else {
        const hw = r.width / 2, hh = r.height / 2, small = Math.min(hw, hh);
        const radius = Math.min(parseFloat(style.borderTopLeftRadius) || 0, small);
        const bezel = Math.min(20, Math.max(8, small * 0.22)); // a narrow curve: the bending is all at the rim
        rects[i] = r.left + hw; rects[i + 1] = r.top + hh; rects[i + 2] = hw; rects[i + 3] = hh;
        infos[i] = radius; infos[i + 1] = bezel; infos[i + 2] = Math.min(small, Math.max(radius, bezel)); infos[i + 3] = +style.opacity;
      }
      n++;
    }
    let moved = n !== count;
    for (let i = 0, e = n * 4; i < e && !moved; i++) moved = rects[i] !== was[i] || infos[i] !== was[MAX * 4 + i];
    if (!moved) return false;
    was.set(rects); was.set(infos, MAX * 4);
    count = n;
    // tell each square which panels touch it, later panels last
    tiles.fill(0);
    for (let p = 0; p < n; p++) {
      const i = p * 4, x = rects[i], y = rects[i + 1], hw = rects[i + 2] + 2, hh = rects[i + 3] + 2;
      const x0 = Math.max(0, Math.floor((x - hw) / TILE)), x1 = Math.min(gw - 1, Math.floor((x + hw) / TILE));
      const y0 = Math.max(0, Math.floor((y - hh) / TILE)), y1 = Math.min(gh - 1, Math.floor((y + hh) / TILE));
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        const t = (ty * gw + tx) * 4;
        tiles[tiles[t] === 0 ? t : tiles[t + 1] === 0 ? t + 1 : tiles[t + 2] === 0 ? t + 2 : t + 3] = p + 1;
      }
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gw, gh, gl.RGBA, gl.UNSIGNED_BYTE, tiles);
    gl.uniform4fv(u.uRect, rects);
    gl.uniform4fv(u.uInfo, infos);
    return true;
  };

  /* ---- the soft light under the mouse */
  let mouseX = 0, mouseY = 0, lightX = 0, lightY = 0, glow = 0, seen = false, tiltX = 0, tiltY = 0, stir = 0;
  if (!reduced) {
    addEventListener('pointermove', (e) => {
      mouseX = e.clientX; mouseY = e.clientY;
      if (!seen) { seen = true; lightX = mouseX; lightY = mouseY; }
    }, { passive: true });
  }
  const moveLight = (dt) => {
    if (!seen) return false;
    const k = 1 - Math.exp(-dt * 8), dx = mouseX - lightX, dy = mouseY - lightY;
    lightX += dx * k; lightY += dy * k;
    glow += (1 - glow) * Math.min(1, dt * 3);
    // the tilt follows more lazily than the light, which is what makes it feel like a heavy sheet of metal
    const t = 1 - Math.exp(-dt * 2.4), ex = mouseX / W - 0.5 - tiltX, ey = mouseY / H - 0.5 - tiltY;
    tiltX += ex * t; tiltY += ey * t;
    const pace = dt > 0 ? Math.min(1, Math.hypot(dx, dy) / Math.max(dt, 0.001) / 2600) : 0;
    stir += (pace - stir) * Math.min(1, dt * (pace > stir ? 6 : 1.6));
    return Math.abs(dx) + Math.abs(dy) > 0.5 || glow < 0.99 || Math.abs(ex) + Math.abs(ey) > 0.002 || stir > 0.005;
  };

  /* ---- the cars. Nothing, nothing, then one to four of them flat out and gone. Each picks its own side and its own slope, and
     comes in anywhere along that edge, so no two groups look alike */
  const racing = [], carData = new Float32Array(12), wayData = new Float32Array(8), cellData = new Float32Array(16);
  let clock = (Date.now() / 1000) % 3600, nextRace = clock + rand(...RACE.first);
  // one straight run across the window, from just outside one edge to just past the other, staying between top and low the whole way
  const route = (w, speed, delay) => {
    const top = RACE.top * H, low = RACE.low * H, room = low - top, side = Math.random() < 0.5 ? 1 : -1;
    const slope = Math.tan((rand(...RACE.tilt) * Math.PI) / 180) * W * (Math.random() < 0.5 ? 1 : -1);
    const rise = Math.max(-room, Math.min(room, slope)), from = rand(top + Math.max(0, -rise), low - Math.max(0, rise));
    const len = Math.hypot(W, rise), wx = (side * W) / len, wy = rise / len;
    return { x: (side > 0 ? 0 : W) - wx * w, y: from - wy * w, wx, wy, run: 0, ends: len + w * 5, w, speed, delay, sprite: Math.floor(Math.random() * RACERS.length * PAINTS.length) };
  };
  // would these two ever be on top of each other? Their whole runs are played through, a fiftieth of a second at a time
  const meet = (a, b) => {
    const ran = (t, c) => Math.max(0, t - c.delay) * c.speed;
    for (let t = 0; t < 3.5; t += 0.02) {
      const ra = ran(t, a), rb = ran(t, b);
      if (Math.abs(a.x + a.wx * ra - b.x - b.wx * rb) < a.w * 1.1 && Math.abs(a.y + a.wy * ra - b.y - b.wy * rb) < a.w * 0.8) return true;
    }
    return false;
  };
  const launch = () => {
    const carW = Math.max(120, Math.min(196, W * 0.102)), speed = Math.max(W / RACE.crossing, 760), group = [];
    let delay = 0;
    for (let n = 1 + Math.floor(Math.random() * 4); n > 0; n--) {
      for (let tries = 0; tries < 200; tries++) { // with three already out there a free path can take some finding
        const car = route(carW, speed, delay);
        if (group.some((other) => meet(car, other))) continue;
        group.push(car);
        break;
      }
      delay += rand(0.08, 0.42); // a fraction of a second apart, never in a neat row
    }
    racing.push(...group);
    nextRace = clock + rand(...RACE.gap);
  };
  let onShow = 0;
  const moveCars = (dt) => {
    if (reduced) return false;
    if (clock >= nextRace && !document.body.classList.contains('page-legal')) launch(); // no cars behind plain reading text
    if (!racing.length && !onShow) return false;
    let n = 0;
    for (let i = racing.length - 1; i >= 0; i--) {
      const c = racing[i];
      if (c.delay > 0) { c.delay -= dt; continue; }
      c.run += c.speed * dt;
      if (c.run > c.ends) racing.splice(i, 1);
    }
    for (const c of racing) {
      if (c.delay > 0 || n === 4) continue;
      const i = n * 4;
      carData[n * 3] = c.x + c.wx * c.run; carData[n * 3 + 1] = c.y + c.wy * c.run; carData[n * 3 + 2] = c.w;
      wayData[n * 2] = c.wx; wayData[n * 2 + 1] = c.wy;
      cellData[i] = c.sprite % 4; cellData[i + 1] = c.sprite >> 2;
      cellData[i + 2] = Math.max(0, Math.log2(512 / (c.w * (canvas.width / W))));
      n++;
    }
    gl.uniform3fv(u.uCar, carData);
    gl.uniform2fv(u.uWay, wayData);
    gl.uniform4fv(u.uCell, cellData);
    gl.uniform1i(u.uCars, n);
    onShow = n;
    return racing.length > 0;
  };

  /* ---- one frame */
  let lastScroll = -1, lastTick = performance.now(), lastDraw = 0;
  const frame = (always) => {
    const now = performance.now(), dt = Math.min(0.05, (now - lastTick) / 1000);
    lastTick = now;
    if (!reduced) clock += dt;
    const y = scrollY, cars = moveCars(dt), light = moveLight(dt);
    let busy = read() || y !== lastScroll;
    lastScroll = y;
    busy = busy || cars || light;
    if (!(always || force || busy || (!reduced && now - lastDraw >= IDLE))) return;
    force = false;
    lastDraw = now;
    gl.uniform1f(u.uTime, clock);
    gl.uniform1f(u.uScroll, reduced ? 0 : y * 0.1);
    gl.uniform3f(u.uLight, lightX, lightY, glow);
    gl.uniform3f(u.uTilt, tiltX, tiltY, stir);
    const sx = -1 + (seen ? (lightX / W - 0.5) * 0.7 : 0), sy = -1 + (seen ? (lightY / H - 0.5) * 0.7 : 0), s = Math.hypot(sx, sy);
    gl.uniform2f(u.uSun, sx / s, sy / s);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  /* ---- can this machine keep up? Judged only while it can be seen. First draw a little coarser, and if that is not enough, stop */
  let frames = 0, from = lastTick, slow = 0, tickAt = lastTick;
  const judge = (now) => {
    const gap = now - tickAt;
    tickAt = now;
    if (gap > 400) { frames = 0; from = now; return; }
    frames++;
    if (now - from < 2000) return;
    slow = (frames * 1000) / (now - from) < 24 ? slow + 1 : 0; // a battery saver holds a healthy machine at 30, so that isn't slow
    frames = 0; from = now;
    if (slow < 2) return;
    slow = 0;
    if (quality < 0.6) { giveUp(); return; }
    quality *= 0.75;
    size();
  };

  /* ---- every tick of the clock the page scrolls by, after it has scrolled */
  const tick = () => {
    if (!ready) {
      if (program && !gl.isContextLost() && (!parallel || gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR))) finish();
      return;
    }
    if (again) { again = false; scan(); }
    // stopped altogether: a hidden tab, the film, the 3D car filling the window, or the curtain closing over the page
    if (document.hidden || html.classList.contains('play-intro') || html.classList.contains('hero-cover') || html.classList.contains('leaving')) { stopped = true; return; }
    if (stopped) { stopped = false; force = true; lastTick = performance.now(); from = tickAt = lastTick; frames = 0; }
    judge(performance.now());
    if (ready) frame(false);
  };
  build();
  gsap.ticker.add(tick);
}
