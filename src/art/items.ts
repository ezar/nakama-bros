import type { SpriteSheet } from '../types'
import { SheetBuilder } from './atlas'
import { cel, mix, rgba } from './color'
import { PAL } from './palette'
import {
  blob, crescentPath, curve, ellipsePath, glint, paint, radialFill, roundRectPath,
  type Pt, type Surface,
} from './ink'

/**
 * Pickups.
 *
 * Every one of these spins, pulses or waves, because a static object on busy
 * terrain disappears. The berry in particular is the most-seen sprite in the
 * game, so it gets a real perspective spin rather than a squash.
 */

/** Berry — the coin. Eight frames of a true rotation. */
function drawBerry(s: Surface, t: number): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const cy = s.h / 2
  const gold = cel(PAL.gold)
  // Width follows a cosine, so the coin narrows to an edge and flips.
  const phase = Math.cos(t * Math.PI * 2)
  const w = Math.abs(phase) * 6.4 + 0.7
  const facing = phase >= 0

  // Rim: the thickness of the coin, visible near the edge-on frames.
  paint(ctx, ellipsePath(cx, cy, w + 0.7, 7), cel(gold.shade), {
    shadow: 0.5, radius: 7, pivot: [cx, cy], line: 0.5,
  })
  paint(ctx, ellipsePath(cx, cy, w, 6.4), gold, {
    shadow: 0.36, radius: 6.4, pivot: [cx, cy], rim: 0.8, line: 0.45,
  })

  if (w > 2.6) {
    ctx.save()
    ctx.clip(ellipsePath(cx, cy, w * 0.86, 5.4))
    if (facing) {
      // The stamped face: a skull mark, kept to three strokes.
      ctx.fillStyle = gold.deep
      ctx.fill(ellipsePath(cx, cy - 0.6, w * 0.5, 2.4))
      ctx.fillStyle = gold.light
      ctx.fill(ellipsePath(cx - w * 0.16, cy - 1.1, w * 0.14, 0.8))
      ctx.fill(ellipsePath(cx + w * 0.16, cy - 1.1, w * 0.14, 0.8))
      ctx.fillStyle = gold.deep
      ctx.fill(roundRectPath(cx - w * 0.36, cy + 1.8, w * 0.72, 1.1, 0.4))
    } else {
      ctx.fillStyle = gold.deep
      ctx.fill(roundRectPath(cx - w * 0.5, cy - 2.6, w, 1, 0.4))
      ctx.fill(roundRectPath(cx - w * 0.5, cy + 1.6, w, 1, 0.4))
    }
    ctx.restore()
  }
  glint(ctx, cx - w * 0.36, cy - 3.2, w * 0.28, 1.5, -0.6, '#FFFFFF', 0.85)
}

/** Meat — the health pickup, and the funniest silhouette in the set. */
function drawMeat(s: Surface, t: number): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const cy = s.h / 2 + Math.sin(t * Math.PI * 2) * 0.9
  const meat = cel('#C4563A')
  const bone = cel('#F4E8D0')
  paint(
    ctx,
    blob([
      [cx - 1, cy - 5.6], [cx + 6, cy - 4], [cx + 7.4, cy + 1.4],
      [cx + 3, cy + 5.4], [cx - 2.6, cy + 4], [cx - 3.4, cy - 1.4],
    ] as Pt[], 0.9),
    meat,
    { shadow: 0.4, radius: 6, pivot: [cx + 2, cy], rim: 0.75, line: 0.6 },
  )
  paint(ctx, roundRectPath(cx - 8.4, cy - 1.4, 6.4, 2.6, 1.2), bone, {
    shadow: 0.36, radius: 3, pivot: [cx - 5, cy], rim: 0.6, line: 0.5,
  })
  paint(ctx, ellipsePath(cx - 8.4, cy - 1.8, 1.9, 1.6), bone, {
    shadow: 0.36, radius: 2, pivot: [cx - 8.4, cy - 1.8], line: 0.5,
  })
  paint(ctx, ellipsePath(cx - 8.4, cy + 1.4, 1.9, 1.6), bone, {
    shadow: 0.36, radius: 2, pivot: [cx - 8.4, cy + 1.4], line: 0.5,
  })
  glint(ctx, cx + 1.6, cy - 2.8, 2, 1, -0.5, '#FFFFFF', 0.5)
}

/** Devil fruit — the power-up. The swirl is the whole identity. */
function fruit(color: string) {
  return (s: Surface, t: number): void => {
    const ctx = s.ctx
    const cx = s.w / 2
    const cy = s.h / 2 + Math.sin(t * Math.PI * 2) * 0.8
    const c = cel(color)
    paint(ctx, ellipsePath(cx, cy, 6.6, 7), c, {
      shadow: 0.38, radius: 7, pivot: [cx, cy], rim: 0.8, line: 0.6,
    })
    // The swirl actually rotates across the cycle, so it reads as a solid.
    ctx.save()
    ctx.clip(ellipsePath(cx, cy, 6.4, 6.8))
    ctx.strokeStyle = c.deep
    ctx.lineWidth = 1.1
    ctx.lineCap = 'round'
    const spin = t * Math.PI * 2
    for (let i = 0; i < 3; i++) {
      const pts: Pt[] = []
      for (let k = 0; k <= 8; k++) {
        const a = spin + i * 2.1 + k * 0.42
        const r = 1 + k * 0.72
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 1.04])
      }
      ctx.stroke(curve(pts))
    }
    ctx.restore()
    glint(ctx, cx - 2.4, cy - 3, 2, 1.3, -0.6, '#FFFFFF', 0.7)
    // Stem and leaf.
    paint(ctx, roundRectPath(cx - 0.5, cy - 10.4, 1, 4, 0.5), cel(PAL.grassDeep), {
      shadow: 0.4, radius: 1, pivot: [cx, cy - 8], line: 0.4,
    })
    paint(ctx, blob([
      [cx, cy - 9.6], [cx + 4.4, cy - 11.4], [cx + 4, cy - 8.6],
    ] as Pt[], 0.7), cel(PAL.grass), {
      shadow: 0.36, radius: 2.4, pivot: [cx + 2, cy - 10], rim: 0.5, line: 0.45,
    })
  }
}

/** Poneglyph fragment — ancient, glowing, worth going out of the way for. */
function drawFragment(s: Surface, t: number): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const cy = s.h / 2 + Math.sin(t * Math.PI * 2) * 1.2
  const stone = cel('#48547A')
  const pulse = 0.5 + Math.sin(t * Math.PI * 2) * 0.5

  radialFill(ctx, cx, cy, 2, 13, [
    [0, rgba(PAL.magic, 0.35 * pulse)],
    [1, rgba(PAL.magic, 0)],
  ])
  paint(
    ctx,
    blob([
      [cx - 4.6, cy - 7], [cx + 3.4, cy - 7.6], [cx + 5, cy + 3],
      [cx + 1.4, cy + 7.4], [cx - 4, cy + 6],
    ] as Pt[], 0.35),
    stone,
    { shadow: 0.42, radius: 6, pivot: [cx, cy], rim: 0.6, line: 0.6 },
  )
  ctx.save()
  ctx.globalAlpha = 0.55 + pulse * 0.45
  ctx.fillStyle = PAL.magic
  ctx.shadowColor = PAL.magic
  ctx.shadowBlur = 4
  for (const [x, y, w, h] of [
    [-2.8, -4.6, 4.4, 0.9], [-2.8, -2.4, 2.2, 0.9], [0.4, -2.4, 2.8, 0.9],
    [-2.8, -0.2, 5.2, 0.9], [-2, 2, 3.2, 0.9], [-2.8, 4.2, 4, 0.9],
  ]) {
    ctx.fillRect(cx + x, cy + y, w, h)
  }
  ctx.restore()
}

/** Extra life — a miniature figurehead of the crew's ship. */
function drawOneUp(s: Surface, t: number): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const cy = s.h / 2 + Math.sin(t * Math.PI * 2) * 0.9
  const wood = cel(PAL.wood)
  paint(ctx, blob([
    [cx - 8, cy + 1], [cx + 8, cy + 1], [cx + 5.4, cy + 5.4], [cx - 5.4, cy + 5.4],
  ] as Pt[], 0.3), wood, {
    shadow: 0.4, radius: 6, pivot: [cx, cy + 3], rim: 0.6, line: 0.55,
  })
  paint(ctx, ellipsePath(cx, cy - 3.4, 5, 4.6), cel('#E8C86A'), {
    shadow: 0.38, radius: 5, pivot: [cx, cy - 3.4], rim: 0.7, line: 0.55,
  })
  ctx.fillStyle = PAL.luffyRed
  ctx.fill(roundRectPath(cx - 2.6, cy - 5.4, 5.2, 1.6, 0.7))
  ctx.fillStyle = '#20182C'
  ctx.fill(ellipsePath(cx + 1.4, cy - 3, 0.7, 0.8))
  ctx.fill(ellipsePath(cx - 1.6, cy - 3, 0.7, 0.8))
  glint(ctx, cx - 2, cy - 5, 1.6, 0.8, -0.5, '#FFFFFF', 0.55)
}

/** A flag whose wave travels along the cloth rather than wobbling in place. */
function flag(color: string, height: number, poleTop = 0) {
  return (s: Surface, t: number): void => {
    const ctx = s.ctx
    const cx = s.w / 2
    const wood = cel(PAL.woodDeep)
    paint(ctx, roundRectPath(cx - 1, poleTop + 1, 2, height, 1), wood, {
      shadow: 0.4, radius: 2, pivot: [cx, height / 2], rim: 0.5, line: 0.45,
    })
    paint(ctx, ellipsePath(cx, poleTop + 1.4, 1.8, 1.8), cel(PAL.gold), {
      shadow: 0.36, radius: 2, pivot: [cx, poleTop + 1.4], rim: 0.6, line: 0.45,
    })

    // Cloth: a travelling sine along the free edge, with the top and bottom
    // edges out of phase so the sheet twists.
    const top: Pt[] = []
    const bottom: Pt[] = []
    const len = 15
    for (let i = 0; i <= 6; i++) {
      const u = i / 6
      const wave = Math.sin(t * Math.PI * 2 - u * 3.2) * u * 1.8
      top.push([cx + 1 + u * len, poleTop + 3 + wave])
      bottom.push([cx + 1 + u * len, poleTop + 12 + wave * 1.4])
    }
    const cloth = new Path2D()
    cloth.addPath(curve(top))
    for (let i = bottom.length - 1; i >= 0; i--) cloth.lineTo(bottom[i][0], bottom[i][1])
    cloth.closePath()
    paint(ctx, cloth, cel(color), {
      shadow: 0.4, radius: 8, pivot: [cx + 8, poleTop + 7], rim: 0.6, line: 0.55,
    })
    // A skull mark on the cloth, distorted with the wave.
    ctx.save()
    ctx.clip(cloth)
    ctx.globalAlpha = 0.9
    ctx.fillStyle = '#FFF6E8'
    const mx = cx + 8
    const my = poleTop + 7 + Math.sin(t * Math.PI * 2 - 1.6) * 1.2
    ctx.fill(ellipsePath(mx, my, 2.6, 2.4))
    ctx.fillStyle = color
    ctx.fill(ellipsePath(mx - 0.9, my - 0.3, 0.7, 0.9))
    ctx.fill(ellipsePath(mx + 0.9, my - 0.3, 0.7, 0.9))
    ctx.restore()
  }
}

const anim = (draw: (s: Surface, t: number) => void, frames: number, dur: number) =>
  Array.from({ length: frames }, (_, i) => ({ dur, draw: (s: Surface) => draw(s, i / frames) }))

export function buildItemSheets(): Record<string, SpriteSheet> {
  const mk = (
    draw: (s: Surface, t: number) => void,
    frames: number,
    dur: number,
    fw = 22,
    fh = 22,
  ): SpriteSheet =>
    new SheetBuilder({ fw, fh, ox: -fw / 2, oy: -fh, contour: '#161028', contourWidth: 0.65 })
      .add('idle', anim(draw, frames, dur))
      .build()

  return {
    berry: mk(drawBerry, 8, 0.07, 20, 18),
    meat: mk(drawMeat, 4, 0.16, 24, 18),
    'fruit-gear2': mk(fruit(PAL.bloodOrange), 8, 0.085, 24, 26),
    'fruit-gear3': mk(fruit(PAL.magic), 8, 0.085, 24, 26),
    'fruit-gear4': mk(fruit(PAL.poison), 8, 0.085, 24, 26),
    fragment: mk(drawFragment, 8, 0.1, 26, 26),
    oneup: mk(drawOneUp, 4, 0.15, 24, 20),
    checkpoint: mk(flag(PAL.marineBlue, 34), 8, 0.1, 34, 40),
    goal: mk(flag(PAL.luffyRed, 62), 8, 0.09, 36, 70),
  }
}

export { crescentPath, mix }
