import { cel, mix } from '../color'
import {
  blob, crescentPath, curve, ellipsePath, glint, roundRectPath, type Pt,
} from '../ink'
import { celPaint } from './paint'
import { PAL } from '../palette'
import { browShadow } from './head'
import type { Look } from './parts'
import {
  P, bolts, collar, fin, limbFormLite, openPalm, paintPanel, plate, skinCel, spikeHair,
  stretchLimb, waistWrap,
} from './parts'
import type { Build, Palette } from './rig'
import {
  bodyFolds, bodyPoint, drawBody, drawRibbon, hemShape, lag, proportion, ribbon,
} from './rig'

/**
 * Robin, Franky, Brook and Jinbe.
 *
 * The first six crew members are variations on one human figure. These four are
 * not, and that is the point of the file: an archaeologist who is all vertical
 * line, a cyborg who is forearms and shoulders standing on short legs, a
 * skeleton that is nothing but length and angle, and a fishman built like a
 * barrel on posts. Each one gets its own bone lengths and limb masses through
 * `size`, so the difference survives being filled in solid black.
 */

// Costume colours are mixed from the master palette rather than invented, so a
// new crew member still belongs to the same sun as the other six.
const PLUM = mix(PAL.poison, PAL.night, 0.34)
const PLUM_DEEP = mix(PAL.poison, PAL.night, 0.66)
const LILAC = mix(PAL.poison, PAL.cream, 0.45)
const CYBER_BLUE = mix(PAL.seaLight, PAL.foam, 0.18)
const STEEL = mix(PAL.steel, PAL.mist, 0.42)
const STEEL_DARK = mix(PAL.slate, PAL.ink, 0.3)
const BONE = mix(PAL.cream, PAL.mist, 0.22)
const CRAVAT = mix(PAL.danger, PAL.ink, 0.42)
const COAT_INDIGO = mix(PAL.dusk, PAL.night, 0.42)
const FISH_BLUE = mix(PAL.sea, PAL.marineBlue, 0.45)
const KIMONO = mix(PAL.marineNavy, PAL.night, 0.2)
const KIMONO_OUTER = mix(PAL.sea, PAL.marineNavy, 0.42)

// ─────────────────────────────────────────────────────────────────────────────
// Robin — the archaeologist
// ─────────────────────────────────────────────────────────────────────────────

const ROBIN_BUILD: Build = { shoulder: 4.15, chest: 3.9, waist: 2.4, hip: 3.62 }

/**
 * Arms blooming out of thin air.
 *
 * The idea is the whole attack: a petalled burst opens in empty space a body's
 * length away and a forearm grows out of it, palm spread. Three of them, fanned
 * and staggered in time so the group has a rhythm rather than a symmetry, and
 * each one is a real limb with a real thumb — the moment they read as clip-art
 * mittens the trick stops being unsettling and starts being silly.
 */
function bloomArms(ctx: CanvasRenderingContext2D, hand: Pt, angle: number, t: number): void {
  const skin = skinCel('#F2CCA8')
  const petal = cel(LILAC)
  const arms: Array<[number, number, number]> = [
    // distance along the strike, offset across it, phase lead
    [15, -8.5, 0],
    [21, 1.5, 0.18],
    [13, 10.5, 0.34],
  ]
  const ux = Math.cos(angle)
  const uy = Math.sin(angle)
  const nx = -uy
  const ny = ux
  for (const [d, off, lead] of arms) {
    const k = Math.max(0, Math.min(1, (t - lead) / 0.62))
    if (k <= 0.01) continue
    const bx = hand[0] + ux * d + nx * off
    const by = hand[1] + uy * d + ny * off
    // The blossom opens first and stays behind the arm, so the arm grows out of
    // it rather than lying on top of it.
    for (let i = 0; i < 5; i++) {
      const a = angle + Math.PI + i * 1.32 + off * 0.04
      const len = (2.2 + (i % 2) * 0.8) * k
      const px = bx + Math.cos(a) * len * 0.7
      const py = by + Math.sin(a) * len * 0.7
      celPaint(ctx, ellipsePath(px, py, len, len * 0.5, a), petal, {
        shadow: 0.42, radius: len, pivot: [bx, by], rim: 0.4, line: 0.38,
      })
    }
    // The forearm gets the same cel treatment as a real limb — tapered, with a
    // terminator down its length and a wrist — because the moment it reads as a
    // sausage the whole trick becomes silly instead of unsettling.
    const reach = (6.4 + off * 0.05) * k
    const wx = bx + ux * reach
    const wy = by + uy * reach
    stretchLimb(ctx, [bx, by], [wx, wy], 1.75 * k, 1.35 * k, skin, { band: 0.62, line: 0.46 })
    // An open hand, wider than the arm it grows out of.
    openPalm(ctx, [wx + ux * 0.3, wy + uy * 0.3], angle, 1.75 * k, skin, off > 0 ? 1 : -1)
    // Petals shedding: the only motion cue the attack needs.
    ctx.save()
    ctx.globalAlpha = 0.6 * k
    ctx.fillStyle = petal.light
    for (let i = 0; i < 3; i++) {
      const a = angle + 2.2 + i * 1.9
      const fd = 4 + i * 2.4 + k * 5
      ctx.fill(ellipsePath(bx + Math.cos(a) * fd, by + Math.sin(a) * fd, 1.1, 0.5, a))
    }
    ctx.restore()
  }
}

const robin: Look = {
  name: 'Robin',
  build: ROBIN_BUILD,
  // Long legs and a small head: the whole figure is a vertical line, which is
  // the opposite read to Franky standing next to her.
  size: proportion({ thigh: 1.12, shin: 1.14, torso: 0.99, upperArm: 1.06, foreArm: 1.06, headR: 0.94 }),
  face: { eye: 1.02, eyeAspect: 0.88, lash: 1.45, brow: 0.75, blush: 0.5, iris: mix(PAL.seaDeep, PAL.night, 0.3) },
  portrait: { expression: 'smug', turn: 0.3, tilt: 0.04 },
  banner: PLUM,
  pal: P({
    skin: '#F2CCA8', hair: mix(PAL.ink, PAL.night, 0.35), shirt: PLUM_DEEP,
    trousers: mix(PAL.ink, PAL.night, 0.2), boots: mix(PAL.ink, PAL.night, 0.5),
    accent: LILAC, sash: PAL.goldDeep, coat: PLUM, trim: LILAC,
  }),
  arms: (p) => ({ sleeve: 0.96, cloth: p.coat, cuff: p.trim, upperMass: 0.9, foreMass: 0.88 }),
  legs: (p) => ({
    trouser: 1, cloth: p.trousers, boot: p.boots, shaft: 0.62, cuff: p.boots,
    sole: cel(mix(PAL.ink, PAL.night, 0.6)), thighMass: 0.92, shinMass: 0.86, footScale: 0.92,
  }),
  backCloth: (ctx, s, pal) => {
    // The coat back is one long shape that lags the hips — the tallest, quietest
    // silhouette in the cast.
    const left = bodyPoint(s, 0.86, -4.9)
    const right = bodyPoint(s, 0.86, 4.6)
    celPaint(ctx, blob(hemShape(left, right, 21, s, 1.5), 0.85), pal.coat, {
      shadow: 0.54, radius: 6, pivot: bodyPoint(s, 0.3, 0), rim: 0.4, line: 0.5, occlusion: 0.3,
    })
  },
  torso: (ctx, s, pal) => {
    drawBody(ctx, s, pal.shirt, ROBIN_BUILD)
    for (const side of [-1, 1]) {
      const v = (x: number) => x * side
      const p = paintPanel(ctx, s, [
        [1.1, v(1.5)], [1.06, v(4.6)], [0.5, v(4.5)], [-0.04, v(4.2)],
        [-0.02, v(1.4)], [0.5, v(1.0)], [0.86, v(1.2)],
      ], pal.coat, { radius: 3.6, pivot: bodyPoint(s, 0.6, v(2.8)) })
      bodyFolds(ctx, p, s, [
        [[1.02, v(3.9)], [0.6, v(3.0)], [0.06, v(3.4)]],
        [[0.86, v(2.0)], [0.4, v(1.8)]],
      ], pal.coat.deep, 0.44)
    }
    // A standing collar that frames the jaw — poise, in one shape.
    collar(ctx, s, pal.coat, 3.1, 0.3)
    paintPanel(ctx, s, [
      [1.16, -2.6], [1.2, 0], [1.16, 2.6], [0.98, 1.9], [1.0, 0], [0.98, -1.9],
    ], pal.trim, { radius: 2.6, pivot: bodyPoint(s, 1.1, 0), shadow: 0.3, line: 0.42 })
    waistWrap(ctx, s, pal.sash, 0.04, 0.2, 0.35, ROBIN_BUILD)
  },
  overLegs: (ctx, s, pal) => {
    // The front coat panels fall past the knee and swing a frame late.
    for (const side of [-1, 1]) {
      const root = bodyPoint(s, 0.02, side * 3.4)
      drawRibbon(
        ctx,
        ribbon(root, Math.PI / 2 - s.drag * 0.06, 13 + Math.abs(s.drag) * 0.4, 2.4, 1.5,
          -0.12 - s.drag * 0.12 + side * 0.1, 0.06, s.flutter + side * 0.3, 4),
        pal.coat,
        root,
        6,
      )
    }
  },
  hairBack: (cx, cy, r, s) => [
    [cx - r * 1.16, cy - r * 0.52],
    lag([cx - r * 0.66, cy - r * 1.22], s, 0.35),
    lag([cx + r * 0.6, cy - r * 1.18], s, 0.35),
    [cx + r * 1.14, cy - r * 0.44],
    lag([cx + r * 1.2, cy + r * 1.3], s, 1.4),
    lag([cx + r * 0.68, cy + r * 2.5], s, 2.4),
    lag([cx - r * 0.44, cy + r * 2.6], s, 2.8),
    lag([cx - r * 1.2, cy + r * 1.2], s, 1.8),
  ] as Pt[],
  hairFront: (cx, cy, r, s) => [
    // A centre parting, so the fringe is two shapes rather than a helmet.
    [
      [cx - r * 1.08, cy - r * 0.5],
      lag([cx - r * 0.82, cy - r * 1.18], s, 0.4),
      lag([cx - r * 0.02, cy - r * 1.22], s, 0.34),
      [cx - r * 0.16, cy - r * 0.5],
      [cx - r * 0.5, cy - r * 0.3],
    ] as Pt[],
    [
      [cx + r * 0.02, cy - r * 1.2],
      lag([cx + r * 0.92, cy - r * 0.96], s, 0.32),
      [cx + r * 1.02, cy - r * 0.2],
      [cx + r * 0.5, cy - r * 0.72],
      [cx + r * 0.06, cy - r * 0.66],
    ] as Pt[],
    // One long lock in front of the shoulder, lagging hard.
    [
      [cx - r * 1.0, cy - r * 0.6],
      [cx - r * 1.26, cy - r * 0.1],
      lag([cx - r * 1.16, cy + r * 1.9], s, 2.0),
      lag([cx - r * 0.88, cy + r * 1.8], s, 2.0),
      [cx - r * 0.84, cy - r * 0.3],
    ] as Pt[],
  ],
  attackStyle: 'bloom',
  weapon: bloomArms,
}

// ─────────────────────────────────────────────────────────────────────────────
// Franky — the shipwright
// ─────────────────────────────────────────────────────────────────────────────

const FRANKY_BUILD: Build = { shoulder: 6.45, chest: 5.7, waist: 4.2, hip: 3.7 }

/** Plating over a forearm: one panel, a seam and three bolts. */
function armourArm(ctx: CanvasRenderingContext2D, joints: [Pt, Pt, Pt], _scale: number): void {
  const steel = cel(STEEL)
  const [root, elbow, wrist] = joints
  const ang = Math.atan2(wrist[1] - elbow[1], wrist[0] - elbow[0])
  const ux = Math.cos(ang)
  const uy = Math.sin(ang)
  const nx = -uy
  const ny = ux
  const Q = (x: number, y: number): Pt => [elbow[0] + ux * x + nx * y, elbow[1] + uy * x + ny * y]
  const len = Math.hypot(wrist[0] - elbow[0], wrist[1] - elbow[1])
  plate(ctx, [
    Q(-0.2, -2.9), Q(len * 0.5, -3.3), Q(len + 0.5, -2.4),
    Q(len + 0.6, 2.3), Q(len * 0.5, 3.2), Q(-0.2, 2.8),
  ] as Pt[], steel, elbow, 3.1, [Q(0.6, -1.0), Q(len * 0.6, -0.7), Q(len + 0.3, -1.2)] as Pt[])
  bolts(ctx, Q(1.0, 1.9), Q(len * 0.86, 2.0), 3, 0.46, cel(STEEL_DARK))
  // A pauldron capping the deltoid, so the shoulder reads as hardware too.
  const sang = Math.atan2(elbow[1] - root[1], elbow[0] - root[0])
  const sx = Math.cos(sang)
  const sy = Math.sin(sang)
  plate(ctx, [
    [root[0] - sy * 3.0 - sx * 1.3, root[1] + sx * 3.0 - sy * 1.3],
    [root[0] - sy * 3.3 + sx * 2.2, root[1] + sx * 3.3 + sy * 2.2],
    [root[0] + sy * 2.9 + sx * 2.5, root[1] - sx * 2.9 + sy * 2.5],
    [root[0] + sy * 3.2 - sx * 1.2, root[1] - sx * 3.2 - sy * 1.2],
  ] as Pt[], steel, root, 3.1)
}

/** A cyborg fist: the punch lands as machinery, with exhaust and a shock ring. */
function mechaFist(ctx: CanvasRenderingContext2D, hand: Pt, angle: number, t: number): void {
  const steel = cel(STEEL)
  const dark = cel(STEEL_DARK)
  const c = Math.cos(angle)
  const sn = Math.sin(angle)
  const reach = 4 + t * 9
  const tip: Pt = [hand[0] + c * reach, hand[1] + sn * reach]
  // Exhaust behind the fist — the reason it hits that hard.
  if (t > 0) {
    // Exhaust, not smoke: a bright cone thrown backward out of the shoulder,
    // drawn additively so it reads as thrust rather than as dirt on the sprite.
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = (0.32 - i * 0.09) * t
      ctx.fillStyle = i === 0 ? PAL.foam : CYBER_BLUE
      const d = -4 - i * 5
      ctx.fill(ellipsePath(hand[0] + c * d, hand[1] + sn * d, 4 + i * 2.4, 1.8 + i * 1.1, angle))
    }
    ctx.restore()
  }
  celPaint(ctx, limbFormLite(hand, tip, 2.9), steel, {
    shadow: 0.48, radius: 3, pivot: hand, rim: 0.8, line: 0.48,
  })
  const fist = blob([
    [tip[0] - c * 1.4 - sn * 4.0, tip[1] - sn * 1.4 + c * 4.0],
    [tip[0] + c * 3.4 - sn * 3.4, tip[1] + sn * 3.4 + c * 3.4],
    [tip[0] + c * 4.6, tip[1] + sn * 4.6],
    [tip[0] + c * 3.4 + sn * 3.4, tip[1] + sn * 3.4 - c * 3.4],
    [tip[0] - c * 1.4 + sn * 4.0, tip[1] - sn * 1.4 - c * 4.0],
  ] as Pt[], 0.7)
  celPaint(ctx, fist, steel, { shadow: 0.46, radius: 4.4, pivot: tip, rim: 0.9, line: 0.52, occlusion: 0.26 })
  ctx.save()
  ctx.clip(fist)
  ctx.strokeStyle = dark.core
  ctx.lineWidth = 0.5
  for (const off of [-2.0, 0.4, 2.6]) {
    ctx.stroke(curve([
      [tip[0] + c * 1.0 - sn * off, tip[1] + sn * 1.0 + c * off],
      [tip[0] + c * 4.2 - sn * off, tip[1] + sn * 4.2 + c * off],
    ] as Pt[]))
  }
  ctx.restore()
  bolts(ctx, [tip[0] - c * 0.4 - sn * 2.6, tip[1] - sn * 0.4 + c * 2.6],
    [tip[0] - c * 0.4 + sn * 2.6, tip[1] - sn * 0.4 - c * 2.6], 3, 0.6, dark)
  if (t > 0.4) {
    // The shock ring, ahead of the knuckles.
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.5 * t
    ctx.fillStyle = CYBER_BLUE
    ctx.fill(crescentPath(tip[0] + c * 4, tip[1] + sn * 4, 5 + t * 4, 1.8, angle - 1.5, angle + 1.5))
    ctx.restore()
  }
}

const franky: Look = {
  name: 'Franky',
  build: FRANKY_BUILD,
  // Short legs, a long heavy torso, enormous forearms rooted far out on a wide
  // shoulder line. Filled black he is a wedge standing on stumps.
  size: proportion({
    thigh: 0.8, shin: 0.78, torso: 1.08, upperArm: 1.1, foreArm: 1.14,
    headR: 0.98, armRoot: 1.42, legRoot: 0.92,
  }),
  face: { eye: 0.9, eyeAspect: 0.8, brow: 1.5, jaw: 1.18, blush: 0.3, iris: mix(PAL.seaLight, PAL.ink, 0.4) },
  portrait: { expression: 'shout', turn: 0.3, tilt: -0.06 },
  banner: CYBER_BLUE,
  pal: P({
    skin: '#E8B58C', hair: CYBER_BLUE, shirt: mix(PAL.seaLight, PAL.cream, 0.35),
    trousers: mix(PAL.marineNavy, PAL.night, 0.25), boots: STEEL_DARK,
    accent: CYBER_BLUE, sash: PAL.goldDeep, coat: mix(PAL.seaLight, PAL.cream, 0.35), trim: STEEL,
  }),
  arms: (p) => ({
    sleeve: 0, cloth: p.shirt, upperMass: 1.45, foreMass: 2.05, handScale: 1.35, grip: 1,
    deco: armourArm,
  }),
  legs: (p) => ({
    trouser: 0.34, cloth: p.trousers, bare: p.skin, boot: p.boots, shaft: 0.42, cuff: cel(STEEL),
    sole: cel(STEEL_DARK), thighMass: 1.16, shinMass: 1.02, footScale: 1.18,
  }),
  torso: (ctx, s, pal) => {
    drawBody(ctx, s, pal.skin, FRANKY_BUILD)
    // The chest plate: the single most important shape on him. Hard terminator,
    // bright rim, a seam down the middle and four bolts holding it to the ribs.
    const cp = plate(ctx, [
      bodyPoint(s, 0.94, -4.3), bodyPoint(s, 0.94, 4.3),
      bodyPoint(s, 0.62, 4.9), bodyPoint(s, 0.34, 3.4),
      bodyPoint(s, 0.34, -3.4), bodyPoint(s, 0.62, -4.9),
    ] as Pt[], cel(STEEL), bodyPoint(s, 0.66, 0), 4.8, [
      bodyPoint(s, 0.92, 0), bodyPoint(s, 0.6, 0.3), bodyPoint(s, 0.36, 0),
    ] as Pt[])
    ctx.save()
    ctx.clip(cp)
    // A vent grille, off to one side so the plate is not symmetrical.
    ctx.globalAlpha = 0.55
    ctx.strokeStyle = cel(STEEL_DARK).core
    ctx.lineWidth = 0.5
    for (let i = 0; i < 3; i++) {
      ctx.stroke(curve([bodyPoint(s, 0.82 - i * 0.1, 1.5), bodyPoint(s, 0.8 - i * 0.1, 3.9)] as Pt[]))
    }
    ctx.restore()
    bolts(ctx, bodyPoint(s, 0.9, -3.6), bodyPoint(s, 0.9, 3.6), 2, 0.55, cel(STEEL_DARK))
    bolts(ctx, bodyPoint(s, 0.42, -2.8), bodyPoint(s, 0.42, 2.8), 2, 0.5, cel(STEEL_DARK))
    // The open shirt: two loud panels flung wide by the shoulders.
    for (const side of [-1, 1]) {
      const v = (x: number) => x * side
      const p = paintPanel(ctx, s, [
        [1.08, v(3.0)], [1.04, v(6.7)], [0.5, v(7.0)], [0.0, v(6.0)],
        [0.04, v(3.6)], [0.5, v(4.2)], [0.84, v(3.4)],
      ], pal.shirt, { radius: 4.0, pivot: bodyPoint(s, 0.6, v(5)) })
      bodyFolds(ctx, p, s, [
        [[1.0, v(5.8)], [0.56, v(5.0)], [0.08, v(5.2)]],
        [[0.84, v(4.0)], [0.4, v(4.4)]],
      ], pal.shirt.deep, 0.45)
    }
    // A heavy belt with a square buckle, low on the waist.
    waistWrap(ctx, s, cel(STEEL_DARK), -0.12, 0.12, 0.9, FRANKY_BUILD)
    celPaint(ctx, roundRectPath(bodyPoint(s, 0.0, -1.5)[0], bodyPoint(s, 0.0, -1.5)[1] - 0.4, 3.0, 2.2, 0.4),
      cel(PAL.gold), { shadow: 0.42, radius: 1.6, pivot: bodyPoint(s, 0, 0), rim: 0.5, line: 0.45 })
  },
  hairBack: (cx, cy, r, s) => spikeHair(cx - s.drag * 0.3, cy - r * 0.34, r * 1.02, 8, 2.0, 0.2, 3.7),
  hairFront: (cx, cy, r, s) => [
    // A swept crest that overhangs the brow — height where his legs are short.
    [
      [cx - r * 1.0, cy - r * 0.5],
      lag([cx - r * 0.86, cy - r * 1.34], s, 0.5),
      lag([cx + r * 0.16, cy - r * 1.66], s, 0.45),
      lag([cx + r * 1.06, cy - r * 1.12], s, 0.4),
      [cx + r * 0.92, cy - r * 0.7],
      [cx + r * 0.18, cy - r * 0.98],
      [cx - r * 0.54, cy - r * 0.84],
    ] as Pt[],
  ],
  headgear: (ctx, cx, cy, r, s) => {
    // Wraparound shades. They are a dark bar across the eyes: the most legible
    // mark on the whole character at sprite size.
    const glass = cel(mix(PAL.ink, PAL.night, 0.4))
    const y = cy - r * 0.02 + s.lift * 0.06
    const shade = blob([
      [cx - r * 1.04, y - r * 0.42],
      [cx - r * 0.1, y - r * 0.52],
      [cx + r * 1.02, y - r * 0.34],
      [cx + r * 1.06, y + r * 0.24],
      [cx + r * 0.2, y + r * 0.3],
      [cx - r * 1.0, y + r * 0.16],
    ] as Pt[], 0.65)
    celPaint(ctx, shade, glass, { shadow: 0.4, radius: r, pivot: [cx, y], rim: 0.5, line: 0.5 })
    glint(ctx, cx + r * 0.45, y - r * 0.2, r * 0.4, r * 0.12, -0.35, PAL.foam, 0.75)
    glint(ctx, cx - r * 0.55, y - r * 0.16, r * 0.2, r * 0.1, -0.35, PAL.foam, 0.5)
    browShadow(ctx, cx, cy, r, 0.5, 0.14)
  },
  attackStyle: 'mecha',
  weapon: mechaFist,
}

// ─────────────────────────────────────────────────────────────────────────────
// Brook — the musician
// ─────────────────────────────────────────────────────────────────────────────

const BROOK_BUILD: Build = { shoulder: 3.75, chest: 2.95, waist: 2.5, hip: 2.7 }

/** The cane sword: a thin blade, a fast thin arc, and two notes in the air. */
function caneSword(ctx: CanvasRenderingContext2D, hand: Pt, angle: number, t: number): void {
  const steel = cel(mix(PAL.mist, PAL.white, 0.5))
  const len = 22
  const c = Math.cos(angle)
  const sn = Math.sin(angle)
  const tip: Pt = [hand[0] + c * len, hand[1] + sn * len]
  if (t > 0) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.34 * t
    ctx.fillStyle = PAL.foam
    ctx.fill(crescentPath(hand[0], hand[1], len * 0.95, 1.5, angle - 1.9, angle + 0.3))
    ctx.globalAlpha = 0.6 * t
    ctx.fillStyle = PAL.white
    ctx.fill(crescentPath(hand[0], hand[1], len * 0.95, 0.55, angle - 1.5, angle + 0.15))
    ctx.restore()
  }
  celPaint(ctx, blob([
    [hand[0] - sn * 0.62, hand[1] + c * 0.62],
    [tip[0] - sn * 0.24, tip[1] + c * 0.24],
    [tip[0] + c * 1.4, tip[1] + sn * 1.4],
    [hand[0] + sn * 0.62, hand[1] - c * 0.62],
  ] as Pt[], 0.25), steel, { shadow: 0.24, radius: 1.4, pivot: hand, rim: 0.8, line: 0.4 })
  // The cane's grip and its little collar, back along the hand.
  celPaint(ctx, limbFormLite(
    [hand[0] - c * 0.4, hand[1] - sn * 0.4],
    [hand[0] - c * 4.2, hand[1] - sn * 4.2],
    0.72,
  ), cel(mix(PAL.ink, PAL.night, 0.3)), { shadow: 0.42, radius: 1, pivot: hand, line: 0.4 })
  celPaint(ctx, ellipsePath(hand[0], hand[1], 1.0, 0.5, angle), cel(PAL.goldDeep), {
    shadow: 0.4, radius: 1, pivot: hand, line: 0.36,
  })
  if (t > 0.4) {
    // Two notes riding the arc — he is a musician before he is a swordsman.
    ctx.save()
    ctx.globalAlpha = 0.75 * t
    ctx.fillStyle = PAL.cream
    ctx.strokeStyle = PAL.cream
    ctx.lineWidth = 0.5
    for (const [d, off] of [[0.55, -6], [0.8, 5]] as Array<[number, number]>) {
      const nxp = hand[0] + c * len * d - sn * off
      const nyp = hand[1] + sn * len * d + c * off
      ctx.fill(ellipsePath(nxp, nyp, 1.15, 0.85, -0.4))
      ctx.stroke(curve([[nxp + 1.05, nyp - 0.3], [nxp + 1.25, nyp - 3.4]] as Pt[]))
    }
    ctx.restore()
  }
}

const brook: Look = {
  name: 'Brook',
  build: BROOK_BUILD,
  // Everything long, everything thin. The masses on his limbs are barely half
  // the cast's, so the ink line does almost all the work.
  size: proportion({
    thigh: 1.2, shin: 1.2, torso: 1.06, neck: 1.6, upperArm: 1.32, foreArm: 1.34,
    headR: 0.86, armRoot: 0.82, legRoot: 0.78,
  }),
  face: { skull: true, jaw: 0.92 },
  portrait: { expression: 'joy', turn: 0.28, tilt: 0.06 },
  banner: COAT_INDIGO,
  pal: P({
    // The afro has to separate from the coat: same family, two clear values.
    skin: BONE, hair: mix(PAL.ink, PAL.dusk, 0.16), shirt: mix(PAL.cream, PAL.mist, 0.3),
    trousers: mix(PAL.ink, PAL.night, 0.45), boots: mix(PAL.ink, PAL.night, 0.62),
    accent: CRAVAT, sash: PAL.goldDeep, coat: COAT_INDIGO, trim: PAL.goldDeep,
  }),
  arms: (p) => ({
    sleeve: 0.92, cloth: p.coat, cuff: p.shirt, glove: p.shirt,
    upperMass: 0.52, foreMass: 0.5, handScale: 0.86,
  }),
  legs: (p) => ({
    trouser: 1, cloth: p.trousers, boot: p.boots, shaft: 0.3, cuff: null, sole: p.boots,
    thighMass: 0.5, shinMass: 0.5, footScale: 0.92,
  }),
  backCloth: (ctx, s, pal) => {
    const left = bodyPoint(s, 0.9, -3.9)
    const right = bodyPoint(s, 0.9, 3.6)
    celPaint(ctx, blob(hemShape(left, right, 19, s, 1.7), 0.85), pal.coat, {
      shadow: 0.54, radius: 5, pivot: bodyPoint(s, 0.3, 0), rim: 0.4, line: 0.5, occlusion: 0.3,
    })
  },
  torso: (ctx, s, pal) => {
    drawBody(ctx, s, pal.shirt, BROOK_BUILD)
    // The frock coat: buttoned high, narrow, with long lapels.
    for (const side of [-1, 1]) {
      const v = (x: number) => x * side
      const p = paintPanel(ctx, s, [
        [1.1, v(0.9)], [1.06, v(4.0)], [0.5, v(4.0)], [-0.06, v(3.7)],
        [-0.04, v(0.4)], [0.5, v(0.5)], [0.88, v(0.7)],
      ], pal.coat, { radius: 3.2, pivot: bodyPoint(s, 0.6, v(2.4)) })
      paintPanel(ctx, s, [
        [1.12, v(1.0)], [1.06, v(3.6)], [0.62, v(2.2)], [0.8, v(1.1)],
      ], pal.coat, { radius: 2.2, pivot: bodyPoint(s, 0.92, v(2.2)), shadow: 0.22, line: 0.42 })
      bodyFolds(ctx, p, s, [[[1.0, v(3.4)], [0.56, v(2.8)], [0.04, v(3.0)]]], pal.coat.deep, 0.5)
    }
    collar(ctx, s, pal.coat, 2.4, 0.26)
    // The cravat: the one warm note on a cold figure, and it hangs and swings.
    const knot = bodyPoint(s, 1.02, 0.3)
    celPaint(ctx, blob([
      [knot[0] - 1.3, knot[1] - 0.5], [knot[0] + 1.3, knot[1] - 0.6],
      [knot[0] + 1.5, knot[1] + 1.0], [knot[0] - 1.4, knot[1] + 1.1],
    ] as Pt[], 0.6), pal.accent, {
      shadow: 0.4, radius: 1.5, pivot: knot, rim: 0.45, line: 0.44,
    })
    drawRibbon(
      ctx,
      ribbon([knot[0], knot[1] + 0.9], Math.PI / 2 - s.drag * 0.1, 5.4, 1.25, 0.7,
        0.2 - s.drag * 0.16, 0.14, s.flutter, 4),
      pal.accent,
      knot,
      3,
    )
    // Gold buttons down the closure.
    bolts(ctx, bodyPoint(s, 0.86, 0.9), bodyPoint(s, 0.16, 1.0), 3, 0.42, cel(PAL.gold))
  },
  overLegs: (ctx, s, pal) => {
    for (const side of [-1, 1]) {
      const root = bodyPoint(s, -0.02, side * 2.9)
      drawRibbon(
        ctx,
        ribbon(root, Math.PI / 2 - s.drag * 0.08, 15 + Math.abs(s.drag) * 0.5, 2.1, 1.2,
          -0.16 - s.drag * 0.14 + side * 0.12, 0.07, s.flutter + side * 0.34, 4),
        pal.coat,
        root,
        7,
      )
    }
  },
  hairBack: (cx, cy, r, s) => {
    // The afro: half again the width of the skull and held a frame behind the
    // head. It is the whole silhouette read, so it is deliberately lumpy — a
    // smooth ball reads as a helmet — but it has to stay inside the frame: at
    // its first size the top of it was cropped off every sheet.
    const hx = cx - s.drag * 0.6
    const hy = cy - r * 0.92 + s.lift * 0.4
    const pts: Pt[] = []
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 - 0.4
      const wob = 1 + Math.sin(i * 2.7) * 0.15 + Math.sin(i * 5.1) * 0.08
      pts.push(lag([hx + Math.cos(a) * r * 1.88 * wob, hy + Math.sin(a) * r * 1.4 * wob], s, 0.42 + Math.max(0, -Math.sin(a)) * 0.4))
    }
    return pts
  },
  hairFront: (cx, cy, r, s) => [
    // Two locks falling past the jaw, which is what keeps the afro attached to
    // the head instead of hovering over it.
    [
      [cx - r * 1.0, cy - r * 0.9],
      lag([cx - r * 1.5, cy - r * 0.1], s, 0.9),
      lag([cx - r * 1.2, cy + r * 1.5], s, 1.5),
      [cx - r * 0.82, cy - r * 0.3],
    ] as Pt[],
    [
      [cx + r * 0.9, cy - r * 0.94],
      lag([cx + r * 1.42, cy - r * 0.2], s, 0.85),
      lag([cx + r * 1.12, cy + r * 1.3], s, 1.4),
      [cx + r * 0.76, cy - r * 0.36],
    ] as Pt[],
  ],
  props: (ctx, s, phase) => {
    if (phase !== 'behind') return
    // The cane scabbard, slung on the far hip: a long thin diagonal that says
    // "sword" without a blade showing.
    const hip = bodyPoint(s, 0.16, -2.6)
    const a = 2.66
    const tip: Pt = [hip[0] + Math.cos(a) * 15, hip[1] + Math.sin(a) * 15]
    celPaint(ctx, limbFormLite(hip, tip, 0.72), cel(mix(PAL.ink, PAL.dusk, 0.3)), {
      shadow: 0.5, radius: 1, pivot: hip, rim: 0.4, line: 0.42,
    })
    celPaint(ctx, limbFormLite(hip, [hip[0] - Math.cos(a) * 4.6, hip[1] - Math.sin(a) * 4.6], 0.66),
      cel(PAL.goldDeep), { shadow: 0.44, radius: 0.9, pivot: hip, line: 0.4 })
  },
  attackStyle: 'slash',
  weapon: caneSword,
}

// ─────────────────────────────────────────────────────────────────────────────
// Jinbe — the helmsman
// ─────────────────────────────────────────────────────────────────────────────

const JINBE_BUILD: Build = { shoulder: 6.2, chest: 6.0, waist: 5.2, hip: 4.8 }

/** A hanging kimono sleeve — the bag of cloth that swings under the forearm. */
function kimonoSleeve(c: Palette['coat']) {
  return (ctx: CanvasRenderingContext2D, joints: [Pt, Pt, Pt], _scale: number) => {
    const [, elbow, wrist] = joints
    const ang = Math.atan2(wrist[1] - elbow[1], wrist[0] - elbow[0])
    const ux = Math.cos(ang)
    const uy = Math.sin(ang)
    const nx = -uy
    const ny = ux
    const Q = (x: number, y: number): Pt => [elbow[0] + ux * x + nx * y, elbow[1] + uy * x + ny * y]
    // Hung from the arm, dropped by gravity, dragged by the pose: the sleeve is
    // where a fishman's bulk becomes cloth.
    const drop = 7.5
    celPaint(ctx, blob([
      Q(-2.2, -2.6), Q(3.4, -2.6),
      [Q(3.4, 0)[0], Q(3.4, 0)[1] + drop * 0.8],
      [Q(0.4, 0)[0], Q(0.4, 0)[1] + drop],
      [Q(-2.6, 0)[0], Q(-2.6, 0)[1] + drop * 0.7],
    ] as Pt[], 0.8), c, {
      shadow: 0.5, radius: 4, pivot: elbow, rim: 0.45, line: 0.48, occlusion: 0.24,
    })
  }
}

/** A palm strike that reads as water pressure: rings, a disc, and spray. */
function palmWater(ctx: CanvasRenderingContext2D, hand: Pt, angle: number, t: number): void {
  const c = Math.cos(angle)
  const sn = Math.sin(angle)
  const water = cel(PAL.seaLight)
  if (t <= 0) return
  const d = 5 + t * 7
  const cx = hand[0] + c * d
  const cy = hand[1] + sn * d
  // The compressed core: a lens of water, not a ball, so it reads as pressure
  // travelling in one direction.
  celPaint(ctx, ellipsePath(cx, cy, 4 + t * 4.5, 6.5 + t * 5, angle), water, {
    shadow: 0.34, radius: 5, pivot: [cx, cy], rim: 0.7, line: 0.44,
  })
  ctx.save()
  ctx.globalAlpha = 0.55
  ctx.fillStyle = PAL.foam
  ctx.fill(ellipsePath(cx - c * 1.4, cy - sn * 1.4, 1.8 + t * 1.6, 3.6 + t * 2, angle))
  ctx.restore()
  // Three rings, thinning outward — the shock in the water behind the strike.
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 3; i++) {
    ctx.globalAlpha = (0.5 - i * 0.13) * t
    ctx.fillStyle = i === 0 ? PAL.foam : PAL.seaLight
    ctx.fill(crescentPath(hand[0], hand[1], 8 + i * 5 + t * 6, 1.6 - i * 0.35, angle - 1.1, angle + 1.1))
  }
  ctx.restore()
  // Spray flung off the leading edge.
  ctx.save()
  ctx.globalAlpha = 0.75 * t
  ctx.fillStyle = PAL.foam
  for (let i = 0; i < 5; i++) {
    const a = angle + (i - 2) * 0.42
    const r = 11 + t * 8 + (i % 2) * 4
    ctx.fill(ellipsePath(hand[0] + Math.cos(a) * r, hand[1] + Math.sin(a) * r, 1.5, 0.8, a))
  }
  ctx.restore()
}

const jinbe: Look = {
  name: 'Jinbe',
  build: JINBE_BUILD,
  // Wide at the shoulders and barely narrower at the waist: a barrel, rooted on
  // legs set far apart.
  size: proportion({
    thigh: 1.0, shin: 0.96, torso: 1.02, upperArm: 1.06, foreArm: 1.0,
    headR: 1.08, armRoot: 1.3, legRoot: 1.2,
  }),
  face: {
    eye: 0.94, eyeAspect: 0.82, brow: 1.45, jaw: 1.22, tusk: 0.26, gills: true,
    blush: 0.2, nose: 0.7, iris: mix(PAL.gold, PAL.bloodOrange, 0.4),
  },
  portrait: { expression: 'determined', turn: 0.3, tilt: -0.02 },
  banner: FISH_BLUE,
  pal: P({
    skin: FISH_BLUE, hair: mix(PAL.ink, PAL.marineNavy, 0.3), shirt: KIMONO,
    trousers: mix(PAL.marineNavy, PAL.night, 0.35), boots: mix(PAL.woodDeep, PAL.ink, 0.3),
    accent: PAL.gold, sash: PAL.goldDeep, coat: KIMONO_OUTER, trim: PAL.cream,
  }),
  arms: (p) => ({
    sleeve: 0.55, cloth: p.coat, cuff: null, upperMass: 1.32, foreMass: 1.22, handScale: 1.15,
    deco: kimonoSleeve(p.coat),
  }),
  legs: (p) => ({
    trouser: 0.72, cloth: p.trousers, bare: p.skin, boot: p.boots, sole: cel(PAL.wood),
    thighMass: 1.3, shinMass: 1.2, footScale: 1.12,
  }),
  torso: (ctx, s, pal) => {
    drawBody(ctx, s, pal.shirt, JINBE_BUILD)
    // The kimono: two crossed panels, the near one lapping over the far one, and
    // a deep V that leaves the chest showing.
    for (const side of [-1, 1]) {
      const v = (x: number) => x * side
      const p = paintPanel(ctx, s, [
        [1.06, v(1.2)], [1.04, v(6.2)], [0.5, v(6.6)], [-0.06, v(6.0)],
        [-0.04, v(0.2)], [0.42, v(1.0)], [0.8, v(0.9)],
      ], pal.coat, { radius: 4.4, pivot: bodyPoint(s, 0.55, v(3.6)) })
      // The pattern: a scatter of scale arcs, uneven on purpose. A regular grid
      // of them would read as a tiled texture from three tiles away.
      ctx.save()
      ctx.clip(p)
      ctx.globalAlpha = 0.5
      ctx.strokeStyle = pal.trim.core
      ctx.lineWidth = 0.42
      const rows: Array<[number, number]> = [[0.86, 3.0], [0.66, 4.6], [0.48, 2.6], [0.28, 4.9], [0.12, 3.4]]
      for (const [u, vv] of rows) {
        const a = bodyPoint(s, u, v(vv - 1.1))
        const b = bodyPoint(s, u + 0.07, v(vv))
        const cc = bodyPoint(s, u, v(vv + 1.1))
        ctx.stroke(curve([a, b, cc] as Pt[]))
      }
      ctx.restore()
      bodyFolds(ctx, p, s, [
        [[1.0, v(5.2)], [0.5, v(4.6)], [0.0, v(4.8)]],
      ], pal.coat.deep, 0.42)
    }
    // The obi: broad, gold, and the one horizontal on a very vertical costume.
    waistWrap(ctx, s, pal.sash, -0.06, 0.3, 1.0, JINBE_BUILD)
    const knot = bodyPoint(s, 0.12, -4.4)
    celPaint(ctx, roundRectPath(knot[0] - 1.6, knot[1] - 1.4, 3.4, 2.8, 0.6), pal.sash, {
      shadow: 0.46, radius: 1.8, pivot: knot, rim: 0.45, line: 0.46,
    })
  },
  hairBack: (cx, cy, r, s) => [
    [cx - r * 1.06, cy - r * 0.4],
    lag([cx - r * 0.9, cy - r * 1.02], s, 0.3),
    // The topknot, tied high and back — rooted in the mass so it cannot float.
    lag([cx - r * 0.5, cy - r * 1.32], s, 0.5),
    lag([cx - r * 0.06, cy - r * 1.62], s, 0.6),
    lag([cx + r * 0.3, cy - r * 1.28], s, 0.5),
    [cx + r * 0.96, cy - r * 0.72],
    [cx + r * 1.02, cy + r * 0.2],
    [cx - r * 1.02, cy + r * 0.3],
  ] as Pt[],
  hairFront: (cx, cy, r, s) => [
    [
      [cx - r * 1.04, cy - r * 0.52],
      lag([cx - r * 0.6, cy - r * 1.16], s, 0.3),
      lag([cx + r * 0.5, cy - r * 1.1], s, 0.28),
      [cx + r * 1.0, cy - r * 0.6],
      [cx + r * 0.44, cy - r * 0.78],
      [cx - r * 0.44, cy - r * 0.82],
    ] as Pt[],
    // Sideburns down the jaw — the heavy, senior read.
    [
      [cx - r * 1.02, cy - r * 0.5],
      [cx - r * 1.16, cy + r * 0.5],
      [cx - r * 0.82, cy + r * 0.46],
      [cx - r * 0.8, cy - r * 0.4],
    ] as Pt[],
  ],
  props: (ctx, s, phase) => {
    if (phase !== 'behind') return
    // Ear fins, swept back off the skull. They sit behind everything, so the
    // head's own ink line closes over their roots.
    const [cx, cy] = s.head
    const r = s.headR
    const skinFin = cel(mix(FISH_BLUE, PAL.foam, 0.28))
    fin(ctx, [cx - r * 0.7, cy + r * 0.1], 2.5 + Math.PI / 2 - 0.5, r * 1.5, r * 0.7, skinFin, 0.6)
    fin(ctx, [cx + r * 0.75, cy + r * 0.12], Math.PI * 0.72, r * 1.2, r * 0.55, skinFin, 0.5)
  },
  attackStyle: 'palm',
  weapon: palmWater,
}

/** Elbow fins, drawn over the near arm so they break its outline. */
const jinbeArmFin = (ctx: CanvasRenderingContext2D, joints: [Pt, Pt, Pt], scale: number): void => {
  const inner = kimonoSleeve(cel(KIMONO_OUTER))
  inner(ctx, joints, scale)
  const [, elbow, wrist] = joints
  const ang = Math.atan2(wrist[1] - elbow[1], wrist[0] - elbow[0])
  fin(ctx, [elbow[0], elbow[1]], ang - Math.PI * 0.72, 5.5, 2.2,
    cel(mix(FISH_BLUE, PAL.foam, 0.22)), 0.55)
}

jinbe.arms = (p) => ({
  sleeve: 0.55, cloth: p.coat, cuff: null, upperMass: 1.32, foreMass: 1.22, handScale: 1.15,
  deco: jinbeArmFin,
})

export const CREW_TWO = { robin, franky, brook, jinbe } satisfies Record<string, Look>
