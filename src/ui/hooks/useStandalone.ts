import { useEffect, useState } from 'react'

/**
 * Whether this is a phone looking at the game in a browser rather than in the
 * copy installed to its home screen.
 *
 * Exists for one situation, and it is a real one. On iOS a link never opens in
 * an installed web app — it opens in Safari — and a home-screen app there does
 * not share storage with Safari. So a challenge tapped on a phone lands in a
 * copy of the game with none of the player's progress in it, while the copy
 * they actually play has no idea the challenge exists. Nothing on this side
 * can move data between the two.
 *
 * What it can do is say so, and offer the code to carry across by hand. That
 * is only worth saying to somebody who might have the app: a desktop browser
 * has no home screen to install to, so the coarse-pointer test keeps the
 * notice off screens where it would be noise.
 */
export function useBrowserOnPhone(): boolean {
  const read = () => {
    if (typeof window === 'undefined') return false
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.matchMedia?.('(display-mode: fullscreen)').matches ||
      // iOS predates the media query and still reports it this way.
      (navigator as unknown as { standalone?: boolean }).standalone === true
    const phone = window.matchMedia?.('(pointer: coarse)').matches ?? false
    return phone && !standalone
  }
  const [v, setV] = useState(read)
  useEffect(() => {
    const on = () => setV(read())
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return v
}
