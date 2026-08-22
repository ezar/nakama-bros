import type { SpriteSheet } from '../types'
import { SheetBuilder, type FrameSpec } from './atlas'
import { cel, mix, type Cel } from './color'
import { PAL } from './palette'
import {
  blob, crescentPath, curve, ellipsePath, glint, limbPath, paint, roundRectPath,
  type Pt, type Surface,
} from './ink'

/**
 * Enemy art.
 *
 * Readability is the whole brief: a player has to know "stomp it" or "don't
 * touch it" from the silhouette alone, before any detail resolves. The
 * convention the genre trained everyone on is honoured here — rounded and soft
 * means stompable, spiked and metallic means lethal — and every attacker has a
 * wind-up frame that looks different from its neutral one.
 */

const EYE_INK = '#161028'

/** A pair of anime eyes on a head of radius `r`. */
function eyes(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  opts: { angry?: boolean; wide?: boolean; color?: string } = {},
): void {
  const w = r * 0.3
  const h = r * (opts.wide ? 0.42 : 0.3)
  for (const dx of [-r * 0.4, r * 0.42]) {
    const x = cx + dx
    ctx.fillStyle = '#FBF8F4'
    ctx.fill(ellipsePath(x, cy, w, h))
    ctx.fillStyle = opts.color ?? EYE_INK
    ctx.fill(ellipsePath(x + w * 0.12, cy + h * 0.1, w * 0.52, h * 0.66))
    glint(ctx, x - w * 0.24, cy - h * 0.34, w * 0.24, h * 0.26, -0.5, '#FFFFFF', 0.9)
    ctx.strokeStyle = EYE_INK
    ctx.lineWidth = 0.45
    ctx.stroke(curve([[x - w, cy], [x, cy - h * 1.05], [x + w, cy - h * 0.5]] as Pt[]))
  }
  if (opts.angry) {
    ctx.save()
    ctx.strokeStyle = EYE_INK
    ctx.lineWidth = 0.55
    ctx.lineCap = 'round'
    ctx.stroke(curve([[cx - r * 0.72, cy - r * 0.62], [cx - r * 0.16, cy - r * 0.4]] as Pt[]))
    ctx.stroke(curve([[cx + r * 0.72, cy - r * 0.62], [cx + r * 0.16, cy - r * 0.4]] as Pt[]))
    ctx.restore()
  }
}

/** The patrolling Marine — this game's first enemy, and the softest read. */
function drawGrunt(s: Surface, t: number, state: 'walk' | 'squash' = 'walk'): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const gy = s.h - 1
  const coat = cel(PAL.marineWhite)
  const navy = cel(PAL.marineNavy)
  const skin = cel(PAL.skin, { lineDarkness: 0.34 })

  if (state === 'squash') {
    paint(ctx, ellipsePath(cx, gy - 2.4, 10, 2.6), coat, {
      shadow: 0.42, radius: 8, pivot: [cx, gy - 2.4], rim: 0.6, line: 0.6,
    })
    paint(ctx, ellipsePath(cx, gy - 4.6, 7.5, 1.8), navy, {
      shadow: 0.4, radius: 6, pivot: [cx, gy - 4.6], line: 0.5,
    })
    return
  }

  const swing = Math.sin(t * Math.PI * 2)
  const bob = Math.abs(Math.cos(t * Math.PI * 2)) * 0.9
  const hipY = gy - 8 - bob

  // Legs
  for (const [side, dir] of [[-1, -1], [1, 1]] as const) {
    const c = side < 0 ? cel(mix(PAL.marineNavy, '#5A6B90', 0.3)) : navy
    const kneeX = cx + side * 1.6 + swing * dir * 2.4
    paint(ctx, limbPath(cx + side * 1.6, hipY, kneeX, gy - 1.4, 1.7, 1.4), c, {
      shadow: 0.44, radius: 1.7, pivot: [cx, hipY], rim: 0.4, line: 0.45,
    })
    paint(ctx, ellipsePath(kneeX + 0.4, gy - 0.8, 2.2, 1.2), cel('#1A2038'), {
      shadow: 0.4, radius: 2, pivot: [kneeX, gy], line: 0.45,
    })
  }

  // Coat: the big white shape that makes a Marine a Marine.
  const body = blob([
    [cx - 4.6, hipY + 1],
    [cx - 3.9, hipY - 9],
    [cx + 3.9, hipY - 9],
    [cx + 4.6, hipY + 1],
    [cx + 3.4, hipY + 2.4],
    [cx - 3.4, hipY + 2.4],
  ] as Pt[], 0.55)
  paint(ctx, body, coat, {
    shadow: 0.42, radius: 4.6, pivot: [cx, hipY - 4], rim: 0.6, line: 0.55, occlusion: 0.2,
  })
  paint(ctx, roundRectPath(cx - 4.4, hipY - 2.6, 8.8, 1.8, 0.6), navy, {
    shadow: 0.4, radius: 4, pivot: [cx, hipY - 1.7], line: 0.45,
  })

  // Arms swing opposite the legs.
  for (const [side, dir] of [[-1, 1], [1, -1]] as const) {
    const c = side < 0 ? cel(mix(PAL.marineWhite, '#5A6B90', 0.32)) : coat
    const handX = cx + side * 4.4 + swing * dir * 1.8
    paint(ctx, limbPath(cx + side * 3.8, hipY - 7.6, handX, hipY - 2, 1.4, 1.1), c, {
      shadow: 0.44, radius: 1.4, pivot: [cx + side * 4, hipY - 5], rim: 0.4, line: 0.42,
    })
    paint(ctx, ellipsePath(handX, hipY - 1.4, 1.2, 1.1), skin, {
      shadow: 0.4, radius: 1.2, pivot: [handX, hipY - 1.4], line: 0.4,
    })
  }

  // Head and cap.
  const hy = hipY - 12.6
  paint(ctx, ellipsePath(cx, hy, 3.4, 3.6), skin, {
    shadow: 0.4, radius: 3.5, pivot: [cx, hy], rim: 0.6, line: 0.5,
  })
  eyes(ctx, cx, hy + 0.2, 3.5, { angry: true })
  paint(ctx, ellipsePath(cx, hy - 2.8, 4.4, 1.5), navy, {
    shadow: 0.38, radius: 4, pivot: [cx, hy - 2.8], rim: 0.5, line: 0.5,
  })
  paint(ctx, blob([
    [cx - 3.4, hy - 3],
    [cx - 2.6, hy - 5.4],
    [cx + 2.6, hy - 5.4],
    [cx + 3.4, hy - 3],
  ] as Pt[], 0.6), navy, {
    shadow: 0.4, radius: 3.4, pivot: [cx, hy - 4], rim: 0.5, line: 0.5,
  })
  ctx.fillStyle = PAL.gold
  ctx.fill(roundRectPath(cx - 2, hy - 4.4, 4, 0.9, 0.4))
}

/** Armoured Marine — the shield says "not from the front". */
function drawShielder(s: Surface, t: number): void {
  drawGrunt(s, t * 0.6)
  const ctx = s.ctx
  const cx = s.w / 2
  const gy = s.h - 1
  const steel = cel('#9FB0C8')
  const shield = blob([
    [cx + 3.6, gy - 20],
    [cx + 8.6, gy - 18.6],
    [cx + 9, gy - 7],
    [cx + 6, gy - 3.4],
    [cx + 3.6, gy - 6],
  ] as Pt[], 0.5)
  paint(ctx, shield, steel, {
    shadow: 0.36, radius: 4, pivot: [cx + 6, gy - 12], rim: 0.7, line: 0.6,
  })
  ctx.fillStyle = PAL.gold
  ctx.fill(ellipsePath(cx + 6.2, gy - 12, 1.5, 2.2))
  glint(ctx, cx + 4.8, gy - 16, 0.8, 3, 0.2, '#FFFFFF', 0.55)
}

/** Cannon crab — fast, low, and always on its ledge. */
function drawCrab(s: Surface, t: number): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const gy = s.h - 1
  const shell = cel(PAL.bloodOrange)
  const bob = Math.sin(t * Math.PI * 2) * 0.7

  for (let i = 0; i < 3; i++) {
    const lx = cx - 6 + i * 6
    const phase = Math.sin(t * Math.PI * 2 + i * 1.6)
    paint(ctx, limbPath(lx, gy - 5 + bob, lx + phase * 1.6, gy - 0.6, 1.1, 0.8), cel(shell.shade), {
      shadow: 0.44, radius: 1, pivot: [lx, gy - 3], line: 0.4,
    })
  }

  const body = blob([
    [cx - 9, gy - 5 + bob],
    [cx - 7, gy - 10 + bob],
    [cx, gy - 11.4 + bob],
    [cx + 7, gy - 10 + bob],
    [cx + 9, gy - 5 + bob],
    [cx, gy - 3.2 + bob],
  ] as Pt[], 0.85)
  paint(ctx, body, shell, {
    shadow: 0.4, radius: 9, pivot: [cx, gy - 7 + bob], rim: 0.7, line: 0.6,
  })
  // Claws raised — the tell that it can hurt you.
  for (const side of [-1, 1]) {
    const clawX = cx + side * 10.5
    const cy = gy - 11 + bob + Math.sin(t * Math.PI * 2 + (side > 0 ? 1 : 0)) * 0.8
    paint(ctx, blob([
      [clawX - side * 2.6, cy + 1.6],
      [clawX + side * 1.6, cy - 1],
      [clawX + side * 2.6, cy + 1.4],
      [clawX + side * 0.6, cy + 2.8],
    ] as Pt[], 0.7), shell, {
      shadow: 0.42, radius: 2.6, pivot: [clawX, cy], rim: 0.5, line: 0.5,
    })
  }
  eyes(ctx, cx, gy - 9.4 + bob, 3.4, { angry: true })
  glint(ctx, cx - 3, gy - 10.4 + bob, 2.4, 1, -0.5, '#FFFFFF', 0.4)
}

/** Fishman — coils, then leaps. The dorsal fin is the silhouette. */
function drawFishman(s: Surface, t: number, crouched = false): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const gy = s.h - 1
  const teal = cel(PAL.fishmanTeal)
  const bob = crouched ? 2.6 : Math.sin(t * Math.PI * 2) * 0.8
  const hipY = gy - 9 - (crouched ? -2 : 0) + bob

  // Dorsal fin, behind the body.
  paint(ctx, blob([
    [cx - 3, hipY - 8],
    [cx - 9, hipY - 14],
    [cx - 4.4, hipY - 3],
  ] as Pt[], 0.55), cel(mix(PAL.fishmanTeal, '#5A6B90', 0.3)), {
    shadow: 0.5, radius: 4, pivot: [cx - 5, hipY - 8], line: 0.5,
  })

  for (const side of [-1, 1]) {
    paint(ctx, limbPath(cx + side * 1.8, hipY, cx + side * 3, gy - 1.4, 1.9, 1.4), teal, {
      shadow: 0.44, radius: 1.9, pivot: [cx, hipY], rim: 0.4, line: 0.45,
    })
  }

  const body = blob([
    [cx - 4.8, hipY + 1],
    [cx - 4.2, hipY - 10],
    [cx + 4.2, hipY - 10],
    [cx + 4.8, hipY + 1],
  ] as Pt[], 0.6)
  paint(ctx, body, teal, {
    shadow: 0.42, radius: 4.8, pivot: [cx, hipY - 5], rim: 0.65, line: 0.55, occlusion: 0.2,
  })

  const hy = hipY - 13.4
  paint(ctx, ellipsePath(cx + 0.6, hy, 3.8, 3.4, -0.1), cel(teal.light), {
    shadow: 0.4, radius: 3.8, pivot: [cx, hy], rim: 0.6, line: 0.55,
  })
  eyes(ctx, cx + 0.6, hy - 0.2, 3.6, { angry: true, color: '#20304A' })
  // Gills.
  ctx.save()
  ctx.strokeStyle = teal.line
  ctx.lineWidth = 0.5
  for (let i = 0; i < 3; i++) {
    ctx.stroke(curve([[cx - 3.4 + i * 0.9, hy + 1.8], [cx - 3.6 + i * 0.9, hy + 3.4]] as Pt[]))
  }
  ctx.restore()

  // Spear, held across the body.
  const angle = crouched ? -0.8 : -0.35
  const hx = cx + 4
  const hyy = hipY - 6
  paint(
    ctx,
    limbPath(hx - Math.cos(angle) * 9, hyy - Math.sin(angle) * 9, hx + Math.cos(angle) * 11, hyy + Math.sin(angle) * 11, 0.6, 0.6),
    cel(PAL.wood),
    { shadow: 0.4, radius: 1, pivot: [hx, hyy], line: 0.35 },
  )
  paint(
    ctx,
    blob([
      [hx + Math.cos(angle) * 10, hyy + Math.sin(angle) * 10 - 1.4],
      [hx + Math.cos(angle) * 15, hyy + Math.sin(angle) * 15],
      [hx + Math.cos(angle) * 10, hyy + Math.sin(angle) * 10 + 1.4],
    ] as Pt[], 0.3),
    cel('#C8D4E4'),
    { shadow: 0.35, radius: 2, pivot: [hx, hyy], rim: 0.6, line: 0.45 },
  )
}

/** Sea bat — the wing arc is the animation. */
function drawBat(s: Surface, t: number): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const cy = s.h / 2
  const flap = Math.sin(t * Math.PI * 2)
  const c = cel('#6A54A0')

  for (const side of [-1, 1]) {
    const tipY = cy - 5 - flap * 6
    const wing = blob([
      [cx + side * 2, cy - 0.5],
      [cx + side * 8, tipY],
      [cx + side * 13, tipY + 2.5],
      [cx + side * 10, cy + 2 + flap * 1.5],
      [cx + side * 4, cy + 2],
    ] as Pt[], 0.75)
    paint(ctx, wing, side < 0 ? cel(mix('#6A54A0', '#5A6B90', 0.3)) : c, {
      shadow: 0.42, radius: 7, pivot: [cx + side * 7, cy], rim: 0.5, line: 0.5,
    })
  }
  paint(ctx, ellipsePath(cx, cy, 3.4, 3.8), c, {
    shadow: 0.4, radius: 3.6, pivot: [cx, cy], rim: 0.6, line: 0.5,
  })
  // Ears.
  for (const side of [-1, 1]) {
    paint(ctx, blob([
      [cx + side * 1, cy - 3],
      [cx + side * 2.6, cy - 6.4],
      [cx + side * 3.2, cy - 2.6],
    ] as Pt[], 0.4), c, { shadow: 0.42, radius: 2, pivot: [cx, cy - 4], line: 0.45 })
  }
  eyes(ctx, cx, cy - 0.2, 3.4, { angry: true, color: PAL.danger })
}

/** Spiked urchin — every cue says do not touch. */
function drawUrchin(s: Surface, t: number): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const cy = s.h - 8
  const pulse = 1 + Math.sin(t * Math.PI * 2) * 0.05
  const r = 5.6 * pulse
  const body = cel('#3A2E52')
  const spike = cel('#8C93B0')

  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2
    const len = r + 4.4 + Math.sin(i * 2.3) * 0.7
    const bx = cx + Math.cos(a) * r * 0.9
    const by = cy + Math.sin(a) * r * 0.9
    paint(
      ctx,
      blob([
        [bx + Math.cos(a + 1.4) * 1.5, by + Math.sin(a + 1.4) * 1.5],
        [cx + Math.cos(a) * len, cy + Math.sin(a) * len],
        [bx + Math.cos(a - 1.4) * 1.5, by + Math.sin(a - 1.4) * 1.5],
      ] as Pt[], 0.25),
      spike,
      { shadow: 0.4, radius: 2, pivot: [bx, by], rim: 0.5, line: 0.4 },
    )
  }
  paint(ctx, ellipsePath(cx, cy, r, r), body, {
    shadow: 0.42, radius: r, pivot: [cx, cy], rim: 0.6, line: 0.55,
  })
  eyes(ctx, cx, cy, r, { angry: true, color: PAL.danger })
}

/** Rolling barrel — a hazard that reads as scenery gone wrong. */
function drawBarrel(s: Surface, t: number): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const cy = s.h - 7
  const wood = cel(PAL.wood)
  const iron = cel('#6A7186')
  const spin = t * Math.PI * 2
  paint(ctx, ellipsePath(cx, cy, 6.4, 6.4), wood, {
    shadow: 0.42, radius: 6.4, pivot: [cx, cy], rim: 0.6, line: 0.6,
  })
  ctx.save()
  ctx.clip(ellipsePath(cx, cy, 6.4, 6.4))
  for (let i = -2; i <= 2; i++) {
    const x = cx + ((i * 3 + ((spin * 2) % 3)) % 12) - 1
    ctx.strokeStyle = wood.shade
    ctx.lineWidth = 0.6
    ctx.beginPath()
    ctx.moveTo(x, cy - 7)
    ctx.lineTo(x, cy + 7)
    ctx.stroke()
  }
  ctx.strokeStyle = iron.core
  ctx.lineWidth = 1.4
  for (const dy of [-2.6, 2.6]) {
    ctx.beginPath()
    ctx.ellipse(cx, cy + dy, 6.4, 1.6, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
}

// ─────────────────────────────────────────────────────────────────────────────

type Painter = (s: Surface, t: number) => void

function sheet(
  painter: Painter,
  frames: number,
  dur: number,
  fw: number,
  fh: number,
  extra?: (b: SheetBuilder) => void,
): SpriteSheet {
  const b = new SheetBuilder({
    fw, fh, ox: -fw / 2, oy: -fh, contour: '#161028', contourWidth: 0.7,
  })
  const cycle: FrameSpec[] = Array.from({ length: frames }, (_, i) => ({
    dur,
    draw: (s: Surface) => painter(s, i / frames),
  }))
  b.add('idle', cycle)
  b.alias('walk', 'idle')
  b.alias('run', 'idle')
  extra?.(b)
  return b.build()
}

export function buildEnemySheets(): Record<string, SpriteSheet> {
  return {
    grunt: sheet(drawGrunt, 6, 0.11, 34, 32, (b) => {
      b.add('squash', [{ dur: 0.5, draw: (s) => drawGrunt(s, 0, 'squash') }], { loop: false })
    }),
    shielder: sheet(drawShielder, 6, 0.13, 38, 34),
    crab: sheet(drawCrab, 6, 0.1, 36, 24),
    fishman: sheet(drawFishman, 6, 0.12, 40, 38, (b) => {
      b.add('windup', [{ dur: 0.4, draw: (s) => drawFishman(s, 0, true) }], { loop: false })
    }),
    bat: sheet(drawBat, 6, 0.07, 36, 24),
    urchin: sheet(drawUrchin, 6, 0.14, 30, 26),
    barrel: sheet(drawBarrel, 8, 0.05, 20, 20),
  }
}

export { crescentPath }
export type { Cel }
