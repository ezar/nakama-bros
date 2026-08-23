import type { SpriteSheet } from '../types'
import { SheetBuilder, type FrameSpec } from './atlas'
import { mix, type Cel } from './color'
import { PAL } from './palette'
import {
  blob, crescentPath, curve, ellipsePath, glint, inkStroke, inside, limbPath, paint,
  roundRectPath, type Pt, type Surface,
} from './ink'
import {
  C, FACE_SHADOW, INK, P, TONE, WALK_KEYS, cloudPuff, curveRibbon, drawFigure,
  earAndNeck, eyes3q, far, feather, fishHead, gait, headPath, idlePose, mouth, nose,
  solveRig, spine, stripes, torsoPath,
  type Build, type Look, type Pose, type Rig,
} from './enemies'

/**
 * Boss art.
 *
 * A boss is the reward for a level, so it gets what a mook cannot afford:
 * roughly twice the height, a silhouette with one unmistakable read, and a
 * second phase that is visibly the same character after a beating — torn cloth,
 * cracked armour, a lost weapon — rather than a palette swap.
 *
 * Every boss ships six states: idle, walk, windup, attack, hurt and defeat, in
 * both phases. The wind-up always breaks the neutral silhouette (weapon back,
 * body coiled) because that frame is the player's entire warning.
 */

export type BossMode = 'idle' | 'walk' | 'windup' | 'attack' | 'hurt' | 'defeat'
export type Phase = 1 | 2

type BossPainter = (s: Surface, t: number, mode: BossMode, phase: Phase) => void

// ─────────────────────────────────────────────────────────────────────────────
// Shared damage language
// ─────────────────────────────────────────────────────────────────────────────

/** A crack: one jagged polyline with a lighter chip inside it. */
function crack(ctx: CanvasRenderingContext2D, pts: Pt[], w = 0.7): void {
  const p = new Path2D()
  p.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1])
  inkStroke(ctx, p, w, INK, 0.5)
}

/** A torn hem: the same edge, chewed. Cloth never fails in a straight line. */
function tornEdge(from: Pt, to: Pt, teeth: number, depth: number): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i <= teeth; i++) {
    const u = i / teeth
    const x = from[0] + (to[0] - from[0]) * u
    const y = from[1] + (to[1] - from[1]) * u
    out.push([x, y + (i % 2 === 0 ? depth : -depth * 0.35)])
  }
  return out
}

/** Stitched scar across a limb or a face. */
function scar(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, color: string): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 0.55
  ctx.stroke(curve([a, [(a[0] + b[0]) / 2 + 0.6, (a[1] + b[1]) / 2], b] as Pt[]))
  const n = 4
  for (let i = 1; i < n; i++) {
    const u = i / n
    const x = a[0] + (b[0] - a[0]) * u
    const y = a[1] + (b[1] - a[1]) * u
    ctx.beginPath()
    ctx.moveTo(x - 1, y - 0.8)
    ctx.lineTo(x + 1, y + 0.8)
    ctx.stroke()
  }
  ctx.restore()
}

/** Additive sparks around a charging attack. */
function sparks(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  n: number,
  color: string,
  seed = 0,
): void {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = color
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + seed
    const rr = r * (0.6 + ((i * 7919) % 100) / 250)
    const x = cx + Math.cos(a) * rr
    const y = cy + Math.sin(a) * rr
    ctx.globalAlpha = 0.5 + ((i * 31) % 5) / 10
    ctx.fill(blob([
      [x - 0.9, y], [x, y - 1.6], [x + 0.9, y], [x, y + 1.6],
    ] as Pt[], 0.3))
  }
  ctx.restore()
}

/** A bolt of lightning between two points, forked once. */
function bolt(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, seed: number, color: string): void {
  const pts: Pt[] = [a]
  const n = 5
  for (let i = 1; i < n; i++) {
    const u = i / n
    const jitter = Math.sin(seed + i * 2.3) * 3.4 * (1 - Math.abs(u - 0.5) * 1.2)
    pts.push([a[0] + (b[0] - a[0]) * u + jitter, a[1] + (b[1] - a[1]) * u - jitter * 0.6])
  }
  pts.push(b)
  const p = new Path2D()
  p.moveTo(pts[0][0], pts[0][1])
  for (const q of pts.slice(1)) p.lineTo(q[0], q[1])
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  inkStroke(ctx, p, 2, mix(color, PAL.white, 0.4), 0.6)
  inkStroke(ctx, p, 0.7, PAL.white, 0.8)
  ctx.restore()
}

/** Ground dust for the defeat beat. */
function dust(ctx: CanvasRenderingContext2D, cx: number, gy: number, w: number, color: string): void {
  ctx.save()
  ctx.globalAlpha = 0.5
  for (let i = 0; i < 5; i++) {
    const u = (i / 4 - 0.5) * 2
    const x = cx + u * w
    const r = 4 + Math.abs(Math.sin(i * 2.1)) * 4
    ctx.fillStyle = color
    ctx.fill(ellipsePath(x, gy - r * 0.35, r, r * 0.45))
  }
  ctx.restore()
}

/** Locomotion and reaction poses shared by every humanoid boss. */
function bossPose(mode: BossMode, t: number, stride = 1): Pose {
  switch (mode) {
    case 'walk':
      return gait(WALK_KEYS, t, stride * 0.85)
    case 'hurt':
      return P({
        hip: 1.6, lean: -0.3, legN: [0.6, -0.5], legF: [-0.7, 0.7],
        armN: [-1.1, 0.9], armF: [-1.4, 1.1], footN: 0.3, footF: -0.4, headTilt: -0.3, drag: -3,
      })
    case 'defeat':
      // Down on one knee, spine folded over it, arms slack.
      return P({
        hip: 13, lean: 0.85, legN: [1.5, -2.1], legF: [-0.75, 2.3],
        armN: [0.55, 1.5], armF: [0.9, 1.3], footN: 0.8, footF: 1.1, headTilt: 0.8, drag: 1,
      })
    default:
      return idlePose(t, 1.4)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Boss 1 — the clown captain
// ─────────────────────────────────────────────────────────────────────────────

const CLOWN_BUILD: Build = {
  hip: 26, thigh: 13, shin: 12.6, torso: 16, upper: 10, fore: 9.4,
  headR: 7, hipW: 6.8, shW: 8.6, legR: 3.5, armR: 2.8, z: 2.2,
}

/** Bladed circus flair: a fan of knives held in one hand. */
function knifeFan(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  a: number,
  n: number,
  spread: number,
): void {
  for (let i = 0; i < n; i++) {
    const ang = a + (i - (n - 1) / 2) * spread
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(ang)
    paint(ctx, blob([[-0.8, 0], [0.8, -0.6], [0.7, -12], [-0.5, -11]] as Pt[], 0.3), C(TONE.steel), {
      shadow: 0.3, radius: 2, pivot: [0, -6], rim: 0.5, line: 0.42,
    })
    glint(ctx, 0.3, -7, 0.24, 3.4, 0.02, PAL.white, 0.55)
    paint(ctx, roundRectPath(-1.1, 0, 2.2, 3.4, 0.8), C(PAL.wood), {
      shadow: 0.42, radius: 1.6, pivot: [0, 1.6], line: 0.42,
    })
    ctx.restore()
  }
}

function clownFace(
  ctx: CanvasRenderingContext2D,
  hx: number,
  hy: number,
  r: number,
  phase: Phase,
  mode: BossMode,
): void {
  const skin = C(mix(PAL.skin, PAL.cream, 0.35), 0.32)
  earAndNeck(ctx, hx, hy, r, skin)
  paint(ctx, headPath(hx, hy, r, 0.95), skin, {
    shadow: FACE_SHADOW, radius: r * 1.3, pivot: [hx, hy], rim: 0.6, line: 0.55,
  })
  // Hair: a run of spikes of different lengths, swept back.
  const hair = C(mix(PAL.sea, PAL.seaLight, 0.35))
  const spikes: Pt[] = [[hx - r * 1.0, hy + r * 0.1]]
  const lens = phase === 1 ? [1.5, 2.0, 1.7, 2.2, 1.4] : [1.1, 0.7, 1.6, 0.9, 1.2]
  for (let i = 0; i < lens.length; i++) {
    const u = i / (lens.length - 1)
    spikes.push([hx - r * (1.05 - u * 0.5) - r * lens[i] * 0.5, hy - r * (0.3 + u * 0.75)])
    spikes.push([hx - r * (0.8 - u * 0.7), hy - r * (0.5 + u * 0.6)])
  }
  spikes.push([hx + r * 0.5, hy - r * 1.05], [hx + r * 0.2, hy - r * 0.6])
  paint(ctx, blob(spikes, 0.55), hair, {
    shadow: 0.42, radius: r, pivot: [hx - r * 0.3, hy - r * 0.4], rim: 0.5, line: 0.5,
  })
  // Eyes and the red nose that names him.
  eyes3q(ctx, hx, hy + r * 0.02, r, { angry: true, wide: mode === 'attack' })
  paint(ctx, ellipsePath(hx + r * 0.92, hy + r * 0.22, r * 0.34, r * 0.32), C(PAL.luffyRed), {
    shadow: 0.3, radius: r * 0.4, pivot: [hx + r * 0.92, hy + r * 0.22], rim: 0.45, line: 0.45,
  })
  glint(ctx, hx + r * 0.78, hy + r * 0.06, r * 0.1, r * 0.08, -0.5, PAL.white, 0.8)
  mouth(ctx, hx, hy + r * 0.62, r, mode === 'attack' || mode === 'defeat' ? 'open' : 'grin')
  if (phase === 2) {
    scar(ctx, [hx + r * 0.2, hy - r * 0.5], [hx + r * 0.75, hy + r * 0.25], C(PAL.luffyRedDeep).core)
    crack(ctx, [[hx - r * 0.7, hy + r * 0.7], [hx - r * 0.3, hy + r * 0.5], [hx - r * 0.1, hy + r * 0.85]], 0.5)
  }
}

/** Captain's hat with a jolly roger — phase two wears the wreck of it. */
function clownHat(ctx: CanvasRenderingContext2D, hx: number, hy: number, r: number, phase: Phase): void {
  const cloth = C(mix(PAL.night, PAL.dusk, 0.25))
  const brim = phase === 1
    ? blob([
      [hx - r * 1.9, hy - r * 1.0],
      [hx - r * 0.4, hy - r * 1.5],
      [hx + r * 1.9, hy - r * 0.95],
      [hx + r * 0.6, hy - r * 1.25],
    ] as Pt[], 0.7)
    : blob([
      [hx - r * 1.6, hy - r * 0.95],
      [hx - r * 0.4, hy - r * 1.45],
      [hx + r * 1.1, hy - r * 1.15],
      [hx + r * 0.3, hy - r * 1.2],
    ] as Pt[], 0.7)
  paint(ctx, brim, cloth, {
    shadow: 0.4, radius: r * 1.6, pivot: [hx, hy - r * 1.2], rim: 0.55, line: 0.5,
  })
  paint(ctx, blob([
    [hx - r * 1.0, hy - r * 1.15],
    [hx - r * 0.5, hy - r * 2.1],
    [hx + r * 0.6, hy - r * 2.0],
    [hx + r * 1.0, hy - r * 1.1],
  ] as Pt[], 0.75), cloth, {
    shadow: 0.4, radius: r, pivot: [hx, hy - r * 1.6], rim: 0.55, line: 0.5,
  })
  // Skull badge.
  ctx.fillStyle = PAL.cream
  ctx.fill(ellipsePath(hx + r * 0.06, hy - r * 1.55, r * 0.3, r * 0.34))
  ctx.fill(roundRectPath(hx - r * 0.16, hy - r * 1.3, r * 0.44, r * 0.2, r * 0.08))
  ctx.fillStyle = INK
  ctx.fill(ellipsePath(hx - r * 0.06, hy - r * 1.6, r * 0.09, r * 0.11))
  ctx.fill(ellipsePath(hx + r * 0.2, hy - r * 1.6, r * 0.09, r * 0.11))
  if (phase === 2) crack(ctx, [[hx - r * 0.4, hy - r * 2.05], [hx - r * 0.1, hy - r * 1.5], [hx + r * 0.3, hy - r * 1.9]], 0.6)
}

function drawClown(s: Surface, t: number, mode: BossMode, phase: Phase): void {
  const ctx = s.ctx
  const cx = s.w * 0.5
  const gy = s.h - 1.5
  const b = CLOWN_BUILD
  const look: Look = {
    cloth: TONE.circusCream, legs: mix(PAL.night, PAL.dusk, 0.3), skin: mix(PAL.skin, PAL.cream, 0.35),
    boot: mix(PAL.dirtDeep, PAL.ink, 0.3), sleeve: 1, bulk: phase === 2 ? 1.02 : 1.06,
  }
  let pose = bossPose(mode, t, 1)
  if (mode === 'windup') {
    pose = P({ hip: 2.4, lean: -0.26, legN: [0.5, -0.6], legF: [-0.55, 0.7], armN: [-2.4, 0.8], armF: [-1.9, 1.0], footN: 0.25, footF: -0.3, drag: -4 })
  } else if (mode === 'attack') {
    pose = P({ hip: -1, lean: 0.42, legN: [0.85, -0.35], legF: [-0.8, 0.55], armN: [1.5, 0.1], armF: [1.0, 0.5], footN: 0.4, footF: -0.4, drag: 5 })
  }
  const rig = solveRig(cx, gy, b, pose)
  if (mode === 'defeat') dust(ctx, cx, gy, 20, mix(PAL.mist, PAL.slate, 0.4))

  // Phase two: the near forearm has come off and hovers, still holding a knife.
  const split = phase === 2 && mode !== 'defeat'

  drawFigure(ctx, rig, b, look, pose, {
    back: (c, r) => {
      // Captain's coat, hung off the shoulders, tails lagging behind the stride.
      const d = pose.drag
      const hem = tornEdge(
        [r.hip[0] + 6, r.hip[1] + 12],
        [r.hip[0] - 9 - d * 0.6, r.hip[1] + 13],
        phase === 2 ? 7 : 3,
        phase === 2 ? 2.4 : 0.8,
      )
      paint(c, blob([
        [r.sh[0] - 8, r.sh[1] - 2],
        [r.sh[0] + 7, r.sh[1] - 1],
        [r.hip[0] + 7.4, r.hip[1] + 4],
        ...hem,
        [r.hip[0] - 10 - d, r.hip[1] + 3],
        [r.sh[0] - 9, r.sh[1] + 4],
      ] as Pt[], 0.62), C(mix(PAL.dusk, PAL.luffyRedDeep, 0.32)), {
        shadow: 0.44, radius: 10, pivot: [r.hip[0], r.hip[1] + 4], rim: 0.55, line: 0.6, occlusion: 0.25,
      })
      c.save()
      c.strokeStyle = C(PAL.gold).core
      c.lineWidth = 0.9
      c.stroke(curve([
        [r.sh[0] - 8.6, r.sh[1] - 1], [r.hip[0] - 9 - d * 0.7, r.hip[1] + 3],
        [r.hip[0] - 8 - d * 0.6, r.hip[1] + 11],
      ] as Pt[]))
      c.restore()
      if (phase === 2) {
        crack(c, [[r.sh[0] - 6, r.sh[1] + 3], [r.hip[0] - 4, r.hip[1] - 2], [r.hip[0] - 7, r.hip[1] + 5]], 0.8)
      }
    },
    overTorso: (c, r) => {
      stripes(c, torsoPath(r, b, look.bulk), TONE.circusRed,
        [(r.hip[0] + r.sh[0]) / 2, (r.hip[1] + r.sh[1]) / 2], 4.2, 0.2, 2.1)
      // Sash and buckle.
      const { px, py } = spine(r)
      paint(c, limbPath(
        r.hip[0] - px * 7, r.hip[1] - py * 7 - 1,
        r.hip[0] + px * 7, r.hip[1] + py * 7 - 1, 2.2, 2.2,
      ), C(PAL.luffyRedDeep), { shadow: 0.42, radius: 2.6, pivot: r.hip, rim: 0.4, line: 0.5 })
      c.fillStyle = PAL.gold
      c.fill(roundRectPath(r.hip[0] - 1.6, r.hip[1] - 2.6, 3.4, 3.4, 0.9))
      // Ruffled collar.
      for (let i = -2; i <= 2; i++) {
        const a = i * 0.42
        paint(c, ellipsePath(r.sh[0] + Math.sin(a) * 6.2, r.sh[1] + 1.6 + Math.cos(a) * 1.4, 2.4, 1.4, a * 0.5),
          C(i % 2 === 0 ? TONE.circusCream : PAL.sanjiGold), {
            shadow: 0.4, radius: 2.4, pivot: r.sh, rim: 0.4, line: 0.45,
          })
      }
    },
    front: (c, r) => {
      const hand: Pt = split ? [r.handN[0] + 7, r.handN[1] - 5] : r.handN
      if (split) {
        // Detached forearm, floating with a gap that reads at a glance.
        paint(c, limbPath(hand[0] - 5, hand[1] + 2.4, hand[0], hand[1], b.armR * 0.95, b.armR * 0.8),
          C(TONE.circusCream), { shadow: 0.44, radius: b.armR, pivot: hand, rim: 0.45, line: 0.45 })
        paint(c, ellipsePath(hand[0], hand[1], b.armR * 1.1, b.armR), C(mix(PAL.skin, PAL.cream, 0.35)), {
          shadow: FACE_SHADOW, radius: b.armR * 1.4, pivot: hand, rim: 0.4, line: 0.42,
        })
      }
      const a = mode === 'windup' ? -2.2 : mode === 'attack' ? 1.1 : -0.5
      knifeFan(c, hand[0], hand[1], a, mode === 'attack' ? 3 : 2, 0.32)
      if (mode === 'attack') {
        c.save()
        c.globalAlpha = 0.7
        c.fillStyle = mix(PAL.cream, PAL.magic, 0.3)
        c.fill(crescentPath(r.sh[0] + 4, r.sh[1] + 3, 26, 4.4, -1.4, 0.5))
        c.restore()
      }
    },
    head: (c, r) => {
      const tiltY = mode === 'defeat' ? 3 : 0
      clownFace(c, r.head[0], r.head[1] + tiltY, b.headR, phase, mode)
      clownHat(c, r.head[0], r.head[1] + tiltY, b.headR, phase)
    },
  })
  if (mode === 'windup') sparks(ctx, rig.handN[0], rig.handN[1] - 6, 9, 6, PAL.ember, t * 6)
}

// ─────────────────────────────────────────────────────────────────────────────
// Boss 2 — the fishman warlord
// ─────────────────────────────────────────────────────────────────────────────

const LORD_BUILD: Build = {
  hip: 27, thigh: 12.6, shin: 13, torso: 20, upper: 13, fore: 12,
  headR: 6.6, hipW: 8, shW: 11.5, legR: 4.6, armR: 4.4, z: 3,
}

/** A boss-scale shoulder slab: the plate `shoulderPlate` draws, twice the size. */
function slabPlate(
  ctx: CanvasRenderingContext2D,
  sh: Pt,
  dz: number,
  ramp: Cel,
  rim: number,
  k = 1.9,
): void {
  const p = blob([
    [sh[0] + dz * 2.4 * k, sh[1] - 4.6 * k],
    [sh[0] + dz * 7.2 * k, sh[1] - 3.4 * k],
    [sh[0] + dz * 8.4 * k, sh[1] + 1.2 * k],
    [sh[0] + dz * 6.4 * k, sh[1] + 3.4 * k],
    [sh[0] + dz * 2.6 * k, sh[1] + 2.8 * k],
  ] as Pt[], 0.7)
  paint(ctx, p, ramp, { shadow: 0.4, radius: 5 * k, pivot: sh, rim, line: 0.55, occlusion: 0.22 })
  ctx.save()
  ctx.strokeStyle = ramp.line
  ctx.lineWidth = 0.7
  ctx.stroke(curve([
    [sh[0] + dz * 3.4 * k, sh[1] - 3.4 * k],
    [sh[0] + dz * 6.6 * k, sh[1] - 1.4 * k],
    [sh[0] + dz * 7 * k, sh[1] + 1.8 * k],
  ] as Pt[]))
  // Two gill slits on the plate: detail where the eye already is.
  ctx.lineWidth = 0.6
  for (const o of [0, 1]) {
    ctx.stroke(curve([
      [sh[0] + dz * (4.4 + o * 1.2) * k, sh[1] - 2.2 * k],
      [sh[0] + dz * (4.0 + o * 1.2) * k, sh[1] + 0.6 * k],
    ] as Pt[]))
  }
  ctx.restore()
}

function drawFishLord(s: Surface, t: number, mode: BossMode, phase: Phase): void {
  const ctx = s.ctx
  const cx = s.w * 0.5
  const gy = s.h - 1.5
  const b = LORD_BUILD
  const skin = phase === 1 ? TONE.sharkGrey : mix(TONE.sharkGrey, PAL.seaDeep, 0.25)
  const look: Look = {
    cloth: skin, legs: mix(PAL.sanjiSuit, PAL.night, 0.2), skin,
    boot: mix(PAL.sanjiSuit, PAL.ink, 0.3), sleeve: 0, bulk: 1.2,
  }
  let pose = bossPose(mode, t, 0.8)
  pose = { ...pose, lean: pose.lean + 0.14 }
  if (mode === 'windup') {
    pose = P({ hip: 3, lean: -0.24, legN: [0.55, -0.7], legF: [-0.6, 0.8], armN: [-2.5, 1.6], armF: [-1.2, 1.4], footN: 0.3, footF: -0.3 })
  } else if (mode === 'attack') {
    pose = P({ hip: -1.4, lean: 0.5, legN: [0.95, -0.4], legF: [-0.9, 0.6], armN: [1.55, 0.06], armF: [0.5, 1.0], footN: 0.5, footF: -0.5 })
  }
  const rig = solveRig(cx, gy, b, pose)
  if (mode === 'defeat') dust(ctx, cx, gy, 26, mix(PAL.foam, PAL.steel, 0.4))

  drawFigure(ctx, rig, b, look, pose, {
    back: (c, r) => {
      // Dorsal fin — a blade, kept narrow so the shoulders stay the read.
      const finTip = phase === 1 ? 18 : 11
      const fin = blob([
        [r.sh[0] - 6, r.sh[1] + 4],
        [r.sh[0] - 12, r.sh[1] - finTip * 0.6],
        [r.sh[0] - 9.5, r.sh[1] - finTip],
        [r.sh[0] - 7, r.sh[1] - finTip * 0.5],
        [r.sh[0] - 8.5, r.hip[1] - 4],
      ] as Pt[], 0.6)
      paint(c, fin, C(mix(skin, PAL.night, 0.55)), {
        shadow: 0.48, radius: 8, pivot: [r.sh[0] - 8, r.sh[1] - 4], rim: 0.3, line: 0.55,
      })
      if (phase === 2) {
        c.save()
        c.globalCompositeOperation = 'destination-out'
        c.fill(ellipsePath(r.sh[0] - 10, r.sh[1] - 8, 3.2, 2.8))
        c.restore()
      }
      slabPlate(c, r.sh, -1, far(skin), 0.2)
    },
    overTorso: (c, r) => {
      inside(c, torsoPath(r, b, look.bulk), (cc) => {
        cc.fillStyle = mix(TONE.sharkBelly, skin, 0.45)
        cc.fill(blob([
          [r.sh[0] + 4, r.sh[1] + 5], [r.sh[0] + 12, r.sh[1] + 6], [r.hip[0] + 8, r.hip[1] + 2],
          [r.hip[0] + 3, r.hip[1] + 2],
        ] as Pt[], 0.75))
        cc.strokeStyle = C(skin).line
        cc.lineWidth = 0.9
        cc.stroke(curve([[r.sh[0] - 6, r.sh[1] + 7], [r.sh[0] + 3, r.sh[1] + 9.5], [r.sh[0] + 12, r.sh[1] + 6.5]] as Pt[]))
        cc.stroke(curve([[r.sh[0] + 2.5, r.sh[1] + 9.5], [r.hip[0] + 3, r.hip[1] - 4]] as Pt[]))
        if (phase === 2) {
          scar(cc, [r.sh[0] - 2, r.sh[1] + 4], [r.hip[0] + 5, r.hip[1] - 3], C(PAL.luffyRedDeep).core)
        }
      })
      // Gi belt: narrow, with the knot hanging off the near hip so it reads as
      // cloth rather than as a plate strapped to his waist.
      const belt = C(mix(PAL.cream, PAL.sandDeep, 0.45))
      paint(c, limbPath(r.hip[0] - 7.5, r.hip[1] - 2.4, r.hip[0] + 7.5, r.hip[1] - 1, 1.8, 1.8), belt, {
        shadow: 0.42, radius: 2.2, pivot: r.hip, rim: 0.45, line: 0.5,
      })
      paint(c, blob([
        [r.hip[0] + 2, r.hip[1] - 2.6],
        [r.hip[0] + 5.4, r.hip[1] - 1.4],
        [r.hip[0] + 4.4, r.hip[1] + 4.6],
        [r.hip[0] + 1.4, r.hip[1] + 3],
      ] as Pt[], 0.6), belt, {
        shadow: 0.44, radius: 3, pivot: [r.hip[0] + 3, r.hip[1]], rim: 0.4, line: 0.48,
      })
    },
    front: (c, r) => {
      slabPlate(c, r.sh, 1, C(skin), 0.75)
      if (phase === 2) {
        crack(c, [[r.sh[0] + 7, r.sh[1] - 6], [r.sh[0] + 11, r.sh[1] + 1], [r.sh[0] + 16, r.sh[1] - 2]], 1)
      }
      if (mode === 'attack') {
        // A pressure wave off the fist: the water karate read.
        c.save()
        c.globalAlpha = 0.75
        c.fillStyle = mix(PAL.foam, PAL.seaLight, 0.35)
        c.fill(crescentPath(r.handN[0] - 4, r.handN[1], 16, 4.6, -1.1, 1.1))
        c.globalAlpha = 0.4
        c.fill(crescentPath(r.handN[0] - 6, r.handN[1], 22, 3, -0.9, 0.9))
        c.restore()
      }
      if (mode === 'windup') {
        c.save()
        c.globalAlpha = 0.5
        c.fillStyle = mix(PAL.seaLight, PAL.white, 0.3)
        for (let i = 0; i < 3; i++) {
          c.fill(ellipsePath(r.handN[0] - 4 - i * 3, r.handN[1] + Math.sin(t * 6 + i) * 2, 1.6 - i * 0.3, 1.6 - i * 0.3))
        }
        c.restore()
      }
    },
    head: (c, r) => {
      fishHead(c, r.head[0], r.head[1], b.headR, mode === 'defeat' ? 0.4 : -0.04, {
        skin, belly: TONE.sharkBelly, shark: true,
      })
      if (phase === 2) {
        scar(c, [r.head[0] - b.headR * 0.2, r.head[1] - b.headR * 0.9],
          [r.head[0] + b.headR * 0.6, r.head[1] + b.headR * 0.1], C(PAL.luffyRedDeep).core)
      }
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Boss 3 — the desert warlord
// ─────────────────────────────────────────────────────────────────────────────

const SAND_BUILD: Build = {
  hip: 27, thigh: 13.4, shin: 13, torso: 17, upper: 11, fore: 10.4,
  headR: 6.6, hipW: 6.6, shW: 9.6, legR: 3.2, armR: 2.9, z: 2.4,
}

/**
 * A stream of sand: grains thinning along a cone. Used for the warlord's
 * attacks and, in phase two, for the parts of him that have stopped being solid.
 */
function sandStream(
  ctx: CanvasRenderingContext2D,
  from: Pt,
  angle: number,
  len: number,
  spread: number,
  seed: number,
  color: string,
): void {
  ctx.save()
  const n = 26
  for (let i = 0; i < n; i++) {
    const u = i / n
    const jitter = Math.sin(seed + i * 3.7) * spread * u
    const x = from[0] + Math.cos(angle) * len * u - Math.sin(angle) * jitter
    const y = from[1] + Math.sin(angle) * len * u + Math.cos(angle) * jitter
    const r = 1.5 * (1 - u * 0.55)
    ctx.globalAlpha = 0.85 * (1 - u * 0.8)
    ctx.fillStyle = i % 3 === 0 ? mix(color, PAL.white, 0.3) : color
    ctx.fill(ellipsePath(x, y, r, r * 0.8, angle))
  }
  ctx.restore()
}

function drawSandLord(s: Surface, t: number, mode: BossMode, phase: Phase): void {
  const ctx = s.ctx
  const cx = s.w * 0.5
  const gy = s.h - 1.5
  const b = SAND_BUILD
  const cloth = phase === 1 ? TONE.desertCloth : mix(TONE.desertCloth, PAL.dirtDeep, 0.3)
  const look: Look = {
    cloth, legs: mix(cloth, PAL.ink, 0.35), skin: PAL.skinDeep,
    boot: mix(PAL.dirtDeep, PAL.ink, 0.3), sleeve: 1, glove: mix(PAL.dirtDeep, PAL.ink, 0.15), bulk: 1.05,
  }
  let pose = bossPose(mode, t, 0.95)
  if (mode === 'windup') {
    pose = P({ hip: 2, lean: -0.3, legN: [0.5, -0.6], legF: [-0.6, 0.7], armN: [-2.6, 0.7], armF: [-0.6, 1.0], footN: 0.3, footF: -0.3, drag: -5 })
  } else if (mode === 'attack') {
    pose = P({ hip: -0.8, lean: 0.46, legN: [0.9, -0.3], legF: [-0.85, 0.5], armN: [1.5, 0.05], armF: [0.4, 0.9], footN: 0.45, footF: -0.45, drag: 6 })
  }
  const rig = solveRig(cx, gy, b, pose)
  const sway = Math.sin(t * Math.PI * 2)
  const d = pose.drag
  if (mode === 'defeat') dust(ctx, cx, gy, 24, PAL.sandDeep)

  drawFigure(ctx, rig, b, look, pose, {
    back: (c, r) => {
      // Scarf tails, two lengths, never symmetric.
      for (const [len, w, ph] of [[22, 3.2, 0], [15, 2.2, 1.3]] as Array<[number, number, number]>) {
        paint(c, curveRibbon(
          [r.sh[0] - 2, r.sh[1] - 1],
          [r.sh[0] - 9 - d * 0.5, r.sh[1] - 5 + Math.sin(sway + ph) * 3],
          [r.sh[0] - len - d, r.sh[1] + 2 + Math.sin(sway * 1.3 + ph) * 5],
          w,
        ), C(TONE.desertScarf), {
          shadow: 0.44, radius: 4, pivot: r.sh, rim: 0.4, line: 0.5,
        })
      }
      // Cloak with a torn hem in phase two.
      const hem = tornEdge(
        [r.hip[0] + 7, r.hip[1] + 13],
        [r.hip[0] - 10 - d * 0.8, r.hip[1] + 12],
        phase === 2 ? 8 : 3,
        phase === 2 ? 2.8 : 0.9,
      )
      paint(c, blob([
        [r.sh[0] - 7, r.sh[1] - 3],
        [r.sh[0] + 5, r.sh[1] - 2],
        [r.hip[0] + 7, r.hip[1] + 4],
        ...hem,
        [r.hip[0] - 11 - d, r.hip[1] + 2],
      ] as Pt[], 0.68), C(mix(cloth, PAL.night, 0.3)), {
        shadow: 0.44, radius: 10, pivot: [r.hip[0], r.hip[1] + 4], rim: 0.5, line: 0.6, occlusion: 0.26,
      })
      if (phase === 2) {
        // The warlord is coming apart: the far shoulder is a sand column.
        sandStream(c, [r.sh[0] - 5, r.sh[1] + 4], -1.75, 24, 7, t * 9, PAL.sand)
        sandStream(c, [r.hip[0] - 6, r.hip[1] + 2], -1.5, 16, 5, t * 6 + 3, PAL.sandDeep)
      }
    },
    overTorso: (c, r) => {
      const { px, py } = spine(r)
      paint(c, limbPath(
        r.sh[0] - px * 6, r.sh[1] - py * 6 + 2,
        r.hip[0] + px * 5, r.hip[1] + py * 5 - 1, 2.4, 1.9,
      ), C(TONE.desertScarf), { shadow: 0.42, radius: 3, pivot: r.sh, rim: 0.4, line: 0.5 })
      c.fillStyle = PAL.gold
      c.fill(ellipsePath(r.sh[0] + 2, r.sh[1] + 6, 2.2, 2.6))
    },
    front: (c, r) => {
      // The hook: a curved blade of dark steel where the hand should be.
      const a = Math.atan2(r.handN[1] - r.elbowN[1], r.handN[0] - r.elbowN[0])
      c.save()
      c.translate(r.handN[0], r.handN[1])
      c.rotate(a)
      paint(c, crescentPath(6, 0, 9, 3, -2.5, 1.35), C(TONE.steel), {
        shadow: 0.3, radius: 8, pivot: [5, 0], rim: 0.65, line: 0.6,
      })
      glint(c, 9, -6, 2.8, 0.7, 0.5, PAL.white, 0.6)
      c.restore()
      if (mode === 'attack') {
        sandStream(c, [r.handN[0] + 3, r.handN[1]], -0.12, 30, 9, t * 11, PAL.sand)
        sandStream(c, [r.handN[0] + 3, r.handN[1] + 2], 0.22, 24, 7, t * 7 + 2, PAL.sandDeep)
        sandStream(c, [r.handN[0] + 2, r.handN[1] - 2], -0.4, 20, 6, t * 13 + 4, mix(PAL.sand, PAL.white, 0.3))
      } else if (mode === 'windup') {
        // Sand gathering into the hook: the warning frame.
        for (let i = 0; i < 10; i++) {
          const ang = t * 8 + i * 0.63
          const rr = 12 - (i % 3) * 2.4
          c.save()
          c.globalAlpha = 0.6
          c.fillStyle = i % 2 ? PAL.sand : PAL.sandDeep
          c.fill(ellipsePath(r.handN[0] + Math.cos(ang) * rr, r.handN[1] + Math.sin(ang) * rr * 0.6, 1.4, 1.1))
          c.restore()
        }
      }
    },
    head: (c, r) => {
      const rr = b.headR
      const hx = r.head[0]
      const hy = r.head[1] + (mode === 'defeat' ? 2.5 : 0)
      paint(c, headPath(hx, hy, rr, 0.98), C(PAL.skinDeep, 0.3), {
        shadow: FACE_SHADOW, radius: rr * 1.3, pivot: [hx, hy], rim: 0.45, line: 0.5,
      })
      eyes3q(c, hx, hy + rr * 0.05, rr, { angry: true, color: PAL.gold })
      if (phase === 2) {
        scar(c, [hx + rr * 0.1, hy - rr * 0.55], [hx + rr * 0.9, hy + rr * 0.3], C(PAL.luffyRedDeep).core)
        mouth(c, hx, hy + rr * 0.66, rr, 'grim')
      }
      // Hood — in phase two it is thrown back off the crown.
      const hood = phase === 1
        ? blob([
          [hx - rr * 1.3, hy + rr * 0.5],
          [hx - rr * 1.2, hy - rr * 0.95],
          [hx - rr * 0.1, hy - rr * 1.6],
          [hx + rr * 1.1, hy - rr * 0.75],
          [hx + rr * 0.8, hy - rr * 0.2],
          [hx - rr * 0.2, hy - rr * 0.36],
          [hx - rr * 0.55, hy + rr * 0.85],
        ] as Pt[], 0.8)
        : blob([
          [hx - rr * 1.5, hy + rr * 0.9],
          [hx - rr * 1.7, hy - rr * 0.6],
          [hx - rr * 0.7, hy - rr * 1.2],
          [hx - rr * 0.2, hy - rr * 0.5],
          [hx - rr * 0.5, hy + rr * 0.8],
        ] as Pt[], 0.8)
      paint(c, hood, C(cloth), {
        shadow: 0.42, radius: rr * 1.2, pivot: [hx, hy - rr * 0.4], rim: 0.5, line: 0.52,
      })
      if (phase === 1) {
        paint(c, blob([
          [hx - rr * 0.95, hy + rr * 0.36],
          [hx + rr * 1.0, hy + rr * 0.44],
          [hx + rr * 0.62, hy + rr * 1.16],
          [hx - rr * 0.75, hy + rr * 1.05],
        ] as Pt[], 0.7), C(TONE.desertScarf), {
          shadow: 0.42, radius: rr * 0.7, pivot: [hx, hy + rr * 0.6], rim: 0.4, line: 0.48,
        })
      }
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Boss 4 — the sky tyrant
// ─────────────────────────────────────────────────────────────────────────────

const SKY_BUILD: Build = {
  hip: 30, thigh: 14, shin: 13.6, torso: 19, upper: 12, fore: 11,
  headR: 7, hipW: 7.4, shW: 11, legR: 3.4, armR: 3, z: 2.6,
}

/**
 * A mantle of feathers behind the shoulders — the tyrant's throne, worn.
 *
 * Drawn as separate quills radiating from the shoulder rather than as one
 * membrane: at this size a single slab of grey reads as a folded sail, which is
 * exactly what the first two passes at this looked like.
 */
function mantle(
  ctx: CanvasRenderingContext2D,
  rig: Rig,
  spread: number,
  broken: boolean,
  ramp: Cel,
): void {
  const root: Pt = [rig.sh[0] - 5, rig.sh[1] + 3.5]
  const plan: Array<[number, number, number]> = [
    // [angle from straight up (negative = back), length, width]
    [-1.5, 20, 4.4],
    [-1.15, 26, 5],
    [-0.85, 31, 5.4],
    [-0.55, 29, 5],
    [-0.25, 24, 4.4],
  ]
  // Far side first, pushed toward the ambient and swung further back.
  if (!broken) {
    for (const [a, len, w] of plan) {
      feather(ctx, root[0] - 3, root[1] - 1, a - 0.28 - spread * 0.1, len * 0.82, w * 0.9,
        far(ramp.core), 0.2)
    }
  } else {
    for (let i = 0; i < 3; i++) {
      const x = root[0] - 3 - i * 2.2
      const y = root[1] - 1 - i * 1.4
      paint(ctx, limbPath(x, y + 3, x - 2 - i, y - 7 - i * 3, 1.8, 0.6), far(ramp.core), {
        shadow: 0.44, radius: 2, pivot: [x, y], line: 0.5,
      })
    }
  }
  for (const [a, len, w] of plan) {
    feather(ctx, root[0], root[1], a + spread * 0.12, len, w, ramp, 0.7)
  }
  // Coverts: a short overlapping row hiding where every quill meets the back.
  for (let i = 0; i < 4; i++) {
    const a = -1.35 + i * 0.32
    feather(ctx, root[0] + 0.5, root[1] + 1.5, a, 9 + i * 1.2, 3.6,
      C(mix(ramp.core, PAL.white, 0.22)), 0.5)
  }
}

function drawSkyTyrant(s: Surface, t: number, mode: BossMode, phase: Phase): void {
  const ctx = s.ctx
  const cx = s.w * 0.5
  const gy = s.h - 1.5
  const b = SKY_BUILD
  const robe = phase === 1 ? TONE.cloudRobe : mix(TONE.cloudRobe, PAL.slate, 0.35)
  const look: Look = {
    cloth: robe, legs: mix(robe, PAL.skyMid, 0.3), skin: TONE.skySkin,
    boot: TONE.cloudTrim, sleeve: 1, bulk: 1.08,
  }
  let pose = bossPose(mode, t, 0.9)
  if (mode === 'windup') {
    pose = P({ hip: 1.2, lean: -0.3, legN: [0.4, -0.5], legF: [-0.5, 0.6], armN: [-2.7, 0.4], armF: [-2.2, 0.6], footN: 0.2, footF: -0.2, drag: -4 })
  } else if (mode === 'attack') {
    pose = P({ hip: -1.6, lean: 0.3, legN: [0.7, -0.3], legF: [-0.6, 0.5], armN: [1.3, 0.1], armF: [0.9, 0.5], footN: 0.35, footF: -0.35, drag: 5 })
  }
  const rig = solveRig(cx, gy - (mode === 'defeat' ? 0 : 3), b, pose)
  const flap = Math.sin(t * Math.PI * 2)

  // He never touches the ground: a bank of cloud carries him.
  if (mode !== 'defeat') {
    cloudPuff(ctx, cx + 2, gy - 3, 17, 5, t * 3)
    cloudPuff(ctx, cx - 11, gy - 1.6, 8, 3, t * 3 + 2)
    cloudPuff(ctx, cx + 15, gy - 1.4, 6.5, 2.6, t * 3 + 4)
  } else {
    dust(ctx, cx, gy, 26, mix(PAL.mist, PAL.skyLow, 0.4))
  }

  mantle(ctx, rig, 0.4 + flap * 0.3, phase === 2, C(phase === 1 ? TONE.featherWing : mix(TONE.featherWing, PAL.slate, 0.4)))

  // Halo: a thin ring behind the head. Cracked and guttering in phase two.
  {
    const hx = rig.head[0] + 1
    const hy = rig.head[1] - b.headR * 0.4
    ctx.save()
    ctx.globalAlpha = phase === 1 ? 0.9 : 0.5 + Math.abs(flap) * 0.3
    paint(ctx, crescentPath(hx, hy, b.headR * 1.5, 0.9,
      phase === 1 ? 0 : 0.9, phase === 1 ? Math.PI * 2 : Math.PI * 1.5), C(TONE.cloudTrim), {
      shadow: 0.3, radius: b.headR, pivot: [hx, hy], rim: 0.5, line: 0.4,
    })
    ctx.restore()
  }

  drawFigure(ctx, rig, b, look, pose, {
    overTorso: (c, r) => {
      // Breastplate of beaten gold, cracked in phase two.
      const plate = blob([
        [r.sh[0] - 6, r.sh[1] + 1],
        [r.sh[0] + 6.5, r.sh[1] + 2],
        [r.sh[0] + 5, r.sh[1] + 12],
        [r.sh[0] - 1, r.sh[1] + 15],
        [r.sh[0] - 7, r.sh[1] + 11],
      ] as Pt[], 0.7)
      paint(c, plate, C(TONE.cloudTrim), {
        shadow: 0.36, radius: 8, pivot: r.sh, rim: 0.75, line: 0.55, occlusion: 0.22,
      })
      inside(c, plate, (cc) => {
        cc.strokeStyle = C(TONE.cloudTrim).line
        cc.lineWidth = 0.7
        cc.stroke(curve([[r.sh[0] - 4, r.sh[1] + 6], [r.sh[0] + 1, r.sh[1] + 8], [r.sh[0] + 5.5, r.sh[1] + 5.5]] as Pt[]))
        glint(cc, r.sh[0] - 3, r.sh[1] + 4, 1.4, 3.4, -0.4, PAL.white, 0.4)
      })
      if (phase === 2) {
        crack(c, [[r.sh[0] - 5, r.sh[1] + 3], [r.sh[0] - 1, r.sh[1] + 7], [r.sh[0] + 2, r.sh[1] + 5], [r.sh[0] + 4, r.sh[1] + 11]], 0.9)
      }
      // Gorget and pauldrons.
      for (const dz of [-1, 1]) {
        paint(c, blob([
          [r.sh[0] + dz * 3, r.sh[1] - 3],
          [r.sh[0] + dz * 9.5, r.sh[1] - 1.4],
          [r.sh[0] + dz * 8.5, r.sh[1] + 4],
          [r.sh[0] + dz * 3, r.sh[1] + 3],
        ] as Pt[], 0.7), dz < 0 ? far(TONE.cloudTrim) : C(TONE.cloudTrim), {
          shadow: 0.38, radius: 4, pivot: r.sh, rim: dz > 0 ? 0.7 : 0.2, line: 0.5,
        })
      }
    },
    front: (c, r) => {
      // Staff crowned with a charged orb.
      const a = mode === 'windup' ? -2.4 : mode === 'attack' ? 1.0 : 0.2
      c.save()
      c.translate(r.handN[0], r.handN[1])
      c.rotate(a)
      paint(c, limbPath(0, 12, 0, -20, 1.1, 0.95), C(mix(PAL.wood, PAL.ink, 0.4)), {
        shadow: 0.42, radius: 2, pivot: [0, 0], rim: 0.35, line: 0.5,
      })
      paint(c, crescentPath(0, -22, 4.4, 1.6, 0.7, Math.PI * 2 - 0.7), C(TONE.cloudTrim), {
        shadow: 0.34, radius: 4, pivot: [0, -22], rim: 0.6, line: 0.5,
      })
      const charge = mode === 'windup' ? 1 : mode === 'attack' ? 0.7 : 0.35
      c.save()
      c.globalCompositeOperation = 'lighter'
      c.globalAlpha = 0.55 + charge * 0.4
      c.fillStyle = mix(PAL.magic, PAL.white, 0.3)
      c.fill(ellipsePath(0, -22, 3.4 * charge + 1.6, 3.4 * charge + 1.6))
      c.globalAlpha = 0.4
      c.fill(ellipsePath(0, -22, 6 * charge + 2.6, 6 * charge + 2.6))
      c.restore()
      c.restore()

      if (mode === 'windup') {
        sparks(c, r.handN[0], r.handN[1] - 20, 14, 8, PAL.magic, t * 8)
      } else if (mode === 'attack') {
        const from: Pt = [r.handN[0] + 4, r.handN[1] - 6]
        bolt(c, from, [from[0] + 20, from[1] + 9], t * 12, PAL.magic)
        bolt(c, from, [from[0] + 16, from[1] - 8], t * 12 + 2, PAL.magic)
      }
      if (phase === 2) {
        // Phase two arcs constantly, whatever he is doing.
        bolt(c, [r.sh[0] + 6, r.sh[1] - 2], [r.sh[0] + 12, r.sh[1] + 10], t * 15, PAL.skyLow)
      }
    },
    head: (c, r) => {
      const rr = b.headR
      const hx = r.head[0]
      const hy = r.head[1] + (mode === 'defeat' ? 3 : 0)
      const skin = C(TONE.skySkin, 0.32)
      earAndNeck(c, hx, hy, rr, skin)
      paint(c, headPath(hx, hy, rr, 1.02), skin, {
        shadow: FACE_SHADOW, radius: rr * 1.3, pivot: [hx, hy], rim: 0.55, line: 0.52,
      })
      nose(c, hx, hy + rr * 0.06, rr, skin)
      eyes3q(c, hx, hy + rr * 0.06, rr, { angry: true, glow: mode === 'attack' || phase === 2 ? PAL.magic : undefined })
      mouth(c, hx, hy + rr * 0.6, rr, mode === 'attack' ? 'open' : 'grim')
      // Beard and a winged crown.
      paint(c, blob([
        [hx - rr * 0.5, hy + rr * 0.75],
        [hx + rr * 0.9, hy + rr * 0.55],
        [hx + rr * 0.5, hy + rr * 2.1],
        [hx - rr * 0.4, hy + rr * 1.5],
      ] as Pt[], 0.75), C(mix(PAL.mist, PAL.white, 0.4)), {
        shadow: 0.36, radius: rr, pivot: [hx, hy + rr], rim: 0.5, line: 0.48,
      })
      const crownC = C(phase === 1 ? TONE.cloudTrim : mix(TONE.cloudTrim, PAL.slate, 0.4))
      paint(c, blob([
        [hx - rr * 1.1, hy - rr * 0.8],
        [hx - rr * 0.8, hy - rr * 1.5],
        [hx - rr * 0.2, hy - rr * 1.05],
        [hx + rr * 0.25, hy - rr * 1.75],
        [hx + rr * 0.7, hy - rr * 1.0],
        [hx + rr * 1.1, hy - rr * 1.35],
        [hx + rr * 1.05, hy - rr * 0.62],
      ] as Pt[], 0.5), crownC, {
        shadow: 0.38, radius: rr, pivot: [hx, hy - rr], rim: 0.6, line: 0.5,
      })
      if (phase === 2) crack(c, [[hx + rr * 0.2, hy - rr * 1.7], [hx + rr * 0.5, hy - rr * 1.1]], 0.6)
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Sheets
// ─────────────────────────────────────────────────────────────────────────────

interface BossAnim {
  name: string
  mode: BossMode
  n: number
  dur: number
  loop?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Boss 5 — the oni of Onigashima
// ─────────────────────────────────────────────────────────────────────────────

/** The biggest build in the game: he has to read as the end of the road. */
const ONI_BUILD: Build = {
  hip: 33, thigh: 15.5, shin: 15, torso: 22, upper: 14, fore: 12.6,
  headR: 7.6, hipW: 9, shW: 13, legR: 5, armR: 4.8, z: 3.2,
}

/**
 * The kanabō: a studded iron club, and the whole silhouette's second read.
 *
 * Phase two chips the head of it — the same weapon after a beating rather than
 * a different weapon — so the tell the player has learned still works.
 */
function kanabo(
  ctx: CanvasRenderingContext2D,
  at: Pt,
  angle: number,
  len: number,
  phase: Phase,
): void {
  ctx.save()
  ctx.translate(at[0], at[1])
  ctx.rotate(angle)
  const iron = C(TONE.ironDark)
  // The head of the club is a heavy bar and the grip is thin: a shape that
  // reads as weight even in silhouette. A uniform stick reads as a bone.
  paint(ctx, roundRectPath(-3, -1.7, len * 0.34, 3.4, 1.4), iron, {
    shadow: 0.34, radius: len * 0.3, pivot: [0, 0], rim: 0.4, line: 0.5,
  })
  paint(ctx, roundRectPath(len * 0.26, -3.6, len * 0.78, 7.2, 2.4), iron, {
    shadow: 0.34, radius: len * 0.5, pivot: [len * 0.6, 0], rim: 0.45, line: 0.6, occlusion: 0.25,
  })
  // Studs, in two rows, thinning toward the grip. Dark iron with a lit crown,
  // not bright steel — bright studs eat the club they are sitting on.
  for (let i = 0; i < 6; i++) {
    const x = len * (0.36 + i * 0.11)
    if (phase === 2 && i > 3) continue
    for (const dy of [-3.1, 3.1]) {
      ctx.fillStyle = iron.line
      ctx.fill(ellipsePath(x, dy, 1.5, 1.4))
      ctx.fillStyle = i % 2 ? C(TONE.brass).core : iron.light
      ctx.fill(ellipsePath(x, dy - 0.3, 0.9, 0.8))
    }
  }
  if (phase === 2) {
    // The head is broken off short, with the break left rough.
    ctx.fillStyle = C(TONE.ironDark).line
    ctx.fill(blob([[len * 0.78, -3], [len * 0.94, -1], [len * 0.8, 1.4], [len * 0.96, 3.2], [len * 0.7, 3]] as Pt[], 0.5))
  } else {
    glint(ctx, len * 0.86, -2.2, 2.6, 0.7, -0.3, PAL.white, 0.5)
  }
  ctx.restore()
}

function drawOniLord(s: Surface, t: number, mode: BossMode, phase: Phase): void {
  const ctx = s.ctx
  const cx = s.w * 0.5
  const gy = s.h - 1.5
  const b = ONI_BUILD
  const cloth = phase === 1 ? TONE.oniCloth : mix(TONE.oniCloth, PAL.ink, 0.3)
  const skin = phase === 1 ? TONE.oniSkin : mix(TONE.oniSkin, PAL.luffyRedDeep, 0.3)
  const look: Look = {
    cloth, legs: mix(cloth, PAL.ink, 0.3), skin,
    boot: mix(PAL.dirtDeep, PAL.ink, 0.35), sleeve: 0, bulk: 1.14,
  }
  let pose = bossPose(mode, t, 1)
  if (mode === 'windup') {
    // Club all the way back over the shoulder: the one frame that warns you.
    pose = P({ hip: 2.6, lean: -0.34, legN: [0.45, -0.7], legF: [-0.6, 0.8], armN: [-2.9, 0.5], armF: [-2.0, 0.8], footN: 0.3, footF: -0.3, drag: -6 })
  } else if (mode === 'attack') {
    pose = P({ hip: -1.8, lean: 0.5, legN: [1.0, -0.3], legF: [-0.9, 0.5], armN: [1.5, 0.1], armF: [0.5, 0.9], footN: 0.5, footF: -0.5, drag: 5 })
  }
  const rig = solveRig(cx, gy, b, pose)
  const sway = Math.sin(t * Math.PI * 2)
  const d = pose.drag
  if (mode === 'defeat') dust(ctx, cx, gy, 30, mix(PAL.dusk, PAL.ink, 0.3))

  drawFigure(ctx, rig, b, look, pose, {
    back: (c, r) => {
      // A war banner on a short staff behind the shoulder, torn in phase two.
      const hem = tornEdge(
        [r.sh[0] - 6 - d * 0.6, r.sh[1] + 18],
        [r.sh[0] - 18 - d, r.sh[1] + 14],
        phase === 2 ? 7 : 3,
        phase === 2 ? 3 : 1,
      )
      paint(c, blob([
        [r.sh[0] - 5, r.sh[1] - 6],
        [r.sh[0] - 16 - d * 0.7, r.sh[1] - 3 + sway * 2],
        ...hem,
      ] as Pt[], 0.66), C(mix(PAL.luffyRedDeep, PAL.night, 0.25)), {
        shadow: 0.44, radius: 12, pivot: r.sh, rim: 0.45, line: 0.55, occlusion: 0.24,
      })
      if (phase === 2) {
        // Embers coming off him: the fight is burning down, and so is he.
        sparks(c, r.sh[0] - 4, r.sh[1] + 2, 12, 5, PAL.ember, t * 7)
      }
    },
    overTorso: (c, r) => {
      // A knotted rope belt over a bare chest — the scale of him is the point,
      // so nothing covers the torso.
      const { px, py } = spine(r)
      paint(c, limbPath(
        r.hip[0] - px * 3 - 7, r.hip[1] - py * 3 - 1,
        r.hip[0] + px * 3 + 7, r.hip[1] + py * 3 + 1, 3, 2.6,
      ), C(TONE.strap), { shadow: 0.4, radius: 4, pivot: r.hip, rim: 0.4, line: 0.5 })
      c.fillStyle = C(TONE.brass).core
      c.fill(ellipsePath(r.hip[0] + 1, r.hip[1], 2.8, 2.4))
      if (phase === 2) {
        scar(c, [r.sh[0] - 4, r.sh[1] + 6], [r.sh[0] + 6, r.sh[1] + 16], C(PAL.luffyRedDeep).core)
      }
    },
    front: (c, r) => {
      const a = Math.atan2(r.handN[1] - r.elbowN[1], r.handN[0] - r.elbowN[0])
      kanabo(c, r.handN, a, 28, phase)
      if (mode === 'attack') sparks(c, r.handN[0] + 12, r.handN[1], 9, 6, PAL.ember, t * 12)
    },
    head: (c, r) => {
      const rr = b.headR
      const hx = r.head[0]
      const hy = r.head[1] + (mode === 'defeat' ? 3 : 0)
      paint(c, headPath(hx, hy, rr, 1.02), C(skin, 0.3), {
        shadow: FACE_SHADOW, radius: rr * 1.3, pivot: [hx, hy], rim: 0.45, line: 0.5,
      })
      earAndNeck(c, hx, hy, rr, C(skin, 0.3))
      // Two horns. Phase two takes the near one off at the root, which is the
      // clearest possible statement that the fight has changed.
      // Horns: thick at the root, swept back, ridged. Two thin white spikes
      // read as ears, which is the one thing an oni must not read as.
      const horn = C(mix(TONE.horn, PAL.sandDeep, 0.35))
      const drawHorn = (dx: number, lean: number, len: number) => {
        const bx = hx + dx
        const by = hy - rr * 0.66
        const tipX = bx + lean
        const tipY = by - len
        paint(c, blob([
          [bx - 2.9, by + 0.6],
          [bx + 2.9, by + 0.2],
          [bx + lean * 0.5 + 1.5, by - len * 0.55],
          [tipX, tipY],
          [bx + lean * 0.5 - 1.4, by - len * 0.5],
        ] as Pt[], 0.55), horn, {
          shadow: 0.34, radius: len, pivot: [bx, by - len * 0.3], rim: 0.65, line: 0.55,
        })
        // Two growth ridges, so it reads as horn rather than as a painted cone.
        c.strokeStyle = horn.line
        c.lineWidth = 0.5
        for (const u of [0.3, 0.55]) {
          c.beginPath()
          c.moveTo(bx - 2.4 + lean * u * 0.6, by - len * u)
          c.lineTo(bx + 2.4 + lean * u * 0.6, by - len * u * 0.94)
          c.stroke()
        }
      }
      drawHorn(-rr * 0.58, -3.4, rr * 1.7)
      if (phase === 1) drawHorn(rr * 0.6, 3.4, rr * 1.7)
      else {
        c.fillStyle = horn.line
        c.fill(blob([
          [hx + rr * 0.4, hy - rr * 0.6],
          [hx + rr * 0.9, hy - rr * 0.66],
          [hx + rr * 0.7, hy - rr * 0.95],
        ] as Pt[], 0.4))
      }
      eyes3q(c, hx, hy + rr * 0.05, rr, { angry: true, color: phase === 1 ? PAL.gold : PAL.ember })
      nose(c, hx, hy + rr * 0.3, rr, C(skin, 0.3))
      mouth(c, hx, hy + rr * 0.66, rr, phase === 1 ? 'grim' : 'open')
      // Tusks, under the mouth, so the profile reads oni even in silhouette.
      for (const dx of [-rr * 0.34, rr * 0.36]) {
        c.fillStyle = horn.light
        c.fill(blob([
          [hx + dx - 1.1, hy + rr * 0.58],
          [hx + dx + 1.1, hy + rr * 0.58],
          [hx + dx + 0.2, hy + rr * 0.1],
        ] as Pt[], 0.35))
      }
      if (phase === 2) {
        scar(c, [hx - rr * 0.2, hy - rr * 0.5], [hx + rr * 0.8, hy + rr * 0.35], C(PAL.luffyRedDeep).core)
      }
    },
  })
  if (mode === 'windup') sparks(ctx, rig.handN[0] - 10, rig.handN[1] - 8, 10, 6, PAL.ember, t * 6)
}

/**
 * The state set every boss ships, in both phases. Phase two is prefixed `p2-`,
 * so a boss entity swaps prefix when its health crosses the threshold and keeps
 * asking for the same six names.
 */
const BOSS_ANIMS: BossAnim[] = [
  { name: 'idle', mode: 'idle', n: 4, dur: 0.16 },
  { name: 'walk', mode: 'walk', n: 6, dur: 0.12 },
  { name: 'windup', mode: 'windup', n: 2, dur: 0.2, loop: false },
  { name: 'attack', mode: 'attack', n: 3, dur: 0.1, loop: false },
  { name: 'hurt', mode: 'hurt', n: 1, dur: 0.24, loop: false },
  { name: 'defeat', mode: 'defeat', n: 3, dur: 0.3, loop: false },
]

function bossSheet(p: BossPainter, fw: number, fh: number): SpriteSheet {
  const b = new SheetBuilder({ fw, fh, ox: -fw / 2, oy: -fh, contour: INK, contourWidth: 0.95 })
  for (const phase of [1, 2] as Phase[]) {
    for (const a of BOSS_ANIMS) {
      const frames: FrameSpec[] = Array.from({ length: a.n }, (_, i) => ({
        dur: a.dur,
        draw: (s: Surface) => p(s, a.n === 1 ? 0 : i / a.n, a.mode, phase),
      }))
      b.add(phase === 1 ? a.name : `p2-${a.name}`, frames, { loop: a.loop ?? true })
    }
  }
  return b.build()
}

/** Every boss, and the frame box each one's widest pose needs. */
const BOSSES: Record<string, [BossPainter, number, number]> = {
  clown: [drawClown, 104, 78],
  'fishman-lord': [drawFishLord, 116, 86],
  'desert-lord': [drawSandLord, 116, 86],
  'sky-tyrant': [drawSkyTyrant, 120, 108],
  'oni-lord': [drawOniLord, 152, 110],
}

export type BossKey = keyof typeof BOSSES

/** Build one boss. A level only ever needs the boss standing at the end of it. */
export function buildBossSheet(key: string): SpriteSheet {
  const spec = BOSSES[key]
  if (!spec) throw new Error(`unknown boss sheet: ${key}`)
  return bossSheet(spec[0], spec[1], spec[2])
}

/**
 * Every boss in the campaign.
 *
 * Sizes are the whole point of the fight's staging: the clown is only twice a
 * Marine, the sky tyrant fills half the screen. Each sheet carries twelve
 * animations — six states in two phases — at three times world scale, which is
 * 10-18 MB of texture per boss. Prefer `buildBossSheet(key)` on level entry and
 * keep this whole-roster call for tooling and contact sheets.
 */
export function buildBossSheets(only?: string[]): Record<string, SpriteSheet> {
  const out: Record<string, SpriteSheet> = {}
  for (const key of only ?? Object.keys(BOSSES)) out[key] = buildBossSheet(key)
  return out
}
