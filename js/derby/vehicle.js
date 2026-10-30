// A derby car: physics body, model, and its damage. Hits dent the bodywork where they land, wear down the
// zone they hit (nose, tail or a side), can knock wheels and parts off, and a big enough hit on a car that's
// done for tears it in two.
import * as THREE from 'three';
import { CarPhysics, buildCarModel, poseCarModel, setCarLights, WHEELS, HULL } from '../car.js';

const v3 = () => new THREE.Vector3();
const _a = v3(), _b = v3(), _n = v3(), _ra = v3(), _rb = v3(), _va = v3(), _vb = v3(), _t = v3(), _t2 = v3(), _J = v3(), _lp = v3(), _q = new THREE.Quaternion();

// Damage from an impulse (N·s): nothing for nudges, then rising a little faster than the hit
export const damageFrom = j => Math.max(0, j / 1000 - 1.8) ** 1.25;
// Damage taken by the zone that's hit: the nose is built to take it, the doors aren't
const ZONE_TAKEN = { front: 0.6, rear: 0.85, left: 1.3, right: 1.3 };

const hash = (x, y, z) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return s - Math.floor(s); };

export class Vehicle {
  constructor(world, scene, id, def, paint, { player = false, driver = null, name } = {}) {
    this.id = id;
    this.def = def;
    this.paint = paint;
    this.player = player;
    this.driver = driver;
    this.name = name || def.name;
    this.scene = scene;
    this.world = world;
    this.car = new CarPhysics(world, { ...def, air: 0.6 });
    this.model = this.build();
    const [w, l] = def.size;
    this.r = w / 2;
    this.len = l;
    this.spheres = [-(l / 2 - this.r), 0, l / 2 - this.r];
    this.score = 0;
    this.takedowns = 0;
    this.dealt = 0;
    this.reset();
  }

  reset() {
    this.maxHp = this.def.hp;
    this.hp = this.maxHp;
    this.zones = { front: 0, rear: 0, left: 0, right: 0 };
    this.wheelHp = [1, 1, 1, 1];
    this.alive = true;
    this.wrecked = false;
    this.item = null;
    this.nitro = 0.5;
    this.shield = 0;
    this.ram = 0;
    this.lastHit = null;     // { by, t }
    this.spinRef = null;
    this.flipT = 0;
    this.invuln = 0;
    this.lostParts = new Set();
    const c = this.car;
    c.powerK = 1;
    c.steerPull = 0;
    for (const w of c.wheels) w.lost = false;
  }

  // Put a fresh car back on the floor (start of a round, or a respawn in Brawl)
  respawn(spawn) {
    if (this.model.userData.wrecked || this.dented) this.rebuildModel();
    this.reset();
    const c = this.car;
    c.reset(new THREE.Vector3(spawn.x, this.world.groundHeight(spawn.x, spawn.z) + 0.95, spawn.z), 0);
    c.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), spawn.yaw);
    this.model.visible = true;
  }

  // The kit model, with its bodywork cut into small triangles so that hits crumple it locally
  build() {
    const model = buildCarModel(this.paint, { file: this.def.file, scale: this.def.scale, lights: this.player });
    for (const m of model.userData.bodyMeshes) {
      const key = this.def.file + ':' + m.name;
      if (!fine.has(key)) fine.set(key, subdivide(m.geometry, 0.42));
      m.geometry = fine.get(key).clone();
      m.userData.orig = m.geometry.attributes.position.array.slice();
    }
    this.scene.add(model);
    return model;
  }

  rebuildModel() {
    this.scene.remove(this.model);
    this.model = this.build();
    this.dented = false;
    if (this.lamps != null) setCarLights(this.model, this.lamps);
  }

  setLights(level) { this.lamps = level; setCarLights(this.model, level); }

  pose() {
    // Dents from this frame's hits: reshade once
    for (const m of this.model.userData.bodyMeshes) {
      if (!m.userData.dirty) continue;
      m.userData.dirty = false;
      m.geometry.attributes.position.needsUpdate = true;
      m.geometry.computeVertexNormals();
    }
    const c = this.car;
    poseCarModel(this.model, c.pos, c.q, c.steer, c.wheels.map(w => w.comp), c.wheels.map(w => w.spin));
  }

  get forward() { return _t.set(0, 0, -1).applyQuaternion(this.car.q); }
  get yaw() { const f = _t2.set(0, 0, -1).applyQuaternion(this.car.q); return Math.atan2(-f.x, -f.z); }
  get up() { return _t2.set(0, 1, 0).applyQuaternion(this.car.q); }

  // Where a world point is on this car, and which zone that is
  localPoint(p, out = _lp) {
    _q.copy(this.car.q).invert();
    return out.subVectors(p, this.car.pos).applyQuaternion(_q);
  }
  zoneOf(lp) {
    const h = this.len / 2;
    if (lp.z < -h * 0.42) return 'front';
    if (lp.z > h * 0.42) return 'rear';
    return lp.x < 0 ? 'left' : 'right';
  }

  // ---------- Bodywork ----------
  // Push the body in around local point `lp` along `dir` (local, pointing into the car)
  dent(lp, dir, amount) {
    const depth = Math.min(0.7, 0.08 + amount * 0.025), radius = 0.75 + Math.min(1.0, amount * 0.025);
    const maxCrush = 0.75;
    for (const m of this.model.userData.bodyMeshes) {
      const pos = m.geometry.attributes.position, a = pos.array, o = m.userData.orig;
      let moved = false;
      for (let i = 0; i < a.length; i += 3) {
        const dx = o[i] - lp.x, dy = (o[i + 1] - lp.y) * 0.6, dz = o[i + 2] - lp.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d >= radius) continue;
        const f = (1 - d / radius) ** 2 * (0.65 + 0.7 * hash(o[i], o[i + 1], o[i + 2])) * depth;
        let x = a[i] + dir.x * f - o[i], y = a[i + 1] + dir.y * f * 0.4 - o[i + 1], z = a[i + 2] + dir.z * f - o[i + 2];
        const t = Math.hypot(x, y, z);
        if (t > maxCrush) { x *= maxCrush / t; y *= maxCrush / t; z *= maxCrush / t; }
        a[i] = o[i] + x; a[i + 1] = o[i + 1] + y; a[i + 2] = o[i + 2] + z;
        moved = true;
      }
      if (moved) { m.userData.dirty = true; this.dented = true; }
    }
  }

  // Take wheel i off the car; returns the wheel as a separate object (for the debris)
  loseWheel(i) {
    const c = this.car, ws = c.wheels[i];
    if (ws.lost) return null;
    ws.lost = true;
    const wv = this.model.userData.wheels[i];
    wv.steerer.updateWorldMatrix(true, false);
    const p = new THREE.Vector3().setFromMatrixPosition(wv.steerer.matrixWorld);
    wv.steerer.visible = false;
    // The car pulls toward a missing front wheel
    if (WHEELS[i].front) c.steerPull += WHEELS[i].p.x < 0 ? -0.18 : 0.18;
    const tyre = wv.spinner.children[0].clone();
    tyre.rotation.set(0, 0, 0);
    const holder = new THREE.Group(), roll = new THREE.Group();
    roll.add(tyre);
    holder.add(roll);
    return { mesh: holder, roll, pos: p };
  }

  // Detach a named body part (the Comet's spoiler, the Interceptor's push bar)
  losePart(name) {
    if (this.lostParts.has(name)) return null;
    const m = this.model.userData.bodyMeshes.find(b => b.name === name);
    if (!m) return null;
    this.lostParts.add(name);
    m.visible = false;
    m.updateWorldMatrix(true, false);
    const copy = new THREE.Mesh(m.geometry.clone(), m.material);
    const box = new THREE.Box3().setFromBufferAttribute(copy.geometry.attributes.position);
    const centre = box.getCenter(new THREE.Vector3());
    copy.geometry.translate(-centre.x, -centre.y, -centre.z);
    const g = new THREE.Group();
    g.add(copy);
    g.quaternion.copy(this.car.q);
    return { mesh: g, pos: centre.applyMatrix4(m.matrixWorld) };
  }

  // ---------- Wrecking ----------
  wreck() {
    this.alive = false;
    this.wrecked = true;
    this.hp = 0;
    const mat = this.model.userData.paint;
    mat.color.set('#3a3532');
    mat.roughness = 0.9;
    this.model.userData.wrecked = true;
    this.car.powerK = 0;
  }

  // Tear the car in two across the middle. Returns two loose halves ({ car, model }) that carry on with
  // the car's motion, pushed apart. The car itself is hidden.
  split() {
    this.wreck();
    const c = this.car, out = [];
    this.model.visible = false;
    for (const side of [-1, 1]) {   // -1: front half
      const off = side * 1.05;
      const root = new THREE.Group(), inner = new THREE.Group();
      inner.position.z = -off;
      root.add(inner);
      for (const m of this.model.userData.bodyMeshes) {
        if (!m.visible) continue;
        const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        const half = keepTriangles(g, (cx, cy, cz) => side * (cz - 0.18 * Math.sin(cx * 6 + cy * 4)) >= 0);
        half.computeVertexNormals();
        const mesh = new THREE.Mesh(half, m.material);
        mesh.castShadow = true;
        inner.add(mesh);
      }
      this.model.userData.wheels.forEach((w, i) => {
        if ((WHEELS[i].front ? -1 : 1) !== side || !w.steerer.visible) return;
        const s = w.steerer.clone();
        inner.add(s);
      });
      const hull = HULL.map(h => ({ ...h, p: new THREE.Vector3(h.p.x, h.p.y, side < 0 ? Math.min(h.p.z, 0) : Math.max(h.p.z, 0)).setZ((side < 0 ? Math.min(h.p.z, 0) : Math.max(h.p.z, 0)) - off) }));
      const body = new CarPhysics(this.world, { ...this.def, mass: this.def.mass / 2, inertia: 0.5, hull, power: 0 });
      body.pos.copy(c.pos).add(_a.set(0, 0, off).applyQuaternion(c.q));
      body.q.copy(c.q);
      body.vel.copy(c.vel).add(_b.set(0, 0, off).applyQuaternion(c.q).multiplyScalar(3.5)).add(_t.set(0, 3, 0));
      body.w.copy(c.w).add(_t.set(0, 0, 1).applyQuaternion(c.q).cross(_t2.set(0, 1, 0)).multiplyScalar(side * 2.5));
      for (const w of body.wheels) w.lost = true;
      body.powerK = 0;
      this.scene.add(root);
      out.push({ car: body, model: root, r: 1.05, spheres: [0], half: true, owner: this });
    }
    return out;
  }
}

const fine = new Map();

// Split triangles until no edge is longer than `len`. An edge is split wherever it's long, whichever
// triangle it belongs to, so neighbours stay joined (no cracks when the body is dented).
export function subdivide(geo, len) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  const names = Object.keys(g.attributes);
  for (let pass = 0; pass < 6; pass++) {
    const src = Object.fromEntries(names.map(k => [k, g.attributes[k]]));
    const pos = src.position, n = pos.count;
    const out = Object.fromEntries(names.map(k => [k, []]));
    let split = false;
    const vtx = (i, j, t) => names.map(k => {
      const a = src[k], s = a.itemSize, r = [];
      for (let c = 0; c < s; c++) r.push(a.array[i * s + c] * (1 - t) + a.array[j * s + c] * t);
      return r;
    });
    const put = (...vs) => { for (const v of vs) names.forEach((k, ki) => out[k].push(...v[ki])); };
    const L2 = len * len;
    const long = (i, j) => (pos.getX(i) - pos.getX(j)) ** 2 + (pos.getY(i) - pos.getY(j)) ** 2 + (pos.getZ(i) - pos.getZ(j)) ** 2 > L2;
    for (let t = 0; t < n; t += 3) {
      const a = t, b = t + 1, c = t + 2;
      const A = vtx(a, a, 0), B = vtx(b, b, 0), C = vtx(c, c, 0);
      const lab = long(a, b), lbc = long(b, c), lca = long(c, a);
      const k = lab + lbc + lca;
      if (!k) { put(A, B, C); continue; }
      split = true;
      const AB = vtx(a, b, 0.5), BC = vtx(b, c, 0.5), CA = vtx(c, a, 0.5);
      if (k === 3) put(A, AB, CA, AB, B, BC, CA, BC, C, AB, BC, CA);
      else if (k === 1) {
        if (lab) put(A, AB, C, AB, B, C);
        else if (lbc) put(A, B, BC, A, BC, C);
        else put(A, B, CA, CA, B, C);
      } else {
        if (!lab) put(A, B, BC, A, BC, CA, CA, BC, C);
        else if (!lbc) put(A, AB, CA, AB, B, C, CA, AB, C);
        else put(A, AB, C, AB, B, BC, AB, BC, C);
      }
    }
    const r = new THREE.BufferGeometry();
    for (const k of names) r.setAttribute(k, new THREE.Float32BufferAttribute(out[k], src[k].itemSize));
    g = r;
    if (!split) break;
  }
  g.computeVertexNormals();
  return g;
}

function keepTriangles(g, keep) {
  const pos = g.attributes.position, n = pos.count;
  const attrs = Object.keys(g.attributes);
  const out = Object.fromEntries(attrs.map(k => [k, []]));
  for (let i = 0; i < n; i += 3) {
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3, cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    if (!keep(cx, cy, cz)) continue;
    for (const k of attrs) {
      const a = g.attributes[k], s = a.itemSize;
      for (let v = i; v < i + 3; v++) for (let c = 0; c < s; c++) out[k].push(a.array[v * s + c]);
    }
  }
  const r = new THREE.BufferGeometry();
  for (const k of attrs) r.setAttribute(k, new THREE.Float32BufferAttribute(out[k], g.attributes[k].itemSize));
  return r;
}

// ---------- Contact between two bodies ----------
// Bodies are a row of spheres along their length ({ car, r, spheres }). Resolves the deepest overlap with
// a proper rigid-body impulse (spin included) and returns the hit, or null.
export function contact(A, B) {
  const a = A.car, b = B.car;
  const reach = (A.len || 2) / 2 + (B.len || 2) / 2 + 1.5;
  if (Math.abs(a.pos.x - b.pos.x) > reach || Math.abs(a.pos.z - b.pos.z) > reach || Math.abs(a.pos.y - b.pos.y) > 4) return null;
  let best = null, bestPen = 0;
  for (const oa of A.spheres) for (const ob of B.spheres) {
    _a.set(0, 0, oa).applyQuaternion(a.q).add(a.pos);
    _b.set(0, 0, ob).applyQuaternion(b.q).add(b.pos);
    _n.subVectors(_a, _b);
    const d = _n.length(), pen = A.r + B.r - d;
    if (pen > bestPen && d > 1e-4) { bestPen = pen; best = [oa, ob, d]; }
  }
  if (!best) return null;
  const [oa, ob, d] = best;
  _a.set(0, 0, oa).applyQuaternion(a.q).add(a.pos);
  _b.set(0, 0, ob).applyQuaternion(b.q).add(b.pos);
  _n.subVectors(_a, _b).divideScalar(d);                      // from B to A
  const point = new THREE.Vector3().copy(_b).addScaledVector(_n, B.r - bestPen / 2);
  // Push apart in proportion to the other's mass
  const ia = 1 / a.mass, ib = 1 / b.mass;
  a.pos.addScaledVector(_n, bestPen * ia / (ia + ib));
  b.pos.addScaledVector(_n, -bestPen * ib / (ia + ib));
  _ra.subVectors(point, a.pos);
  _rb.subVectors(point, b.pos);
  _va.crossVectors(a.w, _ra).add(a.vel);
  _vb.crossVectors(b.w, _rb).add(b.vel);
  const vrel = _t.subVectors(_va, _vb);
  const vn = vrel.dot(_n);
  if (vn >= 0) return null;
  const k = ia + ib + _n.dot(_t2.crossVectors(a.invInertia(_J.crossVectors(_ra, _n), _J), _ra))
    + _n.dot(_t2.crossVectors(b.invInertia(_J.crossVectors(_rb, _n), _J), _rb));
  const e = 0.3;
  const j = -(1 + e) * vn / k;
  _J.copy(_n).multiplyScalar(j);
  // Some scraping friction
  const vt = vrel.addScaledVector(_n, -vn), vtl = vt.length();
  if (vtl > 1e-3) _J.addScaledVector(vt, -Math.min(vtl / k, 0.3 * j) / vtl);
  a.applyImpulse(_ra, _J);
  b.applyImpulse(_rb, _J.negate());
  // Who drove into whom: speed toward the other just before the hit
  const sa = -_va.dot(_n), sb = _vb.dot(_n);
  return { point, normal: _n.clone(), j, speed: -vn, sa, sb };
}
