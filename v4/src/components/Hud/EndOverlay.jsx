import { useGame } from '../../game/react/GameProvider.jsx'
import { FLAVOR_META } from '../../game/data/progress.js'
import './EndOverlay.css'

/** Win (an ascendancy completed) or loss (palace razed). */
export default function EndOverlay({ onExit }) {
  const game = useGame()
  if (!game.won && !game.defeated) return null
  const win = game.won
  // The ascendancy that won it: whichever complete lane reads best.
  const ascended = Object.keys(game.branchEra).find((f) => game.branchEra[f] >= 6)
  const meta = ascended ? FLAVOR_META[ascended] : null
  return (
    <div className="end-backdrop">
      <div className={`end-panel ${win ? 'win' : 'lose'}`}>
        <h2>{win ? 'Ascendancy' : 'Defeat'}</h2>
        <p>{win
          ? `Your civilization achieves the ${meta ? meta.name : ''} ascendancy and endures forever.`
          : `The palace was razed on turn ${game.turn}.`}</p>
        <div className="end-stats">Turn {game.turn} · {game.cityCount()} cities</div>
        <button className="end-exit" onClick={onExit}>Return to Title</button>
      </div>
    </div>
  )
}
