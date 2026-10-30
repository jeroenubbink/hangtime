// Synthesised engine, tyre squeal and impact sounds (WebAudio, no samples).
export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.Q.value = 3;
    this.engineFilter.connect(this.engineGain).connect(this.master);
    this.osc = [['sawtooth', 1, 0.5], ['square', 0.5, 0.3], ['sawtooth', 2.01, 0.15]].map(([type, mul, vol]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      g.gain.value = vol;
      o.connect(g).connect(this.engineFilter);
      o.start();
      return { o, mul };
    });

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    const skid = ctx.createBufferSource();
    skid.buffer = this.noise;
    skid.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1300;
    bp.Q.value = 6;
    this.skidGain = ctx.createGain();
    this.skidGain.gain.value = 0;
    skid.connect(bp).connect(this.skidGain).connect(this.master);
    skid.start();

    // Nitro: a low roar of filtered noise
    const roar = ctx.createBufferSource();
    roar.buffer = this.noise;
    roar.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    this.boostGain = ctx.createGain();
    this.boostGain.gain.value = 0;
    roar.connect(lp).connect(this.boostGain).connect(this.master);
    roar.start();

    // The rival's engine: thinner, and faded by distance
    this.rivalOsc = ctx.createOscillator();
    this.rivalOsc.type = 'sawtooth';
    this.rivalFilter = ctx.createBiquadFilter();
    this.rivalFilter.type = 'lowpass';
    this.rivalFilter.frequency.value = 900;
    this.rivalGain = ctx.createGain();
    this.rivalGain.gain.value = 0;
    this.rivalOsc.connect(this.rivalFilter).connect(this.rivalGain).connect(this.master);
    this.rivalOsc.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  engine(rpm, load, on = true) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = rpm / 60 * 2;
    for (const { o, mul } of this.osc) o.frequency.setTargetAtTime(f * mul, t, 0.03);
    this.engineFilter.frequency.setTargetAtTime(300 + rpm * 0.25 + load * 900, t, 0.05);
    this.engineGain.gain.setTargetAtTime(on ? 0.16 + load * 0.14 : 0, t, 0.08);
  }

  rival(rpm, vol) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.rivalOsc.frequency.setTargetAtTime(rpm / 60 * 2 * 1.06, t, 0.05);
    this.rivalGain.gain.setTargetAtTime(Math.min(0.12, vol * 0.12), t, 0.1);
  }

  boost(level) {
    if (!this.ctx) return;
    this.boostGain.gain.setTargetAtTime(level * 0.35, this.ctx.currentTime, level ? 0.03 : 0.15);
  }

  skid(amount) {
    if (!this.ctx) return;
    this.skidGain.gain.setTargetAtTime(Math.min(0.25, amount * 0.25), this.ctx.currentTime, 0.05);
  }

  burst(duration, freq, vol) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(freq, t);
    lp.frequency.exponentialRampToValueAtTime(80, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + duration);
  }

  pop() { this.burst(0.09, 1800, 0.5); }
  crash() { this.burst(1.6, 2500, 1.2); }
  splash() { this.burst(1.2, 5000, 0.7); }
  thud(v) { this.burst(0.25, 400, Math.min(0.8, v * 0.08)); }

  beep(high) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = high ? 880 : 440;
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (high ? 0.6 : 0.25));
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.7);
  }

  // Rising chime for a landed stunt; more notes for a bigger combo.
  stunt(mult) {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const notes = [659, 784, 988, 1175, 1319].slice(0, 1 + Math.min(4, mult));
    notes.forEach((f, i) => {
      const t = t0 + i * 0.07;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 0.32);
    });
  }

  // ---------- Derby ----------
  // Metal crunch: a thump, torn-metal noise and a few clanging inharmonic partials. `v` is 0..1.
  crunch(v) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    v = Math.min(1, v);
    this.burst(0.18 + v * 0.3, 300 + v * 500, 0.4 + v * 0.6);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500 + Math.random() * 1500;
    bp.Q.value = 1.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5 * v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15 + v * 0.35);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + 0.6);
    const base = 180 + Math.random() * 160;
    for (const m of [1, 2.76, 5.4]) {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = base * m;
      og.gain.setValueAtTime(0.06 * v / m, t);
      og.gain.exponentialRampToValueAtTime(0.0005, t + 0.25 + v * 0.4);
      o.connect(og).connect(this.master);
      o.start(t);
      o.stop(t + 0.8);
    }
  }

  // Glass: a scatter of short high clicks
  glass() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    for (let i = 0; i < 6; i++) {
      const t = ctx.currentTime + Math.random() * 0.25;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 3000 + Math.random() * 4000;
      g.gain.setValueAtTime(0.05, t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.08);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 0.1);
    }
  }

  // Explosion: a long low boom
  boom(v = 1) { this.burst(1.8, 900, 1.1 * v); this.burst(0.5, 3000, 0.4 * v); }

  // Crowd: a constant murmur that swells into a roar on big moments
  crowd(level) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (!this.crowdGain) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 700;
      bp.Q.value = 0.7;
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 0.3;
      lg.gain.value = 120;
      lfo.connect(lg).connect(bp.frequency);
      lfo.start();
      this.crowdGain = ctx.createGain();
      this.crowdGain.gain.value = 0;
      src.connect(bp).connect(this.crowdGain).connect(this.master);
      src.start();
    }
    this.crowdGain.gain.setTargetAtTime(level * 0.12, ctx.currentTime, 0.4);
  }
  cheer(v = 1) {
    if (!this.ctx) return;
    this.crowd(1);
    this.crowdGain.gain.setTargetAtTime(0.12 + 0.35 * v, this.ctx.currentTime, 0.08);
    setTimeout(() => this.crowd(this.crowdBase ?? 0.6), 900);
  }

  // Pickup: a quick rising arpeggio
  pickup() {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => {
      const t = t0 + i * 0.05, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 0.14);
    });
  }

  // Opponents' engines: a few voices, given to whichever cars are closest
  voices(list) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (!this.voicePool) {
      this.voicePool = [0, 1, 2].map(() => {
        const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        o.type = 'sawtooth';
        f.type = 'lowpass';
        f.frequency.value = 800;
        g.gain.value = 0;
        o.connect(f).connect(g).connect(this.master);
        o.start();
        return { o, f, g };
      });
    }
    this.voicePool.forEach((v, i) => {
      const it = list[i];
      if (!it) { v.g.gain.setTargetAtTime(0, t, 0.1); return; }
      v.o.frequency.setTargetAtTime(it.rpm / 60 * 2 * it.tone, t, 0.05);
      v.f.frequency.setTargetAtTime(400 + it.rpm * 0.15, t, 0.05);
      v.g.gain.setTargetAtTime(Math.min(0.09, it.vol * 0.09), t, 0.1);
    });
  }
}
