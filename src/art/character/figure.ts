import { createSurface, overlayTint, type Surface } from '../ink'
import { drawHairBack, drawHairFront, drawHead } from './head'
import type { Look } from './looks'
import type { Pose, Skeleton } from './rig'
import {
  CX, GROUND_Y, SEG, angleOf, drawArm, drawLeg, recedePalette, solve,
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

  const s: Skeleton = solve(p)
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
  const r = SEG.headR
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
 * On the fastest transitions — the frame a punch lands, the frame a dash
 * starts — the eye wants a shape that spans where the body was and where it is.
 * Ghosts are rendered whole into their own surface and composited at low alpha,
 * rather than drawn part by part, so overlapping limbs do not double-darken
 * into a muddy blob.
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
    // Washed toward white before compositing: an unlightened copy reads as a
    // dirty double exposure, a pale one reads as speed.
    overlayTint(scratch, '#FFFFFF', 0.55)
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = g.alpha
    ctx.drawImage(scratch.canvas, (g.dx ?? 0) * s.scale, (g.dy ?? 0) * s.scale)
    ctx.restore()
  }
}
