import { TILE } from '../../types'
import type { LevelDef } from '../../types'
import { TileMap } from '../../physics/TileMap'
import { decodeRows } from './tileCodec'
import { createEntity } from '../entities/registry'
import type { Entity } from '../entities/Entity'

/** A level definition instantiated into a live tilemap plus its spawn list. */
export class Level {
  readonly def: LevelDef
  readonly map: TileMap

  constructor(def: LevelDef) {
    this.def = def
    this.map = new TileMap(def.w, def.h, decodeRows(def.rows, def.w, def.h))
  }

  /** World-space player start (bottom-centre of the hitbox). */
  get startPos(): { x: number; y: number } {
    return { x: this.def.startX * TILE + TILE / 2, y: this.def.startY * TILE + TILE }
  }

  /**
   * Build every entity declared by the level. Spawn coordinates are given in
   * tiles and resolve to the bottom-centre of the tile, matching entity origins.
   */
  buildEntities(): Entity[] {
    const out: Entity[] = []
    for (const s of this.def.spawns) {
      const e = createEntity(s, s.tx * TILE + TILE / 2, s.ty * TILE + TILE)
      if (e) out.push(e)
    }
    return out
  }
}
