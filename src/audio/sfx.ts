/**
 * Sound design, as data.
 *
 * Every effect is built from three kinds of layer: a *transient* (the click of
 * contact, 10-30 ms, what makes a sound feel like it hit something), a *body*
 * (the pitched part that says what was hit) and a *tail* (the room, the debris,
 * the ring-out). Leave out the transient and everything sounds like it happened
 * behind a curtain; leave out the tail and it sounds like a beep.
 *
 * The sounds the player hears thousands of times — jump, stomp, coin, powerup —
 * are deliberately short and rolled off at the top so they stay bright without
 * getting fatiguing, and every trigger detunes slightly so a cascade of coins
 * does not machine-gun.
 */
import type { SfxName } from '../types'
import { driveCurve, noiseBuffer, panTo } from './synth'

export interface SfxLayer {
  /** Documentation only — it keeps the recipes honest. */
  role?: 'transient' | 'body' | 'tail'
  type: OscillatorType | 'noise'
  /** Oscillator pitch in Hz. Ignored by noise layers. */
  freq: number
  freqEnd?: number
  sweep?: 'linear' | 'exp'
  /** Total layer length in seconds. */
  dur: number
  gain: number
  attack?: number
  /** Seconds held at full level before the decay. */
  hold?: number
  delay?: number
  /** Cents. Two layers a few cents apart read as one thicker layer. */
  detune?: number
  vibrato?: { rate: number; depth: number }
  filter?: { type: BiquadFilterType; freq: number; freqEnd?: number; q?: number }
  /** Offset from the caller's pan, -1..1. */
  pan?: number
  /** Soft clip amount. */
  drive?: number
  /** Noise playback rate — lower is darker, coarser. */
  rate?: number
}

/** Kept as the old name so recipes read the same from outside. */
export type SfxVoice = SfxLayer

export interface SfxRecipe {
  gain: number
  /** Random pitch spread per trigger, in semitones. */
  vary?: number
  /** Semitone offsets applied round-robin, so repeats alternate audibly. */
  cycle?: number[]
  /** Reverb send, 0..1. */
  send?: number
  /**
   * How much this effect pushes the music out of the way, 0..1. Only the big
   * ones ask for room; a coin must never dip the score.
   */
  duck?: number
  layers: SfxLayer[]
}

const r = (
  gain: number,
  layers: SfxLayer[],
  extra: Partial<Omit<SfxRecipe, 'gain' | 'layers'>> = {},
): SfxRecipe => ({ gain, vary: 0.35, send: 0.12, duck: 0, ...extra, layers })

export const SFX_RECIPES: Record<SfxName, SfxRecipe> = {
  // ── Movement ───────────────────────────────────────────────────────────────
  jump: r(0.5, [
    { role: 'transient', type: 'noise', freq: 0, dur: 0.024, gain: 0.3, attack: 0.001, filter: { type: 'bandpass', freq: 2600, freqEnd: 1500, q: 1.2 } },
    { role: 'body', type: 'square', freq: 300, freqEnd: 700, sweep: 'exp', dur: 0.13, gain: 0.42, attack: 0.004, hold: 0.02, filter: { type: 'lowpass', freq: 3200, freqEnd: 2000, q: 0.8 } },
    { role: 'body', type: 'triangle', freq: 150, freqEnd: 352, sweep: 'exp', dur: 0.12, gain: 0.3, attack: 0.003 },
    { role: 'tail', type: 'sine', freq: 720, freqEnd: 1040, sweep: 'exp', dur: 0.09, gain: 0.12, delay: 0.06, attack: 0.02 },
  ], { vary: 0.5, send: 0.08 }),

  'double-jump': r(0.7, [
    { role: 'transient', type: 'noise', freq: 0, dur: 0.09, gain: 0.24, attack: 0.02, rate: 1.4, filter: { type: 'bandpass', freq: 1400, freqEnd: 4200, q: 1.1 } },
    { role: 'body', type: 'square', freq: 440, freqEnd: 940, sweep: 'exp', dur: 0.14, gain: 0.36, attack: 0.004, filter: { type: 'lowpass', freq: 3600, freqEnd: 2400 } },
    { role: 'tail', type: 'sine', freq: 940, freqEnd: 1500, sweep: 'exp', dur: 0.12, gain: 0.16, delay: 0.03, attack: 0.012 },
  ], { vary: 0.5, send: 0.16 }),

  land: r(0.67, [
    { role: 'transient', type: 'noise', freq: 0, dur: 0.05, gain: 0.4, attack: 0.001, rate: 0.7, filter: { type: 'lowpass', freq: 1600, freqEnd: 320, q: 0.9 } },
    { role: 'body', type: 'sine', freq: 155, freqEnd: 66, sweep: 'exp', dur: 0.1, gain: 0.38, attack: 0.002 },
    { role: 'tail', type: 'noise', freq: 0, dur: 0.13, gain: 0.08, delay: 0.03, attack: 0.02, rate: 0.5, filter: { type: 'lowpass', freq: 700, freqEnd: 240 } },
  ], { vary: 0.6, send: 0.1 }),

  skid: r(1.0, [
    { role: 'body', type: 'noise', freq: 0, dur: 0.18, gain: 0.3, attack: 0.02, rate: 0.9, filter: { type: 'bandpass', freq: 2800, freqEnd: 1100, q: 2.2 } },
    { role: 'tail', type: 'noise', freq: 0, dur: 0.12, gain: 0.1, delay: 0.06, attack: 0.03, rate: 0.4, filter: { type: 'lowpass', freq: 900, freqEnd: 400 } },
  ], { vary: 0.8, send: 0.14 }),

  splash: r(0.85, [
    { role: 'transient', type: 'noise', freq: 0, dur: 0.06, gain: 0.42, attack: 0.002, filter: { type: 'bandpass', freq: 2400, freqEnd: 900, q: 0.8 } },
    { role: 'body', type: 'sine', freq: 520, freqEnd: 170, sweep: 'exp', dur: 0.18, gain: 0.2, attack: 0.004 },
    { role: 'tail', type: 'noise', freq: 0, dur: 0.34, gain: 0.22, delay: 0.04, attack: 0.03, rate: 0.8, filter: { type: 'lowpass', freq: 1800, freqEnd: 380 } },
  ], { vary: 0.7, send: 0.35 }),

  swim: r(0.75, [
    { role: 'body', type: 'noise', freq: 0, dur: 0.17, gain: 0.3, attack: 0.02, rate: 0.6, filter: { type: 'lowpass', freq: 1300, freqEnd: 420, q: 1.4 } },
    { role: 'tail', type: 'sine', freq: 300, freqEnd: 180, sweep: 'exp', dur: 0.13, gain: 0.1, delay: 0.03, attack: 0.02 },
  ], { vary: 1, send: 0.28 }),

  // ── Impacts ────────────────────────────────────────────────────────────────
  stomp: r(0.88, [
    { role: 'transient', type: 'noise', freq: 0, dur: 0.035, gain: 0.42, attack: 0.001, filter: { type: 'lowpass', freq: 3600, freqEnd: 800 } },
    { role: 'body', type: 'square', freq: 520, freqEnd: 120, sweep: 'exp', dur: 0.11, gain: 0.4, attack: 0.002, filter: { type: 'lowpass', freq: 2600, freqEnd: 900 } },
    { role: 'tail', type: 'sine', freq: 120, freqEnd: 58, sweep: 'exp', dur: 0.16, gain: 0.26, delay: 0.02, attack: 0.004 },
  ], { vary: 0.6, send: 0.1, duck: 0.12 }),

  bump: r(0.52, [
    { role: 'transient', type: 'noise', freq: 0, dur: 0.02, gain: 0.24, attack: 0.001, filter: { type: 'bandpass', freq: 1600, q: 2 } },
    { role: 'body', type: 'square', freq: 190, freqEnd: 108, sweep: 'exp', dur: 0.08, gain: 0.38, attack: 0.002, filter: { type: 'lowpass', freq: 1800, freqEnd: 700 } },
  ], { vary: 0.7 }),

  break: r(0.7, [
    { role: 'transient', type: 'noise', freq: 0, dur: 0.05, gain: 0.5, attack: 0.001, filter: { type: 'highpass', freq: 900, freqEnd: 2400 } },
    { role: 'body', type: 'square', freq: 190, freqEnd: 58, sweep: 'exp', dur: 0.13, gain: 0.3, attack: 0.002 },
    { role: 'tail', type: 'noise', freq: 0, dur: 0.26, gain: 0.24, delay: 0.05, attack: 0.01, rate: 1.3, filter: { type: 'highpass', freq: 1800, freqEnd: 3600 } },
    { role: 'tail', type: 'noise', freq: 0, dur: 0.18, gain: 0.14, delay: 0.13, attack: 0.008, rate: 1.1, pan: 0.3, filter: { type: 'bandpass', freq: 2600, freqEnd: 1600, q: 1.6 } },
  ], { vary: 0.9, send: 0.2, duck: 0.1 }),

  kick: r(0.9, [
    { role: 'transient', type: 'noise', freq: 0, dur: 0.03, gain: 0.34, attack: 0.001, filter: { type: 'bandpass', freq: 2000, freqEnd: 1200, q: 1.4 } },
    { role: 'body', type: 'triangle', freq: 330, freqEnd: 115, sweep: 'exp', dur: 0.12, gain: 0.36, attack: 0.003 },
    { role: 'tail', type: 'noise', freq: 0, dur: 0.1, gain: 0.1, delay: 0.03, attack: 0.02, rate: 0.7, filter: { type: 'lowpass', freq: 1200, freqEnd: 500 } },
  ], { vary: 0.8, send: 0.14, duck: 0.08 }),

  punch: r(0.19, [
    { role: 'transient', type: 'noise', freq: 0, dur: 0.03, gain: 0.44, attack: 0.001, filter: { type: 'lowpass', freq: 3400, freqEnd: 900 } },
    { role: 'body', type: 'square', freq: 250, freqEnd: 85, sweep: 'exp', dur: 0.1, gain: 0.4, attack: 0.002, drive: 0.4, filter: { type: 'lowpass', freq: 2200, freqEnd: 700 } },
    { role: 'tail', type: 'sine', freq: 90, freqEnd: 46, sweep: 'exp', dur: 0.18, gain: 0.22, delay: 0.02, attack: 0.006 },
  ], { vary: 0.8, send: 0.16, duck: 0.12 }),

  slash: r(1.6, [
    { role: 'transient', type: 'noise', freq: 0, dur: 0.05, gain: 0.34, attack: 0.008, rate: 1.6, filter: { type: 'bandpass', freq: 4400, freqEnd: 2800, q: 1.4 } },
    { role: 'body', type: 'noise', freq: 0, dur: 0.16, gain: 0.36, attack: 0.02, rate: 1.2, filter: { type: 'bandpass', freq: 3400, freqEnd: 1100, q: 1.1 } },
    { role: 'tail', type: 'sine', freq: 1800, freqEnd: 900, sweep: 'exp', dur: 0.14, gain: 0.07, delay: 0.05, attack: 0.02 },
  ], { vary: 1.1, send: 0.24, duck: 0.08 }),

  shoot: r(0.6, [
    { role: 'transient', type: 'noise', freq: 0, dur: 0.02, gain: 0.28, attack: 0.001, filter: { type: 'highpass', freq: 2200 } },
    { role: 'body', type: 'square', freq: 940, freqEnd: 280, sweep: 'exp', dur: 0.09, gain: 0.32, attack: 0.002, filter: { type: 'lowpass', freq: 4000, freqEnd: 1400 } },
    { role: 'tail', type: 'noise', freq: 0, dur: 0.1, gain: 0.08, delay: 0.03, attack: 0.02, filter: { type: 'bandpass', freq: 1800, freqEnd: 900, q: 1.6 } },
  ], { vary: 1.2, send: 0.18 }),

  explosion: r(0.6, [
    { role: 'transient', type: 'noise', freq: 0, dur: 0.05, gain: 0.5, attack: 0.001, filter: { type: 'highpass', freq: 1200, freqEnd: 400 } },
    { role: 'body', type: 'noise', freq: 0, dur: 0.55, gain: 0.44, attack: 0.006, rate: 0.7, drive: 0.3, filter: { type: 'lowpass', freq: 3000, freqEnd: 180 } },
    { role: 'body', type: 'sine', freq: 130, freqEnd: 32, sweep: 'exp', dur: 0.45, gain: 0.45, attack: 0.004 },
    { role: 'tail', type: 'noise', freq: 0, dur: 0.8, gain: 0.16, delay: 0.1, attack: 0.06, rate: 0.4, pan: -0.25, filter: { type: 'lowpass', freq: 900, freqEnd: 140 } },
  ], { vary: 0.7, send: 0.4, duck: 0.5 }),

  // ── Player state ───────────────────────────────────────────────────────────
  hurt: r(0.41, [
    { role: 'transient', type: 'noise', freq: 0, dur: 0.03, gain: 0.3, attack: 0.001, filter: { type: 'bandpass', freq: 1800, q: 1.2 } },
    { role: 'body', type: 'sawtooth', freq: 440, freqEnd: 96, sweep: 'exp', dur: 0.3, gain: 0.4, attack: 0.004, drive: 0.25, filter: { type: 'lowpass', freq: 2600, freqEnd: 700 } },
    { role: 'body', type: 'square', freq: 220, freqEnd: 62, sweep: 'exp', dur: 0.26, gain: 0.2, attack: 0.004, delay: 0.02 },
  ], { vary: 0.4, send: 0.2, duck: 0.25 }),

  death: r(0.75, [
    { role: 'transient', type: 'noise', freq: 0, dur: 0.04, gain: 0.3, attack: 0.001, filter: { type: 'bandpass', freq: 2200, q: 1 } },
    { role: 'body', type: 'square', freq: 660, freqEnd: 240, sweep: 'exp', dur: 0.18, gain: 0.36, attack: 0.004, filter: { type: 'lowpass', freq: 3200, freqEnd: 1800 } },
    { role: 'body', type: 'square', freq: 240, freqEnd: 880, sweep: 'exp', dur: 0.45, gain: 0.32, delay: 0.19, attack: 0.006 },
    { role: 'body', type: 'square', freq: 880, freqEnd: 70, sweep: 'exp', dur: 0.75, gain: 0.32, delay: 0.6, attack: 0.008, filter: { type: 'lowpass', freq: 3000, freqEnd: 600 } },
    { role: 'tail', type: 'sine', freq: 200, freqEnd: 60, sweep: 'exp', dur: 0.5, gain: 0.14, delay: 0.9, attack: 0.05 },
  ], { vary: 0.15, send: 0.3, duck: 0.6 }),

  powerup: r(0.56, [
    { role: 'transient', type: 'noise', freq: 0, dur: 0.02, gain: 0.2, attack: 0.001, filter: { type: 'highpass', freq: 3000 } },
    { role: 'body', type: 'square', freq: 392, dur: 0.06, gain: 0.3, attack: 0.003, filter: { type: 'lowpass', freq: 3400 } },
    { role: 'body', type: 'square', freq: 523, dur: 0.06, gain: 0.3, delay: 0.06, attack: 0.003, filter: { type: 'lowpass', freq: 3600 } },
    { role: 'body', type: 'square', freq: 659, dur: 0.06, gain: 0.3, delay: 0.12, attack: 0.003, filter: { type: 'lowpass', freq: 3800 } },
    { role: 'body', type: 'square', freq: 784, dur: 0.06, gain: 0.3, delay: 0.18, attack: 0.003, filter: { type: 'lowpass', freq: 4000 } },
    { role: 'body', type: 'square', freq: 1046, dur: 0.2, gain: 0.3, delay: 0.24, attack: 0.003, hold: 0.04, filter: { type: 'lowpass', freq: 4200 } },
    { role: 'tail', type: 'triangle', freq: 2093, dur: 0.3, gain: 0.1, delay: 0.24, attack: 0.02 },
  ], { vary: 0.2, send: 0.25 }),

  powerdown: r(0.56, [
    { role: 'body', type: 'square', freq: 784, dur: 0.07, gain: 0.32, attack: 0.003, filter: { type: 'lowpass', freq: 3000 } },
    { role: 'body', type: 'square', freq: 587, dur: 0.07, gain: 0.32, delay: 0.07, attack: 0.003, filter: { type: 'lowpass', freq: 2600 } },
    { role: 'body', type: 'square', freq: 392, dur: 0.22, gain: 0.32, delay: 0.14, attack: 0.003, filter: { type: 'lowpass', freq: 2200, freqEnd: 900 } },
    { role: 'tail', type: 'sawtooth', freq: 196, freqEnd: 120, sweep: 'exp', dur: 0.3, gain: 0.12, delay: 0.16, attack: 0.02 },
  ], { vary: 0.2, send: 0.22, duck: 0.2 }),

  'gear-shift': r(0.38, [
    { role: 'transient', type: 'noise', freq: 0, dur: 0.04, gain: 0.3, attack: 0.002, filter: { type: 'bandpass', freq: 900, q: 2 } },
    { role: 'body', type: 'noise', freq: 0, dur: 0.4, gain: 0.3, attack: 0.05, rate: 1.1, filter: { type: 'bandpass', freq: 800, freqEnd: 3400, q: 3 } },
    { role: 'body', type: 'sawtooth', freq: 110, freqEnd: 440, sweep: 'exp', dur: 0.38, gain: 0.26, attack: 0.03, drive: 0.3, filter: { type: 'lowpass', freq: 900, freqEnd: 3200 } },
    { role: 'tail', type: 'sine', freq: 880, freqEnd: 1760, sweep: 'exp', dur: 0.22, gain: 0.14, delay: 0.3, attack: 0.02 },
  ], { vary: 0.25, send: 0.3, duck: 0.3 }),

  // ── Rewards ────────────────────────────────────────────────────────────────
  coin: r(0.64, [
    { role: 'transient', type: 'noise', freq: 0, dur: 0.012, gain: 0.16, attack: 0.001, filter: { type: 'highpass', freq: 4000 } },
    { role: 'body', type: 'square', freq: 1046, dur: 0.045, gain: 0.3, attack: 0.002, filter: { type: 'lowpass', freq: 5200 } },
    { role: 'body', type: 'square', freq: 1568, dur: 0.14, gain: 0.3, delay: 0.045, attack: 0.002, hold: 0.03, filter: { type: 'lowpass', freq: 5600 } },
    { role: 'tail', type: 'sine', freq: 3136, dur: 0.16, gain: 0.07, delay: 0.045, attack: 0.006 },
  ], { vary: 0.3, cycle: [0, 0, 2, 0, -1, 2], send: 0.2 }),

  '1up': r(0.55, [
    { role: 'body', type: 'square', freq: 784, dur: 0.08, gain: 0.3, attack: 0.003, filter: { type: 'lowpass', freq: 4000 } },
    { role: 'body', type: 'square', freq: 1046, dur: 0.08, gain: 0.3, delay: 0.08, attack: 0.003, filter: { type: 'lowpass', freq: 4200 } },
    { role: 'body', type: 'square', freq: 1318, dur: 0.08, gain: 0.3, delay: 0.16, attack: 0.003, filter: { type: 'lowpass', freq: 4400 } },
    { role: 'body', type: 'square', freq: 1568, dur: 0.26, gain: 0.32, delay: 0.24, attack: 0.003, hold: 0.05, filter: { type: 'lowpass', freq: 4600 } },
    { role: 'tail', type: 'triangle', freq: 3136, dur: 0.34, gain: 0.1, delay: 0.24, attack: 0.03 },
  ], { vary: 0.15, send: 0.3 }),

  checkpoint: r(0.56, [
    { role: 'transient', type: 'noise', freq: 0, dur: 0.02, gain: 0.16, attack: 0.001, filter: { type: 'highpass', freq: 4500 } },
    { role: 'body', type: 'triangle', freq: 523, dur: 0.12, gain: 0.32, attack: 0.004 },
    { role: 'body', type: 'triangle', freq: 784, dur: 0.12, gain: 0.32, delay: 0.1, attack: 0.004 },
    { role: 'body', type: 'sine', freq: 1046, dur: 0.5, gain: 0.3, delay: 0.2, attack: 0.006, hold: 0.06 },
    { role: 'tail', type: 'sine', freq: 2093, dur: 0.6, gain: 0.09, delay: 0.2, attack: 0.05, pan: 0.3 },
  ], { vary: 0.2, send: 0.45 }),

  clear: r(0.55, [
    { role: 'body', type: 'square', freq: 523, dur: 0.13, gain: 0.28, attack: 0.004, filter: { type: 'lowpass', freq: 3600 } },
    { role: 'body', type: 'square', freq: 659, dur: 0.13, gain: 0.28, delay: 0.13, attack: 0.004, filter: { type: 'lowpass', freq: 3800 } },
    { role: 'body', type: 'square', freq: 784, dur: 0.13, gain: 0.28, delay: 0.26, attack: 0.004, filter: { type: 'lowpass', freq: 4000 } },
    { role: 'body', type: 'square', freq: 1046, dur: 0.44, gain: 0.32, delay: 0.39, attack: 0.004, hold: 0.1, filter: { type: 'lowpass', freq: 4200 } },
    { role: 'tail', type: 'triangle', freq: 261, dur: 0.7, gain: 0.2, delay: 0.39, attack: 0.02 },
    { role: 'tail', type: 'sine', freq: 2093, dur: 0.6, gain: 0.07, delay: 0.42, attack: 0.06, pan: -0.3 },
  ], { vary: 0.1, send: 0.35 }),

  // ── Menus ──────────────────────────────────────────────────────────────────
  'menu-move': r(0.42, [
    { role: 'transient', type: 'noise', freq: 0, dur: 0.01, gain: 0.12, attack: 0.001, filter: { type: 'highpass', freq: 4000 } },
    { role: 'body', type: 'square', freq: 660, dur: 0.045, gain: 0.28, attack: 0.002, filter: { type: 'lowpass', freq: 3200 } },
  ], { vary: 0.5, send: 0.1 }),

  'menu-select': r(0.45, [
    { role: 'body', type: 'square', freq: 880, dur: 0.05, gain: 0.3, attack: 0.002, filter: { type: 'lowpass', freq: 4000 } },
    { role: 'body', type: 'square', freq: 1320, dur: 0.13, gain: 0.28, delay: 0.045, attack: 0.002, filter: { type: 'lowpass', freq: 4400 } },
    { role: 'tail', type: 'sine', freq: 2640, dur: 0.16, gain: 0.07, delay: 0.05, attack: 0.01 },
  ], { vary: 0.25, send: 0.2 }),

  'menu-back': r(0.4, [
    { role: 'body', type: 'square', freq: 440, dur: 0.05, gain: 0.28, attack: 0.002, filter: { type: 'lowpass', freq: 2600 } },
    { role: 'body', type: 'square', freq: 294, dur: 0.13, gain: 0.26, delay: 0.045, attack: 0.002, filter: { type: 'lowpass', freq: 2200 } },
  ], { vary: 0.25, send: 0.16 }),

  warn: r(0.5, [
    { role: 'body', type: 'square', freq: 880, dur: 0.1, gain: 0.28, attack: 0.004, hold: 0.03, filter: { type: 'lowpass', freq: 3400 } },
    { role: 'body', type: 'square', freq: 880, dur: 0.1, gain: 0.28, delay: 0.16, attack: 0.004, hold: 0.03, filter: { type: 'lowpass', freq: 3400 } },
    { role: 'tail', type: 'sine', freq: 1760, dur: 0.2, gain: 0.06, delay: 0.16, attack: 0.02 },
  ], { vary: 0.15, send: 0.2 }),

  // ── Bosses ─────────────────────────────────────────────────────────────────
  'boss-hit': r(0.4, [
    { role: 'transient', type: 'noise', freq: 0, dur: 0.03, gain: 0.44, attack: 0.001, filter: { type: 'lowpass', freq: 4200, freqEnd: 1400 } },
    { role: 'body', type: 'sawtooth', freq: 230, freqEnd: 68, sweep: 'exp', dur: 0.24, gain: 0.36, attack: 0.003, drive: 0.4, filter: { type: 'lowpass', freq: 2600, freqEnd: 500 } },
    { role: 'body', type: 'square', freq: 460, freqEnd: 140, sweep: 'exp', dur: 0.14, gain: 0.18, attack: 0.002, pan: 0.25 },
    { role: 'tail', type: 'noise', freq: 0, dur: 0.3, gain: 0.14, delay: 0.04, attack: 0.03, rate: 0.6, filter: { type: 'lowpass', freq: 1400, freqEnd: 300 } },
  ], { vary: 0.5, send: 0.3, duck: 0.3 }),

  'boss-die': r(0.56, [
    { role: 'transient', type: 'noise', freq: 0, dur: 0.06, gain: 0.5, attack: 0.002, filter: { type: 'highpass', freq: 1600, freqEnd: 600 } },
    { role: 'body', type: 'sawtooth', freq: 340, freqEnd: 40, sweep: 'exp', dur: 1.2, gain: 0.4, attack: 0.006, drive: 0.35, filter: { type: 'lowpass', freq: 3200, freqEnd: 260 } },
    { role: 'body', type: 'noise', freq: 0, dur: 1.0, gain: 0.36, attack: 0.01, rate: 0.6, filter: { type: 'lowpass', freq: 3600, freqEnd: 200 } },
    { role: 'tail', type: 'sine', freq: 90, freqEnd: 30, sweep: 'exp', dur: 1.4, gain: 0.3, delay: 0.2, attack: 0.08 },
    { role: 'tail', type: 'noise', freq: 0, dur: 1.2, gain: 0.12, delay: 0.4, attack: 0.15, rate: 0.35, pan: 0.3, filter: { type: 'lowpass', freq: 800, freqEnd: 120 } },
  ], { vary: 0.2, send: 0.5, duck: 0.7 }),
}

export interface SfxPlayOpts {
  volume?: number
  /** Playback rate — scales pitch and shortens the sound, as the callers expect. */
  rate?: number
  pan?: number
  /** Extra detune for this trigger, in semitones. */
  semitones?: number
}

/**
 * Render one effect into any context. Returns the time it finishes, so a
 * caller can budget voices; the engine uses it for its voice cap.
 */
export function renderSfx(
  ctx: BaseAudioContext,
  recipe: SfxRecipe,
  out: AudioNode,
  send: AudioNode | null,
  when: number,
  opts: SfxPlayOpts = {},
): number {
  const rate = opts.rate ?? 1
  const volume = opts.volume ?? 1
  const detune = Math.pow(2, (opts.semitones ?? 0) / 12)
  const basePan = Math.max(-1, Math.min(1, opts.pan ?? 0))
  const t0 = Math.max(when, ctx.currentTime)
  let end = t0

  for (const layer of recipe.layers) {
    const start = t0 + (layer.delay ?? 0) / rate
    const dur = Math.max(0.01, layer.dur / rate)
    const attack = Math.max(0.0008, (layer.attack ?? 0.004) / rate)
    const hold = (layer.hold ?? 0) / rate
    const peak = Math.max(0.0002, layer.gain * volume * recipe.gain)

    const amp = ctx.createGain()
    amp.gain.setValueAtTime(0.0001, start)
    amp.gain.exponentialRampToValueAtTime(peak, start + attack)
    if (hold > 0) amp.gain.setValueAtTime(peak, start + attack + hold)
    amp.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(attack + hold + 0.01, dur))

    let node: AudioNode = amp
    if (layer.filter) {
      const f = ctx.createBiquadFilter()
      f.type = layer.filter.type
      f.Q.value = layer.filter.q ?? 1
      const f0 = Math.min(19000, Math.max(30, layer.filter.freq * detune))
      f.frequency.setValueAtTime(f0, start)
      if (layer.filter.freqEnd !== undefined) {
        f.frequency.exponentialRampToValueAtTime(
          Math.min(19000, Math.max(30, layer.filter.freqEnd * detune)),
          start + dur,
        )
      }
      node.connect(f)
      node = f
    }
    if (layer.drive) {
      const ws = ctx.createWaveShaper()
      ws.curve = driveCurve(layer.drive)
      node.connect(ws)
      node = ws
    }

    const panner = panTo(ctx, node, out, basePan + (layer.pan ?? 0))
    if (send && (recipe.send ?? 0) > 0) {
      const s = ctx.createGain()
      s.gain.value = recipe.send ?? 0
      panner.connect(s)
      s.connect(send)
    }

    let src: AudioScheduledSourceNode
    if (layer.type === 'noise') {
      const n = ctx.createBufferSource()
      n.buffer = noiseBuffer(ctx)
      n.loop = true
      n.playbackRate.value = (layer.rate ?? 1) * (0.9 + Math.random() * 0.2)
      // Start somewhere random in the buffer so two hits are never identical.
      src = n
      n.connect(amp)
      n.start(start, Math.random() * 1.5)
      n.stop(start + dur + 0.03)
      end = Math.max(end, start + dur)
      continue
    }

    const osc = ctx.createOscillator()
    osc.type = layer.type
    osc.detune.value = layer.detune ?? 0
    const f0 = Math.max(20, layer.freq * rate * detune)
    osc.frequency.setValueAtTime(f0, start)
    if (layer.freqEnd !== undefined) {
      const f1 = Math.max(20, layer.freqEnd * rate * detune)
      if (layer.sweep === 'linear') osc.frequency.linearRampToValueAtTime(f1, start + dur)
      else osc.frequency.exponentialRampToValueAtTime(f1, start + dur)
    }
    if (layer.vibrato) {
      const lfo = ctx.createOscillator()
      const lg = ctx.createGain()
      lfo.frequency.value = layer.vibrato.rate
      lg.gain.value = layer.vibrato.depth
      lfo.connect(lg)
      lg.connect(osc.frequency)
      lfo.start(start)
      lfo.stop(start + dur + 0.05)
    }
    osc.connect(amp)
    osc.start(start)
    osc.stop(start + dur + 0.03)
    src = osc
    void src
    end = Math.max(end, start + dur)
  }

  return end
}
