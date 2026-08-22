import type { CrewId } from '../../types'
import { cel, mix } from '../color'
import { blob, crescentPath, curve, ellipsePath, glint, paint, roundRectPath, type Pt } from '../ink'
import { PAL } from '../palette'
import type { Palette } from './rig'
import { SEG, type Skeleton } from './rig'

/**
 * Per-character identity: palette, hair silhouette, headgear and props.
 *
 * Silhouette is the whole job here. Filled solid black, each of the six has to
 * be nameable — the straw hat's brim, Zoro's three sword hilts, Nami's hair
 * fall, Sanji's swirl, Usopp's nose, Chopper's antlers. Everything else is
 * detail that only survives at full size.
 */

export interface Look {
  name: string
  pal: Palette
  openVest: boolean
  /** Hair mass behind the head, as a fraction of head radius. */
  hairBack(cx: number, cy: number, r: number): Pt[]
  /** Locks drawn over the face. */
  hairFront(cx: number, cy: number, r: number): Pt[][]
  /** Hat, bandana, goggles — drawn last, over the hair. */
  headgear?(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, drag: number): void
  /** Anything carried: swords on the hip, a staff on the back. */
  props?(ctx: CanvasRenderingContext2D, s: Skeleton, phase: 'behind' | 'front'): void
  /** The thing in the leading hand during an attack. */
  weapon(ctx: CanvasRenderingContext2D, hand: Pt, angle: number, t: number): void
}

const P = (o: {
  skin: string
  hair: string
  shirt: string
  trousers: string
  boots: string
  accent: string
  sash: string
}): Palette => ({
  skin: cel(o.skin, { lineDarkness: 0.34 }),
  hair: cel(o.hair),
  shirt: cel(o.shirt),
  trousers: cel(o.trousers),
  boots: cel(o.boots),
  accent: cel(o.accent),
  sash: cel(o.sash),
})

// ─────────────────────────────────────────────────────────────────────────────
// Shared headgear pieces
// ─────────────────────────────────────────────────────────────────────────────

/** The straw hat: brim ellipse, crown, red band. The most important silhouette. */
function strawHat(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, drag: number): void {
  const straw = cel(PAL.strawGold)
  const y = cy - r * 0.86 + drag * 0.5
  const brim = ellipsePath(cx + drag * 0.6, y + r * 0.28, r * 1.92, r * 0.56, drag * 0.06)
  paint(ctx, brim, straw, {
    shadow: 0.36, radius: r * 1.9, pivot: [cx, y], rim: 0.6, line: 0.55,
  })
  const crown = blob([
    [cx - r * 0.94, y + r * 0.2],
    [cx - r * 0.74, y - r * 0.72],
    [cx + r * 0.1, y - r * 0.9],
    [cx + r * 0.86, y - r * 0.6],
    [cx + r * 0.98, y + r * 0.22],
  ] as Pt[], 0.85)
  paint(ctx, crown, straw, {
    shadow: 0.42, radius: r, pivot: [cx, y - r * 0.3], rim: 0.55, line: 0.55,
  })
  // The band.
  const band = blob([
    [cx - r * 0.99, y + r * 0.24],
    [cx - r * 0.86, y - r * 0.16],
    [cx + r * 0.92, y - r * 0.1],
    [cx + r * 1.02, y + r * 0.26],
  ] as Pt[], 0.5)
  paint(ctx, band, cel(PAL.luffyRed), {
    shadow: 0.4, radius: r, pivot: [cx, y], rim: 0.4, line: 0.45,
  })
  // Straw texture: a handful of radial strokes, no more.
  ctx.save()
  ctx.clip(brim)
  ctx.globalAlpha = 0.3
  ctx.strokeStyle = straw.shade
  ctx.lineWidth = 0.35
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath()
    ctx.moveTo(cx + i * r * 0.42, y + r * 0.04)
    ctx.lineTo(cx + i * r * 0.62, y + r * 0.56)
    ctx.stroke()
  }
  ctx.restore()
  // Shadow the hat casts on the face — this is what seats it on the head.
  ctx.save()
  ctx.globalAlpha = 0.24
  ctx.fillStyle = '#2A2038'
  ctx.fill(ellipsePath(cx + r * 0.1, y + r * 0.74, r * 0.92, r * 0.3))
  ctx.restore()
}

function bandana(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, drag: number): void {
  const c = cel(PAL.zoroGreen)
  const band = blob([
    [cx - r * 1.02, cy - r * 0.5],
    [cx - r * 0.8, cy - r * 0.94],
    [cx + r * 0.86, cy - r * 0.8],
    [cx + r * 0.98, cy - r * 0.34],
  ] as Pt[], 0.7)
  paint(ctx, band, c, { shadow: 0.4, radius: r, pivot: [cx, cy - r * 0.6], rim: 0.5, line: 0.5 })
  // Tails streaming behind, driven by the drag term so they lag the motion.
  const tail = blob([
    [cx - r * 0.95, cy - r * 0.62],
    [cx - r * 2 - drag * 3, cy - r * 0.2 - drag * 1.2],
    [cx - r * 2.4 - drag * 3.6, cy + r * 0.5 - drag * 0.6],
    [cx - r * 0.9, cy - r * 0.1],
  ] as Pt[], 0.85)
  paint(ctx, tail, c, { shadow: 0.5, radius: r, pivot: [cx - r, cy], rim: 0.4, line: 0.45 })
}

function topHat(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const pink = cel(PAL.chopperPink)
  const y = cy - r * 0.98
  paint(ctx, ellipsePath(cx, y + r * 0.1, r * 1.34, r * 0.34), pink, {
    shadow: 0.36, radius: r, pivot: [cx, y], rim: 0.5, line: 0.5,
  })
  paint(ctx, roundRectPath(cx - r * 0.78, y - r * 1.24, r * 1.56, r * 1.36, r * 0.24), pink, {
    shadow: 0.42, radius: r, pivot: [cx, y - r * 0.5], rim: 0.5, line: 0.5,
  })
  paint(ctx, roundRectPath(cx - r * 0.8, y - r * 0.46, r * 1.6, r * 0.42, 0.2), cel(PAL.denim), {
    shadow: 0.35, radius: r, pivot: [cx, y - r * 0.25], line: 0.4,
  })
  // Antlers: the read that says "reindeer" before anything else.
  const antler = (dir: number) => {
    const c = cel(PAL.woodLight)
    const base: Pt = [cx + dir * r * 0.7, y - r * 0.2]
    paint(
      ctx,
      blob([
        [base[0], base[1]],
        [base[0] + dir * r * 0.5, base[1] - r * 1.2],
        [base[0] + dir * r * 1.5, base[1] - r * 1.5],
        [base[0] + dir * r * 1.1, base[1] - r * 1.05],
        [base[0] + dir * r * 0.9, base[1] - r * 0.2],
      ] as Pt[], 0.8),
      c,
      { shadow: 0.42, radius: r, pivot: base, rim: 0.4, line: 0.45 },
    )
  }
  antler(-1)
  antler(1)
}

function goggles(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const strap = cel(PAL.usoppBrown)
  paint(ctx, roundRectPath(cx - r * 1.02, cy - r * 0.92, r * 2.04, r * 0.44, 0.2), strap, {
    shadow: 0.42, radius: r, pivot: [cx, cy - r * 0.7], line: 0.45,
  })
  for (const dx of [-0.5, 0.56]) {
    const lens = ellipsePath(cx + dx * r, cy - r * 0.72, r * 0.4, r * 0.34)
    paint(ctx, lens, cel(PAL.magic), {
      shadow: 0.3, radius: r * 0.4, pivot: [cx + dx * r, cy - r * 0.72], line: 0.45,
    })
    glint(ctx, cx + dx * r - r * 0.12, cy - r * 0.82, r * 0.16, r * 0.1, -0.6)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Weapons
// ─────────────────────────────────────────────────────────────────────────────

const katana = (ctx: CanvasRenderingContext2D, hand: Pt, angle: number, t: number) => {
  const steel = cel('#DDE6F2')
  const len = 17
  const tip: Pt = [hand[0] + Math.cos(angle) * len, hand[1] + Math.sin(angle) * len]
  paint(
    ctx,
    blob([
      [hand[0], hand[1] - 0.9],
      [tip[0], tip[1] - 0.5],
      [tip[0] + Math.cos(angle) * 1.5, tip[1] + Math.sin(angle) * 1.5],
      [hand[0], hand[1] + 0.9],
    ] as Pt[], 0.3),
    steel,
    { shadow: 0.3, radius: 2, pivot: hand, rim: 0.6, line: 0.42 },
  )
  paint(ctx, ellipsePath(hand[0], hand[1], 1.5, 0.6, angle), cel(PAL.gold), {
    shadow: 0.4, radius: 1.4, pivot: hand, line: 0.4,
  })
  // The arc left behind the swing, brightest at the start of the frame.
  if (t > 0) {
    ctx.save()
    ctx.globalAlpha = 0.5 * t
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = '#DFF4FF'
    ctx.fill(crescentPath(hand[0], hand[1], len * 0.95, 3.4, angle - 1.5, angle + 0.4))
    ctx.restore()
  }
}

const staff = (ctx: CanvasRenderingContext2D, hand: Pt, angle: number) => {
  const wood = cel(PAL.namiOrange)
  const len = 15
  paint(
    ctx,
    roundRectPath(hand[0] - 1, hand[1] - len / 2, 2, len, 1),
    wood,
    { shadow: 0.4, radius: 2, pivot: hand, rim: 0.5, line: 0.42 },
  )
  void angle
}

const sling = (ctx: CanvasRenderingContext2D, hand: Pt, angle: number) => {
  const wood = cel(PAL.usoppBrown)
  paint(
    ctx,
    blob([
      [hand[0], hand[1] + 3],
      [hand[0] - 0.6, hand[1] - 1],
      [hand[0] - 2.6, hand[1] - 4],
      [hand[0] - 1.2, hand[1] - 4.4],
      [hand[0] + 0.4, hand[1] - 1.6],
      [hand[0] + 2, hand[1] - 4.4],
      [hand[0] + 3.2, hand[1] - 3.8],
      [hand[0] + 1.2, hand[1] - 0.8],
      [hand[0] + 1.4, hand[1] + 3],
    ] as Pt[], 0.6),
    wood,
    { shadow: 0.42, radius: 3, pivot: hand, rim: 0.5, line: 0.45 },
  )
  void angle
}

const fist = (ctx: CanvasRenderingContext2D, hand: Pt, angle: number, t: number) => {
  // The stretch: a tapered tube from the shoulder line out to an oversized fist.
  const skin = cel(PAL.skin, { lineDarkness: 0.34 })
  const reach = 6 + t * 9
  const tip: Pt = [hand[0] + Math.cos(angle) * reach, hand[1] + Math.sin(angle) * reach]
  paint(
    ctx,
    blob([
      [hand[0], hand[1] - 1.5],
      [tip[0], tip[1] - 2.4],
      [tip[0], tip[1] + 2.4],
      [hand[0], hand[1] + 1.5],
    ] as Pt[], 0.4),
    skin,
    { shadow: 0.44, radius: 2.4, pivot: hand, rim: 0.55, line: 0.45 },
  )
  paint(ctx, ellipsePath(tip[0], tip[1], 3.1, 2.9), skin, {
    shadow: 0.42, radius: 3, pivot: tip, rim: 0.6, line: 0.5,
  })
  ctx.save()
  ctx.strokeStyle = skin.line
  ctx.lineWidth = 0.4
  ctx.stroke(curve([[tip[0] - 1.4, tip[1] - 1], [tip[0] + 1.2, tip[1] - 0.6]] as Pt[]))
  ctx.restore()
}

const legKick = (ctx: CanvasRenderingContext2D, hand: Pt, angle: number, t: number) => {
  // Sanji strikes with his legs: the "weapon" is a burst of flame at the boot.
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = 0.65 * (0.4 + t)
  ctx.fillStyle = PAL.ember
  ctx.fill(ellipsePath(hand[0], hand[1], 4 + t * 3, 2.4 + t * 1.6, angle))
  ctx.fillStyle = '#FFF0C0'
  ctx.fill(ellipsePath(hand[0], hand[1], 2.2 + t * 1.6, 1.3 + t, angle))
  ctx.restore()
}

const hoof = (ctx: CanvasRenderingContext2D, hand: Pt, angle: number, t: number) => {
  const c = cel('#C9895A')
  const reach = 3 + t * 4
  const tip: Pt = [hand[0] + Math.cos(angle) * reach, hand[1] + Math.sin(angle) * reach]
  paint(ctx, ellipsePath(tip[0], tip[1], 2.8, 2.6), c, {
    shadow: 0.42, radius: 2.8, pivot: tip, rim: 0.55, line: 0.5,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// The crew
// ─────────────────────────────────────────────────────────────────────────────

const spikeHair = (cx: number, cy: number, r: number, spikes: number, spread: number, len: number): Pt[] => {
  const pts: Pt[] = []
  for (let i = 0; i <= spikes; i++) {
    const t = i / spikes
    const a = -Math.PI + spread * 0.5 + t * (Math.PI * 2 - spread)
    const rad = r * (i % 2 === 0 ? 1.06 + len : 0.98)
    pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad * 0.96])
  }
  return pts
}

export const LOOKS: Record<CrewId, Look> = {
  luffy: {
    name: 'Luffy',
    openVest: true,
    pal: P({
      skin: PAL.skin, hair: '#241C28', shirt: PAL.luffyRed, trousers: '#3C6BB0',
      boots: '#2A3350', accent: PAL.luffyRed, sash: PAL.gold,
    }),
    hairBack: (cx, cy, r) => spikeHair(cx, cy - r * 0.16, r * 1.12, 9, 1.5, 0.14),
    hairFront: (cx, cy, r) => [
      [
        [cx - r * 0.95, cy - r * 0.34],
        [cx - r * 0.78, cy - r * 0.98],
        [cx - r * 0.1, cy - r * 1.1],
        [cx + r * 0.3, cy - r * 0.72],
        [cx - r * 0.16, cy - r * 0.5],
        [cx - r * 0.52, cy - r * 0.22],
      ] as Pt[],
      [
        [cx + r * 0.28, cy - r * 0.82],
        [cx + r * 0.86, cy - r * 0.72],
        [cx + r * 0.96, cy - r * 0.28],
        [cx + r * 0.6, cy - r * 0.5],
      ] as Pt[],
    ],
    headgear: strawHat,
    weapon: fist,
  },

  zoro: {
    name: 'Zoro',
    openVest: false,
    pal: P({
      skin: PAL.skin, hair: PAL.zoroGreen, shirt: '#EFE9DA', trousers: '#2A2C36',
      boots: '#1E2028', accent: PAL.zoroGreen, sash: PAL.zoroGreen,
    }),
    hairBack: (cx, cy, r) => spikeHair(cx, cy - r * 0.24, r * 1.04, 11, 1.8, 0.2),
    hairFront: (cx, cy, r) => [
      [
        [cx - r * 0.92, cy - r * 0.5],
        [cx - r * 0.5, cy - r * 1.06],
        [cx + r * 0.5, cy - r * 1.02],
        [cx + r * 0.92, cy - r * 0.52],
        [cx + r * 0.4, cy - r * 0.66],
        [cx - r * 0.4, cy - r * 0.68],
      ] as Pt[],
    ],
    headgear: bandana,
    props: (ctx, s, phase) => {
      if (phase !== 'behind') return
      // Three sheathed swords at the hip — the silhouette everyone knows.
      const hip = s.hip
      for (let i = 0; i < 3; i++) {
        const a = 0.5 + i * 0.14
        const len = 15
        const c = cel(['#2A2C36', '#3E4250', '#22252E'][i])
        paint(
          ctx,
          roundRectPath(hip[0] - 6 - i * 1.2, hip[1] - 1.4 + i * 0.6, len, 1.5, 0.7),
          c,
          { shadow: 0.5, radius: 2, pivot: hip, line: 0.4, light: { x: -0.6, y: -0.8 } },
        )
        void a
      }
    },
    weapon: katana,
  },

  nami: {
    name: 'Nami',
    openVest: false,
    pal: P({
      skin: '#FBD6B2', hair: PAL.namiOrange, shirt: '#FAF4E6', trousers: '#3C7CC0',
      boots: '#2A3350', accent: PAL.namiOrange, sash: '#3C7CC0',
    }),
    hairBack: (cx, cy, r) => [
      [cx - r * 1.16, cy - r * 0.5],
      [cx - r * 0.7, cy - r * 1.14],
      [cx + r * 0.5, cy - r * 1.16],
      [cx + r * 1.12, cy - r * 0.44],
      [cx + r * 1.24, cy + r * 1.5],
      [cx + r * 0.6, cy + r * 2.1],
      [cx - r * 0.7, cy + r * 2],
      [cx - r * 1.26, cy + r * 1.2],
    ] as Pt[],
    hairFront: (cx, cy, r) => [
      [
        [cx - r * 1, cy - r * 0.42],
        [cx - r * 0.6, cy - r * 1.08],
        [cx + r * 0.42, cy - r * 1.06],
        [cx + r * 0.72, cy - r * 0.4],
        [cx + r * 0.2, cy - r * 0.62],
        [cx - r * 0.42, cy - r * 0.5],
      ] as Pt[],
    ],
    weapon: staff,
  },

  sanji: {
    name: 'Sanji',
    openVest: false,
    pal: P({
      skin: PAL.skin, hair: PAL.sanjiGold, shirt: PAL.sanjiSuit, trousers: '#161E38',
      boots: '#0E1428', accent: PAL.sanjiGold, sash: '#0E1428',
    }),
    hairBack: (cx, cy, r) => spikeHair(cx, cy - r * 0.2, r * 1.02, 7, 1.4, 0.1),
    hairFront: (cx, cy, r) => [
      // The fringe covers one eye entirely — Sanji's defining face shape.
      [
        [cx - r * 1.04, cy - r * 0.2],
        [cx - r * 0.86, cy - r * 1.04],
        [cx + r * 0.36, cy - r * 1.1],
        [cx + r * 0.86, cy - r * 0.66],
        [cx + r * 0.2, cy - r * 0.72],
        [cx - r * 0.24, cy + r * 0.12],
      ] as Pt[],
    ],
    weapon: legKick,
  },

  usopp: {
    name: 'Usopp',
    openVest: false,
    pal: P({
      skin: '#D89A6C', hair: '#2A1C14', shirt: '#E0BC62', trousers: '#4E8244',
      boots: '#5A3820', accent: PAL.usoppBrown, sash: '#5A3820',
    }),
    hairBack: (cx, cy, r) => [
      [cx - r * 1.1, cy - r * 0.6],
      [cx - r * 0.4, cy - r * 1.34],
      [cx + r * 0.6, cy - r * 1.24],
      [cx + r * 1.06, cy - r * 0.5],
      [cx + r * 0.9, cy + r * 0.5],
      [cx - r * 0.9, cy + r * 0.5],
    ] as Pt[],
    hairFront: (cx, cy, r) => [
      [
        [cx - r * 0.98, cy - r * 0.5],
        [cx - r * 0.5, cy - r * 1.12],
        [cx + r * 0.5, cy - r * 1.08],
        [cx + r * 0.94, cy - r * 0.5],
        [cx, cy - r * 0.74],
      ] as Pt[],
    ],
    headgear: (ctx, cx, cy, r) => {
      goggles(ctx, cx, cy, r)
      // The nose. It is the character.
      const skin = cel('#D89A6C', { lineDarkness: 0.34 })
      paint(
        ctx,
        blob([
          [cx + r * 0.6, cy - r * 0.05],
          [cx + r * 2.5, cy + r * 0.14],
          [cx + r * 0.66, cy + r * 0.44],
        ] as Pt[], 0.55),
        skin,
        { shadow: 0.44, radius: r, pivot: [cx + r, cy + r * 0.2], rim: 0.5, line: 0.5 },
      )
    },
    weapon: sling,
  },

  chopper: {
    name: 'Chopper',
    openVest: false,
    pal: P({
      skin: '#F2D2AE', hair: '#B0723E', shirt: PAL.luffyRed, trousers: '#8A5A32',
      boots: '#6B4426', accent: PAL.chopperPink, sash: PAL.gold,
    }),
    hairBack: (cx, cy, r) => [
      [cx - r * 1.2, cy - r * 0.3],
      [cx - r * 0.9, cy - r * 1.1],
      [cx + r * 0.9, cy - r * 1.1],
      [cx + r * 1.2, cy - r * 0.3],
      [cx + r * 1.05, cy + r * 0.6],
      [cx - r * 1.05, cy + r * 0.6],
    ] as Pt[],
    hairFront: (cx, cy, r) => [
      [
        [cx - r * 1.02, cy - r * 0.34],
        [cx - r * 0.6, cy - r * 0.98],
        [cx + r * 0.6, cy - r * 0.96],
        [cx + r * 1, cy - r * 0.32],
        [cx, cy - r * 0.6],
      ] as Pt[],
    ],
    headgear: (ctx, cx, cy, r) => topHat(ctx, cx, cy, r),
    weapon: hoof,
  },
}

/** Scale of the whole figure. Chopper is small; the rest are adults. */
export const CREW_SCALE: Record<CrewId, number> = {
  luffy: 1,
  zoro: 1.04,
  nami: 0.97,
  sanji: 1.02,
  usopp: 0.99,
  chopper: 0.82,
}

export { SEG, mix }
