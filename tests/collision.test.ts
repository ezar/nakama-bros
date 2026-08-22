import { describe, expect, it } from 'vitest'
import { FIXED_DT, TILE } from '../src/types'
import { bodyRect, makeBody, moveBody } from '../src/physics/move'
import { makeMap, playerBody, step } from './helpers'

const feet = (b: { y: number }) => b.y

describe('walls', () => {
  it('does not tunnel through a one-tile wall at any playable speed', () => {
    // Fastest thing in the game is a Gear 2 dash; test far past it.
    for (const speed of [240, 480, 900, 2400, 6000]) {
      const map = makeMap([
        '..........',
        '..........',
        '....#.....',
        '....#.....',
        '##########',
      ])
      const body = playerBody(1.5, 4)
      body.grounded = true
      // Hold the stick into the wall: the speed is re-applied every step, the
      // way acceleration would.
      for (let i = 0; i < 20; i++) {
        body.vx = speed
        step(body, map)
      }
      expect(body.x, `speed ${speed}`).toBeLessThan(4 * TILE)
      expect(body.onWall, `speed ${speed}`).toBe(1)
    }
  })

  it('stops against a wall without losing the jump', () => {
    const map = makeMap([
      '....#.....',
      '....#.....',
      '....#.....',
      '....#.....',
      '##########',
    ])
    const body = playerBody(2, 4)
    body.vy = -260
    for (let i = 0; i < 8; i++) {
      body.vx = 300
      step(body, map)
    }
    // Blocked horizontally, but the rise is untouched: axes are independent.
    expect(body.vx).toBe(0)
    expect(body.vy).toBe(-260)
    expect(body.onWall).toBe(1)
  })
})

describe('one-way platforms', () => {
  const map = () => makeMap([
    '..........',
    '..........',
    '..====....',
    '..........',
    '##########',
  ])

  it('blocks a body falling onto it', () => {
    const m = map()
    const body = playerBody(3.5, 1.4)
    body.vy = 120
    for (let i = 0; i < 30; i++) step(body, m)
    expect(body.grounded).toBe(true)
    expect(feet(body)).toBeCloseTo(2 * TILE, 1)
  })

  it('blocks a fast body that would cross it in a single step', () => {
    const m = map()
    // Starts just above the platform and moves a tile and a half in one step.
    const body = playerBody(3.5, 1.99)
    body.vy = 1500
    step(body, m)
    expect(body.grounded).toBe(true)
    expect(feet(body)).toBeCloseTo(2 * TILE, 1)
  })

  it('lets a body rise through it from below', () => {
    const m = map()
    const body = playerBody(3.5, 3.9)
    body.vy = -300
    for (let i = 0; i < 8; i++) step(body, m)
    expect(feet(body)).toBeLessThan(2 * TILE)
    expect(body.grounded).toBe(false)
  })

  it('does not catch a body whose feet start below the surface', () => {
    const m = map()
    // Feet a few units under the lip, drifting up slowly: nothing to stand on.
    const body = playerBody(3.5, 2.3)
    body.vy = -40
    for (let i = 0; i < 5; i++) step(body, m)
    expect(body.grounded).toBe(false)
  })

  it('is droppable with down + jump', () => {
    const m = map()
    const body = playerBody(3.5, 1.4)
    body.vy = 150
    for (let i = 0; i < 30; i++) step(body, m)
    expect(body.grounded).toBe(true)

    // The drop-through window: the same platform stops blocking.
    for (let i = 0; i < 20; i++) {
      body.vy += 300 * FIXED_DT
      step(body, m, { dropThrough: true })
    }
    expect(feet(body)).toBeGreaterThan(2 * TILE + 4)
  })

  it('catches the body again once the window closes', () => {
    const m = map()
    const body = playerBody(3.5, 1.2)
    body.vy = 200
    for (let i = 0; i < 40; i++) step(body, m)
    const landedAt = feet(body)
    expect(landedAt).toBeCloseTo(2 * TILE, 1)
    // A later frame with no drop request keeps standing.
    step(body, m)
    expect(body.grounded).toBe(true)
  })
})

describe('forgiveness', () => {
  it('nudges a rising body past a ceiling corner instead of killing the jump', () => {
    const map = makeMap([
      '..........',
      '###.......',
      '..........',
      '..........',
      '##########',
    ])
    // The head starts just under the block, overlapping its right edge by two
    // units: a graze, not a collision.
    const body = playerBody(0, 4)
    body.x = 3 * TILE - 2 + 13 / 2
    body.y = 2 * TILE + 30 + 1
    body.vy = -300
    const res = step(body, map)
    expect(res.cornerNudged).toBe(true)
    expect(res.ceiling).toBe(false)
    expect(body.vy).toBe(-300)
    expect(body.x).toBeGreaterThan(3 * TILE - 13 / 2 + 2)
  })

  it('still stops a body that is properly under a ceiling', () => {
    const map = makeMap([
      '..........',
      '###.......',
      '..........',
      '..........',
      '##########',
    ])
    const body = playerBody(1.5, 4)
    body.y = 2 * TILE + 30 + 1
    body.vy = -300
    const res = step(body, map)
    expect(res.ceiling).toBe(true)
    expect(body.vy).toBe(0)
  })

  it('catches a ledge a jump landed a unit or two short of', () => {
    const map = makeMap([
      '..........',
      '..........',
      '..........',
      '.....#####',
      '##########',
    ])
    const body = playerBody(4, 3)
    // Drifting into the lip with the feet one unit low: the classic near-miss.
    body.y = 3 * TILE + 1
    body.vy = 0
    let res = step(body, map)
    for (let i = 0; i < 4 && res.steppedUp === 0; i++) {
      body.vx = 200
      res = step(body, map)
    }
    expect(res.steppedUp).toBeGreaterThan(0)
    expect(res.steppedUp).toBeLessThanOrEqual(2.5)
    expect(body.grounded).toBe(true)
    expect(feet(body)).toBeCloseTo(3 * TILE, 2)
  })

  it('does not let a body climb a wall it should not', () => {
    const map = makeMap([
      '..........',
      '.....#....',
      '.....#....',
      '.....#....',
      '##########',
    ])
    const body = playerBody(4, 4)
    body.grounded = true
    body.vx = 200
    for (let i = 0; i < 40; i++) step(body, map)
    expect(feet(body)).toBeCloseTo(4 * TILE, 1)
    expect(body.x).toBeLessThan(5 * TILE)
  })
})

describe('bodies that do not walk', () => {
  it('treats a slope as a solid block for projectiles', () => {
    const map = makeMap([
      '..........',
      '..........',
      '...../....',
      '##########',
    ])
    const shot = makeBody(2 * TILE, 3 * TILE - 2, 5, 5)
    shot.vx = 400
    for (let i = 0; i < 10; i++) moveBody(shot, map, FIXED_DT, { useSlopes: false })
    expect(shot.x).toBeLessThan(6 * TILE)
  })

  it('keeps the hitbox rect anchored to the feet', () => {
    const b = makeBody(100, 200, 13, 30)
    const r = bodyRect(b)
    expect(r.x).toBe(100 - 6.5)
    expect(r.y).toBe(170)
    expect(r.w).toBe(13)
    expect(r.h).toBe(30)
  })
})
