import { cel, mix, type Cel } from '../color'
import { blob, curve, ellipsePath, limbPath, paint, type Pt } from '../ink'

/**
 * The shared character rig.
 *
 * All six crew members are the same skeleton with different palettes,
 * silhouettes and props. Sharing the rig is what makes six characters read as
 * one cast, and it means an improvement to the run cycle lands on everybody at
 * once. Poses are joint angles, not baked drawings, so a new animation is a
 * list of numbers.
 */

/** Frame size in world units. A character stands about 34 units tall. */
export const FW = 50
export const FH = 48

export const GROUND_Y = FH - 1.5
/** Segment lengths, in world units. */
export const SEG = {
  thigh: 7.4,
  shin: 6.8,
  foot: 2.6,
  torso: 11.4,
  neck: 1.6,
  upperArm: 6.2,
  foreArm: 5.8,
  hand: 1.5,
  headR: 3.9,
} as const

export interface Pose {
  /** Hip offset from the neutral standing position. */
  hipX: number
  hipY: number
  /** Torso tilt in radians, positive leans forward. */
  lean: number
  /** Shoulder line roll, for weight shifts. */
  roll: number
  /** [upper, fore] angles in radians, measured from straight down. */
  armFront: [number, number]
  armBack: [number, number]
  legFront: [number, number]
  legBack: [number, number]
  /** Foot angles relative to the shin. */
  footFront: number
  footBack: number
  headTilt: number
  /** -1 looks back, 0 profile-forward, 1 looks ahead. */
  headTurn: number
  /** Body-wide squash, applied about the feet. */
  squashX: number
  squashY: number
  expression: Expression
  /** 0..1 how much hair and cloth trail behind the motion. */
  drag: number
}

export type Expression =
  | 'neutral'
  | 'determined'
  | 'surprised'
  | 'strain'
  | 'hurt'
  | 'joy'
  | 'focused'

export const pose = (o: Partial<Pose> = {}): Pose => ({
  hipX: 0,
  hipY: 0,
  lean: 0.04,
  roll: 0,
  armFront: [0.18, 0.25],
  armBack: [-0.2, 0.2],
  legFront: [0.06, -0.04],
  legBack: [-0.08, 0.05],
  footFront: 0,
  footBack: 0,
  headTilt: 0,
  headTurn: 0.7,
  squashX: 1,
  squashY: 1,
  expression: 'neutral',
  drag: 0,
  ...o,
})

/** Linear blend between two poses — used to generate in-betweens cheaply. */
export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const n = (x: number, y: number) => x + (y - x) * t
  const p = (x: [number, number], y: [number, number]): [number, number] => [n(x[0], y[0]), n(x[1], y[1])]
  return {
    hipX: n(a.hipX, b.hipX),
    hipY: n(a.hipY, b.hipY),
    lean: n(a.lean, b.lean),
    roll: n(a.roll, b.roll),
    armFront: p(a.armFront, b.armFront),
    armBack: p(a.armBack, b.armBack),
    legFront: p(a.legFront, b.legFront),
    legBack: p(a.legBack, b.legBack),
    footFront: n(a.footFront, b.footFront),
    footBack: n(a.footBack, b.footBack),
    headTilt: n(a.headTilt, b.headTilt),
    headTurn: n(a.headTurn, b.headTurn),
    squashX: n(a.squashX, b.squashX),
    squashY: n(a.squashY, b.squashY),
    expression: t < 0.5 ? a.expression : b.expression,
    drag: n(a.drag, b.drag),
  }
}

/** Resolved joint positions in frame space, ready to draw. */
export interface Skeleton {
  hip: Pt
  shoulder: Pt
  neck: Pt
  head: Pt
  armFront: [Pt, Pt, Pt]
  armBack: [Pt, Pt, Pt]
  legFront: [Pt, Pt, Pt]
  legBack: [Pt, Pt, Pt]
  footFront: [Pt, Pt]
  footBack: [Pt, Pt]
  lean: number
  headTilt: number
}

const step = (from: Pt, angle: number, len: number): Pt => [
  from[0] + Math.sin(angle) * len,
  from[1] + Math.cos(angle) * len,
]

/** Solve the skeleton for a pose. Angles are absolute, measured from down. */
export function solve(p: Pose): Skeleton {
  const cx = FW / 2
  const hip: Pt = [cx + p.hipX, GROUND_Y - SEG.thigh - SEG.shin + p.hipY]
  const shoulder: Pt = [
    hip[0] + Math.sin(p.lean) * SEG.torso,
    hip[1] - Math.cos(p.lean) * SEG.torso,
  ]
  const neck: Pt = [
    shoulder[0] + Math.sin(p.lean) * SEG.neck,
    shoulder[1] - Math.cos(p.lean) * SEG.neck,
  ]
  const head: Pt = [
    neck[0] + Math.sin(p.lean + p.headTilt) * SEG.headR,
    neck[1] - Math.cos(p.lean + p.headTilt) * SEG.headR,
  ]

  const arm = (a: [number, number], side: number): [Pt, Pt, Pt] => {
    const root: Pt = [shoulder[0] + side * 1.1, shoulder[1] + 0.6 + p.roll * side]
    const elbow = step(root, a[0], SEG.upperArm)
    const hand = step(elbow, a[0] + a[1], SEG.foreArm)
    return [root, elbow, hand]
  }
  const leg = (a: [number, number], side: number): [Pt, Pt, Pt] => {
    const root: Pt = [hip[0] + side * 1.3, hip[1]]
    const knee = step(root, a[0], SEG.thigh)
    const ankle = step(knee, a[0] + a[1], SEG.shin)
    return [root, knee, ankle]
  }

  const legFront = leg(p.legFront, 0.6)
  const legBack = leg(p.legBack, -0.6)

  const foot = (l: [Pt, Pt, Pt], angle: number): [Pt, Pt] => {
    const ankle = l[2]
    return [ankle, [ankle[0] + Math.cos(angle) * SEG.foot, ankle[1] + Math.sin(angle) * SEG.foot]]
  }

  return {
    hip,
    shoulder,
    neck,
    head,
    armFront: arm(p.armFront, 1),
    armBack: arm(p.armBack, -1),
    legFront,
    legBack,
    footFront: foot(legFront, p.footFront),
    footBack: foot(legBack, p.footBack),
    lean: p.lean,
    headTilt: p.headTilt,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Part painters
// ─────────────────────────────────────────────────────────────────────────────

export interface Palette {
  skin: Cel
  hair: Cel
  shirt: Cel
  trousers: Cel
  boots: Cel
  accent: Cel
  sash: Cel
}

/** Depth cue: everything on the far side of the body loses contrast. */
export const recede = (c: Cel): Cel =>
  cel(mix(c.core, '#5A6B90', 0.32), { lineDarkness: 0.42 })

const LIMB_OPTS = { shadow: 0.44, rim: 0.55, line: 0.42 } as const

export function drawArm(
  ctx: CanvasRenderingContext2D,
  joints: [Pt, Pt, Pt],
  skin: Cel,
  sleeve: Cel | null,
  scale = 1,
): void {
  const [root, elbow, hand] = joints
  const upper = limbPath(root[0], root[1], elbow[0], elbow[1], 1.75 * scale, 1.4 * scale)
  const fore = limbPath(elbow[0], elbow[1], hand[0], hand[1], 1.4 * scale, 1.15 * scale)
  paint(ctx, upper, sleeve ?? skin, { ...LIMB_OPTS, radius: 1.8 * scale, pivot: midpoint(root, elbow) })
  paint(ctx, fore, skin, { ...LIMB_OPTS, radius: 1.4 * scale, pivot: midpoint(elbow, hand) })
  paint(ctx, ellipsePath(hand[0], hand[1], 1.5 * scale, 1.35 * scale), skin, {
    shadow: 0.4, radius: 1.5, pivot: hand, rim: 0.5, line: 0.42,
  })
}

export function drawLeg(
  ctx: CanvasRenderingContext2D,
  joints: [Pt, Pt, Pt],
  footJoints: [Pt, Pt],
  trousers: Cel,
  boots: Cel,
  scale = 1,
): void {
  const [root, knee, ankle] = joints
  const thigh = limbPath(root[0], root[1], knee[0], knee[1], 2.2 * scale, 1.75 * scale)
  const shin = limbPath(knee[0], knee[1], ankle[0], ankle[1], 1.75 * scale, 1.4 * scale)
  paint(ctx, thigh, trousers, { ...LIMB_OPTS, radius: 2.2 * scale, pivot: midpoint(root, knee) })
  paint(ctx, shin, trousers, { ...LIMB_OPTS, radius: 1.75 * scale, pivot: midpoint(knee, ankle) })
  const [a, toe] = footJoints
  const foot = blob([
    [a[0] - 1.5 * scale, a[1] - 1.1 * scale],
    [toe[0] + 0.6 * scale, toe[1] - 1.2 * scale],
    [toe[0] + 0.8 * scale, toe[1] + 0.8 * scale],
    [a[0] - 1.7 * scale, a[1] + 1 * scale],
  ] as Pt[], 0.7)
  paint(ctx, foot, boots, { shadow: 0.42, radius: 2, pivot: a, rim: 0.5, line: 0.45 })
}

/**
 * The torso, drawn as a tapered wedge from hips to shoulders. A wedge rather
 * than a rectangle is what gives the character a chest and a waist at this
 * size, where anatomy has to be implied rather than drawn.
 */
export function drawTorso(
  ctx: CanvasRenderingContext2D,
  s: Skeleton,
  pal: Palette,
  opts: { openVest?: boolean } = {},
): void {
  const { hip, shoulder } = s
  const nx = Math.cos(s.lean)
  const ny = Math.sin(s.lean)
  const shoulderW = 4.5
  const waistW = 3.2
  const body = blob([
    [shoulder[0] - shoulderW * nx, shoulder[1] - shoulderW * ny],
    [shoulder[0] + shoulderW * nx, shoulder[1] + shoulderW * ny],
    [hip[0] + waistW * nx, hip[1] + waistW * ny],
    [hip[0] - waistW * nx, hip[1] - waistW * ny],
  ] as Pt[], 0.55)
  paint(ctx, body, pal.shirt, {
    shadow: 0.44,
    radius: shoulderW,
    pivot: midpoint(hip, shoulder),
    rim: 0.6,
    line: 0.5,
    occlusion: 0.25,
  })

  if (opts.openVest) {
    // A strip of skin down the centre — the open-shirt silhouette.
    const chest = blob([
      [shoulder[0] - 1.5, shoulder[1] + 0.4],
      [shoulder[0] + 1.5, shoulder[1] + 0.4],
      [hip[0] + 1.1, hip[1] - 1],
      [hip[0] - 1.1, hip[1] - 1],
    ] as Pt[], 0.5)
    paint(ctx, chest, pal.skin, { shadow: 0.4, radius: 2, pivot: midpoint(hip, shoulder), line: 0 })
  }

  // Sash at the waist: the one horizontal in an otherwise vertical figure.
  const sash = blob([
    [hip[0] - waistW * nx - 0.4, hip[1] - waistW * ny - 1.6],
    [hip[0] + waistW * nx + 0.4, hip[1] + waistW * ny - 1.4],
    [hip[0] + waistW * nx + 0.3, hip[1] + waistW * ny + 1.2],
    [hip[0] - waistW * nx - 0.3, hip[1] - waistW * ny + 1],
  ] as Pt[], 0.4)
  paint(ctx, sash, pal.sash, { shadow: 0.4, radius: 2, pivot: hip, rim: 0.4, line: 0.45 })

  // Cloth folds: two short curves that sell the material at almost no cost.
  ctx.save()
  ctx.clip(body)
  ctx.globalAlpha = 0.4
  ctx.strokeStyle = pal.shirt.shade
  ctx.lineWidth = 0.55
  const mid = midpoint(hip, shoulder)
  ctx.stroke(curve([
    [mid[0] - 2.4, mid[1] - 1],
    [mid[0] - 1.2, mid[1] + 1.4],
    [mid[0] - 2, mid[1] + 3.2],
  ] as Pt[]))
  ctx.stroke(curve([
    [mid[0] + 1.6, mid[1] - 1.6],
    [mid[0] + 2.4, mid[1] + 0.8],
    [mid[0] + 1.8, mid[1] + 2.8],
  ] as Pt[]))
  ctx.restore()
}

export function midpoint(a: Pt, b: Pt): Pt {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
}
