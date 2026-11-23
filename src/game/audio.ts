import { SoundMaterial } from './types';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  public muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      const sr = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, sr, sr);
      const data = buf.getChannelData(0);
      for (let i = 0; i < sr; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buf;
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playFilteredNoise(
    filterType: BiquadFilterType,
    freq: number,
    q: number,
    duration: number,
    gainPeak: number,
    pitchSlide = 1,
  ) {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;

    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freq, now);
    if (pitchSlide !== 1) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(60, freq * pitchSlide), now + duration);
    }
    filter.Q.value = q;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    src.start(now, Math.random() * 0.5, duration);
    src.stop(now + duration);
  }

  private playTone(
    type: OscillatorType,
    startFreq: number,
    endFreq: number,
    duration: number,
    gainPeak: number,
  ) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), now + duration);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  playStep(mat: SoundMaterial) {
    const jitter = 0.88 + Math.random() * 0.24;
    switch (mat) {
      case 'grass':
      case 'leaves':
        this.playFilteredNoise('bandpass', 1400 * jitter, 1.5, 0.07, 0.06);
        break;
      case 'dirt':
      case 'snow':
        this.playFilteredNoise('lowpass', 700 * jitter, 1.0, 0.07, 0.07);
        break;
      case 'sand':
        this.playFilteredNoise('highpass', 2200 * jitter, 1.2, 0.08, 0.05);
        break;
      case 'wood':
        this.playTone('triangle', 160 * jitter, 90, 0.06, 0.07);
        break;
      case 'water':
        this.playFilteredNoise('bandpass', 900 * jitter, 2.5, 0.12, 0.08, 1.5);
        break;
      case 'lava':
        this.playFilteredNoise('lowpass', 420 * jitter, 2.0, 0.14, 0.08, 0.6);
        break;
      default:
        this.playTone('square', 230 * jitter, 110, 0.045, 0.04);
        break;
    }
  }

  playDig(mat: SoundMaterial) {
    const jitter = 0.9 + Math.random() * 0.2;
    switch (mat) {
      case 'stone':
        this.playTone('triangle', 520 * jitter, 260, 0.06, 0.08);
        this.playFilteredNoise('highpass', 1800, 1.4, 0.05, 0.05);
        break;
      case 'wood':
        this.playTone('triangle', 260 * jitter, 130, 0.07, 0.1);
        break;
      default:
        this.playFilteredNoise('bandpass', 1100 * jitter, 1.2, 0.07, 0.09);
        break;
    }
  }

  playBreak(mat: SoundMaterial) {
    const jitter = 0.9 + Math.random() * 0.2;
    if (mat === 'glass') {
      this.playTone('sine', 2200 * jitter, 1200, 0.12, 0.1);
      this.playFilteredNoise('highpass', 3600, 2.0, 0.14, 0.12);
      return;
    }
    if (mat === 'stone') {
      this.playTone('sawtooth', 240 * jitter, 85, 0.11, 0.12);
      this.playFilteredNoise('bandpass', 1300, 1.0, 0.12, 0.14, 0.6);
    } else if (mat === 'wood') {
      this.playTone('triangle', 210 * jitter, 90, 0.12, 0.14);
      this.playFilteredNoise('bandpass', 850, 1.5, 0.1, 0.1);
    } else {
      this.playFilteredNoise('lowpass', 950 * jitter, 1.2, 0.12, 0.15, 0.55);
    }
  }

  playPlace(mat: SoundMaterial) {
    const jitter = 0.92 + Math.random() * 0.16;
    if (mat === 'stone' || mat === 'glass') {
      this.playTone('triangle', 340 * jitter, 190, 0.07, 0.12);
    } else if (mat === 'wood') {
      this.playTone('triangle', 210 * jitter, 120, 0.08, 0.13);
    } else {
      this.playFilteredNoise('lowpass', 720 * jitter, 1.1, 0.08, 0.12);
    }
  }

  playPickup() {
    this.playTone('sine', 740, 1280, 0.09, 0.09);
  }

  playHurt() {
    this.playTone('sawtooth', 180, 75, 0.16, 0.16);
    this.playFilteredNoise('lowpass', 600, 1.0, 0.12, 0.12);
  }

  playShieldBlock() {
    this.playTone('triangle', 420, 180, 0.12, 0.16);
    this.playFilteredNoise('bandpass', 2400, 2.0, 0.09, 0.12);
  }

  playBowShoot() {
    this.playTone('triangle', 460, 160, 0.12, 0.11);
    this.playFilteredNoise('highpass', 1600, 1.5, 0.08, 0.07);
  }

  playExplode() {
    this.playTone('sawtooth', 110, 28, 0.55, 0.25);
    this.playFilteredNoise('lowpass', 420, 0.8, 0.65, 0.3, 0.25);
  }

  playThunder() {
    this.playTone('sawtooth', 85, 32, 0.9, 0.18);
    this.playFilteredNoise('lowpass', 300, 0.7, 1.2, 0.24, 0.35);
  }

  playSplash() {
    this.playFilteredNoise('bandpass', 780, 1.8, 0.22, 0.14, 1.6);
  }

  playSizzle() {
    this.playFilteredNoise('highpass', 2600, 1.2, 0.2, 0.1);
  }

  playClick() {
    this.playTone('square', 640, 480, 0.035, 0.05);
  }

  playMob(
    kind:
      | 'pig'
      | 'sheep'
      | 'cow'
      | 'chicken'
      | 'horse'
      | 'cat'
      | 'dog'
      | 'zombie'
      | 'skeleton'
      | 'spider'
      | 'creeper_hiss'
      | 'enderman',
  ) {
    switch (kind) {
      case 'pig':
        this.playTone('sawtooth', 260, 190, 0.14, 0.06);
        break;
      case 'sheep':
        this.playTone('triangle', 380, 320, 0.22, 0.06);
        break;
      case 'cow':
        this.playTone('sawtooth', 145, 110, 0.32, 0.07);
        break;
      case 'chicken':
        this.playTone('sine', 780, 960, 0.08, 0.05);
        break;
      case 'horse':
        this.playTone('triangle', 480, 290, 0.26, 0.06);
        break;
      case 'cat':
        this.playTone('sine', 640, 820, 0.18, 0.05);
        break;
      case 'dog':
        this.playTone('triangle', 320, 460, 0.12, 0.07);
        break;
      case 'zombie':
        this.playTone('sawtooth', 120, 82, 0.3, 0.09);
        break;
      case 'skeleton':
        this.playFilteredNoise('bandpass', 2800, 4.0, 0.09, 0.08);
        break;
      case 'spider':
        this.playFilteredNoise('highpass', 2100, 2.5, 0.14, 0.08, 0.7);
        break;
      case 'creeper_hiss':
        this.playFilteredNoise('highpass', 2400, 2.5, 0.45, 0.14, 1.3);
        break;
      case 'enderman':
        this.playTone('sine', 210, 520, 0.28, 0.08);
        break;
    }
  }
}

export const soundEngine = new SoundEngine();
