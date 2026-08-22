import { useReducedMotion } from 'framer-motion'

/**
 * True when decorative motion is welcome.
 *
 * Everything ambient in the shell — swells, gulls, the rocking hull, counters
 * that roll — asks this first. Under `prefers-reduced-motion` the same screens
 * render in their settled end state rather than not at all.
 */
export function useUiMotion(): boolean {
  return !useReducedMotion()
}
