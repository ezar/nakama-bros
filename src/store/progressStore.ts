import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CrewId, LevelResult } from '../types'

export interface LevelRecord {
  cleared: boolean
  bestScore: number
  bestTimeLeft: number
  fragments: number
}

interface ProgressState {
  crew: CrewId
  records: Record<string, LevelRecord>
  totalBerries: number
  setCrew: (c: CrewId) => void
  record: (r: LevelResult) => void
  isCleared: (id: string) => boolean
  reset: () => void
}

export const useProgress = create<ProgressState>()(
  persist(
    (set, get) => ({
      crew: 'luffy',
      records: {},
      totalBerries: 0,
      setCrew: (crew) => set({ crew }),
      record: (r) =>
        set((s) => {
          const prev = s.records[r.levelId]
          return {
            totalBerries: s.totalBerries + r.berries,
            records: {
              ...s.records,
              [r.levelId]: {
                cleared: prev?.cleared || r.cleared,
                bestScore: Math.max(prev?.bestScore ?? 0, r.score),
                bestTimeLeft: Math.max(prev?.bestTimeLeft ?? 0, r.timeLeft),
                fragments: Math.max(prev?.fragments ?? 0, r.fragments),
              },
            },
          }
        }),
      isCleared: (id) => get().records[id]?.cleared ?? false,
      reset: () => set({ records: {}, totalBerries: 0 }),
    }),
    { name: 'nakama-bros:progress' },
  ),
)
