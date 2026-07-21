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

  return (
    <div className="app-shell">
      {screen === 'title' && (
        <TitleScreen onNewGame={() => setScreen('game')} />
      )}

      {screen === 'game' && (
        <GameScreen onExit={() => setScreen('title')} />
      )}
    </div>
  )
}
