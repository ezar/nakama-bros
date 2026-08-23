import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * What build is this?
 *
 * The game installs as a PWA, and iOS will happily keep serving a cached one
 * for days — so "am I looking at the build I just deployed?" is a question that
 * actually comes up, and it cannot be answered from inside the game unless the
 * game says. The commit is the part that answers it; the version and the date
 * are there to make it readable.
 *
 * Actions sets GITHUB_SHA and checks out shallow, so ask the environment first
 * and git second. Neither being available is not a build failure — a tarball
 * with no git history should still build.
 */
function buildStamp(): { version: string; commit: string; date: string } {
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
    version?: string
  }
  let commit = process.env.GITHUB_SHA?.slice(0, 7) ?? ''
  if (!commit) {
    try {
      commit = execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim()
    } catch {
      commit = 'local'
    }
  }
  return {
    version: pkg.version ?? '0.0.0',
    commit,
    // The day is enough to tell two builds apart; a timestamp would only churn
    // the bundle hash on every rebuild of the same commit.
    date: new Date().toISOString().slice(0, 10),
  }
}

const stamp = buildStamp()

export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH ?? '/nakama-bros/',
  define: {
    __BUILD_VERSION__: JSON.stringify(stamp.version),
    __BUILD_COMMIT__: JSON.stringify(stamp.commit),
    __BUILD_DATE__: JSON.stringify(stamp.date),
  },
})
