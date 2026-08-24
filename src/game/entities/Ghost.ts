import type { RenderContext, SpriteSheet } from '../../types'
import { Entity } from './Entity'
import type { World } from '../world'
import { art } from '../../art'
import { decodeGhost, poseAt, type GhostPose, type GhostTrack } from '../ghost'

/**
 * The shadow of a run: your own best, or one somebody sent you.
 *
 * Draws and nothing else: no body in the physics world, no hitbox, no contact
 * with anything. It is a recording being played back over the top of a live
 * stage, and the moment it could push, block or be landed on it would stop
 * being a comparison and start being an obstacle.
 *
 * Drawn *behind* the player — depth below 100 — because when the two are neck
 * and neck they overlap almost exactly, and the one you need to see is yours.
 */
export class Ghost extends Entity {
  readonly kind = 'fx'
  private poses: GhostPose[]
  private t = 0
  private crew: GhostTrack['crew']
  private tinted: HTMLCanvasElement | null = null

  /**
   * @param tint Wash the silhouette in this colour, or null to leave it grey.
   *   Your own ghost is untinted; a rival's is coloured, because when two
   *   shadows are on the stage at once the only thing distinguishing them is
   *   which one you are trying to catch.
   */
  constructor(track: GhostTrack, private readonly tint: string | null = null) {
    super(0, 0, 1, 1)
    this.poses = decodeGhost(track)
    this.crew = track.crew
    this.tags.add('ghost')
    // Both shadows sit below the player. A rival goes one lower still, so that
    // when the three overlap the order is always yours in front of theirs in
    // front of nothing — set here rather than left to the order they happened
    // to be spawned in, which is true today and is not a thing to rely on.
    this.depth = tint ? 89 : 90
    this.body.collidesWithTiles = false
    // It has to keep playing while off-screen: a ghost that paused whenever it
    // left the camera would be somewhere else entirely by the time you caught
    // up, and the whole point is that it is where you were at this moment.
    this.cullable = false
    const first = this.poses[0]
    if (first) {
      this.body.x = first.x
      this.body.y = first.y
    }
  }

  update(dt: number, _world: World): void {
    this.t += dt
    const pose = poseAt(this.poses, this.t)
    if (!pose) {
      this.dead = true
      return
    }
    // Written straight to the body without integrating: this is playback, not
    // simulation. `px`/`py` are kept in step so the renderer's interpolation
    // has something sane to blend, rather than smearing from the origin.
    this.body.px = this.body.x
    this.body.py = this.body.y
    this.body.x = pose.x
    this.body.y = pose.y
    this.facing = pose.facing
    this.anim = pose.anim
    this.tickAnim(dt)
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
