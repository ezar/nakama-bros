import { describe, expect, it } from 'vitest'
import { DIFFICULTIES, DIFFICULTY, PHYS, SCORE, TIER_ORDER } from '../src/game/config'
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
    expect(DIFFICULTY.normal).toEqual({
      lives: 3, startTier: 'base', invuln: 1, time: 1,
      enemySpeed: 1, enemyTiming: 1, bossHealth: 1,
    })
  })

  it('only makes the opposition softer on Fácil', () => {
    // Difícil already takes lives, clock and mercy away. Making the enemies
    // meaner on top of that was never asked for, and it would quietly change
    // fights that people have already learned.
    expect(DIFFICULTY.hard.enemySpeed).toBe(DIFFICULTY.normal.enemySpeed)
    expect(DIFFICULTY.hard.enemyTiming).toBe(DIFFICULTY.normal.enemyTiming)
    expect(DIFFICULTY.hard.bossHealth).toBe(DIFFICULTY.normal.bossHealth)

    expect(DIFFICULTY.easy.enemySpeed).toBeLessThan(1)
    expect(DIFFICULTY.easy.enemyTiming).toBeGreaterThan(1)
    expect(DIFFICULTY.easy.bossHealth).toBeLessThan(1)
  })

  it('keeps Fácil a slower read of the same fight, not a broken one', () => {
    // A boss that dies before its second act never shows the player what the
    // fight was, and an enemy that has stopped moving is scenery. Both floors
    // matter more than the exact numbers above them.
    expect(DIFFICULTY.easy.bossHealth).toBeGreaterThanOrEqual(0.6)
    expect(DIFFICULTY.easy.enemySpeed).toBeGreaterThanOrEqual(0.7)
    expect(DIFFICULTY.easy.enemyTiming).toBeLessThanOrEqual(1.6)
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
      expect(DIFFICULTY[d].enemyTiming).toBeGreaterThan(0)
      expect(DIFFICULTY[d].bossHealth).toBeGreaterThan(0)
      // Zero would freeze every walker in the game where it stands.
      expect(DIFFICULTY[d].enemySpeed).toBeGreaterThan(0)
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

/**
 * The stomp chain.
 *
 * The multiplier table has been quietly doubling scores since it was written;
 * what it never had was a guard. These are the properties the HUD readout and
 * the rising stomp pitch both assume.
 */
describe('stomp chain', () => {
  it('starts at no bonus and only ever climbs', () => {
    expect(SCORE.chain[0]).toBe(1)
    for (let i = 1; i < SCORE.chain.length; i++) {
      expect(SCORE.chain[i], `link ${i}`).toBeGreaterThan(SCORE.chain[i - 1])
    }
  })

  it('has a last link, so a long chain cannot run off the end of the table', () => {
    // `defeat` clamps with `SCORE.chain.length - 1`; a table of one would make
    // that clamp silently disable the whole feature.
    expect(SCORE.chain.length).toBeGreaterThan(2)
  })
})
