import { cel, type Cel } from '../color'
import { SPRITE_LIGHT, type CelOptions } from '../ink'

/**
 * The cel pass, as the characters need it.
 *
 * This is `ink.paint()`'s grammar — flat fill, hard terminator, rim, ink line —
 * reimplemented rather than wrapped, and what is left of the reason is cost.
 *
 * `ink.paint()` cuts the terminator by filling a half-plane `radius * 40 + 200`
 * units on a side — about 1150 x 2300 device pixels for a torso — and relies on
 * the clip to throw the rest away. Ten crew members at fifty frames each is
 * around twenty-five thousand of those fills, and it was by a wide margin the
 * most expensive thing in the art build. The half-plane here is sized to the
 * part being painted, which is all it ever needed to be, and one clip covers
 * both the terminator and the rim instead of one each.
 *
 * The rim used to differ too: `ink.paint()` offset its stroke toward the light,
 * which clipping turns into a highlight on the shadowed edge. That was fixed at
 * the source, and both now offset away from it. Everything under `character/`
 * still paints through here for the cost; if the half-plane in `ink.ts` is ever
 * sized to its subject, this file becomes a one-line re-export.
 */
export function celPaint(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  colors: Cel | string,
  opts: CelOptions = {},
): void {
  const c = typeof colors === 'string' ? cel(colors) : colors
  const light = opts.light ?? SPRITE_LIGHT
  const shadow = opts.shadow ?? 0.42
  const radius = opts.radius ?? 8
  const [px, py] = opts.pivot ?? [0, 0]

  ctx.save()
  ctx.fillStyle = c.core
  ctx.fill(path)

  // One clip for both the terminator and the rim. Clipping to a bezier blob is
  // the single most expensive canvas operation in the art build, and doing it
  // twice per part — once to cut the shadow, once to trim the rim stroke —
  // doubled the cost of every form on every frame for no reason.
  if (shadow > 0.001 || opts.rim) {
    ctx.save()
    ctx.clip(path)

    if (shadow > 0.001) {
      // Rotate so "away from the light" becomes +x, then fill everything past
      // the terminator offset. offset = +radius leaves the part fully lit,
      // -radius puts all of it in shadow.
      const away = Math.atan2(-light.y, -light.x)
      const offset = radius * (1 - 2 * shadow)
      // Big enough to run off any single part of a character, and no bigger.
      const R = radius * 6 + 26
      ctx.save()
      ctx.translate(px, py)
      ctx.rotate(away)
      ctx.fillStyle = c.shade
      ctx.fillRect(offset, -R, R * 2, R * 2)
      if (opts.occlusion) {
        ctx.globalAlpha = opts.occlusion
        ctx.fillStyle = c.deep
        ctx.fillRect(offset + radius * 0.85, -R, R * 2, R * 2)
        ctx.globalAlpha = 1
      }
      ctx.restore()
    }

    if (opts.rim) {
      ctx.strokeStyle = opts.rimColor ?? c.light
      ctx.lineWidth = opts.rim * 2
      // Away from the light: clipping keeps the far half of an offset stroke,
      // so pushing it into shadow is what leaves the band on the lit edge.
      ctx.translate(-light.x * opts.rim * 0.95, -light.y * opts.rim * 0.95)
      ctx.stroke(path)
    }
    ctx.restore()
  }

  if (opts.line !== 0) {
    ctx.strokeStyle = opts.lineColor ?? c.line
    ctx.lineWidth = opts.line ?? 0.7
    ctx.stroke(path)
  }
  ctx.restore()
}
