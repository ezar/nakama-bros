import { TILE } from '../types'
import type { PhysicsBody, Rect } from '../types'
import { TileMap } from './TileMap'
import { flagsFor } from './tileFlags'

export interface MoveOptions {
  /** One-way platforms are ignored while this is true (dropping through). */
  dropThrough?: boolean
  /** Bodies that ignore slopes (projectiles, most items) move cheaply. */
  useSlopes?: boolean
  /** Called for each solid tile the body was stopped by. */
  onHit?: (tx: number, ty: number, axis: 'x' | 'y', dir: number) => void
}

export interface MoveResult {
  hitX: boolean
  hitY: boolean
  /** Became grounded this step. */
  landed: boolean
  /** Hit a ceiling this step; carries the tile that was struck. */
  ceiling: boolean
  ceilingTile: { tx: number; ty: number } | null
  /** Impact speed on landing, for dust and squash amounts. */
  impactSpeed: number
}

/** Hitbox rect for a body whose origin is bottom-centre. */
export const bodyRect = (b: PhysicsBody): Rect => ({
  x: b.x - b.w / 2,
  y: b.y - b.h,
  w: b.w,
  h: b.h,
})

/** Surface y of a slope tile at a given world x. Returns null for non-slopes. */
export function slopeSurfaceY(map: TileMap, tx: number, ty: number, worldX: number): number | null {
  const f = flagsFor(map.get(tx, ty))
  if (f.slope === 0) return null
  const localX = Math.max(0, Math.min(TILE, worldX - tx * TILE))
  const top = ty * TILE
  return f.slope === 1 ? top + TILE - localX : top + localX
}

/**
 * Move a body through the tilemap, resolving one axis at a time.
 *
 * Axis separation is what makes platformer collision feel right: horizontal
 * blocking must not cancel a jump, and landing must not cancel a run. Motion
 * is sub-stepped so that fast bodies (Gear 2 dashes, cannonballs) cannot
 * tunnel through a one-tile wall.
 */
export function moveBody(
  body: PhysicsBody,
  map: TileMap,
  dt: number,
  opts: MoveOptions = {},
): MoveResult {
  const res: MoveResult = {
    hitX: false,
    hitY: false,
    landed: false,
    ceiling: false,
    ceilingTile: null,
    impactSpeed: 0,
  }

  body.px = body.x
  body.py = body.y
  body.wasGrounded = body.grounded

  if (!body.collidesWithTiles) {
    body.x += body.vx * dt
    body.y += body.vy * dt
    return res
  }

  const dx = body.vx * dt
  const dy = body.vy * dt
  // Never advance more than a third of a tile per sub-step.
  const maxStep = TILE / 3
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / maxStep))
  const stepX = dx / steps
  const stepY = dy / steps
  const useSlopes = opts.useSlopes !== false

  body.grounded = false
  body.onWall = 0

  for (let i = 0; i < steps; i++) {
    // ── Horizontal ───────────────────────────────────────────────────────────
    if (stepX !== 0) {
      body.x += stepX
      const r = bodyRect(body)
      const dir = stepX > 0 ? 1 : -1
      const probeX = dir > 0 ? r.x + r.w : r.x
      const tx = Math.floor(probeX / TILE)
      const y0 = Math.floor(r.y / TILE)
      // Ignore the bottom sliver so a body walking a slope does not snag.
      const y1 = Math.floor((r.y + r.h - (useSlopes ? 2.5 : 0.001)) / TILE)
      for (let ty = y0; ty <= y1; ty++) {
        const id = map.get(tx, ty)
        const f = flagsFor(id)
        if (!f.solid || f.slope !== 0) continue
        body.x = dir > 0 ? tx * TILE - body.w / 2 - 0.001 : (tx + 1) * TILE + body.w / 2 + 0.001
        body.vx = 0
        body.onWall = dir
        res.hitX = true
        opts.onHit?.(tx, ty, 'x', dir)
        break
      }
    }

    // ── Vertical ─────────────────────────────────────────────────────────────
    if (stepY !== 0) {
      body.y += stepY
      const r = bodyRect(body)
      const dir = stepY > 0 ? 1 : -1
      const probeY = dir > 0 ? r.y + r.h : r.y
      const ty = Math.floor(probeY / TILE)
      const x0 = Math.floor((r.x + 1) / TILE)
      const x1 = Math.floor((r.x + r.w - 1) / TILE)
      for (let tx = x0; tx <= x1; tx++) {
        const id = map.get(tx, ty)
        const f = flagsFor(id)
        if (f.slope !== 0) continue
        const blocking =
          f.solid ||
          (f.oneWay && dir > 0 && !opts.dropThrough && body.py - body.h * 0 <= ty * TILE + 1)
        if (!blocking) continue
        if (dir > 0) {
          res.impactSpeed = body.vy
          body.y = ty * TILE - 0.001
          body.grounded = true
          res.landed = !body.wasGrounded
          if (f.bounce > 0) body.vy = -f.bounce
          else body.vy = 0
        } else {
          body.y = (ty + 1) * TILE + body.h + 0.001
          body.vy = 0
          res.ceiling = true
          res.ceilingTile = { tx, ty }
        }
        res.hitY = true
        opts.onHit?.(tx, ty, 'y', dir)
        break
      }
    }

    // ── Slopes ───────────────────────────────────────────────────────────────
    if (useSlopes) {
      const tx = Math.floor(body.x / TILE)
      // Check the tile at the feet and the one below, so walking off the top of
      // a slope onto flat ground does not drop the body for a frame.
      for (const ty of [Math.floor((body.y - 1) / TILE), Math.floor(body.y / TILE)]) {
        const surface = slopeSurfaceY(map, tx, ty, body.x)
        if (surface === null) continue
        const snapUp = body.y > surface - 0.5
        const snapDown = body.wasGrounded && body.y >= surface - TILE && body.y < surface
        if ((snapUp && body.y < surface + TILE) || snapDown) {
          if (body.vy >= 0) {
            res.impactSpeed = Math.max(res.impactSpeed, body.vy)
            res.landed = res.landed || !body.wasGrounded
            body.y = surface
            body.vy = 0
            body.grounded = true
            body.groundAngle = flagsFor(map.get(tx, ty)).slope === 1 ? -Math.PI / 4 : Math.PI / 4
          }
          break
        }
      }
    }
  }

  if (!body.grounded) body.groundAngle = 0

  // Water volumes do not block, they change the medium.
  const r = bodyRect(body)
  body.inWater = map.anyIn(r.x, r.y + r.h * 0.4, r.w, r.h * 0.6, (f) => f.liquid)

  return res
}

/** Is there solid ground within `probe` px below the body? */
export function groundBelow(body: PhysicsBody, map: TileMap, probe = 2): boolean {
  const r = bodyRect(body)
  return map.anyIn(r.x + 1, r.y + r.h, r.w - 2, probe, (f) => f.solid || f.oneWay)
}

/** Would the body fall off an edge if it kept walking in `dir`? */
export function edgeAhead(body: PhysicsBody, map: TileMap, dir: number): boolean {
  const aheadX = body.x + dir * (body.w / 2 + 2)
  const tx = Math.floor(aheadX / TILE)
  const ty = Math.floor((body.y + 3) / TILE)
  const f = flagsFor(map.get(tx, ty))
  return !(f.solid || f.oneWay)
}

/** Is the body's front blocked by a wall in `dir`? */
export function wallAhead(body: PhysicsBody, map: TileMap, dir: number): boolean {
  const aheadX = body.x + dir * (body.w / 2 + 2)
  const tx = Math.floor(aheadX / TILE)
  const y0 = Math.floor((body.y - body.h + 2) / TILE)
  const y1 = Math.floor((body.y - 3) / TILE)
  for (let ty = y0; ty <= y1; ty++) {
    if (flagsFor(map.get(tx, ty)).solid) return true
  }
  return false
}

export function makeBody(x: number, y: number, w: number, h: number): PhysicsBody {
  return {
    x,
    y,
    px: x,
    py: y,
    vx: 0,
    vy: 0,
    w,
    h,
    grounded: false,
    wasGrounded: false,
    onWall: 0,
    inWater: false,
    groundAngle: 0,
    gravityScale: 1,
    collidesWithTiles: true,
    ridingId: null,
  }
}
