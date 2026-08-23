import { FIXED_DT, GAME_H, GAME_W, TILE } from '../types'
import type {
  AudioApi, CrewId, Difficulty, HudSnapshot, InputState, LevelDef, LevelResult, RunState, Vec2,
} from '../types'
import { Camera } from '../engine/camera'
import { EventBus, type GameEvents } from '../engine/events'
import { GameLoop } from '../engine/loop'
import { Input } from '../engine/input'
import { Rng, seedFrom } from '../engine/rng'
import { Level } from './level/Level'
import { Entity } from './entities/Entity'
import { Player } from './entities/Player'
import { FloatingText } from './entities/FloatingText'
import { ParticleSystem } from '../render/particles'
import { Renderer } from '../render/Renderer'
import { backgroundFor, foregroundFor, tilesetFor } from '../art'
import type { World } from './world'
import { BERRIES_PER_LIFE, DIFFICULTY, SCORE } from './config'
import { PAL } from '../art/palette'
import { rectsOverlap } from '../engine/math'
import './entities/enemies'
import './entities/items'
import './entities/bosses'

export interface GameCallbacks {
  onHud?: (hud: HudSnapshot) => void
  onLevelEnd?: (result: LevelResult) => void
  onGameOver?: () => void
  onPause?: () => void
}

/**
 * Owns one play session: the level, its entities, the camera and the loop.
 *
 * `Game` is the only class that mutates run state, and it is the concrete
 * implementation of `World` that entities are handed each step — so the flow of
 * authority is one-directional and easy to follow: input → entities → world →
 * events → UI.
 */
export class Game implements World {
  readonly events = new EventBus<GameEvents>()
  readonly camera = new Camera()
  readonly particles = new ParticleSystem()
  readonly rng: Rng

  entities: Entity[] = []
  /** What this run's difficulty hands the player. Read by entities via `World`. */
  readonly difficulty: (typeof DIFFICULTY)[Difficulty]
  level: LevelDef
  run: RunState
  time = 0

  private levelObj: Level
  private renderer: Renderer
  private loop: GameLoop
  private inputMgr: Input
  private playerRef: Player | null = null
  private pending: Entity[] = []
  private fragments = [false, false, false]
  private deaths = 0
  private respawnTimer = -1
  private endTimer = -1
  private ended = false
  private hudTick = 0
  private flash = 0

  constructor(
    canvas: HTMLCanvasElement,
    levelDef: LevelDef,
    crew: CrewId,
    readonly audio: AudioApi,
    private callbacks: GameCallbacks = {},
    startingRun?: Partial<RunState>,
    difficulty: Difficulty = 'normal',
  ) {
    this.level = levelDef
    this.rng = new Rng(seedFrom(levelDef.id))
    this.levelObj = new Level(levelDef)
    this.renderer = new Renderer(canvas)
    this.inputMgr = new Input()
    this.inputMgr.attach(window)

    this.difficulty = DIFFICULTY[difficulty] ?? DIFFICULTY.normal
    this.run = {
      crew,
      tier: this.difficulty.startTier,
      lives: this.difficulty.lives,
      berries: 0,
      score: 0,
      time: levelDef.timeLimit * this.difficulty.time,
      levelId: levelDef.id,
      checkpoint: null,
      ...startingRun,
    }

    this.camera.setBounds(this.levelObj.map.pixelW, this.levelObj.map.pixelH)
    this.reset()

    this.loop = new GameLoop({
      step: (dt) => this.step(dt),
      render: (alpha) => this.render(alpha),
    })
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  start(): void {
    this.loop.start()
    this.audio.playMusic(this.level.music, { intensity: 0.55 })
  }

  stop(): void {
    this.loop.stop()
    this.inputMgr.detach()
    this.audio.stopMusic(0.4)
  }

  pause(): void {
    this.loop.stop()
    this.audio.setIntensity(0.2)
  }

  resume(): void {
    this.loop.start()
    this.audio.setIntensity(0.55)
  }

  get input(): InputState {
    return this.inputMgr.state
  }

  get inputManager(): Input {
    return this.inputMgr
  }

  get map() {
    return this.levelObj.map
  }

  get rendererRef(): Renderer {
    return this.renderer
  }

  /** Rebuild the level from its definition and place the player. */
  reset(fromCheckpoint = false): void {
    this.entities = this.levelObj.buildEntities()
    this.particles.clear()
    const spawn: Vec2 =
      fromCheckpoint && this.run.checkpoint
        ? this.run.checkpoint
        : this.levelObj.startPos
    const p = new Player(spawn.x, spawn.y, this.run.crew)
    p.setTierSilent(this.run.tier)
    this.playerRef = p
    this.entities.push(p)
    this.camera.snapTo(p.x, p.y)
    this.respawnTimer = -1
    this.ended = false
    this.endTimer = -1
    if (!fromCheckpoint) {
      this.run.time = this.level.timeLimit * this.difficulty.time
      this.fragments = [false, false, false]
    }
  }

  // ── World implementation ───────────────────────────────────────────────────

  player(): Entity | null {
    return this.playerRef && !this.playerRef.dead ? this.playerRef : this.playerRef
  }

  spawn<T extends Entity>(e: T): T {
    this.pending.push(e)
    return e
  }

  nearest(x: number, y: number, radius: number, tag: string): Entity | null {
    let best: Entity | null = null
    let bestD = radius * radius
    for (const e of this.entities) {
      if (e.dead || !e.tags.has(tag)) continue
      const dx = e.x - x
      const dy = e.y - y
      const d = dx * dx + dy * dy
      if (d < bestD) {
        bestD = d
        best = e
      }
    }
    return best
  }

  hitstop(frames: number): void {
    this.loop.addHitstop(frames)
  }

  shake(amount: number): void {
    this.camera.addTrauma(amount)
  }

  score(points: number, x: number, y: number): void {
    this.run.score += points
    this.spawn(new FloatingText(x, y - 6, `${points}`, PAL.gold))
  }

  berries(n: number, x: number, y: number): void {
    this.run.berries += n
    if (this.run.berries >= BERRIES_PER_LIFE) {
      this.run.berries -= BERRIES_PER_LIFE
      this.run.lives++
      this.audio.playSfx('1up')
      this.spawn(new FloatingText(x, y - 18, '1UP', PAL.heal))
    }
  }

  setCheckpoint(p: Vec2): void {
    this.run.checkpoint = { x: p.x, y: p.y }
  }

  clearLevel(): void {
    if (this.ended) return
    this.ended = true
    this.endTimer = 0
    this.audio.stopMusic(0.3)
    this.audio.playSfx('clear')
    this.flash = 0.5
  }

  // ── Step ───────────────────────────────────────────────────────────────────

  private step(dt: number): void {
    this.time += dt
    const input = this.inputMgr.sample()

    if (input.pressed.pause && !this.ended) {
      this.callbacks.onPause?.()
      return
    }

    if (!this.ended && this.playerRef && !this.playerRef.dead && this.playerRef.state !== 'clear') {
      this.run.time = Math.max(0, this.run.time - dt)
      if (this.run.time === 0) this.playerRef.kill(this)
      // The music tightens as the clock runs out.
      if (this.run.time < 30) this.audio.setIntensity(0.9)
    }

    const camX = this.camera.x
    for (const e of this.entities) {
      if (e.dead || !e.active) continue
      if (e.cullable) {
        const offLeft = e.x < camX - e.cullDistance
        const offRight = e.x > camX + GAME_W + e.cullDistance
        if (offLeft || offRight) continue
      }
      e.update(dt, this)
    }

    this.resolveAttacks()

    if (this.pending.length) {
      this.entities.push(...this.pending)
      this.pending.length = 0
    }
    for (const e of this.entities) if (e.dead) e.onRemove(this)
    this.entities = this.entities.filter((e) => !e.dead)

    this.particles.update(dt)
    this.flash = Math.max(0, this.flash - dt * 1.6)

    const p = this.playerRef
    if (p) {
      this.camera.update(dt, p.x, p.y - p.body.h / 2, p.body.vx, p.body.grounded)
      if (p.state === 'dead' && this.respawnTimer < 0 && p.y > this.map.pixelH + 60) {
        this.respawnTimer = 0
      }
    }

    if (this.respawnTimer >= 0) {
      this.respawnTimer += dt
      if (this.respawnTimer > 1.1) this.handleDeath()
    }

    if (this.endTimer >= 0) {
      this.endTimer += dt
      if (this.endTimer > 2.2) this.finish()
    }

    this.hudTick += dt
    if (this.hudTick > 0.08) {
      this.hudTick = 0
      this.callbacks.onHud?.(this.hud())
    }
  }

  /** Player attack boxes against enemy hurtboxes. */
  private resolveAttacks(): void {
    const p = this.playerRef
    if (!p) return
    const box = p.hitbox()
    if (!box) return
    for (const e of this.entities) {
      if (e.dead || e.kind === 'player' || e.iframes > 0) continue
      if (!e.tags.has('enemy') && !e.tags.has('boss')) continue
      if (!rectsOverlap(box, e.hurtbox())) continue
      e.damage(
        { amount: p.attackPower, dirX: p.facing, dirY: 0, sourceId: p.id, kind: 'melee' },
        this,
      )
    }
  }

  private handleDeath(): void {
    this.deaths++
    this.run.lives--
    this.respawnTimer = -1
    this.run.tier = this.difficulty.startTier
    if (this.run.lives <= 0) {
      this.callbacks.onGameOver?.()
      this.loop.stop()
      return
    }
    this.reset(true)
    this.audio.playMusic(this.level.music, { intensity: 0.55 })
  }

  private finish(): void {
    this.endTimer = -1
    const timeBonus = Math.floor(this.run.time) * SCORE.timeBonus
    this.run.score += timeBonus + SCORE.clear
    this.callbacks.onLevelEnd?.({
      levelId: this.level.id,
      cleared: true,
      timeLeft: this.run.time,
      berries: this.run.berries,
      score: this.run.score,
      fragments: this.fragments.filter(Boolean).length,
      deaths: this.deaths,
    })
    this.loop.stop()
  }

  hud(): HudSnapshot {
    const boss = this.entities.find((e) => e.tags.has('boss') && !e.dead)
    return {
      crew: this.run.crew,
      tier: this.playerRef?.tier ?? 'base',
      lives: this.run.lives,
      berries: this.run.berries,
      score: this.run.score,
      time: this.run.time,
      bossHealth: boss ? boss.health / (boss as unknown as { maxHealth: number }).maxHealth : null,
      bossName: boss ? (boss as unknown as { displayName: string }).displayName : null,
      fragments: this.fragments,
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  private render(alpha: number): void {
    const biome = this.level.biome
    this.renderer.settings.flash = this.flash
    this.renderer.settings.flashColor = PAL.white
    this.renderer.settings.gradeColor = biome === 'thriller-bark' ? '#6A5A9E' : '#FFD9A0'
    this.renderer.draw({
      map: this.map,
      tileset: tilesetFor(biome),
      background: backgroundFor(biome),
      foreground: foregroundFor(biome),
      entities: this.entities,
      camera: this.camera,
      particles: this.particles,
      biome,
      time: this.time,
      alpha,
      weather: this.level.weather,
      timeOfDay: this.level.timeOfDay,
    })
  }

  resize(): void {
    this.renderer.resize()
  }

  /** Useful for the debug overlay and tests. */
  get playerEntity(): Player | null {
    return this.playerRef
  }

  /**
   * Move the player and camera to a world position without a transition.
   * Used by the screenshot harness to frame specific parts of a level.
   */
  teleport(x: number, y: number): void {
    const p = this.playerRef
    if (!p) return
    p.body.x = x
    p.body.px = x
    p.body.y = y
    p.body.py = y
    p.body.vx = 0
    p.body.vy = 0
    this.camera.snapTo(x, y)
  }

  /** Advance the simulation deterministically, for tests and capture runs. */
  advance(steps: number): void {
    for (let i = 0; i < steps; i++) this.step(FIXED_DT)
  }

  get bounds(): { w: number; h: number } {
    return { w: this.map.w * TILE, h: this.map.h * TILE }
  }

  static get viewport(): { w: number; h: number } {
    return { w: GAME_W, h: GAME_H }
  }

  static get stepSeconds(): number {
    return FIXED_DT
  }
}
