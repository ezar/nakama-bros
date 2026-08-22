import type { Hit, RenderContext } from '../../types'
import { Entity } from './Entity'
import type { World } from '../world'
import { registerEntity } from './registry'
import { moveBody } from '../../physics/move'
import { PHYS } from '../config'
import { PAL } from '../../art/palette'
import { rectsOverlap, clamp01 } from '../../engine/math'
import type { Player } from './Player'

export interface BossPhase {
  /** Health fraction at or below which this phase begins. */
  at: number
  /** Seconds between attacks. */
  interval: number
  /** Movement speed multiplier. */
  speed: number
}

/**
 * Shared boss scaffolding: a health bar, multi-phase pacing, an invulnerability
 * window after each hit, and a defeat sequence long enough to feel earned.
 * Concrete bosses implement `act`, which runs one beat of their pattern.
 */
export abstract class Boss extends Entity {
  readonly kind = 'boss'
  abstract displayName: string
  maxHealth = 5
  phases: BossPhase[] = [{ at: 1, interval: 2.2, speed: 1 }]
  protected phase = 0
  protected actTimer = 0
  protected defeated = false
  protected defeatTimer = 0
  /** Contact with the body hurts unless the boss is stunned. */
  protected stunned = 0

  constructor(x: number, y: number, w: number, h: number) {
    super(x, y, w, h)
    this.tags.add('boss')
    this.depth = 80
    this.cullable = false
    this.health = this.maxHealth
  }

  /** One beat of the attack pattern. */
  protected abstract act(world: World): void
  /** Continuous movement, run every step. */
  protected abstract move(dt: number, world: World): void

  update(dt: number, world: World): void {
    this.tickAnim(dt)
    if (this.defeated) {
      this.defeatTimer += dt
      this.body.vy = Math.min(this.body.vy + PHYS.gravity * dt, PHYS.maxFall)
      moveBody(this.body, world.map, dt, {})
      if (world.rng.bool(0.35)) {
        world.particles.burst(3, this.x + world.rng.range(-this.body.w / 2, this.body.w / 2),
          this.y - world.rng.range(0, this.body.h), {
            speed: 60, speedVar: 40, life: 0.5, size: 3, sizeEnd: 0.5,
            color: PAL.ember, colorEnd: 'rgba(255,176,58,0)', shape: 'smoke', additive: true, drag: 0.05,
          })
      }
      if (this.defeatTimer > 2) this.dead = true
      return
    }

    this.stunned = Math.max(0, this.stunned - dt)
    const p = this.phases[this.phase]
    this.actTimer -= dt
    if (this.actTimer <= 0 && this.stunned <= 0) {
      this.act(world)
      this.actTimer = p.interval
    }
    this.move(dt, world)
    moveBody(this.body, world.map, dt, {})
    this.touchPlayer(world)
  }

  protected touchPlayer(world: World): void {
    if (this.stunned > 0) return
    const player = world.player() as Player | null
    if (!player || player.dead) return
    if (!rectsOverlap(this.hurtbox(), player.rect())) return
    player.hurt(world, {
      amount: 1, dirX: player.x < this.x ? -1 : 1, dirY: -1, sourceId: this.id, kind: 'melee',
    })
  }

  damage(hit: Hit, world: World): boolean {
    if (this.defeated || this.iframes > 0) return false
    this.health -= hit.amount
    this.iframes = 0.5
    this.stunned = 0.6
    this.flash = 1
    this.squash(1.2, 0.84)
    world.audio.playSfx('boss-hit')
    world.hitstop(9)
    world.shake(0.3)
    world.events.emit('boss:hit', { x: this.x, y: this.y, healthLeft: this.health / this.maxHealth })
    world.particles.burst(22, this.x, this.y - this.body.h / 2, {
      speed: 170, speedVar: 80, life: 0.5, lifeVar: 0.2, size: 2.6, sizeEnd: 0.4,
      color: PAL.danger, colorEnd: PAL.ember, shape: 'spark', additive: true, drag: 0.05, spin: 10,
    })

    const frac = this.health / this.maxHealth
    while (this.phase < this.phases.length - 1 && frac <= this.phases[this.phase + 1].at) {
      this.phase++
      world.events.emit('boss:phase', { phase: this.phase })
      world.audio.setIntensity(0.75 + this.phase * 0.12)
      world.audio.playSfx('warn')
    }

    if (this.health <= 0) this.defeat(world)
    return true
  }

  protected defeat(world: World): void {
    this.defeated = true
    this.defeatTimer = 0
    this.body.vx = 0
    this.body.vy = -180
    world.audio.playSfx('boss-die')
    world.audio.stopMusic(1)
    world.hitstop(24)
    world.shake(0.9)
    world.events.emit('boss:defeat', { x: this.x, y: this.y })
    world.particles.burst(60, this.x, this.y - this.body.h / 2, {
      speed: 240, speedVar: 130, life: 1, lifeVar: 0.4, size: 3.4, sizeEnd: 0.4,
      color: PAL.ember, colorEnd: PAL.danger, shape: 'spark', additive: true,
      spawnRadius: 14, drag: 0.03, spin: 8,
    })
  }
}

/**
 * Buggy — the first boss. Splits into hovering pieces when hit, hops toward the
 * player, and lobs knives on a timer.
 */
export class BuggyBoss extends Boss {
  displayName = 'Buggy'
  private hopTimer = 0

  constructor(x: number, y: number) {
    super(x, y, 22, 34)
    this.maxHealth = 6
    this.health = 6
    this.phases = [
      { at: 1, interval: 2.4, speed: 1 },
      { at: 0.66, interval: 1.7, speed: 1.25 },
      { at: 0.33, interval: 1.1, speed: 1.6 },
    ]
  }

  protected move(dt: number, world: World): void {
    const p = world.player()
    const speed = this.phases[this.phase].speed
    if (p) this.facing = p.x > this.x ? 1 : -1
    this.hopTimer -= dt
    if (this.body.grounded && this.hopTimer <= 0 && this.stunned <= 0) {
      this.body.vy = -300
      this.body.vx = this.facing * 70 * speed
      this.hopTimer = 1.1 / speed
    }
    this.body.vy = Math.min(this.body.vy + PHYS.gravity * dt, PHYS.maxFall)
    if (this.body.grounded) this.body.vx *= 0.86
  }

  protected act(world: World): void {
    world.audio.playSfx('slash', { volume: 0.7 })
    for (let i = -1; i <= 1; i++) {
      world.spawn(new Knife(this.x, this.y - this.body.h * 0.6, this.facing * 150, i * 70))
    }
  }

  draw(rc: RenderContext, sx: number, sy: number): void {
    const { ctx } = rc
    const h = this.body.h
    const w = this.body.w
    ctx.save()
    ctx.translate(sx, sy)
    ctx.scale(this.squashX, this.squashY)
    if (this.facing === -1) ctx.scale(-1, 1)

    // Cape
    ctx.fillStyle = '#7E2B6E'
    ctx.fillRect(-w / 2 - 3, -h + 8, w + 6, h - 10)
    // Body
    ctx.fillStyle = '#E8E4D8'
    ctx.fillRect(-w / 2, -h + 10, w, h - 12)
    ctx.fillStyle = '#C9C2B2'
    ctx.fillRect(w / 2 - 3, -h + 10, 3, h - 12)
    // Striped sash
    ctx.fillStyle = PAL.luffyRed
    ctx.fillRect(-w / 2, -h + 20, w, 3)
    // Head
    ctx.fillStyle = PAL.skin
    ctx.beginPath()
    ctx.ellipse(0, -h + 8, 8, 8, 0, 0, Math.PI * 2)
    ctx.fill()
    // The nose
    ctx.fillStyle = PAL.luffyRed
    ctx.beginPath()
    ctx.ellipse(5, -h + 8, 4, 3.4, 0, 0, Math.PI * 2)
    ctx.fill()
    // Hair
    ctx.fillStyle = '#3FA8D9'
    ctx.fillRect(-9, -h + 2, 18, 5)
    for (let i = -8; i < 9; i += 4) ctx.fillRect(i, -h - 2, 3, 5)
    // Eyes
    ctx.fillStyle = PAL.ink
    ctx.fillRect(1, -h + 6, 2, 2)
    ctx.fillRect(-4, -h + 6, 2, 2)

    if (this.flash > 0.01) {
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = this.flash
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(-w / 2 - 4, -h - 4, w + 8, h + 6)
    }
    ctx.restore()
  }
}

/** A thrown knife. */
export class Knife extends Entity {
  readonly kind = 'projectile'
  constructor(x: number, y: number, vx: number, vy: number) {
    super(x, y, 8, 4)
    this.body.vx = vx
    this.body.vy = vy
    this.body.gravityScale = 0.35
    this.depth = 70
    this.tags.add('hazard')
  }
  update(dt: number, world: World): void {
    this.age += dt
    this.body.vy += PHYS.gravity * this.body.gravityScale * dt
    const res = moveBody(this.body, world.map, dt, { useSlopes: false })
    if (res.hitX || res.hitY || this.age > 4) {
      this.dead = true
      world.particles.burst(6, this.x, this.y, {
        speed: 70, speedVar: 40, life: 0.25, size: 1.6, color: PAL.steel, colorEnd: PAL.mist,
        shape: 'spark', drag: 0.1,
      })
      return
    }
    const p = world.player() as Player | null
    if (p && !p.dead && rectsOverlap(this.rect(), p.rect())) {
      p.hurt(world, { amount: 1, dirX: Math.sign(this.body.vx) || 1, dirY: -1, sourceId: this.id, kind: 'projectile' })
      this.dead = true
    }
  }
  draw(rc: RenderContext, sx: number, sy: number): void {
    const { ctx } = rc
    const angle = Math.atan2(this.body.vy, this.body.vx)
    ctx.save()
    ctx.translate(sx, sy - 2)
    ctx.rotate(angle)
    ctx.fillStyle = PAL.steel
    ctx.fillRect(-5, -1, 10, 2)
    ctx.fillStyle = PAL.cream
    ctx.fillRect(2, -1, 4, 1)
    ctx.fillStyle = PAL.woodDeep
    ctx.fillRect(-6, -1.5, 3, 3)
    ctx.restore()
    void clamp01
  }
}

registerEntity('boss-buggy', (x, y) => new BuggyBoss(x, y))
registerEntity('knife', (x, y) => new Knife(x, y, 120, 0))
