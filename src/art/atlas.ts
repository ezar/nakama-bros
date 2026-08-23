import { ART_SCALE } from '../types'
import type { Anim, Frame, SpriteSheet } from '../types'
import { createSurface, silhouetteOutline, type Surface } from './ink'

export interface FrameSpec {
  /** Seconds this frame is shown. */
  dur: number
  /**
   * Draw the frame. The context is in WORLD UNITS with the origin at the
   * frame's top-left, already scaled by ART_SCALE, so painters never think
   * about resolution.
   */
  draw: (s: Surface, ctx: CanvasRenderingContext2D) => void
}

export interface AnimSpec {
  loop?: boolean
  /** Frame size in world units, overriding the sheet default. */
  fw?: number
  fh?: number
  /** Origin offset in world units, relative to the entity's bottom-centre. */
  ox?: number
  oy?: number
  /**
   * Draw a single unbroken contour around the whole frame. Cel art reads far
   * better with one silhouette line than with a stroke per body part, so this
   * is on by default for characters.
   */
  contour?: string | null
  contourWidth?: number
}

export interface SheetOptions {
  /** Default frame size in world units. */
  fw: number
  fh: number
  /** Default origin offset. Usually (-fw / 2, -fh) so the frame stands on its feet. */
  ox?: number
  oy?: number
  contour?: string | null
  contourWidth?: number
  /** Max sheet width in device pixels before wrapping to a new row. */
  maxWidth?: number
}

/**
 * Builds a packed sprite sheet from code-drawn frames.
 *
 * Frames are painted into their own scratch surface so the silhouette pass sees
 * a clean alpha channel, then blitted into one sheet canvas — a single texture,
 * one drawImage per sprite at runtime, no per-frame path work in the game loop.
 */
/**
 * How tall a frame draws, in world units above the entity origin.
 *
 * Every frame in a sheet shares one box, so `-oy` says the same thing about a
 * standing figure and a crouching one. Whatever has to fit a drawing through a
 * gap needs to know how tall the drawing *is*, which is only knowable here,
 * where the pixels are.
 *
 * Scanned a row at a time from the top with an early exit rather than pulling
 * the whole frame: the head is near the top of the box, so this reads a couple
 * of dozen rows out of a hundred and fifty.
 */
function drawnTall(s: Surface, oy: number): number {
  const { ctx, canvas } = s
  const w = canvas.width
  for (let r = 0; r < canvas.height; r++) {
    const d = ctx.getImageData(0, r, w, 1).data
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] > 8) return Math.max(0, -(oy + r / ART_SCALE))
    }
  }
  return 0
}

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

  /** Alias an existing animation under another name, sharing its frames. */
  alias(name: string, existing: string): this {
    const src = this.specs.find((s) => s.name === existing)
    if (src) this.specs.push({ name, spec: src.spec, frames: src.frames })
    return this
  }

  build(): SpriteSheet {
    const maxWidth = this.opts.maxWidth ?? 2048
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
      const pw = Math.ceil(fw * ART_SCALE)
      const ph = Math.ceil(fh * ART_SCALE)
      const animFrames: Frame[] = []

      for (const f of frames) {
        if (rowW + pw > maxWidth) flush()
        const s = createSurface(fw, fh)
        f.draw(s, s.ctx)

        const contour = spec.contour !== undefined ? spec.contour : this.opts.contour
        if (contour) {
          silhouetteOutline(s, contour, spec.contourWidth ?? this.opts.contourWidth ?? 0.9)
        }

        const placed: Placed = {
          surface: s,
          frame: {
            sx: rowW, sy: sheetH, sw: pw, sh: ph,
            w: fw, h: fh, ox, oy, tall: drawnTall(s, oy), dur: f.dur,
          },
        }
        row.push(placed)
        animFrames.push(placed.frame)
        rowW += pw
        rowH = Math.max(rowH, ph)
      }

      anims[name] = { name, frames: animFrames, loop: spec.loop ?? true }
      flush()
    }
    flush()

    const sheet = document.createElement('canvas')
    sheet.width = Math.max(1, sheetW)
    sheet.height = Math.max(1, sheetH)
    const sctx = sheet.getContext('2d')!
    sctx.imageSmoothingEnabled = true
    for (const r of rows) {
      for (const p of r) sctx.drawImage(p.surface.canvas, p.frame.sx, p.frame.sy)
    }

    return { image: sheet, width: sheet.width, height: sheet.height, anims }
  }
}

/** Total duration of an animation, in seconds. */
export const animDuration = (a: Anim): number => a.frames.reduce((s, f) => s + f.dur, 0)
