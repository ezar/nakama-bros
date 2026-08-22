import { describe, expect, it } from 'vitest'
import { CREW, CREW_IDS, SIGNATURES, WATER_AGILITY } from '../src/game/config'

/**
 * Ten characters is only interesting if picking one is a decision. These tests
 * are the balance sheet made executable: every move must pay for what it gives
 * with cooldown, recovery, or where it may be used, and no single entry may be
 * the answer to everything.
 */

const ids = CREW_IDS
const def = (id: (typeof ids)[number]) => SIGNATURES[id]
/** Full cycle: the move, the recovery it costs, and the wait before the next. */
const cycle = (id: (typeof ids)[number]) => def(id).duration + def(id).recovery + def(id).cooldown
/** Hits per second, at best. */
const rate = (id: (typeof ids)[number]) => def(id).damage / cycle(id)

describe('the roster', () => {
  it('gives all ten a signature, and no two the same verb', () => {
    expect(ids).toHaveLength(10)
    const kinds = new Set(ids.map((id) => def(id).kind))
    expect(kinds.size).toBe(10)
    for (const id of ids) {
      expect(def(id).name.length, id).toBeGreaterThan(2)
      expect(CREW[id].accent, id).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('lets every move be used somewhere', () => {
    for (const id of ids) {
      expect(def(id).ground || def(id).air, id).toBe(true)
    }
  })

  it('keeps the offensive output inside one band', () => {
    const rates = ids.map(rate).filter((r) => r > 0)
    expect(Math.max(...rates) / Math.min(...rates)).toBeLessThan(2.5)
  })
})

describe('everything is paid for', () => {
  it('charges the heaviest hit with the longest recovery', () => {
    const heaviest = [...ids].sort((a, b) => def(b).damage - def(a).damage)[0]
    const slowest = [...ids].sort((a, b) => def(b).recovery - def(a).recovery)[0]
    expect(heaviest).toBe('franky')
    expect(slowest).toBe('franky')
  })

  it('does not let the longest reach also be the quickest', () => {
    const longest = [...ids].sort((a, b) => def(b).reach - def(a).reach)[0]
    const quickest = [...ids].sort((a, b) => cycle(a) - cycle(b))[0]
    expect(longest).not.toBe(quickest)
  })

  it('gives the ranged option no damage advantage', () => {
    const shot = def('usopp')
    for (const id of ids) {
      if (id === 'usopp') continue
      expect(shot.damage, id).toBeLessThanOrEqual(def(id).damage || Infinity)
    }
    // And the character carrying it is at the bottom of the movement table.
    expect(CREW.usopp.runSpeed).toBeLessThan(CREW.nami.runSpeed)
    expect(CREW.usopp.jumpTiles).toBeLessThan(CREW.chopper.jumpTiles)
  })

  it('restricts terrain breaking to the two heavies', () => {
    const breakers = ids.filter((id) => def(id).breaksBricks)
    expect(new Set(breakers)).toEqual(new Set(['chopper', 'franky']))
    // Both pay for it by being unusable in the air.
    for (const id of breakers) expect(def(id).air, id).toBe(false)
  })

  it('gives the pure traversal moves no damage', () => {
    expect(def('nami').damage).toBe(0)
    expect(def('robin').damage).toBe(0)
    // ...and they are the only ones that cannot be used from the ground.
    expect(def('nami').ground).toBe(false)
    expect(def('robin').ground).toBe(false)
  })

  it('gives Jinbe the knockback and the sea, and nobody else both', () => {
    // `power` means knockback only for the moves that shove; for a dash it is
    // travel speed, so the comparison is restricted to the strikes.
    const shoves = ids.filter((id) => ['combo', 'haymaker', 'palm'].includes(def(id).kind))
    const strongest = [...shoves].sort((a, b) => def(b).power - def(a).power)[0]
    expect(strongest).toBe('jinbe')
    const bestSwimmer = [...ids].sort((a, b) => WATER_AGILITY[b] - WATER_AGILITY[a])[0]
    expect(bestSwimmer).toBe('jinbe')
    // He pays on land: bottom third for speed, and a slow cycle.
    const bySpeed = [...ids].sort((a, b) => CREW[b].runSpeed - CREW[a].runSpeed)
    expect(bySpeed.indexOf('jinbe')).toBeGreaterThan(5)
    expect(cycle('jinbe')).toBeGreaterThan(cycle('zoro'))
  })

  it('gives Brook the speed and the air options, and the least reach for it', () => {
    const fastest = [...ids].sort((a, b) => CREW[b].runSpeed - CREW[a].runSpeed)[0]
    expect(fastest).toBe('brook')
    expect(CREW.brook.airJumps).toBeGreaterThan(0)
    expect(def('brook').reach).toBeLessThanOrEqual(def('zoro').reach)
    expect(CREW.brook.attackTime).toBeLessThan(CREW.franky.attackTime)
  })

  it('keeps water agility a real trade rather than a free stat', () => {
    const values = ids.map((id) => WATER_AGILITY[id])
    expect(Math.min(...values)).toBeLessThan(0.85)
    expect(Math.max(...values)).toBeGreaterThan(1.4)
    // The best runner on land is not the best swimmer.
    expect(WATER_AGILITY.brook).toBeLessThan(WATER_AGILITY.jinbe)
    expect(WATER_AGILITY.luffy).toBeLessThan(1)
  })
})
