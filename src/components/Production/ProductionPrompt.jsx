import { useGame } from '../../game/react/GameProvider.jsx'
import { UNIT_DEFS } from '../../game/data/units.js'
import { BUILDING_DEFS } from '../../game/data/buildings.js'
import './ProductionPrompt.css'

/**
 * Small non-blocking prompt for the production (build) flow. In 'pick' the roster
 * flashes yellow (choose what to build); in 'place' the valid tiles flash yellow
 * (empty) / red (replace) on the tableau. Skip declines; Back returns to picking.
 */
export default function ProductionPrompt() {
  const game = useGame()
  const sel = game.data.selection
  if (!sel || sel.type !== 'production') return null

  if (sel.stage === 'pick') {
    return (
      <div className="prod-prompt-wrap">
        <div className="prod-prompt frame-box">
          <div className="prod-prompt-title">Production!</div>
          <div className="prod-prompt-hint">Choose a highlighted unit or building to build.</div>
          <button className="prod-btn frame-box-dark" onClick={() => game.cancelBuild()}>Skip</button>
        </div>
      </div>
    )
  }

  const def = sel.chosen.kind === 'unit' ? UNIT_DEFS[sel.chosen.key] : BUILDING_DEFS[sel.chosen.key]
  return (
    <div className="prod-prompt-wrap">
      <div className="prod-prompt frame-box">
        <div className="prod-prompt-title">Place {def.name}</div>
        <div className="prod-prompt-hint">Click a highlighted tile — yellow to build, red to replace.</div>
        <div className="prod-prompt-actions">
          <button className="prod-btn frame-box-dark" onClick={() => game.backToBuildPick()}>Back</button>
          <button className="prod-btn frame-box-dark" onClick={() => game.cancelBuild()}>Skip</button>
        </div>
      </div>
    </div>
  )
}
