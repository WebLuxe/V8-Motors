/** Phones that can't be asked for much, judged by their memory and their processor. iPhones and iPads tell Safari they have
    very few cores whatever is really inside them, so for them the count means nothing and they are not held back by it. */
const apple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
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
  try { if (level > readSlow()) localStorage.setItem(SLOW_KEY, JSON.stringify({ level, at: Date.now() })); } catch { /* storage switched off */ }
}
