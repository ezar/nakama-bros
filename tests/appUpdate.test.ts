import { describe, expect, it } from 'vitest'
import { offerable } from '../src/ui/hooks/useAppUpdate'

/**
 * When the game may say there is a new version.
 *
 * The rule that will go wrong is the first-install one. A worker installing for
 * the very first time passes through exactly the same `installed` state an
 * update does, so anything that watches state alone greets a player opening the
 * game for the first time with news about the build they just downloaded. The
 * page that registered that worker was loaded before any worker existed, so it
 * has no controller — that, and nothing about the worker, is what separates the
 * two cases.
 */
describe('offering a waiting build', () => {
  const base = { waiting: true, controlled: true, dismissed: false, hold: false }

  it('offers a build that is installed and waiting', () => {
    expect(offerable(base)).toBe(true)
  })

  it('says nothing on a first install, where there is no older build to replace', () => {
    expect(offerable({ ...base, controlled: false })).toBe(false)
  })

  it('says nothing until something is actually waiting', () => {
    expect(offerable({ ...base, waiting: false })).toBe(false)
  })

  /*
    Neither of these drops the build — the worker stays installed and waiting
    either way. The only question they answer is whether now is the moment.
  */
  it('holds off anywhere but the title — a stage above all, where a reload costs the run', () => {
    expect(offerable({ ...base, hold: true })).toBe(false)
  })

  it('holds off once for the session after "not now"', () => {
    expect(offerable({ ...base, dismissed: true })).toBe(false)
  })
})
