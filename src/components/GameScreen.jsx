import { useMemo } from 'react'
import { GameManager } from '../game/GameManager.js'
import { GameProvider } from '../game/react/GameProvider.jsx'
import Tableau from './Tableau/Tableau.jsx'
import UIPanel from './UIPanel/UIPanel.jsx'
import MenuOverlay from './Menu/MenuOverlay.jsx'
import AudioController from './AudioController.jsx'
import './GameScreen.css'

/**
 * The in-game view: the tableau on the left, the civilization panel on the
 * right, a floating menu button, and the (silent) audio controller.
 *
 * The `seed` (from App) drives the randomized terrain regions (Old World / New
 * World mixes, island & asteroid scatter, etc.) so each run's map differs but is
 * stable within the run.
 */
export default function GameScreen({ seed, audio, onExit }) {
  const manager = useMemo(() => new GameManager(seed), [seed])

  return (
    <GameProvider manager={manager}>
      <div className="game-screen">
        <div className="tableau-window">
          <Tableau />
          <MenuOverlay onExit={onExit} />
        </div>
        <UIPanel />
        <AudioController audio={audio} />
      </div>
    </GameProvider>
  )
}
