// Tanker Row's fuel depot, across the road from you at the end: the yard the tankers parked out in front belong to. A
// palisade fence along the road with the gate in it (the company's name over it), the loading rack they fill up under,
// the office, and behind it all the tank farm, the biggest tank lettered with the name. From the depot kit (modelled in
// Blender, see assets/src/depot.py); the lettering is drawn here.
import * as THREE from 'three';
import { merge, sceneryGeo } from '../scenery.js';
import { fixtures } from './fixtures.js';
import { board, fit, onto } from './gateway.js';
import { t } from '../i18n.js';

const FONT = "900 {}px 'Titillium Web', Impact, sans-serif";
const TEAL = '#11898c', ORANGE = '#ff8a1a', CREAM = '#ece8dc';
const MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
const BUND = 1.3;

// `D`: { gate: [x, z], fence: [[x0, z0, x1, z1]] (lengths of fence, 10 m panels, the gate's gap left out), kit: [[kind,
// x, z, yaw]] (as fixtures; the kit's models face +z at yaw 0), bunds: [[x0, x1, z0, z1]] (walls round tanks), lines:
// [[[x, z], ...]] (painted on the yard), masts: [[x, z, yaw]] (the floodlights, facing the way yaw turns them), slabs: [x0, x1, z0, z1] (the yard, its joints drawn), lettered: [x, z, r, y] (the tank with the name on it:
// where it stands, its radius, and how high the name's middle is) }
export { flame };
export function depot(city, D) {
  const group = new THREE.Group(), gy = (x, z) => city.groundHeight(x, z, 1);
  group.add(fixtures(city, [['depot_gate', ...D.gate, 0], ...D.kit, ...(D.masts || []).map(M => ['depot_mast', ...M])]));
  // The floodlights on the masts, and the pools of light they throw on the yard, warm: on at night, and at dawn still
  // (`group.lamps(k)`, k 0 to 1, turns them up)
  const lensGeo = sceneryGeo('depot_mast_lens'), lit = new THREE.Group(), pools = [];
  const glow = new THREE.MeshBasicMaterial({ color: '#fff0c8', transparent: true, toneMapped: false });
  const pool = new THREE.MeshBasicMaterial({ map: poolTexture(), color: '#ffb866', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
  for (const [x, z, yaw] of D.masts || []) {
    if (lensGeo) { const m = new THREE.Mesh(lensGeo, glow); m.position.set(x, gy(x, z), z); m.rotation.y = yaw; lit.add(m); }
    // (thrown 16 m out in front of it)
    const px = x + Math.sin(yaw) * 16, pz = z + Math.cos(yaw) * 16;
    const p = new THREE.Mesh(new THREE.CircleGeometry(15, 32).rotateX(-Math.PI / 2), pool);
    p.position.set(px, gy(px, pz) + 0.03, pz);
    p.scale.set(1, 1, 1.3);
    p.rotation.y = yaw;
    lit.add(p);
  }
  group.add(lit);
  group.lamps = k => {
    glow.opacity = 0.35 + 0.65 * k;
    pool.opacity = 0.55 * k;
    pool.visible = k > 0;
  };
  // The fence: one mesh for all of it
  const panel = sceneryGeo('depot_fence');
  if (panel) {
    const parts = [], m = new THREE.Matrix4();
    for (const [x0, z0, x1, z1] of D.fence) {
      const L = Math.hypot(x1 - x0, z1 - z0), n = Math.round(L / 10), yaw = -Math.atan2(z1 - z0, x1 - x0);
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n, x = x0 + (x1 - x0) * f, z = z0 + (z1 - z0) * f;
        m.makeRotationY(yaw).setPosition(x, gy(x, z), z);
        parts.push([panel.clone().applyMatrix4(m), null]);
      }
    }
    const fence = new THREE.Mesh(merge(parts), MAT);
    fence.castShadow = fence.receiveShadow = true;
    group.add(fence);
  }
  // The bund walls round the tanks, solid, and the yellow lines on the yard
  const walls = [], marks = [];
  for (const [x0, x1, z0, z1] of D.bunds || []) {
    for (const [x, z, w, d] of [[(x0 + x1) / 2, z0, x1 - x0 + 0.5, 0.5], [(x0 + x1) / 2, z1, x1 - x0 + 0.5, 0.5], [x0, (z0 + z1) / 2, 0.5, Math.abs(z1 - z0)], [x1, (z0 + z1) / 2, 0.5, Math.abs(z1 - z0)]]) {
      const y = gy(x, z);
      walls.push([new THREE.BoxGeometry(w, BUND, d).translate(x, y + BUND / 2, z), '#a9aca6'], [new THREE.BoxGeometry(w + 0.12, 0.12, d + 0.12).translate(x, y + BUND, z), '#c4c6c0']);
      const b = { x, z, w, d, ca: 1, sa: 0, top: y + BUND, h: BUND };
      city.addToGrid(b, x - w / 2, x + w / 2, z - d / 2, z + d / 2);
    }
  }
  // (the slabs the yard's laid in, their joints a little darker: every 8 m both ways over the lot)
  if (D.slabs) {
    const [a, b, c, d] = D.slabs;
    for (let x = a + 8; x < b; x += 8) marks.push([new THREE.PlaneGeometry(0.12, d - c).rotateX(-Math.PI / 2).translate(x, gy(x, (c + d) / 2) + 0.015, (c + d) / 2), '#9c9a91']);
    for (let z = c + 8; z < d; z += 8) marks.push([new THREE.PlaneGeometry(b - a, 0.12).rotateX(-Math.PI / 2).translate((a + b) / 2, gy((a + b) / 2, z) + 0.015, z), '#9c9a91']);
  }
  for (const pts of D.lines || []) for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - ax, bz - az);
    marks.push([new THREE.PlaneGeometry(0.22, L + 0.22).rotateX(-Math.PI / 2).rotateY(Math.atan2(bx - ax, bz - az)).translate((ax + bx) / 2, gy(ax, az) + 0.02, (az + bz) / 2), '#e8b92a']);
  }
  if (walls.length) {
    const m = new THREE.Mesh(merge(walls), MAT);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }
  if (marks.length) group.add(new THREE.Mesh(merge(marks), new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })));
  // The name over the gate, on the board across the top of it
  const [gx, gz] = D.gate, name = t('SPARKS FUEL DEPOT');
  const sign = board(1536, 256, g => {
    g.fillStyle = TEAL; g.fillRect(0, 0, 1536, 256);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    flame(g, 120, 128, 1.15);
    flame(g, 1416, 128, 1.15);
    g.fillStyle = '#ffffff'; fit(g, name, 1160, 170, FONT);
    g.fillText(name, 768, 136);
  }, false);
  group.add(onto(new THREE.Mesh(new THREE.PlaneGeometry(14.5, 14.5 / 6), sign), gx, gy(gx, gz) + 8.2, gz, 0, 0, 0, 0.22));
  // and big round the front of the biggest tank, under its bands: the flame and SPARKS, toward the road
  if (D.lettered) {
    const [x, z, r, y] = D.lettered, span = 1.5, h = r * span / 4;
    const tex = board(2048, 512, g => {
      g.clearRect(0, 0, 2048, 512);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      flame(g, 330, 256, 2.6);
      g.fillStyle = TEAL; fit(g, 'SPARKS', 1500, 400, FONT);
      g.fillText('SPARKS', 1130, 270);
    }, false);
    tex.transparent = true;
    const geo = new THREE.CylinderGeometry(r + 0.05, r + 0.05, h, 24, 1, true, -span / 2, span);
    const m = new THREE.Mesh(geo, tex);
    m.position.set(x, gy(x, z) + y, z);
    group.add(m);
  }
  return group;
}

// A soft round pool of light, brightest in the middle
function poolTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d'), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.45, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}

// The company's flame: orange, a cream heart, at (x, y), `s` times 100 px tall
function flame(g, x, y, s) {
  const path = k => {
    g.beginPath();
    g.moveTo(x, y - 50 * s * k);
    g.bezierCurveTo(x + 40 * s * k, y - 10 * s * k, x + 38 * s * k, y + 30 * s * k, x, y + 46 * s * k);
    g.bezierCurveTo(x - 38 * s * k, y + 30 * s * k, x - 36 * s * k, y - 4 * s * k, x - 10 * s * k, y - 20 * s * k);
    g.bezierCurveTo(x - 8 * s * k, y - 2 * s * k, x + 2 * s * k, y, x + 6 * s * k, y - 6 * s * k);
    g.bezierCurveTo(x + 10 * s * k, y - 24 * s * k, x - 2 * s * k, y - 36 * s * k, x, y - 50 * s * k);
    g.fill();
  };
  g.fillStyle = ORANGE; path(1);
  g.fillStyle = CREAM; g.save(); g.translate(0, 14 * s); path(0.5); g.restore();
}
