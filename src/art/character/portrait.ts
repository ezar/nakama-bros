import type { CrewId } from '../../types'
import { adjust, mix, rgba } from '../color'
import {
  blob, createSurface, radialFill, roundRectPath, silhouetteOutline, type Pt,
} from '../ink'
import { PAL } from '../palette'
import { drawFigure } from './figure'
import { CREW_SCALE, LOOKS } from './looks'
import { CX, GROUND_Y, SEG, pose, solve } from './rig'

/**
 * Crew-select busts.
 *
 * The sprite sheet has to read at 36 units on a moving background; a portrait
 * has 96 to itself and stands still, so it is framed the way a fighting game
 * frames its roster: head large, shoulders cut by the border, a lit backdrop in
 * the character's own colour so six cards read as six people before any of the
 * faces do.
 */

const PORTRAIT_SIZE = 96

export function buildPortrait(id: CrewId, size = PORTRAIT_SIZE): HTMLCanvasElement {
  const look = LOOKS[id]
  const cs = CREW_SCALE[id]

  const p = pose({
    lean: 0.05,
    hipY: -0.4,
    headTurn: look.portrait.turn,
    headTilt: look.portrait.tilt,
    expression: look.portrait.expression,
    armFront: [0.42, 0.5],
    armBack: [-0.46, 0.42],
    roll: 0.35,
    drag: 0.5,
    flutter: 0.2,
  })

  // Frame on the head, and normalise across the cast: Chopper is drawn at three
  // quarters scale in game, but his card must not be three quarters of a card.
  const sk = solve(p)
  const headX = CX + (sk.head[0] - CX) * cs
  const headY = GROUND_Y + (sk.head[1] - GROUND_Y) * cs
  const k = (size * 0.153) / (SEG.headR * cs)
  const tx = size * 0.5 - k * headX
  const ty = size * 0.375 - k * headY

  const fig = createSurface(size, size)
  fig.ctx.save()
  fig.ctx.translate(tx, ty)
  fig.ctx.scale(k, k)
  drawFigure(fig.ctx, look, p, cs)
  fig.ctx.restore()
  silhouetteOutline(fig, '#181226', size * 0.022)

  const out = createSurface(size, size)
  const ctx = out.ctx
  const card = roundRectPath(0, 0, size, size, size * 0.075)
  ctx.save()
  ctx.clip(card)

  // Backdrop: the character's colour, lit from the same upper left as the art.
  const g = ctx.createLinearGradient(0, 0, size * 0.4, size)
  g.addColorStop(0, adjust(look.banner, { light: 1.3, sat: 0.72 }))
  g.addColorStop(0.55, mix(look.banner, PAL.night, 0.42))
  g.addColorStop(1, mix(look.banner, PAL.night, 0.82))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)

  // Three diagonal bands. They give the card a direction without competing with
  // the face, and they are deliberately uneven so the set does not read tiled.
  ctx.globalAlpha = 0.1
  ctx.fillStyle = PAL.white
  for (const [x, w] of [[-0.3, 0.26], [0.18, 0.1], [0.62, 0.17]] as Array<[number, number]>) {
    ctx.fill(blob([
      [size * x, -2],
      [size * (x + w), -2],
      [size * (x + w - 0.36), size + 2],
      [size * (x - 0.36), size + 2],
    ] as Pt[], 0.01))
  }
  ctx.globalAlpha = 1

  radialFill(ctx, size * 0.5, size * 0.36, 0, size * 0.46, [
    [0, rgba(adjust(look.banner, { light: 1.5 }), 0.5)],
    [0.55, rgba(look.banner, 0.16)],
    [1, rgba(look.banner, 0)],
  ])

  ctx.drawImage(fig.canvas, 0, 0, size, size)

  // A scrim along the bottom so a name plate drawn over the card stays legible.
  const scrim = ctx.createLinearGradient(0, size * 0.68, 0, size)
  scrim.addColorStop(0, rgba(PAL.ink, 0))
  scrim.addColorStop(1, rgba(PAL.ink, 0.78))
  ctx.fillStyle = scrim
  ctx.fillRect(0, size * 0.68, size, size * 0.32)

  // Vignette, then an inner keyline: the card needs an edge or it floats.
  radialFill(ctx, size * 0.5, size * 0.5, size * 0.42, size * 0.82, [
    [0, rgba(PAL.night, 0)],
    [1, rgba(PAL.night, 0.5)],
  ])
  ctx.restore()

  ctx.save()
  ctx.strokeStyle = rgba(PAL.cream, 0.32)
  ctx.lineWidth = size * 0.012
  ctx.stroke(roundRectPath(size * 0.02, size * 0.02, size * 0.96, size * 0.96, size * 0.06))
  ctx.restore()

  return out.canvas
}
