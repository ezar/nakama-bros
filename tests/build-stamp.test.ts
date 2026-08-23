import { describe, expect, it } from 'vitest'
import { BUILD, buildLabel, copyrightRange, copyrightYears } from '../src/build'

/**
 * The stamp is only useful if it is real.
 *
 * A broken `define` in vite.config.ts does not fail the build — it leaves the
 * fallbacks in place, and the footer then reads `v0.0.0 · local` on a
 * production deploy while looking perfectly normal. That is exactly the failure
 * the stamp exists to catch, so it is worth a test of its own.
 */
describe('build stamp', () => {
  it('carries a real version, not the fallback', () => {
    expect(BUILD.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(BUILD.version).not.toBe('0.0.0')
  })

  it('carries a commit', () => {
    expect(BUILD.commit).toMatch(/^[0-9a-f]{7}$|^local$/)
  })

  it('carries an ISO date', () => {
    expect(BUILD.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('reads as one line', () => {
    expect(buildLabel).toMatch(/^v\d+\.\d+\.\d+ · \S+ · \d{4}-\d{2}-\d{2}$/)
  })
})

/**
 * The copyright year used to be typed into three files by hand, which goes
 * stale the following January and nobody notices — nobody reads their own
 * legal notice twice. It comes off the build date now, and the branch that
 * matters cannot be exercised until the year turns, so it is tested directly.
 */
describe('copyright range', () => {
  it('is a single year until the project outlives it', () => {
    expect(copyrightRange('2026-08-23')).toBe('2026')
    expect(copyrightRange('2025-01-01')).toBe('2026')
  })

  it('becomes a range once the year turns', () => {
    expect(copyrightRange('2027-01-01')).toBe('2026–2027')
    expect(copyrightRange('2031-12-31')).toBe('2026–2031')
  })

  it('falls back to the first year on a date it cannot read', () => {
    expect(copyrightRange('')).toBe('2026')
    expect(copyrightRange('not-a-date')).toBe('2026')
  })

  it('gives this build a usable value', () => {
    expect(copyrightYears).toMatch(/^2026(–\d{4})?$/)
  })
})
