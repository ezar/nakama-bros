import type { Hit, Rect, RenderContext, SpriteSheet } from '../../types'
import { TILE } from '../../types'
import { Entity } from './Entity'
import type { World } from '../world'
import { moveBody, edgeAhead, wallAhead } from '../../physics/move'
import { PHYS, SCORE } from '../config'
import { art } from '../../art'
import { PAL } from '../../art/palette'
import { cel, mix, rgba } from '../../art/color'
import { clamp, rectsOverlap } from '../../engine/math'
import { createEntity } from './registry'
import type { Player } from './Player'

/**
 * The six beats every enemy in the game moves through.
 *
 * Before this existed each subclass grew its own private cooldown counters and
 * they all drifted apart — one telegraphed, one did not, one could be hit
 * during its wind-up and one could not. Putting the timeline in the base class
 * makes the contract with the player identical everywhere: you can always read
 * an attack coming (`alert`), and there is always a beat afterwards where the
 * enemy is yours (`recover`).
 */
export type EnemyState = 'idle' | 'patrol' | 'alert' | 'attack' | 'recover' | 'stunned'

/** A thing the enemy leaves behind. `type` is a name from the entity registry. */
export interface LootDrop {
  type: string
  /** 0..1 probability. Defaults to 1. */
  chance?: number
  /** How many to drop when it rolls. Defaults to 1. */
  count?: number
  /** Horizontal scatter in world units. Defaults to 10. */
  spread?: number
}

/** How the generic placeholder painter reads when a sprite sheet is missing. */
export type FallbackShape = 'walker' | 'blob' | 'flyer' | 'ball' | 'spiky'

/**
 * A few world units of forgiveness on the stomp test.
 *
 * The player's feet and the enemy's shoulders are both moving, and demanding an
 * exact crossing means a fast fall onto a fast enemy silently becomes a hit
 * instead of a kill. Two units is under a frame of travel at terminal velocity
 * but enough to cover the sub-step rounding.
 */
const STOMP_SLOP = 2.5

/** Occlusion raycasts sample the tilemap this often. Half a tile never leaks. */
const SIGHT_STEP = TILE * 0.5

/**
 * Shared enemy behaviour: gravity, patrol turning, a state machine with
 * telegraphed attacks, cone-of-vision detection, knockback and stagger, the
 * stomp contract, loot, and a defeat burst with weight.
 *
 * Subclasses override the `on*` state hooks for the states they actually use
 * and leave the rest alone — a plain walker overrides nothing at all.
 */
export abstract class Enemy extends Entity {
  readonly kind = 'enemy'

  /** Sprite sheet key in the enemy art library. */
  abstract sheetKey: string
  /** Points awarded on defeat. */
  points: number = SCORE.enemy
  /** Can the player kill this by landing on it? */
  stompable = true
  /** Damage one stomp deals. Two-hit enemies survive the first landing. */
  stompDamage = 1
  /** Does the player's attack hurt it? */
  damageable = true
  /** Does contact hurt the player? */
  contactDamage = true
  /** Walk speed, px/s. */
  speed = 34
  /** Turn around rather than walk off a ledge. */
  avoidLedges = true
  gravity: number = PHYS.gravity
  /** What it leaves behind when beaten. */
  loot: LootDrop[] = []
  /** Signature colour — telegraph glyph, defeat sparks, placeholder art. */
  accent: string = PAL.marineBlue
  /** Placeholder silhouette used only when `sheetKey` resolves to nothing. */
  fallbackShape: FallbackShape = 'walker'

  // ── State machine ──────────────────────────────────────────────────────────

  /** Current beat. Never assign directly — go through `setState`. */
  state: EnemyState = 'patrol'
  /** Seconds spent in `state`. */
  stateTime = 0
  /** Does this enemy look for the player at all? */
  aggressive = false
  /** Seconds of visible wind-up before the strike. Zero means no tell. */
  alertTime = 0.45
  /** Seconds the strike itself lasts. */
  attackTime = 0.3
  /** Seconds of open guard after the strike — the player's window. */
  recoverTime = 0.6
  /** Seconds between the end of a recovery and the next possible attack. */
  attackCooldown = 0.5
  /** Draw the telegraph glyph over the head during `alert`. */
  showTell = true

  // ── Senses ─────────────────────────────────────────────────────────────────

  /** How far it can see, world units. */
  sightRange = 140
  /** Half-angle of the vision cone, radians. ~34° each side by default. */
  sightHalfAngle = 0.6
  /** Inside this radius it notices the player regardless of facing. */
  sightNear = 26
  /** Solid tiles between the eyes and the player break the sightline. */
  sightOccluded = true
  /** Seconds an enemy keeps hunting after losing sight. */
  sightMemory = 1.4

  /** Last position the player was seen at, or null. */
  protected lastSeen: { x: number; y: number } | null = null
  protected sinceSeen = Infinity

  // ── Damage response ────────────────────────────────────────────────────────

  /** 0 = shoved by everything, 1 = immovable. */
  knockbackResist = 0
  /** Seconds of stagger remaining once `stunned` is entered. */
  protected stunTime = 0
  /** Seconds of squash animation before removal. */
  protected dyingFor = -1
  private cooldownLeft = 0
  private paced = false
  /** One strike per attack: set when `strikeBox` connects, cleared on entry. */
  protected struck = false

  constructor(x: number, y: number, w: number, h: number) {
    super(x, y, w, h)
    this.tags.add('enemy')
    this.depth = 60
    this.facing = -1
  }

  // ── Sheet resolution ───────────────────────────────────────────────────────

  /**
   * Look the sheet up by key. A key the art layer has not built yet must never
   * be fatal — the entity keeps simulating and `drawFallback` stands in, so a
   * half-finished art pass costs a placeholder, not a crash.
   */
  protected resolveSheet(): SpriteSheet | null {
    try {
      return art().enemies[this.sheetKey] ?? null
    } catch {
      return null
    }
  }

  /** True when the current sheet actually carries this animation. */
  protected has(name: string): boolean {
    return !!this.sheet?.anims[name]
  }

  /** Play the first of `names` the sheet has, so optional states degrade. */
  protected playFirst(...names: string[]): void {
    for (const n of names) {
      if (this.has(n)) {
        this.play(n)
        return
      }
    }
  }

  /** Same, but restarts even if it is already the current animation. */
  protected playFirstOnce(...names: string[]): void {
    for (const n of names) {
      if (this.has(n)) {
        this.play(n, true)
        return
      }
    }
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  update(dt: number, world: World): void {
    this.tickAnim(dt)
    this.sheet = this.resolveSheet()
    if (!this.paced) this.applyDifficulty(world)

    if (this.dyingFor >= 0) {
      // A flattened body stays flattened where it fell: letting gravity keep
      // running here used to sink the corpse through the floor it died on.
      this.dyingFor += dt
      this.body.vx = 0
      this.body.vy = 0
      if (this.dyingFor > 0.5) this.dead = true
      return
    }

    this.stateTime += dt
    this.cooldownLeft = Math.max(0, this.cooldownLeft - dt)
    this.sinceSeen += dt
    if (this.aggressive) this.look(world)

    this.think(dt, world)

    if (this.gravity > 0) {
      this.body.vy = Math.min(this.body.vy + this.gravity * dt, PHYS.maxFall)
    }
    moveBody(this.body, world.map, dt, {})

    if (this.patrols()) {
      if (wallAhead(this.body, world.map, this.facing)) this.turn()
      else if (this.avoidLedges && this.body.grounded && edgeAhead(this.body, world.map, this.facing)) {
        this.turn()
      }
    }

    this.checkPlayer(world)
  }

  /**
   * Take the run's difficulty, once, before the first step is simulated.
   *
   * The fields are rewritten rather than multiplied at each read: `speed` is
   * used by a dozen subclasses in their own way and `alertTime` is what the
   * telegraph glyph counts against, so scaling the source keeps every one of
   * them honest without asking any of them to know about difficulty.
   *
   * `attackTime` is deliberately left alone. It is the window in which the
   * strike is live, and stretching that would make the attack *harder* to get
   * past, which is the opposite of the point.
   */
  private applyDifficulty(world: World): void {
    this.paced = true
    const d = world.difficulty
    if (d.enemySpeed !== 1) this.speed *= d.enemySpeed
    if (d.enemyTiming !== 1) {
      this.alertTime *= d.enemyTiming
      this.recoverTime *= d.enemyTiming
      this.attackCooldown *= d.enemyTiming
    }
  }

  /** Walls and ledges only turn an enemy that is actually walking a beat. */
  protected patrols(): boolean {
    return this.speed !== 0 && (this.state === 'patrol' || this.state === 'idle')
  }

  /**
   * The state machine. Subclasses normally leave this alone and override the
   * `on*` hooks; overriding it wholesale is for enemies whose timeline genuinely
   * is not attack-shaped (the ghost, the roller).
   */
  protected think(dt: number, world: World): void {
    switch (this.state) {
      case 'idle':
        this.onIdle(dt, world)
        if (this.wantsToAttack(world)) this.setState('alert', world)
        break
      case 'patrol':
        this.onPatrol(dt, world)
        if (this.wantsToAttack(world)) this.setState('alert', world)
        break
      case 'alert':
        this.onAlert(dt, world)
        if (this.stateTime >= this.alertTime) this.setState('attack', world)
        break
      case 'attack':
        this.onAttack(dt, world)
        if (this.stateTime >= this.attackTime) this.setState('recover', world)
        break
      case 'recover':
        this.onRecover(dt, world)
        if (this.stateTime >= this.recoverTime) {
          this.cooldownLeft = this.attackCooldown
          this.setState(this.speed === 0 ? 'idle' : 'patrol', world)
        }
        break
      case 'stunned':
        this.onStunned(dt, world)
        if (this.stateTime >= this.stunTime) this.setState('recover', world)
        break
    }
  }

  /** Enter a new beat. Runs the exit and entry hooks exactly once. */
  setState(next: EnemyState, world: World): void {
    if (next === this.state) return
    const prev = this.state
    this.onExitState(prev, world)
    this.state = next
    this.stateTime = 0
    this.onEnterState(next, prev, world)
  }

  /** The default trigger: something in the cone, off cooldown, on the ground. */
  protected wantsToAttack(_world: World): boolean {
    if (!this.aggressive || this.cooldownLeft > 0) return false
    return this.sinceSeen <= this.sightMemory
  }

  // ── State hooks ────────────────────────────────────────────────────────────

  protected onEnterState(next: EnemyState, _prev: EnemyState, world: World): void {
    if (next === 'alert' && this.alertTime > 0) this.tell(world)
    if (next === 'alert') this.playFirstOnce('windup', 'idle')
    if (next === 'attack') {
      this.struck = false
      this.playFirstOnce('attack', 'run', 'walk')
    }
    if (next === 'recover') this.playFirst('idle', 'walk')
    if (next === 'stunned') this.playFirstOnce('hurt', 'idle')
  }

  protected onExitState(_prev: EnemyState, _world: World): void {}

  /** Standing still. */
  protected onIdle(_dt: number, _world: World): void {
    this.body.vx = 0
    this.playFirst('idle')
  }

  /** The default walker: forward at `speed`, turning at walls and ledges. */
  protected onPatrol(_dt: number, _world: World): void {
    this.body.vx = this.facing * this.speed
    this.playFirst('walk', 'idle')
  }

  /** The tell. Plant your feet and face the player so the read is unambiguous. */
  protected onAlert(_dt: number, world: World): void {
    this.body.vx *= 0.8
    this.faceTarget(world)
  }

  protected onAttack(_dt: number, _world: World): void {
    this.body.vx *= 0.9
  }

  protected onRecover(_dt: number, _world: World): void {
    this.body.vx *= 0.85
  }

  protected onStunned(_dt: number, _world: World): void {
    this.body.vx *= 0.88
  }

  // ── Senses ─────────────────────────────────────────────────────────────────

  /** Refresh `lastSeen` / `sinceSeen` from the vision cone. */
  protected look(world: World): void {
    const p = this.sees(world)
    if (!p) return
    this.lastSeen = { x: p.x, y: p.y }
    this.sinceSeen = 0
  }

  /**
   * The player, if they are inside the vision cone with an unbroken sightline.
   *
   * The cone opens in the facing direction, which is what makes sneaking up
   * behind a Marine a real tactic; a small radius around the enemy ignores the
   * cone entirely so you cannot stand on its toes unnoticed.
   */
  sees(world: World): Player | null {
    const p = world.player() as Player | null
    if (!p || p.dead || p.state === 'clear') return null
    const ex = this.x
    const ey = this.y - this.body.h * 0.68
    const px = p.x
    const py = p.y - p.body.h * 0.5
    const dx = px - ex
    const dy = py - ey
    const d = Math.hypot(dx, dy)
    if (d > this.sightRange) return null
    if (d > this.sightNear) {
      const cosTo = (dx * this.facing) / (d || 1)
      if (cosTo < Math.cos(this.sightHalfAngle)) return null
    }
    if (this.sightOccluded && this.blocked(world, ex, ey, px, py)) return null
    return p
  }

  /** Is a solid tile sitting on the segment between two world points? */
  protected blocked(world: World, x0: number, y0: number, x1: number, y1: number): boolean {
    const dx = x1 - x0
    const dy = y1 - y0
    const len = Math.hypot(dx, dy)
    const steps = Math.ceil(len / SIGHT_STEP)
    for (let i = 1; i < steps; i++) {
      const t = i / steps
      const tx = Math.floor((x0 + dx * t) / TILE)
      const ty = Math.floor((y0 + dy * t) / TILE)
      if (world.map.flags(tx, ty).solid) return true
    }
    return false
  }

  /** Turn to face the last known player position. */
  protected faceTarget(world: World): void {
    const t = this.lastSeen ?? world.player()
    if (!t) return
    const dx = t.x - this.x
    if (Math.abs(dx) > 2) this.facing = dx > 0 ? 1 : -1
  }

  /** Straight-line distance to the player, or Infinity when there is none. */
  protected distToPlayer(world: World): number {
    const p = world.player()
    if (!p) return Infinity
    return Math.hypot(p.x - this.x, p.y - this.body.h * 0.5 - (this.y - this.body.h * 0.5))
  }

  /** -1 / 1 toward the player. Falls back to the current facing. */
  protected dirToPlayer(world: World): 1 | -1 {
    const p = world.player()
    if (!p) return this.facing
    return p.x >= this.x ? 1 : -1
  }

  /**
   * Is the player looking at this enemy?
   *
   * The ghost is built on this: "observed" is the player's gaze, not the
   * camera's, so the counter-play is to turn your back on it and keep walking.
   */
  protected observedBy(world: World, range = 170): boolean {
    const p = world.player() as Player | null
    if (!p || p.dead || p.state === 'clear') return false
    const dx = this.x - p.x
    if (Math.abs(dx) > range) return false
    if (Math.abs(this.y - p.y) > range * 0.7) return false
    return Math.sign(dx) === p.facing || Math.abs(dx) < 8
  }

  protected turn(): void {
    this.facing = this.facing === 1 ? -1 : 1
    this.body.vx = -this.body.vx
  }

  // ── Telegraph ──────────────────────────────────────────────────────────────

  /**
   * The visible wind-up. Every attack in the game routes through here so that
   * "something is about to happen" always looks and sounds the same, whatever
   * is about to happen.
   */
  protected tell(world: World, color = this.accent): void {
    world.audio.playSfx('warn', { volume: 0.22, rate: 1.5 })
    world.particles.burst(7, this.x, this.y - this.body.h - 5, {
      speed: 34, speedVar: 16, life: 0.34, lifeVar: 0.1, size: 1.7, sizeEnd: 0.2,
      color, colorEnd: PAL.cream, shape: 'spark', additive: true, drag: 0.12,
      spawnRadius: 4,
    })
  }

  // ── Contact ────────────────────────────────────────────────────────────────

  /**
   * Contact rules with the player.
   *
   * The stomp test is a crossing test, not a position test: the feet must have
   * been above the enemy's top edge at the start of the step and be at or below
   * it now, while descending. The old midline test rejected a fast fall (the
   * feet were already past the midline by the time anything was sampled) and
   * accepted a shallow side bump into a tall enemy's head.
   */
  protected checkPlayer(world: World): void {
    const player = world.player() as Player | null
    if (!player || player.dead) return

    // Reach attacks are tested before bodies: a sabre that connects should read
    // as the sabre, not as walking into the Marine holding it.
    if (this.state === 'attack' && !this.struck) {
      const box = this.strikeBox()
      if (box && rectsOverlap(box, player.rect())) {
        this.struck = true
        world.hitstop(4)
        player.hurt(world, {
          amount: 1,
          dirX: this.facing,
          dirY: -0.4,
          sourceId: this.id,
          kind: 'melee',
        })
      }
    }

    const a = this.hurtbox()
    if (!rectsOverlap(a, player.rect())) return

    const feetWas = player.body.py
    const feetNow = player.body.y
    const topWas = this.body.py - this.body.h
    const topNow = this.body.y - this.body.h
    const descending = player.body.vy > 0 || feetNow > feetWas
    const crossed = feetWas <= topWas + STOMP_SLOP && feetNow >= topNow - STOMP_SLOP

    if (descending && crossed) {
      if (this.stompable) {
        player.bounce(world, world.input.held.jump)
        this.takeStomp(world, player)
        return
      }
      // Landing on something you cannot stomp still has to read as a rebuff,
      // not as a mystery hit from the side.
      this.repel(world, player)
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

  /**
   * A landed stomp. It goes through the health pool rather than straight to
   * `defeat` so that a two-hit enemy — the zombie, an armoured Marine — is
   * knocked flat by the first landing and finished by the second, which is the
   * whole reason `health` exists on an enemy.
   */
  protected takeStomp(world: World, player: Player): void {
    const lethal = !this.damageable || this.health - this.stompDamage <= 0
    if (lethal) {
      this.defeat(world, 'stomp')
      return
    }
    this.health -= this.stompDamage
    this.flash = 1
    this.iframes = 0.25
    world.audio.playSfx('stomp', { volume: 0.8, rate: 0.9 })
    world.hitstop(4)
    world.shake(0.1)
    world.particles.burst(10, this.x, this.y - this.body.h, {
      speed: 130, speedVar: 70, life: 0.3, size: 2.2, sizeEnd: 0.3, angle: -Math.PI / 2,
      spread: Math.PI, color: PAL.cream, colorEnd: this.accent, shape: 'spark',
      additive: true, drag: 0.08,
    })
    this.squash(1.45, 0.6)
    this.knockback(world, 0, 0, 0.5, 0)
    this.onSurvivedHit(
      { amount: this.stompDamage, dirX: 0, dirY: 1, sourceId: player.id, kind: 'stomp' },
      world,
    )
  }

  /**
   * The reach of the current attack, live only during `attack`. Enemies that
   * only hurt by touching return null and never think about it again.
   */
  protected strikeBox(): Rect | null {
    return null
  }

  /** A rect `reach` deep in front of the enemy — the common strike shape. */
  protected reachBox(reach: number, height = this.body.h * 0.7, lift = 0): Rect {
    return {
      x: this.facing === 1 ? this.x : this.x - reach,
      y: this.y - this.body.h * 0.9 + lift,
      w: reach,
      h: height,
    }
  }

  /** The player landed on an un-stompable back. Bounce them off and bill them. */
  protected repel(world: World, player: Player): void {
    world.audio.playSfx('bump', { volume: 0.7 })
    world.particles.burst(8, player.x, this.y - this.body.h, {
      speed: 90, speedVar: 40, life: 0.24, size: 2, sizeEnd: 0.3,
      color: PAL.cream, colorEnd: this.accent, shape: 'spark', additive: true, drag: 0.1,
    })
    if (this.contactDamage) {
      player.hurt(world, {
        amount: 1, dirX: player.x < this.x ? -1 : 1, dirY: -1, sourceId: this.id, kind: 'melee',
      })
    } else {
      player.body.vy = -190
    }
  }

  // ── Damage ─────────────────────────────────────────────────────────────────

  damage(hit: Hit, world: World): boolean {
    if (!this.damageable || this.dyingFor >= 0) return false
    this.health -= hit.amount
    this.flash = 1
    this.iframes = 0.2
    if (this.health <= 0) {
      this.defeat(world, hit.kind === 'stomp' ? 'stomp' : 'melee')
      return true
    }
    world.audio.playSfx('boss-hit', { volume: 0.5 })
    world.hitstop(3)
    world.particles.burst(9, this.x, this.y - this.body.h * 0.6, {
      speed: 120, speedVar: 60, life: 0.28, size: 2, sizeEnd: 0.3,
      color: PAL.cream, colorEnd: this.accent, shape: 'spark', additive: true, drag: 0.08,
    })
    this.knockback(world, Math.sign(hit.dirX) || this.facing * -1, 110, 0.34)
    this.onSurvivedHit(hit, world)
    return true
  }

  /** Hook for enemies that change behaviour once wounded (the zombie). */
  protected onSurvivedHit(_hit: Hit, _world: World): void {}

  /**
   * Shove and stagger. Stagger is the readable part: an enemy that flinches has
   * told you the hit landed even when its health bar is invisible.
   */
  knockback(world: World, dirX: number, power = 120, stagger = 0.35, lift = -120): void {
    const scale = 1 - clamp(this.knockbackResist, 0, 1)
    if (scale > 0) {
      this.body.vx = dirX * power * scale
      if (this.gravity > 0 && this.body.grounded) this.body.vy = lift * scale
    }
    this.squash(1.26, 0.78)
    if (stagger > 0 && scale > 0) {
      this.stunTime = stagger
      this.setState('stunned', world)
    }
  }

  // ── Defeat ─────────────────────────────────────────────────────────────────

  defeat(world: World, how: 'stomp' | 'melee' | 'explosion' = 'melee'): void {
    if (this.dyingFor >= 0 || this.dead) return
    const player = world.player() as Player | null
    const chain = player ? Math.min(player.chain, SCORE.chain.length - 1) : 0
    const multiplier = how === 'stomp' ? SCORE.chain[chain] : 1
    const points = this.points * multiplier
    if (points > 0) world.score(points, this.x, this.y - this.body.h)
    // The multiplier has been quietly doubling the score since the chain was
    // built; nothing ever said so. A chain you cannot see is a chain nobody
    // goes for, so from the second link it announces itself above the points.
    if (multiplier > 1) world.chainCalled(multiplier, this.x, this.y - this.body.h)
    world.events.emit('enemy:defeat', { x: this.x, y: this.y, type: this.sheetKey, points })

    world.audio.playSfx(
      how === 'stomp' ? 'stomp' : how === 'explosion' ? 'explosion' : 'kick',
      // Each link rings a step higher. Five steps, then it holds — a chain that
      // kept climbing would leave the last ones inaudible.
      how === 'stomp' ? { rate: 1 + Math.min(chain, 5) * 0.11 } : {},
    )
    world.hitstop(how === 'stomp' ? 5 : 8)
    world.shake(how === 'explosion' ? 0.3 : 0.14)

    const cy = this.y - this.body.h / 2
    world.particles.burst(18, this.x, cy, {
      speed: 140, speedVar: 80, life: 0.45, lifeVar: 0.18, size: 2.4, sizeEnd: 0.4,
      color: PAL.cream, colorEnd: PAL.mist, shape: 'circle', gravity: 300, drag: 0.05,
    })
    world.particles.burst(10, this.x, cy, {
      speed: 190, speedVar: 90, life: 0.34, lifeVar: 0.12, size: 2, sizeEnd: 0.2,
      color: this.accent, colorEnd: PAL.cream, shape: 'spark', additive: true, drag: 0.04, spin: 9,
    })
    this.onDefeat(world, how)
    this.dropLoot(world)

    if (how === 'stomp' && this.has('squash')) {
      this.dyingFor = 0
      this.play('squash', true)
      this.body.vx = 0
      this.speed = 0
      this.contactDamage = false
      this.stompable = false
      this.damageable = false
    } else {
      this.dead = true
    }
  }

  /** Per-type defeat spectacle — shrapnel, a released ghost, a popped bladder. */
  protected onDefeat(_world: World, _how: 'stomp' | 'melee' | 'explosion'): void {}

  protected dropLoot(world: World): void {
    for (const l of this.loot) {
      if (world.rng.next() > (l.chance ?? 1)) continue
      const n = l.count ?? 1
      const spread = l.spread ?? 10
      for (let i = 0; i < n; i++) {
        const x = this.x + (n === 1 ? 0 : world.rng.range(-spread, spread))
        const e = createEntity({ type: l.type, tx: 0, ty: 0 }, x, this.y - this.body.h * 0.4)
        if (e) world.spawn(e)
      }
    }
  }

  // ── Draw ───────────────────────────────────────────────────────────────────

  draw(rc: RenderContext, sx: number, sy: number): void {
    const { ctx } = rc
    if (this.body.grounded) {
      ctx.save()
      ctx.globalAlpha = 0.28
      ctx.fillStyle = '#0B1020'
      ctx.beginPath()
      ctx.ellipse(sx, sy, this.body.w * 0.6, 2.2, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    const frame = this.frame()
    if (frame && this.sheet) {
      super.draw(rc, sx, sy)
      if (this.flash > 0.01) {
        ctx.save()
        ctx.translate(sx, sy)
        if (this.squashX !== 1 || this.squashY !== 1) ctx.scale(this.squashX, this.squashY)
        if (this.facing === -1) ctx.scale(-1, 1)
        ctx.globalAlpha = this.flash
        ctx.globalCompositeOperation = 'lighter'
        ctx.drawImage(
          this.sheet.image, frame.sx, frame.sy, frame.sw, frame.sh,
          frame.ox, frame.oy, frame.w, frame.h,
        )
        ctx.restore()
      }
    } else {
      this.drawFallback(rc, sx, sy)
    }

    this.drawTell(rc, sx, sy)
  }

  /** The telegraph glyph: a chevron that fills as the wind-up completes. */
  protected drawTell(rc: RenderContext, sx: number, sy: number): void {
    if (!this.showTell || this.state !== 'alert' || this.alertTime <= 0) return
    const t = clamp(this.stateTime / this.alertTime, 0, 1)
    const { ctx } = rc
    const y = sy - this.body.h - 7 - t * 3
    ctx.save()
    ctx.globalAlpha = 0.35 + t * 0.65
    ctx.translate(sx, y)
    ctx.scale(1 + t * 0.25, 1 + t * 0.25)
    ctx.fillStyle = PAL.ink
    ctx.beginPath()
    ctx.moveTo(0, -4.6)
    ctx.lineTo(4.2, 3.4)
    ctx.lineTo(-4.2, 3.4)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = t > 0.7 ? PAL.danger : this.accent
    ctx.beginPath()
    ctx.moveTo(0, -3.2)
    ctx.lineTo(3.1, 2.6)
    ctx.lineTo(-3.1, 2.6)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = PAL.ink
    ctx.fillRect(-0.6, -1.6, 1.2, 2.4)
    ctx.fillRect(-0.6, 1.4, 1.2, 1)
    ctx.restore()
  }

  /**
   * Stand-in art for a sheet key the art layer has not built.
   *
   * It is deliberately not a grey box: silhouette, terminator, rim and contour
   * are the four things the real sprites are judged on, so the placeholder is
   * built from the same four and a missing key reads as unfinished rather than
   * as a bug.
   */
  protected drawFallback(rc: RenderContext, sx: number, sy: number): void {
    const { ctx } = rc
    const w = this.body.w
    const h = this.body.h
    const c = cel(this.accent)
    ctx.save()
    ctx.translate(sx, sy)
    ctx.scale(this.squashX, this.squashY)
    if (this.facing === -1) ctx.scale(-1, 1)

    const path = new Path2D()
    switch (this.fallbackShape) {
      case 'ball':
      case 'spiky':
        path.ellipse(0, -h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
        break
      case 'flyer':
        path.ellipse(0, -h / 2, w / 2, h * 0.38, 0, 0, Math.PI * 2)
        break
      case 'blob':
        path.moveTo(-w / 2, 0)
        path.quadraticCurveTo(-w * 0.62, -h * 0.9, 0, -h)
        path.quadraticCurveTo(w * 0.62, -h * 0.9, w / 2, 0)
        path.closePath()
        break
      default: {
        const r = Math.min(w, h) * 0.3
        path.moveTo(-w / 2 + r, -h)
        path.arcTo(w / 2, -h, w / 2, -h + r, r)
        path.lineTo(w / 2, -r)
        path.arcTo(w / 2, 0, w / 2 - r, 0, r)
        path.lineTo(-w / 2 + r, 0)
        path.arcTo(-w / 2, 0, -w / 2, -r, r)
        path.lineTo(-w / 2, -h + r)
        path.arcTo(-w / 2, -h, -w / 2 + r, -h, r)
        path.closePath()
      }
    }

    // Flat lit tone, then the shadow half cut by a hard terminator.
    ctx.fillStyle = c.core
    ctx.fill(path)
    ctx.save()
    ctx.clip(path)
    ctx.fillStyle = c.shade
    ctx.beginPath()
    ctx.moveTo(-w, -h * 1.2)
    ctx.lineTo(w, -h * 1.2 + h * 0.55)
    ctx.lineTo(w, 1)
    ctx.lineTo(-w, 1)
    ctx.closePath()
    ctx.fill()
    // Rim on the key side (up-left, matching the art layer's light).
    ctx.strokeStyle = rgba(mix(c.light, PAL.white, 0.4), 0.85)
    ctx.lineWidth = 1.1
    ctx.translate(1.1, 1.1)
    ctx.stroke(path)
    ctx.restore()

    ctx.strokeStyle = c.line
    ctx.lineWidth = 0.9
    ctx.stroke(path)

    if (this.fallbackShape === 'spiky') {
      ctx.fillStyle = c.line
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        ctx.beginPath()
        ctx.moveTo(Math.cos(a) * w * 0.42, -h / 2 + Math.sin(a) * h * 0.42)
        ctx.lineTo(Math.cos(a) * w * 0.72, -h / 2 + Math.sin(a) * h * 0.72)
        ctx.lineTo(Math.cos(a + 0.5) * w * 0.42, -h / 2 + Math.sin(a + 0.5) * h * 0.42)
        ctx.closePath()
        ctx.fill()
      }
    }

    // Two eyes so the placeholder still has a front and a back.
    if (this.fallbackShape !== 'ball' && this.fallbackShape !== 'spiky') {
      ctx.fillStyle = PAL.cream
      ctx.beginPath()
      ctx.ellipse(w * 0.16, -h * 0.78, 2, 2.4, 0, 0, Math.PI * 2)
      ctx.ellipse(-w * 0.16, -h * 0.78, 1.7, 2.1, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = PAL.ink
      ctx.beginPath()
      ctx.ellipse(w * 0.2, -h * 0.78, 0.9, 1.3, 0, 0, Math.PI * 2)
      ctx.ellipse(-w * 0.12, -h * 0.78, 0.8, 1.2, 0, 0, Math.PI * 2)
      ctx.fill()
    }

    if (this.flash > 0.01) {
      ctx.globalAlpha = this.flash
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = PAL.white
      ctx.fill(path)
    }
    ctx.restore()
  }
}

/**
 * Anything an enemy throws, drops or fires.
 *
 * Lives here rather than with the enemies because the bosses need exactly the
 * same contract: travel, hit the player once, die against terrain, and always
 * leave something behind so the shot reads as having landed somewhere.
 */
export abstract class EnemyProjectile extends Entity {
  readonly kind = 'projectile'
  /** Seconds before it gives up. */
  maxAge = 4
  /** Damage dealt to the player. */
  damageAmount = 1
  /** Does terrain stop it? */
  stoppedByTerrain = true
  /** Can the player's attack swat it out of the air? */
  swattable = false
  accent: string = PAL.steel

  constructor(x: number, y: number, w: number, h: number, gravityScale = 0) {
    super(x, y, w, h)
    this.depth = 70
    this.tags.add('hazard')
    this.body.gravityScale = gravityScale
    this.body.collidesWithTiles = true
  }

  update(dt: number, world: World): void {
    this.age += dt
    if (this.body.gravityScale !== 0) {
      this.body.vy += PHYS.gravity * this.body.gravityScale * dt
    }
    this.onFly(dt, world)
    const res = moveBody(this.body, world.map, dt, { useSlopes: false })
    if ((this.stoppedByTerrain && (res.hitX || res.hitY)) || this.age > this.maxAge) {
      this.expire(world, res.hitX || res.hitY)
      return
    }
    const p = world.player() as Player | null
    if (p && !p.dead && this.damageAmount > 0 && rectsOverlap(this.rect(), p.rect())) {
      p.hurt(world, {
        amount: this.damageAmount,
        dirX: Math.sign(this.body.vx) || 1,
        dirY: -1,
        sourceId: this.id,
        kind: 'projectile',
      })
      this.expire(world, false)
    }
  }

  damage(_hit: Hit, world: World): boolean {
    if (!this.swattable) return false
    this.expire(world, true)
    return true
  }

  /** Per-shot steering. */
  protected onFly(_dt: number, _world: World): void {}

  /** Called once when the shot ends. Override for explosions and puffs. */
  protected expire(world: World, _onTerrain: boolean): void {
    this.dead = true
    world.particles.burst(6, this.x, this.y, {
      speed: 70, speedVar: 40, life: 0.25, size: 1.6, sizeEnd: 0.3,
      color: this.accent, colorEnd: PAL.mist, shape: 'spark', additive: true, drag: 0.1,
    })
  }

  hurtbox(): Rect {
    return this.rect()
  }
}
