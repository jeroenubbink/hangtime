// Crunchtime: a demolition derby built on Hangtime's car physics. Eight cars in an arena; ram, dent, de-wheel
// and tear each other apart. Events: Last Car Standing, Brawl (timed, for points), Wrecking Spree (the clock
// only runs on carnage) and a three-round Championship.
import * as THREE from 'three';
import { loadCarKits, kitScene, WHEELS, WHEEL_RADIUS, WHEEL_REST } from '../car.js';
import { Sound } from '../audio.js';
import * as store from '../store.js';
import { createStage, TIMES } from './stage.js';
import { Arena, ARENAS } from './arena.js';
import { Puffs, Debris } from './fx.js';
import { Vehicle, contact, damageFrom } from './vehicle.js';
import { DerbyDriver } from './ai.js';
import { ROSTER, CORE, DRIVERS, PAINTS, statBars } from './roster.js';
import { Pickups, Mines, Props, ITEMS, drawIcon } from './pickups.js';

const $ = id => document.getElementById(id);
const DEBRIS = { door: 'debris-door', doorWin: 'debris-door-window', bumper: 'debris-bumper', plate: 'debris-plate-a', plateB: 'debris-plate-b',
  plateS: 'debris-plate-small-a', spoiler: 'debris-spoiler-a', tyre: 'debris-tire', axle: 'debris-drivetrain-axle' };
await loadCarKits([...new Set(Object.values(ROSTER).map(c => c.file)), 'cone', ...Object.values(DEBRIS)]).catch(e => console.warn('Models not loaded:', e));
$('loading').remove();

const DT = 1 / 120;
const clamp = THREE.MathUtils.clamp;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const NONE = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };
const HOLD = { throttle: 0, brake: 1, steer: 0, handbrake: true, boost: false };

export const EVENTS = {
  elim: { name: 'Last Car Standing', short: 'Wreck them all. Last car running wins.' },
  brawl: { name: 'Brawl', short: '3 minutes. Wrecks respawn. Most points wins.', secs: 180 },
  spree: { name: 'Wrecking Spree', short: 'The clock only stops for carnage.' },
  cup: { name: 'Championship', short: 'Three rounds, three arenas. Points for placing.' },
};
const CUP_ROUNDS = [['bowl', 'elim'], ['yard', 'brawl'], ['deck', 'elim']];
const CUP_POINTS = [10, 8, 6, 5, 4, 3, 2, 1];
const SUDDEN_AFTER = 150;                 // Last Car Standing: hits count 1.5× after this long
const SPREE_START = 60;
const AFTERTOUCH = 2.5;              // seconds you can steer your own wreck
const _af = new THREE.Vector3();
const SHOWROOM = { bowl: [0, 0], yard: [-30, -22], deck: [16, 8] };
// Livery cars keep their own colours (repainting would recolour the light bar)
const LIVERY = { police: '#9fb4d0', cabbie: '#ffcf2e', dumpster: '#3a8a4a' };

// ---------- Stage ----------
const stage = createStage($('view'));
const { scene, camera, renderer } = stage;
const sound = new Sound();
const smoke = new Puffs(scene, 1400, { soft: 0.15 });
const glow = new Puffs(scene, 900, { additive: true, soft: 0.35 });

// ---------- Settings & records ----------
const settings = Object.assign({ event: 'elim', car: 'comet', paints: {}, arena: 'bowl', time: 'day' }, store.load('derby.settings', {}));
const records = Object.assign({ wins: {}, cups: 0, best: { brawl: 0, spree: 0 }, takedowns: 0, played: 0 }, store.load('derby.records', {}));
if (!ROSTER[settings.car]) settings.car = 'comet';
if (!ARENAS[settings.arena]) settings.arena = 'bowl';
if (!TIMES[settings.time]) settings.time = 'day';
if (!EVENTS[settings.event]) settings.event = 'elim';
const saveSettings = () => store.save('derby.settings', settings);
const saveRecords = () => store.save('derby.records', records);
const isLocked = key => {
  const l = ROSTER[key].locked;
  if (l === 'cup') return records.cups < 1;
  if (l === 'four') return Object.values(records.wins).filter(n => n > 0).length < 4;
  return false;
};
const paintOf = key => (LIVERY[key] && !settings.paints[key] ? null : settings.paints[key] || ROSTER[key].paint || PAINTS[0]);

// ---------- World state ----------
let arena = null, pickups = null, mines = null, props = null, debris = null;
let vehicles = [], halves = [], showroom = null;
const G = { state: 'menu', match: null, cup: null, sim: false, camMode: 0, slowmo: 0, hitstop: 0, shake: 0, ff: false, follow: null, flash: 0 };
window.derby = G;

function clearWorld() {
  for (const v of vehicles) scene.remove(v.model);
  for (const h of halves) scene.remove(h.model);
  vehicles = [];
  halves = [];
  if (showroom) { scene.remove(showroom.model); showroom = null; }
  pickups?.dispose(); props?.dispose(); mines?.clear(); debris?.clear();
  pickups = props = null;
  smoke.clear();
  glow.clear();
}

function loadArena(key) {
  clearWorld();
  if (!arena || arena.key !== key) {
    arena?.dispose();
    arena = new Arena(scene, key);
  }
  debris = new Debris(scene, (x, z) => arena.groundHeight(x, z));
  mines = new Mines(scene);
  applyTime();
}

function applyTime() {
  const t = stage.setTime(settings.time);
  arena?.setLighting(t.lamps);
  for (const v of vehicles) v.setLights(t.lamps);
  if (showroom) showroom.setLights(t.lamps);
}

// ---------- Debris pieces ----------
const debrisCache = {};
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
  // Body panels take the car's paint
  const painted = ['door', 'doorWin', 'plate', 'plateB', 'plateS', 'spoiler'].includes(name);
  let mat = d.mat;
  if (painted && colour) mat = d.mats[colour] || (d.mats[colour] = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.45, metalness: 0.25 }));
  const m = new THREE.Mesh(d.geo, mat);
  m.castShadow = true;
  return m;
}

function fling(name, colour, pos, vel, opts = {}) {
  if (G.sim) return;
  const m = debrisMesh(name, colour);
  if (m) debris.add(m, pos, vel, { radius: 0.18, ...opts });
}

// ---------- Effects ----------
function sparks(p, n, speed = 9) {
  if (G.sim) return;
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
function flame(p, size = 0.9) {
  glow.emit(p.x + (Math.random() - 0.5) * 0.5, p.y + 0.1, p.z + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.6, 2 + Math.random() * 2, (Math.random() - 0.5) * 0.6,
    { life: 0.35 + Math.random() * 0.3, size: size * (0.6 + Math.random() * 0.6), grow: -1.2, colour: ['#ff7a1a', '#ffb02e', '#ff4a1a'][Math.floor(Math.random() * 3)], alpha: 0.9 });
}
function explosion(p, big = 1) {
  if (G.sim) return;
  for (let i = 0; i < 40 * big; i++) {
    const a = Math.random() * Math.PI * 2, u = Math.random() * 8;
    glow.emit(p.x, p.y + 0.5, p.z, Math.cos(a) * u, 2 + Math.random() * 7, Math.sin(a) * u,
      { life: 0.5 + Math.random() * 0.5, size: 1 + Math.random() * 1.4, grow: -0.8, drag: 2, colour: ['#ffb02e', '#ff5a1f', '#ffe36e'][i % 3], alpha: 0.95 });
  }
  for (let i = 0; i < 24 * big; i++) puff(p, ['#2a2622', '#3a3632', '#1e1c1a'][i % 3], 1.6 + Math.random() * 1.5, 2.5 + Math.random() * 1.5, 2 + Math.random() * 3, 0.7, 2.5);
  sparks(p, 30 * big, 14);
}

// A shockwave ring that expands from a car
const ringMat = new THREE.MeshBasicMaterial({ color: '#c79bff', transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const rings = [];
function ring(p, colour = '#c79bff') {
  if (G.sim) return;
  const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.4, 48).rotateX(-Math.PI / 2), ringMat.clone());
  m.material.color.set(colour);
  m.position.copy(p).setY(p.y + 0.3);
  scene.add(m);
  rings.push({ m, t: 0 });
}

// Shield bubbles and spikes, made once and attached to a car while active
const bubbleGeo = new THREE.SphereGeometry(1, 24, 14);
const spikeGeo = (() => {
  const g = [];
  for (let k = -2; k <= 2; k++) g.push(new THREE.ConeGeometry(0.11, 0.55, 6).rotateX(-Math.PI / 2).translate(k * 0.36, 0, 0));
  const out = new THREE.BufferGeometry();
  // Merge by hand: a few cones in a row
  const pos = [];
  for (const c of g) { const n = c.toNonIndexed(); pos.push(...n.attributes.position.array); }
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.computeVertexNormals();
  return out;
})();
const spikeMat = new THREE.MeshStandardMaterial({ color: '#d9dde3', metalness: 0.9, roughness: 0.3 });
function gear(v) {
  const u = v.model.userData;
  if (!u.bubble) {
    u.bubble = new THREE.Mesh(bubbleGeo, new THREE.MeshBasicMaterial({ color: '#7ff0ff', transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
    u.bubble.scale.set(v.r + 0.7, 1.5, v.len / 2 + 0.6);
    u.spikes = new THREE.Mesh(spikeGeo, spikeMat);
    u.spikes.position.set(0, -0.1, -v.len / 2 - 0.1);
    v.model.add(u.bubble, u.spikes);
  }
  u.bubble.visible = v.shield > 0;
  if (v.shield > 0) u.bubble.material.opacity = 0.14 + 0.08 * Math.sin(performance.now() / 90) * (v.shield < 1.5 ? 2 : 1);
  u.spikes.visible = v.ram > 0;
}

// ---------- Matches ----------
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// The seven opponents: every core car except yours, each with a driver
function lineup() {
  if (G.cup?.lineup) return G.cup.lineup;
  const cars = CORE.filter(k => k !== settings.car);
  if (cars.length > 7) cars.splice(Math.floor(Math.random() * cars.length), 1);
  const drivers = shuffle(DRIVERS.slice());
  const used = new Set([paintOf(settings.car)]);
  return cars.map((car, i) => {
    let paint = LIVERY[car] ? null : ROSTER[car].paint;
    if (paint && used.has(paint)) paint = PAINTS.find(p => !used.has(p));
    if (paint) used.add(paint);
    return { car, driver: drivers[i], paint };
  });
}

function startMatch(type, arenaKey, { sim = false } = {}) {
  G.sim = sim;
  loadArena(arenaKey);
  const t = TIMES[settings.time];
  const spawns = shuffle(arena.spawns.slice());
  const ups = lineup();
  if (sim) {
    // Balancing runs: all eight core cars, all computer-driven
    vehicles = CORE.map((car, i) => new Vehicle(arena, scene, i, ROSTER[car], ROSTER[car].paint, { driver: new DerbyDriver(DRIVERS[i % 7]), name: ROSTER[car].name }));
  } else {
    const me = new Vehicle(arena, scene, 0, ROSTER[settings.car], paintOf(settings.car), { player: true, name: 'You' });
    vehicles = [me, ...ups.map((u, i) => new Vehicle(arena, scene, i + 1, ROSTER[u.car], u.paint, { driver: new DerbyDriver(u.driver), name: u.driver.name }))];
  }
  vehicles.forEach((v, i) => {
    v.colour = v.paint || LIVERY[Object.keys(ROSTER).find(k => ROSTER[k] === v.def)] || '#cccccc';
    v.respawn(spawns[i]);
    v.setLights(t.lamps);
  });
  for (let i = 0; i < 90; i++) for (const v of vehicles) v.car.step(DT, HOLD);
  pickups = new Pickups(scene, arena, type === 'spree' ? ['repair', 'nitro', 'shield', 'ram', 'shock', 'mine', 'time', 'time'] : ['repair', 'nitro', 'shield', 'ram', 'shock', 'mine']);
  props = new Props(scene, arena, sim ? 0 : 26, Math.floor(Math.random() * 1000));
  G.match = { type, arena: arenaKey, time: 0, countdown: sim ? 0 : 3.4, out: [], over: false, sudden: false,
    timeLeft: type === 'brawl' ? EVENTS.brawl.secs : type === 'spree' ? SPREE_START : Infinity,
    chain: { n: 0, t: -10 }, repairCost: 300, kills: [], lastKiller: null, steps: 0 };
  G.follow = vehicles[0];
  G.killCam = null;
  G.state = sim ? 'play' : 'countdown';
  G.ff = false;
  G.camMode = G.camMode || 0;
  G.cam = null;
  if (!sim) {
    showScreen(null);
    $('hud').classList.remove('hidden');
    $('btn-ff').classList.add('hidden');
    $('feed').innerHTML = '';
    $('callouts').innerHTML = '';
    sound.init();
    sound.crowdBase = arenaKey === 'deck' ? 0.15 : 0.55;
    sound.crowd(sound.crowdBase);
  }
}

// ---------- Fixed step ----------
const playerInput = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };
const aiCtx = { vehicles: null, arena: null, pickups: null, time: 0, playerBias: 1.1 };

function bodies() {
  const out = [];
  for (const v of vehicles) if (!v.gone && !v.halved) out.push(v);
  for (const h of halves) out.push(h);
  return out;
}

function step() {
  const M = G.match;
  M.steps++;
  if (G.state === 'play') M.time += DT;
  aiCtx.vehicles = vehicles;
  aiCtx.arena = arena;
  aiCtx.pickups = pickups.list;
  aiCtx.time = M.time;
  aiCtx.playerBias = M.type === 'spree' ? 1 + M.time / 90 : 1.1;
  for (const v of vehicles) {
    if (v.gone || v.halved) continue;
    const c = v.car;
    let inp = NONE;
    if (G.state === 'countdown') inp = HOLD;
    else if (v.alive && G.state === 'play') {
      if (v.player && !G.sim) inp = playerInput;
      else {
        inp = v.driver.drive(v, aiCtx, DT);
        if (v.driver.useItem) useItem(v);
        if (v.flipT > 1.6) unflip(v);
      }
    }
    // Nitro: burns while held on the ground; refills slowly, and with damage dealt
    const want = inp.boost;
    v.boosting = want && v.nitro > 0 && c.grounded > 0 && v.alive;
    if (v.boosting) v.nitro = Math.max(0, v.nitro - DT / 2.6);
    else v.nitro = Math.min(1, v.nitro + DT * 0.025);
    inp.boost = v.boosting;
    // Aftertouch: for a moment after being wrecked, steer the wreck (into someone, ideally)
    if (!v.alive && v.player && !G.sim && M.time - v.diedAt < AFTERTOUCH && !v.halved) {
      const r = _af.set(1, 0, 0).applyQuaternion(c.q).setY(0).normalize();
      c.vel.addScaledVector(r, playerInput.steer * 9 * DT);
    }
    c.wallHit = null;
    c.step(DT, inp);
    inp.boost = want;
    if (c.wallHit && v.alive) wallHit(v, c.wallHit);
    v.shield = Math.max(0, v.shield - DT);
    v.ram = Math.max(0, v.ram - DT);
    v.invuln = Math.max(0, v.invuln - DT);
    // Upside down or on its side and nearly stopped
    const up = v.up;
    v.flipT = up.y < 0.35 && Math.abs(c.speed) < 4 && v.alive ? v.flipT + DT : 0;
    if (v.player && v.flipT > 4) unflip(v);
    // Spun round by a hit
    if (v.spinRef) {
      if (M.time - v.spinRef.t > 1.6) v.spinRef = null;
      else if (Math.abs(wrap(v.yaw - v.spinRef.yaw)) > 2.1) { award(v.spinRef.by, 60, 'SPIN OUT', v.car.pos); v.spinRef = null; }
    }
    // Off the edge of the rooftop
    if (arena.fallY != null && c.pos.y < arena.fallY) {
      if (v.alive) {
        const by = v.lastHit && M.time - v.lastHit.t < 8 ? v.lastHit.by : null;
        if (by && by !== v) award(by, 150, 'RING OUT', c.pos);
        kill(v, by, 'front', 0, 'ring');
      }
      v.gone = true;
      v.model.visible = false;
    }
    if (!v.alive && v.respawnT != null && (v.respawnT -= DT) <= 0) respawnVehicle(v);
  }
  for (let i = halves.length - 1; i >= 0; i--) {
    const h = halves[i];
    h.car.step(DT, NONE);
    if (h.car.pos.y < -60) { scene.remove(h.model); halves.splice(i, 1); }
  }
  // Car against car
  const B = bodies();
  for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
    const h = contact(B[i], B[j]);
    if (h) collided(B[i], B[j], h);
  }
  if (G.state !== 'play') return;
  for (const g of pickups.update(DT, vehicles, M.time)) collect(g.vehicle, g.type, g.pos);
  for (const m of mines.update(DT, vehicles)) mineBlast(m.owner, m.pos);
  for (const p of props.update(vehicles)) {
    if (!G.sim) {
      debris.add(p.mesh, p.pos, p.vel, { radius: p.radius * 0.6, spin: 9, life: 10 });
      sound.thud(3);
    }
    if (p.vehicle.alive) award(p.vehicle, 15, p.prop.kind === 'cone' ? 'CONE' : 'BARREL', p.pos, true);
    if (p.vehicle.player && M.type === 'spree') gainTime(1);
  }
  rules();
}

// Tips for the first couple of matches
const TIPS = [[4, 'Hit them in the side: T-bones hurt most'], [16, 'Crates on the glowing pads: repairs, nitro, shields…'],
  [30, 'Nitro refills as you deal damage'], [46, 'Reversing into them spares your engine'], [62, 'Stuck or upside down? Press R / FLIP']];
function tips() {
  const M = G.match;
  if (G.sim || records.played >= 2 || M.type === 'spree') return;
  const t = TIPS[M.tip || 0];
  if (t && M.time > t[0]) { callout(t[1], 'item tip'); M.tip = (M.tip || 0) + 1; }
}

function rules() {
  const M = G.match;
  if (M.over) return;
  if (M.steps % 60 === 0) tips();
  const alive = vehicles.filter(v => v.alive);
  const me = vehicles[0];
  if (M.type === 'elim') {
    if (!M.sudden && M.time > SUDDEN_AFTER) { M.sudden = true; if (!G.sim) { callout('SUDDEN DEATH', 'big'); sound.cheer(0.8); } }
    // Sudden death: engines overheat, so it always ends
    if (M.sudden) for (const v of alive) {
      v.hp -= DT;
      if (v.hp <= 0) kill(v, v.lastHit && M.time - v.lastHit.t < 10 ? v.lastHit.by : null, 'front', 0, 'heat');
    }
    if (alive.length <= 1 || M.time > 480) endMatch();
  } else if (M.type === 'brawl') {
    M.timeLeft -= DT;
    if (M.timeLeft <= 0) endMatch();
  } else if (M.type === 'spree') {
    M.timeLeft -= DT;
    if (M.timeLeft <= 0) endMatch();
  }
}

// ---------- Hits ----------
function collided(A, B, h) {
  const base = damageFrom(h.j);
  const va = A.half ? null : A, vb = B.half ? null : B;
  if (!G.sim && h.speed > 2.5) {
    const near = G.follow && h.point.distanceTo(G.follow.car.pos) < 30;
    if (base > 0 || h.speed > 5) {
      sparks(h.point, Math.min(40, 4 + Math.round(base * 1.2)));
      if (near || base > 15) sound.crunch(Math.min(1, (base + 3) / 30) * (near ? 1 : 0.5));
      if (base > 18) sound.glass();
    }
    if ((va?.player || vb?.player) && base > 2) G.shake = Math.max(G.shake, Math.min(0.9, base * 0.025));
  }
  if (G.hitLog && va && vb) G.hitLog.push([+h.speed.toFixed(1), +base.toFixed(1), +(h.j / 1000).toFixed(1)]);
  if (va) va.bumpT = G.match.time;
  if (vb) vb.bumpT = G.match.time;
  if (base <= 0 || G.state !== 'play') return;
  if (va && vb) {
    // The car that drove into the other takes less of the hit
    const kA = h.sa > h.sb + 1.5 ? 0.7 : h.sb > h.sa + 1.5 ? 1.15 : 1;
    const kB = h.sb > h.sa + 1.5 ? 0.7 : h.sa > h.sb + 1.5 ? 1.15 : 1;
    const zA = va.zoneOf(va.localPoint(h.point)), zB = vb.zoneOf(vb.localPoint(h.point));
    hitBy(va, vb, base * kA, h.point, h.normal, zA, zB);
    hitBy(vb, va, base * kB, h.point, h.normal.clone().negate(), zB, zA);
  } else {
    // A loose half: it hurts, but nobody gets the credit
    for (const [v, n] of [[va, h.normal], [vb, h.normal.clone().negate()]]) if (v) hurt(v, null, base * 0.8, h.point, n);
  }
}

// `X` is hit by `Y`. `zX`, `zY`: the zone of each car that took the contact.
function hitBy(X, Y, base, point, n, zX, zY) {
  if (!X.alive) return;
  if (!Y.alive) {
    // A wreck sliding into someone: the wreck's driver gets the credit while it's fresh
    if (G.match.time - Y.diedAt > AFTERTOUCH) Y = null;
    hurt(X, Y, base * 0.9 * { front: 0.6, rear: 0.85, left: 1.3, right: 1.3 }[zX], point, n, { zone: zX, kind: 'AFTERTOUCH' });
    return;
  }
  let mult = { front: 0.6, rear: 0.85, left: 1.3, right: 1.3 }[zX];
  if (Y.ram > 0 && zY === 'front') mult *= 2;
  if (X.ram > 0 && zX === 'front') mult *= 0.3;
  let kind = 'HIT';
  if (Y.car.grounded === 0 && Y.car.airTime > 0.25) kind = 'AIR STRIKE';
  else if (zY === 'rear' && Y.car.speed < -3) kind = 'REVERSE RAM';
  else if ((zX === 'left' || zX === 'right') && zY === 'front') kind = 'T-BONE';
  else if (zX === 'front' && zY === 'front') kind = 'HEAD-ON';
  else if (zX === 'rear' && zY === 'front') kind = 'REAR-END';
  else if (zX !== 'front' && zX !== 'rear' && zY !== 'front' && zY !== 'rear') kind = 'SIDESWIPE';
  if (Y.boosting && kind !== 'HIT') kind = 'NITRO ' + kind;
  X.spinRef = { yaw: X.yaw, t: G.match.time, by: Y };
  hurt(X, Y, base * mult, point, n, { zone: zX, kind });
}

const BONUS = { AFTERTOUCH: 60, 'T-BONE': 20, 'REVERSE RAM': 30, 'AIR STRIKE': 40, 'HEAD-ON': 10, 'REAR-END': 10, SIDESWIPE: 5 };

// Damage X by `dmg` at world point `point`, the hit pushing along `n` (into X). `by` gets the credit.
function hurt(X, by, dmg, point, n, { zone, kind = 'HIT', quiet = false } = {}) {
  if (!X.alive || dmg <= 0.5) return;
  if (X.shield > 0 || X.invuln > 0) { if (!G.sim) ring(point, '#7ff0ff'); return; }
  const M = G.match;
  if (M.sudden) dmg *= 1.5;
  if (X.player && M.type === 'spree') dmg *= 0.75;   // one against seven: a bit of armour
  dmg *= X.def.armour;
  X.hp -= dmg;
  const lp = X.localPoint(point).clone();
  zone = zone || X.zoneOf(lp);
  X.zones[zone] = Math.min(1.6, X.zones[zone] + dmg / 55);
  const q = X.car.q.clone().invert();
  const dir = n.clone().applyQuaternion(q);
  if (!G.sim) X.dent(lp, dir, dmg);
  X.car.powerK = clamp(1 - 0.5 * Math.max(0, X.zones.front - 0.5), 0.5, 1);
  const out = n.clone().negate();
  const side = zone === 'left' || zone === 'right';
  // Wheels near the hit take a beating, and come off
  WHEELS.forEach((W, i) => {
    if (X.car.wheels[i].lost || Math.hypot(lp.x - W.p.x, lp.z - W.p.z) > 1.35) return;
    X.wheelHp[i] -= dmg / (side ? 24 : 40);
    if (X.wheelHp[i] > 0) return;
    const w = X.loseWheel(i);
    if (w && !G.sim) debris.add(w.mesh, w.pos, X.car.vel.clone().addScaledVector(out, 5).add(new THREE.Vector3(0, 4, 0)), { radius: 0.42, roll: w.roll, life: 16 });
    if (by && by !== X) award(by, 50, 'WHEEL OFF', point);
    if (X.player && !G.sim) callout('LOST A WHEEL', 'bad');
  });
  // Loose parts
  if (!G.sim) {
    const vel = X.car.vel.clone().addScaledVector(out, 4 + dmg * 0.15).add(new THREE.Vector3(0, 3 + dmg * 0.1, 0));
    if (zone === 'rear' && dmg > 9) { const p = X.losePart('spoiler'); if (p) debris.add(p.mesh, p.pos, vel, { radius: 0.2 }); }
    if (zone === 'front' && dmg > 9) { const p = X.losePart('grill'); if (p) debris.add(p.mesh, p.pos, vel, { radius: 0.2 }); }
    if (side && dmg > 11 && !X.lostParts.has('door-' + zone)) { X.lostParts.add('door-' + zone); fling(Math.random() < 0.5 ? 'door' : 'doorWin', X.colour, point, vel); }
    else if (!side && dmg > 13 && !X.lostParts.has('bumper-' + zone)) { X.lostParts.add('bumper-' + zone); fling('bumper', null, point, vel); }
    if (dmg > 7) for (let k = 0; k < Math.min(3, Math.floor(dmg / 10)); k++) fling(['plate', 'plateB', 'plateS'][k % 3], X.colour, point, vel.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4)), { life: 10 });
    if (X.player && dmg > 6) G.flash = Math.min(1, dmg / 30);
  }
  if (by && by !== X) {
    X.lastHit = { by, t: M.time };
    by.dealt += dmg;
    by.nitro = Math.min(1, by.nitro + dmg / 220);
    if (by.player && M.type === 'spree') gainTime(dmg * 0.15);
    award(by, Math.round(dmg * 2) + (BONUS[kind.replace('NITRO ', '')] || 0) + (kind.startsWith('NITRO') ? 15 : 0), kind, point, quiet || dmg < 4);
  }
  if (X.hp <= 0) kill(X, by, zone, dmg);
}

function wallHit(v, w) {
  const dmg = damageFrom(w.impulse) * 0.55;
  if (dmg <= 0.5) return;
  if (!G.sim) {
    sparks(w.point, Math.min(30, 3 + dmg));
    if (v === G.follow || w.speed > 10) sound.crunch(Math.min(1, dmg / 25));
    if (v.player) G.shake = Math.max(G.shake, Math.min(0.8, dmg * 0.03));
  }
  // Shoved into the wall by someone: they get it
  const M = G.match, by = v.lastHit && M.time - v.lastHit.t < 1.2 ? v.lastHit.by : null;
  hurt(v, by, dmg, w.point, w.normal, { kind: by ? 'WALLED' : 'HIT', quiet: !by });
}

function kill(X, by, zone, dmg, cause) {
  if (!X.alive) return;
  const M = G.match;
  const split = cause !== 'ring' && cause !== 'heat' && (((zone === 'left' || zone === 'right') && dmg >= 20) || X.zones.left + X.zones.right >= 2);
  if (split) {
    const hs = X.split();
    X.halved = true;
    halves.push(...hs);
    while (halves.length > 8) scene.remove(halves.shift().model);
  } else X.wreck();
  X.diedAt = M.time;
  X.respawnT = M.type === 'brawl' || M.type === 'spree' ? 3.5 : null;
  // In the spree the clock is your life: a wreck costs time, not the run
  if (X.player && M.type === 'spree') { M.timeLeft -= 15; if (!G.sim) callout('−15 s', 'big bad'); }
  M.out.push(X);
  if (!G.sim && cause !== 'ring') {
    explosion(X.car.pos, split ? 1.4 : 1);
    sound.boom(X === G.follow ? 1 : 0.6);
    sound.cheer(split ? 1 : 0.7);
    if (X === G.follow || by === G.follow) G.shake = 1;
  }
  const how = cause === 'ring' ? 'ring out' : cause === 'heat' ? 'overheated' : split ? 'torn in half' : zone === 'front' ? 'engine blown' : 'wrecked';
  if (by && by !== X) {
    by.takedowns++;
    award(by, 250, split ? 'TORN IN HALF' : 'TAKEDOWN', X.car.pos, false, true);
    if (split) award(by, 150, 'SPLIT BONUS', X.car.pos, true);
    if (by.player && M.lastKiller === X) award(by, 150, 'REVENGE', X.car.pos, false, true);
    const recent = M.kills.filter(k => k.by === by && M.time - k.t < 3);
    if (recent.length) award(by, 200, recent.length > 1 ? 'TRIPLE TAKEDOWN' : 'DOUBLE TAKEDOWN', X.car.pos, false, true);
    M.kills.push({ by, t: M.time });
    if (by.player && !G.sim) {
      // Takedown cam: a slow-motion cut to the victim, from the side
      G.slowmo = 1.1;
      const side = new THREE.Vector3().subVectors(X.car.pos, by.car.pos).setY(0).normalize();
      G.killCam = { t: 1.1, target: X, from: X.car.pos.clone().add(new THREE.Vector3(-side.z, 0, side.x).multiplyScalar(7)).addScaledVector(side, -3).setY(X.car.pos.y + 2.2) };
      keepInside(G.killCam.from);
    }
    if (by.player && M.type === 'spree') gainTime(8);
  }
  if (X.player) {
    M.lastKiller = by;
    if (!G.sim) {
      G.slowmo = 1.2;
      callout(cause === 'ring' ? 'OVER THE EDGE' : split ? 'CUT IN HALF!' : 'WRECKED', 'big bad');
      if (M.type === 'elim') {
        $('btn-ff').classList.remove('hidden');
        G.follow = by && by.alive ? by : vehicles.find(v => v.alive) || X;
      }
    }
  }
  if (!G.sim) feed(by, X, how);
}

function respawnVehicle(v) {
  // The spawn point furthest from everyone
  let best = arena.spawns[0], bd = -1;
  for (const s of arena.spawns) {
    let d = Infinity;
    for (const o of vehicles) if (o !== v && !o.gone) d = Math.min(d, Math.hypot(o.car.pos.x - s.x, o.car.pos.z - s.z));
    if (d > bd) { bd = d; best = s; }
  }
  v.gone = false;
  v.halved = false;
  v.respawnT = null;
  v.respawn(best);
  v.invuln = 2;
  if (v.player) G.follow = v;
}

function unflip(v) {
  const c = v.car;
  const yaw = v.yaw;
  c.pos.y = Math.max(c.pos.y, arena.groundHeight(c.pos.x, c.pos.z)) + 1.3;
  c.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  c.vel.set(0, 2, 0);
  c.w.set(0, 0, 0);
  v.flipT = 0;
}

// ---------- Items ----------
function collect(v, type, pos) {
  const it = ITEMS[type];
  if (type === 'repair') {
    v.hp = Math.min(v.maxHp, v.hp + v.maxHp * 0.45);
    for (const k in v.zones) v.zones[k] *= 0.5;
    v.car.wheels.forEach((w, i) => { if (w.lost) { w.lost = false; v.model.userData.wheels[i].steerer.visible = true; } v.wheelHp[i] = 1; });
    v.car.steerPull = 0;
    v.car.powerK = clamp(1 - 0.5 * Math.max(0, v.zones.front - 0.5), 0.5, 1);
  } else if (type === 'nitro') v.nitro = 1;
  else if (type === 'shield') v.shield = it.secs;
  else if (type === 'ram') v.ram = it.secs;
  else if (type === 'time') { if (G.match.type === 'spree' && v.player) gainTime(10); }
  else v.item = type;
  if (!G.sim) {
    ring(pos, it.colour);
    if (v.player) { sound.pickup(); callout(it.note, 'item'); }
  }
}

function useItem(v) {
  if (!v.item || !v.alive) return;
  const c = v.car;
  if (v.item === 'shock') {
    for (const o of vehicles) {
      if (o === v || !o.alive) continue;
      const d = o.car.pos.distanceTo(c.pos);
      if (d > 14) continue;
      const f = 1 - d / 14;
      const dir = o.car.pos.clone().sub(c.pos).setY(0).normalize();
      o.car.vel.addScaledVector(dir, 16 * f).y += 5 * f;
      o.car.w.add(new THREE.Vector3((Math.random() - 0.5) * 4 * f, (Math.random() - 0.5) * 6 * f, (Math.random() - 0.5) * 4 * f));
      hurt(o, v, 8 + 18 * f, o.car.pos.clone().addScaledVector(dir, -1), dir, { kind: 'SHOCKWAVE' });
    }
    if (!G.sim) { ring(c.pos, ITEMS.shock.colour); ring(c.pos.clone().setY(c.pos.y + 0.6), '#ffffff'); sound.boom(0.5); }
  } else if (v.item === 'mine') {
    const back = c.pos.clone().addScaledVector(v.forward, -(v.len / 2 + 1.4));
    mines.drop(v, back, arena.groundHeight(back.x, back.z));
  }
  v.item = null;
}

function mineBlast(owner, pos) {
  for (const o of vehicles) {
    if (!o.alive) continue;
    const d = o.car.pos.distanceTo(pos);
    if (d > 6) continue;
    const f = 1 - d / 6;
    o.car.vel.y += 9 * f;
    o.car.vel.addScaledVector(o.car.pos.clone().sub(pos).setY(0).normalize(), 6 * f);
    o.car.w.x += (Math.random() - 0.5) * 6 * f;
    o.car.w.z += (Math.random() - 0.5) * 6 * f;
    hurt(o, owner === o ? null : owner, 10 + 22 * f, pos.clone().setY(o.car.pos.y - 0.4), new THREE.Vector3(0, 1, 0), { kind: 'MINE' });
  }
  if (!G.sim) { explosion(pos, 0.7); sound.boom(0.8); }
}

// ---------- Scoring ----------
function gainTime(s) {
  const M = G.match;
  M.timeLeft += s;
  M.gained = (M.gained || 0) + s;
}

function award(v, pts, label, pos, quiet = false, big = false) {
  if (!v || !pts) return;
  const M = G.match;
  if (v.player) {
    if (M.time - M.chain.t < 4) M.chain.n = Math.min(8, M.chain.n + 1); else M.chain.n = 0;
    M.chain.t = M.time;
    pts = Math.round(pts * (1 + 0.25 * M.chain.n));
  }
  v.score += pts;
  if (v.player && !G.sim && !quiet) callout(`${label}<small>+${pts}</small>`, big ? 'big' : '');
}

// ---------- End of a match ----------
function standings() {
  const M = G.match;
  if (M.type === 'elim') {
    const alive = vehicles.filter(v => v.alive).sort((a, b) => b.hp - a.hp);
    return [...alive, ...M.out.slice().reverse().filter(v => !alive.includes(v))];
  }
  return vehicles.slice().sort((a, b) => b.score - a.score);
}

function endMatch() {
  const M = G.match;
  M.over = true;
  if (G.sim) { G.state = 'over'; return; }
  const order = standings();
  const me = vehicles[0];
  const place = order.indexOf(me);
  let title, sub = '';
  if (M.type === 'spree') {
    title = "TIME'S UP";
    sub = `${me.score.toLocaleString()} points · ${me.takedowns} takedowns · lasted ${fmt(M.time)}`;
  } else {
    title = place === 0 ? 'WINNER!' : `${ordinal(place + 1)} PLACE`;
    sub = place === 0 ? (M.type === 'elim' ? 'Last car running.' : 'Most points.') : `Won by ${order[0].name} (${order[0].def.name}).`;
  }
  const notes = [];
  records.played++;
  records.takedowns += me.takedowns;
  if (place === 0 && M.type !== 'spree') {
    records.wins[settings.car] = (records.wins[settings.car] || 0) + 1;
  }
  if ((M.type === 'brawl' || M.type === 'spree') && me.score > (records.best[M.type] || 0)) {
    records.best[M.type] = me.score;
    notes.push(`New best ${EVENTS[M.type].name} score!`);
  }
  // Championship points
  let cupDone = false;
  if (G.cup) {
    order.forEach((v, i) => { G.cup.points[v.name] = (G.cup.points[v.name] || 0) + CUP_POINTS[i]; });
    G.cup.round++;
    cupDone = G.cup.round >= CUP_ROUNDS.length;
    if (cupDone) {
      const table = Object.entries(G.cup.points).sort((a, b) => b[1] - a[1]);
      if (table[0][0] === 'You') { records.cups++; notes.push('Champion! The cup is yours.'); title = 'CHAMPION!'; }
      else title = `${ordinal(table.findIndex(t => t[0] === 'You') + 1)} OVERALL`;
    }
  }
  const before = Object.keys(ROSTER).filter(isLocked);
  saveRecords();
  for (const k of before) if (!isLocked(k)) notes.push(`Unlocked: ${ROSTER[k].name}!`);
  setTimeout(() => showResults(order, title, sub, notes.join(' '), cupDone), G.cup ? 1800 : 2400);
  G.state = 'over';
  if (!G.sim) {
    showMsg(title, '', 2.2);
    sound.cheer(1);
  }
}

function showResults(order, title, sub, note, cupDone) {
  const M = G.match;
  $('res-title').textContent = title;
  $('res-title').className = /WINNER|CHAMPION/.test(title) ? 'win' : '';
  $('res-sub').textContent = G.cup ? `Championship round ${G.cup.round} of ${CUP_ROUNDS.length}: ${ARENAS[M.arena].name}, ${EVENTS[M.type].name}. ${sub}` : sub;
  let html;
  if (G.cup) {
    const table = Object.entries(G.cup.points).sort((a, b) => b[1] - a[1]);
    const byName = Object.fromEntries(vehicles.map(v => [v.name, v]));
    html = '<tr><th>#</th><th>Driver</th><th>Car</th><th class="num">This round</th><th class="num">Points</th></tr>' + table.map(([name, pts], i) => {
      const v = byName[name], r = order.indexOf(v);
      return `<tr class="${v.player ? 'me' : ''}"><td>${i + 1}</td><td><span class="dot" style="background:${v.colour}"></span>${name}</td><td>${v.def.name}</td><td class="num">${ordinal(r + 1)} (+${CUP_POINTS[r]})</td><td class="num">${pts}</td></tr>`;
    }).join('');
  } else {
    html = '<tr><th>#</th><th>Driver</th><th>Car</th><th class="num">Takedowns</th><th class="num">Damage</th><th class="num">Points</th></tr>' + order.map((v, i) =>
      `<tr class="${v.player ? 'me' : ''}"><td>${i + 1}</td><td><span class="dot" style="background:${v.colour}"></span>${v.name}</td><td>${v.def.name}</td><td class="num">${v.takedowns}</td><td class="num">${Math.round(v.dealt)}</td><td class="num">${v.score.toLocaleString()}</td></tr>`).join('');
  }
  $('res-table').innerHTML = html;
  $('res-note').textContent = note;
  $('btn-next').textContent = G.cup && !cupDone ? 'Next round ▸' : 'Again';
  $('btn-next').dataset.next = G.cup && !cupDone ? 'cup' : '';
  if (cupDone) G.cup = null;
  showScreen('results');
  $('hud').classList.add('hidden');
}

const ordinal = n => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

function play() {
  if (settings.event === 'cup') {
    G.cup = { round: 0, points: {}, lineup: null };
    G.cup.lineup = lineup();
    nextCupRound();
  } else {
    G.cup = null;
    startMatch(settings.event, settings.arena);
  }
}
function nextCupRound() {
  const [a, type] = CUP_ROUNDS[G.cup.round];
  startMatch(type, a);
  showMsg(`ROUND ${G.cup.round + 1}`, `${ARENAS[a].name} · ${EVENTS[type].name}`, 2.6);
}

// ---------- HUD ----------
let msgT = 0;
function showMsg(main, sub = '', secs = 1.5) {
  if (G.sim) return;
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
  while (box.children.length > 4) box.firstChild.remove();
  el.addEventListener('animationend', () => el.remove());
}
function feed(by, X, how) {
  const el = document.createElement('div');
  const name = v => `<b style="color:${v.colour}">${v.name}</b>`;
  el.innerHTML = by && by !== X ? `${name(by)}<em>${how}</em>${name(X)}` : `${name(X)}<em>${how}</em>`;
  const box = $('feed');
  box.prepend(el);
  while (box.children.length > 5) box.lastChild.remove();
  el.addEventListener('animationend', () => el.remove());
}
const setText = (() => { const last = {}; return (id, t) => { if (last[id] !== t) { last[id] = t; $(id).textContent = t; } }; })();

function updateHud() {
  const M = G.match, me = vehicles[0];
  if (M.type === 'elim') {
    setText('status-main', `${vehicles.filter(v => v.alive).length} LEFT`);
    setText('status-sub', M.sudden ? 'SUDDEN DEATH · ENGINES OVERHEATING' : fmt(M.time));
  } else {
    setText('status-main', fmt(Math.max(0, M.timeLeft)));
    $('status-main').classList.toggle('low', M.timeLeft < 10);
    setText('status-sub', M.type === 'spree' ? `DEAL DAMAGE FOR TIME · X REPAIR (${M.repairCost})` : 'BRAWL');
    // Time bought in the spree, shown in batches
    if (M.gained >= 0.5 && M.time - (M.gainShown || 0) > 0.6) {
      const el = document.createElement('div');
      el.className = 'gain';
      el.textContent = `+${M.gained.toFixed(1)} s`;
      $('status').appendChild(el);
      el.addEventListener('animationend', () => el.remove());
      M.gained = 0;
      M.gainShown = M.time;
    }
  }
  setText('score', me.score.toLocaleString());
  setText('combo', M.chain.n && M.time - M.chain.t < 4 ? `COMBO ×${(1 + 0.25 * M.chain.n).toFixed(2)}` : '');
  drawCarStatus(me);
  drawRadar();
}

const zoneColour = w => (w < 0.5 ? `hsl(${130 - w * 120}, 70%, 48%)` : `hsl(${Math.max(0, 70 - (w - 0.5) * 70)}, 85%, 50%)`);
function drawCarStatus(v) {
  const cv = $('carstat'), ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  roundRect(ctx, 0, 0, W, H, 14); ctx.fill();
  // Top-down car: nose at the top
  const cx = 70, cy = 92, w = 46, l = 120;
  const z = v.zones;
  ctx.save();
  ctx.translate(cx, cy);
  const poly = (pts, col) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); };
  const a = w / 2, b = l / 2, s = 14;
  poly([[-a, -b], [a, -b], [a - s, -b + s * 1.6], [-a + s, -b + s * 1.6]], zoneColour(z.front));
  poly([[-a, b], [a, b], [a - s, b - s * 1.6], [-a + s, b - s * 1.6]], zoneColour(z.rear));
  poly([[-a, -b], [-a + s, -b + s * 1.6], [-a + s, b - s * 1.6], [-a, b]], zoneColour(z.left));
  poly([[a, -b], [a - s, -b + s * 1.6], [a - s, b - s * 1.6], [a, b]], zoneColour(z.right));
  ctx.fillStyle = 'rgba(20,24,30,0.85)';
  ctx.fillRect(-a + s, -b + s * 1.6, w - 2 * s, l - 2 * s * 1.6);
  WHEELS.forEach((W2, i) => {
    const x = Math.sign(W2.p.x) * (a + 5), y = W2.front ? -b + 26 : b - 26;
    if (v.car.wheels[i].lost) {
      ctx.strokeStyle = '#ff5a4a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x - 6, y - 9); ctx.lineTo(x + 6, y + 9); ctx.moveTo(x + 6, y - 9); ctx.lineTo(x - 6, y + 9); ctx.stroke();
    } else {
      ctx.fillStyle = v.wheelHp[i] < 0.4 ? '#c7553f' : '#111';
      roundRect(ctx, x - 5, y - 11, 10, 22, 3); ctx.fill();
    }
  });
  if (v.shield > 0) { ctx.strokeStyle = '#7ff0ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, 0, a + 16, b + 12, 0, 0, Math.PI * 2); ctx.stroke(); }
  if (v.ram > 0) { ctx.fillStyle = '#ff4a3d'; for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(k * 9 - 4, -b); ctx.lineTo(k * 9, -b - 10); ctx.lineTo(k * 9 + 4, -b); ctx.fill(); } }
  ctx.restore();
  // Item slot
  ctx.fillStyle = v.item ? ITEMS[v.item].colour : 'rgba(255,255,255,0.08)';
  ctx.beginPath(); ctx.arc(160, 44, 26, 0, Math.PI * 2); ctx.fill();
  if (v.item) drawIcon(ctx, v.item, 160, 44, 40);
  ctx.fillStyle = '#fff';
  ctx.font = '600 11px Rubik, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(v.item ? 'E: USE' : 'ITEM', 160, 86);
  // Timers for shield and spikes
  let ty = 112;
  for (const [t, col, label] of [[v.shield, '#7ff0ff', 'SHIELD'], [v.ram, '#ff4a3d', 'SPIKES']]) {
    if (t <= 0) continue;
    ctx.fillStyle = col;
    ctx.fillText(`${label} ${t.toFixed(1)}`, 160, ty);
    ty += 16;
  }
  // Health and nitro
  const hp = Math.max(0, v.hp / v.maxHp);
  bar(ctx, 12, 176, W - 24, 14, hp, hp > 0.5 ? '#3ddc84' : hp > 0.25 ? '#ffcf2e' : '#ff4a3d', `${Math.ceil(Math.max(0, v.hp))}`);
  bar(ctx, 12, 206, W - 24, 10, v.nitro, v.boosting ? '#ffb02e' : '#3aa8ff', 'NITRO');
}
function bar(ctx, x, y, w, h, f, col, label) {
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
  ctx.fillStyle = col;
  if (f > 0.01) { roundRect(ctx, x, y, Math.max(h, w * f), h, h / 2); ctx.fill(); }
  ctx.fillStyle = '#fff';
  ctx.font = `600 ${h - 3}px Rubik, sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText(label, x + 6, y + h - 3);
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function drawRadar() {
  const cv = $('radar'), ctx = cv.getContext('2d'), W = cv.width;
  const S = arena.size + 6, k = (W / 2 - 8) / S;
  ctx.clearRect(0, 0, W, W);
  ctx.save();
  ctx.translate(W / 2, W / 2);
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  roundRect(ctx, -W / 2, -W / 2, W, W, 14); ctx.fill();
  // Arena outline
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 96; i++) {
    const a = i / 96 * Math.PI * 2;
    let x = Math.sin(a) * S * 2, z = Math.cos(a) * S * 2;
    for (let j = 0; j < 20; j++) { const d = arena.edge(x, z), n = arena.outward(x, z); x -= n.x * d; z -= n.z * d; }
    if (i) ctx.lineTo(x * k, z * k); else ctx.moveTo(x * k, z * k);
  }
  ctx.stroke();
  for (const t of arena.trees) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(t.x * k, t.z * k, Math.max(2, t.r * k), 0, Math.PI * 2); ctx.fill(); }
  for (const r of arena.ramps) {
    ctx.save(); ctx.translate(r.x * k, r.z * k); ctx.rotate(r.a);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-(r.up + r.top / 2) * k, -r.w / 2 * k, (2 * r.up + r.top) * k, r.w * k);
    ctx.restore();
  }
  for (const p of pickups.list) if (p.active) { ctx.fillStyle = ITEMS[p.type].colour; ctx.fillRect(p.x * k - 3, p.z * k - 3, 6, 6); }
  for (const v of vehicles) {
    if (v.gone) continue;
    const c = v.car, f = v.forward;
    ctx.save();
    ctx.translate(c.pos.x * k, c.pos.z * k);
    if (!v.alive) {
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-3, -3); ctx.lineTo(3, 3); ctx.moveTo(3, -3); ctx.lineTo(-3, 3); ctx.stroke();
    } else {
      ctx.rotate(Math.atan2(f.x, -f.z));
      ctx.fillStyle = v.colour;
      ctx.strokeStyle = v.player ? '#fff' : 'rgba(0,0,0,0.6)';
      ctx.lineWidth = v.player ? 2.5 : 1;
      ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

// Names and health over the other cars, and arrows at the screen edge for anyone closing in from behind
const labels = $('labels'), lctx = labels.getContext('2d');
const _pv = new THREE.Vector3();
function drawLabels() {
  const w = window.innerWidth, h = window.innerHeight;
  if (labels.width !== w || labels.height !== h) { labels.width = w; labels.height = h; }
  lctx.clearRect(0, 0, w, h);
  if (G.state !== 'play' && G.state !== 'countdown') return;
  const me = G.follow;
  lctx.textAlign = 'center';
  for (const v of vehicles) {
    if (v === me || !v.alive || v.gone) continue;
    const d = v.car.pos.distanceTo(camera.position);
    if (d > 75) continue;
    _pv.copy(v.car.pos); _pv.y += 1.9;
    _pv.project(camera);
    if (_pv.z > 1) {
      // Behind the camera: warn if it's coming for us
      if (me && me.alive && v.driver?.target === me && v.car.pos.distanceTo(me.car.pos) < 22) {
        lctx.fillStyle = '#ff4a3d';
        const x = clamp((-_pv.x * 0.5 + 0.5) * w, 40, w - 40);
        lctx.beginPath(); lctx.moveTo(x, h - 120); lctx.lineTo(x - 16, h - 140); lctx.lineTo(x + 16, h - 140); lctx.closePath(); lctx.fill();
      }
      continue;
    }
    const x = (_pv.x * 0.5 + 0.5) * w, y = (-_pv.y * 0.5 + 0.5) * h;
    const a = clamp(1.4 - d / 60, 0.25, 1);
    lctx.globalAlpha = a;
    lctx.font = '600 13px Rubik, sans-serif';
    lctx.fillStyle = '#fff';
    lctx.shadowColor = 'rgba(0,0,0,0.7)'; lctx.shadowBlur = 4;
    lctx.fillText(v.name, x, y - 10);
    lctx.shadowBlur = 0;
    const f = Math.max(0, v.hp / v.maxHp);
    lctx.fillStyle = 'rgba(0,0,0,0.55)'; lctx.fillRect(x - 24, y - 4, 48, 6);
    lctx.fillStyle = f > 0.5 ? '#3ddc84' : f > 0.25 ? '#ffcf2e' : '#ff4a3d'; lctx.fillRect(x - 24, y - 4, 48 * f, 6);
    if (v.driver?.target === me && me?.alive) { lctx.fillStyle = '#ff4a3d'; lctx.fillText('!', x + 32, y + 2); }
  }
  lctx.globalAlpha = 1;
}

// ---------- Camera ----------
const cam = { dir: new THREE.Vector3(0, 0, -1), back: 0, orbit: 0, menuA: 0 };
const CAMS = ['Chase', 'Far chase', 'Hood', 'Overhead'];
function updateCamera(dt) {
  camera.clearViewOffset();
  const v = G.follow, c = v.car;
  let fov = 65;
  const kc = G.killCam;
  if (kc && (kc.t -= dt) <= 0) G.killCam = null;
  if (G.killCam) {
    const t = kc.target, p = t.halved ? (halves.find(h => h.owner === t)?.car.pos || t.car.pos) : t.car.pos;
    camera.position.copy(kc.from);
    camera.up.set(0, 1, 0);
    camera.lookAt(p.x, p.y + 0.5, p.z);
    fov = 50;
  } else if (v.gone && v.player) {
    // Fell off the roof: watch it go from the edge
    if (c.pos.y > -80) camera.lookAt(c.pos);
  } else if (!v.alive && (G.state === 'play' || G.state === 'over') && v.player) {
    // Wrecked: circle the wreck
    cam.orbit += dt * 0.5;
    const p = v.halved ? (halves.find(h => h.owner === v)?.car.pos || c.pos) : c.pos;
    camera.position.set(p.x + Math.sin(cam.orbit) * 10, p.y + 4.5, p.z + Math.cos(cam.orbit) * 10);
    keepInside(camera.position);
    camera.up.set(0, 1, 0);
    camera.lookAt(p);
  } else if (G.camMode === 3) {
    camera.position.set(c.pos.x * 0.6, c.pos.y + 46, c.pos.z * 0.6 + 26);
    camera.up.set(0, 1, 0);
    camera.lookAt(c.pos);
    fov = 55;
  } else if (G.camMode === 2) {
    camera.position.copy(c.pos).add(_pv.set(0, 0.95, -0.2).applyQuaternion(c.q));
    camera.quaternion.copy(c.q);
    if (lookBack) camera.rotateY(Math.PI);
    fov = 75;
  } else {
    // Chase: behind the direction you're driving; reversing for a moment swings the view round
    const f = v.forward.clone().setY(0).normalize();
    cam.back = c.speed < -4 ? cam.back + dt : Math.max(0, cam.back - dt * 2);
    if ((v.player && lookBack) || cam.back > 0.5) f.negate();
    const k = 1 - Math.exp(-dt * (cam.snap ? 60 : 4));
    cam.snap = false;
    cam.dir.lerp(f, k).normalize();
    const far = G.camMode === 1;
    const dist = far ? 12 : 7.6, ht = far ? 4.6 : 2.9;
    camera.position.copy(c.pos).addScaledVector(cam.dir, -dist);
    keepInside(camera.position);
    camera.position.y = Math.max(c.pos.y + ht, arena.groundHeight(camera.position.x, camera.position.z) + 1);
    camera.up.set(0, 1, 0);
    camera.lookAt(_pv.copy(c.pos).addScaledVector(cam.dir, 3).setY(c.pos.y + 1));
    fov = 66 + (v.boosting ? 8 : 0);
  }
  if (G.shake > 0.01) {
    camera.position.x += (Math.random() - 0.5) * G.shake * 0.6;
    camera.position.y += (Math.random() - 0.5) * G.shake * 0.6;
    camera.position.z += (Math.random() - 0.5) * G.shake * 0.6;
  }
  G.shake *= Math.exp(-dt * 6);
  camera.fov += (stage.fitFov(fov) - camera.fov) * Math.min(1, dt * 6);
  camera.updateProjectionMatrix();
}

// Keep a camera inside the walls
function keepInside(p) {
  const e = arena.def.fall ? -Infinity : arena.edge(p.x, p.z) + 1.2;
  if (e > 0) p.addScaledVector(arena.outward(p.x, p.z, _w), -e);
}

function menuCamera(dt) {
  if (!showroom) return;
  cam.menuA += dt * 0.22;
  const p = showroom.car.pos;
  const R = 8.8;
  camera.position.set(p.x + Math.sin(cam.menuA) * R, p.y + 2.4, p.z + Math.cos(cam.menuA) * R);
  camera.up.set(0, 1, 0);
  camera.lookAt(p.x, p.y + 0.4, p.z);
  camera.fov = stage.fitFov(48);
  camera.updateProjectionMatrix();
  // On a wide screen, shift the picture right so the car sits beside the menu panel
  const w = window.innerWidth, h = window.innerHeight;
  if (w > 760) camera.setViewOffset(w, h, -Math.min(0.22 * w, 300), 0, w, h);
  else camera.setViewOffset(w, h, 0, h * 0.22, w, h);
}

// ---------- Per-frame effects ----------
let dustT = 0;
function effects(dt) {
  dustT += dt;
  const dirt = arena.key !== 'deck';
  for (const v of vehicles) {
    if (v.gone || v.halved) continue;
    const c = v.car;
    const f = 1 - v.hp / v.maxHp;
    const engine = _pv.set(0, 0.5, -v.len / 2 + 0.7).applyQuaternion(c.q).add(c.pos);
    if (!v.alive) {
      const age = G.match.time - v.diedAt;
      if (Math.random() < dt * (age < 8 ? 26 : 8)) puff(engine, age < 8 ? '#26221f' : '#55504a', 1.4, 2.6, 2.5, 0.6);
      if (age < 8 && Math.random() < dt * 40) flame(engine, 1.1);
      continue;
    }
    if (f > 0.45 && Math.random() < dt * (f - 0.4) * 40) puff(engine, f > 0.75 ? '#2a2725' : '#7a7670', 0.8 + f, 1.6, 1.8, 0.5);
    if (f > 0.78 && Math.random() < dt * 30) flame(engine, 0.6);
    // Wheels: dust on dirt, sparks from a bare hub
    WHEELS.forEach((W, i) => {
      const ws = c.wheels[i];
      const p = _w.copy(W.p).applyQuaternion(c.q).add(c.pos);
      if (ws.lost) {
        if (c.grounded && Math.abs(c.speed) > 3 && Math.random() < dt * 40) {
          p.y -= 0.3;
          glow.emit(p.x, p.y, p.z, -c.vel.x * 0.3 + (Math.random() - 0.5) * 3, 1 + Math.random() * 2, -c.vel.z * 0.3 + (Math.random() - 0.5) * 3,
            { life: 0.3, size: 0.12, gravity: 12, colour: '#ffcf6e', alpha: 1 });
        }
        return;
      }
      if (!ws.contact || !dirt) return;
      const sp = Math.abs(c.speed), slip = ws.slip;
      if (Math.random() < dt * (slip > 0.8 ? 18 : sp > 12 ? 3 : 0)) {
        p.y -= WHEEL_REST - ws.comp + WHEEL_RADIUS - 0.1;
        const mud = arena.mud && arena.surfaceGrip(p.x, p.z) < 0.6;
        smoke.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 2, 0.8 + Math.random(), (Math.random() - 0.5) * 2,
          { life: mud ? 0.7 : 1.4, size: mud ? 0.4 : 1, grow: 1, drag: 1, gravity: mud ? 6 : -0.2, colour: mud ? '#3e2c1c' : arena.key === 'bowl' ? '#c9a37a' : '#a89a88', alpha: mud ? 0.9 : 0.35 });
      }
    });
    if (v.boosting) {
      for (const x of [-0.4, 0.4]) {
        const p = _w.set(x, -0.15, v.len / 2).applyQuaternion(c.q).add(c.pos);
        glow.emit(p.x, p.y, p.z, c.vel.x * 0.5, 0.3, c.vel.z * 0.5, { life: 0.18, size: 0.5, grow: -3, colour: Math.random() < 0.5 ? '#7fd4ff' : '#ffb02e', alpha: 0.9 });
      }
    }
    gear(v);
  }
  for (const h of halves) {
    if (Math.random() < dt * 12) puff(h.car.pos, '#2a2622', 1.2, 2.2, 2, 0.6);
    if (G.match && G.match.time - h.owner.diedAt < 6 && Math.random() < dt * 30) flame(h.car.pos, 0.9);
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.t += dt;
    r.m.scale.setScalar(1 + r.t * 22);
    r.m.material.opacity = Math.max(0, 0.8 - r.t * 1.6);
    if (r.t > 0.5) { scene.remove(r.m); r.m.geometry.dispose(); rings.splice(i, 1); }
  }
}
const _w = new THREE.Vector3();

// ---------- Input ----------
const keys = new Set();
let lookBack = false;
function readInput() {
  const k = c => keys.has(c);
  let throttle = k('ArrowUp') || k('KeyW') ? 1 : 0;
  let brake = k('ArrowDown') || k('KeyS') ? 1 : 0;
  let steer = (k('ArrowRight') || k('KeyD') ? 1 : 0) - (k('ArrowLeft') || k('KeyA') ? 1 : 0);
  let handbrake = k('Space');
  let boost = k('ShiftLeft') || k('ShiftRight') || k('KeyN');
  lookBack = k('KeyQ');
  const pad = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
  if (pad) {
    const ax = pad.axes[0] || 0;
    if (Math.abs(ax) > 0.12) steer = ax;
    throttle = Math.max(throttle, pad.buttons[7]?.value || 0, pad.buttons[0]?.pressed ? 1 : 0);
    brake = Math.max(brake, pad.buttons[6]?.value || 0, pad.buttons[2]?.pressed ? 1 : 0);
    handbrake = handbrake || !!pad.buttons[1]?.pressed;
    boost = boost || !!pad.buttons[3]?.pressed;
    lookBack = lookBack || !!pad.buttons[4]?.pressed;
    const itemBtn = !!pad.buttons[5]?.pressed;
    if (itemBtn && !G.padItem) pressItem();
    G.padItem = itemBtn;
  }
  Object.assign(playerInput, { throttle, brake, steer, handbrake, boost });
}
function pressItem() { if (G.state === 'play' && vehicles[0]?.alive) useItem(vehicles[0]); }

window.addEventListener('keydown', e => {
  keys.add(e.code);
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  const me = vehicles[0];
  if (e.code === 'KeyM') sound.setMuted(!sound.muted);
  if (e.repeat) return;
  if (e.code === 'Escape') {
    if (G.state === 'play' || G.state === 'countdown') { G.paused = G.state; G.state = 'paused'; showScreen('pause'); muteLoops(); }
    else if (G.state === 'paused') resume();
  }
  if (G.state !== 'play' && G.state !== 'countdown') return;
  if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'KeyF') pressItem();
  if (e.code === 'KeyC') { G.camMode = (G.camMode + 1) % CAMS.length; cam.snap = true; callout(CAMS[G.camMode] + ' camera', 'item'); }
  if (e.code === 'KeyR' && me?.alive && (me.flipT > 0.2 || Math.abs(me.car.speed) < 2 || me.up.y < 0.5)) unflip(me);
  if (e.code === 'KeyX' && G.match.type === 'spree' && me?.alive && me.score >= G.match.repairCost && me.hp < me.maxHp) {
    me.score -= G.match.repairCost;
    callout(`REPAIRED<small>−${G.match.repairCost}</small>`, 'item');
    G.match.repairCost += 150;
    collect(me, 'repair', me.car.pos.clone());
  }
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

if (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) document.body.classList.add('touch');
for (const b of document.querySelectorAll('#touch button')) {
  const key = b.dataset.key, tap = b.dataset.tap;
  b.addEventListener('pointerdown', e => {
    e.preventDefault();
    document.body.classList.add('touch');
    sound.init();
    if (key) { keys.add(key); b.classList.add('down'); try { b.setPointerCapture(e.pointerId); } catch { /* synthetic */ } }
    if (tap) window.dispatchEvent(new KeyboardEvent('keydown', { code: tap }));
  });
  const up = () => { if (key) { keys.delete(key); b.classList.remove('down'); } };
  b.addEventListener('pointerup', up);
  b.addEventListener('pointercancel', up);
  b.addEventListener('lostpointercapture', up);
}

function muteLoops() { sound.engine(0, 0, false); sound.skid(0); sound.boost(0); sound.voices([]); sound.crowd(0); }
function resume() { showScreen(null); G.state = G.paused; sound.crowd(sound.crowdBase || 0.5); }

// ---------- Screens & menu ----------
function showScreen(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.add('hidden');
  if (id) $(id).classList.remove('hidden');
}

function toMenu() {
  G.state = 'menu';
  G.cup = null;
  muteLoops();
  $('hud').classList.add('hidden');
  lctx.clearRect(0, 0, labels.width, labels.height);
  loadArena(settings.arena);
  buildShowroom();
  renderMenu();
  showScreen('menu');
}

function buildShowroom() {
  if (showroom) scene.remove(showroom.model);
  const [x, z] = SHOWROOM[arena.key];
  showroom = new Vehicle(arena, scene, 0, ROSTER[settings.car], paintOf(settings.car), { player: true });
  showroom.respawn({ x, z, yaw: 0.6 });
  for (let i = 0; i < 120; i++) showroom.car.step(DT, HOLD);
  showroom.setLights(TIMES[settings.time].lamps);
  showroom.pose();
  if (isLocked(settings.car)) showroom.model.userData.paint.color.set('#222');
}

function renderMenu() {
  const ev = $('events');
  ev.innerHTML = '';
  for (const [k, e] of Object.entries(EVENTS)) {
    const b = document.createElement('button');
    b.className = settings.event === k ? 'active' : '';
    b.innerHTML = `<b>${e.name}</b><span>${e.short}</span>`;
    b.onclick = () => { settings.event = k; saveSettings(); renderMenu(); };
    ev.appendChild(b);
  }
  $('menu').classList.toggle('cup', settings.event === 'cup');
  const def = ROSTER[settings.car], locked = isLocked(settings.car);
  const wins = records.wins[settings.car] || 0;
  $('car-name').innerHTML = `${def.name}${wins ? `<span class="wins">★ ${wins} win${wins > 1 ? 's' : ''}</span>` : ''}${locked ? '<span class="lock">🔒 locked</span>' : ''}`;
  $('car-blurb').textContent = def.blurb;
  $('car-stats').innerHTML = statBars(def).map(([n, f]) => `<span>${n}</span><div class="bar"><i style="width:${Math.round(f * 100)}%"></i></div>`).join('');
  const pp = $('paints');
  pp.innerHTML = '';
  if (settings.car === 'police') pp.innerHTML = '<span class="note">Police livery</span>';
  else {
    const opts = LIVERY[settings.car] ? [null, ...PAINTS] : PAINTS;
    for (const c of opts) {
      const b = document.createElement('button');
      b.className = 'swatch' + (paintOf(settings.car) === c ? ' active' : '');
      b.style.background = c || `conic-gradient(${LIVERY[settings.car]} 0 50%, #222 0)`;
      b.title = c ? c : 'Original';
      b.onclick = () => { settings.paints[settings.car] = c; saveSettings(); buildShowroom(); renderMenu(); };
      pp.appendChild(b);
    }
  }
  const ar = $('arenas');
  ar.innerHTML = '';
  for (const [k, a] of Object.entries(ARENAS)) {
    const b = document.createElement('button');
    b.textContent = a.name;
    b.title = a.blurb;
    b.className = settings.arena === k ? 'active' : '';
    b.onclick = () => { settings.arena = k; saveSettings(); loadArena(k); buildShowroom(); renderMenu(); };
    ar.appendChild(b);
  }
  if (!$('arena-blurb')) ar.insertAdjacentHTML('afterend', '<div id="arena-blurb"></div>');
  $('arena-blurb').textContent = settings.event === 'cup' ? 'The championship visits all three arenas.' : ARENAS[settings.arena].blurb;
  const tm = $('times');
  tm.innerHTML = '';
  for (const [k, t] of Object.entries(TIMES)) {
    const b = document.createElement('button');
    b.textContent = t.label;
    b.className = settings.time === k ? 'active' : '';
    b.onclick = () => { settings.time = k; saveSettings(); applyTime(); renderMenu(); };
    tm.appendChild(b);
  }
  $('btn-go').disabled = locked;
  $('btn-go').textContent = locked ? 'LOCKED' : 'CRUNCH ▸';
  const r = records;
  const totalWins = Object.values(r.wins).reduce((a, b) => a + b, 0);
  $('records').textContent = r.played ? `Wins ${totalWins} · Cups ${r.cups} · Takedowns ${r.takedowns} · Best brawl ${r.best.brawl.toLocaleString()} · Best spree ${r.best.spree.toLocaleString()}` : 'Tip: T-bone them. Doors are thin.';
}

const carKeys = Object.keys(ROSTER);
function cycleCar(d) {
  settings.car = carKeys[(carKeys.indexOf(settings.car) + d + carKeys.length) % carKeys.length];
  saveSettings();
  buildShowroom();
  renderMenu();
}
$('car-prev').onclick = () => cycleCar(-1);
$('car-next').onclick = () => cycleCar(1);
$('btn-go').onclick = () => { if (!isLocked(settings.car)) { sound.init(); play(); } };
$('btn-help').onclick = () => showScreen('help');
$('btn-help-close').onclick = () => { store.save('derby.seenHelp', true); showScreen(G.state === 'menu' ? 'menu' : null); };
$('btn-resume').onclick = resume;
$('btn-restart').onclick = () => { showScreen(null); if (G.cup) { G.cup.round = Math.max(0, G.cup.round); nextCupRound(); } else startMatch(G.match.type, G.match.arena); };
$('btn-quit').onclick = toMenu;
$('btn-menu').onclick = toMenu;
$('btn-next').onclick = () => { if ($('btn-next').dataset.next === 'cup') nextCupRound(); else play(); };
$('btn-ff').onclick = () => { G.ff = !G.ff; $('btn-ff').textContent = G.ff ? 'Normal speed ▸' : 'Fast forward ▸▸'; };
window.addEventListener('keydown', e => {
  if (G.state !== 'menu' || $('menu').classList.contains('hidden')) return;
  if (e.code === 'ArrowLeft') cycleCar(-1);
  if (e.code === 'ArrowRight') cycleCar(1);
  if (e.code === 'Enter') $('btn-go').onclick();
});

// ---------- Main loop ----------
let last = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  stage.watchFrameRate((now - last) / 1000);
  const raw = Math.min(0.05, (now - last) / 1000);
  last = now;
  readInput();
  if (G.state === 'menu') {
    menuCamera(raw);
    if (showroom) { stage.focusSun(showroom.car.pos, 20); }
    smoke.update(raw, camera, renderer.domElement.height);
    glow.update(raw, camera, renderer.domElement.height);
    renderer.render(scene, camera);
    return;
  }
  if (G.state === 'paused' || !G.match) { renderer.render(scene, camera); return; }
  // Time: slow motion after the player's takedowns, a short freeze on big hits, fast forward when spectating
  let scale = 1;
  if (G.slowmo > 0) { G.slowmo -= raw; scale = 0.3; }
  if (G.ff) scale = 3;
  if (G.state === 'countdown') {
    const before = Math.ceil(G.match.countdown);
    G.match.countdown -= raw;
    const after = Math.ceil(G.match.countdown);
    if (after !== before && after > 0 && after <= 3) { showMsg(String(after), ARENAS[G.match.arena].name, 1); sound.beep(false); }
    if (G.match.countdown <= 0) { G.state = 'play'; showMsg('CRUNCH!', EVENTS[G.match.type].name, 1); sound.beep(true); sound.cheer(0.6); }
  }
  acc += raw * scale;
  let n = 0;
  while (acc >= DT && n++ < 40) { step(); acc -= DT; }
  if (n >= 40) acc = 0;
  const dt = raw * scale;
  for (const v of vehicles) if (!v.gone && !v.halved) v.pose();
  for (const h of halves) { h.model.position.copy(h.car.pos); h.model.quaternion.copy(h.car.q); }
  effects(dt);
  debris.update(dt);
  smoke.update(dt, camera, renderer.domElement.height);
  glow.update(dt, camera, renderer.domElement.height);
  if (!G.follow || (G.follow.gone && !G.follow.player)) G.follow = vehicles.find(v => v.alive) || vehicles[0];
  if (G.match.type === 'elim' && !vehicles[0].alive && G.follow && !G.follow.alive && G.follow !== vehicles[0]) G.follow = vehicles.find(v => v.alive) || G.follow;
  updateCamera(raw);
  stage.focusSun(G.follow.car.pos, 40);
  // Sound
  const me = vehicles[0], fc = G.follow.car;
  if (G.state !== 'over') {
    sound.engine(me.alive ? me.car.rpm * (me.def.tone || 1) : 0, playerInput.throttle, me.alive);
    const slip = me.alive ? Math.max(...me.car.wheels.map(w => (w.contact && w.slip > 1 ? Math.min(2, w.slip) - 1 : 0))) : 0;
    sound.skid(slip * Math.min(1, Math.abs(me.car.speed) / 6) * 0.7);
    sound.boost(me.boosting ? 1 : 0);
    sound.voices(vehicles.filter(v => !v.player && v.alive).map(v => ({ rpm: v.car.rpm, tone: v.def.tone || 1, d: v.car.pos.distanceTo(fc.pos) }))
      .sort((a, b) => a.d - b.d).slice(0, 3).map(x => ({ ...x, vol: Math.max(0, 1 - x.d / 50) })));
  } else muteLoops();
  // HUD
  if (msgT > 0 && (msgT -= raw) <= 0) $('msg').style.opacity = 0;
  if (G.flash > 0) { flashEl.style.opacity = G.flash; G.flash = Math.max(0, G.flash - raw * 2.5); }
  else if (flashEl.style.opacity !== '0') flashEl.style.opacity = 0;
  updateHud();
  drawLabels();
  renderer.render(scene, camera);
}
const flashEl = document.createElement('div');
Object.assign(flashEl.style, { position: 'fixed', inset: 0, pointerEvents: 'none', opacity: 0,
  background: 'radial-gradient(ellipse at center, transparent 45%, rgba(220,30,20,0.55) 100%)' });
document.body.appendChild(flashEl);

// ---------- Balancing ----------
// Runs AI-only matches without drawing and reports how each car does. From the console:
//   await derby.simulate(20, 'elim', 'bowl')
G.simulate = async (n = 10, type = 'elim', arenaKey = 'bowl', maxTime = 300) => {
  const stats = Object.fromEntries(CORE.map(k => [ROSTER[k].name, { wins: 0, place: 0, takedowns: 0, dealt: 0, score: 0 }]));
  const saved = G.state;
  stats.minutes = 0;
  for (let m = 0; m < n; m++) {
    startMatch(type, arenaKey, { sim: true });
    while (!G.match.over && G.match.time < maxTime) step();
    if (!G.match.over) endMatch();
    stats.minutes += G.match.time / 60 / n;
    standings().forEach((v, i) => {
      const s = stats[v.def.name];
      if (i === 0) s.wins++;
      s.place += (i + 1) / n;
      s.takedowns += v.takedowns / n;
      s.dealt += v.dealt / n;
      s.score += v.score / n;
    });
    await new Promise(r => setTimeout(r, 0));
  }
  G.sim = false;
  G.state = saved;
  return stats;
};
G.debug = { get vehicles() { return vehicles; }, get arena() { return arena; }, step, startMatch, kill, hurt, playerInput, collect, stage };

toMenu();
if (!store.load('derby.seenHelp', false)) showScreen('help');
requestAnimationFrame(frame);
