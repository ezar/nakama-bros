import type { CrewId, CrewStats, PowerTier } from '../types'
import { PAL } from '../art/palette'
import { TILE } from '../types'

/**
 * Movement tuning.
 *
 * These numbers are the game. They were chosen so that a tap of jump clears one
 * tile, a full hold clears four, and the run-up to top speed takes about a third
 * of a second — close enough to the platformer canon to feel immediately
 * familiar, loose enough to feel like rubber.
 */
export const PHYS = {
  /** Downward acceleration, px/s^2. */
  gravity: 1150,
  /** Gravity multiplier while rising with jump held — the floaty apex. */
  jumpHoldGravity: 0.52,
  /** Gravity multiplier while falling — heavier, so landings read as weight. */
  fallGravity: 1.32,
  maxFall: 460,
  /** Ground acceleration and deceleration, px/s^2. */
  accel: 1250,
  decel: 1650,
  /** Turning around is faster than stopping — that snap is the skid. */
  turnAccel: 2400,
  /** Air control is a fraction of ground control. */
  airAccelScale: 0.68,
  airDecelScale: 0.34,
  /** Seconds after leaving a ledge during which a jump still works. */
  coyoteTime: 0.1,
  /** Seconds a jump press is remembered before landing. */
  jumpBuffer: 0.12,
  /** Speed below which the run animation drops back to idle. */
  idleSpeed: 12,
  /** Speed above which turning plays the skid animation. */
  skidSpeed: 90,
  /** Upward velocity kept when the player releases jump early. */
  jumpCutScale: 0.42,
  /** Bounce given by stomping an enemy. */
  stompBounce: 300,
  /** Higher bounce when jump is held during the stomp. */
  stompBounceHeld: 400,
  /** Water. */
  waterGravity: 0.28,
  waterDrag: 0.86,
  waterSwimImpulse: 190,
  waterMaxUp: 150,
  waterMaxFall: 120,
  /** Climbing. */
  climbSpeed: 90,
  /** Seconds of invulnerability after taking a hit. */
  hurtInvuln: 1.6,
  /** Knockback applied on hurt. */
  hurtKnockX: 150,
  hurtKnockY: -230,
} as const

/** Per-tier multipliers layered on top of the crew's base stats. */
export const TIER_MODS: Record<PowerTier, {
  speed: number
  jump: number
  scale: number
  /** Extra hits absorbed before dropping a tier. */
  armor: number
  aura: string | null
}> = {
  base: { speed: 1, jump: 1, scale: 1, armor: 0, aura: null },
  gear2: { speed: 1.34, jump: 1.06, scale: 1, armor: 0, aura: PAL.bloodOrange },
  gear3: { speed: 0.92, jump: 1.18, scale: 1.55, armor: 1, aura: PAL.magic },
  gear4: { speed: 1.18, jump: 1.34, scale: 1.12, armor: 1, aura: PAL.poison },
}

export const TIER_ORDER: PowerTier[] = ['base', 'gear2', 'gear3', 'gear4']

/**
 * The crew. Each one trades speed against jump against a signature move, so
 * picking a character changes how a level is solved, not just how it looks.
 */
export const CREW: Record<CrewId, CrewStats> = {
  luffy: {
    id: 'luffy', name: 'Luffy', runSpeed: 168, jumpTiles: 3.7, airJumps: 0,
    attackTime: 0.26, accent: PAL.luffyRed,
  },
  zoro: {
    id: 'zoro', name: 'Zoro', runSpeed: 152, jumpTiles: 3.3, airJumps: 0,
    attackTime: 0.22, accent: PAL.zoroGreen,
  },
  nami: {
    id: 'nami', name: 'Nami', runSpeed: 176, jumpTiles: 3.5, airJumps: 0,
    attackTime: 0.3, accent: PAL.namiOrange,
  },
  sanji: {
    id: 'sanji', name: 'Sanji', runSpeed: 162, jumpTiles: 3.4, airJumps: 1,
    attackTime: 0.2, accent: '#E8C86A',
  },
  usopp: {
    id: 'usopp', name: 'Usopp', runSpeed: 146, jumpTiles: 3.2, airJumps: 0,
    attackTime: 0.34, accent: PAL.usoppBrown,
  },
  chopper: {
    id: 'chopper', name: 'Chopper', runSpeed: 158, jumpTiles: 3.9, airJumps: 0,
    attackTime: 0.24, accent: PAL.chopperPink,
  },
}

export const CREW_IDS: CrewId[] = ['luffy', 'zoro', 'nami', 'sanji', 'usopp', 'chopper']

/**
 * Initial jump velocity for a desired peak height, derived from the hold-phase
 * gravity so the tuning stays honest when gravity changes.
 */
export function jumpVelocityFor(tiles: number): number {
  const h = tiles * TILE
  return Math.sqrt(2 * PHYS.gravity * PHYS.jumpHoldGravity * h)
}

export const SCORE = {
  berry: 100,
  enemy: 200,
  /** Multiplier for each enemy defeated without touching the ground. */
  chain: [1, 2, 4, 8, 16, 32],
  fragment: 2000,
  timeBonus: 50,
  clear: 1000,
} as const

/** Berries needed for an extra life. */
export const BERRIES_PER_LIFE = 100
