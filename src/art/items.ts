import type { SpriteSheet } from '../types'
import { SheetBuilder } from './atlas'
import { PAL } from './palette'
import { px, circle, ellipse, mix, type Surface } from './pixel'

/**
 * Pickups. Every item spins or pulses so it separates from the static tile art
 * at a glance — a still item on a busy tileset simply disappears.
 */

/** Berry — the coin. A rotating gold coin stamped with the Jolly Roger. */
function drawBerry(s: Surface, t: number): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const cy = s.h / 2
  // Width oscillates to fake a 3D spin.
  const w = Math.abs(Math.cos(t * Math.PI * 2)) * 6 + 1
  ellipse(ctx, cx, cy, w, 7, PAL.goldDeep)
  ellipse(ctx, cx, cy, Math.max(0.6, w - 1.4), 5.6, PAL.gold)
  if (w > 3.5) {
    ellipse(ctx, cx, cy - 1.5, w * 0.45, 2, mix(PAL.gold, PAL.white, 0.55))
    px(ctx, cx - 1, cy - 1, 2, 2, PAL.goldDeep)
    px(ctx, cx - 2, cy + 1, 4, 1, PAL.goldDeep)
  }
}

/** Meat — the health/power pickup Luffy would sprint across a battlefield for. */
function drawMeat(s: Surface, t: number): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const cy = s.h / 2 + Math.round(Math.sin(t * Math.PI * 2) * 1)
  ellipse(ctx, cx + 1, cy, 6, 5, '#B5462E')
  ellipse(ctx, cx + 1, cy - 1, 5, 3.5, '#D96A46')
  px(ctx, cx - 7, cy - 1, 6, 3, '#F0E2C8')
  px(ctx, cx - 8, cy - 2, 3, 5, '#F0E2C8')
  px(ctx, cx - 1, cy - 3, 3, 2, mix('#D96A46', PAL.white, 0.4))
}

/** Devil fruit — the power-up. Swirl pattern, colour set by the tier. */
function fruit(color: string) {
  return (s: Surface, t: number): void => {
    const ctx = s.ctx
    const cx = s.w / 2
    const cy = s.h / 2 + Math.round(Math.sin(t * Math.PI * 2) * 1)
    circle(ctx, cx, cy, 7, mix(color, PAL.ink, 0.3))
    circle(ctx, cx, cy, 6, color)
    // Swirls: the fruit's signature marking.
    ctx.strokeStyle = mix(color, PAL.ink, 0.55)
    ctx.lineWidth = 1
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      ctx.arc(cx, cy, 2 + i * 2, t * Math.PI * 2, t * Math.PI * 2 + Math.PI * 1.2)
      ctx.stroke()
    }
    circle(ctx, cx - 2, cy - 2.5, 1.6, mix(color, PAL.white, 0.6))
    px(ctx, cx - 1, cy - 9, 2, 3, PAL.grassDeep)
    px(ctx, cx + 1, cy - 10, 4, 2, PAL.grass)
  }
}

/** Poneglyph fragment — the level's hidden collectible. */
function drawFragment(s: Surface, t: number): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const cy = s.h / 2 + Math.round(Math.sin(t * Math.PI * 2) * 1.5)
  px(ctx, cx - 5, cy - 7, 10, 14, '#3A4666')
  px(ctx, cx - 5, cy - 7, 10, 2, '#5C6A8C')
  px(ctx, cx - 4, cy + 5, 8, 2, '#242C44')
  ctx.fillStyle = mix(PAL.magic, PAL.white, 0.2 + Math.sin(t * Math.PI * 2) * 0.2)
  for (const [x, y, w, h] of [[-3, -5, 4, 1], [-3, -3, 2, 1], [0, -3, 3, 1], [-3, -1, 5, 1], [-2, 1, 3, 1], [-3, 3, 4, 1]]) {
    ctx.fillRect(cx + x, cy + y, w, h)
  }
}

/** Extra life — a tiny Going Merry figurehead. */
function drawOneUp(s: Surface, t: number): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const cy = s.h / 2 + Math.round(Math.sin(t * Math.PI * 2) * 1)
  ellipse(ctx, cx, cy + 3, 8, 3, '#C08B52')
  px(ctx, cx - 7, cy, 14, 3, '#8A5A32')
  circle(ctx, cx, cy - 3, 4.5, '#E8C86A')
  px(ctx, cx - 2, cy - 4, 4, 2, '#D6302E')
  px(ctx, cx - 4, cy - 2, 8, 1, '#B5462E')
  px(ctx, cx + 1, cy - 4, 1, 1, PAL.ink)
}

/** Checkpoint flag / level goal, drawn as a static prop with a waving cloth. */
function drawFlag(color: string) {
  return (s: Surface, t: number): void => {
    const ctx = s.ctx
    const cx = s.w / 2
    px(ctx, cx - 1, 2, 2, s.h - 4, PAL.woodDeep)
    px(ctx, cx - 1, 2, 1, s.h - 4, PAL.woodLight)
    for (let i = 0; i < 12; i++) {
      const wave = Math.sin(t * Math.PI * 2 + i * 0.5) * 1.6
      px(ctx, cx + 1 + i, 4 + wave, 1, 9 - Math.abs(i - 6) * 0.4, color)
    }
    px(ctx, cx - 3, 0, 6, 3, PAL.gold)
  }
}

function anim(draw: (s: Surface, t: number) => void, frames: number, dur: number) {
  return Array.from({ length: frames }, (_, i) => ({ dur, draw: (s: Surface) => draw(s, i / frames) }))
}

export function buildItemSheets(): Record<string, SpriteSheet> {
  const mk = (
    draw: (s: Surface, t: number) => void,
    frames: number,
    dur: number,
    fw = 20,
    fh = 20,
  ): SpriteSheet =>
    new SheetBuilder({ fw, fh, ox: -fw / 2, oy: -fh, outline: PAL.ink, rim: '#FFF3D6' })
      .add('idle', anim(draw, frames, dur))
      .build()

  return {
    berry: mk(drawBerry, 8, 0.07),
    meat: mk(drawMeat, 4, 0.16),
    'fruit-gear2': mk(fruit(PAL.bloodOrange), 8, 0.09, 22, 22),
    'fruit-gear3': mk(fruit(PAL.magic), 8, 0.09, 22, 22),
    'fruit-gear4': mk(fruit(PAL.poison), 8, 0.09, 22, 22),
    fragment: mk(drawFragment, 8, 0.1, 22, 22),
    oneup: mk(drawOneUp, 4, 0.15, 22, 22),
    checkpoint: mk(drawFlag(PAL.marineBlue), 8, 0.1, 24, 44),
    goal: mk(drawFlag(PAL.luffyRed), 8, 0.09, 26, 72),
  }
}
