import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Builds only the UI review harness (`src/ui/dev/preview.html`), never the game.
 *
 *   npx vite build --config src/ui/dev/preview.vite.config.mjs
 *   # then serve dist-ui/ and open /src/ui/dev/preview.html#title
 *
 * Change `outDir` when several agents build at once — the shared `dist/` is
 * exactly what this is here to avoid touching.
 */
export default defineConfig({
  root: process.cwd(),
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist-ui',
    emptyOutDir: true,
    rollupOptions: { input: 'src/ui/dev/preview.html' },
  },
})
