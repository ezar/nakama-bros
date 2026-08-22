import type { SfxName } from '../types'

export interface SfxVoice {
  type: OscillatorType | 'noise'
  freq: number
  freqEnd?: number
  sweep?: 'linear' | 'exp'
  dur: number
  gain: number
  attack?: number
  delay?: number
  vibrato?: { rate: number; depth: number }
  filter?: { type: BiquadFilterType; freq: number; freqEnd?: number; q?: number }
}

export interface SfxRecipe {
  gain: number
  voices: SfxVoice[]
}

const r = (gain: number, voices: SfxVoice[]): SfxRecipe => ({ gain, voices })

/**
 * Sound design, as data.
 *
 * Each entry is a small stack of oscillator/noise voices with envelopes. The
 * shapes borrow from classic platformer sound design: rising squares for jumps,
 * short noise bursts for impacts, arpeggios for rewards.
 */
export const SFX_RECIPES: Record<SfxName, SfxRecipe> = {
  jump: r(0.5, [
    { type: 'square', freq: 300, freqEnd: 720, sweep: 'exp', dur: 0.15, gain: 0.5 },
    { type: 'triangle', freq: 150, freqEnd: 360, sweep: 'exp', dur: 0.13, gain: 0.3 },
  ]),
  'double-jump': r(0.5, [
    { type: 'square', freq: 440, freqEnd: 980, sweep: 'exp', dur: 0.16, gain: 0.45 },
    { type: 'sine', freq: 880, freqEnd: 1400, sweep: 'exp', dur: 0.12, gain: 0.2, delay: 0.02 },
  ]),
  land: r(0.42, [
    { type: 'noise', freq: 0, dur: 0.08, gain: 0.4, filter: { type: 'lowpass', freq: 1400, freqEnd: 300 } },
    { type: 'sine', freq: 150, freqEnd: 70, sweep: 'exp', dur: 0.1, gain: 0.35 },
  ]),
  skid: r(0.3, [
    { type: 'noise', freq: 0, dur: 0.16, gain: 0.3, filter: { type: 'bandpass', freq: 2600, freqEnd: 1200, q: 2 } },
  ]),
  stomp: r(0.55, [
    { type: 'square', freq: 520, freqEnd: 130, sweep: 'exp', dur: 0.12, gain: 0.45 },
    { type: 'noise', freq: 0, dur: 0.09, gain: 0.4, filter: { type: 'lowpass', freq: 2600, freqEnd: 500 } },
  ]),
  hurt: r(0.55, [
    { type: 'sawtooth', freq: 420, freqEnd: 90, sweep: 'exp', dur: 0.32, gain: 0.45 },
    { type: 'square', freq: 210, freqEnd: 60, sweep: 'exp', dur: 0.28, gain: 0.25, delay: 0.02 },
  ]),
  death: r(0.6, [
    { type: 'square', freq: 660, freqEnd: 220, sweep: 'exp', dur: 0.2, gain: 0.4 },
    { type: 'square', freq: 220, freqEnd: 880, sweep: 'exp', dur: 0.5, gain: 0.35, delay: 0.2 },
    { type: 'square', freq: 880, freqEnd: 60, sweep: 'exp', dur: 0.7, gain: 0.35, delay: 0.62 },
  ]),
  coin: r(0.42, [
    { type: 'square', freq: 1046, dur: 0.05, gain: 0.4 },
    { type: 'square', freq: 1568, dur: 0.16, gain: 0.4, delay: 0.05 },
  ]),
  powerup: r(0.5, [
    { type: 'square', freq: 392, dur: 0.07, gain: 0.35 },
    { type: 'square', freq: 523, dur: 0.07, gain: 0.35, delay: 0.07 },
    { type: 'square', freq: 659, dur: 0.07, gain: 0.35, delay: 0.14 },
    { type: 'square', freq: 784, dur: 0.07, gain: 0.35, delay: 0.21 },
    { type: 'square', freq: 1046, dur: 0.22, gain: 0.4, delay: 0.28 },
  ]),
  powerdown: r(0.5, [
    { type: 'square', freq: 784, dur: 0.08, gain: 0.35 },
    { type: 'square', freq: 587, dur: 0.08, gain: 0.35, delay: 0.08 },
    { type: 'square', freq: 392, dur: 0.24, gain: 0.35, delay: 0.16 },
  ]),
  break: r(0.5, [
    { type: 'noise', freq: 0, dur: 0.22, gain: 0.5, filter: { type: 'highpass', freq: 800, freqEnd: 2600 } },
    { type: 'square', freq: 180, freqEnd: 60, sweep: 'exp', dur: 0.14, gain: 0.3 },
  ]),
  bump: r(0.4, [
    { type: 'square', freq: 180, freqEnd: 110, sweep: 'exp', dur: 0.08, gain: 0.4 },
  ]),
  kick: r(0.5, [
    { type: 'noise', freq: 0, dur: 0.1, gain: 0.35, filter: { type: 'bandpass', freq: 1800, q: 1.4 } },
    { type: 'triangle', freq: 320, freqEnd: 120, sweep: 'exp', dur: 0.12, gain: 0.35 },
  ]),
  punch: r(0.55, [
    { type: 'noise', freq: 0, dur: 0.09, gain: 0.4, filter: { type: 'lowpass', freq: 3000, freqEnd: 700 } },
    { type: 'square', freq: 240, freqEnd: 90, sweep: 'exp', dur: 0.11, gain: 0.4 },
  ]),
  slash: r(0.5, [
    { type: 'noise', freq: 0, dur: 0.14, gain: 0.42, filter: { type: 'bandpass', freq: 3800, freqEnd: 1400, q: 2.4 } },
  ]),
  shoot: r(0.42, [
    { type: 'square', freq: 900, freqEnd: 300, sweep: 'exp', dur: 0.1, gain: 0.35 },
  ]),
  splash: r(0.45, [
    { type: 'noise', freq: 0, dur: 0.3, gain: 0.4, filter: { type: 'lowpass', freq: 2400, freqEnd: 500 } },
    { type: 'sine', freq: 500, freqEnd: 180, sweep: 'exp', dur: 0.2, gain: 0.2 },
  ]),
  swim: r(0.3, [
    { type: 'noise', freq: 0, dur: 0.16, gain: 0.3, filter: { type: 'lowpass', freq: 1200, freqEnd: 400 } },
  ]),
  checkpoint: r(0.5, [
    { type: 'triangle', freq: 523, dur: 0.12, gain: 0.35 },
    { type: 'triangle', freq: 784, dur: 0.12, gain: 0.35, delay: 0.1 },
    { type: 'triangle', freq: 1046, dur: 0.3, gain: 0.35, delay: 0.2 },
  ]),
  clear: r(0.55, [
    { type: 'square', freq: 523, dur: 0.14, gain: 0.3 },
    { type: 'square', freq: 659, dur: 0.14, gain: 0.3, delay: 0.14 },
    { type: 'square', freq: 784, dur: 0.14, gain: 0.3, delay: 0.28 },
    { type: 'square', freq: 1046, dur: 0.42, gain: 0.34, delay: 0.42 },
    { type: 'triangle', freq: 261, dur: 0.7, gain: 0.24, delay: 0.42 },
  ]),
  'menu-move': r(0.3, [{ type: 'square', freq: 660, dur: 0.05, gain: 0.3 }]),
  'menu-select': r(0.4, [
    { type: 'square', freq: 880, dur: 0.06, gain: 0.32 },
    { type: 'square', freq: 1320, dur: 0.14, gain: 0.3, delay: 0.05 },
  ]),
  'menu-back': r(0.35, [
    { type: 'square', freq: 440, dur: 0.06, gain: 0.3 },
    { type: 'square', freq: 294, dur: 0.14, gain: 0.28, delay: 0.05 },
  ]),
  'boss-hit': r(0.6, [
    { type: 'sawtooth', freq: 220, freqEnd: 70, sweep: 'exp', dur: 0.24, gain: 0.4 },
    { type: 'noise', freq: 0, dur: 0.18, gain: 0.4, filter: { type: 'lowpass', freq: 3400, freqEnd: 400 } },
  ]),
  'boss-die': r(0.7, [
    { type: 'sawtooth', freq: 320, freqEnd: 40, sweep: 'exp', dur: 1.2, gain: 0.45 },
    { type: 'noise', freq: 0, dur: 1.1, gain: 0.42, filter: { type: 'lowpass', freq: 4000, freqEnd: 200 } },
  ]),
  'gear-shift': r(0.55, [
    { type: 'noise', freq: 0, dur: 0.42, gain: 0.35, filter: { type: 'bandpass', freq: 900, freqEnd: 3200, q: 3 } },
    { type: 'sawtooth', freq: 110, freqEnd: 440, sweep: 'exp', dur: 0.4, gain: 0.3 },
  ]),
  explosion: r(0.68, [
    { type: 'noise', freq: 0, dur: 0.6, gain: 0.5, filter: { type: 'lowpass', freq: 3200, freqEnd: 160 } },
    { type: 'sine', freq: 120, freqEnd: 34, sweep: 'exp', dur: 0.5, gain: 0.45 },
  ]),
  '1up': r(0.5, [
    { type: 'square', freq: 784, dur: 0.09, gain: 0.32 },
    { type: 'square', freq: 1046, dur: 0.09, gain: 0.32, delay: 0.09 },
    { type: 'square', freq: 1318, dur: 0.09, gain: 0.32, delay: 0.18 },
    { type: 'square', freq: 1568, dur: 0.28, gain: 0.34, delay: 0.27 },
  ]),
  warn: r(0.5, [
    { type: 'square', freq: 880, dur: 0.1, gain: 0.3 },
    { type: 'square', freq: 880, dur: 0.1, gain: 0.3, delay: 0.16 },
  ]),
}
