import { TILE, Tile } from '../../types'
import type { CrewId, Facing, Hit, PowerTier, RenderContext, Rect } from '../../types'
import { Entity } from './Entity'
import { FloatingText } from './FloatingText'
import type { World } from '../world'
import { moveBody, groundBelow, headroom, wallAhead } from '../../physics/move'
import {
  CREW,
  PHYS,
  SIGNATURES,
  TIER_MODS,
  TIER_ORDER,
  WATER_AGILITY,
  bufferOk,
  consumeJump,
  coyoteOk,
  cutJump,
  jumpVelocityFor,
  newJumpMemory,
  stepJumpGravity,
  tickJumpMemory,
} from '../config'
import type { SignatureDef } from '../config'
import { art } from '../../art'
import { clamp, approach, rectsOverlap } from '../../engine/math'
import { cel } from '../../art/color'
import { PAL } from '../../art/palette'

type State = 'normal' | 'hurt' | 'dead' | 'clear' | 'climb' | 'swim'

/** What the body is doing on the ground. Each stance has its own hitbox. */
type Stance = 'stand' | 'crouch' | 'slide' | 'roll'

/** Standing hitbox, in world units. Everything else scales off it. */
const STAND_W = 13
const STAND_H = 30

/**
 * The player character.
 *
 * The handling model is the classic one — separate acceleration, deceleration
 * and turn rates; coyote time and a jump buffer to forgive imprecise input;
 * variable jump height from hold duration — extended with the three verbs a
 * modern platformer is expected to have: a wall to slide down and kick off, a
 * crouch that fits under things, and a slide that spends the run you already
 * built. On top of that sits one signature move per crew member, and the four
 * escalating gears.
 *
 * Everything with a duration here is a field, not an animation event: the
 * simulation must be able to run without art loaded, which is what lets the
 * physics be tested headless.
 */
/** How long the pivot holds: the three turn frames at 0.05s each. */
const TURN_TIME = 0.15

export class Player extends Entity {
  readonly kind = 'player'
  crew: CrewId
  tier: PowerTier = 'base'
  state: State = 'normal'
  stance: Stance = 'stand'

  /** Coyote time and jump buffering, as elapsed clocks. */
  private jumpMem = newJumpMemory()
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

  // ── Traversal ──────────────────────────────────────────────────────────────
  /** Wall currently clung to: -1 on the left, 1 on the right, 0 none. */
  private wallDir: -1 | 0 | 1 = 0
  private wallCoyote = 0
  /** Seconds of horizontal input lockout after a wall jump. */
  private wallLock = 0
  private slideTimer = 0
  private slideCooldown = 0
  /** Seconds left of the drop-through window opened by down+jump. */
  private dropTimer = 0

  // ── Signature move ─────────────────────────────────────────────────────────
  private sigTimer = 0
  private sigRecovery = 0
  private sigCooldown = 0
  private sigKind: SignatureDef['kind'] | null = null
  private sigDone = false
  private sigHits = new Set<number>()
  private comboStep = 0
  private comboWindow = 0
  private airDashUsed = false
  private bloomRef: Entity | null = null
  /** Luffy's arm while it is out: end point and remaining life. */
  private armT = 0
  private armX = 0
  private armY = 0
  /** Radians of tumble accumulated by Chopper's roll. */
  private rollSpin = 0
  /** Free height above the feet, measured while tucked. Drives the draw fit. */
  private roomAbove = STAND_H

  constructor(x: number, y: number, crew: CrewId = 'luffy') {
    super(x, y, STAND_W, STAND_H)
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

  get signature(): SignatureDef {
    return SIGNATURES[this.crew]
  }

  /** 0..1 readiness of the signature move, for the HUD. */
  get signatureCharge(): number {
    const def = this.signature
    if (this.sigTimer > 0 || this.sigRecovery > 0) return 0
    return def.cooldown <= 0 ? 1 : clamp(1 - this.sigCooldown / def.cooldown, 0, 1)
  }

  /** Standing height at the current tier. */
  private get standH(): number {
    return STAND_H * this.mods.scale
  }

  private get lowH(): number {
    return PHYS.crouchHeight * this.mods.scale
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
    this.body.w = STAND_W * TIER_MODS[tier].scale
    this.applyStanceHeight()
  }

  setTier(tier: PowerTier, world: World): void {
    if (this.tier === tier) return
    const rising = TIER_ORDER.indexOf(tier) > TIER_ORDER.indexOf(this.tier)
    this.tier = tier
    this.armor = TIER_MODS[tier].armor
    const mods = TIER_MODS[tier]
    // Grow from the feet so a size change never pushes the player into a floor.
    this.body.w = STAND_W * mods.scale
    this.applyStanceHeight()
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

  /** The hitbox follows the stance. The origin is the feet, so it never sinks. */
  private applyStanceHeight(): void {
    this.body.h = this.stance === 'stand' ? this.standH : this.lowH
  }

  update(dt: number, world: World): void {
    const input = world.input
    this.tickAnim(dt)
    this.attackCooldown = Math.max(0, this.attackCooldown - dt)
    this.auraPhase += dt
    this.armT = Math.max(0, this.armT - dt)
    this.dropTimer = Math.max(0, this.dropTimer - dt)
    this.slideCooldown = Math.max(0, this.slideCooldown - dt)
    this.wallLock = Math.max(0, this.wallLock - dt)

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

    const grounded = this.body.grounded
    const inWater = this.body.inWater
    const agility = WATER_AGILITY[this.crew]
    const speedMul = this.mods.speed * (inWater ? 0.72 * agility : 1)
    const maxSpeed = this.stats.runSpeed * speedMul

    if (inWater && !this.wasInWater) {
      world.audio.playSfx('splash')
      world.particles.burst(16, this.x, this.y - 4, {
        speed: 110, speedVar: 50, life: 0.45, size: 2, sizeEnd: 0.5,
        color: PAL.foam, colorEnd: PAL.seaLight, shape: 'circle', gravity: 380, drag: 0.04,
      })
    }
    this.wasInWater = inWater

    // ── Stance ───────────────────────────────────────────────────────────────
    this.updateStance(dt, world, grounded, inWater, maxSpeed)

    // ── Signature move ───────────────────────────────────────────────────────
    if (this.turnTimer > 0) this.turnTimer = Math.max(0, this.turnTimer - dt)
    this.updateSignature(dt, world, grounded, inWater)

    // ── Horizontal ───────────────────────────────────────────────────────────
    const control = this.moveControl()
    const want = this.wallLock > 0 ? 0 : input.axisX
    if (want !== 0 && control > 0.3 && this.sigTimer <= 0) {
      const next: Facing = want > 0 ? 1 : -1
      // A change of facing is a whole-body event, not a sprite flip. Hold the
      // pivot long enough for its three frames to play; above skid speed the
      // skid already covers it, and in the air there is nothing to pivot on.
      if (next !== this.facing && grounded && Math.abs(this.body.vx) <= PHYS.skidSpeed) {
        this.turnTimer = TURN_TIME
      }
      this.facing = next
    }
    const turning = want !== 0 && Math.sign(want) !== Math.sign(this.body.vx) && this.body.vx !== 0
    if (control > 0) {
      let accel = (turning ? PHYS.turnAccel : PHYS.accel) * control
      if (!grounded) accel *= PHYS.airAccelScale
      const target = maxSpeed * (this.stance === 'crouch' ? PHYS.crouchSpeedScale : 1)
      if (want !== 0) {
        // A slide is never slowed by pushing forward, only steered.
        const cap = this.stance === 'slide' ? Math.max(target, Math.abs(this.body.vx)) : target
        this.body.vx = approach(this.body.vx, want * cap, accel * dt)
      } else if (this.stance !== 'slide') {
        const decel = PHYS.decel * (grounded ? 1 : PHYS.airDecelScale) * control
        // Ice keeps momentum: read the slipperiness of the tile underfoot.
        const under = world.map.flags(Math.floor(this.x / TILE), Math.floor((this.y + 2) / TILE))
        const slip = grounded ? under.slipperiness : 0
        this.body.vx = approach(this.body.vx, 0, decel * dt * (1 - slip))
      }
    }

    // ── Climbing ─────────────────────────────────────────────────────────────
    const onLadder = world.map.anyIn(
      this.x - 3, this.y - this.body.h, 6, this.body.h, (f) => f.climbable,
    )
    if (onLadder && Math.abs(input.axisY) > 0.4 && this.sigTimer <= 0) this.state = 'climb'
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
    } else if (this.sigKind !== 'air-dash' && this.sigKind !== 'phase-dash') {
      this.body.gravityScale = 1
    }

    // ── Walls ────────────────────────────────────────────────────────────────
    this.updateWall(dt, world, grounded, inWater)

    // ── Jump ─────────────────────────────────────────────────────────────────
    if (grounded) {
      this.airJumpsLeft = this.stats.airJumps
      this.stompChain = 0
      this.airDashUsed = false
    }
    // Down + jump on a one-way is a request to fall, not to jump: the press is
    // swallowed so it cannot also be remembered by the buffer.
    const dropRequest = input.pressed.jump && input.held.down && grounded && this.onOneWay(world)
    if (dropRequest) {
      this.dropTimer = 0.2
      this.body.grounded = false
      world.audio.playSfx('bump', { volume: 0.3 })
    }
    tickJumpMemory(this.jumpMem, dt, grounded, input.pressed.jump && !dropRequest)
    if (dropRequest) consumeJump(this.jumpMem)

    if (this.state !== 'climb' && bufferOk(this.jumpMem) && this.sigTimer <= 0) {
      if (inWater) {
        this.body.vy = -PHYS.waterSwimImpulse * agility
        consumeJump(this.jumpMem)
        world.audio.playSfx('swim', { volume: 0.7 })
      } else if (this.stance === 'slide' && grounded) {
        // Jumping out of a slide keeps — and slightly rewards — the momentum.
        this.body.vx *= PHYS.slideJumpBoost
        this.setStance('stand', world, true)
        this.startJump(world, false)
      } else if (this.wallDir !== 0 && !grounded) {
        this.wallJump(world)
      } else if (coyoteOk(this.jumpMem)) {
        this.startJump(world, false)
      } else if (this.airJumpsLeft > 0) {
        this.airJumpsLeft--
        this.startJump(world, true)
      }
    }
    // Releasing jump early cuts the rise — this is variable jump height.
    if (this.jumping && !input.held.jump && this.body.vy < 0) {
      this.body.vy = cutJump(this.body.vy)
      this.jumping = false
    }
    if (this.body.vy >= 0) this.jumping = false

    // ── Attack ───────────────────────────────────────────────────────────────
    if (
      input.pressed.attack && this.attackCooldown <= 0 &&
      this.state === 'normal' && this.sigTimer <= 0 && this.stance !== 'roll'
    ) {
      this.attackTimer = this.stats.attackTime
      this.attackCooldown = this.stats.attackTime + 0.1
      this.play('attack', true)
      world.events.emit('player:attack', { x: this.x, y: this.y, facing: this.facing })
      world.audio.playSfx(attackSound(this.crew))
    }
    if (this.attackTimer > 0) this.attackTimer -= dt

    // ── Gravity ──────────────────────────────────────────────────────────────
    if (this.state !== 'climb') {
      if (inWater) {
        const g = PHYS.gravity * this.body.gravityScale * PHYS.waterGravity
        this.body.vx *= Math.pow(PHYS.waterDrag, dt * 60)
        this.body.vy = clamp(this.body.vy, -PHYS.waterMaxUp * agility, PHYS.waterMaxFall)
        this.body.vy = Math.min(this.body.vy + g * dt, PHYS.waterMaxFall)
      } else {
        this.body.vy = stepJumpGravity(this.body.vy, dt, input.held.jump, this.body.gravityScale)
      }
      if (this.wallDir !== 0 && this.body.vy > 0) {
        // Friction, not a hook: the descent is slowed to a readable crawl and
        // holding down still lets you drop fast.
        const cap = input.axisY > 0.4 ? PHYS.wallSlideSpeedFast : PHYS.wallSlideSpeed
        this.body.vy = Math.min(this.body.vy, cap)
      }
    }

    // ── Move ─────────────────────────────────────────────────────────────────
    const res = moveBody(this.body, world.map, dt, {
      dropThrough: this.dropTimer > 0,
      onHit: (tx, ty, axis, dir) => {
        if (axis === 'y' && dir < 0) this.bumpTile(tx, ty, world)
        else if (axis === 'x' && this.breaksTerrain()) this.smashTile(tx, ty, world)
      },
    })

    if (res.landed) {
      const impact = clamp(res.impactSpeed / PHYS.maxFall, 0, 1)
      this.squash(1 + impact * 0.35, 1 - impact * 0.3)
      world.events.emit('player:land', { x: this.x, y: this.y, speed: res.impactSpeed })
      this.airDashUsed = false
      if (impact > 0.25) {
        world.audio.playSfx('land', { volume: 0.4 + impact * 0.6 })
        world.particles.burst(Math.round(4 + impact * 10), this.x, this.y, {
          speed: 60 + impact * 70, speedVar: 40, angle: -Math.PI / 2, spread: Math.PI * 1.1,
          life: 0.32, lifeVar: 0.12, size: 2, sizeEnd: 0.4,
          color: '#E8E2D2', colorEnd: '#B8B2A2', shape: 'circle', gravity: 120, drag: 0.09,
        })
        if (impact > 0.7) world.shake(0.14 * impact)
      }
      if (this.sigKind === 'dive-kick' && this.sigTimer > 0) this.endSignature(world, true)
    }

    // A dash that runs into a wall ends there rather than grinding on it.
    if (res.hitX && (this.sigKind === 'roll' || this.sigKind === 'phase-dash') && this.sigTimer > 0) {
      this.endSignature(world, true)
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

    // Slide and roll throw dust from the trailing foot.
    if ((this.stance === 'slide' || this.stance === 'roll') && grounded && world.rng.bool(0.7)) {
      world.particles.emit({
        x: this.x - Math.sign(this.body.vx) * 5, y: this.y - 1,
        vx: -Math.sign(this.body.vx) * world.rng.range(30, 80), vy: -world.rng.range(15, 55),
        life: 0.34, size: 2.4, sizeEnd: 0.6, color: '#E8E2D2', colorEnd: '#B8B2A2',
        shape: 'circle', gravity: 110, drag: 0.07,
      })
    }

    // Wall slide sheds sparks of dust off the surface.
    if (this.wallDir !== 0 && this.body.vy > 20 && world.rng.bool(0.55)) {
      world.particles.emit({
        x: this.x + this.wallDir * (this.body.w / 2), y: this.y - world.rng.range(2, this.body.h),
        vx: -this.wallDir * world.rng.range(10, 40), vy: -world.rng.range(0, 30),
        life: 0.3, size: 1.8, sizeEnd: 0.4, color: '#E8E2D2', colorEnd: '#B8B2A2',
        shape: 'circle', gravity: 140, drag: 0.08,
      })
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

    this.updateAnimState(inWater, this.body.grounded, want, turning)
  }

  // ── Stance ─────────────────────────────────────────────────────────────────

  /**
   * Crouch, slide, stand. The rule that matters: standing up is a request, not
   * a command — under a low ceiling it is simply refused, which is what makes
   * a one-tile gap a real passage rather than a trap.
   */
  private updateStance(
    dt: number,
    world: World,
    grounded: boolean,
    inWater: boolean,
    maxSpeed: number,
  ): void {
    const input = world.input
    const wantsDown = input.axisY > 0.45
    const canCrouch = grounded && !inWater && this.state === 'normal' && this.sigTimer <= 0

    if (this.stance === 'roll') {
      // Owned by the signature move; it releases the stance when it ends.
    } else if (this.stance === 'slide') {
      this.slideTimer -= dt
      this.body.vx = approach(this.body.vx, 0, PHYS.slideFriction * dt)
      const tooSlow = Math.abs(this.body.vx) < maxSpeed * 0.28
      if (this.slideTimer <= 0 || tooSlow || inWater) {
        this.setStance(wantsDown && grounded ? 'crouch' : 'stand', world)
      }
    } else if (canCrouch && wantsDown) {
      const fast = Math.abs(this.body.vx) > maxSpeed * PHYS.slideEnterSpeed
      if (fast && this.stance !== 'crouch' && this.slideCooldown <= 0) {
        this.startSlide(world)
      } else if (this.stance !== 'crouch') {
        this.setStance('crouch', world)
      }
    } else if (this.stance === 'crouch' && (!wantsDown || !grounded || inWater)) {
      this.setStance('stand', world)
    }
    this.applyStanceHeight()
    // A tucked body is drawn to fit the space it is actually in: flattened
    // under a lip, but a natural crouch out in the open.
    this.roomAbove = this.stance === 'stand' ? this.standH : this.measureRoom(world)
  }

  /** How much clear height there is above the feet, in world units. */
  private measureRoom(world: World): number {
    const w = Math.max(2, this.body.w - 1)
    const x = this.x - w / 2
    for (let h = 4; h <= this.standH; h += 2) {
      if (world.map.anyIn(x, this.y - h, w, 2, (f) => f.solid)) return h - 2
    }
    return this.standH
  }

  /** Change stance, refusing to stand up where the body would not fit. */
  private setStance(next: Stance, world: World, force = false): void {
    if (this.stance === next) return
    if (next === 'stand' && !force) {
      const fits = headroom(world.map, this.x, this.y, this.body.w, this.standH)
      if (!fits) return
    }
    if (this.stance === 'slide') this.slideCooldown = 0.18
    this.stance = next
    this.applyStanceHeight()
  }

  private startSlide(world: World): void {
    this.stance = 'slide'
    this.slideTimer = PHYS.slideTime
    this.body.vx *= PHYS.slideBoost
    this.applyStanceHeight()
    this.squash(1.25, 0.78)
    world.audio.playSfx('skid', { volume: 0.5 })
    world.particles.burst(8, this.x, this.y, {
      speed: 90, speedVar: 40, angle: Math.PI, spread: 0.9, life: 0.3, size: 2.4, sizeEnd: 0.5,
      color: '#E8E2D2', colorEnd: '#B8B2A2', shape: 'circle', gravity: 120, drag: 0.08,
    })
  }

  // ── Walls ──────────────────────────────────────────────────────────────────

  /**
   * Decide whether the body is clinging to a wall this step.
   *
   * The lockout after a wall jump is the whole trick: without it the stick is
   * still pointing at the wall on the next frame and the character glues
   * straight back onto it, which turns a wall chain into a stutter.
   */
  private updateWall(dt: number, world: World, grounded: boolean, inWater: boolean): void {
    if (grounded || inWater || this.state !== 'normal' || this.stance === 'roll' || this.sigTimer > 0) {
      this.wallDir = 0
      this.wallCoyote = 0
      return
    }
    const push = world.input.axisX
    const dirFromBody = this.body.onWall
    const dirFromPush = push !== 0 && wallAhead(this.body, world.map, Math.sign(push), 3)
      ? (Math.sign(push) as -1 | 1)
      : 0
    const dir = dirFromBody !== 0 ? dirFromBody : dirFromPush
    const holding = dir !== 0 && Math.sign(push) === dir
    const clinging = holding && this.wallLock <= 0 && this.body.vy > -60

    if (clinging) {
      if (this.wallDir === 0) {
        world.particles.burst(5, this.x + dir * 5, this.y - this.body.h * 0.4, {
          speed: 70, speedVar: 30, life: 0.26, size: 2, sizeEnd: 0.4,
          color: '#E8E2D2', colorEnd: '#B8B2A2', shape: 'circle', gravity: 150, drag: 0.08,
        })
      }
      this.wallDir = dir
      this.wallCoyote = PHYS.wallCoyote
      // Face out from the wall: the kick is the next thing that happens.
      this.facing = dir === 1 ? -1 : 1
      this.airJumpsLeft = this.stats.airJumps
    } else {
      this.wallCoyote = Math.max(0, this.wallCoyote - dt)
      if (this.wallCoyote <= 0) this.wallDir = 0
    }
  }

  private wallJump(world: World): void {
    const dir = this.wallDir
    if (dir === 0) return
    this.body.vy = -jumpVelocityFor(PHYS.wallJumpTiles * this.mods.jump)
    this.body.vx = -dir * PHYS.wallJumpX
    this.facing = dir === 1 ? -1 : 1
    this.wallLock = PHYS.wallJumpLock
    this.wallDir = 0
    this.wallCoyote = 0
    this.jumping = true
    consumeJump(this.jumpMem)
    // A wall gives the air options back — that is what makes a shaft climbable.
    this.airDashUsed = false
    this.squash(0.8, 1.26)
    this.play('jump', true)
    world.events.emit('player:jump', { x: this.x, y: this.y, double: true })
    world.audio.playSfx('double-jump')
    world.particles.burst(10, this.x + dir * 5, this.y - this.body.h * 0.45, {
      speed: 120, speedVar: 50, angle: dir === 1 ? 0 : Math.PI, spread: 1.4,
      life: 0.3, size: 2.2, sizeEnd: 0.4, color: '#FFF5E4', colorEnd: '#9AA8C4',
      shape: 'circle', drag: 0.1,
    })
  }

  // ── Signature moves ────────────────────────────────────────────────────────

  private moveControl(): number {
    if (this.wallLock > 0) return 0
    if (this.sigTimer > 0) {
      switch (this.sigKind) {
        case 'grab':
        case 'air-dash':
        case 'phase-dash':
        case 'roll':
          return 0
        case 'haymaker':
          return 0.08
        case 'palm':
        case 'combo':
          return 0.2
        case 'dive-kick':
          return 0.35
        default:
          return 0.7
      }
    }
    if (this.sigRecovery > 0) return this.sigKind === 'haymaker' ? 0.25 : 0.6
    if (this.stance === 'slide') return 0.12
    return 1
  }

  /** True while the current move smashes brick it runs into. */
  private breaksTerrain(): boolean {
    return this.sigTimer > 0 && this.signature.breaksBricks
  }

  /** Seconds left of the turn-around pivot; the sprite flips instantly, the body does not. */
  private turnTimer = 0

  private updateSignature(dt: number, world: World, grounded: boolean, inWater: boolean): void {
    this.sigCooldown = Math.max(0, this.sigCooldown - dt)
    this.comboWindow = Math.max(0, this.comboWindow - dt)
    if (this.comboWindow <= 0) this.comboStep = 0
    if (this.sigRecovery > 0) this.sigRecovery = Math.max(0, this.sigRecovery - dt)

    if (this.sigTimer > 0) {
      this.sigTimer -= dt
      this.tickSignature(dt, world, grounded, inWater)
      if (this.sigTimer <= 0) this.endSignature(world, false)
    } else if (world.input.pressed.dash && this.state === 'normal') {
      // Continuing a combo is not starting a move: the chain has its own
      // window, and the cooldown only guards the first swing of the next one.
      const chaining =
        this.signature.kind === 'combo' && this.comboWindow > 0 && this.comboStep < 3
      if (chaining || (this.sigCooldown <= 0 && this.sigRecovery <= 0)) {
        this.startSignature(world, grounded, inWater)
      }
    }
  }

  private startSignature(world: World, grounded: boolean, inWater: boolean): void {
    const def = this.signature
    if (grounded && !def.ground) return
    if (!grounded && !def.air) return
    // Nothing heavy works while swimming. Jinbe's karate is the exception, and
    // in water it is the strongest thing in the game.
    if (inWater && (def.kind === 'roll' || def.kind === 'haymaker' || def.kind === 'dive-kick')) {
      return
    }
    const dir = this.facing
    this.sigKind = def.kind
    this.sigTimer = def.duration
    this.sigDone = false
    this.sigHits.clear()
    world.events.emit('player:attack', { x: this.x, y: this.y, facing: dir })

    switch (def.kind) {
      case 'grab':
        this.fireGrab(world, def, dir)
        break
      case 'combo':
        this.comboStep = this.comboWindow > 0 ? Math.min(this.comboStep + 1, 3) : 1
        this.comboWindow = 0.42
        world.audio.playSfx('slash', { rate: 0.92 + this.comboStep * 0.12 })
        break
      case 'air-dash':
        if (this.airDashUsed) {
          this.sigTimer = 0
          this.sigKind = null
          return
        }
        this.airDashUsed = true
        this.body.vy = 0
        this.body.vx = dir * def.power
        this.body.gravityScale = 0
        world.audio.playSfx('swim', { rate: 1.5, volume: 0.6 })
        break
      case 'dive-kick':
        this.body.vy = def.power
        this.body.vx *= 0.35
        world.audio.playSfx('kick', { rate: 0.9 })
        break
      case 'shot':
        world.spawn(new Pellet(
          this.x + dir * 7,
          this.y - this.body.h * 0.62,
          dir * def.power,
          def.reach,
          this.stats.accent,
        ))
        world.audio.playSfx('shoot')
        break
      case 'roll':
        this.stance = 'roll'
        this.rollSpin = 0
        this.applyStanceHeight()
        this.body.vx = dir * def.power
        world.audio.playSfx('kick', { rate: 1.3, volume: 0.7 })
        break
      case 'bloom':
        // One step at a time: the old one wilts the moment a new one opens.
        if (this.bloomRef && !this.bloomRef.dead) this.bloomRef.dead = true
        this.body.vy = Math.min(this.body.vy, 30)
        this.bloomRef = world.spawn(new BloomPlatform(
          this.x, this.y + 3, def.reach, def.hold, this.stats.accent,
        ))
        world.audio.playSfx('powerup', { volume: 0.5, rate: 1.2 })
        break
      case 'haymaker':
        this.body.vx *= 0.2
        world.audio.playSfx('gear-shift', { volume: 0.5, rate: 0.8 })
        break
      case 'phase-dash':
        this.body.vx = dir * def.power
        this.body.vy = 0
        this.body.gravityScale = 0
        this.iframes = Math.max(this.iframes, def.duration + 0.06)
        world.audio.playSfx('slash', { rate: 1.25 })
        break
      case 'palm':
        this.body.vx *= 0.3
        world.audio.playSfx('punch', { rate: 0.85 })
        break
    }

    world.spawn(new FloatingText(
      this.x, this.y - this.body.h - 14, def.name.toUpperCase(), this.stats.accent, 0.7,
    ))
    this.play('dash', true)
  }

  private tickSignature(dt: number, world: World, grounded: boolean, inWater: boolean): void {
    const def = this.signature
    const elapsed = def.duration - this.sigTimer
    const dir = this.facing

    switch (def.kind) {
      case 'combo': {
        if (this.sigDone || elapsed < def.duration * 0.3) break
        this.sigDone = true
        const third = this.comboStep >= 3
        const reach = def.reach * (third ? 1.35 : 1) * this.mods.scale
        const box: Rect = third
          ? { x: this.x - reach, y: this.y - this.body.h, w: reach * 2, h: this.body.h }
          : {
              x: dir === 1 ? this.x : this.x - reach,
              y: this.y - this.body.h * 0.9,
              w: reach,
              h: this.body.h * 0.75,
            }
        const hits = this.strike(world, box, third ? 2 : 1, dir, def.power * (third ? 1.4 : 1))
        if (hits > 0) {
          world.hitstop(third ? 9 : 4)
          if (third) world.shake(0.2)
        }
        if (third) {
          world.particles.burst(16, this.x, this.y - this.body.h * 0.55, {
            speed: 180, speedVar: 70, life: 0.28, size: 2.6, sizeEnd: 0.4,
            color: PAL.zoroGreen, colorEnd: PAL.cream, shape: 'spark', additive: true, drag: 0.06,
          })
          this.comboStep = 0
          this.comboWindow = 0
        }
        break
      }
      case 'air-dash': {
        this.body.vx = dir * def.power
        this.body.vy = 0
        world.particles.emit({
          x: this.x - dir * 4, y: this.y - this.body.h * 0.5,
          vx: -dir * 40, vy: world.rng.range(-20, 20),
          life: 0.26, size: 3, sizeEnd: 0.5,
          color: PAL.namiOrange, colorEnd: 'rgba(250,154,60,0)',
          shape: 'smoke', additive: true, behind: true, drag: 0.08,
        })
        break
      }
      case 'dive-kick': {
        if (grounded) break
        this.body.vy = Math.max(this.body.vy, def.power)
        const box: Rect = {
          x: this.x - this.body.w * 0.7,
          y: this.y - 4,
          w: this.body.w * 1.4,
          h: def.reach,
        }
        const hits = this.strike(world, box, def.damage, dir, 60, { lift: -60 })
        if (hits > 0) {
          // The rebound is the point: a connected dive keeps you airborne.
          this.bounce(world, world.input.held.jump)
          world.hitstop(7)
          this.endSignature(world, true)
        }
        break
      }
      case 'roll': {
        this.body.vx = dir * def.power
        // A roll that does not turn is a slide with a different name.
        this.rollSpin += (Math.abs(this.body.vx) * dt) / (this.body.h * 0.5)
        const box = this.rect()
        this.strike(world, box, def.damage, dir, def.power * 0.7, { once: this.sigHits })
        if (!grounded && !groundBelow(this.body, world.map, 6)) {
          // Rolling off a ledge ends the roll rather than launching a missile.
          this.endSignature(world, true)
        }
        break
      }
      case 'phase-dash': {
        this.body.vx = dir * def.power
        this.body.vy = 0
        this.strike(world, this.rect(), def.damage, dir, def.power * 0.4, { once: this.sigHits })
        world.particles.emit({
          x: this.x - dir * 5, y: this.y - this.body.h * world.rng.range(0.2, 0.9),
          vx: -dir * 30, vy: 0, life: 0.3, size: 2.6, sizeEnd: 0.4,
          color: PAL.cream, colorEnd: 'rgba(255,246,232,0)',
          shape: 'smoke', additive: true, behind: true, drag: 0.1,
        })
        break
      }
      case 'haymaker': {
        if (this.sigDone || elapsed < 0.18) break
        this.sigDone = true
        const reach = def.reach * this.mods.scale
        const box: Rect = {
          x: dir === 1 ? this.x : this.x - reach,
          y: this.y - this.body.h * 0.95,
          w: reach,
          h: this.body.h * 0.8,
        }
        const hits = this.strike(world, box, def.damage, dir, def.power, { lift: -180 })
        world.shake(hits > 0 ? 0.34 : 0.16)
        world.hitstop(hits > 0 ? 11 : 3)
        world.audio.playSfx('punch')
        this.smashAhead(world, dir, reach)
        world.particles.burst(18, this.x + dir * reach * 0.6, this.y - this.body.h * 0.55, {
          speed: 200, speedVar: 90, angle: dir === 1 ? 0 : Math.PI, spread: 1.1,
          life: 0.34, lifeVar: 0.12, size: 3, sizeEnd: 0.5,
          color: '#3AC8E0', colorEnd: PAL.cream, shape: 'spark', additive: true, drag: 0.05,
        })
        break
      }
      case 'palm': {
        if (this.sigDone || elapsed < 0.12) break
        this.sigDone = true
        const wet = inWater ? 1.4 : 1
        const reach = def.reach * wet * this.mods.scale
        const box: Rect = {
          x: dir === 1 ? this.x : this.x - reach,
          y: this.y - this.body.h * 0.9,
          w: reach,
          h: this.body.h * 0.7,
        }
        const hits = this.strike(world, box, def.damage, dir, def.power * wet, { lift: -140 })
        world.hitstop(hits > 0 ? 8 : 2)
        if (hits > 0) world.shake(0.18)
        world.particles.burst(14, this.x + dir * reach * 0.5, this.y - this.body.h * 0.55, {
          speed: 170 * wet, speedVar: 60, angle: dir === 1 ? 0 : Math.PI, spread: 0.8,
          life: 0.36, size: 2.6, sizeEnd: 0.5,
          color: PAL.seaLight, colorEnd: PAL.foam, shape: 'circle', additive: true, drag: 0.06,
        })
        break
      }
      default:
        break
    }
  }

  private endSignature(world: World, early: boolean): void {
    const def = this.signature
    if (this.sigKind === 'roll' && this.stance === 'roll') {
      // Stand up if there is room; stay tucked if the roll ended under a lip.
      this.stance = 'crouch'
      this.setStance('stand', world)
    }
    if (this.sigKind === 'air-dash' || this.sigKind === 'phase-dash') {
      this.body.gravityScale = 1
      // Dashes end with speed, not with a wall of air resistance.
      this.body.vx *= 0.62
    }
    this.sigTimer = 0
    this.sigDone = false
    this.sigRecovery = early ? def.recovery * 0.5 : def.recovery
    this.sigCooldown = def.cooldown
    this.sigKind = null
  }

  /**
   * Apply a signature hit box. Damage goes through `Entity.damage`, so enemies
   * keep their own reaction; the knockback is set here because each move pushes
   * differently and that push is most of a move's identity.
   */
  private strike(
    world: World,
    box: Rect,
    amount: number,
    dirX: number,
    knock: number,
    opts: { lift?: number; once?: Set<number> } = {},
  ): number {
    let hits = 0
    for (const e of world.entities) {
      if (e.dead || e === this) continue
      if (!e.tags.has('enemy') && !e.tags.has('boss')) continue
      if (opts.once?.has(e.id)) continue
      if (e.iframes > 0) continue
      if (!rectsOverlap(box, e.hurtbox())) continue
      opts.once?.add(e.id)
      e.damage({ amount, dirX, dirY: 0, sourceId: this.id, kind: 'melee' }, world)
      if (knock > 0 && !e.dead) {
        e.body.vx = dirX * knock
        e.body.vy = Math.min(e.body.vy, opts.lift ?? -110)
      }
      hits++
    }
    return hits
  }

  /** Luffy: reach out, latch the first thing found, and pull one of you. */
  private fireGrab(world: World, def: SignatureDef, dir: number): void {
    const originX = this.x + dir * (this.body.w / 2)
    const originY = this.y - this.body.h * 0.62
    this.armX = originX + dir * def.reach
    this.armY = originY
    this.armT = 0.22

    // Enemies first — a grabbed enemy is worth more than a grabbed wall.
    const target = world.nearest(originX + dir * def.reach * 0.5, originY, def.reach * 0.62, 'enemy')
    if (target && Math.sign(target.x - this.x) === dir) {
      this.armX = target.x
      this.armY = target.y - target.body.h * 0.5
      target.body.vx = -dir * def.power * 0.55
      target.body.vy = -140
      target.damage(
        { amount: def.damage, dirX: -dir, dirY: 0, sourceId: this.id, kind: 'melee' },
        world,
      )
      world.hitstop(7)
      world.audio.playSfx('punch', { rate: 1.1 })
      return
    }

    // Otherwise look for something to reel himself towards.
    const anchor = this.rayToSolid(world, originX, originY, dir, def.reach)
    if (anchor !== null) {
      this.armX = anchor
      this.body.vx = dir * def.power
      this.body.vy = -170
      this.body.gravityScale = 1
      this.wallLock = 0.2
      world.audio.playSfx('swim', { rate: 0.8, volume: 0.6 })
      world.particles.burst(10, anchor, originY, {
        speed: 90, speedVar: 40, life: 0.3, size: 2, sizeEnd: 0.4,
        color: PAL.cream, colorEnd: PAL.mist, shape: 'circle', drag: 0.08,
      })
      return
    }
    world.audio.playSfx('bump', { volume: 0.4 })
  }

  /** Is the tile under the feet a one-way platform? */
  private onOneWay(world: World): boolean {
    const r = this.rect()
    return world.map.anyIn(r.x + 1, r.y + r.h + 0.5, r.w - 2, 2, (f) => f.oneWay)
  }

  /** First solid tile edge along a horizontal ray, in world x, or null. */
  private rayToSolid(world: World, x: number, y: number, dir: number, reach: number): number | null {
    const ty = Math.floor(y / TILE)
    for (let d = 6; d <= reach; d += 3) {
      const px = x + dir * d
      const f = world.map.flags(Math.floor(px / TILE), ty)
      if (f.solid) return px
    }
    return null
  }

  /** Franky: put the wall in front through the wall behind it. */
  private smashAhead(world: World, dir: number, reach: number): void {
    const tx = Math.floor((this.x + dir * (this.body.w / 2 + reach * 0.5)) / TILE)
    for (const ty of [
      Math.floor((this.y - this.body.h * 0.5) / TILE),
      Math.floor((this.y - 4) / TILE),
    ]) {
      this.smashTile(tx, ty, world)
    }
  }

  private smashTile(tx: number, ty: number, world: World): void {
    const id = world.map.get(tx, ty)
    if (id !== Tile.Brick && id !== Tile.Crumble) return
    world.map.set(tx, ty, Tile.Empty)
    world.events.emit('tile:break', { tx, ty })
    world.audio.playSfx('break')
    world.shake(0.12)
    world.particles.burst(14, tx * TILE + TILE / 2, ty * TILE + TILE / 2, {
      speed: 160, speedVar: 70, life: 0.6, lifeVar: 0.2, size: 3, sizeEnd: 1,
      color: PAL.woodLight, colorEnd: PAL.woodDeep, shape: 'shard',
      gravity: 620, drag: 0.02, spin: 9,
    })
  }

  private startJump(world: World, double: boolean): void {
    const v = jumpVelocityFor(this.stats.jumpTiles * this.mods.jump)
    this.body.vy = -v
    this.body.grounded = false
    this.jumping = true
    consumeJump(this.jumpMem)
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
      if (this.tier === 'base' && !this.breaksTerrain()) {
        world.events.emit('tile:bump', { tx, ty })
        world.audio.playSfx('bump')
      } else {
        this.smashTile(tx, ty, world)
      }
    }
  }

  /** Bounce off a stomped enemy. Chains give escalating height and score. */
  bounce(world: World, held: boolean): void {
    this.body.vy = -(held ? PHYS.stompBounceHeld : PHYS.stompBounce)
    this.jumping = held
    this.squash(1.3, 0.72)
    this.stompChain = Math.min(this.stompChain + 1, 5)
    this.airDashUsed = false
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
      this.cancelMoves()
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

  /** Drop everything in flight — used on hurt, death and level end. */
  private cancelMoves(): void {
    this.sigTimer = 0
    this.sigKind = null
    this.sigDone = false
    this.sigRecovery = 0
    this.armT = 0
    this.wallDir = 0
    this.wallCoyote = 0
    this.stance = 'stand'
    this.body.gravityScale = 1
    this.body.h = this.standH
  }

  kill(world: World): void {
    if (this.state === 'dead') return
    this.state = 'dead'
    this.stateTimer = 0
    this.cancelMoves()
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
    this.cancelMoves()
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
    if (this.sigTimer > 0) {
      const kind = this.sigKind
      this.play(kind === 'roll' ? 'crouch' : kind === 'combo' || kind === 'haymaker' || kind === 'palm' ? 'attack' : 'dash')
      return
    }
    if (this.attackTimer > 0) {
      this.play('attack')
      return
    }
    if (inWater) {
      this.play('swim')
      return
    }
    if (this.wallDir !== 0) {
      this.play('skid')
      return
    }
    if (this.stance === 'slide' || this.stance === 'crouch') {
      this.play('crouch')
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
    if (this.turnTimer > 0) {
      this.play('turn')
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
      ctx.ellipse(sx, sy + shadowDrop, 8.5 * scale, 2.6 * scale, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    // Luffy's arm is drawn behind him, so the fist reads as being out there.
    if (this.armT > 0) this.drawArm(rc, sx, sy)

    const frame = this.frame()
    if (!frame || !this.sheet) return
    ctx.save()
    // Pressed against a wall, the body leans into it — a character sliding
    // down a surface they are not touching reads as a bug.
    ctx.translate(sx + this.wallDir * 3, sy)
    ctx.scale(this.squashX * scale, this.squashY * scale)
    if (this.facing === -1) ctx.scale(-1, 1)
    if (this.wallDir !== 0) {
      // Shoulder into the surface. The rig has no wall pose, so the cling is
      // carried by the skid frame tipped back against the wall.
      ctx.translate(0, -this.body.h / scale / 2)
      ctx.rotate(this.wallDir * this.facing * 0.13)
      ctx.translate(0, this.body.h / scale / 2)
    }
    // A tucked body must actually fit the hole it claims to fit: measure the
    // drawn height of the frame and squash it into the stance hitbox, rather
    // than guessing a constant that clips through a one-tile ceiling.
    if (this.stance !== 'stand') {
      const drawnH = Math.max(1, -frame.oy)
      // Fit to the headroom, not to the hitbox: the hitbox is a promise about
      // where the body cannot go, and squashing to it in the open would draw a
      // pancake standing in a field.
      const tuck = this.stance === 'crouch' ? 1 : 0.82
      const room = Math.min(drawnH * tuck, this.roomAbove / scale)
      const k = clamp(room / drawnH, 0.45, 1)
      ctx.scale(1 + (1 - k) * 0.45, k)
      if (this.stance === 'roll') {
        const r = drawnH * 0.5
        ctx.translate(0, -r)
        ctx.rotate(this.rollSpin)
        ctx.translate(0, r)
      } else if (this.stance === 'slide') {
        // Weight back, legs first.
        ctx.rotate(-0.2)
      }
    }
    ctx.drawImage(
      this.sheet.image,
      frame.sx, frame.sy, frame.sw, frame.sh,
      frame.ox, frame.oy, frame.w, frame.h,
    )
    if (this.flash > 0.01) {
      ctx.globalCompositeOperation = 'source-atop'
      ctx.globalAlpha = this.flash
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(frame.ox, frame.oy, frame.w, frame.h)
    }
    ctx.restore()
  }

  /** The stretched arm: a tapering limb with an ink line and a fist. */
  private drawArm(rc: RenderContext, sx: number, sy: number): void {
    const { ctx } = rc
    const t = clamp(this.armT / 0.22, 0, 1)
    const shoulderX = sx + this.facing * 3
    const shoulderY = sy - this.body.h * 0.62
    const endX = shoulderX + (this.armX - this.x) * t
    const endY = shoulderY + (this.armY - (this.y - this.body.h * 0.62)) * t
    const skin = cel(PAL.skin)
    ctx.save()
    ctx.lineCap = 'round'
    ctx.strokeStyle = skin.line
    ctx.lineWidth = 5.4
    ctx.beginPath()
    ctx.moveTo(shoulderX, shoulderY)
    ctx.lineTo(endX, endY)
    ctx.stroke()
    ctx.strokeStyle = skin.core
    ctx.lineWidth = 4
    ctx.stroke()
    ctx.strokeStyle = skin.light
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(shoulderX, shoulderY - 1.1)
    ctx.lineTo(endX, endY - 1.1)
    ctx.stroke()
    ctx.fillStyle = skin.core
    ctx.strokeStyle = skin.line
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(endX, endY, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Player-owned entities
// ─────────────────────────────────────────────────────────────────────────────

/** Usopp's shot. Flat, fast, one hit, and gone when it touches anything. */
export class Pellet extends Entity {
  readonly kind = 'projectile'
  private travelled = 0
  private tint: string

  constructor(x: number, y: number, vx: number, private range: number, tint: string = PAL.usoppBrown) {
    super(x, y, 5, 5)
    this.body.vx = vx
    this.body.vy = -18
    this.tint = tint
    this.depth = 95
    this.tags.add('player-shot')
  }

  update(dt: number, world: World): void {
    this.age += dt
    // A slight arc: the drop is what makes the range read as distance.
    this.body.vy += 120 * dt
    const before = this.body.x
    const res = moveBody(this.body, world.map, dt, { useSlopes: false })
    this.travelled += Math.abs(this.body.x - before)
    if (res.hitX || res.hitY || this.travelled > this.range) {
      this.burst(world)
      return
    }
    for (const e of world.entities) {
      if (e.dead || e.iframes > 0) continue
      if (!e.tags.has('enemy') && !e.tags.has('boss')) continue
      if (!rectsOverlap(this.rect(), e.hurtbox())) continue
      e.damage(
        { amount: 1, dirX: Math.sign(this.body.vx), dirY: 0, sourceId: this.id, kind: 'projectile' },
        world,
      )
      world.hitstop(3)
      this.burst(world)
      return
    }
  }

  private burst(world: World): void {
    this.dead = true
    world.particles.burst(7, this.x, this.y - 2, {
      speed: 90, speedVar: 40, life: 0.24, size: 2, sizeEnd: 0.3,
      color: this.tint, colorEnd: PAL.cream, shape: 'spark', additive: true, drag: 0.06,
    })
  }

  draw(rc: RenderContext, sx: number, sy: number): void {
    const { ctx } = rc
    const c = cel(this.tint)
    const dir = Math.sign(this.body.vx) || 1
    ctx.save()
    ctx.translate(sx, sy - 2)
    ctx.fillStyle = c.core
    ctx.beginPath()
    ctx.ellipse(0, 0, 3.4, 2.2, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = c.light
    ctx.beginPath()
    ctx.ellipse(-dir * 0.6, -0.7, 1.6, 0.9, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.5
    ctx.fillStyle = PAL.ember
    ctx.beginPath()
    ctx.ellipse(-dir * 4, 0, 4, 1.4, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

/**
 * Robin's step: a short-lived platform grown out of nothing.
 *
 * It carries its own support test rather than writing into the tilemap,
 * because the tilemap is shared level data and this thing lasts two seconds.
 */
export class BloomPlatform extends Entity {
  readonly kind = 'platform'
  private life: number
  private tint: string

  constructor(x: number, y: number, width: number, life: number, tint: string = '#7E5CA8') {
    super(x, y, width, 6)
    this.life = life
    this.tint = tint
    this.depth = 46
    this.body.collidesWithTiles = false
    this.cullable = false
    this.tags.add('platform')
  }

  update(dt: number, world: World): void {
    this.age += dt
    if (this.age >= this.life) {
      this.dead = true
      return
    }
    const top = this.body.y - this.body.h
    for (const e of world.entities) {
      if (e === this || e.dead || !e.body.collidesWithTiles) continue
      if (!e.tags.has('player')) continue
      const r = e.rect()
      const feet = r.y + r.h
      const overlapsX =
        r.x < this.body.x + this.body.w / 2 && r.x + r.w > this.body.x - this.body.w / 2
      // Catch the feet on the way down only, so she can jump up through it.
      if (!overlapsX || e.body.vy < 0) continue
      if (feet < top - 1 || feet > top + 7) continue
      e.body.y = top
      e.body.vy = 0
      e.body.grounded = true
    }
  }

  draw(rc: RenderContext, sx: number, sy: number): void {
    const { ctx } = rc
    const c = cel(this.tint)
    const fade = clamp((this.life - this.age) / 0.4, 0, 1)
    const grow = clamp(this.age / 0.12, 0, 1)
    const w = this.body.w * grow
    ctx.save()
    ctx.globalAlpha = fade
    ctx.translate(sx, sy - this.body.h)
    // A row of petals, each one a little different — a repeated stamp reads as
    // a texture, not as a thing that grew.
    const n = Math.max(3, Math.round(w / 9))
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1)
      const px = (t - 0.5) * w
      const r = 4.6 + Math.sin(i * 2.1) * 1.1
      const lift = Math.sin(i * 1.7) * 1.2
      ctx.fillStyle = c.shade
      ctx.beginPath()
      ctx.ellipse(px, 2 + lift, r, r * 0.62, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = c.core
      ctx.beginPath()
      ctx.ellipse(px, 0.6 + lift, r, r * 0.6, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = c.light
      ctx.beginPath()
      ctx.ellipse(px - r * 0.25, -0.6 + lift, r * 0.5, r * 0.3, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.strokeStyle = c.line
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(-w / 2, 3.4)
    ctx.lineTo(w / 2, 3.4)
    ctx.stroke()
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
