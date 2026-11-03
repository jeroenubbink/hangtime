// Guide lines: a few coloured routes painted on the road, from the start towards a crash that's known to pay, so
// a junction's ideas can be seen before they're found. The routes are the bots' best runs (see ROUTES): where the
// car went, every fifth of a second, until it hit something. Off the ground (a ramp, the canal) the line goes
// dashed; where it ends there's a ring and a label with the route's name and what the bot scored.
import * as THREE from 'three';
import { ROUTES } from './routes.js';

const WIDTH = 0.8, LIFT = 0.14, STEP = 1.5;

export class Guides {
  constructor(scene, city) {
    this.scene = scene;
    this.group = new THREE.Group();
    (ROUTES[city.key] || []).forEach((r, i, all) => this.route(city, r, (i - (all.length - 1) / 2) * 1.2));
    scene.add(this.group);
  }

  // One route, `shift` m to its right (so routes down the same lane sit side by side, not on top of each other)
  route(city, R, shift) {
    // Resampled every STEP m, each point on the ground under the car (a deck where it was over one)
    const pts = [];
    for (let i = 0; i + 1 < R.pts.length; i++) {
      const [ax, az, ay] = R.pts[i], [bx, bz, by] = R.pts[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / STEP));
      for (let k = 0; k < n; k++) { const t = k / n; pts.push([ax + (bx - ax) * t, az + (bz - az) * t, ay + (by - ay) * t]); }
    }
    pts.push(R.pts[R.pts.length - 1]);
    if (pts.length < 2) return;
    const pos = [], index = [];
    let air = false, gap = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x, z, y] = pts[i], [px, pz] = pts[Math.max(0, i - 1)], [nx, nz] = pts[Math.min(pts.length - 1, i + 1)];
      let dx = nx - px, dz = nz - pz;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      const g = city.groundHeight(x, z, y + 0.5);
      // (up in the air: dashes, 3 m on and 3 m off)
      air = y - g > 1.6;
      gap = air ? gap + 1 : 0;
      const cx = x - dz * shift, cz = z + dx * shift, cy = city.groundHeight(cx, cz, y + 0.5) + LIFT;
      pos.push(cx - dz * WIDTH / 2, cy, cz + dx * WIDTH / 2, cx + dz * WIDTH / 2, cy, cz - dx * WIDTH / 2);
      if (i > 0 && !(air && gap % 4 >= 2)) { const a = (i - 1) * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(index);
    const mat = new THREE.MeshBasicMaterial({ color: R.colour, transparent: true, opacity: 0.8, depthWrite: false,
      side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -24, fog: false });
    const strip = new THREE.Mesh(geo, mat);
    strip.renderOrder = 2;
    this.group.add(strip);
    // The end: a ring on the ground, and the label over it
    const [ex, ez, ey] = pts[pts.length - 1], gy = city.groundHeight(ex, ez, ey + 0.5);
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3, 32).rotateX(-Math.PI / 2), mat);
    ring.position.set(ex, gy + LIFT, ez);
    ring.renderOrder = 2;
    this.group.add(ring);
    const label = this.label(`${R.name} · ${R.score.toLocaleString()}`, R.colour);
    label.position.set(ex, gy + 6, ez);
    this.group.add(label);
  }

  label(text, colour) {
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 96;
    const c = cv.getContext('2d');
    c.font = 'bold 44px system-ui, sans-serif';
    const w = Math.min(500, c.measureText(text).width + 40);
    c.fillStyle = 'rgba(0, 0, 0, 0.6)';
    c.fillRect((512 - w) / 2, 14, w, 68);
    c.fillStyle = colour;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, 256, 50, 480);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, fog: false }));
    s.scale.set(16, 3, 1);
    s.renderOrder = 3;
    return s;
  }

  dispose() {
    this.scene.remove(this.group);
    // (not a sprite's geometry: every sprite shares the one)
    this.group.traverse(o => { if (!o.isSprite) o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose(); });
  }
}
