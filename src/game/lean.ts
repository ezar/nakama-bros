import { clamp } from '../engine/math'
import { PHYS } from './config'

/**
 * Overlapping action for a baked sprite.
 *
 * The frames are rasterised ahead of time, so the head cannot lag the hips as
 * its own part. But shearing the whole sprite about the feet does the same job:
 * the shoulders trail on the way into a run, overshoot when the body stops, and
 * whip when it turns. It is one number, it costs nothing at draw time, and it
 * is the difference between a body with weight and a picture being slid along.
 *
 * Lives here rather than inside `Player` so it can be measured headless, like
 * everything else that decides how the game feels.
 */
export interface LeanState {
  /** Radians of shear. Positive tips the shoulders back against +x travel. */
  lean: number
  vel: number
  /** Last horizontal velocity, to difference into an acceleration. */
  lastVx: number
}

export const newLean = (): LeanState => ({ lean: 0, vel: 0, lastVx: 0 })

/** Radians of shear at the hardest shove the body can give itself. */
export const LEAN_MAX = 0.13

/**
 * Underdamped on purpose (ζ ≈ 0.45): the overshoot on the way back to upright
 * is the whole point, and a critically damped version just eases flat and reads
 * as nothing happened. The clamp below is on the target, so the shear itself
 * whips past it — bounded, though, at about 0.178 rad in the worst case (a
 * reversal out of a settled lean), which still draws as a body tipping.
 */
const DAMPING = 13
const STIFFNESS_GROUND = 210
/** In the air there is nothing to push against, so the body only relaxes. */
const STIFFNESS_AIR = 90

/**
 * Advance the spring one step.
 *
 * Driven by acceleration rather than velocity — a body at a constant speed is
 * not leaning, it is running.
 */
export function stepLean(s: LeanState, vx: number, grounded: boolean, dt: number): void {
  if (dt <= 0) return
  const accel = (vx - s.lastVx) / dt
  s.lastVx = vx
  // PHYS.turnAccel is the strongest push the body gets; scale against it so the
  // lean is a fraction of "as hard as this character can shove".
  const target = grounded
    ? clamp((-accel / PHYS.turnAccel) * LEAN_MAX * 1.6, -LEAN_MAX, LEAN_MAX)
    : 0
  const stiffness = grounded ? STIFFNESS_GROUND : STIFFNESS_AIR
  s.vel += (target - s.lean) * stiffness * dt - s.vel * DAMPING * dt
  s.lean += s.vel * dt
}

/** Snap upright. Used when the body stops being a body — death, respawn. */
export function resetLean(s: LeanState): void {
  s.lean = 0
  s.vel = 0
  s.lastVx = 0
}
