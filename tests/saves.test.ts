import { describe, expect, it } from 'vitest'
import { migrateProgress } from '../src/store/progressStore'
import { migrateSettings } from '../src/store/settingsStore'

/**
 * What happens when the browser hands the game a save it did not write.
 *
 * `localStorage` outlives every version of this game. It can hold a save from
 * a build that no longer exists, one edited by hand, or one left half-written
 * by a tab that died mid-write. None of that may reach the rest of the game:
 * a player has no way to recover from a game that will not draw itself except
 * by clearing site data, which also takes the drawing away.
 */
describe('reading a save', () => {
  it('takes an unversioned save from the old build as it stands', () => {
    const old = {
      crew: 'zoro',
      records: { 'east-blue-1': { cleared: true, bestScore: 4200, bestTimeLeft: 71, fragments: 2 } },
      totalBerries: 9100,
      giftEarned: true,
    }
    expect(migrateProgress(old, 0)).toEqual(old)
  })

  it('keeps a record for a stage this build has never heard of', () => {
    // Renaming a level must not throw away the rest of the save, and the chart
    // only ever looks up ids it knows, so a stale one is inert.
    const out = migrateProgress({ records: { 'sabaody-1': { cleared: true, bestScore: 1, bestTimeLeft: 1, fragments: 3 } } }, 0)
    expect(out.records?.['sabaody-1']?.cleared).toBe(true)
  })

  it('survives every shape of nonsense', () => {
    for (const junk of [null, undefined, 0, 'nope', [], { records: 'not an object' }, { records: { a: 7 } }]) {
      const out = migrateProgress(junk, 0)
      expect(out.crew).toBe('luffy')
      expect(out.totalBerries).toBe(0)
      expect(typeof out.records).toBe('object')
    }
  })

  it('refuses a crew member who does not exist', () => {
    expect(migrateProgress({ crew: 'shanks' }, 0).crew).toBe('luffy')
  })

  it('will not carry a negative purse or a fourth fragment', () => {
    const out = migrateProgress(
      { totalBerries: -50, records: { x: { cleared: true, bestScore: -1, bestTimeLeft: NaN, fragments: 9 } } },
      0,
    )
    expect(out.totalBerries).toBe(0)
    expect(out.records?.x).toEqual({ cleared: true, bestScore: 0, bestTimeLeft: 0, fragments: 3 })
  })

  it('never invents a gift that was not earned', () => {
    // The drawing is the one thing in here that is a prize. A malformed save
    // must not hand it out, and must not take it away either.
    expect(migrateProgress({ giftEarned: 'yes' }, 0).giftEarned).toBe(false)
    expect(migrateProgress({ giftEarned: true }, 0).giftEarned).toBe(true)
  })

  it('clamps volumes into a range a GainNode can use', () => {
    const out = migrateSettings({ master: 40, music: -3, sfx: NaN }, 0)
    expect(out.master).toBe(1)
    expect(out.music).toBe(0)
    expect(out.sfx).toBe(0.85)
  })

  it('falls back on any setting that is not one of the choices', () => {
    const out = migrateSettings({ lang: 'jp', difficulty: 'nightmare', effects: 'ultra', touchControls: 'maybe' }, 0)
    expect(out.lang).toBe('es')
    expect(out.difficulty).toBe('normal')
    expect(out.effects).toBe('full')
    expect(out.touchControls).toBe('auto')
  })

  it('keeps settings a player actually chose', () => {
    const chosen = { master: 0.2, music: 0, sfx: 1, lang: 'en', touchControls: 'on', effects: 'reduced', crt: true, difficulty: 'hard' }
    expect(migrateSettings(chosen, 0)).toEqual(chosen)
  })
})
