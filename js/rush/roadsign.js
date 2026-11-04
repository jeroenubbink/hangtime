// A sign by the road that says what's coming, and how far: a teal panel on two posts, a pump drawn on it, and the
// distance to the station counted from where it stands (to the nearest 50 m, like a real one).
import * as THREE from 'three';
import { t } from '../i18n.js';

// `S`: { x, z, yaw, to: z of what it points to } (at yaw 0 its face looks toward +z, at you coming)
export function roadsign(city, S) {
  const group = new THREE.Group(), y = city.groundHeight(S.x, S.z, 1), n = Math.round(Math.abs(S.z - S.to) / 50) * 50;
  const post = new THREE.MeshLambertMaterial({ color: '#8a9196' });
  for (const lx of [-2, 2]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 9.4, 8), post);
    p.position.set(lx, 4.7, -0.08);
    p.castShadow = true;
    group.add(p);
  }
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 640;
  const g = cv.getContext('2d');
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
  const words = t('GAS STATION'); g.fillText(words, 410, 250, 540);
  g.fillStyle = '#ff8a1a'; g.font = "italic 900 150px 'Titillium Web', Impact, sans-serif";
  const far = t('in {0} m', n); g.fillText(far, 410, 420, 540);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
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
