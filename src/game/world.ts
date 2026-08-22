import type { Camera } from '../engine/camera'
import type { EventBus, GameEvents } from '../engine/events'
import type { Rng } from '../engine/rng'
import type { TileMap } from '../physics/TileMap'
import type { AudioApi, InputState, LevelDef, RunState, Vec2 } from '../types'
import type { Entity } from './entities/Entity'
import type { ParticleSystem } from '../render/particles'

/**
 * The service locator handed to every entity each step. Entities never import
 * the Game class directly — they talk to it through this interface, which keeps
 * the dependency graph acyclic and makes entities unit-testable in isolation.
 */
export interface World {
  readonly map: TileMap
  readonly entities: Entity[]
  readonly events: EventBus<GameEvents>
  readonly camera: Camera
  readonly audio: AudioApi
  readonly rng: Rng
  readonly particles: ParticleSystem
  readonly input: InputState
  readonly level: LevelDef
  readonly run: RunState
  /** Seconds since the level started. */
  readonly time: number

  /** The player entity, or null during cutscenes and death sequences. */
  player(): Entity | null
  /** Register a new entity. Returns it for chaining. */
  spawn<T extends Entity>(e: T): T
  /** Find the nearest live entity of a kind within `radius`, or null. */
  nearest(x: number, y: number, radius: number, tag: string): Entity | null
  /** Freeze the whole simulation for `frames` — impact punch. */
  hitstop(frames: number): void
  /** Add camera trauma in 0..1. */
  shake(amount: number): void
  /** Award points with a floating number at the world position. */
  score(points: number, x: number, y: number): void
  /** Collect berries (this game's coins). */
  berries(n: number, x: number, y: number): void
  /** Move the respawn point. */
  setCheckpoint(p: Vec2): void
  /** End the level successfully. */
  clearLevel(): void
}
