/**
 * Which kind of graphics chip this is, sorted into three tiers by the name the browser gives it. The tier decides how the home
 * page's 3D car is drawn (src/lib/rover3d.js), whether it is drawn live at all (src/pages/home.js), and how sharp the glass
 * background starts (src/lib/glass.js).
 *
 *   high   a separate graphics card, Apple silicon, recent AMD and Intel Arc: everything at full quality, exactly as designed
 *   mid    integrated laptop graphics that can manage the live car with a lighter touch (Intel Iris and UHD, AMD's built-in Radeon)
 *   low    older or phone-class chips (Intel HD, UHD 6xx, Mali, Adreno, PowerVR) and machines short of cores or memory: they get the
 *          filmed car, which is rendered from the very same scene, instead of drawing it live
 *   none   no graphics chip at all (the browser draws in software)
 *
 * Plain ES5 on purpose and free of browser globals: vite.config.js pastes this exact function into the home page's very first
 * script (index.html), so the page knows before anything downloads whether to fetch the 3D car at all. Keep it that way.
 */
export function gpuTier(chip, cores, memory, apple) {
  var name = String(chip || '');
  if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(name)) return 'none';
  var short = (!apple && (cores || 8) <= 4) || (memory || 8) <= 3; // few cores or little memory: the rest of the page needs them too
  // older Intel built-in graphics (HD, UHD 600 to 699), phone and tablet chips, and old Radeons
  if (/intel[^,]*(\bhd graphics|uhd graphics 6\d\d|gma)|mali|adreno|powervr|videocore|vivante|tegra|radeon (r[2-7] |hd )/i.test(name)) return 'low';
  // AMD's graphics built into the processor ("Radeon(TM) Graphics", "Vega 8 Graphics"): before the next line, which would call them high
  if (/vega \d+ graphics|radeon(\(tm\))? graphics/i.test(name)) return short ? 'low' : 'mid';
  // a real graphics card: full quality, unless the machine around it is short of cores or memory
  if (/nvidia|geforce|quadro|intel[^,]*\barc\b|radeon|apple m\d|apple gpu/i.test(name)) return short || (memory || 8) <= 4 ? 'mid' : 'high';
  // the rest of Intel's built-in graphics (Iris, Iris Xe, UHD 700 and up) and iPad chips seen through a desktop browser
  if (/intel|iris|apple a\d/i.test(name)) return short ? 'low' : 'mid';
  if (short) return 'low';
  // no name to go by (some privacy settings hide it): judge by the machine alone
  if (!name) return (cores || 8) >= 8 && (memory || 8) > 4 ? 'high' : 'mid';
  return (memory || 8) <= 4 ? 'mid' : 'high';
}
