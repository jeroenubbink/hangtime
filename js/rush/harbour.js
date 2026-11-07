// Dockside Drop's harbour: the container crane straddling the jetty, over the tankers parked on it, and the yacht
// moored beside it, which goes down when one of them goes up. Both from the docks kit (modelled in Blender, see
// assets/src/docks.blend), with plain stand-ins if it hasn't loaded.
import * as THREE from 'three';
import { merge, sceneryGeo } from '../scenery.js';
import { CURB } from './city.js';
import { t } from '../i18n.js';

const MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
// (where the crane's legs stand, from its middle, and how high it is under the boom)
const LEGS = [[-9, -6], [9, -6], [-9, 6], [9, 6]], TOP = 24;
// The rest of its steel, for the camera to keep clear of (from its middle and the ground, as in the model): the top,
// the beams round the legs and the machinery house on it as one flat block, and the boom out along the jetty level
// with it (one height over all of it, so a camera going over the crane goes over smoothly, not up and down every
// beam); and the cross-bracing between the legs, that it can see through but mustn't come up against
const STEEL = [
  { x: 0, z: 4.7, w: 19.6, d: 22.8, y: 22, h: 8.6 },
  { x: 0, z: -11, w: 6.2, d: 58, y: 22, h: 8.6 },
  { x: 0, z: 0, w: 3, d: 1.2, y: 28, h: 11.4, thin: true },
  ...[-6, 6].map(z => ({ x: 0, z, w: 19.2, d: 1.2, y: 1.5, h: 21, thin: true })),
];

// The crane, `C`: { x, z }, its legs solid
export function crane(city, C) {
  const geo = sceneryGeo('crane') || merge([
    ...LEGS.map(([x, z]) => [new THREE.BoxGeometry(1.3, TOP, 1.3).translate(x, TOP / 2, z), '#d63a2f']),
    [new THREE.BoxGeometry(6.2, 1.8, 58).translate(0, TOP + 1.2, -11), '#eeece6'],
  ]);
  const m = new THREE.Mesh(geo, MAT);
  m.position.set(C.x, CURB, C.z);
  m.castShadow = m.receiveShadow = true;
  for (const [x, z] of LEGS) {
    const b = { x: C.x + x, z: C.z + z, w: 1.3, d: 1.3, ca: 1, sa: 0, top: CURB + TOP, floor: CURB - 1, h: TOP, pad: 1.5 };
    city.addToGrid(b, b.x - 0.65, b.x + 0.65, b.z - 0.65, b.z + 0.65);
  }
  for (const S of STEEL) city.screen({ x: C.x + S.x, z: C.z + S.z, w: S.w, d: S.d, floor: CURB + S.y, top: CURB + S.y + S.h, pad: 1.5, thin: S.thin });
  return m;
}

// A boat, `B`: { x, z, name, pts }, moored at the water's level; by default the yacht, bow out to sea (-z). Or another of
// the kits' boats: `model`, turned `yaw` (0 or a right angle), the `parts` of it that are solid ({ dz, w, d, up }: along
// it, across it, and how high over its waterline), its `board`, where its name goes on each side ([out, up, along], or
// none), and its `lift`, how high it rides (the model's waterline over the water's level). It floats (solid sides, a deck to come down on, what's on that) until `sink()`: then it lurches over, the bow
// comes up and it goes down stern first.
// (the yacht rides up in the water, the white of its sides clear of it and the top of the red bottom showing; its deck's
// where it always was, level with the quay)
const YACHT = { model: 'yacht', lift: 1.1, parts: [{ dz: 0, w: 6.4, d: 24, up: 0.38 }, { dz: 3, w: 4.8, d: 11, up: 2.68 }], board: [3.19, 0.95, 7.4] };
export class Boat {
  constructor(scene, city, B) {
    B = { ...YACHT, ...B };
    this.scene = scene; this.city = city; this.B = B;
    const W = city.water;
    // (else a little low in the water: the bow's forefoot rides at the waterline)
    this.y = W.y + (B.lift ?? -0.12);
    // (turned on the outside; it rolls and pitches inside, in its own axes)
    this.group = new THREE.Group();
    this.hull = new THREE.Group();
    const hull = new THREE.Mesh(sceneryGeo(B.model) || merge(B.parts.map(P => [new THREE.BoxGeometry(P.w, P.up + 1, P.d).translate(0, (P.up - 1) / 2, P.dz), '#f4f2ec'])), MAT);
    hull.castShadow = hull.receiveShadow = true;
    this.hull.add(hull);
    if (B.board) this.hull.add(...[-1, 1].map(s => nameBoard(t(B.name), s, B.board)));
    this.group.add(this.hull);
    this.group.position.set(B.x, W.y, B.z);
    this.group.rotation.y = B.yaw || 0;
    scene.add(this.group);
    // (its length and beam, as they lie)
    const along = Math.abs(Math.cos(B.yaw || 0)) > 0.5;
    this.half = along ? [B.parts[0].w / 2, B.parts[0].d / 2] : [B.parts[0].d / 2, B.parts[0].w / 2];
    // What's solid: the hull, to its deck (level with the quay), and what's on it. Floating, so they're the ground over
    // the water (see City.groundHeight), and walls round it.
    const ca = Math.cos(B.yaw || 0), sa = Math.sin(B.yaw || 0);
    this.parts = B.parts.map(P => {
      const x = B.x + sa * P.dz, z = B.z + ca * P.dz, w = along ? P.w : P.d, d = along ? P.d : P.w;
      const b = { x, z, w, d, ca: 1, sa: 0, up: P.up };
      city.addToGrid(b, b.x - b.w / 2, b.x + b.w / 2, b.z - b.d / 2, b.z + b.d / 2);
      city.floats.push(b);
      return b;
    });
    this.reset();
  }

  // Afloat again, for a new run
  reset() {
    this.sunk = null;
    this.group.visible = true;
    this.group.position.y = this.y;
    this.hull.rotation.set(0, 0, 0);
    for (const b of this.parts) b.top = this.y + b.up;
  }
  // How far p is from it, across the water
  dist(p) {
    const B = this.B, dx = Math.max(0, Math.abs(p.x - B.x) - this.half[0]), dz = Math.max(0, Math.abs(p.z - B.z) - this.half[1]);
    return Math.hypot(dx, dz);
  }
  // Down she goes (once): true if this was the time
  sink() {
    if (this.sunk) return false;
    this.sunk = { t: 0, bubbles: 0 };
    return true;
  }
  // `dt` on; `fx(p, n)` makes a splash of n at p (where the water's coming in, and the bubbles as it goes)
  update(dt, fx) {
    const g = this.group, h = this.hull, S = this.sunk;
    if (!S) {
      // (riding the swell a little)
      const k = performance.now() / 1000 + this.B.x * 0.1;
      h.rotation.z = Math.sin(k * 0.9) * 0.012;
      h.rotation.x = Math.sin(k * 0.6 + 1) * 0.006;
      g.position.y = this.y + Math.sin(k * 0.8) * 0.05;
      return;
    }
    if (!g.visible) return;
    const t = S.t += dt;
    // a lurch away from the blast, then the stern goes, the bow comes up, and it slides under, faster and faster
    h.rotation.z = Math.min(0.22, t * 0.3) * (1 - Math.max(0, t - 4) / 5);
    h.rotation.x = Math.min(0.6, Math.max(0, t - 0.6) * 0.25);
    const drop = 0.15 * t + 0.12 * t * t;
    g.position.y = this.y - drop;
    for (const b of this.parts) b.top = t < 1.5 ? this.y + b.up - drop : -Infinity;
    if ((S.bubbles -= dt) <= 0) {
      S.bubbles = 0.25;
      const B = this.B, L = this.B.parts[0].d, along = (Math.min(1, t / 6) - 0.5) * L * 0.8, side = (Math.random() - 0.5) * this.B.parts[0].w * 0.6;
      const ca = Math.cos(B.yaw || 0), sa = Math.sin(B.yaw || 0);
      fx(new THREE.Vector3(B.x + sa * along + ca * side, this.y, B.z + ca * along - sa * side), t < 1 ? 30 : 10);
    }
    if (t > 10) g.visible = false;
  }
  // Where it went down, for the tour of the wreckage
  get spot() { return new THREE.Vector3(this.B.x, this.y + 1.1, this.B.z); }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(o => { if (o.isMesh && o.material !== MAT) { o.material.map?.dispose(); o.material.dispose(); o.geometry.dispose(); } });
    for (const b of this.parts) b.top = -Infinity;
    this.city.floats = this.city.floats.filter(b => !this.parts.includes(b));
  }
}

// Its name on the topsides near the stern, each side (s: -1 port, 1 starboard)
function nameBoard(name, s, [out, up, along, colour = '#1f3b63']) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 96;
  const g = cv.getContext('2d');
  g.font = "italic 900 64px 'Titillium Web', Impact, sans-serif";
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = colour;
  let px = 64;
  const w = g.measureText(name).width;
  if (w > 490) { px *= 490 / w; g.font = `italic 900 ${px}px 'Titillium Web', Impact, sans-serif`; }
  g.fillText(name, 256, 50);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.86), new THREE.MeshLambertMaterial({ map: tex, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  // (on the side, where `board` says: the yacht's toward the stern, in the white over the stripe, its hull 3.05 m out there)
  m.position.set(s * out, up, along);
  m.rotation.y = s * Math.PI / 2;
  return m;
}
