import { useEffect, useMemo, useState } from 'react'
import { GameManager } from '../game/GameManager.js'
import { GameProvider } from '../game/react/GameProvider.jsx'
import HexMap from './HexMap/HexMap.jsx'
import MenuOverlay from './Menu/MenuOverlay.jsx'
import StageBanner from './Hud/StageBanner.jsx'
import OutputReadout from './Hud/OutputReadout.jsx'
import ProgressTree from './Progress/ProgressTree.jsx'
import './GameScreen.css'

/**
 * The in-game view (v3, map-first): the hex map fills the window, with a slim
 * HUD strip along the bottom and a compact output readout in the corner. The
 * progress web opens as a full overlay.
 *
 * No combat or roster yet — v3 is being rebuilt from the map outward. The tick
 * that drives the threshold bars is temporary scaffolding (see GameManager).
 */
export default function GameScreen({ seed, civ, difficulty, onExit }) {
  const manager = useMemo(() => new GameManager(seed, { civ, difficulty }), [seed, civ, difficulty])
  const [treeOpen, setTreeOpen] = useState(false)

  useEffect(() => {
    manager.start()
    return () => manager.stop()
  }, [manager])

  return (
    <GameProvider manager={manager}>
      <div className="game-screen">
        <div className="map-window">
          <HexMap />
          <OutputReadout />
          <div className="top-hud">
            <StageBanner />
            <MenuOverlay onExit={onExit} />
            <button className="hud-btn" onClick={() => setTreeOpen(true)}>
              <img src="/sprites/icons/progress.png" alt="" />
              Progress
            </button>
          </div>
          {treeOpen && <ProgressTree onClose={() => setTreeOpen(false)} />}
        </div>
      </div>
    </GameProvider>
  )
}
