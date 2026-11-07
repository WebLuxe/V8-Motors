/**
 * The Range Rover, live in 3D (public/models/range-rover.glb), in a showroom built here in real geometry (buildShowroom).
 * This module is the only place three.js is used, and the home page loads it on its own, so no other page pays for it.
 *
 * It keeps no timeline of its own. The home page animates one plain object of numbers (`s`, see rover-shots.js) with
 * GSAP, on the engine recording's clock, and every frame this file draws whatever those numbers say. That is why the
 * picture can follow the audio exactly, and why scrolling can drive the same scene.
 *
 * Expensive effects are faked cheaply, because this has to run on a phone:
 *   reflection   the car is drawn a second time upside down, under a floor that is see-through where it is wet
 *   the hall     real boxes, lit by a shader, so it stays sharp and the walls move properly as the camera does. One
 *                equirectangular Blender render (public/models/hall.webp) is what the paint reflects and what shows through the far end
 *   headlights   the LEDs are real emissive parts of the model; the pools of light are painted by the floor's shader
 *                and the beams in the air are additive cones
 *
 * Two rules keep the picture steady in motion. Anything small and bright is real geometry, never part of the hall
 * image, so it gets proper edge smoothing. And the picture is tone-mapped BEFORE it is antialiased: it goes straight
 * to the canvas, and the glow is a separate, blurred pass added on top. (Bloom through a high-dynamic-range buffer
 * antialiases first, so a half-covered pixel of a very bright lamp still comes out white, and fine bright detail
 * crawls and sparkles as the camera moves.)
 */
import {
  AdditiveBlending, BackSide, Box3, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, CircleGeometry, Color, ConeGeometry, DirectionalLight,
  DoubleSide, Group, HalfFloatType, InstancedBufferAttribute, InstancedMesh, LinearFilter, LinearMipmapLinearFilter, Matrix4, Mesh, MeshBasicMaterial, MeshPhysicalMaterial,
  PerspectiveCamera, Plane, PlaneGeometry, PMREMGenerator, Points, PointsMaterial, Raycaster, RepeatWrapping, Scene, ShaderChunk, ShaderMaterial, SphereGeometry,
  Sprite, SpriteMaterial, SRGBColorSpace, TextureLoader, Vector2, Vector3, WebGLRenderer, WebGLRenderTarget, ACESFilmicToneMapping,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { modest } from './device.js';
import { HERO } from './rover-shots.js';
import { buildBay, buildEngine, ENGINE_SIZE, MARK_AT, MARK_SIZE } from './rover-engine.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const SIGN_SCALE = 0.6, SIGN_Y = 4.15, SIGN_LONG = (10.87 / 0.42) * SIGN_SCALE; // the sign across the far wall, and how long it comes out at
const END_Z = -72; // the far wall closes the hall here
// where each of the sign's eight letters starts and ends, along its length
const SIGN_LETTERS = [[0, 0.109], [0.123, 0.212], [0.289, 0.412], [0.428, 0.542], [0.552, 0.651], [0.661, 0.774], [0.791, 0.892], [0.903, 1]];
const WHEEL_R = 0.404; // metres, so the wheels roll at exactly the speed the car moves
// where the car pivots in a donut: its inside front wheel, as a real one does
const PIVOT = { x: -0.86, z: 1.5 };
const REAR = { x: 0.854, z: -1.495 };
const TAIL = { x: 0.74, y: 1.14, z: -2.46 };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const asset = (p) => new URL(p, document.baseURI).href;

/** Reads the Blender hall by direction. The lights come on in a wave from the far, open end towards the camera. */
const HALL = /* glsl */ `
  #define PI 3.14159265
  uniform sampler2D uTex;
  uniform float uHall, uSun;
  vec3 hall(vec3 d, float lod) {
    d = normalize(d);
    vec2 uv = vec2(atan(d.x, -d.z) / (2. * PI) + .5, asin(clamp(d.y, -1., 1.)) / PI + .5);
    vec3 c = textureLod(uTex, uv, lod).rgb;
    c = mix(vec3(dot(c, vec3(.3, .6, .1))) * vec3(.97, .985, 1.02), c, smoothstep(.1, .3, c.r - c.g)); // grey concrete, red still red
    // the open far end was rendered to pure white: give it its sunrise back, amber at the ridge, blue higher up
    float sun = smoothstep(.72, .96, min(min(c.r, c.g), c.b));
    c = mix(c, mix(vec3(2.2, 1.15, .5), vec3(.7, .85, 1.25), smoothstep(.0, .1, d.y)), sun * uSun);
    float wave = smoothstep(0., .3, uHall * 1.32 - (d.z * .5 + .5));
    return c * .42 * wave * (.25 + .75 * smoothstep(.9, 1., uHall + .08));
  }`;

function buildSky(tex, radius = 70) {
  const mat = new ShaderMaterial({
    side: BackSide, depthWrite: false, depthTest: false,
    uniforms: { uTex: { value: tex }, uHall: { value: 0 }, uSun: { value: 1 } },
    vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `varying vec3 vD; ${HALL}
      void main(){
        gl_FragColor = vec4(hall(vD, 0.), 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new Mesh(new SphereGeometry(radius, 32, 16), mat);
  m.renderOrder = -10;
  return m;
}

const BAY = 7, BAY_Z = 3; // a light bar every 7 metres
const WALL_X = 11, FACE_X = 10.7, HALL_H = 8, HALL_LONG = 100; // the wall, the front of the pilasters that carry the bars
const IN_ROOM = 10; // how far off the middle of the hall the camera may go

/**
 * The showroom: walls, pilasters, ceiling and its beams, all plain boxes in one draw call, and all lit by one shader that
 * works out the light from the same bars and strips drawn by buildHallLights. Nothing is painted in, so it is sharp at any size
 * and the room moves correctly with the camera. A second copy upside down, under the wet floor, is the reflection.
 */
function buildShowroom(surface) {
  const uniforms = { uHall: { value: 0 }, uSurface: { value: surface } };
  const mat = new ShaderMaterial({
    uniforms, side: DoubleSide,
    vertexShader: `
      varying vec3 vP, vN;
      void main(){
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.);
        vP = w.xyz; vN = normal;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      varying vec3 vP, vN;
      uniform float uHall;
      uniform sampler2D uSurface;
      float sat(float x){ return clamp(x, 0., 1.); }
      // a thin line every 1 along v, faded out before it can shimmer in the distance
      float line(float v, float w){
        float aa = fwidth(v) * 1.2, d = abs(fract(v + .5) - .5);
        return (1. - smoothstep(w, w + aa, d)) * sat(w * 2.5 / aa);
      }
      void main(){
        vec3 p = vec3(vP.x, abs(vP.y), vP.z), n = vN;
        vec3 eye = vec3(cameraPosition.x, vP.y < 0. ? -cameraPosition.y : cameraPosition.y, cameraPosition.z);
        vec3 V = normalize(eye - p);
        float dist = length(eye - p);
        float dz = (fract((p.z - ${BAY_Z}.) / ${BAY}. + .5) - .5) * ${BAY}.; // from the nearest light bar, along the wall
        float side = p.x < 0. ? -1. : 1.;
        vec3 warm = vec3(1., .965, .91);
        vec3 c;

        if (n.z > .5 && p.z < ${(END_Z + 0.1).toFixed(1)}) {
          // the far wall: dark, so the sign is the brightest thing on it
          float g = texture2D(uSurface, p.xy / 6.).b;
          float high = pow(sat(p.y / ${HALL_H}.), 2.);
          c = vec3(.075, .078, .086) * (.8 + .34 * g) * warm * (.34 + high * .75);
          float r = (p.y - .5) / .3;
          c += vec3(1., .03, .045) * exp(-r * r) * .05;
        } else if (n.y < -.5) {
          // the ceiling, with a soft pool around each strip of lights
          vec2 uv = p.xz;
          float g = texture2D(uSurface, uv / 6.).b;
          float dx = abs(mod(p.x + 3.1, 6.2) - 3.1);
          float strip = exp(-dx * dx / 1.4);
          c = vec3(.07, .073, .08) * (.8 + .4 * g) * (.05 + strip * .9);
        } else {
          bool front = abs(n.x) > .5, end = abs(n.z) > .5, beam = p.y > ${(HALL_H - 0.9).toFixed(1)};
          vec2 uv = front ? p.zy : p.xy;
          float g = texture2D(uSurface, uv / 5.).b, g2 = texture2D(uSurface, uv / 1.4).b;
          float pilaster = front && abs(p.x) < ${(FACE_X + 0.05).toFixed(2)} ? 1. : 0.;
          vec3 albedo = mix(vec3(.105, .108, .116), vec3(.05, .052, .058), pilaster) * (.8 + .28 * g + .12 * g2);
          // the bars wash the wall either side of them, and the ceiling lights it from above
          float tall = smoothstep(.1, 1.6, p.y) * smoothstep(7.2, 5.2, p.y);
          float wash = exp(-dz * dz / 2.6) * tall;
          float high = pow(sat(p.y / ${HALL_H}.), 3.);
          c = albedo * warm * (.08 + wash * 1.2 + high * .6 + exp(-p.y * 1.6) * .06);
          if (front) {
            // large panels
            float seam = line((p.z - ${BAY_Z}.) / 3.5 + .5, .007);
            c *= 1. - seam * (1. - pilaster) * .4;
            // a satin finish: each bar leaves a soft streak in the panels that moves as the camera does
            for (int i = -1; i <= 1; i++) {
              vec3 L = vec3(side * ${(FACE_X - 0.02).toFixed(2)}, clamp(p.y, 1., 6.2), p.z - dz + float(i) * ${BAY}.) - p;
              float d = length(L);
              vec3 H = normalize(L / d + V);
              c += warm * pow(sat(dot(n, H)), 70.) * .13 * tall / (1. + d * .12);
            }
          }
          if (end) c *= .55;
          if (beam && !front) c *= .35;
          // the red line along the wall
          float r = (p.y - .5) / .3;
          c += vec3(1., .03, .045) * (exp(-r * r) * (front ? .085 : .05) + exp(-p.y * 3.) * .012);
        }
        // the air: the far end fades into a soft haze
        c = mix(c, vec3(.02, .022, .026), 1. - exp(-dist * .012));
        float on = smoothstep(0., .1, uHall * 1.2 - (p.z + 78.) / 156.);
        c *= mix(.02, 1., on) * (.25 + .75 * smoothstep(.9, 1., uHall + .08));
        gl_FragColor = vec4(c, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const boxes = [
    [[WALL_X * 2 + 1, 0.4, HALL_LONG * 2], [0, HALL_H + 0.2, 0]], // the ceiling
  ];
  for (const s of [-1, 1]) boxes.push([[0.4, HALL_H, HALL_LONG * 2], [s * (WALL_X + 0.2), HALL_H / 2, 0]]);
  boxes.push([[WALL_X * 2 + 1, HALL_H, 0.4], [0, HALL_H / 2, END_Z - 0.2]]); // the far wall
  for (let z = BAY_Z - BAY * 14; z < HALL_LONG; z += BAY) for (const s of [-1, 1]) boxes.push([[WALL_X - FACE_X, HALL_H, 1.3], [s * (WALL_X + FACE_X) / 2, HALL_H / 2, z]]);
  for (let z = -HALL_LONG; z < HALL_LONG; z += BAY / 2) boxes.push([[WALL_X * 2, 0.84, 0.5], [0, HALL_H - 0.42, z]]);
  const geo = new BoxGeometry(1, 1, 1);
  const mesh = new InstancedMesh(geo, mat, boxes.length);
  const m = new Matrix4();
  boxes.forEach(([size, pos], i) => { m.makeScale(...size).setPosition(...pos); mesh.setMatrixAt(i, m); });
  mesh.frustumCulled = false;
  const mirror = new InstancedMesh(geo, mat, boxes.length);
  mirror.instanceMatrix = mesh.instanceMatrix;
  mirror.scale.y = -1;
  mirror.frustumCulled = false;
  mirror.renderOrder = -1;
  return { mesh, mirror, uniforms };
}

/**
 * The hall's lights: strips across the ceiling, blades on the columns and the red line along the walls, at exactly
 * the places they lit the Blender render. They come on in a wave from the far end, as the hall image does.
 */
function buildHallLights() {
  const uniforms = { uHall: { value: 0 }, uGain: { value: 1 } };
  const mat = new ShaderMaterial({
    uniforms,
    vertexShader: `
      attribute vec3 aCol;
      varying vec3 vC; varying float vZ;
      void main(){
        vC = aCol;
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.);
        vZ = w.z;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      varying vec3 vC; varying float vZ;
      uniform float uHall, uGain;
      void main(){
        float on = smoothstep(0., .1, uHall * 1.2 - (vZ + 78.) / 156.);
        gl_FragColor = vec4(mix(vC * .025, vC, on) * uGain, 1.);
      }`,
  });
  const items = [];
  const WARM = [1, 0.97, 0.92], RED = [1, 0.08, 0.1];
  for (let y = -87; y < 82; y += 7) {
    for (const x of [-6.2, 0, 6.2]) items.push([[0.34, 0.07, 5.6], [x, 7.08, -(y + 3.2)], WARM]);
    for (const s of [-1, 1]) items.push([[0.05, 5.2, 0.16], [s * (FACE_X - 0.03), 3.6, -y], WARM]);
  }
  for (const s of [-1, 1]) items.push([[0.05, 0.07, 200], [s * (FACE_X - 0.03), 0.5, 0], RED]);
  const geo = new BoxGeometry(1, 1, 1);
  const cols = new Float32Array(items.length * 3);
  const mesh = new InstancedMesh(geo, mat, items.length);
  const m = new Matrix4();
  items.forEach(([size, pos, col], i) => {
    m.makeScale(...size).setPosition(...pos);
    mesh.setMatrixAt(i, m);
    cols.set(col, i * 3);
  });
  geo.setAttribute('aCol', new InstancedBufferAttribute(cols, 3));
  mesh.frustumCulled = false;
  // a polished floor gives back about half of what falls on it
  const seen = mat.clone();
  seen.uniforms.uHall = uniforms.uHall;
  seen.uniforms.uGain = { value: 0.5 };
  const mirror = new InstancedMesh(geo, seen, items.length);
  mirror.instanceMatrix = mesh.instanceMatrix;
  mirror.scale.y = -1;
  mirror.frustumCulled = false;
  mirror.renderOrder = -1;
  return { mesh, mirror, uniforms };
}

/** The V8 MOTORS sign across the far wall: channel letters, lit faces and dark metal sides, with light spilling onto the wall
 *  and a copy upside down in the wet floor. The faces know how far along the sign they are, so light can run across the letters
 *  and one letter can catch alone. */
function buildSign(sign, glowMap) {
  const face = {
    uWave: { value: -1 }, uWaveAmp: { value: 0 }, // a band of light running along the sign
    uDropA: { value: 0 }, uDropB: { value: 0 }, uDrop: { value: 0 }, // one letter, dimmed
  };
  const wire = (m) => {
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, face);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vAlong;')
        .replace('#include <project_vertex>', `#include <project_vertex>
          vAlong = .5 + (modelMatrix * vec4(transformed, 1.)).x / ${SIGN_LONG.toFixed(3)};`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying float vAlong;
          uniform float uWave, uWaveAmp, uDropA, uDropB, uDrop;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float band = (vAlong - uWave) * 6.5;
          diffuseColor.rgb *= 1. + uWaveAmp * exp(-band * band);
          diffuseColor.rgb *= 1. - uDrop * step(uDropA, vAlong) * step(vAlong, uDropB);`);
    };
    return m;
  };
  const ivory = wire(new MeshBasicMaterial({ color: 0xfff4e4, toneMapped: false })); // lit faces: they give out light, so the film look doesn't grey them
  const red = wire(new MeshBasicMaterial({ color: 0xff1e28, toneMapped: false }));
  const side = new MeshPhysicalMaterial({ color: 0x17181a, metalness: 0.9, roughness: 0.4 });
  const spill = new MeshBasicMaterial({ map: glowMap, color: 0xffe2c4, blending: AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 });
  const group = new Group();
  const g = sign.clone(true);
  g.traverse((o) => { if (o.isMesh) { const n = o.material.name; o.material = /Red/.test(n) ? red : /Ivory/.test(n) ? ivory : side; } });
  g.scale.setScalar(SIGN_SCALE);
  g.position.set(0, SIGN_Y, END_Z + 0.22);
  const m = g.clone(true);
  m.position.y = -SIGN_Y;
  m.scale.y = -SIGN_SCALE;
  m.traverse((o) => { o.renderOrder = -1; });
  const wash = new Mesh(new PlaneGeometry(30, 11), spill);
  wash.position.set(0, SIGN_Y, END_Z + 0.1);
  wash.renderOrder = 1;
  group.add(g, wash, m);
  return { group, ivory, red, spill, face };
}

/** What the paint reflects: the hall itself, with softboxes over the car to draw long clean lines along the body. */
/** A moment for the page to answer a press or draw a frame between the heavy steps of building the scene. */
const breathe = () => new Promise((ok) => setTimeout(ok, 0));
/** Build the paints of a scene on the graphics card without holding up the page, where the browser can (most can). */
const compileAside = (renderer, scene, camera) => (renderer.compileAsync ? renderer.compileAsync(scene, camera).catch(() => renderer.compile(scene, camera)) : Promise.resolve(renderer.compile(scene, camera)));

/** Send a scene's pictures to the graphics card one at a time, with a breath between, instead of all in its first frame. */
async function uploadAside(renderer, root) {
  const seen = new Set();
  root.traverse((o) => [o.material].flat().forEach((m) => m && Object.values(m).forEach((v) => v?.isTexture && seen.add(v))));
  for (const t of seen) { renderer.initTexture(t); await breathe(); }
}

async function buildStudio(renderer, tex) {
  const room = new Scene();
  const sky = buildSky(tex);
  sky.material.uniforms.uHall.value = 1;
  sky.material.uniforms.uSun.value = 0; // the paint stays white from every side: no orange cast from the far end
  room.add(sky);
  const box = (w, h, [x, y, z], hex, power) => {
    const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: new Color(hex).multiplyScalar(power), side: DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 0.6, 0);
    room.add(m);
  };
  box(16, 2.6, [0, 9, 0.5], 0xf2f7ff, 5);
  box(16, 0.7, [-10, 3.2, 0], 0xdfeeff, 5.5);
  box(16, 0.7, [10, 3.2, 0], 0xdfeeff, 5.5);
  box(5, 1.2, [7, 4, 9], 0xffffff, 2.5);
  box(14, 2.4, [0, 4.5, -12], 0xffffff, 3.2);
  // the graphics card builds the room's paints alongside, so the page stays free to answer a press while it does
  await compileAside(renderer, room, new PerspectiveCamera());
  const pm = new PMREMGenerator(renderer);
  const out = pm.fromScene(room, 0.02).texture;
  pm.dispose();
  // the little room was only needed for that one picture, so its shapes and paints go straight back (the hall photo stays: it is shared)
  room.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return out;
}

/** Soft lamp glow, drawn once. */
function glowTexture(streak) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.08, 'rgba(255,255,255,.7)');
  r.addColorStop(0.24, 'rgba(255,255,255,.2)');
  r.addColorStop(0.55, 'rgba(255,255,255,.045)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  if (streak) { g.setTransform(1, 0, 0, 0.05, 0, 121.6); }
  g.fillRect(0, 0, 256, 256);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function buildFloor(tex, surface, lamp) {
  const mat = new ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      uTex: { value: tex }, uSurface: { value: surface }, uHall: { value: 0 }, uSun: { value: 0 }, uBeam: { value: 0 }, uHigh: { value: 0 }, uRed: { value: 0 },
      uRoad: { value: 0 }, uRoadGlow: { value: 0 }, uCarX: { value: 0 }, uCarZ: { value: 0 }, uYaw: { value: 0 }, uLampX: { value: lamp.x }, uRing: { value: 0 }, uSkid: { value: 0 }, uTurn: { value: 0 },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = (modelMatrix * vec4(position, 1.)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vP, 1.); }',
    fragmentShader: `
      varying vec3 vP;
      ${HALL}
      uniform sampler2D uSurface;
      uniform float uRing, uBeam, uHigh, uRed, uRoad, uRoadGlow, uCarX, uCarZ, uYaw, uLampX, uSkid, uTurn;
      float skid(vec2 q, float r, float a0, float n){ float e = fwidth(length(q)) + .02; float w = smoothstep(.15 + e, .15 - e, abs(length(q) - r)); float a = mod(atan(q.x, q.y) - a0, 6.2832); return w * step(a, uTurn) * (.72 + .28 * n); }
      float rbox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r; }
      void main(){
        float d = length(vP.xz);

        // the concrete: surface normal in R and G, how worn and dry it is in B
        vec3 s = texture2D(uSurface, vP.xz / 3.4).rgb;
        vec3 s2 = texture2D(uSurface, vP.xz / 13.).rgb;
        float dry = smoothstep(.66, .84, s.b * .5 + s2.b * .5);
        float near = smoothstep(26., 5., d);
        vec3 n = normalize(vec3((s.r - .5) * (.03 + dry * .22) * near, 1., (s.g - .5) * (.03 + dry * .22) * near));

        // polished wet concrete: it mirrors the hall, sharply where wet, blurred where dry
        vec3 V = normalize(cameraPosition - vP);
        vec3 R = reflect(-V, n);
        float fres = .05 + .95 * pow(1. - max(dot(n, V), 0.), 5.);
        vec3 refl = hall(R, 2.6 + dry * 3.);
        refl = mix(vec3(dot(refl, vec3(.3, .6, .1))), refl, .25); // the red line reflects sharply on its own; no stain
        float ambient = uHall * uHall;
        vec3 c = vec3(.006, .011, .016) * (.7 + dry) * ambient + refl * fres * mix(1., .4, dry);

        // floor position in the car's own space, so the light and the shadow turn with it
        vec2 p = vP.xz - vec2(uCarX, uCarZ);
        float cs = cos(uYaw), sn = sin(uYaw);
        p = vec2(cs * p.x - sn * p.y, sn * p.x + cs * p.y);

        // the pools thrown by the two headlamps, meeting further out
        float zf = p.y - 2.45;
        if (zf > 0.) {
          float w = .55 + zf * .22, fall = exp(-zf * (.32 - .18 * uHigh)) * smoothstep(0., 1.1, zf);
          float a = (p.x - uLampX) / w, b = (p.x + uLampX) / w;
          vec3 lit = vec3(.7, .85, 1.) * (exp(-a * a) + exp(-b * b)) * fall * (uBeam * .34 + uHigh * .8);
          c += lit * (.7 + .3 * s2.b);
        }
        // rubber left by a donut: two arcs traced by the rear tyres, laid down as the car comes round
        if (uSkid > .001) {
          vec2 q = vP.xz - vec2(${PIVOT.x.toFixed(3)}, ${PIVOT.z.toFixed(3)});
          float m = max(skid(q, ${Math.hypot(REAR.x - PIVOT.x, REAR.z - PIVOT.z).toFixed(4)}, ${Math.atan2(REAR.x - PIVOT.x, REAR.z - PIVOT.z).toFixed(4)}, s.b),
                        skid(q, ${Math.hypot(-REAR.x - PIVOT.x, REAR.z - PIVOT.z).toFixed(4)}, ${Math.atan2(-REAR.x - PIVOT.x, REAR.z - PIVOT.z).toFixed(4)}, s.b));
          c *= 1. - m * uSkid * .86;
        }
        // the turntable the car stands on, inlaid in the floor
        if (uRing > .001) {
          float rr = length(p), raa = fwidth(rr) * 1.2;
          float ring = smoothstep(.024 + raa, .024 - raa, abs(rr - 3.7)) + smoothstep(.012 + raa, .012 - raa, abs(rr - 3.86)) * .5;
          float halo = (rr - 3.7) / .4;
          c += vec3(1., .94, .84) * (ring * .85 + exp(-halo * halo) * .045) * uRing;
        }
        // and the tail lights behind
        float zr = -p.y - 2.5;
        if (zr > 0.) c += vec3(1., .015, .03) * exp(-(p.x * p.x) / 1.7) * exp(-zr * .8) * uRed * .55 * smoothstep(0., .5, zr);

        // road markings: only there while you are driving, and lit by the beams
        if (uRoadGlow > .001) {
          float aa = max(fwidth(vP.x), fwidth(vP.z) * .25) * 1.2;
          float dz = fwidth(vP.z) / 11. + .004, fz = fract((vP.z + uRoad) / 11.);
          float dash = smoothstep(0., dz, fz) * smoothstep(.6, .6 - dz, fz);
          float side = max(smoothstep(.05 + aa, .05 - aa, abs(abs(vP.x) - 2.05)) * dash, smoothstep(.035 + aa, .035 - aa, abs(abs(vP.x) - 3.3)));
          side *= min(1., .1 / (aa + .03));
          c += vec3(.85, .92, 1.) * side * uRoadGlow * smoothstep(40., 8., d) * .32;
        }

        // the car sits on the ground
        float sd = rbox(p, vec2(.92, 2.34), .4);
        float sh = 1. - smoothstep(-.42, .62, sd);
        c *= 1. - .95 * sh;

        // see-through where wet, for the car's reflection; solid under the car; melting into the hall far away
        float a = mix(.6, .9, dry);
        gl_FragColor = vec4(c, max(a, sh * .97));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new Mesh(new CircleGeometry(110, 64), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 0;
  return { mesh, uniforms: mat.uniforms };
}

function buildBeam() {
  const h = 15;
  const geo = new ConeGeometry(2.4, h, 28, 1, true);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, h / 2);
  const mat = new ShaderMaterial({
    transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending,
    uniforms: { uOn: { value: 0 } },
    vertexShader: `
      varying float vL; varying vec3 vN, vV;
      void main(){
        vL = position.z / ${h.toFixed(1)};
        vec4 m = modelViewMatrix * vec4(position, 1.);
        vN = normalize(normalMatrix * normal); vV = normalize(-m.xyz);
        gl_Position = projectionMatrix * m;
      }`,
    fragmentShader: `
      varying float vL; varying vec3 vN, vV; uniform float uOn;
      void main(){
        float f = pow(abs(dot(normalize(vN), normalize(vV))), 2.2);
        float a = pow(1. - vL, 2.1) * smoothstep(0., .04, vL) * f * uOn;
        gl_FragColor = vec4(vec3(.62, .8, 1.) * a, a);
        #include <colorspace_fragment>
      }`,
  });
  return { geo, mat };
}

/** Swaps Blender's export materials for ones tuned for this lighting, and keeps hold of those the scene animates. */
function dress(car) {
  const physical = (src, o) => {
    const m = new MeshPhysicalMaterial({ color: src.color, metalness: src.metalness, roughness: src.roughness, ...o });
    m.name = src.name;
    if (!m.transparent) m.side = DoubleSide;
    return m;
  };
  const made = new Map(), lamps = { drl: [], pod: [], red: [] };
  car.traverse((o) => {
    if (!o.isMesh) return;
    const raw = o.material.name.replace('web_', '');
    const name = raw === 'Seam' ? 'Paint' : raw; // the door shuts are simply body colour
    if (!made.has(name)) {
      const src = o.material;
      let m = src;
      if (!src.transparent) src.side = DoubleSide;
      if (name === 'Hull') m = new MeshBasicMaterial({ color: 0x030304, side: DoubleSide }); // the dark shell behind the panel gaps
      else if (name === 'Paint') m = physical(src, { color: 0xecebe6, metalness: 0, roughness: 0.36, clearcoat: 0.9, clearcoatRoughness: 0.1 });
      // the windows are privacy glass: opaque, black, and a mirror for the hall. The cabin behind them is gone
      else if (name === 'Glass') m = physical(src, { color: 0x010203, metalness: 0, roughness: 0.22, specularIntensity: 0.35 });
      else if (name === 'LampLens') m = physical(src, { color: 0xffffff, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.14, depthWrite: false });
      else if (name === 'Lettering') m = physical(src, { color: 0x08090a, metalness: 0.2, roughness: 0.3 });
      else if (name === 'Black') m = physical(src, { color: 0x0a0a0b, metalness: 0, roughness: 0.62 });
      else if (name === 'Badge Green') m = physical(src, { color: 0x0a7a44, metalness: 0.2, roughness: 0.2, clearcoat: 1, side: DoubleSide });
      else if (name === 'Chrome' || name === 'Badge Silver') m = physical(src, { color: 0xe6e8ea, metalness: 1, roughness: 0.26, side: DoubleSide });
      else if (name === 'Red Ribbon') m = physical(src, { color: 0xb60d17, metalness: 0, roughness: 0.42, sheen: 0.4, sheenColor: 0xff5a5a, sheenRoughness: 0.5 });
      else if (name === 'PlateText') m = physical(src, { color: 0x070708, metalness: 0, roughness: 0.4 });
      else if (name === 'Plate White') m = physical(src, { color: 0xe8e9ea, metalness: 0, roughness: 0.3, clearcoat: 0.6 });
      else if (name === 'Tyre') m = physical(src, { color: 0x101010, metalness: 0, roughness: 0.82, specularIntensity: 0.3 });
      else if (name === 'Rim') m = physical(src, { color: 0x8f949b, metalness: 1, roughness: 0.3 });
      else if (name === 'Calliper') m = physical(src, { color: 0xc00f1a, metalness: 0.15, roughness: 0.35, clearcoat: 0.6 });
      else if (name === 'DarkTrim') m = physical(src, { color: 0x0b0c0d, metalness: 0.55, roughness: 0.5, side: DoubleSide });
      else if (name === 'SatinTrim') m = physical(src, { color: 0x101112, metalness: 0.55, roughness: 0.5, side: DoubleSide });
      else if (name === 'Rotor') m = physical(src, { color: 0x9a9da1, metalness: 0.85, roughness: 0.42 });
      else if (name === 'DRL') { m = physical(src, { color: 0xffffff, emissive: 0xdcefff, emissiveIntensity: 0 }); lamps.drl.push(m); }
      else if (name === 'LampPod') { m = physical(src, { color: 0xcfd6dc, metalness: 0.9, roughness: 0.2, emissive: 0xe6f3ff, emissiveIntensity: 0 }); lamps.pod.push(m); }
      else if (/^Tail(Red|Dark)$|^Reflector$/.test(name)) { m = physical(src, { color: src.color, emissive: 0xff0008, emissiveIntensity: 0 }); lamps.red.push(m); }
      else if (name === 'TailGlass') m = physical(src, { color: 0x3a0004, transparent: true, opacity: 0.62, depthWrite: false, roughness: 0.08 });
      // many of the model's panels are wound backwards, so the browser would light them from the inside: always use the
      // normal the panel was modelled with
      if (name === 'Paint') {
        m.onBeforeCompile = (sh) => {
          sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0'));
        };
      }
      made.set(name, m);
    }
    o.material = made.get(name);
    if (o.material.transparent) o.renderOrder = 2;
  });
  return lamps;
}

/** Lets a lamp light up across its width instead of all at once, like a real car's welcome sequence. */
function sweepable(m, uniform) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSweep = uniform;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vSweepX;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSweepX = abs((modelMatrix * vec4(transformed, 1.)).x);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vSweepX; uniform float uSweep;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= 1. - smoothstep(uSweep - .07, uSweep, vSweepX);');
  };
}

/** The real middle of the headlamp: the average of the LED pods on one side of the car. */
function findLamp(car) {
  const v = new Vector3(), sum = new Vector3();
  let n = 0;
  car.updateMatrixWorld(true);
  car.traverse((o) => {
    if (!o.isMesh || o.material.name !== 'web_LampPod') return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i += 3) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      if (v.x > 0) { sum.add(v); n++; }
    }
  });
  return n ? sum.divideScalar(n) : new Vector3(0.7, 0.99, 2.16);
}

/**
 * @param canvas      the <canvas> to draw on
 * @param s           the numbers the page animates (start from DARK or HERO)
 * @param input       the element that takes drags and taps (null for none)
 * @param onProgress  0..1, the downloads
 * @param onTap       a tap on the car
 * @param onSign      a tap on the wall sign
 * @param onTooSlow   this device can't run it even at the lowest setting
 * @param withEngine  also load the V8 for the intro
 * @param tier        'high', 'mid' or 'low': how much this machine's graphics chip can be asked for (src/lib/gpu.js)
 * @param forced      the tier was asked for by hand (?quality=): draw even on a software chip, and remember nothing
 */
const BONNET_OPEN = 1.43; // radians. Nearly upright, so it stands clear behind the engine and frames it

/* How much each tier draws. high is the scene exactly as designed. mid is integrated laptop graphics: the same hall, lights, paint
   and reflections, with fewer pixels (the biggest cost by far), a single blur for the headlamp glow, a little less dust and smoke,
   and half-rate frames while nothing on screen is moving. low only happens when a machine is stepped down while running (see
   STEPS below) or is short of cores or memory: no glow pass, no reflected car, and 30 frames a second.
     dpr     the pixel ratio asked for (a hard ceiling on top of `pixels`)
     pixels  the most pixels drawn per frame, whatever the screen, so a 4K monitor costs what a 1080p one does
     glow    blur passes for the headlamp glow (pairs): 2 soft, 1 a little tighter, 0 none
     idle    ms between frames while nothing moves (0: every frame)
     cap     ms between frames always (0: every frame) */
const QUALITY = {
  high: { pixels: 4.2e6, glow: 2, mirror: true, dust: 110, puffs: 22, aniso: 8, idle: 0, cap: 0 },
  mid: { pixels: 2.4e6, glow: 1, mirror: true, dust: 70, puffs: 16, aniso: 4, idle: 30, cap: 0 },
  low: { pixels: 1.3e6, glow: 0, mirror: false, dust: 0, puffs: 0, aniso: 2, idle: 30, cap: 30 },
};
const STEP_KEY = 'v8:3d-steps', STEP_FOR = 3 * 24 * 3600 * 1000; // how far this machine was stepped down, remembered for three days

export async function createStage({ canvas, s, input, onProgress = () => {}, onTap = () => {}, onSign = () => {}, onTooSlow = () => {}, withEngine = false, tier = 'high', forced = false }) {
  const phone = matchMedia('(pointer: coarse)').matches;
  const CAP = import.meta.env.MODE === 'dbg' ? window.__capture : null; // only for rendering the phone film: see scripts/film.mjs
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: !!CAP?.clear, powerPreference: 'high-performance', stencil: false });
  // drawn by the processor rather than a graphics chip (remote desktop, a blocked driver): don't even try
  const info = renderer.getContext().getExtension('WEBGL_debug_renderer_info');
  const chip = info ? renderer.getContext().getParameter(info.UNMASKED_RENDERER_WEBGL) : '';
  if (import.meta.env.MODE !== 'dbg' && !forced && /swiftshader|llvmpipe|softpipe|software|basic render/i.test(chip)) { renderer.dispose(); throw new Error('no graphics chip'); }
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.setClearColor(0x000000, CAP?.clear ? 0 : 1);
  const level = CAP ? 'high' : forced ? tier : modest ? 'low' : QUALITY[tier] ? tier : 'high';
  const Q = QUALITY[level];
  // how sharp: on high, a little extra on an ordinary screen (1.5x), up to 2x on a sharp one; on mid, never past 1.25x, which on
  // a laptop's small sharp screen is still crisp; on low, the screen's own pixels. Never past Q.pixels in all, either
  const MAX_PIXELS = CAP ? 60e6 : Q.pixels;
  const ratio = devicePixelRatio || 1;
  let dpr = CAP ? CAP.dpr : level === 'low' ? 1 : level === 'mid' ? Math.min(ratio, 1.25) : phone ? Math.min(ratio, 2) : Math.min(Math.max(ratio, 1.5), 2);
  renderer.setPixelRatio(dpr);

  // ---- downloads
  // the models are unpacked off to the side, by helpers, so the page stays free to answer the start button meanwhile
  if (typeof Worker !== 'undefined') MeshoptDecoder.useWorkers?.(2);
  let doneModel = 0, doneTex = 0;
  const report = () => onProgress(doneModel * 0.78 + Math.min(1, doneTex) * 0.22);
  const load = (file, setup) => new Promise((ok, bad) => new TextureLoader().load(asset(file), (t) => { setup(t); doneTex += 0.5; report(); ok(t); }, undefined, bad));
  const hallLoad = load('models/hall.webp', (t) => {
    t.colorSpace = SRGBColorSpace;
    t.wrapS = RepeatWrapping;
    t.minFilter = LinearMipmapLinearFilter;
    t.magFilter = LinearFilter;
    t.generateMipmaps = true;
  });
  // the light the car is lit by only needs the hall photo, which is small: it is made while the car is still on its way,
  // so that heavy step is long done by the time anyone presses start
  const studio = hallLoad.then(async (t) => { renderer.initTexture(t); await breathe(); return buildStudio(renderer, t); });
  studio.catch(() => {});
  const [gltf, signGltf, hallTex, surfaceTex, engineGltf, bayGltf] = await Promise.all([
    new Promise((ok, bad) => {
      new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(asset('models/range-rover.glb'), ok,
        (e) => { if (e.total) { doneModel = e.loaded / e.total; report(); } }, bad);
    }),
    new Promise((ok, bad) => { new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(asset('models/sign.glb'), ok, undefined, bad); }),
    hallLoad,
    load('models/floor.webp', (t) => {
      t.wrapS = t.wrapT = RepeatWrapping;
      t.anisotropy = Q.aniso;
    }),
    withEngine ? new Promise((ok) => { new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(asset('models/engine.glb'), ok, undefined, () => ok(null)); }) : null,
    withEngine ? new Promise((ok) => { new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(asset('models/bay.glb'), ok, undefined, () => ok(null)); }) : null,
  ]);
  onProgress(1);
  MeshoptDecoder.useWorkers?.(0); // done with them

  const scene = new Scene();
  scene.environment = await studio;
  await breathe();
  const camera = new PerspectiveCamera(28, 1, 0.25, 220);

  const car = gltf.scene;
  const lamps = dress(car);
  const LAMP = findLamp(car);

  const sky = buildSky(hallTex, 190);
  sky.visible = false; // the hall is closed now: nothing shows past the far wall, so it isn't worth drawing a whole sphere under it
  const floor = buildFloor(hallTex, surfaceTex, LAMP);
  const hallLights = buildHallLights();
  const showroom = buildShowroom(surfaceTex);
  scene.add(sky, showroom.mesh, showroom.mirror, floor.mesh, hallLights.mesh, hallLights.mirror);
  const sweepHead = { value: 2 }, sweepTail = { value: 2 };
  [...lamps.drl, ...lamps.pod].forEach((m) => sweepable(m, sweepHead));
  lamps.red.forEach((m) => sweepable(m, sweepTail));

  const key = new DirectionalLight(0xe4f0ff, 0);
  key.position.set(5, 7, 6);
  const rim = new DirectionalLight(0xfff1e2, 0); // from the open end of the hall
  rim.position.set(-3, 2.2, -9);
  scene.add(key, rim);

  const signs = buildSign(signGltf.scene, glowTexture(false));
  scene.add(signs.group);

  const rig = new Group(); // moves and turns the whole car; the floor light follows it
  rig.add(car);
  scene.add(rig);

  // the reflection: same meshes, same materials, upside down
  const mirror = Q.mirror ? car.clone(true) : null;
  if (mirror) {
    mirror.scale.y = -1;
    mirror.traverse((o) => { if (o.isMesh) o.renderOrder = -1; });
    rig.add(mirror);
  }
  const bodies = [car.getObjectByName('Body'), mirror?.getObjectByName('Body')].filter(Boolean);
  const bonnets = [car.getObjectByName('Bonnet'), mirror?.getObjectByName('Bonnet')].filter(Boolean);
  let engine = engineGltf ? buildEngine(engineGltf.scene, 0, 1.5) : null;
  if (engine) rig.add(engine.group);
  const plainBay = car.getObjectByName('Bay'); // the dark pit that stays for the rest of the visit
  let bay = bayGltf ? buildBay(bayGltf.scene, car.getObjectByName('Body')) : null;
  if (bay && plainBay) plainBay.visible = false;
  const wheels = ['FL', 'FR', 'RL', 'RR'].map((k) => {
    const nodes = [car.getObjectByName(`Wheel_${k}`), mirror?.getObjectByName(`Wheel_${k}`)].filter(Boolean);
    nodes.forEach((n) => { n.rotation.order = 'YXZ'; });
    const calipers = [car.getObjectByName(`Caliper_${k}`), mirror?.getObjectByName(`Caliper_${k}`)].filter(Boolean);
    calipers.forEach((n) => { n.rotation.order = 'YXZ'; });
    return { nodes, calipers, front: k[0] === 'F' };
  });

  // ---- light you can see, all of it hung on the real lamps
  const beam = buildBeam();
  const beamMeshes = [-1, 1].map((side) => {
    const m = new Mesh(beam.geo, beam.mat);
    m.position.set(side * LAMP.x, LAMP.y, LAMP.z + 0.1);
    m.rotation.set(0.03, side * 0.04, 0);
    m.renderOrder = 3;
    rig.add(m);
    return m;
  });
  const glow = glowTexture(false), streak = glowTexture(true);
  const sprite = (map, hex, x, y, z, depthTest = true) => {
    const m = new SpriteMaterial({ map, color: hex, blending: AdditiveBlending, depthWrite: false, depthTest, transparent: true, opacity: 0, toneMapped: false });
    const sp = new Sprite(m);
    sp.position.set(x, y, z);
    sp.renderOrder = 4;
    rig.add(sp);
    return sp;
  };
  const front = LAMP.z + 0.2;
  const heads = [-1, 1].map((k) => ({ glow: sprite(glow, 0xdff0ff, k * LAMP.x, LAMP.y, front), streak: sprite(streak, 0xbcdcff, k * LAMP.x, LAMP.y, front) }));
  const tails = [sprite(glow, 0xff2a30, -TAIL.x, TAIL.y, TAIL.z), sprite(glow, 0xff2a30, TAIL.x, TAIL.y, TAIL.z)];
  const bayLight = sprite(glow, 0xffc48a, 0, 1.15, 1.55); // the engine bay, glowing as the bonnet lifts
  bayLight.scale.set(3.4, 2.2, 1);

  // dust hanging in the air, only visible where the light catches it
  const DUST = Q.dust;
  const dustPos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 7;
    dustPos[i * 3 + 1] = Math.random() * 2.6;
    dustPos[i * 3 + 2] = 2.6 + Math.random() * 11;
  }
  const dustGeo = new BufferGeometry();
  dustGeo.setAttribute('position', new BufferAttribute(dustPos, 3));
  const dustMat = new PointsMaterial({ map: glow, color: 0xcfe4ff, size: 0.1, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
  const dust = new Points(dustGeo, dustMat);
  rig.add(dust);

  // tyre smoke off the rear wheels as it launches
  const PUFFS = Q.puffs;
  const puffs = Array.from({ length: PUFFS }, (_, i) => {
    const m = new SpriteMaterial({ map: glow, color: 0xb7c7d4, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const sp = new Sprite(m);
    sp.renderOrder = 3;
    scene.add(sp);
    return { sp, side: i % 2 ? 1 : -1, seed: Math.random(), at: i / PUFFS, life: i / PUFFS, x: 0, z: 0, burning: false };
  });

  // ---- the glow: only the lights, on their own, with the car in black so it hides them where it should. Blurred small
  // and added over the finished picture, so it can't disturb the edges underneath
  let glowPasses = CAP?.clear ? 0 : Q.glow; // 0 when this tier goes without, or a machine is stepped down past it
  const black = new MeshBasicMaterial({ color: 0x000000 });
  const lit = new Set([...lamps.drl, ...lamps.pod, ...lamps.red]);
  const solid = [];
  car.traverse((o) => { if (o.isMesh) solid.push({ o, mat: o.material, glows: lit.has(o.material), see: o.material.transparent }); });
  const rtOpts = { type: HalfFloatType, depthBuffer: true };
  let glowA = null, glowB = null, glowC = null;
  const blur = new ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: { uT: { value: null }, uD: { value: new Vector3() } },
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: `
      varying vec2 vU; uniform sampler2D uT; uniform vec3 uD;
      void main(){
        vec2 d = uD.xy;
        vec3 c = texture2D(uT, vU).rgb * .227;
        c += (texture2D(uT, vU + d * 1.385).rgb + texture2D(uT, vU - d * 1.385).rgb) * .316;
        c += (texture2D(uT, vU + d * 3.231).rgb + texture2D(uT, vU - d * 3.231).rgb) * .07;
        gl_FragColor = vec4(c, 1.);
      }`,
  });
  const add = new ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, blending: AdditiveBlending,
    uniforms: { uT: { value: null }, uS: { value: 1 } },
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: `
      varying vec2 vU; uniform sampler2D uT; uniform float uS;
      void main(){
        vec3 c = texture2D(uT, vU).rgb * uS;
        gl_FragColor = vec4(1. - exp(-c), 1.);
      }`,
  });
  const quad = new FullScreenQuad(blur);
  let glowSize = '';
  const dropGlow = () => { [glowA, glowB, glowC].forEach((r) => r?.dispose()); glowA = glowB = glowC = null; glowSize = ''; };
  const sizeGlow = () => {
    if (!glowPasses) return;
    const w = Math.max(2, W >> 2), h = Math.max(2, H >> 2);
    // a window being dragged wider asks dozens of times a second: the glow's pictures are only remade when their size really changes
    if (glowSize === `${w}x${h}` && glowA) return;
    dropGlow();
    glowSize = `${w}x${h}`;
    glowA = new WebGLRenderTarget(w, h, rtOpts);
    glowB = new WebGLRenderTarget(w >> 1, h >> 1, { type: HalfFloatType, depthBuffer: false });
    glowC = new WebGLRenderTarget(w >> 1, h >> 1, { type: HalfFloatType, depthBuffer: false });
  };
  const blurPass = (from, to, dx, dy) => {
    renderer.setRenderTarget(to);
    blur.uniforms.uT.value = from.texture;
    blur.uniforms.uD.value.set(dx / to.width, dy / to.height, 0);
    quad.material = blur;
    quad.render(renderer);
  };
  const hide = [];
  // the scene as the glow pass sees it: the lights alone, everything else black
  let glowOthers = null, glowEnv = 1;
  function glowLook(on) {
    if (on) {
      for (const m of solid) {
        if (m.see) m.o.visible = false;
        else if (!m.glows) m.o.material = black;
      }
      glowOthers = [sky, showroom.mesh, showroom.mirror, floor.mesh, hallLights.mirror, signs.group, dust, ...beamMeshes, ...heads.flatMap((h) => [h.glow, h.streak]), ...tails, ...(mirror ? [mirror] : []), ...puffs.map((p) => p.sp)];
      hide.length = 0;
      for (const o of glowOthers) { hide.push(o.visible); o.visible = false; }
      glowEnv = scene.environmentIntensity;
      scene.environmentIntensity = 0;
      hallLights.uniforms.uGain.value = 3;
    } else {
      hallLights.uniforms.uGain.value = 1;
      scene.environmentIntensity = glowEnv;
      glowOthers.forEach((o, i) => { o.visible = hide[i]; });
      for (const m of solid) { m.o.visible = true; m.o.material = m.mat; }
    }
  }
  function drawGlow() {
    glowLook(true);
    renderer.setRenderTarget(glowA);
    renderer.clear();
    renderer.render(scene, camera);
    glowLook(false);
    // blur it small, twice, and add it on top. A lighter tier blurs once, a little wider, which is half the passes for nearly
    // the same soft glow
    if (glowPasses > 1) {
      blurPass(glowA, glowB, 1, 0);
      blurPass(glowB, glowC, 0, 1);
      blurPass(glowC, glowB, 2, 0);
      blurPass(glowB, glowC, 0, 2);
    } else {
      blurPass(glowA, glowB, 1.8, 0);
      blurPass(glowB, glowC, 0, 1.8);
    }
    renderer.setRenderTarget(null);
    renderer.autoClear = false;
    add.uniforms.uT.value = glowC.texture;
    add.uniforms.uS.value = 0.5;
    quad.material = add;
    quad.render(renderer);
    renderer.autoClear = true;
  }

  // ---- framing: where the car sits at each screen shape
  let W = 1, H = 1, base = { dist: 14, lens: 28, sx: 0, sy: 0 };
  const sharpen = () => renderer.setDrawingBufferSize(W, H, Math.min(dpr, Math.sqrt(MAX_PIXELS / (W * H))));
  const resize = () => {
    const box = canvas.parentElement.getBoundingClientRect();
    W = Math.max(1, Math.round(box.width));
    H = Math.max(1, Math.round(box.height));
    sharpen();
    sizeGlow();
    const aspect = W / H, portrait = aspect < 0.8;
    camera.aspect = aspect;
    const v = Math.tan((14 * Math.PI) / 180), h = v * aspect; // the hero is always shot at 28 degrees
    const short = H < 760 && aspect >= 1.3; // a short laptop or a landscape phone: the car steps back a little so the buttons clear it
    const needW = portrait ? 3.1 : 3.3, needH = portrait ? 3.4 : short ? 3 : 2.75;
    // a narrow screen wants the camera so far back that it would end up behind the hall's side wall, with the car out of sight.
    // So it stops inside the room and takes a wider lens for the same picture
    const wanted = Math.max(needW / h, needH / v), dist = Math.min(wanted, IN_ROOM / (Math.sin(HERO.az) * Math.cos(HERO.el)));
    base = {
      dist,
      lens: (Math.atan((v * wanted) / dist) * 360) / Math.PI,
      sx: 0, // the hero is only the car: it stands in the middle, a little above the buttons
      sy: portrait ? -0.08 : -0.03,
    };
    const seen = canvas.parentElement.parentElement.clientHeight || H;
    base.sy = (seen / 2 + base.sy * seen - H / 2) / H;
  };
  let ready = false;
  const life = new AbortController(), { signal } = life; // every listener below goes when this is aborted (dispose)
  const sizes = new ResizeObserver(() => { resize(); if (ready) draw(true); });
  sizes.observe(canvas.parentElement);
  resize();

  /* ---- stepping down. A machine that can't keep up gives up what costs the most for the least you'd notice, one step at a time:
     sharpness down to the screen's own pixels first (a stutter as mild as 40 frames a second is reason enough for that), then the
     headlamp glow, which draws the whole scene a second time, then the car's reflection, which draws the car twice, and last of
     all pixels coarser than the screen. How far it went is remembered for three days, so the next visit starts there instead of
     stuttering through the same steps again. If even the bottom step crawls, the filmed car takes over (giveUp, below). */
  const lowest = phone ? 1 : 0.7;
  const sharpness = () => renderer.getPixelRatio(); // what is really drawn, after the pixel limit
  const STEPS = [
    () => sharpness() > 1.01 && ((dpr = Math.max(1, sharpness() * 0.8)), sharpen(), true),
    () => glowPasses > 0 && ((glowPasses = 0), dropGlow(), true),
    () => !!mirror?.visible && ((mirror.visible = false), true),
    () => sharpness() > lowest + 0.01 && ((dpr = lowest), sharpen(), true),
  ];
  const remember = !forced && !CAP;
  let stepped = 0;
  const stepDown = (save = true) => {
    if (!STEPS.some((step) => step())) return false;
    stepped++;
    if (save && remember) try { localStorage.setItem(STEP_KEY, JSON.stringify({ n: stepped, at: Date.now() })); } catch { /* storage switched off */ }
    return true;
  };
  try {
    const was = remember && JSON.parse(localStorage.getItem(STEP_KEY));
    for (let n = was && Date.now() - was.at < STEP_FOR ? was.n : 0; n > 0 && stepDown(false); n--);
  } catch { /* storage switched off */ }

  // ---- is the pointer on the wall sign? The wall is flat, so the ray only has to reach it, and the car in front wins
  let hoverSign = false;
  const ndc = new Vector2(), ray = new Raycaster(), onWall = new Vector3(), wall = new Plane(new Vector3(0, 0, 1), -END_Z), carBox = new Box3();
  const overSign = (x, y) => {
    const box = canvas.getBoundingClientRect();
    ray.setFromCamera(ndc.set(((x - box.left) / box.width) * 2 - 1, -((y - box.top) / box.height) * 2 + 1), camera);
    if (!ray.ray.intersectPlane(wall, onWall)) return false;
    const seen = Math.abs(onWall.x) < SIGN_LONG / 2 + 0.3 && Math.abs(onWall.y - SIGN_Y) < 2;
    return seen && !ray.ray.intersectsBox(carBox.setFromObject(car));
  };

  // ---- drag to turn the car, and the front wheels look at your pointer
  let spin = 0, spinV = 0, steer = 0, steerTo = 0, lookX = 0, lookY = 0, lookXTo = 0, lookYTo = 0, dragging = false, turned = false;
  if (input) {
    const ignore = (t) => t.closest?.('a, button, input, select, label, .gate');
    let x0 = 0, xs = 0, moved = 0, id = null, last = 0;
    input.addEventListener('dragstart', (e) => e.preventDefault(), { signal });
    input.addEventListener('pointerdown', (e) => {
      if (ignore(e.target) || e.button || scrollY > 40 || document.documentElement.classList.contains('play-intro')) return;
      if (e.pointerType === 'mouse') e.preventDefault(); // no text selection, so nothing for the browser to start dragging
      dragging = true; id = e.pointerId; x0 = xs = e.clientX; moved = 0; spinV = 0; last = performance.now();
    }, { signal });
    addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') {
        lookXTo = (e.clientX / innerWidth - 0.5) * 2; lookYTo = (e.clientY / innerHeight - 0.5) * 2; steerTo = -lookXTo * 0.5;
        const was = hoverSign;
        hoverSign = ready && !dragging && scrollY < 40 && !e.target.closest?.('a, button, input, select, label, .gate') && !document.documentElement.classList.contains('play-intro') && overSign(e.clientX, e.clientY);
        if (was !== hoverSign) input.style.cursor = hoverSign ? 'pointer' : '';
      }
      if (!dragging || e.pointerId !== id) return;
      const dx = e.clientX - x0, now = performance.now();
      moved += Math.abs(dx);
      x0 = e.clientX;
      const a = (dx / Math.min(innerWidth, 900)) * Math.PI * 1.5;
      spin += a;
      spinV = a / Math.max(4, now - last) * 16;
      last = now;
      if (Math.abs(e.clientX - xs) > 8) turned = true;
    }, { passive: true, signal });
    const end = (e) => {
      if (!dragging || e.pointerId !== id) return;
      dragging = false;
      if (moved < 8 && e.type === 'pointerup') { if (overSign(e.clientX, e.clientY)) onSign(); else onTap(); }
    };
    addEventListener('pointerup', end, { signal });
    addEventListener('pointercancel', end, { signal });
  }

  // ---- only draw while it can be seen
  let onScreen = true;
  const seenBy = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; }, { threshold: 0.01 });
  seenBy.observe(canvas.parentElement);

  let hoverGlow = 0, nextCatch = 6, catchAt = -9, clock = 0;
  const t0 = performance.now();
  const forward = new Vector3(), toCam = new Vector3(), lampPos = new Vector3();
  let contextLost = false, tooSlow = false, disposed = false, lostTimer = 0, lastT = t0, lastDraw = 0, lastDist = s.carZ + s.road, wheelV = 0, wheelA = 0, burnA = 0;

  /* ---- can this machine keep up? Every tick of the page's clock counts, drawn or not, so a lighter tier resting at half rate
     (below) is never mistaken for a slow one. Judged on two seconds at a time and only twice running, so a stall while something
     loads is never mistaken for a slow machine. A gap over 1.5 seconds is a hidden tab. A battery saver holds a healthy machine
     at 30 frames a second, which is why only below 27 counts as truly slow */
  let lastTick = t0, spanAt = 0, spanFrames = 0, spanBroken = false, lowSpans = 0, softSpans = 0;
  const judge = (now) => {
    const gap = now - lastTick;
    lastTick = now;
    if (!spanAt) { spanAt = now; spanFrames = 0; spanBroken = false; }
    spanFrames++;
    if (gap > 1500) spanBroken = true;
    if (now - spanAt <= 2000) return;
    const fps = (spanFrames * 1000) / (now - spanAt), broken = spanBroken;
    spanAt = now; spanFrames = 0; spanBroken = false;
    if (broken) { lowSpans = softSpans = 0; return; }
    lowSpans = fps < 27 ? lowSpans + 1 : 0;
    softSpans = fps < 40 ? softSpans + 1 : 0;
    if (lowSpans >= 2 && fps < 10) { // crawling: every step at once, and if there is nothing left to give, the filmed car
      lowSpans = softSpans = 0;
      let gave = false;
      while (stepDown()) gave = true;
      if (!gave) giveUp();
    } else if (lowSpans >= 2) { lowSpans = softSpans = 0; stepDown(); }
    // a mild stutter only costs sharpness, and only for this visit: a laptop in a power-saving mode runs at 30 and is fine tomorrow
    else if (softSpans >= 2) { softSpans = 0; if (sharpness() > 1.01) stepDown(false); }
  };
  /** Even the lowest setting crawls: hand over to the filmed car so the site stays usable, and give the graphics memory back
      once the picture has faded away (.hero-canvas in src/site.css), for the film to use. */
  const giveUp = () => {
    tooSlow = true;
    canvas.classList.remove('is-live');
    onTooSlow();
    setTimeout(dispose, 900);
  };

  /* ---- is anything moving? The page's numbers (a trick, the intro, scrolling), a drag, the car still coasting round, the
     pointer's lean or the sign's hover glow still settling, wheels still turning, a letter of the sign catching, smoke in the air.
     When nothing is, a lighter tier draws every other frame: the dust and the sign drift so slowly that nobody can tell, and
     the graphics chip gets to rest. The high tier always draws every frame */
  const before = {};
  let lastScroll = scrollY;
  const still = () => {
    let same = !dragging && !spinV && (scrollY <= 6 || Math.abs(spin) < 1e-3) && scrollY === lastScroll
      && Math.abs(steerTo - steer) < 1e-3 && Math.abs(lookXTo - lookX) < 1e-3 && Math.abs(lookYTo - lookY) < 1e-3
      && Math.abs((hoverSign ? 1 : 0) - hoverGlow) < 0.01 && Math.abs(wheelV) < 0.01 && clock - catchAt > 0.45 && !puffs.some((p) => p.burning);
    lastScroll = scrollY;
    for (const k in s) if (s[k] !== before[k]) { before[k] = s[k]; same = false; }
    return same;
  };

  function draw(force) {
    const now = performance.now();
    if (CAP && !CAP.go) return;
    // not drawing (out of sight, a hidden tab, the film on top): the clock waits, and so does the judging of speed
    if (disposed || contextLost || tooSlow || (!force && (!onScreen || document.hidden || s.off))) { lastT = lastTick = now; spanAt = 0; return; }
    if (!force && !CAP) judge(now);
    if (tooSlow) return;
    if (!force && Q.cap && now - lastDraw < Q.cap) return; // the lowest tier: 30 frames a second at most
    if (!force && Q.idle && now - lastDraw < Q.idle && still()) return; // a lighter tier, while nothing moves
    lastDraw = now;
    const dt = CAP ? CAP.dt : Math.min(0.05, (now - lastT) / 1000);
    clock += dt; // only runs while frames are drawn, so nothing leaps forward after a hidden tab
    const t = clock;
    lastT = now;

    const f = s.frame;
    // ---- the driver
    if (!dragging) {
      spin += spinV;
      spinV *= 0.94;
      if (Math.abs(spinV) < 0.0002) spinV = 0;
      if (Math.abs(spin) > Math.PI) spin -= Math.PI * 2 * Math.round(spin / (Math.PI * 2));
      if (scrollY > 6) { spinV = 0; spin *= Math.pow(0.002, dt); }
    }
    const k = 1 - Math.pow(0.002, dt);
    steer += (steerTo - steer) * k;
    lookX += (lookXTo - lookX) * k;
    lookY += (lookYTo - lookY) * k;

    // a donut turns the car about its inside front wheel, not about its middle
    const turn = s.spin || 0, ct = Math.cos(turn), st = Math.sin(turn);
    const yaw = spin + turn;
    rig.rotation.y = yaw;
    rig.position.set(PIVOT.x - (PIVOT.x * ct + PIVOT.z * st), s.air || 0, s.carZ + PIVOT.z - (-PIVOT.x * st + PIVOT.z * ct));
    if (mirror) mirror.position.y = -2 * (s.air || 0); // its reflection drops as the car leaves the ground

    // ---- the engine: the body rocks on its springs while the wheels stay on the ground
    const e = s.rev;
    const roll = e * 0.014 + s.jolt * 0.016 + Math.sin(t * 9) * e * 0.0026 + (s.lean || 0) * 0.07;
    const pitch = -e * 0.007 - s.jolt * 0.01 + s.dive * 0.04 + Math.sin(t * 7.3) * e * 0.0018 + (s.nod || 0) * 0.08;
    const bob = e * 0.01 + Math.sin(t * 11) * e * 0.0012 - Math.abs(s.dive) * 0.012 + (s.hop || 0);
    for (const b of bodies) { b.rotation.z = roll; b.rotation.x = pitch; b.position.y = bob; }
    for (const b of bonnets) b.rotation.x = -(s.bonnet || 0) * BONNET_OPEN;
    bayLight.material.opacity = (s.bayGlow || 0) * 0.12;
    bay?.update(s.bonnet || 0, 0.25 + (s.bayGlow || 0) * 0.75);
    engine?.update(s, t);

    // ---- wheels: they follow the car's speed, but never spin fast enough to strobe. Past about 13 radians a second a
    // spoked wheel on a 60 Hz screen stops reading as turning and starts to flicker
    const moved = s.carZ + s.road - lastDist;
    lastDist = s.carZ + s.road;
    const want = dt > 0 ? clamp(moved / dt / WHEEL_R, -13, 13) : 0;
    wheelV += (want - wheelV) * (1 - Math.pow(0.0005, dt));
    wheelA += wheelV * dt;
    burnA += (s.burn || 0) * 13 * dt; // the driven wheels spin up against the floor
    const aim = steer * f + (s.lock || 0);
    for (const w of wheels) {
      for (const n of w.nodes) { n.rotation.x = w.front ? wheelA : wheelA + burnA; if (w.front) n.rotation.y = aim; }
      if (w.front) for (const n of w.calipers) n.rotation.y = aim; // the brakes steer with the wheel but never spin
    }

    // ---- lights
    scene.environmentIntensity = s.env;
    key.intensity = s.key * 0.85;
    rim.intensity = s.key * 0.22;
    sweepHead.value = s.sweep;
    sweepTail.value = s.sweepR;
    for (const m of lamps.drl) m.emissiveIntensity = s.drl * 7 + s.high * 8;
    for (const m of lamps.pod) m.emissiveIntensity = s.pod * 3.5 + s.high * 11;
    for (const m of lamps.red) m.emissiveIntensity = s.red * 3.2;
    sky.material.uniforms.uHall.value = s.hall;
    hallLights.uniforms.uHall.value = s.hall;
    showroom.uniforms.uHall.value = s.hall;
    // ---- the sign. It strikes up as the hall comes on, a letter catches now and then, it answers the engine and your
    // pointer, and the car's tricks can take it over through the numbers in s
    const hall = smooth(0.5, 0.8, s.hall);
    const striking = hall > 0.02 && hall < 0.995 ? (Math.sin(t * 61) * Math.sin(t * 37) > 0.25 ? 0.25 : 1) : 1;
    const on = Math.max(hall * striking, s.sign || 0);
    hoverGlow += ((hoverSign ? 1 : 0) - hoverGlow) * (1 - Math.pow(0.0004, dt));
    const lift = 1 + e * 0.6 + hoverGlow * 0.55 + (s.signFlash || 0) * 1.4;
    if (t > nextCatch && hall > 0.99) { // a letter catches, like a real sign does: two quick dips, then steady
      nextCatch = t + 7 + Math.random() * 8;
      catchAt = t;
      [signs.face.uDropA.value, signs.face.uDropB.value] = SIGN_LETTERS[Math.floor(Math.random() * SIGN_LETTERS.length)];
    }
    const c = t - catchAt;
    signs.face.uDrop.value = (c < 0.07 || (c > 0.14 && c < 0.2) || (c > 0.34 && c < 0.38)) && hall > 0.99 ? 0.82 : 0;
    signs.face.uWave.value = s.wave ?? -1;
    signs.face.uWaveAmp.value = s.waveAmp || 0;
    const white = on * lift * Math.max(0, 1 + (s.signWhite || 0)), redLit = on * lift * Math.max(0, 1 + (s.signRed || 0));
    signs.ivory.color.setRGB(0.012 + white * 0.9, 0.011 + white * 0.82, 0.01 + white * 0.7);
    signs.red.color.setRGB(0.012 + redLit * 0.95, 0.004 + redLit * 0.03, 0.004 + redLit * 0.05);
    signs.spill.opacity = Math.min(0.8, on * (0.18 + (lift - 1) * 0.5 + (s.waveAmp || 0) * 0.08)); // the wall around it lights up when it reacts
    const u = floor.uniforms;
    u.uHall.value = s.hall; u.uBeam.value = s.beam; u.uHigh.value = s.high; u.uRed.value = s.red;
    u.uRing.value = (1 - s.roadGlow) * smooth(0.75, 1, s.hall);
    u.uRoad.value = s.road; u.uRoadGlow.value = s.roadGlow; u.uCarX.value = rig.position.x; u.uCarZ.value = rig.position.z; u.uYaw.value = yaw;
    u.uSkid.value = s.skid || 0; u.uTurn.value = turn;
    beam.mat.uniforms.uOn.value = s.beam * 0.3 + s.high * 0.5;

    // dust just hangs in the light, drifting
    dustMat.opacity = s.dust * (0.18 + s.beam * 0.55 + s.high * 0.5);
    dust.position.set(Math.sin(t * 0.07) * 0.5, Math.sin(t * 0.11) * 0.18, Math.sin(t * 0.05) * 0.6);

    // tyre smoke: each puff is born behind a rear wheel, then swells, rises and thins
    const burn = s.burn || 0;
    for (const p of puffs) {
      if (burn > 0.01 || p.burning) {
        // smoke from the tyres themselves: each puff is let go at the wheel, stays where it was released, then swells and thins
        p.life += dt * (0.5 + p.seed * 0.5);
        if (p.life >= 1 || !p.burning) {
          p.life %= 1;
          if (burn <= 0.01) { p.burning = false; p.sp.visible = false; continue; }
          p.burning = true;
          const wx = p.side * REAR.x, wz = REAR.z, c = Math.cos(yaw), sn = Math.sin(yaw);
          p.x = rig.position.x + wx * c + wz * sn;
          p.z = rig.position.z - wx * sn + wz * c;
        }
        const l = p.life;
        p.sp.visible = true;
        p.sp.position.set(p.x + (p.seed - 0.5) * l * 1.4, 0.2 + l * (0.9 + p.seed), p.z + (p.seed - 0.5) * l * 1.4);
        const sz = 1.1 + l * 4.2;
        p.sp.scale.set(sz, sz * 0.8, 1);
        p.sp.material.opacity = 0.44 * Math.sin(l * Math.PI);
        continue;
      }
      const life = clamp((s.smoke * 1.5 - p.at * 0.5), 0, 1);
      const on = s.smoke > 0.001 && life > 0;
      p.sp.visible = on;
      if (!on) continue;
      p.sp.position.set(p.side * (0.92 + life * (0.5 + p.seed)), 0.22 + life * (0.5 + p.seed * 0.6), -1.6 - life * (1.2 + p.seed * 2.4) + Math.min(s.carZ, 0) * (1 - p.at));
      const size = 1 + life * 4.4;
      p.sp.scale.set(size, size * 0.8, 1);
      p.sp.material.opacity = 0.34 * Math.sin(Math.min(1, life * 1.06) * Math.PI) * (1 - s.smoke * 0.2);
    }

    // ---- the camera
    const b = base;
    camera.fov = lerp(s.lens, b.lens, f);
    const d = lerp(s.near, b.dist, f) * (1 + (s.pull || 0));
    const az = s.az + lookX * 0.05 * f, el = s.el + lookY * 0.016 * f;
    const cx = Math.min(IN_ROOM, s.tx + Math.sin(az) * Math.cos(el) * d); // the camera backing away for a trick stays in the room too
    const cz = s.tz + Math.cos(az) * Math.cos(el) * d;
    const cy = Math.max(0.14, s.ty + Math.sin(el) * d);
    camera.position.set(cx + Math.sin(t * 13) * e * e * 0.007, cy + Math.sin(t * 17.3) * e * e * 0.005, cz);
    camera.up.set(Math.sin(s.roll), Math.cos(s.roll), 0);
    camera.lookAt(s.tx, s.ty, s.tz);
    camera.setViewOffset(W, H, -b.sx * f * W, -b.sy * f * H, W, H);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    // ---- lens glow: only from a lamp that faces the camera
    forward.set(Math.sin(yaw), 0, Math.cos(yaw));
    lampPos.set(0, 1, s.carZ);
    toCam.copy(camera.position).sub(lampPos).normalize();
    const facing = forward.dot(toCam);
    const lit = smooth(0.1, 0.8, facing), back = smooth(0.05, 0.75, -facing);
    const hot = clamp(s.high + s.pod * 0.16 + e * 0.12, 0, 1) * lit;
    for (const h of heads) {
      const size = 0.34 + s.high * 3.6 + e * 0.34;
      h.glow.material.opacity = hot;
      h.glow.scale.set(size, size, 1);
      h.streak.material.opacity = hot * 0.85;
      h.streak.scale.set(size * 2.6, size * 2.6, 1);
    }
    tails.forEach((sp) => { sp.material.opacity = s.red * 0.2 * back; sp.scale.set(0.5, 0.5, 1); });

    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    if (glowPasses) drawGlow();
  }

  if (import.meta.env.MODE === 'dbg') window.__dbg = { THREE: { Color, MeshBasicMaterial, DoubleSide }, scene, car, rig, s, renderer, camera, draw, hide: [sky, floor.mesh, hallLights.mesh, hallLights.mirror, signs.group, dust, ...beamMeshes, ...heads.flatMap((h) => [h.glow, h.streak]), ...tails, ...(mirror ? [mirror] : [])] };
  // every paint in the scene, the engine's too (shown shrunk to nothing), is built by the graphics card in the background
  // rather than all at once on the page's own thread: that froze the start button for most of a second
  if (engine) { engine.group.visible = true; engine.group.scale.setScalar(1e-4); }
  await compileAside(renderer, scene, camera);
  if (glowPasses) { // and the glow pass's own: the scene in black, and the blur
    glowLook(true);
    if (glowA) renderer.setRenderTarget(glowA); // paints are built for where they are drawn: the glow goes to its own picture
    await compileAside(renderer, scene, camera);
    renderer.setRenderTarget(null);
    glowLook(false);
    const plane = new PlaneGeometry(2, 2), passes = new Scene().add(new Mesh(plane, blur), new Mesh(plane, add));
    await compileAside(renderer, passes, camera);
    plane.dispose();
  }
  await uploadAside(renderer, scene);
  if (bay?.map) renderer.initTexture(bay.map); // its one picture goes to the graphics card now, not mid-film
  await breathe();
  // hand the engine to the graphics card now, shrunk to nothing, so it doesn't stall the film the moment it first appears
  if (engine) {
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    if (glowPasses) drawGlow(); // the glow pass draws it too, with shaders of its own
    engine.group.scale.setScalar(ENGINE_SIZE);
    engine.group.visible = false;
  }
  ready = true;
  draw(true);
  canvas.classList.add('is-live');
  // a browser may drop the graphics of a background tab. Everything comes back by itself except what was drawn into a
  // texture, so the reflections are rebuilt. The stage waits dark for that; the still only steps in if it never comes back
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    canvas.classList.remove('is-live');
    contextLost = true;
    lostTimer = setTimeout(() => document.documentElement.classList.remove('has-3d'), 4000);
  }, { signal });
  canvas.addEventListener('webglcontextrestored', async () => {
    clearTimeout(lostTimer);
    const old = scene.environment;
    scene.environment = await buildStudio(renderer, hallTex);
    contextLost = false;
    old?.dispose();
    dropGlow(); // their pictures went with the context: made again
    sizeGlow();
    draw(true);
    document.documentElement.classList.add('has-3d');
    canvas.classList.add('is-live');
  }, { signal });

  /** Hands back everything this stage holds on the graphics card: every shape, paint and picture in the scene (the engine and
      bay too, if they're still here), the reflections, the glow's pictures and passes, and then the context itself, at once,
      rather than whenever the browser gets round to it. Then every listener and watcher goes, and draw() does nothing. */
  function dispose() {
    if (disposed) return;
    disposed = true;
    life.abort();
    sizes.disconnect();
    seenBy.disconnect();
    clearTimeout(lostTimer);
    engine?.dispose(); engine = null;
    bay?.dispose(); bay = null;
    const shapes = new Set(), paints = new Set(), pictures = new Set();
    const picture = (v) => { if (v?.isTexture) pictures.add(v); };
    scene.traverse((o) => {
      if (o.geometry) shapes.add(o.geometry);
      for (const m of [o.material].flat()) {
        if (!m) continue;
        paints.add(m);
        Object.values(m).forEach(picture);
        if (m.uniforms) Object.values(m.uniforms).forEach((u) => picture(u?.value));
      }
    });
    for (const m of [black, blur, add]) paints.add(m);
    for (const t of [scene.environment, hallTex, surfaceTex, glow, streak]) picture(t);
    shapes.forEach((g) => g.dispose());
    paints.forEach((m) => m.dispose());
    pictures.forEach((t) => t.dispose());
    dropGlow();
    quad.dispose();
    scene.environment = null;
    renderer.renderLists.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
  // leaving for good (not into the back/forward cache, which keeps the page as it is): give the graphics card back straight away,
  // so the next page's own canvas has it
  addEventListener('pagehide', (e) => { if (!e.persisted) dispose(); }, { signal });

  return {
    draw,
    /** Where the logo forms on screen, so the badge can take over from the pieces exactly there. */
    markOnScreen() {
      const box = canvas.getBoundingClientRect();
      const at = (x) => { const v = new Vector3(x, MARK_AT.y, MARK_AT.z + rig.position.z).project(camera); return [box.left + ((v.x + 1) / 2) * box.width, box.top + ((1 - v.y) / 2) * box.height]; };
      const [l, y] = at(-MARK_SIZE / 2), [r] = at(MARK_SIZE / 2);
      return { x: (l + r) / 2, y, w: r - l };
    },
    dropEngine() { engine?.dispose(); engine = null; },
    dropBay() { bay?.dispose(); bay = null; if (plainBay) plainBay.visible = true; },
    dispose,
    /** which tier it is drawing at, and how many steps down it has gone (for checking, see ?quality= in src/lib/device.js) */
    get quality() { return { level, stepped, pixelRatio: sharpness(), glow: glowPasses, mirror: !!mirror?.visible }; },
    get turned() { return turned; },
  };
}
