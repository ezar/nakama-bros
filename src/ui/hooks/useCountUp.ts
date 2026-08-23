import { useEffect, useRef, useState } from 'react'

/**
 * Counts a number up on screen.
 *
 * The result screen writes a bounty rather than printing it, so the value has
 * to arrive over time — and every few units it fires `onTick`, which is what a
 * caller wires to the counter sound. Under reduced motion it lands on the final
 * value immediately and never ticks.
 */
export function useCountUp(
  target: number,
  {
    duration = 1200,
    delay = 0,
    enabled = true,
    onTick,
    tickMs = 55,
  }: { duration?: number; delay?: number; enabled?: boolean; onTick?: () => void; tickMs?: number } = {},
): number {
  const [value, setValue] = useState(enabled ? 0 : target)
  const tickRef = useRef(onTick)
  tickRef.current = onTick

  useEffect(() => {
    if (!enabled) {
      setValue(target)
      return
    }
    let raf = 0
    let start = 0
    let lastTick = 0
    const step = (now: number) => {
      if (!start) start = now
      const t = (now - start - delay) / duration
      if (t < 0) {
        raf = requestAnimationFrame(step)
        return
      }
      if (t >= 1) {
        setValue(target)
        tickRef.current?.()
        return
      }
      // Ease out: the last hundred million berries should not take as long as
      // the first, or the reveal drags.
      const eased = 1 - Math.pow(1 - t, 2.2)
      setValue(Math.floor(target * eased))
      if (now - lastTick > tickMs) {
        lastTick = now
        tickRef.current?.()
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, duration, delay, enabled, tickMs])

  return value
}
