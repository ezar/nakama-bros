import { JollyRoger } from './Icons'
import { UI } from '../theme'

/**
 * The wordmark.
 *
 * Built from three stacked copies of the same letter layout: an ink contour and
 * extrusion at the back, a brass face over it, and a shine that sweeps across
 * every few seconds. The letters ride a shallow arc, the way a name painted on
 * a transom follows the sheer of the hull.
 */

const WORD = 'NAKAMA BROS'

function Letters({
  letterClassName,
  letterStyle,
  className,
  stagger = 0,
}: {
  letterClassName?: string
  letterStyle?: React.CSSProperties
  className?: string
  /** Seconds of delay added per letter, so a sweep travels along the word. */
  stagger?: number
}) {
  const chars = [...WORD]
  const mid = (chars.length - 1) / 2
  return (
    <span className={className} style={{ whiteSpace: 'nowrap' }} aria-hidden="true">
      {chars.map((ch, i) => {
        const t = (i - mid) / mid
        return (
          <span
            key={i}
            // The gradient is clipped per letter, not per word: a single clipped
            // span cannot survive the per-letter transforms that give the arc.
            className={letterClassName}
            style={{
              display: 'inline-block',
              transform: `rotate(${(t * 3.4).toFixed(2)}deg) translateY(${(t * t * 0.055).toFixed(3)}em)`,
              animationDelay: stagger ? `${(i * stagger).toFixed(2)}s` : undefined,
              ...letterStyle,
            }}
          >
            {ch === ' ' ? '\u00A0' : ch}
          </span>
        )
      })}
    </span>
  )
}

export function GameLogo({
  className = '',
  motion = true,
  compact = false,
}: {
  className?: string
  motion?: boolean
  /**
   * A phone held sideways is 390px tall, and at full size the logo alone takes
   * a third of that. Scaling with a transform would not help — the layout box
   * stays the size it was — so the size itself comes down.
   */
  compact?: boolean
}) {
  return (
    <div className={`relative flex flex-col items-center ${className}`} role="img" aria-label="Nakama Bros">
      <div className={motion ? 'animate-bob' : undefined} style={{ marginBottom: '-0.34em' }}>
        <JollyRoger size={compact ? 58 : 96} className="drop-shadow-[0_10px_18px_rgba(0,0,0,0.75)]" />
      </div>

      <div
        className="relative font-body font-extrabold uppercase leading-[0.94]"
        style={{
          fontSize: compact ? 'clamp(1.7rem, 4.6vw, 2.9rem)' : 'clamp(2.6rem, 7.6vw, 6rem)',
          letterSpacing: '-0.012em',
        }}
      >
        {/* Back: ink contour plus a solid extrusion falling away from the light. */}
        <Letters
          className="block"
          letterStyle={{
            WebkitTextStroke: '0.055em #23130A',
            color: '#23130A',
            textShadow: `0 0.028em 0 #3B2410, 0 0.05em 0 #2A1808, 0 0.075em 0 #1B0F07,
                         0 0.1em 0 #140A04, 0 0.17em 0.22em rgba(0,0,0,0.8)`,
          }}
        />
        <Letters className="absolute inset-0 block" letterClassName="logo-word" />
        {motion && <Letters className="absolute inset-0 block" letterClassName="logo-shine" stagger={0.05} />}
      </div>

      {/* A brass keel line under the name, capped like a chart rule. */}
      <div className="mt-1 flex w-full items-center justify-center gap-2 px-4">
        <span className="h-px flex-1" style={{ background: `linear-gradient(90deg, transparent, ${UI.brass})` }} />
        <svg viewBox="0 0 24 8" width={22} height={8} aria-hidden="true">
          <path d="M12 0 L 17 4 L 12 8 L 7 4 Z" fill={UI.brassLit} />
        </svg>
        <span className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${UI.brass}, transparent)` }} />
      </div>
    </div>
  )
}
