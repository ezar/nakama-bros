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
 * visibly repeat. `variant` may be any integer: `src` wraps it into whatever
 * range the id actually has, so callers can hand it a raw hash.
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

/**
 * How many cells each id gets, and what indexes them.
 *
 * `maskBits` names the neighbour bits the painter actually reads; the cell
 * index is those bits compacted, so an id that only cares whether its left and
 * right neighbours exist costs four cells instead of sixteen. Spending the
 * saving on `variants` is the whole reason this table exists: the crown — the
 * fringe of grass, crust and fungus that breaks the ground's top edge — is the
 * single most repeated thing on screen, and six variants of it is a picket
 * fence. Sixteen, mirrored by the renderer, is thirty-two.
 *
 * Ids whose look must *not* change from one placement to the next get one
 * variant. A question block is a piece of interface: the player has to
 * recognise it in a tenth of a second, and six subtly different ones read as a
 * rendering bug rather than as variety. Only natural terrain earns variants.
 */
interface Spec {
  maskBits: number
  variants: number
}

const N = 1
const E = 2
const S = 4
const W = 8

const ATLAS_SPECS: Record<number, Spec> = {
  [Tile.Solid]: { maskBits: N | E | S | W, variants: 8 },
  [Tile.Decor]: { maskBits: N | E | S | W, variants: 4 },
  [Tile.Ice]: { maskBits: N | E | S | W, variants: 4 },
  [Overlay.Crown]: { maskBits: E | W, variants: 16 },
  [Tile.Crumble]: { maskBits: S, variants: 6 },
  [Tile.SlopeUp45]: { maskBits: 0, variants: 4 },
  [Tile.SlopeDown45]: { maskBits: 0, variants: 4 },
  [Tile.OneWay]: { maskBits: 0, variants: 4 },
  [Tile.Brick]: { maskBits: 0, variants: 6 },
  [Tile.Climb]: { maskBits: 0, variants: 4 },
  [Tile.Question]: { maskBits: 0, variants: 1 },
  [Tile.Used]: { maskBits: 0, variants: 1 },
  [Tile.Spike]: { maskBits: 0, variants: 1 },
  [Tile.Bouncy]: { maskBits: 0, variants: 1 },
  [Tile.Water]: { maskBits: 0, variants: 1 },
}

/** Every id the atlas holds art for. */
export const ATLAS_IDS: number[] = Object.keys(ATLAS_SPECS).map(Number)

/**
 * The largest variant count in the table, reported as `Tileset.variants`.
 *
 * It is a hint for callers that want to spread tiles across the whole range;
 * `src` wraps per id, so passing a value beyond an id's own count is safe.
 */
export const VARIANTS = 16

/** Cells across the sheet. */
const COLS = 16

/** Compact the significant bits of a mask down to a dense cell index. */
function maskIndex(mask: number, bits: number): number {
  let idx = 0
  let k = 0
  for (let b = 0; b < 4; b++) {
    if (!(bits & (1 << b))) continue
    if (mask & (1 << b)) idx |= 1 << k
    k++
  }
  return idx
}

const cellCount = (bits: number): number => 1 << ((bits & 1) + ((bits >> 1) & 1) + ((bits >> 2) & 1) + ((bits >> 3) & 1))

interface Plan extends Spec {
  base: number
  masks: number
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
    const spec = ATLAS_SPECS[id]
    const masks = cellCount(spec.maskBits)
    plan.set(id, { ...spec, base: slots, masks })
    slots += masks * spec.variants
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
      // Expand the compact index back into a real mask so painters keep reading
      // the bit they care about rather than a packed number.
      let full = 0
      let k = 0
      for (let b = 0; b < 4; b++) {
        if (!(e.maskBits & (1 << b))) continue
        if (m & (1 << k)) full |= 1 << b
        k++
      }
      for (let v = 0; v < e.variants; v++) {
        const slot = e.base + m * e.variants + v
        scratch.ctx.save()
        scratch.ctx.setTransform(1, 0, 0, 1, 0, 0)
        scratch.ctx.clearRect(0, 0, scratch.pw, scratch.ph)
        scratch.ctx.restore()
        scratch.ctx.save()
        painter({ s: scratch, ctx: scratch.ctx, mask: full, variant: v, biome })
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
      const m = maskIndex(mask, e.maskBits)
      const v = ((variant % e.variants) + e.variants) % e.variants
      const slot = e.base + m * e.variants + v
      return { sx: (slot % COLS) * cellPx, sy: Math.floor(slot / COLS) * cellPx }
    },
  }
}
