/**
 * Screenshot harness.
 *
 * Boots the built game in headless Chromium, drives it to a set of framings,
 * and writes PNGs to `screenshots/`. Used both for manual review and by the
 * automated visual-critique passes.
 *
 *   node scripts/shoot.mjs [--out screenshots] [--shots title,crew,level]
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile, mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'

const args = process.argv.slice(2)
const argOf = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt
}

const OUT = resolve(argOf('out', 'screenshots'))
const DIST = resolve(argOf('dist', 'dist'))
const PORT = Number(argOf('port', '4319'))
const ONLY = argOf('shots', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
}

if (!existsSync(DIST)) {
  console.error(`${DIST} not found — run \`npm run build\` first.`)
  process.exit(1)
}

// Serve dist/ at the base path the build expects.
const BASE = '/nakama-bros/'
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent((req.url ?? '/').split('?')[0])
    if (p.startsWith(BASE)) p = p.slice(BASE.length - 1)
    if (p === '/' || p === '') p = '/index.html'
    const file = join(DIST, p)
    const body = await readFile(file)
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    try {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(await readFile(join(DIST, 'index.html')))
    } catch {
      res.writeHead(404).end('not found')
    }
  }
})

await new Promise((r) => server.listen(PORT, r))
await rm(OUT, { recursive: true, force: true })
await mkdir(OUT, { recursive: true })

// The session ships a pinned Chromium that may not match the npm package's
// expected build, so point Playwright at it explicitly when it is present.
const PINNED = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM ?? (existsSync(PINNED) ? PINNED : undefined)

const browser = await chromium.launch({
  executablePath,
  args: ['--force-color-profile=srgb', '--disable-lcd-text', '--hide-scrollbars'],
})
const page = await browser.newPage({
  viewport: { width: 1440, height: 810 },
  deviceScaleFactor: 1,
  reducedMotion: 'no-preference',
})
page.on('console', (m) => {
  if (m.type() === 'error') console.error('[page]', m.text())
})
page.on('pageerror', (e) => console.error('[pageerror]', e.message))

const url = `http://127.0.0.1:${PORT}${BASE}`
await page.goto(url, { waitUntil: 'networkidle' })

const want = (name) => ONLY.length === 0 || ONLY.includes(name)
const shot = async (name) => {
  if (!want(name)) return
  await page.screenshot({ path: join(OUT, `${name}.png`) })
  console.log('shot', name)
}

// Wait for the art library to finish rasterising.
await page.waitForFunction(() => !!document.querySelector('button'), { timeout: 30000 })
await page.waitForTimeout(600)
await shot('01-title')

// Crew select.
const crewBtn = page.getByRole('button').nth(1)
await crewBtn.click()
await page.waitForTimeout(700)
await shot('02-crew')
await page.keyboard.press('Escape').catch(() => {})

// Into the level.
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForFunction(() => !!document.querySelector('button'), { timeout: 30000 })
await page.waitForTimeout(400)
await page.getByRole('button').first().click()
await page.waitForFunction(() => !!window.__NAKAMA__, { timeout: 30000 })
await page.waitForTimeout(800)

/** Frame the level at a tile column and capture. */
const frame = async (name, tx, ty, steps = 30) => {
  if (!want(name)) return
  await page.evaluate(
    ([x, y, n]) => {
      const g = window.__NAKAMA__
      g.teleport(x * 16 + 8, y * 16 + 16)
      g.advance(n)
    },
    [tx, ty, steps],
  )
  await page.waitForTimeout(350)
  await shot(name)
}

await frame('03-level-open', 8, 15)
await frame('04-level-blocks', 48, 15)
await frame('05-level-slopes', 64, 12)
await frame('06-level-water', 152, 14)
await frame('07-level-tower', 210, 15)

// Action shot: run right and jump so the pose is mid-air.
if (want('08-action')) {
  await page.evaluate(() => {
    const g = window.__NAKAMA__
    g.teleport(30 * 16, 15 * 16 + 16)
    g.advance(10)
  })
  await page.keyboard.down('ArrowRight')
  await page.waitForTimeout(500)
  await page.keyboard.down('Space')
  await page.waitForTimeout(220)
  await shot('08-action')
  await page.keyboard.up('Space')
  await page.keyboard.up('ArrowRight')
}

// Pause overlay.
if (want('09-pause')) {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
  await shot('09-pause')
}

await browser.close()
server.close()
console.log(`\nWrote screenshots to ${OUT}`)
