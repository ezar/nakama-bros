import type { Biome, CrewId, SpriteSheet } from '../types'
import { buildCrewSheets } from './characters'
import { buildEnemySheets } from './enemies'
import { buildItemSheets } from './items'
import { buildEffectSheets } from './effects'
import { buildTileset, type Tileset } from './tiles'
import { buildBackground, buildForeground, type ParallaxLayer } from './backgrounds'

/**
 * Everything drawable, rasterised from code — there are no image files in this
 * project.
 *
 * Sheets that every level needs (crew, enemies, items, effects) are built up
 * front behind the loading screen. Per-biome terrain and backdrops are built
 * the first time a level in that biome is entered: at this resolution a single
 * biome's tile atlas is several megabytes, so building all six eagerly would
 * cost more memory than the rest of the game put together.
 */
export interface ArtLibrary {
  crew: Record<CrewId, SpriteSheet>
  enemies: Record<string, SpriteSheet>
  items: Record<string, SpriteSheet>
  effects: Record<string, SpriteSheet>
}

let cached: ArtLibrary | null = null
const tilesetCache = new Map<string, Tileset>()
const backgroundCache = new Map<string, ParallaxLayer[]>()
const foregroundCache = new Map<string, ParallaxLayer[]>()

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

export async function loadArt(onProgress?: (t: number, label: string) => void): Promise<ArtLibrary> {
  if (cached) return cached

  onProgress?.(0.08, 'Reuniendo a la tripulación')
  await nextFrame()
  const crew = buildCrewSheets()

  onProgress?.(0.55, 'Desplegando a la Marina')
  await nextFrame()
  const enemies = buildEnemySheets()

  onProgress?.(0.82, 'Repartiendo el tesoro')
  await nextFrame()
  const items = buildItemSheets()
  const effects = buildEffectSheets()

  onProgress?.(1, '¡Zarpando!')
  await nextFrame()
  cached = { crew, enemies, items, effects }
  window.__ART__ = cached
  return cached
}

export function art(): ArtLibrary {
  if (!cached) throw new Error('loadArt() must complete before art() is used')
  return cached
}

declare global {
  interface Window {
    /** Debug handle: lets the capture scripts render sheets at any zoom. */
    __ART__?: ArtLibrary
  }
}

/** Terrain atlas for a biome, built on first use. */
export function tilesetFor(biome: Biome): Tileset {
  let ts = tilesetCache.get(biome)
  if (!ts) {
    ts = buildTileset(biome)
    tilesetCache.set(biome, ts)
  }
  return ts
}

/** Parallax stack behind the world, built on first use. */
export function backgroundFor(biome: Biome): ParallaxLayer[] {
  let bg = backgroundCache.get(biome)
  if (!bg) {
    bg = buildBackground(biome)
    backgroundCache.set(biome, bg)
  }
  return bg
}

/** Parallax layers drawn in front of the world, built on first use. */
export function foregroundFor(biome: Biome): ParallaxLayer[] {
  let fg = foregroundCache.get(biome)
  if (!fg) {
    fg = buildForeground(biome)
    foregroundCache.set(biome, fg)
  }
  return fg
}

/** Warm the per-biome caches before a level starts, so play never hitches. */
export async function prepareBiome(biome: Biome): Promise<void> {
  if (!tilesetCache.has(biome)) {
    tilesetFor(biome)
    await nextFrame()
  }
  if (!backgroundCache.has(biome)) {
    backgroundFor(biome)
    await nextFrame()
  }
  if (!foregroundCache.has(biome)) {
    foregroundFor(biome)
    await nextFrame()
  }
}

export type { Tileset, ParallaxLayer }
