import { motion } from 'framer-motion'
import { useT } from '../../i18n/useT'

interface Props {
  onPlay: () => void
  onCrew: () => void
  onOptions: () => void
}

export function TitleScreen({ onPlay, onCrew, onOptions }: Props) {
  const t = useT()
  return (
    <motion.div
      key="title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden"
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_20%,#14406e_0%,#0a1628_45%,#050a14_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-[linear-gradient(180deg,transparent,rgba(19,106,138,0.35))]" />

      <motion.div
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 120, damping: 14 }}
        className="relative z-10 text-center"
      >
        <div className="op-title text-6xl text-op-gold sm:text-8xl">Nakama Bros</div>
        <div className="mt-2 font-body text-sm tracking-[0.35em] text-op-parchment/80 sm:text-base">
          {t('title.tagline')}
        </div>
      </motion.div>

      <div className="relative z-10 mt-12 flex flex-col gap-3">
        <button className="op-button op-button--primary text-lg" onClick={onPlay}>
          {t('title.play')}
        </button>
        <button className="op-button" onClick={onCrew}>
          {t('title.crew')}
        </button>
        <button className="op-button" onClick={onOptions}>
          {t('title.options')}
        </button>
      </div>

      <div className="absolute bottom-6 z-10 text-center font-mono text-[11px] tracking-widest text-op-parchment/50">
        {t('controls.hint')}
      </div>
    </motion.div>
  )
}
