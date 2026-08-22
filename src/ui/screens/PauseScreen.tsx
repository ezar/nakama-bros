import { motion } from 'framer-motion'
import { useT } from '../../i18n/useT'

interface Props {
  onResume: () => void
  onRestart: () => void
  onQuit: () => void
}

export function PauseScreen({ onResume, onRestart, onQuit }: Props) {
  const t = useT()
  return (
    <motion.div
      key="pause"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-30 flex items-center justify-center bg-op-deep/80 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.94, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        className="op-panel flex w-[min(360px,88vw)] flex-col gap-3 p-6"
      >
        <h2 className="op-title mb-2 text-center text-3xl text-op-gold">{t('pause.title')}</h2>
        <button className="op-button op-button--primary" onClick={onResume}>
          {t('pause.resume')}
        </button>
        <button className="op-button" onClick={onRestart}>
          {t('pause.restart')}
        </button>
        <button className="op-button" onClick={onQuit}>
          {t('pause.quit')}
        </button>
      </motion.div>
    </motion.div>
  )
}
