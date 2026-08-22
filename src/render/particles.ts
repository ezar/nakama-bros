import type { RenderContext, SpriteSheet } from '../types'
import { Rng } from '../engine/rng'
import { clamp, clamp01 } from '../engine/math'
import { PAL } from '../art/palette'
import { mix, rgba } from '../art/color'

const TAU = Math.PI * 2

/**
 * Key light direction, matching `KEY_LIGHT` in the art layer: the sun sits up
 * and to the left, so every shaded particle takes its terminator from the same
 * vector the sprites do.
 */
const LIGHT_X = -0.6
const LIGHT_Y = -0.8

export type ParticleShape =
  // Original set — gameplay code already uses these names.
  | 'pixel' | 'circle' | 'spark' | 'ring' | 'shard' | 'smoke' | 'star'
  // Cel-shaded additions.
  | 'puff' | 'streak' | 'droplet' | 'petal' | 'bubble' | 'glow' | 'sprite' | 'shock'

/** One frame of a sheet, usable as a particle. See `spritesFrom()`. */
export interface ParticleSprite {
  image: CanvasImageSource
  sx: number
  sy: number
  sw: number
  sh: number
  /** Destination size in WORLD UNITS. */
  w: number
  h: number
}

/**
 * Pulls a particle toward a point — collected berries flying to the HUD, ghost
 * wisps converging on a boss, iron filings on a magnet.
 */
export interface ParticleAttract {
  x: number
  y: number
  /** Acceleration toward the target, world units / s². */
  accel: number
  /** Velocity ceiling while attracted. */
  maxSpeed?: number
  /** Die when this close to the target. Defaults to 4 world units. */
  arrive?: number
  /** 0..1 per second — steers existing velocity straight at the target. */
  home?: number
  /** Name registered with `setAttractor()`; its live position wins over x/y. */
  target?: string
}

export interface ParticleDef {
  x: number
  y: number
  vx: number
  vy: number
  /** Seconds. */
  life: number
  size: number
  /** Size multiplier at the end of life. */
  sizeEnd?: number
  color: string
  /** Optional second colour, cross-faded over life. */
  colorEnd?: string
  shape?: ParticleShape
  gravity?: number
  drag?: number
  /** Additive blending — use for sparks, embers and magic. */
  additive?: boolean
  /** Radians. */
  rotation?: number
  spin?: number
  /** Drawn before entities when true. */
  behind?: boolean
  /** Fades out over the last fraction of life. */
  fadeAt?: number
  /** Fades in over the first fraction of life. 0 = pop in. */
  fadeIn?: number
  /** Peak opacity, 0..1. */
  alpha?: number

  // ── Cel shading ────────────────────────────────────────────────────────────
  /** Split the fill with a hard terminator. 0 = flat, 1 = full shadow tone. */
  shade?: number
  /** Ink contour colour. Omit for no line. */
  ink?: string
  /** Rim light colour on the key side. Only drawn on shapes above ~3 units. */
  rim?: string

  // ── Extras ─────────────────────────────────────────────────────────────────
  /** Soft additive halo, as a multiple of `size`. Drawn under the shape. */
  glow?: number
  /** Motion trail length in segments, 1..TRAIL_MAX. */
  trail?: number
  /** Sprite frame(s). An array is played across the particle's life. */
  sprite?: ParticleSprite | ParticleSprite[]
  /** Sine sway amplitude in world units/s — falling petals, rising bubbles. */
  sway?: number
  swayFreq?: number
  /** Collide with the world through the system's collider callback. */
  collide?: boolean
  /** Restitution when it hits, 0..1. */
  bounce?: number
  /** Horizontal velocity kept per bounce off the floor, 0..1. */
  friction?: number
  /** Die on the first contact instead of bouncing. */
  stick?: boolean
  attract?: ParticleAttract
  /** Counted by `takeArrivals(tag)` when the particle reaches its attractor. */
  arriveTag?: string
  /** Align rotation to the direction of travel. Streaks and droplets do this. */
  aim?: boolean
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  size: number
  sizeEnd: number
  color: string
  colorEnd: string
  shape: ParticleShape
  gravity: number
  drag: number
  additive: boolean
  rotation: number
  spin: number
  behind: boolean
  fadeAt: number
  fadeIn: number
  alpha: number
  shade: number
  ink: string | null
  rim: string | null
  glow: number
  trail: number
  sprites: ParticleSprite[] | null
  sway: number
  swayFreq: number
  collide: boolean
  bounce: number
  friction: number
  stick: boolean
  attract: ParticleAttract | null
  arriveTag: string | null
  aim: boolean
  /** Stable 0..1 per particle — drives lobe placement and sway phase. */
  seed: number
  /** Its own slot, so recycling never has to search the pool. */
  idx: number
  trailBuf: Float32Array | null
  trailLen: number
  t: number
  alive: boolean
}

/** True where the world is solid. Supplied by the game so this file stays free of TileMap. */
export type SolidQuery = (x: number, y: number) => boolean

const MAX = 2000
const TRAIL_MAX = 8

/**
 * A pooled particle system.
 *
 * Everything works in WORLD UNITS: the renderer hands us a context already
 * scaled by RENDER_SCALE and translated by the camera, so a `size` of 3 is 3
 * world units — about a fifth of a tile — no matter what the buffer resolution
 * is. A character is ~13 units wide and ~30 tall; that is the ruler to size
 * dust against.
 *
 * Draw order is: behind-layer normal, behind-layer additive, entities,
 * front-layer normal, front-layer additive. Splitting by blend mode means the
 * composite op changes twice per layer instead of once per particle.
 */
export class ParticleSystem {
  private pool: Particle[] = []
  private free: number[] = []
  private cursor = 0
  private live = 0
  private rng = new Rng(0xbeef)
  private solid: SolidQuery | null = null
  private attractors = new Map<string, { x: number; y: number }>()
  private arrivals = new Map<string, number>()
  private glowCache = new Map<string, HTMLCanvasElement>()
  private shadeCache = new Map<string, string>()
  /** Ambient drift applied to anything with `sway` — wind, updraft, current. */
  wind = { x: 0, y: 0 }

  constructor() {
    for (let i = 0; i < MAX; i++) {
      this.pool.push({
        x: 0, y: 0, vx: 0, vy: 0, life: 0, size: 1, sizeEnd: 1,
        color: '#fff', colorEnd: '#fff', shape: 'pixel', gravity: 0, drag: 0,
        additive: false, rotation: 0, spin: 0, behind: false, fadeAt: 0.6,
        fadeIn: 0, alpha: 1, shade: 0, ink: null, rim: null, glow: 0, trail: 0,
        sprites: null, sway: 0, swayFreq: 3, collide: false, bounce: 0.35,
        friction: 0.7, stick: false, attract: null, arriveTag: null, aim: false,
        seed: 0, idx: i, trailBuf: null, trailLen: 0, t: 0, alive: false,
      })
      this.free.push(i)
    }
  }

  get count(): number {
    return this.live
  }

  /**
   * Give the system a way to ask the world what is solid. Without one, the
   * `collide` flag is simply ignored, so nothing here depends on TileMap.
   */
  setCollider(fn: SolidQuery | null): void {
    this.solid = fn
  }

  /**
   * Register or move a named attractor. Particles emitted with
   * `attract: { target: name, ... }` follow it as it moves, which is what lets
   * collected berries chase a HUD counter that is itself animating.
   */
  setAttractor(name: string, x: number, y: number): void {
    const a = this.attractors.get(name)
    if (a) {
      a.x = x
      a.y = y
    } else {
      this.attractors.set(name, { x, y })
    }
  }

  /** Number of particles that reached their attractor since the last call. */
  takeArrivals(tag: string): number {
    const n = this.arrivals.get(tag) ?? 0
    if (n) this.arrivals.set(tag, 0)
    return n
  }

  emit(def: ParticleDef): void {
    let idx = this.free.pop()
    if (idx === undefined) {
      // Saturated: steal the slot the cursor is on, round-robin, so a burst
      // never silently drops all of its particles.
      idx = this.cursor
      this.cursor = (this.cursor + 1) % MAX
      // Mark the victim dead so the live count below is bookkept exactly once.
      this.pool[idx].alive = false
      this.live--
    }
    const p = this.pool[idx]
    p.x = def.x
    p.y = def.y
    p.vx = def.vx
    p.vy = def.vy
    p.life = Math.max(0.016, def.life)
    p.size = def.size
    p.sizeEnd = def.sizeEnd ?? def.size
    p.color = def.color
    p.colorEnd = def.colorEnd ?? def.color
    p.shape = def.shape ?? 'pixel'
    p.gravity = def.gravity ?? 0
    p.drag = def.drag ?? 0
    p.additive = def.additive ?? false
    p.rotation = def.rotation ?? 0
    p.spin = def.spin ?? 0
    p.behind = def.behind ?? false
    p.fadeAt = def.fadeAt ?? 0.6
    p.fadeIn = def.fadeIn ?? 0
    p.alpha = def.alpha ?? 1
    p.shade = def.shade ?? 0
    p.ink = def.ink ?? null
    p.rim = def.rim ?? null
    p.glow = def.glow ?? 0
    p.trail = def.trail ? clamp(Math.round(def.trail), 1, TRAIL_MAX) : 0
    p.sprites = def.sprite ? (Array.isArray(def.sprite) ? def.sprite : [def.sprite]) : null
    p.sway = def.sway ?? 0
    p.swayFreq = def.swayFreq ?? 3
    p.collide = def.collide ?? false
    p.bounce = def.bounce ?? 0.35
    p.friction = def.friction ?? 0.7
    p.stick = def.stick ?? false
    p.attract = def.attract ?? null
    p.arriveTag = def.arriveTag ?? null
    p.aim = def.aim ?? false
    p.seed = this.rng.next()
    p.t = 0
    p.trailLen = 0
    if (p.trail > 0 && !p.trailBuf) p.trailBuf = new Float32Array(TRAIL_MAX * 2)
    if (!p.alive) this.live++
    p.alive = true
  }

  /** Emit `n` particles spread over a cone. Angles in radians. */
  burst(
    n: number,
    x: number,
    y: number,
    opts: Omit<ParticleDef, 'x' | 'y' | 'vx' | 'vy'> & {
      speed: number
      speedVar?: number
      angle?: number
      spread?: number
      spawnRadius?: number
      lifeVar?: number
      sizeVar?: number
    },
  ): void {
    const angle = opts.angle ?? -Math.PI / 2
    const spread = opts.spread ?? Math.PI * 2
    for (let i = 0; i < n; i++) {
      const a = angle + this.rng.range(-spread / 2, spread / 2)
      const sp = opts.speed + this.rng.range(-(opts.speedVar ?? 0), opts.speedVar ?? 0)
      const r = opts.spawnRadius ? this.rng.range(0, opts.spawnRadius) : 0
      const sv = opts.sizeVar ? this.rng.range(-opts.sizeVar, opts.sizeVar) : 0
      this.emit({
        ...opts,
        x: x + Math.cos(a) * r,
        y: y + Math.sin(a) * r,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        size: Math.max(0.3, opts.size + sv),
        sizeEnd: opts.sizeEnd === undefined ? undefined : Math.max(0.1, opts.sizeEnd + sv),
        rotation: opts.rotation ?? (opts.aim ? a : this.rng.range(0, TAU)),
        life: opts.life + this.rng.range(-(opts.lifeVar ?? 0), opts.lifeVar ?? 0),
      })
    }
  }

  update(dt: number): void {
    const solid = this.solid
    for (const p of this.pool) {
      if (!p.alive) continue
      p.t += dt
      if (p.t >= p.life) {
        this.kill(p)
        continue
      }

      if (p.trail > 0 && p.trailBuf) {
        // Newest sample first; the tail slides down one slot.
        const buf = p.trailBuf
        for (let i = Math.min(p.trailLen, p.trail - 1); i > 0; i--) {
          buf[i * 2] = buf[(i - 1) * 2]
          buf[i * 2 + 1] = buf[(i - 1) * 2 + 1]
        }
        buf[0] = p.x
        buf[1] = p.y
        if (p.trailLen < p.trail) p.trailLen++
      }

      p.vy += p.gravity * dt

      if (p.attract) {
        const a = p.attract
        const live = a.target ? this.attractors.get(a.target) : undefined
        const tx = live ? live.x : a.x
        const ty = live ? live.y : a.y
        const dx = tx - p.x
        const dy = ty - p.y
        const d = Math.hypot(dx, dy) || 1
        if (d <= (a.arrive ?? 4)) {
          if (p.arriveTag) this.arrivals.set(p.arriveTag, (this.arrivals.get(p.arriveTag) ?? 0) + 1)
          this.kill(p)
          continue
        }
        p.vx += (dx / d) * a.accel * dt
        p.vy += (dy / d) * a.accel * dt
        if (a.home) {
          // Steer the existing speed toward the target so the arc tightens as
          // it closes instead of overshooting in a lazy orbit.
          const k = clamp01(a.home * dt * 6)
          const sp = Math.hypot(p.vx, p.vy)
          p.vx += ((dx / d) * sp - p.vx) * k
          p.vy += ((dy / d) * sp - p.vy) * k
        }
        const max = a.maxSpeed ?? 0
        if (max > 0) {
          const sp = Math.hypot(p.vx, p.vy)
          if (sp > max) {
            p.vx = (p.vx / sp) * max
            p.vy = (p.vy / sp) * max
          }
        }
      }

      if (p.drag > 0) {
        const d = Math.pow(1 - p.drag, dt * 60)
        p.vx *= d
        p.vy *= d
      }

      let mx = p.vx
      let my = p.vy
      if (p.sway !== 0) {
        mx += Math.sin((p.t + p.seed * 10) * p.swayFreq) * p.sway + this.wind.x
        my += Math.cos((p.t + p.seed * 7) * p.swayFreq * 0.7) * p.sway * 0.35 + this.wind.y
      }

      if (p.collide && solid) {
        const nx = p.x + mx * dt
        const ny = p.y + my * dt
        if (solid(nx, p.y)) {
          if (p.stick) {
            p.vx = 0
            p.vy = 0
            p.collide = false
            continue
          }
          p.vx = -p.vx * p.bounce
          mx = p.vx
        } else {
          p.x = nx
        }
        if (solid(p.x, ny)) {
          if (p.stick) {
            p.vx = 0
            p.vy = 0
            p.collide = false
            continue
          }
          // Landing kills most of the vertical energy and scrubs the slide.
          p.vy = -p.vy * p.bounce
          p.vx *= p.friction
          p.spin *= p.friction
          if (Math.abs(p.vy) < 12) {
            p.vy = 0
            p.gravity = 0
            p.spin = 0
          }
        } else {
          p.y = ny
        }
      } else {
        p.x += mx * dt
        p.y += my * dt
      }

      if (p.aim && (p.vx !== 0 || p.vy !== 0)) p.rotation = Math.atan2(p.vy, p.vx)
      else p.rotation += p.spin * dt
    }
  }

  clear(): void {
    for (let i = 0; i < MAX; i++) {
      this.pool[i].alive = false
    }
    this.free.length = 0
    for (let i = 0; i < MAX; i++) this.free.push(i)
    this.live = 0
    this.arrivals.clear()
  }

  private kill(p: Particle): void {
    if (!p.alive) return
    p.alive = false
    p.trailLen = 0
    this.live--
    this.free.push(p.idx)
  }

  /** Draw one pass. `behind` selects the layer. */
  draw(rc: RenderContext, behind: boolean): void {
    const { ctx } = rc
    ctx.save()
    // Two sub-passes so the composite op flips twice per layer, not per sprite.
    for (const additive of [false, true]) {
      ctx.globalCompositeOperation = additive ? 'lighter' : 'source-over'
      for (const p of this.pool) {
        if (!p.alive || p.behind !== behind || p.additive !== additive) continue
        const u = p.t / p.life
        let a = p.alpha
        if (u < p.fadeIn) a *= u / p.fadeIn
        else if (u > p.fadeAt) a *= 1 - (u - p.fadeAt) / (1 - p.fadeAt)
        a = clamp01(a)
        if (a <= 0.004) continue
        const color = u < 0.5 ? p.color : p.colorEnd
        const size = p.size + (p.sizeEnd - p.size) * u

        if (p.trail > 1 && p.trailLen > 1) this.drawTrail(ctx, p, color, size, a)
        if (p.glow > 0) {
          ctx.globalCompositeOperation = 'lighter'
          ctx.globalAlpha = a * 0.85
          const g = this.glowTexture(color)
          const r = size * p.glow
          ctx.drawImage(g, p.x - r, p.y - r, r * 2, r * 2)
          if (!additive) ctx.globalCompositeOperation = 'source-over'
        }

        ctx.globalAlpha = a
        ctx.fillStyle = color
        this.drawShape(ctx, p, color, size, u)
      }
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.restore()
  }

  private drawTrail(
    ctx: CanvasRenderingContext2D,
    p: Particle,
    color: string,
    size: number,
    alpha: number,
  ): void {
    const buf = p.trailBuf!
    ctx.strokeStyle = color
    ctx.lineCap = 'round'
    for (let i = 0; i < p.trailLen - 1; i++) {
      const k = 1 - i / p.trailLen
      ctx.globalAlpha = alpha * k * 0.6
      ctx.lineWidth = Math.max(0.25, size * k * 0.9)
      ctx.beginPath()
      ctx.moveTo(buf[i * 2], buf[i * 2 + 1])
      ctx.lineTo(buf[(i + 1) * 2], buf[(i + 1) * 2 + 1])
      ctx.stroke()
    }
  }

  /** A cached soft radial, used for every additive halo. */
  private glowTexture(color: string): HTMLCanvasElement {
    let c = this.glowCache.get(color)
    if (c) return c
    const R = 48
    c = document.createElement('canvas')
    c.width = R * 2
    c.height = R * 2
    const g = c.getContext('2d')!
    const grad = g.createRadialGradient(R, R, 0, R, R, R)
    grad.addColorStop(0, rgba(hexish(color), 0.95))
    grad.addColorStop(0.35, rgba(hexish(color), 0.42))
    grad.addColorStop(1, rgba(hexish(color), 0))
    g.fillStyle = grad
    g.fillRect(0, 0, R * 2, R * 2)
    this.glowCache.set(color, c)
    return c
  }

  /** Shadow tone for a fill colour: darker and rotated cool, cached per colour. */
  private shadeOf(color: string): string {
    let s = this.shadeCache.get(color)
    if (!s) {
      s = mix(hexish(color), PAL.shadow, 0.42)
      this.shadeCache.set(color, s)
    }
    return s
  }

  private drawShape(
    ctx: CanvasRenderingContext2D,
    p: Particle,
    color: string,
    size: number,
    u: number,
  ): void {
    const s = Math.max(0.25, size)
    const { x, y, rotation: rot } = p
    switch (p.shape) {
      case 'pixel':
        // Not pixel art any more: a crisp little square, un-snapped, so it
        // moves smoothly instead of stepping across the device grid.
        ctx.fillRect(x - s / 2, y - s / 2, s, s)
        break

      case 'circle':
        ctx.beginPath()
        ctx.arc(x, y, s, 0, TAU)
        ctx.fill()
        break

      case 'smoke':
      case 'puff':
        this.drawPuff(ctx, p, color, s)
        break

      case 'spark':
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(rot)
        ctx.beginPath()
        ctx.moveTo(-s * 1.9, 0)
        ctx.lineTo(0, -s * 0.34)
        ctx.lineTo(s * 2.1, 0)
        ctx.lineTo(0, s * 0.34)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
        break

      case 'streak':
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(rot)
        ctx.beginPath()
        // Tapered comet: blunt at the head, drawn out behind.
        ctx.moveTo(s * 1.2, 0)
        ctx.quadraticCurveTo(0, -s * 0.55, -s * 4, 0)
        ctx.quadraticCurveTo(0, s * 0.55, s * 1.2, 0)
        ctx.fill()
        ctx.restore()
        break

      case 'droplet':
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(rot)
        ctx.beginPath()
        ctx.arc(0, 0, s, Math.PI * 0.5, Math.PI * 1.5)
        ctx.quadraticCurveTo(-s * 1.7, -s * 0.34, -s * 2.4, 0)
        ctx.quadraticCurveTo(-s * 1.7, s * 0.34, 0, s)
        ctx.closePath()
        ctx.fill()
        if (p.rim) {
          ctx.globalCompositeOperation = 'source-over'
          ctx.fillStyle = p.rim
          ctx.beginPath()
          ctx.ellipse(s * 0.15, -s * 0.3, s * 0.34, s * 0.22, -0.5, 0, TAU)
          ctx.fill()
          ctx.fillStyle = color
        }
        ctx.restore()
        break

      case 'ring':
      case 'shock': {
        ctx.save()
        ctx.strokeStyle = color
        // The line thins as the wave expands — a ring of constant weight reads
        // as a hoop, not as energy leaving the impact.
        ctx.lineWidth = Math.max(0.22, s * 0.1 * (1 - u * 0.8))
        ctx.beginPath()
        // A shock is a wave running along the floor, so it is squashed hard;
        // a ring is airborne and stays circular.
        ctx.ellipse(x, y, s, p.shape === 'shock' ? s * 0.3 : s, 0, 0, TAU)
        ctx.stroke()
        ctx.restore()
        break
      }

      case 'bubble': {
        ctx.save()
        ctx.strokeStyle = color
        ctx.lineWidth = Math.max(0.25, s * 0.16)
        ctx.beginPath()
        ctx.arc(x, y, s, 0, TAU)
        ctx.stroke()
        ctx.globalAlpha *= 0.5
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(x - s * 0.34, y - s * 0.34, s * 0.26, 0, TAU)
        ctx.fill()
        ctx.restore()
        break
      }

      case 'shard': {
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(rot)
        // A chip of masonry: irregular, seeded per particle so no two match.
        const w = s * (0.55 + p.seed * 0.5)
        ctx.beginPath()
        ctx.moveTo(0, -s)
        ctx.lineTo(w, -s * 0.15)
        ctx.lineTo(w * 0.55, s * 0.9)
        ctx.lineTo(-w * 0.75, s * 0.6)
        ctx.lineTo(-w * 0.6, -s * 0.4)
        ctx.closePath()
        ctx.fill()
        if (p.shade > 0) {
          ctx.fillStyle = this.shadeOf(color)
          ctx.globalAlpha *= p.shade
          ctx.beginPath()
          ctx.moveTo(w, -s * 0.15)
          ctx.lineTo(w * 0.55, s * 0.9)
          ctx.lineTo(-w * 0.75, s * 0.6)
          ctx.closePath()
          ctx.fill()
        }
        ctx.restore()
        break
      }

      case 'petal': {
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(rot)
        // The sway also turns the petal edge-on, so it flutters rather than slides.
        const flat = 0.5 + 0.5 * Math.abs(Math.cos((p.t + p.seed * 6) * p.swayFreq))
        ctx.scale(1, flat)
        ctx.beginPath()
        ctx.moveTo(-s, 0)
        ctx.quadraticCurveTo(-s * 0.2, -s * 0.95, s, -s * 0.16)
        ctx.quadraticCurveTo(s * 0.2, s * 0.5, -s, 0)
        ctx.closePath()
        ctx.fill()
        if (p.ink) {
          ctx.strokeStyle = p.ink
          ctx.lineWidth = Math.max(0.16, s * 0.12)
          ctx.stroke()
        }
        ctx.restore()
        break
      }

      case 'star': {
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(rot)
        // A four-point anime sparkle: long axes, needle-thin waist.
        ctx.beginPath()
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU
          const r = i % 2 === 0 ? s * (i % 4 === 0 ? 1 : 0.72) : s * 0.16
          const fx = Math.cos(a) * r
          const fy = Math.sin(a) * r
          if (i === 0) ctx.moveTo(fx, fy)
          else ctx.lineTo(fx, fy)
        }
        ctx.closePath()
        ctx.fill()
        ctx.restore()
        break
      }

      case 'glow': {
        const g = this.glowTexture(color)
        ctx.drawImage(g, x - s, y - s, s * 2, s * 2)
        break
      }

      case 'sprite': {
        if (!p.sprites || p.sprites.length === 0) break
        const f = p.sprites[Math.min(p.sprites.length - 1, Math.floor(u * p.sprites.length))]
        const k = s / Math.max(0.001, p.size)
        const w = f.w * k
        const h = f.h * k
        ctx.save()
        ctx.translate(x, y)
        if (rot !== 0) ctx.rotate(rot)
        ctx.drawImage(f.image, f.sx, f.sy, f.sw, f.sh, -w / 2, -h / 2, w, h)
        ctx.restore()
        break
      }
    }
  }

  /**
   * The workhorse: a lobed cloud with a flat fill, one hard terminator, a rim
   * on the key side and an ink contour — the same recipe the character art
   * uses, so dust belongs to the same world as the people kicking it up.
   *
   * The outline is ONE subpath (overlapping arc spans, never closed between
   * lobes) because a union of closed circles cannot be stroked: every interior
   * arc would show and the puff would read as a scribble.
   */
  private drawPuff(
    ctx: CanvasRenderingContext2D,
    p: Particle,
    color: string,
    s: number,
  ): void {
    const path = cloudPath(p.x, p.y, s, p.seed)
    ctx.fill(path)

    if (p.shade > 0) {
      ctx.save()
      ctx.clip(path)
      ctx.globalAlpha *= p.shade
      ctx.fillStyle = this.shadeOf(color)
      // A circle pushed down-sun: where its edge crosses the cloud you get the
      // hard terminator, curved the way a ball of vapour actually turns away.
      ctx.beginPath()
      ctx.arc(p.x - LIGHT_X * s * 1.05, p.y - LIGHT_Y * s * 1.05, s * 1.45, 0, TAU)
      ctx.fill()
      ctx.restore()
    }

    if (p.rim && s > 2) {
      ctx.save()
      ctx.clip(path)
      // Clip again to the lit half-plane so the rim only lights the sun side.
      ctx.beginPath()
      const nx = -LIGHT_Y
      const ny = LIGHT_X
      const R = s * 4
      const ox = p.x + LIGHT_X * s * 0.34
      const oy = p.y + LIGHT_Y * s * 0.34
      ctx.moveTo(ox + nx * R, oy + ny * R)
      ctx.lineTo(ox - nx * R, oy - ny * R)
      ctx.lineTo(ox - nx * R + LIGHT_X * R, oy - ny * R + LIGHT_Y * R)
      ctx.lineTo(ox + nx * R + LIGHT_X * R, oy + ny * R + LIGHT_Y * R)
      ctx.closePath()
      ctx.clip()
      ctx.strokeStyle = p.rim
      // Half the stroke is clipped away, so this reads as a thin inner rim.
      ctx.lineWidth = Math.max(0.4, s * 0.34)
      ctx.stroke(path)
      ctx.restore()
    }

    if (p.ink) {
      ctx.strokeStyle = p.ink
      ctx.lineWidth = Math.max(0.22, s * 0.1)
      ctx.stroke(path)
    }
  }
}

/**
 * A cartoon cloud outline as a single subpath: each lobe contributes an arc
 * span wide enough to overlap its neighbours, and canvas joins consecutive
 * arcs with a short line that the overlap hides.
 */
function cloudPath(cx: number, cy: number, s: number, seed: number): Path2D {
  const path = new Path2D()
  const lobes = 5
  const base = seed * TAU
  // Each arc spans a little more than its share of the circle so neighbours
  // overlap; any wider and the arc curls back inside the cloud and the ink
  // line crosses the fill.
  const half = Math.PI / lobes + 0.5
  for (let i = 0; i < lobes; i++) {
    const a = base + (i / lobes) * TAU
    const r = s * (0.44 + fract(seed * 91.7 + i * 13.3) * 0.2)
    const d = s * (0.56 + fract(seed * 47.1 + i * 7.7) * 0.18)
    path.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.86, r, a - half, a + half)
  }
  path.closePath()
  return path
}

const fract = (v: number) => v - Math.floor(v)

/** `rgba()` needs a hex; pass anything else through untouched. */
function hexish(c: string): string {
  return c.charCodeAt(0) === 35 ? c : PAL.white
}

/** Turn an animation into particle frames — `spritesFrom(art().effects.poof, 'idle')`. */
export function spritesFrom(sheet: SpriteSheet, anim: string): ParticleSprite[] {
  const a = sheet.anims[anim]
  if (!a) return []
  return a.frames.map((f) => ({
    image: sheet.image,
    sx: f.sx, sy: f.sy, sw: f.sw, sh: f.sh,
    w: f.w, h: f.h,
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Emitters
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tuning knobs every emitter understands. Everything is optional: an emitter
 * called with nothing must already look right, because that is how gameplay
 * code will call it 90% of the time.
 */
export interface EmitterOpts {
  /** Multiplies the particle count. */
  count?: number
  /** Multiplies sizes and speeds — a bigger character kicks up more dust. */
  scale?: number
  /** 0..1 intensity: fall speed, charge level, boss phase. Default 1. */
  power?: number
  /** Which way the character faces, for trailing dust and wall slides. */
  facing?: 1 | -1
  /** Direction hint for cones — a unit vector, not normalised for you. */
  dirX?: number
  dirY?: number
  /** Overrides the emitter's own palette pick. */
  color?: string
  colorEnd?: string
  /** Force the layer. Emitters that must sit behind the actor ignore this. */
  behind?: boolean
  /** Attractor for the flying kinds. `target` names one set with setAttractor(). */
  attract?: ParticleAttract
  target?: string
  arriveTag?: string
}

/** Shared jitter source. Visual only — never feed gameplay from this. */
const erng = new Rng(0x51ade)

const O = (o: EmitterOpts | undefined) => o ?? {}
const N = (o: EmitterOpts | undefined, base: number) => Math.max(1, Math.round(base * (O(o).count ?? 1)))
const S = (o: EmitterOpts | undefined) => O(o).scale ?? 1
const P = (o: EmitterOpts | undefined) => clamp01(O(o).power ?? 1)

// Dust reads as light bounced off the ground: warm cream falling to cool grey.
const DUST = mix(PAL.cream, PAL.mist, 0.28)
const DUST_END = mix(PAL.mist, PAL.slate, 0.35)
const DUST_INK = rgba(PAL.inkSoft, 0.45)
const SAND_DUST = mix(PAL.sand, PAL.cream, 0.3)
const SMOKE = mix(PAL.mist, PAL.slate, 0.5)
const FOAM_END = mix(PAL.foam, PAL.seaLight, 0.55)

/**
 * The emitter library.
 *
 * Every entry takes the system, a WORLD position and options. Positions are
 * given as the natural anchor for the effect: feet for ground dust, centre of
 * mass for impacts, the contact point for splashes.
 */
export const EMITTERS: Record<
  string,
  (p: ParticleSystem, x: number, y: number, opts?: EmitterOpts) => void
> = {
  /** Feet. Two lateral lobes plus grit — the harder the fall, the wider. */
  'landing-dust': (ps, x, y, o) => {
    const s = S(o)
    const pw = P(o)
    const color = O(o).color ?? DUST
    for (const side of [-1, 1] as const) {
      // A skirt, not a ball: the cone is nearly horizontal and the spawn
      // radius smears it along the ground so the mass flares outward.
      ps.burst(N(o, 4 + pw * 4), x + side * 3 * s, y - 1.5, {
        speed: (40 + pw * 78) * s, speedVar: 26 * s,
        angle: side > 0 ? -0.34 : Math.PI + 0.34, spread: 0.7,
        spawnRadius: (5 + pw * 6) * s,
        life: 0.4 + pw * 0.26, lifeVar: 0.14,
        size: 2.6 * s, sizeEnd: (7 + pw * 4) * s, sizeVar: 1.1 * s,
        color, colorEnd: O(o).colorEnd ?? DUST_END,
        shape: 'puff', shade: 0.55, ink: DUST_INK, rim: PAL.cream,
        gravity: -10, drag: 0.13, fadeAt: 0.34, alpha: 0.92,
      })
    }
    // A low haze behind the actor gives the burst a body to sit in.
    ps.burst(N(o, 2), x, y - 2, {
      speed: 22 * s, speedVar: 14 * s, angle: -Math.PI / 2, spread: Math.PI,
      life: 0.55, lifeVar: 0.1, size: 6 * s, sizeEnd: (16 + pw * 8) * s,
      color, colorEnd: DUST_END, shape: 'puff', shade: 0.4, rim: PAL.cream,
      gravity: -8, drag: 0.14, fadeAt: 0.2, alpha: 0.34, behind: true,
    })
    ps.burst(N(o, 2 + pw * 4), x, y - 1, {
      speed: (60 + pw * 90) * s, speedVar: 40 * s, angle: -Math.PI / 2, spread: Math.PI * 0.8,
      life: 0.4, lifeVar: 0.14, size: 0.75 * s, sizeEnd: 0.5 * s,
      color: mix(color, PAL.dirt, 0.4), colorEnd: DUST_END,
      shape: 'shard', shade: 0.6, gravity: 520, drag: 0.02, spin: 8,
      collide: true, bounce: 0.25, fadeAt: 0.7,
    })
    if (pw > 0.55) {
      ps.emit({
        x, y: y - 0.5, vx: 0, vy: 0, life: 0.28,
        size: 5 * s, sizeEnd: (17 + pw * 9) * s,
        color: PAL.cream, colorEnd: rgba(PAL.mist, 0),
        shape: 'shock', alpha: 0.5 * pw, fadeAt: 0.1,
      })
    }
  },

  /** Feet, while running. One scuff per few frames, trailing behind. */
  'run-dust': (ps, x, y, o) => {
    const s = S(o)
    const f = O(o).facing ?? 1
    ps.emit({
      x: x - f * 6 * s + erng.range(-1.5, 1.5), y: y - 1.5,
      vx: -f * erng.range(20, 46) * s, vy: -erng.range(10, 26) * s,
      life: 0.4, size: 2.4 * s, sizeEnd: 7.5 * s,
      color: O(o).color ?? DUST, colorEnd: O(o).colorEnd ?? DUST_END,
      shape: 'puff', shade: 0.5, ink: DUST_INK, rim: PAL.cream,
      gravity: -8, drag: 0.1, fadeAt: 0.3, alpha: 0.8, behind: O(o).behind ?? true,
    })
  },

  /** Feet, on take-off. A downward crescent of displaced air. */
  'jump-puff': (ps, x, y, o) => {
    const s = S(o)
    const pw = P(o)
    ps.burst(N(o, 4 + pw * 4), x, y - 1, {
      speed: (40 + pw * 66) * s, speedVar: 24 * s, angle: Math.PI / 2, spread: Math.PI * 1.35,
      spawnRadius: 4 * s,
      life: 0.34, lifeVar: 0.09, size: 2.4 * s, sizeEnd: 7 * s, sizeVar: 0.8,
      color: O(o).color ?? PAL.cream, colorEnd: O(o).colorEnd ?? DUST_END,
      shape: 'puff', shade: 0.45, ink: DUST_INK, rim: PAL.white,
      drag: 0.13, fadeAt: 0.3, alpha: 0.85,
    })
    ps.emit({
      x, y: y - 0.5, vx: 0, vy: 0, life: 0.24,
      size: 4 * s, sizeEnd: 13 * s, color: PAL.white, colorEnd: rgba(PAL.mist, 0),
      shape: 'shock', alpha: 0.45, fadeAt: 0.1,
    })
  },

  /** Contact point of a stomp: a flat shock ring, sparks and a bright core. */
  'stomp-burst': (ps, x, y, o) => {
    const s = S(o)
    const pw = P(o)
    ps.emit({
      x, y, vx: 0, vy: 0, life: 0.26, size: 3 * s, sizeEnd: (18 + pw * 8) * s,
      color: PAL.white, colorEnd: rgba(PAL.strawGold, 0), shape: 'shock',
      additive: true, alpha: 0.9, fadeAt: 0.15,
    })
    ps.emit({
      x, y, vx: 0, vy: 0, life: 0.18, size: 7 * s, sizeEnd: 12 * s,
      color: O(o).color ?? PAL.strawGold, shape: 'glow', additive: true,
      alpha: 0.75, fadeAt: 0.02,
    })
    ps.burst(N(o, 10), x, y, {
      speed: 140 * s, speedVar: 70 * s, angle: -Math.PI / 2, spread: Math.PI * 1.5,
      life: 0.22, lifeVar: 0.07, size: 0.9 * s, sizeEnd: 0.2,
      color: O(o).color ?? PAL.strawGold, colorEnd: PAL.cream,
      shape: 'spark', additive: true, aim: true, trail: 3, gravity: 240, drag: 0.08,
    })
    ps.burst(N(o, 5), x, y - 1, {
      speed: 70 * s, speedVar: 34 * s, angle: -Math.PI / 2, spread: Math.PI,
      life: 0.36, size: 2.2 * s, sizeEnd: 5.5 * s,
      color: DUST, colorEnd: DUST_END, shape: 'puff',
      shade: 0.5, ink: DUST_INK, rim: PAL.cream, drag: 0.12, fadeAt: 0.3,
    })
  },

  /** Centre of a berry / coin. A four-point sparkle with a soft halo. */
  'coin-sparkle': (ps, x, y, o) => {
    const s = S(o)
    // The stars are opaque, not additive: an additive gold star over a bright
    // sky clips straight to white and loses its shape. The halo does the
    // glowing, the star keeps the colour.
    ps.burst(N(o, 6), x, y, {
      speed: 52 * s, speedVar: 28 * s, spread: TAU,
      life: 0.5, lifeVar: 0.14, size: 3.6 * s, sizeEnd: 0.3,
      color: O(o).color ?? PAL.gold, colorEnd: O(o).colorEnd ?? PAL.strawDeep,
      shape: 'star', spin: 5, drag: 0.07, glow: 0.55, trail: 3,
      spawnRadius: 4 * s, fadeAt: 0.45,
    })
    ps.emit({
      x, y, vx: 0, vy: -18, life: 0.3, size: 3.4 * s, sizeEnd: 6 * s,
      color: O(o).color ?? PAL.gold, shape: 'glow', additive: true, alpha: 0.6, fadeAt: 0.05,
    })
  },

  /** Where a defeated enemy stood. Big soft cloud, bright flash inside. */
  'enemy-poof': (ps, x, y, o) => {
    const s = S(o)
    const color = O(o).color ?? PAL.cream
    ps.emit({
      x, y, vx: 0, vy: 0, life: 0.2, size: 10 * s, sizeEnd: 16 * s,
      color: PAL.white, shape: 'glow', additive: true, alpha: 0.8, fadeAt: 0.02,
    })
    ps.burst(N(o, 9), x, y, {
      speed: 66 * s, speedVar: 34 * s, spread: TAU, spawnRadius: 3 * s,
      life: 0.5, lifeVar: 0.16, size: 3.4 * s, sizeEnd: 7.5 * s, sizeVar: 1,
      color, colorEnd: O(o).colorEnd ?? DUST_END,
      shape: 'puff', shade: 0.5, ink: DUST_INK, rim: PAL.white,
      gravity: -26, drag: 0.1, fadeAt: 0.4, alpha: 0.95,
    })
    ps.burst(N(o, 7), x, y, {
      speed: 130 * s, speedVar: 60 * s, spread: TAU,
      life: 0.34, lifeVar: 0.1, size: 1 * s, sizeEnd: 0.2,
      color: PAL.cream, colorEnd: PAL.strawGold, shape: 'spark',
      additive: true, aim: true, trail: 3, drag: 0.06,
    })
  },

  /** Water line. A crown of droplets, a foam ring and a lingering mist. */
  'water-splash': (ps, x, y, o) => {
    const s = S(o)
    const pw = P(o)
    const color = O(o).color ?? PAL.foam
    ps.burst(N(o, 6 + pw * 8), x, y, {
      speed: (86 + pw * 96) * s, speedVar: 44 * s, angle: -Math.PI / 2, spread: Math.PI * 0.7,
      life: 0.42, lifeVar: 0.12, size: 2.2 * s, sizeEnd: 1.5 * s, sizeVar: 0.6,
      color, colorEnd: O(o).colorEnd ?? FOAM_END,
      shape: 'droplet', aim: true, rim: PAL.white, gravity: 640, drag: 0.01, fadeAt: 0.72,
    })
    ps.burst(N(o, 4), x, y - 1, {
      speed: 44 * s, speedVar: 24 * s, angle: -Math.PI / 2, spread: Math.PI * 1.2,
      life: 0.5, size: 2.6 * s, sizeEnd: 6.5 * s,
      color: PAL.foam, colorEnd: rgba(PAL.seaLight, 0.9),
      shape: 'puff', shade: 0.4, rim: PAL.white, ink: rgba(PAL.sea, 0.35),
      gravity: -20, drag: 0.12, fadeAt: 0.35, alpha: 0.85,
    })
    ps.emit({
      x, y, vx: 0, vy: 0, life: 0.4, size: 4 * s, sizeEnd: (20 + pw * 10) * s,
      color: PAL.foam, colorEnd: rgba(PAL.seaLight, 0), shape: 'shock', alpha: 0.75, fadeAt: 0.2,
    })
  },

  /** Point of contact on the wall. Scuffs peel off along the surface. */
  'wall-slide': (ps, x, y, o) => {
    const s = S(o)
    const f = O(o).facing ?? 1
    ps.emit({
      x: x + f * 1.5, y: y + erng.range(-3, 3),
      vx: f * erng.range(8, 26) * s, vy: -erng.range(26, 54) * s,
      life: 0.42, size: 2.4 * s, sizeEnd: 6.5 * s,
      color: O(o).color ?? DUST, colorEnd: O(o).colorEnd ?? DUST_END,
      shape: 'puff', shade: 0.5, ink: DUST_INK, rim: PAL.cream,
      drag: 0.1, fadeAt: 0.3, alpha: 0.8,
    })
    if (erng.bool(0.3)) {
      ps.emit({
        x: x + f * 1.5, y, vx: f * erng.range(20, 50), vy: erng.range(20, 70),
        life: 0.24, size: 0.9 * s, sizeEnd: 0.2,
        color: PAL.strawGold, colorEnd: PAL.cream, shape: 'spark',
        additive: true, aim: true, trail: 3, gravity: 200,
      })
    }
  },

  /** Anywhere on the body. Rising additive vapour, always behind the actor. */
  'gear-steam': (ps, x, y, o) => {
    const s = S(o)
    ps.emit({
      x: x + erng.range(-4, 4) * s, y: y + erng.range(-6, 6) * s,
      vx: erng.range(-16, 16), vy: -erng.range(46, 96),
      life: 0.7, size: 2.2 * s, sizeEnd: 9 * s,
      color: O(o).color ?? mix(PAL.cream, PAL.ember, 0.35),
      colorEnd: O(o).colorEnd ?? rgba(PAL.bloodOrange, 0),
      shape: 'puff', additive: true, drag: 0.05, fadeIn: 0.18, fadeAt: 0.22,
      alpha: 0.38, behind: O(o).behind ?? true, glow: 0.35, sway: 7, swayFreq: 2.4,
    })
  },

  /** Centre of the boss. Four layers so it reads as one event, not confetti. */
  'boss-explosion': (ps, x, y, o) => {
    const s = S(o)
    ps.emit({
      x, y, vx: 0, vy: 0, life: 0.3, size: 22 * s, sizeEnd: 44 * s,
      color: PAL.white, shape: 'glow', additive: true, alpha: 0.95, fadeAt: 0.05,
    })
    ps.emit({
      x, y, vx: 0, vy: 0, life: 0.55, size: 6 * s, sizeEnd: 78 * s,
      color: PAL.cream, colorEnd: rgba(PAL.bloodOrange, 0), shape: 'ring',
      additive: true, alpha: 0.9, fadeAt: 0.25,
    })
    ps.burst(N(o, 16), x, y, {
      speed: 110 * s, speedVar: 70 * s, spread: TAU, spawnRadius: 6 * s,
      life: 0.85, lifeVar: 0.3, size: 4.5 * s, sizeEnd: 11 * s, sizeVar: 2,
      color: mix(PAL.ember, PAL.cream, 0.3), colorEnd: SMOKE,
      shape: 'puff', shade: 0.6, ink: rgba(PAL.ink, 0.4), rim: PAL.cream,
      gravity: -34, drag: 0.08, fadeAt: 0.45, glow: 0.4,
    })
    ps.burst(N(o, 16), x, y, {
      speed: 190 * s, speedVar: 110 * s, spread: TAU,
      life: 0.42, lifeVar: 0.18, size: 1.1 * s, sizeEnd: 0.25,
      color: mix(PAL.cream, PAL.ember, 0.4), colorEnd: PAL.bloodOrange, shape: 'spark',
      additive: true, aim: true, trail: 4, gravity: 320, drag: 0.06, fadeAt: 0.4,
    })
    ps.burst(N(o, 10), x, y, {
      speed: 190 * s, speedVar: 90 * s, spread: TAU,
      life: 1.1, lifeVar: 0.3, size: 1.6 * s, sizeEnd: 1.3 * s,
      color: PAL.steel, colorEnd: PAL.slate, shape: 'shard',
      shade: 0.65, gravity: 620, drag: 0.01, spin: 12, collide: true, bounce: 0.3,
      fadeAt: 0.8,
    })
  },

  /** Centre of the broken tile. Chips that bounce off the floor below. */
  'brick-debris': (ps, x, y, o) => {
    const s = S(o)
    const color = O(o).color ?? PAL.woodLight
    ps.burst(N(o, 12), x, y, {
      speed: 150 * s, speedVar: 80 * s, angle: -Math.PI / 2, spread: Math.PI * 1.7,
      life: 0.9, lifeVar: 0.3, size: 2 * s, sizeEnd: 1.7 * s, sizeVar: 0.7,
      color, colorEnd: O(o).colorEnd ?? PAL.woodDeep, shape: 'shard',
      shade: 0.6, gravity: 640, drag: 0.01, spin: 11,
      collide: true, bounce: 0.32, friction: 0.6, fadeAt: 0.75,
    })
    ps.burst(N(o, 5), x, y, {
      speed: 60 * s, speedVar: 30 * s, spread: TAU,
      life: 0.45, size: 2.4 * s, sizeEnd: 6 * s,
      color: mix(color, PAL.cream, 0.4), colorEnd: DUST_END,
      shape: 'puff', shade: 0.5, ink: DUST_INK, rim: PAL.cream,
      gravity: -20, drag: 0.1, fadeAt: 0.35,
    })
  },

  /** Anywhere above the play field. Ambient; call a few per second. */
  'blossom-drift': (ps, x, y, o) => {
    const s = S(o)
    ps.emit({
      x, y, vx: erng.range(-16, -4), vy: erng.range(10, 22),
      life: 5.5, size: erng.range(2.2, 3.2) * s, sizeEnd: erng.range(2.2, 3.2) * s,
      color: O(o).color ?? mix(PAL.chopperPink, PAL.cream, 0.35),
      colorEnd: O(o).colorEnd ?? mix(PAL.chopperPink, PAL.cream, 0.62),
      shape: 'petal', ink: rgba(PAL.luffyRedDeep, 0.22), rotation: erng.range(0, TAU),
      spin: erng.range(-1.4, 1.4), sway: 16, swayFreq: erng.range(1.4, 2.4),
      fadeIn: 0.06, fadeAt: 0.8, behind: O(o).behind ?? false, alpha: 0.95,
    })
  },

  /** A fire, a torch, a volcano vent. Rises, cools, curls out. */
  'ember-rise': (ps, x, y, o) => {
    const s = S(o)
    ps.emit({
      x: x + erng.range(-3, 3) * s, y,
      vx: erng.range(-12, 12), vy: -erng.range(26, 62),
      life: erng.range(0.9, 1.6), size: 1 * s, sizeEnd: 0.3 * s,
      color: O(o).color ?? PAL.ember, colorEnd: O(o).colorEnd ?? PAL.bloodOrange,
      shape: 'circle', additive: true, glow: 2.4, trail: 4,
      gravity: -22, drag: 0.02, sway: 11, swayFreq: erng.range(1.6, 3),
      fadeIn: 0.1, fadeAt: 0.45,
    })
  },

  /** Underwater. Wobbles up, always behind the swimmer. */
  'bubble-rise': (ps, x, y, o) => {
    const s = S(o)
    ps.emit({
      x: x + erng.range(-3, 3) * s, y,
      vx: 0, vy: -erng.range(24, 46),
      life: erng.range(1.1, 1.9), size: erng.range(0.8, 2.1) * s, sizeEnd: erng.range(1, 2.4) * s,
      color: O(o).color ?? PAL.foam, colorEnd: O(o).colorEnd ?? PAL.seaLight,
      shape: 'bubble', sway: 9, swayFreq: erng.range(2, 3.4),
      fadeIn: 0.1, fadeAt: 0.72, alpha: 0.85, behind: O(o).behind ?? true,
    })
  },

  /** Desert wind. Long low streaks with a haze behind them. */
  'sand-gust': (ps, x, y, o) => {
    const s = S(o)
    const f = O(o).facing ?? -1
    ps.emit({
      x, y: y + erng.range(-6, 6) * s,
      vx: f * erng.range(120, 260) * s, vy: erng.range(-14, 6),
      life: erng.range(0.5, 0.9), size: erng.range(1.3, 2.4) * s, sizeEnd: 0.5 * s,
      color: O(o).color ?? SAND_DUST, colorEnd: O(o).colorEnd ?? PAL.sandDeep,
      shape: 'streak', aim: true, drag: 0.02, fadeIn: 0.15, fadeAt: 0.5, alpha: 0.55,
      behind: O(o).behind ?? false,
    })
    if (erng.bool(0.18)) {
      ps.emit({
        x, y: y + erng.range(-10, 10) * s,
        vx: f * erng.range(110, 210) * s, vy: -erng.range(2, 14),
        life: 0.8, size: 4 * s, sizeEnd: 11 * s,
        color: SAND_DUST, colorEnd: rgba(PAL.sandDeep, 0),
        shape: 'puff', shade: 0.3, rim: PAL.cream, drag: 0.03,
        fadeIn: 0.2, fadeAt: 0.4, alpha: 0.4, behind: true,
      })
    }
  },

  /** Thriller Bark. A cold soft light that swells and dies. */
  'ghost-wisp': (ps, x, y, o) => {
    const s = S(o)
    ps.emit({
      x, y, vx: erng.range(-10, 10), vy: -erng.range(4, 16),
      life: erng.range(1.4, 2.4), size: 3 * s, sizeEnd: 7 * s,
      color: O(o).color ?? PAL.magic, colorEnd: O(o).colorEnd ?? PAL.poison,
      shape: 'glow', additive: true, sway: 14, swayFreq: erng.range(0.8, 1.6),
      fadeIn: 0.3, fadeAt: 0.5, alpha: 0.55, behind: O(o).behind ?? true,
    })
  },

  /** Electric contact. Very short, very fast, forked by the trail. */
  'lightning-spark': (ps, x, y, o) => {
    const s = S(o)
    ps.burst(N(o, 7), x, y, {
      speed: 300 * s, speedVar: 180 * s, spread: TAU,
      life: 0.2, lifeVar: 0.08, size: 1.2 * s, sizeEnd: 0.2,
      color: O(o).color ?? PAL.white, colorEnd: O(o).colorEnd ?? PAL.magic,
      shape: 'spark', additive: true, aim: true, trail: 6, drag: 0.16, fadeAt: 0.5,
      // A fast, wide sway makes the recorded trail zig-zag: the fork comes out
      // of the motion itself rather than from a hand-drawn bolt.
      sway: 190 * s, swayFreq: 46,
    })
    ps.emit({
      x, y, vx: 0, vy: 0, life: 0.14, size: 8 * s, sizeEnd: 3 * s,
      color: PAL.magic, shape: 'glow', additive: true, alpha: 0.85, fadeAt: 0.1,
    })
  },

  /**
   * Collected pickups flying to the HUD counter.
   * Pass `target` (a name previously given to `setAttractor`) or an explicit
   * `attract`, and poll `takeArrivals(arriveTag)` to pop the counter.
   */
  'berry-collect': (ps, x, y, o) => {
    const s = S(o)
    const attract: ParticleAttract = O(o).attract ?? {
      x, y: y - 40, accel: 900, maxSpeed: 460, arrive: 5, home: 0.9, target: O(o).target,
    }
    ps.burst(N(o, 5), x, y, {
      speed: 90 * s, speedVar: 40 * s, spread: TAU,
      life: 1.2, size: 2.6 * s, sizeEnd: 1.4 * s,
      color: O(o).color ?? PAL.gold, colorEnd: O(o).colorEnd ?? PAL.strawGold,
      shape: 'star', glow: 0.8, trail: 6, spin: 9,
      drag: 0.04, fadeAt: 0.85, attract, arriveTag: O(o).arriveTag ?? 'berry',
    })
  },

  /** Behind a dashing actor. Reads as speed lines, not as dust. */
  'dash-streak': (ps, x, y, o) => {
    const s = S(o)
    const f = O(o).facing ?? 1
    for (let i = 0; i < N(o, 3); i++) {
      ps.emit({
        x: x - f * erng.range(0, 6) * s, y: y + erng.range(-12, 6) * s,
        vx: -f * erng.range(90, 190) * s, vy: erng.range(-8, 8),
        life: 0.26, size: erng.range(0.9, 1.9) * s, sizeEnd: 0.3,
        color: O(o).color ?? PAL.cream, colorEnd: O(o).colorEnd ?? rgba(PAL.mist, 0),
        shape: 'streak', aim: true, additive: true, drag: 0.05,
        fadeIn: 0.1, fadeAt: 0.3, alpha: 0.6, behind: O(o).behind ?? true,
      })
    }
  },

  /** Sword hit, punch, parry. A hard little star and a ring, no dust. */
  'impact-star': (ps, x, y, o) => {
    const s = S(o)
    ps.emit({
      x, y, vx: 0, vy: 0, life: 0.2, size: 5 * s, sizeEnd: 11 * s,
      color: O(o).color ?? PAL.white, shape: 'star', additive: true,
      rotation: erng.range(0, TAU), spin: 3, alpha: 0.95, fadeAt: 0.1, glow: 1.4,
    })
    ps.emit({
      x, y, vx: 0, vy: 0, life: 0.24, size: 3 * s, sizeEnd: 15 * s,
      color: PAL.cream, colorEnd: rgba(PAL.strawGold, 0), shape: 'ring',
      additive: true, alpha: 0.7, fadeAt: 0.1,
    })
    ps.burst(N(o, 6), x, y, {
      speed: 190 * s, speedVar: 90 * s, spread: TAU,
      life: 0.22, size: 1 * s, sizeEnd: 0.2,
      color: PAL.white, colorEnd: PAL.strawGold, shape: 'spark',
      additive: true, aim: true, trail: 3, drag: 0.1,
    })
  },

  /** Healing, 1UP, checkpoint. Rises and converges slightly. */
  'heal-sparkle': (ps, x, y, o) => {
    const s = S(o)
    ps.burst(N(o, 8), x, y, {
      speed: 30 * s, speedVar: 18 * s, angle: -Math.PI / 2, spread: Math.PI * 0.5,
      spawnRadius: 7 * s,
      life: 0.9, lifeVar: 0.25, size: 1.5 * s, sizeEnd: 0.3,
      color: O(o).color ?? PAL.heal, colorEnd: O(o).colorEnd ?? PAL.cream,
      shape: 'star', additive: true, glow: 1.8, trail: 4, spin: 5,
      gravity: -40, drag: 0.02, sway: 8, swayFreq: 2.2, fadeIn: 0.1, fadeAt: 0.5,
    })
  },

  /** Muzzle of a cannon or a slingshot. A cone of smoke with sparks in it. */
  'cannon-smoke': (ps, x, y, o) => {
    const s = S(o)
    const dx = O(o).dirX ?? (O(o).facing ?? 1)
    const dy = O(o).dirY ?? 0
    const a = Math.atan2(dy, dx)
    ps.burst(N(o, 7), x, y, {
      speed: 120 * s, speedVar: 60 * s, angle: a, spread: 0.9,
      life: 0.6, lifeVar: 0.2, size: 2.6 * s, sizeEnd: 8 * s, sizeVar: 0.8,
      color: O(o).color ?? mix(PAL.cream, PAL.steel, 0.35), colorEnd: O(o).colorEnd ?? SMOKE,
      shape: 'puff', shade: 0.55, ink: DUST_INK, rim: PAL.cream,
      gravity: -18, drag: 0.09, fadeAt: 0.4, alpha: 0.9,
    })
    ps.burst(N(o, 6), x, y, {
      speed: 240 * s, speedVar: 120 * s, angle: a, spread: 0.55,
      life: 0.28, size: 1.2 * s, sizeEnd: 0.2,
      color: PAL.cream, colorEnd: PAL.ember, shape: 'spark',
      additive: true, aim: true, trail: 4, gravity: 180, drag: 0.05,
    })
  },
}

/** Every emitter name, for tooling and the debug menu. */
export const EMITTER_NAMES = Object.keys(EMITTERS)
