import type { CrewId } from '../../types'
import { cel, mix } from '../color'
import { blob, crescentPath, curve, ellipsePath, glint, paint, roundRectPath, type Pt } from '../ink'
import { PAL } from '../palette'
import { browShadow } from './head'
import { CREW_TWO } from './crew2'
import type { Look } from './parts'
import {
  P, collar, limbFormLite, paintPanel, skinCel, spikeHair, tails, waistWrap,
} from './parts'
import type { Skeleton } from './rig'
import { SEG, band, bodyFolds, bodyPoint, drawBody, drawRibbon, hemShape, lag, ribbon } from './rig'

/**
 * Per-character identity: palette, build, costume, hair, headgear and props.
 *
 * Silhouette is the whole job here. Filled solid black, each of the six has to
 * be nameable — the straw hat's brim and flying vest tails, Zoro's coat and
 * three scabbards, Nami's hair fall and skirt, Sanji's lapels and swirl, the
 * bib of Usopp's overalls under that nose, Chopper's antlers over a round
 * little body. A shared rig is only a cast if the costumes disagree.
 *
 * Clothing is authored in body space — `u` along the spine, `v` across the
 * chest — so a lapel is still on the lapel at a thirty-degree lean, and the
 * hems and tails read the pose's drag so cloth arrives a frame after the body.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Headgear
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The straw hat: an uneven brim, a crown and a red band. It is the single most
 * important silhouette in the game, so the brim is drawn as a blob with a
 * varying radius rather than an ellipse — a perfect oval reads as clip art, and
 * the whole hat tilts and lags with the body.
 */
function strawHat(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, s: Skeleton): void {
  const straw = cel(PAL.strawGold)
  const tilt = -s.drag * 0.05 + s.lean * 0.4
  const hx = cx - s.drag * 0.5
  const y = cy - r * 1.04 + s.lift * 0.28
  const brimPts: Pt[] = []
  const wobble = [1, 0.96, 1.03, 0.98, 1.02, 0.95, 1.04, 0.97]
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + tilt
    brimPts.push([
      hx + Math.cos(a) * r * 1.52 * wobble[i],
      y + r * 0.24 + Math.sin(a) * r * 0.38 * wobble[i] + Math.cos(a) * tilt * r * 0.5,
    ])
  }
  const brim = blob(brimPts, 0.95)
  paint(ctx, brim, straw, { shadow: 0.36, radius: r * 1.5, pivot: [hx, y], rim: 0.6, line: 0.52, occlusion: 0.2 })

  const crown = blob([
    [hx - r * 0.9, y + r * 0.2],
    [hx - r * 0.74, y - r * 0.6],
    [hx + r * 0.06, y - r * 0.78],
    [hx + r * 0.82, y - r * 0.5],
    [hx + r * 0.94, y + r * 0.22],
  ] as Pt[], 0.85)
  paint(ctx, crown, straw, { shadow: 0.42, radius: r, pivot: [hx, y - r * 0.3], rim: 0.55, line: 0.55 })

  paint(ctx, blob([
    [hx - r * 0.95, y + r * 0.24],
    [hx - r * 0.84, y - r * 0.14],
    [hx + r * 0.88, y - r * 0.08],
    [hx + r * 0.98, y + r * 0.26],
  ] as Pt[], 0.5), cel(PAL.luffyRed), { shadow: 0.4, radius: r, pivot: [hx, y], rim: 0.4, line: 0.45 })

  // Straw weave: a handful of strokes that fan with the brim, never a grid.
  ctx.save()
  ctx.clip(brim)
  ctx.globalAlpha = 0.28
  ctx.strokeStyle = straw.shade
  ctx.lineWidth = 0.34
  for (let i = -3; i <= 3; i++) {
    ctx.stroke(curve([
      [hx + i * r * 0.32, y + r * 0.04],
      [hx + i * r * 0.44, y + r * 0.24],
      [hx + i * r * 0.52, y + r * 0.44],
    ] as Pt[]))
  }
  ctx.restore()
  browShadow(ctx, cx, cy, r, 0.46, 0.2)
}

function bandanaHead(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, s: Skeleton): void {
  const c = cel(PAL.zoroGreen)
  paint(ctx, blob([
    [cx - r * 1.02, cy - r * 0.66],
    [cx - r * 0.8, cy - r * 1.04],
    [cx + r * 0.86, cy - r * 0.92],
    [cx + r * 0.98, cy - r * 0.52],
    [cx, cy - r * 0.74],
  ] as Pt[], 0.75), c, { shadow: 0.4, radius: r, pivot: [cx, cy - r * 0.6], rim: 0.5, line: 0.5 })
  // The knot, then two tails that lag the head by a frame and whip on a turn.
  const knot: Pt = [cx - r * 0.94, cy - r * 0.72]
  paint(ctx, ellipsePath(knot[0], knot[1], r * 0.28, r * 0.24, -0.4), c, {
    shadow: 0.44, radius: r * 0.3, pivot: knot, line: 0.44,
  })
  for (let i = 0; i < 2; i++) {
    const spread = i === 0 ? -0.42 : 0.16
    drawRibbon(
      ctx,
      ribbon(knot, Math.PI + spread - s.lift * 0.06, r * (2.5 + s.drag * 0.5), r * 0.24, r * 0.1,
        0.9 + s.drag * 0.3 + i * 0.35, 0.12, s.flutter + i * 0.4),
      c,
      knot,
      r * 1.4,
    )
  }
  browShadow(ctx, cx, cy, r, 0.44, 0.16)
}

function topHat(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, s: Skeleton): void {
  const pink = cel(PAL.chopperPink)
  const y = cy - r * 1.02 + s.lift * 0.25
  const hx = cx - s.drag * 0.35
  // Antlers first: they are behind the hat, and they are the read that says
  // "reindeer" before anything else in the frame does.
  const antler = (dir: number) => {
    const c = cel(PAL.woodLight)
    const base: Pt = [cx + dir * r * 0.74, y + r * 0.1]
    paint(ctx, blob([
      [base[0], base[1]],
      [base[0] + dir * r * 0.3, base[1] - r * 1.24],
      [base[0] + dir * r * 1.24, base[1] - r * 1.66],
      [base[0] + dir * r * 1.36, base[1] - r * 1.36],
      [base[0] + dir * r * 0.76, base[1] - r * 1.06],
      [base[0] + dir * r * 1.34, base[1] - r * 0.74],
      [base[0] + dir * r * 1.34, base[1] - r * 0.44],
      [base[0] + dir * r * 0.72, base[1] - r * 0.5],
      [base[0] + dir * r * 0.62, base[1] - r * 0.06],
    ] as Pt[], 0.72), c, { shadow: 0.42, radius: r, pivot: base, rim: 0.42, line: 0.44 })
  }
  antler(-1)
  antler(1)

  paint(ctx, blob([
    [hx - r * 1.36, y + r * 0.12],
    [hx, y - r * 0.06],
    [hx + r * 1.36, y + r * 0.12],
    [hx, y + r * 0.34],
  ] as Pt[], 0.9), pink, { shadow: 0.36, radius: r, pivot: [hx, y], rim: 0.5, line: 0.5 })
  paint(ctx, roundRectPath(hx - r * 0.8, y - r * 1.3, r * 1.6, r * 1.42, r * 0.22), pink, {
    shadow: 0.42, radius: r, pivot: [hx, y - r * 0.5], rim: 0.5, line: 0.5, occlusion: 0.2,
  })
  paint(ctx, roundRectPath(hx - r * 0.82, y - r * 0.5, r * 1.64, r * 0.44, 0.2), cel(PAL.denim), {
    shadow: 0.35, radius: r, pivot: [hx, y - r * 0.28], line: 0.4,
  })
  // The cross patch on the crown.
  ctx.save()
  ctx.globalAlpha = 0.9
  ctx.fillStyle = PAL.cream
  ctx.fill(roundRectPath(hx - r * 0.12, y - r * 1.12, r * 0.24, r * 0.56, 0.06))
  ctx.fill(roundRectPath(hx - r * 0.28, y - r * 0.96, r * 0.56, r * 0.24, 0.06))
  ctx.restore()
  browShadow(ctx, cx, cy, r, 0.5, 0.16)
}

function goggles(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const strap = cel(PAL.usoppBrown)
  paint(ctx, blob([
    [cx - r * 1.06, cy - r * 0.98],
    [cx + r * 1.02, cy - r * 0.92],
    [cx + r * 1.04, cy - r * 0.5],
    [cx - r * 1.08, cy - r * 0.56],
  ] as Pt[], 0.5), strap, { shadow: 0.42, radius: r, pivot: [cx, cy - r * 0.74], rim: 0.4, line: 0.45 })
  for (const dx of [-0.52, 0.56]) {
    const lens = ellipsePath(cx + dx * r, cy - r * 0.76, r * 0.42, r * 0.36)
    paint(ctx, lens, cel(PAL.magic), {
      shadow: 0.3, radius: r * 0.42, pivot: [cx + dx * r, cy - r * 0.76], line: 0.46,
    })
    glint(ctx, cx + dx * r - r * 0.13, cy - r * 0.87, r * 0.17, r * 0.1, -0.6)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Weapons
// ─────────────────────────────────────────────────────────────────────────────

const katana = (ctx: CanvasRenderingContext2D, hand: Pt, angle: number, t: number) => {
  const steel = cel('#DDE6F2')
  const len = 19
  const c = Math.cos(angle)
  const sn = Math.sin(angle)
  const tip: Pt = [hand[0] + c * len, hand[1] + sn * len]
  // The arc goes down first so the blade cuts across it.
  if (t > 0) {
    ctx.save()
    ctx.globalAlpha = 0.55 * t
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = '#DFF4FF'
    ctx.fill(crescentPath(hand[0], hand[1], len * 0.96, 4.2, angle - 1.7, angle + 0.35))
    ctx.fillStyle = '#FFFFFF'
    ctx.fill(crescentPath(hand[0], hand[1], len * 0.96, 1.3, angle - 1.2, angle + 0.2))
    ctx.restore()
  }
  paint(ctx, blob([
    [hand[0] - sn * 1.0, hand[1] + c * 1.0],
    [tip[0] - sn * 0.42, tip[1] + c * 0.42],
    [tip[0] + c * 1.8, tip[1] + sn * 1.8],
    [hand[0] + sn * 1.0, hand[1] - c * 1.0],
  ] as Pt[], 0.3), steel, { shadow: 0.28, radius: 2, pivot: hand, rim: 0.7, line: 0.42 })
  // Hamon: the temper line that makes a blade look forged rather than cut out.
  ctx.save()
  ctx.globalAlpha = 0.5
  ctx.strokeStyle = '#FFFFFF'
  ctx.lineWidth = 0.3
  ctx.stroke(curve([
    [hand[0] + c * 3 + sn * 0.3, hand[1] + sn * 3 - c * 0.3],
    [hand[0] + c * (len * 0.6) + sn * 0.5, hand[1] + sn * (len * 0.6) - c * 0.5],
    [tip[0] - c * 1.2, tip[1] - sn * 1.2],
  ] as Pt[]))
  ctx.restore()
  paint(ctx, ellipsePath(hand[0], hand[1], 1.7, 0.66, angle), cel(PAL.gold), {
    shadow: 0.4, radius: 1.5, pivot: hand, rim: 0.4, line: 0.4,
  })
  paint(ctx, limbFormLite(
    [hand[0] - c * 0.6, hand[1] - sn * 0.6],
    [hand[0] - c * 3.6, hand[1] - sn * 3.6],
    0.85,
  ), cel('#2A2C36'), { shadow: 0.42, radius: 1, pivot: hand, line: 0.4 })
}

const climaTact = (ctx: CanvasRenderingContext2D, hand: Pt, angle: number, t: number) => {
  const wood = cel(PAL.namiOrange)
  const c = Math.cos(angle)
  const sn = Math.sin(angle)
  // Three telescoping segments, each a touch thinner: a stick reads as a stick,
  // a segmented baton reads as a weapon.
  let x = hand[0] - c * 5
  let y = hand[1] - sn * 5
  for (let i = 0; i < 3; i++) {
    const seg = 6 + i * 0.6
    const nx = x + c * seg
    const ny = y + sn * seg
    paint(ctx, limbFormLite([x, y], [nx, ny], 1.05 - i * 0.14), wood, {
      shadow: 0.4, radius: 1.2, pivot: [x, y], rim: 0.5, line: 0.44,
    })
    band(ctx, [nx, ny], angle, 1.2 - i * 0.14, 0.4, cel(PAL.denim))
    x = nx
    y = ny
  }
  if (t > 0) {
    ctx.save()
    ctx.globalAlpha = 0.55 * t
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = PAL.magic
    ctx.fill(ellipsePath(x, y, 3.4 + t * 2, 3 + t * 1.8))
    ctx.restore()
  }
}

const sling = (ctx: CanvasRenderingContext2D, hand: Pt, angle: number, t: number) => {
  const wood = cel(PAL.usoppBrown)
  const c = Math.cos(angle)
  const sn = Math.sin(angle)
  const P = (x: number, y: number): Pt => [hand[0] + c * x - sn * y, hand[1] + sn * x + c * y]
  paint(ctx, blob([
    P(-3.4, 0.9), P(-0.4, 0.9), P(0.6, 2.6), P(3.4, 4.6), P(4.4, 3.6), P(1.9, 1.6),
    P(1.4, 0), P(1.9, -1.6), P(4.4, -3.6), P(3.4, -4.6), P(0.6, -2.6), P(-0.4, -0.9), P(-3.4, -0.9),
  ] as Pt[], 0.62), wood, { shadow: 0.42, radius: 3.4, pivot: hand, rim: 0.5, line: 0.46 })
  // The drawn band, slack when idle and taut at the extreme.
  ctx.save()
  ctx.strokeStyle = '#4A3020'
  ctx.lineWidth = 0.55
  ctx.stroke(curve([P(3.9, 4.1), P(-1.2 - t * 3, 0), P(3.9, -4.1)] as Pt[]))
  ctx.restore()
  if (t > 0.5) {
    paint(ctx, ellipsePath(P(-1.2 - t * 3, 0)[0], P(-1.2 - t * 3, 0)[1], 1.1, 1.1), cel(PAL.ember), {
      shadow: 0.35, radius: 1.1, pivot: hand, rim: 0.4, line: 0.4,
    })
  }
}

const fist = (ctx: CanvasRenderingContext2D, hand: Pt, angle: number, t: number) => {
  // The stretch: a tapered tube from the wrist out to an oversized fist, with a
  // speed line down its length so the arm reads as travelling, not as long.
  const skin = skinCel(PAL.skin)
  const reach = 5 + t * 14
  const c = Math.cos(angle)
  const sn = Math.sin(angle)
  const tip: Pt = [hand[0] + c * reach, hand[1] + sn * reach]
  paint(ctx, blob([
    [hand[0] - sn * 1.6, hand[1] + c * 1.6],
    [tip[0] - sn * 2.5, tip[1] + c * 2.5],
    [tip[0] + sn * 2.5, tip[1] - c * 2.5],
    [hand[0] + sn * 1.6, hand[1] - c * 1.6],
  ] as Pt[], 0.4), skin, { shadow: 0.44, radius: 2.5, pivot: hand, rim: 0.55, line: 0.46 })
  paint(ctx, blob([
    [tip[0] - c * 1.6 - sn * 3.1, tip[1] - sn * 1.6 + c * 3.1],
    [tip[0] + c * 2.4 - sn * 2.4, tip[1] + sn * 2.4 + c * 2.4],
    [tip[0] + c * 3.2, tip[1] + sn * 3.2],
    [tip[0] + c * 2.4 + sn * 2.4, tip[1] + sn * 2.4 - c * 2.4],
    [tip[0] - c * 1.6 + sn * 3.1, tip[1] - sn * 1.6 - c * 3.1],
  ] as Pt[], 0.8), skin, { shadow: 0.42, radius: 3.2, pivot: tip, rim: 0.62, line: 0.5, occlusion: 0.2 })
  ctx.save()
  ctx.strokeStyle = skin.line
  ctx.lineWidth = 0.42
  ctx.lineCap = 'round'
  ctx.stroke(curve([
    [tip[0] + c * 1.2 - sn * 2.2, tip[1] + sn * 1.2 + c * 2.2],
    [tip[0] + c * 1.9, tip[1] + sn * 1.9],
    [tip[0] + c * 1.2 + sn * 2.2, tip[1] + sn * 1.2 - c * 2.2],
  ] as Pt[]))
  ctx.restore()
  if (t > 0) {
    ctx.save()
    ctx.globalAlpha = 0.3 * t
    ctx.strokeStyle = PAL.cream
    ctx.lineWidth = 0.55
    for (const off of [-2.1, 0.2, 2.1]) {
      ctx.stroke(curve([
        [hand[0] - sn * off - c * 4, hand[1] + c * off - sn * 4],
        [tip[0] - sn * off - c * 4.5, tip[1] + c * off - sn * 4.5],
      ] as Pt[]))
    }
    ctx.restore()
  }
}

const legKick = (ctx: CanvasRenderingContext2D, hand: Pt, angle: number, t: number) => {
  // Sanji strikes with his legs: the "weapon" is the burn the kick leaves.
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = 0.7 * (0.4 + t)
  ctx.fillStyle = PAL.ember
  ctx.fill(crescentPath(hand[0], hand[1], 9 + t * 4, 4 + t * 2, angle - 1.5, angle + 0.5))
  ctx.fillStyle = '#FFF0C0'
  ctx.fill(crescentPath(hand[0], hand[1], 9 + t * 4, 1.6 + t, angle - 1.1, angle + 0.25))
  ctx.restore()
}

const hoof = (ctx: CanvasRenderingContext2D, hand: Pt, angle: number, t: number) => {
  const c = cel('#C9895A')
  const reach = 2.5 + t * 5
  const tip: Pt = [hand[0] + Math.cos(angle) * reach, hand[1] + Math.sin(angle) * reach]
  paint(ctx, blob([
    [tip[0] - 3, tip[1] - 2.6], [tip[0] + 2.4, tip[1] - 3], [tip[0] + 3.4, tip[1] + 0.4],
    [tip[0] + 1.6, tip[1] + 3.2], [tip[0] - 2.6, tip[1] + 2.8],
  ] as Pt[], 0.85), c, { shadow: 0.42, radius: 3.2, pivot: tip, rim: 0.55, line: 0.5 })
  if (t > 0) {
    ctx.save()
    ctx.globalAlpha = 0.4 * t
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = PAL.chopperPink
    ctx.fill(ellipsePath(tip[0], tip[1], 4.6 + t * 2, 4.2 + t * 2))
    ctx.restore()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hair
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// The crew
// ─────────────────────────────────────────────────────────────────────────────

const LOOKS_BASE = {
  // ── Luffy: bare arms, an open vest with flying tails, shorts, sandals ──────
  luffy: {
    name: 'Luffy',
    build: { shoulder: 4.6, chest: 4.15, waist: 2.85, hip: 3.75 },
    face: { scar: true, eye: 1.04, brow: 1.15, iris: '#3A2438' },
    portrait: { expression: 'joy', turn: 0.34, tilt: -0.08 },
    banner: PAL.luffyRed,
    pal: P({
      skin: PAL.skin, hair: '#241C28', shirt: PAL.luffyRed, trousers: '#3C6BB0',
      boots: '#7A5030', accent: PAL.luffyRed, sash: PAL.gold, coat: PAL.luffyRed, trim: PAL.strawGold,
    }),
    arms: (p) => ({ sleeve: 0, glove: null, band: null, cloth: p.shirt }),
    legs: (p) => ({ trouser: 0.46, cloth: p.trousers, bare: p.skin, boot: p.boots, cuff: null, sole: cel('#4A2F1C') }),
    torso: (ctx, s, pal) => {
      drawBody(ctx, s, pal.skin, LOOKS.luffy.build)
      // Pectoral and abdominal shadow: two marks, not a diagram.
      const chest = bodyPoint(s, 0.62, 0)
      ctx.save()
      ctx.globalAlpha = 0.35
      ctx.strokeStyle = pal.skin.deep
      ctx.lineWidth = 0.5
      ctx.lineCap = 'round'
      ctx.stroke(curve([bodyPoint(s, 0.72, -2.2), bodyPoint(s, 0.6, 0), bodyPoint(s, 0.72, 2.2)] as Pt[]))
      ctx.stroke(curve([bodyPoint(s, 0.48, 0), bodyPoint(s, 0.2, 0)] as Pt[]))
      ctx.restore()
      // The scar across the chest — one confident stroke, nothing more.
      ctx.save()
      ctx.globalAlpha = 0.75
      ctx.strokeStyle = mix(pal.skin.deep, '#9A4438', 0.6)
      ctx.lineWidth = 0.62
      ctx.stroke(curve([bodyPoint(s, 0.74, -2.4), bodyPoint(s, 0.4, 1.9)] as Pt[]))
      ctx.restore()
      void chest

      for (const side of [-1, 1]) {
        const v = (x: number) => x * side
        const p = paintPanel(ctx, s, [
          [1.06, v(1.7)], [1.04, v(4.8)], [0.6, v(4.6)], [0.16, v(4.2)],
          [0.14, v(0.5)], [0.56, v(0.85)], [0.86, v(1.25)],
        ], pal.shirt, { radius: 3.4, pivot: bodyPoint(s, 0.6, v(2.8)) })
        bodyFolds(ctx, p, s, [
          [[0.98, v(4.1)], [0.66, v(3.2)], [0.2, v(3.4)]],
          [[0.9, v(2.2)], [0.52, v(1.8)]],
        ], pal.shirt.deep, 0.42)
      }
      collar(ctx, s, pal.shirt, 2.8, 0.1)
      waistWrap(ctx, s, pal.sash, -0.04, 0.22, 0.8)
      tails(ctx, s, pal.shirt, 0.16, 4.4, 6.0, 1.5, 0.62)
    },
    hairBack: (cx, cy, r, s) => spikeHair(cx - s.drag * 0.35, cy - r * 0.16, r * 1.14, 9, 1.5, 0.16, 1.7),
    hairFront: (cx, cy, r, s) => [
      [
        [cx - r * 1.0, cy - r * 0.52],
        lag([cx - r * 0.86, cy - r * 1.06], s, 0.5),
        lag([cx - r * 0.08, cy - r * 1.16], s, 0.4),
        [cx + r * 0.36, cy - r * 0.76],
        [cx - r * 0.16, cy - r * 0.62],
        [cx - r * 0.56, cy - r * 0.52],
      ] as Pt[],
      [
        [cx + r * 0.3, cy - r * 0.84],
        lag([cx + r * 0.9, cy - r * 0.78], s, 0.35),
        [cx + r * 0.98, cy - r * 0.26],
        [cx + r * 0.62, cy - r * 0.5],
      ] as Pt[],
    ],
    headgear: strawHat,
    attackStyle: 'punch',
    weapon: fist,
  },

  // ── Zoro: heavy shoulders, an open coat that flies, three scabbards ────────
  zoro: {
    name: 'Zoro',
    build: { shoulder: 5.15, chest: 4.6, waist: 3.3, hip: 4.05 },
    face: { eyeAspect: 0.82, eye: 0.96, brow: 1.35, blush: 0.4, iris: '#26483A' },
    portrait: { expression: 'smug', turn: 0.3, tilt: 0.05 },
    banner: PAL.zoroGreen,
    pal: P({
      skin: PAL.skin, hair: PAL.zoroGreen, shirt: '#EFE9DA', trousers: '#2A2C36',
      boots: '#1E2028', accent: PAL.zoroGreen, sash: PAL.zoroGreen, coat: '#26402E', trim: '#F0E4C8',
    }),
    arms: (p) => ({ sleeve: 0.42, cloth: p.shirt, cuff: null, band: null }),
    legs: (p) => ({ trouser: 1, cloth: p.trousers, boot: p.boots, shaft: 0.45, cuff: p.boots, sole: p.boots }),
    backCloth: (ctx, s, pal) => {
      // The coat back: one big shape that lags the body and gives Zoro the
      // widest silhouette of the six.
      const left = bodyPoint(s, 0.9, -5.6)
      const right = bodyPoint(s, 0.9, 5.2)
      paint(ctx, blob(hemShape(left, right, 15, s, 1.35), 0.85), pal.coat, {
        shadow: 0.52, radius: 6, pivot: bodyPoint(s, 0.4, 0), rim: 0.4, line: 0.5, occlusion: 0.28,
      })
    },
    torso: (ctx, s, pal) => {
      drawBody(ctx, s, pal.shirt, LOOKS.zoro.build)
      // Open shirt: a wedge of chest down the middle.
      paintPanel(ctx, s, [
        [1.04, -2.0], [1.04, 2.0], [0.52, 1.1], [0.52, -1.1],
      ], pal.skin, { line: 0, shadow: 0.4, radius: 2 })
      for (const side of [-1, 1]) {
        const v = (x: number) => x * side
        const p = paintPanel(ctx, s, [
          [1.08, v(2.2)], [1.02, v(5.7)], [0.58, v(5.5)], [0.06, v(5.0)],
          [0.04, v(2.4)], [0.5, v(2.2)], [0.84, v(2.0)],
        ], pal.coat, { radius: 3.8, pivot: bodyPoint(s, 0.6, v(3.6)) })
        bodyFolds(ctx, p, s, [
          [[1.0, v(4.9)], [0.62, v(3.9)], [0.12, v(4.2)]],
          [[0.86, v(2.9)], [0.44, v(2.9)]],
        ], pal.coat.deep, 0.45)
      }
      collar(ctx, s, pal.coat, 3.4, 0.18)
      // The haramaki: thick, and the one bright horizontal on a dark figure.
      waistWrap(ctx, s, pal.sash, -0.06, 0.3, 0.85)
    },
    hairBack: (cx, cy, r, s) => spikeHair(cx - s.drag * 0.3, cy - r * 0.26, r * 1.06, 11, 1.8, 0.22, 2.3),
    hairFront: (cx, cy, r, s) => [
      [
        [cx - r * 0.94, cy - r * 0.5],
        lag([cx - r * 0.52, cy - r * 1.1], s, 0.4),
        lag([cx + r * 0.5, cy - r * 1.06], s, 0.35),
        [cx + r * 0.94, cy - r * 0.52],
        [cx + r * 0.4, cy - r * 0.68],
        [cx - r * 0.4, cy - r * 0.7],
      ] as Pt[],
    ],
    headgear: bandanaHead,
    props: (ctx, s, phase) => {
      if (phase !== 'behind') return
      // Three scabbards fanned off the far hip. Three is the whole point: two
      // would be any swordsman, three is only him.
      const hip = bodyPoint(s, 0.2, -3.2)
      for (let i = 0; i < 3; i++) {
        const a = 2.5 + i * 0.13
        const c = cel(['#232630', '#3E4250', '#151820'][i])
        const tip: Pt = [hip[0] + Math.cos(a) * 14.5, hip[1] + Math.sin(a) * 14.5]
        paint(ctx, limbFormLite(hip, tip, 0.85), c, {
          shadow: 0.5, radius: 1.2, pivot: hip, rim: 0.4, line: 0.42,
        })
        // Hilt and guard on the near end, where they break the silhouette.
        const grip: Pt = [hip[0] - Math.cos(a) * 4.4, hip[1] - Math.sin(a) * 4.4]
        paint(ctx, limbFormLite(hip, grip, 0.72), cel(['#7A2A32', '#2E5C46', '#C0A050'][i]), {
          shadow: 0.44, radius: 1, pivot: grip, line: 0.4,
        })
        paint(ctx, ellipsePath(hip[0], hip[1], 1.5, 0.5, a), cel(PAL.gold), {
          shadow: 0.4, radius: 1.4, pivot: hip, line: 0.38,
        })
      }
    },
    attackStyle: 'slash',
    weapon: katana,
  },

  // ── Nami: crop top, bare midriff, a skirt that swings, a long hair fall ────
  nami: {
    name: 'Nami',
    build: { shoulder: 4.05, chest: 3.85, waist: 2.45, hip: 3.65 },
    face: { eye: 1.14, lash: 1.3, brow: 0.85, blush: 1.3, iris: '#6B3A1C' },
    portrait: { expression: 'smug', turn: 0.28, tilt: 0.06 },
    banner: PAL.namiOrange,
    pal: P({
      skin: '#FBD6B2', hair: PAL.namiOrange, shirt: '#FAF4E6', trousers: '#3C7CC0',
      boots: '#2A3350', accent: PAL.namiOrange, sash: '#3C7CC0', coat: '#3C7CC0', trim: PAL.namiOrange,
    }),
    arms: (p) => ({ sleeve: 0, band: p.trim, cloth: p.shirt }),
    legs: (p) => ({ trouser: 0, bare: p.skin, cloth: null, boot: p.boots, shaft: 0.34, cuff: p.trim, sole: p.boots }),
    torso: (ctx, s, pal) => {
      drawBody(ctx, s, pal.skin, LOOKS.nami.build)
      ctx.save()
      ctx.globalAlpha = 0.3
      ctx.strokeStyle = pal.skin.deep
      ctx.lineWidth = 0.42
      ctx.stroke(curve([bodyPoint(s, 0.42, -0.3), bodyPoint(s, 0.2, 0)] as Pt[]))
      ctx.restore()
      // Crop top: high hem, so the bare midriff does the silhouette work.
      const top = paintPanel(ctx, s, [
        [1.06, -4.3], [1.06, 4.3], [0.86, 4.5], [0.62, 4.4],
        [0.5, 0], [0.62, -4.4], [0.86, -4.5],
      ], pal.shirt, { radius: 4.2, pivot: bodyPoint(s, 0.78, 0) })
      // One stripe. A striped top is a costume; a stripey top is noise.
      const stripe = blob([
        bodyPoint(s, 0.82, -4.5), bodyPoint(s, 0.82, 4.5),
        bodyPoint(s, 0.7, 4.5), bodyPoint(s, 0.7, -4.5),
      ] as Pt[], 0.3)
      ctx.save()
      ctx.clip(top)
      paint(ctx, stripe, pal.accent, { shadow: 0.4, radius: 4, pivot: bodyPoint(s, 0.76, 0), line: 0 })
      ctx.restore()
      bodyFolds(ctx, top, s, [
        [[1.0, -3.2], [0.74, -2.2], [0.56, -2.6]],
        [[1.0, 3.0], [0.76, 2.2], [0.58, 2.6]],
      ], pal.shirt.deep, 0.4)
    },
    overLegs: (ctx, s, pal) => {
      // The skirt swings a beat behind the hips and is the reason Nami's
      // silhouette is a wedge where everyone else's is a column.
      const left = bodyPoint(s, 0.2, -4.0)
      const right = bodyPoint(s, 0.2, 4.0)
      const skirt = blob(hemShape(left, right, 8.4, s, 1.5), 0.82)
      paint(ctx, skirt, pal.coat, {
        shadow: 0.46, radius: 4.6, pivot: bodyPoint(s, 0.05, 0), rim: 0.5, line: 0.5, occlusion: 0.3,
      })
      ctx.save()
      ctx.clip(skirt)
      ctx.globalAlpha = 0.4
      ctx.strokeStyle = pal.coat.deep
      ctx.lineWidth = 0.5
      for (const [v, k] of [[-2.4, 1.1], [0.2, 1.0], [2.6, 0.9]] as Array<[number, number]>) {
        const a = bodyPoint(s, 0.18, v)
        ctx.stroke(curve([a, [a[0] + s.drag * k * 0.6, a[1] + 4.4], [a[0] + s.drag * k, a[1] + 8.2]] as Pt[]))
      }
      ctx.restore()
      waistWrap(ctx, s, pal.trim, 0.16, 0.3, 0.7)
    },
    hairBack: (cx, cy, r, s) => [
      [cx - r * 1.34, cy - r * 0.44],
      lag([cx - r * 0.78, cy - r * 1.2], s, 0.4),
      lag([cx + r * 0.56, cy - r * 1.22], s, 0.4),
      [cx + r * 1.3, cy - r * 0.38],
      lag([cx + r * 1.32, cy + r * 1.6], s, 1.6),
      lag([cx + r * 0.66, cy + r * 2.5], s, 2.6),
      lag([cx - r * 0.72, cy + r * 2.4], s, 3),
      lag([cx - r * 1.34, cy + r * 1.2], s, 2),
    ] as Pt[],
    hairFront: (cx, cy, r, s) => [
      [
        [cx - r * 1.06, cy - r * 0.66],
        lag([cx - r * 0.64, cy - r * 1.16], s, 0.4),
        lag([cx + r * 0.46, cy - r * 1.14], s, 0.35),
        [cx + r * 0.84, cy - r * 0.62],
        [cx + r * 0.26, cy - r * 0.86],
        [cx - r * 0.46, cy - r * 0.8],
      ] as Pt[],
      // A single loose strand in front of the ear, lagging hard.
      [
        [cx + r * 0.9, cy - r * 0.7],
        [cx + r * 1.2, cy - r * 0.3],
        lag([cx + r * 1.16, cy + r * 1.1], s, 1.3),
        lag([cx + r * 1.0, cy + r * 1.05], s, 1.3),
        [cx + r * 0.94, cy - r * 0.42],
      ] as Pt[],
    ],
    attackStyle: 'shoot',
    weapon: climaTact,
  },

  // ── Sanji: the narrowest silhouette — lapels, a tie, one visible eye ───────
  sanji: {
    name: 'Sanji',
    build: { shoulder: 4.45, chest: 3.9, waist: 2.65, hip: 3.5 },
    face: { swirlBrow: true, eye: 0.98, eyeAspect: 0.92, blush: 0.35, iris: '#245A80' },
    portrait: { expression: 'smug', turn: 0.36, tilt: -0.04 },
    banner: PAL.sanjiGold,
    pal: P({
      skin: PAL.skin, hair: PAL.sanjiGold, shirt: '#F4F0E4', trousers: '#161E38',
      boots: '#0E1428', accent: PAL.sanjiGold, sash: '#0E1428', coat: PAL.sanjiSuit, trim: '#8E2E3A',
    }),
    arms: (p) => ({ sleeve: 0.94, cloth: p.coat, cuff: p.shirt, band: null }),
    legs: (p) => ({ trouser: 1, cloth: p.trousers, boot: p.boots, cuff: null, sole: p.boots }),
    torso: (ctx, s, pal) => {
      drawBody(ctx, s, pal.shirt, LOOKS.sanji.build)
      // The tie: a thin vertical that keeps the eye travelling up to the face.
      paintPanel(ctx, s, [
        [1.0, -0.75], [1.0, 0.75], [0.66, 1.0], [0.34, 0.7], [0.34, -0.7], [0.66, -1.0],
      ], pal.trim, { radius: 1.2, pivot: bodyPoint(s, 0.7, 0), shadow: 0.42 })
      // Jacket: lapels open in a long V and close low at one button.
      for (const side of [-1, 1]) {
        const v = (x: number) => x * side
        const p = paintPanel(ctx, s, [
          [1.06, v(1.6)], [1.04, v(4.85)], [0.58, v(4.6)], [0.04, v(4.3)],
          [0.06, v(1.0)], [0.34, v(1.6)], [0.72, v(2.6)],
        ], pal.coat, { radius: 3.4, pivot: bodyPoint(s, 0.6, v(3)) })
        // The lapel is a second plane of the same cloth, lit differently.
        paintPanel(ctx, s, [
          [1.06, v(1.7)], [1.02, v(4.2)], [0.62, v(2.9)], [0.74, v(1.9)],
        ], pal.coat, { radius: 2.4, pivot: bodyPoint(s, 0.9, v(2.6)), shadow: 0.24, line: 0.44 })
        bodyFolds(ctx, p, s, [[[0.98, v(4.2)], [0.6, v(3.4)], [0.14, v(3.6)]]], pal.coat.deep, 0.5)
      }
      collar(ctx, s, pal.shirt, 2.2, 0.14)
      paint(ctx, ellipsePath(...bodyPoint(s, 0.24, 0.9), 0.42, 0.42), pal.accent, {
        shadow: 0.4, radius: 0.5, pivot: bodyPoint(s, 0.24, 0.9), line: 0.3,
      })
    },
    hairBack: (cx, cy, r, s) => spikeHair(cx - s.drag * 0.3, cy - r * 0.22, r * 1.04, 7, 1.4, 0.12, 3.1),
    hairFront: (cx, cy, r, s) => [
      // The fringe covers one eye entirely — Sanji's defining face shape.
      [
        [cx - r * 1.06, cy - r * 0.18],
        lag([cx - r * 0.9, cy - r * 1.06], s, 0.45),
        lag([cx + r * 0.38, cy - r * 1.14], s, 0.4),
        [cx + r * 0.9, cy - r * 0.66],
        [cx + r * 0.22, cy - r * 0.74],
        [cx - r * 0.26, cy + r * 0.16],
      ] as Pt[],
      [
        [cx + r * 0.5, cy - r * 0.98],
        lag([cx + r * 1.02, cy - r * 0.72], s, 0.3),
        [cx + r * 0.94, cy - r * 0.34],
        [cx + r * 0.6, cy - r * 0.62],
      ] as Pt[],
    ],
    attackStyle: 'kick',
    weapon: legKick,
  },

  // ── Usopp: overalls with a bib, a satchel, goggles, and that nose ──────────
  usopp: {
    name: 'Usopp',
    build: { shoulder: 4.25, chest: 3.9, waist: 2.85, hip: 3.7 },
    face: { nose: 0, eye: 1.05, brow: 1.1, blush: 0.9, freckles: true, iris: '#3A2214' },
    portrait: { expression: 'surprised', turn: 0.3, tilt: 0.08 },
    banner: PAL.usoppBrown,
    pal: P({
      skin: '#D89A6C', hair: '#2A1C14', shirt: '#E0BC62', trousers: '#4E8244',
      boots: '#5A3820', accent: PAL.usoppBrown, sash: '#5A3820', coat: '#4E8244', trim: '#C8A24A',
    }),
    arms: (p) => ({ sleeve: 0.36, cloth: p.shirt, cuff: null, band: p.accent }),
    legs: (p) => ({ trouser: 1, cloth: p.trousers, boot: p.boots, shaft: 0.3, cuff: p.accent, sole: p.boots }),
    torso: (ctx, s, pal) => {
      drawBody(ctx, s, pal.shirt, LOOKS.usopp.build)
      // Overall bib and straps: a shape nobody else in the cast has.
      const bib = paintPanel(ctx, s, [
        [0.78, -2.9], [0.78, 2.9], [0.4, 3.5], [0.02, 3.9], [0.02, -3.9], [0.4, -3.5],
      ], pal.coat, { radius: 3.6, pivot: bodyPoint(s, 0.4, 0) })
      bodyFolds(ctx, bib, s, [
        [[0.7, -1.6], [0.3, -1.9], [0.06, -1.4]],
        [[0.7, 1.8], [0.32, 2.1]],
      ], pal.coat.deep, 0.42)
      for (const side of [-1, 1]) {
        const v = (x: number) => x * side
        paintPanel(ctx, s, [
          [1.08, v(3.4)], [1.08, v(1.9)], [0.8, v(1.9)], [0.76, v(3.0)],
        ], pal.coat, { radius: 1.4, pivot: bodyPoint(s, 0.94, v(2.6)), shadow: 0.4 })
        paint(ctx, ellipsePath(...bodyPoint(s, 0.8, v(2.5)), 0.46, 0.46), pal.trim, {
          shadow: 0.36, radius: 0.5, pivot: bodyPoint(s, 0.8, v(2.5)), line: 0.32,
        })
      }
      // The satchel strap runs across the chest — a diagonal in a vertical body.
      paintPanel(ctx, s, [
        [1.06, -3.0], [0.94, -3.6], [0.06, 3.4], [0.16, 4.0],
      ], pal.accent, { radius: 1.2, pivot: bodyPoint(s, 0.55, 0), shadow: 0.42 })
    },
    hairBack: (cx, cy, r, s) => [
      [cx - r * 1.12, cy - r * 0.6],
      lag([cx - r * 0.42, cy - r * 1.4], s, 0.5),
      lag([cx + r * 0.62, cy - r * 1.3], s, 0.45),
      [cx + r * 1.08, cy - r * 0.5],
      lag([cx + r * 0.94, cy + r * 0.66], s, 0.9),
      lag([cx - r * 0.92, cy + r * 0.66], s, 1.1),
    ] as Pt[],
    hairFront: (cx, cy, r, s) => [
      [
        [cx - r * 1.02, cy - r * 0.56],
        lag([cx - r * 0.66, cy - r * 1.2], s, 0.45),
        lag([cx - r * 0.02, cy - r * 1.16], s, 0.4),
        [cx + r * 0.24, cy - r * 0.76],
        [cx - r * 0.34, cy - r * 0.86],
        [cx - r * 0.7, cy - r * 0.72],
      ] as Pt[],
      [
        [cx + r * 0.16, cy - r * 0.86],
        lag([cx + r * 0.66, cy - r * 1.14], s, 0.4),
        [cx + r * 1.0, cy - r * 0.56],
        [cx + r * 0.62, cy - r * 0.78],
      ] as Pt[],
    ],
    headgear: (ctx, cx, cy, r, _s) => {
      goggles(ctx, cx, cy, r)
      // The nose. It is the character, so it is drawn as a real tapering form
      // with its own terminator rather than a triangle stuck on the face.
      const skin = skinCel('#D89A6C')
      paint(ctx, blob([
        [cx + r * 0.5, cy + r * 0.06],
        [cx + r * 1.7, cy + r * 0.24],
        [cx + r * 2.5, cy + r * 0.46],
        [cx + r * 1.6, cy + r * 0.64],
        [cx + r * 0.56, cy + r * 0.7],
      ] as Pt[], 0.6), skin, {
        shadow: 0.46, radius: r, pivot: [cx + r, cy + r * 0.2], rim: 0.5, line: 0.5, occlusion: 0.2,
      })
    },
    props: (ctx, s, phase) => {
      if (phase !== 'behind') return
      const hip = bodyPoint(s, 0.12, -4.4)
      const c = cel(PAL.usoppBrown)
      paint(ctx, blob([
        [hip[0] - 4.2, hip[1] - 1.6], [hip[0] + 0.6, hip[1] - 2.0],
        [hip[0] + 1.0, hip[1] + 3.0], [hip[0] - 4.6, hip[1] + 3.4],
      ] as Pt[], 0.55), c, { shadow: 0.5, radius: 3, pivot: hip, rim: 0.4, line: 0.46 })
      paint(ctx, blob([
        [hip[0] - 4.4, hip[1] - 1.8], [hip[0] + 0.8, hip[1] - 2.2],
        [hip[0] + 0.9, hip[1] - 0.4], [hip[0] - 4.5, hip[1] - 0.1],
      ] as Pt[], 0.4), cel(PAL.wood), { shadow: 0.44, radius: 2, pivot: hip, line: 0.42 })
    },
    attackStyle: 'shoot',
    weapon: sling,
  },

  // ── Chopper: a small round body, shorts, hooves, and those antlers ─────────
  chopper: {
    name: 'Chopper',
    build: { shoulder: 4.5, chest: 4.6, waist: 3.85, hip: 4.15 },
    face: { eye: 1.42, muzzle: true, blush: 1.9, nose: 0, brow: 0.8, iris: '#38221E' },
    portrait: { expression: 'joy', turn: 0.26, tilt: 0.1 },
    banner: PAL.chopperPink,
    pal: P({
      skin: '#E8C79C', hair: '#B0723E', shirt: PAL.luffyRed, trousers: '#3C6BB0',
      boots: '#8A5A32', accent: PAL.chopperPink, sash: PAL.gold, coat: PAL.luffyRed, trim: PAL.cream,
    }),
    arms: (p) => ({ sleeve: 0.34, cloth: p.shirt, glove: p.boots, cuff: null, grip: 1 }),
    legs: (p) => ({ trouser: 0.42, cloth: p.trousers, bare: p.skin, boot: p.boots, cuff: null, sole: null }),
    torso: (ctx, s, pal) => {
      drawBody(ctx, s, pal.skin, LOOKS.chopper.build)
      // A pale blaze up the belly — the marking that says "animal".
      paintPanel(ctx, s, [
        [0.68, -2.0], [0.68, 2.0], [0.3, 2.4], [-0.02, 1.8], [-0.02, -1.8], [0.3, -2.4],
      ], cel(mix(pal.skin.light, '#FFFFFF', 0.4), { lineDarkness: 0.4 }), {
        radius: 2.4, pivot: bodyPoint(s, 0.34, 0), line: 0, shadow: 0.36,
      })
      const shirt = paintPanel(ctx, s, [
        [1.08, -4.8], [1.08, 4.8], [0.86, 5.0], [0.5, 4.6],
        [0.42, 0], [0.5, -4.6], [0.86, -5.0],
      ], pal.shirt, { radius: 4.8, pivot: bodyPoint(s, 0.76, 0) })
      bodyFolds(ctx, shirt, s, [
        [[1.0, -3.4], [0.7, -2.6], [0.48, -3.0]],
        [[1.0, 3.2], [0.72, 2.4], [0.5, 2.8]],
      ], pal.shirt.deep, 0.4)
      collar(ctx, s, pal.trim, 2.6, 0.1)
    },
    hairBack: (cx, cy, r, s) => [
      [cx - r * 1.26, cy - r * 0.3],
      lag([cx - r * 0.94, cy - r * 1.14], s, 0.35),
      lag([cx + r * 0.94, cy - r * 1.14], s, 0.35),
      [cx + r * 1.26, cy - r * 0.3],
      [cx + r * 1.12, cy + r * 0.66],
      [cx - r * 1.12, cy + r * 0.66],
    ] as Pt[],
    hairFront: (cx, cy, r, _s) => [
      [
        [cx - r * 1.06, cy - r * 0.32],
        [cx - r * 0.62, cy - r * 1.02],
        [cx + r * 0.62, cy - r * 1.0],
        [cx + r * 1.04, cy - r * 0.3],
        [cx + r * 0.4, cy - r * 0.56],
        [cx - r * 0.4, cy - r * 0.58],
      ] as Pt[],
      // Ears, low and wide — they widen the head without touching the hat.
      [
        [cx - r * 1.0, cy - r * 0.34],
        [cx - r * 1.62, cy - r * 0.24],
        [cx - r * 1.7, cy + r * 0.34],
        [cx - r * 0.98, cy + r * 0.2],
      ] as Pt[],
      [
        [cx + r * 1.0, cy - r * 0.3],
        [cx + r * 1.64, cy - r * 0.2],
        [cx + r * 1.7, cy + r * 0.36],
        [cx + r * 0.98, cy + r * 0.22],
      ] as Pt[],
    ],
    headgear: topHat,
    attackStyle: 'punch',
    weapon: hoof,
  },
} satisfies Record<string, Look>

/**
 * The playable roster.
 *
 * Built in two steps so the four newest members can start as re-dressed
 * versions of an existing rig entry and be replaced one at a time without the
 * type ever going incomplete.
 */
/**
 * The playable roster.
 *
 * The first six are authored here; the four newest live in `crew2.ts` so this
 * file stays navigable. Both halves implement the same `Look` contract.
 */
export const LOOKS: Record<CrewId, Look> = {
  ...LOOKS_BASE,
  ...CREW_TWO,
}

/** Scale of the whole figure. Chopper is small; the rest are adults. */
export const CREW_SCALE: Record<CrewId, number> = {
  luffy: 1,
  zoro: 1.05,
  nami: 0.97,
  sanji: 1.03,
  usopp: 0.99,
  chopper: 0.78,
  robin: 0.99,
  franky: 1.12,
  brook: 1.08,
  jinbe: 1.14,
}

export { SEG, mix }
export type { Look } from './parts'
