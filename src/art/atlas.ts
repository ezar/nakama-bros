import type { Anim, Frame, SpriteSheet } from '../types'
import { createSurface, outline as applyOutline, rimLight, innerShadow, type Surface } from './pixel'

export interface FrameSpec {
  /** Seconds this frame is shown. */
  dur: number
  /** Draw the frame into its own surface. Origin is the frame's top-left. */
  draw: (s: Surface, ctx: CanvasRenderingContext2D) => void
}

export interface AnimSpec {
  loop?: boolean
  /** Outline colour, or null to skip. */
  outline?: string | null
  /** Include diagonal neighbours in the outline pass. */
  outlineDiagonal?: boolean
  /** Rim-light colour, or null to skip. */
  rim?: string | null
  rimDirX?: number
  rimDirY?: number
  rimStrength?: number
  /** Ambient-occlusion pass under overhangs. */
  ao?: string | null
  /** Per-animation frame size override. */
  fw?: number
  fh?: number
  /** Per-animation origin override, relative to the entity's bottom-centre. */
  ox?: number
  oy?: number
}

export interface SheetOptions {
  /** Default frame width / height. */
  fw: number
  fh: number
  /**
   * Offset from the entity origin (bottom-centre of the hitbox) to the frame's
   * top-left corner. Usually `(-fw / 2, -fh)`.
   */
  ox?: number
  oy?: number
  /** Applied to every animation unless overridden. */
  outline?: string | null
  rim?: string | null
  ao?: string | null
  /** Max sheet width before wrapping to a new row. */
  maxWidth?: number
}

/**
 * Builds a packed sprite sheet from code-drawn frames.
 *
 * Each frame is rendered into its own scratch surface so per-frame passes
 * (outline, rim light, ambient occlusion) see a clean silhouette, then blitted
 * into a single sheet canvas — one texture, one `drawImage` per sprite at
 * runtime.
 */
export class SheetBuilder {
  private specs: Array<{ name: string; spec: AnimSpec; frames: FrameSpec[] }> = []

  constructor(private opts: SheetOptions) {}

  add(name: string, frames: FrameSpec[], spec: AnimSpec = {}): this {
    this.specs.push({ name, spec, frames })
    return this
  }

  /** Convenience for a static, single-frame animation. */
  addStatic(name: string, draw: FrameSpec['draw'], spec: AnimSpec = {}): this {
    return this.add(name, [{ dur: 1, draw }], { loop: true, ...spec })
  }

  build(): SpriteSheet {
    const maxWidth = this.opts.maxWidth ?? 1024
    // Lay frames out row by row, one row per animation where it fits.
    type Placed = { frame: Frame; surface: Surface }
    const rows: Placed[][] = []
    const anims: Record<string, Anim> = {}

    let row: Placed[] = []
    let rowW = 0
    let rowH = 0
    let sheetH = 0
    let sheetW = 0

    const flush = () => {
      if (row.length === 0) return
      rows.push(row)
      sheetW = Math.max(sheetW, rowW)
      sheetH += rowH
      row = []
      rowW = 0
      rowH = 0
    }

    for (const { name, spec, frames } of this.specs) {
      const fw = spec.fw ?? this.opts.fw
      const fh = spec.fh ?? this.opts.fh
      const ox = spec.ox ?? this.opts.ox ?? -fw / 2
      const oy = spec.oy ?? this.opts.oy ?? -fh
      const animFrames: Frame[] = []

      for (const f of frames) {
        if (rowW + fw > maxWidth) flush()
        const s = createSurface(fw, fh)
        f.draw(s, s.ctx)

        const ao = spec.ao !== undefined ? spec.ao : this.opts.ao
        if (ao) innerShadow(s, ao, 0.3, 3)
        const rim = spec.rim !== undefined ? spec.rim : this.opts.rim
        if (rim) {
          rimLight(s, rim, spec.rimDirX ?? -1, spec.rimDirY ?? -1, spec.rimStrength ?? 0.7)
        }
        const ol = spec.outline !== undefined ? spec.outline : this.opts.outline
        if (ol) applyOutline(s, ol, spec.outlineDiagonal ?? true)

        const placed: Placed = {
          surface: s,
          frame: { sx: rowW, sy: sheetH, sw: fw, sh: fh, ox, oy, dur: f.dur },
        }
        row.push(placed)
        animFrames.push(placed.frame)
        rowW += fw
        rowH = Math.max(rowH, fh)
      }

      anims[name] = { name, frames: animFrames, loop: spec.loop ?? true }
      flush()
    }
    flush()

    const sheet = createSurface(Math.max(1, sheetW), Math.max(1, sheetH))
    for (const r of rows) {
      for (const p of r) {
        sheet.ctx.drawImage(p.surface.canvas, p.frame.sx, p.frame.sy)
      }
    }

    return {
      image: sheet.canvas,
      width: sheet.w,
      height: sheet.h,
      anims,
    }
  }
}

/** Total duration of an animation, in seconds. */
export const animDuration = (a: Anim): number => a.frames.reduce((s, f) => s + f.dur, 0)
