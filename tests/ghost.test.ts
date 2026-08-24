import { describe, expect, it } from 'vitest'
import {
  GHOST_ANIMS, GHOST_HZ, GHOST_MAX_POSES, GHOST_MIN_POSES, GhostRecorder, decodeGhost, poseAt,
} from '../src/game/ghost'

/**
 * The ghost track format.
 *
 * It is a packed string in `localStorage`, which means every mistake in it is
 * silent: a rounding error is a ghost that drifts, a bad index is a ghost in
 * the wrong pose, and an unbounded length is a save that eventually refuses to
 * write. None of that throws on its own.
 */

const record = (poses: Array<[number, number, 1 | -1, string]>) => {
  const r = new GhostRecorder()
  for (const [x, y, facing, anim] of poses) r.sample(1 / GHOST_HZ, { x, y, facing, anim })
  return r
}

describe('ghost track', () => {
  it('round-trips a run pose for pose', () => {
    const input: Array<[number, number, 1 | -1, string]> = [
      [100, 200, 1, 'idle'], [112, 200, 1, 'run'], [126, 188, 1, 'jump'],
      [140, 205, -1, 'fall'], [140, 205, -1, 'land'],
    ]
    const track = record(input).finish('zoro')!
    expect(track.crew).toBe('zoro')
    const out = decodeGhost(track)
    expect(out.map((p) => [p.x, p.y, p.facing, p.anim])).toEqual(input)
  })

  it('survives a respawn, which teleports the body across the stage', () => {
    // The reason positions are absolute. Dying sends the player back to a
    // checkpoint hundreds or thousands of units behind; a delta format either
    // pays for that width on every pose or clips and stays wrong for the rest
    // of the run.
    const track = record([[4000, 200, 1, 'run'], [120, 300, 1, 'idle'], [4000, 200, 1, 'run']]).finish('luffy')!
    expect(decodeGhost(track).map((p) => p.x)).toEqual([4000, 120, 4000])
  })

  it('records a body above the ceiling or below the floor', () => {
    // Falling out of the world is a normal way to die, and y goes negative on
    // a high jump in a short stage.
    const track = record([[10, -100, 1, 'jump'], [10, 900, 1, 'fall']]).finish('luffy')!
    expect(decodeGhost(track).map((p) => p.y)).toEqual([-100, 900])
  })

  it('records an animation it has never heard of as idle', () => {
    // A signature move's own animation, or one added later. A ghost that looks
    // briefly wrong beats a track that will not decode.
    const track = record([[0, 0, 1, 'idle'], [1, 0, 1, 'gomu-gomu-no-nonsense']]).finish('luffy')!
    expect(decodeGhost(track)[1].anim).toBe('idle')
  })

  it('encodes whatever it was given and leaves the judgement to the caller', () => {
    // A one-pose run still encodes; whether it is worth saving is the game's
    // call, against GHOST_MIN_POSES.
    expect(record([[0, 0, 1, 'idle']]).finish('nami')).not.toBeNull()
    expect(new GhostRecorder().finish('nami')).toBeNull()
    expect(GHOST_MIN_POSES).toBeGreaterThan(1)
  })

  it('stops growing at the cap', () => {
    // A player who parks and walks away must not be able to grow the save
    // until writing it starts throwing.
    const r = new GhostRecorder()
    for (let i = 0; i < GHOST_MAX_POSES + 500; i++) r.sample(1 / GHOST_HZ, { x: i, y: 0, facing: 1, anim: 'run' })
    expect(r.poses).toBe(GHOST_MAX_POSES)
  })

  it('does not stretch when a frame takes far too long', () => {
    // Hit-stop, a tab coming back to the foreground, a slow frame: one pose per
    // tick regardless, or a stutter would put duplicate poses in the track and
    // desynchronise it from the clock the player is timed against.
    const r = new GhostRecorder()
    r.sample(1 / 60, { x: 0, y: 0, facing: 1, anim: 'idle' })
    r.sample(0.5, { x: 50, y: 0, facing: 1, anim: 'run' })
    expect(r.poses).toBe(2)
  })

  it('stays well inside a sane size for a full stage', () => {
    // Five minutes of running. The whole point of packing it.
    const r = new GhostRecorder()
    for (let i = 0; i < GHOST_HZ * 300; i++) r.sample(1 / GHOST_HZ, { x: i * 3, y: 200, facing: 1, anim: 'run' })
    const track = r.finish('luffy')!
    expect(JSON.stringify(track).length).toBeLessThan(24_000)
  })

  it('blends position between poses but never the animation', () => {
    const track = record([[0, 100, 1, 'run'], [120, 100, 1, 'jump']]).finish('luffy')!
    const poses = decodeGhost(track)
    const mid = poseAt(poses, 0.5 / GHOST_HZ)!
    expect(mid.x).toBeCloseTo(60)
    expect(mid.anim).toBe('run')
  })

  it('holds on the last pose once the recording runs out', () => {
    const track = record([[0, 0, 1, 'idle'], [10, 0, 1, 'run']]).finish('luffy')!
    const poses = decodeGhost(track)
    expect(poseAt(poses, 99)!.x).toBe(10)
    expect(poseAt([], 0)).toBeNull()
  })

  it('reads a truncated track instead of throwing', () => {
    const track = record([[0, 0, 1, 'idle'], [10, 0, 1, 'run'], [20, 0, 1, 'run']]).finish('luffy')!
    const cut = { ...track, data: track.data.slice(0, 12) }
    expect(decodeGhost(cut)).toHaveLength(2)
  })

  it('keeps the animation table append-only', () => {
    // Reordering this list silently rewrites every ghost anybody has saved.
    expect(GHOST_ANIMS.slice(0, 5)).toEqual(['idle', 'walk', 'run', 'jump', 'fall'])
    expect(GHOST_ANIMS.length).toBeLessThanOrEqual(32)
  })
})
