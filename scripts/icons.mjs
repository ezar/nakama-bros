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
import { PINNED, UI, fontFace, mark } from './lib/brand.mjs'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

const ONLY = process.argv.includes('--preview')

const OUT = resolve('public/icons')
const SPLASH = resolve('public/icons/splash')

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
  const horizon = h * 0.64

  // "NAKAMA BROS" measures about 7.8em in Rubik 800; cap the size by that so a
  // tall, narrow device does not run the wordmark off both edges.
  const titleSize = Math.min(min * (w > h ? 0.11 : 0.14), (w * 0.8) / 7.8)
  const markSize = titleSize * 1.36
  const top = h * 0.18
  const baseline = top + markSize + titleSize * 0.72

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <!-- The same evening SeaScene paints, so the launch image, the boot card
         in index.html, the loading screen and the title are one continuous
         view. Change one and change all four. -->
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#05101F"/>
      <stop offset="0.18" stop-color="#0F2C51"/>
      <stop offset="0.38" stop-color="#2A5877"/>
      <stop offset="0.53" stop-color="#6C8B92"/>
      <stop offset="0.6" stop-color="#C69A66"/>
      <stop offset="0.634" stop-color="#F2C480"/>
      <stop offset="0.64" stop-color="#A9C0B3"/>
    </linearGradient>
    <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#A9C0B3"/>
      <stop offset="0.26" stop-color="#3E7B8D"/>
      <stop offset="1" stop-color="${UI.seaDeep}"/>
    </linearGradient>
    <radialGradient id="haze">
      <stop offset="0" stop-color="#FFDE96" stop-opacity="0.55"/>
      <stop offset="0.26" stop-color="#F6B24A" stop-opacity="0.28"/>
      <stop offset="0.62" stop-color="#F6B24A" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="disc" cx="0.42" cy="0.38" r="0.62">
      <stop offset="0" stop-color="#FFE9AE"/>
      <stop offset="0.58" stop-color="#F5B24A"/>
      <stop offset="1" stop-color="#E2853A"/>
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
  </defs>

  <rect width="${w}" height="${h}" fill="url(#sky)"/>
  <ellipse cx="${w * 0.68}" cy="${h * 0.46}" rx="${w * 0.26}" ry="${w * 0.26}" fill="url(#haze)"/>
  <circle cx="${w * 0.68}" cy="${h * 0.605}" r="${w * 0.08}" fill="url(#disc)"/>
  <rect y="${horizon}" width="${w}" height="${h - horizon}" fill="url(#sea)"/>

  <g transform="translate(${(w - markSize) / 2} ${top}) scale(${markSize / 64})">${mark()}</g>

  <g text-anchor="middle" font-family="Rubik, system-ui, sans-serif" font-weight="800"
     font-size="${titleSize}" letter-spacing="${-titleSize * 0.012}">
    ${[0.1, 0.075, 0.05, 0.028].map((d) =>
      `<text x="${w / 2}" y="${baseline + titleSize * d}" fill="#1B0F07">NAKAMA BROS</text>`).join('')}
    <text x="${w / 2}" y="${baseline}" fill="#23130A"
          stroke="#23130A" stroke-width="${titleSize * 0.11}" stroke-linejoin="round">NAKAMA BROS</text>
    <text x="${w / 2}" y="${baseline}" fill="url(#brass)">NAKAMA BROS</text>
  </g>

  <!-- brass keel line, capped like a chart rule -->
  <g transform="translate(${w / 2} ${baseline + titleSize * 0.44})">
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

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? PINNED,
  args: ['--force-color-profile=srgb', '--hide-scrollbars'],
})
// Clearing the directory is for a full run only. In preview mode it would
// delete the thirty-four launch images the build actually ships and put back
// the one this run happens to render.
if (!ONLY) await rm(OUT, { recursive: true, force: true })
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
