// Replays: a record of a run, to send from the results to the server (serve.py) and look into afterwards. Every
// vehicle's position and turn RATE times a second (of game time, so the slow motion gets more), your inputs,
// where the camera was and what it looked at, and the crash's events: what scored where, what blew up.
export const RATE = 20;
const r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
// A vehicle's state, as bits
export const FLAGS = { wrecked: 1, dead: 2, blown: 4, halved: 8, asleep: 16 };

export class Recorder {
  constructor(meta) {
    this.meta = meta;
    this.bodies = {};      // by id: what each one is (kind, paint, length)
    this.frames = [];
    this.events = [];
    // (a car boxed up on Tower Dive's sky decks doesn't move till it's let go: its pose once, and when it went)
    this.held = {};        // by id: [x, y, z, qx, qy, qz, qw, released at (null while it's still in its box)]
    this.next = 0;
  }
  // `list`: [{ id, kind, paint, len, car, flags }]; `cam`: the camera's position and a point it looks at; `on`:
  // what the crash camera is following
  frame(t, state, input, list, cam, look, on) {
    if (t < this.next) return;
    this.next = t + 1 / RATE - 1e-6;
    const b = [];
    for (const v of list) {
      if (!this.bodies[v.id]) this.bodies[v.id] = { kind: v.kind, paint: v.paint, len: v.len };
      const p = v.car.pos, q = v.car.q;
      if (v.held) { if (!this.held[v.id]) this.held[v.id] = [r2(p.x), r2(p.y), r2(p.z), r3(q.x), r3(q.y), r3(q.z), r3(q.w), null]; continue; }
      if (this.held[v.id] && this.held[v.id][7] == null) this.held[v.id][7] = r3(t);
      b.push([v.id, r2(p.x), r2(p.y), r2(p.z), r3(q.x), r3(q.y), r3(q.z), r3(q.w), v.flags]);
    }
    this.frames.push({ t: r3(t), s: state,
      in: [r2(input.throttle), r2(input.brake), r2(input.steer), input.boost ? 1 : 0, input.handbrake ? 1 : 0, input.nitro ? 1 : 0],
      cam: [cam.x, cam.y, cam.z, look.x, look.y, look.z].map(r2), on, b });
  }
  event(t, type, data = {}) { this.events.push({ t: r3(t), type, ...data }); }
  toJSON() { return { version: 1, ...this.meta, rate: RATE, flags: FLAGS, bodies: this.bodies, held: this.held, events: this.events, frames: this.frames }; }
}

// Whether the server takes replays (it says so at /replays/ping), asked once
let can = null;
export function canSend() {
  if (!can) can = fetch('replays/ping', { cache: 'no-store' }).then(r => r.ok).catch(() => false);
  return can;
}
// Send one: resolves to the file name the server saved it as
export async function send(rec) {
  const r = await fetch('replays', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rec) });
  if (!r.ok) throw new Error(`server said ${r.status}`);
  return (await r.json()).name;
}
