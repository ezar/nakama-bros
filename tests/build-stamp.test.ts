import { describe, expect, it } from 'vitest'
import { BUILD, buildLabel } from '../src/build'

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
