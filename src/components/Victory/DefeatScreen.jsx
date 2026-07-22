import { useGame } from '../../game/react/GameProvider.jsx'
import './DefeatScreen.css'

/**
 * Defeat popup — mirror of the Victory screen, shown when legitimacy hits 0
 * (`game.data.defeated`). "Hide" tucks it away so the final battlefield stays
 * inspectable (the skull widget in the rail brings it back); "Return to Title"
 * leaves the run.
 */
export default function DefeatScreen({ hidden, onHide, onExit }) {
  const game = useGame()
  if (!game.data.defeated || hidden) return null

  return (
    <div className="defeat-backdrop">
      <div className="defeat-panel frame-box">
        <h1 className="defeat-title">Defeat</h1>
        <div className="defeat-actions">
          <button className="defeat-btn frame-box-dark" onClick={onHide}>Hide</button>
          <button className="defeat-btn frame-box-dark" onClick={onExit}>Return to Title</button>
        </div>
      </div>
    </div>
  )
}
