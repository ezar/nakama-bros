import type { Hit, Rect, RenderContext } from '../../types'
import { TILE } from '../../types'
import { Enemy, EnemyProjectile, type EnemyState } from './Enemy'
import { Entity } from './Entity'
import type { World } from '../world'
import { registerEntity } from './registry'
import { PHYS } from '../config'
import { edgeAhead, wallAhead } from '../../physics/move'
import { PAL } from '../../art/palette'
import { cel, mix, rgba } from '../../art/color'
import { clamp, clamp01, rectsOverlap } from '../../engine/math'
import { EMITTERS, type EmitterOpts } from '../../render/particles'
import type { Player } from './Player'

/**
 * The enemy roster.
 *
 * Every type here is a variation on one contract, which lives in `Enemy`:
 * an attack is always announced by a wind-up you can read, always followed by a
 * beat where the enemy is open, and always beaten by the same two verbs — land
 * on it, or hit it. What changes between them is *what the wind-up means*: the
 * officer's is "get out of the lane", the cannon's is "the arc is already
 * decided", the puffer's is "that is no longer a floor".
 *
 * Nothing in this file draws its own body unless it has to. Sprites come from
 * the art layer by key; if a key is not built yet the base class paints a
 * cel-shaded stand-in, so an unfinished art pass never takes the game down.
 */

/** Run a named emitter if the VFX library has it. A missing name is a no-op. */
function fx(world: World, name: string, x: number, y: number, opts?: EmitterOpts): void {
  EMITTERS[name]?.(world.particles, x, y, opts)
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared projectiles
// ─────────────────────────────────────────────────────────────────────────────

/** A thrown knife. Spins, arcs slightly, sticks nothing. */
export class Knife extends EnemyProjectile {
  private spin = 0
  constructor(x: number, y: number, vx: number, vy: number) {
    super(x, y, 8, 4, 0.35)
    this.body.vx = vx
    this.body.vy = vy
    this.accent = PAL.steel
    this.swattable = true
  }

  protected onFly(dt: number, _world: World): void {
    this.spin += dt * 14
  }

  draw(rc: RenderContext, sx: number, sy: number): void {
    const { ctx } = rc
    // A thrown blade tumbles; a knife that points along its velocity reads as a
    // dart. The tumble is what makes the arc legible at this size.
    const angle = Math.atan2(this.body.vy, this.body.vx) + Math.sin(this.spin) * 0.5
    const c = cel(PAL.steel)
    ctx.save()
    ctx.translate(sx, sy - 2)
    ctx.rotate(angle)
    ctx.fillStyle = c.core
    ctx.beginPath()
    ctx.moveTo(-3, -1.6)
    ctx.lineTo(5.5, -0.4)
    ctx.lineTo(5.5, 0.4)
    ctx.lineTo(-3, 1.6)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = c.light
    ctx.fillRect(-2, -1.5, 7, 0.7)
    ctx.fillStyle = cel(PAL.woodDeep).core
    ctx.fillRect(-6, -1.5, 3.4, 3)
    ctx.strokeStyle = c.line
    ctx.lineWidth = 0.5
    ctx.strokeRect(-6, -1.5, 3.4, 3)
    ctx.restore()
  }
}

/**
 * An expanding blast.
 *
 * Split out from the cannonball because four different things in the game need
 * "a circle of harm that grows and is gone in a third of a second": the shell,
 * the boss defeat chain, a powder keg, a lightning ground-strike.
 */
export class Blast extends Entity {
  readonly kind = 'projectile'
  private radius: number
  private hurts: boolean
  private hit = false
  private life = 0.34
  private color: string

  constructor(x: number, y: number, radius = 26, hurts = true, color: string = PAL.ember) {
    super(x, y, radius * 2, radius * 2)
    this.radius = radius
    this.hurts = hurts
    this.color = color
    this.depth = 78
    this.body.collidesWithTiles = false
    this.tags.add('hazard')
  }

  update(dt: number, world: World): void {
    this.age += dt
    if (this.age >= this.life) {
      this.dead = true
      return
    }
    if (!this.hurts || this.hit) return
    const p = world.player() as Player | null
    if (!p || p.dead) return
    const dx = p.x - this.x
    const dy = p.y - p.body.h * 0.5 - this.y
    if (Math.hypot(dx, dy) > this.radius) return
    this.hit = true
    p.hurt(world, {
      amount: 1,
      dirX: dx >= 0 ? 1 : -1,
      dirY: -1,
      sourceId: this.id,
      kind: 'explosion',
    })
  }

  /** Fire the visible and felt half of the explosion. Call once, on spawn. */
  detonate(world: World, power = 1): void {
    world.audio.playSfx('explosion', { volume: 0.7 * power })
    world.hitstop(Math.round(6 * power))
    world.shake(0.34 * power)
    fx(world, 'boss-explosion', this.x, this.y, { scale: this.radius / 26, power })
    world.particles.burst(20, this.x, this.y, {
      speed: 190 * power, speedVar: 90, life: 0.42, lifeVar: 0.16, size: 3.4, sizeEnd: 0.4,
      color: this.color, colorEnd: PAL.danger, shape: 'spark', additive: true,
      drag: 0.05, spin: 8, spawnRadius: this.radius * 0.4,
    })
    world.particles.burst(Math.max(3, Math.round(12 * power)), this.x, this.y, {
      speed: 70 * power, speedVar: 40, life: 0.5 + 0.3 * power, lifeVar: 0.2,
      size: 3 * power, sizeEnd: 9 * power,
      color: mix(PAL.mist, PAL.slate, 0.4), colorEnd: rgba(PAL.slate, 0),
      shape: 'smoke', drag: 0.12, spawnRadius: this.radius * 0.5,
    })
  }

  draw(rc: RenderContext, sx: number, sy: number): void {
    const { ctx } = rc
    const t = clamp01(this.age / this.life)
    const r = this.radius * (0.35 + t * 0.85)
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = (1 - t) * 0.85
    ctx.strokeStyle = this.color
    ctx.lineWidth = 3 * (1 - t) + 0.6
    ctx.beginPath()
    ctx.arc(sx, sy, r, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = (1 - t) * 0.4
    ctx.fillStyle = mix(this.color, PAL.white, 0.5)
    ctx.beginPath()
    ctx.arc(sx, sy, r * 0.55, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

/** A cannon shell. Arcs, and the arc is the warning. */
export class Cannonball extends EnemyProjectile {
  private blastRadius: number

  constructor(x: number, y: number, vx: number, vy: number, blastRadius = 28) {
    super(x, y, 9, 9, 1)
    this.body.vx = vx
    this.body.vy = vy
    this.blastRadius = blastRadius
    this.accent = PAL.ink
    this.maxAge = 6
    this.damageAmount = 1
  }

  protected onFly(_dt: number, world: World): void {
    if (world.rng.bool(0.5)) {
      world.particles.emit({
        x: this.x, y: this.y, vx: world.rng.range(-14, 14), vy: world.rng.range(-30, -8),
        life: 0.45, size: 2.4, sizeEnd: 6, color: mix(PAL.mist, PAL.slate, 0.5),
        colorEnd: rgba(PAL.slate, 0), shape: 'smoke', drag: 0.1,
      })
    }
  }

  protected expire(world: World, _onTerrain: boolean): void {
    this.dead = true
    const b = world.spawn(new Blast(this.x, this.y, this.blastRadius))
    b.detonate(world, 1)
  }

  draw(rc: RenderContext, sx: number, sy: number): void {
    const { ctx } = rc
    const c = cel(PAL.inkSoft)
    ctx.save()
    ctx.translate(sx, sy)
    ctx.fillStyle = c.core
    ctx.beginPath()
    ctx.arc(0, 0, 4.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = c.shade
    ctx.beginPath()
    ctx.arc(0.9, 1, 4.5, -0.5, Math.PI * 0.9)
    ctx.fill()
    ctx.fillStyle = rgba(PAL.cream, 0.8)
    ctx.beginPath()
    ctx.arc(-1.5, -1.6, 1.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = c.line
    ctx.lineWidth = 0.7
    ctx.beginPath()
    ctx.arc(0, 0, 4.5, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }
}

/** A water bullet — fishman karate at range. Fast, flat, no arc. */
export class WaterShot extends EnemyProjectile {
  constructor(x: number, y: number, vx: number, vy: number) {
    super(x, y, 10, 6, 0)
    this.body.vx = vx
    this.body.vy = vy
    this.accent = PAL.seaLight
    this.maxAge = 2.2
    this.swattable = true
  }

  protected onFly(_dt: number, world: World): void {
    world.particles.emit({
      x: this.x, y: this.y, vx: 0, vy: 0, life: 0.22, size: 2.6, sizeEnd: 0.4,
      color: PAL.foam, colorEnd: rgba(PAL.seaLight, 0), shape: 'droplet', additive: true,
    })
  }

  protected expire(world: World, _onTerrain: boolean): void {
    this.dead = true
    fx(world, 'water-splash', this.x, this.y, { count: 0.7 })
    world.particles.burst(9, this.x, this.y, {
      speed: 90, speedVar: 50, life: 0.3, size: 2.2, sizeEnd: 0.3,
      color: PAL.foam, colorEnd: rgba(PAL.seaLight, 0), shape: 'droplet',
      gravity: 260, drag: 0.05,
    })
  }

  draw(rc: RenderContext, sx: number, sy: number): void {
    const { ctx } = rc
    ctx.save()
    ctx.translate(sx, sy)
    ctx.rotate(Math.atan2(this.body.vy, this.body.vx))
    ctx.fillStyle = PAL.sea
    ctx.beginPath()
    ctx.ellipse(0, 0, 6.5, 3, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = PAL.seaLight
    ctx.beginPath()
    ctx.ellipse(-0.8, -0.6, 5, 1.9, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = PAL.foam
    ctx.beginPath()
    ctx.ellipse(1.8, -0.7, 2, 0.9, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

/**
 * A shockwave that runs along the floor.
 *
 * It is the answer to "how does a ground-pound threaten someone standing 60
 * units away" — it follows the surface, so the counter-play is to jump, and
 * that is the only counter-play. It dies at a wall or a ledge.
 */
export class Shockwave extends Entity {
  readonly kind = 'projectile'
  private hit = false
  private color: string

  constructor(x: number, y: number, dir: 1 | -1, speed = 150, color: string = PAL.dirt) {
    super(x, y, 14, 16)
    this.facing = dir
    this.body.vx = dir * speed
    this.body.collidesWithTiles = false
    this.depth = 66
    this.color = color
    this.tags.add('hazard')
  }

  update(dt: number, world: World): void {
    this.age += dt
    this.body.px = this.body.x
    this.body.py = this.body.y
    this.body.x += this.body.vx * dt

    // Ride the surface: step down one tile at a time, and give up where the
    // floor does.
    const tx = Math.floor(this.body.x / TILE)
    const ty = Math.floor((this.body.y + 2) / TILE)
    if (world.map.flags(tx, ty).solid) this.body.y = ty * TILE
    else if (world.map.flags(tx, ty + 1).solid) this.body.y = (ty + 1) * TILE
    else {
      this.dead = true
      return
    }
    if (world.map.flags(tx, Math.floor((this.body.y - 8) / TILE)).solid || this.age > 2.4) {
      this.dead = true
      return
    }

    world.particles.emit({
      x: this.x + world.rng.range(-5, 5), y: this.y - 1,
      vx: world.rng.range(-20, 20), vy: world.rng.range(-70, -20),
      life: 0.4, size: 2.6, sizeEnd: 6, color: mix(this.color, PAL.cream, 0.45),
      colorEnd: rgba(this.color, 0), shape: 'puff', gravity: 120, drag: 0.1,
    })

    if (this.hit) return
    const p = world.player() as Player | null
    if (!p || p.dead) return
    if (!rectsOverlap({ x: this.x - 8, y: this.y - 16, w: 16, h: 16 }, p.rect())) return
    this.hit = true
    p.hurt(world, {
      amount: 1, dirX: this.facing, dirY: -1, sourceId: this.id, kind: 'melee',
    })
  }

  draw(rc: RenderContext, sx: number, sy: number): void {
    const { ctx } = rc
    const t = clamp01(this.age / 2.4)
    const h = 21 * (1 - t * 0.4)
    ctx.save()
    ctx.translate(sx, sy)
    ctx.scale(this.facing, 1)
    ctx.globalAlpha = 1 - t * 0.45
    const c = cel(this.color)
    const crest = new Path2D()
    crest.moveTo(-9, 0)
    crest.quadraticCurveTo(-3, -h * 0.85, 2, -h)
    crest.quadraticCurveTo(6, -h * 0.45, 9, 0)
    crest.closePath()
    ctx.fillStyle = c.core
    ctx.fill(crest)
    ctx.save()
    ctx.clip(crest)
    ctx.fillStyle = c.shade
    ctx.beginPath()
    ctx.moveTo(1, -h - 2)
    ctx.lineTo(11, -h * 0.3)
    ctx.lineTo(11, 1)
    ctx.lineTo(-1, 1)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    // A lit lip along the leading face — without it the wave disappears into
    // whatever it is travelling over.
    ctx.strokeStyle = mix(c.light, PAL.white, 0.55)
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(-6, -1)
    ctx.quadraticCurveTo(-2, -h * 0.8, 2, -h + 1)
    ctx.stroke()
    ctx.strokeStyle = c.line
    ctx.lineWidth = 0.9
    ctx.stroke(crest)
    ctx.restore()
  }
}

/** A puffer spine, fired in a ring when the fish pops. */
export class Spine extends EnemyProjectile {
  constructor(x: number, y: number, vx: number, vy: number) {
    super(x, y, 5, 5, 0.5)
    this.body.vx = vx
    this.body.vy = vy
    this.accent = PAL.gold
    this.maxAge = 1.4
  }

  draw(rc: RenderContext, sx: number, sy: number): void {
    const { ctx } = rc
    ctx.save()
    ctx.translate(sx, sy)
    ctx.rotate(Math.atan2(this.body.vy, this.body.vx))
    ctx.fillStyle = PAL.cream
    ctx.beginPath()
    ctx.moveTo(4, 0)
    ctx.lineTo(-3, -1.7)
    ctx.lineTo(-3, 1.7)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = cel(PAL.gold).line
    ctx.lineWidth = 0.5
    ctx.stroke()
    ctx.restore()
  }
}

/** A slow homing cloud-bolt. Skypiea's ranged threat: it corners you. */
export class SkyBolt extends EnemyProjectile {
  private homing: number

  constructor(x: number, y: number, vx: number, vy: number, homing = 1.6) {
    super(x, y, 10, 10, 0)
    this.body.vx = vx
    this.body.vy = vy
    this.homing = homing
    this.accent = PAL.magic
    this.maxAge = 3.4
    this.swattable = true
  }

  protected onFly(dt: number, world: World): void {
    const p = world.player()
    if (p) {
      const dx = p.x - this.x
      const dy = p.y - p.body.h * 0.5 - this.y
      const d = Math.hypot(dx, dy) || 1
      const speed = Math.hypot(this.body.vx, this.body.vy) || 90
      const k = Math.min(1, this.homing * dt)
      this.body.vx += ((dx / d) * speed - this.body.vx) * k
      this.body.vy += ((dy / d) * speed - this.body.vy) * k
    }
    world.particles.emit({
      x: this.x, y: this.y, vx: 0, vy: 0, life: 0.3, size: 3, sizeEnd: 0.3,
      color: PAL.magic, colorEnd: rgba(PAL.cream, 0), shape: 'glow', additive: true,
    })
  }

  draw(rc: RenderContext, sx: number, sy: number): void {
    const { ctx } = rc
    ctx.save()
    ctx.translate(sx, sy)
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = rgba(PAL.magic, 0.5)
    ctx.beginPath()
    ctx.arc(0, 0, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = PAL.magic
    ctx.beginPath()
    ctx.arc(0, 0, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = PAL.white
    ctx.beginPath()
    ctx.arc(-1, -1.2, 1.6, 0, Math.PI * 2)
    ctx.fill()
    // Two crackling arms, redrawn each frame so it never looks like a decal.
    ctx.strokeStyle = rgba(PAL.cream, 0.9)
    ctx.lineWidth = 0.8
    for (let i = 0; i < 2; i++) {
      const a = this.age * 9 + i * Math.PI
      ctx.beginPath()
      ctx.moveTo(Math.cos(a) * 3, Math.sin(a) * 3)
      ctx.lineTo(Math.cos(a + 0.6) * 7, Math.sin(a + 0.6) * 7)
      ctx.lineTo(Math.cos(a + 0.3) * 9.5, Math.sin(a + 0.3) * 9.5)
      ctx.stroke()
    }
    ctx.restore()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Marines
// ─────────────────────────────────────────────────────────────────────────────

/** Marine grunt — the metronome. Walks, turns at ledges, dies to a stomp. */
export class Grunt extends Enemy {
  sheetKey = 'grunt'
  constructor(x: number, y: number) {
    super(x, y, 14, 26)
    this.speed = 32
    this.accent = PAL.marineBlue
    this.loot = [{ type: 'berry', chance: 0.25 }]
  }
}

/**
 * Shield Marine — a wall with legs.
 *
 * Frontal attacks ring off the shield, so the reads are: get above it, get
 * behind it, or bait the bash and punish the recovery.
 */
export class Shielder extends Enemy {
  sheetKey = 'shielder'
  constructor(x: number, y: number) {
    super(x, y, 15, 28)
    this.speed = 22
    this.health = 2
    this.points = 400
    this.accent = PAL.marineNavy
    this.aggressive = true
    this.sightRange = 110
    this.alertTime = 0.5
    this.attackTime = 0.35
    this.recoverTime = 0.85
    this.attackCooldown = 1.1
    this.loot = [{ type: 'berry', chance: 0.4 }]
  }

  protected onEnterState(next: EnemyState, prev: EnemyState, world: World): void {
    super.onEnterState(next, prev, world)
    if (next === 'attack') {
      // The bash: short, committed, and it leaves the shield out of position.
      this.body.vx = this.facing * 190
      world.audio.playSfx('bump', { volume: 0.6, rate: 0.8 })
      fx(world, 'run-dust', this.x, this.y, { facing: this.facing, count: 1.4 })
    }
  }

  protected strikeBox(): Rect | null {
    return this.reachBox(12)
  }

  damage(hit: Hit, world: World): boolean {
    // The shield faces forward: a hit from the front is deflected. A stomp and
    // anything from behind go straight through.
    const fromFront = Math.sign(hit.dirX) === -this.facing
    if (fromFront && hit.kind !== 'stomp' && this.state !== 'recover') {
      this.flash = 0.4
      world.audio.playSfx('bump')
      world.hitstop(3)
      world.particles.burst(8, this.x + this.facing * 8, this.y - 14, {
        speed: 110, speedVar: 50, life: 0.28, size: 2.2, sizeEnd: 0.3,
        color: PAL.cream, colorEnd: PAL.gold, shape: 'spark', additive: true, drag: 0.1,
      })
      return false
    }
    return super.damage(hit, world)
  }
}

/**
 * Marine officer — the charger.
 *
 * Sees you down a corridor, plants his feet, and runs the whole lane. The tell
 * is long on purpose: this attack is meant to be dodged, and a dodged charge
 * ends with an officer face-first in a wall.
 */
export class MarineOfficer extends Enemy {
  sheetKey = 'marine-officer'
  private charge = 0

  constructor(x: number, y: number) {
    super(x, y, 16, 32)
    this.speed = 30
    this.health = 2
    this.points = 500
    this.accent = PAL.marineNavy
    this.aggressive = true
    this.sightRange = 190
    this.sightHalfAngle = 0.5
    this.alertTime = 0.55
    this.attackTime = 0.7
    this.recoverTime = 1
    this.attackCooldown = 1.2
    this.loot = [{ type: 'berry', chance: 0.6, count: 2, spread: 12 }]
  }

  protected onAlert(dt: number, world: World): void {
    super.onAlert(dt, world)
    this.body.vx *= 0.5
    // Dust gathers under the back foot as he loads the charge.
    if (world.rng.bool(0.3)) {
      world.particles.emit({
        x: this.x - this.facing * 5, y: this.y - 1,
        vx: -this.facing * world.rng.range(10, 40), vy: world.rng.range(-30, -6),
        life: 0.35, size: 2, sizeEnd: 5, color: mix(PAL.cream, PAL.mist, 0.4),
        colorEnd: rgba(PAL.mist, 0), shape: 'puff', drag: 0.1,
      })
    }
  }

  protected onEnterState(next: EnemyState, prev: EnemyState, world: World): void {
    super.onEnterState(next, prev, world)
    if (next === 'attack') {
      this.charge = 0
      this.body.vx = this.facing * 270
      world.audio.playSfx('slash', { volume: 0.55, rate: 1.2 })
      world.shake(0.06)
      fx(world, 'dash-streak', this.x, this.y - this.body.h * 0.5, { facing: this.facing })
    }
  }

  protected onAttack(dt: number, world: World): void {
    this.charge += dt
    this.body.vx = this.facing * 270
    this.playFirst('attack', 'run')
    if (world.rng.bool(0.6)) {
      fx(world, 'run-dust', this.x, this.y, { facing: this.facing, count: 0.6 })
    }
    // Running into a wall is the punish: he stops himself the hard way.
    if (wallAhead(this.body, world.map, this.facing)) this.crash(world)
    else if (this.body.grounded && edgeAhead(this.body, world.map, this.facing)) {
      this.body.vx *= 0.2
    }
  }

  private crash(world: World): void {
    world.audio.playSfx('bump', { volume: 0.9, rate: 0.7 })
    world.shake(0.22)
    world.hitstop(5)
    world.particles.burst(14, this.x + this.facing * 8, this.y - this.body.h * 0.6, {
      speed: 150, speedVar: 70, life: 0.4, size: 2.4, sizeEnd: 0.4,
      color: PAL.cream, colorEnd: PAL.mist, shape: 'spark', additive: true,
      angle: this.facing === 1 ? Math.PI : 0, spread: 2.2, drag: 0.06,
    })
    this.body.vx = -this.facing * 60
    this.knockback(world, -this.facing, 60, 1.1, -80)
  }

  protected strikeBox(): Rect | null {
    return this.reachBox(20, this.body.h * 0.8)
  }
}

/**
 * Mounted cannon — the shot that is already decided.
 *
 * It aims where you are when the fuse lights, not where you are when the shell
 * lands, so the counter-play is simply to keep moving after you see the spark.
 */
export class MarineCannon extends Enemy {
  sheetKey = 'marine-cannon'
  private aim = { x: 0, y: 0 }

  constructor(x: number, y: number) {
    super(x, y, 20, 20)
    this.speed = 0
    this.health = 2
    this.points = 450
    this.accent = PAL.ember
    this.aggressive = true
    this.state = 'idle'
    this.sightRange = 260
    this.sightHalfAngle = 0.85
    this.alertTime = 0.75
    this.attackTime = 0.2
    this.recoverTime = 1.1
    this.attackCooldown = 1.3
    this.contactDamage = false
    this.knockbackResist = 1
    this.loot = [{ type: 'berry', chance: 0.5 }]
  }

  protected onAlert(dt: number, world: World): void {
    super.onAlert(dt, world)
    const p = world.player()
    if (p) this.aim = { x: p.x, y: p.y - p.body.h * 0.5 }
    // The fuse. Sparks where the powder is, once the barrel has stopped moving.
    if (world.rng.bool(0.5)) {
      world.particles.emit({
        x: this.x - this.facing * 7, y: this.y - 14,
        vx: world.rng.range(-30, 30), vy: world.rng.range(-70, -20),
        life: 0.3, size: 1.6, sizeEnd: 0.2, color: PAL.gold, colorEnd: PAL.danger,
        shape: 'spark', additive: true, gravity: 120,
      })
    }
  }

  protected onEnterState(next: EnemyState, prev: EnemyState, world: World): void {
    super.onEnterState(next, prev, world)
    if (next !== 'attack') return
    const mx = this.x + this.facing * 12
    const my = this.y - 13
    const dx = this.aim.x - mx
    const dy = this.aim.y - my
    // Solve the arc from an apex, not from a fixed flight time: a fixed time
    // turns a shot across the room into a mortar and a shot at your feet into
    // a rocket. The apex grows with range, so the shell is always readable in
    // the air for about the same beat.
    const g = PHYS.gravity
    const apex = clamp(34 + Math.abs(dx) * 0.22, 34, 130)
    const vy = -Math.sqrt(2 * g * apex)
    const disc = vy * vy + 2 * g * dy
    const flight = disc > 0 ? (-vy + Math.sqrt(disc)) / g : -vy / g
    const vx = clamp(dx / Math.max(0.25, flight), -320, 320)
    world.spawn(new Cannonball(mx, my, vx, vy))
    world.audio.playSfx('explosion', { volume: 0.45, rate: 1.4 })
    world.shake(0.16)
    this.squash(1.24, 0.8)
    fx(world, 'cannon-smoke', mx, my, { dirX: this.facing, dirY: -0.3 })
    world.particles.burst(12, mx, my, {
      speed: 150, speedVar: 60, life: 0.32, size: 2.6, sizeEnd: 0.4,
      angle: this.facing === 1 ? -0.5 : Math.PI + 0.5, spread: 1,
      color: PAL.gold, colorEnd: PAL.danger, shape: 'spark', additive: true, drag: 0.06,
    })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sea life
// ─────────────────────────────────────────────────────────────────────────────

/** Cannon crab — sidles fast and never leaves its ledge. */
export class Crab extends Enemy {
  sheetKey = 'crab'
  constructor(x: number, y: number) {
    super(x, y, 18, 15)
    this.speed = 58
    this.points = 300
    this.accent = PAL.bloodOrange
  }
}

/** Fishman — patrols, then leaps when you come into range. */
export class Fishman extends Enemy {
  sheetKey = 'fishman'
  constructor(x: number, y: number) {
    super(x, y, 15, 30)
    this.speed = 40
    this.health = 2
    this.points = 400
    this.accent = PAL.fishmanTeal
    this.aggressive = true
    this.sightRange = 120
    this.sightHalfAngle = 1
    this.alertTime = 0.35
    this.attackTime = 0.9
    this.recoverTime = 0.5
    this.attackCooldown = 0.9
    this.loot = [{ type: 'berry', chance: 0.35 }]
  }

  protected wantsToAttack(world: World): boolean {
    return super.wantsToAttack(world) && this.body.grounded && this.distToPlayer(world) < 110
  }

  protected onEnterState(next: EnemyState, prev: EnemyState, world: World): void {
    super.onEnterState(next, prev, world)
    if (next === 'attack') {
      this.facing = this.dirToPlayer(world)
      this.body.vy = -340
      this.body.vx = this.facing * 120
      world.audio.playSfx('jump', { volume: 0.4, rate: 0.7 })
      fx(world, 'jump-puff', this.x, this.y, { count: 1.2 })
    }
  }

  protected onAttack(_dt: number, _world: World): void {
    this.playFirst('walk', 'idle')
  }

  protected think(dt: number, world: World): void {
    super.think(dt, world)
    // The leap ends when he lands, not when a timer says so.
    if (this.state === 'attack' && this.stateTime > 0.2 && this.body.grounded) {
      this.setState('recover', world)
      fx(world, 'landing-dust', this.x, this.y, { power: 0.7 })
    }
  }
}

/** Fishman bruiser — heavy, armoured against shoves, hits at arm's length. */
export class FishmanBrute extends Enemy {
  sheetKey = 'fishman-brute'
  constructor(x: number, y: number) {
    super(x, y, 20, 34)
    this.speed = 26
    this.health = 3
    this.points = 700
    this.accent = PAL.fishmanTeal
    this.aggressive = true
    this.knockbackResist = 0.7
    this.sightRange = 150
    this.alertTime = 0.6
    this.attackTime = 0.35
    this.recoverTime = 1
    this.attackCooldown = 0.9
    this.loot = [{ type: 'berry', chance: 0.8, count: 3, spread: 14 }]
  }

  protected wantsToAttack(world: World): boolean {
    return super.wantsToAttack(world) && this.distToPlayer(world) < 120
  }

  protected onPatrol(dt: number, world: World): void {
    if (this.sinceSeen < this.sightMemory) {
      this.facing = this.dirToPlayer(world)
      this.body.vx = this.facing * this.speed * 1.5
      this.playFirst('run', 'walk')
      return
    }
    super.onPatrol(dt, world)
  }

  protected onEnterState(next: EnemyState, prev: EnemyState, world: World): void {
    super.onEnterState(next, prev, world)
    if (next !== 'attack') return
    world.audio.playSfx('punch', { volume: 0.7 })
    world.shake(0.1)
    // Karate at range: the palm throws the water, not the fist.
    const p = world.player()
    const dy = p ? clamp((p.y - p.body.h * 0.5 - (this.y - 20)) * 1.4, -60, 60) : 0
    world.spawn(new WaterShot(this.x + this.facing * 12, this.y - 20, this.facing * 230, dy))
  }

  protected strikeBox(): Rect | null {
    return this.reachBox(18)
  }
}

/** Sea bat — flies a sine path and ignores terrain. */
export class Bat extends Enemy {
  sheetKey = 'bat'
  private baseY: number
  private phase = 0

  constructor(x: number, y: number) {
    super(x, y, 16, 14)
    this.gravity = 0
    this.speed = 46
    this.avoidLedges = false
    this.baseY = y
    this.body.collidesWithTiles = false
    this.points = 250
    this.accent = PAL.poison
    this.fallbackShape = 'flyer'
  }

  protected onPatrol(dt: number, _world: World): void {
    this.phase += dt
    this.body.vx = this.facing * this.speed
    this.body.vy = Math.cos(this.phase * 3) * 44
    // Drift back toward the spawn height so it never wanders off-screen.
    this.body.vy += (this.baseY - this.y) * 0.6
    this.playFirst('walk', 'idle')
  }
}

/** Urchin — cannot be stomped; bounces the player away. */
export class Urchin extends Enemy {
  sheetKey = 'urchin'
  constructor(x: number, y: number) {
    super(x, y, 16, 16)
    this.stompable = false
    this.damageable = false
    this.speed = 0
    this.points = 0
    this.state = 'idle'
    this.accent = PAL.poison
    this.fallbackShape = 'spiky'
    this.knockbackResist = 1
  }
}

/**
 * Pufferfish — the floor that stops being a floor.
 *
 * Deflated it is the softest enemy in the game. Inflated it is a spike ball
 * that cannot be landed on, and the wind-up between the two states is the whole
 * negotiation: commit to the stomp early or wait it out.
 */
export class Puffer extends Enemy {
  sheetKey = 'puffer'
  private inflated = false

  constructor(x: number, y: number) {
    super(x, y, 16, 14)
    this.speed = 18
    this.points = 350
    this.accent = PAL.gold
    this.aggressive = true
    this.fallbackShape = 'ball'
    this.sightRange = 74
    this.sightHalfAngle = Math.PI // it feels the water in every direction
    this.sightNear = 60
    this.alertTime = 0.4
    this.attackTime = 1.5
    this.recoverTime = 0.7
    this.attackCooldown = 0.8
    this.loot = [{ type: 'berry', chance: 0.3 }]
  }

  protected onEnterState(next: EnemyState, prev: EnemyState, world: World): void {
    super.onEnterState(next, prev, world)
    if (next === 'attack') this.inflate(world)
    else if (prev === 'attack') this.deflate(world)
  }

  private inflate(world: World): void {
    this.inflated = true
    this.stompable = false
    this.body.h = 24
    this.body.w = 24
    this.speed = 6
    this.squash(0.7, 1.35)
    this.playFirst('inflated', 'attack', 'idle')
    world.audio.playSfx('bump', { volume: 0.45, rate: 1.6 })
    world.particles.burst(7, this.x, this.y - 12, {
      speed: 80, speedVar: 40, life: 0.35, size: 1.4, sizeEnd: 0.2,
      color: PAL.foam, colorEnd: rgba(PAL.seaLight, 0), shape: 'droplet',
      drag: 0.1, spawnRadius: 8,
    })
  }

  private deflate(world: World): void {
    this.inflated = false
    this.stompable = true
    this.body.h = 14
    this.body.w = 16
    this.speed = 18
    this.squash(1.4, 0.7)
    this.playFirst('deflated', 'idle')
    world.audio.playSfx('bump', { volume: 0.3, rate: 0.6 })
    world.particles.burst(8, this.x, this.y - 8, {
      speed: 110, speedVar: 40, life: 0.3, size: 2, sizeEnd: 0.4, angle: -this.facing * 0.4,
      spread: 1, color: PAL.foam, colorEnd: rgba(PAL.foam, 0), shape: 'puff', drag: 0.12,
    })
  }

  protected onAttack(_dt: number, _world: World): void {
    // It bobs rather than walks while inflated — no purchase on the ground.
    this.body.vx *= 0.9
    this.playFirst('inflated', 'attack', 'idle')
  }

  protected onDefeat(world: World, _how: 'stomp' | 'melee' | 'explosion'): void {
    // Popping sends the spines out. They are the last threat it poses.
    if (!this.inflated) return
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      world.spawn(new Spine(this.x, this.y - 12, Math.cos(a) * 150, Math.sin(a) * 150))
    }
  }
}

/**
 * Seagull — glides on a fixed line, then dives where you are *going*.
 *
 * The lead is deliberately imperfect: it aims at your current velocity, so
 * stopping or reversing beats it and running in a straight line does not.
 */
export class Seagull extends Enemy {
  sheetKey = 'seagull'
  private baseY: number
  private target = { x: 0, y: 0 }
  private phase = 0

  constructor(x: number, y: number) {
    super(x, y, 18, 12)
    this.gravity = 0
    this.speed = 62
    this.avoidLedges = false
    this.baseY = y
    this.body.collidesWithTiles = false
    this.points = 300
    this.accent = PAL.cream
    this.fallbackShape = 'flyer'
    this.aggressive = true
    this.sightRange = 180
    this.sightHalfAngle = 1.3
    this.alertTime = 0.5
    this.attackTime = 1
    this.recoverTime = 0.9
    this.attackCooldown = 1.4
  }

  protected wantsToAttack(world: World): boolean {
    const p = world.player()
    // Only dive on something below it — a gull does not attack upward.
    return super.wantsToAttack(world) && !!p && p.y - p.body.h > this.y + 8
  }

  protected onPatrol(dt: number, _world: World): void {
    this.phase += dt
    this.body.vx = this.facing * this.speed
    this.body.vy = Math.sin(this.phase * 1.7) * 16 + (this.baseY - this.y) * 0.8
    this.playFirst('walk', 'idle')
  }

  protected onAlert(dt: number, world: World): void {
    super.onAlert(dt, world)
    // Stall: it hangs, beats hard, and picks the interception point.
    this.body.vx *= 0.86
    this.body.vy = -22 + Math.sin(this.stateTime * 26) * 12
    const p = world.player()
    if (p) {
      const lead = 0.45
      this.target = { x: p.x + p.body.vx * lead, y: p.y - p.body.h * 0.4 }
      this.facing = this.target.x >= this.x ? 1 : -1
    }
    void dt
  }

  protected onEnterState(next: EnemyState, prev: EnemyState, world: World): void {
    super.onEnterState(next, prev, world)
    if (next === 'attack') {
      const dx = this.target.x - this.x
      const dy = this.target.y - this.y
      const d = Math.hypot(dx, dy) || 1
      this.body.vx = (dx / d) * 300
      this.body.vy = (dy / d) * 300
      world.audio.playSfx('shoot', { volume: 0.3, rate: 1.8 })
    }
  }

  protected onAttack(_dt: number, world: World): void {
    this.playFirst('run', 'walk')
    world.particles.emit({
      x: this.x, y: this.y - 6, vx: 0, vy: 0, life: 0.22, size: 2.4, sizeEnd: 0.3,
      color: rgba(PAL.cream, 0.7), colorEnd: rgba(PAL.mist, 0), shape: 'streak',
      rotation: Math.atan2(this.body.vy, this.body.vx), aim: true,
    })
  }

  protected onRecover(dt: number, _world: World): void {
    // Climb back to the flight line and rejoin the patrol.
    this.body.vx *= 0.94
    this.body.vy += (this.baseY - this.y) * 3 * dt - 40 * dt
    this.playFirst('walk', 'idle')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Traversal hazards
// ─────────────────────────────────────────────────────────────────────────────

/** Rolling barrel — accelerates, shatters on walls, can be ridden down. */
export class Barrel extends Enemy {
  sheetKey = 'barrel'
  constructor(x: number, y: number) {
    super(x, y, 15, 16)
    this.speed = 92
    this.avoidLedges = false
    this.points = 150
    this.accent = PAL.wood
    this.fallbackShape = 'ball'
  }

  protected onPatrol(_dt: number, world: World): void {
    this.body.vx = this.facing * this.speed
    this.playFirst('run', 'walk')
    if (this.body.grounded && world.rng.bool(0.25)) {
      fx(world, 'run-dust', this.x, this.y, { facing: this.facing, count: 0.5 })
    }
  }

  protected onDefeat(world: World, _how: 'stomp' | 'melee' | 'explosion'): void {
    world.particles.burst(12, this.x, this.y - 8, {
      speed: 150, speedVar: 80, life: 0.7, lifeVar: 0.2, size: 2.6, sizeEnd: 1.4,
      color: PAL.wood, colorEnd: PAL.woodDeep, shape: 'shard', gravity: 420,
      drag: 0.02, spin: 12,
    })
  }
}

/**
 * Spike roller — never stompable, and it knows it.
 *
 * The only opening is the moment after it slams into a wall: it rings, wobbles,
 * and for a beat the spikes are pointing the wrong way.
 */
export class SpikeRoller extends Enemy {
  sheetKey = 'spike-roller'
  constructor(x: number, y: number) {
    super(x, y, 18, 18)
    this.speed = 76
    this.avoidLedges = false
    this.stompable = false
    this.health = 2
    this.points = 500
    this.accent = PAL.danger
    this.fallbackShape = 'spiky'
    this.knockbackResist = 0.9
    this.showTell = false
  }

  protected onPatrol(_dt: number, world: World): void {
    this.body.vx = this.facing * this.speed
    this.playFirst('run', 'walk')
    if (wallAhead(this.body, world.map, this.facing)) this.slam(world)
  }

  private slam(world: World): void {
    world.audio.playSfx('bump', { volume: 0.8, rate: 0.5 })
    world.shake(0.2)
    world.particles.burst(12, this.x + this.facing * 9, this.y - 9, {
      speed: 140, speedVar: 60, life: 0.35, size: 2.2, sizeEnd: 0.3,
      angle: this.facing === 1 ? Math.PI : 0, spread: 2,
      color: PAL.cream, colorEnd: PAL.danger, shape: 'spark', additive: true, drag: 0.06,
    })
    this.turn()
    this.body.vx = this.facing * 20
    this.stunTime = 1.1
    this.setState('stunned', world)
  }

  protected onStunned(dt: number, _world: World): void {
    super.onStunned(dt, _world)
    // Wobbling on the spot — the visible "hit me now".
    this.squashX = 1 + Math.sin(this.stateTime * 30) * 0.12
    this.squashY = 1 - Math.sin(this.stateTime * 30) * 0.12
  }

  /**
   * Armoured while it rolls, open while it is ringing off a wall.
   *
   * Deriving this from the state rather than toggling a flag means the window
   * cannot drift out of sync with the animation that advertises it.
   */
  damage(hit: Hit, world: World): boolean {
    if (this.state !== 'stunned') {
      this.flash = 0.35
      world.audio.playSfx('bump', { volume: 0.7, rate: 1.6 })
      world.particles.burst(8, this.x, this.y - 9, {
        speed: 130, speedVar: 60, life: 0.26, size: 2, sizeEnd: 0.3,
        color: PAL.white, colorEnd: PAL.danger, shape: 'spark', additive: true, drag: 0.08,
      })
      this.iframes = 0.16
      return false
    }
    return super.damage(hit, world)
  }
}

/** Jumper — a hopping mine of a thing. Crouches, then arcs at you. */
export class Jumper extends Enemy {
  sheetKey = 'jumper'
  private idleHop = 1.4

  constructor(x: number, y: number) {
    super(x, y, 16, 18)
    this.speed = 0
    this.state = 'idle'
    this.points = 300
    this.accent = PAL.zoroGreen
    this.fallbackShape = 'blob'
    this.aggressive = true
    this.sightRange = 140
    this.sightHalfAngle = 1.4
    this.alertTime = 0.4
    this.attackTime = 1.2
    this.recoverTime = 0.35
    this.attackCooldown = 0.55
  }

  protected wantsToAttack(world: World): boolean {
    if (!this.body.grounded) return false
    // It hops whether or not it has seen anything — the rhythm is the level
    // design; seeing the player only changes where it aims.
    return super.wantsToAttack(world) || this.idleHop <= 0
  }

  protected onIdle(dt: number, _world: World): void {
    super.onIdle(dt, _world)
    this.idleHop -= dt
  }

  protected onAlert(dt: number, world: World): void {
    super.onAlert(dt, world)
    // Coil: the squash *is* the telegraph.
    const t = clamp01(this.stateTime / this.alertTime)
    this.squashX = 1 + t * 0.3
    this.squashY = 1 - t * 0.28
    void dt
  }

  protected onEnterState(next: EnemyState, prev: EnemyState, world: World): void {
    super.onEnterState(next, prev, world)
    if (next !== 'attack') return
    this.idleHop = world.rng.range(1.1, 2)
    const p = world.player()
    const near = this.sinceSeen < this.sightMemory && p
    this.facing = near ? this.dirToPlayer(world) : this.facing
    this.body.vy = -330
    this.body.vx = this.facing * (near ? 130 : 70)
    this.squash(0.72, 1.36)
    world.audio.playSfx('jump', { volume: 0.35, rate: 1.3 })
    fx(world, 'jump-puff', this.x, this.y)
  }

  protected onAttack(_dt: number, world: World): void {
    this.playFirst('walk', 'idle')
    if (this.stateTime > 0.15 && this.body.grounded) {
      this.squash(1.35, 0.7)
      fx(world, 'landing-dust', this.x, this.y, { power: 0.6 })
      this.setState('recover', world)
    }
  }

  protected onRecover(_dt: number, _world: World): void {
    this.body.vx *= 0.7
    this.playFirst('idle')
  }
}

/** Falling debris — a one-shot hazard dropped from a ceiling or a crane. */
export class Debris extends Enemy {
  sheetKey = 'debris'
  constructor(x: number, y: number) {
    super(x, y, 14, 14)
    this.speed = 0
    this.state = 'idle'
    this.stompable = false
    this.points = 0
    this.accent = PAL.rock
    this.fallbackShape = 'ball'
    this.avoidLedges = false
  }

  protected onIdle(_dt: number, world: World): void {
    this.playFirst('run', 'idle')
    if (!this.body.grounded) return
    // It arrives once, hard, and is gone.
    world.audio.playSfx('break', { volume: 0.6 })
    world.shake(0.16)
    world.particles.burst(14, this.x, this.y - 4, {
      speed: 150, speedVar: 70, life: 0.5, lifeVar: 0.2, size: 2.4, sizeEnd: 0.6,
      color: PAL.rock, colorEnd: PAL.rockDeep, shape: 'shard', gravity: 420,
      drag: 0.03, spin: 10,
    })
    this.dead = true
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Circus pirates
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Circus pirate — throws a fan of knives.
 *
 * It backs away when you close, so the fight is about crossing the gap during
 * the recovery rather than trading at range.
 */
export class CircusPirate extends Enemy {
  sheetKey = 'circus-juggler'
  constructor(x: number, y: number) {
    super(x, y, 16, 30)
    this.speed = 30
    this.health = 2
    this.points = 450
    this.accent = PAL.luffyRed
    this.aggressive = true
    this.sightRange = 200
    this.sightHalfAngle = 0.7
    this.alertTime = 0.5
    this.attackTime = 0.3
    this.recoverTime = 0.9
    this.attackCooldown = 1
    this.loot = [{ type: 'berry', chance: 0.5, count: 2 }]
  }

  protected onPatrol(dt: number, world: World): void {
    if (this.sinceSeen < this.sightMemory && this.distToPlayer(world) < 60) {
      // Too close for knives: give ground while keeping the player in view.
      this.facing = this.dirToPlayer(world)
      this.body.vx = -this.facing * this.speed * 1.3
      this.playFirst('walk', 'idle')
      return
    }
    super.onPatrol(dt, world)
  }

  protected onEnterState(next: EnemyState, prev: EnemyState, world: World): void {
    super.onEnterState(next, prev, world)
    if (next !== 'attack') return
    world.audio.playSfx('slash', { volume: 0.6, rate: 1.1 })
    // A fan, not a line: three knives across an arc so ducking is not enough.
    const p = world.player()
    const base = p
      ? Math.atan2(p.y - p.body.h * 0.5 - (this.y - 20), p.x - this.x)
      : this.facing === 1 ? 0 : Math.PI
    for (let i = -1; i <= 1; i++) {
      const a = base + i * 0.32
      world.spawn(new Knife(this.x + this.facing * 8, this.y - 20, Math.cos(a) * 210, Math.sin(a) * 210 - 30))
    }
  }
}

/** Circus acrobat — tumbles in, light and fast, no ranged game at all. */
export class CircusAcrobat extends Enemy {
  sheetKey = 'circus-acrobat'
  constructor(x: number, y: number) {
    super(x, y, 14, 26)
    this.speed = 54
    this.points = 350
    this.accent = PAL.chopperPink
    this.aggressive = true
    this.sightRange = 150
    this.alertTime = 0.3
    this.attackTime = 0.5
    this.recoverTime = 0.6
    this.attackCooldown = 0.7
  }

  protected onPatrol(dt: number, world: World): void {
    if (this.sinceSeen < this.sightMemory) {
      this.facing = this.dirToPlayer(world)
      this.body.vx = this.facing * this.speed * 1.4
      this.playFirst('run', 'walk')
      return
    }
    super.onPatrol(dt, world)
  }

  protected onEnterState(next: EnemyState, prev: EnemyState, world: World): void {
    super.onEnterState(next, prev, world)
    if (next !== 'attack') return
    // A cartwheel kick: it leaves the ground, so it clears low cover.
    this.facing = this.dirToPlayer(world)
    this.body.vx = this.facing * 200
    this.body.vy = -170
    world.audio.playSfx('kick', { volume: 0.5 })
  }

  protected strikeBox(): Rect | null {
    return this.reachBox(14)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Desert agents
// ─────────────────────────────────────────────────────────────────────────────

/** Hook agent — closes with a lunge, then hops out of reach. */
export class AgentHook extends Enemy {
  sheetKey = 'agent-hook'
  constructor(x: number, y: number) {
    super(x, y, 15, 30)
    this.speed = 42
    this.health = 2
    this.points = 500
    this.accent = PAL.steel
    this.aggressive = true
    this.sightRange = 170
    this.alertTime = 0.4
    this.attackTime = 0.4
    this.recoverTime = 0.8
    this.attackCooldown = 0.8
    this.loot = [{ type: 'berry', chance: 0.5 }]
  }

  protected wantsToAttack(world: World): boolean {
    return super.wantsToAttack(world) && this.distToPlayer(world) < 90
  }

  protected onPatrol(dt: number, world: World): void {
    if (this.sinceSeen < this.sightMemory) {
      this.facing = this.dirToPlayer(world)
      this.body.vx = this.facing * this.speed * 1.3
      this.playFirst('run', 'walk')
      return
    }
    super.onPatrol(dt, world)
  }

  protected onEnterState(next: EnemyState, prev: EnemyState, world: World): void {
    super.onEnterState(next, prev, world)
    if (next === 'attack') {
      this.body.vx = this.facing * 150
      world.audio.playSfx('slash', { volume: 0.5, rate: 1.35 })
      world.particles.burst(9, this.x + this.facing * 14, this.y - 18, {
        speed: 130, speedVar: 50, life: 0.24, size: 2, sizeEnd: 0.3,
        angle: this.facing === 1 ? -0.4 : Math.PI + 0.4, spread: 0.9,
        color: PAL.cream, colorEnd: PAL.steel, shape: 'streak', additive: true, aim: true,
      })
    }
    if (next === 'recover') {
      // The hop back is what makes him hard to punish twice.
      this.body.vx = -this.facing * 120
      if (this.body.grounded) this.body.vy = -150
    }
  }

  protected strikeBox(): Rect | null {
    return this.reachBox(19)
  }
}

/** Scarab — small, quick, skittering. Dies to anything, arrives in numbers. */
export class Scarab extends Enemy {
  sheetKey = 'scarab'
  private hop = 0

  constructor(x: number, y: number) {
    super(x, y, 13, 11)
    this.speed = 66
    this.points = 200
    this.accent = PAL.poison
    this.fallbackShape = 'ball'
  }

  protected onPatrol(dt: number, world: World): void {
    this.hop -= dt
    this.body.vx = this.facing * this.speed
    if (this.body.grounded && this.hop <= 0) {
      this.body.vy = -120
      this.hop = world.rng.range(0.4, 0.9)
    }
    this.playFirst('run', 'walk')
  }
}

/**
 * Sand crab — buried until you are over it.
 *
 * While it is under the sand it cannot be hit and cannot hit you: the mound is
 * a promise, not a threat, and the tell is the sand lifting off its back.
 */
export class SandCrab extends Enemy {
  sheetKey = 'sandcrab'
  private buried = true

  constructor(x: number, y: number) {
    super(x, y, 18, 14)
    this.speed = 0
    this.state = 'idle'
    this.points = 400
    this.accent = PAL.sandDeep
    this.aggressive = true
    this.sightRange = 60
    this.sightHalfAngle = Math.PI
    this.sightNear = 55
    this.alertTime = 0.45
    this.attackTime = 1.4
    this.recoverTime = 0.8
    this.attackCooldown = 1.2
    this.contactDamage = false
    this.damageable = false
    this.stompable = false
    this.knockbackResist = 1
    this.loot = [{ type: 'berry', chance: 0.6 }]
  }

  protected onAlert(dt: number, world: World): void {
    super.onAlert(dt, world)
    // Sand lifting off the shell.
    if (world.rng.bool(0.6)) {
      world.particles.emit({
        x: this.x + world.rng.range(-9, 9), y: this.y - 1,
        vx: world.rng.range(-25, 25), vy: world.rng.range(-90, -40),
        life: 0.5, size: 1.8, sizeEnd: 0.4, color: PAL.sand, colorEnd: PAL.sandDeep,
        shape: 'pixel', gravity: 300,
      })
    }
    void dt
  }

  protected onEnterState(next: EnemyState, prev: EnemyState, world: World): void {
    super.onEnterState(next, prev, world)
    if (next === 'attack') this.surface(world)
    if (next === 'idle' && prev !== 'idle') this.burrow(world)
  }

  private surface(world: World): void {
    this.buried = false
    this.contactDamage = true
    this.damageable = true
    this.stompable = true
    this.speed = 52
    this.facing = this.dirToPlayer(world)
    this.body.vy = -140
    this.squash(0.8, 1.3)
    world.audio.playSfx('bump', { volume: 0.5, rate: 1.2 })
    fx(world, 'sand-gust', this.x, this.y, { count: 1.4 })
    world.particles.burst(16, this.x, this.y - 2, {
      speed: 130, speedVar: 60, life: 0.5, lifeVar: 0.2, size: 2.2, sizeEnd: 0.4,
      angle: -Math.PI / 2, spread: 2.2, color: PAL.sand, colorEnd: PAL.sandDeep,
      shape: 'puff', gravity: 320, drag: 0.06,
    })
  }

  private burrow(world: World): void {
    this.buried = true
    this.contactDamage = false
    this.damageable = false
    this.stompable = false
    this.speed = 0
    this.squash(1.4, 0.6)
    fx(world, 'sand-gust', this.x, this.y, { count: 0.8 })
  }

  protected onAttack(_dt: number, _world: World): void {
    // Once it is out it scuttles at you until the timer runs down.
    this.body.vx = this.facing * this.speed
    this.playFirst('run', 'walk')
  }

  protected onRecover(dt: number, world: World): void {
    super.onRecover(dt, world)
    this.playFirst('idle')
    if (this.stateTime > this.recoverTime * 0.9 && this.distToPlayer(world) > 70) {
      this.setState('idle', world)
    }
  }

  draw(rc: RenderContext, sx: number, sy: number): void {
    if (!this.buried) {
      super.draw(rc, sx, sy)
      return
    }
    // Buried: only the mound, with two eye-stalk dots so the player can learn
    // to read it. No sprite, so it never looks like a half-drawn crab.
    const { ctx } = rc
    const c = cel(PAL.sand)
    ctx.save()
    ctx.translate(sx, sy)
    ctx.fillStyle = c.core
    ctx.beginPath()
    ctx.ellipse(0, 0, 11, 5, 0, Math.PI, 0)
    ctx.fill()
    ctx.fillStyle = c.shade
    ctx.beginPath()
    ctx.ellipse(2.5, 0, 8, 3.6, 0, Math.PI, 0)
    ctx.fill()
    ctx.strokeStyle = c.line
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.ellipse(0, 0, 11, 5, 0, Math.PI, 0)
    ctx.stroke()
    ctx.fillStyle = PAL.ink
    ctx.beginPath()
    ctx.arc(-2.4, -4.6, 0.9, 0, Math.PI * 2)
    ctx.arc(2.4, -4.6, 0.9, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    this.drawTell(rc, sx, sy)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Skypiea
// ─────────────────────────────────────────────────────────────────────────────

/** Sky priest — floats above the fight and drops homing bolts on you. */
export class SkyPriest extends Enemy {
  sheetKey = 'sky-priest'
  private baseY: number

  constructor(x: number, y: number) {
    super(x, y, 18, 32)
    this.gravity = 0
    this.speed = 24
    this.avoidLedges = false
    this.body.collidesWithTiles = false
    this.baseY = y
    this.health = 2
    this.points = 600
    this.accent = PAL.magic
    this.aggressive = true
    this.sightRange = 210
    this.sightHalfAngle = 1.2
    this.alertTime = 0.7
    this.attackTime = 0.3
    this.recoverTime = 1.1
    this.attackCooldown = 1.4
    this.loot = [{ type: 'berry', chance: 0.7, count: 2 }]
  }

  protected onPatrol(dt: number, world: World): void {
    this.body.vx = this.facing * this.speed
    this.body.vy = Math.sin(this.age * 1.4) * 12 + (this.baseY - this.y) * 0.8
    this.playFirst('idle')
    // Hover-drift keeps it above the player rather than pacing a line.
    const p = world.player()
    if (p && this.sinceSeen < this.sightMemory) {
      this.facing = this.dirToPlayer(world)
      this.body.vx = clamp((p.x - this.x) * 0.6, -this.speed, this.speed)
    }
    void dt
  }

  protected onAlert(dt: number, world: World): void {
    super.onAlert(dt, world)
    this.body.vx *= 0.85
    this.body.vy = Math.sin(this.stateTime * 20) * 8
    if (world.rng.bool(0.5)) {
      world.particles.emit({
        x: this.x + this.facing * 8 + world.rng.range(-4, 4), y: this.y - 20,
        vx: 0, vy: 0, life: 0.3, size: 2.4, sizeEnd: 0.2,
        color: PAL.magic, colorEnd: PAL.white, shape: 'spark', additive: true,
      })
    }
    void dt
  }

  protected onEnterState(next: EnemyState, prev: EnemyState, world: World): void {
    super.onEnterState(next, prev, world)
    if (next !== 'attack') return
    world.audio.playSfx('shoot', { volume: 0.5, rate: 0.8 })
    const p = world.player()
    const a = p
      ? Math.atan2(p.y - p.body.h * 0.5 - (this.y - 18), p.x - this.x)
      : this.facing === 1 ? 0 : Math.PI
    world.spawn(new SkyBolt(this.x + this.facing * 8, this.y - 18, Math.cos(a) * 95, Math.sin(a) * 95))
  }
}

/** Sky scout — a flyer that keeps pace with you and never lands. */
export class SkyScout extends Enemy {
  sheetKey = 'sky-scout'
  private baseY: number

  constructor(x: number, y: number) {
    super(x, y, 15, 22)
    this.gravity = 0
    this.speed = 58
    this.avoidLedges = false
    this.body.collidesWithTiles = false
    this.baseY = y
    this.points = 300
    this.accent = PAL.skyLow
    this.fallbackShape = 'flyer'
    this.aggressive = true
    this.sightRange = 190
    this.sightHalfAngle = 1.5
  }

  protected onPatrol(dt: number, world: World): void {
    const p = world.player()
    if (p && this.sinceSeen < this.sightMemory) {
      // Shadowing: it matches your height a beat late, so it can be out-climbed.
      this.facing = this.dirToPlayer(world)
      this.body.vx = clamp((p.x - this.x) * 1.2, -this.speed, this.speed)
      this.body.vy = clamp((p.y - p.body.h - 14 - this.y) * 1.1, -70, 70)
    } else {
      this.body.vx = this.facing * this.speed * 0.7
      this.body.vy = Math.sin(this.age * 2.2) * 26 + (this.baseY - this.y) * 0.7
    }
    this.playFirst('walk', 'idle')
    void dt
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Thriller Bark
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Zombie — slow, two hits, and it never stops.
 *
 * Knocking it down is not killing it: the first hit flattens it, and it gets
 * back up angrier and faster. It walks off ledges without hesitating, which is
 * both its weakness and the reason it ends up where you are.
 */
export class Zombie extends Enemy {
  sheetKey = 'zombie'
  private risen = false

  constructor(x: number, y: number) {
    super(x, y, 16, 30)
    this.speed = 16
    this.health = 2
    this.points = 450
    this.accent = PAL.poison
    this.avoidLedges = false
    this.aggressive = true
    this.knockbackResist = 0.75
    this.sightRange = 170
    this.sightHalfAngle = 1.1
    this.sightMemory = 6
    this.loot = [{ type: 'berry', chance: 0.4 }]
  }

  protected wantsToAttack(_world: World): boolean {
    return false // it has no attack — it just arrives
  }

  protected onPatrol(dt: number, world: World): void {
    if (this.sinceSeen < this.sightMemory) {
      this.facing = this.dirToPlayer(world)
      this.body.vx = this.facing * this.speed
      this.playFirst('walk', 'idle')
      if (world.rng.bool(0.004)) world.audio.playSfx('hurt', { volume: 0.15, rate: 0.5 })
      return
    }
    super.onPatrol(dt, world)
  }

  protected onSurvivedHit(_hit: Hit, world: World): void {
    if (this.risen) return
    this.risen = true
    this.speed = 30
    this.sightRange = 240
    this.accent = PAL.danger
    world.audio.playSfx('hurt', { volume: 0.35, rate: 0.45 })
    // Getting up is its own beat: a long stagger, then it comes faster.
    this.stunTime = 0.9
    this.setState('stunned', world)
    world.particles.burst(14, this.x, this.y - 16, {
      speed: 90, speedVar: 50, life: 0.7, lifeVar: 0.3, size: 2.4, sizeEnd: 0.5,
      color: PAL.poison, colorEnd: rgba(PAL.poison, 0), shape: 'smoke',
      additive: true, drag: 0.08,
    })
  }

  protected onStunned(dt: number, world: World): void {
    super.onStunned(dt, world)
    // Flat on the floor for the first half, hauling itself up for the second.
    const t = clamp01(this.stateTime / Math.max(0.001, this.stunTime))
    this.squashY = 0.45 + t * 0.55
    this.squashX = 1.5 - t * 0.5
  }
}

/**
 * Ghost — moves only when you are not looking at it.
 *
 * Facing it stops it dead and drops its guard, which is the whole fight: you
 * have to look at it to hurt it, and looking away is the only way to make
 * progress past it.
 */
export class Ghost extends Enemy {
  sheetKey = 'ghost'
  private watched = false
  private alpha = 1

  constructor(x: number, y: number) {
    super(x, y, 18, 20)
    this.gravity = 0
    this.speed = 52
    this.avoidLedges = false
    this.body.collidesWithTiles = false
    this.stompable = false
    this.damageable = false
    this.health = 2
    this.points = 550
    this.accent = PAL.magic
    this.fallbackShape = 'blob'
    this.showTell = false
    this.sightOccluded = false
    this.loot = [{ type: 'berry', chance: 0.5 }]
  }

  protected think(dt: number, world: World): void {
    const seen = this.observedBy(world)
    if (seen !== this.watched) {
      this.watched = seen
      // The switch has to be audible as well as visible — this is the rule the
      // whole encounter is built on.
      world.audio.playSfx(seen ? 'bump' : 'swim', { volume: 0.22, rate: seen ? 1.9 : 0.8 })
    }
    this.damageable = seen
    this.contactDamage = !seen
    this.alpha += ((seen ? 1 : 0.72) - this.alpha) * Math.min(1, dt * 8)

    if (seen) {
      // Caught: it curls up and stops. Free hits until you look away.
      this.body.vx *= 0.82
      this.body.vy *= 0.82
      this.squashX += (0.86 - this.squashX) * Math.min(1, dt * 10)
      this.squashY += (1.12 - this.squashY) * Math.min(1, dt * 10)
      this.playFirst('idle')
      return
    }

    const p = world.player()
    if (p) {
      this.facing = this.dirToPlayer(world)
      const dy = p.y - p.body.h * 0.5 - this.y
      this.body.vx += (this.facing * this.speed - this.body.vx) * Math.min(1, dt * 3)
      this.body.vy += (clamp(dy, -40, 40) - this.body.vy) * Math.min(1, dt * 2)
    }
    // A wisp trail while it hunts. Unobserved motion has to be legible out of
    // the corner of the eye, or the rule feels like a cheat rather than a rule.
    if (world.rng.bool(0.5)) {
      fx(world, 'ghost-wisp', this.x - this.facing * 6, this.y - 10, { count: 0.5 })
    }
    this.playFirst('walk', 'idle')
  }

  draw(rc: RenderContext, sx: number, sy: number): void {
    const { ctx } = rc
    ctx.save()
    ctx.globalAlpha = this.alpha
    // A bob that does not come from physics, so it drifts even while frozen.
    super.draw(rc, sx, sy + Math.sin(this.age * 2.4) * 1.6)
    ctx.restore()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Wano
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Samurai — parries anything that comes at his front.
 *
 * A frontal swing is turned aside and answered immediately, so the honest way
 * through is from above or behind, or by baiting the counter and stepping out
 * of it. He cannot parry while recovering from his own cut.
 */
export class Samurai extends Enemy {
  sheetKey = 'samurai'
  private parryCooldown = 0
  private countering = false

  constructor(x: number, y: number) {
    super(x, y, 16, 32)
    this.speed = 26
    this.health = 2
    this.points = 700
    this.accent = PAL.luffyRed
    this.aggressive = true
    this.sightRange = 160
    this.sightHalfAngle = 0.7
    this.alertTime = 0.5
    this.attackTime = 0.28
    this.recoverTime = 0.95
    this.attackCooldown = 1.1
    this.loot = [{ type: 'berry', chance: 0.7, count: 2, spread: 12 }]
  }

  protected think(dt: number, world: World): void {
    this.parryCooldown = Math.max(0, this.parryCooldown - dt)
    super.think(dt, world)
  }

  /** Can he still answer a cut from the front right now? */
  private guarding(): boolean {
    return (
      this.parryCooldown <= 0 &&
      this.state !== 'recover' &&
      this.state !== 'stunned' &&
      this.state !== 'attack'
    )
  }

  damage(hit: Hit, world: World): boolean {
    const fromFront = Math.sign(hit.dirX) === -this.facing || hit.dirX === 0
    if (hit.kind === 'melee' && fromFront && this.guarding()) {
      this.parry(world)
      return false
    }
    return super.damage(hit, world)
  }

  private parry(world: World): void {
    this.parryCooldown = 1.2
    this.iframes = 0.3 // one swing, one parry — no double-clanging
    this.flash = 0.6
    world.audio.playSfx('bump', { volume: 0.9, rate: 1.7 })
    world.hitstop(8)
    world.shake(0.14)
    const px = this.x + this.facing * 10
    const py = this.y - this.body.h * 0.6
    world.particles.burst(16, px, py, {
      speed: 190, speedVar: 90, life: 0.32, lifeVar: 0.1, size: 2.4, sizeEnd: 0.3,
      color: PAL.white, colorEnd: PAL.gold, shape: 'spark', additive: true, drag: 0.05,
    })
    fx(world, 'impact-star', px, py, { color: PAL.gold })
    const p = world.player() as Player | null
    if (p) {
      p.body.vx = this.facing * 170
      p.squash(0.82, 1.18)
    }
    // The counter is immediate and short — that is the price of swinging first.
    this.countering = true
    this.setState('alert', world)
  }

  protected onAlert(dt: number, world: World): void {
    super.onAlert(dt, world)
    if (this.countering) this.stateTime += dt * 2.2 // a counter is twice as fast
    this.body.vx *= 0.7
  }

  protected onEnterState(next: EnemyState, prev: EnemyState, world: World): void {
    super.onEnterState(next, prev, world)
    if (next === 'attack') {
      this.body.vx = this.facing * 130
      world.audio.playSfx('slash', { volume: 0.8, rate: 0.95 })
      world.shake(0.08)
      // The cut: one long streak along the blade path, not a cloud.
      for (let i = 0; i < 5; i++) {
        world.particles.emit({
          x: this.x + this.facing * (8 + i * 4), y: this.y - 26 + i * 4,
          vx: this.facing * 60, vy: 90, life: 0.2, size: 3.4, sizeEnd: 0.3,
          color: PAL.white, colorEnd: rgba(PAL.mist, 0), shape: 'streak',
          additive: true, aim: true,
        })
      }
    }
    if (next === 'recover' || next === 'patrol') this.countering = false
  }

  protected strikeBox(): Rect | null {
    return this.reachBox(24, this.body.h * 0.85)
  }
}

/** Oni brute — a club that turns the floor into a threat. */
export class OniBrute extends Enemy {
  sheetKey = 'oni-brute'
  constructor(x: number, y: number) {
    super(x, y, 24, 40)
    this.speed = 22
    this.health = 3
    this.points = 900
    this.accent = PAL.danger
    this.aggressive = true
    this.knockbackResist = 0.85
    this.sightRange = 180
    this.alertTime = 0.75
    this.attackTime = 0.4
    this.recoverTime = 1.2
    this.attackCooldown = 1
    this.loot = [{ type: 'berry', chance: 1, count: 4, spread: 18 }]
  }

  protected wantsToAttack(world: World): boolean {
    return super.wantsToAttack(world) && this.distToPlayer(world) < 130
  }

  protected onAlert(dt: number, world: World): void {
    super.onAlert(dt, world)
    this.body.vx *= 0.6
    // The club goes up: lift the whole body so the shape changes, not the pose.
    const t = clamp01(this.stateTime / this.alertTime)
    this.squashY = 1 + t * 0.12
    this.squashX = 1 - t * 0.08
    void dt
  }

  protected onEnterState(next: EnemyState, prev: EnemyState, world: World): void {
    super.onEnterState(next, prev, world)
    if (next !== 'attack') return
    this.squash(1.3, 0.72)
    world.audio.playSfx('break', { volume: 0.8, rate: 0.7 })
    world.hitstop(6)
    world.shake(0.32)
    fx(world, 'landing-dust', this.x, this.y, { power: 1, scale: 1.6 })
    if (this.body.grounded) {
      world.spawn(new Shockwave(this.x + 14, this.y, 1, 160))
      world.spawn(new Shockwave(this.x - 14, this.y, -1, 160))
    }
  }

  protected strikeBox(): Rect | null {
    return this.reachBox(22, this.body.h * 0.6, this.body.h * 0.3)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

registerEntity('grunt', (x, y) => new Grunt(x, y))
registerEntity('shielder', (x, y) => new Shielder(x, y))
registerEntity('marine-officer', (x, y) => new MarineOfficer(x, y))
registerEntity('cannon', (x, y) => new MarineCannon(x, y))
registerEntity('marine-cannon', (x, y) => new MarineCannon(x, y))

registerEntity('crab', (x, y) => new Crab(x, y))
registerEntity('fishman', (x, y) => new Fishman(x, y))
registerEntity('fishman-brute', (x, y) => new FishmanBrute(x, y))
registerEntity('bat', (x, y) => new Bat(x, y))
registerEntity('urchin', (x, y) => new Urchin(x, y))
registerEntity('pufferfish', (x, y) => new Puffer(x, y))
registerEntity('puffer', (x, y) => new Puffer(x, y))
registerEntity('seagull', (x, y) => new Seagull(x, y))

registerEntity('barrel', (x, y) => new Barrel(x, y))
registerEntity('spike-roller', (x, y) => new SpikeRoller(x, y))
registerEntity('jumper', (x, y) => new Jumper(x, y))
registerEntity('debris', (x, y) => new Debris(x, y))

registerEntity('circus-pirate', (x, y) => new CircusPirate(x, y))
registerEntity('circus-acrobat', (x, y) => new CircusAcrobat(x, y))

registerEntity('agent-hook', (x, y) => new AgentHook(x, y))
registerEntity('scarab', (x, y) => new Scarab(x, y))
registerEntity('sandcrab', (x, y) => new SandCrab(x, y))

registerEntity('sky-priest', (x, y) => new SkyPriest(x, y))
registerEntity('sky-scout', (x, y) => new SkyScout(x, y))

registerEntity('zombie', (x, y) => new Zombie(x, y))
registerEntity('ghost', (x, y) => new Ghost(x, y))

registerEntity('samurai', (x, y) => new Samurai(x, y))
registerEntity('oni-brute', (x, y) => new OniBrute(x, y))

// Projectiles are registered too, so a level designer can drop a live hazard
// straight into a room without an enemy to fire it.
registerEntity('knife', (x, y, o) => new Knife(x, y, Number(o?.vx ?? 140), Number(o?.vy ?? 0)))
registerEntity('cannonball', (x, y, o) => new Cannonball(x, y, Number(o?.vx ?? 120), Number(o?.vy ?? -180)))
registerEntity('water-shot', (x, y, o) => new WaterShot(x, y, Number(o?.vx ?? 200), Number(o?.vy ?? 0)))
registerEntity('shockwave', (x, y, o) => new Shockwave(x, y, Number(o?.dir ?? 1) < 0 ? -1 : 1))
