import { useEffect, useState } from 'react'
import LoadingScreen from './screens/LoadingScreen.jsx'
import TitleScreen from './screens/TitleScreen.jsx'
import GameScreen from './components/GameScreen.jsx'
import { AudioManager } from './game/audio/AudioManager.js'
import { TITLE_TRACK } from './game/data/eras.js'
import './App.css'

const FADE_MS = 260 // keep in sync with .screen-fade transition in App.css

/**
 * Top-level screen router.
 *
 * The game is organized as discrete "screens" (title, game, …) held in local
 * state (no URL routing — this is a game, not a navigable website).
 */
export default function App() {
  // Start on the loading splash: it collects the first user gesture (so audio
  // can play) and then fades into the title screen.
  const [screen, setScreen] = useState('loading')
  const [seed, setSeed] = useState(0)
  const [fading, setFading] = useState(false)

  // One AudioManager for the whole session so the title track and the era tracks
  // cross-fade smoothly on the SAME system across screen changes.
  const [audio] = useState(() => new AudioManager(0.5))

  // On the title screen, play the title track. (In game, GameScreen's
  // AudioController drives the era track on this same manager.)
  useEffect(() => {
    if (screen === 'title') audio.playTrack(TITLE_TRACK)
  }, [screen, audio])

  // Unlock audio on the first user gesture (browser autoplay policy). Honors the
  // 'autociv.mute' escape hatch (see AudioManager / CLAUDE.md).
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

  // Fade to black, swap the screen mid-fade, then fade back in. The audio
  // cross-fade (longer) runs underneath for a smooth hand-off.
  const transitionTo = (next, before) => {
    if (fading) return
    setFading(true)
    setTimeout(() => {
      before?.()
      setScreen(next)
      setFading(false)
    }, FADE_MS)
  }

  const startGame = () =>
    transitionTo('game', () => setSeed((Math.random() * 0x100000000) >>> 0))
  const exitToTitle = () => transitionTo('title')
  // The loading click is the audio-unlocking gesture; also enable directly so
  // the title track is ready the moment we arrive there.
  const beginFromTitle = () => {
    if (localStorage.getItem('autociv.mute') !== '1') audio.enable()
    transitionTo('title')
  }

  return (
    <div className="app-shell">
      {screen === 'loading' && <LoadingScreen onStart={beginFromTitle} />}
      {screen === 'title' && <TitleScreen onNewGame={startGame} />}
      {screen === 'game' && <GameScreen seed={seed} audio={audio} onExit={exitToTitle} />}
      <div className={`screen-fade${fading ? ' active' : ''}`} />
    </div>
  )
}
