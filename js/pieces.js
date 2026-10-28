// Track piece catalogue: connection sides plus visual + collision geometry builders.
// Local piece space: tile centred at origin, at rotation 0 the "forward" direction is north (-z).
import * as THREE from 'three';

export const TILE = 28, HALF = TILE / 2, GRID = 12;
// Sides: 0 = N (-z), 1 = E (+x), 2 = S (+z), 3 = W (-x)
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export const PIECES = {
  start:    { label: 'Start',    conn: [0, 2] },
  straight: { label: 'Straight', conn: [0, 2] },
  corner:   { label: 'Curve',    conn: [2, 1] },
  banked:   { label: 'Banked',   conn: [2, 1] },
  ramp:     { label: 'Ramp',     conn: [0, 2] },
  water:    { label: 'Water',    conn: [0, 2] },
  loop:     { label: 'Loop',     conn: [0, 2] },
  hump:     { label: 'Hump',     conn: [0, 2] },
  boost:    { label: 'Boost',    conn: [0, 2] },
  // Appended so saved track codes keep their meaning
  corkscrew: { label: 'Corkscrew', conn: [0, 2] },
  pipe:     { label: 'Half-pipe', conn: [0, 2] },
  tunnel:   { label: 'Tunnel',   conn: [0, 2] },
  chicane:  { label: 'Chicane',  conn: [0, 2] },
  dirt:     { label: 'Dirt',     conn: [0, 2] },
  ice:      { label: 'Ice',      conn: [0, 2] },
  kicker:   { label: 'Kicker',   conn: [0, 2] },
};
export const PIECE_TYPES = Object.keys(PIECES);
export const sidesOf = (t, r) => PIECES[t].conn.map(s => (s + r) % 4);

// Loop lane: sideways shift as a function of progress t (0..1), finished before the car touches down again.
const loopS = t => Math.min(1, Math.max(0, (t - 0.06) / 0.86));
export const loopX = t => LOOP_A * (1 - Math.cos(Math.PI * loopS(t))) / 2;
export const loopDX = t => (t < 0.06 || t > 0.92) ? 0 : LOOP_A * Math.sin(Math.PI * loopS(t)) / (4 * 0.86); // dx/dθ
export const RAMP_H = 3.6, HUMP_H = 1.3, LOOP_R = 8.5, LOOP_A = 5.8, LOOP_W = 5.4, BANK_H = 4.5;

// Corkscrew: the road winds once round a horizontal axis CORK_R above the ground, from z = CORK_Z to -CORK_Z.
// The rotation eases in and out so the road leaves and rejoins the ground straight.
export const CORK_R = 3.6, CORK_Z = 11, CORK_W = 6;
const corkTh = s => {
  const e = 0.18, a = s < e ? s * s / (2 * e) : s > 1 - e ? 1 - e - (1 - s) ** 2 / (2 * e) : s - e / 2;
  return 2 * Math.PI * a / (1 - e);
};
// Frame on the corkscrew's centre line at progress s: point on the road, normal (towards the axis) and the
// unit tangent in the direction of increasing s, plus |dc/ds| for turning speed into progress.
export function corkFrame(s) {
  const th = corkTh(s), d = 1e-4, th2 = corkTh(Math.min(1, s + d)), th1 = corkTh(Math.max(0, s - d));
  const p = V(CORK_R * Math.sin(th), CORK_R * (1 - Math.cos(th)), CORK_Z - 2 * CORK_Z * s);
  const n = V(-Math.sin(th), Math.cos(th), 0);
  const dth = (th2 - th1) / (Math.min(1, s + d) - Math.max(0, s - d));
  const t = V(CORK_R * Math.cos(th) * dth, CORK_R * Math.sin(th) * dth, -2 * CORK_Z);
  const len = t.length();
  return { p, n, t: t.divideScalar(len), len };
}

// Chicane: an S-bend inside one tile between barriers. Centre line offset (+x) by progress v from the south edge.
const CHI_A = 2.8 / 1.299;
export const chicaneX = v => CHI_A * (Math.sin(2 * Math.PI * v) - 0.5 * Math.sin(4 * Math.PI * v));
const chicaneW = v => 3.2 + 1.8 * Math.max(0, 1 - Math.min(v, 1 - v) / 0.15) ** 2;   // half-width, flared at the ends

// Half-pipe cross-section: flat floor, quarter-circle walls; flattened at the tile ends.
const PIPE_F = 3, PIPE_R = 4.2, PIPE_E = 3.7;
const pipeY = (x, v) => {
  const e = Math.max(0, Math.abs(x) - PIPE_F);
  const f = smooth(Math.min(1, Math.min(v, 1 - v) / 0.16));
  return f * (PIPE_R - Math.sqrt(PIPE_R * PIPE_R - e * e));
};
export const KICK_H = 1.05;

const col = c => new THREE.Color(c);
const C = {
  asphalt: col('#45484f'), line: col('#efeee6'), red: col('#d8352b'), white: col('#f3f3f3'),
  concrete: col('#a29c90'), steel: col('#2f6fbd'), dirt: col('#7a5634'), yellow: col('#f2c230'),
  check1: col('#111111'), check2: col('#f5f5f5'), orange: col('#ff7a1a'),
  dirt1: col('#8a6440'), dirt2: col('#9b7650'), rut: col('#6e4e30'),
  ice1: col('#cfe8f5'), ice2: col('#b4d8ee'), ice3: col('#e9f6fc'), lamp: col('#ffe6a0'),
};

export const trackMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
export const collisionMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
trackMaterial.userData.shared = collisionMaterial.userData.shared = true;

// Parametric surface over breakpoint lists us (across) x vs (along), one colour per quad.
function surface(us, vs, pos, colour) {
  const P = [], K = [];
  const pts = vs.map(v => us.map(u => pos(u, v)));
  for (let j = 0; j < vs.length - 1; j++) {
    for (let i = 0; i < us.length - 1; i++) {
      const a = pts[j][i], b = pts[j][i + 1], c = pts[j + 1][i + 1], d = pts[j + 1][i];
      for (const p of [a, b, c, a, c, d]) P.push(p.x, p.y, p.z);
      const k = colour(i, j);
      for (let n = 0; n < 6; n++) K.push(k.r, k.g, k.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(K, 3));
  g.computeVertexNormals();
  return g;
}

function box(w, h, d, x, y, z, colour) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.translate(x, y, z);
  const n = g.attributes.position.count, K = [];
  for (let i = 0; i < n; i++) K.push(colour.r, colour.g, colour.b);
  g.setAttribute('color', new THREE.Float32BufferAttribute(K, 3));
  g.deleteAttribute('uv');
  return g;
}

const range = (n, a = 0, b = 1) => Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const smooth = t => t * t * (3 - 2 * t);
const LANES = [0, 0.035, 0.49, 0.51, 0.965, 1];
const KERB = [0, 0.08, 0.92, 1];
const solid = c => () => c;
const roadColour = (i, j) => (i === 0 || i === 4 || (i === 2 && j % 2 === 0)) ? C.line : C.asphalt;
const kerbColour = (i, j) => (i === 1 ? C.asphalt : (j % 2 ? C.red : C.white));

// Flat road ribbon along the piece's z axis (travelling north).
const straightRoad = (y = 0.03) => surface(LANES, range(14), (u, v) => V(-5 + 10 * u, y, HALF - TILE * v), roadColour);

// Profiled straight (ramp, hump): surface plus side walls, optional end face.
function profiled(h, endFace) {
  const vs = range(32);
  const z = v => HALF - TILE * v;
  const top = surface(KERB, vs, (u, v) => V(-5 + 10 * u, h(v) + 0.03, z(v)), kerbColour);
  const left = surface([0, 1], vs, (u, v) => V(-5, u * (h(v) + 0.03), z(v)), solid(C.concrete));
  const right = surface([0, 1], vs, (u, v) => V(5, u * (h(v) + 0.03), z(v)), solid(C.concrete));
  const parts = [top, left, right];
  if (endFace) parts.push(surface([0, 1], [0, 1], (u, v) => V(-5 + 10 * u, v * (RAMP_H + 0.03), -HALF), solid(C.concrete)));
  return { vis: parts, col: parts };
}

function bannerTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 64;
  const x = c.getContext('2d');
  for (let i = 0; i < 32; i++) for (let j = 0; j < 4; j++) {
    x.fillStyle = (i + j) % 2 ? '#111' : '#fff';
    x.fillRect(i * 16, j * 16, 16, 16);
  }
  x.fillStyle = '#e8352b';
  x.fillRect(150, 6, 212, 52);
  x.fillStyle = '#fff';
  x.font = 'bold 38px sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('HANGTIME', 256, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const BUILDERS = {
  straight() {
    return { vis: [straightRoad()], col: [] };
  },

  start() {
    const checks = surface(range(12), range(2), (u, v) => V(-5 + 10 * u, 0.09, 10 + 1.6 * v),
      (i, j) => ((i + j) % 2 ? C.check1 : C.check2));
    const posts = [box(0.6, 7, 0.6, -6.6, 3.5, 11, C.concrete), box(0.6, 7, 0.6, 6.6, 3.5, 11, C.concrete)];
    const banner = new THREE.Mesh(new THREE.BoxGeometry(13.7, 1.8, 0.4),   // ends just inside the posts' faces
      [0, 1, 2, 3, 4, 5].map(i => (i === 4 || i === 5)
        ? new THREE.MeshLambertMaterial({ map: bannerTexture() })
        : new THREE.MeshLambertMaterial({ color: '#222' })));
    banner.position.set(0, 7.4, 11);
    return { vis: [straightRoad(), checks, ...posts], col: posts, extra: [banner] };
  },

  corner() {
    const g = surface(LANES, range(16), (u, v) => {
      const a = v * Math.PI / 2, r = 9 + 10 * u;
      return V(HALF - r * Math.cos(a), 0.03, HALF - r * Math.sin(a));
    }, roadColour);
    return { vis: [g], col: [] };
  },

  // Flat inner lane with a quarter-pipe bowl on the outside that rises mid-curve.
  banked() {
    const y = (u, v) => BANK_H * Math.sin(Math.PI * v) * Math.max(0, (10 * u - 4) / 6) ** 2;
    const at = (r, a, h) => V(HALF - r * Math.cos(a), h, HALF - r * Math.sin(a));
    const vs = range(24), us = [0, 0.035, 0.49, 0.51, 0.6, 0.7, 0.8, 0.9, 0.965, 1];
    const top = surface(us, vs, (u, v) => at(9 + 10 * u, v * Math.PI / 2, y(u, v) + 0.03),
      (i, j) => i === 0 || (i === 2 && j % 2 === 0) ? C.line : i === 8 ? (j % 2 ? C.red : C.white) : C.asphalt);
    const wall = surface([0, 1], vs, (u, v) => at(19, v * Math.PI / 2, u * (y(1, v) + 1.6)),
      (i, j) => (j % 2 ? C.red : C.white));
    return { vis: [top, wall], col: [top, wall] };
  },

  // Straight with chevrons; the push itself happens in the game loop.
  boost() {
    const chevrons = [];
    for (const [k, z0] of [9, 3, -3, -9].entries()) {
      for (const side of [-1, 1]) {
        chevrons.push(surface([0, 1], [0, 1], (u, v) => {
          const x = side * 3.6 * v, z = z0 - 2.2 + 2.2 * v;
          return V(x, 0.08, z + 1.4 * u);
        }, () => (k % 2 ? C.yellow : C.orange)));
      }
    }
    return { vis: [straightRoad(), ...chevrons], col: [] };
  },

  corkscrew() {
    const ss = range(140), us = KERB;
    const at = (u, sv) => {
      const f = corkFrame(sv);
      const w = new THREE.Vector3().crossVectors(f.t, f.n).normalize();   // across the road, to the right
      return f.p.clone().addScaledVector(w, CORK_W * (u - 0.5));
    };
    const top = surface(us, ss, (u, sv) => at(u, sv).addScaledVector(corkFrame(sv).n, 0.03), kerbColour);
    const under = surface([0, 1], ss, (u, sv) => at(u, sv).addScaledVector(corkFrame(sv).n, -0.4), solid(C.steel));
    const edges = [0, 1].map(e => surface([0, 1], ss, (u, sv) => at(e, sv).addScaledVector(corkFrame(sv).n, -0.4 + 0.43 * u), solid(C.steel)));
    const approach = surface(LANES, range(2), (u, v) => V(-5 + 10 * u - (1 - v) * 0, 0.03, HALF - (HALF - CORK_Z) * v), roadColour);
    const exit = surface(LANES, range(2), (u, v) => V(-5 + 10 * u, 0.03, -CORK_Z - (HALF - CORK_Z) * v), roadColour);
    const pillars = [];
    for (const z of [-6, 0, 6]) pillars.push(box(0.6, 2 * CORK_R + 1.6, 0.6, -CORK_R - 3.2, CORK_R + 0.8, z, C.steel), box(0.6, 2 * CORK_R + 1.6, 0.6, CORK_R + 3.2, CORK_R + 0.8, z, C.steel));
    pillars.push(box(0.6, 0.6, 13, -CORK_R - 3.2, 2 * CORK_R + 1.6, 0, C.steel), box(0.6, 0.6, 13, CORK_R + 3.2, 2 * CORK_R + 1.6, 0, C.steel));
    top.userData.cork = true;
    return { vis: [top, under, ...edges, approach, exit, ...pillars], col: [top, ...pillars] };
  },

  pipe() {
    const xs = [-PIPE_F - PIPE_E, -6, -5, -4, -PIPE_F, -2.95, -0.1, 0.1, 2.95, PIPE_F, 4, 5, 6, PIPE_F + PIPE_E];
    const us = xs.map(x => (x - xs[0]) / (xs[xs.length - 1] - xs[0]));
    const X = u => xs[0] + u * (xs[xs.length - 1] - xs[0]);
    const vs = range(20);
    const top = surface(us, vs, (u, v) => V(X(u), pipeY(X(u), v) + 0.03, HALF - TILE * v), (i, j) =>
      i === 0 || i === xs.length - 2 ? (j % 2 ? C.red : C.white) : (i === 4 || i === 8) ? C.line : i === 6 && j % 2 === 0 ? C.line : i < 4 || i > 8 ? C.concrete : C.asphalt);
    const sides = [-1, 1].map(sd => surface([0, 1], vs, (u, v) => V(sd * (PIPE_F + PIPE_E), u * (pipeY(PIPE_F + PIPE_E, v) + 0.03), HALF - TILE * v), solid(C.concrete)));
    return { vis: [top, ...sides], col: [top] };
  },

  tunnel() {
    const parts = [straightRoad()];
    // Walls stop short of the portals' outer faces so no two faces share a plane (z-fighting)
    const walls = [box(1, 4.96, TILE - 0.3, -6.5, 2.48, 0, C.concrete), box(1, 4.96, TILE - 0.3, 6.5, 2.48, 0, C.concrete), box(13.9, 0.8, TILE - 0.3, 0, 5.4, 0, C.concrete)];
    const portals = [];
    for (const z of [-HALF + 0.4, HALF - 0.4]) portals.push(box(15, 1.2, 0.8, 0, 6.2, z, C.red), box(1.4, 6, 0.8, -7.2, 3, z, C.red), box(1.4, 6, 0.8, 7.2, 3, z, C.red));
    const lamps = [];
    for (const z of [-10, -3.5, 3, 9.5]) lamps.push(box(1.4, 0.12, 2.4, 0, 4.95, z, C.lamp));
    return { vis: [...parts, ...walls, ...portals, ...lamps], col: walls };
  },

  chicane() {
    const vs = range(36);
    const road = surface(LANES, vs, (u, v) => V(chicaneX(v) + chicaneW(v) * (2 * u - 1) * 0.97, 0.03, HALF - TILE * v), roadColour);
    const barrier = sd => {
      const at = (u, v) => V(chicaneX(v) + sd * (chicaneW(v) + 0.3 * u), 0.85 * (1 - u * 0.4), HALF - TILE * v);
      const topS = surface([0, 1], vs, (u, v) => at(u, v), (i, j) => (j % 2 ? C.red : C.white));
      const inner = surface([0, 1], vs, (u, v) => V(chicaneX(v) + sd * chicaneW(v), 0.85 * u, HALF - TILE * v), (i, j) => (j % 2 ? C.red : C.white));
      return [topS, inner];
    };
    const b = [...barrier(-1), ...barrier(1)];
    return { vis: [road, ...b], col: [b[1], b[3]] };
  },

  dirt() {
    const g = surface([0, 0.1, 0.28, 0.36, 0.64, 0.72, 0.9, 1], range(14), (u, v) => V(-5.2 + 10.4 * u, 0.03, HALF - TILE * v),
      (i, j) => (i === 2 || i === 4 ? C.rut : (i + j) % 3 === 0 ? C.dirt2 : C.dirt1));
    return { vis: [g], col: [] };
  },

  ice() {
    const g = surface([0, 0.035, 0.2, 0.4, 0.6, 0.8, 0.965, 1], range(14), (u, v) => V(-5 + 10 * u, 0.03, HALF - TILE * v),
      (i, j) => (i === 0 || i === 6 ? C.line : (i * 7 + j * 3) % 5 === 0 ? C.ice3 : (i + j) % 2 ? C.ice1 : C.ice2));
    const posts = [];
    for (const z of [-9, 0, 9]) for (const x of [-5.6, 5.6]) posts.push(box(0.3, 1.2, 0.3, x, 0.6, z, C.steel));
    return { vis: [g, ...posts], col: [] };
  },

  // A short kicker in the middle of a straight: launches the car over the rest of the tile.
  kicker() {
    const v0 = 0.32, v1 = 0.6, z = v => HALF - TILE * v;
    const h = v => KICK_H * ((v - v0) / (v1 - v0)) ** 2;
    const vs = range(16, v0, v1);
    const top = surface(KERB, vs, (u, v) => V(-5 + 10 * u, h(v) + 0.03, z(v)), (i, j) => (i === 1 ? (j > 12 ? C.yellow : C.asphalt) : j % 2 ? C.red : C.white));
    const sides = [-5, 5].map(x => surface([0, 1], vs, (u, v) => V(x, u * (h(v) + 0.03), z(v)), solid(C.concrete)));
    const back = surface([0, 1], [0, 1], (u, v) => V(-5 + 10 * u, v * (KICK_H + 0.03), z(v1)), solid(C.concrete));
    return { vis: [straightRoad(), top, ...sides, back], col: [top, ...sides, back] };
  },

  ramp() {
    return profiled(v => v < 0.15 ? 0 : RAMP_H * ((v - 0.15) / 0.85) ** 2, true);
  },

  hump() {
    return profiled(v => (v < 0.15 || v > 0.85) ? 0 : HUMP_H * Math.sin(Math.PI * (v - 0.15) / 0.7) ** 2, false);
  },

  water() {
    const D = 6;
    const walls = [
      surface([0, 1], [0, 1], (u, v) => V(-HALF + TILE * u, -D * v, -HALF), solid(C.dirt)),
      surface([0, 1], [0, 1], (u, v) => V(-HALF + TILE * u, -D * v, HALF), solid(C.dirt)),
      surface([0, 1], [0, 1], (u, v) => V(-HALF, -D * v, -HALF + TILE * u), solid(C.dirt)),
      surface([0, 1], [0, 1], (u, v) => V(HALF, -D * v, -HALF + TILE * u), solid(C.dirt)),
    ];
    const water = new THREE.Mesh(new THREE.PlaneGeometry(TILE, TILE, 7, 7).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: '#2e8fd8', flatShading: true }));
    water.position.y = -1.2;
    water.userData.water = true;
    const posts = [];
    for (const z of [-HALF + 1, HALF - 1]) for (const x of [-5.6, 5.6]) posts.push(box(0.4, 1.6, 0.4, x, 0.8, z, C.yellow));
    return { vis: [...walls, ...posts], col: [], extra: [water] };
  },

  loop() {
    const R = LOOP_R, A = LOOP_A, W = LOOP_W;
    const P = (t, off) => {
      const th = 2 * Math.PI * t;
      // `off` moves along the radius: positive = towards the centre (driving side)
      return V(loopX(t), R * (1 - Math.cos(th)) + off * Math.cos(th), -R * Math.sin(th) + off * Math.sin(th));
    };
    const ts = range(112);
    const inner = surface(KERB, ts, (u, t) => P(t, 0.03).setX(P(t, 0).x + W * (u - 0.5)), kerbColour);
    const outer = surface([0, 1], ts, (u, t) => P(t, -0.5).setX(P(t, 0).x + W * (u - 0.5)), solid(C.steel));
    const edges = [-0.5, 0.5].map(s => surface([0, 1], ts, (u, t) => P(t, -0.5 + 0.53 * u).setX(P(t, 0).x + W * s), solid(C.steel)));
    // Entry runs straight down the middle; the exit comes down offset to the right and merges back.
    const approach = surface(LANES, range(10), (u, v) => {
      const w = 10 - (10 - W) * smooth(v);
      return V(w * (u - 0.5), 0.03, HALF - HALF * v);
    }, roadColour);
    const exit = surface(LANES, range(12), (u, v) => {
      const m = smooth(Math.max(0, (v - 0.35) / 0.65));
      const w = W + (10 - W) * m;
      return V(A * (1 - m) + w * (u - 0.5), 0.03, -HALF * v);
    }, roadColour);
    const pillars = [box(0.8, 18.6, 0.8, -9.4, 9.3, 0, C.steel), box(0.8, 18.6, 0.8, 9.4, 9.3, 0, C.steel), box(19.6, 0.8, 0.7, 0, 18.15, 0, C.steel)];
    inner.userData.loop = true;
    return { vis: [inner, outer, ...edges, approach, exit, ...pillars], col: [inner, ...pillars] };
  },
};

const cache = {};
export function pieceParts(type) {
  if (!cache[type]) {
    const parts = cache[type] = BUILDERS[type]();
    // Cached parts are shared by every world; World.dispose() must leave them alone.
    for (const g of [...parts.vis, ...parts.col]) g.userData.shared = true;
    for (const m of parts.extra || []) {
      m.geometry.userData.shared = true;
      for (const mat of [m.material].flat()) mat.userData.shared = true;
    }
  }
  return cache[type];
}

// Which parts of a tile count as "on the road" (better grip). Local coordinates.
export function onRoadLocal(type, x, z) {
  if (type === 'corner' || type === 'banked') {
    const r = Math.hypot(x - HALF, z - HALF);
    return r > 8.5 && r < 19.5;
  }
  if (type === 'loop') return Math.abs(x) < 8.5;
  if (type === 'pipe') return Math.abs(x) < PIPE_F + PIPE_E + 0.2;
  if (type === 'corkscrew') return Math.abs(x) < 5.5 || Math.abs(z) < CORK_Z;
  if (type === 'chicane') {
    const v = (HALF - z) / TILE;
    return Math.abs(x - chicaneX(v)) < chicaneW(v) + 0.4;
  }
  return Math.abs(x) < 5.5;
}
