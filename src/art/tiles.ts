import { ART_SCALE, TILE, Tile } from '../types'
import type { Biome } from '../types'
import { cel, mix, rgba } from './color'
import { biomePalette } from './palette'
import { blob, createSurface, curve, ellipsePath, glint, gradientFill, paint, roundRectPath, type Pt, type Surface } from './ink'

/**
 * A biome's tile atlas.
 *
 * Tiles autotile from a 4-bit neighbour mask (N=1, E=2, S=4, W=8) — the
 * renderer passes an 8-bit mask so corner-aware painters can be added without
 * changing this contract — plus a variant index so long runs of ground do not
 * visibly repeat.
 */
export interface Tileset {
  image: CanvasImageSource
  /** Cell size in device pixels. */
  cellPx: number
  variants: number
  src(id: number, mask: number, variant: number): { sx: number; sy: number }
}

/** Ids that vary with their neighbours and therefore need all 16 mask cells. */
export const AUTOTILED: number[] = [Tile.Solid, Tile.Ice, Tile.Decor, Tile.Crumble]

/** Every id the atlas holds art for, in row order. */
export const ATLAS_IDS: number[] = [
  Tile.Solid, Tile.OneWay, Tile.Brick, Tile.Question, Tile.Used, Tile.Spike,
  Tile.Water, Tile.SlopeUp45, Tile.SlopeDown45, Tile.Decor, Tile.Ice,
  Tile.Bouncy, Tile.Crumble, Tile.Climb,
]

const VARIANTS = 3

export interface TileDrawArgs {
  s: Surface
  ctx: CanvasRenderingContext2D
  /** Neighbour mask. Bit set means "the same tile is there". */
  mask: number
  variant: number
  biome: Biome
}

export type TilePainter = (a: TileDrawArgs) => void

/** Deterministic per-cell jitter so variants look authored, not noisy. */
const jitter = (variant: number, i: number): number => {
  const n = Math.sin(variant * 12.9898 + i * 78.233) * 43758.5453
  return n - Math.floor(n)
}

export function buildTileset(
  biome: Biome,
  painters: Partial<Record<number, TilePainter>> = {},
): Tileset {
  const cellPx = TILE * ART_SCALE
  const cols = 16 * VARIANTS
  const rows = ATLAS_IDS.length
  const sheet = document.createElement('canvas')
  sheet.width = cols * cellPx
  sheet.height = rows * cellPx
  const sctx = sheet.getContext('2d')!
  sctx.imageSmoothingEnabled = true

  const index = new Map<number, number>()
  ATLAS_IDS.forEach((id, i) => index.set(id, i))

  for (let r = 0; r < rows; r++) {
    const id = ATLAS_IDS[r]
    const painter = painters[id] ?? DEFAULT_PAINTERS[id] ?? paintSolid
    const masks = AUTOTILED.includes(id) ? 16 : 1
    for (let mask = 0; mask < 16; mask++) {
      for (let v = 0; v < VARIANTS; v++) {
        const cell = createSurface(TILE, TILE)
        painter({ s: cell, ctx: cell.ctx, mask: mask % masks, variant: v, biome })
        sctx.drawImage(cell.canvas, (mask * VARIANTS + v) * cellPx, r * cellPx)
      }
    }
  }

  return {
    image: sheet,
    cellPx,
    variants: VARIANTS,
    src(id, mask, variant) {
      const row = index.get(id) ?? 0
      const m = AUTOTILED.includes(id) ? mask & 15 : 0
      const v = ((variant % VARIANTS) + VARIANTS) % VARIANTS
      return { sx: (m * VARIANTS + v) * cellPx, sy: row * cellPx }
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Painters. Everything is driven by the biome palette so a new biome is a
// palette entry, not a new set of drawings.
// ─────────────────────────────────────────────────────────────────────────────

function paintSolid({ ctx, mask, variant, biome }: TileDrawArgs): void {
  const p = biomePalette(biome)
  const body = cel(p.groundDeep)
  const cap = cel(p.ground)
  const openTop = (mask & 1) === 0
  const openLeft = (mask & 8) === 0
  const openRight = (mask & 2) === 0

  // Body: a flat mass with a subtle vertical ramp so tall walls do not read flat.
  gradientFill(ctx, roundRectPath(0, 0, TILE, TILE, 0), 0, 0, 0, TILE, [
    [0, body.core],
    [1, body.shade],
  ])

  // Strata, drawn as soft bands rather than lines — rock has bedding, not stripes.
  ctx.save()
  ctx.globalAlpha = 0.18
  ctx.strokeStyle = body.deep
  ctx.lineWidth = 0.9
  for (let i = 0; i < 3; i++) {
    const y = 3 + i * 4.5 + jitter(variant, i) * 1.6
    ctx.stroke(curve([
      [0, y],
      [TILE * 0.4, y + (jitter(variant, i + 7) - 0.5) * 1.4],
      [TILE, y + (jitter(variant, i + 3) - 0.5) * 1.4],
    ] as Pt[]))
  }
  ctx.restore()

  if (openTop) {
    // The grass/sand cap: an organic top edge with hanging tufts, not a bar.
    const pts: Pt[] = [[0, 5.4]]
    for (let i = 1; i < 5; i++) {
      pts.push([(TILE / 4) * i - 2, 4.4 + jitter(variant, i) * 1.9])
    }
    pts.push([TILE, 5.2], [TILE, 0], [0, 0])
    const capPath = blob(pts, 0.9)
    paint(ctx, capPath, cap, {
      shadow: 0.3, radius: 6, pivot: [TILE / 2, 3], rim: 0.5, line: 0,
    })
    // Tufts hanging into the body below the cap edge.
    ctx.save()
    ctx.fillStyle = cap.shade
    for (let i = 0; i < 4; i++) {
      const x = 1.6 + i * 4 + jitter(variant, i + 11) * 1.6
      const h = 1.6 + jitter(variant, i + 5) * 2.6
      ctx.fill(blob([[x, 5], [x + 1.5, 5], [x + 0.8, 5 + h]] as Pt[], 0.7))
    }
    ctx.restore()
    // A bright lip catching the key light.
    ctx.save()
    ctx.globalAlpha = 0.9
    ctx.strokeStyle = cap.light
    ctx.lineWidth = 0.8
    ctx.stroke(curve([[0, 0.5], [TILE / 2, 0.4], [TILE, 0.5]] as Pt[]))
    ctx.restore()
  }

  // Cliff faces get a darker edge so vertical walls separate from the fill.
  ctx.save()
  if (openLeft) {
    gradientFill(ctx, roundRectPath(0, 0, 3, TILE, 0), 0, 0, 3, 0, [
      [0, rgba(body.deep, 0.55)],
      [1, rgba(body.deep, 0)],
    ])
  }
  if (openRight) {
    gradientFill(ctx, roundRectPath(TILE - 3, 0, 3, TILE, 0), TILE - 3, 0, TILE, 0, [
      [0, rgba(body.deep, 0)],
      [1, rgba(body.deep, 0.55)],
    ])
  }
  ctx.restore()

  // An embedded stone every few variants keeps long runs from reading as tiling.
  if (variant % 4 === 2) {
    const rx = 3 + jitter(variant, 21) * 8
    const ry = 8 + jitter(variant, 22) * 5
    paint(ctx, ellipsePath(rx, ry, 2.2, 1.6, 0.3), cel(p.groundEdge), {
      shadow: 0.5, radius: 2.2, pivot: [rx, ry], line: 0.35,
    })
  }
}

function paintOneWay({ ctx, biome }: TileDrawArgs): void {
  const p = biomePalette(biome)
  const wood = cel(p.groundEdge)
  paint(ctx, roundRectPath(0, 0.5, TILE, 5, 1.2), wood, {
    shadow: 0.4, radius: 3, pivot: [TILE / 2, 3], rim: 0.5, line: 0.5,
  })
  ctx.save()
  ctx.globalAlpha = 0.35
  ctx.strokeStyle = wood.deep
  ctx.lineWidth = 0.5
  for (const x of [4, 8, 12]) {
    ctx.beginPath()
    ctx.moveTo(x, 1)
    ctx.lineTo(x, 5)
    ctx.stroke()
  }
  ctx.restore()
}

function paintBrick({ ctx, biome, variant }: TileDrawArgs): void {
  const p = biomePalette(biome)
  const c = cel(p.groundEdge)
  ctx.fillStyle = c.deep
  ctx.fillRect(0, 0, TILE, TILE)
  // Two courses of offset bricks with real mortar gaps.
  const rows = [0, 5.5, 11]
  rows.forEach((y, ri) => {
    const offset = ri % 2 === 0 ? 0 : -3.5
    for (let x = offset; x < TILE; x += 7) {
      const w = Math.min(6.4, TILE - x)
      if (w < 1.5) continue
      const tone = jitter(variant, ri * 4 + x) * 0.16 - 0.08
      paint(
        ctx,
        roundRectPath(Math.max(0.4, x), y + 0.4, w - 0.6, 4.6, 0.7),
        cel(mix(c.core, tone > 0 ? c.light : c.shade, Math.abs(tone) * 4)),
        { shadow: 0.34, radius: 2.6, pivot: [x + w / 2, y + 2.6], rim: 0.3, line: 0 },
      )
    }
  })
}

function paintQuestion({ ctx, variant }: TileDrawArgs): void {
  const gold = cel('#F6C63C')
  paint(ctx, roundRectPath(0.6, 0.6, TILE - 1.2, TILE - 1.2, 2.4), gold, {
    shadow: 0.36, radius: 7, pivot: [TILE / 2, TILE / 2], rim: 0.7, line: 0.7,
  })
  // Rivets at the corners read as a mechanism worth hitting.
  ctx.save()
  ctx.fillStyle = gold.deep
  for (const [x, y] of [[3, 3], [TILE - 3, 3], [3, TILE - 3], [TILE - 3, TILE - 3]] as Pt[]) {
    ctx.beginPath()
    ctx.arc(x, y, 0.75, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
  // The mark: a stylised question drawn as a path, not a font.
  ctx.save()
  ctx.strokeStyle = '#5C3A16'
  ctx.lineWidth = 1.9
  ctx.lineCap = 'round'
  ctx.stroke(curve([[5.6, 6], [6.6, 4.6], [9, 4.8], [9.6, 6.4], [8, 7.6], [8, 9.2]] as Pt[]))
  ctx.beginPath()
  ctx.arc(8, 11.6, 1, 0, Math.PI * 2)
  ctx.fillStyle = '#5C3A16'
  ctx.fill()
  ctx.restore()
  glint(ctx, 4.6, 4.2, 1.9, 1, -0.7, '#FFFFFF', 0.5 + (variant % 2) * 0.15)
}

function paintUsed({ ctx, biome }: TileDrawArgs): void {
  const p = biomePalette(biome)
  const c = cel(mix(p.groundEdge, '#000000', 0.15))
  paint(ctx, roundRectPath(0.6, 0.6, TILE - 1.2, TILE - 1.2, 2.4), c, {
    shadow: 0.5, radius: 7, pivot: [TILE / 2, TILE / 2], line: 0.6,
  })
}

function paintSpike({ ctx }: TileDrawArgs): void {
  const steel = cel('#9FB0C8')
  // A base plate, then blades — the plate is what makes them read as placed.
  paint(ctx, roundRectPath(0, TILE - 3.4, TILE, 3.4, 0.8), cel('#5A6480'), {
    shadow: 0.45, radius: 2, pivot: [TILE / 2, TILE - 1.6], line: 0.5,
  })
  for (let i = 0; i < 3; i++) {
    const x = 2.7 + i * 5.4
    const tip: Pt = [x, 2.2]
    const blade = blob([[x - 2.2, TILE - 3], tip, [x + 2.2, TILE - 3]] as Pt[], 0.35)
    paint(ctx, blade, steel, {
      shadow: 0.44, radius: 2.4, pivot: [x, 8], rim: 0.45, line: 0.55,
    })
    glint(ctx, x - 0.5, 6, 0.35, 2.2, 0.15, '#FFFFFF', 0.75)
  }
}

function paintWater({ ctx, biome }: TileDrawArgs): void {
  // The renderer animates water on top of this; the atlas cell is only a base.
  const p = biomePalette(biome)
  gradientFill(ctx, roundRectPath(0, 0, TILE, TILE, 0), 0, 0, 0, TILE, [
    [0, rgba(p.accent, 0.5)],
    [1, rgba('#0A2A4A', 0.7)],
  ])
}

function paintSlope(dir: 1 | -1): TilePainter {
  return ({ ctx, biome, variant }) => {
    const p = biomePalette(biome)
    const body = cel(p.groundDeep)
    const cap = cel(p.ground)
    const top: Pt = dir === 1 ? [TILE, 0] : [0, 0]
    const face: Pt[] =
      dir === 1
        ? [[0, TILE], [TILE, 0], [TILE, TILE]]
        : [[0, 0], [TILE, TILE], [0, TILE]]
    const shape = blob(face, 0)
    paint(ctx, shape, body, {
      shadow: 0.4, radius: 8, pivot: [TILE / 2, TILE / 2], line: 0,
    })
    // The cap runs along the diagonal.
    ctx.save()
    ctx.clip(shape)
    ctx.strokeStyle = cap.core
    ctx.lineWidth = 4.4
    ctx.beginPath()
    ctx.moveTo(dir === 1 ? -1 : TILE + 1, dir === 1 ? TILE + 1 : TILE + 1)
    ctx.lineTo(top[0], top[1] - 1)
    ctx.stroke()
    ctx.strokeStyle = cap.light
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(dir === 1 ? -1 : TILE + 1, dir === 1 ? TILE - 1 : TILE - 1)
    ctx.lineTo(top[0], top[1] - 2.4)
    ctx.stroke()
    ctx.restore()
    void variant
  }
}

function paintDecor({ ctx, biome, variant }: TileDrawArgs): void {
  const p = biomePalette(biome)
  // Background fill: the same terrain pushed back with atmosphere.
  const back = mix(p.groundDeep, p.fog, 0.42)
  gradientFill(ctx, roundRectPath(0, 0, TILE, TILE, 0), 0, 0, 0, TILE, [
    [0, back],
    [1, mix(back, p.fog, 0.18)],
  ])
  ctx.save()
  ctx.globalAlpha = 0.14
  ctx.strokeStyle = mix(p.groundDeep, '#000000', 0.3)
  ctx.lineWidth = 0.7
  for (let i = 0; i < 2; i++) {
    const y = 4 + i * 7 + jitter(variant, i) * 2
    ctx.stroke(curve([[0, y], [TILE / 2, y + 1.2], [TILE, y]] as Pt[]))
  }
  ctx.restore()
}

function paintIce({ ctx, mask }: TileDrawArgs): void {
  const ice = cel('#9FDCF0')
  gradientFill(ctx, roundRectPath(0, 0, TILE, TILE, 0), 0, 0, 0, TILE, [
    [0, ice.light],
    [1, ice.shade],
  ])
  // Internal fracture planes catch the light along their length.
  ctx.save()
  ctx.globalAlpha = 0.5
  ctx.strokeStyle = '#FFFFFF'
  ctx.lineWidth = 0.6
  ctx.stroke(curve([[2, TILE], [6, 8], [4, 2]] as Pt[]))
  ctx.stroke(curve([[10, TILE], [13, 9], [11, 3]] as Pt[]))
  ctx.restore()
  if ((mask & 1) === 0) {
    ctx.save()
    ctx.globalAlpha = 0.9
    ctx.fillStyle = '#F2FCFF'
    ctx.fill(roundRectPath(0, 0, TILE, 2.2, 1))
    ctx.restore()
  }
}

function paintBouncy({ ctx }: TileDrawArgs): void {
  const c = cel('#43C05C')
  paint(ctx, roundRectPath(0, 2, TILE, TILE - 2, 3), c, {
    shadow: 0.38, radius: 7, pivot: [TILE / 2, TILE / 2], rim: 0.7, line: 0.7,
  })
  ctx.save()
  ctx.strokeStyle = c.deep
  ctx.lineWidth = 1
  ctx.stroke(curve([[3, 8], [5, 6], [7, 8]] as Pt[]))
  ctx.stroke(curve([[9, 8], [11, 6], [13, 8]] as Pt[]))
  ctx.restore()
  glint(ctx, 4.5, 4.5, 2.4, 1.1, -0.6, '#FFFFFF', 0.45)
}

function paintCrumble({ ctx, biome, variant }: TileDrawArgs): void {
  const p = biomePalette(biome)
  const c = cel(mix(p.groundEdge, p.groundDeep, 0.3))
  paint(ctx, roundRectPath(0.3, 0.3, TILE - 0.6, TILE - 0.6, 1), c, {
    shadow: 0.42, radius: 7, pivot: [TILE / 2, TILE / 2], rim: 0.5, line: 0.6,
  })
  ctx.save()
  ctx.strokeStyle = c.deep
  ctx.lineWidth = 0.7
  ctx.globalAlpha = 0.8
  for (let i = 0; i < 3; i++) {
    const x = 2 + jitter(variant, i) * 11
    const y = 2 + jitter(variant, i + 4) * 10
    ctx.stroke(curve([
      [x, y],
      [x + 2.5, y + 2 + jitter(variant, i + 8) * 2],
      [x + 1.4, y + 5.5],
    ] as Pt[]))
  }
  ctx.restore()
}

function paintClimb({ ctx, biome }: TileDrawArgs): void {
  const rope = cel(mix(biomePalette(biome).groundEdge, '#D8B87A', 0.4))
  for (const x of [3.4, TILE - 3.4]) {
    paint(ctx, roundRectPath(x - 0.9, -0.5, 1.8, TILE + 1, 0.9), rope, {
      shadow: 0.4, radius: 1, pivot: [x, TILE / 2], rim: 0.3, line: 0.35,
    })
  }
  for (const y of [3.5, 11.5]) {
    paint(ctx, roundRectPath(2.6, y - 0.8, TILE - 5.2, 1.6, 0.8), rope, {
      shadow: 0.35, radius: 1, pivot: [TILE / 2, y], rim: 0.3, line: 0.35,
    })
  }
}

const DEFAULT_PAINTERS: Record<number, TilePainter> = {
  [Tile.Solid]: paintSolid,
  [Tile.OneWay]: paintOneWay,
  [Tile.Brick]: paintBrick,
  [Tile.Question]: paintQuestion,
  [Tile.Used]: paintUsed,
  [Tile.Spike]: paintSpike,
  [Tile.Water]: paintWater,
  [Tile.SlopeUp45]: paintSlope(1),
  [Tile.SlopeDown45]: paintSlope(-1),
  [Tile.Decor]: paintDecor,
  [Tile.Ice]: paintIce,
  [Tile.Bouncy]: paintBouncy,
  [Tile.Crumble]: paintCrumble,
  [Tile.Climb]: paintClimb,
}
