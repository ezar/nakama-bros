import { describe, expect, it } from 'vitest'
import { ALL_LEVELS, WORLDS, levelById, nextLevelId } from './index'
import { formatIssue, validateLevel } from './validate'
import { LevelBuilder, C } from './builder'
import { tower } from './props'
import { decodeRows } from './tileCodec'
import { Tile } from '../../types'

/**
 * The campaign's safety net.
 *
 * Level data fails silently: a row one character short shifts every tile after
 * it, a spawn type with a typo vanishes with a console warning, a ladder a tile
 * away from its tower is rope hanging in the sky. None of that throws, so none
 * of it is caught by anything except a check that runs over the shipped data.
 */

describe('campaign', () => {
  it('has fourteen stages across six islands', () => {
    expect(WORLDS).toHaveLength(6)
    expect(ALL_LEVELS).toHaveLength(14)
  })

  it('gives every stage a unique id and a Spanish name', () => {
    const ids = ALL_LEVELS.map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const l of ALL_LEVELS) expect(l.name.trim().length).toBeGreaterThan(3)
  })

  it('chains the stages in order', () => {
    for (let i = 0; i < ALL_LEVELS.length - 1; i++) {
      expect(nextLevelId(ALL_LEVELS[i].id)).toBe(ALL_LEVELS[i + 1].id)
    }
    expect(nextLevelId(ALL_LEVELS[ALL_LEVELS.length - 1].id)).toBeNull()
    expect(levelById('east-blue-1')?.id).toBe('east-blue-1')
  })

  it('varies biome, weather and time of day across the run', () => {
    expect(new Set(ALL_LEVELS.map((l) => l.biome)).size).toBe(6)
    expect(new Set(ALL_LEVELS.map((l) => l.weather)).size).toBeGreaterThanOrEqual(4)
    expect(new Set(ALL_LEVELS.map((l) => l.timeOfDay)).size).toBeGreaterThanOrEqual(10)
  })
})

describe.each(ALL_LEVELS.map((l) => [l.id, l] as const))('%s', (_id, level) => {
  it('is a rectangle of exactly w x h characters', () => {
    expect(level.rows).toHaveLength(level.h)
    for (const row of level.rows) expect(row).toHaveLength(level.w)
  })

  it('decodes to the tile count it declares', () => {
    expect(decodeRows(level.rows, level.w, level.h)).toHaveLength(level.w * level.h)
  })

  it('passes every structural check', () => {
    const errors = validateLevel(level).filter((i) => i.severity === 'error')
    expect(errors.map(formatIssue)).toEqual([])
  })
})

describe('LevelBuilder', () => {
  it('cannot produce a ragged grid, however far a call overruns', () => {
    const b = new LevelBuilder(20, 8)
    b.ground(-40, 400, 6)
    b.rect(-5, -5, 500, 500, C.solid)
    const rows = b.rows()
    expect(rows).toHaveLength(8)
    for (const row of rows) expect(row).toHaveLength(20)
  })

  it('brings a ramp down to the ground with it', () => {
    // The floating-slope bug: a diagonal of slope tiles over open sky.
    const b = new LevelBuilder(16, 10)
    b.ground(0, 5, 4)
    const landed = b.descend(6, 4, 3)
    expect(landed).toBe(7)
    for (let i = 0; i < 3; i++) {
      expect(b.get(6 + i, 4 + i)).toBe(C.slopeDown)
      // Every tile under the diagonal, all the way to the bottom edge.
      for (let y = 5 + i; y < 10; y++) expect(b.get(6 + i, y)).toBe(C.solid)
    }
  })

  it('never lays an ascending ramp, which the collision resolver cannot walk', () => {
    for (const level of ALL_LEVELS) {
      const data = decodeRows(level.rows, level.w, level.h)
      expect(data.includes(Tile.SlopeUp45)).toBe(false)
    }
  })

  it('gives a pool a bed, so the player cannot sink out of the world', () => {
    const b = new LevelBuilder(10, 8)
    b.water(2, 6, 3, 6)
    expect(b.get(4, 3)).toBe(C.water)
    expect(b.get(4, 5)).toBe(C.water)
    expect(b.get(4, 6)).toBe(C.solid)
    expect(b.get(4, 7)).toBe(C.solid)
  })

  it('stands a ladder two tiles proud of the deck it serves', () => {
    const b = new LevelBuilder(10, 12)
    b.ground(0, 9, 10)
    b.ledge(3, 8, 5)
    b.ladder(4, 5, 9)
    expect(b.get(4, 3)).toBe(C.climb)
    expect(b.get(4, 5)).toBe(C.climb) // through the deck, not stopped by it
    expect(b.get(4, 9)).toBe(C.climb)
    expect(validateLevel({
      ...ALL_LEVELS[0], w: 10, h: 12, rows: b.rows(), spawns: [], startX: 1, startY: 9,
    }).filter((i) => i.message.includes('ladder'))).toEqual([])
  })

  it('leaves a doorway under a tower, so its ladder can be walked to', () => {
    const b = new LevelBuilder(20, 20)
    b.ground(0, 19, 16)
    const t = tower(b, 6, 10, 16, 6)
    // Two clear rows between the piers and the floor: the street runs through
    // the tower. Sealed piers put the ladder behind a wall, which is how every
    // tower in the campaign shipped once.
    for (const x of [6, 10]) {
      expect(b.get(x, 15)).toBe(C.air)
      expect(b.get(x, 14)).toBe(C.air)
      expect(b.get(x, 13)).toBe(C.solid)
    }
    // And the ladder still reaches the ground it is now approachable from.
    expect(b.get(t.ladder, 15)).toBe(C.climb)
    expect(b.get(t.ladder, t.deck)).toBe(C.climb)
  })

  it('places a floor-standing spawn on the floor it finds', () => {
    const b = new LevelBuilder(10, 10)
    b.ground(0, 9, 7)
    b.ground(4, 6, 4)
    b.onGround('grunt', 5)
    expect(b.spawns()[0]).toEqual({ type: 'grunt', tx: 5, ty: 3 })
  })
})
