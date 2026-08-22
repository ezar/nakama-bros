import { motion } from 'framer-motion'
import { useSettings } from '../../store/settingsStore'
import { useT } from '../../i18n/useT'

function Slider({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="flex items-center justify-between gap-4 py-2">
      <span className="font-mono text-[11px] uppercase tracking-widest text-op-parchment/70">{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-40 cursor-pointer appearance-none rounded-full bg-op-navy accent-op-gold"
      />
    </label>
  )
}

function Toggle<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (v: T) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="font-mono text-[11px] uppercase tracking-widest text-op-parchment/70">{label}</span>
      <div className="flex overflow-hidden rounded-md border border-op-gold/30">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`px-3 py-1.5 font-body text-xs transition ${
              o.value === value ? 'bg-op-gold text-op-deep font-bold' : 'text-op-parchment/70 hover:bg-op-gold/15'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function OptionsScreen({ onBack }: { onBack: () => void }) {
  const t = useT()
  const s = useSettings()
  return (
    <motion.div
      key="options"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      className="flex h-full w-full items-center justify-center bg-[radial-gradient(ellipse_at_50%_0%,#14406e_0%,#0a1628_50%,#050a14_100%)] p-6"
    >
      <div className="op-panel w-[min(460px,92vw)] p-6">
        <h2 className="op-title mb-4 text-center text-3xl text-op-gold">{t('options.title')}</h2>
        <Slider label={t('options.master')} value={s.master} onChange={(v) => s.set({ master: v })} />
        <Slider label={t('options.music')} value={s.music} onChange={(v) => s.set({ music: v })} />
        <Slider label={t('options.sfx')} value={s.sfx} onChange={(v) => s.set({ sfx: v })} />
        <Toggle
          label={t('options.lang')}
          value={s.lang}
          options={[
            { value: 'es' as const, label: 'ES' },
            { value: 'en' as const, label: 'EN' },
          ]}
          onChange={(v) => s.set({ lang: v })}
        />
        <Toggle
          label={t('options.touch')}
          value={s.touchControls}
          options={[
            { value: 'auto' as const, label: 'Auto' },
            { value: 'on' as const, label: 'On' },
            { value: 'off' as const, label: 'Off' },
          ]}
          onChange={(v) => s.set({ touchControls: v })}
        />
        <Toggle
          label={t('options.effects')}
          value={s.effects}
          options={[
            { value: 'full' as const, label: 'Full' },
            { value: 'reduced' as const, label: 'Low' },
          ]}
          onChange={(v) => s.set({ effects: v })}
        />
        <Toggle
          label="CRT"
          value={s.crt ? 'on' : 'off'}
          options={[
            { value: 'off' as const, label: 'Off' },
            { value: 'on' as const, label: 'On' },
          ]}
          onChange={(v) => s.set({ crt: v === 'on' })}
        />
        <button className="op-button mt-5 w-full" onClick={onBack}>
          {t('options.back')}
        </button>
      </div>
    </motion.div>
  )
}
