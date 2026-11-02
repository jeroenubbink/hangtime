// Fuel's Paradise: the petrol station at Last Chance Gas. Its canopy with the name round the fascia and lights
// underneath, the logo standing on the roof, the face of the price sign, pump islands and the minimart's
// shopfront. The logo is a sunset over the sea with a palm tree whose fronds are flames. Everything drawn on
// canvases once and kept; the pieces glow a little so the place pops out of the street even in shade.
import * as THREE from 'three';
import { merge } from '../scenery.js';

export const BRAND = { teal: '#0fb5ae', deep: '#0b5e6b', orange: '#ff7a1a', pink: '#ff2e7e', yellow: '#ffd23a', cream: '#fff6e0' };
const B = BRAND, TAU = Math.PI * 2;
const FONT = px => `italic 900 ${px}px 'Titillium Web', Impact, sans-serif`;

// ---------- Drawing ----------
function frond(g, x, y, ang, len, w) {
  // A palm frond that's a flame: drooping and tapering, its upper edge licking up in curled tongues, with a
  // hot yellow core
  const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
  const tx = x + dx * len, ty = y + dy * len + len * 0.3;
  const cx = x + dx * len * 0.55, cy = y + dy * len * 0.55 - len * 0.2;
  const at = t => { const s = 1 - t; return [s * s * x + 2 * s * t * cx + t * t * tx, s * s * y + 2 * s * t * cy + t * t * ty]; };
  const shape = (k, fill) => {
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(cx + nx * w * k, cy + ny * w * k - w * k * 0.4, tx, ty);
    g.quadraticCurveTo(cx - nx * w * 0.5 * k, cy - ny * w * 0.5 * k, x, y);
    g.fill();
    // tongues: a teardrop off the top, leaning out along the frond, at three points
    for (let i = 1; i <= 3; i++) {
      const [px, py] = at(i / 4), h = len * (0.34 - i * 0.06) * k, lean = (dx >= 0 ? 1 : -1) * h * 0.55;
      g.beginPath();
      g.moveTo(px - h * 0.3, py + h * 0.05);
      g.bezierCurveTo(px - h * 0.35, py - h * 0.55, px + lean * 0.3, py - h * 0.6, px + lean, py - h);
      g.bezierCurveTo(px + lean * 0.2, py - h * 0.45, px + h * 0.45, py - h * 0.35, px + h * 0.3, py + h * 0.05);
      g.fill();
    }
  };
  const grad = g.createLinearGradient(x, y, tx, ty);
  grad.addColorStop(0, B.orange); grad.addColorStop(0.6, '#ff4a1c'); grad.addColorStop(1, '#d81b3c');
  shape(1, grad);
  shape(0.38, B.yellow);
}

// The roundel: (x, y) its centre, r its radius; `ring` letters the name round it
export function drawLogo(g, x, y, r, ring = false) {
  g.save();
  const inner = ring ? 0.72 : 0.86;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = B.deep; g.fill();
  g.beginPath(); g.arc(x, y, r * 0.94, 0, TAU); g.fillStyle = ring ? B.teal : B.cream; g.fill();
  if (ring) {
    g.beginPath(); g.arc(x, y, r * (inner + 0.04), 0, TAU); g.fillStyle = B.cream; g.fill();
    arc(g, 'FUEL\'S PARADISE', x, y, r * 0.83, -Math.PI / 2, r * 0.17, 1);
    arc(g, '★ GAS · SNACKS · REGRETS ★', x, y, r * 0.83, Math.PI / 2, r * 0.1, -1);
  }
  g.beginPath(); g.arc(x, y, r * inner, 0, TAU); g.clip();
  r *= inner / 0.86;
  // Sky
  const sky = g.createLinearGradient(0, y - r, 0, y + r * 0.4);
  sky.addColorStop(0, '#ffb13a'); sky.addColorStop(0.5, B.pink); sky.addColorStop(1, '#8a2be2');
  g.fillStyle = sky; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  // The sun, cut by stripes toward the horizon
  const sun = g.createLinearGradient(0, y - r * 0.5, 0, y + r * 0.35);
  sun.addColorStop(0, '#fff3a0'); sun.addColorStop(1, B.orange);
  g.fillStyle = sun;
  g.beginPath(); g.arc(x - r * 0.08, y + r * 0.08, r * 0.5, 0, TAU); g.fill();
  g.fillStyle = B.pink;
  for (let i = 0; i < 4; i++) g.fillRect(x - r, y + r * (0.05 + i * 0.1), 2 * r, r * (0.018 + i * 0.012));
  // Sea
  g.fillStyle = B.teal; g.fillRect(x - r, y + r * 0.38, 2 * r, r);
  g.fillStyle = '#6fe3d8';
  for (let i = 0; i < 3; i++) g.fillRect(x - r * (0.5 - i * 0.1), y + r * (0.48 + i * 0.13), r * (0.7 - i * 0.18), r * 0.035);
  // The palm: a curved trunk, and fronds of fire
  const bx = x + r * 0.42, by = y + r * 0.9, topX = x + r * 0.12, topY = y - r * 0.28;
  g.strokeStyle = '#3a1446'; g.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const t0 = i / 7, t1 = (i + 0.82) / 7;
    const p = t => [(1 - t) ** 2 * bx + 2 * (1 - t) * t * (x + r * 0.42) + t * t * topX, (1 - t) ** 2 * by + 2 * (1 - t) * t * (y + r * 0.05) + t * t * topY];
    const [ax, ay] = p(t0), [cx, cy] = p(t1);
    g.lineWidth = r * (0.11 - t0 * 0.04);
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(cx, cy); g.stroke();
  }
  for (const [a, l] of [[-2.75, 0.62], [-2.2, 0.5], [-1.55, 0.36], [-0.95, 0.5], [-0.35, 0.62], [0.2, 0.5], [2.95, 0.5]]) frond(g, topX, topY, a, r * l, r * 0.13);
  g.fillStyle = '#3a1446';
  g.beginPath(); g.arc(topX, topY, r * 0.06, 0, TAU); g.fill();
  g.restore();
}

// Lettering round a circle of radius `rad`, centred on angle `mid`: dir 1 reads clockwise over the top,
// -1 anticlockwise along the bottom
function arc(g, text, x, y, rad, mid, px, dir) {
  g.save();
  g.font = `900 ${px}px 'Titillium Web', Impact, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = px * 0.18; g.strokeStyle = B.deep; g.fillStyle = B.cream;
  const chars = [...text], ws = chars.map(c => g.measureText(c).width + px * 0.04), total = ws.reduce((a, b) => a + b, 0);
  let a = mid - dir * total / rad / 2;
  chars.forEach((c, i) => {
    a += dir * ws[i] / rad / 2;
    g.save();
    g.translate(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    g.rotate(a + dir * Math.PI / 2);
    g.strokeText(c, 0, 0); g.fillText(c, 0, 0);
    g.restore();
    a += dir * ws[i] / rad / 2;
  });
  g.restore();
}

// Outlined, slanted brand lettering, fitted to `maxW`
function letters(g, text, x, y, px, maxW, fill = B.cream, stroke = B.deep) {
  g.font = FONT(px);
  const w = g.measureText(text).width;
  if (w > maxW) { px *= maxW / w; g.font = FONT(px); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = px * 0.16; g.strokeStyle = stroke; g.strokeText(text, x, y);
  g.fillStyle = fill; g.fillText(text, x, y);
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function texture(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// A fascia band, `m` metres long and 1.5 high: teal, an orange stripe along each edge, and the name between
// roundels (or the slogan on the short sides)
function fascia(c, m, short) {
  const g = c.getContext('2d'), W = c.width, H = c.height;
  g.fillStyle = B.teal; g.fillRect(0, 0, W, H);
  g.fillStyle = B.orange; g.fillRect(0, 0, W, H * 0.1); g.fillRect(0, H * 0.9, W, H * 0.1);
  g.fillStyle = B.yellow; g.fillRect(0, H * 0.1, W, H * 0.03); g.fillRect(0, H * 0.87, W, H * 0.03);
  const r = H * 0.36;
  if (short) {
    letters(g, 'NO SMOKING, PLEASE', W / 2, H / 2, H * 0.5, W * 0.8);
    for (const x of [W * 0.06, W * 0.94]) drawLogo(g, x, H / 2, r);
  } else {
    letters(g, 'FUEL\'S PARADISE', W / 2, H / 2, H * 0.62, W * 0.62);
    for (const x of [W * 0.12, W * 0.88]) drawLogo(g, x, H / 2, r);
  }
}

// The underside of the canopy: white, with rows of light panels
function ceiling(c, w, d) {
  const g = c.getContext('2d'), W = c.width, H = c.height;
  g.fillStyle = '#c9d0d6'; g.fillRect(0, 0, W, H);
  const nx = Math.round(w / 4), nz = Math.round(d / 4);
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    const x = (i + 0.5) / nx * W, y = (k + 0.5) / nz * H;
    g.fillStyle = '#fffdf0'; g.fillRect(x - W / nx * 0.3, y - H / nz * 0.18, W / nx * 0.6, H / nz * 0.36);
  }
}
function ceilingGlow(c, w, d) {
  const g = c.getContext('2d'), W = c.width, H = c.height;
  g.fillStyle = '#7d858c'; g.fillRect(0, 0, W, H);
  const nx = Math.round(w / 4), nz = Math.round(d / 4);
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    const x = (i + 0.5) / nx * W, y = (k + 0.5) / nz * H;
    g.fillStyle = '#fff6d8'; g.fillRect(x - W / nx * 0.3, y - H / nz * 0.18, W / nx * 0.6, H / nz * 0.36);
  }
}

// The price sign's face, 3.4 x 4.6 m
function priceSign(c) {
  const g = c.getContext('2d'), W = c.width, H = c.height;
  g.fillStyle = B.teal; g.fillRect(0, 0, W, H);
  g.fillStyle = B.deep; g.fillRect(W * 0.04, H * 0.46, W * 0.92, H * 0.5);
  drawLogo(g, W / 2, H * 0.2, W * 0.32, true);
  letters(g, 'FUEL\'S PARADISE', W / 2, H * 0.4, H * 0.08, W * 0.9);
  const rows = [['UNLEADED', '1.89'], ['DIESEL', '1.97'], ['KABOOM', '0.00']];
  rows.forEach(([name, price], i) => {
    const y = H * (0.54 + i * 0.14);
    g.font = FONT(H * 0.06); g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = B.cream; g.fillText(name, W * 0.1, y);
    g.fillStyle = '#111'; g.fillRect(W * 0.56, y - H * 0.05, W * 0.34, H * 0.1);
    g.font = `900 ${H * 0.075}px 'Titillium Web', monospace`; g.textAlign = 'right';
    g.fillStyle = i === 2 ? B.pink : B.orange; g.fillText(price, W * 0.87, y);
  });
}

// The minimart's front, 30 x 6 m: a fascia with the name, glass, a door and posters
function shopfront(c) {
  const g = c.getContext('2d'), W = c.width, H = c.height;
  g.fillStyle = B.cream; g.fillRect(0, 0, W, H);
  g.fillStyle = B.teal; g.fillRect(0, 0, W, H * 0.3);
  g.fillStyle = B.orange; g.fillRect(0, H * 0.3, W, H * 0.04);
  letters(g, 'FUEL\'S PARADISE  ·  MINIMART', W / 2, H * 0.15, H * 0.2, W * 0.8);
  for (const x of [W * 0.05, W * 0.95]) drawLogo(g, x, H * 0.15, H * 0.13);
  // Glass, with a door in the middle
  const top = H * 0.4, bot = H * 0.95;
  const glass = g.createLinearGradient(0, top, 0, bot);
  glass.addColorStop(0, '#9fd8f0'); glass.addColorStop(1, '#3d7ea8');
  for (let i = 0; i < 6; i++) {
    const x0 = W * (0.03 + i * 0.16), x1 = x0 + W * 0.14;
    g.fillStyle = glass; g.fillRect(x0, top, x1 - x0, bot - top);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x0 + (x1 - x0) * 0.1, top, (x1 - x0) * 0.08, bot - top);
  }
  g.fillStyle = '#2f3a44'; g.fillRect(W * 0.45, top, W * 0.1, bot - top);
  g.fillStyle = '#6fb8d8'; g.fillRect(W * 0.46, top + H * 0.03, W * 0.035, bot - top - H * 0.03); g.fillRect(W * 0.5025, top + H * 0.03, W * 0.035, bot - top - H * 0.03);
  // Posters in the windows
  const poster = (x, text, bg) => {
    g.fillStyle = bg; g.fillRect(x, H * 0.5, W * 0.09, H * 0.28);
    letters(g, text, x + W * 0.045, H * 0.64, H * 0.09, W * 0.08, '#fff', '#222');
  };
  poster(W * 0.06, 'HOT DOGS', B.pink);
  poster(W * 0.24, 'ICE', '#3aa0ff');
  poster(W * 0.67, 'LOTTO', B.yellow);
  poster(W * 0.85, 'SNACKS', B.orange);
}

// ---------- Building it ----------
let kit = null;
function textures(S) {
  if (kit) return kit;
  const c = { front: canvas(4096, 205), side: canvas(3200, 205), ceil: canvas(1024, 820), glow: canvas(1024, 820), sign: canvas(512, 692), logo: canvas(1024, 1024), shop: canvas(2048, 410) };
  const draw = () => {
    fascia(c.front, S.w, false);
    fascia(c.side, S.d, true);
    ceiling(c.ceil, S.w, S.d);
    ceilingGlow(c.glow, S.w, S.d);
    priceSign(c.sign);
    const g = c.logo.getContext('2d');
    g.clearRect(0, 0, 1024, 1024);
    drawLogo(g, 512, 512, 500, true);
    shopfront(c.shop);
  };
  draw();
  const t = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, texture(v)]));
  // Redraw once the lettering's font is in
  document.fonts?.load(FONT(64)).then(() => { draw(); for (const x of Object.values(t)) x.needsUpdate = true; }).catch(() => {});
  const lit = (map, k = 0.35) => new THREE.MeshLambertMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: k });
  kit = {
    front: lit(t.front), side: lit(t.side), sign: lit(t.sign, 0.3), shop: lit(t.shop, 0.15),
    ceil: new THREE.MeshLambertMaterial({ map: t.ceil, emissive: 0xffffff, emissiveMap: t.glow, emissiveIntensity: 1 }),
    logo: new THREE.MeshLambertMaterial({ map: t.logo, emissive: 0xffffff, emissiveMap: t.logo, emissiveIntensity: 0.4, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }),
    roof: new THREE.MeshLambertMaterial({ color: '#d4ece9' }),
    solid: new THREE.MeshLambertMaterial({ vertexColors: true }),
  };
  return kit;
}

// The station at S { x, z, w, d, h } on ground `y`; `sign` the price sign's [x, z] and `shop` the minimart
// block { x, z, w, d, h }, if there are those. Returns { canopy, kerbs, logo, face, front }, each on its
// own: the canopy, the logo and the sign's face come away separately.
export function buildStation(S, y, sign, shop) {
  const K = textures(S), group = new THREE.Group();
  group.position.set(S.x, y, S.z);
  const T = 1.5;
  // The canopy: the fascia round the edge, a roof on top, and lights underneath
  const box = new THREE.Mesh(new THREE.BoxGeometry(S.w, T, S.d), [K.side, K.side, K.roof, K.ceil, K.front, K.front]);
  box.position.y = S.h + T / 2;
  group.add(box);
  // Pump islands: a kerb round each pump
  const islands = [];
  for (const [px, pz] of S.pumps || []) {
    islands.push([new THREE.BoxGeometry(1.7, 0.18, 3.6).translate(px - S.x, 0.09, pz - S.z), B.cream]);
    islands.push([new THREE.BoxGeometry(1.8, 0.1, 3.7).translate(px - S.x, 0.05, pz - S.z), B.orange]);
    // and a bollard at each end
    for (const e of [-1, 1]) islands.push([new THREE.CylinderGeometry(0.12, 0.12, 0.9, 8).translate(px - S.x, 0.45, pz - S.z + e * 1.6), B.yellow]);
  }
  const kerbs = islands.length ? new THREE.Mesh(merge(islands), K.solid) : null;
  if (kerbs) { kerbs.position.copy(group.position); kerbs.receiveShadow = true; }
  box.castShadow = box.receiveShadow = true;
  // The logo, up on the roof facing the junction, on a pair of struts
  const logo = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), K.logo);
  disc.position.y = 4.4;
  const struts = new THREE.Mesh(merge([[new THREE.BoxGeometry(0.25, 1, 0.25).translate(-1.2, 0.5, -0.1), B.deep], [new THREE.BoxGeometry(0.25, 1, 0.25).translate(1.2, 0.5, -0.1), B.deep]]), K.solid);
  logo.add(disc, struts);
  logo.position.set(S.x, y + S.h + T, S.z + S.d / 2 - 3);
  disc.castShadow = true;
  // The price sign's face, both sides
  let face = null;
  if (sign) {
    face = new THREE.Group();
    for (const s of [1, -1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 4.6), K.sign);
      m.position.z = s * 0.26;
      if (s < 0) m.rotation.y = Math.PI;
      face.add(m);
    }
    face.position.set(sign[0], y + 9, sign[1]);
  }
  // The minimart's front
  let front = null;
  if (shop) {
    front = new THREE.Mesh(new THREE.PlaneGeometry(shop.w - 0.4, shop.h - 0.2), K.shop);
    front.position.set(shop.x, y + shop.h / 2, shop.z + shop.d / 2 + 0.06);
  }
  return { canopy: group, kerbs, logo, face, front };
}

// The bits the canopy breaks into, in the brand's colours
export const DEBRIS_COLOURS = [B.teal, B.cream, B.orange, '#dfe3e6'];

// For the pumps and pillars (instanced props, vertex coloured)
export const PUMP = () => merge([
  [new THREE.BoxGeometry(1.0, 0.25, 0.7).translate(0, 0.12, 0), '#9a9a9a'],
  [new THREE.BoxGeometry(0.8, 1.5, 0.5).translate(0, 1.0, 0), B.teal],
  [new THREE.BoxGeometry(0.82, 0.12, 0.52).translate(0, 1.55, 0), B.orange],
  [new THREE.BoxGeometry(0.7, 0.4, 0.52).translate(0, 1.95, 0), B.cream],
  [new THREE.BoxGeometry(0.5, 0.3, 0.54).translate(0, 1.2, 0), '#1d2a30'],
  [new THREE.CylinderGeometry(0.05, 0.05, 0.8, 6).translate(0.45, 1.1, 0), '#222222'],
]);
export const PILLAR = () => merge([
  [new THREE.BoxGeometry(0.7, 5.4, 0.7).translate(0, 2.7, 0), B.teal],
  [new THREE.BoxGeometry(0.74, 0.3, 0.74).translate(0, 4.2, 0), B.orange],
  [new THREE.BoxGeometry(1.0, 0.6, 1.0).translate(0, 0.3, 0), B.cream],
]);
export const SIGN = () => merge([
  [new THREE.BoxGeometry(0.5, 7, 0.5).translate(0, 3.5, 0), B.deep],
  [new THREE.BoxGeometry(3.7, 4.9, 0.5).translate(0, 9, 0), B.deep],
  [new THREE.BoxGeometry(3.7, 0.3, 0.52).translate(0, 11.35, 0), B.orange],
]);
