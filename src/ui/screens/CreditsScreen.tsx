import { useEffect, useRef } from 'react'
import { motion as m } from 'framer-motion'
import { CREW, CREW_IDS } from '../../game/config'
import { useProgress } from '../../store/progressStore'
import { useT } from '../../i18n/useT'
import { useUiMotion } from '../hooks/useUiMotion'
import { useCrewPortraits } from '../hooks/useCrewPortraits'
import { SeaScene } from '../art/SeaScene'
import { JollyRoger, Rope, WaxSeal } from '../art/Icons'
import { UI } from '../theme'
import { buildLabel, copyrightYears } from '../../build'
import { GiftDrawing } from '../GiftDrawing'

/**
 * The staff roll.
 *
 * A credits screen in this genre is a slow climb over the game's own scenery,
 * so this one runs over the same dawn the title screen sits on, and the cast is
 * the crew's real portraits — the ones the art layer bakes — rather than a list
 * of names that could quietly drift away from the characters you play.
 *
 * It scrolls itself, and stops the moment you touch it: an automatic roll that
 * fights the scrollbar is worse than no roll at all. Under
 * `prefers-reduced-motion` it never starts, and the page is simply a long
 * document you read at your own pace.
 */

/** Roll speed, px/s. Slow enough to read, quick enough that a child stays. */
const ROLL_SPEED = 38
/** Beat before the roll starts, so the heading is readable where it landed. */
const ROLL_DELAY = 1400

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="font-body text-[11px] font-extrabold uppercase tracking-[0.34em]"
      style={{ color: UI.brass, textShadow: '0 1px 0 rgba(0,0,0,0.8)' }}
    >
      {children}
    </div>
  )
}

function Name({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="font-display text-3xl leading-tight"
      style={{ color: '#FFF3D6', textShadow: '0 2px 10px rgba(0,0,0,0.85)' }}
    >
      {children}
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="mx-auto max-w-[34ch] font-body text-[11px] leading-relaxed"
      style={{ color: '#E4D3AE', textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}
    >
      {children}
    </p>
  )
}

function Divider() {
  return (
    <div className="flex justify-center py-1 opacity-45">
      <Rope length={190} thickness={6} />
    </div>
  )
}

export function CreditsScreen({ onBack }: { onBack: () => void }) {
  const t = useT()
  const motion = useUiMotion()
  const portraits = useCrewPortraits()
  const giftEarned = useProgress((s) => s.giftEarned)
  const rollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])

  useEffect(() => {
    const el = rollRef.current
    if (!el || !motion) return
    let raf = 0
    let last = 0
    const tick = (now: number) => {
      const dt = last === 0 ? 0 : Math.min((now - last) / 1000, 0.05)
      last = now
      el.scrollTop += ROLL_SPEED * dt
      // Stop at the foot rather than fighting the clamp forever.
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) return
      raf = requestAnimationFrame(tick)
    }
    const start = window.setTimeout(() => {
      raf = requestAnimationFrame(tick)
    }, ROLL_DELAY)

    // Any intent to scroll hands the roll over for good. `pointerdown` covers
    // the scrollbar and a drag on a phone; `wheel` covers a trackpad that never
    // fires a pointer event at all.
    const stop = () => {
      window.clearTimeout(start)
      cancelAnimationFrame(raf)
    }
    const events: Array<keyof WindowEventMap> = ['wheel', 'touchstart', 'pointerdown', 'keydown']
    for (const e of events) el.addEventListener(e, stop, { passive: true })
    return () => {
      stop()
      for (const e of events) el.removeEventListener(e, stop)
    }
  }, [motion])

  return (
    <m.div
      key="credits"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: motion ? 0.4 : 0 }}
      className="relative h-full w-full overflow-hidden"
    >
      <SeaScene motion={motion} />
      {/* The roll runs from the bright sky into the dark water, so the text
          needs its own ground to stay legible the whole way down. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(4,10,18,0.72) 0%, rgba(4,10,18,0.46) 30%, rgba(4,10,18,0.62) 70%, rgba(4,10,18,0.86) 100%)',
        }}
      />

      <div
        ref={rollRef}
        className="relative z-10 h-full w-full overflow-y-auto overscroll-contain"
        style={{
          paddingRight: 'calc(1.5rem + var(--safe-r))',
          paddingLeft: 'calc(1.5rem + var(--safe-l))',
        }}
      >
        <div className="mx-auto flex w-full max-w-[420px] flex-col items-center gap-6 py-[18vh] text-center">
          <div className="flex flex-col items-center gap-2">
            <JollyRoger size={54} />
            <h2
              className="font-display text-4xl leading-none"
              style={{ color: '#FFF3D6', textShadow: '0 3px 12px rgba(0,0,0,0.9)' }}
            >
              {t('credits.title')}
            </h2>
          </div>

          <Divider />

          <div className="flex flex-col items-center gap-1">
            <Heading>{t('credits.made')}</Heading>
            <Name>ezar</Name>
            <Note>{t('credits.authorRole')}</Note>
          </div>

          <Divider />

          {/* The reason this screen exists. */}
          <div className="flex flex-col items-center gap-1">
            <Heading>{t('credits.thanks')}</Heading>
            <Name>{t('credits.helpers')}</Name>
            <Note>{t('credits.helpersNote')}</Note>
          </div>

          <Divider />

          <div className="flex flex-col items-center gap-3">
            <Note>{t('credits.code')}</Note>
            {giftEarned ? (
              <>
                <Note>
                  <span style={{ color: UI.brassLit }}>{t('credits.exception')}</span>
                </Note>
                <GiftDrawing width={208} tilt={-1.4} />
              </>
            ) : (
              <>
                <Note>
                  <span style={{ color: UI.brassLit }}>{t('credits.lockedTitle')}</span>
                </Note>
                {/* An empty frame rather than nothing at all: a prize you cannot
                    see is a prize nobody goes after. */}
                <div
                  className="flex h-[156px] w-[208px] items-center justify-center rounded-[3px] p-[3px]"
                  style={{
                    background: `linear-gradient(150deg, ${UI.brassDark}, ${UI.oakDark} 60%)`,
                    boxShadow: 'inset 0 0 22px rgba(0,0,0,0.7)',
                  }}
                >
                  <span className="font-display text-5xl" style={{ color: 'rgba(241,211,134,0.28)' }}>
                    S
                  </span>
                </div>
                <Note>{t('credits.lockedHint')}</Note>
              </>
            )}
          </div>

          <Divider />

          <div className="flex flex-col items-center gap-3">
            <Heading>{t('credits.cast')}</Heading>
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-4">
              {CREW_IDS.map((id) => (
                <figure key={id} className="flex w-[68px] flex-col items-center gap-1">
                  <div
                    className="h-[62px] w-[62px] overflow-hidden rounded-[3px] border"
                    style={{
                      borderColor: 'rgba(201,165,102,0.5)',
                      background: 'linear-gradient(160deg,#2A3F52,#16283A)',
                      boxShadow: '0 4px 10px -6px rgba(0,0,0,0.9)',
                    }}
                  >
                    {portraits[id] && (
                      <img src={portraits[id]} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <figcaption
                    className="font-body text-[9px] font-bold uppercase tracking-[0.12em]"
                    style={{ color: '#E4D3AE' }}
                  >
                    {CREW[id].name}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>

          <Divider />

          {/* Who made this, whose it is, and whose it is not. A fan project that
              borrows a cast has to say so somewhere the player can reach, and
              the foot of the credits is where that has always lived. */}
          <div className="flex flex-col items-center gap-1.5">
            <Heading>{t('legal.title')}</Heading>
            <Note>{t('legal.oda')}</Note>
            <Note>{t('legal.fan')}</Note>
            <Note>{t('legal.code', { years: copyrightYears })}</Note>
          </div>

          <div className="flex flex-col items-center gap-2 pt-2">
            <WaxSeal size={58} />
            <div
              className="font-display text-2xl"
              style={{ color: '#FFF3D6', textShadow: '0 2px 10px rgba(0,0,0,0.85)' }}
            >
              {t('credits.end')}
            </div>
            <div
              className="font-body text-[10px] tabnum tracking-[0.14em]"
              style={{ color: '#C9B48C', opacity: 0.7 }}
            >
              {buildLabel}
            </div>
          </div>

          <button className="op-button op-button--primary mt-2 w-full max-w-[260px]" onClick={onBack}>
            {t('options.back')}
          </button>
        </div>
      </div>

      {/* Pinned as well as at the foot: a way out you have to scroll two
          screens to find is not a way out. Top-left rather than under the roll,
          where it sat on top of whatever was passing — including the drawing. */}
      <button
        className="op-button absolute z-20 !px-3 !py-1.5 !text-xs"
        style={{
          left: 'calc(0.75rem + var(--safe-l))',
          top: 'calc(0.75rem + var(--safe-t))',
        }}
        onClick={onBack}
      >
        {t('options.back')}
      </button>
    </m.div>
  )
}
