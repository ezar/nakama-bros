import { motion } from 'framer-motion'
import type { CrewId } from '../../types'
import { CREW, CREW_IDS } from '../../game/config'
import { useT } from '../../i18n/useT'

interface Props {
  selected: CrewId
  onSelect: (c: CrewId) => void
  onStart: () => void
  onBack: () => void
}

const BLURB: Record<CrewId, string> = {
  luffy: 'Equilibrado. Puñetazo de goma con alcance extra.',
  zoro: 'Corte rápido y potente, pero salta menos.',
  nami: 'La más veloz. Su bastón golpea en arco.',
  sanji: 'Doble salto y patada aérea inmediata.',
  usopp: 'Dispara a distancia con el tirachinas.',
  chopper: 'Salto altísimo y embestida rodante.',
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 font-mono text-[10px] uppercase tracking-widest text-op-parchment/60">
        {label}
      </span>
      <span className="flex gap-0.5">
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className="h-1.5 w-4 rounded-sm"
            style={{ background: i < value ? '#F4C542' : 'rgba(154,168,196,0.25)' }}
          />
        ))}
      </span>
    </div>
  )
}

export function CrewScreen({ selected, onSelect, onStart, onBack }: Props) {
  const t = useT()
  const c = CREW[selected]

  return (
    <motion.div
      key="crew"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      className="flex h-full w-full flex-col items-center justify-center gap-8 bg-[radial-gradient(ellipse_at_50%_0%,#14406e_0%,#0a1628_50%,#050a14_100%)] p-6"
    >
      <h2 className="op-title text-3xl text-op-gold sm:text-4xl">{t('crew.title')}</h2>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {CREW_IDS.map((id) => {
          const active = id === selected
          return (
            <button
              key={id}
              onClick={() => onSelect(id)}
              className={`op-panel flex h-24 w-24 flex-col items-center justify-center gap-2 transition ${
                active ? 'scale-105' : 'opacity-70 hover:opacity-100'
              }`}
              style={active ? { borderColor: CREW[id].accent, boxShadow: `0 0 24px -6px ${CREW[id].accent}` } : undefined}
            >
              <span
                className="h-8 w-8 rounded-full"
                style={{ background: CREW[id].accent, boxShadow: `0 0 14px ${CREW[id].accent}` }}
              />
              <span className="font-body text-xs font-semibold">{CREW[id].name}</span>
            </button>
          )
        })}
      </div>

      <div className="op-panel w-[min(520px,92vw)] p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="op-title text-2xl" style={{ color: c.accent }}>
            {c.name}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-op-parchment/60">
            {t('crew.special')}
          </span>
        </div>
        <p className="mb-4 font-body text-sm text-op-parchment/85">{BLURB[selected]}</p>
        <div className="flex flex-col gap-2">
          <Stat label={t('crew.speed')} value={Math.round((c.runSpeed - 130) / 12)} />
          <Stat label={t('crew.jump')} value={Math.round((c.jumpTiles - 2.9) * 5)} />
        </div>
      </div>

      <div className="flex gap-3">
        <button className="op-button" onClick={onBack}>
          ←
        </button>
        <button className="op-button op-button--primary text-lg" onClick={onStart}>
          {t('crew.start')}
        </button>
      </div>
    </motion.div>
  )
}
