// Banknotes, everywhere: what a cash van turns into when it goes up. Blown high, then fluttering down slowly, swaying
// and turning over as they go, and lying where they land till the next run. (Just to look at: nothing hits them.)
import * as THREE from 'three';
import { coin } from './bank.js';

// (a size up from a real one's, to be seen from where the camera is)
const MAX = 400, W = 0.6, H = 0.28;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();

export class Banknotes {
  // `ground(x, z, y)`: how high the ground is there, under y
  constructor(scene, ground) {
    this.ground = ground;
    this.list = [];
    const mat = new THREE.MeshLambertMaterial({ map: note(), side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(W, H), mat, MAX);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.scene = scene;
  }

  // n of them out of p, thrown up and every way, and a little along `vel` (the van's)
  burst(p, vel, n = 220) {
    for (let i = 0; i < n; i++) {
      if (this.list.length >= MAX) this.list.shift();
      const a = Math.random() * Math.PI * 2, u = 3 + Math.random() * 9;
      this.list.push({
        p: new THREE.Vector3(p.x + (Math.random() - 0.5) * 2, p.y + 1 + Math.random(), p.z + (Math.random() - 0.5) * 3),
        v: new THREE.Vector3(Math.cos(a) * u + vel.x * 0.3, 8 + Math.random() * 14, Math.sin(a) * u + vel.z * 0.3),
        // (each one swaying its own way as it falls: how fast, how far, and where in it)
        sway: 1.2 + Math.random() * 1.6, far: 0.8 + Math.random() * 1.4, ph: Math.random() * 6.3,
        r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6), spin: new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 9),
        t: 0, rest: false,
      });
    }
  }

  update(dt) {
    const L = this.list;
    for (const o of L) {
      if (o.rest) continue;
      o.t += dt;
      // Paper: gravity, and air holding it back hard (it soon falls no faster than a couple of metres a second), and
      // a sway from side to side as it comes down
      o.v.y -= 9.81 * dt;
      const k = Math.exp(-dt * (o.v.y < 0 ? 3.2 : 1.1));
      o.v.multiplyScalar(k);
      const s = Math.cos(o.t * o.sway + o.ph) * o.far;
      o.p.x += (o.v.x + s) * dt;
      o.p.y += o.v.y * dt;
      o.p.z += (o.v.z + s * 0.6) * dt;
      o.r.addScaledVector(o.spin, dt);
      const gy = this.ground(o.p.x, o.p.z, o.p.y + 0.5);
      if (o.p.y < gy + 0.06) {
        // (down: flat, a little turned, where it fell)
        o.p.y = gy + 0.06 + Math.random() * 0.03;
        o.r.set(-Math.PI / 2, 0, o.r.z);
        o.rest = true;
      }
    }
    L.forEach((o, i) => this.mesh.setMatrixAt(i, _m.compose(o.p, _q.setFromEuler(_e.set(o.r.x, o.r.y, o.r.z)), _s)));
    this.mesh.count = L.length;
    if (L.length) this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() { this.list = []; this.mesh.count = 0; }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.map.dispose();
    this.mesh.material.dispose();
    this.mesh.dispose();
  }
}

// A Fiatmine note: cream, an orange border, the coin on it, and its value
function note() {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 60;
  const g = cv.getContext('2d');
  g.fillStyle = '#f3e7c4'; g.fillRect(0, 0, 128, 60);
  g.strokeStyle = '#ff8a1a'; g.lineWidth = 6; g.strokeRect(3, 3, 122, 54);
  g.strokeStyle = '#1f878c'; g.lineWidth = 2; g.strokeRect(10, 10, 108, 40);
  coin(g, 34, 30, 15);
  g.fillStyle = '#1f878c'; g.font = "900 26px 'Cinzel', serif"; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('100', 86, 31);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
