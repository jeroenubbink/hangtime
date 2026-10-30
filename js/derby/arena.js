// Derby arenas. The ground is a height function (cheap to query for eight cars' wheels and hulls 120 times
// a second); the walls are a distance function the cars are kept inside. Each arena dresses itself with
// stands, scrap, floodlights or a city, built from merged and instanced primitives.
import * as THREE from 'three';
import { addDetail, grassTexture } from '../textures.js';
import { merge, Scatter, grandstand, mountainGeometry } from '../scenery.js';

function rng(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const smooth = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const shade = (hex, k) => new THREE.Color(hex).multiplyScalar(k);

export const ARENAS = {
  bowl: {
    name: 'Dust Bowl', blurb: 'A round dirt bowl with banked edges and a hill in the middle. Classic.',
    shape: 'circle', R: 56, colour: '#c08a52',
  },
  yard: {
    name: 'Scrapyard', blurb: 'Walls of crushed cars, two jumps and a mud pit that eats grip.',
    shape: 'rect', W: 106, H: 76, corner: 12, colour: '#8a7a68',
  },
  deck: {
    name: 'Sky Deck', blurb: 'A rooftop with no walls, 300 m up. Shove them off the edge!',
    shape: 'oct', R: 42, fall: true, colour: '#5d6b80',
  },
};

const FALL = -500;
const _n = new THREE.Vector3();

export class Arena {
  constructor(scene, key) {
    this.key = key;
    this.def = ARENAS[key];
    this.scene = scene;
    this.group = new THREE.Group();
    this.trees = [];          // round pillars: { x, z, r }
    this.ramps = [];
    this.wet = false;
    this.lit = [];            // materials that glow after dark: [material, colour]
    this.rand = rng(key.length * 7919 + key.charCodeAt(0));
    if (key === 'bowl') this.setupBowl();
    else if (key === 'yard') this.setupYard();
    else this.setupDeck();
    this.buildGround();
    for (const r of this.ramps) this.group.add(rampMesh(r));
    for (const t of this.trees) this.group.add(this.pillarMesh(t));
    this.spawns = this.makeSpawns();
    scene.add(this.group);
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      for (const m of [o.material || []].flat()) if (!m.userData.shared) m.dispose();
    });
  }

  // ---------- Shape ----------
  // Signed distance to the arena's edge: negative inside
  edge(x, z) {
    const d = this.def;
    if (d.shape === 'circle') return Math.hypot(x, z) - d.R;
    if (d.shape === 'rect') {
      const c = d.corner, qx = Math.abs(x) - (d.W / 2 - c), qz = Math.abs(z) - (d.H / 2 - c);
      return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - c;
    }
    let m = -Infinity;
    for (let k = 0; k < 8; k++) m = Math.max(m, x * Math.cos(k * Math.PI / 4) + z * Math.sin(k * Math.PI / 4));
    return m - d.R;
  }

  // Unit vector pointing outwards across the edge nearest to (x, z)
  outward(x, z, out = new THREE.Vector3()) {
    const e = 0.3;
    out.set(this.edge(x + e, z) - this.edge(x - e, z), 0, this.edge(x, z + e) - this.edge(x, z - e));
    const l = Math.hypot(out.x, out.z);
    return l > 1e-6 ? out.multiplyScalar(1 / l) : out.set(Math.sign(x) || 1, 0, 0);
  }

  // How far across the arena is, roughly (for the AI and cameras)
  get size() { return this.def.R || this.def.W / 2; }

  // ---------- Ground ----------
  base(x, z) { return this.baseFn(x, z); }

  groundHeight(x, z) {
    if (this.def.fall && this.edge(x, z) > 0) return FALL;
    let h = this.baseFn(x, z);
    for (const r of this.ramps) h = Math.max(h, rampHeight(r, x, z));
    return h;
  }

  groundNormal(x, z, out = new THREE.Vector3()) {
    const e = 0.35;
    const dx = this.groundHeight(x + e, z) - this.groundHeight(x - e, z), dz = this.groundHeight(x, z + e) - this.groundHeight(x, z - e);
    return out.set(-dx, 2 * e, -dz).normalize();
  }

  surfaceGrip(x, z) { return this.gripFn ? this.gripFn(x, z) : 1; }
  onRoad() { return true; }

  // Only the ground is solid to rays; walls and pillars are handled apart
  raycast(origin, dir, far, withGround = true) {
    if (!withGround || dir.y > -1e-6) return null;
    let t = (this.groundHeight(origin.x, origin.z) - origin.y) / dir.y;
    for (let i = 0; i < 2; i++) {
      const px = origin.x + dir.x * Math.max(0, t), pz = origin.z + dir.z * Math.max(0, t);
      t = (this.groundHeight(px, pz) - origin.y) / dir.y;
    }
    if (t < -0.3 || t > far) return null;
    const point = new THREE.Vector3().copy(origin).addScaledVector(dir, t);
    return { dist: Math.max(0, t), point, normal: this.groundNormal(point.x, point.z) };
  }

  // Walls: keep the car's corners inside, bouncing it off with a bit of spin. Returns the impact speed and
  // leaves the hit on the car (car.wallHit) for the damage model.
  contain(car) {
    if (this.def.fall) return 0;
    let worst = 0;
    // Thrown clean over the wall (it can happen): put it back inside
    const out = this.edge(car.pos.x, car.pos.z);
    if (out > 1) {
      this.outward(car.pos.x, car.pos.z, _n);
      car.pos.addScaledVector(_n, -(out + 3));
      car.pos.y = Math.max(car.pos.y, this.groundHeight(car.pos.x, car.pos.z) + 1);
      car.vel.multiplyScalar(0.3);
    }
    const s = car.spec.size || [1.9, 4.4];
    const hw = s[0] / 2, hl = s[1] / 2;
    for (const [x, z] of [[-hw, -hl], [hw, -hl], [-hw, hl], [hw, hl], [-hw, 0], [hw, 0]]) {
      _p.set(x, 0, z).applyQuaternion(car.q).add(car.pos);
      const d = this.edge(_p.x, _p.z);
      if (d < 0) continue;
      this.outward(_p.x, _p.z, _n);
      _r.subVectors(_p, car.pos);
      _pv.crossVectors(car.w, _r).add(car.vel);
      const vn = _pv.dot(_n);
      car.pos.addScaledVector(_n, -d * 0.9);
      if (vn <= 0) continue;
      const k = 1 / car.mass + _n.dot(_t2.crossVectors(car.invInertia(_t1.crossVectors(_r, _n), _J), _r));
      _J.copy(_n).multiplyScalar(-1.35 * vn / k);
      // Scrape along the wall
      _vt.copy(_pv).addScaledVector(_n, -vn);
      const vtl = _vt.length();
      if (vtl > 1e-3) _J.addScaledVector(_vt, -Math.min(vtl / k, 0.25 * 1.35 * vn / k) / vtl);
      car.applyImpulse(_r, _J);
      if (vn > worst) {
        worst = vn;
        car.wallHit = { point: _p.clone(), normal: _n.clone().negate(), speed: vn, impulse: 1.35 * vn / k };
      }
    }
    return worst;
  }

  // ---------- Layouts ----------
  setupBowl() {
    const R = this.def.R;
    this.baseFn = (x, z) => {
      const r = Math.hypot(x, z);
      let h = 0.1 * Math.sin(x * 0.31) * Math.sin(z * 0.27);
      if (r > 42) h += 3.6 * ((Math.min(r, R + 2) - 42) / (R - 42)) ** 2;
      if (r < 17) h += 2.3 * (r < 7 ? 1 : 0.5 + 0.5 * Math.cos(Math.PI * (r - 7) / 10));
      return h;
    };
    this.gripFn = () => 0.86;
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + k * Math.PI / 2;
      this.trees.push({ x: Math.sin(a) * 30, z: Math.cos(a) * 30, r: 1.5, kind: 'tyres' });
    }
    this.pads = [[0, 0]];
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; this.pads.push([Math.sin(a) * 25, Math.cos(a) * 25]); }
    this.groundColour = (x, z, h) => {
      const r = Math.hypot(x, z);
      const ring = Math.abs(Math.sin(r * 0.9)) > 0.93 ? 0.88 : 1;   // worn rings where cars circle
      return shade(r > 42 ? '#a77c52' : r < 12 ? '#b8905e' : '#b0835a', ring * (0.94 + 0.06 * Math.sin(x * 0.2 + z * 0.13)));
    };
    this.dressBowl();
  }

  setupYard() {
    const { W, H } = this.def;
    const mud = [-22, 6, 14, 9];   // centre x, z, radii
    this.mud = mud;
    const mudK = (x, z) => 1 - Math.hypot((x - mud[0]) / mud[2], (z - mud[1]) / mud[3]);
    this.baseFn = (x, z) => 0.12 * Math.sin(x * 0.23 + 1) * Math.sin(z * 0.31) - 0.4 * smooth(mudK(x, z) * 2);
    this.gripFn = (x, z) => (mudK(x, z) > 0 ? 0.5 : 0.95);
    this.ramps.push({ x: 18, z: -16, a: 0, up: 7, top: 5, h: 1.9, w: 9, side: 2.2 });
    this.ramps.push({ x: 26, z: 18, a: Math.PI / 2, up: 7, top: 4, h: 1.6, w: 8, side: 2.2 });
    this.trees.push({ x: 0, z: 0, r: 2.6, kind: 'cubes' });
    for (const [x, z] of [[-38, -22], [40, -2], [-8, 26]]) this.trees.push({ x, z, r: 1.5, kind: 'tyres' });
    this.pads = [[-22, 6], [0, -22], [0, 22], [-40, -4], [42, 20], [42, -24], [-30, 28]];
    this.groundColour = (x, z) => {
      const m = mudK(x, z);
      if (m > 0) return shade('#5a4430', 0.85 + 0.15 * (1 - m));
      const n = Math.sin(x * 0.17) * Math.cos(z * 0.21) + 0.5 * Math.sin((x - z) * 0.4);
      return shade(n > 0.6 ? '#8a7f70' : '#7d7062', 0.95 + 0.05 * Math.sin(x * 1.3 + z));
    };
    this.dressYard(W, H);
  }

  setupDeck() {
    this.baseFn = (x, z) => {
      const r = Math.hypot(x, z);
      return r < 9 ? 1.2 * (0.5 + 0.5 * Math.cos(Math.PI * r / 9)) : 0;
    };
    this.gripFn = () => 1;
    this.fallY = -14;
    this.pads = [[0, 0], [22, 0], [-22, 0], [0, 22], [0, -22]];
    this.groundColour = () => new THREE.Color('#ffffff');
    this.dressDeck();
  }

  makeSpawns() {
    const out = [];
    const d = this.def;
    const rx = d.shape === 'rect' ? d.W / 2 - 12 : d.R * 0.66, rz = d.shape === 'rect' ? d.H / 2 - 10 : d.R * 0.66;
    for (let k = 0; k < 8; k++) {
      const a = (k + 0.5) / 8 * Math.PI * 2;
      const x = Math.sin(a) * rx, z = Math.cos(a) * rz;
      out.push({ x, z, yaw: Math.atan2(x, z) });   // facing the middle
    }
    return out;
  }

  // ---------- Visuals ----------
  buildGround() {
    const d = this.def;
    const ext = d.shape === 'rect' ? Math.max(d.W, d.H) / 2 + 4 : d.R + 4;
    let geo;
    if (d.fall) {
      // The octagonal top of a tower
      geo = octagonGrid(d.R / Math.cos(Math.PI / 8), 18, 6);
    } else geo = new THREE.PlaneGeometry(ext * 2, ext * 2, Math.ceil(ext * 0.85), Math.ceil(ext * 0.85)).rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, cols = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = this.baseFn(x, z);
      pos.setY(i, h);
      const c = this.groundColour(x, z, h);
      cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    let mat;
    if (d.fall) {
      const tex = deckTexture(d.R);
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(Array.from({ length: pos.count }, (_, i) => [pos.getX(i) / (d.R * 2.4) + 0.5, pos.getZ(i) / (d.R * 2.4) + 0.5]).flat(), 2));
      mat = addDetail(new THREE.MeshLambertMaterial({ map: tex, vertexColors: true }), { fine: 0.5, strength: 0.25, coarse: 0.04, coarseStrength: 0.2 });
    } else {
      mat = addDetail(new THREE.MeshLambertMaterial({ vertexColors: true }), { fine: 0.45, strength: 0.34, coarse: 0.04, coarseStrength: 0.26 });
    }
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    this.group.add(m);
  }

  pillarMesh(t) {
    let geo;
    if (t.kind === 'tyres') {
      const parts = [];
      for (let k = 0; k < 6; k++) for (const [ox, oz] of [[0, 0]]) parts.push([new THREE.CylinderGeometry(t.r, t.r, 0.42, 14).translate(ox, 0.21 + k * 0.42, oz), k % 2 ? '#e8e8e8' : '#d8352b']);
      parts.push([new THREE.CylinderGeometry(t.r * 0.55, t.r * 0.55, 2.6, 10).translate(0, 1.27, 0), '#1c1c1e']);
      geo = merge(parts);
    } else {
      // A stack of crushed cars
      const rand = rng(31), parts = [];
      const cols = ['#8b4a2f', '#4e6a8a', '#a8a39a', '#6b7d3a', '#9b3328', '#c9a227'];
      for (let k = 0; k < 4; k++) {
        const g = new THREE.BoxGeometry(t.r * 1.6, 0.9, t.r * 1.15).rotateY((rand() - 0.5) * 0.5).translate((rand() - 0.5) * 0.4, 0.45 + k * 0.92, (rand() - 0.5) * 0.4);
        parts.push([g, (y, f) => shade(cols[(k + Math.floor(rand() * 6)) % 6], f % 4 < 2 ? 1 : 0.8)]);
      }
      geo = merge(parts);
    }
    const m = new THREE.Mesh(geo, detailVC());
    m.position.set(t.x, this.baseFn(t.x, t.z) - 0.05, t.z);
    m.castShadow = m.receiveShadow = true;
    return m;
  }

  // Floodlight towers; their lamps glow after dark
  floodlights(points, height, baseY) {
    const parts = [], lamps = [];
    for (const [x, z] of points) {
      const y0 = baseY(x, z), a = Math.atan2(x, z);
      parts.push([new THREE.CylinderGeometry(0.35, 0.55, height, 8).translate(x, y0 + height / 2, z), '#7b828c']);
      const head = new THREE.BoxGeometry(5, 2.6, 0.5).rotateX(0.5).rotateY(a).translate(x, y0 + height + 1, z);
      parts.push([head, '#3a3f47']);
      lamps.push([new THREE.PlaneGeometry(4.4, 2.0).rotateX(0.5 + Math.PI).rotateY(a).translate(x - Math.sin(a) * 0.32, y0 + height + 1 - 0.13, z - Math.cos(a) * 0.32), '#fff8e0']);
    }
    const m = new THREE.Mesh(merge(parts), detailVC());
    m.castShadow = true;
    const lampMat = new THREE.MeshBasicMaterial({ color: '#8a8a80', side: THREE.DoubleSide });
    this.lit.push([lampMat, '#fffbe6', '#8a8a80']);
    this.group.add(m, new THREE.Mesh(merge(lamps), lampMat));
  }

  dressBowl() {
    const R = this.def.R, rim = 3.6, rand = this.rand;
    // Concrete wall with a band of tyres in front
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.8, R + 0.8, 3.4, 96, 1, true).translate(0, rim + 0.9, 0),
      addDetail(new THREE.MeshLambertMaterial({ color: '#b8b2a6', side: THREE.DoubleSide }), { fine: 0.6, strength: 0.3 }));
    wall.receiveShadow = true;
    const cap = new THREE.Mesh(new THREE.RingGeometry(R + 0.8, R + 1.6, 96).rotateX(-Math.PI / 2).translate(0, rim + 2.6, 0), new THREE.MeshLambertMaterial({ color: '#cfc9bc' }));
    this.group.add(wall, cap);
    const tyres = new Scatter(5);
    const n = Math.round(2 * Math.PI * R / 2.3);
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2;
      tyres.add('tyrewall', Math.sin(a) * (R + 0.2), this.baseFn(Math.sin(a) * R, Math.cos(a) * R) - 0.3, Math.cos(a) * (R + 0.2), 1, a + Math.PI / 2);
    }
    for (const m of tyres.build()) { m.castShadow = false; this.group.add(m); }
    this.group.add(adBoards(R + 0.82, rim + 2.6, 24));
    // Stands all round, with gaps for the floodlights
    for (let k = 0; k < 10; k++) {
      const a = (k + 0.5) / 10 * Math.PI * 2;
      const s = grandstand(40 + k);
      s.position.set(Math.sin(a) * (R + 4.5), rim + 0.3, Math.cos(a) * (R + 4.5));
      s.rotation.y = a;
      s.scale.set(1.45, 1, 1);
      s.castShadow = false;
      this.group.add(s);
    }
    this.floodlights([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter(k => k % 2 === 0).map(k => { const a = k / 10 * Math.PI * 2; return [Math.sin(a) * (R + 9), Math.cos(a) * (R + 9)]; }), 24, () => rim);
    this.outskirts(R + 1, rim, '#6d8a3e');
    void rand;
  }

  dressYard(W, H) {
    const rand = this.rand;
    // Walls of crushed cars round the edge, three high
    const cubes = new THREE.InstancedMesh(merge([[new THREE.BoxGeometry(2.4, 1.0, 1.5), (y, f) => shade('#ffffff', f < 4 ? 0.85 : f < 8 ? 1 : 0.75)]]), detailVC(), 1200);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), c = new THREE.Color();
    const rust = ['#8b4a2f', '#4e6a8a', '#a8a39a', '#6b7d3a', '#9b3328', '#c9a227', '#5a5f66', '#2f5e8a', '#7a3b5c'];
    let i = 0;
    const perim = [];
    for (let t = 0; t < 1; t += 0.0015) {
      const a = t * Math.PI * 2;
      // Walk round the rounded rectangle by projecting a circle's points onto its edge
      let x = Math.sin(a) * W, z = Math.cos(a) * H;
      for (let k = 0; k < 30; k++) { const d = this.edge(x, z); this.outward(x, z, _n); x -= _n.x * d; z -= _n.z * d; }
      const last = perim[perim.length - 1];
      if (!last || Math.hypot(x - last[0], z - last[1]) > 2.45) perim.push([x, z]);
    }
    for (const [x, z] of perim) {
      this.outward(x, z, _n);
      const yaw = Math.atan2(_n.x, _n.z) + Math.PI / 2;
      for (let k = 0; k < 3; k++) {
        if (i >= 1200) break;
        Q.setFromEuler(new THREE.Euler((rand() - 0.5) * 0.12, yaw + (rand() - 0.5) * 0.25, (rand() - 0.5) * 0.1));
        M.compose(new THREE.Vector3(x + _n.x * (1 + rand() * 0.3), 0.5 + k * 1.0, z + _n.z * (1 + rand() * 0.3)), Q, new THREE.Vector3(1, 0.85 + rand() * 0.3, 1));
        cubes.setMatrixAt(i, M);
        cubes.setColorAt(i++, c.set(rust[Math.floor(rand() * rust.length)]).multiplyScalar(0.75 + rand() * 0.3));
      }
    }
    cubes.count = i;
    cubes.castShadow = cubes.receiveShadow = true;
    cubes.computeBoundingSphere();
    this.group.add(cubes);
    // Shipping containers and scrap heaps outside, a crane
    const parts = [];
    const cont = ['#b5442e', '#2e6fb5', '#3a8a4a', '#c99a2e', '#7d8590'];
    for (let k = 0; k < 14; k++) {
      const a = rand() * Math.PI * 2, x = Math.sin(a) * (W / 2 + 14 + rand() * 30), z = Math.cos(a) * (H / 2 + 14 + rand() * 30);
      const stack = 1 + Math.floor(rand() * 3), col = cont[k % cont.length], rot = rand() * Math.PI;
      for (let s = 0; s < stack; s++) parts.push([new THREE.BoxGeometry(12, 2.6, 2.5).rotateY(rot).translate(x, 1.3 + s * 2.6, z), shade(cont[(k + s) % cont.length], 0.9)]);
      void col;
    }
    for (let k = 0; k < 10; k++) {
      const a = rand() * Math.PI * 2, x = Math.sin(a) * (W / 2 + 10 + rand() * 40), z = Math.cos(a) * (H / 2 + 10 + rand() * 40);
      const g = new THREE.DodecahedronGeometry(4 + rand() * 4, 1).scale(1.4, 0.55, 1.1);
      g.translate(x, 0, z);
      parts.push([g, (y, f) => shade(rust[f % rust.length], 0.7)]);
    }
    // Crane: tower, jib, counterweight, hook
    const cx = -W / 2 - 16, cz = -H / 2 - 6;
    parts.push([new THREE.BoxGeometry(2, 34, 2).translate(cx, 17, cz), '#e0b020']);
    parts.push([new THREE.BoxGeometry(44, 1.6, 1.6).translate(cx + 16, 34, cz), '#e0b020']);
    parts.push([new THREE.BoxGeometry(5, 3, 3).translate(cx - 5, 32.5, cz), '#5a5f66']);
    parts.push([new THREE.BoxGeometry(3, 2.2, 2.2).translate(cx + 1.5, 31.6, cz), '#2a2d33']);
    parts.push([new THREE.CylinderGeometry(0.06, 0.06, 18).translate(cx + 30, 25, cz), '#2a2d33']);
    parts.push([new THREE.CylinderGeometry(2.2, 2.2, 0.6, 16).translate(cx + 30, 15.7, cz), '#3a3f47']);
    const m = new THREE.Mesh(merge(parts), detailVC());
    m.castShadow = m.receiveShadow = true;
    this.group.add(m);
    this.group.add(adBoards(0, 0, 0, this));
    this.floodlights([[W / 2 + 4, H / 2 + 4], [-W / 2 - 4, H / 2 + 4], [W / 2 + 4, -H / 2 - 4], [-W / 2 - 4, -H / 2 - 4]], 22, () => 0);
    this.outskirts(Math.hypot(W, H) / 2 + 1, -0.15, '#7a7a52');
  }

  dressDeck() {
    const R = this.def.R, rr = R / Math.cos(Math.PI / 8);
    // The tower under the pad, and a hazard-striped kerb round the edge
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(rr * 0.92, rr * 0.92, 300, 8, 1).rotateY(Math.PI / 8).translate(0, -151.5, 0),
      new THREE.MeshLambertMaterial({ map: windowTexture(), emissiveMap: windowTexture(true), color: '#9aa4b5' }));
    tower.material.map.repeat.set(8, 24);
    tower.material.emissiveMap.repeat.set(8, 24);
    const slab = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr * 0.96, 1.6, 8, 1).rotateY(Math.PI / 8).translate(0, -0.82, 0), new THREE.MeshLambertMaterial({ color: '#4a5260' }));
    this.lit.push([tower.material, '#ffe9b0', '#000000', 'emissive']);
    const parts = [];
    for (let k = 0; k < 8; k++) {
      const a0 = k * Math.PI / 4 + Math.PI / 8, a1 = a0 + Math.PI / 4;
      const p0 = [Math.cos(a0) * rr, Math.sin(a0) * rr], p1 = [Math.cos(a1) * rr, Math.sin(a1) * rr];
      for (let s = 0; s < 12; s++) {
        const t0 = s / 12, t1 = (s + 1) / 12;
        const x0 = p0[0] + (p1[0] - p0[0]) * t0, z0 = p0[1] + (p1[1] - p0[1]) * t0, x1 = p0[0] + (p1[0] - p0[0]) * t1, z1 = p0[1] + (p1[1] - p0[1]) * t1;
        const len = Math.hypot(x1 - x0, z1 - z0);
        parts.push([new THREE.BoxGeometry(len, 0.14, 0.6).rotateY(-Math.atan2(z1 - z0, x1 - x0)).translate((x0 + x1) / 2, 0.07, (z0 + z1) / 2), s % 2 ? '#2a2a2a' : '#f2c21b']);
      }
      // Corner beacons
      parts.push([new THREE.CylinderGeometry(0.15, 0.15, 2.2, 6).translate(p0[0] * 1.02, -0.2, p0[1] * 1.02), '#5a5f66']);
    }
    const kerb = new THREE.Mesh(merge(parts), detailVC());
    kerb.receiveShadow = true;
    const beacons = [];
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4 + Math.PI / 8;
      beacons.push([new THREE.SphereGeometry(0.3, 8, 6).translate(Math.cos(a) * rr * 1.02, 1.0, Math.sin(a) * rr * 1.02), '#ff4030']);
    }
    const beaconMat = new THREE.MeshBasicMaterial({ color: '#802018' });
    this.lit.push([beaconMat, '#ff5040', '#a02a20']);
    this.group.add(tower, slab, kerb, new THREE.Mesh(merge(beacons), beaconMat));
    this.city();
  }

  // Skyscrapers round the deck, with lit windows after dark, and streets far below
  city() {
    const rand = this.rand, N = 140;
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const mat = new THREE.MeshLambertMaterial({ map: windowTexture(), emissiveMap: windowTexture(true), color: '#ffffff' });
    mat.map.repeat.set(3, 10);
    mat.emissiveMap.repeat.set(3, 10);
    this.lit.push([mat, '#ffe2a0', '#000000', 'emissive']);
    const towers = new THREE.InstancedMesh(box, mat, N);
    const M = new THREE.Matrix4(), c = new THREE.Color();
    const tones = ['#9aa4b5', '#b5a99a', '#7d8a9c', '#c4c8cf', '#8a8f99', '#a3907a'];
    for (let i = 0; i < N; i++) {
      const a = rand() * Math.PI * 2, d = 90 + Math.pow(rand(), 0.7) * 520;
      const w = 18 + rand() * 26, h = 200 + rand() * 260 - d * 0.25;
      M.compose(new THREE.Vector3(Math.sin(a) * d, -300, Math.cos(a) * d), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 1.5), new THREE.Vector3(w, h, w * (0.7 + rand() * 0.6)));
      towers.setMatrixAt(i, M);
      towers.setColorAt(i, c.set(tones[i % tones.length]));
    }
    towers.computeBoundingSphere();
    const streets = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400).rotateX(-Math.PI / 2).translate(0, -300, 0), new THREE.MeshLambertMaterial({ color: '#3a3f47' }));
    this.group.add(towers, streets);
  }

  // Grass, trees and mountains beyond the walls (from radius r0 out)
  outskirts(r0, y, colour) {
    const ground = new THREE.Mesh(new THREE.RingGeometry(r0, 900, 96, 1).rotateX(-Math.PI / 2).translate(0, y - 0.05, 0),
      addDetail(new THREE.MeshLambertMaterial({ color: colour }), { map: grassTexture, fine: 0.35, strength: 0.3, coarse: 0.02, coarseStrength: 0.3, flat: true }));
    ground.receiveShadow = true;
    this.group.add(ground);
    const sc = new Scatter(9), rand = this.rand;
    for (let k = 0; k < 160; k++) {
      const a = rand() * Math.PI * 2, d = r0 + 26 + rand() * 160;
      sc.add(rand() < 0.5 ? 'pine' : 'round', Math.sin(a) * d, y, Math.cos(a) * d, 1 + rand() * 1.1);
    }
    for (const m of sc.build()) { m.castShadow = false; this.group.add(m); }
    const geos = [];
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2 + rand() * 0.3, d = 650 + rand() * 200;
      geos.push([mountainGeometry(120 + rand() * 90, 90 + rand() * 120, k + 3).translate(Math.sin(a) * d, y - 2, Math.cos(a) * d), null]);
    }
    const mm = new THREE.Mesh(merge(geos), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.group.add(mm);
  }

  // Lamps for the time of day (0 = daylight, 1 = night)
  setLighting(level) {
    for (const [mat, on, off, slot] of this.lit) {
      if (slot === 'emissive') { mat.emissive.set(level > 0 ? on : off); mat.emissiveIntensity = level; }
      else mat.color.set(level > 0 ? on : off);
    }
  }
}

const _p = new THREE.Vector3(), _r = new THREE.Vector3(), _pv = new THREE.Vector3(), _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(),
  _J = new THREE.Vector3(), _vt = new THREE.Vector3();

let vcMat = null;
function detailVC() {
  if (!vcMat) {
    vcMat = addDetail(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), { fine: 0.8, strength: 0.22, coarse: 0.05, coarseStrength: 0.12 });
    vcMat.userData.shared = true;
  }
  return vcMat;
}

// A tabletop jump: ramps up at both ends and down the sides, flat on top
function rampHeight(r, x, z) {
  const dx = x - r.x, dz = z - r.z, c = Math.cos(r.a), s = Math.sin(r.a);
  const u = dx * c + dz * s, v = -dx * s + dz * c;
  const L = r.up + r.top / 2;
  const du = L - Math.abs(u), dv = r.w / 2 - Math.abs(v);
  if (du <= 0 || dv <= 0) return -Infinity;
  return r.h * Math.min(1, du / r.up, dv / r.side);
}

function rampMesh(r) {
  const L = r.up + r.top / 2, T = r.top / 2, w = r.w / 2, t = w - r.side;
  // Bottom and top rectangles in ramp space (u along, v across)
  const B = [[-L, -w], [L, -w], [L, w], [-L, w]], U = [[-T, -t], [T, -t], [T, t], [-T, t]];
  const c = Math.cos(r.a), s = Math.sin(r.a);
  const P = ([u, v], y) => [r.x + u * c - v * s, y, r.z + u * s + v * c];
  const tris = [];
  const quad = (a, b, cc, d, col) => tris.push([a, b, cc, col], [a, cc, d, col]);
  quad(P(U[0], r.h), P(U[3], r.h), P(U[2], r.h), P(U[1], r.h), '#8f7d68');
  for (let k = 0; k < 4; k++) {
    const k1 = (k + 1) % 4;
    quad(P(B[k], 0), P(U[k], r.h), P(U[k1], r.h), P(B[k1], 0), k % 2 ? '#7a6955' : '#a3907a');
  }
  const pos = [], col = [];
  const C = new THREE.Color();
  for (const [a, b, cc, colour] of tris) {
    C.set(colour);
    for (const p of [a, cc, b]) { pos.push(...p); col.push(C.r, C.g, C.b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // Hazard stripes along the top edges of the ends
  const stripes = [];
  for (const sgn of [-1, 1]) for (let k = 0; k < 6; k++) {
    const v0 = -t + (2 * t) * k / 6, v1 = -t + (2 * t) * (k + 1) / 6;
    const a = P([sgn * T, v0], r.h + 0.02), b = P([sgn * T, v1], r.h + 0.02);
    stripes.push([new THREE.BoxGeometry(Math.hypot(b[0] - a[0], b[2] - a[2]), 0.06, 0.5).rotateY(-Math.atan2(b[2] - a[2], b[0] - a[0])).translate((a[0] + b[0]) / 2, r.h, (a[2] + b[2]) / 2), k % 2 ? '#2a2a2a' : '#f2c21b']);
  }
  const m = new THREE.Mesh(merge([[g, null], ...stripes]), detailVC());
  m.castShadow = m.receiveShadow = true;
  return m;
}

// An octagon (corners at 22.5° + k·45°) as rings of vertices, for shading and the hump in the middle
function octagonGrid(rr, rings, perSide) {
  const n = 8 * perSide, pos = [], idx = [];
  const corner = k => { const a = k * Math.PI / 4 + Math.PI / 8; return [Math.cos(a) * rr, Math.sin(a) * rr]; };
  pos.push(0, 0, 0);
  for (let i = 1; i <= rings; i++) {
    const f = i / rings;
    for (let j = 0; j < n; j++) {
      const k = Math.floor(j / perSide), t = (j % perSide) / perSide, a = corner(k), b = corner(k + 1);
      pos.push((a[0] + (b[0] - a[0]) * t) * f, 0, (a[1] + (b[1] - a[1]) * t) * f);
    }
  }
  const at = (i, j) => (i === 0 ? 0 : 1 + (i - 1) * n + (j % n));
  for (let j = 0; j < n; j++) idx.push(0, at(1, j + 1), at(1, j));
  for (let i = 1; i < rings; i++) for (let j = 0; j < n; j++) {
    idx.push(at(i, j), at(i, j + 1), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j));
  }
  // Wind the triangles to face up
  const [p, q] = [at(1, 1), at(1, 0)];
  if ((pos[p * 3 + 2] * pos[q * 3] - pos[p * 3] * pos[q * 3 + 2]) < 0) for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// The deck's paint: a helipad circle, a big X target, and hazard chevrons round the edge
function deckTexture(R) {
  return canvasTexture(1024, 1024, (ctx, n) => {
    const k = n / (R * 2.4), cx = n / 2;
    ctx.fillStyle = '#6b7380';
    ctx.fillRect(0, 0, n, n);
    // Concrete panels
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 2;
    for (let x = 0; x < n; x += 6 * k) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, n); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, x); ctx.lineTo(n, x); ctx.stroke(); }
    ctx.strokeStyle = '#f2f2f2';
    ctx.lineWidth = 1.2 * k;
    ctx.beginPath(); ctx.arc(cx, cx, 26 * k, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#f2c21b';
    ctx.lineWidth = 0.8 * k;
    ctx.beginPath(); ctx.arc(cx, cx, 14 * k, 0, Math.PI * 2); ctx.stroke();
    // Edge warning band
    ctx.strokeStyle = '#d8352b';
    ctx.lineWidth = 1.6 * k;
    ctx.beginPath();
    for (let j = 0; j <= 8; j++) {
      const a = j * Math.PI / 4 + Math.PI / 8, r = (R - 3) / Math.cos(Math.PI / 8) * k;
      if (j) ctx.lineTo(cx + Math.cos(a) * r, cx + Math.sin(a) * r); else ctx.moveTo(cx + Math.cos(a) * r, cx + Math.sin(a) * r);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `bold ${7 * k}px Russo One, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let j = 0; j < 4; j++) {
      ctx.save();
      ctx.translate(cx, cx);
      ctx.rotate(j * Math.PI / 2);
      ctx.fillText('CRUNCH', 0, -32 * k);
      ctx.restore();
    }
  });
}

// Windows: a facade texture for the day (glass panes on concrete), and a glow map with some panes lit
const windowTex = {};
function windowTexture(glow = false) {
  const key = glow ? 'glow' : 'day';
  if (!windowTex[key]) {
    windowTex[key] = canvasTexture(128, 128, (ctx, n) => {
      ctx.fillStyle = glow ? '#000000' : '#c9ccd2';
      ctx.fillRect(0, 0, n, n);
      const rand = rng(77);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
        const lit = rand() < 0.45;
        ctx.fillStyle = glow ? (lit ? '#ffe7a8' : '#000000') : (lit ? '#6f8299' : '#5a6b80');
        ctx.fillRect(x * 32 + 5, y * 16 + 3, 22, 10);
      }
    });
    windowTex[key].wrapS = windowTex[key].wrapT = THREE.RepeatWrapping;
  }
  return windowTex[key].clone();
}

// Advertising boards: on top of the bowl's wall, or along the scrapyard's long sides
function adBoards(R, y, count, arena) {
  const ads = [['CRUNCHTIME', '#e8352b', '#fff'], ['DENT-O-MATIC', '#ffcf2e', '#222'], ['SCRAP & SONS', '#2f7fe0', '#fff'],
    ['HOT DOGS', '#22b35a', '#fff'], ['BUMPER CARS', '#9b4dff', '#fff'], ['TOW TRUCK 24/7', '#ff7a1a', '#222']];
  const tex = canvasTexture(1024, 384, (ctx) => {
    ads.forEach(([t, bg, fg], i) => {
      const x = (i % 2) * 512, yy = Math.floor(i / 2) * 128;
      ctx.fillStyle = bg; ctx.fillRect(x, yy, 512, 128);
      ctx.fillStyle = fg; ctx.font = 'bold 62px Russo One, Impact, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(t, x + 256, yy + 68, 480);
    });
  });
  const mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
  const pos = [], uv = [];
  const board = (ax, az, bx, bz, y0, h, i) => {
    const u0 = (i % 2) * 0.5, v1 = 1 - Math.floor(i / 2) / 3, v0 = v1 - 1 / 3;
    pos.push(ax, y0, az, bx, y0, bz, bx, y0 + h, bz, ax, y0, az, bx, y0 + h, bz, ax, y0 + h, az);
    uv.push(u0, v0, u0 + 0.5, v0, u0 + 0.5, v1, u0, v0, u0 + 0.5, v1, u0, v1);
  };
  if (arena) {
    const { W, H } = arena.def;
    let i = 0;
    // Text reads left to right seen from inside the arena
    for (const s of [-1, 1]) for (let x = -W / 2 + 18; x < W / 2 - 16; x += 13) {
      const [x0, x1] = s < 0 ? [x, x + 12] : [x + 12, x];
      board(x0, s * (H / 2 + 0.7), x1, s * (H / 2 + 0.7), 3.2, 2.4, i++ % 6);
    }
  } else {
    for (let k = 0; k < count; k++) {
      const a0 = k / count * Math.PI * 2, a1 = (k + 0.92) / count * Math.PI * 2;
      board(Math.sin(a1) * R, Math.cos(a1) * R, Math.sin(a0) * R, Math.cos(a0) * R, y, 1.6, k % 6);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}
