/**
 * Blind A/B comparison sheets.
 *
 * Takes two screenshot directories (typically two iterations of the game) and
 * writes one side-by-side composite per shot, with the two candidates randomly
 * assigned to the left and right panel and labelled only "A" and "B". The
 * mapping is written to key.json, which the reviewer must not be shown.
 *
 *   node scripts/ab.mjs --left screenshots/iter3 --right screenshots/iter4 \
 *                       --out review/round4 [--seed 12]
 */
import { chromium } from 'playwright'
import { readdir, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve, basename } from 'node:path'

const args = process.argv.slice(2)
const argOf = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : d
}

const LEFT = resolve(argOf('left', 'screenshots'))
const RIGHT = resolve(argOf('right', 'screenshots'))
const OUT = resolve(argOf('out', 'review/round'))
let seed = Number(argOf('seed', '1')) >>> 0

const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}

for (const dir of [LEFT, RIGHT]) {
  if (!existsSync(dir)) {
    console.error(`missing directory: ${dir}`)
    process.exit(1)
  }
}

const shotsOf = async (dir) =>
  (await readdir(dir)).filter((f) => f.endsWith('.png')).sort()

const leftShots = await shotsOf(LEFT)
const rightShots = await shotsOf(RIGHT)
const shared = leftShots.filter((f) => rightShots.includes(f))

if (shared.length === 0) {
  console.error('no shots in common between the two directories')
  process.exit(1)
}

await rm(OUT, { recursive: true, force: true })
await mkdir(OUT, { recursive: true })

const PINNED = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? (existsSync(PINNED) ? PINNED : undefined),
  args: ['--force-color-profile=srgb', '--hide-scrollbars'],
})
const page = await browser.newPage({ viewport: { width: 1520, height: 900 } })

const key = {}
const dataUri = async (p) => `data:image/png;base64,${(await readFile(p)).toString('base64')}`

for (const shot of shared) {
  // Randomise which side each candidate lands on, per shot, so a reviewer
  // cannot learn "left is always the new one" partway through.
  const flip = rand() < 0.5
  const aPath = flip ? join(RIGHT, shot) : join(LEFT, shot)
  const bPath = flip ? join(LEFT, shot) : join(RIGHT, shot)
  key[shot] = { A: flip ? RIGHT : LEFT, B: flip ? LEFT : RIGHT }

  const [aUri, bUri] = await Promise.all([dataUri(aPath), dataUri(bPath)])
  await page.setContent(`
    <html><head><style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{background:#111;color:#eee;font:600 15px system-ui;display:flex;flex-direction:column}
      .row{display:flex;gap:2px;flex:1}
      .cell{flex:1;display:flex;flex-direction:column;background:#000}
      .tag{padding:6px 10px;background:#1b1b1b;letter-spacing:.3em;text-align:center}
      img{width:100%;display:block;image-rendering:pixelated}
    </style></head><body>
      <div class="row">
        <div class="cell"><div class="tag">A</div><img src="${aUri}"></div>
        <div class="cell"><div class="tag">B</div><img src="${bUri}"></div>
      </div>
    </body></html>`)
  await page.waitForTimeout(120)
  await page.screenshot({ path: join(OUT, `ab-${basename(shot)}`), fullPage: true })
  console.log('composed', shot)
}

await writeFile(join(OUT, 'key.json'), JSON.stringify(key, null, 2))
await browser.close()
console.log(`\nWrote ${shared.length} comparison sheets to ${OUT}`)
console.log(`Key (do NOT show the reviewer): ${join(OUT, 'key.json')}`)
