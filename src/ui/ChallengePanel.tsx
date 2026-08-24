import { useMemo, useRef, useState } from 'react'
import { motion as m } from 'framer-motion'
import { useProgress } from '../store/progressStore'
import { useSettings } from '../store/settingsStore'
import { useT } from '../i18n/useT'
import { useUiMotion } from './hooks/useUiMotion'
import { useFitScale } from './hooks/useFitScale'
import { challengeUrl } from '../game/challengeLink'
import { NAME_MAX, decodeChallenge, encodeChallenge, readName } from '../game/ghostCode'
import { levelById } from '../game/level'
import { Paper } from './art/Paper'
import { UI, formatRunTime } from './theme'

/**
 * Both halves of a challenge, on one sheet.
 *
 * Sending and receiving are the same conversation — a child opens this because
 * somebody said "I did it in forty seconds", and which half they need depends
 * on who said it first. Splitting them across two screens would mean guessing
 * which one to show, and guessing wrong half the time.
 *
 * The stage is a prop rather than a choice made here: you challenge somebody
 * *on a stage*, and it is always the one you were just looking at.
 */

export function ChallengePanel({
  levelId,
  onClose,
  onLoaded,
}: {
  levelId: string
  onClose: () => void
  /** A challenge was accepted for this stage. The caller decides where to go. */
  onLoaded: (levelId: string) => void
}) {
  const t = useT()
  const motion = useUiMotion()
  // A phone held sideways is 393 device pixels tall; this sheet is not, and
  // the half that falls off the bottom is the half that accepts a challenge.
  const fit = useFitScale()
  const ghosts = useProgress((s) => s.ghosts)
  const saveRival = useProgress((s) => s.saveRival)
  const storedName = useSettings((s) => s.playerName)
  const setSettings = useSettings((s) => s.set)

  const [name, setName] = useState(storedName)
  const [paste, setPaste] = useState('')
  const [copied, setCopied] = useState(false)
  const [status, setStatus] = useState<{ kind: 'bad' | 'unknown' | 'ok'; level?: string } | null>(null)
  const pasteRef = useRef<HTMLTextAreaElement>(null)

  const mine = ghosts[levelId]
  const level = levelById(levelId)
  const levelName = level?.name ?? levelId

  /*
    Rebuilt whenever the name changes, because the name is inside the payload
    rather than alongside it — there is nowhere else for it to live when the
    only thing that travels is one string.
  */
  const code = useMemo(
    () => (mine ? encodeChallenge({ levelId, name: readName(name), track: mine }) : null),
    [mine, levelId, name],
  )

  const link = code ? challengeUrl(code, window.location.origin, import.meta.env.BASE_URL) : null

  const rememberName = () => {
    const clean = readName(name)
    if (clean !== storedName) setSettings({ playerName: clean })
  }

  const share = async () => {
    if (!link) return
    rememberName()
    const text = t('challenge.shareText', {
      name: readName(name) || '?',
      level: levelName,
      time: formatRunTime(mine!.time),
    })
    // The native sheet is the whole point on a phone: one tap to the chat the
    // other player is already in. Where there is no sheet — a desktop browser,
    // or a share the player dismissed — the clipboard is the fallback, and a
    // dismissed share must not be reported as a failure.
    if (navigator.share) {
      try {
        await navigator.share({ text, url: link })
        return
      } catch {
        return
      }
    }
    await copy()
  }

  const copy = async () => {
    if (!link) return
    rememberName()
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard access can be refused outright. Selecting the text is then
      // the only route left, so it is put somewhere selectable rather than
      // leaving the button looking broken.
      setPaste(link)
      pasteRef.current?.select()
    }
  }

  const load = () => {
    const challenge = decodeChallenge(paste)
    if (!challenge) return setStatus({ kind: 'bad' })
    const target = levelById(challenge.levelId)
    if (!target) return setStatus({ kind: 'unknown' })
    saveRival(challenge.levelId, { ...challenge.track, name: challenge.name })
    setStatus({ kind: 'ok', level: target.name })
    setPaste('')
    onLoaded(challenge.levelId)
  }

  return (
    <m.div
      key="challenge"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-40 overflow-y-auto overscroll-contain bg-[rgba(3,2,1,0.9)]"
      role="dialog"
      aria-modal="true"
      aria-label={t('challenge.title')}
      onClick={onClose}
    >
      <div
        className="flex min-h-full flex-col"
        style={{
          paddingTop: 'calc(1rem + var(--safe-t))',
          paddingRight: 'calc(1rem + var(--safe-r))',
          paddingBottom: 'calc(1rem + var(--safe-b))',
          paddingLeft: 'calc(1rem + var(--safe-l))',
        }}
      >
        <div className="m-auto" style={{ height: fit.height }}>
        {/*
          The shrink and the entrance are on two different elements on purpose:
          framer-motion writes `transform` on the element it animates, so a
          scale set in `style` on that same element is overwritten the moment
          the spring runs — the sheet would animate in and then hang off the
          bottom of the screen exactly as before.
        */}
        <div
          ref={fit.ref as (el: HTMLDivElement | null) => void}
          style={fit.scale < 1 ? { transform: `scale(${fit.scale})`, transformOrigin: 'top center' } : undefined}
        >
        <m.div
          initial={motion ? { scale: 0.94, opacity: 0, rotate: -1.6 } : false}
          animate={motion ? { scale: 1, opacity: 1, rotate: -0.7 } : {}}
          transition={{ type: 'spring', stiffness: 150, damping: 17 }}
          onClick={(e) => e.stopPropagation()}
        >
          <Paper seed={71} edges="all" bite={3} age={0.8} className="w-[min(460px,92vw)] px-6 py-6">
            <h2 className="font-display text-3xl leading-none ink">{t('challenge.title')}</h2>
            <div
              className="mt-1 font-body text-[10px] font-extrabold uppercase tracking-[0.22em]"
              style={{ color: UI.inkSoft }}
            >
              {levelName}
            </div>

            {/* ── Sending ─────────────────────────────────────────────── */}
            {mine ? (
              <div className="mt-5">
                <Field label={t('challenge.yourRun')}>
                  <span className="font-display text-2xl leading-none tabnum ink">
                    {formatRunTime(mine.time)}
                  </span>
                </Field>
                <label className="mt-3 block">
                  <span
                    className="font-body text-[10px] font-bold uppercase tracking-[0.18em]"
                    style={{ color: UI.inkSoft }}
                  >
                    {t('challenge.nameLabel')}
                  </span>
                  <input
                    value={name}
                    maxLength={NAME_MAX}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={rememberName}
                    placeholder={t('challenge.namePlaceholder')}
                    data-menu-outsider
                    className="mt-1 w-full rounded-sm border px-3 py-2 font-body text-sm ink"
                    style={{ borderColor: 'rgba(42,29,20,0.35)', background: 'rgba(255,246,222,0.6)' }}
                  />
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="op-button op-button--primary flex-1 px-4 py-2 text-sm" onClick={() => void share()}>
                    {t('challenge.send')}
                  </button>
                  <button className="op-button px-4 py-2 text-sm" onClick={() => void copy()}>
                    {copied ? t('challenge.copied') : t('challenge.copy')}
                  </button>
                </div>
                <p className="mt-2 font-body text-[10px] leading-snug" style={{ color: UI.inkSoft }}>
                  {t('challenge.how')}
                </p>
              </div>
            ) : (
              <p className="mt-5 font-body text-xs leading-snug" style={{ color: UI.inkSoft }}>
                {t('challenge.noRun')}
              </p>
            )}

            <Divider />

            {/* ── Receiving ───────────────────────────────────────────── */}
            <h3 className="font-display text-xl leading-none ink">{t('challenge.pasteTitle')}</h3>
            <label className="mt-2 block">
              <span className="sr-only">{t('challenge.pasteLabel')}</span>
              <textarea
                ref={pasteRef}
                value={paste}
                rows={2}
                onChange={(e) => {
                  setPaste(e.target.value)
                  setStatus(null)
                }}
                placeholder={t('challenge.pasteLabel')}
                data-menu-outsider
                className="w-full resize-none rounded-sm border px-3 py-2 font-body text-[11px] ink"
                style={{ borderColor: 'rgba(42,29,20,0.35)', background: 'rgba(255,246,222,0.6)' }}
              />
            </label>
            <button
              className="op-button mt-2 w-full px-4 py-2 text-sm"
              disabled={paste.trim().length === 0}
              onClick={load}
            >
              {t('challenge.pasteAction')}
            </button>
            {status && (
              <p
                className="mt-2 font-body text-[11px] leading-snug"
                style={{ color: status.kind === 'ok' ? UI.inkSoft : UI.wax }}
                role="status"
              >
                {status.kind === 'bad' && t('challenge.bad')}
                {status.kind === 'unknown' && t('challenge.unknownLevel')}
                {status.kind === 'ok' && t('challenge.loaded', { level: status.level ?? '' })}
              </p>
            )}

            <button className="op-button mt-5 w-full px-4 py-2 text-sm" onClick={onClose}>
              {t('map.back')}
            </button>
          </Paper>
        </m.div>
        </div>
        </div>
      </div>
    </m.div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="font-body text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: UI.inkSoft }}>
        {label}
      </span>
      {children}
    </div>
  )
}

function Divider() {
  return (
    <div
      className="my-5 h-px w-full"
      style={{ background: 'linear-gradient(90deg,transparent,rgba(42,29,20,0.35),transparent)' }}
    />
  )
}
