import type { SpawnDef } from '../../types'

/**
 * The level authoring toolkit.
 *
 * Levels are shipped as ASCII grids because that is diffable and hand-editable,
 * but hand-typing them is how a level silently corrupts: one row a character
 * short shifts every tile after it, and a slope typed as a bare diagonal hangs
 * in mid-air with nothing under it. So the ASCII is *built*, not typed. Every
 * helper here writes into a fixed-size grid, which makes a ragged row
 * impossible, and the shape helpers carry their own invariants — a ramp always
 * brings its mass down to the ground with it, a ladder always ends on a deck.
 *
 * The grid is addressed in tiles with y growing downward, matching the rows the
 * codec reads.
 */

/** Tile characters, named. Mirrors `CHAR_TO_TILE` in `tileCodec.ts`. */
export const C = {
  air: '.',
  solid: '#',
  oneWay: '-',
  brick: 'B',
  question: '?',
  used: 'U',
  spike: '^',
  water: '~',
  /** Falls left→right. The only slope direction this engine can walk (see below). */
  slopeDown: '\\',
  slopeUp: '/',
  /** Non-colliding fill that still renders as terrain — hill interiors, backdrops. */
  decor: ':',
  ice: 'I',
  bouncy: 'O',
  crumble: 'C',
  climb: 'H',
} as const

export type Ch = (typeof C)[keyof typeof C]

/**
 * Movement envelope, in tiles, of the *weakest* crew member (Usopp: 146 px/s,
 * 3.2 tiles of jump). Every gap and every step is authored against this, not
 * against Luffy, so no stage is character-locked.
 */
export const REACH = {
  /** Highest ledge a standing jump can pull the player onto. */
  stepUp: 3,
  /** Comfortable gap. */
  gap: 5,
  /** Absolute maximum gap, only with a clear run-up and a visible landing. */
  gapMax: 6,
  /** Tiles of headroom a standable spot needs. */
  headroom: 2,
} as const

export class LevelBuilder {
  readonly w: number
  readonly h: number
  private cells: string[]
  private spawnList: SpawnDef[] = []

  constructor(w: number, h: number, fill: string = C.air) {
    this.w = w
    this.h = h
    this.cells = new Array<string>(w * h).fill(fill)
  }

  // ── Raw access ─────────────────────────────────────────────────────────────

  inside(x: number, y: number): boolean {
    return x >= 0 && x < this.w && y >= 0 && y < this.h
  }

  set(x: number, y: number, ch: string): this {
    if (this.inside(x, y)) this.cells[y * this.w + x] = ch
    return this
  }

  get(x: number, y: number): string {
    return this.inside(x, y) ? this.cells[y * this.w + x] : C.air
  }

  /** Inclusive rectangle. Clamped, so an over-long run cannot corrupt a row. */
  rect(x0: number, y0: number, x1: number, y1: number, ch: string): this {
    for (let y = Math.max(0, y0); y <= Math.min(this.h - 1, y1); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(this.w - 1, x1); x++) {
        this.cells[y * this.w + x] = ch
      }
    }
    return this
  }

  hline(x0: number, x1: number, y: number, ch: string): this {
    return this.rect(x0, y, x1, y, ch)
  }

  vline(x: number, y0: number, y1: number, ch: string): this {
    return this.rect(x, y0, x, y1, ch)
  }

  // ── Terrain ────────────────────────────────────────────────────────────────

  /**
   * Solid ground from `top` all the way to the bottom of the map.
   *
   * Ground is never a floating slab: it is a column of rock that reaches the
   * bottom edge, so the skyline the player reads is the only surface there is.
   */
  ground(x0: number, x1: number, top: number): this {
    return this.rect(x0, top, x1, this.h - 1, C.solid)
  }

  /**
   * A run of ground whose skyline steps between heights.
   *
   * Each segment is `[length, topRow]`. Where the next segment is lower, a 45°
   * descent is cut into the joint instead of a cliff, because a coastline that
   * only ever steps down in square metres reads as a staircase. Where it is
   * higher the joint stays square — that is a wall you jump, which is the only
   * way up this engine has. Returns the first column after the run.
   */
  terrain(x0: number, segments: Array<[number, number]>, ramps = true): number {
    let x = x0
    for (let i = 0; i < segments.length; i++) {
      const [len, top] = segments[i]
      const next = segments[i + 1]
      const drop = next ? next[1] - top : 0
      const ramped = ramps && next && drop > 0 && drop <= 3 ? drop : 0
      this.ground(x, x + len - 1 - ramped, top)
      if (ramped) this.descend(x + len - ramped, top, ramped)
      x += len
    }
    return x
  }

  /** Punch a bottomless pit through the ground — falling out of the map kills. */
  pit(x0: number, x1: number, from = 0): this {
    return this.rect(x0, from, x1, this.h - 1, C.air)
  }

  /** A free-standing mass of rock: a plinth, a pillar, a crate stack. */
  block(x0: number, y0: number, x1: number, y1: number, ch: string = C.solid): this {
    return this.rect(x0, y0, x1, y1, ch)
  }

  /** A one-way platform run — jumpable through from below, landable from above. */
  ledge(x0: number, x1: number, y: number): this {
    return this.hline(x0, x1, y, C.oneWay)
  }

  /**
   * A 45° descent of `n` tiles running right from (x, top), with the mass under
   * it filled down to the map floor.
   *
   * Only descents. The collision resolver probes the body's leading edge one
   * tile ahead while the slope resolver reads the tile under the body's centre,
   * so a body walking *up* a ramp is stopped by the fill under the next slope
   * tile before the slope can lift it — an ascending ramp is a wall with a
   * decorative bevel. Climbing is done with steps and ladders instead. Returns
   * the ground row the ramp lands on.
   */
  descend(x: number, top: number, n: number): number {
    for (let i = 0; i < n; i++) {
      this.set(x + i, top + i, C.slopeDown)
      this.rect(x + i, top + i + 1, x + i, this.h - 1, C.solid)
    }
    return top + n
  }

  /**
   * Stepped rise: `n` one-tile steps of `run` tiles each, climbing right from a
   * ground top of `top`. A one-tile step needs a hop, which is the platformer
   * grammar for "this hill costs you something". Returns the new ground top.
   */
  stepUp(x: number, top: number, n: number, run = 2): number {
    let t = top
    for (let i = 0; i < n; i++) {
      t -= 1
      this.ground(x + i * run, x + i * run + run - 1, t)
    }
    return t
  }

  /** Spikes sitting on the surface at row `y`. */
  spikes(x0: number, x1: number, y: number): this {
    return this.hline(x0, x1, y, C.spike)
  }

  /**
   * A water volume with a bed under it.
   *
   * The bed is not optional. Water applies buoyancy and drag but no collision,
   * so a pool with an open bottom sinks the player out of the world — a death
   * with no tell at all. `bed` is the first solid row; everything from `top` to
   * just above it is swimmable.
   */
  water(x0: number, x1: number, top: number, bed = this.h - 1): this {
    this.rect(x0, top, x1, bed - 1, C.water)
    return this.rect(x0, bed, x1, this.h - 1, C.solid)
  }

  /** Erase a region without punching through the ground below it. */
  clear(x0: number, y0: number, x1: number, y1: number): this {
    return this.rect(x0, y0, x1, y1, C.air)
  }

  /**
   * A climbable column that ends on the deck it serves.
   *
   * `deckRow` is the row of the platform the ladder delivers the player to; the
   * column is drawn from two tiles above it (the player needs to clear the deck
   * before letting go) down to `bottom`, and the deck row itself is left
   * climbable so the ladder passes through it rather than stopping at a
   * ceiling. Nothing here can produce the rope-hanging-in-the-sky bug: the
   * caller names the deck, and the validator checks the deck is really there.
   */
  ladder(x: number, deckRow: number, bottom: number): this {
    this.vline(x, deckRow - 2, bottom, C.climb)
    return this
  }

  /** Bricks and question blocks, the bumpable furniture. */
  bricks(x0: number, x1: number, y: number): this {
    return this.hline(x0, x1, y, C.brick)
  }

  question(x: number, y: number): this {
    return this.set(x, y, C.question)
  }

  /** Crumbling tiles — a floor that is only there for a moment. */
  crumbles(x0: number, x1: number, y: number): this {
    return this.hline(x0, x1, y, C.crumble)
  }

  ice(x0: number, x1: number, y0: number, y1: number): this {
    return this.rect(x0, y0, x1, y1, C.ice)
  }

  bouncy(x0: number, x1: number, y: number): this {
    return this.hline(x0, x1, y, C.bouncy)
  }

  /**
   * Non-colliding terrain fill — the inside of a mountain seen in section, the
   * back wall of a room, the mass behind a doorway. It renders with the same
   * autotiling as rock but the player walks through it, so a level can have
   * depth in the tile layer without the depth becoming geometry.
   */
  decor(x0: number, y0: number, x1: number, y1: number): this {
    return this.rect(x0, y0, x1, y1, C.decor)
  }

  /**
   * Carve a doorway/window out of a mass, leaving decor behind it so the hole
   * reads as an opening into something rather than a hole into the sky.
   */
  doorway(x0: number, y0: number, x1: number, y1: number): this {
    return this.decor(x0, y0, x1, y1)
  }

  // ── Queries the shape helpers and the validator share ──────────────────────

  /** The row of the first standable surface at or below `from` in column x. */
  surfaceRow(x: number, from = 0): number {
    for (let y = Math.max(0, from); y < this.h; y++) {
      const c = this.get(x, y)
      if (c === C.solid || c === C.oneWay || c === C.brick || c === C.question ||
          c === C.used || c === C.ice || c === C.bouncy || c === C.crumble) {
        return y
      }
    }
    return this.h
  }

  // ── Entities ───────────────────────────────────────────────────────────────

  spawn(type: string, tx: number, ty: number, opts?: SpawnDef['opts']): this {
    this.spawnList.push(opts ? { type, tx, ty, opts } : { type, tx, ty })
    return this
  }

  /**
   * Place something that stands on the floor, on the floor — the spawn row is
   * looked up rather than typed, so nothing is ever buried in rock or hovering
   * a tile above the ground it is supposed to patrol.
   */
  onGround(type: string, tx: number, opts?: SpawnDef['opts'], from = 0): this {
    return this.spawn(type, tx, this.surfaceRow(tx, from) - 1, opts)
  }

  /** A line of berries, the breadcrumb trail that says "this way". */
  berryLine(x0: number, x1: number, y: number, step = 2): this {
    for (let x = x0; x <= x1; x += step) this.spawn('berry', x, y)
    return this
  }

  /**
   * Berries laid along a jump arc, which is how a platformer teaches a jump
   * without a tutorial box: the player reads the curve and copies it.
   */
  berryArc(x0: number, y0: number, span: number, rise = 3): this {
    for (let i = 0; i <= span; i++) {
      const t = span === 0 ? 0 : i / span
      const y = Math.round(y0 - rise * 4 * t * (1 - t))
      this.spawn('berry', x0 + i, y)
    }
    return this
  }

  /** Berries ringing a point — the reward for spotting something. */
  berryCluster(cx: number, cy: number): this {
    const pts = [[0, -1], [-1, 0], [1, 0], [0, 1]]
    for (const [dx, dy] of pts) this.spawn('berry', cx + dx, cy + dy)
    return this
  }

  // ── Output ─────────────────────────────────────────────────────────────────

  rows(): string[] {
    const out: string[] = []
    for (let y = 0; y < this.h; y++) {
      out.push(this.cells.slice(y * this.w, y * this.w + this.w).join(''))
    }
    return out
  }

  spawns(): SpawnDef[] {
    return this.spawnList
  }
}
