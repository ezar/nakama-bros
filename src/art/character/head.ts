import { cel, mix, type Cel } from '../color'
import { blob, curve, ellipsePath, glint, paint, type Pt } from '../ink'
import type { Expression, Skeleton } from './rig'
import { SEG } from './rig'

/**
 * Heads and faces.
 *
 * At this size the face is four marks — brow, eye, pupil, mouth — so each one
 * has to carry the whole expression. The eye is drawn as a hard upper lash line
 * over a light sclera with a large iris: that shape is the single strongest cue
 * that says "anime" rather than "cartoon".
 */

export interface FaceOptions {
  skin: Cel
  hair: Cel
  expression: Expression
  /** 0 = looking straight at the camera, 1 = full profile in the facing direction. */
  turn: number
  /** Small vertical squash for shouting or wincing. */
  openMouth?: number
}

interface EyeShape {
  /** Upper lash curve control, higher = more open. */
  open: number
  /** Brow angle: negative is angry, positive is worried. */
  brow: number
  browRaise: number
  /** Iris vertical offset — looking up or down. */
  look: number
  mouth: 'flat' | 'smile' | 'grin' | 'open' | 'grit' | 'frown' | 'o'
}

const EXPRESSIONS: Record<Expression, EyeShape> = {
  neutral: { open: 1, brow: 0, browRaise: 0, look: 0, mouth: 'flat' },
  determined: { open: 0.86, brow: -0.34, browRaise: -0.35, look: 0.1, mouth: 'grit' },
  surprised: { open: 1.35, brow: 0.16, browRaise: 0.7, look: -0.15, mouth: 'o' },
  strain: { open: 0.55, brow: -0.44, browRaise: -0.5, look: 0.2, mouth: 'grit' },
  hurt: { open: 0.28, brow: 0.4, browRaise: 0.2, look: 0.3, mouth: 'frown' },
  joy: { open: 0.34, brow: 0.1, browRaise: 0.35, look: 0, mouth: 'grin' },
  focused: { open: 0.78, brow: -0.2, browRaise: -0.2, look: 0, mouth: 'flat' },
}

/** The skull shape: a rounded cranium tapering to a small chin. */
export function headPath(cx: number, cy: number, r: number, turn: number): Path2D {
  const jaw = 0.62 + turn * 0.12
  return blob([
    [cx - r * 0.96, cy - r * 0.25],
    [cx - r * 0.7, cy - r * 0.92],
    [cx + r * 0.1, cy - r * 1.06],
    [cx + r * 0.92, cy - r * 0.62],
    [cx + r * (0.86 + turn * 0.1), cy + r * 0.16],
    [cx + r * 0.42, cy + r * jaw],
    [cx - r * 0.12, cy + r * (jaw + 0.14)],
    [cx - r * 0.74, cy + r * 0.34],
  ] as Pt[], 0.9)
}

export function drawHead(
  ctx: CanvasRenderingContext2D,
  s: Skeleton,
  o: FaceOptions,
): { center: Pt; r: number; path: Path2D } {
  const [cx, cy] = s.head
  const r = SEG.headR
  const path = headPath(cx, cy, r, o.turn)

  // Neck first, so the head sits on it rather than floating.
  const neckPath = blob([
    [s.neck[0] - 1.3, s.neck[1] + 1.4],
    [s.neck[0] + 1.3, s.neck[1] + 1.4],
    [cx + 1.1, cy + r * 0.5],
    [cx - 1.1, cy + r * 0.5],
  ] as Pt[], 0.4)
  paint(ctx, neckPath, o.skin, { shadow: 0.62, radius: 1.4, pivot: s.neck, line: 0.4 })

  paint(ctx, path, o.skin, {
    shadow: 0.4, radius: r, pivot: [cx, cy], rim: 0.62, line: 0.5,
  })

  drawFace(ctx, cx, cy, r, o)
  return { center: [cx, cy], r, path }
}

function drawFace(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  o: FaceOptions,
): void {
  const e = EXPRESSIONS[o.expression]
  const ink = mix(o.hair.line, '#1A1024', 0.35)
  // Turn shifts the features toward the facing side and squeezes the far eye.
  const shift = r * 0.3 * o.turn
  const eyeY = cy + r * 0.06 + e.look * r * 0.12
  const nearX = cx + shift + r * 0.42
  const farX = cx + shift - r * 0.46
  const nearW = r * 0.34
  const farW = nearW * (1 - o.turn * 0.42)

  const eye = (x: number, w: number, alpha = 1) => {
    const h = r * 0.4 * e.open
    if (h < 0.12) {
      // A closed eye is one confident arc, not a squashed open one.
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.strokeStyle = ink
      ctx.lineWidth = 0.55
      ctx.stroke(curve([[x - w, eyeY], [x, eyeY + 0.5], [x + w, eyeY]] as Pt[]))
      ctx.restore()
      return
    }
    ctx.save()
    ctx.globalAlpha = alpha
    // Sclera
    const socket = blob([
      [x - w, eyeY],
      [x - w * 0.35, eyeY - h],
      [x + w * 0.75, eyeY - h * 0.8],
      [x + w, eyeY + h * 0.2],
      [x, eyeY + h * 0.72],
    ] as Pt[], 0.9)
    ctx.fillStyle = '#FBF8F4'
    ctx.fill(socket)
    // Iris: large, sitting low, with a hard highlight.
    ctx.save()
    ctx.clip(socket)
    ctx.fillStyle = mix(o.hair.core, '#20182C', 0.55)
    ctx.fill(ellipsePath(x + w * 0.1, eyeY + h * 0.06, w * 0.6, h * 0.78))
    ctx.fillStyle = '#100C18'
    ctx.fill(ellipsePath(x + w * 0.1, eyeY + h * 0.1, w * 0.32, h * 0.5))
    ctx.restore()
    glint(ctx, x - w * 0.18, eyeY - h * 0.3, w * 0.26, h * 0.3, -0.5, '#FFFFFF', 0.95)
    // Upper lash: the heaviest line on the face.
    ctx.strokeStyle = ink
    ctx.lineWidth = 0.72
    ctx.stroke(curve([
      [x - w, eyeY + 0.1],
      [x - w * 0.3, eyeY - h * 1.02],
      [x + w * 0.95, eyeY - h * 0.66],
    ] as Pt[]))
    ctx.restore()
  }

  eye(nearX, nearW)
  if (o.turn < 0.92) eye(farX, farW, 1 - o.turn * 0.25)

  // Brows, set clear of the lash so the expression reads at a glance.
  const brow = (x: number, w: number, dir: number) => {
    ctx.save()
    ctx.strokeStyle = ink
    ctx.lineWidth = 0.62
    ctx.lineCap = 'round'
    const y = eyeY - r * 0.46 + e.browRaise * -r * 0.12
    ctx.stroke(curve([
      [x - w, y - e.brow * dir * r * 0.16],
      [x + w * 0.2, y - r * 0.08],
      [x + w, y + e.brow * dir * r * 0.2],
    ] as Pt[]))
    ctx.restore()
  }
  brow(nearX, nearW * 1.05, 1)
  if (o.turn < 0.92) brow(farX, farW * 1.05, -1)

  // Nose: a single short tick. More than that fights the eyes.
  ctx.save()
  ctx.strokeStyle = mix(o.skin.shade, ink, 0.35)
  ctx.lineWidth = 0.45
  ctx.stroke(curve([
    [cx + shift + r * 0.72, eyeY + r * 0.3],
    [cx + shift + r * 0.82, eyeY + r * 0.5],
  ] as Pt[]))
  ctx.restore()

  // Mouth
  const mx = cx + shift + r * 0.34
  const my = cy + r * 0.5
  const mw = r * 0.3
  ctx.save()
  ctx.strokeStyle = ink
  ctx.lineWidth = 0.6
  ctx.lineCap = 'round'
  switch (e.mouth) {
    case 'flat':
      ctx.stroke(curve([[mx - mw, my], [mx + mw, my - 0.1]] as Pt[]))
      break
    case 'smile':
      ctx.stroke(curve([[mx - mw, my - 0.2], [mx, my + 0.45], [mx + mw, my - 0.25]] as Pt[]))
      break
    case 'frown':
      ctx.stroke(curve([[mx - mw, my + 0.3], [mx, my - 0.25], [mx + mw, my + 0.35]] as Pt[]))
      break
    case 'grit': {
      const p = blob([
        [mx - mw * 1.2, my - 0.35],
        [mx + mw * 1.2, my - 0.45],
        [mx + mw, my + 0.65],
        [mx - mw, my + 0.6],
      ] as Pt[], 0.4)
      ctx.fillStyle = '#8E2A2E'
      ctx.fill(p)
      ctx.fillStyle = '#FFFFFF'
      ctx.fill(blob([
        [mx - mw * 1.1, my - 0.3],
        [mx + mw * 1.1, my - 0.38],
        [mx + mw, my + 0.05],
        [mx - mw, my + 0.02],
      ] as Pt[], 0.3))
      ctx.stroke(p)
      break
    }
    case 'grin': {
      const p = blob([
        [mx - mw * 1.4, my - 0.2],
        [mx, my + 1.3],
        [mx + mw * 1.4, my - 0.3],
      ] as Pt[], 0.6)
      ctx.fillStyle = '#7E2226'
      ctx.fill(p)
      ctx.fillStyle = '#FFFFFF'
      ctx.fill(blob([
        [mx - mw * 1.25, my - 0.15],
        [mx + mw * 1.25, my - 0.24],
        [mx + mw * 0.9, my + 0.24],
        [mx - mw * 0.9, my + 0.28],
      ] as Pt[], 0.3))
      ctx.stroke(p)
      break
    }
    case 'open':
    case 'o': {
      const p = ellipsePath(mx, my + 0.2, mw * 0.8, mw * 1.05 + (o.openMouth ?? 0))
      ctx.fillStyle = '#7E2226'
      ctx.fill(p)
      ctx.stroke(p)
      break
    }
  }
  ctx.restore()

  // Cheek blush warms the skin and stops the face reading as plastic.
  ctx.save()
  ctx.globalAlpha = 0.28
  ctx.fillStyle = mix(o.skin.core, '#E8604E', 0.55)
  ctx.fill(ellipsePath(cx + shift + r * 0.66, cy + r * 0.3, r * 0.26, r * 0.14))
  ctx.restore()
}

/** Hair drawn behind the head — the mass that gives the silhouette its weight. */
export function drawHairBack(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  hair: Cel,
  shape: Pt[],
): void {
  paint(ctx, blob(shape, 0.95), hair, {
    shadow: 0.5, radius: r * 1.4, pivot: [cx, cy], rim: 0.5, line: 0.5,
  })
}

/**
 * Hair drawn in front. Anime hair is a few large locks with hard edges, never a
 * texture: the locks are what read at distance, so they are drawn big and few.
 */
export function drawHairFront(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  hair: Cel,
  locks: Pt[][],
): void {
  for (const lock of locks) {
    paint(ctx, blob(lock, 0.9), hair, {
      shadow: 0.36, radius: r * 0.8, pivot: [cx, cy - r * 0.5], rim: 0.5, line: 0.45,
    })
  }
  // A single band of specular across the crown — the anime hair highlight.
  ctx.save()
  ctx.globalAlpha = 0.45
  ctx.fillStyle = cel(hair.light).light
  ctx.fill(blob([
    [cx - r * 0.72, cy - r * 0.62],
    [cx - r * 0.1, cy - r * 0.92],
    [cx + r * 0.66, cy - r * 0.6],
    [cx + r * 0.5, cy - r * 0.44],
    [cx - r * 0.1, cy - r * 0.72],
    [cx - r * 0.6, cy - r * 0.44],
  ] as Pt[], 0.8))
  ctx.restore()
}
