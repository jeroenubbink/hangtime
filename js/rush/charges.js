// Things standing about that go up and aren't vehicles: Bank Shot's roadworks compound, its cage of gas bottles and its
// tar boiler. A blast reaching one (yours, or a tanker's) sets it off: a string of bangs, each one a blast of its own,
// so one can set off the next. Placed as fixtures (see fixtures.js), not solid; gone once they've gone up. Each wears a
// big FIRE HAZARD sticker on every side, so you can see from the road what's worth a detonation.
import * as THREE from 'three';
import { fixtures } from './fixtures.js';
import { t } from '../i18n.js';

// `list`: [{ kind, x, z, yaw, scale, r: how near a blast has to come, name, callout, pts, pops: [[delay, big, dx, dz]] }]
export class Charges {
  constructor(city, list) {
    this.group = fixtures(city, list.map(c => [c.kind, c.x, c.z, c.yaw || 0, c.scale || 1]));
    for (const m of this.group.children) stickers(m);
    this.list = list.map((c, i) => ({ ...c, i, id: 'charge' + i, mesh: this.group.children[i], p: new THREE.Vector3(c.x, city.groundHeight(c.x, c.z, 1) + 1, c.z), gone: false }));
  }
  // The ones still standing within R (and their own reach) of p
  near(p, R) { return this.list.filter(c => !c.gone && Math.hypot(c.x - p.x, c.z - p.z) < R + (c.r || 2)); }
  // Gone up: not there any more
  hide(i) { const c = this.list[i]; if (c) { c.gone = true; c.mesh.visible = false; } }
  reset() { for (const c of this.list) { c.gone = false; c.mesh.visible = true; } }
}

// The sticker: a yellow warning triangle with a flame in it, FIRE HAZARD under it, on a white backing
let tex = null;
function sticker() {
  if (tex) return tex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const g = cv.getContext('2d');
  const draw = () => {
    g.clearRect(0, 0, 512, 512);
    // (rounded where the browser can: roundRect is newer than the rest of this, and a level mustn't fail to load over it)
    g.fillStyle = '#ffffff'; g.beginPath(); if (g.roundRect) g.roundRect(8, 8, 496, 496, 40); else g.rect(8, 8, 496, 496); g.fill();
    g.fillStyle = '#1b1b1f'; g.beginPath(); g.moveTo(256, 30); g.lineTo(476, 380); g.lineTo(36, 380); g.closePath(); g.fill();
    g.fillStyle = '#ffd23a'; g.beginPath(); g.moveTo(256, 78); g.lineTo(436, 360); g.lineTo(76, 360); g.closePath(); g.fill();
    // (the flame)
    g.fillStyle = '#1b1b1f'; g.beginPath(); g.moveTo(256, 150); g.bezierCurveTo(330, 220, 320, 320, 256, 335); g.bezierCurveTo(192, 320, 180, 260, 225, 215);
    g.bezierCurveTo(228, 255, 245, 265, 258, 262); g.bezierCurveTo(268, 220, 240, 190, 256, 150); g.fill();
    g.fillStyle = '#c8281e'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = "900 84px 'Titillium Web', Impact, sans-serif"; g.fillText(t('FIRE HAZARD'), 256, 438, 470);
  };
  draw();
  tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  document.fonts?.load("900 84px 'Titillium Web'").then(() => { draw(); tex.needsUpdate = true; }).catch(() => {});
  return tex;
}
// One on each side of m, a little out from it: a metre across (twice the warnings on the models), or as big as the side takes
function stickers(m) {
  const B = new THREE.Box3().setFromBufferAttribute(m.geometry.attributes.position), c = B.getCenter(new THREE.Vector3()), s = B.getSize(new THREE.Vector3());
  const mat = new THREE.MeshLambertMaterial({ map: sticker(), transparent: true, emissive: '#ffffff', emissiveMap: sticker(), emissiveIntensity: 0.3, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const [ax, sign] of [['x', 1], ['x', -1], ['z', 1], ['z', -1]]) {
    const across = ax === 'x' ? s.z : s.x, k = Math.min(1, across * 0.8, s.y * 0.7);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(k, k), mat);
    p.position.set(ax === 'x' ? c.x + sign * (s.x / 2 + 0.06) : c.x, c.y, ax === 'z' ? c.z + sign * (s.z / 2 + 0.06) : c.z);
    p.rotation.y = ax === 'x' ? sign * Math.PI / 2 : sign > 0 ? 0 : Math.PI;
    m.add(p);
  }
}
