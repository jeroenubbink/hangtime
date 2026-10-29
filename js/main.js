import * as THREE from 'three';
import { TILE, HALF, GRID, DIRS } from './pieces.js';
import { World, walk, BUILTIN, cellOf, cellCenter, trackId, deserialize, medalFor, MEDALS } from './track.js';
import { CarPhysics, buildCarModel, poseCarModel, setCarLights, MASS, CARS, WHEELS, WHEEL_RADIUS, WHEEL_REST } from './car.js';
import { Sound } from './audio.js';
import { Editor, drawPiece, customTracks } from './editor.js';
import { Driver, SKILLS } from './ai.js';
import { Stunts } from './stunts.js';
import * as store from './store.js';

const DT = 1 / 120;
const PAINTS = ['#e8352b', '#ffcf2e', '#2f7fe0', '#22b35a', '#f2f2f2', '#9b4dff', '#ff7a1a'];
const CAMS = ['Chase', 'Far chase', 'Bumper', 'TV'];
const $ = id => document.getElementById(id);

// ---------- Renderer & scene ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('view'), antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#bfe0f5', 260, 1300);
const skyGeo = new THREE.SphereGeometry(2000, 24, 12);
scene.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })));
function setSkyColours(top, mid, hor) {
  [top, mid, hor] = [top, mid, hor].map(c => new THREE.Color(c));
  const pos = skyGeo.attributes.position, cols = [];
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i) / 2000;
    const c = h > 0.15 ? mid.clone().lerp(top, Math.min(1, (h - 0.15) / 0.6)) : hor.clone().lerp(mid, Math.max(0, h / 0.15));
    cols.push(c.r, c.g, c.b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
}
const stars = (() => {
  const p = [];
  for (let i = 0; i < 1100; i++) {
    const a = Math.random() * Math.PI * 2, y = 0.08 + Math.random() * 0.92, r = Math.sqrt(1 - y * y);
    p.push(Math.cos(a) * r * 1900, y * 1900, Math.sin(a) * r * 1900);
  }
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, fog: false, transparent: true }));
})();
const orb = new THREE.Mesh(new THREE.CircleGeometry(60, 32), new THREE.MeshBasicMaterial({ fog: false }));
scene.add(stars, orb);
const hemi = new THREE.HemisphereLight('#e4f3ff', '#5b7a3a', 1.7);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff3dc', 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 1, far: 300 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);
const SUN_OFFSET = new THREE.Vector3(70, 120, 45);

// Rain: streaks in a box that follows the camera
const rain = (() => {
  const N = 1400, pos = new Float32Array(N * 6), B = { x: 50, y: 30, z: 50 };
  for (let i = 0; i < N; i++) {
    const x = (Math.random() - 0.5) * B.x, y = Math.random() * B.y, z = (Math.random() - 0.5) * B.z;
    pos.set([x, y, z, x + 0.15, y + 0.9, z], i * 6);
  }
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#c3ced8', transparent: true, opacity: 0.5 }));
  lines.frustumCulled = false;
  lines.visible = false;
  scene.add(lines);
  return {
    lines,
    update(dt, around) {
      if (!lines.visible) return;
      const fall = 26 * dt;
      for (let i = 0; i < N; i++) {
        const o = i * 6;
        pos[o + 1] -= fall; pos[o + 4] -= fall; pos[o] -= fall * 0.16; pos[o + 3] -= fall * 0.16;
        if (pos[o + 1] < 0) {
          const x = (Math.random() - 0.5) * B.x, z = (Math.random() - 0.5) * B.z;
          pos.set([x, B.y, z, x + 0.15, B.y + 0.9, z], o);
        }
      }
      lines.position.set(around.x, around.y - 12, around.z);
      g.attributes.position.needsUpdate = true;
    },
  };
})();

// Time of day: sky gradient, fog, lights, street lamps and headlights
const TOD = {
  day: { label: 'Day', sky: ['#2f7fd6', '#9ccdf2', '#d9eefa'], fog: ['#bfe0f5', 260, 1300], hemi: ['#e4f3ff', '#5b7a3a', 1.7],
    sun: ['#fff3dc', 2.4, [70, 120, 45]], orb: '#fffbe8', stars: 0, lamps: 0, clouds: ['#ffffff', '#b8c4d0'] },
  dusk: { label: 'Dusk', sky: ['#2b2f6b', '#c8679a', '#ffb066'], fog: ['#d99a8a', 200, 1150], hemi: ['#ffc4a8', '#3c3550', 1.05],
    sun: ['#ff9b55', 2.1, [-140, 34, -70]], orb: '#ffcf8a', stars: 0.35, lamps: 0.55, clouds: ['#e3a39a', '#7a4060'] },
  rain: { label: 'Rain', sky: ['#5d6873', '#8a96a1', '#a9b3bb'], fog: ['#9aa5ae', 90, 700], hemi: ['#c9d3dc', '#4a5a40', 1.3],
    sun: ['#dfe6ee', 0.7, [50, 120, 30]], orb: '#9aa5ae', stars: 0, lamps: 0.45, clouds: ['#7d8892', '#5a646e'], rain: true },
  night: { label: 'Night', sky: ['#01030a', '#081230', '#16244a'], fog: ['#0a1228', 160, 1000], hemi: ['#5470b0', '#0d140d', 0.5],
    sun: ['#a9bcff', 0.55, [-60, 110, -80]], orb: '#e6ecff', stars: 1, lamps: 1, clouds: ['#1c2440', '#0c1022'] },
};

function applyTimeOfDay() {
  const t = TOD[game.tod] || TOD.day;
  setSkyColours(...t.sky);
  scene.fog.color.set(t.fog[0]);
  [scene.fog.near, scene.fog.far] = [t.fog[1], t.fog[2]];
  hemi.color.set(t.hemi[0]);
  hemi.groundColor.set(t.hemi[1]);
  hemi.intensity = t.hemi[2];
  sun.color.set(t.sun[0]);
  sun.intensity = t.sun[1];
  SUN_OFFSET.set(...t.sun[2]);
  orb.material.color.set(t.orb);
  orb.position.copy(SUN_OFFSET).normalize().multiplyScalar(1800);
  orb.lookAt(0, 0, 0);
  orb.scale.setScalar(game.tod === 'night' ? 0.7 : 1);
  stars.material.opacity = t.stars;
  stars.visible = t.stars > 0;
  orb.visible = !t.rain;
  rain.lines.visible = !!t.rain;
  if (game.world) game.world.wet = !!t.rain;
  if (game.world) game.world.setLighting(t.lamps, ...t.clouds);
  for (const m of [game.model, game.rivalModel]) if (m) setCarLights(m, t.lamps);
}

const camera = new THREE.PerspectiveCamera(65, 1, 0.25, 4000);
function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
// Field of view chosen for a landscape screen; on a portrait one (a phone held upright) the view is widened
// so you still see about as much of the road to either side, up to a limit.
function fitFov(fov) {
  const a = camera.aspect;
  if (a >= 0.8) return fov;
  const half = Math.atan(Math.tan(fov * Math.PI / 360) * 0.8 / a);
  return Math.min(100, half * 360 / Math.PI);
}

const sound = new Sound();

// ---------- Particles ----------
class Particles {
  constructor() {
    this.geo = new THREE.BoxGeometry(1, 1, 1);
    this.mats = {};
    this.list = [];
  }
  // Each particle fades on its own, so it gets its own copy of the colour's material.
  mat(c) {
    const base = this.mats[c] || (this.mats[c] = new THREE.MeshBasicMaterial({ color: c, transparent: true, depthWrite: false }));
    return base.clone();
  }
  emit(pos, { count = 1, colours = ['#888'], speed = 5, up = 3, size = 0.5, life = 1, gravity = 9.8, grow = 0, alpha = 0.85 }) {
    for (let i = 0; i < count; i++) {
      if (this.list.length > 400) this.kill(0);
      const m = new THREE.Mesh(this.geo, this.mat(colours[Math.floor(Math.random() * colours.length)]));
      m.position.copy(pos);
      m.scale.setScalar(size * (0.6 + Math.random() * 0.8));
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.5, Math.random() - 0.5).normalize().multiplyScalar(speed * Math.random());
      v.y += up * (0.5 + Math.random());
      m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      scene.add(m);
      this.list.push({ m, v, life, max: life, gravity, grow, alpha });
    }
  }
  kill(i) { const p = this.list[i]; scene.remove(p.m); p.m.material.dispose(); this.list.splice(i, 1); }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) { this.kill(i); continue; }
      p.v.y -= p.gravity * dt;
      p.m.position.addScaledVector(p.v, dt);
      if (p.m.position.y < 0.1 && p.gravity > 0) { p.m.position.y = 0.1; p.v.multiplyScalar(0.5); p.v.y = Math.abs(p.v.y) * 0.3; }
      p.m.rotation.x += dt * 4;
      if (p.grow) p.m.scale.multiplyScalar(1 + p.grow * dt);
      p.m.material.opacity = Math.min(p.alpha, p.life / p.max * 2);
    }
  }
  clear() { while (this.list.length) this.kill(0); }
}
const particles = new Particles();

// ---------- Skid marks ----------
// A ring buffer of flat dark strips laid down behind sliding tyres.
class SkidMarks {
  constructor(max = 900) {
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#141414', transparent: true, opacity: 0.5, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -4 }), max);
    this.mesh.frustumCulled = false;
    this.max = max;
    this.clear();
    scene.add(this.mesh);
  }
  clear() {
    this.next = 0;
    this.last = [null, null, null, null];
    this.mesh.count = 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  // Wheel i touches down at p (world) with surface normal up; extend that wheel's mark or break it.
  mark(i, p, up, on) {
    const prev = this.last[i];
    if (!on) { this.last[i] = null; return; }
    if (!prev) { this.last[i] = p.clone(); return; }
    const d = _sk.subVectors(p, prev), len = d.length();
    if (len < 0.25) return;
    if (len > 3) { prev.copy(p); return; }
    const z = d.divideScalar(len), x = _sk2.crossVectors(up, z).normalize(), y = _sk3.crossVectors(z, x);
    _skm.makeBasis(x, y, z).scale(_sks.set(0.3, 1, len + 0.05)).setPosition(_skp.addVectors(p, prev).multiplyScalar(0.5));
    this.mesh.setMatrixAt(this.next, _skm);
    this.next = (this.next + 1) % this.max;
    this.mesh.count = Math.min(this.max, this.mesh.count + 1);
    this.mesh.instanceMatrix.needsUpdate = true;
    prev.copy(p);
  }
}
const _sk = new THREE.Vector3(), _sk2 = new THREE.Vector3(), _sk3 = new THREE.Vector3(), _skp = new THREE.Vector3(),
  _sks = new THREE.Vector3(), _skm = new THREE.Matrix4();
const skids = new SkidMarks();

function explode(pos, paint = game.paint) {
  particles.emit(pos, { count: 40, colours: ['#ffb02e', '#ff5a1f', '#ffe36e'], speed: 14, up: 6, size: 0.6, life: 1.1 });
  particles.emit(pos, { count: 26, colours: ['#333', '#555', '#222'], speed: 5, up: 4, size: 1.2, life: 2.2, gravity: -1, grow: 0.8 });
  particles.emit(pos, { count: 14, colours: [paint, '#222'], speed: 12, up: 9, size: 0.35, life: 2.5 });
}
function splash(pos) {
  particles.emit(new THREE.Vector3(pos.x, -1, pos.z), { count: 60, colours: ['#ffffff', '#bfe4ff', '#7cc4f2'], speed: 6, up: 11, size: 0.5, life: 1.6 });
}

// ---------- Game state ----------
const game = {
  mode: 'menu',
  paint: store.load('paint', PAINTS[0]),
  laps: store.load('laps', 2),
  trackKey: store.load('track', 'b0'),
  rival: store.load('rival', 'pro'),
  carKind: store.load('car', 'comet'),
  gameMode: store.load('gameMode', 'race'),
  tod: store.load('tod', 'day'),
  camMode: 0,
  fovKick: 0,
  timeScale: 1,
  shake: 0,
  world: null,
};
window.game = game;
if (game.rival !== 'off' && !SKILLS[game.rival]) game.rival = 'pro';
if (!TOD[game.tod]) game.tod = 'day';
if (!CARS[game.carKind]) game.carKind = 'comet';
if (!['race', 'attack'].includes(game.gameMode)) game.gameMode = 'race';

const keys = new Set();

const input = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false, air: { pitch: 0, yaw: 0, roll: 0 } };
const NONE = { throttle: 0, brake: 0, steer: 0, handbrake: false };
// Arrows drive; tricks have their own keys so they never fight the steering.
function readInput() {
  const k = c => keys.has(c);
  let throttle = k('ArrowUp') ? 1 : 0;
  let brake = k('ArrowDown') ? 1 : 0;
  let steer = (k('ArrowRight') ? 1 : 0) - (k('ArrowLeft') ? 1 : 0);
  let handbrake = k('Space');
  let boost = k('ShiftLeft') || k('ShiftRight') || k('KeyN');
  // Tricks: W/S flip forward/back, A/D spin, Q/E roll
  let pitch = (k('KeyS') ? 1 : 0) - (k('KeyW') ? 1 : 0);
  let yaw = (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0);
  let roll = (k('KeyE') ? 1 : 0) - (k('KeyQ') ? 1 : 0);
  const pad = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
  if (pad) {
    const ax = pad.axes[0] || 0, rx = pad.axes[2] || 0, ry = pad.axes[3] || 0;
    if (Math.abs(ax) > 0.12) steer = ax;
    if (Math.abs(ry) > 0.3) pitch = ry;
    if (Math.abs(rx) > 0.3) yaw = rx;
    roll = roll || (pad.buttons[5]?.pressed ? 1 : 0) - (pad.buttons[4]?.pressed ? 1 : 0);
    throttle = Math.max(throttle, pad.buttons[7]?.value || 0, pad.buttons[0]?.pressed ? 1 : 0);
    brake = Math.max(brake, pad.buttons[6]?.value || 0, pad.buttons[2]?.pressed ? 1 : 0);
    handbrake = handbrake || !!pad.buttons[1]?.pressed;
    boost = boost || !!pad.buttons[3]?.pressed;
  }
  const airborne = !!game.car && game.car.grounded === 0;
  input.air.pitch = airborne ? pitch : 0;
  input.air.yaw = airborne ? yaw : 0;
  input.air.roll = airborne ? roll : 0;
  Object.assign(input, { throttle, brake, steer, handbrake, boost });
}

// ---------- Tracks ----------
function trackList() {
  const list = BUILTIN.map((b, i) => ({ key: 'b' + i, name: b.name, grid: b.grid, medals: b.medals }));
  for (const [name, data] of Object.entries(customTracks())) list.push({ key: 'c' + name, name, grid: () => deserialize(data), custom: true });
  return list;
}

function loadWorld(grid) {
  if (game.world) game.world.dispose();
  particles.clear();
  skids.clear();
  game.grid = grid;
  game.world = new World(scene, grid);
  const res = walk(grid);
  game.path = res.ok ? res.path : null;
  game.pathIndex = new Map();
  if (game.path) game.path.forEach((p, i) => game.pathIndex.set(p.x + ',' + p.z, i));
  game.trackId = trackId(grid);
  game.car = new CarPhysics(game.world, CARS[game.carKind]);
  if (!game.model) {
    game.model = buildCarModel(game.paint, { kind: game.carKind });
    scene.add(game.model);
  }
  if (!game.ghostModel) {
    game.ghostModel = buildCarModel('#9fe3ff', { ghost: true });
    scene.add(game.ghostModel);
  }
  game.ghostModel.visible = false;
  setRivalModel();
  applyTimeOfDay();
  buildTvCams();
  drawMinimapBase();
  parkAtStart();
}

function parkAtStart() {
  if (!game.path) return;
  const s = spawnPoint(0);
  game.car.reset(s.pos, s.heading);
  for (let i = 0; i < 90; i++) game.car.step(DT, NONE);
}

function setPaint(c) {
  game.paint = c;
  store.save('paint', c);
  rebuildPlayerModel();
  setRivalModel();
  applyTimeOfDay();
}

function rebuildPlayerModel() {
  if (!game.model) return;
  scene.remove(game.model);
  game.model = buildCarModel(game.paint, { kind: game.carKind });
  scene.add(game.model);
}

function setCar(kind) {
  game.carKind = kind;
  store.save('car', kind);
  rebuildPlayerModel();
  applyTimeOfDay();
  if (game.world) {
    game.car = new CarPhysics(game.world, CARS[kind]);
    parkAtStart();
  }
}

// The rival wears blue, or orange when the player already does.
const rivalPaint = () => (game.paint === '#2f7fe0' ? '#ff7a1a' : '#2f7fe0');
function setRivalModel() {
  if (game.rivalModel && game.rivalModel.userData.colour === rivalPaint()) return;
  if (game.rivalModel) scene.remove(game.rivalModel);
  game.rivalModel = buildCarModel(rivalPaint());
  game.rivalModel.userData.colour = rivalPaint();
  game.rivalModel.visible = false;
  scene.add(game.rivalModel);
}

const dirVec = h => new THREE.Vector3(DIRS[h][0], 0, DIRS[h][1]);

// Where to put the car for checkpoint i: the nearest tile at or before it that is safe to stand on,
// preferring one with a few tiles of run-up before the next ramp, water or loop. Never walks back past
// the start line, and never more than a few tiles when a closer spot will do.
function spawnPoint(i) {
  const path = game.path, n = path.length;
  const standable = t => ['start', 'straight', 'corner', 'hump', 'banked', 'boost', 'pipe', 'tunnel', 'dirt', 'ice'].includes(t);
  const stunt = t => ['ramp', 'water', 'loop', 'corkscrew', 'kicker'].includes(t);
  const runup = k => { let d = 1; while (d <= 3 && !stunt(path[(k + d) % n].t)) d++; return d - 1; };
  let k = -1;
  for (const need of [3, 2, 1, 0]) {
    for (let j = i; j >= Math.max(0, i - 6); j--) if (standable(path[j].t) && runup(j) >= need) { k = j; break; }
    if (k >= 0) break;
  }
  if (k < 0) { k = i; while (k > 0 && !standable(path[k].t)) k--; }
  const p = path[k];
  const [cx, cz] = cellCenter(p.x, p.z);
  const c = new THREE.Vector3(cx, 0.95, cz);
  if (p.t === 'start') return { pos: c.addScaledVector(dirVec(p.hout), -4), heading: p.hout, index: k };
  if (!['corner', 'banked', 'hump'].includes(p.t)) return { pos: c, heading: p.hout, index: k };
  // Curves: just inside the entry, on the inside lane, where even a banked curve is still flat
  if (p.t !== 'hump') c.addScaledVector(dirVec(p.hout), 2.5);
  return { pos: c.addScaledVector(dirVec(p.hin), -(HALF - 3)), heading: p.hin, index: k };
}

// ---------- Race ----------
let race = null;

function startRace() {
  const r = walk(game.grid);
  if (!r.ok) return;
  showScreen(null);
  $('hud').classList.remove('hidden');
  $('stunt-feed').innerHTML = '';
  $('hud-delta').className = '';
  $('attitude').classList.remove('on');
  sound.init();
  particles.clear();
  skids.clear();
  const s = spawnPoint(0);
  const side = dirVec((s.heading + 1) % 4);
  const attack = game.gameMode === 'attack' && !game.fromEditor;
  const withRival = game.rival !== 'off' && !attack;
  game.car.reset(s.pos.clone().addScaledVector(side, withRival ? -2.6 : 0), s.heading);
  race = {
    laps: game.fromEditor ? 1 : game.laps,
    lap: 0, time: 0, clock: 0, lapStart: 0, lapTimes: [],
    next: 1 % game.path.length, last: 0,
    countdown: 3, crash: null, stuck: 0, steps: 0,
    frames: [], events: [], ghostRec: [],
    best: store.load('best.' + game.trackId, null),
    ghost: store.load('ghost.' + game.trackId, null), ghostIdx: 0,
    finished: false, finishTime: null,
    stunts: new Stunts(),
    bestStunts: store.load('stunts.' + game.trackId, 0),
    rival: null,
    nitro: 0.3, boosting: false, padT: 0,
    attack, timeLeft: ATTACK_SECONDS,
    splits: [], bestSplits: store.load('splits.' + game.trackId, null),
    bestAttack: store.load('attack.' + game.trackId, 0),
  };
  setCharred(false);
  setCharred(false, game.rivalModel);
  if (withRival) {
    const car = new CarPhysics(game.world);
    car.reset(s.pos.clone().addScaledVector(side, 2.6), s.heading);
    race.rival = {
      car, skill: game.rival, name: SKILLS[game.rival].name,
      lap: 0, next: race.next, last: 0, crash: null, stuck: 0, sinceCp: 0, done: null,
      frames: [], events: [], input: { ...NONE }, driver: new Driver(game.path, game.grid, game.rival, 2.6),
    };
  }
  game.rivalModel.visible = withRival;
  setMode('countdown');
  game.cam = null;
  game.timeScale = 1;
  updateHud(true);
}

function setMode(m) {
  game.mode = m;
  if (m !== 'race') game.timeScale = 1;
  $('replaybar').classList.toggle('hidden', m !== 'replay');
  $('hud').classList.toggle('hidden', !['countdown', 'race', 'finished', 'paused'].includes(m));
}

function respawn() {
  const s = spawnPoint(race.last);
  game.car.reset(s.pos, s.heading);
  race.last = s.index;
  race.next = (s.index + 1) % game.path.length;
  race.crash = null;
  race.stuck = 0;
  race.stunts.cancel();
  setCharred(false);
  race.events.push({ f: race.frames.length / 16, type: 'reset' });
}

function setCharred(on, model = game.model) {
  if (model) model.userData.paint.color.set(on ? '#2a2422' : model === game.model ? game.paint : rivalPaint());
}

// Crash rules shared by the player and the rival. Landing on the wheels, even hard and a bit crooked,
// is fine; the roof, a big nose/side hit, or a brutal or badly tilted landing wrecks the car.
// `st.stuck` counts time spent stuck on the roof or side.
function hazard(car, ev, st) {
  if (car.world.isWater(car.pos.x, car.pos.z) && car.pos.y < -0.6) return 'water';
  const upY = 1 - 2 * (car.q.x * car.q.x + car.q.z * car.q.z);
  const landing = Math.max(ev.landing, ev.under);
  if (ev.roof || ev.impact > 13) return 'wreck';
  if (landing > (upY > 0.6 ? 22 : 11)) return 'landing';
  st.stuck = (upY < 0.3 && car.vel.length() < 2) ? st.stuck + DT : 0;
  return st.stuck > 1.5 ? 'wreck' : null;
}

function crash(kind) {
  if (race.crash) return;
  if (race.attack) { race.timeLeft = Math.max(0, race.timeLeft - 3); setTimeout(() => showMessage($('message').textContent, '−3 seconds', 1.4), 0); }
  race.crash = { t: kind === 'water' ? 2.0 : 2.6, kind: kind === 'water' ? 'water' : 'wreck' };
  const p = game.car.pos;
  if (kind === 'water') { splash(p); sound.splash(); showMessage('SPLASH!', 'Too slow for the jump', 1.8); }
  else { explode(p); sound.crash(); setCharred(true); game.shake = 0.9; showMessage('CRASHED!', kind === 'landing' ? 'Land on your wheels' : '', 1.8); kind = 'wreck'; }
  race.events.push({ f: race.frames.length / 16, type: kind });
}

function rivalCrash(kind) {
  const rv = race.rival, p = rv.car.pos;
  const water = kind === 'water';
  rv.crash = { t: water ? 2.0 : 2.6, kind: water ? 'water' : 'wreck' };
  const near = p.distanceTo(game.car.pos) < 70;
  if (water) { splash(p); if (near) sound.splash(); }
  else { explode(p, rivalPaint()); setCharred(true, game.rivalModel); if (near) sound.crash(); }
  rv.events.push({ f: race.frames.length / 16, type: water ? 'water' : 'wreck' });
}

function respawnRival() {
  const rv = race.rival;
  const s = spawnPoint(rv.last);
  rv.car.reset(s.pos, s.heading);
  rv.last = s.index;
  rv.next = (s.index + 1) % game.path.length;
  rv.crash = null;
  rv.stuck = rv.sinceCp = 0;
  setCharred(false, game.rivalModel);
  rv.events.push({ f: race.frames.length / 16, type: 'reset' });
}

const BRAKE = { throttle: 0, brake: 0.3, steer: 0, handbrake: false };
const SLOWMO = 0.6;           // time scale in the air
const ATTACK_SECONDS = 90, ATTACK_LAP_BONUS = 500;
const ATTACK_MEDALS = [10000, 6000, 3000];   // gold, silver, bronze stunt scores
const NITRO_SECONDS = 3;       // a full tank lasts this long
const NITRO_PER_POINT = 1 / 1200;

function physicsStep() {
  const car = game.car;
  const racing = game.mode === 'race' && !race.crash && !race.finished;
  let inp = racing ? input : NONE;
  if (race.finished) inp = BRAKE;
  // Nitro: burns while held, on the ground, until the tank is empty
  const wantBoost = input.boost;
  race.boosting = racing && wantBoost && race.nitro > 0 && car.grounded > 0;
  input.boost = race.boosting;
  if (race.boosting) race.nitro = Math.max(0, race.nitro - DT / NITRO_SECONDS);
  const ev = car.step(DT, inp);
  input.boost = wantBoost;
  if (boostPad(car)) {
    if (race.padT <= 0) { sound.stunt(0); }
    race.padT = 0.5;
  } else race.padT -= DT;
  race.lastEv = ev;
  race.steps++;
  if (race.rival) {
    rivalStep();
    // Once finished, the rival pulls off the racing line: no more contact, and it fades from view
    const hit = race.rival.done == null ? carContact(car, race.rival.car) : 0;
    if (hit > 2) sound.thud(hit);
  }

  if (game.mode === 'race') {
    race.clock += DT;   // keeps running after the finish, for the rival's time
    if (!race.finished) race.time += DT;
    if (race.attack && !race.finished && (race.timeLeft -= DT) <= 0) finishAttack();
    if (!race.crash && !race.finished) {
      const kind = hazard(car, ev, race);
      if (kind) crash(kind);
      else if (ev.impact > 4 || ev.landing > 4 || ev.under > 4) {
        const hit = Math.max(ev.impact, ev.landing, ev.under);
        sound.thud(hit);
        game.shake = Math.max(game.shake, Math.min(0.5, hit * 0.035));
      }
      if (!kind) checkpoints();
      for (const group of race.stunts.step(car, DT, ev, !!race.crash)) stuntPopup(group);
    }
    if (race.crash) {
      race.crash.t -= DT;
      if (race.crash.t <= 0) respawn();
    }
    // Recording: replay at 60 Hz, ghost at 20 Hz
    if (race.steps % 2 === 0 && !race.finished) {
      recordFrame(race.frames, car);
      if (race.rival) recordFrame(race.rival.frames, race.rival.car);
    }
    if (race.steps % 6 === 0 && !race.finished) {
      race.ghostRec.push([+(race.time - race.lapStart).toFixed(3), ...[car.pos.x, car.pos.y, car.pos.z, car.q.x, car.q.y, car.q.z, car.q.w].map(v => +v.toFixed(3))]);
    }
  }
}

// Boost pads push a car along its nose while its wheels are on the pad.
const PAD_ACCEL = 20, PAD_MAX = 46;
function boostPad(car) {
  const [cx, cz] = cellOf(car.pos.x, car.pos.z);
  const cell = game.grid[cz] && game.grid[cz][cx];
  if (!cell || cell.t !== 'boost' || !car.grounded || car.speed < 1 || !game.world.onRoad(car.pos.x, car.pos.z)) return false;
  if (car.speed < PAD_MAX) car.vel.addScaledVector(_v.set(0, 0, -1).applyQuaternion(car.q), PAD_ACCEL * DT);
  return true;
}

function recordFrame(F, car) {
  const w = car.wheels;
  F.push(car.pos.x, car.pos.y, car.pos.z, car.q.x, car.q.y, car.q.z, car.q.w, car.steer,
    w[0].comp, w[1].comp, w[2].comp, w[3].comp, w[0].spin, w[1].spin, w[2].spin, w[3].spin);
}

function rivalStep() {
  const rv = race.rival, car = rv.car;
  let inp = NONE;
  if (rv.done != null) inp = BRAKE;
  else if (game.mode === 'race' && !rv.crash) inp = rv.driver.drive(car, rv.next, rv.input, game.car);
  const ev = car.step(DT, inp);
  boostPad(car);
  if (game.mode !== 'race') return;
  if (!rv.crash && rv.done == null) {
    const kind = hazard(car, ev, rv);
    if (kind) rivalCrash(kind);
    else {
      const r = advance(rv, car.pos);
      rv.sinceCp = r === 'cp' || r === 'lap' ? 0 : rv.sinceCp + DT;
      if (r === 'lap' && ++rv.lap >= race.laps) {
        rv.done = race.clock;
        if (!race.finished) showMessage('', `${rv.name} rival has finished!`, 1.6);
      }
      if (rv.sinceCp > 12) respawnRival();   // lost or stuck: put it back on track
    }
  }
  if (rv.crash && (rv.crash.t -= DT) <= 0) respawnRival();
}

// Bumping cars: each car is two spheres (nose and tail); equal masses, slightly bouncy.
const _ca = new THREE.Vector3(), _cb = new THREE.Vector3(), _cn = new THREE.Vector3(), _ra = new THREE.Vector3(), _rb = new THREE.Vector3();
function carContact(a, b) {
  const R = 1.0, OFF = 1.2;
  let worst = 0;
  for (const oa of [-OFF, OFF]) for (const ob of [-OFF, OFF]) {
    _ra.set(0, 0, oa).applyQuaternion(a.q);
    _rb.set(0, 0, ob).applyQuaternion(b.q);
    _ca.copy(a.pos).add(_ra);
    _cb.copy(b.pos).add(_rb);
    _cn.subVectors(_ca, _cb);
    const d = _cn.length();
    if (d >= 2 * R || d < 1e-4) continue;
    _cn.divideScalar(d);
    const pen = 2 * R - d;
    a.pos.addScaledVector(_cn, pen / 2);
    b.pos.addScaledVector(_cn, -pen / 2);
    const vrel = a.vel.dot(_cn) - b.vel.dot(_cn);
    if (vrel >= 0) continue;
    worst = Math.max(worst, -vrel);
    const J = _ca.copy(_cn).multiplyScalar(-1.3 * vrel * MASS / 2);
    a.applyImpulse(_ra, J);
    b.applyImpulse(_rb, J.negate());
  }
  return worst;
}

// Move a racer along the tile path. Returns 'cp' (next checkpoint), 'lap', 'missed' or null.
function advance(st, pos) {
  const [cx, cz] = cellOf(pos.x, pos.z);
  const idx = game.pathIndex.get(cx + ',' + cz);
  if (idx === undefined || idx === st.last) return null;
  let res = null;
  // Tiles you can fly over or cut across the inside of (jumps, corners) don't have to be touched
  const n = game.path.length;
  let skip = 0;
  while (skip < 3 && idx !== (st.next + skip) % n && ['ramp', 'water', 'hump', 'kicker', 'corner', 'banked'].includes(game.path[(st.next + skip) % n].t)) skip++;
  if (idx === (st.next + skip) % n && (skip === 0 || idx !== 0)) {
    st.last = idx;
    st.next = (idx + 1) % game.path.length;
    res = idx === 0 ? 'lap' : 'cp';
  } else if (st.curIdx !== idx) res = 'missed';
  st.curIdx = idx;
  return res;
}

function checkpoints() {
  const r = advance(race, game.car.pos);
  if (r === 'cp' && !race.attack) {
    const t = race.time - race.lapStart;
    race.splits[race.last] = t;
    const b = race.bestSplits && race.bestSplits[race.last];
    if (b != null && race.last % 3 === 0) showDelta(t - b);
  }
  if (r === 'lap') lapComplete();
  else if (r === 'missed' && !race.attack) showMessage('', '↩ Missed a checkpoint — go back, or press R', 2);
}

// How far round the race a racer is, in tiles (for positions).
function progress(st, car) {
  const n = game.path.length, p = game.path[st.next];
  const [cx, cz] = cellCenter(p.x, p.z);
  const frac = 1 - Math.min(1, Math.hypot(car.pos.x - cx, car.pos.z - cz) / TILE);
  return st.lap * n + st.last + frac;
}

function playerPosition() {
  const rv = race.rival;
  if (!rv) return 0;
  if (race.finished) return rv.done != null && rv.done < race.finishTime ? 2 : 1;
  if (rv.done != null) return 2;
  return progress(race, game.car) >= progress(rv, rv.car) ? 1 : 2;
}

function lapComplete() {
  if (race.attack) {
    race.lap++;
    race.stunts.score += ATTACK_LAP_BONUS;
    stuntPopup([{ name: 'LAP BONUS', detail: '', pts: ATTACK_LAP_BONUS, mult: 1 }]);
    return;
  }
  const lapTime = race.time - race.lapStart;
  race.lapTimes.push(lapTime);
  race.lap++;
  let record = false;
  const prevBest = race.best;
  if (!race.best || lapTime < race.best) {
    race.best = lapTime;
    record = true;
    store.save('best.' + game.trackId, lapTime);
    store.save('ghost.' + game.trackId, race.ghostRec);
    store.save('splits.' + game.trackId, race.splits);
    race.ghost = race.ghostRec;
    race.bestSplits = race.splits;
  }
  if (prevBest) showDelta(lapTime - prevBest);
  race.splits = [];
  race.ghostRec = [];
  race.ghostIdx = 0;
  race.lapStart = race.time;
  if (race.lap >= race.laps) finish(record);
  else {
    showMessage(record ? 'LAP RECORD!' : `LAP ${race.lap + 1}`, fmt(lapTime), 1.8);
    sound.beep(true);
  }
}

function finishAttack() {
  race.finished = true;
  race.finishTime = race.clock;
  const score = race.stunts.score;
  race.attackRecord = score > 0 && score > race.bestAttack;
  if (race.attackRecord) { race.bestAttack = score; store.save('attack.' + game.trackId, score); }
  sound.beep(true);
  showMessage('TIME!', score.toLocaleString('en') + ' points', 2.2);
  if (race.attackRecord) confetti(game.car.pos);
  setTimeout(() => { if (game.mode === 'race' && race.finished) showAttackResults(); }, 2400);
}

function showAttackResults() {
  const st = race.stunts, score = st.score;
  const got = ATTACK_MEDALS.findIndex(t => score >= t), medal = got >= 0 ? MEDALS[got] : null;
  const i = got >= 0 ? got : 3;
  const nextUp = i > 0 ? `<small>${MEDALS[i - 1]} needs ${ATTACK_MEDALS[i - 1].toLocaleString('en')}</small>` : '<small>the best there is</small>';
  $('res-title').textContent = 'Stunt attack';
  $('res-body').innerHTML = `
    <div class="duel won">${score.toLocaleString('en')}<small>points in ${ATTACK_SECONDS} seconds on ${escapeHtml(game.trackName)}</small></div>
    <div class="medal-row">${medal ? `<i class="medal ${medal}"></i> ${medal[0].toUpperCase() + medal.slice(1)} medal` : 'No medal yet'}${nextUp}</div>
    ${race.attackRecord ? '<div class="record">★ New stunt attack record</div>' : ''}
    <table>
      <tr><td>Stunts landed</td><td>${st.count}</td></tr>
      <tr><td>Laps</td><td>${race.lap}</td></tr>
      <tr><td>Longest air</td><td>${st.biggestAir ? st.biggestAir.toFixed(1) + ' s' : '–'}</td></tr>
      <tr><td>Record</td><td>${race.bestAttack.toLocaleString('en')}</td></tr>
    </table>`;
  showScreen('results');
}

// Celebration: confetti bursting over the car
function confetti(pos) {
  const cols = ['#ffcf2e', '#e8352b', '#2f7fe0', '#22b35a', '#ff7a1a', '#9b4dff', '#ffffff'];
  for (let k = 0; k < 4; k++) {
    setTimeout(() => particles.emit(new THREE.Vector3(pos.x, pos.y + 3, pos.z), { count: 40, colours: cols, speed: 9, up: 9, size: 0.22, life: 2.6, gravity: 6, alpha: 1 }), k * 250);
  }
}

function finish(record) {
  race.finished = true;
  race.finishTime = race.clock;
  const st = race.stunts;
  race.stuntRecord = st.score > 0 && st.score > race.bestStunts;
  if (race.stuntRecord) { race.bestStunts = st.score; store.save('stunts.' + game.trackId, st.score); }
  sound.beep(true);
  const pos = playerPosition();
  showMessage(race.rival ? (pos === 1 ? 'YOU WIN!' : '2ND PLACE') : 'FINISH!', '', 2.2);
  if ((race.rival && pos === 1) || record) confetti(game.car.pos);
  setTimeout(() => {
    if (game.mode !== 'race' || !race.finished) return;
    showResults(record);
  }, 2400);
}

function showResults(record) {
  const total = race.lapTimes.reduce((a, b) => a + b, 0);
  const fastest = Math.min(...race.lapTimes);
  const rv = race.rival, st = race.stunts;
  let duel = '';
  if (rv) {
    const won = playerPosition() === 1;
    const gap = rv.done != null ? Math.abs(rv.done - race.finishTime) : null;
    duel = `<div class="duel ${won ? 'won' : 'lost'}">${won ? '1st' : '2nd'}
      <small>${won
        ? (gap != null ? `beat the ${rv.name} rival by ${gap.toFixed(2)} s` : `the ${rv.name} rival is still on lap ${Math.min(rv.lap + 1, race.laps)}`)
        : `the ${rv.name} rival won by ${gap.toFixed(2)} s`}</small></div>`;
  }
  let medals = '';
  if (game.medals) {
    const got = medalFor(fastest, game.medals), i = got ? MEDALS.indexOf(got) : 3;
    const nextUp = i > 0 ? `<small>${MEDALS[i - 1]} needs ${fmt(game.medals[i - 1])}, ${(fastest - game.medals[i - 1]).toFixed(2)} s to find</small>` : '<small>the best there is</small>';
    medals = `<div class="medal-row">${got ? `<i class="medal ${got}"></i> ${got[0].toUpperCase() + got.slice(1)} medal` : 'No medal yet'}${nextUp}</div>`;
  }
  $('res-title').textContent = game.fromEditor ? 'Test drive done' : 'Finished';
  $('res-body').innerHTML = `
    ${duel}
    ${medals}
    ${record ? '<div class="record">★ New lap record</div>' : ''}
    ${race.stuntRecord ? '<div class="record">★ New stunt record</div>' : ''}
    <table>
      ${race.lapTimes.map((t, i) => `<tr class="${t === fastest ? 'best' : ''}"><td>Lap ${i + 1}</td><td>${fmt(t)}</td></tr>`).join('')}
      <tr><td><b>Total</b></td><td><b>${fmt(total)}</b></td></tr>
      <tr><td>Track record</td><td>${fmt(race.best)}</td></tr>
    </table>
    <table>
      <tr><td><b>Stunt score</b></td><td><b>${st.score.toLocaleString('en')}</b></td></tr>
      <tr><td>Stunts landed</td><td>${st.count}</td></tr>
      <tr><td>Longest air</td><td>${st.biggestAir ? st.biggestAir.toFixed(1) + ' s' : '–'}</td></tr>
      <tr><td>Stunt record</td><td>${race.bestStunts.toLocaleString('en')}</td></tr>
    </table>`;
  showScreen('results');
}

const fmt = t => {
  if (t == null || !isFinite(t)) return '–:––.––';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
};

// ---------- Replay ----------
const replay = { t: 0, speed: 1, playing: true, cam: 3 };
const FR = 16, REPLAY_DT = DT * 2;

function startReplay() {
  showScreen(null);
  particles.clear();
  setCharred(false);
  setCharred(false, game.rivalModel);
  Object.assign(replay, { t: 0, speed: 1, playing: true, cam: 3, lastF: -1, slow: 1, lastY: 0 });
  game.ghostModel.visible = false;
  game.rivalModel.visible = !!race.rival;
  setMode('replay');
  game.cam = null;
  syncReplayUi();
}

function replayFrameCount() { return race.frames.length / FR; }

function replayPose(F, events, t) {
  const n = F.length / FR;
  const f = Math.min(n - 1.001, Math.max(0, t / REPLAY_DT));
  const i = Math.floor(f), a = f - i;
  const o = i * FR, p = (i + 1) * FR;
  const jump = events.some(e => e.type === 'reset' && e.f === i + 1);
  const L = (k) => jump ? F[o + k] : F[o + k] + (F[p + k] - F[o + k]) * a;
  const pos = new THREE.Vector3(L(0), L(1), L(2));
  const q = new THREE.Quaternion(F[o + 3], F[o + 4], F[o + 5], F[o + 6]);
  if (!jump) q.slerp(new THREE.Quaternion(F[p + 3], F[p + 4], F[p + 5], F[p + 6]), a);
  return { pos, q, steer: L(7), comps: [L(8), L(9), L(10), L(11)], spins: [L(12), L(13), L(14), L(15)], frame: i };
}

function updateReplay(dt) {
  const dur = replayFrameCount() * REPLAY_DT;
  // Big moments play in slow motion: airborne or up on a loop
  const prevY = replay.lastY ?? 0;
  replay.slow += ((replay.speed === 1 && prevY > 2.2 ? 0.4 : 1) - (replay.slow ?? 1)) * Math.min(1, dt * 6);
  if (replay.playing) replay.t += dt * replay.speed * (replay.slow ?? 1);
  const rewind = replay.t >= dur;
  if (rewind) { replay.t = 0; particles.clear(); }
  const actors = [{ frames: race.frames, events: race.events, model: game.model, paint: game.paint }];
  if (race.rival) actors.push({ frames: race.rival.frames, events: race.rival.events, model: game.rivalModel, paint: rivalPaint() });
  let main = null;
  for (const A of actors) {
    const s = replayPose(A.frames, A.events, replay.t);
    if (rewind || s.frame < replay.lastF) setCharred(false, A.model);
    // Fire recorded events once as playback passes them
    for (const e of A.events) {
      if (e.f > replay.lastF && e.f <= s.frame) {
        if (e.type === 'wreck') { explode(s.pos, A.paint); setCharred(true, A.model); }
        if (e.type === 'water') splash(s.pos);
        if (e.type === 'reset') setCharred(false, A.model);
      }
    }
    poseCarModel(A.model, s.pos, s.q, s.steer, s.comps, s.spins);
    main = main || s;
  }
  replay.lastF = main.frame;
  replay.lastY = main.pos.y;
  $('rp-seek').value = Math.round(replay.t / dur * 1000);
  return main;
}

// After seeking: clear effects, and don't fire the events that were skipped over
function replayJumped() {
  particles.clear();
  setCharred(false);
  setCharred(false, game.rivalModel);
  replay.lastF = Math.floor(replay.t / REPLAY_DT);
}

function syncReplayUi() {
  $('rp-play').textContent = replay.playing ? '❚❚' : '▶';
  $('rp-speed').textContent = replay.speed + '×';
  $('rp-cam').textContent = CAMS[replay.cam];
}

// ---------- Cameras ----------
const camState = { fwd: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0), tv: -1 };
let tvCams = [];

function buildTvCams() {
  tvCams = [];
  if (!game.path) return;
  game.path.forEach((p, i) => {
    if (i % 2) return;
    const [cx, cz] = cellCenter(p.x, p.z);
    const side = dirVec((p.hout + (i % 4 ? 1 : 3)) % 4);
    const h = p.t === 'loop' ? 4 : 7;
    tvCams.push(new THREE.Vector3(cx, h, cz).addScaledVector(side, 17));
  });
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

function updateCamera(dt, pos, q, mode, opts = {}) {
  const k = 1 - Math.exp(-dt * 5), ku = 1 - Math.exp(-dt * 3);
  const fwd = _v.set(0, 0, -1).applyQuaternion(q);
  const up = _w.set(0, 1, 0).applyQuaternion(q);
  if (!game.cam) {
    camState.fwd.copy(fwd).setY(0).normalize();
    camState.up.set(0, 1, 0);
    camState.tv = -1;
    game.cam = true;
  }
  camera.fov = 65 + (game.fovKick || 0);
  if (mode === 0 || mode === 1) {
    if (opts.wrecked) {
      const v = game.car.vel;
      if (v.lengthSq() > 4) camState.fwd.lerp(v.clone().setY(0).normalize(), k * 0.5);
      camState.up.lerp(new THREE.Vector3(0, 1, 0), ku);
    } else if (opts.airborne) {
      // In the air the camera ignores the car's rotation: it trails the direction of travel, level with
      // the horizon, so flips and spins are seen against the ground.
      const v = opts.vel;
      if (v && v.x * v.x + v.z * v.z > 4) camState.fwd.lerp(_w.set(v.x, 0, v.z).normalize(), k * 0.6);
      camState.fwd.y *= 1 - ku;
      camState.up.lerp(_w.set(0, 1, 0), ku);
    } else {
      camState.fwd.lerp(fwd, k);
      camState.up.lerp(up, ku);
    }
    camState.fwd.normalize();
    camState.up.normalize();
    const dist = mode === 1 ? 13 : 7.2, height = mode === 1 ? 5 : 2.3;
    camera.position.copy(pos).addScaledVector(camState.fwd, -dist).addScaledVector(camState.up, height);
    const gy = game.world.groundHeight(camera.position.x, camera.position.z);
    if (camera.position.y < gy + 0.4 && camState.up.y > 0.5) camera.position.y = gy + 0.4;
    camera.up.copy(camState.up);
    camera.lookAt(_v.copy(pos).addScaledVector(camState.fwd, 3).addScaledVector(camState.up, 0.9));
  } else if (mode === 2) {
    camera.position.copy(pos).add(new THREE.Vector3(0, 0.45, -0.6).applyQuaternion(q));
    camera.quaternion.copy(q);
    camera.fov = 72;
  } else {
    let best = camState.tv, bd = Infinity;
    tvCams.forEach((c, i) => { const d = c.distanceTo(pos); if (d < bd) { bd = d; best = i; } });
    if (camState.tv < 0 || !tvCams[camState.tv] || tvCams[camState.tv].distanceTo(pos) > bd * 1.3 + 4) camState.tv = best;
    const c = tvCams[camState.tv] || new THREE.Vector3(0, 40, 0);
    camera.position.copy(c);
    camera.up.set(0, 1, 0);
    camera.lookAt(pos);
    const d = c.distanceTo(pos);
    camera.fov = THREE.MathUtils.clamp(2 * Math.atan(7 / d) * 180 / Math.PI, 14, 70);
  }
  // Camera shake, decaying
  if (game.shake > 0.01 && mode !== 3) {
    const k2 = game.shake * 0.5;
    camera.position.x += (Math.random() - 0.5) * k2;
    camera.position.y += (Math.random() - 0.5) * k2;
    camera.position.z += (Math.random() - 0.5) * k2;
  }
  game.shake *= Math.exp(-dt * 6);
  camera.fov = fitFov(camera.fov);
  camera.updateProjectionMatrix();
}

// ---------- HUD ----------
const mini = { base: document.createElement('canvas') };
function drawMinimapBase() {
  const c = mini.base;
  c.width = c.height = 180;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 180, 180);
  const s = 170 / GRID;
  for (let z = 0; z < GRID; z++) for (let i = 0; i < GRID; i++) {
    const cell = game.grid[z][i];
    if (cell) drawPiece(x, cell.t, cell.r, 5 + i * s, 5 + z * s, s, { grass: false, simple: true });
  }
}
function toMini(p) { return [5 + (p.x / TILE + GRID / 2) * 170 / GRID, 5 + (p.z / TILE + GRID / 2) * 170 / GRID]; }

function drawMinimap(carPos, ghostPos, rivalPos) {
  const ctx = $('minimap').getContext('2d');
  ctx.clearRect(0, 0, 180, 180);
  ctx.drawImage(mini.base, 0, 0);
  const dot = (p, col, r) => { const [x, y] = toMini(p); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke(); };
  if (ghostPos) dot(ghostPos, 'rgba(160,230,255,0.8)', 4);
  if (rivalPos) dot(rivalPos, rivalPaint(), 4.5);
  dot(carPos, game.paint, 5.5);
}

function drawDial(speedKmh, rpm, gear) {
  const ctx = $('dial').getContext('2d');
  const cx = 110, cy = 110, R = 92;
  ctx.clearRect(0, 0, 220, 220);
  ctx.fillStyle = 'rgba(10,14,22,0.62)';
  ctx.beginPath(); ctx.arc(cx, cy, R + 12, 0, 7); ctx.fill();
  const a0 = Math.PI * 0.75, span = Math.PI * 1.5, MAX = 260;
  // rpm band
  ctx.lineWidth = 7;
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath(); ctx.arc(cx, cy, R - 22, a0, a0 + span); ctx.stroke();
  const rf = Math.min(1, rpm / 7600);
  ctx.strokeStyle = rf > 0.85 ? '#ff4a3a' : '#ffcf2e';
  ctx.beginPath(); ctx.arc(cx, cy, R - 22, a0, a0 + span * rf); ctx.stroke();
  // ticks
  ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff';
  ctx.font = '600 12px Rubik, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let v = 0; v <= MAX; v += 10) {
    const a = a0 + span * v / MAX, major = v % 40 === 0;
    ctx.lineWidth = major ? 3 : 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (R - (major ? 12 : 6)), cy + Math.sin(a) * (R - (major ? 12 : 6)));
    ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    ctx.stroke();
    if (major) ctx.fillText(v, cx + Math.cos(a) * (R - 38), cy + Math.sin(a) * (R - 38));
  }
  const a = a0 + span * Math.min(speedKmh, MAX) / MAX;
  ctx.strokeStyle = '#ff3b2f'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(cx - Math.cos(a) * 12, cy - Math.sin(a) * 12); ctx.lineTo(cx + Math.cos(a) * (R - 4), cy + Math.sin(a) * (R - 4)); ctx.stroke();
  ctx.fillStyle = '#ff3b2f'; ctx.beginPath(); ctx.arc(cx, cy, 7, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '30px "Russo One", sans-serif';
  ctx.fillText(Math.round(speedKmh), cx, cy + 42);
  ctx.font = '11px Rubik, sans-serif';
  ctx.fillText('KM/H', cx, cy + 62);
  ctx.font = '20px "Russo One", sans-serif';
  ctx.fillStyle = '#ffcf2e';
  ctx.fillText(gear === 0 ? 'R' : gear, cx + 44, cy + 12);
}

// Attitude indicator: side view (pitch) and rear view (roll) of the car against the horizon, relative to
// the direction of travel. Green means it would land on its wheels.
const _af = new THREE.Vector3(), _au = new THREE.Vector3();
function drawAttitude(car, show) {
  const el = $('attitude');
  el.classList.toggle('on', show);
  if (!show) return;
  const ctx = el.getContext('2d'), W = el.width, H = el.height;
  ctx.clearRect(0, 0, W, H);
  const vx = car.vel.x, vz = car.vel.z, vl = Math.hypot(vx, vz) || 1;
  const hx = vx / vl, hz = vz / vl;          // travel direction (horizontal)
  const f = _af.set(0, 0, -1).applyQuaternion(car.q), u = _au.set(0, 1, 0).applyQuaternion(car.q);
  const pitch = Math.atan2(f.y, f.x * hx + f.z * hz);
  const roll = Math.atan2(u.x * -hz + u.z * hx, u.y);
  const ok = u.y > 0.6, flipped = u.y < 0;
  const col = flipped ? '#ff5a4a' : ok ? '#7ee08a' : '#ffcf2e';
  const dial = (cx, label, angle, side) => {
    const r = H / 2 - 6, cy = H / 2;
    ctx.fillStyle = 'rgba(10,14,22,0.6)';
    ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - r, cy + 14); ctx.lineTo(cx + r, cy + 14); ctx.stroke();   // ground
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-angle);
    ctx.fillStyle = col;
    if (side) {   // side profile, nose to the right
      ctx.beginPath(); ctx.moveTo(-22, 6); ctx.lineTo(-22, -3); ctx.lineTo(-8, -4); ctx.lineTo(-3, -12); ctx.lineTo(9, -12);
      ctx.lineTo(14, -4); ctx.lineTo(23, -2); ctx.lineTo(23, 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#111'; for (const x of [-13, 13]) { ctx.beginPath(); ctx.arc(x, 7, 5, 0, 7); ctx.fill(); }
    } else {      // rear view
      ctx.beginPath(); ctx.moveTo(-17, 6); ctx.lineTo(-17, -3); ctx.lineTo(-11, -13); ctx.lineTo(11, -13); ctx.lineTo(17, -3);
      ctx.lineTo(17, 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#111'; for (const x of [-14, 14]) ctx.fillRect(x - 3, 4, 6, 8);
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '600 10px Rubik, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(label, cx, H - 2);
  };
  dial(H / 2, 'PITCH', pitch, true);
  dial(W - H / 2, 'ROLL', roll, false);
}

let msgTimer = 0;
function showMessage(main, sub = '', secs = 1.5) {
  $('message').textContent = main;
  $('submessage').textContent = sub;
  $('message').style.opacity = $('submessage').style.opacity = 1;
  msgTimer = secs;
}

function updateHud(force) {
  if (!race) return;
  const lapNo = Math.min(race.lap + 1, race.laps);
  $('hud-lap').textContent = race.attack ? 'STUNT ATTACK' : `LAP ${lapNo}/${race.laps}`;
  $('hud-time').textContent = race.attack ? fmt(Math.max(0, race.timeLeft))
    : fmt(race.finished ? race.lapTimes[race.lapTimes.length - 1] : race.time - race.lapStart);
  $('hud-time').classList.toggle('low', !!race.attack && race.timeLeft < 10);
  const lines = race.attack ? [`Record ${race.bestAttack.toLocaleString('en')}`] : race.lapTimes.map((t, i) => `L${i + 1} ${fmt(t)}`);
  if (!race.attack) lines.push(`Best ${fmt(race.best)}`);
  const html = lines.join('<br>');
  if (force || html !== updateHud.last) { $('hud-laps').innerHTML = html; updateHud.last = html; }
  const pos = playerPosition();
  setText('hud-pos', pos ? (pos === 1 ? '1ST' : '2ND') + `<small>/2 vs ${race.rival.name}</small>` : '', true);
  $('hud-pos').className = pos === 1 ? 'lead' : '';
  const st = race.stunts;
  setText('hud-score', st.score || st.mult > 1 ? `${st.score.toLocaleString('en')}${st.mult > 1 ? ` <em>×${st.mult}</em>` : ''}` : '', true);
  setText('stunt-live', st.live);
  $('nitro-fill').style.width = (race.nitro * 100).toFixed(1) + '%';
  $('nitro').classList.toggle('on', race.boosting);
  $('nitro').classList.toggle('full', race.nitro >= 1);
}

let deltaTimer = 0;
function showDelta(d) {
  const el = $('hud-delta');
  el.textContent = (d < 0 ? '−' : '+') + Math.abs(d).toFixed(2);
  el.className = d < 0 ? 'ahead' : 'behind';
  deltaTimer = 2.5;
}

function setText(id, text, html = false) {
  const el = $(id);
  if (el.dataset.v === text) return;
  el.dataset.v = text;
  if (html) el.innerHTML = text; else el.textContent = text;
}

// Pop-up for a landed stunt (or a bail), floating up from the middle of the screen.
function stuntPopup(group) {
  const el = document.createElement('div');
  if (group[0].bail) {
    el.className = 'pop bail';
    el.textContent = 'BAILED';
  } else {
    el.className = 'pop';
    const mult = group[0].mult;
    race.nitro = Math.min(1, race.nitro + group.reduce((n, a) => n + a.pts * a.mult, 0) * NITRO_PER_POINT);
    el.innerHTML = group.map(a => `<div><b>${a.name}</b>${a.detail ? ` <span>${a.detail}</span>` : ''} <i>+${a.pts}</i></div>`).join('')
      + (mult > 1 ? `<div class="mult">COMBO ×${mult}</div>` : '');
    sound.stunt(mult);
  }
  const feed = $('stunt-feed');
  feed.append(el);
  while (feed.children.length > 3) feed.firstChild.remove();
  el.addEventListener('animationend', () => el.remove());
}

// ---------- Screens ----------
function showScreen(id) {
  for (const s of ['menu', 'pause', 'results', 'help']) $(s).classList.toggle('hidden', s !== id);
}

function renderMenu() {
  const list = $('track-list');
  list.innerHTML = '';
  const tracks = trackList();
  if (!tracks.some(t => t.key === game.trackKey)) game.trackKey = 'b0';
  for (const t of tracks) {
    const b = document.createElement('button');
    b.className = 'track-item' + (t.key === game.trackKey ? ' active' : '');
    const g = t.grid();
    let medal, label;
    if (game.gameMode === 'attack') {
      const pts = store.load('attack.' + trackId(g), 0);
      const i = ATTACK_MEDALS.findIndex(m => pts >= m);
      medal = i >= 0 ? MEDALS[i] : null;
      label = pts ? pts.toLocaleString('en') : '';
    } else {
      const best = store.load('best.' + trackId(g), null);
      medal = medalFor(best, t.medals);
      label = best ? fmt(best) : '';
    }
    b.innerHTML = `<span>${escapeHtml(t.name)}${t.custom ? '<span class="custom">custom</span>' : ''}</span>`
      + `<span class="best">${medal ? `<i class="medal ${medal}"></i>` : ''}${label}</span>`;
    b.onclick = () => { game.trackKey = t.key; store.save('track', t.key); renderMenu(); selectMenuTrack(); };
    list.append(b);
  }
  segmented($('laps'), [1, 2, 3, 5].map(n => [n, n]), game.laps, n => { game.laps = n; store.save('laps', n); });
  segmented($('rival'), [['off', 'Off'], ...Object.entries(SKILLS).map(([k, v]) => [k, v.name])], game.rival,
    k => { game.rival = k; store.save('rival', k); });
  segmented($('gmode'), [['race', 'Race'], ['attack', 'Stunt attack']], game.gameMode, k => { game.gameMode = k; store.save('gameMode', k); });
  $('menu').classList.toggle('attack', game.gameMode === 'attack');
  $('btn-race').textContent = game.gameMode === 'attack' ? 'Go ▸' : 'Race ▸';
  segmented($('car'), Object.entries(CARS).map(([k, v]) => [k, v.name]), game.carKind, setCar);
  $('car-blurb').textContent = CARS[game.carKind].blurb;
  segmented($('tod'), Object.entries(TOD).map(([k, v]) => [k, v.label]), game.tod,
    k => { game.tod = k; store.save('tod', k); applyTimeOfDay(); });
  const cols = $('colours');
  cols.innerHTML = '';
  for (const c of PAINTS) {
    const b = document.createElement('button');
    b.className = 'swatch' + (c === game.paint ? ' active' : '');
    b.style.background = c;
    b.setAttribute('aria-label', 'Paint ' + c);
    b.onclick = () => { setPaint(c); renderMenu(); };
    cols.append(b);
  }
}

function segmented(el, options, current, pick) {
  el.innerHTML = '';
  for (const [value, label] of options) {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = value === current ? 'active' : '';
    b.onclick = () => { pick(value); renderMenu(); };
    el.append(b);
  }
}

const escapeHtml = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function selectMenuTrack() {
  const t = trackList().find(t => t.key === game.trackKey) || trackList()[0];
  game.trackName = t.name;
  game.medals = t.medals || null;
  game.fromEditor = false;
  loadWorld(t.grid());
}

function toMenu() {
  race = null;
  setMode('menu');
  showScreen('menu');
  editor.hide();
  sound.engine(0, 0, false);
  sound.skid(0);
  sound.rival(0, 0);
  sound.boost(0);
  setCharred(false);
  if (game.rivalModel) game.rivalModel.visible = false;
  renderMenu();
  selectMenuTrack();
}

const editor = new Editor({
  onTest(grid, name) {
    editor.hide();
    game.trackName = name;
    game.medals = null;
    game.fromEditor = true;
    loadWorld(grid);
    startRace();
  },
  onBack: toMenu,
});

function openEditor() {
  showScreen(null);
  setMode('editor');
  editor.show(game.fromEditor ? game.grid : null, game.trackName);
}

$('btn-race').onclick = startRace;
$('btn-help').onclick = () => showScreen('help');
$('btn-help-close').onclick = () => { store.save('seenHelp', true); showScreen('menu'); };
$('btn-editor').onclick = () => { game.fromEditor = false; openEditor(); };
$('btn-resume').onclick = () => { showScreen(null); setMode(game.pausedFrom); };
$('btn-restart').onclick = startRace;
$('btn-quit').onclick = () => game.fromEditor ? openEditor() : toMenu();
$('btn-again').onclick = startRace;
$('btn-replay').onclick = startReplay;
$('btn-res-quit').onclick = () => game.fromEditor ? openEditor() : toMenu();
$('rp-play').onclick = () => { replay.playing = !replay.playing; syncReplayUi(); };
$('rp-speed').onclick = () => { replay.speed = { 1: 2, 2: 0.25, 0.25: 0.5, 0.5: 1 }[replay.speed]; syncReplayUi(); };
$('rp-cam').onclick = () => { replay.cam = (replay.cam + 1) % CAMS.length; game.cam = null; syncReplayUi(); };
$('rp-seek').oninput = e => { replay.t = e.target.value / 1000 * replayFrameCount() * REPLAY_DT; replayJumped(); game.cam = null; };
$('rp-exit').onclick = () => { setMode('finished'); showScreen('results'); };

window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  keys.add(e.code);
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) && game.mode !== 'editor') e.preventDefault();
  const m = game.mode;
  if (e.code === 'KeyM') sound.setMuted(!sound.muted);
  if (e.code === 'Escape') {
    if (m === 'race' || m === 'countdown') {
      if (race.finished) return;
      game.pausedFrom = m;
      setMode('paused');
      showScreen('pause');
      sound.engine(0, 0, false);
      sound.skid(0);
      sound.rival(0, 0);
      sound.boost(0);
    } else if (m === 'paused') { showScreen(null); setMode(game.pausedFrom); }
    else if (m === 'replay') $('rp-exit').onclick();
  }
  if (e.code === 'KeyC') {
    if (m === 'replay') $('rp-cam').onclick();
    else if (m === 'race' || m === 'countdown') { game.camMode = (game.camMode + 1) % CAMS.length; game.cam = null; showMessage('', CAMS[game.camMode] + ' camera', 1); }
  }
  if (e.code === 'KeyR' && m === 'race' && race && !race.crash && !race.finished) respawn();
  if (m === 'replay' && e.code === 'Space') $('rp-play').onclick();
  if (m === 'replay' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
    replay.t = Math.max(0, replay.t + (e.code === 'ArrowLeft' ? -5 : 5));
    replayJumped();
  }
});
window.addEventListener('keyup', e => keys.delete(e.code));

// Touch controls: held buttons act as held keys, tap buttons as single key presses
if (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) document.body.classList.add('touch');
for (const b of document.querySelectorAll('#touch button')) {
  const key = b.dataset.key, tap = b.dataset.tap;
  b.addEventListener('pointerdown', e => {
    e.preventDefault();
    document.body.classList.add('touch');
    sound.init();
    if (key) { keys.add(key); b.classList.add('down'); try { b.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ } }
    if (tap) window.dispatchEvent(new KeyboardEvent('keydown', { code: tap }));
  });
  const up = () => { if (key) { keys.delete(key); b.classList.remove('down'); } };
  b.addEventListener('pointerup', up);
  b.addEventListener('pointercancel', up);
  b.addEventListener('lostpointercapture', up);
}
window.addEventListener('blur', () => keys.clear());

// ---------- Main loop ----------
let acc = 0, last = performance.now(), menuAngle = 0, skidTimer = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  readInput();
  const m = game.mode;
  const car = game.car;

  if (m === 'countdown' || m === 'race' || m === 'finished') {
    // Hangtime: the world slows down while the player is properly airborne
    const flying = m === 'race' && !race.crash && !race.finished && car.grounded === 0 && car.airTime > 0.3 && car.pos.y > 1.5;
    game.timeScale += ((flying ? SLOWMO : 1) - game.timeScale) * Math.min(1, dt * (flying ? 5 : 8));
    acc += dt * game.timeScale;
    while (acc >= DT) { physicsStep(); acc -= DT; }
    if (m === 'countdown') {
      const before = Math.ceil(race.countdown);
      race.countdown -= dt;
      const after = Math.ceil(race.countdown);
      if (after !== before || !race.cdShown) {
        race.cdShown = true;
        if (after > 0) { showMessage(String(after), game.trackName, 1.2); sound.beep(false); }
      }
      if (race.countdown <= 0) { setMode('race'); showMessage('GO!', '', 0.8); sound.beep(true); }
    }
    poseCarModel(game.model, car.pos, car.q, car.steer, car.wheels.map(w => w.comp), car.wheels.map(w => w.spin));
    // Count as airborne only after a moment, so bumps don't make the camera twitch. Through a corkscrew the
    // camera stays level too, watching the car roll from behind instead of rolling outside the tube.
    const airborne = (car.grounded === 0 && car.airTime > 0.15 && !car.loopRef) || !!car.rail;
    updateCamera(dt, car.pos, car.q, game.camMode, { wrecked: !!race.crash, airborne, vel: car.vel });
    const rv = race.rival;
    if (rv) {
      const rc = rv.car;
      poseCarModel(game.rivalModel, rc.pos, rc.q, rc.steer, rc.wheels.map(w => w.comp), rc.wheels.map(w => w.spin));
      game.rivalModel.visible = rv.done == null || race.clock - rv.done < 3;
      const d = rc.pos.distanceTo(car.pos);
      sound.rival(rc.rpm, rv.crash ? 0 : Math.max(0, 1 - d / 60));
      if (rv.crash && rv.crash.kind === 'wreck' && Math.random() < dt * 20) {
        particles.emit(rc.pos, { count: 1, colours: ['#333', '#4a4a4a'], speed: 1, up: 2, size: 1, life: 1.6, gravity: -2, grow: 1.2 });
      }
    }

    // Ghost
    let ghostPos = null;
    const gh = race.ghost;
    if (gh && gh.length > 1 && !race.finished && !race.attack) {
      const gt = race.time - race.lapStart;
      if (race.ghostIdx > 0 && gh[race.ghostIdx][0] > gt) race.ghostIdx = 0;
      while (race.ghostIdx < gh.length - 2 && gh[race.ghostIdx + 1][0] <= gt) race.ghostIdx++;
      const A = gh[race.ghostIdx], B = gh[race.ghostIdx + 1];
      if (gt <= gh[gh.length - 1][0] && m === 'race') {
        const a = THREE.MathUtils.clamp((gt - A[0]) / (B[0] - A[0] || 1), 0, 1);
        ghostPos = new THREE.Vector3(A[1], A[2], A[3]).lerp(new THREE.Vector3(B[1], B[2], B[3]), a);
        const gq = new THREE.Quaternion(A[4], A[5], A[6], A[7]).slerp(new THREE.Quaternion(B[4], B[5], B[6], B[7]), a);
        poseCarModel(game.ghostModel, ghostPos, gq, 0, [0.08, 0.08, 0.08, 0.08], [0, 0, 0, 0]);
      }
    }
    game.ghostModel.visible = !!ghostPos && game.ghostModel.position.distanceTo(car.pos) > 2.5;

    // Sound + tyre smoke
    const slip = race.crash ? 0 : Math.max(...car.wheels.map(w => (w.contact && w.slip > 1 ? Math.min(2, w.slip) - 1 : 0)));
    sound.engine((m === 'countdown' ? (input.throttle ? 6500 : 1100) : car.rpm) * (car.spec.tone || 1), input.throttle, !race.crash || race.crash.kind !== 'wreck');
    sound.skid(slip * Math.min(1, Math.abs(car.speed) / 6));
    // Skid marks and grass dust from each wheel
    const up = _w.set(0, 1, 0).applyQuaternion(car.q);
    car.wheels.forEach((w, i) => {
      const p = _v.copy(WHEELS[i].p);
      p.y -= WHEEL_REST - w.comp + WHEEL_RADIUS - 0.04;
      p.applyQuaternion(car.q).add(car.pos);
      skids.mark(i, p, up, w.contact && !race.crash && (w.slip > 0.85 || (input.handbrake && !WHEELS[i].front && Math.abs(car.speed) > 5)));
      if (game.world.wet && w.contact && w.road && !WHEELS[i].front && Math.abs(car.speed) > 10 && Math.random() < dt * 14) {
        particles.emit(p, { count: 1, colours: ['#dfe6ec', '#c8d2da'], speed: 1.5, up: 1.2, size: 0.35, life: 0.5, gravity: 2, grow: 1.5, alpha: 0.4 });
      }
      if (w.contact && !w.road && Math.abs(car.speed) > 8 && Math.random() < dt * Math.abs(car.speed) * 0.2) {
        particles.emit(p, { count: 1, colours: ['#9b8a5a', '#7d6d45', '#a89a6a'], speed: 1.2, up: 0.8, size: 0.3, life: 0.6, gravity: -0.3, grow: 1, alpha: 0.45 });
      }
    });
    skidTimer -= dt;
    if (slip > 0.15 && Math.abs(car.speed) > 3 && skidTimer <= 0) {
      skidTimer = 0.04;
      const back = _v.set(0, -0.5, 1.4).applyQuaternion(car.q).add(car.pos);
      particles.emit(back, { count: 1, colours: ['#dcdcdc', '#c4c4c4'], speed: 1, up: 1, size: 0.3, life: 0.6, gravity: -0.5, grow: 1.4, alpha: 0.5 });
    }
    // Backfire on upshifts under throttle
    if (car.gear > (game.lastGear || 0) && game.lastGear > 0 && input.throttle && m === 'race' && !race.crash) {
      const ex = _v.set(0.45, -0.25, 2.3).applyQuaternion(car.q).add(car.pos);
      particles.emit(ex, { count: 4, colours: ['#ffcf2e', '#ff7a1a', '#ffffff'], speed: 2, up: 0.3, size: 0.22, life: 0.18, gravity: 0, alpha: 1 });
      sound.pop();
    }
    game.lastGear = car.gear;
    const surging = race.boosting || race.padT > 0;
    sound.boost(surging ? 1 : 0);
    game.fovKick += ((surging ? 9 : 0) - game.fovKick) * Math.min(1, dt * 4);
    if (surging) {
      for (const x of [-0.45, 0.45]) {
        const ex = _v.set(x, -0.25, 2.25).applyQuaternion(car.q).add(car.pos);
        particles.emit(ex, { count: 1, colours: ['#7fd4ff', '#ffb02e', '#ff6a1f'], speed: 1.5, up: 0, size: 0.32, life: 0.22, gravity: 0, grow: -2 });
      }
    }
    if (race.crash && race.crash.kind === 'wreck' && Math.random() < dt * 25) {
      particles.emit(car.pos, { count: 1, colours: ['#333', '#4a4a4a'], speed: 1, up: 2, size: 1, life: 1.6, gravity: -2, grow: 1.2 });
    }

    if (deltaTimer > 0 && (deltaTimer -= dt) <= 0) $('hud-delta').className = '';
    if (msgTimer > 0) {
      msgTimer -= dt;
      if (msgTimer <= 0) $('message').style.opacity = $('submessage').style.opacity = 0;
    }
    updateHud();
    drawDial(Math.abs(car.speed) * 3.6, car.rpm, car.gear);
    drawAttitude(car, m === 'race' && !race.crash && car.grounded === 0 && car.airTime > 0.25 && !car.loopRef);
    drawMinimap(car.pos, ghostPos, rv && rv.car.pos);
    focusSun(car.pos);
  } else if (m === 'replay') {
    const s = updateReplay(dt);
    updateCamera(dt, s.pos, s.q, replay.cam, {});
    focusSun(s.pos);
    sound.engine(0, 0, false);
    sound.skid(0);
    sound.rival(0, 0);
    sound.boost(0);
  } else if (m === 'menu' && game.world) {
    menuAngle += dt * 0.06;
    const R = 230;
    camera.position.set(Math.cos(menuAngle) * R, 95, Math.sin(menuAngle) * R);
    camera.up.set(0, 1, 0);
    camera.fov = fitFov(55);
    camera.updateProjectionMatrix();
    camera.lookAt(-30, 0, 0);
    poseCarModel(game.model, car.pos, car.q, 0, car.wheels.map(w => w.comp), [0, 0, 0, 0]);
    focusSun(new THREE.Vector3(0, 0, 0), 180);
  }
  particles.update(dt * game.timeScale);
  rain.update(dt * game.timeScale, camera.position);
  if (game.world) for (const w of game.world.waterMeshes) w.position.y = -1.2 + Math.sin(now / 700) * 0.08;
  if (m !== 'editor') renderer.render(scene, camera);
}

function focusSun(p, extent = 50) {
  sun.target.position.copy(p);
  sun.position.copy(p).add(SUN_OFFSET);
  const c = sun.shadow.camera;
  if (c.right !== extent) {
    Object.assign(c, { left: -extent, right: extent, top: extent, bottom: -extent });
    c.updateProjectionMatrix();
  }
}

game.debug = { input, physicsStep, setMode, editor, Driver, skids, get race() { return race; } };

// A shared link (#track=name&code=…) adds the track to "my tracks" and selects it.
function importSharedTrack() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (!h.get('code')) return;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const data = atob(h.get('code'));
    const grid = deserialize(data);
    if (!walk(grid).ok) return;
    const all = customTracks();
    let name = (h.get('track') || 'Shared track').slice(0, 32);
    const existing = Object.keys(all).find(k => all[k] === data);
    if (existing) name = existing;
    else {
      for (let i = 2; all[name]; i++) name = `${(h.get('track') || 'Shared track').slice(0, 28)} ${i}`;
      all[name] = data;
      store.save('tracks', all);
    }
    game.trackKey = 'c' + name;
    game.sharedTrack = name;
  } catch { /* not a valid track code */ }
}

function noteSharedTrack() {
  if (game.sharedTrack) $('menu-note').textContent = `Shared track “${game.sharedTrack}” added to your tracks.`;
}
window.addEventListener('hashchange', () => {
  game.sharedTrack = null;
  importSharedTrack();
  if (game.sharedTrack && game.mode === 'menu') { toMenu(); noteSharedTrack(); }
});

importSharedTrack();
toMenu();
noteSharedTrack();
if (!store.load('seenHelp', false)) showScreen('help');   // first visit
requestAnimationFrame(frame);
