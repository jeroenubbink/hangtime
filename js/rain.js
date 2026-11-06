// Rain: streaks falling in a box that follows the camera (Hangtime's and Rushtime's). `lines` is hidden till it's
// shown; `update(dt, around)` each frame lets it fall round `around`.
import * as THREE from 'three';

export function makeRain(scene, colour = '#c3ced8') {
  const N = 1400, pos = new Float32Array(N * 6), B = { x: 50, y: 30, z: 50 };
  for (let i = 0; i < N; i++) {
    const x = (Math.random() - 0.5) * B.x, y = Math.random() * B.y, z = (Math.random() - 0.5) * B.z;
    pos.set([x, y, z, x + 0.15, y + 0.9, z], i * 6);
  }
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: 0.5 }));
  lines.frustumCulled = false;
  lines.visible = false;
  scene.add(lines);
  return {
    lines,
    update(dt, around) {
      if (!lines.visible) return;
      const fall = 26 * dt;
      for (let i = 0; i < N; i++) {
        const o = i * 6;
        pos[o + 1] -= fall; pos[o + 4] -= fall; pos[o] -= fall * 0.16; pos[o + 3] -= fall * 0.16;
        if (pos[o + 1] < 0) {
          const x = (Math.random() - 0.5) * B.x, z = (Math.random() - 0.5) * B.z;
          pos.set([x, B.y, z, x + 0.15, B.y + 0.9, z], o);
        }
      }
      lines.position.set(around.x, around.y - 12, around.z);
      g.attributes.position.needsUpdate = true;
    },
  };
}
