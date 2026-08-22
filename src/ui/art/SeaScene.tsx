import { useId, useMemo } from 'react'
import { UI } from '../theme'

/**
 * The title screen's living backdrop: dawn on the Grand Line.
 *
 * Everything here is transform-animated CSS over static SVG shapes — no canvas,
 * no per-frame React. The sea is five bands of swell, each one a path whose
 * profile repeats exactly every half of its own width, so sliding it by half a
 * width loops without a seam. Distance is carried by three things at once:
 * amplitude falls, contrast falls, and the colour washes toward the sky.
 */

/** Sum of harmonics with integer frequencies, so the profile tiles at `period`. */
function swell(
  period: number,
  height: number,
  baseline: number,
  harmonics: Array<[freq: number, amp: number, phase: number]>,
): { fill: string; crest: string } {
  const step = period / 190
  const pts: string[] = []
  const end = period * 2 + step
  for (let x = 0; x <= end; x += step) {
    let y = baseline
    for (const [f, a, p] of harmonics) y += Math.sin((x / period) * Math.PI * 2 * f + p) * a
    pts.push(`${x.toFixed(1)} ${y.toFixed(2)}`)
  }
  const line = pts.join(' L')
  return {
    fill: `M-2 ${height} L-2 ${baseline} L${line} L${end.toFixed(1)} ${height} Z`,
    // The crest is its own open path: closing it would stroke the bottom edge
    // and draw a hard rule across the water.
    crest: `M${line}`,
  }
}

interface WaveBandProps {
  /** 0 = horizon, 1 = at the viewer's feet. */
  depth: number
  height: number
  bottom: number
  /** Crest and trough. A band with one flat colour has no form in it. */
  fill: [string, string]
  crest: string
  seconds: number
  reverse?: boolean
  opacity?: number
  /** Foam is a near-water phenomenon: distance should wash it out. */
  crestOpacity?: number
  harmonics: Array<[number, number, number]>
  motion: boolean
}

function WaveBand({
  height,
  bottom,
  fill,
  crest,
  seconds,
  reverse,
  opacity = 1,
  crestOpacity = 0.7,
  harmonics,
  motion,
}: WaveBandProps) {
  const P = 1000
  const gid = useId().replace(/:/g, '')
  const d = useMemo(() => swell(P, height, height * 0.4, harmonics), [height, harmonics])
  return (
    <div
      className="pointer-events-none absolute left-0 w-[200%]"
      style={{
        bottom: `${bottom}%`,
        height: `${height}px`,
        opacity,
        animation: motion
          ? `${reverse ? 'drift-back' : 'drift'} ${seconds}s linear infinite`
          : undefined,
      }}
    >
      <svg viewBox={`0 0 ${P * 2} ${height}`} preserveAspectRatio="none" className="h-full w-full">
        <defs>
          <linearGradient id={`w-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={fill[0]} />
            <stop offset="100%" stopColor={fill[1]} />
          </linearGradient>
        </defs>
        <path d={d.fill} fill={`url(#w-${gid})`} />
        {/* Crest line: the lit edge of the swell, thin and only on top. */}
        <path
          d={d.crest}
          fill="none"
          stroke={crest}
          strokeWidth={Math.max(1.4, height * 0.045)}
          opacity={crestOpacity}
        />
        {/* Broken foam on the near swells, so the crests do not read as one
            repeated comb across the whole width. */}
        {crestOpacity > 0.5 && (
          <path
            d={d.crest}
            fill="none"
            stroke={crest}
            strokeWidth={Math.max(2.4, height * 0.075)}
            strokeDasharray="26 54 12 90 40 38"
            strokeLinecap="round"
            opacity={0.32}
            transform={`translate(0 ${(height * 0.055).toFixed(1)})`}
          />
        )}
      </svg>
    </div>
  )
}

function Cloud({ w, tone, shade }: { w: number; tone: string; shade: string }) {
  return (
    <svg viewBox="0 0 260 52" width={w} height={(w * 52) / 260} aria-hidden="true">
      {/* A cloud bank seen from far off is wide and flat, and frays at the ends. */}
      <path
        d="M6 44 C -4 40, 4 30, 16 31 C 22 20, 40 17, 52 24 C 62 8, 92 6, 104 18
           C 118 6, 146 8, 152 22 C 170 14, 196 20, 200 30 C 220 26, 250 30, 254 40
           C 244 46, 196 48, 150 47 C 96 46, 40 47, 6 44 Z"
        fill={tone}
      />
      <path
        d="M12 43 C 44 38, 96 36, 150 38 C 190 39, 226 37, 252 39
           C 244 46, 196 48, 150 47 C 96 46, 40 47, 6 44 C 8 43.4, 10 43.2, 12 43 Z"
        fill={shade}
        opacity={0.6}
      />
    </svg>
  )
}

function CloudLayer({
  top,
  scale,
  tone,
  shade,
  seconds,
  opacity,
  motion,
}: {
  top: string
  scale: number
  tone: string
  shade: string
  seconds: number
  opacity: number
  motion: boolean
}) {
  // Two identical halves side by side; sliding by exactly half loops cleanly.
  const half = (
    <div className="flex w-1/2 shrink-0 items-start justify-around">
      <div style={{ marginTop: '2%' }}>
        <Cloud w={420 * scale} tone={tone} shade={shade} />
      </div>
      <div style={{ marginTop: '9%' }}>
        <Cloud w={260 * scale} tone={tone} shade={shade} />
      </div>
      <div style={{ marginTop: '0%' }}>
        <Cloud w={520 * scale} tone={tone} shade={shade} />
      </div>
    </div>
  )
  return (
    <div
      className="pointer-events-none absolute left-0 flex w-[200%]"
      style={{
        top,
        opacity,
        animation: motion ? `drift ${seconds}s linear infinite` : undefined,
      }}
    >
      {half}
      {half}
    </div>
  )
}

function Gull({ delay, top, size, seconds, motion }: { delay: number; top: string; size: number; seconds: number; motion: boolean }) {
  return (
    <div
      className="pointer-events-none absolute -left-16"
      style={{
        top,
        animation: motion ? `gull-cross ${seconds}s linear ${delay}s infinite` : undefined,
        opacity: motion ? undefined : 0.75,
      }}
    >
      <svg
        viewBox="0 0 40 16"
        width={size}
        height={(size * 16) / 40}
        className={motion ? 'animate-flap' : undefined}
        style={{ transformOrigin: '50% 30%', animationDelay: `${delay * 0.37}s` }}
        aria-hidden="true"
      >
        <path
          d="M2 12 C 8 3, 14 1, 20 8 C 26 1, 32 3, 38 12"
          fill="none"
          stroke={UI.oakDark}
          strokeWidth={2.1}
          strokeLinecap="round"
          opacity={0.72}
        />
      </svg>
    </div>
  )
}

/**
 * A three-master seen from the leeward quarter, near-silhouetted against the
 * low sun with a warm rim on the lit side — the read is the shape, not the
 * detail. The rock is on the hull group so the rigging swings with it.
 */
export function PirateShip({ width = 260, motion = true, className = '' }: { width?: number; motion?: boolean; className?: string }) {
  const hull = '#0C161F'
  const rim = '#F6C97E'
  const sail = '#7E6E58'
  const sailLit = '#D3B482'
  return (
    <svg
      viewBox="0 0 260 220"
      width={width}
      height={(width * 220) / 260}
      className={className}
      aria-hidden="true"
    >
      <g
        className={motion ? 'animate-rock' : undefined}
        style={{ transformOrigin: '130px 178px' }}
      >
        {/* standing rigging first: it reads as haze between the masts */}
        <g stroke={hull} strokeWidth={1.2} opacity={0.75} fill="none">
          <path d="M60 168 L112 34 M200 168 L118 34 M96 168 L172 60 M168 168 L120 44" />
          <path d="M112 40 L172 66 M112 62 L60 150 M172 78 L206 150" />
        </g>

        {/* masts */}
        <g fill={hull}>
          <rect x={109} y={26} width={5} height={148} rx={2} />
          <rect x={169} y={54} width={4.4} height={120} rx={2} />
          <rect x={64} y={82} width={4} height={92} rx={2} />
        </g>

        {/* square sails, bellied to leeward */}
        <g>
          <path d="M74 44 C 108 34, 140 40, 156 52 C 146 78, 142 92, 142 104 C 116 96, 92 96, 72 102 C 78 82, 78 60, 74 44 Z" fill={sail} />
          <path d="M74 44 C 108 34, 140 40, 156 52 C 150 62, 146 72, 144 80 C 118 72, 96 74, 74 80 C 77 68, 77 54, 74 44 Z" fill={sailLit} opacity={0.9} />
          <path d="M82 112 C 110 104, 136 108, 152 118 C 146 138, 144 148, 144 156 C 120 148, 100 148, 82 154 C 86 138, 86 124, 82 112 Z" fill={sail} />
          <path d="M82 112 C 110 104, 136 108, 152 118 C 148 126, 146 132, 145 138 C 122 130, 102 132, 82 138 C 84 128, 84 120, 82 112 Z" fill={sailLit} opacity={0.7} />
          <path d="M178 76 C 196 72, 210 78, 216 88 C 210 108, 208 124, 208 136 C 194 128, 184 128, 176 132 C 180 112, 180 92, 178 76 Z" fill={sail} opacity={0.92} />
        </g>

        {/* yards */}
        <g fill={hull}>
          <rect x={68} y={40} width={94} height={4} rx={2} />
          <rect x={76} y={108} width={82} height={3.4} rx={1.7} />
          <rect x={172} y={72} width={50} height={3.4} rx={1.7} />
        </g>

        {/* jolly roger pennant */}
        <g>
          <rect x={108} y={16} width={3} height={14} fill={hull} />
          <path d="M111 17 C 124 14, 132 22, 146 18 C 140 26, 138 30, 140 34 C 126 32, 118 36, 111 32 Z" fill="#1A1016" />
          <circle cx={124} cy={25} r={3.2} fill={UI.paperDim} opacity={0.9} />
          <path d="M120 30 h9" stroke={UI.paperDim} strokeWidth={1.4} opacity={0.9} />
        </g>

        {/* hull: a long sheer, a raised stern castle, a bowsprit */}
        <path
          d="M28 168 C 44 162, 78 158, 118 158 C 158 158, 190 160, 216 166
             C 224 168, 226 172, 222 180 C 214 196, 196 204, 168 206
             C 128 209, 84 206, 60 196 C 42 189, 30 178, 28 168 Z"
          fill={hull}
        />
        <path d="M198 158 C 214 156, 226 158, 232 162 C 230 172, 226 178, 220 182 C 216 172, 208 164, 198 160 Z" fill={hull} />
        <path d="M28 168 L 8 154 C 4 152, 4 148, 9 149 L 34 158 Z" fill={hull} />
        {/* gunports and the rim light along the lit edge */}
        <g fill={rim} opacity={0.55}>
          {[86, 106, 126, 146, 166].map((x) => (
            <rect key={x} x={x} y={172} width={7} height={6} rx={1.4} />
          ))}
        </g>
        <path
          d="M216 166 C 224 168, 226 172, 222 180 C 214 196, 196 204, 168 206"
          fill="none"
          stroke={rim}
          strokeWidth={2.4}
          opacity={0.85}
        />
        <path d="M198 158 C 214 156, 226 158, 232 162" fill="none" stroke={rim} strokeWidth={2} opacity={0.7} />
        <path d="M74 44 C 108 34, 140 40, 156 52" fill="none" stroke={rim} strokeWidth={2} opacity={0.5} />
      </g>
    </svg>
  )
}

export function SeaScene({ motion = true }: { motion?: boolean }) {
  const bands: Array<Omit<WaveBandProps, 'motion'>> = useMemo(
    () => [
      {
        depth: 0.1, height: 26, bottom: 32.5, fill: ['#A9C0B3', '#93AFA8'], crest: '#DCE6D8', seconds: 190,
        crestOpacity: 0.3,
        // Distance compresses swell and washes it toward the sky: far water is
        // many small pale waves, near water a few big dark ones.
        harmonics: [[15, 3.4, 0.4], [23, 1.8, 1.9], [34, 0.9, 3.1]],
      },
      {
        depth: 0.3, height: 40, bottom: 27, fill: ['#6E9BA0', '#5A8A93'], crest: '#BCD8D2', seconds: 140,
        reverse: true, crestOpacity: 0.42,
        harmonics: [[10, 6.5, 1.1], [17, 3.4, 2.4], [27, 1.6, 0.2]],
      },
      {
        depth: 0.55, height: 60, bottom: 19.6, fill: ['#3E7B8D', '#2C6376'], crest: '#93C3C9', seconds: 96,
        crestOpacity: 0.55,
        harmonics: [[6, 12, 2.2], [11, 6, 0.6], [18, 2.6, 1.4]],
      },
      {
        depth: 0.8, height: 90, bottom: 9.8, fill: ['#1E566E', '#123B4F'], crest: '#5FA1B6', seconds: 62,
        reverse: true, crestOpacity: 0.7,
        harmonics: [[4, 20, 0.3], [7, 10, 1.7], [13, 4, 2.8]],
      },
      {
        depth: 1, height: 130, bottom: -1, fill: ['#0A2D42', '#03121F'], crest: '#37718C', seconds: 38,
        crestOpacity: 0.8,
        harmonics: [[3, 26, 2.6], [5, 13, 0.9], [9, 5, 1.2]],
      },
    ],
    [],
  )

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Sky: night at the zenith, warm haze at the waterline. */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg,
            #05101F 0%, #0F2C51 18%, #2A5877 38%, #6C8B92 53%, #C69A66 60%, #F2C480 63.4%, #A9C0B3 64%)`,
        }}
      />

      {/* The sun, low and huge, its glow bleeding into the haze. */}
      <div
        className="absolute"
        style={{
          left: '68%',
          top: '46%',
          width: '52vw',
          height: '52vw',
          transform: 'translate(-50%,-50%)',
          background: `radial-gradient(circle, rgba(255,222,150,0.55) 0%, rgba(246,178,74,0.28) 26%, rgba(246,178,74,0) 62%)`,
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          left: '68%',
          top: '60.5%',
          width: '16vw',
          height: '16vw',
          transform: 'translate(-50%,-50%)',
          background: `radial-gradient(circle at 42% 38%, ${UI.sunCore} 0%, ${UI.sun} 58%, #E2853A 100%)`,
          boxShadow: '0 0 90px 30px rgba(246,178,74,0.35)',
        }}
      />

      <CloudLayer top="7%" scale={1.2} tone="#1E3A63" shade="#132845" seconds={220} opacity={0.8} motion={motion} />
      <CloudLayer top="27%" scale={0.85} tone="#4E6480" shade="#33445E" seconds={165} opacity={0.6} motion={motion} />
      <CloudLayer top="45%" scale={0.6} tone="#D9A87C" shade="#A87352" seconds={120} opacity={0.5} motion={motion} />

      <Gull delay={0} top="28%" size={44} seconds={26} motion={motion} />
      <Gull delay={6.5} top="19%" size={28} seconds={34} motion={motion} />
      <Gull delay={13} top="35%" size={36} seconds={30} motion={motion} />

      {/* Sea. The far bands sit above the ship, the near ones in front of it. */}
      <div className="absolute inset-x-0 bottom-0 h-[36%]" style={{ background: `linear-gradient(180deg, #A9C0B3 0%, #3E7B8D 26%, ${UI.seaDeep} 100%)` }} />

      {bands.slice(0, 3).map((b, i) => (
        <WaveBand key={i} {...b} motion={motion} />
      ))}

      <div
        className="absolute"
        style={{ left: '13%', bottom: '25.5%', animation: motion ? 'ship-cruise 120s linear infinite' : undefined }}
      >
        <div className="relative">
          {/* wake: the water the hull is pushing aside */}
          <div
            className="absolute bottom-[4%] left-1/2 h-4 w-[78%] -translate-x-1/2 rounded-[50%]"
            style={{
              background: `radial-gradient(ellipse, ${UI.foam} 0%, rgba(220,237,240,0.35) 40%, rgba(220,237,240,0) 72%)`,
              filter: 'blur(3px)',
              opacity: 0.45,
            }}
          />
          <PirateShip width={228} motion={motion} />
        </div>
      </div>

      {bands.slice(3).map((b, i) => (
        <WaveBand key={`n${i}`} {...b} motion={motion} />
      ))}

      {/* Sun glitter on the water, held still while the swells move under it. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[36%]"
        style={{
          background:
            'radial-gradient(ellipse 7% 100% at 68% 0%, rgba(255,214,140,0.6) 0%, rgba(255,214,140,0.14) 42%, rgba(255,214,140,0) 78%)',
          mixBlendMode: 'screen',
        }}
      />

      {/* Vignette and a whisper of spray haze at the bottom. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 70% at 50% 42%, rgba(0,0,0,0) 40%, rgba(3,8,18,0.62) 100%)',
        }}
      />
    </div>
  )
}
