// Short Cut's film shoot: your jump is a stunt in a film. The unit's base on the building site by the ramp (trailers,
// the director's chairs, a clapperboard, lights), a camera crane at the first junction filming you coming; and the two
// junctions as famous corners: Neon Corner, screens and signs glowing all up its buildings, and Clock Corner, the
// clock tower and the old cinema showing the film. At the end of the road, the studio. The crane, lights, trailers,
// clock tower and clapperboard are from the film kit (modelled in Blender, see assets/src/film.blend); the screens,
// signs and lettering are drawn here.
import * as THREE from 'three';
import { merge } from '../scenery.js';
import { fixtures } from './fixtures.js';
import { t } from '../i18n.js';

const FONT = "'Titillium Web', Impact, sans-serif";
// The screens' ads, by number (each screen turns over through its list)
const ADS = [
  { bg: '#2a0b3d', fg: '#ff4fd8', big: 'FIZZ BANG!', small: 'The soda that hits you back' },
  { bg: '#0b3a3d', fg: '#3ff5ea', big: 'BRAKES?', small: 'Never heard of them.' },
  { bg: '#3d1a05', fg: '#ffb12e', big: 'WOK AROUND THE CLOCK', small: 'Noodles · open all night' },
  { bg: '#05213d', fg: '#7fd0ff', big: 'DENT-ISTS', small: 'We fix smiles and bumpers' },
  { bg: '#1a1a1a', fg: '#ffd84a', big: 'TAKE TWO STUDIOS', small: 'Now casting: stunt drivers' },
  { bg: '#3d0510', fg: '#ff6a5a', big: 'TWO JUNCTIONS TOO FAR', small: 'In cinemas soon · if they finish it' },
];
const GLOW = ['#ff4fd8', '#3ff5ea', '#ffb12e', '#7fd0ff', '#ff6a5a'];

// `F`: { screens: [[x, y, z, yaw, w, h, [ads]]], blades: [[x, y, z, yaw, text, colour, len]], clock: [x, z],
//   marquee: { x, z, yaw }, studio: { x, z, yaw, y }, clapper: [x, z, yaw], signs: [[x, z, yaw]], kit: fixtures }
// (at yaw 0 a face looks toward +z: up the road, at you coming)
export function filmset(city, F) {
  const group = new THREE.Group(), gy = (x, z) => city.groundHeight(x, z, 1);
  group.add(fixtures(city, F.kit));
  // The screens: in a dark frame, lit, turning over to the next ad every few seconds
  for (const [x, y, z, yaw, w, h, ads] of F.screens) {
    group.add(onto(new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, h + 0.8, 0.5), FRAME), x, y, z, yaw, 0, 0, -0.2));
    // (one up on a roof stands on legs)
    const foot = y - h / 2 - city.groundHeight(...local(x, z, yaw, 0, -1), 60);
    if (foot > 0.5 && foot < 8) for (const s of [-1, 1]) group.add(onto(new THREE.Mesh(new THREE.BoxGeometry(0.4, foot, 0.4), FRAME), x, y, z, yaw, s * w / 3, -h / 2 - foot / 2, -0.4));
    const maps = ads.map(i => ad(ADS[i], w / h));
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: maps[0], toneMapped: false }));
    if (maps.length > 1) m.onBeforeRender = () => { m.material.map = maps[Math.floor(performance.now() / 5000 + Math.abs(x) / 7) % maps.length]; };
    group.add(onto(m, x, y, z, yaw, 0, 0, 0.06));
  }
  // The neon blades: sticking out of a wall, lettered down both faces
  // (`yaw`: the way it sticks out)
  for (const [x, y, z, yaw, text, colour, len] of F.blades) group.add(blade(x, y, z, yaw, t(text), colour, len));
  // The clock tower's faces, showing the time it is where you are
  if (F.clock) {
    const [cx, cz] = F.clock, y = gy(cx, cz) + 32, cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    let shown = -1;
    const draw = () => {
      const d = new Date(), min = d.getHours() * 60 + d.getMinutes();
      if (min === shown) return;
      shown = min;
      clockFace(cv.getContext('2d'), min);
      tex.needsUpdate = true;
    };
    draw();
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    for (let i = 0; i < 4; i++) {
      const m = onto(new THREE.Mesh(new THREE.CircleGeometry(2.5, 32), mat), cx, y, cz, i * Math.PI / 2, 0, 0, 3.5);
      if (i === 0) m.onBeforeRender = draw;
      group.add(m);
    }
  }
  // The cinema: a canopy over its doors, lettered on three sides and lined with bulbs
  if (F.marquee) {
    const { x, z, yaw } = F.marquee, y = gy(...local(x, z, yaw, 0, 1.5)), W = 16, D = 3.2;
    const parts = [[new THREE.BoxGeometry(W, 0.5, D).translate(0, 4.6, D / 2), '#2c3036'], [new THREE.BoxGeometry(W + 0.2, 2.2, 0.3).translate(0, 5.9, D), '#f4f2ec'],
      ...[-1, 1].map(s => [new THREE.BoxGeometry(0.3, 2.2, D).translate(s * (W / 2 + 0.1), 5.9, D / 2), '#f4f2ec']),
      [new THREE.BoxGeometry(W + 0.4, 0.25, D + 0.2).translate(0, 7.1, D / 2), '#c9302c'], [new THREE.BoxGeometry(W + 0.4, 0.25, D + 0.2).translate(0, 4.75, D / 2), '#c9302c']];
    group.add(onto(new THREE.Mesh(merge(parts), new THREE.MeshLambertMaterial({ vertexColors: true })), x, y, z, yaw, 0, 0, 0));
    const bulbs = [];
    for (let i = 0; i <= 32; i++) for (const yy of [4.75, 7.1]) bulbs.push(new THREE.BoxGeometry(0.16, 0.16, 0.16).translate(-W / 2 + i * W / 32, yy, D + 0.16));
    group.add(onto(new THREE.Mesh(merge(bulbs.map(g => [g, '#ffe9a8'])), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })), x, y, z, yaw, 0, 0, 0));
    const front = board(1024, 140, g => {
      g.fillStyle = '#f4f2ec'; g.fillRect(0, 0, 1024, 140);
      g.fillStyle = '#1b1c1f'; g.textAlign = 'center'; g.textBaseline = 'middle';
      fit(g, t('NOW SHOWING'), 900, 40, "700 {}px " + FONT); g.fillText(t('NOW SHOWING'), 512, 34);
      fit(g, t('TWO JUNCTIONS TOO FAR'), 980, 76, "900 {}px " + FONT); g.fillText(t('TWO JUNCTIONS TOO FAR'), 512, 96);
    });
    group.add(onto(new THREE.Mesh(new THREE.PlaneGeometry(W, 2.0), front), x, y, z, yaw, 0, 5.9, D + 0.16));
    const side = board(256, 140, g => {
      g.fillStyle = '#f4f2ec'; g.fillRect(0, 0, 256, 140);
      g.fillStyle = '#c9302c'; g.textAlign = 'center'; g.textBaseline = 'middle';
      fit(g, t('TONIGHT 8PM'), 230, 60, "900 {}px " + FONT); g.fillText(t('TONIGHT 8PM'), 128, 70);
    });
    for (const s of [-1, 1]) group.add(onto(new THREE.Mesh(new THREE.PlaneGeometry(D - 0.2, 2.0), side), x, y, z, yaw + s * Math.PI / 2, s * (D / 2), 5.9, W / 2 + 0.26));
  }
  // The studio at the end of the road: its name over the gate, up on the roof's edge, and the stage door
  if (F.studio) {
    const { x, z, yaw, y: top } = F.studio, y = gy(...local(x, z, yaw, 0, 1.5));
    const parts = [[new THREE.BoxGeometry(30, 6.4, 0.4).translate(0, top + 3.6, 0), '#1b1c1f'],
      ...[-11, 0, 11].map(px => [new THREE.BoxGeometry(0.4, 3, 0.4).translate(px, top + 1.2, -0.4), '#5d646c'])];
    group.add(onto(new THREE.Mesh(merge(parts), new THREE.MeshLambertMaterial({ vertexColors: true })), x, y, z, yaw, 0, 0, 0));
    const sign = board(1024, 220, g => {
      const gr = g.createLinearGradient(0, 0, 0, 220); gr.addColorStop(0, '#ffe58a'); gr.addColorStop(1, '#c8902a');
      g.fillStyle = '#1b1c1f'; g.fillRect(0, 0, 1024, 220);
      g.fillStyle = gr; g.textAlign = 'center'; g.textBaseline = 'middle';
      fit(g, t('TAKE TWO STUDIOS'), 980, 150, "italic 900 {}px " + FONT); g.fillText(t('TAKE TWO STUDIOS'), 512, 112);
    }, true);
    group.add(onto(new THREE.Mesh(new THREE.PlaneGeometry(29, 6.2), sign), x, y, z, yaw, 0, top + 3.6, 0.22));
    const door = board(512, 360, g => {
      g.fillStyle = '#3a3f46'; g.fillRect(0, 0, 512, 360);
      g.fillStyle = '#4a5058'; for (let i = 0; i < 12; i++) g.fillRect(0, 40 + i * 28, 512, 6);
      g.fillStyle = '#ffd84a'; g.fillRect(0, 0, 512, 34);
      g.fillStyle = '#1b1c1f'; for (let i = -1; i < 14; i++) { g.beginPath(); g.moveTo(i * 40, 34); g.lineTo(i * 40 + 20, 0); g.lineTo(i * 40 + 40, 0); g.lineTo(i * 40 + 20, 34); g.fill(); }
      g.fillStyle = '#f4f2ec'; g.textAlign = 'center'; g.textBaseline = 'middle';
      fit(g, t('STAGE 2'), 400, 96, "900 {}px " + FONT); g.fillText(t('STAGE 2'), 256, 170);
      fit(g, t('QUIET PLEASE · FILMING'), 440, 36, "700 {}px " + FONT); g.fillText(t('QUIET PLEASE · FILMING'), 256, 250);
    });
    group.add(onto(new THREE.Mesh(new THREE.PlaneGeometry(12, 8.4), door), x, y, z, yaw, 0, 4.2, 0.08));
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.3), new THREE.MeshBasicMaterial({ color: '#ff3b2a', toneMapped: false }));
    group.add(onto(lamp, x, y, z, yaw, 0, 9.2, 0.2));
  }
  // The clapperboard by the ramp, with the film on it
  if (F.clapper) {
    const [x, z, yaw] = F.clapper, slate = board(512, 320, g => {
      g.fillStyle = '#23262b'; g.fillRect(0, 0, 512, 320);
      g.fillStyle = '#f4f2ec'; g.textAlign = 'center'; g.textBaseline = 'middle';
      fit(g, t('TWO JUNCTIONS TOO FAR'), 470, 54, "900 {}px " + FONT); g.fillText(t('TWO JUNCTIONS TOO FAR'), 256, 70);
      g.fillRect(16, 128, 480, 4); g.fillRect(254, 132, 4, 172);
      g.font = "700 30px " + FONT; g.fillText(t('SCENE'), 135, 165); g.fillText(t('TAKE'), 377, 165);
      g.font = "900 96px " + FONT; g.fillText('12', 135, 245); g.fillText('2', 377, 245);
    });
    group.add(onto(new THREE.Mesh(new THREE.PlaneGeometry(4.0, 2.5), slate), x, gy(x, z), z, yaw, 0, 3.6, 0.11));
  }
  // The signs round the unit: on legs, yellow
  const notice = board(512, 340, g => {
    g.fillStyle = '#ffd400'; g.fillRect(0, 0, 512, 340);
    g.strokeStyle = '#1b1c1f'; g.lineWidth = 12; g.strokeRect(14, 14, 484, 312);
    g.fillStyle = '#1b1c1f'; g.textAlign = 'center'; g.textBaseline = 'middle';
    fit(g, t('FILMING'), 440, 110, "900 {}px " + FONT); g.fillText(t('FILMING'), 256, 105);
    fit(g, t('IN PROGRESS'), 440, 64, "900 {}px " + FONT); g.fillText(t('IN PROGRESS'), 256, 190);
    fit(g, t('ROAD CLOSED · DO NOT STOP'), 440, 34, "700 {}px " + FONT); g.fillText(t('ROAD CLOSED · DO NOT STOP'), 256, 270);
  });
  for (const [x, z, yaw] of F.signs || []) {
    const y = gy(x, z);
    group.add(onto(new THREE.Mesh(merge([-0.7, 0.7].map(s => [new THREE.BoxGeometry(0.08, 1.6, 0.08).translate(s, 0.8, -0.05), '#5d646c'])), new THREE.MeshLambertMaterial({ vertexColors: true })), x, y, z, yaw, 0, 0, 0));
    group.add(onto(new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.2), notice), x, y, z, yaw, 0, 1.9, 0));
  }
  return group;
}

const FRAME = new THREE.MeshLambertMaterial({ color: '#1b1c1f' });
// An ad, lit, drawn for a screen `aspect` wide to its height
function ad(A, aspect) {
  const h = 256, w = Math.round(h * aspect), cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = A.bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = A.fg; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
  g.fillStyle = A.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = A.fg; g.shadowBlur = 18;
  fit(g, t(A.big), w - 50, 110, "italic 900 {}px " + FONT); g.fillText(t(A.big), w / 2, h * 0.42);
  g.fillStyle = '#ffffff'; g.shadowBlur = 0;
  fit(g, t(A.small), w - 60, 34, "700 {}px " + FONT); g.fillText(t(A.small), w / 2, h * 0.76);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
// A neon blade sign, its middle at (x, y, z), `len` tall, standing out from a wall along `yaw`
function blade(x, y, z, yaw, text, colour = GLOW[0], len = 8) {
  const g = new THREE.Group(), cv = document.createElement('canvas');
  cv.width = 128; cv.height = 128 * Math.round(len / 1.6);
  const c = cv.getContext('2d'), letters = [...text], step = cv.height / letters.length;
  c.fillStyle = '#16131c'; c.fillRect(0, 0, cv.width, cv.height);
  c.strokeStyle = colour; c.lineWidth = 5; c.strokeRect(8, 8, cv.width - 16, cv.height - 16);
  c.fillStyle = colour; c.shadowColor = colour; c.shadowBlur = 16;
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `900 ${Math.min(100, step * 0.8)}px ${FONT}`;
  letters.forEach((l, i) => c.fillText(l, 64, step * (i + 0.5)));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, len, 1.6), FRAME));
  for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, len), mat); m.position.x = s * 0.17; m.rotation.y = s * Math.PI / 2; g.add(m); }
  g.position.set(x, y, z);
  g.rotation.y = yaw;
  return g;
}
// A clock face at `min` minutes past midnight
function clockFace(g, min) {
  g.fillStyle = '#f6efd9'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#1b1c1f'; g.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6, r0 = i % 3 ? 100 : 88;
    g.lineWidth = i % 3 ? 5 : 10;
    g.beginPath(); g.moveTo(128 + Math.sin(a) * r0, 128 - Math.cos(a) * r0); g.lineTo(128 + Math.sin(a) * 116, 128 - Math.cos(a) * 116); g.stroke();
  }
  const hand = (a, len, w) => { g.lineWidth = w; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.sin(a) * len, 128 - Math.cos(a) * len); g.stroke(); };
  hand((min % 720) / 720 * Math.PI * 2, 60, 12);
  hand((min % 60) / 60 * Math.PI * 2, 96, 7);
  g.fillStyle = '#1b1c1f'; g.beginPath(); g.arc(128, 128, 10, 0, Math.PI * 2); g.fill();
}
// A canvas drawn by `draw`, as a material (`lit`: glowing, not shaded)
function board(w, h, draw, lit) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const o = { map: tex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
  return lit ? new THREE.MeshBasicMaterial({ ...o, toneMapped: false }) : new THREE.MeshLambertMaterial(o);
}
// The font (`font`, its size as {}) at `px`, or smaller to fit `w`
function fit(g, text, w, px, font) {
  g.font = font.replace('{}', px);
  const m = g.measureText(text).width;
  if (m > w) g.font = font.replace('{}', Math.floor(px * w / m));
}
// (lx, lz) in the frame of something at (x, z) turned by `yaw`, in the world
function local(x, z, yaw, lx, lz) {
  const s = Math.sin(yaw), k = Math.cos(yaw);
  return [x + lx * k + lz * s, z - lx * s + lz * k];
}
// `o` on something standing at (x, y, z) turned by `yaw`, at (lx, ly, lz) in its own frame
function onto(o, x, y, z, yaw, lx, ly, lz) {
  const [wx, wz] = local(x, z, yaw, lx, lz);
  o.position.set(wx, y + ly, wz);
  o.rotation.y = yaw;
  return o;
}
