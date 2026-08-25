import { describe, expect, it } from 'vitest'
import { Input } from '../src/engine/input'
import { isTyping } from '../src/engine/typing'

/**
 * Keys meant for a text field must reach it.
 *
 * The game has two listeners on the window that call `preventDefault` on the
 * keys they claim — the engine's, which turns them into buttons, and the
 * menu's, which turns them into navigation. Between them they claim `a`, `c`,
 * `d`, `j`, `k`, `l`, `s`, `w`, `x`, `z`, the space bar and both shifts.
 *
 * The menu learned to stand down first and the engine did not, which was half
 * a fix and looked like a whole one: the sheet where you type your name for a
 * challenge is opened from the card at the end of a lap, and the game is still
 * mounted underneath with its listeners live. Typing "Cesar Sanchez" into it
 * on a phone left "ernhe" — measured in a browser, not imagined.
 *
 * No DOM here, so the listener is captured off a stand-in target and called
 * directly. That is the whole mechanism: what the handler does with an event
 * whose target is a field.
 */

/** Enough of a target to collect the handlers `attach` installs. */
function fakeTarget() {
  const handlers: Record<string, (e: Event) => void> = {}
  return {
    handlers,
    addEventListener: (type: string, fn: (e: Event) => void) => { handlers[type] = fn },
    removeEventListener: () => undefined,
  }
}

/** Enough of a keyboard event to be claimed, or not. */
function key(code: string, tagName: string) {
  let prevented = false
  return {
    code,
    target: { tagName, isContentEditable: false },
    preventDefault: () => { prevented = true },
    get prevented() { return prevented },
  }
}

describe('typing into a field while the game is listening', () => {
  const LETTERS = ['KeyC', 'KeyS', 'KeyA', 'Space', 'KeyZ', 'KeyW', 'KeyD', 'KeyX']

  it('lets every claimed key through to an input', () => {
    const target = fakeTarget()
    new Input().attach(target as unknown as HTMLElement)
    for (const code of LETTERS) {
      const e = key(code, 'INPUT')
      target.handlers.keydown(e as unknown as Event)
      expect(e.prevented, code).toBe(false)
    }
  })

  it('still claims them when nothing is being typed into', () => {
    const target = fakeTarget()
    new Input().attach(target as unknown as HTMLElement)
    for (const code of LETTERS) {
      const e = key(code, 'CANVAS')
      target.handlers.keydown(e as unknown as Event)
      expect(e.prevented, code).toBe(true)
    }
  })

  it('does not press the button either — a name is not a jump', () => {
    const target = fakeTarget()
    const input = new Input()
    input.attach(target as unknown as HTMLElement)
    target.handlers.keydown(key('Space', 'INPUT') as unknown as Event)
    input.sample()
    expect(input.state.held.jump).toBe(false)
  })

  /*
    Key-up is deliberately not guarded the same way: a key can go down on the
    canvas and come up after focus has moved into a field, and a release that
    never arrives leaves the character running by itself.
  */
  it('always releases, wherever the key comes up', () => {
    const target = fakeTarget()
    const input = new Input()
    input.attach(target as unknown as HTMLElement)
    target.handlers.keydown(key('KeyD', 'CANVAS') as unknown as Event)
    input.sample()
    expect(input.state.held.right).toBe(true)
    target.handlers.keyup(key('KeyD', 'INPUT') as unknown as Event)
    input.sample()
    expect(input.state.held.right).toBe(false)
  })

  it('knows the fields a name or a code goes into', () => {
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) {
      expect(isTyping({ tagName: tag } as unknown as EventTarget), tag).toBe(true)
    }
    expect(isTyping({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true)
    expect(isTyping({ tagName: 'CANVAS' } as unknown as EventTarget)).toBe(false)
    expect(isTyping(null)).toBe(false)
  })
})
