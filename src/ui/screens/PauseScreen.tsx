import { useMemo, useState } from 'react'
import { motion as m } from 'framer-motion'
import { useT } from '../../i18n/useT'
import { useMenuNav } from '../hooks/useMenuNav'
import { useUiMotion } from '../hooks/useUiMotion'
import { Paper } from '../art/Paper'
import { JollyRoger, Nail, Rope } from '../art/Icons'
import { UI } from '../theme'

interface Props {
  onResume: () => void
  onRestart: () => void
  onQuit: () => void
}

/** The ship's log, laid open on the chart table while the world holds still. */
export function PauseScreen({ onResume, onRestart, onQuit }: Props) {
  const t = useT()
  const motion = useUiMotion()
  const items = useMemo(
    () => [
      { label: t('pause.resume'), run: onResume, primary: true },
      { label: t('pause.restart'), run: onRestart },
      { label: t('pause.quit'), run: onQuit },
    ],
    [t, onResume, onRestart, onQuit],
  )
  const [index, setIndex] = useState(0)
  const { itemRef } = useMenuNav({
    count: items.length,
    index,
    onIndex: setIndex,
    onConfirm: (i) => items[i]?.run(),
    onBack: onResume,
    armMs: 320,
  })

  return (
    <m.div
      key="pause"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(5,9,16,0.72)] backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={t('pause.title')}
    >
      <m.div
        initial={{ scale: motion ? 0.9 : 1, y: motion ? 14 : 0, rotate: motion ? -2.5 : -1 }}
        animate={{ scale: 1, y: 0, rotate: -1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        style={{ filter: 'drop-shadow(0 20px 24px rgba(0,0,0,0.7))' }}
      >
        <Paper seed={12} edges="all" bite={1.6} age={0.72} className="w-[min(380px,88vw)] px-8 pb-7 pt-8">
          <span className="absolute left-1/2 top-2 -translate-x-1/2">
            <Nail size={15} />
          </span>

          {/* watermark: the crew's mark pressed into the page */}
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.09]">
            <JollyRoger size={230} bone={UI.ink} ink={UI.ink} band={UI.ink} straw={UI.ink} />
          </span>

          <h2 className="relative text-center font-display text-4xl leading-none ink">{t('pause.title')}</h2>
          <div className="relative mx-auto mt-2 flex w-full items-center justify-center opacity-70">
            <Rope length={230} thickness={11} />
          </div>

          <div className="relative mt-5 flex flex-col gap-2.5">
            {items.map((it, i) => (
              <button
                key={it.label}
                ref={itemRef(i) as (el: HTMLButtonElement | null) => void}
                className={`op-button w-full text-base ${it.primary ? 'op-button--primary' : ''}`}
                onMouseEnter={() => setIndex(i)}
                onClick={it.run}
              >
                {it.label}
              </button>
            ))}
          </div>

          <div
            className="relative mt-4 text-center font-body text-[10px] uppercase tracking-[0.2em]"
            style={{ color: UI.inkSoft, opacity: 0.7 }}
          >
            {t('pause.hint')}
          </div>
        </Paper>
      </m.div>
    </m.div>
  )
}
