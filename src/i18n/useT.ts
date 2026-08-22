import { TRANSLATIONS, type TranslationKey } from './translations'
import { useSettings } from '../store/settingsStore'

/** Translate helper bound to the current language setting. */
export function useT(): (key: TranslationKey) => string {
  const lang = useSettings((s) => s.lang)
  return (key) => TRANSLATIONS[lang][key] ?? TRANSLATIONS.es[key] ?? key
}
