/**
 * All sounds are synthesised at runtime with the Web Audio API (no audio files),
 * so there are no third-party assets to license.
 */
export type SoundKind = 'paddle' | 'table' | 'net' | 'floor' | 'edge';

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private volume = 0.8;

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      this.master.connect(comp).connect(this.ctx.destination);
      const len = Math.floor(this.ctx.sampleRate * 1.5);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  /** pan: -1 (left) .. 1 (right); near: 0 (far end) .. 1 (close to the listener). */
  play(kind: SoundKind, intensity: number, pan = 0, near = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise || this.volume <= 0) return;
    const t = ctx.currentTime + 0.005;
    const out = ctx.createStereoPanner();
    out.pan.value = Math.max(-1, Math.min(1, pan));
    const g = ctx.createGain();
    const loud = Math.min(1, 0.25 + intensity) * (0.45 + 0.55 * near);
    out.connect(this.master);
    g.connect(out);

    const click = (freq: number, q: number, dur: number, level: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq;
      bp.Q.value = q;
      const e = ctx.createGain();
      e.gain.setValueAtTime(level, t);
      e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(bp).connect(e).connect(g);
      src.start(t, Math.random() * 1.2, dur + 0.02);
    };
    const tone = (freq: number, dur: number, level: number, type: OscillatorType = 'sine', drop = 0.85) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      o.frequency.exponentialRampToValueAtTime(freq * drop, t + dur);
      const e = ctx.createGain();
      e.gain.setValueAtTime(level, t);
      e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(e).connect(g);
      o.start(t);
      o.stop(t + dur + 0.02);
    };

    g.gain.value = loud;
    switch (kind) {
      case 'paddle': // hollow "pok" of rubber on wood
        click(1500 + intensity * 900, 2.2, 0.05, 0.9);
        tone(820 + intensity * 260, 0.06, 0.5, 'triangle', 0.7);
        tone(240, 0.05, 0.25 + intensity * 0.3, 'sine', 0.6);
        break;
      case 'table': // bright "tock" with the table body thump
        click(2600, 4, 0.035, 0.8);
        tone(1900, 0.03, 0.25, 'sine', 0.9);
        tone(170, 0.09, 0.45, 'sine', 0.7);
        break;
      case 'edge':
        click(3200, 6, 0.025, 0.7);
        tone(140, 0.07, 0.3);
        break;
      case 'net': // soft rustle of the mesh
        click(900, 0.8, 0.12, 0.5);
        click(2400, 1.5, 0.06, 0.25);
        break;
      case 'floor': // duller and lower on the hall floor
        click(1100, 3, 0.04, 0.6);
        tone(320, 0.05, 0.3, 'triangle', 0.6);
        break;
    }
  }

  beep(high: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const e = ctx.createGain();
    o.type = 'square';
    o.frequency.value = high ? 1046 : 660;
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
    e.gain.exponentialRampToValueAtTime(0.0001, t + (high ? 0.35 : 0.15));
    o.connect(e).connect(this.master);
    o.start(t);
    o.stop(t + 0.4);
  }

  /** Short chime: rising for a point won, falling for a point lost. */
  chime(won: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const notes = won ? [660, 880, 1320] : [520, 390];
    notes.forEach((f, i) => {
      const t = ctx.currentTime + i * 0.09;
      const o = ctx.createOscillator();
      const e = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      e.gain.setValueAtTime(0.0001, t);
      e.gain.exponentialRampToValueAtTime(0.14, t + 0.02);
      e.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(e).connect(this.master!);
      o.start(t);
      o.stop(t + 0.35);
    });
  }

  /** Crowd applause: many short filtered noise claps. */
  applause(seconds = 2.2): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const g = ctx.createGain();
    g.gain.value = 0.35;
    g.connect(this.master);
    const n = Math.floor(seconds * 45);
    for (let i = 0; i < n; i++) {
      const t = ctx.currentTime + Math.random() * seconds;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900 + Math.random() * 1600;
      bp.Q.value = 1.2;
      const e = ctx.createGain();
      const fade = 1 - (t - ctx.currentTime) / seconds;
      e.gain.setValueAtTime(0.5 * fade + 0.05, t);
      e.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      const p = ctx.createStereoPanner();
      p.pan.value = Math.random() * 2 - 1;
      src.connect(bp).connect(e).connect(p).connect(g);
      src.start(t, Math.random(), 0.07);
    }
  }
}

export const sound = new SoundEngine();
