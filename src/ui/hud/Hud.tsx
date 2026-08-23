import { memo, useEffect, useRef, useState } from 'react'
import type { HudSnapshot } from '../../types'
import { CREW } from '../../game/config'
import { useT } from '../../i18n/useT'
import { BerryIcon, FragmentIcon, HatLife } from '../art/Icons'
import { UI } from '../theme'

/**
 * The heads-up display.
 *
 * DOM rather than canvas, so it stays crisp at any scale and assistive tech can
 * read it. Everything lives in the corners on brass-cornered wood or on a strip
 * of parchment: the play space is never covered, and nothing here moves unless
 * the value behind it changed.
 */

export interface CompassReading {
  /** Radians, screen space: 0 points right, positive turns clockwise. */
  angle: number
  /** World units to the goal, for the confidence of the needle. */
  dist: number
}

interface Props {
  hud: HudSnapshot
  /**
   * Sampled every frame by the Log Pose. A function rather than a value so the
   * needle can track the player without re-rendering React sixty times a second.
   */
  compass?: () => CompassReading | null
  /** Touch controls are up: drop the corner instruments they would collide with. */
  compact?: boolean
}

const TIER_LABEL: Record<string, string> = {
  base: '',
  gear2: 'GEAR 2',
  gear3: 'GEAR 3',
  gear4: 'GEAR 4',
}

const TIER_COLOR: Record<string, string> = {
  base: '#9AA8C4',
  gear2: '#E05A2B',
  gear3: '#7FD4FF',
  gear4: '#B370D8',
}

/* ── Surfaces ────────────────────────────────────────────────────────────── */

/** Oak with brass corner brackets — the frame every HUD group sits in. */
function Plaque({
  children,
  className = '',
  accent = UI.brass,
}: {
  children: React.ReactNode
  className?: string
  accent?: string
}) {
  return (
    <div
      className={`relative rounded-[5px] border px-2.5 py-1.5 ${className}`}
      style={{
        borderColor: 'rgba(124,90,33,0.85)',
        backgroundImage:
          'linear-gradient(180deg, rgba(255,226,180,0.1), rgba(0,0,0,0.35)), linear-gradient(170deg,#3E2716,#1A0F07)',
        boxShadow: '0 3px 0 rgba(12,6,2,0.9), 0 8px 18px -8px rgba(0,0,0,0.95), inset 0 1px 0 rgba(255,226,180,0.16)',
      }}
    >
      {/* four brass corner brackets */}
      {[
        'left-[2px] top-[2px]',
        'right-[2px] top-[2px] rotate-90',
        'right-[2px] bottom-[2px] rotate-180',
        'left-[2px] bottom-[2px] -rotate-90',
      ].map((pos) => (
        <span key={pos} className={`pointer-events-none absolute ${pos}`}>
          <svg viewBox="0 0 10 10" width={8} height={8} aria-hidden="true">
            <path d="M0.8 9 V 2.2 A 1.4 1.4 0 0 1 2.2 0.8 H 9" fill="none" stroke={accent} strokeWidth={1.6} strokeLinecap="round" />
          </svg>
        </span>
      ))}
      {children}
    </div>
  )
}

/** A torn strip of parchment, for values that read as written down. */
function Strip({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`relative px-2.5 py-1 ${className}`}
      style={{
        backgroundImage: `linear-gradient(172deg, ${UI.paper}, ${UI.paperDim})`,
        clipPath:
          'polygon(0.6% 6%, 12% 0%, 34% 5%, 58% 0%, 82% 6%, 99% 2%, 100% 94%, 84% 100%, 60% 95%, 33% 100%, 12% 95%, 0% 99%)',
        boxShadow: '0 6px 14px -6px rgba(0,0,0,0.9)',
      }}
    >
      <div className="paper-grain pointer-events-none absolute inset-0 opacity-25" />
      {children}
    </div>
  )
}

/* ── Numbers that move ───────────────────────────────────────────────────── */

/**
 * A number on rolling drums. Each digit is a strip of 0-9 slid into place, so a
 * score change reads as counters turning rather than as text swapping.
 */
function Rolling({
  value,
  digits = 6,
  className = '',
  style,
}: {
  value: number
  digits?: number
  className?: string
  style?: React.CSSProperties
}) {
  const text = Math.max(0, Math.floor(value)).toString().padStart(digits, '0')
  return (
    <span className={`inline-flex tabnum ${className}`} style={style} aria-label={String(value)}>
      {[...text].map((ch, i) => (
        <span key={i} className="relative inline-block h-[1em] w-[0.62em] overflow-hidden leading-none">
          <span
            className="absolute left-0 top-0 flex flex-col will-change-transform"
            style={{
              transform: `translateY(${-Number(ch)}em)`,
              transition: 'transform 420ms cubic-bezier(0.22,0.9,0.24,1)',
            }}
          >
            {['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <span key={d} className="block h-[1em] text-center leading-none">
                {d}
              </span>
            ))}
          </span>
        </span>
      ))}
    </span>
  )
}

/* ── Log Pose ────────────────────────────────────────────────────────────── */

/**
 * The Log Pose: a needle in a glass bubble that holds the bearing to the goal.
 *
 * It reads the bearing from a callback on every animation frame and writes a
 * transform straight to the element — React never sees it. The needle chases
 * the true bearing along the short way round, so it swings rather than snaps.
 */
function LogPose({ sample, motion, label }: { sample: () => CompassReading | null; motion: boolean; label: string }) {
  const needle = useRef<SVGGElement>(null)
  const shown = useRef<number | null>(null)

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const r = sample()
      if (!r || !needle.current) return
      const target = (r.angle * 180) / Math.PI
      if (shown.current === null || !motion) shown.current = target
      else {
        let delta = ((target - shown.current + 540) % 360) - 180
        // Critically-damped-ish chase: fast enough to feel live, slow enough
        // to look like a needle floating in fluid.
        shown.current += delta * Math.min(1, dt * 9)
      }
      needle.current.style.transform = `rotate(${shown.current.toFixed(2)}deg)`
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [sample, motion])

  return (
    <div className="relative" title={label} aria-label={label} role="img">
      <svg viewBox="0 0 72 72" width={74} height={74} aria-hidden="true">
        <defs>
          <radialGradient id="lp-glass" cx="36%" cy="28%" r="70%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.5} />
            <stop offset="45%" stopColor="#BFE6F2" stopOpacity={0.12} />
            <stop offset="100%" stopColor="#04121E" stopOpacity={0.5} />
          </radialGradient>
          <linearGradient id="lp-brass" x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0%" stopColor="#F4DC9C" />
            <stop offset="40%" stopColor="#C8973F" />
            <stop offset="72%" stopColor="#6D4A1A" />
            <stop offset="100%" stopColor="#C08F3C" />
          </linearGradient>
        </defs>
        {/* bracelet strap behind the case */}
        <path d="M14 20 C 6 30, 6 44, 14 54" fill="none" stroke="#4A2E1B" strokeWidth={7} strokeLinecap="round" />
        <path d="M58 20 C 66 30, 66 44, 58 54" fill="none" stroke="#4A2E1B" strokeWidth={7} strokeLinecap="round" />
        <circle cx={36} cy={36} r={30} fill="url(#lp-brass)" />
        <circle cx={36} cy={36} r={24.5} fill="#0A1A26" />
        {/* dial ticks */}
        {Array.from({ length: 16 }, (_, i) => (
          <rect
            key={i}
            x={35.4}
            y={13.5}
            width={1.2}
            height={i % 4 === 0 ? 5 : 2.6}
            rx={0.6}
            fill={i % 4 === 0 ? UI.brassLit : 'rgba(241,211,134,0.45)'}
            transform={`rotate(${i * 22.5} 36 36)`}
          />
        ))}
        <g ref={needle} style={{ transformOrigin: '36px 36px' }}>
          <path d="M36 36 L 22 31.6 L 22 40.4 Z" fill="#8FA7BC" />
          <path d="M36 36 L 57 32.2 L 57 39.8 Z" fill={UI.wax} />
          <path d="M36 36 L 57 32.2 L 57 36 Z" fill={UI.waxLit} />
        </g>
        <circle cx={36} cy={36} r={3.2} fill={UI.brassLit} stroke="#5A3E12" strokeWidth={1} />
        <circle cx={36} cy={36} r={24.5} fill="url(#lp-glass)" />
        <path d="M20 26 C 25 18, 44 15, 52 21" fill="none" stroke="#FFFFFF" strokeWidth={2.6} opacity={0.28} strokeLinecap="round" />
        <circle cx={36} cy={36} r={29} fill="none" stroke="#3A2810" strokeWidth={1.4} opacity={0.8} />
      </svg>
    </div>
  )
}

/* ── HUD ─────────────────────────────────────────────────────────────────── */

export const Hud = memo(function Hud({ hud, compass, compact = false }: Props) {
  const t = useT()
  const seconds = Math.max(0, Math.ceil(hud.time))
  const urgent = seconds <= 30
  const crew = CREW[hud.crew]

  // Fragments flare the moment they land, once, then sit still.
  const prevFrags = useRef(hud.fragments)
  const [flare, setFlare] = useState<number[]>(() => hud.fragments.map(() => 0))
  useEffect(() => {
    const prev = prevFrags.current
    const gained = hud.fragments.map((got, i) => got && !prev[i])
    prevFrags.current = hud.fragments
    if (!gained.some(Boolean)) return
    const now = Date.now()
    setFlare((f) => hud.fragments.map((_, i) => (gained[i] ? now + i : (f[i] ?? 0))))
  }, [hud.fragments])

  // The boss bar's ghost: the damage that was done, shown a beat later so the
  // size of the hit is legible after the hit has already landed.
  const health = hud.bossHealth ?? 0
  const [ghost, setGhost] = useState(health)
  useEffect(() => {
    if (health > ghost) {
      setGhost(health)
      return
    }
    if (health === ghost) return
    const id = window.setTimeout(() => setGhost(health), 380)
    return () => window.clearTimeout(id)
  }, [health, ghost])

  const lives = Math.max(0, hud.lives)
  const motion =
    typeof window !== 'undefined' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches

  return (
    <div
      // Inset, not padded. Every child here is absolutely positioned, and an
      // absolute child measures from its container's *padding box* — padding
      // sits inside that box, so it moved none of them and the plaque still
      // ran under the notch. Shrinking the box itself is what they follow.
      className="pointer-events-none absolute select-none"
      style={{
        top: 'calc(0.5rem + var(--safe-t))',
        right: 'calc(0.5rem + var(--safe-r))',
        bottom: 'calc(0.5rem + var(--safe-b))',
        left: 'calc(0.5rem + var(--safe-l))',
      }}
    >
      {/* ── Top left: who, how many lives, what gear ── */}
      <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
        <Plaque accent={crew.accent} className="flex items-center gap-2.5">
          <span
            className="inline-block h-2.5 w-2.5 rotate-45"
            style={{ background: crew.accent, boxShadow: `0 0 9px ${crew.accent}` }}
          />
          <span className="font-body text-xs font-bold uppercase tracking-[0.14em] text-op-cream">
            {crew.name}
          </span>
          <span className="flex items-center gap-1" aria-label={`${t('hud.lives')}: ${lives}`}>
            {/* One hat and a count beats four small hats: at HUD size a row of
                repeated icons turns to mush before the number does. */}
            <HatLife size={19} empty={lives <= 0} />
            <span className="font-body text-xs font-extrabold tabnum text-op-parchment">×{lives}</span>
          </span>
          {hud.tier !== 'base' && (
            <span
              className="rounded-xs px-1.5 py-0.5 font-body text-[9px] font-extrabold tracking-[0.12em]"
              style={{
                color: '#140B04',
                background: TIER_COLOR[hud.tier],
                boxShadow: `0 0 12px ${TIER_COLOR[hud.tier]}88`,
              }}
            >
              {TIER_LABEL[hud.tier]}
            </span>
          )}
        </Plaque>

        {hud.fragments.length > 0 && (
          <div
            className="flex items-center gap-1 rounded-[4px] border px-1.5 py-1"
            style={{ borderColor: 'rgba(124,90,33,0.5)', background: 'rgba(10,6,3,0.55)' }}
            aria-label={`${t('hud.fragments')}: ${hud.fragments.filter(Boolean).length}/${hud.fragments.length}`}
          >
            {hud.fragments.map((got, i) => (
              <span
                key={i}
                className="inline-flex"
                style={{
                  animation: got && flare[i] && motion ? 'flare 520ms ease-out' : undefined,
                  transformOrigin: 'center',
                }}
              >
                <FragmentIcon size={16} lit={got} />
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Top right: purse, score, clock ── */}
      <div className="absolute right-3 top-3 flex flex-col items-end gap-1.5">
        <Strip className="flex items-center gap-2">
          <span style={{ color: '#7C5A21' }}>
            <BerryIcon size={16} />
          </span>
          <Rolling
            value={hud.berries}
            digits={2}
            className="font-body text-sm font-extrabold"
            style={{ color: UI.ink }}
          />
          <span className="h-3 w-px" style={{ background: 'rgba(42,29,20,0.35)' }} />
          <Rolling
            value={hud.score}
            digits={6}
            className="font-body text-sm font-extrabold"
            style={{ color: UI.ink }}
          />
        </Strip>

        <Plaque
          accent={urgent ? UI.wax : UI.brass}
          className={`flex items-center gap-1.5 ${urgent && motion ? 'animate-clock-urgent' : ''}`}
        >
          <span
            className="font-body text-base font-extrabold tabnum leading-none"
            style={{
              color: urgent ? '#FF6B5E' : '#FFF3D6',
              textShadow: urgent ? '0 0 14px rgba(214,48,49,0.9)' : '0 1px 0 rgba(0,0,0,0.7)',
            }}
          >
            {String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}
          </span>
        </Plaque>
      </div>

      {/* ── Bottom right: the Log Pose ── */}
      {compass && !compact && (
        <div className="absolute bottom-3 right-3 opacity-95">
          <LogPose sample={compass} motion={motion} label={t('hud.compass')} />
        </div>
      )}

      {/* ── Bottom centre: the boss ── */}
      {hud.bossHealth !== null && (
        <div className="absolute inset-x-0 bottom-6 mx-auto w-[min(440px,74%)]">
          <div className="mb-1 text-center font-display text-lg leading-none tracking-[0.18em] text-op-wax-light drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
            {hud.bossName}
          </div>
          <div
            className="relative h-3.5 overflow-hidden rounded-[3px] border-2"
            style={{
              borderColor: '#7C5A21',
              background: 'linear-gradient(180deg,#150C06,#2A180C)',
              boxShadow: '0 4px 14px -4px rgba(0,0,0,0.95), inset 0 2px 6px rgba(0,0,0,0.8)',
            }}
            role="progressbar"
            aria-label={hud.bossName ?? t('hud.boss')}
            aria-valuenow={Math.round(health * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            {/* ghost: the damage just taken, draining a beat behind */}
            <div
              className="absolute inset-y-0 left-0"
              style={{
                width: `${Math.max(0, ghost) * 100}%`,
                background: 'linear-gradient(180deg,#FFE9AE,#E8A33A)',
                opacity: 0.5,
                transition: 'width 620ms cubic-bezier(0.16,0.8,0.3,1)',
              }}
            />
            <div
              className="absolute inset-y-0 left-0"
              style={{
                width: `${Math.max(0, health) * 100}%`,
                backgroundImage:
                  'linear-gradient(180deg, rgba(255,255,255,0.35), rgba(0,0,0,0.25)), linear-gradient(90deg,#F4C542,#E05A2B 42%,#D63031)',
                transition: 'width 180ms linear',
                boxShadow: '0 0 14px rgba(214,48,49,0.65)',
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
})
