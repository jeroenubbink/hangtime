// Derby opponents. Each picks a victim (close, weak, or whoever hit it last, as its temper says), drives at
// where the victim will be, and rams it. Some like to reverse in, sparing their engine. They go for repairs
// when hurt, back away from the edge of a rooftop, and wriggle free when stuck.
import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

export class DerbyDriver {
  constructor(temper) {
    this.t = temper;
    this.target = null;
    this.think = Math.random() * 0.5;
    this.stuck = 0;
    this.backup = 0;
    this.backSteer = 0;
    this.mode = 'hunt';
    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };
    this.useItem = false;
    this.aimErr = 0;
    this.swoop = null;
  }

  // `me`: this Vehicle; `ctx`: { vehicles, arena, pickups, time, sudden }
  drive(me, ctx, dt) {
    const c = me.car, inp = this.input, T = this.t;
    const fx = -2 * (c.q.x * c.q.z + c.q.w * c.q.y), fz = -(1 - 2 * (c.q.x * c.q.x + c.q.y * c.q.y));   // forward, flat
    const heading = Math.atan2(fx, fz);
    const speed = c.speed;
    this.useItem = false;

    // Rethink a few times a second
    this.think -= dt;
    if (this.think <= 0) {
      this.think = 0.35 + Math.random() * 0.3;
      this.choose(me, ctx);
      this.aimErr = (Math.random() - 0.5) * (1 - T.skill) * 0.5;
    }

    // After a hit, or when pushing at walking pace against the target: swing out wide for a run-up, then
    // turn in and charge (which tends to catch the target side-on)
    if (this.swoop) {
      this.swoop.t -= dt;
      if (this.swoop.t <= 0 || Math.hypot(this.swoop.x - c.pos.x, this.swoop.z - c.pos.z) < 5 || !tgt0(this)) this.swoop = null;
    } else if (this.mode === 'hunt' && tgt0(this) && ctx.time > 0.5) {
      const tc = this.target.car, d = tc.pos.distanceTo(c.pos);
      this.scrum = d < 7 && Math.abs(speed) < 6 ? (this.scrum || 0) + dt : 0;
      if ((ctx.time - (me.bumpT ?? -9) < 0.02 && d < 8) || this.scrum > 0.4) {
        this.scrum = 0;
        // A point off to one side of the target, inside the arena
        const away = Math.atan2(c.pos.x - tc.pos.x, c.pos.z - tc.pos.z);
        for (const side of Math.random() < 0.5 ? [1, -1] : [-1, 1]) {
          const a = away + side * (0.9 + Math.random() * 0.5), r = 14 + Math.random() * 6;
          const x = tc.pos.x + Math.sin(a) * r, z = tc.pos.z + Math.cos(a) * r;
          if (ctx.arena.edge(x, z) < -7) { this.swoop = { x, z, t: 2.2 }; break; }
        }
        if (!this.swoop) this.swoop = { x: tc.pos.x * 0.3, z: tc.pos.z * 0.3, t: 1.5 };
      }
    }
    // Stuck against something: back out, turning the other way
    if (this.backup > 0) {
      this.backup -= dt;
      Object.assign(inp, { throttle: 0, brake: 1, steer: this.backSteer, handbrake: false, boost: false });
      this.phase = 'unstick';
      return inp;
    }
    if (inp.throttle > 0.5 && Math.abs(speed) < 1.2) this.stuck += dt; else this.stuck = Math.max(0, this.stuck - dt * 2);
    if (this.stuck > 1.1) {
      this.stuck = 0;
      this.backup = 0.9 + Math.random() * 0.6;
      this.backSteer = Math.random() < 0.5 ? -1 : 1;
    }

    // Where to go
    let gx, gz, reverse = false, ram = false;
    const tgt = this.target;
    if (this.swoop) {
      [gx, gz] = [this.swoop.x, this.swoop.z];
    } else if (this.mode === 'fetch' && this.pickup && this.pickup.active) {
      [gx, gz] = [this.pickup.x, this.pickup.z];
    } else if (tgt && tgt.alive) {
      const tc = tgt.car;
      const dx = tc.pos.x - c.pos.x, dz = tc.pos.z - c.pos.z, dist = Math.hypot(dx, dz);
      // Lead the target: aim where it will be when we get there
      const tt = Math.min(1.6, dist / Math.max(12, Math.abs(speed) + 6)) * T.skill;
      gx = tc.pos.x + tc.vel.x * tt;
      gz = tc.pos.z + tc.vel.z * tt;
      ram = true;
      // Reverse into a target that's close behind us
      const behind = Math.abs(wrap(Math.atan2(dx, dz) - heading)) > 2.4;
      if (behind && dist < 13 && (T.reverse > 0.3 || me.zones.front > 0.7)) reverse = true;
    } else {
      gx = 0; gz = 0;
    }

    // The edge: steer back in when heading out near it, and on the rooftop brake for it
    const arena = ctx.arena;
    const look = Math.max(6, Math.abs(speed) * (arena.def.fall ? 1.1 : 0.6));
    const ax = c.pos.x + fx * look * Math.sign(speed || 1), az = c.pos.z + fz * look * Math.sign(speed || 1);
    const edgeAhead = arena.edge(ax, az);
    let danger = 0;
    if (edgeAhead > -4) {
      danger = clamp((edgeAhead + 4) / 6, 0, 1);
      // Blend the goal toward the middle
      const k = arena.def.fall ? 0.85 : 0.5;
      if (!ram || arena.def.fall || danger > 0.8) { gx = gx * (1 - danger * k); gz = gz * (1 - danger * k); }
    }

    let want = Math.atan2(gx - c.pos.x, gz - c.pos.z);
    let err = wrap(want - heading) + this.aimErr;
    if (reverse) err = wrap(err + Math.PI);
    // Angles grow anticlockwise seen from above, so steering right (+) turns toward smaller angles
    let steer = clamp(-err * 2.0, -1, 1);
    let throttle = 1, brake = 0, handbrake = false;
    this.phase = this.swoop ? 'swoop' : this.mode;
    if (reverse) { throttle = 0; brake = 1; steer = -steer; this.phase = 'revram'; }
    else if (Math.abs(err) > 2.2 && Math.abs(speed) < 6 && edgeAhead > -8) {
      // Target well behind: three-point turn (reverse with opposite lock)
      throttle = 0; brake = 1; steer = Math.sign(err);
      this.phase = 'threepoint';
    } else if (Math.abs(err) > 1.1 && speed > 14) {
      // Sharp turn at speed: lift and yank the handbrake
      throttle = 0.3; handbrake = T.skill > 0.7;
      this.phase = 'sharp';
    }
    // Rooftop edge right ahead: brake hard
    if (arena.def.fall && edgeAhead > -2 && speed > 6 && Math.abs(err) > 0.5) { throttle = 0; brake = 1; }
    // Nitro: lined up on a target not too far off
    let boost = false;
    if (ram && tgt && !reverse) {
      const d = tgt.car.pos.distanceTo(c.pos);
      boost = Math.abs(err) < 0.18 && d > 10 && d < 40 && me.nitro > 0.25 && danger < 0.5;
    }
    // Items: a shockwave in a crowd, a mine when someone's on our tail
    if (me.item) this.useItem = this.wantItem(me, ctx, fx, fz);
    Object.assign(inp, { throttle, brake, steer, handbrake, boost });
    return inp;
  }

  choose(me, ctx) {
    const T = this.t, c = me.car;
    // Go for a repair when hurt (cautious drivers sooner)
    const hurt = 1 - me.hp / me.maxHp;
    if (hurt > 0.75 - T.caution * 0.35 || me.car.wheels.some(w => w.lost)) {
      let best = null, bd = Infinity;
      for (const p of ctx.pickups) {
        if (!p.active || p.type !== 'repair') continue;
        const d = Math.hypot(p.x - c.pos.x, p.z - c.pos.z);
        if (d < bd) { bd = d; best = p; }
      }
      if (best && bd < 70) { this.mode = 'fetch'; this.pickup = best; return; }
    }
    // Grab a nearby pickup on the way when there's nothing better to do
    this.mode = 'hunt';
    let best = null, bs = -Infinity;
    for (const v of ctx.vehicles) {
      if (v === me || !v.alive) continue;
      const d = v.car.pos.distanceTo(c.pos);
      let s = 60 / (d + 12);
      s *= 1 + (1 - v.hp / v.maxHp) * 0.8;                                         // finish off the weak
      if (me.lastHit && me.lastHit.by === v && ctx.time - me.lastHit.t < 8) s *= T.grudge;   // revenge
      if (v === this.target) s *= 1.35;                                            // stick with it
      if (v.player) s *= ctx.playerBias || 1.1;
      if (v.shield > 0) s *= 0.3;
      // Don't all pile onto one car: the player gets at most three hunters at a time, anyone else four
      let hunters = 0;
      for (const o of ctx.vehicles) if (o !== me && o.alive && o.driver?.target === v) hunters++;
      if (v !== this.target && hunters >= (v.player ? 3 : 4)) s *= 0.3;
      s *= T.aggro;
      if (s > bs) { bs = s; best = v; }
    }
    this.target = best;
    if (!best || best.car.pos.distanceTo(c.pos) > 30) {
      for (const p of ctx.pickups) {
        if (p.active && Math.hypot(p.x - c.pos.x, p.z - c.pos.z) < 18) { this.mode = 'fetch'; this.pickup = p; break; }
      }
    }
  }

  wantItem(me, ctx, fx, fz) {
    const c = me.car;
    let near = 0, tail = false;
    for (const v of ctx.vehicles) {
      if (v === me || !v.alive) continue;
      const dx = v.car.pos.x - c.pos.x, dz = v.car.pos.z - c.pos.z, d = Math.hypot(dx, dz);
      if (d < 9) near++;
      if (d < 16 && (dx * fx + dz * fz) < -4 && v.driver?.target === me) tail = true;
    }
    if (me.item === 'shock') return near >= 2 || (near >= 1 && me.hp < me.maxHp * 0.4);
    if (me.item === 'mine') return tail;
    return false;
  }
}

const tgt0 = d => d.target && d.target.alive;
