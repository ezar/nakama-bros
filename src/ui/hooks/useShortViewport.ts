import { useEffect, useState } from 'react'

/**
 * True when the viewport is shorter than `limit` px.
 *
 * A phone held sideways is around 390px tall and this game locks to landscape,
 * so that is not an edge case, it is the phone. Screens use this to trade
 * padding and ornament for a layout that fits without scrolling.
 */
export function useShortViewport(limit = 560): boolean {
  const [h, setH] = useState(() => (typeof window === 'undefined' ? 800 : window.innerHeight))
  useEffect(() => {
    const onResize = () => setH(window.innerHeight)
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])
  return h < limit
}
