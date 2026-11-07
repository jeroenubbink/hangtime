// Rushtime: a traffic-crash game on the shared car physics. Thread through traffic down a long run-up,
// building heat with near misses, oncoming lanes, drifts and air; then pick your moment and plough into a
// busy junction. Everything that's wrecked in the pile-up that follows counts, and so does how much heat
// you brought with you.
import * as THREE from 'three';
import { loadCarKits, kitScene, buildCarModel, paintOf, WHEELS, HULL } from '../car.js';
import { Sound } from '../audio.js';
import * as store from '../store.js';
import { createStage, TIMES as STAGE_TIMES } from '../derby/stage.js';
import { Puffs, Debris } from '../derby/fx.js';
import { Vehicle, contact, damageFrom, subdivide } from '../derby/vehicle.js';
import { loadSceneryKit } from '../scenery.js';
import { makeRain } from '../rain.js';
import { City, rng, EDGE } from './city.js';
import { LEVELS as ALL_LEVELS } from './levels.js';
import { Stacks, BOX, LOOSE } from './stacks.js';
import { StandIns } from './standins.js';
import { ITEMS, drawIcon } from '../derby/pickups.js';
import { Traffic } from './traffic.js';
import { Props } from './props.js';
import { buildStation as stationModel, DEBRIS_COLOURS } from './station.js';
import { crane, Boat } from './harbour.js';
import { ruin } from './ruin.js';
import { fixtures } from './fixtures.js';
import { gateway, fit } from './gateway.js';
import { roadsign, warning } from './roadsign.js';
import { depot, flame as sparksFlame } from './depot.js';
import { bank, coin } from './bank.js';
import { Banknotes } from './banknotes.js';
import { Charges } from './charges.js';
import { Blinkers } from './blinkers.js';
import { filmset } from './filmset.js';
import { RIDES, TRAFFIC, TRAFFIC_PAINTS } from './roster.js';
import { Recorder, FLAGS, canSend, send } from './replay.js';
import { Guides } from './guides.js';
import { DEV, LOCAL, setDev, FreeCam, devBar, showRuns, replayBar, library, runsOf, asRoutes, loadRun, snapshot } from './dev.js';
import { Oranges } from './oranges.js';
import { t, tl, translatePage, langButton } from '../i18n.js';
import './nl.js';

const $ = id => document.getElementById(id);
translatePage();
$('btn-help').after(langButton());
const DEBRIS = { door: 'debris-door', doorWin: 'debris-door-window', bumper: 'debris-bumper', plate: 'debris-plate-a', plateB: 'debris-plate-b',
  plateS: 'debris-plate-small-a', spoiler: 'debris-spoiler-a', tyre: 'debris-tire' };
const files = new Set([...Object.values(RIDES), ...Object.values(TRAFFIC)].flatMap(d => [d.file, d.fallback].filter(Boolean)));
await Promise.all([
  ...[...files, ...Object.values(DEBRIS)].map(f => loadCarKits([f]).catch(() => console.info('No model', f))),
  loadSceneryKit().catch(e => console.warn('Scenery not loaded:', e)), loadSceneryKit('derby').catch(() => {}),
  loadSceneryKit('hotel').catch(() => {}), loadSceneryKit('docks').catch(() => {}), loadSceneryKit('works').catch(() => {}), loadSceneryKit('bridge').catch(() => {}), loadSceneryKit('film').catch(() => {}), loadSceneryKit('depot').catch(() => {}), loadSceneryKit('bank').catch(() => {}), loadSceneryKit('roadworks').catch(() => {}), loadSceneryKit('canal').catch(() => {}), loadSceneryKit('canalbridge').catch(() => {}),
]);
$('loading').remove();

const DT = 1 / 120;
const clamp = THREE.MathUtils.clamp;
const NONE = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };
// A wreck (or half of one) rolling slowly to a stop, not on and on across the square at walking pace: whatever it
// still has to hit, it hits at the speed the crash gave it, which this leaves alone (nobody at the wheel, the handbrake
// half on, like a boxed car let go)
const coast = c => (c.vel.lengthSq() < 36 ? LOOSE : NONE);
const KMH = 3.6;
const PRE_INTRO = 4.2, PRE_COUNT = 2.4, PRE_RETRY = 1.2, PRE_ALL = PRE_INTRO + PRE_COUNT;
const FRAGILE = 2.4;
const ZONE = 45;   // metres around where you crashed (and round the junction): whatever crashes in there is part of your crash
const CRASH_MAX = 30, CRASH_QUIET = 5, CRASH_FEED = 6, FOLLOW_YOU = 5, SHOT = 3.5, HOLD = 2, HEAP = 1.5;   // seconds
// Seconds of the (slowed) simulation: something this close to hitting the pile is worth watching (seen coming, so the
// camera's there before it hits)
const INCOMING = 2.5;
// Aim: after the impact you steer your wreck, slowed to AIM_SLOW, for up to AIM seconds (yours, not the simulation's),
// tagging traffic to fill the meter; then it blows, full or not (or sooner, when you set it off with a full meter).
// AIM_TURN: how fast you turn the way it's going (rad/s of simulation), AIM_PUSH: up pushes it on (m/s²), to AIM_TOP m/s.
const AIM = 20, AIM_SLOW = 0.3, AIM_TURN = 3.5, AIM_PUSH = 14, AIM_TOP = 24;
// Tower Dive: off the big ramp, past the top of your flight, time slows to DIVE_SLOW while you're well up, and you
// fly it like a rocket: ↑ and ↓ tip the nose down and up, ← → turn it (rad/s), and nitro (your rush, what you built up on
// the way, or from crates in front of the ramp where there are any: NITRO seconds of a full meter) pushes you the way
// the nose points (m/s²). Gravity in the air is AIR_G times as strong,
// so a flight off a 50° lip at full speed stays over the town. Come down hard (SLAM m/s and up) and it's a crash
// where you land, with a shock wave that sets off the stacks round about.
// (two vehicles further apart than REACH m can't be touching: a bus end to end with a bus, and some)
const REACH = 11;
const DIVE_SLOW = 0.32, PITCH = 2.6, YAW = 2.2, NITRO = 2.5, THRUST = 26, AIR_G = 1.8, SLAM = 16;
const BLOWN = 1.5;   // seconds watching your car blow, from behind where you aimed it, before the crash cam takes over
const BOAT_SHOT = 5;  // seconds (the simulation's) of the yacht going down that the camera stops to watch

// ---------- Stage ----------
const stage = createStage($('view'));
const { scene, camera, renderer } = stage;
// (a near plane further out than the stage's default: the camera never gets that close, and it buys the depth
// buffer the precision to keep far-off ledges and signs from flickering)
camera.near = 0.5;
camera.updateProjectionMatrix();
const sound = new Sound();
const smoke = new Puffs(scene, 1800, { soft: 0.15 });
const glow = new Puffs(scene, 1400, { additive: true, soft: 0.35 });
const rain = makeRain(scene, '#a9bfc2');

// The tracks still in development (`draft`) are only there in dev mode (see dev.js)
const LEVELS = Object.fromEntries(Object.entries(ALL_LEVELS).filter(([, L]) => DEV || !L.draft));

// ---------- Settings & records ----------
// The times of day: the stage's, and Gridlock Leap's own, a hot hazy afternoon, the far end of the street lost in it
const TIMES = { ...STAGE_TIMES,
  haze: { label: 'Haze', sky: ['#9fb6c8', '#d3d6cf', '#ece4cf'], fog: ['#ddd6c3', 40, 430], hemi: ['#f2ead8', '#8a7a5e', 1.7],
    sun: ['#fff1cf', 1.6, [70, 95, 55]], orb: '#fff6de', stars: 0, lamps: 0 },
  // and Short Cut's: rain, a low grey-teal sky, the streets wet and the lamps on early
  rain: { label: 'Rain', sky: ['#33474f', '#5f7a82', '#8ea2a4'], fog: ['#71878a', 60, 480], hemi: ['#b4ccd0', '#3a4642', 1.25],
    sun: ['#d8e6ea', 0.6, [50, 120, 30]], orb: '#8ea2a4', stars: 0, lamps: 0.6, rain: true },
  // and Tanker Row's: first light, before the depot opens: a cold blue sky going peach low down, the sun just up and
  // long shadows across the road, the last of the stars, the lamps not off yet
  dawn: { label: 'Dawn', sky: ['#24406e', '#8fa8d0', '#ffcf9e'], fog: ['#c4c4d2', 130, 620], hemi: ['#b4c4e6', '#4a4252', 1.25],
    sun: ['#ffc890', 1.9, [120, 32, 90]], orb: '#ffe0b8', stars: 0.15, lamps: 0.45 },
  // and Bank Shot's: late afternoon, the rush hour, the sun low behind you and gold on the bank's front, the shadows
  // long across the avenue, a warm haze down the streets
  afternoon: { label: 'Afternoon', sky: ['#2a7fa2', '#8ec3c6', '#ffd49a'], fog: ['#e2cfae', 150, 650], hemi: ['#bcd6d6', '#7a5a3c', 1.35],
    sun: ['#ffd29a', 2.2, [70, 42, 120]], orb: '#ffe6b8', stars: 0, lamps: 0 },
  // and Mind the Gap's: a clear midday by the canal, the sun high and the shadows short under things, a deep clean
  // blue overhead and the far end of the water sharp
  noon: { label: 'Midday', sky: ['#0f6fb0', '#5fb6e0', '#cfeaf2'], fog: ['#cfe6ee', 200, 820], hemi: ['#bfe4f2', '#6e6450', 1.6],
    sun: ['#fffaf0', 2.4, [25, 170, 30]], orb: '#ffffff', stars: 0, lamps: 0 },
};
const settings = Object.assign({ level: 'cross', car: 'comet', time: 'day' }, store.load('rush.settings', {}));
const records = Object.assign({ best: {}, medals: {} }, store.load('rush.records', {}));
if (!LEVELS[settings.level]) settings.level = 'cross';
if (!RIDES[settings.car]) settings.car = 'comet';
if (!TIMES[settings.time]) settings.time = 'day';
// The time of day's picked for each level: until it is, the one the level suggests for its mood (Tower Dive's at
// sunset), or the one that was picked for them all before there was a pick each
// (a draft's kept too, when it isn't shown: it's still there the next time it is)
settings.times = Object.fromEntries(Object.entries(settings.times || {}).filter(([k, t]) => ALL_LEVELS[k] && TIMES[t]));
const timeFor = key => settings.times[key] || LEVELS[key].time || settings.time;
let time = 'day';
// The medal lines are dev mode's, and can be switched off (L)
const devS = { lines: store.load('rush.devLines', true) };
const saveSettings = () => store.save('rush.settings', settings);
// Rushtime's own day and sunset: teal and orange, a cool sky and shade with a warm sun on the cars (and `grade`, how
// far the picture's split, teal in the shadows and orange in the light)
const LOOKS = { ...TIMES,
  day: { ...TIMES.day, sky: ['#1d7fa6', '#6cc2cc', '#f0dcc0'], fog: ['#c2dcd8', 160, 700], hemi: ['#a6d6dc', '#7a5a3c', 1.5],
    sun: ['#fff0dc', 2.3, [60, 110, 40]], orb: '#fff2d8', grade: 1 },
  sunset: { ...TIMES.sunset, sky: ['#1f3460', '#b8678e', '#ffae66'], hemi: ['#ffc4a8', '#2f3c50', 1.1], grade: 0.5 },
  haze: { ...TIMES.haze, grade: 0.4 },
  rain: { ...TIMES.rain, grade: 0.6 },
  dawn: { ...TIMES.dawn, grade: 0.7 },
  afternoon: { ...TIMES.afternoon, grade: 0.9 },
  noon: { ...TIMES.noon, grade: 0.45 },
  // (and night: a deep teal dark, the street lamps and windows and the bridge's own lights doing the rest)
  night: { ...TIMES.night, label: 'Night', sky: ['#020812', '#0a2236', '#163a4c'], fog: ['#0a1c26', 110, 560], hemi: ['#4a7896', '#14110e', 0.5], sun: ['#9fc4ff', 0.55, [25, 120, 18]], grade: 0.7 },
};

// ---------- World ----------
let city = null, props = null, traffic = null, debris = null, oranges = null, notes = null, blinkers = null, charges = null, player = null, guides = null, stacks = null, standIns = null;
const crates = [];
let halves = [];
const G = { state: 'menu', t: 0, heat: 1, rush: 0.4, crash: null, score: 0, shown: 0, wrecked: 0, chain: 0, shake: 0, punch: 0, flash: 0 };
window.rush = G;

// A traffic car: built plain, and only cut into small triangles (so it can crumple) when first hit
const WRECKED = new THREE.Color('#7a7470');
class Car extends Vehicle {
  build() {
    if (!this.def.lazy) return super.build();
    const model = buildCarModel(this.paint, { file: this.def.file, len: this.def.size[1], lights: false });
    this.scene.add(model);
    return model;
  }
  soften(now) {
    if ((this.soft && !now) || !this.def.lazy) return;
    this.soft = true;
    for (const m of this.model.userData.bodyMeshes) {
      const key = this.def.file + ':' + m.name;
      // (from the plain mesh as it was made, not as it is: a boxed car's own is dented by now, and this is every one's)
      if (!soft.has(key)) {
        const g = m.geometry.clone();
        if (m.userData.orig) g.attributes.position.array.set(m.userData.orig);
        soft.set(key, subdivide(g, 0.42));
        g.dispose();
      }
      m.geometry.dispose();
      m.geometry = soft.get(key).clone();
      m.userData.orig = m.geometry.attributes.position.array.slice();
    }
  }
  // (a car from Tower Dive's glass dents in its plain mesh: torn in half like that, the halves are all spikes. The
  // finer one first, then, dents and all lost: there's not much left of it to see)
  split() {
    if (this.stack) this.soften(true);
    return super.split();
  }
  // A wreck keeps its colours, scorched darker (not the derby's charcoal: a pile-up should stay colourful)
  wreck() {
    super.wreck();
    // (its paint as it was kept, for the reel to show it before)
    if (!this.burnt) { this.fresh ??= this.model.userData.paint.color.clone(); this.model.userData.paint.color.set(WRECKED); }
  }
  // Blown up: burnt out, black all over (the livery's still there under the soot, just)
  burn() {
    this.burnt = true;
    this.model.traverse(o => { if (o.isMesh && o.material?.isMeshStandardMaterial) { o.material.color.set('#1b1816'); o.material.roughness = 1; o.material.metalness = 0; } });
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
function makeTraffic(kind, R = G.rand) {
  const def = trafficDef(kind);
  const paint = def.livery || TRAFFIC_PAINTS[Math.floor(R() * TRAFFIC_PAINTS.length)];
  const v = new Car(city, scene, nextId++, def, paint);
  v.kind = kind;
  v.value = def.value;
  const [w, l] = def.size;
  if (l > 6) v.spheres = [-1, -0.5, 0, 0.5, 1].map(k => k * (l / 2 - w / 2));
  v.gen = 0;
  v.colour = paintOf(paint);
  v.setLights(LOOKS[time].lamps);
  if (def.cash) cashSides(v);
  if (kind === 'tanker') sparksSides(v);
  return v;
}

// Every fuel tanker's the depot's: SPARKS on a panel along each side of its tank, the flame beside it
let sparksTex = null;
function sparksSides(v) {
  if (!sparksTex) {
    const cv = document.createElement('canvas');
    cv.width = 1024; cv.height = 256;
    const draw = () => {
      const g = cv.getContext('2d');
      g.fillStyle = '#11898c'; g.fillRect(0, 0, 1024, 256);
      g.fillStyle = '#f4efe2'; g.fillRect(12, 12, 1000, 232);
      g.fillStyle = '#ff8a1a'; g.fillRect(12, 214, 1000, 30);
      sparksFlame(g, 150, 116, 1.75);
      g.fillStyle = '#11898c'; g.textAlign = 'left'; g.textBaseline = 'middle';
      fit(g, 'SPARKS', 720, 170, "900 {}px 'Titillium Web', Impact, sans-serif");
      g.fillText('SPARKS', 262, 118);
    };
    draw();
    sparksTex = new THREE.CanvasTexture(cv);
    sparksTex.colorSpace = THREE.SRGBColorSpace;
    sparksTex.anisotropy = 4;
    document.fonts?.load("900 50px 'Titillium Web'").then(() => { draw(); sparksTex.needsUpdate = true; }).catch(() => {});
  }
  // (round its middle, the flattest of it, between the cab and the hazard diamond at the back)
  const mat = new THREE.MeshStandardMaterial({ map: sparksTex, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(SPARKS.len, SPARKS.len / 4), mat);
    m.rotation.y = s * Math.PI / 2;
    m.position.set(s * SPARKS.x, SPARKS.y, SPARKS.z);
    v.model.add(m);
  }
}
const SPARKS = { x: 1.1, y: 1.15, z: 1.0, len: 2.9 };

// Fiatmine's van: the coin and the name on its roof
let cashTex = null;
function cashSides(v) {
  if (!cashTex) {
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 160;
    const draw = () => {
      const g = cv.getContext('2d');
      g.clearRect(0, 0, 512, 160);
      coin(g, 80, 80, 62);
      g.fillStyle = '#f2b632'; g.textAlign = 'left'; g.textBaseline = 'middle';
      fit(g, t('FIATMINE'), 340, 92, "900 {}px 'Cinzel', serif");
      g.fillText(t('FIATMINE'), 160, 86);
    };
    draw();
    cashTex = new THREE.CanvasTexture(cv);
    cashTex.colorSpace = THREE.SRGBColorSpace;
    document.fonts?.load("900 50px 'Cinzel'").then(() => { draw(); cashTex.needsUpdate = true; }).catch(() => {});
  }
  // (on the roof, across it, read from behind: where you see traffic from)
  const w = v.def.size[0];
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.86, w * 0.27), new THREE.MeshStandardMaterial({ map: cashTex, transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(0, ROOF, 0.4);
  v.model.add(m);
}
const ROOF = 1.62;

function loadLevel(key) {
  if (city?.level === LEVELS[key]) return;
  clearRun();
  city?.dispose();
  props?.dispose();
  city = new City(scene, LEVELS[key]);
  city.key = key;
  // (Dockside Drop's crane over the jetty, and the yacht beside it)
  if (city.level.crane) city.group.add(crane(city, city.level.crane));
  // (and Mind the Gap's old bridge, what's left of it, and the crane lifting a piece of it out)
  if (city.level.ruin) city.group.add(ruin(city, city.level.ruin));
  // (and Gridlock Leap's building site)
  if (city.level.fixtures) city.group.add(fixtures(city, city.level.fixtures));
  // (and Over the Edge's bridge, dressed up)
  if (city.level.gateway) city.group.add(city.gate = gateway(city, city.level.gateway));
  // (and Last Chance's sign up ahead, saying how far to the station)
  if (city.level.roadsign) city.group.add(roadsign(city, city.level.roadsign));
  // (and Tanker Row's depot, and the warnings on the way to it)
  if (city.level.depot) city.group.add(city.depot = depot(city, city.level.depot));
  // (and Bank Shot's bank, across the avenue from the end of your road)
  if (city.level.bank) city.group.add(bank(city, city.level.bank));
  // (and its roadworks' gas and tar, waiting for a blast)
  charges = city.level.charges ? new Charges(city, city.level.charges) : null;
  if (charges) city.group.add(charges.group);
  for (const W of city.level.warnings || []) city.group.add(warning(city, W));
  // (and Short Cut's film shoot, and its two famous corners)
  if (city.level.filmset) city.group.add(filmset(city, city.level.filmset));
  for (const b of G.boats || []) b.dispose();
  G.boats = [].concat(city.level.boat || []).map((B, i) => Object.assign(new Boat(scene, city, B), { i }));
  drawLines();
  // (asked from half a metre up, about where a car's middle would be: a small piece lying on the quay has its middle
  // lower than the quay's edge takes for gone over it, see groundHeight, and would drop through the stone)
  debris = new Debris(scene, (x, z, y) => city.groundHeight(x, z, y + 0.5));
  oranges?.dispose();
  oranges = new Oranges(scene, (x, z, y) => city.groundHeight(x, z, y));
  notes?.dispose();
  notes = new Banknotes(scene, (x, z, y) => city.groundHeight(x, z, y));
  blinkers?.dispose();
  blinkers = new Blinkers(scene);
  time = timeFor(key);
  setLook(time);
}

// The medal lines: the way the best bronze, silver and gold runs kept went (from serve.py's run library)
function drawLines() {
  guides?.dispose();
  guides = null;
  if (!DEV || !devS.lines) return;
  const C = city;
  library().then(list => {
    if (city !== C || guides || !devS.lines) return;
    const routes = asRoutes(runsOf(list, C.key, C.level.medals));
    if (routes.length) guides = new Guides(scene, C, routes);
  });
}

function clearRun() {
  if (traffic) for (const v of traffic.list.slice()) traffic.remove(v);
  traffic = null;
  stacks?.dispose();
  stacks = null;
  standIns?.dispose();
  standIns = null;
  for (const k of crates) dropMesh(k.m);
  crates.length = 0;
  if (player) { player.dispose(); player = null; }
  for (const h of halves) dropHalf(h);
  halves = [];
  debris?.clear();
  blinkers?.clear();
  clearEffects();
}
// Take a one-off effect mesh out of the scene and free its geometry and material
function dropMesh(m) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
// A torn-off half: its triangles are its own (the material is its car's, freed with the car)
function dropHalf(h) { scene.remove(h.model); h.model.traverse(o => o.geometry?.dispose()); }

// Start (or restart) a run on the current level: `pre` seconds of intro and countdown before GO
function startRun(pre) {
  const L = city.level;
  clearRun();
  dress(L);
  // Scripted: the same traffic every time, so a junction can be learned. The traffic always gets exactly
  // PRE_ALL seconds of driving before GO, however much of the intro you watch.
  G.rand = rng(L.seed * 7919 + 17);
  traffic = new Traffic(city, L, (kind, lane) => makeTraffic(kind, lane?.rand), G.rand);
  traffic.populate({ ...L, specials: (L.specials || []).map(s => ({ ...s, eta: s.eta + PRE_ALL })) });
  if (L.stacks) {
    stacks = new Stacks(scene, L.stacks, (x, z) => city.groundHeight(x, z, 1e4), kind => makeTraffic(kind), G.rand);
    traffic.list.push(...stacks.list);
  }
  // (a whole car park of them, far off: boxes, see standins.js. Cars only: a box with a cab on it is no tanker)
  const parked = traffic.list.filter(v => v.lane?.parked && trafficDef(v.kind).size[1] < 6);
  if (parked.length > 12) standIns = new StandIns(scene, parked.map(v => ({ v, size: trafficDef(v.kind).size })));
  for (const [x, z] of L.crates || []) crates.push(crate(x, z));
  mark.at.set(0, 0, 0);
  cam.diveK = 0;
  cam.diveAt = null;
  const def = RIDES[settings.car];
  player = new Car(city, scene, 0, def, def.livery, { player: true, name: 'You' });
  player.gen = 0;
  player.kind = 'you';
  player.colour = paintOf(def.livery);
  player.setLights(LOOKS[time].lamps);
  player.respawn({ x: L.start.x, z: L.start.z, yaw: L.start.yaw || 0 });
  for (let i = 0; i < 60; i++) player.car.step(DT, { ...NONE, brake: 1, stop: true });
  Object.assign(G, { t: 0, pre, heat: 1, rush: 0.4, crash: null, unpaid: null, score: 0, shown: 0, wrecked: 0, chain: 0, shake: 0, punch: 0, flash: 0,
    boosting: false, drifting: false, steer: 0, yaw: 0, drift: 0, geysers: [], air: 0, nearT: 0, oncoming: 0, best: 0, ended: false, slow: 1, spike: 0, tour: null, rec: null,
    nitro: 0, dive: null, stacksDown: 0, tricks: null, arm: null, latch: false, launched: false });
  document.querySelector('#touch .rushb')?.classList.remove('latched');
  G.state = pre > PRE_COUNT ? 'intro' : 'count';
  G.preSteps = Math.round(PRE_ALL * 120);
  skipTo(pre);
  cam.mode = G.state;
  // (behind the car the way it faces: not every road runs toward -z)
  cam.dir.copy(player.forward).setY(0).normalize();
  $('hud').classList.remove('hidden', 'touring');
  $('crashbox').classList.add('hidden');
  $('callouts').innerHTML = '';
  $('pops').innerHTML = '';
  showScreen(null);
  sound.init();
  if (G.state === 'intro') showMsg(t(L.name).toUpperCase(), t(L.blurb), PRE_INTRO);
}

// A nitro crate, as in the derby: blue, floating and turning over its spot
let crateTex = null;
function crate(x, z) {
  if (!crateTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = ITEMS.nitro.colour; g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, 128, 10); g.fillRect(0, 118, 128, 10); g.fillRect(0, 0, 10, 128); g.fillRect(118, 0, 10, 128);
    drawIcon(g, 'nitro', 64, 64, 96);
    crateTex = new THREE.CanvasTexture(c);
    crateTex.colorSpace = THREE.SRGBColorSpace;
  }
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), new THREE.MeshLambertMaterial({ map: crateTex, emissive: '#1a4a80' }));
  const y = city.groundHeight(x, z) + 1.5;
  m.position.set(x, y, z);
  m.castShadow = true;
  scene.add(m);
  return { m, x, y, z, taken: false };
}
// Driving through one fills the tank
function pickCrates() {
  const p = player.car.pos;
  for (const k of crates) {
    if (k.taken || Math.abs(p.x - k.x) > 2.4 || Math.abs(p.z - k.z) > 2.8 || Math.abs(p.y - k.y) > 2.6) continue;
    k.taken = true;
    k.m.visible = false;
    G.nitro = 1;
    sound.beep(true);
    callout(`NITRO<small>${t('for the air: {0}', document.body.classList.contains('touch') ? t('tap RUSH up there') : t('hold Shift'))}</small>`);
    for (let i = 0; i < 30; i++) glow.emit(k.x, k.y, k.z, (Math.random() - 0.5) * 8, Math.random() * 6, (Math.random() - 0.5) * 8, { life: 0.5, size: 0.4, gravity: 6, colour: '#7fd0ff', alpha: 0.9 });
  }
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
// A flame somewhere along a car that's gone up (it burns end to end)
const _bf = new THREE.Vector3();
function burning(v, size) {
  flame(_bf.set((Math.random() - 0.5) * 1.6, 0.6, (Math.random() - 0.5) * v.len * 0.9).applyQuaternion(v.car.q).add(v.car.pos), size);
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
  m.position.set(p.x, city.groundHeight(p.x, p.z, p.y) + 0.03, p.z);
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
  ring(new THREE.Vector3(p.x, city.groundHeight(p.x, p.z, p.y) + 0.08, p.z), '#fff6dc', { grow: 35, life: R / 35, alpha: 0.35 });
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
  // and a fireball that rolls up out of it and hangs there a moment
  for (let i = 0; i < 36 * big; i++) {
    const a = Math.random() * Math.PI * 2, u = Math.random() * 3 * big;
    glow.emit(p.x + Math.cos(a) * u, p.y + 1 + Math.random() * 2, p.z + Math.sin(a) * u, Math.cos(a) * u * 0.6, 4 + Math.random() * 6, Math.sin(a) * u * 0.6,
      { life: 1.2 + Math.random() * 1.2, size: 2.5 + Math.random() * 2.5 * big, grow: 0.4, drag: 2.2, gravity: -1.5, colour: ['#ff6a1a', '#ff9a2e', '#ffc44a', '#e8401a'][i % 4], alpha: 0.85 });
  }
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
function scoreEvent(v, pts, label, big = false, type = 'dent') {
  if (G.state !== 'crash' || G.ended || !v || v.player || !(v.gen > 0)) return;
  const p = Math.round(pts * chainK(v.gen));
  if (p <= 0) return;
  G.score += p;
  G.crash.quiet = 0;
  tally(v, type, p, v.car.pos);
  if (label && big) callout(`${t(label)}<small>+${p.toLocaleString()}</small>`, 'big');
}

// What scored, where: each incident gathers everything scored within a few metres for half a second, then
// pops up its total above the spot (small and yellow for a dent, big and red for well above the average).
// Each vehicle keeps a ledger by damage type, for the wreck report.
const DAMAGE = {
  fall: [t('Sky falls'), '#7fe0ff'],
  dent: [t('Dents'), '#ffd23a'], wreck: [t('Wrecked'), '#ff8a1e'], split: [t('Torn in half'), '#ff3d7a'],
  blast: [t('Blast'), '#ff2a2a'], splash: [t('Splashdown'), '#2ee6ff'], sunk: [t('Sunk'), '#3a7bff'], prop: [t('Street furniture'), '#9be36b'],
  squeezed: [t('Squeezed'), '#ff9a1f'], bank: [t('Bank shot'), '#f2b632'],
};
const NAMES = Object.fromEntries(Object.entries({ hatch: 'Hatchback', coupe: 'Coupé', cab: 'Taxi', saloon: 'Saloon', suv: 'SUV', pickup: 'Pickup',
  police: 'Police car', van: 'Van', garbage: 'Garbage truck', bus: 'Bus', tanker: 'Fuel tanker', lorry: 'Box lorry', flatbed: 'Flatbed', cash: 'Cash van' }).map(([k, n]) => [k, t(n)]));
function tally(v, type, p, pos) {
  const C = G.crash;
  // (`v`: a vehicle, the yacht, something with a row of its own in the ledger (`own`), or null for street furniture)
  const key = v || 'props', boat = v && G.boats.includes(v), own = v?.own;
  let e = C.ledger.get(key);
  if (!e) C.ledger.set(key, e = boat ? { name: t(v.B.name), colour: '#f4f2ec', gen: 0, by: {}, total: 0 }
    : own ? { name: t(own), colour: v.colour, gen: 0, by: {}, total: 0 }
    : v ? { name: NAMES[v.kind] || v.kind, colour: v.colour, gen: v.gen, by: {}, total: 0 } : { name: DAMAGE.prop[0], colour: '#9be36b', gen: 0, by: {}, total: 0 });
  e.by[type] = (e.by[type] || 0) + p;
  e.total += p;
  G.rec?.event(G.t, 'score', { id: boat ? 'boat' + (v.i || '') : v ? v.id : 'props', what: type, pts: p, at: [pos.x, pos.y, pos.z].map(n => Math.round(n * 10) / 10) });
  if (!v || own) C.spots.push({ pos: pos.clone(), p });
  let inc = C.incidents.find(i => !i.el && i.pos.distanceTo(pos) < 9);
  if (!inc) C.incidents.push(inc = { pos: pos.clone(), at: C.rt, total: 0, by: {}, n: 0 });
  inc.n++;
  inc.pos.lerp(pos, 1 / inc.n);
  inc.total += p;
  inc.by[type] = (inc.by[type] || 0) + p;
}
const _pp = new THREE.Vector3();
function updatePops(raw) {
  const C = G.crash;
  if (!C) return;
  const box = $('pops'), W = innerWidth, H = innerHeight;
  for (let i = C.incidents.length - 1; i >= 0; i--) {
    const inc = C.incidents[i];
    if (!inc.el) {
      if (C.rt - inc.at < 0.5) continue;
      // How it compares with the crash so far
      C.popSum += inc.total; C.popN++;
      const r = inc.total / (C.popSum / C.popN), k = clamp(Math.log2(r) / 2 + 0.35, 0, 1);
      const top = Object.entries(inc.by).sort((a, b) => b[1] - a[1])[0][0];
      const el = document.createElement('div');
      el.className = 'pop';
      el.innerHTML = `+${inc.total.toLocaleString()}${top !== 'dent' || inc.n > 2 ? `<small>${DAMAGE[top][0]}${inc.n > 1 ? ' ×' + inc.n : ''}</small>` : ''}`;
      el.style.fontSize = (22.5 + 45 * k * k) + 'px';
      el.style.color = `hsl(${Math.round(52 - 50 * k)}, 100%, ${Math.round(62 - 8 * k)}%)`;
      box.appendChild(el);
      inc.el = el; inc.born = 0;
    }
    inc.born += raw;
    _pp.copy(inc.pos).setY(inc.pos.y + 2 + inc.born * 1.5).project(camera);
    const vis = _pp.z < 1 && inc.born < 1.8;
    inc.el.style.display = vis ? '' : 'none';
    inc.el.style.transform = `translate(${((_pp.x + 1) / 2 * W).toFixed(1)}px, ${((1 - _pp.y) / 2 * H).toFixed(1)}px) translate(-50%, -50%) scale(${Math.min(1, inc.born * 6).toFixed(2)})`;
    inc.el.style.opacity = String(clamp((1.8 - inc.born) / 0.5, 0, 1));
    if (inc.born >= 1.8) { inc.el.remove(); C.incidents.splice(i, 1); }
  }
}
// The wreck report on the results screen: what the damage was, and who took it
function report() {
  const C = G.crash;
  if (!C || !C.ledger.size) return '';
  const rows = [...C.ledger.values()].sort((a, b) => b.total - a.total);
  const types = {};
  for (const e of rows) for (const [t, p] of Object.entries(e.by)) types[t] = (types[t] || 0) + p;
  const sum = Object.values(types).reduce((a, b) => a + b, 0) || 1;
  const order = Object.keys(DAMAGE).filter(t => types[t]);
  const bar = by => order.filter(t => by[t]).map(t => `<i style="flex:${by[t]};background:${DAMAGE[t][1]}"></i>`).join('');
  const most = rows[0].total || 1;
  return `<h3>${t('Wreck report')}</h3>
    <div class="rep-bar">${bar(types)}</div>
    <div class="rep-legend">${order.map(t => `<span><i style="background:${DAMAGE[t][1]}"></i>${DAMAGE[t][0]} <b>${Math.round(types[t] / sum * 100)}%</b></span>`).join('')}</div>
    <div class="rep-list">${rows.slice(0, 8).map((e, i) => `<div class="rep-row" style="animation-delay:${0.15 + i * 0.08}s">
      <span class="chip" style="background:${e.colour}"></span>
      <span class="who">${e.name}${e.gen > 1 ? `<em>${t('chain {0}', e.gen)}</em>` : ''}<small>${Object.entries(e.by).sort((a, b) => b[1] - a[1]).map(([t]) => DAMAGE[t][0]).join(' · ')}</small></span>
      <span class="mini" style="width:${(e.total / most * 100).toFixed(0)}%">${bar(e.by)}</span>
      <span class="num">${e.total.toLocaleString()}</span></div>`).join('')}
    ${rows.length > 8 ? `<div class="rep-more">${t('+ {0} more', rows.length - 8)}</div>` : ''}</div>`;
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
  scoreEvent(X, Math.min(dmg, Math.max(0, was)) * 10 * X.value, null, false, 'dent');
  if (X.hp <= 0 && X.alive) wreck(X, side && dmg >= 30);
}

function wreck(X, split) {
  X.diedAt = G.t;
  // (only a car tears in half: a bus or a lorry just wrecks)
  split = split && X.def.size[1] < 6;
  if (split) {
    halves.push(...X.split().map((h, i) => Object.assign(h, { gen: X.gen, id: X.id + (i ? 'b' : 'a') })));
    X.halved = true;
    while (halves.length > 10) dropHalf(halves.shift());
  } else X.wreck();
  if (X.gen > 0 && G.state === 'crash') G.wrecked++;
  scoreEvent(X, 500 * X.value, split ? 'TORN IN HALF' : X.special ? t('{0} DOWN', NAMES[X.kind].toUpperCase()) : 'WRECKED', !!X.special, split ? 'split' : 'wreck');
  sound.crunch(1);
  // Some go up in flames a moment later; a tanker always does (not one that's gone up already, like the
  // forecourt's cars, which blow before they're wrecked: it would go up, and be thrown, twice)
  if (X.blown) return;
  if (X.def.explosive) X.boomT = 0.25;
  else if (G.rand() < 0.3) X.boomT = 1.5 + G.rand() * 3;
}

// Fire and fury: everything nearby is thrown clear, and hurt
function blowUp(X) {
  X.boomT = null;
  X.blown = true;
  X.blownAt = G.t;
  scorched(X, true);
  G.rec?.event(G.t, 'boom', { id: X.id, kind: X.kind, big: X.def.explosive ? 2 : 1 });
  // (a forecourt car: thrown up and out, and wrecked by it)
  if (X.launch) { launch(X); X.launchT = G.t; if (!X.wrecked && !X.halved) wreck(X, false); }
  const p = X.car.pos.clone(), big = X.def.explosive ? 2 : 1, R = 8 * big;
  explosion(p, big);
  sound.boom(Math.min(1, 0.6 * big));
  if (!X.launch) {
    X.car.vel.y += 7;
    X.car.w.add(_kick.set(G.rand() - 0.5, 0, G.rand() - 0.5).multiplyScalar(4));
  }
  // (a cash van: the money everywhere, and a callout of its own)
  if (X.def.cash) notes.burst(p, X.car.vel);
  scoreEvent(X, 1500 * X.value, X.def.explosive ? 'TANKER BLAST' : X.def.cash ? 'CASH OUT' : 'BLAST', true, 'blast');
  blast(X, p, R, big);
}

// Everything within R of p is thrown clear of X's blast, and hurt (and is part of your crash, if X was)
function blast(X, p, R, big) {
  for (const B of bodies()) {
    if (B === X) continue;
    const d = B.car.pos.distanceTo(p);
    if (d > R) continue;
    const k = 1 - d / R;
    const dir = B.car.pos.clone().sub(p).setY(0).normalize();
    // (a boxed car's glass goes, and it's off; one lying still is woken)
    if (B.held) stacks.release(B, dir, X, G.t, freed);
    B.rest = false;
    // (the forecourt's cars make their own way up, see launch(): no kicks on top until they're back down)
    if (!B.launch || (B.launchT != null && G.t - B.launchT > 3.5)) B.car.vel.addScaledVector(dir, 14 * k * big).add(_kick.set(0, 5 + 6 * k * big, 0));
    B.car.w.add(_kick.set(G.rand() - 0.5, G.rand() - 0.5, G.rand() - 0.5).multiplyScalar(5 * k));
    if (!B.half) {
      // (not you: you start the chain, generation 0, however many blasts have reached you)
      if (!B.gen && B !== player && (X.gen || X === player)) B.gen = (X.gen || 0) + 1;
      G.chain = Math.max(G.chain, B.gen || 0);
      if (B.asleep) B.asleep = false;
      hurt(B, X, 40 * k * big, B.car.pos.clone().addScaledVector(dir, -1), dir);
    }
  }
  startle(p, 70);
  // (a blast beside the petrol station sets it off; or beside the roadworks' gas, or its tar)
  if (canLight(X) && atStation(p, 4)) ignite(p, X);
  if (charges && !G.ended) for (const k of charges.near(p, R)) charge(k, X);
  // (and a tanker going up beside the yacht sends it down; the canal's boats, any blast that reaches them)
  for (const b of G.boats) if ((b.B.frail ? b.dist(p) < R + 2 : X.def.explosive && b.dist(p) < SINK) && b.sink()) sunk(b, X);
  if (G.crash) spike(0.2, 1.1);
  G.shake = Math.max(G.shake, player && player.car.pos.distanceTo(p) < 40 ? 1 : 0.4);
}

// One of the level's charges going up (see charges.js), set off by X's blast: gone, and its bangs to come, each a blast
// of its own (from it, one further down the chain than X); worth something once you've crashed, if it's yours
function charge(k, X) {
  charges.hide(k.i);
  const gen = X === player ? 1 : X.gen ? X.gen + 1 : 0;
  const src = { id: k.id, gen, car: { pos: k.p, vel: new THREE.Vector3(), w: new THREE.Vector3() }, def: {} };
  for (const [delay, big, dx = 0, dz = 0] of k.pops) G.pops.push({ t: G.t + delay, k, src, big, at: k.p.clone().add(_kick.set(dx, 0, dz)) });
  if (G.state === 'crash' && gen > 0 && k.pts) {
    G.score += k.pts;
    G.crash.quiet = 0;
    tally({ own: k.name, id: k.id, colour: '#ff6a1a' }, 'blast', k.pts, k.p);
    callout(`${t(k.callout)}<small>+${k.pts.toLocaleString()}</small>`, 'big');
  }
}
function pops() {
  for (let i = G.pops.length - 1; i >= 0; i--) {
    const P = G.pops[i];
    if (G.t < P.t) continue;
    G.pops.splice(i, 1);
    G.rec?.event(G.t, 'charge', { i: P.k.i, big: P.big, at: [P.at.x, P.at.y, P.at.z].map(n => Math.round(n * 10) / 10) });
    explosion(P.at, P.big);
    sound.boom(Math.min(1, 0.6 * P.big));
    blast(P.src, P.at, 8 * P.big, P.big);
  }
}

// (a bank shot: so long after coming off the bank, and what it's worth)
const BANK_T = 3, BANK_PTS = 6000;

// Down goes the yacht: its own score, its own line in the wreck report and its own heap on the tour
const SINK = 22;
// Short Cut's fruit stand, gone through: oranges everywhere, and it's worth something (paid once the crash has begun, if
// you went through it before)
const STAND = { own: 'Orange stand', id: 'stand', colour: '#ff9a1f' }, STAND_PTS = 5000;
function squeezed(k) {
  const p = k.prop, at = new THREE.Vector3(p.x, p.y + 1, p.z), v = k.vehicle.car.vel;
  G.rec?.event(G.t, 'squeezed', { by: k.vehicle.id });
  oranges.burst(p.x, p.y, p.z, v);
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2, u = 1 + Math.random() * 5;
    glow.emit(at.x, at.y, at.z, Math.cos(a) * u + v.x * 0.2, 1 + Math.random() * 5, Math.sin(a) * u + v.z * 0.2,
      { life: 0.4 + Math.random() * 0.5, size: 0.15 + Math.random() * 0.25, gravity: 10, colour: i % 2 ? '#ffb347' : '#ff8a1a', alpha: 0.9 });
  }
  sound.splash();
  if (!(k.vehicle === player || k.vehicle.gen > 0)) return;
  if (G.state === 'run') { G.standAt = at; (G.unpaid ||= []).push(STAND); }
  else if (G.state === 'crash' && !G.ended) fruit(at);
}
function fruit(at) {
  G.score += STAND_PTS;
  G.crash.quiet = 0;
  tally(STAND, 'squeezed', STAND_PTS, at);
  callout(`${t('FRESH SQUEEZED')}<small>+${STAND_PTS.toLocaleString()}</small>`, 'big');
}
function sunk(B, X) {
  const p = B.spot;
  G.rec?.event(G.t, 'sunk', { by: X.id, boat: B.i });
  // (the camera's shot of it worked out afresh: another boat gone down earlier in the crash had its own)
  if (G.crash) { G.crash.boatFrom = X.car.pos.clone(); G.crash.sank = B; G.crash.boatCam = null; }
  splash(p, 70);
  sound.splash();
  if (G.state !== 'crash' || G.ended) return;
  const pts = B.B.pts;
  G.score += pts;
  G.crash.quiet = 0;
  tally(B, 'sunk', pts, p);
  callout(`${t(B.B.callout || 'SHIP SUNK')}<small>+${pts.toLocaleString()}</small>`, 'big');
}

// The crash zone: around where you crashed, and the junction
function inZone(p) {
  const O = G.crash.origin, [jx, jz] = city.level.junction;
  return Math.hypot(p.x - O.x, p.z - O.z) < ZONE || Math.hypot(p.x - jx, p.z - jz) < ZONE;
}

// Two bodies met (normal from B to A)
function collided(A, B, h) {
  if (A.held) unbox(A, B); else if (B.held) unbox(B, A);
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
  if ((A === player || B === player) && base > 3 && G.crash?.aim && !G.crash.aim.done) tag(A === player ? B : A);
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
  // A bank shot: off the bank and into something, within a few seconds (once each, for what came off it)
  for (const [X, O] of [[A, B], [B, A]]) {
    if (X.bankT == null || X.banked || G.t - X.bankT > BANK_T || base < 4 || O.half) continue;
    X.banked = true;
    const paid = O === player ? X : O;
    scoreEvent(paid, BANK_PTS, 'BANK SHOT', true, 'bank');
  }
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
  // (off Bank Shot's bank: what's thrown into it and comes off it into something else is a bank shot, see collided)
  const K = city.level.bank;
  if (K && G.crash && w.speed > 6 && Math.abs(w.point.x - K.x) < 23 && w.point.z < K.z + 5 && w.point.z > K.z - 31) v.bankT = G.t;
  if (v === player && G.state === 'run' && w.speed > 14) startCrash({ point: w.point, speed: w.speed, normal: w.normal }, null);
  if (w.speed > 4) { sparks(w.point, Math.min(30, 3 + dmg)); if (camera.position.distanceTo(w.point) < 40) sound.crunch(Math.min(1, dmg / 25)); }
  // (the city hands back the wall's normal pointing out of the wall, into the car: the way hurt() wants it)
  if (dmg > 0.5) hurt(v, null, dmg, w.point, w.normal);
}

// ---------- The petrol station ----------
// Fuel's Paradise goes up when something hits it hard enough: a car under the canopy at speed, through a pump
// or a pillar, or a blast beside it (yours to set off, or, once you've crashed, the traffic's). Then the pumps
// blow, the canopy and its logo go, and every car on the forecourt goes up one after another, thrown 10-15 m
// into the air (the lighter, the higher) and out over the junction, to come down on whatever's there.
const canopyMats = {};
const debrisMat = colour => canopyMats[colour] || (canopyMats[colour] = new THREE.MeshLambertMaterial({ color: colour }));
function pillars(S) {
  if (!S) return [];
  return [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([i, k]) => ['pillar', S.x + i * (S.w / 2 - 1.2), S.z + k * (S.d / 2 - 1.2), 0]);
}
// The level's street furniture (the station's pumps and pillars among it) and its petrol station, fresh (and the
// yacht afloat again: behind the menu too, not only in a run)
function dress(L) {
  props?.dispose();
  props = new Props(scene, city, [...(L.props || []), ...pillars(L.station)]);
  props.lamps(LOOKS[time].lamps);
  oranges?.clear();
  notes?.clear();
  charges?.reset();
  G.pops = [];
  for (const b of G.boats) b.reset();
  buildStation(L.station);
}
// (its materials and textures are made once and kept: see station.js)
// (the canopy's faded copies of them are its own, and go with it)
function dropStationPart(m) {
  if (!m) return;
  scene.remove(m);
  m.traverse(o => { o.geometry?.dispose(); for (const x of [o.material || []].flat()) if (x.userData.own) x.dispose(); });
}
function buildStation(S) {
  const T = G.station;
  if (T) for (const k of ['canopy', 'kerbs', 'logo', 'face', 'front']) dropStationPart(T[k]);
  G.station = null;
  if (!S) return;
  const L = city.level, P = L.props || [], sign = P.find(p => p[0] === 'sign');
  const parts = stationModel({ ...S, pumps: P.filter(p => p[0] === 'pump').map(p => [p[1], p[2]]) }, city.top(S.x, S.z),
    sign && [sign[1], sign[2]], L.blocks?.find(b => b.shop));
  for (const m of Object.values(parts)) if (m) scene.add(m);
  G.station = { S, ...parts, lit: false, fx: [] };
}
// Is `p` in under the canopy (or within `m` of it)? (on the forecourt: not on a road down below it, when it's out
// on a bridge)
function atStation(p, m = 0) {
  const S = G.station.S, y = city.top(S.x, S.z);
  return Math.abs(p.x - S.x) < S.w / 2 + m && Math.abs(p.z - S.z) < S.d / 2 + m && p.y > y - 1.5 && p.y < y + S.h + 2;
}
// Until you've crashed only you can set it off
const canLight = v => G.station && !G.station.lit && !G.ended && (v === player || !!G.crash);
function station(all) {
  const T = G.station;
  if (!T) return;
  if (!T.lit) for (const B of all) {
    if (canLight(B) && B.car.vel.length() > 14 && atStation(B.car.pos)) { ignite(B.car.pos, B); break; }
  }
  // The canopy, blown upward, tilting and fading out
  if (T.fly) {
    const F = T.fly, k = (F.t += DT) / 2.5;
    F.vy -= 4 * DT;
    T.canopy.position.y += F.vy * DT;
    T.canopy.rotation.x += F.wx * DT;
    T.canopy.rotation.z += F.wz * DT;
    for (const m of F.mats) m.opacity = Math.max(0, 1 - k * k);
    if (k >= 1) { dropStationPart(T.canopy); T.canopy = null; T.fly = null; }
  }
  // The fireballs over the pumps, one after another
  for (let i = T.fx.length - 1; i >= 0; i--) {
    const f = T.fx[i];
    if ((f.t -= DT) > 0) continue;
    T.fx.splice(i, 1);
    explosion(f.p, f.big);
    sound.boom(0.8);
    G.shake = Math.max(G.shake, 0.8);
    for (const k of props.blast(f.p.x, f.p.z, 7, 10)) scatter(k);
  }
}
// Something's set it off at `p`: `by` (you, or anything else)
function ignite(p, by) {
  const T = G.station, S = T.S;
  p = p.clone();
  T.lit = true;
  G.rec?.event(G.t, 'station', { by: by?.id });
  if (by === player && G.state === 'run') startCrash({ point: p.clone(), speed: player.car.vel.length() }, null);
  callout(t('FILL \'ER UP'), 'big');
  const y = city.top(S.x, S.z);
  // The big one under the canopy, then each pump
  explosion(new THREE.Vector3(S.x, y + 1, S.z), 3);
  sound.boom(1);
  spike(0.12, 1.6);
  G.shake = 1.4;
  G.flash = 0.6;
  const far = q => Math.hypot(q.x - p.x, q.z - p.z);
  props.list.filter(q => q.kind === 'pump' && q.alive).sort((a, b) => far(a) - far(b))
    .forEach((q, i) => T.fx.push({ t: 0.1 + i * 0.14, p: new THREE.Vector3(q.x, q.y + 1, q.z), big: 1.5 }));
  // The canopy's blown off upward, to fade away as it goes; the logo goes off the roof, spinning, and a few
  // bits of the canopy come down
  const mats = [], slab = T.canopy.children[0];
  // (turning about its own middle)
  T.canopy.position.y += slab.position.y;
  slab.position.y = 0;
  T.canopy.traverse(o => {
    if (!o.isMesh) return;
    const fade = m => { const c = m.clone(); c.transparent = true; c.userData.own = true; mats.push(c); return c; };
    o.material = Array.isArray(o.material) ? o.material.map(fade) : fade(o.material);
    o.castShadow = false;
  });
  T.fly = { t: 0, vy: 16, wx: (G.rand() - 0.5) * 0.5, wz: (G.rand() - 0.5) * 0.5, mats };
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(2 + G.rand() * 2, 0.4, 1.5 + G.rand() * 2), debrisMat(DEBRIS_COLOURS[i % DEBRIS_COLOURS.length]));
    m.castShadow = true;
    const q = new THREE.Vector3(S.x + (G.rand() - 0.5) * S.w, y + S.h, S.z + (G.rand() - 0.5) * S.d);
    debris.add(m, q, new THREE.Vector3((q.x - S.x) * 0.6, 8 + G.rand() * 6, (q.z - S.z) * 0.5), { radius: 0.5, spin: 6, life: 20 });
  }
  if (T.logo) {
    scene.remove(T.logo);
    debris.add(T.logo, T.logo.position.clone(), new THREE.Vector3((G.rand() - 0.5) * 4, 22, 7), { radius: 0.6, spin: 4, life: 20 });
    T.logo = null;
  }
  // (out to the corner pillars and a little past)
  for (const k of props.blast(S.x, S.z, Math.hypot(S.w, S.d) / 2 + 1, 8)) scatter(k);
  // Anything else on the forecourt (what set it off, you, whoever was passing) is thrown clear and hurt
  for (const B of bodies()) {
    if (B.lane?.parked || !atStation(B.car.pos, 3)) continue;
    const dir = _kick.set(B.car.pos.x - S.x, 0, B.car.pos.z - S.z).normalize();
    B.car.vel.addScaledVector(dir, 10).y += 9;
    B.car.w.add(_kick.set(G.rand() - 0.5, G.rand() - 0.5, G.rand() - 0.5).multiplyScalar(4));
    if (!B.half) hurt(B, null, 30, B.car.pos.clone().addScaledVector(dir, -1), dir.clone());
  }
  // Every parked vehicle on the forecourt goes up, nearest the blast first
  const lot = traffic.list.filter(v => v.lane?.parked && !v.blown).sort((a, b) => far(a.car.pos) - far(b.car.pos));
  lot.forEach((v, i) => {
    v.asleep = false;
    if (!v.gen) v.gen = (by?.gen || 0) + 1;
    v.launch = true;
    if (v.driver) v.driver.out = true;
    v.boomT = 0.25 + i * 0.16 + G.rand() * 0.1;
  });
  startle(new THREE.Vector3(S.x, y, S.z), 80);
}
// Up and out toward the junction: 10-15 m high, lighter ones higher, coming down 15-35 m away
function launch(X) {
  const c = X.car, [jx, jz] = city.level.junction;
  const h = clamp(15 - (X.def.mass - 1000) / 700, 10, 15), vy = Math.sqrt(2 * 9.81 * h), T = 2 * vy / 9.81;
  const tx = jx + (G.rand() - 0.5) * 30, tz = jz + (G.rand() - 0.5) * 12;
  const dx = tx - c.pos.x, dz = tz - c.pos.z, d = Math.hypot(dx, dz) || 1, hs = clamp(d / T, 3, 12);
  c.vel.set(dx / d * hs, vy, dz / d * hs);
  c.w.set((G.rand() - 0.5) * 5, (G.rand() - 0.5) * 3, (G.rand() - 0.5) * 5);
}
// A prop thrown by a blast, into the debris
function scatter(k) {
  const pc = props.piece(k.prop), T = G.station;
  G.rec?.event(G.t, 'prop', { kind: k.prop.kind, at: [k.prop.x, k.prop.z].map(n => Math.round(n * 10) / 10) });
  // (the price sign's face is the station's: it goes with it)
  if (k.prop.kind === 'sign' && T?.face) {
    scene.remove(T.face);
    T.face.position.set(0, T.face.position.y - pc.pos.y, 0);
    pc.mesh.add(T.face);
    T.face = null;
  }
  debris.add(pc.mesh, pc.pos, k.vel, { radius: pc.radius, spin: 7, life: 14 });
}

// ---------- Tower Dive ----------
const _hp = new THREE.Vector3();
// A car off the stacks that's come to rest stops being simulated (there can be a hundred of them) till something
// touches it, or a blast reaches it
function settle(v) {
  const c = v.car, still = c.vel.lengthSq() < 0.05 && c.w.lengthSq() < 0.05;
  v.stillT = still ? (v.stillT || 0) + DT : 0;
  if (v.stillT > 0.5) { v.rest = true; v.stillT = 0; c.vel.set(0, 0, 0); c.w.set(0, 0, 0); }
}
// A boxed car touched by `by`: its glass goes and it's off, the way it was pushed
function unbox(X, by) {
  const d = _kick.set(by.car.vel.x, 0, by.car.vel.z);
  if (d.lengthSq() < 1) d.set(X.car.pos.x - by.car.pos.x, 0, X.car.pos.z - by.car.pos.z);
  if (d.lengthSq() < 1e-6) d.set(0, 0, -1);
  stacks.release(X, d.normalize(), by, G.t, freed);
}
// A boxed car's let go (by `by`): it's part of your crash, one link on from what set it off; the first out of a
// column topples it, and that's a stack down; a deck's last stack down clears it
const DOWN = new THREE.Vector3(0, -1, 0);
function freed(v, by, first) {
  if (!v.gen) v.gen = (by === player ? 0 : by?.gen || 0) + 1;
  // (its box's glass: panes off every side, flashing as they tumble down)
  const q = v.car.pos;
  for (let i = 0; i < 22; i++) {
    const sx = Math.random() < 0.5 ? -1 : 1, side = Math.random() < 0.5;
    glow.emit(q.x + (side ? sx * 1.35 : (Math.random() - 0.5) * 2.7), q.y + (Math.random() - 0.3) * 2, q.z + (side ? (Math.random() - 0.5) * 5.4 : sx * 2.7),
      (side ? sx : 0) * (1 + Math.random() * 3), 1 + Math.random() * 3, (side ? 0 : sx) * (1 + Math.random() * 3),
      { life: 0.8 + Math.random() * 0.8, size: 0.18 + Math.random() * 0.22, gravity: 12, colour: i % 3 ? '#dff8ff' : '#ffffff', alpha: 0.85 });
  }
  if (camera.position.distanceTo(v.car.pos) < 60) sound.glass();
  if (!first) return;
  G.stacksDown++;
  // (knocked down before the crash has begun, the one you came down into: paid for once it has, see startCrash)
  if (G.state === 'run') (G.unpaid ||= []).push(v);
  else paid(v);
}
// A column down: worth so much, and more for the last on its deck
function paid(v) {
  scoreEvent(v, 1200, null, false, 'fall');
  const deck = v.stack.col.deck, left = stacks.cols.filter(c => c.deck === deck && !c.down).length;
  if (!left) scoreEvent(v, 8000, 'DECK CLEARED', true, 'fall');
  // (every fifth: there are a lot of them, and they go fast)
  else if (G.stacksDown % 5 === 0) callout(t('STACKS {0}/{1}', G.stacksDown, stacks.total));
}
// A long way down: hitting the ground (or what's on it) hard hurts, the harder the higher it came from, anything thrown
// about in a crash (you too); and from high up, for something in yours, it's worth something
function fall(v, ev) {
  if (!G.crash || !ev) return;
  // (coming down onto the ground, or a deck: not into a wall, see wallHit)
  const hit = Math.max(ev.under || 0, ev.ground || 0);
  if (hit < 8) return;
  hurt(v, null, (hit - 6) * 2, v.car.pos.clone(), DOWN);
  if (v.gen && hit > 20) scoreEvent(v, Math.round((hit - 18) * 60 * v.value), hit > 28 ? 'SKYFALL' : null, false, 'fall');
}
// In the air off the big ramp: see DIVE_SLOW
// (`vy0`, `sp0`: how you were going before this step's physics, which a landing has taken most of by now)
function fly(dt, vy0, sp0) {
  const c = player.car, I = playerInput;
  c.vel.y -= 9.81 * (AIR_G - 1) * dt;
  // (off the lip: a kick to the camera and a thump, once a run)
  if (!G.launched && G.air > 0.15 && c.vel.y > 15) { G.launched = true; G.punch = Math.max(G.punch, 9); G.shake = Math.max(G.shake, 0.5); sound.boom(0.35); }
  // (rates in the car's own frame: pitch about its right, yaw about straight up; let go and it steadies)
  // (in the slow motion you turn as fast as ever: it's the world that's slowed)
  const k = G.dive ? 1 / DIVE_SLOW : 1;
  // (the gas you held up the ramp doesn't tip your nose, nor the rush you were burning fire the nitro: each works in
  // the air once you've let go of it)
  const arm = G.arm || (G.arm = { pitch: false, boost: false });
  if (!I.throttle && !I.brake) arm.pitch = true;
  if (!I.boost) arm.boost = true;
  const pitch = arm.pitch ? I.brake - I.throttle : 0;
  _r.set(1, 0, 0).applyQuaternion(c.q);
  _v.copy(_r).multiplyScalar(pitch * PITCH * k).addScaledVector(_up, -I.steer * YAW * k);
  c.w.lerp(_v, 1 - Math.exp(-dt * 6 * k));
  // Tricks: every full turn end over end is a flip, every full turn round a spin, each worth some heat
  const T = G.tricks || (G.tricks = { pitch: 0, yaw: 0, n: 0 });
  T.pitch += c.w.dot(_r) * dt;
  T.yaw += c.w.dot(_up) * dt;
  for (const [key, name, heat] of [['pitch', t('FLIP'), 0.3], ['yaw', t('SPIN 360'), 0.2]]) {
    if (Math.abs(T[key]) < Math.PI * 2 * 0.9) continue;
    T[key] -= Math.sign(T[key]) * Math.PI * 2;
    T.n++;
    G.heat = Math.min(4, Math.round((G.heat + heat) * 10) / 10);
    callout(`${T.n > 1 ? T.n + '× ' : ''}${name}<small>${t('heat +{0}', heat)}</small>`);
    sound.beep(true);
  }
  const tank = fuel(), thrust = (G.latch || (arm.boost && I.boost)) && G[tank] > 0;
  if (thrust) {
    _f.set(0, 0, -1).applyQuaternion(c.q);
    c.vel.addScaledVector(_f, THRUST * dt);
    G[tank] = Math.max(0, G[tank] - dt / NITRO);
  }
  G.boosting = player.boosting = thrust;
  G.airSpeed = c.vel.length();
  // Past the top of the flight and well up: the dive, in slow motion
  const high = c.pos.y - city.groundHeight(c.pos.x, c.pos.z, c.pos.y);
  // (down on its roof or its side, no wheels on the ground: that's a landing too)
  if (G.air > 1 && high < 1.6) {
    landAir();
    slam(Math.min(vy0, c.vel.y), Math.max(sp0, c.vel.length()));
    return;
  }
  if (!G.dive && G.air > 0.5 && c.vel.y < 3 && high > 10) {
    G.dive = { t: 0 };
    const touch = document.body.classList.contains('touch');
    callout(`${t('SKYDIVE')}<small>${t('let go · {0} fly', touch ? '◀▶▲▼' : '↑↓←→')}${G[fuel()] > 0 ? (touch ? t(' · tap RUSH: nitro') : t(' · Shift: nitro')) : ''}</small>`, 'big');
  }
}
// What the nitro burns in the air: the crates' where the level has them, else your rush
function fuel() { return city.level.crates ? 'nitro' : 'rush'; }
// Down from a dive: hard enough, and that's your crash, right there, with a shock wave that sets off the stacks round
// about (wider the faster you came down)
function slam(vy, sp) {
  const c = player.car;
  // (a soft one on a deck: drive on into the stacks if you like; anywhere else, down in the street, that's it)
  const deck = city.groundHeight(c.pos.x, c.pos.z, c.pos.y) > 8, upright = _kick.set(0, 1, 0).applyQuaternion(c.q).y > 0.2;
  if ((sp < SLAM || -vy < 6) && deck && upright) { G.dive = null; return; }
  startCrash({ point: c.pos.clone(), speed: sp }, null, true);
  callout(`${t('SLAM')}<small>${Math.round(sp * KMH)} km/h</small>`, 'big');
}
// The shock of coming down out of the air into anything (a deck, a stack, a deck's edge, the street): dust, a ring on
// the ground, and every boxed car within R set off, thrown outward
function shock(p, R) {
  wave(p, R);
  for (let i = 0; i < 40; i++) puff(p, '#c9c6bf', 2 + Math.random() * 2, 2, 3 + Math.random() * 3, 0.6, 2);
  for (const v of stacks?.near(p, R, 8) || []) {
    const d = _kick.set(v.car.pos.x - p.x, 0, v.car.pos.z - p.z);
    if (d.lengthSq() < 0.01) d.set(1, 0, 0);
    const k = 1 - v.car.pos.distanceTo(p) / R;
    stacks.release(v, d.normalize(), player, G.t, freed);
    v.car.vel.addScaledVector(d, 4 * Math.max(0, k));
  }
}

// ---------- The crash ----------
function startCrash(h, other, fromAir = false) {
  if (G.state !== 'run') return;
  // (out of a dive, how fast you were flying: the hit itself has taken most of it by now)
  const kmh = Math.round(Math.max(player.car.vel.length(), G.dive ? G.airSpeed || 0 : 0) * KMH);
  // (off Tower Dive's ramp, into anything at all: see shock)
  fromAir = city.level.dive && (fromAir || !!G.dive || G.air > 0.5);
  // (on Tower Dive, crashing out of the air still counts the air: on the others, as ever, only coming down does)
  if (city.level.dive) landAir();
  G.state = 'crash';
  G.dive = null;
  const bonus = clamp((kmh - 110) / 110, 0, 1.5);
  G.impact = { kmh, bonus };
  G.heat = Math.round((G.heat + bonus) * 10) / 10;
  const f = player.forward.clone().setY(0).normalize(), v = player.car.vel;
  // (aimed the way it's going; barely going anywhere, the way it faces)
  const yaw = Math.hypot(v.x, v.z) > 2 ? Math.atan2(-v.x, -v.z) : Math.atan2(-f.x, -f.z);
  G.crash = { t: 0, rt: 0, quiet: 0, focus: h.point.clone(), origin: h.point.clone(), subject: player, side: 1, ang: 0, dist: 13, cutT: 0, lastSpike: G.t,
    incidents: [], ledger: new Map(), spots: [], popSum: 0, popN: 0,
    aim: { t: 0, yaw, meter: 0, tagged: new Set(), was: true, done: false } };
  for (const u of G.unpaid || []) u === STAND ? fruit(G.standAt) : paid(u);
  G.unpaid = null;
  // Start the camera low beside the impact, looking across the way you came in
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
  callout(`${t('IMPACT {0} km/h', kmh)}${bonus > 0 ? `<small>${t('heat +{0}', bonus.toFixed(1))}</small>` : ''}`, 'big');
  if (fromAir) shock(h.point, clamp(4 + kmh / 40, 6, 14));
  $('crashbox').classList.remove('hidden');
}

// Aiming your wreck: left and right turn the way it's going (less in the air), up pushes it on, down holds it back
function aim(A, c) {
  const I = playerInput, k = c.pos.y - city.groundHeight(c.pos.x, c.pos.z, c.pos.y + 1) < 1.6 ? 1 : 0.6;
  if (I.steer) {
    const a = -I.steer * AIM_TURN * k * DT;
    c.vel.applyAxisAngle(_up, a);
    A.yaw += a;
  }
  // (the way it's going, while it's going anywhere: what a hit has thrown it into, too)
  const sp = Math.hypot(c.vel.x, c.vel.z);
  if (sp > 4) A.yaw = Math.atan2(-c.vel.x, -c.vel.z);
  // (as hard as the pedal's pressed: a trigger part way, part way)
  if (I.throttle && sp < AIM_TOP) { c.vel.x -= Math.sin(A.yaw) * AIM_PUSH * I.throttle * k * DT; c.vel.z -= Math.cos(A.yaw) * AIM_PUSH * I.throttle * k * DT; }
  if (I.brake) { const b = 1 - 1.5 * I.brake * DT; c.vel.x *= b; c.vel.z *= b; }
  // (setting it off is looked for every frame, in tick: see there)
}

// Something you hit while aiming: each new one tagged fills the meter (a big one more), the same one again a little
function tag(v) {
  const A = G.crash.aim, again = v.half || A.tagged.has(v);
  if (!again) A.tagged.add(v);
  const was = A.meter;
  A.meter = Math.min(1, A.meter + (again ? 0.04 : BIG.has(v.kind) ? 0.4 : 0.3));
  if (again) return;
  sound.beep(true);
  const ready = A.meter >= 1 && was < 1;
  callout(ready ? `${t('EXPLOSION READY')}<small>${document.body.classList.contains('touch') ? t('tap BOOM') : t('Space')}</small>` : t('TAG {0}', A.tagged.size), ready ? 'big' : '');
}

// Your car goes up: as big as a tanker with a full meter, less on the self-destruct with less. It throws you up too.
function detonate(full) {
  const A = G.crash.aim;
  A.done = true;
  A.endT = G.crash.rt;
  const c = player.car, p = c.pos.clone(), big = full ? 2 : 0.6 + 1.4 * A.meter, R = 8 * big;
  G.rec?.event(G.t, 'boom', { id: 'you', kind: settings.car, big: Math.round(big * 100) / 100 });
  player.blown = true;
  player.blownAt = G.t;
  scorched(player, true);
  // (a fat one: the fireball and two more bursting round it, a second shock wave, and a white-out)
  explosion(p, big);
  for (const s of [-1, 1]) explosion(new THREE.Vector3(G.rand() - 0.5, 0, G.rand() - 0.5).normalize().multiplyScalar(2.5 * s).add(p), big * 0.5);
  glow.emit(p.x, p.y + 2, p.z, 0, 0, 0, { life: 0.18, size: 9 * big, grow: 2, colour: '#fff1c4', alpha: 0.8 });
  wave(p, R * 1.6);
  sound.boom(1);
  sound.crash();
  c.vel.y = Math.max(c.vel.y, 0) + 6 + 3 * big;
  c.w.add(_kick.set(G.rand() - 0.5, G.rand() - 0.5, G.rand() - 0.5).multiplyScalar(6));
  blast(player, p, R, big);
  G.shake = 2;
  callout(full ? t('DETONATION') : t('SELF-DESTRUCT'), 'big');
}

function endCrash() {
  G.ended = true;
  const L = city.level, key = city.key;
  const total = Math.round(G.score * G.heat);
  const medal = L.medals.reduce((m, t, i) => (total >= t ? i + 1 : m), 0);
  const before = records.best[key] || 0;
  if (total > before) records.best[key] = total;
  if (medal > (records.medals[key] || 0)) records.medals[key] = medal;
  store.save('rush.records', records);
  $('res-title').textContent = t(medal ? ['', 'BRONZE', 'SILVER', 'GOLD'][medal] : 'NO MEDAL');
  $('res-title').className = ['none', 'bronze', 'silver', 'gold'][medal];
  $('res-rows').innerHTML = [
    [t('Carnage'), G.score.toLocaleString()],
    [t('Heat'), '×' + G.heat.toFixed(1) + (G.impact?.bonus ? ` <small>${t('(impact {0} km/h)', G.impact.kmh)}</small>` : '')],
    [t('Wrecked'), G.wrecked],
    ...(stacks ? [[t('Stacks down'), t('{0} of {1}', G.stacksDown, stacks.total)]] : []),
    [t('Longest chain'), G.chain],
    [`<b>${t('Total')}</b>`, `<b>${total.toLocaleString()}</b>`],
  ].map(([a, b]) => `<tr><td>${a}</td><td class="num">${b}</td></tr>`).join('');
  // (with nothing to report, the card stays narrow)
  const rep = report();
  $('res-report').innerHTML = rep;
  $('res-report').parentElement.classList.toggle('wide', !!rep);
  const next = L.medals.find(t => t > total);
  $('res-note').textContent = total > before && before ? t('New best (was {0})!', before.toLocaleString()) : next ? t('{0} for {1}.', next.toLocaleString(), t(['bronze', 'silver', 'gold'][L.medals.indexOf(next)])) : t('Gold. Nothing left but a higher score.');
  const keys = Object.keys(LEVELS), i = keys.indexOf(key);
  $('btn-next').classList.toggle('hidden', i === keys.length - 1);
  G.rec?.event(G.t, 'end', { score: G.score, heat: G.heat, total, medal, wrecked: G.wrecked, chain: G.chain });
  if (G.rec) { G.rec.next = 0; record(); }
  $('btn-send').classList.add('hidden');
  if (G.rec) canSend().then(ok => { $('btn-send').classList.toggle('hidden', !ok); $('btn-send').disabled = false; $('btn-send').textContent = t('Send replay'); if (ok && DEV) $('btn-send').onclick(); });
  startTour();
}
// This step for the replay: every vehicle, your inputs, and where the camera is looking
const _rl = new THREE.Vector3(), _ri = {};
function record() {
  const list = [];
  const flags = v => (v.wrecked ? FLAGS.wrecked : 0) | (v.alive === false ? FLAGS.dead : 0) | (v.blown ? FLAGS.blown : 0) | (v.halved ? FLAGS.halved : 0) | (v.asleep ? FLAGS.asleep : 0);
  list.push({ id: 'you', kind: settings.car, paint: player.paint, len: player.len, car: player.car, flags: flags(player) });
  for (const v of traffic.list) list.push({ id: v.id, kind: v.kind, paint: v.paint, len: v.len, car: v.car, flags: flags(v), held: v.held });
  for (const h of halves) list.push({ id: h.id, kind: 'half', paint: h.owner.paint, len: 2.3, car: h.car, flags: 0 });
  camera.getWorldDirection(_rl).multiplyScalar(10).add(camera.position);
  // (and Tower Dive's nitro, firing in the air: on a phone it's switched on by a tap, too quick to show as RUSH held)
  G.rec.frame(G.t, G.state, Object.assign(_ri, playerInput, { nitro: !!city.level.dive && G.boosting && G.air > 0 }), list, camera.position, _rl, G.crash?.on);
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
// Down from the air (on the ground, or into something): long enough up there, and it's worth heat and rush
function landAir() {
  if (G.air > 0.45) { callout(`${t('AIR {0}s', G.air.toFixed(1))}<small>${t('heat +{0}', (G.air * 0.15).toFixed(1))}</small>`); G.heat = Math.min(4, G.heat + G.air * 0.15); G.rush = Math.min(1, G.rush + G.air * 0.15); }
  G.air = 0;
  G.tricks = null;
  G.arm = null;
  if (G.latch) { G.latch = false; document.querySelector('#touch .rushb')?.classList.remove('latched'); }
}
function drive(dt) {
  const v = player, c = v.car, def = v.def, I = playerInput;
  const vy0 = c.vel.y, sp0 = c.vel.length();
  // Steering: quick to turn in, quicker to let go, so taps make small corrections
  const want = I.steer;
  const rate = Math.abs(want) > Math.abs(G.steer) && Math.sign(want) === Math.sign(G.steer || want) ? 7 : 12;
  G.steer += clamp(want - G.steer, -rate * dt, rate * dt);
  // (not in the air off Tower Dive's ramp, held on from the run-up: there it's for the nitro, see fly)
  const boosting = I.boost && G.rush > 0.01 && I.throttle > 0 && !(city.level.dive && c.grounded < 2);
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
    G.air += dt;
    if (city.level.dive) { fly(dt, vy0, sp0); return; }
    // In the air: a little yaw from the stick, nothing else
    c.w.y += (-G.steer * 1.1 - c.w.y) * Math.min(1, dt * 2);
    G.yaw = c.w.y;
    return;
  }
  // (down off the big ramp, whether or not it got as far as a dive)
  const flight = city.level.dive && G.air > 1;
  landAir();
  if (G.dive || flight) { slam(vy0, sp0); if (G.state !== 'run') return; }
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
    if (L.spawn || L.parked) continue;
    if (Math.abs(L.lateral(p)) > 1.9) continue;
    const s = L.progress(p), [dx, dz] = L.dir(s);
    if (dx * _f.x + dz * _f.z < -0.6 && s > 0 && s < L.len) return true;
  }
  return false;
}

// Passing close at speed
function nearMisses() {
  const c = player.car;
  _f.set(0, 0, -1).applyQuaternion(c.q).setY(0).normalize();
  _r.set(-_f.z, 0, _f.x);
  for (const v of traffic.list) {
    // (a stack's cars stand still in their boxes: no shaves off them)
    // (nor, on Tower Dive, off anything far below you as you fly over it)
    if (v.asleep || v.stack || (city.level.dive && Math.abs(v.car.pos.y - c.pos.y) > 3)) continue;
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
    callout(`${close ? t('SHAVE') : t('NEAR MISS')}${toward ? ' · ' + t('ONCOMING') : ''}<small>${t('heat +{0}', h.toFixed(2))}</small>`, toward ? 'hot' : '');
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
    else if (!v.half) { scoreEvent(v, 900 * v.value, 'SPLASHDOWN', true, 'splash'); if (v.driver) v.driver.out = true; }
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
  // Record the run, for sending from the results (see replay.js)
  G.rec = new Recorder({ level: city.key, car: settings.car, time, date: new Date().toISOString(),
    screen: [innerWidth, innerHeight], agent: navigator.userAgent });
  player.car.vel.copy(player.forward).multiplyScalar(city.level.start.speed);
  showMsg(t('GO!'), '', 0.8);
  sound.beep(true);
}

function step() {
  G.t += DT;
  if ((G.state === 'intro' || G.state === 'count') && --G.preSteps <= 0) go();
  const running = G.state === 'run' || G.state === 'crash' || G.state === 'tour' || G.state === 'results';
  const c = player.car;
  const fwd = player.forward;
  const focus = G.crash ? { x: G.crash.origin.x, z: G.crash.origin.z, dx: 0, dz: 0 } : { x: c.pos.x, z: c.pos.z, dx: fwd.x, dz: fwd.z, sp: G.state === 'run' ? c.speed : 0 };
  const B = bodies();
  // (in a crash, whatever it's thrown about wakes the traffic it's heading for, however far it flies, and still does
  // once it's lying in the road: a sleeper glides on its lane, through anything that isn't)
  const hot = G.crash ? B.filter(b => b.gen > 0 || b === player).map(b => b.car.pos) : null;
  // (and no more of it coming once a crash is CRASH_FEED seconds in: what's on its way still gets there, and then it's done)
  traffic.update(DT, focus, [...B, ...traffic.list.filter(v => v.asleep)], !G.crash || G.crash.t < CRASH_FEED, G.crash ? G.crash.t : null, hot);
  if (G.state === 'run') { drive(DT); pickCrates(); }
  else if (running) {
    const steering = G.crash?.aim && !G.crash.aim.done;
    if (steering) aim(G.crash.aim, c);
    fall(player, c.step(DT, steering ? NONE : coast(c)));
  }
  {
    for (const v of traffic.list) {
      if (v.asleep || v.halved || v.held) continue;
      // (one come to rest still has its fuse burning)
      if (v.rest) { if (v.boomT != null && (v.boomT -= DT) <= 0) { v.rest = false; blowUp(v); } continue; }
      v.car.wallHit = null;
      const ev = v.car.step(DT, v.wrecked || !v.alive ? coast(v.car) : v.input || NONE);
      fall(v, ev);
      if (v.stack) settle(v);
      if (v.car.wallHit) wallHit(v, v.car.wallHit);
      water(v);
      if (v.boomT != null && (v.boomT -= DT) <= 0) blowUp(v);
    }
    if (running && c.wallHit) { wallHit(player, c.wallHit); c.wallHit = null; }
    if (G.pops?.length) pops();
    if (running) water(player);
    for (const h of halves) { h.car.step(DT, coast(h.car)); water(h); }
    const all = bodies();
    fence(all);
    stacks?.update(G.t, freed);
    // (boxed cars don't touch each other: they stand still till something loose does, so each loose one is only tried
    // against the boxes near it; see the end)
    const loose = stacks ? all.filter(b => !b.held) : all;
    // (with a hundred cars loose off the stacks, sorted along x and only tried against what's within reach that way)
    if (stacks) loose.sort((a, b) => a.car.pos.x - b.car.pos.x);
    for (let i = 0; i < loose.length; i++) for (let j = i + 1; j < loose.length; j++) {
      const A = loose[i], B2 = loose[j];
      if (stacks) {
        if (B2.car.pos.x - A.car.pos.x > REACH) break;
        if (Math.abs(B2.car.pos.z - A.car.pos.z) > REACH || (A.rest && B2.rest)) continue;
        // (one lying still, the other loose: if it's touched, or even moved, it's woken)
        const still = A.rest ? A : B2.rest ? B2 : null;
        if (still) {
          _hp.copy(still.car.pos);
          const h = contact(A, B2);
          if (h || still.car.pos.distanceToSquared(_hp) > 0) still.rest = false;
          if (h) collided(A, B2, h);
          continue;
        }
      }
      // Until you crash the traffic is scripted: it doesn't crash into itself (unless you've had a go at it)
      if (!G.crash && !A.player && !B2.player && !A.gen && !B2.gen) continue;
      const h = contact(A, B2);
      if (h) collided(A, B2, h);
    }
    // (and any touch lets a boxed one go, even one that only pushes it aside without a bump)
    if (stacks) for (const L of loose) {
      if (!G.crash && !L.player && !L.gen) continue;
      for (const X of stacks.around(L.car.pos)) {
        if (!X.held) continue;
        _hp.copy(X.car.pos);
        const h = contact(L, X);
        if (h) collided(L, X, h);
        else if (X.held && X.car.pos.distanceToSquared(_hp) > 0) unbox(X, L);
      }
    }
    for (const k of props.update(all.filter(b => !b.half))) {
      scatter(k);
      sound.thud(4);
      sparks(_pp.set(k.prop.x, k.prop.y + 1, k.prop.z), 8);
      if (k.prop.kind === 'hydrant') G.geysers.push({ p: new THREE.Vector3(k.prop.x, k.prop.y, k.prop.z), t: 7 });
      if (k.prop.kind === 'fruitstand') squeezed(k);
      if (k.vehicle === player && G.state === 'run') G.shake = Math.max(G.shake, 0.35);
      if (G.state === 'crash' && (k.vehicle.gen > 0 || k.vehicle === player)) { G.score += 30; G.crash.quiet = 0; tally(null, 'prop', 30, _pp.set(k.prop.x, k.prop.y, k.prop.z)); }
      if ((k.prop.kind === 'pump' || k.prop.kind === 'pillar') && canLight(k.vehicle) && k.vehicle.car.vel.length() > 8) ignite(k.vehicle.car.pos, k.vehicle);
    }
    station(all);
    for (const b of G.boats) {
      b.update(DT, (p, n) => splash(p, n));
      // (the canal's boats go down under a wreck too: anything in your crash coming down on one, or going into it)
      if (!b.B.frail || b.sunk || G.state !== 'crash' || G.ended) continue;
      const X = all.find(o => (o === player || o.gen > 0) && b.dist(o.car.pos) < 0.4 && o.car.pos.y < b.y + Math.max(...b.B.parts.map(P => P.up)) + 2);
      if (X && b.sink()) sunk(b, X);
    }
    if (G.state === 'run') {
      G.oncoming = oncoming();
      nearMisses();
      // (upside down: a crash; not in the air off Tower Dive's ramp, where you fly it any way up you like)
      if (!(city.level.dive && c.grounded < 2) && new THREE.Vector3(0, 1, 0).applyQuaternion(c.q).y < 0.2) startCrash({ point: c.pos.clone(), speed: c.vel.length() }, null);
    }
  }
  if (G.rec && !G.ended) record();
  if (G.crash && !G.ended) {
    const C = G.crash;
    C.t += DT;
    // (quiet counts from when your car's blown: while you aim the crash can't end, so nothing counts down to it)
    if (C.aim.done) C.quiet += DT;
    // Traffic keeps piling in while there's anything to hit it; after CALM (19 s) the drivers start stopping in
    // time, and at 30 it's over whatever's still flying. Five quiet seconds end it sooner.
    // (not while you're still aiming)
    if ((C.quiet > CRASH_QUIET || C.t > CRASH_MAX) && C.aim.done) endCrash();
  }
}

// The edge of the town: anything thrown out past the buildings along its roads and lots (EDGE m from their edges: the
// pavement and the deepest building) or off the end of the ground meets an invisible wall, and comes down on the outskirts,
// not out in the empty ground beyond them, nor off the world. However far it was going, up to there it flies free.
// (Open ground round a level's junction, and its water, count as in; so does a forecourt, and what's behind it.)
function fence(bs) {
  const [x0, x1, z0, z1] = city.level.bounds, M = 8;
  for (const b of bs) {
    const c = b.car, p = c.pos;
    // (off the ground's ends: straight back in)
    if (p.x < x0 + M && c.vel.x < 0) c.vel.x *= -0.3;
    if (p.x > x1 - M && c.vel.x > 0) c.vel.x *= -0.3;
    if (p.z < z0 + M && c.vel.z < 0) c.vel.z *= -0.3;
    if (p.z > z1 - M && c.vel.z > 0) c.vel.z *= -0.3;
    const d = city.pavedDist(p.x, p.z);
    // (the water's whole rect: a jetty out into it too)
    if (d < EDGE || city.inPark(p.x, p.z) || city.water?.wet(p.x, p.z)) continue;
    // (back toward the nearest paved ground: down the slope of the distance to it)
    const gx = city.pavedDist(p.x + 1, p.z) - city.pavedDist(p.x - 1, p.z), gz = city.pavedDist(p.x, p.z + 1) - city.pavedDist(p.x, p.z - 1), l = Math.hypot(gx, gz);
    if (l < 1e-6) continue;
    const nx = -gx / l, nz = -gz / l, vn = c.vel.x * nx + c.vel.z * nz;
    if (vn < 0) { c.vel.x -= 1.3 * vn * nx; c.vel.z -= 1.3 * vn * nz; }
    p.x += nx * Math.min(0.5, d - EDGE);
    p.z += nz * Math.min(0.5, d - EDGE);
  }
}

// ---------- Input ----------
const keys = new Set();
window.addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  sound.init();
  if (e.repeat) return;
  if (DEV && devKey(e)) return;
  if (e.code === 'KeyR' && city && G.state !== 'menu' && G.state !== 'replay') startRun(PRE_RETRY);
  if (e.code === 'Escape') { if (G.state === 'paused') resume(); else if (['run', 'crash', 'count', 'intro'].includes(G.state)) pause(); }
  if (e.code === 'KeyM') sound.setMuted(!sound.muted);
  if (G.state === 'intro' && ['Space', 'Enter', 'ArrowUp', 'KeyW'].includes(e.code)) { skipTo(PRE_COUNT); G.state = 'count'; }
  if (G.state === 'results' && e.code === 'Enter') startRun(PRE_RETRY);
  if (G.state === 'tour' && e.code === 'Enter') skipTour();
  if (G.state === 'crash' && e.code === 'Enter' && G.crash.t > 2 && G.crash.aim.done) endCrash();
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
    if (pad.buttons[9]?.pressed && !G.padStart) { if (G.state === 'results') startRun(PRE_RETRY); else if (G.state === 'tour') skipTour(); }
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
    // (in the air off Tower Dive's ramp, RUSH is a switch: one thumb can't hold it and tip the nose as well)
    if (key === 'ShiftLeft' && G.state === 'run' && city.level.dive && player.car.grounded < 2 && G.air > 0.2) { G.latch = !G.latch; b.classList.toggle('latched', G.latch); }
  });
  const up = () => { if (key) { keys.delete(key); b.classList.remove('down'); } };
  b.addEventListener('pointerup', up);
  b.addEventListener('pointercancel', up);
}
// (and on a phone the explosion bar is a button too: tap it to blow once it's full)
$('boom').addEventListener('pointerdown', e => {
  e.preventDefault();
  const A = G.crash?.aim;
  if (A && !A.done && !G.ended && A.meter >= 1) detonate(true);
});
if (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) document.body.classList.add('touch');

// ---------- Camera ----------
// The pile: what the crash has hit, round where you crashed (or anywhere, if it's all been thrown further), recent
// hits counting most, and of that the thickest part: the middle of everything within 10 m of the hit with the
// most round it. (The middle of all of it can be bare road between two heaps; where you crashed can be bare road
// once it's all been thrown off it.)
const _pk = [];
function pileCentre(C) {
  const out = new THREE.Vector3();
  _pk.length = 0;
  for (const R of [28, Infinity]) {
    for (const v of traffic.list) {
      if (!(v.gen > 0) || v.touchT == null || v.asleep) continue;
      const p = v.car.pos;
      if (Math.hypot(p.x - C.origin.x, p.z - C.origin.z) > R) continue;
      _pk.push([p, 1 / (1 + Math.max(0, G.t - v.touchT))]);
    }
    if (_pk.length) break;
  }
  const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) < 10 && Math.abs(a.y - b.y) < 4;
  let best = null, bw = 0;
  for (const [p] of _pk) {
    let w = 0;
    for (const [q, k] of _pk) if (near(p, q)) w += k;
    if (w > bw) { bw = w; best = p; }
  }
  if (!best) return out.copy(C.origin);
  let w = 0;
  for (const [q, k] of _pk) if (near(best, q)) { out.addScaledVector(q, k); w += k; }
  return out.divideScalar(w);
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
    // Still driving: what's in its path? (not if it's braking: then it mostly stops short, or swerves past)
    if (v.input?.brake > 0.2) return { k: 0, at: null };
    const hx = c.vel.x / sp, hz = c.vel.z / sp;
    let eta = Infinity, at = null;
    for (const b of all) {
      // (only the crash itself counts: a startled car swerving at the traffic often gets away with it)
      if (b === v || !(b === player || b.gen > 0 || b.half || b.wrecked)) continue;
      const dx = b.car.pos.x - c.pos.x, dz = b.car.pos.z - c.pos.z;
      if (Math.abs(dx) > 50 || Math.abs(dz) > 50 || Math.abs(b.car.pos.y - c.pos.y) > 3) continue;
      const along = dx * hx + dz * hz, miss = Math.abs(dx * hz - dz * hx);
      if (along < 3 || miss > (b.len || 4) / 2 + 1.2) continue;
      // Only something already wrecked, stopped or crossing counts: not the car ahead going the same way
      const bv = b.car.vel.x * hx + b.car.vel.z * hz;
      // (and fast: one braking hard for it mostly stops short)
      if (sp - bv < 8) continue;
      const t = along / (sp - bv);
      if (t < eta) { eta = t; at = b; }
    }
    if (eta < INCOMING) return { k: (30 + sp * 0.5 - eta * 6) * (d < 45 ? 1 : 0.5), at };
    return { k: 0, at: null };
  }
  // A wreck on the move: worth watching near the pile, hardly at all once it's rolled off down the street
  return { k: (sp + c.w.length() * 2) * (d < 30 ? 1 : 0.15), at: null };
}
// What's happening at once round `anchor`: everything worth watching (`ks`: each body's interest()) or hit in the
// last moment, within WIDE_REACH of it, in incidents (whatever's within 7 m of the busiest). Two or more incidents
// that each amount to something: returns the middle of them (weighted by how much is going on) and how far out they
// go (and where each one is). One (however busy): null, the usual shot does that.
const WIDE_REACH = 40, WIDE_MAX = 16, WIDE_HOLD = 8;
const _wc = new THREE.Vector3();
function together(all, ks, anchor) {
  const pts = [];
  for (const v of all) {
    let k = ks.get(v)?.k || 0;
    if (v.touchT != null && G.t - v.touchT < 0.5) k = Math.max(k, 25);
    const p = v.car.pos;
    if (k > 8 && Math.hypot(p.x - anchor.x, p.z - anchor.z) < WIDE_REACH && Math.abs(p.y - anchor.y) < 6) pts.push([p, k]);
  }
  pts.sort((a, b) => b[1] - a[1]);
  const inc = [];
  for (const [p, k] of pts) {
    const I = inc.find(i => Math.hypot(p.x - i.p.x, p.z - i.p.z) < 7);
    if (I) I.k += k; else inc.push({ p, k });
  }
  const big = inc.filter(i => i.k >= 30);
  if (big.length < 2) return null;
  _wc.set(0, 0, 0);
  let w = 0;
  for (const { p, k } of big) { _wc.addScaledVector(p, k); w += k; }
  _wc.divideScalar(w);
  let r = 0;
  for (const { p } of big) r = Math.max(r, Math.hypot(p.x - _wc.x, p.z - _wc.z));
  return { at: _wc, r: r + 5, pts: big.map(i => i.p) };
}
// On a level whose crash is spread wide (a chain going off all along a street, `overview.after` seconds after your car's
// gone up, seen from `overview.from`, the way round it the camera stays: 0 from +z): everything the crash has touched, the latest most (the last few seconds' worth, a fuse burning along), its
// middle and how far it spreads, for one shot over all of it instead of cutting from blast to blast
const OVERVIEW_MIN = 24, OVERVIEW_MAX = 52;
function overview() {
  _wc.set(0, 0, 0);
  const pts = [];
  let w = 0;
  for (const v of traffic.list) {
    if (!(v.gen > 0) || v.touchT == null) continue;
    const k = 1 / (1 + Math.max(0, G.t - v.touchT) / 3);
    _wc.addScaledVector(v.car.pos, k);
    w += k;
    pts.push([v.car.pos, k]);
  }
  if (!w) return null;
  _wc.divideScalar(w);
  // (how far out: past the middle of the weight, the fresh ones counting, the long-done ends of the street not)
  let r = 0;
  for (const [p, k] of pts) if (k > 0.35) r = Math.max(r, Math.hypot(p.x - _wc.x, p.z - _wc.z));
  pts.sort((a, b) => b[1] - a[1]);
  // (what has to be in sight: the freshest few, in the frame; not a wreck thrown off over the roofs)
  const R = clamp(r + 8, OVERVIEW_MIN, OVERVIEW_MAX);
  return { at: _wc, r: R, max: OVERVIEW_MAX, pts: pts.filter(([p]) => Math.hypot(p.x - _wc.x, p.z - _wc.z) < R).slice(0, 5).map(([p]) => p) };
}
// For the opening shot: the junction, which way your road runs to it (u), and which way is the middle of the
// road from your car (w)
function intro() {
  if (cam.intro?.city === city) return cam.intro;
  const L = city.level, [jx, jz] = L.junction, s = L.start;
  const u = new THREE.Vector3(jx - s.x, 0, jz - s.z).normalize();
  const r = city.roads.find(o => { const [a, v] = o.local(s.x, s.z); return a >= 0 && a <= o.len && v >= o.vLo && v <= o.vHi; });
  let w = new THREE.Vector3(-u.z, 0, u.x);
  if (r) { const [, v] = r.local(s.x, s.z), mid = (r.vLo + r.vHi) / 2; w.set(r.rv[0], 0, r.rv[1]).multiplyScalar(v > mid ? -1 : 1); }
  // and how far the pan across it can swing (up to 0.35 rad) and still be over the road, not over a roof beside a narrow one
  const J = new THREE.Vector3(jx, city.groundHeight(jx, jz, 1e4) + 1.5, jz);
  let swing = 0;
  while (swing < 0.35 && [1, -1].every(sg => { const a = sg * (swing + 0.01), c = Math.cos(a), sn = Math.sin(a);
    return city.isRoad(J.x - (u.x * c - w.x * sn) * 26, J.z - (u.z * c - w.z * sn) * 26); })) swing += 0.01;
  return (cam.intro = { city, J, u, w, swing });
}

// ---------- The tour of the wreckage ----------
// When it's over everything stops dead, and after HOLD seconds on the 0 the camera sweeps over what's left, HEAP seconds a heap: the damage
// gathered into a handful of heaps, each named and scored, the biggest last. Then the results, circling the lot.
const BIG = new Set(['bus', 'tanker', 'lorry', 'flatbed', 'garbage']);
const SOLO = {
  bus: ['Last Bus Home', 'Not in Service', 'Request Stop', 'Terminus', 'Standing Room Only'],
  tanker: ['Running on Empty', 'Highly Flammable', 'Premium Unleaded', 'Spilt Milk', 'Fuel for Thought'],
  police: ['Off Duty', 'Case Closed', 'Pulled Over', 'Doughnut Break', 'Blue Lights Out'],
  cab: ['Meter Off', 'Keep the Change', 'Scenic Route', 'Fare Dodger', 'For Hire, Never Again'],
  garbage: ['Taken Out', 'Bin Day', 'Wheelie Bad', 'Fully Recycled', 'Kerbside Collection'],
  van: ['Out for Delivery', 'Return to Sender', 'Left with a Neighbour', 'Handle with Care', 'Signed For'],
};
function heaps() {
  const C = G.crash, items = [];
  for (const [v, e] of C.ledger) {
    if (v === 'props') continue;
    // (the yacht: a heap of its own, where it went down)
    if (G.boats.includes(v)) { items.push({ pos: v.spot, pts: e.total, by: e.by, boat: v }); continue; }
    const hs = halves.filter(h => h.owner === v);
    // (not one that's driven on out of it and gone: there's nothing left there to see)
    if (!hs.length && !traffic.list.includes(v)) continue;
    const pos = hs.length ? hs.reduce((a, h) => a.add(h.car.pos), new THREE.Vector3()).divideScalar(hs.length) : v.car.pos.clone();
    items.push({ pos, v, pts: e.total, by: e.by });
  }
  for (const s of C.spots) items.push({ pos: s.pos, pts: s.p, by: { prop: s.p } });
  // The nearest two heaps (middle to middle) become one, until there are six at most and none closer than 18 m
  // (one on a bridge and one under it are as good as far apart, and so are one up on a roof and one down in the street:
  // together, their middle's in the building between)
  const D = city.deck, over = y => !D || y > D.y - 1.6;
  // (and the yacht's never one with anything else)
  const apart = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) + (over(a.y) !== over(b.y) || Math.abs(a.y - b.y) > 6 || a.boat !== b.boat ? 1000 : 0);
  let gs = items.map(i => ({ items: [i], x: i.pos.x, y: i.pos.y, z: i.pos.z, boat: i.boat || null }));
  for (;;) {
    let bi = -1, bj = -1, bd = Infinity;
    for (let i = 0; i < gs.length; i++) for (let j = i + 1; j < gs.length; j++) {
      const d = apart(gs[i], gs[j]);
      if (d < bd) { bd = d; bi = i; bj = j; }
    }
    if (bi < 0 || (bd > 18 && gs.length <= 6)) break;
    const a = gs[bi], b = gs[bj], na = a.items.length, nb = b.items.length;
    a.x = (a.x * na + b.x * nb) / (na + nb);
    a.y = (a.y * na + b.y * nb) / (na + nb);
    a.z = (a.z * na + b.z * nb) / (na + nb);
    a.items.push(...b.items);
    gs.splice(bj, 1);
  }
  // Street furniture on its own goes with the nearest vehicles (if any are near), the rest of it in one heap
  const cars = gs.filter(g => g.items.some(i => i.v || i.boat)), loose = [];
  for (const g of gs) {
    if (cars.includes(g)) continue;
    const to = cars.filter(o => !o.boat).reduce((a, o) => { const d = apart(o, g); return d < 30 && d < a.d ? { o, d } : a; }, { o: null, d: Infinity }).o;
    if (to) to.items.push(...g.items); else loose.push(...g.items);
  }
  gs = cars;
  if (loose.length) gs.push({ items: loose });
  gs = gs.map(({ items }) => {
    // (`top` from below anything: a heap can lie below 0, down a bank or under a bridge)
    const g = { items, pts: 0, by: {}, c: new THREE.Vector3(), r: 0, top: -Infinity, cars: items.filter(i => i.v) };
    for (const i of items) {
      g.pts += i.pts;
      for (const [t, p] of Object.entries(i.by)) g.by[t] = (g.by[t] || 0) + p;
      g.c.add(i.pos);
    }
    g.c.divideScalar(items.length);
    for (const i of items) { g.r = Math.max(g.r, Math.hypot(i.pos.x - g.c.x, i.pos.z - g.c.z)); g.top = Math.max(g.top, i.pos.y); }
    g.c.y = items.some(i => i.boat) ? city.water.y + 1.5 : city.groundHeight(g.c.x, g.c.z, g.top + 1) + 1;
    outOfBlocks(g.c);
    g.D = clamp(11 + g.r * 1.4, 14, 42);
    g.wrecked = g.cars.filter(i => i.v.wrecked).length;
    return g;
  }).filter(g => g.pts > 0);
  if (!gs.length) return gs;
  // The biggest last, the rest from the furthest from it inwards
  const top = gs.reduce((a, g) => (g.pts > a.pts ? g : a));
  gs.sort((a, b) => (a === top) - (b === top) || b.c.distanceTo(top.c) - a.c.distanceTo(top.c));
  const used = new Set();
  for (const g of gs) g.name = heapName(g, g === top, used);
  return gs;
}
// A name for a heap: the first of these that fits and isn't taken, at random from its handful
function heapName(g, top, used) {
  const C = G.crash, n = g.cars.length, by = t => (g.by[t] || 0) / g.pts;
  const far = Math.hypot(g.c.x - C.origin.x, g.c.z - C.origin.z) > 35;
  const out = [];
  const boat = g.items.find(i => i.boat)?.boat;
  if (boat) out.push(boat.B.titles || ['Abandon Ship', 'Not So Unsinkable', 'Davy Jones', 'Man Overboard', 'Sleeping with the Fishes']);
  if (top && n >= 8) out.push(['The Big Pile', 'Mount Crumple', 'Rush Hour Lasagne', 'The Insurance Claim', 'Scrapheap Summit']);
  if (top && n >= 3) out.push(['The Pile', 'The Car Salad', 'Knotted Up', 'Stacked Deck', 'Some Assembly Required']);
  if (by('splash') > 0.3) out.push(n > 1 ? ['The Deep End', 'Swimming Lessons', 'Park and Swim', 'Sunk Costs', 'Car Wash Deluxe']
    : ['Gone Fishing', 'Taking a Dip', 'Submarine Mode', 'Low Tide Surprise', 'Mind the Wet Paint']);
  if (G.station?.lit && atStation(g.c, 8)) out.push(['Paradise Lost', 'Fill Her Up', 'Unleaded Fury', 'Self-Service', 'Pay at Pump']);
  if (by('blast') > 0.4) out.push(['Ground Zero', 'Well Done', 'Flambé', 'The Barbecue', 'Bang for Your Buck']);
  if (by('split') > 0.2) out.push(['Halves and Have-Nots', 'Two for One', 'Buy One Get Half', 'Fifty-Fifty', 'Sawn in Half, No Magician']);
  if (!n) out.push(['Street Furniture Sale', 'Kerb Appeal', 'Bollard Bowling', 'Lamppost Limbo', 'Public Works']);
  if (n === 1) {
    const v = g.cars[0].v;
    if (!v.wrecked && !v.halved) out.push(['Just a Dent', 'Barely Scratched', 'Walk It Off', 'Flesh Wound', 'Paint Job Pending']);
    if (SOLO[v.kind]) out.push(SOLO[v.kind]);
    out.push(['Lone Wolf', 'Solo Act', 'Party of One', 'Table for One', 'The Wallflower']);
  }
  if (far && n >= 2) out.push(['Stragglers', 'Late Arrivals', 'Fashionably Late', 'Missed the Party', 'The Commuter Belt']);
  if (n === 2) out.push(g.wrecked ? ['Head to Head', 'Two to Tango', 'The Odd Couple', 'Slow Dance', 'Bumper Buddies']
    : ['Fender Bender', 'A Small Disagreement', 'Exchange of Details', 'Bumper Kiss', 'Paint Swap']);
  if (n >= 3) out.push(top ? ['The Main Event', 'Headliner', 'Centre Stage', 'The Showstopper', 'Top of the Bill']
    : ['The Sideshow', 'The Support Act', 'The B-Side', 'Fringe Theatre', 'Warm-Up Act'], ['The Scrum', 'Pile-On', 'Group Hug', 'Bumper Cars', 'Car-Boot Sale']);
  if (BIG.has(g.cars[0]?.v.kind)) out.push(['Heavy Metal', 'Wide Load', 'Big Rig Energy', 'Gross Vehicle Weight', 'Tonnage']);
  out.push(['Collateral', 'Bystanders', 'The Overflow', 'Afterthoughts', 'Loose Change', 'Wrong Place, Wrong Time', 'Spare Parts', 'Odds and Ends', 'The Small Print']);
  for (const names of out.map(tl)) {
    const free = names.filter(s => !used.has(s));
    if (!free.length) continue;
    const name = free[Math.floor(Math.random() * free.length)];
    used.add(name);
    return name;
  }
  return t('Leftovers');
}
function startTour() {
  const C = G.crash, gs = heaps();
  G.state = 'tour';
  // The results go round the whole of it, from far enough out to take it all in
  const centre = new THREE.Vector3(), all = gs.length ? gs : [{ c: C.focus.clone(), pts: 1, r: 8 }];
  let w = 0;
  for (const g of all) { centre.addScaledVector(g.c, Math.sqrt(g.pts)); w += Math.sqrt(g.pts); }
  centre.divideScalar(w);
  // (the middle of heaps on roofs and down in the street, or a crash into a wall, can be inside a building: what goes
  // round it looks at the wall)
  outOfBlocks(centre);
  const spread = Math.max(...all.map(g => Math.hypot(g.c.x - centre.x, g.c.z - centre.z) + g.r));
  const p = camera.position, first = gs[0]?.c || centre;
  // Each heap seen from where nothing's in the way of any of it (its middle, and every car and piece in it), turning as
  // little as it can from the last
  let az = Math.atan2(p.x - first.x, p.z - first.z);
  for (const g of gs) {
    let best = az, bs = Infinity;
    const see = [g.c, ...g.items.slice(0, 8).map(i => i.pos)];
    // (and if no side sees it all, from higher, looking down on it: down a street between tall buildings)
    let bu = 0;
    for (const up of [0, 0.5, 1]) for (let i = 0; i < 24; i++) {
      const a = az + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * Math.PI / 12, turn = Math.abs(Math.ceil(i / 2) * Math.PI / 12);
      tourSpot(g.c, a, g.D, _c, up);
      const hid = see.filter(q => blocked(_c, q)).length / see.length;
      const sc = turn + up * 1.5 + hid * 10 + (city.near(_c.x, _c.z).some(b => !(_c.y < b.floor) && city.blockDist(b, _c.x, _c.z, _w) < 1) ? 5 : 0);
      if (sc < bs) { bs = sc; best = a; bu = up; }
    }
    g.az = az = best;
    g.up = bu;
  }
  const T = G.tour = { gs, t: -HOLD, end: gs.length > 1 ? gs.length * HEAP : gs.length, centre, D: clamp(14 + spread * 1.1, 20, 60), from: p.clone(), fromLook: (C.look || C.focus).clone(),
    fromD: Math.hypot(p.x - first.x, p.z - first.z), az0: Math.atan2(p.x - first.x, p.z - first.z), look: centre.clone(), max: Math.max(1, ...gs.map(g => g.pts)) };
  // (on Tanker Row, first the chain going up again: see the reel)
  T.reel = startReel();
  // How high each move to a heap has to go to clear the roofs under the way it takes (the way it would take down at
  // street level, followed through: every building it would cross, and anything beside them)
  const look = new THREE.Vector3(), at = new THREE.Vector3(), was = new THREE.Vector3(), each = T.end / Math.max(1, gs.length);
  gs.forEach((g, i) => {
    g.roof = -Infinity;
    for (let k = 0; k <= 16; k++) {
      tourPose(T, i * each + k / 16 * each * 0.5, look, at);
      if (k) g.roof = Math.max(g.roof, roofsBetween(was, at));
      was.copy(at);
    }
  });
  $('callouts').innerHTML = '';
}
// A point inside a building, out: through the nearest wall if it's just inside one, else up onto its roof. (Not through
// a wall it shares with the next one along, into that: up onto the roof then too)
const _ob = new THREE.Vector3();
function outOfBlocks(p) {
  const inside = q => city.near(q.x, q.z).find(b => q.y < b.top && !(q.y < b.floor) && city.blockDist(b, q.x, q.z, _w) < 0);
  const b = inside(p);
  if (!b) return p;
  const d = city.blockDist(b, p.x, p.z, _w);
  if (-d < 4 && !inside(_ob.copy(p).addScaledVector(_w, 2 - d))) return p.copy(_ob);
  p.y = b.top + 1.5;
  return p;
}
// Enter (or Start) skips the rest of it, to the results
function skipTour() {
  // (the reel first, if it's on: then the tour)
  if (G.tour.reel) return endReel();
  G.tour.t = Math.max(G.tour.t, G.tour.end);
}

// ---------- The reel ----------
// A level's `reel` ({ kind, min, eyes: [[x, y, z]] }): when the crash set off a chain of `min` or more of `kind`, before
// the tour the chain goes up again, slowed down, from whichever of the `eyes` is nearer where it started (on Tanker
// Row, up in a corner of the depot's yard, along the row with the town behind), a long lens following it along; then
// everything's put back the way it ended up. It's the run's own recording (see replay.js), and the world stands still
// for the tour: posing the wrecks from it disturbs nothing.
const REEL_SPEED = 0.45;
function startReel() {
  const R = city.level.reel, rec = G.rec;
  if (!R || !rec?.frames.length) return null;
  const booms = rec.events.filter(e => e.type === 'boom' && e.kind === R.kind);
  if (booms.length < R.min) return null;
  const t0 = booms[0].t - 0.6, t1 = Math.min(booms[booms.length - 1].t, booms[0].t + 3.5) + 1.2;
  const byId = new Map([['you', player], ...traffic.list.map(v => [v.id, v]), ...halves.map(h => [h.id, h])]);
  // (where each of them is now, to go back to)
  const saved = [...byId.values()].map(v => [v, v.car.pos.clone(), v.car.q.clone(), v.model.visible]);
  // Where they went up: the first, and the middle of them all
  const at = booms.filter(e => e.t <= t1).map(e => reelFrame(rec, e.t).b.find(b => b[0] === e.id)).filter(Boolean).map(b => new THREE.Vector3(b[1], b[2], b[3]));
  const centre = at.reduce((c, p) => c.add(p), new THREE.Vector3()).divideScalar(at.length);
  const eye = new THREE.Vector3(...R.eyes.reduce((e, f) => (_w.set(f[0], at[0].y, f[2]).distanceTo(at[0]) < _rp.set(e[0], at[0].y, e[2]).distanceTo(at[0]) ? f : e)));
  // (the smoke and fire the crash left hanging, cleared: the chain's own come back as it goes)
  clearEffects();
  const el = document.createElement('div');
  el.className = 'reel';
  el.innerHTML = `<span class="rec">${t('REPLAY')}</span><b>${t('AND AGAIN, FROM THE TOP')}</b>`;
  $('pops').appendChild(el);
  $('hud').classList.add('touring');
  return { t: t0, t0, t1, booms: booms.filter(e => e.t <= t1), next: 0, byId, saved, eye, first: at[0], centre, look: at[0].clone(), el };
}
// The recorded frame at or before t
function reelFrame(rec, t) {
  const F = rec.frames;
  let lo = 0, hi = F.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (F[m].t <= t) lo = m; else hi = m - 1; }
  return F[lo];
}
const _rq = new THREE.Quaternion(), _rp = new THREE.Vector3();
function reelTick(raw) {
  const L = G.tour.reel, rec = G.rec, dt = raw * REEL_SPEED;
  L.t += dt;
  if (L.t >= L.t1) return endReel();
  // Everything where it was then (between two frames), burnt or not yet
  const a = reelFrame(rec, L.t), b = rec.frames[Math.min(rec.frames.indexOf(a) + 1, rec.frames.length - 1)];
  const k = b.t > a.t ? clamp((L.t - a.t) / (b.t - a.t), 0, 1) : 0, next = new Map(b.b.map(e => [e[0], e]));
  for (const v of L.byId.values()) v.model.visible = false;
  for (const e of a.b) {
    const v = L.byId.get(e[0]), f = next.get(e[0]) || e;
    if (!v) continue;
    v.car.pos.set(e[1], e[2], e[3]).lerp(_rp.set(f[1], f[2], f[3]), k);
    v.car.q.set(e[4], e[5], e[6], e[7]).normalize().slerp(_rq.set(f[4], f[5], f[6], f[7]).normalize(), k);
    if (v.pose) v.pose(); else { v.model.position.copy(v.car.pos); v.model.quaternion.copy(v.car.q); }
    v.model.visible = !(e[8] & FLAGS.halved);
    reelLook(v, e[8]);
  }
  // and each blast as it comes
  while (L.next < L.booms.length && L.booms[L.next].t <= L.t) {
    const e = L.booms[L.next++], v = L.byId.get(e.id);
    if (!v) continue;
    explosion(v.car.pos, e.big || 2);
    sound.boom(0.6);
  }
  // The camera: a long lens on the first, easing round and opening out to take in the rest as they go, and drifting
  // in a little
  const u = clamp((L.t - L.t0) / (L.t1 - L.t0), 0, 1), e = u * u * (3 - 2 * u);
  L.look.lerpVectors(L.first, L.centre, e);
  camera.position.copy(L.eye).lerp(L.look, u * 0.08);
  camera.up.set(0, 1, 0);
  camera.lookAt(_rp.copy(L.look).setY(L.look.y + 1));
  camera.fov = stage.fitFov(30 + 18 * e);
  camera.updateProjectionMatrix();
  stage.focusSun(L.look, 70);
  smoke.update(dt, camera, renderer.domElement.height);
  glow.update(dt, camera, renderer.domElement.height);
  spreadRings(dt);
}
// How it looked by its `flags` then: burnt out, or wrecked (greyed), or as it came
function reelLook(v, flags) {
  if (v.paints) scorched(v, !!(flags & FLAGS.blown));
  if (v.fresh && !(flags & FLAGS.blown)) v.model.userData.paint.color.copy(flags & FLAGS.wrecked ? WRECKED : v.fresh);
}
// Everything back the way it ended up, and on with the tour
function endReel() {
  const L = G.tour.reel;
  for (const [v, p, q, shown] of L.saved) {
    v.car.pos.copy(p); v.car.q.copy(q);
    if (v.pose) v.pose(); else { v.model.position.copy(p); v.model.quaternion.copy(q); }
    v.model.visible = shown;
    reelLook(v, (v.wrecked ? FLAGS.wrecked : 0) | (v.blown ? FLAGS.blown : 0));
  }
  L.el.remove();
  clearEffects();
  G.tour.reel = null;
}
// Where the camera looks at a heap from: `a` round it, `D` out and up (`up`: 0, at the usual angle; 1, much more
// steeply down on it)
const tourSpot = (c, a, D, out, up = 0) => out.set(c.x + Math.sin(a) * D * (1 - 0.6 * up), c.y + 3 + D * (0.5 + 0.7 * up), c.z + Math.cos(a) * D * (1 - 0.6 * up));
// Where the tour's camera is: HEAP seconds a heap (one on its own, a second), getting there in the first half, then the results
// circle out over the lot
// Where the tour's camera is at `t`, looking at `look` from `out`: on the way to heap i it pulls up and back, and looks
// more steeply down (the further the hop, the more back), so the way from one to the next is seen like a map, and where
// each lies by the last, then pushes in on it; and it's up over the roofs on the way, never through them. Back the heap's index (-1 after the last).
const tourEase = t => t * t * (3 - 2 * t);
function tourPose(T, t, look, out) {
  const n = T.gs.length, END = T.end, each = END / Math.max(1, n);
  let D, az, i = -1;
  if (t < END) {
    i = Math.min(n - 1, Math.floor(t / each));
    const u = (t - i * each) / each, k = tourEase(Math.min(1, u / 0.5));
    const g = T.gs[i], prev = T.gs[i - 1], from = prev ? prev.c : T.fromLook;
    look.lerpVectors(from, g.c, k);
    D = prev ? prev.D + (g.D - prev.D) * k : T.fromD + (g.D - T.fromD) * k;
    D += Math.sin(k * Math.PI) * Math.min(25, Math.hypot(g.c.x - from.x, g.c.z - from.z) * 0.45);
    const a0 = prev ? prev.az : T.az0, u0 = prev ? prev.up : 0;
    az = a0 + (g.az - a0) * k + (u - 0.5) * 0.15;
    tourSpot(look, az, D, out, u0 + (g.up - u0) * k + Math.sin(k * Math.PI) * 0.7);
    // (the first move starts from wherever the crash camera was)
    if (i === 0) out.lerpVectors(T.from, out, k);
    // (and over the roofs on the way: up as it sets off, down only as it gets there)
    if (g.roof > out.y - 5) out.y += (g.roof + 5 - out.y) * Math.min(1, Math.sin(k * Math.PI) * 3);
  } else {
    // (then slowly round the lot)
    const last = T.gs[n - 1], s = t - END, k = tourEase(clamp(s / 1.8, 0, 1));
    look.lerpVectors(last ? last.c : T.centre, T.centre, k);
    D = last ? last.D + (T.D - last.D) * k : T.D;
    az = (last ? last.az + 0.075 : T.az0) + s * 0.08;
    tourSpot(look, az, D, out, last ? last.up * (1 - k) : 0);
  }
  return i;
}
function tourCamera(rawDt) {
  const T = G.tour, END = T.end, each = END / Math.max(1, T.gs.length);
  T.t += rawDt;
  // (by the state, not the clock: a skip puts the clock at the end already)
  if (G.state === 'tour' && T.t >= END) { G.state = 'results'; showScreen('results'); for (const g of T.gs) g.el?.classList.add('gone'); }
  // (first a moment on the 0, everything frozen where it was)
  if (T.t < 0) return;
  $('hud').classList.add('touring');
  const i = tourPose(T, T.t, T.look, _c), g = T.gs[i];
  if (g && T.t - i * each > each * 0.4 && !g.el) heapLabel(g);
  unblock(T.look, _c, null);
  camera.position.lerp(_c, 1 - Math.exp(-rawDt * 8));
  // (between heaps it flies over the roofs, never through them)
  for (const b of city.near(camera.position.x, camera.position.z)) {
    if (camera.position.y < b.top + 1 && !(camera.position.y < b.floor) && city.blockDist(b, camera.position.x, camera.position.z, _w) < 1) camera.position.y = b.top + 1;
  }
  // (out of the deck, and back above the ground if that put it down in a bank)
  clear(T.look, camera.position);
  outside(camera.position);
  camera.lookAt(T.look);
}
function heapLabel(g) {
  const el = document.createElement('div'), k = g.pts / G.tour.max;
  el.className = 'heap';
  // (the yacht's no street furniture: it's named)
  const cars = g.cars.length, boat = g.items.some(i => i.boat), props = g.items.length - cars - (boat ? 1 : 0);
  const what = cars === 1 ? NAMES[g.cars[0].v.kind] + (g.wrecked ? t(' · wrecked') : '') : cars ? t('{0} vehicles', cars) + (g.wrecked ? t(' · {0} wrecked', g.wrecked) : '') : '';
  const sub = [boat ? t(g.items.find(i => i.boat).boat.B.name) : '', what, props ? t('{0} street furniture', props) : ''].filter(Boolean).join(' · ');
  el.innerHTML = `<div class="in"><b>${g.name}</b><span style="font-size:${Math.round(34 + 30 * k)}px;color:hsl(${Math.round(52 - 50 * k)}, 100%, ${Math.round(62 - 8 * k)}%)">+${g.pts.toLocaleString()}</span><small>${sub}</small></div>`;
  for (const o of G.tour.gs) o.el?.classList.add('old');
  $('pops').appendChild(el);
  g.el = el;
  sound.thud(2 + 4 * k);
}
// Keep each heap's label over it on screen
function labelHeaps() {
  const W = innerWidth, H = innerHeight;
  for (const g of G.tour.gs) {
    if (!g.el) continue;
    _pp.set(g.c.x, g.top + 2.5, g.c.z).project(camera);
    g.el.style.display = _pp.z < 1 && Math.abs(_pp.x) < 1.2 && Math.abs(_pp.y) < 1.2 ? '' : 'none';
    g.el.style.transform = `translate(${((_pp.x + 1) / 2 * W).toFixed(1)}px, ${((1 - _pp.y) / 2 * H).toFixed(1)}px) translate(-50%, -100%)`;
  }
}

// Keep the camera clear of what stands between it and the action: buildings (pull in), cars, trees, lamp
// posts and traffic lights (rise over them)
function unblock(look, p, skip) {
  clear(look, p);
  for (const b of bodies()) {
    if (b === skip) continue;
    const q = b.car.pos;
    // (not over one on the bridge from under it, or the other way round)
    if (Math.abs(q.y - p.y) < 5 && Math.hypot(q.x - p.x, q.z - p.z) < (b.len || 2) / 2 + 3) p.y = Math.max(p.y, q.y + 3.5);
  }
  // Up over any tree or post right beside the camera, and anything tall on the line of sight
  for (const q of props.near(p.x, p.z)) {
    if (q.alive && q.h >= 3 && Math.hypot(q.x - p.x, q.z - p.z) < 5) p.y = Math.max(p.y, q.y + q.h + 2);
  }
  for (let tries = 0; tries < 8 && blocked(p, look); tries++) p.y += 1.5;
}
const _s = new THREE.Vector3();
function blocked(from, to) {
  // (a bridge's deck is in the way of anything on it seen from under it, or the other way round)
  const D = city.deck, deck = D && to.y > D.y - 1.6;
  for (let i = 1; i < 10; i++) {
    _s.lerpVectors(from, to, i / 10);
    if (deck && city.inDeck(_s.x, _s.z) && _s.y < D.y + 0.2 && _s.y > D.y - 1.6) return true;
    for (const b of city.seen(_s.x, _s.z)) if (!b.thin && solid(b, _s, 0)) return true;
    for (const q of props.near(_s.x, _s.z)) {
      if (q.alive && q.h >= 3 && _s.y < q.y + q.h + 0.4 && Math.hypot(q.x - _s.x, q.z - _s.z) < (q.kind === 'tree' ? 2.4 : 0.6)) return true;
    }
  }
  return false;
}

const cam = { dir: new THREE.Vector3(0, 0, -1), mode: 'menu', roll: 0, look: new THREE.Vector3(), menuA: 0 };
const _c = new THREE.Vector3(), _l = new THREE.Vector3();
// Keep the camera out of buildings: pull it toward the subject until it's clear
function clear(from, p) {
  for (let i = 0; i < 12; i++) {
    let inside = false;
    for (const b of city.seen(p.x, p.z)) if (solid(b, p, 0.6)) { inside = true; break; }
    if (!inside) break;
    p.lerp(from, 0.2);
  }
  offDeck(from, p);
  p.y = Math.max(p.y, city.groundHeight(p.x, p.z, p.y) + 0.6);
}
// Keep the camera out of a bridge's deck, and from level with it close beside it (where its edge fills the
// view): over it to see what's on it, under it to see what's under it
function offDeck(look, p) {
  const D = city.deck;
  if (!D) return;
  const [a, b, c, d] = D.rect;
  // (looking at something under it, from anywhere above it too: the deck would be all it saw)
  const under = look.y < D.y - 1;
  if (p.x > a - 8 && p.x < b + 8 && p.z > c - 1 && p.z < d + 1 && p.y > D.y - 2.8 && (p.y < D.y + 0.6 || under)) p.y = under ? D.y - 2.8 : D.y + 0.6;
  // (and not in the dark under it, looking out at something that's come out the other side)
  if (look.y < D.y - 1 && p.y < D.y && p.z > c && p.z < d) {
    if (p.x > a - 1 && p.x < b + 1 && look.x > b + 2) p.x = b + 1.5;
    else if (p.x > a - 1 && p.x < b + 1 && look.x < a - 2) p.x = a - 1.5;
  }
}
// Keep the camera out of vehicles, wherever they lie and however they're turned: from inside one, up over it
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
function outside(p) {
  // (again after a lift, which can put it in one stacked on top; under a bridge, never up into its deck: out to
  // the side instead)
  const D = city.deck, cap = D && city.inDeck(p.x, p.z, 8) && p.y < D.y - 1.6 ? D.y - 2.2 : Infinity;
  for (let pass = 0; pass < 4 && liftOut(p, cap); pass++);
}
function liftOut(p, cap) {
  let moved = liftOver(p, player, cap);
  for (const b of traffic.list) moved = liftOver(p, b, cap) || moved;
  for (const b of halves) moved = liftOver(p, b, cap) || moved;
  return moved;
}
// From inside `b`, up over it (true if it moved)
function liftOver(p, b, cap = Infinity) {
  if (!b || b.halved) return false;
  const c = b.car, big = b.len > 6;
  let w = (b.def ? b.def.size[0] / 2 : 1) + 0.5, l = (b.len || 2.2) / 2 + 0.5, lo = -1.2, hi = big ? 3.6 : 1.9;
  // (a car in Tower Dive's glass: the box round it, which is bigger)
  if (b.held) { w = BOX.w / 2 + 0.3; l = BOX.l / 2 + 0.3; lo = -1.1; hi = BOX.h - 0.6; }
  if (Math.abs(p.x - c.pos.x) > l + w || Math.abs(p.z - c.pos.z) > l + w) return false;
  _s.copy(p).sub(c.pos).applyQuaternion(_q.copy(c.q).invert());
  if (Math.abs(_s.x) > w || Math.abs(_s.z) > l || _s.y < lo || _s.y > hi) return false;
  // (the top of its box, turned the way it is)
  const e = _m.makeRotationFromQuaternion(c.q).elements, hy = (hi - lo) / 2;
  const top = c.pos.y + e[5] * (hi + lo) / 2 + Math.abs(e[1]) * w + Math.abs(e[5]) * hy + Math.abs(e[9]) * l + 0.3;
  if (top <= cap) { p.y = top; return true; }
  // (no room over it: out the nearer side)
  if (w - Math.abs(_s.x) < l - Math.abs(_s.z)) _s.x = Math.sign(_s.x || 1) * (w + 0.05);
  else _s.z = Math.sign(_s.z || 1) * (l + 0.05);
  p.copy(_s.applyQuaternion(c.q).add(c.pos));
  return true;
}
// The yacht going down: from out over the water past it, the blast that did it behind, round toward the shore (where
// its name is), drifting in a little; then a cut back to the crash cam
const _bs = new THREE.Vector3();
function boatShot(rawDt) {
  const C = G.crash, b = C.sank.B, f = C.boatFrom, W = city.water.y;
  if (!C.boatCam) {
    let dx = b.x - f.x, dz = b.z - f.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    // (square to that, the way that's toward the shore: the water's on the -z side of it)
    const k = dx < 0 ? 1 : -1, px = dz * k, pz = -dx * k;
    // (or out over the open water from it, for a boat moored along a wall)
    C.boatCam = { p: b.out ? new THREE.Vector3(b.x + b.out[0] * 20 - dx * 6, W + 7, b.z + b.out[1] * 20 - dz * 6) : new THREE.Vector3(b.x + dx * 16 + px * 14, W + 7, b.z + dz * 16 + pz * 14), l: new THREE.Vector3(b.x * 0.75 + f.x * 0.25, W + 1.5, b.z * 0.75 + f.z * 0.25) };
    camera.position.copy(C.boatCam.p);
  }
  const k = C.sank.sunk.t / BOAT_SHOT;
  _bs.copy(C.boatCam.p).lerp(C.boatCam.l, 0.18 * k);
  camera.position.lerp(_bs, 1 - Math.exp(-rawDt * 4));
  clear(C.boatCam.l, camera.position);
  outside(camera.position);
  camera.up.set(0, 1, 0);
  camera.lookAt(C.boatCam.l);
  C.on = 'boat';
  // (and once it's done, straight to wherever the crash cam is, not a swoop across the harbour)
  C.cutNow = true;
}
// Where the crash camera follows `S` from: behind it, the way it's going, and out to `side`, up a little
const _b = new THREE.Vector3();
function inBlock(p, m = 0.6) {
  for (const b of city.seen(p.x, p.z)) if (solid(b, p, m)) return true;
  return false;
}
// Whether `p` is in `b` (a building, or what only the camera keeps out of, see City.screen), or within `m` of it; and
// with any room, as far from it as it asks (a crane's steel, close up, is all you'd see)
function solid(b, p, m) {
  const pad = m > 0 ? b.pad || 0 : 0;
  return p.y < b.top + pad && !(p.y < b.floor - pad) && city.blockDist(b, p.x, p.z, _w) < m + pad;
}
const _rt = new THREE.Vector3();
function roundTo(p, c) {
  const a0 = Math.atan2(c.x - p.x, c.z - p.z), r = Math.hypot(c.x - p.x, c.z - p.z), h = c.y - p.y;
  for (const up of [0, 6, 14]) {
    for (let i = 1; i <= 15; i++) {
      const a = a0 + Math.ceil(i / 2) * 0.4 * (i % 2 ? 1 : -1);
      _rt.set(p.x + Math.sin(a) * r, p.y + h + up, p.z + Math.cos(a) * r);
      if (!inBlock(_rt) && !blocked(_rt, p)) return c.copy(_rt);
    }
  }
  // (nowhere round it: from straight over it)
  return c.set(p.x + Math.sin(a0) * 2, p.y + h + 18, p.z + Math.cos(a0) * 2);
}
function behind(S, side) {
  const p = S.car.pos, v = S.car.vel, sp = Math.hypot(v.x, v.z), C = G.crash;
  const d = sp > 3 ? _f.set(v.x / sp, 0, v.z / sp) : C.dir || S.forward.clone().setY(0).normalize();
  return _b.set(p.x - d.x * 9 + d.z * 4 * side, p.y + 3.6, p.z - d.z * 9 - d.x * 4 * side);
}
// The top of the highest building that the way from `a` to `b` crosses and that's taller than its lower end (-Infinity
// for none). By where it goes over the ground only, not how high: else lifting over it would clear it, drop, and
// lift again.
function roofsBetween(a, b) {
  let top = -Infinity;
  const low = Math.min(a.y, b.y), n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 2);
  for (let i = 1; i < n; i++) {
    _s.lerpVectors(a, b, i / n);
    for (const k of city.near(_s.x, _s.z)) if (k.floor == null && k.top > low && k.top > top && city.blockDist(k, _s.x, _s.z, _w) < 0.5) top = k.top;
  }
  return top;
}
// In a dive: where you'll come down if you do nothing more (a ring there, and dots along the way), orange on a
// deck, white anywhere else
const mark = (() => {
  // (seen through whatever's in the way: a stack, your own car)
  const ring = new THREE.Mesh(new THREE.RingGeometry(3, 4.2, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false, depthTest: false, fog: false }));
  const N = 60, dots = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3)),
    new THREE.PointsMaterial({ color: '#ffffff', size: 6, sizeAttenuation: false, transparent: true, opacity: 0.7, depthWrite: false, depthTest: false, fog: false }));
  ring.renderOrder = dots.renderOrder = 50;
  ring.visible = dots.visible = false;
  scene.add(ring, dots);
  const p = new THREE.Vector3(), v = new THREE.Vector3(), at = new THREE.Vector3();
  return {
    at,
    update() {
      const on = !!G.dive && G.state === 'run';
      ring.visible = dots.visible = on;
      // (and nowhere, out of a dive: the next one starts from where it is then, not where the last came down)
      if (!on) { at.set(0, 0, 0); return; }
      p.copy(player.car.pos); v.copy(player.car.vel);
      const pos = dots.geometry.attributes.position, h = 0.05;
      let k = 0, g = 0, hit = null, wall = false;
      const boxes = stacks ? stacks.list.filter(b => b.held) : [];
      const drag = 0.7 / player.car.mass;      // (the car's own: see car.js)
      for (let i = 0; i < 400 && !hit; i++) {
        v.y -= 9.81 * AIR_G * h;
        v.multiplyScalar(1 - drag * v.length() * h);
        p.addScaledVector(v, h);
        g = city.groundHeight(p.x, p.z, p.y);
        // (back to where it crossed, between the last step and this: else the ring, and the camera looking at it, jump on
        // a step at a time as you fly)
        if (p.y <= g + 0.3) { p.addScaledVector(v, -h * Math.min(1, (g + 0.3 - p.y) / Math.max(1e-3, -v.y * h))); break; }
        // (or short, into a deck's face, or a tower's: that's where you'll hit)
        if (inBlock(p, 0.3)) { wall = true; break; }
        // (or into a stack)
        for (const b of boxes) { const q = b.car.pos; if (Math.abs(q.y - p.y) < 1.6 && Math.abs(q.x - p.x) < 2.2 && Math.abs(q.z - p.z) < 3.4) { hit = b; break; } }
        if (i % 3 === 2 && k < N) pos.setXYZ(k++, p.x, p.y, p.z);
      }
      if (hit || wall) g = p.y - 0.15;
      for (let i = k; i < N; i++) pos.setXYZ(i, p.x, g + 0.3, p.z);
      pos.needsUpdate = true;
      ring.position.set(p.x, g + 0.15, p.z);
      at.copy(ring.position);
      ring.material.color.set(hit ? '#ff5a1f' : g > 12 && !wall ? '#ffd23a' : '#ffffff');
      ring.scale.setScalar(1 + 0.15 * Math.sin(G.t * 12));
    },
  };
})();
function updateCamera(dt, rawDt) {
  const c = player.car;
  let fov = 66;
  camera.up.set(0, 1, 0);
  if (G.state === 'intro') {
    // The junction first, panning across it from over your road; then back down the road to your car, and
    // round beside it to behind, ready for the countdown. It stays over the road all the way: nothing in the way.
    const k = clamp((PRE_ALL - G.pre) / PRE_INTRO, 0, 1), I = intro();
    const ease = t => t * t * (3 - 2 * t);
    const car = c.pos, J = I.J;
    // (from over the roofs round it, kept low for this: the junction laid out below, and what's round it)
    const pan = a => _c.set(J.x - (I.u.x * Math.cos(a) - I.w.x * Math.sin(a)) * 26, J.y + 19, J.z - (I.u.z * Math.cos(a) - I.w.z * Math.sin(a)) * 26);
    const look = new THREE.Vector3();
    if (k < 0.35) {
      pan(I.swing * (2 * ease(k / 0.35) - 1));
      look.copy(J);
    } else if (k < 0.78) {
      const t = ease((k - 0.35) / 0.43);
      const from = pan(I.swing).clone(), to = _l.copy(car).addScaledVector(I.u, 10).setY(car.y + 3.6);
      _c.lerpVectors(from, to, t);
      _c.y += Math.sin(t * Math.PI) * 6;
      look.lerpVectors(J, car, ease(Math.min(1, t * 1.6)));
    } else {
      // Round beside it (on the side toward the middle of the road) to behind
      const t = ease((k - 0.78) / 0.22), a = t * Math.PI, R = 10 + (6.3 - 10) * t;
      _c.copy(car).addScaledVector(I.u, Math.cos(a) * R).addScaledVector(I.w, Math.sin(a) * R);
      _c.y = car.y + 3.6 + (2.05 - 3.6) * t;
      look.copy(car).addScaledVector(I.u, 7 * t);
    }
    camera.position.copy(_c);
    camera.lookAt(look.x, look.y + 1, look.z);
    cam.dir.copy(I.u);
    fov = 58 + 6 * clamp((k - 0.78) / 0.22, 0, 1);
  } else if (G.tour) {
    tourCamera(rawDt);
    fov = 56;
  } else if (G.crash?.aim && (!G.crash.aim.done || G.crash.rt - G.crash.aim.endT < BLOWN) && G.state !== 'run') {
    // Aiming: up behind your wreck, the way it's going, looking ahead to what's there to hit (so left is always left);
    // when it blows, pulling back and up to see it go
    const A = G.crash.aim, k = A.done ? clamp((G.crash.rt - A.endT) / 0.6, 0, 1) : 0;
    if (!A.done) cam.dir.lerp(_f.set(-Math.sin(A.yaw), 0, -Math.cos(A.yaw)), 1 - Math.exp(-rawDt * 4)).normalize();
    _c.copy(c.pos).addScaledVector(cam.dir, -12 - 14 * k);
    _c.y = Math.max(c.pos.y, city.groundHeight(_c.x, _c.z, c.pos.y + 2)) + 5.5 + 9 * k;
    clear(c.pos, _c);
    camera.position.lerp(_c, 1 - Math.exp(-rawDt * 6));
    // (and on its way there, never in one either)
    clear(c.pos, camera.position);
    // (on Tower Dive the stacks are still coming down round you: up out of any car, or box, that's where it is)
    if (city.level.dive) outside(camera.position);
    _l.copy(c.pos).addScaledVector(cam.dir, 12).setY(c.pos.y);
    camera.lookAt(_l);
    fov = 68;
  } else if (G.crash && G.state !== 'run' && G.crash.sank?.sunk && G.crash.sank.sunk.t < BOAT_SHOT && G.crash.boatFrom) {
    boatShot(rawDt);
    fov = 50;
  } else if (G.crash && G.state !== 'run') {
    // Crash cam: it follows the action. First your car, wherever it goes; then whatever's most worth
    // watching (something about to hit, or a wreck still flying), held at least SHOT seconds unless it comes
    // to rest. It looks a little ahead of its subject, toward what it's going to hit, and leans to the pile.
    // (it takes over BLOWN seconds after your car's gone up: `since` is how long ago that was)
    const C = G.crash, since = C.rt - C.aim.endT;
    C.cutT += rawDt;
    // (and on the simulation's own clock, slowed in the crash: the one what's coming gets there on)
    C.cutS = (C.cutS || 0) + dt;
    const all = bodies().filter(b => !b.half);
    const pile = pileCentre(C);
    C.focus.lerp(pile, 1 - Math.exp(-rawDt * 2));
    const ks = new Map();
    for (const v of all) ks.set(v, interest(v, all));
    // Several things going on at once near what it's watching: pull back to get them all in one shot (but no
    // further than keeps each car a car), instead of cutting about between them. Back in once it's down to one for
    // a second.
    // (round what it's framing already, so it can drift along with the action; else round what it's watching)
    // (each shot held a while, wide or not: none in for under 2 s, out again, and in again)
    C.wideT = (C.wideT || 0) + rawDt;
    const over = city.level.overview && since >= city.level.overview.after;
    const T = over ? overview() : together(all, ks, C.wide ? C.wide.at : C.subject ? C.subject.car.pos : C.focus);
    // (overview: once it's up there it stays, the whole crash long)
    // (taking over from an ordinary wide shot that's up when it starts: held from here on, that one would never let go)
    if (over) { if (T && (!C.wide || C.wide.from == null)) { C.wide = { at: T.at.clone(), r: T.r, max: T.max, from: city.level.overview.from }; C.wideA = null; } C.wideT = C.wideOff = 0; }
    // (but never for long: past WIDE_HOLD it's back in, for a full shot, however much is still going on)
    else if (T && (C.wide ? C.wideT <= WIDE_HOLD : C.wideT > 2 && C.cutT > (C.wideBack || 2))) { if (!C.wide) { C.wide = { at: T.at.clone(), r: T.r }; C.wideT = 0; C.wideBack = 0; } C.wideOff = 0; }
    else if (C.wide && ((C.wideOff = (C.wideOff || 0) + rawDt) > 1.5 && C.wideT > SHOT || C.wideT > WIDE_HOLD)) {
      if (C.wideT > WIDE_HOLD) C.wideBack = SHOT;
      C.wide = null;
      C.wideT = 0;
      // (back in on whatever's most worth watching now, held a full shot: not on the one it had before it went wide,
      // which is long done, and not to the pile for a moment and then off again)
      let b = null, bk = 0;
      for (const v of all) { const { k } = ks.get(v); if (k > bk) { bk = k; b = v; } }
      if (b) C.side = behind(b, 1).distanceTo(camera.position) <= behind(b, -1).distanceTo(camera.position) ? 1 : -1;
      C.subject = b;
      C.cutT = C.cutS = C.restT = 0;
    }
    // (and it drifts with the action slowly: a gentle move, not a lurch each time the crashes regroup)
    // (the overview slower still: it's following a fuse along a street, not a scuffle)
    if (C.wide && T) { const q = over ? 0.45 : 1; C.wide.at.lerp(T.at, 1 - Math.exp(-rawDt * 0.8 * q)); C.wide.r += (T.r - C.wide.r) * (1 - Math.exp(-rawDt * q)); C.wide.pts = T.pts.map(p => p.clone()); }
    if (since < FOLLOW_YOU) {
      if (C.subject !== player) { C.subject = player; C.side = 1; }
    } else {
      const cur = ks.get(C.subject) || interest(C.subject, all);
      C.restT = cur.k < 3 ? (C.restT || 0) + rawDt : 0;
      let best = null, bk = 0;
      for (const v of all) { const { k } = ks.get(v); if (k > bk) { bk = k; best = v; } }
      // (one that was coming for the pile and got away with it, or still hasn't got there: off it at once)
      // (or a wreck thrown off down the street: a moment's watching, then back to the pile)
      const missed = C.subject && C.subject !== player && ((!(C.subject.gen > 0) && (C.restT > 0.4 || C.cutS > INCOMING)) ||
        (C.cutT > SHOT && Math.hypot(C.subject.car.pos.x - C.focus.x, C.subject.car.pos.z - C.focus.z) > 35));
      const tired = C.restT > 1.2 || C.cutT > 7 || missed;
      // (while it's framing it all, it stays on what it's got)
      // (or sooner, for something about to hit and well worth more: it's there to see it coming)
      const coming = C.cutT > 1.5 && ks.get(best)?.at && bk > cur.k * 2.5;
      if (best && best !== C.subject && !C.wide && (C.cutT > SHOT || missed || coming) && (tired || coming || bk > cur.k * 1.8)) {
        C.subject = best;
        // Behind it on whichever side is nearer where the camera is: it stays on its side of the action, so what was
        // on the left is still on the left (swapping sides every cut turns the whole scene round)
        const sp = behind(best, 1).clone(), sn = behind(best, -1), dp = sp.distanceTo(camera.position), dn = sn.distanceTo(camera.position);
        C.side = dp <= dn ? 1 : -1;
        // (the new one's rest starts now: the last one's would have it "missed" at once, and cut again)
        C.cutT = C.cutS = C.restT = 0;
        // Just along a bit: there, smoothly (a cut that short only jumps). Off somewhere else: it flies over there, up
        // over the roofs, so you see where. Otherwise a cut. (A cut ends any flight still going: else it lands up in the
        // air, and drifts down slowly.)
        if (Math.min(dp, dn) < 12) C.glide = false;
        else if (C.look && best.car.pos.distanceTo(C.look) > 30) C.glide = true;
        else { C.cutNow = true; C.glide = false; }
      } else if ((!best || missed) && tired && C.subject && C.wideT > 1.5) { C.subject = null; C.cutT = C.cutS = 0; }
    }
    const S = C.subject;
    let look;
    if (C.wide) {
      // From up and back, on the side the camera's already on, turning slowly; far enough out to fit it all
      const W = C.wide, r = Math.min(W.max || WIDE_MAX, W.r), D = r / Math.sin(THREE.MathUtils.degToRad(camera.fov) / 2) + 4;
      // (the overview from the level's side of it, still: a slow turn about the whole street only swings the smoke
      // across it)
      if (C.wideA == null) { C.wideA = C.wideGoal = W.from ?? Math.atan2(camera.position.x - W.at.x, camera.position.z - W.at.z); C.wideLook = 0; }
      if (W.from == null) { C.wideA += rawDt * 0.08; C.wideGoal += rawDt * 0.08; }
      _l.copy(W.at);
      // (`up`: 0, up and back; 1, nearly straight down)
      const spot = (a, up) => _c.set(W.at.x + Math.sin(a) * D * (0.8 - 0.6 * up), W.at.y + D * (0.55 + 0.4 * up), W.at.z + Math.cos(a) * D * (0.8 - 0.6 * up));
      // (a building in the way of any of it: round to the nearest side that sees it all; none, between towers: higher,
      // looking down on it, until one does)
      const hidden = (a, up) => { spot(a, up); return blocked(_c, _l) || (W.pts || []).some(p => blocked(_c, p)); };
      // (looked for only when where it's going is hidden, or it's gone up to see over something and might come back
      // down, at most every half second; and then it turns round to it steadily, never snapping: a camera swinging
      // about loses you)
      if ((C.wideLook -= rawDt) <= 0) {
        C.wideLook = 0.5;
        // (up: back down where it is first, if it can see from lower, rather than off round to somewhere new)
        const up0 = C.wideUpGoal || 0, lower = [0, 0.5].find(u => u < up0 && !hidden(C.wideGoal, u));
        if (lower != null) C.wideUpGoal = lower;
        else if (hidden(C.wideGoal, up0)) {
          let up = 0, a0 = C.wideGoal;
          // (the overview higher first, where it is, before it goes round: it's there to keep its side)
          const still = W.from != null && [0.5, 1].find(u => u > up0 && !hidden(a0, u));
          if (still) up = still;
          else search: for (const u of [0, 0.5, 1]) {
            for (let i = 0; i <= 8; i++) {
              const a = a0 + Math.ceil(i / 2) * 0.4 * (i % 2 ? 1 : -1);
              if (!hidden(a, u)) { C.wideGoal = a; up = u; break search; }
            }
            up = u;
          }
          C.wideUpGoal = up;
        }
      }
      const da = C.wideGoal - C.wideA;
      C.wideA += Math.sign(da) * Math.min(Math.abs(da), Math.min(0.6, Math.abs(da) * 1.5) * rawDt);
      C.wideUp = (C.wideUp || 0) + ((C.wideUpGoal || 0) - (C.wideUp || 0)) * (1 - Math.exp(-rawDt * 1.2));
      spot(C.wideA, C.wideUp);
      look = _l;
      C.on = 'wide';
    } else if (S) {
      C.wideA = C.wideUp = C.wideUpGoal = null;
      const p = S.car.pos, v = S.car.vel, sp = Math.hypot(v.x, v.z);
      if (sp > 3) C.dir = (C.dir || new THREE.Vector3()).set(v.x / sp, 0, v.z / sp);
      else C.dir = C.dir || S.forward.clone().setY(0).normalize();
      const d = C.dir;
      const n = ks.get(S) || interest(S, all);
      // Behind and to one side of it, up a little
      _c.copy(behind(S, C.side));
      // (unless that's inside a building, or there's a wall between: round it to where it can be seen, the nearest way
      // round, and higher if nowhere at that height will do. Else it's pulled in, and ends up on top of it, or down a
      // gap with it.)
      if (inBlock(_c) || blocked(_c, p)) roundTo(p, _c);
      // Toward where it's headed (what it's about to hit, if anything), with a pull toward the pile
      _l.copy(p).addScaledVector(v, 0.35);
      if (n.at) _l.lerp(n.at.car.pos, 0.4);
      // (only when it's near: lean to a pile far behind and the camera ends up staring at a wall)
      _l.lerp(C.focus, 0.2 * clamp(1 - _l.distanceTo(C.focus) / 40, 0, 1));
      look = _l;
      C.on = S === player ? 'you' : (n.at ? 'incoming ' : 'wreck ') + S.kind;
    } else {
      C.wideA = C.wideUp = C.wideUpGoal = null;
      C.ang += rawDt * 0.15;
      _c.set(C.focus.x + Math.sin(C.ang) * 17, C.focus.y + 8, C.focus.z + Math.cos(C.ang) * 17);
      look = C.focus;
      C.on = 'pile';
    }
    unblock(look, _c, S);
    // (flying over to somewhere else: up over the roofs on the way, the higher the further it's got to go, and pulled
    // back a little, so the way there is seen too)
    const far = camera.position.distanceTo(_c);
    if (C.glide) { if (far < 4) C.glide = false; else _c.y += Math.min(18, far * 0.35); }
    // (and whatever the move, over a building that stands between, never through it: up, over and down the other side)
    if (!C.cutNow && far > 3) _c.y = Math.max(_c.y, roofsBetween(camera.position, _c) + 2.5);
    if (C.cutNow) { camera.position.copy(_c); C.look = look.clone(); C.cutNow = false; }
    else camera.position.lerp(_c, 1 - Math.exp(-rawDt * (C.glide ? 2.5 : C.wide ? 2.5 : 5)));
    // (on its way there it can pass through things: never inside one)
    clear(look, camera.position);
    outside(camera.position);
    C.look = (C.look || look.clone()).lerp(look, 1 - Math.exp(-rawDt * (C.glide ? 3 : 7)));
    camera.lookAt(C.look.x, C.look.y + 0.8, C.look.z);
    fov = 56 + (C.glide ? Math.min(8, far * 0.25) : 0);
  } else {
    // Chase: low and close; it pulls in and widens as you go faster, and more when you burn rush
    const speed = c.vel.length();
    const rushK = G.rushK || 0;
    const f = _f.set(0, 0, -1).applyQuaternion(c.q).setY(0);
    if (f.lengthSq() > 0.01) f.normalize(); else f.copy(cam.dir);
    // Follow your heading (not your slide), firmly, so the car stays centred as you weave
    cam.dir.lerp(f, 1 - Math.exp(-rawDt * 9)).normalize();
    // (in a dive: behind the way you're flying, not the way the nose points, which could be anywhere, further back and
    // up, looking down along it)
    const diving = !!G.dive;
    cam.diveK = (cam.diveK || 0) + ((diving ? 1 : 0) - (cam.diveK || 0)) * Math.min(1, rawDt * 3);
    if (cam.diveK > 0.01) { _v.copy(c.vel).setY(0); if (_v.lengthSq() > 1) cam.dir.lerp(_v.normalize(), cam.diveK).normalize(); }
    const dist = 6.3 + speed * 0.012 - rushK * 0.9 + cam.diveK * 8, ht = 2.05 + speed * 0.004 - rushK * 0.3 + cam.diveK * 10;
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
    // (in a dive, toward where you'll come down, past your car)
    // (and there smoothly: where that is jumps, off a deck's edge, say)
    if (!diving || !mark.at.lengthSq()) cam.diveAt = null;
    else cam.diveAt = (cam.diveAt || mark.at.clone()).lerp(mark.at, 1 - Math.exp(-rawDt * 4));
    if (cam.diveK > 0.01 && cam.diveAt) _l.lerp(_v.lerpVectors(c.pos, cam.diveAt, 0.55), cam.diveK);
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

const setLook = key => { stage.setTime(key, LOOKS[key]); post.mat.uniforms.grade.value = LOOKS[key].grade; city?.gate?.lamps(LOOKS[key].lamps); city?.depot?.lamps(LOOKS[key].lamps); props?.lamps(LOOKS[key].lamps);
  rain.lines.visible = !!LOOKS[key].rain;
  if (city) city.wet = !!LOOKS[key].rain;
};

// ---------- Post: radial speed blur, a vignette and the teal-and-orange grade ----------
const post = (() => {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { samples: 4, type: THREE.HalfFloatType });
  const mat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: rt.texture }, amount: { value: 0 }, vig: { value: 0.25 }, tint: { value: 0 }, grade: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float amount; uniform float vig; uniform float tint; uniform float grade; varying vec2 vUv;
      void main() {
        vec2 d = vUv - vec2(0.5, 0.52);
        float r = length(d);
        float k = amount * smoothstep(0.12, 0.75, r);
        vec4 c = vec4(0.0);
        for (int i = 0; i < 12; i++) c += texture2D(tDiffuse, vUv - d * k * 0.16 * float(i) / 11.0);
        c /= 12.0;
        float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
        c.rgb *= mix(vec3(1.0), mix(vec3(0.82, 0.98, 1.1), vec3(1.04, 1.0, 0.95), smoothstep(0.03, 0.7, l)), grade);
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
    // A blown one burns end to end, roaring at first and dying down to flickers
    if (v.blown) {
      const roar = G.t - v.blownAt < 8;
      if (Math.random() < dt * (roar ? 70 : 25)) burning(v, roar ? 2 : 1.2);
    }
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
  spreadRings(dt);
}
function spreadRings(dt) {
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
  setText('speed', G.crash ? '' : String(kmh));
  $('speedo').classList.toggle('hidden', !!G.crash);
  $('hud').classList.toggle('crashing', !!G.crash);
  // (on Tower Dive, once you've a tank of nitro, the bar's that; with no crates it's your rush, and up in the air it's
  // your nitro)
  const nitro = !!city.level.dive && (G.nitro > 0 || (fuel() === 'rush' && G.air > 0.2 && G.state === 'run'));
  $('rush-fill').style.width = ((G.nitro > 0 && nitro ? G.nitro : G.rush) * 100).toFixed(1) + '%';
  $('rush').classList.toggle('nitro', nitro);
  $('rush').firstElementChild.firstChild.textContent = nitro ? t('NITRO') + ' ' : t('RUSH') + ' ';
  $('rush').classList.toggle('on', !!G.boosting);
  $('rush').classList.toggle('full', G.rush > 0.98);
  setText('heat', '×' + G.heat.toFixed(1));
  $('heatbox').classList.toggle('oncoming', !!G.oncoming && G.state === 'run');
  // The explosion meter, while you aim, and how long till it blows anyway
  const A = G.crash?.aim, aiming = !!A && !A.done && !G.ended;
  $('boom').classList.toggle('hidden', !aiming);
  // (on a phone the drift button is the detonator: it says so while you aim, and burns once it's ready)
  setText('t-drift', aiming ? t('BOOM') : t('DRIFT'));
  $('t-drift').classList.toggle('ready', aiming && A.meter >= 1);
  if (aiming) {
    $('boom-fill').style.width = (A.meter * 100).toFixed(1) + '%';
    $('boom').classList.toggle('full', A.meter >= 1);
    setText('boom-txt', t(A.meter >= 1 ? (document.body.classList.contains('touch') ? 'TAP BOOM' : 'SPACE · DETONATE') : 'STEER INTO TRAFFIC'));
    const left = Math.max(0, AIM - A.t);
    setText('boom-t', left.toFixed(1));
    $('boom-t').classList.toggle('late', left < 3);
  }
  if (G.crash) {
    G.shown += (G.score - G.shown) * Math.min(1, dt * 6) + (G.score > G.shown ? 1 : 0);
    G.shown = Math.min(G.shown, G.score);
    setText('carnage', Math.round(G.shown).toLocaleString());
    setText('crash-sub', t('{0} wrecked · chain {1} · ×{2}', G.wrecked, G.chain, G.heat.toFixed(1)));
    // The countdown to the end: five quiet seconds, or the end of the time limit, whichever's sooner. It shows
    // once things go quiet (or near the limit), and swells and reddens with every second it ticks down.
    const C = G.crash, left = Math.min(CRASH_QUIET - C.quiet, CRASH_MAX - C.t);
    // (it ends on 0, held there for a moment before the tour)
    const el = $('countdown'), show = G.ended ? G.tour?.t < 0 : left < CRASH_QUIET - 0.6;
    el.classList.toggle('hidden', !show);
    if (show) {
      const n = G.ended ? 0 : Math.max(1, Math.ceil(left));
      if (el.dataset.n !== String(n)) {
        el.dataset.n = n;
        el.textContent = n;
        el.style.fontSize = (51 + (5 - Math.min(5, n)) * 24) + 'px';
        el.style.color = `hsl(${(Math.min(5, n) - 1) * 12}, 100%, 60%)`;
        el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick');
      }
    } else el.dataset.n = '';
  }
}

// ---------- Screens ----------
function showScreen(id) {
  for (const s of ['menu', 'results', 'pause', 'help']) $(s).classList.toggle('hidden', s !== id);
  document.body.classList.toggle('screen', !!id);
}
// The engine, skid and boost are loops: silence them whenever the game stops updating them
function muteLoops() { sound.engine(0, 0, false); sound.skid(0); sound.boost(0); }
function pause() { G.paused = G.state; G.state = 'paused'; showScreen('pause'); muteLoops(); }
function resume() { if (G.state !== 'paused') return; G.state = G.paused; showScreen(null); }
function toMenu() {
  G.state = 'menu';
  G.crash = null;
  G.tour = null;
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
  dress(city.level);
  G.rand = rng(Math.floor(Math.random() * 1e9));
  traffic = new Traffic(city, city.level, kind => makeTraffic(kind), G.rand);
  traffic.populate({ ...city.level, specials: [] });
}
function renderMenu() {
  const box = $('levels');
  box.innerHTML = '';
  // (in dev mode, the released tracks and then the ones in development)
  const order = DEV ? [['Released', false], ['In development', true]] : [[null, false]];
  for (const [head, draft] of order) {
  if (head) box.insertAdjacentHTML('beforeend', `<h4>${head}</h4>`);
  for (const [key, L] of Object.entries(LEVELS)) {
    if (!!L.draft !== draft) continue;
    const b = document.createElement('button');
    const medal = records.medals[key] || 0, best = records.best[key];
    b.className = (key === settings.level ? 'active' : '') + (L.draft ? ' dev-only' : '');
    b.innerHTML = `<b>${t(L.name)}</b><span>${t(L.blurb)}</span><em class="m${medal}">${best ? best.toLocaleString() : t('not played')}</em>`;
    b.onclick = () => { settings.level = key; saveSettings(); loadLevel(key); startTraffic(); renderMenu(); };
    box.appendChild(b);
  }
  }
  const cars = $('cars');
  cars.innerHTML = '';
  for (const [key, R] of Object.entries(RIDES)) {
    const b = document.createElement('button');
    b.className = key === settings.car ? 'active' : '';
    b.innerHTML = `<b>${t(R.name)}</b><span>${t(R.blurb)}</span>`;
    b.onclick = () => { settings.car = key; saveSettings(); renderMenu(); };
    cars.appendChild(b);
  }
  const tod = $('tod');
  tod.innerHTML = '';
  // (day, sunset, and the level's own if it has one of its own)
  for (const k of new Set(['day', 'sunset', city.level.time || 'day'])) {
    const b = document.createElement('button');
    b.className = k === time ? 'active' : '';
    b.textContent = t(LOOKS[k].label);
    b.onclick = () => { settings.times[city.key] = time = k; saveSettings(); setLook(k); for (const v of traffic.list) v.setLights(LOOKS[k].lamps); renderMenu(); };
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
// Send this run's replay to the server it came from (when that's serve.py)
$('btn-send').onclick = async () => {
  const b = $('btn-send'), rec = G.rec;
  if (!rec) return;
  b.disabled = true;
  b.textContent = t('Sending…');
  try { b.textContent = t('Sent ✓ {0}', await send(rec)); } catch (e) { b.textContent = t('Not sent: {0}', e.message); b.disabled = false; return; }
  // (and into the run library: the medal lines may have changed)
  if (DEV) { library(true); drawLines(); }
};
$('btn-resume').onclick = resume;
$('btn-quit').onclick = toMenu;
$('btn-help').onclick = () => showScreen('help');
// (dev mode's switch: where it would come on by itself, or wherever it's on)
if (LOCAL || DEV) {
  const b = Object.assign(document.createElement('button'), { className: 'link', textContent: DEV ? 'Dev mode: on (switch off)' : 'Dev mode: off (switch on)' });
  b.style.marginLeft = '16px';
  b.onclick = () => setDev(!DEV);
  $('btn-help').after(b);
}
$('btn-help-close').onclick = () => { store.save('rush.seenHelp', true); showScreen(G.state === 'menu' ? 'menu' : null); };
window.addEventListener('keydown', e => { if (G.state === 'menu' && !free.on && e.code === 'Enter' && $('help').classList.contains('hidden')) $('btn-go').onclick(); });

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
  // (the guide lines show up to the crash, not over the wreckage)
  // (paused, by what it was paused from)
  if (guides) guides.group.visible = ['menu', 'intro', 'count', 'run', 'replay'].includes(G.state === 'paused' ? G.paused : G.state);
  // A run being watched (dev mode): from the camera that was used, or the free one
  if (G.state === 'replay') {
    // (`shown`: the time the last frame showed, before the bar's slider or play button moved it; `from`, before this
    // frame's playing on)
    const W = watching, shown = W.shown ?? W.bar.t, from = W.bar.t, fx = W.bar.fx;
    W.bar.advance(raw);
    W.seek(W.bar.t, free.on ? false : null, false, fx);
    // (with its effects on: the blasts and sparks it went through as it played, the fires, the smoke; back, or off,
    // and they're cleared)
    if (W.bar.t < shown || (W.fxWas && !fx)) clearEffects();
    W.fxWas = fx;
    W.shown = W.bar.t;
    if (fx) {
      const dt = raw * W.bar.speed;
      if (W.bar.t > from) W.fx(from, W.bar.t, dt);
      smoke.update(dt, camera, renderer.domElement.height);
      glow.update(dt, camera, renderer.domElement.height);
      spreadRings(dt);
    }
    if (free.on) free.update(raw);
    rain.update(raw, camera.position);
    if (draw) post.render();
    return;
  }
  // (and Tanker Row's reel, before the tour: the world held, the chain played again)
  if (G.tour?.reel && G.state === 'tour' && !free.on) {
    reelTick(raw);
    if (draw) post.render();
    return;
  }
  // (and the free camera: the run held where it is while you look round)
  if (free.on && G.state !== 'menu') {
    free.update(raw);
    rain.update(raw, camera.position);
    if (draw) post.render();
    return;
  }
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
    // (Bank Shot's queue blinking behind the menu too: on the clock, the game's stands still here)
    blinkers.update(traffic.list, performance.now() / 1000);
    // (no dive ring left up from a run quit in the middle of one)
    mark.update();
    // (from over the roofs: Tower Dive's junction is a sky deck)
    const gy = city.groundHeight(jx, jz, 1e4);
    if (free.on) free.update(raw);
    else {
      camera.position.set(jx + Math.sin(cam.menuA) * 46, gy + 24, jz + Math.cos(cam.menuA) * 46);
      camera.up.set(0, 1, 0);
      camera.lookAt(jx, gy, jz);
      camera.fov = stage.fitFov(55);
      camera.updateProjectionMatrix();
    }
    stage.focusSun(new THREE.Vector3(jx, 0, jz), 60);
    post.mat.uniforms.amount.value = 0;
    smoke.update(raw, camera, renderer.domElement.height);
    glow.update(raw, camera, renderer.domElement.height);
    rain.update(raw, camera.position);
    if (draw) post.render();
    return;
  }
  if (G.state === 'paused' || !player) { if (draw) post.render(); return; }
  // Time: slow motion through the crash, briefly slower still for the big moments
  let scale = 1;
  if (G.crash) {
    // (while you aim, steady at AIM_SLOW after the moment of impact; once it's blown, back up to full speed)
    const A = G.crash.aim, t = G.crash.rt += raw;
    if (!A.done && !G.ended) {
      // (set off with a fresh press, not the drift you were holding into the junction: looked for every frame, as the
      // slowed simulation steps only every few frames and a quick tap can fall between them; and on time, full or not)
      if (playerInput.handbrake && !A.was && A.meter >= 1) detonate(true);
      else if ((A.t += raw) >= AIM) detonate(A.meter >= 1);
      A.was = playerInput.handbrake;
    }
    // (on Tower Dive not all the way: a hundred cars coming down off the decks take their time, and some doing)
    scale = !A.done ? (t < 0.6 ? 0.14 : Math.min(AIM_SLOW, 0.14 + (t - 0.6) * 0.4)) : Math.min(city.level.dive ? 0.8 : 1, AIM_SLOW + (t - A.endT) * 0.5);
    if (G.spike > 0) { G.spike -= raw; scale = Math.min(scale, G.spikeK); }
    // (and once it's over, everything stops dead for the tour of the wreckage)
    if (G.ended) scale = 0;
  } else if (G.dive) {
    G.dive.t += raw;
    scale = Math.max(DIVE_SLOW, 1 - G.dive.t * 2.5);
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
  lead(acc);
  for (const v of traffic.list) if (!v.halved) v.pose();
  player.pose();
  blinkers.update(traffic.list, G.t);
  for (const h of halves) { h.model.position.copy(h.car.pos); h.model.quaternion.copy(h.car.q); }
  effects(dt, raw);
  for (const k of crates) { k.m.rotation.y += raw * 1.6; k.m.position.y = k.y + Math.sin(G.t * 2.4 + k.x) * 0.2; }
  debris.update(dt);
  oranges.update(dt);
  notes.update(dt);
  smoke.update(dt, camera, renderer.domElement.height);
  glow.update(dt, camera, renderer.domElement.height);
  rain.update(dt, camera.position);
  // Rush on screen: blur, wider view, streaks
  const speed = player.car.vel.length();
  G.rushK = (G.rushK || 0) + ((G.boosting && G.state === 'run' ? 1 : 0) - (G.rushK || 0)) * Math.min(1, raw * 4);
  const fast = G.state === 'run' ? clamp((speed - 30) / 45, 0, 1) : 0;
  post.mat.uniforms.amount.value = fast * 0.35 + G.rushK * 0.75;
  post.mat.uniforms.vig.value = 0.22 + G.rushK * 0.25 + (G.crash ? 0.15 : 0);
  post.mat.uniforms.tint.value = G.rushK * 0.35;
  updateLines(fast * 0.6 + G.rushK * 0.6);
  updateCamera(dt, raw);
  mark.update();
  stacks?.lod(camera.position);
  standIns?.update(camera.position);
  // (the labels that sit over things go where the camera is now, not where it was last frame: else they trail it, and
  // shake as it pans)
  camera.updateMatrixWorld();
  if (G.tour) stage.focusSun(G.tour.look, G.tour.D + 25);
  else stage.focusSun(_c.copy(player.car.pos).addScaledVector(cam.dir, G.crash ? 0 : 25), G.crash ? 40 : 55);
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
  updatePops(raw);
  if (G.tour) labelHeaps();
  if (draw) post.render();
  back();
}
// Each moving thing drawn (and followed) where it's got to by now, not where it was at its last step: `a`, the time
// since. (In slow motion the simulation steps only every few frames: a car jumping on a step at a time, with the camera
// gliding after it, shakes.) Back where the simulation left it once the frame's drawn.
const _led = [];
function lead(a) {
  _led.length = 0;
  if (a <= 0) return;
  for (const b of bodies()) {
    const c = b.car;
    if (c.vel.lengthSq() + c.w.lengthSq() < 1e-4) continue;
    const s = b._lead || (b._lead = { p: new THREE.Vector3(), q: new THREE.Quaternion() });
    s.p.copy(c.pos); s.q.copy(c.q);
    _led.push(b);
    c.pos.addScaledVector(c.vel, a);
    _dq.set(c.w.x * a * 0.5, c.w.y * a * 0.5, c.w.z * a * 0.5, 0).multiply(c.q);
    c.q.set(c.q.x + _dq.x, c.q.y + _dq.y, c.q.z + _dq.z, c.q.w + _dq.w).normalize();
  }
}
const _dq = new THREE.Quaternion();
function back() {
  for (const b of _led) { b.car.pos.copy(b._lead.p); b.car.q.copy(b._lead.q); }
  _led.length = 0;
}
const flashEl = document.createElement('div');
Object.assign(flashEl.style, { position: 'fixed', inset: 0, pointerEvents: 'none', opacity: 0,
  background: 'radial-gradient(ellipse at center, transparent 45%, rgba(220,30,20,0.55) 100%)' });
document.body.appendChild(flashEl);

// A car in a replay burnt black, or back to its paint (its own colours kept for that)
function scorched(v, on) {
  if (!!v.burnt === on) return;
  if (on) {
    v.paints = [];
    v.model.traverse(o => { if (o.isMesh && o.material?.isMeshStandardMaterial) v.paints.push([o.material, o.material.color.clone(), o.material.roughness, o.material.metalness]); });
    v.burn();
  } else {
    for (const [m, c, r, k] of v.paints || []) { m.color.copy(c); m.roughness = r; m.metalness = k; }
    v.burnt = false;
  }
}
// The smoke and flames, the rings and scorch marks, all gone
function clearEffects() {
  smoke.clear(); glow.clear();
  for (const s of scorches) dropMesh(s);
  scorches.length = 0;
  for (const r of rings) dropMesh(r.m);
  rings.length = 0;
}

// ---------- Looking into a replay ----------
// (for debugging: rush.debug.replay(json) loads its level and its vehicles; then .seek(t) shows them at game
// time t, from the camera that was used or from `view`: [x, y, z, lookX, lookY, lookZ])
function replay(R) {
  Object.assign(settings, { level: R.level, car: R.car });
  loadLevel(R.level);
  time = R.time;
  setLook(time);
  startRun(0);
  for (const v of traffic.list.slice()) traffic.remove(v);
  standIns?.dispose();
  standIns = null;
  G.state = 'paused';
  showScreen(null);
  $('hud').classList.add('hidden');
  const cars = {};
  for (const [id, b] of Object.entries(R.bodies)) {
    if (id === 'you') cars[id] = player;
    else if (b.kind === 'half') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.3, 2.3), new THREE.MeshLambertMaterial({ color: paintOf(b.paint) }));
      scene.add(m);
      cars[id] = { model: m, car: { pos: m.position, q: m.quaternion }, pose() {} };
    } else cars[id] = new Car(city, scene, 0, trafficDef(b.kind), b.paint);
  }
  const F = R.frames, _q = new THREE.Quaternion(), _p = new THREE.Vector3(), look = new THREE.Vector3();
  // (and the yacht, afloat till it went down)
  const sank = G.boats.map(b => R.events?.find(e => e.type === 'sunk' && (e.boat || 0) === b.i)?.t);
  // (and the roadworks' gas and tar, standing till they went up)
  const went = (R.events || []).filter(e => e.type === 'charge');
  return {
    frames: F.length, start: F[0].t, end: F[F.length - 1].t,
    seek(t, view, draw = true, fx = false) {
      let lo = 0, hi = F.length - 1;
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (F[m].t <= t) lo = m; else hi = m - 1; }
      const a = F[lo], b = F[Math.min(lo + 1, F.length - 1)], k = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 0;
      const next = new Map(b.b.map(e => [e[0], e]));
      for (const v of Object.values(cars)) v.model.visible = false;
      for (const e of a.b) {
        const v = cars[e[0]], f = next.get(e[0]) || e;
        v.car.pos.set(e[1], e[2], e[3]).lerp(_p.set(f[1], f[2], f[3]), k);
        v.car.q.set(e[4], e[5], e[6], e[7]).normalize().slerp(_q.set(f[4], f[5], f[6], f[7]).normalize(), k);
        v.pose();
        v.model.visible = !(e[8] & 8);
        // (burnt black once it's gone up, with the effects on)
        if (v.burn) scorched(v, fx && !!(e[8] & 4));
      }
      // (Tower Dive's boxed cars: where they stood, till they were let go)
      // (and their glass: the boxes were recorded in the order they were built, so the nth is this run's nth box)
      const boxes = stacks?.list.length === Object.keys(R.held || {}).length ? stacks : null;
      Object.values(R.held || {}).forEach((h, i) => boxes?.show(i, h[7] == null || a.t < h[7]));
      for (const [id, h] of Object.entries(R.held || {})) {
        if (h[7] != null && a.t >= h[7]) continue;
        const v = cars[id];
        v.car.pos.set(h[0], h[1], h[2]);
        v.car.q.set(h[3], h[4], h[5], h[6]);
        v.pose();
        v.model.visible = true;
      }
      for (const b of G.boats) {
        b.reset();
        if (sank[b.i] != null && t > sank[b.i]) { b.sink(); b.update(t - sank[b.i], () => {}); }
      }
      if (charges) { charges.reset(); for (const e of went) if (e.t <= t) charges.hide(e.i); }
      // (`view` false: the camera's left where it is, the free camera's)
      if (view !== false) {
        const c = view || a.cam.map((n, i) => n + (b.cam[i] - n) * k);
        camera.position.set(c[0], c[1], c[2]);
        camera.up.set(0, 1, 0);
        camera.lookAt(look.set(c[3], c[4], c[5]));
        camera.fov = stage.fitFov(56);
        camera.updateProjectionMatrix();
      }
      stage.focusSun(camera.getWorldDirection(look).multiplyScalar(30).add(camera.position), 45);
      if (draw) post.render();
      return { t: a.t, state: a.s, input: a.in, cars: a.b.length };
    },
    // The effects of what happened between game times `from` and `to` (playing on, `dt` of it): the blasts, the
    // sparks where things were hit, and the fires on what's gone up
    fx(from, to, dt) {
      for (const e of R.events) {
        if (e.t <= from || e.t > to) continue;
        const v = cars[e.id];
        if (e.type === 'boom' && v) {
          // (older replays didn't say how big: a tanker's is twice a car's, and yours about full)
          const big = e.big ?? (e.id === 'you' ? 1.4 : TRAFFIC[e.kind]?.explosive ? 2 : 1);
          explosion(v.car.pos.clone(), big);
          sound.boom(Math.min(1, 0.6 * big));
        } else if (e.type === 'charge') {
          explosion(_p.set(e.at[0], e.at[1], e.at[2]).clone(), e.big);
          sound.boom(Math.min(1, 0.6 * e.big));
        } else if (e.type === 'score' && e.at) sparks(_p.set(e.at[0], e.at[1], e.at[2]), 12);
      }
      for (const v of Object.values(cars)) {
        if (!v.burnt || !v.model.visible) continue;
        if (Math.random() < dt * 40) burning(v, 1.6);
        if (Math.random() < dt * 8) puff(v.car.pos, '#3a3632', 1.2, 2.6, 3, 0.42);
      }
    },
    // (its vehicles gone: yours goes with the run)
    dispose() {
      for (const v of Object.values(cars)) {
        if (v === player) continue;
        if (v instanceof Car) v.dispose();
        else { scene.remove(v.model); v.model.geometry.dispose(); v.model.material.dispose(); }
      }
    },
  };
}
// ---------- Dev mode ----------
// (see dev.js: the free camera, the medal lines and the run library)
const free = new FreeCam(camera, renderer.domElement, keys);
let watching = null, devUI = null, held = null;
function toggleFree() {
  if (free.on) {
    free.leave();
    // (back to what was up before: the menu, the pause card, the HUD; not if the game's moved on meanwhile, a run
    // restarted from the pad, say: that put up what it needs)
    if (held && held.state === G.state) { if (held.screen) showScreen(held.screen); $('hud').classList.toggle('hidden', held.hud); }
    held = null;
    if (G.state !== 'replay') { camera.fov = stage.fitFov(55); camera.updateProjectionMatrix(); }
  } else {
    if (G.state !== 'replay') {
      held = { state: G.state, screen: ['menu', 'results', 'pause', 'help'].find(s => !$(s).classList.contains('hidden')), hud: $('hud').classList.contains('hidden') };
      showScreen(null);
      $('hud').classList.add('hidden');
    }
    devUI.lib.classList.add('hidden');
    // (the run's held still: so is its engine)
    muteLoops();
    free.enter();
  }
  devUI.free.classList.toggle('on', free.on);
  watching?.bar.camB.classList.toggle('on', free.on);
  devUI.hint.classList.toggle('hidden', !free.on);
  devUI.hint.textContent = matchMedia('(pointer: coarse)').matches
    ? 'Drag to look · two fingers: slide, pinch to go forward'
    : 'WASD fly · E/Q up/down · Shift fast · drag to look · wheel forward · F or Esc to leave';
}
function toggleLines() {
  devS.lines = !devS.lines;
  store.save('rush.devLines', devS.lines);
  devUI.lines.classList.toggle('on', devS.lines);
  drawLines();
}
function toggleRuns() {
  const box = devUI.lib;
  if (!box.classList.contains('hidden')) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  box.innerHTML = '<p>Loading the run library…</p>';
  const C = city;
  library(true).then(list => { if (city === C) showRuns(box, C.level.name, list && runsOf(list, C.key, C.level.medals), watch); });
}
// Watch a kept run: its level, its traffic as it went, from the camera that was used (or the free one)
async function watch(run) {
  devUI.lib.innerHTML = '<p>Loading the run…</p>';
  let R;
  try { R = await loadRun(run.name); } catch (e) { devUI.lib.innerHTML = `<p>Couldn't load it: ${e.message}</p>`; return; }
  devUI.lib.classList.add('hidden');
  stopWatching();
  if (free.on) toggleFree();
  muteLoops();
  // (your own car, kept: replay() puts the run's in the settings, only for watching it)
  const car = settings.car;
  const P = replay(R);
  drawLines();
  G.state = 'replay';
  watching = { ...P, car, bar: replayBar(run, P.start, P.end, { free: toggleFree, close: () => { stopWatching(); toMenu(); } }) };
}
function stopWatching() {
  if (!watching) return;
  if (free.on) toggleFree();
  watching.bar.dispose();
  watching.dispose();
  // (back to your car, and the track's time of day: the menu's loadLevel keeps what it finds on the same track)
  settings.car = watching.car;
  time = timeFor(city.key);
  setLook(time);
  watching = null;
}
// A snapshot for Claude: the picture as it is now, what you say about it, and where everything is
async function snap() {
  post.render();
  const canvas = renderer.domElement, image = canvas.toDataURL('image/jpeg', 0.88);
  const note = prompt('What should Claude look at? (optional)');
  if (note === null) return;
  const v3 = v => [v.x, v.y, v.z].map(n => Math.round(n * 100) / 100);
  const look = camera.getWorldDirection(new THREE.Vector3());
  const meta = {
    note, date: new Date().toISOString(), level: city.key, levelName: city.level.name, time, state: G.state,
    screen: ['menu', 'results', 'pause', 'help'].find(s => !$(s).classList.contains('hidden')) || null,
    hud: !$('hud').classList.contains('hidden'),
    camera: { at: v3(camera.position), looking: v3(look), fov: Math.round(camera.fov), free: free.on },
    view: [canvas.width, canvas.height], dpr: devicePixelRatio, agent: navigator.userAgent,
    watching: watching && { run: watching.bar.run.name, t: Math.round(watching.bar.t * 100) / 100, fx: watching.bar.fx },
    run: player && G.state !== 'menu' && !watching ? { car: settings.car, t: Math.round(G.t * 100) / 100, at: v3(player.car.pos), kmh: Math.round(Math.abs(player.car.speed) * 3.6), score: G.score, heat: G.heat } : null,
  };
  const hint = devUI.hint, was = hint.textContent;
  hint.classList.remove('hidden');
  hint.textContent = 'Saving the snapshot…';
  try {
    const name = await snapshot(image, meta);
    hint.textContent = `Snapshot kept: ${name}`;
  } catch (e) { hint.textContent = `Snapshot not kept: ${e.message}`; }
  setTimeout(() => { hint.textContent = was; hint.classList.toggle('hidden', !free.on); }, 3000);
}
// Its keys: F free camera, L lines, V runs, K snapshot, X the effects of a run being watched, and P (or Space) to
// play and pause it
function devKey(e) {
  if (e.code === 'KeyK') { snap(); return true; }
  if (e.code === 'KeyX' && watching) { watching.bar.toggleFx(); return true; }
  if (e.code === 'KeyF') { toggleFree(); return true; }
  if (e.code === 'Escape' && free.on) { toggleFree(); return true; }
  if (e.code === 'KeyL') { toggleLines(); return true; }
  if (e.code === 'KeyV') { toggleRuns(); return true; }
  if (G.state === 'replay' && (e.code === 'KeyP' || (e.code === 'Space' && !free.on))) { watching.bar.toggle(); return true; }
  if (G.state === 'replay' && e.code === 'Escape') { stopWatching(); toMenu(); return true; }
  // (and while the free camera's flying, the run holds still: its keys fly, they don't skip the intro or restart it)
  return free.on && e.code !== 'KeyM';
}
if (DEV) {
  devUI = devBar({ free: toggleFree, lines: toggleLines, runs: toggleRuns, snap });
  devUI.lines.classList.toggle('on', devS.lines);
}

G.debug = { get player() { return player; }, get traffic() { return traffic; }, get city() { return city; }, get standIns() { return standIns; }, get notes() { return notes; }, get charges() { return charges; }, get props() { return props; }, playerInput, step, startRun, skipTo, keys, camera, tick, render: () => post.render(), replay, watch, free, renderer, blowUp, heaps, report, startCrash };
toMenu();
if (!store.load('rush.seenHelp', false)) showScreen('help');
requestAnimationFrame(frame);
