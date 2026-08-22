import { Tile, type TileFlags } from '../types'

const def = (o: Partial<TileFlags>): TileFlags => ({
  solid: false,
  oneWay: false,
  hazard: false,
  liquid: false,
  climbable: false,
  breakable: false,
  slope: 0,
  slipperiness: 0,
  bounce: 0,
  ...o,
})

/** Behaviour table for every tile id. Indexed by `Tile`. */
export const TILE_FLAGS: Record<number, TileFlags> = {
  [Tile.Empty]: def({}),
  [Tile.Solid]: def({ solid: true }),
  [Tile.OneWay]: def({ oneWay: true }),
  [Tile.Brick]: def({ solid: true, breakable: true }),
  [Tile.Question]: def({ solid: true }),
  [Tile.Used]: def({ solid: true }),
  [Tile.Spike]: def({ hazard: true }),
  [Tile.Water]: def({ liquid: true }),
  [Tile.SlopeUp45]: def({ solid: true, slope: 1 }),
  [Tile.SlopeDown45]: def({ solid: true, slope: -1 }),
  [Tile.Decor]: def({}),
  [Tile.Ice]: def({ solid: true, slipperiness: 0.93 }),
  [Tile.Bouncy]: def({ solid: true, bounce: 330 }),
  [Tile.Crumble]: def({ solid: true, breakable: true }),
  [Tile.Climb]: def({ climbable: true }),
}

export const flagsFor = (id: number): TileFlags => TILE_FLAGS[id] ?? TILE_FLAGS[Tile.Empty]

export const isSolid = (id: number): boolean => flagsFor(id).solid
export const isSlope = (id: number): boolean => flagsFor(id).slope !== 0
export const isOneWay = (id: number): boolean => flagsFor(id).oneWay
