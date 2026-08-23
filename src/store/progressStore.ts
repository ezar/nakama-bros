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
  /**
   * Whether the drawing has been earned. Set the first time a stage is cleared
   * at rank S, which needs every fragment in it *and* a run without dying — so
   * it is a thing you win once, and then keep.
   */
  giftEarned: boolean
  setCrew: (c: CrewId) => void
  record: (r: LevelResult) => void
  earnGift: () => void
  isCleared: (id: string) => boolean
  reset: () => void
}

export const useProgress = create<ProgressState>()(
  persist(
    (set, get) => ({
      crew: 'luffy',
      records: {},
      totalBerries: 0,
      giftEarned: false,
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
      // The rank lives in the UI, where the result is presented, so the unlock
      // is pushed in rather than derived here — the store stays free of both
      // the scoring rules and the screens that draw them.
      earnGift: () => { if (!get().giftEarned) set({ giftEarned: true }) },
      isCleared: (id) => get().records[id]?.cleared ?? false,
      // Records and takings only. `giftEarned` survives on purpose: wiping
      // your progress to play the campaign again should not take a present
      // away from you.
      reset: () => set({ records: {}, totalBerries: 0 }),
    }),
    { name: 'nakama-bros:progress' },
  ),
)
