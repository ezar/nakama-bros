import type { AudioApi, SfxName } from '../types'
import { SFX_RECIPES, type SfxRecipe } from './sfx'
import { MusicPlayer } from './music'

/**
 * Procedural audio.
 *
 * Every sound is synthesised at runtime from oscillators and noise buffers —
 * no audio files, so the whole soundtrack costs a few kilobytes of code and
 * the music can react to gameplay (layers swell during boss phases) in a way
 * pre-rendered loops cannot.
 */
export class AudioEngine implements AudioApi {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private musicGain: GainNode | null = null
  private sfxGain: GainNode | null = null
  private noiseBuffer: AudioBuffer | null = null
  private music: MusicPlayer | null = null
  private started = false

  private masterVolume = 0.8
  private musicVolume = 0.55
  private sfxVolume = 0.85
  /** Rate-limits identical sounds so a coin cascade does not clip. */
  private lastPlayed = new Map<SfxName, number>()

  async ready(): Promise<void> {
    if (this.started) {
      await this.ctx?.resume()
      return
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctor()
    this.ctx = ctx

    // A gentle bus compressor keeps the mix glued when many SFX overlap.
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.knee.value = 24
    comp.ratio.value = 3.5
    comp.attack.value = 0.004
    comp.release.value = 0.2

    const master = ctx.createGain()
    master.gain.value = this.masterVolume
    const musicGain = ctx.createGain()
    musicGain.gain.value = this.musicVolume
    const sfxGain = ctx.createGain()
    sfxGain.gain.value = this.sfxVolume

    musicGain.connect(comp)
    sfxGain.connect(comp)
    comp.connect(master)
    master.connect(ctx.destination)

    this.master = master
    this.musicGain = musicGain
    this.sfxGain = sfxGain

    // Shared white-noise buffer for percussion, splashes and explosions.
    const len = Math.floor(ctx.sampleRate * 1.2)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    this.noiseBuffer = buf

    this.music = new MusicPlayer(ctx, musicGain)
    this.started = true
    await ctx.resume()
  }

  playSfx(name: SfxName, opts: { volume?: number; rate?: number; pan?: number } = {}): void {
    const ctx = this.ctx
    const dest = this.sfxGain
    if (!ctx || !dest || ctx.state === 'suspended') return
    const now = ctx.currentTime
    const last = this.lastPlayed.get(name) ?? -1
    if (now - last < 0.022) return
    this.lastPlayed.set(name, now)

    const recipe = SFX_RECIPES[name]
    if (!recipe) return

    let node: AudioNode = dest
    if (opts.pan !== undefined && ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner()
      panner.pan.value = Math.max(-1, Math.min(1, opts.pan))
      panner.connect(dest)
      node = panner
    }
    this.renderRecipe(recipe, now, node, opts.volume ?? 1, opts.rate ?? 1)
  }

  private renderRecipe(
    recipe: SfxRecipe,
    at: number,
    dest: AudioNode,
    volume: number,
    rate: number,
  ): void {
    const ctx = this.ctx!
    for (const v of recipe.voices) {
      const start = at + (v.delay ?? 0)
      const dur = v.dur / rate
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.0001, start)
      const peak = Math.max(0.0001, v.gain * volume * recipe.gain)
      gain.gain.exponentialRampToValueAtTime(peak, start + Math.max(0.001, v.attack ?? 0.005))
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur)

      let src: AudioScheduledSourceNode
      if (v.type === 'noise') {
        const n = ctx.createBufferSource()
        n.buffer = this.noiseBuffer
        n.loop = true
        src = n
      } else {
        const o = ctx.createOscillator()
        o.type = v.type
        o.frequency.setValueAtTime(v.freq * rate, start)
        if (v.freqEnd !== undefined) {
          const end = Math.max(20, v.freqEnd * rate)
          if (v.sweep === 'linear') o.frequency.linearRampToValueAtTime(end, start + dur)
          else o.frequency.exponentialRampToValueAtTime(end, start + dur)
        }
        if (v.vibrato) {
          const lfo = ctx.createOscillator()
          const lfoGain = ctx.createGain()
          lfo.frequency.value = v.vibrato.rate
          lfoGain.gain.value = v.vibrato.depth
          lfo.connect(lfoGain)
          lfoGain.connect(o.frequency)
          lfo.start(start)
          lfo.stop(start + dur + 0.05)
        }
        src = o
      }

      let chain: AudioNode = gain
      if (v.filter) {
        const f = ctx.createBiquadFilter()
        f.type = v.filter.type
        f.frequency.setValueAtTime(v.filter.freq, start)
        if (v.filter.freqEnd !== undefined) {
          f.frequency.exponentialRampToValueAtTime(Math.max(40, v.filter.freqEnd), start + dur)
        }
        f.Q.value = v.filter.q ?? 1
        gain.connect(f)
        chain = f
      }
      chain.connect(dest)
      src.connect(gain)
      src.start(start)
      src.stop(start + dur + 0.02)
    }
  }

  playMusic(track: string, opts: { fade?: number; intensity?: number } = {}): void {
    this.music?.play(track, opts.fade ?? 0.6, opts.intensity ?? 0.5)
  }

  stopMusic(fade = 0.5): void {
    this.music?.stop(fade)
  }

  setIntensity(v: number): void {
    this.music?.setIntensity(v)
  }

  setMasterVolume(v: number): void {
    this.masterVolume = v
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02)
    }
  }

  setMusicVolume(v: number): void {
    this.musicVolume = v
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02)
    }
  }

  setSfxVolume(v: number): void {
    this.sfxVolume = v
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02)
    }
  }

  suspend(): void {
    void this.ctx?.suspend()
  }

  resume(): void {
    void this.ctx?.resume()
  }
}

/** A no-op implementation, used before the user has interacted with the page. */
export const silentAudio: AudioApi = {
  ready: async () => {},
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
