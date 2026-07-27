import { useEffect, useMemo } from 'react'
import { GameManager } from '../game/GameManager.js'
import { GameProvider } from '../game/react/GameProvider.jsx'
import HexMap from './HexMap/HexMap.jsx'
import UIPanel from './UIPanel/UIPanel.jsx'
import MenuOverlay from './Menu/MenuOverlay.jsx'
import StageBanner from './Hud/StageBanner.jsx'
import './GameScreen.css'

/**
 * The in-game view (v3, map-first): the hex map fills the window with a narrow
 * civilization panel on the right and a slim HUD strip along the bottom.
 *
 * No tick loop, combat, or roster yet — v3 is being rebuilt from the map outward.
 */
export default function GameScreen({ seed, civ, difficulty, onExit }) {
  const manager = useMemo(() => new GameManager(seed, { civ, difficulty }), [seed, civ, difficulty])

  useEffect(() => () => manager.stop(), [manager])

  return (
    <GameProvider manager={manager}>
      <div className="game-screen">
        <div className="map-window">
          <HexMap />
          <div className="top-hud">
            <StageBanner />
            <MenuOverlay onExit={onExit} />
          </div>
        </div>
        <UIPanel />
      </div>
    </GameProvider>
  )
}
