import type { LevelDef, SpawnDef } from '../../types'
import { C, REACH } from './builder'

/**
 * Structural checks for level data.
 *
 * A level is data, so its failures are silent: a row one character short shifts
 * every tile after it, a slope with nothing under it hangs in the sky, a ladder
 * one tile away from its tower reads as rope hanging from a cloud. None of that
 * throws — it just ships. So the rules that a level must obey are written down
 * here, run by `levels.test.ts` over the whole campaign, and run again by
 * `scripts/levelmap.mjs` next to the picture it draws.
 *
 * Everything here is pure and DOM-free so it can run under node.
 */

export interface Issue {
  level: string
  severity: 'error' | 'warn'
  /** Where, in tiles, when the issue has a place. */
  tx?: number
  ty?: number
  message: string
}

/**
 * Spawn types the entity registry actually knows.
 *
 * The registry populates itself at module load from files that import the art
 * library, which cannot run under node — so the list is repeated here on
 * purpose. An unknown type only logs a dev warning at runtime and then silently
 * does nothing, which is exactly the sort of failure this file exists to catch.
 */
export const KNOWN_TYPES = new Set([
  'grunt', 'shielder', 'crab', 'fishman', 'bat', 'urchin', 'barrel',
  'berry', 'meat', 'fruit', 'fragment', 'oneup',
  'checkpoint', 'goal', 'platform', 'crumble',
  'boss-buggy',
])

/**
 * Types the campaign is authored against but the registry does not have yet.
 *
 * A stage that needs one is built so it is still completable without it — the
 * spawn simply does not appear — and says so here rather than silently. Move a
 * name from this set to `KNOWN_TYPES` the day it registers.
 */
export const REQUESTED_TYPES = new Set(['boss-kaido'])

/** Types that must be standing on something when the level starts. */
const GROUNDED_TYPES = new Set([
  'grunt', 'shielder', 'crab', 'urchin', 'barrel', 'checkpoint', 'goal',
  'boss-buggy', 'boss-kaido',
])

const SOLIDISH = new Set<string>([C.solid, C.brick, C.question, C.used, C.ice, C.bouncy, C.crumble])
const STANDABLE = new Set<string>([...SOLIDISH, C.oneWay])
const SLOPES = new Set<string>([C.slopeUp, C.slopeDown])

/** Reader over a level's rows that never falls off the edge. */
export class Grid {
  constructor(private def: LevelDef) {}
  get w(): number { return this.def.w }
  get h(): number { return this.def.h }
  at(x: number, y: number): string {
    if (x < 0 || x >= this.def.w) return C.solid
    if (y < 0 || y >= this.def.h) return C.air
    return this.def.rows[y]?.[x] ?? C.air
  }
  solid(x: number, y: number): boolean { return SOLIDISH.has(this.at(x, y)) || SLOPES.has(this.at(x, y)) }
  standable(x: number, y: number): boolean { return STANDABLE.has(this.at(x, y)) || SLOPES.has(this.at(x, y)) }
  /** Free enough for a body to occupy: not a wall, not a slope's mass. */
  free(x: number, y: number): boolean {
    const c = this.at(x, y)
    return !SOLIDISH.has(c) && !SLOPES.has(c)
  }
  /** A spot the player can be standing in: floor below, two tiles of headroom. */
  canStand(x: number, y: number): boolean {
    if (x < 0 || x >= this.w || y < 1 || y >= this.h) return false
    if (!this.standable(x, y + 1)) return false
    for (let i = 0; i < REACH.headroom; i++) if (!this.free(x, y - i)) return false
    return true
  }
}

export function validateLevel(def: LevelDef): Issue[] {
  const out: Issue[] = []
  const err = (message: string, tx?: number, ty?: number) =>
    out.push({ level: def.id, severity: 'error', message, tx, ty })
  const warn = (message: string, tx?: number, ty?: number) =>
    out.push({ level: def.id, severity: 'warn', message, tx, ty })

  // ── 1. The grid is rectangular ─────────────────────────────────────────────
  if (def.rows.length !== def.h) {
    err(`has ${def.rows.length} rows but declares h=${def.h}`)
  }
  const legal = new Set<string>(Object.values(C))
  def.rows.forEach((row, y) => {
    if (row.length !== def.w) err(`row ${y} is ${row.length} chars, expected w=${def.w}`, 0, y)
    for (let x = 0; x < row.length; x++) {
      if (!legal.has(row[x])) err(`unknown tile character "${row[x]}"`, x, y)
    }
  })
  if (def.w < 200 || def.w > 320) warn(`width ${def.w} is outside the 200–320 house range`)
  if (def.h < 20 || def.h > 32) warn(`height ${def.h} is outside the 20–32 house range`)

  const g = new Grid(def)

  // ── 2. Slopes ──────────────────────────────────────────────────────────────
  for (let y = 0; y < def.h; y++) {
    for (let x = 0; x < def.w; x++) {
      const c = g.at(x, y)
      if (!SLOPES.has(c)) continue
      // The bug this file was written for: a diagonal of slope tiles with open
      // sky beneath them.
      if (!g.solid(x, y + 1) && y + 1 < def.h) {
        err('slope tile with nothing under it — it hangs in mid-air', x, y)
      }
      if (c === C.slopeUp) {
        err('ascending slope: the collision resolver cannot walk one, use steps', x, y)
      }
    }
  }

  // ── 3. Ladders ─────────────────────────────────────────────────────────────
  for (let x = 0; x < def.w; x++) {
    let y = 0
    while (y < def.h) {
      if (g.at(x, y) !== C.climb) { y++; continue }
      let top = y
      while (y < def.h && g.at(x, y) === C.climb) y++
      const bottom = y - 1
      // Getting on: ground under the foot of the ladder, or a standable tile
      // beside it within a tile.
      const mount =
        g.standable(x, bottom + 1) ||
        g.canStand(x - 1, bottom) || g.canStand(x + 1, bottom) ||
        g.canStand(x - 1, bottom + 1) || g.canStand(x + 1, bottom + 1)
      if (!mount) {
        err('ladder foot reaches nothing the player can stand on', x, bottom)
      }
      // Getting off: a deck within the run, reachable by stepping sideways.
      let deck = false
      for (let r = top; r <= bottom && !deck; r++) {
        if (g.canStand(x - 1, r) || g.canStand(x + 1, r) || STANDABLE.has(g.at(x, r + 1))) deck = true
      }
      if (!deck) err('ladder serves no deck — it is rope hanging in the sky', x, top)
      if (bottom - top < 2) warn('ladder shorter than three tiles is not worth climbing', x, top)
    }
  }

  // ── 4. Spawns ──────────────────────────────────────────────────────────────
  const counts = new Map<string, number>()
  const fragIndices: number[] = []
  for (const s of def.spawns) {
    counts.set(s.type, (counts.get(s.type) ?? 0) + 1)
    if (REQUESTED_TYPES.has(s.type)) {
      warn(`spawn type "${s.type}" is not registered yet — the stage plays without it`, s.tx, s.ty)
    } else if (!KNOWN_TYPES.has(s.type)) {
      err(`spawn type "${s.type}" is not registered — it will silently vanish`, s.tx, s.ty)
    }
    if (s.tx < 0 || s.tx >= def.w || s.ty < 0 || s.ty >= def.h) {
      err(`spawn "${s.type}" is outside the map`, s.tx, s.ty)
      continue
    }
    if (SOLIDISH.has(g.at(s.tx, s.ty))) {
      err(`spawn "${s.type}" is buried inside a solid tile`, s.tx, s.ty)
    }
    if (GROUNDED_TYPES.has(s.type) && !g.standable(s.tx, s.ty + 1)) {
      err(`spawn "${s.type}" has no floor under it`, s.tx, s.ty)
    }
    if (s.type === 'fragment') fragIndices.push(Number(s.opts?.index ?? 0))
  }

  if ((counts.get('goal') ?? 0) !== 1) err(`level needs exactly one goal, found ${counts.get('goal') ?? 0}`)
  if ((counts.get('checkpoint') ?? 0) < 1) err('level has no checkpoint')
  if (fragIndices.length !== 3) err(`level needs three Poneglyph fragments, found ${fragIndices.length}`)
  else if (new Set(fragIndices).size !== 3 || fragIndices.some((i) => i < 0 || i > 2)) {
    err(`fragment indices must be 0, 1 and 2 — found ${fragIndices.join(', ')}`)
  }

  // ── 5. The player start ────────────────────────────────────────────────────
  if (!g.canStand(def.startX, def.startY)) {
    err('the player start is not a spot the player can stand in', def.startX, def.startY)
  }

  // ── 6. Pits ────────────────────────────────────────────────────────────────
  // A pit is only fair if it is obviously a pit: it has to fall out of the
  // world, or the player lands in a dead end they cannot climb out of.
  const surfaceOf = (x: number): number => {
    for (let y = 0; y < def.h; y++) if (g.standable(x, y)) return y
    return def.h
  }
  // A gap wider than a jump is fine when something crosses it for you.
  const ferried = (x0: number, x1: number): boolean =>
    def.spawns.some((s) => {
      if (s.type !== 'platform') return false
      const reach = Number(s.opts?.spanX ?? 48) / 16 + Number(s.opts?.width ?? 40) / 32
      return s.tx + reach >= x0 - 1 && s.tx - reach <= x1 + 1
    })
  let run = 0
  for (let x = 0; x <= def.w; x++) {
    const bottomless = x < def.w && surfaceOf(x) >= def.h
    if (bottomless) { run++; continue }
    if (run > 0) {
      if (ferried(x - run, x - 1)) {
        // Crossed by a moving platform — the pit is the point.
      } else if (run > REACH.gapMax) {
        err(`a ${run}-tile bottomless gap cannot be cleared (max ${REACH.gapMax})`, x - run, 0)
      } else if (run > REACH.gap) {
        warn(`a ${run}-tile gap is at the limit of the shortest jump`, x - run, 0)
      }
      run = 0
    }
  }

  // ── 7. Reachability ────────────────────────────────────────────────────────
  out.push(...reachability(def, g))

  // ── 8. Sealed pockets ──────────────────────────────────────────────────────
  out.push(...sealed(def, g))

  return out
}

/**
 * Pickups walled off from the rest of the map.
 *
 * Section 7 is generous on purpose, and its generosity has a blind spot: it
 * steps from one standing spot to another within a jump's reach without asking
 * whether anything stands between them. A pocket at street level, sealed by a
 * pier at each end, is a jump of five tiles from the pavement — so it read as
 * reachable, and two Poneglyph fragments sat inside walls nobody could pass.
 *
 * This is the opposite kind of test: no jumps, no reach, just whether the
 * item's tile is connected to the start at all by tiles a body could occupy.
 * It is a lower bound and it cannot cry wolf — bricks and crumbling blocks
 * count as open because they break, slopes count as open because half of one
 * is air, and everything else that is flagged is genuinely bricked in.
 */
function sealed(def: LevelDef, g: Grid): Issue[] {
  // Only tiles nothing can get through. Breakables and slopes stay open, so a
  // flag here is never a matter of opinion.
  const shut = (x: number, y: number): boolean => {
    const c = g.at(x, y)
    return c === C.solid || c === C.question || c === C.used || c === C.ice || c === C.bouncy
  }
  const seen = new Uint8Array(def.w * def.h)
  const key = (x: number, y: number) => y * def.w + x
  const queue: number[] = [key(def.startX, def.startY)]
  while (queue.length) {
    const k = queue.pop() as number
    const x = k % def.w
    const y = Math.floor(k / def.w)
    if (x < 0 || x >= def.w || y < 0 || y >= def.h) continue
    if (seen[k] || shut(x, y)) continue
    seen[k] = 1
    queue.push(key(x + 1, y), key(x - 1, y), key(x, y + 1), key(x, y - 1))
  }

  const out: Issue[] = []
  for (const s of def.spawns) {
    if (!PICKUPS.has(s.type)) continue
    if (seen[key(s.tx, s.ty)]) continue
    out.push({
      level: def.id,
      severity: 'error',
      tx: s.tx,
      ty: s.ty,
      message: `${s.type} is walled in — no route from the start reaches its tile`,
    })
  }
  return out
}

/** Things the player is meant to be able to touch. */
const PICKUPS = new Set(['berry', 'meat', 'fruit', 'fragment', 'oneup', 'checkpoint', 'goal'])

/**
 * A deliberately generous flood over standable spots.
 *
 * It models a jump as "up to three tiles up and six across, or any distance
 * down", ignores whether the arc actually clears an overhang, and treats water
 * as swimmable — because a false alarm costs an author more than a missed one
 * costs a player. What it does catch is the thing worth catching: a platform,
 * a fragment or a goal in a pocket of the map with no way in at all.
 */
function reachability(def: LevelDef, g: Grid): Issue[] {
  const out: Issue[] = []
  const key = (x: number, y: number) => y * def.w + x
  const seen = new Uint8Array(def.w * def.h)
  const queue: number[] = []

  const push = (x: number, y: number) => {
    if (x < 0 || x >= def.w || y < 0 || y >= def.h) return
    if (!g.canStand(x, y) && !isSwim(g, x, y)) return
    const k = key(x, y)
    if (seen[k]) return
    seen[k] = 1
    queue.push(k)
  }

  // Moving platforms bridge gaps the tile grid knows nothing about: seed both
  // ends of every patrol as standable ground.
  const bridges: Array<[number, number]> = []
  for (const s of def.spawns) {
    if (s.type !== 'platform') continue
    const spanX = Number(s.opts?.spanX ?? 48) / 16
    const spanY = Number(s.opts?.spanY ?? 0) / 16
    bridges.push([Math.round(s.tx - spanX), Math.round(s.ty - spanY)])
    bridges.push([Math.round(s.tx + spanX), Math.round(s.ty + spanY)])
  }
  const bridgeAt = (x: number, y: number) =>
    bridges.some(([bx, by]) => Math.abs(bx - x) <= 1 && Math.abs(by - y) <= 1)

  push(def.startX, def.startY)
  for (const [bx, by] of bridges) {
    // A platform's ends are standing room even over a pit.
    if (bx >= 0 && bx < def.w && by >= 0 && by < def.h && !seen[key(bx, by)]) {
      seen[key(bx, by)] = 1
      queue.push(key(bx, by))
    }
  }

  while (queue.length) {
    const k = queue.pop() as number
    const x = k % def.w
    const y = Math.floor(k / def.w)
    // A bouncy tile underfoot throws the player about six tiles up, so a hop
    // that is impossible from rock is routine from a cloud.
    const sprung = g.at(x, y + 1) === C.bouncy
    const rise = sprung ? 6 : REACH.stepUp
    for (let dx = -REACH.gapMax - 1; dx <= REACH.gapMax + 1; dx++) {
      for (let dy = -rise; dy <= 22; dy++) {
        if (dx === 0 && dy === 0) continue
        // Rising costs reach; falling is free.
        if (dy < 0 && Math.abs(dx) > (sprung ? REACH.gapMax + 1 : REACH.gap)) continue
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || nx >= def.w || ny < 0 || ny >= def.h) continue
        if (g.canStand(nx, ny) || isSwim(g, nx, ny) || bridgeAt(nx, ny)) push(nx, ny)
      }
    }
    // Ladders are their own transport: from anywhere on a climbable column,
    // any standing spot within a tile of that column is one move away. The
    // sideways tile matters — the spot beside a ladder's deck is a row above
    // the deck, not level with it.
    for (const col of [x - 1, x, x + 1]) {
      if (g.at(col, y) !== C.climb && g.at(col, y + 1) !== C.climb) continue
      for (let ny = 0; ny < def.h; ny++) {
        if (g.at(col, ny) !== C.climb) continue
        for (const dx of [-1, 0, 1]) {
          push(col + dx, ny)
          push(col + dx, ny - 1)
        }
      }
    }
  }

  const unreachable = (x: number, y: number): boolean => {
    // An item hangs in the air; the player reaches it from anywhere within a
    // jump of it — including the top of a bounce, which is why the probe
    // reaches well below the item as well as around it.
    for (let dy = -2; dy <= 7; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || nx >= def.w || ny < 0 || ny >= def.h) continue
        if (seen[key(nx, ny)]) return false
      }
    }
    return true
  }

  for (const s of def.spawns) {
    if (s.type !== 'goal' && s.type !== 'checkpoint' && s.type !== 'fragment') continue
    if (unreachable(s.tx, s.ty)) {
      out.push({
        level: def.id, severity: s.type === 'fragment' ? 'warn' : 'error',
        tx: s.tx, ty: s.ty,
        message: `"${s.type}" looks unreachable from the start`,
      })
    }
  }
  return out
}

const isSwim = (g: Grid, x: number, y: number): boolean => g.at(x, y) === C.water

/** Every issue across the campaign, most severe first. */
export function validateAll(levels: LevelDef[]): Issue[] {
  const all = levels.flatMap(validateLevel)
  return all.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1))
}

export function formatIssue(i: Issue): string {
  const where = i.tx !== undefined ? ` @ (${i.tx}, ${i.ty})` : ''
  return `${i.severity === 'error' ? 'ERROR' : 'warn '} ${i.level}${where}: ${i.message}`
}

/** Types are re-exported so scripts can lint spawn lists without the registry. */
export type { SpawnDef }
