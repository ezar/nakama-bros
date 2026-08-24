import { describe, expect, it } from 'vitest'
import { DESIGN_W, GAME_H, MAX_VIEW_W, viewWidthFor } from '../src/types'

/**
 * How wide the view opens for a given screen.
 *
 * The height is the design and never moves; the width is what stops a phone
 * held sideways from spending a fifth of its screen on black bars. The rules
 * that make that safe are here, because every one of them is invisible if it
 * breaks: the wrong width does not throw, it just frames the game wrong for
 * the whole session.
 */
describe('view width', () => {
  it('leaves a 16:9 screen exactly as designed', () => {
    // A laptop must render identically to before this existed.
    expect(viewWidthFor(1920, 1080)).toBe(DESIGN_W)
    expect(viewWidthFor(1280, 720)).toBe(DESIGN_W)
  })

  it('opens up on a phone held sideways', () => {
    // iPhone 15 Pro, Pixel 8: 2.17:1. The whole point.
    const w = viewWidthFor(852, 393)
    expect(w).toBeGreaterThan(DESIGN_W)
    expect(Math.abs(w / GAME_H - 852 / 393)).toBeLessThan(0.02)
  })

  it('never goes narrower than the design', () => {
    // A tall or square screen letterboxes vertically instead. Cropping the
    // authored width would hide level geometry the stage counts on.
    expect(viewWidthFor(1024, 768)).toBe(DESIGN_W)
    expect(viewWidthFor(400, 900)).toBe(DESIGN_W)
  })

  it('stops widening at an ultrawide', () => {
    // Past this you would see far enough ahead to be playing a different game
    // from the one the stage was built for.
    expect(viewWidthFor(5120, 1440)).toBe(MAX_VIEW_W)
    expect(viewWidthFor(3440, 1440)).toBeLessThanOrEqual(MAX_VIEW_W)
  })

  it('always lands on a multiple of four', () => {
    // The post chain downsamples the buffer by four and the buffer is three
    // times this width; an odd width puts that pass on a fractional canvas.
    for (let w = 300; w <= 3000; w += 7) {
      expect(viewWidthFor(w, 400) % 4, `${w}x400`).toBe(0)
    }
  })

  it('falls back to the design width for a screen it cannot measure', () => {
    // Zero-sized viewports happen: a hidden iframe, a tab restored in the
    // background. A NaN width here would take the whole renderer down.
    for (const [w, h] of [[0, 0], [800, 0], [0, 600], [-100, 200], [NaN, NaN]]) {
      expect(viewWidthFor(w, h)).toBe(DESIGN_W)
    }
  })
})
