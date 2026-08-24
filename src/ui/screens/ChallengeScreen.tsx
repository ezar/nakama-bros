import { useMemo, useState } from 'react'
import { motion as m } from 'framer-motion'
import { useT } from '../../i18n/useT'
import { useMenuNav } from '../hooks/useMenuNav'
import { useUiMotion } from '../hooks/useUiMotion'
import { useShortViewport } from '../hooks/useShortViewport'
import { useFitScale } from '../hooks/useFitScale'
import { Paper } from '../art/Paper'
import { JollyRoger } from '../art/Icons'
import { UI, formatRunTime } from '../theme'
import { CREW } from '../../game/config'
import type { Rival } from '../../store/progressStore'

/**
 * Somebody's challenge, the moment the link opens.
 *
 * This is the first thing a child sees when they tap what their sister sent
 * them, quite possibly before they have ever opened the game — so it says who,
 * where and how fast, and gives one obvious way in. Everything else about the
 * game is behind it and can wait.
 *
 * The challenge is already saved by the time this draws. "Not now" is
 * therefore not a refusal: it puts the player on the title screen with the
 * challenge sitting on the chart, which is what "not now" means.
 */
export function ChallengeScreen({
  rival,
  levelName,
  locked,
  onAccept,
  onMap,
  onLater,
}: {
  rival: Rival
  levelName: string
  /**
   * The stage is further along the campaign than this save has reached.
   *
   * A challenge does not open it. Letting a link start any stage in the game
   * would make the campaign optional — clear it once and the next one unlocks
   * behind it — and a child being handed the end of the game by their sister
   * is not a favour. The challenge is kept either way; it simply waits.
   */
  locked: boolean
  onAccept: () => void
  onMap: () => void
  onLater: () => void
}) {
  const t = useT()
  const motion = useUiMotion()
  const short = useShortViewport(560)
  const fit = useFitScale()
  const items = useMemo(
    () => (locked
      ? [
          { label: t('challenge.toMap'), run: onMap, primary: true },
          { label: t('challenge.later'), run: onLater },
        ]
      : [
          { label: t('challenge.accept'), run: onAccept, primary: true },
          { label: t('challenge.later'), run: onLater },
        ]),
    [locked, t, onAccept, onMap, onLater],
  )
  const [index, setIndex] = useState(0)
  const { itemRef } = useMenuNav({
    count: items.length,
    index,
    onIndex: setIndex,
    onConfirm: (i) => items[i]?.run(),
    orientation: 'horizontal',
    armMs: 700,
  })

  const crew = CREW[rival.crew]

  return (
    <m.div
      key="challenge-in"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-30 overflow-y-auto overscroll-contain bg-[rgba(3,2,1,0.92)]"
      role="dialog"
      aria-modal="true"
      aria-label={t('challenge.badge')}
    >
      <div
        className="flex min-h-full flex-col"
        style={{
          paddingTop: 'calc(1rem + var(--safe-t))',
          paddingRight: 'calc(1rem + var(--safe-r))',
          paddingBottom: 'calc(1rem + var(--safe-b))',
          paddingLeft: 'calc(1rem + var(--safe-l))',
        }}
      >
        <div className="m-auto" style={{ height: fit.height }}>
          <div
            ref={fit.ref as (el: HTMLDivElement | null) => void}
            className={`flex flex-col items-center ${short ? 'gap-4' : 'gap-7'}`}
            style={
              fit.scale < 1
                ? { transform: `scale(${fit.scale})`, transformOrigin: 'top center' }
                : undefined
            }
          >
            <m.div
              initial={{ scale: motion ? 1.25 : 1, opacity: 0, rotate: motion ? 6 : 2 }}
              animate={{ scale: 1, opacity: 1, rotate: 2 }}
              transition={{ type: 'spring', stiffness: 130, damping: 15 }}
              style={{ filter: 'drop-shadow(0 20px 26px rgba(0,0,0,0.8))' }}
            >
              <Paper
                seed={19}
                edges="all"
                bite={3.4}
                age={0.85}
                className={`w-[min(440px,92vw)] ${short ? 'px-6 py-5' : 'px-8 py-8'}`}
              >
                <div className="flex flex-col items-center text-center">
                  <span className="opacity-90">
                    <JollyRoger size={short ? 40 : 54} />
                  </span>
                  <div
                    className="mt-2 font-body text-[10px] font-extrabold uppercase tracking-[0.34em]"
                    style={{ color: UI.inkSoft }}
                  >
                    {t('challenge.badge')}
                  </div>
                  <h2 className={`font-display leading-none ink ${short ? 'mt-1 text-3xl' : 'mt-2 text-4xl'}`}>
                    {rival.name
                      ? t('challenge.from', { name: rival.name })
                      : t('challenge.fromAnon')}
                  </h2>

                  <div className="mt-4 w-full rounded-sm px-4 py-3" style={{ background: 'rgba(42,29,20,0.08)' }}>
                    <div className="font-display text-2xl leading-none ink">{levelName}</div>
                    <div
                      className="mt-2 font-body text-[10px] font-bold uppercase tracking-[0.2em]"
                      style={{ color: UI.inkSoft }}
                    >
                      {t('challenge.toBeat')}
                    </div>
                    <div className="font-display text-[34px] leading-none tabnum" style={{ color: UI.wax }}>
                      {formatRunTime(rival.time)}
                    </div>
                    {crew && (
                      <div className="mt-1 font-body text-[10px] uppercase tracking-[0.18em]" style={{ color: UI.inkSoft }}>
                        {crew.name}
                      </div>
                    )}
                  </div>

                  {locked && (
                    <p className="mt-3 font-body text-[11px] leading-snug" style={{ color: UI.wax }}>
                      {t('challenge.locked')}
                    </p>
                  )}
                </div>
              </Paper>
            </m.div>

            <div className="flex gap-3">
              {items.map((a, i) => (
                <button
                  key={a.label}
                  ref={itemRef(i) as (el: HTMLButtonElement | null) => void}
                  className={`op-button ${a.primary ? 'op-button--primary' : ''}`}
                  onMouseEnter={() => setIndex(i)}
                  onClick={a.run}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </m.div>
  )
}
