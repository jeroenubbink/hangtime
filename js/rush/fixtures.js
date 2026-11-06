// Things standing about a level that aren't buildings or street furniture: Gridlock Leap's building site, its
// excavator and site cabin, the sand and the pipes; Over the Edge's pylons and billboards. From the works and bridge
// kits (modelled in Blender, see assets/src/works.blend and bridge.blend),
// with plain boxes if it hasn't loaded. Solid, most of them (a box round each, that a car can come down on top of), and
// they stay where they are.
import * as THREE from 'three';
import { sceneryGeo } from '../scenery.js';

const MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
// Each kind's solid box: [width, depth, height, how far it's off the model's middle toward its back]; null, not solid
const SOLID = {
  excavator: [2.8, 4.4, 3.3, 0.3], cabin: [6.1, 2.6, 3, 0], sand: [4.6, 4, 1.1, 0], skip: [4, 1.8, 1.4, 0],
  roller: [2, 3.6, 2.6, -0.45], pipes: [3.5, 2.4, 2.2, 0], worksign: null,
  pylon: [4, 4, 19.2, 0], billboard: null,
  filmcrane: [2.4, 3.2, 1.6, 0], lights: [1.6, 2.4, 1.4, 0], trailer: [9, 2.6, 3.8, 0], catering: [7.4, 2.5, 3.6, 0], clocktower: [7.4, 7.4, 46, 0],
  clapper: null, chairs: null,
  // (Tanker Row's depot: the tanks a little inside their round sides)
  depot_tank_huge: [29.6, 29.6, 20.2, 0], depot_tank_big: [24, 24, 17, 0], depot_tank_mid: [16.6, 16.6, 13.6, 0], depot_tank_small: [9.4, 9.4, 10.2, 0], depot_bullet: [18, 4.2, 5.4, 0],
  depot_office: [12, 4, 5.8, 0], depot_mast: [1.6, 1.6, 22, 0], depot_gate: null, depot_gantry: null, depot_pipes: null, depot_firepoint: null,
};
const STAND_IN = { excavator: '#f2b51c', cabin: '#e8ecef', sand: '#d8b56c', skip: '#e0761c', roller: '#f2b51c', pipes: '#a9a8a2', worksign: '#d42a2a', pylon: '#ddd2bd', billboard: '#2c3036',
  filmcrane: '#f07a1a', lights: '#f2b51c', trailer: '#f1f0ea', catering: '#f4c430', clocktower: '#d8c7a6', clapper: '#23262b', chairs: '#d94a3a' };

// `list`: [[kind, x, z, yaw]] (a model faces -z at yaw 0); the group of them
export function fixtures(city, list) {
  const group = new THREE.Group();
  for (const [kind, x, z, yaw = 0] of list) {
    const S = SOLID[kind], y = city.groundHeight(x, z, 1);
    let geo = sceneryGeo(kind);
    if (!geo) { const [w, d, h] = S || [0.8, 0.1, 1.8]; geo = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0); }
    const m = new THREE.Mesh(geo, geo.attributes.color ? MAT : new THREE.MeshLambertMaterial({ color: STAND_IN[kind] }));
    m.position.set(x, y, z);
    m.rotation.y = yaw;
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    if (!S) continue;
    const [w, d, h, back] = S, ca = Math.cos(yaw), sa = -Math.sin(yaw);
    const b = { x: x - back * sa, z: z + back * ca, w, d, ca, sa, top: y + h, h };
    const r = Math.hypot(w, d) / 2;
    city.addToGrid(b, b.x - r, b.x + r, b.z - r, b.z + r);
  }
  return group;
}
