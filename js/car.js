// Raycast-suspension rigid-body car, plus its low-poly model.
import * as THREE from 'three';
import { WORLD_LIMIT } from './track.js';
import { LOOP_R, loopX, loopDX, CORK_R, CORK_Z, corkFrame } from './pieces.js';

export const MASS = 1200;
const G = 9.81;
const REST = 0.45, RADIUS = 0.36, SPRING = 36000, DAMP = 3200;
const INERTIA = new THREE.Vector3(2400, 2800, 1100);
const GEARS = [0, 13, 24, 35, 47, 70];
const BOOST_TOP = 86;
// Selectable cars. They share the chassis geometry (wheels, hull) so collisions and jumps behave alike;
// power, top speed (m/s), grip and air-control rate differ.
export const CARS = {
  comet: { name: 'Comet', blurb: 'All-rounder', power: 13000, top: 68, grip: 1.75, air: 1 },
  hopper: { name: 'Hopper', blurb: 'Light buggy: grippy, flips fast, lower top speed', power: 12000, top: 62, grip: 1.9, air: 1.35, tone: 1.3 },
  brute: { name: 'Brute', blurb: 'Muscle car: big power, slides, heavy in the air', power: 15500, top: 74, grip: 1.58, air: 0.8, tone: 0.72 },
};
// Air control: rotation rate (rad/s) held for pitch, yaw and roll input while airborne
const AIR_RATE = { pitch: 8, yaw: 7, roll: 8.5 };

export const WHEELS = [
  { p: new THREE.Vector3(-0.82, -0.15, -1.32), front: true },
  { p: new THREE.Vector3(0.82, -0.15, -1.32), front: true },
  { p: new THREE.Vector3(-0.84, -0.15, 1.28), front: false },
  { p: new THREE.Vector3(0.84, -0.15, 1.28), front: false },
];
export const WHEEL_RADIUS = RADIUS, WHEEL_REST = REST;

const HULL = [
  [-0.9, -0.3, -2.1], [0.9, -0.3, -2.1], [-0.9, -0.3, 2.1], [0.9, -0.3, 2.1], [-0.9, -0.42, 0], [0.9, -0.42, 0],
  [-0.9, 0.05, -2.15], [0.9, 0.05, -2.15], [-0.9, 0.15, 2.12], [0.9, 0.15, 2.12],
  [-0.68, 0.62, -0.1, 1], [0.68, 0.62, -0.1, 1], [-0.68, 0.62, 0.9, 1], [0.68, 0.62, 0.9, 1],
].map(([x, y, z, roof]) => ({ p: new THREE.Vector3(x, y, z), roof: !!roof, under: y <= -0.3 }));

const v3 = () => new THREE.Vector3();
const _up = v3(), _fwd = v3(), _right = v3(), _F = v3(), _T = v3(), _down = v3();
const _mount = v3(), _r = v3(), _pv = v3(), _wf = v3(), _ws = v3(), _f = v3(), _t1 = v3(), _t2 = v3();
const _n = v3(), _J = v3(), _vt = v3(), _d = v3(), _p = v3();
const _qi = new THREE.Quaternion(), _dq = new THREE.Quaternion(), _mq = new THREE.Matrix4();
const clamp = THREE.MathUtils.clamp;

export class CarPhysics {
  constructor(world, spec = CARS.comet) {
    this.world = world;
    this.spec = spec;
    this.pos = v3();
    this.vel = v3();
    this.q = new THREE.Quaternion();
    this.w = v3();
    this.wheels = WHEELS.map(() => ({ comp: 0, contact: false, spin: 0, slip: 0, road: true }));
    this.steer = 0;
    this.gear = 1;
    this.rpm = 1000;
    this.shift = 0;
    this.speed = 0;
    this.grounded = 0;
  }

  reset(pos, heading) {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.w.set(0, 0, 0);
    this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -heading * Math.PI / 2);
    this.steer = 0;
    for (const w of this.wheels) { w.comp = 0; w.contact = false; }
    this.loopRef = this.loopTop = null;
    this.rail = null;
    this.railCool = 0;
  }

  invInertia(v, out) {
    _qi.copy(this.q).invert();
    out.copy(v).applyQuaternion(_qi);
    out.set(out.x / INERTIA.x, out.y / INERTIA.y, out.z / INERTIA.z);
    return out.applyQuaternion(this.q);
  }

  applyImpulse(r, J) {
    this.vel.addScaledVector(J, 1 / MASS);
    this.w.add(this.invInertia(_t1.crossVectors(r, J), _t2));
  }

  // One fixed physics step. Returns collision info for crash detection.
  step(dt, input) {
    if (this.rail) return this.railStep(dt, input);
    this.railCool -= dt;
    const q = this.q, world = this.world;
    _up.set(0, 1, 0).applyQuaternion(q);
    _fwd.set(0, 0, -1).applyQuaternion(q);
    _right.set(1, 0, 0).applyQuaternion(q);
    _down.copy(_up).negate();
    _F.set(0, -G * MASS, 0);
    _T.set(0, 0, 0);

    const vF = this.vel.dot(_fwd);
    this.speed = vF;
    const sp = Math.abs(vF);

    const maxSteer = 0.55 - 0.4 * Math.min(1, sp / 55);
    this.steer += clamp(input.steer * maxSteer - this.steer, -5 * dt, 5 * dt);

    // Pedals: the same key brakes or reverses depending on direction of travel
    let drive = 0, brake = 0;
    if (input.throttle > 0) { if (vF < -0.5) brake = input.throttle; else drive = input.throttle; }
    if (input.brake > 0) { if (vF > 0.5) brake = Math.max(brake, input.brake); else drive = -input.brake; }

    let g = 1;
    while (g < GEARS.length - 1 && sp >= GEARS[g]) g++;
    if (drive < 0) g = 0;
    if (g !== this.gear) { if (g > this.gear && this.gear > 0) this.shift = 0.14; this.gear = g; }
    this.shift -= dt;
    const lo = g === 0 ? 0 : GEARS[g - 1], hi = g === 0 ? 14 : GEARS[g];
    const rpmTarget = 1100 + 6200 * clamp((sp - lo) / (hi - lo), 0, 1.05);
    const revving = drive !== 0 && this.grounded === 0;
    this.rpm += ((revving ? 7200 : rpmTarget) - this.rpm) * Math.min(1, dt * 8);

    let driveForce = 0;
    if (drive > 0) driveForce = drive * this.spec.power * Math.max(0, 1 - sp / this.spec.top) * (this.shift > 0 ? 0.25 : 1);
    if (input.boost && vF > -0.5) driveForce += 10000 * Math.max(0, 1 - sp / BOOST_TOP);
    else if (drive < 0) driveForce = drive * 6000 * Math.max(0, 1 - sp / 14);

    this.landing = 0;
    this.grounded = 0;
    for (let i = 0; i < 4; i++) {
      const W = WHEELS[i], ws = this.wheels[i];
      _mount.copy(W.p).applyQuaternion(q).add(this.pos);
      const hit = world.raycast(_mount, _down, REST + RADIUS);
      if (!hit) {
        ws.comp = Math.max(0, ws.comp - dt * 3);
        ws.contact = false;
        ws.slip = 0;
        ws.spin += (W.front ? 0 : driveForce * 0.0004) * dt;
        continue;
      }
      this.grounded++;
      ws.contact = true;
      if (hit.object && hit.object.userData.loop) { this.loopRef = hit.object.userData.loop; this.loopTimer = 0.4; }
      if (hit.object && hit.object.userData.cork && this.railCool <= 0 && this.enterRail(hit.object.userData.cork)) return this.railStep(dt, input);
      const comp = REST + RADIUS - hit.dist;
      const cv = (comp - ws.comp) / dt;
      ws.comp = comp;
      let fs = SPRING * comp + DAMP * cv;
      // Bump stop: stiff on the way in, soft on the way out so it doesn't catapult the car
      if (comp > REST * 0.7) fs += (cv > 0 ? 500000 : 120000) * (comp - REST * 0.7) + (cv > 0 ? 12000 * cv : 0);
      fs = Math.max(0, fs);
      const N = hit.normal;
      if (this.airTime > 0.25) this.landing = Math.max(this.landing, -this.vel.dot(N));

      // Tyre axes on the contact plane
      if (W.front) _wf.copy(_fwd).multiplyScalar(Math.cos(this.steer)).addScaledVector(_right, Math.sin(this.steer));
      else _wf.copy(_fwd);
      _wf.addScaledVector(N, -_wf.dot(N)).normalize();
      _ws.crossVectors(_wf, N);

      _r.subVectors(hit.point, this.pos);
      _pv.crossVectors(this.w, _r).add(this.vel);
      const vf = _pv.dot(_wf), vs = _pv.dot(_ws);
      ws.road = world.onRoad(hit.point.x, hit.point.z) || hit.point.y > 0.05;

      let lat = -vs * 7000 * (input.handbrake && !W.front ? 0.3 : 1);
      let lon = -vf * 15;
      if (!W.front) lon += driveForce / 2;
      const bF = brake * (W.front ? 5000 : 3800);
      if (bF > 0) lon -= clamp(vf * 6000, -bF, bF);
      if (input.handbrake && !W.front) lon -= clamp(vf * 6000, -3500, 3500);

      const mu = (ws.road ? this.spec.grip * world.surfaceGrip(hit.point.x, hit.point.z) : this.spec.grip / 1.5) * (W.front ? 1 : 1.1) * (world.wet ? 0.94 : 1);
      const maxF = mu * Math.min(fs, 9000);
      const mag = Math.hypot(lat, lon);
      ws.slip = maxF > 0 ? mag / maxF : 0;
      if (mag > maxF && mag > 0) { lat *= maxF / mag; lon *= maxF / mag; }

      // Spring acts at the mount, tyre forces at a point raised toward the centre of mass to limit body roll
      _f.copy(_up).multiplyScalar(fs);
      _F.add(_f);
      _t1.subVectors(_mount, this.pos);
      _T.add(_t2.crossVectors(_t1, _f));
      _f.copy(_wf).multiplyScalar(lon).addScaledVector(_ws, lat);
      _F.add(_f);
      _r.addScaledVector(_up, 0.45);
      _T.add(_t2.crossVectors(_r, _f));

      ws.spin += vf / RADIUS * dt;
    }

    // Aerodynamics: drag and a little downforce
    const v2 = this.vel.lengthSq();
    _F.addScaledVector(this.vel, -0.7 * Math.sqrt(v2));
    if (this.grounded) _F.addScaledVector(_up, -0.45 * vF * vF);

    this.vel.addScaledVector(_F, dt / MASS);
    if (this.loopRef) this.loopAssist(dt);
    this.w.add(this.invInertia(_T, _t1).multiplyScalar(dt));
    // Air control steers the rotation rate about each body axis. Once used during a flight, letting go
    // slows that rotation down so the car can be lined up for the landing.
    const air = input.air;
    if (!this.grounded && air) {
      for (const [axis, v, sign] of [[_right, air.pitch, 1], [_up, air.yaw, -1], [_fwd, air.roll, 1]]) {
        const key = axis === _right ? 'pitch' : axis === _up ? 'yaw' : 'roll';
        const cur = this.w.dot(axis);
        let want;
        if (v) { want = sign * v * AIR_RATE[key] * this.spec.air; this.airUsed = true; }
        else if (this.airUsed) want = cur * (1 - Math.min(1, dt * 6));
        else continue;
        this.w.addScaledVector(axis, (want - cur) * Math.min(1, dt * 10));
      }
    } else if (this.grounded) this.airUsed = false;
    this.w.multiplyScalar(1 - dt * (this.grounded ? 1.2 : 0.1));
    this.pos.addScaledVector(this.vel, dt);
    _dq.set(this.w.x * dt * 0.5, this.w.y * dt * 0.5, this.w.z * dt * 0.5, 0).multiply(q);
    q.set(q.x + _dq.x, q.y + _dq.y, q.z + _dq.z, q.w + _dq.w).normalize();

    // Landing assist: touching down on the wheels after real airtime kills most of the pitch/roll spin,
    // so a flip that comes down on its wheels sticks instead of tumbling on.
    if (this.grounded >= 2 && (this.airTime || 0) > 0.4 && _up.y > 0.5) {
      const yaw = this.w.dot(_up);
      this.w.sub(_t1.copy(_up).multiplyScalar(yaw)).multiplyScalar(0.25).addScaledVector(_up, yaw);
    }
    this.airTime = this.grounded ? 0 : (this.airTime || 0) + dt;
    const ev = this.collide();
    ev.landing = this.landing;
    return ev;
  }

  // Corkscrew: like a roller coaster, the car rides a rail through the twist. It keeps its speed (less what
  // the climb costs) and falls off if it's too slow to stay pressed against the road upside down.
  enterRail(C) {
    const ca = Math.cos(C.a), sa = Math.sin(C.a);
    const dx = this.pos.x - C.cx, dz = this.pos.z - C.cz;
    const lx = dx * ca + dz * sa, lz = -dx * sa + dz * ca;
    _fwd.set(0, 0, -1).applyQuaternion(this.q);
    const fz = -_fwd.x * sa + _fwd.z * ca, vz = -this.vel.x * sa + this.vel.z * ca;
    const s = (CORK_Z - lz) / (2 * CORK_Z);
    let dir = 0;
    if (s > -0.05 && s < 0.08 && fz < -0.8 && vz < -2) dir = 1;
    else if (s > 0.92 && s < 1.05 && fz > 0.8 && vz > 2) dir = -1;
    if (!dir || Math.abs(lx) > 2.6) return false;
    this.rail = { C, ca, sa, dir, s: Math.min(1, Math.max(0, s)), v: Math.abs(vz), x: lx };
    return true;
  }

  railStep(dt, input) {
    const R = this.rail;
    let f = corkFrame(R.s);
    // Travel direction in local space
    const tx = f.t.x * R.dir, ty = f.t.y * R.dir, tz = f.t.z * R.dir;
    R.v += (-G * ty + (input.throttle > 0 ? 3 : 0) - (input.brake > 0 ? 6 : 0) - 0.0003 * R.v * R.v * 30) * dt;
    R.x *= 1 - Math.min(1, dt * 3);            // drift to the middle of the road
    // Too slow to stay on upside down: let go
    const circ = R.v * Math.sqrt(Math.max(0, 1 - tz * tz));
    const fall = f.n.y < -0.2 && circ * circ / CORK_R < G * -f.n.y * 0.85;
    R.s += R.dir * R.v * dt / f.len;
    const done = R.s >= 1 || R.s <= 0;
    R.s = Math.min(1, Math.max(0, R.s));
    f = corkFrame(R.s);
    const w = _t1.crossVectors(f.t, f.n).normalize();
    const lp = _p.copy(f.p).addScaledVector(f.n, 0.86).addScaledVector(w, R.x);
    const toWorld = (v, out) => out.set(v.x * R.ca - v.z * R.sa, v.y, v.x * R.sa + v.z * R.ca);
    toWorld(lp, this.pos);
    this.pos.x += R.C.cx;
    this.pos.z += R.C.cz;
    toWorld(_t2.copy(f.t).multiplyScalar(R.dir), _fwd);
    toWorld(f.n, _up);
    _right.crossVectors(_fwd, _up).normalize();
    _up.crossVectors(_right, _fwd);
    _mq.makeBasis(_right, _up, _t2.copy(_fwd).negate());
    this.q.setFromRotationMatrix(_mq);
    this.vel.copy(_fwd).multiplyScalar(R.v);
    this.w.set(0, 0, 0);
    this.speed = R.v;
    this.grounded = 4;
    this.airTime = 0;
    this.landing = 0;
    for (const ws of this.wheels) { ws.contact = true; ws.comp = 0.1; ws.slip = 0; ws.road = true; ws.spin += R.v / RADIUS * dt; }
    this.steer *= 1 - Math.min(1, dt * 5);
    this.rpm += (1100 + 6200 * Math.min(1, R.v / 35) - this.rpm) * Math.min(1, dt * 8);
    if (done || fall || R.v < 1) {
      this.rail = null;
      this.railCool = 0.6;
      if (done) this.railDone = true;
    }
    return { impact: 0, under: 0, roof: false, landing: 0 };
  }

  // Loops shift sideways so entry and exit lanes don't collide. Like a slot car, keep the car on the lane
  // and pointing along it while it's up on the loop.
  loopAssist(dt) {
    const L = this.loopRef;
    this.loopTimer -= dt;
    if (this.loopTimer <= 0) { this.loopRef = this.loopTop = null; return; }
    const ca = Math.cos(L.a), sa = Math.sin(L.a);
    const dx = this.pos.x - L.cx, dz = this.pos.z - L.cz;
    const lx = dx * ca + dz * sa, lz = -dx * sa + dz * ca;
    if (this.grounded === 0) return;
    let t;
    if (this.pos.y >= 1.2) {
      const th = Math.atan2(-lz, LOOP_R - this.pos.y);
      t = (th < 0 ? th + Math.PI * 2 : th) / (Math.PI * 2);
      if (t > 0.4 && t < 0.6) this.loopTop = L;
    } else if (this.loopTop === L && lz > -8) {
      t = 1;             // back on the ground: settle into the exit lane, then let go
      this.loopTimer = 0.4;
    } else return;
    const want = loopDX(t) * this.vel.length() / LOOP_R + (loopX(t) - lx) * 4;
    const dv = (want - (this.vel.x * ca + this.vel.z * sa)) * Math.min(1, dt * 15);
    this.vel.x += ca * dv;
    this.vel.z += sa * dv;
    // Turn the nose toward the direction of travel on the surface
    _t1.copy(this.vel).addScaledVector(_up, -this.vel.dot(_up));
    if (_t1.lengthSq() < 1) return;
    _t1.normalize();
    const ang = Math.atan2(_t2.crossVectors(_fwd, _t1).dot(_up), _fwd.dot(_t1));
    _dq.setFromAxisAngle(_up, ang * Math.min(1, dt * 10));
    this.q.premultiply(_dq).normalize();
  }

  // Body vs. ground, track and scenery. Impulse-based with positional correction.
  collide() {
    // Underbody hits (landings) are reported apart from nose, tail and side hits
    let impact = 0, under = 0, roof = false;
    const world = this.world;
    for (const h of HULL) {
      _p.copy(h.p).applyQuaternion(this.q).add(this.pos);
      _r.subVectors(_p, this.pos);
      let pen = 0;
      const gy = world.groundHeight(_p.x, _p.z);
      if (_p.y < gy) { pen = gy - _p.y; world.groundNormal(_p.x, _p.z, _n); }
      const len = _r.length();
      _d.copy(_r).divideScalar(len);
      const hit = world.raycast(this.pos, _d, len, false);
      if (hit && len - hit.dist > pen) { pen = len - hit.dist; _n.copy(hit.normal); }
      if (pen <= 0) continue;
      if (h.roof) roof = true;
      _pv.crossVectors(this.w, _r).add(this.vel);
      const vn = _pv.dot(_n);
      if (vn < 0) {
        if (h.under) under = Math.max(under, -vn); else impact = Math.max(impact, -vn);
        const k = 1 / MASS + _n.dot(_t2.crossVectors(this.invInertia(_t1.crossVectors(_r, _n), _J), _r));
        const j = -1.2 * vn / k;
        _J.copy(_n).multiplyScalar(j);
        _vt.copy(_pv).addScaledVector(_n, -vn);
        const vtl = _vt.length();
        if (vtl > 1e-4) _J.addScaledVector(_vt, -Math.min(vtl / k, 0.3 * j) / vtl);
        this.applyImpulse(_r, _J);
      }
      this.pos.addScaledVector(_n, pen * 0.8);
    }

    // Trees: vertical cylinders
    for (const t of world.trees) {
      const dx = this.pos.x - t.x, dz = this.pos.z - t.z;
      const d = Math.hypot(dx, dz), min = t.r + 1.3;
      if (d < min && d > 1e-3 && this.pos.y < 6) {
        _n.set(dx / d, 0, dz / d);
        const vn = this.vel.dot(_n);
        if (vn < 0) { impact = Math.max(impact, -vn); this.vel.addScaledVector(_n, -1.4 * vn); this.vel.multiplyScalar(0.7); }
        this.pos.addScaledVector(_n, min - d);
      }
    }

    // Arena fence
    for (const axis of ['x', 'z']) {
      if (Math.abs(this.pos[axis]) > WORLD_LIMIT - 1.5) {
        const s = Math.sign(this.pos[axis]);
        this.pos[axis] = s * (WORLD_LIMIT - 1.5);
        if (this.vel[axis] * s > 0) { impact = Math.max(impact, Math.abs(this.vel[axis])); this.vel[axis] *= -0.3; }
      }
    }
    return { impact, under, roof };
  }
}

// ---------- Model ----------

function profileShape(points) {
  const s = new THREE.Shape();
  // profile points given as [z, y]; extrusion runs along x after rotation
  points.forEach(([z, y], i) => (i ? s.lineTo(-z, y) : s.moveTo(-z, y)));
  return s;
}

function extrudeAcross(points, width, mat) {
  const g = new THREE.ExtrudeGeometry(profileShape(points), { depth: width, bevelEnabled: false });
  g.rotateY(Math.PI / 2);
  g.translate(-width / 2, 0, 0);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

export function buildCarModel(colour, { ghost = false, kind = 'comet' } = {}) {
  const root = new THREE.Group();
  const mk = c => ghost
    ? new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.32, depthWrite: false })
    : new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const paint = mk(colour), glass = mk('#1d2633'), black = mk('#18181a'), chrome = mk('#c9ccd2'),
    head = mk('#fff6c8'), tail = mk('#e0241b');
  const add = (w, h, d, x, y, z, m) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    b.castShadow = !ghost;
    root.add(b);
    return b;
  };

  if (kind === 'hopper') {
    // Open buggy: low tub, roll cage, bull bar
    root.add(extrudeAcross([[-2.0, -0.42], [-2.05, -0.02], [-1.25, 0.08], [1.45, 0.08], [2.0, 0.22], [2.0, -0.42]], 1.6, paint));
    add(1.1, 0.3, 0.9, 0, 0.2, 0.35, black);              // seats
    for (const x of [-0.72, 0.72]) for (const z of [-0.45, 1.05]) add(0.08, 0.95, 0.08, x, 0.55, z, black);
    for (const z of [-0.45, 1.05]) add(1.52, 0.08, 0.08, 0, 1.0, z, black);
    for (const x of [-0.72, 0.72]) add(0.08, 0.08, 1.58, x, 1.0, 0.3, black);
    add(1.5, 0.1, 0.1, 0, 0.05, -2.12, chrome);           // bull bar
    add(0.1, 0.4, 0.1, -0.55, -0.1, -2.12, chrome);
    add(0.1, 0.4, 0.1, 0.55, -0.1, -2.12, chrome);
    add(1.0, 0.36, 0.5, 0, 0.18, 1.75, black);            // engine
  } else if (kind === 'brute') {
    // Muscle car: long hood with a scoop, cabin set back, ducktail
    root.add(extrudeAcross([[-2.25, -0.42], [-2.3, 0.0], [-0.55, 0.2], [0.95, 0.22], [1.9, 0.26], [2.22, 0.34], [2.22, -0.42]], 1.9, paint));
    root.add(extrudeAcross([[-0.35, 0.19], [0.1, 0.6], [1.0, 0.6], [1.75, 0.25]], 1.52, glass));
    root.add(extrudeAcross([[0.12, 0.58], [0.98, 0.58], [0.96, 0.64], [0.14, 0.64]], 1.4, paint));
    add(0.55, 0.16, 0.9, 0, 0.26, -1.2, black);            // hood scoop
    add(1.94, 0.1, 4.5, 0, -0.38, 0, black);
    for (const x of [-0.5, 0.5]) add(0.35, 0.05, 4.42, x, 0.215, -0.1, mk('#f2f2f2'));   // racing stripes
  } else {
    root.add(extrudeAcross([[-2.15, -0.42], [-2.2, -0.1], [-1.15, 0.12], [-0.45, 0.2], [0.75, 0.2], [1.6, 0.26],
      [2.15, 0.3], [2.15, -0.42]], 1.82, paint));
    root.add(extrudeAcross([[-0.55, 0.17], [-0.05, 0.62], [0.95, 0.62], [1.6, 0.25]], 1.5, glass));
    root.add(extrudeAcross([[-0.02, 0.6], [0.92, 0.6], [0.9, 0.66], [0.02, 0.66]], 1.38, paint));
    add(1.9, 0.08, 0.5, 0, 0.52, 1.95, paint);           // spoiler wing
    add(0.1, 0.25, 0.22, -0.65, 0.38, 1.95, black);
    add(0.1, 0.25, 0.22, 0.65, 0.38, 1.95, black);
    add(1.84, 0.12, 4.36, 0, -0.38, 0, black);           // sill / skirt
    add(0.6, 0.06, 0.18, 0, -0.32, -2.22, chrome);
  }
  const hz = kind === 'brute' ? -2.32 : -2.2, tz = kind === 'brute' ? 2.25 : 2.16;
  add(0.42, 0.14, 0.06, -0.62, -0.08, hz, head);
  add(0.42, 0.14, 0.06, 0.62, -0.08, hz, head);
  add(0.5, 0.14, 0.06, -0.6, kind === 'hopper' ? 0.0 : 0.1, tz, tail);
  add(0.5, 0.14, 0.06, 0.6, kind === 'hopper' ? 0.0 : 0.1, tz, tail);

  const tyreW = kind === 'hopper' ? 0.44 : kind === 'brute' ? 0.38 : 0.32;
  const wheelGeo = new THREE.CylinderGeometry(RADIUS, RADIUS, tyreW, 10).rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(RADIUS * 0.55, RADIUS * 0.55, tyreW + 0.02, 5).rotateZ(Math.PI / 2);
  const wheels = WHEELS.map(W => {
    const steerer = new THREE.Group();
    const spinner = new THREE.Group();
    const tyre = new THREE.Mesh(wheelGeo, black);
    const hub = new THREE.Mesh(hubGeo, chrome);
    tyre.castShadow = !ghost;
    spinner.add(tyre, hub);
    steerer.add(spinner);
    steerer.position.copy(W.p);
    steerer.position.x += Math.sign(W.p.x) * 0.06;
    root.add(steerer);
    return { steerer, spinner, base: W.p.y };
  });
  if (!ghost) root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  root.userData = { wheels, paint, head, tail };
  if (!ghost) {
    // Headlights, switched on after dark by setCarLights()
    const spot = new THREE.SpotLight('#fff1cc', 0, 90, 0.5, 0.55, 1);
    spot.position.set(0, 0.1, -2.1);
    spot.target.position.set(0, -1.6, -16);
    const beamGeo = new THREE.CylinderGeometry(0.15, 3.2, 14, 14, 1, true).rotateX(Math.PI / 2).translate(0, 0, -9.1);
    const beamMat = new THREE.MeshBasicMaterial({ color: '#fff0c0', transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const beams = [-0.62, 0.62].map(x => {
      const b = new THREE.Mesh(beamGeo, beamMat);
      b.position.set(x, -0.08, 0);
      b.rotation.x = -0.06;
      b.visible = false;
      return b;
    });
    root.add(spot, spot.target, ...beams);
    Object.assign(root.userData, { spot, beams, beamMat });
  }
  return root;
}

// Lamps for the time of day: 0 = off (daylight), 1 = full night.
export function setCarLights(model, level) {
  const u = model.userData;
  if (!u.spot) return;
  u.spot.intensity = level * 40;
  u.beamMat.opacity = 0.06;
  for (const b of u.beams) b.visible = level >= 1;   // visible beams only in full darkness
  u.head.emissive.set(level > 0 ? '#fff3c0' : '#000000');
  u.tail.emissive.set(level > 0 ? '#ff2010' : '#000000');
}

// Pose a model from a state snapshot {pos, q, steer, comps[4], spins[4]}
export function poseCarModel(model, pos, q, steer, comps, spins) {
  model.position.copy(pos);
  model.quaternion.copy(q);
  model.userData.wheels.forEach((w, i) => {
    w.steerer.position.y = w.base - (REST - comps[i]);
    w.steerer.rotation.y = WHEELS[i].front ? -steer : 0;
    w.spinner.rotation.x = -spins[i];
  });
}
