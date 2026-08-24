import { useEffect, useRef } from 'react'
import type { ButtonName } from '../../types'
import type { Input } from '../../engine/input'
import { useT } from '../../i18n/useT'
import { UI } from '../theme'

interface Props {
  input: Input
  visible: boolean
}

/**
 * On-screen controls for touch devices.
 *
 * The pad is a single analog-ish disc rather than four buttons: a thumb that
 * drifts off a button edge still steers, which is the difference between a
 * playable and an infuriating mobile platformer. It reports which way it is
 * being pushed by writing straight to the DOM — a d-pad that re-rendered React
 * on every thumb movement would cost the game frames.
 *
 * Everything is inset from the safe area, and the two action buttons are placed
 * for a right thumb at rest: jump lowest and largest, attack above and inboard.
 */
export function TouchControls({ input, visible }: Props) {
  const t = useT()
  const padRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLDivElement>(null)
  const arrows = useRef<Record<string, HTMLSpanElement | null>>({})
  const activeTouch = useRef<number | null>(null)

  useEffect(() => {
    if (!visible) return
    const pad = padRef.current
    if (!pad) return

    const light = (dir: string, on: boolean) => {
      const el = arrows.current[dir]
      if (el) el.style.opacity = on ? '1' : '0.4'
    }

    const applyFromPoint = (clientX: number, clientY: number) => {
      const r = pad.getBoundingClientRect()
      const dx = (clientX - (r.left + r.width / 2)) / (r.width / 2)
      const dy = (clientY - (r.top + r.height / 2)) / (r.height / 2)
      const left = dx < -0.25
      const right = dx > 0.25
      const up = dy < -0.45
      const down = dy > 0.45
      input.setVirtual('left', left)
      input.setVirtual('right', right)
      input.setVirtual('up', up)
      input.setVirtual('down', down)
      light('left', left)
      light('right', right)
      light('up', up)
      light('down', down)
      if (knobRef.current) {
        const k = Math.min(1, Math.hypot(dx, dy))
        const a = Math.atan2(dy, dx)
        knobRef.current.style.transform = `translate(${(Math.cos(a) * k * 26).toFixed(1)}px, ${(Math.sin(a) * k * 26).toFixed(1)}px)`
      }
    }

    const release = () => {
      activeTouch.current = null
      for (const b of ['left', 'right', 'up', 'down'] as ButtonName[]) {
        input.setVirtual(b, false)
        light(b, false)
      }
      if (knobRef.current) knobRef.current.style.transform = 'translate(0px, 0px)'
    }

    const onStart = (e: TouchEvent) => {
      const t0 = e.changedTouches[0]
      activeTouch.current = t0.identifier
      applyFromPoint(t0.clientX, t0.clientY)
      e.preventDefault()
    }
    const onMove = (e: TouchEvent) => {
      for (const t0 of Array.from(e.changedTouches)) {
        if (t0.identifier !== activeTouch.current) continue
        applyFromPoint(t0.clientX, t0.clientY)
      }
      e.preventDefault()
    }
    const onEnd = (e: TouchEvent) => {
      for (const t0 of Array.from(e.changedTouches)) {
        if (t0.identifier !== activeTouch.current) continue
        release()
      }
      e.preventDefault()
    }

    pad.addEventListener('touchstart', onStart, { passive: false })
    pad.addEventListener('touchmove', onMove, { passive: false })
    pad.addEventListener('touchend', onEnd, { passive: false })
    pad.addEventListener('touchcancel', onEnd, { passive: false })
    return () => {
      pad.removeEventListener('touchstart', onStart)
      pad.removeEventListener('touchmove', onMove)
      pad.removeEventListener('touchend', onEnd)
      pad.removeEventListener('touchcancel', onEnd)
      release()
    }
  }, [input, visible])

  if (!visible) return null

  /** Press feedback lives on the element, not in state: no re-render mid-jump. */
  const hold = (b: ButtonName) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.currentTarget.dataset.pressed = 'true'
      input.setVirtual(b, true)
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.dataset.pressed = 'false'
      input.setVirtual(b, false)
    },
    onPointerLeave: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.dataset.pressed = 'false'
      input.setVirtual(b, false)
    },
    onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.dataset.pressed = 'false'
      input.setVirtual(b, false)
    },
  })

  const roundButton = (size: number, ring: string, face: string, faceLit: string) => ({
    width: size,
    height: size,
    backgroundImage: `radial-gradient(circle at 34% 28%, ${faceLit} 0%, ${face} 58%, rgba(0,0,0,0.55) 100%)`,
    border: `3px solid ${ring}`,
    boxShadow: `0 5px 0 rgba(0,0,0,0.55), 0 12px 20px -8px rgba(0,0,0,0.9), inset 0 2px 0 rgba(255,255,255,0.35)`,
  })

  return (
    <div
      // Inset, not padded: the pad and the buttons are absolutely positioned,
      // and those measure from the padding box, which padding does not move.
      // The jump button was sitting half under the rounded corner.
      className="pointer-events-none absolute z-20 touch-none select-none"
      style={{
        top: 'var(--safe-t)',
        right: 'var(--safe-r)',
        bottom: 'var(--safe-b)',
        left: 'var(--safe-l)',
      }}
    >
      {/* ── Steering ── */}
      <div
        ref={padRef}
        role="group"
        aria-label={t('touch.move')}
        className="pointer-events-auto absolute bottom-6 left-5 grid h-36 w-36 place-items-center rounded-full"
        style={{
          backgroundImage:
            'radial-gradient(circle at 36% 30%, rgba(255,226,180,0.18) 0%, rgba(20,12,6,0.55) 62%, rgba(8,4,2,0.7) 100%)',
          border: `3px solid ${UI.brassDark}`,
          boxShadow: '0 8px 22px -8px rgba(0,0,0,0.9), inset 0 2px 10px rgba(0,0,0,0.6)',
          backdropFilter: 'blur(2px)',
        }}
      >
        <div className="absolute inset-4 rounded-full border" style={{ borderColor: 'rgba(201,165,102,0.25)' }} />
        {/* the four bearings, lit as the thumb pushes */}
        {(
          [
            ['up', 'top-2 left-1/2 -translate-x-1/2', 'M12 3 L 21 17 L 3 17 Z'],
            ['down', 'bottom-2 left-1/2 -translate-x-1/2', 'M12 21 L 3 7 L 21 7 Z'],
            ['left', 'left-2 top-1/2 -translate-y-1/2', 'M3 12 L 17 3 L 17 21 Z'],
            ['right', 'right-2 top-1/2 -translate-y-1/2', 'M21 12 L 7 21 L 7 3 Z'],
          ] as const
        ).map(([dir, pos, d]) => (
          <span
            key={dir}
            ref={(el) => {
              arrows.current[dir] = el
            }}
            className={`absolute ${pos}`}
            style={{ opacity: 0.4, transition: 'opacity 90ms linear' }}
          >
            <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden="true">
              <path d={d} fill={UI.brassLit} />
            </svg>
          </span>
        ))}
        {/* the thumb rest, which follows the push */}
        <div
          ref={knobRef}
          className="h-14 w-14 rounded-full"
          style={{
            backgroundImage: `radial-gradient(circle at 34% 30%, ${UI.brassLit} 0%, ${UI.brass} 55%, #5A3E12 100%)`,
            boxShadow: '0 4px 10px rgba(0,0,0,0.6), inset 0 -3px 6px rgba(0,0,0,0.45)',
            transition: 'transform 70ms ease-out',
          }}
        />
      </div>

      {/* ── Actions ── */}
      <div className="pointer-events-auto absolute bottom-7 right-6 flex items-end gap-4">
        <button
          {...hold('attack')}
          aria-label={t('touch.attack')}
          className="grid place-items-center rounded-full font-body text-lg font-extrabold text-op-cream transition-transform duration-75 data-[pressed=true]:translate-y-[5px] data-[pressed=true]:brightness-125"
          style={{ ...roundButton(70, '#5E1B15', UI.wax, UI.waxLit), marginBottom: 26 }}
        >
          X
        </button>
        <button
          {...hold('jump')}
          aria-label={t('touch.jump')}
          className="grid place-items-center rounded-full font-body text-2xl font-extrabold transition-transform duration-75 data-[pressed=true]:translate-y-[5px] data-[pressed=true]:brightness-125"
          style={{ ...roundButton(92, '#5A3E12', UI.brass, UI.brassLit), color: '#2A1808' }}
        >
          A
        </button>
      </div>

    </div>
  )
}

/**
 * Pause, rendered inside the HUD's own right-hand column.
 *
 * It used to live with the thumb controls, pinned four and a half rem from the
 * top of the screen — a guess at where the readout above it ended. The readout
 * is a stack that grows: the clock sits under the score, and a chain multiplier
 * appears under that. The guess was wrong, and the button sat on the clock.
 *
 * Handing it to the HUD to lay out means the two cannot overlap however either
 * of them changes, which a better guess would not have bought. It still writes
 * to the input rather than calling a handler, so the pause goes through the
 * game the same way the keyboard's does.
 */
export function PauseButton({ input }: { input: Input }) {
  const t = useT()
  const press = (down: boolean) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (down) e.preventDefault()
    e.currentTarget.dataset.pressed = String(down)
    input.setVirtual('pause', down)
  }
  return (
    <button
      onPointerDown={press(true)}
      onPointerUp={press(false)}
      onPointerLeave={press(false)}
      onPointerCancel={press(false)}
      aria-label={t('touch.pause')}
      className="pointer-events-auto grid h-10 w-10 place-items-center rounded-[6px] transition-transform duration-75 data-[pressed=true]:translate-y-[3px]"
      style={{
        border: `2px solid ${UI.brassDark}`,
        backgroundImage: 'linear-gradient(180deg, rgba(255,226,180,0.14), rgba(0,0,0,0.4))',
        backgroundColor: 'rgba(16,9,4,0.6)',
      }}
    >
      <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden="true">
        <rect x={3} y={2} width={4} height={12} rx={1.2} fill={UI.brassLit} />
        <rect x={9} y={2} width={4} height={12} rx={1.2} fill={UI.brassLit} />
      </svg>
    </button>
  )
}
