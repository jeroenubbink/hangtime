// A sign by the road that says what's coming, and how far: a teal panel on two posts, a pump drawn on it, and the
// distance to the station counted from where it stands (to the nearest 50 m, like a real one).
import * as THREE from 'three';
import { t } from '../i18n.js';

// `S`: { x, z, yaw, to: z of what it points to } (at yaw 0 its face looks toward +z, at you coming)
export function roadsign(city, S) {
  const n = Math.round(Math.abs(S.z - S.to) / 50) * 50;
  return board(city, S, g => {
    g.fillStyle = '#0f8a8c'; g.fillRect(0, 0, 1024, 640);
    g.strokeStyle = '#ffffff'; g.lineWidth = 18; g.strokeRect(24, 24, 976, 592);
    // the pump: a body with a window, a hose and a nozzle on its side
    g.fillStyle = '#ffffff';
    g.fillRect(110, 140, 190, 330); g.fillRect(85, 470, 240, 40);
    g.fillStyle = '#0f8a8c'; g.fillRect(140, 175, 130, 95);
    g.strokeStyle = '#ffffff'; g.lineWidth = 22; g.lineCap = 'round';
    g.beginPath(); g.moveTo(300, 200); g.lineTo(355, 200); g.lineTo(370, 400); g.quadraticCurveTo(375, 450, 335, 440); g.stroke();
    g.beginPath(); g.moveTo(355, 200); g.lineTo(355, 150); g.stroke();
    g.fillStyle = '#ffffff'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.font = "900 96px 'Titillium Web', Impact, sans-serif";
    g.fillText(t('GAS STATION'), 410, 250, 540);
    g.fillStyle = '#ff8a1a'; g.font = "italic 900 150px 'Titillium Web', Impact, sans-serif";
    g.fillText(t('in {0} m', n), 410, 420, 540);
  });
}

// Tanker Row's warnings on the way in, each a little more worried than the last, and the sign over the bays the tankers
// are parked in. `S`: { kind, x, z, yaw, over }, kind one of WARNINGS; `over`: hung out over the road on an arm from a post
// that far to its right (the warnings, over your lane, where no tree's in the way).
const FONT = px => `900 ${px}px 'Titillium Web', Impact, sans-serif`;
const WARNINGS = {
  // a placard for something that burns, and NO SMOKING
  smoking: g => {
    g.fillStyle = '#f4f2ea'; g.fillRect(0, 0, 1024, 640);
    g.strokeStyle = '#c8281e'; g.lineWidth = 26; g.strokeRect(26, 26, 972, 588);
    g.save(); g.translate(250, 320); g.rotate(Math.PI / 4);
    g.fillStyle = '#d8301f'; g.fillRect(-150, -150, 300, 300);
    g.strokeStyle = '#ffffff'; g.lineWidth = 10; g.strokeRect(-132, -132, 264, 264);
    g.restore();
    // (the flame on it)
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(250, 200); g.bezierCurveTo(330, 280, 310, 360, 250, 380); g.bezierCurveTo(190, 360, 180, 300, 225, 255);
    g.bezierCurveTo(230, 290, 245, 300, 255, 300); g.bezierCurveTo(260, 260, 240, 230, 250, 200); g.fill();
    g.fillRect(205, 395, 90, 14);
    g.fillStyle = '#1b1b1f'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = FONT(150); g.fillText(t('NO'), 700, 230, 540);
    g.font = FONT(130); g.fillText(t('SMOKING'), 700, 410, 540);
  },
  // the old joke: two words for the same thing, both crossed out, and plainer words
  flammable: g => {
    g.fillStyle = '#ffd23a'; g.fillRect(0, 0, 1024, 640);
    g.strokeStyle = '#1b1b1f'; g.lineWidth = 24; g.strokeRect(24, 24, 976, 592);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const crossed = (text, y) => {
      g.fillStyle = '#1b1b1f'; g.font = FONT(120); g.fillText(text, 512, y, 900);
      const w = Math.min(900, g.measureText(text).width);
      g.strokeStyle = '#c8281e'; g.lineWidth = 20; g.lineCap = 'round';
      g.beginPath(); g.moveTo(512 - w / 2 - 20, y + 14); g.lineTo(512 + w / 2 + 20, y - 18); g.stroke();
    };
    crossed(t('INFLAMMABLE'), 140);
    crossed(t('FLAMMABLE'), 300);
    g.fillStyle = '#c8281e'; g.font = 'italic ' + FONT(130); g.fillText(t('JUST DON\'T'), 512, 480, 900);
  },
  seriously: g => {
    g.fillStyle = '#1b1b1f'; g.fillRect(0, 0, 1024, 640);
    g.strokeStyle = '#ffd23a'; g.lineWidth = 24; g.strokeRect(24, 24, 976, 592);
    g.fillStyle = '#ffd23a'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = FONT(210); g.fillText(t('SERIOUSLY.'), 512, 330, 900);
  },
  // roadworks: merge in turn, the two arrows zipping into one (Bank Shot's, over its queue)
  merge: g => {
    g.fillStyle = '#ffd23a'; g.fillRect(0, 0, 1024, 640);
    g.strokeStyle = '#1b1b1f'; g.lineWidth = 24; g.strokeRect(24, 24, 976, 592);
    g.strokeStyle = '#1b1b1f'; g.lineWidth = 34; g.lineCap = 'round'; g.lineJoin = 'round';
    // (two lanes coming in from the bottom, meeting, one going on up: and the zip between them where they meet)
    g.beginPath(); g.moveTo(150, 560); g.lineTo(150, 420); g.quadraticCurveTo(150, 330, 230, 300); g.stroke();
    g.beginPath(); g.moveTo(310, 560); g.lineTo(310, 420); g.quadraticCurveTo(310, 330, 230, 300); g.stroke();
    g.beginPath(); g.moveTo(230, 300); g.lineTo(230, 150); g.stroke();
    g.fillStyle = '#1b1b1f'; g.beginPath(); g.moveTo(230, 70); g.lineTo(300, 170); g.lineTo(160, 170); g.closePath(); g.fill();
    for (let k = 0; k < 4; k++) { g.fillRect(208 + (k % 2) * 22, 340 + k * 40, 22, 22); }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = FONT(150); g.fillText(t('MERGE'), 680, 220, 560);
    g.font = FONT(120); g.fillText(t('IN TURN'), 680, 420, 560);
  },
  // Mind the Gap's, on the way to the canal: the road closed, the bridge out, how far to the end, and then just pleading
  closed: g => {
    g.fillStyle = '#f4f2ea'; g.fillRect(0, 0, 1024, 640);
    // (red and white stripes along the bottom, like the barrier it'd be on)
    g.save(); g.beginPath(); g.rect(24, 470, 976, 146); g.clip();
    for (let x = -200; x < 1100; x += 120) { g.fillStyle = '#c8281e'; g.beginPath(); g.moveTo(x, 616); g.lineTo(x + 60, 616); g.lineTo(x + 206, 470); g.lineTo(x + 146, 470); g.fill(); }
    g.restore();
    g.strokeStyle = '#c8281e'; g.lineWidth = 24; g.strokeRect(24, 24, 976, 592);
    g.fillStyle = '#1b1b1f'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = FONT(150); g.fillText(t('ROAD CLOSED'), 512, 190, 900);
    g.font = FONT(100); g.fillText(t('AHEAD'), 512, 360, 900);
  },
  bridgeout: g => {
    g.fillStyle = '#ff8a1a'; g.fillRect(0, 0, 1024, 640);
    g.strokeStyle = '#1b1b1f'; g.lineWidth = 24; g.strokeRect(24, 24, 976, 592);
    g.fillStyle = '#1b1b1f'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = FONT(170); g.fillText(t('BRIDGE OUT'), 512, 220, 920);
    g.font = FONT(110); g.fillText(t('TURN AROUND'), 512, 440, 900);
  },
  deadend: (g, S) => {
    const n = Math.round(Math.abs(S.z - S.to) / 50) * 50;
    g.fillStyle = '#1f4f9a'; g.fillRect(0, 0, 1024, 640);
    g.strokeStyle = '#ffffff'; g.lineWidth = 18; g.strokeRect(24, 24, 976, 592);
    // (the dead end's sign: a white T, its top bar red)
    g.fillStyle = '#ffffff'; g.fillRect(150, 230, 90, 300);
    g.fillStyle = '#c8281e'; g.fillRect(80, 140, 230, 90);
    g.fillStyle = '#ffffff'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.font = FONT(130); g.fillText(t('DEAD END'), 380, 250, 590);
    g.fillStyle = '#ff8a1a'; g.font = 'italic ' + FONT(150); g.fillText(t('in {0} m', n), 380, 430, 590);
  },
  noway: g => {
    g.fillStyle = '#ffd23a'; g.fillRect(0, 0, 1024, 640);
    g.strokeStyle = '#1b1b1f'; g.lineWidth = 24; g.strokeRect(24, 24, 976, 592);
    g.fillStyle = '#1b1b1f'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = FONT(170); g.fillText(t('NO, REALLY.'), 512, 220, 900);
    g.fillStyle = '#c8281e'; g.font = 'italic ' + FONT(120); g.fillText(t('TURN AROUND'), 512, 440, 900);
  },
  gap: g => {
    g.fillStyle = '#1b1b1f'; g.fillRect(0, 0, 1024, 640);
    g.strokeStyle = '#ffd23a'; g.lineWidth = 24; g.strokeRect(24, 24, 976, 592);
    g.fillStyle = '#ffd23a'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = FONT(190); g.fillText(t('MIND'), 512, 200, 900);
    g.font = FONT(190); g.fillText(t('THE GAP'), 512, 420, 900);
  },
  // a parking sign: the blue P, and who may
  permit: g => {
    g.fillStyle = '#f4f2ea'; g.fillRect(0, 0, 1024, 640);
    g.strokeStyle = '#1f4f9a'; g.lineWidth = 20; g.strokeRect(20, 20, 984, 600);
    g.fillStyle = '#1f4f9a'; g.fillRect(70, 110, 330, 420);
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = FONT(400); g.fillText('P', 235, 335);
    g.fillStyle = '#1b1b1f'; g.font = FONT(110);
    g.fillText(t('PERMIT'), 700, 170, 540); g.fillText(t('HOLDERS'), 700, 320, 540); g.fillText(t('ONLY'), 700, 470, 540);
  },
};
export function warning(city, S) { return board(city, S, g => WARNINGS[S.kind](g, S)); }

// A board on two posts (or out on an arm, `S.over`), `draw(g)` painting its face on a 1024 by 640 canvas (redrawn when
// the font's in)
function board(city, S, draw) {
  const group = new THREE.Group(), y = city.groundHeight(S.x + (S.over || 0), S.z, 1);
  const post = new THREE.MeshLambertMaterial({ color: '#8a9196' });
  const bar = (len, x, yy, z, along) => {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, len, 8), post);
    p.position.set(x, yy, z);
    if (along) p.rotation.z = Math.PI / 2;
    p.castShadow = true;
    group.add(p);
  };
  if (S.over) {
    bar(9.6, S.over, 4.8, -0.08);
    // (the arm out over the road, and a strut under it)
    bar(S.over + 2.4, S.over / 2 - 1.2, 9.3, -0.2, true);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.4, 6), post);
    strut.position.set(S.over - 1.2, 8.1, -0.2);
    strut.rotation.z = -0.78;
    group.add(strut);
  } else for (const lx of [-2, 2]) bar(9.4, lx, 4.7, -0.08);
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 640;
  draw(cv.getContext('2d'));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  document.fonts?.load(FONT(100)).then(() => { draw(cv.getContext('2d')); tex.needsUpdate = true; }).catch(() => {});
  // (lit a little on its own, so it reads from the start line in any light)
  const face = new THREE.Mesh(new THREE.PlaneGeometry(5, 3.125), new THREE.MeshLambertMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.35 }));
  face.position.set(0, 7.6, 0);
  const back = new THREE.Mesh(new THREE.BoxGeometry(5.1, 3.2, 0.1), post);
  back.position.set(0, 7.6, -0.07);
  back.castShadow = true;
  group.add(face, back);
  group.position.set(S.x, y, S.z);
  group.rotation.y = S.yaw || 0;
  return group;
}
