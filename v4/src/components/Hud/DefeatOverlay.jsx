import { useGame } from '../../game/react/GameProvider.jsx'
import './DefeatOverlay.css'

/**
 * The palace fell. v3 has no legitimacy — the palace IS the fail state, so this
 * is the whole end-of-run condition.
 */
export default function DefeatOverlay({ onExit }) {
  const game = useGame()
  if (!game.defeated) return null
  const s = game.stats

  return (
    <div className="defeat-backdrop">
      <div className="defeat-panel">
        <h2>The Palace Has Fallen</h2>
        <p className="defeat-sub">
          Your civilization ended in the {game.eraName} era, on wave {game.wave + 1}.
        </p>
        <div className="defeat-stats">
          <span><b>{s.controlled}</b> tiles held</span>
          <span><b>{s.cities}</b> cities</span>
          <span><b>{s.pop}</b> population</span>
          <span><b>{game.progress.size}</b> advancements</span>
          <span><b>{s.cleared}</b> camps cleared</span>
        </div>
        <button className="defeat-exit" onClick={onExit}>Return to Title</button>
      </div>
    </div>
  )
}
