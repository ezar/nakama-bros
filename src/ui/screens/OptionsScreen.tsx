import { useEffect } from 'react'
import { motion as m } from 'framer-motion'
import { useSettings } from '../../store/settingsStore'
import { DIFFICULTIES } from '../../game/config'
import { useT } from '../../i18n/useT'
import { useUiMotion } from '../hooks/useUiMotion'
import { useTwoColumns } from '../hooks/useTwoColumns'
import { useFitScale } from '../hooks/useFitScale'
import { Paper } from '../art/Paper'
import { Nail, Rope, ShipWheel } from '../art/Icons'
import { UI } from '../theme'
import { buildLabel } from '../../build'

/**
 * Settings, written on the same sheet as everything else.
 *
 * The controls stay native — a range is a range and a button is a button — so
 * the keyboard, the screen reader and the browser's own affordances all keep
 * working; only their skin is ours.
 */

function Slider({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  const pct = Math.round(value * 100)
  return (
    <label className="flex items-center justify-between gap-4 py-2">
      <span className="font-body text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: UI.inkSoft }}>
        {label}
      </span>
      <span className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(Number(e.target.value))}
          className="op-range h-2 w-40 cursor-pointer appearance-none rounded-full"
          style={{
            background: `linear-gradient(90deg, ${UI.brass} 0%, ${UI.brassLit} ${pct}%, rgba(42,29,20,0.22) ${pct}%, rgba(42,29,20,0.22) 100%)`,
          }}
        />
        <span className="w-8 text-right font-body text-xs font-extrabold tabnum ink">{pct}</span>
      </span>
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
      <span className="font-body text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: UI.inkSoft }}>
        {label}
      </span>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex overflow-hidden rounded-[4px] border"
        style={{ borderColor: 'rgba(42,29,20,0.55)', boxShadow: 'inset 0 2px 4px rgba(42,29,20,0.25)' }}
      >
        {options.map((o) => {
          const on = o.value === value
          return (
            <button
              key={o.value}
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.value)}
              className="px-3 py-1.5 font-body text-xs font-bold transition"
              style={{
                background: on ? `linear-gradient(180deg, ${UI.brassLit}, ${UI.brass})` : 'transparent',
                color: on ? '#2A1808' : UI.inkSoft,
                textShadow: on ? '0 1px 0 rgba(255,245,220,0.5)' : 'none',
              }}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function OptionsScreen({ onBack, onCredits }: { onBack: () => void; onCredits: () => void }) {
  const t = useT()
  const s = useSettings()
  const motion = useUiMotion()
  const twoCol = useTwoColumns()
  const fit = useFitScale()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])

  return (
    <m.div
      key="options"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: motion ? 0.28 : 0 }}
      className="wood relative h-full w-full overflow-hidden"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 10%, rgba(255,197,110,0.2) 0%, rgba(255,197,110,0) 65%), radial-gradient(ellipse 90% 85% at 50% 55%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.72) 100%)',
        }}
      />

      {/* The sheet is centred while it fits and scrolls once it does not. It
          used to be centred inside an `overflow-hidden` box, so on a phone held
          sideways the top and the bottom were simply cut off — which is where
          the legal notice and the build stamp live. The lantern wash stays put
          outside the scroller. */}
      <div
        className="relative z-10 h-full w-full overflow-y-auto overscroll-contain"
        style={{
          padding: '1.5rem',
          paddingTop: 'calc(1.5rem + var(--safe-t))',
          paddingRight: 'calc(1.5rem + var(--safe-r))',
          paddingBottom: 'calc(1.5rem + var(--safe-b))',
          paddingLeft: 'calc(1.5rem + var(--safe-l))',
        }}
      >
        {/* `m-auto`, not `justify-center`: a centred flex child that overflows
            spills past the top of the scroll box and cannot be scrolled back to. */}
        <div className="flex min-h-full flex-col">
          {/* Shrunk to fit before being scrolled. Two columns brought the sheet
              down from twice the height of a sideways phone to just over it,
              and the hundred pixels left over are the two buttons at the
              bottom — which is exactly the part a player needs to reach. */}
          <div className="m-auto" style={{ height: fit.height }}>
          <div
            ref={fit.ref as (el: HTMLDivElement | null) => void}
            style={fit.scale < 1 ? { transform: `scale(${fit.scale})`, transformOrigin: 'top center' } : undefined}
          >
      <m.div
        initial={{ y: motion ? 18 : 0, rotate: motion ? 0.8 : 0.4 }}
        animate={{ y: 0, rotate: 0.4 }}
        transition={{ type: 'spring', stiffness: 220, damping: 24 }}
        className="relative z-10"
        style={{ filter: 'drop-shadow(0 18px 22px rgba(0,0,0,0.7))' }}
      >
        <Paper
          seed={31}
          edges="all"
          bite={1.2}
          age={0.45}
          className={`px-7 pb-6 pt-7 ${twoCol ? 'w-[min(860px,94vw)]' : 'w-[min(470px,92vw)]'}`}
        >
          <span className="absolute left-4 top-2">
            <Nail size={14} />
          </span>
          <span className="absolute right-4 top-2">
            <Nail size={14} />
          </span>

          <h2 className="flex items-center justify-center gap-3 text-center font-display text-3xl leading-none ink">
            <ShipWheel size={26} />
            {t('options.title')}
          </h2>
          <div className="mx-auto mb-2 mt-2 flex justify-center opacity-70">
            <Rope length={240} thickness={7} />
          </div>

          {/*
            Two columns on a screen that is wide and short — a phone held
            sideways. As one column this list is nearly twice the height of
            such a screen, so the half holding the ghost switch sat below the
            fold with nothing to say the sheet went on, while three hundred
            pixels of width went unused on either side of it.
          */}
          <div className={twoCol ? 'grid grid-cols-2 gap-x-8' : undefined}>
          <div>
          {/* First, and above the volumes: it is the only setting here that
              changes the game rather than the box it comes in. The note under
              it says what you get, because a child choosing "Fácil" should not
              have to find out by dying. */}
          <Toggle
            label={t('options.difficulty')}
            value={s.difficulty}
            options={DIFFICULTIES.map((d) => ({ value: d, label: t(`difficulty.${d}`) }))}
            onChange={(v) => s.set({ difficulty: v })}
          />
          <p
            className="-mt-1 mb-1 text-right font-body text-[10px] leading-snug"
            style={{ color: UI.inkSoft, opacity: 0.7 }}
          >
            {t(`difficulty.note.${s.difficulty}`)}
            <br />
            <span style={{ opacity: 0.75 }}>{t('difficulty.same')}</span>
          </p>

          <div className="my-2 flex justify-center opacity-50">
            <Rope length={200} thickness={6} />
          </div>

          <Slider label={t('options.master')} value={s.master} onChange={(v) => s.set({ master: v })} />
          <Slider label={t('options.music')} value={s.music} onChange={(v) => s.set({ music: v })} />
          <Slider label={t('options.sfx')} value={s.sfx} onChange={(v) => s.set({ sfx: v })} />

          <div className={`my-2 flex justify-center opacity-50 ${twoCol ? 'hidden' : ''}`}>
            <Rope length={200} thickness={6} />
          </div>
          </div>

          <div>
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
            label={t('options.crt')}
            value={s.crt ? 'on' : 'off'}
            options={[
              { value: 'off' as const, label: 'Off' },
              { value: 'on' as const, label: 'On' },
            ]}
            onChange={(v) => s.set({ crt: v === 'on' })}
          />
          {/* Off by default. A translucent copy of yourself turning up
              unannounced the first time a child replays a stage is confusing,
              and there is nobody to ask what it is. */}
          <Toggle
            label={t('options.ghost')}
            value={s.ghost ? 'on' : 'off'}
            options={[
              { value: 'off' as const, label: 'Off' },
              { value: 'on' as const, label: 'On' },
            ]}
            onChange={(v) => s.set({ ghost: v === 'on' })}
          />
          <p
            className="-mt-1 text-right font-body text-[10px] leading-tight"
            style={{ color: UI.inkSoft }}
          >
            {t('options.ghostNote')}
          </p>
          </div>
          </div>

          {/* The credits are their own screen, and they carry the legal
              notice and the drawing with them: this sheet is for knobs. */}
          {/* Written primary-first and reversed in both directions, so the
              way out is the button nearest the thumb either way: bottom of
              the stack in one column, right-hand side in two. */}
          <div className={`mt-4 flex gap-2 ${twoCol ? 'flex-row-reverse' : 'flex-col-reverse'}`}>
            <button className="op-button op-button--primary w-full" onClick={onBack}>
              {t('options.back')}
            </button>
            <button className="op-button w-full" onClick={onCredits}>
              {t('options.credits')}
            </button>
          </div>

          {/* The build. The title screen hides its copy on a narrow screen,
              and a phone running this as a cached PWA is exactly where
              someone needs to check which one they are looking at. */}
          <div
            className="mt-4 text-center font-body text-[10px] tabnum tracking-[0.14em]"
            style={{ color: UI.inkSoft, opacity: 0.55 }}
          >
            {buildLabel}
          </div>
        </Paper>
      </m.div>
          </div>
          </div>
        </div>
      </div>
    </m.div>
  )
}
