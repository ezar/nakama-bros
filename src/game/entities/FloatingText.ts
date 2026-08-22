import type { RenderContext } from '../../types'
import { Entity } from './Entity'
import type { World } from '../world'
import { PAL } from '../../art/palette'
import { drawText } from '../../render/text'

/** A score or combo number that rises and fades. */
export class FloatingText extends Entity {
  readonly kind = 'fx'
  constructor(
    x: number,
    y: number,
    private text: string,
    private color: string = PAL.cream,
    private life = 0.9,
  ) {
    super(x, y, 1, 1)
    this.depth = 200
    this.body.collidesWithTiles = false
    this.body.vy = -42
    this.cullable = false
  }
  update(dt: number, _world: World): void {
    this.age += dt
    this.body.px = this.body.x
    this.body.py = this.body.y
    this.body.y += this.body.vy * dt
    this.body.vy += 34 * dt
    if (this.age > this.life) this.dead = true
  }
  draw(rc: RenderContext, sx: number, sy: number): void {
    const t = this.age / this.life
    rc.ctx.save()
    rc.ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3
    drawText(rc.ctx, this.text, sx, sy, { color: this.color, align: 'center', shadow: PAL.ink })
    rc.ctx.restore()
  }
}
