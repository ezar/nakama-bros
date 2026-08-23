import { describe, expect, it } from 'vitest'
import { FIXED_DT, RENDER_SCALE } from '../src/types'
import { Camera } from '../src/engine/camera'

/**
 * The draw origin has two jobs that pull against each other: land the art on
 * whole device pixels so nothing shimmers, and quantise as little as possible
 * so the scroll does not step. It used to round to a whole *world* unit, which
 * is three device pixels — enough that a full-speed run scrolled in alternating
 * 3-and-4 unit jumps.
 */
const px = (v: number): number => v * RENDER_SCALE

/** Run the camera along a straight sprint and collect its rounding residual. */
function residuals(speed: number, steps = 240): number[] {
  const cam = new Camera()
  cam.setBounds(100000, 4000)
  let x = 4000
  cam.snapTo(x, 500)
  const out: number[] = []
  for (let i = 0; i < steps; i++) {
    x += speed * FIXED_DT
    cam.update(FIXED_DT, x, 500, speed, true)
    const o = cam.renderOrigin()
    // Everything the origin is built from, unrounded. Shake is off here, so
    // the only difference between the two is the snap.
    const look = (cam as unknown as { lookOffset: number }).lookOffset
    out.push(o.x - (cam.x + look))
  }
  return out
}

describe('camera draw origin', () => {
  it('lands on a whole device pixel, so art rasterised at ART_SCALE stays crisp', () => {
    const cam = new Camera()
    cam.setBounds(100000, 4000)
    cam.snapTo(4000, 500)
    let x = 4000
    for (let i = 0; i < 300; i++) {
      x += 168 * FIXED_DT
      cam.update(FIXED_DT, x, 500, 168, true)
      const o = cam.renderOrigin()
      expect(Number.isInteger(Math.round(px(o.x))), `x ${o.x}`).toBe(true)
      expect(Math.abs(px(o.x) - Math.round(px(o.x))), `x ${o.x}`).toBeLessThan(1e-9)
      expect(Math.abs(px(o.y) - Math.round(px(o.y))), `y ${o.y}`).toBeLessThan(1e-9)
    }
  })

  it('quantises to a device pixel and not to a world unit', () => {
    // A world-unit round would put the residual anywhere in ±0.5 units, three
    // device pixels peak to peak. The device grid bounds it at one.
    for (const speed of [40, 90, 168, 240]) {
      const r = residuals(speed)
      const swing = Math.max(...r) - Math.min(...r)
      expect(px(swing), `speed ${speed}`).toBeLessThanOrEqual(1.0000001)
    }
  })

  it('never lets the origin drift away from the camera it is standing in for', () => {
    for (const speed of [40, 168, 240]) {
      for (const d of residuals(speed)) {
        expect(Math.abs(px(d)), `speed ${speed}`).toBeLessThanOrEqual(0.5000001)
      }
    }
  })

  it('holds the player at a steady offset once the look-ahead has settled', () => {
    const cam = new Camera()
    cam.setBounds(100000, 4000)
    cam.snapTo(4000, 500)
    let x = 4000
    const screen: number[] = []
    for (let i = 0; i < 400; i++) {
      x += 168 * FIXED_DT
      cam.update(FIXED_DT, x, 500, 168, true)
      // Sample only after the look-ahead has had many half-lives to converge.
      if (i > 200) screen.push(x - cam.renderOrigin().x)
    }
    // What is left is quantisation alone: one device pixel, no more.
    const swing = Math.max(...screen) - Math.min(...screen)
    expect(px(swing)).toBeLessThanOrEqual(1.0000001)
  })
})
