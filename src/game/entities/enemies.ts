import { Enemy } from './Enemy'
import type { World } from '../world'
import { registerEntity } from './registry'
import { PHYS } from '../config'
import { edgeAhead } from '../../physics/move'
import { PAL } from '../../art/palette'

/** Marine grunt — walks, turns at ledges, dies to a stomp. */
export class Grunt extends Enemy {
  sheetKey = 'grunt'
  constructor(x: number, y: number) {
    super(x, y, 12, 20)
    this.speed = 32
  }
  protected think(_dt: number, _world: World): void {
    this.body.vx = this.facing * this.speed
    this.play('walk')
  }
}

/** Shield Marine — must be attacked from behind or hit from above. */
export class Shielder extends Enemy {
  sheetKey = 'shielder'
  constructor(x: number, y: number) {
    super(x, y, 13, 22)
    this.speed = 22
    this.health = 2
    this.points = 400
  }
  protected think(_dt: number, _world: World): void {
    this.body.vx = this.facing * this.speed
    this.play('walk')
  }
  damage(hit: Parameters<Enemy['damage']>[0], world: World): boolean {
    // The shield faces forward: a hit from the front is deflected.
    const fromFront = Math.sign(hit.dirX) === -this.facing
    if (fromFront && hit.kind !== 'stomp') {
      this.flash = 0.4
      world.audio.playSfx('bump')
      world.particles.burst(6, this.x + this.facing * 8, this.y - 12, {
        speed: 90, speedVar: 40, life: 0.25, size: 2, color: PAL.cream, colorEnd: PAL.gold,
        shape: 'spark', additive: true, drag: 0.1,
      })
      return false
    }
    return super.damage(hit, world)
  }
}

/** Cannon crab — sidles fast and never leaves its ledge. */
export class Crab extends Enemy {
  sheetKey = 'crab'
  constructor(x: number, y: number) {
    super(x, y, 16, 12)
    this.speed = 58
    this.points = 300
  }
  protected think(_dt: number, _world: World): void {
    this.body.vx = this.facing * this.speed
    this.play('walk')
  }
}

/** Fishman — patrols, then leaps when the player gets close. */
export class Fishman extends Enemy {
  sheetKey = 'fishman'
  private cooldown = 0
  constructor(x: number, y: number) {
    super(x, y, 13, 24)
    this.speed = 40
    this.health = 2
    this.points = 400
  }
  protected think(dt: number, world: World): void {
    this.cooldown -= dt
    const p = world.player()
    this.body.vx = this.facing * this.speed
    if (p && this.body.grounded && this.cooldown <= 0) {
      const dx = p.x - this.x
      if (Math.abs(dx) < 90 && Math.abs(p.y - this.y) < 60) {
        this.facing = dx > 0 ? 1 : -1
        this.body.vy = -330
        this.body.vx = this.facing * 110
        this.cooldown = 1.6
        world.audio.playSfx('jump', { volume: 0.35, rate: 0.7 })
      }
    }
    this.play(this.body.grounded ? 'walk' : 'idle')
  }
}

/** Sea bat — flies a sine path and ignores terrain. */
export class Bat extends Enemy {
  sheetKey = 'bat'
  private baseY: number
  private phase = 0
  constructor(x: number, y: number) {
    super(x, y, 14, 12)
    this.gravity = 0
    this.speed = 46
    this.avoidLedges = false
    this.baseY = y
    this.body.collidesWithTiles = false
    this.points = 250
  }
  protected think(dt: number, _world: World): void {
    this.phase += dt
    this.body.vx = this.facing * this.speed
    this.body.vy = Math.cos(this.phase * 3) * 44
    // Drift back toward the spawn height so it never wanders off-screen.
    this.body.vy += (this.baseY - this.y) * 0.6
    this.play('idle')
  }
}

/** Urchin — cannot be stomped; bounces the player away. */
export class Urchin extends Enemy {
  sheetKey = 'urchin'
  constructor(x: number, y: number) {
    super(x, y, 14, 14)
    this.stompable = false
    this.damageable = false
    this.speed = 0
    this.points = 0
  }
  protected think(_dt: number, _world: World): void {
    this.body.vx = 0
    this.play('idle')
  }
}

/** Rolling barrel hazard — accelerates downhill and shatters on walls. */
export class Barrel extends Enemy {
  sheetKey = 'crab'
  constructor(x: number, y: number) {
    super(x, y, 14, 14)
    this.speed = 90
    this.avoidLedges = false
    this.stompable = true
    this.points = 150
  }
  protected think(_dt: number, world: World): void {
    this.body.vx = this.facing * this.speed
    if (this.body.grounded && !edgeAhead(this.body, world.map, this.facing)) {
      this.body.vy = Math.min(this.body.vy, PHYS.maxFall)
    }
    this.play('walk')
  }
}

registerEntity('grunt', (x, y) => new Grunt(x, y))
registerEntity('shielder', (x, y) => new Shielder(x, y))
registerEntity('crab', (x, y) => new Crab(x, y))
registerEntity('fishman', (x, y) => new Fishman(x, y))
registerEntity('bat', (x, y) => new Bat(x, y))
registerEntity('urchin', (x, y) => new Urchin(x, y))
registerEntity('barrel', (x, y) => new Barrel(x, y))
