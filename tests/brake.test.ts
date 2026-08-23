import { describe, expect, it } from 'vitest'
import { FIXED_DT } from '../src/types'
import { PHYS } from '../src/game/config'
import { newBrake, stepBrake, type BrakeInput } from '../src/game/brake'

/**
 * The skid used to be a speed band, and a reversal cleared it in two frames —
 * one drawn frame of brake for the most violent thing in the game. What these
 * measure is the *shape* of a brake over time: how many steps it covers, and
 * that it neither flickers on the way out nor fires where a pivot belongs.
 */

const TOP = 168
const base: BrakeInput = { grounded: true, standing: true, busy: false, want: 0, vx: 0 }

/** Run the brake alongside the real deceleration and return one flag per step. */
function run(vx0: number, want: number, steps = 20, over: Partial<BrakeInput> = {}): boolean[] {
  const s = newBrake()
  let vx = vx0
  const out: boolean[] = []
  for (let i = 0; i < steps; i++) {
    out.push(stepBrake(s, { ...base, ...over, want, vx }))
    // The same rates the player uses: turning is faster than merely stopping.
    const against = want !== 0 && Math.sign(want) !== Math.sign(vx)
    const rate = against ? PHYS.turnAccel : PHYS.decel
    const target = want === 0 ? 0 : want * TOP
    const step = rate * FIXED_DT
    vx = Math.abs(target - vx) <= step ? target : vx + Math.sign(target - vx) * step
  }
  return out
}

const count = (xs: boolean[]) => xs.filter(Boolean).length
/** True if the flag goes on, off, and on again — the flicker this replaced. */
const flickers = (xs: boolean[]) => /10+1/.test(xs.map((x) => (x ? '1' : '0')).join(''))

describe('braking', () => {
  it('covers a full-speed reversal instead of a single frame', () => {
    const xs = run(TOP, -1)
    expect(xs[0]).toBe(true)
    // The body crosses zero at turnAccel, which from top speed takes four
    // steps. The old speed band gave one.
    expect(count(xs)).toBeGreaterThanOrEqual(4)
    expect(flickers(xs)).toBe(false)
  })

  it('holds a full-speed stop all the way down to rest', () => {
    const xs = run(TOP, 0)
    expect(xs[0]).toBe(true)
    expect(count(xs)).toBeGreaterThanOrEqual(5)
    expect(xs[xs.length - 1]).toBe(false)
    // The hysteresis is the point: no run frames flashing between skid and idle.
    expect(flickers(xs)).toBe(false)
  })

  it('leaves a walking turn to the pivot', () => {
    // Below skid speed there is nothing to skid: that is the turn's job.
    expect(count(run(PHYS.skidSpeed - 20, -1))).toBe(0)
    expect(count(run(PHYS.skidSpeed - 20, 0))).toBe(0)
  })

  it('needs real speed to start, but will not let go until the body stops', () => {
    const s = newBrake()
    // Just under the entry threshold: nothing.
    expect(stepBrake(s, { ...base, vx: PHYS.skidSpeed - 1 })).toBe(false)
    // Over it: braking.
    expect(stepBrake(s, { ...base, vx: PHYS.skidSpeed + 1 })).toBe(true)
    // Now back under the entry threshold — it stays on, which it would not
    // have without the wider exit.
    expect(stepBrake(s, { ...base, vx: PHYS.skidSpeed - 40 })).toBe(true)
    expect(stepBrake(s, { ...base, vx: PHYS.idleSpeed })).toBe(false)
  })

  it('is a ground move, and never interrupts a body that is busy elsewhere', () => {
    for (const over of [{ grounded: false }, { standing: false }, { busy: true }]) {
      expect(count(run(TOP, -1, 20, over)), JSON.stringify(over)).toBe(0)
      expect(count(run(TOP, 0, 20, over)), JSON.stringify(over)).toBe(0)
    }
  })

  it('does not brake a body that is being asked to keep going the way it is', () => {
    expect(count(run(TOP, 1))).toBe(0)
    expect(count(run(20, 1))).toBe(0)
  })

  it('treats a dead stop as nothing to brake', () => {
    expect(count(run(0, 0))).toBe(0)
  })
})
