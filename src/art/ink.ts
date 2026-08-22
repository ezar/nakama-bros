import { ART_SCALE } from '../types'
import { type Cel, cel, rgba } from './color'

/**
 * The cel-shading drawing toolkit.
 *
 * Painters work in WORLD UNITS — a character is about 30 units tall — and the
 * surface's context is pre-scaled by ART_SCALE, so the same code produces crisp
 * output at any resolution. Everything here is path-based: shapes are built as
 * Path2D, filled with a flat base, cut with a single hard-edged shadow, given a
 * rim of light on the key side and closed with a coloured ink line. That
 * sequence — flat, terminator, rim, line — is the whole grammar of the style.
 */

export interface Surface {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  /** Size in world units. */
  w: number
  h: number
  /** Size in device pixels. */
  pw: number
  ph: number
  scale: number
}

export function createSurface(w: number, h: number, scale = ART_SCALE): Surface {
  const canvas = document.createElement('canvas')
  const pw = Math.max(1, Math.ceil(w * scale))
  const ph = Math.max(1, Math.ceil(h * scale))
  canvas.width = pw
  canvas.height = ph
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.scale(scale, scale)
  return { canvas, ctx, w, h, pw, ph, scale }
}

/** Direction the key light comes from, in world space. Up-left by default. */
export interface Light {
  x: number
  y: number
}

export const KEY_LIGHT: Light = { x: -0.6, y: -0.8 }

// ─────────────────────────────────────────────────────────────────────────────
// Paths
// ─────────────────────────────────────────────────────────────────────────────

export type Pt = [number, number]

/**
 * A closed organic shape through the given points, using Catmull-Rom
 * interpolation converted to cubic beziers. This is the workhorse: hair locks,
 * coats, jaws and clouds are all one call to this.
 */
export function blob(points: Pt[], tension = 1): Path2D {
  const p = new Path2D()
  const n = points.length
  if (n < 3) return p
  const at = (i: number): Pt => points[((i % n) + n) % n]
  p.moveTo(points[0][0], points[0][1])
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1)
    const p1 = at(i)
    const p2 = at(i + 1)
    const p3 = at(i + 2)
    const t = tension / 6
    p.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) * t,
      p1[1] + (p2[1] - p0[1]) * t,
      p2[0] - (p3[0] - p1[0]) * t,
      p2[1] - (p3[1] - p1[1]) * t,
      p2[0],
      p2[1],
    )
  }
  p.closePath()
  return p
}

/** An open smooth curve — used for cloth folds, hair strands and slash arcs. */
export function curve(points: Pt[], tension = 1): Path2D {
  const p = new Path2D()
  const n = points.length
  if (n < 2) return p
  const at = (i: number): Pt => points[Math.max(0, Math.min(n - 1, i))]
  p.moveTo(points[0][0], points[0][1])
  for (let i = 0; i < n - 1; i++) {
    const p0 = at(i - 1)
    const p1 = at(i)
    const p2 = at(i + 1)
    const p3 = at(i + 2)
    const t = tension / 6
    p.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) * t,
      p1[1] + (p2[1] - p0[1]) * t,
      p2[0] - (p3[0] - p1[0]) * t,
      p2[1] - (p3[1] - p1[1]) * t,
      p2[0],
      p2[1],
    )
  }
  return p
}

/** A tapered capsule between two points — the basis of every limb. */
export function limbPath(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r0: number,
  r1: number,
): Path2D {
  const dx = x1 - x0
  const dy = y1 - y0
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const p = new Path2D()
  const a0 = Math.atan2(ny, nx)
  p.moveTo(x0 + nx * r0, y0 + ny * r0)
  p.lineTo(x1 + nx * r1, y1 + ny * r1)
  p.arc(x1, y1, r1, a0, a0 + Math.PI, false)
  p.lineTo(x0 - nx * r0, y0 - ny * r0)
  p.arc(x0, y0, r0, a0 + Math.PI, a0 + Math.PI * 2, false)
  p.closePath()
  return p
}

export function ellipsePath(cx: number, cy: number, rx: number, ry: number, rot = 0): Path2D {
  const p = new Path2D()
  p.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, Math.PI * 2)
  return p
}

export function roundRectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): Path2D {
  const p = new Path2D()
  const rr = Math.min(r, w / 2, h / 2)
  p.moveTo(x + rr, y)
  p.arcTo(x + w, y, x + w, y + h, rr)
  p.arcTo(x + w, y + h, x, y + h, rr)
  p.arcTo(x, y + h, x, y, rr)
  p.arcTo(x, y, x + w, y, rr)
  p.closePath()
  return p
}

/** A crescent — sword arcs, moons, cheek shadows. */
export function crescentPath(
  cx: number,
  cy: number,
  r: number,
  thickness: number,
  from: number,
  to: number,
): Path2D {
  const p = new Path2D()
  p.arc(cx, cy, r, from, to)
  p.arc(cx, cy, Math.max(0.01, r - thickness), to, from, true)
  p.closePath()
  return p
}

// ─────────────────────────────────────────────────────────────────────────────
// The cel pass
// ─────────────────────────────────────────────────────────────────────────────

export interface CelOptions {
  /** Fraction of the form that falls into shadow, 0 = fully lit, 1 = fully dark. */
  shadow?: number
  /**
   * Half-extent of the shape along the light axis, in world units. The
   * terminator is placed relative to this, so a forearm and a torso get
   * proportionally the same split rather than the same absolute one.
   */
  radius?: number
  /** Centre the terminator is measured from. Defaults to the origin. */
  pivot?: Pt
  /** Rim light width in world units. 0 disables it. */
  rim?: number
  rimColor?: string
  /** Ink line width in world units. 0 disables it. */
  line?: number
  lineColor?: string
  /** Angle of the light, overriding the scene key light. */
  light?: Light
  /** Strength 0..1 of a deeper occlusion band hugging the shadow edge. */
  occlusion?: number
}

/**
 * Paint one shape in the house style.
 *
 * The terminator is produced by clipping to the shape and filling a half-plane
 * rotated to face away from the light. The hard edge is the whole point: a
 * gradient here turns cel shading into airbrush, which is the most common way
 * this style is got wrong.
 */
export function paint(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  colors: Cel | string,
  opts: CelOptions = {},
): void {
  const c = typeof colors === 'string' ? cel(colors) : colors
  const light = opts.light ?? KEY_LIGHT
  const shadow = opts.shadow ?? 0.42
  const radius = opts.radius ?? 8
  const [px, py] = opts.pivot ?? [0, 0]

  ctx.save()
  ctx.fillStyle = c.core
  ctx.fill(path)

  if (shadow > 0.001) {
    ctx.save()
    ctx.clip(path)
    // Rotate so "away from the light" becomes +x, then fill everything past
    // the terminator offset. offset = +radius means nothing is in shadow,
    // -radius means all of it is.
    const away = Math.atan2(-light.y, -light.x)
    const offset = radius * (1 - 2 * shadow)
    const R = radius * 40 + 200
    ctx.translate(px, py)
    ctx.rotate(away)
    ctx.fillStyle = c.shade
    ctx.fillRect(offset, -R, R, R * 2)
    if (opts.occlusion) {
      ctx.globalAlpha = opts.occlusion
      ctx.fillStyle = c.deep
      ctx.fillRect(offset + radius * 0.85, -R, R, R * 2)
      ctx.globalAlpha = 1
    }
    ctx.restore()
  }

  if (opts.rim) {
    ctx.save()
    ctx.clip(path)
    ctx.strokeStyle = opts.rimColor ?? c.light
    ctx.lineWidth = opts.rim * 2
    // Offsetting the stroke toward the light leaves a band only on the lit edge.
    ctx.translate(light.x * opts.rim * 0.9, light.y * opts.rim * 0.9)
    ctx.stroke(path)
    ctx.restore()
  }

  if (opts.line !== 0) {
    ctx.strokeStyle = opts.lineColor ?? c.line
    ctx.lineWidth = opts.line ?? 0.7
    ctx.stroke(path)
  }
  ctx.restore()
}

/** Fill a shape with a linear gradient — skies, metal, water. */
export function gradientFill(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  stops: Array<[number, string]>,
): void {
  const g = ctx.createLinearGradient(x0, y0, x1, y1)
  for (const [t, c] of stops) g.addColorStop(t, c)
  ctx.save()
  ctx.fillStyle = g
  ctx.fill(path)
  ctx.restore()
}

/** Fill a shape with a radial gradient — glows, bloom cores, soft light. */
export function radialFill(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  stops: Array<[number, string]>,
): void {
  const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1)
  for (const [t, c] of stops) g.addColorStop(t, c)
  ctx.save()
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cx, cy, r1, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** A soft contact shadow ellipse — grounds anything standing on a surface. */
export function contactShadow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  strength = 0.4,
): void {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry))
  g.addColorStop(0, rgba('#0A1024', strength))
  g.addColorStop(0.6, rgba('#0A1024', strength * 0.55))
  g.addColorStop(1, rgba('#0A1024', 0))
  ctx.save()
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** A flat specular highlight — the glint on metal, eyes and polished wood. */
export function glint(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rot = -0.6,
  color = '#FFFFFF',
  alpha = 0.9,
): void {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/**
 * Ink a line with a brush-like taper: several passes of decreasing width along
 * the curve so the stroke thins at its ends the way a real nib does.
 */
export function inkStroke(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  width: number,
  color: string,
  taper = 0.55,
): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  ctx.globalAlpha = 1
  ctx.lineWidth = width
  ctx.stroke(path)
  ctx.globalAlpha = taper
  ctx.lineWidth = width * 0.5
  ctx.stroke(path)
  ctx.restore()
}

/** Draw `fn` clipped to `path`, for details that must stay inside a silhouette. */
export function inside(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  fn: (ctx: CanvasRenderingContext2D) => void,
): void {
  ctx.save()
  ctx.clip(path)
  fn(ctx)
  ctx.restore()
}

/** Stack several paths into one, so a whole character can be inked as a unit. */
export function union(...paths: Path2D[]): Path2D {
  const p = new Path2D()
  for (const q of paths) p.addPath(q)
  return p
}

// ─────────────────────────────────────────────────────────────────────────────
// Surface post passes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Draw a silhouette outline around everything already on the surface, by
 * stamping the existing alpha outward in a ring and compositing it behind.
 * Used for the outer contour of a whole character, which reads better as one
 * unbroken line than as per-part strokes.
 */
export function silhouetteOutline(surface: Surface, color: string, width = 1.2): void {
  const { canvas, scale } = surface
  const w = canvas.width
  const h = canvas.height
  const ring = document.createElement('canvas')
  ring.width = w
  ring.height = h
  const rctx = ring.getContext('2d')!
  const r = width * scale
  const steps = 12
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2
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

/** Tint everything drawn so far — hit flashes, night grading, palette swaps. */
export function overlayTint(surface: Surface, color: string, alpha: number): void {
  const ctx = surface.ctx
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'source-atop'
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.fillRect(0, 0, surface.canvas.width, surface.canvas.height)
  ctx.restore()
}

/** A solid-colour copy of a surface, for flash frames and drop shadows. */
export function silhouetteOf(surface: Surface, color = '#FFFFFF'): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = surface.canvas.width
  out.height = surface.canvas.height
  const ctx = out.getContext('2d')!
  ctx.drawImage(surface.canvas, 0, 0)
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = color
  ctx.fillRect(0, 0, out.width, out.height)
  return out
}
