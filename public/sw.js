/**
 * Nakama Bros, offline.
 *
 * The whole point of the icons and the startup images is that this ends up on
 * a home screen and opens like an app. Without a worker it only *looks* like
 * one: every launch needs the network, and on a bad connection — a car, a
 * playground, a hotel — you get nothing. The game itself has no server and no
 * assets to speak of; the art is drawn by the bundle at boot. So once the
 * bundle is on the device there is genuinely nothing left to wait for.
 *
 * Deliberately hand-written rather than generated. It is about eighty lines,
 * every rule in it is a decision about this game, and a build plugin would put
 * a dependency between a five-year-old and their save file.
 */

const VERSION = 'v1'
const SHELL = `nakama-bros-shell-${VERSION}`
const FONTS = `nakama-bros-fonts-${VERSION}`
const MINE = (name) => name.startsWith('nakama-bros-')

/** Small, unhashed, and needed before the bundle can draw anything. */
const STATIC = ['./', './manifest.webmanifest', './favicon.svg', './drawings/luffy.jpg']

/** How long to wait for a fresh page before serving the stored one. */
const NAVIGATION_TIMEOUT = 3000

/**
 * How long install will spend on the typefaces before giving up on them.
 *
 * Nothing optional may hold up activation. The first version of this waited on
 * Google's font CDN with no bound, and behind a network that could not reach it
 * the worker simply never activated — so the game had no offline mode at all,
 * because of the one part of it that was only ever cosmetic.
 */
const FONT_TIMEOUT = 5000

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))])

/**
 * The bundle's own file names carry a content hash, so they cannot be listed
 * here — they change on every deploy. They are read out of the page instead,
 * which is the one place that always knows the current set.
 */
async function shellAssets() {
  try {
    const res = await fetch('./', { cache: 'reload' })
    const html = await res.text()
    return {
      assets: [...html.matchAll(/(?:src|href)="([^"]*assets\/[^"]+)"/g)].map((m) => m[1]),
      fontCss: html.match(/href="(https:\/\/fonts\.googleapis\.com\/css2[^"]+)"/)?.[1] ?? null,
    }
  } catch {
    return { assets: [], fontCss: null }
  }
}

/**
 * The two typefaces, fetched up front.
 *
 * Waiting for the page to ask would work from the second visit onwards, but
 * the first visit loads them before this worker is in charge, so the first
 * offline launch would fall back to Georgia. The stylesheet names the actual
 * font files inside itself, which is why it has to be read rather than listed.
 */
async function cacheFonts(href) {
  if (!href) return
  try {
    const cache = await caches.open(FONTS)
    const css = await fetch(href)
    if (!css.ok) return
    const text = await css.clone().text()
    await cache.put(href, css)
    const files = [...text.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1])
    await Promise.all(files.map((u) => cache.add(u).catch(() => {})))
  } catch {
    // Offline typography is a nicety; the stacks in the CSS cover it.
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL)
      const { assets, fontCss } = await shellAssets()
      // One at a time, and failures forgiven: `addAll` is all-or-nothing, and
      // a single 404 on an optional file would leave the player with no
      // offline game at all rather than a slightly incomplete one.
      await Promise.all([
        ...[...STATIC, ...assets].map((u) =>
          cache.add(new Request(u, { cache: 'reload' })).catch(() => {}),
        ),
        withTimeout(cacheFonts(fontCss), FONT_TIMEOUT),
      ])
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names.filter((n) => MINE(n) && n !== SHELL && n !== FONTS).map((n) => caches.delete(n)),
      )
      await self.clients.claim()
    })(),
  )
})

/**
 * Drop cached bundles the page no longer asks for.
 *
 * Asset names carry a content hash, so a deploy never overwrites an entry — it
 * adds one. Without this, every build a device ever saw would sit in its cache
 * for good, and the one thing worse than a game that needs the network is a
 * game that quietly eats the phone's storage.
 *
 * Safe to run while a page is open: whatever is already running has its code
 * in memory, and this only removes entries nothing will request again.
 */
async function pruneAssets(cache, html) {
  const live = new Set(
    [...html.matchAll(/(?:src|href)="([^"]*assets\/[^"]+)"/g)].map((m) => new URL(m[1], self.location.href).pathname),
  )
  if (live.size === 0) return
  for (const req of await cache.keys()) {
    const { pathname } = new URL(req.url)
    if (pathname.includes('/assets/') && !live.has(pathname)) await cache.delete(req)
  }
}

/** Network, but never for longer than it takes to give up and use the copy. */
async function navigate(request) {
  const cache = await caches.open(SHELL)
  try {
    const fresh = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), NAVIGATION_TIMEOUT)),
    ])
    if (fresh && fresh.ok) {
      const copy = fresh.clone()
      cache.put('./', fresh.clone())
      // Deliberately not awaited: the player is waiting on this response, and
      // the housekeeping is not.
      void copy.text().then((html) => pruneAssets(cache, html)).catch(() => {})
    }
    return fresh
  } catch {
    return (await cache.match('./')) ?? Response.error()
  }
}

/** Content-hashed: if the name matches, the bytes match. Never re-check. */
async function hashed(request) {
  const cache = await caches.open(SHELL)
  const hit = await cache.match(request)
  if (hit) return hit
  const fresh = await fetch(request)
  if (fresh.ok) cache.put(request, fresh.clone())
  return fresh
}

/** Serve what we have and quietly fetch a newer one for next time. */
async function revalidating(request, cacheName) {
  const cache = await caches.open(cacheName)
  // `ignoreVary`: Google serves its font CSS with `Vary: User-Agent`, and a
  // strict match on that turns a warm cache into a miss for no benefit — the
  // worker and the page it serves are the same browser.
  const hit = await cache.match(request, { ignoreVary: true })
  const network = fetch(request)
    .then((fresh) => {
      // An opaque cross-origin response reports neither status nor body, and
      // Google's font files are exactly that. Storing them is still correct —
      // it is what makes the title readable on a plane — but `ok` is false, so
      // it cannot be the test.
      if (fresh && (fresh.ok || fresh.type === 'opaque')) cache.put(request, fresh.clone())
      return fresh
    })
    .catch(() => null)
  return hit ?? (await network) ?? Response.error()
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  const sameOrigin = url.origin === self.location.origin
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'
  if (!sameOrigin && !isFont) return

  if (request.mode === 'navigate') return event.respondWith(navigate(request))
  if (isFont) return event.respondWith(revalidating(request, FONTS))
  // The splash images and the promo art are large, the operating system asks
  // for them once, and nothing in the game reads them. Left to the network.
  if (url.pathname.includes('/icons/splash/') || url.pathname.includes('/promo/')) return
  if (url.pathname.includes('/assets/')) return event.respondWith(hashed(request))
  event.respondWith(revalidating(request, SHELL))
})
