// Rushtime's streets. Roads are axis-aligned strips; everything off the road is pavement a curb higher,
// and buildings are boxes the cars bounce off. The ground is a height function (cheap enough for forty
// cars' wheels 120 times a second); buildings sit in a coarse grid so each car only checks a few.
import * as THREE from 'three';
import { merge } from '../scenery.js';
import { addDetail } from '../textures.js';

export const LANE = 3.6;
export const CURB = 0.16;
const WALK = 5;                  // pavement width beside every road
const CELL = 24;

function rng(seed) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }
const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _r = new THREE.Vector3(), _pv = new THREE.Vector3();
const _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _J = new THREE.Vector3(), _vt = new THREE.Vector3();

// A road from (x0, z0) to (x1, z1), along x or z. `right`/`left`: lanes for traffic going from 0 to 1 and back.
// Rect: the road's extent as [minX, maxX, minZ, maxZ].
export function road(def) {
  const r = { median: 0, ...def };
  r.alongX = r.z0 === r.z1;
  r.width = (r.right + r.left) * LANE + r.median;
  r.dir = r.alongX ? [Math.sign(r.x1 - r.x0), 0] : [0, Math.sign(r.z1 - r.z0)];
  // Across the road (world x for a road along z, z for one along x): the divider, and which way is right of travel
  r.mid = r.alongX ? r.z0 : r.x0;
  r.rs = r.alongX ? rightOf(...r.dir)[1] : rightOf(...r.dir)[0];
  const a = r.mid + r.rs * (r.right * LANE + r.median / 2), b = r.mid - r.rs * (r.left * LANE + r.median / 2);
  const lo = Math.min(a, b), hi = Math.max(a, b);
  r.rect = r.alongX ? [Math.min(r.x0, r.x1), Math.max(r.x0, r.x1), lo, hi] : [lo, hi, Math.min(r.z0, r.z1), Math.max(r.z0, r.z1)];
  r.lo = lo; r.hi = hi;
  return r;
}
// The centre of lane `i` (0 = nearest the middle) on side `side` (1: travelling from 0 to 1, -1: back)
export function laneOffset(r, side, i) { return side * (r.median / 2 + (i + 0.5) * LANE); }
// Right of a direction of travel (dx, dz): driving on the right
export const rightOf = (dx, dz) => [-dz, dx];

export class City {
  constructor(scene, level) {
    this.scene = scene;
    this.level = level;
    this.group = new THREE.Group();
    this.wet = false;
    this.trees = [];
    this.roads = level.roads.map(road);
    this.base = level.height || (() => 0);
    this.ramps = level.ramps || [];
    this.water = level.water || null;
    this.blocks = [];
    this.grid = new Map();
    this.rand = rng(level.seed || 7);
    this.lit = [];
    this.buildRoads();
    this.buildBlocks();
    this.buildGround();
    if (this.water) this.buildWater();
    for (const r of this.ramps) this.group.add(rampMesh(r, this.base(r.x, r.z)));
    scene.add(this.group);
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(o => {
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      for (const m of [o.material || []].flat()) { m.map?.dispose(); m.dispose(); }
    });
  }

  // ---------- Shape ----------
  isRoad(x, z) {
    for (const r of this.roads) { const [a, b, c, d] = r.rect; if (x >= a && x <= b && z >= c && z <= d) return true; }
    return false;
  }
  // How far (x, z) is from the nearest road edge (negative on a road)
  roadDist(x, z) {
    let best = Infinity;
    for (const r of this.roads) {
      const [a, b, c, d] = r.rect;
      const dx = Math.max(a - x, x - b), dz = Math.max(c - z, z - d);
      best = Math.min(best, Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0));
    }
    return best;
  }

  groundHeight(x, z) {
    if (this.water && this.water.below(x, z)) return this.water.floor;
    let h = this.base(x, z) + (this.isRoad(x, z) ? 0 : CURB);
    for (const r of this.ramps) {
      if (Math.abs(x - r.x) > r.w / 2) continue;
      const t = (r.z - z) / r.len;   // 0 at the foot, 1 at the lip (ramps face -z)
      if (t > 0 && t < 1) h = Math.max(h, this.base(x, z) + r.h * t);
    }
    return h;
  }
  groundNormal(x, z, out = new THREE.Vector3()) {
    const e = 0.35;
    const dx = this.groundHeight(x + e, z) - this.groundHeight(x - e, z), dz = this.groundHeight(x, z + e) - this.groundHeight(x, z - e);
    return out.set(-dx, 2 * e, -dz).normalize();
  }
  surfaceGrip() { return 1; }
  onRoad() { return true; }

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

  // Buildings near (x, z)
  near(x, z) { return this.grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || EMPTY; }
  // Signed distance from (x, z) to a block's footprint, and the outward normal
  blockDist(b, x, z, n) {
    const qx = Math.abs(x - b.x) - b.w / 2, qz = Math.abs(z - b.z) - b.d / 2;
    if (qx > qz) n.set(Math.sign(x - b.x), 0, 0); else n.set(0, 0, Math.sign(z - b.z));
    return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
  }

  // Buildings are solid: push the car's corners out, bouncing it off with some spin and scrape
  contain(car) {
    let worst = 0;
    const s = car.spec.size || [1.9, 4.4];
    const hw = s[0] / 2, hl = s[1] / 2;
    const list = this.near(car.pos.x, car.pos.z);
    if (!list.length) return 0;
    for (const [x, z] of CORNERS) {
      _p.set(x * hw, 0, z * hl).applyQuaternion(car.q).add(car.pos);
      for (const b of list) {
        if (_p.y > b.top) continue;
        const d = this.blockDist(b, _p.x, _p.z, _n);
        if (d > 0) continue;
        _r.subVectors(_p, car.pos);
        _pv.crossVectors(car.w, _r).add(car.vel);
        const vn = _pv.dot(_n);
        car.pos.addScaledVector(_n, -d * 0.9);
        if (vn >= 0) continue;
        const k = 1 / car.mass + _n.dot(_t2.crossVectors(car.invInertia(_t1.crossVectors(_r, _n), _J), _r));
        const j = -1.3 * vn / k;
        _J.copy(_n).multiplyScalar(j);
        _vt.copy(_pv).addScaledVector(_n, -vn);
        const vtl = _vt.length();
        if (vtl > 1e-3) _J.addScaledVector(_vt, -Math.min(vtl / k, 0.3 * j) / vtl);
        car.applyImpulse(_r, _J);
        if (-vn > worst) { worst = -vn; car.wallHit = { point: _p.clone(), normal: _n.clone(), speed: -vn, impulse: j }; }
      }
    }
    return worst;
  }

  // ---------- Roads ----------
  buildRoads() {
    const asphalt = addDetail(new THREE.MeshLambertMaterial({ color: '#ffffff', map: null }), { fine: 0.6, strength: 0.22, coarse: 0.04, coarseStrength: 0.2 });
    for (const r of this.roads) {
      const tex = markingTexture(r);
      const mat = asphalt.clone();
      mat.map = tex;
      mat.onBeforeCompile = asphalt.onBeforeCompile;
      mat.customProgramCacheKey = asphalt.customProgramCacheKey;
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = -1;
      const geo = this.strip(r.rect, r.alongX, 0.0, (u, v) => [u, v / 12]);
      const m = new THREE.Mesh(geo, mat);
      m.receiveShadow = true;
      this.group.add(m);
    }
    // Junctions: plain asphalt where roads cross (no lane lines), with zebra crossings and stop lines on the way in
    const plain = new THREE.MeshLambertMaterial({ color: '#4a4c55', polygonOffset: true, polygonOffsetFactor: -2 });
    this.junctions = [];
    for (let i = 0; i < this.roads.length; i++) for (let j = i + 1; j < this.roads.length; j++) {
      const a = this.roads[i].rect, b = this.roads[j].rect;
      const box = [Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.min(a[3], b[3])];
      if (box[0] >= box[1] || box[2] >= box[3]) continue;
      this.junctions.push(box);
      this.group.add(new THREE.Mesh(this.strip(box, true, 0.005), plain));
      // Crossings on every side that a road leaves from
      const zebra = [];
      for (const r of [this.roads[i], this.roads[j]]) {
        const [x0, x1, z0, z1] = r.rect;
        if (r.alongX) {
          for (const [edge, out] of [[box[0], -1], [box[1], 1]]) {
            if ((out < 0 && x0 >= edge - 1) || (out > 0 && x1 <= edge + 1)) continue;
            for (let z = box[2] + 0.6; z < box[3] - 0.5; z += 1.2) zebra.push([edge + out * 2.2, z, 2.8, 0.6]);
            zebra.push([edge + out * 4.2, (box[2] + box[3]) / 2, 0.5, box[3] - box[2] - 0.4]);
          }
        } else {
          for (const [edge, out] of [[box[2], -1], [box[3], 1]]) {
            if ((out < 0 && z0 >= edge - 1) || (out > 0 && z1 <= edge + 1)) continue;
            for (let x = box[0] + 0.6; x < box[1] - 0.5; x += 1.2) zebra.push([x, edge + out * 2.2, 0.6, 2.8]);
            zebra.push([(box[0] + box[1]) / 2, edge + out * 4.2, box[1] - box[0] - 0.4, 0.5]);
          }
        }
      }
      const parts = zebra.map(([x, z, w, d]) => [this.strip([x - w / 2, x + w / 2, z - d / 2, z + d / 2], true, 0.012), '#ffffff']);
      if (parts.length) this.group.add(new THREE.Mesh(merge(parts), new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -3 })));
    }
  }

  // A flat strip following the ground over rect [x0, x1, z0, z1], `lift` above the base height.
  // uv(u across 0..1, metres along) gives texture coordinates.
  strip(rect, alongX, lift, uv = (u, v) => [u, v]) {
    const [x0, x1, z0, z1] = rect;
    const len = alongX ? x1 - x0 : z1 - z0;
    const n = Math.max(1, Math.ceil(len / 4));
    const P = [], U = [], I = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      for (let k = 0; k <= 1; k++) {
        const x = alongX ? x0 + t * (x1 - x0) : (k ? x1 : x0), z = alongX ? (k ? z1 : z0) : z0 + t * (z1 - z0);
        P.push(x, this.base(x, z) + lift, z);
        U.push(...uv(k, t * len));
      }
      if (i) { const a = (i - 1) * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setIndex(alongX ? I : I.map((_, i) => I[i - (i % 3) + [0, 2, 1][i % 3]]));
    g.computeVertexNormals();
    return g;
  }

  // ---------- Pavements and buildings ----------
  // Along each side of each road, a pavement and then a row of buildings, except where another road crosses
  buildBlocks() {
    const rand = this.rand, L = this.level;
    const walk = [], curb = [];
    const free = (r, side) => {
      // Stretches along this side of the road not crossed by another road (or left open by the level)
      const [x0, x1, z0, z1] = r.rect;
      let iv = [[r.alongX ? x0 : z0, r.alongX ? x1 : z1]];
      for (const o of this.roads) {
        if (o === r) continue;
        const [a, b, c, d] = o.rect;
        const lo = r.alongX ? a : c, hi = r.alongX ? b : d;
        // Does it reach this side?
        const edge = r.alongX ? (side > 0 ? z1 : z0) : (side > 0 ? x1 : x0);
        const s0 = r.alongX ? c : a, s1 = r.alongX ? d : b;
        if (!(s0 <= edge + 0.1 && s1 >= edge - 0.1) && !(side > 0 ? s0 >= edge - 0.1 && s0 < edge + WALK : s1 <= edge + 0.1 && s1 > edge - WALK)) continue;
        iv = iv.flatMap(([p, q]) => (hi <= p || lo >= q ? [[p, q]] : [[p, lo], [hi, q]].filter(([u, v]) => v - u > 0.5)));
      }
      return iv;
    };
    const blocks = [];
    for (const r of this.roads) {
      for (const side of [-1, 1]) {
        for (const [p, q] of free(r, side)) {
          const [x0, x1, z0, z1] = r.rect;
          // Pavement
          const e = r.alongX ? (side > 0 ? z1 : z0) : (side > 0 ? x1 : x0);
          const rect = r.alongX ? [p, q, Math.min(e, e + side * WALK), Math.max(e, e + side * WALK)] : [Math.min(e, e + side * WALK), Math.max(e, e + side * WALK), p, q];
          walk.push(rect);
          curb.push([r, side, p, q, e]);
          // Buildings (not on an open side, like a quay)
          if (r.open?.includes(side)) continue;
          let s = p + (p > (r.alongX ? x0 : z0) + 1 ? WALK : 0);
          const end = q - (q < (r.alongX ? x1 : z1) - 1 ? WALK : 0);
          while (s < end - 4) {
            const w = Math.min(end - s, 12 + rand() * 18);
            const d = 14 + rand() * 12, h = (L.tall || 10) + rand() * (L.tallVar || 24);
            const mid = s + w / 2, out = e + side * (WALK + d / 2);
            const b = r.alongX ? { x: mid, z: out, w: w - 0.6, d } : { x: out, z: mid, w: d, d: w - 0.6 };
            b.h = h;
            blocks.push(b);
            s += w;
          }
        }
      }
    }
    for (const b of L.blocks || []) blocks.push({ ...b });
    // Buildings never overlap a road (where two rows meet at a corner, the later one is trimmed away)
    for (const b of blocks) {
      if (this.roadDist(b.x, b.z) < Math.min(b.w, b.d) / 2 + 0.5 && !b.fixed) continue;
      if (this.blocks.some(o => Math.abs(o.x - b.x) < (o.w + b.w) / 2 - 0.3 && Math.abs(o.z - b.z) < (o.d + b.d) / 2 - 0.3)) continue;
      b.y = Math.min(...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([i, k]) => this.base(b.x + i * b.w / 2, b.z + k * b.d / 2))) - 1;
      b.top = b.y + b.h + 1;
      this.blocks.push(b);
      const [a, c] = [Math.floor((b.x - b.w / 2) / CELL), Math.floor((b.x + b.w / 2) / CELL)];
      const [e, f] = [Math.floor((b.z - b.d / 2) / CELL), Math.floor((b.z + b.d / 2) / CELL)];
      for (let i = a - 1; i <= c + 1; i++) for (let k = e - 1; k <= f + 1; k++) {
        const key = i + ',' + k;
        if (!this.grid.has(key)) this.grid.set(key, []);
        this.grid.get(key).push(b);
      }
    }
    this.walks = walk;
    // Meshes: pavements (with a curb face), then the buildings in one merged mesh
    const paveParts = [];
    for (const rect of walk) paveParts.push([this.strip(rect, rect[1] - rect[0] > rect[3] - rect[2], CURB), '#c9c2b4']);
    for (const [r, side, p, q, e] of curb) {
      const P = [];
      const n = Math.max(1, Math.ceil((q - p) / 4));
      for (let i = 0; i < n; i++) {
        const a = p + (q - p) * i / n, b = p + (q - p) * (i + 1) / n;
        const pt = (s, y) => (r.alongX ? [s, this.base(s, e) + y, e] : [e, this.base(e, s) + y, s]);
        const A = pt(a, 0), B = pt(b, 0), C = pt(b, CURB), D = pt(a, CURB);
        P.push(...A, ...B, ...C, ...A, ...C, ...D);
      }
      const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      paveParts.push([g, '#9d978c']);
    }
    for (const part of paveParts) if (!part[0].attributes.normal) part[0].computeVertexNormals();
    const pave = new THREE.Mesh(merge(paveParts.map(([g, c]) => [g.index ? g.toNonIndexed() : g, c])),
      addDetail(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), { fine: 0.8, strength: 0.18, coarse: 0.05, coarseStrength: 0.12 }));
    pave.receiveShadow = true;
    this.group.add(pave);
    this.group.add(buildingMesh(this.blocks, rand, L.palette));
  }

  // The ground between buildings and around the edges: pavement height, lowered under the roads
  buildGround() {
    const B = this.level.bounds;
    const [x0, x1, z0, z1] = B, step = 4;
    const nx = Math.ceil((x1 - x0) / step), nz = Math.ceil((z1 - z0) / step);
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const pos = g.attributes.position, col = [];
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const under = this.roadDist(x, z) < 2.8;
      const wet = this.water && this.water.below(x, z);
      pos.setY(i, wet ? this.water.floor : this.base(x, z) + (under ? -0.4 : CURB - 0.03));
      c.set(wet ? '#3a5a5a' : this.level.groundColour || '#b9b2a2');
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, addDetail(new THREE.MeshLambertMaterial({ vertexColors: true }), { fine: 0.7, strength: 0.15 }));
    m.receiveShadow = true;
    this.group.add(m);
  }

  buildWater() {
    const W = this.water;
    const [x0, x1, z0, z1] = W.rect;
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, W.y, (z0 + z1) / 2);
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#2f7fa8', transparent: true, opacity: 0.85 }));
    this.group.add(m);
    // The quay wall
    const q = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, CURB - W.floor, 1).translate((x0 + x1) / 2, (CURB + W.floor) / 2, W.edge - 0.5), new THREE.MeshLambertMaterial({ color: '#8a8478' }));
    q.receiveShadow = true;
    this.group.add(q);
  }
}
const EMPTY = [];

// A plank kicker in yellow and black, its lip toward -z
function rampMesh(r, y) {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(r.len, r.h); s.lineTo(r.len, 0); s.lineTo(0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: r.w, bevelEnabled: false });
  g.rotateY(Math.PI / 2);          // length along -z
  g.translate(r.x - r.w / 2, y + 0.01, r.z);
  const stripes = document.createElement('canvas');
  stripes.width = stripes.height = 64;
  const c = stripes.getContext('2d');
  c.fillStyle = '#ffcf2e'; c.fillRect(0, 0, 64, 64);
  c.fillStyle = '#222'; for (let i = -64; i < 64; i += 32) { c.beginPath(); c.moveTo(i, 64); c.lineTo(i + 16, 64); c.lineTo(i + 80, 0); c.lineTo(i + 64, 0); c.fill(); }
  const t = new THREE.CanvasTexture(stripes);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(0.5, 0.5);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: t }));
  m.castShadow = m.receiveShadow = true;
  return m;
}
const CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1], [-1, 0], [1, 0]];

// Lane lines for a road: edges solid, a double line down the middle, dashes between lanes (12 m repeat)
function markingTexture(r) {
  const W = 512, H = 128;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#4c4e57';
  g.fillRect(0, 0, W, H);
  // Texture u runs across the road from its low edge (in world x or z) to its high one; `off` is measured
  // from the divider toward the right of travel
  const px = m => (m / r.width) * W;
  const at = off => px(r.mid + r.rs * off - r.lo);
  const lanes = [];
  for (let i = 0; i < r.left; i++) lanes.push(-laneOffset(r, 1, i));
  for (let i = 0; i < r.right; i++) lanes.push(laneOffset(r, 1, i));
  g.fillStyle = 'rgba(30,30,36,0.25)';
  for (const c of lanes) for (const s of [-0.85, 0.85]) g.fillRect(at(c + s) - px(0.35), 0, px(0.7), H);
  g.fillStyle = '#f2f2ee';
  const line = (off, dash) => {
    const w = Math.max(3, px(0.15));
    if (!dash) g.fillRect(at(off) - w / 2, 0, w, H);
    else g.fillRect(at(off) - w / 2, 0, w, H * 0.35);
  };
  line(-(r.left * LANE + r.median / 2) + 0.3);
  line(r.right * LANE + r.median / 2 - 0.3);
  if (r.median) {
    g.fillStyle = '#7a7466';
    g.fillRect(Math.min(at(-r.median / 2), at(r.median / 2)), 0, px(r.median), H);
    g.fillStyle = '#f2f2ee';
  } else {
    g.fillStyle = '#ffd23a';
    line(-0.15); line(0.15);
    g.fillStyle = '#f2f2ee';
  }
  for (let i = 1; i < r.right; i++) line(r.median / 2 + i * LANE, true);
  for (let i = 1; i < r.left; i++) line(-(r.median / 2 + i * LANE), true);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Building fronts: rows of windows over a shop floor, tinted per building
const facade = (() => {
  let tex = null;
  return () => {
    if (tex) return tex;
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 128;
    const g = cv.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 128, 128);
    // One bay, one floor: a window with a sill
    g.fillStyle = '#7f9bb8';
    g.fillRect(28, 26, 72, 70);
    g.fillStyle = '#b8d0e6';
    g.fillRect(28, 26, 72, 20);
    g.fillStyle = '#e6e2da';
    g.fillRect(22, 96, 84, 8);
    tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  };
})();

function buildingMesh(blocks, rand, palette = ['#e9a77a', '#f2d48a', '#a9c7a0', '#e8e0d0', '#c9a0b8', '#9fb8d8', '#f0b8a0', '#d8c8a8']) {
  const P = [], N = [], U = [], C = [];
  const c = new THREE.Color();
  const BAY = 4, FLOOR = 3.6;
  for (const b of blocks) {
    c.set(palette[Math.floor(rand() * palette.length)]);
    const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2, y0 = b.y, y1 = b.y + b.h + 1;
    const quad = (a, bb, cc, d, n, uw, vh, col) => {
      for (const [p, uv] of [[a, [0, 0]], [bb, [uw, 0]], [cc, [uw, vh]], [a, [0, 0]], [cc, [uw, vh]], [d, [0, vh]]]) {
        P.push(...p); N.push(...n); U.push(...uv); C.push(col.r, col.g, col.b);
      }
    };
    const fh = (y1 - y0) / FLOOR;
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], b.w / BAY, fh, c);
    quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], b.w / BAY, fh, c);
    quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], b.d / BAY, fh, c);
    quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], b.d / BAY, fh, c);
    const roof = c.clone().multiplyScalar(0.7);
    // The roof samples the plain wall between windows
    const r0 = [0.05, 0.05];
    for (const p of [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z1], [x1, y1, z0], [x0, y1, z0]]) { P.push(...p); N.push(0, 1, 0); U.push(...r0); C.push(roof.r, roof.g, roof.b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, map: facade() }));
  m.castShadow = m.receiveShadow = true;
  return m;
}

export { rng };
