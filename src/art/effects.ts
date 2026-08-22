import type { SpriteSheet } from '../types'
import { SheetBuilder } from './atlas'
import { mix, rgba } from './color'
import { PAL } from './palette'
import { blob, crescentPath, ellipsePath, radialFill, type Pt, type Surface } from './ink'

/**
 * Impact effects.
 *
 * These are drawn with no contour and composited additively, so they are built
 * from bright saturated shapes on transparent. The register that matters is
 * anime impact language: hard-edged stars and crescents that appear for two or
 * three frames and are gone, not soft puffs that linger.
 *
 * Two rules run through everything here. Nothing fades out uniformly — the
 * silhouette breaks up as it dies, because a shape that only loses alpha reads
 * as a dissolve rather than as energy spending itself. And nothing is radially
 * symmetric: every burst has a direction, even if it is only the key light's.
 */

/**
 * Deterministic hash noise. Effects must look scattered but rebuild identically
 * every run, so the sheet is stable between sessions and between machines.
 */
const rnd = (i: number, salt = 0): number => {
  const v = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
  return v - Math.floor(v)
}

/** An expanding shockwave ring, squashed so it sits on the ground plane. */
function shockRing(color: string, flat = 0.42) {
  return (s: Surface, t: number): void => {
    const ctx = s.ctx
    const cx = s.w / 2
    const cy = s.h / 2
    const r = 2 + t * (s.w / 2 - 3)
    ctx.save()
    ctx.globalAlpha = (1 - t) ** 1.4
    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(0.4, 3.4 * (1 - t))
    ctx.beginPath()
    ctx.ellipse(cx, cy, r, r * flat, 0, 0, Math.PI * 2)
    ctx.stroke()
    // A brighter leading edge sells the speed of the expansion.
    ctx.globalAlpha = (1 - t) ** 2
    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth = Math.max(0.3, 1.4 * (1 - t))
    ctx.beginPath()
    ctx.ellipse(cx, cy, r * 1.03, r * flat * 1.03, 0, 0, Math.PI * 2)
    ctx.stroke()
    // The ring breaks into arcs as it dies rather than dimming evenly.
    if (t > 0.35) {
      ctx.globalAlpha = (1 - t) * 0.9
      ctx.lineWidth = Math.max(0.35, 2.2 * (1 - t))
      for (let i = 0; i < 5; i++) {
        const a0 = rnd(i, 3) * Math.PI * 2
        ctx.beginPath()
        ctx.ellipse(cx, cy, r * 1.06, r * flat * 1.06, 0, a0, a0 + 0.5 * (1 - t))
        ctx.stroke()
      }
    }
    ctx.restore()
  }
}

/** The four-point anime impact star. */
function impactStar(color: string) {
  return (s: Surface, t: number): void => {
    const ctx = s.ctx
    const cx = s.w / 2
    const cy = s.h / 2
    const grow = 0.35 + t * 0.8
    const fade = 1 - t
    ctx.save()
    ctx.globalAlpha = fade
    const pts: Pt[] = []
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8
      const long = i % 2 === 0
      // Uneven spikes: a perfectly regular star reads as a UI asset.
      const jag = long ? 0.72 + rnd(i, 11) * 0.55 : 1
      const r = (long ? s.w * 0.48 : s.w * 0.12) * grow * jag
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
    }
    ctx.fillStyle = color
    ctx.fill(blob(pts, 0.15))
    ctx.globalAlpha = fade * 0.9
    ctx.fillStyle = '#FFFFFF'
    ctx.fill(ellipsePath(cx, cy, s.w * 0.14 * grow, s.w * 0.14 * grow))
    ctx.restore()
  }
}

/** Volumetric dust: overlapping lobes that expand, thin and drift. */
function dust(tone: string) {
  return (s: Surface, t: number): void => {
    const ctx = s.ctx
    const cx = s.w / 2
    const cy = s.h - 5
    ctx.save()
    ctx.globalAlpha = (1 - t) * 0.9
    for (let i = 0; i < 6; i++) {
      const a = Math.PI + (i / 5) * Math.PI
      const d = t * 11
      const px = cx + Math.cos(a) * d * 1.5
      const py = cy + Math.sin(a) * d * 0.55
      const r = 3.4 * (1 - t * 0.5) * (0.7 + (i % 3) * 0.2)
      ctx.fillStyle = mix(tone, '#FFFFFF', 0.4 - t * 0.3)
      ctx.fill(ellipsePath(px, py, r, r * 0.82))
      ctx.fillStyle = mix(tone, '#8A93AE', t * 0.6)
      ctx.fill(ellipsePath(px + r * 0.2, py + r * 0.3, r * 0.6, r * 0.5))
    }
    ctx.restore()
  }
}

/** A splash crown with separating droplets. */
function splash(s: Surface, t: number): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const cy = s.h - 5
  ctx.save()
  ctx.globalAlpha = 1 - t * 0.85
  // Rising column.
  ctx.fillStyle = PAL.foam
  ctx.fill(blob([
    [cx - 4 * (1 + t), cy],
    [cx - 1.6, cy - 12 * t - 3],
    [cx + 1.6, cy - 13 * t - 3],
    [cx + 4 * (1 + t), cy],
  ] as Pt[], 0.7))
  // Droplets with tails.
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i / 6 - 0.5) * 2.3
    const d = t * 17 * (0.7 + rnd(i, 5) * 0.6)
    const px = cx + Math.cos(a) * d
    const py = cy + Math.sin(a) * d * 0.95
    ctx.fillStyle = i % 2 ? PAL.foam : PAL.seaLight
    ctx.fill(ellipsePath(px, py, 1.5 - t, 2.2 - t, a + Math.PI / 2))
  }
  // Surface ring.
  ctx.strokeStyle = rgba(PAL.foam, 0.8)
  ctx.lineWidth = 1 - t * 0.6
  ctx.beginPath()
  ctx.ellipse(cx, cy, 5 + t * 12, 1.6 + t * 3, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

/** The puff an enemy leaves behind. */
function poof(s: Surface, t: number): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const cy = s.h / 2
  ctx.save()
  ctx.globalAlpha = 1 - t
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + t * 1.1
    const d = 2 + t * 13
    const r = (3.6 - t * 2.4) * (0.75 + rnd(i, 7) * 0.5)
    ctx.fillStyle = i % 2 ? PAL.cream : PAL.mist
    ctx.fill(ellipsePath(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, r * 0.9))
  }
  ctx.restore()
}

/** Crescent trail behind a sword swing. */
function slashArc(s: Surface, t: number): void {
  const ctx = s.ctx
  const cx = s.w * 0.2
  const cy = s.h / 2
  ctx.save()
  ctx.globalAlpha = (1 - t) ** 1.2
  ctx.fillStyle = '#DFF4FF'
  ctx.fill(crescentPath(cx, cy, s.w * 0.72 * (0.7 + t * 0.5), 5 * (1 - t * 0.6), -1.1, 1.1))
  ctx.globalAlpha = (1 - t) * 0.8
  ctx.fillStyle = '#FFFFFF'
  ctx.fill(crescentPath(cx, cy, s.w * 0.72 * (0.7 + t * 0.5), 1.6 * (1 - t * 0.6), -0.9, 0.9))
  ctx.restore()
}

/** Speed lines that trail a dash. */
function speedLines(s: Surface, t: number): void {
  const ctx = s.ctx
  ctx.save()
  ctx.globalAlpha = (1 - t) * 0.85
  ctx.lineCap = 'round'
  for (let i = 0; i < 6; i++) {
    const y = 3 + i * (s.h - 6) / 5
    const len = s.w * (0.32 + ((i * 7 + Math.round(t * 5)) % 5) / 7)
    ctx.strokeStyle = i % 2 ? PAL.cream : PAL.ember
    ctx.lineWidth = 1 - i * 0.08
    ctx.beginPath()
    ctx.moveTo(s.w - len, y)
    ctx.lineTo(s.w - 1, y)
    ctx.stroke()
  }
  ctx.restore()
}

/** Steam venting from a powered-up body. */
function steam(s: Surface, t: number): void {
  const ctx = s.ctx
  ctx.save()
  ctx.globalAlpha = (1 - t) * 0.7
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    const d = 3 + t * 10
    const r = (3.8 - t * 2.2) * (0.8 + rnd(i, 2) * 0.4)
    ctx.fillStyle = mix('#FFD9B0', '#FFFFFF', 1 - t)
    ctx.fill(ellipsePath(
      s.w / 2 + Math.cos(a) * d,
      s.h / 2 + Math.sin(a) * d - t * 9,
      r, r * 0.9,
    ))
  }
  ctx.restore()
}

/** Power-up flash: a hard star burst over a radial bloom. */
function flash(s: Surface, t: number): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const cy = s.h / 2
  radialFill(ctx, cx, cy, 0, (s.w / 2) * (0.35 + t), [
    [0, rgba('#FFFFFF', (1 - t) * 0.95)],
    [0.45, rgba(PAL.gold, (1 - t) * 0.5)],
    [1, rgba(PAL.gold, 0)],
  ])
  ctx.save()
  ctx.globalAlpha = (1 - t) ** 1.5
  ctx.strokeStyle = '#FFF6E8'
  ctx.lineCap = 'round'
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    const len = (s.w / 2) * (0.4 + t * 0.9) * (0.7 + rnd(i, 13) * 0.6)
    ctx.lineWidth = 2.4 * (1 - t)
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * len * 0.2, cy + Math.sin(a) * len * 0.2)
    ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len)
    ctx.stroke()
  }
  ctx.restore()
}

/** A pickup twinkle. */
function sparkle(s: Surface, t: number): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const cy = s.h / 2
  const grow = Math.sin(t * Math.PI)
  ctx.save()
  ctx.globalAlpha = grow
  ctx.fillStyle = '#FFFFFF'
  ctx.fill(blob([
    [cx, cy - s.h * 0.45 * grow],
    [cx + s.w * 0.1 * grow, cy],
    [cx, cy + s.h * 0.45 * grow],
    [cx - s.w * 0.1 * grow, cy],
  ] as Pt[], 0.2))
  ctx.fillStyle = PAL.gold
  ctx.fill(blob([
    [cx + s.w * 0.34 * grow, cy],
    [cx, cy + s.h * 0.07 * grow],
    [cx - s.w * 0.34 * grow, cy],
    [cx, cy - s.h * 0.07 * grow],
  ] as Pt[], 0.2))
  ctx.restore()
}

// ─────────────────────────────────────────────────────────────────────────────
// Added effects
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Water ring — what a body entering water leaves behind on the surface.
 *
 * Three rings expanding at different rates with foam beads riding the leading
 * one; heavily flattened, because it lives on the water plane, not in the air.
 */
function waterRing(s: Surface, t: number): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const cy = s.h / 2
  ctx.save()
  ctx.lineCap = 'round'
  for (let k = 0; k < 3; k++) {
    const lag = k * 0.22
    const u = (t - lag) / (1 - lag)
    if (u <= 0) continue
    const r = 3 + u * (s.w / 2 - 4)
    ctx.globalAlpha = (1 - u) ** 1.5 * (1 - k * 0.22)
    ctx.strokeStyle = k === 0 ? PAL.foam : PAL.seaLight
    ctx.lineWidth = Math.max(0.35, 2.4 * (1 - u) * (1 - k * 0.3))
    ctx.beginPath()
    ctx.ellipse(cx, cy, r, r * 0.3, 0, 0, Math.PI * 2)
    ctx.stroke()
    if (k === 0) {
      // Foam beads on the crest, unevenly spaced.
      ctx.fillStyle = '#FFFFFF'
      ctx.globalAlpha = (1 - u) ** 2
      for (let i = 0; i < 9; i++) {
        const a = rnd(i, 21) * Math.PI * 2
        const bs = 1.1 * (1 - u) * (0.5 + rnd(i, 22))
        ctx.fill(ellipsePath(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.3, bs, bs * 0.7))
      }
    }
  }
  // The dimple the impact left, closing as the rings leave.
  ctx.globalAlpha = (1 - t) ** 2 * 0.8
  ctx.strokeStyle = PAL.seaDeep
  ctx.lineWidth = 1.2 * (1 - t)
  ctx.beginPath()
  ctx.ellipse(cx, cy, 4 * (1 - t) + 1, 1.4 * (1 - t) + 0.4, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

/**
 * Gear aura — the heat a powered-up body throws off. Chevrons climbing out of a
 * flattened base ring, plus vapour: it has to read as pressure, not as a halo,
 * so nothing here is a circle drawn around the character.
 */
function gearAura(color: string) {
  return (s: Surface, t: number): void => {
    const ctx = s.ctx
    const cx = s.w / 2
    const cy = s.h * 0.62
    ctx.save()
    // Base ring, hugging the feet.
    ctx.globalAlpha = (1 - t) * 0.75
    ctx.strokeStyle = color
    ctx.lineWidth = 2.2 * (1 - t * 0.6)
    ctx.beginPath()
    ctx.ellipse(cx, cy + s.h * 0.24, s.w * (0.16 + t * 0.28), s.h * (0.05 + t * 0.08), 0, 0, Math.PI * 2)
    ctx.stroke()
    // Chevrons rising, staggered so the column never pulses in lockstep.
    for (let i = 0; i < 5; i++) {
      const u = (t + i * 0.19) % 1
      const w = s.w * (0.3 - u * 0.16) * (0.7 + rnd(i, 31) * 0.5)
      const y = cy + s.h * 0.26 - u * s.h * 0.72
      ctx.globalAlpha = Math.sin(u * Math.PI) * 0.85
      ctx.strokeStyle = u > 0.55 ? mix(color, '#FFFFFF', 0.55) : color
      ctx.lineWidth = 1.9 * (1 - u * 0.5)
      const off = (rnd(i, 32) - 0.5) * s.w * 0.14
      ctx.beginPath()
      ctx.moveTo(cx + off - w, y + w * 0.34)
      ctx.lineTo(cx + off, y)
      ctx.lineTo(cx + off + w, y + w * 0.34)
      ctx.stroke()
    }
    // Vapour beading off the shoulders. Tall, small and warm — round grey discs
    // at this size read as dust, which is the opposite of what heat looks like.
    for (let i = 0; i < 7; i++) {
      const u = (t + i * 0.14) % 1
      const a = (i / 7) * Math.PI * 2
      const d = s.w * (0.14 + u * 0.18)
      ctx.globalAlpha = Math.sin(u * Math.PI) * 0.7
      ctx.fillStyle = mix(color, '#FFF4DE', 0.45 + u * 0.45)
      const r = s.w * 0.026 * (1 - u * 0.3)
      ctx.fill(ellipsePath(
        cx + Math.cos(a) * d,
        cy + Math.sin(a) * d * 0.55 - u * s.h * 0.42,
        r, r * (1.7 + u * 1.4),
      ))
    }
    ctx.restore()
  }
}

/**
 * Ember burst — hot fragments thrown out and falling.
 *
 * The flash is a hard-edged spike star, not a radial gradient: a soft blob is
 * the one thing this whole style forbids, and it also swallows the embers on
 * the frames where they are densest. Each ember is a streak drawn along its own
 * velocity, so the burst has direction even though it starts symmetric.
 */
function emberBurst(s: Surface, t: number): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const cy = s.h / 2
  ctx.save()
  ctx.lineCap = 'round'

  // Hard flash, two frames, spikes of uneven length.
  if (t < 0.4) {
    const f = 1 - t / 0.4
    const pts: Pt[] = []
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      // Only the spikes vary; jittering the valleys too turns the core into a
      // snowflake instead of a fireball.
      const r = i % 2 === 0
        ? s.w * 0.23 * (0.55 + f * 0.85) * (0.7 + rnd(i, 45) * 0.65)
        : s.w * 0.1 * (0.55 + f * 0.85)
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
    }
    ctx.globalAlpha = f
    ctx.fillStyle = PAL.ember
    ctx.fill(blob(pts, 0.12))
    ctx.fillStyle = '#FFF6D8'
    ctx.fill(blob(pts.map(([x, y]) => [cx + (x - cx) * 0.44, cy + (y - cy) * 0.44] as Pt), 0.12))
  }

  for (let i = 0; i < 16; i++) {
    const a = rnd(i, 41) * Math.PI * 2
    const speed = s.w * (0.24 + rnd(i, 42) * 0.3)
    const life = 0.7 + rnd(i, 43) * 0.3
    const u = Math.min(1, t / life)
    if (u >= 1) continue
    // Ballistic: outward, then gravity takes over.
    const px = cx + Math.cos(a) * speed * u
    const py = cy + Math.sin(a) * speed * u + u * u * s.h * 0.42
    const vx = Math.cos(a) * speed
    const vy = Math.sin(a) * speed + u * s.h * 0.84
    const vl = Math.hypot(vx, vy) || 1
    const tail = (3 + rnd(i, 44) * 3.4) * (1 - u * 0.4)
    ctx.globalAlpha = (1 - u) ** 0.8
    ctx.strokeStyle = u < 0.3 ? '#FFEFBE' : mix(PAL.ember, PAL.bloodOrange, u)
    ctx.lineWidth = 1.9 * (1 - u * 0.55)
    ctx.beginPath()
    ctx.moveTo(px - (vx / vl) * tail, py - (vy / vl) * tail)
    ctx.lineTo(px, py)
    ctx.stroke()
    ctx.strokeStyle = '#FFFFFF'
    ctx.globalAlpha = (1 - u) ** 1.6
    ctx.lineWidth = 0.7 * (1 - u * 0.5)
    ctx.beginPath()
    ctx.moveTo(px - (vx / vl) * tail * 0.3, py - (vy / vl) * tail * 0.3)
    ctx.lineTo(px, py)
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * Coin pop — the flourish when a berry is banked.
 *
 * Biased upward and broken up: a concentric ring of evenly-spaced shards reads
 * as a portal, so the ring only survives two frames, it breaks into arcs, and
 * the shards leave it behind on their own trajectories.
 */
function coinPop(s: Surface, t: number): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const cy = s.h * 0.55
  ctx.save()
  ctx.lineCap = 'round'

  // The ring, only while the pop is still happening, and already coming apart.
  if (t < 0.55) {
    const f = 1 - t / 0.55
    ctx.globalAlpha = f ** 1.3
    ctx.strokeStyle = PAL.gold
    ctx.lineWidth = 2.6 * f
    const r = s.w * (0.1 + (1 - f) * 0.26)
    for (let i = 0; i < 4; i++) {
      const a0 = i * 1.57 + 0.3 + (1 - f) * 0.8
      ctx.beginPath()
      ctx.ellipse(cx, cy, r, r * 0.86, 0, a0, a0 + 1.15 * f + 0.15)
      ctx.stroke()
    }
    ctx.globalAlpha = f ** 2
    ctx.fillStyle = '#FFFFFF'
    ctx.fill(ellipsePath(cx, cy, s.w * 0.08 * f, s.w * 0.08 * f))
  }

  // Shards: diamonds thrown up and out, tumbling, well past the ring.
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (rnd(i, 51) - 0.5) * 3.4
    const speed = s.w * (0.3 + rnd(i, 52) * 0.28)
    const u = Math.min(1, t / (0.75 + rnd(i, 53) * 0.25))
    if (u >= 1) continue
    const px = cx + Math.cos(a) * speed * u
    const py = cy + Math.sin(a) * speed * u + u * u * s.h * 0.5
    const r = s.w * 0.09 * (1 - u * 0.55)
    ctx.save()
    ctx.globalAlpha = (1 - u) ** 0.9
    ctx.translate(px, py)
    ctx.rotate(a + u * 5 * (rnd(i, 54) > 0.5 ? 1 : -1))
    ctx.fillStyle = i % 3 === 0 ? PAL.cream : PAL.gold
    ctx.fill(blob([[0, -r], [r * 0.45, 0], [0, r], [-r * 0.45, 0]] as Pt[], 0.15))
    ctx.restore()
  }
  ctx.restore()
}

/**
 * Wall-slide dust — grit scraped off a vertical face. It hugs the wall on one
 * side of the frame and climbs, because the character is moving down past it.
 */
function wallSlideDust(s: Surface, t: number): void {
  const ctx = s.ctx
  const wall = s.w * 0.28
  ctx.save()
  for (let i = 0; i < 5; i++) {
    const u = (t + i * 0.21) % 1
    const y = s.h * 0.78 - u * s.h * 0.66
    const spread = 1 + u * 4.4
    ctx.globalAlpha = (1 - u) * 0.75
    ctx.fillStyle = mix('#E6DDC8', '#A8AEC0', u * 0.7)
    ctx.fill(ellipsePath(wall + spread * (0.6 + rnd(i, 61)), y, 2.4 + u * 2.2, 1.7 + u * 1.5))
    ctx.fillStyle = mix('#FFFFFF', '#E6DDC8', u)
    ctx.fill(ellipsePath(wall + spread * 0.4, y - 0.6, 1.4 * (1 - u * 0.5), 1.1 * (1 - u * 0.5)))
  }
  // Grit flicking off the contact point.
  ctx.globalAlpha = (1 - t) * 0.9
  ctx.fillStyle = PAL.cream
  for (let i = 0; i < 5; i++) {
    const u = (t * 1.4 + rnd(i, 62)) % 1
    ctx.fill(ellipsePath(
      wall + 1 + u * s.w * 0.3,
      s.h * 0.8 - u * s.h * 0.5 + rnd(i, 63) * 4,
      0.7 * (1 - u), 0.7 * (1 - u),
    ))
  }
  ctx.restore()
}

/**
 * Blossom — cherry petals, for Wano. Each petal turns about its own axis, so it
 * flashes between broad and edge-on as it falls rather than sliding flat.
 */
function blossom(s: Surface, t: number): void {
  const ctx = s.ctx
  ctx.save()
  for (let i = 0; i < 7; i++) {
    const u = (t + rnd(i, 71)) % 1
    const x = s.w * (0.12 + rnd(i, 72) * 0.76) + Math.sin(u * 5 + i) * s.w * 0.1
    const y = s.h * (u * 1.05 - 0.05)
    const turn = u * 7 + i
    const wide = Math.abs(Math.cos(turn))
    const r = s.w * 0.11
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(Math.sin(u * 4 + i) * 0.8)
    ctx.globalAlpha = Math.min(1, (1 - u) * 2.4) * 0.95
    // Petal: a notched teardrop, squeezed by its own rotation.
    ctx.fillStyle = wide > 0.5 ? PAL.chopperPink : mix(PAL.chopperPink, '#FFFFFF', 0.45)
    ctx.fill(blob([
      [0, -r], [r * 0.72 * (0.25 + wide), -r * 0.15],
      [r * 0.3 * (0.25 + wide), r * 0.9], [0, r * 0.6],
      [-r * 0.3 * (0.25 + wide), r * 0.9], [-r * 0.72 * (0.25 + wide), -r * 0.15],
    ] as Pt[], 0.8))
    ctx.fillStyle = rgba('#FFFFFF', 0.5 * wide)
    ctx.fill(blob([
      [0, -r * 0.9], [r * 0.3 * (0.25 + wide), -r * 0.1], [0, r * 0.1],
    ] as Pt[], 0.6))
    ctx.restore()
  }
  ctx.restore()
}

/** Bubbles rising underwater, wobbling and popping into a ring. */
function bubble(s: Surface, t: number): void {
  const ctx = s.ctx
  ctx.save()
  for (let i = 0; i < 6; i++) {
    const u = (t + rnd(i, 81)) % 1
    const r = s.w * (0.06 + rnd(i, 82) * 0.09)
    const x = s.w * (0.2 + rnd(i, 83) * 0.6) + Math.sin(u * 6.5 + i * 2) * s.w * 0.08
    const y = s.h * (0.95 - u * 0.95)
    if (u > 0.88) {
      // Pop: a ring, briefly, then nothing.
      const p = (u - 0.88) / 0.12
      ctx.globalAlpha = 1 - p
      ctx.strokeStyle = PAL.foam
      ctx.lineWidth = 0.8 * (1 - p)
      ctx.beginPath()
      ctx.arc(x, y, r * (1 + p * 1.4), 0, Math.PI * 2)
      ctx.stroke()
      continue
    }
    const wob = 1 + Math.sin(u * 11 + i) * 0.13
    ctx.globalAlpha = 0.9
    ctx.strokeStyle = rgba(PAL.foam, 0.95)
    ctx.lineWidth = 0.75
    ctx.stroke(ellipsePath(x, y, r * wob, r / wob))
    ctx.fillStyle = rgba(PAL.seaLight, 0.3)
    ctx.fill(ellipsePath(x, y, r * wob, r / wob))
    ctx.fillStyle = rgba('#FFFFFF', 0.9)
    ctx.fill(ellipsePath(x - r * 0.35, y - r * 0.4, r * 0.24, r * 0.2, -0.6))
  }
  ctx.restore()
}

/**
 * Lightning arc — a branching bolt down the frame. The path is regenerated per
 * frame from the same seed table, so it flickers without ever repeating within
 * the burst, which is exactly how a real strike reads.
 */
function lightningArc(s: Surface, t: number): void {
  const ctx = s.ctx
  const step = Math.round(t * 5)
  const spine: Pt[] = []
  const segs = 9
  for (let i = 0; i <= segs; i++) {
    const u = i / segs
    const jitter = i === 0 || i === segs ? 0 : (rnd(i, 91 + step * 7) - 0.5) * s.w * 0.42
    spine.push([s.w * 0.5 + jitter + (u - 0.5) * s.w * 0.14, u * s.h])
  }
  const stroke = (pts: Pt[], w: number, color: string, alpha: number) => {
    ctx.globalAlpha = alpha
    ctx.strokeStyle = color
    ctx.lineWidth = w
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
    ctx.stroke()
  }
  ctx.save()
  ctx.lineJoin = 'miter'
  ctx.lineCap = 'butt'
  const fade = (1 - t) ** 0.7
  stroke(spine, 5.5, rgba(PAL.magic, 0.28 * fade), 1)
  stroke(spine, 2.6, PAL.magic, 0.85 * fade)
  stroke(spine, 1, '#FFFFFF', fade)
  // Forks peeling off the spine.
  for (let i = 2; i < segs - 1; i += 3) {
    const from = spine[i]
    const dir = rnd(i, 95 + step) > 0.5 ? 1 : -1
    const fork: Pt[] = [from]
    for (let k = 1; k <= 3; k++) {
      fork.push([
        from[0] + dir * k * s.w * 0.16 * (0.6 + rnd(i + k, 96 + step)),
        from[1] + k * s.h * 0.07 * (0.5 + rnd(i + k, 97 + step)),
      ])
    }
    stroke(fork, 1.5, PAL.magic, 0.7 * fade)
    stroke(fork, 0.5, '#FFFFFF', 0.8 * fade)
  }
  ctx.restore()
}

/**
 * Sand swirl — Alabasta's wind picking grit up off the ground.
 *
 * Drawn as dashes on the vortex path, not as continuous ribbons: a smooth
 * unbroken tube reads as rope or a helix diagram, and sand is by definition
 * particulate. A low plume anchors it to the ground so it is not floating.
 */
function sandSwirl(s: Surface, t: number): void {
  const ctx = s.ctx
  const cx = s.w / 2
  const base = s.h * 0.92
  ctx.save()
  ctx.lineCap = 'round'

  // Ground plume: flat lobes spreading at the foot of the column.
  for (let i = 0; i < 5; i++) {
    const u = (t * 0.8 + rnd(i, 105)) % 1
    ctx.globalAlpha = (1 - t) * (1 - u) * 0.6
    ctx.fillStyle = mix(PAL.sand, '#FFFFFF', 0.3 - u * 0.2)
    const w = s.w * (0.1 + u * 0.3)
    ctx.fill(ellipsePath(
      cx + (rnd(i, 106) - 0.5) * s.w * 0.5,
      base - u * s.h * 0.12,
      w, w * 0.36,
    ))
  }

  // The vortex, as broken streaks riding four rising helices.
  for (let b = 0; b < 4; b++) {
    const lead = b * 1.62 + t * Math.PI * 2
    const steps = 21
    let prev: Pt | null = null
    for (let k = 0; k <= steps; k++) {
      const u = k / steps
      const rad = s.w * (0.34 - u * 0.19) * (0.65 + rnd(b, 101) * 0.5)
      const a = lead + u * 4.0
      const p: Pt = [
        cx + Math.cos(a) * rad,
        base - u * s.h * 0.84 + Math.sin(a) * rad * 0.16,
      ]
      // Roughly half the steps carry a grain streak; the gaps are the point.
      if (prev && rnd(k * 3 + b, 107) > 0.42) {
        ctx.globalAlpha = (1 - t) * (0.4 + rnd(k + b, 108) * 0.55) * (1 - u * 0.35)
        ctx.strokeStyle = rnd(k, 109) > 0.5
          ? mix(PAL.sand, '#FFFFFF', 0.4)
          : mix(PAL.sand, PAL.sandDeep, 0.5)
        ctx.lineWidth = (0.7 + rnd(k + b * 5, 110) * 1.1) * (1 - u * 0.35)
        ctx.beginPath()
        ctx.moveTo(prev[0], prev[1])
        ctx.lineTo(p[0], p[1])
        ctx.stroke()
      }
      prev = p
    }
  }

  // Loose grains flicked clear of the column.
  ctx.fillStyle = PAL.sand
  for (let i = 0; i < 12; i++) {
    const u = (t + rnd(i, 103)) % 1
    ctx.globalAlpha = (1 - t) * (1 - u) * 0.9
    ctx.fill(ellipsePath(
      cx + (rnd(i, 104) - 0.5) * s.w * 0.95,
      base - u * s.h * 0.9,
      0.85, 0.55,
    ))
  }
  ctx.restore()
}

/**
 * Ghost wisp — Thriller Bark. A drifting shade that stretches as it rises and
 * comes apart at the tail; the two eye dots are the whole joke, so they hold
 * until the very last frame.
 */
function ghostWisp(s: Surface, t: number): void {
  const ctx = s.ctx
  const cx = s.w / 2 + Math.sin(t * 4) * s.w * 0.08
  const cy = s.h * (0.72 - t * 0.55)
  const r = s.w * 0.2 * (1 - t * 0.35)
  ctx.save()
  ctx.globalAlpha = Math.min(1, (1 - t) * 1.8) * 0.85
  radialFill(ctx, cx, cy, 0, r * 3, [
    [0, rgba(PAL.poison, 0.4)],
    [1, rgba(PAL.poison, 0)],
  ])
  // Body, with a tail that frays into three points.
  const tail = r * (1.4 + t * 1.6)
  ctx.fillStyle = mix('#CDBBEA', PAL.poison, t * 0.5)
  ctx.fill(blob([
    [cx, cy - r * 1.25],
    [cx + r, cy - r * 0.3],
    [cx + r * 0.75, cy + tail * 0.55],
    [cx + r * 0.3, cy + tail * 0.25],
    [cx, cy + tail],
    [cx - r * 0.3, cy + tail * 0.25],
    [cx - r * 0.75, cy + tail * 0.55],
    [cx - r, cy - r * 0.3],
  ] as Pt[], 0.95))
  ctx.fillStyle = rgba('#FFFFFF', 0.55)
  ctx.fill(blob([
    [cx - r * 0.15, cy - r * 1.1], [cx - r * 0.75, cy - r * 0.35],
    [cx - r * 0.55, cy + r * 0.3],
  ] as Pt[], 0.9))
  ctx.fillStyle = '#2A1E44'
  ctx.fill(ellipsePath(cx - r * 0.38, cy - r * 0.28, r * 0.16, r * 0.24))
  ctx.fill(ellipsePath(cx + r * 0.38, cy - r * 0.28, r * 0.16, r * 0.24))
  ctx.fill(ellipsePath(cx, cy + r * 0.28, r * 0.14, r * 0.2))
  // Shreds peeling off the tail as it dissipates.
  if (t > 0.3) {
    ctx.globalAlpha = (1 - t) * 0.7
    ctx.fillStyle = rgba('#CDBBEA', 0.8)
    for (let i = 0; i < 4; i++) {
      const u = (t - 0.3) / 0.7
      ctx.fill(ellipsePath(
        cx + (rnd(i, 111) - 0.5) * r * 3 * u,
        cy + tail * 0.7 + u * r * 2 * rnd(i, 112),
        r * 0.2 * (1 - u), r * 0.16 * (1 - u),
      ))
    }
  }
  ctx.restore()
}

const seq = (draw: (s: Surface, t: number) => void, frames: number, dur: number) =>
  Array.from({ length: frames }, (_, i) => ({
    dur,
    draw: (s: Surface) => draw(s, i / (frames - 1 || 1)),
  }))

/** Loops sample [0, 1) instead of [0, 1], so the cycle does not stutter. */
const loopSeq = (draw: (s: Surface, t: number) => void, frames: number, dur: number) =>
  Array.from({ length: frames }, (_, i) => ({
    dur,
    draw: (s: Surface) => draw(s, i / frames),
  }))

export function buildEffectSheets(): Record<string, SpriteSheet> {
  const mk = (draw: (s: Surface, t: number) => void, frames: number, dur: number, w: number, h = w) =>
    new SheetBuilder({ fw: w, fh: h, ox: -w / 2, oy: -h / 2, contour: null })
      .add('play', seq(draw, frames, dur), { loop: false })
      .build()

  /** For ambience that has no end: petals, bubbles, aura. */
  const mkLoop = (
    draw: (s: Surface, t: number) => void, frames: number, dur: number, w: number, h = w,
  ) =>
    new SheetBuilder({ fw: w, fh: h, ox: -w / 2, oy: -h / 2, contour: null })
      .add('play', loopSeq(draw, frames, dur), { loop: true })
      .alias('idle', 'play')
      .build()

  return {
    'impact-white': mk(shockRing(PAL.cream), 5, 0.032, 40),
    'impact-gold': mk(shockRing(PAL.gold), 5, 0.032, 48),
    'impact-red': mk(shockRing(PAL.danger), 5, 0.036, 56),
    'impact-star': mk(impactStar(PAL.gold), 5, 0.03, 44),
    shockwave: mk(shockRing(PAL.cream, 0.22), 6, 0.03, 64),
    dust: mk(dust('#E8E2D2'), 6, 0.045, 30),
    'landing-dust-heavy': mk(dust('#D8D0BE'), 7, 0.045, 46),
    splash: mk(splash, 6, 0.045, 36),
    poof: mk(poof, 6, 0.04, 36),
    'slash-arc': mk(slashArc, 5, 0.03, 44, 34),
    'speed-lines': mk(speedLines, 4, 0.035, 42, 26),
    steam: mk(steam, 6, 0.05, 38),
    flash: mk(flash, 6, 0.038, 68),
    sparkle: mk(sparkle, 6, 0.04, 20),

    'water-ring': mk(waterRing, 7, 0.045, 52, 30),
    'gear-aura': mkLoop(gearAura(PAL.ember), 8, 0.06, 44, 52),
    'ember-burst': mk(emberBurst, 7, 0.04, 52),
    'coin-pop': mk(coinPop, 6, 0.035, 30),
    'wall-slide-dust': mkLoop(wallSlideDust, 6, 0.05, 26, 30),
    blossom: mkLoop(blossom, 10, 0.09, 34, 46),
    bubble: mkLoop(bubble, 10, 0.08, 26, 40),
    'lightning-arc': mk(lightningArc, 5, 0.035, 34, 56),
    'sand-swirl': mk(sandSwirl, 8, 0.05, 40, 46),
    'ghost-wisp': mk(ghostWisp, 8, 0.06, 30, 40),
  }
}
