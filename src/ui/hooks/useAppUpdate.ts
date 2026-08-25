import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Noticing that a new build is waiting, and letting the player take it.
 *
 * The worker in `public/sw.js` deliberately never calls `skipWaiting()` on its
 * own: swapping the bundle under a game in progress is worse than running
 * yesterday's build for one more session. That decision is right, and it has a
 * cost — a phone that keeps the app on its home screen never gets a cold start,
 * so "the next launch" can be a fortnight away and the player has no way to
 * know they are a version behind. This is the missing half: the game finds out,
 * says so, and the choice of when stays with the player.
 */

/** What a waiting worker is told when the player asks for it. */
export const UPDATE_NOW = 'nakama:update-now'

/** How often a session that never closes goes back and asks. */
const POLL_MS = 30 * 60 * 1000

/**
 * If taking over goes quiet, reload anyway after this long.
 *
 * Safe because a reload is not the only route to the new build: navigation is
 * network-first, so a fresh page brings the new HTML, and the hashed bundle it
 * names is fetched rather than found in the cache. The worker swap is the tidy
 * path, not the only one.
 */
const HANDOVER_MS = 3000

/**
 * When the game is allowed to bring it up.
 *
 * `controlled` is the one that is easy to get wrong. On a first-ever visit the
 * new worker passes through `installed` on its way to activating, exactly like
 * an update does — so state alone would greet a first-time player with "there
 * is a new version" about the version they are already running. The page that
 * registered that worker was loaded before any worker existed and so has no
 * controller, and that is what tells the two apart.
 */
export function offerable(o: {
  waiting: boolean
  controlled: boolean
  dismissed: boolean
  hold: boolean
}): boolean {
  return o.waiting && o.controlled && !o.dismissed && !o.hold
}

export interface AppUpdate {
  /** A newer build is installed, waiting, and this is a good moment to say so. */
  ready: boolean
  /** Hand over to the waiting build and reload into it. */
  apply: () => void
  /** Not now. Stays quiet for the rest of this session. */
  dismiss: () => void
}

/**
 * @param hold This is not the moment to ask. The build keeps waiting either
 * way — the offer comes back as soon as the caller stops holding it.
 */
export function useAppUpdate(hold: boolean): AppUpdate {
  const [waiting, setWaiting] = useState(false)
  const [controlled, setControlled] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const reg = useRef<ServiceWorkerRegistration | null>(null)

  useEffect(() => {
    // Development has no worker at all, and `ready` there is a promise that
    // never settles rather than one that rejects.
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
    let live = true

    const watch = (w: ServiceWorker | null): void => {
      if (!w) return
      const check = (): void => {
        if (!live || w.state !== 'installed') return
        setWaiting(true)
        setControlled(navigator.serviceWorker.controller != null)
      }
      check()
      w.addEventListener('statechange', check)
    }

    // Asking is cheap — one conditional request for a file of a few kilobytes —
    // and it is the only thing that finds an update for a session that has been
    // open since Tuesday. On resume first, because that is when a phone that
    // has been in a pocket comes back.
    const ask = (): void => { void reg.current?.update().catch(() => undefined) }
    const onVisible = (): void => { if (document.visibilityState === 'visible') ask() }
    const timer = window.setInterval(ask, POLL_MS)
    document.addEventListener('visibilitychange', onVisible)

    void navigator.serviceWorker.ready.then((r) => {
      if (!live) return
      reg.current = r
      // One may already be waiting from a previous session — installed while
      // the player was in a level, and still holding the door.
      watch(r.waiting)
      r.addEventListener('updatefound', () => watch(r.installing))
      ask()
    }).catch(() => undefined)

    return () => {
      live = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const apply = useCallback(() => {
    const w = reg.current?.waiting
    if (!w) return window.location.reload()
    let done = false
    const go = (): void => {
      if (done) return
      done = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', go, { once: true })
    window.setTimeout(go, HANDOVER_MS)
    w.postMessage({ type: UPDATE_NOW })
  }, [])

  const dismiss = useCallback(() => setDismissed(true), [])

  return { ready: offerable({ waiting, controlled, dismissed, hold }), apply, dismiss }
}
