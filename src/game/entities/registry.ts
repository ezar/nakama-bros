import type { SpawnDef } from '../../types'
import type { Entity } from './Entity'

export type EntityFactory = (x: number, y: number, opts: SpawnDef['opts']) => Entity

const registry = new Map<string, EntityFactory>()

/**
 * Enemies, items and props register themselves here at module load, so adding
 * a new spawnable type never means editing the level loader.
 */
export function registerEntity(type: string, factory: EntityFactory): void {
  registry.set(type, factory)
}

export function createEntity(def: SpawnDef, x: number, y: number): Entity | null {
  const f = registry.get(def.type)
  if (!f) {
    if (import.meta.env.DEV) console.warn(`[spawn] unknown entity type "${def.type}"`)
    return null
  }
  return f(x, y, def.opts)
}

export function registeredTypes(): string[] {
  return [...registry.keys()].sort()
}
