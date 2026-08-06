import { useEffect, useState } from 'react'
import LoadingScreen from './screens/LoadingScreen.jsx'
import TitleScreen from './screens/TitleScreen.jsx'
import PreGameScreen from './screens/PreGameScreen.jsx'
import GameScreen from './components/GameScreen.jsx'
import { DEFAULT_CIV, DEFAULT_DIFFICULTY } from './game/data/civilizations.js'
import { AudioManager } from './game/audio/AudioManager.js'
import { TITLE_TRACK } from './game/audio/tracks.js'
import './App.css'

const FADE_MS = 260 // keep in sync with .screen-fade transition in App.css

/**
 * Top-level screen router (loading → title → pregame → game).
 *
 * The game is organized as discrete "screens" held in local state — no URL
 * routing, this is a game rather than a navigable website.
 */
export default function App() {
  const [screen, setScreen] = useState('loading')
  const [seed, setSeed] = useState(0)
  const [civ, setCiv] = useState(DEFAULT_CIV)
  const [difficulty, setDifficulty] = useState(DEFAULT_DIFFICULTY)
  const [fading, setFading] = useState(false)

  // One AudioManager for the whole session. v3 has only the one track so far, so
  // it plays across EVERY screen — the game included, rather than falling silent
  // in-game. It loops and cross-fades on its own; `playTrack` is idempotent, so
  // re-requesting the same src on a screen change never restarts it. (Dedicated
  // era music can swap in here per screen once it exists.)
  const [audio] = useState(() => new AudioManager(0.5))

  useEffect(() => {
    audio.playTrack(TITLE_TRACK)
  }, [screen, audio])

  // Unlock audio on the first user gesture (browser autoplay policy). Honors the
  // 'autociv.mute' escape hatch.
  useEffect(() => {
    if (localStorage.getItem('autociv.mute') === '1') return
    const kick = () => audio.enable()
    window.addEventListener('pointerdown', kick)
    window.addEventListener('keydown', kick)
    return () => {
      window.removeEventListener('pointerdown', kick)
      window.removeEventListener('keydown', kick)
    }
  }, [audio])

  // Fade to black, swap the screen mid-fade, then fade back in.
  const transitionTo = (next, before) => {
    if (fading) return
    setFading(true)
    setTimeout(() => {
      before?.()
      setScreen(next)
      setFading(false)
    }, FADE_MS)
  }

  const openSetup = () => transitionTo('pregame')
  const beginGame = (civKey, diffKey) =>
    transitionTo('game', () => {
      setSeed((Math.random() * 0x100000000) >>> 0)
      setCiv(civKey)
      setDifficulty(diffKey)
    })
  const exitToTitle = () => transitionTo('title')
  const beginFromTitle = () => {
    if (localStorage.getItem('autociv.mute') !== '1') audio.enable()
    transitionTo('title')
  }

  return (
    <div className="app-shell">
      {screen === 'loading' && <LoadingScreen onStart={beginFromTitle} />}
      {screen === 'title' && <TitleScreen onNewGame={openSetup} />}
      {screen === 'pregame' && <PreGameScreen onStart={beginGame} onBack={exitToTitle} />}
      {screen === 'game' && (
        <GameScreen seed={seed} civ={civ} difficulty={difficulty} onExit={exitToTitle} />
      )}
      <div className={`screen-fade${fading ? ' active' : ''}`} />
    </div>
  )
}
