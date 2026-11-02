// Street furniture that goes flying: lamp posts, trees, traffic lights, bins, hydrants (which then gush),
// bollards along the quay and cones round the roadworks. Instanced per kind; a knocked prop leaves its
// instance and tumbles away as loose debris.
import * as THREE from 'three';
import { merge, sceneryGeo } from '../scenery.js';
import { CURB } from './city.js';

const CELL = 20;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function shared(g) { g.userData.shared = true; return g; }
const MODELS = {
  lamp: () => merge([
    [new THREE.CylinderGeometry(0.09, 0.13, 6.2, 8).translate(0, 3.1, 0), '#5d6470'],
    [new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6).rotateZ(Math.PI / 2).translate(-0.75, 6.1, 0), '#5d6470'],
    [new THREE.BoxGeometry(0.7, 0.18, 0.36).translate(-1.45, 6.05, 0), '#3c414a'],
    [new THREE.BoxGeometry(0.6, 0.06, 0.28).translate(-1.45, 5.94, 0), '#fff5c8'],
  ]),
  light: () => merge([
    [new THREE.CylinderGeometry(0.1, 0.12, 4.2, 8).translate(0, 2.1, 0), '#3c414a'],
    [new THREE.BoxGeometry(0.42, 1.25, 0.36).translate(0, 4.3, 0), '#2a2d33'],
    [new THREE.SphereGeometry(0.13, 8, 6).translate(0, 4.7, -0.2), '#ff3b2f'],
    [new THREE.SphereGeometry(0.13, 8, 6).translate(0, 4.3, -0.2), '#4a3a12'],
    [new THREE.SphereGeometry(0.13, 8, 6).translate(0, 3.9, -0.2), '#163a1c'],
  ]),
  tree: () => sceneryGeo('round') || merge([
    [new THREE.CylinderGeometry(0.2, 0.3, 2.4, 6).translate(0, 1.2, 0), '#7a5534'],
    [new THREE.IcosahedronGeometry(1.7, 1).translate(0, 3.4, 0), '#4f9a3c'],
  ]),
  bin: () => merge([
    [new THREE.CylinderGeometry(0.32, 0.28, 0.95, 10).translate(0, 0.48, 0), '#3d8a4a'],
    [new THREE.CylinderGeometry(0.35, 0.35, 0.08, 10).translate(0, 0.98, 0), '#2c6a38'],
  ]),
  hydrant: () => merge([
    [new THREE.CylinderGeometry(0.16, 0.2, 0.7, 8).translate(0, 0.35, 0), '#e8352b'],
    [new THREE.SphereGeometry(0.17, 8, 6).translate(0, 0.72, 0), '#e8352b'],
    [new THREE.CylinderGeometry(0.07, 0.07, 0.5, 6).rotateZ(Math.PI / 2).translate(0, 0.45, 0), '#c9ccd2'],
  ]),
  bollard: () => merge([
    [new THREE.CylinderGeometry(0.18, 0.24, 0.8, 8).translate(0, 0.4, 0), '#3a3a40'],
    [new THREE.SphereGeometry(0.2, 8, 5).translate(0, 0.8, 0), '#3a3a40'],
  ]),
  cone: () => sceneryGeo('cone') || new THREE.ConeGeometry(0.3, 0.8, 10).translate(0, 0.4, 0),
  pump: () => merge([
    [new THREE.BoxGeometry(1.0, 0.25, 0.7).translate(0, 0.12, 0), '#9a9a9a'],
    [new THREE.BoxGeometry(0.8, 1.5, 0.5).translate(0, 1.0, 0), '#e8352b'],
    [new THREE.BoxGeometry(0.7, 0.35, 0.52).translate(0, 1.95, 0), '#f4f4f0'],
    [new THREE.BoxGeometry(0.5, 0.3, 0.54).translate(0, 1.3, 0), '#2a2d33'],
    [new THREE.CylinderGeometry(0.05, 0.05, 0.8, 6).translate(0.45, 1.1, 0), '#222222'],
  ]),
  // A tall price sign on a pole
  sign: () => merge([
    [new THREE.CylinderGeometry(0.16, 0.2, 7, 8).translate(0, 3.5, 0), '#5d6470'],
    [new THREE.BoxGeometry(2.6, 3.2, 0.4).translate(0, 8.3, 0), '#f4f4f0'],
    [new THREE.BoxGeometry(2.7, 0.9, 0.44).translate(0, 9.5, 0), '#e8352b'],
    [new THREE.BoxGeometry(2.2, 0.5, 0.46).translate(0, 8.2, 0), '#2a2d33'],
    [new THREE.BoxGeometry(2.2, 0.5, 0.46).translate(0, 7.4, 0), '#2a2d33'],
  ]),
  pillar: () => merge([[new THREE.BoxGeometry(0.5, 5.4, 0.5).translate(0, 2.7, 0), '#d8dadc'], [new THREE.BoxGeometry(0.8, 0.5, 0.8).translate(0, 0.25, 0), '#9a9a9a']]),
  barrier: () => merge([
    [new THREE.BoxGeometry(2.2, 0.32, 0.12).translate(0, 0.85, 0), (y, f) => (f % 4 < 2 ? '#e8352b' : '#f4f4f0')],
    [new THREE.BoxGeometry(0.08, 0.9, 0.08).translate(-0.9, 0.45, 0), '#3a3a40'],
    [new THREE.BoxGeometry(0.08, 0.9, 0.08).translate(0.9, 0.45, 0), '#3a3a40'],
  ]),
};
// r: how close a car has to come (m); slow: speed a car loses knocking it over; h: how tall (for the flight)
const KINDS = {
  lamp: { r: 0.3, slow: 0.1, h: 6 }, light: { r: 0.3, slow: 0.1, h: 4.6 }, tree: { r: 0.45, slow: 0.22, h: 4 },
  bin: { r: 0.35, slow: 0.02, h: 1 }, hydrant: { r: 0.25, slow: 0.05, h: 0.8 }, bollard: { r: 0.25, slow: 0.08, h: 0.9 },
  cone: { r: 0.35, slow: 0, h: 0.8 }, barrier: { r: 1.1, slow: 0.03, h: 1 },
  pump: { r: 0.5, slow: 0.12, h: 2.1 }, sign: { r: 0.3, slow: 0.15, h: 9.9 }, pillar: { r: 0.35, slow: 0.25, h: 5.4 },
};

export class Props {
  constructor(scene, city, extra = []) {
    this.scene = scene;
    this.city = city;
    this.list = [];
    this.grid = new Map();
    this.meshes = {};
    this.geos = {};
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.lay(extra);
    this.build();
  }

  add(kind, x, z, rot = 0) {
    const y = this.city.groundHeight(x, z);
    this.list.push({ kind, x, y, z, rot, alive: true, ...KINDS[kind] });
  }

  // Along the kerb of every pavement: lamp posts, and trees between them; traffic lights at the junctions
  lay(extra) {
    const city = this.city;
    for (const r of city.roads) {
      for (const side of [-1, 1]) {
        const e = side > 0 ? r.vHi : r.vLo;
        // (lamp arms reach out over the road)
        const arm = Math.atan2(-side * r.rv[1], side * r.rv[0]);
        for (let s = 10, k = 0; s < r.len - 10; s += 15, k++) {
          const at = (d, ds = 0) => r.at(s + ds, e + side * d);
          const [x, z] = at(k % 2 ? 2.4 : 0.7);
          if (city.isRoad(x, z) || city.roadDist(x, z) > 3 || city.inLot(x, z, 1)) continue;
          if (city.junctions.some(({ box: [a, b, c, d] }) => x > a - 6 && x < b + 6 && z > c - 6 && z < d + 6)) continue;
          if (k % 2) this.add('tree', x, z, s * 0.7);
          else this.add('lamp', x, z, arm);
          // (every 7th post, alternating bin and hydrant)
          if (k % 7 === 3) { const [bx, bz] = at(1.4, 1.5); this.add((k - 3) % 14 === 0 ? 'bin' : 'hydrant', bx, bz); }
        }
      }
    }
    for (const { box: [a, b, c, d], square } of city.junctions) {
      if (!square) continue;
      for (const [x, z, rot] of [[a - 1.2, d + 1.2, 0], [b + 1.2, c - 1.2, Math.PI], [a - 1.2, c - 1.2, -Math.PI / 2], [b + 1.2, d + 1.2, Math.PI / 2]]) {
        if (!city.isRoad(x, z)) this.add('light', x, z, rot);
      }
    }
    for (const [kind, x, z, rot] of extra) this.add(kind, x, z, rot);
    for (const p of this.list) {
      const key = Math.floor(p.x / CELL) + ',' + Math.floor(p.z / CELL);
      if (!this.grid.has(key)) this.grid.set(key, []);
      this.grid.get(key).push(p);
    }
  }

  build() {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    for (const kind of Object.keys(KINDS)) {
      const items = this.list.filter(p => p.kind === kind);
      if (!items.length) continue;
      const geo = this.geos[kind] = shared(MODELS[kind]());
      const mesh = new THREE.InstancedMesh(geo, this.mat, items.length);
      items.forEach((p, i) => {
        p.i = i;
        q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, p.rot);
        mesh.setMatrixAt(i, m.compose(new THREE.Vector3(p.x, p.y - 0.02, p.z), q, one));
      });
      mesh.castShadow = kind !== 'cone';
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.meshes[kind] = mesh;
      this.scene.add(mesh);
    }
  }

  dispose() {
    for (const m of Object.values(this.meshes)) { this.scene.remove(m); m.dispose(); }
    for (const g of Object.values(this.geos)) g.dispose();
    this.mat.dispose();
  }

  // Props in the grid cell around (x, z)
  near(x, z) { return this.grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || []; }

  // Cars knock props over. Returns [{ prop, vehicle, vel }], and takes the prop out of the street.
  update(vehicles) {
    const out = [];
    for (const v of vehicles) {
      const c = v.car;
      if (c.vel.lengthSq() < 4) continue;
      const list = this.grid.get(Math.floor(c.pos.x / CELL) + ',' + Math.floor(c.pos.z / CELL));
      const near = [list];
      // The neighbouring cells too, for a car near a cell's edge
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) near.push(this.grid.get((Math.floor(c.pos.x / CELL) + dx) + ',' + (Math.floor(c.pos.z / CELL) + dz)));
      for (const L of near) {
        if (!L) continue;
        for (const p of L) {
          if (!p.alive || c.pos.y - p.y > p.h + 1) continue;
          // Closest point along the car's length
          const fx = -2 * (c.q.x * c.q.z + c.q.w * c.q.y), fz = -(1 - 2 * (c.q.x * c.q.x + c.q.y * c.q.y));
          const t = Math.max(-v.len / 2 + 0.6, Math.min(v.len / 2 - 0.6, (p.x - c.pos.x) * fx + (p.z - c.pos.z) * fz));
          const dx = p.x - (c.pos.x + fx * t), dz = p.z - (c.pos.z + fz * t);
          if (dx * dx + dz * dz > (p.r + v.r) ** 2) continue;
          const vel = c.vel.clone().multiplyScalar(0.9 + Math.random() * 0.3).add(new THREE.Vector3((Math.random() - 0.5) * 3, 3 + Math.random() * 4, (Math.random() - 0.5) * 3));
          c.vel.multiplyScalar(1 - p.slow);
          this.knock(p);
          out.push({ prop: p, vehicle: v, vel });
        }
      }
    }
    return out;
  }

  // Take a prop out of the street
  knock(p) {
    p.alive = false;
    this.meshes[p.kind].setMatrixAt(p.i, ZERO);
    this.meshes[p.kind].instanceMatrix.needsUpdate = true;
  }
  // An explosion at (x, z) throws everything standing within R: returns [{ prop, vel }]
  blast(x, z, R, force = 12) {
    const out = [];
    for (const p of this.list) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (!p.alive || d > R) continue;
      this.knock(p);
      const k = 1 - d / R, dx = (p.x - x) / (d || 1), dz = (p.z - z) / (d || 1);
      out.push({ prop: p, vel: new THREE.Vector3(dx * force * k + (Math.random() - 0.5) * 3, 6 + 10 * k, dz * force * k + (Math.random() - 0.5) * 3) });
    }
    return out;
  }

  // A knocked prop as a free mesh, for the debris
  piece(p) {
    const g = new THREE.Group(), m = new THREE.Mesh(this.geos[p.kind], this.mat);
    m.position.y = -p.h / 2;
    m.castShadow = true;
    g.add(m);
    g.rotation.y = p.rot;
    return { mesh: g, pos: new THREE.Vector3(p.x, p.y + p.h / 2, p.z), radius: Math.min(0.6, p.h / 3) };
  }
}
export { CURB };
