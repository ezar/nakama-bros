import { motion as m } from 'framer-motion'
import { useT } from '../i18n/useT'
import { useShortViewport } from './hooks/useShortViewport'
import { useUiMotion } from './hooks/useUiMotion'
import { Paper } from './art/Paper'
import { UI } from './theme'

/**
 * A new build is on the ship, waiting to be let in.
 *
 * A card in the bottom corner rather than a dialog in the middle, and that is
 * the whole design: nobody opened this game to install anything. It has to be
 * possible to read it and carry on, so it takes a corner, never focus, and it
 * does not cover a single thing the player might have been about to press.
 *
 * The corner is earned rather than chosen. The title puts its buttons down the
 * middle and its key hints on the last line, so the bottom centre — the obvious
 * place for a toast — is the one strip that is never free. Off to the right, it
 * overlaps nothing, at a desktop size or at either landscape phone size.
 *
 * That measuring is also why only the title screen shows this at all. The chart
 * and the race lobby end in a row of actions that reaches the bottom edge, and
 * a corner card lands on it; move the card to the top and it lands on the
 * title's lamp instead. No one position survives five layouts, and a card that
 * moved per screen would be a card that appears somewhere new each time. The
 * title is the screen every route home passes through, so waiting for it costs
 * a player nothing.
 *
 * No version number. The page knows which build it is running and nothing at
 * all about the one waiting — the only honest thing it can say is that there is
 * one.
 */
export function UpdateNotice({ onApply, onDismiss }: { onApply: () => void; onDismiss: () => void }) {
  const t = useT()
  const motion = useUiMotion()
  // A phone held sideways is under 400px tall, and the menu column already
  // reaches the bottom of it. At that size the reassuring second line is the
  // difference between a card in the corner and a card over the buttons, so it
  // goes — the offer is the title and the button, and those stay.
  const short = useShortViewport()

  return (
    <m.div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 sm:justify-end"
      /*
        On a tall screen it clears the key-hint line the title ends with. On a
        short one it sits on that line instead, because above it is the last
        menu button and there is no room between the two. Covering a line of
        static help text while an offer is up costs nothing; covering a button
        the player is reaching for costs them the tap.
      */
      style={{ paddingBottom: `calc(${short ? '0.25rem' : '3rem'} + env(safe-area-inset-bottom))` }}
      initial={motion ? { opacity: 0, y: 24 } : false}
      animate={{ opacity: 1, y: 0 }}
      exit={motion ? { opacity: 0, y: 24 } : undefined}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      role="status"
    >
      <Paper
        className={`pointer-events-auto flex items-center ${short ? 'w-auto gap-2 px-3 py-1.5' : 'w-full max-w-md gap-3 px-4 py-2.5'}`}
        seed={71}
        edges="sides"
        bite={1.1}
        age={0.4}
      >
        <div className="min-w-0 flex-1">
          <p
            className={`font-display leading-tight ${short ? 'text-xs' : 'text-sm'}`}
            style={{ color: UI.ink }}
          >
            {t('update.title')}
          </p>
          {!short && (
            <p className="font-body text-[11px] leading-snug" style={{ color: UI.inkSoft }}>
              {t('update.body')}
            </p>
          )}
        </div>
        <button
          className={`op-button op-button--primary shrink-0 ${short ? 'px-3 py-1.5 text-[11px]' : 'px-4 py-2 text-xs'}`}
          onClick={onApply}
        >
          {t('update.apply')}
        </button>
        {/*
          Spelled out where there is room, and a cross where there is not. On a
          phone in landscape the menu column runs the full height of the screen,
          so every character this card does not need is a character it stops
          covering — and "not now" is the one thing a cross says unambiguously.
        */}
        <button
          className={
            short
              ? 'shrink-0 px-1 font-body text-base leading-none'
              : 'shrink-0 font-body text-[11px] underline underline-offset-2'
          }
          style={{ color: UI.inkSoft }}
          aria-label={t('update.later')}
          onClick={onDismiss}
        >
          {short ? '\u00D7' : t('update.later')}
        </button>
      </Paper>
    </m.div>
  )
}
