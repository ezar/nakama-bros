import type { AudioApi, SfxName } from '../types'
import { MusicPlayer } from './music'
import { renderSfx, SFX_RECIPES } from './sfx'
import { reverbImpulse } from './synth'

/**
 * Procedural audio.
 *
 * Nothing is loaded: every sound is synthesised at runtime from oscillators and
 * noise, so the whole soundtrack costs a few kilobytes of code and the music
 * can react to the game — layers swell during boss phases, and loud effects
 * duck the score out of their way — in a way pre-rendered loops cannot.
 *
 * The signal path, once and for all:
 *
 *   music ─ musicGain ─ duck ─┐
 *   sfx   ─ sfxGain ──────────┼─ glue comp ─ limiter ─ master ─ out
 *   reverb return ────────────┘
 *
 * The glue compressor keeps a busy mix together; the limiter after it is a
 * brick wall, so twenty simultaneous explosions cannot clip the output.
 */

export interface AudioGraph {
  /** Music player output goes here. */
  musicIn: GainNode
  /** Sound effects go here. */
  sfxIn: GainNode
  /** Anything can send a copy of itself here for room. */
  reverbIn: GainNode
  /** Dips while a loud effect plays. */
  duck: GainNode
  master: GainNode
}

/**
 * Build the mix bus. Exported (and written against `BaseAudioContext`) so the
 * offline renderer used to inspect the music gets exactly the same chain the
 * player hears.
 */
export function createAudioGraph(ctx: BaseAudioContext, dest: AudioNode): AudioGraph {
  const master = ctx.createGain()
  master.gain.value = 0.9

  // Brick-wall limiter: hard knee, fast attack, nothing gets past 0 dBFS.
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -1.5
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.002
  limiter.release.value = 0.12

  // Glue: gentle, slow, only there to stop the mix falling apart when a boss
  // fight has music, drums and four explosions running at once.
  const glue = ctx.createDynamicsCompressor()
  glue.threshold.value = -18
  glue.knee.value = 22
  glue.ratio.value = 2.6
  glue.attack.value = 0.006
  glue.release.value = 0.22

  // Nothing below the lowest note anybody can hear — sub rumble only eats
  // headroom the limiter would rather spend on the music.
  const rumble = ctx.createBiquadFilter()
  rumble.type = 'highpass'
  rumble.frequency.value = 34
  rumble.Q.value = 0.7

  glue.connect(rumble)
  rumble.connect(limiter)
  limiter.connect(master)
  master.connect(dest)

  const duck = ctx.createGain()
  duck.gain.value = 1
  duck.connect(glue)

  const musicIn = ctx.createGain()
  musicIn.connect(duck)

  const sfxIn = ctx.createGain()
  sfxIn.connect(glue)

  const reverbIn = ctx.createGain()
  reverbIn.gain.value = 1
  const convolver = ctx.createConvolver()
  convolver.buffer = reverbImpulse(ctx)
  const wet = ctx.createGain()
  wet.gain.value = 0.5
  // A little high-pass keeps the tail from muddying the bass.
  const tilt = ctx.createBiquadFilter()
  tilt.type = 'highpass'
  tilt.frequency.value = 320
  reverbIn.connect(convolver)
  convolver.connect(tilt)
  tilt.connect(wet)
  wet.connect(glue)

  return { musicIn, sfxIn, reverbIn, duck, master }
}

/** Below this gap two triggers of the same effect are one machine-gun burst. */
const MIN_GAP = 0.028
/** Concurrent effect voices allowed before quiet ones start being dropped. */
const VOICE_BUDGET = 26

export class AudioEngine implements AudioApi {
  private ctx: AudioContext | null = null
  private graph: AudioGraph | null = null
  private music: MusicPlayer | null = null
  private started = false
  private failed = false

  private masterVolume = 0.8
  private musicVolume = 0.55
  private sfxVolume = 0.85

  /** Last trigger time per effect, for the anti-machine-gun gate. */
  private lastPlayed = new Map<SfxName, number>()
  /** Trigger counter per effect, for the round-robin pitch cycle. */
  private counter = new Map<SfxName, number>()
  /** End times of effect voices in flight, for the voice budget. */
  private voices: number[] = []
  /** Pending music track, if playMusic ran before the context existed. */
  private pending: { track: string; fade: number; intensity: number } | null = null
  private intensity = 0.5

  async ready(): Promise<void> {
    if (this.failed) return
    if (this.started) {
      // Not just resume: an iOS context that was suspended by backgrounding
      // needs the same silent-buffer kick it needed the first time.
      await this.unlockContext()
      return
    }
    try {
      const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }
      const Ctor = w.AudioContext ?? w.webkitAudioContext
      if (!Ctor) {
        // Headless capture and old browsers: stay silent, never throw.
        this.failed = true
        return
      }
      // iOS mutes every WebAudio context when the hardware silent switch is on,
      // whatever the volume is set to. Declaring the session as playback is the
      // only way to be heard through it, and it has to happen before the
      // context exists. Safari 16.4+; harmless where it is missing.
      const nav = navigator as unknown as { audioSession?: { type: string } }
      if (nav.audioSession) {
        try {
          nav.audioSession.type = 'playback'
        } catch {
          // A browser that exposes the object but rejects the value.
        }
      }

      const ctx = new Ctor()
      const graph = createAudioGraph(ctx, ctx.destination)
      graph.master.gain.value = this.masterVolume
      graph.musicIn.gain.value = this.musicVolume
      graph.sfxIn.gain.value = this.sfxVolume

      this.ctx = ctx
      this.graph = graph
      this.music = new MusicPlayer(ctx, graph.musicIn, graph.reverbIn)
      this.music.setIntensity(this.intensity)
      this.started = true

      await this.unlockContext()

      if (this.pending) {
        const p = this.pending
        this.pending = null
        this.music.play(p.track, p.fade, p.intensity)
      }
    } catch {
      // A blocked or missing AudioContext must never take the game down.
      this.failed = true
      this.ctx = null
      this.graph = null
      this.music = null
    }
  }

  playSfx(name: SfxName, opts: { volume?: number; rate?: number; pan?: number } = {}): void {
    const ctx = this.ctx
    const graph = this.graph
    if (!ctx || !graph || ctx.state !== 'running') return
    const recipe = SFX_RECIPES[name]
    if (!recipe) return

    const now = ctx.currentTime
    const last = this.lastPlayed.get(name) ?? -1
    if (now - last < MIN_GAP) return
    this.lastPlayed.set(name, now)

    // Voice budget: when the screen is a fireworks show, the small sounds are
    // the ones that can be missed without anybody noticing.
    this.voices = this.voices.filter((t) => t > now)
    if (this.voices.length > VOICE_BUDGET && (recipe.duck ?? 0) < 0.25) return

    const n = (this.counter.get(name) ?? 0) + 1
    this.counter.set(name, n)
    const cycle = recipe.cycle ? recipe.cycle[n % recipe.cycle.length] : 0
    const jitter = (Math.random() * 2 - 1) * (recipe.vary ?? 0.35)

    try {
      // A few milliseconds of lead: below anybody's perception, but it puts the
      // start on the audio clock instead of on whenever this callback ran.
      const end = renderSfx(ctx, recipe, graph.sfxIn, graph.reverbIn, now + 0.004, {
        volume: opts.volume ?? 1,
        rate: opts.rate ?? 1,
        pan: opts.pan ?? 0,
        semitones: cycle + jitter,
      })
      this.voices.push(end)
      const duck = (recipe.duck ?? 0) * Math.min(1.2, opts.volume ?? 1)
      if (duck > 0.05) this.duckMusic(duck, now)
    } catch {
      // A voice that cannot be built is a missing sound, not a crashed game.
    }
  }

  /** Dip the music under a loud effect, then let it back up. */
  private duckMusic(amount: number, now: number): void {
    const graph = this.graph
    if (!graph) return
    const depth = Math.max(0.35, 1 - amount * 0.55)
    const g = graph.duck.gain
    g.cancelScheduledValues(now)
    g.setTargetAtTime(depth, now, 0.012)
    g.setTargetAtTime(1, now + 0.06 + amount * 0.35, 0.16)
  }

  playMusic(track: string, opts: { fade?: number; intensity?: number } = {}): void {
    const fade = opts.fade ?? 0.6
    const intensity = opts.intensity ?? this.intensity
    this.intensity = intensity
    if (!this.music) {
      // The first level can ask for music before the user has clicked anything.
      this.pending = { track, fade, intensity }
      return
    }
    this.music.play(track, fade, intensity)
  }

  stopMusic(fade = 0.5): void {
    this.pending = null
    this.music?.stop(fade)
  }

  setIntensity(v: number): void {
    this.intensity = v
    this.music?.setIntensity(v)
  }

  setMasterVolume(v: number): void {
    this.masterVolume = v
    this.ramp(this.graph?.master, v)
  }

  setMusicVolume(v: number): void {
    this.musicVolume = v
    this.ramp(this.graph?.musicIn, v)
  }

  setSfxVolume(v: number): void {
    this.sfxVolume = v
    this.ramp(this.graph?.sfxIn, v)
  }

  private ramp(node: GainNode | undefined, v: number): void {
    if (!node || !this.ctx) return
    node.gain.setTargetAtTime(Math.max(0, v), this.ctx.currentTime, 0.02)
  }

  isRunning(): boolean {
    return this.ctx?.state === 'running'
  }

  /**
   * Move the context to running, from a user gesture.
   *
   * The gesture is spent the moment we await, so resume is fired synchronously
   * and a one-frame silent buffer is played alongside it: on iOS the buffer is
   * what actually moves the context out of 'suspended', where resume() alone
   * often reports success and leaves it stuck.
   */
  private async unlockContext(): Promise<void> {
    const ctx = this.ctx
    if (!ctx) return
    void ctx.resume().catch(() => {})
    try {
      const blip = ctx.createBufferSource()
      blip.buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
      blip.connect(ctx.destination)
      blip.start(0)
    } catch {
      // Not fatal: the context may already be running.
    }
    await ctx.resume().catch(() => {})
  }

  suspend(): void {
    void this.ctx?.suspend().catch(() => {})
  }

  resume(): void {
    void this.ctx?.resume().catch(() => {})
  }
}

/** A no-op implementation, used before the user has interacted with the page. */
export const silentAudio: AudioApi = {
  ready: async () => {},
  isRunning: () => false,
  playSfx: () => {},
  playMusic: () => {},
  stopMusic: () => {},
  setIntensity: () => {},
  setMasterVolume: () => {},
  setMusicVolume: () => {},
  setSfxVolume: () => {},
  suspend: () => {},
  resume: () => {},
}
