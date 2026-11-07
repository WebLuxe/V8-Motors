/* The V8 under the bonnet, for the end of the intro. It sits on its mounts at its real size until the bonnet is out of the
   way, then lifts out of the bay towards you, comes apart in the air, and its pieces fly together into the V8 Motors mark.
   Only home.js's timeline drives it, through four numbers in s:
     eRise 0..1  up out of the bay and forward, clear of the raised bonnet
     eShake 0..1 it trembles as it revs
     eBurst 0..1 the parts fly apart
     eForm  0..1 they gather into the mark
   Model: "V8 Hot Rod Engine" by ShotaB (CC BY 4.0), trimmed and split into parts in Blender. */
import { Color, Group, MeshBasicMaterial, MeshPhysicalMaterial, Quaternion, Vector3 } from 'three';

// points on the logo's shape, from public/images/brand/v8-mark.png: across and up, as a share of its width
const MARK = [[0.027, 0.026], [-0.442, 0.24], [-0.162, -0.444], [0.431, 0.446], [-0.286, -0.114], [0.159, 0.273], [0.052, -0.246], [-0.335, 0.076], [0.019, -0.427], [-0.137, -0.246], [-0.121, -0.048], [0.291, 0.339], [-0.014, -0.122], [0.11, 0.158], [-0.352, 0.191], [-0.245, -0.007], [-0.245, -0.304], [-0.187, -0.13], [-0.014, -0.312], [-0.071, -0.402], [-0.088, -0.172], [-0.146, -0.337], [-0.228, -0.221], [-0.409, 0.117], [0.052, -0.073], [-0.335, -0.04], [-0.022, -0.221], [0.069, -0.361], [-0.03, -0.032], [0.349, 0.405], [-0.17, 0.01], [0.168, 0.199], [0.06, 0.084], [-0.212, -0.378], [0.225, 0.282], [-0.187, -0.056], [-0.038, -0.46], [0.044, -0.172], [-0.08, -0.106], [-0.071, -0.279], [-0.245, -0.163], [-0.319, 0.133], [-0.071, 0.018], [-0.451, 0.166], [-0.352, 0.018], [-0.286, 0.051], [-0.154, -0.172], [0.481, 0.463], [-0.236, -0.081], [-0.03, -0.37], [-0.179, -0.295], [-0.154, -0.386], [-0.393, 0.257], [-0.277, -0.048], [0.11, 0.216], [0.234, 0.339], [-0.409, 0.191], [0.052, -0.304], [-0.385, 0.059], [-0.005, -0.073], [-0.113, -0.46], [0.06, 0.133], [-0.08, -0.337], [-0.36, 0.141], [-0.154, -0.089], [0.102, 0.109], [-0.071, -0.213], [0.052, -0.015], [0.011, 0.067], [0.019, -0.361], [-0.038, -0.163], [-0.113, -0.304], [0.39, 0.413], [0.003, -0.18], [-0.492, 0.24], [-0.203, -0.427], [0.011, -0.271], [-0.121, 0.018], [0.044, -0.122], [-0.187, -0.337], [-0.195, -0.254], [-0.162, -0.213], [0.077, 0.034], [0.332, 0.364], [-0.302, 0.001], [-0.113, -0.402], [-0.121, -0.196], [0.151, 0.232], [-0.228, -0.122], [-0.063, -0.065], [-0.195, -0.172], [-0.212, -0.023], [0.052, -0.402], [0.209, 0.24], [-0.071, -0.023], [-0.253, -0.345], [0.019, -0.229], [-0.459, 0.207], [0.258, 0.306], [-0.03, -0.419], [-0.096, -0.246], [0.291, 0.38], [-0.005, -0.394], [-0.014, 0.026], [0.027, 0.1], [0.184, 0.298], [-0.113, -0.361], [0.027, -0.328], [0.135, 0.133], [-0.401, 0.158], [0.027, -0.048], [-0.055, -0.246], [-0.31, -0.065], [-0.195, -0.098], [-0.154, -0.032], [-0.376, 0.224], [-0.376, 0.092], [-0.212, -0.287], [0.209, 0.323], [-0.121, -0.015]];

const LOOKS = {
  Chrome: { color: 0xe9ebee, metalness: 1, roughness: 0.16 },
  Dark: { color: 0x17181a, metalness: 0.8, roughness: 0.45 },
  Block: { color: 0x2a2b2e, metalness: 0.7, roughness: 0.42 },
  Steel: { color: 0xa9adb3, metalness: 1, roughness: 0.3 },
  Rubber: { color: 0x0b0b0c, metalness: 0, roughness: 0.8 },
  Red: { color: 0xc40f1a, metalness: 0.3, roughness: 0.25, clearcoat: 1 },
  Gold: { color: 0xd9931e, metalness: 1, roughness: 0.3 },
};

export const ENGINE_SIZE = 1.95;       // how much bigger than life it ends up: it is the star of the shot
const SEATED = 0.95;                   // its size on its mounts: small enough to sit under the closed bonnet
const FROM = 0.52, TO = 1.5;           // height above the floor, on its mounts and at the top of its rise
const OUT = 0.45;                      // how far it moves forward as it rises. The bonnet stands just behind it up there
export const MARK_SIZE = 1.34, MARK_AT = new Vector3(0, 2.2, 2.2); // the logo forms in front of the raised bonnet, its black underside the backdrop
const clamp = (x) => Math.min(1, Math.max(0, x));
const soft = (x) => x * x * (3 - 2 * x);

export function buildEngine(root, x, z) {
  const group = new Group();
  group.position.set(x, FROM, z);
  group.scale.setScalar(SEATED);
  group.visible = false;
  const mats = new Map();
  const parts = [];
  const lift = new Vector3(0, 0.08, 0.1);
  const spare = new Vector3();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const name = o.material.name.replace('eng_', '');
    if (!mats.has(name)) {
      const m = new MeshPhysicalMaterial({ ...LOOKS[name], envMapIntensity: 2.2 });
      m.color = new Color(LOOKS[name].color);
      mats.set(name, m);
    }
    o.material = mats.get(name);
    o.frustumCulled = false;
    o.geometry.computeBoundingSphere();
    parts.push(o);
  });
  group.add(root);
  // the outer parts leave first, so the engine visibly opens up
  const mid = new Vector3(0, 0.34, 0);
  const end = MARK_AT.clone();
  parts.forEach((o, i) => {
    const home = o.position.clone(); // its place in the engine
    const p = MARK[i % MARK.length];
    const out = home.clone().sub(mid);
    const reach = out.length();
    out.normalize().add(spare.set(Math.random() - 0.5, Math.random() * 0.7, (Math.random() - 0.5) * 0.6).multiplyScalar(0.6)).normalize();
    const mark = new Vector3(end.x + p[0] * MARK_SIZE, end.y + p[1] * MARK_SIZE, end.z + 0.1);
    o.userData = {
      home,
      apart: home.clone().add(out.multiplyScalar(0.34 + Math.random() * 0.5)).add(lift),
      mark,   // in the car's space: turned into the engine's own when it stops rising
      bend: new Vector3((Math.random() - 0.5) * 2, 0.2 + Math.random(), (Math.random() - 0.5) * 1.2),
      wait: (1 - clamp(reach / 0.55)) * 0.3,
      late: Math.random() * 0.3,
      axis: new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
      spin: 2 + Math.random() * 5,
      base: o.scale.x, // the model's compression keeps each part's real size here
      size: Math.min(1, 0.05 / ((o.geometry.boundingSphere.radius || 0.5) * o.scale.x)),
      start: o.quaternion.clone(),
      turn: new Quaternion(),
    };
  });
  // the marks in the engine's own space, once: it always stops in the same place
  const local = (v) => v.clone().sub(new Vector3(x, TO, z + OUT)).divideScalar(ENGINE_SIZE);
  parts.forEach((o) => { o.userData.mark = local(o.userData.mark); });

  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  return {
    group,
    update(s, t) {
      const rise = s.eRise || 0, burst = s.eBurst || 0, form = s.eForm || 0;
      group.visible = (s.bonnet || 0) > 0.001 && form < 0.999;
      if (!group.visible) return;
      const shake = (s.eShake || 0) * (1 - burst);
      group.position.y = FROM + (TO - FROM) * rise + Math.sin(t * 71) * 0.008 * shake;
      group.position.x = x + Math.sin(t * 93) * 0.006 * shake;
      group.position.z = z + OUT * soft(clamp(rise * 1.4));
      group.scale.setScalar(SEATED + (ENGINE_SIZE - SEATED) * soft(clamp((rise - 0.2) / 0.8))); // only grows once it is clear of the towers
      group.rotation.y = -0.55 * soft(rise) * (1 - soft(form)); // nose to the grille, and it turns three-quarters on as it climbs
      if (burst <= 0) return;
      for (const o of parts) {
        const u = o.userData;
        const bi = soft(clamp((burst - u.wait) / (1 - u.wait)));
        const fi = soft(clamp((form - u.late) / (1 - u.late)));
        a.lerpVectors(u.home, u.apart, bi);
        if (fi > 0) {
          // a curve out and round, so the pieces sweep in rather than slide
          b.lerpVectors(u.apart, u.mark, 0.5).add(c.copy(u.bend).multiplyScalar(0.55));
          const k = 1 - fi;
          a.set(k * k * u.apart.x + 2 * k * fi * b.x + fi * fi * u.mark.x, k * k * u.apart.y + 2 * k * fi * b.y + fi * fi * u.mark.y, k * k * u.apart.z + 2 * k * fi * b.z + fi * fi * u.mark.z);
        }
        o.position.copy(a);
        u.turn.setFromAxisAngle(u.axis, (bi * 0.8 + fi * 1.1) * u.spin);
        o.quaternion.copy(u.start).premultiply(u.turn);
        o.scale.setScalar(u.base * (1 + (u.size - 1) * fi));
      }
    },
    dispose() {
      group.removeFromParent();
      group.traverse((o) => o.isMesh && o.geometry.dispose());
      mats.forEach((m) => m.dispose());
    },
  };
}

/** The bay the V8 leaves behind: built in Blender to the car's real opening, with its light baked into one picture, so it
    draws for almost nothing. It only exists for the intro. brightness 0..1 is the lamp under the bonnet. */
export function buildBay(root, parent) {
  const mats = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = new MeshBasicMaterial({ map: o.material.map, toneMapped: false });
    o.material = m;
    o.frustumCulled = false;
    mats.push(m);
  });
  root.visible = false;
  parent.add(root);
  return {
    map: mats[0]?.map,
    update(open, brightness) {
      root.visible = open > 0.001;
      for (const m of mats) m.color.setScalar(brightness);
    },
    dispose() {
      root.removeFromParent();
      root.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.map?.dispose(); o.material.dispose(); } });
    },
  };
}
