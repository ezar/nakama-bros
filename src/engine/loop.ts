import { FIXED_DT } from '../types'

export interface LoopHandlers {
  /** Advance simulation by exactly `FIXED_DT`. */
  step(dt: number): void
  /** Draw. `alpha` blends the previous and current step for smooth motion. */
  render(alpha: number, frameDt: number): void
}

/**
 * Fixed-timestep loop with render interpolation and a spiral-of-death guard.
 * Physics determinism matters here: jump arcs must be identical on a 60 Hz
 * laptop and a 144 Hz monitor.
 */
export class GameLoop {
  private raf = 0
  private last = 0
  private acc = 0
  private running = false
  /** Frames of hit-stop still pending; the sim freezes while > 0. */
  private hitstop = 0

  constructor(private handlers: LoopHandlers) {}

  start(): void {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    this.acc = 0
    const tick = (now: number) => {
      if (!this.running) return
      this.raf = requestAnimationFrame(tick)
      let frameDt = (now - this.last) / 1000
      this.last = now
      // A tab that was backgrounded should resume, not fast-forward.
      if (frameDt > 0.25) frameDt = 0.25
      this.acc += frameDt

      let steps = 0
      while (this.acc >= FIXED_DT && steps < 5) {
        if (this.hitstop > 0) {
          this.hitstop--
        } else {
          this.handlers.step(FIXED_DT)
        }
        this.acc -= FIXED_DT
        steps++
      }
      if (steps === 5) this.acc = 0

      this.handlers.render(this.acc / FIXED_DT, frameDt)
    }
    this.raf = requestAnimationFrame(tick)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.raf)
  }

  /** Freeze the simulation for `frames` steps — the punch of a good impact. */
  addHitstop(frames: number): void {
    this.hitstop = Math.max(this.hitstop, frames)
  }

  get isRunning(): boolean {
    return this.running
  }
}
