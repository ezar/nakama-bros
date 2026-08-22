import type { SpriteSheet } from '../types'
import { SheetBuilder } from './atlas'
import { PAL } from './palette'
import { px, ellipse, circle, mix, ramp, type Surface } from './pixel'

/**
 * Enemy art. Each type is a self-contained painter so silhouettes can be tuned
 * independently — readability at a glance matters more here than detail: the
 * player must know what is dangerous before it is on screen.
 */

const marine = ramp(PAL.marineNavy, 1)
const cloth = ramp(PAL.marineWhite, 0.8)

/** The basic patrolling Marine — this game's Goomba. */
function drawGrunt(s: Surface, walk: number, squashed = false): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const gy = s.h - 1
  if (squashed) {
    ellipse(ctx, cx, gy - 2, 9, 2.5, cloth.base)
    px(ctx, cx - 7, gy - 4, 14, 2, marine.base)
    return
  }
  const bob = Math.round(Math.sin(walk * Math.PI * 2) * 1)
  const legSwing = Math.round(Math.sin(walk * Math.PI * 2) * 3)
  // Legs
  px(ctx, cx - 4 + legSwing, gy - 5, 3, 5, marine.dark)
  px(ctx, cx + 1 - legSwing, gy - 5, 3, 5, marine.base)
  // Body — the white Marine coat
  px(ctx, cx - 5, gy - 14 + bob, 10, 10, cloth.base)
  px(ctx, cx - 5, gy - 14 + bob, 10, 2, cloth.lightest)
  px(ctx, cx + 3, gy - 14 + bob, 2, 10, cloth.dark)
  px(ctx, cx - 5, gy - 7 + bob, 10, 2, marine.base)
  // Head
  ellipse(ctx, cx, gy - 17 + bob, 4.5, 4.5, PAL.skin)
  px(ctx, cx - 5, gy - 21 + bob, 10, 3, marine.base)
  px(ctx, cx - 6, gy - 19 + bob, 12, 1, marine.dark)
  px(ctx, cx - 4, gy - 20 + bob, 8, 1, PAL.gold)
  px(ctx, cx + 1, gy - 17 + bob, 2, 2, PAL.ink)
  px(ctx, cx - 3, gy - 17 + bob, 2, 2, PAL.ink)
}

/** Armoured Marine that must be attacked, not stomped. */
function drawShielder(s: Surface, walk: number): void {
  drawGrunt(s, walk)
  const ctx = s.ctx
  const cx = s.w / 2
  const gy = s.h - 1
  px(ctx, cx + 3, gy - 18, 6, 14, PAL.steel)
  px(ctx, cx + 3, gy - 18, 6, 2, mix(PAL.steel, PAL.white, 0.5))
  px(ctx, cx + 5, gy - 13, 2, 4, PAL.gold)
}

/** Cannon crab: sidles, then fires. */
function drawCrab(s: Surface, walk: number): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const gy = s.h - 1
  const bob = Math.round(Math.sin(walk * Math.PI * 2) * 1)
  const sh = ramp(PAL.bloodOrange, 1)
  ellipse(ctx, cx, gy - 6 + bob, 9, 5, sh.base)
  px(ctx, cx - 9, gy - 8 + bob, 18, 3, sh.light)
  for (let i = 0; i < 3; i++) {
    const lx = cx - 7 + i * 6
    px(ctx, lx, gy - 3, 2, 3, sh.dark)
  }
  px(ctx, cx - 11, gy - 11 + bob, 5, 3, sh.dark)
  px(ctx, cx + 6, gy - 11 + bob, 5, 3, sh.dark)
  px(ctx, cx - 4, gy - 9 + bob, 2, 2, PAL.ink)
  px(ctx, cx + 2, gy - 9 + bob, 2, 2, PAL.ink)
}

/** Fishman spearman: jumps out of water. */
function drawFishman(s: Surface, walk: number): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const gy = s.h - 1
  const teal = ramp(PAL.fishmanTeal, 1)
  const bob = Math.round(Math.sin(walk * Math.PI * 2) * 1)
  px(ctx, cx - 4, gy - 6, 3, 6, teal.dark)
  px(ctx, cx + 1, gy - 6, 3, 6, teal.base)
  px(ctx, cx - 5, gy - 16 + bob, 10, 11, teal.base)
  px(ctx, cx - 5, gy - 16 + bob, 10, 2, teal.light)
  ellipse(ctx, cx, gy - 19 + bob, 5, 4.5, teal.light)
  px(ctx, cx + 1, gy - 19 + bob, 2, 2, PAL.ink)
  px(ctx, cx - 4, gy - 19 + bob, 2, 2, PAL.ink)
  // Dorsal fin — the silhouette read.
  px(ctx, cx - 8, gy - 22 + bob, 4, 6, teal.dark)
  // Spear
  px(ctx, cx + 5, gy - 24 + bob, 1, 22, PAL.wood)
  px(ctx, cx + 4, gy - 26 + bob, 3, 4, PAL.steel)
}

/** Sea bat: flies a sine path. */
function drawBat(s: Surface, flap: number): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const cy = s.h / 2
  const wing = Math.sin(flap * Math.PI * 2)
  const c = ramp('#5E4A7E', 1)
  ellipse(ctx, cx, cy, 4, 3.5, c.base)
  px(ctx, cx + 1, cy - 1, 2, 2, PAL.danger)
  px(ctx, cx - 3, cy - 1, 2, 2, PAL.danger)
  for (const dir of [-1, 1]) {
    const wy = cy - 2 + wing * 3 * dir * 0
    ctx.fillStyle = c.dark
    ctx.beginPath()
    ctx.moveTo(cx + dir * 3, cy - 1)
    ctx.lineTo(cx + dir * 12, wy - 3 - wing * 4)
    ctx.lineTo(cx + dir * 11, wy + 3 - wing * 2)
    ctx.closePath()
    ctx.fill()
  }
}

/** Spiky urchin: never stompable, bounces the player. */
function drawUrchin(s: Surface, pulse: number): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const cy = s.h - 8
  const r = 6 + Math.sin(pulse * Math.PI * 2) * 0.6
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    const x1 = cx + Math.cos(a) * r
    const y1 = cy + Math.sin(a) * r
    const x2 = cx + Math.cos(a) * (r + 4)
    const y2 = cy + Math.sin(a) * (r + 4)
    ctx.strokeStyle = PAL.slate
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }
  circle(ctx, cx, cy, r, '#2E2440')
  circle(ctx, cx - 1.5, cy - 1.5, r * 0.4, '#4E4066')
  px(ctx, cx + 1, cy - 1, 2, 2, PAL.danger)
  px(ctx, cx - 3, cy - 1, 2, 2, PAL.danger)
}

type Painter = (s: Surface, t: number) => void

function sheetFor(painter: Painter, frames: number, dur: number, fw: number, fh: number, extra?: (b: SheetBuilder) => void): SpriteSheet {
  const b = new SheetBuilder({ fw, fh, ox: -fw / 2, oy: -fh, outline: PAL.ink, rim: '#FFE9A8', ao: PAL.inkSoft })
  const cycle = Array.from({ length: frames }, (_, i) => ({
    dur,
    draw: (s: Surface) => painter(s, i / frames),
  }))
  b.add('idle', cycle)
  b.add('walk', cycle)
  b.add('run', cycle)
  extra?.(b)
  return b.build()
}

export function buildEnemySheets(): Record<string, SpriteSheet> {
  return {
    grunt: sheetFor(drawGrunt, 4, 0.13, 26, 26, (b) => {
      b.add('squash', [{ dur: 0.5, draw: (s) => drawGrunt(s, 0, true) }], { loop: false })
    }),
    shielder: sheetFor(drawShielder, 4, 0.15, 28, 28),
    crab: sheetFor(drawCrab, 4, 0.14, 28, 20),
    fishman: sheetFor(drawFishman, 4, 0.15, 30, 30),
    bat: sheetFor(drawBat, 4, 0.08, 28, 20),
    urchin: sheetFor(drawUrchin, 4, 0.16, 26, 22),
  }
}
