import { cel, mix, type Cel } from '../color'
import { blob, curve, paint, type Pt } from '../ink'

/**
 * The shared character rig.
 *
 * All six crew members are the same skeleton with different palettes,
 * silhouettes and props. Sharing the rig is what makes six characters read as
 * one cast, and it means an improvement to the run cycle lands on everybody at
 * once. Poses are joint angles, not baked drawings, so a new animation is a
 * list of numbers.
 *
 * Two ideas do most of the work here. The first is the radius *profile*: a limb
 * is not a capsule but a sampled silhouette, widest at the deltoid or the calf
 * and pinched at the joint below, which is the whole difference between a body
 * and a stack of sausages. The second is *body space* — costumes are authored
 * in (u, v) along the spine and across the chest, so a jacket lapel stays on
 * the lapel however far the torso leans.
 */

/** Frame size in world units. A character stands about 36 units tall. */
export const FW = 54
export const FH = 50
/**
 * The figure's centre line inside a frame. Animations that need more room —
 * a punch, a sword arc — widen the frame to the right but keep this origin, so
 * the sheet's offset never has to move with them.
 */
export const CX = FW / 2
export const GROUND_Y = FH - 1.5

/** Segment lengths, in world units. */
export const SEG = {
  thigh: 8,
  shin: 7.4,
  foot: 2.8,
  torso: 10.8,
  neck: 1.2,
  upperArm: 6.1,
  foreArm: 5.6,
  hand: 1.6,
  headR: 4.25,
} as const

/**
 * Per-character proportions, as multipliers on SEG.
 *
 * Ten crew members cannot all be the same skeleton scaled up and down: a
 * cyborg is forearms and shoulders on short legs, a living skeleton is all
 * length, a fishman is a barrel. Scaling the whole figure only changes how far
 * away it looks — changing the *ratios* is what changes who it is.
 */
export interface Proportion {
  thigh: number
  shin: number
  foot: number
  torso: number
  neck: number
  upperArm: number
  foreArm: number
  headR: number
  /** How far out from the spine the arms and legs are rooted. */
  armRoot: number
  legRoot: number
}

export const SIZE: Proportion = {
  thigh: 1, shin: 1, foot: 1, torso: 1, neck: 1,
  upperArm: 1, foreArm: 1, headR: 1, armRoot: 1, legRoot: 1,
}

export const proportion = (o: Partial<Proportion> = {}): Proportion => ({ ...SIZE, ...o })

/** Segment lengths in world units after a character's proportions are applied. */
export interface Segments {
  thigh: number
  shin: number
  foot: number
  torso: number
  neck: number
  upperArm: number
  foreArm: number
  headR: number
}

export const segmentsOf = (z: Proportion): Segments => ({
  thigh: SEG.thigh * z.thigh,
  shin: SEG.shin * z.shin,
  foot: SEG.foot * z.foot,
  torso: SEG.torso * z.torso,
  neck: SEG.neck * z.neck,
  upperArm: SEG.upperArm * z.upperArm,
  foreArm: SEG.foreArm * z.foreArm,
  headR: SEG.headR * z.headR,
})

export interface Pose {
  /** Hip offset from the neutral standing position. */
  hipX: number
  hipY: number
  /**
   * Spine compression, added to the torso length. Negative shortens it. The run
   * cycle uses this to eat part of the hip bob so the head stays level while
   * the body bounces underneath it — the single cue that separates a run from
   * a hop.
   */
  spine: number
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
  /**
   * Secondary motion. `drag` is horizontal lag — hair and cloth stream backward
   * by this much; `lift` is vertical lag, so a rising body leaves its coat tails
   * hanging; `flutter` is a phase 0..1 that runs a wave down every loose piece
   * so two adjacent frames never hold the same cloth.
   */
  drag: number
  lift: number
  flutter: number
}

export type Expression =
  | 'neutral'
  | 'determined'
  | 'surprised'
  | 'strain'
  | 'hurt'
  | 'joy'
  | 'focused'
  | 'shout'
  | 'smug'

export const pose = (o: Partial<Pose> = {}): Pose => ({
  hipX: 0,
  hipY: 0,
  spine: 0,
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
  lift: 0,
  flutter: 0,
  ...o,
})

/** Linear blend between two poses — used to generate in-betweens cheaply. */
export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const n = (x: number, y: number) => x + (y - x) * t
  const p = (x: [number, number], y: [number, number]): [number, number] => [n(x[0], y[0]), n(x[1], y[1])]
  return {
    hipX: n(a.hipX, b.hipX),
    hipY: n(a.hipY, b.hipY),
    spine: n(a.spine, b.spine),
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
    lift: n(a.lift, b.lift),
    flutter: n(a.flutter, b.flutter),
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
  /** Unit vector along the spine, hips → shoulders. */
  up: Pt
  /** Unit vector across the chest, left → right. */
  across: Pt
  torsoLen: number
  /** Head radius for this character, in world units. */
  headR: number
  /** Resolved segment lengths, so painters can hang props off real bones. */
  seg: Segments
  /** Secondary-motion terms, carried through so props can read them. */
  drag: number
  lift: number
  flutter: number
}

const step = (from: Pt, angle: number, len: number): Pt => [
  from[0] + Math.sin(angle) * len,
  from[1] + Math.cos(angle) * len,
]

/** Solve the skeleton for a pose. Angles are absolute, measured from down. */
export function solve(p: Pose, size: Proportion = SIZE): Skeleton {
  const seg = segmentsOf(size)
  const torsoLen = seg.torso + p.spine
  const up: Pt = [Math.sin(p.lean), -Math.cos(p.lean)]
  const across: Pt = [Math.cos(p.lean), Math.sin(p.lean)]

  const hip: Pt = [CX + p.hipX, GROUND_Y - seg.thigh - seg.shin + p.hipY]
  const shoulder: Pt = [hip[0] + up[0] * torsoLen, hip[1] + up[1] * torsoLen]
  const neck: Pt = [shoulder[0] + up[0] * seg.neck, shoulder[1] + up[1] * seg.neck]
  const head: Pt = [
    neck[0] + Math.sin(p.lean + p.headTilt) * seg.headR,
    neck[1] - Math.cos(p.lean + p.headTilt) * seg.headR,
  ]

  // Arms hang from the outside of the shoulder line rather than the spine —
  // narrow-set arms are what made the old figure read as a stick.
  const arm = (a: [number, number], side: number): [Pt, Pt, Pt] => {
    const root: Pt = [
      shoulder[0] + across[0] * side * 3.05 * size.armRoot - up[0] * 0.7,
      shoulder[1] + across[1] * side * 3.05 * size.armRoot - up[1] * 0.7 + p.roll * side,
    ]
    const elbow = step(root, a[0], seg.upperArm)
    const hand = step(elbow, a[0] + a[1], seg.foreArm)
    return [root, elbow, hand]
  }
  const leg = (a: [number, number], side: number): [Pt, Pt, Pt] => {
    const root: Pt = [
      hip[0] + across[0] * side * 1.9 * size.legRoot,
      hip[1] + across[1] * side * 1.9 * size.legRoot,
    ]
    const knee = step(root, a[0], seg.thigh)
    const ankle = step(knee, a[0] + a[1], seg.shin)
    return [root, knee, ankle]
  }

  const legFront = leg(p.legFront, 0.6)
  const legBack = leg(p.legBack, -0.6)

  const foot = (l: [Pt, Pt, Pt], angle: number): [Pt, Pt] => {
    const ankle = l[2]
    return [ankle, [ankle[0] + Math.cos(angle) * seg.foot, ankle[1] + Math.sin(angle) * seg.foot]]
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
    up,
    across,
    torsoLen,
    headR: seg.headR,
    seg,
    drag: p.drag,
    lift: p.lift,
    flutter: p.flutter,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Geometry helpers
// ─────────────────────────────────────────────────────────────────────────────

export function midpoint(a: Pt, b: Pt): Pt {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
}

export const lerpPt = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

export const angleOf = (a: Pt, b: Pt): number => Math.atan2(b[1] - a[1], b[0] - a[0])

export const dist = (a: Pt, b: Pt): number => Math.hypot(b[0] - a[0], b[1] - a[1])

/**
 * Displace a point by the pose's secondary motion.
 *
 * Everything loose — a hat brim, a coat tail, the tip of a hair lock — is a
 * frame behind the body. `k` is how far down the loose piece the point sits, so
 * a root barely moves and a tip whips.
 */
export const lag = (p: Pt, s: Skeleton, k: number): Pt => [
  p[0] - s.drag * k,
  p[1] - s.lift * k * 0.62 + Math.sin(s.flutter * Math.PI * 2) * k * 0.22,
]

// ─────────────────────────────────────────────────────────────────────────────
// Limb forms
// ─────────────────────────────────────────────────────────────────────────────

/** Radius profile along a limb: [t, radius] samples from root to tip. */
export type Profile = ReadonlyArray<readonly [number, number]>

/**
 * Limb cross-sections.
 *
 * Where a limb is widest is what names it. The deltoid caps the upper arm just
 * below the shoulder, the calf swells just below the knee and pinches hard into
 * the ankle, and the thigh is heavier than the shin all the way down.
 */
export const FORM: Record<'thigh' | 'shin' | 'upperArm' | 'foreArm', Profile> = {
  thigh: [[0, 2.66], [0.24, 2.5], [0.7, 1.98], [1, 1.72]],
  shin: [[0, 1.8], [0.22, 2.1], [0.6, 1.42], [1, 0.98]],
  upperArm: [[0, 1.78], [0.14, 2.14], [0.5, 1.54], [1, 1.28]],
  foreArm: [[0, 1.36], [0.26, 1.52], [0.68, 1.08], [1, 0.84]],
}

const maxRadius = (p: Profile): number => p.reduce((m, [, r]) => Math.max(m, r), 0)

function profileAt(p: Profile, t: number): number {
  if (t <= p[0][0]) return p[0][1]
  for (let i = 1; i < p.length; i++) {
    if (t <= p[i][0]) {
      const [t0, r0] = p[i - 1]
      const [t1, r1] = p[i]
      return r0 + (r1 - r0) * ((t - t0) / (t1 - t0 || 1))
    }
  }
  return p[p.length - 1][1]
}

const scaleProfile = (p: Profile, k: number): Profile => p.map(([t, r]) => [t, r * k] as const)

/** The first `t1` of a profile, remapped to 0..1 — a sleeve over an arm. */
function sliceProfile(p: Profile, t1: number, puff: number): Profile {
  const out: Array<[number, number]> = []
  for (const [t, r] of p) if (t < t1 - 0.02) out.push([t / t1, r * puff])
  if (out.length === 0) out.push([0, p[0][1] * puff])
  out.push([1, profileAt(p, t1) * puff])
  return out
}

/**
 * A limb silhouette from a radius profile, optionally bowed sideways.
 *
 * The bow is small but it matters: perfectly straight limbs are the giveaway of
 * a rig, and a forearm that curves a quarter of a unit reads as a forearm.
 */
export function limbForm(a: Pt, b: Pt, profile: Profile, bow = 0): Path2D {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const nx = -uy
  const ny = ux
  const at = (t: number, r: number): Pt => {
    const off = r + Math.sin(t * Math.PI) * bow
    return [a[0] + ux * len * t + nx * off, a[1] + uy * len * t + ny * off]
  }
  const n = profile.length
  const pts: Pt[] = []
  for (const [t, r] of profile) pts.push(at(t, r))
  const rEnd = profile[n - 1][1]
  pts.push([b[0] + ux * rEnd * 0.92, b[1] + uy * rEnd * 0.92])
  for (let i = n - 1; i >= 0; i--) pts.push(at(profile[i][0], -profile[i][1]))
  const r0 = profile[0][1]
  pts.push([a[0] - ux * r0 * 0.92, a[1] - uy * r0 * 0.92])
  return blob(pts, 0.76)
}

const LIMB_OPTS = { shadow: 0.44, rim: 0.55, line: 0.44, occlusion: 0.18 } as const

function paintLimb(
  ctx: CanvasRenderingContext2D,
  a: Pt,
  b: Pt,
  profile: Profile,
  c: Cel,
  scale: number,
  bow = 0,
): Path2D {
  const prof = scaleProfile(profile, scale)
  const path = limbForm(a, b, prof, bow * scale)
  paint(ctx, path, c, { ...LIMB_OPTS, radius: maxRadius(prof), pivot: midpoint(a, b) })
  return path
}

// ─────────────────────────────────────────────────────────────────────────────
// Hands
// ─────────────────────────────────────────────────────────────────────────────

export interface HandStyle {
  glove?: Cel | null
  /** 1 = fist, 0 = open flat hand. */
  grip?: number
  /** Which side of the forearm the thumb sits on. */
  thumb?: 1 | -1
}

/**
 * A hand with a visible thumb.
 *
 * At this size fingers are noise, but a thumb is a silhouette: it is what stops
 * a hand reading as a knob on the end of an arm, and it tells the eye which way
 * the palm faces.
 */
export function drawHand(
  ctx: CanvasRenderingContext2D,
  wrist: Pt,
  dir: number,
  skin: Cel,
  scale = 1,
  style: HandStyle = {},
): void {
  const c = style.glove ?? skin
  const grip = style.grip ?? 1
  const th = style.thumb ?? -1
  const ux = Math.cos(dir)
  const uy = Math.sin(dir)
  const nx = -uy * th
  const ny = ux * th
  const P = (x: number, y: number): Pt => [
    wrist[0] + (ux * x + nx * y) * scale,
    wrist[1] + (uy * x + ny * y) * scale,
  ]

  // Thumb first, so the palm's ink line closes over its root.
  paint(
    ctx,
    limbForm(P(-0.45, -0.85), P(0.95 + grip * 0.2, -1.75 - grip * 0.15), [[0, 0.68], [0.55, 0.62], [1, 0.48]], 0.12),
    c,
    { shadow: 0.42, radius: 0.72, pivot: P(0.3, -1.3), rim: 0.36, line: 0.4 },
  )

  const reach = 1.5 + (1 - grip) * 0.85
  const palm = blob([
    P(-1.2, -0.98),
    P(0.35, -1.32),
    P(reach, -0.6),
    P(reach + 0.12, 0.62),
    P(0.55, 1.42),
    P(-0.8, 1.24),
    P(-1.42, 0.16),
  ], 0.86)
  paint(ctx, palm, c, { shadow: 0.42, radius: 1.6, pivot: wrist, rim: 0.5, line: 0.46 })

  // Two knuckle creases. Any more and the hand starts to fight the face.
  ctx.save()
  ctx.clip(palm)
  ctx.globalAlpha = 0.5
  ctx.strokeStyle = c.line
  ctx.lineWidth = 0.34 * scale
  ctx.stroke(curve([P(reach - 0.35, -0.5), P(reach - 0.55, 0.55)] as Pt[]))
  ctx.stroke(curve([P(0.25, -0.9), P(0.05, 0.35)] as Pt[]))
  ctx.restore()
}

// ─────────────────────────────────────────────────────────────────────────────
// Arms & legs
// ─────────────────────────────────────────────────────────────────────────────

export interface ArmStyle {
  /** 0 = bare arm, 1 = sleeve all the way to the wrist. */
  sleeve?: number
  cloth?: Cel | null
  /** A band at the sleeve's end — a cuff, a rolled hem, a bracer. */
  cuff?: Cel | null
  glove?: Cel | null
  /** A bracelet or wrap at the wrist. */
  band?: Cel | null
  grip?: number
  /** Multipliers on the limb's radius profile — a cyborg's forearm is not a swordsman's. */
  upperMass?: number
  foreMass?: number
  handScale?: number
  /**
   * Anything worn on the arm itself and shaped by its pose: plating and bolts,
   * a fin, a bandage. Drawn after the limb and before the hand, so it can cut
   * across the sleeve hem the way real hardware does.
   */
  deco?(ctx: CanvasRenderingContext2D, joints: [Pt, Pt, Pt], scale: number): void
}

export function drawArm(
  ctx: CanvasRenderingContext2D,
  joints: [Pt, Pt, Pt],
  skin: Cel,
  style: ArmStyle = {},
  scale = 1,
): void {
  const [root, elbow, wrist] = joints
  const foreDir = angleOf(elbow, wrist)
  const upperLen = dist(root, elbow)
  const foreLen = dist(elbow, wrist)
  const upperForm = scaleProfile(FORM.upperArm, style.upperMass ?? 1)
  const foreForm = scaleProfile(FORM.foreArm, style.foreMass ?? 1)

  paintLimb(ctx, root, elbow, upperForm, skin, scale)
  paintLimb(ctx, elbow, wrist, foreForm, skin, scale, 0.22)

  const sl = style.sleeve ?? 0
  if (sl > 0.03 && style.cloth) {
    const total = upperLen + foreLen
    const d = sl * total
    let hemAt: Pt
    let hemR: number
    if (d <= upperLen) {
      const t = Math.max(0.12, d / upperLen)
      hemAt = lerpPt(root, elbow, t)
      const prof = scaleProfile(sliceProfile(upperForm, t, 1.24), scale)
      hemR = prof[prof.length - 1][1]
      paint(ctx, limbForm(root, hemAt, prof), style.cloth, {
        shadow: 0.44, radius: maxRadius(prof), pivot: midpoint(root, hemAt), rim: 0.5, line: 0.46, occlusion: 0.2,
      })
    } else {
      const t = Math.min(0.98, (d - upperLen) / foreLen)
      hemAt = lerpPt(elbow, wrist, t)
      const upper = scaleProfile(scaleProfile(upperForm, 1.22), scale)
      paint(ctx, limbForm(root, elbow, upper), style.cloth, {
        shadow: 0.44, radius: maxRadius(upper), pivot: midpoint(root, elbow), rim: 0.5, line: 0.46, occlusion: 0.2,
      })
      const prof = scaleProfile(sliceProfile(foreForm, t, 1.2), scale)
      hemR = prof[prof.length - 1][1]
      paint(ctx, limbForm(elbow, hemAt, prof), style.cloth, {
        shadow: 0.44, radius: maxRadius(prof), pivot: midpoint(elbow, hemAt), rim: 0.5, line: 0.46,
      })
    }
    if (style.cuff) {
      const dir = d <= upperLen ? angleOf(root, elbow) : foreDir
      band(ctx, hemAt, dir, hemR * 1.06, 0.85 * scale, style.cuff)
    }
  }

  if (style.band) band(ctx, wrist, foreDir, 1.15 * scale, 0.6 * scale, style.band)
  style.deco?.(ctx, joints, scale)
  drawHand(ctx, wrist, foreDir, skin, scale * (style.handScale ?? 1), {
    glove: style.glove, grip: style.grip,
  })
}

/** A short band wrapped across a limb — cuffs, bracelets, boot tops, belts. */
export function band(
  ctx: CanvasRenderingContext2D,
  at: Pt,
  dir: number,
  halfWidth: number,
  thickness: number,
  c: Cel,
): void {
  const ux = Math.cos(dir)
  const uy = Math.sin(dir)
  const nx = -uy
  const ny = ux
  const P = (x: number, y: number): Pt => [at[0] + ux * x + nx * y, at[1] + uy * x + ny * y]
  paint(
    ctx,
    blob([
      P(-thickness, -halfWidth),
      P(thickness * 0.7, -halfWidth * 1.04),
      P(thickness * 0.7, halfWidth * 1.04),
      P(-thickness, halfWidth),
    ] as Pt[], 0.35),
    c,
    { shadow: 0.42, radius: thickness * 2, pivot: at, rim: 0.35, line: 0.42 },
  )
}

export interface LegStyle {
  /** 0 = bare leg, 0.45 = shorts, 1 = trouser to the ankle. */
  trouser?: number
  cloth?: Cel | null
  /** Skin shown where the trouser is not. */
  bare?: Cel | null
  boot: Cel
  /** Boot shaft height as a fraction of the shin, measured up from the ankle. */
  shaft?: number
  cuff?: Cel | null
  /** Sole colour; defaults to a darkened boot. */
  sole?: Cel | null
  /** Multipliers on the leg's radius profile. */
  thighMass?: number
  shinMass?: number
  /** Foot size, for a sandal against a cyborg's boot. */
  footScale?: number
  /** Hardware on the leg — plating, a fin, a greave. */
  deco?(ctx: CanvasRenderingContext2D, joints: [Pt, Pt, Pt], scale: number): void
}

export function drawLeg(
  ctx: CanvasRenderingContext2D,
  joints: [Pt, Pt, Pt],
  footJoints: [Pt, Pt],
  style: LegStyle,
  scale = 1,
): void {
  const [root, knee, ankle] = joints
  const base = style.bare ?? style.cloth ?? style.boot
  const thighLen = dist(root, knee)
  const shinLen = dist(knee, ankle)
  const thighForm = scaleProfile(FORM.thigh, style.thighMass ?? 1)
  const shinForm = scaleProfile(FORM.shin, style.shinMass ?? 1)

  paintLimb(ctx, root, knee, thighForm, base, scale)
  paintLimb(ctx, knee, ankle, shinForm, base, scale, -0.2)

  const tr = style.trouser ?? 1
  if (tr > 0.03 && style.cloth) {
    const total = thighLen + shinLen
    const d = tr * total
    let hemAt: Pt
    let hemR: number
    if (d <= thighLen) {
      const t = Math.max(0.15, d / thighLen)
      hemAt = lerpPt(root, knee, t)
      const prof = scaleProfile(sliceProfile(thighForm, t, 1.2), scale)
      hemR = prof[prof.length - 1][1]
      paint(ctx, limbForm(root, hemAt, prof), style.cloth, {
        shadow: 0.44, radius: maxRadius(prof), pivot: midpoint(root, hemAt), rim: 0.5, line: 0.48, occlusion: 0.22,
      })
    } else {
      const t = Math.min(0.99, (d - thighLen) / shinLen)
      hemAt = lerpPt(knee, ankle, t)
      const thigh = scaleProfile(scaleProfile(thighForm, 1.16), scale)
      paint(ctx, limbForm(root, knee, thigh), style.cloth, {
        shadow: 0.44, radius: maxRadius(thigh), pivot: midpoint(root, knee), rim: 0.5, line: 0.48, occlusion: 0.22,
      })
      const prof = scaleProfile(sliceProfile(shinForm, t, 1.16), scale)
      hemR = prof[prof.length - 1][1]
      paint(ctx, limbForm(knee, hemAt, prof), style.cloth, {
        shadow: 0.44, radius: maxRadius(prof), pivot: midpoint(knee, hemAt), rim: 0.5, line: 0.48,
      })
      // A knee fold: cloth always breaks where the joint does.
      ctx.save()
      ctx.globalAlpha = 0.4
      ctx.strokeStyle = style.cloth.deep
      ctx.lineWidth = 0.5 * scale
      ctx.stroke(curve([
        lerpPt(root, knee, 0.86),
        lerpPt(knee, ankle, 0.1),
      ] as Pt[]))
      ctx.restore()
    }
    if (style.cuff) {
      const dir = d <= thighLen ? angleOf(root, knee) : angleOf(knee, ankle)
      band(ctx, hemAt, dir, hemR * 1.05, 0.7 * scale, style.cuff)
    }
  }

  const shaft = style.shaft ?? 0
  if (shaft > 0.03) {
    const top = lerpPt(ankle, knee, shaft)
    const prof = scaleProfile([
      [0, profileAt(shinForm, 1 - shaft) * 1.14],
      [0.7, 1.22 * (style.shinMass ?? 1)],
      [1, 1.16 * (style.shinMass ?? 1)],
    ], scale)
    paint(ctx, limbForm(top, ankle, prof), style.boot, {
      shadow: 0.44, radius: maxRadius(prof), pivot: midpoint(top, ankle), rim: 0.5, line: 0.48,
    })
    if (style.cuff) band(ctx, top, angleOf(knee, ankle), 1.35 * scale, 0.62 * scale, style.cuff)
  }

  style.deco?.(ctx, joints, scale)
  drawShoe(ctx, footJoints[0], footJoints[1], style.boot, style.sole ?? null, scale * (style.footScale ?? 1))
}

/** A shoe with a heel, an instep and a sole — never a flat oval. */
export function drawShoe(
  ctx: CanvasRenderingContext2D,
  ankle: Pt,
  toe: Pt,
  c: Cel,
  sole: Cel | null,
  scale = 1,
): void {
  const dir = angleOf(ankle, toe)
  const ux = Math.cos(dir)
  const uy = Math.sin(dir)
  const nx = -uy
  const ny = ux
  const P = (x: number, y: number): Pt => [
    ankle[0] + (ux * x + nx * y) * scale,
    ankle[1] + (uy * x + ny * y) * scale,
  ]
  const upper = blob([
    P(-1.8, -1.1),
    P(-0.3, -1.9),
    P(1.5, -1.55),
    P(3.05, -0.5),
    P(3.15, 0.75),
    P(1.2, 1.05),
    P(-1.9, 1.0),
  ] as Pt[], 0.72)
  paint(ctx, upper, c, { shadow: 0.42, radius: 2.2, pivot: P(0.4, 0), rim: 0.5, line: 0.48, occlusion: 0.22 })
  if (sole) {
    paint(
      ctx,
      blob([
        P(-1.95, 0.35),
        P(1.4, 0.5),
        P(3.15, 0.4),
        P(3.1, 0.95),
        P(1.2, 1.15),
        P(-2.0, 1.08),
      ] as Pt[], 0.5),
      sole,
      { shadow: 0.3, radius: 1.2, pivot: P(0.4, 0.8), line: 0.4 },
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Torso & body space
// ─────────────────────────────────────────────────────────────────────────────

export interface Palette {
  skin: Cel
  hair: Cel
  shirt: Cel
  trousers: Cel
  boots: Cel
  accent: Cel
  sash: Cel
  coat: Cel
  trim: Cel
}

/**
 * Depth cue: everything on the far side of the body loses contrast.
 *
 * `amount` is how far back the part sits — a far arm is a long way behind the
 * chest, a coat back only a little, and pushing both the same distance is what
 * flattens a figure into a paper doll.
 */
export const recede = (c: Cel, amount = 0.34): Cel =>
  cel(mix(c.core, '#5A6B90', amount), { lineDarkness: 0.44 })

export const recedePalette = (p: Palette, amount = 0.34): Palette => ({
  skin: recede(p.skin, amount),
  hair: recede(p.hair, amount),
  shirt: recede(p.shirt, amount),
  trousers: recede(p.trousers, amount),
  boots: recede(p.boots, amount),
  accent: recede(p.accent, amount),
  sash: recede(p.sash, amount),
  coat: recede(p.coat, amount),
  trim: recede(p.trim, amount),
})

export interface Build {
  shoulder: number
  chest: number
  waist: number
  hip: number
}

export const BUILD: Build = { shoulder: 4.6, chest: 4.15, waist: 2.95, hip: 3.8 }

/**
 * A point in body space: `u` runs 0 at the hips to 1 at the shoulders, `v` runs
 * across the chest, negative behind and positive toward the facing side.
 * Costumes are authored here so a lapel stays a lapel through any lean.
 */
export function bodyPoint(s: Skeleton, u: number, v: number): Pt {
  return [
    s.hip[0] + s.up[0] * s.torsoLen * u + s.across[0] * v,
    s.hip[1] + s.up[1] * s.torsoLen * u + s.across[1] * v,
  ]
}

/** The bare torso outline: trapezius, ribcage, waist pinch, hips. */
export function torsoPath(s: Skeleton, b: Build = BUILD, grow = 0): Path2D {
  const p = (u: number, v: number) => bodyPoint(s, u, v)
  const sh = b.shoulder + grow
  const ch = b.chest + grow
  const wa = b.waist + grow
  const hp = b.hip + grow
  return blob([
    p(1.0, -sh),
    p(1.07, -sh * 0.42),
    p(1.07, sh * 0.42),
    p(1.0, sh),
    p(0.64, ch),
    p(0.32, wa),
    p(-0.02, hp),
    p(-0.06, 0),
    p(-0.02, -hp),
    p(0.32, -wa),
    p(0.64, -ch),
  ] as Pt[], 0.6)
}

export function drawBody(
  ctx: CanvasRenderingContext2D,
  s: Skeleton,
  c: Cel,
  b: Build = BUILD,
  grow = 0,
): Path2D {
  const path = torsoPath(s, b, grow)
  paint(ctx, path, c, {
    shadow: 0.44,
    radius: b.shoulder + grow,
    pivot: bodyPoint(s, 0.5, 0),
    rim: 0.6,
    line: 0.5,
    occlusion: 0.28,
  })
  return path
}

/**
 * Cloth folds authored in body space and clipped to a garment.
 *
 * Folds go where the body bends — the armpit, the waist, the hip — and nowhere
 * else. Scattering them evenly is what makes cloth read as wallpaper.
 */
export function bodyFolds(
  ctx: CanvasRenderingContext2D,
  clip: Path2D,
  s: Skeleton,
  segs: Array<Array<[number, number]>>,
  color: string,
  alpha = 0.42,
  width = 0.52,
): void {
  ctx.save()
  ctx.clip(clip)
  ctx.globalAlpha = alpha
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  for (const seg of segs) ctx.stroke(curve(seg.map(([u, v]) => bodyPoint(s, u, v)) as Pt[]))
  ctx.restore()
}

// ─────────────────────────────────────────────────────────────────────────────
// Loose cloth
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A trailing strip of cloth or hair.
 *
 * The strip is integrated step by step: each step turns by `curl` and by a wave
 * driven by `phase`, so the piece bends progressively instead of pivoting about
 * its root. Feeding the pose's drag into `curl` is what makes a bandana whip
 * when the body changes direction.
 */
export function ribbon(
  root: Pt,
  angle: number,
  len: number,
  w0: number,
  w1: number,
  curl: number,
  wave = 0,
  phase = 0,
  steps = 5,
): Pt[] {
  const top: Pt[] = []
  const bottom: Pt[] = []
  let x = root[0]
  let y = root[1]
  let a = angle
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const w = w0 + (w1 - w0) * t
    top.push([x - Math.sin(a) * w, y + Math.cos(a) * w])
    bottom.push([x + Math.sin(a) * w, y - Math.cos(a) * w])
    a += curl / steps + Math.sin(phase * Math.PI * 2 + t * 3.6) * wave
    x += Math.cos(a) * (len / steps)
    y += Math.sin(a) * (len / steps)
  }
  return [...top, ...bottom.reverse()]
}

/** Paint a ribbon in the house style. */
export function drawRibbon(
  ctx: CanvasRenderingContext2D,
  pts: Pt[],
  c: Cel,
  pivot: Pt,
  radius = 3,
): Path2D {
  const path = blob(pts, 0.88)
  paint(ctx, path, c, { shadow: 0.5, radius, pivot, rim: 0.42, line: 0.46, occlusion: 0.2 })
  return path
}

/**
 * A hem that swings: the bottom edge of a skirt, a coat or a vest, hung from a
 * straight top edge and displaced by the pose's drag.
 */
export function hemShape(
  left: Pt,
  right: Pt,
  drop: number,
  s: Skeleton,
  sway = 1,
): Pt[] {
  const mid = midpoint(left, right)
  const d = s.drag * sway
  const l = s.lift * sway * 0.5
  return [
    left,
    right,
    [right[0] + d * 0.5, right[1] + drop * 0.72 - l],
    [mid[0] + d, mid[1] + drop - l * 1.2],
    [left[0] + d * 1.15, left[1] + drop * 0.78 - l],
  ] as Pt[]
}

export { mix }
