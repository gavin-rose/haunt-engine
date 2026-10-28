type Surface = "wood" | "stone" | "tile" | "dirt";

export class HauntAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private dry!: GainNode;
  private wet!: GainNode;
  private droneFilter!: BiquadFilterNode;
  private heartGain!: GainNode;
  private noise!: AudioBuffer;
  private nextBeat = 0;
  private tension = 0;
  muted = false;

  /** must be called from a user gesture (click or key) the first time */
  start() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(ctx.destination);

    this.dry = ctx.createGain();
    this.dry.connect(this.master);
    const reverb = ctx.createConvolver();
    reverb.buffer = this.impulse(3.2);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.55;
    this.wet.connect(reverb).connect(this.master);

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.startAmbience();
    this.heartGain = ctx.createGain();
    this.heartGain.gain.value = 0;
    this.heartGain.connect(this.dry);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.1);
  }

  stop() {
    void this.ctx?.close();
    this.ctx = null;
  }

  /** 0 = calm, 1 = something is right behind you */
  update(tension: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    this.tension += (tension - this.tension) * 0.08;
    const t = ctx.currentTime;
    this.droneFilter.frequency.setTargetAtTime(180 + this.tension * 520, t, 0.3);
    this.heartGain.gain.setTargetAtTime(this.tension > 0.05 ? 0.25 + this.tension * 0.75 : 0, t, 0.2);
    if (this.tension > 0.05 && t >= this.nextBeat - 0.05) {
      const at = Math.max(t, this.nextBeat);
      this.thump(at, 1);
      this.thump(at + 0.16, 0.6);
      this.nextBeat = at + 60 / (62 + this.tension * 80);
    }
  }

  step(surface: Surface) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const freq = { wood: 700, stone: 1500, tile: 2200, dirt: 450 }[surface] * (0.85 + Math.random() * 0.3);
    const src = this.noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freq;
    f.Q.value = 1.2;
    const g = this.env(t, 0.002, 0.07, surface === "tile" ? 0.18 : 0.14);
    src.connect(f).connect(g);
    g.connect(this.dry);
    src.start(t, Math.random());
    src.stop(t + 0.12);
  }

  pickup() {
    this.bell([880, 1320, 1980], 0.12, 2.2);
  }

  win() {
    [0, 0.25, 0.5].forEach((d, i) => setTimeout(() => this.bell([523 * (1 + i * 0.25), 784 * (1 + i * 0.25)], 0.1, 3), d * 1000));
  }

  door() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(70, t);
    o.frequency.linearRampToValueAtTime(110 + Math.random() * 40, t + 0.25);
    o.frequency.linearRampToValueAtTime(80, t + 0.6);
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 900;
    f.Q.value = 9;
    const g = this.env(t, 0.05, 0.6, 0.06);
    o.connect(f).connect(g);
    g.connect(this.dry);
    g.connect(this.wet);
    o.start(t);
    o.stop(t + 0.75);
  }

  unlock() {
    const ctx = this.ctx;
    if (!ctx) return;
    [0, 0.09].forEach((d) => {
      const t = ctx.currentTime + d;
      const src = this.noiseSource();
      const f = ctx.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = 3000;
      const g = this.env(t, 0.001, 0.04, 0.3);
      src.connect(f).connect(g);
      g.connect(this.dry);
      src.start(t);
      src.stop(t + 0.06);
    });
  }

  whisper() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = this.noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 8;
    for (let i = 0; i < 8; i++) f.frequency.setValueAtTime(900 + Math.random() * 2200, t + i * 0.18);
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(Math.random() * 2 - 1, t);
    pan.pan.linearRampToValueAtTime(Math.random() * 2 - 1, t + 1.5);
    const g = this.env(t, 0.3, 1.6, 0.35);
    src.connect(f).connect(g).connect(pan);
    pan.connect(this.wet);
    pan.connect(this.dry);
    src.start(t, Math.random());
    src.stop(t + 2);
  }

  sting() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + 0.4);
    f.frequency.exponentialRampToValueAtTime(400, t + 2.5);
    const g = this.env(t, 0.08, 2.6, 0.12);
    f.connect(g);
    g.connect(this.dry);
    g.connect(this.wet);
    for (const freq of [110, 116.5, 155.6, 233]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = freq;
      o.connect(f);
      o.start(t);
      o.stop(t + 2.8);
    }
  }

  lightsOut() {
    this.thump(this.ctx?.currentTime ?? 0, 1.6);
    this.sting();
  }

  death() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 2.5);
    const g = this.env(t, 0.01, 2.8, 0.3);
    o.connect(g);
    g.connect(this.dry);
    g.connect(this.wet);
    o.start(t);
    o.stop(t + 3);
    this.sting();
  }

  private startAmbience() {
    const ctx = this.ctx!;
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = "lowpass";
    this.droneFilter.frequency.value = 180;
    const drone = ctx.createGain();
    drone.gain.value = 0.07;
    this.droneFilter.connect(drone);
    drone.connect(this.dry);
    drone.connect(this.wet);
    for (const [freq, type] of [
      [55, "sine"],
      [55.4, "triangle"],
      [82.6, "sine"],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.connect(this.droneFilter);
      o.start();
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const depth = ctx.createGain();
    depth.gain.value = 0.03;
    lfo.connect(depth).connect(drone.gain);
    lfo.start();

    const wind = this.noiseSource(true);
    const wf = ctx.createBiquadFilter();
    wf.type = "bandpass";
    wf.Q.value = 3;
    wf.frequency.value = 500;
    const wlfo = ctx.createOscillator();
    wlfo.frequency.value = 0.05;
    const wdepth = ctx.createGain();
    wdepth.gain.value = 300;
    wlfo.connect(wdepth).connect(wf.frequency);
    const wg = ctx.createGain();
    wg.gain.value = 0.035;
    wind.connect(wf).connect(wg);
    wg.connect(this.wet);
    wind.start();
    wlfo.start();
  }

  private thump(at: number, strength: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(70, at);
    o.frequency.exponentialRampToValueAtTime(38, at + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.5 * strength, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.25);
    o.connect(g).connect(strength > 1 ? this.dry : this.heartGain);
    o.start(at);
    o.stop(at + 0.3);
  }

  private bell(freqs: number[], level: number, decay: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const freq of freqs) {
      const o = ctx.createOscillator();
      o.frequency.value = freq * (1 + (Math.random() - 0.5) * 0.004);
      const g = this.env(t, 0.005, decay, level);
      o.connect(g);
      g.connect(this.dry);
      g.connect(this.wet);
      o.start(t);
      o.stop(t + decay + 0.1);
    }
  }

  private env(t: number, attack: number, decay: number, level: number) {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(level, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  private noiseSource(loop = false) {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = loop;
    return src;
  }

  private impulse(seconds: number) {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.5;
    }
    return buf;
  }
}

export function surfaceFor(floor: string | undefined): Surface {
  if (!floor) return "wood";
  if (floor === "tile") return "tile";
  if (floor === "dirt") return "dirt";
  if (floor.includes("stone")) return "stone";
  return "wood";
}
