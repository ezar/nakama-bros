import { isTyping } from './typing'
import type { ButtonName, InputState } from '../types'
import { clamp } from './math'

const BUTTONS: ButtonName[] = ['left', 'right', 'up', 'down', 'jump', 'attack', 'dash', 'pause']

const KEYMAP: Record<string, ButtonName> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  Space: 'jump',
  KeyZ: 'jump',
  KeyK: 'jump',
  KeyX: 'attack',
  KeyJ: 'attack',
  KeyC: 'dash',
  ShiftLeft: 'dash',
  ShiftRight: 'dash',
  KeyL: 'dash',
  Escape: 'pause',
  Enter: 'pause',
}

/** Standard gamepad button indices → actions. */
const PADMAP: Record<number, ButtonName> = {
  0: 'jump',
  1: 'attack',
  2: 'attack',
  3: 'dash',
  5: 'dash',
  7: 'dash',
  9: 'pause',
  12: 'up',
  13: 'down',
  14: 'left',
  15: 'right',
}

const blank = (): Record<ButtonName, boolean> =>
  BUTTONS.reduce((acc, b) => {
    acc[b] = false
    return acc
  }, {} as Record<ButtonName, boolean>)

/**
 * Collects keyboard, gamepad and virtual (touch) input into one per-step
 * snapshot. `sample()` must be called exactly once per fixed step so that
 * `pressed` / `released` edges are never missed or double-read.
 */
export class Input {
  readonly state: InputState = {
    axisX: 0,
    axisY: 0,
    held: blank(),
    pressed: blank(),
    released: blank(),
  }

  /** Held state from the keyboard, written by event handlers between steps. */
  private keys = blank()
  /** Held state from the gamepad, rebuilt from scratch on every poll. */
  private pad = blank()
  private prev = blank()
  private virtual = blank()
  private analogX = 0
  private analogY = 0
  private detached: Array<() => void> = []

  /** True once any input has been seen — used to gate the "press start" prompt. */
  anyInputSeen = false

  attach(target: Window | HTMLElement = window): void {
    const onKeyDown = (e: Event) => {
      const ke = e as KeyboardEvent
      // Not a keystroke meant for us. The engine listens on the window, so a
      // text field anywhere in the shell sits under a handler that swallows
      // half the alphabet — and the sheet where you type your name is opened
      // from the card at the end of a lap, with the game still mounted and
      // still listening underneath it.
      if (isTyping(ke.target)) return
      const b = KEYMAP[ke.code]
      if (!b) return
      // Arrow keys and space scroll the page otherwise.
      ke.preventDefault()
      if (ke.repeat) return
      this.keys[b] = true
      this.anyInputSeen = true
    }
    const onKeyUp = (e: Event) => {
      const ke = e as KeyboardEvent
      // Deliberately *not* guarded on `isTyping`: a key can go down on the
      // canvas and come up after focus has moved into a field, and a release
      // that never arrives leaves the character running by itself.
      const b = KEYMAP[ke.code]
      if (!b) return
      if (!isTyping(ke.target)) ke.preventDefault()
      this.keys[b] = false
    }
    const onBlur = () => {
      this.keys = blank()
      this.pad = blank()
      this.virtual = blank()
    }

    target.addEventListener('keydown', onKeyDown as EventListener)
    target.addEventListener('keyup', onKeyUp as EventListener)
    // Losing the window with a key held is the classic stuck-run bug, so this
    // one is on the window rather than the target — but the target may be all
    // there is, off a browser.
    const win = typeof window === 'undefined' ? null : window
    win?.addEventListener('blur', onBlur)

    this.detached.push(() => {
      target.removeEventListener('keydown', onKeyDown as EventListener)
      target.removeEventListener('keyup', onKeyUp as EventListener)
      win?.removeEventListener('blur', onBlur)
    })
  }

  detach(): void {
    for (const fn of this.detached) fn()
    this.detached = []
  }

  /** Touch / on-screen controls push their state here. */
  setVirtual(button: ButtonName, down: boolean): void {
    this.virtual[button] = down
    if (down) this.anyInputSeen = true
  }

  clearVirtual(): void {
    this.virtual = blank()
  }

  private pollGamepads(): void {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []
    this.pad = blank()
    this.analogX = 0
    this.analogY = 0
    for (const pad of pads) {
      if (!pad) continue
      for (const [idx, button] of Object.entries(PADMAP)) {
        if (pad.buttons[Number(idx)]?.pressed) {
          this.pad[button] = true
          this.anyInputSeen = true
        }
      }
      const ax = pad.axes[0] ?? 0
      const ay = pad.axes[1] ?? 0
      if (Math.abs(ax) > 0.24) {
        this.analogX = ax
        this.anyInputSeen = true
      }
      if (Math.abs(ay) > 0.24) this.analogY = ay
    }
  }

  /** Advance the snapshot by one fixed step. */
  sample(): InputState {
    this.pollGamepads()

    const s = this.state
    for (const b of BUTTONS) {
      const held = this.keys[b] || this.pad[b] || this.virtual[b]
      s.pressed[b] = held && !this.prev[b]
      s.released[b] = !held && this.prev[b]
      s.held[b] = held
      this.prev[b] = held
    }

    const digitalX = (s.held.right ? 1 : 0) - (s.held.left ? 1 : 0)
    const digitalY = (s.held.down ? 1 : 0) - (s.held.up ? 1 : 0)
    s.axisX = clamp(digitalX !== 0 ? digitalX : this.analogX, -1, 1)
    s.axisY = clamp(digitalY !== 0 ? digitalY : this.analogY, -1, 1)
    return s
  }
}
