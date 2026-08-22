import { TILE } from '../../types'
import type { PowerTier, RenderContext } from '../../types'
import { Entity } from './Entity'
import type { World } from '../world'
import { registerEntity } from './registry'
import { art } from '../../art'
import { PHYS, SCORE, TIER_ORDER } from '../config'
import { moveBody } from '../../physics/move'
import { PAL } from '../../art/palette'
import { rectsOverlap } from '../../engine/math'
import type { Player } from './Player'

/** Anything the player picks up by touching it. */
abstract class Pickup extends Entity {
  readonly kind = 'item'
  abstract sheetKey: string
  /** Bob amplitude in px. */
  bob = 1.5
  bobSpeed = 3
  protected baseY: number

  constructor(x: number, y: number, w = 12, h = 12) {
    super(x, y, w, h)
    this.depth = 40
    this.body.collidesWithTiles = false
    this.body.gravityScale = 0
    this.baseY = y
    this.tags.add('item')
  }

  protected abstract collect(world: World, player: Player): void

  update(dt: number, world: World): void {
    this.tickAnim(dt)
    this.sheet = art().items[this.sheetKey] ?? null
    this.body.px = this.body.x
    this.body.py = this.body.y
    this.body.y = this.baseY + Math.sin(this.age * this.bobSpeed) * this.bob

    const p = world.player() as Player | null
    if (p && !p.dead && rectsOverlap(this.rect(), p.rect())) {
      this.collect(world, p)
      this.dead = true
    }
  }
}

/** Berry — this game's coin. */
export class Berry extends Pickup {
  sheetKey = 'berry'
  constructor(x: number, y: number) {
    super(x, y, 11, 13)
  }
  protected collect(world: World): void {
    world.berries(1, this.x, this.y)
    world.score(SCORE.berry, this.x, this.y)
    world.audio.playSfx('coin')
    world.particles.burst(8, this.x, this.y - 6, {
      speed: 90, speedVar: 40, life: 0.35, size: 1.6, sizeEnd: 0.3,
      color: PAL.gold, colorEnd: PAL.cream, shape: 'spark', additive: true, drag: 0.08, spin: 8,
    })
  }
}

/** Devil fruit — raises the power tier. */
export class Fruit extends Pickup {
  sheetKey: string
  constructor(x: number, y: number, private tier: PowerTier = 'gear2') {
    super(x, y, 14, 14)
    this.sheetKey = `fruit-${tier}`
  }
  protected collect(world: World, player: Player): void {
    const current = TIER_ORDER.indexOf(player.tier)
    const target = TIER_ORDER.indexOf(this.tier)
    player.setTier(TIER_ORDER[Math.max(current, target)], world)
    world.score(1000, this.x, this.y)
  }
}

/** Meat — restores one tier, or awards points at full power. */
export class Meat extends Pickup {
  sheetKey = 'meat'
  constructor(x: number, y: number) {
    super(x, y, 14, 12)
  }
  protected collect(world: World, player: Player): void {
    const i = TIER_ORDER.indexOf(player.tier)
    if (i < TIER_ORDER.length - 1) player.setTier(TIER_ORDER[i + 1], world)
    else world.score(500, this.x, this.y)
    world.audio.playSfx('powerup')
  }
}

/** Poneglyph fragment — three hidden per level. */
export class Fragment extends Pickup {
  sheetKey = 'fragment'
  constructor(x: number, y: number, private index = 0) {
    super(x, y, 14, 16)
    this.bob = 2.5
  }
  protected collect(world: World): void {
    world.run.score += SCORE.fragment
    const flags = (world.run as unknown as { fragments?: boolean[] }).fragments
    if (flags) flags[this.index] = true
    world.audio.playSfx('checkpoint')
    world.score(SCORE.fragment, this.x, this.y)
    world.shake(0.15)
    world.particles.burst(30, this.x, this.y - 8, {
      speed: 140, speedVar: 60, life: 0.7, lifeVar: 0.2, size: 2.4, sizeEnd: 0.3,
      color: PAL.magic, colorEnd: PAL.white, shape: 'star', additive: true, drag: 0.05, spin: 5,
    })
  }
}

/** Extra life. */
export class OneUp extends Pickup {
  sheetKey = 'oneup'
  constructor(x: number, y: number) {
    super(x, y, 14, 14)
  }
  protected collect(world: World): void {
    world.run.lives++
    world.audio.playSfx('1up')
  }
}

/** Checkpoint flag — moves the respawn point. */
export class Checkpoint extends Entity {
  readonly kind = 'trigger'
  private triggered = false
  constructor(x: number, y: number) {
    super(x, y, 16, 42)
    this.depth = 30
    this.body.collidesWithTiles = false
    this.cullable = false
  }
  update(dt: number, world: World): void {
    this.tickAnim(dt)
    this.sheet = art().items.checkpoint ?? null
    if (this.triggered) return
    const p = world.player()
    if (p && rectsOverlap(this.rect(), p.rect())) {
      this.triggered = true
      world.setCheckpoint({ x: this.x, y: this.y })
      world.audio.playSfx('checkpoint')
      world.events.emit('level:checkpoint', { x: this.x, y: this.y })
      world.particles.burst(24, this.x, this.y - 30, {
        speed: 110, speedVar: 50, life: 0.6, size: 2, sizeEnd: 0.4,
        color: PAL.marineBlue, colorEnd: PAL.cream, shape: 'spark', additive: true, drag: 0.06,
      })
    }
  }
}

/** Goal — the Going Merry's mast at the end of the level. */
export class Goal extends Entity {
  readonly kind = 'trigger'
  private triggered = false
  constructor(x: number, y: number) {
    super(x, y, 18, 70)
    this.depth = 30
    this.body.collidesWithTiles = false
    this.cullable = false
  }
  update(dt: number, world: World): void {
    this.tickAnim(dt)
    this.sheet = art().items.goal ?? null
    if (this.triggered) return
    const p = world.player() as Player | null
    if (p && !p.dead && rectsOverlap(this.rect(), p.rect())) {
      this.triggered = true
      p.startClear(world)
      world.clearLevel()
    }
  }
}

/** A platform that patrols between two points, carrying whatever stands on it. */
export class MovingPlatform extends Entity {
  readonly kind = 'platform'
  private t = 0
  constructor(
    x: number,
    y: number,
    private spanX: number,
    private spanY: number,
    private period: number,
    private width: number,
  ) {
    super(x, y, width, 8)
    this.depth = 45
    this.body.collidesWithTiles = false
    this.cullable = false
    this.tags.add('platform')
  }

  update(dt: number, world: World): void {
    this.t += dt
    const prevX = this.body.x
    const prevY = this.body.y
    const phase = Math.sin((this.t / this.period) * Math.PI * 2)
    this.body.px = prevX
    this.body.py = prevY
    this.body.x = this.startX + phase * this.spanX
    this.body.y = this.startY + phase * this.spanY
    const dx = this.body.x - prevX
    const dy = this.body.y - prevY

    // Carry anything resting on the top surface.
    const top = this.body.y - this.body.h
    for (const e of world.entities) {
      if (e === this || !e.body.collidesWithTiles || e.dead) continue
      const r = e.rect()
      const onTop =
        r.x < this.body.x + this.width / 2 &&
        r.x + r.w > this.body.x - this.width / 2 &&
        Math.abs(r.y + r.h - top) < 3 &&
        e.body.vy >= 0
      if (!onTop) continue
      e.body.x += dx
      e.body.y = top + dy
      e.body.grounded = true
      e.body.vy = Math.min(e.body.vy, 0)
    }
  }

  private startX = this.body.x
  private startY = this.body.y

  draw(rc: RenderContext, sx: number, sy: number): void {
    const { ctx } = rc
    const w = this.width
    ctx.save()
    ctx.translate(sx - w / 2, sy - 8)
    ctx.fillStyle = PAL.woodDeep
    ctx.fillRect(0, 0, w, 8)
    ctx.fillStyle = PAL.wood
    ctx.fillRect(0, 0, w, 5)
    ctx.fillStyle = PAL.woodLight
    ctx.fillRect(0, 0, w, 1)
    ctx.fillStyle = PAL.ink
    ctx.fillRect(0, 7, w, 1)
    for (let i = 6; i < w; i += 10) ctx.fillRect(i, 1, 1, 6)
    ctx.restore()
  }
}

/** A brick that falls a beat after being stood on. */
export class CrumbleBlock extends Entity {
  readonly kind = 'platform'
  private timer = -1
  constructor(x: number, y: number) {
    super(x, y, TILE, TILE)
    this.depth = 44
    this.body.collidesWithTiles = false
  }
  update(dt: number, world: World): void {
    const p = world.player()
    if (this.timer < 0 && p) {
      const r = p.rect()
      const top = this.body.y - this.body.h
      if (Math.abs(r.y + r.h - top) < 3 && Math.abs(p.x - this.x) < TILE) {
        this.timer = 0
        world.audio.playSfx('warn', { volume: 0.35 })
      }
    }
    if (this.timer >= 0) {
      this.timer += dt
      if (this.timer > 0.55) {
        this.body.vy = Math.min(this.body.vy + PHYS.gravity * dt, PHYS.maxFall)
        moveBody(this.body, world.map, dt, { useSlopes: false })
        if (this.age > 4) this.dead = true
      }
    }
  }
  draw(rc: RenderContext, sx: number, sy: number): void {
    const shake = this.timer >= 0 && this.timer < 0.55 ? Math.sin(this.timer * 60) * 1.2 : 0
    const { ctx } = rc
    ctx.save()
    ctx.translate(Math.round(sx - TILE / 2 + shake), Math.round(sy - TILE))
    ctx.fillStyle = PAL.woodDeep
    ctx.fillRect(0, 0, TILE, TILE)
    ctx.fillStyle = PAL.wood
    ctx.fillRect(1, 1, TILE - 2, TILE - 3)
    ctx.fillStyle = PAL.woodLight
    ctx.fillRect(1, 1, TILE - 2, 1)
    ctx.restore()
  }
}

registerEntity('berry', (x, y) => new Berry(x, y))
registerEntity('meat', (x, y) => new Meat(x, y))
registerEntity('fruit', (x, y, o) => new Fruit(x, y, (o?.tier as PowerTier) ?? 'gear2'))
registerEntity('fragment', (x, y, o) => new Fragment(x, y, Number(o?.index ?? 0)))
registerEntity('oneup', (x, y) => new OneUp(x, y))
registerEntity('checkpoint', (x, y) => new Checkpoint(x, y))
registerEntity('goal', (x, y) => new Goal(x, y))
registerEntity('platform', (x, y, o) =>
  new MovingPlatform(
    x, y,
    Number(o?.spanX ?? 48), Number(o?.spanY ?? 0),
    Number(o?.period ?? 3), Number(o?.width ?? 40),
  ))
registerEntity('crumble', (x, y) => new CrumbleBlock(x, y))
