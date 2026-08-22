import type { Biome, CrewId, SpriteSheet } from '../types'
import { buildCrewSheets } from './characters'
import { buildEnemySheets } from './enemies'
import { buildItemSheets } from './items'
import { buildEffectSheets } from './effects'
import { buildTileset, type Tileset } from './tiles'
import { buildBackground, type ParallaxLayer } from './backgrounds'

/**
 * Everything drawable, generated once at boot. There are no image files in this
 * project: the whole game is rasterised from code into offscreen canvases,
 * which keeps the bundle tiny and lets a palette change restyle every sprite.
 */
export interface ArtLibrary {
  crew: Record<CrewId, SpriteSheet>
  enemies: Record<string, SpriteSheet>
  items: Record<string, SpriteSheet>
  effects: Record<string, SpriteSheet>
  tilesets: Record<string, Tileset>
  backgrounds: Record<string, ParallaxLayer[]>
}

const BIOMES: Biome[] = ['east-blue', 'alabasta', 'skypiea', 'water7', 'thriller-bark', 'wano']

let cached: ArtLibrary | null = null

/**
 * Rasterise the art library. Yields to the event loop between groups so the
 * loading screen can animate instead of freezing on a long synchronous burn.
 */
export async function loadArt(onProgress?: (t: number, label: string) => void): Promise<ArtLibrary> {
  if (cached) return cached
  const yieldFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

  onProgress?.(0.05, 'Reuniendo a la tripulación')
  const crew = buildCrewSheets()
  await yieldFrame()

  onProgress?.(0.3, 'Desplegando a la Marina')
  const enemies = buildEnemySheets()
  await yieldFrame()

  onProgress?.(0.5, 'Repartiendo el tesoro')
  const items = buildItemSheets()
  const effects = buildEffectSheets()
  await yieldFrame()

  onProgress?.(0.62, 'Levantando islas')
  const tilesets: Record<string, Tileset> = {}
  for (const b of BIOMES) {
    tilesets[b] = buildTileset(b)
    await yieldFrame()
  }

  onProgress?.(0.85, 'Pintando el Grand Line')
  const backgrounds: Record<string, ParallaxLayer[]> = {}
  for (const b of BIOMES) {
    backgrounds[b] = buildBackground(b)
    await yieldFrame()
  }

  onProgress?.(1, '¡Zarpando!')
  cached = { crew, enemies, items, effects, tilesets, backgrounds }
  return cached
}

export function art(): ArtLibrary {
  if (!cached) throw new Error('loadArt() must complete before art() is used')
  return cached
}

export type { Tileset, ParallaxLayer }
