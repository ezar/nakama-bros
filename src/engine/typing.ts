/**
 * Is this event going into a text field?
 *
 * Every global key listener in the game has to ask. There are two of them —
 * the engine's, which turns keys into buttons, and the menu's, which turns them
 * into navigation — and both call `preventDefault` on the keys they claim.
 * Between them they claim `a`, `c`, `d`, `j`, `k`, `l`, `s`, `w`, `x`, `z`,
 * the space bar and both shifts, which is most of a Spanish name.
 *
 * This lived next to the menu for a while and the engine's listener went
 * without, which was half a fix: the sheet where you type your name is opened
 * from the card at the end of a lap, and the game is still mounted underneath
 * with its listeners live. Typing "Cesar Sanchez" there left "ernhe". It is
 * one rule about one thing, so there is one copy of it, low enough down that
 * both callers can reach it.
 *
 * A `select` counts. Its own keyboard handling is how a stage gets picked in
 * the race lobby, and the arrow keys there belong to it.
 */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.tagName !== 'string') return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true
}
