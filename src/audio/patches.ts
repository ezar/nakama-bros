/**
 * The instrument list.
 *
 * Each island gets voices that belong to it — a reed and a rolling bass for the
 * East Blue, a nasal double-reed over a drone for Alabasta, bells and glass for
 * Skypiea, brass and steam for Water 7, a music box for Thriller Bark, koto and
 * shakuhachi for Wano. They are all the same machinery underneath: a detuned
 * oscillator stack, an amp ADSR and a filter envelope.
 */
import type { Patch } from './synth'

export const PATCHES = {
  /** Squeezebox lead: two saws a hair apart, breathy, spread wide. */
  reed: {
    osc: [
      { type: 'sawtooth', gain: 0.42, detune: -7, pan: -0.35 },
      { type: 'sawtooth', gain: 0.42, detune: 8, pan: 0.35 },
      { type: 'square', gain: 0.22, oct: -1 },
    ],
    noise: { gain: 0.1, dur: 0.05, filter: 'bandpass', freq: 2600, q: 1.4, track: true },
    amp: { a: 0.028, d: 0.12, s: 0.72, r: 0.12 },
    filter: { type: 'lowpass', base: 900, track: 2.6, env: 2.4, decay: 0.16, q: 1.1 },
    vibrato: { rate: 5.2, depth: 7, delay: 0.22 },
    gain: 0.24, send: 0.2,
  },

  /** Accordion-ish harmony bed — softer, no vibrato, sits under the lead. */
  squeeze: {
    osc: [
      { type: 'square', gain: 0.3, detune: -6, pan: -0.5 },
      { type: 'square', gain: 0.3, detune: 7, pan: 0.5 },
    ],
    amp: { a: 0.05, d: 0.2, s: 0.6, r: 0.16 },
    filter: { type: 'lowpass', base: 700, track: 1.8, env: 1.6, decay: 0.2, q: 0.8 },
    gain: 0.15, send: 0.24,
  },

  /** Round wooden bass — sub sine plus a triangle for definition. */
  bass: {
    osc: [
      // More triangle than sine: a pure sine bass is all weight and no note,
      // and on a laptop speaker it disappears entirely.
      { type: 'sine', gain: 0.44 },
      { type: 'triangle', gain: 0.5, detune: 5 },
      { type: 'triangle', gain: 0.12, oct: 1, detune: -6 },
    ],
    amp: { a: 0.006, d: 0.1, s: 0.55, r: 0.09 },
    filter: { type: 'lowpass', base: 220, track: 2.2, env: 3, decay: 0.09, q: 1.2 },
    gain: 0.26, send: 0.03,
  },

  /** Boss bass: detuned saws through a snapping filter. */
  bassSaw: {
    osc: [
      { type: 'sawtooth', gain: 0.5, detune: -9 },
      { type: 'sawtooth', gain: 0.5, detune: 10 },
      { type: 'sine', gain: 0.34, oct: -1 },
    ],
    amp: { a: 0.004, d: 0.09, s: 0.42, r: 0.07 },
    filter: { type: 'lowpass', base: 190, track: 1.4, env: 4.5, decay: 0.1, q: 4 },
    gain: 0.22, send: 0.05, drive: 0.3,
  },

  /** Nasal double reed for the desert — strong late vibrato, bandpassed. */
  zurna: {
    osc: [
      { type: 'sawtooth', gain: 0.5, detune: -11, pan: -0.2 },
      { type: 'square', gain: 0.3, detune: 9, pan: 0.2 },
    ],
    noise: { gain: 0.13, dur: 0.07, filter: 'bandpass', freq: 3000, q: 2, track: true },
    amp: { a: 0.035, d: 0.18, s: 0.66, r: 0.14 },
    filter: { type: 'bandpass', base: 900, track: 2.6, env: 1.9, decay: 0.24, q: 1.5 },
    vibrato: { rate: 6.1, depth: 16, delay: 0.28 },
    gain: 0.26, send: 0.3,
  },

  /** Dark low reed — the answering phrase in the sandstorm. */
  duduk: {
    osc: [
      { type: 'triangle', gain: 0.6 },
      { type: 'sawtooth', gain: 0.22, detune: 6 },
    ],
    noise: { gain: 0.14, dur: 0.09, filter: 'bandpass', freq: 1600, q: 1.2, track: true },
    amp: { a: 0.06, d: 0.25, s: 0.7, r: 0.2 },
    filter: { type: 'lowpass', base: 620, track: 1.6, env: 1.7, decay: 0.3, q: 1.4 },
    vibrato: { rate: 4.6, depth: 11, delay: 0.35 },
    gain: 0.22, send: 0.34,
  },

  /** Sustained drone bed. Slow in, slow out, no top end. */
  drone: {
    osc: [
      { type: 'sawtooth', gain: 0.32, detune: -14, pan: -0.6 },
      { type: 'sawtooth', gain: 0.32, detune: 13, pan: 0.6 },
      { type: 'sine', gain: 0.3 },
    ],
    amp: { a: 0.5, d: 0.8, s: 0.85, r: 0.9 },
    filter: { type: 'lowpass', base: 480, track: 0.6, env: 1.4, decay: 1.2, q: 0.7 },
    gain: 0.1, send: 0.4,
  },

  /** Airy pad for the cloud sea. */
  airPad: {
    osc: [
      { type: 'triangle', gain: 0.4, detune: -9, pan: -0.55 },
      { type: 'triangle', gain: 0.4, detune: 10, pan: 0.55 },
      { type: 'sine', gain: 0.3, oct: 1 },
    ],
    amp: { a: 0.22, d: 0.5, s: 0.7, r: 0.5 },
    filter: { type: 'lowpass', base: 1500, track: 1.2, env: 1.5, decay: 0.7, q: 0.6 },
    gain: 0.11, send: 0.55,
  },

  /** Struck bell: sine plus inharmonic partials, long ring, no sustain. */
  bell: {
    osc: [
      { type: 'sine', gain: 0.6 },
      { type: 'sine', gain: 0.22, semis: 19 },
      { type: 'sine', gain: 0.12, semis: 28 },
      { type: 'triangle', gain: 0.1, oct: 1, detune: 6 },
    ],
    amp: { a: 0.004, d: 1.5, s: 0.001, r: 0.5 },
    gain: 0.18, send: 0.55, fixedDur: 0.02,
  },

  /** Celesta / glass — shorter, brighter, for the waltz melody. */
  glass: {
    osc: [
      { type: 'sine', gain: 0.55 },
      { type: 'sine', gain: 0.18, semis: 12 },
      { type: 'triangle', gain: 0.14, semis: 19, detune: 4 },
    ],
    amp: { a: 0.005, d: 0.55, s: 0.06, r: 0.3 },
    filter: { type: 'lowpass', base: 2400, track: 3, env: 1.6, decay: 0.25, q: 0.8 },
    gain: 0.22, send: 0.45, fixedDur: 0.42,
  },

  /** Music box: one clean partial, a knock of noise, dead short. */
  musicbox: {
    osc: [
      { type: 'sine', gain: 0.6 },
      { type: 'sine', gain: 0.2, semis: 12 },
      { type: 'sine', gain: 0.09, semis: 26 },
    ],
    noise: { gain: 0.07, dur: 0.02, filter: 'highpass', freq: 5000 },
    amp: { a: 0.003, d: 0.75, s: 0.02, r: 0.35 },
    gain: 0.22, send: 0.5, fixedDur: 0.03,
  },

  /** Pizzicato strings for the haunted waltz accompaniment. */
  pizz: {
    osc: [
      { type: 'sawtooth', gain: 0.45, detune: -8 },
      { type: 'triangle', gain: 0.4, detune: 9 },
    ],
    noise: { gain: 0.16, dur: 0.03, filter: 'bandpass', freq: 2200, q: 2, track: true },
    amp: { a: 0.004, d: 0.19, s: 0.02, r: 0.14 },
    filter: { type: 'lowpass', base: 900, track: 3.5, env: 2.2, decay: 0.1, q: 1.6 },
    gain: 0.2, send: 0.3, fixedDur: 0.12,
  },

  /** Cathedral organ, thin and cold. */
  organ: {
    osc: [
      { type: 'sine', gain: 0.4 },
      { type: 'sine', gain: 0.22, semis: 7, pan: -0.4 },
      { type: 'sine', gain: 0.18, oct: 1, pan: 0.4 },
      { type: 'square', gain: 0.08, oct: -1 },
    ],
    amp: { a: 0.09, d: 0.3, s: 0.8, r: 0.3 },
    filter: { type: 'lowpass', base: 1200, track: 1, env: 1.2, decay: 0.4, q: 0.7 },
    gain: 0.12, send: 0.45,
  },

  /** March brass — bright, short bite, wide. */
  brass: {
    osc: [
      { type: 'sawtooth', gain: 0.44, detune: -8, pan: -0.3 },
      { type: 'sawtooth', gain: 0.44, detune: 9, pan: 0.3 },
      { type: 'square', gain: 0.18, oct: -1 },
    ],
    amp: { a: 0.02, d: 0.14, s: 0.62, r: 0.1 },
    filter: { type: 'lowpass', base: 800, track: 2.4, env: 3.4, decay: 0.12, q: 1.8 },
    gain: 0.22, send: 0.2, drive: 0.18,
  },

  /** Steam whistle: two squares a beating interval apart plus escaping air. */
  whistle: {
    osc: [
      { type: 'square', gain: 0.34, detune: -18, pan: -0.45 },
      { type: 'square', gain: 0.34, detune: 20, pan: 0.45 },
      { type: 'sine', gain: 0.2, semis: 7 },
    ],
    noise: { gain: 0.3, dur: 0.22, filter: 'highpass', freq: 3600, q: 0.8 },
    amp: { a: 0.02, d: 0.1, s: 0.55, r: 0.22 },
    filter: { type: 'bandpass', base: 1800, track: 1.6, env: 1.5, decay: 0.2, q: 2.2 },
    vibrato: { rate: 7.5, depth: 9, delay: 0.1 },
    gain: 0.16, send: 0.4,
  },

  /** Koto-like pluck: bright attack, fast decay, a little buzz. */
  koto: {
    osc: [
      { type: 'triangle', gain: 0.5 },
      { type: 'sawtooth', gain: 0.28, detune: 7 },
      { type: 'sine', gain: 0.2, oct: 1 },
    ],
    noise: { gain: 0.22, dur: 0.035, filter: 'bandpass', freq: 3000, q: 2.4, track: true },
    amp: { a: 0.003, d: 0.42, s: 0.05, r: 0.28 },
    filter: { type: 'lowpass', base: 1200, track: 4, env: 2.6, decay: 0.14, q: 1.4 },
    gain: 0.22, send: 0.3, fixedDur: 0.2,
  },

  /** Breathy bamboo flute for Wano's long lines. */
  shakuhachi: {
    osc: [
      { type: 'sine', gain: 0.62 },
      { type: 'triangle', gain: 0.2, detune: 8 },
    ],
    noise: { gain: 0.3, dur: 0.13, filter: 'bandpass', freq: 2400, q: 1.1, track: true },
    amp: { a: 0.07, d: 0.3, s: 0.72, r: 0.26 },
    filter: { type: 'lowpass', base: 900, track: 2, env: 1.8, decay: 0.35, q: 1 },
    vibrato: { rate: 4.8, depth: 13, delay: 0.4 },
    gain: 0.23, send: 0.42,
  },

  /** Boss lead: hard saw, screaming filter. */
  sawLead: {
    osc: [
      { type: 'sawtooth', gain: 0.4, detune: -12, pan: -0.3 },
      { type: 'sawtooth', gain: 0.4, detune: 11, pan: 0.3 },
      { type: 'square', gain: 0.2, oct: -1 },
    ],
    amp: { a: 0.008, d: 0.1, s: 0.7, r: 0.09 },
    filter: { type: 'lowpass', base: 1000, track: 3.2, env: 4, decay: 0.14, q: 3.2 },
    vibrato: { rate: 6.4, depth: 10, delay: 0.3 },
    gain: 0.22, send: 0.22, drive: 0.35,
  },

  /** Alarm siren over the boss climax. */
  siren: {
    osc: [
      { type: 'sawtooth', gain: 0.5, detune: -25, pan: -0.7 },
      { type: 'sawtooth', gain: 0.5, detune: 25, pan: 0.7 },
    ],
    amp: { a: 0.3, d: 0.4, s: 0.7, r: 0.5 },
    filter: { type: 'bandpass', base: 1400, track: 1, env: 2.4, decay: 0.6, q: 5 },
    vibrato: { rate: 0.9, depth: 90, delay: 0 },
    gain: 0.07, send: 0.5,
  },

  /** Fanfare brass — fatter than the march, for the victory cue. */
  fanfare: {
    osc: [
      { type: 'sawtooth', gain: 0.4, detune: -10, pan: -0.4 },
      { type: 'sawtooth', gain: 0.4, detune: 11, pan: 0.4 },
      { type: 'square', gain: 0.22, semis: 7 },
      { type: 'sine', gain: 0.3, oct: -1 },
    ],
    amp: { a: 0.015, d: 0.12, s: 0.75, r: 0.22 },
    filter: { type: 'lowpass', base: 1000, track: 3, env: 3.6, decay: 0.16, q: 1.6 },
    gain: 0.22, send: 0.3, drive: 0.2,
  },
} satisfies Record<string, Patch>

export type PatchId = keyof typeof PATCHES
