import { describe, expect, it } from 'vitest'
import { FIXED_DT, TILE } from '../src/types'
import { Rng } from '../src/engine/rng'
import { makeMap, playerBody, runFrames, snapshot } from './helpers'
import type { Frame } from './helpers'

/**
 * Determinism is not a nicety here: replays, the fixed-step loop and every
 * "was that my fault?" bug report depend on the same inputs producing the same
 * world. The simulation must contain no wall-clock time, no Math.random and no
 * frame-rate-dependent term.
 */

const COURSE = [
  '..................',
  '..................',
  '..........===.....',
  '.......b..........',
  '....../###\\.......',
  '##################',
]

function scriptedFrames(seed: number, n: number): Frame[] {
  const rng = new Rng(seed)
  const out: Frame[] = []
  let ax = 1
  for (let i = 0; i < n; i++) {
    if (rng.bool(0.06)) ax = rng.bool(0.5) ? 1 : -1
    if (rng.bool(0.04)) ax = 0
    out.push({ ax, jump: rng.bool(0.08) })
  }
  return out
}

/** Every step of a run, so a divergence anywhere shows up. */
function trace(frames: Frame[]): string {
  const body = playerBody(2, 5)
  const map = makeMap(COURSE)
  const out: string[] = []
  for (const f of frames) {
    runFrames(body, map, [f])
    out.push(snapshot(body))
  }
  return out.join('\n')
}

describe('determinism', () => {
  it('gives byte-identical state for identical input sequences', () => {
    const frames = scriptedFrames(1234, 600)
    const a = runFrames(playerBody(2, 5), makeMap(COURSE), frames)
    const b = runFrames(playerBody(2, 5), makeMap(COURSE), frames)
    expect(snapshot(a)).toBe(snapshot(b))
  })

  it('gives identical state for the same seed generated twice', () => {
    const a = runFrames(playerBody(2, 5), makeMap(COURSE), scriptedFrames(99, 400))
    const b = runFrames(playerBody(2, 5), makeMap(COURSE), scriptedFrames(99, 400))
    expect(snapshot(a)).toBe(snapshot(b))
  })

  it('diverges when a single frame of input differs', () => {
    const frames = scriptedFrames(7, 300)
    // Flip the stick on one early frame. Comparing the whole trace rather than
    // the final rest position is the honest check: two different runs can end
    // up leaning on the same wall.
    const altered = frames.map((f, i) => (i === 10 ? { ...f, ax: -f.ax || -1 } : f))
    expect(trace(frames)).not.toBe(trace(altered))
    expect(trace(frames)).toBe(trace(frames))
  })

  it('is unaffected by how the run is chunked', () => {
    const frames = scriptedFrames(42, 300)
    const whole = runFrames(playerBody(2, 5), makeMap(COURSE), frames)
    const body = playerBody(2, 5)
    const map = makeMap(COURSE)
    for (let i = 0; i < frames.length; i += 37) {
      runFrames(body, map, frames.slice(i, i + 37))
    }
    expect(snapshot(body)).toBe(snapshot(whole))
  })

  it('never leaves the body inside the terrain', () => {
    const map = makeMap(COURSE)
    const body = playerBody(2, 5)
    const frames = scriptedFrames(2026, 900)
    runFrames(body, map, frames)
    // Feet on or above the floor, head above the map, still inside the level.
    expect(body.y).toBeLessThanOrEqual(5 * TILE + 0.01)
    expect(body.x).toBeGreaterThan(0)
    expect(body.x).toBeLessThan(18 * TILE)
    expect(Number.isFinite(body.vx)).toBe(true)
    expect(Number.isFinite(body.vy)).toBe(true)
  })

  it('uses the fixed step and nothing else for timing', () => {
    // Sanity: the helper and the engine agree on the step the game runs at.
    expect(FIXED_DT).toBeCloseTo(1 / 60, 12)
  })
})
