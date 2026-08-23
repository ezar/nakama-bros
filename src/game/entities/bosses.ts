import type { Hit, RenderContext, SpriteSheet } from '../../types'
import { TILE } from '../../types'
import { Entity } from './Entity'
import type { World } from '../world'
import { registerEntity } from './registry'
import { moveBody } from '../../physics/move'
import { PHYS } from '../config'
import { art } from '../../art'
import { buildBossSheet } from '../../art/bossArt'
import { PAL } from '../../art/palette'
import { cel, mix, rgba } from '../../art/color'
import { clamp, clamp01, rectsOverlap } from '../../engine/math'
import { Blast, Knife, Shockwave, WaterShot } from './enemies'
import type { Player } from './Player'

/**
 * Boss fights.
 *
 * A boss here is not a big enemy with more health. It is a three-act script:
 * every act has its own verbs, every attack has a wind-up you can read and a
 * window afterwards where the boss is yours, and the fight only gets faster
 * because the *patterns* change, never because a number went up.
 *
 * The shared scaffolding below owns the parts that must be identical across all
 * of them — the timeline, the vulnerability contract, the arena, the phase
 * escalation and the death sequence — so a concrete boss is just a table of
 * moves and a way of walking.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Sheets
// ─────────────────────────────────────────────────────────────────────────────

const sheetCache = new Map<string, SpriteSheet | null>()

/**
 * Look a boss sheet up by key, building it on first use.
 *
 * The art layer may expose bosses through the shared library, or only through
 * `buildBossSheet`, or not yet at all. All three have to be survivable: a
 * missing key falls through to the boss's own painter rather than throwing, so
 * an unfinished art pass costs fidelity and never a crash.
 */
function bossSheet(key: string): SpriteSheet | null {
  const cached = sheetCache.get(key)
  if (cached !== undefined) return cached
  let sheet: SpriteSheet | null = null
  try {
    const lib = art() as { bosses?: Record<string, SpriteSheet> }
    sheet = lib.bosses?.[key] ?? null
  } catch {
    // The art library is not up yet. Do not cache — try again next step.
    return null
  }
  if (!sheet) {
    try {
      sheet = buildBossSheet(key)
    } catch {
      sheet = null
    }
  }
  sheetCache.set(key, sheet)
  return sheet
}

/**
 * Build a boss sheet ahead of time.
 *
 * A boss sheet is 10-18 MB of texture and takes a visible fraction of a second
 * to rasterise, so the level loader should call this while the loading screen
 * is still up rather than letting the first `update` pay for it mid-fight.
 */
export function prewarmBoss(key: string): void {
  bossSheet(key)
}

// ─────────────────────────────────────────────────────────────────────────────
// Move & phase description
// ─────────────────────────────────────────────────────────────────────────────

/** One attack, as a timeline the base class runs. */
export interface BossMove {
  name: string
  /** Seconds of readable wind-up before anything can hurt you. */
  tell: number
  /** Seconds the attack itself lasts. */
  active: number
  /** Seconds the boss is open afterwards. The whole fight lives here. */
  recover: number
  /** Skip this move unless the player is within this distance. */
  range?: number
  /** Colour of the telegraph glyph, when this attack wants its own. */
  color?: string
  /** Wind-up begins. */
  start?: (world: World) => void
  /** The attack fires. */
  fire?: (world: World) => void
  /** Every step of the active window; `t` runs 0..1. */
  during?: (t: number, dt: number, world: World) => void
  /** The active window ends and the open window begins. */
  end?: (world: World) => void
}

export interface BossPhase {
  /** Health fraction at or below which this phase begins. */
  at: number
  /** Seconds of breathing room between attacks. */
  interval: number
  /** Movement speed multiplier for this act. */
  speed: number
  /** Music layer intensity while this act runs. */
  intensity: number
  /** Move names, in the order they are used. */
  moves: string[]
}

type BossState = 'wait' | 'tell' | 'strike' | 'open' | 'stagger'

/** Vertical bar of forgiveness on the boss stomp test, in world units. */
const STOMP_SLOP = 3

// ─────────────────────────────────────────────────────────────────────────────
// Base
// ─────────────────────────────────────────────────────────────────────────────

export abstract class Boss extends Entity {
  readonly kind = 'boss'
  abstract displayName: string
  /** Key into the boss art library. */
  abstract sheetKey: string

  maxHealth = 8
  phases: BossPhase[] = [
    { at: 1, interval: 1.4, speed: 1, intensity: 0.8, moves: [] },
  ]
  /** Attack table, filled by the subclass in its constructor. */
  protected moves: Record<string, BossMove> = {}

  /** Can the player finish a jump on its head while it is open? */
  stompable = true
  /** Contact damage while not staggered. */
  contactDamage = true
  accent: string = PAL.danger

  protected phase = 0
  protected state: BossState = 'wait'
  protected stateTime = 0
  protected current: BossMove | null = null
  protected moveIndex = 0
  protected defeated = false
  protected defeatTimer = 0
  private popTimer = 0
  private pops = 0
  private introDone = false

  /** Left and right walls of the room, resolved from the tilemap on entry. */
  protected arenaL = -Infinity
  protected arenaR = Infinity
  protected arenaTop = 0
  protected homeX = 0
  protected homeY = 0
  private arenaReady = false

  constructor(x: number, y: number, w: number, h: number) {
    super(x, y, w, h)
    this.tags.add('boss')
    this.depth = 80
    this.cullable = false
    this.health = this.maxHealth
    this.homeX = x
    this.homeY = y
  }

  // ── Sheet ──────────────────────────────────────────────────────────────────

  /** Phase two art stands in for every act after the first. */
  protected animName(base: string): string {
    if (this.phase >= 1 && this.sheet?.anims[`p2-${base}`]) return `p2-${base}`
    return base
  }

  protected playState(base: string, restart = false): void {
    const name = this.animName(base)
    if (this.sheet?.anims[name]) this.play(name, restart)
  }

  // ── Arena ──────────────────────────────────────────────────────────────────

  /**
   * Find the walls of the room, once.
   *
   * A boss that can be walked away from is not a boss; a boss that walks out of
   * its own arena is a bug. Both are solved by resolving the room from the
   * terrain at the boss's chest height and never leaving it.
   */
  private resolveArena(world: World): void {
    this.arenaReady = true
    const ty = Math.floor((this.homeY - this.body.h * 0.5) / TILE)
    const tx0 = Math.floor(this.homeX / TILE)
    let l = tx0
    let r = tx0
    for (let i = 1; i <= 36; i++) {
      if (l === tx0 - i + 1 && !world.map.flags(tx0 - i, ty).solid) l = tx0 - i
      if (r === tx0 + i - 1 && !world.map.flags(tx0 + i, ty).solid) r = tx0 + i
    }
    this.arenaL = l * TILE
    this.arenaR = (r + 1) * TILE
    // The ceiling: the first solid tile above the spawn, or three body heights.
    let top = this.homeY - this.body.h * 3
    for (let i = 1; i <= 24; i++) {
      const t = Math.floor((this.homeY - i * TILE) / TILE)
      if (world.map.flags(tx0, t).solid) {
        top = (t + 1) * TILE
        break
      }
    }
    this.arenaTop = top
  }

  protected clampToArena(): void {
    const half = this.body.w / 2 + 2
    if (this.body.x < this.arenaL + half) {
      this.body.x = this.arenaL + half
      if (this.body.vx < 0) this.body.vx = 0
    }
    if (this.body.x > this.arenaR - half) {
      this.body.x = this.arenaR - half
      if (this.body.vx > 0) this.body.vx = 0
    }
    if (this.body.y - this.body.h < this.arenaTop) {
      this.body.y = this.arenaTop + this.body.h
      if (this.body.vy < 0) this.body.vy = 0
    }
  }

  /** A random x inside the room, at least `margin` from either wall. */
  protected arenaX(world: World, margin = 30): number {
    const l = Number.isFinite(this.arenaL) ? this.arenaL + margin : this.homeX - 120
    const r = Number.isFinite(this.arenaR) ? this.arenaR - margin : this.homeX + 120
    return r > l ? world.rng.range(l, r) : this.homeX
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  update(dt: number, world: World): void {
    this.tickAnim(dt)
    this.sheet = bossSheet(this.sheetKey)
    if (!this.arenaReady) this.resolveArena(world)
    if (!this.introDone) {
      this.introDone = true
      world.audio.setIntensity(this.phases[0].intensity)
      this.onIntro(world)
    }

    if (this.defeated) {
      this.updateDefeat(dt, world)
      return
    }

    this.stateTime += dt
    this.runTimeline(dt, world)
    this.move(dt, world)
    moveBody(this.body, world.map, dt, {})
    this.clampToArena()
    this.touchPlayer(world)
  }

  /** The state timeline. Subclasses drive behaviour through move callbacks. */
  private runTimeline(dt: number, world: World): void {
    const phase = this.phases[this.phase]
    switch (this.state) {
      case 'wait':
        if (this.stateTime >= phase.interval) this.beginMove(world)
        else this.playState('walk')
        break
      case 'tell':
        if (this.stateTime >= (this.current?.tell ?? 0)) {
          this.state = 'strike'
          this.stateTime = 0
          this.playState('attack', true)
          this.current?.fire?.(world)
        }
        break
      case 'strike': {
        const m = this.current
        if (m) {
          m.during?.(clamp01(this.stateTime / Math.max(0.001, m.active)), dt, world)
          if (this.stateTime >= m.active) {
            this.state = 'open'
            this.stateTime = 0
            this.playState('idle', true)
            m.end?.(world)
            this.onOpen(world)
          }
        } else {
          this.state = 'wait'
          this.stateTime = 0
        }
        break
      }
      case 'open':
        if (this.stateTime >= (this.current?.recover ?? 0.8)) {
          this.state = 'wait'
          this.stateTime = 0
          this.current = null
        }
        break
      case 'stagger':
        if (this.stateTime >= 1.1) {
          this.state = 'wait'
          this.stateTime = 0
          this.current = null
        }
        break
    }
  }

  private beginMove(world: World): void {
    const phase = this.phases[this.phase]
    if (phase.moves.length === 0) return
    // Walk the list in order, skipping moves that need a range they do not
    // have. Order is choreography: a boss whose attacks arrive at random is
    // just noise.
    for (let i = 0; i < phase.moves.length; i++) {
      const name = phase.moves[(this.moveIndex + i) % phase.moves.length]
      const m = this.moves[name]
      if (!m) continue
      if (m.range !== undefined && this.distToPlayer(world) > m.range) continue
      this.moveIndex = (this.moveIndex + i + 1) % phase.moves.length
      this.current = m
      this.state = 'tell'
      this.stateTime = 0
      this.playState('windup', true)
      this.tell(world, m.color ?? this.accent)
      m.start?.(world)
      return
    }
    // Nothing was in range: hold the beat and try again next tick.
    this.stateTime = Math.max(0, phase.interval - 0.25)
  }

  /** The universal wind-up: same sound, same sparks, whatever is coming. */
  protected tell(world: World, color: string): void {
    world.audio.playSfx('warn', { volume: 0.4, rate: 0.9 })
    world.particles.burst(14, this.x, this.y - this.body.h - 6, {
      speed: 60, speedVar: 30, life: 0.45, lifeVar: 0.15, size: 2.6, sizeEnd: 0.3,
      color, colorEnd: PAL.cream, shape: 'spark', additive: true, drag: 0.1,
      spawnRadius: 8,
    })
  }

  /** True while the player's hits count. */
  get vulnerable(): boolean {
    return this.state === 'open' || this.state === 'stagger'
  }

  protected distToPlayer(world: World): number {
    const p = world.player()
    if (!p) return Infinity
    return Math.hypot(p.x - this.x, p.y - this.y)
  }

  protected dirToPlayer(world: World): 1 | -1 {
    const p = world.player()
    if (!p) return this.facing
    return p.x >= this.x ? 1 : -1
  }

  protected facePlayer(world: World): void {
    const p = world.player()
    if (p && Math.abs(p.x - this.x) > 4) this.facing = p.x > this.x ? 1 : -1
  }

  /** Continuous locomotion. Runs every step, including during attacks. */
  protected abstract move(dt: number, world: World): void

  /** Called once, the first step the boss is simulated. */
  protected onIntro(_world: World): void {}

  /** Called when an attack ends and the open window starts. */
  protected onOpen(_world: World): void {}

  /** Called once when a new act begins. */
  protected onPhase(_phase: number, _world: World): void {}

  // ── Contact ────────────────────────────────────────────────────────────────

  protected touchPlayer(world: World): void {
    const player = world.player() as Player | null
    if (!player || player.dead) return
    if (!rectsOverlap(this.hurtbox(), player.rect())) return

    const feetWas = player.body.py
    const feetNow = player.body.y
    const topWas = this.body.py - this.body.h
    const topNow = this.body.y - this.body.h
    const descending = player.body.vy > 0 || feetNow > feetWas
    const crossed = feetWas <= topWas + STOMP_SLOP && feetNow >= topNow - STOMP_SLOP

    if (descending && crossed && this.stompable) {
      player.bounce(world, world.input.held.jump)
      this.damage(
        { amount: 1, dirX: 0, dirY: 1, sourceId: player.id, kind: 'stomp' },
        world,
      )
      return
    }
    // An open boss cannot also be a wall of contact damage: the window is only
    // a window if the player can stand in it.
    if (!this.contactDamage || this.vulnerable) return
    player.hurt(world, {
      amount: 1, dirX: player.x < this.x ? -1 : 1, dirY: -1, sourceId: this.id, kind: 'melee',
    })
  }

  // ── Damage ─────────────────────────────────────────────────────────────────

  damage(hit: Hit, world: World): boolean {
    if (this.defeated || this.iframes > 0) return false
    if (!this.vulnerable) {
      this.clang(world, hit)
      return false
    }
    this.health -= hit.amount
    this.iframes = 0.45
    this.flash = 1
    this.squash(1.2, 0.84)
    this.playState('hurt', true)
    world.audio.playSfx('boss-hit')
    world.hitstop(9)
    world.shake(0.3)
    world.events.emit('boss:hit', { x: this.x, y: this.y, healthLeft: this.health / this.maxHealth })
    world.particles.burst(24, this.x, this.y - this.body.h * 0.55, {
      speed: 180, speedVar: 90, life: 0.5, lifeVar: 0.2, size: 2.8, sizeEnd: 0.4,
      color: PAL.danger, colorEnd: PAL.ember, shape: 'spark', additive: true,
      drag: 0.05, spin: 10,
    })

    if (this.health <= 0) {
      this.defeat(world)
      return true
    }

    const frac = this.health / this.maxHealth
    let advanced = false
    while (this.phase < this.phases.length - 1 && frac <= this.phases[this.phase + 1].at) {
      this.phase++
      advanced = true
    }
    if (advanced) this.enterPhase(world)
    return true
  }

  /**
   * A hit that arrived outside the window.
   *
   * It must never be silent: an attack that does nothing and looks like nothing
   * reads as a broken hitbox. It rings, it sparks, and it shoves the player back
   * out of a place they should not be standing.
   */
  protected clang(world: World, hit: Hit): void {
    this.iframes = 0.18
    world.audio.playSfx('bump', { volume: 0.8, rate: 1.5 })
    world.hitstop(3)
    const px = this.x + (hit.dirX >= 0 ? -this.body.w * 0.5 : this.body.w * 0.5)
    world.particles.burst(10, px, this.y - this.body.h * 0.6, {
      speed: 150, speedVar: 70, life: 0.28, size: 2.2, sizeEnd: 0.3,
      color: PAL.white, colorEnd: PAL.steel, shape: 'spark', additive: true, drag: 0.06,
    })
    const p = world.player() as Player | null
    if (p) p.body.vx = (hit.dirX >= 0 ? -1 : 1) * 130
  }

  private enterPhase(world: World): void {
    const p = this.phases[this.phase]
    this.state = 'stagger'
    this.stateTime = 0
    this.current = null
    this.moveIndex = 0
    this.body.vx = 0
    world.events.emit('boss:phase', { phase: this.phase })
    world.audio.setIntensity(p.intensity)
    world.audio.playSfx('warn')
    world.hitstop(14)
    world.shake(0.5)
    this.playState('hurt', true)
    world.particles.burst(40, this.x, this.y - this.body.h * 0.5, {
      speed: 210, speedVar: 110, life: 0.8, lifeVar: 0.3, size: 3, sizeEnd: 0.4,
      color: this.accent, colorEnd: PAL.cream, shape: 'spark', additive: true,
      drag: 0.04, spin: 8, spawnRadius: this.body.w * 0.5,
    })
    this.onPhase(this.phase, world)
  }

  // ── Defeat ─────────────────────────────────────────────────────────────────

  protected defeat(world: World): void {
    this.defeated = true
    this.defeatTimer = 0
    this.popTimer = 0
    this.pops = 0
    this.body.vx = 0
    this.body.vy = -140
    this.contactDamage = false
    this.stompable = false
    this.playState('defeat', true)
    world.audio.playSfx('boss-die')
    world.audio.stopMusic(1.2)
    world.hitstop(26)
    world.shake(0.6)
  }

  /**
   * The death sequence.
   *
   * One big bang is an event; a chain of them is a defeat. Small explosions
   * walk over the body for two seconds while it sags, each one costing a few
   * frames of hit-stop, and the last one is the one that clears the screen.
   */
  private updateDefeat(dt: number, world: World): void {
    this.defeatTimer += dt
    this.popTimer -= dt
    this.body.vy = Math.min(this.body.vy + PHYS.gravity * dt, PHYS.maxFall)
    moveBody(this.body, world.map, dt, {})
    this.clampToArena()

    if (this.popTimer <= 0 && this.defeatTimer < 2) {
      this.popTimer = world.rng.range(0.16, 0.3)
      this.pops++
      const bx = this.x + world.rng.range(-this.body.w * 0.5, this.body.w * 0.5)
      const by = this.y - world.rng.range(this.body.h * 0.1, this.body.h)
      const b = world.spawn(new Blast(bx, by, 14 + this.pops * 1.5, false, PAL.ember))
      b.detonate(world, 0.45)
      this.flash = 0.8
      this.squash(1.1 + world.rng.range(0, 0.1), 0.9)
    }

    if (world.rng.bool(0.5)) {
      world.particles.emit({
        x: this.x + world.rng.range(-this.body.w * 0.5, this.body.w * 0.5),
        y: this.y - world.rng.range(0, this.body.h),
        vx: world.rng.range(-20, 20), vy: world.rng.range(-50, -14),
        life: 0.9, lifeVar: 0.3, size: 3.4, sizeEnd: 9,
        color: mix(PAL.mist, PAL.slate, 0.4), colorEnd: rgba(PAL.slate, 0),
        shape: 'smoke', drag: 0.06,
      } as never)
    }

    if (this.defeatTimer > 2.3) {
      // The last one, and it is the loudest thing in the level.
      const b = world.spawn(new Blast(this.x, this.y - this.body.h * 0.5, 70, false, PAL.white))
      b.detonate(world, 1.6)
      world.shake(1)
      world.hitstop(20)
      world.particles.burst(70, this.x, this.y - this.body.h * 0.5, {
        speed: 260, speedVar: 140, life: 1.1, lifeVar: 0.4, size: 3.6, sizeEnd: 0.4,
        color: PAL.ember, colorEnd: PAL.danger, shape: 'spark', additive: true,
        spawnRadius: this.body.w * 0.6, drag: 0.03, spin: 8,
      })
      world.events.emit('boss:defeat', { x: this.x, y: this.y })
      this.onDefeated(world)
      this.dead = true
    }
  }

  /** Last word: drop the reward, open the gate, whatever the fight promised. */
  protected onDefeated(_world: World): void {}

  // ── Draw ───────────────────────────────────────────────────────────────────

  draw(rc: RenderContext, sx: number, sy: number): void {
    const { ctx } = rc
    // Contact shadow: a boss this size has to sit on the floor, not float.
    if (this.body.grounded) {
      ctx.save()
      ctx.globalAlpha = 0.3
      ctx.fillStyle = PAL.ink
      ctx.beginPath()
      ctx.ellipse(sx, sy, this.body.w * 0.7, 3.4, 0, 0, Math.PI * 2)
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
    this.drawOpening(rc, sx, sy)
  }

  /** The wind-up glyph, shared with the enemy roster so the read is learned once. */
  protected drawTell(rc: RenderContext, sx: number, sy: number): void {
    if (this.state !== 'tell' || !this.current) return
    const t = clamp01(this.stateTime / Math.max(0.001, this.current.tell))
    const { ctx } = rc
    ctx.save()
    ctx.translate(sx, sy - this.body.h - 12 - t * 4)
    ctx.scale(1.4 + t * 0.4, 1.4 + t * 0.4)
    ctx.globalAlpha = 0.4 + t * 0.6
    ctx.fillStyle = PAL.ink
    ctx.beginPath()
    ctx.moveTo(0, -4.6)
    ctx.lineTo(4.2, 3.4)
    ctx.lineTo(-4.2, 3.4)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = t > 0.7 ? PAL.danger : (this.current.color ?? this.accent)
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
   * The open window, drawn as a shrinking ring of light around the body.
   *
   * Without it the player has to learn the timing by dying. With it, "now" is
   * a thing you can see from across the room.
   */
  protected drawOpening(rc: RenderContext, sx: number, sy: number): void {
    if (!this.vulnerable) return
    const total = this.state === 'stagger' ? 1.1 : (this.current?.recover ?? 0.8)
    const t = clamp01(this.stateTime / total)
    const { ctx } = rc
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = (1 - t) * 0.5 + 0.15
    ctx.strokeStyle = PAL.gold
    ctx.lineWidth = 1.2
    ctx.setLineDash([5, 4])
    ctx.lineDashOffset = -this.age * 22
    ctx.beginPath()
    ctx.ellipse(sx, sy - this.body.h * 0.56, this.body.w * 0.85, this.body.h * 0.72, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  /**
   * Stand-in art when the sheet key is missing.
   *
   * Built from the same four things the real sheets are judged on — silhouette,
   * hard terminator, rim, ink contour — so an unbuilt boss reads as unfinished
   * rather than as a bug. Subclasses add their one identifying shape.
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
    path.moveTo(-w * 0.5, 0)
    path.quadraticCurveTo(-w * 0.62, -h * 0.55, -w * 0.34, -h * 0.82)
    path.quadraticCurveTo(0, -h * 1.04, w * 0.34, -h * 0.82)
    path.quadraticCurveTo(w * 0.62, -h * 0.55, w * 0.5, 0)
    path.closePath()

    ctx.fillStyle = c.core
    ctx.fill(path)
    ctx.save()
    ctx.clip(path)
    ctx.fillStyle = c.shade
    ctx.beginPath()
    ctx.moveTo(-w, -h * 1.3)
    ctx.lineTo(w, -h * 1.3 + h * 0.6)
    ctx.lineTo(w, 1)
    ctx.lineTo(-w, 1)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = rgba(mix(c.light, PAL.white, 0.45), 0.9)
    ctx.lineWidth = 1.4
    ctx.translate(1.4, 1.4)
    ctx.stroke(path)
    ctx.restore()
    ctx.strokeStyle = c.line
    ctx.lineWidth = 1.1
    ctx.stroke(path)

    // Eyes, so the placeholder has a front.
    ctx.fillStyle = PAL.cream
    ctx.beginPath()
    ctx.ellipse(w * 0.16, -h * 0.78, 3.4, 4, 0, 0, Math.PI * 2)
    ctx.ellipse(-w * 0.16, -h * 0.78, 3, 3.6, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = PAL.ink
    ctx.beginPath()
    ctx.ellipse(w * 0.2, -h * 0.78, 1.5, 2.2, 0, 0, Math.PI * 2)
    ctx.ellipse(-w * 0.12, -h * 0.78, 1.4, 2, 0, 0, Math.PI * 2)
    ctx.fill()

    this.drawFallbackMark(ctx, w, h, c.line)

    if (this.flash > 0.01) {
      ctx.globalAlpha = this.flash
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = PAL.white
      ctx.fill(path)
    }
    ctx.restore()
  }

  /** The one shape that says which boss this is. Drawn in body space. */
  protected drawFallbackMark(
    _ctx: CanvasRenderingContext2D, _w: number, _h: number, _line: string,
  ): void {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared boss hazards
// ─────────────────────────────────────────────────────────────────────────────

/** Find the floor under a world x, searching down from `fromY`. */
function groundYAt(world: World, x: number, fromY: number, maxTiles = 24): number {
  const tx = Math.floor(x / TILE)
  let ty = Math.floor(fromY / TILE)
  for (let i = 0; i < maxTiles; i++, ty++) {
    if (world.map.flags(tx, ty).solid) return ty * TILE
  }
  return fromY + maxTiles * TILE
}

/**
 * A ground telegraph.
 *
 * Every "something is about to happen *there*" in these fights is this entity:
 * a marker that grows on the floor for a fixed count and then hands off to
 * whatever it promised. Keeping it one class keeps the promise identical.
 */
export class Warning extends Entity {
  readonly kind = 'fx'
  private delay: number
  private color: string
  private radius: number
  private done: (world: World) => void

  constructor(x: number, y: number, delay: number, color: string, radius: number, done: (world: World) => void) {
    super(x, y, radius * 2, 4)
    this.delay = delay
    this.color = color
    this.radius = radius
    this.done = done
    this.depth = 40
    this.body.collidesWithTiles = false
  }

  update(dt: number, world: World): void {
    this.age += dt
    if (world.rng.bool(0.3)) {
      world.particles.emit({
        x: this.x + world.rng.range(-this.radius, this.radius), y: this.y - 1,
        vx: 0, vy: world.rng.range(-50, -14), life: 0.3, size: 1.6, sizeEnd: 0.2,
        color: this.color, colorEnd: PAL.cream, shape: 'spark', additive: true,
      })
    }
    if (this.age < this.delay) return
    this.dead = true
    this.done(world)
  }

  draw(rc: RenderContext, sx: number, sy: number): void {
    const { ctx } = rc
    const t = clamp01(this.age / this.delay)
    ctx.save()
    ctx.translate(sx, sy)
    ctx.globalCompositeOperation = 'lighter'
    // The outer ring holds still; the inner one closes. Reading the gap between
    // them is reading the fuse.
    ctx.globalAlpha = 0.35 + t * 0.4
    ctx.strokeStyle = this.color
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.ellipse(0, 0, this.radius, this.radius * 0.34, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 0.5 + t * 0.5
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.ellipse(0, 0, this.radius * (1 - t * 0.85), this.radius * 0.34 * (1 - t * 0.85), 0, 0, Math.PI * 2)
    ctx.stroke()
    if (t > 0.75) {
      ctx.globalAlpha = (t - 0.75) * 3
      ctx.fillStyle = mix(this.color, PAL.white, 0.5)
      ctx.beginPath()
      ctx.ellipse(0, 0, this.radius * 0.3, this.radius * 0.12, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
}

/** A column that erupts from the floor: water, sand or stone by colour. */
export class Column extends Entity {
  readonly kind = 'projectile'
  private peak: number
  private color: string
  private colorEnd: string
  private hit = false
  private life = 0.75

  constructor(x: number, groundY: number, peak = 62, color: string = PAL.sea, colorEnd: string = PAL.foam) {
    super(x, groundY, 20, 4)
    this.peak = peak
    this.color = color
    this.colorEnd = colorEnd
    this.depth = 72
    this.body.collidesWithTiles = false
    this.tags.add('hazard')
  }

  private height(): number {
    // Fast up, slow down: the shape of anything thrown by the ground.
    const t = clamp01(this.age / this.life)
    return t < 0.28 ? this.peak * (t / 0.28) : this.peak * (1 - (t - 0.28) / 0.72) ** 1.4
  }

  update(dt: number, world: World): void {
    if (this.age === 0) {
      world.audio.playSfx('splash', { volume: 0.6, rate: 0.8 })
      world.shake(0.16)
      world.particles.burst(16, this.x, this.y, {
        speed: 200, speedVar: 90, life: 0.5, lifeVar: 0.2, size: 2.6, sizeEnd: 0.4,
        angle: -Math.PI / 2, spread: 1.4, color: this.colorEnd, colorEnd: rgba(this.color, 0),
        shape: 'droplet', gravity: 380, drag: 0.04,
      })
    }
    this.age += dt
    if (this.age >= this.life) {
      this.dead = true
      return
    }
    const h = this.height()
    this.body.h = h
    if (this.hit || h < 6) return
    const p = world.player() as Player | null
    if (!p || p.dead) return
    if (!rectsOverlap({ x: this.x - 10, y: this.y - h, w: 20, h }, p.rect())) return
    this.hit = true
    p.hurt(world, {
      amount: 1, dirX: p.x < this.x ? -1 : 1, dirY: -1, sourceId: this.id, kind: 'hazard',
    })
  }

  draw(rc: RenderContext, sx: number, sy: number): void {
    const { ctx } = rc
    const h = this.height()
    if (h < 2) return
    const c = cel(this.color)
    ctx.save()
    ctx.translate(sx, sy)
    ctx.fillStyle = c.core
    ctx.beginPath()
    ctx.moveTo(-9, 0)
    ctx.quadraticCurveTo(-7, -h * 0.6, -3.5, -h)
    ctx.quadraticCurveTo(0, -h * 1.1, 3.5, -h)
    ctx.quadraticCurveTo(7, -h * 0.6, 9, 0)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = c.shade
    ctx.beginPath()
    ctx.moveTo(3.5, -h)
    ctx.quadraticCurveTo(7, -h * 0.6, 9, 0)
    ctx.lineTo(2, 0)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = this.colorEnd
    ctx.beginPath()
    ctx.ellipse(-1.5, -h + 3, 3.4, 4.4, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = c.line
    ctx.lineWidth = 0.9
    ctx.beginPath()
    ctx.moveTo(-9, 0)
    ctx.quadraticCurveTo(-7, -h * 0.6, -3.5, -h)
    ctx.quadraticCurveTo(0, -h * 1.1, 3.5, -h)
    ctx.quadraticCurveTo(7, -h * 0.6, 9, 0)
    ctx.stroke()
    ctx.restore()
  }
}

/** A bolt from the ceiling to the floor. Narrow, brief, absolute. */
export class Lightning extends Entity {
  readonly kind = 'projectile'
  private top: number
  private bottom: number
  private path: number[] = []
  private hit = false
  private life = 0.3

  constructor(x: number, top: number, bottom: number, seed: number) {
    super(x, bottom, 14, bottom - top)
    this.top = top
    this.bottom = bottom
    this.depth = 90
    this.body.collidesWithTiles = false
    this.tags.add('hazard')
    // A fixed jagged path, so the bolt flickers in place instead of writhing.
    let s = seed
    const rand = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff
      return s / 0x7fffffff
    }
    const steps = Math.max(3, Math.round((bottom - top) / 12))
    for (let i = 0; i <= steps; i++) this.path.push((rand() - 0.5) * 11)
  }

  update(dt: number, world: World): void {
    if (this.age === 0) {
      world.audio.playSfx('explosion', { volume: 0.55, rate: 1.9 })
      world.shake(0.22)
      world.particles.burst(18, this.x, this.bottom, {
        speed: 180, speedVar: 80, life: 0.4, lifeVar: 0.15, size: 2.4, sizeEnd: 0.3,
        angle: -Math.PI / 2, spread: 2.4, color: PAL.white, colorEnd: PAL.magic,
        shape: 'spark', additive: true, gravity: 200, drag: 0.05,
      })
    }
    this.age += dt
    if (this.age >= this.life) {
      this.dead = true
      return
    }
    if (this.hit || this.age > 0.14) return
    const p = world.player() as Player | null
    if (!p || p.dead) return
    if (!rectsOverlap({ x: this.x - 7, y: this.top, w: 14, h: this.bottom - this.top }, p.rect())) return
    this.hit = true
    p.hurt(world, {
      amount: 1, dirX: p.x < this.x ? -1 : 1, dirY: -1, sourceId: this.id, kind: 'hazard',
    })
  }

  draw(rc: RenderContext, sx: number, _sy: number): void {
    const { ctx } = rc
    const t = clamp01(this.age / this.life)
    const span = this.bottom - this.top
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = (1 - t) * (t < 0.2 ? 1 : 0.8)
    for (const [w, color] of [[6, rgba(PAL.magic, 0.5)], [2.6, PAL.white]] as const) {
      ctx.strokeStyle = color
      ctx.lineWidth = w * (1 - t * 0.5)
      ctx.beginPath()
      for (let i = 0; i < this.path.length; i++) {
        const y = this.top + (span * i) / (this.path.length - 1)
        const x = sx + this.path[i] * (1 - t * 0.4)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    ctx.restore()
  }
}

/** A blade of compacted sand. It skims the floor and dies into dust. */
export class SandBlade extends Entity {
  readonly kind = 'projectile'
  private hit = false

  constructor(x: number, y: number, dir: 1 | -1, speed = 190) {
    super(x, y, 20, 14)
    this.facing = dir
    this.body.vx = dir * speed
    this.body.collidesWithTiles = false
    this.depth = 68
    this.tags.add('hazard')
  }

  update(dt: number, world: World): void {
    this.age += dt
    this.body.px = this.body.x
    this.body.py = this.body.y
    this.body.x += this.body.vx * dt

    const tx = Math.floor(this.body.x / TILE)
    const ty = Math.floor((this.body.y + 2) / TILE)
    if (world.map.flags(tx, ty).solid) this.body.y = ty * TILE
    else if (world.map.flags(tx, ty + 1).solid) this.body.y = (ty + 1) * TILE

    world.particles.emit({
      x: this.x - this.facing * 6, y: this.y - 5,
      vx: -this.facing * world.rng.range(10, 50), vy: world.rng.range(-30, 4),
      life: 0.45, size: 2, sizeEnd: 4.5, color: PAL.sand, colorEnd: rgba(PAL.sandDeep, 0),
      shape: 'puff', drag: 0.1,
    })

    const wallAt = world.map.flags(Math.floor((this.body.x + this.facing * 8) / TILE), Math.floor((this.body.y - 6) / TILE)).solid
    if (wallAt || this.age > 3) {
      this.collapse(world)
      return
    }
    if (this.hit) return
    const p = world.player() as Player | null
    if (!p || p.dead) return
    if (!rectsOverlap({ x: this.x - 8, y: this.y - 12, w: 16, h: 12 }, p.rect())) return
    this.hit = true
    p.hurt(world, { amount: 1, dirX: this.facing, dirY: -1, sourceId: this.id, kind: 'projectile' })
    this.collapse(world)
  }

  /** Everything this warlord throws ends the same way: it stops being solid. */
  private collapse(world: World): void {
    this.dead = true
    world.particles.burst(14, this.x, this.y - 6, {
      speed: 60, speedVar: 40, life: 0.7, lifeVar: 0.25, size: 2.4, sizeEnd: 0.6,
      color: PAL.sand, colorEnd: PAL.sandDeep, shape: 'pixel', gravity: 300, drag: 0.06,
    })
  }

  draw(rc: RenderContext, sx: number, sy: number): void {
    const { ctx } = rc
    const c = cel(PAL.sandDeep)
    ctx.save()
    ctx.translate(sx, sy)
    ctx.scale(this.facing, 1)
    ctx.fillStyle = c.core
    ctx.beginPath()
    ctx.moveTo(9, -6)
    ctx.quadraticCurveTo(0, -13, -8, -3)
    ctx.quadraticCurveTo(-2, -1, 9, -6)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = mix(PAL.sand, PAL.cream, 0.4)
    ctx.beginPath()
    ctx.moveTo(8, -6.4)
    ctx.quadraticCurveTo(1, -11.4, -5, -4)
    ctx.quadraticCurveTo(0, -6, 8, -6.4)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = c.line
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.moveTo(9, -6)
    ctx.quadraticCurveTo(0, -13, -8, -3)
    ctx.stroke()
    ctx.restore()
  }
}

/**
 * A severed hand that flies a lap of the arena.
 *
 * The clown's phase two: the body stays where it is and the threat comes from
 * somewhere else entirely.
 */
export class ChopHand extends Entity {
  readonly kind = 'projectile'
  private home = { x: 0, y: 0 }
  private target = { x: 0, y: 0 }
  private phase: 'out' | 'back' = 'out'
  private hit = false

  constructor(x: number, y: number, tx: number, ty: number) {
    super(x, y, 14, 12)
    this.home = { x, y }
    this.target = { x: tx, y: ty }
    this.depth = 82
    this.body.collidesWithTiles = false
    this.tags.add('hazard')
  }

  update(dt: number, world: World): void {
    this.age += dt
    const goal = this.phase === 'out' ? this.target : this.home
    const dx = goal.x - this.x
    const dy = goal.y - this.y
    const d = Math.hypot(dx, dy) || 1
    const speed = this.phase === 'out' ? 230 : 170
    this.body.vx += ((dx / d) * speed - this.body.vx) * Math.min(1, dt * 6)
    this.body.vy += ((dy / d) * speed - this.body.vy) * Math.min(1, dt * 6)
    this.body.px = this.body.x
    this.body.py = this.body.y
    this.body.x += this.body.vx * dt
    this.body.y += this.body.vy * dt
    this.facing = this.body.vx >= 0 ? 1 : -1

    if (d < 16) {
      if (this.phase === 'out') {
        this.phase = 'back'
        this.hit = false
      } else {
        this.dead = true
        return
      }
    }
    if (this.age > 6) this.dead = true

    world.particles.emit({
      x: this.x - this.facing * 6, y: this.y, vx: 0, vy: 0, life: 0.22, size: 1.6, sizeEnd: 0.2,
      color: rgba(PAL.cream, 0.35), colorEnd: rgba(PAL.dusk, 0), shape: 'streak',
      rotation: Math.atan2(this.body.vy, this.body.vx), aim: true,
    })

    if (this.hit) return
    const p = world.player() as Player | null
    if (!p || p.dead) return
    if (!rectsOverlap(this.rect(), p.rect())) return
    this.hit = true
    p.hurt(world, {
      amount: 1, dirX: this.body.vx >= 0 ? 1 : -1, dirY: -1, sourceId: this.id, kind: 'melee',
    })
  }

  draw(rc: RenderContext, sx: number, sy: number): void {
    const { ctx } = rc
    const c = cel(PAL.skin)
    ctx.save()
    ctx.translate(sx, sy - 6)
    ctx.rotate(Math.sin(this.age * 8) * 0.2)
    ctx.scale(this.facing, 1)
    // A fist with a knife. At this speed the silhouette is all the player gets,
    // so it is one round mass, one dark cuff and one straight blade — nothing
    // that could be mistaken for a fireball.
    const blade = new Path2D()
    blade.moveTo(4, -1.8)
    blade.lineTo(19, -1.2)
    blade.lineTo(21, 0)
    blade.lineTo(19, 1.2)
    blade.lineTo(4, 1.8)
    blade.closePath()
    ctx.fillStyle = cel(PAL.steel).core
    ctx.fill(blade)
    ctx.fillStyle = PAL.cream
    ctx.fillRect(6, -1.6, 12, 0.8)
    ctx.strokeStyle = cel(PAL.steel).line
    ctx.lineWidth = 0.7
    ctx.stroke(blade)

    const fist = new Path2D()
    fist.ellipse(0, 0, 9, 8, 0, 0, Math.PI * 2)
    ctx.fillStyle = c.core
    ctx.fill(fist)
    ctx.save()
    ctx.clip(fist)
    ctx.fillStyle = c.shade
    ctx.beginPath()
    ctx.moveTo(-12, -2)
    ctx.lineTo(12, 3)
    ctx.lineTo(12, 12)
    ctx.lineTo(-12, 12)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    // Knuckles: three short creases where the fingers fold.
    ctx.strokeStyle = c.line
    ctx.lineWidth = 0.7
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath()
      ctx.moveTo(2, i * 3.4)
      ctx.lineTo(6.4, i * 3)
      ctx.stroke()
    }
    ctx.lineWidth = 0.9
    ctx.stroke(fist)
    // The severed cuff — striped, so it reads as the clown's sleeve.
    ctx.fillStyle = cel(PAL.dusk).core
    ctx.fillRect(-13, -5.4, 6, 10.8)
    ctx.fillStyle = PAL.cream
    ctx.fillRect(-13, -5.4, 6, 2)
    ctx.fillRect(-13, 1.4, 6, 2)
    ctx.strokeStyle = cel(PAL.dusk).line
    ctx.strokeRect(-13, -5.4, 6, 10.8)
    ctx.restore()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Buggy — the clown captain
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Act one is a hopping knife-thrower you can out-space. Act two is a body that
 * comes apart, so the danger stops coming from where he is standing. Act three
 * is the same trick turned up: he takes to the air, rains the whole knife rack
 * and lands on you.
 */
export class BuggyBoss extends Boss {
  displayName = 'Buggy'
  sheetKey = 'clown'
  private hopTimer = 0
  private airborne = false

  constructor(x: number, y: number) {
    super(x, y, 26, 52)
    this.maxHealth = 9
    this.health = 9
    this.accent = PAL.luffyRed
    this.phases = [
      { at: 1, interval: 1.5, speed: 1, intensity: 0.78, moves: ['fan'] },
      { at: 0.66, interval: 1.2, speed: 1.2, intensity: 0.88, moves: ['hands', 'spin'] },
      { at: 0.33, interval: 1, speed: 1.4, intensity: 1, moves: ['rain', 'drop'] },
    ]

    this.moves = {
      // ── Act one ───────────────────────────────────────────────────────────
      fan: {
        name: 'fan', tell: 0.55, active: 0.3, recover: 1.3, color: PAL.steel,
        fire: (world) => {
          world.audio.playSfx('slash', { volume: 0.75 })
          const p = world.player()
          const base = p
            ? Math.atan2(p.y - p.body.h * 0.5 - (this.y - 34), p.x - this.x)
            : this.facing === 1 ? 0 : Math.PI
          for (let i = -2; i <= 2; i++) {
            const a = base + i * 0.26
            world.spawn(new Knife(this.x + this.facing * 10, this.y - 34, Math.cos(a) * 230, Math.sin(a) * 230 - 20))
          }
        },
      },

      // ── Act two ───────────────────────────────────────────────────────────
      hands: {
        name: 'hands', tell: 0.5, active: 0.9, recover: 1.4, color: PAL.skin,
        fire: (world) => {
          world.audio.playSfx('kick', { volume: 0.6, rate: 0.8 })
          const p = world.player()
          const tx = p ? p.x : this.x + this.facing * 80
          const ty = p ? p.y - p.body.h * 0.5 : this.y - 30
          world.spawn(new ChopHand(this.x - 14, this.y - 40, tx, ty))
          world.spawn(new ChopHand(this.x + 14, this.y - 40, tx, ty - 18))
          world.particles.burst(20, this.x, this.y - 38, {
            speed: 130, speedVar: 60, life: 0.4, size: 2.4, sizeEnd: 0.3,
            color: PAL.skin, colorEnd: PAL.cream, shape: 'spark', additive: true, drag: 0.08,
          })
        },
      },
      spin: {
        name: 'spin', tell: 0.6, active: 0.85, recover: 1.5, color: PAL.danger,
        fire: (world) => {
          this.facePlayer(world)
          this.body.vx = this.facing * 300
          world.audio.playSfx('slash', { volume: 0.8, rate: 0.7 })
          world.shake(0.14)
        },
        during: (_t, _dt, world) => {
          this.body.vx = this.facing * 300
          this.squashX = 0.85
          this.squashY = 1.12
          if (world.rng.bool(0.4)) {
            world.particles.emit({
              x: this.x, y: this.y - 26, vx: -this.facing * 60, vy: world.rng.range(-40, 40),
              life: 0.25, size: 3, sizeEnd: 0.4, color: PAL.cream, colorEnd: rgba(PAL.luffyRed, 0),
              shape: 'streak', additive: true, aim: true,
            })
          }
          // Hitting a wall ends the spin early and badly.
          if (this.body.x <= this.arenaL + this.body.w * 0.5 + 3 ||
              this.body.x >= this.arenaR - this.body.w * 0.5 - 3) {
            world.audio.playSfx('bump', { volume: 0.9, rate: 0.6 })
            world.shake(0.3)
            this.body.vx = -this.facing * 80
            this.stateTime = 99
          }
        },
        end: () => {
          this.body.vx = 0
        },
      },

      // ── Act three ─────────────────────────────────────────────────────────
      rain: {
        name: 'rain', tell: 0.7, active: 1.2, recover: 1.2, color: PAL.steel,
        start: () => {
          this.airborne = true
          this.body.vy = -430
        },
        during: (_t, dt, world) => {
          // Hangs at the ceiling and walks a curtain of knives across the room.
          this.body.vy = -14
          this.body.vx = this.facing * 60
          this.hopTimer -= dt
          if (this.hopTimer > 0) return
          this.hopTimer = 0.12
          const x = this.arenaX(world, 24)
          world.spawn(new Knife(x, this.y - 20, world.rng.range(-30, 30), 190))
          world.audio.playSfx('shoot', { volume: 0.25, rate: 1.6 })
        },
        end: () => {
          this.airborne = false
        },
      },
      drop: {
        name: 'drop', tell: 0.55, active: 1, recover: 1.6, color: PAL.danger,
        start: (world) => {
          this.airborne = true
          this.body.vy = -380
          this.facePlayer(world)
        },
        during: (t, _dt, world) => {
          if (t < 0.35) {
            // Track overhead, then commit.
            const p = world.player()
            if (p) this.body.vx = clamp((p.x - this.x) * 3.4, -230, 230)
            this.body.vy = -30
            return
          }
          this.body.vx *= 0.9
          this.body.vy = 620
          if (this.body.grounded) {
            this.airborne = false
            this.stateTime = 99
            world.audio.playSfx('break', { volume: 0.9, rate: 0.7 })
            world.hitstop(8)
            world.shake(0.45)
            world.spawn(new Shockwave(this.x + 18, this.y, 1, 190, PAL.dusk))
            world.spawn(new Shockwave(this.x - 18, this.y, -1, 190, PAL.dusk))
            this.squash(1.4, 0.66)
          }
        },
        end: () => {
          this.airborne = false
        },
      },
    }
  }

  protected onIntro(world: World): void {
    world.audio.playSfx('warn', { volume: 0.7, rate: 0.7 })
  }

  protected move(dt: number, world: World): void {
    const speed = this.phases[this.phase].speed
    if (this.state !== 'strike') this.facePlayer(world)

    if (this.airborne) {
      // Flight is driven by the move that is running; only gravity is skipped.
      return
    }
    this.body.vy = Math.min(this.body.vy + PHYS.gravity * dt, PHYS.maxFall)

    if (this.state === 'strike' || this.state === 'stagger' || this.state === 'tell') {
      // Feet planted through the wind-up: the tell is worthless if he is in
      // the air when it plays.
      if (this.body.grounded) this.body.vx *= 0.8
      return
    }
    // Between attacks he hops around the arena — never standing where he was.
    this.hopTimer -= dt
    if (this.body.grounded && this.hopTimer <= 0) {
      this.body.vy = -300
      this.body.vx = this.facing * 80 * speed
      this.hopTimer = 1.2 / speed
      this.squash(0.8, 1.25)
    }
    if (this.body.grounded) this.body.vx *= 0.88
  }

  protected drawFallbackMark(ctx: CanvasRenderingContext2D, w: number, h: number, line: string): void {
    // The nose, and the hair spikes: enough to name him without the sheet.
    ctx.fillStyle = PAL.luffyRed
    ctx.beginPath()
    ctx.ellipse(w * 0.1, -h * 0.72, 4.4, 3.8, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = line
    ctx.lineWidth = 0.8
    ctx.stroke()
    ctx.fillStyle = '#3FA8D9'
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath()
      ctx.moveTo(i * w * 0.14, -h * 0.9)
      ctx.lineTo(i * w * 0.14 + w * 0.06, -h * 1.06)
      ctx.lineTo(i * w * 0.14 + w * 0.11, -h * 0.88)
      ctx.closePath()
      ctx.fill()
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fishman warlord
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A fishman karate master.
 *
 * Act one fights at range with water and floor-shocks — jump, or be swept. Act
 * two takes the fight vertical: he leaps the arena and the ground answers under
 * where you are standing. Act three closes the distance himself, three dashes
 * in a row, and the only safe place is behind him.
 */
export class FishmanWarlord extends Boss {
  displayName = 'Arlong'
  sheetKey = 'fishman-lord'
  private dashesLeft = 0
  private airborne = false
  private slamX = 0

  constructor(x: number, y: number) {
    super(x, y, 30, 56)
    this.maxHealth = 10
    this.health = 10
    this.accent = PAL.fishmanTeal
    this.phases = [
      { at: 1, interval: 1.5, speed: 1, intensity: 0.8, moves: ['shots', 'sweep'] },
      { at: 0.66, interval: 1.3, speed: 1.15, intensity: 0.9, moves: ['leap', 'shots'] },
      { at: 0.33, interval: 1.05, speed: 1.35, intensity: 1, moves: ['dashes', 'sweep', 'leap'] },
    ]

    this.moves = {
      // Three water bullets on a spread — a wall you go over or around.
      shots: {
        name: 'shots', tell: 0.5, active: 0.45, recover: 1.2, color: PAL.seaLight,
        fire: (world) => {
          world.audio.playSfx('shoot', { volume: 0.6, rate: 0.7 })
          const p = world.player()
          const base = p
            ? Math.atan2(p.y - p.body.h * 0.5 - (this.y - 36), p.x - this.x)
            : this.facing === 1 ? 0 : Math.PI
          for (let i = -1; i <= 1; i++) {
            const a = base + i * 0.24
            world.spawn(new WaterShot(this.x + this.facing * 14, this.y - 36, Math.cos(a) * 250, Math.sin(a) * 250))
          }
        },
      },
      // A palm into the floor: two shockwaves, one each way. Jump or lose.
      sweep: {
        name: 'sweep', tell: 0.6, active: 0.35, recover: 1.35, color: PAL.sea,
        fire: (world) => {
          world.audio.playSfx('punch', { volume: 0.9, rate: 0.7 })
          world.hitstop(6)
          world.shake(0.34)
          this.squash(1.3, 0.72)
          world.spawn(new Shockwave(this.x + 18, this.y, 1, 175, PAL.sea))
          world.spawn(new Shockwave(this.x - 18, this.y, -1, 175, PAL.sea))
        },
      },
      // Up, across, and the sea comes out of the floor where you were.
      leap: {
        name: 'leap', tell: 0.55, active: 1.5, recover: 1.3, color: PAL.foam,
        start: (world) => {
          this.airborne = true
          this.body.vy = -470
          this.facePlayer(world)
          const p = world.player()
          this.slamX = p ? p.x : this.x
        },
        during: (t, _dt, world) => {
          if (t < 0.5) {
            this.body.vy = Math.max(this.body.vy, -180)
            const p = world.player()
            if (p) {
              this.slamX = p.x
              this.body.vx = clamp((p.x - this.x) * 2.6, -220, 220)
            }
            return
          }
          this.body.vx *= 0.88
          this.body.vy = 640
          if (!this.body.grounded) return
          this.airborne = false
          this.stateTime = 99
          world.audio.playSfx('splash', { volume: 0.9, rate: 0.6 })
          world.hitstop(9)
          world.shake(0.5)
          this.squash(1.45, 0.62)
          // Three columns marching away from the impact, plus one under the
          // player: the floor itself is the attack.
          for (let i = 1; i <= 3; i++) {
            for (const dir of [-1, 1] as const) {
              const x = this.x + dir * i * 34
              const gy = groundYAt(world, x, this.y - 8)
              world.spawn(new Warning(x, gy, 0.12 * i, PAL.foam, 12, (w) => {
                w.spawn(new Column(x, gy, 56, PAL.sea, PAL.foam))
              }))
            }
          }
          const gy = groundYAt(world, this.slamX, this.y - 8)
          world.spawn(new Warning(this.slamX, gy, 0.5, PAL.seaLight, 15, (w) => {
            w.spawn(new Column(this.slamX, gy, 70, PAL.sea, PAL.foam))
          }))
        },
        end: () => {
          this.airborne = false
        },
      },
      // Three committed dashes. Each one ends where it ends.
      dashes: {
        name: 'dashes', tell: 0.45, active: 1.5, recover: 1.5, color: PAL.danger,
        start: () => {
          this.dashesLeft = 3
        },
        fire: (world) => {
          this.facePlayer(world)
          this.body.vx = this.facing * 330
          world.audio.playSfx('punch', { volume: 0.8, rate: 1.1 })
        },
        during: (_t, dt, world) => {
          this.body.vx += -Math.sign(this.body.vx) * 220 * dt
          if (world.rng.bool(0.5)) {
            world.particles.emit({
              x: this.x, y: this.y - 30, vx: -this.facing * 90, vy: world.rng.range(-30, 30),
              life: 0.28, size: 3.2, sizeEnd: 0.4, color: PAL.foam,
              colorEnd: rgba(PAL.sea, 0), shape: 'streak', additive: true, aim: true,
            })
          }
          if (Math.abs(this.body.vx) > 60) return
          this.dashesLeft--
          if (this.dashesLeft <= 0) {
            this.stateTime = 99
            return
          }
          this.facePlayer(world)
          this.body.vx = this.facing * 330
          world.audio.playSfx('punch', { volume: 0.7, rate: 1.2 })
        },
        end: () => {
          this.body.vx = 0
        },
      },
    }
  }

  protected move(dt: number, world: World): void {
    if (this.state !== 'strike') this.facePlayer(world)
    if (!this.airborne) {
      this.body.vy = Math.min(this.body.vy + PHYS.gravity * dt, PHYS.maxFall)
    }
    if (this.state === 'wait') {
      // Circling: he keeps a fighting distance rather than closing.
      const p = world.player()
      if (p) {
        const gap = Math.abs(p.x - this.x)
        const want = 78
        const dir = gap < want ? -this.facing : this.facing
        this.body.vx = dir * 46 * this.phases[this.phase].speed
      }
      this.playState('walk')
    } else if (this.state === 'open' || this.state === 'stagger') {
      this.body.vx *= 0.8
    }
  }

  protected drawFallbackMark(ctx: CanvasRenderingContext2D, w: number, h: number, line: string): void {
    // Dorsal fin and gill slashes.
    ctx.fillStyle = mix(PAL.fishmanTeal, PAL.ink, 0.35)
    ctx.beginPath()
    ctx.moveTo(-w * 0.05, -h * 1.02)
    ctx.lineTo(w * 0.02, -h * 1.32)
    ctx.lineTo(w * 0.2, -h * 0.98)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = line
    ctx.lineWidth = 0.9
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      ctx.moveTo(w * 0.26, -h * (0.66 - i * 0.06))
      ctx.lineTo(w * 0.4, -h * (0.62 - i * 0.06))
      ctx.stroke()
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Desert warlord
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The warlord whose attacks turn to sand.
 *
 * Everything he throws collapses into dust the moment it lands, and in act two
 * so does he: while he is scattered nothing can touch him, which turns the
 * whole fight into a question of *when*, not *where*. The answer is always the
 * moment he re-forms.
 */
export class DesertWarlord extends Boss {
  displayName = 'Crocodile'
  sheetKey = 'desert-lord'
  private scattered = false
  private scatterFrom = 0
  private scatterTo = 0
  private stormWind = 0

  constructor(x: number, y: number) {
    super(x, y, 28, 54)
    this.maxHealth = 10
    this.health = 10
    this.accent = PAL.sandDeep
    this.stompable = false // there is nothing solid on top of him to land on
    this.phases = [
      { at: 1, interval: 1.5, speed: 1, intensity: 0.8, moves: ['blades', 'pillars'] },
      { at: 0.66, interval: 1.2, speed: 1.2, intensity: 0.9, moves: ['scatter', 'blades'] },
      { at: 0.33, interval: 1, speed: 1.3, intensity: 1, moves: ['storm', 'pillars', 'scatter'] },
    ]

    this.moves = {
      // Two blades along the floor, a beat apart, so one jump is not enough.
      blades: {
        name: 'blades', tell: 0.55, active: 0.6, recover: 1.25, color: PAL.sand,
        fire: (world) => {
          this.facePlayer(world)
          world.audio.playSfx('slash', { volume: 0.6, rate: 0.85 })
          world.spawn(new SandBlade(this.x + this.facing * 18, this.y, this.facing, 200))
        },
        during: (t, _dt, world) => {
          if (t < 0.6 || this.struckTwice) return
          this.struckTwice = true
          world.audio.playSfx('slash', { volume: 0.5, rate: 1.05 })
          world.spawn(new SandBlade(this.x + this.facing * 18, this.y, this.facing, 260))
        },
        end: () => {
          this.struckTwice = false
        },
      },
      // The floor opens under you, twice, with the marker as the only warning.
      pillars: {
        name: 'pillars', tell: 0.6, active: 0.9, recover: 1.3, color: PAL.sandDeep,
        fire: (world) => {
          world.audio.playSfx('break', { volume: 0.5, rate: 1.3 })
          const p = world.player()
          const x0 = p ? p.x : this.x
          for (let i = 0; i < 3; i++) {
            const x = x0 + (i - 1) * 40
            const gy = groundYAt(world, x, this.y - 8)
            world.spawn(new Warning(x, gy, 0.45 + i * 0.12, PAL.sand, 13, (w) => {
              w.spawn(new Column(x, gy, 58, PAL.sandDeep, PAL.sand))
            }))
          }
        },
      },
      // He comes apart and crosses the arena as a whirl. Untouchable, and the
      // re-forming is the whole opening.
      scatter: {
        name: 'scatter', tell: 0.5, active: 1.1, recover: 1.6, color: PAL.sand,
        start: (world) => {
          this.scattered = true
          this.contactDamage = true
          this.scatterFrom = this.x
          const p = world.player()
          // Re-form on the far side of the player, so the room keeps rotating.
          this.scatterTo = clamp(
            p ? p.x + (p.x > this.x ? 46 : -46) : this.arenaX(world),
            this.arenaL + 30, this.arenaR - 30,
          )
          world.audio.playSfx('swim', { volume: 0.6, rate: 0.5 })
        },
        during: (t, _dt, world) => {
          this.body.x = this.scatterFrom + (this.scatterTo - this.scatterFrom) * t
          this.body.vx = 0
          world.particles.burst(4, this.x, this.y - this.body.h * 0.5, {
            speed: 60, speedVar: 40, life: 0.55, lifeVar: 0.2, size: 2.6, sizeEnd: 0.5,
            color: PAL.sand, colorEnd: rgba(PAL.sandDeep, 0), shape: 'puff',
            gravity: 140, drag: 0.05, spawnRadius: this.body.w * 0.6,
          })
        },
        end: (world) => {
          this.scattered = false
          world.audio.playSfx('land', { volume: 0.7, rate: 0.7 })
          world.shake(0.24)
          this.squash(1.3, 0.74)
          world.particles.burst(26, this.x, this.y - this.body.h * 0.5, {
            speed: 130, speedVar: 70, life: 0.5, lifeVar: 0.2, size: 2.4, sizeEnd: 0.4,
            color: PAL.sand, colorEnd: PAL.sandDeep, shape: 'puff',
            spawnRadius: this.body.w * 0.7, gravity: 220, drag: 0.06,
          })
        },
      },
      // The room turns against you: wind, and the sky starts falling.
      storm: {
        name: 'storm', tell: 0.7, active: 2.4, recover: 1.4, color: PAL.sunset,
        start: (world) => {
          world.audio.playSfx('swim', { volume: 0.5, rate: 0.35 })
        },
        fire: (world) => {
          this.stormWind = this.dirToPlayer(world) === 1 ? -1 : 1
          world.shake(0.2)
        },
        during: (_t, dt, world) => {
          // A steady shove, so every jump has to be aimed into the wind.
          const p = world.player() as Player | null
          if (p && !p.dead) p.body.vx += this.stormWind * 150 * dt
          if (world.rng.bool(0.4)) {
            world.particles.emit({
              x: this.x - this.stormWind * 200 + world.rng.range(-40, 40),
              y: this.y - world.rng.range(0, 120),
              vx: this.stormWind * world.rng.range(150, 320), vy: world.rng.range(-20, 20),
              life: 1.2, size: 2, sizeEnd: 0.6, color: PAL.sand,
              colorEnd: rgba(PAL.sandDeep, 0), shape: 'streak', aim: true, drag: 0.02,
            })
          }
          this.stormTick -= dt
          if (this.stormTick > 0) return
          this.stormTick = 0.42
          const x = this.arenaX(world, 26)
          const gy = groundYAt(world, x, this.y - 40)
          world.spawn(new Warning(x, gy, 0.55, PAL.sunset, 12, (w) => {
            w.spawn(new Column(x, gy, 48, PAL.sandDeep, PAL.sand))
          }))
        },
        end: () => {
          this.stormWind = 0
        },
      },
    }
  }

  /** Second blade of the `blades` move — one flag, reset when the move ends. */
  private struckTwice = false
  private stormTick = 0

  /** While he is scattered there is nothing to hit. */
  get vulnerable(): boolean {
    return !this.scattered && super.vulnerable
  }

  damage(hit: Hit, world: World): boolean {
    if (this.scattered) {
      // Attacks pass straight through a column of sand. Say so.
      world.particles.burst(12, this.x, this.y - this.body.h * 0.5, {
        speed: 110, speedVar: 50, life: 0.5, size: 2.2, sizeEnd: 0.4,
        color: PAL.sand, colorEnd: rgba(PAL.sandDeep, 0), shape: 'pixel',
        gravity: 200, spawnRadius: this.body.w * 0.5,
      })
      world.audio.playSfx('swim', { volume: 0.3, rate: 1.4 })
      this.iframes = 0.2
      return false
    }
    return super.damage(hit, world)
  }

  protected move(dt: number, world: World): void {
    if (this.state !== 'strike') this.facePlayer(world)
    if (this.scattered) {
      this.body.vy = 0
      return
    }
    this.body.vy = Math.min(this.body.vy + PHYS.gravity * dt, PHYS.maxFall)
    if (this.state === 'wait') {
      this.body.vx = this.dirToPlayer(world) * 38 * this.phases[this.phase].speed
      this.playState('walk')
    } else {
      this.body.vx *= 0.84
    }
  }

  draw(rc: RenderContext, sx: number, sy: number): void {
    if (!this.scattered) {
      super.draw(rc, sx, sy)
      return
    }
    // Scattered: the figure is still in there, half-dissolved, with the grains
    // spinning off it. Keeping a ghost of the silhouette is what lets the
    // player track where he is going to re-form.
    const { ctx } = rc
    ctx.save()
    ctx.globalAlpha = 0.26
    super.draw(rc, sx, sy)
    ctx.restore()

    ctx.save()
    ctx.translate(sx, sy)
    const c = cel(PAL.sand)
    for (let i = 0; i < 26; i++) {
      const a = this.age * 6.5 + i * 0.72
      const r = 5 + (i % 7) * 3.6
      const y = -this.body.h * (0.08 + ((i * 11) % 13) / 14)
      ctx.globalAlpha = 0.5 + ((i * 5) % 5) * 0.1
      ctx.fillStyle = i % 3 === 0 ? c.light : i % 3 === 1 ? c.core : c.shade
      ctx.beginPath()
      ctx.ellipse(Math.cos(a) * r, y + Math.sin(a * 1.3) * 3.4, 2.6, 1.7, a, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  protected drawFallbackMark(ctx: CanvasRenderingContext2D, w: number, h: number, line: string): void {
    // A hooked headdress and a cloth mask: the desert silhouette.
    ctx.fillStyle = mix(PAL.sand, PAL.cream, 0.3)
    ctx.beginPath()
    ctx.moveTo(-w * 0.34, -h * 0.86)
    ctx.quadraticCurveTo(0, -h * 1.14, w * 0.34, -h * 0.86)
    ctx.lineTo(w * 0.26, -h * 0.62)
    ctx.quadraticCurveTo(0, -h * 0.74, -w * 0.26, -h * 0.62)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = line
    ctx.lineWidth = 0.9
    ctx.stroke()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sky tyrant
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The god of the sky island.
 *
 * He never touches the floor, so every act is about where lightning is going to
 * land. Act one marks single spots. Act two orbits spheres and dives. Act three
 * fills the room with bolts and leaves exactly one gap — and the gap is drawn
 * for you, in the second and a half you have to reach it.
 */
export class SkyTyrant extends Boss {
  displayName = 'Enel'
  sheetKey = 'sky-tyrant'
  private hoverY = 0
  private driftPhase = 0
  private diving = false

  constructor(x: number, y: number) {
    super(x, y, 32, 58)
    this.maxHealth = 11
    this.health = 11
    this.accent = PAL.magic
    this.stompable = false
    this.phases = [
      { at: 1, interval: 1.4, speed: 1, intensity: 0.82, moves: ['strikes'] },
      { at: 0.66, interval: 1.2, speed: 1.2, intensity: 0.92, moves: ['orbs', 'dive'] },
      { at: 0.33, interval: 1.15, speed: 1.35, intensity: 1, moves: ['wall', 'dive', 'orbs'] },
    ]

    this.moves = {
      // Three marked spots, the last one under wherever you have run to.
      strikes: {
        name: 'strikes', tell: 0.6, active: 1.1, recover: 1.3, color: PAL.magic,
        fire: (world) => {
          world.audio.playSfx('warn', { volume: 0.5, rate: 1.4 })
          for (let i = 0; i < 3; i++) {
            const p = world.player()
            const x = i === 2 && p ? p.x : this.arenaX(world, 26)
            world.spawn(new Warning(x, groundYAt(world, x, this.y), 0.35 + i * 0.28, PAL.magic, 14, (w) => {
              this.strikeAt(w, x)
            }))
          }
        },
      },
      // A ring of bolts released outward — cover is the answer, not distance.
      orbs: {
        name: 'orbs', tell: 0.55, active: 0.5, recover: 1.35, color: PAL.skyLow,
        fire: (world) => {
          world.audio.playSfx('shoot', { volume: 0.55, rate: 0.9 })
          const n = 6
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + this.age
            world.spawn(new Orb(this.x, this.y - this.body.h * 0.5, a, 26 + i * 2))
          }
        },
      },
      // He drops out of the sky at where you are, then climbs back.
      dive: {
        name: 'dive', tell: 0.5, active: 1.2, recover: 1.4, color: PAL.danger,
        start: (world) => {
          this.diving = true
          this.facePlayer(world)
        },
        during: (t, _dt, world) => {
          if (t < 0.45) {
            const p = world.player()
            if (p) this.body.vx = clamp((p.x - this.x) * 4, -300, 300)
            this.body.vy = -40
            return
          }
          this.body.vx *= 0.92
          this.body.vy = 560
          if (this.body.y < groundYAt(world, this.x, this.y) - 6) return
          this.body.vy = -260
          this.diving = false
          this.stateTime = 99
          world.audio.playSfx('explosion', { volume: 0.7, rate: 1.5 })
          world.hitstop(8)
          world.shake(0.42)
          world.spawn(new Shockwave(this.x + 16, this.y, 1, 200, PAL.magic))
          world.spawn(new Shockwave(this.x - 16, this.y, -1, 200, PAL.magic))
        },
        end: () => {
          this.diving = false
        },
      },
      // The whole room, minus one window. The window is the fight.
      wall: {
        name: 'wall', tell: 0.9, active: 1.6, recover: 1.5, color: PAL.white,
        fire: (world) => {
          world.audio.playSfx('warn', { volume: 0.7, rate: 0.8 })
          const p = world.player()
          // Put the gap away from the player: this attack is a sprint, not a
          // stand-still.
          const l = Number.isFinite(this.arenaL) ? this.arenaL : this.homeX - 140
          const r = Number.isFinite(this.arenaR) ? this.arenaR : this.homeX + 140
          const gap = p && p.x < (l + r) / 2 ? r - 46 : l + 46
          world.spawn(new Warning(gap, groundYAt(world, gap, this.y), 1.15, PAL.heal, 26, () => {}))
          let i = 0
          for (let x = l + 18; x < r - 12; x += 22, i++) {
            if (Math.abs(x - gap) < 30) continue
            world.spawn(new Warning(x, groundYAt(world, x, this.y), 0.75 + (i % 3) * 0.1, PAL.magic, 11, (w) => {
              this.strikeAt(w, x)
            }))
          }
        },
      },
    }
  }

  /** One bolt from the ceiling of the arena to the floor at `x`. */
  private strikeAt(world: World, x: number): void {
    const gy = groundYAt(world, x, this.y)
    const top = Number.isFinite(this.arenaTop) ? this.arenaTop : gy - 160
    world.spawn(new Lightning(x, top, gy, Math.floor(world.rng.next() * 1e9)))
  }

  protected onIntro(_world: World): void {
    this.hoverY = this.homeY - 74
  }

  protected onPhase(phase: number, _world: World): void {
    // He climbs with each act: the fight gets further out of reach.
    this.hoverY = this.homeY - 74 - phase * 10
  }

  protected move(dt: number, world: World): void {
    this.driftPhase += dt
    if (this.state !== 'strike') this.facePlayer(world)
    if (this.diving || (this.state === 'strike' && this.current?.name === 'dive')) return

    // Hovering: a slow figure-of-eight above the player's half of the room.
    const p = world.player()
    const wantX = p ? clamp(p.x, this.arenaL + 40, this.arenaR - 40) : this.homeX
    const speed = this.phases[this.phase].speed
    this.body.vx += (clamp((wantX - this.x) * 1.5, -70 * speed, 70 * speed) - this.body.vx) * Math.min(1, dt * 2)
    const bob = Math.sin(this.driftPhase * 1.6) * 10
    // The open window has to be reachable: a boss who never comes below the
    // top of a jump is a boss who cannot be beaten. He sinks to head height
    // while he is recovering and climbs again the moment he is not.
    const target = this.state === 'open' || this.state === 'stagger'
      ? this.homeY - 26
      : this.hoverY
    this.body.vy = (target + bob - this.y) * (this.state === 'open' ? 3.4 : 2.4)

    if (world.rng.bool(0.25)) {
      world.particles.emit({
        x: this.x + world.rng.range(-16, 16), y: this.y - world.rng.range(6, this.body.h),
        vx: 0, vy: world.rng.range(10, 40), life: 0.5, size: 1.8, sizeEnd: 0.2,
        color: PAL.magic, colorEnd: rgba(PAL.cream, 0), shape: 'spark', additive: true,
      })
    }
  }

  protected drawFallbackMark(ctx: CanvasRenderingContext2D, w: number, h: number, line: string): void {
    // A horned mask and a halo of static.
    ctx.fillStyle = mix(PAL.gold, PAL.cream, 0.2)
    ctx.beginPath()
    ctx.moveTo(-w * 0.3, -h * 0.86)
    ctx.lineTo(-w * 0.44, -h * 1.12)
    ctx.lineTo(-w * 0.12, -h * 0.94)
    ctx.closePath()
    ctx.moveTo(w * 0.3, -h * 0.86)
    ctx.lineTo(w * 0.44, -h * 1.12)
    ctx.lineTo(w * 0.12, -h * 0.94)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = line
    ctx.lineWidth = 0.9
    ctx.stroke()
    ctx.strokeStyle = rgba(PAL.magic, 0.9)
    for (let i = 0; i < 3; i++) {
      const a = this.age * 3 + i * 2.1
      ctx.beginPath()
      ctx.moveTo(Math.cos(a) * w * 0.5, -h * 0.7 + Math.sin(a) * h * 0.2)
      ctx.lineTo(Math.cos(a + 0.5) * w * 0.7, -h * 0.7 + Math.sin(a + 0.5) * h * 0.3)
      ctx.stroke()
    }
  }
}

/** One of the tyrant's released spheres: it spirals outward and fades. */
export class Orb extends Entity {
  readonly kind = 'projectile'
  private angle: number
  private radius: number
  private hit = false
  private cx: number
  private cy: number

  constructor(x: number, y: number, angle: number, radius: number) {
    super(x, y, 12, 12)
    this.cx = x
    this.cy = y
    this.angle = angle
    this.radius = radius
    this.depth = 74
    this.body.collidesWithTiles = false
    this.tags.add('hazard')
  }

  update(dt: number, world: World): void {
    this.age += dt
    this.angle += dt * 2.2
    this.radius += dt * 74
    this.body.px = this.body.x
    this.body.py = this.body.y
    this.body.x = this.cx + Math.cos(this.angle) * this.radius
    this.body.y = this.cy + Math.sin(this.angle) * this.radius * 0.7
    if (this.age > 2.4) {
      this.dead = true
      return
    }
    world.particles.emit({
      x: this.x, y: this.y, vx: 0, vy: 0, life: 0.3, size: 2.6, sizeEnd: 0.3,
      color: PAL.magic, colorEnd: rgba(PAL.white, 0), shape: 'glow', additive: true,
    })
    if (this.hit) return
    const p = world.player() as Player | null
    if (!p || p.dead || !rectsOverlap(this.rect(), p.rect())) return
    this.hit = true
    this.dead = true
    p.hurt(world, {
      amount: 1, dirX: p.x < this.x ? -1 : 1, dirY: -1, sourceId: this.id, kind: 'projectile',
    })
  }

  draw(rc: RenderContext, sx: number, sy: number): void {
    const { ctx } = rc
    const t = clamp01(this.age / 2.4)
    ctx.save()
    ctx.translate(sx, sy)
    ctx.globalAlpha = 1 - t * 0.4
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = rgba(PAL.magic, 0.45)
    ctx.beginPath()
    ctx.arc(0, 0, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = PAL.skyLow
    ctx.beginPath()
    ctx.arc(0, 0, 4.6, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = PAL.white
    ctx.beginPath()
    ctx.arc(-1.2, -1.4, 1.8, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The oni of Onigashima — the last thing in the campaign.
 *
 * Three acts, and each one adds a verb rather than swapping the set: the club
 * is the whole fight and everything else is the club doing more. Act one is
 * two shockwaves and the floor coming up; act two puts him across the arena at
 * speed; act three brings the sky into it. Nothing is removed, so a player who
 * learned to read the wind-up in act one is still reading it in act three.
 *
 * He is deliberately the slowest boss in the game to open: the tell is long,
 * the recovery is long, and the difficulty is that the room fills up.
 */
export class OniLord extends Boss {
  displayName = 'Kaido'
  sheetKey = 'oni-lord'
  private charging = false
  private chargeDir: 1 | -1 = 1
  private struckTwice = false

  constructor(x: number, y: number) {
    super(x, y, 32, 60)
    this.maxHealth = 12
    this.health = 12
    this.accent = PAL.ember
    this.phases = [
      { at: 1, interval: 1.6, speed: 0.9, intensity: 0.85, moves: ['slam', 'quake'] },
      { at: 0.66, interval: 1.3, speed: 1.1, intensity: 0.95, moves: ['charge', 'slam', 'quake'] },
      { at: 0.33, interval: 1.05, speed: 1.2, intensity: 1, moves: ['thunder', 'slam', 'charge'] },
    ]

    this.moves = {
      // The club comes down and the floor answers in both directions. Jumping
      // one wave is not enough, which is what makes the arena feel small.
      slam: {
        name: 'slam', tell: 0.65, active: 0.5, recover: 1.4, color: PAL.ember,
        fire: (world) => {
          this.facePlayer(world)
          world.audio.playSfx('boss-hit', { volume: 0.5, rate: 0.6 })
          world.shake(0.35)
          world.hitstop(6)
          const gy = groundYAt(world, this.x, this.y - 8)
          for (const dir of [1, -1] as const) {
            world.spawn(new Shockwave(this.x + dir * 20, gy, dir, 170, PAL.ember))
          }
        },
        during: (t, _dt, world) => {
          // A second, faster pair a beat later — the same attack, said twice.
          if (t < 0.55 || this.struckTwice) return
          this.struckTwice = true
          const gy = groundYAt(world, this.x, this.y - 8)
          world.audio.playSfx('boss-hit', { volume: 0.4, rate: 0.8 })
          for (const dir of [1, -1] as const) {
            world.spawn(new Shockwave(this.x + dir * 20, gy, dir, 240, PAL.ember))
          }
        },
        end: () => {
          this.struckTwice = false
        },
      },

      // The ground comes up in three places around where you are standing.
      quake: {
        name: 'quake', tell: 0.7, active: 0.95, recover: 1.45, color: PAL.dirtDeep,
        fire: (world) => {
          world.audio.playSfx('break', { volume: 0.5, rate: 0.9 })
          const p = world.player()
          const x0 = p ? p.x : this.x
          for (let i = 0; i < 3; i++) {
            const x = clamp(x0 + (i - 1) * 44, this.arenaL + 16, this.arenaR - 16)
            const gy = groundYAt(world, x, this.y - 8)
            world.spawn(new Warning(x, gy, 0.4 + i * 0.14, PAL.ember, 14, (w) => {
              w.spawn(new Column(x, gy, 54, PAL.dirtDeep, PAL.ember))
            }))
          }
        },
      },

      // He crosses the room shoulder-first. There is one way past him and it
      // is over the top, which is the same jump the whole game has taught.
      charge: {
        name: 'charge', tell: 0.8, active: 0.9, recover: 1.6, color: PAL.danger,
        start: (world) => {
          this.facePlayer(world)
          this.chargeDir = this.dirToPlayer(world)
          world.audio.playSfx('warn', { volume: 0.5, rate: 0.7 })
        },
        fire: (world) => {
          this.charging = true
          world.shake(0.2)
        },
        during: (_t, dt, world) => {
          this.body.vx = this.chargeDir * 260
          this.facing = this.chargeDir
          if (this.x <= this.arenaL + this.body.w || this.x >= this.arenaR - this.body.w) {
            // Into the wall: he stops himself, and that is the opening.
            this.charging = false
            this.body.vx = 0
            world.shake(0.4)
            world.hitstop(8)
          }
          if (world.rng.bool(0.5)) {
            world.particles.emit({
              x: this.x - this.chargeDir * 14, y: this.y - world.rng.range(2, this.body.h * 0.6),
              vx: -this.chargeDir * world.rng.range(40, 90), vy: world.rng.range(-30, 10),
              life: 0.45, lifeVar: 0.2, size: 2.6, sizeEnd: 0.4,
              color: PAL.ember, colorEnd: rgba(PAL.danger, 0), shape: 'spark', additive: true,
              drag: 0.05,
            } as never)
          }
          void dt
        },
        end: () => {
          this.charging = false
          this.body.vx = 0
        },
      },

      // Act three: the roof of the island joins in.
      thunder: {
        name: 'thunder', tell: 0.75, active: 1.3, recover: 1.35, color: PAL.magic,
        fire: (world) => {
          world.audio.playSfx('warn', { volume: 0.45, rate: 1.4 })
          const p = world.player()
          for (let i = 0; i < 3; i++) {
            const x = clamp(
              (p ? p.x : this.x) + world.rng.range(-70, 70),
              this.arenaL + 14, this.arenaR - 14,
            )
            const gy = groundYAt(world, x, this.y - 8)
            world.spawn(new Warning(x, gy, 0.32 + i * 0.22, PAL.magic, 12, (w) => {
              w.spawn(new Lightning(x, this.arenaTop, gy, Math.floor(x)))
            }))
          }
        },
      },
    }
  }

  /**
   * He walks, and that is all. Where the other bosses circle or keep a
   * fighting distance, this one closes: the pressure of the fight is that the
   * room keeps getting smaller, and standing still is never the answer.
   */
  protected move(dt: number, world: World): void {
    if (!this.charging) this.facePlayer(world)
    this.body.vy = Math.min(this.body.vy + PHYS.gravity * dt, PHYS.maxFall)
    if (this.charging) return
    if (this.state === 'wait') {
      const p = world.player()
      if (p) {
        const gap = Math.abs(p.x - this.x)
        // Close, but never stand on top of the player: an unavoidable contact
        // hit is not difficulty.
        const dir = gap < 52 ? -this.facing : this.facing
        this.body.vx = dir * 40 * this.phases[this.phase].speed
        this.playState('walk')
      }
    } else if (this.state === 'open' || this.state === 'stagger') {
      this.body.vx *= 0.82
    } else {
      this.body.vx *= 0.9
    }
  }

  protected onIntro(world: World): void {
    world.audio.playSfx('boss-die', { volume: 0.35, rate: 0.5 })
    world.shake(0.5)
  }
}

registerEntity('boss-kaido', (x, y) => new OniLord(x, y))

/**
 * The shadow master of Thriller Bark.
 *
 * His verb is theft. Every other boss in the game takes health off you; this
 * one takes your shadow, and a player without a shadow moves the same but hits
 * softer — the fight punishes you by making your own attacks worse until you
 * take it back. You take it back by breaking the shade carrying it, which is
 * why the arena fills with them rather than with projectiles.
 *
 * Act one is the shears and the floor. Act two starts stealing. Act three
 * stops pretending and comes at you behind a wall of his own shadows.
 */
export class ShadowMaster extends Boss {
  displayName = 'Moria'
  sheetKey = 'shadow-master'
  private stolen = false
  private struckTwice = false

  constructor(x: number, y: number) {
    super(x, y, 32, 58)
    this.maxHealth = 11
    this.health = 11
    this.accent = PAL.magic
    this.phases = [
      { at: 1, interval: 1.5, speed: 0.95, intensity: 0.82, moves: ['shear', 'graves'] },
      { at: 0.66, interval: 1.25, speed: 1.15, intensity: 0.92, moves: ['steal', 'shear', 'graves'] },
      { at: 0.33, interval: 1.05, speed: 1.3, intensity: 1, moves: ['swarm', 'steal', 'shear'] },
    ]

    this.moves = {
      // Two cuts along the floor, a beat apart. The island's opening statement.
      shear: {
        name: 'shear', tell: 0.6, active: 0.55, recover: 1.3, color: PAL.magic,
        fire: (world) => {
          this.facePlayer(world)
          world.audio.playSfx('slash', { volume: 0.65, rate: 0.8 })
          const gy = groundYAt(world, this.x, this.y - 8)
          world.spawn(new Shockwave(this.x + this.facing * 20, gy, this.facing, 190, PAL.magic))
        },
        during: (t, _dt, world) => {
          if (t < 0.55 || this.struckTwice) return
          this.struckTwice = true
          const gy = groundYAt(world, this.x, this.y - 8)
          world.audio.playSfx('slash', { volume: 0.5, rate: 1.1 })
          world.spawn(new Shockwave(this.x - this.facing * 20, gy, (-this.facing) as 1 | -1, 190, PAL.magic))
        },
        end: () => {
          this.struckTwice = false
        },
      },

      // Hands out of the ground, marked before they arrive.
      graves: {
        name: 'graves', tell: 0.65, active: 1, recover: 1.35, color: PAL.poison,
        fire: (world) => {
          world.audio.playSfx('break', { volume: 0.45, rate: 0.75 })
          const p = world.player()
          const x0 = p ? p.x : this.x
          for (let i = 0; i < 3; i++) {
            const x = clamp(x0 + (i - 1) * 42, this.arenaL + 16, this.arenaR - 16)
            const gy = groundYAt(world, x, this.y - 8)
            world.spawn(new Warning(x, gy, 0.4 + i * 0.13, PAL.magic, 13, (w) => {
              w.spawn(new Column(x, gy, 48, PAL.night, PAL.magic))
            }))
          }
        },
      },

      // The theft. A shade crosses the arena, and if it reaches you it leaves
      // with your shadow — your attacks land for less until you break it.
      steal: {
        name: 'steal', tell: 0.75, active: 1.2, recover: 1.5, color: PAL.magic,
        start: (world) => {
          this.facePlayer(world)
          world.audio.playSfx('warn', { volume: 0.5, rate: 0.55 })
        },
        fire: (world) => {
          const p = world.player() as Player | null
          if (!p) return
          world.audio.playSfx('hurt', { volume: 0.4, rate: 0.6 })
          world.spawn(new Shade(this.x, this.y, this.dirToPlayer(world), this))
          this.stolen = true
        },
      },

      // No more single shades: the room fills with them at once.
      swarm: {
        name: 'swarm', tell: 0.8, active: 1.6, recover: 1.45, color: PAL.night,
        fire: (world) => {
          world.audio.playSfx('warn', { volume: 0.55, rate: 0.4 })
          world.shake(0.3)
          for (let i = 0; i < 3; i++) {
            const dir: 1 | -1 = i % 2 === 0 ? 1 : -1
            const x = dir === 1 ? this.arenaL + 20 : this.arenaR - 20
            const gy = groundYAt(world, x, this.y - 8)
            world.spawn(new Warning(x, gy, 0.3 + i * 0.3, PAL.magic, 12, (w) => {
              w.spawn(new Shade(x, gy, dir, this))
            }))
          }
        },
      },
    }
  }

  /** He keeps his distance and lets the room do the work. */
  protected move(dt: number, world: World): void {
    if (this.state !== 'strike') this.facePlayer(world)
    this.body.vy = Math.min(this.body.vy + PHYS.gravity * dt, PHYS.maxFall)
    if (this.state === 'wait') {
      const p = world.player()
      if (p) {
        const gap = Math.abs(p.x - this.x)
        const dir = gap < 96 ? -this.facing : this.facing
        this.body.vx = dir * 44 * this.phases[this.phase].speed
        this.playState('walk')
      }
    } else if (this.state === 'open' || this.state === 'stagger') {
      this.body.vx *= 0.8
    } else {
      this.body.vx *= 0.9
    }
  }

  /** Losing the fight gives the shadow back — nothing is carried out of it. */
  protected onDefeated(world: World): void {
    if (!this.stolen) return
    const p = world.player() as Player | null
    p?.restoreShadow(world)
  }
}

/**
 * One of his shades, carrying a stolen shadow if it managed to take one.
 *
 * It walks, it does not chase: the counterplay is to stand somewhere it is not
 * and hit it on the way past. Breaking one that holds your shadow gives it
 * straight back, which is the loop the whole fight is built on.
 */
export class Shade extends Entity {
  readonly kind = 'enemy'
  private carrying = false
  private owner: Boss
  private life = 7

  constructor(x: number, y: number, dir: 1 | -1, owner: Boss) {
    super(x, y, 16, 34)
    this.owner = owner
    this.facing = dir
    this.body.vx = dir * 62
    this.depth = 64
    this.health = 1
    this.tags.add('enemy')
  }

  update(dt: number, world: World): void {
    this.age += dt
    this.tickAnim(dt)
    this.body.px = this.body.x
    this.body.py = this.body.y
    this.body.vy = Math.min(this.body.vy + PHYS.gravity * dt, PHYS.maxFall)
    moveBody(this.body, world.map, dt, {})
    if (this.body.onWall !== 0) this.facing = (-this.body.onWall) as 1 | -1
    this.body.vx = this.facing * 62

    const p = world.player() as Player | null
    if (p && !p.dead && rectsOverlap(this.rect(), p.rect())) {
      if (!this.carrying && p.hasShadow) {
        // The theft itself: no damage, which is the point — it costs you your
        // edge rather than your life, and you can win it back.
        this.carrying = true
        p.takeShadow(world)
        world.audio.playSfx('hurt', { volume: 0.45, rate: 0.7 })
        this.facing = (-this.facing) as 1 | -1
      }
    }
    // A shade holding your shadow does not fade: it would take the shadow with
    // it and leave you at half damage for the rest of the fight with nothing
    // to hit. Empty-handed ones still expire, so the arena does not silt up.
    if (!this.carrying && this.age > this.life) this.dead = true
    void this.owner
  }

  damage(hit: Hit, world: World): boolean {
    void hit
    this.dead = true
    world.audio.playSfx('break', { volume: 0.5, rate: 1.2 })
    world.particles.burst(18, this.x, this.y - this.body.h * 0.5, {
      speed: 120, speedVar: 60, life: 0.5, lifeVar: 0.2, size: 2.6, sizeEnd: 0.4,
      color: PAL.magic, colorEnd: rgba(PAL.night, 0), shape: 'puff', drag: 0.06,
      spawnRadius: this.body.w * 0.5,
    })
    if (this.carrying) {
      const p = world.player() as Player | null
      p?.restoreShadow(world)
    }
    return true
  }

  draw(rc: RenderContext, sx: number, sy: number): void {
    const { ctx } = rc
    const w = this.body.w
    const h = this.body.h
    const wob = Math.sin(this.age * 5) * 1.4
    ctx.save()
    ctx.translate(sx, sy)
    ctx.globalAlpha = this.carrying ? 0.9 : 0.72
    ctx.fillStyle = this.carrying ? rgba(PAL.magic, 0.9) : rgba(PAL.night, 0.95)
    ctx.beginPath()
    ctx.moveTo(-w * 0.5, 0)
    ctx.quadraticCurveTo(-w * 0.62 + wob, -h * 0.55, -w * 0.22, -h * 0.82)
    ctx.quadraticCurveTo(0, -h * 1.02, w * 0.24, -h * 0.82)
    ctx.quadraticCurveTo(w * 0.62 - wob, -h * 0.55, w * 0.5, 0)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = rgba(PAL.poison, 0.95)
    ctx.beginPath()
    ctx.ellipse(-3, -h * 0.72, 1.5, 2, 0, 0, Math.PI * 2)
    ctx.ellipse(3.2, -h * 0.72, 1.5, 2, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

registerEntity('boss-moria', (x, y) => new ShadowMaster(x, y))

/**
 * The government agent of Water 7.
 *
 * The fight is about distance, which is the one axis the other bosses leave
 * alone: he hits you from across the arena with a strike that travels, and he
 * closes the gap faster than you can open it. Every other boss is something to
 * get away from; this one has to be kept at exactly the range where his tells
 * are still readable.
 *
 * Act one is the finger pistol, aimed. Act two adds the run. Act three is both
 * at once, from a man who no longer bothers looking like a man.
 */
export class Agent extends Boss {
  displayName = 'Rob Lucci'
  sheetKey = 'agent'
  private rushing = false
  private rushDir: 1 | -1 = 1
  private shotsLeft = 0

  constructor(x: number, y: number) {
    super(x, y, 26, 56)
    this.maxHealth = 11
    this.health = 11
    this.accent = PAL.mist
    this.phases = [
      { at: 1, interval: 1.45, speed: 1, intensity: 0.82, moves: ['pistol', 'sweep'] },
      { at: 0.66, interval: 1.2, speed: 1.25, intensity: 0.92, moves: ['rush', 'pistol'] },
      { at: 0.33, interval: 1, speed: 1.45, intensity: 1, moves: ['volley', 'rush', 'sweep'] },
    ]

    this.moves = {
      // One shot, aimed where you are standing when the arm comes up. The tell
      // is long and the shot is fast: it is a question about where you will be.
      pistol: {
        name: 'pistol', tell: 0.7, active: 0.35, recover: 1.3, color: PAL.mist,
        fire: (world) => {
          this.facePlayer(world)
          world.audio.playSfx('slash', { volume: 0.55, rate: 1.4 })
          world.spawn(new Knife(this.x + this.facing * 16, this.y - 30, this.facing * 320, 0))
        },
      },

      // A low kick that throws the floor at you, both ways.
      sweep: {
        name: 'sweep', tell: 0.55, active: 0.5, recover: 1.25, color: PAL.steel,
        fire: (world) => {
          world.audio.playSfx('slash', { volume: 0.6, rate: 0.9 })
          const gy = groundYAt(world, this.x, this.y - 8)
          for (const dir of [1, -1] as const) {
            world.spawn(new Shockwave(this.x + dir * 18, gy, dir, 210, PAL.mist))
          }
        },
      },

      // He closes. Faster than you can back away, so the answer is over him.
      rush: {
        name: 'rush', tell: 0.6, active: 0.75, recover: 1.5, color: PAL.danger,
        start: (world) => {
          this.facePlayer(world)
          this.rushDir = this.dirToPlayer(world)
          world.audio.playSfx('warn', { volume: 0.45, rate: 1.2 })
        },
        fire: () => {
          this.rushing = true
        },
        during: (_t, _dt, world) => {
          this.body.vx = this.rushDir * 300
          this.facing = this.rushDir
          if (this.x <= this.arenaL + this.body.w || this.x >= this.arenaR - this.body.w) {
            this.rushing = false
            this.body.vx = 0
            world.shake(0.3)
          }
          if (world.rng.bool(0.4)) {
            world.particles.emit({
              x: this.x - this.rushDir * 12, y: this.y - world.rng.range(4, this.body.h * 0.7),
              vx: -this.rushDir * world.rng.range(30, 70), vy: world.rng.range(-20, 10),
              life: 0.35, lifeVar: 0.15, size: 2.2, sizeEnd: 0.3,
              color: PAL.mist, colorEnd: rgba(PAL.slate, 0), shape: 'puff', drag: 0.06,
            } as never)
          }
        },
        end: () => {
          this.rushing = false
          this.body.vx = 0
        },
      },

      // Act three: four shots on a fan, so there is no single safe height.
      volley: {
        name: 'volley', tell: 0.8, active: 1.1, recover: 1.4, color: PAL.mist,
        start: () => {
          this.shotsLeft = 4
        },
        during: (t, _dt, world) => {
          const want = 4 - Math.floor(t * 4)
          if (this.shotsLeft <= want || this.shotsLeft <= 0) return
          this.shotsLeft--
          const i = 3 - this.shotsLeft
          world.audio.playSfx('slash', { volume: 0.45, rate: 1.5 })
          world.spawn(new Knife(
            this.x + this.facing * 16,
            this.y - 12 - i * 12,
            this.facing * 300,
            0,
          ))
        },
      },
    }
  }

  /** Contact is only dangerous while he is committed to the run. */
  get vulnerable(): boolean {
    return !this.rushing && super.vulnerable
  }

  protected move(dt: number, world: World): void {
    if (!this.rushing) this.facePlayer(world)
    this.body.vy = Math.min(this.body.vy + PHYS.gravity * dt, PHYS.maxFall)
    if (this.rushing) return
    if (this.state === 'wait') {
      const p = world.player()
      if (p) {
        // He holds a shooting distance rather than closing: the fight is about
        // the gap, and he is the one who decides how wide it is.
        const gap = Math.abs(p.x - this.x)
        const want = 92
        const dir = gap < want ? -this.facing : this.facing
        this.body.vx = dir * 52 * this.phases[this.phase].speed
        this.playState('walk')
      }
    } else if (this.state === 'open' || this.state === 'stagger') {
      this.body.vx *= 0.8
    } else {
      this.body.vx *= 0.88
    }
  }
}

registerEntity('boss-lucci', (x, y) => new Agent(x, y))

registerEntity('boss-buggy', (x, y) => new BuggyBoss(x, y))
registerEntity('boss-fishman', (x, y) => new FishmanWarlord(x, y))
registerEntity('boss-desert', (x, y) => new DesertWarlord(x, y))
registerEntity('boss-sky', (x, y) => new SkyTyrant(x, y))
