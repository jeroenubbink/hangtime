// Street furniture that goes flying: lamp posts, trees, traffic lights, bins, hydrants (which then gush),
// bollards along the quay and cones round the roadworks. Instanced per kind; a knocked prop leaves its
// instance and tumbles away as loose debris.
import * as THREE from 'three';
import { merge, sceneryGeo } from '../scenery.js';
import { CURB } from './city.js';
import { PUMP, PILLAR, SIGN } from './station.js';

const CELL = 20;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function shared(g) { g.userData.shared = true; return g; }
// The glass of a lamp (the near-white and warm yellow faces of its model), on its own, to light up after dark
export function glassOf(g) {
  const p = g.index ? g.toNonIndexed() : g, keep = [];
  const c = p.attributes.color, pos = p.attributes.position;
  if (c) for (let i = 0; i < pos.count; i += 3) if (c.getX(i) > 0.95 && c.getY(i) > 0.7 && c.getZ(i) > 0.3) for (let j = 0; j < 3; j++) keep.push(pos.getX(i + j), pos.getY(i + j), pos.getZ(i + j));
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
  return out;
}
// (a sodium-warm glow, 2000-2500 K, for the lamps along the streets and paths)
const LIT = new THREE.MeshBasicMaterial({ color: '#ffa04a', toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
const LIGHTS = ['lamp', 'lantern'];
// The kit's leaves are a bright toy green: cooled toward teal and quietened, like the rest of the town (a copy: the
// kit's own is shared)
// (made once for each kit model and `kept`, not freed with the props: they're laid again for every run)
const _hsl = {}, leaves = new WeakMap();
function leafy(src) {
  if (!src?.attributes.color) return src;
  if (leaves.has(src)) return leaves.get(src);
  const g = src.clone();
  g.userData = { kept: true };
  const c = g.attributes.color, col = new THREE.Color();
  for (let i = 0; i < c.count; i++) {
    col.fromBufferAttribute(c, i).getHSL(_hsl);
    if (_hsl.h > 0.15 && _hsl.h < 0.45 && _hsl.s > 0.2) col.setHSL(_hsl.h + (0.42 - _hsl.h) * 0.5, _hsl.s * 0.6, _hsl.l * 0.9);
    c.setXYZ(i, col.r, col.g, col.b);
  }
  leaves.set(src, g);
  return g;
}
const MODELS = {
  lamp: () => merge([
    [new THREE.CylinderGeometry(0.09, 0.13, 6.2, 8).translate(0, 3.1, 0), '#5d6470'],
    [new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6).rotateZ(Math.PI / 2).translate(-0.75, 6.1, 0), '#5d6470'],
    [new THREE.BoxGeometry(0.7, 0.18, 0.36).translate(-1.45, 6.05, 0), '#3c414a'],
    [new THREE.BoxGeometry(0.6, 0.06, 0.28).translate(-1.45, 5.94, 0), '#fff5c8'],
  ]),
  light: () => merge([
    [new THREE.CylinderGeometry(0.1, 0.12, 4.2, 8).translate(0, 2.1, 0), '#3c414a'],
    [new THREE.BoxGeometry(0.42, 1.25, 0.36).translate(0, 4.3, 0), '#2a2d33'],
    [new THREE.SphereGeometry(0.13, 8, 6).translate(0, 4.7, -0.2), '#ff3b2f'],
    [new THREE.SphereGeometry(0.13, 8, 6).translate(0, 4.3, -0.2), '#4a3a12'],
    [new THREE.SphereGeometry(0.13, 8, 6).translate(0, 3.9, -0.2), '#163a1c'],
  ]),
  tree: () => leafy(sceneryGeo('round')) || merge([
    [new THREE.CylinderGeometry(0.2, 0.3, 2.4, 6).translate(0, 1.2, 0), '#7a5534'],
    [new THREE.IcosahedronGeometry(1.7, 1).translate(0, 3.4, 0), '#4f9a3c'],
  ]),
  bin: () => merge([
    [new THREE.CylinderGeometry(0.32, 0.28, 0.95, 10).translate(0, 0.48, 0), '#3d8a4a'],
    [new THREE.CylinderGeometry(0.35, 0.35, 0.08, 10).translate(0, 0.98, 0), '#2c6a38'],
  ]),
  hydrant: () => merge([
    [new THREE.CylinderGeometry(0.16, 0.2, 0.7, 8).translate(0, 0.35, 0), '#e8352b'],
    [new THREE.SphereGeometry(0.17, 8, 6).translate(0, 0.72, 0), '#e8352b'],
    [new THREE.CylinderGeometry(0.07, 0.07, 0.5, 6).rotateZ(Math.PI / 2).translate(0, 0.45, 0), '#c9ccd2'],
  ]),
  bollard: () => merge([
    [new THREE.CylinderGeometry(0.18, 0.24, 0.8, 8).translate(0, 0.4, 0), '#3a3a40'],
    [new THREE.SphereGeometry(0.2, 8, 5).translate(0, 0.8, 0), '#3a3a40'],
  ]),
  cone: () => sceneryGeo('cone') || new THREE.ConeGeometry(0.3, 0.8, 10).translate(0, 0.4, 0),
  // In the park: benches along the paths, and low bushes (they hide nothing behind them)
  bench: () => merge([
    ...[-0.18, 0.02, 0.22].map(z => [new THREE.BoxGeometry(1.8, 0.05, 0.16).translate(0, 0.45, z), '#a8743f']),
    ...[0.6, 0.78].map(y => [new THREE.BoxGeometry(1.8, 0.14, 0.05).translate(0, y, 0.33), '#a8743f']),
    ...[-0.75, 0.75].map(x => [new THREE.BoxGeometry(0.08, 0.45, 0.5).translate(x, 0.22, 0.02), '#3c414a']),
  ]),
  bush: () => leafy(sceneryGeo('bush')) || new THREE.IcosahedronGeometry(0.9, 1).scale(1, 0.7, 1).translate(0, 0.45, 0),
  // Hotel California's palms, and the fountain in the square behind it (from the hotel kit; plain stand-ins without it)
  palm: () => leafy(sceneryGeo('palm')) || merge([
    [new THREE.CylinderGeometry(0.2, 0.32, 8, 7).translate(0, 4, 0), '#a9875e'],
    [new THREE.IcosahedronGeometry(1.8, 0).scale(1.4, 0.4, 1.4).translate(0, 8, 0), '#4fa846'],
  ]),
  fountain: () => sceneryGeo('fountain') || merge([
    [new THREE.CylinderGeometry(2.6, 2.6, 0.55, 24).translate(0, 0.28, 0), '#cfc7b6'],
    [new THREE.CylinderGeometry(0.3, 0.3, 2.2, 10).translate(0, 1.1, 0), '#cfc7b6'],
  ]),
  // Fuel's Paradise: its pumps, canopy pillars and price sign (the sign's face is the station's)
  pump: PUMP, pillar: PILLAR, sign: SIGN,
  // Over the Edge's lamp standards along the bridge's parapets, cast iron in its teal (from the bridge kit)
  lantern: () => sceneryGeo('lantern') || merge([
    [new THREE.CylinderGeometry(0.1, 0.16, 4.6, 8).translate(0, 2.3, 0), '#0c7a7c'],
    [new THREE.BoxGeometry(1.6, 0.4, 0.34).translate(0, 4.2, 0), '#ffe2a0'],
  ]),
  // Short Cut's fruit stand on the corner, piled with oranges (from the film kit); and what's left of it once a car's
  // been through it, burnt black and empty
  // (a size up from the model's, to be seen from up in the air)
  fruitstand: () => sceneryGeo('fruitstand')?.clone().scale(1.35, 1.35, 1.35) || merge([
    [new THREE.BoxGeometry(2.6, 0.9, 1.3).translate(0, 0.45, 0), '#a8743f'],
    [new THREE.BoxGeometry(2.5, 0.4, 1.1).translate(0, 1.1, 0), '#ff8a1a'],
    [new THREE.BoxGeometry(2.7, 0.06, 1.6).translate(0, 2.35, 0), '#f4f2ec'],
  ]),
  fruitwreck: () => sceneryGeo('fruitwreck')?.clone().scale(1.35, 1.35, 1.35) || new THREE.BoxGeometry(2.6, 0.9, 1.3).translate(0, 0.45, 0),
  // A length of crash barrier along the edge of a bridge: it stops nothing
  rail: () => merge([
    [new THREE.BoxGeometry(3, 0.32, 0.1).translate(0, 0.62, 0), '#c3c8cf'],
    [new THREE.BoxGeometry(3, 0.06, 0.12).translate(0, 0.62, 0.02), '#9aa0a8'],
    ...[-1.2, 0, 1.2].map(x => [new THREE.BoxGeometry(0.1, 0.8, 0.1).translate(x, 0.4, -0.1), '#7d838c']),
  ]),
  barrier: () => merge([
    [new THREE.BoxGeometry(2.2, 0.32, 0.12).translate(0, 0.85, 0), (y, f) => (f % 4 < 2 ? '#e8352b' : '#f4f4f0')],
    [new THREE.BoxGeometry(0.08, 0.9, 0.08).translate(-0.9, 0.45, 0), '#3a3a40'],
    [new THREE.BoxGeometry(0.08, 0.9, 0.08).translate(0.9, 0.45, 0), '#3a3a40'],
  ]),
  // Mind the Gap's road-closed fences, across the road at both ends of the bridge: two boards of red and white on a
  // pair of legs, a lamp on top; light, there to be driven through
  stopfence: () => merge([
    ...[1.05, 0.5].flatMap(y => Array.from({ length: 6 }, (_, i) => [new THREE.BoxGeometry(0.4, 0.34, 0.05).translate(-1.0 + i * 0.4, y, 0), i % 2 ? '#f4f4f0' : '#e8352b'])),
    ...[-1.2, 1.2].flatMap(x => [[new THREE.BoxGeometry(0.07, 1.3, 0.07).translate(x, 0.65, 0), '#3a3a40'], [new THREE.BoxGeometry(0.1, 0.06, 0.7).translate(x, 0.03, 0), '#3a3a40']]),
    [new THREE.BoxGeometry(0.16, 0.16, 0.12).translate(-1.2, 1.38, 0), '#ffb21a'],
  ]),
};
// r: how close a car has to come (m); slow: speed a car loses knocking it over; h: how tall (for the flight)
const KINDS = {
  lamp: { r: 0.3, slow: 0.1, h: 6 }, lantern: { r: 0.3, slow: 0.1, h: 5 }, light: { r: 0.3, slow: 0.1, h: 4.6 }, tree: { r: 0.45, slow: 0.22, h: 4 },
  bin: { r: 0.35, slow: 0.02, h: 1 }, hydrant: { r: 0.25, slow: 0.05, h: 0.8 }, bollard: { r: 0.25, slow: 0.08, h: 0.9 },
  cone: { r: 0.35, slow: 0, h: 0.8 }, barrier: { r: 1.1, slow: 0.03, h: 1 }, stopfence: { r: 1.25, slow: 0, h: 1.4 }, rail: { r: 1.5, slow: 0.04, h: 0.8 },
  bench: { r: 0.8, slow: 0.04, h: 0.9 }, bush: { r: 0.8, slow: 0.03, h: 0.9 }, palm: { r: 0.4, slow: 0.22, h: 8.5 }, fountain: { r: 2.5, slow: 0.6, h: 3.9 },
  pump: { r: 0.5, slow: 0.12, h: 2.1 }, sign: { r: 0.3, slow: 0.15, h: 11.5 }, pillar: { r: 0.45, slow: 0.25, h: 5.4 },
  fruitstand: { r: 1.5, slow: 0.15, h: 3.2 },
};

export class Props {
  constructor(scene, city, extra = []) {
    this.scene = scene;
    this.city = city;
    this.list = [];
    this.grid = new Map();
    this.meshes = {};
    this.geos = {};
    this.lit = {};
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.lay(extra);
    this.build();
  }

  add(kind, x, z, rot = 0) {
    // (asked from a metre up: what's low and solid under it counts, a step or what's left of a bridge's deck over the
    // water, not a building's roof)
    const y = this.city.groundHeight(x, z, 1);
    this.list.push({ kind, x, y, z, rot, alive: true, ...KINDS[kind] });
  }

  // Along the kerb of every pavement: lamp posts, and trees between them; traffic lights at the junctions
  lay(extra) {
    const city = this.city;
    for (const r of city.roads) {
      for (const side of [-1, 1]) {
        const e = side > 0 ? r.vHi : r.vLo;
        // (lamp arms reach out over the road)
        const arm = Math.atan2(-side * r.rv[1], side * r.rv[0]);
        for (let s = 10, k = 0; s < r.len - 10; s += 15, k++) {
          const at = (d, ds = 0) => r.at(s + ds, e + side * d);
          const [x, z] = at(k % 2 ? 2.4 : 0.7);
          if (city.isRoad(x, z) || city.roadDist(x, z) > 3 || city.inLot(x, z, 1) || city.inDeck(x, z)) continue;
          if (city.junctions.some(({ box: [a, b, c, d] }) => x > a - 6 && x < b + 6 && z > c - 6 && z < d + 6)) continue;
          // (nor where the level wants a pavement kept clear)
          if (city.level.clear?.some(([a, b, c, d]) => x > a && x < b && z > c && z < d)) continue;
          if (k % 2) this.add('tree', x, z, s * 0.7);
          else this.add('lamp', x, z, arm);
          // (every 7th post, alternating bin and hydrant)
          if (k % 7 === 3) { const [bx, bz] = at(1.4, 1.5); this.add((k - 3) % 14 === 0 ? 'bin' : 'hydrant', bx, bz); }
        }
      }
    }
    for (const { box: [a, b, c, d], square } of city.junctions) {
      if (!square) continue;
      for (const [x, z, rot] of [[a - 1.2, d + 1.2, 0], [b + 1.2, c - 1.2, Math.PI], [a - 1.2, c - 1.2, -Math.PI / 2], [b + 1.2, d + 1.2, Math.PI / 2]]) {
        if (!city.isRoad(x, z)) this.add('light', x, z, rot);
      }
    }
    for (const [kind, x, z, rot] of extra) this.add(kind, x, z, rot);
    for (const p of this.list) {
      const key = Math.floor(p.x / CELL) + ',' + Math.floor(p.z / CELL);
      if (!this.grid.has(key)) this.grid.set(key, []);
      this.grid.get(key).push(p);
    }
  }

  build() {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    for (const kind of Object.keys(KINDS)) {
      const items = this.list.filter(p => p.kind === kind);
      if (!items.length) continue;
      const geo = this.geos[kind] = shared(MODELS[kind]());
      const mesh = new THREE.InstancedMesh(geo, this.mat, items.length);
      items.forEach((p, i) => {
        p.i = i;
        q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, p.rot);
        mesh.setMatrixAt(i, m.compose(new THREE.Vector3(p.x, p.y - 0.02, p.z), q, one));
      });
      mesh.castShadow = kind !== 'cone';
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.meshes[kind] = mesh;
      this.scene.add(mesh);
      // and a lamp's glass, to light up after dark
      if (LIGHTS.includes(kind)) {
        const glass = this.lit[kind] = new THREE.InstancedMesh(glassOf(geo), LIT, items.length);
        items.forEach((p, i) => { mesh.getMatrixAt(i, m); glass.setMatrixAt(i, m); });
        glass.visible = false;
        glass.computeBoundingSphere();
        this.scene.add(glass);
      }
    }
  }

  // The lamps on (k, 0 to 1, from the time of day) or off
  lamps(k) {
    for (const g of Object.values(this.lit)) g.visible = k > 0.3;
  }

  dispose() {
    for (const m of [...Object.values(this.meshes), ...Object.values(this.lit)]) { this.scene.remove(m); m.dispose(); }
    for (const g of Object.values(this.lit)) g.geometry.dispose();
    for (const g of Object.values(this.geos)) if (!g.userData.kept) g.dispose();
    this.mat.dispose();
  }

  // Props in the grid cell around (x, z)
  near(x, z) { return this.grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || []; }

  // Cars knock props over. Returns [{ prop, vehicle, vel }], and takes the prop out of the street.
  update(vehicles) {
    const out = [];
    for (const v of vehicles) {
      const c = v.car;
      if (c.vel.lengthSq() < 4) continue;
      const list = this.grid.get(Math.floor(c.pos.x / CELL) + ',' + Math.floor(c.pos.z / CELL));
      const near = [list];
      // The neighbouring cells too, for a car near a cell's edge
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) near.push(this.grid.get((Math.floor(c.pos.x / CELL) + dx) + ',' + (Math.floor(c.pos.z / CELL) + dz)));
      for (const L of near) {
        if (!L) continue;
        for (const p of L) {
          if (!p.alive || c.pos.y - p.y > p.h + 1 || p.y - c.pos.y > 3) continue;
          // Closest point along the car's length
          const fx = -2 * (c.q.x * c.q.z + c.q.w * c.q.y), fz = -(1 - 2 * (c.q.x * c.q.x + c.q.y * c.q.y));
          const t = Math.max(-v.len / 2 + 0.6, Math.min(v.len / 2 - 0.6, (p.x - c.pos.x) * fx + (p.z - c.pos.z) * fz));
          const dx = p.x - (c.pos.x + fx * t), dz = p.z - (c.pos.z + fz * t);
          if (dx * dx + dz * dz > (p.r + v.r) ** 2) continue;
          const vel = c.vel.clone().multiplyScalar(0.9 + Math.random() * 0.3).add(new THREE.Vector3((Math.random() - 0.5) * 3, 3 + Math.random() * 4, (Math.random() - 0.5) * 3));
          c.vel.multiplyScalar(1 - p.slow);
          this.knock(p);
          out.push({ prop: p, vehicle: v, vel });
        }
      }
    }
    return out;
  }

  // Take a prop out of the street
  knock(p) {
    p.alive = false;
    this.meshes[p.kind].setMatrixAt(p.i, ZERO);
    if (this.lit[p.kind]) { this.lit[p.kind].setMatrixAt(p.i, ZERO); this.lit[p.kind].instanceMatrix.needsUpdate = true; }
    this.meshes[p.kind].instanceMatrix.needsUpdate = true;
  }
  // An explosion at (x, z) throws everything standing within R: returns [{ prop, vel }]
  blast(x, z, R, force = 12) {
    const out = [];
    for (const p of this.list) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (!p.alive || d > R) continue;
      this.knock(p);
      const k = 1 - d / R, dx = (p.x - x) / (d || 1), dz = (p.z - z) / (d || 1);
      out.push({ prop: p, vel: new THREE.Vector3(dx * force * k + (Math.random() - 0.5) * 3, 6 + 10 * k, dz * force * k + (Math.random() - 0.5) * 3) });
    }
    return out;
  }

  // A knocked prop as a free mesh, for the debris
  piece(p) {
    // (the fruit stand goes as its wreck)
    const geo = p.kind === 'fruitstand' ? (this.geos.fruitwreck ||= shared(MODELS.fruitwreck())) : this.geos[p.kind];
    const g = new THREE.Group(), m = new THREE.Mesh(geo, this.mat);
    m.position.y = -p.h / 2;
    m.castShadow = true;
    g.add(m);
    g.rotation.y = p.rot;
    return { mesh: g, pos: new THREE.Vector3(p.x, p.y + p.h / 2, p.z), radius: Math.min(0.6, p.h / 3) };
  }
}
export { CURB };
