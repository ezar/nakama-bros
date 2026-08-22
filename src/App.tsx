import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import type { CrewId, LevelResult } from './types'
import { loadArt } from './art'
import { AudioEngine } from './audio/AudioEngine'
import { ALL_LEVELS, levelById, nextLevelId } from './game/level'
import { useProgress } from './store/progressStore'
import { useSettings } from './store/settingsStore'
import { GameView } from './ui/GameView'
import { TitleScreen } from './ui/screens/TitleScreen'
import { LoadingScreen } from './ui/screens/LoadingScreen'
import { CrewScreen } from './ui/screens/CrewScreen'
import { PauseScreen } from './ui/screens/PauseScreen'
import { ResultScreen } from './ui/screens/ResultScreen'
import { GameOverScreen } from './ui/screens/GameOverScreen'
import { OptionsScreen } from './ui/screens/OptionsScreen'

type Screen = 'loading' | 'title' | 'crew' | 'options' | 'play'

/**
 * Screen router and session owner.
 *
 * Art loads once at boot; audio is created lazily on the first gesture because
 * browsers refuse to start an AudioContext before one. Everything below `play`
 * is imperative canvas work — React's job stops at mounting it.
 */
export default function App() {
  const [screen, setScreen] = useState<Screen>('loading')
  const [progress, setProgress] = useState(0)
  const [loadLabel, setLoadLabel] = useState('…')
  const [levelId, setLevelId] = useState(ALL_LEVELS[0].id)
  const [paused, setPaused] = useState(false)
  const [result, setResult] = useState<LevelResult | null>(null)
  const [gameOver, setGameOver] = useState(false)
  /** Bumped to force a fresh Game instance when restarting the same level. */
  const [runKey, setRunKey] = useState(0)

  const crew = useProgress((s) => s.crew)
  const setCrew = useProgress((s) => s.setCrew)
  const recordResult = useProgress((s) => s.record)
  const settings = useSettings()
  const audio = useMemo(() => new AudioEngine(), [])
  const audioStarted = useRef(false)

  useEffect(() => {
    loadArt((t, label) => {
      setProgress(t)
      setLoadLabel(label)
    }).then(() => setScreen('title'))
  }, [])

  // Browsers only allow audio to start inside a user gesture.
  useEffect(() => {
    const unlock = () => {
      if (audioStarted.current) return
      audioStarted.current = true
      void audio.ready().then(() => {
        audio.setMasterVolume(settings.master)
        audio.setMusicVolume(settings.music)
        audio.setSfxVolume(settings.sfx)
      })
    }
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [audio, settings.master, settings.music, settings.sfx])

  const level = levelById(levelId) ?? ALL_LEVELS[0]

  const startLevel = useCallback((id: string) => {
    setLevelId(id)
    setResult(null)
    setGameOver(false)
    setPaused(false)
    setRunKey((k) => k + 1)
    setScreen('play')
  }, [])

  const onLevelEnd = useCallback(
    (r: LevelResult) => {
      recordResult(r)
      setResult(r)
    },
    [recordResult],
  )

  const quitToMenu = useCallback(() => {
    setPaused(false)
    setResult(null)
    setGameOver(false)
    setScreen('title')
    audio.stopMusic(0.3)
  }, [audio])

  return (
    <div className="h-full w-full">
      <AnimatePresence mode="wait">
        {screen === 'loading' && <LoadingScreen key="loading" progress={progress} label={loadLabel} />}

        {screen === 'title' && (
          <TitleScreen
            key="title"
            onPlay={() => startLevel(ALL_LEVELS[0].id)}
            onCrew={() => setScreen('crew')}
            onOptions={() => setScreen('options')}
          />
        )}

        {screen === 'crew' && (
          <CrewScreen
            key="crew"
            selected={crew}
            onSelect={(c: CrewId) => {
              setCrew(c)
              audio.playSfx('menu-move')
            }}
            onStart={() => startLevel(ALL_LEVELS[0].id)}
            onBack={() => setScreen('title')}
          />
        )}

        {screen === 'options' && <OptionsScreen key="options" onBack={() => setScreen('title')} />}
      </AnimatePresence>

      {screen === 'play' && (
        <div className="relative h-full w-full">
          <GameView
            key={`${levelId}:${crew}:${runKey}`}
            level={level}
            crew={crew}
            audio={audio}
            paused={paused || !!result || gameOver}
            onPause={() => setPaused(true)}
            onLevelEnd={onLevelEnd}
            onGameOver={() => setGameOver(true)}
          />
          <AnimatePresence>
            {paused && !result && !gameOver && (
              <PauseScreen
                key="pause"
                onResume={() => setPaused(false)}
                onRestart={() => startLevel(levelId)}
                onQuit={quitToMenu}
              />
            )}
            {result && (
              <ResultScreen
                key="result"
                result={result}
                hasNext={!!nextLevelId(levelId)}
                onRetry={() => startLevel(levelId)}
                onNext={() => startLevel(nextLevelId(levelId) ?? levelId)}
              />
            )}
            {gameOver && (
              <GameOverScreen key="over" onRetry={() => startLevel(levelId)} onMenu={quitToMenu} />
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
