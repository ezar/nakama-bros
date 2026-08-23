import { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import '../../index.css'
import type { HudSnapshot, LevelResult } from '../../types'
import { WORLDS } from '../../game/level'
import type { LevelRecord } from '../../store/progressStore'
import { TitleScreen } from '../screens/TitleScreen'
import { CrewScreen } from '../screens/CrewScreen'
import { MapScreen } from '../screens/MapScreen'
import { ResultScreen } from '../screens/ResultScreen'
import { PauseScreen } from '../screens/PauseScreen'
import { GameOverScreen } from '../screens/GameOverScreen'
import { OptionsScreen } from '../screens/OptionsScreen'
import { CreditsScreen } from '../screens/CreditsScreen'
import { LevelIntroScreen } from '../screens/LevelIntroScreen'
import { LoadingScreen } from '../screens/LoadingScreen'
import { Hud } from '../hud/Hud'
import { TouchControls } from '../controls/TouchControls'
import type { Input } from '../../engine/input'

/**
 * Visual review harness for the shell — not part of the shipped app.
 *
 * A screenshot of the running game is far too small to judge a menu, and half
 * of these screens are only reachable after a level is played. This page mounts
 * any one of them straight from `#hash`, with representative fake state, so the
 * art can be looked at properly and iterated on.
 *
 *   npx vite build --outDir dist-ui \
 *     --config <config with rollupOptions.input = src/ui/dev/preview.html>
 */

const RESULT: LevelResult = {
  levelId: 'east-blue-1',
  cleared: true,
  timeLeft: 118.4,
  berries: 47,
  score: 28_450,
  fragments: 2,
  deaths: 1,
}

const HUD: HudSnapshot = {
  crew: 'luffy',
  tier: 'gear3',
  lives: 3,
  berries: 47,
  score: 28_450,
  time: 27.4,
  bossHealth: 0.62,
  bossName: 'Arlong',
  fragments: [true, false, true],
}

const RECORDS: Record<string, LevelRecord> = {
  'east-blue-1': { cleared: true, bestScore: 31_200, bestTimeLeft: 121, fragments: 3 },
  'east-blue-2': { cleared: true, bestScore: 26_800, bestTimeLeft: 88, fragments: 2 },
  'east-blue-3': { cleared: true, bestScore: 40_100, bestTimeLeft: 64, fragments: 3 },
  'alabasta-1': { cleared: true, bestScore: 22_400, bestTimeLeft: 51, fragments: 1 },
  'alabasta-2': { cleared: false, bestScore: 9_100, bestTimeLeft: 0, fragments: 0 },
}

const noop = () => {}

function Preview() {
  const [hash, setHash] = useState(() => location.hash.replace('#', '') || 'title')
  useEffect(() => {
    const on = () => setHash(location.hash.replace('#', '') || 'title')
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  const [angle, setAngle] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setAngle((a) => a + 0.02), 16)
    return () => clearInterval(id)
  }, [])

  switch (hash) {
    case 'crew':
      return <CrewScreen selected="zoro" onSelect={noop} onStart={noop} onBack={noop} />
    case 'map':
      return <MapScreen worlds={WORLDS} records={RECORDS} onSelect={noop} onBack={noop} />
    case 'result':
      return (
        <div className="relative h-full w-full overflow-hidden bg-[linear-gradient(180deg,#2b6d8f,#123048_60%,#0b1c2c)]">
          <ResultScreen result={RESULT} hasNext onNext={noop} onRetry={noop} />
        </div>
      )
    case 'pause':
      return (
        <div className="h-full w-full bg-op-ocean">
          <PauseScreen onResume={noop} onRestart={noop} onQuit={noop} />
        </div>
      )
    case 'over':
      return (
        <div className="h-full w-full bg-op-ocean">
          <GameOverScreen onRetry={noop} onMenu={noop} />
        </div>
      )
    case 'options':
      return <OptionsScreen onBack={noop} onCredits={noop} />
    case 'credits':
      return <CreditsScreen onBack={noop} />
    // `#intro`, `#intro:alabasta-1`, … — any stage id, to look at each card.
    case hash.startsWith('intro') ? hash : '\u0000': {
      const id = hash.split(':')[1]
      const lvl = WORLDS.flatMap((w) => w.levels).find((l) => l.id === id) ?? WORLDS[0].levels[0]
      return <LevelIntroScreen level={lvl} onDone={noop} />
    }
    case 'loading':
      return <LoadingScreen progress={0.62} label="Desplegando a la Marina" />
    case 'hud':
      return (
        <div className="relative h-full w-full overflow-hidden bg-[linear-gradient(180deg,#2b6d8f,#123048_60%,#0b1c2c)]">
          <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'repeating-linear-gradient(45deg,#0000 0 18px,#ffffff22 18px 36px)' }} />
          <Hud hud={HUD} compass={() => ({ angle, dist: 900 })} />
        </div>
      )
    case 'touch':
      return (
        <div className="relative h-full w-full overflow-hidden bg-[linear-gradient(180deg,#2b6d8f,#123048_60%,#0b1c2c)]">
          <Hud hud={{ ...HUD, bossHealth: null, bossName: null, time: 184 }} compact />
          <TouchControls input={{ setVirtual: () => {} } as unknown as Input} visible />
        </div>
      )
    case 'hud-touch':
      return (
        <div className="relative h-full w-full overflow-hidden bg-[linear-gradient(180deg,#2b6d8f,#123048_60%,#0b1c2c)]">
          <Hud hud={{ ...HUD, bossHealth: null, bossName: null, time: 184 }} compact />
        </div>
      )
    default:
      return <TitleScreen onPlay={noop} onCrew={noop} onOptions={noop} onMap={noop} />
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Preview />)
