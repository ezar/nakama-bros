import { useEffect, useMemo } from 'react'
import { motion as m } from 'framer-motion'
import type { LevelDef } from '../../types'
import { WORLDS, worldOf } from '../../game/level'
import { biomePalette } from '../../art/palette'
import { useT } from '../../i18n/useT'
import type { TranslationKey } from '../../i18n/translations'
import { useUiMotion } from '../hooks/useUiMotion'
import { useShortViewport } from '../hooks/useShortViewport'
import { JollyRoger, Rope } from '../art/Icons'
import { UI } from '../theme'

/**
 * The card before the stage — "you are going to Alabasta".
 *
 * It is painted in the island's *own* sky: the biome palettes the renderer uses
 * for the level are the same ones this reads, so the card and the first frame
 * of the stage are the same place. Six islands, six cards, and nothing to keep
 * in sync by hand.
 *
 * It gets out of the way fast. Two and a half seconds, or the first tap or key
 * — whichever comes first — because a card you cannot skip stops being a
 * flourish the second time you see it.
 */

const HOLD_MS = 2500
/**
 * Input is ignored for this long after the card appears. The press that opened
 * it — a held key repeating, a menu confirm — would otherwise dismiss it in the
 * same breath, and the card would look broken rather than fast.
 */
const ARM_MS = 350

/** "1-2": which island, and which stage of it. */
function stageNumber(level: LevelDef): string {
  const w = worldOf(level.id)
  if (!w) return '1-1'
  return `${WORLDS.indexOf(w) + 1}-${w.levels.findIndex((l) => l.id === level.id) + 1}`
}

export function LevelIntroScreen({ level, onDone }: { level: LevelDef; onDone: () => void }) {
  const t = useT()
  const motion = useUiMotion()
  const short = useShortViewport(560)
  const world = useMemo(() => worldOf(level.id), [level.id])
  const pal = biomePalette(level.biome)

  useEffect(() => {
    let armed = false
    const done = () => onDone()
    const skip = () => {
      if (armed) done()
    }
    const arm = window.setTimeout(() => { armed = true }, ARM_MS)
    const hold = window.setTimeout(done, HOLD_MS)
    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'touchstart']
    for (const e of events) window.addEventListener(e, skip)
    return () => {
      window.clearTimeout(arm)
      window.clearTimeout(hold)
      for (const e of events) window.removeEventListener(e, skip)
    }
  }, [onDone])

  return (
    <m.div
      key="intro"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: motion ? 0.25 : 0 }}
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden"
      style={{
        background: `linear-gradient(180deg, ${pal.skyTop} 0%, ${pal.skyMid} 52%, ${pal.skyLow} 100%)`,
      }}
      role="status"
      aria-label={`${world?.name ?? ''} — ${level.name}`}
    >
      {/* The island, as a headland on the horizon. Two bands of the same
          silhouettes the parallax uses, so the card reads as this place. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0" aria-hidden="true">
        <svg viewBox="0 0 400 120" className="w-full" preserveAspectRatio="none">
          <path d="M0 74 C 46 58, 78 66, 118 52 C 160 38, 196 60, 238 54 C 284 47, 320 62, 360 50 L400 56 L400 120 L0 120 Z"
            fill={pal.farSilhouette} opacity={0.75} />
          <path d="M0 92 C 54 80, 96 90, 146 78 C 198 66, 244 86, 296 78 C 342 71, 372 84, 400 78 L400 120 L0 120 Z"
            fill={pal.midSilhouette} />
        </svg>
      </div>
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 78% 66% at 50% 45%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.5) 100%)' }}
      />
      {/* The band the type sits on. Six islands means six skies, two of them
          nearly white, so contrast cannot be left to a text shadow: the card
          brings its own ground and the same type reads on all of them. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-1/2 h-[64%] -translate-y-1/2"
        style={{
          background:
            'linear-gradient(180deg, rgba(6,10,18,0) 0%, rgba(6,10,18,0.24) 12%, rgba(6,10,18,0.68) 30%, rgba(6,10,18,0.68) 70%, rgba(6,10,18,0.24) 88%, rgba(6,10,18,0) 100%)',
        }}
      />

      <m.div
        initial={motion ? { y: 16, opacity: 0 } : false}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 180, damping: 20 }}
        className={`relative z-10 flex flex-col items-center px-6 text-center ${short ? 'gap-1' : 'gap-2'}`}
      >
        <JollyRoger size={short ? 34 : 46} />
        <div
          className="font-body text-[11px] font-extrabold uppercase tracking-[0.42em]"
          style={{ color: pal.accent, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}
        >
          {t('intro.stage', { n: stageNumber(level) })}
        </div>
        <h2
          className={`font-display leading-none ${short ? 'text-5xl' : 'text-7xl'}`}
          style={{ color: '#FFF6DE', textShadow: '0 4px 0 rgba(0,0,0,0.35), 0 8px 24px rgba(0,0,0,0.7)' }}
        >
          {world?.name ?? level.name}
        </h2>
        <div className="opacity-70">
          <Rope length={short ? 180 : 240} thickness={6} />
        </div>
        <div
          className={`font-body font-bold uppercase tracking-[0.2em] ${short ? 'text-xs' : 'text-sm'}`}
          style={{ color: '#FFF6DE', textShadow: '0 2px 6px rgba(0,0,0,0.85)' }}
        >
          {level.name}
        </div>
        <p
          className={`mx-auto max-w-[42ch] font-body leading-relaxed ${short ? 'text-[11px]' : 'text-sm'}`}
          style={{ color: '#EFE2C4', textShadow: '0 1px 5px rgba(0,0,0,0.9)' }}
        >
          {world ? t(`world.${world.id}` as TranslationKey) : ''}
        </p>
      </m.div>

      <div
        className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 font-body text-[10px] uppercase tracking-[0.28em]"
        style={{ color: UI.paperDim, textShadow: '0 1px 4px rgba(0,0,0,0.9)', opacity: 0.85 }}
      >
        {t('intro.skip')}
      </div>
    </m.div>
  )
}
