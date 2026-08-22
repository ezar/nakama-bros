/**
 * A small step sequencer.
 *
 * Tracks are written as note grids per layer. Layers have an intensity
 * threshold, so raising the intensity (entering a boss arena, the last twenty
 * seconds on the clock) brings in percussion and counter-melody without a cut.
 */

export interface MusicLayer {
  name: string
  /** Layer plays only when the current intensity is at least this. */
  threshold: number
  wave: OscillatorType
  gain: number
  /** Semitone offset applied to every note. */
  transpose?: number
  /**
   * One string per bar. Characters are scale degrees `1`-`7` (with `-` to hold
   * and `.` for a rest); `^` raises the previous note an octave.
   */
  pattern: string[]
  /** Note length in steps. */
  attack?: number
  release?: number
  filter?: number
}

export interface MusicTrack {
  bpm: number
  /** Steps per bar. */
  steps: number
  /** Root note in Hz. */
  root: number
  /** Semitone offsets of the scale used by degree characters. */
  scale: number[]
  /** Chord roots per bar, as scale degrees. */
  progression: number[]
  layers: MusicLayer[]
  swing?: number
}

const MINOR = [0, 2, 3, 5, 7, 8, 10]
const MAJOR = [0, 2, 4, 5, 7, 9, 11]

/** Sea-shanty main theme: 6/8 lilt, major, driving bass. */
const overworld: MusicTrack = {
  bpm: 132,
  steps: 16,
  root: 261.63,
  scale: MAJOR,
  progression: [1, 5, 6, 4],
  layers: [
    {
      name: 'bass', threshold: 0, wave: 'triangle', gain: 0.3, transpose: -24,
      pattern: ['1...5...1...5...', '1...5...1...5...'],
    },
    {
      name: 'lead', threshold: 0.2, wave: 'square', gain: 0.19,
      pattern: [
        '1.2.3.5.3.2.1...',
        '5.4.3.2.3.....6.',
        '1.2.3.5.6.5.3...',
        '2.3.4.5.1.......',
      ],
    },
    {
      name: 'harmony', threshold: 0.55, wave: 'square', gain: 0.1, transpose: -12,
      pattern: ['3...5...3...5...', '2...4...2...4...'],
    },
    {
      name: 'arp', threshold: 0.75, wave: 'sawtooth', gain: 0.07, transpose: 12,
      pattern: ['1357135713571357'],
    },
  ],
}

/** Tense, chromatic boss theme in minor. */
const boss: MusicTrack = {
  bpm: 158,
  steps: 16,
  root: 220,
  scale: MINOR,
  progression: [1, 1, 6, 7],
  layers: [
    {
      name: 'bass', threshold: 0, wave: 'sawtooth', gain: 0.26, transpose: -24,
      pattern: ['1.1.1.1.1.1.1.1.'],
    },
    {
      name: 'stab', threshold: 0.3, wave: 'square', gain: 0.16, transpose: -12,
      pattern: ['1..1..1...1.1...'],
    },
    {
      name: 'lead', threshold: 0.5, wave: 'square', gain: 0.16,
      pattern: ['5.4.3.4.5.7.5...', '1.7.6.5.4.....3.'],
    },
    {
      name: 'siren', threshold: 0.85, wave: 'sawtooth', gain: 0.07, transpose: 12,
      pattern: ['1.......5.......'],
    },
  ],
}

/** Calm map/hub theme. */
const map: MusicTrack = {
  bpm: 96,
  steps: 16,
  root: 293.66,
  scale: MAJOR,
  progression: [1, 4, 6, 5],
  layers: [
    { name: 'pad', threshold: 0, wave: 'triangle', gain: 0.18, transpose: -12, pattern: ['1.......5.......'] },
    { name: 'bell', threshold: 0.3, wave: 'sine', gain: 0.13, transpose: 12, pattern: ['1..3..5..3..1...', '6..5..3..2..1...'] },
  ],
}

/** Menu / title. */
const title: MusicTrack = {
  bpm: 112,
  steps: 16,
  root: 261.63,
  scale: MAJOR,
  progression: [1, 6, 4, 5],
  layers: [
    { name: 'bass', threshold: 0, wave: 'triangle', gain: 0.26, transpose: -24, pattern: ['1...1...5...5...'] },
    { name: 'lead', threshold: 0.2, wave: 'square', gain: 0.17, pattern: ['5...3...1...2...', '3...5...6...5...'] },
  ],
}

export const TRACKS: Record<string, MusicTrack> = {
  overworld,
  boss,
  map,
  title,
  // Biome variants reuse the overworld shape with a different root and scale.
  desert: { ...overworld, root: 246.94, scale: MINOR, progression: [1, 7, 6, 5] },
  sky: { ...overworld, bpm: 118, root: 329.63, progression: [1, 4, 5, 4] },
  ghost: { ...boss, bpm: 108, root: 174.61, progression: [1, 2, 1, 7] },
  wano: { ...overworld, bpm: 126, root: 293.66, scale: MINOR, progression: [1, 6, 3, 7] },
}

export class MusicPlayer {
  private track: MusicTrack | null = null
  private trackName = ''
  private step = 0
  private nextTime = 0
  private timer: number | null = null
  private intensity = 0.5
  private out: GainNode
  private stopping = false

  constructor(private ctx: AudioContext, dest: GainNode) {
    this.out = ctx.createGain()
    this.out.gain.value = 0
    this.out.connect(dest)
  }

  play(name: string, fade = 0.6, intensity = 0.5): void {
    const track = TRACKS[name]
    if (!track) return
    if (this.trackName === name && this.timer !== null) {
      this.setIntensity(intensity)
      return
    }
    this.trackName = name
    this.track = track
    this.intensity = intensity
    this.step = 0
    this.stopping = false
    this.nextTime = this.ctx.currentTime + 0.06
    this.out.gain.cancelScheduledValues(this.ctx.currentTime)
    this.out.gain.setValueAtTime(Math.max(0.0001, this.out.gain.value), this.ctx.currentTime)
    this.out.gain.linearRampToValueAtTime(1, this.ctx.currentTime + fade)
    if (this.timer === null) {
      this.timer = window.setInterval(() => this.schedule(), 25)
    }
  }

  stop(fade = 0.5): void {
    if (!this.track) return
    this.stopping = true
    this.out.gain.cancelScheduledValues(this.ctx.currentTime)
    this.out.gain.setValueAtTime(this.out.gain.value, this.ctx.currentTime)
    this.out.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + fade)
    window.setTimeout(() => {
      if (!this.stopping) return
      if (this.timer !== null) {
        clearInterval(this.timer)
        this.timer = null
      }
      this.track = null
      this.trackName = ''
    }, fade * 1000 + 60)
  }

  setIntensity(v: number): void {
    this.intensity = Math.max(0, Math.min(1, v))
  }

  /** Schedule any steps falling inside the lookahead window. */
  private schedule(): void {
    const track = this.track
    if (!track) return
    const stepDur = 60 / track.bpm / (track.steps / 4)
    const lookahead = 0.12
    while (this.nextTime < this.ctx.currentTime + lookahead) {
      this.playStep(track, this.step, this.nextTime, stepDur)
      const swing = track.swing && this.step % 2 === 1 ? stepDur * track.swing : 0
      this.nextTime += stepDur + swing
      this.step++
    }
  }

  private playStep(track: MusicTrack, step: number, at: number, stepDur: number): void {
    const stepInBar = step % track.steps
    const bar = Math.floor(step / track.steps)
    const chordRoot = track.progression[bar % track.progression.length]

    for (const layer of track.layers) {
      if (this.intensity < layer.threshold) continue
      const pattern = layer.pattern[bar % layer.pattern.length]
      const ch = pattern[stepInBar]
      if (!ch || ch === '.' || ch === '-') continue
      const degree = Number(ch)
      if (Number.isNaN(degree)) continue

      // Scale degree, offset by the bar's chord root, wrapped into octaves.
      const idx = degree - 1 + (chordRoot - 1)
      const octave = Math.floor(idx / track.scale.length)
      const semis = track.scale[((idx % track.scale.length) + track.scale.length) % track.scale.length]
      const freq = track.root * Math.pow(2, (semis + octave * 12 + (layer.transpose ?? 0)) / 12)

      const osc = this.ctx.createOscillator()
      osc.type = layer.wave
      osc.frequency.value = freq
      const g = this.ctx.createGain()
      const peak = layer.gain
      const dur = stepDur * 1.7
      g.gain.setValueAtTime(0.0001, at)
      g.gain.exponentialRampToValueAtTime(peak, at + (layer.attack ?? 0.008))
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur)

      let node: AudioNode = g
      if (layer.filter) {
        const f = this.ctx.createBiquadFilter()
        f.type = 'lowpass'
        f.frequency.value = layer.filter
        g.connect(f)
        node = f
      }
      node.connect(this.out)
      osc.connect(g)
      osc.start(at)
      osc.stop(at + dur + 0.02)
    }
  }
}
