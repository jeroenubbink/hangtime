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
}
