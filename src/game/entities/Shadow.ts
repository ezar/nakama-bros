import type { CrewId, RenderContext, SpriteSheet } from '../../types'
import { Entity } from './Entity'
import { art } from '../../art'

/**
 * A body on the stage that is not really there.
 *
 * Your own best run, a challenge somebody sent, or the other player in a live
 * race — three different sources for the same thing on screen: a translucent
 * copy of a character, drawn and nothing else. No hitbox, no contact, nothing
 * the physics knows about. The moment one of these could push, block or be
 * landed on it would stop being a comparison and start being an obstacle.
 *
 * Drawn *behind* the player, because when two of them are neck and neck they
 * overlap almost exactly, and the one you need to see is yours.
 */
export abstract class Shadow extends Entity {
  readonly kind = 'fx'
  private tinted: HTMLCanvasElement | null = null

  /**
   * @param crew Whose sheet to draw from — the other player's chosen character.
   * @param tint Wash the silhouette in this colour, or null to leave it grey.
   *   Your own is untinted; anybody else's is coloured, because when two are
   *   on the stage at once that is the only thing telling them apart.
   */
  constructor(protected crew: CrewId, protected readonly tint: string | null = null) {
    super(0, 0, 1, 1)
    this.tags.add('ghost')
    // Both sit below the player. Somebody else's goes one lower still, so when
    // all three overlap the order is always yours in front of theirs in front
    // of nothing — set here rather than left to the order they happened to be
    // spawned in, which is true today and is not a thing to rely on.
    this.depth = tint ? 89 : 90
    this.body.collidesWithTiles = false
    // It keeps going while off-screen: one that paused whenever it left the
    // camera would be somewhere else entirely by the time you caught up, and
    // the whole point is that it is where the other body is *now*.
    this.cullable = false
  }

  /** Move the body without integrating — this is playback, not simulation. */
  protected place(x: number, y: number, facing: 1 | -1, anim: string): void {
    // `px`/`py` are kept in step so the renderer's interpolation has something
    // sane to blend, rather than smearing from the origin.
    this.body.px = this.body.x
    this.body.py = this.body.y
    this.body.x = x
    this.body.y = y
    this.facing = facing
    this.anim = anim
  }

  draw(rc: RenderContext, sx: number, sy: number): void {
    const sheet = (art().crew as Record<string, SpriteSheet>)[this.crew]
    if (!sheet) return
    this.sheet = sheet
    const frame = this.frame()
    if (!frame) return
    const { ctx } = rc
    ctx.save()
    // A rival sits slightly more present than your own shadow. Yours is a
    // reference you glance at; theirs is the thing you are chasing, and at the
    // same weight against a bright sky it was barely there at all.
    ctx.globalAlpha = this.tint ? 0.44 : 0.34
    ctx.translate(sx, sy)
    if (this.facing === -1) ctx.scale(-1, 1)
    ctx.drawImage(
      this.source(sheet), frame.sx, frame.sy, frame.sw, frame.sh,
      frame.ox, frame.oy, frame.w, frame.h,
    )
    ctx.restore()
  }

  /**
   * The sheet to draw from: the shared one, or a tinted copy of it.
   *
   * The copy is made once and kept, which is the whole reason this is safe.
   * An earlier attempt at tinting filled a rectangle over the *stage* canvas
   * with `source-atop`, on the assumption that the composite would clip the
   * fill to the sprite just drawn. It does not — `source-atop` works against
   * everything already on the canvas, so it tinted the sky and the terrain
   * inside that rectangle too, and the ghost dragged a translucent box around
   * behind it.
   *
   * Here the composite runs against a canvas that holds nothing but the sheet,
   * where clipping the wash to the sprites is exactly what it does. Doing it
   * per frame would have been too expensive for a decoration; doing it once
   * per ghost costs one canvas the size of the sheet, for the whole level.
   */
  private source(sheet: SpriteSheet): CanvasImageSource {
    if (!this.tint) return sheet.image
    if (this.tinted) return this.tinted
    const c = document.createElement('canvas')
    c.width = sheet.width
    c.height = sheet.height
    const g = c.getContext('2d')
    if (!g) return sheet.image
    g.drawImage(sheet.image, 0, 0)
    g.globalCompositeOperation = 'source-atop'
    // Enough to read as a colour at a glance, short of flattening the sprite
    // into a solid shape — some of the body's own shading has to survive or
    // the two ghosts stop being recognisable as characters at all.
    g.globalAlpha = 0.62
    g.fillStyle = this.tint
    g.fillRect(0, 0, c.width, c.height)
    this.tinted = c
    return c
  }
}
