import { useCallback, useEffect, useRef, useState } from 'react'

/** Nearest ancestor that scrolls vertically — the box whose height is the budget. */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let n = el.parentElement; n; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY
    if (o === 'auto' || o === 'scroll') return n
  }
  return null
}

/**
 * Shrinks a block until it fits the height it was given.
 *
 * The end-of-level poster is laid out for a window. A phone held sideways is
 * about 390px tall and the poster wants 430, so its buttons — the whole point
 * of the screen — fell off the bottom. Scrolling is a poor answer for a screen
 * you look at for two seconds and then press, so the block is scaled down
 * whole instead: nothing reflows, nothing is dropped, everything just gets a
 * little smaller together.
 *
 * `ref` goes on the block. `scale` and `height` go on its wrapper and on it,
 * respectively — the wrapper needs the reduced height because a transform does
 * not change the space an element takes up in the layout.
 */
export function useFitScale(min = 0.55): {
  ref: (el: HTMLElement | null) => void
  scale: number
  height: number | undefined
} {
  const node = useRef<HTMLElement | null>(null)
  const [scale, setScale] = useState(1)
  const [height, setHeight] = useState<number | undefined>(undefined)

  const measure = useCallback(() => {
    const el = node.current
    if (!el) return
    // Measured unscaled, every time: reading the height of a block that is
    // already scaled would feed the last answer back in and drift.
    const applied = el.style.transform
    el.style.transform = 'none'
    const natural = el.offsetHeight
    el.style.transform = applied

    const box = scrollParent(el)
    if (!natural || !box) return
    // The safe-area padding is rarely on the scroller itself — it usually sits
    // on a wrapper in between — so the budget is the scroller minus every
    // padding and border on the way down to the block.
    let taken = 0
    for (let n: HTMLElement | null = el.parentElement; n; n = n.parentElement) {
      const c = getComputedStyle(n)
      taken +=
        parseFloat(c.paddingTop) +
        parseFloat(c.paddingBottom) +
        parseFloat(c.borderTopWidth) +
        parseFloat(c.borderBottomWidth)
      if (n === box) break
    }
    const avail = box.clientHeight - taken
    const k = Math.min(1, Math.max(min, avail / natural))
    setScale(k)
    setHeight(k < 1 ? Math.ceil(natural * k) : undefined)
  }, [min])

  const ref = useCallback(
    (el: HTMLElement | null) => {
      node.current = el
      if (el) measure()
    },
    [measure],
  )

  useEffect(() => {
    measure()
    const el = node.current
    const ro = new ResizeObserver(() => measure())
    if (el) ro.observe(el)
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
    }
  }, [measure])

  return { ref, scale, height }
}
