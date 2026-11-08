import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { resolve, relative, sep } from 'node:path';
import { readdirSync, existsSync } from 'node:fs';
import { headHTML, navHTML, footerHTML, mobileBarHTML, promisesHTML, hoursHTML, reachHTML, inventoryGridHTML, filterOptionsHTML, shapeSvg } from './src/lib/templates.js';
import { META } from './src/lib/meta.js';
import { CARS } from './src/data.js';
import { gpuTier, phoneCar } from './src/lib/gpu.js';

const root = import.meta.dirname;
const pages = readdirSync(root).filter((f) => f.endsWith('.html'));
const cars = existsSync(resolve(root, 'cars')) ? readdirSync(resolve(root, 'cars')).filter((f) => f.endsWith('.html')).map((f) => `cars/${f}`) : [];

/**
 * Fills <!--@...--> placeholders at dev and build time, so every page ships real HTML
 * (navigation, footer, car cards, meta tags) instead of an empty shell filled by JavaScript.
 */
function prerender() {
  return {
    name: 'v8-prerender',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const rel = relative(root, ctx.filename).split(sep).join('/');
        const P = rel.includes('/') ? '../' : '';
        const meta = META[rel];
        return html
          .replace('/*@gpuTier*/', () => `var gpuTier = ${gpuTier.toString()}, phoneCar = ${phoneCar.toString()};`) // one judge of graphics chips, for this script and the modules
          .replace('<!--@head-->', () => (meta ? headHTML({ ...meta, jsonld: meta.jsonld(), P }) : ''))
          .replace(/<!--@nav:(\w+)-->/, (_, k) => navHTML(k, P))
          .replace(/<!--@tabbar:(\w+)-->/, (_, k) => mobileBarHTML(k, P))
          .replace('<!--@footer-->', () => footerHTML(P))
          .replace('<!--@promises-->', () => promisesHTML(P))
          .replace('<!--@hours-->', () => hoursHTML())
          .replace('<!--@reach-->', () => reachHTML())
          .replace(/<!--@shape:(\w+)-->/g, (_, t) => shapeSvg(t))
          .replaceAll('<!--@from-->', () => Math.min(...CARS.map((c) => c.price)).toLocaleString('en-US'))
          .replace('<!--@grid-->', () => inventoryGridHTML(P))
          .replace('<!--@count-->', () => String(CARS.length))
          .replace('<!--@finder-->', () => JSON.stringify(CARS.map((c) => [c.make, c.model, c.year])))
          .replace(/<!--@opts:(\w+)-->/g, (_, k) => filterOptionsHTML(k))
          .replaceAll('<!--@total-->', () => String(CARS.length));
      },
    },
  };
}

/**
 * Vite drops `blocking="render"` from the entry script when it rewrites it for production.
 * Put it back: the page script must run before first paint so view transitions can be set up
 * (pagereveal) and script-built content (compare table, saved counts) never shifts the layout.
 */
function keepRenderBlocking() {
  return {
    name: 'v8-render-blocking',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (ctx.filename.endsWith('404.html') || ctx.filename.endsWith('car.html')) return html;
        return html.replace(/<script type="module" crossorigin src="([^"]+)">/g, '<script type="module" crossorigin src="$1" blocking="render">');
      },
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [prerender(), keepRenderBlocking(), tailwindcss()],
  build: {
    sourcemap: false,
    target: 'es2021',
    cssMinify: 'lightningcss',
    rollupOptions: {
      input: Object.fromEntries([...pages, ...cars].map((p) => [p.replace(/\.html$/, '').replace('/', '-'), resolve(root, p)])),
      // the animation libraries change far less often than the pages, so visitors keep them cached across updates
      output: { manualChunks: (id) => (/node_modules\/(gsap|lenis)\//.test(id) ? 'motion' : undefined) },
    },
  },
});
