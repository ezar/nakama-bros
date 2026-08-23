import type { SpriteSheet } from '../types'
import { SheetBuilder, type FrameSpec } from './atlas'
import { cel, mix, type Cel } from './color'
import { PAL } from './palette'
import {
  blob, contactShadow, crescentPath, curve, ellipsePath, glint, inkStroke, inside, limbPath,
  paint as inkPaint, roundRectPath, SPRITE_LIGHT, type CelOptions, type Pt, type Surface,
} from './ink'

/**
 * Every enemy in this file is drawn once facing right and mirrored when it
 * turns, so all of it takes the sprite light rather than the world's raking
 * key — see `SPRITE_LIGHT`. Injecting it here rather than at each of the
 * hundred-odd call sites keeps the painters reading as painters, and an
 * explicit `light` in the options still wins.
 */
const paint = (
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  colors: Parameters<typeof inkPaint>[2],
  opts: CelOptions = {},
): void => inkPaint(ctx, path, colors, { light: SPRITE_LIGHT, ...opts })

/**
 * Enemy art.
 *
 * Readability is the whole brief: the player has to know "stomp it" or "don't
 * touch it" from the silhouette alone, before any detail resolves. Round, soft
 * and top-heavy means stompable; spiked, metallic and low means lethal.
 *
 * Everything here is drawn in three-quarter view FACING RIGHT, because the
 * renderer mirrors the sprite for the other direction. A front-facing symmetric
 * drawing is what makes a mook look like a doll, so nothing is symmetric: the
 * far arm and far leg are pushed toward the ambient, the head has a nose and a
 * jaw, and the hips drop through the down pose of every walk.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Tones
//
// No colour is invented here: every value is a mix of two palette entries, so
// the roster stays inside the game's gamut and a palette edit reaches it.
// ─────────────────────────────────────────────────────────────────────────────

export const TONE = {
  boot: mix(PAL.marineNavy, PAL.ink, 0.55),
  strap: mix(PAL.dirtDeep, PAL.ink, 0.3),
  steel: mix(PAL.steel, PAL.mist, 0.45),
  ironDark: mix(PAL.slate, PAL.ink, 0.45),
  brass: mix(PAL.gold, PAL.dirt, 0.28),
  circusRed: mix(PAL.luffyRed, PAL.namiOrange, 0.18),
  circusCream: mix(PAL.cream, PAL.sanjiGold, 0.22),
  sharkGrey: mix(PAL.fishmanTeal, PAL.slate, 0.5),
  sharkBelly: mix(PAL.mist, PAL.cream, 0.4),
  desertCloth: mix(PAL.sandDeep, PAL.dusk, 0.34),
  desertScarf: mix(PAL.bloodOrange, PAL.sunset, 0.35),
  chitin: mix(PAL.dirtDeep, PAL.dusk, 0.4),
  chitinLit: mix(PAL.gold, PAL.dirt, 0.5),
  sandShell: mix(PAL.sand, PAL.sandDeep, 0.45),
  cloudRobe: mix(PAL.white, PAL.skyLow, 0.5),
  cloudTrim: mix(PAL.gold, PAL.cream, 0.2),
  skySkin: mix(PAL.skin, PAL.sanjiGold, 0.25),
  featherWing: mix(PAL.cream, PAL.mist, 0.35),
  rot: mix(PAL.grassDeep, PAL.poison, 0.34),
  rotCloth: mix(PAL.dusk, PAL.night, 0.4),
  spectre: mix(PAL.magic, PAL.white, 0.45),
  oniSkin: mix(PAL.bloodOrange, PAL.luffyRedDeep, 0.42),
  oniCloth: mix(PAL.night, PAL.dusk, 0.35),
  horn: mix(PAL.cream, PAL.sandDeep, 0.3),
  samuraiCloth: mix(PAL.sanjiSuit, PAL.dusk, 0.28),
  samuraiMask: mix(PAL.cream, PAL.chopperPink, 0.18),
  batSkin: mix(PAL.dusk, PAL.night, 0.3),
  urchinBody: mix(PAL.night, PAL.poison, 0.28),
  pufferBody: mix(PAL.sanjiGold, PAL.namiOrange, 0.35),
  gullGrey: mix(PAL.mist, PAL.steel, 0.4),
  jackBox: mix(PAL.wood, PAL.luffyRedDeep, 0.25),
} as const

export const INK = mix(PAL.ink, PAL.night, 0.45)
const EYE_INK = mix(PAL.ink, PAL.dusk, 0.2)

/** Ramps are built once — cel() is cheap but every frame asks for the same ten. */
const ramps = new Map<string, Cel>()
export const C = (hex: string, lineDarkness?: number): Cel => {
  const k = hex + (lineDarkness ?? '')
  let r = ramps.get(k)
  if (!r) {
    r = cel(hex, lineDarkness === undefined ? undefined : { lineDarkness })
    ramps.set(k, r)
  }
  return r
}

/** The far side of a body: pushed toward the ambient so depth reads instantly. */
export const far = (hex: string): Cel => C(mix(hex, PAL.shadow, 0.36))

// ─────────────────────────────────────────────────────────────────────────────
// Faces
// ─────────────────────────────────────────────────────────────────────────────

export interface EyeOpts {
  angry?: boolean
  wide?: boolean
  /** 0 = open, 1 = shut. */
  lid?: number
  color?: string
  /** Blank glowing eyes — undead, masks, possessed things. */
  glow?: string
}

/**
 * A three-quarter pair of eyes. The far eye is narrower and sits close to the
 * head's back edge; that single asymmetry is what turns a mask into a face.
 */
export function eyes3q(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  o: EyeOpts = {},
): void {
  const lid = o.lid ?? 0
  const h = r * (o.wide ? 0.32 : 0.24) * (1 - lid * 0.85)
  const specs: Array<[number, number]> = [
    [x + r * 0.58, r * 0.21],
    [x + r * 0.06, r * 0.16],
  ]
  for (let i = 0; i < specs.length; i++) {
    const [ex, ew] = specs[i]
    if (o.glow) {
      ctx.save()
      ctx.fillStyle = o.glow
      ctx.fill(ellipsePath(ex, y, ew * 0.9, h * 1.1))
      ctx.globalAlpha = 0.35
      ctx.fill(ellipsePath(ex, y, ew * 1.7, h * 1.9))
      ctx.restore()
      continue
    }
    ctx.fillStyle = PAL.cream
    ctx.fill(ellipsePath(ex, y, ew, h))
    ctx.fillStyle = o.color ?? EYE_INK
    ctx.fill(ellipsePath(ex + ew * 0.22, y + h * 0.08, ew * 0.5, h * 0.72))
    if (lid < 0.5) glint(ctx, ex - ew * 0.2, y - h * 0.4, ew * 0.24, h * 0.28, -0.5, PAL.white, 0.85)
    // Upper lash: a heavier line on top is what gives cel eyes their weight.
    ctx.strokeStyle = INK
    ctx.lineWidth = 0.42
    ctx.stroke(curve([[ex - ew, y - h * 0.2], [ex, y - h * 1.1], [ex + ew, y - h * 0.45]] as Pt[]))
  }
  if (o.angry) {
    ctx.save()
    ctx.strokeStyle = INK
    ctx.lineWidth = 0.42
    ctx.lineCap = 'round'
    ctx.stroke(curve([[x - r * 0.16, y - r * 0.78], [x + r * 0.26, y - r * 0.56]] as Pt[]))
    ctx.stroke(curve([[x + r * 0.42, y - r * 0.84], [x + r * 0.86, y - r * 0.58]] as Pt[]))
    ctx.restore()
  }
}

export type Mouth = 'grim' | 'grin' | 'open' | 'fang' | 'none'

export function mouth(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, kind: Mouth): void {
  if (kind === 'none') return
  ctx.save()
  ctx.strokeStyle = INK
  ctx.lineWidth = 0.45
  if (kind === 'grim') {
    ctx.stroke(curve([[x + r * 0.28, y], [x + r * 0.62, y - r * 0.06], [x + r * 0.84, y + r * 0.04]] as Pt[]))
  } else if (kind === 'grin') {
    const p = curve([[x + r * 0.22, y - r * 0.1], [x + r * 0.56, y + r * 0.22], [x + r * 0.88, y - r * 0.12]] as Pt[])
    ctx.stroke(p)
    ctx.stroke(curve([[x + r * 0.34, y + r * 0.02], [x + r * 0.76, y + r * 0.02]] as Pt[]))
  } else if (kind === 'open') {
    const p = blob([
      [x + r * 0.26, y - r * 0.04],
      [x + r * 0.58, y - r * 0.16],
      [x + r * 0.86, y + r * 0.02],
      [x + r * 0.56, y + r * 0.34],
    ] as Pt[], 0.6)
    ctx.fillStyle = mix(PAL.luffyRedDeep, PAL.ink, 0.45)
    ctx.fill(p)
    ctx.stroke(p)
  } else {
    // Fang: an open mouth with a row of triangles biting down over it.
    const p = blob([
      [x + r * 0.2, y - r * 0.08],
      [x + r * 0.6, y - r * 0.2],
      [x + r * 0.94, y + r * 0.06],
      [x + r * 0.54, y + r * 0.4],
    ] as Pt[], 0.6)
    ctx.fillStyle = mix(PAL.luffyRedDeep, PAL.ink, 0.5)
    ctx.fill(p)
    ctx.fillStyle = PAL.cream
    for (let i = 0; i < 4; i++) {
      const tx = x + r * (0.26 + i * 0.18)
      ctx.beginPath()
      ctx.moveTo(tx, y - r * 0.1)
      ctx.lineTo(tx + r * 0.16, y - r * 0.08)
      ctx.lineTo(tx + r * 0.08, y + r * 0.18)
      ctx.closePath()
      ctx.fill()
    }
    ctx.stroke(p)
  }
  ctx.restore()
}

/** The head shape everything humanoid is built on: skull, brow, nose, jaw. */
export function headPath(x: number, y: number, r: number, jaw = 1): Path2D {
  return blob([
    [x, y - r * 1.02],
    [x + r * 0.82, y - r * 0.62],
    [x + r * 1.0, y - r * 0.02],
    [x + r * 0.9, y + r * 0.4 * jaw],
    [x + r * 0.34, y + r * 1.0 * jaw],
    [x - r * 0.44, y + r * 0.82 * jaw],
    [x - r * 0.98, y + r * 0.06],
    [x - r * 0.76, y - r * 0.7],
  ] as Pt[], 0.9)
}

/**
 * A face's local shading.
 *
 * Skin takes a much smaller shadow fraction than cloth: at this size a
 * half-and-half terminator on a face reads as a stain rather than as form.
 */
export const FACE_SHADOW = 0.26

/** The nose — one wedge, but without it a three-quarter head is a mask. */
export function nose(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, skin: Cel): void {
  // One hooked line. A filled wedge at this size becomes a snout.
  ctx.save()
  ctx.strokeStyle = skin.line
  ctx.lineWidth = 0.34
  ctx.stroke(curve([
    [x + r * 0.9, y - r * 0.1], [x + r * 1.0, y + r * 0.12], [x + r * 0.78, y + r * 0.18],
  ] as Pt[]))
  ctx.restore()
}

/** Ear plus the hard shadow the jaw drops on the neck. */
export function earAndNeck(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  skin: Cel,
): void {
  paint(ctx, ellipsePath(x - r * 0.86, y + r * 0.12, r * 0.2, r * 0.3, -0.2), skin, {
    shadow: 0.55, radius: r * 0.3, pivot: [x - r * 0.86, y + r * 0.12], line: 0.35,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// The biped rig
// ─────────────────────────────────────────────────────────────────────────────

/** A point at `len` from (x, y), at `a` radians measured from straight down. */
const at = (x: number, y: number, a: number, len: number): Pt =>
  [x + Math.sin(a) * len, y + Math.cos(a) * len]

export interface Pose {
  /** Hip rise/fall relative to the build's standing hip height. Down is +. */
  hip: number
  lean: number
  /** [thigh from vertical, shin relative to thigh] for the near and far leg. */
  legN: [number, number]
  legF: [number, number]
  /** [upper arm, forearm relative to upper] for the near and far arm. */
  armN: [number, number]
  armF: [number, number]
  footN: number
  footF: number
  headTilt: number
  /** Cloth lag: coats and scarves trail this many units behind the body. */
  drag: number
}

export interface Build {
  /** Standing hip height above the ground line. */
  hip: number
  thigh: number
  shin: number
  torso: number
  upper: number
  fore: number
  headR: number
  hipW: number
  shW: number
  legR: number
  armR: number
  /** Depth separation between the near and far side of the body. */
  z: number
}

export interface Rig {
  hip: Pt
  sh: Pt
  neck: Pt
  head: Pt
  kneeN: Pt
  ankleN: Pt
  kneeF: Pt
  ankleF: Pt
  elbowN: Pt
  handN: Pt
  elbowF: Pt
  handF: Pt
  lean: number
}

export function solveRig(cx: number, gy: number, b: Build, p: Pose): Rig {
  const hip: Pt = [cx, gy - b.hip + p.hip]
  const sh = at(hip[0], hip[1], Math.PI - p.lean, b.torso)
  const neck: Pt = [sh[0] + Math.sin(-p.lean) * 0.6, sh[1] - b.headR * 0.2]
  const head = at(neck[0], neck[1], Math.PI - p.lean - p.headTilt, b.headR * 1.15)
  const leg = (a: [number, number], dz: number): [Pt, Pt] => {
    const h: Pt = [hip[0] + dz, hip[1]]
    const knee = at(h[0], h[1], a[0], b.thigh)
    return [knee, at(knee[0], knee[1], a[0] + a[1], b.shin)]
  }
  const arm = (a: [number, number], dz: number): [Pt, Pt] => {
    const s: Pt = [sh[0] + dz, sh[1] + b.headR * 0.1]
    const elbow = at(s[0], s[1], a[0], b.upper)
    return [elbow, at(elbow[0], elbow[1], a[0] + a[1], b.fore)]
  }
  const [kneeN, ankleN] = leg(p.legN, b.z)
  const [kneeF, ankleF] = leg(p.legF, -b.z)
  const [elbowN, handN] = arm(p.armN, b.z * 1.4)
  const [elbowF, handF] = arm(p.armF, -b.z * 1.4)
  return { hip, sh, neck, head, kneeN, ankleN, kneeF, ankleF, elbowN, handN, elbowF, handF, lean: p.lean }
}

/** A two-segment limb with a joint bulge, painted as one value. */
export function limb2(
  ctx: CanvasRenderingContext2D,
  a: Pt,
  b: Pt,
  c: Pt,
  r0: number,
  r1: number,
  r2: number,
  ramp: Cel,
  rim = 0.4,
): void {
  paint(ctx, limbPath(a[0], a[1], b[0], b[1], r0, r1), ramp, {
    shadow: 0.46, radius: r0, pivot: a, rim, line: 0.42,
  })
  paint(ctx, limbPath(b[0], b[1], c[0], c[1], r1 * 1.02, r2), ramp, {
    shadow: 0.46, radius: r1, pivot: b, rim, line: 0.42,
  })
}

/** A boot or a shoe: a wedge that keeps its heel behind the ankle. */
function foot(
  ctx: CanvasRenderingContext2D,
  ankle: Pt,
  angle: number,
  len: number,
  h: number,
  ramp: Cel,
): void {
  ctx.save()
  ctx.translate(ankle[0], ankle[1])
  ctx.rotate(angle)
  paint(ctx, blob([
    [-len * 0.42, -h * 0.6],
    [len * 0.5, -h * 0.5],
    [len * 0.62, h * 0.5],
    [-len * 0.42, h * 0.5],
  ] as Pt[], 0.55), ramp, {
    shadow: 0.5, radius: h, pivot: [0, 0], rim: 0.35, line: 0.45,
  })
  ctx.restore()
}

// ─────────────────────────────────────────────────────────────────────────────
// Gaits
// ─────────────────────────────────────────────────────────────────────────────

export const P = (o: Partial<Pose>): Pose => ({
  hip: 0, lean: 0.05, legN: [0, 0], legF: [0, 0], armN: [0, 0.2], armF: [0, 0.2],
  footN: 0, footF: 0, headTilt: 0, drag: 0, ...o,
})

/** Swap the near and far side — the second half of any symmetric cycle. */
const swap = (p: Pose): Pose => ({
  ...p, legN: p.legF, legF: p.legN, armN: p.armF, armF: p.armN, footN: p.footF, footF: p.footN,
})

/**
 * Contact, down, pass. The hips drop a unit through `down` and rise through
 * `pass`; that vertical is the whole difference between a walk with weight and
 * a sprite sliding along the floor.
 */
export const WALK_KEYS: Pose[] = [
  P({ hip: -0.15, lean: 0.06, legN: [0.5, -0.16], legF: [-0.44, 0.52], armN: [-0.38, 0.3], armF: [0.42, 0.26], footN: 0.3, footF: -0.5, drag: 0.5 }),
  P({ hip: 0.95, lean: 0.1, legN: [0.2, -0.5], legF: [-0.06, 0.48], armN: [-0.2, 0.3], armF: [0.24, 0.3], footN: 0.06, footF: -0.1, drag: 0.2 }),
  P({ hip: -0.45, lean: 0.04, legN: [-0.12, -0.06], legF: [0.24, 0.66], armN: [0.06, 0.26], armF: [0.06, 0.28], footN: -0.16, footF: 0.4, drag: 0.9 }),
]

export const RUN_KEYS: Pose[] = [
  P({ hip: -0.4, lean: 0.24, legN: [0.8, -0.42], legF: [-0.72, 0.9], armN: [-0.86, 0.7], armF: [0.92, 0.5], footN: 0.34, footF: -0.6, drag: 1.4 }),
  P({ hip: 1.3, lean: 0.3, legN: [0.34, -0.72], legF: [-0.16, 0.86], armN: [-0.48, 0.6], armF: [0.6, 0.44], footN: 0.08, footF: -0.2, drag: 0.7 }),
  P({ hip: -1, lean: 0.2, legN: [-0.2, -0.08], legF: [0.36, 1.02], armN: [0.12, 0.4], armF: [0.18, 0.4], footN: -0.5, footF: 0.5, drag: 2.1 }),
]

/** Sample a cycle: three keys, mirrored, so six frames make a full stride. */
export function gait(keys: Pose[], t: number, scale = 1): Pose {
  const n = keys.length * 2
  const i = Math.floor(((t % 1) + 1) % 1 * n) % n
  const k = i < keys.length ? keys[i] : swap(keys[i - keys.length])
  if (scale === 1) return k
  const s = (v: [number, number]): [number, number] => [v[0] * scale, v[1] * scale]
  return { ...k, legN: s(k.legN), legF: s(k.legF), armN: s(k.armN), armF: s(k.armF) }
}

/** Standing: weight on the back foot, a slow breath, no stride. */
export function idlePose(t: number, breath = 1): Pose {
  const b = Math.sin(t * Math.PI * 2)
  return P({
    hip: b * 0.28 * breath,
    lean: 0.05,
    legN: [0.12, -0.12],
    legF: [-0.14, 0.2],
    armN: [-0.08, 0.26 + b * 0.05],
    armF: [0.1, 0.24 - b * 0.05],
    footN: 0.1, footF: -0.12,
    headTilt: b * 0.02,
    drag: 0.2 + b * 0.2,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// The humanoid figure
// ─────────────────────────────────────────────────────────────────────────────

export interface Look {
  cloth: string
  legs: string
  skin: string
  boot: string
  /** 1 = full sleeve, 0.5 = short sleeve, 0 = bare arm. */
  sleeve: number
  glove?: string
  /** Torso silhouette padding: >1 for brutes, <1 for acrobats. */
  bulk?: number
}

export interface Hooks {
  /** Behind everything — capes, wings, tails, held props in the far hand. */
  back?: (ctx: CanvasRenderingContext2D, rig: Rig) => void
  /** Over the torso — belts, sashes, shell plates, coat fronts. */
  overTorso?: (ctx: CanvasRenderingContext2D, rig: Rig) => void
  /** In front of everything but the head — near-hand props. */
  front?: (ctx: CanvasRenderingContext2D, rig: Rig) => void
  /** The head, drawn last. Gets the head centre and its radius. */
  head?: (ctx: CanvasRenderingContext2D, rig: Rig, r: number) => void
}

export function spine(rig: Rig): { dx: number; dy: number; px: number; py: number } {
  const dx = rig.sh[0] - rig.hip[0]
  const dy = rig.sh[1] - rig.hip[1]
  const len = Math.hypot(dx, dy) || 1
  return { dx: dx / len, dy: dy / len, px: -dy / len, py: dx / len }
}

export function torsoPath(rig: Rig, b: Build, bulk = 1): Path2D {
  const { dx, dy, px, py } = spine(rig)
  const [hx, hy] = rig.hip
  const [sx, sy] = rig.sh
  const mx = (hx + sx) / 2
  const my = (hy + sy) / 2
  const sw = b.shW * bulk
  const hw = b.hipW * bulk
  const ww = (sw + hw) * 0.42
  return blob([
    [sx + dx * b.headR * 0.34 + px * sw * 0.5, sy + dy * b.headR * 0.34 + py * sw * 0.5],
    [sx + px * sw, sy + py * sw],
    [mx + px * ww, my + py * ww],
    [hx + px * hw, hy + py * hw],
    [hx - px * hw, hy - py * hw],
    [mx - px * ww * 1.05, my - py * ww * 1.05],
    [sx - px * sw, sy - py * sw],
    [sx + dx * b.headR * 0.34 - px * sw * 0.5, sy + dy * b.headR * 0.34 - py * sw * 0.5],
  ] as Pt[], 0.72)
}

function drawArm(
  ctx: CanvasRenderingContext2D,
  sh: Pt,
  elbow: Pt,
  hand: Pt,
  b: Build,
  look: Look,
  side: 'near' | 'far',
): void {
  const tint = (hex: string) => (side === 'far' ? far(hex) : C(hex))
  const upper = look.sleeve > 0.4 ? tint(look.cloth) : tint(look.skin)
  const fore = look.sleeve > 0.85 ? tint(look.cloth) : tint(look.skin)
  const rim = side === 'far' ? 0.25 : 0.45
  paint(ctx, limbPath(sh[0], sh[1], elbow[0], elbow[1], b.armR * 1.15, b.armR * 0.92), upper, {
    shadow: 0.46, radius: b.armR, pivot: sh, rim, line: 0.42,
  })
  paint(ctx, limbPath(elbow[0], elbow[1], hand[0], hand[1], b.armR * 0.92, b.armR * 0.74), fore, {
    shadow: 0.46, radius: b.armR * 0.9, pivot: elbow, rim, line: 0.42,
  })
  const fa = Math.atan2(hand[1] - elbow[1], hand[0] - elbow[0])
  if (look.sleeve > 0.85) {
    // Cuff: without it the hand looks like a ball stuck on a tube.
    const cx = hand[0] - Math.cos(fa) * b.armR * 0.9
    const cy = hand[1] - Math.sin(fa) * b.armR * 0.9
    paint(ctx, ellipsePath(cx, cy, b.armR * 0.62, b.armR * 0.92, fa), tint(look.cloth === PAL.marineWhite ? PAL.marineNavy : look.cloth), {
      shadow: 0.44, radius: b.armR, pivot: [cx, cy], line: 0.36,
    })
  }
  ctx.save()
  ctx.translate(hand[0], hand[1])
  ctx.rotate(fa)
  paint(ctx, roundRectPath(-b.armR * 0.6, -b.armR * 0.82, b.armR * 1.7, b.armR * 1.64, b.armR * 0.62),
    tint(look.glove ?? look.skin), {
      shadow: look.glove ? 0.42 : FACE_SHADOW, radius: b.armR * 1.4, pivot: [0, 0], rim: rim * 0.6, line: 0.4,
    })
  ctx.restore()
}

function drawLeg(
  ctx: CanvasRenderingContext2D,
  hip: Pt,
  knee: Pt,
  ankle: Pt,
  footAngle: number,
  b: Build,
  look: Look,
  side: 'near' | 'far',
): void {
  const tint = (hex: string) => (side === 'far' ? far(hex) : C(hex))
  limb2(ctx, hip, knee, ankle, b.legR * 1.2, b.legR * 0.92, b.legR * 0.78, tint(look.legs),
    side === 'far' ? 0.25 : 0.42)
  foot(ctx, ankle, footAngle, b.legR * 3.2, b.legR * 1.5, tint(look.boot))
}

/** Draw a whole humanoid in the house style, back to front. */
export function drawFigure(
  ctx: CanvasRenderingContext2D,
  rig: Rig,
  b: Build,
  look: Look,
  pose: Pose,
  hooks: Hooks = {},
): void {
  hooks.back?.(ctx, rig)
  drawArm(ctx, [rig.sh[0] - b.z * 1.4, rig.sh[1] + b.headR * 0.1], rig.elbowF, rig.handF, b, look, 'far')
  drawLeg(ctx, [rig.hip[0] - b.z, rig.hip[1]], rig.kneeF, rig.ankleF, pose.footF, b, look, 'far')

  const torso = torsoPath(rig, b, look.bulk ?? 1)
  paint(ctx, torso, C(look.cloth), {
    shadow: 0.35, radius: b.shW * 1.4, pivot: [(rig.hip[0] + rig.sh[0]) / 2, (rig.hip[1] + rig.sh[1]) / 2],
    rim: 0.6, line: 0.5, occlusion: 0.2,
  })
  hooks.overTorso?.(ctx, rig)

  drawLeg(ctx, [rig.hip[0] + b.z, rig.hip[1]], rig.kneeN, rig.ankleN, pose.footN, b, look, 'near')
  drawArm(ctx, [rig.sh[0] + b.z * 1.4, rig.sh[1] + b.headR * 0.1], rig.elbowN, rig.handN, b, look, 'near')
  hooks.front?.(ctx, rig)
  hooks.head?.(ctx, rig, b.headR)
}

// ─────────────────────────────────────────────────────────────────────────────
// Marines
// ─────────────────────────────────────────────────────────────────────────────

const MARINE_BUILD: Build = {
  hip: 13.5, thigh: 7, shin: 6.5, torso: 8.4, upper: 5, fore: 4.6,
  headR: 3.5, hipW: 3.1, shW: 3.9, legR: 1.5, armR: 1.25, z: 1.1,
}

const MARINE_LOOK: Look = {
  cloth: PAL.marineWhite, legs: mix(PAL.marineNavy, PAL.marineBlue, 0.42),
  skin: PAL.skin, boot: TONE.boot, sleeve: 1,
}

/** The peaked cap: bill forward, gold band, the whole reason he reads Marine. */
function marineCap(
  ctx: CanvasRenderingContext2D,
  hx: number,
  hy: number,
  r: number,
  tilt: number,
  braid = false,
): void {
  ctx.save()
  ctx.translate(hx, hy)
  ctx.rotate(tilt)
  const navy = C(PAL.marineNavy)
  // Bill.
  paint(ctx, blob([
    [r * 0.2, -r * 0.86],
    [r * 1.42, -r * 0.94],
    [r * 1.46, -r * 0.62],
    [r * 0.2, -r * 0.5],
  ] as Pt[], 0.45), C(TONE.boot), {
    shadow: 0.5, radius: r * 0.4, pivot: [r * 0.8, -r * 0.75], rim: 0.35, line: 0.4,
  })
  // Crown.
  paint(ctx, blob([
    [-r * 1.04, -r * 0.78],
    [-r * 0.9, -r * 1.36],
    [r * 0.16, -r * 1.62],
    [r * 0.98, -r * 1.3],
    [r * 1.06, -r * 0.8],
  ] as Pt[], 0.75), navy, {
    shadow: 0.38, radius: r, pivot: [0, -r * 1.1], rim: 0.55, line: 0.48,
  })
  ctx.fillStyle = PAL.gold
  ctx.fill(roundRectPath(-r * 0.98, -r * 1.0, r * 2.0, r * 0.24, r * 0.1))
  if (braid) {
    ctx.fillStyle = PAL.gold
    ctx.fill(ellipsePath(r * 0.5, -r * 1.34, r * 0.24, r * 0.18))
    ctx.fillStyle = TONE.brass
    ctx.fill(roundRectPath(r * 0.2, -r * 0.92, r * 1.24, r * 0.16, r * 0.08))
  }
  ctx.restore()
}

function marineHead(
  ctx: CanvasRenderingContext2D,
  hx: number,
  hy: number,
  r: number,
  tilt: number,
  o: { braid?: boolean; beard?: boolean; face?: Mouth } = {},
): void {
  const skin = C(PAL.skin, 0.34)
  const head = headPath(hx, hy, r)
  earAndNeck(ctx, hx, hy, r, skin)
  paint(ctx, head, skin, {
    shadow: FACE_SHADOW, radius: r * 1.3, pivot: [hx, hy], rim: 0.5, line: 0.45,
  })
  paint(ctx, blob([
    [hx - r * 0.98, hy - r * 0.5],
    [hx - r * 0.5, hy - r * 0.86],
    [hx - r * 0.44, hy + r * 0.28],
    [hx - r * 0.88, hy + r * 0.18],
  ] as Pt[], 0.6), C(mix(PAL.usoppBrown, PAL.ink, 0.35)), {
    shadow: 0.44, radius: r * 0.5, pivot: [hx - r * 0.7, hy], line: 0.38,
  })
  nose(ctx, hx, hy + r * 0.08, r, skin)
  eyes3q(ctx, hx, hy + r * 0.1, r, { angry: true })
  mouth(ctx, hx, hy + r * 0.62, r, o.face ?? 'grim')
  if (o.beard) {
    paint(ctx, blob([
      [hx + r * 0.28, hy + r * 0.72],
      [hx + r * 0.86, hy + r * 0.5],
      [hx + r * 0.7, hy + r * 1.3],
      [hx + r * 0.2, hy + r * 1.16],
    ] as Pt[], 0.7), C(PAL.slate), {
      shadow: 0.44, radius: r * 0.5, pivot: [hx + r * 0.5, hy + r], line: 0.42,
    })
  }
  marineCap(ctx, hx, hy, r, tilt, o.braid)
}

type Mode = 'idle' | 'walk' | 'run' | 'windup' | 'attack' | 'squash'

function poseFor(mode: Mode, t: number, stride = 1): Pose {
  if (mode === 'run') return gait(RUN_KEYS, t, stride)
  if (mode === 'walk') return gait(WALK_KEYS, t, stride)
  return idlePose(t)
}

/** Marine rank-and-file — the first enemy in the game, and the softest read. */
function drawGrunt(s: Surface, t: number, mode: Mode = 'walk'): void {
  const ctx = s.ctx
  const cx = s.w * 0.5
  const gy = s.h - 1

  if (mode === 'squash') {
    // Flattened: the cap survives, which is the joke and the read.
    contactShadow(ctx, cx, gy - 0.4, 9, 1.6, 0.35)
    paint(ctx, blob([
      [cx - 9, gy - 2.6],
      [cx - 4, gy - 5],
      [cx + 5.5, gy - 4.6],
      [cx + 9.5, gy - 2.2],
      [cx + 4, gy - 0.6],
      [cx - 6, gy - 0.8],
    ] as Pt[], 0.8), C(PAL.marineWhite), {
      shadow: 0.44, radius: 5, pivot: [cx, gy - 2.6], rim: 0.6, line: 0.55,
    })
    paint(ctx, ellipsePath(cx - 1.6, gy - 4.4, 4.6, 2.2, -0.12), C(PAL.skin, 0.34), {
      shadow: 0.42, radius: 3, pivot: [cx - 1.6, gy - 4.4], rim: 0.5, line: 0.5,
    })
    eyes3q(ctx, cx - 1.6, gy - 4.6, 2.6, { lid: 0.9 })
    marineCap(ctx, cx - 1.2, gy - 5.2, 2.7, -0.35)
    return
  }

  const pose = poseFor(mode, t)
  const rig = solveRig(cx, gy, MARINE_BUILD, pose)
  const b = MARINE_BUILD
  drawFigure(ctx, rig, b, MARINE_LOOK, pose, {
    overTorso: (c, r) => {
      // Navy collar, belt and the sheathed cutlass on the far hip.
      const { px, py, dx, dy } = spine(r)
      paint(c, blob([
        [r.sh[0] - px * b.shW * 0.9, r.sh[1] - py * b.shW * 0.9],
        [r.sh[0] + dx * 1.2, r.sh[1] + dy * 1.2],
        [r.sh[0] + px * b.shW * 0.9, r.sh[1] + py * b.shW * 0.9],
        [r.sh[0] - dx * 1.6 + px * b.shW * 0.5, r.sh[1] - dy * 1.6 + py * b.shW * 0.5],
        [r.sh[0] - dx * 1.6 - px * b.shW * 0.5, r.sh[1] - dy * 1.6 - py * b.shW * 0.5],
      ] as Pt[], 0.6), C(PAL.marineNavy), {
        shadow: 0.42, radius: b.shW, pivot: r.sh, rim: 0.5, line: 0.45,
      })
      paint(c, limbPath(
        r.hip[0] - px * b.hipW, r.hip[1] - py * b.hipW,
        r.hip[0] + px * b.hipW, r.hip[1] + py * b.hipW, 0.85, 0.85,
      ), C(TONE.strap), { shadow: 0.42, radius: 1, pivot: r.hip, line: 0.4 })
      c.fillStyle = PAL.gold
      c.fill(roundRectPath(r.hip[0] - 0.7, r.hip[1] - 0.8, 1.5, 1.6, 0.4))
    },
    front: (c, r) => {
      // Scabbard, angled back from the belt so the silhouette gets a diagonal.
      const bx = r.hip[0] + 0.6
      const by = r.hip[1] - 0.4
      paint(c, limbPath(bx, by, bx - 5.6, by + 4.4, 0.62, 0.42), C(TONE.ironDark), {
        shadow: 0.4, radius: 1, pivot: [bx, by], rim: 0.3, line: 0.4,
      })
      c.fillStyle = TONE.brass
      c.fill(ellipsePath(bx - 0.4, by + 0.3, 0.7, 0.55))
    },
    head: (c, r) => marineHead(c, r.head[0], r.head[1], b.headR, -0.1 + pose.headTilt),
  })
}

/** Shield Marine — the shield says "not from the front". */
function drawShielder(s: Surface, t: number, mode: Mode = 'walk'): void {
  const ctx = s.ctx
  const cx = s.w * 0.5
  const gy = s.h - 1
  const b = MARINE_BUILD
  const pose = poseFor(mode === 'run' ? 'walk' : mode, t, 0.72)
  const rig = solveRig(cx, gy, b, { ...pose, armN: [0.5, 0.55], lean: 0.12 })

  drawFigure(ctx, rig, b, { ...MARINE_LOOK, bulk: 1.06 }, pose, {
    overTorso: (c, r) => {
      // Pauldron on the shield shoulder.
      paint(c, blob([
        [r.sh[0] - 1.4, r.sh[1] - 1.6],
        [r.sh[0] + 3.4, r.sh[1] - 1.2],
        [r.sh[0] + 3.6, r.sh[1] + 1.6],
        [r.sh[0] - 1.2, r.sh[1] + 1.2],
      ] as Pt[], 0.7), C(TONE.steel), {
        shadow: 0.38, radius: 2.4, pivot: r.sh, rim: 0.6, line: 0.5,
      })
    },
    head: (c, r) => marineHead(c, r.head[0], r.head[1], b.headR, -0.1 + pose.headTilt),
    front: (c, r) => {
      // The shield: a tall kite, hung off the near hand, tilted into the walk.
      const hx = r.handN[0] + 1.2
      const hy = r.handN[1] - 3.6
      const shield = blob([
        [hx - 3.4, hy - 8.2],
        [hx + 2.6, hy - 7.4],
        [hx + 3.6, hy + 1.4],
        [hx - 0.6, hy + 8.4],
        [hx - 4.2, hy + 1.2],
      ] as Pt[], 0.6)
      paint(c, shield, C(TONE.steel), {
        shadow: 0.34, radius: 4.4, pivot: [hx, hy], rim: 0.8, line: 0.6, occlusion: 0.2,
      })
      inside(c, shield, (cc) => {
        cc.fillStyle = PAL.marineNavy
        cc.fill(blob([
          [hx - 3.2, hy - 1.4], [hx + 3.4, hy - 2.2], [hx - 0.4, hy + 8],
        ] as Pt[], 0.5))
        cc.fillStyle = PAL.gold
        cc.fill(ellipsePath(hx - 0.2, hy - 2.2, 1.5, 1.9))
        glint(cc, hx - 2.2, hy - 5, 0.7, 3.2, 0.22, PAL.white, 0.5)
      })
    },
  })
}

/** Marine officer — coat tails, epaulettes and a sabre that telegraphs. */
function drawOfficer(s: Surface, t: number, mode: Mode = 'walk'): void {
  const ctx = s.ctx
  const cx = s.w * 0.5
  const gy = s.h - 1
  const b: Build = { ...MARINE_BUILD, hip: 15, thigh: 7.6, shin: 7.4, torso: 9.2, headR: 3.6, shW: 4.3 }
  const look: Look = { ...MARINE_LOOK, cloth: PAL.marineNavy, legs: mix(PAL.marineNavy, PAL.ink, 0.25) }

  let pose = poseFor(mode, t, 0.9)
  if (mode === 'windup') {
    pose = P({ hip: 0.6, lean: -0.16, legN: [0.42, -0.3], legF: [-0.5, 0.5], armN: [-1.5, 0.5], armF: [-0.5, 0.7], footN: 0.2, footF: -0.2, drag: -1.6 })
  } else if (mode === 'attack') {
    pose = P({ hip: -0.4, lean: 0.34, legN: [0.72, -0.2], legF: [-0.66, 0.4], armN: [1.35, 0.15], armF: [0.5, 0.6], footN: 0.34, footF: -0.4, drag: 2.6 })
  }
  const rig = solveRig(cx, gy, b, pose)
  // At rest the blade hangs down the leg: across the chest it would cut the face.
  const sabreAngle = mode === 'windup' ? -2.5 : mode === 'attack' ? 0.8 : 2.55

  drawFigure(ctx, rig, b, look, pose, {
    back: (c, r) => {
      // Coat, hung from the shoulders and lagging behind the stride.
      const d = pose.drag
      paint(c, blob([
        [r.sh[0] - 4.2, r.sh[1] - 0.6],
        [r.sh[0] + 4.0, r.sh[1] - 0.4],
        [r.hip[0] + 3.6, r.hip[1] + 6.5],
        [r.hip[0] - 1 - d, r.hip[1] + 8.5],
        [r.hip[0] - 5 - d * 1.6, r.hip[1] + 5],
        [r.hip[0] - 4.6, r.hip[1] - 1],
      ] as Pt[], 0.72), C(PAL.marineWhite), {
        shadow: 0.44, radius: 5, pivot: [r.hip[0], r.hip[1] + 2], rim: 0.6, line: 0.55, occlusion: 0.24,
      })
    },
    overTorso: (c, r) => {
      const { px, py } = spine(r)
      // Sash across the chest — the officer's one bright note.
      paint(c, limbPath(
        r.sh[0] - px * 3.2, r.sh[1] - py * 3.2 + 0.4,
        r.hip[0] + px * 2.4, r.hip[1] + py * 2.4 - 0.6, 1.1, 0.9,
      ), C(PAL.luffyRed), { shadow: 0.42, radius: 1.4, pivot: r.sh, rim: 0.4, line: 0.42 })
      for (const dz of [-1, 1]) {
        paint(c, blob([
          [r.sh[0] + dz * 2.4 - 1.2, r.sh[1] - 1.6],
          [r.sh[0] + dz * 4.2, r.sh[1] - 1.4],
          [r.sh[0] + dz * 4.4, r.sh[1] + 0.6],
          [r.sh[0] + dz * 2.2, r.sh[1] + 0.4],
        ] as Pt[], 0.6), C(PAL.gold), {
          shadow: 0.4, radius: 1.6, pivot: r.sh, rim: 0.5, line: 0.45,
        })
      }
    },
    front: (c, r) => {
      // Sabre: a long curved blade whose angle is the whole tell.
      const hx = r.handN[0]
      const hy = r.handN[1]
      c.save()
      c.translate(hx, hy)
      c.rotate(sabreAngle)
      paint(c, roundRectPath(-0.5, -1.4, 1.2, 3.2, 0.5), C(TONE.brass), {
        shadow: 0.4, radius: 1, pivot: [0, 0], line: 0.4,
      })
      paint(c, blob([
        [-0.7, -1.6], [0.9, -2.2], [0.5, 1.4], [-0.9, 1.2],
      ] as Pt[], 0.5), C(PAL.gold), { shadow: 0.38, radius: 1.2, pivot: [0, 0], rim: 0.4, line: 0.4 })
      const blade = blob([
        [-0.55, -2.2], [0.6, -2.4], [1.5, -11], [0.1, -15.5], [-0.5, -10.5],
      ] as Pt[], 0.5)
      paint(c, blade, C(TONE.steel), {
        shadow: 0.3, radius: 1.4, pivot: [0, -8], rim: 0.5, line: 0.45,
      })
      glint(c, 0.5, -9, 0.28, 4.4, 0.04, PAL.white, 0.6)
      c.restore()
      if (mode === 'attack') {
        // The arc the blade just swept, drawn as one tapered ink stroke.
        c.save()
        c.globalAlpha = 0.75
        inkStroke(c, crescentPath(r.sh[0] + 1, r.sh[1] + 1, 15, 3.4, -1.7, 0.35), 0.5,
          mix(PAL.cream, PAL.skyLow, 0.4), 0.5)
        c.fillStyle = mix(PAL.cream, PAL.magic, 0.25)
        c.globalAlpha = 0.4
        c.fill(crescentPath(r.sh[0] + 1, r.sh[1] + 1, 15, 2.6, -1.55, 0.2))
        c.restore()
      }
    },
    head: (c, r) => marineHead(c, r.head[0], r.head[1], b.headR, -0.12 + pose.headTilt, {
      braid: true, beard: true, face: mode === 'attack' ? 'open' : 'grim',
    }),
  })
}

/** Cannon emplacement: a gun, its carriage, and the Marine who fires it. */
function drawCannon(s: Surface, t: number, mode: Mode = 'idle'): void {
  const ctx = s.ctx
  const cx = s.w * 0.5
  const gy = s.h - 1
  const recoil = mode === 'attack' ? -3.2 : mode === 'windup' ? 1.1 : 0
  const bob = Math.sin(t * Math.PI * 2) * 0.3

  // Crewman behind the gun, linstock raised on the wind-up.
  const b: Build = { ...MARINE_BUILD, hip: 11.5, thigh: 6, shin: 5.6, torso: 7.4, headR: 3.1 }
  const armN: [number, number] = mode === 'windup' ? [-2.2, 0.2] : mode === 'attack' ? [-0.6, 0.9] : [-1.5, 0.5]
  const crewPose = P({ hip: bob, lean: 0.1, legN: [0.3, -0.3], legF: [-0.3, 0.44], armN, armF: [0.5, 0.5], footN: 0.2, footF: -0.2 })
  const rig = solveRig(cx - 9, gy, b, crewPose)
  drawFigure(ctx, rig, b, MARINE_LOOK, crewPose, {
    front: (c, r) => {
      paint(c, limbPath(r.handN[0], r.handN[1], r.handN[0] - 2.6, r.handN[1] - 6, 0.45, 0.35), C(PAL.wood), {
        shadow: 0.42, radius: 1, pivot: r.handN, line: 0.35,
      })
      if (mode === 'windup') {
        ctx.fillStyle = PAL.ember
        ctx.globalAlpha = 0.9
        ctx.fill(ellipsePath(r.handN[0] - 2.6, r.handN[1] - 6.2, 0.7, 1.1))
        ctx.globalAlpha = 1
      }
    },
    head: (c, r) => marineHead(c, r.head[0], r.head[1], b.headR, -0.1),
  })

  // Carriage.
  const carX = cx + 2 + recoil * 0.5
  paint(ctx, blob([
    [carX - 8, gy - 3.4],
    [carX + 7, gy - 4.6],
    [carX + 8.4, gy - 1.6],
    [carX - 8.4, gy - 1.2],
  ] as Pt[], 0.4), C(PAL.wood), {
    shadow: 0.44, radius: 3, pivot: [carX, gy - 3], rim: 0.5, line: 0.55,
  })
  for (const [wx, wr] of [[carX - 5.2, 2.6], [carX + 4.6, 3.1]] as Array<[number, number]>) {
    paint(ctx, ellipsePath(wx, gy - wr * 0.85, wr, wr), C(mix(PAL.wood, PAL.dirtDeep, 0.4)), {
      shadow: 0.44, radius: wr, pivot: [wx, gy - wr], rim: 0.45, line: 0.55,
    })
    ctx.save()
    ctx.strokeStyle = C(TONE.ironDark).core
    ctx.lineWidth = 0.5
    for (let i = 0; i < 4; i++) {
      const a = i * (Math.PI / 4) + t * 0.6
      ctx.beginPath()
      ctx.moveTo(wx - Math.cos(a) * wr * 0.8, gy - wr * 0.85 - Math.sin(a) * wr * 0.8)
      ctx.lineTo(wx + Math.cos(a) * wr * 0.8, gy - wr * 0.85 + Math.sin(a) * wr * 0.8)
      ctx.stroke()
    }
    ctx.restore()
  }

  // The gun itself: a heavy taper, breech low and muzzle raised.
  const bx = carX - 6 + recoil
  const by = gy - 7.5
  const mxp = carX + 13 + recoil
  const myp = gy - 10.5
  paint(ctx, limbPath(bx, by, mxp, myp, 3.1, 2.3), C(TONE.ironDark), {
    shadow: 0.4, radius: 3.2, pivot: [carX, by], rim: 0.7, line: 0.6, occlusion: 0.25,
  })
  paint(ctx, ellipsePath(bx - 0.6, by + 0.3, 1.5, 3.2, -0.15), C(mix(TONE.ironDark, PAL.ink, 0.3)), {
    shadow: 0.42, radius: 3, pivot: [bx, by], line: 0.5,
  })
  paint(ctx, ellipsePath(mxp, myp, 1.3, 2.7, -0.15), C(PAL.ink), { shadow: 0.2, radius: 2.6, pivot: [mxp, myp], line: 0.5 })
  ctx.fillStyle = TONE.brass
  ctx.fill(roundRectPath(carX - 1, by - 2.4, 3.4, 1.2, 0.5))
  glint(ctx, carX + 2, by - 2.6, 3.4, 0.5, -0.12, PAL.white, 0.35)

  if (mode === 'attack') {
    // Muzzle flash: additive, warm, and gone in one frame.
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = PAL.ember
    ctx.globalAlpha = 0.9
    ctx.fill(blob([
      [mxp + 1, myp - 3.4], [mxp + 9, myp - 1.4], [mxp + 12, myp + 0.6],
      [mxp + 8, myp + 1.8], [mxp + 1, myp + 3.2],
    ] as Pt[], 0.6))
    ctx.fillStyle = PAL.cream
    ctx.globalAlpha = 0.8
    ctx.fill(blob([
      [mxp + 0.6, myp - 1.8], [mxp + 5, myp - 0.6], [mxp + 6.4, myp + 0.4], [mxp + 1, myp + 1.8],
    ] as Pt[], 0.6))
    ctx.restore()
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Circus pirates — the first island's rank and file
// ─────────────────────────────────────────────────────────────────────────────

/** Diagonal stripes inside a shape. Circus cloth, and nothing else. */
export function stripes(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  color: string,
  centre: Pt,
  spacing = 2.2,
  angle = 0.28,
  width = 1.1,
): void {
  inside(ctx, path, (c) => {
    c.translate(centre[0], centre[1])
    c.rotate(angle)
    c.fillStyle = color
    for (let i = -8; i <= 8; i++) c.fillRect(-14, i * spacing, 28, width)
  })
}

/** Domino mask and a pointed cap — the troupe's face, whatever the body does. */
export function clownHead(
  ctx: CanvasRenderingContext2D,
  hx: number,
  hy: number,
  r: number,
  tilt: number,
  o: { nose?: boolean; hat?: 'cone' | 'jester' | 'none' } = {},
): void {
  const skin = C(mix(PAL.skin, PAL.cream, 0.3), 0.34)
  earAndNeck(ctx, hx, hy, r, skin)
  paint(ctx, headPath(hx, hy, r, 0.92), skin, {
    shadow: FACE_SHADOW, radius: r * 1.3, pivot: [hx, hy], rim: 0.5, line: 0.45,
  })
  // Mask band across the eyes.
  const band = blob([
    [hx - r * 0.96, hy - r * 0.34],
    [hx + r * 1.0, hy - r * 0.44],
    [hx + r * 0.98, hy + r * 0.24],
    [hx - r * 0.92, hy + r * 0.18],
  ] as Pt[], 0.5)
  paint(ctx, band, C(TONE.circusRed), {
    shadow: 0.42, radius: r * 0.5, pivot: [hx, hy], rim: 0.35, line: 0.4,
  })
  eyes3q(ctx, hx, hy + r * 0.02, r, { color: PAL.cream, wide: true })
  mouth(ctx, hx, hy + r * 0.66, r, 'grin')
  if (o.nose) {
    paint(ctx, ellipsePath(hx + r * 0.92, hy + r * 0.16, r * 0.3, r * 0.28), C(PAL.luffyRed), {
      shadow: 0.34, radius: r * 0.4, pivot: [hx + r * 0.92, hy + r * 0.16], rim: 0.3, line: 0.4,
    })
  }
  ctx.save()
  ctx.translate(hx, hy)
  ctx.rotate(tilt)
  if (o.hat === 'cone') {
    paint(ctx, blob([
      [-r * 0.96, -r * 0.72],
      [r * 0.3, -r * 2.9],
      [r * 1.0, -r * 0.66],
    ] as Pt[], 0.35), C(TONE.circusCream), {
      shadow: 0.4, radius: r, pivot: [0, -r * 1.4], rim: 0.5, line: 0.45,
    })
    stripes(ctx, blob([
      [-r * 0.96, -r * 0.72], [r * 0.3, -r * 2.9], [r * 1.0, -r * 0.66],
    ] as Pt[], 0.35), TONE.circusRed, [0, -r * 1.4], r * 0.5, 0.2, r * 0.24)
    ctx.fillStyle = PAL.gold
    ctx.fill(ellipsePath(r * 0.3, -r * 2.9, r * 0.24, r * 0.24))
  } else if (o.hat === 'jester') {
    for (const dx of [-0.7, 0.2, 1.0]) {
      paint(ctx, blob([
        [dx * r - r * 0.4, -r * 0.8],
        [dx * r + r * 0.1, -r * 2.2],
        [dx * r + r * 0.42, -r * 0.76],
      ] as Pt[], 0.4), C(dx < 0 ? TONE.circusRed : TONE.circusCream), {
        shadow: 0.4, radius: r * 0.6, pivot: [dx * r, -r * 1.3], line: 0.4,
      })
    }
  }
  ctx.restore()
}

const ACROBAT_BUILD: Build = {
  hip: 14, thigh: 7.4, shin: 7, torso: 7.8, upper: 5.2, fore: 4.8,
  headR: 3.2, hipW: 2.4, shW: 3.2, legR: 1.2, armR: 1.05, z: 1,
}

/** Circus acrobat — light, springy, arms out for balance. */
function drawAcrobat(s: Surface, t: number, mode: Mode = 'walk'): void {
  const ctx = s.ctx
  const cx = s.w * 0.5
  const gy = s.h - 1
  const b = ACROBAT_BUILD
  const look: Look = {
    cloth: TONE.circusCream, legs: TONE.circusRed, skin: mix(PAL.skin, PAL.cream, 0.3),
    boot: mix(PAL.cream, PAL.sandDeep, 0.3), sleeve: 1, bulk: 0.92,
  }
  let pose = poseFor(mode, t, 1.15)
  if (mode === 'windup') {
    pose = P({ hip: 3.2, lean: 0.3, legN: [0.6, -1.3], legF: [-0.3, 1.5], armN: [-1.1, 0.2], armF: [-1.3, 0.3], footN: 0.1, footF: 0.1 })
  } else if (mode === 'attack') {
    pose = P({ hip: -1.6, lean: -0.2, legN: [1.5, -1.8], legF: [1.1, -1.6], armN: [2.4, 0.3], armF: [2.6, 0.4], footN: 1.2, footF: 1.0 })
  } else {
    pose = { ...pose, armN: [pose.armN[0] - 0.5, 0.15], armF: [pose.armF[0] + 0.5, 0.15] }
  }
  const rig = solveRig(cx, gy, b, pose)
  drawFigure(ctx, rig, b, look, pose, {
    overTorso: (c, r) => {
      stripes(c, torsoPath(r, b, look.bulk), TONE.circusRed, [(r.hip[0] + r.sh[0]) / 2, (r.hip[1] + r.sh[1]) / 2], 2.1, 0.22, 1.05)
      // Ruffled collar — the read that says circus from across the screen.
      for (let i = -3; i <= 3; i++) {
        const a = i * 0.34
        paint(c, ellipsePath(r.sh[0] + Math.sin(a) * 3.4, r.sh[1] - 0.6 + Math.cos(a) * 0.9, 1.5, 1.1, a * 0.4),
          C(i % 2 === 0 ? TONE.circusRed : TONE.circusCream), {
            shadow: 0.4, radius: 1.4, pivot: r.sh, line: 0.36,
          })
      }
    },
    front: (c, r) => {
      stripes(c, limbPath(r.hip[0] + b.z, r.hip[1], r.kneeN[0], r.kneeN[1], b.legR * 1.2, b.legR * 0.92),
        TONE.circusCream, r.hip, 2, 0.5, 1)
    },
    head: (c, r) => clownHead(c, r.head[0], r.head[1], b.headR, -0.06 + pose.headTilt, { hat: 'jester' }),
  })
}

/** Circus knife-juggler — stocky, and the knife hand is always the tell. */
function drawJuggler(s: Surface, t: number, mode: Mode = 'walk'): void {
  const ctx = s.ctx
  const cx = s.w * 0.5
  const gy = s.h - 1
  const b: Build = { ...MARINE_BUILD, hip: 12.6, thigh: 6.2, shin: 6, torso: 8, headR: 3.6, hipW: 3.6, shW: 4.1 }
  const look: Look = {
    cloth: TONE.circusRed, legs: TONE.circusCream, skin: mix(PAL.skin, PAL.cream, 0.2),
    boot: mix(PAL.dirtDeep, PAL.ink, 0.2), sleeve: 0.5, bulk: 1.12,
  }
  let pose = poseFor(mode, t, 0.85)
  if (mode === 'windup') pose = P({ hip: 0.4, lean: -0.2, legN: [0.4, -0.4], legF: [-0.4, 0.5], armN: [-2.3, 0.6], armF: [-0.6, 0.8], footN: 0.2, footF: -0.2 })
  else if (mode === 'attack') pose = P({ hip: -0.2, lean: 0.3, legN: [0.6, -0.3], legF: [-0.5, 0.4], armN: [1.2, 0.1], armF: [0.4, 0.7], footN: 0.3, footF: -0.3 })
  const rig = solveRig(cx, gy, b, pose)

  const knife = (c: CanvasRenderingContext2D, x: number, y: number, a: number, scale = 1) => {
    c.save()
    c.translate(x, y)
    c.rotate(a)
    c.scale(scale, scale)
    paint(c, blob([[-0.5, 0], [0.5, -0.4], [0.35, -5.4], [-0.3, -5]] as Pt[], 0.3), C(TONE.steel), {
      shadow: 0.32, radius: 1, pivot: [0, -2.5], rim: 0.4, line: 0.36,
    })
    paint(c, roundRectPath(-0.7, 0, 1.5, 2.2, 0.5), C(PAL.wood), {
      shadow: 0.42, radius: 1, pivot: [0, 1], line: 0.36,
    })
    c.restore()
  }

  drawFigure(ctx, rig, b, look, pose, {
    back: (c, r) => {
      // Two knives already in the air, so the threat is legible at a glance.
      if (mode === 'idle' || mode === 'walk' || mode === 'run') {
        const spin = t * Math.PI * 2
        knife(c, r.sh[0] - 5.5, r.sh[1] - 6 - Math.sin(spin) * 2, spin * 2)
        knife(c, r.sh[0] + 1.5, r.sh[1] - 9 - Math.sin(spin + 2) * 2, spin * 2 + 2)
      }
    },
    overTorso: (c, r) => {
      stripes(c, torsoPath(r, b, look.bulk), TONE.circusCream, [(r.hip[0] + r.sh[0]) / 2, (r.hip[1] + r.sh[1]) / 2], 2.6, -0.2, 1.3)
      paint(c, limbPath(r.hip[0] - 3.4, r.hip[1] - 0.6, r.hip[0] + 3.4, r.hip[1] - 0.2, 1, 1), C(PAL.gold), {
        shadow: 0.4, radius: 1.2, pivot: r.hip, line: 0.4,
      })
    },
    front: (c, r) => {
      knife(c, r.handN[0], r.handN[1], mode === 'windup' ? -2.2 : mode === 'attack' ? 1.4 : -0.6)
      if (mode === 'attack') {
        c.save()
        c.globalAlpha = 0.6
        inkStroke(c, curve([[r.handN[0], r.handN[1]], [r.handN[0] + 5, r.handN[1] - 1.4], [r.handN[0] + 9.5, r.handN[1] - 1]] as Pt[]), 0.6, TONE.circusCream, 0.4)
        c.restore()
      }
    },
    head: (c, r) => clownHead(c, r.head[0], r.head[1], b.headR, -0.08 + pose.headTilt, { nose: true, hat: 'cone' }),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Fishmen
// ─────────────────────────────────────────────────────────────────────────────

/** A fish head: long jaw, no nose, gills, and the eye set far forward. */
export function fishHead(
  ctx: CanvasRenderingContext2D,
  hx: number,
  hy: number,
  r: number,
  tilt: number,
  o: { skin: string; belly: string; shark?: boolean; open?: boolean } = { skin: PAL.fishmanTeal, belly: TONE.sharkBelly },
): void {
  ctx.save()
  ctx.translate(hx, hy)
  ctx.rotate(tilt)
  const skin = C(o.skin)
  const snout = o.shark ? 1.5 : 1.15
  const head = blob([
    [-r * 0.2, -r * 1.05],
    [r * 0.7, -r * 0.86],
    [r * snout, -r * 0.1],
    [r * (snout - 0.1), r * 0.5],
    [r * 0.3, r * 0.92],
    [-r * 0.6, r * 0.8],
    [-r * 1.05, r * 0.02],
    [-r * 0.8, -r * 0.8],
  ] as Pt[], 0.85)
  paint(ctx, head, skin, {
    shadow: 0.38, radius: r * 1.2, pivot: [0, 0], rim: 0.6, line: 0.5, occlusion: 0.2,
  })
  // Pale throat: fish are counter-shaded, and it breaks the silhouette's mass.
  inside(ctx, head, (c) => {
    c.fillStyle = mix(C(o.belly).core, C(o.skin).core, 0.4)
    c.fill(blob([
      [-r * 0.4, r * 0.46], [r * 0.4, r * 0.44], [r * snout, r * 0.3],
      [r * snout, r * 1.2], [-r * 0.7, r * 1.1],
    ] as Pt[], 0.7))
  })
  // Head crest / dorsal ridge.
  paint(ctx, blob([
    [-r * 0.75, -r * 0.82],
    [-r * 1.5, -r * 1.15],
    [-r * 0.05, -r * 1.12],
    [r * 0.42, -r * 0.86],
  ] as Pt[], 0.55), C(mix(o.skin, PAL.ink, 0.25)), {
    shadow: 0.44, radius: r * 0.6, pivot: [-r * 0.4, -r * 0.95], line: 0.42,
  })
  eyes3q(ctx, 0, -r * 0.16, r, { angry: true, wide: true })
  if (o.shark) {
    // A row of teeth along the jaw line — the whole point of a shark bruiser.
    const jaw = curve([[-r * 0.5, r * 0.42], [r * 0.5, r * 0.5], [r * (snout - 0.06), r * 0.16]] as Pt[])
    ctx.strokeStyle = INK
    ctx.lineWidth = 0.5
    ctx.stroke(jaw)
    ctx.fillStyle = PAL.cream
    for (let i = 0; i < 4; i++) {
      const u = i / 4
      const tx = -r * 0.1 + u * r * (snout + 0.1)
      const ty = r * (0.5 - u * u * 0.34)
      ctx.beginPath()
      ctx.moveTo(tx, ty)
      ctx.lineTo(tx + r * 0.13, ty)
      ctx.lineTo(tx + r * 0.06, ty + r * 0.24)
      ctx.closePath()
      ctx.fill()
    }
  } else {
    mouth(ctx, -r * 0.2, r * 0.5, r, o.open ? 'open' : 'grim')
  }
  // Gills.
  ctx.save()
  ctx.strokeStyle = skin.line
  ctx.lineWidth = 0.4
  for (let i = 0; i < 3; i++) {
    ctx.stroke(curve([[-r * (0.72 - i * 0.16), r * 0.02], [-r * (0.78 - i * 0.16), r * 0.5]] as Pt[]))
  }
  ctx.restore()
  ctx.restore()
}

/** Fishman spearman — patrols, coils, then leaps. */
function drawFishman(s: Surface, t: number, mode: Mode = 'walk'): void {
  const ctx = s.ctx
  const cx = s.w * 0.5
  const gy = s.h - 1
  const b: Build = { ...MARINE_BUILD, hip: 14.5, thigh: 7.2, shin: 7, torso: 9, headR: 3.7, shW: 4.4, hipW: 3.2, legR: 1.7, armR: 1.4 }
  const look: Look = {
    cloth: PAL.fishmanTeal, legs: PAL.fishmanTeal, skin: PAL.fishmanTeal,
    boot: mix(PAL.fishmanTeal, PAL.ink, 0.35), sleeve: 0, bulk: 1.05,
  }
  let pose = poseFor(mode, t, 1)
  if (mode === 'windup') {
    pose = P({ hip: 4, lean: 0.36, legN: [0.66, -1.5], legF: [-0.16, 1.4], armN: [-1.9, 0.5], armF: [-1.6, 0.6], footN: 0.1, footF: 0.1 })
  }
  const rig = solveRig(cx, gy, b, pose)
  const sp = mode === 'windup' ? -0.55 : 0.72

  drawFigure(ctx, rig, b, look, pose, {
    back: (c, r) => {
      // Dorsal fin, behind everything, reaching above the shoulder line.
      paint(c, blob([
        [r.sh[0] - 1.5, r.sh[1] + 1],
        [r.sh[0] - 6.5, r.sh[1] - 5.5],
        [r.sh[0] - 3.4, r.hip[1] - 1],
      ] as Pt[], 0.5), C(mix(PAL.fishmanTeal, PAL.seaDeep, 0.4)), {
        shadow: 0.46, radius: 4, pivot: [r.sh[0] - 3, r.sh[1] - 2], rim: 0.35, line: 0.45,
      })
      // Elbow fins.
      paint(c, blob([
        [r.elbowF[0] - 0.5, r.elbowF[1] - 1.6],
        [r.elbowF[0] - 3.4, r.elbowF[1] + 0.6],
        [r.elbowF[0] - 0.4, r.elbowF[1] + 1.6],
      ] as Pt[], 0.4), far(PAL.fishmanTeal), { shadow: 0.44, radius: 2, pivot: r.elbowF, line: 0.4 })
    },
    overTorso: (c, r) => {
      inside(c, torsoPath(r, b, look.bulk), (cc) => {
        cc.fillStyle = mix(TONE.sharkBelly, PAL.fishmanTeal, 0.45)
        cc.fill(blob([
          [r.sh[0] + 1.6, r.sh[1] + 1.4], [r.sh[0] + 4.6, r.sh[1] + 2.4], [r.hip[0] + 4, r.hip[1] + 1],
          [r.hip[0] + 1.4, r.hip[1] + 1],
        ] as Pt[], 0.7))
      })
      // Sash of shells at the waist.
      paint(c, limbPath(r.hip[0] - 3.6, r.hip[1] - 1.4, r.hip[0] + 3.4, r.hip[1] - 0.4, 1.1, 1.1), C(PAL.sand), {
        shadow: 0.42, radius: 1.3, pivot: r.hip, line: 0.4,
      })
    },
    front: (c, r) => {
      // Spear held in both hands, angled forward and up.
      const hx = r.handN[0]
      const hy = r.handN[1]
      c.save()
      c.translate(hx, hy)
      c.rotate(sp)
      paint(c, limbPath(0, 9, 0, -13, 0.55, 0.5), C(PAL.wood), {
        shadow: 0.42, radius: 1, pivot: [0, 0], rim: 0.3, line: 0.38,
      })
      paint(c, blob([[-1.2, -12.5], [0, -18.5], [1.2, -12.5], [0, -11]] as Pt[], 0.45), C(TONE.steel), {
        shadow: 0.3, radius: 2, pivot: [0, -15], rim: 0.5, line: 0.42,
      })
      c.fillStyle = C(PAL.wood).shade
      c.fill(roundRectPath(-0.7, -11.4, 1.4, 1.8, 0.5))
      c.restore()
      paint(c, ellipsePath(r.elbowN[0] + 1.4, r.elbowN[1] + 1.2, 1.1, 1.05), C(PAL.fishmanTeal), {
        shadow: FACE_SHADOW, radius: 1.4, pivot: r.elbowN, line: 0.38,
      })
    },
    head: (c, r) => fishHead(c, r.head[0], r.head[1], b.headR, -0.06 + pose.headTilt, {
      skin: PAL.fishmanTeal, belly: TONE.sharkBelly, open: mode === 'windup',
    }),
  })
}

/** A slab of shoulder with a fin ridge — the bruiser's whole silhouette. */
export function shoulderPlate(
  ctx: CanvasRenderingContext2D,
  sh: Pt,
  dz: number,
  ramp: Cel,
  rim: number,
): void {
  const p = blob([
    [sh[0] + dz * 2.4, sh[1] - 4.2],
    [sh[0] + dz * 8.6, sh[1] - 2.4],
    [sh[0] + dz * 8.2, sh[1] + 3.2],
    [sh[0] + dz * 2.6, sh[1] + 2.6],
  ] as Pt[], 0.7)
  paint(ctx, p, ramp, { shadow: 0.4, radius: 4, pivot: sh, rim, line: 0.5, occlusion: 0.2 })
  ctx.save()
  ctx.strokeStyle = ramp.line
  ctx.lineWidth = 0.5
  ctx.stroke(curve([
    [sh[0] + dz * 3.6, sh[1] - 3], [sh[0] + dz * 7, sh[1] - 1.4], [sh[0] + dz * 7.4, sh[1] + 2],
  ] as Pt[]))
  ctx.restore()
}

/** Fishman bruiser — all shoulders, and a bite you can read from the back row. */
function drawBruiser(s: Surface, t: number, mode: Mode = 'walk'): void {
  const ctx = s.ctx
  const cx = s.w * 0.5
  const gy = s.h - 1
  const b: Build = {
    hip: 11.6, thigh: 5.6, shin: 6, torso: 9.4, upper: 6.2, fore: 5.8,
    headR: 3.3, hipW: 4, shW: 7.2, legR: 2.5, armR: 2.2, z: 1.5,
  }
  const look: Look = {
    cloth: TONE.sharkGrey, legs: mix(TONE.sharkGrey, PAL.ink, 0.3), skin: TONE.sharkGrey,
    boot: mix(TONE.sharkGrey, PAL.ink, 0.5), sleeve: 0, bulk: 1.18,
  }
  let pose = poseFor(mode, t, 0.8)
  pose = { ...pose, lean: pose.lean + 0.16 }
  if (mode === 'windup') {
    pose = P({ hip: 1.4, lean: -0.2, legN: [0.5, -0.5], legF: [-0.5, 0.6], armN: [-2.4, 1.5], armF: [-0.8, 1.2], footN: 0.2, footF: -0.2 })
  } else if (mode === 'attack') {
    pose = P({ hip: -0.6, lean: 0.42, legN: [0.8, -0.3], legF: [-0.7, 0.5], armN: [1.5, 0.05], armF: [0.3, 0.9], footN: 0.4, footF: -0.4 })
  }
  const rig = solveRig(cx, gy, b, pose)

  drawFigure(ctx, rig, b, look, pose, {
    back: (c, r) => {
      paint(c, blob([
        [r.sh[0] - 2, r.sh[1] + 1],
        [r.sh[0] - 8, r.sh[1] - 7],
        [r.sh[0] - 4, r.hip[1] - 2],
      ] as Pt[], 0.5), C(mix(TONE.sharkGrey, PAL.night, 0.4)), {
        shadow: 0.46, radius: 5, pivot: [r.sh[0] - 4, r.sh[1] - 3], rim: 0.3, line: 0.45,
      })
    },
    overTorso: (c, r) => {
      inside(c, torsoPath(r, b, look.bulk), (cc) => {
        cc.fillStyle = mix(TONE.sharkBelly, TONE.sharkGrey, 0.5)
        cc.fill(blob([
          [r.sh[0] + 2.4, r.sh[1] + 2.6], [r.sh[0] + 6.4, r.sh[1] + 3.4], [r.hip[0] + 4.6, r.hip[1] + 1.6],
          [r.hip[0] + 1.6, r.hip[1] + 1.6],
        ] as Pt[], 0.75))
        // Pectoral line: one stroke, and the slab of chest reads as muscle.
        cc.strokeStyle = C(TONE.sharkGrey).line
        cc.lineWidth = 0.5
        cc.stroke(curve([[r.sh[0] - 3, r.sh[1] + 3.4], [r.sh[0] + 2, r.sh[1] + 4.6], [r.sh[0] + 6, r.sh[1] + 3.2]] as Pt[]))
      })
      // Far shoulder plate; the near one is drawn over the arm, in `front`.
      shoulderPlate(c, r.sh, -1, far(TONE.sharkGrey), 0.2)
    },
    front: (c, r) => {
      shoulderPlate(c, r.sh, 1, C(TONE.sharkGrey), 0.7)
      if (mode === 'attack') {
        c.save()
        c.globalAlpha = 0.7
        c.fillStyle = mix(PAL.foam, PAL.seaLight, 0.4)
        c.fill(crescentPath(r.sh[0] + 4, r.sh[1] + 2, 13, 3, -0.9, 0.7))
        c.restore()
      }
    },
    head: (c, r) => fishHead(c, r.head[0], r.head[1], b.headR, -0.02 + pose.headTilt, {
      skin: TONE.sharkGrey, belly: TONE.sharkBelly, shark: true,
    }),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Desert agents
// ─────────────────────────────────────────────────────────────────────────────

/** Hooded agent with a scarf and a hook — the shape says assassin, not soldier. */
function drawAgent(s: Surface, t: number, mode: Mode = 'walk'): void {
  const ctx = s.ctx
  const cx = s.w * 0.5
  const gy = s.h - 1
  const b: Build = { ...MARINE_BUILD, hip: 14.4, thigh: 7.4, shin: 7, torso: 8.8, headR: 3.4, shW: 3.7, hipW: 2.8, armR: 1.15 }
  const look: Look = {
    cloth: TONE.desertCloth, legs: mix(TONE.desertCloth, PAL.ink, 0.3), skin: PAL.skinDeep,
    boot: mix(PAL.dirtDeep, PAL.ink, 0.25), sleeve: 1, glove: mix(PAL.dirtDeep, PAL.ink, 0.1), bulk: 0.96,
  }
  let pose = poseFor(mode, t, 1.05)
  if (mode === 'windup') pose = P({ hip: 1.2, lean: -0.24, legN: [0.5, -0.5], legF: [-0.5, 0.6], armN: [-2.5, 0.9], armF: [-0.4, 0.8], footN: 0.2, footF: -0.2, drag: -2 })
  else if (mode === 'attack') pose = P({ hip: -0.4, lean: 0.4, legN: [0.85, -0.25], legF: [-0.7, 0.45], armN: [1.45, 0.1], armF: [0.4, 0.8], footN: 0.4, footF: -0.4, drag: 3 })
  const rig = solveRig(cx, gy, b, pose)
  const d = pose.drag
  const sway = Math.sin(t * Math.PI * 2)

  drawFigure(ctx, rig, b, look, pose, {
    back: (c, r) => {
      // Scarf: two tails, lagging and offset, never a symmetric pair.
      for (const [len, w, ph] of [[9, 1.5, 0], [6.5, 1.1, 1.2]] as Array<[number, number, number]>) {
        paint(c, curveRibbon(
          [r.sh[0] - 1, r.sh[1] - 0.4],
          [r.sh[0] - 4 - d * 0.6, r.sh[1] - 2 + Math.sin(sway + ph) * 1.6],
          [r.sh[0] - len - d, r.sh[1] + 1 + Math.sin(sway * 1.3 + ph) * 2.4],
          w,
        ), C(TONE.desertScarf), {
          shadow: 0.44, radius: 2, pivot: r.sh, rim: 0.4, line: 0.42,
        })
      }
      // Cloak.
      paint(c, blob([
        [r.sh[0] - 3.6, r.sh[1] - 1.4],
        [r.sh[0] + 2.6, r.sh[1] - 1],
        [r.hip[0] + 2.4, r.hip[1] + 5],
        [r.hip[0] - 2 - d, r.hip[1] + 7.6],
        [r.hip[0] - 5.4 - d * 1.5, r.hip[1] + 2],
      ] as Pt[], 0.7), C(mix(TONE.desertCloth, PAL.night, 0.28)), {
        shadow: 0.44, radius: 5, pivot: [r.hip[0], r.hip[1] + 2], rim: 0.45, line: 0.5, occlusion: 0.24,
      })
    },
    front: (c, r) => {
      // The hook, replacing the near hand.
      const a = Math.atan2(r.handN[1] - r.elbowN[1], r.handN[0] - r.elbowN[0])
      c.save()
      c.translate(r.handN[0], r.handN[1])
      c.rotate(a)
      paint(c, crescentPath(2.6, 0, 3.4, 1.1, -2.5, 1.2), C(TONE.steel), {
        shadow: 0.32, radius: 3, pivot: [2, 0], rim: 0.5, line: 0.45,
      })
      glint(c, 3.4, -2.2, 1.1, 0.34, 0.5, PAL.white, 0.6)
      c.restore()
    },
    head: (c, r) => {
      const hx = r.head[0]
      const hy = r.head[1]
      const rr = b.headR
      paint(c, headPath(hx, hy, rr, 0.95), C(PAL.skinDeep, 0.3), {
        shadow: FACE_SHADOW, radius: rr * 1.3, pivot: [hx, hy], rim: 0.4, line: 0.45,
      })
      eyes3q(c, hx, hy + rr * 0.06, rr, { angry: true, color: PAL.gold })
      // Hood: covers the skull and the far side of the face, leaving eyes lit.
      paint(c, blob([
        [hx - rr * 1.25, hy + rr * 0.5],
        [hx - rr * 1.15, hy - rr * 0.9],
        [hx - rr * 0.1, hy - rr * 1.5],
        [hx + rr * 1.05, hy - rr * 0.7],
        [hx + rr * 0.75, hy - rr * 0.2],
        [hx - rr * 0.2, hy - rr * 0.34],
        [hx - rr * 0.5, hy + rr * 0.8],
      ] as Pt[], 0.8), C(TONE.desertCloth), {
        shadow: 0.42, radius: rr * 1.2, pivot: [hx, hy - rr * 0.4], rim: 0.5, line: 0.48,
      })
      // Scarf over the mouth.
      paint(c, blob([
        [hx - rr * 0.9, hy + rr * 0.34],
        [hx + rr * 0.95, hy + rr * 0.42],
        [hx + rr * 0.6, hy + rr * 1.1],
        [hx - rr * 0.7, hy + rr * 1.0],
      ] as Pt[], 0.7), C(TONE.desertScarf), {
        shadow: 0.42, radius: rr * 0.7, pivot: [hx, hy + rr * 0.6], rim: 0.4, line: 0.44,
      })
    },
  })
}

/** A ribbon through three points — scarves, sashes, tongues of flame. */
export function curveRibbon(a: Pt, b: Pt, c: Pt, w: number): Path2D {
  const up = curve([a, b, c] as Pt[])
  const p = new Path2D()
  p.addPath(up)
  const back = curve([[c[0], c[1] + w * 0.4], [b[0], b[1] + w], [a[0], a[1] + w * 1.2]] as Pt[])
  p.addPath(back)
  p.closePath()
  return p
}

/** Armoured scarab — low, horned, and not for stomping. */
function drawScarab(s: Surface, t: number, mode: Mode = 'walk'): void {
  const ctx = s.ctx
  const cx = s.w * 0.5
  const gy = s.h - 1
  const speed = mode === 'run' ? 2 : 1
  const bob = Math.sin(t * Math.PI * 2 * speed) * 0.5
  const cy = gy - 5.6 + bob
  contactShadow(ctx, cx, gy - 0.2, 8, 1.4, 0.32)

  // Six legs, three phases apart, all visibly doing work.
  for (let i = 0; i < 3; i++) {
    for (const side of [-1, 1] as const) {
      const ph = Math.sin(t * Math.PI * 2 * speed + i * 2.1 + (side < 0 ? 1 : 0))
      const ax = cx - 4.5 + i * 4.4 + side * 0.6
      const knee: Pt = [ax + 2 + ph * 1.4, cy + 2.4]
      const tip: Pt = [ax + 3.4 + ph * 2.6, gy - 0.4 - Math.max(0, ph) * 1.2]
      limb2(ctx, [ax, cy + 1], knee, tip, 1.05, 0.8, 0.4,
        side < 0 ? far(TONE.chitin) : C(TONE.chitin), side < 0 ? 0.2 : 0.4)
    }
  }
  // Shell.
  const shell = blob([
    [cx - 8, cy + 1.6],
    [cx - 7, cy - 3.4],
    [cx - 1, cy - 5.8],
    [cx + 6.4, cy - 4],
    [cx + 8.6, cy + 0.6],
    [cx + 4, cy + 3.4],
    [cx - 4, cy + 3.2],
  ] as Pt[], 0.85)
  paint(ctx, shell, C(TONE.chitin), {
    shadow: 0.4, radius: 8, pivot: [cx, cy - 1], rim: 0.8, line: 0.6, occlusion: 0.25,
  })
  inside(ctx, shell, (c) => {
    // Iridescent band: gold catches along the carapace ridge, not everywhere.
    c.fillStyle = C(TONE.chitinLit).core
    c.fill(blob([
      [cx - 6.4, cy - 3], [cx - 0.6, cy - 5.2], [cx + 6, cy - 3.4], [cx + 2, cy - 1.6], [cx - 3.6, cy - 1.2],
    ] as Pt[], 0.8))
    c.strokeStyle = C(TONE.chitin).line
    c.lineWidth = 0.55
    c.stroke(curve([[cx - 6.5, cy - 2.2], [cx + 1, cy - 0.6], [cx + 8, cy + 0.4]] as Pt[]))
    // Elytra seam, running the length of the back.
    c.lineWidth = 0.45
    c.stroke(curve([[cx - 7, cy - 3], [cx - 1, cy - 5.2], [cx + 5.6, cy - 3.6]] as Pt[]))
  })
  // Head and horn.
  const hx = cx + 7.2
  const hy = cy - 0.6
  paint(ctx, ellipsePath(hx, hy, 3, 2.6, -0.2), C(mix(TONE.chitin, PAL.ink, 0.25)), {
    shadow: 0.4, radius: 3, pivot: [hx, hy], rim: 0.5, line: 0.5,
  })
  paint(ctx, blob([
    [hx - 0.6, hy - 1.4], [hx + 2.6, hy - 5.2], [hx + 4.6, hy - 2.6], [hx + 2.2, hy - 0.4],
  ] as Pt[], 0.5), C(mix(TONE.horn, PAL.dirtDeep, 0.42)), {
    shadow: 0.38, radius: 3, pivot: [hx + 1.6, hy - 2.6], rim: 0.6, line: 0.5,
  })
  // A second, shorter horn under the first: one horn alone reads as a beak.
  paint(ctx, blob([
    [hx - 1.4, hy + 0.6], [hx + 2.6, hy - 1], [hx + 1.2, hy + 1.8],
  ] as Pt[], 0.5), C(mix(TONE.horn, PAL.dirtDeep, 0.55)), {
    shadow: 0.4, radius: 2, pivot: [hx, hy + 0.4], line: 0.45,
  })
  eyes3q(ctx, hx - 0.6, hy - 0.2, 2.4, { color: PAL.danger, glow: mode === 'run' ? PAL.danger : undefined })
}

/** Sand crab — flat, quick, and half the colour of the dune it hides in. */
function drawSandCrab(s: Surface, t: number, mode: Mode = 'walk'): void {
  const ctx = s.ctx
  const cx = s.w * 0.5
  const gy = s.h - 1
  const speed = mode === 'run' ? 2.2 : mode === 'idle' ? 0.5 : 1
  const ph = t * Math.PI * 2 * speed
  const bob = Math.sin(ph) * 0.55
  const cy = gy - 5 + bob
  contactShadow(ctx, cx, gy - 0.2, 9, 1.6, 0.3)

  for (let i = 0; i < 3; i++) {
    for (const side of [-1, 1] as const) {
      const w = Math.sin(ph + i * 1.9 + (side < 0 ? 1.4 : 0))
      const ax = cx - 4 + i * 4
      const tip: Pt = [ax + side * (4 + w * 2.4), gy - 0.3 - Math.max(0, w) * 1.6]
      limb2(ctx, [ax, cy + 1], [ax + side * 2.6, cy - 1 + w], tip, 0.8, 0.6, 0.3,
        side < 0 ? far(TONE.sandShell) : C(TONE.sandShell), side < 0 ? 0.2 : 0.4)
    }
  }
  const shell = blob([
    [cx - 9, cy + 0.4],
    [cx - 6.6, cy - 3.6],
    [cx + 1, cy - 5],
    [cx + 8, cy - 3],
    [cx + 9.4, cy + 0.8],
    [cx, cy + 3],
  ] as Pt[], 0.9)
  paint(ctx, shell, C(TONE.sandShell), {
    shadow: 0.38, radius: 9, pivot: [cx, cy - 1], rim: 0.75, line: 0.6, occlusion: 0.2,
  })
  inside(ctx, shell, (c) => {
    c.strokeStyle = C(TONE.sandShell).line
    c.lineWidth = 0.45
    c.stroke(curve([[cx - 6, cy - 1.6], [cx, cy - 0.6], [cx + 7, cy - 1.4]] as Pt[]))
    c.fillStyle = C(PAL.sand).core
    c.fill(blob([[cx - 3.4, cy - 3.6], [cx + 1, cy - 4.2], [cx + 3, cy - 3], [cx - 1.6, cy - 2.6]] as Pt[], 0.8))
    c.fillStyle = C(TONE.sandShell).shade
    c.fill(ellipsePath(cx + 3.4, cy + 0.6, 3, 1.1, 0.2))
  })
  // One oversized claw held high: asymmetry is the whole design.
  const claw = mode === 'idle' ? 0.2 : Math.sin(ph) * 0.35
  ctx.save()
  ctx.translate(cx + 7.5, cy - 4)
  ctx.rotate(-0.5 + claw)
  const clawC = C(mix(TONE.sandShell, PAL.bloodOrange, 0.4))
  // Lower jaw of the pincer.
  paint(ctx, blob([[-1.6, 1.4], [2.2, 0.4], [5.4, 1.6], [2.6, 3.2], [-0.6, 3]] as Pt[], 0.8), clawC, {
    shadow: 0.4, radius: 3, pivot: [1.6, 1.6], rim: 0.6, line: 0.5,
  })
  // Upper jaw, opening away from it — the notch between them is the read.
  paint(ctx, blob([[-1.2, 0.4], [1.4, -2.6], [5.6, -2.4], [3.4, -0.2], [0.6, 0.8]] as Pt[], 0.75), clawC, {
    shadow: 0.36, radius: 3, pivot: [1.6, -1], rim: 0.55, line: 0.48,
  })
  ctx.restore()
  // Small claw, low.
  paint(ctx, blob([[cx - 9.4, cy - 1], [cx - 11.6, cy - 2.6], [cx - 12, cy + 0.4], [cx - 9.6, cy + 1]] as Pt[], 0.7),
    C(TONE.sandShell), { shadow: 0.42, radius: 2, pivot: [cx - 10.6, cy], line: 0.45 })
  // Eyestalks.
  for (const [ex, h] of [[cx + 2.4, 4.6], [cx + 4.6, 4]] as Array<[number, number]>) {
    paint(ctx, limbPath(ex, cy - 3.6, ex + 0.4, cy - 3.6 - h, 0.42, 0.42), C(TONE.sandShell), {
      shadow: 0.4, radius: 1, pivot: [ex, cy - 4], line: 0.36,
    })
    paint(ctx, ellipsePath(ex + 0.4, cy - 3.8 - h, 0.95, 1), C(PAL.cream), {
      shadow: 0.3, radius: 1, pivot: [ex, cy - 4 - h], line: 0.36,
    })
    ctx.fillStyle = EYE_INK
    ctx.fill(ellipsePath(ex + 0.65, cy - 3.9 - h, 0.4, 0.5))
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sky island
// ─────────────────────────────────────────────────────────────────────────────

/** A puff of cloud — skates, exhaust, the ground under a priest's feet. */
export function cloudPuff(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  seed = 0,
): void {
  const lobes: Pt[] = []
  const n = 7
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const rr = 1 + Math.sin(i * 2.7 + seed) * 0.18
    lobes.push([cx + Math.cos(a) * w * rr, cy + Math.sin(a) * h * rr])
  }
  paint(ctx, blob(lobes, 1.05), C(TONE.cloudRobe), {
    shadow: 0.34, radius: h * 1.4, pivot: [cx, cy], rim: 0.7, line: 0.45,
  })
}

export /** One feather: a leaf with a quill down the middle and a split at the tip. */
function feather(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  len: number,
  w: number,
  ramp: Cel,
  rim: number,
): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  const leaf = blob([
    [0, 0],
    [w * 0.9, -len * 0.3],
    [w * 0.55, -len * 0.78],
    [0, -len],
    [-w * 0.6, -len * 0.72],
    [-w * 0.95, -len * 0.28],
  ] as Pt[], 0.9)
  paint(ctx, leaf, ramp, {
    shadow: 0.4, radius: len * 0.5, pivot: [0, -len * 0.45], rim, line: 0.55,
  })
  inside(ctx, leaf, (c) => {
    c.strokeStyle = ramp.line
    c.lineWidth = 0.7
    c.stroke(curve([[0, -len * 0.05], [w * 0.1, -len * 0.5], [0, -len * 0.95]] as Pt[]))
    // A couple of splits, so the vane looks like barbs and not like plastic.
    c.lineWidth = 0.5
    c.stroke(curve([[0, -len * 0.55], [-w * 0.7, -len * 0.34]] as Pt[]))
    c.stroke(curve([[0, -len * 0.75], [w * 0.6, -len * 0.5]] as Pt[]))
  })
  ctx.restore()
}

/** Sky priest — robes, cloud skates, and a staff that sparks before it fires. */
function drawPriest(s: Surface, t: number, mode: Mode = 'walk'): void {
  const ctx = s.ctx
  const cx = s.w * 0.5
  const gy = s.h - 1
  const hover = Math.sin(t * Math.PI * 2) * 0.9
  const b: Build = { ...MARINE_BUILD, hip: 15 + hover, thigh: 7, shin: 6.6, torso: 9, headR: 3.5, shW: 4, hipW: 3 }
  const look: Look = {
    cloth: TONE.cloudRobe, legs: TONE.cloudRobe, skin: TONE.skySkin,
    boot: TONE.cloudTrim, sleeve: 1, bulk: 1.04,
  }
  let pose = P({ hip: 0, lean: -0.06, legN: [0.16, -0.1], legF: [-0.2, 0.2], armN: [-0.4, 0.5], armF: [0.3, 0.6], footN: 0.3, footF: 0.2, drag: 1 + hover })
  if (mode === 'run') pose = { ...pose, lean: 0.22, legN: [0.5, -0.3], legF: [-0.4, 0.4], drag: 2.6 }
  if (mode === 'windup') pose = { ...pose, armN: [-2.4, 0.4], lean: -0.18 }
  if (mode === 'attack') pose = { ...pose, armN: [0.9, 0.2], lean: 0.24 }
  const rig = solveRig(cx, gy, b, pose)

  // The skate: a lens of cloud under the feet, which is why he never walks.
  cloudPuff(ctx, cx + 1.5, gy - 2.2, 9, 2.9, t * 3)
  cloudPuff(ctx, cx - 5.5, gy - 1.4, 4.6, 1.9, t * 3 + 2)
  cloudPuff(ctx, cx + 8, gy - 1.2, 3.4, 1.5, t * 3 + 4)

  drawFigure(ctx, rig, b, look, pose, {
    back: (c, r) => {
      paint(c, blob([
        [r.sh[0] - 3.6, r.sh[1] - 1],
        [r.sh[0] + 3, r.sh[1] - 0.6],
        [r.hip[0] + 4, r.hip[1] + 7],
        [r.hip[0] - 1 - pose.drag, r.hip[1] + 9],
        [r.hip[0] - 5.4 - pose.drag, r.hip[1] + 3],
      ] as Pt[], 0.75), C(mix(TONE.cloudRobe, PAL.skyMid, 0.25)), {
        shadow: 0.4, radius: 5.5, pivot: [r.hip[0], r.hip[1] + 3], rim: 0.55, line: 0.5, occlusion: 0.2,
      })
    },
    overTorso: (c, r) => {
      paint(c, limbPath(r.sh[0] - 3, r.sh[1] + 2.6, r.hip[0] + 3, r.hip[1] - 0.4, 1.3, 1), C(PAL.gold), {
        shadow: 0.4, radius: 1.4, pivot: r.sh, rim: 0.4, line: 0.4,
      })
    },
    front: (c, r) => {
      // Staff with a ring of cloud at the head.
      const a = mode === 'windup' ? -2.3 : mode === 'attack' ? 0.85 : 0.26
      c.save()
      c.translate(r.handN[0], r.handN[1])
      c.rotate(a)
      paint(c, limbPath(0, 7, 0, -16, 0.55, 0.5), C(PAL.wood), {
        shadow: 0.42, radius: 1, pivot: [0, 0], line: 0.38,
      })
      paint(c, crescentPath(0, -17.6, 2.2, 0.9, 0.6, Math.PI * 2 - 0.6), C(TONE.cloudTrim), {
        shadow: 0.34, radius: 2.2, pivot: [0, -17.6], rim: 0.5, line: 0.42,
      })
      c.fillStyle = C(TONE.cloudTrim).core
      c.fill(roundRectPath(-0.8, -16, 1.6, 1.5, 0.5))
      if (mode === 'windup' || mode === 'attack') {
        c.save()
        c.globalCompositeOperation = 'lighter'
        c.fillStyle = PAL.magic
        c.globalAlpha = 0.85
        c.fill(blob([[-1.5, -17.5], [0.4, -21.5], [0.7, -18], [2.4, -18.8], [0.2, -14] , [0, -17]] as Pt[], 0.3))
        c.restore()
      }
      c.restore()
    },
    head: (c, r) => {
      const hx = r.head[0]
      const hy = r.head[1]
      const rr = b.headR
      paint(c, headPath(hx, hy, rr), C(TONE.skySkin, 0.32), {
        shadow: FACE_SHADOW, radius: rr * 1.3, pivot: [hx, hy], rim: 0.5, line: 0.45,
      })
      nose(c, hx, hy + rr * 0.08, rr, C(TONE.skySkin, 0.32))
      eyes3q(c, hx, hy + rr * 0.08, rr, { angry: true, color: PAL.sea })
      mouth(c, hx, hy + rr * 0.6, rr, 'grim')
      // Winged headdress: two feathers back from the temples.
      for (const [dx, dy, ln] of [[-0.2, -0.9, 5], [-0.9, -0.4, 3.6]] as Array<[number, number, number]>) {
        paint(c, blob([
          [hx + dx * rr, hy + dy * rr],
          [hx + dx * rr - ln, hy + dy * rr - ln * 0.5],
          [hx + dx * rr - ln * 0.7, hy + dy * rr + 1.2],
        ] as Pt[], 0.5), C(TONE.featherWing), {
          shadow: 0.38, radius: 2.4, pivot: [hx, hy], rim: 0.5, line: 0.42,
        })
      }
      ctx.fillStyle = PAL.gold
      ctx.fill(roundRectPath(hx - rr * 0.9, hy - rr * 1.18, rr * 1.9, rr * 0.3, rr * 0.15))
    },
  })
}

/** Winged scout — a small figure that is mostly wing. */
function drawScout(s: Surface, t: number, _mode: Mode = 'walk'): void {
  const ctx = s.ctx
  const cx = s.w * 0.5
  const cy = s.h * 0.5
  const flap = Math.sin(t * Math.PI * 2)
  const b: Build = { hip: 0, thigh: 4.6, shin: 4.4, torso: 6.4, upper: 4, fore: 3.6, headR: 2.9, hipW: 2.2, shW: 3, legR: 1.1, armR: 0.95, z: 0.9 }
  const pose = P({ hip: 0, lean: 0.2, legN: [0.55, -0.5], legF: [0.2, -0.9], armN: [-0.5, 0.7], armF: [-0.2, 0.9], footN: 0.8, footF: 0.6 })
  const rig = solveRig(cx, cy + 6 - flap * 1.2, b, pose)
  const look: Look = {
    cloth: TONE.cloudRobe, legs: mix(TONE.cloudRobe, PAL.skyMid, 0.3),
    skin: TONE.skySkin, boot: TONE.cloudTrim, sleeve: 0.5, bulk: 0.95,
  }

  // Wings, behind: one long sweep of primaries, not a comb of identical feathers.
  // Wings as separate quills, not one membrane: at 30 units across, a single
  // slab of white reads as a folded paper fan.
  const wingRoot: Pt = [rig.sh[0] - 2, rig.sh[1] + 1]
  const plan: Array<[number, number, number]> = [[-1.45, 11, 2.6], [-1.1, 14, 3], [-0.78, 15, 3], [-0.45, 12.5, 2.6]]
  for (const [a, len, w] of plan) {
    feather(ctx, wingRoot[0] - 1.6, wingRoot[1] - 0.6, a - 0.3 - flap * 0.12, len * 0.82, w * 0.9,
      far(TONE.featherWing), 0.2)
  }
  for (const [a, len, w] of plan) {
    feather(ctx, wingRoot[0], wingRoot[1], a + flap * 0.22, len, w, C(TONE.featherWing), 0.6)
  }
  for (let i = 0; i < 3; i++) {
    feather(ctx, wingRoot[0] + 0.4, wingRoot[1] + 1, -1.3 + i * 0.36, 5 + i * 0.8, 2,
      C(TONE.cloudTrim), 0.5)
  }

  drawFigure(ctx, rig, b, look, pose, {
    head: (c, r) => {
      const rr = b.headR
      paint(c, headPath(r.head[0], r.head[1], rr, 0.95), C(TONE.skySkin, 0.32), {
        shadow: FACE_SHADOW, radius: rr * 1.3, pivot: r.head, rim: 0.5, line: 0.45,
      })
      eyes3q(c, r.head[0], r.head[1] + rr * 0.06, rr, { angry: true, color: PAL.sea })
      mouth(c, r.head[0], r.head[1] + rr * 0.6, rr, 'grin')
      // Goggle strap and a little helm.
      paint(c, blob([
        [r.head[0] - rr * 1.1, r.head[1] - rr * 0.4],
        [r.head[0] - rr * 0.2, r.head[1] - rr * 1.4],
        [r.head[0] + rr * 1.0, r.head[1] - rr * 0.5],
      ] as Pt[], 0.7), C(mix(PAL.gold, PAL.dirt, 0.3)), {
        shadow: 0.4, radius: rr, pivot: r.head, rim: 0.5, line: 0.45,
      })
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Thriller Bark
// ─────────────────────────────────────────────────────────────────────────────

/** An uneven gait: one stiff leg, one dragging. Undead never walk in time. */
const SHAMBLE: Pose[] = [
  P({ hip: 0.4, lean: 0.16, legN: [0.42, -0.06], legF: [-0.3, 0.2], armN: [0.5, 1.1], armF: [0.2, 1.3], footN: 0.1, footF: -0.2, headTilt: 0.16, drag: 0.6 }),
  P({ hip: 1.4, lean: 0.24, legN: [0.1, -0.2], legF: [-0.02, 0.16], armN: [0.42, 1.15], armF: [0.16, 1.35], footN: 0, footF: 0, headTilt: 0.2, drag: 0.2 }),
  P({ hip: 0.2, lean: 0.12, legN: [-0.06, -0.02], legF: [0.24, 0.34], armN: [0.55, 1.05], armF: [0.24, 1.25], footN: -0.1, footF: 0.2, headTilt: 0.12, drag: 1 }),
]

/** Zombie — stitched, lopsided, and slow enough to read as a moving platform. */
function drawZombie(s: Surface, t: number, mode: Mode = 'walk'): void {
  const ctx = s.ctx
  const cx = s.w * 0.5
  const gy = s.h - 1
  const b: Build = { ...MARINE_BUILD, hip: 13.6, thigh: 6.8, shin: 6.8, torso: 8.6, headR: 3.6, shW: 4.2 }
  const look: Look = {
    cloth: TONE.rotCloth, legs: mix(TONE.rotCloth, PAL.ink, 0.3), skin: TONE.rot,
    boot: mix(PAL.dirtDeep, PAL.ink, 0.4), sleeve: 0.5, bulk: 1.02,
  }
  const pose = mode === 'idle' ? { ...SHAMBLE[1], hip: 0.6 + Math.sin(t * Math.PI * 2) * 0.4 }
    : gait(SHAMBLE, t, mode === 'run' ? 1.35 : 1)
  const rig = solveRig(cx, gy, b, pose)

  drawFigure(ctx, rig, b, look, pose, {
    back: (c, r) => {
      // Torn coat tails, ragged at the hem.
      const hem: Pt[] = []
      for (let i = 0; i <= 6; i++) {
        hem.push([r.hip[0] - 4.6 + i * 1.6, r.hip[1] + 5 + (i % 2 === 0 ? 2.4 : 0.6)])
      }
      paint(c, blob([
        [r.sh[0] - 3.8, r.sh[1] - 0.6],
        [r.sh[0] + 3, r.sh[1] - 0.2],
        [r.hip[0] + 3.4, r.hip[1] + 4.6],
        ...hem.reverse(),
        [r.hip[0] - 4.8, r.hip[1] + 1],
      ] as Pt[], 0.62), C(mix(TONE.rotCloth, PAL.night, 0.3)), {
        shadow: 0.44, radius: 5, pivot: [r.hip[0], r.hip[1] + 2], rim: 0.4, line: 0.5, occlusion: 0.24,
      })
    },
    overTorso: (c, r) => {
      // Stitches across the chest — the one detail the eye needs.
      c.save()
      c.strokeStyle = INK
      c.lineWidth = 0.45
      const seam = curve([[r.sh[0] - 2.4, r.sh[1] + 2], [r.sh[0] + 1.4, r.sh[1] + 4.4], [r.hip[0] + 2.6, r.hip[1] - 1.4]] as Pt[])
      c.stroke(seam)
      for (let i = 0; i < 5; i++) {
        const u = 0.15 + i * 0.18
        const px = r.sh[0] - 2.4 + u * 6
        const py = r.sh[1] + 2 + u * 7
        c.beginPath()
        c.moveTo(px - 0.9, py - 0.5)
        c.lineTo(px + 0.9, py + 0.5)
        c.stroke()
      }
      c.restore()
    },
    head: (c, r) => {
      const rr = b.headR
      const hx = r.head[0]
      const hy = r.head[1]
      paint(c, headPath(hx, hy, rr, 1.05), C(TONE.rot, 0.28), {
        shadow: 0.34, radius: rr * 1.25, pivot: [hx, hy], rim: 0.45, line: 0.45, occlusion: 0.2,
      })
      eyes3q(c, hx, hy + rr * 0.06, rr, { glow: PAL.heal })
      // Jaw hanging open, teeth showing.
      mouth(c, hx, hy + rr * 0.52, rr, 'fang')
      // A lank fringe, hanging past the brow on the near side only.
      paint(c, blob([
        [hx - rr * 1.05, hy - rr * 0.3],
        [hx - rr * 0.5, hy - rr * 1.2],
        [hx + rr * 0.9, hy - rr * 0.9],
        [hx + rr * 0.7, hy - rr * 0.1],
        [hx + rr * 0.2, hy - rr * 0.5],
        [hx - rr * 0.5, hy - rr * 0.2],
      ] as Pt[], 0.75), C(mix(PAL.dusk, PAL.ink, 0.3)), {
        shadow: 0.44, radius: rr, pivot: [hx, hy - rr * 0.6], rim: 0.4, line: 0.45,
      })
      c.strokeStyle = INK
      c.lineWidth = 0.42
      c.stroke(curve([[hx + rr * 0.2, hy - rr * 0.05], [hx + rr * 0.5, hy + rr * 0.5]] as Pt[]))
    },
  })
}

/** Ghost — a floating spectre with no feet at all. */
function drawGhost(s: Surface, t: number, mode: Mode = 'walk'): void {
  const ctx = s.ctx
  const cx = s.w * 0.5
  const cy = s.h * 0.45
  const w = Math.sin(t * Math.PI * 2)
  const w2 = Math.sin(t * Math.PI * 2 + 1.3)
  ctx.save()
  ctx.globalAlpha = 0.86

  // Body: a bell that frays into three tails, each on its own phase.
  const body = blob([
    [cx - 6.4, cy - 2 + w * 0.6],
    [cx - 3.4, cy - 8.4],
    [cx + 3.6, cy - 8.6],
    [cx + 6.6, cy - 1.4 - w * 0.6],
    [cx + 5.6, cy + 5 + w2],
    [cx + 2.6, cy + 2.6 + w * 1.4],
    [cx + 0.4, cy + 6.4 - w2],
    [cx - 2.6, cy + 2.8 - w * 1.2],
    [cx - 5.4, cy + 5.6 + w2 * 0.8],
  ] as Pt[], 0.95)
  paint(ctx, body, C(TONE.spectre), {
    shadow: 0.32, radius: 7, pivot: [cx, cy - 2], rim: 0.8, line: 0.5, occlusion: 0.15,
  })
  inside(ctx, body, (c) => {
    c.globalAlpha = 0.5
    c.fillStyle = C(PAL.magic).light
    c.fill(ellipsePath(cx - 2.4, cy - 5, 3, 2, -0.5))
  })
  // Hollow sockets and a wailing mouth.
  eyes3q(ctx, cx - 0.8, cy - 4.4, 3.6, { glow: mode === 'run' ? PAL.danger : PAL.magic, wide: true })
  paint(ctx, ellipsePath(cx + 0.4, cy - 1, 1.5, 2.2 + w * 0.5), C(mix(PAL.night, PAL.dusk, 0.3)), {
    shadow: 0.3, radius: 2, pivot: [cx, cy - 1], line: 0.42,
  })
  // Two stubby arms, drifting.
  for (const side of [-1, 1] as const) {
    const ax = cx + side * 5.6
    const ay = cy - 3 + (side < 0 ? w : w2) * 1.4
    paint(ctx, limbPath(ax - side * 1.6, ay, ax + side * 2.6, ay + 2.2, 1.4, 0.7),
      side < 0 ? far(TONE.spectre) : C(TONE.spectre), {
        shadow: 0.36, radius: 1.6, pivot: [ax, ay], rim: 0.4, line: 0.45,
      })
  }
  ctx.restore()
}

// ─────────────────────────────────────────────────────────────────────────────
// Wano
// ─────────────────────────────────────────────────────────────────────────────

/** Horned brute — a wall of shoulders with a club. */
function drawOni(s: Surface, t: number, mode: Mode = 'walk'): void {
  const ctx = s.ctx
  const cx = s.w * 0.5
  const gy = s.h - 1
  const b: Build = {
    hip: 15, thigh: 7.4, shin: 7.6, torso: 9.4, upper: 6.4, fore: 6,
    headR: 3.8, hipW: 4.2, shW: 6.8, legR: 2.3, armR: 2.2, z: 1.5,
  }
  const look: Look = {
    cloth: TONE.oniSkin, legs: TONE.oniCloth, skin: TONE.oniSkin,
    boot: mix(PAL.dirtDeep, PAL.ink, 0.3), sleeve: 0, bulk: 1.16,
  }
  let pose = poseFor(mode, t, 0.78)
  pose = { ...pose, lean: pose.lean + 0.1 }
  if (mode === 'windup') pose = P({ hip: 1.6, lean: -0.26, legN: [0.4, -0.4], legF: [-0.4, 0.5], armN: [-2.7, 0.5], armF: [-2.2, 0.7], footN: 0.2, footF: -0.2 })
  else if (mode === 'attack') pose = P({ hip: 1, lean: 0.5, legN: [0.7, -0.4], legF: [-0.6, 0.5], armN: [1.1, 0.15], armF: [0.7, 0.4], footN: 0.4, footF: -0.3 })
  const rig = solveRig(cx, gy, b, pose)

  drawFigure(ctx, rig, b, look, pose, {
    back: (c, r) => {
      // Shoulder cloth hanging off the far side, to break the slab of back.
      paint(c, blob([
        [r.sh[0] - 6, r.sh[1] - 2],
        [r.sh[0] - 1, r.sh[1] - 2.6],
        [r.sh[0] - 2.4, r.hip[1] + 1],
        [r.sh[0] - 7.4, r.hip[1] - 1],
      ] as Pt[], 0.7), C(mix(TONE.oniCloth, PAL.night, 0.2)), {
        shadow: 0.46, radius: 4, pivot: r.sh, rim: 0.3, line: 0.48,
      })
    },
    overTorso: (c, r) => {
      // Bare chest with a hard pectoral split and a rope belt.
      inside(c, torsoPath(r, b, look.bulk), (cc) => {
        cc.strokeStyle = C(TONE.oniSkin).line
        cc.lineWidth = 0.55
        cc.stroke(curve([[r.sh[0] - 3.4, r.sh[1] + 3.6], [r.sh[0] + 2, r.sh[1] + 5], [r.sh[0] + 6, r.sh[1] + 3.4]] as Pt[]))
        cc.stroke(curve([[r.sh[0] + 1.6, r.sh[1] + 5], [r.hip[0] + 1.8, r.hip[1] - 2]] as Pt[]))
      })
      paint(c, limbPath(r.hip[0] - 4.4, r.hip[1] - 1.6, r.hip[0] + 4.2, r.hip[1] - 0.4, 1.3, 1.3), C(PAL.strawGold), {
        shadow: 0.42, radius: 1.5, pivot: r.hip, rim: 0.4, line: 0.42,
      })
    },
    front: (c, r) => {
      // Kanabo: a tapered club, studded, held where it reads as a threat.
      const a = mode === 'windup' ? -2.7 : mode === 'attack' ? 1.15 : -0.45
      c.save()
      c.translate(r.handN[0], r.handN[1])
      c.rotate(a)
      const club = blob([
        [-1.1, 3.4], [1.1, 3.4], [3.2, -12.5], [0, -14.6], [-3.2, -12.5],
      ] as Pt[], 0.35)
      paint(c, club, C(PAL.wood), {
        shadow: 0.42, radius: 3, pivot: [0, -6], rim: 0.6, line: 0.55, occlusion: 0.2,
      })
      inside(c, club, (cc) => {
        cc.fillStyle = C(TONE.ironDark).core
        for (let i = 0; i < 5; i++) {
          const yy = -5 - i * 2.4
          cc.fill(ellipsePath(-1.6 + (i % 2) * 3.2, yy, 0.75, 0.75))
          cc.fillStyle = i % 2 ? C(TONE.ironDark).core : C(TONE.steel).core
        }
      })
      c.restore()
    },
    head: (c, r) => {
      const rr = b.headR
      const hx = r.head[0]
      const hy = r.head[1]
      paint(c, headPath(hx, hy, rr, 1.1), C(TONE.oniSkin, 0.3), {
        shadow: 0.32, radius: rr * 1.3, pivot: [hx, hy], rim: 0.5, line: 0.48,
      })
      eyes3q(c, hx, hy + rr * 0.06, rr, { angry: true, color: PAL.gold })
      mouth(c, hx, hy + rr * 0.56, rr, 'fang')
      // Two horns, different lengths — a matched pair looks like a hat.
      for (const [dx, ln, tilt] of [[0.55, 6.2, -0.72], [-0.6, 4.6, -1.15]] as Array<[number, number, number]>) {
        const bx = hx + dx * rr
        const by = hy - rr * 0.86
        paint(c, blob([
          [bx - 1.2, by + 0.5],
          [bx + Math.sin(tilt) * ln * 0.5 + 0.6, by - Math.cos(tilt) * ln * 0.55],
          [bx + Math.sin(tilt) * ln, by - Math.cos(tilt) * ln],
          [bx + 1.3, by + 0.3],
        ] as Pt[], 0.45), dx < 0 ? far(TONE.horn) : C(TONE.horn), {
          shadow: 0.36, radius: 2, pivot: [bx, by - ln * 0.4], rim: 0.5, line: 0.45,
        })
      }
      // Topknot.
      paint(c, blob([
        [hx - rr * 0.9, hy - rr * 0.55],
        [hx - rr * 1.7, hy - rr * 1.5],
        [hx - rr * 0.5, hy - rr * 1.15],
      ] as Pt[], 0.6), C(mix(PAL.ink, PAL.dusk, 0.25)), {
        shadow: 0.44, radius: rr, pivot: [hx - rr, hy - rr], line: 0.45,
      })
    },
  })
}

/** Masked samurai — everything about him is the moment before the draw. */
function drawSamurai(s: Surface, t: number, mode: Mode = 'walk'): void {
  const ctx = s.ctx
  const cx = s.w * 0.5
  const gy = s.h - 1
  const b: Build = { ...MARINE_BUILD, hip: 14.2, thigh: 7, shin: 6.8, torso: 8.8, headR: 3.5, shW: 4.6, hipW: 3.4 }
  const look: Look = {
    cloth: TONE.samuraiCloth, legs: TONE.samuraiCloth, skin: PAL.skin,
    boot: mix(PAL.cream, PAL.sandDeep, 0.35), sleeve: 1, bulk: 1.04,
  }
  let pose = poseFor(mode, t, 0.9)
  if (mode === 'windup') pose = P({ hip: 2.2, lean: 0.12, legN: [0.66, -0.9], legF: [-0.5, 0.9], armN: [-0.8, 1.5], armF: [-1.2, 1.4], footN: 0.2, footF: -0.2, drag: -1.4 })
  else if (mode === 'attack') pose = P({ hip: 0.4, lean: 0.36, legN: [0.9, -0.3], legF: [-0.8, 0.5], armN: [1.4, 0.1], armF: [0.6, 0.7], footN: 0.4, footF: -0.4, drag: 2.6 })
  const rig = solveRig(cx, gy, b, pose)
  const drawn = mode === 'attack'

  drawFigure(ctx, rig, b, look, pose, {
    back: (c, r) => {
      // Hakama: wide trousers read as one silhouette, not two legs.
      paint(c, blob([
        [r.hip[0] - 4.6, r.hip[1] - 1],
        [r.hip[0] + 4.4, r.hip[1] - 1],
        [r.hip[0] + 5.4, r.hip[1] + 7],
        [r.hip[0] + 1.6, r.hip[1] + 8],
        [r.hip[0] - 0.6, r.hip[1] + 5],
        [r.hip[0] - 3, r.hip[1] + 8.4],
        [r.hip[0] - 6, r.hip[1] + 7.4],
      ] as Pt[], 0.7), C(TONE.samuraiCloth), {
        shadow: 0.42, radius: 5, pivot: [r.hip[0], r.hip[1] + 3], rim: 0.5, line: 0.5, occlusion: 0.2,
      })
    },
    overTorso: (c, r) => {
      // Kimono lapels crossing right over left, and an obi.
      paint(c, blob([
        [r.sh[0] - 2.6, r.sh[1] + 0.2],
        [r.sh[0] + 2.6, r.sh[1] + 1.2],
        [r.hip[0] + 1.6, r.hip[1] - 1.4],
        [r.hip[0] + 0.2, r.hip[1] - 1.6],
        [r.sh[0] + 0.2, r.sh[1] + 3.4],
        [r.sh[0] - 3.2, r.sh[1] + 2.4],
      ] as Pt[], 0.55), C(mix(PAL.cream, PAL.mist, 0.3)), {
        shadow: 0.4, radius: 3, pivot: r.sh, rim: 0.5, line: 0.45,
      })
      paint(c, limbPath(r.hip[0] - 4, r.hip[1] - 1.8, r.hip[0] + 4, r.hip[1] - 0.8, 1.5, 1.5), C(PAL.luffyRedDeep), {
        shadow: 0.42, radius: 1.8, pivot: r.hip, rim: 0.4, line: 0.42,
      })
    },
    front: (c, r) => {
      const sx = r.hip[0] + 1
      const sy = r.hip[1] - 1.6
      if (!drawn) {
        // Sheathed: the scabbard's diagonal is the silhouette's best line.
        c.save()
        c.translate(sx, sy)
        c.rotate(mode === 'windup' ? -0.35 : -0.15)
        paint(c, limbPath(-9, 3.4, 6, -1.4, 0.95, 0.75), C(mix(PAL.ink, PAL.dusk, 0.3)), {
          shadow: 0.4, radius: 1.2, pivot: [0, 0], rim: 0.4, line: 0.45,
        })
        paint(c, roundRectPath(4.4, -2.4, 2.4, 2.4, 0.6), C(TONE.brass), {
          shadow: 0.38, radius: 1.4, pivot: [5, -1], rim: 0.4, line: 0.4,
        })
        c.restore()
      } else {
        // Drawn: blade forward, arc behind it.
        c.save()
        c.translate(r.handN[0], r.handN[1])
        c.rotate(0.5)
        paint(c, blob([[-0.6, 0], [0.7, -0.6], [1.4, -15], [-0.2, -16], [-0.7, -12]] as Pt[], 0.4), C(TONE.steel), {
          shadow: 0.28, radius: 1.6, pivot: [0, -8], rim: 0.55, line: 0.42,
        })
        glint(c, 0.5, -9, 0.24, 5, 0.03, PAL.white, 0.7)
        paint(c, roundRectPath(-0.9, 0, 1.8, 3.4, 0.6), C(mix(PAL.ink, PAL.dusk, 0.2)), {
          shadow: 0.4, radius: 1.2, pivot: [0, 1.6], line: 0.4,
        })
        c.restore()
        c.save()
        c.globalAlpha = 0.8
        c.fillStyle = mix(PAL.cream, PAL.chopperPink, 0.3)
        c.fill(crescentPath(r.sh[0] + 2, r.sh[1] + 2, 16, 2.6, -1.5, 0.5))
        c.restore()
      }
    },
    head: (c, r) => {
      const rr = b.headR
      const hx = r.head[0]
      const hy = r.head[1]
      // Oni mask: no skin at all, so the eyes have to carry the whole read.
      paint(c, headPath(hx, hy, rr, 1.02), C(TONE.samuraiMask, 0.3), {
        shadow: 0.34, radius: rr * 1.3, pivot: [hx, hy], rim: 0.55, line: 0.48,
      })
      c.save()
      c.strokeStyle = C(PAL.luffyRedDeep).core
      c.lineWidth = 0.7
      c.stroke(curve([[hx - rr * 0.6, hy - rr * 0.75], [hx + rr * 0.2, hy - rr * 0.45]] as Pt[]))
      c.stroke(curve([[hx + rr * 0.45, hy - rr * 0.85], [hx + rr * 0.95, hy - rr * 0.5]] as Pt[]))
      c.stroke(curve([[hx - rr * 0.2, hy + rr * 0.5], [hx + rr * 0.5, hy + rr * 0.62], [hx + rr * 0.95, hy + rr * 0.4]] as Pt[]))
      c.restore()
      eyes3q(c, hx, hy + rr * 0.04, rr, { glow: PAL.danger })
      // Straw hat brim, tipped forward.
      paint(c, blob([
        [hx - rr * 1.9, hy - rr * 0.72],
        [hx + rr * 0.2, hy - rr * 1.9],
        [hx + rr * 2.0, hy - rr * 0.5],
        [hx + rr * 0.2, hy - rr * 1.0],
      ] as Pt[], 0.7), C(PAL.strawGold), {
        shadow: 0.4, radius: rr * 1.6, pivot: [hx, hy - rr], rim: 0.6, line: 0.5,
      })
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Critters and traversal hazards
// ─────────────────────────────────────────────────────────────────────────────

/** Cannon crab — fast, low, and never leaves its ledge. */
function drawCrab(s: Surface, t: number, mode: Mode = 'walk'): void {
  const ctx = s.ctx
  const cx = s.w * 0.5
  const gy = s.h - 1
  const speed = mode === 'run' ? 2 : mode === 'idle' ? 0.5 : 1
  const ph = t * Math.PI * 2 * speed
  const bob = Math.sin(ph) * 0.8
  const cy = gy - 6.4 + bob
  const shell = C(PAL.bloodOrange)
  contactShadow(ctx, cx, gy - 0.2, 9, 1.5, 0.34)

  for (let i = 0; i < 3; i++) {
    for (const side of [-1, 1] as const) {
      const w = Math.sin(ph + i * 1.8 + (side < 0 ? 1.5 : 0))
      const ax = cx - 4.2 + i * 4.2
      const tip: Pt = [ax + side * (4.4 + w * 2.2), gy - 0.4 - Math.max(0, w) * 1.8]
      limb2(ctx, [ax, cy + 1.4], [ax + side * 3, cy - 0.6 + w * 0.8], tip, 1.15, 0.85, 0.4,
        side < 0 ? far(PAL.bloodOrange) : C(PAL.bloodOrange), side < 0 ? 0.2 : 0.45)
    }
  }
  const body = blob([
    [cx - 8.6, cy + 0.6],
    [cx - 6.4, cy - 4.2],
    [cx, cy - 6],
    [cx + 6.6, cy - 4],
    [cx + 8.8, cy + 0.8],
    [cx, cy + 3.4],
  ] as Pt[], 0.92)
  paint(ctx, body, shell, {
    shadow: 0.4, radius: 8.8, pivot: [cx, cy - 1], rim: 0.8, line: 0.6, occlusion: 0.24,
  })
  inside(ctx, body, (c) => {
    // Shell markings: two dents and a ridge, never a repeating pattern.
    c.strokeStyle = shell.line
    c.lineWidth = 0.5
    c.stroke(curve([[cx - 6.6, cy - 1.6], [cx, cy - 0.2], [cx + 7, cy - 1.4]] as Pt[]))
    c.fillStyle = shell.shade
    c.fill(ellipsePath(cx - 3.6, cy - 3, 1.6, 0.9, -0.4))
    c.fill(ellipsePath(cx + 4, cy - 2.6, 1.3, 0.8, 0.3))
  })
  // Claws: raised, open, and at different heights.
  for (const [side, lift, open] of [[-1, 0.4, 0.2], [1, 1, 0.55]] as Array<[number, number, number]>) {
    const clx = cx + side * 8.4
    const cly = cy - 3.4 - lift * 2 + Math.sin(ph + (side > 0 ? 0 : 1.6)) * 0.9
    const ramp = side < 0 ? far(PAL.bloodOrange) : shell
    // Lower jaw, then upper: the gap between them is what says "pincer".
    paint(ctx, blob([
      [clx - side * 2.6, cly + 1.4],
      [clx + side * 0.6, cly + 0.2],
      [clx + side * 4.2, cly + 1.4],
      [clx + side * 1.6, cly + 3.4],
      [clx - side * 1.6, cly + 3],
    ] as Pt[], 0.85), ramp, {
      shadow: 0.42, radius: 3, pivot: [clx, cly + 1.4], rim: side > 0 ? 0.6 : 0.25, line: 0.5,
    })
    paint(ctx, blob([
      [clx - side * 2, cly + 0.4],
      [clx + side * 0.4, cly - 2 - open * 1.4],
      [clx + side * 4, cly - 1.4 - open * 1.6],
      [clx + side * 2, cly - 0.2],
      [clx - side * 0.6, cly - 0.4],
    ] as Pt[], 0.8), ramp, {
      shadow: 0.4, radius: 3, pivot: [clx, cly - 0.6], rim: side > 0 ? 0.5 : 0.2, line: 0.48,
    })
  }
  // Eyestalks.
  for (const [ex, h] of [[cx + 1.4, 3.6], [cx + 3.8, 3]] as Array<[number, number]>) {
    paint(ctx, limbPath(ex, cy - 4.6, ex + 0.5, cy - 4.6 - h, 0.5, 0.5), shell, {
      shadow: 0.42, radius: 1, pivot: [ex, cy - 5], line: 0.4,
    })
    paint(ctx, ellipsePath(ex + 0.5, cy - 4.9 - h, 1.15, 1.2), C(PAL.cream), {
      shadow: 0.3, radius: 1.2, pivot: [ex, cy - 5 - h], line: 0.4,
    })
    ctx.fillStyle = EYE_INK
    ctx.fill(ellipsePath(ex + 0.8, cy - 5 - h, 0.5, 0.62))
    glint(ctx, ex + 0.2, cy - 5.5 - h, 0.3, 0.3, 0, PAL.white, 0.8)
  }
}

/**
 * Sea bat.
 *
 * The wing is built the way a real one is — an arm to the wrist, then finger
 * struts with membrane scalloped between them. A wing drawn as one lump reads
 * as a paper bag, which is exactly what the first pass at this looked like.
 */
function batWing(
  ctx: CanvasRenderingContext2D,
  root: Pt,
  side: number,
  flap: number,
  ramp: Cel,
  rim: number,
): void {
  const spread = 0.55 + (1 - Math.abs(flap)) * 0.45
  const wrist: Pt = [root[0] + side * 9 * spread, root[1] - 3 - flap * 6]
  const fingers: Pt[] = [0, 1, 2].map((i) => {
    const u = i / 2
    return [
      wrist[0] + side * (2.5 - u * 4.5) * spread,
      wrist[1] + 3 + u * 5.4 - flap * (1 - u) * 2,
    ] as Pt
  })
  const pull = (a: Pt, b: Pt): Pt => [
    (a[0] + b[0]) / 2 - side * 0.9,
    (a[1] + b[1]) / 2 - 1.1,
  ]
  const membrane = blob([
    root,
    wrist,
    fingers[0],
    pull(fingers[0], fingers[1]),
    fingers[1],
    pull(fingers[1], fingers[2]),
    fingers[2],
    [root[0] - side * 0.5, root[1] + 3.4],
  ] as Pt[], 0.6)
  paint(ctx, membrane, ramp, {
    shadow: 0.42, radius: 6, pivot: [wrist[0], wrist[1] + 2], rim, line: 0.5,
  })
  inside(ctx, membrane, (c) => {
    c.strokeStyle = ramp.line
    c.lineWidth = 0.5
    for (const f of fingers) c.stroke(curve([wrist, [(wrist[0] + f[0]) / 2, (wrist[1] + f[1]) / 2 + 0.4], f] as Pt[]))
    c.stroke(curve([root, [(root[0] + wrist[0]) / 2, (root[1] + wrist[1]) / 2 - 0.6], wrist] as Pt[]))
  })
}

/** Sea bat — the wing arc is the animation. */
function drawBat(s: Surface, t: number, mode: Mode = 'walk'): void {
  const ctx = s.ctx
  const cx = s.w * 0.5
  const cy = s.h * 0.5
  const flap = Math.sin(t * Math.PI * 2 * (mode === 'run' ? 1.4 : 1))
  const body = C(TONE.batSkin)

  // Far wing first, smaller and lagging, so the pair never reads as a butterfly.
  batWing(ctx, [cx - 1.4, cy - 1.6], -1, flap * 0.7, far(TONE.batSkin), 0.2)
  batWing(ctx, [cx - 1.4, cy - 1.6], 1, flap, body, 0.55)

  paint(ctx, blob([
    [cx - 3.4, cy - 1.6],
    [cx + 1, cy - 3.2],
    [cx + 3.4, cy - 0.6],
    [cx + 2, cy + 3.4],
    [cx - 2.6, cy + 2.6],
  ] as Pt[], 0.9), body, {
    shadow: 0.38, radius: 3.6, pivot: [cx, cy], rim: 0.65, line: 0.5,
  })
  // A ruff of fur where the head meets the body.
  paint(ctx, ellipsePath(cx + 0.6, cy - 2.6, 3.2, 2.6, -0.15), C(mix(TONE.batSkin, PAL.dusk, 0.4)), {
    shadow: 0.4, radius: 3, pivot: [cx, cy - 2.6], rim: 0.5, line: 0.45,
  })
  paint(ctx, headPath(cx + 1, cy - 3.4, 2.8, 0.9), body, {
    shadow: 0.36, radius: 3, pivot: [cx + 1, cy - 3.4], rim: 0.6, line: 0.48,
  })
  // Ears: different sizes, angled apart.
  for (const [side, h, tilt] of [[1, 4, 0.3], [-1, 3, -0.4]] as Array<[number, number, number]>) {
    const bx = cx + 1 + side * 1.3
    const by = cy - 5.4
    paint(ctx, blob([
      [bx - 0.9, by + 0.6],
      [bx + Math.sin(tilt) * h, by - Math.cos(tilt) * h],
      [bx + 1.1, by + 0.4],
    ] as Pt[], 0.4), side < 0 ? far(TONE.batSkin) : body, {
      shadow: 0.42, radius: 2, pivot: [bx, by], rim: 0.4, line: 0.45,
    })
  }
  eyes3q(ctx, cx + 0.8, cy - 3.4, 2.8, { angry: true, color: PAL.danger, wide: true })
  mouth(ctx, cx + 0.6, cy - 2.1, 2.6, 'fang')
  // Feet, tucked up under the body.
  for (const dx of [-1, 0.8]) {
    paint(ctx, limbPath(cx + dx, cy + 2.6, cx + dx - 0.8, cy + 4.2, 0.55, 0.36),
      dx < 0 ? far(TONE.batSkin) : body, { shadow: 0.44, radius: 1, pivot: [cx + dx, cy + 3], line: 0.4 })
  }
}

/** Spiked urchin — every cue says do not touch. */
function drawUrchin(s: Surface, t: number, _mode: Mode = 'walk'): void {
  const ctx = s.ctx
  const cx = s.w * 0.5
  const gy = s.h - 1
  const pulse = 1 + Math.sin(t * Math.PI * 2) * 0.06
  const r = 5.4 * pulse
  const cy = gy - r - 2.4
  contactShadow(ctx, cx, gy - 0.3, 6.5, 1.3, 0.34)

  // Spines: uneven lengths, and the ones pointing at the camera are shortest.
  for (let i = 0; i < 15; i++) {
    const a = (i / 15) * Math.PI * 2 + 0.2
    const face = Math.abs(Math.cos(a))
    const len = r + 3.4 + Math.sin(i * 2.3) * 1.4 - face * 0.8
    const bx = cx + Math.cos(a) * r * 0.85
    const by = cy + Math.sin(a) * r * 0.85
    paint(ctx, blob([
      [bx + Math.cos(a + 1.5) * 1.3, by + Math.sin(a + 1.5) * 1.3],
      [cx + Math.cos(a) * len, cy + Math.sin(a) * len],
      [bx + Math.cos(a - 1.5) * 1.3, by + Math.sin(a - 1.5) * 1.3],
    ] as Pt[], 0.22), C(mix(PAL.steel, PAL.mist, 0.2)), {
      shadow: 0.42, radius: 2, pivot: [bx, by], rim: 0.4, line: 0.4,
    })
  }
  paint(ctx, ellipsePath(cx, cy, r, r * 0.96), C(TONE.urchinBody), {
    shadow: 0.4, radius: r, pivot: [cx, cy], rim: 0.7, line: 0.55, occlusion: 0.2,
  })
  glint(ctx, cx - r * 0.42, cy - r * 0.5, r * 0.34, r * 0.22, -0.6, PAL.white, 0.35)
  eyes3q(ctx, cx - 0.6, cy + 0.2, r, { angry: true, color: PAL.danger })
}

/** Rolling barrel — scenery gone wrong. */
function drawBarrel(s: Surface, t: number, mode: Mode = 'walk'): void {
  const ctx = s.ctx
  const cx = s.w * 0.5
  const r = 6.4
  const cy = s.h - 1.5 - r
  const spin = t * Math.PI * 2 * (mode === 'run' ? 2 : 1)
  const wood = C(PAL.wood)
  contactShadow(ctx, cx, s.h - 1.2, 6, 1.2, 0.35)
  const body = ellipsePath(cx, cy, r, r)
  paint(ctx, body, wood, {
    shadow: 0.4, radius: r, pivot: [cx, cy], rim: 0.7, line: 0.6, occlusion: 0.2,
  })
  inside(ctx, body, (c) => {
    // Staves: only the ones on the near face are drawn, each bowed by how far
    // round the barrel it has turned. That curvature is what sells the spin.
    for (let i = 0; i < 7; i++) {
      const a = spin + (i / 7) * Math.PI * 2
      if (Math.cos(a) <= 0) continue
      const x = cx + Math.sin(a) * r
      const bow = Math.sin(a) * r * 0.28
      c.strokeStyle = wood.line
      c.lineWidth = 0.5
      c.beginPath()
      c.moveTo(x, cy - r)
      c.quadraticCurveTo(x - bow, cy, x, cy + r)
      c.stroke()
      c.strokeStyle = wood.light
      c.globalAlpha = 0.35
      c.beginPath()
      c.moveTo(x + 0.6, cy - r)
      c.quadraticCurveTo(x + 0.6 - bow, cy, x + 0.6, cy + r)
      c.stroke()
      c.globalAlpha = 1
    }
    // Hoops: two iron bands, drawn as ellipses so they wrap the form.
    for (const [dy, ry] of [[-3, 1.5], [3, 1.5]] as Array<[number, number]>) {
      c.strokeStyle = C(TONE.ironDark).core
      c.lineWidth = 1.4
      c.beginPath()
      c.ellipse(cx, cy + dy, r * 0.99, ry, 0, 0, Math.PI * 2)
      c.stroke()
      c.strokeStyle = C(TONE.steel).core
      c.lineWidth = 0.35
      c.beginPath()
      c.ellipse(cx, cy + dy - 0.45, r * 0.99, ry, 0, Math.PI * 1.05, Math.PI * 1.95)
      c.stroke()
    }
  })
  glint(ctx, cx - 2.4, cy - 3.4, 2.2, 0.9, -0.5, PAL.white, 0.3)
}

/** Seagull — the traversal enemy that flies a lazy line across a gap. */
function drawGull(s: Surface, t: number, mode: Mode = 'walk'): void {
  const ctx = s.ctx
  const cx = s.w * 0.5
  const cy = s.h * 0.5
  const flap = Math.sin(t * Math.PI * 2 * (mode === 'run' ? 1.6 : 1))
  const bodyC = C(PAL.cream)

  for (const side of [-1, 1] as const) {
    const lag = side < 0 ? 0.6 : 1
    const up = flap * lag
    const wing = blob([
      [cx - 1, cy - 1],
      [cx - 2 + side * 2, cy - 3 - up * 5],
      [cx - 6 + side * 5, cy - 1 - up * 7],
      [cx - 9 + side * 6, cy + 2 - up * 4],
      [cx - 3, cy + 1.6],
    ] as Pt[], 0.85)
    paint(ctx, wing, side < 0 ? far(TONE.gullGrey) : C(TONE.gullGrey), {
      shadow: 0.36, radius: 5, pivot: [cx - 4, cy], rim: side > 0 ? 0.6 : 0.2, line: 0.45,
    })
    inside(ctx, wing, (c) => {
      c.fillStyle = C(TONE.ironDark).core
      c.fill(blob([
        [cx - 7 + side * 5, cy - 1 - up * 6],
        [cx - 9.4 + side * 6, cy + 2.2 - up * 4],
        [cx - 6.5 + side * 4, cy + 1.6 - up * 3],
      ] as Pt[], 0.6))
    })
  }
  paint(ctx, blob([
    [cx - 6, cy + 0.4],
    [cx - 2, cy - 2.4],
    [cx + 3, cy - 2],
    [cx + 4.4, cy + 0.6],
    [cx - 1, cy + 2.6],
  ] as Pt[], 0.9), bodyC, {
    shadow: 0.34, radius: 4.4, pivot: [cx, cy], rim: 0.7, line: 0.5,
  })
  paint(ctx, ellipsePath(cx + 4, cy - 2.4, 2.3, 2.1), bodyC, {
    shadow: 0.32, radius: 2.3, pivot: [cx + 4, cy - 2.4], rim: 0.6, line: 0.45,
  })
  paint(ctx, blob([[cx + 5.6, cy - 2.8], [cx + 9.4, cy - 1.8], [cx + 5.6, cy - 1.2]] as Pt[], 0.35),
    C(PAL.namiOrange), { shadow: 0.36, radius: 2, pivot: [cx + 7, cy - 2], rim: 0.4, line: 0.42 })
  ctx.fillStyle = EYE_INK
  ctx.fill(ellipsePath(cx + 4.6, cy - 2.9, 0.6, 0.7))
  glint(ctx, cx + 4.4, cy - 3.1, 0.24, 0.3, 0, PAL.white, 0.9)
  // Tail.
  paint(ctx, blob([[cx - 5, cy - 0.6], [cx - 9.5, cy + 0.6 + flap], [cx - 5, cy + 1.8]] as Pt[], 0.5),
    C(TONE.gullGrey), { shadow: 0.4, radius: 2.4, pivot: [cx - 6, cy], line: 0.45 })
}

/** Jack-in-the-box — a circus trap that hops. The coil is the whole character. */
function drawJumper(s: Surface, t: number, mode: Mode = 'walk'): void {
  const ctx = s.ctx
  const cx = s.w * 0.5
  const gy = s.h - 1
  // Compressed at the bottom of the cycle, stretched at the top.
  const u = mode === 'idle' ? 0.15 : (Math.sin(t * Math.PI * 2 - Math.PI / 2) + 1) / 2
  const stretch = mode === 'windup' ? 0 : u
  const coilH = 1.5 + stretch * 8
  const boxH = 6
  contactShadow(ctx, cx, gy - 0.2, 6 - stretch * 2, 1.2, 0.36 - stretch * 0.12)

  // Box.
  const box = roundRectPath(cx - 5.4, gy - boxH, 10.8, boxH, 1)
  paint(ctx, box, C(TONE.jackBox), {
    shadow: 0.4, radius: 5, pivot: [cx, gy - boxH / 2], rim: 0.6, line: 0.55, occlusion: 0.2,
  })
  stripes(ctx, box, TONE.circusCream, [cx, gy - boxH / 2], 2.4, 0.5, 1.2)
  ctx.fillStyle = C(TONE.brass).core
  ctx.fill(roundRectPath(cx + 4.2, gy - boxH * 0.72, 1.6, 1.6, 0.4))

  // Coil.
  const coil = new Path2D()
  const turns = 3
  for (let i = 0; i <= 30; i++) {
    const p = i / 30
    const a = p * Math.PI * 2 * turns
    const x = cx + Math.sin(a) * 3
    const y = gy - boxH - p * coilH
    if (i === 0) coil.moveTo(x, y)
    else coil.lineTo(x, y)
  }
  inkStroke(ctx, coil, 1.5, C(TONE.steel).core, 0.7)
  inkStroke(ctx, coil, 0.5, C(TONE.steel).light, 0.5)

  // Head on top, squashed and stretched with the hop.
  const hy = gy - boxH - coilH - 3.2
  const sq = 1 + (1 - stretch) * 0.22
  ctx.save()
  ctx.translate(cx, hy)
  ctx.scale(sq, 1 / sq)
  ctx.translate(-cx, -hy)
  clownHead(ctx, cx, hy, 3.4, -0.1 + Math.sin(t * Math.PI * 2) * 0.12, { nose: true, hat: 'jester' })
  ctx.restore()
}

/** Spiked roller — a drum of iron that rolls a lane and cannot be touched. */
function drawRoller(s: Surface, t: number, mode: Mode = 'walk'): void {
  const ctx = s.ctx
  const cx = s.w * 0.5
  const r = 6.6
  const gy = s.h - 1
  const cy = gy - r - 2.2
  const spin = t * Math.PI * 2 * (mode === 'run' ? 2 : 1)
  contactShadow(ctx, cx, gy - 0.3, 7, 1.4, 0.4)

  // Spikes: eight, rotating with the drum, longest at the rim.
  for (let i = 0; i < 8; i++) {
    const a = spin + (i / 8) * Math.PI * 2
    const bx = cx + Math.cos(a) * r * 0.9
    const by = cy + Math.sin(a) * r * 0.9
    const len = r + 3.6
    paint(ctx, blob([
      [bx + Math.cos(a + 1.5) * 1.6, by + Math.sin(a + 1.5) * 1.6],
      [cx + Math.cos(a) * len, cy + Math.sin(a) * len],
      [bx + Math.cos(a - 1.5) * 1.6, by + Math.sin(a - 1.5) * 1.6],
    ] as Pt[], 0.2), C(TONE.steel), {
      shadow: 0.4, radius: 2.4, pivot: [bx, by], rim: 0.5, line: 0.45,
    })
  }
  const drum = ellipsePath(cx, cy, r, r)
  paint(ctx, drum, C(TONE.ironDark), {
    shadow: 0.42, radius: r, pivot: [cx, cy], rim: 0.8, line: 0.6, occlusion: 0.25,
  })
  inside(ctx, drum, (c) => {
    c.strokeStyle = C(TONE.ironDark).light
    c.lineWidth = 0.8
    for (const dy of [-3, 3]) {
      c.beginPath()
      c.moveTo(cx - r, cy + dy)
      c.lineTo(cx + r, cy + dy)
      c.stroke()
    }
    // Rivets ride around with the spin.
    c.fillStyle = C(TONE.steel).core
    for (let i = 0; i < 6; i++) {
      const a = spin + (i / 6) * Math.PI * 2
      c.fill(ellipsePath(cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62, 0.6, 0.6))
    }
  })
  glint(ctx, cx - 2.6, cy - 3, 2.2, 0.8, -0.5, PAL.white, 0.28)
}

/**
 * Pufferfish. Deflated it waddles and can be stomped; inflated it is a ball of
 * spines. The wind-up is the frame that says which one you are about to meet.
 */
function drawPuffer(s: Surface, t: number, mode: Mode = 'walk'): void {
  const ctx = s.ctx
  const cx = s.w * 0.5
  const gy = s.h - 1
  const inflate = mode === 'attack' ? 1 : mode === 'windup' ? 0.55 : 0
  const wob = Math.sin(t * Math.PI * 2)
  const r = 4 + inflate * 4.4
  const cy = gy - r - 1.4 - inflate * 0.6
  const bodyC = C(TONE.pufferBody)
  contactShadow(ctx, cx, gy - 0.2, r * 0.9, 1.2, 0.34)

  // Spines: flat against the skin when calm, out and rigid when inflated.
  const spineLen = 0.9 + inflate * 3.4
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.3
    const bx = cx + Math.cos(a) * r * 0.9
    const by = cy + Math.sin(a) * r * 0.86
    const lay = inflate > 0.1 ? a : a + 1.1
    paint(ctx, blob([
      [bx + Math.cos(a + 1.5) * 0.9, by + Math.sin(a + 1.5) * 0.9],
      [bx + Math.cos(lay) * spineLen, by + Math.sin(lay) * spineLen],
      [bx + Math.cos(a - 1.5) * 0.9, by + Math.sin(a - 1.5) * 0.9],
    ] as Pt[], 0.25), C(mix(TONE.pufferBody, PAL.dirtDeep, 0.45)), {
      shadow: 0.42, radius: 1.4, pivot: [bx, by], rim: 0.35, line: 0.36,
    })
  }
  const body = ellipsePath(cx, cy, r * (1 + (1 - inflate) * 0.12), r * (1 - (1 - inflate) * 0.1 + wob * 0.03))
  paint(ctx, body, bodyC, {
    shadow: 0.38, radius: r, pivot: [cx, cy], rim: 0.75, line: 0.55, occlusion: 0.2,
  })
  inside(ctx, body, (c) => {
    c.fillStyle = C(TONE.sharkBelly).core
    c.fill(ellipsePath(cx + 0.6, cy + r * 0.55, r * 0.8, r * 0.45))
    c.fillStyle = bodyC.shade
    c.fill(ellipsePath(cx - r * 0.3, cy - r * 0.45, r * 0.3, r * 0.2, -0.4))
    c.fill(ellipsePath(cx + r * 0.35, cy - r * 0.2, r * 0.22, r * 0.16, 0.3))
  })
  // Fins and tail.
  for (const [fx, fy, sc] of [[cx - r * 0.95, cy + 0.4, 1], [cx + r * 0.9, cy + 0.6, -0.8]] as Array<[number, number, number]>) {
    paint(ctx, blob([
      [fx, fy - 1.2], [fx - sc * (2.4 + wob * 0.6), fy + 0.6], [fx, fy + 1.6],
    ] as Pt[], 0.6), C(mix(TONE.pufferBody, PAL.namiOrange, 0.4)), {
      shadow: 0.4, radius: 1.6, pivot: [fx, fy], rim: 0.4, line: 0.4,
    })
  }
  eyes3q(ctx, cx + r * 0.1, cy - r * 0.2, r * 0.95, { wide: true, angry: inflate > 0.5 })
  mouth(ctx, cx + r * 0.1, cy + r * 0.42, r * 0.95, inflate > 0.5 ? 'open' : 'grim')
}

/** Crate debris — the fragments a broken box leaves rolling down a slope. */
function drawDebris(s: Surface, t: number, _mode: Mode = 'walk'): void {
  const ctx = s.ctx
  const cx = s.w * 0.5
  const cy = s.h * 0.55
  const spin = t * Math.PI * 2
  const wood = C(PAL.wood)
  const shapes: Array<[number, number, number, number, number]> = [
    [-3.4, 1.2, 5.4, 2.2, 0.3],
    [2.6, -1.4, 4.2, 2.6, -0.5],
    [0.4, 3, 3.2, 1.8, 0.9],
    [-1.6, -3, 2.6, 2.4, -1.1],
  ]
  for (let i = 0; i < shapes.length; i++) {
    const [dx, dy, w, h, rot] = shapes[i]
    ctx.save()
    ctx.translate(cx + dx, cy + dy)
    ctx.rotate(rot + spin * (i % 2 === 0 ? 1 : -1.4))
    const plank = blob([
      [-w / 2, -h / 2], [w / 2 - 0.4, -h / 2 - 0.3], [w / 2, h / 2], [-w / 2 + 0.3, h / 2 + 0.2],
    ] as Pt[], 0.25)
    paint(ctx, plank, i % 2 === 0 ? wood : C(PAL.woodLight), {
      shadow: 0.42, radius: h, pivot: [0, 0], rim: 0.5, line: 0.5,
    })
    inside(ctx, plank, (c) => {
      c.strokeStyle = wood.line
      c.lineWidth = 0.35
      c.stroke(curve([[-w / 2, -h * 0.1], [0, h * 0.05], [w / 2, -h * 0.15]] as Pt[]))
    })
    // A bent nail on one fragment: broken things keep their hardware.
    if (i === 1) {
      ctx.fillStyle = C(TONE.steel).core
      ctx.fill(roundRectPath(w / 2 - 0.8, -0.3, 1.8, 0.5, 0.2))
    }
    ctx.restore()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sheets
// ─────────────────────────────────────────────────────────────────────────────

type Painter = (s: Surface, t: number, mode: Mode) => void

interface AnimReq {
  name: string
  mode: Mode
  n: number
  dur: number
  loop?: boolean
}

function build(
  p: Painter,
  fw: number,
  fh: number,
  anims: AnimReq[],
  aliases: Array<[string, string]> = [],
): SpriteSheet {
  const b = new SheetBuilder({ fw, fh, ox: -fw / 2, oy: -fh, contour: INK, contourWidth: 0.7 })
  for (const a of anims) {
    const frames: FrameSpec[] = Array.from({ length: a.n }, (_, i) => ({
      dur: a.dur,
      draw: (s: Surface) => p(s, a.n === 1 ? 0 : i / a.n, a.mode),
    }))
    b.add(a.name, frames, { loop: a.loop ?? true })
  }
  // Aliases share their source's frames — a second name costs no texture.
  for (const [name, src] of aliases) b.alias(name, src)
  return b.build()
}

/** idle / walk / run, the three every entity is allowed to ask for. */
const LOCO = (dur = 0.12): AnimReq[] => [
  { name: 'idle', mode: 'idle', n: 4, dur: dur * 3 },
  { name: 'walk', mode: 'walk', n: 6, dur },
  { name: 'run', mode: 'run', n: 6, dur: dur * 0.62 },
]

/** A wind-up that is visibly not the neutral pose, then the strike. */
const STRIKE = (windDur = 0.34, hitDur = 0.26): AnimReq[] => [
  { name: 'windup', mode: 'windup', n: 1, dur: windDur, loop: false },
  { name: 'attack', mode: 'attack', n: 1, dur: hitDur, loop: false },
]

/** Flyers and rollers have no gait: the same cycle, faster. */
const SPIN = (dur = 0.08): AnimReq[] => [
  { name: 'idle', mode: 'idle', n: 6, dur: dur * 1.5 },
  { name: 'walk', mode: 'walk', n: 6, dur },
  { name: 'run', mode: 'run', n: 6, dur: dur * 0.7 },
]

export function buildEnemySheets(): Record<string, SpriteSheet> {
  return {
    // ── Marines ──────────────────────────────────────────────────────────────
    grunt: build(drawGrunt, 34, 36, [
      ...LOCO(0.11),
      { name: 'squash', mode: 'squash', n: 1, dur: 0.5, loop: false },
    ]),
    shielder: build(drawShielder, 36, 36, LOCO(0.14)),
    'marine-officer': build(drawOfficer, 58, 46, [...LOCO(0.12), ...STRIKE(0.4, 0.3)]),
    'marine-cannon': build(drawCannon, 56, 36, [
      { name: 'idle', mode: 'idle', n: 4, dur: 0.3 },
      { name: 'walk', mode: 'idle', n: 4, dur: 0.3 },
      { name: 'run', mode: 'idle', n: 4, dur: 0.3 },
      { name: 'windup', mode: 'windup', n: 2, dur: 0.24, loop: false },
      { name: 'attack', mode: 'attack', n: 2, dur: 0.14, loop: false },
    ]),

    // ── Circus pirates ───────────────────────────────────────────────────────
    'circus-acrobat': build(drawAcrobat, 36, 40, [...LOCO(0.1), ...STRIKE(0.3, 0.28)]),
    'circus-juggler': build(drawJuggler, 52, 44, [...LOCO(0.13), ...STRIKE(0.36, 0.24)]),

    // ── Fishmen ──────────────────────────────────────────────────────────────
    fishman: build(drawFishman, 56, 42, [
      ...LOCO(0.12),
      { name: 'windup', mode: 'windup', n: 1, dur: 0.4, loop: false },
    ]),
    'fishman-brute': build(drawBruiser, 50, 42, [...LOCO(0.15), ...STRIKE(0.42, 0.28)]),

    // ── Desert agents ────────────────────────────────────────────────────────
    'agent-hook': build(drawAgent, 48, 40, [...LOCO(0.11), ...STRIKE(0.34, 0.24)]),
    scarab: build(drawScarab, 30, 24, LOCO(0.1)),
    sandcrab: build(drawSandCrab, 34, 24, LOCO(0.09)),

    // ── Skypiea ──────────────────────────────────────────────────────────────
    'sky-priest': build(drawPriest, 60, 44, [...LOCO(0.14), ...STRIKE(0.38, 0.26)]),
    'sky-scout': build(drawScout, 30, 36, SPIN(0.09)),

    // ── Thriller Bark ────────────────────────────────────────────────────────
    zombie: build(drawZombie, 32, 38, LOCO(0.17)),
    ghost: build(drawGhost, 32, 32, SPIN(0.12)),

    // ── Wano ─────────────────────────────────────────────────────────────────
    'oni-brute': build(drawOni, 68, 46, [...LOCO(0.15), ...STRIKE(0.44, 0.3)]),
    samurai: build(drawSamurai, 54, 42, [...LOCO(0.12), ...STRIKE(0.46, 0.22)]),

    // ── Critters and traversal hazards ───────────────────────────────────────
    crab: build(drawCrab, 36, 28, LOCO(0.1)),
    bat: build(drawBat, 36, 28, SPIN(0.07)),
    urchin: build(drawUrchin, 30, 28, SPIN(0.14)),
    barrel: build(drawBarrel, 22, 24, SPIN(0.05)),
    seagull: build(drawGull, 38, 24, SPIN(0.08)),
    jumper: build(drawJumper, 30, 36, [
      { name: 'idle', mode: 'idle', n: 4, dur: 0.2 },
      { name: 'walk', mode: 'walk', n: 6, dur: 0.09 },
      { name: 'run', mode: 'run', n: 6, dur: 0.07 },
      { name: 'windup', mode: 'windup', n: 1, dur: 0.24, loop: false },
    ]),
    'spike-roller': build(drawRoller, 30, 28, SPIN(0.06)),
    // The pufferfish is two enemies in one sheet: 'deflated' can be stomped,
    // 'inflated' cannot, and 'windup' is the frame that warns you which.
    puffer: build(drawPuffer, 32, 28, [
      ...SPIN(0.11),
      { name: 'windup', mode: 'windup', n: 2, dur: 0.16, loop: false },
      { name: 'attack', mode: 'attack', n: 4, dur: 0.14 },
    ], [['deflated', 'idle'], ['inflated', 'attack']]),
    debris: build(drawDebris, 24, 24, SPIN(0.07)),
  }
}
