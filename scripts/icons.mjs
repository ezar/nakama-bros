/**
 * Icon and launch-image generator.
 *
 * The project ships no image assets by policy — every pixel is drawn from
 * code. That policy runs into one hard platform limit: iOS will not accept an
 * SVG for a home-screen icon and will not accept anything but a PNG, at an
 * exact device size, for a launch image. So the PNGs still come from code;
 * they are just rasterised here, ahead of time, instead of at runtime.
 *
 * Everything is composed as SVG using the shell's own palette and the same
 * Jolly Roger construction the UI draws, rendered in headless Chromium and
 * written to `public/icons/`. Re-run it whenever the mark or the palette
 * changes:
 *
 *   node scripts/icons.mjs
 */
import { chromium } from 'playwright'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ONLY = process.argv.includes('--preview')

const OUT = resolve('public/icons')
const SPLASH = resolve('public/icons/splash')

/* ── Palette ─────────────────────────────────────────────────────────────── */
// Mirrors src/ui/theme.ts. Duplicated rather than imported because this is a
// build tool running outside the bundler, and the values are a contract that
// changes about once a project.
const UI = {
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
 * Skull under a straw hat over crossed cutlasses, in a 64×64 field.
 *
 * The same construction as `JollyRoger` in src/ui/art/Icons.tsx — an original
 * drawing; skulls and straw hats are common property, these curves are ours.
 * Kept as a string so the composition below can drop it into any SVG at any
 * scale without a React runtime.
 */
function mark({ bone = UI.paperLit, ink = UI.ink, band = UI.wax, straw = UI.straw } = {}) {
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

/* ── Compositions ────────────────────────────────────────────────────────── */

/**
 * A square app icon.
 *
 * `inset` is the fraction of the tile left empty around the mark. iOS and the
 * `any` purpose crop nothing, so they get a tight framing; a maskable icon can
 * lose up to 20% off every edge, so it gets a much wider margin and the mark
 * sits dead centre of the safe circle.
 */
function iconSvg(size, { inset = 0.13, ring = true } = {}) {
  const s = size
  const box = s * (1 - inset * 2)
  const scale = box / 64
  const x = s * inset
  // The drawn mark occupies y 8..53 of its 64-box; nudge it down to centre.
  const y = s * inset + box * 0.03

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>
    <linearGradient id="field" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="#12233C"/>
      <stop offset="0.55" stop-color="${UI.deep}"/>
      <stop offset="1" stop-color="${UI.night}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.62">
      <stop offset="0" stop-color="${UI.gold}" stop-opacity="0.34"/>
      <stop offset="0.55" stop-color="${UI.wax}" stop-opacity="0.16"/>
      <stop offset="1" stop-color="${UI.night}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${s}" height="${s}" fill="url(#field)"/>
  <rect width="${s}" height="${s}" fill="url(#glow)"/>
  ${ring ? `<rect x="${s * 0.07}" y="${s * 0.07}" width="${s * 0.86}" height="${s * 0.86}"
        rx="${s * 0.17}" fill="none" stroke="${UI.brass}" stroke-width="${s * 0.016}" opacity="0.55"/>` : ''}

  <g transform="translate(${x} ${y}) scale(${scale})">${mark()}</g>
</svg>`
}

/**
 * An iOS launch image, sized to one exact device.
 *
 * iOS shows this instead of a blank window while the PWA boots, so it has to
 * read as the game's first frame rather than as a loading screen: night sea,
 * a low sun still burning under the horizon, the crew's mark above the name.
 */
function splashSvg(w, h) {
  const min = Math.min(w, h)
  const wide = w > h
  const horizon = h * 0.62
  const markSize = min * (wide ? 0.32 : 0.38)
  const mx = (w - markSize) / 2
  // The drawn mark runs to 0.83 of its box, so this stands it just clear of
  // the water rather than floating in the middle of the sky.
  const my = horizon - markSize * 0.92
  // "NAKAMA BROS" measures about 7.8em in Rubik 800; cap the size by that so
  // a tall, narrow device does not run the wordmark off both edges.
  const titleSize = Math.min(min * (wide ? 0.1 : 0.115), (w * 0.78) / 7.8)
  const baseline = horizon + markSize * (wide ? 0.42 : 0.46)

  // A deterministic scatter of stars — a real PRNG would churn all forty PNGs
  // on every re-run of this script for nothing. The sin-hash this used to
  // employ correlates badly for consecutive integers and piled the whole field
  // into one corner, so it is a plain LCG instead, seeded the same every time.
  let seed = 20260822
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
  const stars = Array.from({ length: 120 }, () => {
    const x = rnd() * w
    const t = rnd()
    const r = min * (0.0009 + (1 - t) * 0.0012)
    return `<circle cx="${x.toFixed(1)}" cy="${(t * horizon).toFixed(1)}" r="${r.toFixed(2)}"`
      + ` opacity="${(0.16 + (1 - t) * 0.62).toFixed(2)}"/>`
  }).join('')

  // A ship hull-down on the horizon, dark against the last of the sun. Small
  // on purpose: it sets the scale of the sea without competing with the mark.
  const shipH = min * 0.078
  const sx = w * (wide ? 0.78 : 0.85)

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#04070F"/>
      <stop offset="0.45" stop-color="#0A1930"/>
      <stop offset="0.85" stop-color="#22405C"/>
      <stop offset="1" stop-color="#3D5B6E"/>
    </linearGradient>
    <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${UI.seaMid}"/>
      <stop offset="0.3" stop-color="${UI.seaDeep}"/>
      <stop offset="1" stop-color="${UI.night}"/>
    </linearGradient>
    <linearGradient id="sun" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#FFE0A0" stop-opacity="0.8"/>
      <stop offset="0.22" stop-color="#E8834A" stop-opacity="0.34"/>
      <stop offset="1" stop-color="#0A1930" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="path" cx="0.5" cy="0" r="1">
      <stop offset="0" stop-color="#FFDFA4" stop-opacity="0.3"/>
      <stop offset="0.45" stop-color="#FFDFA4" stop-opacity="0.1"/>
      <stop offset="1" stop-color="#FFDFA4" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="brass" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFF3CE"/>
      <stop offset="0.4" stop-color="${UI.gold}"/>
      <stop offset="0.56" stop-color="${UI.brass}"/>
      <stop offset="1" stop-color="#8A5F1E"/>
    </linearGradient>
    <linearGradient id="keelL" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${UI.brass}" stop-opacity="0"/>
      <stop offset="1" stop-color="${UI.brass}"/>
    </linearGradient>
    <linearGradient id="keelR" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${UI.brass}"/>
      <stop offset="1" stop-color="${UI.brass}" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="vignette" cx="0.5" cy="0.5" r="0.8">
      <stop offset="0.5" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.55"/>
    </radialGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="${(min * 0.014).toFixed(1)}"/>
    </filter>
  </defs>

  <rect width="${w}" height="${horizon}" fill="url(#sky)"/>
  <g fill="#DCEDF0">${stars}</g>
  <rect y="${horizon - h * 0.34}" width="${w}" height="${h * 0.34}" fill="url(#sun)"/>

  <!-- A tall ship on the horizon, drawn before the sea so the waterline cuts
       the hull off cleanly. Long and low with one mast: at this size a
       silhouette only survives if it is mostly negative space. -->
  <g transform="translate(${sx} ${horizon}) scale(${shipH / 48})" fill="#0A1422" opacity="0.7">
    <path d="M-26 0 L 26 0 L 20 -3.6 C 7 -5.2, -9 -5.2, -20 -3.6 Z"/>
    <path d="M26 -2.4 L 36 -6.4 L 36 -5.1 L 26 -1.3 Z"/>
    <rect x="-0.6" y="-44" width="1.2" height="39"/>
    <rect x="-11.5" y="-30" width="23" height="1"/>
    <rect x="-7.5" y="-42" width="15" height="0.9"/>
    <path d="M-10 -29.2 L 10 -29.2 L 11.5 -15.5 C 4 -12.4, -4 -12.4, -11.5 -15.5 Z"/>
    <path d="M-6.5 -41 L 6.5 -41 L 7.5 -32 C 2.6 -30.2, -2.6 -30.2, -7.5 -32 Z"/>
    <path d="M0.6 -44 L 7.5 -42.3 L 0.6 -40.6 Z"/>
  </g>

  <rect y="${horizon}" width="${w}" height="${h - horizon}" fill="url(#sea)"/>

  <!-- the sun's path on the water: a soft corridor, blurred so it reads as
       light rather than as a jetty laid across the bay -->
  <g filter="url(#soft)">
    <polygon fill="url(#path)"
             points="${w / 2 - min * 0.03},${horizon} ${w / 2 + min * 0.03},${horizon}
                     ${w / 2 + w * 0.22},${h} ${w / 2 - w * 0.22},${h}"/>
  </g>

  <g transform="translate(${mx} ${my}) scale(${markSize / 64})">${mark()}</g>

  <g text-anchor="middle" font-family="Rubik, system-ui, sans-serif" font-weight="800"
     font-size="${titleSize}" letter-spacing="${-titleSize * 0.012}">
    ${[0.1, 0.075, 0.05, 0.028].map((d) =>
      `<text x="${w / 2}" y="${baseline + titleSize * d}" fill="#1B0F07">NAKAMA BROS</text>`).join('')}
    <text x="${w / 2}" y="${baseline}" fill="#23130A"
          stroke="#23130A" stroke-width="${titleSize * 0.11}" stroke-linejoin="round">NAKAMA BROS</text>
    <text x="${w / 2}" y="${baseline}" fill="url(#brass)">NAKAMA BROS</text>
  </g>

  <!-- brass keel line, capped like a chart rule -->
  <g transform="translate(${w / 2} ${baseline + titleSize * 0.68})">
    <rect x="${-titleSize * 3.4}" y="${-titleSize * 0.012}" width="${titleSize * 2.9}"
          height="${Math.max(1, titleSize * 0.024)}" fill="url(#keelL)"/>
    <rect x="${titleSize * 0.5}" y="${-titleSize * 0.012}" width="${titleSize * 2.9}"
          height="${Math.max(1, titleSize * 0.024)}" fill="url(#keelR)"/>
    <path d="M0 ${-titleSize * 0.1} L ${titleSize * 0.1} 0 L 0 ${titleSize * 0.1} L ${-titleSize * 0.1} 0 Z"
          fill="${UI.brassLit}"/>
  </g>

</svg>`
}

/* ── Device table ────────────────────────────────────────────────────────── */

/**
 * Every device that gets its own launch image, as CSS points plus DPR.
 *
 * iOS matches these by media query and shows a blank window when nothing
 * matches, so the list has to be explicit. Both orientations ship: the game
 * locks to landscape once it runs, but the launch happens in whatever
 * orientation the phone was already in.
 */
const DEVICES = [
  [320, 568, 2], [375, 667, 2], [414, 736, 3], [375, 812, 3],
  [414, 896, 2], [414, 896, 3], [390, 844, 3], [428, 926, 3],
  [393, 852, 3], [430, 932, 3], [402, 874, 3], [440, 956, 3],
  [768, 1024, 2], [810, 1080, 2], [820, 1180, 2],
  [834, 1112, 2], [834, 1194, 2], [1024, 1366, 2],
]

/* ── Web font ────────────────────────────────────────────────────────────── */

/**
 * Fetch the display face and return it as an inline `@font-face` rule.
 *
 * The launch images bake their text into pixels, so the font has to be present
 * at render time — and the headless browser here has no route to Google Fonts,
 * while Node does. Fetching it out here and handing it over as a data URI also
 * makes the render deterministic: no swap race, no silent fall back to
 * whatever sans the container happens to ship.
 */
async function fontFace(family, weight) {
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

const FONT = await fontFace('Rubik', 800)

/* ── Rasteriser ──────────────────────────────────────────────────────────── */

const page$ = async (browser, svg, w, h) => {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  await page.setContent(
    `<!doctype html><html><head><style>${FONT}
       html,body{margin:0;padding:0;background:${UI.night};overflow:hidden}svg{display:block}
     </style></head><body>${svg}</body></html>`,
    { waitUntil: 'load' },
  )
  await page.evaluate(() => document.fonts.load('800 100px Rubik').then(() => document.fonts.ready))
  const buf = await page.screenshot({ type: 'png' })
  await page.close()
  return buf
}

// Same pin the other capture scripts use: the sandbox ships one Chromium
// build, which is rarely the one the installed Playwright would fetch.
const PINNED = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? (existsSync(PINNED) ? PINNED : undefined),
  args: ['--force-color-profile=srgb', '--hide-scrollbars'],
})
await rm(OUT, { recursive: true, force: true })
await mkdir(SPLASH, { recursive: true })

// The face is inlined, but a mis-parsed data URI would still fall back
// silently — and `document.fonts.check` answers "would this render?", which is
// true even with no faces at all. Ask the font set directly.
{
  const probe = await browser.newPage()
  await probe.setContent(`<style>${FONT}</style>`, { waitUntil: 'load' })
  const status = await probe.evaluate(() =>
    document.fonts.load('800 100px Rubik').then(() => [...document.fonts].map((f) => f.status)))
  await probe.close()
  if (!status.includes('loaded')) {
    console.error(`Rubik 800 did not load (${status.join(',') || 'no faces'}) — the wordmark would`
      + ' fall back to a system sans. Aborting.')
    await browser.close()
    process.exit(1)
  }
}

const icons = [
  ['icon-180.png', 180, { inset: 0.11 }],
  ['icon-192.png', 192, { inset: 0.11 }],
  ['icon-512.png', 512, { inset: 0.11 }],
  ['icon-maskable-512.png', 512, { inset: 0.15, ring: false }],
]

for (const [name, size, opts] of icons) {
  await writeFile(`${OUT}/${name}`, await page$(browser, iconSvg(size, opts), size, size))
  console.log(`icons/${name}`)
}

const links = []
for (const [pw, ph, dpr] of ONLY ? DEVICES.slice(6, 7) : DEVICES) {
  for (const portrait of [true, false]) {
    const [cw, ch] = portrait ? [pw, ph] : [ph, pw]
    const [w, h] = [cw * dpr, ch * dpr]
    await writeFile(`${SPLASH}/splash-${w}x${h}.png`, await page$(browser, splashSvg(w, h), w, h))
    links.push(
      `    <link rel="apple-touch-startup-image" href="./icons/splash/splash-${w}x${h}.png"` +
        ` media="(device-width: ${pw}px) and (device-height: ${ph}px) and (-webkit-device-pixel-ratio: ${dpr})` +
        ` and (orientation: ${portrait ? 'portrait' : 'landscape'})" />`,
    )
  }
  console.log(`icons/splash/ ${pw}x${ph}@${dpr}x`)
}

await browser.close()

// The <link> block is long and mechanical; print it so index.html can be kept
// in sync by paste rather than by hand.
await writeFile(resolve('scripts/.startup-links.html'), links.join('\n') + '\n')
console.log(`\n${links.length} launch images. <link> block written to scripts/.startup-links.html`)
