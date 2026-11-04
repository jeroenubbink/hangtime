// Oranges, everywhere: what a fruit stand turns into when a car goes through it. They fly, bounce, roll down the
// street and stay where they stop, till the next run. (Just to look at: nothing hits them.)
import * as THREE from 'three';

const MAX = 120, R = 0.12;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1);

export class Oranges {
  // `ground(x, z, y)`: how high the ground is there, under y
  constructor(scene, ground) {
    this.ground = ground;
    this.list = [];
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(R, 1), new THREE.MeshLambertMaterial({ color: '#ff8a1a' }), MAX);
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.scene = scene;
  }

  // n of them out of (x, y, z), thrown along `vel` (the car that went through) and every way
  burst(x, y, z, vel, n = 70) {
    for (let i = 0; i < n && this.list.length < MAX; i++) {
      const a = Math.random() * Math.PI * 2, u = 2 + Math.random() * 6;
      this.list.push({
        p: new THREE.Vector3(x + (Math.random() - 0.5) * 2, y + 1 + Math.random() * 0.8, z + (Math.random() - 0.5) * 2),
        v: new THREE.Vector3(Math.cos(a) * u + vel.x * (0.2 + Math.random() * 0.5), 3 + Math.random() * 7, Math.sin(a) * u + vel.z * (0.2 + Math.random() * 0.5)),
        r: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0), rest: false,
      });
    }
  }

  update(dt) {
    const L = this.list;
    for (const o of L) {
      if (o.rest) continue;
      o.v.y -= 9.81 * dt;
      o.p.addScaledVector(o.v, dt);
      const gy = this.ground(o.p.x, o.p.z, o.p.y + 0.3);
      if (o.p.y < gy + R) {
        o.p.y = gy + R;
        // (a bounce, less each time, then rolling, slowing)
        if (o.v.y < -1.5) o.v.y *= -0.45; else o.v.y = 0;
        o.v.x *= 0.96; o.v.z *= 0.96;
        if (o.v.y === 0 && o.v.x * o.v.x + o.v.z * o.v.z < 0.04) o.rest = true;
      }
      o.r.x += o.v.z * dt / R; o.r.z -= o.v.x * dt / R;
    }
    L.forEach((o, i) => this.mesh.setMatrixAt(i, _m.compose(o.p, _q.setFromEuler(o.r), _s)));
    this.mesh.count = L.length;
    if (L.length) this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() { this.list = []; this.mesh.count = 0; }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.dispose();
  }
}
