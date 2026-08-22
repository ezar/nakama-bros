import { GAME_H, GAME_W } from '../types'
import type { Biome } from '../types'
import { createSurface, px, mix, ditherVGradient, dither, circle, ellipse } from './pixel'
import { biomePalette } from './palette'
import { Rng, seedFrom } from '../engine/rng'

/**
 * One layer of the parallax stack. Layers are drawn back to front; `factor` is
 * the fraction of camera movement the layer follows (0 = painted on the sky,
 * 1 = locked to the world).
 */
export interface ParallaxLayer {
  image: CanvasImageSource
  width: number
  height: number
  /** Horizontal parallax factor. */
  factor: number
  /** Vertical parallax factor. Usually a fraction of `factor`. */
  factorY?: number
  /** Pixels from the top of the camera view where this layer's top sits. */
  yOffset: number
  /** Tile the layer horizontally. */
  repeat: boolean
  /** Constant drift, px/s — clouds and fog. */
  autoScroll?: number
  alpha?: number
  blend?: GlobalCompositeOperation
  /** Sinusoidal vertical bob amplitude in px — distant ships, floating isles. */
  bob?: number
  bobSpeed?: number
}

/**
 * Paint the parallax stack for a biome. Layers are generated at a width that
 * tiles seamlessly, so a level of any length scrolls without a visible seam.
 */
export function buildBackground(biome: Biome): ParallaxLayer[] {
  const p = biomePalette(biome)
  const rng = new Rng(seedFrom(biome))
  const layers: ParallaxLayer[] = []

  // ── Sky ────────────────────────────────────────────────────────────────────
  const sky = createSurface(GAME_W, GAME_H)
  ditherVGradient(sky.ctx, 0, 0, GAME_W, GAME_H, p.skyTop, p.skyLow, 14)
  // A soft sun bloom, offset so the light direction reads in the sprites too.
  const sunX = p.lightDirX < 0 ? GAME_W * 0.24 : GAME_W * 0.76
  for (let r = 62; r > 0; r -= 6) {
    sky.ctx.globalAlpha = 0.035
    circle(sky.ctx, sunX, GAME_H * 0.26, r, p.sunTint)
  }
  sky.ctx.globalAlpha = 1
  circle(sky.ctx, sunX, GAME_H * 0.26, 11, p.sunTint)
  layers.push({ image: sky.canvas, width: GAME_W, height: GAME_H, factor: 0, yOffset: 0, repeat: false })

  // ── Far cloud band ─────────────────────────────────────────────────────────
  const cloudW = 640
  const clouds = createSurface(cloudW, 120)
  for (let i = 0; i < 16; i++) {
    const cx = rng.range(0, cloudW)
    const cy = rng.range(14, 96)
    const cw = rng.range(28, 74)
    const ch = cw * rng.range(0.24, 0.4)
    const tone = mix(p.fog, '#FFFFFF', rng.range(0.15, 0.6))
    for (let k = 0; k < 4; k++) {
      ellipse(
        clouds.ctx,
        cx + rng.range(-cw * 0.3, cw * 0.3),
        cy + rng.range(-ch * 0.3, ch * 0.3),
        cw * rng.range(0.4, 0.7),
        ch * rng.range(0.6, 1),
        tone,
      )
      // Wrap so the strip tiles seamlessly.
      if (cx > cloudW - cw) {
        ellipse(clouds.ctx, cx - cloudW, cy, cw * 0.55, ch * 0.8, tone)
      }
    }
  }
  layers.push({
    image: clouds.canvas, width: cloudW, height: 120, factor: 0.08, yOffset: 6,
    repeat: true, autoScroll: -4, alpha: 0.8,
  })

  // ── Far silhouette ridge ───────────────────────────────────────────────────
  layers.push(ridgeLayer(seedFrom(biome + 'far'), 520, 96, p.farSilhouette, 0.2, 0.22, GAME_H - 150))

  // ── Mid silhouette ─────────────────────────────────────────────────────────
  layers.push(ridgeLayer(seedFrom(biome + 'mid'), 460, 118, p.midSilhouette, 0.42, 0.34, GAME_H - 128))

  // ── Ground haze ────────────────────────────────────────────────────────────
  const haze = createSurface(GAME_W, 70)
  dither(haze.ctx, 0, 0, GAME_W, 70, 'rgba(0,0,0,0)', p.fog, 0.28)
  layers.push({
    image: haze.canvas, width: GAME_W, height: 70, factor: 0.5, yOffset: GAME_H - 70,
    repeat: true, alpha: 0.32,
  })

  return layers
}

/** A jagged, seamlessly tiling silhouette ridge built from layered value noise. */
function ridgeLayer(
  seed: number,
  width: number,
  height: number,
  color: string,
  factor: number,
  factorY: number,
  yOffset: number,
): ParallaxLayer {
  const s = createSurface(width, height)
  const rng = new Rng(seed)
  // Sum a few sine harmonics whose periods divide `width`, so the strip wraps.
  const harmonics = Array.from({ length: 4 }, (_, i) => ({
    k: i + 1,
    amp: rng.range(0.35, 1) / (i + 1),
    phase: rng.range(0, Math.PI * 2),
  }))
  const top: number[] = []
  for (let x = 0; x < width; x++) {
    let v = 0
    for (const h of harmonics) v += Math.sin((x / width) * Math.PI * 2 * h.k + h.phase) * h.amp
    top.push(height * 0.48 - v * height * 0.24)
  }
  for (let x = 0; x < width; x++) {
    const y = Math.round(top[x])
    px(s.ctx, x, y, 1, height - y, color)
    px(s.ctx, x, y, 1, 2, mix(color, '#FFFFFF', 0.18))
  }
  // A darker base grounds the silhouette against the layer behind it.
  dither(s.ctx, 0, height - 26, width, 26, color, mix(color, '#000000', 0.35), 0.5)
  return { image: s.canvas, width, height, factor, factorY, yOffset, repeat: true }
}
