import { useEffect, useState } from 'react'
import type { RaceSession } from '../net/session'
import { useT } from '../i18n/useT'
import { UI } from './theme'

/**
 * The three seconds before a race starts, over the frozen stage.
 *
 * Driven off its own timer rather than off the session's snapshot, because the
 * session only publishes when something changes and a countdown changes
 * continuously. It reads the deadline and counts down to it — so both devices
 * are showing the same number at the same moment without either being told.
 */
export function RaceCountdown({ race }: { race: RaceSession }) {
  const t = useT()
  const [left, setLeft] = useState<number | null>(null)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const snap = race.snapshot()
      setLeft(snap.phase === 'countdown' ? snap.startsInMs : null)
      // Stops itself once the race is running: nothing below wants to run a
      // frame callback for the whole stage.
      if (snap.phase === 'countdown' || snap.phase === 'lobby') raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [race])

  if (left === null) return null
  /*
    Capped at three, not just rounded up.

    The countdown is three seconds plus half the round trip — the host starts
    late by that much so neither side concedes the latency — and rounding up
    turns those extra few milliseconds into a fourth digit that flashes for an
    instant before the real count begins. Measured: `604:4 719:3 …`.
  */
  const seconds = Math.min(3, Math.ceil(left / 1000))
  const go = seconds <= 0
  // The number swells and fades within its own second. `key` restarts the
  // animation on each change, which is what makes it read as a beat rather
  // than as a number quietly being replaced.
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
      <div
        key={seconds}
        className="animate-seal-thump font-display leading-none"
        style={{
          fontSize: go ? 'clamp(56px, 18vw, 150px)' : 'clamp(72px, 24vw, 200px)',
          color: go ? UI.gold : UI.paperLit,
          textShadow: '0 6px 0 rgba(0,0,0,0.45), 0 12px 40px rgba(0,0,0,0.9)',
        }}
      >
        {go ? t('versus.go') : seconds}
      </div>
    </div>
  )
}
