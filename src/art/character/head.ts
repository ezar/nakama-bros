import { cel, mix, type Cel } from '../color'
import { blob, curve, ellipsePath, glint, inkStroke, paint, type Pt } from '../ink'
import type { Expression, Skeleton } from './rig'
import { SEG, limbForm } from './rig'

/**
 * Heads and faces.
 *
 * The head is barely eight world units across on screen, so the face has to be
 * drawn like a poster rather than a portrait: four bold marks — lash, iris,
 * brow, mouth — each carrying a quarter of the expression, and nothing else
 * competing with them. The heaviest line on the whole character is the upper
 * lash; the brow above it is the mark the player actually reads at speed.
 */

export interface FaceStyle {
  /** Multiplier on eye size. Chopper's are huge, Zoro's narrow. */
  eye: number
  /** Eye aspect: below 1 narrows the eye into a sharper, older shape. */
  eyeAspect: number
  lash: number
  brow: number
  iris: string | null
  /** A spiral instead of a brow — Sanji, and nobody else. */
  swirlBrow: boolean
  /** A short scar under the near eye. */
  scar: boolean
  blush: number
  /** A soft muzzle over the lower face — the reindeer. */
  muzzle: boolean
  /** Freckles across the nose bridge. */
  freckles: boolean
  /** Length of the nose tick, in head radii. */
  nose: number
}

export const FACE: FaceStyle = {
  eye: 1,
  eyeAspect: 1,
  lash: 1,
  brow: 1,
  iris: null,
  swirlBrow: false,
  scar: false,
  blush: 1,
  muzzle: false,
  freckles: false,
  nose: 1,
}

export interface FaceOptions {
  skin: Cel
  hair: Cel
  expression: Expression
  /** 0 = looking straight at the camera, 1 = full profile in the facing direction. */
  turn: number
  style?: Partial<FaceStyle>
}

interface EyeShape {
  /** Upper lash curve control, higher = more open. Below 0.22 the eye shuts. */
  open: number
  /** Lower lid pushing up into the iris — the difference between wide and hard. */
  squint: number
  /** Brow angle: negative is angry, positive is worried. */
  brow: number
  raise: number
  /** Iris vertical offset — looking up or down. */
  look: number
  /** Closed-eye curvature: positive arches up (joy), negative folds down (pain). */
  arc: number
  mouth: 'flat' | 'smile' | 'grin' | 'grit' | 'frown' | 'o' | 'shout' | 'smirk'
  gape: number
  cheek: number
  sweat: number
}

const E = (o: Partial<EyeShape>): EyeShape => ({
  open: 1, squint: 0, brow: 0, raise: 0, look: 0, arc: 1, mouth: 'flat', gape: 0, cheek: 1, sweat: 0, ...o,
})

/**
 * The expression set.
 *
 * Every animation picks one of these, and they are deliberately far apart: a
 * player glancing at a 36-unit sprite mid-jump has to tell "strained" from
 * "delighted" in one frame, so the differences are in the big shapes — how
 * shut the eye is, which way the brow runs, how wide the mouth opens.
 */
const EXPRESSIONS: Record<Expression, EyeShape> = {
  neutral: E({}),
  determined: E({ open: 0.96, squint: 0.24, brow: -0.52, raise: -0.46, look: 0.08, mouth: 'grit' }),
  surprised: E({ open: 1.52, squint: -0.18, brow: 0.26, raise: 0.92, look: -0.2, mouth: 'o', gape: 0.55 }),
  strain: E({ open: 0.5, squint: 0.58, brow: -0.68, raise: -0.62, look: 0.24, mouth: 'shout', gape: 0.35, sweat: 1 }),
  hurt: E({ open: 0.1, arc: -1, brow: 0.66, raise: 0.3, look: 0.3, mouth: 'frown', cheek: 1.4, sweat: 1 }),
  joy: E({ open: 0.1, arc: 1.15, brow: 0.24, raise: 0.52, mouth: 'grin', cheek: 1.7 }),
  focused: E({ open: 0.84, squint: 0.32, brow: -0.3, raise: -0.24, look: 0.04, mouth: 'flat' }),
  shout: E({ open: 1.22, brow: -0.58, raise: -0.16, look: -0.06, mouth: 'shout', gape: 1 }),
  smug: E({ open: 0.74, squint: 0.38, brow: -0.14, raise: 0.12, look: 0.06, mouth: 'smirk' }),
}

/** The skull shape: a rounded cranium tapering to a small chin. */
export function headPath(cx: number, cy: number, r: number, turn: number): Path2D {
  const jaw = 0.64 + turn * 0.12
  return blob([
    [cx - r * 0.96, cy - r * 0.28],
    [cx - r * 0.72, cy - r * 0.94],
    [cx + r * 0.1, cy - r * 1.08],
    [cx + r * 0.94, cy - r * 0.6],
    [cx + r * (0.88 + turn * 0.1), cy + r * 0.18],
    [cx + r * 0.46, cy + r * jaw],
    [cx - r * 0.1, cy + r * (jaw + 0.16)],
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

  // Neck first, so the head sits on it rather than floating. It is kept in deep
  // shadow: the jaw always occludes the throat, and that one dark wedge is what
  // seats a head on a body.
  const neckPath = blob([
    [s.neck[0] - 1.45, s.neck[1] + 1.5],
    [s.neck[0] + 1.45, s.neck[1] + 1.5],
    [cx + 1.2, cy + r * 0.52],
    [cx - 1.2, cy + r * 0.52],
  ] as Pt[], 0.4)
  paint(ctx, neckPath, o.skin, { shadow: 0.72, radius: 1.5, pivot: s.neck, line: 0.42, occlusion: 0.5 })

  // The terminator is pushed down to the jaw rather than run across the eyes:
  // on a face the shadow belongs under the chin and behind the hair, and the
  // features have to sit in unbroken light or they stop reading.
  paint(ctx, path, o.skin, {
    shadow: 0.27, radius: r * 1.2, pivot: [cx + r * 0.1, cy - r * 0.1], rim: 0.66, line: 0.5,
  })

  drawFace(ctx, cx, cy, r, o, path)
  return { center: [cx, cy], r, path }
}

function drawFace(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  o: FaceOptions,
  skull: Path2D,
): void {
  // Features are clipped to the skull. Without it a turned head pushes the near
  // eye past its own contour and the face floats off the head.
  ctx.save()
  ctx.clip(skull)
  const st: FaceStyle = { ...FACE, ...o.style }
  const e = EXPRESSIONS[o.expression]
  const ink = mix(o.hair.line, '#180F22', 0.4)
  // Turn shifts the features toward the facing side and squeezes the far eye.
  const shift = r * 0.24 * o.turn
  const eyeY = cy + r * 0.14 + e.look * r * 0.1
  const nearX = cx + shift + r * 0.4
  const farX = cx + shift - r * 0.52
  const nearW = r * 0.38 * st.eye
  const farW = nearW * (1 - o.turn * 0.4)
  const iris = st.iris ?? mix(o.hair.core, '#2E2440', 0.4)

  if (st.muzzle) {
    // The snout is drawn before the eyes so its ink line runs under them.
    const mz = blob([
      [cx + shift - r * 0.5, cy + r * 0.26],
      [cx + shift + r * 0.5, cy + r * 0.2],
      [cx + shift + r * 0.82, cy + r * 0.62],
      [cx + shift + r * 0.34, cy + r * 0.96],
      [cx + shift - r * 0.42, cy + r * 0.9],
      [cx + shift - r * 0.72, cy + r * 0.54],
    ] as Pt[], 0.9)
    paint(ctx, mz, cel(mix(o.skin.light, '#FFFFFF', 0.35), { lineDarkness: 0.36 }), {
      shadow: 0.34, radius: r * 0.7, pivot: [cx + shift, cy + r * 0.5], rim: 0.4, line: 0.44,
    })
  }

  const eye = (x: number, w: number, near: boolean) => {
    // Wider than tall. A tall eye at this size fills with iris and reads as a
    // hole; the sclera showing either side of the iris is what makes it an eye.
    const h = r * 0.4 * st.eye * st.eyeAspect * e.open
    if (h < r * 0.1) {
      // A shut eye is one confident arc, and which way it bends is the whole
      // expression: up for delight, folded down for pain.
      ctx.save()
      ctx.strokeStyle = ink
      ctx.lineWidth = 0.8 * st.lash
      ctx.lineCap = 'round'
      const a = e.arc
      ctx.stroke(curve(a >= 0
        ? [[x - w, eyeY + 0.4], [x, eyeY - 0.58 * a - 0.2], [x + w, eyeY + 0.38]] as Pt[]
        : [[x - w, eyeY - 0.5], [x - w * 0.05, eyeY + 0.32], [x + w, eyeY - 0.54]] as Pt[]))
      ctx.restore()
      return
    }
    ctx.save()
    // Sclera. The outer corner sits lower than the inner one.
    const socket = blob([
      [x - w, eyeY + 0.1],
      [x - w * 0.45, eyeY - h * 0.95],
      [x + w * 0.55, eyeY - h * 0.88],
      [x + w, eyeY + h * 0.2],
      [x + w * 0.3, eyeY + h * (0.92 - e.squint * 0.6)],
      [x - w * 0.52, eyeY + h * (0.78 - e.squint * 0.5)],
    ] as Pt[], 0.92)
    ctx.fillStyle = '#FCFAF6'
    ctx.fill(socket)
    ctx.save()
    ctx.clip(socket)
    // One iris, tall enough to touch both lids, leaving sclera only at the
    // corners. Four marks is the budget for a face five pixels high: sclera,
    // iris, glint, lash. A rim, a pupil and a lit floor on top of those is
    // three more tones than the eye has room for, and they average to grey.
    ctx.fillStyle = iris
    ctx.fill(ellipsePath(x + w * 0.08, eyeY + h * 0.06, w * 0.68, h * 1.06))
    ctx.restore()
    glint(ctx, x - w * 0.26, eyeY - h * 0.3, w * 0.3, h * 0.34, -0.5, '#FFFFFF', 1)

    // The upper lash: the heaviest line on the character, tapered and flicked
    // out past the outer corner.
    inkStroke(ctx, curve([
      [x - w * 1.04, eyeY + 0.2],
      [x - w * 0.36, eyeY - h * 1.08],
      [x + w * 0.7, eyeY - h * 0.86],
      [x + w * 1.22, eyeY - h * 0.4],
    ] as Pt[]), 0.74 * st.lash * (near ? 1 : 0.78), ink, 0.5)
    // Lower lid: thin, and only under the near eye.
    if (near) {
      ctx.globalAlpha = 0.45
      ctx.strokeStyle = ink
      ctx.lineWidth = 0.34
      ctx.stroke(curve([
        [x - w * 0.5, eyeY + h * (0.92 - e.squint * 0.5)],
        [x + w * 0.62, eyeY + h * (0.74 - e.squint * 0.5)],
      ] as Pt[]))
      ctx.globalAlpha = 1
    }
    ctx.restore()
  }

  eye(nearX, nearW, true)
  if (o.turn < 0.94) eye(farX, farW, false)

  // Brows, drawn as tapered solids rather than strokes. A brow with weight is
  // the difference between an expression and a face with lines on it.
  const brow = (x: number, w: number, dir: number, near: boolean) => {
    const y = eyeY - r * (0.5 + e.raise * -0.12)
    const tilt = e.brow * dir
    const a: Pt = [x - w * 1.05, y - tilt * r * 0.2]
    const b: Pt = [x + w * 1.1, y + tilt * r * 0.26 + r * 0.04]
    const wt = 0.4 * st.brow * (near ? 1 : 0.8)
    paint(ctx, limbForm(a, b, [[0, wt * 0.7], [0.35, wt], [1, wt * 0.45]], -0.28), cel(ink), {
      shadow: 0, rim: 0, line: 0,
    })
  }
  if (st.swirlBrow) {
    // One spiral over the visible eye. It is a silhouette cue, not a detail.
    ctx.save()
    ctx.strokeStyle = ink
    ctx.lineWidth = 0.5
    ctx.lineCap = 'round'
    const sx = nearX + r * 0.14
    const sy = eyeY - r * 0.56
    const pts: Pt[] = []
    for (let i = 0; i <= 14; i++) {
      const t = i / 14
      const ang = t * Math.PI * 2.3
      const rad = r * (0.06 + t * 0.32)
      pts.push([sx + Math.cos(ang) * rad, sy + Math.sin(ang) * rad * 0.62])
    }
    ctx.stroke(curve(pts))
    ctx.restore()
  } else {
    brow(nearX, nearW * 1.02, 1, true)
    if (o.turn < 0.94) brow(farX, farW * 1.02, -1, false)
  }

  if (st.scar) {
    ctx.save()
    ctx.strokeStyle = mix(o.skin.deep, '#8E3A32', 0.55)
    ctx.lineWidth = 0.42
    ctx.lineCap = 'round'
    ctx.stroke(curve([
      [nearX - nearW * 0.5, eyeY + r * 0.42],
      [nearX + nearW * 0.5, eyeY + r * 0.5],
    ] as Pt[]))
    ctx.stroke(curve([
      [nearX - nearW * 0.2, eyeY + r * 0.3],
      [nearX - nearW * 0.36, eyeY + r * 0.62],
    ] as Pt[]))
    ctx.restore()
  }

  if (st.freckles) {
    ctx.save()
    ctx.globalAlpha = 0.4
    ctx.fillStyle = o.skin.deep
    for (const [dx, dy] of [[-0.16, 0.36], [0.1, 0.44], [0.36, 0.34]]) {
      ctx.fill(ellipsePath(cx + shift + r * dx, cy + r * dy, r * 0.05, r * 0.04))
    }
    ctx.restore()
  }

  // Nose: a single short tick. More than that fights the eyes.
  if (!st.muzzle && st.nose > 0.01) {
    ctx.save()
    ctx.strokeStyle = mix(o.skin.shade, ink, 0.45)
    ctx.lineWidth = 0.46
    ctx.lineCap = 'round'
    ctx.stroke(curve([
      [cx + shift + r * 0.66, eyeY + r * 0.26],
      [cx + shift + r * (0.66 + 0.14 * st.nose), eyeY + r * (0.26 + 0.24 * st.nose)],
      [cx + shift + r * 0.54, eyeY + r * (0.26 + 0.28 * st.nose)],
    ] as Pt[]))
    ctx.restore()
  }

  // Mouth
  const mx = cx + shift + r * (st.muzzle ? 0.28 : 0.34)
  const my = cy + r * (st.muzzle ? 0.66 : 0.54)
  const mw = r * 0.3
  ctx.save()
  ctx.strokeStyle = ink
  ctx.lineWidth = 0.7
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const gum = '#7E2226'
  switch (e.mouth) {
    case 'flat':
      ctx.stroke(curve([[mx - mw, my], [mx + mw * 0.6, my - 0.14]] as Pt[]))
      break
    case 'smile':
      ctx.stroke(curve([[mx - mw, my - 0.24], [mx, my + 0.5], [mx + mw, my - 0.3]] as Pt[]))
      break
    case 'smirk':
      ctx.stroke(curve([[mx - mw, my + 0.24], [mx + mw * 0.3, my + 0.12], [mx + mw, my - 0.5]] as Pt[]))
      break
    case 'frown':
      ctx.stroke(curve([[mx - mw, my + 0.34], [mx, my - 0.3], [mx + mw, my + 0.4]] as Pt[]))
      break
    case 'grit': {
      const p = blob([
        [mx - mw * 1.25, my - 0.42],
        [mx + mw * 1.25, my - 0.52],
        [mx + mw * 1.05, my + 0.72],
        [mx - mw * 1.05, my + 0.66],
      ] as Pt[], 0.4)
      ctx.fillStyle = gum
      ctx.fill(p)
      ctx.fillStyle = '#FFFFFF'
      ctx.fill(blob([
        [mx - mw * 1.14, my - 0.36],
        [mx + mw * 1.14, my - 0.44],
        [mx + mw * 1.0, my + 0.06],
        [mx - mw * 1.0, my + 0.02],
      ] as Pt[], 0.3))
      ctx.stroke(p)
      // The tooth gap: two ticks are enough to say "clenched".
      ctx.globalAlpha = 0.7
      ctx.lineWidth = 0.3
      ctx.stroke(curve([[mx - mw * 0.3, my - 0.4], [mx - mw * 0.3, my + 0.02]] as Pt[]))
      ctx.stroke(curve([[mx + mw * 0.42, my - 0.42], [mx + mw * 0.42, my + 0.0]] as Pt[]))
      break
    }
    case 'grin': {
      const p = blob([
        [mx - mw * 1.5, my - 0.3],
        [mx - mw * 0.2, my + 0.5],
        [mx + mw * 1.5, my - 0.42],
        [mx + mw * 0.4, my + 1.5],
        [mx - mw * 0.6, my + 1.4],
      ] as Pt[], 0.62)
      ctx.fillStyle = gum
      ctx.fill(p)
      ctx.fillStyle = '#FFFFFF'
      ctx.fill(blob([
        [mx - mw * 1.34, my - 0.24],
        [mx + mw * 1.34, my - 0.36],
        [mx + mw * 0.95, my + 0.3],
        [mx - mw * 0.95, my + 0.36],
      ] as Pt[], 0.3))
      ctx.stroke(p)
      break
    }
    case 'shout': {
      const g = 0.6 + e.gape * 0.9
      const p = blob([
        [mx - mw * 1.15, my - 0.2],
        [mx, my - 0.55],
        [mx + mw * 1.15, my - 0.15],
        [mx + mw * 0.7, my + mw * 1.9 * g],
        [mx - mw * 0.7, my + mw * 1.9 * g],
      ] as Pt[], 0.75)
      ctx.fillStyle = gum
      ctx.fill(p)
      ctx.fillStyle = '#FFFFFF'
      ctx.fill(blob([
        [mx - mw * 1.05, my - 0.16],
        [mx + mw * 1.05, my - 0.12],
        [mx + mw * 0.86, my + 0.3],
        [mx - mw * 0.86, my + 0.3],
      ] as Pt[], 0.3))
      ctx.stroke(p)
      break
    }
    case 'o': {
      const p = ellipsePath(mx, my + 0.2, mw * (0.8 + e.gape * 0.2), mw * (1 + e.gape))
      ctx.fillStyle = gum
      ctx.fill(p)
      ctx.stroke(p)
      break
    }
  }
  if (st.muzzle) {
    // Reindeer nose, over the mouth.
    paint(ctx, ellipsePath(cx + shift + r * 0.5, cy + r * 0.42, r * 0.2, r * 0.15, -0.3), cel('#3A2A34'), {
      shadow: 0.3, radius: r * 0.2, pivot: [cx + shift + r * 0.5, cy + r * 0.42], rim: 0.24, line: 0,
    })
  }
  ctx.restore()

  // Cheek blush warms the skin and stops the face reading as plastic.
  if (st.blush > 0.01) {
    ctx.save()
    ctx.globalAlpha = 0.17 * st.blush * e.cheek
    ctx.fillStyle = mix(o.skin.core, '#E8604E', 0.6)
    ctx.fill(ellipsePath(cx + shift + r * 0.66, cy + r * 0.38, r * 0.22, r * 0.1))
    ctx.restore()
  }

  ctx.restore()

  // A bead of sweat sells effort at a size where a furrowed brow cannot. It
  // sits proud of the head, so it is drawn after the clip is released.
  if (e.sweat > 0) {
    ctx.save()
    ctx.globalAlpha = 0.9
    ctx.fillStyle = '#CFEFFF'
    ctx.fill(blob([
      [cx + shift + r * 0.9, cy - r * 0.66],
      [cx + shift + r * 1.06, cy - r * 0.42],
      [cx + shift + r * 0.9, cy - r * 0.26],
      [cx + shift + r * 0.74, cy - r * 0.44],
    ] as Pt[], 0.85))
    ctx.restore()
  }
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
    shadow: 0.52, radius: r * 1.4, pivot: [cx, cy], rim: 0.5, line: 0.5, occlusion: 0.22,
  })
}

/**
 * Hair drawn in front. Anime hair is a few large locks with hard edges, never a
 * texture: the locks are what read at distance, so they are drawn big and few,
 * each one painted separately so its own terminator cuts across the mass.
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
  // A single band of specular across the crown — the anime hair highlight. It
  // is one shape, not a gradient, so it holds the cel logic.
  ctx.save()
  ctx.globalAlpha = 0.5
  ctx.fillStyle = cel(hair.light).light
  ctx.fill(blob([
    [cx - r * 0.76, cy - r * 0.64],
    [cx - r * 0.12, cy - r * 0.96],
    [cx + r * 0.68, cy - r * 0.62],
    [cx + r * 0.5, cy - r * 0.44],
    [cx - r * 0.1, cy - r * 0.74],
    [cx - r * 0.62, cy - r * 0.44],
  ] as Pt[], 0.8))
  ctx.restore()
}

/** The shadow a hat or a heavy fringe throws across the brow. */
export function browShadow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  drop: number,
  strength = 0.26,
): void {
  ctx.save()
  ctx.globalAlpha = strength
  ctx.fillStyle = '#2A2038'
  ctx.fill(ellipsePath(cx + r * 0.1, cy - r * drop, r * 0.94, r * 0.34))
  ctx.restore()
}
