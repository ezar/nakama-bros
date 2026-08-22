import type { Hit, RenderContext } from '../../types'
import { Entity } from './Entity'
import type { World } from '../world'
import { moveBody, edgeAhead, wallAhead } from '../../physics/move'
import { PHYS, SCORE } from '../config'
import { art } from '../../art'
import { PAL } from '../../art/palette'
import type { Player } from './Player'

/**
 * Shared enemy behaviour: gravity, patrol turning, stomp response, damage and
 * the defeat burst. Subclasses override `think` for their own movement and
 * `stompable` / `damageable` for how the player is allowed to beat them.
 */
export abstract class Enemy extends Entity {
  readonly kind = 'enemy'
  /** Sprite sheet key in the enemy art library. */
  abstract sheetKey: string
  /** Points awarded on defeat. */
  points: number = SCORE.enemy
  /** Can the player kill this by landing on it? */
  stompable = true
  /** Does the player's attack hurt it? */
  damageable = true
  /** Does contact hurt the player? */
  contactDamage = true
  /** Walk speed, px/s. */
  speed = 34
  /** Turn around rather than walk off a ledge. */
  avoidLedges = true
  gravity: number = PHYS.gravity
  /** Seconds of squash animation before removal. */
  protected dyingFor = -1

  constructor(x: number, y: number, w: number, h: number) {
    super(x, y, w, h)
    this.tags.add('enemy')
    this.depth = 60
    this.facing = -1
  }

  /** Per-type movement. Called every step while alive. */
  protected abstract think(dt: number, world: World): void

  update(dt: number, world: World): void {
    this.tickAnim(dt)
    this.sheet = art().enemies[this.sheetKey] ?? null

    if (this.dyingFor >= 0) {
      this.dyingFor += dt
      if (this.dyingFor > 0.5) this.dead = true
      return
    }

    this.think(dt, world)

    if (this.gravity > 0) {
      this.body.vy = Math.min(this.body.vy + this.gravity * dt, PHYS.maxFall)
    }
    moveBody(this.body, world.map, dt, {})

    // Patrol: reverse at walls and, optionally, at ledges.
    if (this.speed !== 0) {
      if (wallAhead(this.body, world.map, this.facing)) this.turn()
      else if (this.avoidLedges && this.body.grounded && edgeAhead(this.body, world.map, this.facing)) {
        this.turn()
      }
    }

    this.checkPlayer(world)
  }

  protected turn(): void {
    this.facing = this.facing === 1 ? -1 : 1
    this.body.vx = -this.body.vx
  }

  /** Contact rules with the player: stomp above, damage otherwise. */
  protected checkPlayer(world: World): void {
    const player = world.player() as Player | null
    if (!player || player.dead) return
    const a = this.hurtbox()
    const b = player.rect()
    const overlapping = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
    if (!overlapping) return

    // The player's feet must be above the enemy's midline and moving down.
    const stomping = this.stompable && player.body.vy > 0 && b.y + b.h - player.body.vy * 0.016 <= a.y + a.h * 0.5
    if (stomping) {
      player.bounce(world, world.input.held.jump)
      this.defeat(world, 'stomp')
      return
    }
    if (this.contactDamage) {
      player.hurt(world, {
        amount: 1,
        dirX: player.x < this.x ? -1 : 1,
        dirY: -1,
        sourceId: this.id,
        kind: 'melee',
      })
    }
  }

  damage(hit: Hit, world: World): boolean {
    if (!this.damageable || this.dyingFor >= 0) return false
    this.health -= hit.amount
    this.flash = 1
    this.iframes = 0.2
    if (this.health <= 0) {
      this.defeat(world, 'melee')
    } else {
      world.audio.playSfx('boss-hit', { volume: 0.5 })
      this.body.vx = hit.dirX * 90
      this.squash(1.25, 0.78)
    }
    return true
  }

  defeat(world: World, how: 'stomp' | 'melee'): void {
    if (this.dyingFor >= 0) return
    const player = world.player() as Player | null
    const chain = player ? Math.min(player.chain, SCORE.chain.length - 1) : 0
    const points = this.points * (how === 'stomp' ? SCORE.chain[chain] : 1)
    world.score(points, this.x, this.y - this.body.h)
    world.events.emit('enemy:defeat', { x: this.x, y: this.y, type: this.sheetKey, points })
    world.audio.playSfx(how === 'stomp' ? 'stomp' : 'kick')
    world.hitstop(how === 'stomp' ? 5 : 7)
    world.shake(0.12)
    world.particles.burst(16, this.x, this.y - this.body.h / 2, {
      speed: 130, speedVar: 70, life: 0.45, lifeVar: 0.18, size: 2.4, sizeEnd: 0.4,
      color: PAL.cream, colorEnd: PAL.mist, shape: 'circle', gravity: 300, drag: 0.05,
    })
    if (how === 'stomp' && this.sheet?.anims.squash) {
      this.dyingFor = 0
      this.play('squash', true)
      this.body.vx = 0
      this.speed = 0
      this.contactDamage = false
      this.stompable = false
    } else {
      this.dead = true
    }
  }

  draw(rc: RenderContext, sx: number, sy: number): void {
    const { ctx } = rc
    // Contact shadow.
    if (this.body.grounded) {
      ctx.save()
      ctx.globalAlpha = 0.28
      ctx.fillStyle = '#0B1020'
      ctx.beginPath()
      ctx.ellipse(sx, sy, this.body.w * 0.6, 2.2, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    super.draw(rc, sx, sy)
    if (this.flash > 0.01) {
      const frame = this.frame()
      if (frame && this.sheet) {
        ctx.save()
        ctx.translate(sx, sy)
        if (this.facing === -1) ctx.scale(-1, 1)
        ctx.globalAlpha = this.flash
        ctx.globalCompositeOperation = 'lighter'
        ctx.drawImage(
          this.sheet.image, frame.sx, frame.sy, frame.sw, frame.sh,
          frame.ox, frame.oy, frame.w, frame.h,
        )
        ctx.restore()
      }
    }
  }
}
