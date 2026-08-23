import { useEffect, useMemo, useState } from 'react'
import { motion as m } from 'framer-motion'
import type { CrewId } from '../../types'
import { ALL_LEVELS } from '../../game/level'
import { CREW, CREW_IDS } from '../../game/config'
import { useProgress } from '../../store/progressStore'
import { useT } from '../../i18n/useT'
import { useUiMotion } from '../hooks/useUiMotion'
import { useShortViewport } from '../hooks/useShortViewport'
import { useFitScale } from '../hooks/useFitScale'
import { useCrewPortraits } from '../hooks/useCrewPortraits'
import { SeaScene } from '../art/SeaScene'
import { BerryIcon, FragmentIcon, Rope } from '../art/Icons'
import { UI, formatBerry } from '../theme'

/**
 * The end of the campaign.
 *
 * Clearing the last stage used to hand you the same bounty poster as any other
 * stage, with `hasNext` false — so the only button was Repetir and the game
 * simply stopped. Finishing something should be an event, and this is it: the
 * ship sails on, the whole crew is on deck, and the journey is totalled up.
 *
 * It is the beat before the credits, not a replacement for them — the roll is
 * one button away, and the ending goes there on its own if you sit with it.
 */

/** The credits take over if the ending is left alone this long. */
const DRIFT_MS = 14000
/** Ignore input briefly, so the click that opened this does not skip it. */
const ARM_MS = 400

const TOTAL_FRAGMENTS = ALL_LEVELS.length * 3

function Stat({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b py-1" style={{ borderColor: 'rgba(201,165,102,0.28)' }}>
      <span
        className="font-body text-[10px] font-bold uppercase tracking-[0.2em]"
        style={{ color: UI.paperDim }}
      >
        {label}
      </span>
      <span className="flex items-center gap-1.5 font-body text-base font-extrabold tabnum" style={{ color: '#FFF3D6' }}>
        {icon}
        {value}
      </span>
    </div>
  )
}

export function EndingScreen({ onCredits, onPort }: { onCredits: () => void; onPort: () => void }) {
  const t = useT()
  const motion = useUiMotion()
  const short = useShortViewport(560)
  const fit = useFitScale()
  const portraits = useCrewPortraits()
  const records = useProgress((s) => s.records)
  const totalBerries = useProgress((s) => s.totalBerries)
  const crewId = useProgress((s) => s.crew) as CrewId
  const crew = CREW[crewId] ?? CREW.luffy
  const [armed, setArmed] = useState(false)

  const tally = useMemo(() => {
    let cleared = 0
    let fragments = 0
    for (const l of ALL_LEVELS) {
      const r = records[l.id]
      if (r?.cleared) cleared++
      fragments += r?.fragments ?? 0
    }
    return { cleared, fragments }
  }, [records])

  // Sit with it, then let the credits take over — the way an ending does.
  useEffect(() => {
    const arm = window.setTimeout(() => setArmed(true), ARM_MS)
    const drift = window.setTimeout(onCredits, DRIFT_MS)
    return () => {
      window.clearTimeout(arm)
      window.clearTimeout(drift)
    }
  }, [onCredits])

  useEffect(() => {
    if (!armed) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onPort()
      if (e.key === 'Enter' || e.key === ' ') onCredits()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [armed, onCredits, onPort])

  const perfect = tally.cleared === ALL_LEVELS.length && tally.fragments === TOTAL_FRAGMENTS

  return (
    <m.div
      key="ending"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: motion ? 1.1 : 0 }}
      className="relative h-full w-full overflow-y-auto overscroll-contain"
    >
      <SeaScene motion={motion} />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(4,10,18,0.7) 0%, rgba(4,10,18,0.42) 34%, rgba(4,10,18,0.74) 100%)',
        }}
      />
      <div
        className="relative z-10 flex min-h-full flex-col"
        style={{
          paddingTop: `calc(${short ? '0.375rem' : '1.5rem'} + var(--safe-t))`,
          paddingRight: 'calc(1.25rem + var(--safe-r))',
          paddingBottom: `calc(${short ? '0.375rem' : '1.5rem'} + var(--safe-b))`,
          paddingLeft: 'calc(1.25rem + var(--safe-l))',
        }}
      >
        <div className="m-auto w-full max-w-[520px]" style={{ height: fit.height }}>
        <div
          ref={fit.ref as (el: HTMLDivElement | null) => void}
          className={`flex w-full flex-col items-center text-center ${short ? 'gap-1' : 'gap-3'}`}
          style={
            fit.scale < 1
              ? { transform: `scale(${fit.scale})`, transformOrigin: 'top center' }
              : undefined
          }
        >
          <m.div
            initial={motion ? { y: 14, opacity: 0 } : false}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: motion ? 0.35 : 0, type: 'spring', stiffness: 150, damping: 20 }}
            className="flex flex-col items-center gap-1"
          >
            <div
              className="font-body text-[11px] font-extrabold uppercase tracking-[0.42em]"
              style={{ color: UI.brassLit, textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}
            >
              {t('ending.eyebrow')}
            </div>
            <h2
              className={`font-display leading-none ${short ? 'text-4xl' : 'text-5xl'}`}
              style={{ color: '#FFF6DE', textShadow: '0 4px 0 rgba(0,0,0,0.35), 0 10px 26px rgba(0,0,0,0.8)' }}
            >
              {t('ending.title')}
            </h2>
          </m.div>

          <div className="opacity-70">
            <Rope length={short ? 190 : 250} thickness={6} />
          </div>

          {/* The whole crew on deck, not just the one you played. */}
          <div className="flex flex-nowrap justify-center gap-1.5">
            {CREW_IDS.map((id, i) => (
              <m.div
                key={id}
                initial={motion ? { y: 10, opacity: 0 } : false}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: motion ? 0.6 + i * 0.07 : 0 }}
                className="overflow-hidden rounded-[3px] border"
                style={{
                  width: short ? 36 : 44,
                  height: short ? 36 : 44,
                  borderColor: id === crewId ? UI.brassLit : 'rgba(201,165,102,0.45)',
                  boxShadow: id === crewId ? `0 0 0 1px ${UI.brass}, 0 4px 10px -5px #000` : '0 4px 10px -6px #000',
                  background: 'linear-gradient(160deg,#2A3F52,#16283A)',
                }}
              >
                {portraits[id] && <img src={portraits[id]} alt="" className="h-full w-full object-cover" />}
              </m.div>
            ))}
          </div>

          <p
            className={`mx-auto max-w-[40ch] font-body leading-relaxed ${short ? 'text-[11px]' : 'text-sm'}`}
            style={{ color: '#EFE2C4', textShadow: '0 1px 5px rgba(0,0,0,0.9)' }}
          >
            {t('ending.blurb', { crew: crew.name })}
          </p>

          <div className="w-full max-w-[300px]">
            <Stat label={t('ending.stages')} value={`${tally.cleared}/${ALL_LEVELS.length}`} />
            <Stat
              label={t('ending.fragments')}
              value={`${tally.fragments}/${TOTAL_FRAGMENTS}`}
              icon={<FragmentIcon size={15} lit />}
            />
            <Stat label={t('ending.booty')} value={formatBerry(totalBerries)} icon={<BerryIcon size={15} />} />
          </div>

          {perfect && (
            <div
              className="font-body text-[11px] font-bold uppercase tracking-[0.18em]"
              style={{ color: UI.gold, textShadow: '0 1px 5px rgba(0,0,0,0.9)' }}
            >
              {t('ending.perfect')}
            </div>
          )}

          <div className={`flex flex-wrap justify-center gap-2 ${short ? 'mt-1' : 'mt-2'}`}>
            <button className="op-button op-button--primary" onClick={onCredits}>
              {t('ending.credits')}
            </button>
            <button className="op-button" onClick={onPort}>
              {t('ending.port')}
            </button>
          </div>

          <p
            className={`font-body uppercase tracking-[0.2em] ${short ? 'text-[9px] leading-tight' : 'text-[10px]'}`}
            style={{ color: UI.paperDim, opacity: 0.8 }}
          >
            {t('ending.again')}
          </p>
        </div>
        </div>
      </div>
    </m.div>
  )
}
