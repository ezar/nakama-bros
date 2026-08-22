import { cel, mix } from '../color'
import { blob, curve, ellipsePath, glint, paint, type Pt } from '../ink'
import type { FaceStyle } from './head'
import type {
  ArmStyle, Build, Expression, LegStyle, Palette, Proportion, Skeleton,
} from './rig'
import { BUILD, bodyFolds, bodyPoint, drawRibbon, ribbon } from './rig'

/**
 * The parts bin: what every crew member is assembled from.
 *
 * A cast of ten only reads as one cast if the *grammar* is shared — the same
 * kind of collar, the same kind of wrapped sash, the same weight of ink — while
 * the shapes disagree. Everything here is authored in body space, `u` along the
 * spine and `v` across the chest, so a lapel is still on the lapel at a thirty
 * degree lean and a hem swings a frame behind the hips.
 */

export interface Look {
  name: string
  pal: Palette
  build: Build
  /** Bone lengths relative to the shared rig. Absent means the default figure. */
  size?: Proportion
  face: Partial<FaceStyle>
  /** Expression and head angle used for the crew-select bust. */
  portrait: { expression: Expression; turn: number; tilt: number }
  /** Colour the portrait's backdrop is built from. */
  banner: string
  arms(pal: Palette): ArmStyle
  legs(pal: Palette): LegStyle
  /** Cloth behind the whole figure: a coat back, a hair fall, a cape. */
  backCloth?(ctx: CanvasRenderingContext2D, s: Skeleton, pal: Palette): void
  /** The torso and everything worn on it. */
  torso(ctx: CanvasRenderingContext2D, s: Skeleton, pal: Palette): void
  /** Cloth that hangs over the legs — skirts, coat tails, long hems. */
  overLegs?(ctx: CanvasRenderingContext2D, s: Skeleton, pal: Palette): void
  /** Hair mass behind the head. */
  hairBack(cx: number, cy: number, r: number, s: Skeleton): Pt[]
  /** Locks drawn over the face. */
  hairFront(cx: number, cy: number, r: number, s: Skeleton): Pt[][]
  /** Hat, bandana, goggles — drawn last, over the hair. */
  headgear?(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, s: Skeleton): void
  /** Anything carried: swords on the hip, a satchel on the back. */
  props?(ctx: CanvasRenderingContext2D, s: Skeleton, phase: 'behind' | 'front'): void
  /**
   * Which attack the animation table builds for this character. It also decides
   * where the weapon is anchored: a kick hangs off the leading foot, everything
   * else off the leading hand.
   */
  attackStyle: 'punch' | 'slash' | 'kick' | 'shoot' | 'bloom' | 'mecha' | 'palm'
  /** The thing in the leading hand — or foot — during an attack. */
  weapon(ctx: CanvasRenderingContext2D, hand: Pt, angle: number, t: number): void
}

/**
 * Skin's ramp is softer than cloth's.
 *
 * Flesh scatters light, so its terminator is a smaller step in value than a
 * jacket's. Given the full cloth ramp a face splits into a pale half and an
 * orange half straight across the eyes, which is the single ugliest thing that
 * can happen to a cel-shaded character.
 */
export const skinCel = (hex: string) => {
  const c = cel(hex, { lineDarkness: 0.34 })
  return { ...c, shade: mix(c.core, c.shade, 0.58), deep: mix(c.core, c.deep, 0.7) }
}

export const P = (o: {
  skin: string
  hair: string
  shirt: string
  trousers: string
  boots: string
  accent: string
  sash: string
  coat?: string
  trim?: string
}): Palette => ({
  skin: skinCel(o.skin),
  hair: cel(o.hair),
  shirt: cel(o.shirt),
  trousers: cel(o.trousers),
  boots: cel(o.boots),
  accent: cel(o.accent),
  sash: cel(o.sash),
  coat: cel(o.coat ?? o.shirt),
  trim: cel(o.trim ?? o.accent),
})

/** Trace a closed garment panel through body-space coordinates. */
export const panel = (s: Skeleton, uv: Array<[number, number]>, tension = 0.7): Path2D =>
  blob(uv.map(([u, v]) => bodyPoint(s, u, v)) as Pt[], tension)

export const paintPanel = (
  ctx: CanvasRenderingContext2D,
  s: Skeleton,
  uv: Array<[number, number]>,
  c: Parameters<typeof paint>[2],
  opts: Parameters<typeof paint>[3] = {},
): Path2D => {
  const path = panel(s, uv)
  paint(ctx, path, c, {
    shadow: 0.44, radius: 4.6, pivot: bodyPoint(s, 0.55, 0), rim: 0.5, line: 0.48, occlusion: 0.24, ...opts,
  })
  return path
}

/** A wrap at the waist: sash, haramaki, belt, obi. The one horizontal in the figure. */
export function waistWrap(
  ctx: CanvasRenderingContext2D,
  s: Skeleton,
  c: Palette['sash'],
  top: number,
  bottom: number,
  grow = 0.5,
  build: Build = BUILD,
): void {
  const w = build.waist + grow
  const path = paintPanel(ctx, s, [
    [top, -w * 1.02],
    [top, w * 1.02],
    [(top + bottom) / 2, w * 1.08],
    [bottom, w * 0.98],
    [bottom, -w * 0.98],
    [(top + bottom) / 2, -w * 1.08],
  ], c, { radius: w, pivot: bodyPoint(s, (top + bottom) / 2, 0), occlusion: 0.3 })
  // Wrapped cloth creases along its length rather than across it.
  bodyFolds(ctx, path, s, [
    [[top - 0.02, -w * 0.5], [bottom + 0.02, -w * 0.44]],
    [[top - 0.02, w * 0.34], [bottom + 0.02, w * 0.4]],
  ], c.deep, 0.4, 0.45)
}

/** A collar standing away from the neck — reads instantly as "clothed". */
export function collar(
  ctx: CanvasRenderingContext2D,
  s: Skeleton,
  c: Palette['shirt'],
  spread = 2.4,
  rise = 0.16,
): void {
  paintPanel(ctx, s, [
    [1.02 + rise, -spread],
    [1.06 + rise, 0],
    [1.02 + rise, spread],
    [0.86, spread * 0.7],
    [0.94, 0],
    [0.86, -spread * 0.7],
  ], c, { radius: spread, pivot: bodyPoint(s, 1, 0), shadow: 0.38 })
}

/** Two loose tails hanging off a hem, streaming with the pose's drag. */
export function tails(
  ctx: CanvasRenderingContext2D,
  s: Skeleton,
  c: Palette['shirt'],
  at: number,
  spread: number,
  len: number,
  width: number,
  flare = 0.5,
): void {
  for (const side of [-1, 1]) {
    const root = bodyPoint(s, at, spread * side)
    // Tails leave the hem outward, so they break the silhouette at the hips
    // instead of hanging down the thighs where they read as suspenders.
    const curl = -0.6 - s.drag * 0.22 + side * 0.14
    drawRibbon(
      ctx,
      ribbon(root, Math.PI / 2 - side * flare - s.drag * 0.2, len, width, width * 0.4, curl,
        0.1 + Math.abs(s.drag) * 0.02, s.flutter + side * 0.28),
      c,
      root,
      len * 0.5,
    )
  }
}

/** A plain capsule — used where a full radius profile would be overkill. */
export function limbFormLite(a: Pt, b: Pt, r: number): Path2D {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy) || 1
  const nx = (-dy / len) * r
  const ny = (dx / len) * r
  return blob([
    [a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny],
  ] as Pt[], 0.4)
}

/**
 * A ring of spikes with an uneven rhythm.
 *
 * The seed shifts each spike's length so no two are the same: an even comb of
 * identical points is the fastest way to make hair look procedural.
 */
export const spikeHair = (
  cx: number, cy: number, r: number, spikes: number, spread: number, len: number, seed = 1,
): Pt[] => {
  const pts: Pt[] = []
  for (let i = 0; i <= spikes; i++) {
    const t = i / spikes
    const a = -Math.PI + spread * 0.5 + t * (Math.PI * 2 - spread)
    const jitter = Math.sin(i * 2.399 * seed) * 0.5 + Math.sin(i * 5.13 * seed) * 0.24
    const rad = r * (i % 2 === 0 ? 1.04 + len * (1 + jitter) : 0.97 + jitter * 0.05)
    pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad * 0.96])
  }
  return pts
}

// ─────────────────────────────────────────────────────────────────────────────
// Hardware
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A metal plate with a seam and rivets.
 *
 * Machinery reads as machinery because of its *joins*: a bare panel is a shape,
 * a panel with a seam down it and two bolts holding it on is a part. The plate
 * takes a much harder terminator than cloth and a bright rim, because that is
 * how brushed metal answers a single light.
 */
export function plate(
  ctx: CanvasRenderingContext2D,
  pts: Pt[],
  c: Parameters<typeof paint>[2],
  pivot: Pt,
  radius: number,
  seam?: Pt[],
): Path2D {
  const path = blob(pts, 0.55)
  paint(ctx, path, c, { shadow: 0.5, radius, pivot, rim: 0.8, line: 0.5, occlusion: 0.3 })
  if (seam) {
    ctx.save()
    ctx.clip(path)
    ctx.globalAlpha = 0.7
    ctx.strokeStyle = typeof c === 'string' ? '#000000' : c.deep
    ctx.lineWidth = 0.42
    ctx.stroke(curve(seam))
    ctx.globalAlpha = 0.4
    ctx.strokeStyle = typeof c === 'string' ? '#FFFFFF' : c.light
    ctx.lineWidth = 0.28
    ctx.stroke(curve(seam.map(([x, y]) => [x + 0.3, y + 0.3] as Pt)))
    ctx.restore()
  }
  return path
}

/** Bolt heads along a line. Three is hardware; twelve is a colander. */
export function bolts(
  ctx: CanvasRenderingContext2D,
  from: Pt,
  to: Pt,
  n: number,
  r: number,
  c: Parameters<typeof paint>[2],
): void {
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1)
    const x = from[0] + (to[0] - from[0]) * t
    const y = from[1] + (to[1] - from[1]) * t
    paint(ctx, ellipsePath(x, y, r, r), c, { shadow: 0.5, radius: r, pivot: [x, y], rim: 0.3, line: 0.3 })
    glint(ctx, x - r * 0.3, y - r * 0.35, r * 0.34, r * 0.24, -0.6, '#FFFFFF', 0.7)
  }
}

/**
 * A fin: a swept membrane with two ribs.
 *
 * Used on a fishman's forearms and behind his ears. It is drawn as one blade
 * rather than a fan of spines — at this size a fan turns into a smudge, and the
 * single swept shape is what says "not human" in the silhouette.
 */
export function fin(
  ctx: CanvasRenderingContext2D,
  root: Pt,
  angle: number,
  len: number,
  width: number,
  c: Parameters<typeof paint>[2],
  sweep = 0.5,
): void {
  const ux = Math.cos(angle)
  const uy = Math.sin(angle)
  const nx = -uy
  const ny = ux
  const Q = (x: number, y: number): Pt => [root[0] + ux * x + nx * y, root[1] + uy * x + ny * y]
  const path = blob([
    Q(0, -width * 0.5),
    Q(len * 0.5, -width * (0.5 + sweep * 0.5)),
    Q(len, -width * sweep * 0.3),
    Q(len * 0.86, width * 0.5),
    Q(len * 0.4, width * 0.9),
    Q(0, width * 0.6),
  ] as Pt[], 0.8)
  paint(ctx, path, c, { shadow: 0.48, radius: width, pivot: root, rim: 0.5, line: 0.46, occlusion: 0.2 })
  ctx.save()
  ctx.clip(path)
  ctx.globalAlpha = 0.45
  ctx.strokeStyle = typeof c === 'string' ? '#000000' : c.deep
  ctx.lineWidth = 0.4
  for (const k of [-0.15, 0.3]) {
    ctx.stroke(curve([Q(len * 0.12, width * k), Q(len * 0.85, width * (k - sweep * 0.2))] as Pt[]))
  }
  ctx.restore()
}
