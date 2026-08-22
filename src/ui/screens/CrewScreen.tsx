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
  active,
  portrait,
  width,
  t,
  onSelect,
  onConfirm,
  innerRef,
  motion,
}: {
  id: CrewId
  index: number
  active: boolean
  portrait?: string
  width: number
  t: TFunction
  onSelect: () => void
  onConfirm: () => void
  innerRef: (el: HTMLElement | null) => void
  motion: boolean
}) {
  const crew = CREW[id]
  const angle = tilt(index, 3.4)
  return (
    <m.button
      ref={innerRef as (el: HTMLButtonElement | null) => void}
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={`${crew.name} — ${t('crew.bounty')} ${formatBerry(BOUNTY[id])}`}
      onMouseEnter={onSelect}
      onFocus={onSelect}
      onClick={onConfirm}
      animate={
        motion
          ? { rotate: active ? 0 : angle, y: active ? -22 : 0, scale: active ? 1.16 : 1 }
          : { rotate: active ? 0 : angle, y: active ? -14 : 0, scale: active ? 1.12 : 1 }
      }
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      style={{ width, zIndex: active ? 20 : 10 - Math.abs(index % 3) }}
      className="relative shrink-0 origin-bottom"
    >
      <span
        className="pointer-events-none absolute inset-x-1 -bottom-2 h-6 rounded-[50%] blur-md"
        style={{ background: 'rgba(0,0,0,0.7)', opacity: active ? 0.85 : 0.5 }}
      />
      <Paper
        seed={index + 3}
        edges="all"
        bite={2.1}
        age={active ? 0.4 : 0.62}
        className="px-2 pb-2 pt-3"
        style={{ filter: active ? 'brightness(1.08)' : 'brightness(0.9) saturate(0.92)' }}
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
          {active && (
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

        <div
          className="mt-1 border-t pt-0.5 text-center font-body uppercase ink"
          style={{ borderColor: 'rgba(42,29,20,0.35)', fontSize: width * 0.05, opacity: 0.6, letterSpacing: '0.08em' }}
        >
          {t('crew.marine')}
        </div>

      </Paper>
    </m.button>
  )
}

function StatBar({ label, value, accent }: { label: string; value: number; accent: string }) {
  const v = Math.max(1, Math.min(5, value))
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 font-body text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: UI.inkSoft }}>
        {label}
      </span>
      <span className="flex gap-1">
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className="h-2.5 w-6 rounded-[2px]"
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

  useEffect(() => {
    const i = CREW_IDS.indexOf(selected)
    if (i >= 0) setIndex(i)
  }, [selected])

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

  const id = CREW_IDS[index] ?? selected
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
        <h2 className="op-title text-3xl text-op-gold sm:text-4xl">{t('crew.title')}</h2>
        <div className="mt-1 flex items-center gap-3 opacity-80">
          <Rope length={90} thickness={11} />
          <span className="font-body text-[10px] uppercase tracking-[0.34em] text-op-parchment/70">
            {t('crew.subtitle')}
          </span>
          <Rope length={90} thickness={11} />
        </div>
      </header>

      {/* The wall. The rope the posters hang from runs behind them. */}
      <div className="relative z-10 mt-6 w-full">
        <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center opacity-70">
          <Rope length={1400} thickness={13} className="w-[96%]" />
        </div>
        <div
          role="radiogroup"
          aria-label={t('crew.title')}
          className="flex w-full items-start justify-center gap-2 overflow-x-auto px-4 pb-6 pt-12 sm:gap-3"
        >
          {CREW_IDS.map((cid, i) => (
            <WantedPoster
              key={cid}
              id={cid}
              index={i}
              active={i === index}
              portrait={portraits[cid]}
              width={130}
              t={t}
              motion={motion}
              innerRef={itemRef(i)}
              onSelect={() => {
                if (i === index) return
                setIndex(i)
                onSelect(cid)
              }}
              onConfirm={() => {
                if (i === index) onStart()
                else {
                  setIndex(i)
                  onSelect(cid)
                }
              }}
            />
          ))}
        </div>
      </div>

      {/* Dossier for the selected sheet. */}
      <div className="relative z-10 mt-1 w-[min(680px,94vw)]">
        <Paper seed={99} edges="sides" bite={1.1} age={0.45} className="px-6 py-4">
          <span className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 opacity-[0.07]">
            <JollyRoger size={150} bone={UI.ink} ink={UI.ink} band={UI.ink} straw={UI.ink} />
          </span>
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-baseline gap-3">
                <span className="font-display text-3xl leading-none ink">{crew.name}</span>
                <span
                  className="rounded-xs px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-[0.18em]"
                  style={{ background: crew.accent, color: '#1A1008' }}
                >
                  {t('crew.special')}
                </span>
              </div>
              <p className="mt-1.5 max-w-104 font-body text-sm leading-snug" style={{ color: UI.inkSoft }}>
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

          <div className="mt-3 flex flex-col gap-1.5 border-t pt-3" style={{ borderColor: 'rgba(42,29,20,0.25)' }}>
            <StatBar label={t('crew.speed')} value={speed} accent={crew.accent} />
            <StatBar label={t('crew.jump')} value={jump} accent={crew.accent} />
            <StatBar label={t('crew.special')} value={special} accent={crew.accent} />
          </div>
        </Paper>
      </div>

      <div className="relative z-10 mb-4 mt-4 flex items-center gap-3">
        <button className="op-button" onClick={onBack} aria-label={t('crew.back')}>
          ←
        </button>
        <button className="op-button op-button--primary text-lg" onClick={onStart}>
          {t('crew.start')}
        </button>
      </div>
      <div className="relative z-10 mb-3 font-body text-[10px] uppercase tracking-[0.22em] text-op-parchment/45">
        {t('crew.hint')}
      </div>
    </m.div>
  )
}
