import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion as m } from 'framer-motion'
import { RaceSession, type RaceSnapshot } from '../../net/session'
import { signalKind } from '../../net/signalCode'
import { useProgress } from '../../store/progressStore'
import { useSettings } from '../../store/settingsStore'
import { useT } from '../../i18n/useT'
import { useUiMotion } from '../hooks/useUiMotion'
import { useShortViewport } from '../hooks/useShortViewport'
import { useFitScale } from '../hooks/useFitScale'
import { Paper } from '../art/Paper'
import { JollyRoger } from '../art/Icons'
import { UI } from '../theme'
import { ALL_LEVELS, levelById } from '../../game/level'
import { levelLocked } from './MapScreen'
import { WORLDS } from '../../game/level'
import { readName } from '../../game/ghostCode'
import { NAME_MAX } from '../../game/ghostCode'

/**
 * Setting up a race between two devices.
 *
 * The awkward part of this screen is not the layout, it is that WebRTC needs
 * two codes carried in opposite directions before anything can connect, and
 * there is no way around that without a server. So the screen is built around
 * making the two steps impossible to confuse: each side sees only its own
 * numbered steps, and a code pasted into the wrong box is named as such rather
 * than being fed to the connection, which would report it — if at all — as a
 * link that simply never came up.
 */

type Role = 'pick' | 'host' | 'join'

export function VersusScreen({
  session: existing,
  onRace,
  onBack,
}: {
  /**
   * A connection that is already up, for a rematch.
   *
   * When this is given the screen opens straight into the lobby: the two codes
   * have already been carried across once and there is no reason to do it
   * again between races.
   */
  session?: RaceSession | null
  /** Both sides are connected and the host has started. Go and play. */
  onRace: (session: RaceSession, levelId: string) => void
  onBack: () => void
}) {
  const t = useT()
  const motion = useUiMotion()
  const short = useShortViewport(560)
  const fit = useFitScale()
  const crew = useProgress((s) => s.crew)
  const records = useProgress((s) => s.records)
  const storedName = useSettings((s) => s.playerName)
  const setSettings = useSettings((s) => s.set)

  const [role, setRole] = useState<Role>(existing ? (existing.isHost ? 'host' : 'join') : 'pick')
  const [name, setName] = useState(storedName)
  const [myCode, setMyCode] = useState<string | null>(null)
  const [paste, setPaste] = useState('')
  const [error, setError] = useState<'bad' | 'wrongWay' | null>(null)
  const [snap, setSnap] = useState<RaceSnapshot | null>(null)
  const sessionRef = useRef<RaceSession | null>(existing ?? null)
  /**
   * Whether the session has been handed to the router.
   *
   * This screen unmounts the instant the race begins, and its cleanup used to
   * close the connection on the way out — killing it at precisely the moment
   * it started being needed. Once handed over the session belongs to `App`,
   * which closes it when the race is done.
   */
  const handedOver = useRef(false)

  /** The stages this device can offer. A race never unlocks anything. */
  const openStages = useMemo(
    () => ALL_LEVELS.filter((l) => !levelLocked(l.id, records, WORLDS)),
    [records],
  )
  const [stage, setStage] = useState(() => openStages[openStages.length - 1]?.id ?? ALL_LEVELS[0].id)

  // Walking away has to close the connection: a peer left open holds a socket
  // and, worse, leaves the other player staring at a lobby waiting for somebody
  // who has gone. Walking *into* the race must not — see `handedOver`.
  useEffect(() => () => {
    if (!handedOver.current) sessionRef.current?.close()
  }, [])

  // A connection handed in for a rematch is already open; subscribing is all
  // that is left to do, and it must not be re-done on every render.
  useEffect(() => {
    if (!existing) return
    handedOver.current = false
    return existing.subscribe(setSnap)
  }, [existing])

  const begin = useCallback(
    async (as: Role) => {
      const clean = readName(name) || '?'
      if (clean !== storedName) setSettings({ playerName: clean })
      const session = new RaceSession(as === 'host', { name: clean, crew })
      sessionRef.current = session
      session.subscribe(setSnap)
      setRole(as)
      if (as === 'host') {
        session.setLevel(stage)
        setMyCode(await session.offer())
      }
    },
    [name, storedName, setSettings, crew, stage],
  )

  const applyCode = useCallback(async () => {
    const session = sessionRef.current
    if (!session) return
    setError(null)
    const kind = signalKind(paste)
    // Named before it is used. The mistake people make here is pasting the
    // code from the step they did last time, and the connection's own report
    // of that is silence.
    if (role === 'host' && kind !== 'answer') return setError(kind ? 'wrongWay' : 'bad')
    if (role === 'join' && kind !== 'offer') return setError(kind ? 'wrongWay' : 'bad')
    if (role === 'host') {
      if (!(await session.accept(paste))) return setError('bad')
    } else {
      const answer = await session.join(paste)
      if (!answer) return setError('bad')
      setMyCode(answer)
    }
    setPaste('')
  }, [paste, role])

  const share = useCallback(async () => {
    if (!myCode) return
    if (navigator.share) {
      try {
        await navigator.share({ text: myCode })
        return
      } catch {
        return
      }
    }
    try {
      await navigator.clipboard.writeText(myCode)
    } catch {
      /* The box below is selectable; nothing else to do. */
    }
  }, [myCode])

  // Once the host presses start, both sides fall through into the stage. The
  // guest never chooses: it follows the stage the host announced.
  useEffect(() => {
    const session = sessionRef.current
    if (!session || !snap) return
    if (snap.phase === 'countdown' && snap.levelId && levelById(snap.levelId)) {
      handedOver.current = true
      onRace(session, snap.levelId)
    }
  }, [snap, onRace])

  const body = () => {
    if (snap?.phase === 'lost') return <Lost t={t} onBack={onBack} />
    if (snap && (snap.phase === 'lobby' || snap.phase === 'countdown')) {
      return (
        <Lobby
          t={t}
          snap={snap}
          isHost={role === 'host'}
          stages={openStages}
          stage={stage}
          onStage={(id) => {
            setStage(id)
            sessionRef.current?.setLevel(id)
          }}
          onStart={() => sessionRef.current?.start()}
        />
      )
    }
    if (role === 'pick') {
      return (
        <Pick
          t={t}
          name={name}
          onName={setName}
          onHost={() => void begin('host')}
          onJoin={() => void begin('join')}
        />
      )
    }
    return (
      <Handshake
        t={t}
        role={role}
        code={myCode}
        paste={paste}
        onPaste={(v) => {
          setPaste(v)
          setError(null)
        }}
        onUse={() => void applyCode()}
        onShare={() => void share()}
        error={error}
        connecting={snap?.connection === 'connecting' || snap?.connection === 'signalling'}
      />
    )
  }

  return (
    <m.div
      key="versus"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-30 overflow-y-auto overscroll-contain bg-[rgba(3,2,1,0.92)]"
      role="dialog"
      aria-modal="true"
      aria-label={t('versus.title')}
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
          <div
            ref={fit.ref as (el: HTMLDivElement | null) => void}
            style={fit.scale < 1 ? { transform: `scale(${fit.scale})`, transformOrigin: 'top center' } : undefined}
          >
            <m.div
              initial={motion ? { scale: 0.95, opacity: 0, rotate: -1 } : false}
              animate={motion ? { scale: 1, opacity: 1, rotate: -0.6 } : {}}
              transition={{ type: 'spring', stiffness: 150, damping: 17 }}
            >
              <Paper seed={53} edges="all" bite={3} age={0.82} className={`w-[min(470px,93vw)] ${short ? 'px-5 py-4' : 'px-7 py-6'}`}>
                <div className="flex items-center gap-2">
                  <JollyRoger size={26} />
                  <h2 className="font-display text-2xl leading-none ink">{t('versus.title')}</h2>
                </div>
                {body()}
                <button className="op-button mt-5 w-full px-4 py-2 text-sm" onClick={onBack}>
                  {t('versus.leave')}
                </button>
              </Paper>
            </m.div>
          </div>
        </div>
      </div>
    </m.div>
  )
}

type T = ReturnType<typeof useT>

const label = 'font-body text-[10px] font-bold uppercase tracking-[0.18em]'
const field = 'mt-1 w-full rounded-sm border px-3 py-2 font-body text-sm ink'
const fieldStyle = { borderColor: 'rgba(42,29,20,0.35)', background: 'rgba(255,246,222,0.6)' }

function Pick({
  t, name, onName, onHost, onJoin,
}: { t: T; name: string; onName: (v: string) => void; onHost: () => void; onJoin: () => void }) {
  return (
    <div className="mt-3">
      <p className="font-body text-[11px] leading-snug" style={{ color: UI.inkSoft }}>
        {t('versus.blurb')}
      </p>
      <label className="mt-3 block">
        <span className={label} style={{ color: UI.inkSoft }}>{t('challenge.nameLabel')}</span>
        <input
          value={name}
          maxLength={NAME_MAX}
          onChange={(e) => onName(e.target.value)}
          placeholder={t('challenge.namePlaceholder')}
          data-menu-outsider
          className={field}
          style={fieldStyle}
        />
      </label>
      <div className="mt-3 flex flex-col gap-2">
        <button className="op-button op-button--primary px-4 py-2 text-sm" onClick={onHost}>
          {t('versus.hostRole')}
        </button>
        <button className="op-button px-4 py-2 text-sm" onClick={onJoin}>
          {t('versus.joinRole')}
        </button>
      </div>
    </div>
  )
}

function Handshake({
  t, role, code, paste, onPaste, onUse, onShare, error, connecting,
}: {
  t: T
  role: 'host' | 'join'
  code: string | null
  paste: string
  onPaste: (v: string) => void
  onUse: () => void
  onShare: () => void
  error: 'bad' | 'wrongWay' | null
  connecting: boolean
}) {
  // The host makes a code first and then takes one; the guest takes one first
  // and then makes one. Same two steps, opposite order — which is exactly the
  // thing people get wrong, so each side is numbered and only its own is shown.
  const mine = (
    <div>
      <div className={label} style={{ color: UI.inkSoft }}>
        {role === 'host' ? t('versus.step1Host') : t('versus.step2Join')}
      </div>
      {code ? (
        <>
          <textarea
            readOnly
            value={code}
            rows={2}
            onFocus={(e) => e.currentTarget.select()}
            data-menu-outsider
            className="mt-1 w-full resize-none rounded-sm border px-3 py-2 font-body text-[10px] ink"
            style={fieldStyle}
          />
          <button className="op-button op-button--primary mt-2 w-full px-4 py-2 text-sm" onClick={onShare}>
            {t('versus.sendCode')}
          </button>
        </>
      ) : (
        <p className="mt-1 font-body text-[11px]" style={{ color: UI.inkSoft }}>{t('versus.making')}</p>
      )}
    </div>
  )

  const theirs = (
    <div>
      <div className={label} style={{ color: UI.inkSoft }}>
        {role === 'host' ? t('versus.step2Host') : t('versus.step1Join')}
      </div>
      <textarea
        value={paste}
        rows={2}
        onChange={(e) => onPaste(e.target.value)}
        placeholder={t('versus.paste')}
        data-menu-outsider
        className="mt-1 w-full resize-none rounded-sm border px-3 py-2 font-body text-[10px] ink"
        style={fieldStyle}
      />
      <button
        className="op-button mt-2 w-full px-4 py-2 text-sm"
        disabled={paste.trim().length === 0}
        onClick={onUse}
      >
        {t('versus.use')}
      </button>
    </div>
  )

  return (
    <div className="mt-3 flex flex-col gap-4">
      {role === 'host' ? mine : theirs}
      {role === 'host' ? theirs : mine}
      {error && (
        <p className="font-body text-[11px] leading-snug" style={{ color: UI.wax }} role="status">
          {t(error === 'bad' ? 'versus.badCode' : 'versus.wrongWay')}
        </p>
      )}
      {connecting && !error && (
        <p className="font-body text-[11px]" style={{ color: UI.inkSoft }} role="status">
          {t('versus.waiting')}
        </p>
      )}
    </div>
  )
}

function Lobby({
  t, snap, isHost, stages, stage, onStage, onStart,
}: {
  t: T
  snap: RaceSnapshot
  isHost: boolean
  stages: typeof ALL_LEVELS
  stage: string
  onStage: (id: string) => void
  onStart: () => void
}) {
  const them = snap.opponent?.name || '?'
  const chosen = snap.levelId ? levelById(snap.levelId) : null
  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-display text-xl leading-none ink">{t('versus.connected', { name: them })}</span>
        <span className="font-body text-[10px] tabnum" style={{ color: UI.inkSoft }}>
          {t('versus.ping', { ms: snap.rttMs })}
        </span>
      </div>

      {isHost ? (
        <label className="mt-3 block">
          <span className={label} style={{ color: UI.inkSoft }}>{t('versus.pickStage')}</span>
          <select
            value={stage}
            onChange={(e) => onStage(e.target.value)}
            data-menu-outsider
            className={field}
            style={fieldStyle}
          >
            {stages.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </label>
      ) : (
        <div className="mt-3">
          <div className={label} style={{ color: UI.inkSoft }}>{t('versus.stage')}</div>
          <div className="font-display text-xl leading-none ink">
            {chosen?.name ?? t('versus.waitStage', { name: them })}
          </div>
        </div>
      )}

      <p className="mt-3 font-body text-[10px] leading-snug" style={{ color: UI.inkSoft }}>
        {t('versus.noRace')}
      </p>

      {isHost ? (
        <button
          className="op-button op-button--primary mt-3 w-full px-4 py-2 text-sm"
          disabled={snap.phase !== 'lobby'}
          onClick={onStart}
        >
          {t('versus.begin')}
        </button>
      ) : (
        <p className="mt-3 font-body text-[11px]" style={{ color: UI.inkSoft }}>
          {t('versus.hostStarts', { name: them })}
        </p>
      )}
    </div>
  )
}

function Lost({ t, onBack }: { t: T; onBack: () => void }) {
  return (
    <div className="mt-3">
      <p className="font-body text-sm font-bold" style={{ color: UI.wax }}>{t('versus.lost')}</p>
      {/* The likeliest cause by a distance, and one nothing here can fix — so
          it is said plainly rather than left as a connection that failed. */}
      <p className="mt-2 font-body text-[11px] leading-snug" style={{ color: UI.inkSoft }}>
        {t('versus.lostHint')}
      </p>
      <button className="op-button mt-3 w-full px-4 py-2 text-sm" onClick={onBack}>
        {t('versus.leave')}
      </button>
    </div>
  )
}
