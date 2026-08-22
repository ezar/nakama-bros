import { createSurface, overlayTint, silhouetteOf, type Pt, type Surface } from '../ink'
import { drawHairBack, drawHairFront, drawHead } from './head'
import type { Look } from './looks'
import type { Pose, Skeleton } from './rig'
import {
  CX, GROUND_Y, SIZE, angleOf, drawArm, drawLeg, recedePalette, solve,
} from './rig'

/**
 * Assembling one character from a look and a pose.
 *
 * Draw order is the whole illusion of depth in a flat medium: everything on the
 * far side of the body is laid down first and washed toward the sky, the near
 * side last and at full contrast. Getting this order wrong costs more than any
 * amount of rendering.
 */

export interface FigureOptions {
  /** 0..1 progress of the character's attack, driving the weapon. */
  attack?: number
}

export function drawFigure(
  ctx: CanvasRenderingContext2D,
  look: Look,
  p: Pose,
  scale: number,
  opts: FigureOptions = {},
): void {
  ctx.save()
  // Squash about the feet, then the per-character size.
  ctx.translate(CX, GROUND_Y)
  ctx.scale(p.squashX * scale, p.squashY * scale)
  ctx.translate(-CX, -GROUND_Y)

  const s: Skeleton = solve(p, look.size ?? SIZE)

  const pal = look.pal
  const far = recedePalette(pal)
  // Cloth hanging behind the body is only a hand's width back, not an arm's.
  const mid = recedePalette(pal, 0.14)

  look.props?.(ctx, s, 'behind')
  look.backCloth?.(ctx, s, mid)

  drawLeg(ctx, s.legBack, s.footBack, look.legs(far))
  drawArm(ctx, s.armBack, far.skin, look.arms(far))

  look.torso(ctx, s, pal)

  drawLeg(ctx, s.legFront, s.footFront, look.legs(pal))
  look.overLegs?.(ctx, s, pal)

  // Hair mass sits over the shoulders but behind the face.
  const [hx, hy] = s.head
  const r = s.headR
  drawHairBack(ctx, hx, hy, r, pal.hair, look.hairBack(hx, hy, r, s))
  drawHead(ctx, s, {
    skin: pal.skin,
    hair: pal.hair,
    expression: p.expression,
    turn: p.headTurn,
    style: look.face,
  })
  drawHairFront(ctx, hx, hy, r, pal.hair, look.hairFront(hx, hy, r, s))
  look.headgear?.(ctx, hx, hy, r, s)

  drawArm(ctx, s.armFront, pal.skin, look.arms(pal))

  const attack = opts.attack ?? 0
  if (attack > 0) {
    // A kick's effect belongs on the boot, not in an empty hand.
    const [from, at] = look.attackStyle === 'kick'
      ? [s.footFront[0], s.footFront[1]]
      : [s.armFront[1], s.armFront[2]]
    look.weapon(ctx, at, angleOf(from, at), attack)
  }

  look.props?.(ctx, s, 'front')
  ctx.restore()
}

/**
 * Multiple-image smear.
 *
 * On the frame a punch lands the eye wants a shape that spans where the body
 * was and where it is. The trailing copies are tinted toward the character's
 * own signature colour rather than washed to white: a grey double exposure
 * reads as dirt on the sprite, a coloured one reads as speed. They are also
 * only ever offset *along the direction of travel*, so the smear has a
 * direction instead of a blur.
 */
export interface Ghost {
  pose: Pose
  alpha: number
  /** Displacement in world units — a trailing copy of the same pose. */
  dx?: number
  dy?: number
}

export function drawGhosts(s: Surface, look: Look, ghosts: Ghost[], scale: number): void {
  const ctx = s.ctx
  for (const g of ghosts) {
    const scratch = createSurface(s.w, s.h, s.scale)
    drawFigure(scratch.ctx, look, g.pose, scale)
    overlayTint(scratch, look.banner, 0.62)
    overlayTint(scratch, '#FFFFFF', 0.24)
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = g.alpha
    ctx.drawImage(scratch.canvas, (g.dx ?? 0) * s.scale, (g.dy ?? 0) * s.scale)
    ctx.restore()
  }
}

/**
 * A directional smear: the figure's own silhouette, stretched along one axis
 * and faded out behind it.
 *
 * This is what a skid or a dash wants instead of a second drawing. Because it
 * is built from the alpha of the pose actually on screen it can never drift out
 * of register with the body, and because it is scaled rather than repeated it
 * has no visible steps — the trail thins the way a real smear frame does.
 */
export interface Smear {
  pose: Pose
  /** Direction and length of the trail in world units — where the body came from. */
  dx: number
  dy?: number
  /** Peak opacity at the body, falling to nothing at the tail. */
  alpha?: number
  /** Number of stretched copies. Three is plenty; more only costs fill rate. */
  steps?: number
}

export function drawSmear(surface: Surface, look: Look, sm: Smear, scale: number): void {
  const scratch = createSurface(surface.w, surface.h, surface.scale)
  drawFigure(scratch.ctx, look, sm.pose, scale)
  const sil = silhouetteOf(scratch, look.banner)
  const steps = sm.steps ?? 3
  const a0 = sm.alpha ?? 0.34
  const ctx = surface.ctx
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  for (let i = steps; i >= 1; i--) {
    const t = i / steps
    ctx.globalAlpha = a0 * (1 - t) * (1 - t * 0.4)
    ctx.drawImage(sil, sm.dx * t * surface.scale, (sm.dy ?? 0) * t * surface.scale)
  }
  ctx.restore()
}

/**
 * Speed lines raked along the direction of travel.
 *
 * Drawn *behind* the figure and clipped to nothing, they cost one stroke each
 * and do what a ghost cannot: they say which way the body is going even on a
 * frame where the pose barely changes.
 */
export function drawStreaks(
  ctx: CanvasRenderingContext2D,
  from: Pt,
  angle: number,
  color: string,
  lines: Array<[number, number, number]>,
  seed = 0,
): void {
  const ux = Math.cos(angle)
  const uy = Math.sin(angle)
  const nx = -uy
  const ny = ux
  ctx.save()
  ctx.lineCap = 'round'
  for (const [off, len, a] of lines) {
    const wob = Math.sin((off + seed) * 3.1) * 0.6
    ctx.globalAlpha = a
    ctx.strokeStyle = color
    ctx.lineWidth = 0.55 + a * 0.9
    ctx.beginPath()
    ctx.moveTo(from[0] + nx * off, from[1] + ny * off)
    ctx.lineTo(from[0] + nx * (off + wob) + ux * len, from[1] + ny * (off + wob) + uy * len)
    ctx.stroke()
  }
  ctx.restore()
}
