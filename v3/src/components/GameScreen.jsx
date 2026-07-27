import { useEffect, useMemo, useState } from 'react'
import { GameManager } from '../game/GameManager.js'
import { GameProvider } from '../game/react/GameProvider.jsx'
import HexMap from './HexMap/HexMap.jsx'
import MenuOverlay from './Menu/MenuOverlay.jsx'
import SpeedControl from './Hud/SpeedControl.jsx'
import OutputReadout from './Hud/OutputReadout.jsx'
import ProgressTree from './Progress/ProgressTree.jsx'
import CombatPanel from './Combat/CombatPanel.jsx'
import ProgressOffer from './Progress/ProgressOffer.jsx'
import ExpansionPrompt from './Expansion/ExpansionPrompt.jsx'
import PlacementPrompt from './Placement/PlacementPrompt.jsx'
import DefeatOverlay from './Hud/DefeatOverlay.jsx'
import './GameScreen.css'

/**
 * The in-game view (v3, map-first): the hex map fills the window, with a slim
 * HUD strip along the bottom and a compact output readout in the corner. The
 * progress web opens as a full overlay.
 *
 * Three prompts share the bottom-left slot and are mutually exclusive by
 * construction — only one `selection` exists at a time.
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
            <SpeedControl />
            <MenuOverlay onExit={onExit} />
            <button className="hud-btn" onClick={() => setTreeOpen(true)}>
              <img src="/sprites/icons/progress.png" alt="" />
              Progress
            </button>
          </div>
          <ExpansionPrompt />
          <PlacementPrompt />
          <CombatPanel />
          <ProgressOffer />
          <DefeatOverlay onExit={onExit} />
          {treeOpen && <ProgressTree onClose={() => setTreeOpen(false)} />}
        </div>
      </div>
    </GameProvider>
  )
}
