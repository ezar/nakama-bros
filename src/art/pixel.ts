/**
 * Pixel-art drawing toolkit.
 *
 * Every sprite, tile and background in the game is generated at boot by code in
 * `src/art/` using these helpers — there are no bitmap assets to ship, and a
 * palette change re-renders the whole game. Helpers here operate on plain 2D
 * contexts and are deliberately allocation-light: they run a few hundred times
 * during the load screen and never again.
 */

export interface Surface {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  w: number
  h: number
}

export function createSurface(w: number, h: number): Surface {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(w))
  canvas.height = Math.max(1, Math.ceil(h))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingEnabled = false
  return { canvas, ctx, w: canvas.width, h: canvas.height }
}

// ─────────────────────────────────────────────────────────────────────────────
// Colour
// ─────────────────────────────────────────────────────────────────────────────

export interface Rgb {
  r: number
  g: number
  b: number
}

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '')
  const v =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
  const n = parseInt(v, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

export function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a)
  const B = hexToRgb(b)
  return rgbToHex({
    r: A.r + (B.r - A.r) * t,
    g: A.g + (B.g - A.g) * t,
    b: A.b + (B.b - A.b) * t,
  })
}

export function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r},${g},${b},${alpha})`
}

/** Multiply lightness while nudging hue — warmer highlights, cooler shadows. */
export function shade(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex)
  if (amount >= 0) {
    // Highlights drift toward warm cream rather than pure white.
    return mix(rgbToHex({ r, g, b }), '#FFF3D6', amount)
  }
  // Shadows drift toward the scene's deep navy rather than pure black.
  return mix(rgbToHex({ r, g, b }), '#131A2E', -amount)
}

/**
 * A five-step ramp built from one base colour: two shadow steps, the base, and
 * two highlight steps. Sprite code indexes the ramp instead of naming colours,
 * which keeps every character consistently lit.
 */
export interface Ramp {
  darkest: string
  dark: string
  base: string
  light: string
  lightest: string
  at(t: number): string
}

export function ramp(base: string, contrast = 1): Ramp {
  const darkest = shade(base, -0.55 * contrast)
  const dark = shade(base, -0.28 * contrast)
  const light = shade(base, 0.26 * contrast)
  const lightest = shade(base, 0.52 * contrast)
  const steps = [darkest, dark, base, light, lightest]
  return {
    darkest,
    dark,
    base,
    light,
    lightest,
    at(t: number) {
      const i = Math.max(0, Math.min(4, Math.round(t * 4)))
      return steps[i]
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────────────────────

/** Fill an axis-aligned pixel rect. Coordinates are snapped. */
export function px(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)))
}

/** Bresenham line in whole pixels — no anti-aliasing. */
export function line(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
): void {
  let x = Math.round(x0)
  let y = Math.round(y0)
  const ex = Math.round(x1)
  const ey = Math.round(y1)
  const dx = Math.abs(ex - x)
  const dy = -Math.abs(ey - y)
  const sx = x < ex ? 1 : -1
  const sy = y < ey ? 1 : -1
  let err = dx + dy
  ctx.fillStyle = color
  for (;;) {
    ctx.fillRect(x, y, 1, 1)
    if (x === ex && y === ey) break
    const e2 = err * 2
    if (e2 >= dy) {
      err += dy
      x += sx
    }
    if (e2 <= dx) {
      err += dx
      y += sy
    }
  }
}

/** Filled ellipse rasterised on the pixel grid. */
export function ellipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
): void {
  ctx.fillStyle = color
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    const dy = (y + 0.5 - cy) / ry
    const s = 1 - dy * dy
    if (s <= 0) continue
    const half = Math.sqrt(s) * rx
    const x0 = Math.round(cx - half)
    const x1 = Math.round(cx + half)
    ctx.fillRect(x0, y, Math.max(1, x1 - x0), 1)
  }
}

/** Filled circle. */
export const circle = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
) => ellipse(ctx, cx, cy, r, r, color)

/** Rounded rect with hard pixel corners (corner pixels simply omitted). */
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string,
): void {
  px(ctx, x + r, y, w - r * 2, h, color)
  px(ctx, x, y + r, w, h - r * 2, color)
  for (const [cx, cy, sx, sy] of [
    [x + r, y + r, -1, -1],
    [x + w - r - 1, y + r, 1, -1],
    [x + r, y + h - r - 1, -1, 1],
    [x + w - r - 1, y + h - r - 1, 1, 1],
  ]) {
    for (let i = 0; i <= r; i++) {
      for (let j = 0; j <= r; j++) {
        if (i * i + j * j <= r * r) px(ctx, cx + sx * i, cy + sy * j, 1, 1, color)
      }
    }
  }
}

/** Vertical gradient, quantised into `steps` bands for a painterly pixel look. */
export function vGradient(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  top: string,
  bottom: string,
  steps = 0,
): void {
  if (steps <= 0) {
    const g = ctx.createLinearGradient(0, y, 0, y + h)
    g.addColorStop(0, top)
    g.addColorStop(1, bottom)
    ctx.fillStyle = g
    ctx.fillRect(x, y, w, h)
    return
  }
  const band = h / steps
  for (let i = 0; i < steps; i++) {
    px(ctx, x, y + i * band, w, Math.ceil(band) + 1, mix(top, bottom, i / (steps - 1)))
  }
}

/** Horizontal gradient. */
export function hGradient(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  left: string,
  right: string,
): void {
  const g = ctx.createLinearGradient(x, 0, x + w, 0)
  g.addColorStop(0, left)
  g.addColorStop(1, right)
  ctx.fillStyle = g
  ctx.fillRect(x, y, w, h)
}

/**
 * Ordered (Bayer 4x4) dither between two colours. This is what keeps large
 * gradients — skies, water, fog — reading as pixel art instead of a blur.
 */
const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
]

export function dither(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  colorA: string,
  colorB: string,
  ratio: number,
): void {
  const threshold = ratio * 16
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const v = BAYER4[j & 3][i & 3]
      px(ctx, x + i, y + j, 1, 1, v < threshold ? colorB : colorA)
    }
  }
}

/** Dithered vertical gradient — a smooth ramp with no banding artefacts. */
export function ditherVGradient(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  top: string,
  bottom: string,
  bands = 10,
): void {
  const band = h / bands
  for (let i = 0; i < bands; i++) {
    const t0 = i / bands
    const t1 = (i + 1) / bands
    const c0 = mix(top, bottom, t0)
    const c1 = mix(top, bottom, t1)
    const by = Math.floor(y + i * band)
    const bh = Math.ceil(band)
    px(ctx, x, by, w, bh, c0)
    // Blend the lower half of each band into the next one.
    dither(ctx, x, by + Math.floor(bh / 2), w, Math.ceil(bh / 2), c0, c1, 0.5)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Post-processing on a surface
// ─────────────────────────────────────────────────────────────────────────────

/** Add a 1px outline around every opaque pixel. The pixel-art staple. */
export function outline(surface: Surface, color = '#0B1020', diagonal = false): void {
  const { ctx, w, h } = surface
  const src = ctx.getImageData(0, 0, w, h)
  const out = ctx.createImageData(w, h)
  out.data.set(src.data)
  const { r, g, b } = hexToRgb(color)
  const alphaAt = (x: number, y: number) =>
    x < 0 || y < 0 || x >= w || y >= h ? 0 : src.data[(y * w + x) * 4 + 3]

  const neighbours = diagonal
    ? [
        [-1, 0], [1, 0], [0, -1], [0, 1],
        [-1, -1], [1, -1], [-1, 1], [1, 1],
      ]
    : [
        [-1, 0], [1, 0], [0, -1], [0, 1],
      ]

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (src.data[i + 3] > 8) continue
      let touching = false
      for (const [dx, dy] of neighbours) {
        if (alphaAt(x + dx, y + dy) > 128) {
          touching = true
          break
        }
      }
      if (!touching) continue
      out.data[i] = r
      out.data[i + 1] = g
      out.data[i + 2] = b
      out.data[i + 3] = 255
    }
  }
  ctx.putImageData(out, 0, 0)
}

/**
 * Rim light: brighten the pixels on the lit edge of the silhouette. This single
 * pass is most of what separates flat sprite work from something that reads as
 * lit and three-dimensional.
 */
export function rimLight(surface: Surface, color: string, dirX = -1, dirY = -1, strength = 0.75): void {
  const { ctx, w, h } = surface
  const src = ctx.getImageData(0, 0, w, h)
  const out = ctx.createImageData(w, h)
  out.data.set(src.data)
  const { r, g, b } = hexToRgb(color)
  const alphaAt = (x: number, y: number) =>
    x < 0 || y < 0 || x >= w || y >= h ? 0 : src.data[(y * w + x) * 4 + 3]

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (src.data[i + 3] < 128) continue
      // A pixel is on the rim when the neighbour toward the light is empty.
      if (alphaAt(x + dirX, y) > 128 && alphaAt(x, y + dirY) > 128) continue
      out.data[i] = src.data[i] + (r - src.data[i]) * strength
      out.data[i + 1] = src.data[i + 1] + (g - src.data[i + 1]) * strength
      out.data[i + 2] = src.data[i + 2] + (b - src.data[i + 2]) * strength
    }
  }
  ctx.putImageData(out, 0, 0)
}

/** Drop a soft contact shadow beneath the silhouette, inside the surface. */
export function innerShadow(surface: Surface, color: string, strength = 0.35, depth = 3): void {
  const { ctx, w, h } = surface
  const src = ctx.getImageData(0, 0, w, h)
  const out = ctx.createImageData(w, h)
  out.data.set(src.data)
  const { r, g, b } = hexToRgb(color)
  const alphaAt = (x: number, y: number) =>
    x < 0 || y < 0 || x >= w || y >= h ? 0 : src.data[(y * w + x) * 4 + 3]

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (src.data[i + 3] < 128) continue
      let d = 0
      for (let k = 1; k <= depth; k++) {
        if (alphaAt(x, y + k) < 128) {
          d = 1 - (k - 1) / depth
          break
        }
      }
      if (d === 0) continue
      const s = d * strength
      out.data[i] = src.data[i] + (r - src.data[i]) * s
      out.data[i + 1] = src.data[i + 1] + (g - src.data[i + 1]) * s
      out.data[i + 2] = src.data[i + 2] + (b - src.data[i + 2]) * s
    }
  }
  ctx.putImageData(out, 0, 0)
}

/** Deterministic per-pixel value noise, for cloth, rock and wood grain. */
export function grain(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  amount: number,
  seed = 1,
): void {
  let s = seed >>> 0
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
  ctx.save()
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const v = rand()
      if (v > amount) continue
      ctx.globalAlpha = 0.1 + v * 0.35
      px(ctx, x + i, y + j, 1, 1, color)
    }
  }
  ctx.restore()
}

/** Flip a surface horizontally into a new surface. */
export function flipH(surface: Surface): Surface {
  const out = createSurface(surface.w, surface.h)
  out.ctx.translate(surface.w, 0)
  out.ctx.scale(-1, 1)
  out.ctx.drawImage(surface.canvas, 0, 0)
  return out
}

/** Recolour every non-transparent pixel, preserving luminance. Palette swaps. */
export function tint(surface: Surface, color: string, strength = 1): void {
  const { ctx, w, h } = surface
  ctx.save()
  ctx.globalCompositeOperation = 'source-atop'
  ctx.globalAlpha = strength
  ctx.fillStyle = color
  ctx.fillRect(0, 0, w, h)
  ctx.restore()
}

/** A solid-white copy of a surface, for hit flashes. */
export function silhouette(surface: Surface, color = '#ffffff'): Surface {
  const out = createSurface(surface.w, surface.h)
  out.ctx.drawImage(surface.canvas, 0, 0)
  out.ctx.globalCompositeOperation = 'source-atop'
  out.ctx.fillStyle = color
  out.ctx.fillRect(0, 0, surface.w, surface.h)
  return out
}
