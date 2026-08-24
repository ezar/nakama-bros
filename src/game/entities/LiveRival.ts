import type { CrewId, RenderContext } from '../../types'
import { Shadow } from './Shadow'
import type { World } from '../world'
import type { RaceSession } from '../../net/session'

/**
 * The other player, live, during a race.
 *
 * Same thing on screen as a ghost and fed from somewhere else: instead of a
 * recording it reads whatever the last packet said. It is drawn and nothing
 * more — it cannot be touched, landed on or fought, which is what makes a race
 * over a network buildable at all. Nothing has to agree; there is nothing to
 * disagree about.
 */

/**
 * How fast the drawn body catches up with the last packet.
 *
 * Poses arrive fifteen times a second and the game draws sixty, so putting
 * each one straight onto the body would show a figure stepping rather than
 * running. Easing towards the target instead costs about a twentieth of a
 * second of lag on a body that cannot be interacted with, and buys a stride
 * that reads as movement — and it absorbs a dropped packet, which snapping
 * would show as a stutter.
 */
const CATCH_UP = 18

/**
 * Past this far apart, jump rather than slide.
 *
 * Dying puts the other player back at their checkpoint, which is a move of
 * however far that was. Easing across it would send the silhouette gliding
 * through the terrain for a second — a thing no body in this game does, and
 * which reads as a bug rather than as somebody having died.
 */
const SNAP = 96

export class LiveRival extends Shadow {
  private placed = false
  private visible = false

  constructor(private readonly session: RaceSession, crew: CrewId, tint: string) {
    super(crew, tint)
  }

  /*
    Hidden by skipping the draw rather than by clearing `active`, which also
    gates the update — an entity switched off that way would never notice the
    other player coming back.
  */
  draw(rc: RenderContext, sx: number, sy: number): void {
    if (this.visible) super.draw(rc, sx, sy)
  }

  update(dt: number, _world: World): void {
    const pose = this.session.opponentPose()
    if (!pose) {
      // Gone quiet: a locked phone, a hand over the antenna, somebody who put
      // it down. Hidden rather than left frozen mid-stride, because a body
      // standing still in the air reads as a broken game and an absent one
      // reads as what has actually happened.
      this.visible = false
      return
    }
    this.visible = true

    const far = Math.abs(pose.x - this.body.x) > SNAP || Math.abs(pose.y - this.body.y) > SNAP
    if (!this.placed || far) {
      this.placed = true
      this.body.px = pose.x
      this.body.py = pose.y
      this.place(pose.x, pose.y, pose.facing, pose.anim)
      this.tickAnim(dt)
      return
    }
    // Exponential, so the rate does not depend on the frame length: at 60 Hz
    // and at 144 Hz the body arrives at the same moment.
    const k = 1 - Math.exp(-dt * CATCH_UP)
    this.place(
      this.body.x + (pose.x - this.body.x) * k,
      this.body.y + (pose.y - this.body.y) * k,
      pose.facing,
      pose.anim,
    )
    this.tickAnim(dt)
  }
}
