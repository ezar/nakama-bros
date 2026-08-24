import { CREW_IDS } from './config'
import { b64Bytes, bytesFromB64, checksum16 } from '../engine/bytes'
import type { CrewId } from '../types'
import {
  GHOST_ANIMS, GHOST_MAX_POSES, GHOST_MIN_POSES, decodeGhost, type GhostPose, type GhostTrack,
} from './ghost'

/**
 * Turning a run into something you can send to somebody.
 *
 * ## What a challenge is
 *
 * A recorded run plus who set it and where. The receiving game stores it as a
 * rival for that stage and races it exactly like the player's own ghost — same
 * playback, same drawing, different colour of label. Nothing is sent anywhere:
 * the whole run travels inside the code, so this works between two phones on
 * aeroplane mode passing a QR across a table.
 *
 * ## Why it is not just the stored track
 *
 * A stored track is five characters per pose, which is fine for
 * `localStorage` and much too fat for a link — a ninety-second run is five and
 * a half thousand characters, and a message that size arrives looking like
 * something went wrong. So the wire format is packed a second time, tighter,
 * against a property the storage format deliberately does not use: consecutive
 * poses are *close together*.
 *
 * Storage cannot use deltas because it must survive being decoded from an
 * arbitrary offset after a truncated write. A code is all-or-nothing — it is
 * verified whole before a single pose is read — so here deltas are free, and
 * they roughly halve it. A pose that would not fit a delta (the first one, and
 * every respawn) falls back to an absolute position, so nothing clips.
 *
 * ## Why there is a checksum
 *
 * A code travels through chat apps, which wrap lines, strip trailing
 * characters and occasionally swallow a fragment. Without a check a truncated
 * code decodes into a *shorter run* — a rival who vanishes half way and a time
 * that no longer matches what the sender saw. That is a bug report. With one,
 * a damaged code is refused up front and the player is told to ask for it
 * again, which is a small annoyance and the truth.
 */

/** Bumped when the layout below changes. A code from another version is refused. */
const CODE_VERSION = 1

/** What travels. */
export interface Challenge {
  levelId: string
  /** Who set it. Free text the sender typed, trimmed and length-capped. */
  name: string
  track: GhostTrack
}

const utf8 = (s: string): number[] => [...new TextEncoder().encode(s)]
const fromUtf8 = (bytes: number[]): string =>
  new TextDecoder().decode(Uint8Array.from(bytes))

/** Longest name that fits the header's length field, in UTF-8 bytes. */
export const NAME_MAX = 24

/**
 * Clean up a name that came from outside this game.
 *
 * The one string in the save that a *different person* wrote, and it goes on
 * screen next to their time. Control characters are flattened to spaces and
 * runs of space collapsed — not because anyone is attacking, but because a
 * name pasted out of a chat app can carry a newline, and finding that out by
 * watching it break the layout in front of a player is the wrong way round.
 */
export function readName(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const flat = [...raw].map((c) => (c < ' ' || c === '\u007f' ? ' ' : c)).join('')
  return capName(flat.replace(/ {2,}/g, ' ').trim())
}

/**
 * Shorten a name until it fits, without cutting a letter in half.
 *
 * The limit is in bytes because that is what the header counts, and the names
 * that go in here are Spanish ones — César, Begoña — where a letter can be two
 * bytes. Slicing the byte array directly would leave a dangling half-character
 * that decodes on the other phone as a replacement glyph, so the string is
 * shortened a character at a time until its encoding fits.
 */
export function capName(name: string): string {
  const chars = [...name.trim()]
  while (chars.length > 0 && utf8(chars.join('')).length > NAME_MAX) chars.pop()
  return chars.join('')
}

/**
 * The storage format's alphabet, spelled out here rather than shared.
 *
 * `packPose` at the bottom rebuilds the characters of a *stored* track, so
 * this is a fact about `ghost.ts` rather than a choice made here. It happens
 * to match base64url today; it must not start following it.
 */
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/** Marks a code as ours before a single bit is read. */
const PREFIX = 'NB1'

class BitWriter {
  private bytes: number[] = []
  private cur = 0
  private used = 0

  write(value: number, bits: number): void {
    for (let i = bits - 1; i >= 0; i--) {
      this.cur = (this.cur << 1) | ((value >>> i) & 1)
      if (++this.used === 8) {
        this.bytes.push(this.cur)
        this.cur = 0
        this.used = 0
      }
    }
  }

  /** Two's complement in `bits` bits. The reader sign-extends it back. */
  writeSigned(value: number, bits: number): void {
    this.write(value & ((1 << bits) - 1), bits)
  }

  finish(): number[] {
    return this.used > 0 ? [...this.bytes, (this.cur << (8 - this.used)) & 0xff] : [...this.bytes]
  }
}

class BitReader {
  private at = 0

  constructor(private readonly bytes: number[]) {}

  /** Bits still unread. Checked before every read that could run off the end. */
  get left(): number {
    return this.bytes.length * 8 - this.at
  }

  read(bits: number): number {
    let v = 0
    for (let n = 0; n < bits; n++) {
      const byte = this.bytes[this.at >> 3] ?? 0
      v = ((v << 1) | ((byte >> (7 - (this.at & 7))) & 1)) >>> 0
      this.at++
    }
    return v
  }

  readSigned(bits: number): number {
    const v = this.read(bits)
    const sign = 1 << (bits - 1)
    return (v & sign) !== 0 ? v - (1 << bits) : v
  }
}

/*
  Four ways to say where the body went, cheapest first. The class is two bits,
  so a pose costs those two plus whatever the class needs.

  The cheap one exists because of what a platformer body spends most of its
  time doing: running along flat ground, where the height does not change at
  all. Those poses carry no vertical field whatsoever, which is where most of
  the saving in this format comes from — a stage with long flat stretches packs
  to well under half of what it is stored as.
*/
/** Running on the level: a horizontal step, and no height field at all. */
const FLAT_X = 6
/** Airborne or on a slope: a step in both directions. */
const SMALL_X = 6
const SMALL_Y = 7
/** A dash, a launch, or a boss throwing you across the arena. */
const WIDE = 11
/**
 * Absolute, matching the storage format's field widths exactly. See `ghost.ts`.
 *
 * Twenty-four bits between them, which is four characters of the storage
 * alphabet — `packPose` below rebuilds those characters, so these two numbers
 * are not a choice made here, they are a fact about the other format.
 */
const ABS_X = 13
const ABS_Y = 11
const Y_BIAS = 128

const fits = (v: number, bits: number) => v >= -(1 << (bits - 1)) && v < 1 << (bits - 1)

/**
 * Pack a challenge into a code.
 *
 * Returns null when there is nothing worth sending: a run too short to be a
 * race, or one whose stage id or name will not fit the header. Refusing here
 * keeps the failure in the one place that can explain it, rather than
 * producing a code that the other phone rejects.
 */
export function encodeChallenge(challenge: Challenge): string | null {
  const poses = decodeGhost(challenge.track)
  if (poses.length < GHOST_MIN_POSES || poses.length > GHOST_MAX_POSES) return null

  const crew = CREW_IDS.indexOf(challenge.track.crew)
  if (crew < 0) return null

  const level = utf8(challenge.levelId)
  const name = utf8(capName(challenge.name))
  if (level.length === 0 || level.length > 31) return null

  const w = new BitWriter()
  w.write(CODE_VERSION, 6)
  w.write(crew, 4)
  // Centiseconds, which is the precision the timer is shown at anyway.
  w.write(Math.min(0xfffff, Math.max(0, Math.round(challenge.track.time * 100))), 20)
  w.write(level.length, 5)
  for (const b of level) w.write(b, 8)
  w.write(name.length, 5)
  for (const b of name) w.write(b, 8)
  w.write(poses.length, 14)

  let prev: GhostPose | null = null
  for (const pose of poses) {
    const anim = Math.max(0, GHOST_ANIMS.indexOf(pose.anim as (typeof GHOST_ANIMS)[number]))
    const same =
      prev !== null && prev.facing === pose.facing && prev.anim === pose.anim
    w.write(same ? 1 : 0, 1)
    if (!same) {
      w.write(anim, 4)
      w.write(pose.facing === 1 ? 1 : 0, 1)
    }
    const dx = prev ? pose.x - prev.x : 0
    const dy = prev ? pose.y - prev.y : 0
    if (prev && dy === 0 && fits(dx, FLAT_X)) {
      w.write(0, 2)
      w.writeSigned(dx, FLAT_X)
    } else if (prev && fits(dx, SMALL_X) && fits(dy, SMALL_Y)) {
      w.write(1, 2)
      w.writeSigned(dx, SMALL_X)
      w.writeSigned(dy, SMALL_Y)
    } else if (prev && fits(dx, WIDE) && fits(dy, WIDE)) {
      w.write(2, 2)
      w.writeSigned(dx, WIDE)
      w.writeSigned(dy, WIDE)
    } else {
      // The first pose, a respawn, or anything else that outran the deltas.
      w.write(3, 2)
      w.write(Math.max(0, Math.min((1 << ABS_X) - 1, pose.x)), ABS_X)
      w.write(Math.max(0, Math.min((1 << ABS_Y) - 1, pose.y + Y_BIAS)), ABS_Y)
    }
    prev = pose
  }

  const body = w.finish()
  if (body.length > 0xffff) return null
  const sum = checksum16(body)
  return PREFIX + b64Bytes([
    (body.length >> 8) & 0xff, body.length & 0xff,
    ...body,
    (sum >> 8) & 0xff, sum & 0xff,
  ])
}

/**
 * Read a code back, or null.
 *
 * Everything that can be checked is, and a failure at any point returns null
 * rather than a half-built challenge: this is fed by a paste box and by a URL
 * anyone can edit, and the caller's only sane response to any of it is the
 * same sentence about asking for the code again.
 */
export function decodeChallenge(code: string): Challenge | null {
  const start = code.indexOf(PREFIX)
  if (start < 0) return null
  /*
    What gets pasted is never just the code. It is a whole chat message, or a
    link with the code in its hash, or something a mail client wrapped over
    two lines mid-string. So everything that is not a code character is
    dropped — which rejoins a wrapped code, and also glues any words that
    followed it onto the end.

    That last part is why the body declares its own length. Trailing rubbish
    cannot be told apart from payload by looking at it, but it can be ignored
    by never reading past where the sender said the payload ended. A code that
    is *short* is still caught, by the checksum.
  */
  const raw = code.slice(start + PREFIX.length).replace(/[^A-Za-z0-9\-_]/g, '')
  const bytes = bytesFromB64(raw)
  if (!bytes || bytes.length < 6) return null

  const declared = (bytes[0] << 8) | bytes[1]
  if (bytes.length < 2 + declared + 2) return null
  const body = bytes.slice(2, 2 + declared)
  const sum = ((bytes[2 + declared] << 8) | bytes[2 + declared + 1]) & 0xffff
  if (checksum16(body) !== sum) return null

  const r = new BitReader(body)
  if (r.read(6) !== CODE_VERSION) return null
  const crew = CREW_IDS[r.read(4)]
  if (!crew) return null
  const time = r.read(20) / 100
  if (time <= 0) return null

  const levelLen = r.read(5)
  if (levelLen === 0 || r.left < levelLen * 8) return null
  const levelBytes: number[] = []
  for (let i = 0; i < levelLen; i++) levelBytes.push(r.read(8))
  const levelId = fromUtf8(levelBytes)

  const nameLen = r.read(5)
  if (r.left < nameLen * 8) return null
  const nameBytes: number[] = []
  for (let i = 0; i < nameLen; i++) nameBytes.push(r.read(8))
  const name = fromUtf8(nameBytes)

  const count = r.read(14)
  if (count < GHOST_MIN_POSES || count > GHOST_MAX_POSES) return null

  const parts: string[] = []
  let x = 0
  let y = 0
  let anim = 0
  let facing: 1 | -1 = 1
  for (let i = 0; i < count; i++) {
    // Cheapest possible pose is one bit of "same" plus two of class; the
    // class then says how much more to expect and each branch checks for it.
    if (r.left < 3) return null
    if (r.read(1) === 0) {
      if (r.left < 5) return null
      anim = r.read(4)
      facing = r.read(1) === 1 ? 1 : -1
    }
    const cls = r.read(2)
    if (cls === 0) {
      if (r.left < FLAT_X) return null
      x += r.readSigned(FLAT_X)
    } else if (cls === 1) {
      if (r.left < SMALL_X + SMALL_Y) return null
      x += r.readSigned(SMALL_X)
      y += r.readSigned(SMALL_Y)
    } else if (cls === 2) {
      if (r.left < WIDE * 2) return null
      x += r.readSigned(WIDE)
      y += r.readSigned(WIDE)
    } else {
      if (r.left < ABS_X + ABS_Y) return null
      x = r.read(ABS_X)
      y = r.read(ABS_Y) - Y_BIAS
    }
    parts.push(packPose(x, y, anim, facing))
  }

  return {
    levelId,
    name: capName(name),
    track: { crew: crew as CrewId, time, data: parts.join('') },
  }
}

/**
 * Re-emit one pose in the storage format.
 *
 * Deliberately written here rather than exported from `ghost.ts`: the storage
 * packer is fed by the recorder and rounds and clamps floats on the way in,
 * and reusing it would put a second, silent rounding step between a code and
 * the run it decodes to. These values are already integers and already in
 * range — the reader guaranteed it — so they are laid down as they are.
 */
function packPose(x: number, y: number, anim: number, facing: 1 | -1): string {
  const n = ((x & ((1 << ABS_X) - 1)) << ABS_Y) | ((y + Y_BIAS) & ((1 << ABS_Y) - 1))
  return (
    ALPHA[(n >> 18) & 63] + ALPHA[(n >> 12) & 63] + ALPHA[(n >> 6) & 63] + ALPHA[n & 63] +
    ALPHA[((anim << 1) | (facing === 1 ? 1 : 0)) & 63]
  )
}
