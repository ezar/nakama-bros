import { Tile } from '../../types'

/**
 * Levels are authored as ASCII so they are diffable and hand-editable.
 * One character per tile; unknown characters decode to Empty.
 */
export const CHAR_TO_TILE: Record<string, number> = {
  '.': Tile.Empty,
  ' ': Tile.Empty,
  '#': Tile.Solid,
  '-': Tile.OneWay,
  B: Tile.Brick,
  '?': Tile.Question,
  U: Tile.Used,
  '^': Tile.Spike,
  '~': Tile.Water,
  '/': Tile.SlopeUp45,
  '\\': Tile.SlopeDown45,
  ':': Tile.Decor,
  I: Tile.Ice,
  O: Tile.Bouncy,
  C: Tile.Crumble,
  H: Tile.Climb,
  '%': Tile.Fake,
  // Never authored — the game writes it at runtime. It has a character anyway
  // so a map that is encoded mid-run round-trips instead of losing the tile.
  '&': Tile.FakeSeen,
}

export const TILE_TO_CHAR: Record<number, string> = Object.entries(CHAR_TO_TILE).reduce(
  (acc, [c, t]) => {
    if (acc[t] === undefined) acc[t] = c
    return acc
  },
  {} as Record<number, string>,
)

export function decodeRows(rows: string[], w: number, h: number): Uint8Array {
  const data = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const row = rows[y] ?? ''
    for (let x = 0; x < w; x++) {
      data[y * w + x] = CHAR_TO_TILE[row[x] ?? '.'] ?? Tile.Empty
    }
  }
  return data
}
