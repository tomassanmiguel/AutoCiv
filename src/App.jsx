import { useState } from 'react'
import TitleScreen from './screens/TitleScreen.jsx'
import GameScreen from './components/GameScreen.jsx'
import './App.css'

/**
 * Top-level screen router.
 *
 * The game is organized as a set of discrete "screens" (title, game, summary,
 * etc.). We keep the active screen in local state rather than using URL routing,
 * because AutoCiv is a single-page app-like game, not a navigable website.
 * As new screens are added, register them in the switch below.
 */
export default function App() {
  const [screen, setScreen] = useState('title')
  // Seed for the run's map. Generated here in an event handler (not during a
  // component render) so the map is stable for the whole run and only changes
  // when a new game is started.
  const [seed, setSeed] = useState(0)

  const startGame = () => {
    setSeed((Math.random() * 0x100000000) >>> 0)
    setScreen('game')
  }

  return (
    <div className="app-shell">
      {screen === 'title' && (
        <TitleScreen onNewGame={startGame} />
      )}

      {screen === 'game' && (
        <GameScreen seed={seed} onExit={() => setScreen('title')} />
      )}
    </div>
  )
}
