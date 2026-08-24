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
import { Ghost } from './entities/Ghost'
import { LiveRival } from './entities/LiveRival'
import type { RaceSession } from '../net/session'
import { GHOST_MIN_POSES, GhostRecorder, type GhostRacer, type GhostTrack } from './ghost'

/** Seconds the HUD keeps showing a multiplier after the last link landed. */
const CHAIN_HOLD = 1.6

export interface GameCallbacks {
  onHud?: (hud: HudSnapshot) => void
  onLevelEnd?: (result: LevelResult) => void
  /**
   * A run worth keeping finished. Handed over rather than written here: the
   * game does not know about stores, and only the shell knows whether this
   * beats what is already on file.
   */
  onGhostRecorded?: (levelId: string, track: GhostTrack) => void
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
  /** The multiplier the HUD is currently showing, and how long it has left. */
  private chainShown = 0
  private chainHold = 0
  private hudTick = 0
  private flash = 0
  /**
   * Recording is unconditional; *racing* is the thing behind the setting.
   *
   * Always recording costs a few kilobytes and one sample every twelfth of a
   * second, and it means the first time somebody switches the ghost on they
   * already have something to race. Recording only while the feature is on
   * would make it useless until you had replayed a stage with it enabled,
   * which is exactly when nobody would think to.
   */
  private recorder = new GhostRecorder()

  constructor(
    canvas: HTMLCanvasElement,
    levelDef: LevelDef,
    crew: CrewId,
    readonly audio: AudioApi,
    private callbacks: GameCallbacks = {},
    startingRun?: Partial<RunState>,
    difficulty: Difficulty = 'normal',
    /**
     * The runs to race against. Empty means nothing to race.
     *
     * A list rather than one, because your own best and a challenge somebody
     * sent are both on the stage at the same time and neither replaces the
     * other: the point of a rival is to see where you lose ground to them,
     * and the point of your own shadow is to see whether you are having a
     * good run at all.
     */
    racers: GhostRacer[] = [],
    /**
     * A live race against another device, or null for an ordinary run.
     *
     * The game does not know this involves a network. It hands over where the
     * body is, asks where the other one is, and says when it crossed the line
     * — the session deals with everything else.
     */
    private readonly race: RaceSession | null = null,
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
      bestChain: 1,
      ...startingRun,
    }

    this.camera.setBounds(this.levelObj.map.pixelW, this.levelObj.map.pixelH)
    this.reset()
    for (const racer of racers) this.spawn(new Ghost(racer.track, racer.tint ?? null))
    if (race) {
      this.spawn(new LiveRival(race, race.snapshot().opponent?.crew ?? 'luffy', PAL.bloodOrange))
    }

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
    /*
      Shadows survive the rebuild.

      They are not part of the stage — they are watching it — and rebuilding
      the level from its definition would drop every one of them. That was a
      real bug rather than a hypothetical: dying is precisely the moment a
      player wants to see how far ahead the run they are chasing got to, and
      instead the other body vanished for the rest of the lap with nothing to
      say why. In a live race it was worse, because the opponent never came
      back at all.
    */
    const shadows = this.entities.filter((e) => e.tags.has('ghost') && !e.dead)
    this.entities = this.levelObj.buildEntities()
    this.entities.push(...shadows)
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

  /**
   * Call the multiplier out where the kill happened.
   *
   * Sits above the points rather than beside them, in a hotter colour and for
   * longer, because it is the part worth chasing: the points are the
   * consequence, the chain is the achievement. The hit-stop grows a little with
   * each link so a long chain feels heavier as it goes, not just louder.
   */
  chainCalled(multiplier: number, x: number, y: number): void {
    this.run.bestChain = Math.max(this.run.bestChain, multiplier)
    this.chainShown = multiplier
    this.chainHold = CHAIN_HOLD
    this.spawn(new FloatingText(x, y - 20, `x${multiplier}`, PAL.ember, 1.15))
    this.hitstop(Math.min(9, 3 + Math.log2(multiplier) * 2))
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
    /*
      A race holds everybody at the start line until both countdowns run out.

      The whole step is skipped rather than just the input: a stage that ticked
      while waiting would have its enemies and its clock several seconds ahead
      of the other player's by the time anyone could move, and the two would be
      racing visibly different stages.

      Nothing is drawn from here — the loop renders after stepping regardless,
      so the stage keeps being painted, frozen, behind the countdown.
    */
    if (this.race && !this.race.started) {
      // The stage is frozen, but the readout is not: without this the lives,
      // the clock and the berries are simply absent for the three seconds of
      // the countdown, and a HUD that appears at the gun looks like something
      // that failed to load rather than something that was waiting.
      this.callbacks.onHud?.(this.hud())
      return
    }
    this.time += dt
    // The chain readout outlives the chain by a beat, on purpose: landing is
    // what ends a chain, and a number that disappeared on the same frame would
    // never be read.
    if (this.chainHold > 0) this.chainHold = Math.max(0, this.chainHold - dt)
    // Sampled before anything can end the level, and only while the run is
    // actually being played: the victory walk and the death fall are not part
    // of the lap being raced.
    const racer = this.playerRef
    if (racer && !this.ended && !racer.dead && racer.state !== 'clear' && racer.state !== 'dead') {
      const pose = { x: racer.body.x, y: racer.body.y, facing: racer.facing, anim: racer.anim }
      this.recorder.sample(dt, pose)
      // The same pose the recorder gets, on the same clock: the other side
      // orders what arrives by this number, and it must mean the same thing
      // as the time this run will be judged on.
      this.race?.publish(dt, pose, this.recorder.seconds * 1000)
    }
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
    this.race?.finish(+this.recorder.seconds.toFixed(2))
    /*
      A race is an exhibition and leaves no mark on either save: no ghost, no
      berries, no stage recorded as cleared.

      Which is what lets the host pick any stage without having to ask what the
      other player has reached. A link that could open a locked stage would make
      the campaign optional; a race that records nothing cannot, so it does not
      have to be policed.
    */
    if (!this.race && this.recorder.poses >= GHOST_MIN_POSES) {
      const track = this.recorder.finish(this.run.crew)
      if (track) this.callbacks.onGhostRecorded?.(this.level.id, track)
    }
    const timeBonus = Math.floor(this.run.time) * SCORE.timeBonus
    this.run.score += timeBonus + SCORE.clear
    this.callbacks.onLevelEnd?.({
      runTime: +this.recorder.seconds.toFixed(2),
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
      chain: this.chainHold > 0 ? this.chainShown : 0,
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
