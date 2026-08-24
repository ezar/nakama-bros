import type { CrewId, LevelResult } from '../types'

/**
 * Shared design tokens for the shell.
 *
 * Tailwind covers class-based colour, but SVG attributes and canvas-adjacent
 * code need the literal values, and both have to agree — so both read from
 * here. The palette is a pirate's desk: sun-aged paper, oiled oak, tarnished
 * brass, sealing wax, and gold as the single accent that means "this matters".
 */
export const UI = {
  paper: '#EFE0BE',
  paperLit: '#F7EDD3',
  paperDim: '#DCC59A',
  paperDeep: '#C0A277',
  ink: '#2A1D14',
  inkSoft: '#6A5340',
  oakDark: '#251610',
  oak: '#43291A',
  oakLit: '#6B4527',
  brass: '#C8973F',
  brassLit: '#F1D386',
  brassDark: '#7C5A21',
  gold: '#F4C542',
  wax: '#8E2B22',
  waxLit: '#C0463A',
  rope: '#C9A566',
  ropeDark: '#8A6B39',
  skyHigh: '#122A4B',
  skyMid: '#2C5B78',
  skyLow: '#8FA9A4',
  sunCore: '#FFE9AE',
  sun: '#F5B24A',
  seaFar: '#4E7E88',
  seaMid: '#255C74',
  seaNear: '#123E56',
  seaDeep: '#0A2438',
  foam: '#DCEDF0',
  night: '#050A14',
} as const

/**
 * Bounties for the crew-select posters. Invented for this project — they scale
 * with how much trouble each one is, not with any published figure.
 */
export const BOUNTY: Record<CrewId, number> = {
  luffy: 1_500_000_000,
  zoro: 320_000_000,
  nami: 66_000_000,
  sanji: 330_000_000,
  usopp: 200_000_000,
  chopper: 1_000,
  robin: 930_000_000,
  franky: 394_000_000,
  brook: 383_000_000,
  jinbe: 1_100_000_000,
}

/** Berries with the thousands separator the poster printer would have used. */
export const formatBerry = (n: number): string => n.toLocaleString('es-ES')

/**
 * A run's duration, as a time you would say out loud: 1:04.28, or 42.31s.
 *
 * Hundredths always, even under a minute: challenge times are compared against
 * each other and a tenth is often the whole margin.
 */
export function formatRunTime(seconds: number): string {
  const s = Math.max(0, seconds)
  const mins = Math.floor(s / 60)
  const rest = s - mins * 60
  return mins === 0 ? `${rest.toFixed(2)}s` : `${mins}:${rest.toFixed(2).padStart(5, '0')}`
}

export type Rank = 'S' | 'A' | 'B' | 'C'

/**
 * The stamp on the result poster. Fragments weigh most because they are the
 * only optional thing in a stage; a clean run with time to spare is the rest.
 */
export function rankFor(r: LevelResult): Rank {
  let pts = r.fragments * 2
  if (r.deaths === 0) pts += 2
  else if (r.deaths <= 2) pts += 1
  if (r.timeLeft > 90) pts += 2
  else if (r.timeLeft > 40) pts += 1
  if (pts >= 9) return 'S'
  if (pts >= 6) return 'A'
  if (pts >= 3) return 'B'
  return 'C'
}

export const RANK_COLOR: Record<Rank, string> = {
  S: UI.gold,
  A: UI.waxLit,
  B: '#3F7C6A',
  C: UI.inkSoft,
}

/**
 * Deterministic small angle per index, so a row of pinned posters looks hung by
 * hand instead of laid out by a grid — and looks the same on every render.
 */
export const tilt = (i: number, amount = 3.2): number => {
  const h = Math.sin(i * 12.9898 + 1.7) * 43758.5453
  return (h - Math.floor(h)) * amount * 2 - amount
}
