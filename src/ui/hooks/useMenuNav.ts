import { useCallback, useEffect, useRef } from 'react'

/**
 * Keyboard and gamepad navigation for a menu.
 *
 * Every screen in the shell is reachable without a mouse, which on a game is
 * not an accessibility nicety but the primary input: someone who just put down
 * the pad to open the menu should not have to pick up a mouse.
 *
 * The hook owns the selection index (the screen holds the state), moves DOM
 * focus with it so the focus ring and screen readers follow, and debounces the
 * pad so one stick push moves one item.
 */

export type NavOrientation = 'vertical' | 'horizontal' | 'grid'

interface Options {
  count: number
  index: number
  onIndex: (i: number) => void
  onConfirm: (i: number) => void
  onBack?: () => void
  /** Extra action, wired to the pad's X / the keyboard's Shift. */
  onAlt?: (i: number) => void
  /**
   * Up/down in a horizontal menu. The map uses it to jump between islands while
   * left/right walks the route stage by stage.
   */
  onVertical?: (dir: -1 | 1) => void
  orientation?: NavOrientation
  /** Columns, for grid orientation. */
  columns?: number
  enabled?: boolean
  /**
   * Milliseconds before input is accepted. A menu opened by a button press must
   * not eat that same press as a confirmation.
   */
  armMs?: number
  /** Called on every move, so screens can play a click. */
  onMove?: () => void
  wrap?: boolean
}

const REPEAT_DELAY = 400
const REPEAT_RATE = 130
const DEADZONE = 0.55

/**
 * Is this key going into a text field?
 *
 * If it is, the menu must not see it at all — not just not confirm on it.
 * `a`, `d`, `w` and `s` are movement keys here, and `Backspace` is "go back",
 * and all of them are swallowed with `preventDefault`. Typing a name into the
 * challenge sheet therefore lost letters and could not delete: the field is
 * drawn over the chart, and the chart's menu was eating the keystrokes on
 * their way past `window`.
 *
 * A `select` counts. Its own keyboard handling is how a stage gets picked in
 * the race lobby, and arrow keys there belong to it, not to the screen behind.
 */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.tagName !== 'string') return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true
}

/**
 * Is a dialog covering this menu?
 *
 * A screen underneath a modal is not being looked at, so it must not answer
 * the keyboard: arrow keys were still walking the chart behind an open sheet,
 * and because the selection moves DOM focus with it, the focus jumped out of
 * whatever the player was typing in — which on a phone closes the keyboard
 * mid-word.
 *
 * Asked of the DOM rather than passed down as a prop, so a screen never has to
 * know which dialogs exist above it. A dialog that runs its own menu is not
 * covered by itself, which is what the containment test is for.
 */
function coveredByModal(item: HTMLElement | null): boolean {
  if (typeof document === 'undefined') return false
  const modal = document.querySelector('[role="dialog"][aria-modal="true"]')
  return !!modal && !modal.contains(item)
}

export function useMenuNav({
  count,
  index,
  onIndex,
  onConfirm,
  onBack,
  onAlt,
  onVertical,
  orientation = 'vertical',
  columns = 1,
  enabled = true,
  armMs = 220,
  onMove,
  wrap = true,
}: Options) {
  const items = useRef<Array<HTMLElement | null>>([])
  const armedAt = useRef(0)
  // Latest values, so the polling loop never closes over a stale render.
  const state = useRef({ count, index, onIndex, onConfirm, onBack, onAlt, onVertical, orientation, columns, onMove, wrap })
  state.current = { count, index, onIndex, onConfirm, onBack, onAlt, onVertical, orientation, columns, onMove, wrap }

  useEffect(() => {
    armedAt.current = performance.now() + armMs
  }, [armMs, enabled])

  const move = useCallback((delta: number) => {
    const s = state.current
    if (s.count <= 0) return
    let next = s.index + delta
    if (next < 0) next = s.wrap ? ((next % s.count) + s.count) % s.count : 0
    if (next >= s.count) next = s.wrap ? next % s.count : s.count - 1
    if (next === s.index) return
    s.onIndex(next)
    s.onMove?.()
  }, [])

  /** Focus follows selection, so the ring is always where the cursor is. */
  useEffect(() => {
    if (!enabled) return
    const el = items.current[index]
    // Not while a dialog is up, and not out of a field being typed into: on a
    // phone, moving focus closes the keyboard.
    if (coveredByModal(el) || isTyping(document.activeElement)) return
    if (el && document.activeElement !== el) el.focus({ preventScroll: false })
  }, [index, enabled])

  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (performance.now() < armedAt.current) return
      if (isTyping(e.target)) return
      const s = state.current
      if (coveredByModal(items.current[s.index] ?? null)) return
      const horiz = s.orientation !== 'vertical'
      const vert = s.orientation !== 'horizontal'
      const cols = s.orientation === 'grid' ? Math.max(1, s.columns) : 1
      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          if (!horiz) return
          move(-1)
          break
        case 'ArrowRight':
        case 'd':
        case 'D':
          if (!horiz) return
          move(1)
          break
        case 'ArrowUp':
        case 'w':
        case 'W':
          if (!vert) {
            if (!s.onVertical) return
            s.onVertical(-1)
            break
          }
          move(s.orientation === 'grid' ? -cols : -1)
          break
        case 'ArrowDown':
        case 's':
        case 'S':
          if (!vert) {
            if (!s.onVertical) return
            s.onVertical(1)
            break
          }
          move(s.orientation === 'grid' ? cols : 1)
          break
        case 'Enter':
        case ' ':
        case 'Spacebar':
          // A focused control that is not part of the menu answers its own
          // Enter. Without this the window listener would confirm the
          // highlighted item as well, so pressing Enter on the title screen's
          // lantern would light it *and* set sail.
          if ((document.activeElement as HTMLElement | null)?.closest('[data-menu-outsider]')) return
          s.onConfirm(s.index)
          break
        case 'Escape':
        case 'Backspace':
          s.onBack?.()
          break
        case 'Shift':
          s.onAlt?.(s.index)
          break
        default:
          return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, move])

  // Gamepad: polled, because there is no event for a held stick.
  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !navigator.getGamepads) return
    let raf = 0
    let held: string | null = null
    let nextRepeat = 0
    const wasDown: Record<number, boolean> = {}

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const now = performance.now()
      if (now < armedAt.current) return
      if (coveredByModal(items.current[state.current.index] ?? null)) return
      const pads = navigator.getGamepads?.() ?? []
      const pad = Array.from(pads).find((p) => p && p.connected)
      if (!pad) return
      const s = state.current
      const cols = s.orientation === 'grid' ? Math.max(1, s.columns) : 1

      const ax = pad.axes[0] ?? 0
      const ay = pad.axes[1] ?? 0
      const dir =
        pad.buttons[12]?.pressed || ay < -DEADZONE
          ? 'up'
          : pad.buttons[13]?.pressed || ay > DEADZONE
            ? 'down'
            : pad.buttons[14]?.pressed || ax < -DEADZONE
              ? 'left'
              : pad.buttons[15]?.pressed || ax > DEADZONE
                ? 'right'
                : null

      if (dir !== held) {
        held = dir
        nextRepeat = now + REPEAT_DELAY
        if (dir) applyDir(dir, cols)
      } else if (dir && now >= nextRepeat) {
        nextRepeat = now + REPEAT_RATE
        applyDir(dir, cols)
      }

      const edge = (i: number) => {
        const down = !!pad.buttons[i]?.pressed
        const fired = down && !wasDown[i]
        wasDown[i] = down
        return fired
      }
      if (edge(0) || edge(9)) s.onConfirm(s.index)
      if (edge(1) || edge(8)) s.onBack?.()
      if (edge(2)) s.onAlt?.(s.index)
    }

    const applyDir = (dir: string, cols: number) => {
      const s = state.current
      const horiz = s.orientation !== 'vertical'
      const vert = s.orientation !== 'horizontal'
      if (dir === 'left' && horiz) move(-1)
      else if (dir === 'right' && horiz) move(1)
      // Up and down either walk the list or hand over to the caller, which is
      // how the chart hops whole islands. Written out rather than as a ternary
      // evaluated for its side effects: both branches *do* something, and a
      // ternary reads as if one of them returns a value.
      else if (dir === 'up') {
        if (vert) move(s.orientation === 'grid' ? -cols : -1)
        else s.onVertical?.(-1)
      } else if (dir === 'down') {
        if (vert) move(s.orientation === 'grid' ? cols : 1)
        else s.onVertical?.(1)
      }
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [enabled, move])

  /** Ref callback for item `i`, so focus can follow the selection. */
  const itemRef = useCallback(
    (i: number) => (el: HTMLElement | null) => {
      items.current[i] = el
    },
    [],
  )

  return { itemRef }
}
