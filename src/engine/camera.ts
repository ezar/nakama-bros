import type { CameraState, Rect } from '../types'
import { GAME_H, GAME_W, RENDER_SCALE } from '../types'
import { clamp, damp } from './math'

/**
 * A Mario-style follow camera: a dead zone the player moves freely inside, a
 * look-ahead that leads the direction of travel, a softer vertical rule that
 * only chases when the player is grounded or falling fast, and trauma-based
 * shake that decays quadratically so small hits stay subtle.
 */
export class Camera implements CameraState {
  x = 0
  y = 0
  shake = 0
  zoom = 1

  /** Half-width of the horizontal dead zone, in px. */
  deadX = 14
  /** Half-height of the vertical dead zone, in px. */
  deadY = 21
  /** How far ahead of the player the camera leads at full speed. */
  lookAhead = 40
  /** Seconds for the look-ahead to reach its target. */
  lookHalfLife = 0.28

  private lookOffset = 0
  private targetY = 0
  private trauma = 0
  private shakeTime = 0
  bounds: Rect = { x: 0, y: 0, w: GAME_W, h: GAME_H }

  setBounds(w: number, h: number): void {
    this.bounds = { x: 0, y: 0, w, h }
  }

  snapTo(px: number, py: number): void {
    this.lookOffset = 0
    this.x = px - GAME_W / 2
    this.y = py - GAME_H / 2
    this.targetY = this.y
    this.clampToBounds()
  }

  /** Add shake trauma in 0..1. Multiple sources accumulate but saturate. */
  addTrauma(amount: number): void {
    this.trauma = clamp(this.trauma + amount, 0, 1)
  }

  update(
    dt: number,
    px: number,
    py: number,
    vx: number,
    grounded: boolean,
  ): void {
    // Horizontal: dead zone plus velocity-proportional look-ahead.
    const centreX = this.x + GAME_W / 2
    const dx = px - centreX
    if (dx > this.deadX) this.x += dx - this.deadX
    else if (dx < -this.deadX) this.x += dx + this.deadX

    const desiredLook = clamp(vx / 170, -1, 1) * this.lookAhead
    this.lookOffset = damp(this.lookOffset, desiredLook, this.lookHalfLife, dt)

    // Vertical: track the last grounded height so jumps do not swing the view.
    if (grounded) this.targetY = py - GAME_H * 0.58
    const centreY = this.targetY + GAME_H / 2
    const dy = py - centreY
    if (dy > this.deadY) this.targetY += dy - this.deadY
    else if (dy < -this.deadY * 2.2) this.targetY += dy + this.deadY * 2.2
    this.y = damp(this.y, this.targetY, grounded ? 0.09 : 0.16, dt)

    this.trauma = Math.max(0, this.trauma - dt * 1.6)
    this.shakeTime += dt
    this.shake = this.trauma * this.trauma * 7

    this.clampToBounds()
  }

  /**
   * Draw origin snapped to the device pixel grid, so the art stays crisp
   * without the scroll stepping.
   *
   * This used to round to a whole *world* unit, which is `RENDER_SCALE` device
   * pixels — three. Running at 168 px/s the camera wants to move 2.8 units a
   * frame, and rounding forced 3, 3, 3, 2, 3, 3, 3, 2: measured, the whole view
   * scrolled in alternating 3-and-4 unit steps and the player oscillated 1 unit
   * — 3 device pixels — back and forth every other frame at 60Hz. Snapping to
   * the device grid instead keeps the same guarantee (art rasterised at
   * ART_SCALE lands one texel on one device pixel, so nothing shimmers) with a
   * third of the step, which is the finest the display can express.
   */
  renderOrigin(): { x: number; y: number } {
    const s = this.shake
    const t = this.shakeTime * 47
    const ox = s === 0 ? 0 : Math.sin(t) * s
    const oy = s === 0 ? 0 : Math.cos(t * 1.31) * s
    const snap = (v: number): number => Math.round(v * RENDER_SCALE) / RENDER_SCALE
    return {
      x: snap(this.x + this.lookOffset + ox),
      y: snap(this.y + oy),
    }
  }

  private clampToBounds(): void {
    const maxX = Math.max(0, this.bounds.w - GAME_W)
    const maxY = Math.max(0, this.bounds.h - GAME_H)
    this.x = clamp(this.x, 0, maxX)
    this.targetY = clamp(this.targetY, 0, maxY)
    this.y = clamp(this.y, 0, maxY)
  }
}
