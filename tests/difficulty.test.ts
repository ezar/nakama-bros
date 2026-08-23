import { describe, expect, it } from 'vitest'
import { DIFFICULTIES, DIFFICULTY, PHYS, TIER_ORDER } from '../src/game/config'
import { TRANSLATIONS } from '../src/i18n/translations'

/**
 * Difficulty is a promise about what the player is *given*, not about how the
 * character *handles*. A child on Fácil and a parent on Difícil have to be
 * playing the same game with the same jump, or neither can take the controller
 * off the other mid-stage. These tests hold that line.
 */
describe('difficulty', () => {
  it('changes nothing that PHYS owns', () => {
    // The handling model is one table and difficulty is another, and they are
    // not allowed to share a field: the moment a row here is named `runSpeed`
    // or `gravity`, muscle memory stops transferring between the settings.
    for (const key of Object.keys(DIFFICULTY.normal)) {
      expect(key in PHYS, `difficulty must not own PHYS.${key}`).toBe(false)
    }
  })

  it('leaves Normal as the neutral setting', () => {
    expect(DIFFICULTY.normal).toEqual({ lives: 3, startTier: 'base', invuln: 1, time: 1 })
  })

  it('gets harder in every dimension at once', () => {
    const [easy, normal, hard] = DIFFICULTIES.map((d) => DIFFICULTY[d])
    for (const field of ['lives', 'invuln', 'time'] as const) {
      expect(easy[field], `easy ${field}`).toBeGreaterThan(normal[field])
      expect(normal[field], `normal ${field}`).toBeGreaterThan(hard[field])
    }
  })

  it('gives Fácil a hit to spare and Difícil none', () => {
    // A hit drops a tier before it kills, so starting above base *is* the extra
    // hit — it is not decoration.
    expect(TIER_ORDER.indexOf(DIFFICULTY.easy.startTier)).toBeGreaterThan(0)
    expect(DIFFICULTY.hard.startTier).toBe('base')
    expect(DIFFICULTY.hard.lives).toBe(1)
  })

  it('never hands out a run that cannot start', () => {
    for (const d of DIFFICULTIES) {
      expect(DIFFICULTY[d].lives).toBeGreaterThanOrEqual(1)
      expect(DIFFICULTY[d].time).toBeGreaterThan(0)
      expect(DIFFICULTY[d].invuln).toBeGreaterThan(0)
    }
  })

  it('is named in both languages, every setting', () => {
    for (const lang of ['es', 'en'] as const) {
      for (const d of DIFFICULTIES) {
        expect(TRANSLATIONS[lang][`difficulty.${d}`]?.length ?? 0).toBeGreaterThan(2)
        expect(TRANSLATIONS[lang][`difficulty.note.${d}`]?.length ?? 0).toBeGreaterThan(10)
      }
      expect(TRANSLATIONS[lang]['options.difficulty']?.length ?? 0).toBeGreaterThan(2)
    }
  })
})
