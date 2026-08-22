import type { LevelDef, WorldDef } from '../../types'
import { eastBlue1, eastBlue2, eastBlue3 } from './eastBlue'
import { alabasta1, alabasta2 } from './alabasta'
import { skypiea1, skypiea2 } from './skypiea'
import { water71, water72 } from './water7'
import { thrillerBark1, thrillerBark2 } from './thrillerBark'
import { wano1, wano2, wano3 } from './wano'

/**
 * The campaign.
 *
 * Worlds are ordered by the Grand Line route; each island holds two stages, and
 * the two islands that end an arc hold a third that is a boss. Levels are plain
 * data, so a stage can be tuned without touching a line of engine code.
 */
export const WORLDS: WorldDef[] = [
  {
    id: 'east-blue',
    name: 'East Blue',
    biome: 'east-blue',
    levels: [eastBlue1, eastBlue2, eastBlue3],
  },
  {
    id: 'alabasta',
    name: 'Alabasta',
    biome: 'alabasta',
    levels: [alabasta1, alabasta2],
  },
  {
    id: 'skypiea',
    name: 'Skypiea',
    biome: 'skypiea',
    levels: [skypiea1, skypiea2],
  },
  {
    id: 'water7',
    name: 'Water 7',
    biome: 'water7',
    levels: [water71, water72],
  },
  {
    id: 'thriller-bark',
    name: 'Thriller Bark',
    biome: 'thriller-bark',
    levels: [thrillerBark1, thrillerBark2],
  },
  {
    id: 'wano',
    name: 'Wano',
    biome: 'wano',
    levels: [wano1, wano2, wano3],
  },
]

export const ALL_LEVELS: LevelDef[] = WORLDS.flatMap((w) => w.levels)

export const levelById = (id: string): LevelDef | undefined =>
  ALL_LEVELS.find((l) => l.id === id)

export const nextLevelId = (id: string): string | null => {
  const i = ALL_LEVELS.findIndex((l) => l.id === id)
  return i >= 0 && i < ALL_LEVELS.length - 1 ? ALL_LEVELS[i + 1].id : null
}

/** The world a stage belongs to — the map screen groups by island. */
export const worldOf = (id: string): WorldDef | undefined =>
  WORLDS.find((w) => w.levels.some((l) => l.id === id))

// A handle for the capture harness, alongside `__ART__` and `__NAKAMA__`.
// `scripts/levelshots.mjs` rotates this array before the title screen starts a
// run, which is the only way to frame a stage other than the first one.
if (typeof window !== 'undefined') {
  ;(window as unknown as { __LEVELS__?: LevelDef[] }).__LEVELS__ = ALL_LEVELS
}

export {
  eastBlue1, eastBlue2, eastBlue3, alabasta1, alabasta2, skypiea1, skypiea2, water71, water72,
  thrillerBark1, thrillerBark2, wano1, wano2, wano3,
}
