import { useMemo, useState } from 'react'
import { motion as m } from 'framer-motion'
import { useT } from '../../i18n/useT'
import { useMenuNav } from '../hooks/useMenuNav'
import { useUiMotion } from '../hooks/useUiMotion'
import { useShortViewport } from '../hooks/useShortViewport'
import { useFitScale } from '../hooks/useFitScale'
import { Paper } from '../art/Paper'
import { JollyRoger, WaxSeal } from '../art/Icons'
import { UI } from '../theme'

/**
 * Game over: the poster comes down off the wall, torn, and the Marines stamp it
 * closed. The stamp is deliberately crooked and over the type — nobody presses
 * one of those neatly.
 */
export function GameOverScreen({ onRetry, onMenu }: { onRetry: () => void; onMenu: () => void }) {
  const t = useT()
  const motion = useUiMotion()
  const short = useShortViewport(560)
  const fit = useFitScale()
  const items = useMemo(
    () => [
      { label: t('over.retry'), run: onRetry, primary: true },
      { label: t('over.menu'), run: onMenu },
    ],
    [t, onRetry, onMenu],
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

  return (
    <m.div
      key="gameover"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-30 overflow-y-auto overscroll-contain bg-[rgba(3,2,1,0.9)]"
      role="dialog"
      aria-modal="true"
      aria-label={t('over.title')}
    >
      {/* Centred while it fits, scrolled once it does not: on a phone held
          sideways both buttons used to sit just past the bottom edge, which on
          a Game Over screen means no way to carry on at all. */}
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
        initial={{ scale: motion ? 1.35 : 1, opacity: 0, rotate: motion ? -9 : -3 }}
        animate={{ scale: 1, opacity: 1, rotate: -3 }}
        transition={{ type: 'spring', stiffness: 120, damping: 14 }}
        style={{ filter: 'drop-shadow(0 20px 26px rgba(0,0,0,0.8))' }}
      >
        <Paper seed={44} edges="all" bite={3.4} age={0.92} className={`w-[min(470px,92vw)] ${short ? 'px-6 pb-4 pt-4' : 'px-8 pb-9 pt-8'}`}>
          <div className="relative flex flex-col items-center text-center">
            <div className="font-body text-[10px] font-extrabold uppercase tracking-[0.34em]" style={{ color: UI.inkSoft }}>
              {t('crew.wanted')}
            </div>
            {/* The mark, printed rather than watermarked: this is the sheet the
                Marines file when the bounty stops running. */}
            <div className={`opacity-80 ${short ? 'my-1' : 'my-3'}`}>
              <JollyRoger size={short ? 76 : 124} bone="#C9AE83" ink={UI.ink} band="#8E5A4C" straw="#B49A6A" />
            </div>
            <div
              className="mt-1 font-display text-[3.4rem] leading-[0.95]"
              style={{ color: UI.wax, textShadow: '0 2px 0 rgba(255,255,255,0.22)' }}
            >
              {t('over.title')}
            </div>
            <div
              className="mt-3 h-px w-2/3"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(42,29,20,0.5), transparent)' }}
            />
            <div className="mt-3 font-body text-[11px] font-bold uppercase tracking-[0.24em]" style={{ color: UI.inkSoft }}>
              {t('over.sub')}
            </div>
          </div>
          {/* the cancellation: two heavy strokes, dragged across a wet sheet */}
          <svg viewBox="0 0 400 200" className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden="true">
            <path d="M24 176 C 130 128, 268 74, 378 26" stroke="#7E241C" strokeWidth={10} opacity={0.55} strokeLinecap="round" fill="none" />
            <path d="M30 30 C 150 82, 262 126, 372 174" stroke="#7E241C" strokeWidth={8} opacity={0.46} strokeLinecap="round" fill="none" />
            <path d="M26 172 C 132 124, 270 70, 380 22" stroke="#4A140F" strokeWidth={2.4} opacity={0.35} strokeLinecap="round" fill="none" />
          </svg>
          <span className="pointer-events-none absolute -bottom-1 right-4 rotate-[-8deg] opacity-95">
            <WaxSeal size={54} />
          </span>
        </Paper>
      </m.div>

      <div className="flex gap-3">
        {items.map((it, i) => (
          <button
            key={it.label}
            ref={itemRef(i) as (el: HTMLButtonElement | null) => void}
            className={`op-button ${it.primary ? 'op-button--primary' : ''}`}
            onMouseEnter={() => setIndex(i)}
            onClick={it.run}
          >
            {it.label}
          </button>
        ))}
        </div>
        </div>
        </div>
      </div>
    </m.div>
  )
}
