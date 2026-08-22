/**
 * The soundtrack.
 *
 * One piece per island, each 32 bars with a real form: an A section, a varied
 * A', a B section that moves harmonically, and a bridge that thins out before
 * the loop comes back around. Melodies are written by hand so they have a
 * contour and a place to breathe — phrase endings land on long notes, and the
 * layers that enter with intensity are counter-lines, not louder copies.
 */
import { REST, type ArpPart, type ChordPart, type DrumPart, type MelPart, type MusicTrack } from './compose'
import { ch, type Chord } from './theory'

/** Join bars into one line — the `|` is only there so a line can be proof-read. */
const line = (...b: string[]): string => b.join(' | ')

/** Repeat a chord for `n` bars. */
const hold = (c: Chord, n: number): Chord[] => Array.from({ length: n }, () => c)

// ─────────────────────────────────────────────────────────────────────────────
// East Blue — "Vientos del East Blue". 6/8 sea shanty, D major.
// Three lilting beats to the bar, a bass that rolls root–fifth–octave under
// every one of them, and a reed lead that keeps climbing back to the horizon.
// ─────────────────────────────────────────────────────────────────────────────

const shantyLead = line(
  'd4:.5 e4 f#4 a4:1.5',
  'b4:.5 a4 f#4 e4:1.5',
  'd4:.5 e4 f#4 g4 a4 b4',
  'a4:3',
  'f#4:.5 g4 a4 d5:1.5',
  'c#5:.5 b4 a4 g4:1.5',
  'f#4:.5 e4 d4 e4 f#4 g4',
  'e4:2 r:1',
  // A' — the same shape, ornamented, and it reaches a step higher.
  'd4:.5 e4 f#4 a4:1 b4:.5',
  'a4:.5 f#4 e4 f#4:1.5',
  'g4:.5 f#4 g4 a4 b4 c#5',
  'd5:2 c#5:.5 b4:.5',
  'a4:.5 b4 c#5 d5:1.5',
  'b4:.5 a4 f#4 a4:1.5',
  'g4:.5 f#4 e4 f#4 g4 a4',
  'd4:3',
  // B — over to the relative minor, the storm section.
  'b4:1 a4:.5 b4:1.5',
  'd5:1 c#5:.5 b4:1.5',
  'a4:.5 b4 c#5 d5:1.5',
  'e5:3',
  'd5:.5 c#5 b4 a4:1.5',
  'g4:1 f#4:.5 e4:1.5',
  'f#4:.5 g4 a4 b4 c#5 d5',
  'c#5:2 r:1',
  // Bridge — the lead sits out four bars, then takes the last word.
  'r:3', 'r:3', 'r:3', 'r:3',
  'a4:.5 b4 c#5 d5:1.5',
  'e5:1 d5:.5 c#5:1.5',
  'b4:.5 c#5 d5 e5 f#5 e5',
  'd5:3',
)

const shantyCounter = line(
  'r:3', 'r:3', 'r:3', 'r:3', 'r:3', 'r:3', 'r:3', 'r:3',
  'f#4:1.5 a4:1.5', 'e4:3', 'b3:1.5 d4:1.5', 'f#4:3',
  'e4:1.5 g4:1.5', 'd4:3', 'b3:1.5 c#4:1.5', 'd4:3',
  'd4:1.5 f#4:1.5', 'a4:3', 'g4:1.5 b4:1.5', 'f#4:3',
  'e4:1.5 g4:1.5', 'd4:3', 'c#4:1.5 e4:1.5', 'a4:3',
  'b3:3', 'a3:3', 'g3:1.5 b3:1.5', 'c#4:3',
  'd4:1.5 b3:1.5', 'c#4:3', 'd4:1.5 f#4:1.5', 'e4:3',
)

const eastBlue: MusicTrack = {
  title: 'Vientos del East Blue',
  bpm: 138,
  beatsPerBar: 3,
  reverb: 0.9,
  gain: 1.15,
  chords: [
    ch('d3'), ch('a2'), ch('g2'), ch('d3'), ch('g2'), ch('a2'), ch('d3'), ch('a2'),
    ch('d3'), ch('a2'), ch('g2'), ch('d3'), ch('a2'), ch('b2', 'min'), ch('g2'), ch('d3'),
    ch('b2', 'min'), ch('f#2', 'min'), ch('g2'), ch('d3'), ch('e3', 'min'), ch('b2', 'min'), ch('a2'), ch('a2', 'dom7'),
    ch('g2'), ch('d3'), ch('e3', 'min'), ch('a2'), ch('g2'), ch('a2'), ch('b2', 'min'), ch('a2', 'sus4'),
  ],
  parts: [
    { kind: 'arp', name: 'bass', patch: 'bass', tones: [0, 2, 3, 2, 1, 2], len: 0.5, oct: -1, gain: 1, legato: 0.9 } as ArpPart,
    { kind: 'mel', name: 'lead', patch: 'reed', line: shantyLead, from: 0.18, pan: -0.1 } as MelPart,
    {
      kind: 'chord', name: 'squeeze', patch: 'squeeze', from: 0.45, spread: 0.5, legato: 0.8,
      hits: [{ at: 0, len: 1.4, tones: [1, 2, 3] }, { at: 1.5, len: 1.4, tones: [2, 3, 4] }],
    } as ChordPart,
    { kind: 'mel', name: 'counter', patch: 'squeeze', line: shantyCounter, from: 0.62, pan: 0.42, gain: 0.85 } as MelPart,
    { kind: 'drum', name: 'kick', drum: 'kick', div: 2, straight: true, lane: 'x--x-- x--x-o' } as DrumPart,
    { kind: 'drum', name: 'rim', drum: 'rim', div: 2, from: 0.3, pan: 0.3, lane: '---x-- ---x-x' } as DrumPart,
    { kind: 'drum', name: 'shaker', drum: 'shaker', div: 2, from: 0.5, pan: -0.35, lane: 'Xooxoo Xooxox' } as DrumPart,
    { kind: 'drum', name: 'hat', drum: 'hat', div: 2, from: 0.75, pan: 0.18, lane: 'xoxxox xoxxoo' } as DrumPart,
    { kind: 'drum', name: 'crash', drum: 'crash', div: 2, from: 0.5, gain: 0.7, mask: '10000000 10000000 10000000 10000000', lane: 'X-----' } as DrumPart,
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// Alabasta — "Arenas de Alabasta". Phrygian dominant over a fixed drone.
// The harmony never moves; the colour comes from the flattened second and the
// raised third rubbing against the drone.
// ─────────────────────────────────────────────────────────────────────────────

const desertLead = line(
  'd4:1 eb4:.5 f#4:.5 g4:1 f#4:1',
  'eb4:1.5 d4:2.5',
  'd4:.5 eb4 f#4 g4 a4:2',
  'g4:1 f#4:.5 eb4:.5 d4:2',
  'a4:1 bb4:.5 a4:.5 g4:1 f#4:1',
  'g4:2 a4:2',
  'bb4:.5 a4 g4 f#4 eb4:1 d4:1',
  'd4:4',
  // A' — an octave of the same idea, then it slides back down.
  'd5:1 c5:.5 bb4:.5 a4:1 g4:1',
  'f#4:1.5 g4:.5 a4:2',
  'a4:.5 bb4 c5 d5 c5:1 bb4:1',
  'a4:2 g4:2',
  'f#4:.5 g4:.5 a4:1 bb4:1 a4:1',
  'g4:1 f#4:1 eb4:2',
  'd4:.5 eb4 f#4 g4 a4 bb4 c5:1',
  'd5:3 r:1',
  // B — the low reed answers from the other side of the dunes.
  'a3:2 bb3:1 c4:1',
  'd4:2 c4:1 bb3:1',
  'a3:1 g3:1 f#3:2',
  'g3:4',
  'a3:2 c4:1 d4:1',
  'eb4:2 d4:2',
  'c4:1 bb3:1 a3:1 g3:1',
  'a3:4',
  // Bridge — sandstorm: almost nothing, then long calls.
  'r:4',
  'd5:2 c5:2',
  'bb4:2 a4:2',
  'g4:4',
  'a4:1 bb4:1 c5:2',
  'd5:2 eb5:2',
  'd5:1 c5:1 bb4:1 a4:1',
  'a4:3 r:1',
)

const alabasta: MusicTrack = {
  title: 'Arenas de Alabasta',
  bpm: 104,
  beatsPerBar: 4,
  swing: 0.06,
  reverb: 1.15,
  gain: 1.2,
  chords: [
    ...hold(ch('d2', 'five'), 8),
    ...hold(ch('d2', 'five'), 4), ...hold(ch('bb1'), 2), ...hold(ch('d2', 'five'), 2),
    ...hold(ch('d2', 'five'), 4), ...hold(ch('g2', 'min'), 2), ...hold(ch('d2', 'five'), 2),
    ...hold(ch('bb1'), 2), ...hold(ch('c2'), 2), ...hold(ch('d2', 'five'), 4),
  ],
  parts: [
    { kind: 'chord', name: 'drone', patch: 'drone', spread: 0.7, legato: 1, hits: [{ at: 0, len: 4, tones: [0, 2, 3] }] } as ChordPart,
    { kind: 'arp', name: 'bass', patch: 'bass', tones: [0, REST, 0, 1, REST, 0, 1, REST], len: 0.5, oct: 0, from: 0.2 } as ArpPart,
    {
      kind: 'mel', name: 'lead', patch: 'zurna', line: desertLead, from: 0.15, pan: -0.15,
      mask: '11111111 11111111 00000000 11111111',
    } as MelPart,
    {
      kind: 'mel', name: 'answer', patch: 'duduk', line: desertLead, from: 0.15, pan: 0.2, oct: 0,
      mask: '00000000 00000000 11111111 00000000',
    } as MelPart,
    { kind: 'drum', name: 'dum', drum: 'kick', div: 4, straight: true, from: 0.25, lane: 'X--x--o-X---x---' } as DrumPart,
    { kind: 'drum', name: 'tek', drum: 'rim', div: 4, from: 0.4, pan: 0.35, lane: '--x-x--x--x-x-xo' } as DrumPart,
    { kind: 'drum', name: 'shaker', drum: 'shaker', div: 4, from: 0.55, pan: -0.4, lane: 'oxoXoxoxoxoXoxox' } as DrumPart,
    { kind: 'drum', name: 'frame', drum: 'tom', div: 4, from: 0.7, gain: 0.6, pan: 0.15, mask: '00010001', lane: '--------x-x-x-x-' } as DrumPart,
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// Skypiea — "Vals de las Nubes". 3/4, G lydian-tinged, bells and glass.
// ─────────────────────────────────────────────────────────────────────────────

const skyLead = line(
  'g4:1 b4 d5', 'g5:2 f#5:1', 'e5:1 d5 b4', 'a4:3',
  'a4:1 c5 e5', 'a5:2 g5:1', 'f#5:1 e5 d5', 'b4:3',
  'd5:1 g5 b5', 'a5:2 g5:1', 'f#5:1 g5 a5', 'd5:3',
  'e5:1 f#5 g5', 'c#5:2 e5:1', 'd5:1 c#5 b4', 'g4:3',
  // B — up into the thermals.
  'b5:1 a5 g5', 'e5:2 g5:1', 'a5:1 g5 f#5', 'd5:3',
  'g5:1 f#5 e5', 'c#5:2 d5:1', 'e5:1 f#5 g5', 'a5:3',
  // Bridge — bells alone, drifting down.
  'b5:2 a5:1', 'g5:3', 'e5:2 d5:1', 'b4:3',
  'c5:1 d5 e5', 'g5:3', 'f#5:1 e5 d5', 'b4:3',
)

const skypiea: MusicTrack = {
  title: 'Vals de las Nubes',
  bpm: 168,
  beatsPerBar: 3,
  reverb: 1.35,
  gain: 1.15,
  chords: [
    ch('g2'), ch('e2', 'min'), ch('c2', 'maj7'), ch('d2'), ch('g2'), ch('b2', 'min'), ch('a2', 'min7'), ch('d2'),
    ch('g2'), ch('d2'), ch('c2', 'maj7'), ch('g2'), ch('a2', 'min7'), ch('a2'), ch('d2', 'sus4'), ch('g2'),
    ch('e2', 'min'), ch('c2', 'maj7'), ch('d2'), ch('b2', 'min'), ch('c2', 'maj7'), ch('a2'), ch('d2'), ch('d2', 'dom7'),
    ch('g2'), ch('e2', 'min'), ch('c2', 'maj7'), ch('g2'), ch('a2', 'min7'), ch('c2'), ch('d2', 'sus4'), ch('g2'),
  ],
  parts: [
    { kind: 'arp', name: 'bass', patch: 'bass', tones: [0, REST, REST], len: 1, oct: 0, legato: 1.6 } as ArpPart,
    {
      kind: 'chord', name: 'oompah', patch: 'airPad', from: 0.25, spread: 0.6, legato: 0.7,
      hits: [{ at: 1, len: 1, tones: [1, 2, 3] }, { at: 2, len: 1, tones: [2, 3, 4] }],
    } as ChordPart,
    { kind: 'mel', name: 'lead', patch: 'glass', line: skyLead, from: 0.15, pan: -0.12 } as MelPart,
    { kind: 'mel', name: 'bells', patch: 'bell', line: skyLead, from: 0.62, pan: 0.4, gain: 0.55, mask: '10101010' } as MelPart,
    { kind: 'chord', name: 'pad', patch: 'airPad', from: 0.5, gain: 0.7, spread: 0.9, legato: 1, hits: [{ at: 0, len: 3, tones: [2, 4, 5] }] } as ChordPart,
    { kind: 'drum', name: 'pulse', drum: 'kick', div: 2, straight: true, from: 0.35, gain: 0.6, lane: 'X-----' } as DrumPart,
    { kind: 'drum', name: 'brush', drum: 'shaker', div: 2, from: 0.45, pan: 0.3, gain: 0.7, lane: 'o-x-x-' } as DrumPart,
    { kind: 'drum', name: 'chime', drum: 'bellhit', div: 2, from: 0.7, pan: -0.45, gain: 0.6, mask: '10001000', lane: 'X-----' } as DrumPart,
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// Water 7 — "La Marcha del Tren Marino". C minor march with steam stabs.
// ─────────────────────────────────────────────────────────────────────────────

const marchLead = line(
  'g3:.5 g3:.5 c4:.75 c4:.25 eb4:1 c4:1',
  'd4:1 eb4:1 f4:1.5 d4:.5',
  'eb4:.75 eb4:.25 g4:1 f4:1 eb4:1',
  'd4:2 g3:2',
  'c4:.5 c4:.5 eb4:.75 f4:.25 g4:1 ab4:1',
  'g4:1 f4:1 eb4:2',
  'f4:.75 f4:.25 ab4:1 g4:1 f4:1',
  'eb4:2 r:2',
  // A' — same march, a fourth higher, harder.
  'c5:.5 c5:.5 bb4:.75 ab4:.25 g4:1 eb4:1',
  'f4:1 g4:1 ab4:1.5 f4:.5',
  'g4:.75 g4:.25 c5:1 bb4:1 ab4:1',
  'g4:2 d4:2',
  'eb4:.5 f4:.5 g4:.75 ab4:.25 bb4:1 c5:1',
  'bb4:1 ab4:1 g4:2',
  'ab4:.75 g4:.25 f4:1 eb4:1 d4:1',
  'c4:3 r:1',
  // B — the train pulls out into the sun: Eb major.
  'eb4:1 g4:1 bb4:2',
  'ab4:1 g4:1 f4:2',
  'g4:.5 ab4:.5 bb4:1 c5:2',
  'bb4:3 r:1',
  'bb4:1 c5:1 d5:2',
  'eb5:2 bb4:2',
  'c5:.5 bb4:.5 ab4:1 g4:1 f4:1',
  'g4:4',
  // Bridge — machinery only, then the theme comes back at full height.
  'r:4', 'r:4', 'r:4', 'r:4',
  'c5:.5 c5:.5 eb5:1 d5:1 c5:1',
  'bb4:1 ab4:1 g4:2',
  'f4:.75 f4:.25 ab4:1 g4:1 f4:1',
  'c4:4',
)

const steamStabs = line(
  'r:4', 'r:4', 'r:4', 'c5:.5 r:.5 c5:1 r:2',
  'r:4', 'r:4', 'r:4', 'g4:.5 r:.5 g4:1.5 r:1.5',
  'r:4', 'r:4', 'r:4', 'eb5:.5 r:.5 eb5:1 r:2',
  'r:4', 'r:4', 'r:4', 'c5:2 r:2',
  'r:4', 'r:4', 'r:4', 'bb4:1.5 r:2.5',
  'r:4', 'r:4', 'r:4', 'eb5:2 r:2',
  'c5:1 r:1 c5:1 r:1', 'g4:1 r:1 g4:1 r:1', 'ab4:1 r:1 c5:1 r:1', 'g4:2 r:2',
  'r:4', 'r:4', 'r:4', 'c5:3 r:1',
)

const water7: MusicTrack = {
  title: 'La Marcha del Tren Marino',
  bpm: 128,
  beatsPerBar: 4,
  reverb: 0.8,
  gain: 0.72,
  chords: [
    ch('c2', 'min'), ch('g1', 'min'), ch('eb2'), ch('g1'), ch('c2', 'min'), ch('ab1'), ch('f1', 'min'), ch('g1', 'dom7'),
    ch('c2', 'min'), ch('f1', 'min'), ch('ab1'), ch('g1', 'dom7'), ch('eb2'), ch('ab1'), ch('bb1'), ch('c2', 'min'),
    ch('eb2'), ch('ab1'), ch('bb1'), ch('eb2'), ch('bb1'), ch('eb2'), ch('f1', 'min7'), ch('g1', 'dom7'),
    ch('c2', 'min'), ch('c2', 'min'), ch('ab1'), ch('g1', 'dom7'), ch('c2', 'min'), ch('ab1'), ch('bb1'), ch('c2', 'min'),
  ],
  parts: [
    { kind: 'arp', name: 'bass', patch: 'bass', tones: [0, REST, 2, REST, 0, REST, 2, 1], len: 0.5, oct: 0 } as ArpPart,
    { kind: 'mel', name: 'lead', patch: 'brass', line: marchLead, from: 0.15, pan: -0.15 } as MelPart,
    {
      kind: 'chord', name: 'stabs', patch: 'brass', from: 0.45, gain: 0.6, spread: 0.55, legato: 0.45, pan: 0.3,
      hits: [{ at: 0.5, len: 0.5, tones: [1, 2, 3] }, { at: 1.5, len: 0.5, tones: [1, 2, 3] }, { at: 2.5, len: 0.5, tones: [1, 2, 3] }, { at: 3.5, len: 0.5, tones: [1, 2, 3] }],
    } as ChordPart,
    { kind: 'mel', name: 'whistle', patch: 'whistle', line: steamStabs, from: 0.55, pan: 0.5 } as MelPart,
    { kind: 'drum', name: 'kick', drum: 'kick', div: 4, straight: true, lane: 'X---o---X---o---' } as DrumPart,
    { kind: 'drum', name: 'snare', drum: 'snare', div: 4, from: 0.25, lane: '----X-o-----X-xo ----X-o---oxXxox' } as DrumPart,
    { kind: 'drum', name: 'rivets', drum: 'click', div: 4, from: 0.4, pan: 0.45, lane: '--x---x---x---x-' } as DrumPart,
    { kind: 'drum', name: 'piston', drum: 'tom', div: 4, from: 0.6, gain: 0.55, pan: -0.4, lane: 'o-------x-------' } as DrumPart,
    { kind: 'drum', name: 'hat', drum: 'hat', div: 4, from: 0.7, pan: 0.2, lane: 'x-x-x-x-x-x-x-x-' } as DrumPart,
    { kind: 'drum', name: 'crash', drum: 'crash', div: 4, from: 0.5, gain: 0.65, mask: '10000000 00000000 10000000 00000000', lane: 'X---------------' } as DrumPart,
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// Thriller Bark — "El Vals del Espectro". A minor waltz that keeps sliding
// chromatically out from under itself. Music box on top, cold organ beneath.
// ─────────────────────────────────────────────────────────────────────────────

const ghostLead = line(
  'a4:1 b4 c5', 'e5:2 d#5:1', 'e5:1 d5 c5', 'b4:3',
  'b4:1 c5 d5', 'f5:2 e5:1', 'd5:1 c#5 c5', 'b4:2 r:1',
  'a4:1 c5 e5', 'a5:2 g#5:1', 'g5:1 f#5 f5', 'e5:3',
  'e5:1 f5 g#5', 'a5:2 e5:1', 'd5:1 c5 b4', 'a4:3',
  // B — tritones, the waltz turns predatory.
  'c5:1 eb5 gb5', 'f5:2 e5:1', 'bb4:1 db5 f5', 'e5:3',
  'a4:1 c5 eb5', 'd5:2 c#5:1', 'c5:1 b4 bb4', 'a4:3',
  // Bridge — the box winds down on its own.
  'e5:1 d#5 d5', 'c#5:1 c5 b4', 'bb4:1 a4 g#4', 'a4:3',
  'a4:1 b4 c5', 'e5:2 f5:1', 'e5:1 d5 c5', 'b4:2 r:1',
)

const thrillerBark: MusicTrack = {
  title: 'El Vals del Espectro',
  bpm: 132,
  beatsPerBar: 3,
  reverb: 1.5,
  gain: 1.25,
  chords: [
    ch('a2', 'min'), ch('e2', 'dom7'), ch('a2', 'min'), ch('e2', 'dom7'),
    ch('d2', 'min'), ch('bb1'), ch('e2', 'dom7'), ch('a2', 'min'),
    ch('a2', 'min'), ch('f2'), ch('d2', 'min7'), ch('e2', 'dom7'),
    ch('c2'), ch('a2', 'min'), ch('e2', 'dom7'), ch('a2', 'min'),
    ch('c2', 'min'), ch('f2', 'dom7'), ch('bb1'), ch('e2', 'dom7'),
    ch('a2', 'min'), ch('d2', 'dim'), ch('e2', 'aug'), ch('a2', 'min'),
    ch('a2', 'min'), ch('g#2', 'dim'), ch('a2', 'min'), ch('a2', 'min'),
    ch('a2', 'min'), ch('e2', 'dom7'), ch('e2', 'dom7'), ch('a2', 'min'),
  ],
  parts: [
    { kind: 'arp', name: 'bass', patch: 'bass', tones: [0, REST, REST], len: 1, oct: 0, legato: 1.4 } as ArpPart,
    {
      kind: 'chord', name: 'pizz', patch: 'pizz', from: 0.22, spread: 0.45,
      hits: [{ at: 1, len: 0.5, tones: [1, 2, 3] }, { at: 2, len: 0.5, tones: [2, 3, 4] }],
    } as ChordPart,
    { kind: 'mel', name: 'box', patch: 'musicbox', line: ghostLead, from: 0.1, pan: -0.2 } as MelPart,
    { kind: 'chord', name: 'organ', patch: 'organ', from: 0.5, spread: 0.8, legato: 1, hits: [{ at: 0, len: 3, tones: [0, 2, 4] }] } as ChordPart,
    { kind: 'mel', name: 'wail', patch: 'siren', line: ghostLead, from: 0.78, oct: -1, gain: 0.8, pan: 0.5, mask: '00001111' } as MelPart,
    { kind: 'drum', name: 'thud', drum: 'kick', div: 2, straight: true, from: 0.3, gain: 0.75, lane: 'X-----' } as DrumPart,
    { kind: 'drum', name: 'bones', drum: 'rim', div: 2, from: 0.4, pan: 0.4, gain: 0.8, lane: '--x--x --x--o' } as DrumPart,
    { kind: 'drum', name: 'chain', drum: 'shaker', div: 2, from: 0.65, pan: -0.45, gain: 0.6, lane: 'o-o-o-' } as DrumPart,
    { kind: 'drum', name: 'toll', drum: 'bellhit', div: 2, from: 0.55, gain: 0.5, tune: 0.5, mask: '10000000 00000000 10000000 00000000', lane: 'X-----' } as DrumPart,
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// Wano — "El Sol Rojo". D minor pentatonic, taiko, koto ostinato, shakuhachi.
// ─────────────────────────────────────────────────────────────────────────────

const wanoLead = line(
  'd4:2 f4:2', 'a4:3 g4:1', 'f4:2 d4:2', 'c4:4',
  'd4:1 f4:1 g4:2', 'a4:2 c5:2', 'd5:3 a4:1', 'g4:4',
  'd5:1 c5:1 a4:2', 'g4:1 a4:1 c5:2', 'd5:2 f5:2', 'a4:4',
  'f4:1 g4:1 a4:1 c5:1', 'd5:2 c5:2', 'a4:1 g4:1 f4:1 d4:1', 'd4:4',
  // B — the taiko takes the floor; the flute answers late.
  'r:4', 'r:4', 'r:4', 'r:4',
  'a4:1 c5:1 d5:2', 'f5:2 d5:2', 'c5:1 a4:1 g4:2', 'f4:4',
  // Bridge.
  'd5:2 a4:2', 'c5:4', 'g4:2 f4:2', 'd4:4',
  'f4:1 a4:1 c5:2', 'd5:4', 'c5:2 a4:2', 'd4:4',
)

const wano: MusicTrack = {
  title: 'El Sol Rojo de Wano',
  bpm: 96,
  beatsPerBar: 4,
  swing: 0.08,
  reverb: 1.1,
  gain: 1.0,
  chords: [
    ...hold(ch('d2', 'min'), 4), ...hold(ch('f2'), 2), ...hold(ch('c2'), 2),
    ...hold(ch('d2', 'min'), 4), ...hold(ch('bb1'), 2), ...hold(ch('a1', 'min'), 2),
    ...hold(ch('d2', 'five'), 4), ...hold(ch('f2', 'five'), 2), ...hold(ch('c2', 'five'), 2),
    ...hold(ch('d2', 'min'), 2), ...hold(ch('g1', 'min'), 2), ...hold(ch('a1', 'min'), 2), ...hold(ch('d2', 'min'), 2),
  ],
  parts: [
    { kind: 'arp', name: 'bass', patch: 'bass', tones: [0, REST, REST, REST, 2, REST, 0, REST], len: 0.5, oct: 0 } as ArpPart,
    { kind: 'arp', name: 'koto', patch: 'koto', tones: [0, 2, 3, 4, 3, 2, 3, 1], len: 0.5, oct: 1, from: 0.3, pan: 0.35 } as ArpPart,
    { kind: 'mel', name: 'flute', patch: 'shakuhachi', line: wanoLead, from: 0.12, pan: -0.2 } as MelPart,
    { kind: 'mel', name: 'kotoLead', patch: 'koto', line: wanoLead, from: 0.7, oct: 1, gain: 0.55, pan: 0.45, mask: '00110011' } as MelPart,
    { kind: 'drum', name: 'taiko', drum: 'taiko', div: 4, straight: true, lane: 'X-------x---X---  X---x---X--xX-x-' } as DrumPart,
    { kind: 'drum', name: 'ko', drum: 'tom', div: 4, from: 0.35, pan: 0.3, gain: 0.6, tune: 1.5, lane: '----x-o---x-x-o-' } as DrumPart,
    { kind: 'drum', name: 'blocks', drum: 'click', div: 4, from: 0.5, pan: -0.4, lane: 'x---x---x---x-x-' } as DrumPart,
    { kind: 'drum', name: 'gong', drum: 'crash', div: 4, from: 0.6, gain: 0.6, tune: 0.6, mask: '10000000 00000000 10000000 00000000', lane: 'X---------------' } as DrumPart,
    { kind: 'drum', name: 'rush', drum: 'taiko', div: 4, from: 0.8, gain: 0.7, tune: 1.3, pan: 0.2, mask: '00000000 00000000 11111111 00000000', lane: 'xxoxxoxxoxxoxxox' } as DrumPart,
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// Boss — "Nudillos de Hierro". E minor, 16th-note bass, tritone stabs.
// ─────────────────────────────────────────────────────────────────────────────

const bossLead = line(
  'e4:.5 e4:.5 g4:.5 e4:.5 bb4:1 a4:1',
  'g4:.5 a4:.5 b4:1 e5:2',
  'd5:.5 c5 b4 a4 g4:1 f#4:1',
  'e4:2 r:2',
  'e4:.5 g4 b4 e5 d5:1 b4:1',
  'c5:.5 b4:.5 a4:1 g4:2',
  'f#4:.5 g4 a4 b4 c5:1 d5:1',
  'b4:2 r:2',
  // A' — the same riff a fifth up, teeth out.
  'b4:.5 b4:.5 d5:.5 b4:.5 f5:1 e5:1',
  'd5:.5 e5:.5 f#5:1 b5:2',
  'a5:.5 g5 f#5 e5 d5:1 c5:1',
  'b4:2 r:2',
  'e5:1 d5:.5 c5:.5 b4:1 a4:1',
  'g4:1 a4:1 b4:2',
  'c5:.5 b4 a4 g4 f#4:1 e4:1',
  'e4:4',
  // B — Neapolitan menace, half the speed, twice the weight.
  'f4:2 e4:2', 'f4:1 g4:1 bb4:2', 'a4:2 g4:2', 'f#4:4',
  'e5:2 d5:2', 'c5:2 b4:2', 'bb4:1 a4:1 g4:1 f4:1', 'e4:4',
  // Bridge — sirens and drums, then a chromatic climb back into the riff.
  'r:4', 'r:4', 'r:4', 'r:4',
  'e4:.5 f4 f#4 g4 g#4 a4 bb4 b4',
  'c5:.5 c#5 d5 d#5 e5:2',
  'e5:.5 d5 b4 g4 e4:1 b3:1',
  'e4:4',
)

const boss: MusicTrack = {
  title: 'Nudillos de Hierro',
  bpm: 168,
  beatsPerBar: 4,
  reverb: 0.7,
  gain: 0.4,
  chords: [
    ch('e2', 'min'), ch('e2', 'min'), ch('c2'), ch('b1', 'dom7'),
    ch('e2', 'min'), ch('g2'), ch('a2', 'min'), ch('b1', 'dom7'),
    ch('e2', 'min'), ch('e2', 'min'), ch('c2'), ch('b1', 'dom7'),
    ch('a2', 'min'), ch('c2'), ch('b1', 'dom7'), ch('e2', 'min'),
    ch('f1'), ch('f1'), ch('g1'), ch('f#1', 'dim'),
    ch('c2'), ch('a1', 'min'), ch('f1'), ch('e2', 'min'),
    ch('e2', 'five'), ch('e2', 'five'), ch('f1', 'five'), ch('f#1', 'five'),
    ch('e2', 'min'), ch('c2'), ch('b1', 'dom7'), ch('e2', 'min'),
  ],
  parts: [
    { kind: 'arp', name: 'bass', patch: 'bassSaw', tones: [0, 0, 0, 3, 0, 0, 1, 0, 0, 0, 0, 3, 0, 2, 1, 0], len: 0.25, oct: 0, legato: 0.8 } as ArpPart,
    {
      kind: 'chord', name: 'stabs', patch: 'brass', from: 0.3, spread: 0.6, legato: 0.4, pan: 0.25,
      hits: [{ at: 0, len: 0.4, tones: [1, 2, 3] }, { at: 1.75, len: 0.4, tones: [1, 2, 3] }, { at: 2.5, len: 0.4, tones: [2, 3, 4] }],
    } as ChordPart,
    { kind: 'mel', name: 'lead', patch: 'sawLead', line: bossLead, from: 0.45, pan: -0.2 } as MelPart,
    { kind: 'mel', name: 'siren', patch: 'siren', line: line('e5:4', 'r:4'), from: 0.85, pan: 0.6, mask: '00000000 00000000 11111111 00001111' } as MelPart,
    { kind: 'drum', name: 'kick', drum: 'kick', div: 4, straight: true, lane: 'X---x---X-x-X---  X---x---X-x-Xx-x' } as DrumPart,
    { kind: 'drum', name: 'snare', drum: 'snare', div: 4, from: 0.2, lane: '----X-------X---  ----X-------X-xo' } as DrumPart,
    { kind: 'drum', name: 'hat', drum: 'hat', div: 4, from: 0.35, pan: 0.25, lane: 'xoxoxoxoxoxoxoxo' } as DrumPart,
    { kind: 'drum', name: 'toms', drum: 'tom', div: 4, from: 0.7, pan: -0.35, gain: 0.7, mask: '00010001', lane: '--------x-x-x-xx' } as DrumPart,
    { kind: 'drum', name: 'crash', drum: 'crash', div: 4, from: 0.4, gain: 0.7, mask: '10001000', lane: 'X---------------' } as DrumPart,
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// Title, map and the victory cue.
// ─────────────────────────────────────────────────────────────────────────────

const title: MusicTrack = {
  title: 'Izad las Velas',
  bpm: 126,
  beatsPerBar: 4,
  reverb: 1,
  gain: 0.72,
  chords: [
    ch('d2'), ch('a1'), ch('b1', 'min'), ch('g1'),
    ch('d2'), ch('g1'), ch('a1', 'sus4'), ch('a1'),
    ch('b1', 'min'), ch('g1'), ch('d2'), ch('a1'),
    ch('g1'), ch('a1'), ch('d2'), ch('d2'),
  ],
  parts: [
    { kind: 'arp', name: 'bass', patch: 'bass', tones: [0, REST, 2, REST, 0, REST, 2, 1], len: 0.5, oct: 0 } as ArpPart,
    {
      kind: 'mel', name: 'lead', patch: 'fanfare', from: 0.1, pan: -0.1,
      line: line(
        'd4:.5 e4 f#4:1 a4:1 f#4:1',
        'e4:2 d4:2',
        'f#4:.5 g4 a4:1 d5:2',
        'c#5:1 b4:1 a4:2',
        'd5:.5 c#5 b4:1 a4:1 f#4:1',
        'g4:1 a4:1 b4:2',
        'a4:.5 b4 c#5:1 e5:2',
        'd5:4',
        'b4:1 d5:1 f#5:2', 'g5:2 f#5:2', 'e5:1 d5:1 b4:2', 'a4:4',
        'g4:1 a4:1 b4:1 c#5:1', 'd5:2 a4:2', 'f#5:1 e5:1 d5:2', 'd5:4',
      ),
    } as MelPart,
    { kind: 'chord', name: 'pad', patch: 'squeeze', from: 0.3, spread: 0.6, legato: 0.9, hits: [{ at: 0, len: 2, tones: [1, 2, 3] }, { at: 2, len: 2, tones: [1, 2, 3] }] } as ChordPart,
    { kind: 'drum', name: 'kick', drum: 'kick', div: 4, straight: true, from: 0.2, lane: 'X---o---X---o---' } as DrumPart,
    { kind: 'drum', name: 'snare', drum: 'snare', div: 4, from: 0.35, lane: '----X-------X-xo' } as DrumPart,
    { kind: 'drum', name: 'shaker', drum: 'shaker', div: 4, from: 0.5, pan: -0.3, lane: 'oxoxoxoxoxoxoxox' } as DrumPart,
  ],
}

const map: MusicTrack = {
  title: 'Log Pose',
  bpm: 92,
  beatsPerBar: 4,
  swing: 0.12,
  reverb: 1.2,
  gain: 1.55,
  chords: [
    ch('g2'), ch('e2', 'min7'), ch('c2', 'maj7'), ch('d2'),
    ch('e2', 'min7'), ch('a2', 'min7'), ch('c2', 'maj7'), ch('d2', 'sus4'),
    ch('g2'), ch('b2', 'min'), ch('c2', 'maj7'), ch('a2', 'min7'),
    ch('c2', 'maj7'), ch('d2'), ch('g2'), ch('g2'),
  ],
  parts: [
    { kind: 'arp', name: 'bass', patch: 'bass', tones: [0, REST, REST, 2, REST, REST, 1, REST], len: 0.5, oct: 0 } as ArpPart,
    {
      kind: 'mel', name: 'lead', patch: 'glass', from: 0.1, pan: -0.15,
      line: line(
        'd5:1 b4:1 g4:2', 'e5:1 d5:1 b4:2', 'c5:1 e5:1 g5:2', 'd5:4',
        'b4:1 d5:1 e5:2', 'c5:1 a4:1 e5:2', 'g5:2 e5:2', 'd5:3 r:1',
        'g5:1 f#5:1 d5:2', 'b5:2 a5:2', 'g5:1 e5:1 c5:2', 'a4:4',
        'c5:1 e5:1 g5:1 a5:1', 'f#5:2 d5:2', 'e5:1 d5:1 b4:2', 'g4:4',
      ),
    } as MelPart,
    { kind: 'chord', name: 'pad', patch: 'airPad', from: 0.25, spread: 0.8, legato: 1, hits: [{ at: 0, len: 4, tones: [2, 3, 5] }] } as ChordPart,
    { kind: 'drum', name: 'brush', drum: 'shaker', div: 4, from: 0.4, pan: 0.3, gain: 0.7, lane: 'o-x-o-x-o-x-o-xo' } as DrumPart,
    { kind: 'drum', name: 'rim', drum: 'rim', div: 4, from: 0.55, pan: -0.3, gain: 0.6, lane: '----x-------x---' } as DrumPart,
  ],
}

/** Short, loud, over in four bars. */
const victory: MusicTrack = {
  title: 'Bandera Izada',
  bpm: 144,
  beatsPerBar: 4,
  once: true,
  bars: 5,
  reverb: 1.1,
  gain: 0.72,
  chords: [ch('c2'), ch('f1'), ch('g1'), ch('c2'), ch('c2')],
  parts: [
    {
      kind: 'mel', name: 'fanfare', patch: 'fanfare', pan: -0.1,
      line: line(
        'g4:.34 c5:.33 e5:.33 g5:1 e5:.5 g5:1.5',
        'f5:.5 g5:.5 a5:1 g5:2',
        'e5:.5 f5:.5 g5:1 c6:2',
        'c6:3 r:1',
        'r:4',
      ),
    } as MelPart,
    {
      kind: 'mel', name: 'harmony', patch: 'brass', pan: 0.35, gain: 0.75,
      line: line(
        'e4:.34 g4:.33 c5:.33 e5:1 c5:.5 e5:1.5',
        'a4:.5 b4:.5 c5:1 b4:2',
        'c5:.5 d5:.5 e5:1 g5:2',
        'e5:3 r:1',
        'r:4',
      ),
    } as MelPart,
    { kind: 'arp', name: 'bass', patch: 'bass', tones: [0, REST, 2, REST, 0, 0, 2, 3], len: 0.5 } as ArpPart,
    { kind: 'drum', name: 'kick', drum: 'kick', div: 4, straight: true, lane: 'X---X---X---X---' } as DrumPart,
    { kind: 'drum', name: 'snare', drum: 'snare', div: 4, lane: 'x-x-X-x-x-x-XxXx' } as DrumPart,
    { kind: 'drum', name: 'crash', drum: 'crash', div: 4, mask: '10001', lane: 'X---------------' } as DrumPart,
  ],
}

/**
 * Track keys. The biome names are the canonical ones; the older keys
 * (`overworld`, `desert`, `sky`, `ghost`) stay because levels reference them.
 */
export const TRACKS: Record<string, MusicTrack> = {
  'east-blue': eastBlue,
  overworld: eastBlue,
  alabasta,
  desert: alabasta,
  skypiea,
  sky: skypiea,
  water7: water7,
  'water-7': water7,
  'thriller-bark': thrillerBark,
  ghost: thrillerBark,
  wano,
  boss,
  title,
  map,
  victory,
  clear: victory,
  fanfare: victory,
}
