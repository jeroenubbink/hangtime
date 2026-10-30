// Pickups (floating crates on pads round the arena), mines, and the cones and barrels lying about to be
// smashed for points.
import * as THREE from 'three';
import { merge } from '../scenery.js';
import { kitScene } from '../car.js';

export const ITEMS = {
  repair: { name: 'Repair', colour: '#3ddc84', instant: true, note: 'Fixed up!' },
  nitro: { name: 'Nitro', colour: '#3aa8ff', instant: true, note: 'Nitro full' },
  shield: { name: 'Shield', colour: '#7ff0ff', instant: true, note: 'Shield: 6 s', secs: 6 },
  ram: { name: 'Spikes', colour: '#ff4a3d', instant: true, note: 'Spikes: double damage, 8 s', secs: 8 },
  shock: { name: 'Shockwave', colour: '#b46bff', note: 'Shockwave ready: E' },
  mine: { name: 'Mine', colour: '#ffa31a', note: 'Mine ready: E' },
  time: { name: '+Time', colour: '#ffd23a', instant: true, note: '+10 seconds' },
};

// Draw an item's symbol, white, centred in a box of size s at (x, y)
export function drawIcon(ctx, type, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 100, s / 100);
  ctx.fillStyle = ctx.strokeStyle = '#fff';
  ctx.lineWidth = 9;
  ctx.lineCap = ctx.lineJoin = 'round';
  ctx.beginPath();
  if (type === 'repair') {
    // Wrench
    ctx.save(); ctx.rotate(-Math.PI / 4);
    ctx.fillRect(-7, -26, 14, 52);
    ctx.beginPath(); ctx.arc(0, -30, 15, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillRect(-6, -48, 12, 18);
    ctx.restore();
  } else if (type === 'nitro') {
    ctx.moveTo(8, -38); ctx.lineTo(-18, 6); ctx.lineTo(0, 6); ctx.lineTo(-8, 38); ctx.lineTo(18, -6); ctx.lineTo(0, -6); ctx.closePath(); ctx.fill();
  } else if (type === 'shield') {
    ctx.moveTo(0, -36); ctx.lineTo(28, -24); ctx.quadraticCurveTo(26, 20, 0, 38); ctx.quadraticCurveTo(-26, 20, -28, -24); ctx.closePath(); ctx.stroke();
  } else if (type === 'ram') {
    for (let k = -1; k <= 1; k++) { ctx.moveTo(-30, k * 22 - 10); ctx.lineTo(30, k * 22); ctx.lineTo(-30, k * 22 + 10); }
    ctx.fill();
  } else if (type === 'shock') {
    for (const r of [10, 22, 34]) { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.globalAlpha = 1.3 - r / 34; ctx.stroke(); }
  } else if (type === 'mine') {
    ctx.arc(0, 4, 22, 0, Math.PI * 2); ctx.fill();
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; ctx.moveTo(Math.cos(a) * 22, 4 + Math.sin(a) * 22); ctx.lineTo(Math.cos(a) * 34, 4 + Math.sin(a) * 34); }
    ctx.stroke();
  } else if (type === 'time') {
    ctx.arc(0, 0, 32, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(0, 0); ctx.lineTo(14, 10); ctx.stroke();
  }
  ctx.restore();
}

function crateTexture(type) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = ITEMS[type].colour;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 0, 128, 10); ctx.fillRect(0, 118, 128, 10); ctx.fillRect(0, 0, 10, 128); ctx.fillRect(118, 0, 10, 128);
  drawIcon(ctx, type, 64, 64, 96);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Pickups {
  constructor(scene, arena, types) {
    this.scene = scene;
    this.arena = arena;
    this.types = types;
    this.group = new THREE.Group();
    this.list = arena.pads.map(([x, z], i) => ({ x, z, y: arena.groundHeight(x, z), active: false, wait: 1 + i * 0.7, type: null, mesh: null }));
    this.mats = Object.fromEntries(Object.keys(ITEMS).map(k => [k, new THREE.MeshBasicMaterial({ map: crateTexture(k) })]));
    this.box = new THREE.BoxGeometry(1.3, 1.3, 1.3);
    // Pad markers on the ground
    const ring = new THREE.RingGeometry(1.7, 2.1, 32).rotateX(-Math.PI / 2);
    this.padMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    for (const p of this.list) {
      const r = new THREE.Mesh(ring, this.padMat);
      r.position.set(p.x, p.y + 0.03, p.z);
      this.group.add(r);
      p.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 7, 16, 1, true).translate(0, 3.5, 0),
        new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      p.beam.position.set(p.x, p.y, p.z);
      p.beam.visible = false;
      this.group.add(p.beam);
    }
    scene.add(this.group);
  }

  dispose() { this.scene.remove(this.group); }

  pick() {
    // Repairs a little more often than the rest
    const t = this.types;
    return Math.random() < 0.25 && t.includes('repair') ? 'repair' : t[Math.floor(Math.random() * t.length)];
  }

  // Returns [{ vehicle, type }] for crates collected this step
  update(dt, vehicles, time) {
    const got = [];
    for (const p of this.list) {
      if (!p.active) {
        p.wait -= dt;
        if (p.wait <= 0) {
          p.active = true;
          p.type = this.pick();
          p.mesh = new THREE.Mesh(this.box, this.mats[p.type]);
          p.mesh.position.set(p.x, p.y + 1.4, p.z);
          this.group.add(p.mesh);
          p.beam.material.color.set(ITEMS[p.type].colour);
          p.beam.visible = true;
        }
        continue;
      }
      p.mesh.rotation.y = time * 1.8;
      p.mesh.rotation.x = Math.sin(time * 1.3) * 0.3;
      p.mesh.position.y = p.y + 1.4 + Math.sin(time * 2.4 + p.x) * 0.2;
      for (const v of vehicles) {
        if (!v.alive) continue;
        const c = v.car.pos;
        if ((c.x - p.x) ** 2 + (c.z - p.z) ** 2 < 2.6 * 2.6 && Math.abs(c.y - p.y - 1) < 3) {
          got.push({ vehicle: v, type: p.type, pos: p.mesh.position.clone() });
          this.group.remove(p.mesh);
          p.mesh = null;
          p.active = false;
          p.beam.visible = false;
          p.wait = 7 + Math.random() * 6;
          break;
        }
      }
    }
    return got;
  }
}

// ---------- Mines ----------
export class Mines {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.geo = merge([
      [new THREE.CylinderGeometry(0.55, 0.65, 0.22, 12).translate(0, 0.11, 0), '#2a2d33'],
      [new THREE.CylinderGeometry(0.4, 0.4, 0.06, 12).translate(0, 0.25, 0), '#ffa31a'],
    ]);
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.lamp = new THREE.MeshBasicMaterial({ color: '#ff2a1a' });
    this.lampGeo = new THREE.SphereGeometry(0.11, 8, 6).translate(0, 0.32, 0);
  }

  drop(owner, pos, y) {
    const m = new THREE.Group();
    m.add(new THREE.Mesh(this.geo, this.mat));
    const l = new THREE.Mesh(this.lampGeo, this.lamp);
    m.add(l);
    m.position.set(pos.x, y, pos.z);
    this.scene.add(m);
    this.list.push({ owner, mesh: m, lamp: l, t: 0 });
    if (this.list.length > 8) this.remove(0);
  }

  remove(i) { this.scene.remove(this.list[i].mesh); this.list.splice(i, 1); }

  // Returns mines set off this step: [{ owner, pos }]
  update(dt, vehicles) {
    const out = [];
    for (let i = this.list.length - 1; i >= 0; i--) {
      const m = this.list[i];
      m.t += dt;
      m.lamp.visible = Math.sin(m.t * (m.t > 1 ? 14 : 5)) > 0;
      if (m.t < 1) continue;                    // arming
      if (m.t > 40) { this.remove(i); continue; }
      for (const v of vehicles) {
        if (!v.alive) continue;
        const p = v.car.pos;
        if ((p.x - m.mesh.position.x) ** 2 + (p.z - m.mesh.position.z) ** 2 < 2.4 * 2.4 && Math.abs(p.y - m.mesh.position.y) < 2.5) {
          out.push({ owner: m.owner, pos: m.mesh.position.clone() });
          this.remove(i);
          break;
        }
      }
    }
    return out;
  }

  clear() { while (this.list.length) this.remove(0); }
}

// ---------- Props ----------
// Cones and barrels, drawn instanced; a knocked one is hidden here and flies off as debris.
export class Props {
  constructor(scene, arena, count, seed = 3) {
    this.scene = scene;
    const rand = (() => { let s = seed; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
    const cone = kitScene('cone');
    let coneGeo = null;
    cone?.traverse(o => { if (o.isMesh && !coneGeo) coneGeo = o.geometry.clone().scale(1.4, 1.4, 1.4); });
    this.kinds = {
      cone: { geo: coneGeo || new THREE.ConeGeometry(0.3, 0.8, 10).translate(0, 0.4, 0), mat: coneGeo ? new THREE.MeshLambertMaterial({ map: (() => { let m; cone.traverse(o => { if (o.isMesh && !m) m = o.material.map; }); return m; })() }) : new THREE.MeshLambertMaterial({ color: '#ff7a1a' }), r: 0.4, mass: 0.2 },
      barrel: {
        geo: merge([
          [new THREE.CylinderGeometry(0.42, 0.42, 1.1, 12).translate(0, 0.55, 0), (y) => (Math.abs(y - 0.55) < 0.15 ? '#f2f2f2' : '#d8352b')],
          [new THREE.CylinderGeometry(0.44, 0.44, 0.06, 12).translate(0, 0.3, 0), '#9b2a20'],
          [new THREE.CylinderGeometry(0.44, 0.44, 0.06, 12).translate(0, 0.8, 0), '#9b2a20'],
        ]),
        mat: new THREE.MeshLambertMaterial({ vertexColors: true }), r: 0.5, mass: 0.5,
      },
    };
    this.list = [];
    const size = arena.size;
    let tries = 0;
    while (this.list.length < count && tries++ < count * 30) {
      const x = (rand() - 0.5) * size * 2, z = (rand() - 0.5) * size * 2;
      if (arena.edge(x, z) > -5) continue;
      if (arena.pads.some(([px, pz]) => Math.hypot(px - x, pz - z) < 5)) continue;
      if (arena.spawns.some(s => Math.hypot(s.x - x, s.z - z) < 6)) continue;
      if (arena.trees.some(t => Math.hypot(t.x - x, t.z - z) < t.r + 3)) continue;
      const kind = rand() < 0.6 ? 'cone' : 'barrel';
      // Cones come in short rows
      const n = kind === 'cone' ? 3 : 1, a = rand() * Math.PI;
      for (let k = 0; k < n; k++) {
        const px = x + Math.cos(a) * k * 1.6, pz = z + Math.sin(a) * k * 1.6;
        this.list.push({ kind, x: px, z: pz, y: arena.groundHeight(px, pz), alive: true, rot: rand() * 6 });
      }
    }
    this.meshes = {};
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion();
    for (const [kind, k] of Object.entries(this.kinds)) {
      const items = this.list.filter(p => p.kind === kind);
      const m = new THREE.InstancedMesh(k.geo, k.mat, Math.max(1, items.length));
      items.forEach((p, i) => {
        p.index = i;
        m.setMatrixAt(i, M.compose(new THREE.Vector3(p.x, p.y, p.z), Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot), new THREE.Vector3(1, 1, 1)));
      });
      m.count = items.length;
      m.castShadow = true;
      m.computeBoundingSphere();
      scene.add(m);
      this.meshes[kind] = m;
    }
  }

  dispose() { for (const m of Object.values(this.meshes)) this.scene.remove(m); }

  // Knock over props cars drive into. Returns [{ vehicle, prop, mesh, vel }] for the caller to score and fling.
  update(vehicles) {
    const out = [];
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const p of this.list) {
      if (!p.alive) continue;
      for (const v of vehicles) {
        if (!v.alive && !v.wrecked) continue;
        const c = v.car;
        const dx = c.pos.x - p.x, dz = c.pos.z - p.z;
        if (dx * dx + dz * dz > 9 || Math.abs(c.pos.y - p.y) > 2.5) continue;
        // Close enough: test against the car's length
        const lp = v.localPoint(new THREE.Vector3(p.x, c.pos.y, p.z));
        if (Math.abs(lp.x) > v.r + 0.3 || Math.abs(lp.z) > v.len / 2 + 0.3) continue;
        p.alive = false;
        const k = this.kinds[p.kind], m = this.meshes[p.kind];
        m.setMatrixAt(p.index, zero);
        m.instanceMatrix.needsUpdate = true;
        const mesh = new THREE.Mesh(k.geo, k.mat);
        mesh.rotation.y = p.rot;
        k.geo.userData.shared = true;
        const sp = c.vel.length();
        const vel = c.vel.clone().multiplyScalar(1.15).add(new THREE.Vector3((Math.random() - 0.5) * 3, 3 + sp * 0.25, (Math.random() - 0.5) * 3));
        c.vel.multiplyScalar(1 - k.mass * 0.03);
        out.push({ vehicle: v, prop: p, mesh, pos: new THREE.Vector3(p.x, p.y + 0.4, p.z), vel, radius: k.r });
        break;
      }
    }
    return out;
  }
}
