import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { motion as m } from 'framer-motion'
import type { Biome, LevelDef, WorldDef } from '../../types'
import type { LevelRecord } from '../../store/progressStore'
import { useT, type TFunction } from '../../i18n/useT'
import { useMenuNav } from '../hooks/useMenuNav'
import { useShortViewport } from '../hooks/useShortViewport'
import { useUiMotion } from '../hooks/useUiMotion'
import { Paper } from '../art/Paper'
import { CompassRose, FragmentIcon, KrakenArm, Nail, SeaSerpent, WaxSeal } from '../art/Icons'
import { PirateShip } from '../art/SeaScene'
import { UI } from '../theme'

/**
 * The Grand Line, as the navigator's own chart.
 *
 * A sea chart is a specific kind of drawing: rhumb lines from a rose, a route
 * pricked out in dots, islands sketched in profile rather than in plan, and
 * monsters where the soundings ran out. All of it is ink on the same sheet, so
 * nothing here is a card on a background — the chart *is* the screen.
 */

export interface MapScreenProps {
  /** The campaign, in route order. Islands are laid out along the chart in this order. */
  worlds: WorldDef[]
  /** Best result per level id, keyed exactly as `LevelDef.id`. */
  records: Record<string, LevelRecord>
  /** Chosen stage. The router is expected to start it. */
  onSelect: (levelId: string) => void
  onBack: () => void
}

const VB = { w: 1200, h: 560 }

/** Hand-placed island anchors, in chart units. A route, not a grid. */
const NODES: Array<[number, number]> = [
  [122, 356],
  [312, 214],
  [510, 104],
  [700, 262],
  [892, 146],
  [1070, 330],
]

/** Half a row of `n` pips, in the chart's own scaled units. */
function half(n: number): string {
  return `calc((var(--pip) * ${n} + var(--pip-gap) * ${n - 1}) / 2)`
}

/** Catmull-Rom through the anchors, so the route curves like a plotted course. */
function routePath(pts: Array<[number, number]>): string {
  if (pts.length < 2) return ''
  const d: string[] = [`M${pts[0][0]} ${pts[0][1]}`]
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d.push(`C${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${p2[0]} ${p2[1]}`)
  }
  return d.join(' ')
}

/* ── Island sketches ─────────────────────────────────────────────────────── */

const INK = UI.ink

function Hatch({ x, y, w, n = 7 }: { x: number; y: number; w: number; n?: number }) {
  return (
    <g stroke={INK} strokeWidth={0.9} opacity={0.3}>
      {Array.from({ length: n }, (_, i) => {
        const t = (i / (n - 1) - 0.5) * w
        return <path key={i} d={`M${x + t} ${y} l ${-3 - (i % 3)} ${5 + (i % 4)}`} />
      })}
    </g>
  )
}

/**
 * One island in profile.
 *
 * Six mounds with six different hats would be six of the same island. The
 * landmass itself changes per arc — a dune is long and low, a sky island has no
 * waterline at all, Wano is two peaks — and the motif only confirms what the
 * silhouette already said.
 */
const LAND: Record<Biome, string> = {
  'east-blue': 'M-44 4 C -36 -6, -24 -9, -14 -7 C -6 -17, 8 -19, 16 -9 C 28 -11, 42 -4, 44 4 Z',
  alabasta: 'M-52 4 C -40 -2, -30 -5, -18 -5 C -6 -12, 10 -13, 20 -6 C 32 -5, 44 -1, 52 4 Z',
  skypiea: 'M-40 2 C -44 -8, -30 -14, -18 -11 C -12 -21, 6 -23, 14 -14 C 30 -18, 44 -8, 38 2 Z',
  water7: 'M-42 4 L -34 -6 L -18 -6 L -12 -16 L 14 -16 L 20 -6 L 36 -6 L 44 4 Z',
  'thriller-bark': 'M-42 4 C -34 -4, -28 -6, -22 -12 L -12 -6 L -2 -26 L 8 -8 L 18 -14 C 26 -6, 36 -2, 42 4 Z',
  wano: 'M-46 4 C -36 -2, -28 -8, -18 -22 C -12 -30, -6 -30, 0 -20 C 4 -26, 10 -26, 14 -18 C 22 -6, 34 -1, 46 4 Z',
}

function Island({ biome, cleared }: { biome: Biome; cleared: boolean }) {
  const wash = cleared ? 'rgba(142,43,34,0.16)' : 'rgba(42,29,20,0.1)'
  const line = { stroke: INK, strokeWidth: 1.5, fill: 'none', strokeLinejoin: 'round' as const }
  const floating = biome === 'skypiea'
  return (
    <g>
      {floating ? (
        // Sky island: cloud below instead of a waterline, and it drips.
        <g {...line} strokeWidth={1.2} opacity={0.7}>
          <path d="M-44 4 C -52 12, -36 18, -24 14 C -14 20, 10 20, 20 13 C 34 16, 46 8, 38 2" />
          <path d="M-6 16 c -2 8, 2 12, 0 20" opacity={0.5} />
          <path d="M14 15 c 2 6, -1 10, 1 16" opacity={0.4} />
        </g>
      ) : (
        <>
          <path d="M-52 6 C -34 12, 34 12, 52 6" {...line} strokeWidth={1.1} opacity={0.45} />
          <path d="M-40 12 C -24 17, 24 17, 40 12" {...line} strokeWidth={0.9} opacity={0.3} />
        </>
      )}

      <path d={LAND[biome]} fill={wash} />
      <path d={LAND[biome]} {...line} />
      {!floating && <Hatch x={0} y={4} w={78} n={9} />}

      {biome === 'east-blue' && (
        <g {...line} strokeWidth={1.2}>
          <path d="M2 -11 v -14" />
          <path d="M2 -25 l -9 -5 M2 -25 l 9 5 M2 -25 l -5 9 M2 -25 l 5 -9" />
          <path d="M-16 -7 c 4 -7, 12 -7, 16 -1" opacity={0.6} />
        </g>
      )}
      {biome === 'alabasta' && (
        <g {...line} strokeWidth={1.2}>
          <path d="M-6 -6 a 10 11 0 0 1 20 0" />
          <path d="M4 -17 v -5" />
          <path d="M-34 0 c 6 -4, 12 -4, 16 0" opacity={0.55} />
          <path d="M24 -1 c 5 -3, 10 -3, 14 0" opacity={0.4} />
        </g>
      )}
      {biome === 'skypiea' && (
        <g {...line} strokeWidth={1.2}>
          <path d="M0 -14 v -12 M-7 -22 h 14" />
          <path d="M-16 -10 c 4 -6, 10 -6, 13 -2" opacity={0.6} />
        </g>
      )}
      {biome === 'water7' && (
        <g {...line} strokeWidth={1.2}>
          <path d="M-8 -16 v -8 h 8 v 8 M2 -16 v -12 h 9 v 12" />
          <path d="M-30 -1 h 58" opacity={0.4} />
          <path d="M-22 -6 h 12 M12 -6 h 14" opacity={0.5} />
        </g>
      )}
      {biome === 'thriller-bark' && (
        <g {...line} strokeWidth={1.2}>
          <path d="M-2 -26 v -8 M-2 -32 l -7 -7 M-2 -34 l 7 -6 M-2 -38 l -4 -7" />
          <path d="M-26 -12 h 7 v -6 a 3.5 3.5 0 0 0 -7 0 Z" />
        </g>
      )}
      {biome === 'wano' && (
        <g {...line} strokeWidth={1.2}>
          <path d="M-14 -22 l 10 -6 l 10 6" opacity={0.8} />
          <path d="M18 -10 c 3 -4, 4 -8, 3 -12" opacity={0.55} />
          <path d="M-30 -4 l 6 -6 l 6 6" opacity={0.5} />
        </g>
      )}
    </g>
  )
}

/* ── Screen ──────────────────────────────────────────────────────────────── */

export interface Flat {
  world: WorldDef
  wi: number
  level: LevelDef
  si: number
}

export function unlockedIndex(flat: Flat[], records: Record<string, LevelRecord>): number {
  // Everything up to and including the first stage that has not been cleared.
  let i = 0
  while (i < flat.length - 1 && records[flat[i].level.id]?.cleared) i++
  return i
}

/**
 * Can this stage be started?
 *
 * Two rules, and the second one is the one that was missing: the campaign runs
 * in order, *and* a stage you have already cleared is never closed to you again
 * wherever it sits. The chart's pips always honoured the second rule — a
 * cleared record shortcircuits their state — while the primary button and the
 * keyboard only asked the first, so the two disagreed the moment a stage was
 * inserted mid-campaign. Adding the boss stages did exactly that: a finished
 * save could still click an island on the chart while Poner rumbo and Enter
 * refused every island past the first new boss.
 */
export function stageLocked(
  i: number,
  openIndex: number,
  flat: Flat[],
  records: Record<string, LevelRecord>,
): boolean {
  return i > openIndex && !records[flat[i]?.level.id ?? '']?.cleared
}

function StagePip({
  n,
  state,
  active,
  onHover,
  onClick,
  innerRef,
  label,
}: {
  n: number
  state: 'cleared' | 'open' | 'locked'
  active: boolean
  onHover: () => void
  onClick: () => void
  innerRef: (el: HTMLElement | null) => void
  label: string
}) {
  const fill =
    state === 'cleared' ? UI.wax : state === 'open' ? UI.paperLit : 'rgba(42,29,20,0.12)'
  const color = state === 'cleared' ? UI.paperLit : UI.ink
  return (
    <button
      ref={innerRef as (el: HTMLButtonElement | null) => void}
      type="button"
      aria-label={label}
      aria-current={active || undefined}
      disabled={state === 'locked'}
      onMouseEnter={onHover}
      onFocus={onHover}
      onClick={onClick}
      className="relative grid place-items-center rounded-full border-2 font-body font-extrabold transition-transform duration-150"
      style={{
        height: 'var(--pip)',
        width: 'var(--pip)',
        fontSize: 'calc(var(--pip) * 0.4)',
        lineHeight: 1,
        borderColor: state === 'locked' ? 'rgba(42,29,20,0.3)' : INK,
        background: fill,
        color,
        opacity: state === 'locked' ? 0.55 : 1,
        transform: active ? 'scale(1.28)' : 'scale(1)',
        boxShadow: active ? `0 0 0 3px rgba(244,197,66,0.55), 0 6px 12px -4px rgba(0,0,0,0.6)` : '0 2px 4px rgba(0,0,0,0.35)',
        cursor: state === 'locked' ? 'not-allowed' : 'pointer',
      }}
    >
      {state === 'locked' ? '·' : n}
    </button>
  )
}

function Legend({ t }: { t: TFunction }) {
  const row = (color: string, text: string) => (
    <div className="flex items-center gap-2">
      <span className="h-3 w-3 rounded-full border" style={{ background: color, borderColor: INK }} />
      <span className="font-body text-[10px] uppercase tracking-[0.14em]" style={{ color: UI.inkSoft }}>
        {text}
      </span>
    </div>
  )
  return (
    <div
      className="flex flex-col gap-1 rounded-[3px] border px-2.5 py-2"
      style={{ borderColor: 'rgba(42,29,20,0.45)', background: 'rgba(239,224,190,0.55)' }}
    >
      <div className="font-display text-sm leading-none ink">{t('map.legend')}</div>
      {row(UI.wax, t('map.legendCleared'))}
      {row(UI.paperLit, t('map.select'))}
      {row('rgba(42,29,20,0.12)', t('map.legendLocked'))}
    </div>
  )
}

export function MapScreen({ worlds, records, onSelect, onBack }: MapScreenProps) {
  const t = useT()
  const motion = useUiMotion()
  const short = useShortViewport(560)

  const flat = useMemo<Flat[]>(
    () =>
      worlds.flatMap((world, wi) =>
        world.levels.map((level, si) => ({ world, wi, level, si })),
      ),
    [worlds],
  )

  const openIndex = useMemo(() => unlockedIndex(flat, records), [flat, records])
  const [index, setIndex] = useState(openIndex)
  useEffect(() => setIndex(openIndex), [openIndex])

  const current = flat[Math.min(index, flat.length - 1)]
  const rec = current ? records[current.level.id] : undefined
  const isLocked = (i: number) => stageLocked(i, openIndex, flat, records)

  const { itemRef } = useMenuNav({
    count: flat.length,
    index,
    onIndex: setIndex,
    onConfirm: (i) => {
      if (!isLocked(i)) onSelect(flat[i].level.id)
    },
    onBack,
    orientation: 'horizontal',
    onVertical: (dir) => {
      // Up and down hop whole islands; left and right walk the route.
      const wi = current?.wi ?? 0
      const target = Math.max(0, Math.min(worlds.length - 1, wi + dir))
      const first = flat.findIndex((f) => f.wi === target)
      if (first >= 0) setIndex(first)
    },
    armMs: 300,
  })

  const shipAt = NODES[Math.min(current?.wi ?? 0, NODES.length - 1)]
  const travelled = Math.min(worlds.length, (current?.wi ?? 0) + 1)

  return (
    <m.div
      key="map"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: motion ? 0.3 : 0 }}
      className="wood-dark relative flex h-full w-full flex-col items-center justify-center overflow-hidden"
      // The wood stays edge to edge; the chart moves inside the notch. On a
      // phone held sideways the island cut-out sits over one side of the
      // screen, and East Blue's first stage was underneath it.
      style={{
        paddingTop: 'calc(0.75rem + var(--safe-t))',
        paddingRight: 'calc(1rem + var(--safe-r))',
        paddingBottom: 'calc(0.75rem + var(--safe-b))',
        paddingLeft: 'calc(1rem + var(--safe-l))',
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 20%, rgba(255,197,110,0.16) 0%, rgba(255,197,110,0) 70%), radial-gradient(ellipse 95% 85% at 50% 55%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.7) 100%)',
        }}
      />

      <header className={`relative z-10 flex shrink-0 items-baseline gap-4 ${short ? 'mb-1' : 'mb-2'}`}>
        <h2 className={`op-title text-op-gold ${short ? 'text-xl' : 'text-3xl sm:text-4xl'}`}>{t('map.title')}</h2>
        <span className="font-body text-[10px] uppercase tracking-[0.26em] text-op-parchment/55">
          {t('map.subtitle')}
        </span>
      </header>

      {/*
        The chart itself. Everything positions against its aspect box.

        The box used to be `min(1180px, 95vw)` wide with the aspect ratio
        deciding its height, which on a phone held sideways made it taller than
        the screen: Skypiea was cut off at the top and the legend fell out of
        the bottom. Two things were wrong. `vw` is the whole window, so it
        reached straight through the notch padding this screen sets; and width
        alone cannot fit a box whose height is the scarce dimension. So the
        wrapper takes whatever height is left over after the header and the
        dossier, becomes a size container, and the chart is the largest box of
        the right shape that fits inside it — by width or by height, whichever
        runs out first.
      */}
      <div
        className="relative z-10 flex min-h-0 w-full flex-1 items-center justify-center"
        style={{ containerType: 'size' }}
      >
      <div
        className="relative"
        style={
          {
            width: `min(1180px, 100%, calc(100cqh * ${VB.w} / ${VB.h}))`,
            aspectRatio: `${VB.w} / ${VB.h}`,
            // The pips are HTML on top of the SVG, so unlike everything drawn
            // inside the viewBox they do not scale with the chart. At full size
            // that is what you want — a 28px target. On a shrunk chart it meant
            // East Blue's four stages were wider than the paper under them and
            // the first one hung off the edge. So they scale with the sheet,
            // down to a floor that stays tappable.
            containerType: 'inline-size',
            '--pip': 'max(20px, calc(100cqw * 28 / 1180))',
            '--pip-gap': 'max(3px, calc(100cqw * 6 / 1180))',
          } as CSSProperties
        }
      >
        <Paper seed={7} edges="all" bite={1.3} age={0.7} className="h-full w-full">
          <svg viewBox={`0 0 ${VB.w} ${VB.h}`} className="h-full w-full" aria-hidden="true">
            {/* graticule */}
            <g stroke={INK} strokeWidth={0.6} opacity={0.16}>
              {Array.from({ length: 11 }, (_, i) => (
                <path key={`v${i}`} d={`M${60 + i * 108} 20 V ${VB.h - 20}`} />
              ))}
              {Array.from({ length: 6 }, (_, i) => (
                <path key={`h${i}`} d={`M30 ${50 + i * 92} H ${VB.w - 30}`} />
              ))}
            </g>

            {/* rhumb lines from two roses, the way a portolan is ruled */}
            {[
              [250, 430],
              [940, 150],
            ].map(([cx, cy]) => (
              <g key={`${cx}`} stroke={INK} strokeWidth={0.5} opacity={0.13}>
                {Array.from({ length: 16 }, (_, i) => {
                  const a = (i * Math.PI) / 8
                  return (
                    <path
                      key={i}
                      d={`M${cx} ${cy} L ${(cx + Math.cos(a) * 1400).toFixed(0)} ${(cy + Math.sin(a) * 1400).toFixed(0)}`}
                    />
                  )
                })}
              </g>
            ))}

            {/* the Red Line, running across the world */}
            <g>
              <path
                d={`M0 ${VB.h * 0.95} C 220 ${VB.h * 0.9}, 420 ${VB.h * 0.99}, 700 ${VB.h * 0.95} C 900 ${VB.h * 0.92}, 1040 ${VB.h * 0.99}, ${VB.w} ${VB.h * 0.94}`}
                stroke="rgba(142,43,34,0.26)"
                strokeWidth={18}
                fill="none"
              />
              <path
                d={`M0 ${VB.h * 0.95} C 220 ${VB.h * 0.9}, 420 ${VB.h * 0.99}, 700 ${VB.h * 0.95} C 900 ${VB.h * 0.92}, 1040 ${VB.h * 0.99}, ${VB.w} ${VB.h * 0.94}`}
                stroke={UI.wax}
                strokeWidth={2}
                fill="none"
                opacity={0.5}
                strokeDasharray="10 7"
              />
            </g>

            {/* route: the whole course faint, the sailed part inked in */}
            <path d={routePath(NODES)} stroke={INK} strokeWidth={2.6} fill="none" opacity={0.3} strokeDasharray="2.5 11" strokeLinecap="round" />
            <path
              d={routePath(NODES.slice(0, Math.max(2, travelled)))}
              stroke={INK}
              strokeWidth={3.2}
              fill="none"
              opacity={0.75}
              strokeDasharray="4 9"
              strokeLinecap="round"
              // The pricked dots walk the course you have already sailed. It is
              // the one thing on this chart that says which way is forward
              // without printing an arrow on it.
              className={motion ? 'animate-chart-march' : undefined}
            />

            {/* islands */}
            {worlds.map((w, i) => {
              const [x, y] = NODES[i] ?? NODES[NODES.length - 1]
              const cleared = w.levels.every((l) => records[l.id]?.cleared)
              return (
                <g key={w.id} transform={`translate(${x} ${y})`}>
                  <g transform="scale(1.5)">
                    <Island biome={w.biome} cleared={cleared} />
                  </g>
                  <text
                    x={0}
                    y={-50}
                    textAnchor="middle"
                    fontFamily="'Pirata One', Georgia, serif"
                    fontSize={30}
                    fill={INK}
                    opacity={0.9}
                  >
                    {w.name}
                  </text>
                </g>
              )
            })}

            {/* soundings and a warning where the chart gives up */}
            <g fill={INK} opacity={0.22} fontFamily="'Rubik', sans-serif" fontSize={9}>
              {[
                [176, 486, '38'], [352, 470, '61'], [610, 452, '44'], [828, 466, '73'], [1012, 486, '52'],
                [230, 96, '12'], [604, 60, '9'], [988, 480, '65'],
              ].map(([x, y, v]) => (
                <text key={`${x}-${y}`} x={x as number} y={y as number} textAnchor="middle">
                  {v}
                </text>
              ))}
            </g>
          </svg>

          {/* Chart furniture, in the margins where nothing important lives. */}
          <div className="pointer-events-none absolute bottom-[4%] right-[4%] opacity-65">
            <CompassRose size={132} />
          </div>
          <div className="pointer-events-none absolute bottom-[1%] left-[-2%] origin-bottom-left opacity-95">
            <div className={motion ? 'animate-kraken-curl' : undefined}>
              <KrakenArm size={215} />
            </div>
          </div>
          <div className="pointer-events-none absolute right-[3%] top-[1%] opacity-85">
            <div className={motion ? 'animate-serpent-swim' : undefined}>
              <SeaSerpent size={230} />
            </div>
          </div>
          <div
            className="pointer-events-none absolute bottom-[13%] left-[16%] font-display text-xl"
            style={{ color: INK, opacity: 0.42, transform: 'rotate(-5deg)' }}
          >
            {t('map.monsters')}
          </div>

          <span className="pointer-events-none absolute left-3 top-3">
            <Nail size={14} />
          </span>
          <span className="pointer-events-none absolute right-3 top-3">
            <Nail size={14} />
          </span>

          {/*
            The ship, riding at the island the player is looking at — and it
            sails there rather than cutting. Moving the highlight up or down
            the route used to teleport it across the ocean between two frames,
            which is the one thing a chart with a ship on it should never do.
          */}
          <m.div
            className="pointer-events-none absolute"
            initial={false}
            animate={{
              left: `${(((shipAt?.[0] ?? 0) + 104) / VB.w) * 100}%`,
              top: `${(((shipAt?.[1] ?? 0) + 30) / VB.h) * 100}%`,
            }}
            transition={
              motion
                ? { type: 'spring', stiffness: 62, damping: 17, mass: 1.1 }
                : { duration: 0 }
            }
          >
            {/* The -50%/-100% offset lives on a plain child: a motion element
                owns its own `transform`, and anything written there by hand is
                liable to be overwritten the moment it animates. */}
            <div className="-translate-x-1/2 -translate-y-full">
              <div className={motion ? 'animate-bob' : undefined}>
                <PirateShip width={104} motion={motion} />
              </div>
            </div>
          </m.div>

          {/* Stage pips and island seals. */}
          {worlds.map((w, wi) => {
            const [x, y] = NODES[wi] ?? NODES[NODES.length - 1]
            const cleared = w.levels.every((l) => records[l.id]?.cleared)
            return (
              <div
                key={w.id}
                className="absolute flex -translate-x-1/2 flex-col items-center gap-1"
                style={{
                  // Centred on the island, but never further out than half its
                  // own row: an island near the margin slides its pips inboard
                  // rather than letting them fall off the sheet.
                  left: `clamp(${half(w.levels.length)}, ${(x / VB.w) * 100}%, calc(100% - ${half(w.levels.length)}))`,
                  top: `${((y + 34) / VB.h) * 100}%`,
                }}
              >
                <div className="flex items-center" style={{ gap: 'var(--pip-gap)' }}>
                  {w.levels.map((lvl, si) => {
                    const fi = flat.findIndex((f) => f.level.id === lvl.id)
                    const state = records[lvl.id]?.cleared ? 'cleared' : isLocked(fi) ? 'locked' : 'open'
                    return (
                      <StagePip
                        key={lvl.id}
                        n={si + 1}
                        state={state}
                        active={fi === index}
                        innerRef={itemRef(fi)}
                        label={`${w.name} — ${t('map.stage', { n: si + 1 })}`}
                        onHover={() => setIndex(fi)}
                        onClick={() => {
                          setIndex(fi)
                          if (state !== 'locked') onSelect(lvl.id)
                        }}
                      />
                    )
                  })}
                </div>
                {cleared && (
                  <span className="pointer-events-none -mt-1 opacity-90">
                    <WaxSeal size={30} label="✓" />
                  </span>
                )}
              </div>
            )
          })}
        </Paper>
      </div>
      </div>

      {/* Dossier for the highlighted stage, and the way out. */}
      <div
        className={`relative z-10 flex w-full max-w-[1180px] shrink-0 items-end justify-between gap-4 ${short ? 'mt-2' : 'mt-3'}`}
      >
        <div className="hidden sm:block">
          <Legend t={t} />
        </div>

        <div className="min-w-0 flex-1">
          <div
            className="mx-auto flex max-w-[560px] items-center gap-4 rounded-[4px] border-2 px-4 py-2"
            style={{
              borderColor: 'rgba(124,90,33,0.8)',
              backgroundImage: 'linear-gradient(180deg, rgba(255,226,180,0.1), rgba(0,0,0,0.35)), linear-gradient(170deg,#3E2716,#1A0F07)',
            }}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-display text-xl leading-tight text-op-gold">
                {current?.level.name ?? '—'}
              </div>
              <div className="font-body text-[10px] uppercase tracking-[0.2em] text-op-parchment/55">
                {current?.world.name} · {t('map.stage', { n: (current?.si ?? 0) + 1 })}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {Array.from({ length: 3 }, (_, i) => (
                <FragmentIcon key={i} size={15} lit={(rec?.fragments ?? 0) > i} />
              ))}
            </div>
            <div className="text-right">
              <div className="font-body text-[10px] uppercase tracking-[0.18em] text-op-parchment/55">
                {rec ? t('map.recordLabel') : ''}
              </div>
              <div className="font-body text-sm font-extrabold tabnum text-op-cream">
                {rec ? rec.bestScore.toLocaleString('es-ES') : t('map.noRecord')}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="op-button px-4 py-2 text-sm" onClick={onBack}>
            {t('map.back')}
          </button>
          <button
            className="op-button op-button--primary px-4 py-2 text-sm"
            disabled={!current || isLocked(index)}
            onClick={() => current && !isLocked(index) && onSelect(current.level.id)}
          >
            {t('map.select')}
          </button>
        </div>
      </div>

      {!short && (
        <div className="relative z-10 mt-1 shrink-0 font-body text-[10px] uppercase tracking-[0.2em] text-op-parchment/40">
          {t('map.hint')}
        </div>
      )}
    </m.div>
  )
}
