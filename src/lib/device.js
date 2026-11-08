/** Phones that can't be asked for much, judged by their memory and their processor. iPhones and iPads tell Safari they have
    very few cores whatever is really inside them, so for them the count means nothing and they are not held back by it. */
import { gpuTier, phoneCar } from './gpu.js';

const apple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const appleCores = apple || /Macintosh/.test(navigator.userAgent); // Safari on a Mac doesn't give its real core count either
export const modest = (!apple && (navigator.hardwareConcurrency || 8) <= 4) || (navigator.deviceMemory || 8) <= 3;

/* What this device has shown it can manage, once it has been seen struggling (a slow computer, a browser drawing without its
   graphics chip). 1: the glass is drawn coarser and the home page plays the filmed car instead of the live 3D one. 2: no glass at
   all, the plain look. Remembered for three days, so a struggling machine isn't put through the same stutter on every page and
   every visit, and forgotten after that, in case it was only a bad moment (a busy machine, a battery saver). */
const SLOW_KEY = 'v8:slow', SLOW_FOR = 3 * 24 * 3600 * 1000;
const readSlow = () => {
  try {
    const v = JSON.parse(localStorage.getItem(SLOW_KEY));
    return v && Date.now() - v.at < SLOW_FOR ? v.level : 0;
  } catch { return 0; }
};
export const slowLevel = readSlow();
export function markSlow(level) {
  if (forcedQuality) return; // a tier asked for by hand (below) is a test: nothing about it is remembered
  try { if (level > readSlow()) localStorage.setItem(SLOW_KEY, JSON.stringify({ level, at: Date.now() })); } catch { /* storage switched off */ }
}

/* ?quality=low, mid or high shows this device the site the way that kind of machine sees it, for the rest of the visit, and
   ?quality=auto goes back to judging it. It is how a fast computer can check what a modest laptop gets. index.html reads the same
   setting before anything downloads. */
const readForced = () => {
  try {
    const q = /[?&]quality=(low|mid|high|auto)\b/.exec(location.search)?.[1];
    if (q === 'auto') sessionStorage.removeItem('v8:quality');
    else if (q) sessionStorage.setItem('v8:quality', q);
    return sessionStorage.getItem('v8:quality');
  } catch { return null; }
};
export const forcedQuality = readForced();

/** What the graphics chip is and which tier it falls in (src/lib/gpu.js). The home page's first script has usually asked already
    (index.html), and asking twice would build a second graphics context for nothing, so its answer is used where there is one. */
export function gpuInfo() {
  if (window.__v8gpu) return window.__v8gpu;
  let chip = '', tier = 'none';
  try {
    const gl = document.createElement('canvas').getContext('webgl2', { failIfMajorPerformanceCaveat: true });
    if (gl) {
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      chip = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
      tier = forcedQuality || gpuTier(chip, navigator.hardwareConcurrency, navigator.deviceMemory, appleCores);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch { tier = 'none'; }
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const fits = forcedQuality ? forcedQuality !== 'low' : fine && slowLevel < 1;
  // a phone or tablet: the live car once its intro film has played, where its chip can draw it smoothly (see index.html)
  const phone3d = !fine && !forcedQuality && slowLevel < 1 && tier !== 'none' && phoneCar(chip, navigator.deviceMemory);
  return (window.__v8gpu = { chip, tier, forced: forcedQuality, live: fits && (tier === 'high' || tier === 'mid'), phone3d });
}
