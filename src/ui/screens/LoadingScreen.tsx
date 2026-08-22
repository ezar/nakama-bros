import { motion as m } from 'framer-motion'
import { useUiMotion } from '../hooks/useUiMotion'
import { GameLogo } from '../art/Logo'
import { PirateShip } from '../art/SeaScene'
import { UI } from '../theme'

/**
 * Boot. The art library rasterises behind this, which takes a couple of
 * seconds, so the bar is a voyage: the ship rides the leading edge of the
 * progress and the wake fills in behind it.
 */
export function LoadingScreen({ progress, label }: { progress: number; label: string }) {
  const motion = useUiMotion()
  const pct = Math.max(0, Math.min(1, progress))
  return (
    <m.div
      key="loading"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative flex h-full w-full flex-col items-center justify-center gap-8 overflow-hidden"
      style={{ background: 'radial-gradient(ellipse 90% 70% at 50% 30%, #123049 0%, #0A1A2E 45%, #050a14 100%)' }}
    >
      <GameLogo motion={motion} className="scale-90" />

      <div className="relative w-[min(420px,84vw)]">
        {/* the ship sails the bar */}
        <div
          className="absolute transition-[left] duration-300 ease-out"
          style={{ left: `calc(${pct * 100}% - 42px)`, top: -50 }}
        >
          <PirateShip width={84} motion={motion} />
        </div>

        <div
          className="h-3 overflow-hidden rounded-full border-2"
          style={{
            borderColor: UI.brassDark,
            background: 'linear-gradient(180deg,#0A1A26,#05101A)',
            boxShadow: 'inset 0 2px 5px rgba(0,0,0,0.8)',
          }}
        >
          <m.div
            className="h-full rounded-full"
            style={{
              backgroundImage: `linear-gradient(180deg, rgba(255,255,255,0.35), rgba(0,0,0,0.2)), linear-gradient(90deg, ${UI.brassDark}, ${UI.brass} 60%, ${UI.brassLit})`,
            }}
            animate={{ width: `${Math.round(pct * 100)}%` }}
            transition={{ ease: 'easeOut', duration: motion ? 0.28 : 0 }}
          />
        </div>
      </div>

      <div className="font-body text-[11px] uppercase tracking-[0.32em] text-op-parchment/70">{label}</div>
    </m.div>
  )
}
