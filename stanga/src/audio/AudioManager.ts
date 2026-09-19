/**
 * AudioManager — every sound is synthesised with the Web Audio API.
 * No audio files, nothing to license, nothing to download.
 *
 * The context is created lazily and only resumed after a real user gesture,
 * which is both the browser requirement and the polite thing to do.
 */
import { GameConfig } from '../config/GameConfig';
import { clamp } from '../core/math';

export type SoundName =
  | 'kick'
  | 'kickSoft'
  | 'post'
  | 'crossbar'
  | 'junction'
  | 'goal'
  | 'whistle'
  | 'tackle'
  | 'uiClick'
  | 'countdown';

export class AudioManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private masterVolume: number = GameConfig.audio.masterVolumeDefault;
  private musicVolume: number = GameConfig.audio.musicVolumeDefault;
  private vibrationEnabled = true;
  private unlocked = false;
  private musicStep = 0;

  /** Must be called from a user gesture handler. Safe to call repeatedly. */
  unlock(): void {
    if (this.unlocked) {
      void this.context?.resume();
      return;
    }
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.context = new Ctor();
      this.master = this.context.createGain();
      this.master.gain.value = this.masterVolume;
      this.master.connect(this.context.destination);

      this.musicGain = this.context.createGain();
      this.musicGain.gain.value = this.musicVolume * 0.5;
      this.musicGain.connect(this.master);

      this.unlocked = true;
      void this.context.resume();
    } catch {
      // Audio is a nice-to-have; the game stays fully playable without it.
      this.context = null;
    }
  }

  setMasterVolume(value: number): void {
    this.masterVolume = clamp(value, 0, 1);
    if (this.master) this.master.gain.value = this.masterVolume;
  }

  setMusicVolume(value: number): void {
    this.musicVolume = clamp(value, 0, 1);
    if (this.musicGain) this.musicGain.gain.value = this.musicVolume * 0.5;
    if (this.musicVolume <= 0) this.stopMusic();
  }

  setVibrationEnabled(enabled: boolean): void {
    this.vibrationEnabled = enabled;
  }

  suspend(): void {
    void this.context?.suspend();
  }

  resume(): void {
    if (this.unlocked) void this.context?.resume();
  }

  vibrate(pattern: number | readonly number[]): void {
    if (!this.vibrationEnabled) return;
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    try {
      navigator.vibrate(pattern as number | number[]);
    } catch {
      // Ignored: vibration is optional everywhere.
    }
  }

  play(sound: SoundName, intensity = 1): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master || context.state === 'suspended') return;
    const now = context.currentTime;
    const gain = clamp(intensity, 0.05, 1);

    switch (sound) {
      case 'kick':
        this.thump(now, 150, 0.09, 0.55 * gain);
        this.noise(now, 0.05, 0.28 * gain, 1800);
        break;
      case 'kickSoft':
        this.thump(now, 110, 0.07, 0.24 * gain);
        break;
      case 'post':
        this.metal(now, 420, 0.55, 0.42 * gain);
        break;
      case 'crossbar':
        this.metal(now, 310, 0.7, 0.46 * gain);
        break;
      case 'junction':
        this.metal(now, 520, 0.85, 0.5 * gain);
        this.metal(now + 0.04, 780, 0.6, 0.3 * gain);
        break;
      case 'goal':
        this.crowd(now, 1.5, 0.5 * gain);
        this.chime(now, [523.25, 659.25, 783.99], 0.42 * gain);
        break;
      case 'whistle':
        this.whistle(now, 0.45, 0.4 * gain);
        break;
      case 'tackle':
        this.noise(now, 0.12, 0.3 * gain, 900);
        break;
      case 'uiClick':
        this.chime(now, [880], 0.18 * gain);
        break;
      case 'countdown':
        this.chime(now, [440], 0.25 * gain);
        break;
    }
  }

  /** A quiet, looping two-bar street groove. Started only when music volume > 0. */
  startMusic(): void {
    if (!this.context || !this.musicGain || this.musicVolume <= 0) return;
    if (this.musicTimer !== null) return;
    const bpm = 96;
    const interval = (60 / bpm) * 500;
    this.musicStep = 0;
    this.musicTimer = window.setInterval(() => this.musicTick(), interval);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  dispose(): void {
    this.stopMusic();
    void this.context?.close();
    this.context = null;
    this.master = null;
    this.musicGain = null;
    this.unlocked = false;
  }

  // ── Synthesis primitives ────────────────────────────────────────────────────

  private musicTick(): void {
    const context = this.context;
    const target = this.musicGain;
    if (!context || !target || context.state !== 'running') return;
    const now = context.currentTime;
    const bassline = [55, 55, 73.42, 65.41, 55, 55, 82.41, 73.42];
    const note = bassline[this.musicStep % bassline.length] ?? 55;

    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'triangle';
    osc.frequency.value = note;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.35, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    osc.connect(gain).connect(target);
    osc.start(now);
    osc.stop(now + 0.32);

    if (this.musicStep % 2 === 1) {
      const hat = context.createBufferSource();
      hat.buffer = this.noiseBuffer(0.05);
      const hatGain = context.createGain();
      hatGain.gain.setValueAtTime(0.09, now);
      hatGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
      const filter = context.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 6000;
      hat.connect(filter).connect(hatGain).connect(target);
      hat.start(now);
    }

    this.musicStep += 1;
  }

  private thump(when: number, frequency: number, duration: number, volume: number): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, when);
    osc.frequency.exponentialRampToValueAtTime(frequency * 0.35, when + duration);
    gain.gain.setValueAtTime(volume, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(gain).connect(master);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  }

  private metal(when: number, frequency: number, duration: number, volume: number): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    // Two detuned partials plus a short noise transient reads as struck metal.
    for (const [ratio, level] of [
      [1, 1],
      [2.76, 0.5],
      [5.4, 0.22],
    ] as const) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency * ratio;
      gain.gain.setValueAtTime(volume * level, when);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
      osc.connect(gain).connect(master);
      osc.start(when);
      osc.stop(when + duration + 0.02);
    }
    this.noise(when, 0.04, volume * 0.35, 4200);
  }

  private noise(when: number, duration: number, volume: number, cutoff: number): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer(duration);
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = cutoff;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(when);
  }

  private crowd(when: number, duration: number, volume: number): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer(duration);
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 700;
    filter.Q.value = 0.6;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(volume, when + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(when);
  }

  private chime(when: number, frequencies: readonly number[], volume: number): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    frequencies.forEach((frequency, index) => {
      const start = when + index * 0.07;
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = 'triangle';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);
      osc.connect(gain).connect(master);
      osc.start(start);
      osc.stop(start + 0.45);
    });
  }

  private whistle(when: number, duration: number, volume: number): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(2100, when);
    osc.frequency.linearRampToValueAtTime(2450, when + duration * 0.5);
    osc.frequency.linearRampToValueAtTime(2050, when + duration);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(volume, when + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2200;
    osc.connect(filter).connect(gain).connect(master);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  }

  private noiseBuffer(duration: number): AudioBuffer {
    const context = this.context;
    if (!context) throw new Error('audio context missing');
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }
}
