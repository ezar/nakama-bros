import { motion } from 'framer-motion'
import type { LevelResult } from '../../types'
import { useT } from '../../i18n/useT'

interface Props {
  result: LevelResult
  onNext: () => void
  onRetry: () => void
  hasNext: boolean
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-op-gold/15 py-2">
      <span className="font-mono text-[11px] uppercase tracking-widest text-op-parchment/60">{label}</span>
      <span className="font-body text-lg font-semibold tabular-nums text-op-cream">{value}</span>
    </div>
  )
}

export function ResultScreen({ result, onNext, onRetry, hasNext }: Props) {
  const t = useT()
  return (
    <motion.div
      key="result"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-30 flex items-center justify-center bg-op-deep/85 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.92, y: 18 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 140, damping: 16 }}
        className="op-panel w-[min(420px,90vw)] p-6"
      >
        <h2 className="op-title mb-4 text-center text-3xl text-op-gold">{t('clear.title')}</h2>
        <Row label={t('clear.time')} value={`${Math.floor(result.timeLeft)}s`} />
        <Row label={t('clear.berries')} value={String(result.berries)} />
        <Row label={t('clear.fragments')} value={`${result.fragments}/3`} />
        <Row label={t('clear.score')} value={result.score.toLocaleString('es-ES')} />
        <div className="mt-5 flex gap-3">
          <button className="op-button flex-1" onClick={onRetry}>
            {t('clear.retry')}
          </button>
          {hasNext && (
            <button className="op-button op-button--primary flex-1" onClick={onNext}>
              {t('clear.next')}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
