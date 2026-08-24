import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import type { CrewId, LevelResult } from './types'
import { loadArt } from './art'
import { AudioEngine } from './audio/AudioEngine'
import { ALL_LEVELS, WORLDS, levelById, nextLevelId } from './game/level'
import { useProgress } from './store/progressStore'
import { useSettings } from './store/settingsStore'
import { GameView } from './ui/GameView'
import { TitleScreen } from './ui/screens/TitleScreen'
import { LoadingScreen } from './ui/screens/LoadingScreen'
import { CrewScreen } from './ui/screens/CrewScreen'
import { PauseScreen } from './ui/screens/PauseScreen'
import { ResultScreen } from './ui/screens/ResultScreen'
import { GameOverScreen } from './ui/screens/GameOverScreen'
import { MapScreen, levelLocked } from './ui/screens/MapScreen'
import { OptionsScreen } from './ui/screens/OptionsScreen'
import { CreditsScreen } from './ui/screens/CreditsScreen'
import { EndingScreen } from './ui/screens/EndingScreen'
import { LevelIntroScreen } from './ui/screens/LevelIntroScreen'
import { ChallengeScreen } from './ui/screens/ChallengeScreen'
import { ChallengePanel } from './ui/ChallengePanel'
import { consumeChallengeFromLocation } from './game/challengeLink'
import { decodeChallenge } from './game/ghostCode'

type Screen =
  | 'loading' | 'title' | 'crew' | 'map' | 'options' | 'credits' | 'ending' | 'intro' | 'play'
  | 'challenge'

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
  /**
   * Where leaving the credits should land. Opened from Options it is a detour,
   * so back means Options; reached from the ending it is the last thing in the
   * game, so back means the title. Storing the origin instead sent you back to
   * the ending, which drifts into the credits on its own — a loop with no way
   * out but the pause key.
   */
  const [creditsBack, setCreditsBack] = useState<'options' | 'title'>('options')
  /**
   * A challenge that arrived in the address bar, waiting to be offered.
   *
   * Taken out of the URL once, at the first render, rather than in an effect:
   * an effect runs after React has already committed, and in development it
   * runs twice — the second pass would find the hash gone and conclude there
   * was never a challenge. `useState` with an initialiser runs once, before
   * anything is drawn, which is exactly the shape of this job.
   */
  const [invite] = useState(() => {
    const code = consumeChallengeFromLocation()
    return code ? decodeChallenge(code) : null
  })
  const [inviteLevel, setInviteLevel] = useState<string | null>(null)
  /**
   * The stage whose challenge sheet is open, or null.
   *
   * Held here rather than inside each screen that can open it, because the
   * sheet outlives the screen underneath in one case that matters: accepting a
   * challenge from the chart starts a level, and a sheet owned by the chart
   * would be unmounted mid-action.
   */
  const [sharing, setSharing] = useState<string | null>(null)

  const crew = useProgress((s) => s.crew)
  const rivals = useProgress((s) => s.rivals)
  const saveRival = useProgress((s) => s.saveRival)
  const setCrew = useProgress((s) => s.setCrew)
  const recordResult = useProgress((s) => s.record)
  const records = useProgress((s) => s.records)
  const settings = useSettings()
  const audio = useMemo(() => new AudioEngine(), [])

  useEffect(() => {
    loadArt((t, label) => {
      setProgress(t)
      setLoadLabel(label)
    }).then(() => {
      /*
        A link that carries a challenge opens on the challenge, not on the
        title. Somebody tapped a message from their brother; making them find
        the stage themselves would be asking them to do the work the link
        already did.

        It is saved here rather than on acceptance, so that "not now" leaves it
        on the chart instead of throwing it away — and so that closing the tab
        on this screen does not lose it either.
      */
      if (invite && levelById(invite.levelId)) {
        saveRival(invite.levelId, { ...invite.track, name: invite.name })
        setInviteLevel(invite.levelId)
        setScreen('challenge')
        return
      }
      setScreen('title')
    })
    // Runs once, at boot: `invite` is settled before the first render and
    // never changes, and re-running this would reload the whole art library.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Browsers only allow audio to start inside a user gesture — and on iOS a
  // gesture that looks like it should have unlocked the context often leaves it
  // suspended anyway. So this does not fire once and hope: it keeps listening
  // for as long as the app is mounted, and it re-tries whenever the app comes
  // back to the foreground, because iOS suspends the context every time the
  // PWA is backgrounded and a resume outside a gesture usually will not revive
  // it. The handlers cost nothing once the context is running: they return
  // immediately.
  useEffect(() => {
    const unlock = () => {
      if (audio.isRunning()) return
      void audio.ready().then(() => {
        audio.setMasterVolume(settings.master)
        audio.setMusicVolume(settings.music)
        audio.setSfxVolume(settings.sfx)
      })
    }

    // Coming back to the foreground, try without a gesture first — but this
    // often fails on iOS, and the listeners below are deliberately still
    // attached to catch the next tap when it does.
    const onVisible = () => {
      if (document.visibilityState === 'visible') unlock()
    }

    const events: Array<keyof WindowEventMap> = ['pointerdown', 'touchend', 'keydown', 'click']
    for (const e of events) window.addEventListener(e, unlock)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onVisible)

    return () => {
      for (const e of events) window.removeEventListener(e, unlock)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onVisible)
    }
  }, [audio, settings.master, settings.music, settings.sfx])

  const level = levelById(levelId) ?? ALL_LEVELS[0]

  const startLevel = useCallback((id: string) => {
    setLevelId(id)
    setResult(null)
    setGameOver(false)
    setPaused(false)
    setRunKey((k) => k + 1)
    // Through the card, always: it names the island you are going to, and it
    // gets out of the way on the first touch.
    setScreen('intro')
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

  const renderScreen = () => {
    switch (screen) {
      case 'loading':
        return <LoadingScreen key="loading" progress={progress} label={loadLabel} />
      case 'title':
        return (
          <TitleScreen
            key="title"
            onPlay={() => startLevel(ALL_LEVELS[0].id)}
            onCrew={() => setScreen('crew')}
            onMap={() => setScreen('map')}
            onOptions={() => setScreen('options')}
            onLamp={(lit) => audio.playSfx(lit ? 'checkpoint' : 'menu-back')}
          />
        )
      case 'crew':
        return (
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
        )
      // The chart was built and never hung on a wall: `onMap` is optional on
      // the title screen and nothing ever passed it, so the only way back to a
      // finished stage was to replay the campaign from the first one.
      case 'map':
        return (
          <MapScreen
            key="map"
            worlds={WORLDS}
            records={records}
            onSelect={startLevel}
            onChallenge={setSharing}
            onBack={() => setScreen('title')}
          />
        )
      case 'options':
        return (
          <OptionsScreen
            key="options"
            onBack={() => setScreen('title')}
            onCredits={() => {
              setCreditsBack('options')
              setScreen('credits')
            }}
          />
        )
      // Back to Options, not to the title: you came in through a door and it
      // should still be behind you when you turn round.
      case 'credits':
        return <CreditsScreen key="credits" onBack={() => setScreen(creditsBack)} />
      // Finishing the campaign is an event. Reached from the last stage's
      // poster, and it hands over to the credits on its own if left alone.
      case 'ending':
        return (
          <EndingScreen
            key="ending"
            onCredits={() => {
              setCreditsBack('title')
              setScreen('credits')
            }}
            onPort={quitToMenu}
          />
        )
      // Arrived by link. The stage is whichever one the challenge names, not
      // whatever the session happened to be pointing at.
      case 'challenge': {
        const target = inviteLevel ? levelById(inviteLevel) : null
        const rival = inviteLevel ? rivals[inviteLevel] : undefined
        if (!target || !rival) return null
        return (
          <ChallengeScreen
            key="challenge"
            rival={rival}
            levelName={target.name}
            locked={levelLocked(target.id, records, WORLDS)}
            onAccept={() => startLevel(target.id)}
            onMap={() => setScreen('map')}
            onLater={() => setScreen('title')}
          />
        )
      }
      case 'intro':
        return <LevelIntroScreen key={`intro:${levelId}:${runKey}`} level={level} onDone={() => setScreen('play')} />
      default:
        return null
    }
  }

  return (
    <div className="h-full w-full">
      {/*
        Screens mount and animate themselves in; nothing waits on an exit.
        AnimatePresence held the incoming screen back until the outgoing one
        reported its exit finished, and when that report never arrived the app
        sat on a blank frame with no error to go on. Letting it overlap instead
        left the old screen mounted at zero opacity, still swallowing clicks.
        Each screen already has its own entrance, so the fade out is the only
        thing given up, and it buys a shell that cannot dead-end.
      */}
      {renderScreen()}

      <AnimatePresence>
        {sharing && (
          <ChallengePanel
            key="share"
            levelId={sharing}
            onClose={() => setSharing(null)}
            // Loading a challenge from the sheet does not start the stage: you
            // may well be sitting on the chart looking at a different island,
            // and being thrown into a level by a paste is a surprise. The
            // panel says where it landed and the chart shows it waiting.
            onLoaded={() => undefined}
          />
        )}
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
                hasNext
                finale={!nextLevelId(levelId)}
                onRetry={() => startLevel(levelId)}
                onChallenge={() => setSharing(levelId)}
                onNext={() => {
                  const next = nextLevelId(levelId)
                  if (next) return startLevel(next)
                  // Last stage cleared: the poster's forward button is the way
                  // into the ending rather than a dead Repetir-only screen.
                  setResult(null)
                  setPaused(false)
                  setScreen('ending')
                }}
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
