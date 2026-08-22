import { BUFFER_H, BUFFER_W } from '../types'
import { PAL } from '../art/palette'
import { mix } from '../art/color'
import { clamp01 } from '../engine/math'

export interface PostFxSettings {
  /** Additive glow pulled from the brightest pixels. */
  bloom: number
  /** Where the knee sits, 0..1. At or above 0.55 the bright pass squares the
   *  frame three times (v^8), below it twice (v^4) for a looser, dreamier glow. */
  bloomThreshold: number
  /** Glow radius in device pixels at the quarter-res scratch. Keep it small:
   *  a wide blur is a smear, not a light. */
  bloomRadius?: number
  /** Darkening toward the frame edges. */
  vignette: number
  /** Master colour-grade strength. 0 bypasses the whole grade. */
  grade: number
  /** Colour multiplied into the lit end — set per biome and time of day. */
  gradeColor: string
  /** Colour added into the black end. Cool shadows against a warm key. */
  gradeShadow?: string
  /** Exposure. 1 is neutral, 1.1 is a stop of headroom. */
  gradeGain?: number
  /** >1 deepens the mid tones, <1 lifts them. Endpoints stay put. */
  gradeGamma?: number
  /** Full-screen flash 0..1, decayed by the caller. */
  flash: number
  flashColor: string
  /** 0..1 — radial speed blur and chromatic split during dashes. */
  speed: number
  /** 0..1 — red edge pulse when the player is hurt. */
  damage: number
  /** Optional scanline overlay for the retro toggle. */
  scanlines: number
  /** 0..1 film grain. ~0.2 is film, 1 is a broken VHS. */
  grain?: number
  /** 0..1 heat shimmer. Alabasta at noon, a boss's fire aura. */
  haze?: number
  /** Band the shimmer covers, as fractions of the frame height. */
  hazeY?: number
  hazeH?: number
}

export const defaultPostFx = (): PostFxSettings => ({
  bloom: 0.42,
  bloomThreshold: 0.72,
  bloomRadius: 1.5,
  vignette: 0.3,
  grade: 0.55,
  gradeColor: mix(PAL.cream, PAL.sand, 0.55),
  gradeShadow: PAL.shadow,
  gradeGain: 1,
  gradeGamma: 1.08,
  flash: 0,
  flashColor: PAL.white,
  speed: 0,
  damage: 0,
  scanlines: 0,
  grain: 0.12,
  haze: 0,
  hazeY: 0.5,
  hazeH: 0.5,
})

const canvas = (w: number, h: number) => {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.floor(w))
  c.height = Math.max(1, Math.floor(h))
  return c
}

/** Five-tap Gaussian. Applied as a running-normalised alpha chain, so the
 *  result is a true weighted average and the pass keeps the frame's exposure. */
const KERNEL = [0.11, 0.24, 0.3, 0.24, 0.11]
const TAPS = [-2, -1, 0, 1, 2]

/**
 * Screen-space finishing pass, run on the device-resolution frame buffer.
 *
 * The order mirrors a film pipeline: lens distortion (haze, speed, chromatic),
 * then light (bloom), then colour (grade), then the physical frame (vignette,
 * grain), then event overlays (damage, flash). Everything that can work on a
 * quarter-resolution scratch does, which is what keeps a multi-tap blur
 * affordable at 1152x648 — the whole chain budgets around 2 ms.
 *
 * `target` and `source` are normally the same canvas: every pass either reads
 * a snapshot (drawImage of the source onto itself is defined that way) or goes
 * through a scratch buffer, so self-compositing is safe here.
 */
export class PostFx {
  /**
   * A copy of the frame, refreshed between passes.
   *
   * `target` and `source` are the same canvas, and drawing a canvas onto
   * itself forces the browser to snapshot it first: measured at 1152x648 that
   * is 2.5 ms per pass against 1.0 ms for the same blend read from another
   * canvas, while the copy itself is nearly free. So every pass that needs the
   * image reads it from here.
   */
  private frame = canvas(BUFFER_W, BUFFER_H)
  private downA = canvas(BUFFER_W / 4, BUFFER_H / 4)
  private downB = canvas(BUFFER_W / 4, BUFFER_H / 4)
  private chanR = canvas(BUFFER_W, BUFFER_H)
  private chanB = canvas(BUFFER_W, BUFFER_H)
  private band: HTMLCanvasElement | null = null
  private vignetteCache: HTMLCanvasElement | null = null
  private vignetteStrength = -1
  private grainPlate: HTMLCanvasElement | null = null

  apply(target: CanvasRenderingContext2D, source: HTMLCanvasElement, s: PostFxSettings): void {
    const t = performance.now() / 1000
    target.save()
    target.setTransform(1, 0, 0, 1, 0, 0)
    target.imageSmoothingEnabled = true
    target.imageSmoothingQuality = 'low'

    if ((s.haze ?? 0) > 0.01) {
      this.sync(source)
      this.heatHaze(target, s.haze!, s.hazeY ?? 0.5, s.hazeH ?? 0.5, t)
    }
    if (s.speed > 0.01) {
      this.sync(source)
      this.speedBlur(target, s.speed)
      this.sync(source)
      this.chromatic(target, s.speed)
    }
    if (s.bloom > 0.001) {
      this.sync(source)
      this.bloom(target, s.bloom, s.bloomThreshold, s.bloomRadius ?? 1.5)
    }
    if (s.grade > 0.001) {
      // Re-read after bloom: the grade has to see the light that was added.
      this.sync(source)
      this.grade(target, s)
    }
    if (s.vignette > 0) target.drawImage(this.vignette(s.vignette), 0, 0)
    if ((s.grain ?? 0) > 0.001) this.grain(target, s.grain!)
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

    target.globalCompositeOperation = 'source-over'
    target.globalAlpha = 1
    target.restore()
  }

  /**
   * Bright pass, blur, add back.
   *
   * The old version drew the frame through a dodge against a grey plate, which
   * does not actually threshold anything — it just scaled the whole image, so
   * dark pixels bloomed too and the frame turned to milk. This raises the
   * frame to the fourth power instead (two multiply passes), which is a real
   * knee: at the threshold the curve is an identity, below it values collapse
   * toward black, above it they survive. The gain that follows puts the bright
   * end back where it started.
   */
  /** Refresh the working copy of the frame. */
  private sync(source: HTMLCanvasElement): void {
    const f = this.frame.getContext('2d')!
    f.globalCompositeOperation = 'copy'
    f.globalAlpha = 1
    f.drawImage(source, 0, 0)
    f.globalCompositeOperation = 'source-over'
  }

  private bloom(
    target: CanvasRenderingContext2D,
    amount: number,
    threshold: number,
    radius: number,
  ): void {
    const a = this.downA.getContext('2d')!
    const b = this.downB.getContext('2d')!
    const w = this.downA.width
    const h = this.downA.height

    a.globalCompositeOperation = 'source-over'
    a.globalAlpha = 1
    a.clearRect(0, 0, w, h)
    a.drawImage(this.frame, 0, 0, w, h)

    // Raise the frame to a power: that is a real knee. Each multiply pass
    // squares the value, so mid tones collapse toward black while anything
    // near white survives untouched — v^8 leaves 1.0 at 1.0, takes a 0.75
    // mid tone down to 0.1 and a 0.5 shadow to 0.004.
    //
    // No gain follows. Scaling the result back up is what the old pass did in
    // spirit, and it is exactly what turns a bright sky into milk: at these
    // resolutions the sky is already 0.9, and any restore gain multiplies it
    // straight through the ceiling.
    const passes = threshold >= 0.55 ? 3 : 2
    for (let i = 0; i < passes; i++) {
      b.globalCompositeOperation = 'source-over'
      b.globalAlpha = 1
      b.clearRect(0, 0, w, h)
      b.drawImage(this.downA, 0, 0)
      a.globalCompositeOperation = 'multiply'
      a.drawImage(this.downB, 0, 0)
    }
    a.globalCompositeOperation = 'source-over'
    a.globalAlpha = 1

    // Two separable Gaussian taps. Small radius on purpose: this is a glow
    // around a highlight, not a soft-focus filter over the whole frame.
    this.blurPass(b, this.downA, radius, 0)
    this.blurPass(a, this.downB, 0, radius)

    target.globalCompositeOperation = 'lighter'
    target.globalAlpha = amount
    target.drawImage(this.downA, 0, 0, BUFFER_W, BUFFER_H)
    target.globalCompositeOperation = 'source-over'
    target.globalAlpha = 1
  }

  private blurPass(
    dst: CanvasRenderingContext2D,
    src: HTMLCanvasElement,
    dx: number,
    dy: number,
  ): void {
    dst.globalCompositeOperation = 'source-over'
    dst.clearRect(0, 0, src.width, src.height)
    let acc = 0
    for (let i = 0; i < KERNEL.length; i++) {
      acc += KERNEL[i]
      dst.globalAlpha = KERNEL[i] / acc
      dst.drawImage(src, dx * TAPS[i], dy * TAPS[i])
    }
    dst.globalAlpha = 1
  }

  /**
   * Lift / gamma / gain, in that order of effect but composited the other way
   * round — a flat overlay plate cannot do any of this: it washes the blacks
   * out and flattens the very contrast the cel shading depends on.
   */
  private grade(target: CanvasRenderingContext2D, s: PostFxSettings): void {
    const k = clamp01(s.grade)
    const gain = s.gradeGain ?? 1
    const gamma = s.gradeGamma ?? 1

    // Gain — exposure. Adding the frame to itself is a straight multiply.
    if (gain > 1.002) {
      target.globalCompositeOperation = 'lighter'
      target.globalAlpha = clamp01((gain - 1) * k)
      target.drawImage(this.frame, 0, 0)
    } else if (gain < 0.998) {
      target.globalCompositeOperation = 'multiply'
      target.globalAlpha = k
      const v = Math.round(clamp01(gain) * 255)
      target.fillStyle = `rgb(${v},${v},${v})`
      target.fillRect(0, 0, BUFFER_W, BUFFER_H)
    }

    // Gamma — blending the frame with its own square bends the mid tones while
    // leaving 0 and 1 pinned, which is exactly what a gamma control does.
    if (gamma > 1.002) {
      target.globalCompositeOperation = 'multiply'
      target.globalAlpha = clamp01((gamma - 1) * k * 3)
      target.drawImage(this.frame, 0, 0)
    } else if (gamma < 0.998) {
      target.globalCompositeOperation = 'screen'
      target.globalAlpha = clamp01((1 - gamma) * k * 3)
      target.drawImage(this.frame, 0, 0)
    }

    // Highlight tint: a multiply keeps black at black and pulls everything
    // lit toward the biome's key colour.
    target.globalCompositeOperation = 'multiply'
    target.globalAlpha = k * 0.34
    target.fillStyle = s.gradeColor
    target.fillRect(0, 0, BUFFER_W, BUFFER_H)

    // Lift: a small additive plate in the shadow colour. This is the only
    // pass allowed to touch the blacks, and it tints rather than greys them.
    target.globalCompositeOperation = 'lighter'
    target.globalAlpha = k * 0.13
    target.fillStyle = s.gradeShadow ?? PAL.shadow
    target.fillRect(0, 0, BUFFER_W, BUFFER_H)

    target.globalCompositeOperation = 'source-over'
    target.globalAlpha = 1
  }

  /** Zoom blur that bites at the edges of the frame and leaves the centre sharp. */
  private speedBlur(target: CanvasRenderingContext2D, amount: number): void {
    const a = this.downA.getContext('2d')!
    const w = this.downA.width
    const h = this.downA.height
    a.globalCompositeOperation = 'source-over'
    a.clearRect(0, 0, w, h)
    const steps = 5
    let acc = 0
    for (let i = 0; i < steps; i++) {
      const z = 1 + (i / (steps - 1)) * (0.015 + amount * 0.075)
      acc += 1
      a.globalAlpha = 1 / acc
      const dw = w * z
      const dh = h * z
      a.drawImage(this.frame, (w - dw) / 2, (h - dh) / 2, dw, dh)
    }
    a.globalAlpha = 1

    // Punch the middle out so the streaks only appear where the eye is not.
    const g = a.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.62)
    g.addColorStop(0, 'rgba(0,0,0,1)')
    g.addColorStop(0.45, 'rgba(0,0,0,0.85)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    a.globalCompositeOperation = 'destination-out'
    a.fillStyle = g
    a.fillRect(0, 0, w, h)
    a.globalCompositeOperation = 'source-over'

    target.globalAlpha = clamp01(amount * 1.1)
    target.drawImage(this.downA, 0, 0, BUFFER_W, BUFFER_H)
    target.globalAlpha = 1
  }

  /**
   * A real channel split: the frame is reduced to its green channel and the
   * red and blue are added back from offset copies. Drawing the whole frame
   * twice with 'lighter', as this used to, only brightens it.
   */
  private chromatic(target: CanvasRenderingContext2D, amount: number): void {
    const d = Math.max(1, Math.round(amount * 7))
    const w = BUFFER_W
    const h = BUFFER_H
    for (const [c, plate] of [[this.chanR, '#FF0000'], [this.chanB, '#0000FF']] as const) {
      const ctx = c.getContext('2d')!
      ctx.globalCompositeOperation = 'copy'
      ctx.globalAlpha = 1
      ctx.drawImage(this.frame, 0, 0)
      ctx.globalCompositeOperation = 'multiply'
      ctx.fillStyle = plate
      ctx.fillRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'source-over'
    }
    target.globalCompositeOperation = 'multiply'
    target.fillStyle = '#00FF00'
    target.fillRect(0, 0, w, h)
    // Source and destination rects are the same size, so these stay on the
    // unscaled blit path — a scaled blend of a full frame costs three times as
    // much. The d-wide column each shift leaves behind keeps its green only,
    // and the vignette sits on top of it.
    target.globalCompositeOperation = 'lighter'
    target.drawImage(this.chanR, 0, 0, w - d, h, d, 0, w - d, h)
    target.drawImage(this.chanB, d, 0, w - d, h, 0, 0, w - d, h)
    // Patch the d-wide column each shift left uncovered with the unshifted
    // channel, or the frame gets a cyan bar down one side and a yellow one
    // down the other.
    target.drawImage(this.chanR, 0, 0, d, h, 0, 0, d, h)
    target.drawImage(this.chanB, w - d, 0, d, h, w - d, 0, d, h)
    target.globalCompositeOperation = 'source-over'
  }

  /**
   * Desert shimmer: the band is copied out and redrawn as horizontal slices,
   * each pushed sideways by a travelling wave. Slices are cheap — the whole
   * band is only a few hundred thousand pixels.
   */
  private heatHaze(
    target: CanvasRenderingContext2D,
    amount: number,
    yFrac: number,
    hFrac: number,
    time: number,
  ): void {
    const y0 = Math.floor(clamp01(yFrac) * BUFFER_H)
    const bh = Math.max(8, Math.floor(clamp01(hFrac) * BUFFER_H))
    if (y0 >= BUFFER_H) return
    const h = Math.min(bh, BUFFER_H - y0)
    if (!this.band || this.band.height < h) this.band = canvas(BUFFER_W, Math.max(h, 8))
    const bctx = this.band.getContext('2d')!
    bctx.globalCompositeOperation = 'source-over'
    bctx.globalAlpha = 1
    bctx.clearRect(0, 0, this.band.width, this.band.height)
    bctx.drawImage(this.frame, 0, y0, BUFFER_W, h, 0, 0, BUFFER_W, h)

    const STRIP = 4
    const amp = amount * 5
    for (let y = 0; y < h; y += STRIP) {
      // Warmer near the ground: the wave grows toward the bottom of the band.
      const depth = y / h
      // The shimmer ramps in from nothing at the top of the band, so the band
      // has no visible edge, and gets strongest near the hot ground.
      const dx = Math.sin(time * 2.6 + y * 0.07) * amp * depth * (0.4 + depth * 0.8)
      const sh = Math.min(STRIP, h - y)
      // Overdraw one pixel horizontally so the shift never exposes the edge.
      target.drawImage(this.band, 0, y, BUFFER_W, sh, dx, y0 + y, BUFFER_W, sh)
    }
  }

  private vignette(strength: number): HTMLCanvasElement {
    if (this.vignetteCache && this.vignetteStrength === strength) return this.vignetteCache
    const c = canvas(BUFFER_W, BUFFER_H)
    const ctx = c.getContext('2d')!
    const g = ctx.createRadialGradient(
      BUFFER_W / 2, BUFFER_H / 2, BUFFER_H * 0.34,
      BUFFER_W / 2, BUFFER_H / 2, BUFFER_W * 0.72,
    )
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, `rgba(6,10,26,${strength})`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, BUFFER_W, BUFFER_H)
    this.vignetteCache = c
    this.vignetteStrength = strength
    return c
  }

  /**
   * Film grain from one pre-rendered plate, slightly larger than the frame so
   * a random sub-rect can be taken each frame — the noise crawls without ever
   * being regenerated, and the blit stays on the unscaled path. A repeating
   * pattern fill was measured three times more expensive for the same look.
   */
  private grain(target: CanvasRenderingContext2D, amount: number): void {
    const PAD = 96
    if (!this.grainPlate) {
      const c = canvas(BUFFER_W + PAD, BUFFER_H + PAD)
      const ctx = c.getContext('2d')!
      const img = ctx.createImageData(c.width, c.height)
      for (let i = 0; i < img.data.length; i += 4) {
        // Mid grey is the no-op value under 'overlay'; the spread is the grain.
        const v = 128 + (Math.random() - 0.5) * 150
        img.data[i] = v
        img.data[i + 1] = v
        img.data[i + 2] = v
        img.data[i + 3] = 255
      }
      ctx.putImageData(img, 0, 0)
      this.grainPlate = c
    }
    const ox = Math.floor(Math.random() * PAD)
    const oy = Math.floor(Math.random() * PAD)
    target.globalCompositeOperation = 'overlay'
    target.globalAlpha = clamp01(amount) * 0.5
    target.drawImage(this.grainPlate, ox, oy, BUFFER_W, BUFFER_H, 0, 0, BUFFER_W, BUFFER_H)
    target.globalCompositeOperation = 'source-over'
    target.globalAlpha = 1
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
