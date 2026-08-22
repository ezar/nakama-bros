/**
 * Composition — the pure half of the music system.
 *
 * `composeBar` turns a track plus a bar number plus the current intensity into
 * a flat list of notes with absolute times inside that bar. It touches no audio
 * API at all, which is what lets the player schedule bars far ahead of the
 * clock, and lets tests (and the offline inspection harness) render a whole
 * piece without a speaker anywhere in sight.
 */
import type { PatchId } from './patches'
import type { DrumId } from './synth'
import {
  chordTone, hash01, laneSteps, lineBars, midiToFreq, parseDrums, parseNotes,
  type Chord, type ParsedNote,
} from './theory'

interface PartCommon {
  /** Debug/inspection label. */
  name: string
  patch: PatchId
  gain?: number
  /** Lowest intensity at which this layer plays. */
  from?: number
  /** Highest intensity — calm layers step aside when things get loud. */
  to?: number
  pan?: number
  /** Octave offset. */
  oct?: number
  /** One character per bar of the form: `1` plays, anything else rests. */
  mask?: string
  /** Note length as a fraction of the written value. */
  legato?: number
}

/** A written line, in the note notation of `theory.ts`. */
export interface MelPart extends PartCommon {
  kind: 'mel'
  line: string
}

/** An arpeggio generated from the bar's chord — indices are chord tones. */
export interface ArpPart extends PartCommon {
  kind: 'arp'
  /** Chord tone indices; `REST` for a gap. */
  tones: number[]
  /** Length of every step, in beats. */
  len: number
}

/** Held or stabbed chords generated from the bar's chord. */
export interface ChordPart extends PartCommon {
  kind: 'chord'
  hits: { at: number; len: number; tones: number[] }[]
  /** Stereo width the voicing is spread over. */
  spread?: number
}

export interface DrumPart {
  kind: 'drum'
  name: string
  drum: DrumId
  /** One character per step: `X` accent, `x` hit, `o` ghost. */
  lane: string
  /** Steps per beat. */
  div: number
  gain?: number
  from?: number
  to?: number
  pan?: number
  /** Pitch multiplier. */
  tune?: number
  mask?: string
  /** Skip the swing offset (kick lanes usually stay straight). */
  straight?: boolean
}

export type Part = MelPart | ArpPart | ChordPart | DrumPart

/** Sentinel for a rest inside an arpeggio. */
export const REST = -99

export interface MusicTrack {
  /** Shown nowhere — it is here so the tracks read like a track list. */
  title: string
  /** Beats per minute, counted in the track's own beat (see `beatsPerBar`). */
  bpm: number
  beatsPerBar: number
  /** 0..0.34 — delays every off-beat eighth, the difference between a march and a lilt. */
  swing?: number
  /** One chord per bar; shorter arrays loop. */
  chords: Chord[]
  parts: Part[]
  /** Bars in the form. Defaults to the longest part. */
  bars?: number
  /** Reverb send level for the whole track. */
  reverb?: number
  /**
   * Level trim. Set by ear (well — by measuring the offline render) so every
   * track lands at about the same loudness and the boss theme does not blow
   * the doors off the shanty.
   */
  gain?: number
  /** Cues (the victory fanfare) play once and stop instead of looping. */
  once?: boolean
}

export interface ScheduledNote {
  /** Seconds from the start of the bar. */
  t: number
  /** Seconds the note is held (before its release tail). */
  dur: number
  freq: number
  /** Kept for the piano-roll inspector; drums report 0. */
  midi: number
  vel: number
  pan: number
  gain: number
  patch?: PatchId
  drum?: DrumId
  /** Pitch multiplier for drum voices. */
  tune?: number
  part: string
}

const noteCache = new Map<string, ParsedNote[]>()
function notesOf(line: string): ParsedNote[] {
  let n = noteCache.get(line)
  if (!n) {
    n = parseNotes(line)
    noteCache.set(line, n)
  }
  return n
}

function maskAt(mask: string | undefined, bar: number): boolean {
  if (!mask) return true
  const clean = mask.replace(/[\s|]/g, '')
  if (clean.length === 0) return true
  return clean[bar % clean.length] === '1'
}

function active(part: { from?: number; to?: number; mask?: string }, bar: number, intensity: number): boolean {
  if (intensity < (part.from ?? 0)) return false
  if (intensity > (part.to ?? 1.01)) return false
  return maskAt(part.mask, bar)
}

/** Seconds per bar. */
export function barSeconds(track: MusicTrack): number {
  return (track.beatsPerBar * 60) / track.bpm
}

/** Length of the form in bars. */
export function trackBars(track: MusicTrack): number {
  if (track.bars) return track.bars
  let bars = track.chords.length
  for (const p of track.parts) {
    if (p.kind === 'mel') bars = Math.max(bars, lineBars(notesOf(p.line), track.beatsPerBar))
  }
  return Math.max(1, bars)
}

/** Delay off-beat eighths so a straight grid breathes. */
function swung(beat: number, swing: number): number {
  if (!swing) return beat
  const frac = beat - Math.floor(beat)
  return Math.abs(frac - 0.5) < 1e-6 ? beat + swing * 0.5 : beat
}

/**
 * Every note of one bar, with times in seconds from the bar's downbeat.
 *
 * `intensity` is sampled once per bar by the player, so layers can only come
 * and go on bar lines — never in the middle of a phrase.
 */
export function composeBar(track: MusicTrack, bar: number, intensity: number): ScheduledNote[] {
  const spb = 60 / track.bpm
  const swing = track.swing ?? 0
  const chord = track.chords[bar % track.chords.length]
  const out: ScheduledNote[] = []
  let seed = 0

  for (const part of track.parts) {
    seed++
    if (!active(part, bar, intensity)) continue

    if (part.kind === 'drum') {
      const hits = parseDrums(part.lane, part.div)
      const laneBars = Math.max(1, Math.round(laneSteps(part.lane) / (part.div * track.beatsPerBar)))
      const offset = (bar % laneBars) * track.beatsPerBar
      for (let i = 0; i < hits.length; i++) {
        const h = hits[i]
        const local = h.beat - offset
        if (local < -1e-6 || local >= track.beatsPerBar - 1e-6) continue
        const jitter = (hash01(bar * 71 + seed, i) - 0.5) * 0.006
        const beat = part.straight ? local : swung(local, swing)
        out.push({
          t: beat * spb + jitter,
          dur: 0.05,
          freq: 0,
          midi: 0,
          vel: h.vel * (0.93 + 0.14 * hash01(bar + seed * 13, i + 7)),
          pan: part.pan ?? 0,
          gain: part.gain ?? 1,
          drum: part.drum,
          tune: (part.tune ?? 1) * (0.985 + 0.03 * hash01(bar * 17 + seed, i * 3)),
          part: part.name,
        })
      }
      continue
    }

    const oct = part.oct ?? 0
    const legato = part.legato ?? 0.92
    const push = (beat: number, len: number, midi: number, vel: number, i: number, panBias = 0) => {
      const jitter = (hash01(bar * 97 + seed, i) - 0.5) * 0.007
      out.push({
        t: swung(beat, swing) * spb + jitter,
        dur: Math.max(0.03, len * spb * legato),
        freq: midiToFreq(midi + oct * 12),
        midi: midi + oct * 12,
        vel: Math.min(1, vel * (0.94 + 0.12 * hash01(bar + seed * 31, i))),
        pan: Math.max(-1, Math.min(1, (part.pan ?? 0) + panBias)),
        gain: part.gain ?? 1,
        patch: part.patch,
        part: part.name,
      })
    }

    if (part.kind === 'mel') {
      const notes = notesOf(part.line)
      const lineLen = lineBars(notes, track.beatsPerBar)
      const from = (bar % lineLen) * track.beatsPerBar
      for (let i = 0; i < notes.length; i++) {
        const n = notes[i]
        const local = n.beat - from
        if (local < -1e-6 || local >= track.beatsPerBar - 1e-6) continue
        push(local, n.len, n.midi, n.vel, i)
      }
    } else if (part.kind === 'arp') {
      for (let i = 0; i < part.tones.length; i++) {
        const beat = i * part.len
        if (beat >= track.beatsPerBar - 1e-6) break
        const tone = part.tones[i]
        if (tone === REST) continue
        // Downbeats lean louder; that is most of what makes a bass line groove.
        const vel = beat % 1 < 1e-6 ? 0.92 : 0.7
        push(beat, part.len, chordTone(chord, tone), vel, i)
      }
    } else {
      const spread = part.spread ?? 0
      for (let i = 0; i < part.hits.length; i++) {
        const hit = part.hits[i]
        for (let j = 0; j < hit.tones.length; j++) {
          const bias = hit.tones.length > 1 ? ((j / (hit.tones.length - 1)) * 2 - 1) * spread : 0
          push(hit.at, hit.len, chordTone(chord, hit.tones[j]), i === 0 ? 0.86 : 0.72, i * 8 + j, bias)
        }
      }
    }
  }

  out.sort((a, b) => a.t - b.t)
  return out
}
