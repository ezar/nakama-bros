import { TILE } from '../types'
import type { PhysicsBody, Rect, TileFlags } from '../types'
import { TileMap } from './TileMap'
import { flagsFor } from './tileFlags'

export interface MoveOptions {
  /** One-way platforms are ignored while this is true (dropping through). */
  dropThrough?: boolean
  /** Bodies that ignore slopes (projectiles, most items) move cheaply. */
  useSlopes?: boolean
  /**
   * How far the body may be lifted over a lip instead of being stopped by it.
   * Defaults to `STEP_UP_GROUND` on the ground (this is what makes the seam
   * between a slope and the flat ground next to it disappear) and
   * `STEP_UP_AIR` in the air (this is the ledge-grab forgiveness: a jump that
   * lands a hair short still catches the edge).
   */
  stepUp?: number
  /** How far the body may be pushed sideways past a ceiling corner. */
  cornerNudge?: number
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
  /** Total units the body was lifted over lips and ledges this step. */
  steppedUp: number
  /** A jump was saved by sliding the body past a ceiling corner. */
  cornerNudged: boolean
}

/** Lip height a grounded body walks over instead of stopping against. */
export const STEP_UP_GROUND = 7
/** Ledge-grab forgiveness while airborne — a miss of this much still catches. */
export const STEP_UP_AIR = 2.5
/** Horizontal slack for squeezing a rising body past a ceiling corner. */
export const CORNER_NUDGE = 3.2
/** A one-way counts as "stood on" when the feet start within this of its top. */
const ONEWAY_EPS = 0.5
/** Never advance more than this per sub-step, so nothing tunnels. */
const MAX_SUBSTEP = TILE / 3
/** Points across the footprint used to read the ground height field. */
const SUPPORT_SAMPLES = 4

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

/** Would a body of this size at this position be inside a wall? */
function blockedAt(
  map: TileMap,
  x: number,
  y: number,
  w: number,
  h: number,
  slopesAreWalls: boolean,
): boolean {
  return map.anyIn(
    x - w / 2 + 0.5,
    y - h + 0.5,
    w - 1,
    h - 1,
    (f: TileFlags) => f.solid && (slopesAreWalls || f.slope === 0),
  )
}

/**
 * Move a body through the tilemap, resolving one axis at a time.
 *
 * Axis separation is what makes platformer collision feel right: horizontal
 * blocking must not cancel a jump, and landing must not cancel a run. Motion
 * is sub-stepped so that fast bodies (Gear 2 dashes, cannonballs) cannot
 * tunnel through a one-tile wall.
 *
 * Three forgiveness rules ride on top of the raw resolution, because a grid is
 * harsher than a player's intent:
 *   • step-up  — a lip shorter than `stepUp` lifts the body instead of stopping
 *     it, which is both the slope↔flat seam and the ledge grab;
 *   • corner nudge — a rising body that clips a ceiling corner by a couple of
 *     units slides past it rather than losing the whole jump;
 *   • ground glue — a body that was grounded and is now a few units above the
 *     surface is pulled back down, so walking *down* a slope is one smooth
 *     line rather than a stutter of little falls.
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
    steppedUp: 0,
    cornerNudged: false,
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
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / MAX_SUBSTEP))
  const stepX = dx / steps
  const stepY = dy / steps
  const useSlopes = opts.useSlopes !== false
  // Bodies that do not walk slopes treat them as plain solid blocks, so a
  // cannonball hits a ramp instead of sinking through it.
  const slopesAreWalls = !useSlopes
  const cornerNudge = opts.cornerNudge ?? CORNER_NUDGE

  body.grounded = false
  body.onWall = 0

  for (let i = 0; i < steps; i++) {
    const groundish = body.grounded || (body.wasGrounded && body.vy >= 0)
    const stepUp = opts.stepUp ?? (useSlopes ? (groundish ? STEP_UP_GROUND : STEP_UP_AIR) : 0)

    // ── Horizontal ───────────────────────────────────────────────────────────
    if (stepX !== 0) {
      body.x += stepX
      const r = bodyRect(body)
      const dir = stepX > 0 ? 1 : -1
      const probeX = dir > 0 ? r.x + r.w : r.x
      const tx = Math.floor(probeX / TILE)
      const y0 = Math.floor((r.y + 1) / TILE)
      const y1 = Math.floor((r.y + r.h - 1) / TILE)
      let blockTy = -1
      // The tallest obstruction decides: a body may be lifted over the lip of
      // the highest thing it is touching, or by nothing at all.
      let highestTop = Infinity
      for (let ty = y0; ty <= y1; ty++) {
        const f = flagsFor(map.get(tx, ty))
        if (!f.solid) continue
        if (f.slope !== 0 && !slopesAreWalls) continue
        if (blockTy < 0) blockTy = ty
        highestTop = Math.min(highestTop, ty * TILE)
      }
      if (blockTy >= 0) {
        const feet = r.y + r.h
        const lift = feet - highestTop
        const canStep =
          lift > 0 &&
          lift <= stepUp &&
          !blockedAt(map, body.x, body.y - lift, body.w, body.h, slopesAreWalls)
        if (canStep) {
          body.y -= lift
          res.steppedUp += lift
          // A lift while falling is a caught ledge: it lands. A lift while
          // rising is only a nudge — the body keeps its jump.
          if (body.vy >= 0) {
            if (!body.grounded) {
              res.landed = res.landed || !body.wasGrounded
              res.impactSpeed = Math.max(res.impactSpeed, body.vy)
            }
            body.grounded = true
            body.vy = 0
          }
        } else {
          body.x = dir > 0 ? tx * TILE - body.w / 2 - 0.001 : (tx + 1) * TILE + body.w / 2 + 0.001
          body.vx = 0
          body.onWall = dir
          res.hitX = true
          opts.onHit?.(tx, blockTy, 'x', dir)
        }
      }
    }

    // ── Vertical ─────────────────────────────────────────────────────────────
    if (stepY !== 0) {
      // The feet *before* the sub-step decide whether a one-way is a floor.
      // Comparing against the position at the start of the whole frame lets a
      // fast body appear below a platform and still be caught by it.
      const feetBefore = body.y
      body.y += stepY
      const r = bodyRect(body)
      const dir = stepY > 0 ? 1 : -1
      const probeY = dir > 0 ? r.y + r.h : r.y
      const ty = Math.floor(probeY / TILE)
      const x0 = Math.floor((r.x + 1) / TILE)
      const x1 = Math.floor((r.x + r.w - 1) / TILE)
      const blockers: number[] = []
      for (let tx = x0; tx <= x1; tx++) {
        const f = flagsFor(map.get(tx, ty))
        if (f.slope !== 0 && !slopesAreWalls) continue
        const blocking =
          f.solid ||
          (f.oneWay && dir > 0 && !opts.dropThrough && feetBefore <= ty * TILE + ONEWAY_EPS)
        if (blocking) blockers.push(tx)
      }

      if (blockers.length > 0) {
        let stopped = true
        if (dir < 0 && cornerNudge > 0 && blockers.length < x1 - x0 + 1) {
          // A rising body that only catches the very corner of a block is
          // pushed past it. Losing a whole jump to two units of overlap is the
          // single most frustrating thing a tile grid does.
          const leftOnly = blockers[blockers.length - 1] < x1
          const overlap = leftOnly
            ? (blockers[blockers.length - 1] + 1) * TILE - r.x
            : r.x + r.w - blockers[0] * TILE
          const push = leftOnly ? overlap + 0.1 : -(overlap + 0.1)
          if (
            overlap > 0 &&
            overlap <= cornerNudge &&
            !blockedAt(map, body.x + push, body.y, body.w, body.h, slopesAreWalls)
          ) {
            body.x += push
            res.cornerNudged = true
            stopped = false
          }
        }
        if (stopped) {
          const tx = blockers[0]
          const f = flagsFor(map.get(tx, ty))
          if (dir > 0) {
            res.impactSpeed = body.vy
            body.y = ty * TILE - 0.001
            body.grounded = true
            res.landed = !body.wasGrounded
            body.vy = f.bounce > 0 ? -f.bounce : 0
          } else {
            body.y = (ty + 1) * TILE + body.h + 0.001
            body.vy = 0
            res.ceiling = true
            res.ceilingTile = { tx, ty }
          }
          res.hitY = true
          opts.onHit?.(tx, ty, 'y', dir)
        }
      }
    }

    // ── Ground follow ────────────────────────────────────────────────────────
    if (useSlopes) {
      followGround(body, map, res, Math.abs(stepX), stepUp, opts.dropThrough === true)
    }
  }

  if (!body.grounded) body.groundAngle = 0

  // Water volumes do not block, they change the medium.
  const r = bodyRect(body)
  body.inWater = map.anyIn(r.x, r.y + r.h * 0.4, r.w, r.h * 0.6, (f) => f.liquid)

  return res
}

/** A surface the feet can rest on, and the angle to stand at. */
interface Support {
  y: number
  angle: number
}

/**
 * The ground under a body is a height field, not a stack of boxes.
 *
 * Sampling the whole footprint and taking the *highest* support is what makes
 * the joints disappear: walking up a ramp the leading corner is already on the
 * flat tile at the top, walking down it the trailing corner is still on the
 * tile behind, and in both cases the height glides instead of stepping. A
 * single centre probe cannot see either of those and produces the classic
 * stutter at the crest.
 */
function sampleSupport(
  map: TileMap,
  x: number,
  w: number,
  feet: number,
  up: number,
  down: number,
  dropThrough: boolean,
): Support | null {
  const left = x - w / 2 + 0.5
  const right = x + w / 2 - 0.5
  const tyTop = Math.floor((feet - up) / TILE)
  const tyBottom = Math.floor((feet + down) / TILE)
  let best: Support | null = null
  for (let i = 0; i <= SUPPORT_SAMPLES; i++) {
    const sx = left + ((right - left) * i) / SUPPORT_SAMPLES
    const tx = Math.floor(sx / TILE)
    for (let ty = tyTop; ty <= tyBottom; ty++) {
      const f = flagsFor(map.get(tx, ty))
      let surface: number | null = null
      let angle = 0
      if (f.slope !== 0) {
        surface = slopeSurfaceY(map, tx, ty, sx)
        angle = f.slope === 1 ? -Math.PI / 4 : Math.PI / 4
      } else if (f.solid) {
        surface = ty * TILE - 0.001
      } else if (f.oneWay && !dropThrough && feet <= ty * TILE + ONEWAY_EPS) {
        surface = ty * TILE - 0.001
      }
      if (surface === null) continue
      if (surface < feet - up || surface > feet + down) continue
      if (!best || surface < best.y) best = { y: surface, angle }
    }
  }
  return best
}

/**
 * Push out of ground that was walked into, and glue back down to ground that
 * was walked off the top of. The glue never reaches further than the body
 * travelled horizontally, so a 45° descent stays welded while a cliff edge
 * still drops.
 */
function followGround(
  body: PhysicsBody,
  map: TileMap,
  res: MoveResult,
  travelX: number,
  up: number,
  dropThrough: boolean,
): void {
  if (body.vy < 0) return
  const glued = body.grounded || body.wasGrounded
  const down = glued ? Math.min(TILE, travelX + 2) : 0.001
  const support = sampleSupport(map, body.x, body.w, body.y, up, down, dropThrough)
  if (!support) return
  const penetrating = body.y > support.y - 0.001
  if (!penetrating && !(glued && support.y - body.y <= down)) return
  if (!body.grounded) {
    res.landed = res.landed || !body.wasGrounded
    res.impactSpeed = Math.max(res.impactSpeed, body.vy)
  }
  body.y = support.y
  body.vy = 0
  body.grounded = true
  body.groundAngle = support.angle
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

/**
 * Is the body's front blocked by a wall in `dir`?
 *
 * Slopes are not walls: something walking up a ramp must not read it as a
 * dead end, and the player must not be able to wall-slide down one.
 */
export function wallAhead(body: PhysicsBody, map: TileMap, dir: number, reach = 2): boolean {
  const aheadX = body.x + dir * (body.w / 2 + reach)
  const tx = Math.floor(aheadX / TILE)
  const y0 = Math.floor((body.y - body.h + 2) / TILE)
  const y1 = Math.floor((body.y - 3) / TILE)
  for (let ty = y0; ty <= y1; ty++) {
    const f = flagsFor(map.get(tx, ty))
    if (f.solid && f.slope === 0) return true
  }
  return false
}

/** Is there room for a body of height `h` standing at (x, y)? */
export function headroom(map: TileMap, x: number, y: number, w: number, h: number): boolean {
  return !blockedAt(map, x, y, w, h, true)
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
