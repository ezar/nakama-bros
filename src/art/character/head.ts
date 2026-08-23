import { cel, hexToRgb, mix, rgba, rgbToHsl, type Cel } from '../color'
import { blob, curve, ellipsePath, glint, inkStroke, type Pt } from '../ink'
import { celPaint } from './paint'
import type { Expression, Skeleton } from './rig'
import { limbForm } from './rig'

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
  /**
   * A skull instead of a face: hollow sockets with a pinpoint of light in them,
   * a nasal cavity and a fixed rank of teeth. The expression still has to read,
   * so it lives in the socket's shape and the tilt of the brow ridge.
   */
  skull: boolean
  /** Tusks rising from the lower jaw, in head radii. 0 is none. */
  tusk: number
  /** Gill slits across the cheek — the fishman read. */
  gills: boolean
  /** Widens the jaw without widening the cranium: a heavy, blunt head. */
  jaw: number
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
  skull: false,
  tusk: 0,
  gills: false,
  jaw: 1,
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

/**
 * The skull shape: a broad rounded cranium over a short jaw.
 *
 * The chin is deliberately shallow. A long jaw pushes the eyes up under the
 * fringe and leaves a bare orange plate below the mouth, which is what makes a
 * stylised head read as a mask rather than a face; keeping the jaw short puts
 * the eyeline near the middle of the shape where the eye expects it and leaves
 * room for a cheek between the eye and the chin.
 */
export function headPath(cx: number, cy: number, r: number, turn: number, heft = 1): Path2D {
  const jaw = (0.62 + turn * 0.08) * heft
  // A skull is longer front-to-back than it is across, so turning it toward
  // profile shows more of it: the occiput swings out behind and the face plane
  // comes forward. Without this the features simply slide across a ball, which
  // is the tell that gives a flipbook character away.
  const back = turn * 0.16
  const front = turn * 0.11
  // The cranium's mass sits behind the face, so the top of the head drifts back
  // as it turns — the difference between a profile and a face pushed sideways.
  const crown = turn * 0.2
  // Taller than it is wide. A head as broad as the shoulders reads as a chibi
  // whatever is drawn on it; keeping the cranium narrow is what lets the head
  // be big enough to carry a face without the body looking like a doll's.
  return blob([
    [cx - r * (0.86 + back), cy - r * 0.4],
    [cx - r * (0.7 + back * 0.8), cy - r * 1.0],
    [cx + r * (0.04 - crown), cy - r * 1.14],
    [cx + r * (0.76 + front * 0.6), cy - r * 0.72],
    [cx + r * (0.84 + turn * 0.06 + front) * heft, cy + r * 0.02],
    [cx + r * (0.66 + front * 0.5) * heft, cy + r * (jaw * 0.66)],
    [cx + r * 0.18, cy + r * (jaw + 0.08)],
    [cx - r * 0.4, cy + r * (jaw - 0.06)],
    [cx - r * (0.74 + back * 0.5) * heft, cy + r * 0.2],
  ] as Pt[], 0.88)
}

/**
 * The throat, drawn before the costume rather than with the head.
 *
 * It is narrow and short on purpose: anything wider than the jaw stops being a
 * neck and becomes a second object under the chin, which is exactly how a
 * stylised head comes unstuck from its body. It is kept in deep shadow, because
 * the jaw always occludes the throat and that one dark wedge is what seats a
 * head on a pair of shoulders. And it is laid down *first*, so every collar,
 * lapel and kimono in the cast closes over its base — drawn with the head it
 * painted straight over them, and every character grew an orange post.
 */
export function drawNeck(ctx: CanvasRenderingContext2D, s: Skeleton, skin: Cel, jaw = 1): void {
  const [cx, cy] = s.head
  const r = s.headR
  const nw = 0.92 * jaw
  const path = blob([
    [s.neck[0] - nw * 1.2, s.neck[1] + 0.7],
    [s.neck[0] + nw * 1.2, s.neck[1] + 0.7],
    [cx + nw * 0.7, cy + r * 0.28],
    [cx - nw * 0.7, cy + r * 0.28],
  ] as Pt[], 0.3)
  // Built from the skin's deepest value, not its mid tone. The throat is the
  // one place on a character that is always fully occluded, and painting it a
  // shade under the jaw is the difference between a neck and an orange post.
  const throat = { ...skin, core: skin.deep, shade: skin.deep }
  celPaint(ctx, path, throat, { shadow: 0.4, radius: 1.2, pivot: s.neck, line: 0.4, occlusion: 0.5 })
}

/**
 * The nose in profile.
 *
 * A face turned to the side on a perfectly smooth ball is the tell that gives a
 * flipbook head away — a real profile breaks its own contour, and a painted-on
 * tick never will. This is a small wedge off the brow, laid down *under* the
 * skull so the skull's own fill closes the seam and only the part that projects
 * past the contour is ever seen.
 *
 * It fades in from half a turn: below that the nose is genuinely inside the
 * silhouette and a bump there would read as a lump on the cheek.
 */
function noseWedge(cx: number, cy: number, r: number, turn: number, nose: number): Path2D | null {
  const t = Math.max(0, Math.min(1, (turn - 0.5) / 0.42)) * nose
  if (t < 0.02) return null
  // Five points and a slack tension, because a nose is the one place on this
  // face that needs a corner: bridge, tip, and the notch under it. Rounded off,
  // it stops being a nose and becomes a swollen cheek. The first and last sit
  // well inside the skull, where the skull's own fill will bury them.
  const out = 0.17 * t
  return blob([
    [cx + r * 0.5, cy - r * 0.14],
    [cx + r * (0.86 + out * 0.6), cy + r * 0.08],
    [cx + r * (1.0 + out), cy + r * 0.28],
    [cx + r * (0.78 + out * 0.3), cy + r * 0.37],
    [cx + r * 0.48, cy + r * 0.4],
  ] as Pt[], 0.35)
}

export function drawHead(
  ctx: CanvasRenderingContext2D,
  s: Skeleton,
  o: FaceOptions,
): { center: Pt; r: number; path: Path2D } {
  const [cx, cy] = s.head
  const r = s.headR
  const st0: FaceStyle = { ...FACE, ...o.style }
  const path = headPath(cx, cy, r, o.turn, st0.jaw)

  // The terminator is pushed down to the jaw rather than run across the eyes:
  // on a face the shadow belongs under the chin and behind the hair, and the
  // features have to sit in unbroken light or they stop reading.
  // A face takes a much narrower rim than a jacket does. A wide one wraps the
  // jaw in cream and the head starts to read as a mask with a beard, so this is
  // a hint of light on the temple and nothing more.
  // A rim is a ratio, not a constant: on skin that is already near white — a
  // skull, or a very pale complexion — a cream band at full strength has no
  // headroom left and blows out into what reads as a headband across the brow.
  // Fade it toward nothing as the base lightens, and warm it instead of
  // whitening it.
  const skinL = rgbToHsl(hexToRgb(o.skin.core)).l
  const rimFade = 1 - Math.max(0, (skinL - 0.6) / 0.4) * 0.82
  const paint = (target: Path2D): void => celPaint(ctx, target, o.skin, {
    shadow: 0.27,
    radius: r * 1.2,
    pivot: [cx + r * 0.1, cy - r * 0.1],
    rim: 0.42 * rimFade,
    rimColor: mix(o.skin.light, skinL > 0.72 ? '#FFE6BE' : '#FFFFFF', 0.25),
    line: 0.5,
  })

  // A snout is already a profile, and a skull has a cavity where a nose would
  // be — neither wants one bolted on.
  if (!st0.muzzle && !st0.skull) {
    const wedge = noseWedge(cx, cy, r, o.turn, st0.nose)
    if (wedge) paint(wedge)
  }
  paint(path)

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
  const eyeY = cy + r * 0.08 + e.look * r * 0.08
  const nearX = cx + shift + r * 0.36
  const farX = cx + shift - r * 0.42
  const nearW = r * 0.24 * st.eye
  const farW = nearW * (1 - o.turn * 0.4)
  const iris = st.iris ?? mix(o.hair.core, '#2E2440', 0.4)

  if (st.skull) {
    drawSkullFace(ctx, cx + shift, cy, r, o, e, ink)
    ctx.restore()
    return
  }

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
    celPaint(ctx, mz, cel(mix(o.skin.light, '#FFFFFF', 0.35), { lineDarkness: 0.36 }), {
      shadow: 0.34, radius: r * 0.7, pivot: [cx + shift, cy + r * 0.5], rim: 0.4, line: 0.44,
    })
  }

  const eye = (x: number, w: number, near: boolean) => {
    // Wider than tall. A tall eye at this size fills with iris and reads as a
    // hole — which is precisely what went wrong the first time round: the eye
    // was taller than it was wide, the iris filled it, and two black ovals ate
    // the face. The sclera showing either side of the iris is what makes it an
    // eye rather than a socket.
    const h = r * 0.22 * st.eye * st.eyeAspect * e.open
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
    ctx.fillStyle = '#FDFBF4'
    ctx.fill(socket)
    ctx.save()
    ctx.clip(socket)
    // Three marks and no more. The eye is seven device pixels across at the
    // resolution this sheet is rasterised at, so a rim, a pupil, a lit floor
    // and a highlight all at once do not resolve — they average to grey, which
    // is exactly what the first pass got. Iris, pupil, glint: that is the
    // budget, and the iris is saturated so it survives being three pixels wide.
    ctx.fillStyle = iris
    ctx.fill(ellipsePath(x + w * 0.08, eyeY - h * 0.06, w * 0.64, h * 1.14))
    ctx.fillStyle = mix(iris, '#100A18', 0.62)
    ctx.fill(ellipsePath(x + w * 0.08, eyeY - h * 0.02, w * 0.34, h * 0.74))
    ctx.restore()
    glint(ctx, x - w * 0.26, eyeY - h * 0.5, w * 0.26, h * 0.34, -0.5, '#FFFFFF', 1)

    // The upper lash: the heaviest line on the character, tapered and flicked
    // out past the outer corner.
    inkStroke(ctx, curve([
      [x - w * 1.06, eyeY + 0.1],
      [x - w * 0.36, eyeY - h * 1.2],
      [x + w * 0.7, eyeY - h * 0.98],
      [x + w * 1.24, eyeY - h * 0.34],
    ] as Pt[]), 0.36 * st.lash * (near ? 1 : 0.76), ink, 0.5)
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
    const y = eyeY - r * (0.4 + e.raise * -0.1)
    const tilt = e.brow * dir
    const a: Pt = [x - w * 0.94, y - tilt * r * 0.18]
    const b: Pt = [x + w * 1.04, y + tilt * r * 0.24 + r * 0.03]
    const wt = 0.24 * st.brow * (near ? 1 : 0.8)
    celPaint(ctx, limbForm(a, b, [[0, wt * 0.7], [0.35, wt], [1, wt * 0.45]], -0.28), cel(ink), {
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

  // Mouth.
  //
  // It has to be a *mark*, not a tick. A one-unit hyphen on a nine-unit head
  // disappears the moment the sprite is on a busy background, and the face is
  // then two eyes and nothing — which is the other half of why the old head
  // read as a mask. Everything below is authored against `mw`, so widening the
  // mouth widens the whole shape rather than stretching a line.
  const mx = cx + shift + r * (st.muzzle ? 0.24 : 0.3)
  const my = cy + r * (st.muzzle ? 0.62 : 0.46)
  const mw = r * (st.muzzle ? 0.32 : 0.36)
  const lip = mix(o.skin.deep, ink, 0.62)
  ctx.save()
  ctx.strokeStyle = lip
  ctx.lineWidth = 0.5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const gum = '#7E2226'
  switch (e.mouth) {
    case 'flat':
      inkStroke(ctx, curve([
        [mx - mw * 0.82, my - mw * 0.06],
        [mx - mw * 0.06, my + mw * 0.14],
        [mx + mw * 0.74, my - mw * 0.08],
      ] as Pt[]), 0.5, lip, 0.5)
      break
    case 'smile':
      inkStroke(ctx, curve([
        [mx - mw, my - mw * 0.3],
        [mx, my + mw * 0.52],
        [mx + mw, my - mw * 0.36],
      ] as Pt[]), 0.54, lip, 0.5)
      break
    case 'smirk':
      inkStroke(ctx, curve([
        [mx - mw, my + mw * 0.3],
        [mx + mw * 0.3, my + mw * 0.16],
        [mx + mw, my - mw * 0.6],
      ] as Pt[]), 0.54, lip, 0.5)
      break
    case 'frown':
      inkStroke(ctx, curve([
        [mx - mw, my + mw * 0.42],
        [mx, my - mw * 0.34],
        [mx + mw, my + mw * 0.46],
      ] as Pt[]), 0.54, lip, 0.5)
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
    celPaint(ctx, ellipsePath(cx + shift + r * 0.5, cy + r * 0.42, r * 0.2, r * 0.15, -0.3), cel('#3A2A34'), {
      shadow: 0.3, radius: r * 0.2, pivot: [cx + shift + r * 0.5, cy + r * 0.42], rim: 0.24, line: 0,
    })
  }
  ctx.restore()

  // Gills: three slits raked back along the cheek, shorter as they go down.
  if (st.gills) {
    ctx.save()
    ctx.strokeStyle = mix(o.skin.deep, ink, 0.5)
    ctx.lineWidth = 0.4
    ctx.lineCap = 'round'
    for (let i = 0; i < 3; i++) {
      const y = cy + r * (0.1 + i * 0.24)
      const len = r * (0.46 - i * 0.08)
      ctx.stroke(curve([
        [cx + shift - r * 0.92, y - r * 0.06],
        [cx + shift - r * 0.92 + len * 0.5, y + r * 0.06],
        [cx + shift - r * 0.92 + len, y + r * 0.04],
      ] as Pt[]))
    }
    ctx.restore()
  }

  // Cheek blush warms the skin and stops the face reading as plastic.
  if (st.blush > 0.01) {
    ctx.save()
    ctx.globalAlpha = 0.17 * st.blush * e.cheek
    ctx.fillStyle = mix(o.skin.core, '#E8604E', 0.6)
    ctx.fill(ellipsePath(cx + shift + r * 0.66, cy + r * 0.38, r * 0.22, r * 0.1))
    ctx.restore()
  }

  ctx.restore()

  // Tusks break the jaw line, so they are drawn once the clip is released.
  if (st.tusk > 0.01) {
    const bone = cel(mix('#FFF8E8', o.skin.core, 0.18), { lineDarkness: 0.4 })
    for (const [dx, k] of [[0.62, 1], [-0.24, 0.82]] as Array<[number, number]>) {
      const bx = cx + shift + r * dx
      const by = cy + r * 0.5
      celPaint(ctx, blob([
        [bx - r * 0.15 * k, by + r * 0.12],
        [bx + r * 0.16 * k, by + r * 0.16],
        [bx + r * 0.1 * k, by - r * st.tusk * k],
        [bx - r * 0.12 * k, by - r * st.tusk * 0.82 * k],
      ] as Pt[], 0.6), bone, {
        shadow: 0.34, radius: r * 0.3, pivot: [bx, by], rim: 0.3, line: 0.42,
      })
    }
  }

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

/**
 * A skull's face.
 *
 * Everything the living cast says with lids and lips this one has to say with
 * bone: the socket's *shape* carries the brow, a pinpoint of light inside it
 * carries the gaze, and the jaw drops for a shout. Two hollows and a rank of
 * teeth is a face the moment the light in the sockets moves.
 */
function drawSkullFace(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  o: FaceOptions,
  e: EyeShape,
  ink: string,
): void {
  const hollow = cel(mix(ink, '#0B0714', 0.45))
  const bone = o.skin
  const socket = (x: number, k: number, dir: number) => {
    // The socket is a rounded triangle, tipped by the brow so the same hollow
    // reads furious or startled without changing size.
    const tilt = e.brow * dir * 0.5
    // Narrow, tall and canted inward at the top, with a corner rather than a
    // curve on the inner brow. Two round holes of equal weight on a pale head
    // read as a panda, whatever size they are — the asymmetry and the angle
    // are what make them bone.
    const w = r * 0.27 * k
    const h = r * 0.44 * (0.85 + e.open * 0.3)
    const inner = dir > 0 ? -1 : 1
    const p = blob([
      [x + inner * w * 0.95, cy - h * (0.86 + e.raise * 0.1) - tilt * r * 0.3],
      [x - inner * w * 0.85, cy - h * (0.52 + e.raise * 0.08) + tilt * r * 0.28],
      [x - inner * w, cy + h * 0.34],
      [x - inner * w * 0.42, cy + h * 0.94],
      [x + inner * w * 0.5, cy + h * 0.72],
    ] as Pt[], 0.55)
    celPaint(ctx, p, hollow, { shadow: 0.2, radius: w, pivot: [x, cy], rim: 0, line: 0.42 })
    // The pinpoint. It is the whole gaze, so it moves with the expression.
    ctx.save()
    ctx.globalAlpha = 0.92
    ctx.fillStyle = '#F4FBFF'
    ctx.fill(ellipsePath(x + w * (0.18 + e.look * 0.4), cy + h * (0.05 + e.look * 0.5),
      w * 0.17 * k, h * 0.15))
    ctx.restore()
  }
  // A living head keeps its cranium under hair. A skull does not: the afro sits
  // behind and above, and what it leaves is a bare brow half the height of the
  // face, lit dead flat because the terminator is pushed down to the jaw. Flat,
  // near-white, and cut off by the brow ridge, it read as a bandage tied round
  // his head. The overhang casts, so give it the shadow it should already have
  // — that is what turns the brow from a shape into a surface with a top.
  ctx.save()
  const cast = ctx.createLinearGradient(cx, cy - r * 1.12, cx, cy - r * 0.24)
  cast.addColorStop(0, rgba('#241B33', 0.5))
  cast.addColorStop(0.55, rgba('#241B33', 0.2))
  cast.addColorStop(1, rgba('#241B33', 0))
  ctx.fillStyle = cast
  ctx.fill(ellipsePath(cx - r * 0.06, cy - r * 0.6, r * 1.05, r * 0.66))
  ctx.restore()

  socket(cx + r * 0.38, 1, 1)
  if (o.turn < 0.94) socket(cx - r * 0.44, 1 - o.turn * 0.35, -1)

  // Brow ridge: one heavy bone line across both sockets, the only thing that
  // can scowl on a face with no muscles.
  ctx.save()
  ctx.strokeStyle = mix(bone.deep, ink, 0.5)
  ctx.lineWidth = 0.5
  ctx.stroke(curve([
    [cx - r * 0.95, cy - r * (0.5 - e.brow * 0.16)],
    [cx - r * 0.1, cy - r * 0.66],
    [cx + r * 0.92, cy - r * (0.5 + e.brow * 0.16)],
  ] as Pt[]))
  ctx.restore()

  // Nasal cavity — a small inverted heart, off-centre with the head's turn.
  celPaint(ctx, blob([
    [cx + r * 0.06, cy + r * 0.28],
    [cx + r * 0.3, cy + r * 0.5],
    [cx + r * 0.04, cy + r * 0.6],
    [cx - r * 0.2, cy + r * 0.48],
  ] as Pt[], 0.85), hollow, { shadow: 0, radius: r * 0.2, pivot: [cx, cy + r * 0.45], line: 0.36 })

  // Teeth: an upper rank always, a lower one that drops away on a shout.
  const drop = r * (0.1 + e.gape * 0.42)
  const my = cy + r * 0.86
  const tw = r * 0.78
  const rank = (y: number, h: number) => {
    const p = blob([
      [cx - tw, y - h * 0.5],
      [cx + tw * 0.92, y - h * 0.55],
      [cx + tw * 0.8, y + h * 0.5],
      [cx - tw * 0.9, y + h * 0.55],
    ] as Pt[], 0.35)
    ctx.fillStyle = '#FFFDF6'
    ctx.fill(p)
    ctx.save()
    ctx.clip(p)
    ctx.strokeStyle = mix(bone.shade, ink, 0.45)
    ctx.lineWidth = 0.3
    for (let i = -3; i <= 3; i++) {
      ctx.stroke(curve([[cx + i * tw * 0.28, y - h], [cx + i * tw * 0.28, y + h]] as Pt[]))
    }
    ctx.restore()
    ctx.strokeStyle = ink
    ctx.lineWidth = 0.42
    ctx.stroke(p)
  }
  if (e.gape > 0.05) {
    // The dark of the open jaw, behind both ranks.
    celPaint(ctx, blob([
      [cx - tw, my - r * 0.12],
      [cx + tw * 0.9, my - r * 0.14],
      [cx + tw * 0.7, my + drop + r * 0.2],
      [cx - tw * 0.8, my + drop + r * 0.22],
    ] as Pt[], 0.5), hollow, { shadow: 0, radius: r * 0.5, pivot: [cx, my], line: 0.4 })
  }
  rank(my, r * 0.24)
  rank(my + drop + r * 0.12, r * 0.2)
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
  celPaint(ctx, blob(shape, 0.95), hair, {
    shadow: 0.52, radius: r * 1.4, pivot: [cx, cy], rim: 0.5, line: 0.5, occlusion: 0.22,
  })

  // A shine sized from the mass's own bounds rather than the head's, so a
  // shape that sits well clear of the skull still catches the key light.
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const [x, y] of shape) {
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  const w = x1 - x0
  const h = y1 - y0
  if (w > 0.5 && h > 0.5) {
    ctx.save()
    ctx.clip(blob(shape, 0.95))
    ctx.globalAlpha = 0.42
    ctx.fillStyle = cel(hair.light).light
    ctx.fill(blob([
      [x0 + w * 0.14, y0 + h * 0.42],
      [x0 + w * 0.34, y0 + h * 0.13],
      [x0 + w * 0.72, y0 + h * 0.3],
      [x0 + w * 0.6, y0 + h * 0.42],
      [x0 + w * 0.36, y0 + h * 0.27],
      [x0 + w * 0.22, y0 + h * 0.52],
    ] as Pt[], 0.85))
    ctx.restore()
  }
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
    celPaint(ctx, blob(lock, 0.9), hair, {
      shadow: 0.36, radius: r * 0.8, pivot: [cx, cy - r * 0.5], rim: 0.5, line: 0.45,
    })
  }
  // A single band of specular across the crown — the anime hair highlight. It
  // is one shape, not a gradient, so it holds the cel logic.
  //
  // It is clipped to the locks that were actually drawn. Placed by head radius
  // alone it lands wherever the crown *would* be, which on a character whose
  // hair sits high — an afro, a tall crest — is bare forehead, and it reads as
  // a headband rather than a shine.
  const mass = new Path2D()
  for (const lock of locks) mass.addPath(blob(lock, 0.9))
  ctx.save()
  ctx.clip(mass)
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
  strength = 0.14,
): void {
  ctx.save()
  ctx.globalAlpha = strength
  ctx.fillStyle = '#2A2038'
  ctx.fill(ellipsePath(cx + r * 0.1, cy - r * drop, r * 0.78, r * 0.24))
  ctx.restore()
}
