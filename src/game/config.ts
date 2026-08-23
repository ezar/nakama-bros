import type { CrewId, CrewStats, Difficulty, PowerTier } from '../types'
import { PAL } from '../art/palette'
import { FIXED_DT, TILE } from '../types'

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
  /** Crouch. */
  crouchHeight: 15,
  crouchSpeedScale: 0.44,
  /** Crouch-slide: entered from a run, keeps the momentum and spends it. */
  slideEnterSpeed: 0.58,
  slideBoost: 1.16,
  slideTime: 0.5,
  slideFriction: 300,
  slideJumpBoost: 1.1,
  /** Wall slide / wall jump. */
  wallSlideSpeed: 70,
  wallSlideSpeedFast: 150,
  /** Downward pull that starts a slide feeling like friction, not a stop. */
  wallSlideCatch: 0.45,
  /** Seconds a wall is remembered after letting go of it — wall coyote time. */
  wallCoyote: 0.1,
  /** Horizontal kick away from the wall. */
  wallJumpX: 205,
  /** Wall jump height in tiles. */
  wallJumpTiles: 3,
  /** Seconds the stick input is ignored after a wall jump, so it does not
   *  immediately re-stick to the wall it just left. */
  wallJumpLock: 0.16,
  /** Seconds before the same wall can be clung to again after leaving it. */
  wallReStick: 0.1,
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

/**
 * What each difficulty hands the player.
 *
 * Deliberately **nothing from `PHYS`**: speeds, gravity and jump heights are the
 * same on all three, so a jump learned on Fácil is the same jump on Difícil and
 * a child and a parent can hand each other the controller mid-stage. What
 * changes is how much rope you get — lives, clock, the mercy window after a hit
 * — and, on Fácil, that you start in gear 2, which is worth one free mistake
 * because a hit drops a tier before it kills.
 */
export const DIFFICULTY: Record<Difficulty, {
  lives: number
  /** Tier the run starts and respawns at. */
  startTier: PowerTier
  /** Multiplier on the invulnerability window after a hit. */
  invuln: number
  /** Multiplier on every level's clock. */
  time: number
}> = {
  easy: { lives: 5, startTier: 'gear2', invuln: 1.6, time: 1.5 },
  normal: { lives: 3, startTier: 'base', invuln: 1, time: 1 },
  hard: { lives: 1, startTier: 'base', invuln: 0.7, time: 0.85 },
}

export const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard']

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
  robin: {
    id: 'robin', name: 'Robin', runSpeed: 150, jumpTiles: 3.3, airJumps: 0,
    attackTime: 0.3, accent: '#7E5CA8',
  },
  franky: {
    id: 'franky', name: 'Franky', runSpeed: 140, jumpTiles: 3.1, airJumps: 0,
    attackTime: 0.36, accent: '#3AC8E0',
  },
  brook: {
    id: 'brook', name: 'Brook', runSpeed: 182, jumpTiles: 3.6, airJumps: 1,
    attackTime: 0.18, accent: '#E8E4F2',
  },
  jinbe: {
    id: 'jinbe', name: 'Jinbe', runSpeed: 144, jumpTiles: 3.2, airJumps: 0,
    attackTime: 0.32, accent: '#2E86C1',
  },
}

export const CREW_IDS: CrewId[] = [
  'luffy', 'zoro', 'nami', 'sanji', 'usopp',
  'chopper', 'robin', 'franky', 'brook', 'jinbe',
]

/**
 * Initial jump velocity for a desired peak height, derived from the hold-phase
 * gravity so the tuning stays honest when gravity changes.
 *
 * The half-step term is not a fudge: the simulation is semi-implicit Euler at a
 * fixed 60 Hz, which integrates the rise slightly short of the closed-form
 * parabola (about 2 px, an eighth of a tile — exactly the margin that decides
 * whether a four-tile jump clears a four-tile wall). Adding half a step of
 * gravity back makes the discrete peak land on the height the table promises.
 */
export function jumpVelocityFor(tiles: number): number {
  const h = tiles * TILE
  const g = PHYS.gravity * PHYS.jumpHoldGravity
  return Math.sqrt(2 * g * h) + (g * FIXED_DT) / 2
}

/** Peak height in world units of a full-hold jump for a crew member. */
export function jumpPeakFor(tiles: number): number {
  return tiles * TILE
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

// ─────────────────────────────────────────────────────────────────────────────
// Signature moves
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What the signature button does for each of the ten. The kind picks the state
 * machine in `Player`; the numbers below are what balance it.
 */
export type SignatureKind =
  | 'grab'
  | 'combo'
  | 'air-dash'
  | 'dive-kick'
  | 'shot'
  | 'roll'
  | 'bloom'
  | 'haymaker'
  | 'phase-dash'
  | 'palm'

export interface SignatureDef {
  kind: SignatureKind
  /** Shown as a floating call-out when the move fires. */
  name: string
  /** Seconds before it can be used again, counted from the end of the move. */
  cooldown: number
  /** Seconds the move owns the character. */
  duration: number
  /** Seconds of reduced control afterwards — the price of the big ones. */
  recovery: number
  /** Reach, travel or projectile range in world units. Meaning is per kind. */
  reach: number
  /** The impulse the move imparts: dash speed, pull speed or knockback. */
  power: number
  /** Seconds the thing the move leaves behind lasts, when it leaves one. */
  hold: number
  damage: number
  ground: boolean
  air: boolean
  /** Smashes Brick tiles it runs into. */
  breaksBricks: boolean
}

const sig = (o: Partial<SignatureDef> & Pick<SignatureDef, 'kind' | 'name'>): SignatureDef => ({
  cooldown: 0.7,
  duration: 0.2,
  recovery: 0.12,
  reach: 26,
  power: 240,
  hold: 0,
  damage: 1,
  ground: true,
  air: true,
  breaksBricks: false,
  ...o,
})

/**
 * The balance sheet.
 *
 * Nobody is strictly best, and the reason is that every entry pays for its
 * reach with one of four currencies: cooldown, recovery, where it may be used,
 * or the momentum it costs. Luffy reaches furthest but is locked mid-flight;
 * Zoro's chain out-damages everyone but only from standing beside the thing;
 * Nami and Brook buy distance and give up damage or safety; Franky hits
 * hardest and is open for nearly half a second afterwards; Chopper breaks
 * terrain but cannot steer; Robin makes ground out of nothing but cannot
 * fight while she does; Jinbe trades cooldown for a knockback nobody else has,
 * and doubles it in water, where the rest of the crew is worst.
 */
export const SIGNATURES: Record<CrewId, SignatureDef> = {
  // Latches a ledge and reels himself in, or latches an enemy and reels it to
  // him. The longest reach in the game, and the only one that can rescue a
  // botched jump — paid for with a long lockout mid-flight.
  luffy: sig({
    kind: 'grab', name: 'Gomu Gomu', cooldown: 0.85, duration: 0.13,
    recovery: 0.14, reach: 78, power: 355, damage: 1,
  }),
  // Three hits on rhythm: two quick, then a wide spin worth double. Mistime
  // the rhythm and the chain resets to one.
  zoro: sig({
    kind: 'combo', name: 'Santoryu', cooldown: 0.42, duration: 0.17,
    recovery: 0.16, reach: 27, power: 150, damage: 1,
  }),
  // Pure traversal: a flat air dash, no damage, once per airtime.
  nami: sig({
    kind: 'air-dash', name: 'Espejismo', cooldown: 0.7, duration: 0.17,
    recovery: 0.05, reach: 0, power: 330, damage: 0, ground: false,
  }),
  // Drops like a hammer and rebounds off whatever it lands on. Whiffing it
  // means eating the landing.
  sanji: sig({
    kind: 'dive-kick', name: 'Concassé', cooldown: 0.3, duration: 0.55,
    recovery: 0.14, reach: 15, power: 445, damage: 1, ground: false,
  }),
  // The only ranged option. Cheap, fast, and worth exactly one hit point.
  usopp: sig({
    kind: 'shot', name: 'Kabuto', cooldown: 0.55, duration: 0.16,
    recovery: 0.08, reach: 200, power: 305, damage: 1,
  }),
  // A committed roll: fast, low, breaks bricks, and cannot turn.
  chopper: sig({
    kind: 'roll', name: 'Heavy Point', cooldown: 0.9, duration: 0.52,
    recovery: 0.2, reach: 0, power: 262, damage: 1, air: false, breaksBricks: true,
  }),
  // A step of ground where there is none. Two seconds, one at a time.
  // The move itself is over in a blink; what it leaves behind lasts two
  // seconds. Those are different clocks, and conflating them would leave her
  // unable to jump for as long as the step exists.
  robin: sig({
    kind: 'bloom', name: 'Mil Fleurs', cooldown: 1.35, duration: 0.18,
    recovery: 0.06, reach: 28, power: 0, hold: 2, damage: 0, ground: false,
  }),
  // The heaviest single hit, and the longest time spent regretting it.
  franky: sig({
    kind: 'haymaker', name: 'Coup de Vent', cooldown: 1.05, duration: 0.36,
    recovery: 0.44, reach: 33, power: 280, damage: 2, air: false, breaksBricks: true,
  }),
  // Passes through what he hits. Short invulnerability, no vertical gain.
  brook: sig({
    kind: 'phase-dash', name: 'Aubade', cooldown: 0.72, duration: 0.21,
    recovery: 0.1, reach: 0, power: 348, damage: 1,
  }),
  // Sends things a long way. In water the reach and the shove both grow.
  jinbe: sig({
    kind: 'palm', name: 'Karate Gyojin', cooldown: 0.78, duration: 0.25,
    recovery: 0.22, reach: 29, power: 430, damage: 1,
  }),
}

/**
 * How well each of them handles water. The sea is the one place the running
 * order is allowed to invert: the fastest on land are the worst in it.
 */
export const WATER_AGILITY: Record<CrewId, number> = {
  luffy: 0.72,
  zoro: 0.95,
  nami: 1.12,
  sanji: 1,
  usopp: 0.95,
  chopper: 0.85,
  robin: 1,
  franky: 0.8,
  brook: 0.9,
  jinbe: 1.55,
}

// ─────────────────────────────────────────────────────────────────────────────
// Feel primitives
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The two forgiveness clocks, kept in one place so they cannot drift apart —
 * and so the promised numbers can be tested without a Player, a canvas or a DOM.
 *
 * Both are measured as *elapsed time*, not as countdowns: the contract in
 * SPEC.md is "100 ms of coyote time", which must mean a jump at exactly 100 ms
 * is still allowed and one a millisecond later is not.
 */
export interface JumpMemory {
  /** Seconds since the feet left the ground. 0 while grounded. */
  airTime: number
  /** Seconds since jump was last pressed. Infinity once the press is spent. */
  sincePress: number
}

export const newJumpMemory = (): JumpMemory => ({ airTime: 0, sincePress: Infinity })

/** Advance both clocks by one fixed step. */
export function tickJumpMemory(
  m: JumpMemory,
  dt: number,
  grounded: boolean,
  pressed: boolean,
): void {
  m.airTime = grounded ? 0 : m.airTime + dt
  m.sincePress = pressed ? 0 : m.sincePress + dt
}

/** Float slack, so an exact multiple of the fixed step never falls off by 1 ulp. */
const TIME_EPS = 1e-9

/** Is the ledge still close enough behind to jump from it? */
export const coyoteOk = (m: JumpMemory): boolean => m.airTime <= PHYS.coyoteTime + TIME_EPS

/** Is there a remembered press waiting to be spent? */
export const bufferOk = (m: JumpMemory): boolean => m.sincePress <= PHYS.jumpBuffer + TIME_EPS

export const canJump = (m: JumpMemory): boolean => coyoteOk(m) && bufferOk(m)

/** Spend the press and the ledge. */
export function consumeJump(m: JumpMemory): void {
  m.airTime = Infinity
  m.sincePress = Infinity
}

/**
 * One step of vertical integration for an airborne body: light gravity while
 * rising with the button held, heavy gravity otherwise, clamped to terminal
 * velocity. Semi-implicit Euler — velocity first, then position.
 */
export function stepJumpGravity(
  vy: number,
  dt: number,
  holdingJump: boolean,
  gravityScale = 1,
): number {
  const g =
    PHYS.gravity * gravityScale *
    (vy < 0 && holdingJump ? PHYS.jumpHoldGravity : PHYS.fallGravity)
  return Math.min(vy + g * dt, PHYS.maxFall)
}

/** What is left of the rise when the button is released early. */
export const cutJump = (vy: number): number => (vy < 0 ? vy * PHYS.jumpCutScale : vy)
