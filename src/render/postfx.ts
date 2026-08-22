import { BUFFER_H, BUFFER_W } from '../types'

export interface PostFxSettings {
  /** Additive glow pulled from the brightest pixels. */
  bloom: number
  /** Brightness a pixel must reach before it blooms, 0..1. */
  bloomThreshold: number
  /** Darkening toward the frame edges. */
  vignette: number
  /** Colour grade strength. */
  grade: number
  /** Colour the grade pushes toward — set per biome and time of day. */
  gradeColor: string
  /** Full-screen flash 0..1, decayed by the caller. */
  flash: number
  flashColor: string
  /** 0..1 — radial blur and chromatic split during dashes. */
  speed: number
  /** 0..1 — red edge pulse when the player is hurt. */
  damage: number
  /** Optional scanline overlay for the retro toggle. */
  scanlines: number
}

export const defaultPostFx = (): PostFxSettings => ({
  bloom: 0.55,
  bloomThreshold: 0.62,
  vignette: 0.34,
  grade: 0.14,
  gradeColor: '#FFD9A0',
  flash: 0,
  flashColor: '#FFFFFF',
  speed: 0,
  damage: 0,
  scanlines: 0,
})

const canvas = (w: number, h: number) => {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.floor(w))
  c.height = Math.max(1, Math.floor(h))
  return c
}

/**
 * Screen-space finishing pass, run on the device-resolution frame buffer.
 *
 * The order mirrors a film pipeline: bloom (light), grade (colour), vignette
 * and chromatic split (lens), then event overlays (damage, flash). Every pass
 * works on a quarter-resolution scratch buffer where it can, which is what
 * keeps a multi-tap blur affordable at 1152x648.
 */
export class PostFx {
  private downA = canvas(BUFFER_W / 4, BUFFER_H / 4)
  private downB = canvas(BUFFER_W / 4, BUFFER_H / 4)
  private vignetteCache: HTMLCanvasElement | null = null
  private vignetteStrength = -1

  apply(target: CanvasRenderingContext2D, source: HTMLCanvasElement, s: PostFxSettings): void {
    target.save()
    target.setTransform(1, 0, 0, 1, 0, 0)

    if (s.speed > 0.01) this.chromatic(target, source, s.speed)
    if (s.bloom > 0) this.bloom(target, source, s.bloom, s.bloomThreshold)
    if (s.grade > 0) {
      target.globalCompositeOperation = 'overlay'
      target.globalAlpha = s.grade
      target.fillStyle = s.gradeColor
      target.fillRect(0, 0, BUFFER_W, BUFFER_H)
      target.globalCompositeOperation = 'source-over'
      target.globalAlpha = 1
    }
    if (s.vignette > 0) target.drawImage(this.vignette(s.vignette), 0, 0)
    if (s.damage > 0.01) this.damageVignette(target, s.damage)
    if (s.scanlines > 0) {
      target.globalAlpha = s.scanlines * 0.4
      target.fillStyle = '#000000'
      for (let y = 0; y < BUFFER_H; y += 3) target.fillRect(0, y, BUFFER_W, 1)
      target.globalAlpha = 1
    }
    if (s.flash > 0.001) {
      target.globalAlpha = Math.min(1, s.flash)
      target.fillStyle = s.flashColor
      target.fillRect(0, 0, BUFFER_W, BUFFER_H)
      target.globalAlpha = 1
    }
    target.restore()
  }

  /**
   * Threshold, downsample, blur, add back. The threshold is done by drawing the
   * frame through a 'color-dodge' pass against a grey plate, which keeps only
   * the values above the knee — far cheaper than reading pixels back.
   */
  private bloom(
    target: CanvasRenderingContext2D,
    source: HTMLCanvasElement,
    amount: number,
    threshold: number,
  ): void {
    const a = this.downA.getContext('2d')!
    const b = this.downB.getContext('2d')!
    const w = this.downA.width
    const h = this.downA.height

    a.globalCompositeOperation = 'source-over'
    a.globalAlpha = 1
    a.clearRect(0, 0, w, h)
    a.drawImage(source, 0, 0, w, h)
    // Crush everything below the threshold toward black.
    a.globalCompositeOperation = 'multiply'
    a.drawImage(this.downA, 0, 0)
    a.globalCompositeOperation = 'source-over'
    a.globalAlpha = 1 - threshold
    a.fillStyle = '#000000'
    a.globalCompositeOperation = 'destination-out'
    a.fillStyle = `rgba(0,0,0,${1 - threshold})`
    a.globalCompositeOperation = 'source-over'

    // Two separable box passes.
    b.clearRect(0, 0, w, h)
    b.globalAlpha = 0.3
    for (const dx of [-3, -1.5, 0, 1.5, 3]) b.drawImage(this.downA, dx, 0)
    a.clearRect(0, 0, w, h)
    a.globalAlpha = 0.3
    for (const dy of [-3, -1.5, 0, 1.5, 3]) a.drawImage(this.downB, 0, dy)
    a.globalAlpha = 1
    b.globalAlpha = 1

    target.globalCompositeOperation = 'lighter'
    target.globalAlpha = amount
    target.imageSmoothingEnabled = true
    target.drawImage(this.downA, 0, 0, BUFFER_W, BUFFER_H)
    target.globalCompositeOperation = 'source-over'
    target.globalAlpha = 1
  }

  /** Split the red and blue channels outward from the centre. */
  private chromatic(
    target: CanvasRenderingContext2D,
    source: HTMLCanvasElement,
    amount: number,
  ): void {
    const d = amount * 5
    target.globalCompositeOperation = 'lighter'
    target.globalAlpha = 0.28 * amount
    target.drawImage(source, -d, 0)
    target.drawImage(source, d, 0)
    target.globalCompositeOperation = 'source-over'
    target.globalAlpha = 1
  }

  private vignette(strength: number): HTMLCanvasElement {
    if (this.vignetteCache && this.vignetteStrength === strength) return this.vignetteCache
    const c = canvas(BUFFER_W, BUFFER_H)
    const ctx = c.getContext('2d')!
    const g = ctx.createRadialGradient(
      BUFFER_W / 2, BUFFER_H / 2, BUFFER_H * 0.3,
      BUFFER_W / 2, BUFFER_H / 2, BUFFER_W * 0.75,
    )
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, `rgba(6,10,26,${strength})`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, BUFFER_W, BUFFER_H)
    this.vignetteCache = c
    this.vignetteStrength = strength
    return c
  }

  private damageVignette(target: CanvasRenderingContext2D, amount: number): void {
    const g = target.createRadialGradient(
      BUFFER_W / 2, BUFFER_H / 2, BUFFER_H * 0.18,
      BUFFER_W / 2, BUFFER_H / 2, BUFFER_W * 0.6,
    )
    g.addColorStop(0, 'rgba(200,20,30,0)')
    g.addColorStop(1, `rgba(200,20,30,${0.75 * amount})`)
    target.fillStyle = g
    target.fillRect(0, 0, BUFFER_W, BUFFER_H)
  }
}
