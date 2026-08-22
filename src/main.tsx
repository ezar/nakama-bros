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
 * does. Two frames of grace let React actually put the shell on screen, and a
 * short floor keeps the card from blinking past on a warm cache — it should
 * read as an opening title, not as a glitch.
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
        window.setTimeout(dismiss, Math.max(0, 520 - (performance.now() - shown))),
      ),
    )
  }
}
