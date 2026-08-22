import { ART_SCALE, TILE, Tile } from '../types'
import type { Biome } from '../types'
import { createSurface } from './ink'
import {
  DEFAULT_PAINTERS,
  Overlay,
  hash2,
  paintSolid,
  terrainOf,
  type TileDrawArgs,
  type TilePainter,
} from './tilePainters'

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

export type { TileDrawArgs, TilePainter }
export { Overlay, hash2, terrainOf }

/** Ids that vary with their neighbours and therefore need all 16 mask cells. */
export const AUTOTILED: number[] = [
  Tile.Solid, Tile.Ice, Tile.Decor, Tile.Crumble, Overlay.Crown,
]

/**
 * Ids whose look must not change from one placement to the next.
 *
 * A question block is a piece of interface: the player has to recognise it in a
 * tenth of a second, and six subtly different ones read as a rendering bug
 * rather than as variety. Only natural terrain earns variants.
 */
export const UNIFORM: number[] = [
  Tile.Question, Tile.Used, Tile.Spike, Tile.Bouncy, Tile.Water,
]

/** Every id the atlas holds art for. */
export const ATLAS_IDS: number[] = [
  Tile.Solid, Tile.OneWay, Tile.Brick, Tile.Question, Tile.Used, Tile.Spike,
  Tile.Water, Tile.SlopeUp45, Tile.SlopeDown45, Tile.Decor, Tile.Ice,
  Tile.Bouncy, Tile.Crumble, Tile.Climb, Overlay.Crown,
]

/**
 * Variants per terrain id.
 *
 * Six, not three: three is small enough that the eye locks onto the cycle
 * within a screen's width. The renderer also mirrors symmetric tiles from a
 * hash bit, which doubles the effective count to twelve for the cost of one
 * transform.
 */
export const VARIANTS = 6

/** Cells across the sheet. Sixteen keeps a full mask set on a whole number of rows. */
const COLS = 16

interface Plan {
  base: number
  masks: number
  variants: number
}

/**
 * Builds the atlas.
 *
 * The sheet is packed as a flat run of cells wrapped at `COLS`, not as one row
 * per id: the old layout gave every id sixteen mask columns whether it used
 * them or not, so eleven of the fourteen rows were the same picture repeated
 * sixteen times. Packing by slot spends that memory on variants instead.
 */
export function buildTileset(
  biome: Biome,
  painters: Partial<Record<number, TilePainter>> = {},
): Tileset {
  const cellPx = TILE * ART_SCALE

  const plan = new Map<number, Plan>()
  let slots = 0
  for (const id of ATLAS_IDS) {
    const masks = AUTOTILED.includes(id) ? 16 : 1
    const variants = UNIFORM.includes(id) ? 1 : VARIANTS
    plan.set(id, { base: slots, masks, variants })
    slots += masks * variants
  }

  const rows = Math.ceil(slots / COLS)
  const sheet = document.createElement('canvas')
  sheet.width = COLS * cellPx
  sheet.height = rows * cellPx
  const sctx = sheet.getContext('2d')!
  sctx.imageSmoothingEnabled = true
  sctx.imageSmoothingQuality = 'high'

  // One scratch surface for the whole build. Allocating a canvas per cell was
  // most of the old build cost, and at five hundred cells it is the difference
  // between a hitch and a frame.
  const scratch = createSurface(TILE, TILE)

  for (const id of ATLAS_IDS) {
    const e = plan.get(id)!
    const painter = painters[id] ?? DEFAULT_PAINTERS[id] ?? paintSolid
    for (let m = 0; m < e.masks; m++) {
      for (let v = 0; v < e.variants; v++) {
        const slot = e.base + m * e.variants + v
        scratch.ctx.save()
        scratch.ctx.setTransform(1, 0, 0, 1, 0, 0)
        scratch.ctx.clearRect(0, 0, scratch.pw, scratch.ph)
        scratch.ctx.restore()
        scratch.ctx.save()
        painter({ s: scratch, ctx: scratch.ctx, mask: m, variant: v, biome })
        scratch.ctx.restore()
        sctx.drawImage(
          scratch.canvas,
          (slot % COLS) * cellPx,
          Math.floor(slot / COLS) * cellPx,
        )
      }
    }
  }

  return {
    image: sheet,
    cellPx,
    variants: VARIANTS,
    src(id, mask, variant) {
      const e = plan.get(id) ?? plan.get(Tile.Solid)!
      const m = e.masks === 1 ? 0 : mask & 15
      const v = e.variants === 1 ? 0 : ((variant % e.variants) + e.variants) % e.variants
      const slot = e.base + m * e.variants + v
      return { sx: (slot % COLS) * cellPx, sy: Math.floor(slot / COLS) * cellPx }
    },
  }
}
