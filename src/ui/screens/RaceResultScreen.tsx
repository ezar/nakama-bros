import { useEffect, useState } from 'react'
import { motion as m } from 'framer-motion'
import type { RaceSession, RaceSnapshot } from '../../net/session'
import { useT } from '../../i18n/useT'
import { useUiMotion } from '../hooks/useUiMotion'
import { useShortViewport } from '../hooks/useShortViewport'
import { Paper } from '../art/Paper'
import { JollyRoger, WaxSeal } from '../art/Icons'
import { UI, formatRunTime } from '../theme'

/**
 * How the race ended.
 *
 * Unlike every other result in this game, this one is not settled when it
 * appears: crossing the line first does not mean winning, it means waiting.
 * So the screen shows your own time straight away and fills in the other half
 * when it arrives — rather than holding everything back behind a spinner, or
 * announcing a winner it does not yet know.
 */
export function RaceResultScreen({
  race,
  onAgain,
  onLeave,
}: {
  race: RaceSession
  onAgain: () => void
  onLeave: () => void
}) {
  const t = useT()
  const motion = useUiMotion()
  const short = useShortViewport(560)
  const [snap, setSnap] = useState<RaceSnapshot>(() => race.snapshot())

  useEffect(() => race.subscribe(setSnap), [race])

  const them = snap.opponent?.name || '?'
  const mine = snap.mySeconds
  const theirs = snap.opponent?.seconds ?? null
  const gaveUp = snap.opponent?.gaveUp ?? false
  const settled = mine !== null && (theirs !== null || gaveUp)

  const headline = () => {
    if (!settled) return t('versus.waitingOther', { name: them })
    if (gaveUp || theirs === null) return t('versus.gaveUp', { name: them })
    if (Math.abs(mine! - theirs) < 0.01) return t('versus.tie')
    return mine! < theirs ? t('versus.youWin') : t('versus.youLose', { name: them })
  }

  const won = settled && theirs !== null && !gaveUp && mine! < theirs

  return (
    <m.div
      key="raceresult"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-30 flex overflow-y-auto overscroll-contain bg-[rgba(3,2,1,0.92)]"
      role="dialog"
      aria-modal="true"
      aria-label={t('versus.title')}
    >
      <div
        className="m-auto"
        style={{
          paddingTop: 'calc(1rem + var(--safe-t))',
          paddingRight: 'calc(1rem + var(--safe-r))',
          paddingBottom: 'calc(1rem + var(--safe-b))',
          paddingLeft: 'calc(1rem + var(--safe-l))',
        }}
      >
        <m.div
          initial={{ scale: motion ? 1.2 : 1, opacity: 0, rotate: motion ? -5 : -1.5 }}
          animate={{ scale: 1, opacity: 1, rotate: -1.5 }}
          transition={{ type: 'spring', stiffness: 130, damping: 15 }}
          style={{ filter: 'drop-shadow(0 20px 26px rgba(0,0,0,0.8))' }}
        >
          <Paper seed={91} edges="all" bite={3.2} age={0.86} className={`w-[min(440px,92vw)] ${short ? 'px-6 py-5' : 'px-8 py-7'}`}>
            <div className="flex flex-col items-center text-center">
              <JollyRoger size={short ? 34 : 46} />
              <div className="mt-2 font-body text-[10px] font-extrabold uppercase tracking-[0.32em]" style={{ color: UI.inkSoft }}>
                {t('versus.title')}
              </div>
              <h2
                className={`font-display leading-none ${short ? 'mt-1 text-3xl' : 'mt-2 text-4xl'}`}
                style={{ color: won ? UI.wax : UI.ink }}
              >
                {headline()}
              </h2>

              <div className="mt-4 w-full">
                <Line label={t('versus.yourTime')} value={mine === null ? '—' : formatRunTime(mine)} strong />
                <Line
                  label={t('versus.theirTime', { name: them })}
                  value={gaveUp ? '—' : theirs === null ? '…' : formatRunTime(theirs)}
                />
              </div>

              <p className="mt-3 font-body text-[10px] leading-snug" style={{ color: UI.inkSoft }}>
                {t('versus.noRace')}
              </p>
              <span className="mt-2 opacity-85"><WaxSeal size={short ? 30 : 40} /></span>
            </div>
          </Paper>
        </m.div>

        <div className="mt-4 flex justify-center gap-3">
          <button className="op-button op-button--primary px-4 py-2 text-sm" onClick={onAgain}>
            {t('versus.again')}
          </button>
          <button className="op-button px-4 py-2 text-sm" onClick={onLeave}>
            {t('versus.leave')}
          </button>
        </div>
      </div>
    </m.div>
  )
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-1.5" style={{ borderColor: 'rgba(42,29,20,0.18)' }}>
      <span className="truncate font-body text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: UI.inkSoft }}>
        {label}
      </span>
      <span className={`font-display tabnum leading-none ${strong ? 'text-2xl' : 'text-xl'} ink`}>{value}</span>
    </div>
  )
}
