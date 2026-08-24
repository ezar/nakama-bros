import { describe, expect, it } from 'vitest'
import { validateLevel } from '../src/game/level/validate'
import { ALL_LEVELS } from '../src/game/level'
import { LevelBuilder, C } from '../src/game/level/builder'
import type { LevelDef } from '../src/types'

/**
 * Fake walls.
 *
 * The tile that lies is the one tile whose mistakes are invisible: authored
 * wrong it still reads as terrain in the ASCII, still loads, still ships, and
 * the only symptom is a wall that happens not to work. So the rules that make
 * it a secret are checked, and — more to the point — the checks themselves are
 * checked, because a validator rule nobody has ever seen fire is a rule that
 * might not.
 */

/** A strip of ground with whatever the caller wants built on it. */
function stage(build: (b: LevelBuilder) => void): LevelDef {
  const b = new LevelBuilder(40, 12)
  b.ground(0, 39, 9)
  build(b)
  return {
    id: 'test', name: 'test', biome: 'east-blue', w: 40, h: 12,
    startX: 2, startY: 8, timeLimit: 100, music: 'overworld',
    weather: 'clear', timeOfDay: 0.5, rows: b.rows(), spawns: b.spawns(),
  }
}

/**
 * Only what this file is about. A bare test stage has no goal, no checkpoint
 * and no fragments, and those errors are correct — they are just not the
 * subject, and letting them through would make every assertion here about
 * something else.
 */
const errors = (def: LevelDef) =>
  validateLevel(def)
    .filter((i) => i.severity === 'error' && /fake wall/.test(i.message))
    .map((i) => i.message)

describe('fake walls', () => {
  it('accepts a secret built the intended way', () => {
    const def = stage((b) => {
      b.block(20, 6, 24, 8)
      b.secret(21, 7, 23, 8, 'left')
    })
    expect(errors(def)).toEqual([])
  })

  it('rejects a fake tile floating in open air', () => {
    // Nothing about a lone tile in the sky invites a shoulder, so nobody would
    // ever find it.
    const def = stage((b) => b.set(15, 5, C.fake))
    expect(errors(def).join(' ')).toMatch(/touches no real wall/)
  })

  it('rejects a fake tile with solid rock behind it', () => {
    // The expensive mistake: it looks right in the ASCII and opens onto nothing.
    const def = stage((b) => {
      b.block(20, 6, 24, 8)
      b.set(21, 7, C.fake)
    })
    expect(errors(def).join(' ')).toMatch(/hides nothing/)
  })

  it('carves the room out of decor, not air', () => {
    // Air would be a hole visible from across the screen — in a side-on game
    // that is not a secret, it is a window.
    const b = new LevelBuilder(40, 12)
    b.ground(0, 39, 9)
    b.block(20, 6, 24, 8)
    b.secret(21, 7, 23, 8, 'left')
    const rows = b.rows()
    expect(rows[7][22]).toBe(C.decor)
    expect(rows[7][20]).toBe(C.fake)
    expect(rows[7][24]).toBe(C.solid)
  })

  it('leaves every secret in the campaign valid', () => {
    for (const level of ALL_LEVELS) {
      const bad = validateLevel(level).filter((i) => /fake wall/.test(i.message))
      expect(bad, `${level.id}: ${bad.map((i) => i.message).join(', ')}`).toEqual([])
    }
  })

  it('actually puts secrets in the campaign', () => {
    // The rules above all pass trivially on a campaign with no secrets at all.
    const withSecrets = ALL_LEVELS.filter((l) => l.rows.some((r) => r.includes(C.fake)))
    expect(withSecrets.length).toBeGreaterThanOrEqual(4)
  })
})
