/**
 * Sprite contact sheets.
 *
 * Renders a chosen sprite sheet at high zoom on a neutral checkerboard so
 * silhouettes, proportions and per-frame drawing errors are actually visible —
 * a screenshot of the running game is far too small to review character art in.
 *
 *   node scripts/sheets.mjs --sheet crew:luffy --zoom 3 --out screenshots/sheets
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { waitForHandle } from './lib/handles.mjs'

const args = process.argv.slice(2)
const argOf = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : d
}

const OUT = resolve(argOf('out', 'screenshots/sheets'))
const DIST = resolve(argOf('dist', 'dist'))
const PORT = Number(argOf('port', '4321'))
const ZOOM = Number(argOf('zoom', '3'))
const SHEETS = argOf('sheet', 'crew:luffy').split(',').map((s) => s.trim())

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
}
const BASE = '/nakama-bros/'

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
  args: ['--force-color-profile=srgb', '--hide-scrollbars'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
page.on('pageerror', (e) => console.error('[pageerror]', e.message))

await page.goto(`http://127.0.0.1:${PORT}${BASE}`, { waitUntil: 'networkidle' })
await waitForHandle(page, '__ART__')

for (const spec of SHEETS) {
  const [group, key] = spec.split(':')
  const ok = await page.evaluate(
    ([group, key, zoom]) => {
      const lib = window.__ART__
      const sheet = lib?.[group]?.[key]
      if (!sheet) return false
      document.body.innerHTML = ''
      document.body.style.cssText =
        'margin:0;padding:24px;background:#20242e;font:600 13px system-ui;color:#dfe4ee'
      const title = document.createElement('div')
      title.textContent = `${group}:${key}`
      title.style.cssText = 'letter-spacing:.24em;text-transform:uppercase;margin-bottom:16px'
      document.body.appendChild(title)

      for (const [name, anim] of Object.entries(sheet.anims)) {
        const row = document.createElement('div')
        row.style.cssText = 'display:flex;align-items:flex-end;gap:8px;margin-bottom:14px'
        const label = document.createElement('div')
        label.textContent = name
        label.style.cssText = 'width:70px;opacity:.75'
        row.appendChild(label)
        for (const f of anim.frames) {
          const c = document.createElement('canvas')
          c.width = f.sw * zoom
          c.height = f.sh * zoom
          // A checkerboard makes transparent gaps and stray pixels obvious.
          c.style.cssText =
            'background-image:linear-gradient(45deg,#2c313d 25%,transparent 25%),' +
            'linear-gradient(-45deg,#2c313d 25%,transparent 25%),' +
            'linear-gradient(45deg,transparent 75%,#2c313d 75%),' +
            'linear-gradient(-45deg,transparent 75%,#2c313d 75%);' +
            'background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0px;' +
            'outline:1px solid #3a4150'
          const ctx = c.getContext('2d')
          ctx.imageSmoothingEnabled = true
          ctx.imageSmoothingQuality = 'high'
          ctx.drawImage(sheet.image, f.sx, f.sy, f.sw, f.sh, 0, 0, c.width, c.height)
          row.appendChild(c)
        }
        document.body.appendChild(row)
      }
      return true
    },
    [group, key, ZOOM],
  )
  if (!ok) {
    console.error(`sheet not found: ${spec}`)
    continue
  }
  await page.waitForTimeout(150)
  await page.screenshot({ path: join(OUT, `${group}-${key}.png`), fullPage: true })
  console.log('sheet', spec)
}

await browser.close()
server.close()
console.log(`\nWrote contact sheets to ${OUT}`)
