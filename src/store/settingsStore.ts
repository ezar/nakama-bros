import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DIFFICULTIES } from '../game/config'
import type { Difficulty } from '../types'

export type Lang = 'es' | 'en'

/** See `SAVE_VERSION` in the progress store — same contract, same reasoning. */
const SETTINGS_VERSION = 1

const DEFAULTS = {
  master: 0.8,
  music: 0.5,
  sfx: 0.85,
  lang: 'es' as Lang,
  touchControls: 'auto' as SettingsState['touchControls'],
  effects: 'full' as SettingsState['effects'],
  crt: false,
  difficulty: 'normal' as Difficulty,
  ghost: false,
}

/** A volume outside 0..1 is not a loud game, it is a broken `GainNode`. */
const vol = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback

/**
 * Read persisted settings defensively — see the note in the progress store.
 * These reach the audio engine and the renderer directly, so a bad value here
 * is silence or a black screen rather than a wrong menu highlight.
 */
export function migrateSettings(persisted: unknown, _from: number): Partial<SettingsState> {
  const s = (persisted ?? {}) as Record<string, unknown>
  return {
    master: vol(s.master, DEFAULTS.master),
    music: vol(s.music, DEFAULTS.music),
    sfx: vol(s.sfx, DEFAULTS.sfx),
    lang: oneOf(s.lang, ['es', 'en'] as const, DEFAULTS.lang),
    touchControls: oneOf(s.touchControls, ['auto', 'on', 'off'] as const, DEFAULTS.touchControls),
    effects: oneOf(s.effects, ['full', 'reduced'] as const, DEFAULTS.effects),
    crt: s.crt === true,
    difficulty: oneOf(s.difficulty, DIFFICULTIES, DEFAULTS.difficulty),
    ghost: s.ghost === true,
  }
}

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
  /**
   * Race the shadow of your own best run.
   *
   * Off by default, and that is a decision rather than caution: a translucent
   * copy of yourself appearing unannounced the first time a child replays a
   * stage is confusing, and there is no way to ask what it is. It should be
   * something you switch on when you want to compete with yourself.
   */
  ghost: boolean
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      set: (patch) => set(patch),
    }),
    {
      name: 'nakama-bros:settings',
      version: SETTINGS_VERSION,
      migrate: migrateSettings,
    },
  ),
)
