/**
 * Shared brand pieces for the build-time image generators.
 *
 * `scripts/icons.mjs` and `scripts/promo.mjs` both draw the crew's mark, both
 * need the shell's palette, and both need the display face present at render
 * time. Keeping one copy means a palette change lands on the app icon and the
 * promo art together, instead of on whichever was regenerated last.
 */

/* ── Palette ─────────────────────────────────────────────────────────────── */
// Mirrors src/ui/theme.ts. Duplicated rather than imported because these are
// build tools running outside the bundler, and the values are a contract that
// changes about once a project.
export const UI = {
  paperLit: '#F7EDD3',
  paperDim: '#DCC59A',
  ink: '#2A1D14',
  oakLit: '#6B4527',
  brass: '#C8973F',
  brassLit: '#F1D386',
  gold: '#F4C542',
  wax: '#8E2B22',
  straw: '#E3C169',
  night: '#050A14',
  deep: '#071020',
  seaDeep: '#0A2438',
  seaMid: '#255C74',
}

/* ── The mark ────────────────────────────────────────────────────────────── */

/**
 * Skull under a straw hat, in a 64×64 field, as an SVG fragment.
 *
 * The same construction as `JollyRoger` in src/ui/art/Icons.tsx, minus its
 * crossed blades — an original drawing; skulls and straw hats are common
 * property, these curves are ours. Kept as a string so a composition can drop
 * it into any SVG at any scale without a React runtime.
 *
 * The blades are left out on purpose. At icon size they either hide behind the
 * cranium and leave the pommels reading as feet, or scale out and poke over
 * the brim as horns; the hat and the skull carry it alone.
 */
export function mark({ bone = UI.paperLit, ink = UI.ink, band = UI.wax, straw = UI.straw } = {}) {
  return `
  <g>
    <path d="M32 14 C 44 14, 50 22, 50 30.5 C 50 36, 47.5 39.5, 44.5 41.5
             C 43 42.5, 42.5 44, 42.5 46 C 42.5 50.5, 38.5 53, 32 53
             C 25.5 53, 21.5 50.5, 21.5 46 C 21.5 44, 21 42.5, 19.5 41.5
             C 16.5 39.5, 14 36, 14 30.5 C 14 22, 20 14, 32 14 Z"
          fill="${bone}" stroke="${ink}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M44.5 41.5 C 43 42.5, 42.5 44, 42.5 46 C 42.5 50.5, 38.5 53, 32 53 L 32 44 Z"
          fill="${ink}" opacity="0.16"/>
    <ellipse cx="25" cy="31" rx="6.2" ry="6.8" fill="${ink}" transform="rotate(-9 25 31)"/>
    <ellipse cx="39" cy="31" rx="6.2" ry="6.8" fill="${ink}" transform="rotate(9 39 31)"/>
    <ellipse cx="26.6" cy="28.6" rx="1.7" ry="1.9" fill="${bone}" opacity="0.55"/>
    <path d="M32 36.5 L 35 42.5 L 29 42.5 Z" fill="${ink}"/>
    <g fill="${ink}">
      <rect x="26.5" y="46" width="1.5" height="6" rx="0.6"/>
      <rect x="30.2" y="46" width="1.5" height="6" rx="0.6"/>
      <rect x="33.9" y="46" width="1.5" height="6" rx="0.6"/>
      <rect x="37.6" y="46" width="1.5" height="6" rx="0.6"/>
      <rect x="23" y="45.4" width="18" height="1.5" rx="0.7"/>
    </g>

    <g stroke="${ink}" stroke-width="1.6" stroke-linejoin="round">
      <path d="M8 20.5 C 14 13.5, 50 13.5, 56 20.5 C 50 25, 14 25, 8 20.5 Z" fill="${straw}"/>
      <path d="M20 19 C 21 8.5, 43 8.5, 44 19 C 40 21.5, 24 21.5, 20 19 Z" fill="${straw}"/>
      <path d="M20.3 17.6 C 24.5 20, 39.5 20, 43.7 17.6 L 44 19 C 40 21.5, 24 21.5, 20 19 Z" fill="${band}" stroke="none"/>
    </g>
    <path d="M8.6 20.6 C 15 16.6, 49 16.6, 55.4 20.6" fill="none" stroke="${UI.paperLit}" stroke-width="0.9" opacity="0.55"/>
  </g>`
}

/* ── Web font ────────────────────────────────────────────────────────────── */

/**
 * Fetch a display face and return it as an inline `@font-face` rule.
 *
 * These generators bake their text into pixels, so the font has to be present
 * at render time — and the headless browser has no route to Google Fonts,
 * while Node does. Fetching it out here and handing it over as a data URI also
 * makes the render deterministic: no swap race, no silent fall back to
 * whatever sans the container happens to ship.
 */
export async function fontFace(family, weight) {
  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@${weight}&display=swap`,
    // Google serves woff2 only to browsers; Node's default UA gets truetype.
    { headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36' } },
  ).then((r) => r.text())

  // Several subsets come back; latin is the only one this wordmark needs.
  const blocks = css.split('@font-face').filter((b) => b.includes('unicode-range'))
  const latin = blocks.find((b) => /U\+0000-00FF/.test(b)) ?? blocks.at(-1)
  const url = latin?.match(/url\((https:[^)]+)\)/)?.[1]
  if (!url) throw new Error(`no woff2 for ${family} ${weight}`)

  const buf = Buffer.from(await fetch(url).then((r) => r.arrayBuffer()))
  return `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;` +
    `src:url(data:font/woff2;base64,${buf.toString('base64')}) format('woff2')}`
}

/** The pinned Chromium the sandbox ships; the installed Playwright wants another. */
export const PINNED = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
