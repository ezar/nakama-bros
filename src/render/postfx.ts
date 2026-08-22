import { GAME_H, GAME_W } from '../types'
import { createSurface, type Surface } from '../art/pixel'

export interface PostFxSettings {
  /** Additive glow pulled from the brightest pixels. */
  bloom: number
  /** Darkening toward the frame edges. */
  vignette: number
  /** Warm/cool grade strength. */
  grade: number
  /** Colour the grade pushes toward — set per biome and time of day. */
  gradeColor: string
  /** Scanline strength; 0 keeps the image clean. */
  scanlines: number
  /** Full-screen flash 0..1, decays externally. */
  flash: number
  flashColor: string
  /** Radial blur / speed feel during dashes, 0..1. */
  speed: number
}

export const defaultPostFx = (): PostFxSettings => ({
  bloom: 0.5,
  vignette: 0.32,
  grade: 0.12,
  gradeColor: '#FFD9A0',
  scanlines: 0,
  flash: 0,
  flashColor: '#FFFFFF',
  speed: 0,
})

/**
 * Screen-space finishing pass.
 *
 * Everything here runs on a 480x270 buffer, so even the multi-pass bloom costs
 * well under a millisecond. The passes are ordered the way a film pipeline
 * orders them: bloom (light), grade (colour), vignette (lens), flash (event).
 */
export class PostFx {
  private bloomA: Surface
  private bloomB: Surface
  private vignetteCache: Surface | null = null
  private vignetteStrength = -1

  constructor(scale = 4) {
    this.bloomA = createSurface(GAME_W / scale, GAME_H / scale)
    this.bloomB = createSurface(GAME_W / scale, GAME_H / scale)
  }

  apply(target: CanvasRenderingContext2D, source: HTMLCanvasElement, s: PostFxSettings): void {
    if (s.bloom > 0) this.drawBloom(target, source, s.bloom)
    if (s.grade > 0) {
      target.save()
      target.globalCompositeOperation = 'overlay'
      target.globalAlpha = s.grade
      target.fillStyle = s.gradeColor
      target.fillRect(0, 0, GAME_W, GAME_H)
      target.restore()
    }
    if (s.vignette > 0) this.drawVignette(target, s.vignette)
    if (s.scanlines > 0) {
      target.save()
      target.globalAlpha = s.scanlines * 0.5
      target.fillStyle = '#000000'
      for (let y = 0; y < GAME_H; y += 2) target.fillRect(0, y, GAME_W, 1)
      target.restore()
    }
    if (s.flash > 0.001) {
      target.save()
      target.globalAlpha = Math.min(1, s.flash)
      target.fillStyle = s.flashColor
      target.fillRect(0, 0, GAME_W, GAME_H)
      target.restore()
    }
  }

  /**
   * Downsample, blur with two separable box passes, then add back. Cheap, and
   * at this resolution indistinguishable from a proper gaussian.
   */
  private drawBloom(target: CanvasRenderingContext2D, source: HTMLCanvasElement, amount: number): void {
    const { bloomA, bloomB } = this
    const w = bloomA.w
    const h = bloomA.h

    bloomA.ctx.clearRect(0, 0, w, h)
    bloomA.ctx.drawImage(source, 0, 0, w, h)
    // Keep only the bright end: multiply the frame by itself twice.
    bloomA.ctx.save()
    bloomA.ctx.globalCompositeOperation = 'multiply'
    bloomA.ctx.drawImage(bloomA.canvas, 0, 0)
    bloomA.ctx.restore()

    // Two-tap box blur, horizontal then vertical.
    bloomB.ctx.clearRect(0, 0, w, h)
    bloomB.ctx.globalAlpha = 0.34
    for (const dx of [-2, -1, 0, 1, 2]) bloomB.ctx.drawImage(bloomA.canvas, dx, 0)
    bloomA.ctx.clearRect(0, 0, w, h)
    bloomA.ctx.globalAlpha = 0.34
    for (const dy of [-2, -1, 0, 1, 2]) bloomA.ctx.drawImage(bloomB.canvas, 0, dy)
    bloomA.ctx.globalAlpha = 1
    bloomB.ctx.globalAlpha = 1

    target.save()
    target.globalCompositeOperation = 'lighter'
    target.globalAlpha = amount
    target.imageSmoothingEnabled = true
    target.drawImage(bloomA.canvas, 0, 0, GAME_W, GAME_H)
    target.imageSmoothingEnabled = false
    target.restore()
  }

  private drawVignette(target: CanvasRenderingContext2D, strength: number): void {
    if (!this.vignetteCache || this.vignetteStrength !== strength) {
      const s = createSurface(GAME_W, GAME_H)
      const g = s.ctx.createRadialGradient(
        GAME_W / 2, GAME_H / 2, GAME_H * 0.28,
        GAME_W / 2, GAME_H / 2, GAME_W * 0.72,
      )
      g.addColorStop(0, 'rgba(0,0,0,0)')
      g.addColorStop(1, `rgba(4,8,20,${strength})`)
      s.ctx.fillStyle = g
      s.ctx.fillRect(0, 0, GAME_W, GAME_H)
      this.vignetteCache = s
      this.vignetteStrength = strength
    }
    target.drawImage(this.vignetteCache.canvas, 0, 0)
  }
}
