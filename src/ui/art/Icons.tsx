import { useId } from 'react'
import { UI } from '../theme'

/**
 * The shell's icon set, drawn as inline SVG.
 *
 * Inline rather than a font or a sprite because every one of these is tinted,
 * animated or partly transparent somewhere, and because the game ships no image
 * assets by policy — the UI holds to the same rule as the engine's art layer.
 *
 * Each shape is an original construction: skulls, hats and compasses are common
 * property, but these particular curves are ours.
 */

interface IconProps {
  size?: number
  className?: string
  title?: string
}

/* ── Jolly Roger ─────────────────────────────────────────────────────────── */

/**
 * Skull under a straw hat over crossed cutlasses. The crew's mark: it stamps
 * the logo, the menu cursor, the wax seals and the pause card.
 */
export function JollyRoger({
  size = 64,
  className,
  bone = UI.paperLit,
  ink = UI.ink,
  band = UI.wax,
  straw = '#E3C169',
  blades = true,
}: IconProps & { bone?: string; ink?: string; band?: string; straw?: string; blades?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden="true">
      {blades && (
        <g stroke={ink} strokeWidth={1.4} strokeLinejoin="round">
          {[38, -38].map((a) => (
            <g key={a} transform={`rotate(${a} 32 38)`}>
              {/* blade */}
              <path
                d="M32 12 C 36 20, 37 30, 35.5 44 L 28.5 44 C 27 30, 28 20, 32 12 Z"
                fill={UI.paperDim}
              />
              <path d="M32 13 C 35 21, 35.6 30, 34.6 43" fill="none" stroke={UI.paperLit} strokeWidth={1.1} />
              {/* guard and grip */}
              <path d="M24.5 44 h15 a2 2 0 0 1 0 4 h-15 a2 2 0 0 1 0-4 Z" fill={UI.brass} />
              <path d="M29.5 48 h5 v8 a2.5 2.5 0 0 1 -5 0 Z" fill={UI.oakLit} />
              <circle cx={32} cy={57.5} r={2.4} fill={UI.brass} />
            </g>
          ))}
        </g>
      )}

      {/* cranium: wider at the temples, tucked in at the cheek */}
      <path
        d="M32 14
           C 44 14, 50 22, 50 30.5
           C 50 36, 47.5 39.5, 44.5 41.5
           C 43 42.5, 42.5 44, 42.5 46
           C 42.5 50.5, 38.5 53, 32 53
           C 25.5 53, 21.5 50.5, 21.5 46
           C 21.5 44, 21 42.5, 19.5 41.5
           C 16.5 39.5, 14 36, 14 30.5
           C 14 22, 20 14, 32 14 Z"
        fill={bone}
        stroke={ink}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      {/* cheek shadow — the hard terminator, on the side away from the key */}
      <path
        d="M44.5 41.5 C 43 42.5, 42.5 44, 42.5 46 C 42.5 50.5, 38.5 53, 32 53 L 32 44 Z"
        fill={ink}
        opacity={0.16}
      />
      {/* eye sockets, tilted inward so the skull scowls */}
      <ellipse cx={25} cy={31} rx={6.2} ry={6.8} fill={ink} transform="rotate(-9 25 31)" />
      <ellipse cx={39} cy={31} rx={6.2} ry={6.8} fill={ink} transform="rotate(9 39 31)" />
      <ellipse cx={26.6} cy={28.6} rx={1.7} ry={1.9} fill={bone} opacity={0.55} />
      {/* nasal cavity */}
      <path d="M32 36.5 L 35 42.5 L 29 42.5 Z" fill={ink} />
      {/* teeth */}
      <g fill={ink}>
        {[26.5, 30.2, 33.9, 37.6].map((x) => (
          <rect key={x} x={x} y={46} width={1.5} height={6} rx={0.6} />
        ))}
        <rect x={23} y={45.4} width={18} height={1.5} rx={0.7} />
      </g>

      {/* straw hat: brim, crown, band */}
      <g stroke={ink} strokeWidth={1.6} strokeLinejoin="round">
        <path d="M8 20.5 C 14 13.5, 50 13.5, 56 20.5 C 50 25, 14 25, 8 20.5 Z" fill={straw} />
        <path d="M20 19 C 21 8.5, 43 8.5, 44 19 C 40 21.5, 24 21.5, 20 19 Z" fill={straw} />
        <path d="M20.3 17.6 C 24.5 20, 39.5 20, 43.7 17.6 L 44 19 C 40 21.5, 24 21.5, 20 19 Z" fill={band} stroke="none" />
      </g>
      <path d="M8.6 20.6 C 15 16.6, 49 16.6, 55.4 20.6" fill="none" stroke={UI.paperLit} strokeWidth={0.9} opacity={0.55} />
    </svg>
  )
}

/* ── Currency and life ───────────────────────────────────────────────────── */

/** The berry mark: a B crossed by two bars, cut like a coin punch. */
export function BerryIcon({ size = 16, className, title }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <path
        d="M7.5 4 h5.6 a4 4 0 0 1 1.2 7.8 a4.2 4.2 0 0 1 -1.1 8.2 H7.5 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinejoin="round"
      />
      <path d="M4.5 9.2 h13.5 M4.5 14.8 h13.5" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" />
    </svg>
  )
}

/** A life, as a straw hat seen three-quarters on. */
export function HatLife({ size = 18, className, empty = false }: IconProps & { empty?: boolean }) {
  const straw = empty ? 'rgba(233,215,178,0.22)' : '#E9C46A'
  const band = empty ? 'rgba(142,43,34,0.28)' : UI.wax
  return (
    <svg viewBox="0 0 24 20" width={size} height={(size * 20) / 24} className={className} aria-hidden="true">
      <path d="M2 13.4 C 5 9.6, 19 9.6, 22 13.4 C 19 16.6, 5 16.6, 2 13.4 Z" fill={straw} stroke={UI.ink} strokeWidth={1.2} strokeLinejoin="round" />
      <path d="M7 12.6 C 7.4 4.4, 16.6 4.4, 17 12.6 C 14.5 14, 9.5 14, 7 12.6 Z" fill={straw} stroke={UI.ink} strokeWidth={1.2} strokeLinejoin="round" />
      <path d="M7.05 11.4 C 9.6 12.9, 14.4 12.9, 16.95 11.4 L 17 12.6 C 14.5 14, 9.5 14, 7 12.6 Z" fill={band} />
    </svg>
  )
}

/** A shard of a Poneglyph: cut stone with three carved marks. */
export function FragmentIcon({ size = 18, className, lit = false }: IconProps & { lit?: boolean }) {
  const face = lit ? '#7FD4FF' : 'rgba(120,140,160,0.28)'
  const edge = lit ? '#CFF1FF' : 'rgba(180,200,215,0.42)'
  return (
    <svg viewBox="0 0 20 26" width={size} height={(size * 26) / 20} className={className} aria-hidden="true">
      <path d="M4.5 1.5 L 16 3.5 L 18 19 L 9.5 24.5 L 2 20 L 3 8 Z" fill={face} stroke={edge} strokeWidth={1.3} strokeLinejoin="round" />
      <path d="M4.5 1.5 L 16 3.5 L 14.5 8 L 3 8 Z" fill={edge} opacity={lit ? 0.5 : 0.18} />
      <g stroke={lit ? UI.night : 'rgba(200,215,230,0.5)'} strokeWidth={1.1} strokeLinecap="round" opacity={0.8}>
        <path d="M6 11 h6 M6 14.5 h8 M6 18 h4" />
      </g>
    </svg>
  )
}

/* ── Instruments ─────────────────────────────────────────────────────────── */

/** Ship's wheel — the options mark. */
export function ShipWheel({ size = 22, className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden="true">
      <g stroke="currentColor" strokeWidth={2} strokeLinecap="round" fill="none">
        {[0, 45, 90, 135].map((a) => (
          <path key={a} d="M16 2.5 V 29.5" transform={`rotate(${a} 16 16)`} />
        ))}
        <circle cx={16} cy={16} r={8.5} strokeWidth={2.6} />
      </g>
      <circle cx={16} cy={16} r={2.6} fill="currentColor" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <circle key={a} cx={16} cy={3.2} r={2} fill="currentColor" transform={`rotate(${a} 16 16)`} />
      ))}
    </svg>
  )
}

/** Anchor — used as a bullet and as chart furniture. */
export function Anchor({ size = 20, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 26" width={size} height={(size * 26) / 24} className={className} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx={12} cy={4} r={2.6} />
        <path d="M12 6.6 V 23" />
        <path d="M7 9.5 h10" />
        <path d="M3.5 15.5 C 3.5 21, 7.6 23.6, 12 23.6 C 16.4 23.6, 20.5 21, 20.5 15.5" />
        <path d="M1.6 16.6 L 3.5 14.4 L 5.6 16.3 M18.4 16.3 L 20.5 14.4 L 22.4 16.6" />
      </g>
    </svg>
  )
}

/** Hourglass for the clock plaque. */
export function Hourglass({ size = 16, className, drain = 0.5 }: IconProps & { drain?: number }) {
  const t = Math.min(1, Math.max(0, drain))
  return (
    <svg viewBox="0 0 18 24" width={size} height={(size * 24) / 18} className={className} aria-hidden="true">
      <path d="M3 2 h12 M3 22 h12" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
      <path d="M4.5 2.6 C 4.5 8, 9 10.4, 9 12 C 9 13.6, 4.5 16, 4.5 21.4 M13.5 2.6 C 13.5 8, 9 10.4, 9 12 C 9 13.6, 13.5 16, 13.5 21.4"
        fill="none" stroke="currentColor" strokeWidth={1.7} />
      <path d="M5.6 4 h6.8 C 12.4 8, 9 10.6, 9 11.6 C 9 10.6, 5.6 8, 5.6 4 Z" fill="currentColor" opacity={t} />
      <path d="M9 12.6 C 9 13.6, 12.6 16.4, 12.9 20.4 h-7.8 C 5.4 16.4, 9 13.6, 9 12.6 Z" fill="currentColor" opacity={1 - t} />
    </svg>
  )
}

/* ── Chart furniture ─────────────────────────────────────────────────────── */

/** A four-point star: the rose reduced to what survives at menu size. */
export function StarMark({ size = 20, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true">
      <path d="M12 0.5 L 14.6 9.4 L 23.5 12 L 14.6 14.6 L 12 23.5 L 9.4 14.6 L 0.5 12 L 9.4 9.4 Z" fill="currentColor" />
      <path d="M12 0.5 L 14.6 9.4 L 23.5 12 L 12 12 Z" fill="#FFFFFF" opacity={0.28} />
    </svg>
  )
}

/** Compass rose for the sea chart. Eight points, ticked ring, cardinals. */
export function CompassRose({ size = 160, className, opacity = 1 }: IconProps & { opacity?: number }) {
  const pts = [0, 90, 180, 270]
  const dia = [45, 135, 225, 315]
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} opacity={opacity} aria-hidden="true">
      <circle cx={50} cy={50} r={44} fill="none" stroke={UI.ink} strokeWidth={0.8} opacity={0.55} />
      <circle cx={50} cy={50} r={40} fill="none" stroke={UI.ink} strokeWidth={0.5} opacity={0.4} />
      {Array.from({ length: 32 }, (_, i) => (
        <path
          key={i}
          d={`M50 ${i % 4 === 0 ? 6 : 8.4} V 10.6`}
          stroke={UI.ink}
          strokeWidth={i % 4 === 0 ? 1 : 0.5}
          opacity={0.5}
          transform={`rotate(${i * 11.25} 50 50)`}
        />
      ))}
      {dia.map((a) => (
        <path key={a} d="M50 50 L 46 46 L 50 18 L 54 46 Z" fill={UI.ink} opacity={0.28} transform={`rotate(${a} 50 50)`} />
      ))}
      {pts.map((a) => (
        <g key={a} transform={`rotate(${a} 50 50)`}>
          <path d="M50 50 L 44 44 L 50 11 Z" fill={UI.ink} opacity={0.62} />
          <path d="M50 50 L 56 44 L 50 11 Z" fill={UI.ink} opacity={0.34} />
        </g>
      ))}
      <circle cx={50} cy={50} r={3.4} fill={UI.paper} stroke={UI.ink} strokeWidth={0.9} />
      <g fill={UI.ink} fontSize={7} fontFamily="'Pirata One', Georgia, serif" opacity={0.7} textAnchor="middle">
        <text x={50} y={5.5}>N</text>
        <text x={50} y={99}>S</text>
        <text x={96.5} y={52.4}>E</text>
        <text x={3.5} y={52.4}>O</text>
      </g>
    </svg>
  )
}

/** Kraken arm curling in from a chart margin. */
export function KrakenArm({ size = 180, className, flip = false }: IconProps & { flip?: boolean }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={className}
      style={flip ? { transform: 'scaleX(-1)' } : undefined} aria-hidden="true">
      <g fill="none" stroke={UI.ink} strokeLinecap="round">
        <path d="M2 96 C 30 96, 44 86, 54 70 C 64 54, 74 40, 92 34 C 104 30, 112 34, 114 42"
          strokeWidth={13} opacity={0.16} />
        <path d="M2 96 C 30 96, 44 86, 54 70 C 64 54, 74 40, 92 34 C 104 30, 112 34, 114 42"
          strokeWidth={2} opacity={0.5} />
        <path d="M114 42 C 116 50, 110 56, 103 53" strokeWidth={2} opacity={0.5} />
        {[
          'M10 90 c 3 -6, 9 -6, 11 -1',
          'M28 86 c 3 -6, 9 -6, 11 -1',
          'M46 74 c 4 -5, 10 -4, 11 2',
          'M60 58 c 5 -4, 10 -2, 10 4',
          'M76 44 c 5 -4, 10 -1, 9 5',
          'M94 36 c 5 -3, 9 0, 8 6',
        ].map((d) => (
          <path key={d} d={d} strokeWidth={1.6} opacity={0.42} />
        ))}
      </g>
    </svg>
  )
}

/** A sea serpent doodle, the kind a cartographer draws where soundings run out. */
export function SeaSerpent({ size = 190, className }: IconProps) {
  return (
    <svg viewBox="0 0 160 90" width={size} height={(size * 90) / 160} className={className} aria-hidden="true">
      <g fill="none" stroke={UI.ink} strokeLinecap="round" opacity={0.45}>
        <path d="M4 70 C 18 70, 22 52, 36 52 C 50 52, 54 70, 68 70 C 82 70, 86 50, 100 48 C 112 46, 120 38, 122 28"
          strokeWidth={2.2} />
        <path d="M8 76 C 20 76, 26 60, 38 60 C 50 60, 56 78, 70 77" strokeWidth={1.4} opacity={0.6} />
        <path d="M122 28 C 124 18, 134 12, 143 15 C 152 18, 154 28, 148 34 C 142 40, 130 38, 126 32"
          strokeWidth={2.2} />
        <path d="M138 22 a 1.6 1.6 0 1 0 0.1 0" strokeWidth={2.6} />
        <path d="M126 33 c 5 5, 14 6, 20 2" strokeWidth={1.4} />
        <path d="M120 22 l 6 -7 M129 17 l 3 -8 M139 13 l 1 -8" strokeWidth={1.6} />
      </g>
    </svg>
  )
}

/** Rope, drawn as a twisted two-strand run. Used as a divider and a frame. */
export function Rope({
  length = 240,
  thickness = 10,
  vertical = false,
  className,
  color = UI.rope,
  shade = UI.ropeDark,
}: {
  length?: number
  thickness?: number
  vertical?: boolean
  className?: string
  color?: string
  shade?: string
}) {
  const step = thickness * 0.82
  const n = Math.max(2, Math.round(length / step))
  const h = thickness
  return (
    <svg
      viewBox={`0 0 ${length} ${h}`}
      width={vertical ? h : length}
      height={vertical ? length : h}
      className={className}
      style={vertical ? { transform: 'rotate(90deg)', transformOrigin: 'top left' } : undefined}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <rect x={0} y={h * 0.12} width={length} height={h * 0.76} rx={h * 0.38} fill={shade} />
      {Array.from({ length: n }, (_, i) => {
        const x = i * step
        return (
          <path
            key={i}
            d={`M${x} ${h * 0.86} C ${x + step * 0.28} ${h * 0.62}, ${x + step * 0.5} ${h * 0.34}, ${x + step * 0.96} ${h * 0.14}
                L ${x + step * 1.32} ${h * 0.14} C ${x + step * 0.86} ${h * 0.34}, ${x + step * 0.64} ${h * 0.62}, ${x + step * 0.36} ${h * 0.86} Z`}
            fill={color}
          />
        )
      })}
      <rect x={0} y={h * 0.12} width={length} height={h * 0.2} rx={h * 0.1} fill="#FFFFFF" opacity={0.16} />
      <rect x={0} y={h * 0.68} width={length} height={h * 0.2} rx={h * 0.1} fill="#000000" opacity={0.22} />
    </svg>
  )
}

/** Wax seal, optionally stamped with the crew's mark. */
export function WaxSeal({
  size = 56,
  className,
  color = UI.wax,
  label,
}: IconProps & { color?: string; label?: string }) {
  const gid = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden="true">
      <defs>
        <radialGradient id={`wax-${gid}`} cx="36%" cy="30%" r="76%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.16} />
          <stop offset="52%" stopColor={color} />
          <stop offset="100%" stopColor="#000000" stopOpacity={0.42} />
        </radialGradient>
      </defs>
      {/* The blot: wax squeezes out unevenly, so no two lobes match. */}
      <path
        d="M32 3 c 8 0, 10 5, 16 7 c 6 2, 12 2, 13 9 c 1 7, -3 9, -3 15 c 0 6, 5 9, 1 15 c -4 6, -9 4, -14 8
           c -5 4, -6 8, -13 7 c -7 -1, -8 -6, -14 -9 c -6 -3, -11 -2, -13 -9 c -2 -7, 2 -10, 2 -16
           c 0 -6, -4 -10, 1 -15 c 5 -5, 10 -3, 15 -6 c 5 -3, 6 -6, 9 -6 Z"
        fill={`url(#wax-${gid})`}
      />
      {label ? (
        <text
          x={32}
          y={42}
          textAnchor="middle"
          fontFamily="'Pirata One', Georgia, serif"
          fontSize={28}
          fill="#000000"
          opacity={0.34}
        >
          {label}
        </text>
      ) : (
        // The die: a skull pressed into the wax. Cut dark, lipped light on the
        // side away from the key, which is what makes it read as depth.
        <g>
          <g fill="#000000" opacity={0.46}>
            <path d="M32 14 c 11 0, 17 7, 17 15 c 0 5, -2 8, -5 10 c -1 1, -1 2, -1 4 c 0 4, -4 6, -11 6 c -7 0, -11 -2, -11 -6 c 0 -2, 0 -3, -1 -4 c -3 -2, -5 -5, -5 -10 c 0 -8, 6 -15, 17 -15 Z" />
            <path d="M14 22 C 20 16, 44 16, 50 22 C 44 26, 20 26, 14 22 Z" />
          </g>
          <g fill={color} opacity={0.95}>
            <ellipse cx={26} cy={30} rx={4.6} ry={5} />
            <ellipse cx={38} cy={30} rx={4.6} ry={5} />
            <path d="M32 35 l 2.6 5 h -5.2 Z" />
            <rect x={25} y={43} width={14} height={4.4} rx={1.4} />
          </g>
          <path
            d="M32 14 c 11 0, 17 7, 17 15"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={1.2}
            opacity={0.14}
          />
        </g>
      )}
    </svg>
  )
}

/** Brass nail head, for pinning paper to wood. */
export function Nail({ size = 14, className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} className={className} aria-hidden="true">
      <circle cx={8} cy={8.8} r={6.2} fill="#000" opacity={0.35} />
      <circle cx={8} cy={8} r={6} fill={UI.brass} />
      <path d="M8 2.2 a 5.8 5.8 0 0 1 4.1 1.7 l -8.2 8.2 A 5.8 5.8 0 0 1 8 2.2 Z" fill={UI.brassLit} opacity={0.75} />
      <circle cx={8} cy={8} r={6} fill="none" stroke={UI.brassDark} strokeWidth={1} />
      <circle cx={6.4} cy={6.2} r={1.3} fill="#FFF" opacity={0.55} />
    </svg>
  )
}
