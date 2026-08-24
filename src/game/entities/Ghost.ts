import type { CrewId } from '../../types'
import { Shadow } from './Shadow'
import type { World } from '../world'
import { decodeGhost, poseAt, type GhostPose, type GhostTrack } from '../ghost'

/**
 * The shadow of a finished run: your own best, or one somebody sent you.
 *
 * A recording being played back over the top of a live stage. It cannot drift,
 * because it stores where the body actually was rather than what it did — see
 * the note at the top of `ghost.ts` for why that matters more than it sounds.
 */
export class Ghost extends Shadow {
  private poses: GhostPose[]
  private t = 0

  constructor(track: GhostTrack, tint: string | null = null) {
    super(track.crew as CrewId, tint)
    this.poses = decodeGhost(track)
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
    this.place(pose.x, pose.y, pose.facing, pose.anim)
    this.tickAnim(dt)
  }
}
