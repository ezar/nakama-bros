import { TILE, Tile } from '../types'
import { flagsFor } from './tileFlags'
import type { TileFlags } from '../types'

/**
 * The static collision + rendering grid for a level. Mutable: bricks break and
 * question blocks flip to used, so consumers must read through `get`.
 */
export class TileMap {
  readonly w: number
  readonly h: number
  private data: Uint8Array
  /** Bumped whenever a tile changes, so cached tile renders can invalidate. */
  version = 0

  constructor(w: number, h: number, data?: Uint8Array) {
    this.w = w
    this.h = h
    this.data = data ?? new Uint8Array(w * h)
  }

  /** Out-of-bounds reads return Empty above/below and Solid on the sides, so
   *  the player cannot walk off the left edge but can still jump off-screen. */
  get(tx: number, ty: number): number {
    if (tx < 0 || tx >= this.w) return Tile.Solid
    if (ty < 0 || ty >= this.h) return Tile.Empty
    return this.data[ty * this.w + tx]
  }

  set(tx: number, ty: number, id: number): void {
    if (tx < 0 || tx >= this.w || ty < 0 || ty >= this.h) return
    this.data[ty * this.w + tx] = id
    this.version++
  }

  flags(tx: number, ty: number): TileFlags {
    return flagsFor(this.get(tx, ty))
  }

  /** World-space pixel width / height. */
  get pixelW(): number {
    return this.w * TILE
  }

  get pixelH(): number {
    return this.h * TILE
  }

  /** Tile coordinate containing a world-space x (or y). */
  static toTile(v: number): number {
    return Math.floor(v / TILE)
  }

  /** Iterate the tiles overlapping a world-space rect. */
  forEachIn(
    x: number,
    y: number,
    w: number,
    h: number,
    fn: (tx: number, ty: number, id: number) => void,
  ): void {
    const x0 = Math.floor(x / TILE)
    const x1 = Math.floor((x + w - 0.001) / TILE)
    const y0 = Math.floor(y / TILE)
    const y1 = Math.floor((y + h - 0.001) / TILE)
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        fn(tx, ty, this.get(tx, ty))
      }
    }
  }

  /** True when any tile overlapping the rect satisfies `pred`. */
  anyIn(
    x: number,
    y: number,
    w: number,
    h: number,
    pred: (f: TileFlags, id: number, tx: number, ty: number) => boolean,
  ): boolean {
    const x0 = Math.floor(x / TILE)
    const x1 = Math.floor((x + w - 0.001) / TILE)
    const y0 = Math.floor(y / TILE)
    const y1 = Math.floor((y + h - 0.001) / TILE)
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const id = this.get(tx, ty)
        if (pred(flagsFor(id), id, tx, ty)) return true
      }
    }
    return false
  }

  raw(): Uint8Array {
    return this.data
  }
}
