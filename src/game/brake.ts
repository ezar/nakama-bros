import { PHYS } from './config'

/**
 * When the body is being brought to a stop.
 *
 * This used to be a speed band — `|vx| > skidSpeed` — and that is the wrong
 * shape for it. A reversal crosses that threshold in two frames, so measured,
 * the skid drew for exactly one frame out of the ten a full-speed turn takes,
 * and the pivot was gated out above the same threshold: the most violent thing
 * in the game played almost no animation at all.
 *
 * What makes a brake a brake is that the body is going one way and is being
 * asked to stop or to go the other, and it lasts until the body agrees. It
 * lives here rather than inside `Player` so the suite can measure it without
 * art or a DOM, like the rest of the feel.
 */
export interface BrakeState {
  /** Whether the previous step was braking, which widens the exit threshold. */
  active: boolean
}

export const newBrake = (): BrakeState => ({ active: false })

export interface BrakeInput {
  grounded: boolean
  /** Crouches, slides and rolls have their own poses and are never a brake. */
  standing: boolean
  /** A signature move owns the whole body while it runs. */
  busy: boolean
  /** Horizontal input, -1..1. */
  want: number
  vx: number
}

/**
 * Advance the brake and report whether the body is braking now.
 *
 * The hysteresis matters both ways. Without it a release drops out of the brake
 * the moment it crosses back under `skidSpeed` and flashes two frames of run
 * between the skid and the idle; and a reversal out of a *walk* digs its heels
 * in for a single frame before pivoting. Below `skidSpeed` you do not skid, you
 * turn — which is the pivot's job, not this one's.
 */
export function stepBrake(s: BrakeState, i: BrakeInput): boolean {
  const speed = Math.abs(i.vx)
  const against = i.want !== 0 && Math.sign(i.want) !== Math.sign(i.vx) && i.vx !== 0
  const enter = s.active ? PHYS.idleSpeed : PHYS.skidSpeed
  s.active = i.grounded && i.standing && !i.busy && (against || i.want === 0) && speed > enter
  return s.active
}
