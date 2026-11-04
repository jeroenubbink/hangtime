// Parked cars far off: a box in the car's paint and a dark cabin on it, two draw calls for the whole car park, in place
// of models of thousands of triangles each that are a few pixels across from up in the air. Close in, or once it's been
// woken (knocked, or the crash has come near it), a car is its own model again.
import * as THREE from 'three';

const FAR = 110;
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class StandIns {
  // `list`: [{ v, size: [width, length] }]
  constructor(scene, list) {
    this.scene = scene;
    this.list = list;
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.body = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial(), list.length);
    this.cab = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ color: '#27303c' }), list.length);
    list.forEach(({ v }, i) => this.body.setColorAt(i, _c.set(v.colour)));
    for (const m of [this.body, this.cab]) { m.frustumCulled = false; m.receiveShadow = true; }
    // (which of them are boxes now: a model's only ever hidden and shown again by this, not every frame, as a car torn
    // in half has its own model hidden for good)
    this.boxed = list.map(() => false);
    scene.add(this.body, this.cab);
  }

  update(eye) {
    this.list.forEach(({ v, size: [w, l] }, i) => {
      const c = v.car, far = v.asleep && !v.halved && c.pos.distanceToSquared(eye) > FAR * FAR;
      if (far !== this.boxed[i]) { this.boxed[i] = far; v.model.visible = !far && !v.halved; }
      if (!far) { this.body.setMatrixAt(i, ZERO); this.cab.setMatrixAt(i, ZERO); return; }
      this.body.setMatrixAt(i, _m.compose(_p.copy(c.pos).addScaledVector(_up, -0.15), c.q, _s.set(w, 0.9, l)));
      this.cab.setMatrixAt(i, _m.compose(_p.copy(c.pos).addScaledVector(_up, 0.55), c.q, _s.set(w * 0.86, 0.55, l * 0.5)));
    });
    this.body.instanceMatrix.needsUpdate = this.cab.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.body, this.cab);
    this.body.geometry.dispose();
    this.body.material.dispose(); this.cab.material.dispose();
    this.body.dispose(); this.cab.dispose();
    this.list.forEach(({ v }, i) => { if (this.boxed[i]) v.model.visible = true; });
  }
}
