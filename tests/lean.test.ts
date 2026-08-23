import { describe, expect, it } from 'vitest'
import { FIXED_DT } from '../src/types'
import { PHYS } from '../src/game/config'
import { LEAN_MAX, newLean, resetLean, stepLean } from '../src/game/lean'

/**
 * The lean is secondary motion, so there is nothing to assert about a single
 * frame of it — what matters is the shape over time: it tips into a push, it
 * overshoots on the way back, it settles, and it never folds the character in
 * half. Each test runs the spring at the fixed step the game runs at.
 */

/** Run `steps` frames at a constant acceleration, returning every lean value. */
function run(accel: number, steps: number, grounded = true, from = newLean()): number[] {
  const out: number[] = []
  let vx = from.lastVx
  for (let i = 0; i < steps; i++) {
    vx += accel * FIXED_DT
    stepLean(from, vx, grounded, FIXED_DT)
    out.push(from.lean)
  }
  return out
}

const peakOf = (xs: number[]): number =>
  xs.reduce((best, x) => (Math.abs(x) > Math.abs(best) ? x : best), 0)

describe('lean spring', () => {
  it('starts upright and stays upright while nothing pushes', () => {
    const s = newLean()
    expect(s.lean).toBe(0)
    for (const x of run(0, 60, true, s)) expect(x).toBe(0)
  })

  it('tips the shoulders into the direction of the push', () => {
    // Positive shear tips the top toward -x, so accelerating right must go
    // negative: the body leans into what it is accelerating toward.
    const right = run(PHYS.turnAccel, 30)
    const left = run(-PHYS.turnAccel, 30)
    expect(peakOf(right)).toBeLessThan(0)
    expect(peakOf(left)).toBeGreaterThan(0)
    expect(peakOf(right)).toBeCloseTo(-peakOf(left), 6)
  })

  it('leans further the harder the push', () => {
    const soft = Math.abs(peakOf(run(PHYS.turnAccel * 0.25, 30)))
    const hard = Math.abs(peakOf(run(PHYS.turnAccel, 30)))
    expect(hard).toBeGreaterThan(soft * 2)
  })

  it('never folds the character in half, however hard it is shoved', () => {
    // The clamp is on the spring's *target*, so the overshoot carries past it.
    // The worst case is not a standing start but a reversal out of a settled
    // lean the other way, so sweep both sides — including the instantaneous
    // stop of running into a wall.
    const SHOVES = [0.25, 1, 10, 1000]
    let worst = 0
    for (const a of SHOVES) {
      for (const b of SHOVES) {
        const s = newLean()
        run(-PHYS.turnAccel * a, 200, true, s)
        worst = Math.max(worst, Math.abs(peakOf(run(PHYS.turnAccel * b, 200, true, s))))
      }
    }
    // 0.178 rad ≈ 10°. Checked against the rendered sprite: the figure still
    // reads as a body tipping, not a body breaking, well past this.
    expect(worst).toBeGreaterThan(LEAN_MAX) // it really does whip past the cap
    expect(worst).toBeLessThan(LEAN_MAX * 1.4)
  })

  it('overshoots past upright when the push stops, then settles', () => {
    const s = newLean()
    run(PHYS.turnAccel, 30, true, s)
    const leaning = s.lean
    expect(Math.abs(leaning)).toBeGreaterThan(0.05)

    // Constant speed from here: no acceleration, so nothing to lean against.
    const after = run(0, 90, true, s)
    // It passes through upright and out the other side rather than easing flat.
    const other = after.filter((x) => Math.sign(x) === -Math.sign(leaning))
    expect(other.length).toBeGreaterThan(0)
    expect(Math.abs(peakOf(other))).toBeGreaterThan(Math.abs(leaning) * 0.1)
    expect(Math.abs(after[after.length - 1])).toBeLessThan(0.005)
  })

  it('whips harder through a reversal than into a standing start', () => {
    const start = Math.abs(peakOf(run(PHYS.turnAccel, 40)))

    const s = newLean()
    run(-PHYS.turnAccel, 40, true, s) // settle into a run to the left…
    const reverse = Math.abs(peakOf(run(PHYS.turnAccel, 40, true, s))) // …then turn
    expect(reverse).toBeGreaterThan(start)
  })

  it('relaxes toward upright in the air, where there is nothing to push against', () => {
    const s = newLean()
    run(PHYS.turnAccel, 30, true, s)
    expect(Math.abs(s.lean)).toBeGreaterThan(0.05)
    run(PHYS.turnAccel, 60, false, s)
    expect(Math.abs(s.lean)).toBeLessThan(0.01)
  })

  it('snaps upright on reset, so a death pose is not left tilted', () => {
    const s = newLean()
    run(PHYS.turnAccel, 20, true, s)
    expect(s.lean).not.toBe(0)
    resetLean(s)
    expect(s).toEqual({ lean: 0, vel: 0, lastVx: 0 })
  })

  it('ignores a zero or negative step rather than dividing by it', () => {
    const s = newLean()
    stepLean(s, 120, true, 0)
    stepLean(s, 120, true, -FIXED_DT)
    expect(s.lean).toBe(0)
    expect(Number.isFinite(s.lean)).toBe(true)
  })
})
