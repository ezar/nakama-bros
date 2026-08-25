/**
 * Voices.
 *
 * Everything you hear is built here: detuned oscillator stacks with a per-voice
 * ADSR and a filter envelope, percussion carved out of filtered noise, and one
 * shared reverb every voice can send to. Nothing allocates a buffer bigger than
 * a couple of seconds, so the whole soundtrack still costs a few kilobytes.
 *
 * Functions take a `BaseAudioContext`, not an `AudioContext`, so the same
 * voices render in an OfflineAudioContext for tests and for the audio
 * inspection harness.
 */

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>()

/** Two seconds of white noise, shared by every noise voice in a context. */
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cached = noiseCache.get(ctx)
  if (cached) return cached
  const len = Math.floor(ctx.sampleRate * 2)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buf.getChannelData(0)
  let last = 0
  for (let i = 0; i < len; i++) {
    // Slightly smoothed white noise: pure white is fizzier than any real
    // impact, and the smoothing gives filters something to bite on.
    const w = Math.random() * 2 - 1
    last = last * 0.22 + w * 0.78
    data[i] = last
  }
  noiseCache.set(ctx, buf)
  return buf
}

/**
 * A short, dense, decaying impulse response. Two early reflections plus an
 * exponential noise tail reads as a room rather than as a metallic ring.
 */
/**
 * Route a voice to the mix, panned only if it is actually panned.
 *
 * A `StereoPanner` set to dead centre is an identity: it costs a node, a
 * connection and a slot in the render graph to multiply by one. Most notes in
 * this soundtrack are centred — the panning that matters is on a handful of
 * layers and on positional effects — and the graph makes around three hundred
 * and fifty nodes a second while a level is running, measured. Skipping the
 * ones that do nothing is free in every sense: the output is sample-identical,
 * because a centre pan is what a mono source connected straight through
 * already sounds like.
 */
export function panTo(
  ctx: BaseAudioContext,
  from: AudioNode,
  out: AudioNode,
  pan: number,
): AudioNode {
  if (Math.abs(pan) < 0.001) {
    from.connect(out)
    return from
  }
  const p = ctx.createStereoPanner()
  p.pan.value = Math.max(-1, Math.min(1, pan))
  from.connect(p)
  p.connect(out)
  return p
}

export function reverbImpulse(ctx: BaseAudioContext, seconds = 1.9, decay = 3.2): AudioBuffer {
  const rate = ctx.sampleRate
  const len = Math.max(1, Math.floor(rate * seconds))
  const buf = ctx.createBuffer(2, len, rate)
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c)
    let lp = 0
    for (let i = 0; i < len; i++) {
      const t = i / len
      const env = Math.pow(1 - t, decay)
      const w = (Math.random() * 2 - 1) * env
      // Rolling the tail off keeps the reverb behind the mix instead of on it.
      lp += (w - lp) * 0.34
      data[i] = lp
    }
    // Early reflections, offset per channel for width.
    const e1 = Math.floor(rate * (c === 0 ? 0.011 : 0.017))
    const e2 = Math.floor(rate * (c === 0 ? 0.029 : 0.023))
    if (e1 < len) data[e1] += 0.5
    if (e2 < len) data[e2] += 0.32
  }
  return buf
}

/** A soft-clip transfer curve — adds bite without the fizz of hard clipping. */
export function driveCurve(amount: number, n = 1024): Float32Array<ArrayBuffer> {
  // Typed with an explicit ArrayBuffer so it satisfies WaveShaper's curve type.
  const curve = new Float32Array(new ArrayBuffer(n * 4))
  const k = Math.max(0.0001, amount) * 12
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    curve[i] = Math.tanh(x * (1 + k)) / Math.tanh(1 + k)
  }
  return curve
}

export interface OscLayer {
  type: OscillatorType
  /** Detune in cents. Pairs of ±cents are what make a stack sound wide. */
  detune?: number
  /** Octave offset. */
  oct?: number
  /** Interval offset in semitones (a fifth on top of a lead, say). */
  semis?: number
  gain: number
  /** -1..1 placement inside the voice's own stereo field. */
  pan?: number
}

export interface Patch {
  osc: OscLayer[]
  /** Breath / pick noise mixed under the attack. */
  noise?: { gain: number; dur: number; filter: BiquadFilterType; freq: number; q?: number; track?: boolean }
  /** Attack, decay, sustain level (0..1), release — all in seconds but sustain. */
  amp: { a: number; d: number; s: number; r: number }
  filter?: {
    type: BiquadFilterType
    /** Cutoff in Hz at the envelope floor. */
    base: number
    /** Cutoff also follows pitch by this multiple of the note frequency. */
    track?: number
    /** Envelope depth as a multiplier on the base cutoff. */
    env?: number
    /** Envelope fall time. */
    decay?: number
    q?: number
  }
  vibrato?: { rate: number; depth: number; delay: number }
  /** Overall level of the patch. */
  gain: number
  /** 0..1 into the reverb bus. */
  send: number
  /** Ignore the written note length — plucks and bells ring for a fixed time. */
  fixedDur?: number
  /** Soft clip amount. */
  drive?: number
  /** Portamento time from the previous note, in seconds. */
  glide?: number
}

function adsr(
  param: AudioParam,
  when: number,
  dur: number,
  peak: number,
  env: { a: number; d: number; s: number; r: number },
): number {
  const a = Math.max(0.002, env.a)
  const d = Math.max(0.004, env.d)
  const sustain = Math.max(0.0001, peak * env.s)
  const rel = Math.max(0.02, env.r)
  const hold = Math.max(0.01, dur)
  param.setValueAtTime(0.0001, when)
  param.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + a)
  param.exponentialRampToValueAtTime(sustain, when + a + d)
  const off = when + Math.max(a + d, hold)
  param.setValueAtTime(Math.max(0.0001, Math.min(sustain, peak)), off)
  param.exponentialRampToValueAtTime(0.0001, off + rel)
  return off + rel
}

export interface VoiceOpts {
  when: number
  /** Note length in seconds (before release). */
  dur: number
  freq: number
  /** 0..1. */
  vel: number
  /** -1..1. */
  pan?: number
  /** Multiplies the patch gain. */
  gain?: number
  /** Frequency the note glides from, if the patch has glide. */
  from?: number
}

/** Play one note of `patch`. Returns the time the voice finishes. */
export function playPatch(
  ctx: BaseAudioContext,
  patch: Patch,
  out: AudioNode,
  send: AudioNode | null,
  o: VoiceOpts,
): number {
  const when = Math.max(o.when, ctx.currentTime)
  const dur = patch.fixedDur ?? o.dur
  const peak = patch.gain * (o.gain ?? 1) * (0.25 + 0.75 * o.vel)

  const amp = ctx.createGain()
  const end = adsr(amp.gain, when, dur, peak, patch.amp)

  let node: AudioNode = amp
  if (patch.filter) {
    const f = ctx.createBiquadFilter()
    const base = patch.filter.base + (patch.filter.track ?? 0) * o.freq
    const top = base * (patch.filter.env ?? 1) * (0.55 + 0.45 * o.vel)
    f.type = patch.filter.type
    f.Q.value = patch.filter.q ?? 0.9
    f.frequency.setValueAtTime(Math.min(18000, Math.max(60, top)), when)
    if ((patch.filter.env ?? 1) !== 1) {
      f.frequency.exponentialRampToValueAtTime(
        Math.min(18000, Math.max(60, base)),
        when + Math.max(0.02, patch.filter.decay ?? 0.2),
      )
    }
    amp.connect(f)
    node = f
  }

  if (patch.drive) {
    const ws = ctx.createWaveShaper()
    ws.curve = driveCurve(patch.drive)
    node.connect(ws)
    node = ws
  }

  const pan = panTo(ctx, node, out, o.pan ?? 0)
  if (send && patch.send > 0) {
    const s = ctx.createGain()
    s.gain.value = patch.send
    pan.connect(s)
    s.connect(send)
  }

  let vibNode: OscillatorNode | null = null
  let vibGain: GainNode | null = null
  if (patch.vibrato) {
    vibNode = ctx.createOscillator()
    vibGain = ctx.createGain()
    vibNode.frequency.value = patch.vibrato.rate
    // Vibrato swells in rather than wobbling from the first millisecond.
    vibGain.gain.setValueAtTime(0.0001, when)
    vibGain.gain.setValueAtTime(0.0001, when + patch.vibrato.delay)
    vibGain.gain.linearRampToValueAtTime(patch.vibrato.depth, when + patch.vibrato.delay + 0.18)
    vibNode.connect(vibGain)
    vibNode.start(when)
    vibNode.stop(end + 0.02)
  }

  for (const layer of patch.osc) {
    const osc = ctx.createOscillator()
    osc.type = layer.type
    const f = o.freq * Math.pow(2, (layer.oct ?? 0) + (layer.semis ?? 0) / 12)
    if (patch.glide && o.from) {
      osc.frequency.setValueAtTime(o.from * Math.pow(2, (layer.oct ?? 0) + (layer.semis ?? 0) / 12), when)
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, f), when + patch.glide)
    } else {
      osc.frequency.setValueAtTime(Math.max(20, f), when)
    }
    osc.detune.value = layer.detune ?? 0
    if (vibGain) vibGain.connect(osc.detune)

    const g = ctx.createGain()
    g.gain.value = layer.gain
    osc.connect(g)
    if (layer.pan !== undefined) {
      const p = ctx.createStereoPanner()
      p.pan.value = layer.pan
      g.connect(p)
      p.connect(amp)
    } else {
      g.connect(amp)
    }
    osc.start(when)
    osc.stop(end + 0.03)
  }

  if (patch.noise) {
    const n = ctx.createBufferSource()
    n.buffer = noiseBuffer(ctx)
    n.loop = true
    n.playbackRate.value = 0.6 + Math.random() * 0.8
    const nf = ctx.createBiquadFilter()
    nf.type = patch.noise.filter
    nf.frequency.value = patch.noise.track ? Math.min(16000, o.freq * 3.2) : patch.noise.freq
    nf.Q.value = patch.noise.q ?? 1
    const ng = ctx.createGain()
    const nd = patch.noise.dur
    ng.gain.setValueAtTime(0.0001, when)
    ng.gain.exponentialRampToValueAtTime(Math.max(0.0002, patch.noise.gain * peak * 2), when + 0.004)
    ng.gain.exponentialRampToValueAtTime(0.0001, when + nd)
    n.connect(nf)
    nf.connect(ng)
    ng.connect(amp)
    n.start(when)
    n.stop(when + nd + 0.02)
  }

  return end
}

// ─────────────────────────────────────────────────────────────────────────────
// Percussion
// ─────────────────────────────────────────────────────────────────────────────

export type DrumId =
  | 'kick' | 'snare' | 'rim' | 'hat' | 'ohat' | 'shaker' | 'tom' | 'taiko'
  | 'crash' | 'click' | 'clap' | 'bellhit'

interface DrumSpec {
  /** Pitched body, if any. */
  tone?: { type: OscillatorType; f0: number; f1: number; dur: number; gain: number }
  noise?: { filter: BiquadFilterType; f0: number; f1: number; q: number; dur: number; gain: number }
  gain: number
  send: number
}

const DRUMS: Record<DrumId, DrumSpec> = {
  kick: {
    tone: { type: 'sine', f0: 168, f1: 54, dur: 0.15, gain: 1 },
    noise: { filter: 'lowpass', f0: 2600, f1: 400, q: 0.7, dur: 0.02, gain: 0.35 },
    gain: 0.8, send: 0.04,
  },
  snare: {
    tone: { type: 'triangle', f0: 235, f1: 160, dur: 0.07, gain: 0.4 },
    noise: { filter: 'bandpass', f0: 2100, f1: 1300, q: 0.8, dur: 0.15, gain: 0.75 },
    gain: 0.62, send: 0.24,
  },
  rim: {
    tone: { type: 'square', f0: 430, f1: 320, dur: 0.03, gain: 0.5 },
    noise: { filter: 'bandpass', f0: 3200, f1: 2400, q: 3, dur: 0.04, gain: 0.5 },
    gain: 0.45, send: 0.18,
  },
  hat: {
    noise: { filter: 'highpass', f0: 7200, f1: 8600, q: 0.8, dur: 0.045, gain: 1 },
    gain: 0.3, send: 0.07,
  },
  ohat: {
    noise: { filter: 'highpass', f0: 6400, f1: 7800, q: 0.7, dur: 0.26, gain: 1 },
    gain: 0.26, send: 0.14,
  },
  shaker: {
    noise: { filter: 'bandpass', f0: 5200, f1: 6800, q: 1.6, dur: 0.07, gain: 1 },
    gain: 0.26, send: 0.1,
  },
  tom: {
    tone: { type: 'sine', f0: 240, f1: 110, dur: 0.24, gain: 1 },
    noise: { filter: 'lowpass', f0: 1800, f1: 600, q: 0.7, dur: 0.05, gain: 0.3 },
    gain: 0.6, send: 0.16,
  },
  taiko: {
    tone: { type: 'sine', f0: 196, f1: 72, dur: 0.38, gain: 1 },
    noise: { filter: 'lowpass', f0: 1500, f1: 300, q: 0.8, dur: 0.1, gain: 0.5 },
    gain: 0.86, send: 0.22,
  },
  crash: {
    noise: { filter: 'highpass', f0: 3800, f1: 6200, q: 0.6, dur: 1.1, gain: 1 },
    gain: 0.3, send: 0.4,
  },
  click: {
    noise: { filter: 'bandpass', f0: 2400, f1: 2400, q: 6, dur: 0.02, gain: 1 },
    gain: 0.35, send: 0.05,
  },
  clap: {
    noise: { filter: 'bandpass', f0: 1500, f1: 1900, q: 2.2, dur: 0.12, gain: 1 },
    gain: 0.5, send: 0.3,
  },
  bellhit: {
    tone: { type: 'sine', f0: 1860, f1: 1840, dur: 0.9, gain: 1 },
    noise: { filter: 'highpass', f0: 5000, f1: 5000, q: 1, dur: 0.03, gain: 0.4 },
    gain: 0.3, send: 0.5,
  },
}

/** Hit one drum. `tune` multiplies pitch so repeated hits are not identical. */
export function playDrum(
  ctx: BaseAudioContext,
  id: DrumId,
  out: AudioNode,
  send: AudioNode | null,
  when: number,
  vel: number,
  pan = 0,
  tune = 1,
  gain = 1,
): void {
  const spec = DRUMS[id]
  if (!spec) return
  const t = Math.max(when, ctx.currentTime)
  const level = spec.gain * gain * (0.15 + 0.85 * vel)

  // Not routed through `panTo`: a drum's layers have no node to meet at except
  // the panner itself, so skipping it would only mean creating a gain in its
  // place. The saving there is zero and the wiring is worse.
  const panner = ctx.createStereoPanner()
  panner.pan.value = Math.max(-1, Math.min(1, pan))
  panner.connect(out)
  if (send && spec.send > 0) {
    const s = ctx.createGain()
    s.gain.value = spec.send * (0.5 + 0.5 * vel)
    panner.connect(s)
    s.connect(send)
  }

  if (spec.tone) {
    const o = ctx.createOscillator()
    o.type = spec.tone.type
    o.frequency.setValueAtTime(spec.tone.f0 * tune, t)
    o.frequency.exponentialRampToValueAtTime(Math.max(20, spec.tone.f1 * tune), t + spec.tone.dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, level * spec.tone.gain), t + 0.003)
    g.gain.exponentialRampToValueAtTime(0.0001, t + spec.tone.dur)
    o.connect(g)
    g.connect(panner)
    o.start(t)
    o.stop(t + spec.tone.dur + 0.02)
  }

  if (spec.noise) {
    const n = ctx.createBufferSource()
    n.buffer = noiseBuffer(ctx)
    n.loop = true
    n.playbackRate.value = 0.7 + Math.random() * 0.6
    const f = ctx.createBiquadFilter()
    f.type = spec.noise.filter
    f.Q.value = spec.noise.q
    f.frequency.setValueAtTime(spec.noise.f0 * tune, t)
    f.frequency.exponentialRampToValueAtTime(Math.max(40, spec.noise.f1 * tune), t + spec.noise.dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, level * spec.noise.gain), t + 0.002)
    g.gain.exponentialRampToValueAtTime(0.0001, t + spec.noise.dur)
    n.connect(f)
    f.connect(g)
    g.connect(panner)
    n.start(t)
    n.stop(t + spec.noise.dur + 0.02)
  }
}
