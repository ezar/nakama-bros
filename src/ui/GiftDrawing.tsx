import { motion as m } from 'framer-motion'
import { UI } from './theme'
import { useT } from '../i18n/useT'
import { useUiMotion } from './hooks/useUiMotion'

/**
 * The drawing, framed.
 *
 * The one hand-made thing in a game whose every other pixel is generated at
 * runtime — see the note in CLAUDE.md. It is presented the way you would pin a
 * real drawing to a board: a little off-square, a brass surround, and the
 * artist's name under it. Shared by the result poster and the options panel so
 * the reward and the place it lives afterwards are the same object.
 */

/**
 * Who drew it. One place, so the credit never drifts between the two screens.
 *
 * Empty means unsigned: the caption is simply left off rather than rendered
 * with a placeholder standing in for a real person's name.
 */
export const ARTIST: string = 'Leyre'

const SRC = `${import.meta.env.BASE_URL}drawings/luffy.jpg`

export function GiftDrawing({
  width = 200,
  tilt = -1.6,
  className = '',
}: {
  width?: number
  /** Degrees off square. Zero for the options panel, a nudge on the poster. */
  tilt?: number
  className?: string
}) {
  const t = useT()
  const motion = useUiMotion()
  return (
    <m.figure
      className={`select-none ${className}`}
      style={{ width, transform: `rotate(${tilt}deg)` }}
      initial={motion ? { opacity: 0, scale: 0.92, rotate: tilt - 4 } : false}
      animate={motion ? { opacity: 1, scale: 1, rotate: tilt } : {}}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
    >
      <div
        className="rounded-[3px] p-[3px]"
        style={{
          background: `linear-gradient(150deg, ${UI.brassLit}, ${UI.brass} 45%, ${UI.brassDark})`,
          boxShadow: '0 6px 0 rgba(0,0,0,0.35), 0 14px 22px -10px rgba(0,0,0,0.75)',
        }}
      >
        <img
          src={SRC}
          alt={t('gift.alt')}
          width={640}
          height={480}
          className="block w-full rounded-[1px]"
          style={{ border: `1px solid ${UI.oakDark}` }}
        />
      </div>
      {ARTIST !== '' && (
        <figcaption
          className="mt-1.5 text-center font-body text-[10px] uppercase tracking-[0.18em]"
          style={{ color: UI.paperDim }}
        >
          {t('gift.by', { name: ARTIST })}
        </figcaption>
      )}
    </m.figure>
  )
}
