import type { CrewId, SpriteSheet } from '../types'
import { SheetBuilder } from './atlas'
import { PAL } from './palette'
import { px, ellipse, circle, mix, ramp, type Surface } from './pixel'

/**
 * Character art.
 *
 * All six crew members share one rig — same joint positions, same animation
 * timings — and differ by palette, silhouette accessory and the shape of their
 * head. Sharing the rig is what keeps six characters feeling like one cast, and
 * it means an animation improvement lands on everybody at once.
 */

export interface CrewLook {
  hair: string
  hairShade: string
  shirt: string
  shirtShade: string
  trousers: string
  skin: string
  /** Drawn behind the head: the straw hat, a bandana, an orange bob. */
  headgear: 'strawhat' | 'bandana' | 'hair-long' | 'hair-swirl' | 'goggles' | 'antlers'
  /** Held in the forward hand during `attack`. */
  weapon: 'fist' | 'sword' | 'staff' | 'leg' | 'sling' | 'hoof'
  accent: string
}

export const CREW_LOOKS: Record<CrewId, CrewLook> = {
  luffy: {
    hair: '#1B1B22', hairShade: '#000006', shirt: PAL.luffyRed, shirtShade: PAL.luffyRedDeep,
    trousers: '#2B4C86', skin: PAL.skin, headgear: 'strawhat', weapon: 'fist', accent: PAL.luffyRed,
  },
  zoro: {
    hair: PAL.zoroGreen, hairShade: '#276E45', shirt: '#E8E4D8', shirtShade: '#B8B2A2',
    trousers: '#2B2B33', skin: PAL.skin, headgear: 'bandana', weapon: 'sword', accent: PAL.zoroGreen,
  },
  nami: {
    hair: PAL.namiOrange, hairShade: '#B95E22', shirt: '#F5F1E6', shirtShade: '#C9C2B2',
    trousers: '#2E6BA8', skin: '#F7D3AE', headgear: 'hair-long', weapon: 'staff', accent: PAL.namiOrange,
  },
  sanji: {
    hair: '#E8C86A', hairShade: '#B89A3E', shirt: '#1A2340', shirtShade: '#0E1428',
    trousers: '#1A2340', skin: PAL.skin, headgear: 'hair-swirl', weapon: 'leg', accent: '#E8C86A',
  },
  usopp: {
    hair: '#2A1A12', hairShade: '#140A06', shirt: '#D8B45A', shirtShade: '#A8863A',
    trousers: '#4E7C3E', skin: '#C98F63', headgear: 'goggles', weapon: 'sling', accent: PAL.usoppBrown,
  },
  chopper: {
    hair: '#8B5A3C', hairShade: '#5E3A26', shirt: PAL.luffyRed, shirtShade: PAL.luffyRedDeep,
    trousers: '#7A5236', skin: '#E8C49A', headgear: 'antlers', weapon: 'hoof', accent: PAL.chopperPink,
  },
}

const FW = 34
const FH = 34

/** Pose parameters the frame painter interpolates between. */
interface Pose {
  /** Vertical body offset — the bob of a run cycle, the crouch of a landing. */
  bodyY: number
  /** Lean, in px, positive is forward. */
  lean: number
  /** Front / back leg angles, radians from straight down. */
  legFront: number
  legBack: number
  /** Front / back arm angles. */
  armFront: number
  armBack: number
  /** Squash factors applied to the torso only. */
  torsoX: number
  torsoY: number
  /** Head tilt in radians. */
  headTilt: number
}

const pose = (o: Partial<Pose> = {}): Pose => ({
  bodyY: 0, lean: 0, legFront: 0, legBack: 0, armFront: 0.2, armBack: -0.2,
  torsoX: 1, torsoY: 1, headTilt: 0, ...o,
})

function drawLimb(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  len: number,
  width: number,
  color: string,
  shade: string,
): void {
  const ex = x + Math.sin(angle) * len
  const ey = y + Math.cos(angle) * len
  const steps = Math.ceil(len)
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const lx = x + (ex - x) * t
    const ly = y + (ey - y) * t
    px(ctx, lx - width / 2, ly, width, 1, i > steps * 0.6 ? shade : color)
  }
}

function drawCrewFrame(s: Surface, look: CrewLook, p: Pose): void {
  const ctx = s.ctx
  const cx = FW / 2
  const groundY = FH - 1
  const skin = ramp(look.skin, 0.9)
  const shirt = ramp(look.shirt, 1)
  const trousers = ramp(look.trousers, 1)

  const hipY = groundY - 11 + p.bodyY
  const shoulderY = hipY - 8
  const headY = shoulderY - 4

  // Legs
  drawLimb(ctx, cx - 1 + p.lean * 0.3, hipY, p.legBack, 10, 4, trousers.dark, trousers.darkest)
  // Torso
  const tw = Math.round(9 * p.torsoX)
  const th = Math.round(9 * p.torsoY)
  px(ctx, cx - tw / 2 + p.lean * 0.5, shoulderY, tw, th, shirt.base)
  px(ctx, cx - tw / 2 + p.lean * 0.5, shoulderY, tw, 2, shirt.light)
  px(ctx, cx + tw / 2 - 2 + p.lean * 0.5, shoulderY, 2, th, shirt.dark)
  // Sash / belt
  px(ctx, cx - tw / 2 + p.lean * 0.5, shoulderY + th - 2, tw, 2, look.accent)

  // Back arm
  drawLimb(ctx, cx - 2 + p.lean * 0.6, shoulderY + 1, p.armBack, 8, 3, skin.dark, skin.darkest)

  // Front leg + arm draw over the torso
  drawLimb(ctx, cx + 1 + p.lean * 0.3, hipY, p.legFront, 10, 4, trousers.base, trousers.dark)
  drawLimb(ctx, cx + 2 + p.lean * 0.6, shoulderY + 1, p.armFront, 8, 3, skin.base, skin.dark)

  // Head
  const hx = cx + p.lean + Math.sin(p.headTilt) * 2
  ellipse(ctx, hx, headY, 5, 5, skin.base)
  px(ctx, hx - 5, headY - 5, 10, 4, skin.light)
  // Eyes
  px(ctx, hx + 1, headY - 1, 2, 2, PAL.ink)
  px(ctx, hx - 3, headY - 1, 2, 2, PAL.ink)
  px(ctx, hx + 1, headY - 1, 1, 1, PAL.white)

  drawHeadgear(ctx, look, hx, headY, p)
}

function drawHeadgear(
  ctx: CanvasRenderingContext2D,
  look: CrewLook,
  hx: number,
  hy: number,
  p: Pose,
): void {
  const hair = ramp(look.hair, 1)
  switch (look.headgear) {
    case 'strawhat':
      px(ctx, hx - 5, hy - 6, 10, 3, hair.base)
      // Brim, then crown, then the red band that reads even at 1x.
      ellipse(ctx, hx, hy - 7, 9, 2.4, PAL.strawGold)
      px(ctx, hx - 9, hy - 7, 18, 1, mix(PAL.strawGold, PAL.white, 0.3))
      ellipse(ctx, hx, hy - 9, 5, 3, PAL.strawDeep)
      ellipse(ctx, hx, hy - 10, 5, 2.4, PAL.strawGold)
      px(ctx, hx - 5, hy - 9, 10, 2, PAL.luffyRed)
      break
    case 'bandana':
      px(ctx, hx - 5, hy - 6, 10, 3, hair.base)
      px(ctx, hx - 6, hy - 7, 12, 3, PAL.zoroGreen)
      px(ctx, hx - 6, hy - 7, 12, 1, mix(PAL.zoroGreen, PAL.white, 0.3))
      px(ctx, hx - 8, hy - 5, 3, 6, PAL.zoroGreen)
      break
    case 'hair-long':
      px(ctx, hx - 5, hy - 7, 10, 4, hair.base)
      px(ctx, hx - 5, hy - 7, 10, 1, hair.light)
      px(ctx, hx - 6, hy - 4, 3, 9, hair.base)
      px(ctx, hx + 3, hy - 4, 3, 9, hair.dark)
      break
    case 'hair-swirl':
      px(ctx, hx - 5, hy - 7, 10, 4, hair.base)
      px(ctx, hx - 1, hy - 6, 6, 2, hair.light)
      // The swirl brow, drawn as a two-step spiral.
      px(ctx, hx + 2, hy - 2, 4, 1, hair.dark)
      px(ctx, hx + 5, hy - 3, 1, 2, hair.dark)
      break
    case 'goggles':
      px(ctx, hx - 5, hy - 7, 10, 4, hair.base)
      px(ctx, hx - 6, hy - 5, 12, 3, PAL.steel)
      circle(ctx, hx - 3, hy - 4, 2, PAL.magic)
      circle(ctx, hx + 3, hy - 4, 2, PAL.magic)
      // The nose: the one silhouette cue that identifies him at any size.
      px(ctx, hx + 4, hy, 7, 2, look.skin)
      px(ctx, hx + 4, hy + 2, 6, 1, mix(look.skin, PAL.ink, 0.3))
      break
    case 'antlers':
      px(ctx, hx - 5, hy - 6, 10, 3, hair.base)
      px(ctx, hx - 7, hy - 11, 2, 6, PAL.woodLight)
      px(ctx, hx + 5, hy - 11, 2, 6, PAL.woodLight)
      px(ctx, hx - 9, hy - 11, 3, 2, PAL.woodLight)
      px(ctx, hx + 6, hy - 11, 3, 2, PAL.woodLight)
      // Pink top hat with a blue band.
      px(ctx, hx - 6, hy - 8, 12, 2, PAL.chopperPink)
      px(ctx, hx - 4, hy - 13, 8, 5, PAL.chopperPink)
      px(ctx, hx - 4, hy - 10, 8, 2, PAL.denim)
      break
  }
  void p
}

/** One crew member's full animation set. */
function buildCrewSheet(id: CrewId): SpriteSheet {
  const look = CREW_LOOKS[id]
  const b = new SheetBuilder({
    fw: FW,
    fh: FH,
    ox: -FW / 2,
    oy: -FH,
    outline: PAL.ink,
    rim: '#FFE9A8',
    ao: PAL.inkSoft,
  })

  const frame = (p: Pose, dur: number) => ({
    dur,
    draw: (s: Surface) => drawCrewFrame(s, look, p),
  })

  // Idle: a slow two-frame breath. Subtle beats busy.
  b.add('idle', [
    frame(pose({ bodyY: 0, armFront: 0.25, armBack: -0.25 }), 0.42),
    frame(pose({ bodyY: -1, torsoY: 1.06, armFront: 0.32, armBack: -0.3 }), 0.42),
  ])

  // Run: an eight-frame cycle with a full contact-to-contact stride.
  const runPoses: Pose[] = [
    pose({ legFront: 0.9, legBack: -0.8, armFront: -0.7, armBack: 0.8, lean: 2, bodyY: 0 }),
    pose({ legFront: 0.4, legBack: -0.2, armFront: -0.3, armBack: 0.4, lean: 2, bodyY: -2 }),
    pose({ legFront: -0.2, legBack: 0.5, armFront: 0.3, armBack: -0.3, lean: 2, bodyY: -1 }),
    pose({ legFront: -0.8, legBack: 0.9, armFront: 0.8, armBack: -0.7, lean: 2, bodyY: 0 }),
    pose({ legFront: -0.9, legBack: 0.8, armFront: 0.7, armBack: -0.8, lean: 2, bodyY: 0 }),
    pose({ legFront: -0.4, legBack: 0.2, armFront: 0.3, armBack: -0.4, lean: 2, bodyY: -2 }),
    pose({ legFront: 0.2, legBack: -0.5, armFront: -0.3, armBack: 0.3, lean: 2, bodyY: -1 }),
    pose({ legFront: 0.8, legBack: -0.9, armFront: -0.8, armBack: 0.7, lean: 2, bodyY: 0 }),
  ]
  b.add('run', runPoses.map((p) => frame(p, 0.062)))

  b.add('jump', [frame(pose({ legFront: -0.5, legBack: 0.35, armFront: -1.4, armBack: -1.1, torsoY: 1.08, bodyY: -1 }), 1)], { loop: false })
  b.add('fall', [frame(pose({ legFront: 0.5, legBack: -0.3, armFront: -1.9, armBack: -1.6, torsoY: 0.96 }), 1)], { loop: false })
  b.add('land', [frame(pose({ bodyY: 3, torsoX: 1.18, torsoY: 0.8, legFront: 0.5, legBack: -0.5, armFront: 1, armBack: -1 }), 1)], { loop: false })
  b.add('skid', [frame(pose({ lean: -3, legFront: 0.8, legBack: -0.9, armFront: 1.3, armBack: -1.4 }), 1)], { loop: false })
  b.add('crouch', [frame(pose({ bodyY: 5, torsoX: 1.2, torsoY: 0.62, legFront: 1.1, legBack: -1.1, armFront: 0.9, armBack: -0.9 }), 1)])
  b.add('hurt', [frame(pose({ lean: -4, bodyY: -1, armFront: -2.2, armBack: 2.2, legFront: -0.9, legBack: 0.9, headTilt: -0.4 }), 1)], { loop: false })
  b.add('victory', [
    frame(pose({ armFront: -2.9, armBack: -2.6, bodyY: -2, torsoY: 1.05 }), 0.28),
    frame(pose({ armFront: -3.1, armBack: -2.4, bodyY: 0 }), 0.28),
  ])
  b.add('attack', [
    frame(pose({ lean: 1, armFront: -1.2, armBack: 0.6, torsoX: 0.92 }), 0.05),
    frame(pose({ lean: 4, armFront: 1.6, armBack: 1.1, torsoX: 1.14, legFront: 0.6, legBack: -0.6 }), 0.09),
    frame(pose({ lean: 3, armFront: 1.4, armBack: 0.9, torsoX: 1.04 }), 0.09),
  ], { loop: false })
  b.add('swim', [
    frame(pose({ bodyY: 2, legFront: 1.3, legBack: -1.2, armFront: -1.6, armBack: 1.4, headTilt: 0.2 }), 0.18),
    frame(pose({ bodyY: 1, legFront: -1.2, legBack: 1.3, armFront: 1.4, armBack: -1.6, headTilt: 0.2 }), 0.18),
  ])
  b.add('climb', [
    frame(pose({ armFront: -2.6, armBack: 2.4, legFront: 0.7, legBack: -0.7 }), 0.16),
    frame(pose({ armFront: 2.4, armBack: -2.6, legFront: -0.7, legBack: 0.7 }), 0.16),
  ])
  b.add('dash', [frame(pose({ lean: 5, torsoX: 1.16, torsoY: 0.9, legFront: -1.1, legBack: 1.1, armFront: 1.8, armBack: -1.8 }), 1)], { loop: false })

  return b.build()
}

export function buildCrewSheets(): Record<CrewId, SpriteSheet> {
  const ids: CrewId[] = ['luffy', 'zoro', 'nami', 'sanji', 'usopp', 'chopper']
  return ids.reduce((acc, id) => {
    acc[id] = buildCrewSheet(id)
    return acc
  }, {} as Record<CrewId, SpriteSheet>)
}
