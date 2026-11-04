// Tower Dive's stacks: cars in glass boxes, piled up on the sky decks. A boxed car doesn't move (no physics at all)
// until something loose touches it; then its glass goes, it's off, leaning the way it was pushed, and a moment
// later the box over it has nothing under it and goes too, and so on up. A column falling sideways into the next
// sets that one off: dominoes.
import * as THREE from 'three';

export const BOX = { w: 2.7, l: 5.4, h: 2.3 };     // a box, outside: wide, long, high
const RIDE = 0.9;
const LOD = 260;
const CELL = 8;                                   // a car's middle over its box's floor
const KINDS = ['hatch', 'coupe', 'saloon', 'cab', 'suv', 'police', 'hatch', 'saloon'];
const _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

// The glass and the frame round it, one instance each per box
function boxGeometries() {
  const glass = new THREE.BoxGeometry(BOX.w, BOX.h, BOX.l).translate(0, BOX.h / 2, 0);
  const bars = [], t = 0.09;
  for (const y of [0, BOX.h]) for (const x of [-1, 1]) bars.push(new THREE.BoxGeometry(t, t, BOX.l).translate(x * BOX.w / 2, y, 0));
  for (const y of [0, BOX.h]) for (const z of [-1, 1]) bars.push(new THREE.BoxGeometry(BOX.w, t, t).translate(0, y, z * BOX.l / 2));
  for (const x of [-1, 1]) for (const z of [-1, 1]) bars.push(new THREE.BoxGeometry(t, BOX.h, t).translate(x * BOX.w / 2, BOX.h / 2, z * BOX.l / 2));
  return { glass, frame: mergeAll(bars) };
}
function mergeAll(gs) {
  const P = [], N = [];
  for (const g of gs) { const n = g.toNonIndexed(); P.push(...n.attributes.position.array); N.push(...n.attributes.normal.array); }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  return out;
}

export class Stacks {
  // `racks`: [{ x, z, n, high, along: 'x' | 'z', gap, yaw }]: n columns `gap` apart in a line along x or z, each
  // `high` boxes high, the cars facing `yaw`. `floor(x, z)`: the deck's height there. `make(kind)`: a new vehicle.
  constructor(scene, racks, floor, make, rand) {
    this.scene = scene;
    this.cols = [];
    this.list = [];
    const G = boxGeometries();
    const count = racks.reduce((s, r) => s + r.n * r.high, 0);
    this.glass = new THREE.InstancedMesh(G.glass, new THREE.MeshLambertMaterial({ color: '#bff4ff', transparent: true, opacity: 0.22, depthWrite: false }), count);
    this.frame = new THREE.InstancedMesh(G.frame, new THREE.MeshLambertMaterial({ color: '#e9f6f8' }), count);
    this.frame.castShadow = true;
    let k = 0;
    racks.forEach((R, ri) => {
      const yaw = R.yaw || 0, gap = R.gap || BOX.w + 0.5;
      for (let c = 0; c < R.n; c++) {
        const off = (c - (R.n - 1) / 2) * gap;
        const x = R.x + (R.along === 'z' ? 0 : off), z = R.z + (R.along === 'z' ? off : 0);
        const y0 = floor(x, z), col = { rack: ri, deck: R.deck ?? ri, x, z, cars: [], down: false };
        for (let h = 0; h < R.high; h++) {
          const v = make(KINDS[Math.floor(rand() * KINDS.length)]);
          const c2 = v.car;
          c2.pos.set(x, y0 + h * BOX.h + RIDE, z);
          c2.q.setFromAxisAngle(_up, yaw);
          c2.vel.set(0, 0, 0); c2.w.set(0, 0, 0); c2.speed = 0;
          for (const w of c2.wheels) { w.comp = 0.08; w.contact = true; }
          Object.assign(v, { held: true, stack: { col, tier: h, box: k, home: c2.pos.clone() }, asleep: false });
          // (no shadow while it stands still in its box, and its dents in its own plain mesh, not a finer one made when
          // it's first hit: there are a lot of them, and they all get hit at once)
          v.model.traverse(o => { if (o.isMesh) o.castShadow = false; });
          v.soft = true;
          for (const m of v.model.userData.bodyMeshes) m.userData.orig = m.geometry.attributes.position.array.slice();
          _m.compose(_p.set(x, y0 + h * BOX.h, z), _q.setFromAxisAngle(_up, yaw), _s.set(1, 1, 1));
          this.glass.setMatrixAt(k, _m);
          this.frame.setMatrixAt(k, _m);
          col.cars.push(v);
          this.list.push(v);
          k++;
        }
        this.cols.push(col);
      }
    });
    scene.add(this.glass, this.frame);
    // (by CELL m square, for finding the boxes near something loose: they never move while they're boxed)
    this.grid = new Map();
    for (const v of this.list) {
      const key = Math.floor(v.car.pos.x / CELL) + ',' + Math.floor(v.car.pos.z / CELL);
      if (!this.grid.has(key)) this.grid.set(key, []);
      this.grid.get(key).push(v);
    }
    this.pending = [];     // [{ v, at, dir, by }]: boxes over a fallen one, about to go
    this.down = 0;         // columns that have started to fall
  }

  get total() { return this.cols.length; }

  // Let `v` go (pushed along `dir`, a horizontal unit vector, by `by`). Returns true if it was held.
  release(v, dir, by, t, onRelease) {
    if (!v.held) return false;
    v.held = false;
    v.model.visible = true;
    v.model.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const S = v.stack, c = v.car;
    this.hide(S.box);
    // (leaning the way it was pushed, the higher the harder: a column topples rather than drops straight)
    const lean = 0.6 + S.tier * 0.9;
    c.vel.x += dir.x * lean; c.vel.z += dir.z * lean; c.vel.y += 0.3;
    _p.set(dir.z, 0, -dir.x);
    c.w.addScaledVector(_p, -(0.5 + S.tier * 0.25));
    const col = S.col;
    let first = false;
    if (!col.down) { col.down = true; this.down++; first = true; }
    // what's over it goes next, one after another, up the column
    for (const u of col.cars) if (u.held && u.stack.tier > S.tier) this.pending.push({ v: u, at: t + 0.07 + (u.stack.tier - S.tier) * 0.06, dir: dir.clone(), by: v });
    onRelease?.(v, by, first);
    return true;
  }

  hide(i) {
    _m.makeScale(0, 0, 0);
    this.glass.setMatrixAt(i, _m);
    this.frame.setMatrixAt(i, _m);
    this.glass.instanceMatrix.needsUpdate = this.frame.instanceMatrix.needsUpdate = true;
  }

  // Each step: the boxes whose support has gone
  update(t, onRelease) {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const P = this.pending[i];
      if (t < P.at) continue;
      this.pending.splice(i, 1);
      this.release(P.v, P.dir, P.by, t, onRelease);
    }
  }

  // The boxes (held or not) in the cells round p: everything boxed that something at p could be touching
  around(p) {
    const cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL), out = this._near || (this._near = []);
    out.length = 0;
    for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) { const c = this.grid.get(cx + i + ',' + (cz + k)); if (c) out.push(...c); }
    return out;
  }

  // Far off, a box is just glass: its car shows from LOD m in (there are a lot of them)
  lod(eye) {
    for (const v of this.list) if (v.held) v.model.visible = v.car.pos.distanceToSquared(eye) < LOD * LOD;
  }

  // Every held car within R of p (on about its level), nearest first
  near(p, R, dy = 12) {
    return this.list.filter(v => v.held && Math.abs(v.car.pos.y - p.y) < dy && Math.hypot(v.car.pos.x - p.x, v.car.pos.z - p.z) < R)
      .sort((a, b) => a.car.pos.distanceToSquared(p) - b.car.pos.distanceToSquared(p));
  }

  dispose() {
    this.scene.remove(this.glass, this.frame);
    this.glass.geometry.dispose(); this.frame.geometry.dispose();
    this.glass.material.dispose(); this.frame.material.dispose();
  }
}
