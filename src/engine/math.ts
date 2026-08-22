import type { Rect, Vec2 } from '../types'

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
export const clamp01 = (v: number) => clamp(v, 0, 1)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const invLerp = (a: number, b: number, v: number) => (b === a ? 0 : (v - a) / (b - a))
export const sign = (v: number): -1 | 0 | 1 => (v > 0 ? 1 : v < 0 ? -1 : 0)

/** Frame-rate independent exponential smoothing. `half` is the half-life in seconds. */
export const damp = (a: number, b: number, half: number, dt: number) =>
  b + (a - b) * Math.pow(2, -dt / Math.max(half, 1e-6))

/** Move `a` toward `b` by at most `maxDelta`. */
export const approach = (a: number, b: number, maxDelta: number) =>
  a < b ? Math.min(a + maxDelta, b) : Math.max(a - maxDelta, b)

export const smoothstep = (t: number) => {
  const x = clamp01(t)
  return x * x * (3 - 2 * x)
}

export const smootherstep = (t: number) => {
  const x = clamp01(t)
  return x * x * x * (x * (x * 6 - 15) + 10)
}

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3)
export const easeInCubic = (t: number) => Math.pow(clamp01(t), 3)
export const easeOutBack = (t: number) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  const x = clamp01(t)
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}
export const easeOutElastic = (t: number) => {
  const x = clamp01(t)
  if (x === 0 || x === 1) return x
  const c4 = (2 * Math.PI) / 3
  return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1
}

/** Triangle wave in 0..1 with the given period, useful for idle bobbing. */
export const pingPong = (t: number, period: number) => {
  const p = ((t % period) + period) % period
  const h = period / 2
  return p < h ? p / h : 2 - p / h
}

export const rectsOverlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

export const pointInRect = (p: Vec2, r: Rect) =>
  p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h

export const dist2 = (ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax
  const dy = by - ay
  return dx * dx + dy * dy
}

export const dist = (ax: number, ay: number, bx: number, by: number) =>
  Math.sqrt(dist2(ax, ay, bx, by))

/** Wrap an angle into (-PI, PI]. */
export const wrapAngle = (a: number) => {
  let x = (a + Math.PI) % (Math.PI * 2)
  if (x < 0) x += Math.PI * 2
  return x - Math.PI
}

/** Classic 1D value noise — cheap, smooth, deterministic. Good for wind and sway. */
export function noise1(x: number): number {
  const i = Math.floor(x)
  const f = x - i
  const a = hash1(i)
  const b = hash1(i + 1)
  return lerp(a, b, smoothstep(f)) * 2 - 1
}

/** Layered value noise. */
export function fbm1(x: number, octaves = 3): number {
  let sum = 0
  let amp = 0.5
  let freq = 1
  for (let i = 0; i < octaves; i++) {
    sum += noise1(x * freq) * amp
    freq *= 2
    amp *= 0.5
  }
  return sum
}

export function hash1(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

export function hash2(x: number, y: number): number {
  return hash1(Math.imul(x, 73856093) ^ Math.imul(y, 19349663))
}

/** 2D value noise on an integer lattice. */
export function noise2(x: number, y: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = smoothstep(x - xi)
  const yf = smoothstep(y - yi)
  const a = hash2(xi, yi)
  const b = hash2(xi + 1, yi)
  const c = hash2(xi, yi + 1)
  const d = hash2(xi + 1, yi + 1)
  return lerp(lerp(a, b, xf), lerp(c, d, xf), yf)
}
