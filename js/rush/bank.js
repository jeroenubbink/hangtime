// Bank Shot's bank: Fiatmine, across the avenue from the end of your road, the thing the wreckage is to bounce off
// on its way to the big junction. A temple of money up a flight of steps, eight columns across its portico, its name
// across the frieze and its slogan under it, the company's banners hung between the columns. From the bank kit
// (modelled in Blender, see assets/src/bank.py); the lettering and the banners are drawn here.
import * as THREE from 'three';
import { merge, sceneryGeo } from '../scenery.js';
import { t } from '../i18n.js';

const MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
const SERIF = "{w} {px}px 'Cinzel', 'Times New Roman', serif";
const serif = (w, px) => SERIF.replace('{w}', w).replace('{px}', px);
const GOLD = '#f2b632', GOLD2 = '#9c7424', BRONZE = '#4a3220', STONE = '#e9e2d2', ORANGE = '#ff8a1a', CREAM = '#fff4dc';
// The kit's measures (as in bank.py): the podium's height, the columns' across and how far back, the tops of the
// columns, how far back the hall's front is, how deep it is all; and its parts that are solid, in its own frame (x
// across, y back from the front of the podium, z up): [x0, x1, y0, y1, z0, z1]
const PH = 1.2, COLS = Array.from({ length: 8 }, (_, i) => -17.5 + i * 5), CY = 1.2, TOP = 12.7, HY = 4.5, D = 30;
const SOLID = [
  // the steps (one low block: wreckage clatters up them or off them), the podium, and the hall
  [-19.5, 19.5, -4.2, -1, 0, 0.75], [-22, 22, -1, HY, 0, PH], [-21, 21, HY, D, 0, TOP + 3],
  // the columns, each its own, and the entablature on them (with room under it, between the columns)
  ...COLS.map(x => [x - 0.8, x + 0.8, CY - 0.8, CY + 0.8, 0, TOP]),
  [-20, 20, -0.5, HY, TOP, TOP + 3],
];

// `B`: { x, z }, where the middle of the front of its podium (the top of the steps) is; it faces +z
export function bank(city, B) {
  const group = new THREE.Group(), y = city.groundHeight(B.x, B.z, 1);
  const geo = sceneryGeo('bank_hall') || merge([
    [new THREE.BoxGeometry(44, PH, D + 1).translate(0, PH / 2, -(D - 1) / 2), '#c2b69c'],
    [new THREE.BoxGeometry(42, TOP + 3 - PH, D - HY).translate(0, (TOP + 3 + PH) / 2, -(HY + D) / 2), STONE],
  ]);
  const hall = new THREE.Mesh(geo, MAT);
  hall.position.set(B.x, y, B.z);
  hall.castShadow = hall.receiveShadow = true;
  group.add(hall);
  for (const [x0, x1, y0, y1, z0, z1] of SOLID) {
    const b = { x: B.x + (x0 + x1) / 2, z: B.z - (y0 + y1) / 2, w: x1 - x0, d: y1 - y0, ca: 1, sa: 0, top: y + z1, h: z1 - z0 };
    if (z0 > 0) b.floor = y + z0;
    city.addToGrid(b, b.x - b.w / 2, b.x + b.w / 2, b.z - b.d / 2, b.z + b.d / 2);
  }
  // The name across the frieze, gold, its letters spread out the way they carve them; the slogan along the
  // architrave under it, smaller
  const name = t('FIATMINE'), slogan = t('SOLVING YOUR HARD MINED FIAT');
  const frieze = carved(4096, 148, g => {
    g.fillStyle = BRONZE; g.font = serif(900, 128);
    spaced(g, name, 2052, 84, 2700, 0.42);
    g.fillStyle = GOLD; spaced(g, name, 2046, 78, 2700, 0.42);
  });
  group.add(at(new THREE.Mesh(new THREE.PlaneGeometry(39.2, 1.42), frieze), B.x, y + TOP + 1.7, B.z + 0.47));
  const band = carved(4096, 104, g => {
    g.fillStyle = BRONZE; g.font = serif(900, 72);
    spaced(g, slogan, 2051, 57, 3600, 0.22);
    g.fillStyle = GOLD; spaced(g, slogan, 2047, 53, 3600, 0.22);
  });
  group.add(at(new THREE.Mesh(new THREE.PlaneGeometry(39.0, 0.99), band), B.x, y + TOP + 0.5, B.z + 0.27));
  // The banners: hung from under the architrave between the outer columns, two each side of the doors
  const banner = carved(256, 1024, g => {
    g.fillStyle = ORANGE; g.fillRect(0, 0, 256, 1024);
    g.fillStyle = '#c9620e'; g.fillRect(0, 0, 256, 18); g.fillRect(0, 990, 256, 34);
    coin(g, 128, 250, 92);
    g.save(); g.translate(128, 640); g.rotate(-Math.PI / 2);
    g.fillStyle = CREAM; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = serif(900, 120);
    g.fillText(name, 0, 4, 620);
    g.restore();
  }, true);
  for (const x of [-15, -10, 10, 15]) {
    const m = at(new THREE.Mesh(new THREE.PlaneGeometry(1.9, 7.4), banner), B.x + x, y + TOP - 4.6, B.z - CY - 0.2);
    m.material.side = THREE.DoubleSide;
    group.add(m);
  }
  return group;
}

// A canvas drawn by `draw` (redrawn when the font's in), as a material; see-through where it isn't drawn on, unless
// `solid`
function carved(w, h, draw, solid) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const paint = () => { const g = cv.getContext('2d'); g.clearRect(0, 0, w, h); g.textAlign = 'center'; g.textBaseline = 'middle'; draw(g); };
  paint();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  document.fonts?.load(serif(900, 100)).then(() => { paint(); tex.needsUpdate = true; }).catch(() => {});
  return new THREE.MeshLambertMaterial({ map: tex, transparent: !solid, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
}
// `text` centred on (x, y), its letters `gap` (of its size) apart, as wide as `w` at most
function spaced(g, text, x, y, w, gap) {
  const px = parseFloat(g.font.match(/(\d+(\.\d+)?)px/)[1]), chars = [...text];
  const widths = chars.map(c => g.measureText(c).width), sp = px * gap;
  let total = widths.reduce((a, b) => a + b, 0) + sp * (chars.length - 1);
  const k = Math.min(1, w / total);
  g.save(); g.translate(x, y); g.scale(k, k);
  let cx = -total / 2;
  g.textAlign = 'left';
  chars.forEach((c, i) => { g.fillText(c, cx, 0); cx += widths[i] + sp; });
  g.restore();
}
// The company's coin: gold, a rim, a pickaxe across it
function coin(g, x, y, r) {
  g.fillStyle = GOLD2; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = GOLD; g.beginPath(); g.arc(x, y, r * 0.88, 0, Math.PI * 2); g.fill();
  g.strokeStyle = GOLD2; g.lineWidth = r * 0.06; g.beginPath(); g.arc(x, y, r * 0.72, 0, Math.PI * 2); g.stroke();
  g.save(); g.translate(x, y); g.rotate(-Math.PI / 4);
  g.fillStyle = '#5e4128'; g.fillRect(-r * 0.08, -r * 0.55, r * 0.16, r * 1.15);
  g.fillStyle = '#2a2f33';
  g.beginPath(); g.moveTo(-r * 0.62, -r * 0.42); g.quadraticCurveTo(0, -r * 0.78, r * 0.62, -r * 0.42); g.lineTo(r * 0.55, -r * 0.34);
  g.quadraticCurveTo(0, -r * 0.58, -r * 0.55, -r * 0.34); g.closePath(); g.fill();
  g.restore();
}
export { coin };
const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
