import { useCallback } from 'react'
import { TRANSLATIONS, type TranslationKey } from './translations'
import { useSettings } from '../store/settingsStore'

export type TFunction = (key: TranslationKey, vars?: Record<string, string | number>) => string

/**
 * Translate helper bound to the current language setting.
 *
 * Falls back to Spanish, which is the key set of record, and then to the key
 * itself — a missing string shows up as a visible `crew.title` rather than as
 * an empty box.
 */
export function useT(): TFunction {
  const lang = useSettings((s) => s.lang)
  return useCallback(
    (key, vars) => {
      const raw: string = TRANSLATIONS[lang][key] ?? TRANSLATIONS.es[key] ?? key
      if (!vars) return raw
      return raw.replace(/\{(\w+)\}/g, (whole, name: string) =>
        name in vars ? String(vars[name]) : whole,
      )
    },
    [lang],
  )
}
