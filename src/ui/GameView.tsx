import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TILE, type CrewId, type HudSnapshot, type LevelDef, type LevelResult } from '../types'
import { Game } from '../game/Game'
import { Hud } from './hud/Hud'
import { PauseButton, TouchControls } from './controls/TouchControls'
import { EXPOSE_DEBUG } from '../debug'
import { useProgress } from '../store/progressStore'
import { useSettings } from '../store/settingsStore'
import type { AudioApi } from '../types'
import type { GhostRacer } from '../game/ghost'
import type { RaceSession } from '../net/session'
import { RaceCountdown } from './RaceCountdown'
import { PAL } from '../art/palette'

interface Props {
  level: LevelDef
  crew: CrewId
  audio: AudioApi
  onLevelEnd: (r: LevelResult) => void
  onGameOver: () => void
  onPause: () => void
  paused: boolean
  /** A live race against another device, or absent for an ordinary run. */
  race?: RaceSession | null
}

const isTouchDevice = () =>
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

/**
 * Mounts the canvas and owns the `Game` instance's lifetime. React never
 * re-renders during play: the HUD updates from a throttled callback, and the
 * game loop drives the canvas directly.
 */
export function GameView({ level, crew, audio, onLevelEnd, onGameOver, onPause, paused, race }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<Game | null>(null)
  const [hud, setHud] = useState<HudSnapshot | null>(null)
  const settings = useSettings()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // Read once, here — same reason as the difficulty below. A ghost is the
    // recording as it stood when the stage began; swapping it mid-run for one
    // the run itself just produced would be racing a moving target.
    const { difficulty, ghost: raceGhost } = useSettings.getState()
    const progress = useProgress.getState()
    const racers: GhostRacer[] = []
    /*
      The rival goes in first, so it draws under your own shadow when the two
      are on top of each other. Yours is the one you steer by.

      It is also not governed by the ghost setting, which reads "race the
      shadow of your best lap" and means exactly that. A rival is opted into
      one stage at a time, by accepting a challenge somebody sent — turning
      your own shadow off is a statement about clutter, not a refusal of a
      race you already agreed to. Dismissing the rival is how you decline it.
    */
    const rival = race ? undefined : progress.rivals[level.id]
    if (rival) racers.push({ track: rival, tint: PAL.bloodOrange })
    // Your own shadow stays out of a live race too. Three translucent bodies
    // on one stage is not a race, it is a crowd — and the one that matters is
    // the one that is actually running against you right now.
    const mine = raceGhost && !race ? progress.ghosts[level.id] : undefined
    if (mine) racers.push({ track: mine })
    const game = new Game(canvas, level, crew, audio, {
      onHud: setHud,
      onLevelEnd,
      onGameOver,
      onPause,
      onGhostRecorded: (levelId, t) => useProgress.getState().saveGhost(levelId, t),
    // Read once, here: the difficulty decides lives and the clock at
    // construction, so changing it mid-stage would be half-applied. The next
    // level picks up the new setting.
    }, undefined, difficulty, racers, race ?? null)
    gameRef.current = game
    game.start()
    // A stable handle for automated screenshots and visual review runs.
    // Absent from the shipped build — see `EXPOSE_DEBUG`.
    if (EXPOSE_DEBUG) (window as unknown as { __NAKAMA__?: Game }).__NAKAMA__ = game

    const onResize = () => game.resize()
    window.addEventListener('resize', onResize)
    const onVisibility = () => {
      if (document.hidden) game.pause()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
      game.stop()
      gameRef.current = null
      if (EXPOSE_DEBUG) delete (window as unknown as { __NAKAMA__?: Game }).__NAKAMA__
    }
    // The game owns its own lifetime; re-creating it on every prop change would
    // restart the level, so only the level and crew may re-mount it. A race
    // session is created before this mounts and outlives it, for the same
    // reason: swapping one mid-stage is not a thing that can happen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, crew])

  useEffect(() => {
    const game = gameRef.current
    if (!game) return
    if (paused) game.pause()
    else game.resume()
  }, [paused])

  useEffect(() => {
    audio.setMasterVolume(settings.master)
    audio.setMusicVolume(settings.music)
    audio.setSfxVolume(settings.sfx)
  }, [audio, settings.master, settings.music, settings.sfx])

  useEffect(() => {
    const game = gameRef.current
    if (!game) return
    game.rendererRef.settings.scanlines = settings.crt ? 0.35 : 0
    game.rendererRef.settings.bloom = settings.effects === 'reduced' ? 0.2 : 0.5
  }, [settings.crt, settings.effects])

  const showTouch =
    settings.touchControls === 'on' || (settings.touchControls === 'auto' && isTouchDevice())

  /** Where the stage ends, in world units — the Log Pose's north. */
  const goal = useMemo(() => level.spawns.find((s) => s.type === 'goal') ?? null, [level])

  /**
   * Sampled by the HUD compass once per animation frame. It reads the live
   * entity rather than the HUD snapshot because a needle that updated at the
   * snapshot's rate would visibly step.
   */
  const compass = useCallback(() => {
    const game = gameRef.current
    if (!game || !goal) return null
    const player = game.playerEntity
    if (!player) return null
    const dx = goal.tx * TILE + TILE / 2 - player.body.x
    const dy = goal.ty * TILE + TILE / 2 - (player.body.y - player.body.h / 2)
    return { angle: Math.atan2(dy, dx), dist: Math.hypot(dx, dy) }
  }, [goal])

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-[#050a14]">
      <canvas ref={canvasRef} className="shadow-[0_0_80px_-10px_rgba(0,180,216,0.35)]" />
      {hud && (
        <Hud
          hud={hud}
          compass={compass}
          compact={showTouch}
          pause={showTouch && gameRef.current ? <PauseButton input={gameRef.current.inputManager} /> : undefined}
        />
      )}
      {gameRef.current && (
        <TouchControls input={gameRef.current.inputManager} visible={showTouch} />
      )}
      {race && <RaceCountdown race={race} />}
    </div>
  )
}
