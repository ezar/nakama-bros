import { GAME_H, GAME_W } from '../types'
import type { Biome } from '../types'
import { adjust, cel, mix, rgba, type Cel } from './color'
import { PAL, biomePalette, type BiomePalette } from './palette'
import {
  blob,
  createSurface,
  curve,
  ellipsePath,
  glint,
  paint,
  radialFill,
  roundRectPath,
  type CelOptions,
  type Light,
  type Pt,
  type Surface,
} from './ink'
import { Rng, seedFrom } from '../engine/rng'

/**
 * One layer of the parallax stack. Layers are drawn back to front; `factor` is
 * the fraction of camera movement the layer follows (0 = painted on the sky,
 * 1 = locked to the world).
 */
export interface ParallaxLayer {
  image: CanvasImageSource
  /** Size in world units. */
  width: number
  height: number
  factor: number
  factorY?: number
  yOffset: number
  repeat: boolean
  /** Constant drift in world units per second — clouds and fog. */
  autoScroll?: number
  alpha?: number
  blend?: GlobalCompositeOperation
  bob?: number
  bobSpeed?: number
}

/**
 * Backdrops.
 *
 * Every biome is an island on the Grand Line and has to read as *that* island
 * within one screen: the subject matter carries the identity, the layering
 * carries the depth. Three rules run through all of it.
 *
 * SEAMLESS. Any repeating strip is built from sine harmonics whose periods
 * divide the strip width, and every scattered motif is stamped again a strip
 * width away when it lands near an edge (`stamp`), so a shape that overhangs
 * the right edge reappears at the left. There is no straight cut anywhere.
 *
 * ONE LIGHT. Landforms are faceted by the sign of their own slope, so a hill
 * takes the light tone where it turns into the sun and the shadow tone where it
 * turns away, with the boundary falling on the crest — which is where a
 * background painter would put it. Props go through `paint()` and get the same
 * flat / hard terminator / rim / ink sequence as the characters.
 *
 * DEPTH BY ATMOSPHERE. `haze()` washes a colour toward the sky and drains its
 * saturation, `flatten()` closes the ramp so far layers lose contrast, and the
 * ink line thins to nothing with distance. One number per layer drives all
 * three, which is what makes seven layers read as seven distances.
 */

const TAU = Math.PI * 2

/** Atmospheric perspective: wash toward the sky, drop saturation. */
const haze = (color: string, fog: string, depth: number): string =>
  adjust(mix(color, fog, depth * 0.72), { sat: 1 - depth * 0.42 })

/** Close a ramp toward its own core — distance kills contrast before it kills hue. */
const flatten = (c: Cel, t: number): Cel => ({
  light: mix(c.light, c.core, t),
  core: c.core,
  shade: mix(c.shade, c.core, t),
  deep: mix(c.deep, c.core, t),
  line: mix(c.line, c.core, t * 0.85),
})

const layerSurface = (w: number, h: number) => createSurface(w, h)

interface LayerSpec {
  factor: number
  factorY?: number
  y: number
  repeat?: boolean
  autoScroll?: number
  alpha?: number
  blend?: GlobalCompositeOperation
  bob?: number
  bobSpeed?: number
}

const layerOf = (s: Surface, o: LayerSpec): ParallaxLayer => ({
  image: s.canvas,
  width: s.w,
  height: s.h,
  factor: o.factor,
  factorY: o.factorY ?? o.factor * 0.28,
  yOffset: o.y,
  repeat: o.repeat ?? true,
  autoScroll: o.autoScroll,
  alpha: o.alpha,
  blend: o.blend,
  bob: o.bob,
  bobSpeed: o.bobSpeed,
})

// ─────────────────────────────────────────────────────────────────────────────
// Seamless primitives
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A band-limited periodic signal on t ∈ [0,1). Every term is an integer number
 * of cycles across the strip, so the value and the slope match at the seam.
 */
function wave(rng: Rng, ks: number[]): (t: number) => number {
  const terms = ks.map((k) => ({
    k,
    a: rng.range(0.55, 1) / Math.sqrt(k),
    ph: rng.range(0, TAU),
  }))
  const norm = terms.reduce((sum, t) => sum + Math.abs(t.a), 0) || 1
  return (t) => {
    let v = 0
    for (const term of terms) v += Math.sin(t * TAU * term.k + term.ph) * term.a
    return v / norm
  }
}

/**
 * Draw a motif at x, and again one strip away when it is close enough to an
 * edge to overhang it. This is what lets a lighthouse or a tree sit anywhere on
 * a repeating strip without being sliced by the wrap.
 */
function stamp(w: number, x: number, reach: number, fn: (x: number) => void): void {
  fn(x)
  if (x < reach) fn(x + w)
  if (x > w - reach) fn(x - w)
}

/**
 * Stamp a motif that draws with random numbers. Each copy runs from the same
 * seed, so the piece that overhangs the right edge is the same piece that
 * comes back in at the left — otherwise the strip does not join up.
 */
function stampRng(k: Kit, w: number, x: number, reach: number, fn: (x: number) => void): void {
  const outer = k.rng
  const seed = (outer.next() * 0xffffffff) >>> 0
  stamp(w, x, reach, (sx) => {
    k.rng = new Rng(seed)
    fn(sx)
  })
  k.rng = outer
}

/** Evenly spaced slots with enough jitter that nothing reads as a comb. */
function spread(rng: Rng, w: number, n: number, jitter = 0.42): number[] {
  const step = w / n
  const xs: number[] = []
  for (let i = 0; i < n; i++) xs.push((i + 0.5 + rng.range(-jitter, jitter)) * step)
  return xs
}

// ─────────────────────────────────────────────────────────────────────────────
// Painter kit
// ─────────────────────────────────────────────────────────────────────────────

type Fill = (path: Path2D, c: Cel | string, pivot: Pt, radius: number, o?: CelOptions) => void

interface Kit {
  ctx: CanvasRenderingContext2D
  s: Surface
  p: BiomePalette
  rng: Rng
  /** 0 = at the player's plane, 1 = on the horizon. */
  depth: number
  key: Light
  /**
   * A near-horizontal version of the key light, for flat vertical faces. A wall
   * is lit on the side the sun is on and dark on the other, with the split on
   * the corner; running the scene's raked key light across a rectangle instead
   * cuts a diagonal through it and the building reads as folded paper.
   */
  side: Light
  sun: string
  /** A hazed, contrast-drained cel ramp for a local colour at this depth. */
  ramp: (base: string) => Cel
  /** Paint a path in the house style, lit by this biome's sun. */
  fill: Fill
}

function kit(s: Surface, p: BiomePalette, rng: Rng, depth: number): Kit {
  const ctx = s.ctx
  const key: Light = { x: p.lightDirX, y: p.lightDirY }
  const ramp = (base: string) => flatten(cel(haze(base, p.fog, depth)), depth * 0.55)
  const line = Math.max(0, 0.62 * (1 - depth * 1.5))
  const fill: Fill = (path, c, pivot, radius, o = {}) => {
    const ce = typeof c === 'string' ? ramp(c) : c
    paint(ctx, path, ce, {
      light: key,
      pivot,
      radius,
      shadow: 0.46,
      line,
      lineColor: mix(ce.line, p.fog, depth * 0.7),
      ...o,
    })
  }
  const side: Light = { x: p.lightDirX < 0 ? -1 : 1, y: -0.2 }
  return { ctx, s, p, rng, depth, key, side, sun: p.sunTint, ramp, fill }
}

// ─────────────────────────────────────────────────────────────────────────────
// Landform
// ─────────────────────────────────────────────────────────────────────────────

interface TerrainOpts {
  /** Mean height of the crest, in layer-local units. */
  baseY: number
  amp: number
  bottom: number
  /** Harmonic numbers. Low ones give the big masses, high ones the detail. */
  ks?: number[]
  base: string
  /** Override the harmonic profile — pointed peaks, terraces, anything periodic. */
  profile?: (t: number) => number
  /** 0 disables the sunlit crest lip. */
  lip?: number
  /** Strength of the darkening at the foot of the band. */
  foot?: number
}

/**
 * A landform band: one silhouette, faceted by its own slope so it has form
 * instead of being a wash, with a lit lip on the crests that face the sun.
 * Returns the surface height at any x, so props can stand on it.
 */
function terrainBand(k: Kit, o: TerrainOpts): (x: number) => number {
  const { ctx, p } = k
  const w = Math.round(k.s.w)
  const prof = o.profile ?? wave(k.rng, o.ks ?? [1, 2, 3, 5, 8])
  const ys: number[] = new Array(w + 1)
  for (let x = 0; x <= w; x++) ys[x] = o.baseY - prof(x / w) * o.amp
  const at = (x: number) => ys[((Math.round(x) % w) + w) % w]

  const c = k.ramp(o.base)
  const runPath = (a: number, b: number): Path2D => {
    const path = new Path2D()
    path.moveTo(a, ys[a])
    for (let x = a + 1; x <= b; x++) path.lineTo(x, ys[x])
    path.lineTo(b, o.bottom)
    path.lineTo(a, o.bottom)
    path.closePath()
    return path
  }
  const body = runPath(0, w)
  ctx.fillStyle = c.core
  ctx.fill(body)

  // Form. The band is filled in shadow, then the same silhouette is dropped
  // back in toward the light: where the two copies part company you get a hard
  // terminator that follows every crest and hollow of the profile, with the
  // shadow widening exactly where the ground turns away from the sun. Cutting
  // the band into slope-signed columns instead gives you rectangles.
  const lightLeft = p.lightDirX < 0
  const slopeAt = (x: number) => at(x + 7) - at(x - 7)
  // The throw is almost entirely horizontal: ground is a near-horizontal
  // surface, so it is the sideways component of the light that decides which
  // face is lit. A vertical throw just lifts the whole band and leaves no
  // shadow at all on anything short of a cliff.
  const hx = lightLeft ? -1 : 1
  const throwD = 16 + o.amp * 0.7
  // Each shifted copy is stamped a strip width either side as well: shifting a
  // single copy leaves the trailing edge of the strip unpainted, and that band
  // of raw shadow tone is a seam you can see from across the room.
  const fillWrapped = (color: string) => {
    ctx.fillStyle = color
    ctx.fill(body)
    ctx.save()
    ctx.translate(-w, 0)
    ctx.fill(body)
    ctx.translate(2 * w, 0)
    ctx.fill(body)
    ctx.restore()
  }
  ctx.save()
  fillWrapped(c.deep)
  ctx.clip(body)
  ctx.translate(hx * throwD * 0.38, p.lightDirY * 1.2)
  fillWrapped(c.shade)
  ctx.translate(hx * throwD * 0.62, p.lightDirY * 1.6)
  fillWrapped(c.core)
  ctx.restore()

  // Everything more than a crust below the surface goes back to the flat tone:
  // a long shadow that runs all the way to the foot of the band turns into a
  // dark rectangle wherever the slope is steep.
  const crustD = 14 + o.amp * 1.1
  const under = new Path2D()
  under.moveTo(0, ys[0] + crustD)
  for (let x = 1; x <= w; x++) under.lineTo(x, ys[x] + crustD)
  under.lineTo(w, o.bottom)
  under.lineTo(0, o.bottom)
  under.closePath()
  ctx.save()
  ctx.clip(body)
  ctx.fillStyle = c.core
  ctx.fill(under)
  ctx.restore()

  // Runs of crest that face the sun, for the lit lip.
  const lit: Array<[number, number]> = []
  let start = 0
  let facing = lightLeft ? slopeAt(0) < 0 : slopeAt(0) > 0
  for (let x = 1; x <= w; x++) {
    const f = x === w ? !facing : lightLeft ? slopeAt(x) < 0 : slopeAt(x) > 0
    if (f === facing) continue
    if (facing && x - start > 5) lit.push([start, x])
    start = x
    facing = f
  }

  if (o.lip !== 0) {
    ctx.save()
    ctx.strokeStyle = mix(c.light, p.sunTint, 0.5 - k.depth * 0.25)
    ctx.lineWidth = o.lip ?? 0.9
    for (const [a, b] of lit) {
      const path = new Path2D()
      path.moveTo(a, ys[a])
      for (let x = a + 1; x <= b; x++) path.lineTo(x, ys[x])
      ctx.stroke(path)
    }
    ctx.restore()
  }

  // The foot of a band sits in its own shadow and in the haze of the band in
  // front of it; without this every ridge floats.
  ctx.save()
  ctx.clip(body)
  const g = ctx.createLinearGradient(0, o.baseY + o.amp * 0.2, 0, o.bottom)
  g.addColorStop(0, rgba(c.deep, 0))
  g.addColorStop(1, rgba(c.deep, o.foot ?? 0.75))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, o.bottom)
  ctx.restore()

  return at
}

// ─────────────────────────────────────────────────────────────────────────────
// Sky, cloud, water
// ─────────────────────────────────────────────────────────────────────────────

interface SkyOpts {
  /** Radius of the visible sun disc. 0 for a sun that is only a glow. */
  disc?: number
  discColor?: string
  /** Height of the sun's centre, as a fraction of the frame. */
  sunY?: number
  glow?: number
  /** A band of warm light sitting on the horizon. */
  horizonGlow?: number
  /** Radius of the ring of scattered light around a moon. */
  halo?: number
}

function skyLayer(biome: string, p: BiomePalette, o: SkyOpts = {}): ParallaxLayer {
  const s = layerSurface(GAME_W, GAME_H)
  const ctx = s.ctx
  const g = ctx.createLinearGradient(0, 0, 0, GAME_H)
  g.addColorStop(0, p.skyTop)
  g.addColorStop(0.52, p.skyMid)
  g.addColorStop(1, p.skyLow)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, GAME_W, GAME_H)

  if (o.horizonGlow) {
    const hg = ctx.createLinearGradient(0, GAME_H * 0.42, 0, GAME_H * 0.86)
    hg.addColorStop(0, rgba(p.sunTint, 0))
    hg.addColorStop(1, rgba(p.sunTint, o.horizonGlow))
    ctx.fillStyle = hg
    ctx.fillRect(0, 0, GAME_W, GAME_H)
  }

  const sunX = p.lightDirX < 0 ? GAME_W * 0.2 : GAME_W * 0.8
  const sunY = GAME_H * (o.sunY ?? 0.24)
  const glow = o.glow ?? 96
  radialFill(ctx, sunX, sunY, 0, glow, [
    [0, rgba(p.sunTint, 0.46)],
    [0.34, rgba(p.sunTint, 0.15)],
    [1, rgba(p.sunTint, 0)],
  ])
  if (o.halo) {
    radialFill(ctx, sunX, sunY, 0, o.halo, [
      [0, rgba(p.sunTint, 0)],
      [0.34, rgba(p.sunTint, 0.05)],
      [0.6, rgba(p.sunTint, 0.13)],
      [0.8, rgba(p.sunTint, 0.16)],
      [0.93, rgba(p.sunTint, 0.06)],
      [1, rgba(p.sunTint, 0)],
    ])
  }
  if (o.disc) {
    const disc = o.discColor ?? p.sunTint
    radialFill(ctx, sunX, sunY, o.disc * 0.82, o.disc * 2.1, [
      [0, rgba(disc, 0.5)],
      [1, rgba(disc, 0)],
    ])
    ctx.fillStyle = disc
    ctx.fill(ellipsePath(sunX, sunY, o.disc, o.disc))
    ctx.fillStyle = rgba(PAL.white, 0.35)
    ctx.fill(ellipsePath(sunX - o.disc * 0.2, sunY - o.disc * 0.22, o.disc * 0.62, o.disc * 0.58))
  } else {
    radialFill(ctx, sunX, sunY, 0, 11, [
      [0, rgba(PAL.white, 0.92)],
      [1, rgba(p.sunTint, 0)],
    ])
  }
  void biome
  return layerOf(s, { factor: 0, factorY: 0, y: 0, repeat: false })
}

/** One cumulus: lobes over a flat base, split by a terminator that follows the form. */
function cloudMass(
  ctx: CanvasRenderingContext2D,
  rng: Rng,
  key: Light,
  cx: number,
  cy: number,
  w: number,
  h: number,
  c: Cel,
): void {
  const path = new Path2D()
  const lobes = 4 + Math.floor(rng.next() * 4)
  // The flat base is itself a run of lobes: a rounded rectangle under a wide,
  // shallow cloud shows through as a rectangle, which is unmistakable.
  for (let i = 0; i <= lobes; i++) {
    const t = i / lobes - 0.5
    path.addPath(ellipsePath(cx + t * w * 0.8, cy + h * 0.04, w * 0.13, h * 0.2))
  }
  for (let i = 0; i < lobes; i++) {
    const t = lobes === 1 ? 0 : i / (lobes - 1) - 0.5
    const r = (h * 0.44 * (1 - Math.abs(t) * 0.62) + h * 0.14) * rng.range(0.76, 1.18)
    const lx = cx + t * w * 0.74 + rng.range(-w * 0.04, w * 0.04)
    const ly = cy - h * 0.06 - Math.cos(t * 2.5) * h * 0.3 + rng.range(-h * 0.07, h * 0.07)
    path.addPath(ellipsePath(lx, ly, r * 1.12, r))
  }
  ctx.save()
  ctx.fillStyle = c.shade
  ctx.fill(path)
  ctx.clip(path)
  // The lit mass is the same silhouette pushed toward the light: where the two
  // copies part company you get a hard terminator that follows every lobe.
  ctx.translate(key.x * h * 0.3, key.y * h * 0.3)
  ctx.fillStyle = c.core
  ctx.fill(path)
  ctx.translate(key.x * h * 0.26, key.y * h * 0.26)
  ctx.fillStyle = c.light
  ctx.fill(path)
  ctx.restore()
}

/**
 * A fog bank. Fog is the one thing in this file allowed to be soft: it has no
 * form to shade, so it is built from many faint overlapping veils instead.
 */
function fogBank(
  ctx: CanvasRenderingContext2D,
  rng: Rng,
  cx: number,
  cy: number,
  w: number,
  h: number,
  c: Cel,
): void {
  ctx.save()
  for (let i = 0; i < 16; i++) {
    const t = rng.range(-0.5, 0.5)
    ctx.globalAlpha = rng.range(0.07, 0.2)
    ctx.fillStyle = i % 3 === 0 ? c.light : c.core
    ctx.fill(
      ellipsePath(
        cx + t * w,
        cy + rng.range(-h * 0.26, h * 0.26),
        rng.range(w * 0.12, w * 0.34),
        rng.range(h * 0.1, h * 0.3),
      ),
    )
  }
  ctx.restore()
}

interface CloudOpts {
  w: number
  h: number
  y: number
  factor: number
  drift: number
  depth: number
  count: number
  size: [number, number]
  alpha?: number
  /** Extra flattened wisps drawn behind the cumulus.  */
  wisps?: number
  tint?: string
  gulls?: number
  /** Draw soft banks instead of cumulus — mist, dust, graveyard fog. */
  fog?: boolean
}

function cloudLayer(seed: string, p: BiomePalette, o: CloudOpts): ParallaxLayer {
  const s = layerSurface(o.w, o.h)
  const rng = new Rng(seedFrom(seed))
  const ctx = s.ctx
  const key: Light = { x: p.lightDirX, y: p.lightDirY }
  const body = mix(o.tint ?? PAL.white, p.fog, 0.1 + o.depth * 0.34)
  const c = flatten(
    {
      light: mix(body, p.sunTint, 0.42),
      core: body,
      shade: mix(body, p.ambient, 0.44),
      deep: mix(body, p.ambient, 0.66),
      line: mix(body, p.ambient, 0.5),
    },
    o.depth * 0.4,
  )

  for (let i = 0; i < (o.wisps ?? 0); i++) {
    const x = rng.range(0, o.w)
    const y = rng.range(o.h * 0.12, o.h * 0.8)
    const ww = rng.range(o.size[0] * 0.9, o.size[1] * 1.4)
    ctx.save()
    ctx.globalAlpha = rng.range(0.16, 0.34)
    ctx.fillStyle = c.core
    stamp(o.w, x, ww, (sx) => ctx.fill(ellipsePath(sx, y, ww * 0.5, rng.range(0.7, 1.4))))
    ctx.restore()
  }

  for (const x of spread(rng, o.w, o.count, 0.46)) {
    const cw = rng.range(o.size[0], o.size[1])
    const ch = cw * rng.range(0.3, 0.46)
    // Keep the whole mass inside the strip vertically: a cloud clipped by the
    // canvas edge is the straight line that gives a parallax layer away.
    const margin = ch * 0.72 + 3
    const cy = Math.min(o.h - margin, Math.max(margin, rng.range(o.h * 0.3, o.h * 0.78)))
    // One seed per cloud, resolved outside the stamp: re-drawing the rng inside
    // it would give the wrapped copy a different shape, and the strip would no
    // longer join up with itself.
    const cloudSeed = seedFrom(seed + x.toFixed(2))
    stamp(o.w, x, cw, (sx) => {
      const r = new Rng(cloudSeed)
      if (o.fog) fogBank(ctx, r, sx, cy, cw, Math.min(ch * 1.6, o.h * 0.5), c)
      else cloudMass(ctx, r, key, sx, cy, cw, ch, c)
    })
  }

  for (let i = 0; i < (o.gulls ?? 0); i++) {
    const x = rng.range(0, o.w)
    const y = rng.range(o.h * 0.15, o.h * 0.85)
    const sc = rng.range(1.6, 3.2)
    stamp(o.w, x, sc * 2, (sx) => gull(ctx, sx, y, sc, mix(p.ambient, PAL.ink, 0.55)))
  }

  // Fade the strip out at its own top and bottom. Fog especially piles up into
  // a solid mass, and where that mass meets the edge of the layer canvas you
  // get a dead straight line across the sky — the single most obvious tell
  // that a backdrop is made of stacked rectangles.
  fadeEdges(s, o.fog ? 0.26 : 0.07)

  return layerOf(s, {
    factor: o.factor,
    factorY: o.factor * 0.22,
    y: o.y,
    autoScroll: o.drift,
    alpha: o.alpha ?? 0.94 - o.depth * 0.18,
  })
}

/** Taper a layer's alpha to nothing at its top and bottom edges. */
function fadeEdges(s: Surface, fade: number): void {
  const ctx = s.ctx
  const g = ctx.createLinearGradient(0, 0, 0, s.h)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(fade, 'rgba(0,0,0,1)')
  g.addColorStop(1 - fade, 'rgba(0,0,0,1)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.save()
  ctx.globalCompositeOperation = 'destination-in'
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s.w, s.h)
  ctx.restore()
}

/** Two strokes with a kink: enough for a bird at this distance, and no more. */
function gull(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(0.34, s * 0.15)
  ctx.lineCap = 'round'
  const p = new Path2D()
  p.moveTo(x - s, y + s * 0.24)
  p.quadraticCurveTo(x - s * 0.42, y - s * 0.38, x, y)
  p.quadraticCurveTo(x + s * 0.42, y - s * 0.4, x + s, y + s * 0.2)
  ctx.stroke(p)
  ctx.restore()
}

interface SeaOpts {
  top: number
  bottom: number
  base: string
  /** Number of swell lines. */
  swells: number
  /** Sun glitter track, as a fraction of the strip width. 0 for none. */
  glitterAt?: number
}

/**
 * Open water: a depth ramp from the sky-lit horizon down to the deep, with
 * swells whose crests catch the sun. The swell lines and their fade-in mask are
 * both periodic across the strip, so the whole sea wraps.
 */
function seaBand(k: Kit, o: SeaOpts): void {
  const { ctx, p } = k
  const w = k.s.w
  const c = k.ramp(o.base)
  const g = ctx.createLinearGradient(0, o.top, 0, o.bottom)
  g.addColorStop(0, mix(c.core, p.skyLow, 0.62))
  g.addColorStop(0.24, mix(c.core, p.skyLow, 0.2))
  g.addColorStop(1, c.deep)
  ctx.fillStyle = g
  ctx.fillRect(0, o.top, w, o.bottom - o.top)

  const span = o.bottom - o.top
  for (let i = 0; i < o.swells; i++) {
    const t = (i + 0.6) / o.swells
    const y = o.top + Math.pow(t, 1.5) * span
    const near = Math.pow(t, 1.3)
    const shape = wave(k.rng, [2, 3, 5, 7])
    const mask = wave(k.rng, [1, 2, 3])
    const amp = 0.3 + near * 2.6
    const light = mix(c.light, p.sunTint, 0.3)
    ctx.save()
    ctx.strokeStyle = i % 3 === 0 ? light : mix(c.light, c.core, 0.45)
    ctx.lineWidth = 0.4 + near * 1.1
    ctx.lineCap = 'round'
    ctx.globalAlpha = 0.24 + near * 0.4
    const step = 2
    let run: Pt[] = []
    const flush = () => {
      if (run.length > 2) ctx.stroke(curve(run, 1))
      run = []
    }
    for (let x = 0; x <= w; x += step) {
      const m = mask(x / w)
      if (m > 0.05) run.push([x, y + shape(x / w) * amp])
      else flush()
    }
    flush()
    ctx.restore()
  }

  if (o.glitterAt !== undefined) {
    const gx = o.glitterAt * w
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < 90; i++) {
      const t = k.rng.next()
      const y = o.top + Math.pow(t, 1.6) * span * 0.92
      const spreadX = 4 + t * 34
      const x = gx + k.rng.range(-spreadX, spreadX)
      ctx.globalAlpha = k.rng.range(0.1, 0.4) * (1 - t * 0.5)
      ctx.fillStyle = p.sunTint
      const gw = k.rng.range(0.6, 2.4)
      const gh = k.rng.range(0.2, 0.5)
      stamp(w, x, 4, (sx) => ctx.fill(ellipsePath(sx, y, gw, gh)))
    }
    ctx.restore()
  }
}

/** A rolling break of foam where water meets land. */
function surfLine(k: Kit, y: number, amp: number, alpha: number): void {
  const { ctx } = k
  const w = k.s.w
  const shape = wave(k.rng, [2, 4, 7])
  const mask = wave(k.rng, [1, 3])
  ctx.save()
  ctx.fillStyle = mix(PAL.foam, k.p.fog, k.depth * 0.5)
  ctx.globalAlpha = alpha
  for (let x = 0; x <= w; x += 3) {
    const m = mask(x / w)
    if (m < -0.1) continue
    const yy = y + shape(x / w) * amp
    ctx.fill(ellipsePath(x, yy, k.rng.range(2, 5.5), k.rng.range(0.5, 1.1)))
  }
  ctx.restore()
}

// ─────────────────────────────────────────────────────────────────────────────
// Props — the shapes that say which island this is
// ─────────────────────────────────────────────────────────────────────────────

/** A pitched-roof building. The workhorse behind villages, canals and shipyards. */
function building(
  k: Kit,
  x: number,
  y: number,
  w: number,
  h: number,
  o: {
    wall: string
    roof: string
    /** 0 flat, 1 a steep gable. */
    pitch?: number
    windows?: number
    lit?: string
    /** Overhang of the eaves each side. */
    eave?: number
    chimney?: boolean
  },
): void {
  const { ctx } = k
  const pitch = o.pitch ?? 0.55
  const rh = h * pitch * 0.6
  const eave = o.eave ?? w * 0.12
  k.fill(roundRectPath(x - w / 2, y - h, w, h, Math.min(1.2, w * 0.06)), o.wall, [x, y - h * 0.5], w * 0.6, {
    shadow: 0.5,
    light: k.side,
  })
  if (o.chimney) {
    const cw = Math.max(1.2, w * 0.13)
    k.fill(roundRectPath(x + w * 0.24, y - h - rh - cw * 1.6, cw, cw * 2.2, 0.3), o.wall, [x, y - h], cw, {
      light: k.side,
    })
  }
  const roof = new Path2D()
  roof.moveTo(x - w / 2 - eave, y - h)
  roof.lineTo(x, y - h - rh)
  roof.lineTo(x + w / 2 + eave, y - h)
  roof.closePath()
  k.fill(roof, o.roof, [x, y - h - rh * 0.4], w * 0.55, { shadow: 0.44 })
  if (o.windows) {
    const lit = o.lit ?? mix(PAL.strawGold, k.p.fog, k.depth * 0.5)
    const ww = w / (o.windows * 2 + 1)
    for (let i = 0; i < o.windows; i++) {
      const wx = x - w / 2 + ww * (i * 2 + 1)
      const on = k.rng.bool(0.62)
      const wh = h * k.rng.range(0.24, 0.38)
      const wy = y - h * k.rng.range(0.7, 0.82)
      ctx.fillStyle = on ? lit : mix(k.ramp(o.wall).deep, PAL.ink, 0.4)
      ctx.fill(roundRectPath(wx, wy, ww * k.rng.range(0.8, 1), wh, ww * 0.2))
      if (on && k.depth < 0.5) {
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        radialFill(ctx, wx + ww / 2, wy + wh * 0.5, 0, ww * 2.6, [
          [0, rgba(lit, 0.3)],
          [1, rgba(lit, 0)],
        ])
        ctx.restore()
      }
    }
  }
}

/** East Blue's windmill: a squat stone tower, a cap, and four sails on a hub. */
function windmill(k: Kit, x: number, y: number, s: number, spin: number): void {
  const { ctx } = k
  const bodyW = 6.2 * s
  const bodyH = 14 * s
  const tower = blob(
    [
      [x - bodyW * 0.62, y],
      [x - bodyW * 0.4, y - bodyH * 0.6],
      [x - bodyW * 0.34, y - bodyH],
      [x + bodyW * 0.34, y - bodyH],
      [x + bodyW * 0.4, y - bodyH * 0.6],
      [x + bodyW * 0.62, y],
    ] as Pt[],
    0.25,
  )
  k.fill(tower, PAL.cream, [x, y - bodyH * 0.5], bodyW * 0.6, { shadow: 0.5, light: k.side })
  const cap = blob(
    [
      [x - bodyW * 0.5, y - bodyH],
      [x, y - bodyH - 3.4 * s],
      [x + bodyW * 0.5, y - bodyH],
    ] as Pt[],
    0.4,
  )
  k.fill(cap, PAL.luffyRed, [x, y - bodyH - 1.4 * s], bodyW * 0.5, { shadow: 0.42 })
  const hy = y - bodyH * 0.94
  ctx.save()
  ctx.strokeStyle = k.ramp(PAL.wood).line
  ctx.lineWidth = 0.5 * s
  const blade = k.ramp(PAL.woodLight)
  for (let i = 0; i < 4; i++) {
    const a = spin + (i / 4) * TAU
    const bx = x + Math.cos(a) * 8.6 * s
    const by = hy + Math.sin(a) * 8.6 * s
    const nx = -Math.sin(a) * 1.5 * s
    const ny = Math.cos(a) * 1.5 * s
    const p = new Path2D()
    p.moveTo(x + Math.cos(a) * 1.4 * s, hy + Math.sin(a) * 1.4 * s)
    p.lineTo(bx + nx, by + ny)
    p.lineTo(bx - nx * 0.2, by - ny * 0.2)
    p.closePath()
    ctx.fillStyle = i % 2 === 0 ? blade.core : blade.shade
    ctx.fill(p)
    ctx.stroke(p)
  }
  ctx.fillStyle = k.ramp(PAL.wood).deep
  ctx.fill(ellipsePath(x, hy, 1.1 * s, 1.1 * s))
  ctx.restore()
}

/** A banded lighthouse with a lit lantern room. */
function lighthouse(k: Kit, x: number, y: number, s: number): void {
  const { ctx } = k
  const h = 26 * s
  const rB = 3.4 * s
  const rT = 2.2 * s
  const tower = new Path2D()
  tower.moveTo(x - rB, y)
  tower.lineTo(x - rT, y - h)
  tower.lineTo(x + rT, y - h)
  tower.lineTo(x + rB, y)
  tower.closePath()
  k.fill(tower, PAL.marineWhite, [x, y - h * 0.5], rB, { shadow: 0.48, light: k.side })
  ctx.save()
  ctx.clip(tower)
  ctx.fillStyle = mix(haze(PAL.luffyRed, k.p.fog, k.depth), PAL.ink, 0.05)
  for (let i = 0; i < 3; i++) ctx.fillRect(x - rB * 1.2, y - h * (0.22 + i * 0.28), rB * 2.4, h * 0.13)
  ctx.restore()
  // Gallery, lantern room, cap.
  k.fill(roundRectPath(x - rT * 1.5, y - h - 1.2 * s, rT * 3, 1.4 * s, 0.3), PAL.slate, [x, y - h], rT * 1.5)
  const lamp = mix(PAL.strawGold, k.p.fog, k.depth * 0.4)
  ctx.fillStyle = lamp
  ctx.fill(roundRectPath(x - rT * 1.05, y - h - 4.4 * s, rT * 2.1, 3.2 * s, 0.5))
  k.fill(
    blob([[x - rT * 1.4, y - h - 4.4 * s], [x, y - h - 7 * s], [x + rT * 1.4, y - h - 4.4 * s]] as Pt[], 0.3),
    PAL.luffyRedDeep,
    [x, y - h - 5.4 * s],
    rT,
  )
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  radialFill(ctx, x, y - h - 2.8 * s, 0, 13 * s, [
    [0, rgba(lamp, 0.34)],
    [1, rgba(lamp, 0)],
  ])
  ctx.restore()
}

/** A palm: a leaning ringed trunk under a crown of tapered fronds. */
function palmTree(k: Kit, x: number, y: number, s: number, lean: number, rng: Rng): void {
  const { ctx } = k
  const h = 15 * s
  const tipX = x + lean * h * 0.42
  const tipY = y - h
  const trunk = new Path2D()
  trunk.moveTo(x - 0.8 * s, y)
  trunk.quadraticCurveTo(x + lean * h * 0.1, y - h * 0.55, tipX - 0.42 * s, tipY)
  trunk.lineTo(tipX + 0.42 * s, tipY)
  trunk.quadraticCurveTo(x + lean * h * 0.16 + 0.8 * s, y - h * 0.5, x + 1 * s, y)
  trunk.closePath()
  k.fill(trunk, PAL.woodLight, [x, y - h * 0.5], 1.2 * s, { shadow: 0.5 })
  const green = k.ramp(PAL.grassDeep)
  const n = 6
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (i / (n - 1)) * Math.PI + rng.range(-0.16, 0.16)
    const len = (7 + rng.range(0, 3.4)) * s
    const ex = tipX + Math.cos(a) * len
    const ey = tipY + Math.sin(a) * len * 0.66 + len * 0.3
    const mx = (tipX + ex) / 2
    const my = (tipY + ey) / 2 - len * 0.34
    const frond = new Path2D()
    frond.moveTo(tipX, tipY)
    frond.quadraticCurveTo(mx, my - len * 0.14, ex, ey)
    frond.quadraticCurveTo(mx, my + len * 0.2, tipX, tipY + 0.9 * s)
    frond.closePath()
    ctx.fillStyle = Math.cos(a) * k.p.lightDirX > 0 ? green.core : green.shade
    ctx.fill(frond)
  }
  ctx.fillStyle = mix(PAL.strawDeep, k.p.fog, k.depth * 0.6)
  for (let i = 0; i < 3; i++) {
    ctx.fill(ellipsePath(tipX + rng.range(-1.5, 1.5) * s, tipY + rng.range(0.6, 2) * s, 0.8 * s, 0.7 * s))
  }
}

interface ShipOpts {
  hull: string
  sail: string
  masts: number
  /** Colour of the flag at the main truck, if any. */
  flag?: string
  stripe?: string
  jolly?: boolean
}

/** A tall ship in profile: sheer hull, masts, bellied sails, a flag. */
function sailShip(k: Kit, x: number, y: number, s: number, o: ShipOpts): void {
  const { ctx } = k
  const hw = 13 * s
  const hh = 3.6 * s
  const hull = blob(
    [
      [x - hw, y - hh * 1.5],
      [x - hw * 0.55, y - hh * 1.05],
      [x + hw * 0.55, y - hh * 1.0],
      [x + hw * 0.92, y - hh * 1.9],
      [x + hw * 1.02, y - hh * 0.5],
      [x + hw * 0.6, y + hh * 0.28],
      [x - hw * 0.5, y + hh * 0.2],
      [x - hw * 0.95, y - hh * 0.55],
    ] as Pt[],
    0.55,
  )
  const mastC = k.ramp(PAL.wood)
  const sailC = k.ramp(o.sail)
  ctx.save()
  ctx.strokeStyle = mastC.shade
  ctx.lineWidth = 0.55 * s
  for (let m = 0; m < o.masts; m++) {
    const mt = o.masts === 1 ? 0.5 : m / (o.masts - 1)
    const mx = x + (mt - 0.5) * hw * 1.15
    const mh = (17 + Math.sin(mt * Math.PI) * 6) * s
    const top = y - hh * 1.6 - mh
    ctx.beginPath()
    ctx.moveTo(mx, y - hh)
    ctx.lineTo(mx, top)
    ctx.stroke()
    // Two courses of canvas, bellied away from the wind.
    for (let sq = 0; sq < 2; sq++) {
      const sy = top + mh * (0.16 + sq * 0.42)
      const sh = mh * 0.34
      const sw = (5.2 - sq * 0.6) * s
      const belly = sw * 0.42
      const sail = new Path2D()
      sail.moveTo(mx - sw, sy)
      sail.quadraticCurveTo(mx, sy + belly * 0.4, mx + sw, sy)
      sail.quadraticCurveTo(mx + sw * 0.7 + belly, sy + sh * 0.5, mx + sw * 0.86, sy + sh)
      sail.quadraticCurveTo(mx, sy + sh + belly * 0.5, mx - sw * 0.86, sy + sh)
      sail.quadraticCurveTo(mx - sw * 0.8, sy + sh * 0.5, mx - sw, sy)
      sail.closePath()
      k.fill(sail, sailC, [mx, sy + sh * 0.5], sw, { shadow: 0.4 })
      ctx.strokeStyle = mastC.shade
      ctx.lineWidth = 0.35 * s
      ctx.beginPath()
      ctx.moveTo(mx - sw * 1.1, sy)
      ctx.lineTo(mx + sw * 1.1, sy)
      ctx.stroke()
    }
    if (m === Math.floor(o.masts / 2) && (o.flag || o.jolly)) {
      const fc = o.flag ?? PAL.ink
      const flag = new Path2D()
      flag.moveTo(mx, top)
      flag.lineTo(mx + 4.4 * s, top + 1.1 * s)
      flag.lineTo(mx, top + 2.6 * s)
      flag.closePath()
      ctx.fillStyle = mix(haze(fc, k.p.fog, k.depth), PAL.ink, 0.1)
      ctx.fill(flag)
      if (o.jolly && s > 0.75) {
        ctx.fillStyle = mix(PAL.cream, k.p.fog, k.depth * 0.5)
        ctx.fill(ellipsePath(mx + 1.5 * s, top + 1.3 * s, 0.7 * s, 0.6 * s))
      }
    }
  }
  ctx.restore()
  k.fill(hull, o.hull, [x, y - hh], hh * 1.6, { shadow: 0.52 })
  if (o.stripe) {
    ctx.save()
    ctx.clip(hull)
    ctx.fillStyle = mix(haze(o.stripe, k.p.fog, k.depth), PAL.ink, 0.05)
    ctx.fillRect(x - hw * 1.1, y - hh * 1.15, hw * 2.2, hh * 0.42)
    ctx.restore()
  }
  // Bowsprit.
  ctx.save()
  ctx.strokeStyle = mastC.shade
  ctx.lineWidth = 0.45 * s
  ctx.beginPath()
  ctx.moveTo(x + hw * 0.82, y - hh * 1.5)
  ctx.lineTo(x + hw * 1.5, y - hh * 2.3)
  ctx.stroke()
  ctx.restore()
}

/** A dome on a drum — Alubarna's skyline, and every sandstone capital's. */
function sandDome(k: Kit, x: number, y: number, s: number): void {
  const w = 11 * s
  k.fill(roundRectPath(x - w * 0.5, y - 7 * s, w, 7 * s, 0.6), PAL.sand, [x, y - 3.5 * s], w * 0.5, {
    light: k.side,
  })
  const dome = new Path2D()
  dome.moveTo(x - w * 0.52, y - 7 * s)
  dome.bezierCurveTo(x - w * 0.55, y - 14 * s, x + w * 0.55, y - 14 * s, x + w * 0.52, y - 7 * s)
  dome.closePath()
  k.fill(dome, PAL.sandDeep, [x, y - 10 * s], w * 0.5, { shadow: 0.44 })
  k.ctx.fillStyle = mix(k.ramp(PAL.gold).core, k.p.fog, 0.2)
  k.ctx.fill(ellipsePath(x, y - 14.4 * s, 0.7 * s, 1.4 * s))
}

/** A minaret: a slim tower with a balcony and a little cap. */
function minaret(k: Kit, x: number, y: number, s: number): void {
  const h = 22 * s
  const r = 1.7 * s
  k.fill(roundRectPath(x - r, y - h, r * 2, h, 0.4), PAL.sand, [x, y - h * 0.5], r * 1.4, {
    shadow: 0.5,
    light: k.side,
  })
  k.fill(roundRectPath(x - r * 1.9, y - h * 0.7, r * 3.8, 1.3 * s, 0.3), PAL.sandDeep, [x, y - h * 0.7], r * 1.9)
  const cap = new Path2D()
  cap.moveTo(x - r * 1.3, y - h)
  cap.bezierCurveTo(x - r * 1.3, y - h - 4 * s, x + r * 1.3, y - h - 4 * s, x + r * 1.3, y - h)
  cap.closePath()
  k.fill(cap, PAL.sandDeep, [x, y - h - 1.6 * s], r * 1.3)
}

/** A broken column, optionally with a stub of architrave still on top. */
function ruinColumn(k: Kit, x: number, y: number, s: number, h: number, capped: boolean): void {
  const r = 1.5 * s
  const shaft = new Path2D()
  shaft.moveTo(x - r, y)
  shaft.lineTo(x - r * 0.82, y - h)
  shaft.lineTo(x + r * 0.82, y - h)
  shaft.lineTo(x + r, y)
  shaft.closePath()
  k.fill(shaft, PAL.sandDeep, [x, y - h * 0.5], r, { shadow: 0.5, light: k.side })
  k.ctx.save()
  k.ctx.clip(shaft)
  k.ctx.strokeStyle = rgba(k.ramp(PAL.sandDeep).deep, 0.5)
  k.ctx.lineWidth = 0.3 * s
  for (let i = -1; i <= 1; i++) {
    k.ctx.beginPath()
    k.ctx.moveTo(x + i * r * 0.5, y)
    k.ctx.lineTo(x + i * r * 0.45, y - h)
    k.ctx.stroke()
  }
  k.ctx.restore()
  if (capped) {
    k.fill(roundRectPath(x - r * 1.7, y - h - 1.6 * s, r * 3.4, 1.7 * s, 0.2), PAL.sand, [x, y - h], r * 1.7)
  }
}

/** A laden camel in profile — humps, neck, four legs, a rider's silhouette. */
function camel(k: Kit, x: number, y: number, s: number, rider: boolean): void {
  const { ctx } = k
  const c = k.ramp(PAL.dirt)
  const body = blob(
    [
      [x - 4 * s, y - 4 * s],
      [x - 2.4 * s, y - 6.2 * s],
      [x - 0.4 * s, y - 4.6 * s],
      [x + 1.6 * s, y - 6.4 * s],
      [x + 3.6 * s, y - 4.4 * s],
      [x + 3.2 * s, y - 2.8 * s],
      [x - 3.6 * s, y - 2.8 * s],
    ] as Pt[],
    0.7,
  )
  ctx.save()
  ctx.strokeStyle = c.shade
  ctx.lineWidth = 0.55 * s
  for (const lx of [-3, -2, 2.6, 3.4]) {
    ctx.beginPath()
    ctx.moveTo(x + lx * s, y - 3 * s)
    ctx.lineTo(x + lx * s + (lx > 0 ? 0.5 : -0.4) * s, y)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.moveTo(x + 3.4 * s, y - 5 * s)
  ctx.quadraticCurveTo(x + 5.6 * s, y - 7.4 * s, x + 5.2 * s, y - 9.2 * s)
  ctx.lineWidth = 0.9 * s
  ctx.stroke()
  ctx.restore()
  k.fill(body, c, [x, y - 4.4 * s], 2.6 * s, { shadow: 0.5 })
  ctx.fillStyle = c.shade
  ctx.fill(ellipsePath(x + 5.3 * s, y - 9.8 * s, 1.2 * s, 0.8 * s, -0.5))
  if (rider) {
    ctx.fillStyle = k.ramp(PAL.cream).shade
    ctx.fill(ellipsePath(x - 0.4 * s, y - 8 * s, 1.1 * s, 1.9 * s))
  }
}

/** A sky island: grass cap over a rock keel that tapers to nothing. */
function skyIsland(
  k: Kit,
  x: number,
  y: number,
  w: number,
  o: { fall?: number; onTop?: (sx: number, sy: number) => void },
): void {
  const { ctx } = k
  const keelH = w * k.rng.range(0.5, 0.85)
  const keel = blob(
    [
      [x - w * 0.5, y],
      [x - w * 0.22, y + keelH * 0.55],
      [x + w * 0.06, y + keelH],
      [x + w * 0.3, y + keelH * 0.5],
      [x + w * 0.5, y],
    ] as Pt[],
    0.7,
  )
  k.fill(keel, mix(PAL.rock, PAL.dirt, 0.3), [x, y + keelH * 0.3], w * 0.4, {
    shadow: 0.54,
    occlusion: 0.4,
  })
  // Crags, so the keel is rock rather than a paper cone.
  ctx.save()
  ctx.clip(keel)
  const rockC = k.ramp(mix(PAL.rock, PAL.dirt, 0.3))
  for (let i = 0; i < 7; i++) {
    const cx = x + k.rng.range(-w * 0.42, w * 0.42)
    const cy = y + k.rng.range(w * 0.06, keelH * 0.85)
    const cw = k.rng.range(w * 0.06, w * 0.2)
    ctx.fillStyle = k.rng.bool() ? rockC.deep : rockC.light
    ctx.globalAlpha = 0.4
    ctx.fill(
      blob(
        [
          [cx - cw, cy],
          [cx - cw * 0.3, cy - cw * 0.7],
          [cx + cw * 0.7, cy - cw * 0.3],
          [cx + cw * 0.4, cy + cw * 0.8],
        ] as Pt[],
        0.4,
      ),
    )
  }
  ctx.restore()
  const cap = blob(
    [
      [x - w * 0.5, y],
      [x - w * 0.3, y - w * 0.1],
      [x, y - w * 0.14],
      [x + w * 0.3, y - w * 0.09],
      [x + w * 0.5, y],
      [x + w * 0.3, y + w * 0.04],
      [x - w * 0.3, y + w * 0.04],
    ] as Pt[],
    0.8,
  )
  k.fill(cap, PAL.grass, [x, y - w * 0.04], w * 0.24, { shadow: 0.4 })
  if (o.fall) {
    const fx = x + w * o.fall
    const fw = w * 0.07
    const fall = new Path2D()
    fall.moveTo(fx - fw, y)
    fall.lineTo(fx + fw, y)
    fall.lineTo(fx + fw * 2.1, y + keelH * 1.9)
    fall.lineTo(fx - fw * 2.3, y + keelH * 1.9)
    fall.closePath()
    const water = mix(PAL.foam, PAL.seaLight, 0.3 + k.depth * 0.2)
    const g = ctx.createLinearGradient(0, y, 0, y + keelH * 1.9)
    g.addColorStop(0, rgba(water, 0.9))
    g.addColorStop(0.55, rgba(water, 0.45))
    g.addColorStop(1, rgba(water, 0))
    ctx.save()
    ctx.fillStyle = g
    ctx.fill(fall)
    ctx.globalAlpha = 0.5
    ctx.fillStyle = water
    for (let i = 0; i < 6; i++) {
      ctx.fill(ellipsePath(fx + k.rng.range(-fw, fw) * 2, y + keelH * k.rng.range(0.7, 1.5), k.rng.range(1, 3), k.rng.range(0.6, 1.4)))
    }
    ctx.globalAlpha = 1
    for (let i = 0; i < 5; i++) {
      puff(k, fx + k.rng.range(-fw * 2, fw * 2), y + keelH * k.rng.range(1.5, 2), k.rng.range(4, 9), PAL.white, 0.22)
    }
    ctx.restore()
  }
  o.onTop?.(x, y - w * 0.1)
}

/** A swooping pagoda roof with upturned eaves. */
function pagodaRoof(k: Kit, x: number, y: number, w: number, color: string): void {
  const roof = new Path2D()
  roof.moveTo(x - w * 0.5, y)
  roof.quadraticCurveTo(x - w * 0.3, y + w * 0.04, x - w * 0.6, y + w * 0.1)
  roof.quadraticCurveTo(x - w * 0.24, y - w * 0.02, x, y - w * 0.28)
  roof.quadraticCurveTo(x + w * 0.24, y - w * 0.02, x + w * 0.6, y + w * 0.1)
  roof.quadraticCurveTo(x + w * 0.3, y + w * 0.04, x + w * 0.5, y)
  roof.closePath()
  k.fill(roof, color, [x, y - w * 0.08], w * 0.4, { shadow: 0.44 })
}

/** A torii: two tapered posts, a curved lintel, a tie beam. */
function torii(k: Kit, x: number, y: number, s: number, color: string): void {
  const h = 13 * s
  const w = 11 * s
  const r = 0.95 * s
  for (const sx of [-1, 1]) {
    const post = new Path2D()
    post.moveTo(x + sx * w * 0.5 - r * 1.2, y)
    post.lineTo(x + sx * w * 0.5 - r * 0.8, y - h)
    post.lineTo(x + sx * w * 0.5 + r * 0.8, y - h)
    post.lineTo(x + sx * w * 0.5 + r * 1.2, y)
    post.closePath()
    k.fill(post, color, [x + sx * w * 0.5, y - h * 0.5], r * 1.2, { shadow: 0.5, light: k.side })
  }
  k.fill(roundRectPath(x - w * 0.44, y - h * 0.76, w * 0.88, 1.5 * s, 0.3), color, [x, y - h * 0.7], w * 0.4)
  const lintel = new Path2D()
  lintel.moveTo(x - w * 0.72, y - h + 1.2 * s)
  lintel.quadraticCurveTo(x, y - h - 1.4 * s, x + w * 0.72, y - h + 1.2 * s)
  lintel.quadraticCurveTo(x, y - h + 0.4 * s, x - w * 0.72, y - h + 1.2 * s)
  lintel.closePath()
  k.fill(lintel, color, [x, y - h], w * 0.4, { shadow: 0.42 })
}

/** A bare, warped tree. Branches fork with a bias so no two are alike. */
function bareTree(k: Kit, x: number, y: number, h: number, rng: Rng, color: string): void {
  const { ctx } = k
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  const limb = (px: number, py: number, ang: number, len: number, wdt: number, d: number) => {
    const ex = px + Math.cos(ang) * len
    const ey = py + Math.sin(ang) * len
    const cx = px + Math.cos(ang + rng.range(-0.5, 0.5)) * len * 0.6
    const cy = py + Math.sin(ang + rng.range(-0.4, 0.4)) * len * 0.6
    ctx.lineWidth = wdt
    ctx.beginPath()
    ctx.moveTo(px, py)
    ctx.quadraticCurveTo(cx, cy, ex, ey)
    ctx.stroke()
    if (d <= 0 || len < h * 0.07) return
    const forks = rng.bool(0.72) ? 2 : 3
    for (let i = 0; i < forks; i++) {
      limb(
        ex,
        ey,
        ang + rng.range(-0.95, 0.95) - (i - (forks - 1) / 2) * 0.24,
        len * rng.range(0.5, 0.74),
        wdt * 0.62,
        d - 1,
      )
    }
  }
  limb(x, y, -Math.PI / 2 + rng.range(-0.3, 0.3), h * 0.42, Math.max(0.5, h * 0.075), 3)
  ctx.restore()
}

/** A leaning headstone with a shadowed face. */
function gravestone(k: Kit, x: number, y: number, s: number, tilt: number): void {
  const { ctx } = k
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(tilt)
  const w = 3.4 * s
  const h = 6.4 * s
  const stone = new Path2D()
  stone.moveTo(-w * 0.5, 0)
  stone.lineTo(-w * 0.5, -h * 0.68)
  stone.quadraticCurveTo(0, -h * 1.06, w * 0.5, -h * 0.68)
  stone.lineTo(w * 0.5, 0)
  stone.closePath()
  k.fill(stone, PAL.slate, [0, -h * 0.5], w * 0.5, { shadow: 0.55 })
  ctx.restore()
}

/** A shipyard gantry crane: a leg, a jib and its counterweight. */
function crane(k: Kit, x: number, y: number, s: number, flip: number): void {
  const { ctx } = k
  const h = 22 * s
  const c = k.ramp(PAL.rockDeep)
  ctx.save()
  ctx.strokeStyle = c.core
  ctx.lineWidth = 1.1 * s
  ctx.beginPath()
  ctx.moveTo(x - 2.4 * s, y)
  ctx.lineTo(x, y - h)
  ctx.moveTo(x + 2.4 * s, y)
  ctx.lineTo(x, y - h)
  ctx.stroke()
  ctx.lineWidth = 1.3 * s
  ctx.beginPath()
  ctx.moveTo(x - flip * 5 * s, y - h * 0.86)
  ctx.lineTo(x + flip * 14 * s, y - h)
  ctx.stroke()
  ctx.lineWidth = 0.5 * s
  ctx.beginPath()
  ctx.moveTo(x + flip * 11 * s, y - h * 0.99)
  ctx.lineTo(x + flip * 11 * s, y - h * 0.6)
  ctx.stroke()
  ctx.restore()
  k.fill(roundRectPath(x - 1.6 * s, y - h * 0.98, 3.2 * s, 2.4 * s, 0.4), PAL.namiOrange, [x, y - h * 0.9], 1.6 * s)
  ctx.fillStyle = c.deep
  ctx.fill(roundRectPath(x + flip * 10.2 * s, y - h * 0.62, 1.6 * s, 1.6 * s, 0.3))
}

/** A hull on the stocks: ribs over a keel, half planked. */
function halfHull(k: Kit, x: number, y: number, s: number): void {
  const { ctx } = k
  const w = 20 * s
  const h = 7 * s
  const hull = blob(
    [
      [x - w * 0.5, y - h],
      [x - w * 0.2, y - h * 0.8],
      [x + w * 0.42, y - h * 0.86],
      [x + w * 0.5, y - h * 1.5],
      [x + w * 0.46, y - h * 0.2],
      [x, y + h * 0.1],
      [x - w * 0.42, y - h * 0.4],
    ] as Pt[],
    0.6,
  )
  k.fill(hull, PAL.wood, [x, y - h * 0.5], h, { shadow: 0.52 })
  ctx.save()
  ctx.clip(hull)
  ctx.strokeStyle = rgba(k.ramp(PAL.woodDeep).deep, 0.55)
  ctx.lineWidth = 0.4 * s
  for (let i = 0; i < 7; i++) {
    const rx = x - w * 0.42 + (i / 6) * w * 0.86
    ctx.beginPath()
    ctx.moveTo(rx, y - h * 1.4)
    ctx.quadraticCurveTo(rx + s, y - h * 0.4, rx + 1.6 * s, y + h * 0.2)
    ctx.stroke()
  }
  ctx.restore()
  ctx.save()
  ctx.strokeStyle = k.ramp(PAL.wood).shade
  ctx.lineWidth = 0.5 * s
  for (const sx of [-0.3, 0.15]) {
    ctx.beginPath()
    ctx.moveTo(x + w * sx - 2 * s, y + h * 0.5)
    ctx.lineTo(x + w * sx, y - h * 0.4)
    ctx.moveTo(x + w * sx + 2 * s, y + h * 0.5)
    ctx.lineTo(x + w * sx, y - h * 0.4)
    ctx.stroke()
  }
  ctx.restore()
}

/** A puff of steam or fog, soft on purpose — the one place mush is right. */
function puff(k: Kit, x: number, y: number, r: number, color: string, alpha: number): void {
  radialFill(k.ctx, x, y, 0, r, [
    [0, rgba(color, alpha)],
    [0.5, rgba(color, alpha * 0.5)],
    [1, rgba(color, 0)],
  ])
}

/**
 * Cut ledges into a rock band. The rock the canal city is built on is quarried,
 * not natural: without terraces it is one flat grey mass whatever you do to its
 * silhouette.
 */
function terraces(k: Kit, at: (x: number) => number, n: number, gap: number): void {
  const { ctx } = k
  const w = k.s.w
  const c = k.ramp(PAL.rock)
  const mask = wave(k.rng, [1, 2, 3, 5])
  for (let i = 1; i <= n; i++) {
    const d = i * gap + k.rng.range(-2, 2)
    const lip = new Path2D()
    const face = new Path2D()
    let open = false
    for (let x = 0; x <= w; x += 2) {
      const on = mask((x / w + i * 0.19) % 1) > -0.25
      const y = at(x) + d
      if (on) {
        if (!open) {
          lip.moveTo(x, y)
          face.moveTo(x, y + 1)
          open = true
        } else {
          lip.lineTo(x, y)
          face.lineTo(x, y + 1)
        }
      } else open = false
    }
    ctx.save()
    ctx.globalAlpha = 0.5
    ctx.strokeStyle = mix(c.light, k.p.sunTint, 0.3)
    ctx.lineWidth = 1
    ctx.stroke(lip)
    ctx.globalAlpha = 0.35
    ctx.strokeStyle = c.deep
    ctx.lineWidth = 2.4
    ctx.stroke(face)
    ctx.restore()
  }
}

/** A round-crowned tree, built from a few leaf masses so no two repeat. */
function bushTree(k: Kit, x: number, y: number, s: number, color: string, rng: Rng): void {
  const { ctx } = k
  ctx.save()
  ctx.strokeStyle = k.ramp(PAL.woodDeep).core
  ctx.lineWidth = 0.55 * s
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + rng.range(-0.6, 0.6) * s, y - 3.4 * s)
  ctx.stroke()
  ctx.restore()
  const crown = new Path2D()
  const n = 3 + rng.int(0, 2)
  for (let i = 0; i < n; i++) {
    crown.addPath(
      ellipsePath(
        x + rng.range(-2.1, 2.1) * s,
        y - (4.4 + rng.range(0, 2.4)) * s,
        rng.range(1.7, 3.1) * s,
        rng.range(1.5, 2.5) * s,
      ),
    )
  }
  k.fill(crown, color, [x, y - 5.4 * s], 3 * s, { shadow: 0.44, line: 0 })
}

// ─────────────────────────────────────────────────────────────────────────────
// Land layer plumbing
// ─────────────────────────────────────────────────────────────────────────────

interface LandOpts extends LayerSpec {
  w: number
  h: number
  depth: number
  base: string
  baseY: number
  amp: number
  ks?: number[]
  profile?: (t: number) => number
  lip?: number
  foot?: number
  /** Fog wash over the finished layer, tying it to the layer in front. */
  veil?: number
  decorate?: (k: Kit, at: (x: number) => number) => void
}

function landLayer(seed: string, p: BiomePalette, o: LandOpts): ParallaxLayer {
  const s = layerSurface(o.w, o.h)
  const k = kit(s, p, new Rng(seedFrom(seed)), o.depth)
  const at = terrainBand(k, {
    baseY: o.baseY,
    amp: o.amp,
    bottom: o.h,
    ks: o.ks,
    profile: o.profile,
    base: o.base,
    lip: o.lip,
    foot: o.foot,
  })
  o.decorate?.(k, at)
  if (o.veil) {
    const g = s.ctx.createLinearGradient(0, o.baseY - o.amp, 0, o.h)
    g.addColorStop(0, rgba(p.fog, 0))
    g.addColorStop(1, rgba(p.fog, o.veil))
    s.ctx.fillStyle = g
    s.ctx.fillRect(0, 0, o.w, o.h)
  }
  return layerOf(s, o)
}

/** A transparent strip for things that float in front of the sky. */
function propLayer(
  seed: string,
  p: BiomePalette,
  o: LayerSpec & { w: number; h: number; depth: number; draw: (k: Kit) => void },
): ParallaxLayer {
  const s = layerSurface(o.w, o.h)
  const k = kit(s, p, new Rng(seedFrom(seed)), o.depth)
  o.draw(k)
  return layerOf(s, o)
}

/** The band of fog that sits between the backdrop and the tiles. */
function groundHaze(p: BiomePalette, o: { y: number; h: number; factor: number; strength: number }): ParallaxLayer {
  const s = layerSurface(GAME_W, o.h)
  const g = s.ctx.createLinearGradient(0, 0, 0, o.h)
  g.addColorStop(0, rgba(p.fog, 0))
  g.addColorStop(0.6, rgba(p.fog, o.strength * 0.5))
  g.addColorStop(1, rgba(p.fog, o.strength))
  s.ctx.fillStyle = g
  s.ctx.fillRect(0, 0, GAME_W, o.h)
  return layerOf(s, { factor: o.factor, factorY: o.factor * 0.2, y: o.y, alpha: 0.9 })
}

// ─────────────────────────────────────────────────────────────────────────────
// East Blue
// ─────────────────────────────────────────────────────────────────────────────

function eastBlue(p: BiomePalette): ParallaxLayer[] {
  const layers: ParallaxLayer[] = []
  layers.push(skyLayer('east-blue', p, { horizonGlow: 0.2 }))
  layers.push(
    cloudLayer('eb-cloud-hi', p, {
      w: 840, h: 74, y: 0, factor: 0.05, drift: -1.1, depth: 0.72,
      count: 5, size: [26, 52], wisps: 7,
    }),
  )
  layers.push(
    cloudLayer('eb-cloud-lo', p, {
      w: 760, h: 88, y: 34, factor: 0.13, drift: -3, depth: 0.42,
      count: 4, size: [46, 84], wisps: 4, gulls: 3,
    }),
  )

  // Sea to the horizon, with the far islands and the Marine patrol on it.
  layers.push(
    propLayer('eb-sea', p, {
      w: 800, h: 102, y: 104, factor: 0.17, depth: 0.62,
      draw: (k) => {
        const horizon = 12
        distantIsles(k, horizon, 4)
        seaBand(k, { top: horizon, bottom: 102, base: PAL.sea, swells: 9, glitterAt: p.lightDirX < 0 ? 0.24 : 0.76 })
        for (const x of spread(k.rng, k.s.w, 2, 0.4)) {
          stampRng(k, k.s.w, x, 22, (sx) =>
            sailShip(k, sx, horizon + 4, 0.5, {
              hull: PAL.marineNavy, sail: PAL.marineWhite, masts: 3, stripe: PAL.marineBlue, flag: PAL.marineBlue,
            }),
          )
        }
      },
    }),
  )

  // The caravel and the gulls share a plane, so one bob carries both.
  layers.push(
    propLayer('eb-ships', p, {
      w: 720, h: 132, y: 14, factor: 0.2, depth: 0.44, bob: 1.3, bobSpeed: 0.42,
      draw: (k) => {
        stampRng(k, k.s.w, k.s.w * 0.34, 30, (sx) =>
          sailShip(k, sx, 110, 0.92, { hull: PAL.woodDeep, sail: PAL.cream, masts: 2, jolly: true, flag: PAL.ink }),
        )
        stampRng(k, k.s.w, k.s.w * 0.78, 24, (sx) =>
          sailShip(k, sx, 107, 0.6, { hull: PAL.marineNavy, sail: PAL.marineWhite, masts: 3, stripe: PAL.marineBlue }),
        )
        for (const x of spread(k.rng, k.s.w, 5, 0.45)) {
          const s = k.rng.range(1.7, 3.4)
          const y = k.rng.range(12, 74)
          stampRng(k, k.s.w, x, s * 2, (sx) => gull(k.ctx, sx, y, s, mix(p.ambient, PAL.ink, 0.5)))
        }
      },
    }),
  )

  // Green headland: windmills on the crests, a lighthouse on the point.
  layers.push(
    landLayer('eb-head', p, {
      w: 780, h: 112, y: 104, factor: 0.33, depth: 0.46, base: PAL.grass,
      baseY: 36, amp: 15, ks: [1, 2, 3, 5, 9],
      decorate: (k, at) => {
        const w = k.s.w
        const lx = w * 0.62
        stampRng(k, w, lx, 22, (sx) => lighthouse(k, sx, at(sx) + 1, 0.62))
        for (const x of spread(k.rng, w, 4, 0.36)) {
          const s = k.rng.range(0.5, 0.72)
          if (Math.abs(x - lx) < 40) continue
          stampRng(k, w, x, 16, (sx) => windmill(k, sx, at(sx) + 1, s, k.rng.range(0, TAU)))
        }
        for (const x of spread(k.rng, w, 9, 0.48)) {
          const s = k.rng.range(0.5, 0.95)
          stampRng(k, w, x, 8, (sx) => bushTree(k, sx, at(sx) + 1, s, PAL.grassDeep, k.rng))
        }
        for (const x of spread(k.rng, w, 6, 0.45)) {
          if (!k.rng.bool(0.6)) continue
          stampRng(k, w, x, 10, (sx) =>
            building(k, sx, at(sx) + 1, k.rng.range(6, 9), k.rng.range(5, 7), {
              wall: PAL.cream, roof: PAL.luffyRed, windows: 2,
            }),
          )
        }
      },
    }),
  )

  // Near cove: palms, the village roofs and a jetty out into the water.
  layers.push(
    landLayer('eb-coast', p, {
      w: 700, h: 96, y: 122, factor: 0.55, depth: 0.24, base: mix(PAL.grassDeep, PAL.sea, 0.14),
      baseY: 31, amp: 13, ks: [1, 2, 4, 7, 11], veil: 0.4, foot: 0.5,
      decorate: (k, at) => {
        const w = k.s.w
        for (const x of spread(k.rng, w, 5, 0.45)) {
          stampRng(k, w, x, 16, (sx) => palmTree(k, sx, at(sx) + 1, k.rng.range(0.72, 1.05), k.rng.range(-0.5, 0.5), k.rng))
        }
        for (const x of spread(k.rng, w, 4, 0.4)) {
          if (!k.rng.bool(0.7)) continue
          stampRng(k, w, x, 12, (sx) =>
            building(k, sx, at(sx) + 1, k.rng.range(9, 13), k.rng.range(7, 10), {
              wall: PAL.cream, roof: PAL.luffyRedDeep, windows: 2, chimney: k.rng.bool(0.5),
            }),
          )
        }
        for (const x of spread(k.rng, w, 14, 0.5)) {
          const s = k.rng.range(0.35, 0.8)
          stampRng(k, w, x, 6, (sx) => bushTree(k, sx, at(sx) + 1, s, PAL.grassDeep, k.rng))
        }
      },
    }),
  )
  return layers
}

/** Humped silhouettes sitting exactly on the horizon line. */
function distantIsles(k: Kit, y: number, n: number): void {
  const w = k.s.w
  const c = flatten(k.ramp(k.p.farSilhouette), 0.5)
  for (const x of spread(k.rng, w, n, 0.45)) {
    const iw = k.rng.range(30, 90)
    const ih = k.rng.range(5, 14)
    const pts: Pt[] = []
    const bumps = 3 + k.rng.int(0, 2)
    for (let i = 0; i <= bumps; i++) {
      const t = i / bumps
      pts.push([x - iw / 2 + t * iw, y - Math.sin(t * Math.PI) * ih * k.rng.range(0.5, 1.15)])
    }
    pts.push([x + iw / 2, y + 2], [x - iw / 2, y + 2])
    stampRng(k, w, x, iw, (sx) => {
      k.ctx.save()
      k.ctx.translate(sx - x, 0)
      k.ctx.fillStyle = c.core
      k.ctx.fill(blob(pts, 0.9))
      k.ctx.restore()
    })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Alabasta
// ─────────────────────────────────────────────────────────────────────────────

function alabasta(p: BiomePalette): ParallaxLayer[] {
  const layers: ParallaxLayer[] = []
  layers.push(skyLayer('alabasta', p, { disc: 30, sunY: 0.58, glow: 150, discColor: PAL.ember, horizonGlow: 0.5 }))
  layers.push(
    cloudLayer('ab-dust', p, {
      w: 860, h: 74, y: 14, factor: 0.07, drift: -1.6, depth: 0.78,
      count: 5, size: [90, 190], wisps: 10, alpha: 0.5, tint: PAL.sand, fog: true,
    }),
  )

  // The capital: domes, minarets and a curtain wall on the far dune line.
  layers.push(
    landLayer('ab-far', p, {
      w: 800, h: 100, y: 110, factor: 0.16, depth: 0.62, base: PAL.sand,
      baseY: 32, amp: 19, ks: [1, 2, 3, 5, 8],
      decorate: (k, at) => {
        const w = k.s.w
        const cx = w * 0.36
        stampRng(k, w, cx, 70, (sx) => {
          // The curtain wall follows the dune it is built on, and its towers
          // step along it at uneven intervals.
          const wall = new Path2D()
          wall.moveTo(sx - 46, at(sx - 46) - 8)
          for (let x = -46; x <= 46; x += 2) wall.lineTo(sx + x, at(sx + x) - 8)
          for (let x = 46; x >= -46; x -= 2) wall.lineTo(sx + x, at(sx + x) + 4)
          wall.closePath()
          k.fill(wall, PAL.sandDeep, [sx, at(sx) - 2], 44, { shadow: 0.5 })
          for (const t of [-40, -27, -9, 8, 24, 41]) {
            const th = 5 + ((Math.abs(t) * 5) % 8)
            k.fill(
              roundRectPath(sx + t - 3.4, at(sx + t) - 8 - th, 6.8, th + 2, 0.5),
              PAL.sandDeep,
              [sx + t, at(sx + t) - 10],
              3.4,
            )
          }
          const y = at(sx) - 7
          for (let i = 0; i < 7; i++) {
            const bx = sx - 38 + i * 12.6
            k.fill(
              roundRectPath(bx - 5, y - 4 - (5 + ((i * 7) % 9)), 10, 5 + ((i * 7) % 9), 0.6),
              PAL.sand,
              [bx, y - 8],
              5,
              { light: k.side },
            )
          }
          sandDome(k, sx - 24, y - 12, 0.9)
          sandDome(k, sx + 6, y - 14, 1.25)
          sandDome(k, sx + 32, y - 11, 0.75)
          minaret(k, sx - 40, y - 10, 0.72)
          minaret(k, sx + 22, y - 12, 0.62)
        })
        for (const x of spread(k.rng, w, 3, 0.42)) {
          if (Math.abs(x - cx) < 90) continue
          stampRng(k, w, x, 16, (sx) => sandDome(k, sx, at(sx) + 1, k.rng.range(0.5, 0.8)))
        }
      },
    }),
  )

  // Ruins and the oasis.
  layers.push(
    landLayer('ab-mid', p, {
      w: 760, h: 102, y: 118, factor: 0.3, depth: 0.4, base: PAL.sandDeep,
      baseY: 32, amp: 21, ks: [1, 2, 4, 7, 12],
      decorate: (k, at) => {
        const w = k.s.w
        const rx = w * 0.7
        stampRng(k, w, rx, 44, (sx) => {
          const y = at(sx) + 1
          k.fill(roundRectPath(sx - 28, y - 4, 56, 5, 0.6), PAL.sandDeep, [sx, y - 2], 26)
          const hs = [17, 11, 21, 6, 19]
          for (let i = 0; i < hs.length; i++) {
            ruinColumn(k, sx - 22 + i * 11, y - 4, 0.95, hs[i], i === 2 || i === 4)
          }
          k.fill(roundRectPath(sx - 24, y - 26, 24, 3.4, 0.4), PAL.sand, [sx - 12, y - 24], 12)
        })
        const ox = w * 0.24
        stampRng(k, w, ox, 32, (sx) => {
          const y = at(sx) + 1
          k.ctx.fillStyle = mix(haze(PAL.seaLight, p.fog, k.depth), PAL.sea, 0.2)
          k.ctx.fill(ellipsePath(sx, y, 15, 2.6))
          for (const dx of [-9, -2, 7]) palmTree(k, sx + dx, y - 0.6, k.rng.range(0.5, 0.72), k.rng.range(-0.4, 0.4), k.rng)
        })
        for (const x of spread(k.rng, w, 10, 0.5)) {
          stampRng(k, w, x, 6, (sx) => scrub(k, sx, at(sx) + 1, k.rng.range(0.5, 1), PAL.sandDeep))
        }
      },
    }),
  )

  // Near dune with the caravan and the wind on its face.
  layers.push(
    landLayer('ab-near', p, {
      w: 700, h: 96, y: 128, factor: 0.5, depth: 0.2, base: mix(PAL.sandDeep, PAL.dirt, 0.35),
      baseY: 30, amp: 19, ks: [1, 2, 3, 6, 10], veil: 0.2,
      decorate: (k, at) => {
        const w = k.s.w
        // Wind ripples: arcs that follow the dune face, thinning down the slope.
        k.ctx.save()
        k.ctx.strokeStyle = rgba(k.ramp(PAL.sand).light, 0.34)
        for (let i = 0; i < 26; i++) {
          const x = k.rng.range(0, w)
          const y = at(x) + k.rng.range(3, 26)
          const len = k.rng.range(6, 22)
          k.ctx.lineWidth = k.rng.range(0.25, 0.6)
          k.ctx.beginPath()
          k.ctx.moveTo(x - len / 2, y)
          k.ctx.quadraticCurveTo(x, y - k.rng.range(0.8, 2.4), x + len / 2, y)
          k.ctx.stroke()
        }
        k.ctx.restore()
        const cx = w * 0.28
        stampRng(k, w, cx, 40, (sx) => {
          for (let i = 0; i < 4; i++) {
            const dx = i * 14 + (i % 2) * 3
            camel(k, sx + dx, at(sx + dx) + 1, 0.92, i !== 2)
          }
        })
        stampRng(k, w, w * 0.74, 30, (sx) => {
          for (let i = 0; i < 2; i++) camel(k, sx + i * 15, at(sx + i * 15) + 1, 0.8, i === 0)
        })
        for (const x of spread(k.rng, w, 12, 0.5)) {
          stampRng(k, w, x, 6, (sx) => scrub(k, sx, at(sx) + 1, k.rng.range(0.6, 1.2), PAL.dirtDeep))
        }
      },
    }),
  )

  // The storm itself: long streaks of grit crossing the whole frame.
  layers.push(
    propLayer('ab-storm', p, {
      w: 900, h: 130, y: 100, factor: 0.09, depth: 0.5, autoScroll: -26, alpha: 0.42,
      draw: (k) => {
        const w = k.s.w
        const c = mix(PAL.sand, p.fog, 0.3)
        for (let i = 0; i < 46; i++) {
          const x = k.rng.range(0, w)
          const y = k.rng.range(6, 124)
          const len = k.rng.range(40, 190)
          k.ctx.save()
          k.ctx.globalAlpha = k.rng.range(0.1, 0.42)
          k.ctx.fillStyle = c
          stampRng(k, w, x, len, (sx) => k.ctx.fill(ellipsePath(sx, y, len * 0.5, k.rng.range(0.7, 3.4))))
          k.ctx.restore()
        }
      },
    }),
  )
  layers.push(groundHaze(p, { y: GAME_H - 86, h: 86, factor: 0.62, strength: 0.26 }))
  return layers
}

/** A dry tuft — a handful of blades, never the same twice. */
function scrub(k: Kit, x: number, y: number, s: number, color: string): void {
  const { ctx } = k
  ctx.save()
  ctx.strokeStyle = k.ramp(color).core
  ctx.lineCap = 'round'
  const n = 3 + k.rng.int(0, 3)
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + k.rng.range(-0.8, 0.8)
    const len = k.rng.range(2, 5) * s
    ctx.lineWidth = k.rng.range(0.3, 0.6) * s
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.7, x + Math.cos(a) * len * 1.3, y + Math.sin(a) * len)
    ctx.stroke()
  }
  ctx.restore()
}

// ─────────────────────────────────────────────────────────────────────────────
// Skypiea
// ─────────────────────────────────────────────────────────────────────────────

/** An ocean of cumulus seen from above: a rolling surface, not a flat fill. */
function cloudSea(k: Kit, o: { y: number; amp: number; bottom: number; count: number; size: [number, number] }): void {
  const { ctx } = k
  const w = k.s.w
  const body = mix(PAL.white, k.p.fog, 0.06 + k.depth * 0.3)
  const c = flatten(
    {
      light: mix(body, k.p.sunTint, 0.4),
      core: body,
      shade: mix(body, k.p.ambient, 0.4),
      deep: mix(body, k.p.ambient, 0.6),
      line: mix(body, k.p.ambient, 0.5),
    },
    k.depth * 0.4,
  )
  const prof = wave(k.rng, [1, 2, 3, 5])
  const surf = (x: number) => o.y - prof((((x % w) + w) % w) / w) * o.amp
  const path = new Path2D()
  path.moveTo(0, surf(0))
  for (let x = 1; x <= w; x++) path.lineTo(x, surf(x))
  path.lineTo(w, o.bottom)
  path.lineTo(0, o.bottom)
  path.closePath()
  const g = ctx.createLinearGradient(0, o.y - o.amp, 0, o.bottom)
  g.addColorStop(0, c.core)
  g.addColorStop(1, c.shade)
  ctx.fillStyle = g
  ctx.fill(path)
  for (const x of spread(k.rng, w, o.count, 0.48)) {
    const cw = k.rng.range(o.size[0], o.size[1])
    const ch = cw * k.rng.range(0.24, 0.38)
    const cy = surf(x) + ch * 0.1
    const lumpSeed = seedFrom(`cs${x.toFixed(2)}`)
    stampRng(k, w, x, cw, (sx) => cloudMass(ctx, new Rng(lumpSeed), k.key, sx, cy, cw, ch, c))
  }
}

function skypiea(p: BiomePalette): ParallaxLayer[] {
  const layers: ParallaxLayer[] = []
  layers.push(skyLayer('skypiea', p, { glow: 140, horizonGlow: 0.14 }))

  // Sunbeams. Additive and slow: light, not geometry.
  layers.push(
    propLayer('sk-beams', p, {
      w: 860, h: GAME_H, y: 0, factor: 0.05, depth: 0.5, autoScroll: -0.7,
      alpha: 0.24, blend: 'lighter',
      draw: (k) => {
        const w = k.s.w
        const slant = p.lightDirX < 0 ? 0.55 : -0.55
        for (let i = 0; i < 9; i++) {
          const x = (i + k.rng.range(-0.3, 0.3)) * (w / 9)
          const bw = k.rng.range(7, 26)
          const len = GAME_H * k.rng.range(0.7, 1.05)
          stampRng(k, w, x, bw * 3 + len, (sx) => {
            const beam = new Path2D()
            beam.moveTo(sx - bw * 0.4, 0)
            beam.lineTo(sx + bw * 0.4, 0)
            beam.lineTo(sx + bw * 1.5 + slant * len, len)
            beam.lineTo(sx - bw * 1.5 + slant * len, len)
            beam.closePath()
            const g = k.ctx.createLinearGradient(0, 0, 0, len)
            g.addColorStop(0, rgba(p.sunTint, 0.5))
            g.addColorStop(1, rgba(p.sunTint, 0))
            k.ctx.fillStyle = g
            k.ctx.fill(beam)
          })
        }
      },
    }),
  )

  layers.push(
    propLayer('sk-sea', p, {
      w: 820, h: 104, y: 116, factor: 0.14, depth: 0.6,
      draw: (k) => cloudSea(k, { y: 26, amp: 15, bottom: 104, count: 15, size: [30, 76] }),
    }),
  )

  // The beanstalk: one colossal column per strip, climbing out of frame.
  layers.push(
    propLayer('sk-stalk', p, {
      w: 720, h: 200, y: 0, factor: 0.2, depth: 0.5,
      draw: (k) => {
        const w = k.s.w
        const bx = w * 0.7
        stampRng(k, w, bx, 46, (sx) => {
          const c = k.ramp(PAL.zoroGreen)
          // A stalk with a lean and a taper, not a pipe: the width comes off
          // toward the top and the whole column drifts as it climbs.
          const lean = (y: number) => Math.sin((y / 200) * 2.1 + 0.7) * 9
          const rad = (y: number) => 3.4 + (y / 200) * 3.6
          const stalk = new Path2D()
          stalk.moveTo(sx + lean(200) - rad(200), 200)
          for (let y = 200; y >= 0; y -= 6) stalk.lineTo(sx + lean(y) - rad(y), y)
          for (let y = 0; y <= 200; y += 6) stalk.lineTo(sx + lean(y) + rad(y), y)
          stalk.closePath()
          k.fill(stalk, c, [sx, 100], 8, { shadow: 0.52 })
          // A vine winding round it. The pitch and the sweep of each visible
          // turn vary, or the run of arcs reads as the nodes of a bamboo cane.
          k.ctx.save()
          k.ctx.strokeStyle = mix(k.ramp(PAL.usoppBrown).shade, k.ramp(PAL.zoroGreen).deep, 0.45)
          k.ctx.lineCap = 'round'
          let vy = 6
          while (vy < 200) {
            const step = 17 + k.rng.range(0, 16)
            const sweep = k.rng.range(0.15, 0.5)
            k.ctx.lineWidth = k.rng.range(0.9, 1.7)
            k.ctx.beginPath()
            k.ctx.ellipse(sx + lean(vy), vy, rad(vy) + k.rng.range(1, 2.6), step * 0.42, 0, sweep, Math.PI - sweep)
            k.ctx.stroke()
            // A tendril curling off the turn now and then.
            if (k.rng.bool(0.4)) {
              const dir = k.rng.bool() ? 1 : -1
              k.ctx.lineWidth = 0.7
              k.ctx.beginPath()
              k.ctx.moveTo(sx + lean(vy) + dir * rad(vy), vy + step * 0.2)
              k.ctx.quadraticCurveTo(
                sx + lean(vy) + dir * (rad(vy) + 9),
                vy + step * 0.1,
                sx + lean(vy) + dir * (rad(vy) + 6),
                vy - step * 0.3,
              )
              k.ctx.stroke()
            }
            vy += step
          }
          k.ctx.restore()
          for (let i = 0; i < 7; i++) {
            const y = 14 + i * 26 + k.rng.range(-6, 6)
            const dir = i % 2 === 0 ? 1 : -1
            const bx = sx + Math.sin((y / 200) * 2.1 + 0.7) * 9
            const L = k.rng.range(24, 38)
            const droop = k.rng.range(2, 9)
            const leaf = new Path2D()
            leaf.moveTo(bx + dir * 4, y)
            leaf.quadraticCurveTo(bx + dir * L * 0.5, y - L * 0.34, bx + dir * L, y + droop * 0.3)
            leaf.quadraticCurveTo(bx + dir * L * 0.5, y + droop, bx + dir * 4, y + 2)
            leaf.closePath()
            k.fill(leaf, c, [bx + dir * L * 0.5, y], L * 0.4, { shadow: 0.46, line: 0 })
          }
        })
      },
    }),
  )

  // Islands adrift, water pouring off the edge into nothing.
  layers.push(
    propLayer('sk-isles', p, {
      w: 780, h: 150, y: 18, factor: 0.3, depth: 0.4, bob: 2.2, bobSpeed: 0.3,
      draw: (k) => {
        const w = k.s.w
        const slots: Array<[number, number, number]> = [
          [0.14, 34, 44],
          [0.42, 78, 72],
          [0.68, 40, 34],
          [0.88, 92, 54],
        ]
        for (const [t, y, iw] of slots) {
          stampRng(k, w, t * w, iw, (sx) =>
            skyIsland(k, sx, y, iw, {
              fall: k.rng.bool(0.7) ? k.rng.range(-0.24, 0.24) : 0,
              onTop: (tx, ty) => {
                for (let i = 0; i < 3; i++) {
                  bushTree(k, tx + k.rng.range(-iw * 0.3, iw * 0.3), ty + 2, k.rng.range(0.5, 0.9), PAL.grassDeep, k.rng)
                }
              },
            }),
          )
        }
      },
    }),
  )

  // The golden bell, hanging in what is left of its shrine.
  layers.push(
    propLayer('sk-bell', p, {
      w: 700, h: 140, y: 44, factor: 0.44, depth: 0.2, bob: 1.6, bobSpeed: 0.5,
      draw: (k) => {
        const w = k.s.w
        stampRng(k, w, w * 0.3, 70, (sx) =>
          skyIsland(k, sx, 70, 108, {
            fall: 0.3,
            onTop: (tx, ty) => {
              const y = ty + 3
              for (const dx of [-26, -12, 20]) ruinColumn(k, tx + dx, y, 1, k.rng.range(9, 20), k.rng.bool(0.5))
              // Frame and bell.
              k.fill(roundRectPath(tx - 2, y - 26, 4, 26, 0.6), PAL.rock, [tx, y - 13], 3)
              k.fill(roundRectPath(tx + 16, y - 26, 4, 26, 0.6), PAL.rock, [tx + 18, y - 13], 3)
              k.fill(roundRectPath(tx - 5, y - 29, 28, 3.6, 0.5), PAL.wood, [tx + 9, y - 27], 12)
              const bell = blob(
                [
                  [tx + 2, y - 8],
                  [tx + 2.6, y - 17],
                  [tx + 9, y - 22],
                  [tx + 15.4, y - 17],
                  [tx + 16, y - 8],
                  [tx + 9, y - 6.4],
                ] as Pt[],
                0.85,
              )
              k.fill(bell, PAL.gold, [tx + 9, y - 14], 7, { shadow: 0.44, rim: 0.7, rimColor: PAL.cream })
              glint(k.ctx, tx + 5.4, y - 16, 1.5, 2.6, -0.5, PAL.cream, 0.75)
            },
          }),
        )
        stampRng(k, w, w * 0.76, 40, (sx) => skyIsland(k, sx, 96, 56, { fall: -0.2 }))
      },
    }),
  )

  layers.push(
    propLayer('sk-near', p, {
      w: 700, h: 84, y: 146, factor: 0.62, depth: 0.12, autoScroll: -5, alpha: 0.94,
      draw: (k) => cloudSea(k, { y: 24, amp: 14, bottom: 84, count: 10, size: [44, 104] }),
    }),
  )
  return layers
}

// ─────────────────────────────────────────────────────────────────────────────
// Water 7
// ─────────────────────────────────────────────────────────────────────────────

function water7(p: BiomePalette): ParallaxLayer[] {
  const layers: ParallaxLayer[] = []
  const RAIL_Y = 138 // screen y of the top of the sea-train rails

  layers.push(skyLayer('water7', p, { horizonGlow: 0.16 }))
  layers.push(
    cloudLayer('w7-cloud', p, {
      w: 820, h: 82, y: 4, factor: 0.1, drift: -2.4, depth: 0.6,
      count: 5, size: [38, 76], wisps: 6, gulls: 4,
    }),
  )

  // Sea, far coast and the trestle the train runs out on.
  layers.push(
    propLayer('w7-sea', p, {
      w: 820, h: 112, y: 102, factor: 0.2, depth: 0.5,
      draw: (k) => {
        const horizon = 22
        distantIsles(k, horizon, 3)
        seaBand(k, { top: horizon, bottom: 112, base: PAL.sea, swells: 8, glitterAt: p.lightDirX < 0 ? 0.2 : 0.8 })
        // Piers marching out to sea, each a little shorter than the last.
        const deck = RAIL_Y - 102
        const c = k.ramp(PAL.woodDeep)
        k.ctx.save()
        k.ctx.strokeStyle = c.shade
        for (let i = 0; i < 22; i++) {
          const x = i * (k.s.w / 22) + 4
          k.ctx.lineWidth = 1.4
          k.ctx.beginPath()
          k.ctx.moveTo(x, deck + 2)
          k.ctx.lineTo(x - 1.4, deck + 16)
          k.ctx.moveTo(x, deck + 2)
          k.ctx.lineTo(x + 1.4, deck + 16)
          k.ctx.stroke()
          k.ctx.lineWidth = 0.7
          k.ctx.beginPath()
          k.ctx.moveTo(x - 1, deck + 9)
          k.ctx.lineTo(x + 1, deck + 9)
          k.ctx.stroke()
        }
        k.ctx.restore()
        k.fill(roundRectPath(0, deck - 0.6, k.s.w, 2.4, 0), PAL.woodDeep, [k.s.w / 2, deck], 1.6)
        k.ctx.fillStyle = k.ramp(PAL.steel).light
        k.ctx.fillRect(0, deck - 1.2, k.s.w, 0.6)
      },
    }),
  )

  // The sea train, running.
  layers.push(
    propLayer('w7-train', p, {
      w: 900, h: 46, y: RAIL_Y - 34, factor: 0.2, depth: 0.42, autoScroll: -17,
      draw: (k) => {
        const base = 34
        const x0 = k.s.w * 0.3
        const loco = k.ramp(PAL.marineNavy)
        stampRng(k, k.s.w, x0, 90, (sx) => {
          // Chimney smoke, trailing behind.
          for (let i = 0; i < 9; i++) {
            puff(k, sx - 4 - i * 7 - k.rng.range(0, 4), base - 20 - i * 1.6, 4 + i * 1.3, PAL.mist, 0.3 - i * 0.03)
          }
          k.fill(roundRectPath(sx - 14, base - 13, 30, 11, 1.6), loco, [sx, base - 8], 7)
          k.fill(roundRectPath(sx + 6, base - 19, 11, 7, 1.2), loco, [sx + 11, base - 16], 5)
          k.fill(roundRectPath(sx - 12, base - 20, 5, 8, 0.8), PAL.rockDeep, [sx - 10, base - 16], 3)
          k.ctx.fillStyle = k.ramp(PAL.strawGold).core
          k.ctx.fill(ellipsePath(sx - 13, base - 8, 1.6, 1.6))
          for (let c = 0; c < 3; c++) {
            const cx = sx + 20 + c * 24
            k.fill(roundRectPath(cx, base - 14, 21, 12, 1.4), PAL.cream, [cx + 10, base - 8], 7)
            k.ctx.fillStyle = k.ramp(PAL.marineBlue).core
            for (let win = 0; win < 3; win++) k.ctx.fill(roundRectPath(cx + 2.6 + win * 6, base - 11.6, 4, 4, 0.6))
          }
          k.ctx.fillStyle = k.ramp(PAL.rockDeep).deep
          for (let wl = 0; wl < 10; wl++) k.ctx.fill(ellipsePath(sx - 10 + wl * 9.4, base - 1.4, 1.5, 1.5))
        })
      },
    }),
  )

  // Canal houses stacked on the rock, with the aqueduct behind them.
  layers.push(
    landLayer('w7-city', p, {
      w: 780, h: 112, y: 94, factor: 0.34, depth: 0.34, base: mix(PAL.rock, PAL.sandDeep, 0.55),
      baseY: 44, amp: 20, ks: [1, 2, 4, 6, 10],
      decorate: (k, at) => {
        const w = k.s.w
        terraces(k, at, 4, 13)
        // Aqueduct: arches that vary in span so the row never reads as a grid.
        const ax = w * 0.18
        stampRng(k, w, ax, 110, (sx) => {
          const y = at(sx) - 16
          let x = sx - 96
          while (x < sx + 96) {
            const span = k.rng.range(13, 20)
            const arch = new Path2D()
            arch.moveTo(x, y)
            arch.lineTo(x, y - 9)
            arch.arc(x + span / 2, y - 9, span / 2, Math.PI, 0)
            arch.lineTo(x + span, y)
            arch.lineTo(x + span - 2.4, y)
            arch.lineTo(x + span - 2.4, y - 9.6)
            arch.arc(x + span / 2, y - 9.6, span / 2 - 2.4, 0, Math.PI, true)
            arch.lineTo(x + 2.4, y)
            arch.closePath()
            k.fill(arch, PAL.sandDeep, [x + span / 2, y - 8], span * 0.5, { shadow: 0.5 })
            x += span
          }
          // Close both ends on a pier, so the run never stops mid-arch.
          for (const ex of [sx - 96, x]) {
            k.fill(roundRectPath(ex - 2.4, y - 20, 4.8, 20, 0.4), PAL.sandDeep, [ex, y - 10], 2.4)
          }
          k.fill(roundRectPath(sx - 98, y - 20, 196, 4.4, 0.5), PAL.sand, [sx, y - 18], 40)
        })
        // Houses stacked in tiers up the rock.
        for (const x of spread(k.rng, w, 11, 0.46)) {
          const tiers = 1 + k.rng.int(0, 2)
          stampRng(k, w, x, 16, (sx) => {
            let y = at(sx) + 1
            for (let t = 0; t < tiers; t++) {
              const bw = k.rng.range(9, 15) - t * 1.4
              const bh = k.rng.range(8, 13)
              building(k, sx + k.rng.range(-2, 2), y, bw, bh, {
                wall: k.rng.pick([PAL.cream, PAL.sanjiGold, PAL.mist]),
                roof: k.rng.pick([PAL.bloodOrange, PAL.luffyRedDeep, PAL.namiOrange]),
                windows: 2,
                chimney: k.rng.bool(0.4),
              })
              y -= bh + k.rng.range(1, 3)
            }
          })
        }
      },
    }),
  )

  // Shipyard on the near bank.
  layers.push(
    landLayer('w7-yard', p, {
      w: 720, h: 100, y: 120, factor: 0.5, depth: 0.16, base: mix(PAL.rockDeep, PAL.woodDeep, 0.5),
      baseY: 26, amp: 12, ks: [1, 3, 5, 9], veil: 0.18,
      decorate: (k, at) => {
        const w = k.s.w
        terraces(k, at, 3, 11)
        stampRng(k, w, w * 0.24, 50, (sx) => halfHull(k, sx, at(sx) + 1, 1.5))
        stampRng(k, w, w * 0.72, 40, (sx) => halfHull(k, sx, at(sx) + 1, 1.05))
        stampRng(k, w, w * 0.12, 34, (sx) => crane(k, sx, at(sx) + 1, 1.25, 1))
        stampRng(k, w, w * 0.56, 34, (sx) => crane(k, sx, at(sx) + 1, 1.05, -1))
        for (const x of spread(k.rng, w, 5, 0.42)) {
          if (!k.rng.bool(0.7)) continue
          stampRng(k, w, x, 14, (sx) =>
            building(k, sx, at(sx) + 1, k.rng.range(12, 18), k.rng.range(7, 11), {
              wall: PAL.woodLight, roof: PAL.rockDeep, pitch: 0.3, windows: 3,
            }),
          )
        }
        for (let i = 0; i < 7; i++) {
          const x = k.rng.range(0, w)
          stampRng(k, w, x, 14, (sx) => puff(k, sx, at(sx) - k.rng.range(4, 16), k.rng.range(6, 14), PAL.mist, 0.24))
        }
      },
    }),
  )

  // Canal water in front, carrying the city's reflection.
  layers.push(
    propLayer('w7-canal', p, {
      w: 700, h: 50, y: 152, factor: 0.66, depth: 0.06, autoScroll: -3.4,
      draw: (k) => {
        const w = k.s.w
        seaBand(k, { top: 0, bottom: 50, base: mix(PAL.sea, PAL.slate, 0.3), swells: 6 })
        // Reflections: broken vertical streaks of the warm lights above.
        const wobble = wave(k.rng, [3, 5, 9])
        k.ctx.save()
        k.ctx.globalCompositeOperation = 'lighter'
        for (let i = 0; i < 22; i++) {
          const x = k.rng.range(0, w)
          const len = k.rng.range(12, 40)
          const wide = k.rng.range(1.1, 2.8)
          const warm = k.rng.bool(0.55)
          for (let y = 0; y < len; y += 1) {
            k.ctx.globalAlpha = (1 - y / len) * (warm ? 0.1 : 0.06)
            k.ctx.fillStyle = warm ? PAL.strawGold : PAL.foam
            k.ctx.fill(
              ellipsePath(x + wobble((x * 0.3 + y * 3) / w) * 2.6, y, wide * (1 + y / len), 0.9),
            )
          }
        }
        k.ctx.restore()
        surfLine(k, 4, 1.6, 0.3)
      },
    }),
  )
  return layers
}

// ─────────────────────────────────────────────────────────────────────────────
// Thriller Bark
// ─────────────────────────────────────────────────────────────────────────────

/** A tower with a spire — the vertical accent a gothic roofline needs. */
function spire(k: Kit, x: number, y: number, w: number, h: number, wall: string, roof: string): void {
  k.fill(roundRectPath(x - w / 2, y - h, w, h, 0.6), wall, [x, y - h * 0.5], w * 0.5, {
    shadow: 0.55,
    light: k.side,
  })
  const top = new Path2D()
  top.moveTo(x - w * 0.72, y - h)
  top.lineTo(x, y - h - w * 1.9)
  top.lineTo(x + w * 0.72, y - h)
  top.closePath()
  k.fill(top, roof, [x, y - h - w * 0.6], w * 0.6, { shadow: 0.5 })
  k.ctx.fillStyle = k.ramp(PAL.strawGold).core
  k.ctx.fill(roundRectPath(x - w * 0.22, y - h * 0.62, w * 0.44, h * 0.24, 0.4))
}

function mansion(k: Kit, x: number, y: number, s: number): void {
  const wall = PAL.inkSoft
  const roof = PAL.shadow
  building(k, x - 26 * s, y, 20 * s, 15 * s, { wall, roof, pitch: 0.9, windows: 2, lit: PAL.ember })
  building(k, x + 25 * s, y, 18 * s, 18 * s, { wall, roof, pitch: 0.9, windows: 2, lit: PAL.ember })
  building(k, x, y, 34 * s, 24 * s, { wall, roof, pitch: 1.05, windows: 4, lit: PAL.ember, chimney: true })
  spire(k, x - 17 * s, y, 7 * s, 30 * s, wall, roof)
  spire(k, x + 15 * s, y, 6 * s, 34 * s, wall, roof)
  // A window under the main gable, lit like an eye.
  k.ctx.fillStyle = mix(PAL.ember, k.p.fog, k.depth * 0.5)
  k.ctx.fill(ellipsePath(x, y - 27 * s, 2.6 * s, 2.6 * s))
}

function thrillerBark(p: BiomePalette): ParallaxLayer[] {
  const layers: ParallaxLayer[] = []
  layers.push(skyLayer('thriller-bark', p, { disc: 21, sunY: 0.2, glow: 74, halo: 62 }))

  // A storm cell crossing the sky. It takes the better part of a minute to
  // pass, which is what makes it read as weather instead of a strobe.
  layers.push(
    propLayer('tb-storm', p, {
      w: 900, h: 150, y: 0, factor: 0.03, depth: 0.5, autoScroll: -18, alpha: 0.5, blend: 'lighter',
      draw: (k) => {
        const cx = k.s.w * 0.2
        radialFill(k.ctx, cx, 46, 0, 118, [
          [0, rgba(PAL.magic, 0.4)],
          [0.42, rgba(PAL.magic, 0.13)],
          [1, rgba(PAL.magic, 0)],
        ])
        k.ctx.save()
        k.ctx.strokeStyle = rgba(PAL.cream, 0.16)
        k.ctx.lineCap = 'round'
        const bolt = (bx: number, by: number, len: number, wdt: number, d: number) => {
          let px = bx
          let py = by
          k.ctx.lineWidth = wdt
          k.ctx.beginPath()
          k.ctx.moveTo(px, py)
          for (let i = 0; i < 5; i++) {
            px += k.rng.range(-7, 7)
            py += len / 5
            k.ctx.lineTo(px, py)
          }
          k.ctx.stroke()
          if (d > 0 && k.rng.bool(0.8)) bolt(px, py - len * 0.4, len * 0.5, wdt * 0.55, d - 1)
        }
        bolt(cx - 6, 4, 58, 1.1, 2)
        bolt(cx + 22, 10, 40, 0.8, 1)
        k.ctx.restore()
      },
    }),
  )

  layers.push(
    cloudLayer('tb-fogfar', p, {
      w: 820, h: 92, y: 80, factor: 0.12, drift: -2.2, depth: 0.66,
      count: 6, size: [120, 240], wisps: 14, alpha: 0.5, tint: PAL.mist, fog: true,
    }),
  )

  // The mansion on the far ridge, in a wood of dead trees.
  layers.push(
    landLayer('tb-far', p, {
      w: 800, h: 116, y: 94, factor: 0.3, depth: 0.44, base: PAL.night,
      baseY: 38, amp: 21, ks: [1, 2, 3, 6, 10], lip: 0.4,
      decorate: (k, at) => {
        const w = k.s.w
        stampRng(k, w, w * 0.44, 78, (sx) => mansion(k, sx, at(sx) + 1, 1.15))
        for (const x of spread(k.rng, w, 9, 0.5)) {
          if (Math.abs(x - w * 0.44) < 46) continue
          stampRng(k, w, x, 14, (sx) =>
            bareTree(k, sx, at(sx) + 1, k.rng.range(22, 38), k.rng, mix(haze(PAL.ink, p.fog, 0.44), p.fog, 0.1)),
          )
        }
      },
    }),
  )

  // Near wood: bigger, more warped, darker.
  layers.push(
    landLayer('tb-near', p, {
      w: 740, h: 118, y: 110, factor: 0.5, depth: 0.24, base: p.groundDeep,
      baseY: 32, amp: 17, ks: [1, 3, 5, 9], lip: 0.35, veil: 0.2,
      decorate: (k, at) => {
        const w = k.s.w
        for (const x of spread(k.rng, w, 7, 0.48)) {
          stampRng(k, w, x, 26, (sx) => bareTree(k, sx, at(sx) + 1, k.rng.range(38, 62), k.rng, k.ramp(PAL.ink).core))
        }
        for (const x of spread(k.rng, w, 6, 0.5)) {
          stampRng(k, w, x, 8, (sx) => gravestone(k, sx, at(sx) + 1, k.rng.range(0.7, 1.1), k.rng.range(-0.2, 0.2)))
        }
      },
    }),
  )

  // The graveyard proper, with its iron railing.
  layers.push(
    landLayer('tb-graves', p, {
      w: 700, h: 92, y: 132, factor: 0.68, depth: 0.12, base: p.groundDeep,
      baseY: 28, amp: 12, ks: [1, 3, 6, 11], lip: 0.35, veil: 0.16,
      decorate: (k, at) => {
        const w = k.s.w
        k.ctx.save()
        k.ctx.strokeStyle = k.ramp(PAL.ink).core
        for (const x of spread(k.rng, w, 26, 0.48)) {
          const h = k.rng.range(5, 9)
          k.ctx.lineWidth = k.rng.range(0.5, 0.9)
          k.ctx.beginPath()
          k.ctx.moveTo(x, at(x) + 2)
          k.ctx.lineTo(x + k.rng.range(-0.6, 0.6), at(x) - h)
          k.ctx.stroke()
        }
        k.ctx.restore()
        for (const x of spread(k.rng, w, 7, 0.46)) {
          stampRng(k, w, x, 8, (sx) => gravestone(k, sx, at(sx) + 1, k.rng.range(1, 1.5), k.rng.range(-0.24, 0.24)))
        }
      },
    }),
  )

  layers.push(
    cloudLayer('tb-fognear', p, {
      w: 700, h: 76, y: 142, factor: 0.8, drift: -5.5, depth: 0.3,
      count: 5, size: [150, 260], wisps: 16, alpha: 0.42, tint: PAL.mist, fog: true,
    }),
  )
  return layers
}

// ─────────────────────────────────────────────────────────────────────────────
// Wano
// ─────────────────────────────────────────────────────────────────────────────

/** A blossom tree: dark boughs under clouds of petals. */
function blossomTree(k: Kit, x: number, y: number, s: number, rng: Rng): void {
  bareTree(k, x, y, 13 * s, rng, k.ramp(PAL.woodDeep).core)
  const crown = new Path2D()
  for (let i = 0; i < 5; i++) {
    crown.addPath(
      ellipsePath(x + rng.range(-5, 5) * s, y - rng.range(8, 14) * s, rng.range(2.6, 5) * s, rng.range(2, 3.6) * s),
    )
  }
  k.fill(crown, PAL.chopperPink, [x, y - 11 * s], 5 * s, { shadow: 0.4, line: 0 })
}

/** A paper lantern on a pole, glowing. */
function lanternPole(k: Kit, x: number, y: number, s: number): void {
  const h = 12 * s
  k.fill(roundRectPath(x - 0.5 * s, y - h, s, h, 0.3), PAL.woodDeep, [x, y - h * 0.5], s)
  const lamp = mix(PAL.namiOrange, PAL.strawGold, 0.4)
  k.ctx.save()
  k.ctx.globalCompositeOperation = 'lighter'
  radialFill(k.ctx, x + 1.6 * s, y - h + 2 * s, 0, 9 * s, [
    [0, rgba(lamp, 0.34)],
    [1, rgba(lamp, 0)],
  ])
  k.ctx.restore()
  k.ctx.fillStyle = lamp
  k.ctx.fill(ellipsePath(x + 1.6 * s, y - h + 2 * s, 1.5 * s, 2.1 * s))
  k.ctx.strokeStyle = k.ramp(PAL.luffyRedDeep).core
  k.ctx.lineWidth = 0.3 * s
  k.ctx.stroke(ellipsePath(x + 1.6 * s, y - h + 2 * s, 1.5 * s, 2.1 * s))
}

function wano(p: BiomePalette): ParallaxLayer[] {
  const layers: ParallaxLayer[] = []
  layers.push(skyLayer('wano', p, { disc: 32, sunY: 0.32, glow: 128, discColor: PAL.bloodOrange, horizonGlow: 0.26 }))

  // Ink-wash peaks, cusped rather than rolling, with the volcano among them.
  const peaks = wave(new Rng(seedFrom('wano-peaks')), [1, 2, 3, 5, 9])
  layers.push(
    landLayer('wn-far', p, {
      w: 820, h: 130, y: 80, factor: 0.12, depth: 0.82, base: p.farSilhouette,
      baseY: 52, amp: 30, lip: 0.7, foot: 0.5,
      profile: (t) => 1 - 2 * Math.abs(peaks(t)),
      decorate: (k, at) => {
        const w = k.s.w
        const vx = w * 0.28
        stampRng(k, w, vx, 76, (sx) => {
          const y = at(sx) + 26
          const cone = new Path2D()
          cone.moveTo(sx - 62, y)
          cone.quadraticCurveTo(sx - 22, y - 34, sx - 8, y - 52)
          cone.lineTo(sx + 9, y - 52)
          cone.quadraticCurveTo(sx + 24, y - 32, sx + 64, y)
          cone.closePath()
          k.fill(cone, mix(p.midSilhouette, PAL.ink, 0.2), [sx, y - 26], 34, { shadow: 0.46 })
          k.ctx.fillStyle = rgba(PAL.bloodOrange, 0.5)
          k.ctx.fill(roundRectPath(sx - 8, y - 53, 17, 2.4, 0.6))
          for (let i = 0; i < 9; i++) {
            puff(k, sx + k.rng.range(-9, 9) + i * 1.6, y - 56 - i * 6.5, 5 + i * 2.2, PAL.mist, 0.2 - i * 0.016)
          }
        })
        // Ink-wash: bands of mist lying in the folds of the range.
        k.ctx.save()
        k.ctx.globalAlpha = 0.3
        k.ctx.fillStyle = p.fog
        for (let i = 0; i < 9; i++) {
          const y = k.rng.range(40, 120)
          const hh = k.rng.range(1.4, 4)
          k.ctx.fill(ellipsePath(k.rng.range(0, w), y, k.rng.range(60, 200), hh))
        }
        k.ctx.restore()
      },
    }),
  )

  layers.push(
    cloudLayer('wn-mist', p, {
      w: 800, h: 78, y: 110, factor: 0.18, drift: -1.8, depth: 0.58,
      count: 6, size: [130, 250], wisps: 12, alpha: 0.46, tint: PAL.cream, fog: true,
    }),
  )

  // Mid ridge: pagoda roofs and a torii on the skyline.
  const ridge = wave(new Rng(seedFrom('wano-ridge')), [1, 2, 4, 7])
  layers.push(
    landLayer('wn-mid', p, {
      w: 780, h: 120, y: 100, factor: 0.3, depth: 0.3, base: p.midSilhouette,
      baseY: 40, amp: 18, lip: 0.8,
      profile: (t) => 1 - 2 * Math.abs(ridge(t)),
      decorate: (k, at) => {
        const w = k.s.w
        stampRng(k, w, w * 0.62, 30, (sx) => {
          const y = at(sx) + 1
          k.fill(roundRectPath(sx - 8, y - 15, 16, 15, 0.8), PAL.woodDeep, [sx, y - 8], 8, { light: k.side })
          pagodaRoof(k, sx, y - 15, 26, PAL.luffyRedDeep)
          pagodaRoof(k, sx, y - 24, 20, PAL.luffyRedDeep)
          pagodaRoof(k, sx, y - 32, 14, PAL.luffyRedDeep)
        })
        stampRng(k, w, w * 0.24, 22, (sx) => torii(k, sx, at(sx) + 1, 0.9, PAL.luffyRed))
        for (const x of spread(k.rng, w, 7, 0.5)) {
          if (Math.abs(x - w * 0.62) < 34) continue
          stampRng(k, w, x, 12, (sx) => {
            const y = at(sx) + 1
            k.fill(roundRectPath(sx - 5, y - 8, 10, 8, 0.6), PAL.woodDeep, [sx, y - 4], 5, { light: k.side })
            pagodaRoof(k, sx, y - 8, k.rng.range(13, 19), PAL.rockDeep)
          })
        }
        for (const x of spread(k.rng, w, 8, 0.5)) {
          stampRng(k, w, x, 10, (sx) => blossomTree(k, sx, at(sx) + 1, k.rng.range(0.5, 0.8), k.rng))
        }
      },
    }),
  )

  // The lantern-lit street below.
  layers.push(
    landLayer('wn-town', p, {
      w: 720, h: 108, y: 122, factor: 0.5, depth: 0.18, base: p.groundDeep,
      baseY: 28, amp: 14, ks: [1, 3, 6, 10], veil: 0.2,
      decorate: (k, at) => {
        const w = k.s.w
        for (const x of spread(k.rng, w, 8, 0.44)) {
          stampRng(k, w, x, 16, (sx) => {
            const y = at(sx) + 1
            const bw = k.rng.range(13, 20)
            const bh = k.rng.range(9, 14)
            k.fill(roundRectPath(sx - bw / 2, y - bh, bw, bh, 0.8), PAL.woodLight, [sx, y - bh / 2], bw * 0.5, {
              shadow: 0.5,
              light: k.side,
            })
            k.ctx.fillStyle = mix(PAL.strawGold, p.fog, 0.2)
            for (let i = 0; i < 2; i++) k.ctx.fill(roundRectPath(sx - bw * 0.3 + i * bw * 0.36, y - bh * 0.72, bw * 0.22, bh * 0.3, 0.3))
            pagodaRoof(k, sx, y - bh, bw * 1.25, PAL.rockDeep)
          })
        }
        for (const x of spread(k.rng, w, 6, 0.46)) {
          stampRng(k, w, x, 10, (sx) => lanternPole(k, sx, at(sx) + 1, k.rng.range(0.9, 1.3)))
        }
        for (const x of spread(k.rng, w, 5, 0.48)) {
          stampRng(k, w, x, 14, (sx) => blossomTree(k, sx, at(sx) + 1, k.rng.range(0.9, 1.3), k.rng))
        }
      },
    }),
  )

  // Petals on the wind.
  layers.push(
    propLayer('wn-petals', p, {
      w: 700, h: 150, y: 46, factor: 0.6, depth: 0.1, autoScroll: -11, bob: 2.4, bobSpeed: 0.9,
      draw: (k) => {
        const w = k.s.w
        for (let i = 0; i < 90; i++) {
          const x = k.rng.range(0, w)
          const y = k.rng.range(2, 148)
          const s = k.rng.range(0.7, 1.9)
          const rot = k.rng.range(0, TAU)
          k.ctx.save()
          k.ctx.globalAlpha = k.rng.range(0.35, 0.9)
          k.ctx.fillStyle = k.rng.bool(0.6) ? PAL.chopperPink : PAL.cream
          stampRng(k, w, x, 4, (sx) => k.ctx.fill(ellipsePath(sx, y, s, s * k.rng.range(0.35, 0.7), rot)))
          k.ctx.restore()
        }
      },
    }),
  )
  layers.push(groundHaze(p, { y: GAME_H - 80, h: 80, factor: 0.7, strength: 0.34 }))
  return layers
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry points
// ─────────────────────────────────────────────────────────────────────────────

/** Paint the parallax stack behind the world. */
export function buildBackground(biome: Biome): ParallaxLayer[] {
  const p = biomePalette(biome)
  switch (biome) {
    case 'alabasta':
      return alabasta(p)
    case 'skypiea':
      return skypiea(p)
    case 'water7':
      return water7(p)
    case 'thriller-bark':
      return thrillerBark(p)
    case 'wano':
      return wano(p)
    default:
      return eastBlue(p)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Foreground
// ─────────────────────────────────────────────────────────────────────────────

type FgKind =
  | 'frond' | 'tuft' | 'rock' | 'post' | 'rope' | 'bone' | 'cloud'
  | 'vine' | 'crate' | 'branch' | 'picket' | 'stone' | 'bamboo' | 'blossom' | 'lantern'

const FG_KINDS: Record<string, FgKind[]> = {
  'east-blue': ['frond', 'tuft', 'rock', 'post', 'frond', 'tuft', 'rope'],
  alabasta: ['tuft', 'rock', 'frond', 'bone', 'tuft', 'rock'],
  skypiea: ['cloud', 'vine', 'tuft', 'cloud', 'rock'],
  water7: ['post', 'crate', 'rope', 'rock', 'post', 'tuft'],
  'thriller-bark': ['branch', 'picket', 'stone', 'branch', 'tuft', 'rock'],
  wano: ['bamboo', 'blossom', 'lantern', 'tuft', 'branch', 'bamboo'],
}

/**
 * A near-plane silhouette. One flat tone plus a hint of a lit edge: at this
 * distance the eye wants a shape, not a rendering, and anything brighter fights
 * the character for attention.
 */
function fgMotif(
  ctx: CanvasRenderingContext2D,
  kind: FgKind,
  x: number,
  y: number,
  s: number,
  color: string,
  edge: string,
  rng: Rng,
): void {
  ctx.save()
  ctx.fillStyle = color
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const lit = (path: Path2D) => {
    ctx.save()
    ctx.clip(path)
    ctx.strokeStyle = edge
    ctx.lineWidth = 1.1
    ctx.translate(-0.9, -0.9)
    ctx.stroke(path)
    ctx.restore()
  }

  switch (kind) {
    case 'frond': {
      // A palm frond arcing in from the side, leaflets cut along its spine.
      const dir = rng.bool() ? 1 : -1
      const len = 26 * s
      const a0 = -Math.PI * 0.5 + dir * rng.range(0.5, 1.1)
      const tipX = x + Math.cos(a0) * len
      const tipY = y + Math.sin(a0) * len
      ctx.lineWidth = 1.3 * s
      const bend = len * 0.22
      const spine = new Path2D()
      spine.moveTo(x, y)
      spine.quadraticCurveTo(
        x + Math.cos(a0) * len * 0.55,
        y + Math.sin(a0) * len * 0.55 + bend,
        tipX,
        tipY + bend * 1.4,
      )
      ctx.stroke(spine)
      // Leaflets: dense, swept back along the rib and longest at mid-blade. A
      // sparse fan of them reads as a fishbone, not as a leaf.
      const N = 20
      for (let i = 1; i < N; i++) {
        const t = i / N
        const px = x + (tipX - x) * t
        const py = y + (tipY + bend * 1.4 - y) * t - Math.sin(t * Math.PI) * bend * 0.7
        const ll = Math.sin(Math.min(1, t * 1.45) * Math.PI * 0.85) * len * 0.36 + len * 0.05
        for (const side of [-1, 1]) {
          const ax = a0 + side * 1.15 - dir * 0.25
          const ex = px + Math.cos(ax) * ll
          const ey = py + Math.sin(ax) * ll + ll * 0.3
          const leaf = new Path2D()
          leaf.moveTo(px, py - ll * 0.06)
          leaf.quadraticCurveTo((px + ex) / 2, (py + ey) / 2 - ll * 0.16, ex, ey)
          leaf.quadraticCurveTo((px + ex) / 2, (py + ey) / 2 + ll * 0.1, px, py + ll * 0.06)
          leaf.closePath()
          ctx.fill(leaf)
        }
      }
      break
    }
    case 'tuft': {
      const n = 5 + rng.int(0, 5)
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + rng.range(-0.85, 0.85)
        const len = rng.range(7, 17) * s
        ctx.lineWidth = rng.range(0.7, 1.7) * s
        const b = new Path2D()
        b.moveTo(x + rng.range(-2, 2) * s, y)
        b.quadraticCurveTo(x + Math.cos(a) * len * 0.4, y + Math.sin(a) * len * 0.8, x + Math.cos(a) * len * 1.2, y + Math.sin(a) * len)
        ctx.stroke(b)
      }
      break
    }
    case 'rock':
    case 'stone': {
      const w = rng.range(9, 22) * s
      const h = rng.range(5, 13) * s
      const pts: Pt[] = []
      const n = 6 + rng.int(0, 3)
      for (let i = 0; i < n; i++) {
        const a = Math.PI + (i / (n - 1)) * Math.PI
        pts.push([x + Math.cos(a) * w * 0.5 * rng.range(0.8, 1.1), y + Math.sin(a) * h * rng.range(0.75, 1.15)])
      }
      pts.push([x + w * 0.5, y + 3], [x - w * 0.5, y + 3])
      const p = blob(pts, kind === 'stone' ? 0.3 : 0.75)
      ctx.fill(p)
      lit(p)
      break
    }
    case 'post': {
      const h = rng.range(16, 30) * s
      const w = rng.range(2.6, 4.4) * s
      const p = roundRectPath(x - w / 2, y - h, w, h + 4, w * 0.4)
      ctx.fill(p)
      lit(p)
      ctx.lineWidth = 1 * s
      ctx.beginPath()
      ctx.ellipse(x, y - h * rng.range(0.55, 0.85), w * 1.1, w * 0.5, rng.range(-0.3, 0.3), 0, TAU)
      ctx.stroke()
      break
    }
    case 'rope': {
      const h = rng.range(20, 34) * s
      ctx.lineWidth = 3 * s
      ctx.beginPath()
      ctx.moveTo(x, y + 4)
      ctx.lineTo(x, y - h)
      ctx.stroke()
      // A short swag between this bollard and the next, not a power line.
      ctx.lineWidth = 1.6 * s
      const dir = rng.bool() ? 1 : -1
      const span = rng.range(22, 52) * s
      const far = y - h + rng.range(-4, 6)
      ctx.beginPath()
      ctx.moveTo(x, y - h)
      ctx.quadraticCurveTo(x + dir * span * 0.5, y - h + span * 0.42, x + dir * span, far)
      ctx.stroke()
      ctx.lineWidth = 3 * s
      ctx.beginPath()
      ctx.moveTo(x + dir * span, far)
      ctx.lineTo(x + dir * span, y + 4)
      ctx.stroke()
      break
    }
    case 'bone': {
      const len = rng.range(14, 24) * s
      ctx.lineWidth = 2.2 * s
      ctx.beginPath()
      ctx.moveTo(x - len * 0.5, y + 2)
      ctx.quadraticCurveTo(x, y - len * 0.9, x + len * 0.5, y + 2)
      ctx.stroke()
      break
    }
    case 'cloud': {
      const w = rng.range(30, 62) * s
      const p = new Path2D()
      for (let i = 0; i < 5; i++) {
        p.addPath(ellipsePath(x + rng.range(-w * 0.4, w * 0.4), y - rng.range(0, w * 0.16), rng.range(w * 0.16, w * 0.3), rng.range(w * 0.09, w * 0.17)))
      }
      ctx.fill(p)
      break
    }
    case 'vine': {
      const h = rng.range(26, 52) * s
      ctx.lineWidth = 1.4 * s
      const v = new Path2D()
      v.moveTo(x, y + 4)
      v.quadraticCurveTo(x + rng.range(-9, 9) * s, y - h * 0.5, x + rng.range(-5, 5) * s, y - h)
      ctx.stroke(v)
      for (let i = 0; i < 7; i++) {
        const t = i / 7
        const lx = x + rng.range(-4, 4) * s
        const ly = y - h * t
        ctx.fill(ellipsePath(lx, ly, rng.range(1.6, 3.4) * s, rng.range(0.8, 1.6) * s, rng.range(-0.6, 0.6)))
      }
      break
    }
    case 'crate': {
      const n = 1 + rng.int(0, 2)
      let by = y
      for (let i = 0; i < n; i++) {
        const w = rng.range(10, 16) * s
        const h = w * rng.range(0.7, 0.95)
        const p = roundRectPath(x - w / 2 + rng.range(-2, 2), by - h, w, h, 0.8)
        ctx.fill(p)
        lit(p)
        by -= h
      }
      break
    }
    case 'branch': {
      const h = rng.range(30, 62) * s
      const draw = (px: number, py: number, ang: number, len: number, wdt: number, d: number) => {
        const ex = px + Math.cos(ang) * len
        const ey = py + Math.sin(ang) * len
        ctx.lineWidth = wdt
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.quadraticCurveTo(px + Math.cos(ang + rng.range(-0.5, 0.5)) * len * 0.6, py + Math.sin(ang - 0.2) * len * 0.6, ex, ey)
        ctx.stroke()
        if (d <= 0) return
        for (let i = 0; i < 2 + rng.int(0, 1); i++) {
          draw(ex, ey, ang + rng.range(-1, 1), len * rng.range(0.45, 0.7), wdt * 0.6, d - 1)
        }
      }
      draw(x, y + 4, -Math.PI / 2 + rng.range(-0.4, 0.4), h * 0.45, 3.4 * s, 2)
      break
    }
    case 'picket': {
      const n = 3 + rng.int(0, 4)
      for (let i = 0; i < n; i++) {
        const px = x + i * rng.range(5, 8) * s
        const h = rng.range(14, 24) * s
        ctx.save()
        ctx.translate(px, y)
        ctx.rotate(rng.range(-0.16, 0.16))
        const p = new Path2D()
        p.moveTo(-1.3 * s, 4)
        p.lineTo(-1.3 * s, -h)
        p.lineTo(0, -h - 2.6 * s)
        p.lineTo(1.3 * s, -h)
        p.lineTo(1.3 * s, 4)
        p.closePath()
        ctx.fill(p)
        ctx.restore()
      }
      ctx.lineWidth = 1.4 * s
      ctx.beginPath()
      ctx.moveTo(x - 3 * s, y - 13 * s)
      ctx.lineTo(x + (n - 0.4) * 6.5 * s, y - 13 * s + rng.range(-2, 2))
      ctx.stroke()
      break
    }
    case 'bamboo': {
      const n = 2 + rng.int(0, 3)
      for (let i = 0; i < n; i++) {
        const px = x + i * rng.range(4, 9) * s
        const h = rng.range(34, 66) * s
        const w = rng.range(1.8, 3) * s
        const lean = rng.range(-0.1, 0.1)
        const p = new Path2D()
        p.moveTo(px - w / 2, y + 4)
        p.lineTo(px - w / 2 + lean * h, y - h)
        p.lineTo(px + w / 2 + lean * h, y - h)
        p.lineTo(px + w / 2, y + 4)
        p.closePath()
        ctx.fill(p)
        lit(p)
        for (let seg = 1; seg * 9 * s < h; seg++) {
          const sy = y - seg * 9 * s
          ctx.lineWidth = 0.8 * s
          ctx.strokeStyle = edge
          ctx.globalAlpha = 0.4
          ctx.beginPath()
          ctx.moveTo(px - w * 0.6 + lean * (y - sy), sy)
          ctx.lineTo(px + w * 0.6 + lean * (y - sy), sy)
          ctx.stroke()
          ctx.globalAlpha = 1
          ctx.strokeStyle = color
        }
        for (let l = 0; l < 4; l++) {
          const ly = y - h * rng.range(0.55, 1)
          const dir = rng.bool() ? 1 : -1
          const ll = rng.range(7, 14) * s
          const leaf = new Path2D()
          leaf.moveTo(px + lean * (y - ly), ly)
          leaf.quadraticCurveTo(px + dir * ll * 0.5, ly - ll * 0.4, px + dir * ll, ly - ll * 0.2)
          leaf.quadraticCurveTo(px + dir * ll * 0.5, ly - ll * 0.05, px + lean * (y - ly), ly)
          leaf.closePath()
          ctx.fill(leaf)
        }
      }
      break
    }
    case 'blossom': {
      const h = rng.range(24, 44) * s
      ctx.lineWidth = 2.6 * s
      ctx.beginPath()
      ctx.moveTo(x, y + 4)
      ctx.quadraticCurveTo(x + rng.range(-6, 6) * s, y - h * 0.6, x + rng.range(-12, 12) * s, y - h)
      ctx.stroke()
      const crown = new Path2D()
      for (let i = 0; i < 5; i++) {
        crown.addPath(
          ellipsePath(x + rng.range(-12, 12) * s, y - h + rng.range(-7, 7) * s, rng.range(4, 8) * s, rng.range(3, 6) * s),
        )
      }
      ctx.fill(crown)
      break
    }
    case 'lantern': {
      const h = rng.range(30, 46) * s
      ctx.lineWidth = 2.2 * s
      ctx.beginPath()
      ctx.moveTo(x, y + 4)
      ctx.lineTo(x, y - h)
      ctx.lineTo(x + 7 * s, y - h)
      ctx.stroke()
      const lamp = roundRectPath(x + 4.4 * s, y - h + 2 * s, 5.6 * s, 8.4 * s, 2 * s)
      ctx.fill(lamp)
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      radialFill(ctx, x + 7 * s, y - h + 6 * s, 0, 15 * s, [
        [0, rgba(PAL.ember, 0.3)],
        [1, rgba(PAL.ember, 0)],
      ])
      ctx.restore()
      break
    }
  }
  ctx.restore()
}

interface FgOpts extends LayerSpec {
  w: number
  h: number
  count: number
  scale: number
  /** How far the tone is pushed toward ink. */
  tone: number
  /** Height of the continuous bank along the bottom edge. */
  bank: number
}

function fgLayer(biome: string, tag: string, p: BiomePalette, o: FgOpts): ParallaxLayer {
  const s = layerSurface(o.w, o.h)
  const ctx = s.ctx
  const rng = new Rng(seedFrom(biome + 'fg' + tag))
  const kinds = FG_KINDS[biome] ?? FG_KINDS['east-blue']
  // Low contrast: pushed toward ink, then pulled back toward the biome's fog so
  // it still belongs to the same air as everything behind it.
  const color = mix(mix(p.groundDeep, PAL.ink, o.tone), p.fog, 0.14)
  const edge = mix(color, p.ambient, 0.4)

  // A bank along the bottom, mostly below the frame, for the motifs to grow out
  // of. Its lip is a harmonic so it wraps and never reads as a straight cut.
  const lip = wave(rng, [1, 2, 4, 7])
  const bankTop = o.h - o.bank
  const bank = new Path2D()
  bank.moveTo(0, bankTop - lip(0) * o.bank * 0.35)
  for (let x = 1; x <= o.w; x++) bank.lineTo(x, bankTop - lip(x / o.w) * o.bank * 0.35)
  bank.lineTo(o.w, o.h)
  bank.lineTo(0, o.h)
  bank.closePath()

  ctx.fillStyle = color
  ctx.fill(bank)
  ctx.save()
  ctx.clip(bank)
  ctx.strokeStyle = edge
  ctx.lineWidth = 1
  ctx.translate(0, -0.8)
  ctx.stroke(bank)
  ctx.restore()

  // Motifs go on after the bank and in the same tone, so the whole layer reads
  // as one silhouette rather than as objects standing on a stripe.
  // Walk a shuffled list rather than picking at random: three of the same
  // silhouette in one screen is exactly the comb this layer exists to avoid.
  const order = rng.shuffle([...kinds])
  const y = bankTop + 2
  let n = 0
  for (const x of spread(rng, o.w, o.count, 0.46)) {
    const kind = order[n++ % order.length]
    const sc = o.scale * rng.range(0.75, 1.3)
    const dy = rng.range(-2, 4)
    const seed = (rng.next() * 0xffffffff) >>> 0
    stamp(o.w, x, 70 * sc, (sx) => fgMotif(ctx, kind, sx, y + dy, sc, color, edge, new Rng(seed)))
  }

  return layerOf(s, o)
}

/** Layers drawn in FRONT of the entities, for depth at the near plane. */
export function buildForeground(biome: Biome): ParallaxLayer[] {
  const p = biomePalette(biome)
  return [
    fgLayer(biome, 'a', p, {
      w: 660, h: 78, y: 176, factor: 1.16, factorY: 0.35,
      count: 7, scale: 1, tone: 0.56, bank: 14, alpha: 0.62,
    }),
    fgLayer(biome, 'b', p, {
      w: 470, h: 100, y: 184, factor: 1.52, factorY: 0.5,
      count: 4, scale: 1.7, tone: 0.74, bank: 16, alpha: 0.8,
    }),
  ]
}
