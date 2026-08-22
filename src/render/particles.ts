import type { RenderContext } from '../types'
import { Rng } from '../engine/rng'
import { clamp01 } from '../engine/math'

export type ParticleShape = 'pixel' | 'circle' | 'spark' | 'ring' | 'shard' | 'smoke' | 'star'

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
}

interface Particle extends Required<ParticleDef> {
  t: number
  alive: boolean
}

const MAX = 1400

/**
 * A pooled particle system. Everything is drawn in two passes (behind and in
 * front of entities) and additive particles are batched to keep the number of
 * canvas state changes low.
 */
export class ParticleSystem {
  private pool: Particle[] = []
  private cursor = 0
  private rng = new Rng(0xbeef)

  constructor() {
    for (let i = 0; i < MAX; i++) {
      this.pool.push({
        x: 0, y: 0, vx: 0, vy: 0, life: 0, size: 1, sizeEnd: 1,
        color: '#fff', colorEnd: '#fff', shape: 'pixel', gravity: 0, drag: 0,
        additive: false, rotation: 0, spin: 0, behind: false, fadeAt: 0.6,
        t: 0, alive: false,
      })
    }
  }

  get count(): number {
    let n = 0
    for (const p of this.pool) if (p.alive) n++
    return n
  }

  emit(def: ParticleDef): void {
    // Ring buffer: the oldest particle is recycled when the pool is saturated.
    let p: Particle | null = null
    for (let i = 0; i < MAX; i++) {
      const cand = this.pool[(this.cursor + i) % MAX]
      if (!cand.alive) {
        p = cand
        this.cursor = (this.cursor + i + 1) % MAX
        break
      }
    }
    if (!p) {
      p = this.pool[this.cursor]
      this.cursor = (this.cursor + 1) % MAX
    }
    p.x = def.x
    p.y = def.y
    p.vx = def.vx
    p.vy = def.vy
    p.life = def.life
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
    p.t = 0
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
    },
  ): void {
    const angle = opts.angle ?? -Math.PI / 2
    const spread = opts.spread ?? Math.PI * 2
    for (let i = 0; i < n; i++) {
      const a = angle + this.rng.range(-spread / 2, spread / 2)
      const sp = opts.speed + this.rng.range(-(opts.speedVar ?? 0), opts.speedVar ?? 0)
      const r = opts.spawnRadius ? this.rng.range(0, opts.spawnRadius) : 0
      this.emit({
        ...opts,
        x: x + Math.cos(a) * r,
        y: y + Math.sin(a) * r,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: opts.life + this.rng.range(-(opts.lifeVar ?? 0), opts.lifeVar ?? 0),
      })
    }
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.alive) continue
      p.t += dt
      if (p.t >= p.life) {
        p.alive = false
        continue
      }
      p.vy += p.gravity * dt
      if (p.drag > 0) {
        const d = Math.pow(1 - p.drag, dt * 60)
        p.vx *= d
        p.vy *= d
      }
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rotation += p.spin * dt
    }
  }

  clear(): void {
    for (const p of this.pool) p.alive = false
  }

  /** Draw one pass. `behind` selects the layer. */
  draw(rc: RenderContext, behind: boolean): void {
    const { ctx } = rc
    ctx.save()
    let additive = false
    for (const p of this.pool) {
      if (!p.alive || p.behind !== behind) continue
      const u = p.t / p.life
      if (p.additive !== additive) {
        additive = p.additive
        ctx.globalCompositeOperation = additive ? 'lighter' : 'source-over'
      }
      const alpha = u < p.fadeAt ? 1 : 1 - (u - p.fadeAt) / (1 - p.fadeAt)
      ctx.globalAlpha = clamp01(alpha)
      ctx.fillStyle = u < 0.5 ? p.color : p.colorEnd
      const size = p.size + (p.sizeEnd - p.size) * u
      drawShape(ctx, p.shape, p.x, p.y, size, p.rotation)
    }
    ctx.restore()
  }
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: ParticleShape,
  x: number,
  y: number,
  size: number,
  rot: number,
): void {
  const s = Math.max(0.4, size)
  switch (shape) {
    case 'pixel': {
      const px = Math.round(x)
      const py = Math.round(y)
      const w = Math.max(1, Math.round(s))
      ctx.fillRect(px - w / 2, py - w / 2, w, w)
      break
    }
    case 'circle':
      ctx.beginPath()
      ctx.arc(x, y, s, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'smoke':
      ctx.beginPath()
      ctx.arc(x, y, s, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'spark': {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rot)
      ctx.fillRect(-s * 1.6, -s * 0.25, s * 3.2, s * 0.5)
      ctx.restore()
      break
    }
    case 'ring':
      ctx.save()
      ctx.strokeStyle = ctx.fillStyle
      ctx.lineWidth = Math.max(1, s * 0.22)
      ctx.beginPath()
      ctx.arc(x, y, s, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
      break
    case 'shard': {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rot)
      ctx.beginPath()
      ctx.moveTo(0, -s)
      ctx.lineTo(s * 0.6, 0)
      ctx.lineTo(0, s)
      ctx.lineTo(-s * 0.6, 0)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
      break
    }
    case 'star': {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rot)
      ctx.beginPath()
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        const r = i % 2 === 0 ? s : s * 0.42
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
  }
}
