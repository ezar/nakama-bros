import type { LevelDef, WorldDef } from '../../types'
import { eastBlue1 } from './eastBlue1'

/**
 * The campaign.
 *
 * Worlds are ordered by the Grand Line route; each holds three stages and a
 * boss stage. Levels are plain data, so a stage can be tuned without touching
 * a line of engine code.
 */
export const WORLDS: WorldDef[] = [
  {
    id: 'east-blue',
    name: 'East Blue',
    biome: 'east-blue',
    levels: [eastBlue1],
  },
]

export const ALL_LEVELS: LevelDef[] = WORLDS.flatMap((w) => w.levels)

export const levelById = (id: string): LevelDef | undefined =>
  ALL_LEVELS.find((l) => l.id === id)

export const nextLevelId = (id: string): string | null => {
  const i = ALL_LEVELS.findIndex((l) => l.id === id)
  return i >= 0 && i < ALL_LEVELS.length - 1 ? ALL_LEVELS[i + 1].id : null
}

export { eastBlue1 }
