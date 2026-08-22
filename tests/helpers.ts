import { FIXED_DT, TILE, Tile } from '../src/types'
import type { PhysicsBody } from '../src/types'
import { TileMap } from '../src/physics/TileMap'
import { makeBody, moveBody } from '../src/physics/move'
import type { MoveOptions, MoveResult } from '../src/physics/move'
import { PHYS, jumpVelocityFor, stepJumpGravity } from '../src/game/config'
import { approach } from '../src/engine/math'

/**
 * Test-side level builder.
 *
 * The tests are deliberately DOM-free and Player-free: they build a tilemap and
 * a body and run the same `moveBody` the game runs, so what they measure is the
 * contract in SPEC.md rather than a re-implementation of it.
 */
export const CHARS: Record<string, number> = {
  '.': Tile.Empty,
  '#': Tile.Solid,
  '=': Tile.OneWay,
  b: Tile.Brick,
  '^': Tile.Spike,
  '~': Tile.Water,
  '/': Tile.SlopeUp45,
  '\\': Tile.SlopeDown45,
  o: Tile.Bouncy,
  i: Tile.Ice,
}

/** Build a map from rows of characters. Row 0 is the top of the level. */
export function makeMap(rows: string[]): TileMap {
  const w = Math.max(...rows.map((r) => r.length))
  const map = new TileMap(w, rows.length)
  rows.forEach((row, ty) => {
    for (let tx = 0; tx < w; tx++) {
      const ch = row[tx] ?? '.'
      const id = CHARS[ch]
      if (id === undefined) throw new Error(`unknown tile char "${ch}"`)
      map.set(tx, ty, id)
    }
  })
  return map
}

/** A player-sized body (13 x 30) with its feet at the given tile-space point. */
export function playerBody(txCentre: number, tyFeet: number): PhysicsBody {
  return makeBody(txCentre * TILE, tyFeet * TILE, 13, 30)
}

export const step = (
  body: PhysicsBody,
  map: TileMap,
  opts: MoveOptions = {},
  dt = FIXED_DT,
): MoveResult => moveBody(body, map, dt, opts)

/** Peak height in world units of a jump held for `holdSteps` fixed steps. */
export function simulateJump(tiles: number, holdSteps = Infinity, steps = 400): {
  peak: number
  airTime: number
} {
  let vy = -jumpVelocityFor(tiles)
  let y = 0
  let peak = 0
  let cut = false
  for (let i = 0; i < steps; i++) {
    const holding = i < holdSteps
    if (!holding && !cut && vy < 0) {
      vy *= PHYS.jumpCutScale
      cut = true
    }
    vy = stepJumpGravity(vy, FIXED_DT, holding)
    y += vy * FIXED_DT
    peak = Math.min(peak, y)
    if (y >= 0 && i > 0) return { peak: -peak, airTime: (i + 1) * FIXED_DT }
  }
  return { peak: -peak, airTime: steps * FIXED_DT }
}

/** One frame of intent, as the input layer would deliver it. */
export interface Frame {
  ax: number
  jump: boolean
}

/**
 * Run a body through a map with the same horizontal model the Player uses.
 * Used for the determinism check: identical frames must give identical state.
 */
export function runFrames(
  body: PhysicsBody,
  map: TileMap,
  frames: Frame[],
  maxSpeed = 168,
): PhysicsBody {
  for (const f of frames) {
    const grounded = body.grounded
    const turning = f.ax !== 0 && Math.sign(f.ax) !== Math.sign(body.vx) && body.vx !== 0
    let accel = turning ? PHYS.turnAccel : PHYS.accel
    if (!grounded) accel *= PHYS.airAccelScale
    if (f.ax !== 0) {
      body.vx = approach(body.vx, f.ax * maxSpeed, accel * FIXED_DT)
    } else {
      const decel = PHYS.decel * (grounded ? 1 : PHYS.airDecelScale)
      body.vx = approach(body.vx, 0, decel * FIXED_DT)
    }
    if (f.jump && grounded) body.vy = -jumpVelocityFor(3.7)
    body.vy = stepJumpGravity(body.vy, FIXED_DT, f.jump)
    moveBody(body, map, FIXED_DT)
  }
  return body
}

export const snapshot = (b: PhysicsBody): string =>
  [b.x, b.y, b.vx, b.vy, b.grounded, b.onWall, b.groundAngle].join('|')
