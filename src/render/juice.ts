/**
 * Screen juice: hit-stop, flashes, zoom punch, chromatic kick and slow motion,
 * as a bag of pure timers.
 *
 * Nothing in here imports game code, render code or the DOM. It has no update
 * loop of its own, calls nothing back and draws nothing — it is a state
 * machine you push events into and poll every frame. That is deliberate: the
 * loop, the game and the renderer all need a different slice of this state at
 * a different moment, and a system that pushed to them would have to know
 * about all three.
 *
 * ── How Game.ts should drive it ─────────────────────────────────────────────
 *
 *   readonly juice = new ScreenJuice()
 *
 *   // 1. Advance it on the RENDER frame, with real wall-clock time.
 *   //    Not in step(): a flash and a zoom punch have to keep animating while
 *   //    the simulation is frozen by the very hit-stop that triggered them.
 *   private render(alpha: number, frameDt: number): void {
 *     this.juice.update(frameDt)
 *     ...
 *   }
 *
 *   // 2. Let it own the freeze. First line of step():
 *   private step(dt: number): void {
 *     if (this.juice.consumeStep()) return
 *     ...
 *   }
 *   // GameLoop.addHitstop can stay for anything that wants to freeze the loop
 *   // itself, but routing both through the juice keeps one source of truth.
 *
 *   // 3. World.hitstop(frames) becomes:
 *   hitstop(frames: number): void { this.juice.hitStop(frames) }
 *
 *   // 4. Events fire whole presets rather than three calls each:
 *   this.juice.play('stomp')            // or play(JUICE.bossDie)
 *   world.shake(this.juice.takeShake()) // forward trauma to the Camera
 *
 * ── How Renderer.ts should read it ──────────────────────────────────────────
 *
 * The renderer never mutates the juice; it copies three numbers per frame.
 * In `draw()`, before compositing, with `j = args.juice` (add it to DrawArgs):
 *
 *   this.settings.flash = j.flashAmount
 *   this.settings.flashColor = j.flashColor
 *   this.settings.speed = Math.max(this.settings.speed, j.chroma)
 *
 * and for the punch, around the world transform only (the HUD must not
 * breathe), scaling about the centre of the frame:
 *
 *   const z = j.zoom
 *   if (z !== 1) {
 *     ctx.translate(GAME_W / 2, GAME_H / 2)
 *     ctx.scale(z, z)
 *     ctx.translate(-GAME_W / 2, -GAME_H / 2)
 *   }
 *
 * `reducedMotion` scales every effect at once, so the accessibility toggle is
 * a single assignment: `juice.intensity = settings.reducedFx ? 0.25 : 1`.
 */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** One authored impact. Every field is optional; omitted ones do nothing. */
export interface JuicePreset {
  /** Fixed steps to freeze the simulation for. */
  hitStop?: number
  /** Peak of the full-screen flash, 0..1. */
  flash?: number
  flashColor?: string
  /** Flash units lost per second. Higher is snappier. */
  flashDecay?: number
  /** Zoom punch amplitude — 0.04 is a nudge, 0.12 is a boss dying. */
  zoom?: number
  /** Seconds the punch takes to settle. */
  zoomTime?: number
  /** Chromatic split amplitude, 0..1. */
  chroma?: number
  chromaDecay?: number
  /** Camera trauma for the caller to forward; this class never moves anything. */
  shake?: number
  /** Simulation time scale while it lasts, e.g. 0.35 for a finisher. */
  slowMo?: number
  slowMoTime?: number
}

/** A frame's worth of juice, for anything that would rather read one object. */
export interface JuiceState {
  frozen: boolean
  zoom: number
  flashAmount: number
  flashColor: string
  chroma: number
  timeScale: number
}

const WHITE = '#FFFFFF'

export class ScreenJuice {
  /** Global multiplier — drop it for "reduced effects" and prefers-reduced-motion. */
  intensity = 1

  private stopFrames = 0
  private flashA = 0
  private flashDecayRate = 3.2
  private flashCol = WHITE
  private chromaA = 0
  private chromaDecayRate = 4
  private zoomAmp = 0
  private zoomT = 0
  private zoomLen = 0.34
  private shakeQueue = 0
  private slowScale = 1
  private slowT = 0

  /**
   * Advance every timer. Pass the real frame delta, not the fixed step: these
   * are presentation timers and they must keep running during hit-stop.
   */
  update(dt: number): void {
    if (dt <= 0) return
    if (this.flashA > 0) this.flashA = Math.max(0, this.flashA - this.flashDecayRate * dt)
    if (this.chromaA > 0) this.chromaA = Math.max(0, this.chromaA - this.chromaDecayRate * dt)
    if (this.zoomT > 0) {
      this.zoomT = Math.max(0, this.zoomT - dt)
      if (this.zoomT === 0) this.zoomAmp = 0
    }
    if (this.slowT > 0) {
      this.slowT = Math.max(0, this.slowT - dt)
      if (this.slowT === 0) this.slowScale = 1
    }
  }

  /**
   * Call once per fixed step. Returns true when this step should be skipped
   * because the frame is frozen, and eats one frame of the hit-stop.
   */
  consumeStep(): boolean {
    if (this.stopFrames <= 0) return false
    this.stopFrames--
    return true
  }

  // ── Inputs ─────────────────────────────────────────────────────────────────

  /** Freeze for `frames` fixed steps. Overlapping calls take the longer one. */
  hitStop(frames: number): void {
    const f = Math.round(frames * this.intensity)
    if (f > this.stopFrames) this.stopFrames = f
  }

  flash(amount: number, color = WHITE, decay = 3.2): void {
    const a = clamp01(amount * this.intensity)
    if (a <= this.flashA) return
    this.flashA = a
    this.flashCol = color
    this.flashDecayRate = decay
  }

  /** A punch in, springing back with one overshoot. Negative pulls the camera out. */
  zoomPunch(amount: number, seconds = 0.34): void {
    const a = amount * this.intensity
    if (Math.abs(a) < Math.abs(this.zoomAmp) && this.zoomT > 0) return
    this.zoomAmp = a
    this.zoomLen = Math.max(0.05, seconds)
    this.zoomT = this.zoomLen
  }

  chromaKick(amount: number, decay = 4): void {
    const a = clamp01(amount * this.intensity)
    if (a <= this.chromaA) return
    this.chromaA = a
    this.chromaDecayRate = decay
  }

  /** Queue camera trauma. Read it back with `takeShake()` and pass it on. */
  shake(amount: number): void {
    this.shakeQueue = Math.max(this.shakeQueue, amount * this.intensity)
  }

  /** Slow the simulation down for a beat. Multiply your step dt by `timeScale`. */
  slowMo(scale: number, seconds: number): void {
    this.slowScale = Math.max(0.05, scale)
    this.slowT = Math.max(this.slowT, seconds)
  }

  /** Fire an authored preset by name or by value. */
  play(preset: keyof typeof JUICE | JuicePreset, scale = 1): void {
    const p: JuicePreset = typeof preset === 'string' ? JUICE[preset] : preset
    if (!p) return
    if (p.hitStop) this.hitStop(p.hitStop * scale)
    if (p.flash) this.flash(p.flash * scale, p.flashColor ?? WHITE, p.flashDecay ?? 3.2)
    if (p.zoom) this.zoomPunch(p.zoom * scale, p.zoomTime ?? 0.34)
    if (p.chroma) this.chromaKick(p.chroma * scale, p.chromaDecay ?? 4)
    if (p.shake) this.shake(p.shake * scale)
    if (p.slowMo) this.slowMo(p.slowMo, p.slowMoTime ?? 0.3)
  }

  // ── Outputs ────────────────────────────────────────────────────────────────

  get frozen(): boolean {
    return this.stopFrames > 0
  }

  /** Fixed steps of freeze still owed. */
  get hitStopLeft(): number {
    return this.stopFrames
  }

  /**
   * Render scale about the centre of the frame. 1 when nothing is happening.
   *
   * The curve is a damped cosine: it snaps to the peak on the first frame and
   * springs back through a single small overshoot, which is what makes an
   * impact feel elastic instead of merely animated.
   */
  get zoom(): number {
    if (this.zoomT <= 0 || this.zoomAmp === 0) return 1
    const u = 1 - this.zoomT / this.zoomLen
    return 1 + this.zoomAmp * Math.exp(-5.2 * u) * Math.cos(u * 8.6)
  }

  get flashAmount(): number {
    return this.flashA
  }

  get flashColor(): string {
    return this.flashCol
  }

  get chroma(): number {
    return this.chromaA
  }

  get timeScale(): number {
    return this.slowT > 0 ? this.slowScale : 1
  }

  /** Trauma queued since the last call. Returns 0 when there is nothing owed. */
  takeShake(): number {
    const s = this.shakeQueue
    this.shakeQueue = 0
    return s
  }

  /** Everything at once, for callers that would rather copy one object. */
  snapshot(): JuiceState {
    return {
      frozen: this.frozen,
      zoom: this.zoom,
      flashAmount: this.flashA,
      flashColor: this.flashCol,
      chroma: this.chromaA,
      timeScale: this.timeScale,
    }
  }

  /** Kill everything — level restart, pause, teleport. */
  reset(): void {
    this.stopFrames = 0
    this.flashA = 0
    this.chromaA = 0
    this.zoomAmp = 0
    this.zoomT = 0
    this.shakeQueue = 0
    this.slowScale = 1
    this.slowT = 0
  }
}

/**
 * Authored impacts.
 *
 * These are tuned against each other, not in isolation: a stomp has to feel
 * smaller than a boss hit, which has to feel smaller than a boss dying. Hit
 * stop is in fixed steps (60 Hz), so 4 is 67 ms — long enough to register,
 * short enough that the player never feels the controls go away.
 */
export const JUICE = {
  /** Landing on an enemy. Small, frequent — must not become annoying. */
  stomp: { hitStop: 4, zoom: 0.022, zoomTime: 0.26, shake: 0.1 },
  /** A landed melee hit. */
  hit: { hitStop: 5, flash: 0.1, zoom: 0.03, chroma: 0.14, shake: 0.14 },
  /** A heavy or charged hit. */
  heavy: { hitStop: 9, flash: 0.2, zoom: 0.055, chroma: 0.26, shake: 0.26 },
  /** Breaking a brick or a crate. */
  breakTile: { hitStop: 3, zoom: 0.018, shake: 0.12 },
  /** The player takes a hit — the kick is inward and red. */
  playerHurt: {
    hitStop: 8, flash: 0.34, flashColor: '#E23B32', flashDecay: 2.4,
    zoom: -0.05, zoomTime: 0.4, chroma: 0.34, shake: 0.34,
  },
  /** The player dies. */
  playerDie: {
    hitStop: 14, flash: 0.5, flashColor: '#FFFFFF', flashDecay: 1.6,
    zoom: 0.08, zoomTime: 0.6, chroma: 0.4, shake: 0.4, slowMo: 0.35, slowMoTime: 0.7,
  },
  /** Gearing up. */
  powerUp: { hitStop: 8, flash: 0.4, flashColor: '#F6C63C', zoom: 0.06, chroma: 0.2, shake: 0.16 },
  /** Losing a gear. */
  powerDown: { hitStop: 6, flash: 0.22, flashColor: '#4A5878', zoom: -0.04, shake: 0.18 },
  /** Hitting a boss. */
  bossHit: { hitStop: 9, flash: 0.16, zoom: 0.04, chroma: 0.24, shake: 0.24 },
  /** A boss phase ending. */
  bossPhase: {
    hitStop: 18, flash: 0.4, zoom: 0.07, zoomTime: 0.5, chroma: 0.34, shake: 0.34,
    slowMo: 0.4, slowMoTime: 0.5,
  },
  /** A boss dying — the biggest thing in the game. */
  bossDie: {
    hitStop: 26, flash: 0.72, flashDecay: 1.2, zoom: 0.13, zoomTime: 0.8,
    chroma: 0.5, chromaDecay: 2.2, shake: 0.55, slowMo: 0.3, slowMoTime: 1.1,
  },
  /** Picking up a fragment or a checkpoint. */
  pickup: { flash: 0.12, flashColor: '#FFF6E8', zoom: 0.02, zoomTime: 0.2 },
  /** Starting a dash. */
  dash: { chroma: 0.4, chromaDecay: 2.6, zoom: -0.03, zoomTime: 0.22 },
  /** Clearing the level. */
  clear: { flash: 0.5, flashDecay: 1, zoom: 0.05, zoomTime: 0.7, slowMo: 0.5, slowMoTime: 0.6 },
} as const satisfies Record<string, JuicePreset>
