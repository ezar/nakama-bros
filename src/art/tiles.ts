import { TILE, Tile } from '../types'
import type { Biome } from '../types'
import { createSurface, px, mix, dither, grain, type Surface } from './pixel'
import { biomePalette } from './palette'

/**
 * A biome's tile atlas.
 *
 * Tiles are autotiled: the renderer passes a 4-bit neighbour mask (N=1, E=2,
 * S=4, W=8) so edges, corners and interior fills all come from the same id, and
 * a variant index so long stretches of ground do not visibly repeat.
 */
export interface Tileset {
  image: CanvasImageSource
  cell: number
  variants: number
  src(id: number, mask: number, variant: number): { sx: number; sy: number }
}

/** Tile ids that participate in autotiling and therefore need 16 mask cells. */
export const AUTOTILED: number[] = [Tile.Solid, Tile.Ice, Tile.Decor]

/** Every id the atlas holds a drawing for, in atlas row order. */
export const ATLAS_IDS: number[] = [
  Tile.Solid,
  Tile.OneWay,
  Tile.Brick,
  Tile.Question,
  Tile.Used,
  Tile.Spike,
  Tile.Water,
  Tile.SlopeUp45,
  Tile.SlopeDown45,
  Tile.Decor,
  Tile.Ice,
  Tile.Bouncy,
  Tile.Crumble,
  Tile.Climb,
]

const VARIANTS = 3

export interface TileDrawArgs {
  s: Surface
  ctx: CanvasRenderingContext2D
  /** 4-bit neighbour mask: N=1, E=2, S=4, W=8. A set bit means "same tile there". */
  mask: number
  variant: number
  biome: Biome
}

/** Signature every per-tile painter implements. `src/art/tiles/*` fill these in. */
export type TilePainter = (a: TileDrawArgs) => void

/**
 * Assemble the atlas. Row order follows `ATLAS_IDS`; each row holds
 * 16 masks × VARIANTS cells.
 */
export function buildTileset(biome: Biome, painters: Partial<Record<number, TilePainter>> = {}): Tileset {
  const cols = 16 * VARIANTS
  const rows = ATLAS_IDS.length
  const sheet = createSurface(cols * TILE, rows * TILE)
  const index = new Map<number, number>()
  ATLAS_IDS.forEach((id, i) => index.set(id, i))

  for (let r = 0; r < rows; r++) {
    const id = ATLAS_IDS[r]
    const painter = painters[id] ?? defaultPainters[id] ?? paintSolid
    const masks = AUTOTILED.includes(id) ? 16 : 1
    for (let mask = 0; mask < 16; mask++) {
      for (let v = 0; v < VARIANTS; v++) {
        const cell = createSurface(TILE, TILE)
        painter({ s: cell, ctx: cell.ctx, mask: mask % masks, variant: v, biome })
        sheet.ctx.drawImage(cell.canvas, (mask * VARIANTS + v) * TILE, r * TILE)
      }
    }
  }

  return {
    image: sheet.canvas,
    cell: TILE,
    variants: VARIANTS,
    src(id: number, mask: number, variant: number) {
      const row = index.get(id) ?? 0
      const m = AUTOTILED.includes(id) ? mask & 15 : 0
      const v = ((variant % VARIANTS) + VARIANTS) % VARIANTS
      return { sx: (m * VARIANTS + v) * TILE, sy: row * TILE }
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Baseline painters. `src/art/tilePainters.ts` overrides these per biome with
// the finished art; these keep the game renderable while that work lands.
// ─────────────────────────────────────────────────────────────────────────────

function paintSolid({ ctx, mask, variant, biome }: TileDrawArgs): void {
  const p = biomePalette(biome)
  const exposedTop = (mask & 1) === 0
  px(ctx, 0, 0, TILE, TILE, p.groundDeep)
  dither(ctx, 0, 0, TILE, TILE, p.groundDeep, mix(p.groundDeep, p.ground, 0.4), 0.35)
  if (exposedTop) {
    px(ctx, 0, 0, TILE, 4, p.ground)
    px(ctx, 0, 4, TILE, 1, mix(p.ground, p.groundDeep, 0.5))
    px(ctx, 0, 0, TILE, 1, mix(p.ground, '#FFFFFF', 0.28))
  }
  if ((mask & 8) === 0) px(ctx, 0, 0, 1, TILE, mix(p.groundDeep, '#000000', 0.25))
  if ((mask & 2) === 0) px(ctx, TILE - 1, 0, 1, TILE, mix(p.groundDeep, '#000000', 0.25))
  grain(ctx, 0, 0, TILE, TILE, p.groundEdge, 0.1, 7 + variant * 31)
}

function paintOneWay({ ctx, biome }: TileDrawArgs): void {
  const p = biomePalette(biome)
  px(ctx, 0, 0, TILE, 5, p.groundEdge)
  px(ctx, 0, 0, TILE, 1, mix(p.groundEdge, '#FFFFFF', 0.35))
  px(ctx, 0, 4, TILE, 1, mix(p.groundEdge, '#000000', 0.4))
}

function paintBrick({ ctx, biome }: TileDrawArgs): void {
  const p = biomePalette(biome)
  px(ctx, 0, 0, TILE, TILE, p.groundEdge)
  px(ctx, 0, 0, TILE, 1, mix(p.groundEdge, '#FFFFFF', 0.3))
  px(ctx, 0, TILE - 1, TILE, 1, mix(p.groundEdge, '#000000', 0.35))
  for (const y of [4, 11]) px(ctx, 0, y, TILE, 1, mix(p.groundEdge, '#000000', 0.4))
  px(ctx, 7, 0, 1, 4, mix(p.groundEdge, '#000000', 0.4))
  px(ctx, 3, 5, 1, 6, mix(p.groundEdge, '#000000', 0.4))
  px(ctx, 11, 5, 1, 6, mix(p.groundEdge, '#000000', 0.4))
}

function paintQuestion({ ctx }: TileDrawArgs): void {
  px(ctx, 0, 0, TILE, TILE, '#B8942E')
  px(ctx, 1, 1, TILE - 2, TILE - 2, '#F4C542')
  px(ctx, 1, 1, TILE - 2, 1, '#FFE9A8')
  px(ctx, 6, 4, 4, 2, '#5A3820')
  px(ctx, 9, 5, 2, 3, '#5A3820')
  px(ctx, 7, 7, 3, 2, '#5A3820')
  px(ctx, 7, 10, 2, 2, '#5A3820')
}

function paintUsed({ ctx }: TileDrawArgs): void {
  px(ctx, 0, 0, TILE, TILE, '#5A3820')
  px(ctx, 1, 1, TILE - 2, TILE - 2, '#8A5A32')
  px(ctx, 1, 1, TILE - 2, 1, '#C08B52')
}

function paintSpike({ ctx }: TileDrawArgs): void {
  for (let i = 0; i < 4; i++) {
    const x = i * 4
    for (let y = 0; y < 8; y++) {
      const w = Math.max(1, Math.round((y / 8) * 4))
      px(ctx, x + 2 - w / 2, TILE - 1 - y, w, 1, y < 3 ? '#EDEFF5' : '#9AA8C4')
    }
  }
  px(ctx, 0, TILE - 2, TILE, 2, '#5C6A8C')
}

function paintWater({ ctx, variant }: TileDrawArgs): void {
  px(ctx, 0, 0, TILE, TILE, 'rgba(19,106,138,0.62)')
  dither(ctx, 0, 0, TILE, TILE, 'rgba(19,106,138,0.0)', 'rgba(47,168,196,0.35)', 0.4 + variant * 0.1)
}

function paintSlope(dir: 1 | -1): TilePainter {
  return ({ ctx, biome }) => {
    const p = biomePalette(biome)
    for (let x = 0; x < TILE; x++) {
      const surface = dir === 1 ? TILE - x : x
      px(ctx, x, surface, 1, TILE - surface, p.groundDeep)
      px(ctx, x, surface, 1, 3, p.ground)
      px(ctx, x, surface, 1, 1, mix(p.ground, '#FFFFFF', 0.3))
    }
  }
}

function paintDecor({ ctx, biome, variant }: TileDrawArgs): void {
  const p = biomePalette(biome)
  px(ctx, 0, 0, TILE, TILE, mix(p.groundDeep, p.fog, 0.45))
  grain(ctx, 0, 0, TILE, TILE, p.groundDeep, 0.18, 13 + variant * 17)
}

function paintIce({ ctx, mask }: TileDrawArgs): void {
  px(ctx, 0, 0, TILE, TILE, '#6FA8C4')
  dither(ctx, 0, 0, TILE, TILE, '#6FA8C4', '#BFE9F5', 0.4)
  if ((mask & 1) === 0) px(ctx, 0, 0, TILE, 2, '#E8FAFF')
}

function paintBouncy({ ctx }: TileDrawArgs): void {
  px(ctx, 0, 2, TILE, TILE - 2, '#2F6B33')
  px(ctx, 0, 0, TILE, 3, '#4FA843')
  px(ctx, 0, 0, TILE, 1, '#8FE07A')
  px(ctx, 2, 5, 3, 2, '#2F6B33')
  px(ctx, 11, 5, 3, 2, '#2F6B33')
}

function paintCrumble({ ctx, biome }: TileDrawArgs): void {
  const p = biomePalette(biome)
  px(ctx, 0, 0, TILE, TILE, mix(p.groundEdge, p.groundDeep, 0.35))
  for (const [x, y, w, h] of [
    [2, 3, 5, 1], [9, 6, 4, 1], [4, 10, 6, 1], [1, 8, 2, 1], [12, 12, 3, 1],
  ]) {
    px(ctx, x, y, w, h, mix(p.groundDeep, '#000000', 0.4))
  }
}

function paintClimb({ ctx, biome }: TileDrawArgs): void {
  const p = biomePalette(biome)
  px(ctx, 2, 0, 2, TILE, p.groundEdge)
  px(ctx, TILE - 4, 0, 2, TILE, p.groundEdge)
  px(ctx, 2, 3, TILE - 4, 2, mix(p.groundEdge, '#FFFFFF', 0.2))
  px(ctx, 2, 11, TILE - 4, 2, mix(p.groundEdge, '#FFFFFF', 0.2))
}

const defaultPainters: Record<number, TilePainter> = {
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
