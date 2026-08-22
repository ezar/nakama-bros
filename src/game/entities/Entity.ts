import type { Facing, Frame, Hit, PhysicsBody, Rect, RenderContext, SpriteSheet } from '../../types'
import { bodyRect, makeBody } from '../../physics/move'
import type { World } from '../world'

let nextId = 1

/**
 * Base class for everything that lives in the level: the player, enemies,
 * bosses, items, projectiles, moving platforms and pure-visual effects.
 *
 * Update order is deterministic (insertion order), and removal is deferred to
 * the end of the step via `dead`, so an entity may safely kill another one
 * mid-iteration.
 */
export abstract class Entity {
  readonly id = nextId++
  /** Coarse category, used for broad-phase filtering. */
  abstract readonly kind: string
  /** Fine-grained tags for `nearest` lookups and damage rules. */
  readonly tags = new Set<string>()

  body: PhysicsBody
  facing: Facing = 1
  /** Removed at the end of the current step. */
  dead = false
  /** Skipped by update and draw while false. */
  active = true
  /** Draw order. Lower draws first. Player is 100. */
  depth = 50
  /** Seconds this entity has existed. */
  age = 0
  /** Health for damageable entities. */
  health = 1
  /** Seconds of invulnerability remaining. */
  iframes = 0
  /** Entities further than this many px off-screen stop updating. */
  cullDistance = 220
  /** When false, the entity keeps updating even far off-screen (bosses, platforms). */
  cullable = true

  sheet: SpriteSheet | null = null
  anim = 'idle'
  animTime = 0
  animFinished = false

  /** Squash-and-stretch, applied at draw time. 1 = neutral. */
  squashX = 1
  squashY = 1
  /** White flash amount 0..1, for hit feedback. */
  flash = 0

  constructor(x: number, y: number, w: number, h: number) {
    this.body = makeBody(x, y, w, h)
  }

  get x(): number {
    return this.body.x
  }

  get y(): number {
    return this.body.y
  }

  rect(): Rect {
    return bodyRect(this.body)
  }

  /** The box other entities test against. Defaults to the physics box. */
  hurtbox(): Rect {
    return this.rect()
  }

  /** The box this entity damages with. Null when it cannot damage. */
  hitbox(): Rect | null {
    return null
  }

  /** Advance one fixed step. */
  abstract update(dt: number, world: World): void

  /** Draw at the interpolated position. Override for custom rendering. */
  draw(rc: RenderContext, sx: number, sy: number): void {
    const frame = this.frame()
    if (!frame || !this.sheet) return
    const { ctx } = rc
    ctx.save()
    ctx.translate(sx, sy)
    if (this.squashX !== 1 || this.squashY !== 1) ctx.scale(this.squashX, this.squashY)
    if (this.facing === -1) ctx.scale(-1, 1)
    ctx.drawImage(
      this.sheet.image,
      frame.sx,
      frame.sy,
      frame.sw,
      frame.sh,
      Math.round(frame.ox),
      Math.round(frame.oy),
      frame.sw,
      frame.sh,
    )
    ctx.restore()
  }

  /** Current animation frame, or null when unanimated. */
  frame(): Frame | null {
    const a = this.sheet?.anims[this.anim]
    if (!a || a.frames.length === 0) return null
    let t = this.animTime
    const total = a.frames.reduce((s, f) => s + f.dur, 0)
    if (total <= 0) return a.frames[0]
    if (a.loop) t %= total
    else if (t >= total) return a.frames[a.frames.length - 1]
    for (const f of a.frames) {
      if (t < f.dur) return f
      t -= f.dur
    }
    return a.frames[a.frames.length - 1]
  }

  play(name: string, restart = false): void {
    if (this.anim === name && !restart) return
    this.anim = name
    this.animTime = 0
    this.animFinished = false
  }

  /** Advance the animation clock and squash recovery. Call from `update`. */
  protected tickAnim(dt: number): void {
    this.animTime += dt
    const a = this.sheet?.anims[this.anim]
    if (a && !a.loop) {
      const total = a.frames.reduce((s, f) => s + f.dur, 0)
      this.animFinished = this.animTime >= total
    }
    this.squashX += (1 - this.squashX) * Math.min(1, dt * 14)
    this.squashY += (1 - this.squashY) * Math.min(1, dt * 14)
    this.flash = Math.max(0, this.flash - dt * 5)
    if (this.iframes > 0) this.iframes -= dt
    this.age += dt
  }

  /** Apply a squash impulse. `x`/`y` are multipliers, e.g. (1.3, 0.7) on land. */
  squash(x: number, y: number): void {
    this.squashX = x
    this.squashY = y
  }

  /** Receive damage. Return true if the hit connected. */
  damage(_hit: Hit, _world: World): boolean {
    return false
  }

  /** Called once when removed. Spawn debris, drop loot, etc. */
  onRemove(_world: World): void {}
}
