// Over the Edge's bridge, made a bridge you see coming: deep teal plate girders along both edges of its deck, a stone
// pylon at each corner (a lantern on top, a banner down it, the bridge's name on a plaque), and billboards on the banks
// facing the run-up. The pylons and billboards are from the bridge kit (modelled in Blender, see
// assets/src/bridge.blend); the girders are drawn here, to fit whatever deck they're on.
import * as THREE from 'three';
import { merge, sceneryGeo } from '../scenery.js';
import { fixtures } from './fixtures.js';
import { glassOf } from './props.js';
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
  // At night: a warm uplight on the ground before each face of each pylon, washing its stone up to the lantern (drawn
  // into the stone itself, brightest low down, not sixteen real lights), its lantern lit, and a string of bulbs along
  // the top of each girder. Out of sight by day; `group.lamps(k)` turns them up to k (0 to 1).
  const wash = { value: new THREE.Color() }, pylonGeo = sceneryGeo('pylon');
  const stone = new THREE.MeshLambertMaterial({ vertexColors: true });
  stone.onBeforeCompile = sh => {
    sh.uniforms.wash = wash;
    sh.vertexShader = 'varying float vUp, vSide;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvUp = position.y; vSide = 1.0 - abs(normal.y);');
    sh.fragmentShader = 'uniform vec3 wash;\nvarying float vUp, vSide;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * wash * vSide * (1.0 - 0.8 * smoothstep(0.5, 15.0, vUp));');
  };
  group.traverse(o => { if (pylonGeo && o.isMesh && o.geometry === pylonGeo) o.material = stone; });
  const bulbs = [], glow = new THREE.MeshBasicMaterial({ color: '#ffd59a', transparent: true, opacity: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const can = new THREE.CylinderGeometry(0.3, 0.38, 0.32, 10), canMat = new THREE.MeshLambertMaterial({ color: '#2c3036' });
  const lens = new THREE.CircleGeometry(0.25, 10).rotateX(-Math.PI / 2), lit = new THREE.Group();
  for (const [x, z, yaw] of G.pylons) {
    const gy = city.groundHeight(x, z, 1);
    for (let f = 0; f < 4; f++) {
      const ca = Math.cos(f * Math.PI / 2), sa = Math.sin(f * Math.PI / 2);
      group.add(onto(new THREE.Mesh(can, canMat), x, gy, z, yaw, 2.6 * sa, 0.16, 2.6 * ca));
      lit.add(onto(new THREE.Mesh(lens, glow), x, gy, z, yaw, 2.6 * sa, 0.33, 2.6 * ca));
    }
    if (pylonGeo) lit.add(onto(new THREE.Mesh(glassOf(pylonGeo), glow), x, gy, z, yaw, 0, 0, 0));
  }
  const bulb = new THREE.SphereGeometry(0.2, 6, 4), N = 24;
  for (const s of [-1, 1]) for (let i = 0; i <= N; i++) bulbs.push(new THREE.Vector3(s < 0 ? a - 0.55 : b + 0.55, y + 0.42, c - 0.3 + i * L / N));
  const string = new THREE.InstancedMesh(bulb, glow, bulbs.length);
  bulbs.forEach((v, i) => string.setMatrixAt(i, new THREE.Matrix4().setPosition(v)));
  lit.add(string);
  group.add(lit);
  group.lamps = k => {
    wash.value.set('#ffa860').multiplyScalar(k * 0.8);
    glow.opacity = k;
    lit.visible = k > 0;
  };
  group.lamps(0);
  return group;
}

// A canvas drawn by `draw`, as a material (`lit`: glowing, not shaded). (Short Cut's film set letters its own with
// these too.) With a `font`, drawn again once that's in (`draw` paints the whole of it, every time)
export function board(w, h, draw, lit, font) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (font) document.fonts?.load(font).then(() => { draw(cv.getContext('2d')); tex.needsUpdate = true; }).catch(() => {});
  const o = { map: tex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
  return lit ? new THREE.MeshBasicMaterial({ ...o, toneMapped: false }) : new THREE.MeshLambertMaterial(o);
}
// The font (`font`, its size as {}) at `px`, or smaller to fit `w`
export function fit(g, text, w, px, font) {
  g.font = font.replace('{}', px);
  const m = g.measureText(text).width;
  if (m > w) g.font = font.replace('{}', Math.floor(px * w / m));
}
// `o` on something standing at (x, y, z) turned by `yaw`, at (lx, ly, lz) in its own frame
export function onto(o, x, y, z, yaw, lx, ly, lz) {
  const s = Math.sin(yaw), k = Math.cos(yaw);
  o.position.set(x + lx * k + lz * s, y + ly, z - lx * s + lz * k);
  o.rotation.y = yaw;
  return o;
}
