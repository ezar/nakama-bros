import { mix } from '../color'
import { createSurface, silhouetteOf, type Pt, type Surface } from '../ink'
import { drawHairBack, drawHairFront, drawHead, drawNeck } from './head'
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

  const [hx, hy] = s.head
  const r = s.headR

  look.props?.(ctx, s, 'behind')
  look.backCloth?.(ctx, s, mid)

  // The hair mass falls *behind* the body, not over it. Drawn with the head it
  // is drawn after the costume, and anyone with hair past their shoulders — the
  // navigator, the archaeologist — ends up wearing it as a cape with the whole
  // torso hidden underneath.
  // Hair follows the head round. You see more of the back of a head in profile
  // than square on, so the mass behind the skull swings away from the facing
  // direction as the turn comes up; the locks over the face travel forward with
  // the face plane. Applied here rather than in twenty closures, for the same
  // reason the skull's depth lives in `headPath` — it is one rig, and hair that
  // followed the turn on six characters and not the other four would read as a
  // bug in the four.
  const hairBackX = hx - r * p.headTurn * 0.11
  const hairFrontX = hx + r * p.headTurn * 0.09

  drawHairBack(ctx, hairBackX, hy, r, pal.hair, look.hairBack(hairBackX, hy, r, s))

  drawLeg(ctx, s.legBack, s.footBack, { ...look.legs(far), dim: true })
  drawArm(ctx, s.armBack, far.skin, { ...look.arms(far), dim: true })

  drawNeck(ctx, s, pal.skin, look.face.jaw ?? 1)
  look.torso(ctx, s, pal)

  drawLeg(ctx, s.legFront, s.footFront, look.legs(pal))
  look.overLegs?.(ctx, s, pal)

  drawHead(ctx, s, {
    skin: pal.skin,
    hair: pal.hair,
    expression: p.expression,
    turn: p.headTurn,
    style: look.face,
  })
  drawHairFront(ctx, hairFrontX, hy, r, pal.hair, look.hairFront(hairFrontX, hy, r, s))
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
 * The unbroken contour around a whole figure.
 *
 * `atlas` will do this for a sheet, but it stamps the frame's alpha outward
 * twelve times; eight is indistinguishable at this line width and a third
 * cheaper, and across five hundred frames that is real time. The ring is
 * composited underneath, so the line sits outside the silhouette rather than
 * eating into it.
 */
export function contourPass(surface: Surface, color: string, width: number): void {
  const { canvas, scale } = surface
  const w = canvas.width
  const h = canvas.height
  const ring = document.createElement('canvas')
  ring.width = w
  ring.height = h
  const rctx = ring.getContext('2d')!
  const r = width * scale
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    rctx.drawImage(canvas, Math.cos(a) * r, Math.sin(a) * r)
  }
  rctx.globalCompositeOperation = 'source-in'
  rctx.fillStyle = color
  rctx.fillRect(0, 0, w, h)

  const ctx = surface.ctx
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'destination-over'
  ctx.drawImage(ring, 0, 0)
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
  const trail = mix(look.banner, '#FFFFFF', 0.5)
  for (const g of ghosts) {
    const scratch = createSurface(s.w, s.h, s.scale)
    drawFigure(scratch.ctx, look, g.pose, scale)
    // A flat silhouette, not a second rendering of the character. A dimmed copy
    // of the full drawing reads as a dirty double exposure — the grey smudge
    // the first pass had on every fast frame — where one flat shape in the
    // character's own colour reads as the body having been there a moment ago.
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = g.alpha
    ctx.drawImage(silhouetteOf(scratch, trail), (g.dx ?? 0) * s.scale, (g.dy ?? 0) * s.scale)
    ctx.restore()
  }
}

/**
 * A directional smear: the figure's own silhouette, stretched along one axis
 * and faded out behind it.
 *
 * This is what a skid or a dash wants instead of a second drawing. It is built
 * from the alpha of the figure already on the surface — so it can never drift
 * out of register with the body, and it costs one silhouette instead of a whole
 * second rendering of the character — then composited underneath with
 * `destination-over` so the body stays crisp in front of its own trail.
 */
export interface Smear {
  /** Colour of the trail — the character's own signature, washed toward white. */
  color: string
  /** Direction and length of the trail in world units — where the body came from. */
  dx: number
  dy?: number
  /** Peak opacity at the body, falling to nothing at the tail. */
  alpha?: number
  /** Number of stretched copies. Three is plenty; more only costs fill rate. */
  steps?: number
}

export function drawSmear(surface: Surface, sm: Smear): void {
  const sil = silhouetteOf(surface, sm.color)
  const steps = sm.steps ?? 3
  const a0 = sm.alpha ?? 0.34
  const ctx = surface.ctx
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  // Behind whatever is already on the surface: the trail is where the body was.
  ctx.globalCompositeOperation = 'destination-over'
  for (let i = 1; i <= steps; i++) {
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
