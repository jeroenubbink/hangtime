// Tower Dive's grounds: the hotel's name across the front of its tallest tower, the park between the avenue and the
// skyway with a stream winding through it, the drive round the hotel, the car park behind it, and the shops' signs
// and awnings round the square. None of it is solid: it's paint on the ground and boards on the walls. (What stands
// up in it, the trees, benches, bins and lamps, are the level's props, and the parked cars are traffic.)
import * as THREE from 'three';
import { merge } from '../scenery.js';

const SCRIPT = "'Great Vibes', 'Brush Script MT', cursive";
const BLOCK = "'Russo One', Impact, sans-serif";

export function grounds(city, G) {
  const group = new THREE.Group();
  const flat = painter(), marks = painter();
  if (G.stream) stream(group, flat, marks, G.stream);
  for (const P of G.paths || []) flat.strip(P.pts, P.w, P.y ?? 0.17, P.colour || '#cdbf9c');
  if (G.loop) drive(flat, marks, G.loop);
  if (G.carpark) carpark(flat, marks, G.carpark);
  for (const [x, z, w, d, r = 2] of G.lawns || []) {
    const y = city.inPark(x, z) ? 0.17 : 0.225;
    flat.poly(rounded(x, z, w + 0.6, d + 0.6, r + 0.3), y - 0.005, '#c9c2b4');
    marks.poly(rounded(x, z, w, d, r), y, '#7fa957');
  }
  group.add(flat.mesh(-2), marks.mesh(-4));
  if (G.sign) group.add(hotelSign(G.sign));
  const shops = city.blocks.filter(b => b.sign);
  if (shops.length) group.add(shopFronts(shops, G.square || [0, 0]));
  return group;
}

// Flat shapes on the ground, coloured, facing up: one mesh for all of them
function painter() {
  const P = [], C = [], col = new THREE.Color();
  const tri = (a, b, c, y, colour) => {
    if ((b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]) < 0) [b, c] = [c, b];
    col.set(colour);
    for (const p of [a, b, c]) { P.push(p[0], y, p[1]); C.push(col.r, col.g, col.b); }
  };
  const quad = (a, b, c, d, y, colour) => { tri(a, b, c, y, colour); tri(a, c, d, y, colour); };
  return {
    tri, quad,
    // a convex polygon
    poly(pts, y, colour) { for (let i = 1; i < pts.length - 1; i++) tri(pts[0], pts[i], pts[i + 1], y, colour); },
    // a band `w` wide along a line of points
    strip(pts, w, y, colour, side = [-0.5, 0.5]) {
      const edge = pts.map((p, i) => {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
        return [-dz / l * w, dx / l * w];
      });
      for (let i = 0; i < pts.length - 1; i++) {
        const at = (k, s) => [pts[k][0] + edge[k][0] * s, pts[k][1] + edge[k][1] * s];
        quad(at(i, side[0]), at(i + 1, side[0]), at(i + 1, side[1]), at(i, side[1]), y, colour);
      }
    },
    mesh(offset) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(P.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: offset, polygonOffsetUnits: offset }));
      m.receiveShadow = true;
      return m;
    },
  };
}

// A rectangle w by d round (x, z) with its corners rounded off (radius r)
function rounded(x, z, w, d, r) {
  r = Math.min(r, w / 2, d / 2);
  const out = [];
  for (const [cx, cz, a0] of [[w / 2 - r, d / 2 - r, 0], [-w / 2 + r, d / 2 - r, 0.5], [-w / 2 + r, -d / 2 + r, 1], [w / 2 - r, -d / 2 + r, 1.5]]) {
    for (let i = 0; i <= 4; i++) { const a = (a0 + i / 8) * Math.PI; out.push([x + cx + Math.cos(a) * r, z + cz + Math.sin(a) * r]); }
  }
  return out;
}

// The stream: `z(x)` its middle from x0 to x1, `w` wide, between low stone banks; footbridges where `bridges` (x)
// cross it, and a stone headwall at each end where it goes under the street
function stream(group, flat, marks, S) {
  const pts = [];
  for (let x = S.x0; x <= S.x1 + 0.01; x += 2) pts.push([x, S.z(x)]);
  // the water: ripples drifting down it
  const P = [], U = [], I = [];
  let run = 0;
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
    if (i) run += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    for (const s of [-0.5, 0.5]) { P.push(p[0] - dz / l * S.w * s, 0.17, p[1] + dx / l * S.w * s); U.push(s + 0.5, run / S.w); }
    if (i) { const k = 2 * (i - 1); I.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(P.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  const tex = canvasTexture(128, 256, (c, W, H) => {
    const gr = c.createLinearGradient(0, 0, W, 0);
    gr.addColorStop(0, '#2c6f86'); gr.addColorStop(0.5, '#3d93b2'); gr.addColorStop(1, '#2c6f86');
    c.fillStyle = gr; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(220,245,255,0.35)'; c.lineWidth = 3;
    for (let i = 0; i < 14; i++) {
      const x = 18 + ((i * 37) % 92), y = (i * 53) % H;
      c.beginPath(); c.moveTo(x - 9, y); c.quadraticCurveTo(x, y - 5, x + 9, y); c.stroke();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const water = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex, emissive: '#0d2c38', polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  water.receiveShadow = true;
  // (it flows: the ripples run down it, see the onBeforeRender)
  water.onBeforeRender = () => { tex.offset.y = -performance.now() / 9000; };
  group.add(water);
  // the banks: stones along each edge, a darker line of wet grass outside them
  flat.strip(pts, S.w + 3.2, 0.165, '#6f9a4c');
  marks.strip(pts, S.w + 1.4, 0.175, '#a49d90', [-0.5, -0.5 + 0.7 / (S.w + 1.4)]);
  marks.strip(pts, S.w + 1.4, 0.175, '#a49d90', [0.5 - 0.7 / (S.w + 1.4), 0.5]);
  // footbridges: a timber deck humped over the water, rails either side
  const parts = [];
  for (const x of S.bridges || []) {
    const z = S.z(x), L = S.w + 4, rise = 0.55;
    for (let i = 0; i < 8; i++) {
      const t0 = i / 8, t1 = (i + 1) / 8, y0 = rise * Math.sin(Math.PI * t0), y1 = rise * Math.sin(Math.PI * t1);
      const za = z - L / 2 + L * t0, zb = z - L / 2 + L * t1, len = Math.hypot(zb - za, y1 - y0), tilt = Math.atan2(y1 - y0, zb - za);
      parts.push([new THREE.BoxGeometry(2.8, 0.14, len + 0.02).rotateX(-tilt).translate(x, 0.2 + (y0 + y1) / 2, (za + zb) / 2), '#a8743f']);
      for (const s of [-1, 1]) parts.push([new THREE.BoxGeometry(0.08, 0.08, len + 0.02).rotateX(-tilt).translate(x + s * 1.35, 1.15 + (y0 + y1) / 2, (za + zb) / 2), '#e8e2d4']);
    }
    for (const s of [-1, 1]) for (let i = 0; i <= 4; i++) {
      const t = i / 4, y = rise * Math.sin(Math.PI * t);
      parts.push([new THREE.BoxGeometry(0.1, 1, 0.1).translate(x + s * 1.35, 0.7 + y, z - L / 2 + L * t), '#e8e2d4']);
    }
  }
  // (where it goes under the street, a stone headwall with a dark culvert in it)
  for (const [x, out] of [[S.x0, -1], [S.x1, 1]]) {
    const z = S.z(x);
    parts.push([new THREE.BoxGeometry(1.2, 2.2, S.w + 5).translate(x + out * 0.6, 1.1, z), '#a49d90']);
    parts.push([new THREE.BoxGeometry(0.1, 1.3, S.w - 1).translate(x - out * 0.03, 0.75, z), '#22282c']);
  }
  if (parts.length) {
    const m = new THREE.Mesh(merge(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }
}

// The drive round the hotel: an oval road (half-widths a and b to its outside edge, w wide) with a lawn inside it,
// edge lines and a dashed line down the middle, and a paved forecourt to the hotel's door (`door`: [x0, x1, z0, z1])
function drive(flat, marks, D) {
  const N = 96, at = (t, k) => [D.x + Math.cos(t) * (D.a - k), D.z + Math.sin(t) * (D.b - k)];
  marks.poly(Array.from({ length: N }, (_, i) => at(i / N * Math.PI * 2, D.w)), 0.22, '#7fa957');
  for (let i = 0; i < N; i++) {
    const t0 = i / N * Math.PI * 2, t1 = (i + 1) / N * Math.PI * 2;
    flat.quad(at(t0, 0), at(t1, 0), at(t1, D.w), at(t0, D.w), 0.215, '#55575f');
    for (const k of [0.35, D.w - 0.35]) marks.quad(at(t0, k - 0.08), at(t1, k - 0.08), at(t1, k + 0.08), at(t0, k + 0.08), 0.23, '#eeeeea');
    if (i % 2 === 0) marks.quad(at(t0, D.w / 2 - 0.08), at(t1, D.w / 2 - 0.08), at(t1, D.w / 2 + 0.08), at(t0, D.w / 2 + 0.08), 0.23, '#f0c93a');
    // (a kerb round the inside: the lawn's edge)
    marks.quad(at(t0, D.w), at(t1, D.w), at(t1, D.w + 0.35), at(t0, D.w + 0.35), 0.232, '#c9c2b4');
  }
  if (D.door) {
    const [x0, x1, z0, z1] = D.door;
    marks.poly([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], 0.235, '#d8d0c0');
    for (let x = x0 + 1; x < x1 - 0.5; x += 2) marks.quad([x, z0], [x + 1, z0], [x + 1, z1], [x, z1], 0.237, '#cfc6b4');
  }
}

// The car park: tarmac over `rect`, a white line between every bay (`bays`: [{ x, z, yaw }], 2.9 m by 5.6 m), and a
// green island at each end of a row of them
function carpark(flat, marks, C) {
  const [x0, x1, z0, z1] = C.rect;
  flat.poly([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], 0.215, '#55575f');
  for (const B of C.bays) {
    const dz = B.yaw ? 1 : -1;     // (toward the aisle: behind the car)
    for (const s of [-1.45, 1.45]) marks.quad([B.x + s - 0.06, B.z - 2.8], [B.x + s + 0.06, B.z - 2.8], [B.x + s + 0.06, B.z + 2.8], [B.x + s - 0.06, B.z + 2.8], 0.23, '#eeeeea');
    marks.quad([B.x - 1.45, B.z - dz * 2.8 - 0.06 * dz], [B.x + 1.45, B.z - dz * 2.8 - 0.06 * dz], [B.x + 1.45, B.z - dz * 2.8 + 0.06 * dz], [B.x - 1.45, B.z - dz * 2.8 + 0.06 * dz], 0.23, '#eeeeea');
  }
  // (arrows down the aisle)
  for (const x of C.arrows || []) {
    const z = (z0 + z1) / 2;
    marks.poly([[x - 1.6, z - 0.25], [x + 0.6, z - 0.25], [x + 0.6, z + 0.25], [x - 1.6, z + 0.25]], 0.23, '#eeeeea');
    marks.tri([x + 0.6, z - 0.7], [x + 1.6, z], [x + 0.6, z + 0.7], 0.23, '#eeeeea');
  }
}

function canvasTexture(W, H, draw) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  draw(cv.getContext('2d'), W, H);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.userData.redraw = () => { const g = cv.getContext('2d'); g.clearRect(0, 0, W, H); draw(g, W, H); t.needsUpdate = true; };
  return t;
}
// (redrawn once the web font it's lettered in has come in)
function whenFont(font, ...texs) { document.fonts?.load(font).then(() => { for (const t of texs) t.userData.redraw(); }).catch(() => {}); }

// The hotel's name in lit script, across the front of its tallest tower: a night-blue board in a gold frame, on
// brackets off the wall. (`x`, `z`: the middle of the wall it's on, which faces +z; `y` its middle; `w` by `h`.)
function hotelSign(S) {
  const W = 2048, H = Math.round(W * S.h / S.w);
  const tex = canvasTexture(W, H, (g) => {
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#1b2147'); bg.addColorStop(0.6, '#2d2650'); bg.addColorStop(1, '#4a2c4e');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // a sprinkle of stars, and the frame
    g.fillStyle = 'rgba(255,240,210,0.55)';
    for (let i = 0; i < 40; i++) { const x = (i * 397) % W, y = 30 + (i * 151) % (H * 0.3); g.fillRect(x, y, 3, 3); }
    g.strokeStyle = '#e6bd72'; g.lineWidth = 12; g.strokeRect(20, 20, W - 40, H - 40);
    g.lineWidth = 4; g.strokeRect(44, 44, W - 88, H - 88);
    // the name, as big as fits, glowing warm
    let px = H * 0.74;
    g.font = `${px}px ${SCRIPT}`;
    const tw = g.measureText(S.text).width;
    if (tw > W * 0.88) { px *= W * 0.88 / tw; g.font = `${px}px ${SCRIPT}`; }
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    const y = H * 0.5 + px * 0.28;
    g.fillStyle = '#fff4dc';
    g.shadowColor = '#ffae4a'; g.shadowBlur = 48; g.fillText(S.text, W / 2, y);
    g.shadowBlur = 14; g.fillText(S.text, W / 2, y);
    g.shadowBlur = 0; g.fillStyle = '#fffaf0'; g.fillText(S.text, W / 2, y);
  });
  whenFont(`64px ${SCRIPT}`, tex);
  const grp = new THREE.Group();
  const frame = merge([
    [new THREE.BoxGeometry(S.w + 0.6, S.h + 0.6, 0.5).translate(0, 0, 0.9), '#2a2436'],
    ...[-0.36, 0, 0.36].flatMap(k => [-0.3, 0.3].map(j => [new THREE.BoxGeometry(0.3, 0.3, 0.7).translate(k * S.w, j * S.h, 0.35), '#3c414a'])),
  ]);
  const back = new THREE.Mesh(frame, new THREE.MeshLambertMaterial({ vertexColors: true }));
  back.castShadow = true;
  // (a centimetre off its board, and pulled forward in depth too: from the far end of the run-up, half a kilometre off,
  // a centimetre is less than the depth buffer tells apart, and the two would flicker)
  const face = new THREE.Mesh(new THREE.PlaneGeometry(S.w, S.h).translate(0, 0, 1.16),
    new THREE.MeshBasicMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
  grp.add(back, face);
  grp.position.set(S.x, S.y, S.z);
  return grp;
}

// Round the square, each shop's name on a board over its door, under a striped awning, on the side facing the square
const BOARDS = ['#c23b3b', '#1f6f8b', '#e0a030', '#2f7f4f', '#7a3f8f', '#20243a', '#e8653a', '#f2ead8'];
function shopFronts(blocks, [sx, sz]) {
  const grp = new THREE.Group(), parts = [], texs = { [SCRIPT]: [], [BLOCK]: [] };
  blocks.forEach((b, i) => {
    // (the side it says, or the side most toward the middle of the square)
    const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([lx, lz]) => [lx * b.ca - lz * b.sa, lx * b.sa + lz * b.ca, lx ? b.w : b.d, lx ? b.d : b.w]);
    const [nx, nz, out, len] = b.face ? sides.find(s => s[0] * b.face[0] + s[1] * b.face[1] > 0.7)
      : sides.reduce((best, s) => ((sx - b.x) * s[0] + (sz - b.z) * s[1] > (sx - b.x) * best[0] + (sz - b.z) * best[1] ? s : best));
    const fx = b.x + nx * out / 2, fz = b.z + nz * out / 2, yaw = Math.atan2(nx, nz), g0 = b.y + 1;
    const colour = b.board || BOARDS[i % BOARDS.length], light = new THREE.Color(colour).getHSL({}).l > 0.6;
    // the awning, in stripes of the board's colour and white
    const aw = Math.min(len - 3, 22), n = Math.round(aw / 1.1);
    for (let k = 0; k < n; k++) {
      const s = -aw / 2 + (k + 0.5) * aw / n;
      parts.push([new THREE.BoxGeometry(aw / n, 0.07, 1.9).translate(s, 0, 0.95).rotateX(0.36).rotateY(yaw).translate(fx, g0 + 4.1, fz), k % 2 ? '#f4f1ea' : colour]);
    }
    // the board
    const bw = Math.min(len - 4, 6 + b.sign.length * 1.15), bh = 2.1;
    parts.push([new THREE.BoxGeometry(bw + 0.3, bh + 0.3, 0.3).translate(0, 0, 0.5).rotateY(yaw).translate(fx, g0 + 6.3, fz), '#2b2b30']);
    const tex = canvasTexture(1024, Math.round(1024 * bh / bw), (g, W, H) => {
      g.fillStyle = colour; g.fillRect(0, 0, W, H);
      g.strokeStyle = light ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.5)'; g.lineWidth = 6; g.strokeRect(10, 10, W - 20, H - 20);
      const script = b.font === 'script';
      let px = H * (script ? 0.82 : 0.6);
      const font = p => (script ? `${p}px ${SCRIPT}` : `${p}px ${BLOCK}`);
      g.font = font(px);
      const tw = g.measureText(b.sign).width;
      if (tw > W * 0.86) { px *= W * 0.86 / tw; g.font = font(px); }
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = light ? '#2a2420' : '#fff6e4';
      g.fillText(b.sign, W / 2, H / 2 + (script ? px * 0.08 : px * 0.04));
    });
    texs[b.font === 'script' ? SCRIPT : BLOCK].push(tex);
    // (pulled forward in depth, like the hotel's: see hotelSign)
    const face = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh).translate(0, 0, 0.66).rotateY(yaw),
      new THREE.MeshLambertMaterial({ map: tex, emissive: '#222222', polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    face.position.set(fx, g0 + 6.3, fz);
    grp.add(face);
  });
  // (each redrawn once its own lettering's come in)
  for (const [font, list] of Object.entries(texs)) if (list.length) whenFont(`64px ${font}`, ...list);
  const m = new THREE.Mesh(merge(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.castShadow = true;
  grp.add(m);
  return grp;
}
