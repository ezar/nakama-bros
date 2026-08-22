import { useEffect, useRef } from 'react'
import type { ButtonName } from '../../types'
import type { Input } from '../../engine/input'

interface Props {
  input: Input
  visible: boolean
}

/**
 * On-screen controls for touch devices.
 *
 * The d-pad is a single analog-ish pad rather than four buttons: a thumb that
 * drifts off a button edge still steers, which is the difference between a
 * playable and an infuriating mobile platformer.
 */
export function TouchControls({ input, visible }: Props) {
  const padRef = useRef<HTMLDivElement>(null)
  const activeTouch = useRef<number | null>(null)

  useEffect(() => {
    if (!visible) return
    const pad = padRef.current
    if (!pad) return

    const applyFromPoint = (clientX: number, clientY: number) => {
      const r = pad.getBoundingClientRect()
      const dx = (clientX - (r.left + r.width / 2)) / (r.width / 2)
      const dy = (clientY - (r.top + r.height / 2)) / (r.height / 2)
      input.setVirtual('left', dx < -0.25)
      input.setVirtual('right', dx > 0.25)
      input.setVirtual('up', dy < -0.45)
      input.setVirtual('down', dy > 0.45)
    }

    const onStart = (e: TouchEvent) => {
      const t = e.changedTouches[0]
      activeTouch.current = t.identifier
      applyFromPoint(t.clientX, t.clientY)
      e.preventDefault()
    }
    const onMove = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== activeTouch.current) continue
        applyFromPoint(t.clientX, t.clientY)
      }
      e.preventDefault()
    }
    const onEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== activeTouch.current) continue
        activeTouch.current = null
        for (const b of ['left', 'right', 'up', 'down'] as ButtonName[]) input.setVirtual(b, false)
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
    }
  }, [input, visible])

  if (!visible) return null

  const hold = (b: ButtonName) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault()
      input.setVirtual(b, true)
    },
    onPointerUp: () => input.setVirtual(b, false),
    onPointerLeave: () => input.setVirtual(b, false),
    onPointerCancel: () => input.setVirtual(b, false),
  })

  return (
    <div className="pointer-events-none absolute inset-0 z-20 touch-none select-none">
      <div
        ref={padRef}
        className="pointer-events-auto absolute bottom-6 left-5 h-32 w-32 rounded-full border border-op-cream/25 bg-op-deep/45 backdrop-blur-[2px]"
      >
        <div className="absolute inset-6 rounded-full border border-op-cream/15" />
        <div className="absolute inset-x-0 top-3 text-center text-op-cream/50">▲</div>
        <div className="absolute inset-x-0 bottom-3 text-center text-op-cream/50">▼</div>
        <div className="absolute inset-y-0 left-3 flex items-center text-op-cream/50">◀</div>
        <div className="absolute inset-y-0 right-3 flex items-center text-op-cream/50">▶</div>
      </div>

      <div className="pointer-events-auto absolute bottom-8 right-5 flex items-end gap-3">
        <button
          {...hold('attack')}
          className="h-16 w-16 rounded-full border border-op-red/60 bg-op-red/25 font-bold text-op-cream backdrop-blur-[2px] active:bg-op-red/50"
          aria-label="Atacar"
        >
          X
        </button>
        <button
          {...hold('jump')}
          className="h-20 w-20 rounded-full border border-op-gold/70 bg-op-gold/25 font-bold text-op-cream backdrop-blur-[2px] active:bg-op-gold/50"
          aria-label="Saltar"
        >
          A
        </button>
      </div>

      <button
        {...hold('pause')}
        className="pointer-events-auto absolute right-4 top-24 h-9 w-9 rounded-md border border-op-cream/25 bg-op-deep/60 text-op-cream/80"
        aria-label="Pausa"
      >
        II
      </button>
    </div>
  )
}
