import { useEffect, useState } from 'react'

/**
 * True when the screen is wide enough, and short enough, to want two columns.
 *
 * A phone held sideways is roughly 850 by 390. A settings sheet laid out as one
 * narrow column on that runs to nearly twice the height of the screen, and the
 * half below the fold includes the switch you were looking for — with nothing
 * on screen to say the sheet continues. Meanwhile there are three hundred
 * pixels of unused width on either side of it.
 *
 * So the test is on the *shape* rather than on either measurement alone: a
 * short screen that is also wide has the room to spend sideways, and spending
 * it is what stops the list from needing to be scrolled at all.
 */
export function useTwoColumns(minWidth = 680, maxHeight = 520): boolean {
  const read = () =>
    typeof window === 'undefined'
      ? false
      : window.innerWidth >= minWidth && window.innerHeight <= maxHeight

  const [two, setTwo] = useState(read)
  useEffect(() => {
    const onResize = () => setTwo(read())
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
    // `read` closes over the two limits, which are arguments and do not change
    // for the lifetime of a mounted screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minWidth, maxHeight])
  return two
}
