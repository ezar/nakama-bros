/**
 * Promotional key art.
 *
 * Boots the built game, frames a real level, lifts the crew straight out of
 * the art library, and composes the two into shareable cards. Nothing here is
 * mocked up: the backdrop is a frame the engine actually rendered and the
 * characters are the sprites the game plays with, so the art can never drift
 * from what a player sees.
 *
 *   npm run build && node scripts/promo.mjs
 *   node scripts/promo.mjs --only og        # one card, for iterating
 *
 * Writes to public/promo/. The wide card is also the page's og:image, so a
 * link to the game unfurls with it.
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { PINNED, UI, fontFace, mark } from './lib/brand.mjs'
import { waitForHandle } from './lib/handles.mjs'

const args = process.argv.slice(2)
const argOf = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt
}
const OUT = resolve(argOf('out', 'public/promo'))
const DIST = resolve(argOf('dist', 'dist'))
const PORT = Number(argOf('port', '4520'))
const ONLY = argOf('only', '').split(',').map((s) => s.trim()).filter(Boolean)

const SITE = 'ezar.github.io/nakama-bros'
const TAGLINE = 'Un plataformas pirata dibujado entero por código'

/**
 * The cards to write.
 *
 * `crew` is how many of the ten fit across without the line turning into a
 * smear; `pad` keeps the row clear of the safe-area crop social networks apply
 * to a preview.
 */
const CARDS = [
  { name: 'og', w: 1200, h: 630, crew: 6, markPx: 96, titlePx: 78 },
  { name: 'hero', w: 1920, h: 1080, crew: 10, markPx: 168, titlePx: 132 },
  { name: 'square', w: 1080, h: 1080, crew: 5, markPx: 156, titlePx: 104 },
]

/* ── Serve the build ─────────────────────────────────────────────────────── */

const BASE = '/nakama-bros/'
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
}
if (!existsSync(DIST)) {
  console.error(`${DIST} not found — run \`npm run build\` first.`)
  process.exit(1)
}
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent((req.url ?? '/').split('?')[0])
    if (p.startsWith(BASE)) p = p.slice(BASE.length - 1)
    if (p === '/' || p === '') p = '/index.html'
    const file = join(DIST, p)
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
    res.end(await readFile(file))
  } catch {
    res.writeHead(404).end('not found')
  }
})
await new Promise((r) => server.listen(PORT, r))
await mkdir(OUT, { recursive: true })

const FONT = await fontFace('Rubik', 800)
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? PINNED,
  args: ['--force-color-profile=srgb', '--disable-lcd-text', '--hide-scrollbars'],
})

/* ── Harvest the game ────────────────────────────────────────────────────── */

const game = await browser.newPage({ viewport: { width: 1440, height: 810 }, reducedMotion: 'no-preference' })
game.on('pageerror', (e) => console.error('[pageerror]', e.message))
await game.goto(`http://127.0.0.1:${PORT}${BASE}`, { waitUntil: 'networkidle' })
await game.waitForFunction(() => !!document.querySelector('button'), { timeout: 30000 })
await game.getByRole('button', { name: /zarpar|set sail|jugar|play/i }).first().click()
await waitForHandle(game, '__NAKAMA__')
await game.waitForTimeout(800)

const FRAME = argOf('frame', '124,14').split(',').map(Number)

const shootAt = async (tx, ty) => {
  await game.evaluate(([x, y]) => {
    const g = window.__NAKAMA__
    g.teleport(x * 16 + 8, y * 16 + 16)
    g.advance(30)
    // Frame the camera on the player, then take him out of the draw: he is
    // already standing in the line-up out front, and two Luffys in one poster
    // reads as a mistake rather than as a cast shot.
    if (g.playerRef) g.playerRef.active = false
    g.advance(1)
  }, [tx, ty])
  await game.waitForTimeout(320)
  const box = await game.locator('canvas').boundingBox()
  const inset = 0.075
  return game.screenshot({
    clip: {
      x: box.x + box.width * inset,
      y: box.y + box.height * inset,
      width: box.width * (1 - inset * 2),
      height: box.height * (1 - inset * 2),
    },
  })
}

if (args.includes('--frames')) {
  await mkdir(join(OUT, 'frames'), { recursive: true })
  for (const [tx, ty] of [[8, 15], [48, 15], [64, 12], [96, 14], [124, 14], [152, 14], [180, 14], [210, 15]]) {
    await writeFile(join(OUT, 'frames', `f-${tx}-${ty}.png`), await shootAt(tx, ty))
    console.log('frame', tx, ty)
  }
  await browser.close()
  server.close()
  process.exit(0)
}

const backdrop = (await shootAt(FRAME[0], FRAME[1])).toString('base64')
console.log('backdrop captured')

/**
 * Lift each crew sprite out of the atlas, trimmed to its own ink.
 *
 * Trimming matters for the line-up: the frames are all 162×150 with different
 * amounts of air around the figure, so laying the raw frames side by side puts
 * everyone at a different height above the ground and at a different apparent
 * size. Cropping to the alpha bounds gives a true baseline and a true scale.
 */
const CREW = ['luffy', 'zoro', 'nami', 'sanji', 'usopp', 'chopper', 'robin', 'franky', 'brook', 'jinbe']
const sprites = await game.evaluate((ids) => {
  const lib = window.__ART__
  return ids.map((id) => {
    const sheet = lib.crew[id]
    // Idle, not victory: the victory frames are mid-swing, with heads thrown
    // back and faces turned away — fine in motion, unreadable in a line-up.
    const anim = sheet.anims.idle
    const f = anim.frames[0]

    const c = document.createElement('canvas')
    c.width = f.sw
    c.height = f.sh
    const g = c.getContext('2d')
    g.drawImage(sheet.image, f.sx, f.sy, f.sw, f.sh, 0, 0, f.sw, f.sh)

    const { data } = g.getImageData(0, 0, f.sw, f.sh)
    let x0 = f.sw, y0 = f.sh, x1 = -1, y1 = -1
    for (let y = 0; y < f.sh; y++) {
      for (let x = 0; x < f.sw; x++) {
        // Ignore near-transparent edge pixels or the outline's own falloff
        // inflates every bounding box by a few pixels of nothing.
        if (data[(y * f.sw + x) * 4 + 3] > 16) {
          if (x < x0) x0 = x
          if (x > x1) x1 = x
          if (y < y0) y0 = y
          if (y > y1) y1 = y
        }
      }
    }
    if (x1 < 0) return null

    const t = document.createElement('canvas')
    t.width = x1 - x0 + 1
    t.height = y1 - y0 + 1
    t.getContext('2d').drawImage(c, x0, y0, t.width, t.height, 0, 0, t.width, t.height)
    return { id, w: t.width, h: t.height, png: t.toDataURL('image/png') }
  }).filter(Boolean)
}, CREW)
console.log(`${sprites.length} crew sprites lifted`)
await game.close()

/* ── Compose ─────────────────────────────────────────────────────────────── */

/**
 * One card.
 *
 * The line-up is laid out by hand rather than by flexbox: the figures have to
 * share a ground line and overlap by a fixed fraction of their own width, and
 * a flex row would instead give each one an equal share of the space and stand
 * the short ones in mid-air.
 */
function cardHtml({ w, h, crew, markPx, titlePx }) {
  const chosen = sprites.slice(0, crew)
  const tall = Math.max(...chosen.map((s) => s.h))
  const overlap = 0.82
  // Height the tallest figure to a share of the frame; everyone else keeps
  // their true proportion against them. Then, if ten of them at that height
  // would run off both edges, bring the whole row down to fit — the line-up
  // reading as one group matters more than any particular figure height.
  const spanAt = (u) => {
    const ws = chosen.map((s) => s.w * u)
    return ws.reduce((a, b) => a + b, 0) * overlap + ws.at(-1) * (1 - overlap)
  }
  let unit = (h * (w > h ? 0.44 : 0.32)) / tall
  const room = w * 0.92
  if (spanAt(unit) > room) unit *= room / spanAt(unit)

  const span = spanAt(unit)
  const ground = h * (w > h ? 0.92 : 0.9)

  let x = (w - span) / 2
  const figures = chosen.map((s, i) => {
    const fw = s.w * unit
    const fh = s.h * unit
    const left = x
    x += fw * overlap
    // Centre figures stand a touch forward, so the row reads as a group rather
    // than as a paste-up of equally distant cut-outs.
    const arc = 1 - Math.abs(i - (chosen.length - 1) / 2) / ((chosen.length - 1) / 2 || 1)
    const lift = arc * h * 0.012
    return `
      <div class="fig" style="left:${left}px;bottom:${h - ground + lift}px;width:${fw}px;height:${fh}px;z-index:${10 + Math.round(arc * 10)}">
        <div class="shadow" style="width:${fw * 0.62}px;height:${fw * 0.13}px"></div>
        <img src="${s.png}" alt="" style="width:${fw}px;height:${fh}px">
      </div>`
  }).join('')

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${FONT}
    *{margin:0;padding:0;box-sizing:border-box}
    body{width:${w}px;height:${h}px;overflow:hidden;background:${UI.night};
      font-family:Rubik,system-ui,sans-serif;position:relative}
    /* The backdrop is a real rendered frame; it is pushed back with a scrim
       rather than a blur, so the tiles and the parallax stay legible. */
    #shot{position:absolute;inset:0;background:url(data:image/png;base64,${backdrop}) center/cover no-repeat}
    #scrim{position:absolute;inset:0;background:
      linear-gradient(180deg, rgba(4,7,15,.72) 0%, rgba(4,7,15,.30) 26%, rgba(4,7,15,.34) 52%, rgba(4,7,15,.88) 88%, rgba(4,7,15,.97) 100%),
      radial-gradient(ellipse at 50% 42%, rgba(0,0,0,0) 42%, rgba(4,7,15,.6) 100%)}
    #floor{position:absolute;left:0;right:0;bottom:0;height:${h * 0.42}px;z-index:5;
      background:linear-gradient(180deg, rgba(4,7,15,0) 0%, rgba(4,7,15,.55) 45%, rgba(4,7,15,.9) 100%)}
    #stack{position:absolute;left:0;right:0;top:${h * (w > h ? 0.07 : 0.11)}px;
      display:flex;flex-direction:column;align-items:center;z-index:40}
    #mark{width:${markPx}px;height:${markPx}px;filter:drop-shadow(0 ${markPx * 0.09}px ${markPx * 0.16}px rgba(0,0,0,.85))}
    #title{position:relative;display:inline-block;margin-top:${titlePx * 0.16}px;
      font-size:${titlePx}px;font-weight:800;line-height:1;letter-spacing:-.012em}
    /* Ink contour and extrusion behind a brass face — the title screen's
       treatment. A text-shadow cannot sit behind a background-clipped fill, so
       the two are separate boxes stacked in place. */
    #title::before{content:'NAKAMA BROS';position:absolute;left:0;top:0;color:#23130A;
      -webkit-text-stroke:.055em #23130A;
      text-shadow:0 .028em 0 #3B2410,0 .05em 0 #2A1808,0 .075em 0 #1B0F07,0 .1em 0 #140A04,0 .17em .22em rgba(0,0,0,.85)}
    #title span{position:relative;background:linear-gradient(180deg,#FFF3CE 0%,${UI.gold} 40%,${UI.brass} 56%,#8A5F1E 100%);
      -webkit-background-clip:text;background-clip:text;color:transparent}
    #tagline{margin-top:${titlePx * 0.30}px;font-size:${titlePx * 0.24}px;font-weight:600;
      letter-spacing:.14em;text-transform:uppercase;color:#EFE0BE;
      text-shadow:0 2px 6px rgba(0,0,0,.9)}
    #keel{display:flex;align-items:center;gap:${titlePx * 0.14}px;
      width:${titlePx * 4.2}px;margin-top:${titlePx * 0.24}px}
    #keel i{flex:1;height:2px}
    #keel i:first-child{background:linear-gradient(90deg,transparent,${UI.brass})}
    #keel i:last-child{background:linear-gradient(90deg,${UI.brass},transparent)}
    #keel svg{width:${titlePx * 0.26}px;height:${titlePx * 0.09}px}
    .fig{position:absolute}
    .fig img{position:relative;display:block;image-rendering:auto;
      filter:brightness(1.14) saturate(1.06)
        drop-shadow(0 0 ${Math.round(h * 0.01)}px rgba(244,197,66,.16))
        drop-shadow(0 ${Math.round(h * 0.008)}px ${Math.round(h * 0.016)}px rgba(0,0,0,.5))}
    /* Grounds the figures on a backdrop whose own light comes from elsewhere. */
    .shadow{position:absolute;left:50%;bottom:${-h * 0.004}px;transform:translateX(-50%);
      background:radial-gradient(ellipse at 50% 50%, rgba(0,0,0,.62), rgba(0,0,0,0) 70%)}
    #site{position:absolute;left:0;right:0;bottom:${h * 0.032}px;text-align:center;z-index:60;
      font-size:${titlePx * 0.22}px;font-weight:600;letter-spacing:.16em;color:${UI.brassLit};
      text-shadow:0 2px 8px rgba(0,0,0,.95)}
  </style></head><body>
    <div id="shot"></div>
    <div id="scrim"></div>
    <div id="floor"></div>
    ${figures}
    <div id="stack">
      <svg id="mark" viewBox="0 0 64 64">${mark()}</svg>
      <div id="title"><span>NAKAMA BROS</span></div>
      <div id="tagline">${TAGLINE}</div>
      <div id="keel"><i></i>
        <svg viewBox="0 0 24 8"><path d="M12 0 L 17 4 L 12 8 L 7 4 Z" fill="${UI.brassLit}"/></svg>
      <i></i></div>
    </div>
    <div id="site">${SITE}</div>
  </body></html>`
}

await rm(join(OUT, 'unused'), { recursive: true, force: true })
for (const card of CARDS) {
  if (ONLY.length && !ONLY.includes(card.name)) continue
  const page = await browser.newPage({ viewport: { width: card.w, height: card.h }, deviceScaleFactor: 1 })
  await page.setContent(cardHtml(card), { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.load('800 100px Rubik').then(() => document.fonts.ready))
  await page.waitForTimeout(120)
  await writeFile(join(OUT, `${card.name}-${card.w}x${card.h}.png`), await page.screenshot({ type: 'png' }))
  await page.close()
  console.log(`promo/${card.name}-${card.w}x${card.h}.png`)
}

await browser.close()
server.close()
