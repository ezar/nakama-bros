import type { SpriteSheet } from '../types'
import { SheetBuilder } from './atlas'
import { mix, rgba } from './color'
import { PAL } from './palette'
import { blob, crescentPath, curve, ellipsePath, radialFill, type Pt, type Surface } from './ink'

/**
 * Impact effects.
 *
 * These are drawn with no contour and composited additively, so they are built
 * from bright saturated shapes on transparent. The register that matters is
 * anime impact language: hard-edged stars and crescents that appear for two or
 * three frames and are gone, not soft puffs that linger.
 */

/** An expanding shockwave ring, squashed so it sits on the ground plane. */
function shockRing(color: string, flat = 0.42) {
  return (s: Surface, t: number): void => {
    const ctx = s.ctx
    const cx = s.w / 2
    const cy = s.h / 2
    const r = 2 + t * (s.w / 2 - 3)
    ctx.save()
    ctx.globalAlpha = (1 - t) ** 1.4
    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(0.4, 3.4 * (1 - t))
    ctx.beginPath()
    ctx.ellipse(cx, cy, r, r * flat, 0, 0, Math.PI * 2)
    ctx.stroke()
    // A brighter leading edge sells the speed of the expansion.
    ctx.globalAlpha = (1 - t) ** 2
    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth = Math.max(0.3, 1.4 * (1 - t))
    ctx.beginPath()
    ctx.ellipse(cx, cy, r * 1.03, r * flat * 1.03, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }
}

/** The four-point anime impact star. */
function impactStar(color: string) {
  return (s: Surface, t: number): void => {
    const ctx = s.ctx
    const cx = s.w / 2
    const cy = s.h / 2
    const grow = 0.35 + t * 0.8
    const fade = 1 - t
    ctx.save()
    ctx.globalAlpha = fade
    const pts: Pt[] = []
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8
      const long = i % 2 === 0
      const r = (long ? s.w * 0.48 : s.w * 0.12) * grow
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
    }
    ctx.fillStyle = color
    ctx.fill(blob(pts, 0.15))
    ctx.globalAlpha = fade * 0.9
    ctx.fillStyle = '#FFFFFF'
    ctx.fill(ellipsePath(cx, cy, s.w * 0.14 * grow, s.w * 0.14 * grow))
    ctx.restore()
  }
}

/** Volumetric dust: overlapping lobes that expand, thin and drift. */
function dust(tone: string) {
  return (s: Surface, t: number): void => {
    const ctx = s.ctx
    const cx = s.w / 2
    const cy = s.h - 5
    ctx.save()
    ctx.globalAlpha = (1 - t) * 0.9
    for (let i = 0; i < 6; i++) {
      const a = Math.PI + (i / 5) * Math.PI
      const d = t * 11
      const px = cx + Math.cos(a) * d * 1.5
      const py = cy + Math.sin(a) * d * 0.55
      const r = 3.4 * (1 - t * 0.5) * (0.7 + (i % 3) * 0.2)
      ctx.fillStyle = mix(tone, '#FFFFFF', 0.4 - t * 0.3)
      ctx.fill(ellipsePath(px, py, r, r * 0.82))
      ctx.fillStyle = mix(tone, '#8A93AE', t * 0.6)
      ctx.fill(ellipsePath(px + r * 0.2, py + r * 0.3, r * 0.6, r * 0.5))
    }
    ctx.restore()
  }
}

/** A splash crown with separating droplets. */
function splash(s: Surface, t: number): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const cy = s.h - 5
  ctx.save()
  ctx.globalAlpha = 1 - t * 0.85
  // Rising column.
  ctx.fillStyle = PAL.foam
  ctx.fill(blob([
    [cx - 4 * (1 + t), cy],
    [cx - 1.6, cy - 12 * t - 3],
    [cx + 1.6, cy - 13 * t - 3],
    [cx + 4 * (1 + t), cy],
  ] as Pt[], 0.7))
  // Droplets with tails.
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i / 6 - 0.5) * 2.3
    const d = t * 17
    const px = cx + Math.cos(a) * d
    const py = cy + Math.sin(a) * d * 0.95
    ctx.fillStyle = i % 2 ? PAL.foam : PAL.seaLight
    ctx.fill(ellipsePath(px, py, 1.5 - t, 2.2 - t, a + Math.PI / 2))
  }
  // Surface ring.
  ctx.strokeStyle = rgba(PAL.foam, 0.8)
  ctx.lineWidth = 1 - t * 0.6
  ctx.beginPath()
  ctx.ellipse(cx, cy, 5 + t * 12, 1.6 + t * 3, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

/** The puff an enemy leaves behind. */
function poof(s: Surface, t: number): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const cy = s.h / 2
  ctx.save()
  ctx.globalAlpha = 1 - t
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + t * 1.1
    const d = 2 + t * 13
    const r = 3.6 - t * 2.4
    ctx.fillStyle = i % 2 ? PAL.cream : PAL.mist
    ctx.fill(ellipsePath(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, r * 0.9))
  }
  ctx.restore()
}

/** Crescent trail behind a sword swing. */
function slashArc(s: Surface, t: number): void {
  const ctx = s.ctx
  const cx = s.w * 0.2
  const cy = s.h / 2
  ctx.save()
  ctx.globalAlpha = (1 - t) ** 1.2
  ctx.fillStyle = '#DFF4FF'
  ctx.fill(crescentPath(cx, cy, s.w * 0.72 * (0.7 + t * 0.5), 5 * (1 - t * 0.6), -1.1, 1.1))
  ctx.globalAlpha = (1 - t) * 0.8
  ctx.fillStyle = '#FFFFFF'
  ctx.fill(crescentPath(cx, cy, s.w * 0.72 * (0.7 + t * 0.5), 1.6 * (1 - t * 0.6), -0.9, 0.9))
  ctx.restore()
}

/** Speed lines that trail a dash. */
function speedLines(s: Surface, t: number): void {
  const ctx = s.ctx
  ctx.save()
  ctx.globalAlpha = (1 - t) * 0.85
  ctx.lineCap = 'round'
  for (let i = 0; i < 6; i++) {
    const y = 3 + i * (s.h - 6) / 5
    const len = s.w * (0.32 + ((i * 7 + Math.round(t * 5)) % 5) / 7)
    ctx.strokeStyle = i % 2 ? PAL.cream : PAL.ember
    ctx.lineWidth = 1 - i * 0.08
    ctx.beginPath()
    ctx.moveTo(s.w - len, y)
    ctx.lineTo(s.w - 1, y)
    ctx.stroke()
  }
  ctx.restore()
}

/** Steam venting from a powered-up body. */
function steam(s: Surface, t: number): void {
  const ctx = s.ctx
  ctx.save()
  ctx.globalAlpha = (1 - t) * 0.7
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    const d = 3 + t * 10
    const r = 3.8 - t * 2.2
    ctx.fillStyle = mix('#FFD9B0', '#FFFFFF', 1 - t)
    ctx.fill(ellipsePath(
      s.w / 2 + Math.cos(a) * d,
      s.h / 2 + Math.sin(a) * d - t * 9,
      r, r * 0.9,
    ))
  }
  ctx.restore()
}

/** Power-up flash: a hard star burst over a radial bloom. */
function flash(s: Surface, t: number): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const cy = s.h / 2
  radialFill(ctx, cx, cy, 0, (s.w / 2) * (0.35 + t), [
    [0, rgba('#FFFFFF', (1 - t) * 0.95)],
    [0.45, rgba(PAL.gold, (1 - t) * 0.5)],
    [1, rgba(PAL.gold, 0)],
  ])
  ctx.save()
  ctx.globalAlpha = (1 - t) ** 1.5
  ctx.strokeStyle = '#FFF6E8'
  ctx.lineCap = 'round'
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    const len = (s.w / 2) * (0.4 + t * 0.9)
    ctx.lineWidth = 2.4 * (1 - t)
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * len * 0.2, cy + Math.sin(a) * len * 0.2)
    ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len)
    ctx.stroke()
  }
  ctx.restore()
}

/** A pickup twinkle. */
function sparkle(s: Surface, t: number): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const cy = s.h / 2
  const grow = Math.sin(t * Math.PI)
  ctx.save()
  ctx.globalAlpha = grow
  ctx.fillStyle = '#FFFFFF'
  ctx.fill(blob([
    [cx, cy - s.h * 0.45 * grow],
    [cx + s.w * 0.1 * grow, cy],
    [cx, cy + s.h * 0.45 * grow],
    [cx - s.w * 0.1 * grow, cy],
  ] as Pt[], 0.2))
  ctx.fillStyle = PAL.gold
  ctx.fill(blob([
    [cx + s.w * 0.34 * grow, cy],
    [cx, cy + s.h * 0.07 * grow],
    [cx - s.w * 0.34 * grow, cy],
    [cx, cy - s.h * 0.07 * grow],
  ] as Pt[], 0.2))
  ctx.restore()
}

const seq = (draw: (s: Surface, t: number) => void, frames: number, dur: number) =>
  Array.from({ length: frames }, (_, i) => ({
    dur,
    draw: (s: Surface) => draw(s, i / (frames - 1 || 1)),
  }))

export function buildEffectSheets(): Record<string, SpriteSheet> {
  const mk = (draw: (s: Surface, t: number) => void, frames: number, dur: number, w: number, h = w) =>
    new SheetBuilder({ fw: w, fh: h, ox: -w / 2, oy: -h / 2, contour: null })
      .add('play', seq(draw, frames, dur), { loop: false })
      .build()

  return {
    'impact-white': mk(shockRing(PAL.cream), 5, 0.032, 40),
    'impact-gold': mk(shockRing(PAL.gold), 5, 0.032, 48),
    'impact-red': mk(shockRing(PAL.danger), 5, 0.036, 56),
    'impact-star': mk(impactStar(PAL.gold), 5, 0.03, 44),
    shockwave: mk(shockRing(PAL.cream, 0.22), 6, 0.03, 64),
    dust: mk(dust('#E8E2D2'), 6, 0.045, 30),
    'landing-dust-heavy': mk(dust('#D8D0BE'), 7, 0.045, 46),
    splash: mk(splash, 6, 0.045, 36),
    poof: mk(poof, 6, 0.04, 36),
    'slash-arc': mk(slashArc, 5, 0.03, 44, 34),
    'speed-lines': mk(speedLines, 4, 0.035, 42, 26),
    steam: mk(steam, 6, 0.05, 38),
    flash: mk(flash, 6, 0.038, 68),
    sparkle: mk(sparkle, 6, 0.04, 20),
  }
}

export { curve }
