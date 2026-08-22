import { describe, expect, it } from 'vitest'
import { FIXED_DT, TILE } from '../src/types'
import {
  CREW,
  CREW_IDS,
  PHYS,
  bufferOk,
  canJump,
  coyoteOk,
  jumpVelocityFor,
  newJumpMemory,
  tickJumpMemory,
} from '../src/game/config'
import { simulateJump } from './helpers'

/**
 * The feel table in SPEC.md is a contract with the player, so it is a contract
 * with the code. These tests measure the *simulated* result at the fixed step
 * the game actually runs at — a closed-form check would pass while the game
 * jumped two pixels short.
 */
describe('jump heights', () => {
  it('reaches the promised peak for every crew member', () => {
    for (const id of CREW_IDS) {
      const tiles = CREW[id].jumpTiles
      const { peak } = simulateJump(tiles)
      expect(peak, `${id} peak`).toBeGreaterThan(tiles * TILE - 0.6)
      expect(peak, `${id} peak`).toBeLessThan(tiles * TILE + 0.6)
    }
  })

  it('scales with the requested height', () => {
    expect(jumpVelocityFor(4)).toBeGreaterThan(jumpVelocityFor(3))
    expect(simulateJump(4).peak).toBeGreaterThan(simulateJump(3).peak + TILE * 0.9)
  })

  it('holds the button for about four tiles and taps for about one', () => {
    // "Un toque de salto sube una tile; mantenerlo, cerca de cuatro."
    const tiles = CREW.luffy.jumpTiles
    const held = simulateJump(tiles)
    const tap = simulateJump(tiles, 4)
    expect(held.peak / TILE).toBeGreaterThan(3.4)
    expect(held.peak / TILE).toBeLessThan(4.2)
    expect(tap.peak / TILE).toBeGreaterThan(0.8)
    expect(tap.peak / TILE).toBeLessThan(1.5)
  })

  it('produces a lower apex when the button is released early', () => {
    const tiles = CREW.luffy.jumpTiles
    const full = simulateJump(tiles).peak
    const short = simulateJump(tiles, 6).peak
    const shorter = simulateJump(tiles, 2).peak
    expect(short).toBeLessThan(full)
    expect(shorter).toBeLessThan(short)
    // The cut is a cut, not a stop: some rise survives it.
    expect(shorter).toBeGreaterThan(0)
    expect(simulateJump(tiles, 6).airTime).toBeLessThan(simulateJump(tiles).airTime)
  })
})

describe('coyote time', () => {
  it('allows a jump 100 ms after leaving the ground', () => {
    const m = newJumpMemory()
    tickJumpMemory(m, FIXED_DT, true, false)
    // Six fixed steps is exactly 100 ms.
    for (let i = 0; i < 6; i++) tickJumpMemory(m, FIXED_DT, false, false)
    expect(m.airTime).toBeCloseTo(PHYS.coyoteTime, 9)
    expect(coyoteOk(m)).toBe(true)
    tickJumpMemory(m, 0, false, true)
    expect(canJump(m)).toBe(true)
  })

  it('refuses a jump 101 ms after leaving the ground', () => {
    const m = newJumpMemory()
    tickJumpMemory(m, FIXED_DT, true, false)
    tickJumpMemory(m, 0.101, false, true)
    expect(coyoteOk(m)).toBe(false)
    expect(canJump(m)).toBe(false)
  })

  it('refills the moment the feet are back on the ground', () => {
    const m = newJumpMemory()
    tickJumpMemory(m, 0.5, false, false)
    expect(coyoteOk(m)).toBe(false)
    tickJumpMemory(m, FIXED_DT, true, false)
    expect(coyoteOk(m)).toBe(true)
  })
})

describe('jump buffering', () => {
  it('remembers a press made 120 ms before landing', () => {
    const m = newJumpMemory()
    tickJumpMemory(m, FIXED_DT, false, true)
    // Fall for the whole buffer window without touching the button. Seven
    // fixed steps is 116.7 ms: the last frame that still counts.
    for (let i = 0; i < 7; i++) tickJumpMemory(m, FIXED_DT, false, false)
    expect(m.sincePress).toBeLessThanOrEqual(PHYS.jumpBuffer + 1e-9)
    expect(bufferOk(m)).toBe(true)
    // Landing on this step: the remembered press is still good.
    tickJumpMemory(m, 0, true, false)
    expect(canJump(m)).toBe(true)
  })

  it('forgets a press made 121 ms before landing', () => {
    const m = newJumpMemory()
    tickJumpMemory(m, FIXED_DT, false, true)
    tickJumpMemory(m, 0.121, false, false)
    expect(bufferOk(m)).toBe(false)
    tickJumpMemory(m, 0, true, false)
    expect(canJump(m)).toBe(false)
  })

  it('is spent once and not twice', () => {
    const m = newJumpMemory()
    tickJumpMemory(m, FIXED_DT, true, true)
    expect(canJump(m)).toBe(true)
    m.airTime = Infinity
    m.sincePress = Infinity
    expect(canJump(m)).toBe(false)
  })
})

describe('the crew is a spread, not a ladder', () => {
  it('never gives one character both the best speed and the best jump', () => {
    const bySpeed = [...CREW_IDS].sort((a, b) => CREW[b].runSpeed - CREW[a].runSpeed)
    const byJump = [...CREW_IDS].sort((a, b) => CREW[b].jumpTiles - CREW[a].jumpTiles)
    expect(bySpeed[0]).not.toBe(byJump[0])
  })

  it('keeps every crew member within a readable band of each other', () => {
    const speeds = CREW_IDS.map((id) => CREW[id].runSpeed)
    const jumps = CREW_IDS.map((id) => CREW[id].jumpTiles)
    expect(Math.max(...speeds) / Math.min(...speeds)).toBeLessThan(1.35)
    expect(Math.max(...jumps) / Math.min(...jumps)).toBeLessThan(1.35)
  })
})
