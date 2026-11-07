// Indicators: the cars waiting to pull out of a merging lane (Bank Shot's queue) blinking right, front and back, till
// they're out. Drawn over the cars, two little amber lamps each, all of them in one go.
import * as THREE from 'three';

const MAX = 64, RATE = 1.6;
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

export class Blinkers {
  constructor(scene) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.16, 0.12), new THREE.MeshBasicMaterial({ color: '#ffa21a', toneMapped: false }), MAX);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.scene = scene;
  }

  // `cars`: the traffic; `t`: the time (they blink on it)
  update(cars, t) {
    let n = 0;
    for (const v of cars) {
      const L = v.lane;
      if (!L?.into || v.s > L.joinOwn + 3 || v.wrecked || v.blown || v.driver?.out || n > MAX - 2) continue;
      // (each its own beat, near enough together: they're all waiting for the same gap)
      if ((t * RATE + v.id * 0.23) % 1 > 0.5) continue;
      const [w, l] = v.def.size, c = v.car;
      for (const z of [-l / 2 + 0.06, l / 2 - 0.06]) {
        _p.set(w / 2 - 0.2, 0.1, z).applyQuaternion(c.q).add(c.pos);
        this.mesh.setMatrixAt(n++, _m.compose(_p, c.q, _s));
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.dispose();
  }
}
