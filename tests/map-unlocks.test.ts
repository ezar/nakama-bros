import { describe, expect, it } from 'vitest'
import { stageLocked, unlockedIndex, type Flat } from '../src/ui/screens/MapScreen'
import type { LevelRecord } from '../src/store/progressStore'
import { ALL_LEVELS, WORLDS } from '../src/game/level'

/**
 * Which stages the chart will let you start.
 *
 * This exists because inserting stages into the middle of the campaign is a
 * thing that happens — three boss stages went in at once — and a saved game
 * made before the insert must not lose the islands it had already finished.
 */

const flat: Flat[] = WORLDS.flatMap((w, wi) =>
  w.levels.map((level, si) => ({ world: w, wi, level, si })))

const cleared = (...ids: string[]): Record<string, LevelRecord> =>
  Object.fromEntries(ids.map((id) => [id, { cleared: true, bestScore: 1, bestTimeLeft: 1, fragments: 3 }]))

describe('chart unlocks', () => {
  it('opens exactly one uncleared stage on a fresh save', () => {
    const records = {}
    expect(unlockedIndex(flat, records)).toBe(0)
    expect(stageLocked(0, 0, flat, records)).toBe(false)
    expect(stageLocked(1, 0, flat, records)).toBe(true)
  })

  it('walks the open stage forward as the campaign is cleared', () => {
    const records = cleared('east-blue-1', 'east-blue-2')
    expect(flat[unlockedIndex(flat, records)].level.id).toBe('east-blue-3')
  })

  it('never re-locks a stage that was already cleared', () => {
    // The save that made this necessary: the whole fourteen-stage campaign
    // finished, then three boss stages inserted mid-run. Every island the
    // player had beaten has to stay open, wherever the gap now falls.
    const old = ALL_LEVELS.map((l) => l.id).filter((id) => !/^(alabasta|skypiea|water7)-3$/.test(id))
    const records = cleared(...old)
    const open = unlockedIndex(flat, records)
    expect(flat[open].level.id).toBe('alabasta-3')
    for (const [i, f] of flat.entries()) {
      const wasCleared = old.includes(f.level.id)
      expect(stageLocked(i, open, flat, records), `${f.level.id} (cleared: ${wasCleared})`)
        .toBe(!wasCleared && i > open)
    }
  })

  it('still gates the stages that really are new', () => {
    const old = ALL_LEVELS.map((l) => l.id).filter((id) => !/^(alabasta|skypiea|water7)-3$/.test(id))
    const records = cleared(...old)
    const open = unlockedIndex(flat, records)
    const at = (id: string) => flat.findIndex((f) => f.level.id === id)
    expect(stageLocked(at('alabasta-3'), open, flat, records)).toBe(false) // the open one
    expect(stageLocked(at('skypiea-3'), open, flat, records)).toBe(true)
    expect(stageLocked(at('water7-3'), open, flat, records)).toBe(true)
  })
})
