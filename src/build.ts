/**
 * Which build this is.
 *
 * Read through here rather than touching the defines directly, so the UI does
 * not depend on how they get in and a test can import this without Vite.
 */
export const BUILD = {
  version: typeof __BUILD_VERSION__ === 'string' ? __BUILD_VERSION__ : '0.0.0',
  commit: typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : 'local',
  date: typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : '',
} as const

/**
 * The year, or the range, for the copyright line.
 *
 * Written by hand it goes stale the following January and nobody notices,
 * because nobody reads their own legal notice twice. The build knows what year
 * it is, so it says: one year until the project outlives it, a range after
 * that, which is the convention and not a thing anyone has to remember.
 */
const FIRST_YEAR = 2026

/** Exported for its own test: the range only appears once the year turns. */
export function copyrightRange(isoDate: string, firstYear = FIRST_YEAR): string {
  const year = Number(isoDate.slice(0, 4))
  if (!Number.isFinite(year) || year <= firstYear) return String(firstYear)
  return `${firstYear}–${year}`
}

export const copyrightYears = copyrightRange(BUILD.date)

/** `v1.0.0 · 7205aaf · 2026-08-23` — short enough for a footer. */
export const buildLabel = [`v${BUILD.version}`, BUILD.commit, BUILD.date]
  .filter(Boolean)
  .join(' · ')
