import type { SpriteSheet } from '../types'
import { SheetBuilder } from './atlas'
import { PAL } from './palette'
import { px, circle, ellipse, mix, type Surface } from './pixel'

/**
 * Sprite-based effects — the ones with a defined shape and a fixed number of
 * frames. Everything softer and more numerous (dust, embers, spray) is emitted
 * by the particle system instead.
 */

/** Expanding impact ring, used on stomps, heavy landings and boss hits. */
function impactRing(color: string) {
  return (s: Surface, t: number): void => {
    const ctx = s.ctx
    const cx = s.w / 2
    const cy = s.h / 2
    const r = 2 + t * (s.w / 2 - 3)
    ctx.globalAlpha = 1 - t
    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(1, 3 * (1 - t))
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 1
  }
}

/** Puff of dust for skids, landings and enemy defeats. */
function dustPuff(s: Surface, t: number): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const cy = s.h - 6
  ctx.globalAlpha = 1 - t * 0.9
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI - Math.PI * 0.1
    const d = t * 9
    ellipse(
      ctx,
      cx + Math.cos(a) * d * 1.4,
      cy - Math.sin(a) * d * 0.7,
      3.2 - t * 1.6,
      2.4 - t * 1.2,
      mix('#E8E2D2', '#B8B2A2', t),
    )
  }
  ctx.globalAlpha = 1
}

/** Water splash crown. */
function splash(s: Surface, t: number): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const cy = s.h - 4
  ctx.globalAlpha = 1 - t * 0.8
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i / 6 - 0.5) * 2.2
    const d = t * 14
    const r = 2.4 - t * 1.4
    circle(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.9, Math.max(0.6, r), i % 2 ? PAL.foam : PAL.seaLight)
  }
  ellipse(ctx, cx, cy, 8 * (0.4 + t), 2, mix(PAL.seaLight, PAL.foam, 1 - t))
  ctx.globalAlpha = 1
}

/** The classic star burst that replaces a defeated enemy. */
function poof(s: Surface, t: number): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const cy = s.h / 2
  ctx.globalAlpha = 1 - t
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + t * 1.4
    const d = 3 + t * 12
    const r = 3 - t * 2
    circle(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, Math.max(0.6, r), i % 2 ? PAL.cream : PAL.mist)
  }
  ctx.globalAlpha = 1
}

/** Speed lines that trail a Gear 2 dash. */
function speedLines(s: Surface, t: number): void {
  const ctx = s.ctx
  ctx.globalAlpha = 0.8 - t * 0.8
  for (let i = 0; i < 5; i++) {
    const y = 4 + i * 5
    const len = s.w * (0.3 + ((i * 7 + Math.round(t * 5)) % 5) / 8)
    px(ctx, s.w - len, y, len, 1, i % 2 ? PAL.cream : PAL.ember)
  }
  ctx.globalAlpha = 1
}

/** Steam that vents off the player in Gear 2. */
function steam(s: Surface, t: number): void {
  const ctx = s.ctx
  ctx.globalAlpha = (1 - t) * 0.75
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const d = 4 + t * 10
    circle(ctx, s.w / 2 + Math.cos(a) * d, s.h / 2 + Math.sin(a) * d - t * 8, 3.5 - t * 2, '#FFD9B0')
  }
  ctx.globalAlpha = 1
}

/** Bright flash frame used at the instant of a power-up. */
function flash(s: Surface, t: number): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const cy = s.h / 2
  ctx.globalAlpha = 1 - t
  circle(ctx, cx, cy, (s.w / 2) * (0.3 + t * 0.8), mix(PAL.white, PAL.gold, t))
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const len = s.w * 0.5 * (0.4 + t)
    ctx.strokeStyle = PAL.gold
    ctx.lineWidth = 2 * (1 - t)
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

function seq(draw: (s: Surface, t: number) => void, frames: number, dur: number) {
  return Array.from({ length: frames }, (_, i) => ({
    dur,
    draw: (s: Surface) => draw(s, i / (frames - 1 || 1)),
  }))
}

export function buildEffectSheets(): Record<string, SpriteSheet> {
  const mk = (draw: (s: Surface, t: number) => void, frames: number, dur: number, size: number) =>
    new SheetBuilder({ fw: size, fh: size, ox: -size / 2, oy: -size / 2, outline: null, rim: null })
      .add('play', seq(draw, frames, dur), { loop: false })
      .build()

  return {
    'impact-white': mk(impactRing(PAL.cream), 5, 0.035, 40),
    'impact-gold': mk(impactRing(PAL.gold), 5, 0.035, 48),
    'impact-red': mk(impactRing(PAL.danger), 5, 0.04, 56),
    dust: mk(dustPuff, 5, 0.05, 28),
    splash: mk(splash, 6, 0.05, 34),
    poof: mk(poof, 6, 0.045, 34),
    'speed-lines': mk(speedLines, 4, 0.04, 40),
    steam: mk(steam, 6, 0.055, 36),
    flash: mk(flash, 6, 0.04, 64),
  }
}
