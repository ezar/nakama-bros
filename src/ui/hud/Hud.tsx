import { memo } from 'react'
import type { HudSnapshot } from '../../types'
import { CREW } from '../../game/config'

const TIER_LABEL: Record<string, string> = {
  base: '—',
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

/**
 * The heads-up display.
 *
 * Rendered as DOM rather than into the canvas so it stays crisp at any scale
 * and can be read by assistive technology. It is deliberately sparse — the
 * corners only, so nothing competes with the play space.
 */
export const Hud = memo(function Hud({ hud }: { hud: HudSnapshot }) {
  const seconds = Math.ceil(hud.time)
  const urgent = seconds <= 30
  const crew = CREW[hud.crew]

  return (
    <div className="pointer-events-none absolute inset-0 select-none font-mono text-[11px] uppercase tracking-widest sm:text-xs">
      {/* Left: crew, lives, power tier */}
      <div className="absolute left-3 top-3 flex items-center gap-3">
        <div
          className="flex h-9 items-center gap-2 rounded-md border px-2.5"
          style={{ borderColor: `${crew.accent}66`, background: 'rgba(7,16,32,0.72)' }}
        >
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: crew.accent, boxShadow: `0 0 8px ${crew.accent}` }}
          />
          <span className="font-semibold text-op-cream">{crew.name}</span>
          <span className="text-op-parchment/70">×{hud.lives}</span>
        </div>
        {hud.tier !== 'base' && (
          <div
            className="rounded-md border px-2 py-1 font-bold"
            style={{
              borderColor: TIER_COLOR[hud.tier],
              color: TIER_COLOR[hud.tier],
              background: 'rgba(7,16,32,0.72)',
              textShadow: `0 0 10px ${TIER_COLOR[hud.tier]}`,
            }}
          >
            {TIER_LABEL[hud.tier]}
          </div>
        )}
      </div>

      {/* Right: berries, score, clock */}
      <div className="absolute right-3 top-3 flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-2 rounded-md border border-op-gold/30 bg-op-deep/70 px-2.5 py-1.5">
          <span className="text-op-gold">฿</span>
          <span className="tabular-nums text-op-cream">{hud.berries.toString().padStart(2, '0')}</span>
          <span className="text-op-parchment/40">|</span>
          <span className="tabular-nums text-op-cream">{hud.score.toLocaleString('es-ES')}</span>
        </div>
        <div
          className={`rounded-md border px-2.5 py-1.5 tabular-nums transition-colors ${
            urgent ? 'border-op-red/70 text-op-red' : 'border-op-cyan/30 text-op-cream'
          }`}
          style={{ background: 'rgba(7,16,32,0.7)' }}
        >
          {String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}
        </div>
      </div>

      {/* Poneglyph fragments */}
      <div className="absolute left-3 top-14 flex gap-1.5">
        {hud.fragments.map((got, i) => (
          <span
            key={i}
            className="h-2.5 w-2 rounded-[2px] border"
            style={{
              borderColor: got ? '#7FD4FF' : 'rgba(154,168,196,0.4)',
              background: got ? '#7FD4FF' : 'transparent',
              boxShadow: got ? '0 0 8px #7FD4FF' : 'none',
            }}
          />
        ))}
      </div>

      {/* Boss health */}
      {hud.bossHealth !== null && (
        <div className="absolute inset-x-0 bottom-4 mx-auto w-[min(420px,80%)]">
          <div className="mb-1 text-center text-[10px] font-bold tracking-[0.3em] text-op-red">
            {hud.bossName}
          </div>
          <div className="h-2.5 overflow-hidden rounded-full border border-op-red/60 bg-op-deep/80">
            <div
              className="h-full rounded-full transition-[width] duration-200"
              style={{
                width: `${Math.max(0, hud.bossHealth) * 100}%`,
                background: 'linear-gradient(90deg,#F4C542,#E05A2B 45%,#D63031)',
                boxShadow: '0 0 12px rgba(214,48,49,0.7)',
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
})
