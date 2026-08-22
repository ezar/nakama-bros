import { motion } from 'framer-motion'

export function LoadingScreen({ progress, label }: { progress: number; label: string }) {
  return (
    <motion.div
      key="loading"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex h-full w-full flex-col items-center justify-center gap-6 bg-[#050a14]"
    >
      <div className="op-title text-4xl text-op-gold">Nakama Bros</div>
      <div className="h-2 w-64 overflow-hidden rounded-full border border-op-gold/30 bg-op-deep">
        <motion.div
          className="h-full bg-gradient-to-r from-op-gold-dim via-op-gold to-op-cream"
          animate={{ width: `${Math.round(progress * 100)}%` }}
          transition={{ ease: 'easeOut', duration: 0.25 }}
        />
      </div>
      <div className="font-mono text-xs uppercase tracking-[0.3em] text-op-parchment/70">{label}</div>
    </motion.div>
  )
}
