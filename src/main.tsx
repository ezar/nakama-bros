import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

/**
 * Retire the boot card in index.html.
 *
 * It is painted by the document itself so the first frame is the game's night
 * sea instead of a white flash; nothing in the bundle can remove it, so this
 * does. Two frames of grace let React actually put the shell on screen.
 *
 * The floor is only long enough to rule out a single-frame flash. It used to
 * be twice this, to stop the card blinking past on a warm cache — but the
 * loading screen behind it now opens on the same sea, so there is nothing to
 * blink past to. Holding the card longer would only delay the game.
 */
{
  const boot = document.getElementById('boot')
  if (boot) {
    const shown = performance.now()
    const dismiss = () => {
      boot.classList.add('boot--gone')
      boot.addEventListener('transitionend', () => boot.remove(), { once: true })
      // transitionend never fires under prefers-reduced-motion, and a stuck
      // overlay would swallow every tap. Sweep it up either way.
      window.setTimeout(() => boot.remove(), 900)
    }
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        window.setTimeout(dismiss, Math.max(0, 240 - (performance.now() - shown))),
      ),
    )
  }
}

/**
 * Register the offline worker.
 *
 * Production only: in development the worker would serve a stale bundle back
 * over Vite's hot reload, which looks exactly like the edit not having saved.
 *
 * After load, never before — registration competes with the bundle for the
 * connection, and the first paint matters more than the second visit does.
 *
 * A new worker is deliberately left to wait rather than taking over: swapping
 * the bundle under a game that is mid-level is a worse outcome than running
 * yesterday's build for one more session. It takes charge on the next launch.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
    }).catch(() => {
      // No offline play, but the game runs. Not worth a word to the player.
    })
  })
}
