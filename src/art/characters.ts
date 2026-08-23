import type { CrewId, SpriteSheet } from '../types'
import { mix } from './color'
import { SheetBuilder, type AnimSpec, type FrameSpec } from './atlas'
import type { Pt, Surface } from './ink'
import { LOOKS, CREW_SCALE, type Look } from './character/looks'
import {
  contourPass, drawFigure, drawGhosts, drawSmear, drawStreaks, type Ghost, type Smear,
} from './character/figure'
import { buildPortrait } from './character/portrait'
import {
  CX, FH, FW, GROUND_Y, lerpPose, pose, solve,
  type Expression, type Pose, type Skeleton,
} from './character/rig'

/**
 * The crew's animation sets.
 *
 * Every animation is a list of joint poses, blended and drawn through the
 * shared rig. Three rules run through all of them. Nothing starts without
 * anticipation — a jump crouches first, a punch winds back first. Nothing stops
 * without a recovery — a landing takes three frames to stand up. And the frames
 * that move fastest get a smear rather than a gap, because one blurred drawing
 * reads as speed where one missing drawing reads as a dropped frame.
 */

interface FrameOpts {
  attack?: number
  /** After-images of an earlier pose, for the frame a strike lands. */
  ghosts?: Ghost[]
  /** A stretched copy of this pose, trailing back the way the body came. */
  smear?: Omit<Smear, 'color'>
  /** Speed lines: [origin, angle, colour, [offset, length, alpha][]]. */
  streaks?: (s: Skeleton) => {
    from: Pt
    angle: number
    color: string
    lines: Array<[number, number, number]>
  }
}

const frameFor = (look: Look, scale: number) => {
  const trail = mix(look.banner, '#FFFFFF', 0.55)
  return (p: Pose, dur: number, opts: FrameOpts = {}): FrameSpec => ({
    dur,
    draw: (s: Surface, ctx: CanvasRenderingContext2D) => {
      if (opts.ghosts) drawGhosts(s, look, opts.ghosts, scale)
      if (opts.streaks) {
        const k = opts.streaks(solve(p, look.size))
        drawStreaks(ctx, k.from, k.angle, k.color, k.lines)
      }
      drawFigure(ctx, look, p, scale, { attack: opts.attack })
      contourPass(s, CONTOUR, 0.75)
      // After the contour: the trail is made from the finished figure's alpha,
      // outline included, so it reads as one shape rather than a hollow one.
      if (opts.smear) drawSmear(s, { color: trail, ...opts.smear })
    },
  })
}

/** The single unbroken line around every character. */
const CONTOUR = '#1A1428'

/** Animations whose extremes leave the standing frame need a wider canvas. */
const wide = (fw: number): AnimSpec => ({ loop: false, fw, ox: -CX })

// ─────────────────────────────────────────────────────────────────────────────
// Locomotion
// ─────────────────────────────────────────────────────────────────────────────

interface Key {
  lf: [number, number]
  lb: [number, number]
  af: [number, number]
  ab: [number, number]
  /** Hip height. Positive is lower — the down pose of the cycle. */
  hip: number
  ff: number
  fb: number
  sx: number
  sy: number
  /** Vertical velocity of the body, for cloth lag. */
  lift: number
}

/**
 * One key of a gait.
 *
 * `spine` eats most of the hip bob, which is the point of the whole cycle: the
 * hips drop two units through the down pose while the head stays within one, so
 * the body absorbs the step instead of the character hopping.
 */
const gait = (k: Key, phase: number, lean: number, drag: number, e: Expression): Pose =>
  pose({
    lean,
    hipY: k.hip,
    spine: k.hip * 0.62,
    legFront: k.lf,
    legBack: k.lb,
    armFront: k.af,
    armBack: k.ab,
    footFront: k.ff,
    footBack: k.fb,
    squashX: k.sx,
    squashY: k.sy,
    expression: e,
    headTurn: 0.86,
    headTilt: -k.hip * 0.014,
    drag,
    lift: k.lift,
    flutter: phase,
  })

/** The opposite half of a symmetric cycle: swap which side leads. */
const mirror = (k: Key): Key => ({
  ...k, lf: k.lb, lb: k.lf, af: k.ab, ab: k.af, ff: k.fb, fb: k.ff,
})

/** Contact, down, pass, up — the four poses every run cycle is made of. */
const RUN: Key[] = [
  // Contact: the front heel strikes, arms at full opposition, body at its longest.
  { lf: [0.76, -0.4], lb: [-0.66, 0.88], af: [-0.82, 0.62], ab: [0.9, 0.44], hip: 0.35, ff: 0.22, fb: -0.6, sx: 1.02, sy: 0.985, lift: -0.5 },
  // Down: the knee takes the weight and the hips reach their lowest point.
  { lf: [0.34, -0.68], lb: [-0.14, 0.82], af: [-0.46, 0.52], ab: [0.58, 0.4], hip: 1.5, ff: 0.05, fb: -0.15, sx: 1.055, sy: 0.945, lift: -1.1 },
  // Pass: the trailing leg swings through under the body with a high knee.
  { lf: [-0.14, -0.06], lb: [0.32, 0.98], af: [0.08, 0.34], ab: [0.14, 0.36], hip: -0.2, ff: -0.18, fb: 0.45, sx: 0.99, sy: 1.02, lift: 0.6 },
  // Up: push-off, both feet clear of the ground, the whole figure stretched.
  { lf: [-0.76, 0.22], lb: [0.84, 0.4], af: [0.74, 0.26], ab: [-0.68, 0.52], hip: -0.72, ff: -0.5, fb: 0.22, sx: 0.965, sy: 1.055, lift: 1.1 },
]

const WALK: Key[] = [
  { lf: [0.46, -0.18], lb: [-0.42, 0.5], af: [-0.4, 0.34], ab: [0.44, 0.28], hip: 0.2, ff: 0.18, fb: -0.3, sx: 1.01, sy: 0.995, lift: -0.2 },
  { lf: [0.18, -0.4], lb: [-0.06, 0.46], af: [-0.2, 0.3], ab: [0.24, 0.26], hip: 0.85, ff: 0.02, fb: -0.05, sx: 1.03, sy: 0.97, lift: -0.5 },
  { lf: [-0.12, -0.06], lb: [0.2, 0.6], af: [0.04, 0.26], ab: [0.06, 0.26], hip: -0.15, ff: -0.1, fb: 0.3, sx: 0.995, sy: 1.01, lift: 0.35 },
]

// ─────────────────────────────────────────────────────────────────────────────
// Attacks
// ─────────────────────────────────────────────────────────────────────────────

type AttackStyle = Look['attackStyle']

/**
 * Wind-up, a single-frame extreme, and a recovery that takes longer than both.
 *
 * The extreme is one frame on purpose: holding it makes the strike feel slow,
 * and cutting to it from a deeply coiled pose is what gives the hit its snap.
 * The smear on that frame spans the gap the pose jumps across.
 */
function attackPoses(style: AttackStyle): Array<{ p: Pose; dur: number; attack: number; smear?: boolean }> {
  const common = { headTurn: 0.9 } as const
  switch (style) {
    case 'slash':
      return [
        { p: pose({ ...common, lean: -0.2, hipY: 0.7, armFront: [-2.5, 0.6], armBack: [-1.5, 0.7], legFront: [0.5, -0.3], legBack: [-0.46, 0.3], expression: 'focused', drag: -0.7, squashY: 1.04 }), dur: 0.05, attack: 0.12 },
        { p: pose({ ...common, lean: -0.34, hipY: 1.2, armFront: [-2.85, 0.4], armBack: [-1.9, 0.6], legFront: [0.62, -0.42], legBack: [-0.58, 0.26], expression: 'strain', drag: -1.5, squashX: 0.92, squashY: 1.06 }), dur: 0.055, attack: 0.3 },
        { p: pose({ ...common, lean: 0.46, hipY: 0.3, armFront: [0.95, 0.3], armBack: [0.5, 0.8], legFront: [0.86, -0.5], legBack: [-0.76, 0.24], expression: 'shout', headTurn: 0.94, drag: 2.6, lift: -0.8, squashX: 1.12, squashY: 0.93 }), dur: 0.07, attack: 1, smear: true },
        { p: pose({ ...common, lean: 0.36, hipY: 0.7, armFront: [1.35, 0.4], armBack: [0.7, 0.6], legFront: [0.7, -0.36], legBack: [-0.62, 0.24], expression: 'determined', drag: 1.2, squashX: 1.04 }), dur: 0.06, attack: 0.45 },
        { p: pose({ ...common, lean: 0.16, hipY: 0.3, armFront: [1.0, 0.6], armBack: [0.2, 0.5], legFront: [0.4, -0.2], legBack: [-0.36, 0.2], expression: 'smug', drag: 0.4 }), dur: 0.085, attack: 0.14 },
      ]
    case 'kick':
      return [
        { p: pose({ ...common, lean: 0.22, hipY: 1.0, legFront: [0.24, -0.5], legBack: [-0.2, 0.2], armFront: [0.5, 0.7], armBack: [-0.9, 0.5], expression: 'focused', footFront: 0.3 }), dur: 0.05, attack: 0 },
        { p: pose({ ...common, lean: 0.14, hipY: 1.9, legFront: [-0.3, -1.3], legBack: [-0.1, 0.16], armFront: [0.8, 0.9], armBack: [-1.2, 0.5], expression: 'strain', squashY: 0.94, squashX: 1.04, footFront: 0.6, drag: -1.1 }), dur: 0.055, attack: 0.25 },
        { p: pose({ ...common, lean: -0.34, hipY: 0.6, legFront: [1.94, 0.34], legBack: [-0.12, 0.12], armFront: [-1.5, 0.6], armBack: [1.2, 0.5], expression: 'shout', headTurn: 0.95, footFront: -0.4, drag: 2.4, lift: 0.8, squashY: 1.05 }), dur: 0.07, attack: 1, smear: true },
        { p: pose({ ...common, lean: -0.2, hipY: 0.8, legFront: [1.5, 0.5], legBack: [-0.14, 0.14], armFront: [-1.1, 0.6], armBack: [0.9, 0.5], expression: 'determined', footFront: -0.2, drag: 1.1 }), dur: 0.06, attack: 0.4 },
        { p: pose({ ...common, lean: 0.06, hipY: 0.5, legFront: [0.66, -0.32], legBack: [-0.3, 0.2], armFront: [-0.3, 0.5], armBack: [0.3, 0.4], expression: 'smug', drag: 0.3 }), dur: 0.085, attack: 0.1 },
      ]
    case 'shoot':
      return [
        { p: pose({ ...common, lean: -0.14, hipY: 0.5, armFront: [-0.85, 1.5], armBack: [-0.5, 1.2], legFront: [0.42, -0.28], legBack: [-0.4, 0.26], expression: 'focused', drag: -0.5 }), dur: 0.05, attack: 0.1 },
        { p: pose({ ...common, lean: -0.24, hipY: 0.9, armFront: [-1.15, 1.75], armBack: [-0.75, 1.4], legFront: [0.52, -0.36], legBack: [-0.5, 0.22], expression: 'strain', drag: -1.1, squashX: 0.94 }), dur: 0.06, attack: 0.35 },
        { p: pose({ ...common, lean: 0.24, hipY: 0.2, armFront: [1.2, 0.14], armBack: [-1.35, 1.15], legFront: [0.72, -0.42], legBack: [-0.66, 0.2], expression: 'shout', headTurn: 0.94, drag: 2.0, squashX: 1.1, squashY: 0.95 }), dur: 0.07, attack: 1, smear: true },
        { p: pose({ ...common, lean: 0.16, hipY: 0.5, armFront: [1.05, 0.3], armBack: [-1.0, 1.0], legFront: [0.6, -0.34], legBack: [-0.54, 0.22], expression: 'determined', drag: 0.9 }), dur: 0.06, attack: 0.4 },
        { p: pose({ ...common, lean: 0.04, hipY: 0.2, armFront: [0.6, 0.6], armBack: [-0.5, 0.6], legFront: [0.34, -0.2], legBack: [-0.3, 0.18], expression: 'neutral', drag: 0.3 }), dur: 0.085, attack: 0.1 },
      ]
    case 'bloom':
      // The archaeologist does not lunge. She sets her feet, folds her arms and
      // lets the attack happen somewhere else entirely — the stillness of the
      // body is what makes the hands blooming out of thin air unsettling.
      return [
        // The near forearm has to finish level and pointing forward: the bloom
        // is anchored to it, and an arm folded across the chest sends the whole
        // effect into the floor.
        { p: pose({ ...common, lean: 0.04, hipY: 0.3, armFront: [-0.5, 1.1], armBack: [1.35, 1.5], legFront: [0.3, -0.2], legBack: [-0.34, 0.22], expression: 'focused', drag: -0.3 }), dur: 0.06, attack: 0.08 },
        { p: pose({ ...common, lean: -0.06, hipY: 0.7, armFront: [-0.72, 1.5], armBack: [1.6, 1.7], legFront: [0.36, -0.26], legBack: [-0.4, 0.2], expression: 'focused', drag: -0.7, squashY: 1.03 }), dur: 0.07, attack: 0.3 },
        { p: pose({ ...common, lean: 0.1, hipY: 0.1, armFront: [-0.56, 2.13], armBack: [1.5, 1.66], legFront: [0.42, -0.3], legBack: [-0.46, 0.22], expression: 'smug', headTurn: 0.88, drag: 0.5, squashY: 1.02 }), dur: 0.08, attack: 1 },
        { p: pose({ ...common, lean: 0.08, hipY: 0.3, armFront: [-0.52, 2.05], armBack: [1.44, 1.62], legFront: [0.36, -0.26], legBack: [-0.4, 0.2], expression: 'smug', drag: 0.3 }), dur: 0.07, attack: 0.6 },
        { p: pose({ ...common, lean: 0.05, hipY: 0.2, armFront: [-0.36, 1.5], armBack: [1.2, 1.5], legFront: [0.24, -0.16], legBack: [-0.28, 0.16], expression: 'smug', drag: 0.15 }), dur: 0.09, attack: 0.2 },
      ]
    case 'palm':
      // A fishman's karate: the stance drops, the hips turn, and the strike
      // travels through a planted foot rather than off a swinging shoulder.
      return [
        { p: pose({ ...common, lean: -0.1, hipY: 1.6, spine: 0.5, armFront: [-1.05, 1.5], armBack: [0.9, 0.7], legFront: [0.72, -0.66], legBack: [-0.72, 0.44], expression: 'focused', drag: -0.6, squashY: 1.02 }), dur: 0.055, attack: 0 },
        { p: pose({ ...common, lean: -0.24, hipY: 2.4, spine: 0.8, armFront: [-1.45, 1.7], armBack: [1.15, 0.8], legFront: [0.9, -0.86], legBack: [-0.88, 0.4], expression: 'strain', drag: -1.4, squashX: 0.94, squashY: 1.05 }), dur: 0.06, attack: 0.28 },
        { p: pose({ ...common, lean: 0.2, hipY: 1.9, spine: 0.4, armFront: [1.42, 0.14], armBack: [0.5, 0.9], legFront: [0.96, -0.7], legBack: [-0.94, 0.36], expression: 'shout', headTurn: 0.94, drag: 2.4, squashX: 1.12, squashY: 0.94 }), dur: 0.075, attack: 1, smear: true },
        { p: pose({ ...common, lean: 0.14, hipY: 2.1, spine: 0.5, armFront: [1.28, 0.24], armBack: [0.4, 0.85], legFront: [0.88, -0.66], legBack: [-0.86, 0.34], expression: 'determined', drag: 1.1, squashX: 1.05 }), dur: 0.065, attack: 0.5 },
        { p: pose({ ...common, lean: 0.06, hipY: 1.2, spine: 0.3, armFront: [0.6, 0.7], armBack: [-0.3, 0.6], legFront: [0.5, -0.36], legBack: [-0.5, 0.26], expression: 'determined', drag: 0.3 }), dur: 0.09, attack: 0.12 },
      ]
    default:
      return [
        { p: pose({ ...common, lean: -0.22, hipY: 0.8, armFront: [-1.2, 1.45], armBack: [0.7, 0.55], legFront: [0.52, -0.32], legBack: [-0.48, 0.3], expression: 'focused', drag: -0.8, squashY: 1.04 }), dur: 0.05, attack: 0 },
        { p: pose({ ...common, lean: -0.34, hipY: 1.3, armFront: [-1.55, 1.62], armBack: [0.95, 0.6], legFront: [0.64, -0.44], legBack: [-0.6, 0.26], expression: 'strain', drag: -1.5, squashX: 0.9, squashY: 1.07 }), dur: 0.055, attack: 0.2 },
        { p: pose({ ...common, lean: 0.34, hipY: 0.2, armFront: [1.34, 0.3], armBack: [1.0, 0.66], legFront: [0.82, -0.46], legBack: [-0.74, 0.26], expression: 'shout', headTurn: 0.94, drag: 2.6, squashX: 1.14, squashY: 0.93 }), dur: 0.07, attack: 1, smear: true },
        { p: pose({ ...common, lean: 0.26, hipY: 0.6, armFront: [1.15, 0.42], armBack: [0.8, 0.55], legFront: [0.68, -0.36], legBack: [-0.62, 0.24], expression: 'determined', drag: 1.2, squashX: 1.05 }), dur: 0.06, attack: 0.45 },
        { p: pose({ ...common, lean: 0.12, hipY: 0.3, armFront: [0.62, 0.6], armBack: [0.2, 0.45], legFront: [0.36, -0.2], legBack: [-0.32, 0.18], expression: 'neutral', drag: 0.4 }), dur: 0.085, attack: 0.12 },
      ]
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function buildCrewSheet(id: CrewId): SpriteSheet {
  const look = LOOKS[id]
  const scale = CREW_SCALE[id]
  const frame = frameFor(look, scale)
  const b = new SheetBuilder({
    fw: FW,
    fh: FH,
    ox: -CX,
    oy: -GROUND_Y,
    contour: null,
  })

  // ── Idle: a slow breath, the head level, the far arm a beat behind ─────────
  //
  // Three near-identical drawings is not a breath, it is a still with jitter.
  // This is a real cycle: the chest rises over three frames and falls over
  // three, the hips carrying about two units of it and the spine passing most
  // of that up through the body. Two things are deliberately *late* — the far
  // arm runs a frame behind the near one, and the hat brim and hair are driven
  // by `lift`, which is the body's vertical velocity rather than its position,
  // so they are still coming up when the shoulders have already stopped.
  const TAU = Math.PI * 2
  const IDLE = 6
  const breathe = (i: number) => {
    const t = i / IDLE
    const rise = Math.cos(t * TAU)
    const late = Math.cos((t - 1 / IDLE) * TAU)
    // Vertical velocity, positive going up: what every loose thing lags by.
    const vel = -Math.sin(t * TAU)
    return pose({
      hipY: -0.95 * rise,
      spine: 0.62 * rise,
      lean: 0.05 - 0.012 * rise,
      roll: 0.16 * late,
      armFront: [0.2 + 0.075 * rise, 0.3 - 0.05 * rise],
      armBack: [-0.24 - 0.08 * late, 0.26 - 0.05 * late],
      legFront: [0.05, -0.03],
      legBack: [-0.07, 0.05],
      headTilt: -0.016 * late,
      headTurn: 0.72,
      squashY: 1 + 0.011 * rise,
      squashX: 1 - 0.007 * rise,
      flutter: t,
      drag: 0.16 * vel,
      lift: 1.35 * vel,
    })
  }
  // Held longer at the top and bottom of the breath than through the middle:
  // an evenly timed cycle reads as a machine.
  const IDLE_DUR = [0.3, 0.2, 0.24, 0.3, 0.2, 0.24]
  b.add('idle', IDLE_DUR.map((d, i) => frame(breathe(i), d)))

  // ── Run: contact / down / pass / up, twice ────────────────────────────────
  b.add('run', RUN.concat(RUN.map(mirror)).map((k, i) =>
    frame(gait(k, i / 8, 0.3, 0.85 + (i % 4 === 3 ? 0.35 : 0), 'determined'), i % 4 === 0 ? 0.062 : 0.058)))

  // ── Walk: the same structure, lower energy and a straighter spine ─────────
  b.add('walk', WALK.concat(WALK.map(mirror)).map((k, i) =>
    frame(gait(k, i / 6, 0.13, 0.3, 'neutral'), 0.115)))

  // ── Air: anticipate, launch, rise, and hold wide-eyed at the apex ─────────
  b.add('jump', [
    frame(pose({
      lean: 0.3, hipY: 4.2, spine: 1.4, legFront: [0.66, -1.5], legBack: [-0.6, -1.4],
      armFront: [0.9, 1.0], armBack: [-1.0, 0.9], squashX: 1.12, squashY: 0.86,
      expression: 'focused', drag: -0.6, lift: -1.4, footFront: 0.2,
    }), 0.045),
    frame(pose({
      lean: 0.1, hipY: -1.8, spine: -0.4, legFront: [-0.24, 0.2], legBack: [0.2, 0.3],
      armFront: [-2.7, 0.3], armBack: [-2.4, 0.45], squashX: 0.88, squashY: 1.16,
      expression: 'shout', drag: 0.6, lift: 2.4, footFront: 0.6, footBack: 0.5,
    }), 0.05),
    frame(pose({
      lean: 0.16, hipY: -1.2, legFront: [-0.62, 0.92], legBack: [0.36, 0.46],
      armFront: [-2.4, 0.4], armBack: [-2.05, 0.5], squashX: 0.94, squashY: 1.08,
      expression: 'determined', drag: 0.9, lift: 1.8, footFront: 0.5, flutter: 0.3,
    }), 0.1),
    frame(pose({
      lean: 0.06, hipY: -0.9, legFront: [-0.5, 1.0], legBack: [0.42, 0.5],
      armFront: [-2.15, 0.5], armBack: [-1.85, 0.6], squashX: 0.99, squashY: 1.02,
      expression: 'surprised', headTurn: 0.66, drag: 0.5, lift: 0.4, flutter: 0.6,
    }), 1),
  ], { loop: false })

  b.add('fall', [
    frame(pose({
      lean: -0.08, hipY: 0.5, legFront: [0.55, 0.32], legBack: [-0.4, 0.62],
      armFront: [-2.6, 0.4], armBack: [-2.3, 0.5], squashX: 1.02, squashY: 0.98,
      expression: 'strain', drag: -0.7, lift: -1.6, headTurn: 0.8, flutter: 0,
    }), 0.11),
    frame(pose({
      lean: -0.03, hipY: 0.3, legFront: [0.46, 0.4], legBack: [-0.32, 0.68],
      armFront: [-2.48, 0.46], armBack: [-2.42, 0.44], squashX: 1.01, squashY: 0.99,
      expression: 'strain', drag: -0.9, lift: -1.9, headTurn: 0.8, flutter: 0.5,
    }), 0.11),
  ])

  // ── Land: a deep absorb and two frames of standing back up ────────────────
  b.add('land', [
    frame(pose({
      lean: 0.34, hipY: 5.0, spine: 1.8, legFront: [0.82, -1.5], legBack: [-0.78, -1.4],
      armFront: [1.1, 0.8], armBack: [-1.2, 0.7], squashX: 1.2, squashY: 0.8,
      expression: 'strain', footFront: 0.15, footBack: -0.1, drag: 0.5, lift: -2.4,
    }), 0.07),
    frame(pose({
      lean: 0.2, hipY: 2.4, spine: 0.9, legFront: [0.5, -0.82], legBack: [-0.46, -0.76],
      armFront: [0.66, 0.6], armBack: [-0.72, 0.5], squashX: 1.08, squashY: 0.92,
      expression: 'determined', drag: 0.2, lift: -0.6, flutter: 0.4,
    }), 0.07),
    frame(pose({
      lean: 0.09, hipY: 0.6, spine: 0.2, legFront: [0.2, -0.28], legBack: [-0.2, -0.22],
      armFront: [0.34, 0.4], armBack: [-0.38, 0.34], squashX: 1.02, squashY: 0.98,
      expression: 'neutral', flutter: 0.7,
    }), 0.07),
  ], { loop: false })

  // ── Skid: heels dug in, everything loose thrown forward ───────────────────
  //
  // The old grey after-image is gone. What a brake wants is not a second body
  // but a *direction*: a stretched copy of this exact silhouette trailing back
  // the way the feet are still sliding, plus a rake of dust lines off the heel.
  // Both are tied to the pose, so they can never drift out of register with it.
  const skidA = pose({
    lean: -0.36, hipY: 2.0, spine: 0.7, legFront: [0.98, -0.6], legBack: [-0.88, 0.34],
    armFront: [1.45, 0.4], armBack: [-1.55, 0.5], squashX: 1.07, squashY: 0.95,
    expression: 'strain', headTurn: 0.58, drag: -2.2, lift: -0.5, footFront: 0.38,
  })
  const skidDust = (dust: string) => (sk: Skeleton) => ({
    from: sk.footFront[1] as Pt,
    angle: -0.16,
    color: dust,
    lines: [[-1.2, 12, 0.4], [0.4, 17, 0.5], [2.0, 9, 0.3], [3.4, 13, 0.22]] as Array<[number, number, number]>,
  })
  b.add('skid', [
    frame(skidA, 0.07, { smear: { dx: 7.5, alpha: 0.4 }, streaks: skidDust(look.pal.boots.light) }),
    frame(pose({
      lean: -0.28, hipY: 1.5, spine: 0.5, legFront: [0.86, -0.5], legBack: [-0.78, 0.3],
      armFront: [1.28, 0.46], armBack: [-1.4, 0.54], squashX: 1.04, squashY: 0.97,
      expression: 'strain', headTurn: 0.6, drag: -1.7, flutter: 0.5, footFront: 0.34,
    }), 0.09, { smear: { dx: 4.5, alpha: 0.24 }, streaks: skidDust(look.pal.boots.light) }),
  ], { ...wide(70), loop: true })

  // ── Turn: the pivot the run cycles never had ──────────────────────────────
  //
  // The renderer draws a left-facing character by mirroring the right-facing
  // bitmap, so before this the only thing a change of direction did was flip
  // the sprite between one frame and the next — no weight shift, no plant, no
  // pivot. What Prince of Persia actually solved was not a rendering problem:
  // it was that a character which only has cycles reads as a machine, and the
  // transitions between them are where the weight lives.
  //
  // The frames play in the *new* facing, so they run backwards through the
  // turn: square to the camera first, then settling into the new direction.
  // `headTurn` near zero is the head looking at the viewer, which is the one
  // moment in the whole cycle where that is correct.
  b.add('turn', [
    // Plant. The old momentum is still in the trailing arm and the hips have
    // not come round yet, so the shoulders square up before anything else.
    frame(pose({
      lean: -0.2, hipY: 1.9, spine: 0.55, legFront: [0.5, -0.34], legBack: [-0.62, 0.5],
      armFront: [0.9, 0.62], armBack: [-1.15, 0.5], squashX: 1.05, squashY: 0.95,
      expression: 'focused', headTurn: 0.14, headTilt: 0.05, drag: -1.4, flutter: 0.5,
      footFront: 0.28,
    }), 0.05),
    // Pivot. The hips lead, the head is already looking where it is going, and
    // the trailing arm is the last thing to catch up.
    frame(pose({
      lean: 0.12, hipY: 0.9, spine: 0.2, legFront: [-0.1, -0.1], legBack: [0.24, 0.7],
      armFront: [-0.5, 0.5], armBack: [0.7, 0.42], squashX: 0.98, squashY: 1.03,
      expression: 'determined', headTurn: 0.48, headTilt: -0.03, drag: 0.8, lift: 0.6,
      footBack: 0.3, flutter: 0.7,
    }), 0.05),
    // Settle into the new direction, ready for the run cycle to take over.
    frame(pose({
      lean: 0.26, hipY: 0.1, legFront: [0.42, -0.24], legBack: [-0.34, 0.44],
      armFront: [-0.7, 0.5], armBack: [0.62, 0.4], squashX: 1.01, squashY: 0.99,
      expression: 'determined', headTurn: 0.66, drag: 0.9, flutter: 0.4,
    }), 0.05),
  ], { loop: false })

  // ── Crouch: fold, do not squat ────────────────────────────────────────────
  //
  // This was a wide-legged squat with the back straight and the arms out — a
  // fighting stance, which made the character *wider* than standing and only a
  // quarter shorter, while its hitbox halved. The renderer then papered over
  // the gap by squashing the sprite to 45% height and stretching it to 125%
  // wide to fit under a one-tile ceiling, which is a pancake, not a pose.
  //
  // A duck folds. The chest comes down over the thighs, the head tucks in
  // front of the knees, the trailing leg comes under the body instead of
  // splaying back, and the arms fold in rather than reaching out. The
  // silhouette that leaves is compact, which is the whole point of the move.
  b.add('crouch', [
    frame(pose({
      lean: 0.54, hipY: 10.8, spine: 1.0, legFront: [1.6, -2.52], legBack: [-0.26, -2.46],
      armFront: [0.62, 1.74], armBack: [-0.72, 1.5], squashX: 1.05, squashY: 0.95,
      expression: 'focused', footFront: 0.26, footBack: -0.14, headTilt: 0.02, drag: 0.3,
    }), 0.5),
    frame(pose({
      lean: 0.51, hipY: 10.4, spine: 0.9, legFront: [1.55, -2.46], legBack: [-0.22, -2.4],
      armFront: [0.58, 1.7], armBack: [-0.68, 1.46], squashX: 1.04, squashY: 0.96,
      expression: 'focused', footFront: 0.26, footBack: -0.14, headTilt: 0.04,
      drag: 0.2, flutter: 0.5,
    }), 0.5),
  ])

  // ── Hurt: the impact frame smears, the second frame recoils ───────────────
  //
  // The smear runs back toward where the blow came from, so the drawing itself
  // says which way the body has been thrown.
  const hurtA = pose({
    lean: -0.55, hipY: -0.8, legFront: [-0.9, 0.5], legBack: [0.86, 0.4],
    armFront: [-2.4, 0.2], armBack: [2.3, 0.3], headTilt: -0.46,
    expression: 'hurt', drag: -2.6, lift: 1.2, headTurn: 0.45, squashX: 0.94, squashY: 1.06,
  })
  b.add('hurt', [
    frame(hurtA, 0.09, { smear: { dx: 7, dy: -2.4, alpha: 0.42, steps: 4 } }),
    frame(pose({
      lean: -0.4, hipY: 0.4, legFront: [-0.7, 0.44], legBack: [0.66, 0.4],
      armFront: [-2.1, 0.3], armBack: [2.0, 0.35], headTilt: -0.34,
      expression: 'hurt', drag: -1.4, lift: -0.6, headTurn: 0.5, flutter: 0.5,
    }), 0.16, { smear: { dx: 3.2, dy: -1, alpha: 0.2 } }),
  ], { ...wide(70) })

  // ── Victory: dip, leap, hold, settle ──────────────────────────────────────
  // The raised arm has to clear the face. Arms are rooted forward of the chest,
  // so an arm thrown straight up from there passes in front of the head and
  // hides the one expression in the game that is pure delight; swinging the
  // elbow back behind the shoulder first is what keeps the face on screen.
  b.add('victory', [
    frame(pose({
      lean: 0.08, hipY: 2.2, spine: 0.8, armFront: [0.8, 0.9], armBack: [-0.85, 0.85],
      legFront: [0.3, -0.6], legBack: [-0.32, -0.55], squashX: 1.06, squashY: 0.93,
      expression: 'joy', headTurn: 0.4, headTilt: 0.06, drag: -0.4,
    }), 0.16),
    frame(pose({
      lean: 0.0, hipY: -2.4, armFront: [-2.18, -0.86], armBack: [-1.1, 0.6],
      legFront: [0.16, -0.1], legBack: [-0.2, 0.1], squashX: 0.94, squashY: 1.1,
      expression: 'joy', headTurn: 0.4, headTilt: -0.12, drag: 0.5, lift: 2.4,
    }), 0.2),
    frame(pose({
      lean: 0.02, hipY: -1.3, armFront: [-2.24, -0.8], armBack: [-0.95, 0.55],
      legFront: [0.12, -0.06], legBack: [-0.14, 0.08], squashY: 1.03,
      expression: 'joy', headTurn: 0.4, headTilt: -0.06, drag: 0.2, lift: 0.6, flutter: 0.35,
    }), 0.26),
    frame(pose({
      lean: 0.02, hipY: 0.2, armFront: [-2.12, -0.88], armBack: [-0.82, 0.5],
      legFront: [0.12, -0.06], legBack: [-0.14, 0.08],
      expression: 'joy', headTurn: 0.4, headTilt: 0.05, lift: -0.5, flutter: 0.7,
    }), 0.26),
  ], { ...wide(70), loop: true })

  // ── Attack: per-character, but always anticipation → extreme → recovery ───
  const atk = attackPoses(look.attackStyle)
  b.add('attack', atk.map((a, i) =>
    frame(a.p, a.dur, {
      attack: a.attack,
      ghosts: a.smear
        ? [
            { pose: lerpPose(atk[Math.max(0, i - 1)].p, a.p, 0.55), alpha: 0.22 },
            { pose: lerpPose(atk[Math.max(0, i - 1)].p, a.p, 0.82), alpha: 0.13 },
          ]
        : undefined,
    })), { ...wide(88) })

  // ── Dash: a held extreme, a trail and a rake of speed lines ───────────────
  const dashA = pose({
    lean: 0.66, hipY: 1.4, spine: 0.6, legFront: [-1.15, 0.5], legBack: [1.2, 0.3],
    armFront: [1.85, 0.2], armBack: [-1.9, 0.3], squashX: 1.16, squashY: 0.89,
    expression: 'shout', headTurn: 0.95, drag: 2.6, lift: 0.3,
  })
  const dashLines = (sk: Skeleton) => ({
    from: [sk.hip[0] - 4, sk.hip[1] - 2] as Pt,
    angle: Math.PI - 0.06,
    color: look.pal.accent.light,
    lines: [[-9, 15, 0.42], [-3.5, 21, 0.5], [2.5, 17, 0.36], [7.5, 12, 0.26]] as Array<[number, number, number]>,
  })
  b.add('dash', [
    frame(dashA, 0.07, { smear: { dx: -9.5, alpha: 0.45, steps: 4 }, streaks: dashLines }),
    frame(pose({
      lean: 0.62, hipY: 1.1, spine: 0.5, legFront: [-1.0, 0.56], legBack: [1.1, 0.34],
      armFront: [1.75, 0.26], armBack: [-1.8, 0.34], squashX: 1.13, squashY: 0.91,
      expression: 'strain', headTurn: 0.95, drag: 2.2, flutter: 0.5,
    }), 0.09, { smear: { dx: -6, alpha: 0.3 }, streaks: dashLines }),
  ], { ...wide(74), loop: true })

  // ── Water & rigging ───────────────────────────────────────────────────────
  b.add('swim', [
    frame(pose({
      lean: 0.92, hipY: 2, legFront: [1.35, -0.4], legBack: [-1.25, 0.5],
      armFront: [-1.75, 0.6], armBack: [1.55, 0.4], headTilt: 0.26,
      expression: 'strain', headTurn: 0.8, drag: -1.2, lift: 0.6,
    }), 0.15),
    frame(pose({
      lean: 0.92, hipY: 1.0, legFront: [0.1, 0.1], legBack: [-0.1, 0.1],
      armFront: [-0.2, 0.9], armBack: [0.2, 0.9], headTilt: 0.26,
      expression: 'strain', headTurn: 0.8, drag: 0.4, lift: -0.6, flutter: 0.4,
    }), 0.13),
    frame(pose({
      lean: 0.92, hipY: 1.2, legFront: [-1.25, 0.5], legBack: [1.35, -0.4],
      armFront: [1.55, 0.4], armBack: [-1.75, 0.6], headTilt: 0.26,
      expression: 'strain', headTurn: 0.8, drag: 1.0, lift: 0.2, flutter: 0.7,
    }), 0.15),
  ], { ...wide(70), loop: true })

  b.add('climb', [
    frame(pose({
      lean: 0.05, hipY: 0.5, spine: -0.3, armFront: [-2.75, 0.2], armBack: [2.55, 0.3],
      legFront: [0.72, -0.55], legBack: [-0.72, 0.46], expression: 'focused', headTurn: 0.3,
      drag: 0.2, lift: 0.5,
    }), 0.16),
    frame(pose({
      lean: 0.05, hipY: -0.5, spine: 0.3, armFront: [2.55, 0.3], armBack: [-2.75, 0.2],
      legFront: [-0.72, 0.46], legBack: [0.72, -0.55], expression: 'focused', headTurn: 0.3,
      drag: -0.2, lift: -0.5, flutter: 0.5,
    }), 0.16),
  ])

  return b.build()
}

/** Every playable crew member, in roster order. */
export const CREW_IDS: CrewId[] = [
  'luffy', 'zoro', 'nami', 'sanji', 'usopp', 'chopper', 'robin', 'franky', 'brook', 'jinbe',
]

export function buildCrewSheets(): Record<CrewId, SpriteSheet> {
  const t0 = performance.now()
  const sheets = CREW_IDS.reduce((acc, id) => {
    acc[id] = buildCrewSheet(id)
    return acc
  }, {} as Record<CrewId, SpriteSheet>)
  // Ten characters at forty-odd frames each is the single most expensive thing
  // the loading screen does, so the cost is left where a capture script can
  // read it rather than being guessed at.
  if (typeof window !== 'undefined') window.__CREW_MS__ = performance.now() - t0
  return sheets
}

declare global {
  interface Window {
    /** Milliseconds the last `buildCrewSheets()` took. Debug probe. */
    __CREW_MS__?: number
  }
}

/**
 * Large bust shots for the crew-select screen — roughly 96 x 96 world units
 * each, backdrop included, ready to draw straight to a canvas or hand to an
 * `<img>` via `toDataURL`.
 */
export function buildCrewPortraits(): Record<CrewId, HTMLCanvasElement> {
  return CREW_IDS.reduce((acc, id) => {
    acc[id] = buildPortrait(id)
    return acc
  }, {} as Record<CrewId, HTMLCanvasElement>)
}

export { LOOKS }

