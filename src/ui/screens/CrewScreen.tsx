import { useEffect, useMemo, useRef, useState } from 'react'
import { motion as m } from 'framer-motion'
import type { CrewId } from '../../types'
import { CREW, CREW_IDS } from '../../game/config'
import { useT, type TFunction } from '../../i18n/useT'
import { useMenuNav } from '../hooks/useMenuNav'
import { useUiMotion } from '../hooks/useUiMotion'
import { Paper } from '../art/Paper'
import { BerryIcon, JollyRoger, Nail, Rope, WaxSeal } from '../art/Icons'
import { BOUNTY, formatBerry, UI, tilt } from '../theme'
import type { TranslationKey } from '../../i18n/translations'

interface Props {
  selected: CrewId
  onSelect: (c: CrewId) => void
  onStart: () => void
  onBack: () => void
}

/**
 * Crew select, as a wall of bounty posters.
 *
 * The art layer already draws a bust per character; here it is printed onto
 * aged paper — sepia, contrast raised, sat into a window with a printer's
 * border — so ten different palettes become one wall of paper with ten faces on
 * it. The selected sheet straightens, lifts off the boards and picks up the
 * lantern; the rest stay pinned at the angle they were hung at.
 */

/** Portraits are built once, lazily: they cost a canvas each. */
function useCrewPortraits(): Partial<Record<CrewId, string>> {
  const [urls, setUrls] = useState<Partial<Record<CrewId, string>>>({})
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    let cancelled = false
    void (async () => {
      try {
        const mod = (await import('../../art/characters')) as {
          buildCrewPortraits?: () => Record<CrewId, HTMLCanvasElement>
        }
        if (!mod.buildCrewPortraits || cancelled) return
        const built = mod.buildCrewPortraits()
        const out: Partial<Record<CrewId, string>> = {}
        for (const id of CREW_IDS) out[id] = built[id]?.toDataURL()
        if (!cancelled) setUrls(out)
      } catch {
        // No portraits in the art layer: the poster keeps its empty window and
        // the crew mark, which is a design the wall can live with.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])
  return urls
}

function WantedPoster({
  id,
  index,
  chosen,
  previewing,
  portrait,
  width,
  t,
  onPreview,
  onChoose,
  innerRef,
  motion,
}: {
  id: CrewId
  index: number
  /** The pick that will actually be played. */
  chosen: boolean
  /** Pointed at right now — reading it, not picking it. */
  previewing: boolean
  portrait?: string
  width: number
  t: TFunction
  onPreview: () => void
  onChoose: () => void
  innerRef: (el: HTMLElement | null) => void
  motion: boolean
}) {
  const crew = CREW[id]
  const angle = tilt(index, 3.4)
  // Three states, and the gap between them has to be legible at a glance:
  // pinned to the boards, lifted to be read, and straightened and sealed.
  const lift = chosen ? (motion ? -22 : -14) : previewing ? -10 : 0
  const scale = chosen ? (motion ? 1.16 : 1.12) : previewing ? 1.06 : 1
  return (
    <m.button
      ref={innerRef as (el: HTMLButtonElement | null) => void}
      type="button"
      role="radio"
      aria-checked={chosen}
      aria-label={`${crew.name} — ${t('crew.bounty')} ${formatBerry(BOUNTY[id])}`}
      onMouseEnter={onPreview}
      onFocus={onPreview}
      onClick={onChoose}
      animate={{ rotate: chosen ? 0 : angle * (previewing ? 0.4 : 1), y: lift, scale }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      style={{ width, zIndex: chosen ? 20 : previewing ? 15 : 10 - Math.abs(index % 3) }}
      className="relative shrink-0 origin-bottom"
    >
      <span
        className="pointer-events-none absolute inset-x-1 -bottom-2 h-6 rounded-[50%] blur-md"
        style={{ background: 'rgba(0,0,0,0.7)', opacity: chosen ? 0.85 : previewing ? 0.68 : 0.5 }}
      />
      <Paper
        seed={index + 3}
        edges="all"
        bite={2.1}
        age={chosen ? 0.4 : previewing ? 0.5 : 0.62}
        className="px-2 pb-2 pt-3"
        style={{
          filter: chosen
            ? 'brightness(1.08)'
            : previewing
              ? 'brightness(1)'
              : 'brightness(0.9) saturate(0.92)',
        }}
      >
        <span className="absolute left-1/2 top-1 -translate-x-1/2">
          <Nail size={width * 0.1} />
        </span>

        <div
          className="whitespace-nowrap text-center font-display leading-none ink"
          style={{ fontSize: width * 0.155, letterSpacing: '0.02em' }}
        >
          {t('crew.wanted')}
        </div>

        <div
          className="relative mx-auto mt-1.5 overflow-hidden border"
          style={{
            width: '100%',
            aspectRatio: '1 / 1',
            borderColor: 'rgba(42,29,20,0.7)',
            boxShadow: 'inset 0 0 12px rgba(60,36,14,0.55)',
            background: 'linear-gradient(160deg,#C7AC80,#9C825C)',
          }}
        >
          {chosen && (
            <span className="pointer-events-none absolute bottom-0.5 right-0.5 z-10 rotate-[9deg]">
              <WaxSeal size={width * 0.34} />
            </span>
          )}
          {portrait ? (
            <img
              src={portrait}
              alt=""
              className="h-full w-full object-cover"
              style={{ filter: 'sepia(1) saturate(1.7) contrast(1.35) brightness(0.86) hue-rotate(-12deg)' }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center opacity-40">
              <JollyRoger size={width * 0.5} bone="#5A4433" ink="#3A2A1C" band="#7A4038" straw="#8A7148" blades={false} />
            </div>
          )}
        </div>

        <div
          className="mt-1 text-center font-body font-bold uppercase ink"
          style={{ fontSize: width * 0.062, letterSpacing: '0.12em', opacity: 0.72 }}
        >
          {t('crew.deadOrAlive')}
        </div>

        <div
          className="text-center font-display leading-tight ink"
          style={{ fontSize: width * 0.175 }}
        >
          {crew.name}
        </div>

        <div className="mt-0.5 flex items-center justify-center gap-1 ink" style={{ fontSize: width * 0.082 }}>
          <BerryIcon size={width * 0.09} />
          <span className="font-body font-bold tabnum">{formatBerry(BOUNTY[id])}</span>
        </div>

        {/* The printer's imprint is flavour; below this width it can only be
            shown as an ellipsis, which is worse than leaving it off. */}
        {width >= 96 && (
          <div
            className="mt-1 truncate border-t pt-0.5 text-center font-body uppercase ink"
            style={{ borderColor: 'rgba(42,29,20,0.35)', fontSize: width * 0.05, opacity: 0.6, letterSpacing: '0.08em' }}
          >
            {t('crew.marine')}
          </div>
        )}

      </Paper>
    </m.button>
  )
}

function StatBar({
  label,
  value,
  accent,
  compact,
}: {
  label: string
  value: number
  accent: string
  compact: boolean
}) {
  const v = Math.max(1, Math.min(5, value))
  return (
    <div className={`flex items-center ${compact ? 'gap-2' : 'gap-3'}`}>
      <span
        className={`font-body text-[10px] font-semibold uppercase tracking-[0.16em] ${compact ? 'w-20' : 'w-24'}`}
        style={{ color: UI.inkSoft }}
      >
        {label}
      </span>
      <span className="flex gap-1">
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className={`rounded-[2px] ${compact ? 'h-1.5 w-5' : 'h-2.5 w-6'}`}
            style={{
              background: i < v ? accent : 'rgba(42,29,20,0.16)',
              // Print, not neon: the accent is knocked back to what a press could hold.
              filter: i < v ? 'saturate(0.72) brightness(0.78)' : undefined,
              boxShadow: i < v ? 'inset 0 -2px 0 rgba(0,0,0,0.28), 0 1px 0 rgba(255,255,255,0.35)' : 'inset 0 1px 2px rgba(42,29,20,0.35)',
            }}
          />
        ))}
      </span>
    </div>
  )
}

export function CrewScreen({ selected, onSelect, onStart, onBack }: Props) {
  const t = useT()
  const motion = useUiMotion()
  const portraits = useCrewPortraits()
  const [index, setIndex] = useState(() => Math.max(0, CREW_IDS.indexOf(selected)))
  /**
   * The sheet being read, which is not the sheet being played.
   *
   * Hovering used to commit the pick outright, and clicking a committed pick
   * set sail — so the pointer chose a nakama the moment it crossed a poster and
   * the very next click left the screen. There was no way to walk the wall and
   * look. Pointing now only lifts a sheet down to read; the pick changes on a
   * click, and only the button, Enter or the pad's A button sets sail.
   */
  const [preview, setPreview] = useState<number | null>(null)

  /**
   * Ten sheets fit the wall whenever there is room for them.
   *
   * A fixed poster width overflowed a laptop screen, which put two of the crew
   * off the edge and made the wall look truncated rather than scrollable. The
   * sheets shrink to fit instead, down to a floor — below that the faces stop
   * being readable, so the wall scrolls rather than shrinking further.
   */
  const wallRef = useRef<HTMLDivElement | null>(null)
  const [wallWidth, setWallWidth] = useState(0)
  useEffect(() => {
    const el = wallRef.current
    if (!el) return
    setWallWidth(el.clientWidth)
    const ro = new ResizeObserver(([entry]) => setWallWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  /**
   * A phone held sideways is 390px tall, and the wall, the dossier and the
   * button do not fit in that at full size — the header used to scroll off the
   * top and take the button with it. Below a threshold the whole screen packs
   * down, and the sheets are capped by the height left over rather than only by
   * the width.
   */
  const [viewportH, setViewportH] = useState(() =>
    typeof window === 'undefined' ? 800 : window.innerHeight)
  useEffect(() => {
    const onResize = () => setViewportH(window.innerHeight)
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])
  const compact = viewportH < 560

  const GAP = compact ? 8 : 12
  // A sheet runs about 1.45× as tall as it is wide.
  const roomForWall = viewportH - (compact ? 270 : 330)
  const posterWidth = wallWidth
    ? Math.floor(
        Math.max(
          compact ? 74 : 104,
          Math.min(
            140,
            (wallWidth - GAP * (CREW_IDS.length - 1)) / CREW_IDS.length,
            roomForWall / 1.45,
          ),
        ),
      )
    : 130

  useEffect(() => {
    const i = CREW_IDS.indexOf(selected)
    if (i >= 0) setIndex(i)
  }, [selected])

  const choose = (i: number) => {
    setPreview(i)
    if (i === index) return
    setIndex(i)
    onSelect(CREW_IDS[i])
  }

  const { itemRef } = useMenuNav({
    count: CREW_IDS.length,
    index,
    onIndex: (i) => {
      setIndex(i)
      onSelect(CREW_IDS[i])
    },
    onConfirm: onStart,
    onBack,
    orientation: 'horizontal',
    armMs: 320,
  })

  const shownIndex = preview ?? index
  const id = CREW_IDS[shownIndex] ?? selected
  const isChosen = shownIndex === index
  const crew = CREW[id]
  const blurb = t(`crew.blurb.${id}` as TranslationKey)
  const speed = useMemo(() => Math.round((crew.runSpeed - 130) / 11), [crew.runSpeed])
  const jump = useMemo(() => Math.round((crew.jumpTiles - 2.9) * 5), [crew.jumpTiles])
  const special = crew.airJumps > 0 ? 5 : Math.round(6 - crew.attackTime * 12)

  return (
    <m.div
      key="crew"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: motion ? 0.3 : 0 }}
      className="wood relative flex h-full w-full flex-col items-center justify-center overflow-hidden"
    >
      {/* lantern wash from the upper left, and the dark of the hold everywhere else */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 62% 50% at 28% 6%, rgba(255,197,110,0.14) 0%, rgba(255,197,110,0) 60%), radial-gradient(ellipse 86% 74% at 50% 46%, rgba(0,0,0,0.3) 25%, rgba(0,0,0,0.86) 100%)',
        }}
      />

      <header className="relative z-10 flex flex-col items-center">
        <h2 className={`op-title text-op-gold ${compact ? 'text-2xl' : 'text-3xl sm:text-4xl'}`}>
          {t('crew.title')}
        </h2>
        {!compact && (
          <div className="mt-1 flex items-center gap-3 opacity-80">
            <Rope length={90} thickness={11} />
            <span className="font-body text-[10px] uppercase tracking-[0.34em] text-op-parchment/70">
              {t('crew.subtitle')}
            </span>
            <Rope length={90} thickness={11} />
          </div>
        )}
      </header>

      {/* The wall. The rope the posters hang from runs behind them. */}
      <div className={`relative z-10 w-full ${compact ? 'mt-1' : 'mt-6'}`}>
        <div
          className="pointer-events-none absolute inset-x-0 flex justify-center opacity-70"
          style={{ top: compact ? 14 : 24 }}
        >
          <Rope length={1400} thickness={13} className="w-[96%]" />
        </div>
        {/*
          The scroller and the row are separate boxes on purpose. A centred flex
          row that overflows its scroller spills past both edges, and the left
          spill is unreachable — scrollLeft has no negative side — so on a phone
          the first posters simply could not be got to. Sizing the row to its
          own content and centring it with auto margins keeps it centred while
          it fits and scrollable from the first poster once it does not.
        */}
        <div
          ref={wallRef}
          className={`w-full overflow-x-auto px-6 ${compact ? 'pb-1 pt-5' : 'pb-6 pt-12'}`}
        >
          <div
            role="radiogroup"
            aria-label={t('crew.title')}
            // Leaving the wall drops the sheet back: the dossier returns to the
            // pick, so crossing the row on the way to the button cannot quietly
            // leave a different nakama showing.
            onMouseLeave={() => setPreview(null)}
            style={{ gap: GAP }}
            className="mx-auto flex w-max items-start"
          >
            {CREW_IDS.map((cid, i) => (
              <WantedPoster
                key={cid}
                id={cid}
                index={i}
                chosen={i === index}
                previewing={preview === i && i !== index}
                portrait={portraits[cid]}
                width={posterWidth}
                t={t}
                motion={motion}
                innerRef={itemRef(i)}
                onPreview={() => setPreview(i)}
                onChoose={() => choose(i)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Dossier for the selected sheet. */}
      <div className={`relative z-10 w-[min(680px,94vw)] ${compact ? 'mt-0' : 'mt-1'}`}>
        <Paper
          seed={99}
          edges="sides"
          bite={1.1}
          age={0.45}
          className={compact ? 'px-4 py-1.5' : 'px-6 py-4'}
        >
          <span className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 opacity-[0.07]">
            <JollyRoger size={150} bone={UI.ink} ink={UI.ink} band={UI.ink} straw={UI.ink} />
          </span>
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-baseline gap-3">
                <span className={`font-display leading-none ink ${compact ? 'text-2xl' : 'text-3xl'}`}>
                  {crew.name}
                </span>
                <span
                  className="rounded-xs px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-[0.18em]"
                  style={{ background: crew.accent, color: '#1A1008' }}
                >
                  {t('crew.special')}
                </span>
                <span
                  className="rounded-xs border px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-[0.18em]"
                  style={
                    isChosen
                      ? { borderColor: UI.wax, background: 'rgba(142,43,34,0.14)', color: UI.wax }
                      : { borderColor: 'rgba(42,29,20,0.35)', color: UI.inkSoft }
                  }
                >
                  {t(isChosen ? 'crew.chosen' : 'crew.choosePrompt')}
                </span>
              </div>
              <p
                className={`max-w-104 font-body leading-snug ${compact ? 'mt-1 text-xs' : 'mt-1.5 text-sm'}`}
                style={{ color: UI.inkSoft }}
              >
                {blurb}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-body text-[10px] uppercase tracking-[0.2em]" style={{ color: UI.inkSoft }}>
                {t('crew.bounty')}
              </div>
              <div className="flex items-center justify-end gap-1 ink">
                <BerryIcon size={16} />
                <span className="font-display text-2xl leading-none tabnum">{formatBerry(BOUNTY[id])}</span>
              </div>
            </div>
          </div>

          <div
            className={`flex flex-col border-t ${compact ? 'mt-1.5 gap-1 pt-1.5' : 'mt-3 gap-1.5 pt-3'}`}
            style={{ borderColor: 'rgba(42,29,20,0.25)' }}
          >
            <StatBar label={t('crew.speed')} value={speed} accent={crew.accent} compact={compact} />
            <StatBar label={t('crew.jump')} value={jump} accent={crew.accent} compact={compact} />
            <StatBar label={t('crew.special')} value={special} accent={crew.accent} compact={compact} />
          </div>
        </Paper>
      </div>

      <div className={`relative z-10 flex items-center gap-3 ${compact ? 'mb-1.5 mt-2' : 'mb-4 mt-4'}`}>
        <button
          className={`op-button ${compact ? 'py-1.5' : ''}`}
          onClick={onBack}
          aria-label={t('crew.back')}
        >
          ←
        </button>
        <button
          className={`op-button op-button--primary ${compact ? 'py-1.5' : 'text-lg'}`}
          onClick={onStart}
        >
          {t('crew.start')}
        </button>
      </div>
      {!compact && (
        <div className="relative z-10 mb-3 font-body text-[10px] uppercase tracking-[0.22em] text-op-parchment/45">
          {t('crew.hint')}
        </div>
      )}
    </m.div>
  )
}
