import { motion } from 'framer-motion'
import { useT } from '../../i18n/useT'

export function GameOverScreen({ onRetry, onMenu }: { onRetry: () => void; onMenu: () => void }) {
  const t = useT()
  return (
    <motion.div
      key="gameover"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-black/85"
    >
      <motion.h2
        initial={{ scale: 1.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 90, damping: 12 }}
        className="op-title text-5xl text-op-red"
      >
        {t('over.title')}
      </motion.h2>
      <div className="flex gap-3">
        <button className="op-button op-button--primary" onClick={onRetry}>
          {t('over.retry')}
        </button>
        <button className="op-button" onClick={onMenu}>
          {t('over.menu')}
        </button>
      </div>
    </motion.div>
  )
}
