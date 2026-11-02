// Rushtime: a traffic-crash game on the shared car physics. Thread through traffic down a long run-up,
// building heat with near misses, oncoming lanes, drifts and air; then pick your moment and plough into a
// busy junction. Everything that's wrecked in the pile-up that follows counts, and so does how much heat
// you brought with you.
import * as THREE from 'three';
import { loadCarKits, kitScene, buildCarModel, paintOf, WHEELS, HULL } from '../car.js';
import { Sound } from '../audio.js';
import * as store from '../store.js';
import { createStage, TIMES } from '../derby/stage.js';
import { Puffs, Debris } from '../derby/fx.js';
import { Vehicle, contact, damageFrom, subdivide } from '../derby/vehicle.js';
import { loadSceneryKit } from '../scenery.js';
import { City, rng } from './city.js';
import { LEVELS } from './levels.js';
import { Traffic } from './traffic.js';
import { Props } from './props.js';
import { RIDES, TRAFFIC, TRAFFIC_PAINTS } from './roster.js';

const $ = id => document.getElementById(id);
const DEBRIS = { door: 'debris-door', doorWin: 'debris-door-window', bumper: 'debris-bumper', plate: 'debris-plate-a', plateB: 'debris-plate-b',
  plateS: 'debris-plate-small-a', spoiler: 'debris-spoiler-a', tyre: 'debris-tire' };
const files = new Set([...Object.values(RIDES), ...Object.values(TRAFFIC)].flatMap(d => [d.file, d.fallback].filter(Boolean)));
await Promise.all([
  ...[...files, ...Object.values(DEBRIS)].map(f => loadCarKits([f]).catch(() => console.info('No model', f))),
  loadSceneryKit().catch(e => console.warn('Scenery not loaded:', e)), loadSceneryKit('derby').catch(() => {}),
]);
$('loading').remove();

const DT = 1 / 120;
const clamp = THREE.MathUtils.clamp;
const NONE = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };
const KMH = 3.6;
const PRE_INTRO = 2.6, PRE_COUNT = 2.4, PRE_RETRY = 1.2, PRE_ALL = PRE_INTRO + PRE_COUNT;
const FRAGILE = 2.4;
const ZONE = 45;   // metres around where you crashed (and round the junction): whatever crashes in there is part of your crash
const CRASH_MAX = 30, CRASH_QUIET = 5, FOLLOW_YOU = 5, SHOT = 2.5;   // seconds

// ---------- Stage ----------
const stage = createStage($('view'));
const { scene, camera, renderer } = stage;
const sound = new Sound();
const smoke = new Puffs(scene, 1800, { soft: 0.15 });
const glow = new Puffs(scene, 1400, { additive: true, soft: 0.35 });

// ---------- Settings & records ----------
const settings = Object.assign({ level: 'cross', car: 'comet', time: 'day' }, store.load('rush.settings', {}));
const records = Object.assign({ best: {}, medals: {} }, store.load('rush.records', {}));
if (!LEVELS[settings.level]) settings.level = 'cross';
if (!RIDES[settings.car]) settings.car = 'comet';
if (!['day', 'sunset'].includes(settings.time)) settings.time = 'day';
const saveSettings = () => store.save('rush.settings', settings);

// ---------- World ----------
let city = null, props = null, traffic = null, debris = null, player = null;
let halves = [];
const G = { state: 'menu', t: 0, heat: 1, rush: 0.4, crash: null, score: 0, shown: 0, wrecked: 0, chain: 0, shake: 0, punch: 0, flash: 0 };
window.rush = G;

// A traffic car: built plain, and only cut into small triangles (so it can crumple) when first hit
class Car extends Vehicle {
  build() {
    if (!this.def.lazy) return super.build();
    const model = buildCarModel(this.paint, { file: this.def.file, len: this.def.size[1], lights: false });
    this.scene.add(model);
    return model;
  }
  soften() {
    if (this.soft || !this.def.lazy) return;
    this.soft = true;
    for (const m of this.model.userData.bodyMeshes) {
      const key = this.def.file + ':' + m.name;
      if (!soft.has(key)) soft.set(key, subdivide(m.geometry, 0.42));
      m.geometry.dispose();
      m.geometry = soft.get(key).clone();
      m.userData.orig = m.geometry.attributes.position.array.slice();
    }
  }
  // A wreck keeps its colours, scorched darker (not the derby's charcoal: a pile-up should stay colourful)
  wreck() {
    super.wreck();
    this.model.userData.paint.color.set('#7a7470');
  }
  dispose() {
    this.scene.remove(this.model);
    this.model.traverse(o => { o.geometry?.dispose(); for (const m of [o.material || []].flat()) m.dispose(); });
  }
}
const soft = new Map();
let nextId = 1;

// Buses and trucks get a collision shape their own size: a longer, wider, taller hull (and more spin
// inertia), and more spheres along their length for hitting other vehicles
const defs = {};
function trafficDef(kind) {
  if (defs[kind]) return defs[kind];
  const def = { ...TRAFFIC[kind] };
  const [w, l] = def.size;
  if (l > 6) {
    def.hull = HULL.map(h => ({ ...h, p: new THREE.Vector3(h.p.x * w / 1.9, h.p.y > 0 ? h.p.y * 2.2 : h.p.y, h.p.z * l / 4.3) }));
    def.inertia = (l / 4.3) ** 1.5;
  }
  return (defs[kind] = def);
}
function makeTraffic(kind) {
  const def = trafficDef(kind), R = G.rand;
  const paint = def.livery || TRAFFIC_PAINTS[Math.floor(R() * TRAFFIC_PAINTS.length)];
  const v = new Car(city, scene, nextId++, def, paint);
  v.kind = kind;
  v.value = def.value;
  const [w, l] = def.size;
  if (l > 6) v.spheres = [-1, -0.5, 0, 0.5, 1].map(k => k * (l / 2 - w / 2));
  v.gen = 0;
  v.colour = paintOf(paint);
  v.setLights(TIMES[settings.time].lamps);
  return v;
}

function loadLevel(key) {
  if (city?.level === LEVELS[key]) return;
  clearRun();
  city?.dispose();
  props?.dispose();
  city = new City(scene, LEVELS[key]);
  city.key = key;
  debris = new Debris(scene, (x, z) => city.groundHeight(x, z));
  stage.setTime(settings.time);
}

function clearRun() {
  if (traffic) for (const v of traffic.list.slice()) traffic.remove(v);
  traffic = null;
  if (player) { player.dispose(); player = null; }
  for (const h of halves) dropHalf(h);
  halves = [];
  debris?.clear();
  smoke.clear(); glow.clear();
  for (const s of scorches) dropMesh(s);
  scorches.length = 0;
  for (const r of rings) dropMesh(r.m);
  rings.length = 0;
}
// Take a one-off effect mesh out of the scene and free its geometry and material
function dropMesh(m) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
// A torn-off half: its triangles are its own (the material is its car's, freed with the car)
function dropHalf(h) { scene.remove(h.model); h.model.traverse(o => o.geometry?.dispose()); }

// Start (or restart) a run on the current level: `pre` seconds of intro and countdown before GO
function startRun(pre) {
  const L = city.level;
  clearRun();
  props?.dispose();
  props = new Props(scene, city, L.props || []);
  // Scripted: the same traffic every time, so a junction can be learned. The traffic always gets exactly
  // PRE_ALL seconds of driving before GO, however much of the intro you watch.
  G.rand = rng(L.seed * 7919 + 17);
  traffic = new Traffic(city, L, kind => makeTraffic(kind), G.rand);
  traffic.populate({ ...L, specials: (L.specials || []).map(s => ({ ...s, eta: s.eta + PRE_ALL })) });
  const def = RIDES[settings.car];
  player = new Car(city, scene, 0, def, def.livery, { player: true, name: 'You' });
  player.gen = 0;
  player.kind = 'you';
  player.colour = paintOf(def.livery);
  player.setLights(TIMES[settings.time].lamps);
  player.respawn({ x: L.start.x, z: L.start.z, yaw: 0 });
  for (let i = 0; i < 60; i++) player.car.step(DT, { ...NONE, brake: 1, stop: true });
  Object.assign(G, { t: 0, pre, heat: 1, rush: 0.4, crash: null, score: 0, shown: 0, wrecked: 0, chain: 0, shake: 0, punch: 0, flash: 0,
    boosting: false, drifting: false, steer: 0, yaw: 0, drift: 0, geysers: [], air: 0, nearT: 0, oncoming: 0, best: 0, ended: false, slow: 1, spike: 0 });
  G.state = pre > PRE_COUNT ? 'intro' : 'count';
  G.preSteps = Math.round(PRE_ALL * 120);
  skipTo(pre);
  cam.mode = G.state;
  cam.t = 0;
  cam.dir.set(0, 0, -1);
  $('hud').classList.remove('hidden');
  $('crashbox').classList.add('hidden');
  $('callouts').innerHTML = '';
  showScreen(null);
  sound.init();
  if (G.state === 'intro') showMsg(L.name.toUpperCase(), L.blurb, PRE_INTRO);
}

// ---------- Effects ----------
const debrisCache = {};
const PAINTED = new Set(['door', 'doorWin', 'plate', 'plateB', 'plateS', 'spoiler']);
function debrisMesh(name, colour) {
  const file = DEBRIS[name];
  if (!debrisCache[file]) {
    const src = kitScene(file);
    let geo = null, map = null;
    src?.traverse(o => { if (o.isMesh && !geo) { geo = o.geometry.clone().scale(1.15, 1.15, 1.15); map = o.material.map; } });
    if (!geo) return null;
    geo.computeBoundingBox();
    const c = geo.boundingBox.getCenter(new THREE.Vector3());
    geo.translate(-c.x, -c.y, -c.z);
    geo.userData.shared = true;
    debrisCache[file] = { geo, mat: new THREE.MeshStandardMaterial({ map, roughness: 0.6 }), mats: {} };
  }
  const d = debrisCache[file];
  // Body panels take the car's paint (one material per colour, shared by every piece)
  let mat = d.mat;
  if (colour && PAINTED.has(name)) mat = d.mats[colour] || (d.mats[colour] = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.45, metalness: 0.25 }));
  const m = new THREE.Mesh(d.geo, mat);
  m.castShadow = true;
  const g = new THREE.Group();
  g.add(m);
  return g;
}
function fling(name, colour, pos, vel, opts = {}) {
  const m = debrisMesh(name, colour);
  if (m) debris.add(m, pos, vel, { radius: 0.18, ...opts });
}
function sparks(p, n, speed = 9) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, u = Math.random();
    glow.emit(p.x, p.y, p.z, Math.cos(a) * speed * u, 2 + Math.random() * speed * 0.6, Math.sin(a) * speed * u,
      { life: 0.3 + Math.random() * 0.4, size: 0.12 + Math.random() * 0.1, gravity: 14, colour: ['#ffd27a', '#ffb02e', '#fff3c0'][i % 3], alpha: 1 });
  }
}
function puff(p, colour, size, life, rise = 1.5, alpha = 0.55, spread = 0.6) {
  smoke.emit(p.x + (Math.random() - 0.5) * spread, p.y, p.z + (Math.random() - 0.5) * spread, (Math.random() - 0.5) * 1.2, rise, (Math.random() - 0.5) * 1.2,
    { life, size, grow: 0.7, drag: 0.6, colour, alpha });
}
function flame(p, size = 1) {
  glow.emit(p.x + (Math.random() - 0.5) * 0.6, p.y + 0.3, p.z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5), 2 + Math.random() * 2, (Math.random() - 0.5),
    { life: 0.35 + Math.random() * 0.3, size: size * (0.6 + Math.random() * 0.5), grow: -1.2, drag: 1, colour: Math.random() < 0.5 ? '#ff8a2e' : '#ffd060', alpha: 0.9 });
}
function glassBurst(p, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, u = 2 + Math.random() * 5;
    glow.emit(p.x, p.y + 0.4, p.z, Math.cos(a) * u, 2 + Math.random() * 4, Math.sin(a) * u,
      { life: 0.5 + Math.random() * 0.6, size: 0.07 + Math.random() * 0.07, gravity: 15, colour: i % 3 ? '#cfefff' : '#ffffff', alpha: 0.9 });
  }
}
const scorches = [];
const scorchTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grd.addColorStop(0, 'rgba(20,16,14,0.85)'); grd.addColorStop(1, 'rgba(20,16,14,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
function scorch(p, size) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: scorchTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
  m.position.set(p.x, city.groundHeight(p.x, p.z) + 0.03, p.z);
  scene.add(m);
  scorches.push(m);
  if (scorches.length > 20) dropMesh(scorches.shift());
}
const rings = [];
function ring(p, colour, opts = {}) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: colour, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  m.position.copy(p);
  scene.add(m);
  rings.push({ m, t: 0, grow: opts.grow || 26, life: opts.life || 0.5, alpha: opts.alpha || 0.8 });
}
// The shock wave on the road: a pale ring spreading at 35 m/s out to its reach
function wave(p, R) {
  ring(new THREE.Vector3(p.x, city.groundHeight(p.x, p.z) + 0.08, p.z), '#fff6dc', { grow: 35, life: R / 35, alpha: 0.35 });
}
function explosion(p, big = 1) {
  for (let i = 0; i < 50 * big; i++) {
    const a = Math.random() * Math.PI * 2, u = Math.random() * 9 * big;
    glow.emit(p.x, p.y + 0.5, p.z, Math.cos(a) * u, 2 + Math.random() * 8, Math.sin(a) * u,
      { life: 0.5 + Math.random() * 0.6, size: 1.2 + Math.random() * 1.6 * big, grow: -0.8, drag: 2, colour: ['#ffb02e', '#ff5a1f', '#ffe36e'][i % 3], alpha: 0.95 });
  }
  for (let i = 0; i < 30 * big; i++) puff(p, ['#2a2622', '#3a3632', '#1e1c1a'][i % 3], 2 + Math.random() * 2 * big, 3 + Math.random() * 2, 2 + Math.random() * 4, 0.7, 3 * big);
  sparks(p, 40 * big, 16);
  for (let i = 0; i < 24 * big; i++) {
    glow.emit(p.x + (Math.random() - 0.5), p.y + 0.5, p.z + (Math.random() - 0.5), (Math.random() - 0.5) * 2, 7 + Math.random() * 8, (Math.random() - 0.5) * 2,
      { life: 0.7 + Math.random() * 0.6, size: 2 + Math.random() * 2 * big, grow: -0.6, drag: 2.5, colour: i % 2 ? '#ff7a1a' : '#ffd27a', alpha: 0.9 });
  }
  glow.emit(p.x, p.y + 1.5, p.z, 0, 0, 0, { life: 0.2, size: 11 * big, grow: 1.5, colour: '#ffe0a0', alpha: 0.85 });
  ring(p.clone().setY(p.y + 0.3), '#ffb02e');
  scorch(p, 5 + 3 * big);
}
function splash(p, n = 40) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, u = Math.random() * 5;
    smoke.emit(p.x, city.water.y, p.z, Math.cos(a) * u, 4 + Math.random() * 7, Math.sin(a) * u,
      { life: 0.9 + Math.random() * 0.6, size: 0.5 + Math.random() * 0.8, grow: 0.8, gravity: 9, colour: '#e8f6ff', alpha: 0.8 });
  }
  ring(new THREE.Vector3(p.x, city.water.y + 0.05, p.z), '#ffffff');
}

// ---------- Scoring ----------
// Damage to anything the crash has reached scores, more the further down the chain it is
const chainK = gen => Math.min(3, 1 + 0.15 * (gen - 1));
function scoreEvent(v, pts, label, big = false) {
  if (G.state !== 'crash' || G.ended || !v || v.player || !(v.gen > 0)) return;
  const p = Math.round(pts * chainK(v.gen));
  if (p <= 0) return;
  G.score += p;
  G.crash.quiet = 0;
  if (label) callout(`${label}<small>+${p.toLocaleString()}</small>`, big ? 'big' : '');
}
function spike(k = 0.25, secs = 0.7) { G.spike = Math.max(G.spike, secs); G.spikeK = k; }

// A crash sends a shock through the traffic around it: it travels out at 35 m/s, fading with distance, and
// whoever it reaches flinches, harder the closer they were
function startle(p, power) {
  const R = Math.min(45, 12 + power * 0.5);
  for (const v of traffic.list) {
    if (!v.driver || v.driver.out) continue;
    const d = Math.hypot(v.car.pos.x - p.x, v.car.pos.z - p.z);
    if (d > R || d < 1.5) continue;
    v.driver.startle(d / 35, (1 - d / R) ** 2 * Math.min(1, power / 30));
  }
  if (power > 15) wave(p, R);
}

// ---------- Damage ----------
const _kick = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _w = new THREE.Vector3(), _pv = new THREE.Vector3();
function hurt(X, by, dmg, point, n) {
  if (dmg <= 0.5 || X.half) return;
  X.soften?.();
  // Traffic is built for show, not for the derby: it crumples
  dmg *= (X.def.armour || 1) * (X.player ? 1 : FRAGILE);
  const was = X.hp;
  X.hp -= dmg;
  X.flashT = 0.12;
  const lp = X.localPoint(point).clone();
  const zone = X.zoneOf(lp);
  const ln = n.clone().applyQuaternion(X.car.q.clone().invert());
  X.dent(lp, ln, dmg);
  if (dmg > 8) glassBurst(point, Math.min(36, dmg));
  // Bits fly off
  const vel = X.car.vel.clone().addScaledVector(n, -(4 + dmg * 0.15)).add(new THREE.Vector3(0, 3 + dmg * 0.1, 0));
  if (zone === 'rear' && dmg > 10) { const p = X.losePart('spoiler'); if (p) debris.add(p.mesh, p.pos, vel, { radius: 0.2 }); }
  if (zone === 'front' && dmg > 10) { const p = X.losePart('grill'); if (p) debris.add(p.mesh, p.pos, vel, { radius: 0.2 }); }
  const side = zone === 'left' || zone === 'right';
  if (side && dmg > 12 && !X.lostParts.has('door-' + zone)) { X.lostParts.add('door-' + zone); fling(Math.random() < 0.5 ? 'door' : 'doorWin', X.colour, point, vel); }
  else if (!side && dmg > 14 && !X.lostParts.has('bumper-' + zone)) { X.lostParts.add('bumper-' + zone); fling('bumper', null, point, vel); }
  if (dmg > 8) for (let k = 0; k < Math.min(4, Math.floor(dmg / 9)); k++) fling(['plate', 'plateB', 'plateS'][k % 3], X.colour, point, vel.clone().add(new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5)), { life: 12 });
  // Arcade hits: a solid one throws the car up and twists it
  if (dmg > 7) {
    const k = Math.min(1, (dmg - 7) / 35);
    X.car.vel.y = Math.min(X.car.vel.y + 1.5 + 4.5 * k, 10);
    X.car.w.addScaledVector(_kick.crossVectors(_up, n), 2.6 * k);
  }
  // Wheels near the hit come off
  WHEELS.forEach((W, i) => {
    if (X.car.wheels[i].lost || Math.hypot(lp.x - W.p.x, lp.z - W.p.z) > 1.4) return;
    X.wheelHp[i] -= dmg / (side ? 22 : 36);
    if (X.wheelHp[i] > 0) return;
    const w = X.loseWheel(i);
    if (w) debris.add(w.mesh, w.pos, X.car.vel.clone().addScaledVector(n, -5).add(new THREE.Vector3(0, 4, 0)), { radius: 0.42, roll: w.roll, life: 16 });
  });
  if (X.player) {
    G.flash = Math.min(1, dmg / 30);
    return;
  }
  if (X.driver && dmg > 4) X.driver.out = true;
  scoreEvent(X, Math.min(dmg, Math.max(0, was)) * 10 * X.value, null);
  if (X.hp <= 0 && X.alive) wreck(X, side && dmg >= 30);
}

function wreck(X, split) {
  X.diedAt = G.t;
  if (split && X.def.size[1] < 6) {
    halves.push(...X.split().map(h => Object.assign(h, { gen: X.gen })));
    X.halved = true;
    while (halves.length > 10) dropHalf(halves.shift());
  } else X.wreck();
  if (X.gen > 0 && G.state === 'crash') G.wrecked++;
  scoreEvent(X, 500 * X.value, split ? 'TORN IN HALF' : X.special ? X.kind.toUpperCase() + ' DOWN' : 'WRECKED', !!X.special);
  sound.crunch(1);
  // Some go up in flames a moment later; a tanker always does
  if (X.def.explosive) X.boomT = 0.25;
  else if (G.rand() < 0.3) X.boomT = 1.5 + G.rand() * 3;
}

// Fire and fury: everything nearby is thrown clear, and hurt
function blowUp(X) {
  X.boomT = null;
  X.blown = true;
  const p = X.car.pos.clone(), big = X.def.explosive ? 2 : 1, R = 8 * big;
  explosion(p, big);
  sound.boom(Math.min(1, 0.6 * big));
  X.car.vel.y += 7;
  X.car.w.add(_kick.set(G.rand() - 0.5, 0, G.rand() - 0.5).multiplyScalar(4));
  scoreEvent(X, 1500 * X.value, X.def.explosive ? 'TANKER BLAST' : 'BLAST', true);
  for (const B of bodies()) {
    if (B === X) continue;
    const d = B.car.pos.distanceTo(p);
    if (d > R) continue;
    const k = 1 - d / R;
    const dir = B.car.pos.clone().sub(p).setY(0).normalize();
    B.car.vel.addScaledVector(dir, 14 * k * big).add(_kick.set(0, 5 + 6 * k * big, 0));
    B.car.w.add(_kick.set(G.rand() - 0.5, G.rand() - 0.5, G.rand() - 0.5).multiplyScalar(5 * k));
    if (!B.half) {
      if (!B.gen && X.gen) B.gen = X.gen + 1;
      G.chain = Math.max(G.chain, B.gen || 0);
      if (B.asleep) B.asleep = false;
      hurt(B, X, 40 * k * big, B.car.pos.clone().addScaledVector(dir, -1), dir);
    }
  }
  startle(p, 70);
  if (G.crash) spike(0.2, 1.1);
  G.shake = Math.max(G.shake, player && player.car.pos.distanceTo(p) < 40 ? 1 : 0.4);
}

// The crash zone: around where you crashed, and the junction
function inZone(p) {
  const O = G.crash.origin, [jx, jz] = city.level.junction;
  return Math.hypot(p.x - O.x, p.z - O.z) < ZONE || Math.hypot(p.x - jx, p.z - jz) < ZONE;
}

// Two bodies met (normal from B to A)
function collided(A, B, h) {
  const base = damageFrom(h.j);
  if (h.speed > 2.5 && (base > 0 || h.speed > 5)) {
    sparks(h.point, Math.min(70, 6 + Math.round(base * 2)), 9 + Math.min(10, base * 0.3));
    const near = camera.position.distanceTo(h.point) < 40;
    if (near || base > 15) sound.crunch(Math.min(1, (base + 3) / 30) * (near ? 1 : 0.5));
    if (base > 18) sound.glass();
  }
  const va = A.half ? null : A, vb = B.half ? null : B;
  for (const v of [va, vb]) if (v) { v.touched = true; v.touchT = G.t; }
  // You into something
  if ((A === player || B === player) && G.state === 'run') {
    const other = A === player ? B : A;
    if (h.speed > 13 || base > 20) startCrash(h, other);
    else {
      // A scrape: sparks and a jolt, and you carry on
      G.shake = Math.max(G.shake, Math.min(0.6, h.speed * 0.05));
      if (!other.half && !other.gen) other.gen = 1;
      if (other.driver) other.driver.out = other.driver.out || base > 4;
      return;
    }
  }
  // The chain: whatever the crash has reached passes it on
  // (you start it, generation 0; whatever you hit is 1, what that hits is 2, and so on; halves carry theirs)
  const src = b => (b === player ? (G.crash ? 0 : null) : b.gen > 0 ? b.gen : null);
  const sa = src(A), sb = src(B);
  if (vb && vb !== player && !vb.gen && sa != null) vb.gen = sa + 1;
  if (va && va !== player && !va.gen && sb != null) va.gen = sb + 1;
  G.chain = Math.max(G.chain, va?.gen || 0, vb?.gen || 0);
  // ...and anything that crashes in the crash zone around where you hit is part of it too
  if (G.crash && base > 2 && va !== player && vb !== player && inZone(h.point)) {
    for (const v of [va, vb]) if (v && !v.gen) v.gen = 1;
  }
  if (base > 6) startle(h.point, base);
  if (G.crash && base > 35 && G.t - (G.crash.lastSpike || 0) > 1.2) { G.crash.lastSpike = G.t; spike(0.3, 0.6); }
  if (base <= 0) return;
  if (va && vb) {
    const kA = h.sa > h.sb + 1.5 ? 0.7 : h.sb > h.sa + 1.5 ? 1.15 : 1;
    const kB = h.sb > h.sa + 1.5 ? 0.7 : h.sa > h.sb + 1.5 ? 1.15 : 1;
    hurt(va, vb, base * kA * (vb.def.mass / va.def.mass) ** 0.35, h.point, h.normal);
    hurt(vb, va, base * kB * (va.def.mass / vb.def.mass) ** 0.35, h.point, h.normal.clone().negate());
  } else {
    if (va) hurt(va, null, base * 0.8, h.point, h.normal);
    if (vb) hurt(vb, null, base * 0.8, h.point, h.normal.clone().negate());
  }
}

function wallHit(v, w) {
  const dmg = damageFrom(w.impulse) * 0.6;
  if (v === player && G.state === 'run' && w.speed > 14) startCrash({ point: w.point, speed: w.speed, normal: w.normal }, null);
  if (w.speed > 4) { sparks(w.point, Math.min(30, 3 + dmg)); if (camera.position.distanceTo(w.point) < 40) sound.crunch(Math.min(1, dmg / 25)); }
  // (the city hands back the wall's normal pointing out of the wall, into the car: the way hurt() wants it)
  if (dmg > 0.5) hurt(v, null, dmg, w.point, w.normal);
}

// ---------- The crash ----------
function startCrash(h, other) {
  if (G.state !== 'run') return;
  const kmh = Math.round(player.car.vel.length() * KMH);
  G.state = 'crash';
  const bonus = clamp((kmh - 110) / 110, 0, 1.5);
  G.impact = { kmh, bonus };
  G.heat = Math.round((G.heat + bonus) * 10) / 10;
  G.crash = { t: 0, rt: 0, quiet: 0, focus: h.point.clone(), origin: h.point.clone(), subject: player, side: 1, ang: 0, dist: 13, cutT: 0, lastSpike: G.t };
  // Start the camera low beside the impact, looking across the way you came in
  const f = player.forward.clone().setY(0).normalize();
  G.crash.ang = Math.atan2(-f.x, -f.z) + (Math.random() < 0.5 ? 1 : -1) * (0.9 + Math.random() * 0.5);
  if (other && !other.half && !other.gen) other.gen = 1;
  G.chain = Math.max(G.chain, 1);
  // Off the throttle and out of the drift: no more exhaust flame or tyre smoke from your wreck
  G.boosting = false;
  player.boosting = false;
  G.drifting = false;
  spike(0.12, 1.6);
  G.shake = 1.2;
  G.punch = 10;
  sound.crash();
  callout(`IMPACT ${kmh} km/h${bonus > 0 ? `<small>heat +${bonus.toFixed(1)}</small>` : ''}`, 'big');
  $('crashbox').classList.remove('hidden');
}

function endCrash() {
  G.ended = true;
  G.state = 'results';
  const L = city.level, key = city.key;
  const total = Math.round(G.score * G.heat);
  const medal = L.medals.reduce((m, t, i) => (total >= t ? i + 1 : m), 0);
  const before = records.best[key] || 0;
  if (total > before) records.best[key] = total;
  if (medal > (records.medals[key] || 0)) records.medals[key] = medal;
  store.save('rush.records', records);
  $('res-title').textContent = medal ? ['', 'BRONZE', 'SILVER', 'GOLD'][medal] : 'NO MEDAL';
  $('res-title').className = ['none', 'bronze', 'silver', 'gold'][medal];
  $('res-rows').innerHTML = [
    ['Carnage', G.score.toLocaleString()],
    ['Heat', '×' + G.heat.toFixed(1) + (G.impact?.bonus ? ` <small>(impact ${G.impact.kmh} km/h)</small>` : '')],
    ['Wrecked', G.wrecked],
    ['Longest chain', G.chain],
    ['<b>Total</b>', `<b>${total.toLocaleString()}</b>`],
  ].map(([a, b]) => `<tr><td>${a}</td><td class="num">${b}</td></tr>`).join('');
  const next = L.medals.find(t => t > total);
  $('res-note').textContent = total > before && before ? `New best (was ${before.toLocaleString()})!` : next ? `${next.toLocaleString()} for ${['bronze', 'silver', 'gold'][L.medals.indexOf(next)]}.` : 'Gold. Nothing left but a higher score.';
  const keys = Object.keys(LEVELS), i = keys.indexOf(key);
  $('btn-next').classList.toggle('hidden', i === keys.length - 1);
  setTimeout(() => { if (G.state === 'results') showScreen('results'); }, 600);
}

// ---------- Fixed step ----------
const playerInput = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };
function bodies() {
  const out = [];
  if (player && G.state !== 'intro' && G.state !== 'count') out.push(player);
  for (const v of traffic.list) if (!v.asleep && !v.halved) out.push(v);
  for (const h of halves) out.push(h);
  return out;
}

// Your car. The shared physics does the suspension, the bumps and the crashes; on top of it the car turns
// at a rate you set with the stick, keeps grip (or slides, in a drift), and accelerates and brakes like an
// arcade car, so it goes exactly where you point it, even at 280 km/h.
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _v = new THREE.Vector3();
function drive(dt) {
  const v = player, c = v.car, def = v.def, I = playerInput;
  // Steering: quick to turn in, quicker to let go, so taps make small corrections
  const want = I.steer;
  const rate = Math.abs(want) > Math.abs(G.steer) && Math.sign(want) === Math.sign(G.steer || want) ? 7 : 12;
  G.steer += clamp(want - G.steer, -rate * dt, rate * dt);
  const boosting = I.boost && G.rush > 0.01 && I.throttle > 0;
  if (boosting && !G.boosting) { G.punch = Math.max(G.punch, 6); sound.boom(0.25); }
  G.boosting = boosting;
  v.boosting = boosting;
  if (boosting) G.rush = Math.max(0, G.rush - dt * 0.13);
  // Speeds along and across the car before the physics step: the step adds suspension, bumps and walls,
  // and this model then sets how the car moves over the ground
  // (along the car's own axes, so it follows the road over hills and crests)
  _f.set(0, 0, -1).applyQuaternion(c.q);
  _r.set(1, 0, 0).applyQuaternion(c.q);
  const slope = _f.y;
  let vF = c.vel.dot(_f), vS = c.vel.dot(_r);
  c.step(dt, { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false });
  c.steer = G.steer * (0.5 - 0.35 * Math.min(1, Math.abs(vF) / 50));    // the front wheels, for show
  if (c.wallHit) return;               // hit a building: the physics has it this step
  if (c.grounded < 2) {
    // In the air: a little yaw from the stick, nothing else
    G.air += dt;
    c.w.y += (-G.steer * 1.1 - c.w.y) * Math.min(1, dt * 2);
    G.yaw = c.w.y;
    return;
  }
  if (G.air > 0.45) { callout(`AIR ${G.air.toFixed(1)}s<small>heat +${(G.air * 0.15).toFixed(1)}</small>`); G.heat = Math.min(4, G.heat + G.air * 0.15); G.rush = Math.min(1, G.rush + G.air * 0.15); }
  G.air = 0;
  const sp = Math.abs(vF);
  // Engine and brakes
  const top = boosting ? def.rushTop : def.top;
  let a = 0;
  if (I.brake > 0 && vF > 1) a = -def.brake * I.brake;
  else if (I.brake > 0) a = -9 * I.brake * (vF > -14 ? 1 : 0);
  else if (I.throttle > 0) a = vF < top ? def.accel * I.throttle * Math.max(0.12, 1 - (vF / top) ** 2) + (boosting ? 6 : 0) : -3;
  else a = -2 - 0.0004 * vF * vF;
  if (vF > top && I.throttle > 0) a = Math.min(a, -4);
  a -= 9.81 * slope;                    // downhill helps
  vF += a * dt;
  if (!I.throttle && !I.brake && Math.abs(vF) < 0.3) vF = 0;
  // Drift: the handbrake (or braking into a turn at speed) lets the tail go; grip comes back as you let off
  const drifting = sp > 14 && (I.handbrake || (I.brake > 0 && Math.abs(G.steer) > 0.5 && sp > 25));
  G.drift = drifting ? 1 : Math.max(0, G.drift - dt * 2.5);
  // Turn rate: as much as the tyres allow at this speed, more in a drift
  const yawMax = clamp(def.lat / Math.max(sp, 1), 0.38, 2.4) * Math.min(1, sp / 5) * (1 + 0.6 * G.drift);
  const yaw = -G.steer * yawMax * Math.sign(vF || 1);
  G.yaw += (yaw - G.yaw) * Math.min(1, dt * (drifting ? 8 : 16));
  _v.set(0, 1, 0).applyQuaternion(c.q);
  c.w.addScaledVector(_v, G.yaw - c.w.dot(_v));
  const grip = 12 - 9.5 * G.drift;
  vS *= Math.exp(-grip * dt);
  if (drifting) vF -= Math.sign(vF) * 3 * dt;
  // Replace the velocity along the ground; keep what the suspension is doing (along the car's up)
  _f.set(0, 0, -1).applyQuaternion(c.q);
  _r.set(1, 0, 0).applyQuaternion(c.q);
  const vU = c.vel.dot(_v);
  c.vel.copy(_f).multiplyScalar(vF).addScaledVector(_r, vS).addScaledVector(_v, vU);
  // Keep it on its wheels: lean back against any roll the cornering puts in
  c.w.addScaledVector(_f, -(_r.y) * 30 * dt);
  // Heat and rush from driving on the edge
  if (Math.abs(vS) > 4 && sp > 15) { G.rush = Math.min(1, G.rush + dt * 0.14); G.heat = Math.min(4, G.heat + dt * 0.04); G.drifting = true; }
  else G.drifting = false;
  if (G.oncoming && sp > 25) { G.rush = Math.min(1, G.rush + dt * 0.12); G.heat = Math.min(4, G.heat + dt * 0.05); }
}

// Which side of the road you're on: in a lane whose traffic comes toward you
function oncoming() {
  const p = player.car.pos;
  _f.set(0, 0, -1).applyQuaternion(player.car.q);
  for (const L of traffic.lanes) {
    if (L.spawn) continue;
    if (Math.abs(L.lateral(p)) < 1.9 && L.dx * _f.x + L.dz * _f.z < -0.6) { const s = L.progress(p); if (s > 0 && s < L.len) return true; }
  }
  return false;
}

// Passing close at speed
function nearMisses() {
  const c = player.car;
  _f.set(0, 0, -1).applyQuaternion(c.q).setY(0).normalize();
  _r.set(-_f.z, 0, _f.x);
  for (const v of traffic.list) {
    if (v.asleep) continue;
    const dx = v.car.pos.x - c.pos.x, dz = v.car.pos.z - c.pos.z;
    const along = dx * _f.x + dz * _f.z, lat = dx * _r.x + dz * _r.z;
    const prev = v.nm;
    v.nm = along;
    if (prev == null || !(prev > 0 && along <= 0)) continue;
    const gap = Math.abs(lat) - v.r - player.r;
    const rel = _v.subVectors(c.vel, v.car.vel).length();
    if (gap > 1.4 || rel < 12 || G.t - (v.touchT ?? -9) < 1 || G.t - (player.touchT ?? -9) < 0.5) continue;
    const toward = v.car.vel.dot(_f) < -3;
    const close = gap < 0.6;
    const h = (toward ? 0.2 : 0.1) * (close ? 1.5 : 1);
    G.heat = Math.min(4, G.heat + h);
    G.rush = Math.min(1, G.rush + (toward ? 0.22 : 0.14));
    callout(`${close ? 'SHAVE' : 'NEAR MISS'}${toward ? ' · ONCOMING' : ''}<small>heat +${h.toFixed(2)}</small>`, toward ? 'hot' : '');
    sound.burst(0.25, 1400, 0.45);
  }
}

function water(v) {
  const W = city.water;
  if (!W) return;
  const c = v.car;
  if (!W.below(c.pos.x, c.pos.z) || c.pos.y > W.y + 0.4) return;
  if (!v.wet) {
    v.wet = true;
    splash(c.pos, 30 + Math.min(40, c.vel.length() * 3));
    sound.splash();
    if (v === player && G.state === 'run') startCrash({ point: c.pos.clone(), speed: c.vel.length() }, null);
    else if (!v.half) { scoreEvent(v, 900 * v.value, 'SPLASHDOWN', true); if (v.driver) v.driver.out = true; }
  }
  c.vel.multiplyScalar(Math.exp(-2.2 * DT));
  c.vel.y += 7 * DT;
  c.w.multiplyScalar(Math.exp(-2 * DT));
}

// Run the traffic ahead (no drawing) until GO is `secs` away
function skipTo(secs) {
  while (G.preSteps > Math.round(secs * 120)) step();
  G.pre = G.preSteps / 120;
}
function go() {
  G.state = 'run';
  player.car.vel.copy(player.forward).multiplyScalar(city.level.start.speed);
  showMsg('GO!', '', 0.8);
  sound.beep(true);
}

function step() {
  G.t += DT;
  if ((G.state === 'intro' || G.state === 'count') && --G.preSteps <= 0) go();
  const running = G.state === 'run' || G.state === 'crash' || G.state === 'results';
  const c = player.car;
  const fwd = player.forward;
  const focus = G.crash ? { x: G.crash.origin.x, z: G.crash.origin.z, dx: 0, dz: 0 } : { x: c.pos.x, z: c.pos.z, dx: fwd.x, dz: fwd.z };
  const B = bodies();
  traffic.update(DT, focus, [...B, ...traffic.list.filter(v => v.asleep)], true, G.crash ? G.crash.t : null);
  if (G.state === 'run') drive(DT);
  else if (running) {
    // Aftertouch: a few seconds to steer your wreck into more trouble
    if (G.crash && G.crash.t < 3.5 && playerInput.steer) {
      _r.setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
      c.vel.addScaledVector(_r, playerInput.steer * 9 * DT);
    }
    c.step(DT, NONE);
  }
  {
    for (const v of traffic.list) {
      if (v.asleep || v.halved) continue;
      v.car.wallHit = null;
      v.car.step(DT, v.wrecked || !v.alive ? NONE : v.input || NONE);
      if (v.car.wallHit) wallHit(v, v.car.wallHit);
      water(v);
      if (v.boomT != null && (v.boomT -= DT) <= 0) blowUp(v);
    }
    if (running && c.wallHit) { wallHit(player, c.wallHit); c.wallHit = null; }
    if (running) water(player);
    for (const h of halves) { h.car.step(DT, NONE); water(h); }
    const all = bodies();
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      // Until you crash the traffic is scripted: it doesn't crash into itself (unless you've had a go at it)
      if (!G.crash && !all[i].player && !all[j].player && !all[i].gen && !all[j].gen) continue;
      const h = contact(all[i], all[j]);
      if (h) collided(all[i], all[j], h);
    }
    for (const k of props.update(all.filter(b => !b.half))) {
      const pc = props.piece(k.prop);
      debris.add(pc.mesh, pc.pos, k.vel, { radius: pc.radius, spin: 7, life: 14 });
      sound.thud(4);
      sparks(pc.pos, 8);
      if (k.prop.kind === 'hydrant') G.geysers.push({ p: new THREE.Vector3(k.prop.x, k.prop.y, k.prop.z), t: 7 });
      if (k.vehicle === player && G.state === 'run') G.shake = Math.max(G.shake, 0.35);
      if (G.state === 'crash' && (k.vehicle.gen > 0 || k.vehicle === player)) { G.score += 30; G.crash.quiet = 0; }
    }
    if (G.state === 'run') {
      G.oncoming = oncoming();
      nearMisses();
      if (new THREE.Vector3(0, 1, 0).applyQuaternion(c.q).y < 0.2) startCrash({ point: c.pos.clone(), speed: c.vel.length() }, null);
    }
  }
  if (G.crash && !G.ended) {
    const C = G.crash;
    C.t += DT;
    C.quiet += DT;
    // Traffic keeps piling in while there's anything to hit it; after CALM (25 s) the drivers start stopping in
    // time, and at 30 it's over whatever's still flying. Five quiet seconds end it sooner.
    if (C.quiet > CRASH_QUIET || C.t > CRASH_MAX) endCrash();
  }
}

// ---------- Input ----------
const keys = new Set();
window.addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  sound.init();
  if (e.repeat) return;
  if (e.code === 'KeyR' && city && G.state !== 'menu') startRun(PRE_RETRY);
  if (e.code === 'Escape') { if (G.state === 'paused') resume(); else if (['run', 'crash', 'count', 'intro'].includes(G.state)) pause(); }
  if (e.code === 'KeyM') sound.setMuted(!sound.muted);
  if (G.state === 'intro' && ['Space', 'Enter', 'ArrowUp', 'KeyW'].includes(e.code)) { skipTo(PRE_COUNT); G.state = 'count'; }
  if (G.state === 'results' && e.code === 'Enter') startRun(PRE_RETRY);
  if (G.state === 'crash' && e.code === 'Enter' && G.crash.t > 2) endCrash();
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
function readInput() {
  const k = c => keys.has(c);
  let throttle = k('ArrowUp') || k('KeyW') ? 1 : 0;
  let brake = k('ArrowDown') || k('KeyS') ? 1 : 0;
  let steer = (k('ArrowRight') || k('KeyD') ? 1 : 0) - (k('ArrowLeft') || k('KeyA') ? 1 : 0);
  let handbrake = k('Space');
  let boost = k('ShiftLeft') || k('ShiftRight') || k('KeyN');
  const pad = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
  if (pad) {
    const ax = pad.axes[0] || 0;
    if (Math.abs(ax) > 0.1) steer = Math.sign(ax) * ((Math.abs(ax) - 0.1) / 0.9) ** 1.4;
    throttle = Math.max(throttle, pad.buttons[7]?.value || 0, pad.buttons[0]?.pressed ? 1 : 0);
    brake = Math.max(brake, pad.buttons[6]?.value || 0);
    handbrake = handbrake || !!pad.buttons[2]?.pressed;
    boost = boost || !!pad.buttons[1]?.pressed || !!pad.buttons[5]?.pressed;
    if (pad.buttons[9]?.pressed && !G.padStart) { if (G.state === 'results') startRun(PRE_RETRY); }
    G.padStart = !!pad.buttons[9]?.pressed;
    if (pad.buttons[3]?.pressed && !G.padY && G.state !== 'menu') startRun(PRE_RETRY);
    G.padY = !!pad.buttons[3]?.pressed;
  }
  Object.assign(playerInput, { throttle, brake, steer, handbrake, boost });
}
for (const b of document.querySelectorAll('#touch button')) {
  const key = b.dataset.key, tap = b.dataset.tap;
  b.addEventListener('pointerdown', e => {
    e.preventDefault();
    sound.init();
    if (key) { keys.add(key); b.classList.add('down'); try { b.setPointerCapture(e.pointerId); } catch { /* synthetic */ } }
    if (tap) window.dispatchEvent(new KeyboardEvent('keydown', { code: tap }));
  });
  const up = () => { if (key) { keys.delete(key); b.classList.remove('down'); } };
  b.addEventListener('pointerup', up);
  b.addEventListener('pointercancel', up);
}
if (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) document.body.classList.add('touch');

// ---------- Camera ----------
// The pile: what the crash has hit, gathered round where you crashed (recent hits count most)
function pileCentre(C) {
  const out = new THREE.Vector3();
  let w = 0;
  for (const v of traffic.list) {
    if (!(v.gen > 0) || v.touchT == null || v.asleep) continue;
    const p = v.car.pos;
    if (Math.hypot(p.x - C.origin.x, p.z - C.origin.z) > 28) continue;
    const k = 1 / (1 + Math.max(0, G.t - v.touchT));
    out.addScaledVector(p, k);
    w += k;
  }
  return w > 0.05 ? out.divideScalar(w) : out.copy(C.origin);
}
// How worth watching a vehicle is right now. Most of all: one still driving that's about to run into
// something (sooner is better). Then: a wreck that's still flying, tumbling or sliding. At rest: nothing.
// Returns { k, at }: the score, and where it's going to hit (or null).
function interest(v, all) {
  if (!v || v.asleep) return { k: 0, at: null };
  const c = v.car, sp = c.vel.length();
  if (sp < 2.5) return { k: 0, at: null };
  const C = G.crash, d = C ? Math.hypot(c.pos.x - C.focus.x, c.pos.z - C.focus.z) : 0;
  if (v !== player && v.driver && !v.driver.out && v.alive) {
    // Still driving: what's in its path?
    const hx = c.vel.x / sp, hz = c.vel.z / sp;
    let eta = Infinity, at = null;
    for (const b of all) {
      if (b === v) continue;
      const dx = b.car.pos.x - c.pos.x, dz = b.car.pos.z - c.pos.z;
      if (Math.abs(dx) > 50 || Math.abs(dz) > 50) continue;
      const along = dx * hx + dz * hz, miss = Math.abs(dx * hz - dz * hx);
      if (along < 3 || miss > (b.len || 4) / 2 + 1.2) continue;
      // Only something already wrecked, stopped or crossing counts: not the car ahead going the same way
      const bv = b.car.vel.x * hx + b.car.vel.z * hz;
      if (sp - bv < 5) continue;
      const t = along / (sp - bv);
      if (t < eta) { eta = t; at = b; }
    }
    if (eta < 2.5) return { k: (30 + sp * 0.5 - eta * 6) * (d < 45 ? 1 : 0.5), at };
    return { k: 0, at: null };
  }
  // A wreck on the move: worth watching near the pile, hardly at all once it's rolled off down the street
  return { k: (sp + c.w.length() * 2) * (d < 30 ? 1 : 0.15), at: null };
}
// Keep the camera clear of what stands between it and the action: buildings (pull in), cars, trees, lamp
// posts and traffic lights (rise over them)
function unblock(look, p, skip) {
  clear(look, p);
  for (const b of bodies()) {
    if (b === skip) continue;
    const q = b.car.pos;
    if (Math.hypot(q.x - p.x, q.z - p.z) < (b.len || 2) / 2 + 3) p.y = Math.max(p.y, q.y + 3.5);
  }
  // Up over any tree or post right beside the camera, and anything tall on the line of sight
  for (const q of props.near(p.x, p.z)) {
    if (q.alive && q.h >= 3 && Math.hypot(q.x - p.x, q.z - p.z) < 5) p.y = Math.max(p.y, q.y + q.h + 2);
  }
  for (let tries = 0; tries < 8 && blocked(p, look); tries++) p.y += 1.5;
}
const _s = new THREE.Vector3();
function blocked(from, to) {
  for (let i = 1; i < 10; i++) {
    _s.lerpVectors(from, to, i / 10);
    for (const b of city.near(_s.x, _s.z)) if (_s.y < b.top && city.blockDist(b, _s.x, _s.z, _w) < 0) return true;
    for (const q of props.near(_s.x, _s.z)) {
      if (q.alive && q.h >= 3 && _s.y < q.y + q.h + 0.4 && Math.hypot(q.x - _s.x, q.z - _s.z) < (q.kind === 'tree' ? 2.4 : 0.6)) return true;
    }
  }
  return false;
}

const cam = { dir: new THREE.Vector3(0, 0, -1), mode: 'menu', t: 0, roll: 0, look: new THREE.Vector3(), menuA: 0 };
const _c = new THREE.Vector3(), _l = new THREE.Vector3();
// Keep the camera out of buildings: pull it toward the subject until it's clear
function clear(from, p) {
  for (let i = 0; i < 12; i++) {
    let inside = false;
    for (const b of city.near(p.x, p.z)) if (p.y < b.top && city.blockDist(b, p.x, p.z, _w) < 0.6) { inside = true; break; }
    if (!inside) break;
    p.lerp(from, 0.2);
  }
  p.y = Math.max(p.y, city.groundHeight(p.x, p.z) + 0.6);
}
function updateCamera(dt, rawDt) {
  const c = player.car;
  let fov = 66;
  camera.up.set(0, 1, 0);
  if (G.state === 'intro') {
    // The junction first: a slow sweep round it
    cam.t += rawDt;
    const [jx, jz] = city.level.junction;
    const a = 0.6 + cam.t * 0.12;
    camera.position.set(jx + Math.sin(a) * 34, city.base(jx, jz) + 13 - cam.t * 1.5, jz + 28 + Math.cos(a) * 18);
    camera.lookAt(jx, city.base(jx, jz) + 1.5, jz);
    fov = 58;
  } else if (G.crash && G.state !== 'run') {
    // Crash cam: it follows the action. First your car, wherever it goes; then whatever's most worth
    // watching (something about to hit, or a wreck still flying), held at least SHOT seconds unless it comes
    // to rest. It looks a little ahead of its subject, toward what it's going to hit, and leans to the pile.
    const C = G.crash;
    C.cutT += rawDt;
    const all = bodies().filter(b => !b.half);
    const pile = pileCentre(C);
    C.focus.lerp(pile, 1 - Math.exp(-rawDt * 2));
    if (C.rt < FOLLOW_YOU) {
      if (C.subject !== player) { C.subject = player; C.side = 1; }
    } else {
      const cur = interest(C.subject, all);
      C.restT = cur.k < 3 ? (C.restT || 0) + rawDt : 0;
      let best = null, bk = 0;
      for (const v of all) { const n = interest(v, all); if (n.k > bk) { bk = n.k; best = v; } }
      const tired = C.restT > 0.8 || C.cutT > 6;
      if (best && best !== C.subject && C.cutT > SHOT && (tired || bk > cur.k * 1.8)) {
        C.subject = best;
        C.side = -C.side || 1;
        C.cutT = 0;
        C.cutNow = true;
      } else if (!best && tired && C.subject) { C.subject = null; C.cutT = 0; }
    }
    const S = C.subject;
    let look;
    if (S) {
      const p = S.car.pos, v = S.car.vel, sp = Math.hypot(v.x, v.z);
      if (sp > 3) C.dir = (C.dir || new THREE.Vector3()).set(v.x / sp, 0, v.z / sp);
      else C.dir = C.dir || S.forward.clone().setY(0).normalize();
      const d = C.dir, n = interest(S, all);
      // Behind and to one side of it, up a little
      _c.set(p.x - d.x * 9 + d.z * 4 * C.side, p.y + 3.6, p.z - d.z * 9 - d.x * 4 * C.side);
      // Toward where it's headed (what it's about to hit, if anything), with a pull toward the pile
      _l.copy(p).addScaledVector(v, 0.35);
      if (n.at) _l.lerp(n.at.car.pos, 0.4);
      // (only when it's near: lean to a pile far behind and the camera ends up staring at a wall)
      _l.lerp(C.focus, 0.2 * clamp(1 - _l.distanceTo(C.focus) / 40, 0, 1));
      look = _l;
      C.on = S === player ? 'you' : (n.at ? 'incoming ' : 'wreck ') + S.kind;
    } else {
      C.ang += rawDt * 0.15;
      _c.set(C.focus.x + Math.sin(C.ang) * 17, C.focus.y + 8, C.focus.z + Math.cos(C.ang) * 17);
      look = C.focus;
      C.on = 'pile';
    }
    unblock(look, _c, S);
    if (C.cutNow || C.rt < 0.02) { camera.position.copy(_c); C.look = look.clone(); C.cutNow = false; }
    else camera.position.lerp(_c, 1 - Math.exp(-rawDt * 5));
    C.look = (C.look || look.clone()).lerp(look, 1 - Math.exp(-rawDt * 7));
    camera.lookAt(C.look.x, C.look.y + 0.8, C.look.z);
    fov = 56;
  } else {
    // Chase: low and close; it pulls in and widens as you go faster, and more when you burn rush
    const speed = c.vel.length();
    const rushK = G.rushK || 0;
    const f = _f.set(0, 0, -1).applyQuaternion(c.q).setY(0);
    if (f.lengthSq() > 0.01) f.normalize(); else f.copy(cam.dir);
    // Follow your heading (not your slide), firmly, so the car stays centred as you weave
    cam.dir.lerp(f, 1 - Math.exp(-rawDt * 9)).normalize();
    const dist = 6.3 + speed * 0.012 - rushK * 0.9, ht = 2.05 + speed * 0.004 - rushK * 0.3;
    _c.copy(c.pos).addScaledVector(cam.dir, -dist);
    _c.y = c.pos.y + ht;
    clear(c.pos, _c);
    camera.position.copy(_c);
    // A tiny, smooth tremor that grows with speed (no random jitter)
    const tr = clamp((speed - 30) / 50, 0, 1) * 0.03 + rushK * 0.03;
    const t = G.t * 40;
    camera.position.x += (Math.sin(t * 1.3) + Math.sin(t * 2.9)) * tr;
    camera.position.y += (Math.sin(t * 1.7) + Math.sin(t * 3.7)) * tr;
    _l.copy(c.pos).addScaledVector(cam.dir, 7).setY(c.pos.y + 1.0);
    camera.lookAt(_l);
    // Lean into the turns a little
    cam.roll += ((-G.steer * Math.min(1, speed / 40) * 0.035) - cam.roll) * Math.min(1, rawDt * 5);
    camera.rotateZ(cam.roll);
    fov = 64 + Math.min(18, speed * 0.24) + rushK * 22;
    if (G.state === 'count') fov = 62;
  }
  if (G.shake > 0.01) {
    const s = G.shake * 0.35;
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
    camera.position.z += (Math.random() - 0.5) * s;
  }
  G.shake *= Math.exp(-rawDt * 5);
  if (G.punch > 0.05) { fov += G.punch; G.punch *= Math.exp(-rawDt * 5); }
  camera.fov += (stage.fitFov(fov) - camera.fov) * Math.min(1, rawDt * 6);
  camera.updateProjectionMatrix();
}

// Speed lines: streaks hanging in the air beside the road that the camera tears past
const LINES = 120;
const lines = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LINES * 6), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(LINES * 6), 3).setUsage(THREE.DynamicDrawUsage));
  const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  m.frustumCulled = false;
  scene.add(m);
  return { m, g, pts: Array.from({ length: LINES }, () => new THREE.Vector3(1e9, 0, 0)) };
})();
function updateLines(k) {
  const pos = lines.g.attributes.position.array, col = lines.g.attributes.color.array;
  lines.m.visible = k > 0.01;
  if (!lines.m.visible) return;
  const c = player.car, v = c.vel, sp = v.length() || 1;
  const fwd = _f.copy(v).divideScalar(sp);
  const right = _r.set(-fwd.z, 0, fwd.x);
  const len = sp * 0.05 * (1 + (G.rushK || 0));
  lines.pts.forEach((p, i) => {
    const rel = _v.subVectors(p, camera.position);
    if (rel.dot(fwd) < -2 || rel.length() > 90) {
      const side = Math.random() < 0.5 ? -1 : 1;
      p.copy(camera.position).addScaledVector(fwd, 25 + Math.random() * 60).addScaledVector(right, side * (2.5 + Math.random() * 9)).add(_c.set(0, -1 + Math.random() * 5, 0));
    }
    pos.set([p.x, p.y, p.z, p.x - fwd.x * len, p.y - fwd.y * len, p.z - fwd.z * len], i * 6);
    const a = k * (0.25 + 0.35 * ((i * 0.618) % 1));
    col.set([a, a, a * 1.05, 0, 0, 0], i * 6);
  });
  lines.g.attributes.position.needsUpdate = true;
  lines.g.attributes.color.needsUpdate = true;
}

// ---------- Post: radial speed blur and a vignette ----------
const post = (() => {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { samples: 4, type: THREE.HalfFloatType });
  const mat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: rt.texture }, amount: { value: 0 }, vig: { value: 0.25 }, tint: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float amount; uniform float vig; uniform float tint; varying vec2 vUv;
      void main() {
        vec2 d = vUv - vec2(0.5, 0.52);
        float r = length(d);
        float k = amount * smoothstep(0.12, 0.75, r);
        vec4 c = vec4(0.0);
        for (int i = 0; i < 12; i++) c += texture2D(tDiffuse, vUv - d * k * 0.16 * float(i) / 11.0);
        c /= 12.0;
        c.rgb *= 1.0 - vig * smoothstep(0.35, 0.95, r * 1.25);
        c.rgb = mix(c.rgb, c.rgb * vec3(1.15, 0.92, 0.82), tint);
        gl_FragColor = c;
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const ps = new THREE.Scene();
  ps.add(quad);
  const pc = new THREE.Camera();
  return {
    mat,
    render() {
      renderer.getDrawingBufferSize(size);
      if (rt.width !== size.x || rt.height !== size.y) rt.setSize(size.x, size.y);
      renderer.setRenderTarget(rt);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(ps, pc);
    },
  };
})();

// ---------- Per-frame effects ----------
function effects(dt, rawDt) {
  for (const v of [player, ...traffic.list]) {
    if (!v || v.asleep || v.halved) continue;
    const c = v.car;
    const pm = v.model.userData.paint;
    if (pm && (v.flashT > 0 || v.flashOn)) {
      v.flashT -= rawDt;         // a real-time blink, even in slow motion
      v.flashOn = v.flashT > 0;
      pm.emissive?.setRGB(1, 0.9, 0.8).multiplyScalar(v.flashOn ? Math.min(1, v.flashT * 9) * 0.6 : 0);
    }
    const engine = _pv.set(0, 0.5, -v.len / 2 + 0.7).applyQuaternion(c.q).add(c.pos);
    if (!v.alive) {
      const age = G.t - v.diedAt;
      if (Math.random() < dt * (age < 10 ? 11 : 5)) puff(engine, age < 10 ? '#3a3632' : '#6a655e', 1.2, 2.6, 3, 0.42);
      if ((age < 10 || v.blown) && Math.random() < dt * (v.blown ? 60 : 30)) flame(engine, v.blown ? 1.5 : 1);
      continue;
    }
    const f = 1 - v.hp / v.maxHp;
    if (f > 0.4 && Math.random() < dt * (f - 0.35) * 40) puff(engine, f > 0.7 ? '#2a2725' : '#7a7670', 0.8 + f, 1.6, 1.8, 0.5);
    WHEELS.forEach((W, i) => {
      const ws = c.wheels[i];
      if (!ws.contact) return;
      const p = _w.copy(W.p).applyQuaternion(c.q).add(c.pos);
      if (ws.lost) {
        if (Math.abs(c.speed) > 3 && Math.random() < dt * 40) glow.emit(p.x, p.y - 0.3, p.z, -c.vel.x * 0.3, 1 + Math.random() * 2, -c.vel.z * 0.3, { life: 0.3, size: 0.12, gravity: 12, colour: '#ffcf6e', alpha: 1 });
        return;
      }
      // Tyre smoke in a drift
      if (v === player && G.drifting && !W.front && Math.random() < dt * 40) {
        smoke.emit(p.x, p.y - 0.5, p.z, (Math.random() - 0.5) * 2, 0.6 + Math.random(), (Math.random() - 0.5) * 2, { life: 1.6, size: 1.1, grow: 1.4, drag: 1, colour: '#e8e6e2', alpha: 0.4 });
      }
    });
    if (v.boosting) {
      for (const x of [-0.4, 0.4]) {
        const p = _w.set(x, -0.15, v.len / 2).applyQuaternion(c.q).add(c.pos);
        glow.emit(p.x, p.y, p.z, c.vel.x * 0.6, 0.3, c.vel.z * 0.6, { life: 0.16, size: 0.6, grow: -3, colour: Math.random() < 0.5 ? '#7fd4ff' : '#ffb02e', alpha: 0.9 });
      }
    }
  }
  for (const h of halves) {
    if (Math.random() < dt * 14) puff(h.car.pos, '#2a2622', 1.2, 2.4, 2, 0.6);
    if (Math.random() < dt * 30) flame(h.car.pos, 0.9);
  }
  for (let i = G.geysers.length - 1; i >= 0; i--) {
    const g = G.geysers[i];
    if ((g.t -= dt) <= 0) { G.geysers.splice(i, 1); continue; }
    for (let k = 0; k < 3; k++) smoke.emit(g.p.x, g.p.y + 0.5, g.p.z, (Math.random() - 0.5) * 1.5, 9 + Math.random() * 4, (Math.random() - 0.5) * 1.5,
      { life: 1.3, size: 0.5, grow: 1.2, gravity: 9, colour: '#dff3ff', alpha: 0.7 });
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.t += dt;
    r.m.scale.setScalar(1 + r.t * r.grow);
    r.m.material.opacity = Math.max(0, r.alpha * (1 - r.t / r.life));
    if (r.t > r.life) { dropMesh(r.m); rings.splice(i, 1); }
  }
}

// ---------- HUD ----------
let msgT = 0;
function showMsg(main, sub = '', secs = 1.5) {
  $('msg-main').textContent = main;
  $('msg-sub').textContent = sub;
  $('msg').style.opacity = 1;
  msgT = secs;
}
function callout(html, cls = '') {
  const el = document.createElement('div');
  el.className = 'call ' + cls;
  el.innerHTML = html;
  const box = $('callouts');
  box.appendChild(el);
  while (box.children.length > (G.crash ? 2 : 4)) box.firstChild.remove();
  el.addEventListener('animationend', () => el.remove());
}
const setText = (() => { const last = {}; return (id, t) => { if (last[id] !== t) { last[id] = t; $(id).textContent = t; } }; })();
function updateHud(dt) {
  const c = player.car;
  const kmh = Math.round(c.vel.length() * KMH);
  setText('speed', G.state === 'crash' || G.state === 'results' ? '' : String(kmh));
  $('speedo').classList.toggle('hidden', !!G.crash);
  $('hud').classList.toggle('crashing', !!G.crash);
  $('rush-fill').style.width = (G.rush * 100).toFixed(1) + '%';
  $('rush').classList.toggle('on', !!G.boosting);
  $('rush').classList.toggle('full', G.rush > 0.98);
  setText('heat', '×' + G.heat.toFixed(1));
  $('heatbox').classList.toggle('oncoming', !!G.oncoming && G.state === 'run');
  if (G.crash) {
    G.shown += (G.score - G.shown) * Math.min(1, dt * 6) + (G.score > G.shown ? 1 : 0);
    G.shown = Math.min(G.shown, G.score);
    setText('carnage', Math.round(G.shown).toLocaleString());
    setText('crash-sub', `${G.wrecked} wrecked · chain ${G.chain} · ×${G.heat.toFixed(1)}`);
  }
}

// ---------- Screens ----------
function showScreen(id) {
  for (const s of ['menu', 'results', 'pause', 'help']) $(s).classList.toggle('hidden', s !== id);
}
// The engine, skid and boost are loops: silence them whenever the game stops updating them
function muteLoops() { sound.engine(0, 0, false); sound.skid(0); sound.boost(0); }
function pause() { G.paused = G.state; G.state = 'paused'; showScreen('pause'); muteLoops(); }
function resume() { if (G.state !== 'paused') return; G.state = G.paused; showScreen(null); }
function toMenu() {
  G.state = 'menu';
  G.crash = null;
  muteLoops();
  G.flash = 0;
  flashEl.style.opacity = 0;
  $('hud').classList.add('hidden');
  loadLevel(settings.level);
  startTraffic();
  renderMenu();
  showScreen('menu');
}
// Traffic running behind the menu
function startTraffic() {
  clearRun();
  props?.dispose();
  props = new Props(scene, city, city.level.props || []);
  G.rand = rng(Math.floor(Math.random() * 1e9));
  traffic = new Traffic(city, city.level, kind => makeTraffic(kind), G.rand);
  traffic.populate({ ...city.level, specials: [] });
}
function renderMenu() {
  const box = $('levels');
  box.innerHTML = '';
  for (const [key, L] of Object.entries(LEVELS)) {
    const b = document.createElement('button');
    const medal = records.medals[key] || 0, best = records.best[key];
    b.className = key === settings.level ? 'active' : '';
    b.innerHTML = `<b>${L.name}</b><span>${L.blurb}</span><em class="m${medal}">${best ? best.toLocaleString() : 'not played'}</em>`;
    b.onclick = () => { settings.level = key; saveSettings(); loadLevel(key); startTraffic(); renderMenu(); };
    box.appendChild(b);
  }
  const cars = $('cars');
  cars.innerHTML = '';
  for (const [key, R] of Object.entries(RIDES)) {
    const b = document.createElement('button');
    b.className = key === settings.car ? 'active' : '';
    b.innerHTML = `<b>${R.name}</b><span>${R.blurb}</span>`;
    b.onclick = () => { settings.car = key; saveSettings(); renderMenu(); };
    cars.appendChild(b);
  }
  const tod = $('tod');
  tod.innerHTML = '';
  for (const t of ['day', 'sunset']) {
    const b = document.createElement('button');
    b.className = t === settings.time ? 'active' : '';
    b.textContent = TIMES[t].label;
    b.onclick = () => { settings.time = t; saveSettings(); stage.setTime(t); for (const v of traffic.list) v.setLights(TIMES[t].lamps); renderMenu(); };
    tod.appendChild(b);
  }
}
$('btn-go').onclick = () => { sound.init(); loadLevel(settings.level); startRun(PRE_INTRO + PRE_COUNT); };
$('btn-retry').onclick = () => startRun(PRE_RETRY);
$('btn-next').onclick = () => {
  const keys = Object.keys(LEVELS);
  settings.level = keys[Math.min(keys.length - 1, keys.indexOf(city.key) + 1)];
  saveSettings();
  loadLevel(settings.level);
  startRun(PRE_INTRO + PRE_COUNT);
};
$('btn-menu').onclick = toMenu;
$('btn-resume').onclick = resume;
$('btn-quit').onclick = toMenu;
$('btn-help').onclick = () => showScreen('help');
$('btn-help-close').onclick = () => { store.save('rush.seenHelp', true); showScreen(G.state === 'menu' ? 'menu' : null); };
window.addEventListener('keydown', e => { if (G.state === 'menu' && e.code === 'Enter' && $('help').classList.contains('hidden')) $('btn-go').onclick(); });

// ---------- Main loop ----------
let last = performance.now(), acc = 0;
G.geysers = [];
function frame(now) {
  requestAnimationFrame(frame);
  if (G.manual) return;                 // a test is driving the clock (see tick)
  stage.watchFrameRate((now - last) / 1000);
  const raw = Math.min(0.05, (now - last) / 1000);
  last = now;
  readInput();
  tick(raw);
}
// One frame `raw` seconds long; `draw: false` skips the rendering
function tick(raw, draw = true) {
  if (G.state === 'menu') {
    // The junction, from above, with its traffic going about its business
    cam.menuA += raw * 0.05;
    const [jx, jz] = city.level.junction;
    const focus = { x: jx, z: jz, dx: 0, dz: 0 };
    acc += raw;
    while (acc >= DT) {
      acc -= DT;
      const B = traffic.list.filter(v => !v.asleep);
      traffic.update(DT, focus, traffic.list, true);
      for (const v of B) { v.car.step(DT, v.input || NONE); }
      for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) contact(B[i], B[j]);
    }
    for (const v of traffic.list) v.pose();
    camera.position.set(jx + Math.sin(cam.menuA) * 46, city.base(jx, jz) + 24, jz + Math.cos(cam.menuA) * 46);
    camera.up.set(0, 1, 0);
    camera.lookAt(jx, city.base(jx, jz), jz);
    camera.fov = stage.fitFov(55);
    camera.updateProjectionMatrix();
    stage.focusSun(new THREE.Vector3(jx, 0, jz), 60);
    post.mat.uniforms.amount.value = 0;
    smoke.update(raw, camera, renderer.domElement.height);
    glow.update(raw, camera, renderer.domElement.height);
    if (draw) post.render();
    return;
  }
  if (G.state === 'paused' || !player) { if (draw) post.render(); return; }
  // Time: slow motion through the crash, briefly slower still for the big moments
  let scale = 1;
  if (G.crash) {
    const t = G.crash.rt += raw;
    scale = t < 1.4 ? 0.14 : Math.min(0.85, 0.14 + (t - 1.4) * 0.35);
    if (G.spike > 0) { G.spike -= raw; scale = Math.min(scale, G.spikeK); }
    if (G.state === 'results') scale = 0.85;
  }
  // The countdown runs on the simulation's own clock (see go())
  if (G.state === 'intro' || G.state === 'count') {
    const before = Math.ceil(G.pre);
    G.pre = G.preSteps / 120;
    if (G.pre <= PRE_COUNT && G.state === 'intro') G.state = 'count';
    const after = Math.ceil(G.pre);
    if (G.state === 'count' && after !== before && after > 0 && after <= 3) { showMsg(String(after), '', 0.8); sound.beep(false); }
  }
  acc += raw * scale;
  let n = 0;
  while (acc >= DT && n++ < 30) { step(); acc -= DT; }
  if (n >= 30) acc = 0;
  const dt = raw * scale;
  for (const v of traffic.list) if (!v.halved) v.pose();
  player.pose();
  for (const h of halves) { h.model.position.copy(h.car.pos); h.model.quaternion.copy(h.car.q); }
  effects(dt, raw);
  debris.update(dt);
  smoke.update(dt, camera, renderer.domElement.height);
  glow.update(dt, camera, renderer.domElement.height);
  // Rush on screen: blur, wider view, streaks
  const speed = player.car.vel.length();
  G.rushK = (G.rushK || 0) + ((G.boosting && G.state === 'run' ? 1 : 0) - (G.rushK || 0)) * Math.min(1, raw * 4);
  const fast = G.state === 'run' ? clamp((speed - 30) / 45, 0, 1) : 0;
  post.mat.uniforms.amount.value = fast * 0.35 + G.rushK * 0.75;
  post.mat.uniforms.vig.value = 0.22 + G.rushK * 0.25 + (G.crash ? 0.15 : 0);
  post.mat.uniforms.tint.value = G.rushK * 0.35;
  updateLines(fast * 0.6 + G.rushK * 0.6);
  updateCamera(dt, raw);
  stage.focusSun(_c.copy(player.car.pos).addScaledVector(cam.dir, G.crash ? 0 : 25), G.crash ? 40 : 55);
  // Sound
  const me = player.car;
  if (!G.crash) {
    sound.engine(me.rpm * (player.def.tone || 1), playerInput.throttle, true);
    sound.skid(G.drifting ? 0.6 : 0);
    sound.boost(G.boosting ? 1 : 0);
  } else { sound.engine(0, 0, false); sound.skid(0); sound.boost(0); }
  if (msgT > 0 && (msgT -= raw) <= 0) $('msg').style.opacity = 0;
  if (G.flash > 0) { flashEl.style.opacity = G.flash; G.flash = Math.max(0, G.flash - raw * 2.5); }
  else if (flashEl.style.opacity !== '0') flashEl.style.opacity = 0;
  updateHud(raw);
  if (draw) post.render();
}
const flashEl = document.createElement('div');
Object.assign(flashEl.style, { position: 'fixed', inset: 0, pointerEvents: 'none', opacity: 0,
  background: 'radial-gradient(ellipse at center, transparent 45%, rgba(220,30,20,0.55) 100%)' });
document.body.appendChild(flashEl);

G.debug = { get player() { return player; }, get traffic() { return traffic; }, get city() { return city; }, playerInput, step, startRun, skipTo, keys, camera, tick };
toMenu();
if (!store.load('rush.seenHelp', false)) showScreen('help');
requestAnimationFrame(frame);
