import { cel, mix, type Cel } from '../color'
import { SPRITE_LIGHT, blob, curve, ellipsePath, glint, type Pt } from '../ink'
import { celPaint } from './paint'
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
  c: Parameters<typeof celPaint>[2],
  opts: Parameters<typeof celPaint>[3] = {},
): Path2D => {
  const path = panel(s, uv)
  celPaint(ctx, path, c, {
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
  c: Parameters<typeof celPaint>[2],
  pivot: Pt,
  radius: number,
  seam?: Pt[],
): Path2D {
  const path = blob(pts, 0.55)
  celPaint(ctx, path, c, { shadow: 0.5, radius, pivot, rim: 0.8, line: 0.5, occlusion: 0.3 })
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
  c: Parameters<typeof celPaint>[2],
): void {
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1)
    const x = from[0] + (to[0] - from[0]) * t
    const y = from[1] + (to[1] - from[1]) * t
    celPaint(ctx, ellipsePath(x, y, r, r), c, { shadow: 0.5, radius: r, pivot: [x, y], rim: 0.3, line: 0.3 })
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
  c: Parameters<typeof celPaint>[2],
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
  celPaint(ctx, path, c, { shadow: 0.48, radius: width, pivot: root, rim: 0.5, line: 0.46, occlusion: 0.2 })
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

// ─────────────────────────────────────────────────────────────────────────────
// Stretched limbs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A long tapering tube of limb, lit like a cylinder.
 *
 * `celPaint()` cuts its terminator with a half-plane, which is right for a compact
 * form and wrong for a twenty-unit tube: the plane crosses the tube once and
 * leaves most of its length flat. A cylinder's shadow instead runs *along* it,
 * so this builds the same silhouette and then fills a band hugging the edge
 * that faces away from the light — the tube gets a hard terminator down its
 * whole length, which is what the rest of the character already has.
 */
export function stretchLimb(
  ctx: CanvasRenderingContext2D,
  a: Pt,
  b: Pt,
  r0: number,
  r1: number,
  c: Cel,
  opts: { band?: number; rim?: number; line?: number } = {},
): Path2D {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  // The normal pointing away from the key light is the side that goes dark.
  let nx = -uy
  let ny = ux
  if (nx * SPRITE_LIGHT.x + ny * SPRITE_LIGHT.y > 0) {
    nx = -nx
    ny = -ny
  }
  const at = (t: number, k: number): Pt => {
    const r = r0 + (r1 - r0) * t
    // A slight belly and a pinch just before the wrist: a straight-sided tube
    // is a pipe, and the taper is the only thing that says this is an arm.
    const swell = 1 + Math.sin(t * Math.PI) * 0.12 - Math.max(0, t - 0.82) * 1.1
    return [a[0] + ux * len * t + nx * r * swell * k, a[1] + uy * len * t + ny * r * swell * k]
  }
  const pts: Pt[] = []
  for (let i = 0; i <= 6; i++) pts.push(at(i / 6, 1))
  pts.push([b[0] + ux * r1 * 0.7, b[1] + uy * r1 * 0.7])
  for (let i = 6; i >= 0; i--) pts.push(at(i / 6, -1))
  pts.push([a[0] - ux * r0 * 0.7, a[1] - uy * r0 * 0.7])
  const path = blob(pts, 0.7)

  ctx.save()
  ctx.fillStyle = c.core
  ctx.fill(path)
  ctx.save()
  ctx.clip(path)
  // The shadow band: the same outline, pushed across the tube until only a
  // strip of it still overlaps the far edge.
  const bandW = opts.band ?? 0.68
  const shift = (2 - bandW) * Math.max(r0, r1)
  ctx.translate(nx * shift, ny * shift)
  ctx.fillStyle = c.shade
  ctx.fill(path)
  ctx.globalAlpha = 0.5
  ctx.translate(nx * Math.max(r0, r1) * 0.5, ny * Math.max(r0, r1) * 0.5)
  ctx.fillStyle = c.deep
  ctx.fill(path)
  ctx.restore()

  const rim = opts.rim ?? 0.55
  if (rim > 0) {
    ctx.save()
    ctx.clip(path)
    ctx.strokeStyle = c.light
    ctx.lineWidth = rim * 2
    ctx.translate(-SPRITE_LIGHT.x * rim * 0.95, -SPRITE_LIGHT.y * rim * 0.95)
    ctx.stroke(path)
    ctx.restore()
  }
  ctx.strokeStyle = c.line
  ctx.lineWidth = opts.line ?? 0.5
  ctx.stroke(path)
  ctx.restore()
  return path
}

/**
 * A fist seen from behind the knuckles.
 *
 * Three knuckle lobes across the leading edge, a thumb laid over the near side
 * and a wrist that is narrower than both. Without the wrist the fist is a ball
 * on a stick; without the knuckles it is a ball.
 */
export function bigFist(
  ctx: CanvasRenderingContext2D,
  at: Pt,
  angle: number,
  r: number,
  c: Cel,
): void {
  const ux = Math.cos(angle)
  const uy = Math.sin(angle)
  const nx = -uy
  const ny = ux
  const Q = (x: number, y: number): Pt => [at[0] + ux * x + nx * y, at[1] + uy * x + ny * y]

  // Wrist first: a short pinched cuff the fist widens out of.
  stretchLimb(ctx, Q(-r * 1.5, 0), Q(-r * 0.2, 0), r * 0.6, r * 0.78, c, { band: 0.6, line: 0.44 })

  const knuckle = (k: number) => Q(r * (0.95 + Math.cos(k * 1.05) * 0.16), r * k * 0.62)
  const path = blob([
    Q(-r * 0.35, -r * 1.02),
    Q(r * 0.5, -r * 1.08),
    knuckle(-1.35),
    knuckle(0),
    knuckle(1.35),
    Q(r * 0.35, r * 1.12),
    Q(-r * 0.5, r * 0.98),
  ] as Pt[], 0.82)
  celPaint(ctx, path, c, {
    shadow: 0.44, radius: r * 1.05, pivot: at, rim: 0.62, line: 0.52, occlusion: 0.24,
  })
  // Two creases between the knuckles, and the thumb across the near side.
  ctx.save()
  ctx.clip(path)
  ctx.globalAlpha = 0.55
  ctx.strokeStyle = c.line
  ctx.lineWidth = 0.4
  ctx.lineCap = 'round'
  for (const k of [-0.66, 0.66]) {
    ctx.stroke(curve([Q(r * 0.42, r * k * 0.7), Q(r * 1.0, r * k * 0.72)] as Pt[]))
  }
  ctx.restore()
  celPaint(
    ctx,
    blob([
      Q(-r * 0.5, r * 0.2),
      Q(r * 0.5, r * 0.5),
      Q(r * 0.72, r * 1.02),
      Q(r * 0.1, r * 1.12),
      Q(-r * 0.55, r * 0.86),
    ] as Pt[], 0.8),
    c,
    { shadow: 0.46, radius: r * 0.6, pivot: Q(0, r * 0.7), rim: 0.34, line: 0.46 },
  )
}

/**
 * An open hand, palm forward, fingers splayed.
 *
 * The difference between a hand and a lump on the end of an arm is that the
 * hand is *wider* than the limb it grows out of and its outline is broken:
 * three finger lobes and a thumb thrown clear of the palm. Both matter at
 * sprite size — a rounded cap on a tube reads as a cork whatever is drawn
 * inside it.
 */
export function openPalm(
  ctx: CanvasRenderingContext2D,
  at: Pt,
  angle: number,
  r: number,
  c: Cel,
  thumb: 1 | -1 = -1,
): void {
  const ux = Math.cos(angle)
  const uy = Math.sin(angle)
  const nx = -uy * thumb
  const ny = ux * thumb
  const Q = (x: number, y: number): Pt => [at[0] + ux * x + nx * y, at[1] + uy * x + ny * y]

  // The thumb first, so the palm's ink line closes over its root.
  celPaint(
    ctx,
    blob([Q(-r * 0.2, -r * 0.5), Q(r * 0.9, -r * 1.05), Q(r * 1.5, -r * 1.5),
      Q(r * 1.15, -r * 1.9), Q(r * 0.1, -r * 1.25)] as Pt[], 0.8),
    c,
    { shadow: 0.44, radius: r * 0.6, pivot: Q(r * 0.6, -r), rim: 0.34, line: 0.44 },
  )

  const finger = (k: number, len: number): Pt[] => [
    Q(r * 1.15, r * (k - 0.34)),
    Q(r * len, r * (k - 0.36)),
    Q(r * (len + 0.28), r * k),
    Q(r * len, r * (k + 0.34)),
    Q(r * 1.15, r * (k + 0.32)),
  ]
  const palm = blob([
    Q(-r * 0.3, -r * 0.95),
    Q(r * 1.2, -r * 1.1),
    Q(r * 1.3, r * 1.35),
    Q(-r * 0.2, r * 1.15),
    Q(-r * 0.7, r * 0.1),
  ] as Pt[], 0.8)
  celPaint(ctx, palm, c, {
    shadow: 0.44, radius: r * 1.1, pivot: at, rim: 0.5, line: 0.5, occlusion: 0.22,
  })
  // Three fingers, uneven lengths — a row of equal ones reads as a comb.
  for (const [k, len] of [[-0.78, 2.15], [0, 2.35], [0.78, 2.05]] as Array<[number, number]>) {
    celPaint(ctx, blob(finger(k, len), 0.7), c, {
      shadow: 0.46, radius: r * 0.4, pivot: Q(r * 1.6, r * k), rim: 0.3, line: 0.44,
    })
  }
}
