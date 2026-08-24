/**
 * Challenges as links.
 *
 * The code from `ghostCode.ts` is the payload; this is how it travels. A link
 * is the only delivery that works on the phones this is actually played on:
 * the sender taps share and picks a chat, the receiver taps the message, and
 * the game opens with the challenge already in it. Nothing is typed, nothing
 * is uploaded, and there is no account anywhere.
 *
 * It lives in the **hash** rather than the path or the query. Two reasons, and
 * the first is fatal on its own: the game is served by GitHub Pages, which has
 * no router, so any path other than the one file that exists returns a 404
 * page. The second is that a hash is never sent to the server, which for a
 * payload this size is the difference between a request and a rejected one.
 */

/** The hash key. Short because it is repeated in front of a long payload. */
const KEY = 'r'

/**
 * Build the link that carries a challenge.
 *
 * Assembled from the origin and the base path rather than from the current
 * URL, which usually already has a hash on it by the time anybody shares
 * anything — appending to that would produce a link with two.
 */
export function challengeUrl(code: string, origin: string, base: string): string {
  const path = base.endsWith('/') ? base : `${base}/`
  return `${origin}${path}#${KEY}=${code}`
}

/**
 * Pull a challenge code out of a URL, or null.
 *
 * Deliberately looser than a hash parser: chat apps and mail clients decorate
 * links, and a code arriving with a stray parameter after it is still a code.
 * Whatever comes out is handed to `decodeChallenge`, which verifies it — so
 * being generous here costs nothing and refusing here would cost a race.
 */
export function codeFromUrl(url: string): string | null {
  const hash = url.indexOf('#')
  if (hash < 0) return null
  for (const part of url.slice(hash + 1).split('&')) {
    const eq = part.indexOf('=')
    if (eq > 0 && part.slice(0, eq).replace(/^\//, '') === KEY) return part.slice(eq + 1)
  }
  return null
}

/**
 * Take the challenge out of the address bar, so a reload does not re-offer it.
 *
 * The hash is cleared with `replaceState` rather than by assigning to
 * `location.hash`, which would push a history entry: the back button would
 * then walk the player into the challenge screen they just dismissed.
 */
export function consumeChallengeFromLocation(): string | null {
  if (typeof window === 'undefined') return null
  const code = codeFromUrl(window.location.href)
  if (code) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }
  return code
}

/**
 * Watch for a challenge arriving at a game that is already open.
 *
 * Reading the address bar once at startup is not enough, and the case it
 * misses is the ordinary one: a link opened while the game is already running
 * does not reload it. Where the game is installed to the home screen the
 * system hands the link to the running app; where it is a tab, changing only
 * the hash is a same-document navigation. Neither restarts anything, so the
 * challenge would arrive and be dropped without a word.
 *
 * `hashchange` covers the tab. Coming back to the foreground covers the
 * installed app, which may be resumed on the new address without firing
 * anything else — and costs nothing when there is no challenge waiting, which
 * is almost every time.
 */
export function watchForChallenges(onCode: (code: string) => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  const check = () => {
    const code = consumeChallengeFromLocation()
    if (code) onCode(code)
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') check()
  }
  window.addEventListener('hashchange', check)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('pageshow', onVisible)
  return () => {
    window.removeEventListener('hashchange', check)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('pageshow', onVisible)
  }
}
