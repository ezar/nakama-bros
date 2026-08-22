import type { SpriteSheet } from '../types'
import { SheetBuilder } from './atlas'
import { adjust, cel, mix, rgba, type Cel } from './color'
import { PAL } from './palette'
import {
  blob, crescentPath, curve, ellipsePath, glint, KEY_LIGHT, limbPath, paint, radialFill,
  roundRectPath, type Pt, type Surface,
} from './ink'

/**
 * Pickups and scenery props.
 *
 * Two families live here. Pickups spin, pulse or wave, because a static object
 * on busy terrain disappears; their art is centred in the frame and floats.
 * Props are the level designer's furniture — barrels, crates, palms, signposts
 * — and those are drawn standing on the BOTTOM EDGE of their frame, because the
 * sheet origin is bottom-centre, so dropping one on a tile row lands it exactly
 * on the ground with no per-prop offset to remember.
 */

type Painter = (s: Surface, t: number) => void

/** The key light as a 3D direction, for shading forms that actually turn. */
const L3 = ((): [number, number, number] => {
  const v: [number, number, number] = [KEY_LIGHT.x, KEY_LIGHT.y, 0.55]
  const m = Math.hypot(v[0], v[1], v[2])
  return [v[0] / m, v[1] / m, v[2] / m]
})()

/**
 * The axis the devil-fruit whorl spirals around, plus a tangent frame for it.
 * It is deliberately NOT the view axis: tilting it up-left is what pushes half
 * of every turn over the horizon and stops the swirl reading as a flat decal.
 */
const WHORL = ((): { a: [number, number, number]; e1: [number, number, number]; e2: [number, number, number] } => {
  const n = (v: [number, number, number]): [number, number, number] => {
    const m = Math.hypot(v[0], v[1], v[2]) || 1
    return [v[0] / m, v[1] / m, v[2] / m]
  }
  const a = n([-0.3, -0.34, 0.89])
  const d: [number, number, number] = [1, 0, 0]
  const k = d[0] * a[0] + d[1] * a[1] + d[2] * a[2]
  const e1 = n([d[0] - a[0] * k, d[1] - a[1] * k, d[2] - a[2] * k])
  const e2: [number, number, number] = [
    a[1] * e1[2] - a[2] * e1[1],
    a[2] * e1[0] - a[0] * e1[2],
    a[0] * e1[1] - a[1] * e1[0],
  ]
  return { a, e1, e2 }
})()

// ─────────────────────────────────────────────────────────────────────────────
// Shared bits of carpentry
// ─────────────────────────────────────────────────────────────────────────────

/** Wood grain: a few off-parallel hairlines, never evenly spaced. */
function grain(
  s: Surface, x: number, y: number, w: number, h: number, c: Cel, n = 4, seed = 1,
): void {
  const ctx = s.ctx
  ctx.save()
  ctx.strokeStyle = rgba(c.deep, 0.5)
  ctx.lineWidth = 0.3
  for (let i = 0; i < n; i++) {
    const f = (Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453) % 1
    const u = (i + 0.5) / n + f * 0.18
    const yy = y + u * h
    ctx.beginPath()
    ctx.moveTo(x + w * 0.06, yy)
    ctx.bezierCurveTo(
      x + w * 0.35, yy + Math.abs(f) * 0.9 - 0.4,
      x + w * 0.65, yy - Math.abs(f) * 0.9 + 0.4,
      x + w * 0.94, yy,
    )
    ctx.stroke()
  }
  ctx.restore()
}

/** A forged iron band with a rivet — barrels, chests, masts. */
function ironBand(
  s: Surface, x: number, y: number, w: number, h: number, rivet = true,
): void {
  const ctx = s.ctx
  const iron = cel(PAL.slate)
  paint(ctx, roundRectPath(x, y, w, h, h * 0.35), iron, {
    shadow: 0.46, radius: h * 0.6, pivot: [x + w / 2, y + h / 2], rim: 0.32, line: 0.35,
  })
  if (rivet) {
    ctx.fillStyle = iron.light
    ctx.fill(ellipsePath(x + w * 0.16, y + h / 2, 0.55, 0.55))
    ctx.fillStyle = iron.deep
    ctx.fill(ellipsePath(x + w * 0.16 + 0.25, y + h / 2 + 0.25, 0.3, 0.3))
  }
}

/** A nail head driven into a plank or a poster. */
function nail(s: Surface, x: number, y: number, r = 0.85): void {
  const ctx = s.ctx
  ctx.fillStyle = PAL.inkSoft
  ctx.fill(ellipsePath(x + 0.2, y + 0.3, r, r))
  ctx.fillStyle = PAL.steel
  ctx.fill(ellipsePath(x, y, r, r))
  ctx.fillStyle = PAL.mist
  ctx.fill(ellipsePath(x - r * 0.3, y - r * 0.35, r * 0.4, r * 0.32))
}

/**
 * Fake lettering. Real glyphs at this size turn to mud and read as a font bug;
 * a rhythm of bars of varying length reads as printed text at a glance and is
 * honest about being decorative.
 */
function textBars(
  s: Surface, x: number, y: number, w: number, h: number, color: string, seed = 3, gap = 0.7,
): void {
  const ctx = s.ctx
  ctx.save()
  ctx.fillStyle = color
  let cx = x
  let i = 0
  while (cx < x + w - 0.6) {
    const f = Math.abs((Math.sin(seed * 91.7 + i * 37.13) * 4375.5) % 1)
    const bw = 0.7 + f * 1.5
    if (cx + bw > x + w) break
    ctx.fillRect(cx, y + (f > 0.75 ? -h * 0.18 : 0), bw, h * (f > 0.75 ? 1.18 : 1))
    cx += bw + gap
    i++
  }
  ctx.restore()
}

/** A grass tuft to break the join between a prop and the ground. */
function tuft(s: Surface, x: number, y: number, w: number, hgt: number, seed = 1): void {
  const ctx = s.ctx
  const g = cel(PAL.grass)
  for (let i = 0; i < 5; i++) {
    const f = Math.abs((Math.sin(seed * 33.7 + i * 12.9) * 4375.5) % 1)
    const bx = x + (i / 4 - 0.5) * w
    const tip = y - hgt * (0.5 + f * 0.7)
    const lean = (i - 2) * 0.9 + (f - 0.5) * 2
    ctx.fillStyle = i % 2 ? g.shade : g.core
    ctx.fill(blob([
      [bx - 0.7, y], [bx + lean * 0.6, tip + hgt * 0.3], [bx + lean, tip], [bx + 0.7, y],
    ] as Pt[], 0.5))
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Berry — the coin, and the single most-seen sprite in the game
// ─────────────────────────────────────────────────────────────────────────────

const BERRY_R = 6.3
/** Half the coin's thickness, in world units. */
const BERRY_T = 1.15

/**
 * The convex hull of a disc rotated about its vertical axis: two face ellipses
 * offset by the thickness, joined by the straight cylindrical edge. This is the
 * whole reason the spin reads as a solid object rather than a squashing oval.
 */
function coinHull(cx: number, cy: number, f: number, e: number, r: number): Path2D {
  const p = new Path2D()
  const l = cx - e
  const rr = cx + e
  const fw = Math.max(0.01, f)
  p.ellipse(l, cy, fw, r, 0, Math.PI / 2, Math.PI * 1.5)
  p.lineTo(rr, cy - r)
  p.ellipse(rr, cy, fw, r, 0, -Math.PI / 2, Math.PI / 2)
  p.closePath()
  return p
}

/** The stamped skull on the obverse, drawn in coin-local units around (0,0). */
function berryObverse(s: Surface, g: Cel): void {
  const ctx = s.ctx
  const emboss = (dx: number, dy: number, color: string) => {
    ctx.save()
    ctx.translate(dx, dy)
    ctx.fillStyle = color
    ctx.fill(blob([
      [0, -3.1], [2.4, -2.2], [2.5, 0.2], [1.5, 1.1], [-1.5, 1.1], [-2.5, 0.2], [-2.4, -2.2],
    ] as Pt[], 0.85))
    ctx.fill(roundRectPath(-1.5, 0.7, 3, 1.9, 0.7))
    ctx.restore()
  }
  // Struck metal: the die pushes the relief up, so the pocket sits down-right
  // of the raised face. Two offset copies is all that takes.
  emboss(0.42, 0.5, g.deep)
  emboss(0, 0, g.light)
  ctx.fillStyle = g.deep
  ctx.fill(ellipsePath(-1.05, -1.35, 0.85, 0.95, -0.2))
  ctx.fill(ellipsePath(1.05, -1.35, 0.85, 0.95, 0.2))
  ctx.fill(blob([[0, -0.5], [0.55, 0.35], [-0.55, 0.35]] as Pt[], 0.3))
  ctx.fillRect(-0.9, 1.2, 0.42, 1.1)
  ctx.fillRect(-0.2, 1.2, 0.42, 1.1)
  ctx.fillRect(0.5, 1.2, 0.42, 1.1)
}

/** Crossed bones on the reverse, so the flip has something to land on. */
function berryReverse(s: Surface, g: Cel): void {
  const ctx = s.ctx
  const bone = (a: number, color: string, dx: number, dy: number) => {
    ctx.save()
    ctx.translate(dx, dy)
    ctx.rotate(a)
    ctx.fillStyle = color
    ctx.fill(roundRectPath(-3.1, -0.42, 6.2, 0.84, 0.42))
    for (const x of [-3.1, 3.1]) {
      ctx.fill(ellipsePath(x, -0.62, 0.7, 0.62))
      ctx.fill(ellipsePath(x, 0.62, 0.7, 0.62))
    }
    ctx.restore()
  }
  bone(0.72, g.deep, 0.4, 0.5)
  bone(-0.72, g.deep, 0.4, 0.5)
  bone(0.72, g.light, 0, 0)
  bone(-0.72, g.light, 0, 0)
}

function drawBerryAt(s: Surface, theta: number): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const cy = s.h / 2
  const g = cel(PAL.gold)
  const edge = cel(PAL.goldDeep)

  const ct = Math.cos(theta)
  const st = Math.sin(theta)
  const f = BERRY_R * Math.abs(ct)
  const e = BERRY_T * Math.abs(st)
  const front = ct >= 0 ? 1 : -1
  const faceX = cx + BERRY_T * st * front

  const hull = coinHull(cx, cy, f, e, BERRY_R)

  // The cylindrical edge first, as the whole silhouette; the face is stamped
  // over it, so whatever is left showing is genuine coin thickness.
  paint(ctx, hull, g, {
    shadow: 0.52, radius: BERRY_R, pivot: [cx, cy], line: 0.45, lineColor: edge.line,
  })

  // Milling. Each ridge is a real point on the coin's rim circle, carried
  // through the same rotation, so the ridges crowd toward the silhouette and
  // the bright band sweeps around the rim as the coin turns.
  ctx.save()
  ctx.clip(hull)
  ctx.lineCap = 'butt'
  const ridges = 20
  for (let i = 0; i < ridges; i++) {
    const psi = (i / ridges) * Math.PI * 2
    const cp = Math.cos(psi)
    const sp = Math.sin(psi)
    // Outward normal of the rim at this point, after the same turn. The rim is
    // only visible where it faces the camera — which is always the side the
    // face is NOT on, and that is what sells the thickness.
    const nx = cp * ct
    const ny = sp
    const nz = -cp * st
    if (nz <= 0.02) continue
    const lit = nx * L3[0] + ny * L3[1] + nz * L3[2]
    const x = cx + BERRY_R * cp * ct
    const y = cy + BERRY_R * sp
    // Milling is texture, not the subject: three values only, and the bright
    // one is a narrow band, so the rim never out-shouts the stamped face.
    ctx.strokeStyle = lit > 0.72 ? PAL.cream : lit > 0.05 ? g.core : edge.shade
    ctx.lineWidth = 0.4
    ctx.beginPath()
    ctx.moveTo(x - BERRY_T * st * 1.1, y)
    ctx.lineTo(x + BERRY_T * st * 1.1, y)
    ctx.stroke()
  }
  ctx.restore()

  if (f < 0.35) {
    glint(ctx, cx - e * 0.25, cy - BERRY_R * 0.5, 0.32, 1.5, 0, PAL.white, 0.6)
    return
  }

  // The face, drawn upright and squeezed horizontally, so every mark on it
  // foreshortens the way a real stamping would.
  const k = f / BERRY_R
  const face = ellipsePath(faceX, cy, f, BERRY_R)
  paint(ctx, face, g, {
    shadow: 0.34, radius: BERRY_R, pivot: [faceX, cy], rim: 0.75, line: 0.4,
  })

  ctx.save()
  ctx.clip(face)
  ctx.translate(faceX, cy)
  ctx.scale(k, 1)
  // Beading around the rim, then the field, then the device.
  ctx.fillStyle = g.deep
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2
    ctx.fill(ellipsePath(Math.cos(a) * 5.35, Math.sin(a) * 5.35, 0.42, 0.42))
  }
  ctx.strokeStyle = rgba(g.deep, 0.75)
  ctx.lineWidth = 0.4
  ctx.stroke(ellipsePath(0, 0, 4.5, 4.5))
  if (front > 0) berryObverse(s, g)
  else berryReverse(s, g)
  // Specular: a crescent hugging the lit edge of the disc, not a blob parked on
  // the device. Under the same squeeze it foreshortens with the face.
  ctx.fillStyle = rgba(PAL.white, 0.7)
  ctx.fill(crescentPath(0, 0, 6, 1, Math.PI * 1.03, Math.PI * 1.42))
  ctx.fillStyle = rgba(PAL.cream, 0.34)
  ctx.fill(crescentPath(0, 0, 6, 1.5, Math.PI * 1.44, Math.PI * 1.62))
  ctx.restore()
}

/**
 * The spin, laid out by hand.
 *
 * A coin turning at constant angular speed spends most of its cycle nearly
 * edge-on, which on screen is a row of gold slivers. So the angles are picked
 * instead of sampled: the two readable faces are held, the transition poses are
 * short, and no frame is ever thinner than a solid, milled slab.
 */
const BERRY_SPIN: Array<{ theta: number; dur: number }> = (() => {
  const half = [
    { theta: 0, dur: 0.082 },
    { theta: 0.74, dur: 0.05 },
    { theta: 1.33, dur: 0.028 },
    { theta: Math.PI - 1.33, dur: 0.028 },
    { theta: Math.PI - 0.74, dur: 0.05 },
  ]
  return [...half, ...half.map((f) => ({ theta: f.theta + Math.PI, dur: f.dur }))]
})()

// ─────────────────────────────────────────────────────────────────────────────
// Meat, fruit, fragment, 1-up
// ─────────────────────────────────────────────────────────────────────────────

/** Meat — the health pickup, and the funniest silhouette in the set. */
function drawMeat(s: Surface, t: number): void {
  const ctx = s.ctx
  const cx = s.w / 2 + 1
  const cy = s.h / 2 + Math.sin(t * Math.PI * 2) * 0.9
  const meat = cel('#C4563A')
  const bone = cel('#F4E8D0')
  const body = blob([
    [cx - 1, cy - 5.6], [cx + 6, cy - 4], [cx + 7.4, cy + 1.4],
    [cx + 3, cy + 5.4], [cx - 2.6, cy + 4], [cx - 3.4, cy - 1.4],
  ] as Pt[], 0.9)
  paint(ctx, body, meat, {
    shadow: 0.4, radius: 6, pivot: [cx + 2, cy], rim: 0.75, line: 0.6, occlusion: 0.4,
  })
  // A seared crust band and a couple of char marks, so it is not one flat lump.
  ctx.save()
  ctx.clip(body)
  ctx.strokeStyle = rgba(adjust('#C4563A', { light: 0.55, sat: 1.2 }), 0.85)
  ctx.lineWidth = 1.1
  ctx.stroke(curve([[cx - 2.4, cy + 2.6], [cx + 1.4, cy + 4.2], [cx + 5.2, cy + 2.6]] as Pt[]))
  ctx.strokeStyle = rgba('#F0A870', 0.5)
  ctx.lineWidth = 0.7
  ctx.stroke(curve([[cx - 1.2, cy - 3.4], [cx + 2.6, cy - 4.1], [cx + 5.6, cy - 2.4]] as Pt[]))
  ctx.restore()

  paint(ctx, roundRectPath(cx - 8.6, cy - 1.4, 6.6, 2.6, 1.2), bone, {
    shadow: 0.36, radius: 3, pivot: [cx - 5, cy], rim: 0.6, line: 0.5,
  })
  paint(ctx, ellipsePath(cx - 8.6, cy - 1.8, 1.9, 1.6), bone, {
    shadow: 0.36, radius: 2, pivot: [cx - 8.6, cy - 1.8], line: 0.5,
  })
  paint(ctx, ellipsePath(cx - 8.6, cy + 1.4, 1.9, 1.6), bone, {
    shadow: 0.36, radius: 2, pivot: [cx - 8.6, cy + 1.4], line: 0.5,
  })
  glint(ctx, cx + 1.6, cy - 3, 2, 1, -0.5, PAL.white, 0.55)
}

/**
 * Devil fruit — the power-up. The swirl is the whole identity, so it is not a
 * flat pinwheel: every band is a spiral traced on the surface of a sphere, the
 * back hemisphere is culled, the stroke thickens toward the viewer and each
 * segment is lit by the same key light as the fruit's own terminator. The
 * result turns rather than spins.
 */
function fruit(color: string) {
  return (s: Surface, t: number): void => {
    const ctx = s.ctx
    const cx = s.w / 2
    const cy = s.h / 2 + Math.sin(t * Math.PI * 2) * 0.8
    const c = cel(color)
    const R = 6.6
    const body = ellipsePath(cx, cy, R, R * 1.04)
    paint(ctx, body, c, {
      shadow: 0.38, radius: R, pivot: [cx, cy], rim: 0.85, line: 0.6, occlusion: 0.35,
    })

    ctx.save()
    ctx.clip(body)
    ctx.lineCap = 'round'
    const spin = t * Math.PI * 2
    const arms = 3
    const steps = 30
    for (let b = 0; b < arms; b++) {
      let prev: { x: number; y: number; z: number } | null = null
      for (let k = 0; k <= steps; k++) {
        const u = k / steps
        // Spiral out from the whorl's eye, in the tangent frame of an axis that
        // is tilted off the view direction — so the arms crowd near the eye,
        // stretch toward the limb, and half of each turn goes over the horizon.
        const polar = 1.52 * Math.pow(u, 1.3)
        const az = spin + (b / arms) * Math.PI * 2 + u * 4.2
        const sa = Math.sin(polar)
        const ca = Math.cos(polar)
        const cw = Math.cos(az) * sa
        const sw = Math.sin(az) * sa
        const p = {
          x: WHORL.a[0] * ca + WHORL.e1[0] * cw + WHORL.e2[0] * sw,
          y: WHORL.a[1] * ca + WHORL.e1[1] * cw + WHORL.e2[1] * sw,
          z: WHORL.a[2] * ca + WHORL.e1[2] * cw + WHORL.e2[2] * sw,
        }
        if (prev && prev.z > 0.04 && p.z > 0.04) {
          const mz = (prev.z + p.z) / 2
          const mx = (prev.x + p.x) / 2
          const my = (prev.y + p.y) / 2
          const litv = mx * L3[0] + my * L3[1] + mz * L3[2]
          ctx.lineWidth = 0.62 + 1.15 * mz
          ctx.strokeStyle = litv > 0.16 ? mix(c.shade, c.deep, 0.35) : c.deep
          ctx.beginPath()
          ctx.moveTo(cx + prev.x * R * 0.99, cy + prev.y * R * 1.03)
          ctx.lineTo(cx + p.x * R * 0.99, cy + p.y * R * 1.03)
          ctx.stroke()
          // A lit edge along the crest of the ribbon, only where the sun sees it.
          if (litv > 0.52) {
            ctx.lineWidth = 0.32
            ctx.strokeStyle = rgba(c.light, 0.42)
            ctx.beginPath()
            ctx.moveTo(cx + prev.x * R * 0.99 - 0.34, cy + prev.y * R * 1.03 - 0.46)
            ctx.lineTo(cx + p.x * R * 0.99 - 0.34, cy + p.y * R * 1.03 - 0.46)
            ctx.stroke()
          }
        }
        prev = p
      }
    }
    ctx.restore()

    glint(ctx, cx - 2.5, cy - 3.2, 1.9, 1.25, -0.6, PAL.white, 0.75)
    paint(ctx, roundRectPath(cx - 0.55, cy - 10.6, 1.1, 4.2, 0.55), cel(PAL.grassDeep), {
      shadow: 0.4, radius: 1.2, pivot: [cx, cy - 8.4], line: 0.4,
    })
    paint(ctx, blob([
      [cx, cy - 9.7], [cx + 2.4, cy - 11.9], [cx + 4.9, cy - 10.6], [cx + 3.9, cy - 8.5],
    ] as Pt[], 0.8), cel(PAL.grass), {
      shadow: 0.36, radius: 2.6, pivot: [cx + 2.6, cy - 10.2], rim: 0.5, line: 0.45,
    })
    ctx.strokeStyle = rgba(cel(PAL.grass).deep, 0.8)
    ctx.lineWidth = 0.35
    ctx.stroke(curve([[cx + 0.4, cy - 9.6], [cx + 2.6, cy - 10.4], [cx + 4.6, cy - 10.3]] as Pt[]))
  }
}

/** Poneglyph fragment — ancient, glowing, worth going out of the way for. */
function drawFragment(s: Surface, t: number): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const cy = s.h / 2 + Math.sin(t * Math.PI * 2) * 1.2
  const stone = cel('#48547A')
  const pulse = 0.5 + Math.sin(t * Math.PI * 2) * 0.5

  radialFill(ctx, cx, cy, 2, 13, [
    [0, rgba(PAL.magic, 0.35 * pulse)],
    [1, rgba(PAL.magic, 0)],
  ])
  const slab = blob([
    [cx - 4.6, cy - 7], [cx + 3.4, cy - 7.6], [cx + 5, cy + 3],
    [cx + 1.4, cy + 7.4], [cx - 4, cy + 6],
  ] as Pt[], 0.35)
  paint(ctx, slab, stone, { shadow: 0.42, radius: 6, pivot: [cx, cy], rim: 0.6, line: 0.6 })
  // A chipped facet catches the light differently from the face.
  ctx.save()
  ctx.clip(slab)
  ctx.fillStyle = rgba(stone.light, 0.35)
  ctx.fill(blob([[cx - 4.6, cy - 7], [cx + 0.4, cy - 7.4], [cx - 2.4, cy - 3]] as Pt[], 0.2))
  ctx.restore()

  ctx.save()
  ctx.globalAlpha = 0.55 + pulse * 0.45
  ctx.fillStyle = PAL.magic
  ctx.shadowColor = PAL.magic
  ctx.shadowBlur = 4
  for (const [x, y, w, h] of [
    [-2.8, -4.6, 4.4, 0.9], [-2.8, -2.4, 2.2, 0.9], [0.4, -2.4, 2.8, 0.9],
    [-2.8, -0.2, 5.2, 0.9], [-2, 2, 3.2, 0.9], [-2.8, 4.2, 4, 0.9],
  ]) {
    ctx.fillRect(cx + x, cy + y, w, h)
  }
  ctx.restore()
}

/** Extra life — a miniature figurehead of the crew's ship. */
function drawOneUp(s: Surface, t: number): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const cy = s.h / 2 + Math.sin(t * Math.PI * 2) * 0.9
  const wood = cel(PAL.wood)
  paint(ctx, blob([
    [cx - 8, cy + 1], [cx + 8, cy + 1], [cx + 5.4, cy + 5.4], [cx - 5.4, cy + 5.4],
  ] as Pt[], 0.3), wood, {
    shadow: 0.4, radius: 6, pivot: [cx, cy + 3], rim: 0.6, line: 0.55,
  })
  grain(s, cx - 7, cy + 1.6, 14, 3.4, wood, 3, 4)
  paint(ctx, ellipsePath(cx, cy - 3.4, 5, 4.6), cel('#E8C86A'), {
    shadow: 0.38, radius: 5, pivot: [cx, cy - 3.4], rim: 0.7, line: 0.55,
  })
  ctx.fillStyle = PAL.luffyRed
  ctx.fill(roundRectPath(cx - 2.6, cy - 5.4, 5.2, 1.6, 0.7))
  ctx.fillStyle = '#20182C'
  ctx.fill(ellipsePath(cx + 1.4, cy - 3, 0.7, 0.8))
  ctx.fill(ellipsePath(cx - 1.6, cy - 3, 0.7, 0.8))
  ctx.fillStyle = PAL.white
  ctx.fill(ellipsePath(cx + 1.65, cy - 3.25, 0.26, 0.3))
  ctx.fill(ellipsePath(cx - 1.35, cy - 3.25, 0.26, 0.3))
  glint(ctx, cx - 2, cy - 5, 1.6, 0.8, -0.5, PAL.white, 0.55)
}

// ─────────────────────────────────────────────────────────────────────────────
// Cloth
// ─────────────────────────────────────────────────────────────────────────────

interface Cloth {
  path: Path2D
  /** Point on the hoist-to-fly axis, v = 0 at the head, 1 at the foot. */
  at: (u: number, v: number) => Pt
  /** Local depth slope; negative where the sheet turns away from the light. */
  slope: (u: number) => number
}

/**
 * A rectangle of cloth with a wave TRAVELLING along it, pinned at the hoist.
 *
 * The amplitude ramps from nothing at the pole to full at the free edge, the
 * foot lags the head so the sheet twists, and `slope` exposes the depth
 * derivative so the fold shading can be cut hard rather than airbrushed.
 */
function cloth(
  x0: number, yHead: number, yFoot: number, len: number,
  t: number, amp: number, waves: number, twist = 1.35,
): Cloth {
  const ph = t * Math.PI * 2
  const wave = (u: number) => Math.sin(ph - u * waves) * u * amp
  const at = (u: number, v: number): Pt => {
    const w = wave(u)
    const droop = u * u * amp * 0.35
    return [
      x0 + u * len,
      yHead + v * (yFoot - yHead) + w * (1 + v * (twist - 1)) + droop * v,
    ]
  }
  const slope = (u: number) =>
    waves * u * Math.sin(ph - u * waves) - Math.cos(ph - u * waves)
  const path = new Path2D()
  const top: Pt[] = []
  const bot: Pt[] = []
  for (let i = 0; i <= 10; i++) {
    top.push(at(i / 10, 0))
    bot.push(at(i / 10, 1))
  }
  path.addPath(curve(top))
  for (let i = bot.length - 1; i >= 0; i--) path.lineTo(bot[i][0], bot[i][1])
  path.closePath()
  return { path, at, slope }
}

/** Hard-edged fold bands that travel with the wave, cut into the cloth. */
function clothFolds(s: Surface, c: Cloth, tone: Cel, strips = 14): void {
  const ctx = s.ctx
  ctx.save()
  ctx.clip(c.path)
  for (let i = 0; i < strips; i++) {
    const u0 = i / strips
    const u1 = (i + 1) / strips
    const sl = c.slope((u0 + u1) / 2)
    if (sl >= 0) continue
    const depth = Math.min(1, -sl / 3)
    const p = new Path2D()
    const a = c.at(u0, 0)
    const b = c.at(u1, 0)
    const d = c.at(u1, 1)
    const e = c.at(u0, 1)
    p.moveTo(a[0], a[1])
    p.lineTo(b[0], b[1])
    p.lineTo(d[0], d[1])
    p.lineTo(e[0], e[1])
    p.closePath()
    ctx.fillStyle = depth > 0.7 ? tone.shade : mix(tone.core, tone.shade, 0.55)
    ctx.fill(p)
  }
  ctx.restore()
}

/** The straw-hat jolly roger, drawn in local units around (0,0). */
function jollyRoger(s: Surface, r: number, ink: string): void {
  const ctx = s.ctx
  const k = r / 4
  ctx.save()
  ctx.scale(k, k)
  ctx.fillStyle = PAL.cream
  // Crossbones behind.
  for (const a of [0.7, -0.7]) {
    ctx.save()
    ctx.rotate(a)
    ctx.fill(roundRectPath(-5.4, -0.5, 10.8, 1, 0.5))
    for (const x of [-5.4, 5.4]) {
      ctx.fill(ellipsePath(x, -0.8, 0.9, 0.8))
      ctx.fill(ellipsePath(x, 0.8, 0.9, 0.8))
    }
    ctx.restore()
  }
  // Skull.
  ctx.fill(blob([
    [0, -3.4], [2.7, -2.4], [2.9, 0.3], [1.7, 1.3], [-1.7, 1.3], [-2.9, 0.3], [-2.7, -2.4],
  ] as Pt[], 0.85))
  ctx.fill(roundRectPath(-1.7, 0.9, 3.4, 2.1, 0.8))
  ctx.fillStyle = ink
  ctx.fill(ellipsePath(-1.2, -1.4, 0.95, 1.05, -0.2))
  ctx.fill(ellipsePath(1.2, -1.4, 0.95, 1.05, 0.2))
  ctx.fill(blob([[0, -0.5], [0.6, 0.45], [-0.6, 0.45]] as Pt[], 0.3))
  ctx.fillRect(-1.05, 1.35, 0.5, 1.3)
  ctx.fillRect(-0.25, 1.35, 0.5, 1.3)
  ctx.fillRect(0.55, 1.35, 0.5, 1.3)
  // Straw hat: brim, crown, red band.
  ctx.fillStyle = PAL.strawGold
  ctx.fill(ellipsePath(0, -3.5, 5.1, 1.15))
  ctx.fill(roundRectPath(-2.5, -5.6, 5, 2.3, 0.9))
  ctx.fillStyle = PAL.strawDeep
  ctx.fill(ellipsePath(0, -3.15, 5.1, 0.55))
  ctx.fillStyle = PAL.luffyRed
  ctx.fill(roundRectPath(-2.55, -4.35, 5.1, 0.9, 0.35))
  ctx.restore()
}

/**
 * Goal — a ship's mast planted in the ground, flying the crew's colours.
 *
 * The end of a level has to be visible from a screen away, so this is built as
 * a real spar: a stepped block at the deck, a tapered mast with iron bands, a
 * yard with rigging, a masthead truck, and the biggest piece of cloth in the
 * game with the wave running out along it.
 */
function drawGoal(s: Surface, t: number): void {
  const ctx = s.ctx
  const base = s.h - 0.6
  const mx = s.w * 0.3
  const wood = cel(PAL.wood)
  const dark = cel(PAL.woodDeep)
  const top = 3.4

  // Deck block the mast is stepped into.
  paint(ctx, roundRectPath(mx - 8.5, base - 6.2, 17, 6.2, 0.8), dark, {
    shadow: 0.44, radius: 4, pivot: [mx, base - 3], rim: 0.55, line: 0.55,
  })
  grain(s, mx - 8, base - 5.6, 16, 5, dark, 4, 7)
  paint(ctx, roundRectPath(mx - 10, base - 7.6, 20, 2.2, 0.7), wood, {
    shadow: 0.4, radius: 2, pivot: [mx, base - 6.5], rim: 0.5, line: 0.5,
  })

  // The spar, tapering toward the truck.
  const mast = new Path2D()
  mast.moveTo(mx - 2.5, base - 7)
  mast.lineTo(mx - 1.35, top + 1.5)
  mast.lineTo(mx + 1.35, top + 1.5)
  mast.lineTo(mx + 2.5, base - 7)
  mast.closePath()
  paint(ctx, mast, wood, {
    shadow: 0.4, radius: 2.5, pivot: [mx, s.h / 2], rim: 0.55, line: 0.5, occlusion: 0.4,
  })
  ctx.save()
  ctx.clip(mast)
  grain(s, mx - 2.4, top + 2, 4.8, s.h - top - 10, wood, 3, 11)
  ctx.restore()
  ironBand(s, mx - 2.9, base - 20, 5.8, 1.7)
  ironBand(s, mx - 2.6, base - 38, 5.2, 1.5)

  // Yard, slung well below the colours so the two never fight, with a furled
  // sail lashed to it — the single detail that says "ship" rather than "pole".
  const yardY = top + 27
  paint(ctx, roundRectPath(mx - 11, yardY, 22, 1.8, 0.9), dark, {
    shadow: 0.42, radius: 2, pivot: [mx, yardY + 0.9], rim: 0.5, line: 0.45,
  })
  const furl = blob([
    [mx - 9.6, yardY + 1.6], [mx - 4, yardY + 4.4], [mx + 2, yardY + 4.6],
    [mx + 9.6, yardY + 1.8], [mx + 4, yardY + 0.8], [mx - 4, yardY + 0.6],
  ] as Pt[], 0.8)
  paint(ctx, furl, cel('#E4D8BE'), {
    shadow: 0.44, radius: 2.6, pivot: [mx, yardY + 2.6], rim: 0.6, line: 0.5,
  })
  ctx.save()
  ctx.clip(furl)
  ctx.strokeStyle = rgba(cel('#E4D8BE').deep, 0.75)
  ctx.lineWidth = 0.55
  for (const dx of [-7, -3.2, 1, 5.4]) {
    ctx.beginPath()
    ctx.moveTo(mx + dx, yardY)
    ctx.lineTo(mx + dx - 0.6, yardY + 5)
    ctx.stroke()
  }
  ctx.restore()

  // Shrouds: thin rope, slack, landing on the deck block rather than running
  // off the frame, with ratlines so they read as rigging and not as struts.
  ctx.save()
  ctx.lineCap = 'round'
  for (const dir of [-1, 1]) {
    const a: Pt = [mx + dir * 10.2, yardY + 0.6]
    const b: Pt = [mx + dir * 8.6, s.h * 0.66]
    const d: Pt = [mx + dir * 6.4, base - 7.4]
    ctx.strokeStyle = rgba('#C8B896', 0.8)
    ctx.lineWidth = 0.5
    ctx.stroke(curve([a, b, d] as Pt[]))
    ctx.strokeStyle = rgba('#8A7856', 0.55)
    ctx.lineWidth = 0.24
    ctx.stroke(curve([
      [a[0] + dir * 0.35, a[1] + 0.4], [b[0] + dir * 0.35, b[1]], [d[0] + dir * 0.3, d[1]],
    ] as Pt[]))
    // Ratlines between the shroud and the mast.
    ctx.strokeStyle = rgba('#C8B896', 0.45)
    ctx.lineWidth = 0.28
    for (let i = 1; i <= 5; i++) {
      const u = i / 6
      const p = pointOn([a, b, d], u)
      ctx.beginPath()
      ctx.moveTo(p[0], p[1])
      ctx.lineTo(mx + dir * 2.1, p[1] + 0.4)
      ctx.stroke()
    }
  }
  ctx.restore()

  // Masthead truck and finial.
  paint(ctx, ellipsePath(mx, top + 1.4, 3, 1.1), dark, {
    shadow: 0.4, radius: 2, pivot: [mx, top + 1.4], rim: 0.4, line: 0.4,
  })
  paint(ctx, ellipsePath(mx, top - 1.2, 2, 2.2), cel(PAL.gold), {
    shadow: 0.36, radius: 2.2, pivot: [mx, top - 1.2], rim: 0.7, line: 0.45,
  })
  glint(ctx, mx - 0.7, top - 2, 0.7, 0.4, -0.5, PAL.white, 0.85)

  // The colours.
  const red = cel(PAL.luffyRed)
  const c = cloth(mx + 1, top + 4, top + 20, 25, t, 2.1, 3.6, 1.45)
  paint(ctx, c.path, red, {
    shadow: 0, radius: 10, pivot: [mx + 13, top + 12], line: 0,
  })
  clothFolds(s, c, red, 16)
  // Hoist band, then the roger, both displaced by the local wave.
  ctx.save()
  ctx.clip(c.path)
  const h0 = c.at(0.06, 0)
  const h1 = c.at(0.06, 1)
  ctx.strokeStyle = rgba(red.deep, 0.85)
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.moveTo(h0[0], h0[1])
  ctx.lineTo(h1[0], h1[1])
  ctx.stroke()
  const mid = c.at(0.5, 0.5)
  const up = c.at(0.5, 0.12)
  const lo = c.at(0.5, 0.88)
  ctx.translate(mid[0], mid[1])
  ctx.rotate(Math.atan2(c.at(0.62, 0.5)[1] - c.at(0.38, 0.5)[1], 0.24 * 25))
  ctx.scale(1, Math.max(0.55, (lo[1] - up[1]) / 12.2))
  jollyRoger(s, 5.4, adjust(PAL.luffyRed, { light: 0.34 }))
  ctx.restore()
  // One unbroken line around the sheet last, so folds never break the contour.
  ctx.strokeStyle = red.line
  ctx.lineWidth = 0.55
  ctx.stroke(c.path)
  // Rim on the head of the sail, where the sun would catch the fold crests.
  ctx.save()
  ctx.clip(c.path)
  ctx.strokeStyle = rgba(red.light, 0.85)
  ctx.lineWidth = 1.1
  const crest: Pt[] = []
  for (let i = 0; i <= 8; i++) crest.push(c.at(i / 8, 0.05))
  ctx.stroke(curve(crest))
  ctx.restore()
}

/** Checkpoint — a marine-blue swallowtail pennant on a short staff. */
function drawCheckpoint(s: Surface, t: number): void {
  const ctx = s.ctx
  const base = s.h - 0.6
  const mx = s.w * 0.32
  const dark = cel(PAL.woodDeep)
  const top = 2.6

  // Stone footing: three rocks, not one, so nothing reads as a decal.
  const rock = cel(PAL.rock)
  for (const [dx, dy, r] of [[-4.2, 0, 3.4], [4.4, 0.4, 3], [0.4, -1.2, 3.8]]) {
    paint(ctx, blob([
      [mx + dx - r, base - 0.4], [mx + dx - r * 0.7, base - r * 0.9 + dy],
      [mx + dx + r * 0.2, base - r * 1.1 + dy], [mx + dx + r, base - 0.4],
    ] as Pt[], 0.5), rock, {
      shadow: 0.44, radius: r, pivot: [mx + dx, base - r * 0.5], rim: 0.5, line: 0.45,
    })
  }

  const staff = roundRectPath(mx - 1.1, top + 1, 2.2, base - top - 2.4, 1)
  paint(ctx, staff, dark, {
    shadow: 0.42, radius: 1.6, pivot: [mx, s.h / 2], rim: 0.5, line: 0.45,
  })
  ironBand(s, mx - 1.7, base - 12, 3.4, 1.3, false)
  paint(ctx, ellipsePath(mx, top, 1.9, 2), cel(PAL.gold), {
    shadow: 0.36, radius: 2, pivot: [mx, top], rim: 0.65, line: 0.45,
  })
  glint(ctx, mx - 0.6, top - 0.8, 0.6, 0.35, -0.5, PAL.white, 0.85)

  const blue = cel(PAL.marineBlue)
  const c = cloth(mx + 0.8, top + 3.4, top + 11.4, 17, t, 1.5, 3.4, 1.4)
  // Swallowtail: notch the fly by clipping the cloth against a wedge.
  const tail = new Path2D()
  const f0 = c.at(1, 0)
  const f1 = c.at(1, 1)
  const fm = c.at(0.62, 0.5)
  tail.moveTo(f0[0] + 2, f0[1] - 2)
  tail.lineTo(fm[0], (f0[1] + f1[1]) / 2)
  tail.lineTo(f1[0] + 2, f1[1] + 2)
  tail.lineTo(f0[0] + 4, f1[1] + 3)
  tail.closePath()

  ctx.save()
  const sheet = new Path2D()
  sheet.addPath(c.path)
  ctx.clip(c.path)
  paint(ctx, c.path, blue, { shadow: 0, radius: 7, pivot: [mx + 8, top + 7], line: 0 })
  clothFolds(s, c, blue, 12)
  // Two chevrons, the marine mark, riding the cloth.
  ctx.strokeStyle = rgba(PAL.marineWhite, 0.9)
  ctx.lineWidth = 1.5
  for (const u of [0.34, 0.52]) {
    const a = c.at(u, 0.12)
    const b = c.at(u + 0.14, 0.5)
    const d = c.at(u, 0.88)
    ctx.beginPath()
    ctx.moveTo(a[0], a[1])
    ctx.lineTo(b[0], b[1])
    ctx.lineTo(d[0], d[1])
    ctx.stroke()
  }
  ctx.restore()
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = PAL.white
  ctx.fill(tail)
  ctx.restore()
  ctx.save()
  ctx.strokeStyle = blue.line
  ctx.lineWidth = 0.5
  ctx.stroke(sheet)
  ctx.restore()
}

// ─────────────────────────────────────────────────────────────────────────────
// Props — the level designer's furniture. All of these stand on the frame's
// bottom edge, so dropping one on a tile row grounds it exactly.
// ─────────────────────────────────────────────────────────────────────────────

/** Barrel — staved, hooped, bulged in the middle. */
function drawBarrel(s: Surface): void {
  const ctx = s.ctx
  const base = s.h - 0.5
  const cx = s.w / 2
  const hgt = 19
  const topY = base - hgt
  const wood = cel(PAL.wood)
  const bulge = 8.4
  const waist = 6.6

  const body = blob([
    [cx - waist, topY + 1], [cx - bulge, base - hgt / 2], [cx - waist, base - 0.8],
    [cx, base], [cx + waist, base - 0.8], [cx + bulge, base - hgt / 2],
    [cx + waist, topY + 1], [cx, topY],
  ] as Pt[], 0.7)
  paint(ctx, body, wood, {
    shadow: 0.42, radius: bulge, pivot: [cx, base - hgt / 2], rim: 0.8, line: 0.55,
    occlusion: 0.35,
  })
  // Staves: curved seams that follow the bulge, never evenly bright.
  ctx.save()
  ctx.clip(body)
  for (let i = -3; i <= 3; i++) {
    const u = i / 3.2
    const x = cx + u * bulge
    ctx.strokeStyle = rgba(wood.deep, 0.55 - Math.abs(u) * 0.2)
    ctx.lineWidth = 0.4
    ctx.stroke(curve([
      [x * 1 + u * 0.6, topY + 1.2],
      [x + u * 1.4, base - hgt / 2],
      [x + u * 0.6, base - 0.6],
    ] as Pt[]))
  }
  grain(s, cx - bulge, topY + 3, bulge * 2, hgt - 6, wood, 3, 21)
  ctx.restore()

  ironBand(s, cx - 7.6, topY + 2.4, 15.2, 2)
  ironBand(s, cx - 8.9, base - hgt / 2 - 1.1, 17.8, 2.3)
  ironBand(s, cx - 7.4, base - 3.4, 14.8, 2)

  // Lid, seen slightly from above.
  paint(ctx, ellipsePath(cx, topY + 0.9, waist, 1.9), cel(adjust(PAL.wood, { light: 1.12 })), {
    shadow: 0.34, radius: 2, pivot: [cx, topY + 0.9], rim: 0.5, line: 0.45,
  })
  ctx.strokeStyle = rgba(wood.deep, 0.6)
  ctx.lineWidth = 0.35
  ctx.stroke(ellipsePath(cx, topY + 0.9, waist * 0.6, 1.1))
  glint(ctx, cx - 4.6, base - hgt * 0.66, 1, 3.2, -0.15, PAL.white, 0.28)
}

/** Crate — planks, corner cleats and a burned-in mark. */
function drawCrate(s: Surface): void {
  const ctx = s.ctx
  const base = s.h - 0.5
  const cx = s.w / 2
  const side = 16.4
  const topY = base - side
  const wood = cel(adjust(PAL.wood, { light: 1.06 }))
  const dark = cel(PAL.woodDeep)

  const box = roundRectPath(cx - side / 2, topY, side, side, 0.9)
  paint(ctx, box, wood, {
    shadow: 0.4, radius: side / 2, pivot: [cx, base - side / 2], rim: 0.8, line: 0.6,
  })
  ctx.save()
  ctx.clip(box)
  // Three planks with visible seams, each a slightly different value.
  for (let i = 0; i < 3; i++) {
    const y = topY + 1.6 + i * ((side - 3.2) / 3)
    ctx.fillStyle = rgba(i === 1 ? wood.shade : wood.core, i === 1 ? 0.5 : 0.35)
    ctx.fillRect(cx - side / 2, y, side, (side - 3.2) / 3 - 0.5)
    ctx.strokeStyle = rgba(dark.deep, 0.65)
    ctx.lineWidth = 0.4
    ctx.beginPath()
    ctx.moveTo(cx - side / 2, y - 0.4)
    ctx.lineTo(cx + side / 2, y - 0.4)
    ctx.stroke()
  }
  grain(s, cx - side / 2, topY + 1, side, side - 2, wood, 5, 33)
  // Diagonal brace.
  ctx.strokeStyle = rgba(dark.core, 0.9)
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(cx - side / 2 + 1, base - 1)
  ctx.lineTo(cx + side / 2 - 1, topY + 1)
  ctx.stroke()
  ctx.strokeStyle = rgba(wood.light, 0.35)
  ctx.lineWidth = 0.4
  ctx.beginPath()
  ctx.moveTo(cx - side / 2 + 1, base - 2)
  ctx.lineTo(cx + side / 2 - 1, topY)
  ctx.stroke()
  ctx.restore()

  // Corner cleats.
  for (const sx of [-1, 1]) {
    paint(ctx, roundRectPath(cx + sx * (side / 2 - 2.2) - 1.1, topY, 2.2, side, 0.5), dark, {
      shadow: 0.44, radius: 1.6, pivot: [cx + sx * (side / 2 - 2), base - side / 2],
      rim: 0.4, line: 0.4,
    })
  }
  for (const y of [topY + 0.6, base - 2.4]) {
    paint(ctx, roundRectPath(cx - side / 2, y, side, 1.9, 0.4), dark, {
      shadow: 0.44, radius: 1.4, pivot: [cx, y + 1], rim: 0.4, line: 0.4,
    })
  }
  // Branded mark.
  ctx.save()
  ctx.globalAlpha = 0.4
  ctx.translate(cx + 0.5, base - side / 2 + 0.5)
  jollyRoger(s, 3.2, dark.deep)
  ctx.restore()
  ctx.save()
  ctx.globalAlpha = 0.55
  ctx.translate(cx, base - side / 2)
  jollyRoger(s, 3.2, dark.deep)
  ctx.restore()
  nail(s, cx - side / 2 + 1.4, topY + 1.6, 0.55)
  nail(s, cx + side / 2 - 1.4, base - 1.5, 0.55)
}

/** Sake cup — a shallow sakazuki whose surface actually moves. */
function drawSakeCup(s: Surface, t: number): void {
  const ctx = s.ctx
  const base = s.h - 0.5
  const cx = s.w / 2
  const clay = cel('#F2E4CE')
  const lacquer = cel('#B9342E')

  // Foot ring and stem.
  paint(ctx, ellipsePath(cx, base - 0.6, 3.4, 1.1), lacquer, {
    shadow: 0.44, radius: 2, pivot: [cx, base - 0.6], rim: 0.4, line: 0.4,
  })
  paint(ctx, roundRectPath(cx - 1.2, base - 3.2, 2.4, 2.8, 0.5), lacquer, {
    shadow: 0.42, radius: 1.4, pivot: [cx, base - 1.8], rim: 0.35, line: 0.4,
  })
  // Bowl.
  const bowl = blob([
    [cx - 5.6, base - 6.6], [cx - 3.6, base - 3.2], [cx, base - 2.6],
    [cx + 3.6, base - 3.2], [cx + 5.6, base - 6.6],
  ] as Pt[], 0.55)
  paint(ctx, bowl, clay, {
    shadow: 0.36, radius: 5, pivot: [cx, base - 4.6], rim: 0.7, line: 0.5,
  })
  ctx.save()
  ctx.clip(bowl)
  ctx.fillStyle = rgba(lacquer.core, 0.85)
  ctx.fillRect(cx - 6, base - 7.4, 12, 1.4)
  ctx.restore()

  // Sake, with a travelling ripple and a caught highlight.
  const lift = Math.sin(t * Math.PI * 2) * 0.35
  const surface = new Path2D()
  const pts: Pt[] = []
  for (let i = 0; i <= 8; i++) {
    const u = i / 8
    pts.push([
      cx - 5.3 + u * 10.6,
      base - 6.5 + Math.sin(t * Math.PI * 2 - u * 4.2) * 0.3 + lift * (0.5 - Math.abs(u - 0.5)),
    ])
  }
  surface.addPath(curve(pts))
  surface.lineTo(cx + 5.3, base - 4.4)
  surface.lineTo(cx - 5.3, base - 4.4)
  surface.closePath()
  ctx.save()
  ctx.clip(bowl)
  paint(ctx, surface, cel('#F7E9A8'), {
    shadow: 0.3, radius: 4, pivot: [cx, base - 5.6], line: 0,
  })
  ctx.strokeStyle = rgba(PAL.white, 0.7)
  ctx.lineWidth = 0.45
  ctx.stroke(curve(pts))
  ctx.restore()
  glint(ctx, cx - 3, base - 6, 1.2, 0.4, -0.35, PAL.white, 0.6)
}

/** Anchor — admiralty pattern, resting on one fluke. */
function drawAnchor(s: Surface): void {
  const ctx = s.ctx
  const base = s.h - 0.5
  const cx = s.w / 2
  const iron = cel('#6E7C96')
  const rust = cel('#8A5A3E')
  const topY = 2.6

  // Ring.
  paint(ctx, crescentPath(cx, topY + 2.4, 2.6, 1.1, 0, Math.PI * 2), iron, {
    shadow: 0.44, radius: 2.6, pivot: [cx, topY + 2.4], rim: 0.5, line: 0.45,
  })
  // Shank.
  paint(ctx, roundRectPath(cx - 1.5, topY + 4, 3, base - topY - 8, 1), iron, {
    shadow: 0.44, radius: 2, pivot: [cx, s.h / 2], rim: 0.6, line: 0.5, occlusion: 0.4,
  })
  // Stock, canted so the thing is not bilaterally dead.
  ctx.save()
  ctx.translate(cx, topY + 7.4)
  ctx.rotate(-0.09)
  paint(ctx, roundRectPath(-8.6, -0.9, 17.2, 1.8, 0.9), rust, {
    shadow: 0.42, radius: 2, pivot: [0, 0], rim: 0.5, line: 0.45,
  })
  ctx.fillStyle = rgba(rust.deep, 0.6)
  ctx.fill(ellipsePath(-6.2, 0.2, 1, 0.6))
  ctx.fill(ellipsePath(5.4, -0.2, 0.8, 0.5))
  ctx.restore()
  // Arms and flukes.
  const arms = new Path2D()
  arms.addPath(curve([
    [cx - 9.4, base - 5.8], [cx - 5, base - 1.4], [cx, base - 1],
    [cx + 5, base - 1.4], [cx + 9.4, base - 5.8],
  ] as Pt[]))
  ctx.save()
  ctx.strokeStyle = iron.core
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.stroke(arms)
  ctx.strokeStyle = iron.shade
  ctx.lineWidth = 1.4
  ctx.translate(0.5, 0.8)
  ctx.stroke(arms)
  ctx.restore()
  for (const sx of [-1, 1]) {
    paint(ctx, blob([
      [cx + sx * 9.6, base - 6.6], [cx + sx * 11.4, base - 2.4],
      [cx + sx * 7.4, base - 1], [cx + sx * 6.6, base - 4.4],
    ] as Pt[], 0.4), iron, {
      shadow: 0.44, radius: 3, pivot: [cx + sx * 9, base - 4], rim: 0.6, line: 0.5,
    })
  }
  ironBand(s, cx - 2.1, topY + 12, 4.2, 1.6)
  ctx.strokeStyle = iron.line
  ctx.lineWidth = 0.5
  ctx.stroke(arms)
  // Rope through the ring — a prop should always tell you it was used.
  ctx.save()
  ctx.strokeStyle = cel('#D9C08A').core
  ctx.lineWidth = 1
  ctx.stroke(curve([
    [cx - 1, topY + 1.6], [cx - 5.4, topY + 0.4], [cx - 9, topY + 3.4],
  ] as Pt[]))
  ctx.strokeStyle = rgba(cel('#D9C08A').deep, 0.7)
  ctx.lineWidth = 0.32
  ctx.stroke(curve([
    [cx - 1, topY + 2.1], [cx - 5.4, topY + 0.9], [cx - 9, topY + 3.9],
  ] as Pt[]))
  ctx.restore()
  glint(ctx, cx - 0.9, s.h * 0.5, 0.55, 5, 0, PAL.white, 0.3)
}

/** Lantern — paper shade on a post, with a flame that never repeats a frame. */
function drawLantern(s: Surface, t: number): void {
  const ctx = s.ctx
  const base = s.h - 0.5
  const cx = s.w / 2
  const dark = cel(PAL.woodDeep)
  const paper = cel('#F5D98A')
  const flick = Math.sin(t * Math.PI * 2) * 0.5 + Math.sin(t * Math.PI * 6 + 1.1) * 0.5
  const glowR = 11 + flick * 1.8

  paint(ctx, roundRectPath(cx - 3.4, base - 2.4, 6.8, 2.4, 0.6), cel(PAL.rock), {
    shadow: 0.46, radius: 2, pivot: [cx, base - 1.2], rim: 0.4, line: 0.45,
  })
  paint(ctx, roundRectPath(cx - 1.3, base - 16, 2.6, 14, 0.8), dark, {
    shadow: 0.44, radius: 1.8, pivot: [cx, base - 9], rim: 0.5, line: 0.45,
  })
  // Arm the lantern hangs from.
  paint(ctx, roundRectPath(cx - 1, base - 25.4, 5.4, 1.4, 0.7), dark, {
    shadow: 0.42, radius: 1.4, pivot: [cx + 1.7, base - 24.7], rim: 0.4, line: 0.4,
  })
  paint(ctx, roundRectPath(cx - 1.3, base - 26, 2.6, 11, 0.8), dark, {
    shadow: 0.44, radius: 1.8, pivot: [cx, base - 20], rim: 0.5, line: 0.45,
  })

  const lx = cx + 4
  const ly = base - 20
  radialFill(ctx, lx, ly, 1, glowR, [
    [0, rgba(PAL.ember, 0.42)],
    [0.5, rgba(PAL.ember, 0.16)],
    [1, rgba(PAL.ember, 0)],
  ])
  ctx.strokeStyle = dark.core
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(cx + 3.2, base - 24.6)
  ctx.lineTo(lx, ly - 5.6)
  ctx.stroke()

  const shade = blob([
    [lx, ly - 6], [lx + 4.2, ly - 3.6], [lx + 4.4, ly + 2.4], [lx, ly + 5],
    [lx - 4.4, ly + 2.4], [lx - 4.2, ly - 3.6],
  ] as Pt[], 0.75)
  paint(ctx, shade, paper, {
    shadow: 0.3, radius: 4.4, pivot: [lx, ly], rim: 0.7, line: 0.5,
  })
  ctx.save()
  ctx.clip(shade)
  // Ribs, and the flame glowing through the paper from inside.
  ctx.strokeStyle = rgba(paper.deep, 0.5)
  ctx.lineWidth = 0.4
  for (let i = -2; i <= 2; i++) {
    ctx.stroke(curve([
      [lx + i * 1.7 * 0.6, ly - 5.6], [lx + i * 1.9, ly], [lx + i * 1.7 * 0.6, ly + 4.6],
    ] as Pt[]))
  }
  radialFill(ctx, lx - 0.4, ly + 0.8, 0, 4.4 + flick * 0.7, [
    [0, rgba('#FFF3C4', 0.95)],
    [0.55, rgba(PAL.ember, 0.55)],
    [1, rgba(PAL.ember, 0)],
  ])
  ctx.fillStyle = rgba('#C8452C', 0.85)
  ctx.fill(roundRectPath(lx - 4.6, ly - 1.4, 9.2, 1.5, 0.4))
  ctx.restore()
  // Caps.
  paint(ctx, roundRectPath(lx - 2.4, ly - 6.6, 4.8, 1.4, 0.4), dark, {
    shadow: 0.4, radius: 1.4, pivot: [lx, ly - 6], rim: 0.4, line: 0.4,
  })
  paint(ctx, roundRectPath(lx - 2, ly + 4.2, 4, 1.3, 0.4), dark, {
    shadow: 0.4, radius: 1.3, pivot: [lx, ly + 4.8], rim: 0.4, line: 0.4,
  })
  tuft(s, cx - 3.6, base, 5, 2.6, 5)
}

/** Palm — a curved trunk and fronds that sway out of phase with each other. */
function drawPalm(s: Surface, t: number): void {
  const ctx = s.ctx
  const base = s.h - 0.5
  const cx = s.w * 0.44
  const bark = cel('#A87A4C')
  const frondCel = cel(PAL.grassDeep)
  const sway = Math.sin(t * Math.PI * 2)
  const crownX = cx + 11 + sway * 1.4
  const crownY = 15

  // Root flare, so the trunk grows out of the ground instead of being planted.
  paint(ctx, blob([
    [cx - 8, base], [cx - 3.6, base - 4.4], [cx + 3.6, base - 4.4], [cx + 8.4, base],
  ] as Pt[], 0.5), cel('#8A6440'), {
    shadow: 0.44, radius: 6, pivot: [cx, base - 2], rim: 0.5, line: 0.5,
  })

  const spine: Pt[] = [
    [cx, base - 2],
    [cx + 2.4, base * 0.72],
    [cx + 6.6, base * 0.42],
    [crownX, crownY],
  ]
  const trunk = new Path2D()
  const left: Pt[] = []
  const right: Pt[] = []
  for (let i = 0; i <= 12; i++) {
    const u = i / 12
    const p = pointOn(spine, u)
    const r = 4.2 - u * 2.1
    left.push([p[0] - r, p[1]])
    right.push([p[0] + r, p[1]])
  }
  trunk.addPath(curve(left))
  for (let i = right.length - 1; i >= 0; i--) trunk.lineTo(right[i][0], right[i][1])
  trunk.closePath()
  paint(ctx, trunk, bark, {
    shadow: 0.42, radius: 4.2, pivot: [cx + 4, base * 0.5], rim: 0.8, line: 0.55,
    occlusion: 0.3,
  })
  // Leaf scars, which is what makes a palm trunk a palm trunk.
  ctx.save()
  ctx.clip(trunk)
  for (let i = 1; i < 12; i++) {
    const u = i / 12
    const p = pointOn(spine, u)
    const r = 4.4 - u * 2.1
    ctx.strokeStyle = rgba(bark.deep, 0.55)
    ctx.lineWidth = 0.5
    ctx.stroke(curve([
      [p[0] - r, p[1] + 0.7], [p[0], p[1] - 0.5], [p[0] + r, p[1] + 0.7],
    ] as Pt[]))
    ctx.strokeStyle = rgba(bark.light, 0.3)
    ctx.lineWidth = 0.35
    ctx.stroke(curve([
      [p[0] - r, p[1] + 1.4], [p[0], p[1] + 0.2], [p[0] + r, p[1] + 1.4],
    ] as Pt[]))
  }
  ctx.restore()

  // Coconuts under the crown.
  for (const [dx, dy] of [[-2.6, 2.4], [0.8, 3.2], [-0.8, 0.6]]) {
    paint(ctx, ellipsePath(crownX + dx, crownY + dy, 2.1, 2), cel('#7A5030'), {
      shadow: 0.4, radius: 2.1, pivot: [crownX + dx, crownY + dy], rim: 0.5, line: 0.45,
    })
  }

  // Seven fronds, each with its own phase and its own leaflet rhythm — a comb
  // of identical fronds is the classic way a palm reads as wallpaper.
  const fronds = 7
  for (let i = 0; i < fronds; i++) {
    const spread = (i / (fronds - 1) - 0.5) * 2
    const ph = Math.sin(t * Math.PI * 2 + i * 1.4)
    const len = 20 + (i % 3) * 3.4
    const dir = spread * 1.35 - Math.PI / 2 + Math.sign(spread || 1) * 0.25
    const droop = 1 + Math.abs(spread) * 0.9
    const rib: Pt[] = []
    for (let k = 0; k <= 6; k++) {
      const u = k / 6
      const a = dir + u * droop * 0.75 * Math.sign(spread || 1) + ph * 0.06 * u
      rib.push([
        crownX + Math.cos(a) * len * u,
        crownY + Math.sin(a) * len * u + u * u * 4.5 * droop,
      ])
    }
    const back = i % 2 === 0
    const c = back ? cel(adjust(PAL.grassDeep, { light: 0.85 })) : frondCel
    // Leaflets, alternating and shortening toward the tip.
    ctx.save()
    for (let k = 1; k <= 6; k++) {
      const u = k / 6
      const p = rib[k]
      const q = rib[k - 1]
      const a = Math.atan2(p[1] - q[1], p[0] - q[0])
      const ll = (1 - u * 0.55) * 5.6 * (0.75 + ((k * 7 + i * 3) % 4) * 0.12)
      for (const sgn of [-1, 1]) {
        const na = a + sgn * (0.95 + u * 0.35)
        ctx.fillStyle = sgn < 0 ? c.core : c.shade
        ctx.fill(blob([
          [q[0], q[1]],
          [p[0] + Math.cos(na) * ll * 0.55, p[1] + Math.sin(na) * ll * 0.55 + 0.4],
          [p[0] + Math.cos(na) * ll, p[1] + Math.sin(na) * ll + 1.1],
          [p[0], p[1]],
        ] as Pt[], 0.6))
      }
    }
    ctx.strokeStyle = c.deep
    ctx.lineWidth = 0.85
    ctx.stroke(curve(rib))
    ctx.strokeStyle = rgba(c.light, 0.55)
    ctx.lineWidth = 0.35
    ctx.stroke(curve(rib.map(([x, y]) => [x - 0.3, y - 0.4] as Pt)))
    ctx.restore()
  }
  paint(ctx, ellipsePath(crownX, crownY - 0.4, 3, 2.4), cel('#8A6440'), {
    shadow: 0.42, radius: 3, pivot: [crownX, crownY], rim: 0.5, line: 0.45,
  })
  tuft(s, cx - 6, base, 7, 3.4, 9)
  tuft(s, cx + 7, base, 6, 2.8, 13)
}

/** Sample a Catmull-Rom-ish polyline at u in 0..1. */
function pointOn(pts: Pt[], u: number): Pt {
  const n = pts.length - 1
  const f = Math.min(0.9999, Math.max(0, u)) * n
  const i = Math.floor(f)
  const k = f - i
  const a = pts[i]
  const b = pts[Math.min(n, i + 1)]
  const kk = k * k * (3 - 2 * k)
  return [a[0] + (b[0] - a[0]) * kk, a[1] + (b[1] - a[1]) * kk]
}

/** Signpost — two boards, painted, creaking gently in the wind. */
function drawSignpost(s: Surface, t: number): void {
  const ctx = s.ctx
  const base = s.h - 0.5
  const cx = s.w / 2
  const wood = cel(PAL.wood)
  const dark = cel(PAL.woodDeep)
  const creak = Math.sin(t * Math.PI * 2) * 0.035

  paint(ctx, roundRectPath(cx - 1.6, base - 27, 3.2, 27, 0.9), dark, {
    shadow: 0.44, radius: 2, pivot: [cx, base - 14], rim: 0.5, line: 0.5,
  })
  ctx.save()
  ctx.clip(roundRectPath(cx - 1.6, base - 27, 3.2, 27, 0.9))
  grain(s, cx - 1.6, base - 26, 3.2, 25, dark, 3, 41)
  ctx.restore()

  const board = (y: number, dir: number, phase: number) => {
    ctx.save()
    ctx.translate(cx, y)
    ctx.rotate(creak * (phase ? 1 : -1))
    const w = 17
    const x0 = dir > 0 ? -3 : -w + 3
    const arrow = new Path2D()
    if (dir > 0) {
      arrow.moveTo(x0, -3.2)
      arrow.lineTo(x0 + w - 4, -3.2)
      arrow.lineTo(x0 + w, 0)
      arrow.lineTo(x0 + w - 4, 3.2)
      arrow.lineTo(x0, 3.2)
    } else {
      arrow.moveTo(x0 + w, -3.2)
      arrow.lineTo(x0 + 4, -3.2)
      arrow.lineTo(x0, 0)
      arrow.lineTo(x0 + 4, 3.2)
      arrow.lineTo(x0 + w, 3.2)
    }
    arrow.closePath()
    paint(ctx, arrow, wood, {
      shadow: 0.38, radius: 3.4, pivot: [x0 + w / 2, 0], rim: 0.6, line: 0.5,
    })
    ctx.save()
    ctx.clip(arrow)
    grain(s, x0, -3.2, w, 6.4, wood, 3, 51 + phase)
    ctx.restore()
    textBars(s, x0 + (dir > 0 ? 2 : 5), -1.1, w - 8, 2.2, rgba(dark.deep, 0.85), 7 + phase)
    nail(s, dir > 0 ? -1.4 : 1.4, -1.8, 0.7)
    nail(s, dir > 0 ? -1.4 : 1.4, 1.8, 0.7)
    ctx.restore()
  }
  board(base - 23, 1, 0)
  board(base - 14.5, -1, 1)
  tuft(s, cx - 3, base, 6, 3, 17)
  tuft(s, cx + 3.4, base, 5, 2.4, 23)
}

/** Wanted poster — nailed at three corners so the fourth can lift and flutter. */
function drawWantedPoster(s: Surface, t: number): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const base = s.h - 1.2
  const paper = cel('#EFDCB0')
  const ink = '#3A2A1E'
  const w = 19
  const h = 26
  const x0 = cx - w / 2
  const y0 = base - h
  const lift = Math.sin(t * Math.PI * 2)

  // The sheet, with the free corner curling forward.
  const sheet = new Path2D()
  sheet.moveTo(x0 + 0.4, y0)
  sheet.lineTo(x0 + w - 0.4, y0 + 0.5)
  sheet.lineTo(x0 + w + lift * 1.4, y0 + h * 0.55)
  sheet.bezierCurveTo(
    x0 + w - 1 + lift * 2.2, y0 + h * 0.8,
    x0 + w * 0.55, y0 + h + lift * 1.6,
    x0 + 0.6, y0 + h - 0.4,
  )
  sheet.closePath()
  paint(ctx, sheet, paper, {
    shadow: 0.26, radius: h / 2, pivot: [cx, y0 + h / 2], rim: 0.6, line: 0.5,
  })
  ctx.save()
  ctx.clip(sheet)
  // The curl itself: a hard cel band along the lifting edge.
  ctx.fillStyle = rgba(paper.shade, 0.9)
  ctx.fill(blob([
    [x0 + w - 4, y0 + h * 0.55],
    [x0 + w + lift * 1.6, y0 + h * 0.6],
    [x0 + w * 0.6, y0 + h + lift * 1.8],
    [x0 + w * 0.5, y0 + h - 2.4],
  ] as Pt[], 0.5))

  // WANTED band.
  ctx.fillStyle = ink
  ctx.fillRect(x0 + 1.6, y0 + 2, w - 3.2, 3)
  textBars(s, x0 + 2.6, y0 + 2.6, w - 5.2, 1.8, paper.light, 5, 0.6)
  // Portrait window: a straw-hatted silhouette, no face, so nothing is traced.
  ctx.fillStyle = rgba('#C9AE7C', 0.9)
  ctx.fillRect(x0 + 2, y0 + 6.2, w - 4, 11)
  ctx.fillStyle = rgba(ink, 0.75)
  ctx.fill(blob([
    [cx, y0 + 9], [cx + 2.6, y0 + 11], [cx + 3.2, y0 + 14.6],
    [cx + 5.2, y0 + 17.2], [cx - 5.2, y0 + 17.2], [cx - 3.2, y0 + 14.6],
    [cx - 2.6, y0 + 11],
  ] as Pt[], 0.8))
  ctx.fillStyle = PAL.strawDeep
  ctx.fill(ellipsePath(cx, y0 + 8.6, 5.4, 1.3))
  ctx.fill(roundRectPath(cx - 2.6, y0 + 6.4, 5.2, 2.4, 0.9))
  ctx.fillStyle = PAL.luffyRedDeep
  ctx.fill(roundRectPath(cx - 2.7, y0 + 7.6, 5.4, 0.9, 0.35))
  ctx.strokeStyle = rgba(ink, 0.8)
  ctx.lineWidth = 0.4
  ctx.strokeRect(x0 + 2, y0 + 6.2, w - 4, 11)
  // Name and bounty.
  textBars(s, x0 + 3, y0 + 18.6, w - 6, 1.6, rgba(ink, 0.85), 9, 0.6)
  ctx.fillStyle = PAL.gold
  ctx.fill(ellipsePath(x0 + 3.4, y0 + 22.4, 1.5, 1.5))
  ctx.fillStyle = PAL.goldDeep
  ctx.fill(ellipsePath(x0 + 3.4, y0 + 22.4, 0.8, 0.8))
  textBars(s, x0 + 5.6, y0 + 21.4, w - 8, 2.2, ink, 13, 0.5)
  // Foxing and a coffee ring, because clean paper reads as a UI element.
  ctx.strokeStyle = rgba('#B08A50', 0.35)
  ctx.lineWidth = 0.45
  ctx.stroke(ellipsePath(x0 + w - 5, y0 + h - 4.5, 3.2, 2.6, 0.3))
  ctx.fillStyle = rgba('#B08A50', 0.18)
  ctx.fill(ellipsePath(x0 + 3, y0 + h - 2, 2.4, 1.4))
  ctx.restore()

  nail(s, x0 + 1.4, y0 + 1)
  nail(s, x0 + w - 1.4, y0 + 1.4)
  nail(s, x0 + 1.4, y0 + h - 1.4)
}

/** Treasure chest — the closed pose, and the pose that pays out. */
function chest(open: boolean) {
  return (s: Surface, t: number): void => {
    const ctx = s.ctx
    const base = s.h - 0.5
    const cx = s.w / 2
    const wood = cel(PAL.wood)
    const dark = cel(PAL.woodDeep)
    const gold = cel(PAL.gold)
    const w = 23
    const bodyH = 11
    const bodyY = base - bodyH

    // Box.
    const box = roundRectPath(cx - w / 2, bodyY, w, bodyH, 0.8)
    paint(ctx, box, wood, {
      shadow: 0.42, radius: w / 2, pivot: [cx, bodyY + bodyH / 2], rim: 0.8, line: 0.6,
    })
    ctx.save()
    ctx.clip(box)
    grain(s, cx - w / 2, bodyY, w, bodyH, wood, 4, 61)
    ctx.strokeStyle = rgba(dark.deep, 0.6)
    ctx.lineWidth = 0.4
    for (const y of [bodyY + 3.6, bodyY + 7.4]) {
      ctx.beginPath()
      ctx.moveTo(cx - w / 2, y)
      ctx.lineTo(cx + w / 2, y)
      ctx.stroke()
    }
    ctx.restore()
    for (const sx of [-1, 1]) {
      ironBand(s, cx + sx * (w / 2 - 3.4) - 1.2, bodyY, 2.4, bodyH, false)
    }
    // Feet, so it does not float on the tile.
    for (const sx of [-1, 1]) {
      paint(ctx, roundRectPath(cx + sx * (w / 2 - 3) - 1.6, base - 1.4, 3.2, 1.6, 0.4), dark, {
        shadow: 0.46, radius: 1.4, pivot: [cx + sx * (w / 2 - 3), base - 0.6], line: 0.4,
      })
    }

    const lidW = w + 1.4
    const lidTop = bodyY - 7.2
    if (!open) {
      const lid = new Path2D()
      lid.moveTo(cx - lidW / 2, bodyY + 0.4)
      lid.lineTo(cx - lidW / 2, bodyY - 2.4)
      lid.bezierCurveTo(cx - lidW * 0.36, lidTop, cx + lidW * 0.36, lidTop, cx + lidW / 2, bodyY - 2.4)
      lid.lineTo(cx + lidW / 2, bodyY + 0.4)
      lid.closePath()
      paint(ctx, lid, wood, {
        shadow: 0.36, radius: 5, pivot: [cx, bodyY - 3.4], rim: 0.85, line: 0.6,
      })
      ctx.save()
      ctx.clip(lid)
      for (let i = -2; i <= 2; i++) {
        ctx.strokeStyle = rgba(dark.deep, 0.5)
        ctx.lineWidth = 0.4
        ctx.stroke(curve([
          [cx + i * 4.4, bodyY + 0.4],
          [cx + i * 4.8, bodyY - 4],
          [cx + i * 4.2, lidTop + 1.4],
        ] as Pt[]))
      }
      ctx.restore()
      ironBand(s, cx - 1.2, lidTop + 0.6, 2.4, 9.6, false)
      // Lock plate, catching a slow travelling glint.
      paint(ctx, roundRectPath(cx - 2.8, bodyY - 2.6, 5.6, 6, 0.8), gold, {
        shadow: 0.38, radius: 3, pivot: [cx, bodyY + 0.4], rim: 0.7, line: 0.5,
      })
      ctx.fillStyle = gold.deep
      ctx.fill(ellipsePath(cx, bodyY + 0.2, 1, 1.1))
      ctx.fillRect(cx - 0.45, bodyY + 0.6, 0.9, 1.8)
      const g = (t * 2) % 1
      glint(ctx, cx - 2.4 + g * 5, bodyY - 1.6 + g * 3, 0.8, 2.2, -0.7, PAL.white,
        0.75 * Math.sin(g * Math.PI))
    } else {
      // Lid thrown back, seen from inside.
      const lid = new Path2D()
      lid.moveTo(cx - lidW / 2, bodyY + 0.4)
      lid.lineTo(cx - lidW / 2 + 1.4, bodyY - 7.6)
      lid.bezierCurveTo(
        cx - lidW * 0.2, bodyY - 11.4, cx + lidW * 0.2, bodyY - 11.4,
        cx + lidW / 2 - 1.4, bodyY - 7.6,
      )
      lid.lineTo(cx + lidW / 2, bodyY + 0.4)
      lid.closePath()
      paint(ctx, lid, dark, {
        shadow: 0.62, radius: 6, pivot: [cx, bodyY - 5], rim: 0.4, line: 0.55, occlusion: 0.5,
      })
      ctx.fillStyle = rgba(dark.deep, 0.75)
      ctx.fill(roundRectPath(cx - lidW / 2 + 2, bodyY - 8.6, lidW - 4, 7, 1))

      const pulse = 0.6 + 0.4 * Math.sin(t * Math.PI * 2)
      radialFill(ctx, cx, bodyY - 1, 1, 15, [
        [0, rgba(PAL.gold, 0.5 * pulse)],
        [0.55, rgba(PAL.gold, 0.18 * pulse)],
        [1, rgba(PAL.gold, 0)],
      ])
      // The hoard: coins piled, a couple of stones, all inside the box mouth.
      const mouth = new Path2D()
      mouth.addPath(roundRectPath(cx - w / 2 + 1, bodyY - 4.4, w - 2, 6, 1))
      ctx.save()
      ctx.clip(mouth)
      ctx.fillStyle = cel(PAL.goldDeep).deep
      ctx.fill(roundRectPath(cx - w / 2 + 1, bodyY - 1.4, w - 2, 4, 1))
      for (let i = 0; i < 16; i++) {
        const f = Math.abs((Math.sin(71.3 + i * 47.9) * 4375.5) % 1)
        const px = cx - w / 2 + 2.4 + ((i * 5.3) % (w - 5))
        const py = bodyY - 3.6 + f * 4
        ctx.fillStyle = i % 3 === 0 ? gold.light : gold.core
        ctx.fill(ellipsePath(px, py, 1.9, 1.5))
        ctx.fillStyle = gold.deep
        ctx.fill(ellipsePath(px, py + 0.7, 1.9, 0.7))
      }
      ctx.fillStyle = cel(PAL.magic).core
      ctx.fill(blob([
        [cx + 4, bodyY - 4.6], [cx + 6, bodyY - 3], [cx + 4.6, bodyY - 1.6],
        [cx + 2.6, bodyY - 3],
      ] as Pt[], 0.2))
      ctx.fillStyle = cel(PAL.magic).light
      ctx.fill(blob([
        [cx + 4, bodyY - 4.6], [cx + 5.2, bodyY - 3.2], [cx + 3.4, bodyY - 3.2],
      ] as Pt[], 0.2))
      ctx.fillStyle = cel(PAL.danger).core
      ctx.fill(ellipsePath(cx - 5.4, bodyY - 3, 1.5, 1.3))
      ctx.fillStyle = cel(PAL.danger).light
      ctx.fill(ellipsePath(cx - 5.8, bodyY - 3.5, 0.6, 0.5))
      ctx.restore()
      // Sparks lifting off the pile.
      for (let i = 0; i < 4; i++) {
        const u = (t + i / 4) % 1
        ctx.save()
        ctx.globalAlpha = Math.sin(u * Math.PI) * 0.9
        ctx.fillStyle = PAL.white
        const sx = cx - 7 + i * 4.6 + Math.sin(u * 4 + i) * 1.4
        const sy = bodyY - 3 - u * 9
        ctx.fill(blob([
          [sx, sy - 1.6], [sx + 0.5, sy], [sx, sy + 1.6], [sx - 0.5, sy],
        ] as Pt[], 0.2))
        ctx.restore()
      }
    }
  }
}

/** Log Pose — the needle actually settles rather than sweeping evenly. */
function drawLogPose(s: Surface, t: number): void {
  const ctx = s.ctx
  const base = s.h - 0.5
  const cx = s.w / 2
  const brass = cel('#D8A43C')
  const leather = cel('#7A4A2C')
  const cy = base - 9.5

  // Coiled strap the bulb rests in, which also gives it a flat bottom.
  paint(ctx, blob([
    [cx - 7.4, base], [cx - 6.4, base - 3.6], [cx - 1, base - 4.6],
    [cx + 5.4, base - 3.8], [cx + 7.2, base],
  ] as Pt[], 0.6), leather, {
    shadow: 0.46, radius: 4, pivot: [cx, base - 2], rim: 0.5, line: 0.5,
  })
  ctx.strokeStyle = rgba(leather.deep, 0.8)
  ctx.lineWidth = 0.4
  ctx.stroke(curve([[cx - 6, base - 1.4], [cx, base - 2.6], [cx + 6, base - 1.6]] as Pt[]))
  ctx.fillStyle = brass.core
  ctx.fill(roundRectPath(cx + 2.4, base - 3.2, 2, 2.6, 0.5))

  // Brass collar and the glass bulb.
  paint(ctx, roundRectPath(cx - 4.4, base - 6.2, 8.8, 2.6, 0.9), brass, {
    shadow: 0.4, radius: 2.4, pivot: [cx, base - 4.9], rim: 0.6, line: 0.45,
  })
  const bulb = ellipsePath(cx, cy, 6, 6.2)
  ctx.save()
  ctx.fillStyle = rgba('#BFE6F2', 0.42)
  ctx.fill(bulb)
  ctx.clip(bulb)
  // The liquid the needle floats in, with a meniscus line.
  ctx.fillStyle = rgba(PAL.seaLight, 0.28)
  ctx.fill(ellipsePath(cx, cy + 1.6, 6, 5))
  ctx.strokeStyle = rgba(PAL.foam, 0.5)
  ctx.lineWidth = 0.4
  ctx.stroke(curve([[cx - 5.6, cy - 2.4], [cx, cy - 3], [cx + 5.6, cy - 2.4]] as Pt[]))
  // Card and needle. The swing eases in and out, so it reads as a magnet
  // settling rather than a second hand.
  const swing = Math.sin(t * Math.PI * 2)
  const a = -Math.PI / 2 + swing * 1.15 * (1 - 0.35 * Math.abs(swing))
  ctx.strokeStyle = rgba(brass.deep, 0.7)
  ctx.lineWidth = 0.35
  ctx.stroke(ellipsePath(cx, cy, 4.2, 4.2))
  for (let i = 0; i < 8; i++) {
    const ta = (i / 8) * Math.PI * 2
    ctx.fillStyle = i % 2 ? rgba(brass.deep, 0.5) : rgba(brass.deep, 0.85)
    ctx.fill(ellipsePath(cx + Math.cos(ta) * 4.6, cy + Math.sin(ta) * 4.6, 0.35, 0.35))
  }
  const nx = Math.cos(a)
  const ny = Math.sin(a)
  ctx.fillStyle = PAL.danger
  ctx.fill(blob([
    [cx + nx * 4, cy + ny * 4],
    [cx - ny * 1.1, cy + nx * 1.1],
    [cx + ny * 1.1, cy - nx * 1.1],
  ] as Pt[], 0.15))
  ctx.fillStyle = PAL.mist
  ctx.fill(blob([
    [cx - nx * 3.4, cy - ny * 3.4],
    [cx - ny * 1.1, cy + nx * 1.1],
    [cx + ny * 1.1, cy - nx * 1.1],
  ] as Pt[], 0.15))
  ctx.fillStyle = brass.core
  ctx.fill(ellipsePath(cx, cy, 0.9, 0.9))
  // Glass: one hard specular crescent and one soft bloom, never a whole sheen.
  ctx.fillStyle = rgba(PAL.white, 0.55)
  ctx.fill(crescentPath(cx, cy, 5.4, 1.3, Math.PI * 1.08, Math.PI * 1.52))
  ctx.restore()
  glint(ctx, cx - 2.6, cy - 3.2, 1.5, 0.9, -0.6, PAL.white, 0.7)
  ctx.strokeStyle = cel('#9FC8D8').line
  ctx.lineWidth = 0.55
  ctx.stroke(bulb)
}

/** Den Den Mushi — a snail that is also a telephone, and blinks like both. */
function drawDenDen(s: Surface, t: number): void {
  const ctx = s.ctx
  const base = s.h - 0.5
  const cx = s.w / 2
  const shell = cel('#E8B94A')
  const body = cel('#8FCB6A')
  const bake = Math.sin(t * Math.PI * 2)
  const blink = t > 0.62 && t < 0.78

  // Foot, spread on the ground, with a wet edge.
  paint(ctx, blob([
    [cx - 10.5, base], [cx - 8.4, base - 3], [cx - 1, base - 3.6],
    [cx + 7.4, base - 3], [cx + 10, base],
  ] as Pt[], 0.6), body, {
    shadow: 0.42, radius: 5, pivot: [cx, base - 1.8], rim: 0.6, line: 0.5,
  })
  ctx.strokeStyle = rgba(body.light, 0.6)
  ctx.lineWidth = 0.4
  ctx.stroke(curve([[cx - 9, base - 1.2], [cx, base - 2], [cx + 8.6, base - 1.2]] as Pt[]))

  // Head and stalks.
  const hx = cx - 7.4
  const hy = base - 6.4 + bake * 0.3
  paint(ctx, blob([
    [hx - 3.4, hy + 2.6], [hx - 3.6, hy - 1.4], [hx - 0.6, hy - 3],
    [hx + 3, hy - 1], [hx + 3, hy + 2.8],
  ] as Pt[], 0.8), body, {
    shadow: 0.38, radius: 3.4, pivot: [hx, hy], rim: 0.6, line: 0.5,
  })
  for (const [dx, tilt, len] of [[-2.2, -0.35, 6.2], [0.4, 0.12, 7]]) {
    const ex = hx + dx + Math.sin(t * Math.PI * 2 + dx) * 0.35
    const ey = hy - 2.4
    const tx = ex + Math.sin(tilt) * len
    const ty = ey - Math.cos(tilt) * len
    paint(ctx, limbPath(ex, ey, tx, ty, 0.85, 1.5), body, {
      shadow: 0.4, radius: 1.6, pivot: [ex, ey - len / 2], rim: 0.4, line: 0.45,
    })
    if (blink) {
      ctx.strokeStyle = cel(body.core).line
      ctx.lineWidth = 0.55
      ctx.beginPath()
      ctx.moveTo(tx - 1.1, ty)
      ctx.lineTo(tx + 1.1, ty)
      ctx.stroke()
    } else {
      ctx.fillStyle = PAL.cream
      ctx.fill(ellipsePath(tx, ty, 1.15, 1.25))
      ctx.fillStyle = PAL.ink
      ctx.fill(ellipsePath(tx + 0.25, ty + 0.1, 0.6, 0.72))
      ctx.fillStyle = PAL.white
      ctx.fill(ellipsePath(tx - 0.05, ty - 0.3, 0.28, 0.3))
    }
  }
  // Mouth, a single confident line.
  ctx.strokeStyle = cel(body.core).line
  ctx.lineWidth = 0.5
  ctx.stroke(curve([[hx - 1.6, hy + 0.8], [hx, hy + 1.5], [hx + 1.8, hy + 0.6]] as Pt[]))

  // Shell.
  const sx = cx + 2.4
  const sy = base - 8.6
  const shellPath = ellipsePath(sx, sy, 8.6, 8)
  paint(ctx, shellPath, shell, {
    shadow: 0.4, radius: 8.4, pivot: [sx, sy], rim: 0.9, line: 0.6, occlusion: 0.3,
  })
  ctx.save()
  ctx.clip(shellPath)
  // A real logarithmic spiral, banded, so it turns rather than being a decal.
  const spiral: Pt[] = []
  for (let k = 0; k <= 44; k++) {
    const a = k * 0.29 - 1.2
    const r = 0.5 * Math.exp(a * 0.235) * 1.9
    spiral.push([sx + Math.cos(a) * r * 1.05, sy + Math.sin(a) * r])
  }
  ctx.strokeStyle = shell.deep
  ctx.lineWidth = 1.5
  ctx.stroke(curve(spiral))
  ctx.strokeStyle = rgba(shell.light, 0.7)
  ctx.lineWidth = 0.5
  ctx.stroke(curve(spiral.map(([x, y]) => [x - 0.4, y - 0.5] as Pt)))
  ctx.strokeStyle = rgba('#B4562E', 0.55)
  ctx.lineWidth = 0.9
  ctx.stroke(curve(spiral.map(([x, y]) => [x + 0.6, y + 0.9] as Pt)))
  ctx.restore()

  // Rotary dial, set into the shell.
  const dx0 = sx + 1.4
  const dy0 = sy + 0.6
  paint(ctx, ellipsePath(dx0, dy0, 4.2, 4), cel('#F3E6CE'), {
    shadow: 0.3, radius: 4, pivot: [dx0, dy0], rim: 0.5, line: 0.5,
  })
  ctx.fillStyle = cel('#F3E6CE').deep
  for (let i = 0; i < 9; i++) {
    const a = -2.5 + (i / 8) * 4.6
    ctx.fill(ellipsePath(dx0 + Math.cos(a) * 2.9, dy0 + Math.sin(a) * 2.75, 0.55, 0.52))
  }
  ctx.fillStyle = cel('#F3E6CE').shade
  ctx.fill(ellipsePath(dx0, dy0, 1.5, 1.4))
  ctx.fillStyle = PAL.danger
  ctx.fill(ellipsePath(dx0, dy0, 0.7, 0.65))

  // Handset in its cradle on top, cord looping down.
  const rx = sx - 0.6
  const ry = sy - 8.6 + bake * 0.25
  paint(ctx, roundRectPath(rx - 4.6, ry - 1, 9.2, 2.4, 1.1), cel('#3A4360'), {
    shadow: 0.42, radius: 2, pivot: [rx, ry], rim: 0.5, line: 0.5,
  })
  for (const e of [-4.4, 4.4]) {
    paint(ctx, ellipsePath(rx + e, ry + 1, 2, 1.6), cel('#3A4360'), {
      shadow: 0.42, radius: 2, pivot: [rx + e, ry + 1], rim: 0.45, line: 0.45,
    })
  }
  ctx.strokeStyle = rgba('#2A3048', 0.9)
  ctx.lineWidth = 0.55
  ctx.stroke(curve([
    [rx + 4.4, ry + 2.2], [rx + 7.4, ry + 4.4 + bake * 0.5], [rx + 6.4, ry + 7],
  ] as Pt[]))
  glint(ctx, sx - 3.4, sy - 4.6, 2, 1.1, -0.6, PAL.white, 0.5)
}

// ─────────────────────────────────────────────────────────────────────────────
// Sheets
// ─────────────────────────────────────────────────────────────────────────────

const anim = (draw: Painter, frames: number, dur: number) =>
  Array.from({ length: frames }, (_, i) => ({ dur, draw: (s: Surface) => draw(s, i / frames) }))

export function buildItemSheets(): Record<string, SpriteSheet> {
  const mk = (
    draw: Painter,
    frames: number,
    dur: number,
    fw = 22,
    fh = 22,
  ): SpriteSheet =>
    new SheetBuilder({ fw, fh, ox: -fw / 2, oy: -fh, contour: '#1B1024', contourWidth: 0.6 })
      .add('idle', anim(draw, frames, dur))
      .build()

  const berry = new SheetBuilder({
    fw: 21, fh: 18, ox: -10.5, oy: -18, contour: '#2A1408', contourWidth: 0.55,
  })
    .add('idle', BERRY_SPIN.map((f) => ({
      dur: f.dur,
      draw: (s: Surface) => drawBerryAt(s, f.theta),
    })))
    .build()

  const treasure = new SheetBuilder({
    fw: 30, fh: 24, ox: -15, oy: -24, contour: '#1B1024', contourWidth: 0.6,
  })
    .add('idle', anim(chest(false), 4, 0.2))
    .add('open', anim(chest(true), 6, 0.11))
    .alias('closed', 'idle')
    .build()

  return {
    berry,
    meat: mk(drawMeat, 4, 0.16, 26, 18),
    'fruit-gear2': mk(fruit(PAL.bloodOrange), 10, 0.07, 24, 26),
    'fruit-gear3': mk(fruit(PAL.magic), 10, 0.07, 24, 26),
    'fruit-gear4': mk(fruit(PAL.poison), 10, 0.07, 24, 26),
    fragment: mk(drawFragment, 8, 0.1, 26, 26),
    oneup: mk(drawOneUp, 4, 0.15, 24, 20),
    checkpoint: mk(drawCheckpoint, 10, 0.085, 34, 42),
    goal: mk(drawGoal, 12, 0.075, 52, 78),

    // Props. All of these stand on the bottom edge of their frame.
    'log-pose': mk(drawLogPose, 8, 0.1, 20, 20),
    'den-den-mushi': mk(drawDenDen, 8, 0.13, 30, 24),
    'wanted-poster': mk(drawWantedPoster, 6, 0.13, 26, 30),
    'treasure-chest': treasure,
    barrel: mk(drawBarrel, 1, 1, 22, 22),
    crate: mk(drawCrate, 1, 1, 20, 19),
    'sake-cup': mk(drawSakeCup, 4, 0.14, 16, 11),
    anchor: mk(drawAnchor, 1, 1, 28, 30),
    lantern: mk(drawLantern, 6, 0.11, 26, 32),
    'palm-tree': mk(drawPalm, 6, 0.16, 78, 88),
    signpost: mk(drawSignpost, 4, 0.2, 30, 32),
  }
}
