import { SaveManager } from './SaveManager';

type SoundName =
  | 'select'
  | 'step'
  | 'jump'
  | 'land'
  | 'collect'
  | 'scroll'
  | 'hurt'
  | 'checkpoint'
  | 'reveal'
  | 'complete';

const sounds: Record<SoundName, { notes: number[]; duration: number; type: OscillatorType }> = {
  select: { notes: [440, 560], duration: 0.08, type: 'sine' },
  step: { notes: [92], duration: 0.055, type: 'sine' },
  jump: { notes: [260, 390], duration: 0.12, type: 'triangle' },
  land: { notes: [110], duration: 0.08, type: 'sine' },
  collect: { notes: [660, 880], duration: 0.13, type: 'sine' },
  scroll: { notes: [440, 554, 659], duration: 0.28, type: 'triangle' },
  hurt: { notes: [180, 125], duration: 0.2, type: 'sawtooth' },
  checkpoint: { notes: [330, 440, 660], duration: 0.35, type: 'sine' },
  reveal: { notes: [294, 392, 494], duration: 0.42, type: 'sine' },
  complete: { notes: [392, 523, 659, 784], duration: 0.5, type: 'triangle' },
};

export class AudioManager {
  private static context?: AudioContext;
  private static enabled = SaveManager.load().soundOn;
  private static ambienceRequested = false;
  private static ambienceSource?: AudioBufferSourceNode;
  private static ambienceGain?: GainNode;
  private static ambienceSecondaryGain?: GainNode;
  private static ambienceLfo?: OscillatorNode;
  private static musicBus?: GainNode;
  private static musicTimer?: number;
  private static musicStep = 0;
  private static outputGain?: GainNode;
  private static compressor?: DynamicsCompressorNode;
  private static noiseBuffer?: AudioBuffer;
  private static journeyProgress = 0;

  static unlock(): void {
    if (!this.context) {
      this.context = new AudioContext();
      this.prepareOutput(this.context);
    }
    const startRequestedAudio = (): void => {
      if (!this.ambienceRequested) return;
      this.startAmbience();
      this.startScore();
    };
    if (this.context.state === 'suspended') {
      void this.context.resume().then(startRequestedAudio).catch(() => undefined);
    } else {
      startRequestedAudio();
    }
  }

  static isEnabled(): boolean {
    return this.enabled;
  }

  static toggle(): boolean {
    this.enabled = !this.enabled;
    SaveManager.update({ soundOn: this.enabled });
    if (this.enabled) {
      this.unlock();
      this.play('select');
    } else {
      this.stopAmbience();
    }
    return this.enabled;
  }

  static setAmbience(enabled: boolean): void {
    this.ambienceRequested = enabled;
    if (!enabled) {
      this.stopAmbience();
      return;
    }
    if (this.enabled) this.unlock();
  }

  static setJourneyProgress(progress: number): void {
    const next = Math.max(0, Math.min(1, progress));
    if (Math.abs(next - this.journeyProgress) < 0.015) return;
    this.journeyProgress = next;
    const ctx = this.context;
    if (!ctx || !this.ambienceGain || !this.ambienceSecondaryGain) return;
    const now = ctx.currentTime;
    const shoreBlend = Math.max(0, Math.min(1, (next - 0.58) / 0.34));
    this.ambienceGain.gain.setTargetAtTime(0.014 - shoreBlend * 0.004, now, 0.65);
    this.ambienceSecondaryGain.gain.setTargetAtTime(0.006 + shoreBlend * 0.015, now, 0.65);
  }

  private static startAmbience(): void {
    const ctx = this.context;
    if (!ctx || this.ambienceSource || !this.enabled || !this.ambienceRequested) return;

    const duration = 6;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let smoothed = 0;
    for (let index = 0; index < data.length; index += 1) {
      smoothed = smoothed * 0.985 + (Math.random() * 2 - 1) * 0.015;
      data[index] = smoothed;
    }

    const source = ctx.createBufferSource();
    const windFilter = ctx.createBiquadFilter();
    const windGain = ctx.createGain();
    const waterFilter = ctx.createBiquadFilter();
    const waterGain = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    source.buffer = buffer;
    source.loop = true;
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 680;
    windFilter.Q.value = 0.35;
    const shoreBlend = Math.max(0, Math.min(1, (this.journeyProgress - 0.58) / 0.34));
    windGain.gain.value = 0.014 - shoreBlend * 0.004;
    waterFilter.type = 'bandpass';
    waterFilter.frequency.value = 185;
    waterFilter.Q.value = 0.48;
    waterGain.gain.value = 0.006 + shoreBlend * 0.015;
    lfo.type = 'sine';
    lfo.frequency.value = 0.11;
    lfoGain.gain.value = 0.0035;
    source.connect(windFilter).connect(windGain).connect(this.getOutput(ctx));
    source.connect(waterFilter).connect(waterGain).connect(this.getOutput(ctx));
    lfo.connect(lfoGain).connect(windGain.gain);
    source.start();
    lfo.start();
    this.ambienceSource = source;
    this.ambienceGain = windGain;
    this.ambienceSecondaryGain = waterGain;
    this.ambienceLfo = lfo;
  }

  private static stopAmbience(): void {
    if (this.ambienceGain && this.context) {
      const now = this.context.currentTime;
      this.ambienceGain.gain.cancelScheduledValues(now);
      this.ambienceGain.gain.setValueAtTime(Math.max(0.0001, this.ambienceGain.gain.value), now);
      this.ambienceGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      if (this.ambienceSecondaryGain) {
        this.ambienceSecondaryGain.gain.cancelScheduledValues(now);
        this.ambienceSecondaryGain.gain.setValueAtTime(
          Math.max(0.0001, this.ambienceSecondaryGain.gain.value),
          now,
        );
        this.ambienceSecondaryGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      }
    }
    const source = this.ambienceSource;
    if (source && this.context) source.stop(this.context.currentTime + 0.2);
    if (this.ambienceLfo && this.context) this.ambienceLfo.stop(this.context.currentTime + 0.2);
    if (this.musicTimer !== undefined) window.clearInterval(this.musicTimer);
    if (this.musicBus && this.context) {
      const now = this.context.currentTime;
      this.musicBus.gain.cancelScheduledValues(now);
      this.musicBus.gain.setValueAtTime(Math.max(0.0001, this.musicBus.gain.value), now);
      this.musicBus.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    }
    this.ambienceSource = undefined;
    this.ambienceGain = undefined;
    this.ambienceSecondaryGain = undefined;
    this.ambienceLfo = undefined;
    this.musicBus = undefined;
    this.musicTimer = undefined;
    this.musicStep = 0;
  }

  private static startScore(): void {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || this.musicTimer !== undefined || !this.enabled) return;
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, ctx.currentTime);
    bus.gain.exponentialRampToValueAtTime(0.72, ctx.currentTime + 1.8);
    bus.connect(this.getOutput(ctx));
    this.musicBus = bus;
    this.scheduleJourneyPhrase();
    this.musicTimer = window.setInterval(() => this.scheduleJourneyPhrase(), 3400);
  }

  private static scheduleJourneyPhrase(): void {
    const ctx = this.context;
    const bus = this.musicBus;
    if (!ctx || !bus || ctx.state !== 'running' || !this.enabled || !this.ambienceRequested) return;
    const inlandChords = [
      [220, 277.18, 329.63],
      [196, 246.94, 329.63],
      [174.61, 220, 293.66],
      [196, 261.63, 329.63],
    ];
    const shoreChords = [
      [220, 293.66, 392],
      [246.94, 329.63, 440],
      [196, 293.66, 392],
      [220, 329.63, 440],
    ];
    const chords = this.journeyProgress > 0.68 ? shoreChords : inlandChords;
    const chord = chords[this.musicStep % chords.length];
    this.musicStep += 1;
    const now = ctx.currentTime + 0.04;

    chord.forEach((frequency, index) => {
      const start = now + index * 0.46;
      const oscillator = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      oscillator.type = index === 0 ? 'sine' : 'triangle';
      oscillator.frequency.value = frequency;
      oscillator.detune.value = index === 1 ? -3 : index === 2 ? 4 : 0;
      filter.type = 'lowpass';
      filter.frequency.value = 920;
      filter.Q.value = 0.3;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(index === 0 ? 0.008 : 0.006, start + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 2.5);
      oscillator.connect(filter).connect(gain).connect(bus);
      oscillator.start(start);
      oscillator.stop(start + 2.6);
    });
  }

  static play(name: SoundName): void {
    if (!this.enabled) return;
    this.unlock();
    const ctx = this.context;
    if (!ctx) return;

    const sound = sounds[name];
    const now = ctx.currentTime;
    if (name === 'step' || name === 'land' || name === 'hurt') {
      this.playTransient(ctx, name, now);
    }
    sound.notes.forEach((frequency, index) => {
      const start = now + index * Math.min(sound.duration * 0.32, 0.09);
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = sound.type;
      oscillator.frequency.setValueAtTime(frequency, start);
      if (name === 'hurt') oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.72, start + sound.duration);
      if (name === 'collect') oscillator.detune.setValueAtTime(index === 0 ? -4 : 5, start);
      gain.gain.setValueAtTime(0.0001, start);
      const peak = name === 'hurt' ? 0.038 : name === 'step' || name === 'land' ? 0.024 : 0.058;
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + sound.duration);
      oscillator.connect(gain).connect(this.getOutput(ctx));
      oscillator.start(start);
      oscillator.stop(start + sound.duration + 0.03);
    });
  }

  private static prepareOutput(ctx: AudioContext): void {
    if (this.outputGain && this.compressor) return;
    const output = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();
    output.gain.value = 0.78;
    compressor.threshold.value = -22;
    compressor.knee.value = 24;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.2;
    output.connect(compressor).connect(ctx.destination);
    this.outputGain = output;
    this.compressor = compressor;
  }

  private static getOutput(ctx: AudioContext): GainNode {
    this.prepareOutput(ctx);
    return this.outputGain!;
  }

  private static playTransient(
    ctx: AudioContext,
    name: 'step' | 'land' | 'hurt',
    start: number,
  ): void {
    if (!this.noiseBuffer) {
      const length = Math.floor(ctx.sampleRate * 0.18);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const channel = buffer.getChannelData(0);
      for (let index = 0; index < length; index += 1) channel[index] = Math.random() * 2 - 1;
      this.noiseBuffer = buffer;
    }

    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const duration = name === 'land' ? 0.12 : name === 'hurt' ? 0.16 : 0.07;
    source.buffer = this.noiseBuffer;
    source.playbackRate.value = name === 'step' ? 0.82 + Math.random() * 0.18 : 1;
    filter.type = name === 'hurt' ? 'bandpass' : 'lowpass';
    filter.frequency.value = name === 'step' ? 390 : name === 'land' ? 520 : 760;
    filter.Q.value = name === 'hurt' ? 0.8 : 0.45;
    gain.gain.setValueAtTime(name === 'land' ? 0.028 : 0.018, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter).connect(gain).connect(this.getOutput(ctx));
    source.start(start);
    source.stop(start + duration + 0.02);
  }
}
