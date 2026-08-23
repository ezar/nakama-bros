import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TILE, type CrewId, type HudSnapshot, type LevelDef, type LevelResult } from '../types'
import { Game } from '../game/Game'
import { Hud } from './hud/Hud'
import { TouchControls } from './controls/TouchControls'
import { useSettings } from '../store/settingsStore'
import type { AudioApi } from '../types'

interface Props {
  level: LevelDef
  crew: CrewId
  audio: AudioApi
  onLevelEnd: (r: LevelResult) => void
  onGameOver: () => void
  onPause: () => void
  paused: boolean
}

const isTouchDevice = () =>
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

/**
 * Mounts the canvas and owns the `Game` instance's lifetime. React never
 * re-renders during play: the HUD updates from a throttled callback, and the
 * game loop drives the canvas directly.
 */
export function GameView({ level, crew, audio, onLevelEnd, onGameOver, onPause, paused }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<Game | null>(null)
  const [hud, setHud] = useState<HudSnapshot | null>(null)
  const settings = useSettings()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const game = new Game(canvas, level, crew, audio, {
      onHud: setHud,
      onLevelEnd,
      onGameOver,
      onPause,
    // Read once, here: the difficulty decides lives and the clock at
    // construction, so changing it mid-stage would be half-applied. The next
    // level picks up the new setting.
    }, undefined, useSettings.getState().difficulty)
    gameRef.current = game
    game.start()
    // A stable handle for automated screenshots and visual review runs.
    ;(window as unknown as { __NAKAMA__?: Game }).__NAKAMA__ = game

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
      delete (window as unknown as { __NAKAMA__?: Game }).__NAKAMA__
    }
    // The game owns its own lifetime; re-creating it on every prop change would
    // restart the level, so only the level and crew may re-mount it.
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
      {hud && <Hud hud={hud} compass={compass} compact={showTouch} />}
      {gameRef.current && (
        <TouchControls input={gameRef.current.inputManager} visible={showTouch} />
      )}
    </div>
  )
}
