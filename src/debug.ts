/**
 * Whether this build hangs its innards on `window`.
 *
 * `__NAKAMA__`, `__LEVELS__` and `__ART__` are how the capture scripts drive
 * the game: `shoot.mjs` teleports the camera, `levelshots.mjs` rotates the
 * campaign, `sheets.mjs` reads the sprite atlas back out. They are indispensable
 * to those, and they have no business in what a player downloads — a shipped
 * game should not carry a remote control for itself.
 *
 * True while developing, true for a build made with `--mode capture`, false for
 * the build that goes to Pages. Because `import.meta.env` is substituted with
 * literals before minification, the whole comparison folds to `false` there and
 * every block guarded by it is dropped rather than merely skipped.
 */
export const EXPOSE_DEBUG: boolean =
  import.meta.env.DEV || import.meta.env.MODE === 'capture'
