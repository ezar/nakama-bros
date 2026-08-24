import { useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion as m } from 'framer-motion'
import { useT } from '../../i18n/useT'
import { useMenuNav } from '../hooks/useMenuNav'
import { useUiMotion } from '../hooks/useUiMotion'
import { useShortViewport } from '../hooks/useShortViewport'
import { useFitScale } from '../hooks/useFitScale'
import { SeaScene } from '../art/SeaScene'
import { GameLogo } from '../art/Logo'
import { Anchor, HatLife, JollyRoger, Rope, ShipWheel, StarMark } from '../art/Icons'
import { UI } from '../theme'
import { buildLabel } from '../../build'

interface Props {
  onPlay: () => void
  onCrew: () => void
  onOptions: () => void
  /** Optional: shows the Grand Line entry when the router can serve a map. */
  onMap?: () => void
  /** Optional: shows the live-race entry. Same contract as `onMap`. */
  onVersus?: () => void
  /**
   * The lantern was struck. The screen owns the light; the router owns the
   * sound, the same way the crew screen reports a pick and lets App chime.
   */
  onLamp?: (lit: boolean) => void
}

interface Item {
  key: string
  label: string
  icon: ReactNode
  action: () => void
  primary?: boolean
}

/** A brass-bound plank. Selected, it slides out of the rail and lights up. */
function MenuPlank({
  item,
  active,
  onHover,
  onClick,
  innerRef,
  motion,
  compact,
}: {
  item: Item
  active: boolean
  compact: boolean
  onHover: () => void
  onClick: () => void
  innerRef: (el: HTMLElement | null) => void
  motion: boolean
}) {
  return (
    <button
      ref={innerRef}
      type="button"
      onMouseEnter={onHover}
      onFocus={onHover}
      onClick={onClick}
      aria-current={active || undefined}
      className={`group relative flex w-[min(84vw,340px)] items-center gap-3 rounded-[6px] border-2 pl-14 pr-5 text-left ${compact ? 'py-1.5' : 'py-3'}`}
      style={{
        borderColor: active ? UI.brassLit : 'rgba(124,90,33,0.75)',
        backgroundImage: active
          ? `linear-gradient(180deg, rgba(255,226,180,0.22), rgba(0,0,0,0.34)), linear-gradient(172deg, #6B4527, #34200F)`
          : `linear-gradient(180deg, rgba(255,226,180,0.1), rgba(0,0,0,0.42)), linear-gradient(172deg, #402716, #21130A)`,
        boxShadow: active
          ? '0 6px 0 #180D06, 0 16px 26px -10px rgba(0,0,0,0.95), inset 0 1px 0 rgba(255,226,180,0.35)'
          : '0 4px 0 #140A04, 0 10px 18px -10px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,226,180,0.14)',
      }}
    >
      {/* the cursor: one skull that slides between planks */}
      {active && (
        <m.span
          layoutId="title-cursor"
          className="absolute left-2 flex items-center"
          transition={motion ? { type: 'spring', stiffness: 520, damping: 32 } : { duration: 0 }}
        >
          <JollyRoger size={34} blades={false} />
        </m.span>
      )}
      <span
        className="absolute left-[3.1rem] top-1/2 h-7 w-px -translate-y-1/2"
        style={{ background: 'linear-gradient(180deg, transparent, rgba(255,226,180,0.35), transparent)' }}
      />
      <span
        className="ml-1 flex-1 font-body text-lg font-bold uppercase tracking-[0.14em]"
        style={{
          color: active ? '#FFF3D6' : '#D9C7A8',
          textShadow: active ? '0 1px 0 #1B0F07, 0 0 16px rgba(244,197,66,0.5)' : '0 1px 0 #1B0F07',
        }}
      >
        {item.label}
      </span>
      <span style={{ color: active ? UI.brassLit : 'rgba(201,165,102,0.55)' }}>{item.icon}</span>
    </button>
  )
}


/**
 * The lantern on the yardarm — and the one thing on this screen you are not
 * told about.
 *
 * It hangs dark. Hit it and it catches: the wick takes, the glass fills, the
 * whole lantern swings on its rope and settles, and for a moment the right-hand
 * side of the sunset is warm. Hit it again and you snuff it. Nothing else in
 * the game depends on it and nothing announces it, which is the point — it is
 * there for whoever pokes at the scenery, and this one was asked for by name.
 *
 * It is a real button with a real label, so it is not a secret from anyone
 * using a screen reader or a keyboard; it just does not advertise itself.
 */
function Lantern({ lit, onToggle, motion }: { lit: boolean; onToggle: () => void; motion: boolean }) {
  const t = useT()
  // The rope is the pivot: a lantern that swings around its own middle looks
  // like it is being shaken rather than hanging from something.
  const swing = motion && lit ? { rotate: [0, -7, 5.5, -3.4, 2, -1, 0] } : { rotate: 0 }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={t(lit ? 'title.lamp.on' : 'title.lamp.off')}
      aria-pressed={lit}
      // The menu's key handler lives on the window and would otherwise confirm
      // the highlighted plank on the same Enter that strikes the lantern.
      data-menu-outsider=""
      // Hung inside the notch, not under it: this is a control now, and on a
      // phone held sideways the rounded corner reaches 59px in from the edge.
      style={{ right: 'calc(6% + var(--safe-r))', top: 'var(--safe-t)' }}
      className="absolute z-10 hidden origin-top cursor-pointer sm:block"
    >
      <m.div
        className="origin-top"
        animate={swing}
        transition={{ duration: motion ? 1.5 : 0, ease: 'easeOut' }}
      >
        <div
          className="mx-auto h-16 w-[4px] rounded-full"
          style={{ background: `linear-gradient(90deg, ${UI.ropeDark}, ${UI.rope} 40%, ${UI.ropeDark})` }}
        />
        <div className={motion && lit ? 'animate-lantern-flicker' : undefined}>
          <svg viewBox="0 0 40 56" width={44} height={62} aria-hidden="true">
            {/* The wash on the chart behind it, and the glass itself, are the
                two things that carry the state — the ironwork never changes. */}
            <ellipse
              cx={20}
              cy={30}
              rx={22}
              ry={26}
              fill="rgba(255,196,96,0.16)"
              style={{ opacity: lit ? 1 : 0, transition: motion ? 'opacity 620ms ease-out' : 'none' }}
            />
            <path d="M14 8 h12 v4 h4 l-2 30 h-16 l-2 -30 h4 Z" fill="#2A1810" />
            <path
              d="M12 14 h16 l-1.4 24 h-13.2 Z"
              fill={lit ? '#FFD48A' : '#3B4451'}
              style={{ transition: motion ? 'fill 520ms ease-out' : 'none' }}
            />
            <path
              d="M12 14 h16 l-0.4 6 h-15.2 Z"
              fill={lit ? '#FFF0C4' : '#586374'}
              style={{ transition: motion ? 'fill 520ms ease-out' : 'none' }}
            />
            {/* The wick: a cold stub when out, a flame when lit. */}
            <path d="M19.4 28 h1.2 v4 h-1.2 Z" fill="#1A120C" />
            <m.path
              d="M20 20 c 3 4, 3 8, 0 11 c -3 -3, -3 -7, 0 -11 Z"
              fill="#FF9A3C"
              style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}
              initial={false}
              animate={{ scaleY: lit ? 1 : 0, scaleX: lit ? 1 : 0.4, opacity: lit ? 0.9 : 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 12, duration: motion ? undefined : 0 }}
            />
            <path d="M10 42 h20 v3 h-20 Z" fill="#2A1810" />
            <path d="M16 45 h8 v6 a4 4 0 0 1 -8 0 Z" fill="#2A1810" />
          </svg>
        </div>
      </m.div>

      {/* Sparks off the wick, once, on the strike. */}
      <AnimatePresence>
        {motion && lit && (
          <span className="pointer-events-none absolute left-1/2 top-[4.4rem]">
            {SPARKS.map((sp, i) => (
              <m.span
                key={i}
                className="absolute block h-[3px] w-[3px] rounded-full"
                style={{ background: i % 2 ? '#FFE9A8' : '#FF9A3C' }}
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{ x: sp.x, y: sp.y, opacity: 0, scale: 0.3 }}
                transition={{ duration: sp.d, ease: 'easeOut' }}
              />
            ))}
          </span>
        )}
      </AnimatePresence>
    </button>
  )
}

/**
 * Fixed spark offsets, not random ones: a burst that comes out different every
 * render is a burst that flickers when React re-renders for an unrelated
 * reason. Hand-placed, leaning up and left the way heat goes.
 */
const SPARKS = [
  { x: -9, y: -26, d: 0.72 },
  { x: 5, y: -32, d: 0.86 },
  { x: -2, y: -19, d: 0.6 },
  { x: 11, y: -22, d: 0.78 },
  { x: -14, y: -15, d: 0.66 },
  { x: 3, y: -40, d: 0.95 },
  { x: -6, y: -34, d: 0.83 },
]

export function TitleScreen({ onPlay, onCrew, onOptions, onMap, onVersus, onLamp }: Props) {
  const t = useT()
  const motion = useUiMotion()
  // Below this the menu runs off the bottom and the last plank ends up behind
  // the gunwale — reachable, since that bar is click-through, but invisible.
  const compact = useShortViewport(560)
  const fit = useFitScale()
  const [index, setIndex] = useState(0)
  // Session-only on purpose: coming back to the title finds it dark again, so
  // the discovery is there to be made a second time.
  const [lamp, setLamp] = useState(false)

  const items = useMemo<Item[]>(() => {
    const list: Item[] = [
      { key: 'play', label: t('title.play'), icon: <Anchor size={20} />, action: onPlay, primary: true },
      { key: 'crew', label: t('title.crew'), icon: <HatLife size={22} />, action: onCrew },
    ]
    if (onMap) list.push({ key: 'map', label: t('title.map'), icon: <StarMark size={19} />, action: onMap })
    if (onVersus) list.push({ key: 'versus', label: t('versus.open'), icon: <JollyRoger size={19} />, action: onVersus })
    list.push({ key: 'options', label: t('title.options'), icon: <ShipWheel size={20} />, action: onOptions })
    return list
  }, [t, onPlay, onCrew, onOptions, onMap, onVersus])

  const { itemRef } = useMenuNav({
    count: items.length,
    index,
    onIndex: setIndex,
    onConfirm: (i) => items[i]?.action(),
    armMs: 500,
  })

  return (
    <m.div
      key="title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: motion ? 0.4 : 0 }}
      className="relative flex h-full w-full flex-col items-center overflow-hidden"
    >
      <SeaScene motion={motion} />

      {/* The warm side of the sunset, which only exists once the lantern does. */}
      <div
        className="pointer-events-none absolute inset-0 z-[5]"
        style={{
          background:
            'radial-gradient(ellipse 46% 62% at 88% 16%, rgba(255,186,92,0.3) 0%, rgba(255,150,60,0.09) 45%, rgba(0,0,0,0) 72%)',
          opacity: lamp ? 1 : 0,
          transition: motion ? 'opacity 900ms ease-out' : 'none',
        }}
      />

      {/*
        One column: the scene above, the deck rail below, and nothing guessing
        how tall the other one is.

        The rail used to be an overlay pinned to the bottom, and this column
        left a fixed amount of padding to clear it — `pb-14` on a short screen.
        That is a guess about another element's height, and it was wrong the
        moment a fifth item joined the menu on a phone whose home indicator
        makes the rail taller: OPCIONES ended up behind the planking. It was
        still clickable, because the rail is click-through, but a button you
        cannot see is not a button you can press.

        In the flow the rail takes the room it needs and the menu centres in
        what is left, whatever either of them turns out to measure.
      */}
      <div className="relative z-10 flex h-full w-full flex-col">
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-3">
        <div
          ref={fit.ref as (el: HTMLDivElement | null) => void}
          className={`flex flex-col items-center ${compact ? 'gap-3' : 'gap-8'}`}
          style={fit.scale < 1 ? { transform: `scale(${fit.scale})` } : undefined}
        >
        <m.div
          initial={{ y: motion ? -30 : 0, opacity: 0, scale: motion ? 0.96 : 1 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 110, damping: 15, delay: 0.05 }}
        >
          <GameLogo motion={motion} compact={compact} />
          {!compact && (
            <div
              className="mt-3 text-center font-display text-lg tracking-[0.34em] sm:text-xl"
              style={{ color: '#F3DEB4', textShadow: '0 2px 8px rgba(0,0,0,0.9)' }}
            >
              {t('title.tagline')}
            </div>
          )}
        </m.div>

        <m.nav
          aria-label={t('title.menu')}
          initial={{ y: motion ? 24 : 0, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: motion ? 0.22 : 0, duration: 0.35 }}
          className={`flex flex-col items-center ${compact ? 'gap-1.5' : 'gap-2.5'}`}
        >
          {items.map((it, i) => (
            <MenuPlank
              key={it.key}
              item={it}
              active={i === index}
              motion={motion}
              compact={compact}
              innerRef={itemRef(i)}
              onHover={() => setIndex(i)}
              onClick={it.action}
            />
          ))}
        </m.nav>
        </div>
      </div>
      {/*
        After the menu in the source, though it hangs above it on screen: tab
        order follows the document, and the first thing a keyboard should reach
        on this screen is Zarpar, not the scenery.
      */}
      <Lantern
        lit={lamp}
        motion={motion}
        onToggle={() => {
          // Computed outside the updater: a state updater has to be a pure
          // function of the old state, and React is free to run it twice.
          const next = !lamp
          setLamp(next)
          onLamp?.(next)
        }}
      />

      {/* The gunwale we are standing behind. Decoration only, so it stays
          click-through — but it is now laid out rather than hung over the top,
          which is what stops it covering the last plank of the menu. */}
      <div className="pointer-events-none relative w-full shrink-0">
        <div className="relative">
          <div className="absolute -top-3 left-0 w-full overflow-hidden opacity-95">
            <Rope length={1440} thickness={15} className="w-full" />
          </div>
          <div className="wood-dark flex items-center justify-between border-t-2 border-op-brass-dark px-5 pb-[calc(0.5rem+var(--safe-b))] pt-3 sm:px-8">
            <span className="font-body text-[10px] uppercase tracking-[0.2em] text-op-parchment/60 sm:text-xs">
              {t('controls.hint')}
            </span>
            <span className="hidden items-center gap-3 font-body text-[10px] uppercase tracking-[0.2em] text-op-parchment/35 sm:flex">
              {/* Three blocks of text in one row wrap into a mess on a phone.
                  The fan-made note is on the promo art and in the repo; the
                  build is not written down anywhere else, so it is the one
                  that stays. */}
              {!compact && t('title.fanmade')}
              <span className="tabnum lowercase tracking-[0.14em] text-op-parchment/25">{buildLabel}</span>
            </span>
          </div>
        </div>
      </div>
      </div>
    </m.div>
  )
}
