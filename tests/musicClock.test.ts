import { describe, expect, it } from 'vitest'
import { LOOKAHEAD, notesDue } from '../src/audio/music'
import { barSeconds } from '../src/audio/compose'
import { TRACKS } from '../src/audio/tracks'

/**
 * The two rules that keep the sequencer from stuttering.
 *
 * Both exist because a start time in the past is not played late by the audio
 * clock — it is clamped to now. A bar that goes out even slightly behind
 * therefore arrives as a chord, which is what "the music started breaking up"
 * sounds like from the sofa.
 */
describe('the music clock', () => {
  it('drops the notes a late bar has properly missed, and keeps the rest', () => {
    const bar = [{ t: 0 }, { t: 0.25 }, { t: 0.5 }, { t: 0.75 }]
    // The bar was meant to start at 10.0 and the clock is already at 10.4.
    expect(notesDue(bar, 10, 10.4)).toEqual([{ t: 0.5 }, { t: 0.75 }])
  })

  it('keeps a bar that is still ahead of the clock whole', () => {
    const bar = [{ t: 0 }, { t: 0.5 }]
    expect(notesDue(bar, 10, 9.9)).toHaveLength(2)
  })

  it('keeps a note landing exactly on the clock', () => {
    expect(notesDue([{ t: 0 }], 10, 10)).toHaveLength(1)
  })

  /*
    The first cut refused anything at all behind the clock. Counting what it
    actually refused said that was too strict where it bites: at every throttle
    a real phone would see it refuses nothing, but at twentyfold — a device that
    cannot keep up — it threw away 28% of the music, some of it barely late. A
    note that loose is a flam; a note that is gone is a hole. So a little slop
    plays and a lot does not.
  */
  it('lets a note a hair behind the clock through rather than losing it', () => {
    expect(notesDue([{ t: 0 }], 10, 10.02)).toHaveLength(1)
  })

  it('still refuses one far enough behind to land somewhere else entirely', () => {
    expect(notesDue([{ t: 0 }], 10, 10.2)).toHaveLength(0)
  })

  /*
    The scheduler hands out a whole bar at a time, so the look-ahead is the
    window it has to hit — once per bar, on a main thread it shares with the
    game loop. Too small and an ordinary stall costs a bar. Past a whole bar and
    it runs more than one bar ahead, which would sample the intensity for a
    fight before the fight.
  */
  it('looks far enough ahead to survive a stall, and never a whole bar', () => {
    const bars = Object.values(TRACKS).map(barSeconds)
    expect(Math.min(...bars)).toBeGreaterThan(LOOKAHEAD)
    expect(LOOKAHEAD).toBeGreaterThan(0.3)
  })
})
