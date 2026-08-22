import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { UI } from '../theme'

/**
 * Aged paper.
 *
 * The silhouette is a real torn edge — a clip path of forty-odd jittered points
 * rather than a rounded rectangle — because a straight edge reads as a browser
 * div no matter how well the fill is painted. The jitter is seeded, so a poster
 * keeps its own edge across re-renders instead of shimmering.
 */

/** Deterministic 0..1 from an integer stream. */
function rand(seed: number, i: number): number {
  const h = Math.sin(seed * 127.1 + i * 311.7) * 43758.5453
  return h - Math.floor(h)
}

export type TornEdges = 'all' | 'sides' | 'bottom' | 'none'

function tornPath(seed: number, edges: TornEdges, bite: number): string {
  if (edges === 'none') return ''
  const per = 11
  const pts: Array<[number, number]> = []
  let k = 0
  const jag = (side: 'top' | 'right' | 'bottom' | 'left') => {
    const on =
      edges === 'all' ||
      (edges === 'sides' && (side === 'left' || side === 'right')) ||
      (edges === 'bottom' && side === 'bottom')
    for (let i = 0; i < per; i++) {
      const t = i / per
      // Two octaves: a slow wander plus a fine nibble, so the edge has both a
      // shape and a texture instead of uniform noise.
      const d = on ? (rand(seed, k) * 0.62 + rand(seed, k + 97) * 0.38) * bite : bite * 0.12
      k++
      const a = d
      if (side === 'top') pts.push([t * 100, a])
      else if (side === 'right') pts.push([100 - a, t * 100])
      else if (side === 'bottom') pts.push([100 - t * 100, 100 - a])
      else pts.push([a, 100 - t * 100])
    }
  }
  jag('top')
  jag('right')
  jag('bottom')
  jag('left')
  return `polygon(${pts.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(',')})`
}

interface PaperProps {
  children?: ReactNode
  className?: string
  style?: CSSProperties
  seed?: number
  edges?: TornEdges
  /** How deep the tears bite, in percent of the sheet. */
  bite?: number
  /** Overall tone: 1 is fresh paper, 0 is a sheet that has been at sea. */
  age?: number
}

export function Paper({
  children,
  className = '',
  style,
  seed = 1,
  edges = 'all',
  bite = 1.6,
  age = 0.55,
}: PaperProps) {
  const clip = useMemo(() => tornPath(seed, edges, bite), [seed, edges, bite])

  // Stains are part of the paper, not decoration on top of it: they belong in
  // the same paint pass so text can sit over them.
  const stains = useMemo(() => {
    const n = 4
    return Array.from({ length: n }, (_, i) => {
      const x = 8 + rand(seed, i * 5 + 1) * 84
      const y = 6 + rand(seed, i * 5 + 2) * 88
      const r = 12 + rand(seed, i * 5 + 3) * 26
      const a = (0.05 + rand(seed, i * 5 + 4) * 0.09) * (0.4 + age)
      return `radial-gradient(ellipse ${r}% ${r * 0.7}% at ${x}% ${y}%, rgba(126,88,42,${a.toFixed(3)}) 0%, rgba(126,88,42,0) 70%)`
    }).join(',')
  }, [seed, age])

  return (
    <div
      className={`relative isolate ${className}`}
      style={{
        clipPath: clip || undefined,
        backgroundImage: `${stains},
          radial-gradient(ellipse 120% 90% at 22% 8%, ${UI.paperLit} 0%, rgba(0,0,0,0) 62%),
          radial-gradient(ellipse 100% 80% at 88% 100%, ${UI.paperDeep} 0%, rgba(0,0,0,0) 58%),
          linear-gradient(168deg, ${UI.paper} 0%, ${UI.paperDim} 100%)`,
        boxShadow: `inset 0 0 26px rgba(112,74,32,${(0.24 + age * 0.3).toFixed(2)}),
                    inset 0 0 3px rgba(60,36,14,0.5)`,
        ...style,
      }}
    >
      {/* fibre grain — a fixed pattern, not a per-frame texture */}
      <div className="paper-grain pointer-events-none absolute inset-0 -z-10" />
      {children}
    </div>
  )
}

/**
 * A sheet on a board: paper with its own drop shadow and an optional pin. The
 * shadow lives on a wrapper because the paper itself is clipped, and a clip
 * eats the shadow.
 */
export function PinnedPaper({
  children,
  className = '',
  style,
  rotate = 0,
  seed = 1,
  edges = 'all',
  bite = 1.6,
  age = 0.55,
  shadow = '0 14px 16px rgba(0,0,0,0.55)',
  paperClassName = '',
}: PaperProps & { rotate?: number; shadow?: string; paperClassName?: string }) {
  return (
    <div
      className={className}
      style={{ transform: rotate ? `rotate(${rotate}deg)` : undefined, filter: `drop-shadow(${shadow})`, ...style }}
    >
      <Paper seed={seed} edges={edges} bite={bite} age={age} className={paperClassName}>
        {children}
      </Paper>
    </div>
  )
}
