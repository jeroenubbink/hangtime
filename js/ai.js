// Computer rival: pure-pursuit steering along a racing line through the tile path, and a speed plan that
// looks a few tiles ahead like a driver would. Jumps and loops have fixed speeds that work; skill only
// scales the rest.
import { GRID, DIRS, HALF } from './pieces.js';
import { cellCenter, cellOf } from './track.js';

export const SKILLS = {
  rookie: { name: 'Rookie', pace: 0.8 },
  pro: { name: 'Pro', pace: 1 },
  ace: { name: 'Ace', pace: 1, nitro: true },
};

// Comfortable speeds per piece (m/s). Loop and jump speeds are not scaled by skill.
const WANT = { loop: 24, corner: 15, banked: 20.5, hump: 34, straight: 40, start: 40, ramp: 30, boost: 40,
  corkscrew: 21, pipe: 36, tunnel: 40, chicane: 15, dirt: 33, ice: 25, kicker: 24 };
const SCALED = new Set(['corner', 'banked', 'hump', 'straight', 'start', 'boost', 'pipe', 'tunnel', 'chicane', 'dirt', 'ice']);
// Line radius through curves: the middle of a flat curve; a banked one climbs the bowl mid-curve,
// where the bowl is highest, and comes back to the middle at either end.
const RADIUS = { corner: () => 14, banked: s => 14 + 2.5 * Math.sin(Math.PI * s) };
const PER_TILE = 6;
const OPEN = new Set(['start', 'straight', 'corner', 'banked', 'hump', 'boost', 'pipe', 'tunnel', 'dirt', 'ice']);
// Tiles with a set line through them (no lane offset, steering handled or fixed)
const SET_LINE = new Set(['loop', 'corkscrew', 'kicker']);
const WHEELBASE = 2.6;

export class Driver {
  // `lane`: sideways offset (m, + is right) kept on straight pieces so two cars can run side by side.
  constructor(path, grid, skill, lane = 0) {
    this.path = path;
    this.grid = grid;
    this.pace = SKILLS[skill].pace;
    this.nitro = !!SKILLS[skill].nitro;
    this.tank = 0.5;
    this.line = racingLine(path, lane);
  }

  // `other` is the car to keep clear of when catching it up.
  drive(car, next, out, other) {
    const path = this.path, n = path.length, line = this.line;
    const sp = Math.abs(car.speed);

    // Nearest line point on the previous, current or next tile
    let best = 0, bd = Infinity;
    for (const k of [next - 2, next - 1, next]) {
      const t0 = ((k % n) + n) % n * PER_TILE;
      for (let i = t0; i < t0 + PER_TILE; i++) {
        const d = (line[i].x - car.pos.x) ** 2 + (line[i].z - car.pos.z) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
    }
    // Walk forward along the line to the look-ahead point
    const look = 6 + sp * 0.3;
    let j = best, acc = 0;
    while (acc < look) {
      const a = line[j], b = line[(j + 1) % line.length];
      acc += Math.hypot(b.x - a.x, b.z - a.z);
      j = (j + 1) % line.length;
    }
    let tx = line[j].x, tz = line[j].z;

    const q = car.q;
    const fx = -2 * (q.x * q.z + q.w * q.y), fz = -(1 - 2 * (q.x * q.x + q.y * q.y));
    // Overtaking: pull out to the side when closing on a car ahead, where the track is wide enough
    const here = path[(next - 1 + n) % n].t;
    if (other && OPEN.has(here) && OPEN.has(path[next].t)) {
      const rx = other.pos.x - car.pos.x, rz = other.pos.z - car.pos.z;
      const ahead = rx * fx + rz * fz, lat = rx * -fz + rz * fx;
      const closing = car.vel.x * fx + car.vel.z * fz - (other.vel.x * fx + other.vel.z * fz);
      if (ahead > 0 && ahead < 16 && Math.abs(lat) < 3 && closing > -1) {
        const side = lat > 0 ? 3.2 : -3.2;   // right of us → go left, and the other way round
        tx += fz * side;
        tz -= fx * side;
      }
    }
    const dx = tx - car.pos.x, dz = tz - car.pos.z;
    const alpha = Math.atan2(fx * dz - fz * dx, fx * dx + fz * dz);
    const delta = Math.atan2(2 * WHEELBASE * Math.sin(alpha), Math.hypot(dx, dz));
    const maxSteer = 0.55 - 0.43 * Math.min(1, sp / 45);
    out.steer = Math.max(-1, Math.min(1, 1.3 * delta / maxSteer));
    const [cx, cz] = cellOf(car.pos.x, car.pos.z);
    const cell = cz >= 0 && cz < GRID && cx >= 0 && cx < GRID ? this.grid[cz][cx] : null;
    if (cell && cell.t === 'loop' && car.pos.y > 0.5) out.steer = 0;   // the loop's lane assist does the steering
    if (car.rail) out.steer = 0;

    // Speed plan from the tile the car is on to a few tiles ahead. Each tile of run-up allows a bit more
    // speed, but only where the car can brake: it's half in the air over a hump and fully on the tile after.
    // Slippery surfaces brake less.
    const BRAKE = { hump: 3, kicker: 2, ice: 2.5, dirt: 4.5 };
    const brakeable = i => ['hump', 'kicker'].includes(path[(i - 1 + n) % n].t) ? 0 : BRAKE[path[i].t] ?? 6;
    let target = 40 * this.pace, credit = 0, bends = Infinity;
    for (let j = -1; j < 4; j++) {
      const k = (next + j + n) % n, t = path[k].t;
      if (j >= 1) credit += brakeable((k - 1 + n) % n);
      let w;
      if (t === 'ramp' && path[(k + 1) % n].t === 'water') {
        let gap = 0;
        while (gap < n && path[(k + 1 + gap) % n].t === 'water') gap++;
        w = gap === 1 ? 29 : 39;
        // A jump close ahead sets the speed outright, unless a bend comes first
        if (j >= 0 && j <= 2) { target = Math.min(w, bends); break; }
      } else if (t === 'water' || (t === 'ramp' && path[(k - 1 + n) % n].t === 'water')) w = 99;
      else w = (WANT[t] ?? 40) * (SCALED.has(t) ? this.pace : 1) * (car.world.wet && RADIUS[t] ? 0.9 : 1);
      target = Math.min(target, w + credit);
      if (RADIUS[t] || SET_LINE.has(t) || t === 'chicane') bends = Math.min(bends, w + credit);
    }
    if (path[next].t === 'water' || car.grounded === 0) target = -1;
    out.throttle = car.speed < target ? 1 : 0;
    const curve = RADIUS[here] || RADIUS[path[next].t];
    out.brake = target > 0 && car.speed > target + (curve ? 1 : 3) ? 1 : 0;
    out.handbrake = false;
    // Nitro (Ace only): on open road when well under the planned speed. The tank refills slowly.
    const dt = 1 / 120;
    out.boost = this.nitro && this.tank > 0 && car.grounded > 0 && OPEN.has(here) && !RADIUS[here] && Math.abs(out.steer) < 0.3 && target > car.speed + 4;
    this.tank = Math.min(1, this.tank + (out.boost ? -dt / 3 : dt * 0.1));
    return out;
  }
}

// PER_TILE points per path tile, from its entry edge towards its exit edge. Loops and curves are taken
// in the middle; the lane offset applies on straight pieces and fades in and out next to them. The tile
// before a loop stays centred so the car arrives straight.
const LANED = new Set(['start', 'straight', 'ramp', 'water', 'hump', 'boost', 'pipe', 'tunnel', 'dirt', 'ice']);
function racingLine(path, lane) {
  const pts = [], n = path.length;
  const f = path.map(p => (LANED.has(p.t) ? 1 : 0));
  path.forEach((p, k) => { if (SET_LINE.has(p.t)) f[(k - 1 + n) % n] = 0; });
  path.forEach((p, k) => {
    const [cx, cz] = cellCenter(p.x, p.z);
    const R = RADIUS[p.t];
    const din = DIRS[p.hin], dout = DIRS[p.hout];
    const fin = Math.min(f[(k - 1 + n) % n], f[k]), fout = Math.min(f[k], f[(k + 1) % n]);
    for (let i = 0; i < PER_TILE; i++) {
      const s = i / PER_TILE;
      if (R) {
        // Arc around the inside corner, from the entry edge to the exit edge
        const ox = cx - din[0] * HALF + dout[0] * HALF, oz = cz - din[1] * HALF + dout[1] * HALF;
        const th = s * Math.PI / 2, Rs = R(s);
        pts.push({ x: ox + Rs * (-dout[0] * Math.cos(th) + din[0] * Math.sin(th)), z: oz + Rs * (-dout[1] * Math.cos(th) + din[1] * Math.sin(th)) });
      } else {
        // Through the chicane, a smooth S that clips the inside of both bends
        const off = lane * (fin + (fout - fin) * s) + (p.t === 'chicane' ? 1.5 * Math.sin(2 * Math.PI * s) : 0);
        const r = DIRS[(p.hin + 1) % 4];
        pts.push({ x: cx + din[0] * HALF * (2 * s - 1) + r[0] * off, z: cz + din[1] * HALF * (2 * s - 1) + r[1] * off });
      }
    }
  });
  return pts;
}
