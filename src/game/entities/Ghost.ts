import type { RenderContext, SpriteSheet } from '../../types'
import { Entity } from './Entity'
import type { World } from '../world'
import { art } from '../../art'
import { decodeGhost, poseAt, type GhostPose, type GhostTrack } from '../ghost'

/**
 * The shadow of your own best run.
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

  constructor(track: GhostTrack) {
    super(0, 0, 1, 1)
    this.poses = decodeGhost(track)
    this.crew = track.crew
    this.tags.add('ghost')
    this.depth = 90
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
    ctx.globalAlpha = 0.34
    ctx.translate(sx, sy)
    if (this.facing === -1) ctx.scale(-1, 1)
    ctx.drawImage(
      sheet.image, frame.sx, frame.sy, frame.sw, frame.sh,
      frame.ox, frame.oy, frame.w, frame.h,
    )
    ctx.restore()
    /*
      No colour wash over it, and that is a correction rather than a choice.

      The first version tinted the silhouette by filling a rect over it with
      `source-atop`, on the assumption that the composite would clip the fill
      to the sprite. It does not: `source-atop` works against everything
      already on the canvas, so the fill tinted the sky and the terrain inside
      that rectangle too — a translucent box following the ghost around, which
      is precisely the artifact just fixed on the powered-tier aura.

      Doing it properly needs the sprite drawn to its own canvas and tinted
      there, every frame, for a decoration. Transparency is enough: it is what
      every game that has ever raced a ghost uses, and depth 90 puts it behind
      the player, so when the two overlap the one you can see is yours.
    */
  }
}
