/**
 * Nakama Bros — shared type contract.
 *
 * Every subsystem (art, physics, entities, levels, audio, render, UI) compiles
 * against this file. Treat it as the module boundary: change it only when a
 * capability genuinely needs a new shape, never to work around a local problem.
 */

// ─────────────────────────────────────────────────────────────────────────────
// World constants
// ─────────────────────────────────────────────────────────────────────────────

/** Tile edge length in world units (== pixels at 1x zoom). */
export const TILE = 16

/**
 * The camera viewport, in world units. About 24 x 13.5 tiles — a close,
 * modern framing where the character reads as a character rather than a token.
 */
export const GAME_W = 384
export const GAME_H = 216

/**
 * Device pixels per world unit in the render buffer.
 *
 * The art is cel-shaded vector work, not pixel art, so the frame buffer is
 * rendered at this multiple of world units (1152 x 648) with smoothing on and
 * then scaled to the window. Sprites are rasterised at the same multiple, which
 * is what keeps curves and linework clean instead of chunky.
 */
export const RENDER_SCALE = 3

/** Sprite sheets are drawn at this multiple of world units. Matches RENDER_SCALE. */
export const ART_SCALE = 3

/** Frame buffer dimensions in device pixels. */
export const BUFFER_W = GAME_W * RENDER_SCALE
export const BUFFER_H = GAME_H * RENDER_SCALE

/** Physics runs at a locked step; rendering interpolates between steps. */
export const FIXED_DT = 1 / 60

// ─────────────────────────────────────────────────────────────────────────────
// Geometry
// ─────────────────────────────────────────────────────────────────────────────

export interface Vec2 {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export type Facing = 1 | -1

// ─────────────────────────────────────────────────────────────────────────────
// Input
// ─────────────────────────────────────────────────────────────────────────────

export type ButtonName = 'left' | 'right' | 'up' | 'down' | 'jump' | 'attack' | 'dash' | 'pause'

/** A snapshot of the control state for one fixed step. */
export interface InputState {
  /** -1..1 horizontal intent (analog-aware). */
  axisX: number
  /** -1..1 vertical intent. */
  axisY: number
  held: Record<ButtonName, boolean>
  /** True only on the step the button went down. */
  pressed: Record<ButtonName, boolean>
  /** True only on the step the button came up. */
  released: Record<ButtonName, boolean>
}

// ─────────────────────────────────────────────────────────────────────────────
// Tiles
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tile ids. 0 is always empty. Solidity is derived from `tileFlags`, never from
 * the numeric value, so new tiles can be inserted without renumbering levels.
 */
export const enum Tile {
  Empty = 0,
  Solid = 1,
  /** Collides only when falling onto its top edge. */
  OneWay = 2,
  /** Solid, breaks when hit from below by a powered player. */
  Brick = 3,
  /** Solid, dispenses an item when hit from below, then becomes Used. */
  Question = 4,
  Used = 5,
  /** Kills on contact. */
  Spike = 6,
  /** Swimmable volume — no collision, applies buoyancy + drag. */
  Water = 7,
  /** Slopes rise left→right (Up) or fall left→right (Down). */
  SlopeUp45 = 8,
  SlopeDown45 = 9,
  /** Non-colliding decorative fill drawn behind entities. */
  Decor = 10,
  /** Solid but slippery (ice / wet deck). */
  Ice = 11,
  /** Solid, bounces anything that lands on it. */
  Bouncy = 12,
  /** Solid, crumbles a beat after being stood on. */
  Crumble = 13,
  /** Ladder / rigging — climbable, non-solid. */
  Climb = 14,
}

export interface TileFlags {
  solid: boolean
  oneWay: boolean
  hazard: boolean
  liquid: boolean
  climbable: boolean
  breakable: boolean
  /** 0 = flat. 1 = rises to the right. -1 = falls to the right. */
  slope: 0 | 1 | -1
  /** Horizontal velocity retention per second. 1 = frictionless ice. */
  slipperiness: number
  bounce: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprites & animation
// ─────────────────────────────────────────────────────────────────────────────

export interface Frame {
  /** Source rect inside the sheet image, in device pixels. */
  sx: number
  sy: number
  sw: number
  sh: number
  /** Destination size in world units (sw / ART_SCALE). */
  w: number
  h: number
  /** Offset in world units from the entity origin (feet-centre) to the frame's top-left. */
  ox: number
  oy: number
  /** Frame duration in seconds. */
  dur: number
}

export interface Anim {
  name: string
  frames: Frame[]
  loop: boolean
}

export interface SpriteSheet {
  image: CanvasImageSource
  width: number
  height: number
  anims: Record<string, Anim>
}

/** Plays one animation of one sheet, tracking time and finish state. */
export interface AnimPlayer {
  sheet: SpriteSheet
  current: string
  time: number
  finished: boolean
  play(name: string, restart?: boolean): void
  update(dt: number): void
  frame(): Frame
}

// ─────────────────────────────────────────────────────────────────────────────
// Entities
// ─────────────────────────────────────────────────────────────────────────────

export type EntityKind =
  | 'player'
  | 'enemy'
  | 'boss'
  | 'item'
  | 'projectile'
  | 'platform'
  | 'decor'
  | 'trigger'
  | 'fx'

/** A dynamic AABB body. Origin (x, y) is the bottom-centre of the hitbox. */
export interface PhysicsBody {
  x: number
  y: number
  /** Position at the previous fixed step, for render interpolation. */
  px: number
  py: number
  vx: number
  vy: number
  /** Hitbox size, centred horizontally on x, rising from y. */
  w: number
  h: number
  grounded: boolean
  wasGrounded: boolean
  /** -1 wall on the left, 1 on the right, 0 none. */
  onWall: -1 | 0 | 1
  inWater: boolean
  /** Slope angle of the ground under the body, in radians. */
  groundAngle: number
  gravityScale: number
  /** Whether the tilemap constrains this body at all. */
  collidesWithTiles: boolean
  /** Riding platform, if any — carries the body along. */
  ridingId: number | null
}

/** Damage / interaction message passed between entities. */
export interface Hit {
  /** Positive damage. Player stomps deal 1. */
  amount: number
  /** Direction the hit pushes, normalised. */
  dirX: number
  dirY: number
  sourceId: number
  kind: 'stomp' | 'melee' | 'projectile' | 'hazard' | 'explosion'
}

// ─────────────────────────────────────────────────────────────────────────────
// Player
// ─────────────────────────────────────────────────────────────────────────────

/** Playable crew members. Each has a distinct traversal verb. */
export type CrewId =
  | 'luffy'
  | 'zoro'
  | 'nami'
  | 'sanji'
  | 'usopp'
  | 'chopper'
  | 'robin'
  | 'franky'
  | 'brook'
  | 'jinbe'

/**
 * Power tiers, escalating like Mario's small → super → fire.
 * Taking a hit drops one tier; at Base a hit costs a life.
 */
export type PowerTier = 'base' | 'gear2' | 'gear3' | 'gear4'

export interface CrewStats {
  id: CrewId
  /** Display name. */
  name: string
  /** Top ground speed, px/s. */
  runSpeed: number
  /** Peak jump height in tiles, at full hold. */
  jumpTiles: number
  /** Extra mid-air jumps. */
  airJumps: number
  /** Seconds the special attack takes. */
  attackTime: number
  /** Signature colour, used by HUD and VFX. */
  accent: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Levels
// ─────────────────────────────────────────────────────────────────────────────

export type Biome =
  | 'east-blue'
  | 'alabasta'
  | 'skypiea'
  | 'water7'
  | 'thriller-bark'
  | 'wano'

export interface SpawnDef {
  type: string
  /** Tile coordinates. */
  tx: number
  ty: number
  /** Free-form per-type configuration. */
  opts?: Record<string, number | string | boolean>
}

export interface LevelDef {
  id: string
  name: string
  biome: Biome
  /** Width and height in tiles. */
  w: number
  h: number
  /**
   * Row-major tile ids, `h` strings of `w` characters each.
   * See `src/game/level/tileCodec.ts` for the character mapping.
   */
  rows: string[]
  spawns: SpawnDef[]
  /** Player start, in tiles. */
  startX: number
  startY: number
  /** Seconds on the clock. */
  timeLimit: number
  /** Music track key. */
  music: string
  /** Optional weather overlay. */
  weather?: 'clear' | 'rain' | 'snow' | 'sand' | 'ash'
  /** 0 = noon, 0.5 = dusk, 1 = night. Drives the lighting pass. */
  timeOfDay?: number
}

export interface WorldDef {
  id: string
  name: string
  biome: Biome
  levels: LevelDef[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Game state
// ─────────────────────────────────────────────────────────────────────────────

export type GamePhase =
  | 'boot'
  | 'title'
  | 'crew-select'
  | 'map'
  | 'playing'
  | 'paused'
  | 'level-clear'
  | 'game-over'
  | 'credits'

export interface RunState {
  crew: CrewId
  tier: PowerTier
  lives: number
  berries: number
  score: number
  /** Seconds remaining on the level clock. */
  time: number
  levelId: string
  /** Checkpoint reached in the current level, in tiles. */
  checkpoint: Vec2 | null
}

export interface LevelResult {
  levelId: string
  cleared: boolean
  timeLeft: number
  berries: number
  score: number
  /** Of 3 collectible Poneglyph fragments. */
  fragments: number
  deaths: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Audio
// ─────────────────────────────────────────────────────────────────────────────

export type SfxName =
  | 'jump' | 'double-jump' | 'land' | 'skid' | 'stomp' | 'hurt' | 'death'
  | 'coin' | 'powerup' | 'powerdown' | 'break' | 'bump' | 'kick' | 'punch'
  | 'slash' | 'shoot' | 'splash' | 'swim' | 'checkpoint' | 'clear'
  | 'menu-move' | 'menu-select' | 'menu-back' | 'boss-hit' | 'boss-die'
  | 'gear-shift' | 'explosion' | '1up' | 'warn'

export interface AudioApi {
  ready(): Promise<void>
  playSfx(name: SfxName, opts?: { volume?: number; rate?: number; pan?: number }): void
  playMusic(track: string, opts?: { fade?: number; intensity?: number }): void
  stopMusic(fade?: number): void
  /** 0..1 layer intensity — used to swell the score during boss phases. */
  setIntensity(v: number): void
  setMasterVolume(v: number): void
  setMusicVolume(v: number): void
  setSfxVolume(v: number): void
  suspend(): void
  resume(): void
}

// ─────────────────────────────────────────────────────────────────────────────
// Render
// ─────────────────────────────────────────────────────────────────────────────

export interface CameraState {
  x: number
  y: number
  /** Camera shake magnitude in px, decays every step. */
  shake: number
  zoom: number
}

/** Everything a draw pass needs. Handed to backgrounds, entities and post FX. */
export interface RenderContext {
  ctx: CanvasRenderingContext2D
  camera: CameraState
  /** Seconds since boot — for wobbles, shimmer, cycling palettes. */
  time: number
  /** 0..1 blend between the previous and current fixed step. */
  alpha: number
  width: number
  height: number
}

export interface HudSnapshot {
  crew: CrewId
  tier: PowerTier
  lives: number
  berries: number
  score: number
  time: number
  /** 0..1, null when no boss is active. */
  bossHealth: number | null
  bossName: string | null
  fragments: boolean[]
}
