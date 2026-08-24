import { describe, expect, it } from 'vitest'
import { verdict } from '../src/ui/screens/ResultScreen'
import { formatRunTime } from '../src/ui/theme'

/**
 * The sentence at the bottom of the poster after racing somebody.
 *
 * The whole feature exists for this line, and it is the one place where being
 * off by a hundredth is not a rounding detail: telling a child they won by
 * 0.00 seconds, or that they lost a race they actually won, is worse than not
 * saying anything.
 */
describe('who won', () => {
  it('says you won when you were faster', () => {
    expect(verdict('Luca', 41.2, 44.9)).toEqual({
      key: 'challenge.beaten', vars: { name: 'Luca', gap: '3.70s' },
    })
  })

  it('says they won when they were faster', () => {
    expect(verdict('Leyre', 50.0, 44.9)).toMatchObject({ key: 'challenge.lost' })
  })

  it('calls a dead heat a dead heat rather than a win by nothing', () => {
    expect(verdict('Luca', 41.2, 41.2).key).toBe('challenge.tied')
    expect(verdict('Luca', 41.2, 41.205).key).toBe('challenge.tied')
  })

  it('does not leave the sentence without a subject', () => {
    // A challenge can arrive unsigned — the name box is not compulsory.
    expect(verdict('', 40, 50).vars.name).toBe('?')
  })
})

describe('a time as it is written', () => {
  it('always shows hundredths, because that is often the whole margin', () => {
    expect(formatRunTime(41.2)).toBe('41.20s')
    expect(formatRunTime(9)).toBe('9.00s')
  })

  it('breaks into minutes once there are any', () => {
    expect(formatRunTime(64.28)).toBe('1:04.28')
    expect(formatRunTime(600)).toBe('10:00.00')
  })

  it('never shows a negative time', () => {
    expect(formatRunTime(-5)).toBe('0.00s')
  })
})
