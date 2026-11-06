// Dev mode: the tools for working on the tracks. On by itself when the game's served from this machine or the
// local network (serve.py), off on the published site unless asked for with rush.html?dev; and switched off (or
// back on) from the menu, remembered. With it: the tracks still in development, listed apart; a free camera, in
// any track at any moment (F); the medal lines, the way the best bronze, silver and gold runs went (L); and the
// run library, every run serve.py has kept, to watch again from the camera that was used or from the free one,
// bare or with its blasts and fires (X); and snapshots (K), what's on the screen and the game's state, kept by
// serve.py in replays/snaps/ for a look at what you mean.
import * as THREE from 'three';
import * as store from '../store.js';

const host = location.hostname;
export const LOCAL = host === '' || /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])|\.local$/.test(host);
const asked = new URLSearchParams(location.search).get('dev');
export const DEV = asked != null ? asked !== '0' : store.load('rush.dev', LOCAL);
// (switching reloads: what's listed is settled as the page starts)
export function setDev(on) {
  store.save('rush.dev', on);
  const u = new URL(location.href);
  u.searchParams.delete('dev');
  location.href = u.href;
}

export const MEDAL_COLOURS = ['', '#e09a5a', '#d8dde6', '#ffd23a'];
export const MEDAL_NAMES = ['None', 'Bronze', 'Silver', 'Gold'];

// ---------- The run library ----------
// serve.py's summary of every replay it's kept: level, car, score, medal, and your car's way to the crash
let lib = null;
export function library(fresh) {
  if (fresh || !lib) lib = fetch('replays/index', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null);
  return lib;
}
// A level's runs, best first, each with its medal by the medals as they are now (not as they were when it was run)
export function runsOf(list, key, medals) {
  return (list || []).filter(r => r.level === key)
    .map(r => ({ ...r, medal: medals.reduce((m, t, i) => (r.score >= t ? i + 1 : m), 0) }))
    .sort((a, b) => b.score - a.score);
}
// The best run of each medal there's one for, gold first
export function medalRuns(runs) {
  return [3, 2, 1].map(m => runs.find(r => r.medal === m)).filter(Boolean);
}
// As guide lines (see guides.js)
export const asRoutes = runs => medalRuns(runs).map(r => ({ name: `${MEDAL_NAMES[r.medal]} · ${r.car}`, colour: MEDAL_COLOURS[r.medal], score: r.score, pts: r.path }));
export async function loadRun(name) {
  const r = await fetch('replays/' + encodeURIComponent(name), { cache: 'no-store' });
  if (!r.ok) throw new Error(`server said ${r.status}`);
  return r.json();
}

// ---------- The free camera ----------
// Keys: WASD or the arrows to fly, E or Space up, Q or C down, Shift for fast; drag to look round, the wheel to
// go forward and back. On a phone: drag to look round; two fingers to slide (drag) and go forward and back (pinch).
export class FreeCam {
  constructor(camera, el, keys) {
    Object.assign(this, { camera, el, keys, on: false, yaw: 0, pitch: 0, speed: 24 });
    this.pointers = new Map();
    this.move = new THREE.Vector3();     // from the fingers or the wheel, used up by the next update
    el.addEventListener('pointerdown', e => {
      if (!this.on) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { el.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    });
    el.addEventListener('pointermove', e => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (this.pointers.size === 1) {
        this.yaw -= dx * 0.004;
        this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.004, -1.5, 1.5);
      } else {
        // (two fingers: each moves the camera by half the slide; the gap between them, forward and back)
        const [a, b] = [...this.pointers.values()], gap = Math.hypot(a.x - b.x, a.y - b.y);
        p.x = e.clientX; p.y = e.clientY;
        const gap2 = Math.hypot(a.x - b.x, a.y - b.y), k = this.speed * 0.004;
        this.move.x -= dx * k / 2;
        this.move.y += dy * k / 2;
        this.move.z += (gap2 - gap) * k;
        return;
      }
      p.x = e.clientX; p.y = e.clientY;
    });
    const up = e => this.pointers.delete(e.pointerId);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', e => { if (this.on) { e.preventDefault(); this.move.z -= e.deltaY * this.speed * 0.004; } }, { passive: false });
  }
  // Take over from wherever the camera's looking now
  enter() {
    const d = this.camera.getWorldDirection(new THREE.Vector3());
    this.yaw = Math.atan2(-d.x, -d.z);
    this.pitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
    this.pointers.clear();
    this.move.set(0, 0, 0);
    this.on = true;
  }
  leave() { this.on = false; this.pointers.clear(); }
  update(dt) {
    const k = c => this.keys.has(c);
    const fast = k('ShiftLeft') || k('ShiftRight') ? 4 : 1;
    const f = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0);
    const s = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
    const u = (k('KeyE') || k('Space') ? 1 : 0) - (k('KeyQ') || k('KeyC') ? 1 : 0);
    const c = this.camera, step = this.speed * fast * dt;
    const fwd = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    c.position.addScaledVector(fwd, f * step + this.move.z).addScaledVector(right, s * step + this.move.x);
    c.position.y += u * step + this.move.y;
    this.move.set(0, 0, 0);
    c.up.set(0, 1, 0);
    c.lookAt(c.position.clone().add(fwd));
  }
}

// ---------- Snapshots ----------
// What was on the screen (`image`, a data: URL of the 3D view: not the menus or the HUD over it, which `meta`
// describes), sent to serve.py
export async function snapshot(image, meta) {
  const r = await fetch('snaps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image, meta }) });
  if (!r.ok) throw new Error(`server said ${r.status}`);
  return (await r.json()).name;
}

// ---------- The dev bar and the replay bar ----------
const css = `
#dev { position: fixed; top: max(8px, env(safe-area-inset-top)); right: max(8px, env(safe-area-inset-right)); z-index: 20; display: flex;
  gap: 6px; align-items: center; font-size: 13px; }
#dev b { font: 12px 'Russo One', sans-serif; letter-spacing: 1px; color: var(--accent-ink); background: var(--hot); padding: 4px 7px; border-radius: 6px; }
#dev button, #devrun button { padding: 6px 10px; font-size: 13px; background: var(--panel); }
#dev button.on, #devrun button.on { border-color: var(--hot); background: rgba(255, 138, 30, 0.28); }
#devlib { position: fixed; top: calc(max(8px, env(safe-area-inset-top)) + 40px); right: max(8px, env(safe-area-inset-right)); z-index: 20;
  width: min(380px, calc(100vw - 16px)); max-height: 70vh; overflow: auto; background: var(--panel); border: 1px solid var(--line);
  border-radius: 12px; padding: 10px 12px; backdrop-filter: blur(6px); font-size: 13px; }
#devlib h3 { margin: 4px 0 8px; }
#devlib p { margin: 6px 0; opacity: 0.75; line-height: 1.4; }
#devlib .run { display: grid; grid-template-columns: 12px 1fr auto; gap: 8px; align-items: center; width: 100%; text-align: left; padding: 7px 9px; margin-bottom: 5px; }
#devlib .run i { width: 10px; height: 10px; border-radius: 50%; background: #555; }
#devlib .run small { opacity: 0.65; }
#devlib .run .num { font-variant-numeric: tabular-nums; }
#devrun { position: fixed; left: 50%; transform: translateX(-50%); bottom: max(10px, env(safe-area-inset-bottom)); z-index: 20;
  width: min(760px, calc(100vw - 16px)); display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center; background: var(--panel);
  border: 1px solid var(--line); border-radius: 12px; padding: 8px 10px; backdrop-filter: blur(6px); font-size: 13px; }
#devrun input { flex: 1 1 200px; accent-color: var(--hot); }
#devrun .t { font-variant-numeric: tabular-nums; min-width: 92px; text-align: center; }
#devrun .what { flex-basis: 100%; opacity: 0.8; font-size: 12px; }
#devhint { position: fixed; left: 50%; transform: translateX(-50%); top: max(8px, env(safe-area-inset-top)); z-index: 19; font-size: 12px;
  background: var(--panel); border-radius: 8px; padding: 5px 10px; opacity: 0.85; pointer-events: none; }
.list h4 { margin: 6px 0 0; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; opacity: 0.5; font-weight: 600; }
.list .dev-only b::after { content: 'DEV'; margin-left: 8px; font-size: 10px; padding: 1px 5px; border-radius: 4px; background: var(--hot); color: var(--accent-ink); vertical-align: 2px; }
`;
const el = (tag, attrs = {}, html = '') => Object.assign(document.createElement(tag), attrs, html ? { innerHTML: html } : {});

// The bar up in the corner: free camera, lines, runs. `on` has the callbacks: free(), lines(), runs()
export function devBar(on) {
  document.head.appendChild(el('style', {}, css));
  const bar = el('div', { id: 'dev' });
  const b = (label, title, fn) => { const x = el('button', { title, textContent: label }); x.onclick = fn; bar.appendChild(x); return x; };
  bar.appendChild(el('b', { textContent: 'DEV' }));
  const ui = {
    free: b('Free cam', 'Free camera (F)', on.free),
    lines: b('Lines', 'Medal lines (L)', on.lines),
    runs: b('Runs', 'The run library (V)', on.runs),
    snap: b('Snap', 'Snapshot of what you see, for Claude (K)', on.snap),
    hint: el('div', { id: 'devhint', className: 'hidden' }),
    lib: el('div', { id: 'devlib', className: 'hidden' }),
  };
  document.body.append(bar, ui.hint, ui.lib);
  return ui;
}

// The list of a level's runs, medal runs first; `watch(run)` when one's picked
export function showRuns(box, levelName, runs, watch) {
  box.innerHTML = '';
  box.appendChild(el('h3', { textContent: `Runs · ${levelName}` }));
  if (runs == null) {
    box.appendChild(el('p', {}, 'No run library: it needs serve.py (restart it if it was running before dev mode came in).'));
    return;
  }
  if (!runs.length) {
    box.appendChild(el('p', {}, 'No runs kept for this track yet. In dev mode every run you finish is kept.'));
    return;
  }
  const medal = medalRuns(runs), row = (r, tag) => {
    const x = el('button', { className: 'run' },
      `<i style="background:${MEDAL_COLOURS[r.medal] || '#555'}"></i><span>${tag ? `<b>${tag}</b> · ` : ''}${r.car} · ${r.time}<br><small>${(r.date || '').slice(0, 16).replace('T', ' ')}</small></span><span class="num">${r.score.toLocaleString()}</span>`);
    x.onclick = () => watch(r);
    box.appendChild(x);
  };
  for (const r of medal) row(r, MEDAL_NAMES[r.medal]);
  const missing = [3, 2, 1].filter(m => !medal.some(r => r.medal === m)).map(m => MEDAL_NAMES[m].toLowerCase());
  if (missing.length) box.appendChild(el('p', {}, `No ${missing.join(' or ')} run kept yet, so no line for it.`));
  const rest = runs.filter(r => !medal.includes(r));
  if (rest.length) box.appendChild(el('h3', { textContent: `All runs (${runs.length})` }));
  for (const r of rest) row(r);
}

// The bar under a run being watched: play and pause, the time, the speed, which camera; `on`: seek(t), close()
export function replayBar(run, start, end, on) {
  const bar = el('div', { id: 'devrun' });
  const play = el('button', { textContent: '❚❚', title: 'Play / pause (P)' });
  const range = el('input', { type: 'range', min: start, max: end, step: 0.01, value: start });
  const tEl = el('span', { className: 't' });
  const speeds = [0.25, 0.5, 1, 2].map(s => el('button', { textContent: s + '×' }));
  const camB = el('button', { textContent: 'Free cam', title: 'Free camera (F)' });
  const fxB = el('button', { textContent: 'FX', title: 'Blasts, fires and smoke, as in a run (X)' });
  const close = el('button', { textContent: '✕', title: 'Back to the menu' });
  const what = el('span', { className: 'what', innerHTML: `<b style="color:${MEDAL_COLOURS[run.medal] || 'inherit'}">${MEDAL_NAMES[run.medal]}</b> · ${run.score.toLocaleString()} · ${run.car} · ${run.name}` });
  bar.append(play, range, tEl, ...speeds, camB, fxB, close, what);
  document.body.appendChild(bar);
  const S = { t: start, playing: true, speed: 1, fx: store.load('rush.devFx', false), run, bar, camB };
  const show = () => {
    play.textContent = S.playing ? '❚❚' : '▶';
    range.value = S.t;
    tEl.textContent = `${S.t.toFixed(1)} / ${end.toFixed(1)} s`;
    speeds.forEach((b, i) => b.classList.toggle('on', [0.25, 0.5, 1, 2][i] === S.speed));
    fxB.classList.toggle('on', S.fx);
  };
  fxB.onclick = S.toggleFx = () => { S.fx = !S.fx; store.save('rush.devFx', S.fx); show(); };
  play.onclick = () => { if (S.t >= end) S.t = start; S.playing = !S.playing; show(); };
  range.oninput = () => { S.t = +range.value; S.playing = false; show(); };
  speeds.forEach((b, i) => { b.onclick = () => { S.speed = [0.25, 0.5, 1, 2][i]; show(); }; });
  camB.onclick = on.free;
  close.onclick = on.close;
  S.toggle = play.onclick;
  S.advance = dt => {
    if (!S.playing) return;
    S.t = Math.min(end, S.t + dt * S.speed);
    if (S.t >= end) S.playing = false;
    show();
  };
  S.dispose = () => bar.remove();
  show();
  return S;
}
