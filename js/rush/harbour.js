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

// The yacht, `B`: { x, z, name, pts }, bow out to sea (-z), moored at the water's level. It floats (solid sides, a deck
// to come down on, a saloon on that) until `sink()`: then it lurches over, the bow comes up and it goes down stern first.
const LIFT = 1.1;
export class Boat {
  constructor(scene, city, B) {
    this.scene = scene; this.city = city; this.B = B;
    const W = city.water;
    // (riding up in the water, the white of its sides clear of it and the top of the red bottom showing: the model's
    // LIFT up, and what's solid isn't, see `parts`: its deck's where it always was, level with the quay)
    this.y = W.y + LIFT;
    this.group = new THREE.Group();
    const hull = new THREE.Mesh(sceneryGeo('yacht') || merge([
      [new THREE.BoxGeometry(6.4, 2.6, 24).translate(0, 0.25, 0), '#f4f2ec'],
      [new THREE.BoxGeometry(4.8, 2.2, 11).translate(0, 2.8, 3), '#f4f2ec'],
    ]), MAT);
    hull.castShadow = hull.receiveShadow = true;
    this.group.add(hull, ...[-1, 1].map(s => nameBoard(t(B.name), s)));
    this.group.position.set(B.x, W.y, B.z);
    scene.add(this.group);
    // What's solid: the hull, to its deck (level with the quay), and the saloon on it. Floating, so they're the ground
    // over the water (see City.groundHeight), and walls round it.
    this.parts = [{ dz: 0, w: 6.4, d: 24, up: 1.48 - LIFT }, { dz: 3, w: 4.8, d: 11, up: 3.78 - LIFT }].map(P => {
      const b = { x: B.x, z: B.z + P.dz, w: P.w, d: P.d, ca: 1, sa: 0, up: P.up };
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
    this.group.rotation.set(0, 0, 0);
    for (const b of this.parts) b.top = this.y + b.up;
  }
  // How far p is from it, across the water
  dist(p) {
    const B = this.B, dx = Math.max(0, Math.abs(p.x - B.x) - 3.2), dz = Math.max(0, Math.abs(p.z - B.z) - 12);
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
    const g = this.group, S = this.sunk;
    if (!S) {
      // (riding the swell a little)
      const k = performance.now() / 1000;
      g.rotation.z = Math.sin(k * 0.9) * 0.012;
      g.rotation.x = Math.sin(k * 0.6 + 1) * 0.006;
      g.position.y = this.y + Math.sin(k * 0.8) * 0.05;
      return;
    }
    if (!g.visible) return;
    const t = S.t += dt;
    // a lurch away from the blast, then the stern goes, the bow comes up, and it slides under, faster and faster
    g.rotation.z = Math.min(0.22, t * 0.3) * (1 - Math.max(0, t - 4) / 5);
    g.rotation.x = Math.min(0.6, Math.max(0, t - 0.6) * 0.25);
    const drop = 0.15 * t + 0.12 * t * t;
    g.position.y = this.y - drop;
    for (const b of this.parts) b.top = t < 1.5 ? this.y + b.up - drop : -Infinity;
    if ((S.bubbles -= dt) <= 0) {
      S.bubbles = 0.25;
      const B = this.B, along = Math.min(1, t / 6) * 20 - 10;
      fx(new THREE.Vector3(B.x + (Math.random() - 0.5) * 4, this.y, B.z + along), t < 1 ? 30 : 10);
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
function nameBoard(name, s) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 96;
  const g = cv.getContext('2d');
  g.font = "italic 900 64px 'Titillium Web', Impact, sans-serif";
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#1f3b63';
  let px = 64;
  const w = g.measureText(name).width;
  if (w > 490) { px *= 490 / w; g.font = `italic 900 ${px}px 'Titillium Web', Impact, sans-serif`; }
  g.fillText(name, 256, 50);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.86), new THREE.MeshLambertMaterial({ map: tex, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  // (on the side, toward the stern, in the white over the stripe; the hull's 3.05 m out there)
  m.position.set(s * 3.19, 0.95, 7.4);
  m.rotation.y = s * Math.PI / 2;
  return m;
}
