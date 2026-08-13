import { useEffect, useState } from 'react'
import LoadingScreen from './screens/LoadingScreen.jsx'
import TitleScreen from './screens/TitleScreen.jsx'
import GameScreen from './components/GameScreen.jsx'
import { AudioManager } from './game/audio/AudioManager.js'
import { TITLE_TRACK } from './game/audio/tracks.js'
import './App.css'

const FADE_MS = 260 // keep in sync with .screen-fade transition in App.css

/** Top-level screen router: loading → title → game. */
export default function App() {
  const [screen, setScreen] = useState('loading')
  const [seed, setSeed] = useState(1)
  const [fading, setFading] = useState(false)
  const [audio] = useState(() => new AudioManager(0.5))

  useEffect(() => {
    if (screen !== 'game') audio.playTrack(TITLE_TRACK)
  }, [screen, audio])

  useEffect(() => {
    if (localStorage.getItem('autociv.mute') === '1') return
    const kick = () => audio.enable()
    window.addEventListener('pointerdown', kick)
    window.addEventListener('keydown', kick)
    return () => { window.removeEventListener('pointerdown', kick); window.removeEventListener('keydown', kick) }
  }, [audio])

  const transitionTo = (next, before) => {
    if (fading) return
    setFading(true)
    setTimeout(() => { before?.(); setScreen(next); setFading(false) }, FADE_MS)
  }

  return (
    <div className="app-shell">
      {screen === 'loading' && <LoadingScreen onStart={() => transitionTo('title')} />}
      {screen === 'title' && (
        <TitleScreen onNewGame={() => transitionTo('game', () => setSeed((Math.random() * 0x7fffffff) >>> 0))} />
      )}
      {screen === 'game' && (
        <GameScreen seed={seed} audio={audio} onExit={() => transitionTo('title')} />
      )}
      <div className={`screen-fade${fading ? ' active' : ''}`} />
    </div>
  )
}
