/**
 * In-game framings of any stage.
 *
 * `shoot.mjs` always captures the first level, because that is the one the
 * title screen starts. This rotates `window.__LEVELS__` — the campaign array
 * the app reads — so the requested stage becomes the one Play launches, then
 * teleports the player to each named column and captures the frame.
 *
 *   node scripts/levelshots.mjs --dist dist-levels --port 4347 \
 *        --level wano-2 --at 12,64,140,206 --out screenshots/levels-ingame
 *
 * `--at` takes tile columns; add `:row` to a column to pick the row too,
 * otherwise the player is dropped from above and lands wherever the ground is.
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'

const args = process.argv.slice(2)
const argOf = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : d
}

const OUT = resolve(argOf('out', 'screenshots/levels-ingame'))
const DIST = resolve(argOf('dist', 'dist'))
const PORT = Number(argOf('port', '4347'))
const LEVEL = argOf('level', '')
const AT = argOf('at', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => {
    const [tx, ty] = s.split(':')
    return { tx: Number(tx), ty: ty === undefined ? null : Number(ty) }
  })

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
}
const BASE = '/nakama-bros/'

if (!existsSync(DIST)) {
  console.error(`${DIST} not found — run \`npx vite build --outDir ${DIST}\` first.`)
  process.exit(1)
}

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent((req.url ?? '/').split('?')[0])
    if (p.startsWith(BASE)) p = p.slice(BASE.length - 1)
    if (p === '/' || p === '') p = '/index.html'
    const body = await readFile(join(DIST, p))
    res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(await readFile(join(DIST, 'index.html')))
  }
})
await new Promise((r) => server.listen(PORT, r))
await mkdir(OUT, { recursive: true })

const PINNED = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? (existsSync(PINNED) ? PINNED : undefined),
  args: ['--force-color-profile=srgb', '--disable-lcd-text', '--hide-scrollbars'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 1 })
page.on('pageerror', (e) => console.error('[pageerror]', e.message))
page.on('console', (m) => {
  if (m.type() === 'error') console.error('[page]', m.text())
})

const url = `http://127.0.0.1:${PORT}${BASE}`
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForFunction(() => !!window.__LEVELS__ && !!document.querySelector('button'), { timeout: 60000 })

// Rotate the campaign so the wanted stage is the one Play starts.
const picked = await page.evaluate((id) => {
  const levels = window.__LEVELS__
  const i = id ? levels.findIndex((l) => l.id === id) : 0
  if (i < 0) return null
  const [lv] = levels.splice(i, 1)
  levels.unshift(lv)
  return { id: lv.id, name: lv.name, w: lv.w, h: lv.h }
}, LEVEL)

if (!picked) {
  console.error(`no such level: ${LEVEL}`)
  await browser.close()
  server.close()
  process.exit(1)
}
console.log(`framing ${picked.id} — "${picked.name}" (${picked.w}x${picked.h})`)

await page.getByRole('button').first().click()
await page.waitForFunction(() => !!window.__NAKAMA__, { timeout: 30000 })
await page.waitForTimeout(900)

const columns = AT.length ? AT : [{ tx: 8, ty: null }]
let n = 0
for (const { tx, ty } of columns) {
  await page.evaluate(
    ([x, y]) => {
      const g = window.__NAKAMA__
      // Dropping in from above and letting gravity settle means a caller only
      // has to know the column, not the exact row of the floor.
      g.teleport(x * 16 + 8, y === null ? 16 : y * 16 + 16)
      g.advance(y === null ? 90 : 20)
    },
    [tx, ty],
  )
  await page.waitForTimeout(320)
  const name = `${picked.id}-${String(++n).padStart(2, '0')}-t${tx}.png`
  await page.screenshot({ path: join(OUT, name) })
  console.log('  shot', name)
}

await browser.close()
server.close()
