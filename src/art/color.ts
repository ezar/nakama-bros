/**
 * Colour maths shared by every painter.
 *
 * Cel shading lives or dies on its ramps: a hue that only darkens looks like
 * dirt, so shadows here rotate toward the scene's cool ambient and highlights
 * toward warm light, exactly the way a background painter would mix them.
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

export interface Hsl {
  h: number
  s: number
  l: number
}

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '')
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(v, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
  else if (max === gn) h = ((bn - rn) / d + 2) / 6
  else h = ((rn - gn) / d + 4) / 6
  return { h: h * 360, s, l }
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const hn = (((h % 360) + 360) % 360) / 360
  if (s === 0) {
    const v = l * 255
    return { r: v, g: v, b: v }
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const f = (t: number) => {
    let tn = t
    if (tn < 0) tn += 1
    if (tn > 1) tn -= 1
    if (tn < 1 / 6) return p + (q - p) * 6 * tn
    if (tn < 1 / 2) return q
    if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6
    return p
  }
  return { r: f(hn + 1 / 3) * 255, g: f(hn) * 255, b: f(hn - 1 / 3) * 255 }
}

export const hsl = (h: number, s: number, l: number): string =>
  rgbToHex(hslToRgb({ h, s, l }))

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

/** Rotate hue, scale saturation and lightness in one call. */
export function adjust(
  hex: string,
  opts: { hue?: number; sat?: number; light?: number } = {},
): string {
  const c = rgbToHsl(hexToRgb(hex))
  return rgbToHex(
    hslToRgb({
      h: c.h + (opts.hue ?? 0),
      s: Math.max(0, Math.min(1, c.s * (opts.sat ?? 1))),
      l: Math.max(0, Math.min(1, c.l * (opts.light ?? 1))),
    }),
  )
}

/**
 * A cel ramp: three values with a hard terminator between them.
 *
 * `core` is the lit value, `shade` the single flat shadow, `deep` the occluded
 * pocket used sparingly under overhangs. Shadows rotate toward blue and lose
 * saturation the way real subsurface shadow does; the highlight warms up.
 */
export interface Cel {
  light: string
  core: string
  shade: string
  deep: string
  line: string
}

export function cel(base: string, opts: { lineDarkness?: number; warmth?: number } = {}): Cel {
  const warmth = opts.warmth ?? 1
  const c = rgbToHsl(hexToRgb(base))
  const shade = rgbToHex(
    hslToRgb({ h: c.h - 12 * warmth, s: Math.min(1, c.s * 1.06), l: Math.max(0.04, c.l * 0.68) }),
  )
  const deep = rgbToHex(
    hslToRgb({ h: c.h - 20 * warmth, s: Math.min(1, c.s * 1.12), l: Math.max(0.03, c.l * 0.46) }),
  )
  const light = rgbToHex(
    hslToRgb({ h: c.h + 8 * warmth, s: Math.max(0, c.s * 0.86), l: Math.min(0.98, c.l * 1.18 + 0.06) }),
  )
  // The ink line is the base hue pushed very dark but never neutral black —
  // a coloured line is what separates modern cel work from clip art.
  const line = rgbToHex(
    hslToRgb({
      h: c.h - 14,
      s: Math.min(1, c.s * 1.15 + 0.08),
      l: Math.max(0.06, c.l * (opts.lineDarkness ?? 0.3)),
    }),
  )
  return { light, core: base, shade, deep, line }
}
