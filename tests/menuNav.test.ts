import { describe, expect, it } from 'vitest'
import { isTyping } from '../src/ui/hooks/useMenuNav'

/**
 * Which keystrokes the menu is allowed to look at.
 *
 * The menu listens on `window`, and it treats `a`, `d`, `w` and `s` as arrow
 * keys and `Backspace` as "go back" — swallowing all of them. So any text
 * field anywhere in the shell sits underneath a listener that eats a third of
 * the alphabet and cannot be deleted in. Typing "Sandwash" into the challenge
 * sheet produced "n".
 *
 * Nothing here can catch that on its own — the wiring is a real keyboard
 * against a real DOM — but the list of things that count as typing is the part
 * that will quietly go wrong when a new kind of field is added.
 */

/** Enough of an element for the check; no DOM in this test environment. */
const el = (tagName: string, isContentEditable = false) =>
  ({ tagName, isContentEditable }) as unknown as EventTarget

describe('what counts as typing', () => {
  it('recognises every field a name or a code goes into', () => {
    expect(isTyping(el('INPUT'))).toBe(true)
    expect(isTyping(el('TEXTAREA'))).toBe(true)
    expect(isTyping(el('DIV', true))).toBe(true)
  })

  it('counts a select, whose arrow keys are its own', () => {
    // The race lobby picks a stage with one. Left and right there belong to
    // the list of stages, not to the screen behind it.
    expect(isTyping(el('SELECT'))).toBe(true)
  })

  it('leaves the menu its own keys', () => {
    for (const tag of ['BUTTON', 'DIV', 'A', 'CANVAS', 'BODY']) {
      expect(isTyping(el(tag)), tag).toBe(false)
    }
  })

  it('says no rather than throwing on whatever else arrives', () => {
    // The target of a key event is not guaranteed to be an element.
    expect(isTyping(null)).toBe(false)
    expect(isTyping({} as EventTarget)).toBe(false)
    expect(isTyping(new EventTarget())).toBe(false)
  })
})
