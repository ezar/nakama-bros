import { describe, expect, it } from 'vitest'
import { TILE } from '../src/types'
import { slopeSurfaceY } from '../src/physics/move'
import { makeMap, playerBody, step } from './helpers'

/**
 * A ramp is where tile collision usually shows its seams: the body stutters at
 * the joint, or floats off the top going down, or snags on the flat tile at the
 * end. All three are one bug — the resolver treating a surface as a stack of
 * boxes instead of as a surface.
 */

/** Ground: flat, up 45°, flat, down 45°, flat. Row 4 is the floor. */
const RAMP = [
  '..............',
  '..............',
  '..............',
  '...../##\\.....',
  '##############',
]

/** The terrain profile of RAMP as a continuous height field. */
const heightAt = (x: number): number => {
  if (x <= 5 * TILE) return 4 * TILE
  if (x <= 6 * TILE) return 4 * TILE - (x - 5 * TILE)
  if (x <= 8 * TILE) return 3 * TILE
  if (x <= 9 * TILE) return 3 * TILE + (x - 8 * TILE)
  return 4 * TILE
}

/**
 * Where a 13-wide box actually rests: on the highest ground under its
 * footprint, not on the ground under its centre. Half a body width of lead-in
 * at every crest is what a box on a height field does, and it is the reason
 * the transitions have no step in them.
 */
const surfaceAt = (x: number): number => Math.min(heightAt(x - 6), heightAt(x + 6))

describe('slope geometry', () => {
  it('reads the surface height across a rising tile', () => {
    const map = makeMap(RAMP)
    expect(slopeSurfaceY(map, 5, 3, 5 * TILE)).toBeCloseTo(4 * TILE, 5)
    expect(slopeSurfaceY(map, 5, 3, 5.5 * TILE)).toBeCloseTo(3.5 * TILE, 5)
    expect(slopeSurfaceY(map, 5, 3, 6 * TILE)).toBeCloseTo(3 * TILE, 5)
    expect(slopeSurfaceY(map, 6, 3, 6.5 * TILE)).toBeNull()
  })
})

describe('walking a ramp', () => {
  it('stays glued walking up and never leaves the ground', () => {
    const map = makeMap(RAMP)
    const body = playerBody(3, 4)
    body.grounded = true
    let leftGround = 0
    for (let i = 0; i < 90; i++) {
      body.vx = 168
      body.vy += 8 // a little gravity, as the Player applies every step
      step(body, map)
      if (body.x > 3.6 * TILE && body.x < 8 * TILE && !body.grounded) leftGround++
      if (body.grounded) expect(body.y).toBeCloseTo(surfaceAt(body.x), 0)
    }
    expect(leftGround).toBe(0)
    expect(body.grounded).toBe(true)
  })

  it('stays glued walking down and does not hop off the crest', () => {
    const map = makeMap(RAMP)
    const body = playerBody(7.5, 3)
    body.grounded = true
    let airborneFrames = 0
    for (let i = 0; i < 90; i++) {
      body.vx = 168
      body.vy += 8
      step(body, map)
      if (!body.grounded) airborneFrames++
      if (body.grounded) expect(body.y).toBeCloseTo(surfaceAt(body.x), 0)
    }
    // Down-slope is the case a naive resolver turns into a bounce sequence.
    expect(airborneFrames).toBe(0)
    expect(body.y).toBeCloseTo(4 * TILE, 1)
  })

  it('is seamless in both directions', () => {
    const map = makeMap(RAMP)
    for (const dir of [1, -1]) {
      const body = playerBody(dir === 1 ? 2 : 12, 4)
      body.grounded = true
      let worstJolt = 0
      let prevY = body.y
      for (let i = 0; i < 120; i++) {
        body.vx = dir * 150
        body.vy += 8
        step(body, map)
        if (body.grounded) worstJolt = Math.max(worstJolt, Math.abs(body.y - prevY))
        prevY = body.y
      }
      // At 150 px/s a 45° ramp climbs 2.5 units per step; anything much more
      // than that is a seam being crossed as a step rather than as a slope.
      expect(worstJolt, `dir ${dir}`).toBeLessThan(4)
      expect(body.grounded, `dir ${dir}`).toBe(true)
    }
  })

  it('does not slide while standing still on a ramp', () => {
    const map = makeMap(RAMP)
    const body = playerBody(5.5, 3.5)
    for (let i = 0; i < 60; i++) {
      body.vy += 12
      step(body, map)
    }
    expect(body.grounded).toBe(true)
    expect(body.x).toBeCloseTo(5.5 * TILE, 5)
    expect(body.y).toBeCloseTo(surfaceAt(body.x), 1)
    expect(body.groundAngle).toBeLessThan(0)
  })

  it('reports the ramp angle with the right sign', () => {
    const map = makeMap(RAMP)
    const up = playerBody(5.5, 3.5)
    const down = playerBody(8.5, 3.5)
    for (const b of [up, down]) {
      for (let i = 0; i < 20; i++) {
        b.vy += 12
        step(b, map)
      }
    }
    expect(up.groundAngle).toBeLessThan(0)
    expect(down.groundAngle).toBeGreaterThan(0)
  })

  it('lands on a ramp from a fall without sinking into it', () => {
    const map = makeMap(RAMP)
    const body = playerBody(5.5, 1)
    body.vy = 380
    for (let i = 0; i < 40; i++) step(body, map)
    expect(body.grounded).toBe(true)
    expect(body.y).toBeCloseTo(surfaceAt(body.x), 1)
  })
})
