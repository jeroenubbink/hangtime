// Track grid model, path validation, built-in tracks and the 3D world built from a grid.
import * as THREE from 'three';
import { TILE, HALF, GRID, DIRS, PIECE_TYPES, sidesOf, pieceParts, trackMaterial, collisionMaterial, onRoadLocal } from './pieces.js';
import { addDetail, grassTexture } from './textures.js';
import { Scatter, grandstand, mountainGeometry, merge } from './scenery.js';

export const emptyGrid = () => Array.from({ length: GRID }, () => Array(GRID).fill(null));

export function serialize(grid) {
  const cells = [];
  grid.forEach((row, z) => row.forEach((c, x) => c && cells.push([x, z, PIECE_TYPES.indexOf(c.t), c.r])));
  return JSON.stringify(cells);
}

export function deserialize(str) {
  const grid = emptyGrid();
  for (const [x, z, t, r] of JSON.parse(str)) {
    if (x >= 0 && x < GRID && z >= 0 && z < GRID && PIECE_TYPES[t]) grid[z][x] = { t: PIECE_TYPES[t], r: r & 3 };
  }
  return grid;
}

export function trackId(grid) {
  let h = 5381;
  const s = serialize(grid);
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// Lay out a track with turtle tokens. Heading uses side indices (0 = north).
// S straight, L/R curve, BL/BR banked curve, J ramp up, D ramp down (landing), W water, O loop, H hump, B boost pad,
// X corkscrew, P half-pipe, T tunnel, Z chicane, U dirt, I ice, K kicker.
export function fromTurtle(x, z, h, tokens) {
  const grid = emptyGrid();
  const place = (t, r) => { grid[z][x] = { t, r }; };
  const fitCorner = (t, a, b) => {
    for (let r = 0; r < 4; r++) {
      const s = sidesOf(t, r);
      if (s.includes(a) && s.includes(b)) return place(t, r);
    }
  };
  place('start', h);
  x += DIRS[h][0]; z += DIRS[h][1];
  for (const tok of tokens.trim().split(/\s+/)) {
    const back = (h + 2) % 4;
    switch (tok) {
      case 'S': place('straight', h % 2); break;
      case 'J': place('ramp', h); break;
      case 'D': place('ramp', (h + 2) % 4); break;
      case 'W': place('water', h % 2); break;
      case 'O': place('loop', h); break;
      case 'H': place('hump', h % 2); break;
      case 'B': place('boost', h); break;
      case 'X': place('corkscrew', h); break;
      case 'P': place('pipe', h % 2); break;
      case 'T': place('tunnel', h % 2); break;
      case 'Z': place('chicane', h % 2); break;
      case 'U': place('dirt', h % 2); break;
      case 'I': place('ice', h % 2); break;
      case 'K': place('kicker', h); break;
      case 'L': case 'R': case 'BL': case 'BR': {
        const out = (h + (tok.endsWith('R') ? 1 : 3)) % 4;
        fitCorner(tok.startsWith('B') ? 'banked' : 'corner', back, out);
        h = out;
        break;
      }
      default: throw new Error('bad token ' + tok);
    }
    x += DIRS[h][0]; z += DIRS[h][1];
  }
  return grid;
}

// Follow the track from the start piece. Returns the ordered list of tiles or an error.
export function walk(grid) {
  const starts = [];
  grid.forEach((row, z) => row.forEach((c, x) => c && c.t === 'start' && starts.push({ x, z, h: c.r })));
  if (starts.length === 0) return { ok: false, error: 'Place a start/finish piece' };
  if (starts.length > 1) return { ok: false, error: 'Only one start/finish piece allowed' };
  const s = starts[0];
  const path = [{ x: s.x, z: s.z, hin: s.h, hout: s.h, t: 'start' }];
  const seen = new Set([s.x + ',' + s.z]);
  let { x, z, h } = s;
  for (let i = 0; i < GRID * GRID + 1; i++) {
    x += DIRS[h][0]; z += DIRS[h][1];
    const c = x >= 0 && x < GRID && z >= 0 && z < GRID ? grid[z][x] : null;
    if (!c) return { ok: false, error: `Track ends at column ${x + 1}, row ${z + 1}`, at: { x, z } };
    const back = (h + 2) % 4, sides = sidesOf(c.t, c.r);
    if (!sides.includes(back)) return { ok: false, error: `Pieces don't connect at column ${x + 1}, row ${z + 1}`, at: { x, z } };
    if (x === s.x && z === s.z) {
      if (h !== s.h) return { ok: false, error: 'Track runs into the start the wrong way', at: { x, z } };
      const unused = grid.flat().filter(Boolean).length - path.length;
      return { ok: true, path, unused };
    }
    const key = x + ',' + z;
    if (seen.has(key)) return { ok: false, error: 'Track crosses itself', at: { x, z } };
    seen.add(key);
    const out = sides[0] === back ? sides[1] : sides[0];
    path.push({ x, z, hin: h, hout: out, t: c.t });
    h = out;
  }
  return { ok: false, error: 'Track does not close' };
}

export const BUILTIN = [
  { name: 'Sunday Drive', medals: [32.5, 35, 39.5], grid: () => fromTurtle(2, 8, 0, 'S S H S S R  S S S S S S BR  S S J W D S BR  S S S H S S R') },
  { name: 'Corkscrew Valley', medals: [66, 72, 80], grid: () => fromTurtle(1, 10, 0,
    'S S S J W D S S R  S S BR  S L  S H S L  S R  S BR  S S O S S O S S BR  S S R  S L  S S L  S S R  S S R') },
  { name: 'Big Air', medals: [41, 44.5, 49.5], grid: () => fromTurtle(1, 9, 0,
    'S S J W D S S BR  S S S J W D S S BR  S S S S J W D S BR  S H S O S S H S BR') },
  { name: 'Switchback', medals: [45, 49, 55], grid: () => fromTurtle(1, 10, 0,
    'S S R  S H S L  S S BR  B S S S R  S S O S S S R  S S S J W D S S R') },
  { name: 'Stunt Park', medals: [43.5, 47.5, 53], grid: () => fromTurtle(1, 10, 0,
    'S S J W D S S S BR  B S O S H S S S R  S B S J W W D S S BR  B S O S S H S S R') },
  { name: 'Funhouse', medals: [45.5, 49.5, 55], grid: () => fromTurtle(1, 9, 0,
    'S S X S S U U BR  S K S S Z S T T R  S P P S I I I S BR  S S J W D S X S BR') },
];

// Best-lap targets for gold, silver and bronze (seconds), roughly 5% under to 15% over the Pro rival's lap.
export const MEDALS = ['gold', 'silver', 'bronze'];
export const medalFor = (time, targets) => (targets && time != null ? MEDALS[targets.findIndex(t => time <= t)] || null : null);

export const cellCenter = (x, z) => [(x - GRID / 2 + 0.5) * TILE, (z - GRID / 2 + 0.5) * TILE];
export const cellOf = (wx, wz) => [Math.floor(wx / TILE + GRID / 2), Math.floor(wz / TILE + GRID / 2)];
export const WORLD_LIMIT = GRID * TILE / 2 + 24;

// Seeded RNG for scenery so a track always looks the same.
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const _ray = new THREE.Raycaster();
const _tmp = new THREE.Vector3();

export class World {
  constructor(scene, grid) {
    this.scene = scene;
    this.grid = grid;
    this.group = new THREE.Group();
    this.colliders = emptyGrid().map(row => row.map(() => []));
    this.trees = [];
    this.waterMeshes = [];
    this.buildHillMask();
    this.build();
    scene.add(this.group);
  }

  dispose() {
    this.scene.remove(this.group);
    const geos = new Set(), mats = new Set();
    this.group.traverse(o => {
      if (o.geometry && !o.geometry.userData.shared) geos.add(o.geometry);
      for (const m of [o.material || []].flat()) if (!m.userData.shared) mats.add(m);
    });
    for (const row of this.colliders) for (const list of row) for (const m of list) geos.add(m.geometry);
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
  }

  cell(x, z) {
    return x >= 0 && x < GRID && z >= 0 && z < GRID ? this.grid[z][x] : null;
  }

  // Hills live on empty tiles at least one tile away from the track. The mask is 1 at a cell corner when
  // all four cells around it are free, and is blended smoothly in between, so hills fade out before the road.
  buildHillMask() {
    const free = (x, z) => {
      if (x < 0 || z < 0 || x >= GRID || z >= GRID) return false;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (this.cell(x + dx, z + dz)) return false;
      return true;
    };
    this.mask = [];
    for (let z = 0; z <= GRID; z++) {
      const row = [];
      for (let x = 0; x <= GRID; x++) row.push(free(x - 1, z - 1) && free(x, z - 1) && free(x - 1, z) && free(x, z) ? 1 : 0);
      this.mask.push(row);
    }
    const seed = parseInt(trackId(this.grid), 36) % 1000;
    this.hillPhase = [seed * 0.013, seed * 0.029, seed * 0.017];
  }

  hillHeight(x, z) {
    const gx = x / TILE + GRID / 2, gz = z / TILE + GRID / 2;
    if (gx <= 0 || gz <= 0 || gx >= GRID || gz >= GRID) return 0;
    const ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz;
    const M = this.mask;
    const sm = t => t * t * (3 - 2 * t);
    const a = sm(fx), b = sm(fz);
    const m = (M[iz][ix] * (1 - a) + M[iz][ix + 1] * a) * (1 - b) + (M[iz + 1][ix] * (1 - a) + M[iz + 1][ix + 1] * a) * b;
    if (m <= 0) return 0;
    const [p, q, r] = this.hillPhase;
    const n = 3.6 + 2.4 * Math.sin(x * 0.045 + p) * Math.cos(z * 0.052 + q) + 1.2 * Math.sin((x + z) * 0.09 + r);
    return Math.max(0, n) * m;
  }

  groundNormal(x, z, out = new THREE.Vector3()) {
    if (this.isWater(x, z)) return out.set(0, 1, 0);
    const e = 0.5;
    const dx = this.hillHeight(x + e, z) - this.hillHeight(x - e, z), dz = this.hillHeight(x, z + e) - this.hillHeight(x, z - e);
    return out.set(-dx / (2 * e), 1, -dz / (2 * e)).normalize();
  }

  build() {
    const g = this.group;
    const rand = rng(parseInt(trackId(this.grid), 36));
    // Grass tiles (skip water pits), slightly varied for a patchwork look.
    const grassGeo = new THREE.PlaneGeometry(TILE, TILE).rotateX(-Math.PI / 2);
    // The ground is pushed back in the depth buffer so roads and markings lying a few cm above it never
    // z-fight with it, even from far away.
    const behind = { polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 };
    // Mown in stripes inside the arena; rougher grass outside it
    const lawn = { map: grassTexture, fine: 0.4, coarse: 0.025, strength: 0.32, coarseStrength: 0.28, flat: true };
    const grassMats = [addDetail(new THREE.MeshLambertMaterial({ color: '#5a8c3f', ...behind }), { ...lawn, stripes: 3.5 })];
    const hillMat = addDetail(new THREE.MeshLambertMaterial({ color: '#578a3d', flatShading: true, ...behind }), lawn);
    for (let z = 0; z < GRID; z++) for (let x = 0; x < GRID; x++) {
      const c = this.grid[z][x];
      if (c && c.t === 'water') continue;
      const [cx, cz] = cellCenter(x, z);
      let geo = grassGeo;
      if (this.mask[z][x] + this.mask[z][x + 1] + this.mask[z + 1][x] + this.mask[z + 1][x + 1] > 0) {
        // Hilly tile: a finer grid lifted to the hill height
        geo = new THREE.PlaneGeometry(TILE, TILE, 7, 7).rotateX(-Math.PI / 2);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) pos.setY(i, this.hillHeight(cx + pos.getX(i), cz + pos.getZ(i)));
        geo.computeVertexNormals();
      }
      const m = new THREE.Mesh(geo, geo === grassGeo ? grassMats[0] : hillMat);
      m.position.set(cx, 0, cz);
      m.receiveShadow = true;
      g.add(m);
    }
    // Surrounding land
    const outer = addDetail(new THREE.MeshLambertMaterial({ color: '#527f3a', ...behind }), { ...lawn, coarseStrength: 0.4 });
    const S = GRID * TILE / 2, BIG = 2400;
    for (const [w, d, x, z] of [[BIG, BIG / 2 - S, 0, -(S + (BIG / 2 - S) / 2)], [BIG, BIG / 2 - S, 0, S + (BIG / 2 - S) / 2],
      [BIG / 2 - S, 2 * S, -(S + (BIG / 2 - S) / 2), 0], [BIG / 2 - S, 2 * S, S + (BIG / 2 - S) / 2, 0]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), outer);
      m.position.set(x, 0, z);
      m.receiveShadow = true;
      g.add(m);
    }

    // Rolling hills beyond the fence, rising with distance
    {
      const geo = new THREE.PlaneGeometry(1600, 1600, 100, 100).rotateX(-Math.PI / 2);
      const pos = geo.attributes.position, L = WORLD_LIMIT;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        const d = Math.max(Math.abs(x), Math.abs(z)) - (L + 6);
        const h = d <= 0 ? -3 : Math.min(1, d / 120) * (14 + 10 * Math.sin(x * 0.011) * Math.cos(z * 0.013) + 6 * Math.sin((x - z) * 0.023));
        pos.setY(i, h);
      }
      geo.computeVertexNormals();
      const hills = new THREE.Mesh(geo, addDetail(new THREE.MeshLambertMaterial({ color: '#4f7a38', flatShading: true }), { ...lawn, fine: 0.2, coarse: 0.012, coarseStrength: 0.45 }));
      hills.receiveShadow = true;
      g.add(hills);
      this.outerHill = (x, z) => {
        const d = Math.max(Math.abs(x), Math.abs(z)) - (L + 6);
        return d <= 0 ? 0 : Math.min(1, d / 120) * (14 + 10 * Math.sin(x * 0.011) * Math.cos(z * 0.013) + 6 * Math.sin((x - z) * 0.023));
      };
    }

    // Track pieces
    const m4 = new THREE.Matrix4();
    for (let z = 0; z < GRID; z++) for (let x = 0; x < GRID; x++) {
      const c = this.grid[z][x];
      if (!c) continue;
      const parts = pieceParts(c.t);
      const [cx, cz] = cellCenter(x, z);
      const holder = new THREE.Group();
      holder.position.set(cx, 0, cz);
      holder.rotation.y = -c.r * Math.PI / 2;
      for (const geo of parts.vis) {
        const m = new THREE.Mesh(geo, trackMaterial);
        m.castShadow = c.t !== 'straight' && c.t !== 'corner';
        m.receiveShadow = true;
        holder.add(m);
      }
      for (const e of parts.extra || []) {
        const m = e.clone();
        m.castShadow = true;
        holder.add(m);
        if (m.userData.water) this.waterMeshes.push(m);
      }
      g.add(holder);
      holder.updateMatrixWorld(true);
      m4.copy(holder.matrixWorld);
      for (const geo of parts.col) {
        const cg = geo.clone().applyMatrix4(m4);
        cg.computeBoundingSphere();
        cg.computeBoundingBox();
        const mesh = new THREE.Mesh(cg, collisionMaterial);
        if (geo.userData.loop) mesh.userData.loop = { cx, cz, a: c.r * Math.PI / 2 };
        if (geo.userData.cork) mesh.userData.cork = { cx, cz, a: c.r * Math.PI / 2 };
        mesh.updateMatrixWorld(true);
        this.colliders[z][x].push(mesh);
      }
    }

    // Trees, bushes and rocks on empty tiles, a forest belt beyond the fence, tyre walls on the outside
    // of corners and a grandstand beside the start
    const sc = new Scatter(Math.floor(rand() * 1e9));
    const groundAt = (x, z) => (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT ? this.outerHill(x, z) : this.hillHeight(x, z));
    const addTree = (x, z, s) => {
      const kind = rand() < 0.55 ? 'pine' : 'round';
      sc.add(kind, x, groundAt(x, z) - 0.2, z, s * (kind === 'pine' ? 0.85 : 0.9));
      this.trees.push({ x, z, r: 0.5 * s });
    };
    for (let z = 0; z < GRID; z++) for (let x = 0; x < GRID; x++) {
      const [cx, cz] = cellCenter(x, z);
      const c = this.grid[z][x];
      if (c) {
        if (c.t === 'corner' || c.t === 'banked') {
          // Outside corner of the bend, a few metres in from the tile's corner
          const [a, b] = sidesOf(c.t, c.r).map(d => DIRS[d]);
          const ox = -(a[0] + b[0]), oz = -(a[1] + b[1]);
          const tx = cx + ox * (HALF - 2.2), tz = cz + oz * (HALF - 2.2);
          sc.add('tyres', tx, groundAt(tx, tz), tz, 1.2, Math.atan2(ox, oz) + Math.PI / 4);
          this.trees.push({ x: tx, z: tz, r: 1.4 });
        }
        continue;
      }
      const near = DIRS.some(([dx, dz]) => this.cell(x + dx, z + dz));
      const n = Math.floor(rand() * (near ? 2 : 4));
      const spread = near ? TILE - 16 : TILE - 6;
      for (let i = 0; i < n; i++) addTree(cx + (rand() - 0.5) * spread, cz + (rand() - 0.5) * spread, 0.8 + rand() * 0.6);
      for (let i = 0, nb = Math.floor(rand() * 4); i < nb; i++) {
        const bx = cx + (rand() - 0.5) * spread, bz = cz + (rand() - 0.5) * spread;
        sc.add(rand() < 0.75 ? 'bush' : 'rock', bx, groundAt(bx, bz) - 0.1, bz, 0.7 + rand() * 0.7);
      }
    }
    for (let i = 0; i < 260; i++) {
      const a = rand() * Math.PI * 2, d = WORLD_LIMIT + 14 + rand() * 160;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.max(Math.abs(x), Math.abs(z)) > WORLD_LIMIT + 8) addTree(x, z, 1 + rand() * 1.2);
    }
    for (const m of sc.build()) g.add(m);
    for (let z = 0; z < GRID; z++) for (let x = 0; x < GRID; x++) {
      const c = this.grid[z][x];
      if (!c || c.t !== 'start') continue;
      // On whichever side of the start straight is free
      const along = sidesOf(c.t, c.r)[0];
      for (const side of [(along + 1) % 4, (along + 3) % 4]) {
        const [dx, dz] = DIRS[side];
        if (this.cell(x + dx, z + dz) || x + dx < 0 || x + dx >= GRID || z + dz < 0 || z + dz >= GRID) continue;
        const [cx, cz] = cellCenter(x, z);
        const stand = grandstand(x * 31 + z);
        stand.position.set(cx + dx * 12, 0, cz + dz * 12);
        stand.rotation.y = Math.atan2(dx, dz);
        g.add(stand);
        for (let k = -2; k <= 2; k++) {
          const along2 = DIRS[along];
          this.trees.push({ x: cx + dx * 16 + along2[0] * k * 5, z: cz + dz * 16 + along2[1] * k * 5, r: 3 });
        }
        break;
      }
    }

    // Street lamps beside straights. At dusk and night they glow and throw a pool of light on the road.
    const poleGeo = new THREE.CylinderGeometry(0.14, 0.2, 7, 6).translate(0, 3.5, 0);
    const armGeo = new THREE.BoxGeometry(3.6, 0.16, 0.16).translate(-1.7, 6.9, 0);
    const headGeo = new THREE.BoxGeometry(0.9, 0.22, 0.5).translate(-3.3, 6.78, 0);
    const beamGeo = new THREE.CylinderGeometry(0.4, 5.5, 6.7, 16, 1, true).translate(-3.3, 3.35, 0);
    const poolGeo = new THREE.CircleGeometry(8, 28).rotateX(-Math.PI / 2).translate(-3.3, 0.08, 0);
    const poleMat = new THREE.MeshLambertMaterial({ color: '#5d636b', flatShading: true });
    this.lampHeadMat = new THREE.MeshLambertMaterial({ color: '#fff4d0', emissive: '#ffd27a', emissiveIntensity: 0 });
    const glow = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 };
    this.lampPoolMat = new THREE.MeshBasicMaterial({ color: '#ffcf7a', ...glow, polygonOffset: true, polygonOffsetFactor: -2 });
    this.lampBeamMat = new THREE.MeshBasicMaterial({ color: '#ffd890', ...glow, side: THREE.DoubleSide, fog: false });
    this.lampGlow = [];
    for (let z = 0; z < GRID; z++) for (let x = 0; x < GRID; x++) {
      const c = this.grid[z][x];
      if (!c || !['straight', 'start', 'hump', 'boost', 'dirt', 'ice', 'kicker'].includes(c.t) || (x + z) % 2) continue;
      const side = (x * 3 + z) % 4 < 2 ? 1 : -1;
      const lamp = new THREE.Group();
      const pole = new THREE.Mesh(poleGeo, poleMat), arm = new THREE.Mesh(armGeo, poleMat), head = new THREE.Mesh(headGeo, this.lampHeadMat);
      pole.castShadow = arm.castShadow = true;
      const beam = new THREE.Mesh(beamGeo, this.lampBeamMat), pool = new THREE.Mesh(poolGeo, this.lampPoolMat);
      beam.visible = pool.visible = false;
      this.lampGlow.push(beam, pool);
      lamp.add(pole, arm, head, beam, pool);
      const [cx, cz] = cellCenter(x, z);
      const a = -c.r * Math.PI / 2, ox = 9.5 * side;
      // Local +x is across the road; the arm reaches back over it.
      lamp.position.set(cx + ox * Math.cos(a), 0, cz - ox * Math.sin(a));
      lamp.rotation.y = a + (side > 0 ? 0 : Math.PI);
      g.add(lamp);
      this.trees.push({ x: lamp.position.x, z: lamp.position.z, r: 0.25 });
    }

    // Fence around the arena
    const fenceMat = addDetail(new THREE.MeshLambertMaterial({ color: '#c8c2b4' }), { fine: 0.6, strength: 0.3, coarse: 0.1, coarseStrength: 0.3 });
    const L = WORLD_LIMIT;
    for (const [w, d, x, z] of [[2 * L, 0.4, 0, -L], [2 * L, 0.4, 0, L], [0.4, 2 * L, -L, 0], [0.4, 2 * L, L, 0]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, d), fenceMat);
      m.position.set(x, 0.6, z);
      m.receiveShadow = true;
      g.add(m);
    }

    // Mountains, merged into one mesh
    {
      const geos = [];
      for (let i = 0; i < 46; i++) {
        const a = (i / 46) * Math.PI * 2 + rand() * 0.1, d = 640 + rand() * 260;
        const h = 70 + rand() * 150, r = 70 + rand() * 90;
        geos.push(mountainGeometry(r, h, i + 1).rotateY(rand() * 6).translate(Math.cos(a) * d, -2, Math.sin(a) * d));
      }
      const m = new THREE.Mesh(merge(geos.map(g => [g, null])), addDetail(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
        { fine: 0.02, coarse: 0.004, strength: 0.2, coarseStrength: 0.25 }));
      g.add(m);
    }
    // Clouds
    const cloudMat = this.cloudMat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#b8c4d0', flatShading: true });
    for (let i = 0; i < 18; i++) {
      const c = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(10 + rand() * 10, 0), cloudMat);
        b.position.set(k * 14 - 20, rand() * 5, rand() * 10);
        b.scale.y = 0.5;
        c.add(b);
      }
      const a = rand() * Math.PI * 2, d = 200 + rand() * 500;
      c.position.set(Math.cos(a) * d, 130 + rand() * 80, Math.sin(a) * d);
      g.add(c);
    }
  }

  // Time-of-day look: lamp strength (0 by day) and cloud tint.
  setLighting(lamps, cloudColour, cloudEmissive) {
    this.lampHeadMat.emissiveIntensity = lamps * 1.6;
    this.lampPoolMat.opacity = 0.42 * lamps;
    this.lampBeamMat.opacity = 0.045 * lamps;
    for (const m of this.lampGlow) m.visible = lamps > 0;
    this.cloudMat.color.set(cloudColour);
    this.cloudMat.emissive.set(cloudEmissive);
  }

  groundHeight(x, z) {
    const [cx, cz] = cellOf(x, z);
    const c = this.cell(cx, cz);
    return c && c.t === 'water' ? -6 : this.hillHeight(x, z);
  }

  // Tyre grip factor of the road surface (only applied on the road itself)
  surfaceGrip(x, z) {
    const [cx, cz] = cellOf(x, z);
    const c = this.cell(cx, cz);
    return !c ? 1 : c.t === 'ice' ? 0.42 : c.t === 'dirt' ? 0.72 : 1;
  }

  isWater(x, z) {
    const [cx, cz] = cellOf(x, z);
    const c = this.cell(cx, cz);
    return !!c && c.t === 'water';
  }

  onRoad(x, z) {
    const [cx, cz] = cellOf(x, z);
    const c = this.cell(cx, cz);
    if (!c) return false;
    const [ox, oz] = cellCenter(cx, cz);
    const dx = x - ox, dz = z - oz, a = c.r * Math.PI / 2;
    const lx = dx * Math.cos(a) + dz * Math.sin(a), lz = -dx * Math.sin(a) + dz * Math.cos(a);
    return onRoadLocal(c.t, lx, lz);
  }

  nearbyColliders(x, z, out) {
    out.length = 0;
    const [cx, cz] = cellOf(x, z);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const X = cx + dx, Z = cz + dz;
      if (X >= 0 && X < GRID && Z >= 0 && Z < GRID) for (const m of this.colliders[Z][X]) out.push(m);
    }
    return out;
  }

  // Nearest surface hit along a ray: track meshes and (optionally) the ground.
  raycast(origin, dir, far, withGround = true) {
    let best = null;
    const list = this.nearbyColliders(origin.x, origin.z, this._list || (this._list = []));
    if (list.length) {
      _ray.set(origin, dir);
      _ray.near = 0;
      _ray.far = far;
      const hits = _ray.intersectObjects(list, false);
      if (hits.length) {
        const h = hits[0];
        const n = h.face.normal.clone();
        if (n.dot(dir) > 0) n.negate();
        best = { dist: h.distance, point: h.point, normal: n, object: h.object };
      }
    }
    if (withGround && dir.y < -1e-6) {
      // Ground: intersect the height at the ray origin, then refine once at the hit point (hills are gentle)
      let t = (this.groundHeight(origin.x, origin.z) - origin.y) / dir.y;
      _tmp.copy(origin).addScaledVector(dir, Math.max(0, t));
      t = (this.groundHeight(_tmp.x, _tmp.z) - origin.y) / dir.y;
      if (t >= -0.3 && t <= far && (!best || t < best.dist)) {
        const point = _tmp.copy(origin).addScaledVector(dir, t).clone();
        best = { dist: Math.max(0, t), point, normal: this.groundNormal(point.x, point.z) };
      }
    }
    return best;
  }
}
