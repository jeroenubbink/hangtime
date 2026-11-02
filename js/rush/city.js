// Rushtime's streets. Roads are straight strips at any angle; everything off the road is pavement a curb higher,
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

// A road from (x0, z0) to (x1, z1), in any direction. `right`/`left`: lanes for traffic going from 0 to 1 and
// back. Positions on it are (u, v): u metres along from (x0, z0), v metres across toward the right of travel
// (v < 0 is the left side). Rect: its bounding box as [minX, maxX, minZ, maxZ].
export function road(def) {
  const r = { median: 0, ...def };
  const ex = r.x1 - r.x0, ez = r.z1 - r.z0;
  r.len = Math.hypot(ex, ez);
  r.dir = [ex / r.len, ez / r.len];
  r.rv = rightOf(...r.dir);
  r.ang = Math.atan2(r.dir[1], r.dir[0]);
  r.axis = Math.abs(r.dir[0]) < 1e-6 || Math.abs(r.dir[1]) < 1e-6;
  r.width = (r.right + r.left) * LANE + r.median;
  r.vHi = r.right * LANE + r.median / 2;
  r.vLo = -(r.left * LANE + r.median / 2);
  r.at = (u, v) => [r.x0 + r.dir[0] * u + r.rv[0] * v, r.z0 + r.dir[1] * u + r.rv[1] * v];
  r.local = (x, z) => { const px = x - r.x0, pz = z - r.z0; return [px * r.dir[0] + pz * r.dir[1], px * r.rv[0] + pz * r.rv[1]]; };
  r.poly = [[0, r.vLo], [r.len, r.vLo], [r.len, r.vHi], [0, r.vHi]].map(([u, v]) => r.at(u, v));
  const xs = r.poly.map(p => p[0]), zs = r.poly.map(p => p[1]);
  r.rect = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  return r;
}
// The centre of lane `i` (0 = nearest the middle) on side `side` (1: travelling from 0 to 1, -1: back), as v
export function laneOffset(r, side, i) { return side * (r.median / 2 + (i + 0.5) * LANE); }
// Right of a direction of travel (dx, dz): driving on the right
export const rightOf = (dx, dz) => [-dz, dx];

// Where two convex polygons overlap (Sutherland-Hodgman), as a polygon
function clip(subject, by) {
  let out = subject;
  for (let i = 0; i < by.length && out.length; i++) {
    const [ax, az] = by[i], [bx, bz] = by[(i + 1) % by.length];
    // `by` may wind either way: keep the side its centre is on
    const cx = by.reduce((s, p) => s + p[0], 0) / by.length, cz = by.reduce((s, p) => s + p[1], 0) / by.length;
    const side = (x, z) => (bx - ax) * (z - az) - (bz - az) * (x - ax);
    const k = Math.sign(side(cx, cz));
    const inside = p => side(p[0], p[1]) * k >= -1e-6;
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const P = input[j], Q = input[(j + 1) % input.length];
      const pin = inside(P), qin = inside(Q);
      if (pin) out.push(P);
      if (pin !== qin) {
        const sp = side(P[0], P[1]), sq = side(Q[0], Q[1]), t = sp / (sp - sq);
        out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]);
      }
    }
  }
  return out;
}
const area = poly => Math.abs(poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;

// Two buildings' footprints (rotated boxes) overlap, allowing them to touch by `slack`
function overlaps(a, b, slack = 0.3) {
  for (const [nx, nz] of [[a.ca, a.sa], [-a.sa, a.ca], [b.ca, b.sa], [-b.sa, b.ca]]) {
    const ext = o => Math.abs(o.w / 2 * (o.ca * nx + o.sa * nz)) + Math.abs(o.d / 2 * (-o.sa * nx + o.ca * nz));
    if (Math.abs((b.x - a.x) * nx + (b.z - a.z) * nz) > ext(a) + ext(b) - slack) return false;
  }
  return true;
}

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
    for (const r of this.roads) {
      const [a, b, c, d] = r.rect;
      if (x < a || x > b || z < c || z > d) continue;
      const px = x - r.x0, pz = z - r.z0, u = px * r.dir[0] + pz * r.dir[1], v = px * r.rv[0] + pz * r.rv[1];
      if (u >= 0 && u <= r.len && v >= r.vLo && v <= r.vHi) return true;
    }
    return false;
  }
  // How far (x, z) is from the nearest road edge (negative on a road)
  roadDist(x, z) {
    let best = Infinity;
    for (const r of this.roads) {
      const px = x - r.x0, pz = z - r.z0, u = px * r.dir[0] + pz * r.dir[1], v = px * r.rv[0] + pz * r.rv[1];
      const du = Math.max(-u, u - r.len), dv = Math.max(r.vLo - v, v - r.vHi);
      best = Math.min(best, Math.hypot(Math.max(du, 0), Math.max(dv, 0)) + Math.min(Math.max(du, dv), 0));
    }
    return best;
  }
  // In one of the level's lots (a forecourt, a car park): paved, and no buildings
  inLot(x, z, m = 0) {
    for (const { rect: [a, b, c, d] } of this.level.lots || []) if (x > a - m && x < b + m && z > c - m && z < d + m) return true;
    return false;
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
    const ex = x - b.x, ez = z - b.z, lx = ex * b.ca + ez * b.sa, lz = -ex * b.sa + ez * b.ca;
    const qx = Math.abs(lx) - b.w / 2, qz = Math.abs(lz) - b.d / 2;
    if (qx > qz) { const k = Math.sign(lx); n.set(k * b.ca, 0, k * b.sa); } else { const k = Math.sign(lz); n.set(-k * b.sa, 0, k * b.ca); }
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
    this.roads.forEach((r, i) => {
      const tex = markingTexture(r);
      const mat = asphalt.clone();
      mat.map = tex;
      mat.onBeforeCompile = asphalt.onBeforeCompile;
      mat.customProgramCacheKey = asphalt.customProgramCacheKey;
      mat.polygonOffset = true;
      // (where a road branches off another at an angle, the later one's paint lies over the earlier's)
      mat.polygonOffsetFactor = -1 - i * 0.25;
      mat.polygonOffsetUnits = -i;
      const m = new THREE.Mesh(this.band(r, 0, r.len, r.vLo, r.vHi, 0, (k, u) => [k, u / 12]), mat);
      m.receiveShadow = true;
      this.group.add(m);
    });
    // Junctions: plain asphalt where roads meet (no lane lines); where two cross square-on, zebra crossings and
    // stop lines on the way in
    const plain = new THREE.MeshLambertMaterial({ color: '#4a4c55', polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 });
    this.junctions = [];
    for (let i = 0; i < this.roads.length; i++) for (let j = i + 1; j < this.roads.length; j++) {
      const A = this.roads[i], B = this.roads[j];
      const poly = clip(A.poly, B.poly);
      if (poly.length < 3 || area(poly) < 1) continue;
      const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
      const box = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
      const square = A.axis && B.axis && Math.abs(A.dir[0] * B.dir[0] + A.dir[1] * B.dir[1]) < 1e-6;
      this.junctions.push({ box, poly, square });
      if (!square) continue;
      this.group.add(new THREE.Mesh(this.patch(poly, 0.005), plain));
      // Crossings on every side that a road leaves from
      const zebra = [];
      for (const r of [A, B]) {
        const [x0, x1, z0, z1] = r.rect, alongX = r.dir[1] === 0;
        if (alongX) {
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
      const parts = zebra.map(([x, z, w, d]) => [this.patch([[x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x + w / 2, z + d / 2], [x - w / 2, z + d / 2]], 0.012), '#ffffff']);
      if (parts.length) this.group.add(new THREE.Mesh(merge(parts), new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -3 })));
    }
  }

  // A strip of road r from u0 to u1 along it and v0 to v1 across, following the ground `lift` above the base
  // height. uv(k: 0 at v0 and 1 at v1, metres along) gives texture coordinates.
  band(r, u0, u1, v0, v1, lift, uv = (k, u) => [k, u]) {
    const n = Math.max(1, Math.ceil((u1 - u0) / 4));
    const P = [], U = [], I = [];
    for (let i = 0; i <= n; i++) {
      const u = u0 + (u1 - u0) * i / n;
      for (let k = 0; k <= 1; k++) {
        const [x, z] = r.at(u, k ? v1 : v0);
        P.push(x, this.base(x, z) + lift, z);
        U.push(...uv(k, u - u0));
      }
      if (i) { const a = (i - 1) * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    return faceUp(P, U, I);
  }
  // A flat polygon on the ground
  patch(poly, lift) {
    const P = [], I = [];
    for (const [x, z] of poly) P.push(x, this.base(x, z) + lift, z);
    for (let i = 1; i < poly.length - 1; i++) I.push(0, i, i + 1);
    return faceUp(P, poly.flatMap(([x, z]) => [x / 4, z / 4]), I);
  }

  // ---------- Pavements and buildings ----------
  // Along each side of each road, a pavement and then a row of buildings, except where another road meets it
  buildBlocks() {
    const rand = this.rand, L = this.level;
    const walk = [], curb = [], blocks = [];
    for (const r of this.roads) {
      for (const side of [-1, 1]) {
        const e = side > 0 ? r.vHi : r.vLo;
        // Stretches along this side where the pavement isn't on another road (found to a few centimetres)
        const clearAt = u => [0.3, WALK / 2, WALK - 0.3].every(d => !this.isRoad(...r.at(u, e + side * d)));
        const edgeBetween = (a, b) => { for (let k = 0; k < 7; k++) { const m = (a + b) / 2; if (clearAt(m) === clearAt(a)) a = m; else b = m; } return (a + b) / 2; };
        const free = [];
        let open = clearAt(0) ? 0 : null;
        for (let u = 1; u <= Math.ceil(r.len); u++) {
          const uu = Math.min(u, r.len), c = clearAt(uu);
          if (c && open == null) open = edgeBetween(uu - 1, uu);
          else if (!c && open != null) { const q = edgeBetween(uu - 1, uu); if (q - open > 0.5) free.push([open, q]); open = null; }
        }
        if (open != null && r.len - open > 0.5) free.push([open, r.len]);
        for (const [p, q] of free) {
          walk.push(this.band(r, p, q, side > 0 ? e : e - WALK, side > 0 ? e + WALK : e, CURB));
          curb.push([r, e, p, q]);
          // Buildings (not on an open side, like a quay)
          if (r.open?.includes(side)) continue;
          let s = p + (p > 1 ? WALK : 0);
          const end = q - (q < r.len - 1 ? WALK : 0);
          while (s < end - 4) {
            const w = Math.min(end - s, 12 + rand() * 18), d = 14 + rand() * 12;
            const [x, z] = r.at(s + w / 2, e + side * (WALK + d / 2));
            blocks.push({ x, z, w: w - 0.6, d, ang: r.ang, ...style(rand, L) });
            s += w;
          }
        }
      }
    }
    for (const b of L.blocks || []) blocks.push({ type: 'hall', ...b });
    for (const b of blocks) { b.ca = Math.cos(b.ang || 0); b.sa = Math.sin(b.ang || 0); }
    const fixed = blocks.filter(b => b.fixed);
    // Buildings never stand on a road, a pavement or a lot, nor in each other (where two rows meet at a corner,
    // the later one is left out; the level's own always stand, and the street's make way for them)
    for (const b of blocks) {
      const pts = [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0], [0, 0]].map(([i, k]) => {
        const lx = i * b.w / 2, lz = k * b.d / 2;
        return [b.x + lx * b.ca - lz * b.sa, b.z + lx * b.sa + lz * b.ca];
      });
      if (!b.fixed && (pts.some(([x, z]) => this.roadDist(x, z) < WALK - 0.6 || this.inLot(x, z, 1)) || fixed.some(o => overlaps(o, b)))) continue;
      if (this.blocks.some(o => overlaps(o, b))) continue;
      b.y = Math.min(...pts.slice(0, 4).map(([x, z]) => this.base(x, z))) - 1;
      b.top = b.y + b.h + 1;
      this.blocks.push(b);
      const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
      const [a, c] = [Math.floor(Math.min(...xs) / CELL), Math.floor(Math.max(...xs) / CELL)];
      const [e, f] = [Math.floor(Math.min(...zs) / CELL), Math.floor(Math.max(...zs) / CELL)];
      for (let i = a - 1; i <= c + 1; i++) for (let k = e - 1; k <= f + 1; k++) {
        const key = i + ',' + k;
        if (!this.grid.has(key)) this.grid.set(key, []);
        this.grid.get(key).push(b);
      }
    }
    // Neighbours whose cornices and ledges reach over each other stand a few centimetres apart in height, so
    // their overhangs never share a plane (and flicker). (Buildings start a metre underground: it doesn't show.)
    for (const b of this.blocks) {
      const used = new Set(this.blocks.filter(o => o !== b && o.lift != null && overlaps(o, b, -1.5)).map(o => o.lift));
      b.lift = [0, 1, 2, 3].find(k => !used.has(k)) ?? 0;
      b.y += b.lift * 0.17;
      b.top += b.lift * 0.17;
    }
    // Meshes: pavements (with a curb face) and lots, then the buildings
    const paveParts = walk.map(g => [g, '#c9c2b4']);
    for (const lot of L.lots || []) {
      const [a, b, c, d] = lot.rect;
      paveParts.push([this.patch([[a, c], [b, c], [b, d], [a, d]], CURB + 0.04), lot.colour || '#bdb8ae']);
    }
    for (const [r, e, p, q] of curb) {
      const P = [];
      const n = Math.max(1, Math.ceil((q - p) / 4));
      for (let i = 0; i < n; i++) {
        const pt = (u, y) => { const [x, z] = r.at(u, e); return [x, this.base(x, z) + y, z]; };
        const a = p + (q - p) * i / n, b = p + (q - p) * (i + 1) / n;
        const A = pt(a, 0), B = pt(b, 0), C = pt(b, CURB), D = pt(a, CURB);
        P.push(...A, ...B, ...C, ...A, ...C, ...D);
      }
      const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.computeVertexNormals();
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
  // Texture u runs across the road from its left edge to its right; `off` is measured from the divider toward
  // the right of travel
  const px = m => (m / r.width) * W;
  const at = off => px(off - r.vLo);
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

// A geometry from positions, uvs and triangles, turned to face up
function faceUp(P, U, I) {
  if (I.length >= 3) {
    const v = k => new THREE.Vector3(P[I[k] * 3], P[I[k] * 3 + 1], P[I[k] * 3 + 2]);
    const a = v(0), n = new THREE.Vector3().crossVectors(v(1).sub(a), v(2).sub(a));
    if (n.y < 0) for (let i = 0; i < I.length; i += 3) [I[i + 1], I[i + 2]] = [I[i + 2], I[i + 1]];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  g.computeVertexNormals();
  return g;
}

// ---------- Buildings ----------
// Two kinds, mixed along every street. Brick walk-ups: three to five floors over a shop, a cornice on top and
// often a water tank. Towers, in the spirit of a toy-town Manhattan: a stone shop floor, a ledge, a shaft of
// big windows between piers, a heavy cornice, and the tallest stepping back in tiers to a crown.
const FLOOR = 3.3, SHOP = 4.4, BAY = 4;
const TOWER = ['#efe3cf', '#e3d3b2', '#d4d8dc', '#e8bf98', '#c2d0dc', '#f2e6c8', '#d9b48c', '#b8c8b0', '#e6c8c0'];
const STONE = ['#f2ece0', '#ddd6c8', '#c9c2b4'];
const SHOPS = ['#d94a3a', '#2f7f6f', '#3a5fa8', '#e0a030', '#7a4a8a', '#2f6f9f', '#c2603a'];
function style(rand, L) {
  const t = rand(), lower = L.lower || 1;
  if (t < 0.45) {
    const floors = 2 + Math.floor(rand() * 3);
    return { type: 'walkup', h: SHOP + floors * FLOOR + 0.6, brick: Math.floor(rand() * 2), tank: rand() < 0.5 };
  }
  if (t < 0.87) return { type: 'tower', h: (15 + rand() * 13) * lower, tank: rand() < 0.3 };
  return { type: 'tower', h: (30 + rand() * 16) * lower, tiers: true };
}

// Window, brick and shop-front tiles, one bay wide and one floor high
function tile(draw) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  draw(cv.getContext('2d'));
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function glass(g, x, y, w, h) {
  const gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, '#9cc4e4'); gr.addColorStop(0.45, '#4f7aa6'); gr.addColorStop(1, '#2c4c74');
  g.fillStyle = gr;
  g.fillRect(x, y, w, h);
}
const TILES = {};
function tiles() {
  if (TILES.office) return TILES;
  // Big windows between piers, a spandrel under each (tinted with the building; the glass isn't)
  TILES.office = tile(g => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#e4e4e4'; g.fillRect(0, 98, 128, 30);
    g.fillStyle = '#f6f6f6'; g.fillRect(0, 0, 12, 128); g.fillRect(116, 0, 12, 128);
    g.fillStyle = '#6a6f78'; g.fillRect(20, 14, 88, 84);
    glass(g, 24, 18, 80, 76);
    g.fillStyle = '#6a6f78'; g.fillRect(62, 18, 4, 76); g.fillRect(24, 40, 80, 3);
    g.fillStyle = '#ffffff'; g.fillRect(16, 96, 96, 5);
  });
  // Brick, two tall windows with white frames, stone lintels and sills (its own colours: not tinted)
  for (const [name, brick, dark] of [['brickA', '#b5523b', '#8e3e2c'], ['brickB', '#8d5a43', '#6a4130']]) {
    TILES[name] = tile(g => {
      g.fillStyle = brick; g.fillRect(0, 0, 128, 128);
      g.fillStyle = dark;
      for (let y = 0; y < 128; y += 8) {
        g.fillRect(0, y, 128, 1);
        for (let x = (y / 8) % 2 ? 0 : 8; x < 128; x += 16) g.fillRect(x, y, 1, 8);
      }
      for (const x of [16, 74]) {
        g.fillStyle = '#e8dfcf'; g.fillRect(x - 3, 12, 44, 7); g.fillRect(x - 4, 96, 46, 6);
        g.fillStyle = '#f4f1ea'; g.fillRect(x, 19, 38, 77);
        glass(g, x + 4, 23, 30, 69);
        g.fillStyle = '#f4f1ea'; g.fillRect(x + 4, 54, 30, 4);
      }
    });
  }
  // Shop front: piers, a striped awning, a big window over a kick plate
  TILES.shop = tile(g => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
    for (let x = 0; x < 128; x += 16) { g.fillStyle = (x / 16) % 2 ? '#ffffff' : '#c8c8c8'; g.fillRect(x, 10, 16, 20); }
    g.fillStyle = '#9a9a9a'; g.fillRect(0, 30, 128, 3);
    g.fillStyle = '#d0d0d0'; g.fillRect(0, 33, 10, 95); g.fillRect(118, 33, 10, 95);
    g.fillStyle = '#454a52'; g.fillRect(12, 38, 104, 76);
    glass(g, 15, 41, 98, 70);
    g.fillStyle = '#454a52'; g.fillRect(62, 41, 4, 70);
    g.fillStyle = '#8a8a8a'; g.fillRect(10, 114, 108, 14);
  });
  return TILES;
}
// Tinted by the vertex colour, except the glass (blue in the tile), which stays glass
function tinted(map) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, map });
  m.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <map_fragment>', 'vec4 texel = texture2D( map, vMapUv ); float glassy = smoothstep( 0.06, 0.16, texel.b - texel.r ); diffuseColor.rgb *= texel.rgb;')
      .replace('#include <color_fragment>', 'diffuseColor.rgb *= mix( vColor, vec3( 1.0 ), glassy );');
  };
  m.customProgramCacheKey = () => 'rush-facade';
  return m;
}

function buildingMesh(blocks, rand, palette = TOWER) {
  const T = tiles();
  const mats = [tinted(T.office), new THREE.MeshLambertMaterial({ vertexColors: true, map: T.brickA }),
    new THREE.MeshLambertMaterial({ vertexColors: true, map: T.brickB }), tinted(T.shop), new THREE.MeshLambertMaterial({ vertexColors: true })];
  const OFFICE = 0, SHOPM = 3, PLAIN = 4;
  const buf = mats.map(() => ({ P: [], N: [], U: [], C: [] }));
  const details = [];
  const white = new THREE.Color(1, 1, 1), _a = new THREE.Vector3(), _b = new THREE.Vector3();
  for (const b of blocks) {
    const W = (lx, lz) => [b.x + lx * b.ca - lz * b.sa, b.z + lx * b.sa + lz * b.ca];
    const tri = (o, p, q, r, n, uv, col) => {
      // keep the winding facing the normal
      _a.set(q[0] - p[0], q[1] - p[1], q[2] - p[2]); _b.set(r[0] - p[0], r[1] - p[1], r[2] - p[2]);
      const flip = _a.cross(_b).dot(new THREE.Vector3(...n)) < 0;
      const pts = flip ? [[p, uv[0]], [r, uv[2]], [q, uv[1]]] : [[p, uv[0]], [q, uv[1]], [r, uv[2]]];
      for (const [pt, u] of pts) { o.P.push(...pt); o.N.push(...n); o.U.push(...u); o.C.push(col.r, col.g, col.b); }
    };
    // A box in the building's frame: walls in `mat` (uv: bays across, floors up from `v0`), a plain roof
    const box = (cx, cz, w, d, y0, y1, mat, col, opt = {}) => {
      const o = buf[mat], fh = opt.fh || FLOOR, v0 = opt.v0 || 0;
      const cs = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, z]) => W(cx + x, cz + z));
      const [mx, mz] = W(cx, cz);
      for (let i = 0; i < 4; i++) {
        const p = cs[i], q = cs[(i + 1) % 4], len = Math.hypot(q[0] - p[0], q[1] - p[1]);
        let nx = (p[0] + q[0]) / 2 - mx, nz = (p[1] + q[1]) / 2 - mz;
        const nl = Math.hypot(nx, nz); nx /= nl; nz /= nl;
        const u1 = opt.flat ? 0.02 : len / BAY, va = opt.flat ? 0.02 : v0, vb = opt.flat ? 0.02 : v0 + (y1 - y0) / fh;
        const A = [p[0], y0, p[1]], B = [q[0], y0, q[1]], C = [q[0], y1, q[1]], D = [p[0], y1, p[1]];
        tri(o, A, B, C, [nx, 0, nz], [[0, va], [u1, va], [u1, vb]], col);
        tri(o, A, C, D, [nx, 0, nz], [[0, va], [u1, vb], [0, vb]], col);
      }
      if (opt.roof !== false) {
        const r = buf[PLAIN], rc = opt.roofCol || col.clone().multiplyScalar(0.72);
        const [A, B, C, D] = cs.map(([x, z]) => [x, y1, z]);
        tri(r, A, B, C, [0, 1, 0], [[0, 0], [0, 0], [0, 0]], rc);
        tri(r, A, C, D, [0, 1, 0], [[0, 0], [0, 0], [0, 0]], rc);
      }
    };
    const ledge = (w, d, y, h, out, col) => box(0, 0, w + out * 2, d + out * 2, y, y + h, PLAIN, col, { flat: true, roofCol: col.clone().multiplyScalar(0.85) });
    const g0 = b.y + 1, top = b.y + b.h + 1;
    const stone = new THREE.Color(STONE[Math.floor(rand() * STONE.length)]);
    const shopCol = new THREE.Color(SHOPS[Math.floor(rand() * SHOPS.length)]);
    let roofY = top, rw = b.w, rd = b.d;
    if (b.type === 'walkup') {
      const brick = 1 + (b.brick || 0), trim = new THREE.Color(rand() < 0.5 ? '#efe7d8' : '#5a4a42');
      box(0, 0, b.w, b.d, b.y, g0 + SHOP, SHOPM, shopCol, { fh: SHOP, v0: -1 / SHOP, roof: false });
      ledge(b.w, b.d, g0 + SHOP - 0.2, 0.35, 0.2, trim);
      box(0, 0, b.w, b.d, g0 + SHOP, top, brick, white, { roofCol: new THREE.Color('#77706a') });
      ledge(b.w, b.d, top - 0.5, 0.7, 0.45, trim);
    } else if (b.type === 'hall') {
      box(0, 0, b.w, b.d, b.y, top, OFFICE, new THREE.Color(palette[Math.floor(rand() * palette.length)]));
      ledge(b.w, b.d, top - 0.6, 0.9, 0.6, stone);
    } else {
      const col = new THREE.Color(palette[Math.floor(rand() * palette.length)]);
      // Shop floor in stone, a ledge, the shaft, a cornice
      box(0, 0, b.w + 0.24, b.d + 0.24, b.y, g0 + SHOP, SHOPM, shopCol, { fh: SHOP, v0: -1 / SHOP, roof: false });
      ledge(b.w, b.d, g0 + SHOP, 0.55, 0.35, stone);
      let y = g0 + SHOP + 0.55, w = b.w, d = b.d, h = top - y;
      // The tallest step back: a base block, then narrower tiers, then a crown
      const tiers = b.tiers && w > 13 && d > 13 ? [0.5, 0.3, 0.2] : [1];
      tiers.forEach((k, i) => {
        const y1 = y + h * k;
        box(0, 0, w, d, y, y1, OFFICE, col, { v0: (y - g0) / FLOOR });
        ledge(w, d, y1 - 0.2, i === tiers.length - 1 ? 0.9 : 0.6, i === tiers.length - 1 ? 0.6 : 0.4, stone);
        y = y1 + (i === tiers.length - 1 ? 0.7 : 0.4);
        if (i < tiers.length - 1) { w -= Math.min(5, w * 0.22); d -= Math.min(5, d * 0.22); }
      });
      if (tiers.length > 1) box(0, 0, w * 0.45, d * 0.45, y, y + 3.5, PLAIN, stone);
      roofY = y; rw = w; rd = d;
    }
    // On the roof: a water tank on stilts, or plant
    if (b.tank || rand() < 0.35) {
      const lx = (rand() - 0.5) * Math.max(0, rw - 5), lz = (rand() - 0.5) * Math.max(0, rd - 5);
      const [x, z] = W(lx, lz);
      if (b.tank) {
        for (const [i, k] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) details.push([new THREE.BoxGeometry(0.16, 1.8, 0.16).translate(x + i * 0.9, roofY + 0.9, z + k * 0.9), '#4a4440']);
        details.push([new THREE.CylinderGeometry(1.35, 1.35, 2.4, 12).translate(x, roofY + 3, z), '#8a6a4a']);
        details.push([new THREE.ConeGeometry(1.5, 0.9, 12).translate(x, roofY + 4.65, z), '#5a4a3e']);
      } else details.push([new THREE.BoxGeometry(2.2, 1.1, 1.6).rotateY(-(b.ang || 0)).translate(x, roofY + 0.55, z), '#c4c8cc']);
    }
  }
  const g = new THREE.BufferGeometry();
  const all = { P: [], N: [], U: [], C: [] };
  buf.forEach((o, i) => {
    g.addGroup(all.P.length / 3, o.P.length / 3, i);
    for (const k of ['P', 'N', 'U', 'C']) for (const v of o[k]) all[k].push(v);
  });
  g.setAttribute('position', new THREE.Float32BufferAttribute(all.P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(all.N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(all.U, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(all.C, 3));
  const group = new THREE.Group();
  const m = new THREE.Mesh(g, mats);
  m.castShadow = m.receiveShadow = true;
  group.add(m);
  if (details.length) {
    const dm = new THREE.Mesh(merge(details), new THREE.MeshLambertMaterial({ vertexColors: true }));
    dm.castShadow = true;
    group.add(dm);
  }
  return group;
}

export { rng };
