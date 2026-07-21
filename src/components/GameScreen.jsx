import { useEffect, useMemo, useState } from 'react'
import { GameManager } from '../game/GameManager.js'
import { GameProvider } from '../game/react/GameProvider.jsx'
import Tableau from './Tableau/Tableau.jsx'
import UIPanel from './UIPanel/UIPanel.jsx'
import MenuOverlay from './Menu/MenuOverlay.jsx'
import EraBanner from './Hud/EraBanner.jsx'
import TickCounter from './Hud/TickCounter.jsx'
import SpeedControl from './Hud/SpeedControl.jsx'
import TransitionOverlay from './Hud/TransitionOverlay.jsx'
import ProgressOverlay from './Progress/ProgressOverlay.jsx'
import VictoryScreen from './Victory/VictoryScreen.jsx'
import WidgetRail from './Widgets/WidgetRail.jsx'
import AudioController from './AudioController.jsx'
import './GameScreen.css'

/**
 * The in-game view: the tableau on the left, the civilization panel on the
 * right, a left-edge HUD (era banner + menu + speed), the era/battle transition
 * overlay, and the (shared) audio controller.
 *
 * Each run gets a fresh random seed so the randomized terrain regions differ.
 */
export default function GameScreen({ seed, audio, onExit }) {
  const manager = useMemo(() => new GameManager(seed), [seed])
  // Victory popup can be hidden (map stays inspectable) and re-summoned via the
  // trophy widget. Held here so both the popup and the rail share it.
  const [victoryHidden, setVictoryHidden] = useState(false)

  // Stop the tick loop when leaving the game.
  useEffect(() => () => manager.stop(), [manager])

  return (
    <GameProvider manager={manager}>
      <div className="game-screen">
        <div className="tableau-window">
          <Tableau />
          <div className="top-hud">
            <EraBanner />
            <MenuOverlay onExit={onExit} />
            <TickCounter />
            <SpeedControl />
          </div>
          <WidgetRail victoryHidden={victoryHidden} onShowVictory={() => setVictoryHidden(false)} />
          <TransitionOverlay />
          <ProgressOverlay />
          <VictoryScreen hidden={victoryHidden} onHide={() => setVictoryHidden(true)} onExit={onExit} />
        </div>
        <UIPanel />
        <AudioController audio={audio} />
      </div>
    </GameProvider>
  )
}
