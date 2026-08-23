import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { motion as m } from 'framer-motion'
import { useT } from '../../i18n/useT'
import { useMenuNav } from '../hooks/useMenuNav'
import { useUiMotion } from '../hooks/useUiMotion'
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

export function TitleScreen({ onPlay, onCrew, onOptions, onMap }: Props) {
  const t = useT()
  const motion = useUiMotion()
  /**
   * Below this the menu runs off the bottom and the last plank ends up behind
   * the gunwale — reachable, since that bar is click-through, but invisible.
   * A phone held sideways is 390px tall and this game locks to landscape, so
   * that is not an edge case, it is the phone.
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
  const [index, setIndex] = useState(0)

  const items = useMemo<Item[]>(() => {
    const list: Item[] = [
      { key: 'play', label: t('title.play'), icon: <Anchor size={20} />, action: onPlay, primary: true },
      { key: 'crew', label: t('title.crew'), icon: <HatLife size={22} />, action: onCrew },
    ]
    if (onMap) list.push({ key: 'map', label: t('title.map'), icon: <StarMark size={19} />, action: onMap })
    list.push({ key: 'options', label: t('title.options'), icon: <ShipWheel size={20} />, action: onOptions })
    return list
  }, [t, onPlay, onCrew, onOptions, onMap])

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

      {/* A lantern on the yardarm, top right: the only warm light on this side. */}
      <div className="pointer-events-none absolute right-[6%] top-0 z-10 hidden sm:block">
        <div
          className="mx-auto h-16 w-[4px] rounded-full"
          style={{ background: `linear-gradient(90deg, ${UI.ropeDark}, ${UI.rope} 40%, ${UI.ropeDark})` }}
        />
        <div className={motion ? 'animate-lantern-flicker' : undefined}>
          <svg viewBox="0 0 40 56" width={44} height={62} aria-hidden="true">
            <ellipse cx={20} cy={30} rx={22} ry={26} fill="rgba(255,196,96,0.16)" />
            <path d="M14 8 h12 v4 h4 l-2 30 h-16 l-2 -30 h4 Z" fill="#2A1810" />
            <path d="M12 14 h16 l-1.4 24 h-13.2 Z" fill="#FFD48A" />
            <path d="M12 14 h16 l-0.4 6 h-15.2 Z" fill="#FFF0C4" />
            <path d="M20 20 c 3 4, 3 8, 0 11 c -3 -3, -3 -7, 0 -11 Z" fill="#FF9A3C" opacity={0.9} />
            <path d="M10 42 h20 v3 h-20 Z" fill="#2A1810" />
            <path d="M16 45 h8 v6 a4 4 0 0 1 -8 0 Z" fill="#2A1810" />
          </svg>
        </div>
      </div>

      <div
        className={`relative z-10 flex h-full w-full flex-col items-center justify-center px-6 pt-6 ${compact ? 'gap-3 pb-14' : 'gap-8 pb-20'}`}
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

      {/* The gunwale we are standing behind. Decoration only, and it sits on
          z-10 over the menu, which on a short screen reaches down behind it —
          so the whole thing is click-through. Widening the text row with the
          build stamp was enough to put it over the OPCIONES plank and make
          that button unpressable. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
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
    </m.div>
  )
}
