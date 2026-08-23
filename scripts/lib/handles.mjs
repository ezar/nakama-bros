/**
 * Wait for one of the game's debug handles to appear on `window`.
 *
 * These only exist in a build made with `--mode capture` — the deployed bundle
 * drops them, so a player never downloads a remote control for the game. That
 * makes "the handle never showed up" overwhelmingly likely to mean the build
 * was the wrong kind, and a bare Playwright timeout says nothing about that.
 */
export async function waitForHandle(page, name, timeout = 60000) {
  try {
    await page.waitForFunction((n) => !!window[n], name, { timeout })
  } catch {
    throw new Error(
      `window.${name} never appeared.\n` +
        `The capture harnesses need a capture build:\n` +
        `  npm run build:capture           (writes dist/)\n` +
        `  npx vite build --mode capture --outDir dist-mine\n` +
        `A plain \`npm run build\` strips these handles on purpose.`,
    )
  }
}
