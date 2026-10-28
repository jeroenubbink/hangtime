// Stunt scoring: airtime, flips, rolls, spins, loops and drifts. Stunts landed within a few seconds of
// each other chain into a combo multiplier; crashing loses whatever was still in progress.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const CHAIN_WINDOW = 6;
const _qi = new THREE.Quaternion(), _w = new THREE.Vector3(), _r = new THREE.Vector3();

export class Stunts {
  constructor() { this.reset(); }

  reset() {
    this.score = 0;
    this.count = 0;
    this.biggestAir = 0;
    this.chain = 0;
    this.chainT = 0;
    this.air = null;
    this.pending = null;
    this.loop = false;
    this.drift = 0;
    this.driftCool = 0;
  }

  // Forget in-progress stunts without penalty (respawns, manual resets).
  cancel() {
    this.air = this.pending = null;
    this.loop = false;
    this.drift = 0;
  }

  // Text for the live "in progress" indicator.
  get live() {
    if (this.air && this.air.t > 0.45) return `AIR ${this.air.t.toFixed(1)} s`;
    if (this.drift > 0.6) return `DRIFT ${this.drift.toFixed(1)} s`;
    return '';
  }

  get mult() { return this.chainT > 0 ? Math.min(5, this.chain) : 1; }

  // One physics step. Returns a list of award groups (each an array of {name, detail, pts}) landed this step.
  step(car, dt, ev, crashed) {
    const out = [];
    this.chainT = Math.max(0, this.chainT - dt);
    if (crashed) {
      if (this.air || this.pending || this.loop || this.drift > 0.6) out.push([{ name: 'BAILED', bail: true }]);
      this.cancel();
      this.chain = this.chainT = 0;
      return out;
    }

    // Airtime and rotation, measured in the car's own frame
    if (car.grounded === 0) {
      if (!this.air) this.air = { t: 0, x: car.pos.x, z: car.pos.z, pitch: 0, roll: 0, yaw: 0 };
      const a = this.air;
      a.t += dt;
      _w.copy(car.w).applyQuaternion(_qi.copy(car.q).invert());
      a.pitch += _w.x * dt;
      a.yaw += _w.y * dt;
      a.roll += _w.z * dt;
    } else if (this.air) {
      const a = this.air;
      this.air = null;
      if (a.t > 0.45) this.pending = { ...a, dist: Math.hypot(car.pos.x - a.x, car.pos.z - a.z), landing: ev.landing, wait: 0.4 };
    }
    // A jump only counts once the car has stayed on its wheels for a moment
    if (this.pending && (this.pending.wait -= dt) <= 0) {
      out.push(this.award(jumpAwards(this.pending)));
      this.biggestAir = Math.max(this.biggestAir, this.pending.t);
      this.pending = null;
    }

    // Loops: the car reached the top, and the lane assist has let go again
    if (car.loopTop) this.loop = true;
    else if (this.loop) {
      this.loop = false;
      out.push(this.award([{ name: 'LOOP', detail: '', pts: 300 }]));
    }

    // Drifts: sliding sideways at speed with the wheels down
    _r.set(1, 0, 0).applyQuaternion(car.q);
    const v = Math.hypot(car.vel.x, car.vel.z);
    const side = v > 1 ? Math.abs(car.vel.x * _r.x + car.vel.z * _r.z) / v : 0;
    if (car.grounded >= 3 && v > 12 && side > 0.26 && !car.loopTop) {
      this.drift += dt;
      this.driftCool = 0;
    } else if (this.drift > 0 && (this.driftCool += dt) > 0.35) {
      if (this.drift >= 1) out.push(this.award([{ name: 'DRIFT', detail: `${this.drift.toFixed(1)} s`, pts: Math.round(this.drift * 120) }]));
      this.drift = 0;
    }
    return out;
  }

  award(list) {
    this.chain = this.chainT > 0 ? this.chain + 1 : 1;
    this.chainT = CHAIN_WINDOW;
    const mult = this.mult;
    for (const a of list) {
      a.mult = mult;
      this.score += a.pts * mult;
      this.count++;
    }
    return list;
  }
}

function jumpAwards(j) {
  const list = [];
  const name = j.t >= 2 ? 'HUGE AIR' : j.t >= 1.2 ? 'BIG AIR' : 'AIR';
  list.push({ name, detail: `${j.t.toFixed(1)} s · ${Math.round(j.dist)} m`, pts: Math.round(j.t * 150 + j.dist * 3) });
  const times = n => (n === 1 ? '' : n === 2 ? 'DOUBLE ' : n === 3 ? 'TRIPLE ' : n + '× ');
  const flips = Math.floor((Math.abs(j.pitch) + 0.5) / TAU);
  if (flips) list.push({ name: times(flips) + (j.pitch > 0 ? 'BACKFLIP' : 'FRONTFLIP'), detail: '', pts: 600 * flips });
  const rolls = Math.floor((Math.abs(j.roll) + 0.5) / TAU);
  if (rolls) list.push({ name: times(rolls) + 'BARREL ROLL', detail: '', pts: 500 * rolls });
  const spins = Math.floor((Math.abs(j.yaw) + 0.4) / Math.PI);
  if (spins) list.push({ name: `${spins * 180}° SPIN`, detail: '', pts: 200 * spins });
  if (j.landing < 5 && j.t > 0.8) list.push({ name: 'SMOOTH LANDING', detail: '', pts: 100 });
  return list;
}
