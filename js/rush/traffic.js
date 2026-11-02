// Traffic: cars, vans, buses and tankers that keep to their lanes, keep their distance, stop at red lights
// and, like real drivers, see trouble a moment too late. Far from the action they glide along their lane
// without physics (cheap); near it they're full rigid bodies that can be hit, spun and piled up.
import * as THREE from 'three';
import { laneOffset, rightOf } from './city.js';
import { TRAFFIC } from './roster.js';

const RIDE = 0.88;              // a resting car's height above the road
const WAKE = 95;                // physics within this distance of the camera's subject
const CALM = 25;                // seconds into a crash when drivers start to see trouble coming (all of them by CALM + 4)
const _l = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _q = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;

// A lane: a straight line along a road, `off` to the right of its centre line
export class Lane {
  constructor(city, def, index) {
    const r = city.roads.find(o => o.name === def.road);
    Object.assign(this, def);
    this.index = index;
    this.city = city;
    const fwd = def.side > 0;
    const [dx, dz] = fwd ? r.dir : [-r.dir[0], -r.dir[1]];
    const [ax, az] = fwd ? [r.x0, r.z0] : [r.x1, r.z1];
    const off = laneOffset(r, 1, def.i);
    const [rx, rz] = rightOf(dx, dz);
    this.dx = dx; this.dz = dz;
    this.ax = ax + rx * off; this.az = az + rz * off;
    this.len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0);
    this.rx = rx; this.rz = rz;
    // Where the junction is along this lane
    const [jx, jz] = city.level.junction;
    this.jS = (jx - this.ax) * dx + (jz - this.az) * dz;
    this.yaw = Math.atan2(-dx, -dz);
    this.cars = [];        // on this lane, sorted by progress
    this.next = 0;         // time to the next spawn
    this.speedMid = (def.speed[0] + def.speed[1]) / 2;
    // Busy lanes run from a little way out (beyond sight down a street lined with buildings) to past the junction
    this.from = def.spawn ? Math.max(0, this.jS - 230) : 0;
    this.to = def.spawn ? Math.min(this.len, this.jS + 250) : this.len;
  }
  x(s) { return this.ax + this.dx * s; }
  z(s) { return this.az + this.dz * s; }
  progress(p) { return (p.x - this.ax) * this.dx + (p.z - this.az) * this.dz; }
  lateral(p) { return (p.x - this.ax) * this.rx + (p.z - this.az) * this.rz; }
}

// A traffic driver. Until you crash they're model drivers, so the junction is the same every time you
// arrive. Once you've crashed they're the other kind: `react`: seconds before they act on trouble ahead;
// `brakeMax`: how hard they brake (0..1), never hard enough; `swerveK`: how likely they are to yank the
// wheel instead. Slow to see trouble and slower to stop, mostly they drive into it, until a crash has gone on
// long enough (CALM) and, one by one, they start stopping in time.
export class TrafficDriver {
  constructor(lane, cruise, rand) {
    this.lane = lane;
    this.cruise = cruise;
    this.rand = rand;
    this.react = 0.9 + rand() * 0.7;
    this.brakeMax = 0.16 + rand() * 0.2;
    this.swerveK = rand();
    this.wakesAt = CALM + rand() * 4;
    this.alert = 0;
    this.swerve = 0;
    this.swerveT = 0;
    this.startled = null;      // a crash nearby: { t: until the shock reaches us, k: how hard }
    this.calm = 0;
    this.out = false;          // knocked out of it by a hit: no more driving
  }

  // Something crashed nearby: in `delay` seconds (when the shock reaches them) they flinch, `k` 0..1
  startle(delay, k) {
    if (this.out || this.calm > 0 || (this.startled && this.startled.k >= k)) return;
    this.startled = { t: delay, k };
  }

  // Controls for one step. `bodies` is everything solid nearby; `careful`: a model driver.
  drive(v, bodies, dt, input, careful) {
    const c = v.car, L = this.lane;
    input.handbrake = false; input.boost = false; input.stop = true;   // traffic never reverses
    // Knocked out: foot off, rolling on into whatever's next
    if (this.out) { input.throttle = 0; input.brake = 0.04; input.steer = 0; return; }
    this.calm -= dt;
    const s = L.progress(c.pos);
    _f.set(0, 0, -1).applyQuaternion(c.q);
    const sp = c.speed;
    // Steer for a point down the lane
    const look = s + Math.max(7, sp * 0.8);
    _l.set(L.x(look), c.pos.y, L.z(look)).sub(c.pos).applyQuaternion(_q.copy(c.q).invert());
    let steer = clamp(Math.atan2(_l.x, -_l.z) * 2.4, -1, 1);
    // What's ahead: the nearest thing in our path, and how fast we're closing on it
    _r.set(-_f.z, 0, _f.x);
    let gap = Infinity, closing = 0, lead = 0;
    for (const b of bodies) {
      if (b === v) continue;
      const p = b.car.pos;
      const rx = p.x - c.pos.x, rz = p.z - c.pos.z;
      if (Math.abs(rx) > 50 || Math.abs(rz) > 50 || Math.abs(p.y - c.pos.y) > 3) continue;
      const along = rx * _f.x + rz * _f.z;
      if (along <= 0 || along > 50) continue;
      const lat = rx * _r.x + rz * _r.z;
      if (Math.abs(lat) > 1.25 + (b.r || 1)) continue;
      const g = along - v.len / 2 - (b.len || 2) / 2;
      if (g < gap) { gap = g; const bv = b.car.vel.x * _f.x + b.car.vel.z * _f.z; closing = sp - bv; lead = bv; }
    }
    // The red light
    if (L.stop != null && s < L.stop) {
      const g = L.stop - s - v.len / 2;
      if (g < gap) { gap = g; closing = sp; lead = 0; }
    }
    // Keep a safe distance from a moving car ahead; brake for a hazard once we've noticed it
    let want = this.cruise;
    if (gap < Infinity) want = Math.min(want, Math.max(0, lead + (gap - 6) * 0.45));
    const danger = closing > 1 && gap < closing * 1.6 + 3;
    this.alert = danger ? this.alert + dt : Math.max(0, this.alert - dt * 2);
    const noticed = this.alert > this.react;
    let throttle = 0, brake = 0;
    const err = want - sp;
    if (careful) {
      // Sees it all, brakes in time, never flinches
      this.alert = 0; this.startled = null; this.swerveT = 0;
      if (err > 0.3) throttle = clamp(err * 0.35, 0, 0.85);
      else if (err < -0.3) brake = clamp(-err * 0.3, 0, 1);
      if (closing > 0.5 && gap < closing * closing / 14 + 3) { brake = 1; throttle = 0; }
      input.throttle = throttle; input.brake = brake; input.steer = steer;
      return;
    }
    if (err > 0.3) throttle = clamp(err * 0.35, 0, 0.85);
    else if (err < -0.5) brake = clamp(-err * 0.08, 0, 0.2);
    if (danger && !noticed) { brake = 0; throttle = Math.min(throttle, 0.3); }     // hasn't seen it yet
    if (noticed) {
      brake = this.brakeMax;
      throttle = 0;
      // Too late to stop: some swerve
      if (!this.swerveT && closing > 6 && gap / closing < 1.1 && this.swerveK > 0.6) {
        this.swerveT = 0.7;
        this.swerve = (this.rand() < 0.5 ? -1 : 1) * 0.7;
      }
    }
    // The shock of a crash nearby reaches them: a jerk of the wheel (and sometimes a stab at the pedals),
    // harder the closer it was
    const S = this.startled;
    if (S && (S.t -= dt) <= 0) {
      this.startled = null;
      this.calm = 0.8;
      this.swerveT = 0.25 + 0.45 * S.k;
      this.swerve = (this.rand() < 0.5 ? -1 : 1) * (0.25 + 0.75 * S.k);
      this.jab = this.rand() < 0.5 ? 'brake' : 'gas';
    }
    if (this.swerveT > 0) {
      this.swerveT = Math.max(0, this.swerveT - dt);
      steer = clamp(steer + this.swerve, -1, 1);
      if (this.jab === 'brake') { brake = Math.max(brake, this.brakeMax); throttle = 0; } else if (this.jab === 'gas') throttle = 1;
      if (!this.swerveT) { this.swerveT = -1; this.jab = null; }
    }
    input.throttle = throttle; input.brake = brake; input.steer = steer;
  }
}

// Every vehicle in the junction's traffic, spawning, gliding, waking up and leaving
export class Traffic {
  constructor(city, level, makeVehicle, rand) {
    this.city = city;
    this.make = makeVehicle;           // (kind, lane, s, speed) => vehicle
    this.rand = rand;
    this.lanes = level.lanes.map((d, i) => new Lane(city, d, i));
    this.list = [];
    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };
  }

  // The starting traffic: cars along the run-up, queues at the lights, busy cross streets, and the specials
  populate(level) {
    const R = this.rand;
    for (const L of this.lanes) {
      const pick = () => L.speed[0] + R() * (L.speed[1] - L.speed[0]);
      // Bumper to bumper, back from the stop line
      let at = L.stop - 1;
      const queue = Array.isArray(L.queue) ? L.queue : Array(L.queue || 0).fill(null);
      for (const k of queue) { const kind = k || this.kind(L), len = TRAFFIC[kind].size[1]; const v = this.add(kind, L, at - len / 2, 0, true); if (k) v.special = k; at -= len + 2; }
      const back = at;
      if (L.fill) {
        for (let s = L.fill[0]; s < L.fill[1]; s += L.gap[0] + R() * (L.gap[1] - L.gap[0])) {
          if (L.stop != null && s > L.stop - 40 && s < L.stop) continue;
          this.add(this.kind(L), L, s, pick());
        }
      }
      if (L.spawn) {
        for (let s = L.from + 5; s < L.to - 5;) {
          const sp = pick();
          // (not on top of a queue: they'll join the back of it)
          if (!queue.length || s < back - 25 || s > L.stop + 5) this.add(this.kind(L), L, s, sp);
          s += sp * (L.gap[0] + R() * (L.gap[1] - L.gap[0]));
        }
        L.next = L.gap[0] + R() * (L.gap[1] - L.gap[0]);
      }
    }
    // The big ones, timed to reach the junction when a fast run does: clear room for them
    for (const sp of level.specials || []) {
      const L = this.lanes[sp.lane];
      // (clear room where it actually goes: a long eta is held back to the start of the lane)
      const s = Math.max(L.from + 2, L.jS - L.speedMid * sp.eta);
      for (const v of L.cars.filter(c => Math.abs(c.s - s) < 16)) this.remove(v);
      const v = this.add(sp.kind, L, s, L.speedMid);
      v.special = sp.kind;
    }
  }

  // A mix like a real street: mostly cars, some vans and pickups, and on the busy roads buses and trucks
  kind(L) {
    const r = this.rand();
    if (L.spawn) {
      if (r < 0.07) return 'bus';
      if (r < 0.1) return 'tanker';
      if (r < 0.15) return 'lorry';
      if (r < 0.19) return 'flatbed';
    } else if (r < 0.06) return ['lorry', 'flatbed', 'bus'][Math.floor(this.rand() * 3)];
    if (r < 0.27) return 'van';
    if (r < 0.31) return 'garbage';
    if (r < 0.36) return 'pickup';
    if (r < 0.39) return 'police';
    return ['hatch', 'coupe', 'cab', 'saloon', 'suv', 'saloon', 'hatch'][Math.floor(this.rand() * 7)];
  }

  add(kind, L, s, speed, parked = false) {
    const v = this.make(kind, L);
    v.lane = L;
    v.s = s;
    v.glide = speed;
    v.asleep = true;
    v.driver = new TrafficDriver(L, parked ? L.speedMid : speed || L.speedMid, this.rand);
    this.place(v);
    L.cars.push(v);
    L.cars.sort((a, b) => a.s - b.s);
    this.list.push(v);
    return v;
  }

  remove(v) {
    const i = this.list.indexOf(v);
    if (i >= 0) this.list.splice(i, 1);
    const k = v.lane?.cars.indexOf(v);
    if (k >= 0) v.lane.cars.splice(k, 1);
    v.dispose();
  }

  // A sleeping vehicle sits exactly on its lane, tilted with the road
  place(v) {
    const L = v.lane, c = v.car, s = v.s;
    const x = L.x(s), z = L.z(s);
    const h0 = this.city.groundHeight(L.x(s - 2), L.z(s - 2)), h1 = this.city.groundHeight(L.x(s + 2), L.z(s + 2));
    c.pos.set(x, (h0 + h1) / 2 + RIDE, z);
    _f.set(L.dx, (h1 - h0) / 4, L.dz).normalize();
    _r.crossVectors(_f, _up).normalize();
    _l.crossVectors(_r, _f);
    _m.makeBasis(_r, _l, _f.negate());
    c.q.setFromRotationMatrix(_m);
    c.vel.set(L.dx * v.glide, 0, L.dz * v.glide);
    c.w.set(0, 0, 0);
    c.speed = v.glide;
    for (const w of c.wheels) { w.comp = 0.08; w.contact = true; w.spin += v.glide / 0.36 / 120; }
  }

  // Before the physics step: spawn, glide the sleepers, wake the ones near `focus` ({ x, z, dx, dz }: where the
  // player is and which way they're going), drive the awake ones. `crashT`: how long you've been crashing (null
  // before you crash).
  update(dt, focus, bodies, spawning, crashT = null) {
    for (const L of this.lanes) {
      if (spawning && L.spawn && (L.next -= dt) <= 0) {
        L.next = L.gap[0] + this.rand() * (L.gap[1] - L.gap[0]);
        const first = L.cars[0];
        if (!first || first.s > L.from + 14) this.add(this.kind(L), L, L.from, L.speed[0] + this.rand() * (L.speed[1] - L.speed[0]));
      }
      // Sleepers follow the car ahead in their lane (one dimension, no physics)
      for (let k = L.cars.length - 1; k >= 0; k--) {
        const v = L.cars[k];
        if (!v.asleep) continue;
        const ahead = L.cars[k + 1];
        // (in a crash they don't see what's waiting for them: they'll be awake, and too late, by the time they get there)
        const wild = crashT != null && crashT < v.driver.wakesAt;
        let want = v.driver.cruise;
        if (ahead && !(wild && !ahead.asleep)) want = Math.min(want, Math.max(0, (ahead.asleep ? ahead.glide : Math.max(0, ahead.car.speed)) + (ahead.s - v.s - (ahead.len + v.len) / 2 - 6) * 0.5));
        if (!wild && L.stop != null && v.s < L.stop) want = Math.min(want, Math.max(0, (L.stop - v.s - v.len / 2 - 1) * 0.5));
        v.glide += clamp(want - v.glide, -6 * dt, 3 * dt);
        v.s += v.glide * dt;
        this.place(v);
      }
    }
    // Wake up near the action; leave at the end of the lane (or once far behind the player, before a crash)
    for (let i = this.list.length - 1; i >= 0; i--) {
      const v = this.list[i], p = v.car.pos;
      const d = Math.hypot(p.x - focus.x, p.z - focus.z);
      if (v.asleep && d < WAKE) v.asleep = false;
      if (!v.asleep) {
        v.s = v.lane.progress(p);
        this.input.throttle = 0;
        v.driver.drive(v, bodies, dt, this.input, crashT == null || crashT > v.driver.wakesAt);
        v.input = { ...this.input };
      }
      const behind = (p.x - focus.x) * focus.dx + (p.z - focus.z) * focus.dz < -150;
      if ((v.s > v.lane.to - 3 && (v.asleep || d > 60)) || (behind && !v.touched)) this.remove(v);
    }
    for (const L of this.lanes) L.cars.sort((a, b) => a.s - b.s);
  }
}
