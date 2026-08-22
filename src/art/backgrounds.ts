import { GAME_H, GAME_W } from '../types'
import type { Biome } from '../types'
import { adjust, mix, rgba } from './color'
import { biomePalette } from './palette'
import { blob, createSurface, curve, ellipsePath, radialFill, roundRectPath, type Pt } from './ink'
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
 * Atmospheric perspective, applied to every layer by depth.
 *
 * Distance does two things to a colour: it washes it toward the sky and it
 * drains its contrast. Doing both from one number is what makes six layers read
 * as six distances instead of six drawings.
 */
const haze = (color: string, fog: string, depth: number): string =>
  adjust(mix(color, fog, depth * 0.72), { sat: 1 - depth * 0.42 })

const layerSurface = (w: number, h: number) => createSurface(w, h)

/** Paint the parallax stack behind the world. */
export function buildBackground(biome: Biome): ParallaxLayer[] {
  const p = biomePalette(biome)
  const rng = new Rng(seedFrom(biome))
  const layers: ParallaxLayer[] = []

  // ── Sky ────────────────────────────────────────────────────────────────────
  const sky = layerSurface(GAME_W, GAME_H)
  const g = sky.ctx.createLinearGradient(0, 0, 0, GAME_H)
  g.addColorStop(0, p.skyTop)
  g.addColorStop(0.55, p.skyMid)
  g.addColorStop(1, p.skyLow)
  sky.ctx.fillStyle = g
  sky.ctx.fillRect(0, 0, GAME_W, GAME_H)

  // The sun, with a wide falloff that gives the frame a light source.
  const sunX = p.lightDirX < 0 ? GAME_W * 0.22 : GAME_W * 0.78
  const sunY = GAME_H * 0.24
  radialFill(sky.ctx, sunX, sunY, 0, 96, [
    [0, rgba(p.sunTint, 0.5)],
    [0.35, rgba(p.sunTint, 0.16)],
    [1, rgba(p.sunTint, 0)],
  ])
  radialFill(sky.ctx, sunX, sunY, 0, 11, [
    [0, rgba('#FFFFFF', 0.95)],
    [1, rgba(p.sunTint, 0)],
  ])
  layers.push({
    image: sky.canvas, width: GAME_W, height: GAME_H, factor: 0, yOffset: 0, repeat: false,
  })

  // ── Cloud bands, three depths ──────────────────────────────────────────────
  for (const [depth, factor, scale, drift, y] of [
    [0.8, 0.05, 0.7, -1.4, 8],
    [0.55, 0.12, 1, -3, 26],
    [0.35, 0.2, 1.35, -5.5, 52],
  ] as const) {
    layers.push(cloudBand(seedFrom(biome + factor), p.fog, p.sunTint, depth, factor, scale, drift, y))
  }

  // ── Far ridge ──────────────────────────────────────────────────────────────
  layers.push(
    ridge(seedFrom(biome + 'far'), 420, 86, haze(p.farSilhouette, p.fog, 0.55), p, 0.26, GAME_H - 128, 0.55),
  )

  // ── Mid ridge with biome landmarks ─────────────────────────────────────────
  layers.push(
    ridge(seedFrom(biome + 'mid'), 380, 104, haze(p.midSilhouette, p.fog, 0.3), p, 0.46, GAME_H - 110, 0.3, biome),
  )

  // ── Ground haze that ties the world to the sky ─────────────────────────────
  const hazeS = layerSurface(GAME_W, 64)
  const hg = hazeS.ctx.createLinearGradient(0, 0, 0, 64)
  hg.addColorStop(0, rgba(p.fog, 0))
  hg.addColorStop(1, rgba(p.fog, 0.42))
  hazeS.ctx.fillStyle = hg
  hazeS.ctx.fillRect(0, 0, GAME_W, 64)
  layers.push({
    image: hazeS.canvas, width: GAME_W, height: 64, factor: 0.55, yOffset: GAME_H - 64,
    repeat: true, alpha: 0.85,
  })

  void rng
  return layers
}

/** Layers drawn in FRONT of the entities, for depth at the near plane. */
export function buildForeground(biome: Biome): ParallaxLayer[] {
  const p = biomePalette(biome)
  const rng = new Rng(seedFrom(biome + 'fg'))
  const w = 300
  const h = 54
  const s = layerSurface(w, h)
  const dark = adjust(mix(p.groundDeep, '#0A1024', 0.45), { sat: 1.1 })

  // A ragged band of near vegetation / rock along the bottom of the frame.
  for (let i = 0; i < 26; i++) {
    const x = rng.range(0, w)
    const height = rng.range(14, 40)
    const width = rng.range(6, 16)
    const pts: Pt[] = [
      [x - width / 2, h],
      [x - width * 0.3, h - height * 0.75],
      [x, h - height],
      [x + width * 0.35, h - height * 0.7],
      [x + width / 2, h],
    ]
    s.ctx.fillStyle = dark
    s.ctx.fill(blob(pts, 0.85))
  }
  s.ctx.fillStyle = dark
  s.ctx.fillRect(0, h - 10, w, 10)

  return [
    {
      image: s.canvas, width: w, height: h, factor: 1.28, factorY: 0.5,
      yOffset: GAME_H - h + 12, repeat: true, alpha: 0.9,
    },
  ]
}

// ─────────────────────────────────────────────────────────────────────────────

function cloudBand(
  seed: number,
  fog: string,
  sun: string,
  depth: number,
  factor: number,
  scale: number,
  drift: number,
  yOffset: number,
): ParallaxLayer {
  const rng = new Rng(seed)
  const w = 520
  const h = 110
  const s = layerSurface(w, h)
  const body = mix('#FFFFFF', fog, depth * 0.55)
  const shade = mix(body, fog, 0.45)
  const lit = mix(body, sun, 0.4)

  const count = Math.round(9 + (1 - depth) * 7)
  for (let i = 0; i < count; i++) {
    const cx = rng.range(0, w)
    const cy = rng.range(h * 0.2, h * 0.8)
    const cw = rng.range(28, 74) * scale
    const ch = cw * rng.range(0.26, 0.4)
    // A cloud is a run of overlapping lobes with a flat, lit underside.
    const draw = (ox: number) => {
      const path = new Path2D()
      const lobes = 4 + Math.floor(rng.next() * 3)
      for (let k = 0; k < lobes; k++) {
        const t = k / (lobes - 1) - 0.5
        const lx = cx + ox + t * cw * 0.8
        const lr = cw * (0.3 - Math.abs(t) * 0.16) + ch * 0.4
        path.addPath(ellipsePath(lx, cy - Math.cos(t * 2.2) * ch * 0.4, lr, lr * 0.86))
      }
      path.addPath(ellipsePath(cx + ox, cy + ch * 0.16, cw * 0.5, ch * 0.4))
      s.ctx.fillStyle = shade
      s.ctx.fill(path)
      // Lit cap, clipped to the cloud so the terminator stays hard.
      s.ctx.save()
      s.ctx.clip(path)
      s.ctx.fillStyle = body
      s.ctx.fill(ellipsePath(cx + ox - cw * 0.1, cy - ch * 0.5, cw * 0.66, ch * 1.1))
      s.ctx.fillStyle = lit
      s.ctx.fill(ellipsePath(cx + ox - cw * 0.22, cy - ch * 0.78, cw * 0.4, ch * 0.7))
      s.ctx.restore()
    }
    draw(0)
    // Wrap the strip so it tiles without a seam.
    if (cx > w - cw) draw(-w)
    if (cx < cw) draw(w)
  }

  return {
    image: s.canvas, width: w, height: h, factor, factorY: factor * 0.25,
    yOffset, repeat: true, autoScroll: drift, alpha: 0.92 - depth * 0.2,
  }
}

/**
 * A silhouette ridge built from sine harmonics whose periods divide the strip
 * width, so it tiles seamlessly however long the level is.
 */
function ridge(
  seed: number,
  width: number,
  height: number,
  color: string,
  p: ReturnType<typeof biomePalette>,
  factor: number,
  yOffset: number,
  depth: number,
  biome?: Biome,
): ParallaxLayer {
  const s = layerSurface(width, height)
  const rng = new Rng(seed)
  const harmonics = Array.from({ length: 4 }, (_, i) => ({
    k: i + 1,
    amp: rng.range(0.35, 1) / (i + 1),
    phase: rng.range(0, Math.PI * 2),
  }))
  const top: Pt[] = []
  for (let x = 0; x <= width; x += 4) {
    let v = 0
    for (const h of harmonics) v += Math.sin((x / width) * Math.PI * 2 * h.k + h.phase) * h.amp
    top.push([x, height * 0.44 - v * height * 0.26])
  }

  const path = new Path2D()
  path.moveTo(0, height)
  const c = curve(top, 1)
  path.addPath(c)
  path.lineTo(width, height)
  path.closePath()

  s.ctx.fillStyle = color
  s.ctx.fill(path)
  // A lit lip along the crest catches the sun.
  s.ctx.save()
  s.ctx.clip(path)
  s.ctx.strokeStyle = mix(color, p.sunTint, 0.4 - depth * 0.2)
  s.ctx.lineWidth = 1.6
  s.ctx.stroke(c)
  // Base darkening separates this ridge from the one behind it.
  const g = s.ctx.createLinearGradient(0, height * 0.4, 0, height)
  g.addColorStop(0, rgba(color, 0))
  g.addColorStop(1, rgba(mix(color, '#0A1024', 0.5), 0.8))
  s.ctx.fillStyle = g
  s.ctx.fillRect(0, 0, width, height)
  s.ctx.restore()

  if (biome) landmarks(s.ctx, biome, width, top, color, p, rng)

  return { image: s.canvas, width, height, factor, factorY: factor * 0.3, yOffset, repeat: true }
}

/** Biome-defining shapes sitting on the mid ridge. */
function landmarks(
  ctx: CanvasRenderingContext2D,
  biome: Biome,
  width: number,
  top: Pt[],
  color: string,
  p: ReturnType<typeof biomePalette>,
  rng: Rng,
): void {
  const surfaceAt = (x: number) => {
    const i = Math.max(0, Math.min(top.length - 1, Math.round(x / 4)))
    return top[i][1]
  }
  const ink = mix(color, '#0A1024', 0.45)
  const lit = mix(color, p.sunTint, 0.3)

  const windmill = (x: number, scale: number) => {
    const y = surfaceAt(x)
    ctx.fillStyle = ink
    ctx.fill(blob([
      [x - 5 * scale, y], [x - 3.4 * scale, y - 16 * scale],
      [x + 3.4 * scale, y - 16 * scale], [x + 5 * scale, y],
    ] as Pt[], 0.2))
    ctx.fillStyle = lit
    ctx.fill(blob([
      [x - 7 * scale, y - 15 * scale], [x, y - 22 * scale], [x + 7 * scale, y - 15 * scale],
    ] as Pt[], 0.3))
    ctx.strokeStyle = ink
    ctx.lineWidth = 1.2 * scale
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4
      ctx.beginPath()
      ctx.moveTo(x, y - 18 * scale)
      ctx.lineTo(x + Math.cos(a) * 9 * scale, y - 18 * scale + Math.sin(a) * 9 * scale)
      ctx.stroke()
    }
  }

  const pagoda = (x: number, scale: number) => {
    const y = surfaceAt(x)
    for (let i = 0; i < 3; i++) {
      const ry = y - 6 * scale - i * 7 * scale
      const rw = (14 - i * 3) * scale
      ctx.fillStyle = i % 2 === 0 ? ink : lit
      ctx.fill(blob([
        [x - rw, ry], [x - rw * 0.6, ry - 3 * scale],
        [x + rw * 0.6, ry - 3 * scale], [x + rw, ry],
      ] as Pt[], 0.35))
      ctx.fillStyle = ink
      ctx.fill(roundRectPath(x - rw * 0.4, ry, rw * 0.8, 7 * scale, 0.5))
    }
  }

  const tower = (x: number, scale: number) => {
    const y = surfaceAt(x)
    ctx.fillStyle = ink
    ctx.fill(roundRectPath(x - 4 * scale, y - 30 * scale, 8 * scale, 30 * scale, 1))
    ctx.fillStyle = lit
    ctx.fill(ellipsePath(x, y - 32 * scale, 5 * scale, 4 * scale))
  }

  const dome = (x: number, scale: number) => {
    const y = surfaceAt(x)
    ctx.fillStyle = ink
    ctx.fill(roundRectPath(x - 9 * scale, y - 14 * scale, 18 * scale, 14 * scale, 1))
    ctx.fillStyle = lit
    ctx.fill(ellipsePath(x, y - 14 * scale, 9 * scale, 8 * scale))
  }

  const shapes: Record<string, (x: number, s: number) => void> = {
    'east-blue': windmill,
    alabasta: dome,
    skypiea: tower,
    water7: tower,
    'thriller-bark': pagoda,
    wano: pagoda,
  }
  const draw = shapes[biome] ?? windmill
  for (let i = 0; i < 4; i++) {
    draw(rng.range(20, width - 20), rng.range(0.7, 1.2))
  }
}
