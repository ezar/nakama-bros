import { TILE, Tile } from '../../types'
import type { CrewId, Hit, PowerTier, RenderContext, Rect } from '../../types'
import { Entity } from './Entity'
import type { World } from '../world'
import { moveBody, groundBelow } from '../../physics/move'
import { CREW, PHYS, TIER_MODS, TIER_ORDER, jumpVelocityFor } from '../config'
import { art } from '../../art'
import { clamp, approach } from '../../engine/math'
import { PAL } from '../../art/palette'

type State = 'normal' | 'hurt' | 'dead' | 'clear' | 'climb' | 'swim'

/**
 * The player character.
 *
 * The handling model is the classic one — separate acceleration, deceleration
 * and turn rates; coyote time and a jump buffer to forgive imprecise input;
 * variable jump height from hold duration — with a stretch-powered attack and
 * four escalating gears layered on top.
 */
export class Player extends Entity {
  readonly kind = 'player'
  crew: CrewId
  tier: PowerTier = 'base'
  state: State = 'normal'

  private coyote = 0
  private jumpBuffered = 0
  private jumping = false
  private airJumpsLeft = 0
  private attackTimer = 0
  private attackCooldown = 0
  private stateTimer = 0
  private stompChain = 0
  private auraPhase = 0
  /** Extra hits the current tier absorbs. */
  private armor = 0
  private wasInWater = false

  constructor(x: number, y: number, crew: CrewId = 'luffy') {
    super(x, y, 11, 22)
    this.crew = crew
    this.depth = 100
    this.cullable = false
    this.tags.add('player')
    this.health = 1
  }

  get stats() {
    return CREW[this.crew]
  }

  get mods() {
    return TIER_MODS[this.tier]
  }

  /** Attack reach box, live only during the active window of the swing. */
  hitbox(): Rect | null {
    if (this.attackTimer <= 0) return null
    const total = this.stats.attackTime
    const t = 1 - this.attackTimer / total
    // Startup 25%, active 55%, recovery 20%.
    if (t < 0.25 || t > 0.8) return null
    const reach = (this.tier === 'base' ? 20 : 30) * this.mods.scale
    const h = 14 * this.mods.scale
    return {
      x: this.facing === 1 ? this.x + this.body.w / 2 : this.x - this.body.w / 2 - reach,
      y: this.y - this.body.h * 0.75,
      w: reach,
      h,
    }
  }

  /** Apply a tier without effects — used when (re)building the level. */
  setTierSilent(tier: PowerTier): void {
    this.tier = tier
    this.armor = TIER_MODS[tier].armor
    this.body.w = 11 * TIER_MODS[tier].scale
    this.body.h = 22 * TIER_MODS[tier].scale
  }

  setTier(tier: PowerTier, world: World): void {
    if (this.tier === tier) return
    const rising = TIER_ORDER.indexOf(tier) > TIER_ORDER.indexOf(this.tier)
    this.tier = tier
    this.armor = TIER_MODS[tier].armor
    const mods = TIER_MODS[tier]
    // Grow from the feet so a size change never pushes the player into a floor.
    this.body.w = 11 * mods.scale
    this.body.h = 22 * mods.scale
    world.events.emit('player:power', { tier, x: this.x, y: this.y })
    world.audio.playSfx(rising ? (tier === 'base' ? 'powerdown' : 'gear-shift') : 'powerdown')
    world.hitstop(rising ? 8 : 4)
    if (rising) {
      world.particles.burst(26, this.x, this.y - this.body.h / 2, {
        speed: 130, speedVar: 60, life: 0.5, lifeVar: 0.2, size: 2, sizeEnd: 0.5,
        color: mods.aura ?? PAL.gold, colorEnd: PAL.cream, shape: 'spark',
        additive: true, drag: 0.06, spin: 6,
      })
    }
  }

  update(dt: number, world: World): void {
    const input = world.input
    this.tickAnim(dt)
    this.attackCooldown = Math.max(0, this.attackCooldown - dt)
    this.auraPhase += dt

    switch (this.state) {
      case 'dead':
        this.updateDead(dt, world)
        return
      case 'hurt':
        this.stateTimer -= dt
        if (this.stateTimer <= 0) this.state = 'normal'
        break
      case 'clear':
        this.updateClear(dt, world)
        return
    }

    const speedMul = this.mods.speed
    const maxSpeed = this.stats.runSpeed * speedMul
    const grounded = this.body.grounded
    const inWater = this.body.inWater

    if (inWater && !this.wasInWater) {
      world.audio.playSfx('splash')
      world.particles.burst(16, this.x, this.y - 4, {
        speed: 110, speedVar: 50, life: 0.45, size: 2, sizeEnd: 0.5,
        color: PAL.foam, colorEnd: PAL.seaLight, shape: 'circle', gravity: 380, drag: 0.04,
      })
    }
    this.wasInWater = inWater

    // ── Horizontal ───────────────────────────────────────────────────────────
    const want = input.axisX
    if (want !== 0) this.facing = want > 0 ? 1 : -1
    const turning = want !== 0 && Math.sign(want) !== Math.sign(this.body.vx) && this.body.vx !== 0
    let accel = turning ? PHYS.turnAccel : PHYS.accel
    if (!grounded) accel *= PHYS.airAccelScale
    if (want !== 0) {
      this.body.vx = approach(this.body.vx, want * maxSpeed, accel * dt)
    } else {
      const decel = PHYS.decel * (grounded ? 1 : PHYS.airDecelScale)
      // Ice keeps momentum: read the slipperiness of the tile underfoot.
      const under = world.map.flags(Math.floor(this.x / TILE), Math.floor((this.y + 2) / TILE))
      const slip = grounded ? under.slipperiness : 0
      this.body.vx = approach(this.body.vx, 0, decel * dt * (1 - slip))
    }

    // ── Climbing ─────────────────────────────────────────────────────────────
    const onLadder = world.map.anyIn(
      this.x - 3, this.y - this.body.h, 6, this.body.h, (f) => f.climbable,
    )
    if (onLadder && Math.abs(input.axisY) > 0.4) this.state = 'climb'
    if (this.state === 'climb') {
      if (!onLadder) {
        this.state = 'normal'
      } else {
        this.body.gravityScale = 0
        this.body.vy = input.axisY * PHYS.climbSpeed
        this.body.vx *= 0.6
        this.play('climb')
        if (Math.abs(input.axisY) < 0.2) this.animTime = 0
        if (input.pressed.jump) {
          this.state = 'normal'
          this.body.gravityScale = 1
          this.startJump(world, false)
        }
      }
    } else {
      this.body.gravityScale = 1
    }

    // ── Jump ─────────────────────────────────────────────────────────────────
    if (grounded) {
      this.coyote = PHYS.coyoteTime
      this.airJumpsLeft = this.stats.airJumps
      this.stompChain = 0
    } else {
      this.coyote = Math.max(0, this.coyote - dt)
    }
    if (input.pressed.jump) this.jumpBuffered = PHYS.jumpBuffer
    else this.jumpBuffered = Math.max(0, this.jumpBuffered - dt)

    if (this.state !== 'climb' && this.jumpBuffered > 0) {
      if (inWater) {
        this.body.vy = -PHYS.waterSwimImpulse
        this.jumpBuffered = 0
        world.audio.playSfx('swim', { volume: 0.7 })
      } else if (this.coyote > 0) {
        this.startJump(world, false)
      } else if (this.airJumpsLeft > 0) {
        this.airJumpsLeft--
        this.startJump(world, true)
      }
    }
    // Releasing jump early cuts the rise — this is variable jump height.
    if (this.jumping && !input.held.jump && this.body.vy < 0) {
      this.body.vy *= PHYS.jumpCutScale
      this.jumping = false
    }
    if (this.body.vy >= 0) this.jumping = false

    // ── Attack ───────────────────────────────────────────────────────────────
    if (input.pressed.attack && this.attackCooldown <= 0 && this.state === 'normal') {
      this.attackTimer = this.stats.attackTime
      this.attackCooldown = this.stats.attackTime + 0.1
      this.play('attack', true)
      world.events.emit('player:attack', { x: this.x, y: this.y, facing: this.facing })
      world.audio.playSfx(attackSound(this.crew))
    }
    if (this.attackTimer > 0) this.attackTimer -= dt

    // ── Gravity ──────────────────────────────────────────────────────────────
    if (this.state !== 'climb') {
      let g = PHYS.gravity * this.body.gravityScale
      if (inWater) {
        g *= PHYS.waterGravity
        this.body.vx *= Math.pow(PHYS.waterDrag, dt * 60)
        this.body.vy = clamp(this.body.vy, -PHYS.waterMaxUp, PHYS.waterMaxFall)
      } else {
        g *= this.body.vy < 0 && input.held.jump ? PHYS.jumpHoldGravity : PHYS.fallGravity
      }
      this.body.vy = Math.min(this.body.vy + g * dt, inWater ? PHYS.waterMaxFall : PHYS.maxFall)
    }

    // ── Move ─────────────────────────────────────────────────────────────────
    const res = moveBody(this.body, world.map, dt, {
      dropThrough: input.held.down && input.pressed.jump,
      onHit: (tx, ty, axis, dir) => {
        if (axis !== 'y' || dir >= 0) return
        this.bumpTile(tx, ty, world)
      },
    })

    if (res.landed) {
      const impact = clamp(res.impactSpeed / PHYS.maxFall, 0, 1)
      this.squash(1 + impact * 0.35, 1 - impact * 0.3)
      world.events.emit('player:land', { x: this.x, y: this.y, speed: res.impactSpeed })
      if (impact > 0.25) {
        world.audio.playSfx('land', { volume: 0.4 + impact * 0.6 })
        world.particles.burst(Math.round(4 + impact * 10), this.x, this.y, {
          speed: 60 + impact * 70, speedVar: 40, angle: -Math.PI / 2, spread: Math.PI * 1.1,
          life: 0.32, lifeVar: 0.12, size: 2, sizeEnd: 0.4,
          color: '#E8E2D2', colorEnd: '#B8B2A2', shape: 'circle', gravity: 120, drag: 0.09,
        })
        if (impact > 0.7) world.shake(0.14 * impact)
      }
    }

    // Skid dust.
    if (grounded && turning && Math.abs(this.body.vx) > PHYS.skidSpeed) {
      if (world.rng.bool(0.4)) {
        world.particles.emit({
          x: this.x - this.facing * 4, y: this.y - 1,
          vx: -this.facing * world.rng.range(20, 60), vy: -world.rng.range(10, 40),
          life: 0.3, size: 2, sizeEnd: 0.5, color: '#E8E2D2', colorEnd: '#B8B2A2',
          shape: 'circle', gravity: 90, drag: 0.08,
        })
      }
    }

    // Gear 2 steam trail.
    if (this.tier === 'gear2' && Math.abs(this.body.vx) > maxSpeed * 0.6 && world.rng.bool(0.5)) {
      world.particles.emit({
        x: this.x + world.rng.range(-4, 4), y: this.y - this.body.h * world.rng.range(0.2, 0.9),
        vx: -this.facing * 20, vy: -world.rng.range(20, 50),
        life: 0.4, size: 3, sizeEnd: 0.6, color: '#FFD9B0', colorEnd: 'rgba(255,217,176,0)',
        shape: 'smoke', drag: 0.06, behind: true, additive: true,
      })
    }

    // ── Fall out of the world ────────────────────────────────────────────────
    if (this.y > world.map.pixelH + 40) this.kill(world)

    // ── Hazards ──────────────────────────────────────────────────────────────
    const r = this.rect()
    if (world.map.anyIn(r.x + 2, r.y + 2, r.w - 4, r.h - 4, (f) => f.hazard)) {
      this.hurt(world, { amount: 1, dirX: -this.facing, dirY: -1, sourceId: 0, kind: 'hazard' })
    }

    this.updateAnimState(inWater, grounded, want, turning)
  }

  private startJump(world: World, double: boolean): void {
    const v = jumpVelocityFor(this.stats.jumpTiles * this.mods.jump)
    this.body.vy = -v
    this.body.grounded = false
    this.jumping = true
    this.coyote = 0
    this.jumpBuffered = 0
    this.squash(0.82, 1.24)
    this.play('jump', true)
    world.events.emit('player:jump', { x: this.x, y: this.y, double })
    world.audio.playSfx(double ? 'double-jump' : 'jump')
    world.particles.burst(double ? 12 : 6, this.x, this.y, {
      speed: double ? 110 : 60, speedVar: 30, angle: Math.PI / 2, spread: Math.PI * 0.9,
      life: 0.3, size: 2, sizeEnd: 0.4, color: '#FFF5E4', colorEnd: '#9AA8C4',
      shape: 'circle', drag: 0.1,
    })
  }

  private bumpTile(tx: number, ty: number, world: World): void {
    const id = world.map.get(tx, ty)
    if (id === Tile.Question) {
      world.map.set(tx, ty, Tile.Used)
      world.events.emit('tile:bump', { tx, ty })
      world.audio.playSfx('bump')
      world.shake(0.08)
    } else if (id === Tile.Brick) {
      if (this.tier === 'base') {
        world.events.emit('tile:bump', { tx, ty })
        world.audio.playSfx('bump')
      } else {
        world.map.set(tx, ty, Tile.Empty)
        world.events.emit('tile:break', { tx, ty })
        world.audio.playSfx('break')
        world.shake(0.12)
        world.particles.burst(14, tx * TILE + TILE / 2, ty * TILE + TILE / 2, {
          speed: 150, speedVar: 70, life: 0.6, lifeVar: 0.2, size: 3, sizeEnd: 1,
          color: PAL.woodLight, colorEnd: PAL.woodDeep, shape: 'shard',
          gravity: 620, drag: 0.02, spin: 9,
        })
      }
    }
  }

  /** Bounce off a stomped enemy. Chains give escalating height and score. */
  bounce(world: World, held: boolean): void {
    this.body.vy = -(held ? PHYS.stompBounceHeld : PHYS.stompBounce)
    this.jumping = held
    this.squash(1.3, 0.72)
    this.stompChain = Math.min(this.stompChain + 1, 5)
    world.hitstop(4)
  }

  get chain(): number {
    return this.stompChain
  }

  hurt(world: World, hit: Hit): void {
    if (this.iframes > 0 || this.state === 'dead' || this.state === 'clear') return
    if (this.armor > 0) {
      this.armor--
      this.iframes = 0.7
      this.flash = 1
      world.audio.playSfx('hurt', { volume: 0.6 })
      world.hitstop(5)
      return
    }
    const idx = TIER_ORDER.indexOf(this.tier)
    if (idx > 0) {
      this.setTier(TIER_ORDER[idx - 1], world)
      this.iframes = PHYS.hurtInvuln
      this.state = 'hurt'
      this.stateTimer = 0.3
      this.body.vx = hit.dirX * PHYS.hurtKnockX
      this.body.vy = PHYS.hurtKnockY
      this.play('hurt', true)
      world.events.emit('player:hurt', { x: this.x, y: this.y })
      world.shake(0.3)
      world.hitstop(10)
      return
    }
    this.kill(world)
  }

  kill(world: World): void {
    if (this.state === 'dead') return
    this.state = 'dead'
    this.stateTimer = 0
    this.body.collidesWithTiles = false
    this.body.vx = 0
    this.body.vy = -320
    this.play('hurt', true)
    world.events.emit('player:die', { x: this.x, y: this.y })
    world.audio.playSfx('death')
    world.audio.stopMusic(0.3)
  }

  private updateDead(dt: number, world: World): void {
    this.stateTimer += dt
    // A beat of hang time before the fall reads better than dropping instantly.
    if (this.stateTimer > 0.4) this.body.vy += PHYS.gravity * dt
    this.body.px = this.body.x
    this.body.py = this.body.y
    this.body.x += this.body.vx * dt
    this.body.y += this.body.vy * dt
    void world
  }

  /** Victory pose at the goal. */
  startClear(world: World): void {
    if (this.state === 'clear') return
    this.state = 'clear'
    this.stateTimer = 0
    this.body.vx = 0
    this.play('victory', true)
    world.events.emit('level:clear', { timeLeft: world.run.time })
  }

  private updateClear(dt: number, world: World): void {
    this.stateTimer += dt
    this.body.vy = Math.min(this.body.vy + PHYS.gravity * dt, PHYS.maxFall)
    moveBody(this.body, world.map, dt, {})
    if (this.body.grounded) this.body.vx = 0
  }

  private updateAnimState(inWater: boolean, grounded: boolean, want: number, turning: boolean): void {
    if (this.state === 'climb' || this.state === 'hurt') return
    if (this.attackTimer > 0) {
      this.play('attack')
      return
    }
    if (inWater) {
      this.play('swim')
      return
    }
    if (!grounded) {
      this.play(this.body.vy < 0 ? 'jump' : 'fall')
      return
    }
    if (turning && Math.abs(this.body.vx) > PHYS.skidSpeed) {
      this.play('skid')
      return
    }
    if (Math.abs(this.body.vx) > PHYS.idleSpeed) {
      this.play('run')
      // Animation speed follows actual speed, so the feet never skate.
      const ratio = Math.abs(this.body.vx) / (this.stats.runSpeed * this.mods.speed)
      this.animTime += (ratio - 1) * 0.016
      return
    }
    this.play(want !== 0 ? 'run' : 'idle')
  }

  draw(rc: RenderContext, sx: number, sy: number): void {
    const { ctx } = rc
    // Flicker during invulnerability, but never so fast it looks like a glitch.
    if (this.iframes > 0 && Math.floor(this.age * 20) % 2 === 0 && this.state !== 'hurt') return

    this.sheet = art().crew[this.crew]
    const mods = this.mods
    const scale = mods.scale

    // Aura behind the sprite for the powered tiers.
    if (mods.aura) {
      const pulse = 0.5 + Math.sin(this.auraPhase * 6) * 0.2
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = 0.16 * pulse
      ctx.fillStyle = mods.aura
      ctx.beginPath()
      ctx.ellipse(sx, sy - this.body.h * 0.5, this.body.w * 1.5, this.body.h * 0.78, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    // Contact shadow — grounds the character against the tiles.
    const shadowDrop = groundShadowDrop(this)
    if (shadowDrop !== null) {
      ctx.save()
      ctx.globalAlpha = 0.3 * (1 - Math.min(1, shadowDrop / 60))
      ctx.fillStyle = '#0B1020'
      ctx.beginPath()
      ctx.ellipse(sx, sy + shadowDrop, 7 * scale, 2.4 * scale, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    const frame = this.frame()
    if (!frame || !this.sheet) return
    ctx.save()
    ctx.translate(sx, sy)
    ctx.scale(this.squashX * scale, this.squashY * scale)
    if (this.facing === -1) ctx.scale(-1, 1)
    ctx.drawImage(
      this.sheet.image,
      frame.sx, frame.sy, frame.sw, frame.sh,
      Math.round(frame.ox), Math.round(frame.oy), frame.sw, frame.sh,
    )
    if (this.flash > 0.01) {
      ctx.globalCompositeOperation = 'source-atop'
      ctx.globalAlpha = this.flash
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(frame.ox, frame.oy, frame.sw, frame.sh)
    }
    ctx.restore()
  }
}

/** Distance to the ground below the player, or null when there is none nearby. */
function groundShadowDrop(p: Player): number | null {
  return p.body.grounded ? 0 : null
}

function attackSound(crew: CrewId) {
  switch (crew) {
    case 'zoro':
      return 'slash' as const
    case 'usopp':
      return 'shoot' as const
    case 'sanji':
      return 'kick' as const
    default:
      return 'punch' as const
  }
}

export { groundBelow }
