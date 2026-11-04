// Over the Edge's bridge, made a bridge you see coming: deep teal plate girders along both edges of its deck, a stone
// pylon at each corner (a lantern on top, a banner down it, the bridge's name on a plaque), and billboards on the banks
// facing the run-up. The pylons and billboards are from the bridge kit (modelled in Blender, see
// assets/src/bridge.blend); the girders are drawn here, to fit whatever deck they're on.
import * as THREE from 'three';
import { merge } from '../scenery.js';
import { fixtures } from './fixtures.js';
import { t } from '../i18n.js';

const TEAL = '#14a3a3', DARK = '#0c7a7c', PALE = '#5fd0cb';
// The billboards' ads, by number
const ADS = [
  { bg: TEAL, fg: '#ffffff', big: 'SLOW DOWN.', small: '…said nobody here, ever.' },
  { bg: '#f4f2ec', fg: '#d94a3a', big: 'BENT & SONS', small: 'Panel beaters since 1952 · We knock it into shape' },
];

// `G`: { name, year, pylons: [[x, z, yaw]], boards: [[x, z, yaw, ad]] } (at yaw 0 a pylon's banner and plaque, and a
// billboard's face, look toward +z: up the run-up, at you coming)
export function gateway(city, G) {
  const group = new THREE.Group(), D = city.deck, [a, b, c, d] = D.rect, y = D.y, L = d - c + 0.6, mz = (c + d) / 2;
  // The girders: a web, flanges top and bottom, ribs down it, and a line of rivets along each flange
  const parts = [];
  for (const s of [-1, 1]) {
    const x = s < 0 ? a - 0.55 : b + 0.55;
    parts.push([new THREE.BoxGeometry(0.35, 2.65, L).translate(x, y - 1.1, mz), TEAL]);
    parts.push([new THREE.BoxGeometry(0.8, 0.2, L).translate(x, y + 0.2, mz), DARK]);
    parts.push([new THREE.BoxGeometry(0.9, 0.22, L).translate(x, y - 2.4, mz), DARK]);
    for (let i = 0; i <= 20; i++) parts.push([new THREE.BoxGeometry(0.16, 2.2, 0.22).translate(x + s * 0.25, y - 1.1, c - 0.3 + i * L / 20), DARK]);
    for (const yy of [y - 0.12, y - 2.08]) parts.push([new THREE.BoxGeometry(0.06, 0.08, L).translate(x + s * 0.2, yy, mz), PALE]);
    // (in the camera's way, not the cars')
    city.screen({ x, z: mz, w: 0.9, d: L, floor: y - 2.55, top: y + 0.3, pad: 0.8 });
  }
  // (lit a little from below, like the deck)
  const m = new THREE.Mesh(merge(parts), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#0b2a2a' }));
  m.castShadow = m.receiveShadow = true;
  group.add(m);
  group.add(fixtures(city, [...G.pylons.map(([x, z, yaw]) => ['pylon', x, z, yaw]), ...G.boards.map(([x, z, yaw]) => ['billboard', x, z, yaw])]));
  // The plaques, and the billboards' faces
  const plaque = board(512, 192, g => {
    g.fillStyle = '#4a3b2c'; g.fillRect(0, 0, 512, 192);
    g.strokeStyle = '#e0b64a'; g.lineWidth = 8; g.strokeRect(12, 12, 488, 168);
    g.fillStyle = '#e0b64a'; g.textAlign = 'center'; g.textBaseline = 'middle';
    fit(g, t(G.name), 460, 58, "900 {}px 'Titillium Web', Impact, sans-serif"); g.fillText(t(G.name), 256, 80);
    g.font = "700 40px 'Titillium Web', sans-serif"; g.fillText(String(G.year), 256, 140);
  });
  for (const [x, z, yaw] of G.pylons) group.add(onto(new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.86), plaque), x, city.groundHeight(x, z, 1), z, yaw, 0, 3.3, 1.6));
  for (const [x, z, yaw, ad] of G.boards) {
    const A = ADS[ad % ADS.length];
    const face = board(1024, 384, g => {
      g.fillStyle = A.bg; g.fillRect(0, 0, 1024, 384);
      g.fillStyle = A.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
      fit(g, t(A.big), 940, 170, "italic 900 {}px 'Titillium Web', Impact, sans-serif"); g.fillText(t(A.big), 512, 160);
      fit(g, t(A.small), 940, 44, "700 {}px 'Titillium Web', sans-serif"); g.fillText(t(A.small), 512, 300);
    });
    group.add(onto(new THREE.Mesh(new THREE.PlaneGeometry(12, 4.5), face), x, city.groundHeight(x, z, 1), z, yaw, 0, 7.4, 0.1));
  }
  return group;
}

// A canvas drawn by `draw`, as a material
function board(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return new THREE.MeshLambertMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
}
// The font (`font`, its size as {}) at `px`, or smaller to fit `w`
function fit(g, text, w, px, font) {
  g.font = font.replace('{}', px);
  const m = g.measureText(text).width;
  if (m > w) g.font = font.replace('{}', Math.floor(px * w / m));
}
// `o` on something standing at (x, y, z) turned by `yaw`, at (lx, ly, lz) in its own frame
function onto(o, x, y, z, yaw, lx, ly, lz) {
  const s = Math.sin(yaw), k = Math.cos(yaw);
  o.position.set(x + lx * k + lz * s, y + ly, z - lx * s + lz * k);
  o.rotation.y = yaw;
  return o;
}
