// Rushtime's streets. Roads are straight strips at any angle; everything off the road is pavement a curb higher,
// and buildings are boxes the cars bounce off. The ground is a height function (cheap enough for forty
// cars' wheels 120 times a second); buildings sit in a coarse grid so each car only checks a few.
import * as THREE from 'three';
import { merge } from '../scenery.js';
import { addDetail } from '../textures.js';
import { grounds } from './hotel.js';
import { t } from '../i18n.js';

export const LANE = 3.6;
export const CURB = 0.16;
const WALK = 5;                  // pavement width beside every road
const DEPTH = 26;                // the deepest a building along a street goes back from its pavement
// The edge of the town: this far from any paved ground (a road's edge, a lot), past the pavement and the deepest
// building, is the empty ground beyond it
export const EDGE = WALK + DEPTH + 1;
const CELL = 24;

function rng(seed) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }
const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _r = new THREE.Vector3(), _pv = new THREE.Vector3();
// How far a roof's top stands over `top`: a walk-up's cornice, a hall's ledge, a store's parapet, a tower's crown
const ROOF = { walkup: 0.2, hall: 0.3, store: 0.2 };
const _g = new THREE.Vector3(), _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _J = new THREE.Vector3(), _vt = new THREE.Vector3();
// The rise across (a: ahead, h: here, b: behind), ignoring a side that's over a sheer edge (more than a metre and a
// half off: a roof's, the quay's or a bridge deck's, not a ramp's lip or a kerb): see groundNormal. (Out here, not a closure in it: it runs for every wheel and hull point, every step.)
// Whether a point `deep` under a raised surface (a roof, a bridge's deck), `inside` metres in from its edge, has come
// down onto it rather than up beside it: nearer the top than the edge (or only just under it), and never more than
// half a metre under (deeper than that it's in under the edge, not landing). One beside it is
// the wall's to push off, not lifted metres onto the top, or thrown out sideways over the street by its edge.
const onTop = (deep, inside) => deep < 0.3 || (deep < inside && deep < 0.5);
function edgeSlope(a, h, b) {
  const da = a - h, db = h - b;
  return Math.abs(da) > 1.5 ? (Math.abs(db) > 1.5 ? 0 : 2 * db) : Math.abs(db) > 1.5 ? 2 * da : da + db;
}

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
    this.ramps = (level.ramps || []).map(arc);
    // (everything the ramps cover, to look no further for most of the town)
    this.rampBox = this.ramps.reduce((b, r) => [Math.min(b[0], r.x - r.w / 2), Math.max(b[1], r.x + r.w / 2), Math.min(b[2], r.z - r.len), Math.max(b[3], r.z)], [Infinity, -Infinity, Infinity, -Infinity]);
    // Where two big ramps meet side by side, a fin between them (see contain): { x, a, b }, a on its left
    this.fins = [];
    for (const a of this.ramps) for (const b of this.ramps) {
      if (a.R && b.R && a !== b && Math.abs(a.x + a.w / 2 - (b.x - b.w / 2)) < 0.01) this.fins.push({ x: a.x + a.w / 2, a, b });
    }
    // (a jetty, `jetties`: [[x0, x1, z0, z1]], out into the water is dry ground at the quay's height, on a concrete block)
    const W = level.water, J = W?.jetties || [], onJetty = (x, z) => J.some(([a, b, c, d]) => x > a && x < b && z > c && z < d);
    const below = (x, z) => W.below(x, z) && !onJetty(x, z);
    // (`beside`: within a long vehicle's half-length of the water, for what's gone over the edge, see groundHeight)
    this.water = W ? { ...W, wet: W.below, below, beside: (x, z) => below(x + 4.6, z) || below(x - 4.6, z) || below(x, z + 4.6) || below(x, z - 4.6) } : null;
    this.deck = level.deck || null;
    this.blocks = [];
    this.grid = new Map();
    // (and what only the camera keeps clear of: a crane's steel, a water tank on a roof; see screen())
    this.screens = new Map();
    // (what floats, a boat: ground over the water while its `top` is up, see groundHeight)
    this.floats = [];
    this.rand = rng(level.seed || 7);
    this.lit = [];
    this.buildRoads();
    this.buildBlocks();
    this.buildGround();
    if (this.water) this.buildWater();
    for (const r of this.ramps) this.group.add(r.angle ? arcMesh(r, this.base(r.x, r.z)) : rampMesh(r, this.base(r.x, r.z)));
    if (this.fins.length) this.group.add(finMesh(this.fins, (x, z) => this.base(x, z)));
    if (this.deck) this.buildDeck();
    if (level.grounds) this.group.add(grounds(this, level.grounds));
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
  // On a road (`under`: true, only the roads that run under a bridge; false, only the ones that don't)
  isRoad(x, z, under) {
    for (const r of this.roads) {
      if (under != null && !!r.under !== under) continue;
      const [a, b, c, d] = r.rect;
      if (x < a || x > b || z < c || z > d) continue;
      const px = x - r.x0, pz = z - r.z0, u = px * r.dir[0] + pz * r.dir[1], v = px * r.rv[0] + pz * r.rv[1];
      if (u >= 0 && u <= r.len && v >= r.vLo && v <= r.vHi) return true;
    }
    return false;
  }
  // How far (x, z) is from the nearest road edge (negative on a road; `under` as for isRoad)
  roadDist(x, z, under) {
    let best = Infinity;
    for (const r of this.roads) {
      if (under != null && !!r.under !== under) continue;
      const px = x - r.x0, pz = z - r.z0, u = px * r.dir[0] + pz * r.dir[1], v = px * r.rv[0] + pz * r.rv[1];
      const du = Math.max(-u, u - r.len), dv = Math.max(r.vLo - v, v - r.vHi);
      best = Math.min(best, Math.hypot(Math.max(du, 0), Math.max(dv, 0)) + Math.min(Math.max(du, dv), 0));
    }
    return best;
  }
  // How far (x, z) is from the nearest paved ground: a road's edge or a lot's (negative on one)
  pavedDist(x, z) {
    let best = this.roadDist(x, z);
    for (const { rect: [a, b, c, d] } of this.level.lots || []) {
      const dx = Math.max(a - x, x - b), dz = Math.max(c - z, z - d);
      best = Math.min(best, Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0));
    }
    return best;
  }
  // In one of the level's lots (a forecourt, a car park): paved, and no buildings
  inLot(x, z, m = 0) {
    for (const { rect: [a, b, c, d] } of this.level.lots || []) if (x > a - m && x < b + m && z > c - m && z < d + m) return true;
    return false;
  }
  // In the level's open ground (grass, and no buildings)
  inPark(x, z) {
    const P = this.level.park;
    return !!P && x > P[0] && x < P[1] && z > P[2] && z < P[3];
  }

  // On the bridge deck (a level road over a road that runs under it: { rect, y })
  inDeck(x, z, m = 0) {
    if (!this.deck) return false;
    const [a, b, c, d] = this.deck.rect;
    return x > a - m && x < b + m && z > c - m && z < d + m;
  }
  // The ground's height under (x, z), on a bridge's deck if there's one there (for what stands on it)
  top(x, z) { return this.inDeck(x, z) ? this.deck.y : this.base(x, z); }
  // The height a road's surface follows: the deck's over the bridge (unless it's the road under it), right to
  // its edges
  roadBase(r, x, z) { return !r.under && this.inDeck(x, z, 0.05) ? this.deck.y : this.base(x, z); }
  // The ground under (x, z), from height y: on a bridge, the deck from anywhere near or above it, and the road
  // under it from below. (py: the height of the point itself, of a body whose middle is at y)
  groundHeight(x, z, y = Infinity, py = y) {
    // (for something already down below the quay's top (its middle lower than anything lying on it), going in over the edge, the quay's edge is water too: else the
    // end of it that's still over the quay is pushed out of it, and throws it metres out across the harbour)
    // (from the ground there, not from 0: a quay needn't stand at street level)
    if (this.water && (this.water.below(x, z) || (y - this.base(x, z) < 0.45 && this.water.beside(x, z)))) {
      // (a boat's deck, from above it)
      let f = -Infinity;
      if (y < Infinity) for (const b of this.floats) if (y > b.top - 0.6 && b.top > f && this.blockDist(b, x, z, _g) < 0) f = b.top;
      return f > -Infinity ? f : this.water.floor;
    }
    if (this.inDeck(x, z)) {
      const top = this.deck.y + (this.isRoad(x, z, false) ? 0 : CURB), [a, b, c, d] = this.deck.rect;
      // (its middle up at the deck: one coming up beside it from below, a long lorry with its end in under the deck,
      // isn't put on top)
      if (y > this.deck.y - 0.5 && onTop(top - py, Math.min(x - a, b - x, z - c, d - z))) return top;
      return this.base(x, z) + (this.isRoad(x, z, true) ? 0 : CURB);
    }
    let h = this.base(x, z) + (this.isRoad(x, z) ? 0 : CURB);
    const [ra, rb, rc, rd] = this.rampBox;
    if (x >= ra && x <= rb && z >= rc && z <= rd) for (const r of this.ramps) {
      if (Math.abs(x - r.x) > r.w / 2) continue;
      const t = (r.z - z) / r.len;   // 0 at the foot, 1 at the lip (ramps face -z)
      if (t <= 0 || t >= 1) continue;
      const rise = this.base(x, z) + rampRise(r, t);
      // (a big one's sides are walls: it's under the point only if that came down onto it, not in from beside it, off
      // the next one along)
      if (!r.R || rampOn(rise - py, r.w / 2 - Math.abs(x - r.x))) h = Math.max(h, rise);
    }
    // (a flat roof holds what comes down on it from above; a tower's tiers don't, and it slides off into the street)
    if (y < Infinity) for (const b of this.near(x, z)) {
      if (b.tiers || b.floor != null || y <= b.top - 0.6) continue;
      const roof = b.top + (ROOF[b.type] ?? 0.7), dist = this.blockDist(b, x, z, _g);
      if (dist < 0 && onTop(roof - py, -dist)) h = Math.max(h, roof);
    }
    return h;
  }
  // (across a sheer edge, a roof's or the quay's, only the side (x, z) is on counts: it's flat there, not a wall
  // leaning out, which would throw what's sunk into it sideways off the edge)
  // (`h`: the height there, if it's already known)
  groundNormal(x, z, out = new THREE.Vector3(), y = Infinity, py = y, h = this.groundHeight(x, z, y, py)) {
    const e = 0.35;
    const dx = edgeSlope(this.groundHeight(x + e, z, y, py), h, this.groundHeight(x - e, z, y, py));
    const dz = edgeSlope(this.groundHeight(x, z + e, y, py), h, this.groundHeight(x, z - e, y, py));
    return out.set(-dx, 2 * e, -dz).normalize();
  }
  surfaceGrip() { return 1; }
  onRoad() { return true; }

  raycast(origin, dir, far, withGround = true) {
    if (!withGround || dir.y > -1e-6) return null;
    let t = (this.groundHeight(origin.x, origin.z, origin.y) - origin.y) / dir.y;
    for (let i = 0; i < 2; i++) {
      const px = origin.x + dir.x * Math.max(0, t), pz = origin.z + dir.z * Math.max(0, t);
      t = (this.groundHeight(px, pz, origin.y) - origin.y) / dir.y;
    }
    if (t < -0.3 || t > far) return null;
    const point = new THREE.Vector3().copy(origin).addScaledVector(dir, t);
    // (a slanting ray across a sheer edge, a wheel gone out over a deck's back edge on a car tipping off it, never settles:
    // it would take the roof it's left behind as right under the wheel, and the spring would throw the car metres up.
    // The ground isn't where the ray says it is there: nothing in reach. Not off a ramp's lip, though: that's how
    // every launch off one has always gone)
    const [ra, rb, rc, rd] = this.rampBox, M = 6;
    const ramp = point.x > ra - M && point.x < rb + M && point.z > rc - M && point.z < rd + M;
    const h = this.groundHeight(point.x, point.z, origin.y);
    if (!ramp && Math.abs(h - point.y) > 0.5) return null;
    return { dist: Math.max(0, t), point, normal: this.groundNormal(point.x, point.z, undefined, origin.y, origin.y, h) };
  }

  // Buildings near (x, z)
  near(x, z) { return this.grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || EMPTY; }
  // Something solid (a building, a wall) over [x0, x1] x [z0, z1], in every cell near it
  addToGrid(b, x0, x1, z0, z1, grid = this.grid) {
    for (let i = Math.floor(x0 / CELL) - 1; i <= Math.floor(x1 / CELL) + 1; i++) for (let k = Math.floor(z0 / CELL) - 1; k <= Math.floor(z1 / CELL) + 1; k++) {
      const key = i + ',' + k;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(b);
    }
  }
  // Something in the way of the view but not of the cars, `b`: { x, z, w, d, floor, top }, square to the axes
  screen(b) {
    Object.assign(b, { ca: 1, sa: 0 });
    this.addToGrid(b, b.x - b.w / 2, b.x + b.w / 2, b.z - b.d / 2, b.z + b.d / 2, this.screens);
  }
  // Buildings near (x, z), and what only the camera keeps out of
  seen(x, z) {
    const s = this.screens.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL));
    return s ? this.near(x, z).concat(s) : this.near(x, z);
  }
  // Signed distance from (x, z) to a block's footprint, and the outward normal
  blockDist(b, x, z, n) {
    const ex = x - b.x, ez = z - b.z, lx = ex * b.ca + ez * b.sa, lz = -ex * b.sa + ez * b.ca;
    const qx = Math.abs(lx) - b.w / 2, qz = Math.abs(lz) - b.d / 2;
    if (qx > qz) { const k = Math.sign(lx); n.set(k * b.ca, 0, k * b.sa); } else { const k = Math.sign(lz); n.set(-k * b.sa, 0, k * b.ca); }
    return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
  }

  // Buildings are solid: push the car's corners out, bouncing it off with some spin and scrape. And a bridge's
  // deck is a ceiling for anything under it.
  contain(car) {
    let worst = 0;
    if (this.inDeck(car.pos.x, car.pos.z) && car.pos.y < this.deck.y - 1.6) {
      const under = this.deck.y - 1.35;
      let top = -Infinity;
      for (const h of car.hull) top = Math.max(top, _p.copy(h.p).applyQuaternion(car.q).add(car.pos).y);
      // (a step at a time: one that's come up beside the deck, with its end in under it, isn't thrown metres down)
      if (top > under) {
        car.pos.y -= Math.min(top - under, 0.25);
        if (car.vel.y > 0) { worst = car.vel.y; car.vel.y *= -0.3; car.w.multiplyScalar(0.8); }
      }
    }
    const s = car.spec.size || [1.9, 4.4];
    const hw = s[0] / 2, hl = s[1] / 2;
    // A fin between two big ramps: a car across it is put back on the side its middle's on
    for (const F of this.fins) {
      if (Math.abs(car.pos.x - F.x) > 4) continue;
      const side = Math.sign(car.pos.x - F.x) || 1;
      for (const [x, z] of CORNERS) {
        _p.set(x * hw, 0, z * hl).applyQuaternion(car.q).add(car.pos);
        const over = (F.x - _p.x) * side + FIN;
        if (over <= 0 || _p.z > F.a.z || _p.z < Math.min(F.a.z - F.a.len, F.b.z - F.b.len)) continue;
        // (it's only a metre over the higher ramp: see finMesh)
        if (_p.y > this.base(F.x, _p.z) + Math.max(finRise(F.a, _p.z), finRise(F.b, _p.z)) + 1) continue;
        _n.set(side, 0, 0);
        _r.subVectors(_p, car.pos);
        _pv.crossVectors(car.w, _r).add(car.vel);
        const vn = _pv.dot(_n);
        car.pos.x += side * over;
        if (vn >= 0) continue;
        const k = 1 / car.mass + _n.dot(_t2.crossVectors(car.invInertia(_t1.crossVectors(_r, _n), _J), _r));
        _J.copy(_n).multiplyScalar(-1.2 * vn / k);
        car.applyImpulse(_r, _J);
      }
    }
    // The big ramps' sides: off the one beside, you're bounced back, not lifted on
    for (const r of this.ramps) {
      if (!r.R || Math.abs(car.pos.x - r.x) > r.w / 2 + 4 || car.pos.z > r.z + 4 || car.pos.z < r.z - r.len - 4) continue;
      for (const [x, z] of CORNERS) {
        _p.set(x * hw, 0, z * hl).applyQuaternion(car.q).add(car.pos);
        const t = (r.z - _p.z) / r.len, inside = r.w / 2 - Math.abs(_p.x - r.x);
        if (t <= 0 || t >= 1 || inside <= 0) continue;
        const deep = this.base(_p.x, _p.z) + rampRise(r, t) - _p.y;
        if (deep <= 0 || rampOn(deep, inside)) continue;
        // (out the nearer way: a side, or back off the lip's face, for something come at it from beyond)
        const lip = _p.z - (r.z - r.len);
        if (lip < inside) _n.set(0, 0, -1); else _n.set(Math.sign(_p.x - r.x) || 1, 0, 0);
        _r.subVectors(_p, car.pos);
        _pv.crossVectors(car.w, _r).add(car.vel);
        const vn = _pv.dot(_n);
        car.pos.addScaledVector(_n, Math.min(lip, inside) * 0.9);
        if (vn >= 0) continue;
        const k = 1 / car.mass + _n.dot(_t2.crossVectors(car.invInertia(_t1.crossVectors(_r, _n), _J), _r));
        _J.copy(_n).multiplyScalar(-1.3 * vn / k);
        car.applyImpulse(_r, _J);
        if (-vn > worst) { worst = -vn; car.wallHit = { point: _p.clone(), normal: _n.clone(), speed: -vn, impulse: _J.length() }; }
      }
    }
    const list = this.near(car.pos.x, car.pos.z);
    // (still the deck's bump, if it gave one: a bridge in the open has no buildings near it)
    if (!list.length) return worst;
    for (const [x, z] of CORNERS) {
      _p.set(x * hw, 0, z * hl).applyQuaternion(car.q).add(car.pos);
      for (const b of list) {
        if (_p.y > b.top || _p.y < b.floor) continue;
        const d = this.blockDist(b, _p.x, _p.z, _n);
        if (d > 0) continue;
        // (just under the roof, further in than that from the walls: it's come down over the edge, or tipped onto
        // it, so it's lifted onto the roof rather than thrown out sideways through the wall; and only lifted: the
        // roof under it does the bouncing)
        if (b.floor == null && !b.tiers && b.top - _p.y < -d) { car.pos.y += (b.top - _p.y) * 0.9; continue; }
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
      if (!!A.under !== !!B.under) continue;
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
        P.push(x, this.roadBase(r, x, z) + lift, z);
        U.push(...uv(k, u - u0));
      }
      if (i) { const a = (i - 1) * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    return faceUp(P, U, I);
  }
  // A flat polygon on the ground
  patch(poly, lift, h = (x, z) => this.base(x, z)) {
    const P = [], I = [];
    for (const [x, z] of poly) P.push(x, h(x, z) + lift, z);
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
        const clearAt = u => [0.3, WALK / 2, WALK - 0.3].every(d => !this.isRoad(...r.at(u, e + side * d), !!r.under));
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
            const w = Math.min(end - s, 12 + rand() * 18), d = 14 + rand() * (DEPTH - 14);
            const [x, z] = r.at(s + w / 2, e + side * (WALK + d / 2));
            blocks.push({ x, z, w: w - 0.6, d, ang: r.ang, ...style(rand, L, x, z) });
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
      // (nor down a bank, nor in the level's open ground)
      const open = ([x, z]) => this.base(x, z) < -0.3 || this.inPark(x, z) || this.water?.below(x, z);
      if (!b.fixed && (pts.some(([x, z]) => this.roadDist(x, z) < WALK - 0.6 || this.inLot(x, z, 1)) || pts.some(open) || fixed.some(o => overlaps(o, b)))) continue;
      if (this.blocks.some(o => overlaps(o, b))) continue;
      b.y = Math.min(...pts.slice(0, 4).map(([x, z]) => this.base(x, z))) - 1;
      b.top = b.y + b.h + 1;
      this.blocks.push(b);
      const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
      this.addToGrid(b, Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs));
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
      paveParts.push([this.patch([[a, c], [b, c], [b, d], [a, d]], CURB + 0.04, (x, z) => this.top(x, z)), lot.colour || '#bdb8ae']);
    }
    for (const [r, e, p, q] of curb) {
      const P = [];
      const n = Math.max(1, Math.ceil((q - p) / 4));
      for (let i = 0; i < n; i++) {
        const pt = (u, y) => { const [x, z] = r.at(u, e); return [x, this.roadBase(r, x, z) + y, z]; };
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
    for (const b of this.blocks) if (b.tankAt) { const [x, z, y] = b.tankAt; this.screen({ x, z, w: 3.2, d: 3.2, floor: y, top: y + 5.2 }); }
    for (const b of this.blocks) if (b.deck) this.group.add(deckMesh(b));
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
      // (under a bridge, only the road down there: the one over it is up on the deck)
      const under = this.roadDist(x, z, this.inDeck(x, z) || undefined) < 2.8;
      // (the harbour floor under a jetty too: the jetty's block stands on it)
      const wet = this.water && this.water.wet(x, z);
      pos.setY(i, wet ? this.water.floor : this.base(x, z) + (under ? -0.4 : CURB - 0.03));
      // (grass in the open ground and down the banks)
      const park = this.inPark(x, z) || this.base(x, z) < -0.2;
      c.set(wet ? '#3a5a5a' : park ? '#86ad5c' : this.level.groundColour || '#b9b2a2');
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, addDetail(new THREE.MeshLambertMaterial({ vertexColors: true }), { fine: 0.7, strength: 0.15 }));
    m.receiveShadow = true;
    this.group.add(m);
  }

  // The bridge: a concrete deck under the road over it, with its piers down the banks either side of the road
  // under it
  buildDeck() {
    const { rect: [a, b, c, d], y, piers = [] } = this.deck, T = 1.3;
    const parts = [[new THREE.BoxGeometry(b - a + 0.4, T, d - c).translate((a + b) / 2, y - 0.03 - T / 2, (c + d) / 2), '#c9c3b6'],
      // (a darker band along each edge, and a lip the railings stand on)
      ...[a - 0.1, b + 0.1].map(x => [new THREE.BoxGeometry(0.5, 0.5, d - c).translate(x, y - 0.03 - T - 0.2, (c + d) / 2), '#a9a296'])];
    for (const [x, z] of piers) {
      const lo = this.base(x, z) - 0.5, hi = y - T;
      parts.push([new THREE.BoxGeometry(1.6, hi - lo, 1.6).translate(x, (lo + hi) / 2, z), '#bdb6a8']);
      parts.push([new THREE.BoxGeometry(2.4, 0.5, 2.4).translate(x, hi - 0.25, z), '#a9a296']);
    }
    // A wall along part of its edge, `wall`: [x0, x1, z0, z1], 3 m high: solid on the deck, nothing under it
    if (this.deck.wall) {
      const [x0, x1, z0, z1] = this.deck.wall, H = 3;
      parts.push([new THREE.BoxGeometry(x1 - x0, H + T, z1 - z0).translate((x0 + x1) / 2, y + (H - T) / 2, (z0 + z1) / 2), '#b3ab9c']);
      this.addToGrid({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, ca: 1, sa: 0, top: y + H, floor: y - T, h: H }, x0, x1, z0, z1);
    }
    // (lit a little from below, by the road under it: in its own shadow it would be near black)
    const m = new THREE.Mesh(merge(parts.map(([g, col]) => [g.toNonIndexed(), col])), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#6e6a60' }));
    m.castShadow = m.receiveShadow = true;
    this.group.add(m);
  }

  buildWater() {
    const W = this.water;
    const [x0, x1, z0, z1] = W.rect;
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, W.y, (z0 + z1) / 2);
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#2f7fa8', transparent: true, opacity: 0.85 }));
    this.group.add(m);
    // The quay wall (or walls, either side of a canal: [z0, z1] each)
    for (const [z0, z1] of W.walls || [[W.edge - 1, W.edge]]) {
      const q = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, CURB - W.floor, z1 - z0).translate((x0 + x1) / 2, (CURB + W.floor) / 2, (z0 + z1) / 2), new THREE.MeshLambertMaterial({ color: '#8a8478' }));
      q.receiveShadow = true;
      this.group.add(q);
    }
    // (where a jetty meets the quay its top is level with the quay wall's: drawn just behind it there, so they don't flicker)
    for (const [a, b, c, d] of W.jetties || []) {
      const j = new THREE.Mesh(new THREE.BoxGeometry(b - a, CURB - W.floor, d - c).translate((a + b) / 2, (CURB + W.floor) / 2, (c + d) / 2),
        new THREE.MeshLambertMaterial({ color: '#9a948a', polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
      j.receiveShadow = j.castShadow = true;
      this.group.add(j);
    }
  }
}
const EMPTY = [];

// A ramp's rise `t` of the way from its foot to its lip: a plank kicker's straight; a big one (`angle`: degrees at
// its lip) is an arc, flat at the foot and turning up evenly to that, so it lifts a car at speed without slamming it
// (radius R, as tall as that makes it: `h`)
function arc(r) {
  if (!r.angle) return r;
  const a = r.angle * Math.PI / 180, R = r.len / Math.sin(a);
  return { ...r, R, h: R * (1 - Math.cos(a)) };
}
const rampRise = (r, t) => (r.R ? r.R - Math.sqrt(r.R * r.R - (t * r.len) ** 2) : r.h * t);
// On a big ramp (`deep` under its surface, `inside` in from its nearer side) rather than beside it
const rampOn = (deep, inside) => deep < Math.max(0.3, inside);
// The big ramps: a deck in its own colour, chevrons up it and its angle painted at the foot, on a concrete wall
// each side, open underneath only to the lip's face
function arcMesh(r, y) {
  const N = 40, x0 = r.x - r.w / 2, x1 = r.x + r.w / 2, P = [], U = [], I = [], S = [], SI = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, z = r.z - t * r.len, h = y + rampRise(r, t) + 0.02;
    P.push(x0, h, z, x1, h, z);
    U.push(0, t, 1, t);
    if (i < N) I.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
    // the walls, down to the ground
    S.push(x0, y, z, x0, h, z, x1, y, z, x1, h, z);
    if (i < N) { const k = 4 * i; SI.push(k, k + 4, k + 1, k + 1, k + 4, k + 5, k + 2, k + 3, k + 6, k + 3, k + 7, k + 6); }
  }
  // and the lip's face
  const k = S.length / 3, zl = r.z - r.len, hl = y + r.h;
  S.push(x0, y, zl, x1, y, zl, x0, hl, zl, x1, hl, zl);
  SI.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  const top = new THREE.BufferGeometry();
  top.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  top.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  top.setIndex(I);
  top.computeVertexNormals();
  const sides = new THREE.BufferGeometry();
  sides.setAttribute('position', new THREE.Float32BufferAttribute(S, 3));
  sides.setIndex(SI);
  const walls = sides.toNonIndexed();
  walls.computeVertexNormals();
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 1024;
  const g = cv.getContext('2d');
  g.fillStyle = r.colour || '#ff8a1e'; g.fillRect(0, 0, 128, 1024);
  g.fillStyle = 'rgba(255,255,255,0.85)';
  for (let v = 120; v < 1000; v += 64) { g.beginPath(); g.moveTo(24, 1024 - v); g.lineTo(64, 1024 - v - 26); g.lineTo(104, 1024 - v); g.lineTo(104, 1024 - v + 12); g.lineTo(64, 1024 - v - 14); g.lineTo(24, 1024 - v + 12); g.fill(); }
  g.fillStyle = '#ffffff'; g.font = 'bold 44px sans-serif'; g.textAlign = 'center';
  g.fillText(r.angle + '\u00b0', 64, 1000);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, 5, 1024); g.fillRect(123, 0, 5, 1024);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const grp = new THREE.Group();
  const m = new THREE.Mesh(top, new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide }));
  const w = new THREE.Mesh(walls, new THREE.MeshLambertMaterial({ color: '#8d9497', side: THREE.DoubleSide }));
  m.castShadow = m.receiveShadow = w.castShadow = w.receiveShadow = true;
  grp.add(m, w);
  return grp;
}
// A sky deck's roof: dark decking, a hazard stripe round the edge and its height painted big at the front
function deckMesh(b) {
  const W = 512, H = Math.round(512 * b.d / b.w);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#3c4650'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 2;
  for (let x = 0; x < W; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  const s = 18;
  g.save();
  g.beginPath(); g.rect(0, 0, W, H); g.rect(s, s, W - 2 * s, H - 2 * s); g.clip('evenodd');
  g.fillStyle = '#ffcf2e'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#1e2228';
  for (let i = -H; i < W + H; i += 36) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 18, 0); g.lineTo(i + 18 + H, H); g.lineTo(i + H, H); g.fill(); }
  g.restore();
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = 'bold 54px sans-serif'; g.textAlign = 'center';
  g.fillText(t('SKY DECK {0} m', Math.round(b.h)), W / 2, H - 40);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(b.w - 0.4, b.d - 0.4).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.position.set(b.x, b.top + (ROOF[b.type] ?? 0.7) + 0.02, b.z);
  m.receiveShadow = true;
  return m;
}
// The fins between the big ramps: concrete, a metre over the higher of the two all the way up
const FIN = 0.25;
// (how high ramp r is at z, for its fin: its full height past the lip, as the fin runs on to the longer one's)
const finRise = (r, z) => { const t = (r.z - z) / r.len; return t > 0 && t < 1 ? rampRise(r, t) : t >= 1 ? r.h : 0; };
function finMesh(fins, base) {
  const parts = [];
  for (const F of fins) {
    const N = 70, z0 = F.a.z, len = Math.max(F.a.len, F.b.len);
    for (let i = 0; i < N; i++) {
      const za = z0 - len * i / N, zb = z0 - len * (i + 1) / N;
      const y0 = base(F.x, za), top = y0 + Math.max(finRise(F.a, zb), finRise(F.b, zb)) + 1;
      parts.push([new THREE.BoxGeometry(FIN * 2, top - y0, za - zb + 0.02).translate(F.x, (y0 + top) / 2, (za + zb) / 2), '#e8ecec']);
    }
  }
  const m = new THREE.Mesh(merge(parts.map(([g, c]) => [g.toNonIndexed(), c])), new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.castShadow = m.receiveShadow = true;
  return m;
}
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
// Round the junction (LOW m of it) only walk-ups, and none over three floors: the opening shot looks down on the junction
// over low roofs, not into a canyon of towers. (The same draws from `rand` either way: the rest of the town's the same.)
const LOW = 60;
function style(rand, L, x, z) {
  const t = rand(), lower = L.lower || 1;
  const low = Math.hypot(x - L.junction[0], z - L.junction[1]) < LOW;
  if (t < 0.45) {
    const floors = 2 + Math.floor(rand() * 3);
    return { type: 'walkup', h: SHOP + Math.min(low ? 3 : 4, floors) * FLOOR + 0.6, brick: Math.floor(rand() * 2), tank: rand() < 0.5 };
  }
  const h = t < 0.87 ? (15 + rand() * 13) * lower : (30 + rand() * 16) * lower, tank = t < 0.87 && rand() < 0.3;
  if (low) return { type: 'walkup', h: SHOP + (2 + Math.floor(t * 20) % 2) * FLOOR + 0.6, brick: Math.floor(t * 40) % 2, tank };
  return t < 0.87 ? { type: 'tower', h, tank } : { type: 'tower', h, tiers: true };
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
  // A department store's ribbon windows: a long band of glass across each floor, a plain band between
  TILES.ribbon = tile(g => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#ececec'; g.fillRect(0, 0, 128, 6);
    g.fillStyle = '#5a5f68'; g.fillRect(0, 50, 128, 52);
    glass(g, 0, 53, 128, 46);
    g.fillStyle = '#5a5f68'; g.fillRect(0, 53, 3, 46); g.fillRect(64, 53, 3, 46);
    g.fillStyle = '#f4f4f4'; g.fillRect(0, 102, 128, 4);
  });
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
    new THREE.MeshLambertMaterial({ vertexColors: true, map: T.brickB }), tinted(T.shop), new THREE.MeshLambertMaterial({ vertexColors: true }), tinted(T.ribbon)];
  const OFFICE = 0, SHOPM = 3, PLAIN = 4, RIBBON = 5;
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
    } else if (b.type === 'store') {
      // A department store: shops along the street, ribbon windows over them, a deep plain parapet on top
      const col = new THREE.Color(b.colour || palette[Math.floor(rand() * palette.length)]);
      box(0, 0, b.w + 0.24, b.d + 0.24, b.y, g0 + SHOP, SHOPM, shopCol, { fh: SHOP, v0: -1 / SHOP, roof: false });
      ledge(b.w, b.d, g0 + SHOP, 0.55, 0.35, stone);
      box(0, 0, b.w, b.d, g0 + SHOP + 0.55, top - 2.4, RIBBON, col, { v0: (SHOP + 0.55) / FLOOR, roof: false });
      box(0, 0, b.w, b.d, top - 2.4, top, PLAIN, col.clone().multiplyScalar(0.92), { flat: true });
      ledge(b.w, b.d, top - 0.3, 0.5, 0.3, stone);
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
    if (!b.bare && (b.tank || rand() < 0.35)) {
      const lx = (rand() - 0.5) * Math.max(0, rw - 5), lz = (rand() - 0.5) * Math.max(0, rd - 5);
      const [x, z] = W(lx, lz);
      if (b.tank) {
        b.tankAt = [x, z, roofY];
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
