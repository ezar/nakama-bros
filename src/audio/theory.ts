/**
 * Note names, chords and the little text notation the tracks are written in.
 *
 * Melodies live as strings ("d4:.5 e4 f#4 a4:1.5") rather than step grids
 * because a shanty in 6/8 and a waltz need note *lengths*, not a fixed comb of
 * sixteenths — and because a line you can read is a line you can edit until it
 * actually sings.
 */

/** Semitone offset of each letter inside an octave. */
const LETTER: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }

/** MIDI note number → Hz, A4 (69) = 440. */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

/** "c#4" / "bb3" / "a4" → MIDI number. Returns NaN for anything unparseable. */
export function noteToMidi(name: string): number {
  const m = /^([a-g])([#b]?)(-?\d)$/.exec(name.toLowerCase())
  if (!m) return NaN
  const semis = LETTER[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0)
  return (Number(m[3]) + 1) * 12 + semis
}

export interface ParsedNote {
  /** Position in beats from the start of the line. */
  beat: number
  /** Length in beats. */
  len: number
  midi: number
  /** 0..1. */
  vel: number
}

const VEL_NORMAL = 0.78
const VEL_ACCENT = 1
const VEL_GHOST = 0.46

/**
 * Parse a melody line.
 *
 * Tokens are whitespace separated; `|` is a bar line and is ignored (it is
 * there so a line can be proof-read). A token is one or more pitches joined by
 * `+` (a chord), an `r` rest, or `~` to extend the previous token.
 *
 * Suffixes: `:len` sets the length in beats and is sticky until changed
 * (`:1/3` is allowed for triplets), `!` accents, `,` softens to a ghost note.
 */
export function parseNotes(src: string): ParsedNote[] {
  const out: ParsedNote[] = []
  let beat = 0
  let len = 1
  let lastCount = 0

  for (const raw of src.split(/\s+/)) {
    if (!raw || raw === '|') continue
    let tok = raw
    const colon = tok.indexOf(':')
    if (colon >= 0) {
      const spec = tok.slice(colon + 1)
      tok = tok.slice(0, colon)
      const slash = spec.indexOf('/')
      len = slash >= 0 ? Number(spec.slice(0, slash)) / Number(spec.slice(slash + 1)) : Number(spec)
      if (!Number.isFinite(len) || len <= 0) len = 1
    }
    let vel = VEL_NORMAL
    while (tok.endsWith('!') || tok.endsWith(',')) {
      vel = tok.endsWith('!') ? VEL_ACCENT : VEL_GHOST
      tok = tok.slice(0, -1)
    }

    if (tok === '~') {
      // Tie: lengthen the notes of the previous token instead of retriggering.
      for (let i = out.length - lastCount; i < out.length; i++) out[i].len += len
      beat += len
      continue
    }
    if (tok === 'r' || tok === '') {
      beat += len
      lastCount = 0
      continue
    }

    const pitches = tok.split('+')
    lastCount = 0
    for (const p of pitches) {
      const midi = noteToMidi(p)
      if (Number.isNaN(midi)) continue
      out.push({ beat, len, midi, vel })
      lastCount++
    }
    beat += len
  }
  return out
}

/** Total length of a parsed line, rounded up to whole bars. */
export function lineBars(notes: ParsedNote[], beatsPerBar: number): number {
  let end = 0
  for (const n of notes) end = Math.max(end, n.beat + n.len)
  return Math.max(1, Math.round(Math.ceil(end / beatsPerBar - 0.001)))
}

export interface DrumHit {
  beat: number
  vel: number
}

/**
 * Parse one drum lane. One character per step: `X` accent, `x` hit, `o` ghost,
 * anything else a rest. `|` is ignored so bars can be spaced out.
 */
export function parseDrums(lane: string, stepsPerBeat: number): DrumHit[] {
  const out: DrumHit[] = []
  let step = 0
  for (const ch of lane) {
    if (ch === '|' || ch === ' ') continue
    if (ch === 'X') out.push({ beat: step / stepsPerBeat, vel: 1 })
    else if (ch === 'x') out.push({ beat: step / stepsPerBeat, vel: 0.72 })
    else if (ch === 'o') out.push({ beat: step / stepsPerBeat, vel: 0.36 })
    step++
  }
  return out
}

/** Number of steps in a drum lane, ignoring bar lines. */
export function laneSteps(lane: string): number {
  let n = 0
  for (const ch of lane) if (ch !== '|' && ch !== ' ') n++
  return n
}

export type ChordQuality = 'maj' | 'min' | 'dom7' | 'min7' | 'maj7' | 'dim' | 'aug' | 'sus4' | 'sus2' | 'five'

/** Chord tones as semitone offsets from the root, low to high. */
const QUALITY: Record<ChordQuality, number[]> = {
  maj: [0, 4, 7, 12],
  min: [0, 3, 7, 12],
  dom7: [0, 4, 7, 10],
  min7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  dim: [0, 3, 6, 9],
  aug: [0, 4, 8, 12],
  sus4: [0, 5, 7, 12],
  sus2: [0, 2, 7, 12],
  five: [0, 7, 12, 19],
}

export interface Chord {
  /** Root as a MIDI number (any octave — parts transpose it themselves). */
  root: number
  quality: ChordQuality
}

/** `ch('d3', 'min7')` — chords are written by name for readability. */
export function ch(root: string, quality: ChordQuality = 'maj'): Chord {
  return { root: noteToMidi(root), quality }
}

/**
 * Nth tone of a chord, wrapping into higher octaves so `tone(c, 5)` keeps
 * climbing instead of clamping — that is what makes arpeggio parts roll.
 */
export function chordTone(chord: Chord, index: number): number {
  const tones = QUALITY[chord.quality]
  const oct = Math.floor(index / tones.length)
  const i = ((index % tones.length) + tones.length) % tones.length
  return chord.root + tones[i] + oct * 12
}

/** Deterministic 0..1 hash — humanising must not change between two renders. */
export function hash01(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
