import type { CrewId, SpriteSheet } from '../types'
import { SheetBuilder, type FrameSpec } from './atlas'
import { contactShadow, type Surface } from './ink'
import { LOOKS, CREW_SCALE, type Look } from './character/looks'
import {
  FH, FW, GROUND_Y, drawArm, drawLeg, drawTorso, pose, recede, solve,
  type Pose, type Skeleton,
} from './character/rig'
import { drawHairBack, drawHairFront, drawHead } from './character/head'

/**
 * The crew's animation sets.
 *
 * Every animation is a list of joint poses, blended and drawn through the
 * shared rig. Timing follows the platformer convention that matters most: the
 * run cycle is fast and low, the jump has a single held pose so the player can
 * read their state mid-air at a glance, and every impact has a squash frame.
 */

function drawFigure(s: Surface, look: Look, p: Pose, scale: number, attack = 0): void {
  const ctx = s.ctx
  ctx.save()
  // Squash about the feet, then the per-character size.
  ctx.translate(FW / 2, GROUND_Y)
  ctx.scale(p.squashX * scale, p.squashY * scale)
  ctx.translate(-FW / 2, -GROUND_Y)

  const sk: Skeleton = solve(p)
  const pal = look.pal
  const far = {
    ...pal,
    skin: recede(pal.skin),
    shirt: recede(pal.shirt),
    trousers: recede(pal.trousers),
    boots: recede(pal.boots),
  }

  look.props?.(ctx, sk, 'behind')

  drawLeg(ctx, sk.legBack, sk.footBack, far.trousers, far.boots)
  drawArm(ctx, sk.armBack, far.skin, far.shirt)

  drawTorso(ctx, sk, pal, { openVest: look.openVest })

  drawLeg(ctx, sk.legFront, sk.footFront, pal.trousers, pal.boots)

  // Hair mass sits over the shoulders but behind the face.
  const [hx, hy] = sk.head
  const r = 3.9
  drawHairBack(ctx, hx, hy, r, pal.hair, look.hairBack(hx, hy, r))

  drawHead(ctx, sk, {
    skin: pal.skin,
    hair: pal.hair,
    expression: p.expression,
    turn: p.headTurn,
  })
  drawHairFront(ctx, hx, hy, r, pal.hair, look.hairFront(hx, hy, r))
  look.headgear?.(ctx, hx, hy, r, p.drag)

  drawArm(ctx, sk.armFront, pal.skin, pal.shirt)

  if (attack > 0) {
    const hand = sk.armFront[2]
    const elbow = sk.armFront[1]
    const angle = Math.atan2(hand[1] - elbow[1], hand[0] - elbow[0])
    look.weapon(ctx, hand, angle, attack)
  }

  look.props?.(ctx, sk, 'front')
  ctx.restore()
}

const f = (look: Look, scale: number) =>
  (p: Pose, dur: number, attack = 0): FrameSpec => ({
    dur,
    draw: (s: Surface) => {
      // A contact shadow baked into the frame would follow the sprite into the
      // air, so grounded shadows are drawn by the entity instead. This one is
      // only the ambient occlusion the body casts on itself.
      void contactShadow
      drawFigure(s, look, p, scale, attack)
    },
  })

function buildCrewSheet(id: CrewId): SpriteSheet {
  const look = LOOKS[id]
  const scale = CREW_SCALE[id]
  const frame = f(look, scale)
  const b = new SheetBuilder({
    fw: FW,
    fh: FH,
    ox: -FW / 2,
    oy: -GROUND_Y,
    contour: '#1A1428',
    contourWidth: 0.75,
  })

  // ── Idle: a slow breath with the far arm drifting a beat behind ───────────
  b.add('idle', [
    frame(pose({ hipY: 0, lean: 0.05, armFront: [0.2, 0.28], armBack: [-0.22, 0.24] }), 0.5),
    frame(pose({ hipY: -0.55, lean: 0.03, armFront: [0.16, 0.24], armBack: [-0.18, 0.2], squashY: 1.015 }), 0.42),
    frame(pose({ hipY: -0.25, lean: 0.05, armFront: [0.22, 0.3], armBack: [-0.24, 0.26] }), 0.42),
  ])

  // ── Run: contact / down / pass / up, twice ────────────────────────────────
  const runPose = (
    lf: [number, number], lb: [number, number],
    af: [number, number], ab: [number, number],
    hipY: number, sqX = 1, sqY = 1,
  ) =>
    pose({
      lean: 0.3, hipY, legFront: lf, legBack: lb, armFront: af, armBack: ab,
      squashX: sqX, squashY: sqY, expression: 'determined', headTurn: 0.86,
      drag: 0.7, footFront: 0.2, footBack: -0.2,
    })

  b.add('run', [
    // Contact — front heel down, arms at full opposition.
    frame(runPose([0.85, -0.5], [-0.75, 0.95], [-0.85, 0.5], [0.95, 0.4], 0.4, 1.02, 0.98), 0.062),
    // Down — weight absorbs, hips at their lowest.
    frame(runPose([0.35, -0.25], [-0.2, 0.7], [-0.45, 0.45], [0.6, 0.35], 1.5, 1.05, 0.95), 0.06),
    // Pass — legs cross, hips rise.
    frame(runPose([-0.15, -0.05], [0.3, 0.5], [0.05, 0.3], [0.15, 0.3], -0.5, 0.98, 1.03), 0.06),
    // Up — full extension, both feet off the ground.
    frame(runPose([-0.7, 0.1], [0.8, 0.15], [0.7, 0.25], [-0.7, 0.45], -1.5, 0.97, 1.05), 0.06),
    frame(runPose([-0.85, 0.5].reverse() as [number, number], [0.75, -0.15], [0.85, 0.4], [-0.95, 0.5], 0.4, 1.02, 0.98), 0.062),
    frame(runPose([-0.2, 0.7], [0.35, -0.25], [0.6, 0.35], [-0.45, 0.45], 1.5, 1.05, 0.95), 0.06),
    frame(runPose([0.3, 0.5], [-0.15, -0.05], [0.15, 0.3], [0.05, 0.3], -0.5, 0.98, 1.03), 0.06),
    frame(runPose([0.8, 0.15], [-0.7, 0.1], [-0.7, 0.45], [0.7, 0.25], -1.5, 0.97, 1.05), 0.06),
  ])

  // ── Air ───────────────────────────────────────────────────────────────────
  b.add('jump', [
    frame(pose({
      lean: 0.16, hipY: -1.2, legFront: [-0.6, 0.9], legBack: [0.35, 0.45],
      armFront: [-2.35, 0.4], armBack: [-2.05, 0.5], squashX: 0.94, squashY: 1.08,
      expression: 'determined', drag: 1, footFront: 0.5,
    }), 1),
  ], { loop: false })

  b.add('fall', [
    frame(pose({
      lean: -0.08, hipY: 0.4, legFront: [0.5, 0.35], legBack: [-0.35, 0.6],
      armFront: [-2.6, 0.4], armBack: [-2.3, 0.5], squashX: 1.02, squashY: 0.98,
      expression: 'surprised', drag: -0.8, headTurn: 0.8,
    }), 1),
  ], { loop: false })

  b.add('land', [
    frame(pose({
      lean: 0.28, hipY: 4.2, legFront: [0.75, -1.15], legBack: [-0.7, -1.05],
      armFront: [0.9, 0.7], armBack: [-1, 0.6], squashX: 1.16, squashY: 0.82,
      expression: 'strain', footFront: 0.1,
    }), 0.09),
    frame(pose({
      lean: 0.14, hipY: 1.6, legFront: [0.35, -0.5], legBack: [-0.3, -0.45],
      armFront: [0.5, 0.5], armBack: [-0.55, 0.4], squashX: 1.06, squashY: 0.94,
      expression: 'determined',
    }), 0.08),
  ], { loop: false })

  b.add('skid', [
    frame(pose({
      lean: -0.34, hipY: 1.8, legFront: [0.95, -0.55], legBack: [-0.85, 0.35],
      armFront: [1.35, 0.4], armBack: [-1.45, 0.5], squashX: 1.06, squashY: 0.96,
      expression: 'strain', headTurn: 0.6, drag: 1.4, footFront: 0.35,
    }), 1),
  ], { loop: false })

  b.add('crouch', [
    frame(pose({
      lean: 0.42, hipY: 6.6, legFront: [1.2, -1.9], legBack: [-1.1, -1.8],
      armFront: [0.85, 0.9], armBack: [-0.9, 0.85], squashX: 1.12, squashY: 0.9,
      expression: 'focused',
    }), 1),
  ])

  b.add('hurt', [
    frame(pose({
      lean: -0.45, hipY: -0.6, legFront: [-0.85, 0.5], legBack: [0.8, 0.4],
      armFront: [-2.3, 0.2], armBack: [2.2, 0.3], headTilt: -0.4,
      expression: 'hurt', drag: 1.6, headTurn: 0.5,
    }), 1),
  ], { loop: false })

  b.add('victory', [
    frame(pose({
      lean: 0.02, hipY: -1.4, armFront: [-2.85, 0.15], armBack: [-2.5, 0.35],
      legFront: [0.12, -0.06], legBack: [-0.14, 0.08], squashY: 1.03,
      expression: 'joy', headTurn: 0.4, headTilt: -0.08,
    }), 0.3),
    frame(pose({
      lean: 0.02, hipY: 0.2, armFront: [-3.05, 0.25], armBack: [-2.35, 0.2],
      legFront: [0.12, -0.06], legBack: [-0.14, 0.08],
      expression: 'joy', headTurn: 0.4, headTilt: 0.04,
    }), 0.3),
  ])

  // ── Attack: anticipation, extreme, recovery ───────────────────────────────
  b.add('attack', [
    frame(pose({
      lean: -0.2, hipY: 0.8, armFront: [-1.15, 1.35], armBack: [0.7, 0.5],
      legFront: [0.5, -0.3], legBack: [-0.45, 0.3], squashX: 0.94, squashY: 1.04,
      expression: 'focused', headTurn: 0.7,
    }), 0.055, 0),
    frame(pose({
      lean: 0.5, hipY: 0.2, armFront: [1.62, 0.05], armBack: [1.1, 0.6],
      legFront: [0.75, -0.4], legBack: [-0.7, 0.25], squashX: 1.12, squashY: 0.94,
      expression: 'strain', headTurn: 0.9,
    }), 0.085, 1),
    frame(pose({
      lean: 0.34, hipY: 0.6, armFront: [1.3, 0.35], armBack: [0.8, 0.5],
      legFront: [0.6, -0.3], legBack: [-0.55, 0.25], squashX: 1.04,
      expression: 'determined', headTurn: 0.85,
    }), 0.09, 0.45),
  ], { loop: false })

  b.add('dash', [
    frame(pose({
      lean: 0.62, hipY: 1.4, legFront: [-1.1, 0.5], legBack: [1.15, 0.3],
      armFront: [1.8, 0.2], armBack: [-1.85, 0.3], squashX: 1.14, squashY: 0.9,
      expression: 'strain', headTurn: 0.95, drag: 1.8,
    }), 1),
  ], { loop: false })

  // ── Water ─────────────────────────────────────────────────────────────────
  b.add('swim', [
    frame(pose({
      lean: 0.9, hipY: 2, legFront: [1.3, -0.4], legBack: [-1.2, 0.5],
      armFront: [-1.7, 0.6], armBack: [1.5, 0.4], headTilt: 0.25,
      expression: 'strain', headTurn: 0.8,
    }), 0.16),
    frame(pose({
      lean: 0.9, hipY: 1.2, legFront: [-1.2, 0.5], legBack: [1.3, -0.4],
      armFront: [1.5, 0.4], armBack: [-1.7, 0.6], headTilt: 0.25,
      expression: 'strain', headTurn: 0.8,
    }), 0.16),
  ])

  b.add('climb', [
    frame(pose({
      lean: 0.05, hipY: 0.4, armFront: [-2.7, 0.2], armBack: [2.5, 0.3],
      legFront: [0.7, -0.5], legBack: [-0.7, 0.45], expression: 'focused', headTurn: 0.3,
    }), 0.17),
    frame(pose({
      lean: 0.05, hipY: -0.4, armFront: [2.5, 0.3], armBack: [-2.7, 0.2],
      legFront: [-0.7, 0.45], legBack: [0.7, -0.5], expression: 'focused', headTurn: 0.3,
    }), 0.17),
  ])

  b.alias('walk', 'run')
  return b.build()
}

export function buildCrewSheets(): Record<CrewId, SpriteSheet> {
  const ids: CrewId[] = ['luffy', 'zoro', 'nami', 'sanji', 'usopp', 'chopper']
  return ids.reduce((acc, id) => {
    acc[id] = buildCrewSheet(id)
    return acc
  }, {} as Record<CrewId, SpriteSheet>)
}

export { LOOKS }
