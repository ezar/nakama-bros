import { describe, expect, it } from 'vitest'
import { levelLocked, stageLocked, unlockedIndex, type Flat } from '../src/ui/screens/MapScreen'
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

/**
 * The campaign exactly as it shipped before the boss stages went in: fourteen
 * stages, three islands of East Blue, no Arlong.
 *
 * Written out rather than derived. It used to be built by filtering today's
 * campaign, which quietly stopped describing anything real the moment two more
 * stages were added — the "old save" it made included stages that did not exist
 * when old saves were written, so the test passed while testing nothing. A save
 * from the past is a fact about the past; it has to be spelled out.
 */
const CAMPAIGN_14 = [
  'east-blue-1', 'east-blue-2', 'east-blue-3',
  'alabasta-1', 'alabasta-2',
  'skypiea-1', 'skypiea-2',
  'water7-1', 'water7-2',
  'thriller-bark-1', 'thriller-bark-2',
  'wano-1', 'wano-2', 'wano-3',
]

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
    // The save that made this necessary: somebody finished the whole
    // fourteen-stage campaign, and then five stages were inserted into the
    // middle of it. Every island they had beaten has to stay open, wherever
    // the gaps now fall.
    const records = cleared(...CAMPAIGN_14)
    const open = unlockedIndex(flat, records)
    for (const [i, f] of flat.entries()) {
      const wasCleared = CAMPAIGN_14.includes(f.level.id)
      expect(stageLocked(i, open, flat, records), `${f.level.id} (cleared: ${wasCleared})`)
        .toBe(!wasCleared && i > open)
    }
  })

  it('sends that save to the first stage it has never seen', () => {
    const records = cleared(...CAMPAIGN_14)
    expect(flat[unlockedIndex(flat, records)].level.id).toBe('east-blue-4')
  })

  it('still gates the stages that really are new', () => {
    const records = cleared(...CAMPAIGN_14)
    const open = unlockedIndex(flat, records)
    const at = (id: string) => flat.findIndex((f) => f.level.id === id)
    expect(stageLocked(at('east-blue-4'), open, flat, records)).toBe(false) // the open one
    for (const id of ['alabasta-3', 'skypiea-3', 'water7-3', 'thriller-bark-3']) {
      expect(stageLocked(at(id), open, flat, records), id).toBe(true)
    }
  })

  it('knows the old campaign is a subset of this one', () => {
    // If a level id is ever renamed, the list above stops describing a save
    // anybody could have had, and these tests go back to proving nothing.
    // This is the alarm for that.
    const ids = new Set(ALL_LEVELS.map((l) => l.id))
    for (const id of CAMPAIGN_14) expect(ids.has(id), `${id} no longer exists`).toBe(true)
  })
})

/**
 * The same rule, asked the way a challenge link asks it.
 *
 * A link names a stage by id and can name any stage in the game — including
 * one this save has never reached. It must get the same answer the chart gives,
 * or a link becomes a way round the campaign.
 */
describe('a challenge naming a stage', () => {
  it('agrees with the chart, stage for stage', () => {
    const records = cleared('east-blue-1', 'east-blue-2')
    const open = unlockedIndex(flat, records)
    for (const [i, f] of flat.entries()) {
      expect(levelLocked(f.level.id, records, WORLDS), f.level.id)
        .toBe(stageLocked(i, open, flat, records))
    }
  })

  it('opens the first stage on a save that has never played', () => {
    expect(levelLocked(ALL_LEVELS[0].id, {}, WORLDS)).toBe(false)
  })

  it('refuses a stage further along than the save has reached', () => {
    expect(levelLocked('wano-3', cleared('east-blue-1'), WORLDS)).toBe(true)
  })

  it('opens a stage that was already cleared, wherever it sits', () => {
    // The rule the chart learned the hard way: a finished stage is never shut
    // again, even when new stages have since been inserted in front of it.
    expect(levelLocked('wano-3', cleared('east-blue-1', 'wano-3'), WORLDS)).toBe(false)
  })

  it('refuses a stage this build has never heard of', () => {
    // A link from a later version of the game. Nothing to start, so nothing
    // is started — the challenge is still kept, it just has nowhere to go.
    expect(levelLocked('raftel-1', cleared(...ALL_LEVELS.map((l) => l.id)), WORLDS)).toBe(true)
  })
})
