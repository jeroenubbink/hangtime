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
};
export const PIECE_TYPES = Object.keys(PIECES);
export const sidesOf = (t, r) => PIECES[t].conn.map(s => (s + r) % 4);

// Loop lane: sideways shift as a function of progress t (0..1), finished before the car touches down again.
const loopS = t => Math.min(1, Math.max(0, (t - 0.06) / 0.86));
export const loopX = t => LOOP_A * (1 - Math.cos(Math.PI * loopS(t))) / 2;
export const loopDX = t => (t < 0.06 || t > 0.92) ? 0 : LOOP_A * Math.sin(Math.PI * loopS(t)) / (4 * 0.86); // dx/dθ
export const RAMP_H = 3.6, HUMP_H = 1.3, LOOP_R = 8.5, LOOP_A = 5.8, LOOP_W = 5.4, BANK_H = 4.5;

const col = c => new THREE.Color(c);
const C = {
  asphalt: col('#45484f'), line: col('#efeee6'), red: col('#d8352b'), white: col('#f3f3f3'),
  concrete: col('#a29c90'), steel: col('#2f6fbd'), dirt: col('#7a5634'), yellow: col('#f2c230'),
  check1: col('#111111'), check2: col('#f5f5f5'), orange: col('#ff7a1a'),
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
    const checks = surface(range(12), range(2), (u, v) => V(-5 + 10 * u, 0.04, 10 + 1.6 * v),
      (i, j) => ((i + j) % 2 ? C.check1 : C.check2));
    const posts = [box(0.6, 7, 0.6, -6.6, 3.5, 11, C.concrete), box(0.6, 7, 0.6, 6.6, 3.5, 11, C.concrete)];
    const banner = new THREE.Mesh(new THREE.BoxGeometry(13.8, 1.8, 0.4),
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
          return V(x, 0.06, z + 1.4 * u);
        }, () => (k % 2 ? C.yellow : C.orange)));
      }
    }
    return { vis: [straightRoad(), ...chevrons], col: [] };
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
    const pillars = [box(0.8, 18.6, 0.8, -9.4, 9.3, 0, C.steel), box(0.8, 18.6, 0.8, 9.4, 9.3, 0, C.steel), box(19.6, 0.8, 0.8, 0, 18.2, 0, C.steel)];
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
  return Math.abs(x) < 5.5;
}
