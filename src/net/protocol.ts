import { GHOST_ANIMS } from '../game/ghost'
import type { CrewId } from '../types'

/**
 * What the two phones say to each other.
 *
 * ## Why so little crosses the wire
 *
 * A race is not a shared simulation. Each side runs its own copy of the stage,
 * with its own enemies, its own physics and its own clock, and neither can
 * touch the other's. What travels is only where the other body *is*, so it can
 * be drawn — the same thing a ghost recording carries, only arriving as it
 * happens instead of out of `localStorage`.
 *
 * That is the whole reason this is buildable. Two phones cannot agree on a
 * simulation: `Math.sin` is not required to give the same last bits on two
 * different engines, and there are fifty-four trigonometric calls inside the
 * step. Lockstep between an iPhone and a Pixel would drift apart quietly, and
 * the players would find out when one of them saw a death the other did not.
 * Nothing here can drift, because nothing here is agreed on.
 *
 * ## Why the pose stream is unreliable and unordered
 *
 * A pose that arrives late is worse than a pose that never arrives: the
 * position it describes has already been superseded, and inserting it moves
 * the opponent backwards. Every pose is a complete statement of where the body
 * is, so a dropped one costs a frame of smoothness and nothing else. Control
 * messages — who is here, when to start, who finished — go down a second,
 * reliable channel, because losing one of those loses the race.
 */

/** Bumped when any message shape below changes. Refused on sight if it differs. */
export const PROTOCOL_VERSION = 1

/** Poses per second on the wire. Above the ghost's rate; it is live. */
export const NET_POSE_HZ = 15

/**
 * How long to keep drawing an opponent that has gone quiet.
 *
 * A phone that locks, a hand over the antenna, a walk into the next room. Two
 * seconds is long enough to ride out a stall and short enough that a player is
 * not left racing something that stopped existing.
 */
export const PEER_TIMEOUT = 2

/** Everything that goes down the reliable channel. */
export type Control =
  | { t: 'hello'; v: number; name: string; crew: CrewId }
  | { t: 'stage'; level: string }
  /** Round-trip probe. `at` is echoed back untouched. See `session.ts`. */
  | { t: 'ping'; at: number }
  | { t: 'pong'; at: number }
  /** Start racing in this many milliseconds from receipt. */
  | { t: 'go'; inMs: number }
  | { t: 'done'; seconds: number }
  | { t: 'gaveUp' }

/** One body, at one moment, as it goes over the wire. */
export interface NetPose {
  x: number
  y: number
  facing: 1 | -1
  anim: string
  /** Sender's milliseconds since its own start. Orders poses; see `apply`. */
  at: number
}

/*
  A pose is eight bytes, laid out by hand rather than sent as JSON.

  Not for the bandwidth — fifteen poses a second is nothing either way. It is
  because a fixed-width record cannot be half-parsed: a datagram is either the
  right length and reads correctly, or it is the wrong length and is dropped.
  JSON over an unreliable channel gives a third outcome, a message that parses
  into a body somewhere impossible, and that one is the one that ends up on
  screen.
*/
const POSE_BYTES = 8
const Y_BIAS = 128

export function packPose(p: NetPose): ArrayBuffer {
  const buf = new ArrayBuffer(POSE_BYTES)
  const view = new DataView(buf)
  view.setUint16(0, Math.max(0, Math.min(0xffff, Math.round(p.x))))
  view.setUint16(2, Math.max(0, Math.min(0xffff, Math.round(p.y) + Y_BIAS)))
  const anim = Math.max(0, GHOST_ANIMS.indexOf(p.anim as (typeof GHOST_ANIMS)[number]))
  view.setUint8(4, ((anim & 0x7f) << 1) | (p.facing === 1 ? 1 : 0))
  // Milliseconds since the sender started, in three bytes: nine hours, which
  // is longer than any stage clock and long enough not to think about.
  const at = Math.max(0, Math.min(0xffffff, Math.round(p.at)))
  view.setUint8(5, (at >> 16) & 0xff)
  view.setUint16(6, at & 0xffff)
  return buf
}

/** Null for anything that is not exactly one pose. */
export function unpackPose(data: ArrayBuffer): NetPose | null {
  if (data.byteLength !== POSE_BYTES) return null
  const view = new DataView(data)
  const packed = view.getUint8(4)
  return {
    x: view.getUint16(0),
    y: view.getUint16(2) - Y_BIAS,
    facing: (packed & 1) === 1 ? 1 : -1,
    anim: GHOST_ANIMS[packed >> 1] ?? 'idle',
    at: (view.getUint8(5) << 16) | view.getUint16(6),
  }
}

/**
 * Read a control message, or null.
 *
 * Every field is checked rather than trusted. This is parsing input from
 * another device, and while that device is almost certainly the same game on
 * a sibling's phone, "almost certainly" is not a thing to hand to the level
 * loader — a bad stage id would ask for a level that does not exist, in the
 * middle of starting one.
 */
export function readControl(raw: unknown): Control | null {
  if (typeof raw !== 'string') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const m = parsed as Record<string, unknown>
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  switch (m.t) {
    case 'hello':
      return num(m.v) === null || typeof m.name !== 'string' || typeof m.crew !== 'string'
        ? null
        : { t: 'hello', v: m.v as number, name: m.name, crew: m.crew as CrewId }
    case 'stage':
      return typeof m.level === 'string' && m.level.length > 0 && m.level.length < 64
        ? { t: 'stage', level: m.level }
        : null
    case 'ping':
      return num(m.at) === null ? null : { t: 'ping', at: m.at as number }
    case 'pong':
      return num(m.at) === null ? null : { t: 'pong', at: m.at as number }
    case 'go':
      return num(m.inMs) === null ? null : { t: 'go', inMs: Math.max(0, Math.min(10_000, m.inMs as number)) }
    case 'done':
      return num(m.seconds) === null ? null : { t: 'done', seconds: Math.max(0, m.seconds as number) }
    case 'gaveUp':
      return { t: 'gaveUp' }
    default:
      return null
  }
}
