import { describe, expect, it } from 'vitest'
import { TILE } from '../src/types'
import { headroom, wallAhead } from '../src/physics/move'
import { PHYS } from '../src/game/config'
import { makeMap, playerBody, simulateJump, step } from './helpers'

/**
 * Wall slide, wall jump and crouch live in `Player`, but every decision they
 * make is a query against the map. Those queries are what is tested here: get
 * them wrong and the character sticks to ramps, stands up inside ceilings, or
 * cannot tell which side the wall is on.
 */

const SHAFT = [
  '#....#',
  '#....#',
  '#....#',
  '#....#',
  '######',
]

describe('wall detection', () => {
  it('reports the side of the wall the body is pressed against', () => {
    const map = makeMap(SHAFT)
    const body = playerBody(1.5, 3)
    for (let i = 0; i < 12; i++) {
      body.vx = -200
      step(body, map)
    }
    expect(body.onWall).toBe(-1)
    expect(wallAhead(body, map, -1)).toBe(true)
    expect(wallAhead(body, map, 1)).toBe(false)
  })

  it('does not treat a ramp as a wall', () => {
    const map = makeMap([
      '......',
      '......',
      '..../#',
      '######',
    ])
    const body = playerBody(3.5, 3)
    body.grounded = true
    expect(wallAhead(body, map, 1)).toBe(false)
  })

  it('gives a wall jump about three tiles of rise', () => {
    const { peak } = simulateJump(PHYS.wallJumpTiles)
    expect(peak / TILE).toBeGreaterThan(2.7)
    expect(peak / TILE).toBeLessThan(3.3)
    // Lower than a full ground jump, so a wall is a route, not a free ride.
    expect(peak).toBeLessThan(simulateJump(3.7).peak)
  })

  it('kicks away from the wall far enough to reach the other side of a shaft', () => {
    // A four-tile shaft, crossed during the rise of a wall jump.
    const airTimeToApex = PHYS.wallJumpX > 0 ? 0.3 : 0
    expect(PHYS.wallJumpX * airTimeToApex).toBeGreaterThan(3 * TILE)
    expect(PHYS.wallJumpLock).toBeGreaterThan(0.1)
    expect(PHYS.wallJumpLock).toBeLessThan(0.25)
  })

  it('slides down a wall slower than it falls', () => {
    expect(PHYS.wallSlideSpeed).toBeLessThan(PHYS.maxFall * 0.25)
    expect(PHYS.wallSlideSpeedFast).toBeGreaterThan(PHYS.wallSlideSpeed)
    expect(PHYS.wallSlideSpeedFast).toBeLessThan(PHYS.maxFall)
  })
})

describe('crouching', () => {
  const GAP = [
    '........',
    '........',
    '###..###',
    '........',
    '########',
  ]

  it('refuses to stand up under a one-tile ceiling and accepts it outside', () => {
    const map = makeMap(GAP)
    const standing = 30
    const crouched = PHYS.crouchHeight
    // Under the low ceiling at tile 6: a crouched body fits, a standing one
    // does not, which is exactly what makes the passage a passage.
    expect(headroom(map, 6.5 * TILE, 4 * TILE, 13, standing)).toBe(false)
    expect(headroom(map, 6.5 * TILE, 4 * TILE, 13, crouched)).toBe(true)
    // Out in the open gap at tile 4, standing up is allowed again.
    expect(headroom(map, 4 * TILE, 4 * TILE, 13, standing)).toBe(true)
  })

  it('lets a crouched body pass under a gap a standing one cannot', () => {
    const map = makeMap([
      '........',
      '........',
      '..####..',
      '........',
      '########',
    ])
    const crouched = playerBody(1, 4)
    crouched.h = PHYS.crouchHeight
    crouched.grounded = true
    for (let i = 0; i < 90; i++) {
      crouched.vx = 150
      crouched.vy += 12
      step(crouched, map)
    }
    expect(crouched.x).toBeGreaterThan(6 * TILE)

    const standing = playerBody(1, 4)
    standing.grounded = true
    for (let i = 0; i < 90; i++) {
      standing.vx = 150
      standing.vy += 12
      step(standing, map)
    }
    expect(standing.x).toBeLessThan(2.4 * TILE)
  })

  it('keeps the feet of a shrinking body planted', () => {
    const map = makeMap(GAP)
    const body = playerBody(1.5, 4)
    body.grounded = true
    const feet = body.y
    body.h = PHYS.crouchHeight
    step(body, map)
    expect(body.y).toBeCloseTo(feet, 2)
  })

  it('is short enough to fit a one-tile passage with room to spare', () => {
    expect(PHYS.crouchHeight).toBeLessThan(TILE)
    expect(PHYS.crouchHeight).toBeGreaterThan(TILE * 0.7)
  })
})

describe('the crouch slide', () => {
  it('spends momentum rather than granting it', () => {
    // The boost is a nudge, and friction takes it back inside the slide time.
    expect(PHYS.slideBoost).toBeGreaterThan(1)
    expect(PHYS.slideBoost).toBeLessThan(1.3)
    const start = 168 * PHYS.slideBoost
    const end = Math.max(0, start - PHYS.slideFriction * PHYS.slideTime)
    expect(end).toBeLessThan(168 * 0.6)
  })

  it('needs a real run to start', () => {
    expect(PHYS.slideEnterSpeed).toBeGreaterThan(0.4)
    expect(PHYS.slideEnterSpeed).toBeLessThan(0.8)
  })
})
