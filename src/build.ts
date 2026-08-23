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

/** `v1.0.0 · 7205aaf · 2026-08-23` — short enough for a footer. */
export const buildLabel = [`v${BUILD.version}`, BUILD.commit, BUILD.date]
  .filter(Boolean)
  .join(' · ')
