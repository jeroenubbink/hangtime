// Mind the Gap's old bridge, its deck lifted out: the two steel trusses still standing either side of where your road
// went over, braced to each other high overhead, on a stone pier in the middle of the canal; a piece gone from the
// right-hand one's far span, and the floating crane beside it lifting that out; a little of the deck still on at the
// far end. You fly through between them. From the
// canalbridge kit (modelled in Blender, see assets/src/canalbridge.py), with plain stand-ins if it hasn't loaded.
import * as THREE from 'three';
import { merge, sceneryGeo } from '../scenery.js';
import { CURB } from './city.js';

const MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
const H = 8, P = 4.5, SPAN = 27, BRACE = 22;

// `R`: { x: the middle of the road, z0: the near bank's edge, z1: the pier's middle, z2: the far bank's edge (each span
// SPAN long), side: how far out either side the trusses stand, crane: { x } where the floating crane lies (its jib out
// to -x, over the gap) }. Solid: the trusses' sides (all their height, a car can't get between their steel), the
// piers, and the crane's pontoon and its house, afloat; the overhead steel and the jib, only the camera keeps out of.
export function ruin(city, R) {
  const group = new THREE.Group(), W = city.water;
  const put = (name, stand, x, y, z, yaw = 0) => {
    const m = new THREE.Mesh(sceneryGeo(name) || stand(), MAT);
    m.position.set(x, y, z);
    m.rotation.y = yaw;
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  };
  const box = (w, h, d, y = h / 2, colour = '#1f878c') => () => merge([[new THREE.BoxGeometry(w, h, d).translate(0, y, 0), colour]]);
  const solid = (x, z0, z1, w, floor, top) => {
    const b = { x, z: (z0 + z1) / 2, w, d: Math.abs(z1 - z0), ca: 1, sa: 0, floor, top, h: top - floor, pad: 1.5 };
    city.addToGrid(b, x - w / 2, x + w / 2, Math.min(z0, z1), Math.max(z0, z1));
  };
  const near = (R.z0 + R.z1) / 2, far = (R.z1 + R.z2) / 2;
  for (const s of [-1, 1]) {
    const x = R.x + s * R.side;
    // the near spans, whole; the far span on the left; on the right, its two ends torn off, the gap between
    put('bridge_truss', box(0.8, H, SPAN), x, CURB, near);
    solid(x, R.z0, R.z1, 1, CURB - 1.5, CURB + H);
    if (s < 0) { put('bridge_truss', box(0.8, H, SPAN), x, CURB, far); solid(x, R.z1, R.z2, 1, CURB - 1.5, CURB + H); }
    else {
      put('bridge_stub', box(0.8, H, 2 * P, 0, '#1f878c'), x, CURB, R.z1);
      put('bridge_stub', box(0.8, H, 2 * P), x, CURB, R.z2, Math.PI);
      solid(x, R.z1, R.z1 - 2 * P, 1, CURB - 1.5, CURB + H);
      solid(x, R.z2, R.z2 + 2 * P, 1, CURB - 1.5, CURB + H);
    }
    put('bridge_pier', box(3.2, 6, 4, -3.6, '#b9b1a0'), x, CURB, R.z1);
    solid(x, R.z1 - 3.2, R.z1 + 3.2, 3.6, W.floor, CURB - 0.5);
    city.screen({ x, z: (R.z0 + R.z2) / 2, w: 1.2, d: Math.abs(R.z0 - R.z2), floor: CURB - 1.5, top: CURB + H + 0.3, pad: 1, thin: true });
  }
  // what's left of the deck at the far end, a panel's length of it still on, level with the quay: solid, for one
  // just short to come down on
  put('bridge_deck', box(2 * R.side - 1, 0.6, P, -0.3, '#a9a59b'), R.x, CURB, R.z2);
  // (it's over the water, so it's ground there as a boat's deck is: afloat, as far as the city's concerned)
  const deck = { x: R.x, z: R.z2 + P / 2, w: 2 * R.side - 1, d: P, ca: 1, sa: 0, top: CURB };
  city.addToGrid(deck, deck.x - deck.w / 2, deck.x + deck.w / 2, R.z2, R.z2 + P);
  city.floats.push(deck);
  // overhead: the portal at each end, braces at the panel points between, where both tops are there to take them
  put('bridge_portal', box(BRACE, 1.6, 0.6, H - 0.8), R.x, CURB, R.z0 - P);
  put('bridge_portal', box(BRACE, 1.6, 0.6, H - 0.8), R.x, CURB, R.z2 + P, Math.PI);
  for (let z = R.z0 - 2 * P; z > R.z1 + 1; z -= P) put('bridge_brace', box(BRACE, 0.6, 0.5, H - 0.3), R.x, CURB, z);
  put('bridge_brace', box(BRACE, 0.6, 0.5, H - 0.3), R.x, CURB, R.z1 - P);
  city.screen({ x: R.x, z: (R.z0 + R.z2) / 2, w: BRACE + 1, d: Math.abs(R.z0 - R.z2), floor: CURB + H - 2.8, top: CURB + H + 0.6, pad: 1, thin: true });
  // the floating crane, lined up on the gap
  const C = R.crane, cz = (R.z1 + R.z2) / 2;
  put('bridge_crane', box(16, 3.8, 12, -0.6, '#d63a2f'), C.x, W.y, cz);
  for (const [dx, w, d, up] of [[0, 16, 12, 1.1], [3.5, 6, 5, 4.9]]) {
    const b = { x: C.x + dx, z: cz, w, d, ca: 1, sa: 0, top: W.y + up };
    city.addToGrid(b, b.x - w / 2, b.x + w / 2, cz - d / 2, cz + d / 2);
    city.floats.push(b);
  }
  // (its jib and what hangs off it, for the camera)
  city.screen({ x: C.x - 8, z: cz, w: 18, d: 4, floor: W.y + 2, top: W.y + 28, pad: 1, thin: true });
  city.screen({ x: C.x - 16, z: cz, w: 3, d: 10, floor: W.y + 4, top: W.y + 18, pad: 1 });
  return group;
}
