import { useEffect, useState } from 'react'
import LoadingScreen from './screens/LoadingScreen.jsx'
import TitleScreen from './screens/TitleScreen.jsx'
import GameScreen from './components/GameScreen.jsx'
import { AudioManager } from './game/audio/AudioManager.js'
import { TITLE_TRACK } from './game/audio/tracks.js'
import './App.css'

const FADE_MS = 260 // keep in sync with .screen-fade transition in App.css

/**
 * Top-level screen router (loading → title → game). No civ-select screen in v4
 * (may return later). Screens are discrete states, not routes — this is a game.
 */
export default function App() {
  const [screen, setScreen] = useState('loading')
  const [seed, setSeed] = useState(0)
  const [fading, setFading] = useState(false)

  // One AudioManager for the whole session, shared across screens so the
  // title↔era hand-off cross-fades on one system.
  const [audio] = useState(() => new AudioManager(0.5))

  useEffect(() => {
    if (screen !== 'game') audio.playTrack(TITLE_TRACK)
  }, [screen, audio])

  // Unlock audio on the first user gesture (autoplay policy); honors the mute flag.
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

  const transitionTo = (next, before) => {
    if (fading) return
    setFading(true)
    setTimeout(() => { before?.(); setScreen(next); setFading(false) }, FADE_MS)
  }

  const beginGame = () => transitionTo('game', () => setSeed((Math.random() * 0x100000000) >>> 0))
  const exitToTitle = () => transitionTo('title')
  const beginFromTitle = () => {
    if (localStorage.getItem('autociv.mute') !== '1') audio.enable()
    transitionTo('title')
  }

  return (
    <div className="app-shell">
      {screen === 'loading' && <LoadingScreen onStart={beginFromTitle} />}
      {screen === 'title' && <TitleScreen onNewGame={beginGame} />}
      {screen === 'game' && <GameScreen seed={seed} audio={audio} onExit={exitToTitle} />}
      <div className={`screen-fade${fading ? ' active' : ''}`} />
    </div>
  )
}
