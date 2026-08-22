/**
 * The music player.
 *
 * Scheduling is the standard Web Audio two-clock arrangement: a coarse 25 ms
 * timer wakes up, looks 120 ms into the future, and hands every note that falls
 * inside that window to the audio clock with an exact start time. Nothing is
 * ever "played now" — a garbage collection pause can stall the timer without
 * moving a single note, because the times all come from one running counter
 * (`nextBarTime`) rather than from whenever the callback happened to fire.
 *
 * A whole bar is scheduled at once, which also means the intensity that decides
 * which layers play is sampled once per bar: layers can only enter or leave on
 * a bar line, never in the middle of somebody's phrase.
 */
import { barSeconds, composeBar, trackBars, type MusicTrack } from './compose'
import { PATCHES } from './patches'
import { playDrum, playPatch } from './synth'
import { TRACKS } from './tracks'

export { TRACKS }
export type { MusicTrack }

/** How far ahead of the clock notes are scheduled. */
const LOOKAHEAD = 0.12
/** How often the scheduler wakes up, in milliseconds. */
const TICK_MS = 25

/** Render one bar of a track into any context — used by the player and by tests. */
export function scheduleBar(
  ctx: BaseAudioContext,
  track: MusicTrack,
  bar: number,
  when: number,
  intensity: number,
  out: AudioNode,
  send: AudioNode | null,
): void {
  for (const n of composeBar(track, bar, intensity)) {
    if (n.drum) {
      playDrum(ctx, n.drum, out, send, when + n.t, n.vel, n.pan, n.tune ?? 1, n.gain)
    } else if (n.patch) {
      playPatch(ctx, PATCHES[n.patch], out, send, {
        when: when + n.t,
        dur: n.dur,
        freq: n.freq,
        vel: n.vel,
        pan: n.pan,
        gain: n.gain,
      })
    }
  }
}

export class MusicPlayer {
  private track: MusicTrack | null = null
  private trackName = ''
  private bus: GainNode | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  /** Absolute audio-clock time of the next bar to be scheduled. */
  private nextBarTime = 0
  private bar = 0
  private intensity = 0.5
  private stopAt = Infinity

  constructor(
    private ctx: BaseAudioContext,
    private dest: AudioNode,
    private send: AudioNode | null = null,
  ) {}

  /** Name of the playing track, or '' — the UI never asks, tests do. */
  get playing(): string {
    return this.trackName
  }

  play(name: string, fade = 0.6, intensity = 0.5): void {
    const track = TRACKS[name]
    if (!track) return
    this.intensity = clamp01(intensity)
    if (this.trackName === name && this.bus && this.timer !== null) return

    const now = this.ctx.currentTime
    this.fadeOutCurrent(Math.max(0.05, fade * 0.6))

    const bus = this.ctx.createGain()
    bus.gain.setValueAtTime(0.0001, now)
    bus.gain.linearRampToValueAtTime(track.gain ?? 1, now + Math.max(0.02, fade))
    bus.connect(this.dest)

    this.bus = bus
    this.track = track
    this.trackName = name
    this.bar = 0
    // A beat of headroom so the first bar is scheduled ahead of the clock like
    // every other bar, instead of racing it.
    this.nextBarTime = now + 0.08
    this.stopAt = Infinity
    this.tick()
    if (this.timer === null) this.timer = setInterval(() => this.tick(), TICK_MS)
  }

  stop(fade = 0.5): void {
    this.fadeOutCurrent(fade)
    this.track = null
    this.trackName = ''
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  setIntensity(v: number): void {
    this.intensity = clamp01(v)
  }

  /** Detach from the graph — the engine calls this if it ever rebuilds. */
  dispose(): void {
    this.stop(0.05)
  }

  private fadeOutCurrent(fade: number): void {
    const bus = this.bus
    if (!bus) return
    const now = this.ctx.currentTime
    const g = bus.gain
    g.cancelScheduledValues(now)
    g.setValueAtTime(Math.max(0.0001, g.value), now)
    g.linearRampToValueAtTime(0.0001, now + Math.max(0.02, fade))
    // Let the tail ring out, then drop the node.
    const dying = bus
    setTimeout(() => dying.disconnect(), Math.ceil(fade * 1000) + 2500)
    this.bus = null
  }

  private tick(): void {
    const track = this.track
    const bus = this.bus
    if (!track || !bus) return
    const now = this.ctx.currentTime
    const barDur = barSeconds(track)
    const bars = trackBars(track)

    // If the page was frozen (a tab in the background, a long GC) the clock has
    // run away from us. Re-anchor to the next whole bar instead of dumping a
    // hundred bars of catch-up notes into the graph at once.
    if (this.nextBarTime < now - barDur) {
      const skipped = Math.floor((now - this.nextBarTime) / barDur) + 1
      this.bar += skipped
      this.nextBarTime += skipped * barDur
    }

    while (this.nextBarTime < now + LOOKAHEAD) {
      if (this.bar >= bars && track.once) {
        this.stopAt = this.nextBarTime
        break
      }
      scheduleBar(this.ctx, track, this.bar % bars, this.nextBarTime, this.intensity, bus, this.send)
      this.nextBarTime += barDur
      this.bar++
    }

    if (this.stopAt !== Infinity && now >= this.stopAt) this.stop(0.4)
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}
