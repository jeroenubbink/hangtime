// Scenery models: trees, bushes, rocks, mountains, tyre stacks and a grandstand. They are built from
// primitives with per-face colours and drawn instanced, so a few draw calls cover hundreds of them.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { addDetail } from './textures.js';

// Merge primitive geometries into one flat-shaded, vertex-coloured geometry. Each part is
// [geometry, colour or (y, faceIndex) => colour].
export function merge(parts) {
  const P = [], N = [], K = [];
  const c = new THREE.Color();
  for (const [geo, colour] of parts) {
    // Normals from the indexed shape are smooth across shared corners; flat ones need no index
    if (colour != null) geo.computeVertexNormals();
    const g = geo.index ? geo.toNonIndexed() : geo;
    const pos = g.attributes.position, nor = g.attributes.normal, col = g.attributes.color;
    for (let i = 0; i < pos.count; i += 3) {
      const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
      // No colour given: keep the geometry's own (merging already merged parts)
      if (colour != null) c.set(typeof colour === 'function' ? colour(y, i / 3) : colour);
      for (let k = i; k < i + 3; k++) {
        if (colour == null) c.fromBufferAttribute(col, k);
        P.push(pos.getX(k), pos.getY(k), pos.getZ(k));
        N.push(nor.getX(k), nor.getY(k), nor.getZ(k));
        K.push(c.r, c.g, c.b);
      }
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(K, 3));
  return out;
}

function rng(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Move each vertex of an indexed geometry by a random amount (shared vertices move together)
function jitter(geo, amount, seed, keepBase = true) {
  const r = rng(seed), pos = geo.attributes.position;
  const moved = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = [pos.getX(i), pos.getY(i), pos.getZ(i)].map(v => v.toFixed(3)).join();
    if (!moved.has(key)) moved.set(key, [(r() - 0.5) * amount, (r() - 0.5) * amount, (r() - 0.5) * amount]);
    const d = moved.get(key);
    const base = keepBase && pos.getY(i) <= geo.boundingBox?.min.y + 1e-3;
    pos.setXYZ(i, pos.getX(i) + d[0], pos.getY(i) + (base ? 0 : d[1]), pos.getZ(i) + d[2]);
  }
  return geo;
}

const shade = (hex, k) => new THREE.Color(hex).multiplyScalar(k);
const BARK = '#6b4a2b';

// Unit-sized models (about 1 m to a few m); instances scale them
const MODELS = {
  pine: () => merge([
    [new THREE.CylinderGeometry(0.28, 0.4, 2.2, 6).translate(0, 1.1, 0), BARK],
    [new THREE.ConeGeometry(2.5, 3.4, 7).translate(0, 3.4, 0), shade('#2f7a3a', 0.85)],
    [new THREE.ConeGeometry(2.0, 3.0, 7).translate(0, 5.0, 0), '#2f7a3a'],
    [new THREE.ConeGeometry(1.35, 2.6, 7).translate(0, 6.6, 0), shade('#2f7a3a', 1.15)],
  ]),
  round: () => {
    const blob = (r, x, y, z, s) => jitter(new THREE.IcosahedronGeometry(r, 1), r * 0.25, s, false).translate(x, y, z);
    return merge([
      [new THREE.CylinderGeometry(0.25, 0.38, 2.6, 6).translate(0, 1.3, 0), BARK],
      [blob(1.9, 0, 3.6, 0, 3), y => (y < 3.2 ? shade('#4f9a3c', 0.8) : '#4f9a3c')],
      [blob(1.4, 1.2, 4.6, 0.4, 5), shade('#4f9a3c', 1.12)],
      [blob(1.3, -1.0, 4.3, -0.6, 7), shade('#4f9a3c', 1.05)],
    ]);
  },
  flowers: () => merge([0, 1, 2, 3, 4, 5].map(i => [new THREE.IcosahedronGeometry(0.14, 0).scale(1, 0.65, 1)
    .translate(Math.cos(i * 2.4) * i * 0.25, 0.4, Math.sin(i * 2.4) * i * 0.25), ['#ffffff', '#ff8fc8', '#ffe14a', '#ff6f6f', '#b48cff'][i % 5]])),
  bush: () => merge([
    [jitter(new THREE.IcosahedronGeometry(0.9, 1), 0.25, 11, false).scale(1, 0.75, 1).translate(0, 0.45, 0), '#3f8a36'],
    [jitter(new THREE.IcosahedronGeometry(0.7, 1), 0.2, 13, false).scale(1, 0.8, 1).translate(0.8, 0.4, 0.3), shade('#3f8a36', 1.15)],
  ]),
  rock: () => merge([
    [jitter(new THREE.DodecahedronGeometry(1, 0), 0.45, 17, false).scale(1.2, 0.7, 1).translate(0, 0.25, 0), y => (y > 0.5 ? '#9a9890' : '#85837c')],
  ]),
  tyres: () => {
    // Three stacks of tyres in a row, red and white tops
    const parts = [];
    for (const x of [-0.75, 0, 0.75]) for (let k = 0; k < 3; k++) {
      parts.push([new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10).translate(x, 0.15 + k * 0.3, 0), k === 2 ? (x === 0 ? '#e8e8e8' : '#d8352b') : '#222326']);
    }
    return merge(parts);
  },
  // Long runs of tyres lining a wall: the same three stacks, each one six-sided cylinder banded by height
  tyrewall: () => merge([-0.75, 0, 0.75].map(x => [new THREE.CylinderGeometry(0.36, 0.36, 0.9, 6, 3).translate(x, 0.45, 0),
    y => (y > 0.6 ? (x === 0 ? '#e8e8e8' : '#d8352b') : '#222326')])),
};

// The toy-style kits modelled in Blender, vertex-coloured: `nature` (round trees, toy pines, flowering
// bushes, pebbles and flower patches) replaces the primitive models above, which stay as the fallback if
// it fails to load; `derby` adds Crunchtime's props, pillars, fence panels, a barn and a windmill.
export async function loadSceneryKit(file = 'nature') {
  const g = await new GLTFLoader().loadAsync(`assets/scenery/${file}.glb`);
  g.scene.traverse(o => {
    if (!o.isMesh) return;
    const geo = o.geometry;
    MODELS[o.name] = () => geo;
  });
}
// A kit model's geometry, or null if it isn't loaded
export const sceneryGeo = name => MODELS[name]?.() ?? null;

// Instanced placement: add(kind, x, y, z, scale, rotation), then build() returns the meshes
export class Scatter {
  constructor(seed) {
    this.items = {};
    this.rand = rng(seed);
    this.mat = addDetail(new THREE.MeshLambertMaterial({ vertexColors: true }), { fine: 0.9, strength: 0.12, coarse: 0.05, coarseStrength: 0.1 });
  }

  add(kind, x, y, z, s = 1, rot = this.rand() * 6.28) {
    (this.items[kind] ||= []).push([x, y, z, s, rot, 0.85 + this.rand() * 0.3]);
  }

  build() {
    const out = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    for (const [kind, list] of Object.entries(this.items)) {
      if (!MODELS[kind]) continue;
      const mesh = new THREE.InstancedMesh(MODELS[kind](), this.mat, list.length);
      list.forEach(([x, y, z, s, rot, tint], i) => {
        q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rot);
        mesh.setMatrixAt(i, m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s * (0.9 + 0.2 * ((i * 0.618) % 1)), s)));
        mesh.setColorAt(i, c.setScalar(tint));
      });
      mesh.castShadow = kind !== 'rock';
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      out.push(mesh);
    }
    return out;
  }
}

// One soft rounded hill for the horizon: a squashed dome, gently lumpy. Every third one is a tall
// lavender-blue mountain with a snowy top; the rest are green, lighter towards the top.
export function mountainGeometry(r, h, seed) {
  const rand = rng(seed);
  const tall = seed % 3 === 0;
  const g = new THREE.SphereGeometry(r, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / r;
    // Gumdrop profile: steeper sides and a rounder top than a plain dome
    const k = Math.pow(Math.max(0, 1 - t), 0.8), side = Math.sqrt(1 - k * k * 0.15);
    pos.setXYZ(i, pos.getX(i) * side, Math.pow(t, 0.85) * h * (tall ? 0.95 : 0.75), pos.getZ(i) * side);
  }
  g.computeBoundingBox();
  jitter(g, r * 0.07, seed);
  const top = tall ? h * 0.95 : h * 0.75, snow = tall && h > 120 ? top * (0.72 + rand() * 0.08) : Infinity;
  const [lo, hi] = tall ? ['#7f8fd8', '#b9b6f0'] : [['#3f9e48', '#4aa84a', '#58b04a'][seed % 3], '#a6e35e'];
  return merge([[g, (y, f) => {
    const n = ((f * 7919) % 13) / 13;
    if (y > snow + (n - 0.5) * top * 0.05) return '#ffffff';
    return new THREE.Color(lo).lerp(new THREE.Color(hi), Math.min(1, y / top + (n - 0.5) * 0.08));
  }]]);
}

// Puffy clouds: round puffs, a big one in the middle and smaller ones either side, on a flat base.
// `n` clouds between `near` and `far` metres out, at about `y` metres up.
export function puffyClouds(rand, mat, { n = 18, near = 200, far = 700, y = 130 } = {}) {
  const g = new THREE.Group();
  const puff = new THREE.IcosahedronGeometry(1, 2);
  for (let i = 0; i < n; i++) {
    const c = new THREE.Group();
    const parts = 4 + Math.floor(rand() * 3);
    for (let k = 0; k < parts; k++) {
      const t = k / (parts - 1) - 0.5, r = (14 - Math.abs(t) * 14) * (0.8 + rand() * 0.4);
      const b = new THREE.Mesh(puff, mat);
      b.position.set(t * 52, r * 0.35, (rand() - 0.5) * 10);
      b.scale.set(r, r * 0.8, r);
      c.add(b);
    }
    const a = rand() * Math.PI * 2, d = near + rand() * (far - near);
    c.position.set(Math.cos(a) * d, y + rand() * 80, Math.sin(a) * d);
    g.add(c);
  }
  return g;
}

// A grandstand 22 m long (along x), facing -z: concrete terraces, a crowd, a roof on posts
export function grandstand(seed) {
  const rand = rng(seed);
  const parts = [];
  const crowd = ['#e8352b', '#ffcf2e', '#2f7fe0', '#f2f2f2', '#22b35a', '#ff7a1a', '#9b4dff', '#333a44'];
  const skin = ['#f1c7a0', '#d9a679', '#a8704a', '#6e4a2e'];
  for (let k = 0; k < 5; k++) {
    parts.push([new THREE.BoxGeometry(22, 0.6 + k * 0.6, 1.4).translate(0, (0.6 + k * 0.6) / 2, k * 1.4), k % 2 ? '#b9b3a7' : '#aaa497']);
    for (let x = -10.4; x <= 10.4; x += 0.7 + rand() * 0.35) {
      if (rand() < 0.18) continue;
      const y = 0.6 + k * 0.6, z = k * 1.4 - 0.1;
      parts.push([new THREE.BoxGeometry(0.42, 0.5, 0.32).translate(x, y + 0.25, z), crowd[Math.floor(rand() * crowd.length)]]);
      parts.push([new THREE.BoxGeometry(0.24, 0.24, 0.24).translate(x, y + 0.64, z), skin[Math.floor(rand() * skin.length)]]);
    }
  }
  parts.push([new THREE.BoxGeometry(22, 3.6, 0.3).translate(0, 1.8, 7.1), '#9e988c']);                 // back wall
  for (const x of [-10.8, 0, 10.8]) parts.push([new THREE.BoxGeometry(0.25, 6.2, 0.25).translate(x, 3.1, 6.8), '#5d636b']);
  parts.push([new THREE.BoxGeometry(23, 0.25, 8).rotateX(-0.12).translate(0, 6.3, 3.4), '#d8352b']); // roof
  parts.push([new THREE.BoxGeometry(23, 0.6, 0.1).translate(0, 5.9, -0.62), '#f3f3f3']);              // roof fascia
  const mesh = new THREE.Mesh(merge(parts), addDetail(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), { fine: 0.8, strength: 0.18 }));
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}
