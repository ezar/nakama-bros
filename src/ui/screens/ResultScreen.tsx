import { useEffect, useMemo, useState } from 'react'
import { motion as m } from 'framer-motion'
import type { CrewId, LevelResult } from '../../types'
import { CREW } from '../../game/config'
import { useProgress } from '../../store/progressStore'
import { useT } from '../../i18n/useT'
import { useCountUp } from '../hooks/useCountUp'
import { useMenuNav } from '../hooks/useMenuNav'
import { useUiMotion } from '../hooks/useUiMotion'
import { Paper } from '../art/Paper'
import { BerryIcon, FragmentIcon, Nail, WaxSeal } from '../art/Icons'
import { RANK_COLOR, UI, formatBerry, rankFor } from '../theme'
import { GiftDrawing } from '../GiftDrawing'

interface Props {
  result: LevelResult
  onNext: () => void
  onRetry: () => void
  hasNext: boolean
  /**
   * Fired repeatedly while the bounty is being written, and once when a stamp
   * lands. Wire them to the counter and the stamp thump.
   */
  onTick?: () => void
  onStamp?: () => void
}

/**
 * Level clear, as a bounty being issued.
 *
 * The poster drops in on its nail, the number is written up in front of you,
 * and the rank is stamped on top of the wet ink. Everything else — time,
 * berries, fragments, falls — is the clerk's small print underneath.
 */

function RankStamp({ rank, visible }: { rank: string; visible: boolean }) {
  const color = RANK_COLOR[rank as keyof typeof RANK_COLOR] ?? UI.wax
  if (!visible) return null
  return (
    <div className="animate-seal-thump" style={{ transformOrigin: 'center' }}>
      <svg viewBox="0 0 96 96" width={92} height={92} aria-label={`rank ${rank}`} role="img">
        <g stroke={color} fill="none" opacity={0.85}>
          {/* two rings, deliberately not concentric — a hand-pressed stamp */}
          <circle cx={48} cy={48} r={42} strokeWidth={3.4} strokeDasharray="150 6 90 5" />
          <circle cx={47} cy={49} r={35} strokeWidth={1.6} strokeDasharray="120 7" />
        </g>
        <text
          x={48}
          y={62}
          textAnchor="middle"
          fontFamily="'Pirata One', Georgia, serif"
          fontSize={46}
          fill={color}
          opacity={0.9}
        >
          {rank}
        </text>
        <text
          x={48}
          y={22}
          textAnchor="middle"
          fontFamily="'Rubik', sans-serif"
          fontSize={8}
          fontWeight={800}
          letterSpacing={2}
          fill={color}
          opacity={0.75}
        >
          MARINE
        </text>
      </svg>
    </div>
  )
}

function Row({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b py-1.5" style={{ borderColor: 'rgba(42,29,20,0.22)' }}>
      <span className="flex items-center gap-1.5 font-body text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: UI.inkSoft }}>
        {icon}
        {label}
      </span>
      <span className="font-body text-base font-extrabold tabnum ink">{value}</span>
    </div>
  )
}

export function ResultScreen({ result, onNext, onRetry, hasNext, onTick, onStamp }: Props) {
  const t = useT()
  const motion = useUiMotion()
  const crewId = useProgress((s) => s.crew) as CrewId
  const crew = CREW[crewId] ?? CREW.luffy
  const best = useProgress((s) => s.records[result.levelId]?.bestScore ?? 0)
  const rank = useMemo(() => rankFor(result), [result])

  const [portrait, setPortrait] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const mod = (await import('../../art/characters')) as {
          buildCrewPortraits?: () => Record<CrewId, HTMLCanvasElement>
        }
        const built = mod.buildCrewPortraits?.()
        if (live && built?.[crewId]) setPortrait(built[crewId].toDataURL())
      } catch {
        /* the poster works without a likeness */
      }
    })()
    return () => {
      live = false
    }
  }, [crewId])

  const bounty = useCountUp(result.score, {
    duration: motion ? 1400 : 0,
    delay: motion ? 420 : 0,
    enabled: motion,
    onTick,
  })

  // Rank S needs every fragment in the stage and a run without dying, so this
  // fires rarely and means something when it does.
  const giftEarned = useProgress((s) => s.giftEarned)
  const earnGift = useProgress((s) => s.earnGift)
  const firstTime = rank === 'S' && !giftEarned
  useEffect(() => { if (rank === 'S') earnGift() }, [rank, earnGift])

  const [stamped, setStamped] = useState(!motion)
  useEffect(() => {
    if (!motion) return
    const id = window.setTimeout(() => {
      setStamped(true)
      onStamp?.()
    }, 2050)
    return () => window.clearTimeout(id)
  }, [motion, onStamp])

  const actions = useMemo(
    () => (hasNext ? [{ label: t('clear.next'), run: onNext }, { label: t('clear.retry'), run: onRetry }]
      : [{ label: t('clear.retry'), run: onRetry }]),
    [hasNext, onNext, onRetry, t],
  )
  const [index, setIndex] = useState(0)
  const { itemRef } = useMenuNav({
    count: actions.length,
    index,
    onIndex: setIndex,
    onConfirm: (i) => actions[i]?.run(),
    orientation: 'horizontal',
    armMs: 900,
  })

  const isRecord = best > 0 && best === result.score

  return (
    <m.div
      key="result"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(6,4,2,0.82)] backdrop-blur-[3px]"
    >
      <div className="flex flex-col items-center">
        <m.div
          initial={motion ? { y: -620, rotate: -13 } : false}
          animate={{ y: 0, rotate: -1.4 }}
          transition={{ type: 'spring', stiffness: 90, damping: 13, mass: 1.1 }}
          className="relative"
          style={{ filter: 'drop-shadow(0 22px 26px rgba(0,0,0,0.75))' }}
        >
          <Paper seed={21} edges="all" bite={1.9} age={0.4} className="w-[min(430px,92vw)] px-6 pb-5 pt-6">
            <span className="absolute left-1/2 top-1.5 -translate-x-1/2">
              <Nail size={16} />
            </span>

            <div className="text-center">
              <div className="font-body text-[10px] font-extrabold uppercase tracking-[0.34em]" style={{ color: UI.inkSoft }}>
                {t('clear.poster')}
              </div>
              <div className="font-display text-4xl leading-none ink">{t('crew.wanted')}</div>
            </div>

            <div className="mt-3 flex gap-4">
              <div
                className="h-[104px] w-[104px] shrink-0 overflow-hidden border"
                style={{
                  borderColor: 'rgba(42,29,20,0.7)',
                  boxShadow: 'inset 0 0 12px rgba(60,36,14,0.55)',
                  background: 'linear-gradient(160deg,#C7AC80,#9C825C)',
                }}
              >
                {portrait && (
                  <img
                    src={portrait}
                    alt=""
                    className="h-full w-full object-cover"
                    style={{ filter: 'sepia(1) saturate(1.7) contrast(1.35) brightness(0.86) hue-rotate(-12deg)' }}
                  />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="font-display text-3xl leading-none ink">{crew.name}</div>
                <div className="font-body text-[9px] font-bold uppercase tracking-[0.22em]" style={{ color: UI.inkSoft }}>
                  {t('crew.deadOrAlive')}
                </div>
                <div className="mt-2 flex items-center gap-1.5 ink">
                  <BerryIcon size={18} />
                  <span className="font-display text-[26px] leading-none tabnum">{formatBerry(bounty)}</span>
                </div>
                {isRecord && (
                  <div
                    className="mt-1 inline-block -rotate-3 rounded-xs px-1.5 py-0.5 font-body text-[9px] font-extrabold uppercase tracking-[0.18em]"
                    style={{ background: UI.wax, color: UI.paperLit }}
                  >
                    {t('clear.record')}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-3">
              <Row label={t('clear.time')} value={`${Math.floor(result.timeLeft)}s`} />
              <Row label={t('clear.berries')} value={result.berries} />
              <Row
                label={t('clear.fragments')}
                value={
                  <span className="flex items-center gap-1">
                    {Array.from({ length: 3 }, (_, i) => (
                      <FragmentIcon key={i} size={17} lit={i < result.fragments} />
                    ))}
                  </span>
                }
              />
              <Row label={t('clear.deaths')} value={result.deaths} />
            </div>

            <div className="mt-2 flex items-end justify-between">
              <div className="font-body text-[9px] uppercase tracking-[0.16em]" style={{ color: UI.inkSoft, opacity: 0.75 }}>
                {t('clear.signed')}
              </div>
              <span className="opacity-90">
                <WaxSeal size={54} />
              </span>
            </div>

            {/* the stamp lands on top of everything, slightly off-square */}
            <div className="pointer-events-none absolute right-3 top-16">
              <RankStamp rank={rank} visible={stamped} />
            </div>
          </Paper>
        </m.div>

        {/* The drawing lands after the stamp, so the beat is: bounty, rank,
            reward. Only on an S, and only the first time — after that it lives
            in the options panel and this screen stays about the run. */}
        {firstTime && (
          <m.div
            initial={motion ? { opacity: 0, y: 10 } : false}
            animate={motion ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: motion ? 2.5 : 0 }}
            className="mt-5 flex flex-col items-center"
          >
            <div
              className="mb-2 font-body text-[10px] uppercase tracking-[0.22em]"
              style={{ color: UI.brassLit }}
            >
              {t('gift.unlocked')}
            </div>
            <GiftDrawing width={176} tilt={-2.2} />
          </m.div>
        )}

        <m.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: motion ? 2.2 : 0 }}
          className="mt-5 flex gap-3"
        >
          {actions.map((a, i) => (
            <button
              key={a.label}
              ref={itemRef(i) as (el: HTMLButtonElement | null) => void}
              className={`op-button ${i === 0 && hasNext ? 'op-button--primary' : ''}`}
              onMouseEnter={() => setIndex(i)}
              onClick={a.run}
            >
              {a.label}
            </button>
          ))}
        </m.div>
      </div>
    </m.div>
  )
}
