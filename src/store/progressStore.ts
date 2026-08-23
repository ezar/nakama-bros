import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { CREW_IDS } from '../game/config'
import type { CrewId, LevelResult } from '../types'

/**
 * Save format version.
 *
 * Bump this whenever the *shape* of what is stored changes, and add a step to
 * `migrate` for it. Version 1 is the first numbered format; anything written
 * before this existed reports version 0 and is read as-is, because its shape
 * was already this one — what changed in that era was which level ids exist,
 * and an id nobody recognises is harmless: the chart only ever looks up the
 * ids it knows about, so an old record for a renamed stage is ignored rather
 * than believed.
 */
const SAVE_VERSION = 1

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

/**
 * Read a persisted save defensively.
 *
 * This runs on whatever is in the browser's storage, which is not necessarily
 * anything this game wrote: it survives across versions, it can be edited by
 * hand, and it can be left half-written by a tab that died mid-save. A single
 * bad field used to be enough to put the game somewhere it could not draw
 * itself out of, and there is no way for a player to recover from that except
 * clearing site data — which also takes the drawing away. So every field is
 * checked, and anything that fails falls back to the fresh-save value rather
 * than reaching the rest of the game.
 */
export function migrateProgress(persisted: unknown, _from: number): Partial<ProgressState> {
  const s = (persisted ?? {}) as Record<string, unknown>
  const records: Record<string, LevelRecord> = {}
  const raw = s.records
  if (raw && typeof raw === 'object') {
    for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue
      const r = value as Record<string, unknown>
      records[id] = {
        cleared: r.cleared === true,
        bestScore: Math.max(0, num(r.bestScore, 0)),
        bestTimeLeft: Math.max(0, num(r.bestTimeLeft, 0)),
        fragments: Math.max(0, Math.min(3, Math.round(num(r.fragments, 0)))),
      }
    }
  }
  return {
    crew: CREW_IDS.includes(s.crew as CrewId) ? (s.crew as CrewId) : 'luffy',
    records,
    totalBerries: Math.max(0, num(s.totalBerries, 0)),
    giftEarned: s.giftEarned === true,
  }
}

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
    {
      name: 'nakama-bros:progress',
      version: SAVE_VERSION,
      migrate: migrateProgress,
    },
  ),
)
