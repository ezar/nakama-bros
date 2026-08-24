import type { CrewId } from '../types'

/**
 * A recording of one run, for racing yourself.
 *
 * ## Why a pose track and not an input replay
 *
 * The engine is deterministic and tested for it, so replaying the *inputs* of
 * a run would reproduce it exactly — and that is the tempting design. It is
 * the wrong one here. An input replay is only faithful while the world it
 * replays into is byte-identical: the same level, the same physics constants,
 * the same entity spawn order, the same RNG draws. Every one of those changes
 * in normal development, and when one does the replay does not fail, it
 * *drifts* — the ghost walks into a wall and stands there twitching, which
 * reads as a broken game rather than as a stale recording.
 *
 * A pose track cannot drift. It stores where the body actually was, so it
 * replays the run that happened even if the stage has been rebuilt around it.
 * When a level changes enough to invalidate a ghost the result is obviously
 * wrong rather than subtly wrong, and the player can see that for themselves.
 *
 * ## Why it is packed into a string
 *
 * These live in `localStorage`, which is a handful of megabytes for the whole
 * origin and holds the save as well. A five-minute run at this sample rate is
 * a few thousand poses; as JSON numbers that is around ninety kilobytes per
 * stage, and nineteen stages of that would put the save itself at risk. Packed
 * it is about a fifth of that, which fits with room to spare.
 */

/** Poses per second. Twelve is plenty for something drawn as a silhouette. */
export const GHOST_HZ = 12

/**
 * Refuse to store a track longer than this many poses.
 *
 * At 12 Hz this is ten minutes — longer than any stage's clock. It exists so a
 * pathological run (a player who parks and goes to lunch) cannot quietly grow
 * the save until writing it starts throwing.
 */
export const GHOST_MAX_POSES = 7200

/**
 * Below this many poses a run is not worth keeping — a second of movement,
 * which is about what you get from walking into the first enemy.
 *
 * The *caller* checks it, not the recorder. Encoding and deciding what is
 * worth encoding are different jobs, and folding the second into the first
 * makes the format impossible to test without staging a full second of run.
 */
export const GHOST_MIN_POSES = GHOST_HZ

/**
 * Animation names a pose can carry, by index.
 *
 * Order is part of the stored format: appending is safe, reordering silently
 * rewrites every ghost anyone has saved. A name that is not on this list — a
 * signature move's own animation, say — records as `idle`, which is a ghost
 * that looks slightly wrong for a moment rather than one that fails to load.
 */
export const GHOST_ANIMS = [
  'idle', 'walk', 'run', 'jump', 'fall', 'land', 'skid', 'turn',
  'crouch', 'dash', 'climb', 'swim', 'attack', 'hurt', 'victory',
] as const

export interface GhostTrack {
  crew: CrewId
  /** Seconds the recorded run took. The reason one track beats another. */
  time: number
  /** Poses, five characters each. */
  data: string
}

/** One shadow on the stage: a run, and how to tell it apart from the others. */
export interface GhostRacer {
  track: GhostTrack
  /** Colour to wash the silhouette in, or null/absent for your own run. */
  tint?: string | null
}

export interface GhostPose {
  x: number
  y: number
  facing: 1 | -1
  anim: string
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const INDEX = new Map([...ALPHABET].map((c, i) => [c, i]))

/**
 * Positions are stored absolute, not as deltas.
 *
 * Deltas are the obvious way to make a track small, and they are wrong here.
 * Dying respawns the player at a checkpoint, which is a jump of however far
 * back that checkpoint was — hundreds of units, sometimes thousands. A delta
 * field wide enough for that is no smaller than storing the position outright,
 * and one that is not wide enough clips silently: the ghost never arrives at
 * the checkpoint and every pose after it is off by the difference, for the rest
 * of the run. Absolute costs the same four characters and cannot drift.
 *
 * x gets 13 bits (511 tiles, twice the longest stage) and y gets 11 with a
 * bias, so a body above the top of the map or below its floor still records.
 */
const X_BITS = 13
const Y_BIAS = 128
const X_MAX = (1 << X_BITS) - 1
const Y_MAX = (1 << (24 - X_BITS)) - 1

const clamp = (v: number, hi: number) => Math.max(0, Math.min(hi, Math.round(v)))

const packXY = (x: number, y: number): string => {
  const n = (clamp(x, X_MAX) << (24 - X_BITS)) | clamp(y + Y_BIAS, Y_MAX)
  return (
    ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] +
    ALPHABET[(n >> 6) & 63] + ALPHABET[n & 63]
  )
}

const unpackXY = (s: string, i: number): { x: number; y: number } => {
  const n =
    ((INDEX.get(s[i]) ?? 0) << 18) | ((INDEX.get(s[i + 1]) ?? 0) << 12) |
    ((INDEX.get(s[i + 2]) ?? 0) << 6) | (INDEX.get(s[i + 3]) ?? 0)
  return { x: n >>> (24 - X_BITS), y: (n & Y_MAX) - Y_BIAS }
}

/**
 * Accumulates poses during a run and packs them at the end.
 *
 * Sampling is driven by elapsed time rather than by a frame counter so the
 * track means the same thing whatever the loop is doing — a stutter or a
 * hit-stop must not stretch the recording relative to the clock the player is
 * being timed against.
 */
export class GhostRecorder {
  private parts: string[] = []
  private started = false
  private since = 0
  private elapsed = 0

  get poses(): number {
    return this.parts.length
  }

  /** Seconds recorded so far, on the same clock a finished track reports. */
  get seconds(): number {
    return this.elapsed
  }

  sample(dt: number, pose: GhostPose): void {
    this.elapsed += dt
    if (!this.started) {
      this.started = true
      this.push(pose)
      return
    }
    this.since += dt
    const step = 1 / GHOST_HZ
    if (this.since < step) return
    // One pose per tick even if several ticks' worth of time has passed: a
    // frame that took 200ms is a hiccup, not the player having moved four
    // times, and padding it out would put four identical poses in the track.
    this.since %= step
    if (this.parts.length < GHOST_MAX_POSES) this.push(pose)
  }

  private push(pose: GhostPose): void {
    const a = Math.max(0, GHOST_ANIMS.indexOf(pose.anim as (typeof GHOST_ANIMS)[number]))
    this.parts.push(
      packXY(pose.x, pose.y) + ALPHABET[((a << 1) | (pose.facing === 1 ? 1 : 0)) & 63],
    )
  }

  /** Null only when nothing was ever recorded. See `GHOST_MIN_POSES`. */
  finish(crew: CrewId): GhostTrack | null {
    if (this.parts.length === 0) return null
    return { crew, time: +this.elapsed.toFixed(2), data: this.parts.join('') }
  }
}

/**
 * Unpack a track into poses.
 *
 * Tolerant on purpose: this reads whatever `localStorage` hands over, which may
 * have been written by an older build or edited by hand. A truncated or
 * unreadable track yields the poses it could read rather than throwing, because
 * a short ghost is a small disappointment and an exception during level load is
 * a game that will not start.
 */
export function decodeGhost(track: GhostTrack): GhostPose[] {
  const out: GhostPose[] = []
  for (let i = 0; i + 5 <= track.data.length; i += 5) {
    const { x, y } = unpackXY(track.data, i)
    const packed = INDEX.get(track.data[i + 4]) ?? 0
    out.push({
      x,
      y,
      facing: (packed & 1) === 1 ? 1 : -1,
      anim: GHOST_ANIMS[packed >> 1] ?? 'idle',
    })
  }
  return out
}

/**
 * The pose at a given moment, interpolated between samples.
 *
 * Twelve poses a second is choppy if drawn as steps, and a ghost that stutters
 * next to a player running at sixty is distracting rather than informative.
 * Position is blended; the animation is not, because blending between two
 * animation names has no meaning.
 */
export function poseAt(poses: GhostPose[], t: number): GhostPose | null {
  if (poses.length === 0) return null
  const f = t * GHOST_HZ
  const i = Math.floor(f)
  if (i >= poses.length - 1) return poses[poses.length - 1]
  if (i < 0) return poses[0]
  const a = poses[i]
  const b = poses[i + 1]
  const k = f - i
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, facing: a.facing, anim: a.anim }
}
