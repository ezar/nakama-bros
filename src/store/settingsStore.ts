import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Difficulty } from '../types'

export type Lang = 'es' | 'en'

interface SettingsState {
  master: number
  music: number
  sfx: number
  lang: Lang
  /** Show the on-screen controls even on a device with a keyboard. */
  touchControls: 'auto' | 'on' | 'off'
  /** Screen shake and heavy particle effects. */
  effects: 'full' | 'reduced'
  crt: boolean
  /** How forgiving a run is. Read once, when a level starts. */
  difficulty: Difficulty
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      master: 0.8,
      music: 0.5,
      sfx: 0.85,
      lang: 'es',
      touchControls: 'auto',
      effects: 'full',
      crt: false,
      difficulty: 'normal',
      set: (patch) => set(patch),
    }),
    { name: 'nakama-bros:settings' },
  ),
)
