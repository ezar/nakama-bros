/**
 * Level maps.
 *
 * A screenshot of the running game shows twenty-four tiles of a three-hundred
 * tile level, which is no way to see whether a stage is built correctly. This
 * draws the whole thing: every tile, every spawn, wrapped into bands with a
 * column ruler, and runs the structural validator next to the picture so a
 * floating slope or a ladder attached to nothing is both listed and visible.
 *
 *   npx vite-node scripts/levelmap.mjs -- --out screenshots/levels
 *   npx vite-node scripts/levelmap.mjs -- --level wano-2 --zoom 10
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { ALL_LEVELS } from '../src/game/level/index.ts'
import { validateLevel, formatIssue } from '../src/game/level/validate.ts'

const args = process.argv.slice(2)
const argOf = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : d
}

const OUT = resolve(argOf('out', 'screenshots/levels'))
const ZOOM = Number(argOf('zoom', '8'))
const BAND = Number(argOf('band', '110'))
const ONLY = argOf('level', '')

// ── PNG ──────────────────────────────────────────────────────────────────────

const CRC = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

const crc32 = (buf) => {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** Encode an RGB byte array (w*h*3) as a PNG. */
function encodePng(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ── A tiny canvas ────────────────────────────────────────────────────────────

class Img {
  constructor(w, h, bg = [16, 18, 24]) {
    this.w = w
    this.h = h
    this.buf = Buffer.alloc(w * h * 3)
    for (let i = 0; i < w * h; i++) {
      this.buf[i * 3] = bg[0]
      this.buf[i * 3 + 1] = bg[1]
      this.buf[i * 3 + 2] = bg[2]
    }
  }
  px(x, y, c) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return
    const i = (y * this.w + x) * 3
    this.buf[i] = c[0]
    this.buf[i + 1] = c[1]
    this.buf[i + 2] = c[2]
  }
  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c)
  }
  disc(cx, cy, r, c) {
    for (let j = -r; j <= r; j++) {
      for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r) this.px(cx + i, cy + j, c)
    }
  }
}

// 3x5 digits, enough for a column ruler.
const GLYPHS = {
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'],
  7: ['111', '001', '001', '001', '001'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
}

function text(img, x, y, str, c) {
  let cx = x
  for (const ch of String(str)) {
    const gl = GLYPHS[ch]
    if (gl) {
      for (let j = 0; j < 5; j++) {
        for (let i = 0; i < 3; i++) if (gl[j][i] === '1') img.px(cx + i, y + j, c)
      }
    }
    cx += 4
  }
}

// ── Palettes ─────────────────────────────────────────────────────────────────

const TILE_COLOR = {
  '.': null,
  ' ': null,
  '#': [124, 96, 62],
  '-': [206, 168, 96],
  B: [176, 104, 60],
  '?': [232, 196, 72],
  U: [130, 118, 96],
  '^': [226, 74, 74],
  '~': [56, 110, 190],
  '/': [200, 150, 80],
  '\\': [200, 150, 80],
  ':': [58, 54, 62],
  I: [140, 214, 226],
  O: [214, 96, 190],
  C: [150, 118, 78],
  H: [236, 232, 214],
}

const SPAWN_COLOR = {
  grunt: [226, 74, 74], shielder: [226, 120, 74], crab: [240, 110, 90],
  fishman: [120, 200, 160], bat: [190, 110, 220], urchin: [150, 60, 160],
  barrel: [180, 130, 70],
  berry: [242, 214, 80], meat: [230, 140, 90], fruit: [120, 230, 140],
  oneup: [110, 240, 200], fragment: [220, 120, 250],
  checkpoint: [90, 200, 255], goal: [255, 255, 255],
  platform: [255, 160, 60], crumble: [200, 160, 110],
  'boss-buggy': [255, 60, 60], 'boss-kaido': [255, 60, 60],
}

const BIG = new Set(['goal', 'checkpoint', 'fragment', 'boss-buggy', 'boss-kaido', 'platform', 'oneup'])

// ── Draw ─────────────────────────────────────────────────────────────────────

function drawLevel(def) {
  // Spread the columns evenly over the bands rather than leaving a nearly
  // empty strip at the bottom of every map.
  const bands = Math.ceil(def.w / BAND)
  const band = Math.ceil(def.w / bands)
  const pad = 6
  const ruler = 8
  const bandH = def.h * ZOOM + ruler + pad
  const img = new Img(band * ZOOM + pad * 2, bands * bandH + pad, [14, 15, 20])

  for (let b = 0; b < bands; b++) {
    const x0 = b * band
    const oy = pad + b * bandH + ruler

    // Sky panel, so empty space is not the page background.
    img.rect(pad, oy, band * ZOOM, def.h * ZOOM, [26, 30, 40])

    for (let y = 0; y < def.h; y++) {
      const row = def.rows[y] ?? ''
      for (let x = 0; x < band; x++) {
        const c = TILE_COLOR[row[x0 + x]]
        if (!c) continue
        const px = pad + x * ZOOM
        const py = oy + y * ZOOM
        const ch = row[x0 + x]
        if (ch === '\\') {
          // Draw the real triangle so a ramp's direction is visible.
          for (let j = 0; j < ZOOM; j++) for (let i = 0; i < ZOOM; i++) if (j >= i) img.px(px + i, py + j, c)
        } else if (ch === '/') {
          for (let j = 0; j < ZOOM; j++) for (let i = 0; i < ZOOM; i++) if (j >= ZOOM - 1 - i) img.px(px + i, py + j, c)
        } else if (ch === '-') {
          img.rect(px, py, ZOOM, Math.max(2, ZOOM / 3), c)
        } else if (ch === '^') {
          for (let j = 0; j < ZOOM; j++) {
            const half = Math.round(((j + 1) / ZOOM) * (ZOOM / 2))
            img.rect(px + ZOOM / 2 - half, py + j, half * 2, 1, c)
          }
        } else if (ch === 'H') {
          img.rect(px + 1, py, 2, ZOOM, c)
          img.rect(px + ZOOM - 3, py, 2, ZOOM, c)
          if (y % 2 === 0) img.rect(px, py + ZOOM / 2, ZOOM, 1, c)
        } else {
          img.rect(px, py, ZOOM - 1, ZOOM - 1, c)
        }
      }
    }

    // Column ruler every ten tiles.
    for (let x = 0; x < band; x += 10) {
      const tx = x0 + x
      if (tx > def.w) break
      img.rect(pad + x * ZOOM, oy - 2, 1, 2, [90, 100, 120])
      text(img, pad + x * ZOOM + 2, oy - ruler + 1, tx, [130, 145, 170])
    }

    // Spawns on top of the terrain.
    for (const s of def.spawns) {
      if (s.tx < x0 || s.tx >= x0 + band) continue
      const c = SPAWN_COLOR[s.type] ?? [255, 0, 255]
      const cx = pad + (s.tx - x0) * ZOOM + Math.floor(ZOOM / 2)
      const cy = oy + s.ty * ZOOM + Math.floor(ZOOM / 2)
      img.disc(cx, cy, BIG.has(s.type) ? Math.max(3, ZOOM / 2) : Math.max(1, ZOOM / 4 - 1), c)
    }

    // The player start.
    if (def.startX >= x0 && def.startX < x0 + band) {
      const cx = pad + (def.startX - x0) * ZOOM
      img.rect(cx, oy + (def.startY - 1) * ZOOM, 2, ZOOM * 2, [80, 255, 120])
    }
  }
  return img
}

// ── Run ──────────────────────────────────────────────────────────────────────

mkdirSync(OUT, { recursive: true })
let errors = 0
let warns = 0
for (const def of ALL_LEVELS) {
  if (ONLY && def.id !== ONLY) continue
  const issues = validateLevel(def)
  errors += issues.filter((i) => i.severity === 'error').length
  warns += issues.filter((i) => i.severity === 'warn').length
  const img = drawLevel(def)
  const file = join(OUT, `${def.id}.png`)
  writeFileSync(file, encodePng(img.w, img.h, img.buf))
  const tiles = def.rows.join('').replace(/\./g, '').length
  console.log(
    `${def.id.padEnd(16)} ${String(def.w).padStart(3)}x${String(def.h).padStart(2)} ` +
    `${String(def.spawns.length).padStart(3)} spawns  ${String(tiles).padStart(5)} tiles  → ${file}`,
  )
  for (const i of issues) console.log('   ', formatIssue(i))
}
console.log(`\n${errors} error(s), ${warns} warning(s)`)
if (errors) process.exitCode = 1
